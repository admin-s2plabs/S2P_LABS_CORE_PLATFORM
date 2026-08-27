/**
 * PO-facing adapter around the same catalog/AI resolution pipeline used when
 * the agent adds a line to a PR.
 *
 * This deliberately lives in the agent layer. The manual PO form and its API
 * keep their existing contract; only conversational adds get Item Master
 * matching, category metadata, AI-assisted UOM/price and quantity prediction.
 */

import {
  buildAddPrLineBody,
  formatAddPrLineConfirmation,
  formatAddPrLineResult,
  resolveAddPrLine,
  type AddPrLineDeps,
  type AddPrLineRejection,
  type ResolvedItemMention,
  type ResolvedPrLine,
} from "../add-pr-line/resolver";

export interface AddPoLineRequest {
  poNumber: string;
  itemDescription: string;
  quantity: number | null;
  unitPrice: number | null;
  taxRate?: number | null;
  itemMentions?: ResolvedItemMention[];
}

export interface ResolvedPoLine {
  poNumber: string;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  categoryCode: string | null;
  categoryName: string | null;
  uom: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  lineCost: number;
  taxRate: number;
  taxAmount: number;
  quantityPredicted: boolean;
  priceAssumed: boolean;
}

export type AddPoLineResolution =
  | { status: "resolved"; line: ResolvedPoLine }
  | { status: "rejected"; reason: AddPrLineRejection; message: string };

const validTaxRate = (value: unknown): number => {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const asPrLine = (line: ResolvedPoLine): ResolvedPrLine => ({
  prNumber: line.poNumber,
  itemId: line.itemId,
  itemCode: line.itemCode,
  itemName: line.itemName,
  categoryCode: line.categoryCode,
  categoryName: line.categoryName,
  uom: line.uom,
  quantity: line.quantity,
  unitCost: line.unitPrice,
  currency: line.currency,
  amount: line.lineCost,
  quantityPredicted: line.quantityPredicted,
  priceAssumed: line.priceAssumed,
});

/**
 * Reuses the PR resolver's precedence rules exactly. The supplied dependencies
 * load a PO context instead of a PR context, so currency, department and budget
 * come from the target PO while every item-related answer comes from the same
 * Item Master and AI services.
 */
export async function resolveAddPoLine(
  request: AddPoLineRequest,
  deps: AddPrLineDeps,
): Promise<AddPoLineResolution> {
  const resolution = await resolveAddPrLine(
    {
      prNumber: request.poNumber,
      itemDescription: request.itemDescription,
      quantity: request.quantity,
      unitCost: request.unitPrice,
      itemMentions: request.itemMentions,
    },
    deps,
  );

  if (resolution.status === "rejected") {
    const message =
      resolution.reason === "pr-not-found"
        ? `I couldn't find purchase order ${request.poNumber}. Please check the PO number and try again.`
        : resolution.message;
    return { ...resolution, message };
  }

  const taxRate = validTaxRate(request.taxRate);
  const lineCost = resolution.line.amount;
  return {
    status: "resolved",
    line: {
      poNumber: resolution.line.prNumber,
      itemId: resolution.line.itemId,
      itemCode: resolution.line.itemCode,
      itemName: resolution.line.itemName,
      categoryCode: resolution.line.categoryCode,
      categoryName: resolution.line.categoryName,
      uom: resolution.line.uom,
      quantity: resolution.line.quantity,
      unitPrice: resolution.line.unitCost,
      currency: resolution.line.currency,
      lineCost,
      taxRate,
      taxAmount: lineCost * (taxRate / 100),
      quantityPredicted: resolution.line.quantityPredicted,
      priceAssumed: resolution.line.priceAssumed,
    },
  };
}

export function formatAddPoLineConfirmation(line: ResolvedPoLine): string {
  return formatAddPrLineConfirmation(asPrLine(line))
    .replace(`Add Line Item to ${line.poNumber}`, `Add Line Item to ${line.poNumber}`)
    .replace("**Unit Cost:**", "**Unit Price:**")
    .replace("**Line Total:**", "**Line Cost:**")
    .replace(
      `_This line item will be added to ${line.poNumber} in ${line.currency}._`,
      `_This line item will be added to purchase order ${line.poNumber} in ${line.currency}._`,
    );
}

export function formatAddPoLineResult(line: ResolvedPoLine): string {
  return formatAddPrLineResult(asPrLine(line))
    .replace("**Unit Cost**:", "**Unit Price**:")
    .replace("**Total**:", "**Line Cost**:")
    .replace("this PR?", "this PO?");
}

/** Payload for the existing PO line service; no manual-flow code is changed. */
export function buildAddPoLineBody(line: ResolvedPoLine) {
  const shared = buildAddPrLineBody(asPrLine(line));
  return {
    description: shared.itemDescription,
    quantity: Number(shared.quantity),
    unitPrice: Number(shared.unitCost),
    uom: shared.uom,
    taxRate: line.taxRate,
    taxAmount: line.taxAmount,
    lineCost: line.lineCost,
    itemId: shared.itemId,
    itemName: line.itemName,
    categoryCode: shared.categoryId,
    categoryName: shared.categoryName,
  };
}
