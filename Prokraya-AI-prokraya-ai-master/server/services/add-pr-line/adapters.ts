/**
 * Wires the add-line resolver to the services that already own each answer:
 * the requisition service for the PR, `storage` for the Item Master, and the
 * AI Assisted Service for the unit of measure. No lookup logic lives here —
 * this file only chooses which existing call answers which question.
 */

import { storage } from "../../storage";
import * as procService from "../../modules/procurement/procurement.service";
import {
  getAllowedUoms,
  getLastPurchasedPrice,
  predictQuantity,
  resolveAllowedUom,
  suggestItemsFromDescription,
} from "../pr-ai-service";
import { pickAiAssistedUom, type AddPrLineDeps, type ItemMasterRecord } from "./resolver";

const toItemMasterRecord = (item: {
  id: string;
  itemCode?: string | null;
  name?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  unitOfMeasure?: string | null;
  standardPrice?: number | null;
}): ItemMasterRecord => ({
  id: String(item.id),
  itemCode: item.itemCode ?? null,
  name: String(item.name ?? "").trim(),
  categoryCode: item.categoryCode ?? null,
  categoryName: item.categoryName ?? null,
  unitOfMeasure: item.unitOfMeasure ?? null,
  standardPrice: item.standardPrice ?? null,
});

const positive = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function createAddPrLineDeps(): AddPrLineDeps {
  return {
    async loadPrContext(prNumber) {
      const detail = await procService.getRequisitionDetail(prNumber);
      const header = (detail as any)?.header;
      if (!header) return null;
      return {
        prNumber: String(header.pr_number ?? prNumber),
        currency: String(header.currency ?? "").trim(),
        department: header.department_name ? String(header.department_name) : null,
        budgetLineId: positive(header.budget_segment),
      };
    },

    async searchItemMaster(query) {
      const items = await storage.searchItems(query);
      return items.map(toItemMasterRecord);
    },

    async getItemMasterById(itemId) {
      const item = await storage.getItem(itemId);
      return item ? toItemMasterRecord(item) : null;
    },

    /**
     * One call to the AI Assisted Service answers both questions it answers on
     * the PR screen. For the unit, `resolveAllowedUom` holds the model to the
     * UoM dropdown master; the catalog's own unit is passed only as the
     * fallback that helper already expects — it cannot displace a valid model
     * answer, and it is usually a code like "EA" that the master rejects, so an
     * unusable unit degrades to "Each" instead of reaching the line.
     *
     * The price the service returns has already been through its own
     * precedence — last purchase-order price, then catalog price, then an
     * estimate it flags. It only misses when its catalog search fails to
     * surface this item, so the deterministic tiers are repeated here off the
     * item id we already hold rather than left to a text search.
     */
    async assistItem(item, context) {
      const [allowedUoms, suggestions] = await Promise.all([
        getAllowedUoms().catch(() => [] as string[]),
        suggestItemsFromDescription(item.name, item.name, context.department ?? "").catch(
          () => [],
        ),
      ]);

      const uom = resolveAllowedUom(
        pickAiAssistedUom(suggestions, item.id),
        item.unitOfMeasure,
        allowedUoms,
      );

      const suggested = suggestions.find((suggestion) => suggestion.itemId === item.id);
      const suggestedPrice = positive(suggested?.unitPrice);
      if (suggestedPrice != null) {
        return { uom, unitPrice: suggestedPrice, priceAssumed: suggested!.priceAssumed };
      }

      const lastPoPrice = await getLastPurchasedPrice(item.id).catch(() => null);
      return {
        uom,
        unitPrice: positive(lastPoPrice) ?? positive(item.standardPrice),
        priceAssumed: false,
      };
    },

    /**
     * Wrapped because this service throws once its own retries are exhausted,
     * and a failed prediction should leave the quantity to the user rather than
     * failing the whole request.
     */
    async predictQuantity(item, context) {
      try {
        const prediction = await predictQuantity(
          item.name,
          context.department ?? "",
          undefined,
          context.budgetLineId,
        );
        const quantity = Number(prediction?.suggestedQuantity);
        return Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : null;
      } catch (error) {
        console.error("[add-pr-line] AI quantity prediction failed:", error);
        return null;
      }
    },
  };
}
