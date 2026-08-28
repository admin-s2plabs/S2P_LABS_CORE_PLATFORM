import { PRRejectedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/** am_aprvl_notification_dtls.event_id = 'PR_REJECTED' */
class PrRejectedHandler extends BaseEmailHandler<PRRejectedEvent> {
  constructor() {
    super("PR_REJECTED");
  }

  async onEvent(event: PRRejectedEvent): Promise<void> {
    if (!event.ownerEmail?.trim()) {
      console.warn("[PrRejectedHandler] No requestor email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: PRRejectedEvent): string {
    return event.ownerEmail.trim();
  }

  async getTemplateParams(event: PRRejectedEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.ownerName,
      prNumber: event.prNumber,
      prDescription: event.prDescription,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      rejectComments: event.rejectComments,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const prRejectedHandler = new PrRejectedHandler();
