import { EventTypes } from '../events';
import { eventBus } from '../index';
import { poApprovedHandler } from './POApprovedHandler';
import { poRejectedHandler } from './PORejectedHandler';
import { prApprovedHandler } from './PRApprovedHandler';
import { prRejectedHandler } from './PRRejectedHandler';
import { budgetApprovedHandler } from './budgetApprovedHandler';
import { budgetRejectedHandler } from './budgetRejectedHandler';
import { forgotPasswordLinkHandler } from './forgotPasswordLinkHandler';
import { loginOTPHandler } from './loginOTPHandler';
import { passwordResetHandler } from './passwordResetHandler';
import { poApprovalHandler } from './poApprovalHandler';
import { registerOnBehalfHandler } from './registerOnBehalfHandler';
import { registrationInviteHandler } from './registrationInviteHandler';
import { taskAssignmentHandler } from './taskAssignmentHandler';
import { userCreationHandler } from './userCreationHandler';
import { supplierMoreInfoHandler } from './supplierMoreInfoHandler';
import { supplierMoreInfoUpdateHandler } from './supplierMoreInfoUpdateHandler';
import { supplierApprovedHandler } from './supplierApprovedHandler';
import { supplierResubmitHandler } from './supplierResubmitHandler';
import { supplierRejectedHandler } from './supplierRejectedHandler';
import { budgetMoreInfoHandler } from './budgetMoreInfoHandler';
import { registrationSubmitHandler } from './registrationSubmitHandler';
import { suppApprInitiatorHandler } from './suppApprInitiatorHandler';
import { invoiceApprovedNonPOHandler } from './invoiceApprovedNonPOHandler';
import { invoiceRejectedNonPOHandler } from './invoiceRejectedNonPOHandler';
import { invoiceMoreNonPOHandler } from './invoiceMoreNonPOHandler';
import { suppPoAckHandler } from './SuppPoAckHandler';
import { suppPoRejectedHandler } from './SuppPoRejectedHandler';
import { suppDeliveryNoteRaisedHandler } from './SuppDeliveryNoteRaisedHandler';
import { requestorReceiptConfirmedHandler } from './RequestorReceiptConfirmedHandler';
import { invoiceApprovedPOHandler } from './InvoiceApprovedPOHandler';
import { invoiceRejectedPOHandler } from './InvoiceRejectedPOHandler';
import { invoiceMorePOHandler } from './InvoiceMorePOHandler';
import { invoiceResubmittedPOHandler } from './InvoiceResubmittedPOHandler';
import { invoicePaymentReceivedPOHandler } from './InvoicePaymentReceivedPOHandler';
import { invoicePaymentReceivedNonPOHandler } from './InvoicePaymentReceivedNonPOHandler';
import {
  auctionPublishedHandler,
  suppAuctionQuoteSubmittedHandler,
  auctionExtendedHandler,
  auctionAutoExtendHandler,
  bidDeleteRequestedHandler,
  bidDeleteApprovedHandler,
  proxyBidPlacedHandler,
  auctionEndingSoonHandler,
  auctionClosedHandler,
  auctionAwardedHandler,
  auctionRegretHandler,
  auctionAwardRejectedHandler,
} from './auctionHandlers';
import {
  BidCreatedHandler,
  BidPublishedHandler,
  BidReopenHandler,
  VendorInvitedToBidHandler,
  BidResponseSubmittedHandler,
  BidResponseUpdatedHandler,
  BidApprovedHandler,
  BidRejectedHandler,
  BidClosedHandler,
  TenderEnvelopeCreatedHandler,
  TenderEnvelopeOpenedHandler,
  TechnicalScorerAssignedHandler,
  TechnicalScoreSubmittedHandler,
  TechnicalApproverAssignedHandler,
  TechnicalApprovedHandler,
  TechnicalRejectedHandler,
  CommercialScorerAssignedHandler,
  CommercialScoreSubmittedHandler,
  CommercialApproverAssignedHandler,
  CommercialApprovedHandler,
  CommercialRejectedHandler,
  NegotiationRequestedHandler,
  NegotiationResponseSubmittedHandler,
  AwardInitiatedHandler,
  AwardApprovedHandler,
  AwardRejectedHandler,
  BidEvaluationCompletedHandler
} from './tenderHandlers';
import {
  ReviewerRequestedMoreInfoHandler,
  ContractReviewAcceptedHandler,
  ContractReviewRejectedHandler,
  VendorClauseAcceptedHandler,
  ContractSubmittedForApprovalHandler,
} from './contractHandlers';
import { changePasswordHandler } from './changePasswordHandler';
import { poApprovedSupplierHandler } from './poApprovedSupplierHandler';
import { prCancelHandler } from './PRCancelHandler';
import { requestDelegationHandler } from './requestDelegationHandler';


const bidCreatedHandler = new BidCreatedHandler();
const bidReopenHandler = new BidReopenHandler();
const bidPublishedHandler = new BidPublishedHandler();
const vendorInvitedToBidHandler = new VendorInvitedToBidHandler();
const bidResponseSubmittedHandler = new BidResponseSubmittedHandler();
const bidResponseUpdatedHandler = new BidResponseUpdatedHandler();
const bidApprovedHandler = new BidApprovedHandler();
const bidRejectedHandler = new BidRejectedHandler();
const bidClosedHandler = new BidClosedHandler();
const tenderEnvelopeCreatedHandler = new TenderEnvelopeCreatedHandler();
const tenderEnvelopeOpenedHandler = new TenderEnvelopeOpenedHandler();
const technicalScorerAssignedHandler = new TechnicalScorerAssignedHandler();
const technicalScoreSubmittedHandler = new TechnicalScoreSubmittedHandler();
const technicalApproverAssignedHandler = new TechnicalApproverAssignedHandler();
const technicalApprovedHandler = new TechnicalApprovedHandler();
const technicalRejectedHandler = new TechnicalRejectedHandler();
const commercialScorerAssignedHandler = new CommercialScorerAssignedHandler();
const commercialScoreSubmittedHandler = new CommercialScoreSubmittedHandler();
const commercialApproverAssignedHandler = new CommercialApproverAssignedHandler();
const commercialApprovedHandler = new CommercialApprovedHandler();
const commercialRejectedHandler = new CommercialRejectedHandler();
const negotiationRequestedHandler = new NegotiationRequestedHandler();
const negotiationResponseSubmittedHandler = new NegotiationResponseSubmittedHandler();
const bidEvaluationCompletedHandler=new BidEvaluationCompletedHandler();
const awardInitiatedHandler = new AwardInitiatedHandler();
const awardApprovedHandler = new AwardApprovedHandler();
const awardRejectedHandler = new AwardRejectedHandler();
const reviewerRequestedMoreInfoHandler = new ReviewerRequestedMoreInfoHandler();
const contractReviewAcceptedHandler = new ContractReviewAcceptedHandler();
const contractReviewRejectedHandler = new ContractReviewRejectedHandler();
const vendorClauseAcceptedHandler = new VendorClauseAcceptedHandler();
const contractSubmittedForApprovalHandler = new ContractSubmittedForApprovalHandler();

export function registerAllHandlers(): void {
  console.log('[EventBus] Registering event handlers...');

  eventBus.subscribe(EventTypes.LOGIN_OTP, loginOTPHandler);
  eventBus.subscribe(EventTypes.REGISTRATION_INVITE, registrationInviteHandler);
  eventBus.subscribe(EventTypes.RESET_PASSWORD, passwordResetHandler);
  eventBus.subscribe(EventTypes.REGISTER_ONBEHALF_INVITATION, registerOnBehalfHandler);
  eventBus.subscribe(EventTypes.FORGOT_PASSWORD_LINK, forgotPasswordLinkHandler);
  eventBus.subscribe(EventTypes.PROFILE_CHANGE_PASSWORD, changePasswordHandler);
  eventBus.subscribe(EventTypes.PO_APPROVAL, poApprovalHandler);
  eventBus.subscribe(EventTypes.SRMS_USER_CREATION, userCreationHandler);
  eventBus.subscribe(EventTypes.BUDGET_APPROVED, budgetApprovedHandler);
  eventBus.subscribe(EventTypes.BUDGET_REJECTED, budgetRejectedHandler);
  eventBus.subscribe(EventTypes.BUDGET_MORE_INFO, budgetMoreInfoHandler);
  eventBus.subscribe(EventTypes.PR_APPROVED, prApprovedHandler);
  eventBus.subscribe(EventTypes.PR_REJECTED, prRejectedHandler);
  eventBus.subscribe(EventTypes.PO_APPROVED, poApprovedHandler);
  eventBus.subscribe(EventTypes.PO_REJECTED, poRejectedHandler);
  eventBus.subscribe(EventTypes.PO_APPROVED_SUPPLIER, poApprovedSupplierHandler);
  eventBus.subscribe(EventTypes.SUPP_REGSTR_MOREINFO, supplierMoreInfoHandler);
  eventBus.subscribe(EventTypes.SUPP_UPDATE_MORE_INFO, supplierMoreInfoUpdateHandler);
  eventBus.subscribe(EventTypes.SUPP_REGSTR_APPROVED, supplierApprovedHandler);
  eventBus.subscribe(EventTypes.SUPP_REGSTR_RESUBMIT, supplierResubmitHandler);
  eventBus.subscribe(EventTypes.SUPP_REGSTR_REJECTED, supplierRejectedHandler);
  eventBus.subscribe(EventTypes.REGISTRATION_SUBMIT, registrationSubmitHandler);
  eventBus.subscribe(EventTypes.SUPP_APPR_INITIATOR, suppApprInitiatorHandler);
  eventBus.subscribe(EventTypes.INVOICE_APPROVED_NONPO, invoiceApprovedNonPOHandler);
  eventBus.subscribe(EventTypes.INVOICE_REJECTED_NONPO, invoiceRejectedNonPOHandler);
  eventBus.subscribe(EventTypes.INVOICE_MORE_NONPO, invoiceMoreNonPOHandler);
  eventBus.subscribe(EventTypes.SUPP_PO_ACK, suppPoAckHandler);
  eventBus.subscribe(EventTypes.SUPP_PO_REJECTED, suppPoRejectedHandler);
  eventBus.subscribe(EventTypes.SUPP_DELIVERY_NOTE_RAISED, suppDeliveryNoteRaisedHandler);
  eventBus.subscribe(EventTypes.REQUESTOR_RECEIPT_CONFIRMED, requestorReceiptConfirmedHandler);
  eventBus.subscribe(EventTypes.INVOICE_APPROVED_PO, invoiceApprovedPOHandler);
  eventBus.subscribe(EventTypes.INVOICE_REJECTED_PO, invoiceRejectedPOHandler);
  eventBus.subscribe(EventTypes.INVOICE_MORE_INFO_PO, invoiceMorePOHandler);
  eventBus.subscribe(EventTypes.INVOICE_RESUBMITTED_PO, invoiceResubmittedPOHandler);
  eventBus.subscribe(EventTypes.INVOICE_PAYMENT_RECEIVED_PO, invoicePaymentReceivedPOHandler);
  eventBus.subscribe(EventTypes.INVOICE_PAYMENT_RECEIVED_NONPO, invoicePaymentReceivedNonPOHandler);
  eventBus.subscribe(EventTypes.AUCTION_AWARDED, auctionAwardedHandler);
  eventBus.subscribe(EventTypes.AUCTION_AWARD_REJECTED, auctionAwardRejectedHandler);
  eventBus.subscribe(EventTypes.AUCTION_REGRET, auctionRegretHandler);
  eventBus.subscribe(EventTypes.BID_CREATED, bidCreatedHandler);
  eventBus.subscribe(EventTypes.NEW_BID_PUBLISH, bidPublishedHandler);
  eventBus.subscribe(EventTypes.BID_SUPP_REOPEN, bidReopenHandler);
  eventBus.subscribe(EventTypes.VENDOR_INVITED_TO_BID, vendorInvitedToBidHandler);
  eventBus.subscribe(EventTypes.VENDOR_RESPONSE_SUBMITTED, bidResponseSubmittedHandler);
  eventBus.subscribe(EventTypes.BID_RESPONSE_UPDATED, bidResponseUpdatedHandler);
  eventBus.subscribe(EventTypes.BID_APPROVED, bidApprovedHandler);
  eventBus.subscribe(EventTypes.BID_REJECTED, bidRejectedHandler);
  eventBus.subscribe(EventTypes.BID_CLOSED, bidClosedHandler);
  eventBus.subscribe(EventTypes.TENDER_ENVELOPE_CREATED, tenderEnvelopeCreatedHandler);
  eventBus.subscribe(EventTypes.TENDER_ENVELOPE_OPENED, tenderEnvelopeOpenedHandler);
  eventBus.subscribe(EventTypes.TECHNICAL_SCORER_ASSIGNED, technicalScorerAssignedHandler);
  eventBus.subscribe(EventTypes.TECHNICAL_SCORE_SUBMITTED, technicalScoreSubmittedHandler);
  eventBus.subscribe(EventTypes.TECHNICAL_APPROVER_ASSIGNED, technicalApproverAssignedHandler);
  eventBus.subscribe(EventTypes.TECHNICAL_APPROVED, technicalApprovedHandler);
  eventBus.subscribe(EventTypes.TECHNICAL_REJECTED, technicalRejectedHandler);
  eventBus.subscribe(EventTypes.COMMERCIAL_SCORER_ASSIGNED, commercialScorerAssignedHandler);
  eventBus.subscribe(EventTypes.COMMERCIAL_SCORE_SUBMITTED, commercialScoreSubmittedHandler);
  eventBus.subscribe(EventTypes.COMMERCIAL_APPROVER_ASSIGNED, commercialApproverAssignedHandler);
  eventBus.subscribe(EventTypes.COMMERCIAL_APPROVED, commercialApprovedHandler);
  eventBus.subscribe(EventTypes.COMMERCIAL_REJECTED, commercialRejectedHandler);
  eventBus.subscribe(EventTypes.BID_NEGO_INVITE, negotiationRequestedHandler);
  eventBus.subscribe(EventTypes.NEGOTIATION_RESPONSE_SUBMITTED, negotiationResponseSubmittedHandler);
  eventBus.subscribe(EventTypes.BID_EVALUATION_COMPLETED, bidEvaluationCompletedHandler);
  eventBus.subscribe(EventTypes.AWARD_INITIATED, awardInitiatedHandler);
  eventBus.subscribe(EventTypes.AWARD_APPROVED, awardApprovedHandler);
  eventBus.subscribe(EventTypes.AWARD_REJECTED, awardRejectedHandler);
  eventBus.subscribe(EventTypes.REVIEWER_REQUESTED_MORE_INFO, reviewerRequestedMoreInfoHandler);
  eventBus.subscribe(EventTypes.CONTRACT_REVIEW_ACCEPTED, contractReviewAcceptedHandler);
  eventBus.subscribe(EventTypes.CONTRACT_REVIEW_REJECTED, contractReviewRejectedHandler);
  eventBus.subscribe(EventTypes.VENDOR_CLAUSE_ACCEPTED, vendorClauseAcceptedHandler);
  eventBus.subscribe(EventTypes.CONTRACT_SUBMITTED_FOR_APPROVAL, contractSubmittedForApprovalHandler);
  eventBus.subscribe(EventTypes.PR_CANCEL, prCancelHandler);
  eventBus.subscribe(EventTypes.AUCTION_PUBLISHED, auctionPublishedHandler);
  eventBus.subscribe(EventTypes.REQUEST_DELEGATION, requestDelegationHandler);
  eventBus.subscribe(EventTypes.SUPP_AUCTION_QUOTE_SUBMITTED, suppAuctionQuoteSubmittedHandler);
  eventBus.subscribe(EventTypes.AUCTION_EXTENDED, auctionExtendedHandler);
  eventBus.subscribe(EventTypes.AUCTION_AUTO_EXTEND, auctionAutoExtendHandler);
  for (const key of Object.values(EventTypes.TASK_ASSIGNMENT)) {
    eventBus.subscribe(key, taskAssignmentHandler);
  }

  console.log('[EventBus] All handlers registered successfully.');
}

export { BaseEmailHandler } from './baseHandler';
export { budgetApprovedHandler, budgetRejectedHandler, budgetMoreInfoHandler, forgotPasswordLinkHandler, loginOTPHandler, passwordResetHandler, poApprovalHandler, poApprovedHandler, poRejectedHandler, prApprovedHandler, prRejectedHandler, registerOnBehalfHandler, registrationInviteHandler, taskAssignmentHandler, userCreationHandler, invoiceApprovedNonPOHandler, invoiceRejectedNonPOHandler, invoiceMoreNonPOHandler, changePasswordHandler };

