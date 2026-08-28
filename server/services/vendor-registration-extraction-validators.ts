/**
 * Extraction-time validation: postal codes, IFSC, CIN, dates, plus re-exports of PAN/GSTIN from shared global rules.
 */

export {
  normalizePanLike as normalizePan,
  isValidIndianPan as isValidPan,
  isValidIndianGstin as isValidGstin,
} from "@shared/vendor-registration-field-validation";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const TAN_RE = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
/** Indian CIN (21 chars) — L/U + 5 digits + 2 alpha + 4 digits + 3 alpha + 6 digits */
const CIN_RE = /^[LU][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/i;
const IN_PIN_RE = /^\d{6}$/;

export function isValidIfsc(v: string): boolean {
  if (!v?.trim()) return false;
  return IFSC_RE.test(v.replace(/\s/g, "").toUpperCase());
}

export function normalizeTan(v: string): string {
  return v.replace(/[\s\-]/g, "").toUpperCase();
}

export function isValidTan(v: string): boolean {
  if (!v?.trim()) return false;
  return TAN_RE.test(normalizeTan(v));
}

export function isValidCin(v: string): boolean {
  if (!v?.trim()) return false;
  const u = v.replace(/\s/g, "").toUpperCase();
  return CIN_RE.test(u);
}

/** India PIN / postal code (6 digits) */
export function isValidIndianPin(v: string): boolean {
  if (!v?.trim()) return false;
  return IN_PIN_RE.test(v.replace(/\s/g, ""));
}

/**
 * Accept postal/ZIP codes from any region without guessing — printable code-like strings only.
 * Indian 6-digit PIN, US ZIP+4, UK-style short codes, general alphanumeric postcodes.
 */
/** Alphanumeric registration / license identifiers (any jurisdiction). */
export function isLikelyRegistrationNumber(v: string): boolean {
  const t = v.replace(/\s/g, "");
  return t.length >= 4 && t.length <= 80 && /^[A-Z0-9/.\-]+$/i.test(t);
}

export function isLikelyPostalCode(v: string): boolean {
  const raw = v?.trim();
  if (!raw) return false;
  const t = raw.replace(/\s/g, "");
  if (t.length < 3 || t.length > 16) return false;
  if (IN_PIN_RE.test(t)) return true;
  if (/^\d{5}(-\d{4})?$/.test(t)) return true;
  if (/^[A-Z]{1,2}\d[A-Z0-9]?\s?\d[A-Z]{2}$/i.test(raw)) return true;
  return /^[A-Z0-9][A-Z0-9\s\-]{2,14}$/i.test(raw);
}

/** YYYY-MM-DD parseable and in a sane range */
export function isValidIsoDateString(v: string): boolean {
  const t = v?.trim();
  if (!t) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const y = d.getUTCFullYear();
  return y >= 1900 && y <= 2100;
}

export function toIsoDateOrEmpty(v: string): string {
  const t = v?.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && isValidIsoDateString(t)) return t;
  return "";
}
