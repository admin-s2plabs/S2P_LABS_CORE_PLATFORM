import { getAIClient, getAIModelName } from "./ai-client";
import { extractPdfPagesText, renderPdfPagesToPngBuffers } from "../modules/_shared/pdf-preview";

/**
 * Page-aware OCR for accounts-payable uploads.
 *
 * A single upload can be one invoice, one invoice spread over several pages, several
 * unrelated invoices concatenated into one PDF, or an invoice followed by supporting
 * paperwork (GRN / delivery challan / payment receipt). Every page is therefore
 * classified and extracted on its own, and pages are only grouped into an invoice
 * afterwards. Line items are taken exclusively from pages classified as invoices, so
 * receiving or delivery paperwork can never leak into invoice line items.
 */

export type DocumentPageType = "invoice" | "grn" | "challan" | "receipt" | "other";

const PAGE_TYPES: DocumentPageType[] = ["invoice", "grn", "challan", "receipt", "other"];

/** Upper bound on pages sent to the vision model for one upload. */
export const MAX_OCR_PAGES = 15;

/** Pages are OCR'd in parallel in small batches to keep latency sane without hammering the model. */
const PAGE_CONCURRENCY = 3;

/**
 * Narrowest a full-page document image can be and still have a legible line-item table.
 * `doc_uri` holds a client-generated thumbnail (280px wide for PDFs), on which the item
 * table is an unreadable smudge — reading one produces invented rows built around whatever
 * large number is still legible, usually the grand total. Below this width we refuse to
 * extract rather than guess.
 */
export const MIN_LEGIBLE_IMAGE_WIDTH = 1000;

/** Where the bytes we OCR'd came from. */
export type DocumentSourceKind = "original_file" | "preview_image";

export interface ExtractedPageLine {
  itemName: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  taxAmount: number | null;
  /** Page of the upload this line was read from. */
  sourcePage: number;
  /** OCR was not confident about this line — treat its values as indicative only. */
  lowConfidence: boolean;
  /** Fields OCR could not read. Never filled with a guessed value. */
  unavailableFields: string[];
  /** Set when quantity x unit price disagrees with the printed line total. */
  columnCheck: string | null;
}

export interface ExtractedInvoiceLine extends ExtractedPageLine {
  lineNumber: number;
}

/**
 * One non-tax amount printed in the totals block — freight, packing, insurance, round-off,
 * discount. Kept apart from line items so it can be reconciled into the total without ever
 * being reported as something that was bought.
 */
export interface ExtractedCharge {
  label: string | null;
  amount: number;
}

/** One page after classification + extraction, before pages are grouped into documents. */
export interface ExtractedPage {
  pageNumber: number;
  documentType: DocumentPageType;
  documentNumber: string | null;
  isContinuation: boolean;
  readable: boolean;
  /** Line-item table column labels as printed, kept so the mapping can be audited. */
  columnHeaders: string[];
  lineItemTableFound: boolean;
  invoiceDate: string | null;
  vendorName: string | null;
  poNumber: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  /** True when this page prints the totals/summary block. */
  totalsBlockFound: boolean;
  charges: ExtractedCharge[];
  /**
   * Whether the model actually answered the charges question for this page. An explicit
   * empty list means "no other charges printed", which is what makes it safe to reconcile
   * subtotal + tax against the total; a missing answer means we simply do not know.
   */
  chargesReported: boolean;
  lines: ExtractedPageLine[];
  confidenceScore: number;
  unavailableFields: string[];
  notes: string | null;
}

export type ExtractionConfidence = "high" | "medium" | "low";

export interface ExtractedInvoice {
  /** 1-based position of this invoice within the upload. */
  invoiceIndex: number;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  vendorName: string | null;
  poNumber: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  /** Always the total printed on the document — never derived from the line items. */
  total: number | null;
  /** Sum of the non-tax charges printed in the totals block. null when none were reported. */
  otherCharges: number | null;
  charges: ExtractedCharge[];
  lines: ExtractedInvoiceLine[];
  /** Pages of the upload that make up this invoice. */
  pageNumbers: number[];
  confidence: ExtractionConfidence;
  confidenceScore: number;
  /** Header fields OCR could not read for this invoice. */
  unavailableFields: string[];
  /**
   * Whether the extracted line items add up to the subtotal printed on the document.
   * null when there was nothing to check against.
   */
  totalsAgree: boolean | null;
  /**
   * Whether subtotal + tax + other charges comes to the total printed on the document.
   * null when the block was too incomplete to check.
   */
  headerTotalsAgree: boolean | null;
  /** Why the printed totals do not reconcile, when they do not. */
  headerTotalsNote: string | null;
  /**
   * True only when the printed total was reconciled against the rest of the printed totals
   * block. A total read off the document but never verified must not be reported as fact.
   */
  totalsVerified: boolean;
  /** Line-item table column labels as printed. */
  columnHeaders: string[];
  notes: string | null;
}

export interface SupportingDocument {
  documentType: Exclude<DocumentPageType, "invoice">;
  documentNumber: string | null;
  pageNumbers: number[];
  confidence: ExtractionConfidence;
  confidenceScore: number;
}

export interface InvoiceDocumentAnalysis {
  documentId: number | null;
  fileName: string;
  /** Whether OCR read the original upload or only a stored preview image. */
  source: DocumentSourceKind;
  /** The available image was too low-resolution to read an invoice table from. */
  lowResolution: boolean;
  /** Pages in the uploaded file. */
  pageCount: number;
  /** Pages actually sent through OCR (capped at MAX_OCR_PAGES). */
  pagesAnalyzed: number;
  /** Distinct invoices found in the upload. */
  invoiceCount: number;
  invoices: ExtractedInvoice[];
  supportingDocuments: SupportingDocument[];
  pages: ExtractedPage[];
  confidence: ExtractionConfidence;
  confidenceScore: number;
  /** Human-readable notes: truncation, unreadable pages, low-confidence values. */
  notes: string | null;
}

const SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
];

export function getDocMimeType(filename: string): string {
  const ext = (filename || "").toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 6) {
    const gifHeader = buffer.subarray(0, 6).toString("ascii");
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return "image/gif";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function normalizeDocumentBuffer(buffer: Buffer): { buffer: Buffer; mimeType: string | null; wasBase64Encoded: boolean } {
  const directMime = sniffMimeType(buffer);
  if (directMime) {
    return { buffer, mimeType: directMime, wasBase64Encoded: false };
  }

  const text = buffer.toString("utf8").trim();
  const dataUrlMatch = text.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  const maybeBase64 = dataUrlMatch ? dataUrlMatch[2] : text;
  if (!maybeBase64 || maybeBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/=\s]+$/.test(maybeBase64)) {
    return { buffer, mimeType: null, wasBase64Encoded: false };
  }

  try {
    const decoded = Buffer.from(maybeBase64.replace(/\s/g, ""), "base64");
    const decodedMime = sniffMimeType(decoded);
    return decodedMime
      ? { buffer: decoded, mimeType: decodedMime, wasBase64Encoded: true }
      : { buffer, mimeType: null, wasBase64Encoded: false };
  } catch {
    return { buffer, mimeType: null, wasBase64Encoded: false };
  }
}

/** Placeholders OCR models emit when a value is not legible — all mean "unavailable", never 0. */
const NULL_TOKENS = new Set([
  "", "-", "--", "—", "–", "n/a", "na", "null", "none", "nil", "?", "??", "???",
  "unknown", "unreadable", "illegible", "not available", "not visible", "tbd",
]);

/** A single grouped or plain number, e.g. 1,240,000.50 / 12,40,000 / 980 / 12.5 */
const SINGLE_NUMBER_PATTERN = /\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/**
 * Parse a value OCR reported for a numeric field. Anything that is not unambiguously a
 * single number comes back as null rather than 0, so an unreadable quantity is never
 * silently turned into a real-looking zero, and a cell that actually holds two numbers
 * ("2 x 620000") is never collapsed into one invented figure.
 */
export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let text = value.trim();
  if (!text || NULL_TOKENS.has(text.toLowerCase())) return null;

  // Accounting negatives: (1,234.00) and 1,234.00-
  let negative = false;
  const parenthesised = text.match(/^\(([\s\S]*)\)$/);
  if (parenthesised) {
    negative = true;
    text = parenthesised[1].trim();
  }
  if (/-\s*$/.test(text)) {
    negative = true;
    text = text.replace(/-\s*$/, "").trim();
  }
  if (/^-/.test(text)) {
    negative = true;
    text = text.replace(/^-\s*/, "");
  }

  const matches = text.match(SINGLE_NUMBER_PATTERN);
  if (!matches || matches.length !== 1) return null;

  const parsed = Number(matches[0].replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/**
 * Labels that only ever appear in the totals/summary block of an invoice. The pattern is
 * anchored at both ends so it matches a whole label ("Grand Total", "CGST 9%") and not a
 * product whose name merely starts with one of these words ("Total Station Survey Kit").
 */
const TOTALS_LABEL_PATTERN =
  /^(sub\s*-?\s*total|total|grand\s*total|total\s*(amount|value)|net\s*(amount|total|payable|value)|amount\s*(payable|due|chargeable|in\s*words)|balance\s*(due|payable)?|round(ing)?\s*-?\s*off|taxable\s*(value|amount)|tax|s\.?\s*tax|service\s*tax|vat|gst|cgst|sgst|igst|utgst|tds|tcs|cess|advance(\s*(paid|adjusted))?|less|add|discount)$/i;

/**
 * True when a row's label marks it as part of the totals block rather than something that
 * was bought. This is the guard against a grand total being reported as a fabricated line.
 */
export function looksLikeTotalsLabel(name: string | null): boolean {
  if (!name) return false;
  const cleaned = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+(\.\d+)?\s*%/g, " ")
    .replace(/[@:\-–—.,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return TOTALS_LABEL_PATTERN.test(cleaned);
}

/** Relative slack allowed when checking that a line's own numbers agree with each other. */
const ARITHMETIC_TOLERANCE = 0.01;

function approximatelyEqual(a: number, b: number, tolerance = ARITHMETIC_TOLERANCE): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  return Math.abs(a - b) <= Math.max(0.02, scale * tolerance);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Column labels that only ever appear on receiving paperwork. A supplier invoice's item
 * table always prices what it lists, so a priced column is what separates the two.
 */
const RECEIVING_ONLY_HEADER = /received|receipt|accepted|rejected|damaged|shortage|short\s*qty/i;
const PRICED_HEADER = /amount|rate|price|value|cost|total|charge/i;

/**
 * True when a table on an invoice-classified page is really a receiving table. A GRN or
 * challan misfiled as an invoice page would otherwise contribute delivered quantities as
 * invoice line items.
 */
export function looksLikeReceivingTable(columnHeaders: string[]): boolean {
  if (columnHeaders.length === 0) return false;
  return (
    columnHeaders.some((header) => RECEIVING_ONLY_HEADER.test(header)) &&
    !columnHeaders.some((header) => PRICED_HEADER.test(header))
  );
}

/** Read the non-tax charges the model reported from the totals block. */
function normalizeCharges(raw: unknown): { charges: ExtractedCharge[]; reported: boolean } {
  if (!Array.isArray(raw)) return { charges: [], reported: false };
  const charges: ExtractedCharge[] = [];
  for (const entry of raw) {
    const amount = toNullableNumber((entry as any)?.amount);
    if (amount === null) continue;
    charges.push({ label: toNullableString((entry as any)?.label), amount });
  }
  return { charges, reported: true };
}

export function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || NULL_TOKENS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => toNullableString(v)).filter((v): v is string => v !== null);
}

function clampScore(value: unknown, fallback: number): number {
  const num = toNullableNumber(value);
  if (num === null) return fallback;
  // Models sometimes answer 85 instead of 0.85.
  const normalized = num > 1 && num <= 100 ? num / 100 : num;
  if (!Number.isFinite(normalized)) return fallback;
  return Math.min(1, Math.max(0, normalized));
}

export function confidenceLabel(score: number): ExtractionConfidence {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function normalizeDocumentNumber(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  return normalized || null;
}

function normalizePageType(value: unknown): DocumentPageType {
  const raw = toNullableString(value)?.toLowerCase().replace(/[\s_-]+/g, "") ?? "";
  if (raw.includes("invoice") || raw.includes("bill")) return "invoice";
  if (raw.includes("grn") || raw.includes("goodsreceipt") || raw.includes("goodsreceived")) return "grn";
  if (raw.includes("challan") || raw.includes("deliverynote") || raw.includes("packingslip") || raw.includes("dispatch")) return "challan";
  if (raw.includes("receipt")) return "receipt";
  return PAGE_TYPES.includes(raw as DocumentPageType) ? (raw as DocumentPageType) : "other";
}

function normalizeLine(raw: any, pageNumber: number, pageConfidence: number): ExtractedPageLine {
  const itemName = toNullableString(raw?.item_name) ?? toNullableString(raw?.description);
  const quantity = toNullableNumber(raw?.quantity);
  const unitPrice = toNullableNumber(raw?.unit_price);
  const totalPrice = toNullableNumber(raw?.total_price);

  const unavailableFields = new Set(toStringArray(raw?.unavailable_fields));
  if (itemName === null) unavailableFields.add("itemName");
  if (quantity === null) unavailableFields.add("quantity");
  if (unitPrice === null) unavailableFields.add("unitPrice");
  if (totalPrice === null) unavailableFields.add("totalPrice");

  // quantity x unit price = line total is the invariant that proves the columns were read
  // in the right order. When it fails the mapping is suspect, so the row is flagged rather
  // than corrected — rewriting it would be substituting a value we did not read.
  let columnCheck: string | null = null;
  if (quantity !== null && unitPrice !== null && totalPrice !== null) {
    if (!approximatelyEqual(quantity * unitPrice, totalPrice)) {
      columnCheck =
        `quantity x unit price (${quantity * unitPrice}) does not match the printed line total (${totalPrice})`;
    }
  }

  return {
    itemName,
    description: toNullableString(raw?.description),
    quantity,
    unitPrice,
    totalPrice,
    taxAmount: toNullableNumber(raw?.tax_amount),
    sourcePage: pageNumber,
    lowConfidence:
      raw?.low_confidence === true ||
      unavailableFields.size > 0 ||
      columnCheck !== null ||
      pageConfidence < 0.5,
    unavailableFields: Array.from(unavailableFields),
    columnCheck,
  };
}

/**
 * Turn one page's raw model JSON into a typed page. Line items are dropped for anything
 * that is not an invoice page, which is the structural guarantee that GRN / challan /
 * receipt rows can never be reported as invoice lines.
 */
export function normalizePageExtraction(raw: any, pageNumber: number): ExtractedPage {
  const readable = raw?.readable !== false;
  const confidenceScore = readable ? clampScore(raw?.page_confidence, 0.5) : 0;
  const documentType = normalizePageType(raw?.document_type);
  const rawLines = Array.isArray(raw?.line_items) ? raw.line_items : [];
  const columnHeaders = toStringArray(raw?.column_headers);
  const receivingTable = documentType === "invoice" && looksLikeReceivingTable(columnHeaders);

  let lines: ExtractedPageLine[] = [];
  let rejectedRows = 0;
  if (documentType === "invoice" && readable && !receivingTable) {
    for (const rawLine of rawLines) {
      const rowSource = toNullableString(rawLine?.row_source)?.toLowerCase() ?? null;
      const name = toNullableString(rawLine?.item_name) ?? toNullableString(rawLine?.description);
      // Two independent guards against a summary figure being reported as something bought:
      // the model's own row classification, and the row's label.
      if ((rowSource !== null && rowSource !== "line_item_table") || looksLikeTotalsLabel(name)) {
        rejectedRows += 1;
        continue;
      }
      lines.push(normalizeLine(rawLine, pageNumber, confidenceScore));
    }
  }

  const isInvoicePage = documentType === "invoice";
  const subtotal = isInvoicePage ? toNullableNumber(raw?.subtotal) : null;
  const tax = isInvoicePage ? toNullableNumber(raw?.tax) : null;
  const total = isInvoicePage ? toNullableNumber(raw?.total) : null;
  const { charges, reported: chargesReported } = isInvoicePage
    ? normalizeCharges(raw?.charges)
    : { charges: [] as ExtractedCharge[], reported: false };

  const noteParts: string[] = [];
  const modelNote = toNullableString(raw?.notes);
  if (modelNote) noteParts.push(modelNote);
  if (receivingTable && rawLines.length > 0) {
    noteParts.push(
      `The table on page ${pageNumber} lists received/accepted quantities and prices nothing, so it is receiving paperwork rather than an invoice item table — its ${rawLines.length} row(s) were not treated as invoice line items.`
    );
  }
  if (rejectedRows > 0) {
    noteParts.push(`${rejectedRows} totals/summary row(s) on page ${pageNumber} were not treated as line items.`);
  }
  if (documentType === "invoice" && readable && raw?.line_item_table_found === false && lines.length === 0) {
    noteParts.push(`No line-item table was present on page ${pageNumber}.`);
  }

  return {
    pageNumber,
    documentType,
    documentNumber: toNullableString(raw?.document_number),
    isContinuation: raw?.is_continuation === true,
    readable,
    columnHeaders,
    lineItemTableFound: raw?.line_item_table_found === true || lines.length > 0,
    invoiceDate: isInvoicePage ? toNullableString(raw?.invoice_date) : null,
    vendorName: isInvoicePage ? toNullableString(raw?.vendor_name) : null,
    poNumber: toNullableString(raw?.po_number),
    currency: isInvoicePage ? toNullableString(raw?.currency) : null,
    subtotal,
    tax,
    total,
    totalsBlockFound:
      raw?.totals_block_found === true || subtotal !== null || tax !== null || total !== null || charges.length > 0,
    charges,
    chargesReported,
    lines,
    confidenceScore,
    unavailableFields: toStringArray(raw?.unavailable_fields),
    notes: noteParts.length > 0 ? noteParts.join(" ") : null,
  };
}

/** An unreadable page still occupies a page slot so counts stay honest. */
function unreadablePage(pageNumber: number, note: string): ExtractedPage {
  return {
    pageNumber,
    documentType: "other",
    documentNumber: null,
    isContinuation: false,
    readable: false,
    columnHeaders: [],
    lineItemTableFound: false,
    invoiceDate: null,
    vendorName: null,
    poNumber: null,
    currency: null,
    subtotal: null,
    tax: null,
    total: null,
    totalsBlockFound: false,
    charges: [],
    chargesReported: false,
    lines: [],
    confidenceScore: 0,
    unavailableFields: [],
    notes: note,
  };
}

function firstNonNull<T>(pages: ExtractedPage[], pick: (page: ExtractedPage) => T | null): T | null {
  for (const page of pages) {
    const value = pick(page);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function averageScore(pages: ExtractedPage[]): number {
  if (pages.length === 0) return 0;
  const sum = pages.reduce((acc, page) => acc + page.confidenceScore, 0);
  return Math.round((sum / pages.length) * 100) / 100;
}

/**
 * An invoice prints its totals block once, on one page. Reading the subtotal off one page
 * and the total off another can combine figures that were never printed together and yield
 * a total the document does not state, so the whole block is taken from a single page: the
 * last one printing a total, else the last one printing any part of the block.
 */
function pickTotalsPage(pages: ExtractedPage[]): ExtractedPage | null {
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pages[i].total !== null) return pages[i];
  }
  for (let i = pages.length - 1; i >= 0; i--) {
    const page = pages[i];
    if (page.subtotal !== null || page.tax !== null || page.charges.length > 0) return page;
  }
  return null;
}

/**
 * Reconcile the printed total against the rest of the printed totals block. The total is
 * always reported exactly as read — this only decides whether it may be called verified,
 * so a misread grand total cannot be presented as the supplier's actual figure.
 */
export function checkHeaderTotals(input: {
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  otherCharges: number | null;
}): { agree: boolean | null; note: string | null } {
  const { subtotal, tax, total, otherCharges } = input;
  if (total === null || subtotal === null) return { agree: null, note: null };

  const charges = otherCharges ?? 0;
  // A tax line that was not printed means "no tax" only if the total already works without
  // one; otherwise the tax is genuinely unknown and nothing can be confirmed.
  if (approximatelyEqual(subtotal + (tax ?? 0) + charges, total, 0.02)) {
    return { agree: true, note: null };
  }
  if (tax === null) return { agree: null, note: null };

  const parts = [`subtotal ${subtotal}`, `tax ${tax}`];
  if (otherCharges !== null) parts.push(`other charges ${otherCharges}`);
  return {
    agree: false,
    note: `${parts.join(" + ")} comes to ${round2(subtotal + tax + charges)}, but the document prints a total of ${total}`,
  };
}

function buildInvoice(pages: ExtractedPage[], invoiceIndex: number): ExtractedInvoice {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  const lines: ExtractedInvoiceLine[] = [];
  for (const page of ordered) {
    for (const line of page.lines) {
      lines.push({ ...line, lineNumber: lines.length + 1 });
    }
  }

  const invoiceNumber = firstNonNull(ordered, (p) => p.documentNumber);
  const invoiceDate = firstNonNull(ordered, (p) => p.invoiceDate);
  const vendorName = firstNonNull(ordered, (p) => p.vendorName);
  const poNumber = firstNonNull(ordered, (p) => p.poNumber);
  const currency = firstNonNull(ordered, (p) => p.currency);

  const totalsPage = pickTotalsPage(ordered);
  const subtotal = totalsPage?.subtotal ?? null;
  const tax = totalsPage?.tax ?? null;
  const total = totalsPage?.total ?? null;
  const charges = totalsPage?.charges ?? [];
  const otherCharges =
    charges.length > 0 ? round2(charges.reduce((acc, charge) => acc + charge.amount, 0)) : null;
  const headerTotals = checkHeaderTotals({ subtotal, tax, total, otherCharges });

  const unavailableFields: string[] = [];
  if (invoiceNumber === null) unavailableFields.push("invoiceNumber");
  if (invoiceDate === null) unavailableFields.push("invoiceDate");
  if (vendorName === null) unavailableFields.push("vendorName");
  if (total === null) unavailableFields.push("total");
  // Without the subtotal the printed total cannot be reconciled against anything, so the
  // gap is reported rather than papered over with a figure added up from the line items.
  if (total !== null && subtotal === null) unavailableFields.push("subtotal");

  let confidenceScore = averageScore(ordered);
  const hasLowConfidenceLine = lines.some((line) => line.lowConfidence);
  if (unavailableFields.length > 0 || hasLowConfidenceLine) {
    // Anything OCR could not read caps the invoice at "medium at best" so a partially
    // read invoice is never presented as a high-confidence extraction.
    confidenceScore = Math.min(confidenceScore, 0.6);
  }
  if (ordered.some((page) => !page.readable)) {
    confidenceScore = Math.min(confidenceScore, 0.4);
  }

  const noteParts = ordered.map((p) => p.notes).filter((n): n is string => !!n);
  if (unavailableFields.length > 0) {
    noteParts.push(`Not readable on the document: ${unavailableFields.join(", ")}.`);
  }
  const lowConfidenceLines = lines.filter((line) => line.lowConfidence).length;
  if (lowConfidenceLines > 0) {
    noteParts.push(`${lowConfidenceLines} line item(s) were read with low confidence.`);
  }
  for (const line of lines) {
    if (line.columnCheck) {
      noteParts.push(`Line ${line.lineNumber}: ${line.columnCheck}.`);
    }
  }

  // The line items must add up to the amount the invoice itself prints. When they do not,
  // the wrong rows were read — most often a totals figure captured as a line item — so the
  // extraction is reported as unreliable instead of being passed off as correct.
  //
  // The printed subtotal is the only figure the lines are checked against. Backing one out
  // of the total is only safe once tax and every other charge are accounted for, otherwise
  // freight or a round-off we never saw would show up as a line-item error.
  const chargesAccountedFor = totalsPage?.chargesReported === true;
  const derivedSubtotal =
    total !== null && tax !== null && chargesAccountedFor
      ? round2(total - tax - (otherCharges ?? 0))
      : null;
  const expectedSubtotal = subtotal ?? derivedSubtotal;
  const lineTotals = lines.map((line) => line.totalPrice);
  const linesFooted = lines.length > 0 && lineTotals.every((value) => value !== null);
  let totalsAgree: boolean | null = null;
  if (linesFooted && expectedSubtotal !== null) {
    const sum = round2(lineTotals.reduce<number>((acc, value) => acc + (value ?? 0), 0));
    totalsAgree = approximatelyEqual(sum, expectedSubtotal, 0.02);
    if (!totalsAgree) {
      noteParts.push(
        `Line items add up to ${sum} but the document states ${expectedSubtotal} — the line-item table may have been read incorrectly.`
      );
    }
  } else if (lines.length > 0 && expectedSubtotal === null) {
    noteParts.push(
      "The subtotal was not readable on the document, so the line items could not be checked against it."
    );
  }
  if (totalsAgree === false) {
    confidenceScore = Math.min(confidenceScore, 0.35);
  }

  if (headerTotals.agree === false) {
    noteParts.push(
      `The printed totals do not reconcile: ${headerTotals.note}. The total is reported as printed but could not be confirmed.`
    );
    confidenceScore = Math.min(confidenceScore, 0.35);
  } else if (total !== null && headerTotals.agree === null) {
    noteParts.push(
      "The total was read from the document but could not be checked against a printed subtotal and tax, so it is reported as unconfirmed."
    );
    confidenceScore = Math.min(confidenceScore, 0.6);
  }

  return {
    invoiceIndex,
    invoiceNumber,
    invoiceDate,
    vendorName,
    poNumber,
    currency,
    subtotal,
    tax,
    total,
    otherCharges,
    charges,
    lines,
    pageNumbers: ordered.map((p) => p.pageNumber),
    confidence: confidenceLabel(confidenceScore),
    confidenceScore,
    unavailableFields,
    totalsAgree,
    headerTotalsAgree: headerTotals.agree,
    headerTotalsNote: headerTotals.note,
    totalsVerified: total !== null && headerTotals.agree === true,
    columnHeaders: Array.from(new Set(ordered.flatMap((p) => p.columnHeaders))),
    notes: noteParts.length > 0 ? noteParts.join(" ") : null,
  };
}

function buildSupportingDocument(pages: ExtractedPage[]): SupportingDocument {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const score = averageScore(ordered);
  return {
    documentType: ordered[0].documentType as SupportingDocument["documentType"],
    documentNumber: firstNonNull(ordered, (p) => p.documentNumber),
    pageNumbers: ordered.map((p) => p.pageNumber),
    confidence: confidenceLabel(score),
    confidenceScore: score,
  };
}

/**
 * Group classified pages into distinct documents.
 *
 * Pages carrying the same invoice number belong to the same invoice wherever they appear.
 * A page with no number that the model marked as a continuation extends the invoice
 * before it; otherwise it starts a new one. Non-invoice pages are grouped the same way
 * but kept aside as supporting documents.
 */
export function groupPagesIntoDocuments(pages: ExtractedPage[]): {
  invoices: ExtractedInvoice[];
  supportingDocuments: SupportingDocument[];
} {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  type InvoiceGroup = { key: string | null; pages: ExtractedPage[] };
  type SupportGroup = { type: DocumentPageType; key: string | null; pages: ExtractedPage[] };

  const invoiceGroups: InvoiceGroup[] = [];
  const supportGroups: SupportGroup[] = [];
  let currentInvoice: InvoiceGroup | null = null;
  let currentSupportIndex = -1;

  for (const page of ordered) {
    const key = normalizeDocumentNumber(page.documentNumber);

    if (page.documentType === "invoice") {
      currentSupportIndex = -1;
      const existing = key ? invoiceGroups.find((g) => g.key === key) : undefined;
      if (existing) {
        existing.pages.push(page);
        currentInvoice = existing;
      } else if (key) {
        currentInvoice = { key, pages: [page] };
        invoiceGroups.push(currentInvoice);
      } else if (page.isContinuation && currentInvoice) {
        currentInvoice.pages.push(page);
      } else {
        currentInvoice = { key: null, pages: [page] };
        invoiceGroups.push(currentInvoice);
      }
      continue;
    }

    // Unreadable filler pages should not break an invoice that continues after them.
    if (page.documentType === "other" && !page.readable) {
      continue;
    }

    const existingIndex = key
      ? supportGroups.findIndex((g) => g.type === page.documentType && g.key === key)
      : -1;
    if (existingIndex >= 0) {
      supportGroups[existingIndex].pages.push(page);
      currentSupportIndex = existingIndex;
    } else if (key) {
      supportGroups.push({ type: page.documentType, key, pages: [page] });
      currentSupportIndex = supportGroups.length - 1;
    } else if (
      page.isContinuation &&
      currentSupportIndex >= 0 &&
      supportGroups[currentSupportIndex].type === page.documentType
    ) {
      supportGroups[currentSupportIndex].pages.push(page);
    } else {
      supportGroups.push({ type: page.documentType, key: null, pages: [page] });
      currentSupportIndex = supportGroups.length - 1;
    }
  }

  return {
    invoices: invoiceGroups.map((group, idx) => buildInvoice(group.pages, idx + 1)),
    supportingDocuments: supportGroups.map((group) => buildSupportingDocument(group.pages)),
  };
}

export function buildAnalysis(input: {
  documentId: number | null;
  fileName: string;
  pageCount: number;
  pages: ExtractedPage[];
  source?: DocumentSourceKind;
  lowResolution?: boolean;
}): InvoiceDocumentAnalysis {
  const { invoices, supportingDocuments } = groupPagesIntoDocuments(input.pages);

  let confidenceScore = averageScore(input.pages);
  const unreadablePages = input.pages.filter((p) => !p.readable).length;
  if (unreadablePages > 0) {
    confidenceScore = Math.min(confidenceScore, 0.4);
  }
  if (invoices.length > 0) {
    confidenceScore = Math.min(confidenceScore, Math.max(...invoices.map((i) => i.confidenceScore)));
  }

  const notes: string[] = [];
  if (input.pages.length < input.pageCount) {
    notes.push(
      `Only the first ${input.pages.length} of ${input.pageCount} pages were analysed.`
    );
  }
  if (unreadablePages > 0) {
    notes.push(`${unreadablePages} page(s) could not be read.`);
    // Readable pages contribute their notes through the invoice they belong to; unreadable
    // pages belong to no invoice, so their reason would otherwise be lost.
    for (const page of input.pages) {
      if (!page.readable && page.notes) notes.push(page.notes);
    }
  }
  if (invoices.length > 1) {
    notes.push(`${invoices.length} separate invoices were found in this upload.`);
  }
  if (supportingDocuments.length > 0) {
    const summary = supportingDocuments
      .map((d) => `${d.documentType}${d.documentNumber ? ` ${d.documentNumber}` : ""} (page ${d.pageNumbers.join(", ")})`)
      .join("; ");
    notes.push(`Supporting documents ignored for invoice line items: ${summary}.`);
  }

  for (const invoice of invoices) {
    if (invoice.notes) notes.push(invoice.notes);
  }

  return {
    documentId: input.documentId,
    fileName: input.fileName,
    source: input.source ?? "original_file",
    lowResolution: input.lowResolution ?? false,
    pageCount: input.pageCount,
    pagesAnalyzed: input.pages.length,
    invoiceCount: invoices.length,
    invoices,
    supportingDocuments,
    pages: input.pages,
    confidence: confidenceLabel(confidenceScore),
    confidenceScore,
    notes: notes.length > 0 ? notes.join(" ") : null,
  };
}

/**
 * Pick the invoice in the upload that the system record refers to. With several invoices
 * in one PDF, matching the wrong one would produce bogus discrepancies, so the invoice
 * number is weighted far above every other signal.
 */
export function selectPrimaryInvoice(
  invoices: ExtractedInvoice[],
  record: { invoiceNumber?: string | null; poNumber?: string | null; total?: number | null }
): ExtractedInvoice | null {
  if (invoices.length === 0) return null;
  if (invoices.length === 1) return invoices[0];

  const recordInvoiceNumber = normalizeDocumentNumber(record.invoiceNumber ?? null);
  const recordPoNumber = normalizeDocumentNumber(record.poNumber ?? null);
  const recordTotal = record.total ?? null;

  let best = invoices[0];
  let bestScore = -Infinity;

  for (const invoice of invoices) {
    let score = 0;
    const invoiceNumber = normalizeDocumentNumber(invoice.invoiceNumber);
    if (recordInvoiceNumber && invoiceNumber) {
      if (invoiceNumber === recordInvoiceNumber) score += 100;
      else if (invoiceNumber.includes(recordInvoiceNumber) || recordInvoiceNumber.includes(invoiceNumber)) score += 60;
    }

    const poNumber = normalizeDocumentNumber(invoice.poNumber);
    if (recordPoNumber && poNumber && (poNumber === recordPoNumber || poNumber.includes(recordPoNumber) || recordPoNumber.includes(poNumber))) {
      score += 30;
    }

    if (recordTotal != null && recordTotal > 0 && invoice.total != null) {
      const deviation = Math.abs(invoice.total - recordTotal) / recordTotal;
      if (deviation <= 0.01) score += 20;
      else if (deviation <= 0.1) score += 8;
    }

    score += invoice.confidenceScore;

    if (score > bestScore) {
      bestScore = score;
      best = invoice;
    }
  }

  return best;
}

const PAGE_SYSTEM_PROMPT = `You are an OCR extraction specialist for accounts payable documents.

You are shown EXACTLY ONE page of an uploaded file. The upload may contain several different
documents joined together - for example two unrelated invoices, or an invoice followed by a
goods receipt note and a delivery challan. Classify THIS page and extract only what is printed
on THIS page.

CLASSIFICATION
1. "document_type" must be exactly one of: "invoice", "grn", "challan", "receipt", "other".
   - invoice: a supplier bill or tax invoice requesting payment.
   - grn: goods receipt note / goods received note / receiving report.
   - challan: delivery challan, delivery note, packing slip or dispatch note.
   - receipt: acknowledgement that a payment was made.
   - other: anything else, including terms pages, cover letters, blank or unreadable pages.
2. "is_continuation" is true only when this page continues a document that started on an earlier
   page (for example a line-item table with no fresh header or document number).
3. "document_number" is the invoice number on an invoice page, otherwise the GRN / challan /
   receipt number. Use null when no number is printed on this page.

READING THE LINE-ITEM TABLE (the most important part)
4. Line items come from ONE place only: the invoice's line-item table - the grid whose header row
   names the columns (Description / Item, Qty, Rate or Unit Price, Amount, and so on). Set
   "line_item_table_found" to true only when you can actually see that header row on this page,
   and copy the header labels exactly as printed into "column_headers".
5. Map each value by its COLUMN, using the header row to decide which column is which. Read across
   a row only within that row. Never take a number from a different row, a different column, or
   from outside the table.
6. If this page has no line-item table, return "line_items": [] and
   "line_item_table_found": false. An invoice page can legitimately have zero line items (for
   example a page holding only the summary or the terms).
7. NEVER manufacture a line item. In particular, never turn a totals or summary figure into a
   line: Subtotal, Total, Grand Total, Net Amount, Amount Payable, Balance Due, Round Off,
   Tax / VAT / GST / CGST / SGST / IGST, TDS, Advance and Discount lines from the totals block are
   NOT line items. If the only large number you can read is a total, that means there are no
   readable line items - say so, do not invent a row to hold it.
8. Set "row_source" on every row you return: "line_item_table" for a genuine row of the item
   table, "totals_block" for a summary/tax/total row, "other" for anything else. Only rows marked
   "line_item_table" will be used.
9. Do not merge several rows into one and do not split one row into several. Return the rows in
   printed order with "row_index" starting at 1.

THE TOTALS BLOCK
10. Set "totals_block_found" to true only when this page prints the summary block (the
    subtotal / tax / grand total area). Continuation pages usually do not have one.
11. "total" is the grand total the document PRINTS as payable - the "Total", "Grand Total",
    "Net Payable" or "Amount Due" figure. Copy that printed figure. NEVER add the line items up,
    never add subtotal and tax together, and never reuse the subtotal, a tax amount or a line
    amount as the total. If the grand total is not legible, return null for "total" and list
    "total" in "unavailable_fields" - a missing total is fine, an invented one is not.
12. "subtotal" is the pre-tax total of the items as printed, and "tax" is the total tax printed
    (add nothing up yourself: if CGST and SGST are printed separately and no combined tax figure
    is shown, return null for "tax" and note it). Return null for anything not printed.
13. "charges" lists every OTHER amount printed in the totals block that is not the subtotal, the
    tax or the grand total - freight, shipping, packing, insurance, handling, round-off, discount.
    Copy each label and its printed amount, negative for a deduction such as a discount. Return an
    empty array when the block prints no such amounts. These are NOT line items and must not
    appear in "line_items".

VALUES
14. NEVER guess. If a value is missing, cropped, blurred or you are unsure, return null and list
    the field name in "unavailable_fields". Do not compute a value arithmetically, do not carry it
    over from another document or another row, and do not return 0 for a number you could not read.
15. Return numbers as plain digits with a decimal point - strip currency symbols and thousands
    separators. Keep the printed value exactly; do not round or rescale it.
16. "subtotal", "tax", "total" and "charges" are only the amounts printed on THIS page.
17. "page_confidence" is 0.0-1.0 for how legible this page was. Set "readable" to false when the
    page cannot be read at all - including when it is too blurry or too low-resolution to read the
    table reliably. A low-resolution page must be reported as unreadable, never guessed at.

Return ONLY valid JSON with this shape:
{
  "document_type": "invoice" | "grn" | "challan" | "receipt" | "other",
  "document_number": "string or null",
  "is_continuation": boolean,
  "readable": boolean,
  "invoice_date": "YYYY-MM-DD or null",
  "vendor_name": "string or null",
  "po_number": "string or null",
  "currency": "3-letter code or null",
  "totals_block_found": boolean,
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "charges": [
    { "label": "exactly as printed, e.g. Freight", "amount": number }
  ],
  "line_item_table_found": boolean,
  "column_headers": ["column labels exactly as printed"],
  "line_items": [
    {
      "row_index": number,
      "row_source": "line_item_table" | "totals_block" | "other",
      "item_name": "string or null",
      "description": "string or null",
      "quantity": number or null,
      "unit_price": number or null,
      "total_price": number or null,
      "tax_amount": number or null,
      "low_confidence": boolean,
      "unavailable_fields": ["field names that could not be read"]
    }
  ],
  "page_confidence": number between 0 and 1,
  "unavailable_fields": ["header field names that could not be read"],
  "notes": "string or null"
}`;

interface PagePayload {
  pageNumber: number;
  imageBase64?: string;
  imageMimeType?: string;
  text?: string;
}

async function extractPage(payload: PagePayload, pageCount: number): Promise<ExtractedPage> {
  const contentParts: any[] = [
    {
      type: "text",
      text: `This is page ${payload.pageNumber} of ${pageCount} of the uploaded file. Classify and extract this page only.`,
    },
  ];

  if (payload.imageBase64 && payload.imageMimeType) {
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${payload.imageMimeType};base64,${payload.imageBase64}`, detail: "high" },
    });
    if (payload.text && payload.text.trim().length > 0) {
      contentParts.push({
        type: "text",
        text:
          `Embedded text layer of this same page, extracted directly from the PDF. These are the ` +
          `exact characters printed on the page — use them for the precise spelling of names and ` +
          `the exact digits of every number, and use the image to work out the table layout and ` +
          `which column each value belongs to. Where the image and this text disagree, trust this ` +
          `text:\n\n${payload.text}`,
      });
    }
  } else if (payload.text) {
    contentParts.push({ type: "text", text: `Text layer of this page:\n\n${payload.text}` });
  } else {
    return unreadablePage(payload.pageNumber, "Page was blank or could not be rendered.");
  }

  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: PAGE_SYSTEM_PROMPT },
        { role: "user", content: contentParts },
      ],
      max_tokens: 2500,
      temperature: 0,
    });

    const rawContent = response.choices[0]?.message?.content?.trim() || "";
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return unreadablePage(payload.pageNumber, "OCR returned no structured data for this page.");
    }
    return normalizePageExtraction(JSON.parse(jsonMatch[0]), payload.pageNumber);
  } catch (error: any) {
    console.error(`Page ${payload.pageNumber} extraction failed:`, error?.message || error);
    return unreadablePage(payload.pageNumber, "OCR failed for this page.");
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

interface SourceDocument {
  id?: number | null;
  filename?: string | null;
  doc_name?: string | null;
  doc_path?: string | null;
  doc_uri?: Buffer | null;
}

/** Width/height of a PNG or JPEG straight from its header, without decoding the pixels. */
export function readImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    buffer.subarray(12, 16).toString("ascii") === "IHDR"
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 carry the frame dimensions.
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength <= 0) break;
      offset += 2 + segmentLength;
    }
  }

  return null;
}

interface ResolvedSource {
  buffer: Buffer;
  mimeType: string;
  kind: DocumentSourceKind;
}

async function downloadOriginalDocument(docPath: string): Promise<Buffer | null> {
  try {
    if (/^https?:\/\//i.test(docPath)) {
      const { downloadFileFromAzure } = await import("./azure-blob.service");
      const buffer = await downloadFileFromAzure(docPath);
      return buffer.length > 0 ? buffer : null;
    }
    if (docPath.startsWith("/uploads/")) {
      const [{ default: fs }, { default: path }] = await Promise.all([
        import("fs"),
        import("path"),
      ]);
      const absolute = path.join(process.cwd(), docPath.replace(/^\/+/, ""));
      if (!fs.existsSync(absolute)) return null;
      const buffer = fs.readFileSync(absolute);
      return buffer.length > 0 ? buffer : null;
    }
  } catch (error: any) {
    console.error(`Could not fetch original invoice document from "${docPath}":`, error?.message || error);
  }
  return null;
}

/**
 * Get the best available bytes for a document.
 *
 * `doc_uri` holds a client-generated preview — for PDFs a 280px-wide thumbnail of page 1 —
 * which is far too small to read a line-item table from. The original upload lives in
 * `doc_path`, so that is tried first and the preview is only a fallback.
 */
async function resolveDocumentSource(doc: SourceDocument, declaredMimeType: string): Promise<ResolvedSource | null> {
  const docPath = doc.doc_path ? String(doc.doc_path).trim() : "";
  if (docPath) {
    const original = await downloadOriginalDocument(docPath);
    if (original) {
      const mimeType = sniffMimeType(original) || getDocMimeType(docPath) || declaredMimeType;
      if (SUPPORTED_MIME_TYPES.includes(mimeType)) {
        return { buffer: original, mimeType, kind: "original_file" };
      }
    }
  }

  if (doc.doc_uri && Buffer.isBuffer(doc.doc_uri) && doc.doc_uri.length > 0) {
    const normalized = normalizeDocumentBuffer(doc.doc_uri);
    const mimeType = normalized.mimeType || declaredMimeType;
    if (SUPPORTED_MIME_TYPES.includes(mimeType)) {
      return { buffer: normalized.buffer, mimeType, kind: "preview_image" };
    }
  }

  return null;
}

async function buildPagePayloads(
  buffer: Buffer,
  mimeType: string
): Promise<{ pageCount: number; payloads: PagePayload[] } | null> {
  if (mimeType !== "application/pdf") {
    return {
      pageCount: 1,
      payloads: [{ pageNumber: 1, imageBase64: buffer.toString("base64"), imageMimeType: mimeType }],
    };
  }

  // The text layer of a digital PDF carries the exact characters. Pairing it with the page
  // image lets the model read amounts as printed instead of inferring digits from pixels,
  // which is where transposed and invented figures come from.
  const textPages = await extractPdfPagesText(buffer, MAX_OCR_PAGES).catch(() => null);
  const textByPage = new Map<number, string>(
    (textPages?.pages ?? []).map((page) => [page.pageNumber, page.text])
  );

  const rendered = await renderPdfPagesToPngBuffers(buffer, MAX_OCR_PAGES);
  if (rendered) {
    return {
      pageCount: rendered.pageCount,
      payloads: rendered.pages.map((page) => ({
        pageNumber: page.pageNumber,
        imageBase64: page.png.toString("base64"),
        imageMimeType: "image/png",
        text: textByPage.get(page.pageNumber) || undefined,
      })),
    };
  }

  if (!textPages) return null;
  const payloads = textPages.pages
    .filter((page) => page.text.trim().length > 0)
    .map((page) => ({ pageNumber: page.pageNumber, text: page.text }));
  if (payloads.length === 0) return null;
  return { pageCount: textPages.pageCount, payloads };
}

/**
 * Classify and extract every page of an uploaded document, then group the pages into the
 * invoices and supporting documents they actually represent. Returns null when the file
 * cannot be read at all.
 */
export async function analyzeInvoiceDocument(doc: SourceDocument): Promise<InvoiceDocumentAnalysis | null> {
  const fileName = doc.filename || doc.doc_name || "Unknown";
  try {
    const declaredMimeType = getDocMimeType(fileName);
    const source = await resolveDocumentSource(doc, declaredMimeType);
    if (!source) {
      return null;
    }

    // A stored preview is a thumbnail. If it is too small for the item table to be legible,
    // anything extracted from it would be guesswork, so the document is reported as
    // unreadable with the reason rather than producing invented line items.
    if (source.kind === "preview_image" && source.mimeType !== "application/pdf") {
      const dimensions = readImageDimensions(source.buffer);
      if (dimensions && dimensions.width < MIN_LEGIBLE_IMAGE_WIDTH) {
        return buildAnalysis({
          documentId: doc.id ?? null,
          fileName,
          pageCount: 1,
          source: source.kind,
          lowResolution: true,
          pages: [
            unreadablePage(
              1,
              `Only a ${dimensions.width}x${dimensions.height} preview image is stored for this document and the original could not be retrieved. That is too low-resolution to read an invoice table reliably, so no values were extracted.`
            ),
          ],
        });
      }
    }

    const prepared = await buildPagePayloads(source.buffer, source.mimeType);
    if (!prepared || prepared.payloads.length === 0) {
      return null;
    }

    const pages = await mapWithConcurrency(prepared.payloads, PAGE_CONCURRENCY, (payload) =>
      extractPage(payload, prepared.pageCount)
    );

    if (pages.every((page) => !page.readable)) {
      return null;
    }

    return buildAnalysis({
      documentId: doc.id ?? null,
      fileName,
      pageCount: prepared.pageCount,
      pages,
      source: source.kind,
      lowResolution: false,
    });
  } catch (error: any) {
    console.error(`Document extraction failed for file="${fileName}":`, error?.message || error);
    return null;
  }
}
