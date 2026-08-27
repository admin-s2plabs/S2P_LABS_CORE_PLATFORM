import { renderPdfFirstTwoPagesStackedToPngBuffer } from "../modules/_shared/pdf-preview";
import {
  hasNumericFinancialAmount,
  isClearlyInvalidTaxToken,
  isLikelyAnnualRevenueString,
  isLikelyGlobalPrimaryTaxId,
  isLikelyIndirectTaxRegistrationNumber,
  normalizePrimaryTaxIdForStorage,
  streetLooksLikeBankPremisesNotSupplierOffice,
} from "@shared/vendor-registration-field-validation";
import { getAIClient, getAIModelName } from "./ai-client";
import {
  isLikelyPostalCode,
  isLikelyRegistrationNumber,
  isValidCin,
  isValidGstin,
  isValidIfsc,
  isValidIsoDateString,
  isValidPan,
  normalizePan,
  toIsoDateOrEmpty,
} from "./vendor-registration-extraction-validators";

export const STRUCTURED_DOC_TYPES = [
  "incorporation_certificate",
  "gst_certificate",
  "tax_certificate",
  "trade_license",
  "cancelled_cheque",
  "bank_letter",
  "other",
] as const;

export type StructuredDocumentType = (typeof STRUCTURED_DOC_TYPES)[number];

export interface ExtractedField {
  key: string;
  value: string;
  confidence: number;
}

export interface StructuredExtractionResult {
  documentType: StructuredDocumentType;
  fields: ExtractedField[];
  overallNotes: string;
  validationWarnings: string[];
  company: Record<string, string>;
  banking: Record<string, string>;
  fieldConfidences: Record<string, number>;
  /** Flattened vision output before semantic mapping — used for document verification. */
  rawFields: Record<string, string>;
}

const CLASSIFY_SYSTEM =
  "You classify a single business document image. Reply with one JSON object only, no markdown.";

const CLASSIFY_USER = `Classify this image into exactly one documentType:

- incorporation_certificate — Certificate of incorporation / company registration / articles / corporate registry extract
- gst_certificate — Indirect-tax registration certificate (VAT/GST/sales-tax registration), principal place of business
- tax_certificate — Other tax documents (withholding / income-tax registration) that are NOT primarily an indirect-tax reg certificate
- trade_license — Municipal trade / shop / business / professional license (not incorporation, not VAT/GST certificate)
- cancelled_cheque — Cheque leaf with cancellation marks
- bank_letter — Bank letterhead, account verification / sanction / reference letter, branch address with IFSC/MICR, or any page whose MAIN content is banking — choose bank_letter over gst_certificate when bank branding or branch dominates the layout
- other — None of the above

Return JSON only:
{ "documentType": "<one of the above>", "confidence": <0-100>, "oneLineReason": "<brief>" }`;

/** Meaning-based extraction rules — do not tie labels to one country; infer by meaning (examples in prompt only). */
const EXTRACTION_RULES_PREAMBLE = `IMPORTANT:
- For PDF inputs, the image may be the first TWO pages stacked top-to-bottom (page 1 above, page 2 below). Scan the entire image for annual turnover, revenue, and legal-entity wording.
- Extract by MEANING, not by a single country's label (PAN, GST, EIN, VAT, etc.).
- Detect country and document context when possible.
- Prefer high-confidence values; if several candidates exist, choose the most complete or latest.
- Capture currency when present for monetary amounts.
- FINANCIALS ARE MANDATORY WHEN PRINTED: if annual turnover, revenue, gross income, sales, or any yearly business income figure appears on the document (any label or wording), you MUST populate financials.annual_income and financials.currency when the currency is stated or inferable. Do not skip turnover because the label differs (e.g. "Annual Turnover", "Revenue", "Gross receipts").
- FIELD SELECTION (CRITICAL) — when multiple candidate values exist:
  (1) License number (trade licence only): accept ONLY the explicit licence/permit identifier printed for that licence. NEVER use Sl. No / serial number, reference/application/file numbers, or CIN/corporate registration numbers as the licence number.
  (2) Licence place of issue: ONLY the issuing authority or office location for the business/trade licence (city, municipal body, licensing department). NEVER use GST/tax jurisdiction, income-tax office, or bank branch names/addresses as licence place of issue.
  (3) Annual turnover: ALWAYS store numeric amounts in financials.annual_income (digits required); when several figures appear, prefer the one that includes currency (symbol or code) and matches annual/revenue/turnover labels.
  (4) Legal entity type: business.legal_entity_type MUST be filled whenever any legal form appears anywhere on the document (certificate header, constitution, footnote, etc.).
- Do NOT invent values; use empty string when absent.
- Preserve original spacing/formatting for identifiers where reasonable.

COUNTRY (address.country, root country, and banking fields):
- Always populate using the FULL country name expected on forms (e.g. India, United States, United Arab Emirates, Singapore). Never output ISO codes alone (IN, US, AE, SG).
- Priority when inferring: (1) country explicitly printed in the address or bank section; (2) strong identifiers — IFSC → India; ABA routing number → United States; GSTIN (India) / India PAN → India for registered office when address country is absent; (3) account or turnover currency when country is still unknown (INR→India, USD→United States, AED→United Arab Emirates, SGD→Singapore).

OUTPUT: ONE JSON object with exactly two keys: "values" and "confidence".
- "values" MUST match the universal schema below (nested objects). Every leaf is a string; use "" when unknown.
- "confidence": same paths using dotted keys for nested fields (e.g. "address.line1", "tax.primary_tax_id"), each 0-100 (0 if unknown). You may nest confidence objects to mirror "values" — they will be flattened to dotted keys.
- TRADE / MUNICIPAL LICENCE images: set "business.license_expiry_date" in confidence to 95–100 ONLY when a licence expiry or validity-end date is explicitly printed with permitted wording (see LICENCE EXPIRY DATE). If values.business.license_expiry_date is "" or you are not fully certain, set that confidence to 0 (or under 50) — downstream will reject guessed expiries.

Universal "values" schema:
{
  "country": "",
  "company_name": "",
  "address": {
    "line1": "",
    "line2": "",
    "city": "",
    "state": "",
    "postal_code": "",
    "country": ""
  },
  "contact": {
    "phone": "",
    "email": "",
    "website": ""
  },
  "business": {
    "legal_entity_type": "",
    "registration_number": "",
    "registration_type": "",
    "license_place_of_issue": "",
    "incorporation_date": "",
    "license_issue_date": "",
    "license_expiry_date": ""
  },
  "tax": {
    "primary_tax_id": "",
    "primary_tax_id_type": "",
    "vat_or_gst_number": "",
    "vat_or_gst_type": "",
    "secondary_tax_id": "",
    "tax_effective_from": ""
  },
  "financials": {
    "annual_income": "",
    "revenue": "",
    "turnover": "",
    "currency": ""
  },
  "banking": {
    "account_number": "",
    "bank_name": "",
    "branch": "",
    "routing_code": "",
    "routing_code_type": "",
    "beneficiary_name": "",
    "account_type": "",
    "country": "",
    "currency": ""
  }
}

BANKING FIELDS (when document shows bank / account details):
- banking.country / banking.currency = jurisdiction and currency for THIS bank account (not organization registered office). Use printed wording when present. When the word Country does not appear but IFSC (India), ABA routing (US), or the account currency clearly implies jurisdiction, populate banking.country and banking.currency using full country names (never ISO-only codes).
- banking.beneficiary_name = account holder / payee name whenever visible (labels include: Account Name, Beneficiary Name, Account Holder, Name of Account Holder, A/c Name, Account Title, Payee, Name as per bank records).
- banking.account_type = verbatim phrase for account class when printed (e.g. Current Account, Savings Bank, SB, CA, Cash Credit, Overdraft). Use clear wording — downstream maps to Current vs Savings.
- Never put bank branch address into address.* or company registered office — only banking.branch and related banking fields.

INDIA SUPPLIER FORM (values semantics — map by meaning into India fields downstream):
- Annual Turnover on the form ← financials.annual_income (+ financials.currency). MUST be extracted whenever such a figure appears on this image.
- Licence Place of Issue on the form ← business.license_place_of_issue (actual geographic or administrative place: city, district, municipal corporation, licensing office, or jurisdiction name as printed). NEVER put generic document-type phrases here (e.g. "Business License", "Trade License"). If unsure, leave "".
- Type of Legal Entity on the form ← business.legal_entity_type (legal form / constitution, e.g. Private Limited, LLP — verbatim short phrase).
- Leave tax.secondary_tax_id always "" on extraction (TIN/TAN are manual-only on the form; do not capture withholding/TAN here).
- tax.primary_tax_id = entity PAN when the document shows India company PAN.
- tax.vat_or_gst_number = GSTIN (or printed indirect-tax ID read semantically).

ADDRESS RULES:
- line1/line2 = street/building/plot only — NOT city, state, postal code, or country alone.
- Dates as YYYY-MM-DD only when clearly a calendar date on the document.

FINANCIALS RULES:
- Put annual / turnover / revenue figures in financials.annual_income when possible; you may also duplicate into financials.revenue or financials.turnover if the model emits extra keys. Values must contain numeric digits when stored (spell-out amounts alone are insufficient unless digits also appear).
- annual_income must contain numeric digits. If turnover/revenue/annual income is printed anywhere, financials.annual_income MUST be non-empty and confidence for it must reflect certainty (typically high when clearly visible). When multiple amounts exist, prefer the turnover/revenue line that includes currency.

LICENCE PLACE OF ISSUE:
- business.license_place_of_issue must be a real place or issuing authority location (e.g. "Mumbai", "Greater Chennai Corporation", "Office of the Registrar, Bangalore"). Do NOT use the words "Business License" or "Trade License" alone as the place.

LICENCE EXPIRY DATE (business.license_expiry_date) — STRICT:
- Populate ONLY when the document explicitly ties a calendar date to licence/permit validity using wording such as: Expiry Date, Valid Until, Valid Upto, License Validity, Valid Through, Renewal Due Date, or a printed range clearly labelled as licence validity (e.g. "License Validity: 01/01/2026 to 31/12/2026" → use the end date in YYYY-MM-DD).
- If there is NO such explicit licence-expiry or validity wording, business.license_expiry_date MUST be "" (empty). Do NOT guess, infer, or auto-generate.
- Do NOT infer expiry from partial dates (e.g. "01/2026" alone), serial numbers, application/reference/file numbers, or Sl. No lines.
- NEVER copy into business.license_expiry_date dates that appear only near: Sl. No, Serial No, Ref No, Application No, File No, Date of Establishment, Date of Incorporation, Account Opening Date, GST Effective Date, Date of Certificate, or similar non-expiry labels.
- Do NOT use incorporation date, establishment date, GST/tax effective dates, bank dates, or licence issue date as licence expiry unless the SAME date is explicitly labelled as expiry/valid until/validity end for the trade licence.
`;

const INCORPORATION_EXTRACT = `${EXTRACTION_RULES_PREAMBLE}

DOCUMENT FOCUS — incorporation / company registration / corporate registry:
Fill company_name, address.*, contact.*, country, business.registration_type, business.incorporation_date, tax.primary_tax_id (+ primary_tax_id_type), tax.vat_or_gst_number (+ type) only if printed. business.legal_entity_type MUST be filled if any legal form / entity type appears anywhere on the document. If annual turnover / revenue / income appears, MUST fill financials.*. If the document shows a corporate registration / CIN / incorporation number, put it in business.registration_number for extraction context only — it must NOT be used as a trade license number downstream. Keep tax.secondary_tax_id as "". Leave banking.* empty unless this single image also shows bank details.
Leave business.license_issue_date and business.license_expiry_date as "" — incorporation/certificate dates are NOT trade-licence expiry (see LICENCE EXPIRY DATE rules).`;

const GST_EXTRACT = `${EXTRACTION_RULES_PREAMBLE}

DOCUMENT FOCUS — indirect tax registration (VAT / GST / sales tax certificate):
Fill tax.vat_or_gst_number and vat_or_gst_type by meaning; tax.primary_tax_id if the document shows a distinct business income-tax / enterprise identifier; address as principal place of business; company_name / legal name; tax.tax_effective_from when labeled as effective or liability date for this registration (not trade-license expiry). business.legal_entity_type MUST be filled if constitution of business / legal form appears anywhere (including margins or headers). If turnover/revenue/annual income appears on this certificate, MUST fill financials.annual_income and financials.currency.
Leave business.license_expiry_date as "" — GST effective dates are NOT trade-licence expiry unless the certificate explicitly states a trade-licence validity line (rare; see LICENCE EXPIRY DATE rules).`;

const TAX_EXTRACT = `${EXTRACTION_RULES_PREAMBLE}

DOCUMENT FOCUS — general tax registration (not primarily VAT/GST certificate):
Fill tax.* fields by meaning; registered address into address.*; tax.tax_effective_from when labeled for this tax registration. business.legal_entity_type MUST be filled if legal form appears anywhere on the page. If annual turnover or revenue figures appear, MUST fill financials.*.
Leave business.license_expiry_date as "" unless this document explicitly states trade-licence expiry/validity wording (see LICENCE EXPIRY DATE rules).`;

const TRADE_LICENSE_EXTRACT = `${EXTRACTION_RULES_PREAMBLE}

DOCUMENT FOCUS — trade / business / municipal license (this is the only doc type where business.registration_number is the actual trade/business license number):
Fill business.registration_number with ONLY the explicit municipal licence/permit identifier (not Sl. No, not reference numbers, not CIN, not Indian PAN — PAN belongs in tax.primary_tax_id only when printed as PAN). Fill business.license_issue_date when a clear licence issue / grant date is printed for this permit. For business.license_expiry_date follow LICENCE EXPIRY DATE rules strictly: fill ONLY when expiry/valid-until/validity is explicitly stated for this licence; otherwise leave "". When you do fill licence expiry, set confidence business.license_expiry_date to 95+; when empty or uncertain, set that confidence to 0. business.license_place_of_issue = city/municipal/licensing office that issued THIS trade licence only — NEVER GST/tax commissionerate, income-tax office, or bank branch names. Use business.registration_type only for licence category text when it is clearly not a tax jurisdiction. business.legal_entity_type MUST be filled if legal form appears anywhere. Address as premises; company_name or trading name. If turnover/revenue/capital income figures appear, MUST fill financials.* with numeric amounts (prefer lines with currency). Do not put CIN / incorporation numbers here.`;

const BANK_EXTRACT = `${EXTRACTION_RULES_PREAMBLE}

DOCUMENT FOCUS — bank letter / verification:
Organization / registered office (Organization Details) must come from GST, incorporation, or trade licence — NOT from this bank letter. Leave address.*, contact.*, company_name, tax.*, business.* (except unused), and financials.* as "" (empty). Fill banking.* only: map branch routing identifiers into banking.routing_code and banking.routing_code_type (examples: IFSC, SWIFT/BIC, ABA routing, sort code). Put branch name or free-text branch details in banking.branch; combine address lines into banking.branch if no separate branch field.
MANDATORY WHEN PRINTED: banking.account_number, banking.bank_name, banking.beneficiary_name (from any account-holder / beneficiary / A/c name / payee line), banking.account_type if the document states Current or Savings. banking.country and banking.currency when the letter states jurisdiction or account currency (otherwise leave ""). Read IFSC/MICR fully — IFSC must be 11 characters when fully visible; if partially legible, transcribe exactly what you see and lower confidence.`;

const CHEQUE_EXTRACT = `${EXTRACTION_RULES_PREAMBLE}

DOCUMENT FOCUS — cancelled cheque:
Organization / registered office must come from GST or incorporation — NOT from this cheque. Leave address.*, contact.*, company_name, tax.*, business.*, and financials.* as "". Fill banking.* only; read MICR/routing into routing_code + routing_code_type when identifiable. banking.beneficiary_name MUST be filled from the printed account-holder / payee name (same labels as bank letters: Account Name, Beneficiary, A/c Name, etc.) whenever visible on the cheque leaf or MICR band. banking.country / banking.currency when printed on the cheque; otherwise leave "". Read IFSC from cheque fully (11 characters when complete); if truncated, transcribe visible characters with lower confidence.`;

/** Tax office / bank branch text — not business-licence issuing location. */
function isTaxJurisdictionOrBankBranchPlace(s: string): boolean {
  const lower = s.toLowerCase();
  if (/\b(ifsc|swift|bic|micr|routing\s+number)\b/i.test(lower)) return true;
  if (/\bbank\s+(branch|of)\b/i.test(lower) || /\bbranch\s+manager\b/i.test(lower)) return true;
  if (/\bcommissionerate\b/i.test(lower)) return true;
  if (/\b(cgst|sgst|igst)\s*(division|office|circle|range)\b/i.test(lower)) return true;
  if (/\b(gst|tax)\s+(circle|range|zone|office)\b/i.test(lower)) return true;
  if (
    /\b(income\s+tax|gst\s*bhavan|gst\s+division|gst\s+office|tax\s+department|central\s+tax|vat\s+office|assessing\s+officer)\b/i.test(
      lower,
    )
  )
    return true;
  if (/\b(gst\s+authority|tax\s+jurisdiction)\b/i.test(lower)) return true;
  return false;
}

/** Edit distance — OCR often scrambles PAN-like strings beyond fixed-position mismatch counts. */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c);
    }
  }
  return dp[m][n];
}

/**
 * Vision/OCR often puts PAN (or a corrupted PAN) in business.registration_number.
 * Treat as duplicate when Levenshtein distance is small vs mapped PAN or raw tax.primary_tax_id.
 */
function tradeLicenceNumberLooksLikePanDuplicate(lic: string, panRef: string): boolean {
  const L = lic.replace(/\s/g, "").toUpperCase();
  const P = panRef.replace(/\s/g, "").toUpperCase();
  if (!L || !P) return false;
  if (L === P) return true;
  if (L.length < 8 || P.length < 8 || L.length > 12 || P.length > 12) return false;
  return levenshteinDistance(L, P) <= 5;
}

/** Sl. No, reference numbers — not the trade licence id. CIN handled separately via isValidCin. */
function isRejectedNonExplicitLicenseNumber(raw: string): boolean {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (/^(sl\.|s\.?\s*no\.?|sr\.?\s*no\.?|serial\s*no\.?)/i.test(lower)) return true;
  if (/^(ref\.?\s*no|reference\s*no|file\s*no|application\s*no|app\s*no)/i.test(lower)) return true;
  if (/^ref[#:.]/i.test(t)) return true;
  if (/^\d{1,3}$/.test(t.replace(/\s/g, "")) && t.length <= 4) return true;
  return false;
}

/** Reject generic licence labels so "Licence Place of Issue" stays a real licensing location. */
function isLikelyActualLicensePlaceOfIssue(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 200) return false;
  if (isClearlyInvalidTaxToken(t)) return false;
  if (isTaxJurisdictionOrBankBranchPlace(t)) return false;
  const lower = t.toLowerCase();
  if (/^(business|trade|shop|professional|municipal)\s+licen[cs]e(s)?$/i.test(lower)) return false;
  if (/^(licen[cs]e|permit|certificate|business\s+registration)$/i.test(lower)) return false;
  if (/^(business\s+licen[cs]e|trade\s+licen[cs]e)$/i.test(lower)) return false;
  if (t.length <= 22 && /^(licen[cs]e|trade|business)(\s+licen[cs]e)?$/i.test(lower)) return false;
  return true;
}

function isAmbiguousValue(v: string): boolean {
  const t = v.trim();
  if (!t) return true;
  if (/\?{2,}/.test(t)) return true;
  if ((t.match(/@/g) || []).length > 1) return true;
  return false;
}

function emptyResult(): StructuredExtractionResult {
  return {
    documentType: "other",
    fields: [],
    overallNotes: "",
    validationWarnings: [],
    company: {},
    banking: {},
    fieldConfidences: {},
    rawFields: {},
  };
}

async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
      require("pdf-parse/lib/pdf-parse.js");
    const parsed = await pdfParse(pdfBuffer);
    return (parsed.text || "").trim();
  } catch {
    return "";
  }
}

/**
 * Second-pass verification for trade licence expiry dates.
 * Asks the AI to cite the EXACT printed text that proves an expiry date exists.
 * Returns { found: true, exact_text: "..." } only when explicit wording is present.
 * If the AI cannot quote real text it must return { found: false }.
 */
const VERIFY_EXPIRY_SYSTEM =
  "You verify whether a specific field is explicitly present on a document image. Reply with one JSON object only, no markdown.";

const VERIFY_EXPIRY_USER = `Look at this document image carefully.

Does it contain text that EXPLICITLY states a licence expiry, validity end, or 'valid until/upto/through' date — using wording such as:
  "Expiry Date", "Valid Until", "Valid Upto", "License Validity", "Valid Through", "Renewal Due Date",
  or a printed date range clearly labelled as licence validity (e.g. "License Validity: 01/01/2026 to 31/12/2026").

Rules:
- Do NOT count: Date of Issue, Date of Establishment, Date of Incorporation, Date of Application, GST Effective Date, Account Opening Date, Sl. No dates, or any date not explicitly tied to licence expiry/validity end.
- If such explicit expiry wording EXISTS on the document, copy the EXACT phrase from the document (including the date) into "exact_text".
- If NO such explicit expiry wording exists, set found to false and exact_text to "".

Return JSON only:
{ "found": <true|false>, "exact_text": "<verbatim phrase from document, or empty string>" }`;

async function verifyLicenseExpiryEvidence(imageUrl: string): Promise<{ found: boolean; exactText: string }> {
  try {
    const result = await visionJson(VERIFY_EXPIRY_SYSTEM, VERIFY_EXPIRY_USER, imageUrl);
    const found = result?.found === true;
    const exactText = typeof result?.exact_text === "string" ? result.exact_text.trim() : "";
    return { found: found && exactText.length > 0, exactText };
  } catch {
    return { found: false, exactText: "" };
  }
}

async function visionJson(
  systemContent: string,
  userText: string,
  imageUrl: string
): Promise<any> {
  const openai = await getAIClient();
  const modelName = await getAIModelName();
  const response = await openai.chat.completions.create({
    model: modelName,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        ],
      },
    ],
    max_completion_tokens: 2800,
    response_format: { type: "json_object" },
  });
  const raw = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Flatten nested extraction "values" into dotted keys: address.line1, tax.primary_tax_id, ... */
function flattenNestedStrings(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj == null) return out;
  if (typeof obj === "string") {
    if (prefix) out[prefix] = obj.trim();
    return out;
  }
  if (typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, val] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(out, flattenNestedStrings(val, key));
    } else if (typeof val === "string") {
      out[key] = val.trim();
    } else if (val != null) {
      out[key] = String(val).trim();
    }
  }
  return out;
}

/** Flatten nested confidence to dotted keys (same layout as values) so confFor("business.license_expiry_date") works. */
function flattenNestedConfidence(obj: unknown, prefix = ""): Record<string, number> {
  const out: Record<string, number> = {};
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, val] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(out, flattenNestedConfidence(val, key));
    } else {
      const n = typeof val === "number" ? val : parseInt(String(val), 10);
      if (Number.isFinite(n)) out[key] = Math.max(0, Math.min(100, n));
    }
  }
  return out;
}

function readFlatSemantic(parsed: any): { values: Record<string, string>; confidence: Record<string, number> } {
  const confidence: Record<string, number> = {};
  let rawValues: Record<string, unknown> = {};

  if (parsed?.values != null && typeof parsed.values === "object" && !Array.isArray(parsed.values)) {
    rawValues = parsed.values as Record<string, unknown>;
  } else if (parsed && typeof parsed === "object") {
    const skip = new Set(["documentType", "overallNotes", "values", "confidence", "oneLineReason"]);
    for (const [k, val] of Object.entries(parsed)) {
      if (skip.has(k)) continue;
      rawValues[k] = val;
    }
  }

  const values = flattenNestedStrings(rawValues);

  const c = parsed?.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};
  Object.assign(confidence, flattenNestedConfidence(c));
  return { values, confidence };
}

function confFor(
  confidence: Record<string, number>,
  key: string,
  fallback: number
): number {
  const x = confidence[key];
  return typeof x === "number" && x > 0 ? x : fallback;
}

/** First non-empty turnover line (model may use synonyms or flat keys). */
const ANNUAL_INCOME_VALUE_KEYS = [
  "financials.annual_income",
  "financials.revenue",
  "financials.turnover",
  "annual_income",
  "annual_turnover",
  "turnover",
] as const;

function pickAnnualIncomeCandidate(values: Record<string, string>): { text: string; confKey: string } | null {
  for (const k of ANNUAL_INCOME_VALUE_KEYS) {
    const t = (values[k] ?? "").trim();
    if (t) return { text: t, confKey: k };
  }
  return null;
}

function setCompany(
  out: { company: Record<string, string>; fc: Record<string, number> },
  key: string,
  value: string,
  conf: number,
  minConf = 80
): void {
  const v = value?.trim();
  if (!v || conf < minConf || isAmbiguousValue(v)) return;
  const mk = `company.${key}`;
  if (conf >= (out.fc[mk] ?? 0)) {
    out.company[key] = v;
    out.fc[mk] = conf;
  }
}

function setBank(
  out: { banking: Record<string, string>; fc: Record<string, number> },
  key: string,
  value: string,
  conf: number,
  minConf = 80
): void {
  const v = value?.trim();
  if (!v || conf < minConf || isAmbiguousValue(v)) return;
  const mk = `banking.${key}`;
  if (conf >= (out.fc[mk] ?? 0)) {
    out.banking[key] = v;
    out.fc[mk] = conf;
  }
}

function buildStreetAddress(line1: string, line2: string): string {
  const a = line1?.trim() || "";
  const b = line2?.trim() || "";
  if (!a && !b) return "";
  return b ? `${a}, ${b}`.slice(0, 250) : a.slice(0, 250);
}

/** Vision often duplicates city into street_line1; reject so later docs or manual entry can win. */
function streetLineExcludingDuplicateCity(
  line1: string,
  city: string,
  warnings: string[],
  fieldHint: string
): string {
  const s = line1?.trim() || "";
  const c = city?.trim().toLowerCase();
  if (c && s.toLowerCase() === c) {
    warnings.push(`${fieldHint}: value matched city — omitted from street`);
    return "";
  }
  return s;
}

/** Street/building cues; if absent on line1 and line2 is empty, model often put city name in street_line1. */
function hasStreetDetailHint(s: string): boolean {
  return /\d|plot|road|r\.|street|st\b|survey|sector|floor|flt|nagar|colony|phase|blk|block|wing|shop|no\.|#\b|flat|apt|suite|tower|mjr|cross|main|near|opposite|jubilee/i.test(
    s.trim(),
  );
}

/** Drop bare locality (e.g. single city name) when the model did not extract real street detail. */
function omitBareLocalityAsStreetLine(
  line1: string,
  line2: string,
  city: string,
  warnings: string[],
  fieldHint: string
): string {
  const s = line1?.trim() || "";
  if (!s) return "";
  if (line2?.trim()) return s;
  if (hasStreetDetailHint(s)) return s;
  const c = city?.trim().toLowerCase();
  if (c && s.toLowerCase() === c) return "";
  const singleToken = !/\s/.test(s);
  if (singleToken && s.length <= 40) {
    warnings.push(`${fieldHint}: single token without street detail — omitted from Address Line 1`);
    return "";
  }
  return s;
}

/** Map cheque/letter phrases to UI dropdown values Current | Savings (exact match alone is too strict). */
function normalizeExtractedBankAccountType(raw: string): "Current" | "Savings" | null {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  if (/\bfd\b|\bfixed\s+deposit\b|\bnre\b|\bnro\b|\bfcnr\b|\brecurring\b/i.test(lower)) return null;

  if (
    /\bsavings?\b/.test(lower) ||
    /\bsavings?\s+bank\b/.test(lower) ||
    /\bsavings?\s+a\/?c\b/.test(lower) ||
    /\bs\.?\s*b\.?\s*a\.?\/?c\.?\b/i.test(s) ||
    /(^|[\s,/])(sb|s\.b\.)([\s,/]|$)/i.test(s)
  ) {
    return "Savings";
  }

  if (
    /\bcurrent\b/.test(lower) ||
    /\bcurrent\s+a\/?c\b/.test(lower) ||
    /\bcurrent\s+account\b/.test(lower) ||
    /\bcash\s+credit\b/.test(lower) ||
    /\boverdraft\b/.test(lower) ||
    /(^|[\s,/])(od|o\.d\.)([\s,/]|$)/i.test(s) ||
    /(^|[\s,/])(ca|c\.a\.)([\s,/]|$)/i.test(s) ||
    /(^|[\s,/])(cc|c\.c\.)([\s,/]|$)/i.test(s)
  ) {
    return "Current";
  }

  if (/^current$/i.test(s)) return "Current";
  if (/^savings?$/i.test(s)) return "Savings";

  return null;
}

function applyBankRoutingCodes(
  out: { banking: Record<string, string>; fc: Record<string, number> },
  routingCode: string,
  routingTypeRaw: string,
  confidence: Record<string, number>,
  warnings: string[]
): void {
  const rc = routingCode.replace(/\s/g, "");
  const rt = routingTypeRaw.toLowerCase();
  if (!rc) return;
  const cf = confFor(confidence, "banking.routing_code", 88);
  const upperRc = rc.toUpperCase();
  const looksLikeIfscPattern = /^[A-Z]{4}0[A-Z0-9]{1,12}$/.test(upperRc);

  if (isValidIfsc(upperRc)) {
    setBank(out, "ifsccode", upperRc, Math.max(cf, 90));
    return;
  }
  if (rt.includes("ifsc") || looksLikeIfscPattern) {
    if (!isValidIfsc(upperRc)) {
      warnings.push(
        "IFSC appears invalid or truncated — verify (11 characters: 4 letters + 0 + 6 alphanumeric)."
      );
    }
    setBank(out, "ifsccode", upperRc, 82);
    return;
  }
  if (/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(upperRc) || rt.includes("swift") || rt.includes("bic")) {
    setBank(out, "swift_code", upperRc, cf);
    return;
  }
  if (/^\d{9}$/.test(rc)) {
    setBank(out, "aba_routing", rc, cf);
    return;
  }
  const sortDigits = rc.replace(/-/g, "");
  const hyphenSort = /^\d{2}-\d{2}-\d{2}$/.test(routingCode.trim());
  const sixDigitSort =
    /^\d{6}$/.test(sortDigits) &&
    (rt.includes("sort") || rt.includes("uk") || (routingCode.trim().length === 6 && !/[A-Za-z]/.test(routingCode)));
  if (hyphenSort || sixDigitSort) {
    const hint = `Sort code: ${routingCode}`.slice(0, 120);
    const prev = out.banking.branch_name?.trim();
    setBank(
      out,
      "branch_name",
      prev ? `${prev} — ${hint}` : hint,
      Math.min(cf, 82),
    );
    return;
  }
  warnings.push("Routing code present but not classified as IFSC/SWIFT/ABA/sort — left unmapped");
}

/** Valid IFSC → India/INR; 9-digit ABA → United States/USD; then currency-only hints when country still empty. */
function inferBankCountryCurrencyFromRouting(bk: { banking: Record<string, string>; fc: Record<string, number> }): void {
  const ifsc = (bk.banking.ifsccode ?? "").replace(/\s/g, "").toUpperCase();
  if (ifsc && isValidIfsc(ifsc)) {
    setBank(bk, "country", "India", 97);
    setBank(bk, "currency", "INR", 97);
    return;
  }
  const abaDigits = (bk.banking.aba_routing ?? "").replace(/\D/g, "");
  if (/^\d{9}$/.test(abaDigits)) {
    setBank(bk, "country", "United States", 95);
    setBank(bk, "currency", "USD", 95);
    return;
  }

  const hasCountry = !!(bk.banking.country ?? "").trim();
  const cur = (bk.banking.currency ?? "").trim().toUpperCase();
  if (!hasCountry && cur) {
    const currencyToCountry: Record<string, { country: string; conf: number }> = {
      INR: { country: "India", conf: 91 },
      AED: { country: "United Arab Emirates", conf: 90 },
      SGD: { country: "Singapore", conf: 90 },
      USD: { country: "United States", conf: 86 },
    };
    const hit = currencyToCountry[cur];
    if (hit) setBank(bk, "country", hit.country, hit.conf);
  }
}

/** When registered-office country is missing, infer from GSTIN / India PAN / INR turnover currency (org docs only). */
function inferOrganizationCountryFromSignals(
  co: { company: Record<string, string>; fc: Record<string, number> },
  values: Record<string, string>,
  companyFieldsFromOrgDocsOnly: boolean
): void {
  if (!companyFieldsFromOrgDocsOnly) return;
  if (co.company.country?.trim()) return;

  const g = (key: string) => (values[key] ?? "").trim();

  const gstCandidates = [
    co.company.tax_reg_no,
    g("tax.vat_or_gst_number"),
    g("tax.primary_tax_id"),
  ].filter(Boolean) as string[];
  for (const raw of gstCandidates) {
    const compact = raw.replace(/\s/g, "").toUpperCase();
    if (compact.length >= 15 && isValidGstin(compact)) {
      setCompany(co, "country", "India", 93);
      return;
    }
  }

  const panCandidates = [g("tax.primary_tax_id"), co.company.pan_no].filter(Boolean) as string[];
  for (const raw of panCandidates) {
    const p = normalizePan(raw.replace(/\s/g, ""));
    if (p && isValidPan(p)) {
      setCompany(co, "country", "India", 92);
      return;
    }
  }

  const cur = (co.company.turn_over_currency || g("financials.currency")).trim().toUpperCase();
  if (cur === "INR") {
    setCompany(co, "country", "India", 88);
  }
}

/** Map meaning-based universal extraction into supplier company + banking draft fields. */
function mapUniversalExtraction(
  values: Record<string, string>,
  confidence: Record<string, number>,
  documentType: StructuredDocumentType,
  warnings: string[]
): { company: Record<string, string>; banking: Record<string, string>; fc: Record<string, number> } {
  const company: Record<string, string> = {};
  const banking: Record<string, string> = {};
  const fc: Record<string, number> = {};
  const co = { company, fc };
  const bk = { banking, fc };

  /** GST/incorp/trade only — bank letters and cheques populate banking.* only (registered office is never taken from bank docs). */
  const companyFieldsFromOrgDocsOnly =
    documentType !== "bank_letter" && documentType !== "cancelled_cheque";
  function setCompanyIfOrg(key: string, value: string, conf: number, minConf = 80): void {
    if (!companyFieldsFromOrgDocsOnly) return;
    setCompany(co, key, value, conf, minConf);
  }

  const g = (key: string) => (values[key] ?? "").trim();

  const countryRoot = g("country") || g("address.country");
  const cityEarly = g("address.city");
  let line1 = streetLineExcludingDuplicateCity(g("address.line1"), cityEarly, warnings, "address.line1");
  const line2 = g("address.line2");
  line1 = omitBareLocalityAsStreetLine(line1, line2, cityEarly, warnings, "address.line1");
  const addr = buildStreetAddress(line1, line2);
  /** Misclassified bank scans often fill address.* with branch letterhead — never map that to registered office. */
  const orgLocationLooksLikeBankBranch =
    streetLooksLikeBankPremisesNotSupplierOffice(line1, line2) ||
    streetLooksLikeBankPremisesNotSupplierOffice(addr, "");
  if (orgLocationLooksLikeBankBranch) {
    warnings.push(
      "Organization address fields omitted — extracted street looks like a bank branch; use GST or incorporation for registered office.",
    );
  }

  if (!orgLocationLooksLikeBankBranch) {
    if (addr) {
      const c1 = confFor(confidence, "address.line1", 85);
      const c2 = confFor(confidence, "address.line2", 80);
      const mc = line2 ? Math.min(c1, c2) : c1;
      setCompanyIfOrg("address_1", addr, mc);
    }
    if (cityEarly) setCompanyIfOrg("city", cityEarly, confFor(confidence, "address.city", 85));
    const state = g("address.state");
    if (state) setCompanyIfOrg("state", state, confFor(confidence, "address.state", 85));

    const pcRaw = g("address.postal_code").replace(/\s/g, "");
    if (pcRaw) {
      if (isLikelyPostalCode(pcRaw)) {
        setCompanyIfOrg("postalcode", pcRaw, confFor(confidence, "address.postal_code", 85));
      } else {
        warnings.push("Postal code omitted — unsupported format");
      }
    }

    const addrCountry = g("address.country");
    if (addrCountry) setCompanyIfOrg("country", addrCountry, confFor(confidence, "address.country", 85));
    else if (countryRoot) setCompanyIfOrg("country", countryRoot, confFor(confidence, "country", 85));
  }

  const phone = g("contact.phone");
  if (phone) setCompanyIfOrg( "phone", phone, confFor(confidence, "contact.phone", 82));
  const em = g("contact.email");
  if (em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    setCompanyIfOrg( "email_id", em, confFor(confidence, "contact.email", 88));
  }
  const web = g("contact.website");
  if (web) setCompanyIfOrg( "web_address", web, confFor(confidence, "contact.website", 78));

  const compName = g("company_name");
  if (compName) setCompanyIfOrg( "type_of_company", compName, confFor(confidence, "company_name", 90));

  /** Type of Legal Entity — MUST map whenever model extracts constitution / legal form. */
  const lePrimary = g("business.legal_entity_type");
  const leAlt = g("legal_entity_type");
  const letext = lePrimary || leAlt;
  const leConfKey = lePrimary ? "business.legal_entity_type" : leAlt ? "legal_entity_type" : "business.legal_entity_type";
  if (letext) {
    setCompanyIfOrg( "legal_entity_type", letext, confFor(confidence, leConfKey, 82));
  }

  /** Licence number: explicit licence id only — not Sl./Ref/CIN (trade licence docs only). */
  const regNoRaw = g("business.registration_number").trim();
  if (regNoRaw && documentType === "trade_license") {
    const compact = regNoRaw.replace(/\s/g, "");
    const upper = compact.toUpperCase();
    const compactTenForPan = compact.length >= 10 ? compact.slice(0, 10) : compact;
    const looksLikeIndianPan =
      compactTenForPan.length === 10 && isValidPan(normalizePan(compactTenForPan));
    if (isValidCin(upper)) {
      warnings.push("Value looks like corporate registration (CIN) — not mapped to license number");
    } else if (looksLikeIndianPan) {
      warnings.push(
        "License number omitted — value matches PAN format (use the municipal trade licence id, not income-tax PAN)",
      );
    } else if (isRejectedNonExplicitLicenseNumber(regNoRaw)) {
      warnings.push("License number omitted — looks like serial/reference (use explicit licence identifier only)");
    } else if (
      isLikelyRegistrationNumber(compact) ||
      (compact.length >= 4 && compact.length <= 120 && !isClearlyInvalidTaxToken(regNoRaw))
    ) {
      setCompanyIfOrg( "license_no", regNoRaw.slice(0, 120), confFor(confidence, "business.registration_number", 88));
    } else {
      warnings.push("License number unclear — omitted");
    }
  }

  /** Licence Place of Issue ← geographic/administrative location only (not "Business License"). */
  const placeDedicated = g("business.license_place_of_issue").trim();
  const regType = g("business.registration_type").trim();
  const addrCityNorm = g("address.city").trim().toLowerCase();
  const regTypePlaceFallback =
    documentType === "trade_license" && regType && !isTaxJurisdictionOrBankBranchPlace(regType) ? regType : "";
  const placeCandidate = placeDedicated || regTypePlaceFallback;
  const placeLooksOnlyLikeCity =
    !!placeCandidate &&
    !!addrCityNorm &&
    placeCandidate.trim().toLowerCase() === addrCityNorm &&
    !/\b(municipal|corporation|corpn|nagar|nigam|gram|panchayat|licen[cs]e|department|commissioner|ward|zonal|greater|circle)\b/i.test(
      placeCandidate,
    );
  if (placeLooksOnlyLikeCity) {
    warnings.push(
      "Licence place of issue omitted — value only repeats city; use the issuing municipal / licensing authority as printed on the licence.",
    );
  } else if (placeCandidate && isLikelyActualLicensePlaceOfIssue(placeCandidate)) {
    const confKey = placeDedicated ? "business.license_place_of_issue" : "business.registration_type";
    setCompanyIfOrg( "place_of_issue", placeCandidate.slice(0, 200), confFor(confidence, confKey, 82));
  } else if (placeCandidate && !isLikelyActualLicensePlaceOfIssue(placeCandidate)) {
    warnings.push(
      "Licence place of issue omitted — use business-licence issuing authority/location only (not tax office or bank branch)",
    );
  }

  const inc = toIsoDateOrEmpty(g("business.incorporation_date"));
  const licIssue = toIsoDateOrEmpty(g("business.license_issue_date"));
  const taxEff = toIsoDateOrEmpty(g("tax.tax_effective_from"));
  const startCandidate =
    inc && isValidIsoDateString(inc)
      ? inc
      : documentType === "trade_license" && licIssue && isValidIsoDateString(licIssue)
        ? licIssue
        : "";
  if (startCandidate) {
    const confKey = inc ? "business.incorporation_date" : "business.license_issue_date";
    setCompanyIfOrg( "start_date", startCandidate, confFor(confidence, confKey, 88));
  }

  let licExp = toIsoDateOrEmpty(g("business.license_expiry_date"));
  if (licExp && isValidIsoDateString(licExp)) {
    const sameAsIncorp = isValidIsoDateString(inc) && licExp === inc;
    const sameAsTaxEff = isValidIsoDateString(taxEff) && licExp === taxEff;
    const sameAsIssue = isValidIsoDateString(licIssue) && licExp === licIssue;
    if (sameAsIncorp || sameAsTaxEff || sameAsIssue) {
      warnings.push(
        "Licence expiry omitted — matched incorporation, tax effective, or licence issue date (use only dates explicitly labelled as licence expiry / valid until / validity).",
      );
      licExp = "";
      delete fc["company.expiry_date"];
    }
  }

  /** Trade licence: model often hallucinates expiry; only accept when self-reported confidence is very high (see prompts). */
  const tradeLicExpConfRaw = confidence["business.license_expiry_date"];
  const tradeLicExpConf =
    typeof tradeLicExpConfRaw === "number" && Number.isFinite(tradeLicExpConfRaw)
      ? Math.max(0, Math.min(100, tradeLicExpConfRaw))
      : 0;
  if (documentType === "trade_license" && licExp && isValidIsoDateString(licExp) && tradeLicExpConf < 93) {
    warnings.push(
      "Licence expiry omitted — trade licence requires explicit high-confidence printed expiry; enter the date manually if shown on your licence.",
    );
    licExp = "";
    delete fc["company.expiry_date"];
  }

  if (licExp && isValidIsoDateString(licExp)) {
    setCompanyIfOrg( "expiry_date", licExp, confFor(confidence, "business.license_expiry_date", 88));
  }

  const vatInput = g("tax.vat_or_gst_number").trim();
  const vatCompact = vatInput.replace(/\s/g, "").toUpperCase();
  if (vatInput && isLikelyIndirectTaxRegistrationNumber(vatInput)) {
    const stored = isValidGstin(vatCompact) ? vatCompact : vatInput.slice(0, 80).trim();
    setCompanyIfOrg(
      "tax_reg_no",
      stored,
      Math.max(88, confFor(confidence, "tax.vat_or_gst_number", isValidGstin(vatCompact) ? 95 : 88)),
    );
  }

  const ptidNorm = g("tax.primary_tax_id").trim();
  const ptidCompact = ptidNorm.replace(/\s/g, "").toUpperCase();
  if (ptidNorm && isLikelyGlobalPrimaryTaxId(ptidNorm)) {
    if (isValidGstin(ptidCompact)) {
      if (!company.tax_reg_no) {
        setCompanyIfOrg( "tax_reg_no", ptidCompact, Math.max(90, confFor(confidence, "tax.primary_tax_id", 92)));
      }
    } else {
      setCompanyIfOrg(
        "pan_no",
        normalizePrimaryTaxIdForStorage(ptidNorm),
        Math.max(86, confFor(confidence, "tax.primary_tax_id", 90)),
      );
    }
  }
  /** TIN/TAN (tax_payer_id): never autofilled from extraction — manual entry only. */

  if (documentType === "trade_license" && company.license_no?.trim()) {
    const rawRefs = [company.pan_no?.trim() ?? "", g("tax.primary_tax_id").trim()].filter((x) => x.length >= 8);
    const seen = new Set<string>();
    const refs: string[] = [];
    for (const r of rawRefs) {
      const k = r.replace(/\s/g, "").toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      refs.push(r);
    }
    for (const ref of refs) {
      if (!tradeLicenceNumberLooksLikePanDuplicate(company.license_no, ref)) continue;
      company.license_no = "";
      delete fc["company.license_no"];
      warnings.push(
        "License number omitted — value matches or closely matches company PAN (use the municipal trade licence number only).",
      );
      break;
    }
  }

  if (taxEff && isValidIsoDateString(taxEff)) {
    setCompanyIfOrg( "tax_effective_date", taxEff, confFor(confidence, "tax.tax_effective_from", 90));
  }

  const pickedAnnual = pickAnnualIncomeCandidate(values);
  const annual = pickedAnnual?.text.trim() ?? "";
  const annualConfKey = pickedAnnual?.confKey ?? "financials.annual_income";
  const annualPassedGate =
    !!annual &&
    hasNumericFinancialAmount(annual) &&
    (isLikelyAnnualRevenueString(annual) || (!isClearlyInvalidTaxToken(annual) && annual.length >= 3));
  if (annualPassedGate) {
    setCompanyIfOrg( "annual_turn_over", annual.slice(0, 120), confFor(confidence, annualConfKey, 82));
  }
  const cur = g("financials.currency");
  if (cur) setCompanyIfOrg( "turn_over_currency", cur.slice(0, 16), confFor(confidence, "financials.currency", 85));

  const bankName = g("banking.bank_name");
  if (bankName) setBank(bk, "bank_name", bankName, confFor(confidence, "banking.bank_name", 90));

  const branch = g("banking.branch");
  if (branch) {
    const addrPart = branch.slice(0, 200);
    setBank(bk, "bank_address", addrPart, confFor(confidence, "banking.branch", 86));
    const label = branch.split(/[,;]/)[0]?.trim().slice(0, 120) || branch.slice(0, 120);
    setBank(bk, "branch_name", label, confFor(confidence, "banking.branch", 82));
  }
  if (orgLocationLooksLikeBankBranch && addr.trim() && !banking.bank_address) {
    setBank(bk, "bank_address", addr.slice(0, 200), confFor(confidence, "address.line1", 82));
  }

  const acc = g("banking.account_number").replace(/\s/g, "");
  if (acc && /^[A-Z0-9]{4,34}$/i.test(acc) && (/\d/.test(acc) || acc.length >= 8)) {
    const cf = confFor(confidence, "banking.account_number", 92);
    setBank(bk, "account_no", acc, cf);
    if (cf >= 95) setBank(bk, "confirm_account_no", acc, cf);
  }

  const ben = g("banking.beneficiary_name");
  if (ben) setBank(bk, "beneficiary_name", ben, confFor(confidence, "banking.beneficiary_name", 90));

  applyBankRoutingCodes(bk, g("banking.routing_code"), g("banking.routing_code_type"), confidence, warnings);

  const bankCountry = g("banking.country");
  if (bankCountry) setBank(bk, "country", bankCountry, confFor(confidence, "banking.country", 85));
  const bankCur = g("banking.currency");
  if (bankCur) setBank(bk, "currency", bankCur, confFor(confidence, "banking.currency", 85));

  inferBankCountryCurrencyFromRouting(bk);

  const at = g("banking.account_type");
  const acctNorm = normalizeExtractedBankAccountType(at);
  if (acctNorm) {
    setBank(bk, "bank_account_type", acctNorm, confFor(confidence, "banking.account_type", 88));
  }

  inferOrganizationCountryFromSignals(co, values, companyFieldsFromOrgDocsOnly);

  return { company, banking, fc };
}

/** If Line 1 is literally the same text as city and has no street cues, do not treat as street address. */
function dropAddressIfCityOnlyDuplicate(
  company: Record<string, string>,
  fc: Record<string, number>,
  warnings: string[]
): void {
  const a = company.address_1?.trim();
  const c = company.city?.trim();
  if (!a || !c) return;
  if (a.toLowerCase() !== c.toLowerCase()) return;
  if (hasStreetDetailHint(a)) return;
  company.address_1 = "";
  delete fc["company.address_1"];
  warnings.push("Address Line 1 omitted — matched city without street or building detail");
}

function semanticMap(
  documentType: StructuredDocumentType,
  parsed: any,
  warnings: string[]
): { company: Record<string, string>; banking: Record<string, string>; fc: Record<string, number> } {
  const { values, confidence } = readFlatSemantic(parsed);
  const fc: Record<string, number> = {};
  const company: Record<string, string> = {};
  const banking: Record<string, string> = {};

  if (documentType !== "other") {
    const m = mapUniversalExtraction(values, confidence, documentType, warnings);
    Object.assign(company, m.company);
    Object.assign(banking, m.banking);
    Object.assign(fc, m.fc);
  }

  if (
    documentType === "incorporation_certificate" ||
    documentType === "gst_certificate" ||
    documentType === "tax_certificate" ||
    documentType === "trade_license"
  ) {
    dropAddressIfCityOnlyDuplicate(company, fc, warnings);
  }

  return { company, banking, fc };
}

function extractionPromptFor(doc: StructuredDocumentType): string {
  switch (doc) {
    case "incorporation_certificate":
      return INCORPORATION_EXTRACT;
    case "gst_certificate":
      return GST_EXTRACT;
    case "tax_certificate":
      return TAX_EXTRACT;
    case "trade_license":
      return TRADE_LICENSE_EXTRACT;
    case "bank_letter":
      return BANK_EXTRACT;
    case "cancelled_cheque":
      return CHEQUE_EXTRACT;
    default:
      return `${INCORPORATION_EXTRACT}\n\nIf document is unclear, return empty values with low confidence.`;
  }
}

export async function extractStructuredDocument(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<StructuredExtractionResult> {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    return {
      ...emptyResult(),
      overallNotes: "Unsupported file type",
      validationWarnings: ["Only PDF, JPG, and PNG are supported"],
    };
  }

  let imageBuffer: Buffer;
  let imageMime: string;
  if (isImage) {
    imageBuffer = fileBuffer;
    imageMime = mimeType;
  } else {
    const png = await renderPdfFirstTwoPagesStackedToPngBuffer(fileBuffer);
    if (!png) {
      return {
        ...emptyResult(),
        overallNotes: "Could not render PDF",
        validationWarnings: ["Try a clearer PDF or upload JPG/PNG"],
      };
    }
    imageBuffer = png;
    imageMime = "image/png";
  }

  const imageUrl = `data:${imageMime};base64,${imageBuffer.toString("base64")}`;

  try {
    const classified = await visionJson(CLASSIFY_SYSTEM, CLASSIFY_USER, imageUrl);
    let documentType: StructuredDocumentType = "other";
    const rawType = String(classified?.documentType || "other").toLowerCase();
    if ((STRUCTURED_DOC_TYPES as readonly string[]).includes(rawType)) {
      documentType = rawType as StructuredDocumentType;
    }

    const extractPromptBase = extractionPromptFor(documentType);
    let pdfTextHint = "";
    if (isPdf) {
      pdfTextHint = await extractPdfText(fileBuffer);
    }
    const extractPrompt =
      pdfTextHint.length > 80
        ? `${extractPromptBase}\n\nMACHINE-READABLE PDF TEXT (authoritative when image OCR is unclear):\n${pdfTextHint.slice(0, 12000)}`
        : extractPromptBase;
    const extracted =
      documentType === "other"
        ? { values: {}, confidence: {} }
        : await visionJson(
            "You extract structured business fields from one document image. Output one JSON object only.",
            extractPrompt,
            imageUrl
          );

    const rawFields = flattenNestedStrings(extracted?.values ?? {});

    const validationWarnings: string[] = [];
    if (typeof classified?.oneLineReason === "string") {
      validationWarnings.push(`Classify: ${classified.oneLineReason}`);
    }

    /**
     * Trade licence expiry guard — second-pass evidence check.
     *
     * Even when the main extraction returns a date AND a high confidence score,
     * the AI can still hallucinate both simultaneously. We run a dedicated
     * verification call that asks the model to quote the exact printed text
     * proving expiry wording exists. If it cannot, we zero-out the confidence
     * so the downstream < 93 threshold in mapUniversalExtraction rejects it.
     */
    if (documentType === "trade_license") {
      const rawExpiry = (extracted?.values?.business?.license_expiry_date ?? "").toString().trim()
        || (extracted?.["business.license_expiry_date"] ?? "").toString().trim();
      if (rawExpiry) {
        const { found, exactText } = await verifyLicenseExpiryEvidence(imageUrl);
        if (!found) {
          validationWarnings.push(
            "Licence expiry omitted — verification pass found no explicit expiry/validity wording on the document. Enter the date manually if your licence shows one.",
          );
          // Zero out confidence so the confidence gate in mapUniversalExtraction rejects it
          if (extracted?.confidence) {
            if (typeof extracted.confidence === "object" && extracted.confidence !== null) {
              if (extracted.confidence.business && typeof extracted.confidence.business === "object") {
                (extracted.confidence.business as Record<string, unknown>).license_expiry_date = 0;
              } else {
                (extracted.confidence as Record<string, unknown>)["business.license_expiry_date"] = 0;
              }
            }
          }
          // Also clear the value itself so it never reaches setCompanyIfOrg
          if (extracted?.values?.business && typeof extracted.values.business === "object") {
            (extracted.values.business as Record<string, unknown>).license_expiry_date = "";
          } else if (extracted?.values && typeof extracted.values === "object") {
            (extracted.values as Record<string, unknown>)["business.license_expiry_date"] = "";
          }
        } else {
          validationWarnings.push(`Licence expiry verified — found: "${exactText}"`);
        }
      }
    }

    const { company, banking, fc } = semanticMap(documentType, extracted, validationWarnings);

    if (company.pan_no && isValidPan(company.pan_no)) {
      company.pan_no = normalizePan(company.pan_no);
    }
    if (banking.ifsccode) banking.ifsccode = banking.ifsccode.replace(/\s/g, "").toUpperCase();

    const fields: ExtractedField[] = [];
    for (const [k, v] of Object.entries(company)) {
      fields.push({ key: k, value: v, confidence: fc[`company.${k}`] ?? 80 });
    }
    for (const [k, v] of Object.entries(banking)) {
      fields.push({ key: k, value: v, confidence: fc[`banking.${k}`] ?? 80 });
    }

    return {
      documentType,
      fields,
      overallNotes: typeof extracted?.overallNotes === "string" ? extracted.overallNotes : "",
      validationWarnings,
      company,
      banking,
      fieldConfidences: fc,
      rawFields,
    };
  } catch (err: any) {
    console.error("[StructuredExtraction]", err?.message);
    return {
      ...emptyResult(),
      overallNotes: `Could not process "${fileName}"`,
      validationWarnings: [err?.message || "Extraction failed"],
    };
  }
}
