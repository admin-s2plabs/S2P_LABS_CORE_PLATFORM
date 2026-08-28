/**
 * Clickable multi-option disambiguation for the Procurement Ops Agent.
 * Emitted as pendingAction type "select_option" when ≥2 candidates match.
 */

export interface AgentChoiceOption {
  /** Stable id (budgetId, supplierId, orgId, …) — also used as React key. */
  id: string;
  /** Primary button / card label (human-readable name). */
  label: string;
  /** Sent as the next user message when the option is clicked. */
  prompt: string;
  /** Optional secondary line (amount, dept, loc, …). */
  description?: string;
}

export interface AgentChoiceSpec {
  /** Logical field being resolved. */
  field:
    | "budget"
    | "vendor"
    | "business_entity"
    | "department"
    | "location"
    | "payment_terms"
    | "buyer"
    | string;
  title: string;
  options: AgentChoiceOption[];
}

export function buildSelectOptionPendingAction(choice: AgentChoiceSpec): {
  type: "select_option";
  summary: string;
  data: AgentChoiceSpec;
} {
  return {
    type: "select_option",
    summary: choice.title,
    data: {
      field: choice.field,
      title: choice.title,
      options: choice.options,
    },
  };
}

export function isSelectOptionPendingAction(
  action: { type?: string; data?: unknown } | null | undefined,
): action is { type: "select_option"; summary: string; data: AgentChoiceSpec } {
  if (!action || action.type !== "select_option") return false;
  const data = action.data as AgentChoiceSpec | undefined;
  return !!data && Array.isArray(data.options) && data.options.length >= 2;
}

function formatMoney(amount: number | null | undefined, currency?: string | null): string | undefined {
  if (amount == null || !Number.isFinite(amount)) return undefined;
  const cur = currency ? `${currency} ` : "";
  return `${cur}${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Budget shortlist → clickable options (prompt uses budgetId so ordinal memory is not required). */
export function budgetChoiceFromCandidates(
  query: string,
  candidates: Array<{
    budgetId: number;
    budgetName: string;
    segmentCode?: string | null;
    currency?: string | null;
    availableAmount?: number | null;
    deptId?: string | null;
    locId?: string | null;
  }>,
): AgentChoiceSpec | null {
  if (candidates.length < 2) return null;
  return {
    field: "budget",
    title: `Choose a Budget matching "${query}"`,
    options: candidates.map((c, i) => {
      const parts: string[] = [];
      if (c.segmentCode) parts.push(`code ${c.segmentCode}`);
      const avail = formatMoney(c.availableAmount, c.currency);
      if (avail) parts.push(`available ${avail}`);
      if (c.deptId) parts.push(`dept ${c.deptId}`);
      if (c.locId) parts.push(`loc ${c.locId}`);
      return {
        id: String(c.budgetId),
        label: `${i + 1}. ${c.budgetName}`,
        description: parts.length ? parts.join(" · ") : undefined,
        prompt: `Use budgetId ${c.budgetId}`,
      };
    }),
  };
}

export function businessEntityChoiceFromCandidates(
  query: string,
  candidates: Array<{ id: number; name: string; currency?: string | null }>,
): AgentChoiceSpec | null {
  if (candidates.length < 2) return null;
  return {
    field: "business_entity",
    title: `Choose a Business Entity matching "${query}"`,
    options: candidates.map((c, i) => ({
      id: String(c.id),
      label: `${i + 1}. ${c.name}`,
      description: c.currency ? `Currency ${c.currency}` : undefined,
      prompt: `Use business entity ${c.name}`,
    })),
  };
}

export function departmentChoiceFromCandidates(
  query: string,
  candidates: Array<{ departmentId: number; departmentName: string; code?: string | null }>,
): AgentChoiceSpec | null {
  if (candidates.length < 2) return null;
  return {
    field: "department",
    title: `Choose a Department matching "${query}"`,
    options: candidates.map((c, i) => ({
      id: String(c.departmentId),
      label: `${i + 1}. ${c.departmentName}`,
      description: c.code ? `code ${c.code}` : undefined,
      prompt: `Use department ${c.departmentName}`,
    })),
  };
}

export function locationChoiceFromCandidates(
  query: string,
  candidates: Array<{ locationId: number; locationName: string; locationCode?: string | null }>,
): AgentChoiceSpec | null {
  if (candidates.length < 2) return null;
  return {
    field: "location",
    title: `Choose a Delivery Location matching "${query}"`,
    options: candidates.map((c, i) => ({
      id: String(c.locationId),
      label: `${i + 1}. ${c.locationName}`,
      description: c.locationCode ? `code ${c.locationCode}` : undefined,
      prompt: `Use delivery location ${c.locationName}`,
    })),
  };
}

export function paymentTermsChoiceFromCandidates(
  query: string,
  candidates: Array<{ paymentTermsId: string; paymentTermsName: string; paymentTermCode?: string | null }>,
): AgentChoiceSpec | null {
  if (candidates.length < 2) return null;
  return {
    field: "payment_terms",
    title: `Choose Payment Terms matching "${query}"`,
    options: candidates.map((c, i) => ({
      id: String(c.paymentTermsId),
      label: `${i + 1}. ${c.paymentTermsName}`,
      description: c.paymentTermCode ? `code ${c.paymentTermCode}` : undefined,
      prompt: `Use payment terms ${c.paymentTermsName}`,
    })),
  };
}

export function vendorChoiceFromRows(
  query: string,
  rows: Array<{ id: number | string; companyName?: string; company_name?: string; city?: string; country?: string }>,
): AgentChoiceSpec | null {
  if (rows.length < 2) return null;
  return {
    field: "vendor",
    title: query ? `Choose a Vendor matching "${query}"` : "Choose a Vendor",
    options: rows.slice(0, 20).map((s, i) => {
      const name = String(s.companyName || s.company_name || `Vendor ${s.id}`).trim();
      const loc = [s.city, s.country].filter(Boolean).join(", ");
      return {
        id: String(s.id),
        label: `${i + 1}. ${name}`,
        description: loc || undefined,
        prompt: `Use supplierId ${s.id} (${name})`,
      };
    }),
  };
}

export function buyerChoiceFromNames(names: string[]): AgentChoiceSpec | null {
  if (names.length < 2) return null;
  return {
    field: "buyer",
    title: "Choose a Buyer",
    options: names.map((n, i) => ({
      id: `buyer-${i}-${n}`,
      label: `${i + 1}. ${n}`,
      prompt: `Use buyer ${n}`,
    })),
  };
}
