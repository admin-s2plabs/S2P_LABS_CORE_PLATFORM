import { InvoiceApprovedNonPOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies invoice submitter when Non-PO invoice is approved.
 * Event: INVOICE_APPROVED_NONPO
 * Params: user, invoiceNo, description, supplierName, linkUrl
 */
class InvoiceApprovedNonPOHandler extends BaseEmailHandler<InvoiceApprovedNonPOEvent> {
  constructor() {
    super("INVOICE_APPROVED_NONPO");
  }

  async onEvent(event: InvoiceApprovedNonPOEvent): Promise<void> {
    if (!event.submitterEmail?.trim()) {
      console.warn("[InvoiceApprovedNonPOHandler] No submitter email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: InvoiceApprovedNonPOEvent): string {
    return event.submitterEmail.trim();
  }

  async getTemplateParams(event: InvoiceApprovedNonPOEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.submitterName,
      invoiceNumber: event.invoiceNo,
      invoiceDescription: event.description,
      invoiceAmount: event.invoiceAmount,
      invoiceDate: event.invoiceDate,
      supplierName: event.supplierName,
      approvedDate: event.approvedDate,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const invoiceApprovedNonPOHandler = new InvoiceApprovedNonPOHandler();
