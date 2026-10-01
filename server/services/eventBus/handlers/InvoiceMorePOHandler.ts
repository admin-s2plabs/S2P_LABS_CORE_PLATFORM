import { InvoiceMorePOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies invoice submitter when more info is requested for PO invoice.
 * Event: INVOICE_MORE_INFO_PO
 * Params: user, invoiceNo, description, supplierName, linkUrl
 */
class InvoiceMorePOHandler extends BaseEmailHandler<InvoiceMorePOEvent> {
  constructor() {
    super("INVOICE_MORE_INFO_PO");
  }

  async onEvent(event: InvoiceMorePOEvent): Promise<void> {
    if (!event.submitterEmail?.trim()) {
      console.warn("[InvoiceMorePOHandler] No submitter email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: InvoiceMorePOEvent): string {
    return event.submitterEmail.trim();
  }

  async getTemplateParams(event: InvoiceMorePOEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.submitterName,
      invoiceNo: event.invoiceNo,
      description: event.description,
      supplierName: event.supplierName,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const invoiceMorePOHandler = new InvoiceMorePOHandler();
