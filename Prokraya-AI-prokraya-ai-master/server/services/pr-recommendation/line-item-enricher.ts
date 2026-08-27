/**
 * Decides the unit of measure and unit price for each line the parser produced.
 *
 * The parser knows *what* the user asked for and *how many*, but leaves an
 * unvalidated unit like "EA" and a zero price whenever the item master has no
 * standard price. Business data comes from two other sources, in this order:
 *
 *   1. Catalog lookup by the item id the parser already matched. Deterministic,
 *      and the only source that cannot miss.
 *   2. The AI suggestion service, for lines the parser could not match to a
 *      catalog item. It narrows the catalog with a substring search over the
 *      request text, so it silently misses items whenever punctuation or a long
 *      sentence mangles the search terms — which is why it is second, not first.
 *   3. The parser's own values, as the floor — but only once some source has
 *      placed the line in the catalog. A line matching no item gets neither a
 *      unit nor a price.
 *
 * Pure by design: every input is an already-fetched result, so the precedence
 * is unit-testable without a database or an AI client.
 */

import type { PrRecommendationLineItem } from "@shared/agent-pr-recommendation";
import { similarity } from "./text-match";

/** The parser's shape, restated so this module doesn't depend on pr-ai-service. */
export interface ParsedLine {
  description: string;
  quantity: number | null;
  unitOfMeasure: string;
  estimatedPrice: number;
  suggestedItemId?: string;
  suggestedItemCode?: string;
  categoryCode?: string;
  categoryName?: string;
}

/** The suggestion service's shape, restated for the same reason. */
export interface SuggestedLine {
  itemId: string;
  itemCode: string;
  name: string;
  unitPrice: number;
  priceAssumed: boolean;
  unitOfMeasure: string;
  categoryCode: string | null;
  categoryName: string | null;
}

/**
 * Unit and price read straight from the catalog for one item id, with the price
 * already resolved through last-purchase-order-price then item master price.
 * A null price means the catalog knows the item but has never priced it.
 */
export interface CatalogEnrichment {
  itemId: string;
  itemCode?: string | null;
  unitOfMeasure: string;
  unitPrice: number | null;
  categoryCode?: string | null;
  categoryName?: string | null;
}

/**
 * Minimum name similarity before a suggestion is accepted as describing the
 * same thing as a parsed line. Suggestions are ranked by relevance to the whole
 * request, so the top one is often a plausible-but-different item; without a
 * floor, a request for laptops would borrow a monitor's price.
 */
export const ENRICHMENT_MATCH_FLOOR = 0.5;

/**
 * Finds the suggestion describing the same item as `parsed`, or null.
 * Exact item id wins; otherwise the best name match above the floor.
 */
export function findMatchingSuggestion(
  parsed: ParsedLine,
  suggestions: SuggestedLine[],
): SuggestedLine | null {
  if (parsed.suggestedItemId) {
    const exact = suggestions.find((entry) => entry.itemId === parsed.suggestedItemId);
    if (exact) return exact;
  }

  let best: SuggestedLine | null = null;
  let bestScore = 0;
  for (const suggestion of suggestions) {
    const score = similarity(parsed.description, suggestion.name);
    if (score > bestScore) {
      bestScore = score;
      best = suggestion;
    }
  }

  return bestScore >= ENRICHMENT_MATCH_FLOOR ? best : null;
}

/**
 * Applies enrichment to one parsed line. The parser stays authoritative for
 * what the user asked for and how many; the other sources supply only the unit
 * and the price, and never blank out a value the parser already resolved.
 *
 * A line that matched no catalog item is the exception: it is a placeholder the
 * user must replace before the requisition can be created, so it carries no
 * unit and no price at all. Both would be model output about free text — an
 * unvalidated unit like "EA" and a guessed price — which reads as real data on
 * the card and would otherwise survive onto whichever item is chosen later.
 */
export function enrichParsedLine(
  parsed: ParsedLine,
  suggestion: SuggestedLine | null,
  catalog?: CatalogEnrichment | null,
): PrRecommendationLineItem {
  const matchedItemId = parsed.suggestedItemId ?? catalog?.itemId ?? suggestion?.itemId;

  if (!matchedItemId) {
    return {
      description: parsed.description,
      quantity: parsed.quantity,
      unitOfMeasure: "",
      estimatedPrice: 0,
      categoryCode: parsed.categoryCode ?? undefined,
      categoryName: parsed.categoryName ?? undefined,
      aiGenerated: true,
      priceAssumed: false,
    };
  }

  const catalogPrice = catalog?.unitPrice != null && catalog.unitPrice > 0 ? catalog.unitPrice : null;
  const suggestionPrice = suggestion && suggestion.unitPrice > 0 ? suggestion.unitPrice : null;
  const parsedPrice = parsed.estimatedPrice > 0 ? parsed.estimatedPrice : null;
  const estimatedPrice = catalogPrice ?? suggestionPrice ?? parsedPrice ?? 0;

  // A catalog price is a real purchase or master price; a suggestion price may
  // be the model's guess, which the suggestion service flags for us.
  const priceAssumed = catalogPrice != null
    ? false
    : suggestionPrice != null
      ? suggestion!.priceAssumed
      : estimatedPrice <= 0;

  return {
    description: parsed.description,
    quantity: parsed.quantity,
    unitOfMeasure: catalog?.unitOfMeasure || suggestion?.unitOfMeasure || parsed.unitOfMeasure,
    estimatedPrice,
    itemId: matchedItemId,
    itemCode: parsed.suggestedItemCode ?? catalog?.itemCode ?? suggestion?.itemCode ?? undefined,
    categoryCode: parsed.categoryCode ?? catalog?.categoryCode ?? suggestion?.categoryCode ?? undefined,
    categoryName: parsed.categoryName ?? catalog?.categoryName ?? suggestion?.categoryName ?? undefined,
    aiGenerated: false,
    priceAssumed,
  };
}

export function mergeParsedWithSuggestions(
  parsed: ParsedLine[],
  suggestions: SuggestedLine[],
  catalog: CatalogEnrichment[] = [],
): PrRecommendationLineItem[] {
  const byItemId = new Map(catalog.map((entry) => [entry.itemId, entry]));
  return parsed.map((line) =>
    enrichParsedLine(
      line,
      findMatchingSuggestion(line, suggestions),
      line.suggestedItemId ? byItemId.get(line.suggestedItemId) ?? null : null,
    ),
  );
}

/**
 * Fills in prices for lines no catalog or suggestion could price, from a
 * position-aligned list of AI estimates. Anything already priced is left alone,
 * so a real price is never replaced by a guess.
 */
export function applyEstimatedPrices(
  lineItems: PrRecommendationLineItem[],
  estimates: Array<number | null>,
): PrRecommendationLineItem[] {
  return lineItems.map((item, index) => {
    const estimate = estimates[index];
    if (item.estimatedPrice > 0 || estimate == null || estimate <= 0) return item;
    return { ...item, estimatedPrice: estimate, priceAssumed: true };
  });
}

/**
 * Converts suggestions straight into line items. Used when the parser found
 * nothing in the free text, so there is no quantity to preserve and the user
 * must confirm one.
 */
export function lineItemsFromSuggestions(suggestions: SuggestedLine[]): PrRecommendationLineItem[] {
  return suggestions.map((suggestion) => ({
    description: suggestion.name,
    quantity: null,
    unitOfMeasure: suggestion.unitOfMeasure,
    estimatedPrice: suggestion.unitPrice,
    itemId: suggestion.itemId,
    itemCode: suggestion.itemCode,
    categoryCode: suggestion.categoryCode ?? undefined,
    categoryName: suggestion.categoryName ?? undefined,
    aiGenerated: false,
    priceAssumed: suggestion.priceAssumed,
  }));
}
