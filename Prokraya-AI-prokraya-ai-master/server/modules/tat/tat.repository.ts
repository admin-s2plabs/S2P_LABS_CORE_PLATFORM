import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

// ── Workflows ─────────────────────────────────────────────────────────────────
export async function getWorkflows() {
  const res = await getPool().query(`SELECT id, name FROM dbo.wf_definition ORDER BY id`);
  return res.rows;
}

export async function getWorkflowSteps(workflowId: number) {
  const res = await getPool().query(
    `SELECT s.id, s.step_order, s.name, s.step_type,
            json_agg(json_build_object('id', a.id, 'type', a.assignment_type, 'expr', a.assignment_expression)) AS assignments
     FROM dbo.wf_step s
     LEFT JOIN dbo.wf_step_assignment a ON a.step_id = s.id
     WHERE s.wf_definition_id = $1
     GROUP BY s.id, s.step_order, s.name, s.step_type
     ORDER BY s.step_order`,
    [workflowId]
  );
  return res.rows;
}

// ── Rules ─────────────────────────────────────────────────────────────────────
export async function getTatRules() {
  const res = await getPool().query(`SELECT * FROM dbo.am_tat_rules ORDER BY module_key, stage_order`);
  return res.rows;
}

export async function replaceTatRules(moduleKey: string, rules: any[], userId: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM dbo.am_tat_rules WHERE module_key = $1`, [moduleKey]);
    for (const r of rules) {
      await client.query(
        `INSERT INTO dbo.am_tat_rules
           (module_key, sub_type, stage_order, stage_name, stage_type, tat_days,
            approver_step_id, is_supplier_stage, escalate_to_supplier, is_editable, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          moduleKey, r.sub_type || null, r.stage_order, r.stage_name, r.stage_type,
          r.tat_days, r.approver_step_id || null,
          r.is_supplier_stage || false, r.escalate_to_supplier || false,
          r.is_editable !== false, userId,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Overview ──────────────────────────────────────────────────────────────────
export async function getOverdueByModule() {
  const res = await getPool().query(
    `SELECT entity_type, COUNT(*) as cnt, SUM(overdue_days) as total_overdue
     FROM dbo.am_tat_logs WHERE is_overdue=true AND status NOT IN ('completed','skipped')
     GROUP BY entity_type`
  );
  return res.rows;
}

export async function getPendingByModule() {
  const res = await getPool().query(
    `SELECT entity_type, COUNT(*) as cnt
     FROM dbo.am_tat_logs WHERE status IN ('pending','in_progress')
     GROUP BY entity_type`
  );
  return res.rows;
}

export async function getOverviewStatsRow() {
  const res = await getPool().query(
    `SELECT
       COUNT(*) FILTER (WHERE is_overdue=true AND status NOT IN ('completed','skipped')) as overdue_count,
       COUNT(*) FILTER (WHERE status IN ('pending','in_progress')) as pending_count,
       COUNT(*) FILTER (WHERE status='completed') as completed_count,
       ROUND(AVG(actual_days) FILTER (WHERE status='completed')::numeric, 1) as avg_completion_days
     FROM dbo.am_tat_logs`
  );
  return res.rows[0];
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
export async function getLifecycleLogs(entityType: string, entityId: string) {
  const res = await getPool().query(
    `SELECT l.*, e.remark as escalation_remark, e.escalated_at, e.escalated_to_name
     FROM dbo.am_tat_logs l
     LEFT JOIN dbo.am_tat_escalations e ON e.tat_log_id = l.id
     WHERE l.entity_type = $1 AND l.entity_id = $2
     ORDER BY l.stage_order`,
    [entityType, entityId]
  );
  return res.rows;
}

export async function getLifecycleIds(entityType: string): Promise<string[]> {
  const upper = entityType.toUpperCase();
  let res;

  switch (upper) {
    case "PR":
      res = await getPool().query(
        `SELECT pr_number::text AS entity_id FROM dbo.supp_pr_header_dtls
         WHERE pr_number IS NOT NULL ORDER BY creation_date DESC LIMIT 100`
      );
      break;
    case "PO":
      res = await getPool().query(
        `SELECT po_number::text AS entity_id FROM dbo.supp_po_header_dtls
         WHERE po_number IS NOT NULL ORDER BY po_number DESC LIMIT 100`
      );
      break;
    case "BID":
      res = await getPool().query(
        `SELECT id::text AS entity_id FROM dbo.supp_bid_dtls ORDER BY id DESC LIMIT 100`
      );
      break;
    case "INVOICE":
      res = await getPool().query(
        `SELECT id::text AS entity_id FROM dbo.supp_invoice_dtls ORDER BY id DESC LIMIT 100`
      );
      break;
    case "VENDOR":
      res = await getPool().query(
        `SELECT id::text AS entity_id FROM dbo.supp_basic_org_dtls ORDER BY id DESC LIMIT 100`
      );
      break;
    case "DN":
      res = await getPool().query(
        `SELECT id::text AS entity_id FROM dbo.supp_delivery_hdr_dtls ORDER BY id DESC LIMIT 100`
      );
      break;
    case "GRN":
      res = await getPool().query(
        `SELECT mrr_number::text AS entity_id FROM dbo.supp_po_grn_insp_dtls
         WHERE mrr_number IS NOT NULL ORDER BY date_inspected DESC LIMIT 100`
      );
      break;
    default:
      res = await getPool().query(
        `SELECT DISTINCT entity_id FROM dbo.am_tat_logs WHERE entity_type=$1 ORDER BY entity_id LIMIT 100`,
        [upper]
      );
  }

  return res.rows.map((r: any) => r.entity_id).filter(Boolean);
}

// ── Alerts / Missed / Stallers / Ignored ──────────────────────────────────────
export async function getAlerts(entityType: string | null) {
  const res = entityType
    ? await getPool().query(
        `SELECT e.*, l.entity_type, l.stage_name, l.owner_name, l.owner_email
         FROM dbo.am_tat_escalations e
         JOIN dbo.am_tat_logs l ON l.id = e.tat_log_id
         WHERE l.entity_type = $1
         ORDER BY e.escalated_at DESC LIMIT 100`,
        [entityType]
      )
    : await getPool().query(
        `SELECT e.*, l.entity_type, l.stage_name, l.owner_name, l.owner_email
         FROM dbo.am_tat_escalations e
         JOIN dbo.am_tat_logs l ON l.id = e.tat_log_id
         ORDER BY e.escalated_at DESC LIMIT 100`
      );
  return res.rows;
}

export async function getMissedAlerts(entityType: string | null) {
  const res = entityType
    ? await getPool().query(
        `SELECT m.*, l.entity_type, l.entity_id, l.module_key
         FROM dbo.am_tat_missed_alerts m
         LEFT JOIN dbo.am_tat_logs l ON l.id = m.tat_log_id
         WHERE l.entity_type = $1
         ORDER BY m.updated_at DESC LIMIT 100`,
        [entityType]
      )
    : await getPool().query(
        `SELECT m.*, l.entity_type, l.entity_id, l.module_key
         FROM dbo.am_tat_missed_alerts m
         LEFT JOIN dbo.am_tat_logs l ON l.id = m.tat_log_id
         ORDER BY m.updated_at DESC LIMIT 100`
      );
  return res.rows;
}

export async function updateMissedAlertRemark(id: string, remark: string, userId: string) {
  await getPool().query(
    `UPDATE dbo.am_tat_missed_alerts SET remark=$1, updated_by=$2, updated_at=NOW() WHERE id=$3`,
    [remark, userId, id]
  );
}

export async function getStallers(entityType: string | null) {
  const res = entityType
    ? await getPool().query(
        `SELECT entity_type, stage_name, owner_name,
                COUNT(*) as occurrences,
                ROUND(AVG(overdue_days)::numeric, 1) as avg_overdue,
                MAX(overdue_days) as max_overdue
         FROM dbo.am_tat_logs
         WHERE is_overdue = true AND entity_type = $1
         GROUP BY entity_type, stage_name, owner_name
         ORDER BY avg_overdue DESC LIMIT 50`,
        [entityType]
      )
    : await getPool().query(
        `SELECT entity_type, stage_name, owner_name,
                COUNT(*) as occurrences,
                ROUND(AVG(overdue_days)::numeric, 1) as avg_overdue,
                MAX(overdue_days) as max_overdue
         FROM dbo.am_tat_logs
         WHERE is_overdue = true
         GROUP BY entity_type, stage_name, owner_name
         ORDER BY avg_overdue DESC LIMIT 50`
      );
  return res.rows;
}

export async function getIgnored(entityType: string | null) {
  const res = entityType
    ? await getPool().query(
        `SELECT * FROM dbo.am_tat_ignored WHERE entity_type = $1 ORDER BY ignored_at DESC LIMIT 100`,
        [entityType]
      )
    : await getPool().query(`SELECT * FROM dbo.am_tat_ignored ORDER BY ignored_at DESC LIMIT 100`);
  return res.rows;
}

export async function addIgnored(params: {
  entityType: string;
  entityId: string;
  stageName: string;
  reason: string;
  userId: string;
}) {
  await getPool().query(
    `INSERT INTO dbo.am_tat_ignored (entity_type, entity_id, stage_name, reason, ignored_by)
     VALUES ($1,$2,$3,$4,$5)`,
    [params.entityType, params.entityId, params.stageName, params.reason, params.userId]
  );
}

export async function addEscalation(params: {
  tatLogId?: number | null;
  entityType: string;
  entityId: string;
  stageName: string;
  escalatedFromUserId?: string | null;
  escalatedFromName?: string | null;
  escalatedToUserId?: string | null;
  escalatedToName?: string | null;
  ccUserIds?: string[];
  ccNames?: string[];
  remark: string;
  userId: string;
  isSupplierEscalation?: boolean;
}) {
  await getPool().query(
    `INSERT INTO dbo.am_tat_escalations
       (tat_log_id, entity_type, entity_id, stage_name,
        escalated_from_user_id, escalated_from_name,
        escalated_to_user_id, escalated_to_name,
        cc_user_ids, cc_names, remark, escalated_by, is_supplier_escalation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      params.tatLogId || null, params.entityType, params.entityId, params.stageName,
      params.escalatedFromUserId || null, params.escalatedFromName || null,
      params.escalatedToUserId || null, params.escalatedToName || null,
      params.ccUserIds || [], params.ccNames || [], params.remark, params.userId,
      params.isSupplierEscalation || false,
    ]
  );
}

// ── Audit logs ────────────────────────────────────────────────────────────────
export async function getTatAuditLogs() {
  const res = await getPool().query(
    `SELECT * FROM dbo.am_audit_log
     WHERE module = 'TAT' OR module ILIKE '%tat%'
     ORDER BY created_date DESC LIMIT 200`
  );
  return res.rows;
}
