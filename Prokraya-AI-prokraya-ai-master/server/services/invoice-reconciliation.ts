/**
 * PO-centric invoice reconciliation + FIFO GRN allocation.
 * Pure logic lives here so OCR/matching can reuse it without duplication.
 */
import type { Pool } from "pg";
import { pool } from "../db";
import { getContextPool } from "../tenant-context";

const getPool = () => getContextPool() ?? pool;

/** Default FRD tolerances */
export const DEFAULT_QTY_TOLERANCE = 0.02; // ±2%
export const DEFAULT_PRICE_TOLERANCE = 0.01; // ±1%

export type PoLineReconcileStatus =
  | "fully_matched"
  | "partially_matched"
  | "pending"
  | "over_invoiced"
  | "over_received";

export interface ToleranceConfig {
  qtyTolerance: number;
  priceTolerance: number;
}

export interface PoLineInput {
  poLineId: number | null;
  poLineNumber: string;
  itemName: string | null;
  orderedQty: number;
  unitCost: number;
  lineCost: number;
}

export interface GrnLineInput {
  grnLineId: number;
  poLineNumber: string;
  receivedQty: number;
  rejectedQty: number;
  acceptedQty: number;
  receivedDate: string | Date | null;
  receiptNum: string | null;
}

export interface InvoiceLineInput {
  invoiceLineId: number;
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string | Date | null;
  creationDate: string | Date | null;
  poLineNumber: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
  itemName: string | null;
}

export interface AllocationEntry {
  invoice_line_id: number;
  invoice_id: string;
  invoice_number: string | null;
  grn_line_id: number;
  po_line_id: number | null;
  po_line_number: string;
  allocated_qty: number;
  receipt_num: string | null;
  grn_accepted_qty: number;
}

export interface InvoiceLineAllocationSummary {
  invoice_line_id: number;
  invoice_id: string;
  po_line_number: string;
  invoiced_qty: number;
  allocated_qty: number;
  unallocated_qty: number;
  allocations: AllocationEntry[];
}

export interface PoLineReconciliation {
  po_line_id: number | null;
  po_line_number: string;
  item_name: string | null;
  total_po_qty: number;
  total_grn_qty: number;
  total_invoice_qty: number;
  balance_qty: number;
  status: PoLineReconcileStatus;
  line_level_status: PoLineReconcileStatus;
}

export interface PoReconciliationResult {
  po_number: string;
  has_grn: boolean;
  po_reconciliation_status: PoLineReconcileStatus;
  total_po_qty: number;
  total_grn_qty: number;
  total_invoice_qty: number;
  balance_qty: number;
  line_level_status: PoLineReconciliation[];
  allocation_details: {
    allocations: AllocationEntry[];
    by_invoice_line: InvoiceLineAllocationSummary[];
    unallocated_invoice_qty: number;
  };
}

const STATUS_SEVERITY: Record<PoLineReconcileStatus, number> = {
  over_invoiced: 5,
  over_received: 4,
  partially_matched: 3,
  pending: 2,
  fully_matched: 1,
};

export function withinRelativeTolerance(
  actual: number,
  expected: number,
  tolerance: number
): boolean {
  if (expected === 0) return Math.abs(actual) <= 1e-9;
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerance;
}

export function exceedsByTolerance(
  actual: number,
  limit: number,
  tolerance: number
): boolean {
  if (limit === 0) return actual > 1e-9;
  return actual > limit * (1 + tolerance);
}

export function classifyPoLineStatus(
  orderedQty: number,
  receivedQty: number,
  invoicedQty: number,
  hasGrn: boolean,
  qtyTolerance: number = DEFAULT_QTY_TOLERANCE
): PoLineReconcileStatus {
  const po = orderedQty;
  const grn = hasGrn ? receivedQty : 0;
  const inv = invoicedQty;

  if (hasGrn) {
    // Over-invoiced takes priority
    if (exceedsByTolerance(inv, grn, qtyTolerance)) return "over_invoiced";
    // Over-received vs ordered
    if (exceedsByTolerance(grn, po, qtyTolerance)) return "over_received";
    // All three agree
    if (
      withinRelativeTolerance(grn, po, qtyTolerance) &&
      withinRelativeTolerance(inv, grn, qtyTolerance)
    ) {
      return "fully_matched";
    }
    // Less invoiced than received → pending (legitimate partial invoice)
    if (grn > 0 && inv < grn * (1 - qtyTolerance)) return "pending";
    // Partial receipt and/or invoice progress without full match
    if (grn > 0 || inv > 0) return "partially_matched";
    return "pending";
  }

  // 2-way (no GRN): compare invoice vs PO only
  if (exceedsByTolerance(inv, po, qtyTolerance)) return "over_invoiced";
  if (po > 0 && withinRelativeTolerance(inv, po, qtyTolerance)) return "fully_matched";
  if (inv > 0 && inv < po * (1 - qtyTolerance)) return "partially_matched";
  if (inv > 0) return "partially_matched";
  return "pending";
}

export function rollupPoStatus(statuses: PoLineReconcileStatus[]): PoLineReconcileStatus {
  if (statuses.length === 0) return "pending";
  return statuses.reduce((worst, s) =>
    STATUS_SEVERITY[s] > STATUS_SEVERITY[worst] ? s : worst
  );
}

function sortDateAsc(a: string | Date | null | undefined, b: string | Date | null | undefined): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}

/**
 * FIFO-allocate invoice quantities onto GRN lines (per PO line), oldest GRN first.
 * Supports splitting one invoice line across multiple GRNs.
 */
export function allocateInvoiceToGrnFifo(
  invoiceLines: InvoiceLineInput[],
  grnLines: GrnLineInput[],
  poLineIdByNumber: Map<string, number | null>
): {
  allocations: AllocationEntry[];
  byInvoiceLine: InvoiceLineAllocationSummary[];
  remainingGrnByLineId: Map<number, number>;
} {
  const remainingGrn = new Map<number, number>();
  const grnByPoLine = new Map<string, GrnLineInput[]>();

  const sortedGrn = [...grnLines].sort((a, b) => {
    const d = sortDateAsc(a.receivedDate, b.receivedDate);
    if (d !== 0) return d;
    return a.grnLineId - b.grnLineId;
  });

  for (const g of sortedGrn) {
    remainingGrn.set(g.grnLineId, Math.max(0, g.acceptedQty));
    const key = String(g.poLineNumber);
    if (!grnByPoLine.has(key)) grnByPoLine.set(key, []);
    grnByPoLine.get(key)!.push(g);
  }

  const sortedInv = [...invoiceLines].sort((a, b) => {
    const d = sortDateAsc(a.invoiceDate ?? a.creationDate, b.invoiceDate ?? b.creationDate);
    if (d !== 0) return d;
    return a.invoiceLineId - b.invoiceLineId;
  });

  const allocations: AllocationEntry[] = [];
  const byInvoiceLine: InvoiceLineAllocationSummary[] = [];

  for (const inv of sortedInv) {
    const poKey = String(inv.poLineNumber);
    const grns = grnByPoLine.get(poKey) || [];
    let remainingToAllocate = Math.max(0, inv.quantity);
    const lineAllocs: AllocationEntry[] = [];

    for (const g of grns) {
      if (remainingToAllocate <= 1e-9) break;
      const avail = remainingGrn.get(g.grnLineId) ?? 0;
      if (avail <= 1e-9) continue;
      const take = Math.min(avail, remainingToAllocate);
      remainingGrn.set(g.grnLineId, avail - take);
      remainingToAllocate -= take;
      const entry: AllocationEntry = {
        invoice_line_id: inv.invoiceLineId,
        invoice_id: inv.invoiceId,
        invoice_number: inv.invoiceNumber,
        grn_line_id: g.grnLineId,
        po_line_id: poLineIdByNumber.get(poKey) ?? null,
        po_line_number: poKey,
        allocated_qty: roundQty(take),
        receipt_num: g.receiptNum,
        grn_accepted_qty: g.acceptedQty,
      };
      allocations.push(entry);
      lineAllocs.push(entry);
    }

    const allocatedQty = roundQty(inv.quantity - remainingToAllocate);
    byInvoiceLine.push({
      invoice_line_id: inv.invoiceLineId,
      invoice_id: inv.invoiceId,
      po_line_number: poKey,
      invoiced_qty: roundQty(inv.quantity),
      allocated_qty: allocatedQty,
      unallocated_qty: roundQty(Math.max(0, remainingToAllocate)),
      allocations: lineAllocs,
    });
  }

  return { allocations, byInvoiceLine, remainingGrnByLineId: remainingGrn };
}

export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function buildPoReconciliation(params: {
  poNumber: string;
  poLines: PoLineInput[];
  grnLines: GrnLineInput[];
  invoiceLines: InvoiceLineInput[];
  qtyTolerance?: number;
}): PoReconciliationResult {
  const qtyTol = params.qtyTolerance ?? DEFAULT_QTY_TOLERANCE;
  const hasGrn = params.grnLines.some((g) => g.acceptedQty > 0 || g.receivedQty > 0);

  const poLineIdByNumber = new Map<string, number | null>();
  for (const pl of params.poLines) {
    poLineIdByNumber.set(String(pl.poLineNumber), pl.poLineId);
  }

  const grnAcceptedByPoLine = new Map<string, number>();
  for (const g of params.grnLines) {
    const key = String(g.poLineNumber);
    grnAcceptedByPoLine.set(key, (grnAcceptedByPoLine.get(key) || 0) + Math.max(0, g.acceptedQty));
  }

  const invByPoLine = new Map<string, number>();
  for (const inv of params.invoiceLines) {
    const key = String(inv.poLineNumber);
    invByPoLine.set(key, (invByPoLine.get(key) || 0) + Math.max(0, inv.quantity));
  }

  const { allocations, byInvoiceLine } = allocateInvoiceToGrnFifo(
    params.invoiceLines,
    params.grnLines,
    poLineIdByNumber
  );

  const line_level_status: PoLineReconciliation[] = params.poLines.map((pl) => {
    const key = String(pl.poLineNumber);
    const total_po_qty = roundQty(pl.orderedQty);
    const total_grn_qty = roundQty(grnAcceptedByPoLine.get(key) || 0);
    const total_invoice_qty = roundQty(invByPoLine.get(key) || 0);
    // Balance = remaining to invoice against received (3-way) or ordered (2-way)
    const basis = hasGrn ? total_grn_qty : total_po_qty;
    const balance_qty = roundQty(basis - total_invoice_qty);
    const status = classifyPoLineStatus(
      total_po_qty,
      total_grn_qty,
      total_invoice_qty,
      hasGrn,
      qtyTol
    );
    return {
      po_line_id: pl.poLineId,
      po_line_number: key,
      item_name: pl.itemName,
      total_po_qty,
      total_grn_qty,
      total_invoice_qty,
      balance_qty,
      status,
      line_level_status: status,
    };
  });

  const total_po_qty = roundQty(line_level_status.reduce((s, l) => s + l.total_po_qty, 0));
  const total_grn_qty = roundQty(line_level_status.reduce((s, l) => s + l.total_grn_qty, 0));
  const total_invoice_qty = roundQty(line_level_status.reduce((s, l) => s + l.total_invoice_qty, 0));
  const balance_qty = roundQty(
    (hasGrn ? total_grn_qty : total_po_qty) - total_invoice_qty
  );

  const unallocated_invoice_qty = roundQty(
    byInvoiceLine.reduce((s, l) => s + l.unallocated_qty, 0)
  );

  return {
    po_number: params.poNumber,
    has_grn: hasGrn,
    po_reconciliation_status: rollupPoStatus(line_level_status.map((l) => l.status)),
    total_po_qty,
    total_grn_qty,
    total_invoice_qty,
    balance_qty,
    line_level_status,
    allocation_details: {
      allocations,
      by_invoice_line: byInvoiceLine,
      unallocated_invoice_qty,
    },
  };
}

/** Remaining accepted GRN qty for a PO line after invoices other than currentInvoiceId. */
export function remainingGrnAfterPriorInvoices(
  poLineNumber: string,
  currentInvoiceId: string,
  grnLines: GrnLineInput[],
  invoiceLines: InvoiceLineInput[],
  qtyTolerance: number = DEFAULT_QTY_TOLERANCE
): { totalAccepted: number; priorInvoiced: number; remaining: number } {
  const key = String(poLineNumber);
  const totalAccepted = roundQty(
    grnLines
      .filter((g) => String(g.poLineNumber) === key)
      .reduce((s, g) => s + Math.max(0, g.acceptedQty), 0)
  );
  const priorInvoiced = roundQty(
    invoiceLines
      .filter((i) => String(i.poLineNumber) === key && String(i.invoiceId) !== String(currentInvoiceId))
      .reduce((s, i) => s + Math.max(0, i.quantity), 0)
  );
  const remaining = roundQty(Math.max(0, totalAccepted - priorInvoiced));
  // silence unused — tolerance reserved for callers comparing with withinRelativeTolerance
  void qtyTolerance;
  return { totalAccepted, priorInvoiced, remaining };
}

export async function loadToleranceConfig(): Promise<ToleranceConfig> {
  try {
    const { propertiesService } = await import("./propertiesService");
    const qtyRaw = await propertiesService.get("INVOICE_MATCH_QTY_TOLERANCE", String(DEFAULT_QTY_TOLERANCE));
    const priceRaw = await propertiesService.get("INVOICE_MATCH_PRICE_TOLERANCE", String(DEFAULT_PRICE_TOLERANCE));
    const qty = Number(qtyRaw);
    const price = Number(priceRaw);
    return {
      qtyTolerance: Number.isFinite(qty) && qty >= 0 ? qty : DEFAULT_QTY_TOLERANCE,
      priceTolerance: Number.isFinite(price) && price >= 0 ? price : DEFAULT_PRICE_TOLERANCE,
    };
  } catch {
    return { qtyTolerance: DEFAULT_QTY_TOLERANCE, priceTolerance: DEFAULT_PRICE_TOLERANCE };
  }
}

export async function loadPoReconciliationInputs(poNumber: string): Promise<{
  poLines: PoLineInput[];
  grnLines: GrnLineInput[];
  invoiceLines: InvoiceLineInput[];
}> {
  const db = getPool();

  const [poRes, grnRes, invRes] = await Promise.all([
    db.query(
      `SELECT id, po_line_number, item_name, line_description, line_qty, line_unit_cost, line_cost
       FROM dbo.supp_po_line_dtls WHERE po_number = $1 ORDER BY po_line_number ASC`,
      [poNumber]
    ),
    db.query(
      `SELECT maximo_grn_id, po_line_number, received_qty, rejected_qty, received_date, receiptnum, line_status
       FROM dbo.supp_po_grn_line_dtls
       WHERE po_number = $1 AND line_status = 'Received'
       ORDER BY received_date ASC NULLS LAST, maximo_grn_id ASC`,
      [poNumber]
    ),
    db.query(
      `SELECT il.id as invoice_line_id, il.invoice_id, i.invoice_number, i.invoice_date, i.creation_date,
              il.po_line_number, il.order_qty, il.order_unit_cost, il.order_cost, il.item_name
       FROM dbo.supp_invoice_line_dtls il
       JOIN dbo.supp_invoice_dtls i ON i.id = il.invoice_id
       WHERE i.po_number = $1
         AND i.invoice_status NOT IN ('Rejected', 'Cancelled')
         AND il.po_line_number IS NOT NULL
       ORDER BY COALESCE(i.invoice_date, i.creation_date) ASC NULLS LAST, il.id ASC`,
      [poNumber]
    ),
  ]);

  const poLines: PoLineInput[] = poRes.rows.map((r: any) => ({
    poLineId: r.id != null ? Number(r.id) : null,
    poLineNumber: String(r.po_line_number),
    itemName: r.item_name || r.line_description || null,
    orderedQty: Number(r.line_qty) || 0,
    unitCost: Number(r.line_unit_cost) || 0,
    lineCost: Number(r.line_cost) || 0,
  }));

  const grnLines: GrnLineInput[] = grnRes.rows.map((r: any) => {
    const received = Number(r.received_qty) || 0;
    const rejected = Number(r.rejected_qty) || 0;
    return {
      grnLineId: Number(r.maximo_grn_id),
      poLineNumber: String(r.po_line_number),
      receivedQty: received,
      rejectedQty: rejected,
      acceptedQty: received - rejected,
      receivedDate: r.received_date ?? null,
      receiptNum: r.receiptnum != null ? String(r.receiptnum) : null,
    };
  });

  const invoiceLines: InvoiceLineInput[] = invRes.rows.map((r: any) => ({
    invoiceLineId: Number(r.invoice_line_id),
    invoiceId: String(r.invoice_id),
    invoiceNumber: r.invoice_number ?? null,
    invoiceDate: r.invoice_date ?? null,
    creationDate: r.creation_date ?? null,
    poLineNumber: String(r.po_line_number),
    quantity: Number(r.order_qty) || 0,
    unitCost: Number(r.order_unit_cost) || 0,
    lineCost: Number(r.order_cost) || 0,
    itemName: r.item_name ?? null,
  }));

  return { poLines, grnLines, invoiceLines };
}

const _ensuredPools = new WeakSet<Pool>();

async function ensureReconciliationTables(targetPool: Pool): Promise<void> {
  if (_ensuredPools.has(targetPool)) return;
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS dbo.po_reconciliation (
      id                  serial PRIMARY KEY,
      po_number           varchar(100) NOT NULL,
      po_line_id          integer,
      po_line_number      varchar(50) NOT NULL,
      total_po_qty        numeric(18,4) NOT NULL DEFAULT 0,
      total_grn_qty       numeric(18,4) NOT NULL DEFAULT 0,
      total_invoice_qty   numeric(18,4) NOT NULL DEFAULT 0,
      balance_qty         numeric(18,4) NOT NULL DEFAULT 0,
      status              varchar(50) NOT NULL,
      triggered_by_invoice_id varchar(100),
      analyzed_at         timestamptz NOT NULL DEFAULT now(),
      UNIQUE (po_number, po_line_number)
    )
  `);
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS dbo.invoice_grn_allocation (
      id                serial PRIMARY KEY,
      invoice_line_id   integer NOT NULL,
      grn_line_id       integer NOT NULL,
      po_number         varchar(100),
      po_line_id        integer,
      po_line_number    varchar(50),
      allocated_qty     numeric(18,4) NOT NULL,
      triggered_by_invoice_id varchar(100),
      analyzed_at       timestamptz NOT NULL DEFAULT now(),
      UNIQUE (invoice_line_id, grn_line_id)
    )
  `);
  _ensuredPools.add(targetPool);
}

export async function persistPoReconciliation(
  result: PoReconciliationResult,
  triggeredByInvoiceId: string
): Promise<void> {
  const db = getPool();
  try {
    await ensureReconciliationTables(db);
    for (const line of result.line_level_status) {
      await db.query(
        `INSERT INTO dbo.po_reconciliation
           (po_number, po_line_id, po_line_number, total_po_qty, total_grn_qty,
            total_invoice_qty, balance_qty, status, triggered_by_invoice_id, analyzed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         ON CONFLICT (po_number, po_line_number)
         DO UPDATE SET
           po_line_id = EXCLUDED.po_line_id,
           total_po_qty = EXCLUDED.total_po_qty,
           total_grn_qty = EXCLUDED.total_grn_qty,
           total_invoice_qty = EXCLUDED.total_invoice_qty,
           balance_qty = EXCLUDED.balance_qty,
           status = EXCLUDED.status,
           triggered_by_invoice_id = EXCLUDED.triggered_by_invoice_id,
           analyzed_at = now()`,
        [
          result.po_number,
          line.po_line_id,
          line.po_line_number,
          line.total_po_qty,
          line.total_grn_qty,
          line.total_invoice_qty,
          line.balance_qty,
          line.status,
          triggeredByInvoiceId,
        ]
      );
    }

    // Replace allocations for this PO's invoice lines involved in this run
    const invoiceLineIds = result.allocation_details.by_invoice_line.map((l) => l.invoice_line_id);
    if (invoiceLineIds.length > 0) {
      await db.query(
        `DELETE FROM dbo.invoice_grn_allocation WHERE invoice_line_id = ANY($1::int[])`,
        [invoiceLineIds]
      );
    }
    for (const a of result.allocation_details.allocations) {
      await db.query(
        `INSERT INTO dbo.invoice_grn_allocation
           (invoice_line_id, grn_line_id, po_number, po_line_id, po_line_number,
            allocated_qty, triggered_by_invoice_id, analyzed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (invoice_line_id, grn_line_id)
         DO UPDATE SET
           allocated_qty = EXCLUDED.allocated_qty,
           po_number = EXCLUDED.po_number,
           po_line_id = EXCLUDED.po_line_id,
           po_line_number = EXCLUDED.po_line_number,
           triggered_by_invoice_id = EXCLUDED.triggered_by_invoice_id,
           analyzed_at = now()`,
        [
          a.invoice_line_id,
          a.grn_line_id,
          result.po_number,
          a.po_line_id,
          a.po_line_number,
          a.allocated_qty,
          triggeredByInvoiceId,
        ]
      );
    }
  } catch (err: any) {
    console.error("[po-reconciliation] persist failed:", err?.message || err);
  }
}

/** Fraud-oriented signals from a computed reconciliation result. */
export function extractReconciliationFraudSignals(
  result: PoReconciliationResult,
  currentInvoiceId: string
): Array<{
  type: string;
  label: string;
  severity: "high" | "medium" | "low";
  confidence: number;
  description: string;
  details: Record<string, any>;
}> {
  const signals: Array<{
    type: string;
    label: string;
    severity: "high" | "medium" | "low";
    confidence: number;
    description: string;
    details: Record<string, any>;
  }> = [];

  const overInvoiced = result.line_level_status.filter((l) => l.status === "over_invoiced");
  if (overInvoiced.length > 0) {
    signals.push({
      type: "over_invoiced_lines",
      label: "Over-Invoiced PO Line(s)",
      severity: "high",
      confidence: Math.min(98, 80 + overInvoiced.length * 5),
      description: `${overInvoiced.length} PO line(s) have invoiced quantity exceeding received/ordered quantity: ${overInvoiced
        .map((l) => `line ${l.po_line_number} (inv ${l.total_invoice_qty} vs basis ${result.has_grn ? l.total_grn_qty : l.total_po_qty})`)
        .join("; ")}.`,
      details: {
        lines: overInvoiced.map((l) => ({
          po_line_id: l.po_line_id,
          po_line_number: l.po_line_number,
          total_po_qty: l.total_po_qty,
          total_grn_qty: l.total_grn_qty,
          total_invoice_qty: l.total_invoice_qty,
        })),
      },
    });
  }

  // Repeated partial invoices against same PO lines (current invoice is one of multiple partials)
  const currentLineIds = new Set(
    result.allocation_details.by_invoice_line
      .filter((l) => String(l.invoice_id) === String(currentInvoiceId))
      .map((l) => l.po_line_number)
  );
  const partialLines = result.line_level_status.filter(
    (l) =>
      (l.status === "pending" || l.status === "partially_matched") &&
      l.total_invoice_qty > 0 &&
      currentLineIds.has(l.po_line_number)
  );
  const multiInvoicePartials = partialLines.filter((l) => {
    const distinctInvoices = new Set(
      result.allocation_details.by_invoice_line
        .filter((a) => a.po_line_number === l.po_line_number && a.invoiced_qty > 0)
        .map((a) => a.invoice_id)
    );
    return distinctInvoices.size >= 2;
  });
  if (multiInvoicePartials.length > 0) {
    signals.push({
      type: "repeated_partial_invoices",
      label: "Repeated Partial Invoices",
      severity: "medium",
      confidence: Math.min(90, 65 + multiInvoicePartials.length * 8),
      description: `${multiInvoicePartials.length} PO line(s) have multiple partial invoices without full reconciliation. Pattern may warrant review.`,
      details: {
        lines: multiInvoicePartials.map((l) => ({
          po_line_number: l.po_line_number,
          total_invoice_qty: l.total_invoice_qty,
          total_grn_qty: l.total_grn_qty,
          status: l.status,
        })),
      },
    });
  }

  const mismatchLike = result.line_level_status.filter((l) =>
    l.status === "over_invoiced" || l.status === "over_received"
  );
  if (mismatchLike.length >= 2) {
    signals.push({
      type: "recurring_mismatch_pattern",
      label: "Recurring Mismatch Pattern",
      severity: "medium",
      confidence: Math.min(92, 70 + mismatchLike.length * 5),
      description: `${mismatchLike.length} PO lines show over-invoice or over-receipt variances on PO ${result.po_number}.`,
      details: {
        po_number: result.po_number,
        statuses: mismatchLike.map((l) => ({
          po_line_number: l.po_line_number,
          status: l.status,
        })),
      },
    });
  }

  return signals;
}
