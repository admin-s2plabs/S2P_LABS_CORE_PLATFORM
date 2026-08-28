export interface TechnicalReviewSupplierResponse {
  responseId: string;
  supplierName: string;
  supplierContact: string;
  supplierPhone: string;
  bidTotal: string;
  techScore: string;
  version: string;
}

export interface TechnicalReviewSpec {
  bidId: number;
  bidNumber: string;
  bidTitle: string;
  bidType: string;
  status: string;
  bidStyle: string;
  startDate: string;
  endDate: string;
  currency: string;
  paymentTerms: string;
  buyerName: string;
  buyerEmail: string;
  requestorName: string;
  requestorEmail: string;
  departmentName: string;
  responsesCount: number;
  invitedCount: number;
  responses: TechnicalReviewSupplierResponse[];
  taskId?: string;
  taskTitle: string;
  scoreSubmitted: boolean;
  scoreApproved: boolean;
  techScoreComplete: boolean;
  canScore: boolean;
  canSubmit: boolean;
  readOnly?: boolean;
  viewMode?: "review" | "scores";
  blockReason?: string;
  aiAutoScored?: boolean;
  scoringState?: "pending" | "submitted" | "approved" | "complete" | "awarded" | "not_started";
}
