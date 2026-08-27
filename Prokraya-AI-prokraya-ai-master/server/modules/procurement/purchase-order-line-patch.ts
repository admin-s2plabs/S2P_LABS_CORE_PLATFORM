/**
 * Turns a partial purchase-order-line edit into the full column set the line
 * UPDATE writes, and derives the money columns the way the edit sheet does.
 *
 * `supp_po_line_dtls` is updated by one statement that sets every editable
 * column, so a caller that only changes the quantity — the agent's "change line
 * 1 to 5 laptops" tool — would otherwise wipe the item, the category and the tax
 * code, and leave `line_cost` describing the old quantity.
 *
 * Two rules, then:
 *   - a key left off the patch keeps the value already on the row;
 *   - `line_cost` and `tax_amount` are recomputed from the merged quantity,
 *     unit price, discount and tax rate, because they are derived values and a
 *     stale total is what makes the PO header totals disagree with its lines.
 *
 * A caller that has already done that arithmetic itself can pass `lineCost` /
 * `taxAmount` explicitly and they win — that is the tax-inclusive path, where
 * the edit sheet works backwards from a gross line total instead.
 */

/** The `supp_po_line_dtls` row, narrowed to the columns this update writes. */
export interface PurchaseOrderLineRow {
  line_description?: string | null;
  line_qty?: number | string | null;
  line_unit_cost?: number | string | null;
  line_unit?: string | null;
  tax_rate?: number | string | null;
  tax_amount?: number | string | null;
  line_cost?: number | string | null;
  item_id?: number | string | null;
  item_name?: string | null;
  product_category?: number | string | null;
  product_category_name?: string | null;
  discount?: number | string | null;
  tax_rate_code?: string | null;
  /** Where the tax id lives on this table. */
  attribute_15?: number | string | null;
}

/** Only the fields the caller actually wants to change. */
export interface PurchaseOrderLinePatch {
  description?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  uom?: string | null;
  taxRate?: number | string | null;
  discount?: number | string | null;
  /** item_id + item_name. */
  item?: { id: number | string | null; name: string | null };
  /** product_category + product_category_name. */
  category?: { code: number | string | null; name: string | null };
  taxCode?: string | null;
  taxId?: number | string | null;
  /** Overrides the derived net line cost (tax-inclusive POs). */
  lineCost?: number | string | null;
  /** Overrides the derived tax amount (tax-inclusive POs). */
  taxAmount?: number | string | null;
}

/** The column set `repo.updatePoLine` writes, less the row it is keyed by. */
export interface PurchaseOrderLineUpdate {
  description: string;
  quantity: number;
  unitPrice: number;
  uom: string;
  taxRate: number;
  taxAmount: number;
  lineCost: number;
  itemId: string | null;
  itemName: string | null;
  categoryCode: number | null;
  categoryName: string | null;
  discount: number;
  taxCode: string | null;
  taxId: string | null;
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

const toRequiredText = (value: unknown): string => toText(value) ?? "";

const toNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toAmount = (value: unknown): number => toNumber(value) ?? 0;

/**
 * The same arithmetic as the Add/Edit Line Item sheet: discount is per unit, and
 * `line_cost` is net of tax because the header total is net + tax.
 */
export function derivePoLineAmounts(input: {
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
}): { lineCost: number; taxAmount: number } {
  const lineCost = Math.max(0, input.quantity * input.unitPrice - input.quantity * input.discount);
  return { lineCost, taxAmount: lineCost * (input.taxRate / 100) };
}

export function mergePurchaseOrderLine(
  existing: PurchaseOrderLineRow,
  patch: PurchaseOrderLinePatch,
): PurchaseOrderLineUpdate {
  const quantity =
    patch.quantity !== undefined ? toAmount(patch.quantity) : toAmount(existing.line_qty);
  const unitPrice =
    patch.unitPrice !== undefined ? toAmount(patch.unitPrice) : toAmount(existing.line_unit_cost);
  const discount =
    patch.discount !== undefined ? toAmount(patch.discount) : toAmount(existing.discount);
  const taxRate = patch.taxRate !== undefined ? toAmount(patch.taxRate) : toAmount(existing.tax_rate);

  const derived = derivePoLineAmounts({ quantity, unitPrice, discount, taxRate });

  return {
    description:
      patch.description !== undefined
        ? toRequiredText(patch.description)
        : toRequiredText(existing.line_description),
    quantity,
    unitPrice,
    uom: patch.uom !== undefined ? toRequiredText(patch.uom) : toRequiredText(existing.line_unit),
    taxRate,

    lineCost: patch.lineCost !== undefined ? toAmount(patch.lineCost) : derived.lineCost,
    taxAmount: patch.taxAmount !== undefined ? toAmount(patch.taxAmount) : derived.taxAmount,

    // Id and name describe one catalog item, so they move together or not at all.
    itemId: patch.item ? toId(patch.item.id) : toId(existing.item_id),
    itemName: patch.item ? toText(patch.item.name) : toText(existing.item_name),

    categoryCode: patch.category
      ? toNumber(patch.category.code)
      : toNumber(existing.product_category),
    categoryName: patch.category
      ? toText(patch.category.name)
      : toText(existing.product_category_name),

    discount,
    taxCode: patch.taxCode !== undefined ? toText(patch.taxCode) : toText(existing.tax_rate_code),
    taxId: patch.taxId !== undefined ? toId(patch.taxId) : toId(existing.attribute_15),
  };
}
