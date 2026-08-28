/**
 * Turns a partial requisition-header edit into the full column set the header
 * UPDATE writes.
 *
 * `supp_pr_header_dtls` is updated by one statement that sets every editable
 * column at once, which is fine for the Edit Requisition dialog because it
 * posts the whole form back. Callers that change one field — the agent's
 * "change the need-by date" tool, for instance — used to blank the rest: a
 * field the body omitted resolved to null, `budgeted` collapsed to false and
 * the currency fell back to a hardcoded default.
 *
 * So every column here is either the value the caller supplied or the value
 * already on the row. A key left off the patch means "leave it alone"; a key
 * present with null means "clear it", which is how the dialog clears a field.
 *
 * Pure by design: the caller resolves ids to names against the database first
 * and hands the results in, so the merge itself is testable on its own.
 */

/** The `supp_pr_header_dtls` row, narrowed to the columns this update writes. */
export interface RequisitionHeaderRow {
  pr_description?: string | null;
  department_name?: string | null;
  requestor_id?: number | string | null;
  requestor_name?: string | null;
  requestor_email?: string | null;
  pr_owner_id?: number | string | null;
  pr_owner_name?: string | null;
  pr_owner_email?: string | null;
  delivertto_location_id?: number | string | null;
  delivertto_location_name?: string | null;
  delivery_date?: Date | string | null;
  budget_name?: string | null;
  budget_segment?: number | string | null;
  budgeted?: boolean | null;
  currency?: string | null;
  org_id?: number | string | null;
}

/** Only the fields the caller actually wants to change. */
export interface RequisitionHeaderPatch {
  description?: string | null;
  deptName?: string | null;
  requestor?: { id: number | null; name: string | null; email: string | null };
  owner?: { id: number | null; name: string | null; email: string | null };
  location?: { id: number | null; name: string | null };
  needByDate?: Date | null;
  budget?: { name: string | null; segment: number | null };
  budgeted?: boolean;
  currency?: string | null;
  orgId?: number | null;
}

/** The complete column set `repo.updateRequisition` writes. */
export interface RequisitionHeaderUpdate {
  description: string | null;
  deptName: string | null;
  reqId: number | null;
  reqName: string | null;
  reqEmail: string | null;
  ownerId: number | null;
  ownerName: string | null;
  ownerEmail: string | null;
  locId: number | null;
  locName: string | null;
  needByDate: Date | null;
  budName: string | null;
  budSegment: number | null;
  budgeted: boolean;
  currency: string | null;
  orgId: number | null;
}

const toNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toText = (value: unknown): string | null => {
  if (value == null) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
};

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function mergeRequisitionHeader(
  existing: RequisitionHeaderRow,
  patch: RequisitionHeaderPatch,
): RequisitionHeaderUpdate {
  return {
    description:
      patch.description !== undefined ? toText(patch.description) : toText(existing.pr_description),
    deptName: patch.deptName !== undefined ? toText(patch.deptName) : toText(existing.department_name),

    // The three requestor columns describe one person, so they move together
    // or not at all — half a patch would leave a name against another id.
    reqId: patch.requestor ? patch.requestor.id : toNumber(existing.requestor_id),
    reqName: patch.requestor ? toText(patch.requestor.name) : toText(existing.requestor_name),
    reqEmail: patch.requestor ? toText(patch.requestor.email) : toText(existing.requestor_email),

    ownerId: patch.owner ? patch.owner.id : toNumber(existing.pr_owner_id),
    ownerName: patch.owner ? toText(patch.owner.name) : toText(existing.pr_owner_name),
    ownerEmail: patch.owner ? toText(patch.owner.email) : toText(existing.pr_owner_email),

    locId: patch.location ? patch.location.id : toNumber(existing.delivertto_location_id),
    locName: patch.location
      ? toText(patch.location.name)
      : toText(existing.delivertto_location_name),

    needByDate:
      patch.needByDate !== undefined ? toDate(patch.needByDate) : toDate(existing.delivery_date),

    budName: patch.budget ? toText(patch.budget.name) : toText(existing.budget_name),
    budSegment: patch.budget ? patch.budget.segment : toNumber(existing.budget_segment),

    budgeted: patch.budgeted !== undefined ? patch.budgeted : existing.budgeted === true,
    currency: patch.currency !== undefined ? toText(patch.currency) : toText(existing.currency),
    orgId: patch.orgId !== undefined ? patch.orgId : toNumber(existing.org_id),
  };
}
