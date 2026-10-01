import { SupplierMoreInfoUpdate } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Sends a "More Info Required" email to the supplier (profile update flow)
 * using am_aprvl_notification_dtls rows where event_id = 'SUPP_UPDATE_MORE_INFO'.
 * Template params: user (company name), linkUrl (app root).
 */
class SupplierMoreInfoUpdateHandler extends BaseEmailHandler<SupplierMoreInfoUpdate> {
  constructor() {
    super("SUPP_UPDATE_MORE_INFO");
  }

  async onEvent(event: SupplierMoreInfoUpdate): Promise<void> {
    if (!event.emailId?.trim()) {
      console.warn("[SupplierMoreInfoUpdateHandler] No supplier email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: SupplierMoreInfoUpdate): string {
    return event.emailId.trim();
  }

  async getTemplateParams(event: SupplierMoreInfoUpdate): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.userName,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const supplierMoreInfoUpdateHandler = new SupplierMoreInfoUpdateHandler();
