import { SupplierMoreInfo } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Sends a "More Info Required" email to the supplier (new registration flow)
 * using am_aprvl_notification_dtls rows where event_id = 'SUPP_REGSTR_MOREINFO'.
 * Template params: user (company name), linkUrl (app root).
 */
class SupplierMoreInfoHandler extends BaseEmailHandler<SupplierMoreInfo> {
  constructor() {
    super("SUPP_REGSTR_MOREINFO");
  }

  async onEvent(event: SupplierMoreInfo): Promise<void> {
    if (!event.emailId?.trim()) {
      console.warn("[SupplierMoreInfoHandler] No supplier email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: SupplierMoreInfo): string {
    return event.emailId.trim();
  }

  async getTemplateParams(event: SupplierMoreInfo): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.userName,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const supplierMoreInfoHandler = new SupplierMoreInfoHandler();
