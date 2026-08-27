export type OpenEnvelopeTeamRole =
  | "Committee"
  | "Tech Review"
  | "Tech Approve"
  | "Comm Review"
  | "Comm Approve";

export interface OpenEnvelopeReviewTeamMember {
  name: string;
  role: OpenEnvelopeTeamRole;
  status: string;
}

export interface OpenEnvelopeReviewResponse {
  supplierName: string;
  supplierContact: string;
  supplierPhone: string;
  responseNumber: string;
  bidTotal: string;
  techScore: string;
  commScore: string;
  totalScore: string;
  version: string;
  responseStatus: string;
  timeLeft: string;
}

export interface OpenEnvelopeReviewSpec {
  bidId: number;
  bidNumber: string;
  bidTitle: string;
  bidType: string;
  status: string;
  bidStyle: string;
  startDate: string;
  endDate: string;
  envelopeOpenDate: string;
  currency: string;
  paymentTerms: string;
  buyerName: string;
  buyerEmail: string;
  requestorName: string;
  requestorEmail: string;
  departmentName: string;
  responsesCount: number;
  invitedCount: number;
  evaluationTeam: OpenEnvelopeReviewTeamMember[];
  responses: OpenEnvelopeReviewResponse[];
  canOpenEnvelope: boolean;
  /** Shown when canOpenEnvelope is false so the user knows why the action is hidden. */
  openEnvelopeBlockReason?: string;
  committeeOpenedCount: number;
  committeeRequiredCount: number;
  envelopeOpened: boolean;
  taskTitle: string;
}
