import {
  buildSuggestedNotification,
  isInvoiceWorkflowTask,
  isPayablesActivationStageEnabled,
  mapTaskToPayablesStage,
  PAYABLES_ACTIVATION_LIFECYCLE_ORDER,
  PAYABLES_ACTIVATION_STAGE_LABELS,
  type PayablesActivationPreferences,
  type PayablesActivationSignalsResponse,
  type PayablesActivationStage,
  type PayablesActivationStageId,
  type PayablesActivationStageItem,
} from "@shared/payables-activation-signals";
import { CommonService } from "../modules/common/common.service";
import { pool } from "../modules/_shared";
import { getContextPool } from "../tenant-context";

// Mirrors the sibling activation services: the tenant pool wins whenever a
// subdomain resolved, and falls back to the master pool on hosts without one.
function getDbPool() {
  return getContextPool() ?? pool;
}

function emptyBuckets(): Record<PayablesActivationStageId, PayablesActivationStageItem[]> {
  return PAYABLES_ACTIVATION_LIFECYCLE_ORDER.reduce(
    (acc, id) => {
      acc[id] = [];
      return acc;
    },
    {} as Record<PayablesActivationStageId, PayablesActivationStageItem[]>,
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

type InvoiceEnrichmentRow = {
  id: string;
  invoice_number?: string | null;
  invoice_status?: string | null;
  supplier_name?: string | null;
  description?: string | null;
  po_number?: string | null;
  invoice_amount?: string | number | null;
  invoice_curr_code?: string | null;
};

async function enrichPendingInvoicesBySrmsRef(
  srmsRefIds: string[],
): Promise<Map<string, InvoiceEnrichmentRow>> {
  const map = new Map<string, InvoiceEnrichmentRow>();
  if (srmsRefIds.length === 0) return map;

  const db = getDbPool();

  const uniqueIds = Array.from(new Set(srmsRefIds.map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return map;

  try {
    // Workflow tasks reference invoices via srmsRefNumber, which may be either the
    // numeric primary key (id) or the human invoice_number (e.g. NPI_00001). Match both.
    const { rows } = await db.query(
      `SELECT
          CAST(id AS VARCHAR) AS id,
          invoice_number,
          invoice_status,
          supplier_name,
          description,
          po_number,
          invoice_amount,
          invoice_curr_code
       FROM dbo.supp_invoice_dtls
       WHERE CAST(id AS VARCHAR) = ANY($1::text[])
          OR invoice_number = ANY($1::text[])`,
      [uniqueIds],
    );

    for (const row of rows as InvoiceEnrichmentRow[]) {
      const id = String(row.id || "").trim();
      const invoiceNumber = row.invoice_number != null ? String(row.invoice_number) : null;
      const normalized: InvoiceEnrichmentRow = {
        id,
        invoice_number: invoiceNumber,
        invoice_status: row.invoice_status != null ? String(row.invoice_status) : null,
        supplier_name: row.supplier_name != null ? String(row.supplier_name) : null,
        description: row.description != null ? String(row.description) : null,
        po_number: row.po_number != null ? String(row.po_number) : null,
        invoice_amount: row.invoice_amount,
        invoice_curr_code: row.invoice_curr_code != null ? String(row.invoice_curr_code) : null,
      };
      // Key by both id and invoice_number so callers can look up by whichever
      // value the workflow task carried in srmsRefNumber.
      if (id) map.set(id, normalized);
      if (invoiceNumber) map.set(invoiceNumber, normalized);
    }
  } catch (err) {
    console.warn("payables activation signals: invoice enrichment failed", err);
  }

  return map;
}

function isPendingApprovalStatus(status: string | null | undefined): boolean {
  return String(status || "").trim().toLowerCase() === "pending approval";
}

function buildInvoiceTitle(
  invoice: InvoiceEnrichmentRow | undefined,
  fallbackSubject: string,
  invoiceId: string,
): string {
  if (invoice?.invoice_number) {
    const supplier = invoice.supplier_name ? ` — ${invoice.supplier_name}` : "";
    return `${invoice.invoice_number}${supplier}`;
  }
  if (fallbackSubject?.trim()) return fallbackSubject.trim();
  return `Invoice ${invoiceId}`;
}

function buildInvoiceSubtitle(invoice: InvoiceEnrichmentRow | undefined): string | undefined {
  if (!invoice) return undefined;
  const parts: string[] = [];
  if (invoice.po_number) parts.push(`PO ${invoice.po_number}`);
  if (invoice.invoice_curr_code || invoice.invoice_amount != null) {
    const amount =
      invoice.invoice_amount != null && invoice.invoice_amount !== ""
        ? Number(invoice.invoice_amount).toLocaleString()
        : null;
    if (amount) {
      parts.push(`${invoice.invoice_curr_code || ""} ${amount}`.trim());
    }
  }
  if (invoice.description) parts.push(String(invoice.description).slice(0, 80));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export async function getPayablesActivationSignals(
  sessionUser: any,
  activationPreferences?: PayablesActivationPreferences,
): Promise<PayablesActivationSignalsResponse> {
  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);
  const commonService = new CommonService();
  const buckets = emptyBuckets();
  const seenTaskIds = new Set<string>();

  const addItem = (stageId: PayablesActivationStageId, item: PayablesActivationStageItem) => {
    if (!isPayablesActivationStageEnabled(activationPreferences, stageId)) return;
    buckets[stageId].push(item);
  };

  const needsWorkflow =
    userId > 0 && isPayablesActivationStageEnabled(activationPreferences, "invoiceApprovalRequest");

  const allTasksResult = needsWorkflow
    ? await commonService.getAllTasks(sessionUser, 0, 1000).catch(() => ({ tasks: [], total: 0 }))
    : { tasks: [] as any[], total: 0 };

  const candidateTasks: Array<{
    stageId: PayablesActivationStageId;
    invoiceId: string;
    taskId?: string;
    title: string;
  }> = [];

  for (const raw of allTasksResult.tasks) {
    const task = normalizeTask(raw);
    if (!isInvoiceWorkflowTask(task)) continue;
    const stageId = mapTaskToPayablesStage(task);
    if (!stageId) continue;
    if (!task.srmsRefNumber) continue;
    if (task.taskId && seenTaskIds.has(task.taskId)) continue;
    if (task.taskId) seenTaskIds.add(task.taskId);

    candidateTasks.push({
      stageId,
      invoiceId: String(task.srmsRefNumber),
      taskId: task.taskId || undefined,
      title: task.title || task.srmsRefNumber,
    });
  }

  const enrichment = await enrichPendingInvoicesBySrmsRef(
    candidateTasks.map((t) => t.invoiceId),
  );

  for (const candidate of candidateTasks) {
    const invoice = enrichment.get(String(candidate.invoiceId));
    // Authoritative filter: only live Pending Approval invoices contribute.
    if (!invoice || !isPendingApprovalStatus(invoice.invoice_status)) {
      continue;
    }

    addItem(candidate.stageId, {
      title: buildInvoiceTitle(invoice, candidate.title, candidate.invoiceId),
      taskId: candidate.taskId,
      invoiceId: String(invoice.id || candidate.invoiceId),
      invoiceNumber: invoice.invoice_number || undefined,
      supplierName: invoice.supplier_name || undefined,
      description: invoice.description || undefined,
      poNumber: invoice.po_number || undefined,
      subtitle: buildInvoiceSubtitle(invoice),
    });
  }

  const stages: PayablesActivationStage[] = PAYABLES_ACTIVATION_LIFECYCLE_ORDER.map((id) => {
    const stageItems = buckets[id];
    const pendingCount = stageItems.length;
    return {
      id,
      label: PAYABLES_ACTIVATION_STAGE_LABELS[id],
      status: pendingCount > 0 ? ("pending" as const) : ("idle" as const),
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
