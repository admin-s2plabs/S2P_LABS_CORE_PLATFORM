import { InvoiceRejectedPOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies invoice submitter when PO invoice is rejected.
 * Event: INVOICE_REJECTED_PO
 * Params: user, invoiceNo, description, supplierName, reason, linkUrl
 */
class InvoiceRejectedPOHandler extends BaseEmailHandler<InvoiceRejectedPOEvent> {
  constructor() {
    super("INVOICE_REJECTED_PO");
  }

  async onEvent(event: InvoiceRejectedPOEvent): Promise<void> {
    if (!event.submitterEmail?.trim()) {
      console.warn("[InvoiceRejectedPOHandler] No submitter email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: InvoiceRejectedPOEvent): string {
    return event.submitterEmail.trim();
  }

  async getTemplateParams(event: InvoiceRejectedPOEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.submitterName,
      invoiceNumber: event.invoiceNo,
      invoiceAmount: event.invoiceAmount,
      poNumber: event.poNumber,
      rejectedDate: event.rejectedDate,
      rejectionReason: event.rejectionReason,
      description: event.description,
      supplierName: event.supplierName,
      reason: event.reason,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const invoiceRejectedPOHandler = new InvoiceRejectedPOHandler();
