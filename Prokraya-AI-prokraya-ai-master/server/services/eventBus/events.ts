import { PgTimestamp } from "drizzle-orm/pg-core";

export interface EventHandler<T extends ProkrayaEvent> {
  onEvent(event: T): Promise<void>;
}

export interface ProkrayaEvent {
  eventType: string;
  eventId?: string;
  timestamp?: Date;
  orgId?: string;
  orgName?: string;
  domain?: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
   contentType?: string; 
  }>;
}

export interface RegistrationInviteEvent extends ProkrayaEvent {
  eventType: 'REGISTRATION_INVITE';
  emailId: string;
  companyName: string;
  invitationId: string;
  procOfficer: string;
  domain?: string;
  companyList?: string;
  country?: string;
  mobileNo?: string;
  countryCode?: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface RegisterOnBehalfInviteEvent extends ProkrayaEvent {
  eventType: 'REGISTER_ONBEHALF_INVITATION';
  emailId: string;
  companyName: string;
  invitationId: string;
  procOfficer: string;
  domain?: string;
  country?: string;
  mobileNo?: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface VendorApprovalEvent extends ProkrayaEvent {
  eventType: 'VENDOR_APPROVAL';
  emailId: string;
  vendorName: string;
  vendorCode: string;
  status: 'approved' | 'rejected';
  approverName: string;
  remarks?: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface VendorRegistrationEvent extends ProkrayaEvent {
  eventType: 'VENDOR_REGISTRATION';
  emailId: string;
  vendorName: string;
  vendorCode?: string;
  registrationDate?: Date;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}
export interface PRCancelEvent extends ProkrayaEvent {
  eventType: 'PR_CANCEL';
  emailId: string;
  user: string;
  prNumber: string;
  status: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface POApprovalEvent extends ProkrayaEvent {
  eventType: 'PO_APPROVAL';
  emailId: string;
  poNumber: string;
  poAmount: number;
  currency: string;
  vendorName: string;
  status: 'approved' | 'rejected' | 'pending';
  approverName: string;
  remarks?: string;
  requesterEmail?: string;
  poDepartment?: string;
  requestorName?: string;
  poDescription?: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface PRApprovalEvent extends ProkrayaEvent {
  eventType: 'PR_APPROVAL';
  emailId: string;
  prNumber: string;
  prTitle: string;
  status: 'approved' | 'rejected' | 'pending';
  approverName: string;
  remarks?: string;
  requesterEmail?: string;
  orgLogoPath?: string;
  emailApprovalLink:string;
}

export interface BidPublishedEvent extends ProkrayaEvent {
  eventType: 'NEW_BID_PUBLISH';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  receiverEmail: string;
  domain?: string;
  supplierName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}
export interface BidReopenEvent extends ProkrayaEvent {
  eventType: 'BID_SUPP_REOPEN';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  receiverEmail: string;
  domain?: string;
  supplierName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface BidAwardedEvent extends ProkrayaEvent {
  eventType: 'BID_AWARDED';
  bidNumber: string;
  bidTitle: string;
  vendorName: string;
  vendorEmail: string;
  awardAmount: number;
  currency: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** Legacy Java BidCancelEvent — bid closed manually (not the same as status Cancelled). */
export interface BidCancelledEvent extends ProkrayaEvent {
  eventType: 'BID_CANCELLED';
  bidId: number;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** Legacy BidModifiedEvent — bid header/scope changed while Published; sync supplier response copies. */
export interface BidModifiedEvent extends ProkrayaEvent {
  eventType: 'BID_MODIFIED';
  bidId: number;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** Legacy BidPublishApproveEvent — bid publish workflow fully approved; bid becomes Published. */
export interface BidPublishApprovedEvent extends ProkrayaEvent {
  eventType: 'BID_PUBLISH_APPROVED';
  bidId: number;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** Legacy BidPublishRejectEvent — bid publish workflow rejected. */
export interface BidPublishRejectedEvent extends ProkrayaEvent {
  eventType: 'BID_PUBLISH_REJECTED';
  bidId: number;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface BudgetAlertEvent extends ProkrayaEvent {
  eventType: 'BUDGET_ALERT';
  budgetName: string;
  budgetId: string;
  utilizationPercent: number;
  alertThreshold: number;
  ownerEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** Fired when workflow completes and budget status becomes Approved (legacy BUDGET_APPROVED templates). */
export interface BudgetApprovedEvent extends ProkrayaEvent {
  eventType: 'BUDGET_APPROVED';
  budgetId: string;
  budgetName: string;
  ownerEmail: string;
  ownerName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface BudgetRejectedEvent extends ProkrayaEvent {
  eventType: 'BUDGET_REJECTED';
  budgetId: string;
  budgetName: string;
  ownerEmail: string;
  ownerName: string;
  rejectComments: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface BudgetMoreInfoEvent extends ProkrayaEvent {
  eventType: 'BUDGET_MORE_INFO';
  budgetId: string;
  budgetName: string;
  ownerEmail: string;
  ownerName: string;
  moreInfoComments: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoiceApprovedNonPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_APPROVED_NONPO';
  invoiceId: string;
  invoiceNo: string;
  description: string;
  supplierName: string;
  submitterEmail: string;
  submitterName: string;
  invoiceAmount: number;
  invoiceDate: string;
  approvedDate: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoiceRejectedNonPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_REJECTED_NONPO';
  invoiceId: string;
  invoiceNo: string;
  description: string;
  supplierName: string;
  invoiceAmount: number;
  invoiceDate: string;
  rejectedDate: string;
  rejectionReason: string;
  submitterEmail: string;
  submitterName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoiceMoreNonPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_MORE_NONPO';
  invoiceId: string;
  invoiceNo: string;
  description: string;
  supplierName: string;
  submitterEmail: string;
  submitterName: string;
  invoiceAmount: number;
  requestedDate: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoiceResubmittedNonPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_RESUBMITTED_NONPO';
  invoiceId: string;
  invoiceNo: string;
  description: string;
  supplierName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoiceApprovedPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_APPROVED_PO';
  invoiceId: string;
  invoiceNo: string;
  description: string;
  supplierName: string;
  submitterEmail: string;
  submitterName: string;
  poNumber: string;
  invoiceAmount: number;
  approvedDate: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoiceRejectedPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_REJECTED_PO';
  invoiceId: string;
  invoiceNo: string;
  description: string;
  supplierName: string;
  reason: string;
  submitterEmail: string;
  submitterName: string;
  poNumber: string;
  invoiceAmount: number;
  rejectedDate: string;
  rejectionReason: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoiceMorePOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_MORE_INFO_PO';
  invoiceId: string;
  invoiceNo: string;
  description: string;
  supplierName: string;
  submitterEmail: string;
  submitterName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;

}

export interface InvoiceResubmittedPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_RESUBMITTED_PO';
  invoiceId: string;
  invoiceNo: string;
  description: string;
  supplierName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoicePaymentReceivedPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_PAYMENT_RECEIVED_PO';
  invoiceNo: string;
  amountPaid: number;
  currency: string;
  paymentDate: string;
  paymentMethod: string;
  receiverEmail: string;
  companyName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface InvoicePaymentReceivedNonPOEvent extends ProkrayaEvent {
  eventType: 'INVOICE_PAYMENT_RECEIVED_NONPO';
  invoiceNo: string;
  amountPaid: number;
  currency: string;
  paymentDate: string;
  paymentMethod: string;
  receiverEmail: string;
  companyName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface WorkflowTaskAssignedEvent extends ProkrayaEvent {
  eventType: 'AUCTION_AWARD_APP';
  taskId: string;
  taskName: string;
  refNumber: string;
  refType: string;
  assigneeEmail: string;
  assigneeName: string;
  dueDate?: Date;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/**
 * Legacy TaskAssignmentEvent: email next approvers using am_aprvl_notification_dtls
 * where event_id matches Java TaskAssignmentEvent.Type (e.g. PR_APPROVAL) or templateEventId override.
 * Published when completeTask returns a non-empty next task id.
 */
export interface TaskAssignmentEvent extends ProkrayaEvent {
  eventType: string;
  /** New workflow task id (ntaskId). */
  taskId: string;
  /** If set, used for template lookup instead of mapping workflow process_name. */
  templateEventId?: string;
  taskSub?: string;
  submittedBy?: string;
  department?: string;
  entityId?: string;
  srmsRefNo?: string;
  processInstanceId?: string;
  invoiceNo?: string;
  description?: string;
  supplierName?: string;
  variables?: Record<string, unknown>;
  orgLogoPath?: string;
  receiverEmail?: string;
  emailApprovalLink?: string;
}

export interface PasswordResetEvent extends ProkrayaEvent {
  eventType: 'RESET_PASSWORD';
  emailId: string;
  userName: string;         // Display name (Dear ${user})
  loginUserName: string;    // Username for login (${userName} in template)
  newPassword?: string;     // The new password (${password} in template)
  loginUrl: string;         // Login URL (${linkUrl} in template)
  resetLinkUrl?: string;    // Reset link URL — when set, used as ${linkUrl} instead of loginUrl
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface UserWelcomeEvent extends ProkrayaEvent {
  eventType: 'USER_WELCOME';
  emailId: string;
  userName: string;
  temporaryPassword?: string;
  loginUrl: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface LoginOTPEvent extends ProkrayaEvent {
  eventType: 'LOGIN_OTP';
  emailId: string;
  userName: string;
  loginUserName: string;
  otp: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface UserCreationEvent extends ProkrayaEvent {
  eventType: 'SRMS_USER_CREATION';
  emailId: string;
  userName: string;
  loginUserName: string;
  resetLinkUrl: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface ForgotPasswordLinkEvent extends ProkrayaEvent {
  eventType: 'FORGOT_PASSWORD_LINK';
  emailId: string;
  userName: string;
  loginUserName: string;
  resetLinkUrl: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** Final PR approval — notify requestor; templates use event_id PR_APPROVED. */
export interface PRApprovedEvent extends ProkrayaEvent {
  eventType: 'PR_APPROVED';
  prNumber: string;
  prDescription: string;
  ownerEmail: string;
  ownerName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** PR rejected — notify requestor; templates use event_id PR_REJECTED. */
export interface PRRejectedEvent extends ProkrayaEvent {
  eventType: 'PR_REJECTED';
  prNumber: string;
  prDescription: string;
  ownerEmail: string;
  ownerName: string;
  rejectComments: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** Final PO approval — notify creator; templates use event_id PO_APPROVED. */
export interface POApprovedEvent extends ProkrayaEvent {
  eventType: 'PO_APPROVED';
  poNumber: string;
  poTitle: string;
  ownerEmail: string;
  ownerName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

/** PO rejected — notify creator; templates use event_id PO_REJECTED. */
export interface PORejectedEvent extends ProkrayaEvent {
  eventType: 'PO_REJECTED';
  poNumber: string;
  poTitle: string;
  ownerEmail: string;
  ownerName: string;
  rejectComments: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SupplierMoreInfo extends ProkrayaEvent {
  eventType: 'SUPP_REGSTR_MOREINFO';
  emailId: string;
  userName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SupplierMoreInfoUpdate extends ProkrayaEvent {
  eventType: 'SUPP_UPDATE_MORE_INFO';
  emailId: string;
  userName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SupplierApproved extends ProkrayaEvent {
  eventType: 'SUPP_REGSTR_APPROVED';
  emailId: string;
  userName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SupplierResubmit extends ProkrayaEvent {
  eventType: 'SUPP_REGSTR_RESUBMIT';
  receiverEmail: string; // The approver/buyer email
  userName: string; // The supplier name being resubmitted
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SupplierRejected extends ProkrayaEvent {
  eventType: 'SUPP_REGSTR_REJECTED';
  emailId: string; // The supplier's email
  userName: string; // The supplier's name
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface RegistrationSubmitEvent extends ProkrayaEvent {
  eventType: 'REGISTRATION_SUBMIT';
  emailId: string; // The supplier's email
  userName: string; // The supplier's name
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SupplierApprInitiatorEvent extends ProkrayaEvent {
  eventType: string;
  receiverEmail: string; // The approver's email
  userName: string;      // The approver's name
  companyName: string;   // The supplier's company name
  orgLogoPath?: string;
  emailApprovalLink?:string;
   attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
}

export interface SuppPoAckEvent extends ProkrayaEvent {
  eventType: 'SUPP_PO_ACK';
  supplierName: string;
  poNumber: string;
  poDescription: string;
  ackDate: string;
  user: string;
  reviewer: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SuppPoRejectedEvent extends ProkrayaEvent {
  eventType: 'SUPP_PO_REJECTED';
  companyName: string;
  poNumber: string;
  poDescription: string;
  rejectedDate: string;
  rejectionReason: string;
  user: string;
  reviewer: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SuppDeliveryNoteRaisedEvent extends ProkrayaEvent {
  eventType: 'SUPP_DELIVERY_NOTE_RAISED';
  requestorName: string;
  companyName: string;
  poNumber: string;
  deliveryNoteNumber: string;
  deliveryNoteDescription: string;
  expectedDeliveryDate: string;
  date: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface RequestorReceiptConfirmedEvent extends ProkrayaEvent {
  eventType: 'REQUESTOR_RECEIPT_CONFIRMED';
  companyName: string;
  requestorName: string;
  poNumber: string;
  deliveryNoteNumber: string;
  deliveryNoteDescription: string;
  receiptNumber: string;
  grnDate: string;
  date: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface ChangePasswordEvent extends ProkrayaEvent {
  eventType: 'PROFILE_CHANGE_PASSWORD';
  emailId: string;
  userName: string;
  loginUserName: string;
  loginUrl: string;
  date: string;
  time: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface POApprovedSupplierEvent extends ProkrayaEvent {
  eventType: 'PO_APPROVED_SUPPLIER';
  supplierEmail: string;
  poSupplierName: string;
  poNumber: string;
  poDescription: string;
  orgName: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export type AllEvents =
  | RegistrationInviteEvent
  | RegisterOnBehalfInviteEvent
  | VendorApprovalEvent
  | VendorRegistrationEvent
  | PRCancelEvent
  | POApprovalEvent
  | PRApprovalEvent
  | BidPublishedEvent
  | BidReopenEvent
  | BidAwardedEvent
  | BidCancelledEvent
  | BidModifiedEvent
  | BidPublishApprovedEvent
  | BidPublishRejectedEvent
  | BidEvaluationCompletedEvent
  | BudgetAlertEvent
  | BudgetApprovedEvent
  | WorkflowTaskAssignedEvent
  | TaskAssignmentEvent
  | PRApprovedEvent
  | PRRejectedEvent
  | POApprovedEvent
  | PORejectedEvent
  | BudgetRejectedEvent
  | BudgetMoreInfoEvent
  | PasswordResetEvent
  | UserCreationEvent
  | ForgotPasswordLinkEvent
  | SupplierMoreInfo
  | SupplierMoreInfoUpdate
  | SupplierApproved
  | SupplierResubmit
  | SupplierRejected
  | RegistrationSubmitEvent
  | SupplierApprInitiatorEvent
  | SuppPoAckEvent
  | SuppPoRejectedEvent
  | SuppDeliveryNoteRaisedEvent
  | RequestorReceiptConfirmedEvent
  | InvoiceApprovedPOEvent
  | InvoiceRejectedPOEvent
  | InvoiceMorePOEvent
  | InvoiceResubmittedPOEvent
  | InvoicePaymentReceivedPOEvent
  | InvoicePaymentReceivedNonPOEvent
  | InvoiceApprovedNonPOEvent
  | InvoiceRejectedNonPOEvent
  | InvoiceMoreNonPOEvent
  | InvoiceResubmittedNonPOEvent
  | AuctionPublishedEvent
  | SuppAuctionQuoteSubmittedEvent
  | AuctionExtendedEvent
  | BidDeleteRequestedEvent
  | BidDeleteApprovedEvent
  | ProxyBidPlacedEvent
  | AuctionEndingSoonEvent
  | AuctionClosedEvent
  | AuctionAwardedEvent
  | AuctionRegretEvent
  | BidCreatedEvent
  | BidResponseSubmittedEvent
  | BidResponseUpdatedEvent
  | BidApprovedEvent
  | BidRejectedEvent
  | BidClosedEvent
  | TenderEnvelopeCreatedEvent
  | TenderEnvelopeOpenedEvent
  | TechnicalScorerAssignedEvent
  | TechnicalScoreSubmittedEvent
  | TechnicalApproverAssignedEvent
  | TechnicalApprovedEvent
  | TechnicalRejectedEvent
  | CommercialScorerAssignedEvent
  | CommercialScoreSubmittedEvent
  | CommercialApproverAssignedEvent
  | CommercialApprovedEvent
  | CommercialRejectedEvent
  | NegotiationRequestedEvent
  | NegotiationResponseSubmittedEvent
  | BidPublishEvent
  | AwardInitiatedEvent
  | AwardApprovedEvent
  | AwardRejectedEvent
  | VendorInvitedToBidEvent
  | ReviewerRequestedMoreInfoEvent
  | ContractReviewAcceptedEvent
  | ContractReviewRejectedEvent
  | VendorClauseAcceptedEvent
  | ContractSubmittedForApprovalEvent
  | ChangePasswordEvent
  | POApprovedSupplierEvent
  | ContactUsEvent
  |MakeRightChoiceEvent
  |CarrerEvent
  |RequestDelegationEvent
  |AuctionAwardRejectedEvent
  |AuctionAutoExtendEvent
  |CarrerEvent;
  
export const EventTypes = {
  REQUEST_DELEGATION: 'REQUEST_DELEGATION',
  PROFILE_CHANGE_PASSWORD: 'PROFILE_CHANGE_PASSWORD',
  LOGIN_OTP: 'LOGIN_OTP',
  REGISTRATION_INVITE: 'REGISTRATION_INVITE',
  REGISTER_ONBEHALF_INVITATION: 'REGISTER_ONBEHALF_INVITATION',
  VENDOR_APPROVAL: 'VENDOR_APPROVAL',
  VENDOR_REGISTRATION: 'VENDOR_REGISTRATION',
  PO_APPROVAL: 'PO_APPROVAL',
  NEW_BID_PUBLISH: 'NEW_BID_PUBLISH',
  BID_SUPP_REOPEN:"BID_SUPP_REOPEN",
  BID_AWARDED: 'BID_AWARDED',
  BID_CANCELLED: 'BID_CANCELLED',
  BID_MODIFIED: 'BID_MODIFIED',
  BID_PUBLISH_APPROVED: 'BID_PUBLISH_APPROVED',
  BID_PUBLISH_REJECTED: 'BID_PUBLISH_REJECTED',
  BUDGET_ALERT: 'BUDGET_ALERT',
  BUDGET_APPROVED: 'BUDGET_APPROVED',
  BUDGET_REJECTED: 'BUDGET_REJECTED',
  BUDGET_MORE_INFO: 'BUDGET_MORE_INFO',
  BUDGET_APPROVAL: 'BUDGET_APPROVAL',
  BUDGET_RESUBMIT: 'BUDGET_RESUBMIT',
  RESET_PASSWORD: 'RESET_PASSWORD',
  USER_WELCOME: 'USER_WELCOME',
  SRMS_USER_CREATION: 'SRMS_USER_CREATION',
  FORGOT_PASSWORD_LINK: 'FORGOT_PASSWORD_LINK',
  PR_APPROVED: 'PR_APPROVED',
  PR_REJECTED: 'PR_REJECTED',
  PR_CANCEL: 'PR_CANCEL',
  PO_APPROVED: 'PO_APPROVED',
  PO_REJECTED: 'PO_REJECTED',
  PO_APPROVED_SUPPLIER: 'PO_APPROVED_SUPPLIER',
  SUPP_UPDATE_MORE_INFO:'SUPP_UPDATE_MORE_INFO',
  SUPP_REGSTR_MOREINFO:'SUPP_REGSTR_MOREINFO',
  SUPP_REGSTR_APPROVED:'SUPP_REGSTR_APPROVED',
  SUPP_REGSTR_RESUBMIT:'SUPP_REGSTR_RESUBMIT',
  SUPP_REGSTR_REJECTED:'SUPP_REGSTR_REJECTED',
  REGISTRATION_SUBMIT:'REGISTRATION_SUBMIT',
  SUPP_APPR_INITIATOR:'SUPP_APPR_INITIATOR',
  INVOICE_APPROVAL_NONPO: 'INVOICE_APPROVAL_NONPO',
  INVOICE_APPROVED_NONPO: 'INVOICE_APPROVED_NONPO',
  INVOICE_REJECTED_NONPO: 'INVOICE_REJECTED_NONPO',
  INVOICE_MORE_NONPO: 'INVOICE_MORE_NONPO',
  INVOICE_RESUBMITTED_NONPO: 'INVOICE_RESUBMITTED_NONPO',
  INVOICE_APPROVAL: 'INVOICE_APPROVAL',
  INVOICE_APPROVED_PO: 'INVOICE_APPROVED_PO',
  INVOICE_REJECTED_PO: 'INVOICE_REJECTED_PO',
  INVOICE_RESUBMITTED_PO: 'INVOICE_RESUBMITTED_PO',
  INVOICE_MORE_INFO_PO: 'INVOICE_MORE_INFO_PO',
  INVOICE_PAYMENT_RECEIVED_PO: 'INVOICE_PAYMENT_RECEIVED_PO',
  INVOICE_PAYMENT_RECEIVED_NONPO: 'INVOICE_PAYMENT_RECEIVED_NONPO',
  PR_RESUBMITTED: 'PR_RESUBMITTED',
  PR_MORE_INFO: 'PR_MORE_INFO',
  PO_RESUBMITTED: 'PO_RESUBMITTED',
  PO_MORE_INFO: 'PO_MORE_INFO',
  SUPP_PO_ACK: 'SUPP_PO_ACK',
  SUPP_PO_REJECTED: 'SUPP_PO_REJECTED',
  SUPP_DELIVERY_NOTE_RAISED: 'SUPP_DELIVERY_NOTE_RAISED',
  REQUESTOR_RECEIPT_CONFIRMED: 'REQUESTOR_RECEIPT_CONFIRMED',
  AUCTION_PUBLISHED: 'AUCTION_PUBLISHED',
  AUCTION_AWARD_REJECTED: "AUCTION_AWARD_REJECTED",
  VENDOR_QUOTE_SUBMITTED: 'VENDOR_QUOTE_SUBMITTED',
  SUPP_AUCTION_QUOTE_SUBMITTED: 'SUPP_AUCTION_QUOTE_SUBMITTED',
  AUCTION_EXTENDED: 'AUCTION_EXTENDED',
  AUCTION_AUTO_EXTEND:'AUCTION_AUTO_EXTEND',
  BID_DELETE_REQUESTED: 'BID_DELETE_REQUESTED',
  BID_DELETE_APPROVED: 'BID_DELETE_APPROVED',
  PROXY_BID_PLACED: 'PROXY_BID_PLACED',
  AUCTION_ENDING_SOON: 'AUCTION_ENDING_SOON',
  AUCTION_CLOSED: 'AUCTION_CLOSED',
  AUCTION_AWARDED: 'AUCTION_AWARDED',
  AUCTION_REGRET: 'AUCTION_REGRET',
  BID_CREATED: 'BID_CREATED',
  VENDOR_INVITED_TO_BID: 'VENDOR_INVITED_TO_BID',
  VENDOR_RESPONSE_SUBMITTED: 'VENDOR_RESPONSE_SUBMITTED',
  BID_RESPONSE_UPDATED: 'BID_RESPONSE_UPDATED',
  BID_APPROVED: 'BID_APPROVED',
  BID_REJECTED: 'BID_REJECTED',
  BID_CLOSED: 'BID_CLOSED',
  TENDER_ENVELOPE_CREATED: 'TENDER_ENVELOPE_CREATED',
  TENDER_ENVELOPE_OPENED: 'TENDER_ENVELOPE_OPENED',
  TECHNICAL_SCORER_ASSIGNED: 'TECHNICAL_SCORER_ASSIGNED',
  TECHNICAL_SCORE_SUBMITTED: 'TECHNICAL_SCORE_SUBMITTED',
  TECHNICAL_APPROVER_ASSIGNED: 'TECHNICAL_APPROVER_ASSIGNED',
  TECHNICAL_APPROVED: 'TECHNICAL_APPROVED',
  TECHNICAL_REJECTED: 'TECHNICAL_REJECTED',
  COMMERCIAL_SCORER_ASSIGNED: 'COMMERCIAL_SCORER_ASSIGNED',
  COMMERCIAL_SCORE_SUBMITTED: 'COMMERCIAL_SCORE_SUBMITTED',
  COMMERCIAL_APPROVER_ASSIGNED: 'COMMERCIAL_APPROVER_ASSIGNED',
  COMMERCIAL_APPROVED: 'COMMERCIAL_APPROVED',
  COMMERCIAL_REJECTED: 'COMMERCIAL_REJECTED',
  BID_EVALUATION_COMPLETED:'BID_EVALUATION_COMPLETED',
  BID_NEGO_INVITE: 'BID_NEGO_INVITE',
  NEGOTIATION_RESPONSE_SUBMITTED: 'NEGOTIATION_RESPONSE_SUBMITTED',
  AWARD_INITIATED: 'AWARD_INITIATED',
  AWARD_APPROVED: 'AWARD_APPROVED',
  AWARD_REJECTED: 'AWARD_REJECTED',
  REVIEWER_REQUESTED_MORE_INFO: 'REVIEWER_REQUESTED_MORE_INFO',
  CONTRACT_REVIEW_ACCEPTED: 'CONTRACT_REVIEW_ACCEPTED',
  CONTRACT_REVIEW_REJECTED: 'CONTRACT_REVIEW_REJECTED',
  VENDOR_CLAUSE_ACCEPTED: 'VENDOR_CLAUSE_ACCEPTED',
  CONTRACT_SUBMITTED_FOR_APPROVAL: 'CONTRACT_SUBMITTED_FOR_APPROVAL',
  TASK_ASSIGNMENT: {
    INVOICE_RESUBMITTED_NONPO: 'INVOICE_RESUBMITTED_NONPO',
    INVOICE_RESUBMITTED_PO: 'INVOICE_RESUBMITTED_PO',
    BUDGET_APPROVAL: 'BUDGET_APPROVAL',
    BUDGET_RESUBMIT: 'BUDGET_RESUBMIT',
    PR_APPROVAL: 'PR_APPROVAL',
    PR_RESUBMIT: 'PR_RESUBMIT',
    PR_MORE_INFO: 'PR_MORE_INFO',
    PO_APPROVAL: 'PO_APPROVAL',
    PO_RESUBMIT: 'PO_RESUBMIT',
    PO_MORE_INFO: 'PO_MORE_INFO',
    PO_APPROVED_SUPPLIER: 'PO_APPROVED_SUPPLIER',
    INVOICE_APPROVAL: 'INVOICE_APPROVAL',
    SUPPLIER_REG: 'SUPPLIER_REG',
    CONTRACT_SUBMIT_FOR_APPROVAL: 'CONTRACT_SUBMIT_FOR_APPROVAL',
    BIDPUBLISH_APP: 'BIDPUBLISH_APP',
    AUCTION_AWARD_APP: 'AUCTION_AWARD_APP',
    CONTACT_US_SALES:'CONTACT_US_SALES',
    CONTACT_US_SUPPLIER:'CONTACT_US_SUPPLIER',
    CONTACT_US_BUYER:'CONTACT_US_BUYER'
  },
} as const;

export interface AuctionPublishedEvent extends ProkrayaEvent {
  eventType: 'AUCTION_PUBLISHED';
  vendorName: string;
  auctionId: string;
  auctionName: string;
  auctionType: string;
  startTime: string;
  endTime: string;
  receiverEmail: string;
  ccEmail?: string | string[];
  domain: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface SuppAuctionQuoteSubmittedEvent extends ProkrayaEvent {
  eventType: 'SUPP_AUCTION_QUOTE_SUBMITTED';
  userName: string;
  auctionId: string;
  auctionType: string;
  vendorName: string;
  auctionName:string;
  domain: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface AuctionExtendedEvent extends ProkrayaEvent {
  eventType: 'AUCTION_EXTENDED';
  vendorName: string;
  auctionId: string;
  itemName:string;
  newEndTime: string;
  receiverEmail: string;
  orgLogoPath?: string;
}

export interface AuctionAutoExtendEvent extends ProkrayaEvent {
  eventType: 'AUCTION_AUTO_EXTEND';
  vendorName: string;
  auctionId: string;
  itemName:string;
  auctionTimeExtend:number;
  units:string,
  newEndTime: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface BidDeleteRequestedEvent extends ProkrayaEvent {
  eventType: 'BID_DELETE_REQUESTED';
  userName: string;
  auctionId: string;
  vendorName: string;
  amount: string;
  linkUrl: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface BidDeleteApprovedEvent extends ProkrayaEvent {
  eventType: 'BID_DELETE_APPROVED';
  vendorName: string;
  auctionId: string;
  amount: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface ProxyBidPlacedEvent extends ProkrayaEvent {
  eventType: 'PROXY_BID_PLACED';
  vendorName: string;
  auctionId: string;
  amount: string;
  linkUrl: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface AuctionEndingSoonEvent extends ProkrayaEvent {
  eventType: 'AUCTION_ENDING_SOON';
  vendorName: string;
  auctionId: string;
  endTime: string;
  linkUrl: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface AuctionClosedEvent extends ProkrayaEvent {
  eventType: 'AUCTION_CLOSED';
  vendorName: string;
  auctionId: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface AuctionAwardedEvent extends ProkrayaEvent {
  eventType: 'AUCTION_AWARDED';
  vendorName: string;
  auctionId: string;
  amount: string;
  receiverEmail: string;
  ccEmail?: string | string[];
  domain: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface AuctionRegretEvent extends ProkrayaEvent {
  eventType: 'AUCTION_REGRET';
  vendorName: string;
  receiverEmail: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface AuctionAwardRejectedEvent extends ProkrayaEvent {
  eventType: 'AUCTION_AWARD_REJECTED';
  vendorName: string;
  auctionId: string;
  auctionName: string;
  createdBy:string;
  approverName: string;
  receiverEmail: string;
  orgLogoPath?: string;
}

export interface BidCreatedEvent extends ProkrayaEvent {
  eventType: 'BID_CREATED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface VendorInvitedToBidEvent extends ProkrayaEvent {
  eventType: 'VENDOR_INVITED_TO_BID';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  vendorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface BidResponseSubmittedEvent extends ProkrayaEvent {
  eventType: 'VENDOR_RESPONSE_SUBMITTED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  vendorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface BidResponseUpdatedEvent extends ProkrayaEvent {
  eventType: 'BID_RESPONSE_UPDATED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  vendorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface BidApprovedEvent extends ProkrayaEvent {
  eventType: 'BID_APPROVED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface BidRejectedEvent extends ProkrayaEvent {
  eventType: 'BID_REJECTED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  requestorName: string;
  receiverEmail: string;
  reason: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface BidClosedEvent extends ProkrayaEvent {
  eventType: 'BID_CLOSED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  vendorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface TenderEnvelopeCreatedEvent extends ProkrayaEvent {
  eventType: 'TENDER_ENVELOPE_CREATED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  memberName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface TenderEnvelopeOpenedEvent extends ProkrayaEvent {
  eventType: 'TENDER_ENVELOPE_OPENED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface TechnicalScorerAssignedEvent extends ProkrayaEvent {
  eventType: 'TECHNICAL_SCORER_ASSIGNED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  scorerName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface TechnicalScoreSubmittedEvent extends ProkrayaEvent {
  eventType: 'TECHNICAL_SCORE_SUBMITTED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  scorerName: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface TechnicalApproverAssignedEvent extends ProkrayaEvent {
  eventType: 'TECHNICAL_APPROVER_ASSIGNED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  approverName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface TechnicalApprovedEvent extends ProkrayaEvent {
  eventType: 'TECHNICAL_APPROVED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface TechnicalRejectedEvent extends ProkrayaEvent {
  eventType: 'TECHNICAL_REJECTED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface CommercialScorerAssignedEvent extends ProkrayaEvent {
  eventType: 'COMMERCIAL_SCORER_ASSIGNED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  scorerName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface CommercialScoreSubmittedEvent extends ProkrayaEvent {
  eventType: 'COMMERCIAL_SCORE_SUBMITTED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  scorerName: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface CommercialApproverAssignedEvent extends ProkrayaEvent {
  eventType: 'COMMERCIAL_APPROVER_ASSIGNED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  approverName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface CommercialApprovedEvent extends ProkrayaEvent {
  eventType: 'COMMERCIAL_APPROVED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface CommercialRejectedEvent extends ProkrayaEvent {
  eventType: 'COMMERCIAL_REJECTED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface NegotiationRequestedEvent extends ProkrayaEvent {
  eventType: 'BID_NEGO_INVITE';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  vendorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface NegotiationResponseSubmittedEvent extends ProkrayaEvent {
  eventType: 'NEGOTIATION_RESPONSE_SUBMITTED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  vendorName: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface BidPublishEvent extends ProkrayaEvent {
  eventType: 'BIDPUBLISH_APP';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface BidEvaluationCompletedEvent extends ProkrayaEvent {
  eventType: 'BID_EVALUATION_COMPLETED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  approverName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface AwardInitiatedEvent extends ProkrayaEvent {
  eventType: 'AWARD_INITIATED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  memberName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
  emailApprovalLink?: string;
}

export interface AwardApprovedEvent extends ProkrayaEvent {
  eventType: 'AWARD_APPROVED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  buyerName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface AwardRejectedEvent extends ProkrayaEvent {
  eventType: 'AWARD_REJECTED';
  bidId: string;
  bidNumber: string;
  bidTitle: string;
  buyerName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface ReviewerRequestedMoreInfoEvent extends ProkrayaEvent {
  eventType: 'REVIEWER_REQUESTED_MORE_INFO';
  contractId: string;
  contractTitle: string;
  contractRefNo: string;
  reviewerName: string;
  requestorName: string;
  receiverEmail: string;
  comments?: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface ContractReviewAcceptedEvent extends ProkrayaEvent {
  eventType: 'CONTRACT_REVIEW_ACCEPTED';
  contractId: string;
  contractTitle: string;
  contractRefNo: string;
  reviewerName: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface ContractReviewRejectedEvent extends ProkrayaEvent {
  eventType: 'CONTRACT_REVIEW_REJECTED';
  contractId: string;
  contractTitle: string;
  contractRefNo: string;
  reviewerName: string;
  requestorName: string;
  receiverEmail: string;
  comments?: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface VendorClauseAcceptedEvent extends ProkrayaEvent {
  eventType: 'VENDOR_CLAUSE_ACCEPTED';
  contractId: string;
  contractTitle: string;
  contractRefNo: string;
  vendorName: string;
  requestorName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface ContractSubmittedForApprovalEvent extends ProkrayaEvent {
  eventType: 'CONTRACT_SUBMITTED_FOR_APPROVAL';
  contractId: string;
  contractTitle: string;
  contractRefNo: string;
  requestorName: string;
  approverName: string;
  receiverEmail: string;
  domain?: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface ContactUsEvent extends ProkrayaEvent {
  eventType: string;
  emailId: string;
  userName: string;
  loginUserName: string;
  message: string;
  fullName: string;
  mobileNumber: string;
  companyName: string;
  contactReason: string;
  user: string;
  orgLogoPath?: string;
emailApprovalLink?:string;
}

export interface MakeRightChoiceEvent extends ProkrayaEvent 
{
  eventType: string;
  timestamp: Date;
  companyName: string;
  contactName: string;
  emailId: string;
  mobileNumber: string;
  message: string;
  userName: string;
  loginUserName: string;
  user: string;
emailApprovalLink?:string;
}

export interface CarrerEvent extends ProkrayaEvent 
{
  eventType: string;
  user: String;
  timestamp: Date;
  contactName: string;
  emailId: string;
  mobileNumber: string;
  position: string;
  message: string;
emailApprovalLink?:string;
}

export interface RequestDelegationEvent extends ProkrayaEvent {
  eventType: 'REQUEST_DELEGATION';
  module: string;
  entityId: string;
  delegatedEmail: string;
  originalEmail: string;
  user: string;
  orgLogoPath?: string;
  actionByUser: string;
emailApprovalLink?:string;
}