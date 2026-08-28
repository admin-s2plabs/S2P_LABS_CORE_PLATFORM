/**
 * Registration draft merge + mandatory keys.
 * Keep MANDATORY_* in sync with client/src/pages/modules/vendor-registration/registration-mandatory.ts
 */

import {
  buildVendorUploadAssistantMarkdown,
  type VendorUploadExtractionSlice,
} from "@shared/vendor-registration-draft-chat-summary";
import { streetLooksLikeBankPremisesNotSupplierOffice } from "@shared/vendor-registration-field-validation";
import { isValidIfsc } from "./vendor-registration-extraction-validators";

export type DraftPhase = "document_gathering" | "form_review";

export interface DraftFieldMetaEntry {
  confidence: number;
  source: "ai" | "user";
  needsReview: boolean;
  userLocked: boolean;
  lastDocumentType?: string;
}

export interface VendorRegistrationDraftSession {
  phase: DraftPhase;
  company: Record<string, string>;
  banking: Record<string, string>;
  /** Keys: "company.address_1" | "banking.bank_name" */
  fieldMeta: Record<string, DraftFieldMetaEntry>;
  uploadedDocumentTypes: string[];
}

export const CONFIDENCE_AUTO = 95;
export const CONFIDENCE_REVIEW_MIN = 80;
export const CONFIDENCE_MERGE_MARGIN = 5;

/** Must match companyDetailsSchema required fields in vendor-company-details.tsx */
export const MANDATORY_COMPANY_KEYS: string[] = [
  "address_1",
  "city",
  "state",
  "country",
  "postalcode",
  "phone",
  "email_id",
  "legal_entity_type",
  "pan_no",
  "start_date",
  "license_no",
  "expiry_date",
  "place_of_issue",
  "annual_turn_over",
  "tax_reg_no",
  "payment_terms",
  "tax_payer_id",
  "tax_effective_date",
];

/** Must match bankSchema in vendor-banking.tsx (new account) */
export const MANDATORY_BANKING_KEYS: string[] = [
  "country",
  "currency",
  "bank_name",
  "branch_name",
  "beneficiary_name",
  "account_no",
  "confirm_account_no",
  "bank_account_type",
];

export const MANDATORY_COMPANY_LABELS: Record<string, string> = {
  address_1: "Address line 1",
  city: "City",
  state: "State",
  country: "Country",
  postalcode: "Postal code",
  phone: "Phone",
  email_id: "Email",
  legal_entity_type: "Legal entity type",
  pan_no: "Primary tax ID",
  start_date: "Incorporation date",
  license_no: "License number",
  expiry_date: "License expiry",
  place_of_issue: "Place of issue",
  workingday_start: "Work week from",
  workingday_end: "Work week to",
  annual_turn_over: "Annual turnover",
  turn_over_currency: "Turnover currency",
  working_time_start_time: "Office open time",
  working_time_end_time: "Office close time",
  tax_reg_no: "GST / tax registration no.",
  payment_terms: "Payment terms",
  tax_payer_id: "TIN / tax payer ID",
  tax_effective_date: "Tax effective from",
};

export const MANDATORY_BANKING_LABELS: Record<string, string> = {
  country: "Bank country",
  currency: "Currency",
  bank_name: "Bank name",
  branch_name: "Branch name",
  beneficiary_name: "Beneficiary name",
  account_no: "Account number",
  confirm_account_no: "Confirm account number",
  bank_account_type: "Account type",
};

export function normalizeLookupText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeLegalEntityAlias(raw: string): string {
  const t = normalizeLookupText(raw)
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  const direct: Record<string, string> = {
    "pvt limited": "private limited company",
    "pvt ltd": "private limited company",
    "private ltd": "private limited company",
    "private limited": "private limited company",
    "private limited company": "private limited company",
    llp: "limited liability partnership",
    "limited liability partnership": "limited liability partnership",
    "sole prop": "sole proprietorship",
    "sole proprietorship": "sole proprietorship",
  };
  if (direct[t]) return direct[t];
  // handle minor variants like "pvt. ltd." / "sole-prop"
  const compact = t.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (direct[compact]) return direct[compact];
  return t;
}

/** Remove trailing ISO-style suffix copied from UI labels, e.g. "India (IN)" → "India". */
function stripCountryIsoParenthetical(s: string): string {
  return s.replace(/\s*\([A-Z]{2,3}\)\s*$/i, "").trim();
}

/**
 * Expand ISO codes and common abbreviations to full country names before dropdown matching.
 * Matches forms that expect full names (never rely on codes alone).
 */
export function expandCountryAliasesForLookup(raw: string): string {
  let t = raw.trim();
  if (!t) return t;
  t = stripCountryIsoParenthetical(t);
  const key = normalizeLookupText(t);
  const aliases: Record<string, string> = {
    in: "India",
    ind: "India",
    india: "India",
    us: "United States",
    usa: "United States",
    uae: "United Arab Emirates",
    ae: "United Arab Emirates",
    sg: "Singapore",
    sgp: "Singapore",
    uk: "United Kingdom",
    gb: "United Kingdom",
  };
  if (aliases[key]) return aliases[key];
  return t;
}

export function resolveLookupValue(
  raw: string | undefined,
  options: { value: string; label: string }[]
): string | null {
  if (!raw || !options?.length) return null;
  const r = raw.trim();
  if (!r) return null;
  const n = normalizeLookupText(r);
  for (const o of options) {
    if (o.value === r) return o.value;
    if (normalizeLookupText(o.label) === n) return o.value;
  }
  return null;
}

/** Normalize for fuzzy legal-entity / long-label matching (not for exact codes). */
function normalizeEntityMatchString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize common legal-structure wording so fuzzy match hits dropdown labels
 * (e.g. "Private Company Limited" ↔ "Private Limited", "Pvt Ltd" ↔ "Private Limited").
 */
export function expandLegalEntityShapeForMatch(s: string): string {
  let t = normalizeEntityMatchString(normalizeLegalEntityAlias(s))
    .replace(/\b(pvt|pvt\.)\b/gi, "private")
    .replace(/\b(ltd|ltd\.)\b/gi, "limited")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/\b(private|public)\s+company\s+(limited)\b/gi, "$1 $2");
  t = t.replace(/\bcompany\s+(private|public)\s+limited\b/gi, "$1 limited");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Match extracted legal-structure text to lookup options.
 * "Private Limited Company" → label "Private Limited" via prefix / containment / token overlap.
 */
export function resolveLegalEntityValue(
  raw: string | undefined,
  options: { value: string; label: string }[]
): string | null {
  if (!raw?.trim() || !options?.length) return null;
  const exact = resolveLookupValue(raw, options);
  if (exact) return exact;
  const r = expandLegalEntityShapeForMatch(raw);
  if (!r) return null;
  let best: { value: string; score: number } | null = null;
  for (const o of options) {
    const l = expandLegalEntityShapeForMatch(o.label);
    const v = expandLegalEntityShapeForMatch(o.value);
    let score = 0;
    if (!l && !v) continue;
    if (r === l || (v && r === v)) score = 100;
    else if (l && (r.startsWith(l) || l.startsWith(r))) score = 94;
    else if (l && (r.includes(l) || l.includes(r))) score = 88;
    else if (v && v.length >= 4 && (r.includes(v) || v.includes(r))) score = 84;
    else if (l) {
      const rt = new Set(r.split(" ").filter((x) => x.length > 1));
      const lt = new Set(l.split(" ").filter((x) => x.length > 1));
      if (lt.size) {
        const inter = [...lt].filter((t) => rt.has(t)).length;
        score = Math.round((inter / lt.size) * 82);
      }
    }
    if (score >= 78 && (!best || score > best.score)) best = { value: o.value, score };
  }
  return best?.value ?? null;
}

/** Fuzzy country: exact first, then normalized label/value containment (stricter than legal entity). */
export function resolveCountryValue(
  raw: string | undefined,
  options: { value: string; label: string }[]
): string | null {
  if (!raw?.trim() || !options?.length) return null;
  const canonical = expandCountryAliasesForLookup(raw);
  const exact = resolveLookupValue(canonical, options);
  if (exact) return exact;
  const r = normalizeLookupText(canonical);
  let best: { value: string; score: number } | null = null;
  for (const o of options) {
    const l = normalizeLookupText(o.label);
    const v = normalizeLookupText(o.value);
    let score = 0;
    if (r === l || (v && r === v)) score = 100;
    else if (l && (r.includes(l) || l.includes(r))) score = 90;
    else if (v && v.length >= 3 && (r.includes(v) || v.includes(r))) score = 86;
    if (score >= 86 && (!best || score > best.score)) best = { value: o.value, score };
  }
  return best?.value ?? null;
}

function metaKey(section: "company" | "banking", key: string): string {
  return `${section}.${key}`;
}

function needsReviewFlag(confidence: number): boolean {
  return confidence >= CONFIDENCE_REVIEW_MIN && confidence < CONFIDENCE_AUTO;
}

export interface LookupBundle {
  countries: { value: string; label: string }[];
  legalEntities: { value: string; label: string }[];
  currencies: { value: string; label: string }[];
  paymentTerms: { value: string; label: string }[];
}

/** Apply dropdown resolution: only set field if exact match; else omit (manual pick). */
export function applyLookupResolutionsToExtracted(
  company: Record<string, string>,
  banking: Record<string, string>,
  lookups: LookupBundle
): { company: Record<string, string>; banking: Record<string, string>; droppedKeys: string[] } {
  const c = { ...company };
  const b = { ...banking };
  const dropped: string[] = [];

  if (c.country) {
    const v = resolveCountryValue(c.country, lookups.countries);
    if (v) c.country = v;
    else {
      dropped.push("company.country");
      delete c.country;
    }
  }
  if (c.legal_entity_type) {
    const v = resolveLegalEntityValue(c.legal_entity_type, lookups.legalEntities);
    if (v) c.legal_entity_type = v;
    else {
      dropped.push("company.legal_entity_type");
      // Dropdown requires exact match; omit when no option matches.
      delete c.legal_entity_type;
    }
  }
  if (c.turn_over_currency) {
    const v = resolveLookupValue(c.turn_over_currency, lookups.currencies);
    if (v) c.turn_over_currency = v;
    else {
      dropped.push("company.turn_over_currency");
      delete c.turn_over_currency;
    }
  }
  if (c.payment_terms) {
    const v = resolveLookupValue(c.payment_terms, lookups.paymentTerms);
    if (v) c.payment_terms = v;
    else {
      dropped.push("company.payment_terms");
      delete c.payment_terms;
    }
  }

  if (b.country) {
    const v = resolveCountryValue(b.country, lookups.countries);
    if (v) b.country = v;
    else {
      dropped.push("banking.country");
      delete b.country;
    }
  }
  if (b.currency) {
    const v = resolveLookupValue(b.currency, lookups.currencies);
    if (v) b.currency = v;
    else {
      dropped.push("banking.currency");
      delete b.currency;
    }
  }

  return { company: c, banking: b, droppedKeys: dropped };
}

export function emptyDraftSession(): VendorRegistrationDraftSession {
  return {
    phase: "document_gathering",
    company: {},
    banking: {},
    fieldMeta: {},
    uploadedDocumentTypes: [],
  };
}

/** Latest uploaded document wins for turnover fields. */
const MERGE_LATEST_FINANCIAL_KEYS = new Set(["annual_turn_over", "turn_over_currency"]);

/** Never overwrite TIN/TAN from document extraction — manual entry only. */
const MERGE_NEVER_AI_KEYS = new Set(["tax_payer_id"]);

/** Registered office / Organization Details — never merged from bank letters or cheques (GST/incorp/trade only). */
const MERGE_BANK_DOC_TYPES = new Set(["bank_letter", "cancelled_cheque"]);
const MERGE_ORG_LOCATION_FROM_NON_BANK_ONLY = new Set([
  "address_1",
  "address_2",
  "city",
  "state",
  "country",
  "postalcode",
]);

function isLikelyPartialVersusExisting(existing: string, incoming: string): boolean {
  const e = existing.trim();
  const i = incoming.trim();
  if (!e || !i || e === i) return false;
  if (e.includes(i) && i.length <= e.length - 4) return true;
  if (e.length >= 16 && i.length < Math.floor(e.length * 0.45)) return true;
  return false;
}

/** Prefer longer / strictly more informative string when both sides have data. */
function incomingMoreComplete(prev: string, next: string): boolean {
  const p = prev.trim();
  const n = next.trim();
  if (!n) return false;
  if (!p) return true;
  return n.length > p.length;
}

/** Prefer GST-style full street over a short incorporation line when confidence ties would block merge. */
function richerCompanyAddressWins(prev: string, next: string): boolean {
  const p = prev.trim();
  const n = next.trim();
  if (!p || !n || p === n) return false;
  const streetHint =
    /\d|plot|road|street|survey|sector|floor|nagar|colony|wing|block|mjr|cross|jubilee/i;
  const nRich = streetHint.test(n);
  const pRich = streetHint.test(p) || p.length >= 32;
  return nRich && n.length >= p.length + 6 && (!pRich || n.length > p.length);
}

export function mergeExtractionIntoDraft(
  draft: VendorRegistrationDraftSession,
  extracted: {
    documentType: string;
    company: Record<string, string>;
    banking: Record<string, string>;
    fieldConfidences: Record<string, number>;
  }
): VendorRegistrationDraftSession {
  const next: VendorRegistrationDraftSession = {
    phase: draft.phase || "document_gathering",
    company: { ...draft.company },
    banking: { ...draft.banking },
    fieldMeta: { ...draft.fieldMeta },
    uploadedDocumentTypes: [...(draft.uploadedDocumentTypes || [])],
  };

  if (extracted.documentType && extracted.documentType !== "other") {
    if (!next.uploadedDocumentTypes.includes(extracted.documentType)) {
      next.uploadedDocumentTypes.push(extracted.documentType);
    }
  }

  const companyData = { ...extracted.company };
  for (const k of MERGE_NEVER_AI_KEYS) {
    delete companyData[k];
  }
  if (extracted.documentType && MERGE_BANK_DOC_TYPES.has(extracted.documentType)) {
    for (const k of MERGE_ORG_LOCATION_FROM_NON_BANK_ONLY) {
      delete companyData[k];
    }
  }

  /** Bank branch letterhead misclassified as GST/incorp still produces address_1 — strip org location at merge. */
  const addr1Incoming = companyData.address_1?.trim() ?? "";
  if (addr1Incoming && streetLooksLikeBankPremisesNotSupplierOffice(addr1Incoming)) {
    for (const k of MERGE_ORG_LOCATION_FROM_NON_BANK_ONLY) {
      delete companyData[k];
    }
  }

  const applySection = (section: "company" | "banking", data: Record<string, string>) => {
    for (const [key, newVal] of Object.entries(data)) {
      if (section === "company" && MERGE_NEVER_AI_KEYS.has(key)) continue;

      // Extraction intentionally clears bogus Address Line 1 (e.g. city duplicated as street).
      if (
        section === "company" &&
        key === "address_1" &&
        (newVal === "" || (typeof newVal === "string" && !newVal.trim()))
      ) {
        const mk = metaKey(section, key);
        // Keep key as "" so session/client can override saved profile address (see vendor-company-details merge).
        next.company.address_1 = "";
        delete next.fieldMeta[mk];
        continue;
      }
      if (
        section === "company" &&
        key === "license_no" &&
        extracted.documentType === "trade_license" &&
        (newVal === "" || (typeof newVal === "string" && !newVal.trim()))
      ) {
        const mkLic = metaKey(section, key);
        delete next.company.license_no;
        delete next.fieldMeta[mkLic];
        continue;
      }
      if (!newVal) continue;
      const mk = metaKey(section, key);
      const newConf = extracted.fieldConfidences[mk] ?? 80;
      if (newConf < CONFIDENCE_REVIEW_MIN) continue;

      const prevMeta = next.fieldMeta[mk];
      if (prevMeta?.userLocked) continue;

      const prevVal = section === "company" ? next.company[key] : next.banking[key];
      const prevConf = prevMeta?.confidence ?? 0;
      const prevStr = prevVal != null ? String(prevVal) : "";
      const emptyPrev = !prevStr.trim();

      const write = () => {
        if (section === "company") {
          next.company[key] = newVal;
        } else {
          next.banking[key] = newVal;
        }
        next.fieldMeta[mk] = {
          confidence: newConf,
          source: "ai",
          needsReview: needsReviewFlag(newConf),
          userLocked: false,
          lastDocumentType: extracted.documentType,
        };
      };

      // Latest upload wins for financial / turnover fields (this extraction pass is the newest doc).
      if (section === "company" && MERGE_LATEST_FINANCIAL_KEYS.has(key)) {
        write();
        continue;
      }

      if (emptyPrev) {
        write();
        continue;
      }

      if (isLikelyPartialVersusExisting(prevStr, String(newVal))) {
        continue;
      }

      if (
        section === "company" &&
        key === "address_1" &&
        prevMeta?.source === "ai" &&
        extracted.documentType &&
        !MERGE_BANK_DOC_TYPES.has(extracted.documentType)
      ) {
        const richerAddress = richerCompanyAddressWins(prevStr, String(newVal));
        if (!richerAddress && newConf <= prevConf + CONFIDENCE_MERGE_MARGIN) continue;
        write();
        continue;
      }

      if (newConf > prevConf + CONFIDENCE_MERGE_MARGIN) {
        write();
        continue;
      }

      if (incomingMoreComplete(prevStr, String(newVal))) {
        write();
        continue;
      }
    }
  };

  applySection("company", companyData);
  applySection("banking", extracted.banking);

  if (next.banking.account_no && !next.banking.confirm_account_no) {
    const accMeta = next.fieldMeta[metaKey("banking", "account_no")];
    if (accMeta && accMeta.confidence >= CONFIDENCE_AUTO) {
      next.banking.confirm_account_no = next.banking.account_no;
      next.fieldMeta[metaKey("banking", "confirm_account_no")] = {
        ...accMeta,
        needsReview: accMeta.needsReview,
      };
    }
  }

  const ifscNorm = next.banking.ifsccode?.replace(/\s/g, "").toUpperCase() ?? "";
  if (ifscNorm && !isValidIfsc(ifscNorm)) {
    const mkIfsc = metaKey("banking", "ifsccode");
    const ifscMeta = next.fieldMeta[mkIfsc];
    if (ifscMeta && !ifscMeta.userLocked) {
      next.fieldMeta[mkIfsc] = { ...ifscMeta, needsReview: true };
    }
  }

  return next;
}

export function computeMissingMandatory(draft: VendorRegistrationDraftSession): {
  company: string[];
  banking: string[];
  companyLabels: string[];
  bankingLabels: string[];
} {
  const company = MANDATORY_COMPANY_KEYS.filter((k) => {
    const v = draft.company[k];
    return v === undefined || v === null || String(v).trim() === "";
  });
  const banking = MANDATORY_BANKING_KEYS.filter((k) => {
    const v = draft.banking[k];
    return v === undefined || v === null || String(v).trim() === "";
  });
  return {
    company,
    banking,
    companyLabels: company.map((k) => MANDATORY_COMPANY_LABELS[k] || k),
    bankingLabels: banking.map((k) => MANDATORY_BANKING_LABELS[k] || k),
  };
}

/**
 * Conversational assistant reply after document extraction (short, user-facing copy).
 */
export function buildAssistantSummary(
  draft: VendorRegistrationDraftSession,
  processedFileNames: string[],
  lastDocumentType?: string,
  thisUploadExtraction?: VendorUploadExtractionSlice | null,
  batchDocumentTypes?: string[],
): string {
  const miss = computeMissingMandatory(draft);
  return buildVendorUploadAssistantMarkdown(
    draft,
    processedFileNames,
    lastDocumentType,
    { company: miss.company, banking: miss.banking },
    thisUploadExtraction ?? undefined,
    batchDocumentTypes,
  );
}
