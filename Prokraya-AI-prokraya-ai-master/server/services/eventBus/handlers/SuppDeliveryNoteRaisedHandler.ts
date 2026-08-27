import { SuppDeliveryNoteRaisedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";

/** am_aprvl_notification_dtls.event_id = 'SUPP_DELIVERY_NOTE_RAISED' */
class SuppDeliveryNoteRaisedHandler extends BaseEmailHandler<SuppDeliveryNoteRaisedEvent> {
  constructor() {
    super("SUPP_DELIVERY_NOTE_RAISED");
  }

  getRecipients(event: SuppDeliveryNoteRaisedEvent): string {
    return event.receiverEmail;
  }

  async getTemplateParams(event: SuppDeliveryNoteRaisedEvent): Promise<Record<string, unknown>> {
    return {
      requestorName: event.requestorName,
      supplierName: event.companyName,
      poNumber: event.poNumber,
      deliveryNoteNumber: event.deliveryNoteNumber,
      deliveryNoteDescription: event.deliveryNoteDescription,
      expectedDeliveryDate: event.expectedDeliveryDate,
      date: event.date,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const suppDeliveryNoteRaisedHandler = new SuppDeliveryNoteRaisedHandler();
