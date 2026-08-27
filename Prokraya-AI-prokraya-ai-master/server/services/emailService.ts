import nodemailer from 'nodemailer';
import { db, pool as masterPool } from '../db';
import { getContextDb } from '../tenant-context';
import { sql } from 'drizzle-orm';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
  /** When set, supplier notification config is checked before sending. */
  eventId?: string;
  /** Explicit override: treat as supplier-facing regardless of eventId. */
  isSupplierRecipient?: boolean;
}

interface NotificationTemplate {
  id: number;
  event_id: string;
  event_name: string;
  notif_subject: string;
  notif_content_tmplate: string;
  sms_content_tmpl?: string;
  from_role?: string;
  to_role?: string;
  to_user?: string;
  cc_group?: string;
  status: number;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private config: EmailConfig | null = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;

    if (!host || !user || !pass) {
      console.log('[EmailService] SMTP credentials not configured. Email sending disabled.');
      return;
    }

    this.config = {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      from: from || ''
    };

    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
    });

    try {
      if (process.env.NODE_ENV !== 'development') {
        await this.transporter.verify();
      }
      this.initialized = true;
      console.log('[EmailService] SMTP connection verified successfully.');
    } catch (error) {
      console.error('[EmailService] SMTP connection failed:', error);
      this.initialized = false;
    }
  }

  mergeTemplate(template: string, params: Record<string, any>): string {
    if (!template) return '';

    let result = template;

    // Replace newlines with <br /> only in text content — not inside HTML tags.
    // The alternation (<[^>]*>) captures full tags (including multi-line attributes)
    // and returns them unchanged; bare newlines in text nodes become <br />.
    result = result.replace(/(<[^>]*>)|\r?\n/g, (match, tag) => tag ?? '<br />');
    
    const now = new Date();
    const dateParams: Record<string, string> = {
      'dateTool.format("yyyy-MM-dd", $currentDate)': now.toISOString().split('T')[0],
      'dateTool.format("dd/MM/yyyy", $currentDate)': now.toLocaleDateString('en-GB'),
      'dateTool.format("MMMM dd, yyyy", $currentDate)': now.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }),
      currentDate: now.toISOString(),
      today: now.toISOString().split('T')[0],
    };
    
    const allParams = { ...dateParams, ...params };
    
    for (const [key, value] of Object.entries(allParams)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeholder = new RegExp(`\\$\\{${escapedKey}\\}|\\$${escapedKey}(?![a-zA-Z0-9_])|\\{\\{${escapedKey}\\}\\}`, 'g');
      result = result.replace(placeholder, String(value ?? ''));
    }
    
    result = result.replace(/\$\{[^}]+\}|\$[a-zA-Z_][a-zA-Z0-9_]*|\{\{[^}]+\}\}/g, '');
    
    return result;
  }

  async getTemplate(eventId: string): Promise<NotificationTemplate | null> {
    try {
      const { getContextPool } = await import('../tenant-context');
      const p = getContextPool() ?? masterPool;
      const result = await p.query(`
        SELECT
          id, event_id, event_name, notif_subject, notif_content_tmplate,
          sms_content_tmpl, from_role, to_role, to_user, cc_group, status
        FROM dbo.am_aprvl_notification_dtls
        WHERE event_id = $1
        LIMIT 1
      `, [eventId]);

      return result.rows[0] as NotificationTemplate || null;
    } catch (error) {
      console.error(`[EmailService] Error fetching template for ${eventId}:`, error);
      return null;
    }
  }

  async getTemplatesByEventId(eventId: string): Promise<NotificationTemplate[]> {
    try {
      const { getContextPool } = await import('../tenant-context');
      const p = getContextPool() ?? masterPool;
      const result = await p.query(`
        SELECT
          id, event_id, event_name, notif_subject, notif_content_tmplate,
          sms_content_tmpl, from_role, to_role, to_user, cc_group, status
        FROM dbo.am_aprvl_notification_dtls
        WHERE event_id = $1
      `, [eventId]);

      return (result.rows || []) as NotificationTemplate[];
    } catch (error) {
      console.error(`[EmailService] Error fetching templates for ${eventId}:`, error);
      return [];
    }
  }

  private async getTransporter(): Promise<{ transporter: nodemailer.Transporter; config: EmailConfig } | null> {
    // Use the env-var transporter if it was successfully initialized at startup
    if (this.initialized && this.transporter && this.config) {
      return { transporter: this.transporter, config: this.config };
    }

    // Fall back to SMTP settings stored in am_property_mst (tenant-aware)
    try {
      const { getContextPool } = await import('../tenant-context');
      const p = getContextPool() ?? masterPool;

      const result = await p.query(
        `SELECT prop_code, prop_value FROM dbo.am_property_mst
         WHERE prop_code IN ('SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM')
           AND prop_value IS NOT NULL AND prop_value <> ''`
      );

      const props: Record<string, string> = {};
      for (const row of result.rows) {
        props[row.prop_code as string] = row.prop_value as string;
      }

      const host = props['SMTP_HOST'] || process.env.SMTP_HOST;
      const user = props['SMTP_USER'] || process.env.SMTP_USER;
      const pass = props['SMTP_PASS'] || process.env.SMTP_PASS;

      if (!host || !user || !pass) return null;

      const port = parseInt(props['SMTP_PORT'] || process.env.SMTP_PORT || '587');
      const from = props['SMTP_FROM'] || process.env.SMTP_FROM || user;
      const config: EmailConfig = { host, port, secure: port === 465, auth: { user, pass }, from };

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
      });

      return { transporter, config };
    } catch (err) {
      console.error('[EmailService] Failed to load SMTP config from DB:', err);
      return null;
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    const smtp = await this.getTransporter();
    if (!smtp) {
      console.log('[EmailService] Email not sent - no SMTP configuration found (env vars or DB).');
      console.log('[EmailService] Would have sent:', { to: options.to, subject: options.subject });
      return false;
    }

    // Check EMAIL_NOTIFICATIONS_ENABLED from the current tenant's DB (or master as fallback)
    try {
      const { getContextPool } = await import('../tenant-context');
      const p = getContextPool() ?? masterPool;
      const flagResult = await p.query(
        `SELECT prop_code, prop_value FROM dbo.am_property_mst
         WHERE prop_code IN ('EMAIL_NOTIFICATIONS_ENABLED', 'SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED')`
      );
      const flags: Record<string, string> = {};
      for (const row of flagResult.rows) {
        flags[row.prop_code as string] = row.prop_value as string;
      }
      const emailEnabled = flags.EMAIL_NOTIFICATIONS_ENABLED ?? 'true';
      if (emailEnabled === 'false') {
        console.log('[EmailService] Email suppressed — EMAIL_NOTIFICATIONS_ENABLED is false. Would have sent:', {
          to: options.to,
          subject: options.subject
        });
        return false;
      }

      const { isSupplierFacingEventId } = await import('./supplierEmailConfig');
      const isSupplierEmail =
        options.isSupplierRecipient === true ||
        (options.eventId ? isSupplierFacingEventId(options.eventId) : false);
      if (isSupplierEmail) {
        const supplierEnabled = flags.SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED ?? 'true';
        if (supplierEnabled === 'false') {
          console.log('[EmailService] Supplier email suppressed — SUPPLIER_EMAIL_NOTIFICATIONS_ENABLED is false. Would have sent:', {
            to: options.to,
            subject: options.subject,
            eventId: options.eventId,
          });
          return false;
        }
      }
    } catch { /* proceed if flag check fails */ }

    try {
      const mailOptions = {
        from: smtp.config.from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments
      };

      const info = await smtp.transporter.sendMail(mailOptions);
      console.log('[EmailService] Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      return false;
    }
  }

  async sendTemplatedEmail(
    eventId: string,
    to: string | string[],
    params: Record<string, any>,
    cc?: string | string[],
    attachments?: EmailOptions['attachments']
  ): Promise<boolean> {
    const template = await this.getTemplate(eventId);

    if (!template) {
      console.error(`[EmailService] No template found for event: ${eventId}`);
      return false;
    }

    const subject = this.mergeTemplate(template.notif_subject, params);
    const html = this.mergeTemplate(template.notif_content_tmplate, params);
    const smsMsg = template.sms_content_tmpl
      ? this.mergeTemplate(template.sms_content_tmpl, params)
      : undefined;

    const fromUser = template.from_role || 'SYSTEM';
    const toUser = Array.isArray(to) ? to.join(', ') : to;
    const ccUser = Array.isArray(cc) ? cc.join(', ') : cc;

    const notifId = await this.saveEmailNotification(
      fromUser,
      toUser,
      subject,
      html,
      smsMsg,
      eventId,
      'New',
      ccUser
    );

    const sent = await this.sendEmail({ to, cc, subject, html, attachments, eventId });

    if (notifId) {
      await this.updateEmailNotificationStatus(notifId, sent ? 'Sent' : 'Failed');
    }

    return sent;
  }

  async saveEmailNotification(
    fromUser: string,
    toUser: string,
    subject: string,
    message: string,
    smsMsg?: string,
    notificationId?: string,
    status: string = 'New',
    ccUser?: string
  ): Promise<number | null> {
    try {
      const { getContextPool } = await import('../tenant-context');
      const p = getContextPool() ?? masterPool;

      const seqResult = await p.query(`
        SELECT nextval('dbo.am_email_notif_dtls_id_seq')::int as next_id
      `);
      const nextId = seqResult.rows[0].next_id;

      await p.query(`
        INSERT INTO dbo.am_email_notif_dtls (
          id, from_user, to_user, notif_subject, notif_msg, sms_msg,
          notification_id, status, attribute_13, recieved_date, creation_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `, [
        nextId, fromUser, toUser, subject, message,
        smsMsg || null, notificationId || null, status, ccUser || null
      ]);
      
      console.log(`[EmailService] Notification ${nextId} saved to am_email_notif_dtls`);
      return nextId;
    } catch (error) {
      console.error('[EmailService] Failed to save notification to am_email_notif_dtls:', error);
      return null;
    }
  }

  async updateEmailNotificationStatus(id: number, status: string): Promise<void> {
    try {
      const { getContextPool } = await import('../tenant-context');
      const p = getContextPool() ?? masterPool;
      await p.query(`
        UPDATE dbo.am_email_notif_dtls
        SET status = $1, last_modified_date = NOW()
        WHERE id = $2
      `, [status, id]);
      console.log(`[EmailService] Notification ${id} status updated to: ${status}`);
    } catch (error) {
      console.error('[EmailService] Failed to update notification status:', error);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const emailService = new EmailService();
export { EmailService, EmailOptions, NotificationTemplate };
