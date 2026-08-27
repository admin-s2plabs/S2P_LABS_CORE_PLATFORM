/**
 * The rules the Procurement Ops Agent needs before it changes a line on an
 * existing requisition: whether the PR can be edited at all, which line the
 * user meant, and how to describe the change back to them.
 *
 * The counterpart to `po-agent-edit`, and deliberately its shape — line
 * targeting, the change list and the field helpers are the shared ones from
 * `agent-line-edit`. What differs is the money: a requisition line carries no
 * tax or discount, so its total is simply quantity × unit cost.
 *
 * Without this the agent had no way to change a PR line and answered "update
 * the quantity to 20" with prepare_add_pr_line, which appended a second line at
 * an AI-estimated price instead of editing the one that was there.
 *
 * Pure functions over plain rows, so the rules can be tested without a database.
 */

import { EDITABLE_STATUSES } from "../constants";
import {
  editFieldSupplied,
  editText,
  formatDocumentLineTargetMessage,
  resolveDocumentLineTarget,
  type DocumentLineTarget,
  type FieldChange,
} from "./agent-line-edit";
import {
  mergeRequisitionLine,
  type RequisitionLinePatch,
} from "../modules/procurement/requisition-line-patch";

/** The `supp_pr_header_dtls` columns that decide whether the PR may be edited. */
export interface PrEditGateRow {
  pr_number?: string | null;
  pr_status?: string | null;
}

/**
 * Draft and More Info Required, the same two statuses the server's
 * validateIsEditable accepts — checked here so the user gets told why instead
 * of an error at confirm time.
 */
export function prStatusBlocksEditMessage(pr: PrEditGateRow): string | null {
  const status = String(pr.pr_status || "").trim();
  if (EDITABLE_STATUSES.includes(status.toLowerCase() as any)) return null;

  const label = status || "unknown";
  const prNumber = pr.pr_number || "this requisition";
  let nextStep = "Only Draft and More Info Required requisitions can be edited.";
  const lower = label.toLowerCase();
  if (lower === "pending approval") {
    nextStep = "It is out for approval — an approver has to send it back before it can change.";
  } else if (lower === "approved") {
    nextStep = "An approved requisition cannot be edited; raise a new one instead.";
  } else if (lower === "rejected" || lower === "cancelled") {
    nextStep = `A ${label} requisition cannot be edited.`;
  }

  return `**${prNumber}** is **${label}**, so I can't edit it. ${nextStep}`;
}

/** The `supp_pr_line_dtls` columns the agent shows and edits. */
export interface PrLineRow {
  id: number | string;
  line_num?: number | string | null;
  item_description?: string | null;
  qty?: number | string | null;
  uom?: string | null;
  unit_cost?: number | string | null;
}

export type PrLineTarget = DocumentLineTarget<PrLineRow>;

/** Which line the user meant, by the generic rules, over PR column names. */
export function resolvePrLineTarget(
  lines: PrLineRow[],
  request: {
    lineId?: number | string | null;
    lineNumber?: number | string | null;
    itemQuery?: string | null;
  },
): PrLineTarget {
  return resolveDocumentLineTarget(lines, request, {
    id: (line) => line.id,
    lineNumber: (line) => line.line_num,
    labels: (line) => [line.item_description || ""],
  });
}

export function formatPrLineLabel(line: PrLineRow): string {
  const name = String(line.item_description || "Item").trim();
  const qty = line.qty != null ? String(line.qty) : "";
  const uom = String(line.uom || "").trim();
  const price = line.unit_cost != null ? Number(line.unit_cost) : null;
  const quantity = qty ? `${qty}${uom ? ` ${uom}` : ""}` : "";
  const at = price != null && Number.isFinite(price) ? ` @ ${price.toLocaleString()}` : "";
  return `Line ${line.line_num ?? line.id}: ${name}${quantity ? ` — ${quantity}` : ""}${at}`;
}

export function formatPrLineTargetMessage(prNumber: string, target: PrLineTarget): string | null {
  return formatDocumentLineTargetMessage(prNumber, target, formatPrLineLabel);
}

export interface PrLineEditResolution {
  /** Only the keys that change, for procService.updateRequisitionLine's partial body. */
  body: Record<string, unknown>;
  changes: FieldChange[];
  /** Line amount after the edit, for the preview and the confirmation. */
  lineTotal: number;
  error?: string;
}

/**
 * Builds the partial line body plus the total the edit will produce, so the
 * preview quotes the same number the UPDATE will write — both go through
 * mergeRequisitionLine.
 */
export function buildPrLineEdit(
  line: PrLineRow,
  args: {
    itemDescription?: unknown;
    uom?: unknown;
    quantity?: unknown;
    unitCost?: unknown;
  },
): PrLineEditResolution {
  const patch: RequisitionLinePatch = {};
  const changes: FieldChange[] = [];
  const empty = { body: {}, changes, lineTotal: 0 };
  const money = (value: unknown): string => Number(value ?? 0).toLocaleString();

  if (editFieldSupplied(args.itemDescription)) {
    patch.description = editText(args.itemDescription)!;
    changes.push({
      label: "Item",
      from: editText(line.item_description),
      to: patch.description,
    });
  }

  if (editFieldSupplied(args.uom)) {
    patch.uom = editText(args.uom)!;
    changes.push({ label: "UOM", from: editText(line.uom), to: patch.uom });
  }

  const numericEdits: Array<{
    arg: unknown;
    label: string;
    from: unknown;
    apply: (value: number) => void;
    /** Quantity is the only one where zero makes no sense. */
    allowZero?: boolean;
    format?: (value: number) => string;
  }> = [
    {
      arg: args.quantity,
      label: "Quantity",
      from: line.qty,
      apply: (value) => {
        patch.quantity = value;
      },
      format: (value) => String(value),
    },
    {
      arg: args.unitCost,
      label: "Unit Price",
      from: line.unit_cost,
      apply: (value) => {
        patch.unitCost = value;
      },
      allowZero: true,
    },
  ];

  for (const edit of numericEdits) {
    if (!editFieldSupplied(edit.arg)) continue;
    const value = Number(edit.arg);
    if (!Number.isFinite(value) || value < 0 || (value === 0 && !edit.allowZero)) {
      return { ...empty, error: `"${edit.arg}" is not a valid ${edit.label.toLowerCase()}.` };
    }
    edit.apply(value);
    const format = edit.format || money;
    changes.push({
      label: edit.label,
      from: edit.from != null ? format(Number(edit.from)) : null,
      to: format(value),
    });
  }

  if (Object.keys(patch).length === 0) {
    return {
      ...empty,
      error:
        `Tell me what to change on that line — I can update the quantity, unit price, ` +
        `unit of measure or the item description.`,
    };
  }

  // The item id and category stay as they are: this tool edits a line, it does
  // not re-point it at a different Item Master row.
  const merged = mergeRequisitionLine(line, patch);
  const body: Record<string, unknown> = {};
  if (patch.description !== undefined) body.itemDescription = patch.description;
  if (patch.uom !== undefined) body.uom = patch.uom;
  if (patch.quantity !== undefined) body.quantity = patch.quantity;
  if (patch.unitCost !== undefined) body.unitCost = patch.unitCost;

  return { body, changes, lineTotal: merged.amount };
}
