import { POApprovedSupplierEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/** am_aprvl_notification_dtls.event_id = 'PO_APPROVED' */
class PoApprovedSupplierHandler extends BaseEmailHandler<POApprovedSupplierEvent> {
  constructor() {
    super("PO_APPROVED_SUPPLIER");
  }

  async onEvent(event: POApprovedSupplierEvent): Promise<void> {
    if (!event.supplierEmail?.trim()) {
      console.warn("[PoApprovedHandler] No creator email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: POApprovedSupplierEvent): string {
    return event.supplierEmail.trim();
  }

  async getTemplateParams(event: POApprovedSupplierEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      supplierName: event.poSupplierName,
      poNumber: event.poNumber,
      poDescription: event.poDescription,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const poApprovedSupplierHandler = new PoApprovedSupplierHandler();
