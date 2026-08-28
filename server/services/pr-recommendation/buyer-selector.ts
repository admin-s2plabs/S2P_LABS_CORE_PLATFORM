/**
 * Picks a buyer from historical purchase orders, falling back to who does the
 * buying in this entity, and leaving the field for the user when neither
 * applies.
 *
 * There is no buyer-assignment table in the schema, so "assignment history" is
 * derived from how often each user appears as the buyer on approved POs and as
 * the owner of approved PRs.
 *
 * Every branch draws its answer from the same pool it offers as `options`. That
 * matters because the review card renders this as a dropdown: a value that is
 * not one of the options has no label to display, so the field renders blank
 * and the user is left with a silent, unexplained empty box. Historical POs can
 * name anyone — including people who have since left the procurement team — so
 * that pick is only honoured when the person is still selectable. When nothing
 * qualifies the field is deliberately left empty with the pool attached, which
 * blocks creation until the user chooses.
 */

import type { ActiveBuyer, BuyerFrequency, PoHistoryRow } from "./ports";
import type { PrRecommendationSource } from "@shared/agent-pr-recommendation";

export interface BuyerSelection {
  buyer: { id: string; name: string } | null;
  source: PrRecommendationSource;
  rationale: string;
  sampleSize?: number;
  options: Array<{ id: string; name: string }>;
}

/** Highest count wins; ties break by name then id so the result is stable. */
export function mostFrequent(
  frequencies: BuyerFrequency[],
  allowedIds?: Set<number>,
): BuyerFrequency | null {
  const eligible = allowedIds
    ? frequencies.filter((entry) => allowedIds.has(entry.userId))
    : frequencies;
  if (eligible.length === 0) return null;

  return [...eligible].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    if (byName !== 0) return byName;
    return a.userId - b.userId;
  })[0];
}

/** Rolls PO rows up into buyer frequencies, counting each PO once. */
export function buyerFrequencyFromPoHistory(rows: PoHistoryRow[]): BuyerFrequency[] {
  const counts = new Map<number, BuyerFrequency>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.buyerId == null) continue;
    if (seen.has(row.poNumber)) continue;
    seen.add(row.poNumber);
    const existing = counts.get(row.buyerId);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(row.buyerId, {
        userId: row.buyerId,
        name: row.buyerName ?? `User ${row.buyerId}`,
        count: 1,
      });
    }
  }
  return Array.from(counts.values());
}

function toOption(buyer: ActiveBuyer): { id: string; name: string } {
  return { id: String(buyer.userId), name: buyer.name };
}

const plural = (count: number) => (count === 1 ? "" : "s");

/** Walks the buyer ladder. Never returns a buyer that is absent from `options`. */
export function selectBuyer(params: {
  poHistory: PoHistoryRow[];
  entityPool: ActiveBuyer[];
  entityHistory: BuyerFrequency[];
  orgPool: ActiveBuyer[];
  orgHistory: BuyerFrequency[];
}): BuyerSelection {
  // The entity's own buyers when it has any, otherwise the whole organization.
  const tier = params.entityPool.length > 0
    ? { pool: params.entityPool, history: params.entityHistory, scope: "this business entity" }
    : { pool: params.orgPool, history: params.orgHistory, scope: "the organization" };

  if (tier.pool.length === 0) {
    return {
      buyer: null,
      source: "none",
      rationale:
        "No active procurement managers or officers are set up, so there is no one to assign as buyer.",
      options: [],
    };
  }

  const options = tier.pool.map(toOption);
  const allowedIds = new Set(tier.pool.map((buyer) => buyer.userId));

  const fromPo = mostFrequent(buyerFrequencyFromPoHistory(params.poHistory));
  if (fromPo && allowedIds.has(fromPo.userId)) {
    return {
      buyer: { id: String(fromPo.userId), name: fromPo.name },
      source: "po_history",
      rationale: `Buyer on ${fromPo.count} matching approved PO${plural(fromPo.count)}.`,
      sampleSize: fromPo.count,
      options,
    };
  }

  const fromAssignments = mostFrequent(tier.history, allowedIds);
  if (fromAssignments) {
    return {
      buyer: { id: String(fromAssignments.userId), name: fromAssignments.name },
      source: "po_history",
      rationale: `Most frequently assigned buyer in ${tier.scope} (${fromAssignments.count} assignment${plural(fromAssignments.count)}).`,
      sampleSize: fromAssignments.count,
      options,
    };
  }

  // Nothing defensible to propose. Naming who was passed over explains an
  // otherwise baffling empty field on a card that filled in everything else.
  return {
    buyer: null,
    source: "needs_selection",
    rationale: fromPo
      ? `${fromPo.name} is the buyer on ${fromPo.count} matching approved PO${plural(fromPo.count)} but is not an active procurement manager or officer for ${tier.scope} — please select a buyer from the list.`
      : "No buyer history for these items — please select a buyer from the list.",
    options,
  };
}
