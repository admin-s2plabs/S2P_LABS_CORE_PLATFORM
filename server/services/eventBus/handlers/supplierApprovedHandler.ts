import { SupplierApproved } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Sends an "Approved" email to the supplier
 * using am_aprvl_notification_dtls rows where event_id = 'SUPP_REGSTR_APPROVED'.
 * Template params: user (company name), linkUrl (app root).
 */
class SupplierApprovedHandler extends BaseEmailHandler<SupplierApproved> {
  constructor() {
    super("SUPP_REGSTR_APPROVED");
  }

  async onEvent(event: SupplierApproved): Promise<void> {
    if (!event.emailId?.trim()) {
      console.warn("[SupplierApprovedHandler] No supplier email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: SupplierApproved): string {
    return event.emailId.trim();
  }

  async getTemplateParams(event: SupplierApproved): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.userName,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const supplierApprovedHandler = new SupplierApprovedHandler();
