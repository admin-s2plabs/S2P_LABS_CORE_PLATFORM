/**
 * Generic exact-then-partial name matching for Direct PO lookup fields.
 * Never invents IDs; never coerces arbitrary text to integers.
 */

export type NameMatchResult<T> =
  | { status: "resolved"; item: T }
  | { status: "none"; query: string }
  | { status: "ambiguous"; query: string; candidates: T[] };

/** True for integer-like ids (string or number), not names like "Mumbai" / "Net 30". */
export function isCanonicalNumericId(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value) && Number.isInteger(value);
  if (typeof value === "string") {
    const t = value.trim();
    if (!/^-?\d+$/.test(t)) return false;
    return Number.isFinite(Number(t));
  }
  return false;
}

export function parseCanonicalNumericId(value: unknown): number | null {
  if (!isCanonicalNumericId(value)) return null;
  return Number(value);
}

/**
 * Match query against items using one or more label strings per item.
 * Prefer exact case-insensitive label match, then substring match.
 */
export function matchByLabels<T>(
  items: T[],
  query: string,
  getLabels: (item: T) => string[],
): NameMatchResult<T> {
  const q = String(query || "").trim();
  const needle = q.toLowerCase();
  if (!needle) return { status: "none", query: q };

  const labeled = items.map((item) => ({
    item,
    labels: getLabels(item)
      .map((l) => String(l || "").trim())
      .filter(Boolean),
  })).filter((x) => x.labels.length > 0);

  const exact = labeled.filter((x) =>
    x.labels.some((l) => l.toLowerCase() === needle),
  );
  if (exact.length === 1) return { status: "resolved", item: exact[0].item };
  if (exact.length > 1) {
    return { status: "ambiguous", query: q, candidates: exact.map((x) => x.item) };
  }

  const partial = labeled.filter((x) =>
    x.labels.some((l) => l.toLowerCase().includes(needle)),
  );
  if (partial.length === 1) return { status: "resolved", item: partial[0].item };
  if (partial.length > 1) {
    return { status: "ambiguous", query: q, candidates: partial.map((x) => x.item) };
  }

  return { status: "none", query: q };
}

export function formatAmbiguityMessage(
  fieldLabel: string,
  query: string,
  names: string[],
): string {
  const lines = names.map((n, i) => `${i + 1}. **${n}**`).join("\n");
  return (
    `I found multiple ${fieldLabel} matching "${query}". Which one should I use?\n\n` +
    `${lines}\n\n` +
    `Reply with the ${fieldLabel.replace(/s$/, "")} name (you do not need the numeric ID).`
  );
}

export function formatNotFoundMessage(fieldLabel: string, query: string): string {
  return (
    `I couldn't find the ${fieldLabel} "${query}". ` +
    `Please provide a valid ${fieldLabel} name, or ask me to list available options.`
  );
}
