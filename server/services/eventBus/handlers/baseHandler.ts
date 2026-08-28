import { ProkrayaEvent, EventHandler } from '../events';
import { emailService, NotificationTemplate } from '../../emailService';
import { pool } from '../../../db';
import { getContextPool, tenantStorage } from '../../../tenant-context';

const getPool = () => getContextPool() ?? pool;

export abstract class BaseEmailHandler<T extends ProkrayaEvent> implements EventHandler<T> {
  protected eventId: string;

  constructor(eventId: string) {
    this.eventId = eventId;
  }

  abstract getRecipients(event: T): string | string[];
  
  abstract getTemplateParams(event: T): Record<string, any> | Promise<Record<string, any>>;
  
  getCcRecipients(event: T): string | string[] | undefined {
    return undefined;
  }

  getAttachments(event: T): Array<{ filename: string; content?: Buffer | string; path?: string }> | undefined {
    return event.attachments;
  }

  protected async resolveToUserEmail(toUser: string | undefined | null): Promise<string | undefined> {
    if (!toUser || toUser.trim() === '') return undefined;
    try {
      const result = await getPool().query(
        `SELECT email_id FROM dbo.um_user_dtls WHERE user_name = $1 LIMIT 1`,
        [toUser]
      );
      return result.rows[0]?.email_id || undefined;
    } catch (e) {
      console.warn(`[${this.constructor.name}] Failed to resolve toUser "${toUser}":`, e);
      return undefined;
    }
  }

  async onEvent(event: T): Promise<void> {
    console.log(`[${this.constructor.name}] Processing event: ${event.eventType}`);

    if (event.domain) {
      const { resolveTenantDb } = await import('../../../tenant-db');
      const tenantContext = await resolveTenantDb(event.domain);
      if (tenantContext) {
        console.log(`[${this.constructor.name}] Re-establishing tenant context for domain: ${event.domain}`);
        return tenantStorage.run(tenantContext, () => this.executeHandler(event));
      }
    }

    return this.executeHandler(event);
  }

  private async executeHandler(event: T): Promise<void> {
    try {
      const { isSupplierFacingEventId, areSupplierEmailNotificationsEnabled } =
        await import('../../supplierEmailConfig');
      if (isSupplierFacingEventId(this.eventId) && !(await areSupplierEmailNotificationsEnabled())) {
        console.log(
          `[${this.constructor.name}] Supplier email suppressed — SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED is false (event: ${this.eventId})`
        );
        return;
      }

      const templates = await emailService.getTemplatesByEventId(this.eventId);
      
      if (templates.length === 0) {
        console.warn(`[${this.constructor.name}] No templates found for event: ${this.eventId}`);
        return;
      }

      const recipients = this.getRecipients(event);
      const params = await Promise.resolve(this.getTemplateParams(event));
      const cc = this.getCcRecipients(event);
      const attachments = this.getAttachments(event);

      for (const template of templates) {
        await this.processTemplate(template, recipients, params, cc, attachments, event);
      }

      console.log(`[${this.constructor.name}] Event processed successfully`);
    } catch (error) {
      console.error(`[${this.constructor.name}] Error processing event:`, error);
      throw error;
    }
  }

  protected async processTemplate(
    template: NotificationTemplate,
    recipients: string | string[],
    params: Record<string, any>,
    cc: string | string[] | undefined,
    attachments: Array<{ filename: string; content?: Buffer | string; path?: string }> | undefined,
    event: T
  ): Promise<void> {
    const subject = emailService.mergeTemplate(template.notif_subject, params);
    const html = emailService.mergeTemplate(template.notif_content_tmplate, params);
    const smsMsg = emailService.mergeTemplate(template.sms_content_tmpl || template.notif_subject, params);

    const recipientStr = Array.isArray(recipients) ? recipients.join(', ') : recipients;
    const fromUser = template.from_role || 'SYSTEM';
    
    const ccList: string[] = Array.isArray(cc) ? [...cc] : cc ? [cc] : [];
    if (template.cc_group) {
      ccList.push(
        ...template.cc_group.split(',').map((s) => s.trim()).filter(Boolean)
      );
    }

    if (ccList.length === 0 && template.to_user) {
      const toUserEmail = await this.resolveToUserEmail(template.to_user);
      if (toUserEmail) {
        ccList.push(toUserEmail);
        if (!params.user) {
          params.user = template.to_user;
        }
      }
    }

    const resolvedCc = ccList.length > 0 ? ccList : undefined;

    const toUser = recipientStr;

    const notifId = await emailService.saveEmailNotification(
      fromUser,
      toUser,
      subject,
      html,
      smsMsg,
      template.event_id || this.eventId,
      'New',
      resolvedCc?.join(', ')
    );

    const sent = await emailService.sendEmail({
      to: recipients,
      cc: resolvedCc,
      subject,
      html,
      attachments,
      eventId: template.event_id || this.eventId,
    });

    if (notifId) {
      const newStatus = sent ? 'Sent' : 'Failed';
      await emailService.updateEmailNotificationStatus(notifId, newStatus);
    }

    if (!sent) {
      console.warn(`[${this.constructor.name}] Email not sent for event ${this.eventId} - check SMTP configuration`);
    }
  }
}
