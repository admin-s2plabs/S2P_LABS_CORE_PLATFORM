/**
 * Supplier-facing notification event IDs and enablement checks.
 * Emails to suppliers are gated by am_property_mst.SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED.
 */

/** Event IDs where the primary recipient is a vendor/supplier (external). */
export const SUPPLIER_EMAIL_EVENT_IDS = new Set([
  // Registration & vendor onboarding
  "SUPP_INVITATION",
  "REGISTRATION_INVITE",
  "REGISTER_ONBEHALF_INVITATION",
  "VENDOR_REGISTRATION",
  "VENDOR_APPROVAL",
  "REGISTRATION_SUBMIT",
  "SUPP_REGSTR_MOREINFO",
  "SUPP_UPDATE_MORE_INFO",
  "SUPP_REGSTR_APPROVED",
  "SUPP_REGSTR_REJECTED",
  // Task assignment templates for supplier workflows
  "SUPPLIER_REG",
  "SUPPLIER_UPD",
  // PO / delivery
  "SUPP_PO_ACK",
  "SUPP_PO_REJECTED",
  "SUPP_DELIVERY_NOTE_RAISED",
  "REQUESTOR_RECEIPT_CONFIRMED",
  // Bids & tenders (vendor recipients)
  "VENDOR_INVITED_TO_BID",
  "BID_PUBLISHED",
  "VENDOR_RESPONSE_SUBMITTED",
  "BID_RESPONSE_SUBMITTED",
  "BID_RESPONSE_UPDATED",
  "BID_AWARDED",
  "BID_CANCELLED",
  "BID_MODIFIED",
  "BID_CLOSED",
  "BID_CREATED",
  "NEGOTIATION_REQUESTED",
  "NEGOTIATION_RESPONSE_SUBMITTED",
  // Auctions (vendor participants)
  "AUCTION_PUBLISHED",
  "VENDOR_QUOTE_SUBMITTED",
  "AUCTION_EXTENDED",
  "AUCTION_ENDING_SOON",
  "AUCTION_CLOSED",
  "AUCTION_AWARDED",
  "AUCTION_REGRET",
  "PROXY_BID_PLACED",
  // Invoices (supplier notifications)
  "INVOICE_APPROVED_PO",
  "INVOICE_REJECTED_PO",
  "INVOICE_MORE_INFO_PO",
  "INVOICE_RESUBMITTED_PO",
  "INVOICE_PAYMENT_RECEIVED_PO",
  "INVOICE_APPROVED_NONPO",
  "INVOICE_REJECTED_NONPO",
  "INVOICE_MORE_NONPO",
  "INVOICE_PAYMENT_RECEIVED_NONPO",
  // Contracts (supplier / vendor reviewer)
  "PUBLISH_CONTRACT_SUPPLIER",
  "CONTRACT_NEGOTIATION_SUPPLIER",
  "REVIEWER_REQUESTED_MORE_INFO",
  "CONTRACT_REVIEW_ACCEPTED",
  "CONTRACT_REVIEW_REJECTED",
  "VENDOR_CLAUSE_ACCEPTED",
]);

export function isSupplierFacingEventId(eventId: string | undefined | null): boolean {
  if (!eventId?.trim()) return false;
  const normalized = eventId.trim().toUpperCase();
  if (SUPPLIER_EMAIL_EVENT_IDS.has(normalized)) return true;
  // Prefix match for SUPP_* vendor events (exclude internal approver events)
  if (normalized.startsWith("SUPP_")) {
    const internalOnly = new Set(["SUPP_APPR_INITIATOR", "SUPP_REGSTR_RESUBMIT"]);
    return !internalOnly.has(normalized);
  }
  if (normalized.startsWith("VENDOR_")) return true;
  if (normalized.startsWith("AUCTION_")) return true;
  return false;
}

export function isSupplierFacingTemplate(template: {
  event_id?: string;
  to_role?: string;
}): boolean {
  const role = (template.to_role || "").trim();
  if (/supplier|vendor/i.test(role)) return true;
  return isSupplierFacingEventId(template.event_id);
}

export async function areSupplierEmailNotificationsEnabled(): Promise<boolean> {
  const { propertiesService } = await import("./propertiesService");
  const value = await propertiesService.get("SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED", "true");
  return value !== "false";
}
