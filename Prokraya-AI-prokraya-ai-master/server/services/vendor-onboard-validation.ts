import { isLikelyPostalCode } from "./vendor-registration-extraction-validators";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_EMAIL = /@example\.(com|org|net)$/i;

export const ONBOARD_LEGAL_ENTITY_TYPES = [
  "Proprietor", "Partner", "LLP", "Private", "Public",
  "Government", "Trust", "Society", "Cooperative", "Other",
] as const;

export const ONBOARD_MANDATORY_FIELDS = [
  "companyName",
  "address",
  "legalEntityType",
  "city",
  "country",
  "postalCode",
  "contactName",
  "emailId",
  "mobileNo",
] as const;

export type OnboardMandatoryField = (typeof ONBOARD_MANDATORY_FIELDS)[number];

export const ONBOARD_FIELD_LABELS: Record<OnboardMandatoryField, string> = {
  companyName: "Company Name",
  address: "Address",
  legalEntityType: "Legal Entity Type",
  city: "City",
  country: "Country",
  postalCode: "Postal Code",
  contactName: "Contact Name",
  emailId: "Email",
  mobileNo: "Mobile Number",
};

const COUNTRY_PHONE_LENGTHS: Record<string, { min: number; max: number }> = {
  "+971": { min: 9, max: 9 },
  "+91": { min: 10, max: 10 },
  "+1": { min: 10, max: 10 },
  "+44": { min: 10, max: 10 },
  "+966": { min: 9, max: 9 },
  "+974": { min: 8, max: 8 },
  "+965": { min: 8, max: 8 },
  "+968": { min: 8, max: 8 },
  "+973": { min: 8, max: 8 },
};

const CITY_ALIASES: Record<string, { city: string; state: string; country: string }> = {
  hyd: { city: "Hyderabad", state: "Telangana", country: "India" },
  hyderabad: { city: "Hyderabad", state: "Telangana", country: "India" },
  blr: { city: "Bangalore", state: "Karnataka", country: "India" },
  bengaluru: { city: "Bangalore", state: "Karnataka", country: "India" },
  bangalore: { city: "Bangalore", state: "Karnataka", country: "India" },
  mumbai: { city: "Mumbai", state: "Maharashtra", country: "India" },
  bom: { city: "Mumbai", state: "Maharashtra", country: "India" },
  del: { city: "Delhi", state: "Delhi", country: "India" },
  delhi: { city: "Delhi", state: "Delhi", country: "India" },
  chennai: { city: "Chennai", state: "Tamil Nadu", country: "India" },
  dxb: { city: "Dubai", state: "Dubai", country: "United Arab Emirates" },
  dubai: { city: "Dubai", state: "Dubai", country: "United Arab Emirates" },
  au: { city: "Abu Dhabi", state: "Abu Dhabi", country: "United Arab Emirates" },
  "abu dhabi": { city: "Abu Dhabi", state: "Abu Dhabi", country: "United Arab Emirates" },
};

/** Known postal codes used when supplier DB has no matching record. */
const POSTAL_CODE_REFERENCE: Record<string, OnboardLocationRow> = {
  "500001": { city: "Hyderabad", state: "Telangana", country: "India" },
  "500002": { city: "Hyderabad", state: "Telangana", country: "India" },
  "500003": { city: "Secunderabad", state: "Telangana", country: "India" },
  "500004": { city: "Hyderabad", state: "Telangana", country: "India" },
  "500028": { city: "Hyderabad", state: "Telangana", country: "India" },
  "500032": { city: "Hyderabad", state: "Telangana", country: "India" },
  "500081": { city: "Hyderabad", state: "Telangana", country: "India" },
  "400001": { city: "Mumbai", state: "Maharashtra", country: "India" },
  "110001": { city: "New Delhi", state: "Delhi", country: "India" },
  "560001": { city: "Bangalore", state: "Karnataka", country: "India" },
  "600001": { city: "Chennai", state: "Tamil Nadu", country: "India" },
  "00000": { city: "Dubai", state: "Dubai", country: "United Arab Emirates" },
};

function trim(value: unknown): string {
  return String(value ?? "").trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function parsePhoneValue(value: string): { countryCode: string | null; number: string } {
  const trimmed = value.trim();
  if (!trimmed) return { countryCode: null, number: "" };

  const codes = Object.keys(COUNTRY_PHONE_LENGTHS).sort((a, b) => b.length - a.length);
  for (const code of codes) {
    if (trimmed.startsWith(code)) {
      return { countryCode: code, number: trimmed.slice(code.length).trim() };
    }
  }
  if (trimmed.startsWith("+")) {
    const match = trimmed.match(/^(\+\d{1,4})\s*(.*)/);
    if (match) return { countryCode: match[1], number: match[2] };
  }
  return { countryCode: null, number: trimmed };
}

/**
 * Generic placeholder / sample values that must never be accepted as real
 * onboarding data. These are the dummy strings an LLM tends to invent when the
 * user has not actually supplied a value (e.g. "Supplier Name", "City", "Postal Code").
 * Matched case-insensitively against the whole (whitespace-collapsed) value.
 */
const PLACEHOLDER_FIELD_VALUES: Record<string, string[]> = {
  companyName: ["supplier name", "company name", "vendor name", "supplier", "vendor", "company", "test", "test company", "sample", "abc", "xyz", "string", "n/a", "na"],
  address: ["address", "address line", "address area", "address line, address area", "address line 1", "address line 2", "street", "street address", "sample address", "string", "n/a", "na"],
  city: ["city", "city name", "sample city", "string", "n/a", "na"],
  state: ["state", "state name", "province", "sample state", "string", "n/a", "na"],
  country: ["country", "country name", "sample country", "string", "n/a", "na"],
  postalCode: ["postal code", "postalcode", "zip", "zip code", "zipcode", "pincode", "pin code", "string", "n/a", "na"],
  contactName: ["contact name", "contact", "contact person", "name", "full name", "sample contact", "string", "n/a", "na"],
  designation: ["designation", "title", "role", "job title", "string", "n/a", "na"],
};

/** Obvious dummy phone numbers (sequential / repeated digits). */
const DUMMY_PHONE_PATTERNS: RegExp[] = [
  /^(\d)\1+$/,        // all identical digits, e.g. 0000000000
  /^0123456789\d*$/,
  /^1234567890\d*$/,
  /^9876543210\d*$/,
  /^12345678\d*$/,
];

function normalizeForCompare(value: string): string {
  return trim(value).toLowerCase().replace(/\s+/g, " ");
}

/** True when `value` is a generic placeholder/sample for the given field (not real data). */
export function isPlaceholderFieldValue(field: string, value: string): boolean {
  const v = normalizeForCompare(value);
  if (!v) return false;
  const list = PLACEHOLDER_FIELD_VALUES[field];
  if (list && list.includes(v)) return true;
  // A value equal to its own field label is always a placeholder.
  const label = (ONBOARD_FIELD_LABELS as Record<string, string>)[field];
  if (label && normalizeForCompare(label) === v) return true;
  return false;
}

/** True when the phone number is an obvious dummy/sample (e.g. 1234567890). */
export function isDummyPhone(mobileNo: string): boolean {
  const { number } = parsePhoneValue(trim(mobileNo));
  const digits = digitsOnly(number);
  if (!digits) return false;
  return DUMMY_PHONE_PATTERNS.some((re) => re.test(digits));
}

export function isPlaceholderOnboardEmail(email: string): boolean {
  const value = trim(email);
  return !value || PLACEHOLDER_EMAIL.test(value);
}

export function validateOnboardEmail(email: string): { valid: boolean; message?: string } {
  const value = trim(email);
  if (!value) return { valid: false, message: "Email is required" };
  if (isPlaceholderOnboardEmail(value)) {
    return { valid: false, message: "Please provide a real contact email address (placeholder emails are not accepted)" };
  }
  if (!EMAIL_REGEX.test(value)) {
    return { valid: false, message: "Please provide a valid email address" };
  }
  return { valid: true };
}

export function validateOnboardPhone(mobileNo: string): { valid: boolean; message?: string } {
  const value = trim(mobileNo);
  if (!value) return { valid: false, message: "Mobile number is required" };

  const { countryCode, number } = parsePhoneValue(value);
  const digits = digitsOnly(number);
  const limits = countryCode ? COUNTRY_PHONE_LENGTHS[countryCode] : null;

  if (limits) {
    if (digits.length < limits.min || digits.length > limits.max) {
      return {
        valid: false,
        message: limits.min === limits.max
          ? `Mobile number must be exactly ${limits.min} digits for ${countryCode}`
          : `Mobile number must be between ${limits.min} and ${limits.max} digits for ${countryCode}`,
      };
    }
    return { valid: true };
  }

  if (digits.length < 7 || digits.length > 15) {
    return { valid: false, message: "Please provide a valid mobile number with country code (e.g. +91 9876543210)" };
  }
  return { valid: true };
}

export interface OnboardLocationRow {
  city: string;
  state: string;
  country: string;
  postalCode?: string;
}

export interface OnboardLocationLookup {
  byPostalCode(postalCode: string): Promise<OnboardLocationRow | null>;
  byCityStateCountry(city: string, state?: string, country?: string): Promise<{ postalCode: string } | null>;
  byCityOnly(city: string): Promise<OnboardLocationRow[]>;
}

export interface ResolveOnboardLocationResult {
  resolved: Record<string, string>;
  autoFilled: string[];
  needsClarification?: string;
}

function resolveCityAlias(city: string): OnboardLocationRow | null {
  const key = city.trim().toLowerCase();
  const alias = CITY_ALIASES[key];
  if (!alias) return null;
  return { ...alias };
}

function resolvePostalReference(postalCode: string): OnboardLocationRow | null {
  const normalized = postalCode.replace(/\s/g, "").toUpperCase();
  return POSTAL_CODE_REFERENCE[normalized] ?? null;
}

async function lookupLocationByPostalCode(
  postalCode: string,
  lookup: OnboardLocationLookup,
): Promise<OnboardLocationRow | null> {
  const fromDb = await lookup.byPostalCode(postalCode);
  if (fromDb) return fromDb;
  return resolvePostalReference(postalCode);
}

export async function resolveOnboardLocationFields(
  input: Record<string, unknown>,
  lookup: OnboardLocationLookup,
): Promise<ResolveOnboardLocationResult> {
  const resolved: Record<string, string> = {
    companyName: trim(input.companyName),
    address: trim(input.address),
    legalEntityType: trim(input.legalEntityType),
    city: trim(input.city),
    state: trim(input.state),
    country: trim(input.country),
    postalCode: trim(input.postalCode),
    contactName: trim(input.contactName),
    emailId: trim(input.emailId),
    mobileNo: trim(input.mobileNo),
    designation: trim(input.designation),
    licenseNo: trim(input.licenseNo),
  };
  const autoFilled: string[] = [];

  const postalCode = resolved.postalCode;
  const city = resolved.city;
  const state = resolved.state;
  const country = resolved.country;

  if (postalCode && isLikelyPostalCode(postalCode)) {
    const fromPostal = await lookupLocationByPostalCode(postalCode, lookup);
    if (fromPostal) {
      if (!city) {
        resolved.city = fromPostal.city;
        autoFilled.push("city");
      }
      if (!state && fromPostal.state) {
        resolved.state = fromPostal.state;
        autoFilled.push("state");
      }
      if (!country) {
        resolved.country = fromPostal.country;
        autoFilled.push("country");
      }
    }
  }

  if (city && country && !postalCode) {
    const alias = resolveCityAlias(city);
    if (alias) {
      resolved.city = alias.city;
      if (!state) {
        resolved.state = alias.state;
        autoFilled.push("state");
      }
    }
    const lookupCity = alias?.city || city;
    const lookupState = resolved.state || alias?.state;
    const fromLocation = await lookup.byCityStateCountry(
      lookupCity,
      lookupState || undefined,
      country,
    );
    if (fromLocation?.postalCode) {
      resolved.postalCode = fromLocation.postalCode;
      autoFilled.push("postalCode");
    }
  }

  if (city && !country && !postalCode) {
    const alias = resolveCityAlias(city);
    if (alias) {
      resolved.city = alias.city;
      if (!state) resolved.state = alias.state;
      resolved.country = alias.country;
      autoFilled.push("city", "state", "country");

      const fromLocation = await lookup.byCityStateCountry(alias.city, alias.state, alias.country);
      if (fromLocation?.postalCode) {
        resolved.postalCode = fromLocation.postalCode;
        autoFilled.push("postalCode");
      }
    } else {
      const matches = await lookup.byCityOnly(city);
      const unique = matches.filter((row, index, arr) =>
        arr.findIndex((other) =>
          other.city.toLowerCase() === row.city.toLowerCase()
          && other.state.toLowerCase() === row.state.toLowerCase()
          && other.country.toLowerCase() === row.country.toLowerCase(),
        ) === index,
      );
      if (unique.length === 1) {
        const match = unique[0];
        resolved.city = match.city;
        if (!state && match.state) resolved.state = match.state;
        resolved.country = match.country;
        autoFilled.push("city", "state", "country");
        if (match.postalCode && !resolved.postalCode) {
          resolved.postalCode = match.postalCode;
          autoFilled.push("postalCode");
        }
      } else if (unique.length > 1) {
        const options = unique
          .slice(0, 4)
          .map((row) => `${row.city}, ${row.state || "N/A"}, ${row.country}`)
          .join("; ");
        return {
          resolved,
          autoFilled,
          needsClarification: `The city "${city}" matches multiple locations. Please specify state and country. Possible matches: ${options}`,
        };
      }
    }
  }

  return { resolved, autoFilled: Array.from(new Set(autoFilled)) };
}

export interface OnboardValidationResult {
  ready: boolean;
  missingFields: OnboardMandatoryField[];
  invalidFields: Array<{ field: OnboardMandatoryField; message: string }>;
  normalized: Record<string, string>;
}

export function validateOnboardVendorData(data: Record<string, unknown>): OnboardValidationResult {
  const normalized: Record<string, string> = {
    companyName: trim(data.companyName),
    address: trim(data.address),
    legalEntityType: trim(data.legalEntityType),
    city: trim(data.city),
    state: trim(data.state),
    country: trim(data.country),
    postalCode: trim(data.postalCode),
    contactName: trim(data.contactName),
    emailId: trim(data.emailId),
    mobileNo: trim(data.mobileNo),
    designation: trim(data.designation),
    licenseNo: trim(data.licenseNo),
  };

  const missingFields = ONBOARD_MANDATORY_FIELDS.filter((field) => !normalized[field]);
  const invalidFields: Array<{ field: OnboardMandatoryField; message: string }> = [];

  // Reject fabricated placeholder/sample values (e.g. "Supplier Name", "City", "Postal Code").
  // These are present (so not "missing") but must not be onboarded as real data.
  for (const field of ONBOARD_MANDATORY_FIELDS) {
    const value = normalized[field];
    if (value && isPlaceholderFieldValue(field, value)) {
      invalidFields.push({
        field,
        message: `Please provide the actual ${ONBOARD_FIELD_LABELS[field]} — placeholder/sample values are not accepted`,
      });
    }
  }

  if (normalized.legalEntityType && !ONBOARD_LEGAL_ENTITY_TYPES.includes(normalized.legalEntityType as any)) {
    invalidFields.push({
      field: "legalEntityType",
      message: `Legal entity type must be one of: ${ONBOARD_LEGAL_ENTITY_TYPES.join(", ")}`,
    });
  }

  if (normalized.postalCode && !isLikelyPostalCode(normalized.postalCode)) {
    invalidFields.push({ field: "postalCode", message: "Please provide a valid postal/ZIP code" });
  }

  if (normalized.emailId) {
    const emailCheck = validateOnboardEmail(normalized.emailId);
    if (!emailCheck.valid) {
      invalidFields.push({ field: "emailId", message: emailCheck.message || "Invalid email" });
    }
  }

  if (normalized.mobileNo) {
    if (isDummyPhone(normalized.mobileNo)) {
      invalidFields.push({
        field: "mobileNo",
        message: "Please provide the actual Mobile Number — placeholder/sample numbers are not accepted",
      });
    } else {
      const phoneCheck = validateOnboardPhone(normalized.mobileNo);
      if (!phoneCheck.valid) {
        invalidFields.push({ field: "mobileNo", message: phoneCheck.message || "Invalid mobile number" });
      }
    }
  }

  const ready = missingFields.length === 0 && invalidFields.length === 0;
  return { ready, missingFields, invalidFields, normalized };
}

export function formatOnboardValidationPrompt(
  result: OnboardValidationResult,
  autoFilled: string[] = [],
  resolved?: Record<string, string>,
): string {
  const lines: string[] = [];

  if (autoFilled.length > 0 && resolved) {
    lines.push("Based on the location you provided, I auto-filled:");
    const locationLabels: Record<string, string> = {
      city: "City",
      state: "State",
      country: "Country",
      postalCode: "Postal Code",
    };
    for (const field of autoFilled) {
      const label = locationLabels[field] || field;
      const value = resolved[field];
      if (value) lines.push(`- **${label}:** ${value}`);
    }
    lines.push("");
  }

  if (result.missingFields.length > 0 || result.invalidFields.length > 0) {
    lines.push("To complete supplier onboarding, I still need:");
    lines.push("");
  }

  if (result.missingFields.length > 0) {
    for (const field of result.missingFields) {
      lines.push(`- **${ONBOARD_FIELD_LABELS[field]}**`);
    }
    lines.push("");
  }

  if (result.invalidFields.length > 0) {
    for (const item of result.invalidFields) {
      lines.push(`- **${ONBOARD_FIELD_LABELS[item.field]}**: ${item.message}`);
    }
  }

  return lines.join("\n").trim();
}
