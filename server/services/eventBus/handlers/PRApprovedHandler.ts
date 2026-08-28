import { PRApprovedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/** am_aprvl_notification_dtls.event_id = 'PR_APPROVED' */
class PrApprovedHandler extends BaseEmailHandler<PRApprovedEvent> {
  constructor() {
    super("PR_APPROVED");
  }

  async onEvent(event: PRApprovedEvent): Promise<void> {
    if (!event.ownerEmail?.trim()) {
      console.warn("[PrApprovedHandler] No requestor email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: PRApprovedEvent): string {
    return event.ownerEmail.trim();
  }

  async getTemplateParams(event: PRApprovedEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.ownerName,
      prNumber: event.prNumber,
      prDescription: event.prDescription,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const prApprovedHandler = new PrApprovedHandler();
