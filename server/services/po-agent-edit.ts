/**
 * The rules the Procurement Ops Agent needs before it edits an existing purchase order:
 * whether the PO is editable at all, which header fields the PO detail page leaves
 * editable, which line the user meant, and how to describe the change back to them.
 *
 * The point of gathering it here is that the agent must refuse exactly what the Edit
 * Purchase Order sheet refuses. A PO raised from a PR or a bid award owns most of its
 * header — the sheet renders those inputs disabled — so an agent that wrote them anyway
 * would put the PO out of step with the document it came from.
 *
 * Pure functions over plain rows, so the rules can be tested without a database.
 */

import { EDITABLE_STATUSES } from "../constants";
import {
  editFieldSupplied,
  editText,
  formatChangeList,
  formatDocumentLineTargetMessage,
  resolveDocumentLineTarget,
  type DocumentLineTarget,
  type FieldChange,
} from "./agent-line-edit";
import {
  mergePurchaseOrderLine,
  type PurchaseOrderLinePatch,
} from "../modules/procurement/purchase-order-line-patch";

/** The `supp_po_header_dtls` columns that decide what may be edited. */
export interface PoEditGateRow {
  po_number?: string | null;
  po_status?: string | null;
  /** Set when the PO was raised from a requisition. */
  pr_number?: string | null;
  /** Set when the PO came out of a bid award. */
  bid_award_id?: number | string | null;
  /** Set once the PO has downstream activity that freezes its lines. */
  attribute_5?: string | number | null;
}

export type PoHeaderField =
  | "description"
  | "deliveryLocation"
  | "requiredDate"
  | "department"
  | "businessEntity"
  | "vendor"
  | "budget"
  | "currency"
  | "paymentTerms"
  | "notes"
  | "advance";

export const PO_HEADER_FIELD_LABELS: Record<PoHeaderField, string> = {
  description: "Description",
  deliveryLocation: "Delivery Location",
  requiredDate: "Need By Date",
  department: "Department",
  businessEntity: "Business Entity",
  vendor: "Vendor",
  budget: "Budget",
  currency: "Currency",
  paymentTerms: "Payment Terms",
  notes: "Notes",
  advance: "Advance Payment",
};

/** Fields the sheet disables on a PO that was raised from a PR or a bid award. */
const FIELDS_OWNED_BY_SOURCE_DOCUMENT: PoHeaderField[] = [
  "description",
  "deliveryLocation",
  "requiredDate",
  "department",
  "businessEntity",
  "budget",
  "currency",
];

const isSet = (value: unknown): boolean =>
  value !== null && value !== undefined && String(value).trim() !== "" && String(value) !== "0";

/**
 * Draft and More Info Required, the same two statuses the server's validateIsEditable
 * accepts — checked here so the user gets told why instead of an error at confirm time.
 */
export function poStatusBlocksEditMessage(po: PoEditGateRow): string | null {
  const status = String(po.po_status || "").trim();
  if (EDITABLE_STATUSES.includes(status.toLowerCase() as any)) return null;

  const label = status || "unknown";
  const poNumber = po.po_number || "this purchase order";
  let nextStep = "Only Draft and More Info Required POs can be edited.";
  const lower = label.toLowerCase();
  if (lower === "pending approval") {
    nextStep = "It is out for approval — an approver has to send it back before it can change.";
  } else if (lower === "approved" || lower === "issued") {
    nextStep = "An approved PO cannot be edited; raise an amendment or a new PO instead.";
  } else if (lower === "rejected" || lower === "cancelled") {
    nextStep = `A ${label} PO cannot be edited.`;
  }

  return `**${poNumber}** is **${label}**, so I can't edit it. ${nextStep}`;
}

/** Header fields this particular PO does not own, in the order the sheet lays them out. */
export function lockedPoHeaderFields(po: PoEditGateRow): PoHeaderField[] {
  const fromPr = isSet(po.pr_number);
  const fromBid = isSet(po.bid_award_id);
  if (!fromPr && !fromBid) return [];

  const locked = [...FIELDS_OWNED_BY_SOURCE_DOCUMENT];
  // The vendor is the one field a PR-sourced PO still chooses for itself; a bid award
  // already picked the winning supplier.
  if (fromBid) locked.push("vendor");
  return locked;
}

export function poEditSourceLabel(po: PoEditGateRow): string | null {
  if (isSet(po.bid_award_id)) return "a bid award";
  if (isSet(po.pr_number)) return `requisition ${String(po.pr_number).trim()}`;
  return null;
}

/** Message for fields the caller asked to change but this PO does not own. */
export function lockedPoFieldsMessage(po: PoEditGateRow, requested: PoHeaderField[]): string | null {
  const locked = lockedPoHeaderFields(po);
  const blocked = requested.filter((field) => locked.includes(field));
  if (blocked.length === 0) return null;

  const names = blocked.map((field) => PO_HEADER_FIELD_LABELS[field]).join(", ");
  const source = poEditSourceLabel(po) || "its source document";
  const editable = requested.filter((field) => !locked.includes(field));
  const alternative =
    editable.length > 0
      ? ` I can still change ${editable.map((field) => PO_HEADER_FIELD_LABELS[field]).join(", ")}.`
      : "";

  return (
    `**${po.po_number || "This PO"}** was raised from ${source}, so ${names} ` +
    `${blocked.length === 1 ? "is" : "are"} fixed by that document and the PO detail page ` +
    `keeps ${blocked.length === 1 ? "it" : "them"} read-only too.${alternative}`
  );
}

/** Lines are frozen by a bid award or downstream activity, whatever the status says. */
export function poLineEditBlockedMessage(po: PoEditGateRow): string | null {
  if (isSet(po.bid_award_id)) {
    return (
      `**${po.po_number || "This PO"}** came from a bid award, so its line items are fixed by ` +
      `the awarded bid and cannot be edited.`
    );
  }
  if (isSet(po.attribute_5)) {
    return (
      `**${po.po_number || "This PO"}** has downstream activity against it, so its line items ` +
      `are locked.`
    );
  }
  return null;
}

/** The `supp_po_line_dtls` columns the agent shows and edits. */
export interface PoLineRow {
  id: number | string;
  po_line_number?: number | string | null;
  line_description?: string | null;
  item_name?: string | null;
  line_qty?: number | string | null;
  line_unit?: string | null;
  line_unit_cost?: number | string | null;
  discount?: number | string | null;
  tax_rate?: number | string | null;
}

export type PoLineTarget = DocumentLineTarget<PoLineRow>;

/** Which line the user meant, by the generic rules, over PO column names. */
export function resolvePoLineTarget(
  lines: PoLineRow[],
  request: { lineId?: number | string | null; lineNumber?: number | string | null; itemQuery?: string | null },
): PoLineTarget {
  return resolveDocumentLineTarget(lines, request, {
    id: (line) => line.id,
    lineNumber: (line) => line.po_line_number,
    labels: (line) => [line.line_description || "", line.item_name || ""],
  });
}

export function formatPoLineLabel(line: PoLineRow): string {
  const name = String(line.line_description || line.item_name || "Item").trim();
  const qty = line.line_qty != null ? String(line.line_qty) : "";
  const uom = String(line.line_unit || "").trim();
  const price = line.line_unit_cost != null ? Number(line.line_unit_cost) : null;
  const quantity = qty ? `${qty}${uom ? ` ${uom}` : ""}` : "";
  const at = price != null && Number.isFinite(price) ? ` @ ${price.toLocaleString()}` : "";
  return `Line ${line.po_line_number ?? line.id}: ${name}${quantity ? ` — ${quantity}` : ""}${at}`;
}

export function formatPoLineList(lines: PoLineRow[]): string {
  return lines.map((line) => `- ${formatPoLineLabel(line)}`).join("\n");
}

/** Turns a line-target miss into the message the agent replies with. */
export function formatPoLineTargetMessage(poNumber: string, target: PoLineTarget): string | null {
  return formatDocumentLineTargetMessage(poNumber, target, formatPoLineLabel);
}

export type PoFieldChange = FieldChange;
export const formatPoChangeList = formatChangeList;
export const poEditFieldSupplied = editFieldSupplied;
export const poEditText = editText;

export interface PoLineEditResolution {
  /** Only the keys that change, for procService.updatePoLine's partial body. */
  body: Record<string, unknown>;
  changes: PoFieldChange[];
  /** Net line cost after the edit, for the preview and the confirmation. */
  lineTotal: number;
  taxAmount: number;
  error?: string;
}

/**
 * Builds the partial line body plus the totals the edit will produce, so the preview quotes
 * the same numbers the UPDATE will write — both go through mergePurchaseOrderLine.
 */
export function buildPoLineEdit(
  po: { po_number?: string | null; tax_included?: string | null },
  line: PoLineRow,
  args: {
    description?: unknown;
    uom?: unknown;
    quantity?: unknown;
    unitPrice?: unknown;
    discount?: unknown;
    taxRate?: unknown;
  },
): PoLineEditResolution {
  const patch: PurchaseOrderLinePatch = {};
  const changes: PoFieldChange[] = [];
  const empty = { body: {}, changes, lineTotal: 0, taxAmount: 0 };
  const money = (value: unknown): string => Number(value ?? 0).toLocaleString();

  if (poEditFieldSupplied(args.description)) {
    patch.description = poEditText(args.description)!;
    changes.push({
      label: "Item",
      from: poEditText(line.line_description) || poEditText(line.item_name),
      to: patch.description,
    });
  }

  if (poEditFieldSupplied(args.uom)) {
    patch.uom = poEditText(args.uom)!;
    changes.push({ label: "UOM", from: poEditText(line.line_unit), to: patch.uom });
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
      from: line.line_qty,
      apply: (value) => {
        patch.quantity = value;
      },
      format: (value) => String(value),
    },
    {
      arg: args.unitPrice,
      label: "Unit Price",
      from: line.line_unit_cost,
      apply: (value) => {
        patch.unitPrice = value;
      },
      allowZero: true,
    },
    {
      arg: args.discount,
      label: "Discount (per unit)",
      from: line.discount,
      apply: (value) => {
        patch.discount = value;
      },
      allowZero: true,
    },
    {
      arg: args.taxRate,
      label: "Tax Rate",
      from: line.tax_rate,
      apply: (value) => {
        patch.taxRate = value;
      },
      allowZero: true,
      format: (value) => `${value}%`,
    },
  ];

  const changesMoney = numericEdits.some((edit) => poEditFieldSupplied(edit.arg));

  // A tax-inclusive PO prices its lines from a gross line total, which this tool does not
  // ask for; recomputing from quantity × unit price would quietly restate the tax.
  if (changesMoney && String(po.tax_included || "").toLowerCase() === "yes") {
    return {
      ...empty,
      error:
        `**${po.po_number}** is priced inclusive of tax, so quantities and prices have to be ` +
        `entered against the gross line total on the purchase order page. I can still change ` +
        `the item description or unit of measure here.`,
    };
  }

  for (const edit of numericEdits) {
    if (!poEditFieldSupplied(edit.arg)) continue;
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
        `unit of measure, discount, tax rate or the item description.`,
    };
  }

  const merged = mergePurchaseOrderLine(line, patch);
  const body: Record<string, unknown> = {};
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.uom !== undefined) body.uom = patch.uom;
  if (patch.quantity !== undefined) body.quantity = patch.quantity;
  if (patch.unitPrice !== undefined) body.unitPrice = patch.unitPrice;
  if (patch.discount !== undefined) body.discount = patch.discount;
  if (patch.taxRate !== undefined) body.taxRate = patch.taxRate;

  return { body, changes, lineTotal: merged.lineCost, taxAmount: merged.taxAmount };
}
