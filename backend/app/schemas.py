from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, model_validator

# Upper bounds for free-text that gets forwarded to an LLM. These are generous
# (a 200-page contract is roughly 500k characters) but finite: without a cap,
# a single request can drive an arbitrary number of chunk completions.
MAX_DOCUMENT_CHARS = 600_000
MAX_SCENARIO_CHARS = 2_000
MAX_CLAUSE_CHARS = 20_000
MAX_NEGOTIATION_POINTS = 50
# Per-field and per-list caps multiply: 50 points x 4 fields x 20k chars is ~4
# million characters in one request, all of which the negotiation drafter
# concatenates into a single prompt. The aggregate cap is what actually bounds
# the bill. Sized for the realistic case (a handful of clauses quoted in full),
# not the theoretical maximum.
MAX_NEGOTIATION_TOTAL_CHARS = 40_000

# Password policy, enforced server-side on every path that sets a password.
# The 72-byte ceiling is bcrypt's: it silently truncates anything longer, so a
# longer password would give a false sense of strength (and passlib/bcrypt
# raises on over-long input in some versions).
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 72


# ---------- Auth ----------
class SignupRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)


class LoginRequest(BaseModel):
    email: EmailStr
    # No min_length (an old account may predate the policy) but the bcrypt
    # ceiling still applies: anything longer can't be a real password, and
    # handing an unbounded string to bcrypt is free work for an attacker.
    password: str = Field(max_length=MAX_PASSWORD_LENGTH)


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    picture: str | None = None
    pro: bool = False
    plan: str | None = None
    aiModel: str | None = None
    accessToken: str | None = None
    createdAt: datetime | None = None


class UpdatePasswordRequest(BaseModel):
    # Bounded for the same reason as LoginRequest.password: it goes straight to
    # verify_password, which truncates at bcrypt's 72 bytes anyway.
    currentPassword: str = Field(max_length=MAX_PASSWORD_LENGTH)
    newPassword: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)


# ---------- Analysis ----------


class AnalyzeRequest(BaseModel):
    text: str = Field(max_length=MAX_DOCUMENT_CHARS)
    role: str = Field("", max_length=200)
    fileName: str = Field("document", max_length=300)


class SimulateRequest(BaseModel):
    documentText: str = Field(max_length=MAX_DOCUMENT_CHARS)
    scenario: str = Field(max_length=MAX_SCENARIO_CHARS)
    # Lets the server reuse this document's stored embeddings instead of
    # re-embedding it on every question. Optional for backward compatibility.
    analysisId: str | None = None


# ---------- Document Q&A ----------
class DocumentQuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_SCENARIO_CHARS)


# ---------- Deadline reminders ----------
class ReminderPreferencesRequest(BaseModel):
    """Both fields optional so a client can change one without the other."""

    enabled: bool | None = None
    leadDays: list[int] | None = Field(None, max_length=10)


class ReminderDueDateRequest(BaseModel):
    # ISO YYYY-MM-DD. Parsed in the route so a bad value is a 422, not a 500.
    dueDate: str = Field(max_length=10)


# ---------- Negotiation copilot ----------
class NegotiationPoint(BaseModel):
    clauseText: str = Field(max_length=MAX_CLAUSE_CHARS)
    # why the clause is a problem (e.g. the risk reason)
    concern: str = Field("", max_length=MAX_CLAUSE_CHARS)
    # the change to ask for (e.g. the negotiation suggestion)
    request: str = Field("", max_length=MAX_CLAUSE_CHARS)
    # preferred wording, if the user picked one
    desiredRewrite: str | None = Field(None, max_length=MAX_CLAUSE_CHARS)


class NegotiationDraftRequest(BaseModel):
    points: list[NegotiationPoint] = Field(max_length=MAX_NEGOTIATION_POINTS)
    tone: str = "polite"  # polite | neutral | firm
    format: str = "email"  # email | message | letter
    counterparty: str = Field("", max_length=200)  # who it's addressed to (e.g. "Landlord")
    senderName: str = Field("", max_length=200)  # optional name to sign off with

    @model_validator(mode="after")
    def _cap_total_length(self) -> "NegotiationDraftRequest":
        """Reject requests whose points sum to more than the prompt budget.

        The per-field caps bound one clause; this bounds the whole prompt, which
        is what the LLM actually gets billed for.
        """
        total = sum(
            len(p.clauseText) + len(p.concern) + len(p.request) + len(p.desiredRewrite or "")
            for p in self.points
        )
        if total > MAX_NEGOTIATION_TOTAL_CHARS:
            raise ValueError(
                f"Selected clauses total {total} characters, which exceeds the "
                f"{MAX_NEGOTIATION_TOTAL_CHARS} character limit. Select fewer clauses."
            )
        return self


# ---------- Lawyer Referral ----------
class LawyerProfile(BaseModel):
    id: str
    name: str
    specializations: list[str]
    bio: str
    experienceYears: int
    city: str
    email: str
    phone: str | None = None
    rating: float | None = 0.0
    verified: bool = False
    createdAt: datetime


Specialization = Annotated[str, Field(min_length=1, max_length=100)]


class ContactLawyerRequest(BaseModel):
    lawyerId: str
    message: str = Field(max_length=5_000)
    # EmailStr, not str: this address is used as the Reply-To on an outbound
    # email, so it must actually be an address.
    contactEmail: EmailStr


class LawyerRegistrationRequest(BaseModel):
    # Every field is bounded: this model is posted by unauthenticated-ish
    # registration, so bare `str`/`list[str]` would let anyone write
    # arbitrarily large documents into the lawyers collection.
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    # max_length on the list caps the item count; the Annotated cap on the item
    # type is what stops 20 x 10MB strings from getting through.
    specializations: list[Specialization] = Field(max_length=20)
    bio: str = Field(max_length=5_000)
    experienceYears: int = Field(ge=0, le=80)
    city: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=40)
