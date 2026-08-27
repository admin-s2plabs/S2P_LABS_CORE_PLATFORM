import { PRCancelEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";
import { propertiesService } from "../../propertiesService";

class PRCancelHandlerImpl extends BaseEmailHandler<PRCancelEvent> {
    constructor() {
        super("PR_CANCEL");
    }

    async onEvent(event: PRCancelEvent): Promise<void> {
        if (!event.emailId?.trim()) {
            console.warn("[PRCancelHandler] No recipient email; skipping notification");
            return;
        }
        return super.onEvent(event);
    }

    getRecipients(event: PRCancelEvent): string {
        return event.emailId.trim();
    }

    async getTemplateParams(event: PRCancelEvent): Promise<Record<string, unknown>> {
        const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
        return {
            user: event.user,
            linkUrl: appUrl,
            prNumber: event.prNumber,
            prStatus: event.status,
            orgLogoPath: event.orgLogoPath || '',
        };
    }
}

export const prCancelHandler = new PRCancelHandlerImpl();
