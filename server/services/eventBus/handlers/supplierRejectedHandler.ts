import { SupplierRejected } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

class SupplierRejectedHandler extends BaseEmailHandler<SupplierRejected> {
  constructor() {
    super("SUPP_REGSTR_REJECTED");
  }

  async onEvent(event: SupplierRejected): Promise<void> {
    if (!event.emailId?.trim()) {
      console.warn("[SupplierRejectedHandler] No supplier email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: SupplierRejected): string {
    return event.emailId.trim();
  }

  async getTemplateParams(event: SupplierRejected): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.userName,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const supplierRejectedHandler = new SupplierRejectedHandler();
