/**
 * Resolves department and delivery location from a matched budget line.
 *
 * Budget lines are mapped to departments and locations many-to-many, and in
 * practice most approved lines map to every department in the organization —
 * so the map is treated as the *allowed set*, not the answer. Resolution walks
 * a fixed ladder and never picks randomly: the same inputs always produce the
 * same value, which matters because department feeds the need-by date and the
 * buyer, and those must not shuffle when an unrelated field is edited.
 */

import type { IdName, PoHistoryRow } from "./ports";
import type { PrRecommendationSource } from "@shared/agent-pr-recommendation";

export interface FieldResolution {
  value: IdName | null;
  source: PrRecommendationSource;
  rationale: string;
  sampleSize?: number;
  options: IdName[];
}

/** Case-insensitive name order, with id as a stable final tiebreak. */
export function sortByName(values: IdName[]): IdName[] {
  return [...values].sort((a, b) => {
    const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Counts occurrences of a label across PO history and returns the most frequent
 * that is also in the allowed set. Frequency ties break alphabetically so the
 * result never depends on row order.
 */
function mostFrequentAllowed(
  labels: Array<string | null>,
  allowed: IdName[],
): { match: IdName; count: number } | null {
  if (allowed.length === 0) return null;

  const counts = new Map<string, number>();
  for (const label of labels) {
    if (!label) continue;
    const match = allowed.find((option) => sameName(option.name, label));
    if (!match) continue;
    counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best: { match: IdName; count: number } | null = null;
  for (const option of sortByName(allowed)) {
    const count = counts.get(option.id) ?? 0;
    if (count === 0) continue;
    if (!best || count > best.count) best = { match: option, count };
  }
  return best;
}

/**
 * Department ladder: sole mapped department, then the requesting user's own
 * department, then the department most used on matching historical POs, then
 * first alphabetically.
 */
export function resolveDepartment(params: {
  allowed: IdName[];
  userDepartment: string | null;
  poHistory: PoHistoryRow[];
}): FieldResolution {
  const options = sortByName(params.allowed);

  if (options.length === 0) {
    return {
      value: null,
      source: "none",
      rationale: "The selected budget line is not mapped to any department.",
      options,
    };
  }

  if (options.length === 1) {
    return {
      value: options[0],
      source: "single_option",
      rationale: "The selected budget line is mapped to only this department.",
      options,
    };
  }

  const userMatch = options.find((option) => sameName(option.name, params.userDepartment));
  if (userMatch) {
    return {
      value: userMatch,
      source: "user_profile",
      rationale: "Your own department, which this budget line allows.",
      options,
    };
  }

  const historical = mostFrequentAllowed(
    params.poHistory.map((row) => row.departmentName),
    options,
  );
  if (historical) {
    return {
      value: historical.match,
      source: "po_history",
      rationale: `Most common department for this item across ${historical.count} approved PO${historical.count === 1 ? "" : "s"}.`,
      sampleSize: historical.count,
      options,
    };
  }

  return {
    value: options[0],
    source: "alphabetical",
    rationale: "No department signal available; defaulted to the first allowed department.",
    options,
  };
}

/**
 * Location ladder: sole mapped location, then the location most used on
 * matching historical POs, then the entity's locations when the budget line
 * maps none, then first alphabetically.
 */
export function resolveDeliveryLocation(params: {
  allowed: IdName[];
  poHistory: PoHistoryRow[];
  entityLocations: IdName[];
}): FieldResolution {
  const options = sortByName(params.allowed);

  if (options.length === 0) {
    const entityOptions = sortByName(params.entityLocations);
    if (entityOptions.length === 0) {
      return {
        value: null,
        source: "none",
        rationale: "No delivery locations are configured for this business entity.",
        options: entityOptions,
      };
    }
    const historical = mostFrequentAllowed(
      params.poHistory.map((row) => row.deliveryLocationName),
      entityOptions,
    );
    if (historical) {
      return {
        value: historical.match,
        source: "po_history",
        rationale: `Budget line maps no location; most common on ${historical.count} approved PO${historical.count === 1 ? "" : "s"}.`,
        sampleSize: historical.count,
        options: entityOptions,
      };
    }
    return {
      value: entityOptions[0],
      source: "entity_default",
      rationale: "Budget line maps no location; defaulted to the entity's first location.",
      options: entityOptions,
    };
  }

  if (options.length === 1) {
    return {
      value: options[0],
      source: "single_option",
      rationale: "The selected budget line is mapped to only this location.",
      options,
    };
  }

  const historical = mostFrequentAllowed(
    params.poHistory.map((row) => row.deliveryLocationName),
    options,
  );
  if (historical) {
    return {
      value: historical.match,
      source: "po_history",
      rationale: `Most common delivery location across ${historical.count} approved PO${historical.count === 1 ? "" : "s"}.`,
      sampleSize: historical.count,
      options,
    };
  }

  return {
    value: options[0],
    source: "alphabetical",
    rationale: "No delivery signal available; defaulted to the first allowed location.",
    options,
  };
}
