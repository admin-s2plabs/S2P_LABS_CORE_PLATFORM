import { POApprovalEvent } from '../events';
import { BaseEmailHandler } from './baseHandler';
import { propertiesService } from '../../propertiesService';

class PoApprovalHandler extends BaseEmailHandler<POApprovalEvent> {
  constructor() {
    super('PO_APPROVAL');
  }

  getRecipients(event: POApprovalEvent): string {
    return event.emailId;
  }

  async getTemplateParams(event: POApprovalEvent): Promise<Record<string, any>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);

    return {
      user: event.approverName,
      poNumber: event.poNumber,
      poAmount: event.poAmount,
      currency: event.currency,
      vendorName: event.vendorName,
      requestorName: event.requestorName || "",
      poDepartment: event.poDepartment || "",
      poDescription: event.poDescription || "",
      status: event.status,
      remarks: event.remarks || '',
      linkUrl: `${appUrl}/purchase-orders/${event.poNumber}`,
      orgName: event.orgName || 'S2P Labs',
      orgLogoPath: event.orgLogoPath || '',
      emailApprovalLink: event.emailApprovalLink || '',
    };
  }
}

export const poApprovalHandler = new PoApprovalHandler();
