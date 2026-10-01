import { BudgetMoreInfoEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Notifies budget owner using am_aprvl_notification_dtls where event_id = 'BUDGET_MORE_INFO'.
 * Template params: user, budgetName, linkUrl, moreInfoComments, orgName.
 */
class BudgetMoreInfoHandler extends BaseEmailHandler<BudgetMoreInfoEvent> {
  constructor() {
    super("BUDGET_MORE_INFO");
  }

  async onEvent(event: BudgetMoreInfoEvent): Promise<void> {
    if (!event.ownerEmail?.trim()) {
      console.warn("[BudgetMoreInfoHandler] No budget owner email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: BudgetMoreInfoEvent): string {
    return event.ownerEmail.trim();
  }

  async getTemplateParams(event: BudgetMoreInfoEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.ownerName,
      budgetName: event.budgetName,
      budgetId: event.budgetId,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const budgetMoreInfoHandler = new BudgetMoreInfoHandler();
