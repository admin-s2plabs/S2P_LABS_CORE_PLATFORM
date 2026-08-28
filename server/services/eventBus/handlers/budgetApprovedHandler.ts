import { BudgetApprovedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

/**
 * Mirrors legacy BudgetApprovedEventHandler: notifies budget owner using
 * am_aprvl_notification_dtls rows where event_id = 'BUDGET_APPROVED'.
 * Template params: user (owner display name), budgetName, linkUrl (app root).
 */
class BudgetApprovedHandler extends BaseEmailHandler<BudgetApprovedEvent> {
  constructor() {
    super("BUDGET_APPROVED");
  }

  async onEvent(event: BudgetApprovedEvent): Promise<void> {
    if (!event.ownerEmail?.trim()) {
      console.warn("[BudgetApprovedHandler] No budget owner email; skipping notification");
      return;
    }
    return super.onEvent(event);
  }

  getRecipients(event: BudgetApprovedEvent): string {
    return event.ownerEmail.trim();
  }

  async getTemplateParams(event: BudgetApprovedEvent): Promise<Record<string, unknown>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.ownerName,
      budgetId: event.budgetId,
      budgetName: event.budgetName,
      linkUrl: appUrl,
      orgName: event.orgName || "Prokraya",
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const budgetApprovedHandler = new BudgetApprovedHandler();
