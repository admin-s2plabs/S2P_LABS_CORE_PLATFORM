/**
 * Whether a requisition is complete enough to enter the approval workflow.
 *
 * The Create and Edit dialogs star ten header fields as mandatory, but they
 * enforce them only by disabling their own save button. Nothing re-checked them
 * at submit time, so a PR that reached the database incomplete — imported,
 * created by an agent, or damaged by an older partial update — could be sent to
 * an approver with a blank description, department and requestor.
 *
 * This is the single definition of "ready", shared by the agent's submit
 * preview, the server submit endpoint and the detail page, so all three agree.
 * It reports every unmet requirement at once rather than the first, because
 * being told about one missing field per attempt turns a fix into a series of
 * round trips.
 */

/** The `supp_pr_header_dtls` columns behind the dialog's mandatory fields. */
export interface RequisitionSubmitHeader {
  pr_description?: string | null;
  org_id?: number | string | null;
  delivery_date?: Date | string | null;
  requestor_id?: number | string | null;
  delivertto_location_id?: number | string | null;
  department_name?: string | null;
  pr_owner_id?: number | string | null;
  currency?: string | null;
  budgeted?: boolean | null;
  budget_segment?: number | string | null;
}

export interface RequisitionSubmitReadiness {
  ready: boolean;
  /** Field labels as the Edit Purchase Requisition dialog shows them. */
  missing: string[];
}

export const LINE_ITEM_REQUIREMENT = "At least one line item";

const hasText = (value: unknown): boolean => String(value ?? "").trim().length > 0;

const hasId = (value: unknown): boolean => {
  if (value == null || value === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed > 0 : hasText(value);
};

const hasDate = (value: Date | string | null | undefined): boolean => {
  if (value == null || value === "") return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
};

export function checkRequisitionSubmitReadiness(
  header: RequisitionSubmitHeader | null | undefined,
  lineCount: number,
): RequisitionSubmitReadiness {
  const missing: string[] = [];
  const h = header || {};

  if (!hasText(h.pr_description)) missing.push("PR Description");
  if (!hasId(h.org_id)) missing.push("Business Entity");
  if (!hasDate(h.delivery_date)) missing.push("Need By Date");
  if (!hasId(h.requestor_id)) missing.push("Requestor");
  if (!hasId(h.delivertto_location_id)) missing.push("Delivery Location");
  if (!hasText(h.department_name)) missing.push("Department");
  if (!hasId(h.pr_owner_id)) missing.push("Buyer");
  if (!hasText(h.currency)) missing.push("Currency");

  // An unbudgeted PR is a valid answer to the Budgeted question, so a budget
  // line is required only when the requisition claims to have one.
  if (h.budgeted === true && !hasId(h.budget_segment)) missing.push("Budget");

  if (!Number.isFinite(lineCount) || lineCount < 1) missing.push(LINE_ITEM_REQUIREMENT);

  return { ready: missing.length === 0, missing };
}

/** "Department, Buyer and at least one line item" */
export function describeMissingRequirements(missing: string[]): string {
  const parts = missing.map((label) =>
    label === LINE_ITEM_REQUIREMENT ? "at least one line item" : label,
  );
  if (parts.length <= 1) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Chat-facing readiness answer for the agent. */
export function formatRequisitionReadinessMessage(
  prNumber: string,
  readiness: RequisitionSubmitReadiness,
): string {
  if (readiness.ready) return `**${prNumber}** has everything it needs and is ready to submit.`;
  const bullets = readiness.missing.map((label) => `- ${label}`).join("\n");
  return (
    `**${prNumber}** is not ready to submit yet. Please complete the following first:\n\n` +
    `${bullets}\n`
  );
}
