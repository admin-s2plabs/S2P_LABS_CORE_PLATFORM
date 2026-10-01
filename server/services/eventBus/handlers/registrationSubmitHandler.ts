import { RegistrationSubmitEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

class RegistrationSubmitHandler extends BaseEmailHandler<RegistrationSubmitEvent> {
  constructor() {
    super("REGISTRATION_SUBMIT");
  }

  async onEvent(event: RegistrationSubmitEvent): Promise<void> {
    if (!event.emailId?.trim()) {
      console.warn("[RegistrationSubmitHandler] No supplier email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: RegistrationSubmitEvent): string {
    return event.emailId.trim();
  }

  async getTemplateParams(event: RegistrationSubmitEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.userName,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const registrationSubmitHandler = new RegistrationSubmitHandler();
