/**
 * Turns a partial purchase-order-header edit into the full column set the header
 * UPDATE writes.
 *
 * `supp_po_header_dtls` is updated by one statement that sets all eighteen
 * editable columns at once. That suits the Edit Purchase Order sheet, which
 * posts the whole form back, but any caller that changes one field — the agent's
 * "change the supplier" tool, for instance — used to blank the rest: an omitted
 * field resolved to null, `advance_flag` collapsed to "N" and the currency fell
 * back to a hardcoded AED.
 *
 * So every column here is either the value the caller supplied or the value
 * already on the row. A key left off the patch means "leave it alone"; a key
 * present with null (or the empty string the sheet posts for a cleared select)
 * means "clear it".
 *
 * Pure by design: the caller resolves ids to names against the database first
 * and hands the results in, so the merge itself is testable on its own.
 */

/** The `supp_po_header_dtls` row, narrowed to the columns this update writes. */
export interface PurchaseOrderHeaderRow {
  po_description?: string | null;
  delivertto_location_id?: number | string | null;
  delivertto_location_name?: string | null;
  po_required_date?: Date | string | null;
  po_owner_id?: number | string | null;
  po_owner_name?: string | null;
  department_name?: string | null;
  supplier_id?: number | string | null;
  company_name?: string | null;
  po_currency?: string | null;
  budget_name?: string | null;
  po_payment_terms_id?: number | string | null;
  payment_terms_name?: string | null;
  po_notes?: string | null;
  advance_flag?: string | null;
  advance_percentage?: number | string | null;
  org_id?: number | string | null;
  budget_segment?: number | string | null;
}

/** Only the fields the caller actually wants to change. */
export interface PurchaseOrderHeaderPatch {
  description?: string | null;
  /** delivertto_location_id + delivertto_location_name. */
  location?: { id: number | string | null; name: string | null };
  requiredDate?: Date | string | null;
  /** po_owner_id + po_owner_name — the PO's requestor. */
  requestor?: { id: number | string | null; name: string | null };
  departmentName?: string | null;
  /** supplier_id + company_name. */
  supplier?: { id: number | string | null; name: string | null };
  currency?: string | null;
  /** budget_segment (the approved budget line id) + budget_name. */
  budget?: { id: number | string | null; name: string | null };
  /** po_payment_terms_id + payment_terms_name. */
  paymentTerms?: { id: number | string | null; name: string | null };
  notes?: string | null;
  /** advance_flag + advance_percentage: a percentage is meaningless without the flag. */
  advance?: { flag: boolean; percentage: number | string | null };
  orgId?: number | string | null;
}

/** The complete column set `repo.updatePoFull` writes. */
export interface PurchaseOrderHeaderUpdate {
  description: string;
  deliveryLocation: string | null;
  locationName: string;
  requiredDate: string | null;
  requestorId: string | null;
  requestorName: string | null;
  departmentName: string;
  supplierId: string | null;
  supplierName: string | null;
  currency: string;
  budgetName: string | null;
  paymentTermsId: string | null;
  paymentTermsName: string | null;
  notes: string | null;
  advanceFlag: string;
  advancePercentage: number | null;
  orgId: number | null;
  budgetId: string | null;
}

/** Ids and codes reach the UPDATE as text; "" and null both mean "no value". */
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

/** For the columns the UPDATE types as a plain string, where null is not an option. */
const toRequiredText = (value: unknown): string => toText(value) ?? "";

const toNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Dates go back as YYYY-MM-DD built from local parts, not toISOString(): a `date`
 * column arrives as local midnight, and UTC would shift it to the previous day
 * for anyone east of Greenwich — an unasked-for change to the need-by date.
 */
const toDateText = (value: Date | string | null | undefined): string | null => {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsedText = new Date(trimmed);
    return Number.isNaN(parsedText.getTime()) ? null : localDateText(parsedText);
  }
  return Number.isNaN(value.getTime()) ? null : localDateText(value);
};

const localDateText = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export function mergePurchaseOrderHeader(
  existing: PurchaseOrderHeaderRow,
  patch: PurchaseOrderHeaderPatch,
): PurchaseOrderHeaderUpdate {
  return {
    description:
      patch.description !== undefined
        ? toRequiredText(patch.description)
        : toRequiredText(existing.po_description),

    // Id and name describe one location, so they move together or not at all —
    // half a patch would leave a name pointing at another row's id.
    deliveryLocation: patch.location ? toId(patch.location.id) : toId(existing.delivertto_location_id),
    locationName: patch.location
      ? toRequiredText(patch.location.name)
      : toRequiredText(existing.delivertto_location_name),

    requiredDate:
      patch.requiredDate !== undefined
        ? toDateText(patch.requiredDate)
        : toDateText(existing.po_required_date),

    requestorId: patch.requestor ? toId(patch.requestor.id) : toId(existing.po_owner_id),
    requestorName: patch.requestor ? toText(patch.requestor.name) : toText(existing.po_owner_name),

    departmentName:
      patch.departmentName !== undefined
        ? toRequiredText(patch.departmentName)
        : toRequiredText(existing.department_name),

    supplierId: patch.supplier ? toId(patch.supplier.id) : toId(existing.supplier_id),
    supplierName: patch.supplier ? toText(patch.supplier.name) : toText(existing.company_name),

    // Falling back to the row rather than to AED: a PO in INR stays in INR when
    // the caller only changed the vendor.
    currency:
      patch.currency !== undefined
        ? toRequiredText(patch.currency)
        : toRequiredText(existing.po_currency),

    budgetName: patch.budget ? toText(patch.budget.name) : toText(existing.budget_name),
    budgetId: patch.budget ? toId(patch.budget.id) : toId(existing.budget_segment),

    paymentTermsId: patch.paymentTerms
      ? toId(patch.paymentTerms.id)
      : toId(existing.po_payment_terms_id),
    paymentTermsName: patch.paymentTerms
      ? toText(patch.paymentTerms.name)
      : toText(existing.payment_terms_name),

    notes: patch.notes !== undefined ? toText(patch.notes) : toText(existing.po_notes),

    advanceFlag: patch.advance
      ? patch.advance.flag
        ? "Y"
        : "N"
      : existing.advance_flag === "Y"
        ? "Y"
        : "N",
    advancePercentage: patch.advance
      ? patch.advance.flag
        ? toNumber(patch.advance.percentage)
        : null
      : toNumber(existing.advance_percentage),

    orgId: patch.orgId !== undefined ? toNumber(patch.orgId) : toNumber(existing.org_id),
  };
}
