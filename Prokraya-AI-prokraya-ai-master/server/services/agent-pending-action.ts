/**
 * Which pending action survives when one turn produces several.
 *
 * The tool loop used to keep the last one. That is right for actions that are
 * genuinely different pieces of work, but wrong when the model splits a single
 * edit across calls: asked to "update quantity to 10 and unit price to 1000 and
 * UOM to each", it called prepare_update_pr_line three times, once per field.
 * The reply it wrote listed all three changes — it had all three tool results —
 * while the Confirm button carried only the last, so confirming wrote the unit
 * of measure and silently dropped the quantity and the price.
 *
 * So field-splitting is undone here: two actions that restate the same edit to
 * the same target are folded into one, later keys winning. Everything else
 * still replaces, because "add laptops, then monitors" really is two actions
 * and merging those would lose a line item.
 *
 * Two edits to *different* lines in one turn still leave only the last one
 * confirmable. That needs a way to offer several actions at once, which this
 * agent does not have.
 */

export interface PendingActionLike {
  type: string;
  data: any;
  summary: string;
}

/**
 * Actions that edit something that already exists, where a second action of the
 * same type against the same target is the same edit restated. Deliberately not
 * the `add_*` or `create_*` types: those describe new rows, and each call means
 * another one.
 */
const MERGEABLE_ACTION_TYPES = new Set([
  "update_pr_line",
  "update_po_line",
  "update_requisition",
  "update_purchase_order",
]);

const key = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim().toLowerCase();

/** The record — and, where there is one, the line — an action would write to. */
function actionTarget(action: PendingActionLike): string {
  const data = action.data ?? {};
  const document = key(data.prNumber ?? data.poNumber);
  return `${document}#${key(data.lineId)}`;
}

export function pendingActionsShareTarget(
  a: PendingActionLike,
  b: PendingActionLike,
): boolean {
  return a.type === b.type && actionTarget(a) === actionTarget(b);
}

/**
 * The action the Confirm button should carry, given what the turn has produced
 * so far and what a tool just returned.
 */
export function mergePendingActions(
  current: PendingActionLike | undefined,
  incoming: PendingActionLike,
): PendingActionLike {
  if (!current) return incoming;
  if (!MERGEABLE_ACTION_TYPES.has(incoming.type)) return incoming;
  if (!pendingActionsShareTarget(current, incoming)) return incoming;

  return {
    ...incoming,
    data: { ...(current.data ?? {}), ...(incoming.data ?? {}) },
  };
}
