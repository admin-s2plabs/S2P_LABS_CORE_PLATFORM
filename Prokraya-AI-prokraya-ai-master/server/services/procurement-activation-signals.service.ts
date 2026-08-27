import {
  buildSuggestedNotification,
  ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS,
  isActivationStageEnabled,
  isProcurementWorkflowTask,
  mapTaskToProcurementStage,
  PROCUREMENT_ACTIVATION_LIFECYCLE_ORDER,
  PROCUREMENT_ACTIVATION_STAGE_LABELS,
  PROCUREMENT_ALERT_TYPE_LABELS,
  type ProcurementActivationPreferences,
  type ProcurementActivationSignalsResponse,
  type ProcurementActivationStage,
  type ProcurementActivationStageId,
  type ProcurementActivationStageItem,
  type ProcurementAlertType,
} from "@shared/procurement-activation-signals";
import { CommonService } from "../modules/common/common.service";
import { pool } from "../modules/_shared";
import { getContextPool } from "../tenant-context";

function getDbPool() {
  return getContextPool() ?? pool;
}

function emptyBuckets(): Record<ProcurementActivationStageId, ProcurementActivationStageItem[]> {
  return PROCUREMENT_ACTIVATION_LIFECYCLE_ORDER.reduce(
    (acc, id) => {
      acc[id] = [];
      return acc;
    },
    {} as Record<ProcurementActivationStageId, ProcurementActivationStageItem[]>,
  );
}

function normalizeTask(task: any) {
  const subject = String(task.subject || task.description_ || "");
  return {
    subject,
    srmsRefNumber: String(task.srmsRefNumber || task.ref_number || ""),
    taskId: String(task.taskId || task.id_ || ""),
    taskName: String(task.taskName || task.name_ || ""),
    process_name: String(task.process_name || ""),
    title: subject,
  };
}

async function fetchOperationalAlerts(
  limitPerType = 25,
): Promise<ProcurementActivationStageItem[]> {
  const db = getDbPool();
  if (!db) return [];

  const items: ProcurementActivationStageItem[] = [];
  const push = (
    alertType: ProcurementAlertType,
    row: {
      title: string;
      poNumber?: string;
      invoiceId?: string;
      dnId?: string;
      subtitle?: string;
    },
  ) => {
    items.push({
      title: row.title,
      poNumber: row.poNumber,
      invoiceId: row.invoiceId,
      dnId: row.dnId,
      subtitle: row.subtitle,
      alertType,
    });
  };

  try {
    const ackResult = await db.query(
      `SELECT po_number, company_name, po_required_date
       FROM dbo.supp_po_header_dtls
       WHERE LOWER(TRIM(COALESCE(po_status, ''))) = 'approved'
         AND (attribute_13 IS NULL OR TRIM(attribute_13) = '')
       ORDER BY last_modified_date DESC NULLS LAST, creation_date DESC NULLS LAST
       LIMIT $1`,
      [limitPerType],
    );
    for (const row of ackResult.rows) {
      const poNumber = String(row.po_number || "");
      push("poAckPending", {
        title: `${poNumber} — awaiting supplier acknowledgement`,
        poNumber,
        subtitle: row.company_name ? String(row.company_name) : undefined,
      });
    }
  } catch (err) {
    console.warn("procurement alerts: poAckPending query failed", err);
  }

  try {
    const overdueResult = await db.query(
      `SELECT po_number, company_name, po_required_date, attribute_8
       FROM dbo.supp_po_header_dtls
       WHERE LOWER(TRIM(COALESCE(po_status, ''))) IN ('approved', 'complete')
         AND po_required_date IS NOT NULL
         AND po_required_date::date < CURRENT_DATE
         AND LOWER(TRIM(COALESCE(attribute_8, ''))) <> 'received'
       ORDER BY po_required_date ASC
       LIMIT $1`,
      [limitPerType],
    );
    for (const row of overdueResult.rows) {
      const poNumber = String(row.po_number || "");
      const receipt = String(row.attribute_8 || "Not Received");
      push("deliveryOverdue", {
        title: `${poNumber} — delivery overdue`,
        poNumber,
        subtitle: `Required ${row.po_required_date ? String(row.po_required_date).slice(0, 10) : "—"} · ${receipt}`,
      });
    }
  } catch (err) {
    console.warn("procurement alerts: deliveryOverdue query failed", err);
  }

  try {
    const receiptResult = await db.query(
      `SELECT po_number, company_name, attribute_8, po_required_date
       FROM dbo.supp_po_header_dtls
       WHERE LOWER(TRIM(COALESCE(po_status, ''))) IN ('approved', 'complete')
         AND LOWER(TRIM(COALESCE(attribute_8, ''))) IN ('', 'not received', 'partially received')
       ORDER BY last_modified_date DESC NULLS LAST
       LIMIT $1`,
      [limitPerType],
    );
    for (const row of receiptResult.rows) {
      const poNumber = String(row.po_number || "");
      // Avoid duplicating pure overdue items that already surfaced above — still useful when not overdue.
      const alreadyOverdue = items.some(
        (i) => i.alertType === "deliveryOverdue" && i.poNumber === poNumber,
      );
      if (alreadyOverdue) continue;
      push("receiptPending", {
        title: `${poNumber} — GRN / receipt pending`,
        poNumber,
        subtitle: String(row.attribute_8 || "Not Received"),
      });
    }
  } catch (err) {
    console.warn("procurement alerts: receiptPending query failed", err);
  }

  try {
    const dnResult = await db.query(
      `SELECT d.id, d.po_number, d.asn_number, d.expected_arrival_date, d.creation_date, d.status
       FROM dbo.supp_delivery_hdr_dtls d
       WHERE d.creation_date >= NOW() - INTERVAL '14 days'
          OR LOWER(TRIM(COALESCE(d.status, ''))) = 'pending'
       ORDER BY d.creation_date DESC NULLS LAST
       LIMIT $1`,
      [limitPerType],
    );
    for (const row of dnResult.rows) {
      const poNumber = String(row.po_number || "");
      const dnId = String(row.id || "");
      push("dnUpdated", {
        title: `${poNumber} — delivery note ${row.asn_number || dnId}`,
        poNumber,
        dnId,
        subtitle: row.expected_arrival_date
          ? `Expected ${String(row.expected_arrival_date).slice(0, 10)}`
          : String(row.status || "Pending"),
      });
    }
  } catch (err) {
    console.warn("procurement alerts: dnUpdated query failed", err);
  }

  try {
    const grnResult = await db.query(
      `SELECT DISTINCT ON (g.po_number)
          g.po_number, g.receiptnum, g.maximo_grn_id
       FROM dbo.supp_po_grn_line_dtls g
       WHERE LOWER(TRIM(COALESCE(g.status, ''))) = 'received'
         AND LOWER(TRIM(COALESCE(g.attribute_9, ''))) NOT IN ('invoiced', 'invoice submitted')
       ORDER BY g.po_number, g.receiptnum DESC NULLS LAST
       LIMIT $1`,
      [limitPerType],
    );
    for (const row of grnResult.rows) {
      const poNumber = String(row.po_number || "");
      push("grnReadyToInvoice", {
        title: `${poNumber} — GRN ready to invoice`,
        poNumber,
        subtitle: row.receiptnum ? `Receipt ${row.receiptnum}` : undefined,
      });
    }
  } catch (err) {
    console.warn("procurement alerts: grnReadyToInvoice query failed", err);
  }

  try {
    const invPending = await db.query(
      `SELECT id, invoice_number, po_number, invoice_status, inv_due_date, inv_match_status
       FROM dbo.supp_invoice_dtls
       WHERE LOWER(TRIM(COALESCE(invoice_status, ''))) = 'pending approval'
       ORDER BY last_modified_date DESC NULLS LAST, creation_date DESC NULLS LAST
       LIMIT $1`,
      [limitPerType],
    );
    for (const row of invPending.rows) {
      push("invoicePending", {
        title: `${row.invoice_number || row.id} — pending approval`,
        invoiceId: String(row.id),
        poNumber: row.po_number ? String(row.po_number) : undefined,
        subtitle: row.po_number ? `PO ${row.po_number}` : undefined,
      });
    }
  } catch (err) {
    console.warn("procurement alerts: invoicePending query failed", err);
  }

  try {
    const invMismatch = await db.query(
      `SELECT id, invoice_number, po_number, inv_match_status, invoice_status
       FROM dbo.supp_invoice_dtls
       WHERE UPPER(TRIM(COALESCE(inv_match_status, ''))) IN ('MISMATCHED', 'MISMATCH', 'FAILED')
          OR LOWER(TRIM(COALESCE(inv_match_status, ''))) LIKE '%mismatch%'
       ORDER BY last_modified_date DESC NULLS LAST
       LIMIT $1`,
      [limitPerType],
    );
    for (const row of invMismatch.rows) {
      push("invoiceMismatch", {
        title: `${row.invoice_number || row.id} — match issue`,
        invoiceId: String(row.id),
        poNumber: row.po_number ? String(row.po_number) : undefined,
        subtitle: String(row.inv_match_status || "Mismatched"),
      });
    }
  } catch (err) {
    console.warn("procurement alerts: invoiceMismatch query failed", err);
  }

  try {
    const invOverdue = await db.query(
      `SELECT id, invoice_number, po_number, inv_due_date, invoice_status
       FROM dbo.supp_invoice_dtls
       WHERE inv_due_date IS NOT NULL
         AND inv_due_date::date < CURRENT_DATE
         AND LOWER(TRIM(COALESCE(invoice_status, ''))) NOT IN ('paid', 'rejected', 'cancelled')
       ORDER BY inv_due_date ASC
       LIMIT $1`,
      [limitPerType],
    );
    for (const row of invOverdue.rows) {
      push("invoiceOverdue", {
        title: `${row.invoice_number || row.id} — overdue`,
        invoiceId: String(row.id),
        poNumber: row.po_number ? String(row.po_number) : undefined,
        subtitle: row.inv_due_date ? `Due ${String(row.inv_due_date).slice(0, 10)}` : undefined,
      });
    }
  } catch (err) {
    console.warn("procurement alerts: invoiceOverdue query failed", err);
  }

  // Rule-only anomaly/risk candidates: approved POs near required date with partial receipt history signals.
  try {
    const riskResult = await db.query(
      `SELECT po_number, company_name, po_required_date, attribute_8
       FROM dbo.supp_po_header_dtls
       WHERE LOWER(TRIM(COALESCE(po_status, ''))) = 'approved'
         AND po_required_date IS NOT NULL
         AND po_required_date::date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 14
         AND LOWER(TRIM(COALESCE(attribute_8, ''))) <> 'received'
       ORDER BY po_required_date ASC
       LIMIT $1`,
      [Math.min(10, limitPerType)],
    );
    for (const row of riskResult.rows) {
      const poNumber = String(row.po_number || "");
      if (items.some((i) => i.poNumber === poNumber && (i.alertType === "deliveryOverdue" || i.alertType === "poRiskCandidate"))) {
        continue;
      }
      push("poRiskCandidate", {
        title: `${poNumber} — delivery risk candidate`,
        poNumber,
        subtitle: PROCUREMENT_ALERT_TYPE_LABELS.poRiskCandidate,
      });
    }
  } catch (err) {
    console.warn("procurement alerts: poRiskCandidate query failed", err);
  }

  return items;
}

export async function getProcurementActivationSignals(
  sessionUser: any,
  activationPreferences?: ProcurementActivationPreferences,
): Promise<ProcurementActivationSignalsResponse> {
  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);
  const commonService = new CommonService();
  const buckets = emptyBuckets();
  const seenTaskIds = new Set<string>();

  const addItem = (stageId: ProcurementActivationStageId, item: ProcurementActivationStageItem) => {
    if (!isActivationStageEnabled(activationPreferences, stageId)) return;
    buckets[stageId].push(item);
  };

  const needsWorkflow =
    userId > 0 &&
    (["budgetApproval", "prApproval", "poApproval"] as const).some((id) =>
      isActivationStageEnabled(activationPreferences, id),
    );

  const [allTasksResult, alertItems] = await Promise.all([
    needsWorkflow
      ? commonService.getAllTasks(sessionUser, 0, 1000).catch(() => ({ tasks: [], total: 0 }))
      : Promise.resolve({ tasks: [] as any[], total: 0 }),
    // Phase 2: Alerts fetching disabled — flip ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS to re-enable.
    ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS &&
    isActivationStageEnabled(activationPreferences, "alerts")
      ? fetchOperationalAlerts(25).catch(() => [] as ProcurementActivationStageItem[])
      : Promise.resolve([] as ProcurementActivationStageItem[]),
  ]);

  for (const raw of allTasksResult.tasks) {
    const task = normalizeTask(raw);
    if (!isProcurementWorkflowTask(task)) continue;
    const stageId = mapTaskToProcurementStage(task);
    if (!stageId || stageId === "alerts" || stageId === "requested") continue;
    if (!task.srmsRefNumber) continue;
    if (task.taskId && seenTaskIds.has(task.taskId)) continue;
    if (task.taskId) seenTaskIds.add(task.taskId);

    const base = {
      title: task.title || task.srmsRefNumber,
      taskId: task.taskId || undefined,
    };

    if (stageId === "budgetApproval") {
      addItem(stageId, { ...base, budgetId: task.srmsRefNumber });
    } else if (stageId === "prApproval") {
      addItem(stageId, { ...base, prNumber: task.srmsRefNumber });
    } else if (stageId === "poApproval") {
      addItem(stageId, { ...base, poNumber: task.srmsRefNumber });
    }
  }

  // Cross-check entity statuses so terminal records do not linger as approval signals.
  try {
    const db = getDbPool();
    if (db) {
      const budgetIds = buckets.budgetApproval
        .map((i) => Number(i.budgetId))
        .filter((n) => Number.isFinite(n));
      if (budgetIds.length > 0) {
        const { rows } = await db.query(
          `SELECT id, status FROM dbo.am_budget_mst WHERE id = ANY($1)`,
          [budgetIds],
        );
        const statusById = new Map(
          rows.map((r: any) => [String(r.id), String(r.status || "").trim().toLowerCase()]),
        );
        buckets.budgetApproval = buckets.budgetApproval.filter((i) => {
          const st = statusById.get(String(i.budgetId));
          return st === undefined || st === "pending approval";
        });
      }

      const prNumbers = buckets.prApproval.map((i) => i.prNumber!).filter(Boolean);
      if (prNumbers.length > 0) {
        const { rows } = await db.query(
          `SELECT pr_number, pr_status FROM dbo.supp_pr_header_dtls WHERE pr_number = ANY($1)`,
          [prNumbers],
        );
        const statusById = new Map(
          rows.map((r: any) => [String(r.pr_number), String(r.pr_status || "").trim().toLowerCase()]),
        );
        buckets.prApproval = buckets.prApproval.filter((i) => {
          const st = statusById.get(String(i.prNumber));
          return st === undefined || st === "pending approval";
        });
      }

      const poNumbers = buckets.poApproval.map((i) => i.poNumber!).filter(Boolean);
      if (poNumbers.length > 0) {
        const { rows } = await db.query(
          `SELECT po_number, po_status FROM dbo.supp_po_header_dtls WHERE po_number = ANY($1)`,
          [poNumbers],
        );
        const statusById = new Map(
          rows.map((r: any) => [String(r.po_number), String(r.po_status || "").trim().toLowerCase()]),
        );
        buckets.poApproval = buckets.poApproval.filter((i) => {
          const st = statusById.get(String(i.poNumber));
          return st === undefined || st === "pending approval";
        });
      }
    }
  } catch (err) {
    console.warn("procurement activation signals: status cross-check failed", err);
  }

  for (const alert of alertItems) {
    addItem("alerts", alert);
  }

  // Requested is a scaffold — always empty until creation-request backend exists.
  // Phase 2: keep empty; Alerts also stay empty while ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS is false.
  buckets.requested = [];
  if (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS) {
    buckets.alerts = [];
  }

  const stages: ProcurementActivationStage[] = PROCUREMENT_ACTIVATION_LIFECYCLE_ORDER.map((id) => {
    const stageItems = buckets[id];
    // Hide Phase 2 stages from the response payload while the flag is off (idle / zero).
    if (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && (id === "alerts" || id === "requested")) {
      return {
        id,
        label: PROCUREMENT_ACTIVATION_STAGE_LABELS[id],
        status: "idle" as const,
        pendingCount: 0,
        items: [],
      };
    }
    const pendingCount = stageItems.length;
    return {
      id,
      label: PROCUREMENT_ACTIVATION_STAGE_LABELS[id],
      status: pendingCount > 0 ? "pending" : "idle",
      pendingCount,
      items: stageItems,
    };
  });

  const { message, nextStageId } = buildSuggestedNotification(stages);

  return {
    stages,
    suggestedNotification: message,
    nextStageId,
  };
}
