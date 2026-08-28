import { BaseEmailHandler } from './baseHandler';
import { UserCreationEvent } from '../events';

class UserCreationHandler extends BaseEmailHandler<UserCreationEvent> {
  constructor() {
    super('SRMS_USER_CREATION');
  }

  getRecipients(event: UserCreationEvent): string {
    return event.emailId;
  }

  getTemplateParams(event: UserCreationEvent): Record<string, any> {
    return {
      user: event.userName,
      userName: event.loginUserName,
      linkUrl: event.resetLinkUrl,
      orgName: event.orgName || 'Prokraya',
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const userCreationHandler = new UserCreationHandler();
