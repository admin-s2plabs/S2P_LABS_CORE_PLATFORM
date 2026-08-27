import { InvoiceApprovedPOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies invoice submitter when PO invoice is approved.
 * Event: INVOICE_APPROVED_PO
 * Params: user, invoiceNo, description, supplierName, linkUrl
 */
class InvoiceApprovedPOHandler extends BaseEmailHandler<InvoiceApprovedPOEvent> {
  constructor() {
    super("INVOICE_APPROVED_PO");
  }

  async onEvent(event: InvoiceApprovedPOEvent): Promise<void> {
    if (!event.submitterEmail?.trim()) {
      console.warn("[InvoiceApprovedPOHandler] No submitter email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: InvoiceApprovedPOEvent): string {
    return event.submitterEmail.trim();
  }

  async getTemplateParams(event: InvoiceApprovedPOEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.submitterName,
      poNumber: event.poNumber,
      invoiceNumber: event.invoiceNo,
      invoiceAmount: event.invoiceAmount,
      approvedDate: event.approvedDate,
      description: event.description,
      supplierName: event.supplierName,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const invoiceApprovedPOHandler = new InvoiceApprovedPOHandler();
