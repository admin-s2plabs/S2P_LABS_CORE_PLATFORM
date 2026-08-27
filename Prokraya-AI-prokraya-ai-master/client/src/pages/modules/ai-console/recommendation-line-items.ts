/**
 * Line-item editing rules shared by the PR and PO recommendation cards.
 *
 * Pure by design: the cards own the React state and hand these functions the
 * current array, so the precedence and validation rules can be unit-tested
 * without rendering anything.
 */

import type { PrRecommendationLineItem } from "@shared/agent-pr-recommendation";

export interface MasterItem {
  id: string;
  itemCode?: string | null;
  name: string;
  categoryCode?: string | null;
  categoryName?: string | null;
  unitOfMeasure?: string | null;
  standardPrice?: number | null;
}

/** Raw input strings from the line-item row, before parsing. */
export interface LineItemPatch {
  quantity?: string;
  unitOfMeasure?: string;
  estimatedPrice?: string;
}

/** Unresolved keys that describe a line item rather than a header field. */
export const LINE_ITEM_FIELDS = ["lineItemQuantity", "lineItemDescription"] as const;

function isLineItemField(field: string): boolean {
  return (LINE_ITEM_FIELDS as readonly string[]).includes(field);
}

/**
 * Applies one row edit. A blank or non-positive quantity becomes null so the
 * line reads as incomplete rather than as an order for zero, and editing a
 * value clears the badge saying the engine guessed it.
 */
export function applyLineItemPatch(
  lineItems: PrRecommendationLineItem[],
  index: number,
  patch: LineItemPatch,
): PrRecommendationLineItem[] {
  return lineItems.map((item, i) => {
    if (i !== index) return item;
    const next = { ...item };
    if (patch.quantity !== undefined) {
      const parsed = Number(patch.quantity);
      next.quantity =
        patch.quantity.trim() === "" || !Number.isFinite(parsed) || parsed <= 0 ? null : parsed;
      next.quantityPredicted = false;
    }
    if (patch.unitOfMeasure !== undefined) {
      next.unitOfMeasure = patch.unitOfMeasure;
    }
    if (patch.estimatedPrice !== undefined) {
      const parsed = Number(patch.estimatedPrice);
      next.estimatedPrice =
        patch.estimatedPrice.trim() === "" || !Number.isFinite(parsed) || parsed < 0 ? 0 : parsed;
      next.priceAssumed = false;
    }
    return next;
  });
}

/**
 * Pins a catalog item onto a line. The master record wins for identity, unit
 * and price, but its price only replaces the current one when the catalog
 * actually has a price — otherwise an unpriced item would wipe a usable value.
 *
 * That carry-over only applies to a line that already named a catalog item.
 * Values sitting on an unmatched line describe the free text the user typed,
 * so replacing "Green Tea" with a real item must not leave Green Tea's unit or
 * price attached to it.
 */
export function applyMasterItemSelection(
  lineItems: PrRecommendationLineItem[],
  index: number,
  master: MasterItem,
): PrRecommendationLineItem[] {
  const price =
    master.standardPrice != null && Number.isFinite(Number(master.standardPrice))
      ? Number(master.standardPrice)
      : undefined;

  return lineItems.map((item, i) => {
    if (i !== index) return item;
    const carried = item.itemId ? item : null;
    return {
      ...item,
      itemId: master.id,
      itemCode: master.itemCode ?? undefined,
      description: master.name,
      categoryCode: master.categoryCode ?? undefined,
      categoryName: master.categoryName ?? undefined,
      unitOfMeasure: master.unitOfMeasure || carried?.unitOfMeasure || "Each",
      estimatedPrice: price ?? carried?.estimatedPrice ?? 0,
      priceAssumed: price != null ? false : carried?.priceAssumed ?? false,
      aiGenerated: false,
    };
  });
}

/** A line is submittable only once it names a real item master row. */
export function isLineItemComplete(item: PrRecommendationLineItem): boolean {
  return item.quantity != null && !!item.itemId && !!item.description.trim();
}

/** Which line-item problems the current rows have, as unresolved field keys. */
export function lineItemIssues(lineItems: PrRecommendationLineItem[]): string[] {
  const issues: string[] = [];
  if (lineItems.some((item) => item.quantity == null)) issues.push("lineItemQuantity");
  if (lineItems.some((item) => !item.itemId || !item.description.trim())) {
    issues.push("lineItemDescription");
  }
  return issues;
}

/**
 * Recomputes the create gate after a local line edit. Line-item keys are
 * rebuilt from the rows in hand rather than trusted from the server, which is
 * what lets the button react to an edit without another round trip.
 *
 * `extraReady` carries card-specific header requirements (the PO card's vendor
 * and payment terms) that are not expressible as unresolved keys alone.
 */
export function deriveLineState(
  base: { pendingChoice?: unknown; unresolved: string[] },
  lineItems: PrRecommendationLineItem[],
  extraReady = true,
): { unresolved: string[]; canCreate: boolean } {
  const headerUnresolved = base.unresolved.filter((field) => !isLineItemField(field));
  const issues = lineItemIssues(lineItems);
  return {
    unresolved: [...headerUnresolved, ...issues],
    canCreate:
      !base.pendingChoice &&
      extraReady &&
      lineItems.length > 0 &&
      issues.length === 0 &&
      headerUnresolved.length === 0,
  };
}
