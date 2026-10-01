import { InvoiceMoreNonPOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies invoice submitter when more info is required for Non-PO invoice.
 * Event: INVOICE_MORE_NONPO
 * Params: user, invoiceNo, description, supplierName, linkUrl
 */
class InvoiceMoreNonPOHandler extends BaseEmailHandler<InvoiceMoreNonPOEvent> {
  constructor() {
    super("INVOICE_MORE_NONPO");
  }

  async onEvent(event: InvoiceMoreNonPOEvent): Promise<void> {
    if (!event.submitterEmail?.trim()) {
      console.warn("[InvoiceMoreNonPOHandler] No submitter email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: InvoiceMoreNonPOEvent): string {
    return event.submitterEmail.trim();
  }

  async getTemplateParams(event: InvoiceMoreNonPOEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.submitterName,
      invoiceNumber: event.invoiceNo,
      invoiceAmount: event.invoiceAmount,
      requestedDate: event.requestedDate,
      description: event.description,
      supplierName: event.supplierName,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const invoiceMoreNonPOHandler = new InvoiceMoreNonPOHandler();
