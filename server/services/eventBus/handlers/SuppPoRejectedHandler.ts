import { SuppPoRejectedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";

/** am_aprvl_notification_dtls.event_id = 'SUPP_PO_REJECTED' */
class SuppPoRejectedHandler extends BaseEmailHandler<SuppPoRejectedEvent> {
  constructor() {
    super("SUPP_PO_REJECTED");
  }

  getRecipients(event: SuppPoRejectedEvent): string {
    return event.receiverEmail;
  }

  async getTemplateParams(event: SuppPoRejectedEvent): Promise<Record<string, unknown>> {
    return {
      poNumber: event.poNumber,
      poDescription: event.poDescription,
      rejectedDate: event.rejectedDate,
      supplierName: event.companyName,
      rejectionReason: event.rejectionReason,
      user: event.user,
      reviewer: event.reviewer,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const suppPoRejectedHandler = new SuppPoRejectedHandler();
