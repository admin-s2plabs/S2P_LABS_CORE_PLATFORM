import { SupplierResubmit } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

class SupplierResubmitHandler extends BaseEmailHandler<SupplierResubmit> {
  constructor() {
    super("SUPP_REGSTR_RESUBMIT");
  }

  async onEvent(event: SupplierResubmit): Promise<void> {
    if (!event.receiverEmail?.trim()) {
      console.warn("[SupplierResubmitHandler] No receiver email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: SupplierResubmit): string {
    return event.receiverEmail.trim();
  }

  async getTemplateParams(event: SupplierResubmit): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.userName,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      orgLogoPath: event.orgLogoPath || '',
      emailApprovalLink: event.emailApprovalLink || '',
    };
  }
}

export const supplierResubmitHandler = new SupplierResubmitHandler();
