export interface BidAwardSubmitReviewLine {
  item: string;
  category: string;
  bidQty: string;
  awardedQty: string;
  unitPrice: string;
  discPrice: string;
  tax: string;
}

export interface BidAwardSubmitOtherQuote {
  responseId: string;
  supplierName: string;
  bidTotal: string;
  discount: string;
  taxAmount?: string;
  grossTotal: string;
}

export interface BidAwardSubmitReviewSpec {
  bidId: number;
  bidNumber: string;
  bidTitle: string;
  bidType: string;
  bidStatus: string;
  bidStyle: string;
  startDate: string;
  endDate: string;
  currency: string;
  paymentTerms: string;
  deliveryLocation: string;
  linkedPr?: string;
  buyerName: string;
  buyerEmail: string;
  requestorName: string;
  requestorEmail: string;
  departmentName: string;
  responsesCount: number;
  invitedCount: number;
  totalAwards: number;
  awardId: number;
  awardStatus: string;
  supplierName: string;
  supplierContact: string;
  supplierPhone: string;
  grossTotal: string;
  discount: string;
  taxAmount: string;
  netTotal: string;
  amountInWords: string;
  awardNotes: string;
  lines: BidAwardSubmitReviewLine[];
  otherQuotes: BidAwardSubmitOtherQuote[];
  canSubmit: boolean;
  taskTitle: string;
}
