import { InvoiceRejectedNonPOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies invoice submitter when Non-PO invoice is rejected.
 * Event: INVOICE_REJECTED_NONPO
 * Params: user, invoiceNo, description, supplierName, reason, linkUrl
 */
class InvoiceRejectedNonPOHandler extends BaseEmailHandler<InvoiceRejectedNonPOEvent> {
  constructor() {
    super("INVOICE_REJECTED_NONPO");
  }

  async onEvent(event: InvoiceRejectedNonPOEvent): Promise<void> {
    if (!event.submitterEmail?.trim()) {
      console.warn("[InvoiceRejectedNonPOHandler] No submitter email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: InvoiceRejectedNonPOEvent): string {
    return event.submitterEmail.trim();
  }

  async getTemplateParams(event: InvoiceRejectedNonPOEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.submitterName,
      invoiceNumber: event.invoiceNo,
      invoiceDescription: event.description,
      invoiceAmount: event.invoiceAmount,
      invoiceDate: event.invoiceDate,
      supplierName: event.supplierName,
      rejectedDate: event.rejectedDate,
      rejectionReason: event.rejectionReason,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      orgLogoPath: event.orgLogoPath || '',

    };
  }
}

export const invoiceRejectedNonPOHandler = new InvoiceRejectedNonPOHandler();