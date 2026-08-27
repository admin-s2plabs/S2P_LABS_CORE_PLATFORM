import { SuppPoAckEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";

/** am_aprvl_notification_dtls.event_id = 'SUPP_PO_ACK' */
class SuppPoAckHandler extends BaseEmailHandler<SuppPoAckEvent> {
  constructor() {
    super("SUPP_PO_ACK");
  }

  getRecipients(event: SuppPoAckEvent): string {
    return event.receiverEmail;
  }

  async getTemplateParams(event: SuppPoAckEvent): Promise<Record<string, unknown>> {
    return {
      supplierName: event.supplierName,
      poNumber: event.poNumber,
      poDescription: event.poDescription,
      acceptedDate: event.ackDate,
      user: event.user,
      reviewer: event.reviewer,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const suppPoAckHandler = new SuppPoAckHandler();
