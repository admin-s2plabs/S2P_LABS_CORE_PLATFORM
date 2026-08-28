import {
  extractCompanyFromSubject,
  isSupplierApprovalTask,
  SUPPLIER_ACTIVATION_STAGE_LABELS,
  type SupplierActivationSignalsResponse,
  type SupplierActivationStage,
  type SupplierActivationStageItem,
} from "@shared/supplier-activation-signals";

import { CommonService } from "../modules/common/common.service";
import { pool } from "../modules/_shared";
import { getContextPool } from "../tenant-context";

// Supplier header statuses that mean the request is already resolved — a lingering
// workflow task for one of these must not surface as a pending activation signal.
const TERMINAL_SUPPLIER_STATUSES = new Set(["active", "approved", "rejected"]);

function normalizeTask(task: any) {
  const subject = String(task?.subject || task?.description_ || "");
  return {
    subject,
    supplierId: String(task?.srmsRefNumber || task?.ref_number || ""),
    taskId: String(task?.taskId || task?.id_ || ""),
    taskName: String(task?.taskName || task?.name_ || ""),
    title: subject,
  };
}

export async function getSupplierActivationSignals(
  sessionUser: any,
): Promise<SupplierActivationSignalsResponse> {
  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);

  const commonService = new CommonService();

  const allTasksResult = userId
    ? await commonService.getAllTasks(sessionUser, 0, 1000).catch(() => ({ tasks: [], total: 0 }))
    : { tasks: [] as any[], total: 0 };

  const items: SupplierActivationStageItem[] = [];
  const seenTaskIds = new Set<string>();
  const seenSupplierIds = new Set<string>();

  for (const raw of allTasksResult.tasks) {
    const task = normalizeTask(raw);
    if (!isSupplierApprovalTask(task)) continue;
    if (!task.supplierId) continue;
    if (task.taskId && seenTaskIds.has(task.taskId)) continue;
    if (seenSupplierIds.has(task.supplierId)) continue;
    if (task.taskId) seenTaskIds.add(task.taskId);
    seenSupplierIds.add(task.supplierId);

    const companyName = extractCompanyFromSubject(task.subject);
    items.push({
      supplierId: task.supplierId,
      taskId: task.taskId || undefined,
      title: task.title || companyName,
      companyName,
    });
  }

  // A stale/duplicate workflow task can linger in act_ru_task after a supplier is already
  // approved (status "Active") or rejected. Cross-check the supplier header status and only
  // surface suppliers that are genuinely still pending approval — never terminal states.
  let pendingItems = items;
  try {
    const dbPool = getContextPool() ?? pool;
    if (dbPool && items.length > 0) {
      const ids = items.map((i) => Number(i.supplierId)).filter((n) => Number.isFinite(n));
      if (ids.length > 0) {
        const { rows } = await dbPool.query(
          `SELECT id, status FROM dbo.supp_basic_org_dtls WHERE id = ANY($1)`,
          [ids],
        );
        const statusById = new Map<string, string>(
          rows.map((r: any) => [String(r.id), String(r.status ?? "").trim().toLowerCase()]),
        );
        pendingItems = items.filter((i) => {
          const st = statusById.get(i.supplierId);
          // Fail-open: keep the item if the status is unknown, so we never hide a real task.
          return st === undefined || !TERMINAL_SUPPLIER_STATUSES.has(st);
        });
      }
    }
  } catch {
    pendingItems = items;
  }

  const pendingCount = pendingItems.length;
  const stage: SupplierActivationStage = {
    id: "supplierApproval",
    label: SUPPLIER_ACTIVATION_STAGE_LABELS.supplierApproval,
    status: pendingCount > 0 ? "pending" : "idle",
    pendingCount,
    items: pendingItems,
  };

  const suggestedNotification =
    pendingCount > 0
      ? `${pendingCount} supplier${pendingCount === 1 ? "" : "s"} pending your approval. Review the profile and approve directly from the Supplier Agent.`
      : null;

  return {
    stages: [stage],
    suggestedNotification,
  };
}
