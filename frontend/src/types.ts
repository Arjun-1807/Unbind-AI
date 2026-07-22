export enum RiskLevel {
  Low = "Low",
  Medium = "Medium",
  High = "High",
  Negligible = "Negligible",
  NoRisk = "No Risk",
}

export interface ClauseAnalysis {
  clauseText: string;
  simplifiedExplanation: string;
  riskLevel: RiskLevel;
  riskReason: string;
  negotiationSuggestion: string;
  suggestedRewrite?: string;
}

export interface ModifiedClause extends ClauseAnalysis {
  userChoice: "keep_original" | "use_ai" | "use_custom";
  customText?: string;
  finalText: string;
  isModified: boolean;
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface KeyDate {
  date: string;
  description: string;
}

export interface MissingClause {
  clauseName: string;
  reason: string;
}

export interface ChunkSummary {
  chunkIndex: number;
  summary: string;
}

export interface AnalysisResponse {
  summary: string;
  clauses: ClauseAnalysis[];
  keyTerms: KeyTerm[];
  keyDates: KeyDate[];
  missingClauses: MissingClause[];
  chunkSummaries?: ChunkSummary[];
}

export interface Citation {
  /** 1-based source label; matches the [S{id}] marker in the answer text. */
  id: number;
  /** Short single-line preview of the cited excerpt (for the Sources list). */
  snippet: string;
  /** Character offset of the excerpt in the document (-1 if not locatable). */
  startIndex: number;
  /** End character offset (exclusive) of the excerpt (-1 if not locatable). */
  endIndex: number;
}

export interface SimulationResult {
  answer: string;
  citations: Citation[];
}

export type NegotiationTone = "polite" | "neutral" | "firm";
export type NegotiationFormat = "email" | "message" | "letter";

export interface NegotiationPoint {
  clauseText: string;
  concern: string;
  request: string;
  desiredRewrite?: string | null;
}

export interface NegotiationDraftRequest {
  points: NegotiationPoint[];
  tone: NegotiationTone;
  format: NegotiationFormat;
  counterparty: string;
  senderName: string;
}

export interface NegotiationDraft {
  /** Empty for non-email formats. */
  subject: string;
  body: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  picture?: string;
  pro?: boolean;
  plan?: string | null;
  aiModel?: string;
  /** ISO timestamp of account creation (from /auth/me). */
  createdAt?: string;
}

export interface StoredAnalysis {
  id: string;
  userId: string;
  fileName: string;
  analysisDate: string;
  analysisResult: AnalysisResponse;
  documentText: string;
}

export interface AnalysisProgressEvent {
  stage: string;
  message: string;
  total?: number;
  completed?: number;
  index?: number;
}

export interface LawyerProfile {
  id: string;
  name: string;
  specializations: string[];
  bio: string;
  experienceYears: number;
  city: string;
  email: string;
  phone?: string;
  rating?: number;
  verified: boolean;
  createdAt: string;
}
