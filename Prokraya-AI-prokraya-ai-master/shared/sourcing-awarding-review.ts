import type { AgentCompareBidsSpec } from "@shared/agent-compare-bids";
import type { OpenEnvelopeReviewTeamMember } from "@shared/sourcing-open-envelope-review";

export interface AwardingReviewSupplierResponse {
  responseId: string;
  supplierId: string;
  supplierName: string;
  supplierContact: string;
  supplierPhone: string;
  bidTotal: string;
  techScore: string;
  commScore: string;
  totalScore: string;
  version: string;
  responseStatus: string;
}

export interface AwardingReviewSpec {
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
  responses: AwardingReviewSupplierResponse[];
  compareBids: AgentCompareBidsSpec;
  canAward: boolean;
  taskTitle: string;
}
