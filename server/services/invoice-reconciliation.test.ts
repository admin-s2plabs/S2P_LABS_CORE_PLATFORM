import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  pool: { query: vi.fn() },
}));

vi.mock("../tenant-context", () => ({
  getContextPool: () => null,
}));

vi.mock("./propertiesService", () => ({
  propertiesService: {
    get: vi.fn(async (_k: string, def: string) => def),
  },
}));

import {
  allocateInvoiceToGrnFifo,
  buildPoReconciliation,
  classifyPoLineStatus,
  extractReconciliationFraudSignals,
  remainingGrnAfterPriorInvoices,
  withinRelativeTolerance,
  type GrnLineInput,
  type InvoiceLineInput,
  type PoLineInput,
} from "./invoice-reconciliation";

const poLine = (n: string, qty: number, id = Number(n)): PoLineInput => ({
  poLineId: id,
  poLineNumber: n,
  itemName: `Item ${n}`,
  orderedQty: qty,
  unitCost: 10,
  lineCost: qty * 10,
});

const grn = (
  id: number,
  poLineNumber: string,
  accepted: number,
  date: string
): GrnLineInput => ({
  grnLineId: id,
  poLineNumber,
  receivedQty: accepted,
  rejectedQty: 0,
  acceptedQty: accepted,
  receivedDate: date,
  receiptNum: String(id),
});

const inv = (
  lineId: number,
  invoiceId: string,
  poLineNumber: string,
  qty: number,
  date: string
): InvoiceLineInput => ({
  invoiceLineId: lineId,
  invoiceId,
  invoiceNumber: `INV-${invoiceId}`,
  invoiceDate: date,
  creationDate: date,
  poLineNumber,
  quantity: qty,
  unitCost: 10,
  lineCost: qty * 10,
  itemName: `Item ${poLineNumber}`,
});

describe("withinRelativeTolerance", () => {
  it("allows ±2% quantity variance", () => {
    expect(withinRelativeTolerance(102, 100, 0.02)).toBe(true);
    expect(withinRelativeTolerance(98, 100, 0.02)).toBe(true);
    expect(withinRelativeTolerance(103, 100, 0.02)).toBe(false);
  });

  it("allows ±1% price variance", () => {
    expect(withinRelativeTolerance(101, 100, 0.01)).toBe(true);
    expect(withinRelativeTolerance(102, 100, 0.01)).toBe(false);
  });
});

describe("classifyPoLineStatus", () => {
  it("fully matched when PO = GRN = invoice", () => {
    expect(classifyPoLineStatus(100, 100, 100, true)).toBe("fully_matched");
  });

  it("pending for legitimate partial invoice (less invoiced than received)", () => {
    expect(classifyPoLineStatus(100, 100, 40, true)).toBe("pending");
  });

  it("over_invoiced when invoice exceeds GRN", () => {
    expect(classifyPoLineStatus(100, 50, 60, true)).toBe("over_invoiced");
  });

  it("over_received when GRN exceeds PO", () => {
    expect(classifyPoLineStatus(100, 120, 100, true)).toBe("over_received");
  });

  it("2-way fully matched with no GRN", () => {
    expect(classifyPoLineStatus(100, 0, 100, false)).toBe("fully_matched");
  });

  it("2-way partially matched for partial invoice", () => {
    expect(classifyPoLineStatus(100, 0, 40, false)).toBe("partially_matched");
  });

  it("2-way over_invoiced", () => {
    expect(classifyPoLineStatus(100, 0, 110, false)).toBe("over_invoiced");
  });
});

describe("FIFO allocation", () => {
  it("allocates one invoice across multiple GRNs FIFO", () => {
    const { allocations, byInvoiceLine } = allocateInvoiceToGrnFifo(
      [inv(1, "A", "1", 70, "2026-01-10")],
      [grn(10, "1", 40, "2026-01-01"), grn(11, "1", 50, "2026-01-05")],
      new Map([["1", 1]])
    );
    expect(allocations).toHaveLength(2);
    expect(allocations[0].grn_line_id).toBe(10);
    expect(allocations[0].allocated_qty).toBe(40);
    expect(allocations[1].grn_line_id).toBe(11);
    expect(allocations[1].allocated_qty).toBe(30);
    expect(byInvoiceLine[0].unallocated_qty).toBe(0);
  });

  it("leaves unallocated qty when invoice exceeds GRNs", () => {
    const { byInvoiceLine } = allocateInvoiceToGrnFifo(
      [inv(1, "A", "1", 100, "2026-01-10")],
      [grn(10, "1", 40, "2026-01-01")],
      new Map([["1", 1]])
    );
    expect(byInvoiceLine[0].allocated_qty).toBe(40);
    expect(byInvoiceLine[0].unallocated_qty).toBe(60);
  });
});

describe("buildPoReconciliation scenarios", () => {
  it("1 PO + 1 GRN + 1 invoice → fully matched", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-1",
      poLines: [poLine("1", 100)],
      grnLines: [grn(1, "1", 100, "2026-01-01")],
      invoiceLines: [inv(1, "inv1", "1", 100, "2026-01-02")],
    });
    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.total_po_qty).toBe(100);
    expect(result.total_grn_qty).toBe(100);
    expect(result.total_invoice_qty).toBe(100);
    expect(result.balance_qty).toBe(0);
    expect(result.line_level_status[0].status).toBe("fully_matched");
    expect(result.allocation_details.allocations).toHaveLength(1);
  });

  it("1 PO + multiple GRNs + 1 invoice", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-2",
      poLines: [poLine("1", 100)],
      grnLines: [grn(1, "1", 40, "2026-01-01"), grn(2, "1", 60, "2026-01-03")],
      invoiceLines: [inv(1, "inv1", "1", 100, "2026-01-05")],
    });
    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.allocation_details.allocations).toHaveLength(2);
    expect(result.allocation_details.allocations.map((a) => a.allocated_qty)).toEqual([40, 60]);
  });

  it("1 PO + 1 GRN + multiple invoices (partial then complete)", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-3",
      poLines: [poLine("1", 100)],
      grnLines: [grn(1, "1", 100, "2026-01-01")],
      invoiceLines: [
        inv(1, "inv1", "1", 40, "2026-01-02"),
        inv(2, "inv2", "1", 60, "2026-01-04"),
      ],
    });
    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.total_invoice_qty).toBe(100);
    expect(result.allocation_details.by_invoice_line).toHaveLength(2);
  });

  it("multiple GRNs + multiple invoices", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-4",
      poLines: [poLine("1", 100), poLine("2", 50)],
      grnLines: [
        grn(1, "1", 60, "2026-01-01"),
        grn(2, "1", 40, "2026-01-02"),
        grn(3, "2", 50, "2026-01-03"),
      ],
      invoiceLines: [
        inv(1, "inv1", "1", 60, "2026-01-04"),
        inv(2, "inv2", "1", 40, "2026-01-05"),
        inv(3, "inv3", "2", 50, "2026-01-06"),
      ],
    });
    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.total_po_qty).toBe(150);
    expect(result.total_grn_qty).toBe(150);
    expect(result.total_invoice_qty).toBe(150);
  });

  it("partial delivery + partial invoice → pending", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-5",
      poLines: [poLine("1", 100)],
      grnLines: [grn(1, "1", 40, "2026-01-01")],
      invoiceLines: [inv(1, "inv1", "1", 20, "2026-01-02")],
    });
    expect(result.line_level_status[0].status).toBe("pending");
    expect(result.po_reconciliation_status).toBe("pending");
    expect(result.balance_qty).toBe(20);
  });

  it("over-invoice", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-6",
      poLines: [poLine("1", 100)],
      grnLines: [grn(1, "1", 50, "2026-01-01")],
      invoiceLines: [inv(1, "inv1", "1", 80, "2026-01-02")],
    });
    expect(result.po_reconciliation_status).toBe("over_invoiced");
    expect(result.allocation_details.unallocated_invoice_qty).toBe(30);
  });

  it("over-receipt", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-7",
      poLines: [poLine("1", 100)],
      grnLines: [grn(1, "1", 130, "2026-01-01")],
      invoiceLines: [inv(1, "inv1", "1", 100, "2026-01-02")],
    });
    expect(result.po_reconciliation_status).toBe("over_received");
  });

  it("2-way match with no GRN", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-8",
      poLines: [poLine("1", 100)],
      grnLines: [],
      invoiceLines: [inv(1, "inv1", "1", 100, "2026-01-02")],
    });
    expect(result.has_grn).toBe(false);
    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.total_grn_qty).toBe(0);
    expect(result.allocation_details.allocations).toHaveLength(0);
  });
});

describe("remainingGrnAfterPriorInvoices", () => {
  it("subtracts prior invoices from accepted GRN", () => {
    const rem = remainingGrnAfterPriorInvoices(
      "1",
      "inv2",
      [grn(1, "1", 100, "2026-01-01")],
      [inv(1, "inv1", "1", 40, "2026-01-02"), inv(2, "inv2", "1", 30, "2026-01-03")]
    );
    expect(rem.totalAccepted).toBe(100);
    expect(rem.priorInvoiced).toBe(40);
    expect(rem.remaining).toBe(60);
  });
});

describe("extractReconciliationFraudSignals", () => {
  it("flags over-invoiced lines", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-F1",
      poLines: [poLine("1", 100)],
      grnLines: [grn(1, "1", 50, "2026-01-01")],
      invoiceLines: [inv(1, "inv1", "1", 80, "2026-01-02")],
    });
    const signals = extractReconciliationFraudSignals(result, "inv1");
    expect(signals.some((s) => s.type === "over_invoiced_lines")).toBe(true);
  });

  it("flags repeated partial invoices", () => {
    const result = buildPoReconciliation({
      poNumber: "PO-F2",
      poLines: [poLine("1", 100)],
      grnLines: [grn(1, "1", 100, "2026-01-01")],
      invoiceLines: [
        inv(1, "inv1", "1", 20, "2026-01-02"),
        inv(2, "inv2", "1", 20, "2026-01-03"),
      ],
    });
    const signals = extractReconciliationFraudSignals(result, "inv2");
    expect(signals.some((s) => s.type === "repeated_partial_invoices")).toBe(true);
  });
});
