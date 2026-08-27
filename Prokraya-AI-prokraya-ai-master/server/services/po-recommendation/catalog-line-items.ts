/**
 * Direct PO line-item generation: extract phrases, then bind to item master
 * via keyword/fuzzy search + LLM MATCH/NO_MATCH. Used only by PO recommendation;
 * PR still uses parseNaturalLanguageToItems + suggestItemsFromDescription.
 */

import { getAIClient, getAIModelName } from "../ai-client";
import {
  getAllowedUoms,
  getLastPurchasedPrice,
  resolveAllowedUom,
} from "../pr-ai-service";
import { storage } from "../../storage";
import {
  applyEstimatedPrices,
  enrichParsedLine,
  type CatalogEnrichment,
  type ParsedLine,
} from "../pr-recommendation/line-item-enricher";
import type { AiLineItemResult } from "../pr-recommendation/ports";
import type { PrRecommendationLineItem } from "@shared/agent-pr-recommendation";
import {
  buildCatalogMatchValidatorPrompt,
  catalogFallbackSearchTerms,
  catalogSearchTerms,
  parseCatalogMatchDecision,
  rankCatalogCandidates,
  type CatalogSearchHit,
  type RankedCatalogCandidate,
} from "./catalog-item-matcher";

async function estimateLeadTimeDays(itemLabels: string[]): Promise<number | null> {
  if (itemLabels.length === 0) return null;
  try {
    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [
        {
          role: "user",
          content: `You are a procurement specialist. Estimate the typical end-to-end procurement lead time, in calendar days, from raising a purchase order to delivery for these items:

${itemLabels.map((label) => `- ${label}`).join("\n")}

Respond with ONLY a JSON object: {"leadTimeDays": <integer>}. If you cannot give a meaningful estimate, respond {"leadTimeDays": null}.`,
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 100,
    });
    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim());
    const days = Number(parsed?.leadTimeDays);
    return Number.isFinite(days) && days > 0 && days <= 365 ? Math.ceil(days) : null;
  } catch (error) {
    console.error("[po-recommendation] AI lead time estimate failed:", error);
    return null;
  }
}

async function loadCatalogEnrichment(itemIds: string[]): Promise<CatalogEnrichment[]> {
  const unique = Array.from(new Set(itemIds.filter(Boolean)));
  if (unique.length === 0) return [];

  const allowedUoms = await getAllowedUoms();

  const entries = await Promise.all(
    unique.map(async (itemId): Promise<CatalogEnrichment | null> => {
      try {
        const item = await storage.getItem(itemId);
        if (!item) return null;

        const lastPoPrice = await getLastPurchasedPrice(itemId);
        const masterPrice = item.standardPrice != null && item.standardPrice > 0 ? item.standardPrice : null;

        return {
          itemId,
          itemCode: item.itemCode,
          unitOfMeasure: resolveAllowedUom(null, item.unitOfMeasure, allowedUoms),
          unitPrice: lastPoPrice ?? masterPrice,
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
        };
      } catch (error) {
        console.error(`[po-recommendation] Catalog lookup failed for item ${itemId}:`, error);
        return null;
      }
    }),
  );

  return entries.filter((entry): entry is CatalogEnrichment => entry !== null);
}

async function estimateUnitPrices(descriptions: string[]): Promise<Array<number | null>> {
  if (descriptions.length === 0) return [];
  try {
    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [
        {
          role: "user",
          content: `You are a procurement specialist. Estimate a realistic unit price for each of these items:

${descriptions.map((description, index) => `${index + 1}. ${description}`).join("\n")}

Respond with ONLY a JSON object: {"prices": [<number or null>, ...]} with exactly ${descriptions.length} entries, in the same order. Use null for any item you cannot price.`,
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 300,
    });
    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim());
    const prices = Array.isArray(parsed?.prices) ? parsed.prices : [];
    return descriptions.map((_, index) => {
      const price = Number(prices[index]);
      return Number.isFinite(price) && price > 0 ? price : null;
    });
  } catch (error) {
    console.error("[po-recommendation] AI unit price estimate failed:", error);
    return descriptions.map(() => null);
  }
}

async function extractRequestedLineItems(request: string): Promise<ParsedLine[]> {
  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      {
        role: "user",
        content: `You are a procurement assistant. Extract purchase line items from this request. Do NOT match them to a catalog — only extract what the user asked for.

User request: "${request}"

For each distinct item:
1. description — short noun phrase (e.g. "laptop", "coffee mugs")
2. quantity — number if stated, otherwise null (do NOT invent a quantity)
3. unitOfMeasure — best guess like Each/Box/Set, default Each
4. estimatedPrice — 0 unless the user stated a unit price

Return ONLY a JSON array:
[{"description":"string","quantity":number|null,"unitOfMeasure":"string","estimatedPrice":number}]

If the request names nothing to buy, return [].`,
      },
    ],
    temperature: 0.2,
    max_completion_tokens: 800,
  });

  const content = response.choices[0]?.message?.content || "[]";
  const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item: any): ParsedLine | null => {
      const description = String(item?.description || "").trim();
      if (!description) return null;
      const qtyRaw = item?.quantity;
      const quantity =
        qtyRaw == null || qtyRaw === ""
          ? null
          : Number.isFinite(Number(qtyRaw)) && Number(qtyRaw) > 0
            ? Number(qtyRaw)
            : null;
      const estimatedPrice = Number(item?.estimatedPrice);
      return {
        description,
        quantity,
        unitOfMeasure: String(item?.unitOfMeasure || "Each").trim() || "Each",
        estimatedPrice: Number.isFinite(estimatedPrice) && estimatedPrice > 0 ? estimatedPrice : 0,
      };
    })
    .filter((line): line is ParsedLine => line != null);
}

async function collectCatalogSearchHits(phrase: string): Promise<CatalogSearchHit[]> {
  const terms = catalogSearchTerms(phrase);
  if (terms.length === 0) return [];

  const hits = await searchCatalogTerms(terms.slice(0, 5));
  if (hits.length > 0) return hits;
  return searchCatalogTerms(catalogFallbackSearchTerms(phrase).slice(0, 3));
}

async function searchCatalogTerms(terms: string[]): Promise<CatalogSearchHit[]> {
  if (terms.length === 0) return [];

  const batches = await Promise.all(
    terms.map(async (term) => {
      try {
        return await storage.searchItems(term);
      } catch (error) {
        console.error(`[po-recommendation] Item search failed for "${term}":`, error);
        return [];
      }
    }),
  );

  const hits: CatalogSearchHit[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      hits.push({
        id: String(item.id),
        itemCode: item.itemCode,
        name: item.name,
        description: item.description,
        categoryCode: item.categoryCode,
        categoryName: item.categoryName,
        unitOfMeasure: item.unitOfMeasure,
        standardPrice: item.standardPrice,
      });
    }
  }
  return hits;
}

async function llmValidateCatalogMatch(
  phrase: string,
  candidates: RankedCatalogCandidate[],
): Promise<string | null> {
  if (candidates.length === 0) return null;

  if (candidates.length === 1 && candidates[0].score >= 0.85) {
    return candidates[0].id;
  }

  try {
    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [{ role: "user", content: buildCatalogMatchValidatorPrompt(phrase, candidates) }],
      temperature: 0.1,
      max_completion_tokens: 120,
    });
    const decision = parseCatalogMatchDecision(
      response.choices[0]?.message?.content || "",
      candidates.map((c) => c.id),
    );
    return decision.decision === "MATCH" ? decision.itemId : null;
  } catch (error) {
    console.error(`[po-recommendation] Catalog match validator failed for "${phrase}":`, error);
    return null;
  }
}

/**
 * Keyword/fuzzy search → top-K → LLM MATCH/NO_MATCH. Returns a catalog item id
 * or null when nothing in the master should be bound (e.g. "mugs" with no hit).
 */
export async function matchItemFromMaster(phrase: string): Promise<string | null> {
  const trimmed = phrase.trim();
  if (!trimmed) return null;

  const hits = await collectCatalogSearchHits(trimmed);
  const candidates = rankCatalogCandidates(trimmed, hits);
  return llmValidateCatalogMatch(trimmed, candidates);
}

export async function generatePoLineItems(request: string): Promise<AiLineItemResult> {
  try {
    await getAIClient();
  } catch (error) {
    console.error("[po-recommendation] AI client unavailable:", error);
    return { lineItems: [], leadTimeDays: null, unavailable: true };
  }

  let extracted: ParsedLine[] = [];
  try {
    extracted = await extractRequestedLineItems(request);
  } catch (error) {
    console.error("[po-recommendation] Line extraction failed:", error);
    return { lineItems: [], leadTimeDays: null, unavailable: true };
  }

  if (extracted.length === 0) {
    return { lineItems: [], leadTimeDays: null, unavailable: false };
  }

  const matchedIds = await Promise.all(
    extracted.map((line) => matchItemFromMaster(line.description)),
  );

  const withMatches: ParsedLine[] = extracted.map((line, index) => {
    const itemId = matchedIds[index] ?? undefined;
    return itemId ? { ...line, suggestedItemId: itemId } : line;
  });

  const catalog = await loadCatalogEnrichment(
    withMatches.map((line) => line.suggestedItemId ?? "").filter(Boolean),
  );
  const byItemId = new Map(catalog.map((entry) => [entry.itemId, entry]));

  const merged: PrRecommendationLineItem[] = withMatches.map((line) => {
    const item = enrichParsedLine(
      line,
      null,
      line.suggestedItemId ? byItemId.get(line.suggestedItemId) ?? null : null,
    );
    // NO_MATCH: do not prefill free-text as if it were a catalog item.
    if (!item.itemId) {
      return {
        ...item,
        description: "",
        estimatedPrice: 0,
        priceAssumed: false,
        aiGenerated: true,
      };
    }
    return item;
  });

  const unpricedIndexes = merged
    .map((item, index) => (item.itemId && item.estimatedPrice <= 0 ? index : -1))
    .filter((index) => index >= 0);
  let lineItems = merged;
  if (unpricedIndexes.length > 0) {
    const estimates = await estimateUnitPrices(
      unpricedIndexes.map((index) => merged[index].description),
    );
    const aligned = merged.map(() => null as number | null);
    unpricedIndexes.forEach((mergedIndex, i) => {
      aligned[mergedIndex] = estimates[i];
    });
    lineItems = applyEstimatedPrices(merged, aligned);
  }

  const leadTimeDays = await estimateLeadTimeDays(lineItems.map((item) => item.description));
  return { lineItems, leadTimeDays, unavailable: false };
}
