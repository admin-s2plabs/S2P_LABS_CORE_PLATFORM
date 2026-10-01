import { TaskAssignmentEvent, EventHandler } from "../events";
import { emailService, NotificationTemplate } from "../../emailService";
import { propertiesService } from "../../propertiesService";
import { workflowService } from "../../workflowService";
import { resolveTaskAssignmentTemplateId } from "../taskAssignmentTemplateMap";
import { pool } from "../../../db";
import { getContextPool, tenantStorage } from "../../../tenant-context";

const getPool = () => getContextPool() ?? pool;

const MAX_RECIPIENTS = 10;

async function findUserByUsernameOrEmail(identifier: string): Promise<{ email_id: string; name: string; user_name: string } | null> {
  const r = await getPool().query(
    `SELECT email_id, name, user_name FROM dbo.um_user_dtls
     WHERE (user_name = $1 OR email_id = $1) AND COALESCE(user_status, 1) = 1
     LIMIT 1`,
    [identifier]
  );
  return r.rows[0] || null;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || "").trim());
}

async function getReportingManagerForUser(submitterIdentifier: string): Promise<{ email_id: string; name: string; user_name: string } | null> {
  if (!submitterIdentifier?.trim()) return null;
  const userResult = await getPool().query(
    `SELECT manager_id FROM dbo.um_user_dtls
     WHERE (user_name = $1 OR email_id = $1) AND COALESCE(user_status, 1) = 1
     LIMIT 1`,
    [submitterIdentifier.trim()]
  );
  const managerId = userResult.rows[0]?.manager_id;
  if (!managerId) return null;
  const managerResult = await getPool().query(
    `SELECT email_id, name, user_name FROM dbo.um_user_dtls
     WHERE id = $1 AND COALESCE(user_status, 1) = 1
     LIMIT 1`,
    [managerId]
  );
  return managerResult.rows[0] || null;
}

async function getSupplierRecipientEmails(supplierId: number): Promise<string[]> {
  if (!Number.isFinite(supplierId) || supplierId <= 0) return [];

  const result = await getPool().query(
    `SELECT DISTINCT email
     FROM (
       SELECT NULLIF(TRIM(email_id), '') AS email
       FROM dbo.supp_basic_org_dtls
       WHERE id = $1
       UNION ALL
       SELECT NULLIF(TRIM(email), '') AS email
       FROM dbo.supp_cont_dtls
       WHERE supplier_id = $1
     ) e
     WHERE email IS NOT NULL`,
    [supplierId]
  );

  return result.rows.map((row: { email: string }) => row.email).filter(Boolean);
}

async function getRoleDisplayName(roleName: string): Promise<string> {
  const r = await getPool().query(
    `SELECT COALESCE(NULLIF(TRIM(role_display_name), ''), role_name) AS dn
     FROM dbo.um_role_dtls WHERE role_name = $1 AND COALESCE(status, 1) = 1 LIMIT 1`,
    [roleName]
  );
  return r.rows[0]?.dn || roleName;
}

async function emailsForRole(roleName: string, orgId: number | null): Promise<string[]> {
  const r = await getPool().query(
    `SELECT DISTINCT u.email_id
     FROM dbo.um_user_dtls u
     JOIN dbo.um_user_roles_map_dtls m ON u.id = m.user_id
     JOIN dbo.um_role_dtls r ON m.role_id = r.id
     WHERE r.role_name = $1 AND COALESCE(u.user_status, 1) = 1
       AND ($2::int IS NULL OR u.org_id = $2)
       AND u.email_id IS NOT NULL AND TRIM(u.email_id) <> ''
     LIMIT ${MAX_RECIPIENTS}`,
    [roleName, orgId]
  );
  return r.rows.map((row: { email_id: string }) => String(row.email_id).trim()).filter(Boolean);
}

async function collectRecipients(
  snapshot: NonNullable<Awaited<ReturnType<typeof workflowService.getTaskAssignmentSnapshot>>>,
  entityId?: string
): Promise<{ emails: string[]; displayUser: string; toUserLabel: string }> {
  const orgNum = entityId && /^\d+$/.test(entityId.trim()) ? parseInt(entityId.trim(), 10) : null;

  // For USER_HIERARCHY assignments, derive the recipient directly from the
  // submitter's reporting manager in um_user_dtls (manager_id column).
  if (snapshot.assignmentType === "USER_HIERARCHY") {
    const submitter = snapshot.startedBy?.trim() || snapshot.assignee?.trim() || "";
    const manager = await getReportingManagerForUser(submitter);
    if (manager?.email_id) {
      return {
        emails: [manager.email_id.trim()],
        displayUser: manager.name || manager.user_name || "Reporting Manager",
        toUserLabel: manager.user_name || manager.email_id,
      };
    }
    console.warn(
      `[TaskAssignmentHandler] USER_HIERARCHY: no reporting manager email found for submitter "${submitter}"`
    );
    return { emails: [], displayUser: "Reporting Manager", toUserLabel: "" };
  }

  const assignee = snapshot.assignee?.trim() || "";
  const groups = snapshot.candidateGroups || [];

  if (assignee) {
    const u = await findUserByUsernameOrEmail(assignee);
    if (u?.email_id) {
      return {
        emails: [u.email_id.trim()],
        displayUser: u.name || u.user_name || assignee,
        toUserLabel: u.user_name || assignee,
      };
    }
    // Supplier portal assignees may be stored directly as email (not always in um_user_dtls).
    if (looksLikeEmail(assignee)) {
      return {
        emails: [assignee.trim()],
        displayUser: assignee.trim(),
        toUserLabel: assignee.trim(),
      };
    }
    const roleDisplay = await getRoleDisplayName(assignee);
    const emails = await emailsForRole(assignee, orgNum);
    if (emails.length > 0) {
      return { emails, displayUser: roleDisplay, toUserLabel: assignee };
    }
    for (const g of groups) {
      const em = await emailsForRole(g, orgNum);
      if (em.length > 0) {
        const dn = await getRoleDisplayName(g);
        return { emails: em, displayUser: dn, toUserLabel: g };
      }
    }
    return { emails: [], displayUser: roleDisplay, toUserLabel: assignee };
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const em = await emailsForRole(g, orgNum);
    for (const e of em) {
      if (!seen.has(e)) {
        seen.add(e);
        out.push(e);
        if (out.length >= MAX_RECIPIENTS) break;
      }
    }
    if (out.length >= MAX_RECIPIENTS) break;
  }
  const firstGroup = groups[0];
  const displayUser = firstGroup ? await getRoleDisplayName(firstGroup) : "Approver";
  return { emails: out, displayUser, toUserLabel: firstGroup || "" };
}

class TaskAssignmentHandler implements EventHandler<TaskAssignmentEvent> {
  async onEvent(event: TaskAssignmentEvent): Promise<void> {
    if (event.domain) {
      const { resolveTenantDb } = await import("../../../tenant-db");
      const tenantContext = await resolveTenantDb(event.domain);
      if (tenantContext) {
        console.log(`[TaskAssignmentHandler] Re-establishing tenant context for domain: ${event.domain}`);
        return tenantStorage.run(tenantContext, () => this.handleEvent(event));
      }
    }
    return this.handleEvent(event);
  }

  private async handleEvent(event: TaskAssignmentEvent): Promise<void> {
    if (!event.taskId?.trim()) return;

    const snapshot = await workflowService.getTaskAssignmentSnapshot(event.taskId.trim());
    if (!snapshot) {
      console.warn(`[TaskAssignmentHandler] No snapshot for task ${event.taskId} — skipping`);
      return;
    }

    const templateEventId =
      event.templateEventId?.trim() ||
      resolveTaskAssignmentTemplateId(snapshot.processName) ||
      null;

    if (!templateEventId) {
      console.warn(
        `[TaskAssignmentHandler] No template mapping for process "${snapshot.processName}" — skipping`
      );
      return;
    }

    const templates = await emailService.getTemplatesByEventId(templateEventId);
    if (templates.length === 0) {
      console.warn(`[TaskAssignmentHandler] No templates for event_id=${templateEventId}`);
      return;
    }

    let { emails, displayUser, toUserLabel } = await collectRecipients(snapshot, event.entityId);

    // Fallback for supplier workflows where assignee isn't resolvable via um_user_dtls.
    if (
      emails.length === 0 &&
      (templateEventId === "SUPPLIER_REG" || templateEventId === "SUPPLIER_UPD")
    ) {
      const supplierIdRaw = (event.srmsRefNo || snapshot.refNumber || "").trim();
      const supplierId = /^\d+$/.test(supplierIdRaw) ? parseInt(supplierIdRaw, 10) : NaN;
      if (!Number.isNaN(supplierId)) {
        const supplierEmails = await getSupplierRecipientEmails(supplierId);
        if (supplierEmails.length > 0) {
          emails = supplierEmails;
          toUserLabel = supplierEmails.join(", ");
          displayUser = "Vendor";
        }
      }
    }

    if (emails.length === 0) {
      console.warn(`[TaskAssignmentHandler] No recipient emails for task ${event.taskId}`);
      return;
    }

    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    const taskTitle =
      event.taskSub?.trim() ||
      snapshot.taskDescription?.trim() ||
      snapshot.subject?.trim() ||
      templateEventId;
    const submittedBy = event.submittedBy?.trim() || snapshot.startedBy || "";
    const department = event.department?.trim() || "";
    const variables = event.variables || {};

    const params: Record<string, unknown> = {
      user: displayUser,
      taskTitle,
      submittedBy,
      department,
      linkUrl: appUrl,
      orgName: event.orgName || "S2P Labs",
      srmsRefNo: event.srmsRefNo?.trim() || snapshot.refNumber,
      invoiceNo: event.invoiceNo || "",
      description: event.description || "",
      supplierName: event.supplierName || "",
      ...variables,
      receiverEmail:event.receiverEmail || "",
    };

    for (const template of templates) {
      await this.sendOneTemplate(template, emails, toUserLabel, params, templateEventId);
    }
  }

  private async sendOneTemplate(
    template: NotificationTemplate,
    emails: string[],
    toUserLabel: string,
    params: Record<string, unknown>,
    templateEventId: string
  ): Promise<void> {
    const subject = emailService.mergeTemplate(template.notif_subject, params as Record<string, any>);
    const html = emailService.mergeTemplate(template.notif_content_tmplate, params as Record<string, any>);
    const smsMsg = emailService.mergeTemplate(template.sms_content_tmpl || template.notif_subject, params as Record<string, any>);

    const fromUser = template.from_role || "SYSTEM";
    const notifId = await emailService.saveEmailNotification(
      fromUser,
      emails.join(", "),
      subject,
      html,
      smsMsg,
      template.event_id || templateEventId,
      "New"
    );

    const { isSupplierFacingEventId } = await import("../../supplierEmailConfig");
    const sent = await emailService.sendEmail({
      to: emails.length === 1 ? emails[0] : emails,
      subject,
      html,
      eventId: templateEventId,
      isSupplierRecipient: isSupplierFacingEventId(templateEventId),
    });

    if (notifId) {
      await emailService.updateEmailNotificationStatus(notifId, sent ? "Sent" : "Failed");
    }
  }
}

export const taskAssignmentHandler = new TaskAssignmentHandler();
