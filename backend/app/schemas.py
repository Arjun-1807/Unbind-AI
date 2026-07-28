from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

# Upper bounds for free-text that gets forwarded to an LLM. These are generous
# (a 200-page contract is roughly 500k characters) but finite: without a cap,
# a single request can drive an arbitrary number of chunk completions.
MAX_DOCUMENT_CHARS = 600_000
MAX_SCENARIO_CHARS = 2_000
MAX_CLAUSE_CHARS = 20_000
MAX_NEGOTIATION_POINTS = 50


# ---------- Auth ----------
class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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
    currentPassword: str
    newPassword: str


# ---------- Analysis ----------
class ClauseAnalysis(BaseModel):
    clauseText: str
    simplifiedExplanation: str
    riskLevel: str
    riskReason: str
    negotiationSuggestion: str
    suggestedRewrite: str | None = None


class KeyTerm(BaseModel):
    term: str
    definition: str


class KeyDate(BaseModel):
    date: str
    description: str


class MissingClause(BaseModel):
    clauseName: str
    reason: str


class ChunkSummary(BaseModel):
    chunkIndex: int
    summary: str


class AnalysisResponse(BaseModel):
    summary: str
    clauses: list[ClauseAnalysis]
    keyTerms: list[KeyTerm]
    keyDates: list[KeyDate]
    missingClauses: list[MissingClause]
    chunkSummaries: list[ChunkSummary] | None = None


class StoredAnalysis(BaseModel):
    id: str
    userId: str
    fileName: str
    analysisDate: str
    analysisResult: AnalysisResponse
    documentText: str


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


class ChatCitation(BaseModel):
    id: int
    snippet: str
    startIndex: int
    endIndex: int


class ChatMessageResponse(BaseModel):
    role: str
    content: str
    citations: list[ChatCitation] = []
    createdAt: datetime | None = None


class DocumentAnswerResponse(BaseModel):
    answer: str
    citations: list[ChatCitation] = []


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


class NegotiationDraftResponse(BaseModel):
    subject: str = ""  # empty for non-email formats
    body: str


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


class ContactLawyerRequest(BaseModel):
    lawyerId: str
    message: str = Field(max_length=5_000)
    # EmailStr, not str: this address is used as the Reply-To on an outbound
    # email, so it must actually be an address.
    contactEmail: EmailStr


class LawyerRegistrationRequest(BaseModel):
    name: str
    email: EmailStr
    specializations: list[str]
    bio: str
    experienceYears: int
    city: str
    phone: str | None = None
