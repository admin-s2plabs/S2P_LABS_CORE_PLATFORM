/**
 * Global supplier field validation — meaning-based, not India-only.
 * Used by document extraction mapping and client forms (primary tax ID, GST/VAT, turnover).
 */

/** Indian PAN (kept for classification). */
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Indian GSTIN */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizePanLike(v: string): string {
  return v.replace(/\s/g, "").toUpperCase();
}

export function isValidIndianPan(v: string): boolean {
  if (!v?.trim()) return false;
  return PAN_RE.test(normalizePanLike(v));
}

export function isValidIndianGstin(v: string): boolean {
  if (!v?.trim()) return false;
  return GSTIN_RE.test(v.replace(/\s/g, "").toUpperCase());
}

export function isClearlyInvalidTaxToken(v: string): boolean {
  const t = v.trim().toLowerCase();
  if (!t || t.length < 2) return true;
  if (/^(n\/?a|none|null|undefined|-+|\.+|x{3,}|tbd)$/i.test(t)) return true;
  if (/^(.)\1{7,}$/.test(t.replace(/\s/g, ""))) return true;
  return false;
}

/** Primary tax IDs: PAN, US EIN, UK UTR–style numerics, TRN-style, BN/UEN/USCC-style alphanumerics. */
export function isLikelyGlobalPrimaryTaxId(v: string): boolean {
  if (isClearlyInvalidTaxToken(v)) return false;
  const raw = v.trim();
  const compact = raw.replace(/\s/g, "");
  const upper = compact.toUpperCase();

  if (isValidIndianPan(raw)) return true;
  if (/^\d{2}-?\d{7}$/.test(compact)) return true;
  if (/^\d{10}$/.test(compact)) return true;
  if (/^\d{9,15}$/.test(compact)) return true;
  if (/^(\d{8}[A-Z]|\d{9}[A-Z]|S\d{2}[A-Z]\d{4}[A-Z])$/i.test(compact)) return true;
  if (/^[0-9A-Z]{18}$/i.test(compact)) return true;
  if (/^[A-Z0-9][A-Z0-9\-/]{3,90}$/i.test(raw) && /[0-9]/.test(raw) && /[A-Za-z]/.test(raw)) return true;
  if (/^[A-Z0-9]{8,17}$/i.test(compact)) return true;
  return false;
}

/** Normalize for DB/display (max 100 chars — matches schema pan_no). */
export function normalizePrimaryTaxIdForStorage(v: string): string {
  const raw = v.trim().slice(0, 100);
  if (!raw) return "";
  if (isValidIndianPan(raw)) return normalizePanLike(raw);
  const c = raw.replace(/\s/g, "");
  if (/^\d{2}-?\d{7}$/.test(c)) {
    const d = c.replace(/\D/g, "");
    if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2)}`;
  }
  return raw.replace(/\s+/g, " ").trim().slice(0, 100);
}

/** GSTIN, VAT, sales-tax style registrations (not primary income-tax ID). */
export function isLikelyIndirectTaxRegistrationNumber(v: string): boolean {
  if (isClearlyInvalidTaxToken(v)) return false;
  const t = v.trim();
  if (t.length < 4 || t.length > 50) return false;
  const u = t.replace(/\s/g, "").toUpperCase();
  if (GSTIN_RE.test(u)) return true;
  if (/^[A-Z]{2}[A-Z0-9]{2,15}$/i.test(u)) return true;
  if (/^[A-Z0-9][A-Z0-9\s\-]{2,48}$/i.test(t)) return true;
  return false;
}

/** Turnover line contains at least one digit (required for stored annual turnover amounts). */
export function hasNumericFinancialAmount(v: string): boolean {
  return /\d/.test(v?.trim() || "");
}

/** Turnover / revenue — digits preferred; also phrases with scale words or turnover-related labels. */
export function isLikelyAnnualRevenueString(v: string): boolean {
  const t = v?.trim();
  if (!t || t.length > 120) return false;
  if (isClearlyInvalidTaxToken(t)) return false;
  if (/\d/.test(t)) return true;
  if (/\b(crore|lakh|lac|lakhs|crores|million|billion|thousand)\b/i.test(t)) return true;
  if (/\b(turnover|revenue|sales|gross\s+income|annual\s+income)\b/i.test(t) && t.length >= 4) return true;
  return false;
}

/**
 * True when street lines read like a bank branch / letterhead, not a supplier registered office.
 * Catches vision misclassification (e.g. bank letter classified as GST) mapping branch address into Organization Details.
 */
export function streetLooksLikeBankPremisesNotSupplierOffice(line1: string, line2 = ""): boolean {
  const combined = `${line1 || ""} ${line2 || ""}`.replace(/\s+/g, " ").trim();
  if (combined.length < 6) return false;

  if (/\b(micr|ifsc)\b/i.test(combined)) return true;
  if (/\brtgs\b|\bneft\b/i.test(combined) && /\b[A-Z]{4}/i.test(combined)) return true;

  const namedBank =
    /\b(hdfc|icici|axis|idfc|bandhan|kotak)\s+bank\b/i.test(combined) ||
    /\b(yes\s+bank|indusind(?:\s+bank)?|rbl\s+bank|federal\s+bank)\b/i.test(combined) ||
    /\bstate\s+bank\s+of\s+india\b|\bbank\s+of\s+baroda\b|\bcanara\s+bank\b|\bunion\s+bank\s+of\s+india\b|\bpunjab\s+national\s+bank\b/i.test(
      combined,
    );

  const bankLtdAndBranch =
    /\bbank\s+ltd\.?\b|\bbank\s+limited\b/i.test(combined) && /\bbranch\b/i.test(combined);

  return namedBank || bankLtdAndBranch;
}
