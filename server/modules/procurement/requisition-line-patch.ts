/**
 * Turns a partial requisition-line edit into the full column set the line
 * UPDATE writes, and derives the line amount the way the Add/Edit Line Item
 * sheet does.
 *
 * `supp_pr_line_dtls` is updated by one statement that sets every editable
 * column, so a caller that only changes the quantity — the agent's "change the
 * quantity on PR_00076 to 20" tool — would otherwise blank the item
 * description, reset the unit cost to zero and drop the category. The same
 * shape as `purchase-order-line-patch`, minus the tax and discount columns a
 * requisition line does not carry.
 *
 * Two rules:
 *   - a key left off the patch keeps the value already on the row;
 *   - `amount` is recomputed from the merged quantity and unit cost, because a
 *     stale line amount is what makes the PR header total disagree with its
 *     lines.
 */

/** The `supp_pr_line_dtls` row, narrowed to the columns this update writes. */
export interface RequisitionLineRow {
  item_description?: string | null;
  qty?: number | string | null;
  uom?: string | null;
  unit_cost?: number | string | null;
  product_category?: number | string | null;
  product_category_name?: string | null;
  item_id?: number | string | null;
  curr_code?: string | null;
}

/** Only the fields the caller actually wants to change. */
export interface RequisitionLinePatch {
  description?: string | null;
  quantity?: number | string | null;
  unitCost?: number | string | null;
  uom?: string | null;
  itemId?: number | string | null;
  categoryCode?: number | string | null;
  categoryName?: string | null;
  currency?: string | null;
}

/** The column set `repo.updatePrLine` writes, less the row it is keyed by. */
export interface RequisitionLineUpdate {
  itemDescription: string;
  qty: number;
  uom: string;
  unitCost: number;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  itemId: string | null;
  currency: string;
}

const toId = (value: unknown): string | null => {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const toText = (value: unknown): string | null => {
  if (value == null) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
};

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function mergeRequisitionLine(
  existing: RequisitionLineRow,
  patch: RequisitionLinePatch,
  /** The PR header's currency, for a line that somehow stored none. */
  fallbackCurrency?: string | null,
): RequisitionLineUpdate {
  const qty = patch.quantity !== undefined ? toAmount(patch.quantity) : toAmount(existing.qty);
  const unitCost =
    patch.unitCost !== undefined ? toAmount(patch.unitCost) : toAmount(existing.unit_cost);

  return {
    itemDescription:
      patch.description !== undefined
        ? toText(patch.description) ?? ""
        : toText(existing.item_description) ?? "",
    qty,
    // The line-item dropdown has no empty option, so an unset unit stays "Each"
    // rather than being written blank.
    uom: (patch.uom !== undefined ? toText(patch.uom) : toText(existing.uom)) ?? "Each",
    unitCost,
    amount: qty * unitCost,
    categoryId:
      patch.categoryCode !== undefined ? toId(patch.categoryCode) : toId(existing.product_category),
    categoryName:
      patch.categoryName !== undefined
        ? toText(patch.categoryName)
        : toText(existing.product_category_name),
    itemId: patch.itemId !== undefined ? toId(patch.itemId) : toId(existing.item_id),
    currency:
      (patch.currency !== undefined ? toText(patch.currency) : toText(existing.curr_code)) ??
      toText(fallbackCurrency) ??
      "",
  };
}
