/**
 * Real implementations of the recommendation ports.
 *
 * Kept separate from the recommenders so the pure logic never imports a
 * database or AI client, and tests can substitute fakes wholesale.
 */

import { getAIClient, getAIModelName } from "../ai-client";
import {
  getAllowedUoms,
  getLastPurchasedPrice,
  parseNaturalLanguageToItems,
  predictQuantity as predictQuantityService,
  resolveAllowedUom,
  suggestItemsFromDescription,
} from "../pr-ai-service";
import { storage } from "../../storage";
import {
  applyEstimatedPrices,
  lineItemsFromSuggestions,
  mergeParsedWithSuggestions,
  type CatalogEnrichment,
} from "./line-item-enricher";
import * as repo from "../../modules/procurement/pr-recommendation.repository";
import type {
  ActiveBuyer,
  AiLineItemPort,
  AiLineItemResult,
  BudgetLineCandidate,
  BudgetPort,
  BuyerFrequency,
  BuyerPort,
  ClockPort,
  IdName,
  LocationPort,
  PoHistoryPort,
  PoHistoryRow,
  PrRecommendationDeps,
  UserPort,
} from "./ports";
import type { PrRecommendationLineItem } from "@shared/agent-pr-recommendation";

function toIdNames(rows: Array<{ id: string | null; name: string | null }> | null): IdName[] {
  if (!rows) return [];
  return rows
    .filter((row) => row.id != null)
    .map((row) => ({ id: String(row.id), name: row.name ?? String(row.id) }));
}

function toBudgetCandidate(row: repo.ApprovedBudgetLineRow): BudgetLineCandidate {
  const entityId = row.business_entity_id != null ? Number(row.business_entity_id) : NaN;
  return {
    budgetLineId: Number(row.budget_line_id),
    budgetMasterId: Number(row.budget_master_id),
    budgetName: row.budget_name ?? "",
    costCentreCode: row.cost_centre_code,
    costCentreName: row.cost_centre_name,
    lineDescription: row.line_description,
    currency: row.currency,
    businessEntityId: Number.isFinite(entityId) ? entityId : null,
    businessEntityName: row.business_entity_name,
    approvedAt: row.approved_at ? new Date(row.approved_at) : null,
    departments: toIdNames(row.departments),
    locations: toIdNames(row.locations),
  };
}

export const budgetPort: BudgetPort = {
  async listApprovedBudgetLines() {
    const rows = await repo.listApprovedBudgetLines();
    return rows.map(toBudgetCandidate);
  },
  async getBudgetLineById(budgetLineId: number) {
    const row = await repo.getApprovedBudgetLineById(budgetLineId);
    return row ? toBudgetCandidate(row) : null;
  },
};

export const poHistoryPort: PoHistoryPort = {
  async findApprovedPoHistory({ keys, orgId, departmentName }) {
    const rows = await repo.findApprovedPoHistory({
      itemIds: keys.itemIds,
      categoryCodes: keys.categoryCodes,
      namePatterns: keys.namePatterns,
      orgId,
      departmentName,
    });
    return rows.map<PoHistoryRow>((row) => ({
      poNumber: row.po_number,
      createdDate: new Date(row.creation_date),
      requiredDate: new Date(row.po_required_date),
      orgId: row.org_id != null ? Number(row.org_id) : null,
      departmentName: row.department_name,
      // A non-numeric buyer column would otherwise become NaN and travel on as
      // the string "NaN", matching no user and no dropdown option.
      buyerId:
        row.buyer != null && String(row.buyer).trim() !== "" && Number.isFinite(Number(row.buyer))
          ? Number(row.buyer)
          : null,
      buyerName: row.buyer_name,
      deliveryLocationId: row.delivertto_location_id,
      deliveryLocationName: row.delivertto_location_name,
    }));
  },
};

export const buyerPort: BuyerPort = {
  async getBuyerAssignmentCounts(orgId) {
    const rows = await repo.getBuyerAssignmentCounts(orgId);
    return rows
      .filter((row) => row.user_id != null && row.user_id !== "" && Number.isFinite(Number(row.user_id)))
      .map<BuyerFrequency>((row) => ({
        userId: Number(row.user_id),
        name: row.name ?? `User ${row.user_id}`,
        count: Number(row.count),
      }));
  },
  async getActiveBuyers(orgId) {
    const rows = await repo.getActiveBuyers(orgId);
    return rows.map<ActiveBuyer>((row) => ({
      userId: Number(row.user_id),
      name: row.name ?? `User ${row.user_id}`,
      email: row.email_id,
    }));
  },
};

export const locationPort: LocationPort = {
  async listEntityLocations(orgId: number) {
    const rows = await repo.listEntityLocations(orgId);
    return rows
      .filter((row) => row.id != null)
      .map<IdName>((row) => ({ id: String(row.id), name: row.name ?? String(row.id) }));
  },
};

export const userPort: UserPort = {
  getDepartmentName: (userId: number) => repo.getUserDepartmentName(userId),
};

/**
 * Asks the model for a typical procurement lead time. Used only when no
 * historical purchase orders match, so a null result is expected and fine.
 */
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
    console.error("[pr-recommendation] AI lead time estimate failed:", error);
    return null;
  }
}

/** Matches the cap `aiAssistedLines` applies when adding suggestions to a PR. */
const SUGGESTION_FALLBACK_LIMIT = 3;

/**
 * Reads the unit and price for the catalog items the parser already matched.
 *
 * This is the reliable enrichment path: the suggestion service has to
 * rediscover items by substring-searching the request text, which misses
 * whenever punctuation or a long sentence mangles the search terms. An id
 * lookup cannot miss.
 */
async function loadCatalogEnrichment(itemIds: string[]): Promise<CatalogEnrichment[]> {
  const unique = Array.from(new Set(itemIds.filter(Boolean)));
  if (unique.length === 0) return [];

  const allowedUoms = await getAllowedUoms();

  const entries = await Promise.all(
    unique.map(async (itemId): Promise<CatalogEnrichment | null> => {
      try {
        const item = await storage.getItem(itemId);
        if (!item) return null;

        // Same precedence the AI Assisted button applies: the most recent real
        // purchase price, then the item master's standard price.
        const lastPoPrice = await getLastPurchasedPrice(itemId);
        const masterPrice = item.standardPrice != null && item.standardPrice > 0 ? item.standardPrice : null;

        return {
          itemId,
          itemCode: item.itemCode,
          // No candidate to weigh against the master here — the parser's unit is
          // unvalidated model output, so the catalog value is the only input.
          unitOfMeasure: resolveAllowedUom(null, item.unitOfMeasure, allowedUoms),
          unitPrice: lastPoPrice ?? masterPrice,
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
        };
      } catch (error) {
        console.error(`[pr-recommendation] Catalog lookup failed for item ${itemId}:`, error);
        return null;
      }
    }),
  );

  return entries.filter((entry): entry is CatalogEnrichment => entry !== null);
}

/**
 * Last-resort unit prices for items neither the catalog nor the suggestion
 * service could price, so no line reaches the review card showing nothing.
 * One batched call; returns nulls on any failure.
 */
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
    console.error("[pr-recommendation] AI unit price estimate failed:", error);
    return descriptions.map(() => null);
  }
}

export const aiLineItemPort: AiLineItemPort = {
  async generateLineItems(request: string, context): Promise<AiLineItemResult> {
    // Probe the client first: the pr-ai-service helpers swallow their errors and
    // return [], which would otherwise be indistinguishable from "no matches".
    try {
      await getAIClient();
    } catch (error) {
      console.error("[pr-recommendation] AI client unavailable:", error);
      return { lineItems: [], leadTimeDays: null, unavailable: true };
    }

    // The parser establishes what and how many, matching against the whole item
    // master, so it resolves an item id for most lines.
    const parsed = await parseNaturalLanguageToItems(request, { defaultQuantity: null });

    // The suggestion service is only needed for lines the parser could not
    // place in the catalog, and for the case where it parsed nothing at all.
    // Skipping it when every line already has an id saves an LLM round trip.
    const needsSuggestions = parsed.length === 0 || parsed.some((line) => !line.suggestedItemId);

    const [catalog, suggestions] = await Promise.all([
      loadCatalogEnrichment(parsed.map((line) => line.suggestedItemId ?? "")),
      needsSuggestions
        ? suggestItemsFromDescription(request, request, context.department ?? "")
        : Promise.resolve([]),
    ]);

    // Nothing parsed out of the free text — fall back to catalog suggestions,
    // capped the same way the AI Assisted button caps them.
    const merged: PrRecommendationLineItem[] = parsed.length > 0
      ? mergeParsedWithSuggestions(parsed, suggestions, catalog)
      : lineItemsFromSuggestions(suggestions.slice(0, SUGGESTION_FALLBACK_LIMIT));

    // A catalog item neither the catalog nor a suggestion could price gets an
    // AI estimate, flagged as assumed, rather than reaching the card as zero.
    // Lines that matched no catalog item are skipped: the user has to replace
    // them with a real item anyway, and a price guessed from their free text
    // would look authoritative and could follow them onto that replacement.
    const unpricedIndexes = merged
      .map((item, index) => (item.itemId && item.estimatedPrice <= 0 ? index : -1))
      .filter((index) => index >= 0);
    let lineItems = merged;
    if (unpricedIndexes.length > 0) {
      // No currency yet — it comes off the budget, which is matched later. The
      // suggestion service's own assumed prices are currency-agnostic too.
      const estimates = await estimateUnitPrices(unpricedIndexes.map((index) => merged[index].description));
      const aligned = merged.map(() => null as number | null);
      unpricedIndexes.forEach((mergedIndex, i) => {
        aligned[mergedIndex] = estimates[i];
      });
      lineItems = applyEstimatedPrices(merged, aligned);
    }

    const leadTimeDays = await estimateLeadTimeDays(lineItems.map((item) => item.description));
    return { lineItems, leadTimeDays, unavailable: false };
  },

  async predictQuantity({ description, department, budgetLineId }): Promise<number | null> {
    try {
      // Unlike the other pr-ai-service helpers this one throws after retrying,
      // and a failed prediction must not sink the whole recommendation.
      const prediction = await predictQuantityService(description, department, undefined, budgetLineId);
      const quantity = Number(prediction?.suggestedQuantity);
      return Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : null;
    } catch (error) {
      console.error("[pr-recommendation] AI quantity prediction failed:", error);
      return null;
    }
  },
};

export const clockPort: ClockPort = { now: () => new Date() };

export function createDefaultDeps(): PrRecommendationDeps {
  return {
    budgets: budgetPort,
    poHistory: poHistoryPort,
    buyers: buyerPort,
    locations: locationPort,
    users: userPort,
    aiLineItems: aiLineItemPort,
    clock: clockPort,
    log: (message, meta) => console.log(`[pr-recommendation] ${message}`, meta ?? ""),
  };
}
