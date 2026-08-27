/**
 * Vendor AI chat copy after document upload.
 * Keep field labels aligned with server/services/vendor-registration-draft-merge.ts (MANDATORY_*_LABELS)
 * and client registration-mandatory.ts.
 */

import {
  batchRecognizedAnySlot,
  friendlyMissingUploadPrompt,
  isVendorDocumentGatheringComplete,
  slotStatusFromUploadedTypes,
} from "./vendor-registration-ai-document-flow";

export type VendorRegistrationDraftForChatSummary = {
  phase?: string;
  company: Record<string, string>;
  banking: Record<string, string>;
  fieldMeta?: Record<string, unknown>;
  uploadedDocumentTypes?: string[];
};

/** Non-empty values from structured extraction for this request only (post lookup-resolution). */
export type VendorUploadExtractionSlice = {
  company: Record<string, string>;
  banking: Record<string, string>;
};

const MANDATORY_COMPANY_LABELS: Record<string, string> = {
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

const MANDATORY_BANKING_LABELS: Record<string, string> = {
  country: "Bank country",
  currency: "Currency",
  bank_name: "Bank name",
  branch_name: "Branch name",
  beneficiary_name: "Beneficiary name",
  account_no: "Account number",
  confirm_account_no: "Confirm account number",
  bank_account_type: "Account type",
};

const EXTRA_COMPANY_FORM_LABELS: Record<string, string> = {
  type_of_company: "Company name",
  address_2: "Address line 2",
  web_address: "Website",
};

const EXTRA_BANKING_FORM_LABELS: Record<string, string> = {
  ifsccode: "IFSC code",
  swift_code: "SWIFT code",
  bank_address: "Bank / branch address",
  aba_routing_no: "ABA routing number",
  iban_number: "IBAN",
  location_street: "Location / street",
  beneficiary_address: "Beneficiary address",
  beneficiary_city: "City (beneficiary)",
  beneficiary_state: "State (beneficiary)",
  beneficiary_postal: "Postal code (beneficiary)",
  is_primary: "Primary account",
};

const COMPANY_FORM_PREVIEW_ORDER: string[] = [
  "type_of_company",
  "license_no",
  "legal_entity_type",
  "pan_no",
  "tax_reg_no",
  "tax_payer_id",
  "tax_effective_date",
  "start_date",
  "expiry_date",
  "place_of_issue",
  "address_1",
  "address_2",
  "city",
  "state",
  "country",
  "postalcode",
  "phone",
  "email_id",
  "web_address",
  "workingday_start",
  "workingday_end",
  "annual_turn_over",
  "turn_over_currency",
  "working_time_start_time",
  "working_time_end_time",
  "payment_terms",
];

const BANKING_FORM_PREVIEW_ORDER: string[] = [
  "country",
  "currency",
  "bank_name",
  "branch_name",
  "ifsccode",
  "swift_code",
  "bank_address",
  "beneficiary_name",
  "account_no",
  "confirm_account_no",
  "bank_account_type",
  "location_street",
  "beneficiary_address",
  "beneficiary_city",
  "beneficiary_state",
  "beneficiary_postal",
  "iban_number",
  "aba_routing_no",
  "is_primary",
];

function hasNonEmpty(v: string | undefined): boolean {
  return v != null && String(v).trim() !== "";
}

function companyFormFieldLabel(key: string): string {
  return (
    MANDATORY_COMPANY_LABELS[key] ||
    EXTRA_COMPANY_FORM_LABELS[key] ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function bankingFormFieldLabel(key: string): string {
  return (
    MANDATORY_BANKING_LABELS[key] ||
    EXTRA_BANKING_FORM_LABELS[key] ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function previewFieldValue(raw: string, key: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const maxLen = key.includes("address") || key === "bank_address" ? 90 : 64;
  const maskAccount =
    (key === "account_no" || key === "confirm_account_no") && /^\d{5,}$/.test(v);
  let display = v;
  if (maskAccount && v.length > 4) {
    display = `ending in ${v.slice(-4)}`;
  } else if (v.length > maxLen) {
    display = `${v.slice(0, maxLen - 1)}…`;
  }
  return display;
}

function orderedFilledKeys(record: Record<string, string>, preferred: string[]): string[] {
  const filled = new Set(
    Object.entries(record)
      .filter(([, val]) => hasNonEmpty(val))
      .map(([k]) => k),
  );
  const ordered: string[] = [];
  for (const k of preferred) {
    if (filled.has(k)) ordered.push(k);
  }
  const rest = [...filled].filter((k) => !ordered.includes(k)).sort();
  return [...ordered, ...rest];
}

/** Bullet lines (markdown `- line` prefix added by caller) for one company/banking snapshot. */
export function buildManualFormFieldPreviewLinesFromRecords(
  company: Record<string, string>,
  banking: Record<string, string>,
): { company: string[]; banking: string[] } {
  const c = company || {};
  const b = banking || {};

  const companyKeys = orderedFilledKeys(c, COMPANY_FORM_PREVIEW_ORDER);

  const bankingKeys = orderedFilledKeys(b, BANKING_FORM_PREVIEW_ORDER).filter((key) => {
    if (
      key === "confirm_account_no" &&
      b.account_no &&
      b.account_no === b.confirm_account_no
    ) {
      return false;
    }
    return true;
  });

  const companyLines = companyKeys.map((key) => {
    const label = companyFormFieldLabel(key);
    const preview = previewFieldValue(c[key]!, key);
    return `- **${label}** — ${preview} (review)`;
  });

  const bankingLines = bankingKeys.map((key) => {
    const label = bankingFormFieldLabel(key);
    const preview = previewFieldValue(b[key]!, key);
    return `- **${label}** — ${preview} (review)`;
  });

  return { company: companyLines, banking: bankingLines };
}

/**
 * Assistant markdown after structured document file(s) are processed.
 * Short, guided copy only — no raw extracted fields, field keys, or technical logs.
 */
export function buildVendorUploadAssistantMarkdown(
  draft: VendorRegistrationDraftForChatSummary,
  processedFileNames: string[],
  lastDocumentType: string | undefined,
  _missing: { company: string[]; banking: string[] },
  _thisUploadExtraction?: VendorUploadExtractionSlice | null,
  batchDocumentTypes?: string[],
): string {
  const attempted = (processedFileNames || []).filter(Boolean).length > 0;

  const compEmpty = !_thisUploadExtraction?.company || Object.values(_thisUploadExtraction.company).filter(v => v != null && String(v).trim() !== "").length === 0;
  const bankEmpty = !_thisUploadExtraction?.banking || Object.values(_thisUploadExtraction.banking).filter(v => v != null && String(v).trim() !== "").length === 0;
  if (attempted && compEmpty && bankEmpty) {
    return "No data found";
  }

  const batch =
    batchDocumentTypes !== undefined && batchDocumentTypes !== null
      ? [...batchDocumentTypes]
      : lastDocumentType
        ? [lastDocumentType]
        : [];

  const types = draft.uploadedDocumentTypes || [];
  const status = slotStatusFromUploadedTypes(types);
  const complete = isVendorDocumentGatheringComplete(types);

  if (attempted && batch.length === 0) {
    return "We couldn't process your upload. Please use a PDF, JPG, or PNG under 5MB and try again.";
  }

  if (attempted && !batchRecognizedAnySlot(batch)) {
    return "We couldn't recognize that document. Try a clear PDF or photo of your incorporation certificate, tax certificate, bank letter, or business license.";
  }

  const lines: string[] = [];
  if (status.company) lines.push("Company details ready");
  if (status.gst) lines.push("Tax details ready");
  if (status.bank) lines.push("Bank details ready");
  if (status.license) lines.push("License details ready");
  const checks = lines.length ? lines.map((l) => `- ${l}`).join("\n") : "";

  if (complete) {
    return (
      "All required documents are uploaded. Review the extracted information and continue to complete your registration.\n\n" +
      checks
    ).trim();
  }

  const missingLine = friendlyMissingUploadPrompt(status);
  if (checks && missingLine) return `${checks}\n\n${missingLine}`;
  if (missingLine) return missingLine;
  return checks || "Upload your documents when you're ready.";
}
