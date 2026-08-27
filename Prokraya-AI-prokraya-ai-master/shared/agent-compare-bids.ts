export interface AgentCompareBidsSpec {
  bid: Record<string, any>;
  responses: Record<string, any>[];
  lines: Record<string, any>[];
  requirements: Record<string, any>[];
  scores: Record<string, any>[];
  awards?: Record<string, any>[];
  awardLines?: Record<string, any>[];
  currentStep?: string;
  allLinesHavePo?: boolean;
}
