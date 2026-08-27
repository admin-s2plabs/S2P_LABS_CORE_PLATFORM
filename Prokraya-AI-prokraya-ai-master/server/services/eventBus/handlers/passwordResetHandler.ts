import { BaseEmailHandler } from './baseHandler';
import { PasswordResetEvent, EventTypes } from '../events';

class PasswordResetHandler extends BaseEmailHandler<PasswordResetEvent> {
  constructor() {
    super('RESET_PASSWORD');
  }

  getRecipients(event: PasswordResetEvent): string {
    return event.emailId;
  }

  getTemplateParams(event: PasswordResetEvent): Record<string, any> {
    return {
      user: event.userName,           // Dear ${user}
      userName: event.loginUserName,  // User Name: ${userName}
      password: event.newPassword,    // Password: ${password}
      linkUrl: event.resetLinkUrl || event.loginUrl,  // Go To Link: ${linkUrl}
      orgName: event.orgName || 'Prokraya',
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const passwordResetHandler = new PasswordResetHandler();
