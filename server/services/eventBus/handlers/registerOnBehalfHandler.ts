import { RegisterOnBehalfInviteEvent } from '../events';
import { BaseEmailHandler } from './baseHandler';
import { propertiesService } from '../../propertiesService';

export class RegisterOnBehalfHandler extends BaseEmailHandler<RegisterOnBehalfInviteEvent> {
  constructor() {
    super('REGISTER_ONBEHALF_INVITATION');
  }

  getRecipients(event: RegisterOnBehalfInviteEvent): string {
    return event.emailId;
  }

  async getTemplateParams(event: RegisterOnBehalfInviteEvent): Promise<Record<string, any>> {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);

    const domainPart = event.domain ? `&domain=${encodeURIComponent(event.domain)}` : '';
    const encParams = Buffer.from(
      `email_id=${event.emailId}&companyName=${encodeURIComponent(event.companyName)}&orgId=${event.orgId}&invitationId=${event.invitationId}${domainPart}`
    ).toString('base64');

    const linkUrl = `${appUrl}/register?enc=${encodeURIComponent(encParams)}`;

    return {
      companyName: event.companyName,
      linkUrl: linkUrl,
      orgName: event.orgName,
      procOfficer: event.procOfficer,
      invitationId: event.invitationId,
      country: event.country || '',
      mobileNo: event.mobileNo || '',
      emailId: event.emailId,
      orgLogoPath: event.orgLogoPath || '',

    };
  }
}

export const registerOnBehalfHandler = new RegisterOnBehalfHandler();
