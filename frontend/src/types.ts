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

/** One turn in a document Q&A conversation. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  /** ISO timestamp; absent for messages not yet round-tripped to the server. */
  createdAt?: string;
}

export interface DocumentAnswer {
  answer: string;
  citations: Citation[];
}

/** Why a key date couldn't be turned into a reminder automatically. */
export type ReminderReason =
  | "relative"
  | "recurring"
  | "conditional"
  | "ambiguous"
  | "unparseable"
  | "past";

export interface Reminder {
  id: string;
  description: string;
  /** The date exactly as the contract worded it. */
  sourceDate: string;
  /** ISO YYYY-MM-DD, or null when no date could be resolved. */
  dueDate: string | null;
  schedulable: boolean;
  reason: ReminderReason | null;
  /** True when the user could supply the missing date themselves. */
  needsAttention: boolean;
  sentLeads: number[];
}

export interface ReminderPreferences {
  enabled: boolean;
  leadDays: number[];
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

/**
 * An analysis as it appears in a list. The history endpoint deliberately omits
 * `documentText` — it dwarfs everything else in the payload and no list view
 * renders it. Fetch the full record with `getAnalysisById` when one is opened.
 */
export interface AnalysisSummary {
  id: string;
  userId: string;
  fileName: string;
  analysisDate: string;
  analysisResult: AnalysisResponse;
}

export interface StoredAnalysis extends AnalysisSummary {
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
