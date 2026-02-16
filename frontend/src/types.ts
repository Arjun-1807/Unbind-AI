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

export interface User {
  id: string;
  username: string;
  email: string;
  picture?: string;
  pro?: boolean;
}

export interface StoredAnalysis {
  id: string;
  userId: string;
  fileName: string;
  analysisDate: string;
  analysisResult: AnalysisResponse;
  documentText: string;
}
