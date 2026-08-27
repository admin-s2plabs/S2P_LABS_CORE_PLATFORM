export interface BidApprovalReviewLine {
  item: string;
  category: string;
  qty: string;
  uom: string;
  unitPrice: string;
  requiredFrom: string;
  requiredBy: string;
  requestor: string;
}

export interface BidApprovalReviewCriterion {
  index: number;
  category: string;
  question: string;
  option: string;
  type: string;
  weight: string;
}

export interface BidApprovalReviewAttachment {
  id: number;
  name: string;
  downloadUrl: string;
}

export interface BidApprovalReviewTeamGroup {
  teamType: string;
  members: string[];
}

export interface BidApprovalReviewClause {
  type: "terms" | "instructions";
  description: string;
  reference?: string;
}

export interface BidApprovalReviewSpec {
  bidId: number;
  bidNumber: string;
  bidTitle: string;
  bidType: string;
  taskId: string;
  taskTitle: string;
  lines: BidApprovalReviewLine[];
  suppliers: string[];
  criteria: BidApprovalReviewCriterion[];
  criteriaAttachments: BidApprovalReviewAttachment[];
  evaluationTeam: BidApprovalReviewTeamGroup[];
  terms: BidApprovalReviewClause[];
  instructions: BidApprovalReviewClause[];
  termsAttachments: BidApprovalReviewAttachment[];
}
