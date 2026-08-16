"""Regression tests for two ways the reminder service used to lie to the user.

Both bugs were silent: a long configured lead never fired, and a lost write was
still reported as a scheduled reminder. Neither raised, so only an assertion on
the observable behaviour catches them coming back.
"""

from datetime import date, datetime, time, timedelta, timezone

import pytest
from bson import ObjectId

from app.services import reminder_service

TODAY = date(2026, 6, 1)
UNIQUE_FIELDS = ("userId", "analysisId", "description", "dueDate")


def _utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


@pytest.fixture
def sent_mail(monkeypatch):
    """Capture outbound reminder emails instead of sending them."""
    sent = []

    async def fake_send(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(reminder_service, "send_deadline_reminder_email", fake_send)
    return sent


@pytest.fixture
def reminders_db(fake_db):
    """A reminders collection with the real unique index enforced."""
    fake_db["reminders"].unique_on = [UNIQUE_FIELDS]
    return fake_db


def _seed_reminder(db, user_id, *, due: date, description="Renewal notice", sent_leads=None):
    _id = ObjectId()
    db["reminders"]._docs[str(_id)] = {
        "_id": _id,
        "userId": user_id,
        "analysisId": "a1",
        "fileName": "lease.pdf",
        "description": description,
        "sourceDate": due.isoformat(),
        "dueDate": _utc(due),
        "schedulable": True,
        "reason": None,
        "needsAttention": False,
        "sentLeads": list(sent_leads or []),
    }
    return str(_id)


# ── The query horizon must follow the user's configured leads ────────────────


async def test_a_long_configured_lead_actually_fires(reminders_db, seed_user, sent_mail):
    """A 30-day lead means an email 30 days out, not silence until day 14.

    The sweep used to load only reminders due inside the *default* 14-day
    window, so every longer lead the preferences endpoint accepts was dropped
    before `due_lead` ever saw it.
    """
    user = seed_user(email="user@example.com", username="Sam", reminderLeadDays=[30, 7])
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=30))

    summary = await reminder_service.run_sweep(today=TODAY)

    assert summary["remindersSent"] == 1
    assert len(sent_mail) == 1
    assert sent_mail[0]["reminders"][0]["daysUntil"] == 30


async def test_the_longest_allowed_lead_fires(reminders_db, seed_user, sent_mail):
    """365 is the largest lead `lead_days_for` accepts, so it must be reachable."""
    user = seed_user(email="user@example.com", reminderLeadDays=[365])
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=365))

    await reminder_service.run_sweep(today=TODAY)

    assert len(sent_mail) == 1


async def test_a_long_lead_still_sends_only_once(reminders_db, seed_user, sent_mail):
    """Widening the horizon must not re-notify every day until the deadline."""
    user = seed_user(email="user@example.com", reminderLeadDays=[30])
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=30))

    await reminder_service.run_sweep(today=TODAY)
    await reminder_service.run_sweep(today=TODAY + timedelta(days=1))

    assert len(sent_mail) == 1


async def test_deadlines_beyond_every_lead_are_left_alone(reminders_db, seed_user, sent_mail):
    """A default-lead user isn't emailed a year early just because we loaded the row."""
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=200))

    summary = await reminder_service.run_sweep(today=TODAY)

    assert sent_mail == []
    assert summary["usersNotified"] == 0


# ── A lost write is never reported as scheduled ──────────────────────────────


async def test_a_failed_insert_is_not_counted_as_scheduled(monkeypatch, reminders_db):
    """Counting before the write let a dropped reminder look like a live one."""

    async def boom(_doc):
        raise RuntimeError("mongo is down")

    monkeypatch.setattr(reminders_db["reminders"], "insert_one", boom)

    counts = await reminder_service.generate_for_analysis(
        "a1",
        "u1",
        "lease.pdf",
        [{"date": "2026-12-31", "description": "Lease ends"}],
        today=TODAY,
    )

    assert counts["scheduled"] == 0
    assert counts["failed"] == 1
    assert await reminder_service.list_for_analysis("a1", "u1") == []


async def test_a_failed_insert_does_not_stop_the_rest(monkeypatch, reminders_db):
    """One bad write must not cost the user the other deadlines in the contract."""
    real_insert = reminders_db["reminders"].insert_one
    calls = {"n": 0}

    async def flaky(doc):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("mongo blipped")
        return await real_insert(doc)

    monkeypatch.setattr(reminders_db["reminders"], "insert_one", flaky)

    counts = await reminder_service.generate_for_analysis(
        "a1",
        "u1",
        "lease.pdf",
        [
            {"date": "2026-12-31", "description": "Lease ends"},
            {"date": "2026-11-30", "description": "Notice to renew"},
        ],
        today=TODAY,
    )

    assert counts["scheduled"] == 1
    assert counts["failed"] == 1
    assert len(await reminder_service.list_for_analysis("a1", "u1")) == 1


async def test_a_failed_reminder_is_never_swept(monkeypatch, reminders_db, seed_user, sent_mail):
    """The count is only a symptom; the real damage is the email that never comes."""
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])

    async def boom(_doc):
        raise RuntimeError("mongo is down")

    monkeypatch.setattr(reminders_db["reminders"], "insert_one", boom)
    counts = await reminder_service.generate_for_analysis(
        "a1",
        uid,
        "lease.pdf",
        [{"date": (TODAY + timedelta(days=7)).isoformat(), "description": "Lease ends"}],
        today=TODAY,
    )
    assert counts["failed"] == 1

    await reminder_service.run_sweep(today=TODAY)
    assert sent_mail == []


async def test_counts_survive_a_re_run(reminders_db):
    """Re-running an analysis reports the same totals, not zeros.

    The duplicate-key path means "already stored", so it still counts —
    otherwise a re-analysis would tell the user nothing was scheduled.
    """
    key_dates = [
        {"date": "2026-12-31", "description": "Lease ends"},
        {"date": "upon termination", "description": "Return keys"},
    ]
    first = await reminder_service.generate_for_analysis(
        "a1", "u1", "l.pdf", key_dates, today=TODAY
    )
    second = await reminder_service.generate_for_analysis(
        "a1", "u1", "l.pdf", key_dates, today=TODAY
    )

    assert first == second
    assert first["scheduled"] == 1
    assert first["failed"] == 0
    assert len(await reminder_service.list_for_analysis("a1", "u1")) == 2
