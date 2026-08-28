export interface CommercialReviewSupplierResponse {
  responseId: string;
  supplierName: string;
  supplierContact: string;
  supplierPhone: string;
  bidTotal: string;
  commScore: string;
  version: string;
}

export interface CommercialReviewSpec {
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
  responses: CommercialReviewSupplierResponse[];
  taskId?: string;
  taskTitle: string;
  scoreSubmitted: boolean;
  scoreApproved: boolean;
  commScoreComplete: boolean;
  canScore: boolean;
  canSubmit: boolean;
  readOnly?: boolean;
  viewMode?: "review" | "scores";
  blockReason?: string;
  aiAutoScored?: boolean;
  scoringState?: "pending" | "submitted" | "approved" | "complete" | "awarded";
}
