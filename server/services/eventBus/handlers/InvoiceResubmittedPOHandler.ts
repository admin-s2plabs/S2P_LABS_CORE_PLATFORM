import { InvoiceResubmittedPOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies next approvers when PO invoice is resubmitted.
 * Event: INVOICE_RESUBMITTED_PO
 * This usually triggers a TaskAssignmentEvent instead if handled by publishTaskAssignmentEvent.
 */
class InvoiceResubmittedPOHandler extends BaseEmailHandler<InvoiceResubmittedPOEvent> {
  constructor() {
    super("INVOICE_RESUBMITTED_PO");
  }

  getRecipients(event: InvoiceResubmittedPOEvent): string {
    // This handler might be redundant if publishTaskAssignmentEvent is used, 
    // but we'll implement it for consistency.
    return ""; 
  }

  async getTemplateParams(event: InvoiceResubmittedPOEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      invoiceNo: event.invoiceNo,
      description: event.description,
      supplierName: event.supplierName,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const invoiceResubmittedPOHandler = new InvoiceResubmittedPOHandler();
