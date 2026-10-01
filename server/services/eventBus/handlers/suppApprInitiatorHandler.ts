import { SupplierApprInitiatorEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Sends a notification email to the approver when a supplier submits
 * their registration for approval (SUPP_APPR_INITIATOR event).
 */
class SuppApprInitiatorHandler extends BaseEmailHandler<SupplierApprInitiatorEvent> {
  constructor() {
    super("SUPP_APPR_INITIATOR");
  }

  async onEvent(event: SupplierApprInitiatorEvent): Promise<void> {
    if (!event.receiverEmail?.trim()) {
      console.warn("[SuppApprInitiatorHandler] No approver email provided; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: SupplierApprInitiatorEvent): string {
    return event.receiverEmail.trim();
  }

  async getTemplateParams(event: SupplierApprInitiatorEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.userName,
      companyName: event.companyName,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
      emailApprovalLink:event.emailApprovalLink || '',
      attachments: event.attachments || [],
    };
  }
}

export const suppApprInitiatorHandler = new SuppApprInitiatorHandler();
