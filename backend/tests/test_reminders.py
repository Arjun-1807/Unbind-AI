"""Tests for deadline reminders: generation, the sweep, and the endpoints.

The sweep is driven by an external scheduler, so the properties that matter most
are the ones about *time going wrong*: a run that fires twice, a run that doesn't
fire for a week, a run that fires after the deadline passed. Those get the most
attention here, because in production they will all happen.
"""

from datetime import date, datetime, time, timedelta, timezone

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app import auth
from app.routes import reminder_routes
from app.services import reminder_service
from app.services.reminder_service import due_lead, lead_days_for, reminders_enabled

TODAY = date(2026, 6, 1)
UNIQUE_FIELDS = ("userId", "analysisId", "description", "dueDate")


class _Req:
    def __init__(self, cookies=None, headers=None):
        self.cookies = cookies or {}
        self.headers = headers or {}


def _authed(settings, user_id: str) -> _Req:
    return _Req(cookies={settings.COOKIE_NAME: auth.create_access_token(user_id)})


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


# ── Lead-time arithmetic: the core of the sweep ──────────────────────────────


@pytest.mark.parametrize(
    "days_until,expected",
    [
        (20, None),  # too far out, no lead has arrived
        (14, 14),  # exactly on the 14-day mark
        (10, 14),  # past 14 but not yet 7 → still the 14-day notice
        (7, 14),  # both arrived, unsent → fire the larger once
        (1, 14),
        (0, 14),  # due today
    ],
)
def test_due_lead_fires_the_largest_arrived_lead(days_until, expected):
    assert due_lead(days_until, [14, 7, 1], []) == expected


def test_due_lead_skips_leads_already_sent():
    # 14 already went out; at 7 days the next notice is the 7-day one.
    assert due_lead(7, [14, 7, 1], [14]) == 7
    assert due_lead(1, [14, 7, 1], [14, 7]) == 1


def test_due_lead_returns_none_when_everything_arrived_has_been_sent():
    assert due_lead(5, [14, 7, 1], [14, 7]) is None


def test_due_lead_tolerates_an_outage():
    """If the scheduler was down through both marks, send once — not twice."""
    assert due_lead(3, [14, 7, 1], []) == 14


def test_due_lead_ignores_past_deadlines():
    """A deadline that already passed can't be reminded about."""
    assert due_lead(-1, [14, 7, 1], []) is None


# ── Preferences ──────────────────────────────────────────────────────────────


def test_reminders_default_to_on():
    """The user uploaded a contract to be helped with its deadlines."""
    assert reminders_enabled({"email": "a@b.com"}) is True


def test_explicit_opt_out_is_respected():
    assert reminders_enabled({"reminderOptIn": False}) is False


def test_reminders_disabled_for_a_missing_user():
    assert reminders_enabled(None) is False


def test_lead_days_default_when_unset():
    assert lead_days_for({}) == [14, 7, 1]


def test_lead_days_are_sorted_descending_and_deduped():
    assert lead_days_for({"reminderLeadDays": [7, 30, 7, 1]}) == [30, 7, 1]


@pytest.mark.parametrize(
    "stored",
    ["not-a-list", [], [-5], [9999], ["7"], None],
)
def test_bad_lead_days_fall_back_to_the_default(stored):
    """Garbage in the DB must not silently disable reminders."""
    assert lead_days_for({"reminderLeadDays": stored}) == [14, 7, 1]


# ── Generation ───────────────────────────────────────────────────────────────


async def test_generation_schedules_absolute_dates_and_flags_the_rest(reminders_db):
    counts = await reminder_service.generate_for_analysis(
        "a1",
        "u1",
        "lease.pdf",
        [
            {"date": "2026-12-31", "description": "Lease ends"},
            {"date": "within 30 days of signing", "description": "Notice to renew"},
            {"date": "upon termination", "description": "Return keys"},
        ],
        today=TODAY,
    )

    assert counts == {"scheduled": 1, "needsAttention": 1, "skipped": 1, "failed": 0}
    stored = await reminder_service.list_for_analysis("a1", "u1")
    assert len(stored) == 3

    scheduled = [r for r in stored if r["schedulable"]]
    assert len(scheduled) == 1
    assert scheduled[0]["dueDate"] == "2026-12-31"


async def test_generation_is_idempotent(reminders_db):
    """Re-analysing the same document must not create duplicate reminders."""
    key_dates = [{"date": "2026-12-31", "description": "Lease ends"}]
    await reminder_service.generate_for_analysis("a1", "u1", "l.pdf", key_dates, today=TODAY)
    await reminder_service.generate_for_analysis("a1", "u1", "l.pdf", key_dates, today=TODAY)

    assert len(await reminder_service.list_for_analysis("a1", "u1")) == 1


async def test_generation_keeps_the_original_wording(reminders_db):
    """The UI shows what the contract actually said, not our interpretation."""
    await reminder_service.generate_for_analysis(
        "a1",
        "u1",
        "l.pdf",
        [{"date": "within 30 days of signing", "description": "Notice"}],
        today=TODAY,
    )
    stored = await reminder_service.list_for_analysis("a1", "u1")
    assert stored[0]["sourceDate"] == "within 30 days of signing"
    assert stored[0]["reason"] == "relative"


async def test_generation_handles_no_key_dates(reminders_db):
    counts = await reminder_service.generate_for_analysis("a1", "u1", "l.pdf", [], today=TODAY)
    assert counts == {"scheduled": 0, "needsAttention": 0, "skipped": 0, "failed": 0}


async def test_generation_caps_runaway_key_dates(reminders_db):
    many = [{"date": f"2026-12-{d:02d}", "description": f"Date {d}"} for d in range(1, 32)]
    many += [{"date": "2027-01-01", "description": f"Extra {i}"} for i in range(100)]
    await reminder_service.generate_for_analysis("a1", "u1", "l.pdf", many, today=TODAY)
    stored = await reminder_service.list_for_analysis("a1", "u1")
    assert len(stored) <= reminder_service.MAX_REMINDERS_PER_ANALYSIS


async def test_generate_safely_swallows_failures(monkeypatch, reminders_db):
    """Reminder generation must never fail the analysis the user waited for."""

    async def boom(*args, **kwargs):
        raise RuntimeError("db exploded")

    monkeypatch.setattr(reminder_service, "generate_for_analysis", boom)
    await reminder_service.generate_safely("a1", "u1", "l.pdf", [])  # must not raise


async def test_reminders_are_scoped_to_their_owner(reminders_db):
    await reminder_service.generate_for_analysis(
        "a1", "owner", "l.pdf", [{"date": "2026-12-31", "description": "Ends"}], today=TODAY
    )
    assert await reminder_service.list_for_analysis("a1", "intruder") == []


async def test_delete_removes_an_analysis_reminders(reminders_db):
    await reminder_service.generate_for_analysis(
        "a1", "u1", "l.pdf", [{"date": "2026-12-31", "description": "Ends"}], today=TODAY
    )
    await reminder_service.delete_for_analysis("a1", "u1")
    assert await reminder_service.list_for_analysis("a1", "u1") == []


# ── The sweep ────────────────────────────────────────────────────────────────


async def test_sweep_emails_a_due_deadline(reminders_db, seed_user, sent_mail):
    user = seed_user(email="user@example.com", username="Sam")
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=7))

    summary = await reminder_service.run_sweep(today=TODAY)

    assert summary["usersNotified"] == 1
    assert summary["remindersSent"] == 1
    assert len(sent_mail) == 1
    assert sent_mail[0]["to_email"] == "user@example.com"
    assert sent_mail[0]["reminders"][0]["daysUntil"] == 7
    assert "unsubscribe" in sent_mail[0]["unsubscribe_url"]


async def test_sweep_sends_one_digest_for_several_deadlines(reminders_db, seed_user, sent_mail):
    """Three deadlines in one week is one email, not three."""
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    for days, desc in ((3, "A"), (5, "B"), (7, "C")):
        _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=days), description=desc)

    await reminder_service.run_sweep(today=TODAY)

    assert len(sent_mail) == 1
    assert len(sent_mail[0]["reminders"]) == 3
    # Soonest first, so the email leads with the most urgent.
    assert [r["description"] for r in sent_mail[0]["reminders"]] == ["A", "B", "C"]


async def test_sweep_does_not_resend_on_a_second_run(reminders_db, seed_user, sent_mail):
    """The scheduler can fire twice; the user must not get two emails."""
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=7))

    await reminder_service.run_sweep(today=TODAY)
    await reminder_service.run_sweep(today=TODAY)

    assert len(sent_mail) == 1


async def test_sweep_sends_again_at_the_next_lead(reminders_db, seed_user, sent_mail):
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=14))

    await reminder_service.run_sweep(today=TODAY)  # 14-day notice
    await reminder_service.run_sweep(today=TODAY + timedelta(days=7))  # 7-day notice
    await reminder_service.run_sweep(today=TODAY + timedelta(days=13))  # 1-day notice

    assert len(sent_mail) == 3
    assert [m["reminders"][0]["daysUntil"] for m in sent_mail] == [14, 7, 1]


async def test_sweep_after_an_outage_collapses_missed_leads_into_one_email(
    reminders_db, seed_user, sent_mail
):
    """Down through the 14- and 7-day marks: one catch-up email, not two.

    The 1-day lead hasn't arrived yet at this point, so it still fires normally
    the following day — that's ordinary operation, not a backlog burst.
    """
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=14))

    # First run happens when only 2 days remain: the 14- and 7-day marks both
    # passed unsent, and collapse into a single email.
    await reminder_service.run_sweep(today=TODAY + timedelta(days=12))
    assert len(sent_mail) == 1
    assert sent_mail[0]["reminders"][0]["daysUntil"] == 2

    # Running again the same day adds nothing.
    await reminder_service.run_sweep(today=TODAY + timedelta(days=12))
    assert len(sent_mail) == 1

    # The 1-day notice is a genuinely new lead, so it does go out.
    await reminder_service.run_sweep(today=TODAY + timedelta(days=13))
    assert len(sent_mail) == 2
    assert sent_mail[1]["reminders"][0]["daysUntil"] == 1

    # After which everything is exhausted.
    await reminder_service.run_sweep(today=TODAY + timedelta(days=14))
    assert len(sent_mail) == 2


async def test_sweep_never_sends_two_emails_on_the_same_day(reminders_db, seed_user, sent_mail):
    """No matter how many leads arrived at once, a day is at most one email."""
    user = seed_user(email="user@example.com", reminderLeadDays=[30, 21, 14, 7, 3, 1])
    _seed_reminder(reminders_db, str(user["_id"]), due=TODAY + timedelta(days=2))

    await reminder_service.run_sweep(today=TODAY)
    await reminder_service.run_sweep(today=TODAY)

    assert len(sent_mail) == 1


async def test_sweep_ignores_past_deadlines(reminders_db, seed_user, sent_mail):
    user = seed_user(email="user@example.com")
    _seed_reminder(reminders_db, str(user["_id"]), due=TODAY - timedelta(days=1))
    summary = await reminder_service.run_sweep(today=TODAY)
    assert summary["remindersSent"] == 0
    assert sent_mail == []


async def test_sweep_ignores_deadlines_beyond_the_longest_lead(reminders_db, seed_user, sent_mail):
    user = seed_user(email="user@example.com")
    _seed_reminder(reminders_db, str(user["_id"]), due=TODAY + timedelta(days=90))
    await reminder_service.run_sweep(today=TODAY)
    assert sent_mail == []


async def test_sweep_skips_opted_out_users(reminders_db, seed_user, sent_mail):
    user = seed_user(email="user@example.com", reminderOptIn=False)
    _seed_reminder(reminders_db, str(user["_id"]), due=TODAY + timedelta(days=7))

    summary = await reminder_service.run_sweep(today=TODAY)

    assert sent_mail == []
    assert summary["usersNotified"] == 0


async def test_sweep_skips_users_without_an_email(reminders_db, seed_user, sent_mail):
    user = seed_user(username="No Email")
    reminders_db.users._docs[str(user["_id"])].pop("email", None)
    _seed_reminder(reminders_db, str(user["_id"]), due=TODAY + timedelta(days=7))

    await reminder_service.run_sweep(today=TODAY)
    assert sent_mail == []


async def test_sweep_honours_custom_lead_days(reminders_db, seed_user, sent_mail):
    user = seed_user(email="user@example.com", reminderLeadDays=[3])
    _seed_reminder(reminders_db, str(user["_id"]), due=TODAY + timedelta(days=7))

    # 7 days out, with only a 3-day lead configured → nothing yet.
    await reminder_service.run_sweep(today=TODAY)
    assert sent_mail == []

    await reminder_service.run_sweep(today=TODAY + timedelta(days=4))
    assert len(sent_mail) == 1


async def test_sweep_dry_run_sends_nothing_and_marks_nothing(reminders_db, seed_user, sent_mail):
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=7))

    summary = await reminder_service.run_sweep(today=TODAY, dry_run=True)

    assert summary["dryRun"] is True
    assert summary["remindersSent"] == 1  # reported…
    assert sent_mail == []  # …but not sent
    # And a real run afterwards still delivers it.
    await reminder_service.run_sweep(today=TODAY)
    assert len(sent_mail) == 1


async def test_sweep_retries_a_user_whose_email_failed(reminders_db, seed_user, monkeypatch):
    """A send failure must not mark the reminder as sent."""
    user = seed_user(email="user@example.com")
    _seed_reminder(reminders_db, str(user["_id"]), due=TODAY + timedelta(days=7))

    attempts = {"count": 0}

    async def flaky(**kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("smtp down")

    monkeypatch.setattr(reminder_service, "send_deadline_reminder_email", flaky)

    first = await reminder_service.run_sweep(today=TODAY)
    assert first["failures"] == 1
    assert first["usersNotified"] == 0

    second = await reminder_service.run_sweep(today=TODAY)
    assert second["usersNotified"] == 1
    assert attempts["count"] == 2


async def test_sweep_separates_users(reminders_db, seed_user, sent_mail):
    """Each user gets only their own deadlines."""
    a = seed_user(email="a@example.com")
    b = seed_user(email="b@example.com")
    _seed_reminder(reminders_db, str(a["_id"]), due=TODAY + timedelta(days=7), description="A's")
    _seed_reminder(reminders_db, str(b["_id"]), due=TODAY + timedelta(days=7), description="B's")

    await reminder_service.run_sweep(today=TODAY)

    assert len(sent_mail) == 2
    by_addr = {m["to_email"]: m["reminders"] for m in sent_mail}
    assert [r["description"] for r in by_addr["a@example.com"]] == ["A's"]
    assert [r["description"] for r in by_addr["b@example.com"]] == ["B's"]


async def test_sweep_with_nothing_due(reminders_db, sent_mail):
    summary = await reminder_service.run_sweep(today=TODAY)
    assert summary["usersNotified"] == 0
    assert sent_mail == []


# ── User-supplied dates ──────────────────────────────────────────────────────


async def test_setting_a_due_date_makes_a_flagged_item_schedulable(reminders_db, seed_user):
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    await reminder_service.generate_for_analysis(
        "a1", uid, "l.pdf", [{"date": "within 30 days", "description": "Notice"}], today=TODAY
    )
    reminder = (await reminder_service.list_for_analysis("a1", uid))[0]
    assert reminder["schedulable"] is False

    assert await reminder_service.set_due_date(reminder["id"], uid, date(2026, 8, 1)) is True

    updated = (await reminder_service.list_for_analysis("a1", uid))[0]
    assert updated["schedulable"] is True
    assert updated["dueDate"] == "2026-08-01"
    assert updated["needsAttention"] is False


async def test_a_user_supplied_date_then_gets_emailed(reminders_db, seed_user, sent_mail):
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    await reminder_service.generate_for_analysis(
        "a1", uid, "l.pdf", [{"date": "upon renewal", "description": "Renew"}], today=TODAY
    )
    reminder = (await reminder_service.list_for_analysis("a1", uid))[0]
    await reminder_service.set_due_date(reminder["id"], uid, TODAY + timedelta(days=7))

    await reminder_service.run_sweep(today=TODAY)
    assert len(sent_mail) == 1


async def test_cannot_set_a_due_date_on_someone_elses_reminder(reminders_db, seed_user):
    owner = seed_user(email="owner@example.com")
    await reminder_service.generate_for_analysis(
        "a1",
        str(owner["_id"]),
        "l.pdf",
        [{"date": "within 30 days", "description": "Notice"}],
        today=TODAY,
    )
    reminder = (await reminder_service.list_for_analysis("a1", str(owner["_id"])))[0]

    assert (
        await reminder_service.set_due_date(reminder["id"], "intruder", date(2026, 8, 1)) is False
    )


async def test_changing_the_date_resets_sent_history(reminders_db, seed_user, sent_mail):
    """A new deadline is a new deadline — old sends shouldn't suppress it."""
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    rid = _seed_reminder(reminders_db, uid, due=TODAY + timedelta(days=7), sent_leads=[14, 7, 1])

    await reminder_service.run_sweep(today=TODAY)
    assert sent_mail == []  # all leads already sent

    await reminder_service.set_due_date(rid, uid, TODAY + timedelta(days=10))
    await reminder_service.run_sweep(today=TODAY)
    assert len(sent_mail) == 1


# ── Unsubscribe tokens ───────────────────────────────────────────────────────


def test_unsubscribe_token_round_trips():
    token = reminder_service.build_unsubscribe_token("user-123")
    assert reminder_service.read_unsubscribe_token(token) == "user-123"


def test_a_session_token_is_not_accepted_as_an_unsubscribe_token():
    """The purpose claim stops one token type being replayed as the other."""
    session = auth.create_access_token("user-123")
    assert reminder_service.read_unsubscribe_token(session) is None


def test_garbage_unsubscribe_token_is_rejected():
    assert reminder_service.read_unsubscribe_token("not-a-jwt") is None


def test_unsubscribe_token_signed_with_another_secret_is_rejected(monkeypatch):
    from jose import jwt

    forged = jwt.encode(
        {"userId": "user-123", "purpose": "unsubscribe"}, "wrong-secret", algorithm="HS256"
    )
    assert reminder_service.read_unsubscribe_token(forged) is None


# ── Routes ───────────────────────────────────────────────────────────────────


async def test_sweep_endpoint_requires_the_secret(override_settings, monkeypatch):
    monkeypatch.setattr(override_settings, "REMINDER_SWEEP_SECRET", "s3cret")

    with pytest.raises(HTTPException) as exc:
        reminder_routes._require_sweep_secret(_Req(headers={"x-reminder-secret": "wrong"}))
    assert exc.value.status_code == 401


async def test_sweep_endpoint_accepts_the_right_secret(override_settings, monkeypatch):
    monkeypatch.setattr(override_settings, "REMINDER_SWEEP_SECRET", "s3cret")
    # Must not raise.
    reminder_routes._require_sweep_secret(_Req(headers={"x-reminder-secret": "s3cret"}))


async def test_sweep_endpoint_rejects_a_non_ascii_secret_header(override_settings, monkeypatch):
    """Starlette decodes headers as latin-1, so a raw 0xe9 byte arrives as a
    non-ASCII str. ``hmac.compare_digest`` refuses those with TypeError, which
    would turn this 401 into a 500 for any unauthenticated caller."""
    monkeypatch.setattr(override_settings, "REMINDER_SWEEP_SECRET", "s3cret")

    with pytest.raises(HTTPException) as exc:
        reminder_routes._require_sweep_secret(_Req(headers={"x-reminder-secret": "s3cret\xe9"}))
    assert exc.value.status_code == 401


async def test_sweep_endpoint_refuses_when_unconfigured(override_settings, monkeypatch):
    """An unset secret is a misconfiguration, not permission to run open."""
    monkeypatch.setattr(override_settings, "REMINDER_SWEEP_SECRET", "")

    with pytest.raises(HTTPException) as exc:
        reminder_routes._require_sweep_secret(_Req(headers={"x-reminder-secret": ""}))
    assert exc.value.status_code == 503


async def test_sweep_endpoint_rejects_a_missing_header(override_settings, monkeypatch):
    monkeypatch.setattr(override_settings, "REMINDER_SWEEP_SECRET", "s3cret")
    with pytest.raises(HTTPException) as exc:
        reminder_routes._require_sweep_secret(_Req())
    assert exc.value.status_code == 401


async def test_preferences_round_trip(override_settings, seed_user):
    from app.schemas import ReminderPreferencesRequest

    user = seed_user(email="user@example.com")
    req = _authed(override_settings, str(user["_id"]))

    initial = await reminder_routes.get_preferences(req)
    assert initial == {"enabled": True, "leadDays": [14, 7, 1]}

    updated = await reminder_routes.update_preferences(
        ReminderPreferencesRequest(enabled=False, leadDays=[3, 30]), req
    )
    assert updated == {"enabled": False, "leadDays": [30, 3]}


async def test_preferences_reject_an_empty_lead_list(override_settings, seed_user):
    from app.schemas import ReminderPreferencesRequest

    user = seed_user(email="user@example.com")
    with pytest.raises(HTTPException) as exc:
        await reminder_routes.update_preferences(
            ReminderPreferencesRequest(leadDays=[-1, 900]),
            _authed(override_settings, str(user["_id"])),
        )
    assert exc.value.status_code == 422


async def test_listing_reminders_requires_owning_the_analysis(override_settings, seed_user):
    user = seed_user(email="user@example.com")
    other_analysis = ObjectId()
    seed_user.db.analyses._docs[str(other_analysis)] = {
        "_id": other_analysis,
        "userId": str(ObjectId()),
        "fileName": "theirs.pdf",
    }

    with pytest.raises(HTTPException) as exc:
        await reminder_routes.list_reminders(
            str(other_analysis), _authed(override_settings, str(user["_id"]))
        )
    assert exc.value.status_code == 404


async def test_listing_reminders_rejects_a_malformed_id(override_settings, seed_user):
    user = seed_user(email="user@example.com")
    with pytest.raises(HTTPException) as exc:
        await reminder_routes.list_reminders(
            "not-an-objectid", _authed(override_settings, str(user["_id"]))
        )
    assert exc.value.status_code == 400


async def test_set_due_date_route_rejects_a_bad_date(override_settings, seed_user):
    from app.schemas import ReminderDueDateRequest

    user = seed_user(email="user@example.com")
    with pytest.raises(HTTPException) as exc:
        await reminder_routes.set_reminder_due_date(
            str(ObjectId()),
            ReminderDueDateRequest(dueDate="31-12-26"),
            _authed(override_settings, str(user["_id"])),
        )
    assert exc.value.status_code == 422


async def test_set_due_date_route_404s_for_an_unknown_reminder(override_settings, seed_user):
    from app.schemas import ReminderDueDateRequest

    user = seed_user(email="user@example.com")
    with pytest.raises(HTTPException) as exc:
        await reminder_routes.set_reminder_due_date(
            str(ObjectId()),
            ReminderDueDateRequest(dueDate="2026-12-31"),
            _authed(override_settings, str(user["_id"])),
        )
    assert exc.value.status_code == 404


async def test_unsubscribe_get_only_confirms_and_does_not_mutate(fake_db, seed_user):
    """The GET must stay side-effect free: mail scanners, link prefetchers and
    corporate URL rewriters all fetch it, and GET is exempt from the CSRF check.
    """
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    token = reminder_service.build_unsubscribe_token(uid)

    response = await reminder_routes.unsubscribe(token=token)

    assert response.status_code == 200
    assert "reminderOptIn" not in fake_db.users._docs[uid]
    assert reminders_enabled(fake_db.users._docs[uid]) is True
    # The page offers a form that posts the same token back.
    assert b'method="post"' in response.body
    assert token.encode() in response.body


async def test_unsubscribe_post_turns_reminders_off(fake_db, seed_user):
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])
    token = reminder_service.build_unsubscribe_token(uid)

    response = await reminder_routes.confirm_unsubscribe(token=token)

    assert response.status_code == 200
    assert fake_db.users._docs[uid]["reminderOptIn"] is False
    assert reminders_enabled(fake_db.users._docs[uid]) is False


async def test_unsubscribe_with_a_bad_token_is_a_400_page(fake_db):
    response = await reminder_routes.unsubscribe(token="garbage")
    assert response.status_code == 400
    assert b"isn&#39;t valid" in response.body or b"isn't valid" in response.body


async def test_unsubscribe_post_with_a_bad_token_is_a_400_page(fake_db, seed_user):
    """The token is re-verified on the POST — the GET having seen a good one
    proves nothing about this request."""
    user = seed_user(email="user@example.com")
    uid = str(user["_id"])

    response = await reminder_routes.confirm_unsubscribe(token="garbage")

    assert response.status_code == 400
    assert "reminderOptIn" not in fake_db.users._docs[uid]
