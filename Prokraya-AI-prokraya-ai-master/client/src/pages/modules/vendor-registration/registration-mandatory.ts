/**
 * Mandatory registration keys — keep in sync with
 * server/services/vendor-registration-draft-merge.ts (MANDATORY_*)
 */

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

export const MANDATORY_COMPANY_LABELS: Record<string, string> = {
  address_1: "Address line 1",
  city: "City",
  state: "State",
  country: "Country",
  postalcode: "Postal code",
  phone: "Phone",
  email_id: "Email",
  legal_entity_type: "Legal entity type",
  pan_no: "PAN No (Company)",
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
