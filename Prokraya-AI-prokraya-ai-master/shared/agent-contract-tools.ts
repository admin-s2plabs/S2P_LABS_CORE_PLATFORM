export interface ExtractedClause {
  section_name?: string;
  section_type?: string;
  clause_mandatory?: string;
  clause_negotiable?: string;
  description?: string;
}

export interface ExtractContractResult {
  type: "extract";
  contractId: number | string;
  title: string;
  clauses: ExtractedClause[];
  note?: string;
}

export interface RiskCategoryScore {
  score?: number;
}

export interface RiskContractResult {
  type: "risk";
  title: string;
  summary?: string;
  riskScore?: number;
  riskLevel?: string;
  risks?: {
    financial?: RiskCategoryScore;
    compliance?: RiskCategoryScore;
    delivery?: RiskCategoryScore;
  };
  keyPoints?: string[];
  redFlags?: string[];
  signatoryNote?: string;
}

export interface RedlineSuggestion {
  clause_name?: string;
  risk_level?: string;
  issue?: string;
  before?: string;
  after?: string;
  rationale?: string;
}

export interface RedlineContractResult {
  type: "redline";
  title: string;
  suggestions: RedlineSuggestion[];
  note?: string;
}

export interface RenewalItem {
  id: number | string;
  title: string;
  status?: string;
  days_left: number;
  note?: string;
}

export interface RenewalContractResult {
  type: "renewal";
  window: 30 | 60 | 90;
  items: RenewalItem[];
}

export type ContractToolResult =
  | ExtractContractResult
  | RiskContractResult
  | RedlineContractResult
  | RenewalContractResult;
