import { getAIClient, getAIModelName } from "./ai-client";
import { pool } from "../db";
import { getContextPool } from "../tenant-context";
import {
  analyzeInvoiceDocument,
  confidenceLabel,
  selectPrimaryInvoice,
  type ExtractionConfidence,
  type ExtractedInvoice,
  type InvoiceDocumentAnalysis,
} from "./invoice-document-extraction";
import {
  buildPoReconciliation,
  exceedsByTolerance,
  loadPoReconciliationInputs,
  loadToleranceConfig,
  persistPoReconciliation,
  remainingGrnAfterPriorInvoices,
  withinRelativeTolerance,
  type PoLineReconcileStatus,
  type PoReconciliationResult,
  type ToleranceConfig,
} from "./invoice-reconciliation";

const getPool = () => getContextPool() ?? pool;

export interface ExtractedDocLine {
  lineNumber: number;
  /** null when OCR could not read the item name — never a placeholder guess. */
  itemName: string | null;
  description: string | null;
  /** null means "OCR could not read this", which is different from a genuine 0. */
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  taxAmount: number | null;
  /** Page of the uploaded file this line was read from. */
  sourcePage: number | null;
  lowConfidence: boolean;
  unavailableFields: string[];
  /** Set when quantity x unit price disagrees with the printed line total. */
  columnCheck: string | null;
}

export interface DocumentExtraction {
  documentId: number | null;
  fileName: string;
  extractedInvoiceNumber: string | null;
  extractedDate: string | null;
  extractedVendorName: string | null;
  extractedPoNumber: string | null;
  extractedSubtotal: number | null;
  extractedTax: number | null;
  /** The total printed on the document — never a figure added up from the line items. */
  extractedTotal: number | null;
  /** Freight, packing, round-off and the like, as printed in the totals block. */
  extractedOtherCharges: number | null;
  extractedCharges: Array<{ label: string | null; amount: number }>;
  extractedCurrency: string | null;
  extractedLines: ExtractedDocLine[];
  confidence: ExtractionConfidence;
  confidenceScore: number;
  extractionNotes: string | null;
  /** Position of this invoice within the uploaded file(s). */
  invoiceIndex: number;
  /** Pages of the uploaded file that make up this invoice. */
  pageNumbers: number[];
  /** Header fields OCR could not read. */
  unavailableFields: string[];
  /** Whether the extracted lines add up to the subtotal printed on the document. */
  totalsAgree: boolean | null;
  /** Whether subtotal + tax + other charges comes to the total printed on the document. */
  headerTotalsAgree: boolean | null;
  /** Why the printed totals do not reconcile, when they do not. */
  headerTotalsNote: string | null;
  /**
   * True only when the printed total was reconciled against the document's own subtotal,
   * tax and charges. An unverified total is reported for a manual check, never as fact.
   */
  totalsVerified: boolean;
  /** Line-item table column labels as printed, so the mapping can be audited. */
  columnHeaders: string[];
}

/** One invoice found inside an upload, as reported to the client. */
export interface DocumentInvoiceSummary {
  invoiceIndex: number;
  fileName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  vendorName: string | null;
  poNumber: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  /** Freight, packing, round-off and the like, as printed in the totals block. */
  otherCharges: number | null;
  /** Whether the printed total reconciles against the printed subtotal, tax and charges. */
  totalsVerified: boolean;
  lineCount: number;
  pageNumbers: number[];
  confidence: ExtractionConfidence;
  confidenceScore: number;
  unavailableFields: string[];
  /** True for the invoice that was verified against this system record. */
  isPrimary: boolean;
}

export interface DocumentSupportingSummary {
  fileName: string;
  documentType: "grn" | "challan" | "receipt" | "other";
  documentNumber: string | null;
  pageNumbers: number[];
  confidence: ExtractionConfidence;
}

/** Non-blocking observation about the upload — never changes the verification verdict. */
export interface DocumentAdvisory {
  code:
    | "multiple_invoices"
    | "supporting_documents"
    | "pages_truncated"
    | "low_confidence"
    | "unreadable_pages"
    | "low_resolution"
    | "preview_only"
    | "totals_mismatch"
    | "header_totals_mismatch"
    | "unverified_total"
    | "column_mapping";
  message: string;
}

/** What the uploaded file(s) actually contained, independent of any matching verdict. */
export interface DocumentAnalysisSummary {
  fileNames: string[];
  /** Uploaded files that were successfully read. */
  documentCount: number;
  /** Pages across those files. */
  pageCount: number;
  pagesAnalyzed: number;
  /** Distinct invoices found across those files. */
  invoiceCount: number;
  /** Line items on the invoice verified against this record. */
  invoiceLineCount: number;
  invoices: DocumentInvoiceSummary[];
  supportingDocuments: DocumentSupportingSummary[];
  ocrConfidence: ExtractionConfidence;
  ocrConfidenceScore: number;
  /** Whether OCR read the original upload or only a stored preview thumbnail. */
  source: "original_file" | "preview_image" | "mixed";
  /**
   * False when the extracted values cannot be trusted — the image was too small to read,
   * or the line items do not add up to the totals printed on the document. Discrepancies
   * reported against an unreliable extraction are unconfirmed, not proven.
   */
  reliable: boolean;
  advisories: DocumentAdvisory[];
  notes: string | null;
}

export interface DocVsSystemMismatch {
  field: string;
  label: string;
  documentValue: string;
  systemValue: string;
  severity: "high" | "medium" | "low";
  message?: string;
}

export type MatchConfidence = "high" | "medium" | "low";

export interface DocLineMatch {
  docLineNumber: number;
  docItemName: string | null;
  docQty: number | null;
  docUnitPrice: number | null;
  docTotalPrice: number | null;
  /** Page of the uploaded file this line came from. */
  docSourcePage: number | null;
  docLowConfidence: boolean;
  docUnavailableFields: string[];
  /** Set when the line's own numbers do not multiply out, i.e. a column may be misread. */
  docColumnCheck: string | null;
  systemLineNumber: number | null;
  systemItemName: string | null;
  systemQty: number | null;
  systemUnitCost: number | null;
  systemCost: number | null;
  poLineNumber: string | null;
  poItemName: string | null;
  poQty: number | null;
  poUnitCost: number | null;
  poCost: number | null;
  grnAcceptedQty: number | null;
  matchStatus: "matched" | "partial" | "unmatched";
  /** Confidence in the selected line pairing, independent of OCR confidence. */
  matchConfidence: MatchConfidence;
  matchConfidenceScore: number;
  matchConfidenceReason: string;
  mismatches: DocVsSystemMismatch[];
}

export interface LineMatchResult {
  invoiceLineId: number | null;
  invoiceLineNumber: number | null;
  invoiceItemName: string | null;
  invoiceDescription: string | null;
  invoiceQty: number | null;
  invoiceUnitCost: number | null;
  invoiceCost: number | null;
  poLineId: number | null;
  poLineNumber: string | null;
  poItemName: string | null;
  poDescription: string | null;
  poQty: number | null;
  poUnitCost: number | null;
  poCost: number | null;
  grnReceivedQty: number | null;
  grnRejectedQty: number | null;
  grnAcceptedQty: number | null;
  /** Accepted GRN qty still open for this invoice (excludes other invoices on the same PO line). */
  remainingGrnQty: number | null;
  /** Same as remainingGrnQty — explicit "before this invoice" naming for the UI. */
  remainingGrnBeforeThisInvoice: number | null;
  /**
   * Final open qty for the PO line once every invoice (including this one) is counted.
   * Taken straight from PO reconciliation so it can never contradict the PO summary.
   */
  poLineBalanceQty: number | null;
  /** Qty of this invoice line consumed by FIFO GRN allocation. */
  allocatedQty: number | null;
  /** Qty of this invoice line that FIFO could not back with a receipt. */
  unallocatedQty: number | null;
  matchStatus: "matched" | "partial" | "unmatched" | "pending";
  /** Confidence in the selected PO-line pairing, independent of OCR confidence. */
  matchConfidence: MatchConfidence;
  matchConfidenceScore: number;
  matchConfidenceReason: string;
  reconcileStatus: PoLineReconcileStatus | null;
  mismatches: Array<{
    field: string;
    label: string;
    invoiceValue: string;
    poValue: string;
    severity: "high" | "medium" | "low";
    deviationPercent?: number;
    message?: string;
  }>;
  /** Qty invoiced on this PO line by every OTHER invoice (not this one). */
  priorInvoicedQty?: number;
  totalInvoicedQty?: number;
}

/** Document/OCR verification outcome — independent of PO quantity reconciliation. */
export type DocumentVerificationStatus =
  | "passed"
  | "mismatched"
  | "extraction_failed"
  | "no_document";

export interface InvoiceMatchResult {
  invoiceId: string;
  poNumber: string;
  matchType: "3-way" | "2-way";
  documentExtraction: DocumentExtraction | null;
  /** Page/invoice composition of the uploaded document(s). */
  documentAnalysis: DocumentAnalysisSummary | null;
  documentLineMatches: DocLineMatch[];
  headerMismatches: DocVsSystemMismatch[];
  lineMatches: LineMatchResult[];
  /** Document/OCR verification result — kept separate from PO reconciliation. */
  document_verification_status: DocumentVerificationStatus;
  /** PO-centric reconciliation (FRD) */
  po_reconciliation_status: PoLineReconcileStatus | "no_po";
  total_po_qty: number;
  total_grn_qty: number;
  total_invoice_qty: number;
  balance_qty: number;
  allocation_details: (PoReconciliationResult["allocation_details"] & {
    current_invoice_lines?: PoReconciliationResult["allocation_details"]["by_invoice_line"];
  }) | null;
  line_level_status: PoReconciliationResult["line_level_status"];
  /** Tolerances the comparisons above were judged against. */
  tolerances: ToleranceConfig;
  summary: {
    totalInvoiceLines: number;
    matched: number;
    partial: number;
    unmatched: number;
    pending: number;
    overallStatus: "fully_matched" | "partial_match" | "significant_mismatches" | "no_po";
    narrative: string;
    totalInvoiceAmount: number;
    totalPoAmount: number;
    amountVariance: number;
    amountVariancePercent: number;
    docExtractionStatus: "extracted" | "no_document" | "extraction_failed";
    documentStatus: DocumentVerificationStatus;
    /** Lines OCR read from the verified invoice and compared — the sum of the three counts below. */
    docLinesTotal: number;
    docLinesMatched: number;
    docLinesPartial: number;
    docLinesUnmatched: number;
    /** Extracted lines that carry no PO line at all — extra billing, not a PO shortfall. */
    docLinesNotInPo: number;
    /** Lines on this invoice record that carry no PO line; excluded from PO reconciliation. */
    invoiceLinesNotInPo: number;
    /** Pages in the uploaded document(s). */
    documentPageCount: number;
    /** Distinct invoices found in the uploaded document(s). */
    documentInvoiceCount: number;
    /** Line items read from the invoice that was verified. */
    documentInvoiceLineCount: number;
    documentOcrConfidence: ExtractionConfidence | null;
  };
  analyzedAt: string;
}

function emptyDocumentSummaryFields(): Pick<
  InvoiceMatchResult["summary"],
  "documentPageCount" | "documentInvoiceCount" | "documentInvoiceLineCount" | "documentOcrConfidence"
> {
  return {
    documentPageCount: 0,
    documentInvoiceCount: 0,
    documentInvoiceLineCount: 0,
    documentOcrConfidence: null,
  };
}

function emptyReconciliationFields(): Pick<
  InvoiceMatchResult,
  | "po_reconciliation_status"
  | "total_po_qty"
  | "total_grn_qty"
  | "total_invoice_qty"
  | "balance_qty"
  | "allocation_details"
  | "line_level_status"
> {
  return {
    po_reconciliation_status: "no_po",
    total_po_qty: 0,
    total_grn_qty: 0,
    total_invoice_qty: 0,
    balance_qty: 0,
    allocation_details: null,
    line_level_status: [],
  };
}

async function getInvoiceWithLines(invoiceId: string) {
  const invoiceResult = await getPool().query(
    `SELECT id, invoice_number, po_number, supplier_name, supplier_id, 
            invoice_amount, tax_amount, invoice_curr_code, invoice_status
     FROM dbo.supp_invoice_dtls WHERE id = $1`,
    [invoiceId]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) throw { status: 404, message: "Invoice not found" };

  const linesResult = await getPool().query(
    `SELECT id, line_number, item_name, description, order_qty, order_unit_cost, 
            order_cost, po_number, po_line_number, tax_amount, tax_rate
     FROM dbo.supp_invoice_line_dtls WHERE invoice_id = $1 ORDER BY line_number ASC`,
    [invoiceId]
  );

  return { invoice, lines: linesResult.rows };
}

async function getPoLines(poNumber: string) {
  const result = await getPool().query(
    `SELECT id, po_line_number, item_name, line_description, line_qty, line_unit_cost, 
            line_cost, line_status, item_type, po_number
     FROM dbo.supp_po_line_dtls WHERE po_number = $1 ORDER BY po_line_number ASC`,
    [poNumber]
  );
  return result.rows;
}

async function getGrnSummaryByPoLine(poNumber: string): Promise<Map<string, { receivedQty: number; rejectedQty: number; acceptedQty: number }>> {
  const result = await getPool().query(
    `SELECT po_line_number, 
            COALESCE(SUM(received_qty), 0) as total_received_qty,
            COALESCE(SUM(rejected_qty), 0) as total_rejected_qty
     FROM dbo.supp_po_grn_line_dtls 
     WHERE po_number = $1 AND line_status = 'Received'
     GROUP BY po_line_number`,
    [poNumber]
  );

  const map = new Map<string, { receivedQty: number; rejectedQty: number; acceptedQty: number }>();
  for (const row of result.rows) {
    const received = Number(row.total_received_qty) || 0;
    const rejected = Number(row.total_rejected_qty) || 0;
    map.set(String(row.po_line_number), {
      receivedQty: received,
      rejectedQty: rejected,
      acceptedQty: received - rejected,
    });
  }
  return map;
}

function matchLineByNumber(invoiceLine: any, poLines: any[]): any | null {
  if (!invoiceLine.po_line_number) return null;
  return poLines.find(
    (pl) => String(pl.po_line_number) === String(invoiceLine.po_line_number)
  );
}

const NAME_EXPANSIONS: Record<string, string[]> = {
  ss: ["stainless", "steel"],
  ssteel: ["stainless", "steel"],
  stnls: ["stainless"],
  typec: ["c"],
  usbtypec: ["usb", "c"],
  fibre: ["fiber"],
  comp: ["computer"],
  qty: ["quantity"],
};

const NAME_FILLER_WORDS = new Set(["with", "and", "the", "for", "of"]);

/**
 * Comparable words of an item name. Besides punctuation and order, normalize common
 * procurement abbreviations so OCR/vendor wording such as "SS" and "stainless steel" can
 * be compared deterministically without asking an LLM to decide each line.
 */
function nameTokens(value: unknown): string[] {
  const raw = String(value ?? "")
    .toLowerCase()
    .replace(/\btype[\s-]*c\b/g, " typec ")
    .replace(/\busb[\s-]*type[\s-]*c\b/g, " usbtypec ")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const expanded = raw.flatMap((token) => NAME_EXPANSIONS[token] ?? [token]);
  return Array.from(new Set(expanded.filter((token) => !NAME_FILLER_WORDS.has(token)))).sort();
}

function diceCoefficient(a: string, b: string): number {
  const compactA = a.replace(/\s+/g, "");
  const compactB = b.replace(/\s+/g, "");
  if (!compactA || !compactB) return 0;
  if (compactA === compactB) return 1;
  if (compactA.length < 2 || compactB.length < 2) return 0;

  const pairs = new Map<string, number>();
  for (let i = 0; i < compactA.length - 1; i += 1) {
    const pair = compactA.slice(i, i + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < compactB.length - 1; i += 1) {
    const pair = compactB.slice(i, i + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      overlap += 1;
      pairs.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (compactA.length + compactB.length - 2);
}

function computeSimilarity(a: string, b: string): number {
  const wordsA = nameTokens(a);
  const wordsB = nameTokens(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = wordsA.filter((word) => setB.has(word)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = intersection / union;
  const containment = intersection / Math.min(setA.size, setB.size);
  const characterSimilarity = diceCoefficient(wordsA.join(" "), wordsB.join(" "));

  // Containment deliberately carries most weight: "safety gloves" is a useful abbreviated
  // form of "electrical safety gloves". Character similarity handles OCR spelling noise.
  return Math.min(1, jaccard * 0.35 + containment * 0.45 + characterSimilarity * 0.2);
}

/** Item name of a PO or invoice line, falling back to its description. */
function lineName(line: any): string {
  return String(line?.item_name ?? line?.line_description ?? line?.description ?? "").trim();
}

interface PairingEvidence {
  score: number;
  confidence: MatchConfidence;
  reason: string;
  nameSimilarity: number;
  supportingFields: string[];
  conflictingFields: string[];
  autoMatch: boolean;
}

function comparableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scoreLinePair(input: {
  sourceName: string;
  targetName: string;
  sourceQty?: unknown;
  targetQty?: unknown;
  sourceUnitPrice?: unknown;
  targetUnitPrice?: unknown;
  sourceTotal?: unknown;
  targetTotal?: unknown;
  tolerances: ToleranceConfig;
}): PairingEvidence {
  const nameSimilarity = computeSimilarity(input.sourceName, input.targetName);
  const fieldChecks: Array<{
    name: string;
    source: number | null;
    target: number | null;
    tolerance: number;
  }> = [
    {
      name: "quantity",
      source: comparableNumber(input.sourceQty),
      target: comparableNumber(input.targetQty),
      tolerance: input.tolerances.qtyTolerance,
    },
    {
      name: "unit price",
      source: comparableNumber(input.sourceUnitPrice),
      target: comparableNumber(input.targetUnitPrice),
      tolerance: input.tolerances.priceTolerance,
    },
    {
      name: "line total",
      source: comparableNumber(input.sourceTotal),
      target: comparableNumber(input.targetTotal),
      tolerance: input.tolerances.priceTolerance,
    },
  ];

  const available = fieldChecks.filter((field) => field.source !== null && field.target !== null);
  const supportingFields = available
    .filter((field) => withinRelativeTolerance(field.source!, field.target!, field.tolerance))
    .map((field) => field.name);
  const conflictingFields = available
    .filter((field) => !withinRelativeTolerance(field.source!, field.target!, field.tolerance))
    .map((field) => field.name);
  const fieldAgreement = available.length > 0 ? supportingFields.length / available.length : 0.5;
  const rawScore = nameSimilarity * 0.72 + fieldAgreement * 0.28;
  const score = Math.round(rawScore * 100);

  // A candidate needs meaningful name evidence. Supporting numbers can confirm an abbreviated
  // name, but can never turn "helmet" into "gloves" merely because it is the only line left.
  const quantityAndPriceConflict =
    conflictingFields.includes("quantity") && conflictingFields.includes("unit price");
  const autoMatch =
    !quantityAndPriceConflict &&
    (
      (nameSimilarity >= 0.72 && (supportingFields.length >= 1 || nameSimilarity >= 0.9)) ||
      (nameSimilarity >= 0.5 && supportingFields.length >= 1 && conflictingFields.length === 0)
    ) &&
    score >= 68;

  let confidence: MatchConfidence = "low";
  if (
    autoMatch &&
    nameSimilarity >= 0.78 &&
    supportingFields.length >= 2 &&
    conflictingFields.length === 0 &&
    score >= 85
  ) {
    confidence = "high";
  } else if (autoMatch) {
    confidence = "medium";
  }

  const namePercent = Math.round(nameSimilarity * 100);
  const supportText = supportingFields.length > 0
    ? `${supportingFields.join(" and ")} agree`
    : "no quantity/price fields confirm the pairing";
  const conflictText = conflictingFields.length > 0
    ? `; conflicting ${conflictingFields.join(" and ")}`
    : "";
  const reason = autoMatch
    ? `${namePercent}% name similarity; ${supportText}${conflictText}.`
    : `${namePercent}% name similarity; ${supportText}${conflictText}. Candidate did not meet the safe auto-match threshold.`;

  return { score, confidence, reason, nameSimilarity, supportingFields, conflictingFields, autoMatch };
}

const NO_MATCH_EVIDENCE: PairingEvidence = {
  score: 0,
  confidence: "low",
  reason: "No candidate had enough name similarity with supporting quantity/price evidence to auto-match.",
  nameSimilarity: 0,
  supportingFields: [],
  conflictingFields: [],
  autoMatch: false,
};

/**
 * Match the invoice lines that name no PO line to the PO lines still free, scoring every
 * pairing first and taking the strongest ones. Matching line by line in order lets whichever
 * invoice line happens to come first claim a PO line it only loosely resembles, which leaves
 * the line the PO line actually belongs to reported as unmatched.
 */
function assignPoLinesByName(
  invoiceLines: any[],
  poLines: any[],
  reservedPoLines: Set<string>,
  tolerances: ToleranceConfig
): Map<any, { poLine: any; evidence: PairingEvidence }> {
  const candidates: Array<{ invoiceLine: any; poLine: any; evidence: PairingEvidence }> = [];

  for (const invoiceLine of invoiceLines) {
    const invName = lineName(invoiceLine);
    if (!invName) continue;
    for (const poLine of poLines) {
      if (reservedPoLines.has(String(poLine.po_line_number))) continue;
      const poName = lineName(poLine);
      if (!poName) continue;
      const evidence = scoreLinePair({
        sourceName: invName,
        targetName: poName,
        sourceQty: invoiceLine.order_qty,
        targetQty: poLine.line_qty,
        sourceUnitPrice: invoiceLine.order_unit_cost,
        targetUnitPrice: poLine.line_unit_cost,
        sourceTotal: invoiceLine.order_cost,
        targetTotal: poLine.line_cost,
        tolerances,
      });
      if (evidence.autoMatch) candidates.push({ invoiceLine, poLine, evidence });
    }
  }

  candidates.sort((a, b) => b.evidence.score - a.evidence.score);

  const assignment = new Map<any, { poLine: any; evidence: PairingEvidence }>();
  const taken = new Set<string>();
  for (const candidate of candidates) {
    if (assignment.has(candidate.invoiceLine)) continue;
    const poLineKey = String(candidate.poLine.po_line_number);
    if (taken.has(poLineKey)) continue;
    assignment.set(candidate.invoiceLine, { poLine: candidate.poLine, evidence: candidate.evidence });
    taken.add(poLineKey);
  }

  return assignment;
}

/**
 * Compare current invoice line to PO / remaining GRN using FRD tolerances.
 * Under-invoicing vs remaining GRN is pending — not a mismatch.
 */
function compareLines(
  invoiceLine: any,
  poLine: any,
  priorInvoicedQty: number,
  remainingGrnQty: number | null,
  grnData: { receivedQty: number; rejectedQty: number; acceptedQty: number } | null,
  hasGrn: boolean,
  tolerances: ToleranceConfig
): LineMatchResult["mismatches"] {
  const mismatches: LineMatchResult["mismatches"] = [];
  const qtyTol = tolerances.qtyTolerance;
  const priceTol = tolerances.priceTolerance;

  const invQty = Number(invoiceLine.order_qty) || 0;
  const poQty = Number(poLine.line_qty) || 0;

  const invUnit = Number(invoiceLine.order_unit_cost) || 0;
  const poUnit = Number(poLine.line_unit_cost) || 0;
  if (poUnit > 0 && !withinRelativeTolerance(invUnit, poUnit, priceTol)) {
    const deviation = Math.abs((invUnit - poUnit) / poUnit) * 100;
    mismatches.push({
      field: "unit_cost",
      label: "Unit Price",
      invoiceValue: invUnit.toFixed(2),
      poValue: poUnit.toFixed(2),
      severity: deviation > 25 ? "high" : deviation > 10 ? "medium" : "low",
      deviationPercent: Math.round(deviation * 100) / 100,
      message: `Outside ±${(priceTol * 100).toFixed(0)}% price tolerance`,
    });
  }

  if (hasGrn && grnData) {
    const acceptedQty = grnData.acceptedQty;
    const remaining = remainingGrnQty ?? Math.max(0, acceptedQty - priorInvoicedQty);

    if (invQty > 0 && acceptedQty === 0) {
      mismatches.push({
        field: "quantity",
        label: "Qty vs GRN (No Receipt)",
        invoiceValue: String(invQty),
        poValue: "0 (No GRN received)",
        severity: "high",
        message: "Invoicing without goods receipt",
      });
    } else if (invQty > 0 && exceedsByTolerance(invQty, remaining, qtyTol)) {
      const overBy = invQty - remaining;
      mismatches.push({
        field: "quantity",
        label: "Qty vs GRN (Over-Invoiced)",
        invoiceValue: String(invQty),
        poValue: `${remaining} remaining (GRN accepted: ${acceptedQty}, prior invoiced: ${priorInvoicedQty})`,
        severity: "high",
        message: `Invoicing ${overBy} more than remaining GRN accepted qty`,
      });
    }
    // invQty <= remaining (within tolerance): legitimate partial — no quantity mismatch

    if (grnData.rejectedQty > 0) {
      mismatches.push({
        field: "grn_rejected",
        label: "GRN Rejected Qty",
        invoiceValue: "—",
        poValue: `${grnData.rejectedQty} rejected out of ${grnData.receivedQty} received`,
        severity: "medium",
        message: `${grnData.rejectedQty} units were rejected at receiving`,
      });
    }
  } else {
    const remainingPoQty = Math.max(0, poQty - priorInvoicedQty);
    if (poQty > 0 && invQty > 0 && exceedsByTolerance(invQty, remainingPoQty, qtyTol)) {
      const overBy = invQty - remainingPoQty;
      mismatches.push({
        field: "quantity",
        label: "Qty vs PO (Over-Invoiced)",
        invoiceValue: String(invQty),
        poValue: `${remainingPoQty} remaining (PO: ${poQty}, prior invoiced: ${priorInvoicedQty})`,
        severity: "high",
        message: `Over-invoiced by ${overBy} units`,
      });
    }
    // Partial invoice against PO remaining is not a mismatch
  }

  const invCost = Number(invoiceLine.order_cost) || 0;
  const expectedCost = invQty * poUnit;
  if (expectedCost > 0 && !withinRelativeTolerance(invCost, expectedCost, priceTol)) {
    const deviation = Math.abs((invCost - expectedCost) / expectedCost) * 100;
    mismatches.push({
      field: "total_cost",
      label: "Total Amount",
      invoiceValue: invCost.toFixed(2),
      poValue: expectedCost.toFixed(2),
      severity: deviation > 25 ? "high" : deviation > 10 ? "medium" : "low",
      deviationPercent: Math.round(deviation * 100) / 100,
    });
  }

  const invName = (invoiceLine.item_name || "").toLowerCase().trim();
  const poName = (poLine.item_name || "").toLowerCase().trim();
  if (invName && poName && invName !== poName) {
    const similarity = computeSimilarity(invName, poName);
    // Name variants above the safe fuzzy floor have already been corroborated by quantity/
    // price evidence during pairing; do not turn that accepted semantic match into a mismatch.
    if (similarity < 0.5) {
      mismatches.push({
        field: "description",
        label: "Item Description",
        invoiceValue: invoiceLine.item_name || "",
        poValue: poLine.item_name || "",
        severity: similarity < 0.3 ? "high" : "medium",
      });
    }
  }

  return mismatches;
}

async function getInvoiceDocuments(invoiceId: string) {
  const result = await getPool().query(
    `SELECT id, doc_no, doc_name, doc_type, doc_path, filename, filetype, doc_uri
     FROM dbo.supp_document_dtls
     WHERE doc_no = $1 AND record_type = 'SUPP_INVOICE' AND (status IS NULL OR status = 'Active')
     ORDER BY creation_date ASC
     LIMIT 3`,
    [String(invoiceId)]
  );
  return result.rows;
}

function toDocumentExtraction(
  invoice: ExtractedInvoice,
  source: { documentId: number | null; fileName: string }
): DocumentExtraction {
  return {
    documentId: source.documentId,
    fileName: source.fileName,
    extractedInvoiceNumber: invoice.invoiceNumber,
    extractedDate: invoice.invoiceDate,
    extractedVendorName: invoice.vendorName,
    extractedPoNumber: invoice.poNumber,
    extractedSubtotal: invoice.subtotal,
    extractedTax: invoice.tax,
    extractedTotal: invoice.total,
    extractedOtherCharges: invoice.otherCharges,
    extractedCharges: invoice.charges,
    extractedCurrency: invoice.currency,
    extractedLines: invoice.lines.map((line) => ({
      lineNumber: line.lineNumber,
      itemName: line.itemName,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
      taxAmount: line.taxAmount,
      sourcePage: line.sourcePage,
      lowConfidence: line.lowConfidence,
      unavailableFields: line.unavailableFields,
      columnCheck: line.columnCheck,
    })),
    confidence: invoice.confidence,
    confidenceScore: invoice.confidenceScore,
    extractionNotes: invoice.notes,
    invoiceIndex: invoice.invoiceIndex,
    pageNumbers: invoice.pageNumbers,
    unavailableFields: invoice.unavailableFields,
    totalsAgree: invoice.totalsAgree,
    headerTotalsAgree: invoice.headerTotalsAgree,
    headerTotalsNote: invoice.headerTotalsNote,
    totalsVerified: invoice.totalsVerified,
    columnHeaders: invoice.columnHeaders,
  };
}

interface AnalyzedUpload {
  analysis: InvoiceDocumentAnalysis;
  documentId: number | null;
}

/**
 * Fold every successfully read upload into one view of what was submitted: how many pages,
 * how many separate invoices, which invoice was verified, and which pages were supporting
 * paperwork. Purely descriptive — it never influences PO reconciliation.
 */
function buildDocumentAnalysisSummary(
  uploads: AnalyzedUpload[],
  primary: { invoice: ExtractedInvoice; fileName: string } | null
): DocumentAnalysisSummary {
  const invoices: DocumentInvoiceSummary[] = [];
  const supportingDocuments: DocumentSupportingSummary[] = [];
  const notes: string[] = [];
  let pageCount = 0;
  let pagesAnalyzed = 0;
  let invoiceCounter = 0;

  for (const { analysis } of uploads) {
    pageCount += analysis.pageCount;
    pagesAnalyzed += analysis.pagesAnalyzed;
    if (analysis.notes) notes.push(`${analysis.fileName}: ${analysis.notes}`);

    for (const invoice of analysis.invoices) {
      invoiceCounter += 1;
      invoices.push({
        invoiceIndex: invoiceCounter,
        fileName: analysis.fileName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        vendorName: invoice.vendorName,
        poNumber: invoice.poNumber,
        currency: invoice.currency,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        total: invoice.total,
        otherCharges: invoice.otherCharges,
        totalsVerified: invoice.totalsVerified,
        lineCount: invoice.lines.length,
        pageNumbers: invoice.pageNumbers,
        confidence: invoice.confidence,
        confidenceScore: invoice.confidenceScore,
        unavailableFields: invoice.unavailableFields,
        isPrimary:
          primary !== null &&
          primary.fileName === analysis.fileName &&
          primary.invoice.invoiceIndex === invoice.invoiceIndex,
      });
    }

    for (const supporting of analysis.supportingDocuments) {
      supportingDocuments.push({
        fileName: analysis.fileName,
        documentType: supporting.documentType,
        documentNumber: supporting.documentNumber,
        pageNumbers: supporting.pageNumbers,
        confidence: supporting.confidence,
      });
    }
  }

  const ocrConfidenceScore = uploads.length
    ? Math.round(Math.min(...uploads.map((u) => u.analysis.confidenceScore)) * 100) / 100
    : 0;

  const advisories: DocumentAdvisory[] = [];
  if (invoices.length > 1) {
    advisories.push({
      code: "multiple_invoices",
      message: `The upload contains ${invoices.length} separate invoices. Only the invoice matching this record was verified against the system.`,
    });
  }
  if (supportingDocuments.length > 0) {
    const grouped = supportingDocuments
      .map((d) => `${d.documentType}${d.documentNumber ? ` ${d.documentNumber}` : ""}`)
      .join(", ");
    advisories.push({
      code: "supporting_documents",
      message: `Supporting document(s) detected and excluded from invoice line items: ${grouped}.`,
    });
  }
  if (pagesAnalyzed < pageCount) {
    advisories.push({
      code: "pages_truncated",
      message: `${pagesAnalyzed} of ${pageCount} pages were analysed; the remaining pages were not read.`,
    });
  }
  const unreadablePages = uploads.reduce(
    (acc, u) => acc + u.analysis.pages.filter((p) => !p.readable).length,
    0
  );
  if (unreadablePages > 0) {
    advisories.push({
      code: "unreadable_pages",
      message: `${unreadablePages} page(s) could not be read by OCR.`,
    });
  }
  const unreadableValues = primary
    ? primary.invoice.unavailableFields.length +
      primary.invoice.lines.filter((line) => line.lowConfidence).length
    : 0;
  if (unreadableValues > 0) {
    advisories.push({
      code: "low_confidence",
      message: "Some values could not be read with confidence and are reported as unavailable rather than assumed.",
    });
  }

  const lowResolution = uploads.some((u) => u.analysis.lowResolution);
  if (lowResolution) {
    advisories.push({
      code: "low_resolution",
      message:
        "Only a small preview image is stored for this document and the original could not be retrieved. It is too low-resolution to read the line-item table, so no values were extracted rather than guessed.",
    });
  }

  const previewOnly = uploads.filter((u) => u.analysis.source === "preview_image");
  if (previewOnly.length > 0 && !lowResolution) {
    advisories.push({
      code: "preview_only",
      message: `Read from the stored preview image rather than the original file for: ${previewOnly
        .map((u) => u.analysis.fileName)
        .join(", ")}. Values may be less accurate than a read of the original document.`,
    });
  }

  const totalsMismatch = primary?.invoice.totalsAgree === false;
  if (totalsMismatch) {
    advisories.push({
      code: "totals_mismatch",
      message:
        "The extracted line items do not add up to the subtotal printed on the document, so the line-item table may have been read incorrectly. Verify against the document before acting on these lines.",
    });
  }

  // The printed total is always reported as read. These advisories say how far it could be
  // corroborated, so an unconfirmed figure is never presented as the supplier's actual total.
  const headerTotalsMismatch = primary?.invoice.headerTotalsAgree === false;
  if (headerTotalsMismatch) {
    advisories.push({
      code: "header_totals_mismatch",
      message: `The totals printed on the document do not reconcile — ${primary?.invoice.headerTotalsNote}. The subtotal, tax and total are reported exactly as read but none of them is confirmed; check the document by hand.`,
    });
  } else if (primary && primary.invoice.total !== null && !primary.invoice.totalsVerified) {
    advisories.push({
      code: "unverified_total",
      message:
        "The document total was read but could not be checked against a printed subtotal and tax, so it is reported as unconfirmed rather than as the supplier's established total.",
    });
  }

  const columnIssues = primary?.invoice.lines.filter((line) => line.columnCheck).length ?? 0;
  if (columnIssues > 0) {
    advisories.push({
      code: "column_mapping",
      message: `${columnIssues} line(s) have a quantity, unit price and line total that do not multiply out, which usually means a column was read from the wrong place. The values are reported as read, not corrected.`,
    });
  }

  const sources = new Set(uploads.map((u) => u.analysis.source));

  return {
    fileNames: uploads.map((u) => u.analysis.fileName),
    documentCount: uploads.length,
    pageCount,
    pagesAnalyzed,
    invoiceCount: invoices.length,
    invoiceLineCount: primary?.invoice.lines.length ?? 0,
    invoices,
    supportingDocuments,
    ocrConfidence: confidenceLabel(ocrConfidenceScore),
    ocrConfidenceScore,
    source: sources.size === 1 ? (Array.from(sources)[0] as "original_file" | "preview_image") : "mixed",
    reliable: !lowResolution && !totalsMismatch && !headerTotalsMismatch,
    advisories,
    notes: notes.length > 0 ? notes.join(" ") : null,
  };
}

function compareDocHeaderWithSystem(
  extraction: DocumentExtraction,
  invoice: any,
  tolerances: ToleranceConfig
): DocVsSystemMismatch[] {
  const mismatches: DocVsSystemMismatch[] = [];

  if (extraction.extractedInvoiceNumber && invoice.invoice_number) {
    const docNum = extraction.extractedInvoiceNumber.trim().toUpperCase();
    const sysNum = invoice.invoice_number.trim().toUpperCase();
    if (docNum !== sysNum && !docNum.includes(sysNum) && !sysNum.includes(docNum)) {
      mismatches.push({
        field: "invoice_number",
        label: "Invoice Number",
        documentValue: extraction.extractedInvoiceNumber,
        systemValue: invoice.invoice_number,
        severity: "high",
        message: "Invoice number on document does not match system record",
      });
    }
  }

  if (extraction.extractedPoNumber && invoice.po_number) {
    const docPo = extraction.extractedPoNumber.trim().toUpperCase();
    const sysPo = invoice.po_number.trim().toUpperCase();
    if (docPo !== sysPo && !docPo.includes(sysPo) && !sysPo.includes(docPo)) {
      mismatches.push({
        field: "po_number",
        label: "PO Number",
        documentValue: extraction.extractedPoNumber,
        systemValue: invoice.po_number,
        severity: "high",
        message: "PO number on document does not match system record",
      });
    }
  }

  // The system holds the net amount and the tax separately, so the document's grand total is
  // compared against their sum and its pre-tax subtotal against the net amount. Holding a
  // tax-inclusive total against a tax-exclusive figure reports every taxed invoice as wrong.
  const sysNetAmount = Number(invoice.invoice_amount) || 0;
  const sysTaxAmount = Number(invoice.tax_amount) || 0;
  const sysPayableAmount = sysNetAmount + sysTaxAmount;

  if (extraction.extractedSubtotal != null && sysNetAmount > 0) {
    // Freight and the like are billed before tax, so the document's pre-tax figure is its
    // subtotal plus those charges — that is what the system's net amount should cover.
    const charges = extraction.extractedOtherCharges ?? 0;
    const docPreTax = extraction.extractedSubtotal + charges;
    if (!withinRelativeTolerance(docPreTax, sysNetAmount, tolerances.priceTolerance)) {
      const deviation = Math.abs((docPreTax - sysNetAmount) / sysNetAmount) * 100;
      mismatches.push({
        field: "subtotal_amount",
        label: "Pre-tax Total",
        documentValue: docPreTax.toFixed(2),
        systemValue: sysNetAmount.toFixed(2),
        severity: deviation > 10 ? "high" : deviation > 5 ? "medium" : "low",
        message: charges > 0
          ? `Subtotal plus charges on the document differs from the system net amount by ${deviation.toFixed(1)}%`
          : `Pre-tax total on the document differs from the system net amount by ${deviation.toFixed(1)}%`,
      });
    }
  }

  if (extraction.extractedTax != null && sysTaxAmount > 0) {
    const docTax = extraction.extractedTax;
    if (!withinRelativeTolerance(docTax, sysTaxAmount, tolerances.priceTolerance)) {
      mismatches.push({
        field: "tax_amount",
        label: "Tax Amount",
        documentValue: docTax.toFixed(2),
        systemValue: sysTaxAmount.toFixed(2),
        severity: "medium",
        message: "Tax printed on the document does not match the tax on the system record",
      });
    }
  }

  if (extraction.extractedTotal != null) {
    const docTotal = extraction.extractedTotal;
    if (sysPayableAmount > 0 && !withinRelativeTolerance(docTotal, sysPayableAmount, tolerances.priceTolerance)) {
      const deviation = Math.abs((docTotal - sysPayableAmount) / sysPayableAmount) * 100;
      const bySize: DocVsSystemMismatch["severity"] =
        deviation > 10 ? "high" : deviation > 5 ? "medium" : "low";
      // A total that does not reconcile against its own document may itself be the misread
      // figure, so the gap is raised for a manual check instead of as a proven discrepancy.
      mismatches.push({
        field: "total_amount",
        label: "Total Amount",
        documentValue: docTotal.toFixed(2),
        systemValue: sysPayableAmount.toFixed(2),
        severity: extraction.totalsVerified ? bySize : bySize === "high" ? "medium" : bySize,
        message: extraction.totalsVerified
          ? `Document total differs from the system amount plus tax by ${deviation.toFixed(1)}%`
          : `Document total differs from the system amount plus tax by ${deviation.toFixed(1)}%, but the total could not be reconciled against the document's own subtotal and tax — confirm it on the document`,
      });
    }
  }

  if (extraction.extractedVendorName && invoice.supplier_name) {
    const docVendor = extraction.extractedVendorName.toLowerCase().trim();
    const sysVendor = invoice.supplier_name.toLowerCase().trim();
    const similarity = computeSimilarity(docVendor, sysVendor);
    if (similarity < 0.5) {
      mismatches.push({
        field: "vendor_name",
        label: "Vendor Name",
        documentValue: extraction.extractedVendorName,
        systemValue: invoice.supplier_name,
        severity: similarity < 0.2 ? "high" : "medium",
        message: "Vendor name on document may not match system record",
      });
    }
  }

  return mismatches;
}

function matchDocLinesToSystemAndPo(
  docLines: ExtractedDocLine[],
  invoiceLines: any[],
  poLines: any[],
  grnSummary: Map<string, { receivedQty: number; rejectedQty: number; acceptedQty: number }>,
  remainingGrnByPoLine: Map<string, number>,
  tolerances: ToleranceConfig
): DocLineMatch[] {
  const docLineMatches: DocLineMatch[] = [];
  const qtyTol = tolerances.qtyTolerance;
  const priceTol = tolerances.priceTolerance;

  type DocCandidate = {
    docLine: ExtractedDocLine;
    target: any;
    targetKey: string;
    evidence: PairingEvidence;
  };

  function assignDocCandidates(
    targets: any[],
    targetKey: (target: any) => string,
    targetName: (target: any) => string,
    targetQty: (target: any) => unknown,
    targetUnitPrice: (target: any) => unknown,
    targetTotal: (target: any) => unknown,
    eligibleDocLines: ExtractedDocLine[]
  ): {
    assignments: Map<ExtractedDocLine, { target: any; evidence: PairingEvidence }>;
    bestEvidence: Map<ExtractedDocLine, PairingEvidence>;
  } {
    const candidates: DocCandidate[] = [];
    const bestEvidence = new Map<ExtractedDocLine, PairingEvidence>();

    for (const docLine of eligibleDocLines) {
      const docName = (docLine.itemName || docLine.description || "").trim();
      if (!docName) continue;
      for (const target of targets) {
        const candidateName = targetName(target);
        if (!candidateName) continue;
        const evidence = scoreLinePair({
          sourceName: docName,
          targetName: candidateName,
          sourceQty: docLine.quantity,
          targetQty: targetQty(target),
          sourceUnitPrice: docLine.unitPrice,
          targetUnitPrice: targetUnitPrice(target),
          sourceTotal: docLine.totalPrice,
          targetTotal: targetTotal(target),
          tolerances,
        });
        const currentBest = bestEvidence.get(docLine);
        if (!currentBest || evidence.score > currentBest.score) bestEvidence.set(docLine, evidence);
        if (evidence.autoMatch) {
          candidates.push({ docLine, target, targetKey: targetKey(target), evidence });
        }
      }
    }

    candidates.sort((a, b) => b.evidence.score - a.evidence.score);
    const assignments = new Map<ExtractedDocLine, { target: any; evidence: PairingEvidence }>();
    const usedTargets = new Set<string>();
    for (const candidate of candidates) {
      if (assignments.has(candidate.docLine) || usedTargets.has(candidate.targetKey)) continue;
      assignments.set(candidate.docLine, { target: candidate.target, evidence: candidate.evidence });
      usedTargets.add(candidate.targetKey);
    }
    return { assignments, bestEvidence };
  }

  // Score every possible pairing before claiming a target. This makes the strongest global
  // pair win and prevents an earlier, loosely similar row from consuming the correct line.
  const systemCandidates = assignDocCandidates(
    invoiceLines,
    (line) => String(line.id ?? line.line_number),
    lineName,
    (line) => line.order_qty,
    (line) => line.order_unit_cost,
    (line) => line.order_cost,
    docLines
  );
  const poLinesClaimedBySystem = new Set(
    Array.from(systemCandidates.assignments.values())
      .map(({ target }) => target.po_line_number)
      .filter((value) => value != null)
      .map(String)
  );
  const docLinesNeedingPo = docLines.filter((docLine) => {
    const systemLine = systemCandidates.assignments.get(docLine)?.target;
    return !systemLine?.po_line_number;
  });
  const directPoCandidates = assignDocCandidates(
    poLines.filter((line) => !poLinesClaimedBySystem.has(String(line.po_line_number))),
    (line) => String(line.po_line_number),
    lineName,
    (line) => line.line_qty,
    (line) => line.line_unit_cost,
    (line) => line.line_cost,
    docLinesNeedingPo
  );

  for (const docLine of docLines) {
    // Values OCR could not read stay null and simply skip their comparison — an unreadable
    // quantity must never be compared (or displayed) as if it were zero.
    const docQty = docLine.quantity;
    const docUnitPrice = docLine.unitPrice;
    const docName = (docLine.itemName || "").trim();
    const systemAssignment = systemCandidates.assignments.get(docLine);
    const bestSystemLine = systemAssignment?.target ?? null;

    let matchedPo: any = null;
    if (bestSystemLine?.po_line_number) {
      matchedPo = poLines.find((pl: any) => String(pl.po_line_number) === String(bestSystemLine.po_line_number));
    } else {
      matchedPo = directPoCandidates.assignments.get(docLine)?.target ?? null;
    }
    const selectedEvidence =
      systemAssignment?.evidence ??
      directPoCandidates.assignments.get(docLine)?.evidence ??
      systemCandidates.bestEvidence.get(docLine) ??
      directPoCandidates.bestEvidence.get(docLine) ??
      NO_MATCH_EVIDENCE;

    const mismatches: DocVsSystemMismatch[] = [];

    if (bestSystemLine) {
      const sysQty = Number(bestSystemLine.order_qty) || 0;
      if (docQty != null && docQty > 0 && sysQty > 0 && !withinRelativeTolerance(docQty, sysQty, qtyTol)) {
        mismatches.push({
          field: "quantity",
          label: "Qty (Doc vs System)",
          documentValue: String(docQty),
          systemValue: String(sysQty),
          severity: Math.abs(docQty - sysQty) / Math.max(docQty, sysQty) > 0.2 ? "high" : "medium",
          message: "Quantity on document differs from system entry",
        });
      }

      const sysUnit = Number(bestSystemLine.order_unit_cost) || 0;
      if (docUnitPrice != null && docUnitPrice > 0 && sysUnit > 0 && !withinRelativeTolerance(docUnitPrice, sysUnit, priceTol)) {
        const deviation = Math.abs((docUnitPrice - sysUnit) / sysUnit) * 100;
        mismatches.push({
          field: "unit_price",
          label: "Unit Price (Doc vs System)",
          documentValue: docUnitPrice.toFixed(2),
          systemValue: sysUnit.toFixed(2),
          severity: deviation > 10 ? "high" : deviation > 5 ? "medium" : "low",
          message: `Unit price on document differs by ${deviation.toFixed(1)}%`,
        });
      }

      const sysName = lineName(bestSystemLine);
      if (docName && sysName && nameTokens(docName).join(" ") !== nameTokens(sysName).join(" ")) {
        const sim = computeSimilarity(docName, sysName);
        if (sim < 0.5) {
          mismatches.push({
            field: "item_name",
            label: "Item Name (Doc vs System)",
            documentValue: docLine.itemName ?? "",
            systemValue: bestSystemLine.item_name || "",
            severity: sim < 0.3 ? "high" : "medium",
          });
        }
      }
    }

    if (matchedPo) {
      const poQty = Number(matchedPo.line_qty) || 0;
      if (docQty != null && docQty > 0 && poQty > 0 && exceedsByTolerance(docQty, poQty, qtyTol)) {
        mismatches.push({
          field: "qty_vs_po",
          label: "Qty (Doc vs PO)",
          documentValue: String(docQty),
          systemValue: String(poQty),
          severity: "high",
          message: "Document quantity exceeds PO quantity",
        });
      }

      const poUnit = Number(matchedPo.line_unit_cost) || 0;
      if (docUnitPrice != null && docUnitPrice > 0 && poUnit > 0 && !withinRelativeTolerance(docUnitPrice, poUnit, priceTol)) {
        const deviation = Math.abs((docUnitPrice - poUnit) / poUnit) * 100;
        mismatches.push({
          field: "unit_price_vs_po",
          label: "Unit Price (Doc vs PO)",
          documentValue: docUnitPrice.toFixed(2),
          systemValue: poUnit.toFixed(2),
          severity: deviation > 10 ? "high" : deviation > 5 ? "medium" : "low",
          message: `Document unit price differs from PO by ${deviation.toFixed(1)}%`,
        });
      }
    }

    const poLineKey = matchedPo ? String(matchedPo.po_line_number) : null;
    const grnData = poLineKey ? grnSummary.get(poLineKey) || null : null;
    const remainingGrn = poLineKey != null ? remainingGrnByPoLine.get(poLineKey) : undefined;

    if (
      remainingGrn != null &&
      docQty != null &&
      docQty > 0 &&
      exceedsByTolerance(docQty, remainingGrn, qtyTol)
    ) {
      mismatches.push({
        field: "qty_vs_grn",
        label: "Qty (Doc vs Remaining GRN)",
        documentValue: String(docQty),
        systemValue: `${remainingGrn} remaining (accepted: ${grnData?.acceptedQty ?? "—"})`,
        severity: "high",
        message: "Document quantity exceeds remaining GRN accepted quantity after prior invoices",
      });
    }

    const hasHigh = mismatches.some((m) => m.severity === "high");
    const matchStatus: DocLineMatch["matchStatus"] =
      (!bestSystemLine && !matchedPo) ? "unmatched" :
      mismatches.length === 0 ? "matched" :
      hasHigh ? "unmatched" : "partial";

    docLineMatches.push({
      docLineNumber: docLine.lineNumber,
      docItemName: docLine.itemName,
      docQty: docLine.quantity,
      docUnitPrice: docLine.unitPrice,
      docTotalPrice: docLine.totalPrice,
      docSourcePage: docLine.sourcePage,
      docLowConfidence: docLine.lowConfidence,
      docUnavailableFields: docLine.unavailableFields,
      docColumnCheck: docLine.columnCheck,
      systemLineNumber: bestSystemLine ? Number(bestSystemLine.line_number) : null,
      systemItemName: bestSystemLine?.item_name || null,
      systemQty: bestSystemLine ? Number(bestSystemLine.order_qty) || null : null,
      systemUnitCost: bestSystemLine ? Number(bestSystemLine.order_unit_cost) || null : null,
      systemCost: bestSystemLine ? Number(bestSystemLine.order_cost) || null : null,
      poLineNumber: matchedPo?.po_line_number || null,
      poItemName: matchedPo?.item_name || matchedPo?.line_description || null,
      poQty: matchedPo ? Number(matchedPo.line_qty) || null : null,
      poUnitCost: matchedPo ? Number(matchedPo.line_unit_cost) || null : null,
      poCost: matchedPo ? Number(matchedPo.line_cost) || null : null,
      grnAcceptedQty: grnData?.acceptedQty ?? null,
      matchStatus,
      matchConfidence: selectedEvidence.confidence,
      matchConfidenceScore: selectedEvidence.score,
      matchConfidenceReason: selectedEvidence.reason,
      mismatches,
    });
  }

  return docLineMatches;
}

const RECONCILE_LABELS: Record<string, string> = {
  fully_matched: "fully matched",
  partially_matched: "partially matched",
  pending: "pending (further invoicing expected)",
  over_invoiced: "over-invoiced",
  over_received: "over-received",
  no_po: "not applicable (no PO)",
};

const DOC_STATUS_LABELS: Record<DocumentVerificationStatus, string> = {
  passed: "document matches the system record",
  mismatched: "document discrepancies found",
  extraction_failed: "OCR extraction failed",
  no_document: "no document uploaded",
};

/** One sentence describing what the upload actually contained, for the summary narrative. */
export function describeDocumentComposition(analysis: DocumentAnalysisSummary | null): string | null {
  if (!analysis || analysis.documentCount === 0) return null;

  const pageLabel = `${analysis.pageCount} page${analysis.pageCount === 1 ? "" : "s"}`;
  const invoiceLabel = `${analysis.invoiceCount} invoice${analysis.invoiceCount === 1 ? "" : "s"}`;
  const parts = [`The upload has ${pageLabel} and contains ${invoiceLabel}`];

  if (analysis.supportingDocuments.length > 0) {
    const types = Array.from(new Set(analysis.supportingDocuments.map((d) => d.documentType)));
    parts.push(` plus supporting ${types.join("/")} pages that were excluded from invoice line items`);
  }
  parts.push(`; OCR confidence ${analysis.ocrConfidence}.`);

  if (analysis.invoiceCount > 1) {
    parts.push(" Only the invoice matching this record was verified.");
  }
  if (!analysis.reliable) {
    parts.push(
      " The document could not be read reliably, so no values were taken from it as fact — check it by hand."
    );
  }

  return parts.join("");
}

/**
 * Deterministic summary used when the AI call is unavailable. Describes PO quantity
 * reconciliation and document verification as two separate outcomes so a fully
 * reconciled PO is never reported as unmatched because of a document discrepancy.
 */
export function buildDeterministicNarrative(input: {
  poReconciliationStatus: string;
  documentStatus: DocumentVerificationStatus;
  totalPoQty: number;
  totalGrnQty: number;
  totalInvoiceQty: number;
  balanceQty: number;
  unmatchedLines: number;
  partialLines: number;
  headerMismatchCount: number;
  documentComposition?: string | null;
  /** Invoice lines that carry no PO line — extra billing, never a PO shortfall. */
  linesNotOnPo?: number;
}): string {
  const reconLabel = RECONCILE_LABELS[input.poReconciliationStatus] || input.poReconciliationStatus;
  const parts: string[] = [
    `PO reconciliation is ${reconLabel} (ordered ${input.totalPoQty}, received ${input.totalGrnQty}, invoiced ${input.totalInvoiceQty}, balance ${input.balanceQty}).`,
  ];

  if (input.documentComposition) {
    parts.push(input.documentComposition);
  }

  if (input.documentStatus === "passed") {
    parts.push("Document verification passed with no discrepancies against the system record.");
  } else if (input.documentStatus === "mismatched") {
    const detail = input.headerMismatchCount > 0
      ? `${input.headerMismatchCount} header discrepancy(ies) found`
      : "line-level discrepancies found";
    parts.push(`Document verification reported issues (${detail}); this is a document-level finding and does not change the PO quantity reconciliation above.`);
  } else if (input.documentStatus === "extraction_failed") {
    parts.push("OCR could not read the uploaded document, so verification relied on system data only.");
  } else {
    parts.push("No invoice document was available for OCR verification; only system data was compared.");
  }

  const linesNotOnPo = input.linesNotOnPo ?? 0;
  if (linesNotOnPo > 0) {
    parts.push(
      `${linesNotOnPo} billed line(s) are not on the PO. They are reported as extra lines and sit outside the PO quantity reconciliation above, which is unchanged by them.`
    );
  }

  // Extra lines are already accounted for above, so only lines that do sit on a PO line are
  // described here — otherwise a PO the invoice reconciles against is reported twice as short.
  const unreconciledOnPo = Math.max(0, input.unmatchedLines - linesNotOnPo);

  if (input.poReconciliationStatus === "over_invoiced") {
    parts.push("Invoiced quantity exceeds what was received — review before payment.");
  } else if (input.poReconciliationStatus === "over_received") {
    parts.push("Received quantity exceeds the ordered quantity — confirm the receipt.");
  } else if (input.poReconciliationStatus === "pending") {
    parts.push("Remaining balance is expected on later invoices; this is not a mismatch.");
  } else if (unreconciledOnPo > 0) {
    parts.push(`${unreconciledOnPo} invoice line(s) sit on a PO line but have discrepancies to review.`);
  } else if (input.partialLines > 0) {
    parts.push(`${input.partialLines} line(s) have price or description variances to review.`);
  }

  return parts.join(" ");
}

async function generateNarrative(matchResult: Omit<InvoiceMatchResult, "summary"> & { summary: Partial<InvoiceMatchResult["summary"]> }): Promise<string> {
  const documentStatus: DocumentVerificationStatus =
    matchResult.document_verification_status ?? matchResult.summary.documentStatus ?? "no_document";
  const reconStatus = String(matchResult.po_reconciliation_status ?? "no_po");
  const narrativeFacts = {
    poReconciliationStatus: reconStatus,
    documentStatus,
    totalPoQty: matchResult.total_po_qty ?? 0,
    totalGrnQty: matchResult.total_grn_qty ?? 0,
    totalInvoiceQty: matchResult.total_invoice_qty ?? 0,
    balanceQty: matchResult.balance_qty ?? 0,
    unmatchedLines: matchResult.summary.unmatched ?? 0,
    partialLines: matchResult.summary.partial ?? 0,
    headerMismatchCount: matchResult.headerMismatches.length,
    documentComposition: describeDocumentComposition(matchResult.documentAnalysis ?? null),
    linesNotOnPo: matchResult.summary.invoiceLinesNotInPo ?? 0,
  };

  try {
    const matchTypeDesc = matchResult.matchType === "3-way" ? "3-way match (Invoice vs PO vs GRN)" : "2-way match (Invoice vs PO, no GRN available)";

    const analysis = matchResult.documentAnalysis ?? null;
    const compositionSection = analysis
      ? `\nUPLOAD COMPOSITION (what OCR actually read):
Pages in upload: ${analysis.pageCount} (analysed: ${analysis.pagesAnalyzed})
Invoices found in upload: ${analysis.invoiceCount}${analysis.invoices
          .map((i) => `\n- Invoice ${i.invoiceIndex}: ${i.invoiceNumber ?? "number unreadable"}, pages ${i.pageNumbers.join(", ")}, ${i.lineCount} line item(s), confidence ${i.confidence}${i.isPrimary ? " [verified against this record]" : ""}`)
          .join("")}
Supporting documents (excluded from invoice line items): ${analysis.supportingDocuments.length > 0
          ? analysis.supportingDocuments.map((d) => `${d.documentType}${d.documentNumber ? ` ${d.documentNumber}` : ""} on page(s) ${d.pageNumbers.join(", ")}`).join("; ")
          : "none"}
Read from: ${analysis.source === "original_file" ? "the original uploaded file" : analysis.source === "preview_image" ? "a stored preview image only" : "a mix of original files and stored previews"}
OCR confidence: ${analysis.ocrConfidence}
Extraction reliable: ${analysis.reliable ? "yes" : "NO — the extracted values could not be verified against the document's own totals"}
Advisories: ${analysis.advisories.length > 0 ? analysis.advisories.map((a) => a.message).join(" ") : "none"}`
      : "";

    const docSection = matchResult.documentExtraction
      ? `\nDocument OCR Extraction: YES (from "${matchResult.documentExtraction.fileName}", pages ${matchResult.documentExtraction.pageNumbers.join(", ")}, confidence: ${matchResult.documentExtraction.confidence})
Totals printed on the document: subtotal ${matchResult.documentExtraction.extractedSubtotal ?? "unreadable"}, tax ${matchResult.documentExtraction.extractedTax ?? "unreadable"}, other charges ${matchResult.documentExtraction.extractedCharges.length > 0 ? matchResult.documentExtraction.extractedCharges.map((c) => `${c.label ?? "charge"} ${c.amount}`).join(" + ") : "none printed"}, total ${matchResult.documentExtraction.extractedTotal ?? "unreadable"}
Printed total reconciles against that block: ${matchResult.documentExtraction.totalsVerified ? "yes" : `NO — ${matchResult.documentExtraction.headerTotalsNote ?? "it could not be checked, so the total is unconfirmed"}`}
Header fields OCR could not read (reported as unavailable, never guessed): ${matchResult.documentExtraction.unavailableFields.length > 0 ? matchResult.documentExtraction.unavailableFields.join(", ") : "none"}
Document header mismatches: ${matchResult.headerMismatches.length > 0 ? matchResult.headerMismatches.map(m => `${m.label}: Doc="${m.documentValue}" vs System="${m.systemValue}"`).join(", ") : "None"}
Document line matches: ${matchResult.summary.docLinesTotal ?? matchResult.documentLineMatches.length} line(s) extracted — ${matchResult.summary.docLinesMatched || 0} matched, ${matchResult.summary.docLinesPartial || 0} partial, ${matchResult.summary.docLinesUnmatched || 0} unmatched, of which ${matchResult.summary.docLinesNotInPo || 0} appear on no PO line at all (extra billed lines)
Document vs System line details:
${matchResult.documentLineMatches.map((dl) => {
  const status = dl.matchStatus;
  const mismatches = dl.mismatches.map((m) => `${m.label}: Doc="${m.documentValue}" vs Sys/PO="${m.systemValue}"`).join(", ");
  const qty = dl.docQty ?? "unreadable";
  const unit = dl.docUnitPrice ?? "unreadable";
  return `- Doc Line ${dl.docLineNumber} (page ${dl.docSourcePage ?? "?"}): ${dl.docItemName ?? "item name unreadable"} (qty:${qty}, unit:${unit}) -> ${status}; match confidence ${dl.matchConfidence} ${dl.matchConfidenceScore}/100 (${dl.matchConfidenceReason})${mismatches ? ` [${mismatches}]` : ""}`;
}).join("\n")}`
      : "\nDocument OCR Extraction: NO (no invoice was found in the uploaded document)";

    const reconSection = `
PO-LEVEL QUANTITY RECONCILIATION (authoritative for quantities):
Status: ${reconStatus} (${RECONCILE_LABELS[reconStatus] || reconStatus})
Totals across the whole PO — ordered: ${narrativeFacts.totalPoQty}, received: ${narrativeFacts.totalGrnQty}, invoiced (all invoices): ${narrativeFacts.totalInvoiceQty}, balance: ${narrativeFacts.balanceQty}
Per PO line: ${(matchResult.line_level_status || [])
      .map((l) => `line ${l.po_line_number}: ordered ${l.total_po_qty}, received ${l.total_grn_qty}, invoiced ${l.total_invoice_qty}, balance ${l.balance_qty} -> ${l.status}`)
      .join("; ") || "none"}

DOCUMENT VERIFICATION (independent of the reconciliation above):
Status: ${documentStatus} (${DOC_STATUS_LABELS[documentStatus]})`;

    const prompt = `Analyze this invoice matching result and provide a brief 3-4 sentence narrative summary for a procurement manager/approver.

Match Type: ${matchTypeDesc}
Invoice PO: ${matchResult.poNumber}
${reconSection}
${compositionSection}
${docSection}

System Data Match (Invoice entries vs PO/GRN):
Total invoice lines: ${matchResult.summary.totalInvoiceLines}
Matched: ${matchResult.summary.matched}, Partial: ${matchResult.summary.partial}, Unmatched: ${matchResult.summary.unmatched}
Invoice lines that sit on no PO line (extra billed lines, excluded from the reconciliation above): ${matchResult.summary.invoiceLinesNotInPo ?? 0}
Tolerances applied: quantity ±${((matchResult.tolerances?.qtyTolerance ?? 0) * 100).toFixed(2)}%, price ±${((matchResult.tolerances?.priceTolerance ?? 0) * 100).toFixed(2)}%. Differences inside these bands are matches, not discrepancies.
Invoice total: ${matchResult.summary.totalInvoiceAmount}, PO total: ${matchResult.summary.totalPoAmount}
Amount variance: ${matchResult.summary.amountVariance} (${matchResult.summary.amountVariancePercent}%)

Line details:
${matchResult.lineMatches.map((lm) => {
  const status = lm.matchStatus;
  const mismatches = lm.mismatches.map((m) => `${m.label}: Invoice=${m.invoiceValue} vs PO/GRN=${m.poValue}${m.message ? ` (${m.message})` : ""}`).join(", ");
  const grnInfo = lm.grnReceivedQty != null ? ` [GRN received: ${lm.grnReceivedQty}, accepted: ${lm.grnAcceptedQty}]` : "";
  return `- Line ${lm.invoiceLineNumber}: ${lm.invoiceItemName} -> ${status}; match confidence ${lm.matchConfidence} ${lm.matchConfidenceScore}/100 (${lm.matchConfidenceReason})${mismatches ? ` [${mismatches}]` : ""}${grnInfo}`;
}).join("\n")}

MANDATORY RULES:
1. Report TWO separate outcomes: (a) the PO-level quantity reconciliation status, and (b) the document/OCR verification status. Never merge them into one verdict.
2. The PO-LEVEL QUANTITY RECONCILIATION status above is authoritative for quantities. If it is "fully_matched", you MUST NOT describe the invoice, the PO, or its quantities as unmatched, mismatched, short, or over-billed. Document discrepancies do not change it.
3. Describe document discrepancies explicitly as document-level findings (what the OCR read vs the system record), not as quantity reconciliation failures.
4. If the status is "pending", state that the remaining balance is expected on later invoices and is NOT a mismatch.
5. Do not restate per-line "remaining" quantities; use the balance figures given above so the summary agrees with them.
6. Use the page count, invoice count and OCR confidence from UPLOAD COMPOSITION exactly as given. If the upload holds more than one invoice, say so and say that only the matching invoice was verified.
7. Values marked unreadable/unavailable were not legible. Report them as not readable — never substitute a number, and never treat them as zero or as a discrepancy.
8. If "Extraction reliable" is NO, do not present any document discrepancy as established fact. Say the document could not be read reliably, state why using the advisories, and recommend checking the document by hand. Never report OCR values from an unreliable extraction as the supplier's actual figures.
9. Lines the invoice bills that appear on no PO line are EXTRA lines. Call them "not in PO" / extra billed lines and say they are excluded from the PO quantity reconciliation. They never make the PO short, unmatched or partially matched — if the PO reconciliation says fully_matched, it stays fully matched however many extra lines there are.
10. Differences inside the tolerances given above are matches. Never report a value that is within tolerance as a discrepancy.
11. Match confidence is confidence in the selected line pairing. It is separate from OCR confidence, which measures how clearly the document was read. Never conflate the two.
12. A low-confidence candidate was deliberately not auto-matched. Preserve its unmatched status and state the supplied confidence reason instead of guessing a counterpart.
13. Use the document total exactly as given above — it is the figure printed on the invoice. Never add the line items up or add subtotal and tax together to state a total of your own. If "Printed total reconciles against that block" is NO, call the total unconfirmed and ask for it to be checked on the document, and do not describe it as the supplier's billed amount.
Provide a clear, actionable summary.`;

    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [
        { role: "system", content: "You are an AI procurement assistant summarizing invoice verification results. Always report PO-level quantity reconciliation and document/OCR verification as two distinct outcomes. Treat the supplied PO reconciliation status as authoritative for quantities and never contradict it. Be concise and highlight actionable issues." },
        { role: "user", content: prompt },
      ],
      max_tokens: 350,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() || buildDeterministicNarrative(narrativeFacts);
  } catch (error) {
    console.error("AI narrative generation failed:", error);
    return buildDeterministicNarrative(narrativeFacts);
  }
}

export async function analyzeInvoiceMatch(invoiceId: string): Promise<InvoiceMatchResult> {
  const { invoice, lines: invoiceLines } = await getInvoiceWithLines(invoiceId);
  const tolerances = await loadToleranceConfig();

  const emptyDocResult = {
    documentExtraction: null as DocumentExtraction | null,
    documentAnalysis: null as DocumentAnalysisSummary | null,
    documentLineMatches: [] as DocLineMatch[],
    headerMismatches: [] as DocVsSystemMismatch[],
  };

  if (!invoice.po_number) {
    return {
      invoiceId,
      poNumber: "",
      matchType: "2-way",
      ...emptyDocResult,
      lineMatches: [],
      ...emptyReconciliationFields(),
      tolerances,
      document_verification_status: "no_document",
      summary: {
        totalInvoiceLines: invoiceLines.length,
        matched: 0,
        partial: 0,
        unmatched: invoiceLines.length,
        pending: 0,
        overallStatus: "no_po",
        narrative: "This is a Non-PO invoice. No PO matching can be performed.",
        totalInvoiceAmount: Number(invoice.invoice_amount) || 0,
        totalPoAmount: 0,
        amountVariance: 0,
        amountVariancePercent: 0,
        docExtractionStatus: "no_document",
        documentStatus: "no_document",
        docLinesTotal: 0,
        docLinesMatched: 0,
        docLinesPartial: 0,
        docLinesUnmatched: 0,
        docLinesNotInPo: 0,
        invoiceLinesNotInPo: invoiceLines.length,
        ...emptyDocumentSummaryFields(),
      },
      analyzedAt: new Date().toISOString(),
    };
  }

  const poLines = await getPoLines(invoice.po_number);

  if (poLines.length === 0) {
    return {
      invoiceId,
      poNumber: invoice.po_number,
      matchType: "2-way",
      ...emptyDocResult,
      lineMatches: [],
      ...emptyReconciliationFields(),
      po_reconciliation_status: "pending",
      tolerances,
      document_verification_status: "no_document",
      summary: {
        totalInvoiceLines: invoiceLines.length,
        matched: 0,
        partial: 0,
        unmatched: invoiceLines.length,
        pending: 0,
        overallStatus: "significant_mismatches",
        narrative: `No PO lines found for PO ${invoice.po_number}. Unable to perform matching.`,
        totalInvoiceAmount: Number(invoice.invoice_amount) || 0,
        totalPoAmount: 0,
        amountVariance: 0,
        amountVariancePercent: 0,
        docExtractionStatus: "no_document",
        documentStatus: "no_document",
        docLinesTotal: 0,
        docLinesMatched: 0,
        docLinesPartial: 0,
        docLinesUnmatched: 0,
        docLinesNotInPo: 0,
        invoiceLinesNotInPo: invoiceLines.length,
        ...emptyDocumentSummaryFields(),
      },
      analyzedAt: new Date().toISOString(),
    };
  }

  const [grnSummary, invoiceDocs, reconInputs] = await Promise.all([
    getGrnSummaryByPoLine(invoice.po_number),
    getInvoiceDocuments(invoiceId),
    loadPoReconciliationInputs(invoice.po_number),
  ]);
  const hasGrn = grnSummary.size > 0;
  const matchType: "3-way" | "2-way" = hasGrn ? "3-way" : "2-way";

  const poReconciliation = buildPoReconciliation({
    poNumber: invoice.po_number,
    poLines: reconInputs.poLines,
    grnLines: reconInputs.grnLines,
    invoiceLines: reconInputs.invoiceLines,
    qtyTolerance: tolerances.qtyTolerance,
  });

  // Fire-and-forget persistence — never block matching on write failures
  void persistPoReconciliation(poReconciliation, invoiceId);

  const remainingGrnByPoLine = new Map<string, number>();
  for (const pl of reconInputs.poLines) {
    const key = String(pl.poLineNumber);
    const rem = remainingGrnAfterPriorInvoices(
      key,
      invoiceId,
      reconInputs.grnLines,
      reconInputs.invoiceLines,
      tolerances.qtyTolerance
    );
    remainingGrnByPoLine.set(key, rem.remaining);
  }

  let documentExtraction: DocumentExtraction | null = null;
  let documentAnalysis: DocumentAnalysisSummary | null = null;
  let headerMismatches: DocVsSystemMismatch[] = [];
  let documentLineMatches: DocLineMatch[] = [];
  let docExtractionStatus: "extracted" | "no_document" | "extraction_failed" = "no_document";

  if (invoiceDocs.length > 0) {
    // Every upload is read in full — a second invoice or a GRN in the same PDF must be
    // reported, not silently skipped by stopping at the first readable file.
    const uploads: AnalyzedUpload[] = [];
    for (const doc of invoiceDocs) {
      const analysis = await analyzeInvoiceDocument(doc);
      if (analysis) uploads.push({ analysis, documentId: doc.id ?? null });
    }

    if (uploads.length === 0) {
      docExtractionStatus = "extraction_failed";
    } else {
      const candidates = uploads.flatMap((upload) =>
        upload.analysis.invoices.map((inv) => ({ upload, invoice: inv }))
      );
      const selected = selectPrimaryInvoice(
        candidates.map((c) => c.invoice),
        {
          invoiceNumber: invoice.invoice_number,
          poNumber: invoice.po_number,
          total: Number(invoice.invoice_amount) || null,
        }
      );
      const primaryCandidate = selected
        ? candidates.find((c) => c.invoice === selected) ?? null
        : null;

      documentAnalysis = buildDocumentAnalysisSummary(
        uploads,
        primaryCandidate
          ? { invoice: primaryCandidate.invoice, fileName: primaryCandidate.upload.analysis.fileName }
          : null
      );

      if (primaryCandidate) {
        docExtractionStatus = "extracted";
        documentExtraction = toDocumentExtraction(primaryCandidate.invoice, {
          documentId: primaryCandidate.upload.documentId,
          fileName: primaryCandidate.upload.analysis.fileName,
        });
        headerMismatches = compareDocHeaderWithSystem(documentExtraction, invoice, tolerances);
        documentLineMatches = matchDocLinesToSystemAndPo(
          documentExtraction.extractedLines,
          invoiceLines,
          poLines,
          grnSummary,
          remainingGrnByPoLine,
          tolerances
        );
      } else {
        // Pages were readable but none of them was an invoice (e.g. only a GRN and a
        // challan were uploaded), so there is nothing to verify against the record.
        docExtractionStatus = "extraction_failed";
      }
    }
  }

  // A PO line an invoice line names outright belongs to that line. Reserving those PO lines
  // before any name matching runs stops a different invoice line from claiming one by
  // resemblance and leaving the line that actually references it unmatched.
  const poLineNumbers = new Set(poLines.map((pl: any) => String(pl.po_line_number)));
  const namesAPoLine = (invLine: any) =>
    invLine.po_line_number != null && poLineNumbers.has(String(invLine.po_line_number));

  const usedPoLines = new Set<string>(
    invoiceLines.filter(namesAPoLine).map((invLine: any) => String(invLine.po_line_number))
  );
  const nameAssignments = assignPoLinesByName(
    invoiceLines.filter((invLine: any) => !namesAPoLine(invLine)),
    poLines,
    usedPoLines,
    tolerances
  );

  const lineMatches: LineMatchResult[] = [];
  const statusByPoLine = new Map(
    poReconciliation.line_level_status.map((l) => [l.po_line_number, l.status])
  );
  // Final PO-line balance and FIFO allocation come from the reconciliation result itself,
  // so per-line quantities on screen can never disagree with the PO-level summary.
  const balanceByPoLine = new Map(
    poReconciliation.line_level_status.map((l) => [l.po_line_number, l.balance_qty])
  );
  const allocationByInvoiceLine = new Map(
    poReconciliation.allocation_details.by_invoice_line
      .filter((a) => String(a.invoice_id) === String(invoiceId))
      .map((a) => [a.invoice_line_id, a])
  );

  for (const invLine of invoiceLines) {
    let matchedPo = matchLineByNumber(invLine, poLines);
    let pairingEvidence: PairingEvidence | null = null;

    if (matchedPo) {
      pairingEvidence = scoreLinePair({
        sourceName: lineName(invLine),
        targetName: lineName(matchedPo),
        sourceQty: invLine.order_qty,
        targetQty: matchedPo.line_qty,
        sourceUnitPrice: invLine.order_unit_cost,
        targetUnitPrice: matchedPo.line_unit_cost,
        sourceTotal: invLine.order_cost,
        targetTotal: matchedPo.line_cost,
        tolerances,
      });
      usedPoLines.add(String(matchedPo.po_line_number));
    } else {
      const assignment = nameAssignments.get(invLine);
      matchedPo = assignment?.poLine ?? null;
      pairingEvidence = assignment?.evidence ?? null;
      if (matchedPo) {
        usedPoLines.add(String(matchedPo.po_line_number));
      }
    }

    if (matchedPo) {
      const poLineKey = String(matchedPo.po_line_number);
      const remInfo = remainingGrnAfterPriorInvoices(
        poLineKey,
        invoiceId,
        reconInputs.grnLines,
        reconInputs.invoiceLines,
        tolerances.qtyTolerance
      );
      const priorInvoicedQty = remInfo.priorInvoiced;
      const remainingGrnQty = hasGrn ? remInfo.remaining : null;
      const grnData = grnSummary.get(poLineKey) || null;

      const mismatches = compareLines(
        invLine,
        matchedPo,
        priorInvoicedQty,
        remainingGrnQty,
        grnData,
        hasGrn,
        tolerances
      );
      const hasHighSeverity = mismatches.some((m) => m.severity === "high");
      const reconcileStatus = statusByPoLine.get(poLineKey) || null;

      let matchStatus: LineMatchResult["matchStatus"];
      if (hasHighSeverity) {
        matchStatus = "unmatched";
      } else if (mismatches.length > 0) {
        matchStatus = "partial";
      } else if (reconcileStatus === "pending") {
        // Legitimate partial invoice against remaining GRN/PO
        matchStatus = "pending";
      } else {
        matchStatus = "matched";
      }

      const invQty = Number(invLine.order_qty) || 0;
      const invLineId = invLine.id != null ? Number(invLine.id) : null;
      const allocation = invLineId != null ? allocationByInvoiceLine.get(invLineId) : undefined;

      lineMatches.push({
        invoiceLineId: invLineId,
        invoiceLineNumber: invLine.line_number,
        invoiceItemName: invLine.item_name,
        invoiceDescription: invLine.description,
        invoiceQty: invQty,
        invoiceUnitCost: Number(invLine.order_unit_cost) || null,
        invoiceCost: Number(invLine.order_cost) || null,
        poLineId: matchedPo.id != null ? Number(matchedPo.id) : null,
        poLineNumber: matchedPo.po_line_number,
        poItemName: matchedPo.item_name,
        poDescription: matchedPo.line_description,
        poQty: Number(matchedPo.line_qty) || null,
        poUnitCost: Number(matchedPo.line_unit_cost) || null,
        poCost: Number(matchedPo.line_cost) || null,
        grnReceivedQty: grnData?.receivedQty ?? null,
        grnRejectedQty: grnData?.rejectedQty ?? null,
        grnAcceptedQty: grnData?.acceptedQty ?? null,
        remainingGrnQty,
        remainingGrnBeforeThisInvoice: remainingGrnQty,
        poLineBalanceQty: balanceByPoLine.get(poLineKey) ?? null,
        allocatedQty: allocation?.allocated_qty ?? null,
        unallocatedQty: allocation?.unallocated_qty ?? null,
        matchStatus,
        matchConfidence: pairingEvidence?.confidence ?? "low",
        matchConfidenceScore: pairingEvidence?.score ?? 0,
        matchConfidenceReason: pairingEvidence?.reason ?? NO_MATCH_EVIDENCE.reason,
        reconcileStatus,
        mismatches,
        priorInvoicedQty,
        totalInvoicedQty: priorInvoicedQty + invQty,
      });
    } else {
      const rejectedCandidates = poLines
        .filter((poLine: any) => !usedPoLines.has(String(poLine.po_line_number)))
        .map((poLine: any) => scoreLinePair({
          sourceName: lineName(invLine),
          targetName: lineName(poLine),
          sourceQty: invLine.order_qty,
          targetQty: poLine.line_qty,
          sourceUnitPrice: invLine.order_unit_cost,
          targetUnitPrice: poLine.line_unit_cost,
          sourceTotal: invLine.order_cost,
          targetTotal: poLine.line_cost,
          tolerances,
        }))
        .sort((a: PairingEvidence, b: PairingEvidence) => b.score - a.score);
      const rejectedEvidence = rejectedCandidates[0] ?? NO_MATCH_EVIDENCE;
      lineMatches.push({
        invoiceLineId: invLine.id != null ? Number(invLine.id) : null,
        invoiceLineNumber: invLine.line_number,
        invoiceItemName: invLine.item_name,
        invoiceDescription: invLine.description,
        invoiceQty: Number(invLine.order_qty) || null,
        invoiceUnitCost: Number(invLine.order_unit_cost) || null,
        invoiceCost: Number(invLine.order_cost) || null,
        poLineId: null,
        poLineNumber: null,
        poItemName: null,
        poDescription: null,
        poQty: null,
        poUnitCost: null,
        poCost: null,
        grnReceivedQty: null,
        grnRejectedQty: null,
        grnAcceptedQty: null,
        remainingGrnQty: null,
        remainingGrnBeforeThisInvoice: null,
        poLineBalanceQty: null,
        allocatedQty: null,
        unallocatedQty: null,
        matchStatus: "unmatched",
        matchConfidence: "low",
        matchConfidenceScore: rejectedEvidence.score,
        matchConfidenceReason: rejectedEvidence.reason,
        reconcileStatus: null,
        mismatches: [],
      });
    }
  }

  const matched = lineMatches.filter((lm) => lm.matchStatus === "matched").length;
  const partial = lineMatches.filter((lm) => lm.matchStatus === "partial").length;
  const unmatched = lineMatches.filter((lm) => lm.matchStatus === "unmatched").length;
  const pending = lineMatches.filter((lm) => lm.matchStatus === "pending").length;

  const docLinesMatched = documentLineMatches.filter((dl) => dl.matchStatus === "matched").length;
  const docLinesPartial = documentLineMatches.filter((dl) => dl.matchStatus === "partial").length;
  const docLinesUnmatched = documentLineMatches.filter((dl) => dl.matchStatus === "unmatched").length;
  // Billed lines the PO never ordered. They are reported on their own so they are read as
  // extra billing on the document rather than as a shortfall against the PO.
  const docLinesNotInPo = documentLineMatches.filter((dl) => dl.poLineNumber == null).length;
  const invoiceLinesNotInPo = lineMatches.filter((lm) => lm.poLineNumber == null).length;

  const totalInvoiceAmount = Number(invoice.invoice_amount) || 0;
  const totalPoAmount = poLines.reduce((sum: number, pl: any) => sum + (Number(pl.line_cost) || 0), 0);
  const amountVariance = totalInvoiceAmount - totalPoAmount;
  const amountVariancePercent = totalPoAmount > 0 ? Math.round((amountVariance / totalPoAmount) * 10000) / 100 : 0;

  // Document verification is judged only on OCR-vs-record evidence; PO quantity
  // reconciliation is judged separately so the two can be reported independently.
  const documentVerificationStatus: DocumentVerificationStatus =
    docExtractionStatus === "no_document"
      ? "no_document"
      : docExtractionStatus === "extraction_failed"
        ? "extraction_failed"
        : headerMismatches.length > 0 || docLinesUnmatched > 0 || docLinesPartial > 0
          ? "mismatched"
          : "passed";

  let overallStatus: InvoiceMatchResult["summary"]["overallStatus"];
  const hasDocMismatches = headerMismatches.some((m) => m.severity === "high") || docLinesUnmatched > 0;
  const reconBad =
    poReconciliation.po_reconciliation_status === "over_invoiced" ||
    poReconciliation.po_reconciliation_status === "over_received";
  if (
    hasDocMismatches ||
    unmatched > 0 ||
    reconBad ||
    lineMatches.some((lm) =>
      lm.mismatches.some((m) => m.label.includes("Over-Invoiced") || m.label.includes("No Receipt"))
    )
  ) {
    overallStatus = "significant_mismatches";
  } else if (
    partial > 0 ||
    pending > 0 ||
    docLinesPartial > 0 ||
    poReconciliation.po_reconciliation_status === "partially_matched" ||
    poReconciliation.po_reconciliation_status === "pending" ||
    Math.abs(amountVariancePercent) > tolerances.priceTolerance * 100 * 5
  ) {
    overallStatus = "partial_match";
  } else {
    overallStatus = "fully_matched";
  }

  const currentInvoiceAllocations = poReconciliation.allocation_details.by_invoice_line.filter(
    (a) => String(a.invoice_id) === String(invoiceId)
  );

  const partialResult = {
    invoiceId,
    poNumber: invoice.po_number,
    matchType,
    documentExtraction,
    documentAnalysis,
    documentLineMatches,
    headerMismatches,
    lineMatches,
    document_verification_status: documentVerificationStatus,
    po_reconciliation_status: poReconciliation.po_reconciliation_status,
    total_po_qty: poReconciliation.total_po_qty,
    total_grn_qty: poReconciliation.total_grn_qty,
    total_invoice_qty: poReconciliation.total_invoice_qty,
    balance_qty: poReconciliation.balance_qty,
    allocation_details: {
      ...poReconciliation.allocation_details,
      // Prefer highlighting allocations for the invoice under review while keeping full PO map
      current_invoice_lines: currentInvoiceAllocations,
    },
    line_level_status: poReconciliation.line_level_status,
    tolerances,
    summary: {
      totalInvoiceLines: invoiceLines.length,
      matched,
      partial,
      unmatched,
      pending,
      overallStatus,
      totalInvoiceAmount,
      totalPoAmount,
      amountVariance: Math.round(amountVariance * 100) / 100,
      amountVariancePercent,
      docExtractionStatus,
      documentStatus: documentVerificationStatus,
      docLinesTotal: documentLineMatches.length,
      docLinesMatched,
      docLinesPartial,
      docLinesUnmatched,
      docLinesNotInPo,
      invoiceLinesNotInPo,
      documentPageCount: documentAnalysis?.pageCount ?? 0,
      documentInvoiceCount: documentAnalysis?.invoiceCount ?? 0,
      documentInvoiceLineCount: documentExtraction?.extractedLines.length ?? 0,
      documentOcrConfidence: documentAnalysis?.ocrConfidence ?? null,
    },
  };

  const narrative = await generateNarrative(partialResult as any);

  return {
    ...partialResult,
    summary: { ...partialResult.summary, narrative },
    analyzedAt: new Date().toISOString(),
  };
}

/** Lightweight PO reconciliation for fraud checks (no OCR). */
export async function getPoReconciliationForInvoice(
  invoiceId: string,
  poNumber: string | null | undefined
): Promise<PoReconciliationResult | null> {
  if (!poNumber) return null;
  const tolerances = await loadToleranceConfig();
  const inputs = await loadPoReconciliationInputs(poNumber);
  if (inputs.poLines.length === 0) return null;
  return buildPoReconciliation({
    poNumber,
    poLines: inputs.poLines,
    grnLines: inputs.grnLines,
    invoiceLines: inputs.invoiceLines,
    qtyTolerance: tolerances.qtyTolerance,
  });
}
