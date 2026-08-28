import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRow {
  [key: string]: any;
}

interface Scenario {
  invoice: FakeRow;
  invoiceLines: FakeRow[];
  poLines: FakeRow[];
  grnLines: FakeRow[];
  /** Every invoice line on the PO, across all invoices. */
  allInvoiceLines: FakeRow[];
  documents: FakeRow[];
}

let scenario: Scenario;

function grnSummaryRows(grnLines: FakeRow[]): FakeRow[] {
  const byLine = new Map<string, { received: number; rejected: number }>();
  for (const g of grnLines) {
    const key = String(g.po_line_number);
    const cur = byLine.get(key) || { received: 0, rejected: 0 };
    cur.received += Number(g.received_qty) || 0;
    cur.rejected += Number(g.rejected_qty) || 0;
    byLine.set(key, cur);
  }
  return Array.from(byLine.entries()).map(([po_line_number, v]) => ({
    po_line_number,
    total_received_qty: v.received,
    total_rejected_qty: v.rejected,
  }));
}

const query = vi.fn(async (sql: string) => {
  const text = String(sql);
  if (text.includes("CREATE TABLE") || text.includes("INSERT INTO dbo.po_reconciliation")
    || text.includes("INSERT INTO dbo.invoice_grn_allocation") || text.includes("DELETE FROM dbo.invoice_grn_allocation")) {
    return { rows: [] };
  }
  if (text.includes("FROM dbo.supp_invoice_dtls WHERE id")) {
    return { rows: [scenario.invoice] };
  }
  if (text.includes("FROM dbo.supp_invoice_line_dtls WHERE invoice_id")) {
    return { rows: scenario.invoiceLines };
  }
  if (text.includes("FROM dbo.supp_po_line_dtls WHERE po_number")) {
    return { rows: scenario.poLines };
  }
  if (text.includes("COALESCE(SUM(received_qty)")) {
    return { rows: grnSummaryRows(scenario.grnLines) };
  }
  if (text.includes("FROM dbo.supp_po_grn_line_dtls")) {
    return { rows: scenario.grnLines };
  }
  if (text.includes("FROM dbo.supp_document_dtls")) {
    return { rows: scenario.documents };
  }
  if (text.includes("JOIN dbo.supp_invoice_dtls i ON i.id = il.invoice_id")) {
    return { rows: scenario.allInvoiceLines };
  }
  return { rows: [] };
});

vi.mock("../db", () => ({ pool: { query: (...args: any[]) => query(args[0] as string) } }));
vi.mock("../tenant-context", () => ({ getContextPool: () => null }));

/** Pages the mocked PDF renderer hands back for a PDF upload. */
let renderedPdf: { pageCount: number; pages: Array<{ pageNumber: number; png: Buffer }> } | null = null;

vi.mock("../modules/_shared/pdf-preview", () => ({
  renderPdfFirstPageToPngBuffer: vi.fn(async () => null),
  renderPdfPagesToPngBuffers: vi.fn(async () => renderedPdf),
  extractPdfPagesText: vi.fn(async () => null),
}));
vi.mock("./propertiesService", () => ({
  propertiesService: { get: vi.fn(async (_k: string, def: string) => def) },
}));

/** Bytes the mocked Azure download returns for `doc_path`, or null to simulate a failure. */
let azureFile: Buffer | null = null;
vi.mock("./azure-blob.service", () => ({
  downloadFileFromAzure: vi.fn(async () => {
    if (!azureFile) throw new Error("blob not found");
    return azureFile;
  }),
}));

/** Raw OCR JSON the mocked vision model returns, keyed by page number of the upload. */
let pageResponses: Record<number, any> = {};

vi.mock("./ai-client", () => ({
  getAIModelName: vi.fn(async () => "test-model"),
  getAIClient: vi.fn(async () => ({
    chat: {
      completions: {
        create: vi.fn(async ({ messages }: any) => {
          const asText = JSON.stringify(messages);
          if (asText.includes("OCR extraction specialist")) {
            const pageMatch = asText.match(/This is page (\d+) of/);
            const pageNumber = pageMatch ? Number(pageMatch[1]) : 1;
            const payload = pageResponses[pageNumber];
            return {
              choices: [{ message: { content: payload ? JSON.stringify(payload) : "unreadable" } }],
            };
          }
          // Force the deterministic narrative path so assertions are stable.
          throw new Error("narrative model unavailable");
        }),
      },
    },
  })),
}));

import { analyzeInvoiceMatch, buildDeterministicNarrative } from "./invoice-match-service";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const PDF_BYTES = Buffer.from("%PDF-1.4\nfake pdf body", "utf8");

/** One OCR'd page of an invoice, in the shape the extractor expects back from the model. */
function invoicePageJson(overrides: Record<string, any> = {}) {
  return {
    document_type: "invoice",
    document_number: "INV-CURRENT",
    is_continuation: false,
    readable: true,
    invoice_date: "2026-01-10",
    vendor_name: "Acme Steel",
    po_number: "PO-1",
    currency: "USD",
    subtotal: 1000,
    tax: 0,
    total: 1000,
    charges: [],
    line_item_table_found: true,
    column_headers: ["Description", "Qty", "Unit Price", "Amount"],
    line_items: [
      {
        row_index: 1,
        row_source: "line_item_table",
        item_name: "Steel Rod",
        description: "Steel Rod",
        quantity: 100,
        unit_price: 10,
        total_price: 1000,
      },
    ],
    page_confidence: 0.95,
    unavailable_fields: [],
    notes: null,
    ...overrides,
  };
}

function pdfDocument(pageCount: number, filename = "invoice.pdf") {
  renderedPdf = {
    pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => ({ pageNumber: i + 1, png: PNG_BYTES })),
  };
  return [{ id: 1, doc_no: "inv-current", doc_name: filename, filename, doc_uri: PDF_BYTES }];
}

/** A syntactically valid PNG header with the given dimensions. */
function pngOfSize(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function poLine(overrides: FakeRow = {}): FakeRow {
  return {
    id: 501,
    po_number: "PO-1",
    po_line_number: "1",
    item_name: "Steel Rod",
    line_description: "Steel Rod",
    line_qty: 100,
    line_unit_cost: 10,
    line_cost: 1000,
    line_status: "Approved",
    ...overrides,
  };
}

function grnLine(overrides: FakeRow = {}): FakeRow {
  return {
    maximo_grn_id: 901,
    po_number: "PO-1",
    po_line_number: "1",
    received_qty: 100,
    rejected_qty: 0,
    received_date: "2026-01-05",
    receiptnum: "RCPT-1",
    line_status: "Received",
    ...overrides,
  };
}

function invoiceLine(overrides: FakeRow = {}): FakeRow {
  return {
    id: 701,
    invoice_id: "inv-current",
    line_number: 1,
    item_name: "Steel Rod",
    description: "Steel Rod",
    order_qty: 100,
    order_unit_cost: 10,
    order_cost: 1000,
    po_number: "PO-1",
    po_line_number: "1",
    ...overrides,
  };
}

function reconInvoiceLine(overrides: FakeRow = {}): FakeRow {
  return {
    invoice_line_id: 701,
    invoice_id: "inv-current",
    invoice_number: "INV-CURRENT",
    invoice_date: "2026-01-10",
    creation_date: "2026-01-10",
    po_line_number: "1",
    order_qty: 100,
    order_unit_cost: 10,
    order_cost: 1000,
    item_name: "Steel Rod",
    ...overrides,
  };
}

beforeEach(() => {
  query.mockClear();
  pageResponses = {};
  renderedPdf = null;
  azureFile = null;
  scenario = {
    invoice: {
      id: "inv-current",
      invoice_number: "INV-CURRENT",
      po_number: "PO-1",
      supplier_name: "Acme Steel",
      supplier_id: 7,
      invoice_amount: 1000,
      invoice_curr_code: "USD",
      invoice_status: "Pending",
    },
    invoiceLines: [invoiceLine()],
    poLines: [poLine()],
    grnLines: [grnLine()],
    allInvoiceLines: [reconInvoiceLine()],
    documents: [],
  };
});

describe("single invoice fully matched", () => {
  it("keeps per-line quantities consistent with the PO balance", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.balance_qty).toBe(0);

    const line = result.lineMatches[0];
    expect(line.remainingGrnBeforeThisInvoice).toBe(100);
    expect(line.allocatedQty).toBe(100);
    expect(line.unallocatedQty).toBe(0);
    expect(line.poLineBalanceQty).toBe(0);
    // remaining before − invoiced = final PO line balance
    expect((line.remainingGrnBeforeThisInvoice ?? 0) - (line.invoiceQty ?? 0)).toBe(line.poLineBalanceQty);
    expect(line.matchStatus).toBe("matched");
  });

  it("does not describe a fully matched PO as unmatched", async () => {
    const result = await analyzeInvoiceMatch("inv-current");
    const narrative = result.summary.narrative.toLowerCase();

    expect(narrative).toContain("fully matched");
    expect(narrative).not.toContain("could not be matched");
    expect(narrative).not.toContain("unmatched");
  });
});

describe("multiple invoices on one PO", () => {
  beforeEach(() => {
    scenario.invoice.invoice_amount = 600;
    scenario.invoiceLines = [invoiceLine({ id: 702, order_qty: 60, order_cost: 600 })];
    scenario.allInvoiceLines = [
      reconInvoiceLine({
        invoice_line_id: 701,
        invoice_id: "inv-prior",
        invoice_number: "INV-PRIOR",
        invoice_date: "2026-01-08",
        order_qty: 40,
        order_cost: 400,
      }),
      reconInvoiceLine({ invoice_line_id: 702, order_qty: 60, order_cost: 600 }),
    ];
  });

  it("reports remaining before this invoice and a zero final balance", async () => {
    const result = await analyzeInvoiceMatch("inv-current");
    const line = result.lineMatches[0];

    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.total_invoice_qty).toBe(100);
    expect(line.priorInvoicedQty).toBe(40);
    expect(line.remainingGrnBeforeThisInvoice).toBe(60);
    expect(line.allocatedQty).toBe(60);
    expect(line.poLineBalanceQty).toBe(0);
    expect((line.remainingGrnBeforeThisInvoice ?? 0) - (line.invoiceQty ?? 0)).toBe(line.poLineBalanceQty);
    expect(line.matchStatus).toBe("matched");
    expect(result.summary.narrative.toLowerCase()).not.toContain("unmatched");
  });
});

describe("partial invoice against partial delivery", () => {
  beforeEach(() => {
    scenario.invoice.invoice_amount = 200;
    scenario.grnLines = [grnLine({ received_qty: 40 })];
    scenario.invoiceLines = [invoiceLine({ order_qty: 20, order_cost: 200 })];
    scenario.allInvoiceLines = [reconInvoiceLine({ order_qty: 20, order_cost: 200 })];
  });

  it("is pending, not a mismatch, and balances against the receipt", async () => {
    const result = await analyzeInvoiceMatch("inv-current");
    const line = result.lineMatches[0];

    expect(result.po_reconciliation_status).toBe("pending");
    expect(result.balance_qty).toBe(20);
    expect(line.remainingGrnBeforeThisInvoice).toBe(40);
    expect(line.allocatedQty).toBe(20);
    expect(line.poLineBalanceQty).toBe(20);
    expect((line.remainingGrnBeforeThisInvoice ?? 0) - (line.invoiceQty ?? 0)).toBe(line.poLineBalanceQty);
    expect(line.matchStatus).toBe("pending");
    expect(line.mismatches).toHaveLength(0);

    const narrative = result.summary.narrative.toLowerCase();
    expect(narrative).toContain("pending");
    expect(narrative).not.toContain("unmatched");
  });
});

describe("document mismatch with a fully matched PO", () => {
  beforeEach(() => {
    scenario.documents = [
      { id: 1, doc_no: "inv-current", doc_name: "invoice.png", filename: "invoice.png", doc_uri: PNG_BYTES },
    ];
    pageResponses[1] = invoicePageJson({ document_number: "WRONG-999", total: 5000 });
  });

  it("flags the document while keeping PO reconciliation fully matched", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.summary.docExtractionStatus).toBe("extracted");
    expect(result.document_verification_status).toBe("mismatched");
    expect(result.summary.documentStatus).toBe("mismatched");
    expect(result.headerMismatches.length).toBeGreaterThan(0);

    // Quantity reconciliation must be unaffected by document discrepancies
    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.balance_qty).toBe(0);
    expect(result.lineMatches[0].poLineBalanceQty).toBe(0);
  });

  it("summarises document findings without calling the quantities unmatched", async () => {
    const result = await analyzeInvoiceMatch("inv-current");
    const narrative = result.summary.narrative.toLowerCase();

    expect(narrative).toContain("fully matched");
    expect(narrative).toContain("document");
    expect(narrative).not.toContain("could not be matched");
  });
});

describe("OCR failure keeps reconciliation intact", () => {
  beforeEach(() => {
    scenario.documents = [
      { id: 1, doc_no: "inv-current", doc_name: "invoice.png", filename: "invoice.png", doc_uri: Buffer.alloc(0) },
    ];
  });

  it("reports extraction_failed separately from PO status", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.document_verification_status).toBe("extraction_failed");
    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.summary.narrative.toLowerCase()).toContain("fully matched");
  });
});

describe("single-invoice document", () => {
  beforeEach(() => {
    scenario.documents = pdfDocument(1);
    pageResponses[1] = invoicePageJson();
  });

  it("reports one page, one invoice and verifies it against the record", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.summary.documentPageCount).toBe(1);
    expect(result.summary.documentInvoiceCount).toBe(1);
    expect(result.summary.documentInvoiceLineCount).toBe(1);
    expect(result.summary.documentOcrConfidence).toBe("high");
    expect(result.documentAnalysis?.supportingDocuments).toHaveLength(0);

    expect(result.document_verification_status).toBe("passed");
    expect(result.headerMismatches).toHaveLength(0);
    expect(result.documentLineMatches).toHaveLength(1);
    expect(result.documentLineMatches[0].docSourcePage).toBe(1);

    // Reconciliation is untouched by document verification
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });
});

describe("multi-page invoice document", () => {
  beforeEach(() => {
    scenario.invoice.invoice_amount = 1320;
    scenario.poLines = [
      poLine({ id: 501, po_line_number: "1", item_name: "Steel Rod", line_qty: 100, line_unit_cost: 10, line_cost: 1000 }),
      poLine({ id: 502, po_line_number: "2", item_name: "Steel Plate", line_qty: 5, line_unit_cost: 40, line_cost: 200 }),
      poLine({ id: 503, po_line_number: "3", item_name: "Steel Wire", line_qty: 2, line_unit_cost: 60, line_cost: 120 }),
    ];
    scenario.grnLines = [
      grnLine({ maximo_grn_id: 901, po_line_number: "1", received_qty: 100 }),
      grnLine({ maximo_grn_id: 902, po_line_number: "2", received_qty: 5 }),
      grnLine({ maximo_grn_id: 903, po_line_number: "3", received_qty: 2 }),
    ];
    scenario.invoiceLines = [
      invoiceLine({ id: 701, line_number: 1, po_line_number: "1", item_name: "Steel Rod", order_qty: 100, order_unit_cost: 10, order_cost: 1000 }),
      invoiceLine({ id: 702, line_number: 2, po_line_number: "2", item_name: "Steel Plate", order_qty: 5, order_unit_cost: 40, order_cost: 200 }),
      invoiceLine({ id: 703, line_number: 3, po_line_number: "3", item_name: "Steel Wire", order_qty: 2, order_unit_cost: 60, order_cost: 120 }),
    ];
    scenario.allInvoiceLines = [
      reconInvoiceLine({ invoice_line_id: 701, po_line_number: "1", item_name: "Steel Rod", order_qty: 100, order_unit_cost: 10, order_cost: 1000 }),
      reconInvoiceLine({ invoice_line_id: 702, po_line_number: "2", item_name: "Steel Plate", order_qty: 5, order_unit_cost: 40, order_cost: 200 }),
      reconInvoiceLine({ invoice_line_id: 703, po_line_number: "3", item_name: "Steel Wire", order_qty: 2, order_unit_cost: 60, order_cost: 120 }),
    ];

    scenario.documents = pdfDocument(3);
    // Header on page 1, continuation pages carry more lines, grand total lands on the last page.
    pageResponses[1] = invoicePageJson({ subtotal: null, tax: null, total: null });
    pageResponses[2] = invoicePageJson({
      document_number: null,
      is_continuation: true,
      invoice_date: null,
      vendor_name: null,
      subtotal: null,
      tax: null,
      total: null,
      line_items: [{ item_name: "Steel Plate", description: "Steel Plate", quantity: 5, unit_price: 40, total_price: 200 }],
    });
    pageResponses[3] = invoicePageJson({
      document_number: null,
      is_continuation: true,
      invoice_date: null,
      vendor_name: null,
      subtotal: 1320,
      tax: 0,
      total: 1320,
      line_items: [{ item_name: "Steel Wire", description: "Steel Wire", quantity: 2, unit_price: 60, total_price: 120 }],
    });
  });

  it("treats all three pages as one invoice and keeps every line item", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.summary.documentPageCount).toBe(3);
    expect(result.summary.documentInvoiceCount).toBe(1);
    expect(result.summary.documentInvoiceLineCount).toBe(3);

    const extraction = result.documentExtraction!;
    expect(extraction.pageNumbers).toEqual([1, 2, 3]);
    expect(extraction.extractedInvoiceNumber).toBe("INV-CURRENT");
    expect(extraction.extractedTotal).toBe(1320);
    expect(extraction.extractedLines.map((l) => l.itemName)).toEqual(["Steel Rod", "Steel Plate", "Steel Wire"]);
    expect(extraction.extractedLines.map((l) => l.sourcePage)).toEqual([1, 2, 3]);

    expect(result.documentLineMatches).toHaveLength(3);
    expect(result.documentLineMatches.every((dl) => dl.matchStatus === "matched")).toBe(true);
    expect(result.document_verification_status).toBe("passed");
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });
});

describe("one PDF holding two separate invoices", () => {
  beforeEach(() => {
    scenario.documents = pdfDocument(2, "invoice-batch.pdf");
    pageResponses[1] = invoicePageJson();
    pageResponses[2] = invoicePageJson({
      document_number: "INV-OTHER",
      po_number: "PO-9",
      subtotal: 2200,
      tax: 0,
      total: 2200,
      line_items: [{ item_name: "Copper Pipe", description: "Copper Pipe", quantity: 4, unit_price: 550, total_price: 2200 }],
    });
  });

  it("extracts both invoices and verifies only the one this record refers to", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.summary.documentPageCount).toBe(2);
    expect(result.summary.documentInvoiceCount).toBe(2);
    expect(result.documentAnalysis?.invoices.map((i) => i.invoiceNumber)).toEqual(["INV-CURRENT", "INV-OTHER"]);
    expect(result.documentAnalysis?.invoices.map((i) => i.isPrimary)).toEqual([true, false]);
    expect(result.documentAnalysis?.advisories.map((a) => a.code)).toContain("multiple_invoices");

    // The second invoice's pages must not bleed into the verified invoice
    const extraction = result.documentExtraction!;
    expect(extraction.extractedInvoiceNumber).toBe("INV-CURRENT");
    expect(extraction.pageNumbers).toEqual([1]);
    expect(extraction.extractedTotal).toBe(1000);
    expect(extraction.extractedLines.map((l) => l.itemName)).toEqual(["Steel Rod"]);
    expect(result.documentLineMatches).toHaveLength(1);

    expect(result.document_verification_status).toBe("passed");
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });
});

describe("invoice uploaded together with supporting documents", () => {
  beforeEach(() => {
    scenario.documents = pdfDocument(3, "invoice-with-grn.pdf");
    pageResponses[1] = invoicePageJson();
    pageResponses[2] = {
      document_type: "grn",
      document_number: "GRN-55",
      is_continuation: false,
      readable: true,
      page_confidence: 0.9,
      line_items: [{ item_name: "Steel Rod", quantity: 999, unit_price: 1, total_price: 999 }],
    };
    pageResponses[3] = {
      document_type: "challan",
      document_number: "CH-77",
      is_continuation: false,
      readable: true,
      page_confidence: 0.9,
      line_items: [{ item_name: "Steel Rod", quantity: 888, unit_price: 1, total_price: 888 }],
    };
  });

  it("never turns GRN or challan rows into invoice line items", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.summary.documentPageCount).toBe(3);
    expect(result.summary.documentInvoiceCount).toBe(1);
    expect(result.summary.documentInvoiceLineCount).toBe(1);

    expect(result.documentLineMatches).toHaveLength(1);
    expect(result.documentLineMatches[0].docQty).toBe(100);
    expect(result.documentLineMatches.some((dl) => dl.docQty === 999 || dl.docQty === 888)).toBe(false);

    expect(result.documentAnalysis?.supportingDocuments).toEqual([
      expect.objectContaining({ documentType: "grn", documentNumber: "GRN-55", pageNumbers: [2] }),
      expect.objectContaining({ documentType: "challan", documentNumber: "CH-77", pageNumbers: [3] }),
    ]);
    expect(result.documentAnalysis?.advisories.map((a) => a.code)).toContain("supporting_documents");

    expect(result.document_verification_status).toBe("passed");
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });

  it("fails document verification when the upload holds no invoice at all", async () => {
    delete pageResponses[1];
    pageResponses[1] = {
      document_type: "receipt",
      document_number: "RCPT-3",
      is_continuation: false,
      readable: true,
      page_confidence: 0.9,
      line_items: [],
    };

    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.documentExtraction).toBeNull();
    expect(result.document_verification_status).toBe("extraction_failed");
    expect(result.summary.documentInvoiceCount).toBe(0);
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });
});

describe("unclear OCR values", () => {
  beforeEach(() => {
    scenario.documents = pdfDocument(1);
    pageResponses[1] = invoicePageJson({
      total: null,
      line_items: [
        { item_name: "Steel Rod", description: "Steel Rod", quantity: null, unit_price: "illegible", total_price: 1000 },
      ],
    });
  });

  it("marks unreadable values unavailable instead of inventing them", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    const line = result.documentExtraction!.extractedLines[0];
    expect(line.quantity).toBeNull();
    expect(line.unitPrice).toBeNull();
    expect(line.lowConfidence).toBe(true);
    expect(line.unavailableFields).toEqual(expect.arrayContaining(["quantity", "unitPrice"]));

    expect(result.documentExtraction!.extractedTotal).toBeNull();
    expect(result.documentExtraction!.unavailableFields).toContain("total");
    expect(result.documentExtraction!.confidence).not.toBe("high");
    expect(result.documentAnalysis?.advisories.map((a) => a.code)).toContain("low_confidence");

    // An unreadable quantity is not a discrepancy — it is simply not compared
    const docLine = result.documentLineMatches[0];
    expect(docLine.docQty).toBeNull();
    expect(docLine.mismatches.map((m) => m.field)).not.toContain("quantity");
    expect(result.headerMismatches.map((m) => m.field)).not.toContain("total_amount");
  });
});

describe("documents that cannot be read reliably", () => {
  it("refuses to extract from a stored thumbnail and says why", async () => {
    scenario.documents = [
      { id: 1, doc_no: "inv-current", doc_name: "invoice.pdf", filename: "invoice.pdf", doc_uri: pngOfSize(280, 396) },
    ];
    pageResponses[1] = invoicePageJson();

    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.summary.docExtractionStatus).toBe("extraction_failed");
    expect(result.document_verification_status).toBe("extraction_failed");
    expect(result.documentExtraction).toBeNull();
    expect(result.documentAnalysis?.reliable).toBe(false);
    expect(result.documentAnalysis?.advisories.map((a) => a.code)).toContain("low_resolution");
    // Reconciliation is untouched by a document we could not read
    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.lineMatches).toHaveLength(1);
  });

  it("reads the original file from doc_path in preference to the thumbnail", async () => {
    renderedPdf = { pageCount: 2, pages: [{ pageNumber: 1, png: PNG_BYTES }, { pageNumber: 2, png: PNG_BYTES }] };
    scenario.documents = [
      {
        id: 1,
        doc_no: "inv-current",
        doc_name: "invoice.pdf",
        filename: "invoice.pdf",
        doc_path: "https://acct.blob.core.windows.net/files/invoice.pdf",
        doc_uri: pngOfSize(280, 396),
      },
    ];
    azureFile = PDF_BYTES;
    pageResponses[1] = invoicePageJson({ subtotal: null, tax: null, total: null });
    pageResponses[2] = invoicePageJson({ document_number: null, is_continuation: true, line_items: [] });

    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.documentAnalysis?.source).toBe("original_file");
    expect(result.documentAnalysis?.reliable).toBe(true);
    expect(result.summary.documentPageCount).toBe(2);
    expect(result.documentAnalysis?.advisories.map((a) => a.code)).not.toContain("low_resolution");
  });

  it("flags a grand total that was reported as a line item", async () => {
    scenario.documents = pdfDocument(1);
    pageResponses[1] = invoicePageJson({
      subtotal: 1000,
      tax: 240000,
      total: 1240000,
      line_items: [
        {
          row_source: "line_item_table",
          item_name: "Service Charge",
          quantity: 1,
          unit_price: 1240000,
          total_price: 1240000,
        },
      ],
    });

    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.documentAnalysis?.reliable).toBe(false);
    expect(result.documentAnalysis?.advisories.map((a) => a.code)).toContain("totals_mismatch");
    expect(result.documentExtraction!.totalsAgree).toBe(false);
    expect(result.documentExtraction!.confidence).toBe("low");
  });

  it("drops summary rows before they reach the line items", async () => {
    scenario.documents = pdfDocument(1);
    pageResponses[1] = invoicePageJson({
      line_items: [
        {
          row_source: "line_item_table",
          item_name: "Steel Rod",
          quantity: 100,
          unit_price: 10,
          total_price: 1000,
        },
        { row_source: "totals_block", item_name: "Grand Total", quantity: 1, unit_price: 1000, total_price: 1000 },
      ],
    });

    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.documentExtraction!.extractedLines.map((l) => l.itemName)).toEqual(["Steel Rod"]);
    expect(result.documentAnalysis?.reliable).toBe(true);
  });
});

describe("an invoice with several lines, tax and freight", () => {
  beforeEach(() => {
    // 1400 of goods plus 150 of freight net, with 252 of tax on top.
    scenario.invoice.invoice_amount = 1550;
    scenario.invoice.tax_amount = 252;
    scenario.poLines = [
      poLine({ id: 501, po_line_number: "1", item_name: "Steel Rod", line_qty: 100, line_unit_cost: 10, line_cost: 1000 }),
      poLine({ id: 502, po_line_number: "2", item_name: "Steel Plate", line_qty: 5, line_unit_cost: 40, line_cost: 200 }),
      poLine({ id: 503, po_line_number: "3", item_name: "Copper Pipe", line_qty: 4, line_unit_cost: 50, line_cost: 200 }),
      poLine({ id: 504, po_line_number: "4", item_name: "Freight", line_qty: 1, line_unit_cost: 150, line_cost: 150 }),
    ];
    scenario.grnLines = [
      grnLine({ maximo_grn_id: 901, po_line_number: "1", received_qty: 100 }),
      grnLine({ maximo_grn_id: 902, po_line_number: "2", received_qty: 5 }),
      grnLine({ maximo_grn_id: 903, po_line_number: "3", received_qty: 4 }),
      grnLine({ maximo_grn_id: 904, po_line_number: "4", received_qty: 1 }),
    ];
    scenario.invoiceLines = [
      invoiceLine({ id: 701, line_number: 1, po_line_number: "1", item_name: "Steel Rod", order_qty: 100, order_unit_cost: 10, order_cost: 1000 }),
      invoiceLine({ id: 702, line_number: 2, po_line_number: "2", item_name: "Steel Plate", order_qty: 5, order_unit_cost: 40, order_cost: 200 }),
      invoiceLine({ id: 703, line_number: 3, po_line_number: "3", item_name: "Copper Pipe", order_qty: 4, order_unit_cost: 50, order_cost: 200 }),
      invoiceLine({ id: 704, line_number: 4, po_line_number: "4", item_name: "Freight", order_qty: 1, order_unit_cost: 150, order_cost: 150 }),
    ];
    scenario.allInvoiceLines = [
      reconInvoiceLine({ invoice_line_id: 701, po_line_number: "1", item_name: "Steel Rod", order_qty: 100, order_unit_cost: 10, order_cost: 1000 }),
      reconInvoiceLine({ invoice_line_id: 702, po_line_number: "2", item_name: "Steel Plate", order_qty: 5, order_unit_cost: 40, order_cost: 200 }),
      reconInvoiceLine({ invoice_line_id: 703, po_line_number: "3", item_name: "Copper Pipe", order_qty: 4, order_unit_cost: 50, order_cost: 200 }),
      reconInvoiceLine({ invoice_line_id: 704, po_line_number: "4", item_name: "Freight", order_qty: 1, order_unit_cost: 150, order_cost: 150 }),
    ];

    scenario.documents = pdfDocument(1);
    // 1400 of goods + 150 freight + 252 tax = the 1802 grand total the document prints. The
    // freight sits in the totals block, not the item table, and the supplier lists the items
    // in a different order from the system entries.
    pageResponses[1] = invoicePageJson({
      subtotal: 1400,
      tax: 252,
      total: 1802,
      charges: [{ label: "Freight", amount: 150 }],
      line_items: [
        { row_source: "line_item_table", item_name: "Copper Pipe", quantity: 4, unit_price: 50, total_price: 200 },
        { row_source: "line_item_table", item_name: "Steel Rod", quantity: 100, unit_price: 10, total_price: 1000 },
        { row_source: "line_item_table", item_name: "Steel Plate", quantity: 5, unit_price: 40, total_price: 200 },
      ],
    });
  });

  it("reconciles the printed total against the tax and freight it includes", async () => {
    const result = await analyzeInvoiceMatch("inv-current");
    const extraction = result.documentExtraction!;

    expect(extraction.extractedSubtotal).toBe(1400);
    expect(extraction.extractedTax).toBe(252);
    expect(extraction.extractedOtherCharges).toBe(150);
    expect(extraction.extractedCharges.map((c) => c.label)).toEqual(["Freight"]);
    // The total is the printed one, and it adds up against the rest of the printed block
    expect(extraction.extractedTotal).toBe(1802);
    expect(extraction.totalsVerified).toBe(true);
    expect(extraction.totalsAgree).toBe(true);
    expect(result.documentAnalysis?.reliable).toBe(true);

    // A tax-inclusive grand total is not held against the tax-exclusive system amount
    expect(result.headerMismatches).toHaveLength(0);
    expect(result.document_verification_status).toBe("passed");
  });

  it("matches each document line to the line and PO line it belongs to, not to its position", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.documentLineMatches).toHaveLength(3);
    expect(result.documentLineMatches.map((dl) => dl.docItemName)).toEqual([
      "Copper Pipe",
      "Steel Rod",
      "Steel Plate",
    ]);
    // Each row lines up with its own counterpart even though the order differs
    expect(result.documentLineMatches.map((dl) => dl.systemItemName)).toEqual([
      "Copper Pipe",
      "Steel Rod",
      "Steel Plate",
    ]);
    expect(result.documentLineMatches.map((dl) => dl.poLineNumber)).toEqual(["3", "1", "2"]);
    expect(result.documentLineMatches.every((dl) => dl.matchStatus === "matched")).toBe(true);

    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.balance_qty).toBe(0);
  });
});

describe("invoice lines competing for the same PO line", () => {
  beforeEach(() => {
    scenario.invoice.invoice_amount = 1100;
    scenario.poLines = [poLine({ id: 501, po_line_number: "1", item_name: "Steel Rod", line_qty: 100, line_unit_cost: 10, line_cost: 1000 })];
    // Neither entry names a PO line, and both resemble the only PO line there is.
    scenario.invoiceLines = [
      invoiceLine({ id: 701, line_number: 1, po_line_number: null, item_name: "Steel Rod Clamp", order_qty: 5, order_unit_cost: 20, order_cost: 100 }),
      invoiceLine({ id: 702, line_number: 2, po_line_number: null, item_name: "Steel Rod", order_qty: 100, order_unit_cost: 10, order_cost: 1000 }),
    ];
    scenario.allInvoiceLines = [reconInvoiceLine({ invoice_line_id: 702, order_qty: 100, order_cost: 1000 })];
  });

  it("gives the PO line to the invoice line whose name actually matches it", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    const clamp = result.lineMatches.find((lm) => lm.invoiceItemName === "Steel Rod Clamp")!;
    const rod = result.lineMatches.find((lm) => lm.invoiceItemName === "Steel Rod")!;

    expect(rod.poLineNumber).toBe("1");
    // The loose resemblance does not get to claim the PO line first and squeeze the exact one out
    expect(clamp.poLineNumber).toBeNull();
    expect(result.lineMatches.filter((lm) => lm.poLineNumber === "1")).toHaveLength(1);
  });

  it("keeps a PO line reserved for the entry that names it outright", async () => {
    scenario.invoiceLines = [
      invoiceLine({ id: 701, line_number: 1, po_line_number: null, item_name: "Steel Rod", order_qty: 5, order_unit_cost: 20, order_cost: 100 }),
      invoiceLine({ id: 702, line_number: 2, po_line_number: "1", item_name: "SR-12 Bar", order_qty: 100, order_unit_cost: 10, order_cost: 1000 }),
    ];

    const result = await analyzeInvoiceMatch("inv-current");

    const named = result.lineMatches.find((lm) => lm.invoiceItemName === "SR-12 Bar")!;
    const byName = result.lineMatches.find((lm) => lm.invoiceItemName === "Steel Rod")!;

    expect(named.poLineNumber).toBe("1");
    expect(byName.poLineNumber).toBeNull();
    expect(result.lineMatches.filter((lm) => lm.poLineNumber === "1")).toHaveLength(1);
  });
});

describe("semantic and fuzzy item-name matching", () => {
  const matchingNames = [
    ["Electrical Gloves", "Electrical Safety Gloves"],
    ["Safety Gloves", "Electrical Safety Gloves"],
    ["Laptop Computer", "Laptop"],
    ["USB Type-C Cable", "USB C Cable"],
    ["Protective Safety Helmet", "Safety Helmet"],
    ["SS Steel Water Bottle", "Stainless Steel Water Bottle"],
    ["Safety Shoes Fiber Toe", "Safety Shoes"],
    ["Safety Helmet Protective", "Protective Safety Helmet"],
  ];

  it.each(matchingNames)(
    "matches %s to %s when quantity and price support the pairing",
    async (invoiceName, poName) => {
      scenario.poLines = [poLine({ item_name: poName, line_description: poName })];
      scenario.invoiceLines = [
        invoiceLine({ item_name: invoiceName, description: invoiceName, po_line_number: null }),
      ];
      scenario.allInvoiceLines = [reconInvoiceLine({ item_name: invoiceName })];

      const result = await analyzeInvoiceMatch("inv-current");
      const line = result.lineMatches[0];

      expect(line.poLineNumber).toBe("1");
      expect(line.poItemName).toBe(poName);
      expect(line.matchStatus).toBe("matched");
      expect(line.matchConfidence).not.toBe("low");
      expect(line.matchConfidenceScore).toBeGreaterThanOrEqual(68);
      expect(line.matchConfidenceReason).toContain("agree");
    }
  );

  it("does not force-match unrelated names just because only one PO line is available", async () => {
    scenario.poLines = [
      poLine({ item_name: "Electrical Safety Gloves", line_description: "Electrical Safety Gloves" }),
    ];
    scenario.invoiceLines = [
      invoiceLine({
        item_name: "Helmet with Ratchet White Udyogi",
        description: "Helmet with Ratchet White Udyogi",
        po_line_number: null,
      }),
    ];

    const result = await analyzeInvoiceMatch("inv-current");
    const line = result.lineMatches[0];

    expect(line.poLineNumber).toBeNull();
    expect(line.matchStatus).toBe("unmatched");
    expect(line.matchConfidence).toBe("low");
    expect(line.matchConfidenceReason).toContain("did not meet the safe auto-match threshold");
  });

  it("does not auto-match a similar name when quantity and price both conflict", async () => {
    scenario.poLines = [
      poLine({
        item_name: "Electrical Safety Gloves",
        line_description: "Electrical Safety Gloves",
        line_qty: 100,
        line_unit_cost: 10,
        line_cost: 1000,
      }),
    ];
    scenario.invoiceLines = [
      invoiceLine({
        item_name: "Safety Gloves",
        description: "Safety Gloves",
        po_line_number: null,
        order_qty: 2,
        order_unit_cost: 500,
        order_cost: 1000,
      }),
    ];

    const result = await analyzeInvoiceMatch("inv-current");
    const line = result.lineMatches[0];

    expect(line.poLineNumber).toBeNull();
    expect(line.matchConfidence).toBe("low");
    expect(line.matchConfidenceReason).toContain("conflicting quantity and unit price");
  });

  it("still matches an exact-name partial invoice when unit price identifies the PO line", async () => {
    scenario.poLines = [
      poLine({
        item_name: "Electrical Safety Gloves",
        line_description: "Electrical Safety Gloves",
        line_qty: 100,
        line_unit_cost: 10,
        line_cost: 1000,
      }),
    ];
    scenario.invoiceLines = [
      invoiceLine({
        item_name: "Electrical Safety Gloves",
        description: "Electrical Safety Gloves",
        po_line_number: null,
        order_qty: 20,
        order_unit_cost: 10,
        order_cost: 200,
      }),
    ];

    const result = await analyzeInvoiceMatch("inv-current");
    const line = result.lineMatches[0];

    expect(line.poLineNumber).toBe("1");
    expect(line.matchConfidence).toBe("medium");
    expect(line.matchConfidenceReason).toContain("unit price agree");
  });

  it("keeps OCR confidence separate from semantic match confidence", async () => {
    scenario.poLines = [
      poLine({ item_name: "Electrical Safety Gloves", line_description: "Electrical Safety Gloves" }),
    ];
    scenario.invoiceLines = [
      invoiceLine({ item_name: "Electrical Safety Gloves", description: "Electrical Safety Gloves" }),
    ];
    scenario.allInvoiceLines = [
      reconInvoiceLine({ item_name: "Electrical Safety Gloves" }),
    ];
    scenario.documents = pdfDocument(1);
    pageResponses[1] = invoicePageJson({
      line_items: [
        {
          row_source: "line_item_table",
          item_name: "Safety Gloves",
          description: "Safety Gloves",
          quantity: 100,
          unit_price: 10,
          total_price: 1000,
        },
      ],
      page_confidence: 0.62,
    });

    const result = await analyzeInvoiceMatch("inv-current");
    const docLine = result.documentLineMatches[0];

    expect(result.documentExtraction?.confidence).toBe("medium");
    expect(docLine.systemItemName).toBe("Electrical Safety Gloves");
    expect(docLine.poItemName).toBe("Electrical Safety Gloves");
    expect(docLine.matchStatus).toBe("matched");
    expect(docLine.matchConfidence).not.toBe("low");
    expect(docLine.matchConfidenceScore).toBeGreaterThanOrEqual(68);
  });

  it("does not pair an unrelated OCR line by position", async () => {
    scenario.poLines = [
      poLine({ item_name: "Electrical Safety Gloves", line_description: "Electrical Safety Gloves" }),
    ];
    scenario.invoiceLines = [
      invoiceLine({ item_name: "Electrical Safety Gloves", description: "Electrical Safety Gloves" }),
    ];
    scenario.allInvoiceLines = [
      reconInvoiceLine({ item_name: "Electrical Safety Gloves" }),
    ];
    scenario.documents = pdfDocument(1);
    pageResponses[1] = invoicePageJson({
      line_items: [
        {
          row_source: "line_item_table",
          item_name: "Helmet with Ratchet White Udyogi",
          description: "Helmet with Ratchet White Udyogi",
          quantity: 100,
          unit_price: 10,
          total_price: 1000,
        },
      ],
    });

    const result = await analyzeInvoiceMatch("inv-current");
    const docLine = result.documentLineMatches[0];

    expect(docLine.systemLineNumber).toBeNull();
    expect(docLine.poLineNumber).toBeNull();
    expect(docLine.matchStatus).toBe("unmatched");
    expect(docLine.matchConfidence).toBe("low");
  });
});

describe("a document total that does not add up", () => {
  beforeEach(() => {
    scenario.documents = pdfDocument(1);
    // The printed subtotal and tax come to 1000, so the 5000 in the total field was misread.
    pageResponses[1] = invoicePageJson({ subtotal: 1000, tax: 0, total: 5000, charges: [] });
  });

  it("reports the total as read but unconfirmed instead of as a proven discrepancy", async () => {
    const result = await analyzeInvoiceMatch("inv-current");
    const extraction = result.documentExtraction!;

    expect(extraction.extractedTotal).toBe(5000);
    expect(extraction.headerTotalsAgree).toBe(false);
    expect(extraction.totalsVerified).toBe(false);
    expect(extraction.headerTotalsNote).toContain("5000");
    expect(result.documentAnalysis?.reliable).toBe(false);
    expect(result.documentAnalysis?.advisories.map((a) => a.code)).toContain("header_totals_mismatch");

    const totalMismatch = result.headerMismatches.find((m) => m.field === "total_amount")!;
    expect(totalMismatch.severity).toBe("medium");
    expect(totalMismatch.message).toContain("could not be reconciled");

    // Raised for a manual check — it does not escalate the whole match on its own
    expect(result.document_verification_status).toBe("mismatched");
    expect(result.summary.overallStatus).toBe("fully_matched");
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });

  it("still marks a total that could not be read at all as unavailable", async () => {
    pageResponses[1] = invoicePageJson({ subtotal: null, total: null, charges: [] });

    const result = await analyzeInvoiceMatch("inv-current");
    const extraction = result.documentExtraction!;

    expect(extraction.extractedTotal).toBeNull();
    expect(extraction.unavailableFields).toContain("total");
    expect(extraction.totalsVerified).toBe(false);
    expect(result.headerMismatches.map((m) => m.field)).not.toContain("total_amount");
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });
});

describe("receiving paperwork misfiled as an invoice page", () => {
  beforeEach(() => {
    scenario.documents = pdfDocument(2, "invoice-plus-grn.pdf");
    pageResponses[1] = invoicePageJson();
    // Classified as an invoice page, but the table prices nothing and counts deliveries.
    pageResponses[2] = invoicePageJson({
      document_number: null,
      is_continuation: true,
      subtotal: null,
      tax: null,
      total: null,
      column_headers: ["Item", "Ordered Qty", "Received Qty", "Accepted Qty"],
      line_items: [
        { row_source: "line_item_table", item_name: "Steel Rod", quantity: 999, unit_price: null, total_price: null },
      ],
    });
  });

  it("keeps its rows out of the invoice line items", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.summary.documentInvoiceLineCount).toBe(1);
    expect(result.documentLineMatches).toHaveLength(1);
    expect(result.documentLineMatches[0].docQty).toBe(100);
    expect(result.documentLineMatches.some((dl) => dl.docQty === 999)).toBe(false);
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });
});

describe("a document billing lines the PO never ordered", () => {
  beforeEach(() => {
    scenario.documents = pdfDocument(1);
    pageResponses[1] = invoicePageJson({
      subtotal: 1100,
      tax: 0,
      total: 1100,
      line_items: [
        { row_source: "line_item_table", item_name: "Steel Rod", quantity: 100, unit_price: 10, total_price: 1000 },
        { row_source: "line_item_table", item_name: "Site Handling Charge", quantity: 1, unit_price: 25, total_price: 25 },
        { row_source: "line_item_table", item_name: "Packing Material", quantity: 1, unit_price: 25, total_price: 25 },
        { row_source: "line_item_table", item_name: "Loading Fee", quantity: 1, unit_price: 25, total_price: 25 },
        { row_source: "line_item_table", item_name: "Documentation Fee", quantity: 1, unit_price: 25, total_price: 25 },
      ],
    });
  });

  it("counts every extracted line and marks the extra ones as carrying no PO line", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.summary.docLinesTotal).toBe(5);
    expect(result.summary.docLinesMatched).toBe(1);
    expect(result.summary.docLinesUnmatched).toBe(4);
    expect(result.summary.docLinesNotInPo).toBe(4);
    expect(result.documentLineMatches.filter((dl) => dl.poLineNumber == null)).toHaveLength(4);
  });

  it("leaves the PO reconciliation fully matched", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.total_po_qty).toBe(100);
    expect(result.total_grn_qty).toBe(100);
    expect(result.total_invoice_qty).toBe(100);
    expect(result.balance_qty).toBe(0);
    expect(result.line_level_status.every((l) => l.status === "fully_matched")).toBe(true);
  });
});

describe("an invoice record carrying a line the PO never ordered", () => {
  beforeEach(() => {
    scenario.invoice.invoice_amount = 1025;
    scenario.invoiceLines = [
      invoiceLine(),
      invoiceLine({
        id: 705,
        line_number: 2,
        po_line_number: null,
        item_name: "Site Handling Charge",
        order_qty: 1,
        order_unit_cost: 25,
        order_cost: 25,
      }),
    ];
  });

  it("reports it as not in PO without disturbing the reconciliation", async () => {
    const result = await analyzeInvoiceMatch("inv-current");
    const extra = result.lineMatches.find((lm) => lm.invoiceItemName === "Site Handling Charge")!;

    expect(result.summary.invoiceLinesNotInPo).toBe(1);
    expect(extra.poLineNumber).toBeNull();
    expect(extra.matchStatus).toBe("unmatched");

    expect(result.po_reconciliation_status).toBe("fully_matched");
    expect(result.balance_qty).toBe(0);
    expect(result.summary.narrative.toLowerCase()).toContain("not on the po");
  });
});

describe("tolerances", () => {
  it("reports the tolerances the comparison was judged against", async () => {
    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.tolerances.qtyTolerance).toBe(0.02);
    expect(result.tolerances.priceTolerance).toBe(0.01);
  });

  it("treats a quantity inside tolerance as matched, not as a discrepancy", async () => {
    // 101 invoiced against 100 received is inside the ±2% band.
    scenario.invoice.invoice_amount = 1010;
    scenario.invoiceLines = [invoiceLine({ order_qty: 101, order_cost: 1010 })];
    scenario.allInvoiceLines = [reconInvoiceLine({ order_qty: 101, order_cost: 1010 })];

    const result = await analyzeInvoiceMatch("inv-current");

    expect(result.lineMatches[0].mismatches).toHaveLength(0);
    expect(result.lineMatches[0].matchStatus).toBe("matched");
    expect(result.po_reconciliation_status).toBe("fully_matched");
  });
});

describe("buildDeterministicNarrative", () => {
  const base = {
    totalPoQty: 100,
    totalGrnQty: 100,
    totalInvoiceQty: 100,
    balanceQty: 0,
    unmatchedLines: 0,
    partialLines: 0,
    headerMismatchCount: 0,
  };

  it("never claims unmatched quantities when the PO is fully matched", () => {
    const text = buildDeterministicNarrative({
      ...base,
      poReconciliationStatus: "fully_matched",
      documentStatus: "mismatched",
      headerMismatchCount: 2,
    }).toLowerCase();

    expect(text).toContain("fully matched");
    expect(text).toContain("document");
    expect(text).not.toContain("unmatched");
  });

  it("explains pending as expected further invoicing", () => {
    const text = buildDeterministicNarrative({
      ...base,
      totalInvoiceQty: 20,
      balanceQty: 80,
      poReconciliationStatus: "pending",
      documentStatus: "no_document",
    }).toLowerCase();

    expect(text).toContain("pending");
    expect(text).toContain("not a mismatch");
  });

  it("states what the upload contained when a composition is supplied", () => {
    const text = buildDeterministicNarrative({
      ...base,
      poReconciliationStatus: "fully_matched",
      documentStatus: "passed",
      documentComposition: "The upload has 3 pages and contains 2 invoices; OCR confidence high.",
    });

    expect(text).toContain("3 pages");
    expect(text).toContain("2 invoices");
  });

  it("calls out over-invoiced quantities", () => {
    const text = buildDeterministicNarrative({
      ...base,
      totalGrnQty: 50,
      totalInvoiceQty: 80,
      balanceQty: -30,
      poReconciliationStatus: "over_invoiced",
      documentStatus: "passed",
    }).toLowerCase();

    expect(text).toContain("over-invoiced");
    expect(text).toContain("review before payment");
  });
});
