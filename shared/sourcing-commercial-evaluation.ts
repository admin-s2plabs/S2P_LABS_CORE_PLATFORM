export interface CommercialEvaluationSupplierResponse {
  responseId: string;
  supplierName: string;
  supplierContact: string;
  supplierPhone: string;
  bidTotal: string;
  commScore: string;
  version: string;
}

export interface CommercialEvaluationSpec {
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
  responses: CommercialEvaluationSupplierResponse[];
  taskId?: string;
  taskTitle: string;
  commScoreComplete: boolean;
  scoreApproved: boolean;
  canApprove: boolean;
}
