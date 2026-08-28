/** Structured output from the hybrid technical evaluation engine. */

export type TechnicalScoringPath = "rule" | "llm" | "hybrid";

export interface TechnicalEvalEvidence {
  source: "response_text" | "attachment" | "peer_comparison";
  documentName?: string;
  excerpt: string;
}

export interface TechnicalEvalAiDetails {
  scoringPath?: TechnicalScoringPath;
  confidence?: number;
  score?: number;
  maxScore?: number;
  normalizedAnswer?: string;
  rank?: number;
  comparativePeerCount?: number;
  supportingEvidence?: TechnicalEvalEvidence[];
  internalRationale?: string;
}

export interface TechnicalRequirementScore {
  requirementId: number;
  question: string;
  weight: number;
  vendorResponse: string;
  /** Score in weightage units (0 … maxScore). */
  score?: number;
  /** Normalized 0–10 scale (backward compatible). */
  suggestedScore: number;
  maxScore: number;
  /** Internal / technical rationale (backend & AI details). */
  rationale: string;
  /** Business-friendly remark for reviewers (≤250 chars). */
  reviewRemark?: string;
  confidence?: number;
  scoringPath?: TechnicalScoringPath;
  normalizedAnswer?: string;
  supportingEvidence?: TechnicalEvalEvidence[];
  aiDetails?: TechnicalEvalAiDetails;
}

export interface TechnicalEvalSupplierResult {
  responseId: number;
  supplierName: string;
  suggestedTechScore: number;
  requirementScores: TechnicalRequirementScore[];
  overallRationale: string;
}

export interface TechnicalEvalResult {
  responses: TechnicalEvalSupplierResult[];
  comparativeSummary: string;
}
