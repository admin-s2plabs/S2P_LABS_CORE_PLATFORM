import { BaseEmailHandler } from './baseHandler';
import { ForgotPasswordLinkEvent } from '../events';

class ForgotPasswordLinkHandler extends BaseEmailHandler<ForgotPasswordLinkEvent> {
  constructor() {
    super('FORGOT_PASSWORD');
  }

  getRecipients(event: ForgotPasswordLinkEvent): string {
    return event.emailId;
  }

  getTemplateParams(event: ForgotPasswordLinkEvent): Record<string, any> {
    return {
      user: event.userName,
      userName: event.loginUserName,
      linkUrl: event.resetLinkUrl,
      orgName: event.orgName || 'S2P Labs',
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const forgotPasswordLinkHandler = new ForgotPasswordLinkHandler();
