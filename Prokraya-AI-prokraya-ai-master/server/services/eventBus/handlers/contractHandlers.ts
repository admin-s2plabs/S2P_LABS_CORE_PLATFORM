import {
  ReviewerRequestedMoreInfoEvent,
  ContractReviewAcceptedEvent,
  ContractReviewRejectedEvent,
  VendorClauseAcceptedEvent,
  ContractSubmittedForApprovalEvent,
} from "../events";
import { BaseEmailHandler } from "./baseHandler";

/** am_aprvl_notification_dtls.event_id = 'REVIEWER_REQUESTED_MORE_INFO' */
export class ReviewerRequestedMoreInfoHandler extends BaseEmailHandler<ReviewerRequestedMoreInfoEvent> {
  constructor() { super("REVIEWER_REQUESTED_MORE_INFO"); }
  getRecipients(event: ReviewerRequestedMoreInfoEvent) { return event.receiverEmail; }
  async getTemplateParams(event: ReviewerRequestedMoreInfoEvent) {
    return {
      contractId: event.contractId,
      contractTitle: event.contractTitle,
      contractRefNo: event.contractRefNo,
      reviewerName: event.reviewerName,
      requestorName: event.requestorName,
      comments: event.comments || "",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'CONTRACT_REVIEW_ACCEPTED' */
export class ContractReviewAcceptedHandler extends BaseEmailHandler<ContractReviewAcceptedEvent> {
  constructor() { super("CONTRACT_REVIEW_ACCEPTED"); }
  getRecipients(event: ContractReviewAcceptedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: ContractReviewAcceptedEvent) {
    return {
      contractId: event.contractId,
      contractTitle: event.contractTitle,
      contractRefNo: event.contractRefNo,
      reviewerName: event.reviewerName,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'CONTRACT_REVIEW_REJECTED' */
export class ContractReviewRejectedHandler extends BaseEmailHandler<ContractReviewRejectedEvent> {
  constructor() { super("CONTRACT_REVIEW_REJECTED"); }
  getRecipients(event: ContractReviewRejectedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: ContractReviewRejectedEvent) {
    return {
      contractId: event.contractId,
      contractTitle: event.contractTitle,
      contractRefNo: event.contractRefNo,
      reviewerName: event.reviewerName,
      requestorName: event.requestorName,
      comments: event.comments || "",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'VENDOR_CLAUSE_ACCEPTED' */
export class VendorClauseAcceptedHandler extends BaseEmailHandler<VendorClauseAcceptedEvent> {
  constructor() { super("VENDOR_CLAUSE_ACCEPTED"); }
  getRecipients(event: VendorClauseAcceptedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: VendorClauseAcceptedEvent) {
    return {
      contractId: event.contractId,
      contractTitle: event.contractTitle,
      contractRefNo: event.contractRefNo,
      vendorName: event.vendorName,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'CONTRACT_SUBMITTED_FOR_APPROVAL' */
export class ContractSubmittedForApprovalHandler extends BaseEmailHandler<ContractSubmittedForApprovalEvent> {
  constructor() { super("CONTRACT_SUBMITTED_FOR_APPROVAL"); }
  getRecipients(event: ContractSubmittedForApprovalEvent) { return event.receiverEmail; }
  async getTemplateParams(event: ContractSubmittedForApprovalEvent) {
    return {
      contractId: event.contractId,
      contractTitle: event.contractTitle,
      contractRefNo: event.contractRefNo,
      requestorName: event.requestorName,
      approverName: event.approverName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}
