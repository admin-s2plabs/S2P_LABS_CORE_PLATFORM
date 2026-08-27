import { PORejectedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/** am_aprvl_notification_dtls.event_id = 'PO_REJECTED' */
class PoRejectedHandler extends BaseEmailHandler<PORejectedEvent> {
  constructor() {
    super("PO_REJECTED");
  }

  async onEvent(event: PORejectedEvent): Promise<void> {
    if (!event.ownerEmail?.trim()) {
      console.warn("[PoRejectedHandler] No creator email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: PORejectedEvent): string {
    return event.ownerEmail.trim();
  }

  async getTemplateParams(event: PORejectedEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.ownerName,
      poNumber: event.poNumber,
      poDescription: event.poTitle,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      rejectComments: event.rejectComments,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const poRejectedHandler = new PoRejectedHandler();
