"""Tests for contract-date resolution.

The governing rule is *never invent a deadline*: a wrong reminder date on a legal
obligation is worse than none, because the user relies on it and misses the real
one. So most of these assert a refusal, not a parse.
"""

from datetime import date

import pytest

from app.services.date_parser import (
    AMBIGUOUS,
    CONDITIONAL,
    PAST,
    RECURRING,
    RELATIVE,
    UNPARSEABLE,
    resolve_key_date,
)

TODAY = date(2026, 6, 1)


def _resolve(raw: str):
    return resolve_key_date(raw, today=TODAY)


# ── Absolute dates we should schedule ────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2026-12-31", date(2026, 12, 31)),
        ("Payment due 2026-07-15", date(2026, 7, 15)),
        ("31 December 2026", date(2026, 12, 31)),
        ("1st January 2027", date(2027, 1, 1)),
        ("3rd of March 2027", date(2027, 3, 3)),
        ("December 31, 2026", date(2026, 12, 31)),
        ("Dec 31 2026", date(2026, 12, 31)),
        ("Sept 9, 2026", date(2026, 9, 9)),
        ("The lease ends on 30 November 2026.", date(2026, 11, 30)),
    ],
)
def test_absolute_dates_are_scheduled(raw, expected):
    result = _resolve(raw)
    assert result.schedulable is True
    assert result.due == expected
    assert result.reason is None


def test_numeric_date_is_accepted_when_day_first_is_the_only_reading():
    """25/12/2026 can only be 25 December."""
    result = _resolve("25/12/2026")
    assert result.schedulable is True
    assert result.due == date(2026, 12, 25)


def test_numeric_date_is_accepted_when_month_first_is_the_only_reading():
    result = _resolve("12/25/2026")
    assert result.schedulable is True
    assert result.due == date(2026, 12, 25)


def test_numeric_date_is_accepted_when_both_readings_agree():
    result = _resolve("07/07/2026")
    assert result.schedulable is True
    assert result.due == date(2026, 7, 7)


# ── The refusals ─────────────────────────────────────────────────────────────


def test_ambiguous_numeric_date_is_refused_not_guessed():
    """01/02/2026 is 1 Feb or 2 Jan depending on locale — picking is a bug."""
    result = _resolve("01/02/2026")
    assert result.schedulable is False
    assert result.reason == AMBIGUOUS
    assert result.due is None
    assert result.needs_user_input is True


@pytest.mark.parametrize(
    "raw",
    [
        "within 30 days of signing",
        "30 days after the commencement date",
        "14 business days before expiry",
        "no later than 7 days from the date of notice",
        "prior to the renewal date",
        "notice period of 60 days",
    ],
)
def test_relative_dates_are_flagged(raw):
    result = _resolve(raw)
    assert result.schedulable is False
    assert result.reason == RELATIVE
    assert result.needs_user_input is True


def test_relative_expression_containing_a_real_date_is_still_relative():
    """ "30 days after 1 January 2026" is not 1 January 2026."""
    result = _resolve("30 days after 1 January 2026")
    assert result.schedulable is False
    assert result.reason == RELATIVE


@pytest.mark.parametrize(
    "raw",
    [
        "the 1st of each month",
        "monthly on the 5th",
        "every quarter",
        "annually on the anniversary of signing",
        "payable per month",
    ],
)
def test_recurring_dates_are_flagged(raw):
    result = _resolve(raw)
    assert result.schedulable is False
    assert result.reason == RECURRING
    assert result.needs_user_input is True


def test_recurring_beats_absolute_when_both_appear():
    result = _resolve("every month starting 1 July 2026")
    assert result.reason == RECURRING


@pytest.mark.parametrize(
    "raw",
    [
        "upon termination",
        "on expiry of the agreement",
        "at the end of the term",
        "as soon as reasonably practicable",
        "in the event of a breach",
        "if the tenant defaults",
        "to be determined",
        "N/A",
    ],
)
def test_conditional_dates_are_flagged(raw):
    result = _resolve(raw)
    assert result.schedulable is False
    assert result.reason == CONDITIONAL
    # No date exists to supply, so this is not something the user can fix.
    assert result.needs_user_input is False


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Final payment due 31 December 2026 if the work is accepted", date(2026, 12, 31)),
        ("Deliverables due 2026-09-30 when the client signs off", date(2026, 9, 30)),
        ("If approved, renewal takes effect December 1, 2026", date(2026, 12, 1)),
    ],
)
def test_absolute_date_beats_a_bare_if_or_when(raw, expected):
    """A fixed date with a conditional aside is still a fixed date.

    Classifying these CONDITIONAL dropped them entirely: conditional isn't
    offered for user correction, so a schedulable deadline was unrecoverable.
    """
    result = _resolve(raw)
    assert result.schedulable is True
    assert result.due == expected
    assert result.reason is None


def test_bare_if_still_wins_when_no_date_is_present():
    """The weakened markers only yield to an actual date, never unconditionally."""
    result = _resolve("if the tenant defaults")
    assert result.reason == CONDITIONAL


def test_strong_conditional_marker_still_beats_an_absolute_date():
    """ "upon" and friends are unchanged — they override a date as before."""
    result = _resolve("upon termination of the agreement signed 31 December 2026")
    assert result.schedulable is False
    assert result.reason == CONDITIONAL


def test_ambiguous_numeric_date_is_not_masked_by_a_bare_if():
    """The user can fix an ambiguous date; calling it conditional would deny that."""
    result = _resolve("payment due 01/02/2026 if invoiced")
    assert result.reason == AMBIGUOUS
    assert result.needs_user_input is True


@pytest.mark.parametrize("raw", ["", "   ", "see clause 4", "the agreed date", "2026"])
def test_unparseable_input_is_refused(raw):
    result = _resolve(raw)
    assert result.schedulable is False
    assert result.reason == UNPARSEABLE


def test_impossible_calendar_date_is_refused():
    """31 February parses structurally but isn't a real day."""
    result = _resolve("31 February 2027")
    assert result.schedulable is False
    assert result.reason == UNPARSEABLE


def test_iso_with_impossible_month_is_refused():
    assert _resolve("2026-13-01").reason == UNPARSEABLE


# ── Past dates ───────────────────────────────────────────────────────────────


def test_past_date_is_not_schedulable_but_is_reported_as_past():
    result = _resolve("2026-01-15")
    assert result.schedulable is False
    assert result.reason == PAST
    # The date is still returned so the UI can say when it passed.
    assert result.due == date(2026, 1, 15)
    # Nothing the user can supply — it simply already happened.
    assert result.needs_user_input is False


def test_today_is_still_schedulable():
    """A deadline today is the most urgent case, not an expired one."""
    result = _resolve("2026-06-01")
    assert result.schedulable is True


def test_tomorrow_is_schedulable():
    assert _resolve("2026-06-02").schedulable is True


# ── Clock injection ──────────────────────────────────────────────────────────


def test_resolution_uses_the_injected_today():
    raw = "2026-06-15"
    assert resolve_key_date(raw, today=date(2026, 6, 1)).schedulable is True
    assert resolve_key_date(raw, today=date(2026, 7, 1)).reason == PAST


def test_default_today_does_not_crash():
    """Called without an explicit clock, it uses the current UTC date."""
    assert resolve_key_date("2099-01-01").schedulable is True
