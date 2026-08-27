/**
 * Single display merge: saved vendor profile + bank accounts + session AI draft.
 * Matches precedence used in vendor-company-details.tsx (profile base, draft overlays non-empty).
 */
import type { VendorRegistrationDraftSession } from "@/pages/modules/vendor-registration/vendor-registration-draft-context";

function profileToCompanyDraftSlice(profile: any | null | undefined): Record<string, string> {
  if (!profile) return {};
  return {
    address_1: profile.address_1 || "",
    address_2: profile.address_2 || "",
    city: profile.city || "",
    state: profile.state || "",
    country: profile.country || "",
    postalcode: profile.postalcode || "",
    phone: profile.phone || "",
    email_id: profile.email_id || "",
    web_address: profile.web_address || "",
    legal_entity_type: profile.legal_entity_type || "",
    type_of_company: profile.type_of_company || "",
    pan_no: profile.pan_no || "",
    start_date: profile.start_date
      ? new Date(profile.start_date).toISOString().split("T")[0]
      : "",
    license_no: profile.license_no || "",
    expiry_date: profile.expiry_date
      ? new Date(profile.expiry_date).toISOString().split("T")[0]
      : "",
    place_of_issue: profile.place_of_issue || "",
    workingday_start: profile.workingday_start || "",
    workingday_end: profile.workingday_end || "",
    annual_turn_over: profile.annual_turn_over?.toString() || "",
    turn_over_currency: profile.turn_over_currency || "",
    working_time_start_time: profile.working_time_start_time || "",
    working_time_end_time: profile.working_time_end_time || "",
    tax_reg_no: profile.tax_reg_no || "",
    payment_terms: profile.payment_terms_id ? String(profile.payment_terms_id) : "",
    tax_payer_id: profile.tax_payer_id || "",
    tax_effective_date: profile.tax_effective_date
      ? new Date(profile.tax_effective_date).toISOString().split("T")[0]
      : "",
    parent_company_name: profile.parent_company_name || "",
    parent_company_addr: profile.parent_company_addr || "",
    prnt_cmpy_phone: profile.prnt_cmpy_phone || "",
    url: profile.url || "",
  };
}

function bankAccountsToBankingDraftSlice(
  accounts: any[] | null | undefined,
): Record<string, string> {
  if (!accounts?.length) return {};
  const bank = accounts.find((b: any) => b.primary_account === "Y") ?? accounts[0];
  return {
    country: bank.country || "",
    currency: bank.currency || "",
    bank_name: bank.bank_name || "",
    branch_name: bank.branch_name || "",
    swift_code: bank.swift_code || "",
    aba_routing: bank.aba_routing || "",
    ifsccode: bank.ifsccode || "",
    bank_address: bank.bank_address || "",
    beneficiary_name: bank.beneficiary_name || "",
    account_no: bank.account_no || "",
    confirm_account_no: bank.account_no || "",
    bank_account_type: bank.bank_account_type || "",
    street: bank.street || "",
    beneficiary_address: bank.beneficiary_address || "",
    city: bank.city || "",
    region: bank.region || "",
    postal_code: bank.postal_code || "",
    iban_no: bank.iban_no || "",
  };
}

/**
 * Merge saved API profile + bank row(s) with the session draft so AI Assistant and manual form show one consistent picture.
 * Draft non-empty values override profile (same rules as vendor-company-details mergedFormValues).
 */
export function mergeDraftWithProfileForDisplay(
  draft: VendorRegistrationDraftSession | null,
  profile: any | null | undefined,
  bankAccounts?: any[] | null,
): VendorRegistrationDraftSession {
  const phase = draft?.phase ?? "document_gathering";
  const uploadedDocumentTypes = draft?.uploadedDocumentTypes ?? [];
  const fieldMeta = { ...(draft?.fieldMeta ?? {}) };

  const profileCompany = profileToCompanyDraftSlice(profile);
  const draftCompany = { ...(draft?.company ?? {}) };
  const company: Record<string, string> = { ...profileCompany };
  for (const [k, v] of Object.entries(draftCompany)) {
    if (!(k in company)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        company[k] = String(v);
      }
      continue;
    }
    if (v === undefined || v === null) continue;
    if (k === "address_1" && String(v).trim() === "") {
      company.address_1 = "";
      continue;
    }
    if (String(v).trim() !== "") {
      company[k] = String(v);
    }
  }

  const profileBanking = bankAccountsToBankingDraftSlice(bankAccounts);
  const draftBanking = { ...(draft?.banking ?? {}) };
  const banking: Record<string, string> = { ...profileBanking };
  for (const [k, v] of Object.entries(draftBanking)) {
    if (v === undefined || v === null) continue;
    if (String(v).trim() !== "") {
      banking[k] = String(v);
    }
  }

  return {
    phase,
    company,
    banking,
    fieldMeta,
    uploadedDocumentTypes,
  };
}
