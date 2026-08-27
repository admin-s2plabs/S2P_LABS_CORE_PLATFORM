export interface BidAwardApprovalReviewLine {
  item: string;
  category: string;
  bidQty: string;
  awardedQty: string;
  unitPrice: string;
  discPrice: string;
  tax: string;
}

export interface BidAwardApprovalHistoryStep {
  name: string;
  status: "Approved" | "Rejected" | "Pending";
  date?: string;
  comments?: string;
}

export interface BidAwardApprovalCommitteeMember {
  name: string;
  email: string;
  role: string;
  status: "Accepted" | "Rejected" | "Pending";
}

export interface BidAwardApprovalReviewSpec {
  bidId: number;
  bidNumber: string;
  bidTitle: string;
  bidType: string;
  bidStatus: string;
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
  lines: BidAwardApprovalReviewLine[];
  approvalHistory: BidAwardApprovalHistoryStep[];
  committeeMembers: BidAwardApprovalCommitteeMember[];
  taskId: string;
  taskTitle: string;
  canApprove: boolean;
  canAcceptCommittee: boolean;
}
