import { POApprovedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/** am_aprvl_notification_dtls.event_id = 'PO_APPROVED' */
class PoApprovedHandler extends BaseEmailHandler<POApprovedEvent> {
  constructor() {
    super("PO_APPROVED");
  }

  async onEvent(event: POApprovedEvent): Promise<void> {
    if (!event.ownerEmail?.trim()) {
      console.warn("[PoApprovedHandler] No creator email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: POApprovedEvent): string {
    return event.ownerEmail.trim();
  }

  async getTemplateParams(event: POApprovedEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.ownerName,
      poNumber: event.poNumber,
      poDescription: event.poTitle,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const poApprovedHandler = new PoApprovedHandler();
