import { BudgetRejectedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies budget owner using am_aprvl_notification_dtls where event_id = 'BUDGET_REJECTED'.
 * Template params: user, budgetName, linkUrl, rejectComments, orgName.
 */
class BudgetRejectedHandler extends BaseEmailHandler<BudgetRejectedEvent> {
  constructor() {
    super("BUDGET_REJECTED");
  }

  async onEvent(event: BudgetRejectedEvent): Promise<void> {
    if (!event.ownerEmail?.trim()) {
      console.warn("[BudgetRejectedEvent] No budget owner email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: BudgetRejectedEvent): string {
    return event.ownerEmail.trim();
  }

  async getTemplateParams(event: BudgetRejectedEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.ownerName,
      budgetName: event.budgetName,
      budgetId: event.budgetId,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      rejectComments: event.rejectComments,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const budgetRejectedHandler = new BudgetRejectedHandler();
