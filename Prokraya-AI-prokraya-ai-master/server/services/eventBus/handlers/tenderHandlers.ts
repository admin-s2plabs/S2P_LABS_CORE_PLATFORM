import {
  BidCreatedEvent,
  BidPublishedEvent,
  VendorInvitedToBidEvent,
  BidResponseSubmittedEvent,
  BidResponseUpdatedEvent,
  BidApprovedEvent,
  BidEvaluationCompletedEvent,
  BidRejectedEvent,
  BidClosedEvent,
  TenderEnvelopeCreatedEvent,
  TenderEnvelopeOpenedEvent,
  TechnicalScorerAssignedEvent,
  TechnicalScoreSubmittedEvent,
  TechnicalApproverAssignedEvent,
  TechnicalApprovedEvent,
  TechnicalRejectedEvent,
  CommercialScorerAssignedEvent,
  CommercialScoreSubmittedEvent,
  CommercialApproverAssignedEvent,
  CommercialApprovedEvent,
  CommercialRejectedEvent,
  NegotiationRequestedEvent,
  NegotiationResponseSubmittedEvent,
  AwardInitiatedEvent,
  AwardApprovedEvent,
  AwardRejectedEvent, BidReopenEvent
} from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/** am_aprvl_notification_dtls.event_id = 'BID_CREATED' */
export class BidCreatedHandler extends BaseEmailHandler<BidCreatedEvent> {
  constructor() { super("BID_CREATED"); }
  getRecipients(event: BidCreatedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidCreatedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'BID_PUBLISHED' */
export class BidPublishedHandler extends BaseEmailHandler<BidPublishedEvent> {
  constructor() { super("NEW_BID_PUBLISH"); }
  getRecipients(event: BidPublishedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidPublishedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
      companyName:event.supplierName,
    };
  }
}

export class BidReopenHandler extends BaseEmailHandler<BidReopenEvent> {
  constructor() { super("BID_SUPP_REOPEN"); }
  getRecipients(event: BidReopenEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidReopenEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
      companyName:event.supplierName,
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'VENDOR_INVITED_TO_BID' */
export class VendorInvitedToBidHandler extends BaseEmailHandler<VendorInvitedToBidEvent> {
  constructor() { super("VENDOR_INVITED_TO_BID"); }
  getRecipients(event: VendorInvitedToBidEvent) { return event.receiverEmail; }
  async getTemplateParams(event: VendorInvitedToBidEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      vendorName: event.vendorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'VENDOR_RESPONSE_SUBMITTED' */
export class BidResponseSubmittedHandler extends BaseEmailHandler<BidResponseSubmittedEvent> {
  constructor() { super("VENDOR_RESPONSE_SUBMITTED"); }
  getRecipients(event: BidResponseSubmittedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidResponseSubmittedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      vendorName: event.vendorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'BID_RESPONSE_UPDATED' */
export class BidResponseUpdatedHandler extends BaseEmailHandler<BidResponseUpdatedEvent> {
  constructor() { super("BID_RESPONSE_UPDATED"); }
  getRecipients(event: BidResponseUpdatedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidResponseUpdatedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      vendorName: event.vendorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'BID_APPROVED' */
export class BidApprovedHandler extends BaseEmailHandler<BidApprovedEvent> {
  constructor() { super("BID_APPROVED"); }
  getRecipients(event: BidApprovedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidApprovedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.requestorName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'BID_REJECTED' */
export class BidRejectedHandler extends BaseEmailHandler<BidRejectedEvent> {
  constructor() { super("BID_REJECTED"); }
  getRecipients(event: BidRejectedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidRejectedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.requestorName,
      reason: event.reason,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'BID_CLOSED' */
export class BidClosedHandler extends BaseEmailHandler<BidClosedEvent> {
  constructor() { super("BID_CLOSED"); }
  getRecipients(event: BidClosedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidClosedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      vendorName: event.vendorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'TENDER_ENVELOPE_CREATED' */
export class TenderEnvelopeCreatedHandler extends BaseEmailHandler<TenderEnvelopeCreatedEvent> {
  constructor() { super("TENDER_ENVELOPE_CREATED"); }
  getRecipients(event: TenderEnvelopeCreatedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: TenderEnvelopeCreatedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      memberName: event.memberName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'TENDER_ENVELOPE_OPENED' */
export class TenderEnvelopeOpenedHandler extends BaseEmailHandler<TenderEnvelopeOpenedEvent> {
  constructor() { super("TENDER_ENVELOPE_OPENED"); }
  getRecipients(event: TenderEnvelopeOpenedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: TenderEnvelopeOpenedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'TECHNICAL_SCORER_ASSIGNED' */
export class TechnicalScorerAssignedHandler extends BaseEmailHandler<TechnicalScorerAssignedEvent> {
  constructor() { super("TECHNICAL_SCORER_ASSIGNED"); }
  getRecipients(event: TechnicalScorerAssignedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: TechnicalScorerAssignedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.scorerName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'TECHNICAL_SCORE_SUBMITTED' */
export class TechnicalScoreSubmittedHandler extends BaseEmailHandler<TechnicalScoreSubmittedEvent> {
  constructor() { super("TECHNICAL_SCORE_SUBMITTED"); }
  getRecipients(event: TechnicalScoreSubmittedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: TechnicalScoreSubmittedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      scorerName: event.scorerName,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'TECHNICAL_APPROVER_ASSIGNED' */
export class TechnicalApproverAssignedHandler extends BaseEmailHandler<TechnicalApproverAssignedEvent> {
  constructor() { super("TECHNICAL_APPROVER_ASSIGNED"); }
  getRecipients(event: TechnicalApproverAssignedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: TechnicalApproverAssignedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.approverName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'TECHNICAL_APPROVED' */
export class TechnicalApprovedHandler extends BaseEmailHandler<TechnicalApprovedEvent> {
  constructor() { super("TECHNICAL_APPROVED"); }
  getRecipients(event: TechnicalApprovedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: TechnicalApprovedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'TECHNICAL_REJECTED' */
export class TechnicalRejectedHandler extends BaseEmailHandler<TechnicalRejectedEvent> {
  constructor() { super("TECHNICAL_REJECTED"); }
  getRecipients(event: TechnicalRejectedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: TechnicalRejectedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'COMMERCIAL_SCORER_ASSIGNED' */
export class CommercialScorerAssignedHandler extends BaseEmailHandler<CommercialScorerAssignedEvent> {
  constructor() { super("COMMERCIAL_SCORER_ASSIGNED"); }
  getRecipients(event: CommercialScorerAssignedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: CommercialScorerAssignedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.scorerName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'COMMERCIAL_SCORE_SUBMITTED' */
export class CommercialScoreSubmittedHandler extends BaseEmailHandler<CommercialScoreSubmittedEvent> {
  constructor() { super("COMMERCIAL_SCORE_SUBMITTED"); }
  getRecipients(event: CommercialScoreSubmittedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: CommercialScoreSubmittedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      scorerName: event.scorerName,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'COMMERCIAL_APPROVER_ASSIGNED' */
export class CommercialApproverAssignedHandler extends BaseEmailHandler<CommercialApproverAssignedEvent> {
  constructor() { super("COMMERCIAL_APPROVER_ASSIGNED"); }
  getRecipients(event: CommercialApproverAssignedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: CommercialApproverAssignedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.approverName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'COMMERCIAL_APPROVED' */
export class CommercialApprovedHandler extends BaseEmailHandler<CommercialApprovedEvent> {
  constructor() { super("COMMERCIAL_APPROVED"); }
  getRecipients(event: CommercialApprovedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: CommercialApprovedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'COMMERCIAL_REJECTED' */
export class CommercialRejectedHandler extends BaseEmailHandler<CommercialRejectedEvent> {
  constructor() { super("COMMERCIAL_REJECTED"); }
  getRecipients(event: CommercialRejectedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: CommercialRejectedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'NEGOTIATION_REQUESTED' */
export class NegotiationRequestedHandler extends BaseEmailHandler<NegotiationRequestedEvent> {
  constructor() { super("BID_NEGO_INVITE"); }
  getRecipients(event: NegotiationRequestedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: NegotiationRequestedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      companyName: event.vendorName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'NEGOTIATION_RESPONSE_SUBMITTED' */
export class NegotiationResponseSubmittedHandler extends BaseEmailHandler<NegotiationResponseSubmittedEvent> {
  constructor() { super("NEGOTIATION_RESPONSE_SUBMITTED"); }
  getRecipients(event: NegotiationResponseSubmittedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: NegotiationResponseSubmittedEvent) {
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      vendorName: event.vendorName,
      requestorName: event.requestorName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}
export class BidEvaluationCompletedHandler extends BaseEmailHandler<BidEvaluationCompletedEvent> {
  constructor() { super("BID_EVALUATION_COMPLETED"); }
  getRecipients(event: BidEvaluationCompletedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidEvaluationCompletedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return{
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.approverName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'AWARD_INITIATED' */
export class AwardInitiatedHandler extends BaseEmailHandler<AwardInitiatedEvent> {
  constructor() { super("AWARD_INITIATED"); }
  getRecipients(event: AwardInitiatedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AwardInitiatedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      taskTitle: event.bidTitle,
      userName: event.memberName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
      emailApprovalLink: event.emailApprovalLink,
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'AWARD_APPROVED' */
export class AwardApprovedHandler extends BaseEmailHandler<AwardApprovedEvent> {
  constructor() { super("AWARD_APPROVED"); }
  getRecipients(event: AwardApprovedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AwardApprovedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.buyerName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

/** am_aprvl_notification_dtls.event_id = 'AWARD_REJECTED' */
export class AwardRejectedHandler extends BaseEmailHandler<AwardRejectedEvent> {
  constructor() { super("AWARD_REJECTED"); }
  getRecipients(event: AwardRejectedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AwardRejectedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      bidNumber: event.bidNumber,
      bidTitle: event.bidTitle,
      userName: event.buyerName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}
