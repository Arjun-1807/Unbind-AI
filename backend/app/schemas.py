from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


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
    picture: Optional[str] = None
    pro: bool = False
    plan: Optional[str] = None
    aiModel: Optional[str] = None
    accessToken: Optional[str] = None
    createdAt: Optional[datetime] = None


class UpdatePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


# ---------- Analysis ----------
class ClauseAnalysis(BaseModel):
    clauseText: str
    simplifiedExplanation: str
    riskLevel: str  # Low | Medium | High | Negligible | No Risk
    riskReason: str
    negotiationSuggestion: str
    suggestedRewrite: Optional[str] = None


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
    chunkSummaries: Optional[list[ChunkSummary]] = None


class StoredAnalysis(BaseModel):
    id: str
    userId: str
    fileName: str
    analysisDate: str
    analysisResult: AnalysisResponse
    documentText: str


class AnalyzeRequest(BaseModel):
    text: str
    role: str = ""
    fileName: str = "document"


class SimulateRequest(BaseModel):
    documentText: str
    scenario: str


# ---------- Lawyer Referral ----------
class LawyerProfile(BaseModel):
    id: str
    name: str
    specializations: list[str]
    bio: str
    experienceYears: int
    city: str
    email: str
    phone: Optional[str] = None
    rating: Optional[float] = 0.0
    verified: bool = False
    createdAt: datetime


class ContactLawyerRequest(BaseModel):
    lawyerId: str
    message: str
    contactEmail: str


class LawyerRegistrationRequest(BaseModel):
    name: str
    email: EmailStr
    specializations: list[str]
    bio: str
    experienceYears: int
    city: str
    phone: Optional[str] = None
