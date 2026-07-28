"""Resolve extracted contract dates into something schedulable.

The analysis pipeline emits ``keyDates`` as free text, because that's how
contracts actually express deadlines. Only some of those are calendar dates:

    "2026-12-31"                      → schedulable
    "31 December 2026"                → schedulable
    "within 30 days of signing"       → relative, needs an anchor date
    "the 1st of each month"           → recurring
    "upon termination"                → conditional, no date exists
    "01/02/2026"                      → ambiguous (1 Feb or 2 Jan?)

**This module never guesses.** A wrong reminder date on a legal deadline is worse
than no reminder — the user relies on it and misses the real one. So anything not
unambiguously resolvable is returned as unschedulable *with a reason*, which the
UI shows as "needs a date from you" rather than silently dropping it.

Deliberately deterministic: no LLM call. A second model pass per analysis would
cost tokens, vary between runs, and be far harder to test than the regexes below
— and it would still have to refuse the genuinely ambiguous cases.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, timezone

# Why a date couldn't be scheduled. Surfaced to the user, so each maps to a
# distinct piece of UI guidance.
RELATIVE = "relative"
RECURRING = "recurring"
CONDITIONAL = "conditional"
AMBIGUOUS = "ambiguous"
UNPARSEABLE = "unparseable"
PAST = "past"

_MONTHS = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}  # fmt: skip

_MONTH_NAMES = "|".join(sorted(_MONTHS, key=len, reverse=True))

# ── Patterns that mean "this is not a fixed calendar date" ───────────────────
# Checked BEFORE absolute extraction, because "30 days after 1 January 2026"
# contains a real date but is not itself one.

_RECURRING_MARKERS = re.compile(
    r"\b(each|every|monthly|quarterly|annually|yearly|weekly|anniversary|"
    r"per\s+(?:month|year|quarter|week)|recurring)\b",
    re.I,
)

_RELATIVE_MARKERS = re.compile(
    r"\b(?:within|prior\s+to|following|no\s+later\s+than)\b"
    r"|\b\d+\s*(?:calendar\s+|business\s+|working\s+)?"
    r"(?:day|week|month|year)s?\s+(?:after|before|of|from|prior|following)\b"
    r"|\bfrom\s+the\s+date\b|\bafter\s+the\s+date\b|\bnotice\s+period\b",
    re.I,
)

_CONDITIONAL_MARKERS = re.compile(
    r"\b(?:upon|on\s+termination|on\s+expiry|as\s+soon\s+as|at\s+the\s+end\s+of|"
    r"end\s+of\s+(?:the\s+)?term|when\s+|if\s+|in\s+the\s+event|subject\s+to|"
    r"at\s+any\s+time|as\s+required|to\s+be\s+determined|tbd|n/?a)\b",
    re.I,
)

# ── Absolute date patterns ───────────────────────────────────────────────────

_ISO = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")
_DAY_MONTH_YEAR = re.compile(
    rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({_MONTH_NAMES})\.?,?\s+(\d{{4}})\b", re.I
)
_MONTH_DAY_YEAR = re.compile(
    rf"\b({_MONTH_NAMES})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})\b", re.I
)
_NUMERIC = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b")


@dataclass(frozen=True)
class ResolvedDate:
    """Outcome of resolving one extracted date string."""

    schedulable: bool
    due: date | None = None
    reason: str | None = None

    @property
    def needs_user_input(self) -> bool:
        """True when a human could supply the missing piece.

        Distinguishes "we can't work this out, but you could tell us" from
        "no date exists here at all" — the UI prompts for the former.
        """
        return self.reason in (RELATIVE, RECURRING, AMBIGUOUS)


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:  # e.g. 31 February
        return None


def _extract_absolute(text: str) -> tuple[date | None, str | None]:
    """Return (date, reason). Reason is set only when extraction failed."""
    if m := _ISO.search(text):
        year, month, day = (int(g) for g in m.groups())
        found = _safe_date(year, month, day)
        return found, None if found else UNPARSEABLE

    if m := _DAY_MONTH_YEAR.search(text):
        day, month_name, year = m.groups()
        found = _safe_date(int(year), _MONTHS[month_name.lower()], int(day))
        return found, None if found else UNPARSEABLE

    if m := _MONTH_DAY_YEAR.search(text):
        month_name, day, year = m.groups()
        found = _safe_date(int(year), _MONTHS[month_name.lower()], int(day))
        return found, None if found else UNPARSEABLE

    if m := _NUMERIC.search(text):
        first, second, year = (int(g) for g in m.groups())
        # Pure-numeric dates are genuinely ambiguous: 01/02/2026 is 1 February
        # in most of the world and 2 January in the US. Only accept it when one
        # reading is impossible; otherwise refuse rather than pick.
        if first > 12 and second <= 12:
            found = _safe_date(year, second, first)  # day-first
        elif second > 12 and first <= 12:
            found = _safe_date(year, first, second)  # month-first
        elif first == second:
            found = _safe_date(year, first, second)  # same either way
        else:
            return None, AMBIGUOUS
        return found, None if found else UNPARSEABLE

    return None, UNPARSEABLE


def resolve_key_date(raw: str, *, today: date | None = None) -> ResolvedDate:
    """Classify one extracted ``keyDates`` string.

    ``today`` is injectable so tests don't depend on the wall clock.
    """
    if today is None:
        today = datetime.now(timezone.utc).date()

    text = (raw or "").strip()
    if not text:
        return ResolvedDate(False, reason=UNPARSEABLE)

    # Order matters: a relative or recurring expression may *contain* a real
    # date ("30 days after 1 January 2026") without being one.
    if _RECURRING_MARKERS.search(text):
        return ResolvedDate(False, reason=RECURRING)
    if _RELATIVE_MARKERS.search(text):
        return ResolvedDate(False, reason=RELATIVE)
    if _CONDITIONAL_MARKERS.search(text):
        return ResolvedDate(False, reason=CONDITIONAL)

    found, reason = _extract_absolute(text)
    if found is None:
        return ResolvedDate(False, reason=reason or UNPARSEABLE)

    # A deadline that has already passed can't be reminded about. Kept as a
    # distinct reason so the UI can say "this already passed" rather than
    # implying we failed to understand it.
    if found < today:
        return ResolvedDate(False, due=found, reason=PAST)

    return ResolvedDate(True, due=found)
