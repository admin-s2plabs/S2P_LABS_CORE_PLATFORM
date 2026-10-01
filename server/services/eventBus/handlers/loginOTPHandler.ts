import { LoginOTPEvent } from '../events';
import { BaseEmailHandler } from './baseHandler';

class LoginOTPHandler extends BaseEmailHandler<LoginOTPEvent> {
  constructor() {
    super('LOGIN_OTP');
  }

  getRecipients(event: LoginOTPEvent): string {
    return event.emailId;
  }

  getTemplateParams(event: LoginOTPEvent): Record<string, any> {
    return {
      user: event.userName,           // Dear ${user}
      userName: event.loginUserName,  // User Name: ${userName}
      otp: event.otp,    // OTP: ${otp}
      orgName: event.orgName || 'S2P Labs',
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export const loginOTPHandler = new LoginOTPHandler();
