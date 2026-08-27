import { InvoicePaymentReceivedPOEvent } from "../events";
import { BaseEmailHandler } from "./baseHandler";

/**
 * Notifies supplier when payment is received for a PO invoice.
 * Event: INVOICE_PAYMENT_RECEIVED_PO
 */
class InvoicePaymentReceivedPOHandler extends BaseEmailHandler<InvoicePaymentReceivedPOEvent> {
  constructor() {
    super("INVOICE_PAYMENT_RECEIVED_PO");
  }

  getRecipients(event: InvoicePaymentReceivedPOEvent): string {
    return event.receiverEmail;
  }

  async getTemplateParams(event: InvoicePaymentReceivedPOEvent): Promise<Record<string, unknown>> {
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

export const invoicePaymentReceivedPOHandler = new InvoicePaymentReceivedPOHandler();
