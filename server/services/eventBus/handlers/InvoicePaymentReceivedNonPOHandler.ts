import { InvoicePaymentReceivedNonPOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";

/**
 * Notifies supplier when payment is received for a Non-PO invoice.
 * Event: INVOICE_PAYMENT_RECEIVED_NONPO
 */
class InvoicePaymentReceivedNonPOHandler extends BaseEmailHandler<InvoicePaymentReceivedNonPOEvent> {
  constructor() {
    super("INVOICE_PAYMENT_RECEIVED_NONPO");
  }

  getRecipients(event: InvoicePaymentReceivedNonPOEvent): string {
    return event.receiverEmail;
  }

  async getTemplateParams(event: InvoicePaymentReceivedNonPOEvent): Promise<Record<string, unknown>> {
    return {
      invoiceNo: event.invoiceNo,
      amount: event.amountPaid,
      currency: event.currency,
      paymentDate: event.paymentDate,
      paymentMethod: event.paymentMethod,
      companyName: event.companyName,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const invoicePaymentReceivedNonPOHandler = new InvoicePaymentReceivedNonPOHandler();
