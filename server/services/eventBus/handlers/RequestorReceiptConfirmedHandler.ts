import { RequestorReceiptConfirmedEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";

/** am_aprvl_notification_dtls.event_id = 'REQUESTOR_RECEIPT_CONFIRMED' */
class RequestorReceiptConfirmedHandler extends BaseEmailHandler<RequestorReceiptConfirmedEvent> {
  constructor() {
    super("REQUESTOR_RECEIPT_CONFIRMED");
  }

  getRecipients(event: RequestorReceiptConfirmedEvent): string {
    return event.receiverEmail;
  }

  async getTemplateParams(event: RequestorReceiptConfirmedEvent): Promise<Record<string, unknown>> {
    return {
      supplierName: event.companyName,
      requestorName: event.requestorName,
      poNumber: event.poNumber,
      deliveryNoteNumber: event.deliveryNoteNumber,
      deliveryNoteDescription: event.deliveryNoteDescription,
      grnNumber: event.receiptNumber,
      grnDate: event.grnDate,
      date: event.date,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const requestorReceiptConfirmedHandler = new RequestorReceiptConfirmedHandler();
