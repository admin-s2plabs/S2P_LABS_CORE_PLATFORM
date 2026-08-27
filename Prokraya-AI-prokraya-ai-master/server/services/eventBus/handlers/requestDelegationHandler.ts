import { RequestDelegationEvent } from '../events';
import { BaseEmailHandler } from './baseHandler';
import { propertiesService } from '../../propertiesService';

export class RequestDelegationHandler extends BaseEmailHandler<RequestDelegationEvent> {
  constructor() {
    super('REQUEST_DELEGATION');
  }

  getRecipients(event: RequestDelegationEvent): string {
    return event.delegatedEmail;
  }
  async getTemplateParams(event: RequestDelegationEvent): Promise<Record<string, any>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      module: event.module,
      entityId: event.entityId,
      delegatedEmail: event.delegatedEmail,
      originalEmail: event.originalEmail,
      user: event.user,
      orgLogoPath: event.orgLogoPath || '', 
      actionByUser: event.actionByUser,
      linkUrl: appUrl,
      appUrl : appUrl,
      emailApprovalLink: event.emailApprovalLink,
    };
  }
}

export const requestDelegationHandler = new RequestDelegationHandler();
