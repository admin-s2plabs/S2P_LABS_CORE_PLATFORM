/**
 * Business Entity (organization) name → id matching for agent-side resolution.
 * Uses the same records as GET /api/organizations (adminService.getOrganizations).
 */

export interface OrganizationRecord {
  id: number | string;
  organization_name: string;
  currency?: string | null;
}

export interface BusinessEntityCandidate {
  id: number;
  name: string;
  currency?: string | null;
}

export type BusinessEntityMatchResult =
  | { status: "resolved"; orgId: number; orgName: string; currency?: string | null }
  | { status: "none"; query: string }
  | { status: "ambiguous"; query: string; candidates: BusinessEntityCandidate[] };

function toCandidate(o: OrganizationRecord): BusinessEntityCandidate {
  return {
    id: Number(o.id),
    name: String(o.organization_name || "").trim(),
    currency: o.currency ?? null,
  };
}

/**
 * Match a user-provided Business Entity name against organization records.
 * Prefers exact case-insensitive name match; falls back to substring match.
 * Never invents an id. Never coerces arbitrary text to an integer.
 */
export function matchBusinessEntityByName(
  orgs: OrganizationRecord[],
  name: string,
): BusinessEntityMatchResult {
  const query = String(name || "").trim();
  const needle = query.toLowerCase();
  if (!needle) return { status: "none", query };

  const withNames = orgs.filter((o) => String(o.organization_name || "").trim().length > 0);

  const exact = withNames.filter(
    (o) => String(o.organization_name).trim().toLowerCase() === needle,
  );
  if (exact.length === 1) {
    const c = toCandidate(exact[0]);
    return { status: "resolved", orgId: c.id, orgName: c.name, currency: c.currency };
  }
  if (exact.length > 1) {
    return { status: "ambiguous", query, candidates: exact.map(toCandidate) };
  }

  const partial = withNames.filter((o) =>
    String(o.organization_name).toLowerCase().includes(needle),
  );
  if (partial.length === 1) {
    const c = toCandidate(partial[0]);
    return { status: "resolved", orgId: c.id, orgName: c.name, currency: c.currency };
  }
  if (partial.length > 1) {
    return { status: "ambiguous", query, candidates: partial.map(toCandidate) };
  }

  return { status: "none", query };
}

/** True only for a finite numeric organization id (not a name like "ProductionQA"). */
export function isNumericOrgId(value: unknown): value is number | string {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value) && Number.isInteger(value);
  if (typeof value === "string") {
    const t = value.trim();
    if (!/^-?\d+$/.test(t)) return false;
    const n = Number(t);
    return Number.isFinite(n);
  }
  return false;
}

export function parseNumericOrgId(value: unknown): number | null {
  if (!isNumericOrgId(value)) return null;
  return Number(value);
}

/** Find org by numeric id; returns null if not found. */
export function findOrganizationById(
  orgs: OrganizationRecord[],
  orgId: number,
): BusinessEntityCandidate | null {
  const found = orgs.find((o) => Number(o.id) === orgId);
  return found ? toCandidate(found) : null;
}

export function formatBusinessEntityAmbiguityMessage(
  query: string,
  candidates: BusinessEntityCandidate[],
): string {
  const lines = candidates.map((c, i) => `${i + 1}. **${c.name}**`).join("\n");
  return (
    `I found multiple Business Entities matching "${query}". Which one should I use?\n\n` +
    `${lines}\n\n` +
    `Reply with the Business Entity name (you do not need the numeric ID).`
  );
}

export function formatBusinessEntityNotFoundMessage(query: string): string {
  return (
    `I couldn't find the Business Entity "${query}". ` +
    `Please provide a valid Business Entity name, or ask me to list available entities.`
  );
}
