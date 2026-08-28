import { beforeEach, describe, expect, it, vi } from "vitest";

/** Pages the mocked PDF renderer hands back, keyed by the test that set them up. */
let renderedPdf: { pageCount: number; pages: Array<{ pageNumber: number; png: Buffer }> } | null = null;
/** Raw model JSON per page number. */
let pageResponses: Record<number, any> = {};
/** Page numbers whose model call should blow up. */
let failingPages = new Set<number>();

/** Bytes the mocked Azure download returns for `doc_path`, or null to simulate a failure. */
let azureFile: Buffer | null = null;
const downloadFileFromAzure = vi.fn(async () => {
  if (!azureFile) throw new Error("blob not found");
  return azureFile;
});

vi.mock("../modules/_shared/pdf-preview", () => ({
  renderPdfPagesToPngBuffers: vi.fn(async () => renderedPdf),
  extractPdfPagesText: vi.fn(async () => null),
}));

vi.mock("./azure-blob.service", () => ({
  downloadFileFromAzure: (...args: any[]) => (downloadFileFromAzure as any)(...args),
}));

vi.mock("./ai-client", () => ({
  getAIModelName: vi.fn(async () => "test-model"),
  getAIClient: vi.fn(async () => ({
    chat: {
      completions: {
        create: vi.fn(async ({ messages }: any) => {
          const asText = JSON.stringify(messages);
          const pageMatch = asText.match(/This is page (\d+) of/);
          const pageNumber = pageMatch ? Number(pageMatch[1]) : 1;
          if (failingPages.has(pageNumber)) throw new Error("vision model unavailable");
          const payload = pageResponses[pageNumber];
          return {
            choices: [{ message: { content: payload ? JSON.stringify(payload) : "no json here" } }],
          };
        }),
      },
    },
  })),
}));

import {
  analyzeInvoiceDocument,
  checkHeaderTotals,
  confidenceLabel,
  groupPagesIntoDocuments,
  looksLikeReceivingTable,
  looksLikeTotalsLabel,
  normalizePageExtraction,
  readImageDimensions,
  selectPrimaryInvoice,
  toNullableNumber,
} from "./invoice-document-extraction";

const PDF_BYTES = Buffer.from("%PDF-1.4\nfake pdf body", "utf8");
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

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

function invoicePageJson(overrides: Record<string, any> = {}) {
  return {
    document_type: "invoice",
    document_number: "INV-1",
    is_continuation: false,
    readable: true,
    invoice_date: "2026-02-01",
    vendor_name: "Acme Steel",
    po_number: "PO-1",
    currency: "USD",
    subtotal: 1000,
    tax: 100,
    total: 1100,
    charges: [],
    line_item_table_found: true,
    column_headers: ["Description", "Qty", "Rate", "Amount"],
    line_items: [
      {
        row_index: 1,
        row_source: "line_item_table",
        item_name: "Steel Rod",
        description: "Steel Rod",
        quantity: 10,
        unit_price: 100,
        total_price: 1000,
      },
    ],
    page_confidence: 0.95,
    unavailable_fields: [],
    notes: null,
    ...overrides,
  };
}

function renderPages(count: number) {
  renderedPdf = {
    pageCount: count,
    pages: Array.from({ length: count }, (_, i) => ({ pageNumber: i + 1, png: PNG_BYTES })),
  };
}

beforeEach(() => {
  renderedPdf = null;
  pageResponses = {};
  failingPages = new Set();
  azureFile = null;
  downloadFileFromAzure.mockClear();
});

describe("toNullableNumber", () => {
  it("keeps real numbers, including a genuine zero", () => {
    expect(toNullableNumber(0)).toBe(0);
    expect(toNullableNumber(12.5)).toBe(12.5);
    expect(toNullableNumber("1,234.50")).toBe(1234.5);
    expect(toNullableNumber("$980.00")).toBe(980);
  });

  it("returns null instead of inventing 0 for unreadable values", () => {
    for (const value of [null, undefined, "", "N/A", "—", "unreadable", "???", NaN, {}]) {
      expect(toNullableNumber(value)).toBeNull();
    }
  });

  it("refuses cells holding more than one number rather than picking one", () => {
    // "2 x 620000" previously collapsed to 2620000 once separators were stripped
    expect(toNullableNumber("2 x 620000")).toBeNull();
    expect(toNullableNumber("10 / 20")).toBeNull();
    expect(toNullableNumber("1.240.000,00")).toBeNull();
  });

  it("reads accounting negatives", () => {
    expect(toNullableNumber("(1,234.00)")).toBe(-1234);
    expect(toNullableNumber("1,234.00-")).toBe(-1234);
    expect(toNullableNumber("-980")).toBe(-980);
  });
});

describe("looksLikeTotalsLabel", () => {
  it("recognises rows that belong to the totals block", () => {
    for (const label of [
      "Total", "Grand Total", "Sub Total", "Subtotal", "Net Amount", "Amount Payable",
      "Balance Due", "Round Off", "Tax", "VAT", "CGST", "SGST", "IGST", "TDS", "Taxable Value",
    ]) {
      expect(looksLikeTotalsLabel(label)).toBe(true);
    }
  });

  it("does not mistake real goods or services for totals", () => {
    for (const label of ["Steel Rod", "Service Charge", "Freight Charges", "Installation", "Total Station Survey Kit"]) {
      expect(looksLikeTotalsLabel(label)).toBe(false);
    }
  });
});

describe("readImageDimensions", () => {
  it("reads PNG dimensions from the header", () => {
    expect(readImageDimensions(pngOfSize(280, 396))).toEqual({ width: 280, height: 396 });
    expect(readImageDimensions(pngOfSize(2000, 2828))).toEqual({ width: 2000, height: 2828 });
  });

  it("returns null for bytes it cannot measure", () => {
    expect(readImageDimensions(PNG_BYTES)).toBeNull();
    expect(readImageDimensions(PDF_BYTES)).toBeNull();
  });
});

describe("totals and summary rows", () => {
  it("drops rows the model marked as coming from the totals block", () => {
    const page = normalizePageExtraction(
      invoicePageJson({
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 10, unit_price: 100, total_price: 1000 },
          { row_source: "totals_block", item_name: "Service Charge", quantity: 1, unit_price: 1240000, total_price: 1240000 },
        ],
      }),
      1
    );

    expect(page.lines.map((l) => l.itemName)).toEqual(["Steel Rod"]);
    expect(page.notes).toContain("totals/summary row");
  });

  it("drops rows whose label is a totals label even when the model called them line items", () => {
    const page = normalizePageExtraction(
      invoicePageJson({
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 10, unit_price: 100, total_price: 1000 },
          { row_source: "line_item_table", item_name: "Grand Total", quantity: 1, unit_price: 1100, total_price: 1100 },
          { row_source: "line_item_table", item_name: "CGST 9%", quantity: 1, unit_price: 90, total_price: 90 },
        ],
      }),
      1
    );

    expect(page.lines.map((l) => l.itemName)).toEqual(["Steel Rod"]);
  });

  it("flags a line whose quantity, unit price and total do not multiply out", () => {
    const page = normalizePageExtraction(
      invoicePageJson({
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 2, unit_price: 100, total_price: 1000 },
        ],
      }),
      1
    );

    const line = page.lines[0];
    expect(line.columnCheck).toContain("does not match the printed line total");
    expect(line.lowConfidence).toBe(true);
    // The values are reported exactly as read — never rewritten to make the maths work
    expect(line.quantity).toBe(2);
    expect(line.unitPrice).toBe(100);
    expect(line.totalPrice).toBe(1000);
  });

  it("reports an invoice as unreliable when its lines do not add up to the printed subtotal", () => {
    // The reported failure mode: a single fabricated row carrying the grand total
    const pages = [
      normalizePageExtraction(
        invoicePageJson({
          subtotal: 1000,
          tax: 240000,
          total: 1240000,
          line_items: [
            { row_source: "line_item_table", item_name: "Service Charge", quantity: 1, unit_price: 1240000, total_price: 1240000 },
          ],
        }),
        1
      ),
    ];

    const { invoices } = groupPagesIntoDocuments(pages);

    expect(invoices[0].totalsAgree).toBe(false);
    expect(invoices[0].confidence).toBe("low");
    expect(invoices[0].notes).toContain("may have been read incorrectly");
  });
});

/** Build one invoice out of the given raw page payloads. */
function invoiceFrom(...raw: Array<Record<string, any>>) {
  const pages = raw.map((page, index) => normalizePageExtraction(page, index + 1));
  const { invoices } = groupPagesIntoDocuments(pages);
  return invoices[0];
}

describe("checkHeaderTotals", () => {
  it("accepts a total that is the sum of subtotal, tax and other charges", () => {
    expect(checkHeaderTotals({ subtotal: 1000, tax: 180, total: 1330, otherCharges: 150 }).agree).toBe(true);
    expect(checkHeaderTotals({ subtotal: 1000, tax: 180, total: 1180, otherCharges: null }).agree).toBe(true);
    // A tax line that was not printed is only read as "no tax" when the total works without one
    expect(checkHeaderTotals({ subtotal: 1000, tax: null, total: 1000, otherCharges: null }).agree).toBe(true);
  });

  it("rejects a total the rest of the printed block does not come to", () => {
    const result = checkHeaderTotals({ subtotal: 1000, tax: 100, total: 9999, otherCharges: null });

    expect(result.agree).toBe(false);
    expect(result.note).toContain("1100");
    expect(result.note).toContain("9999");
  });

  it("cannot confirm anything when the block is incomplete", () => {
    expect(checkHeaderTotals({ subtotal: null, tax: 100, total: 1100, otherCharges: null }).agree).toBeNull();
    expect(checkHeaderTotals({ subtotal: 1000, tax: null, total: 1180, otherCharges: null }).agree).toBeNull();
    expect(checkHeaderTotals({ subtotal: 1000, tax: 100, total: null, otherCharges: null }).agree).toBeNull();
  });
});

describe("the totals block", () => {
  it("reads the whole block off one page instead of combining figures from several", () => {
    // Page 1 prints its own summary; the real grand total is on the last page. Taking the
    // subtotal from page 1 and the total from page 2 would state a total the invoice never has.
    const invoice = invoiceFrom(
      invoicePageJson({ subtotal: 1000, tax: 100, total: 1100 }),
      invoicePageJson({
        document_number: null,
        is_continuation: true,
        subtotal: null,
        tax: null,
        total: 5500,
        charges: [],
        line_items: [],
      })
    );

    expect(invoice.total).toBe(5500);
    expect(invoice.subtotal).toBeNull();
    expect(invoice.tax).toBeNull();
    expect(invoice.unavailableFields).toContain("subtotal");
    expect(invoice.headerTotalsAgree).toBeNull();
    expect(invoice.totalsVerified).toBe(false);
  });

  it("reconciles a total that includes tax and freight", () => {
    const invoice = invoiceFrom(
      invoicePageJson({
        subtotal: 1000,
        tax: 180,
        total: 1330,
        charges: [{ label: "Freight", amount: 120 }, { label: "Round Off", amount: 30 }],
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 10, unit_price: 60, total_price: 600 },
          { row_source: "line_item_table", item_name: "Steel Plate", quantity: 5, unit_price: 80, total_price: 400 },
        ],
      })
    );

    expect(invoice.otherCharges).toBe(150);
    expect(invoice.charges.map((c) => c.label)).toEqual(["Freight", "Round Off"]);
    expect(invoice.headerTotalsAgree).toBe(true);
    expect(invoice.totalsVerified).toBe(true);
    expect(invoice.totalsAgree).toBe(true);
    expect(invoice.confidence).toBe("high");
  });

  it("does not blame the line items for freight that sits in the totals block", () => {
    // No subtotal is printed, so it has to be backed out of the total — which only works
    // once the freight is taken off too. Charging the difference to the line items would
    // call a perfectly good extraction unreliable.
    const invoice = invoiceFrom(
      invoicePageJson({
        subtotal: null,
        tax: 100,
        total: 1250,
        charges: [{ label: "Freight", amount: 150 }],
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 10, unit_price: 60, total_price: 600 },
          { row_source: "line_item_table", item_name: "Steel Plate", quantity: 5, unit_price: 80, total_price: 400 },
        ],
      })
    );

    expect(invoice.total).toBe(1250);
    expect(invoice.totalsAgree).toBe(true);
    expect(invoice.notes ?? "").not.toContain("may have been read incorrectly");
  });

  it("leaves the line items unjudged when nothing can be checked against them", () => {
    const invoice = invoiceFrom(
      invoicePageJson({
        subtotal: null,
        tax: 100,
        total: 1250,
        charges: undefined,
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 10, unit_price: 60, total_price: 600 },
        ],
      })
    );

    expect(invoice.totalsAgree).toBeNull();
    expect(invoice.notes).toContain("could not be checked against it");
    expect(invoice.totalsVerified).toBe(false);
  });

  it("reports the printed total as read even when it does not reconcile", () => {
    const invoice = invoiceFrom(
      invoicePageJson({
        subtotal: 1000,
        tax: 100,
        total: 9999,
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 10, unit_price: 100, total_price: 1000 },
        ],
      })
    );

    // The figure is never rewritten to whatever the arithmetic wanted it to be
    expect(invoice.total).toBe(9999);
    expect(invoice.headerTotalsAgree).toBe(false);
    expect(invoice.headerTotalsNote).toContain("9999");
    expect(invoice.totalsVerified).toBe(false);
    expect(invoice.confidence).toBe("low");
    expect(invoice.notes).toContain("could not be confirmed");
    // The line items themselves footed against the printed subtotal, so they are not blamed
    expect(invoice.totalsAgree).toBe(true);
  });

  it("keeps every line of a multi-line invoice with per-line tax", () => {
    const invoice = invoiceFrom(
      invoicePageJson({
        subtotal: 2400,
        tax: 432,
        total: 2832,
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 10, unit_price: 60, total_price: 600, tax_amount: 108 },
          { row_source: "line_item_table", item_name: "Steel Plate", quantity: 5, unit_price: 80, total_price: 400, tax_amount: 72 },
          { row_source: "line_item_table", item_name: "Copper Pipe", quantity: 4, unit_price: 200, total_price: 800, tax_amount: 144 },
          { row_source: "line_item_table", item_name: "Safety Gloves", quantity: 20, unit_price: 30, total_price: 600, tax_amount: 108 },
        ],
      })
    );

    expect(invoice.lines).toHaveLength(4);
    expect(invoice.lines.map((l) => l.taxAmount)).toEqual([108, 72, 144, 108]);
    expect(invoice.lines.every((l) => !l.lowConfidence)).toBe(true);
    expect(invoice.totalsAgree).toBe(true);
    expect(invoice.totalsVerified).toBe(true);
  });
});

describe("looksLikeReceivingTable", () => {
  it("recognises a receiving table by its unpriced quantity columns", () => {
    expect(looksLikeReceivingTable(["Item", "Ordered Qty", "Received Qty", "Accepted Qty", "Rejected Qty"])).toBe(true);
    expect(looksLikeReceivingTable(["Description", "Received Qty", "Short Qty"])).toBe(true);
  });

  it("does not mistake an invoice item table for one", () => {
    expect(looksLikeReceivingTable(["Description", "Qty", "Rate", "Amount"])).toBe(false);
    // A priced column makes it an invoice table even when quantities are described as received
    expect(looksLikeReceivingTable(["Item", "Received Qty", "Unit Price", "Amount"])).toBe(false);
    expect(looksLikeReceivingTable([])).toBe(false);
  });

  it("keeps a receiving table off an invoice page's line items", () => {
    const page = normalizePageExtraction(
      invoicePageJson({
        column_headers: ["Item", "Ordered Qty", "Received Qty", "Accepted Qty"],
        line_items: [
          { row_source: "line_item_table", item_name: "Steel Rod", quantity: 999, unit_price: null, total_price: null },
        ],
      }),
      1
    );

    expect(page.documentType).toBe("invoice");
    expect(page.lines).toEqual([]);
    expect(page.notes).toContain("receiving paperwork");
  });
});

describe("normalizePageExtraction", () => {
  it("never keeps line items from a non-invoice page", () => {
    const page = normalizePageExtraction(
      invoicePageJson({
        document_type: "grn",
        document_number: "GRN-77",
        line_items: [{ item_name: "Steel Rod", quantity: 10, unit_price: 100, total_price: 1000 }],
      }),
      2
    );

    expect(page.documentType).toBe("grn");
    expect(page.lines).toEqual([]);
    expect(page.total).toBeNull();
  });

  it("marks unreadable line values as unavailable rather than zero", () => {
    const page = normalizePageExtraction(
      invoicePageJson({
        line_items: [{ item_name: "Steel Rod", quantity: null, unit_price: "illegible", total_price: 1000 }],
      }),
      1
    );

    const line = page.lines[0];
    expect(line.quantity).toBeNull();
    expect(line.unitPrice).toBeNull();
    expect(line.totalPrice).toBe(1000);
    expect(line.lowConfidence).toBe(true);
    expect(line.unavailableFields).toEqual(expect.arrayContaining(["quantity", "unitPrice"]));
  });

  it("recognises classification synonyms", () => {
    const types = [
      ["Tax Invoice", "invoice"],
      ["Goods Receipt Note", "grn"],
      ["Delivery Challan", "challan"],
      ["Payment Receipt", "receipt"],
      ["Terms and Conditions", "other"],
    ] as const;

    for (const [raw, expected] of types) {
      expect(normalizePageExtraction({ document_type: raw }, 1).documentType).toBe(expected);
    }
  });
});

describe("groupPagesIntoDocuments", () => {
  it("keeps continuation pages with the invoice that started them", () => {
    const pages = [
      normalizePageExtraction(invoicePageJson({ subtotal: null, tax: null, total: null }), 1),
      normalizePageExtraction(
        invoicePageJson({
          document_number: null,
          is_continuation: true,
          invoice_date: null,
          vendor_name: null,
          subtotal: 1200,
          tax: 120,
          total: 1320,
          line_items: [
            { row_source: "line_item_table", item_name: "Steel Plate", quantity: 5, unit_price: 40, total_price: 200 },
          ],
        }),
        2
      ),
    ];

    const { invoices } = groupPagesIntoDocuments(pages);

    expect(invoices).toHaveLength(1);
    expect(invoices[0].pageNumbers).toEqual([1, 2]);
    expect(invoices[0].lines.map((l) => l.lineNumber)).toEqual([1, 2]);
    expect(invoices[0].total).toBe(1320);
    expect(invoices[0].totalsAgree).toBe(true);
  });

  it("splits pages carrying different invoice numbers into separate invoices", () => {
    const pages = [
      normalizePageExtraction(invoicePageJson({ document_number: "INV-1" }), 1),
      normalizePageExtraction(invoicePageJson({ document_number: "INV-2" }), 2),
    ];

    const { invoices } = groupPagesIntoDocuments(pages);

    expect(invoices).toHaveLength(2);
    expect(invoices.map((i) => i.invoiceNumber)).toEqual(["INV-1", "INV-2"]);
  });

  it("reunites non-contiguous pages of the same invoice number", () => {
    const pages = [
      normalizePageExtraction(invoicePageJson({ document_number: "INV-1" }), 1),
      normalizePageExtraction(invoicePageJson({ document_type: "challan", document_number: "CH-9" }), 2),
      normalizePageExtraction(
        invoicePageJson({ document_number: "INV-1", subtotal: 2000, tax: 200, total: 2200 }),
        3
      ),
    ];

    const { invoices, supportingDocuments } = groupPagesIntoDocuments(pages);

    expect(invoices).toHaveLength(1);
    expect(invoices[0].pageNumbers).toEqual([1, 3]);
    expect(supportingDocuments).toHaveLength(1);
    expect(supportingDocuments[0].documentType).toBe("challan");
  });

  it("caps confidence when a header field could not be read", () => {
    const pages = [
      normalizePageExtraction(invoicePageJson({ document_number: null, page_confidence: 1 }), 1),
    ];

    const { invoices } = groupPagesIntoDocuments(pages);

    expect(invoices[0].unavailableFields).toContain("invoiceNumber");
    expect(invoices[0].confidenceScore).toBeLessThanOrEqual(0.6);
    expect(invoices[0].confidence).not.toBe("high");
  });
});

describe("selectPrimaryInvoice", () => {
  const pages = (num: string, total: number) => [
    normalizePageExtraction(invoicePageJson({ document_number: num, total }), 1),
  ];

  it("prefers the invoice whose number matches the system record", () => {
    const a = groupPagesIntoDocuments(pages("INV-100", 500)).invoices[0];
    const b = groupPagesIntoDocuments(pages("INV-200", 1100)).invoices[0];

    const chosen = selectPrimaryInvoice([a, b], { invoiceNumber: "INV-200", poNumber: "PO-1", total: 500 });
    expect(chosen?.invoiceNumber).toBe("INV-200");
  });

  it("falls back to the closest total when no number matches", () => {
    const a = groupPagesIntoDocuments(pages("INV-100", 500)).invoices[0];
    const b = groupPagesIntoDocuments(pages("INV-200", 1100)).invoices[0];

    const chosen = selectPrimaryInvoice([a, b], { invoiceNumber: "INV-999", poNumber: null, total: 1100 });
    expect(chosen?.invoiceNumber).toBe("INV-200");
  });
});

describe("confidenceLabel", () => {
  it("maps scores onto the reported bands", () => {
    expect(confidenceLabel(0.95)).toBe("high");
    expect(confidenceLabel(0.6)).toBe("medium");
    expect(confidenceLabel(0.2)).toBe("low");
  });
});

describe("analyzeInvoiceDocument", () => {
  it("reads a single-page invoice", async () => {
    renderPages(1);
    pageResponses[1] = invoicePageJson();

    const analysis = await analyzeInvoiceDocument({ id: 1, filename: "invoice.pdf", doc_uri: PDF_BYTES });

    expect(analysis).not.toBeNull();
    expect(analysis!.pageCount).toBe(1);
    expect(analysis!.pagesAnalyzed).toBe(1);
    expect(analysis!.invoiceCount).toBe(1);
    expect(analysis!.invoices[0].lines).toHaveLength(1);
    expect(analysis!.supportingDocuments).toHaveLength(0);
    expect(analysis!.confidence).toBe("high");
  });

  it("treats a three-page invoice as one invoice with all its lines", async () => {
    renderPages(3);
    pageResponses[1] = invoicePageJson({ subtotal: null, tax: null, total: null });
    pageResponses[2] = invoicePageJson({
      document_number: null,
      is_continuation: true,
      invoice_date: null,
      vendor_name: null,
      subtotal: null,
      tax: null,
      total: null,
      line_items: [{ item_name: "Steel Plate", quantity: 5, unit_price: 40, total_price: 200 }],
    });
    pageResponses[3] = invoicePageJson({
      document_number: null,
      is_continuation: true,
      invoice_date: null,
      vendor_name: null,
      subtotal: 1320,
      tax: 0,
      total: 1320,
      line_items: [
        { row_source: "line_item_table", item_name: "Steel Wire", quantity: 2, unit_price: 60, total_price: 120 },
      ],
    });

    const analysis = await analyzeInvoiceDocument({ id: 1, filename: "invoice.pdf", doc_uri: PDF_BYTES });

    expect(analysis!.pageCount).toBe(3);
    expect(analysis!.invoiceCount).toBe(1);
    const invoice = analysis!.invoices[0];
    expect(invoice.pageNumbers).toEqual([1, 2, 3]);
    expect(invoice.lines.map((l) => l.itemName)).toEqual(["Steel Rod", "Steel Plate", "Steel Wire"]);
    expect(invoice.lines.map((l) => l.sourcePage)).toEqual([1, 2, 3]);
    expect(invoice.total).toBe(1320);
    expect(invoice.invoiceNumber).toBe("INV-1");
    // 1000 + 200 + 120 across three pages equals the subtotal printed on the last page
    expect(invoice.totalsAgree).toBe(true);
  });

  it("splits a PDF holding two separate invoices", async () => {
    renderPages(4);
    pageResponses[1] = invoicePageJson({ document_number: "INV-A", subtotal: null, tax: null, total: null });
    pageResponses[2] = invoicePageJson({
      document_number: null,
      is_continuation: true,
      subtotal: 1200,
      tax: 120,
      total: 1320,
      line_items: [
        { row_source: "line_item_table", item_name: "Steel Plate", quantity: 5, unit_price: 40, total_price: 200 },
      ],
    });
    pageResponses[3] = invoicePageJson({
      document_number: "INV-B",
      subtotal: 2200,
      tax: 0,
      total: 2200,
      line_items: [
        { row_source: "line_item_table", item_name: "Copper Pipe", quantity: 4, unit_price: 550, total_price: 2200 },
      ],
    });
    pageResponses[4] = invoicePageJson({ document_type: "other", document_number: null, line_items: [] });

    const analysis = await analyzeInvoiceDocument({ id: 1, filename: "batch.pdf", doc_uri: PDF_BYTES });

    expect(analysis!.pageCount).toBe(4);
    expect(analysis!.invoiceCount).toBe(2);

    const [first, second] = analysis!.invoices;
    expect(first.invoiceNumber).toBe("INV-A");
    expect(first.pageNumbers).toEqual([1, 2]);
    expect(first.total).toBe(1320);
    expect(second.invoiceNumber).toBe("INV-B");
    expect(second.pageNumbers).toEqual([3]);
    expect(second.lines.map((l) => l.itemName)).toEqual(["Copper Pipe"]);
    // Neither invoice may absorb the other's lines
    expect(first.lines.map((l) => l.itemName)).not.toContain("Copper Pipe");
  });

  it("keeps GRN and challan pages out of the invoice line items", async () => {
    renderPages(3);
    pageResponses[1] = invoicePageJson();
    pageResponses[2] = {
      document_type: "grn",
      document_number: "GRN-55",
      is_continuation: false,
      readable: true,
      line_items: [
        { row_source: "line_item_table", item_name: "Steel Rod", quantity: 999, unit_price: 1, total_price: 999 },
      ],
      page_confidence: 0.9,
    };
    pageResponses[3] = {
      document_type: "challan",
      document_number: "CH-77",
      is_continuation: false,
      readable: true,
      line_items: [
        { row_source: "line_item_table", item_name: "Steel Rod", quantity: 888, unit_price: 1, total_price: 888 },
      ],
      page_confidence: 0.9,
    };

    const analysis = await analyzeInvoiceDocument({ id: 1, filename: "invoice-with-docs.pdf", doc_uri: PDF_BYTES });

    expect(analysis!.pageCount).toBe(3);
    expect(analysis!.invoiceCount).toBe(1);
    expect(analysis!.invoices[0].lines).toHaveLength(1);
    expect(analysis!.invoices[0].lines[0].quantity).toBe(10);
    expect(analysis!.invoices[0].lines.some((l) => l.quantity === 999 || l.quantity === 888)).toBe(false);

    expect(analysis!.supportingDocuments.map((d) => d.documentType)).toEqual(["grn", "challan"]);
    expect(analysis!.supportingDocuments.map((d) => d.documentNumber)).toEqual(["GRN-55", "CH-77"]);
  });

  it("reports a page the model could not read instead of dropping it", async () => {
    renderPages(2);
    pageResponses[1] = invoicePageJson();
    failingPages.add(2);

    const analysis = await analyzeInvoiceDocument({ id: 1, filename: "invoice.pdf", doc_uri: PDF_BYTES });

    expect(analysis!.pageCount).toBe(2);
    expect(analysis!.pagesAnalyzed).toBe(2);
    expect(analysis!.pages.filter((p) => !p.readable)).toHaveLength(1);
    expect(analysis!.confidenceScore).toBeLessThanOrEqual(0.4);
    expect(analysis!.notes).toContain("could not be read");
  });

  it("reports how many pages an image upload has", async () => {
    pageResponses[1] = invoicePageJson();

    const analysis = await analyzeInvoiceDocument({ id: 2, filename: "invoice.png", doc_uri: PNG_BYTES });

    expect(analysis!.pageCount).toBe(1);
    expect(analysis!.invoiceCount).toBe(1);
  });

  it("reads the original file from doc_path instead of the stored thumbnail", async () => {
    renderPages(2);
    pageResponses[1] = invoicePageJson({ subtotal: null, tax: null, total: null });
    pageResponses[2] = invoicePageJson({
      document_number: null,
      is_continuation: true,
      subtotal: 1000,
      tax: 100,
      total: 1100,
      line_items: [],
    });
    azureFile = PDF_BYTES;

    const analysis = await analyzeInvoiceDocument({
      id: 1,
      filename: "invoice.pdf",
      doc_path: "https://acct.blob.core.windows.net/files/tenant/INVOICES/9/invoice.pdf",
      // A 280px-wide page-1 thumbnail — what the OCR used to read
      doc_uri: pngOfSize(280, 396),
    });

    expect(downloadFileFromAzure).toHaveBeenCalledWith(
      "https://acct.blob.core.windows.net/files/tenant/INVOICES/9/invoice.pdf"
    );
    expect(analysis!.source).toBe("original_file");
    expect(analysis!.lowResolution).toBe(false);
    // Both PDF pages were read, which the single-page thumbnail could never have given us
    expect(analysis!.pageCount).toBe(2);
    expect(analysis!.invoices[0].pageNumbers).toEqual([1, 2]);
  });

  it("falls back to the stored preview when the original cannot be fetched", async () => {
    renderPages(1);
    pageResponses[1] = invoicePageJson();
    azureFile = null;

    const analysis = await analyzeInvoiceDocument({
      id: 1,
      filename: "invoice.pdf",
      doc_path: "https://acct.blob.core.windows.net/files/gone.pdf",
      doc_uri: PDF_BYTES,
    });

    expect(downloadFileFromAzure).toHaveBeenCalled();
    expect(analysis!.source).toBe("preview_image");
    expect(analysis!.invoiceCount).toBe(1);
  });

  it("refuses to extract from a thumbnail too small to read a table", async () => {
    pageResponses[1] = invoicePageJson();

    const analysis = await analyzeInvoiceDocument({
      id: 1,
      filename: "invoice.pdf",
      doc_uri: pngOfSize(280, 396),
    });

    expect(analysis!.lowResolution).toBe(true);
    expect(analysis!.source).toBe("preview_image");
    expect(analysis!.invoiceCount).toBe(0);
    expect(analysis!.invoices).toHaveLength(0);
    expect(analysis!.notes).toContain("280x396");
    expect(analysis!.notes).toContain("too low-resolution");
    // Nothing was invented from an unreadable image
    expect(analysis!.pages.every((p) => p.lines.length === 0)).toBe(true);
  });

  it("still extracts from a full-resolution image", async () => {
    pageResponses[1] = invoicePageJson();

    const analysis = await analyzeInvoiceDocument({
      id: 1,
      filename: "invoice.png",
      doc_uri: pngOfSize(1700, 2200),
    });

    expect(analysis!.lowResolution).toBe(false);
    expect(analysis!.invoiceCount).toBe(1);
  });

  it("returns null when the upload is empty or unreadable", async () => {
    expect(await analyzeInvoiceDocument({ id: 1, filename: "invoice.pdf", doc_uri: Buffer.alloc(0) })).toBeNull();

    renderPages(1);
    failingPages.add(1);
    expect(await analyzeInvoiceDocument({ id: 1, filename: "invoice.pdf", doc_uri: PDF_BYTES })).toBeNull();
  });
});
