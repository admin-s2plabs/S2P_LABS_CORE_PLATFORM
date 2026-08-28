import { RegistrationInviteEvent } from '../events';
import { BaseEmailHandler } from './baseHandler';
import { propertiesService } from '../../propertiesService';
import * as adminRepo from "../../../modules/administration/administration.repository.ts";

export class RegistrationInviteHandler extends BaseEmailHandler<RegistrationInviteEvent> {
  constructor() {
    super('SUPP_INVITATION');
  }

  getRecipients(event: RegistrationInviteEvent): string {
    return event.emailId;
  }

  async getTemplateParams(event: RegistrationInviteEvent): Promise<Record<string, any>> {
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
      countryCode: event.countryCode || '',
      companyList: event.companyList || '',
      emailId: event.emailId,
      orgLogoPath: event.orgLogoPath || '',

    };
  }
}

export const registrationInviteHandler = new RegistrationInviteHandler();
