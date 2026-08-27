export interface TechnicalEvaluationSupplierResponse {
  responseId: string;
  supplierName: string;
  supplierContact: string;
  supplierPhone: string;
  bidTotal: string;
  techScore: string;
  version: string;
}

export interface TechnicalEvaluationSpec {
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
  responses: TechnicalEvaluationSupplierResponse[];
  taskId?: string;
  taskTitle: string;
  techScoreComplete: boolean;
  scoreApproved: boolean;
  canApprove: boolean;
}
