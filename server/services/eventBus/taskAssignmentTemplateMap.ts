/**
 * Maps wf_instance.process_name to am_aprvl_notification_dtls.event_id
 * (legacy Java TaskAssignmentEvent.Type enum names).
 */
const PROCESS_NAME_TO_TEMPLATE: Record<string, string> = {
  Budget: "BUDGET_APPROVAL",
  "Purchase Request": "PR_APPROVAL",
  "Purchase Order": "PO_APPROVAL",
  Invoice: "INVOICE_APPROVAL",
  "Supplier Registration": "SUPPLIER_REG",
  "Vendor Registration": "SUPPLIER_REG",
  Contract: "CONTRACT_SUBMIT_FOR_APPROVAL",
  Bid: "BIDPUBLISH_APP",
  Auction: "AUCTION_AWARD_APP",
};

export function resolveTaskAssignmentTemplateId(processName: string): string | null {
  const key = (processName || "").trim();
  return PROCESS_NAME_TO_TEMPLATE[key] ?? null;
}
