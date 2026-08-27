/**
 * Direct PO lookup matchers for Budget, Department, Delivery Location, Payment Terms.
 * Data sources mirror the manual Create PO form APIs.
 */

import {
  formatAmbiguityMessage,
  formatNotFoundMessage,
  isCanonicalNumericId,
  matchByLabels,
  parseCanonicalNumericId,
  type NameMatchResult,
} from "./direct-po-name-match";

// ─── Budget (GET /api/budgets/approved-lines) ────────────────────────────────

export interface ApprovedBudgetLine {
  id: number | string;
  segment_dtl_code?: string | null;
  segment_dtl_name?: string | null;
  budget_name?: string | null;
  budget_mst_id?: number | string | null;
  budget_curr?: string | null;
  business_entity?: string | null;
  amount?: string | number | null;
  consumed_amount?: string | number | null;
  reserved_amount?: string | number | null;
  dept_id?: string | null;
  loc_id?: string | null;
}

export interface BudgetCandidate {
  budgetId: number;
  budgetName: string;
  segmentCode?: string | null;
  currency?: string | null;
  availableAmount?: number | null;
  deptId?: string | null;
  locId?: string | null;
  businessEntity?: string | null;
}

export function budgetDisplayName(line: ApprovedBudgetLine): string {
  const budget = String(line.budget_name || "").trim();
  const segment = String(line.segment_dtl_name || "").trim();
  if (budget && segment) return `${budget} . ${segment}`;
  return budget || segment || `Budget ${line.id}`;
}

export function budgetAvailableAmount(line: ApprovedBudgetLine): number {
  const amount = parseFloat(String(line.amount ?? 0)) || 0;
  const consumed = parseFloat(String(line.consumed_amount ?? 0)) || 0;
  const reserved = parseFloat(String(line.reserved_amount ?? 0)) || 0;
  return Math.max(0, amount - consumed - reserved);
}

export function toBudgetCandidate(line: ApprovedBudgetLine): BudgetCandidate {
  return {
    budgetId: Number(line.id),
    budgetName: budgetDisplayName(line),
    segmentCode: line.segment_dtl_code ?? null,
    currency: line.budget_curr ?? null,
    availableAmount: budgetAvailableAmount(line),
    deptId: line.dept_id != null ? String(line.dept_id) : null,
    locId: line.loc_id != null ? String(line.loc_id) : null,
    businessEntity: line.business_entity != null ? String(line.business_entity) : null,
  };
}

export function uniqueBudgetLines(lines: ApprovedBudgetLine[]): ApprovedBudgetLine[] {
  const byId = new Map<string, ApprovedBudgetLine>();
  for (const line of lines) {
    const key = String(line.id);
    if (!byId.has(key)) byId.set(key, line);
  }
  return Array.from(byId.values());
}

export type BudgetMatchResult =
  | { status: "resolved"; budgetId: number; budgetName: string }
  | { status: "none"; query: string }
  | { status: "ambiguous"; query: string; candidates: BudgetCandidate[] };

/** True when query is a small 1-based list index (e.g. user replies "1" / "2"). */
export function isOrdinalChoice(query: string): number | null {
  const t = String(query || "").trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;
  return n;
}

/**
 * Resolve a user reply against the last ambiguous budget candidate list.
 * Accepts: ordinal ("1"), or budget line id ("58").
 */
/** Extract a budget line id from prompts like "Use budgetId 98" / "use budget ID 39". */
export function extractBudgetIdFromPrompt(text: string): number | null {
  const t = String(text || "").trim();
  if (!t) return null;
  const m =
    t.match(/\buse\s+budget\s*id\s+(\d+)\b/i) ||
    t.match(/\bbudget\s*id\s*[:=]?\s*(\d+)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function pickBudgetFromCandidates(
  query: string,
  candidates: BudgetCandidate[],
): BudgetCandidate | null {
  if (!candidates.length) return null;
  const q = String(query || "").trim();
  if (!q) return null;

  const ordinal = isOrdinalChoice(q);
  if (ordinal != null && ordinal <= candidates.length) {
    return candidates[ordinal - 1];
  }

  const fromPrompt = extractBudgetIdFromPrompt(q);
  if (fromPrompt != null) {
    return candidates.find((c) => c.budgetId === fromPrompt) || null;
  }

  const asId = parseCanonicalNumericId(q);
  if (asId != null) {
    return candidates.find((c) => c.budgetId === asId) || null;
  }

  return null;
}

export function matchBudget(lines: ApprovedBudgetLine[], query: string): BudgetMatchResult {
  const unique = uniqueBudgetLines(lines);
  const q = String(query || "").trim();

  // Direct numeric line id
  const asId = parseCanonicalNumericId(q);
  if (asId != null) {
    const found = unique.find((l) => Number(l.id) === asId);
    if (found) {
      return { status: "resolved", budgetId: Number(found.id), budgetName: budgetDisplayName(found) };
    }
  }

  const match = matchByLabels(unique, q, (l) => [
    budgetDisplayName(l),
    String(l.budget_name || ""),
    String(l.segment_dtl_name || ""),
    String(l.segment_dtl_code || ""),
  ]);

  return mapBudgetMatch(match, q);
}

function mapBudgetMatch(
  match: NameMatchResult<ApprovedBudgetLine>,
  query: string,
): BudgetMatchResult {
  if (match.status === "resolved") {
    return {
      status: "resolved",
      budgetId: Number(match.item.id),
      budgetName: budgetDisplayName(match.item),
    };
  }
  if (match.status === "ambiguous") {
    return {
      status: "ambiguous",
      query,
      candidates: match.candidates.map(toBudgetCandidate),
    };
  }
  return { status: "none", query };
}

export function findBudgetById(
  lines: ApprovedBudgetLine[],
  budgetId: number,
): BudgetCandidate | null {
  const found = uniqueBudgetLines(lines).find((l) => Number(l.id) === budgetId);
  if (!found) return null;
  return toBudgetCandidate(found);
}

function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  const cur = currency ? `${currency} ` : "";
  return `${cur}${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Ambiguity list with distinguishing fields so identical names are selectable. */
export function formatBudgetAmbiguity(query: string, candidates: BudgetCandidate[]): string {
  const lines = candidates.map((c, i) => {
    const parts: string[] = [`${i + 1}. **${c.budgetName}**`];
    parts.push(`budgetId: ${c.budgetId}`);
    if (c.segmentCode) parts.push(`code: ${c.segmentCode}`);
    const avail = formatMoney(c.availableAmount, c.currency);
    if (avail) parts.push(`available: ${avail}`);
    if (c.deptId) parts.push(`dept: ${c.deptId}`);
    if (c.locId) parts.push(`loc: ${c.locId}`);
    if (c.businessEntity) parts.push(`entity: ${c.businessEntity}`);
    return parts.join(" — ");
  });

  return (
    `I found multiple Budgets matching "${query}". Which one should I use?\n\n` +
    `${lines.join("\n")}\n\n` +
    `Reply with the **option number** (e.g. 1) or the **budgetId** (e.g. ${candidates[0]?.budgetId ?? "58"}). ` +
    `Names alone are not enough when options look identical.`
  );
}

export function formatBudgetNotFound(query: string): string {
  return formatNotFoundMessage("Budget", query);
}

/** Format a budget line for search_budgets tool output. */
export function formatBudgetSearchLine(line: ApprovedBudgetLine, index: number): string {
  const c = toBudgetCandidate(line);
  const parts: string[] = [`**${index}. ${c.budgetName}**`];
  parts.push(`budgetId: ${c.budgetId}`);
  if (c.segmentCode) parts.push(`code: ${c.segmentCode}`);
  const avail = formatMoney(c.availableAmount, c.currency);
  if (avail) parts.push(`available: ${avail}`);
  if (c.deptId) parts.push(`dept: ${c.deptId}`);
  if (c.locId) parts.push(`loc: ${c.locId}`);
  return parts.join(" — ");
}

// ─── Department (GET /api/cost-centers/3/items) ──────────────────────────────

export interface DepartmentRecord {
  id: number | string;
  code?: string | null;
  value?: string | null;
  status?: string | null;
}

export interface DepartmentCandidate {
  departmentId: number;
  departmentName: string;
  code?: string | null;
}

export type DepartmentMatchResult =
  | { status: "resolved"; departmentId: number; departmentName: string }
  | { status: "none"; query: string }
  | { status: "ambiguous"; query: string; candidates: DepartmentCandidate[] };

export function matchDepartment(
  depts: DepartmentRecord[],
  query: string,
): DepartmentMatchResult {
  const active = depts.filter((d) => !d.status || String(d.status).toUpperCase() === "Y");
  const q = String(query || "").trim();
  const asId = parseCanonicalNumericId(q);
  if (asId != null) {
    const found = active.find((d) => Number(d.id) === asId);
    if (found) {
      return {
        status: "resolved",
        departmentId: Number(found.id),
        departmentName: String(found.value || found.code || found.id).trim(),
      };
    }
  }

  const match = matchByLabels(active, q, (d) => [
    String(d.value || ""),
    String(d.code || ""),
  ]);

  if (match.status === "resolved") {
    return {
      status: "resolved",
      departmentId: Number(match.item.id),
      departmentName: String(match.item.value || match.item.code || match.item.id).trim(),
    };
  }
  if (match.status === "ambiguous") {
    return {
      status: "ambiguous",
      query: q,
      candidates: match.candidates.map((d) => ({
        departmentId: Number(d.id),
        departmentName: String(d.value || d.code || d.id).trim(),
        code: d.code ?? null,
      })),
    };
  }
  return { status: "none", query: q };
}

export function findDepartmentById(
  depts: DepartmentRecord[],
  departmentId: number,
): DepartmentCandidate | null {
  const found = depts.find((d) => Number(d.id) === departmentId);
  if (!found) return null;
  return {
    departmentId: Number(found.id),
    departmentName: String(found.value || found.code || found.id).trim(),
    code: found.code ?? null,
  };
}

export function formatDepartmentAmbiguity(
  query: string,
  candidates: DepartmentCandidate[],
): string {
  return formatAmbiguityMessage(
    "Departments",
    query,
    candidates.map((c) => c.departmentName),
  );
}

export function formatDepartmentNotFound(query: string): string {
  return formatNotFoundMessage("Department", query);
}

// ─── Delivery Location (GET /api/locations) ──────────────────────────────────

export interface LocationRecord {
  id: number | string;
  location_id?: string | null;
  location_name?: string | null;
  status?: string | null;
}

export interface LocationCandidate {
  locationId: number;
  locationName: string;
  locationCode?: string | null;
}

export type LocationMatchResult =
  | { status: "resolved"; locationId: number; locationName: string }
  | { status: "none"; query: string }
  | { status: "ambiguous"; query: string; candidates: LocationCandidate[] };

export function matchLocation(
  locations: LocationRecord[],
  query: string,
): LocationMatchResult {
  const active = locations.filter((l) => !l.status || String(l.status).toUpperCase() === "Y");
  const q = String(query || "").trim();
  const asId = parseCanonicalNumericId(q);
  if (asId != null) {
    const found = active.find((l) => Number(l.id) === asId);
    if (found) {
      return {
        status: "resolved",
        locationId: Number(found.id),
        locationName: String(found.location_name || found.location_id || found.id).trim(),
      };
    }
  }

  const match = matchByLabels(active, q, (l) => [
    String(l.location_name || ""),
    String(l.location_id || ""),
  ]);

  if (match.status === "resolved") {
    return {
      status: "resolved",
      locationId: Number(match.item.id),
      locationName: String(
        match.item.location_name || match.item.location_id || match.item.id,
      ).trim(),
    };
  }
  if (match.status === "ambiguous") {
    return {
      status: "ambiguous",
      query: q,
      candidates: match.candidates.map((l) => ({
        locationId: Number(l.id),
        locationName: String(l.location_name || l.location_id || l.id).trim(),
        locationCode: l.location_id ?? null,
      })),
    };
  }
  return { status: "none", query: q };
}

export function findLocationById(
  locations: LocationRecord[],
  locationId: number,
): LocationCandidate | null {
  const found = locations.find((l) => Number(l.id) === locationId);
  if (!found) return null;
  return {
    locationId: Number(found.id),
    locationName: String(found.location_name || found.location_id || found.id).trim(),
    locationCode: found.location_id ?? null,
  };
}

export function formatLocationAmbiguity(
  query: string,
  candidates: LocationCandidate[],
): string {
  return formatAmbiguityMessage(
    "Delivery Locations",
    query,
    candidates.map((c) => c.locationName),
  );
}

export function formatLocationNotFound(query: string): string {
  return formatNotFoundMessage("Delivery Location", query);
}

// ─── Payment Terms (GET /api/payment-terms) ──────────────────────────────────

export interface PaymentTermRecord {
  id: number | string;
  payment_term_id?: string | null;
  terms_name?: string | null;
  description?: string | null;
  status?: string | null;
}

export interface PaymentTermsCandidate {
  paymentTermsId: string;
  paymentTermsName: string;
  paymentTermCode?: string | null;
}

export type PaymentTermsMatchResult =
  | { status: "resolved"; paymentTermsId: string; paymentTermsName: string }
  | { status: "none"; query: string }
  | { status: "ambiguous"; query: string; candidates: PaymentTermsCandidate[] };

/** Canonical id sent by manual Create PO dropdown: String(pt.id). */
export function paymentTermsCanonicalId(pt: PaymentTermRecord): string {
  return String(pt.id);
}

export function matchPaymentTerms(
  terms: PaymentTermRecord[],
  query: string,
): PaymentTermsMatchResult {
  const active = terms.filter((t) => !t.status || String(t.status).toUpperCase() === "Y");
  const q = String(query || "").trim();

  // Match numeric row id or payment_term_id code exactly
  const asId = parseCanonicalNumericId(q);
  if (asId != null) {
    const byId = active.find((t) => Number(t.id) === asId);
    if (byId) {
      return {
        status: "resolved",
        paymentTermsId: paymentTermsCanonicalId(byId),
        paymentTermsName: String(byId.terms_name || byId.payment_term_id || byId.id).trim(),
      };
    }
  }
  const byCode = active.filter(
    (t) => String(t.payment_term_id || "").trim().toLowerCase() === q.toLowerCase(),
  );
  if (byCode.length === 1) {
    return {
      status: "resolved",
      paymentTermsId: paymentTermsCanonicalId(byCode[0]),
      paymentTermsName: String(byCode[0].terms_name || byCode[0].payment_term_id || byCode[0].id).trim(),
    };
  }

  const match = matchByLabels(active, q, (t) => [
    String(t.terms_name || ""),
    String(t.payment_term_id || ""),
    String(t.description || ""),
  ]);

  if (match.status === "resolved") {
    return {
      status: "resolved",
      paymentTermsId: paymentTermsCanonicalId(match.item),
      paymentTermsName: String(
        match.item.terms_name || match.item.payment_term_id || match.item.id,
      ).trim(),
    };
  }
  if (match.status === "ambiguous") {
    return {
      status: "ambiguous",
      query: q,
      candidates: match.candidates.map((t) => ({
        paymentTermsId: paymentTermsCanonicalId(t),
        paymentTermsName: String(t.terms_name || t.payment_term_id || t.id).trim(),
        paymentTermCode: t.payment_term_id ?? null,
      })),
    };
  }
  return { status: "none", query: q };
}

export function findPaymentTermsById(
  terms: PaymentTermRecord[],
  paymentTermsId: string | number,
): PaymentTermsCandidate | null {
  const idStr = String(paymentTermsId).trim();
  const found = terms.find(
    (t) =>
      String(t.id) === idStr ||
      String(t.payment_term_id || "").trim() === idStr,
  );
  if (!found) return null;
  return {
    paymentTermsId: paymentTermsCanonicalId(found),
    paymentTermsName: String(found.terms_name || found.payment_term_id || found.id).trim(),
    paymentTermCode: found.payment_term_id ?? null,
  };
}

/** Resolve Admin Payment Settings default (`default_paymentterms` ↔ payment_term_id). */
export function resolveDefaultPaymentTerms(
  terms: PaymentTermRecord[],
  defaultPaymentTermCode: string | null | undefined,
): PaymentTermsCandidate | null {
  const code = String(defaultPaymentTermCode || "").trim();
  if (!code) return null;
  const active = terms.filter((t) => !t.status || String(t.status).toUpperCase() === "Y");
  const found = active.find(
    (t) => String(t.payment_term_id || "").trim() === code,
  );
  if (!found) return null;
  return {
    paymentTermsId: paymentTermsCanonicalId(found),
    paymentTermsName: String(found.terms_name || found.payment_term_id || found.id).trim(),
    paymentTermCode: found.payment_term_id ?? null,
  };
}

export function formatPaymentTermsAmbiguity(
  query: string,
  candidates: PaymentTermsCandidate[],
): string {
  return formatAmbiguityMessage(
    "Payment Terms",
    query,
    candidates.map((c) => c.paymentTermsName),
  );
}

export function formatPaymentTermsNotFound(query: string): string {
  return formatNotFoundMessage("Payment Terms", query);
}

export { isCanonicalNumericId, parseCanonicalNumericId };
