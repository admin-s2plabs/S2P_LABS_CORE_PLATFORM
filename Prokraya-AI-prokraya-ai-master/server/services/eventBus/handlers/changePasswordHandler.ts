import { BaseEmailHandler } from './baseHandler';
import { ChangePasswordEvent } from '../events';

class ChangePasswordHandler extends BaseEmailHandler<ChangePasswordEvent> {
  constructor() {
    super('PROFILE_CHANGE_PASSWORD');
  }

  getRecipients(event: ChangePasswordEvent): string {
    return event.emailId;
  }

  getTemplateParams(event: ChangePasswordEvent): Record<string, any> {
    return {
      user: event.userName,
      date: event.date || new Date().toLocaleDateString(),
      time: event.time || new Date().toLocaleTimeString(),
      userName: event.loginUserName,
      linkUrl: event.loginUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const changePasswordHandler = new ChangePasswordHandler();
