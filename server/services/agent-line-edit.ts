/**
 * The parts of "change a line on this document" that are the same whether the
 * document is a purchase order or a requisition: working out which line the
 * user meant, listing the lines back when that is unclear, and describing an
 * edit as a before → after list.
 *
 * Only the column names differ between the two, so those arrive as accessors.
 * `po-agent-edit` and `pr-agent-edit` supply them and keep their own labels,
 * money rules and edit validation, which is where the two documents really do
 * behave differently.
 *
 * Pure functions over plain rows, so the rules can be tested without a database.
 */

import { matchByLabels } from "./direct-po-name-match";

const isSet = (value: unknown): boolean =>
  value !== null && value !== undefined && String(value).trim() !== "" && String(value) !== "0";

export type DocumentLineTarget<TLine> =
  | { status: "resolved"; line: TLine }
  | { status: "empty" }
  | { status: "unspecified"; lines: TLine[] }
  | { status: "none"; query: string; lines: TLine[] }
  | { status: "ambiguous"; query: string; candidates: TLine[] };

export interface DocumentLineRequest {
  lineId?: number | string | null;
  lineNumber?: number | string | null;
  itemQuery?: string | null;
}

/** How to read the identity of one line row. */
export interface DocumentLineAccessors<TLine> {
  id: (line: TLine) => unknown;
  /** The line number printed on the document, not the row id. */
  lineNumber: (line: TLine) => unknown;
  /** The text a user might name the line by, best first. */
  labels: (line: TLine) => string[];
}

/**
 * Works out which line "change line 2 to 5 units" or "update the laptops line"
 * means. A line number is the number the user reads off the document, not the
 * row id, so both are accepted; on a single-line document nothing needs naming
 * at all.
 */
export function resolveDocumentLineTarget<TLine>(
  lines: TLine[],
  request: DocumentLineRequest,
  accessors: DocumentLineAccessors<TLine>,
): DocumentLineTarget<TLine> {
  if (lines.length === 0) return { status: "empty" };

  if (isSet(request.lineId)) {
    const wanted = String(request.lineId).trim();
    const byId = lines.find((line) => String(accessors.id(line)) === wanted);
    if (byId) return { status: "resolved", line: byId };
  }

  if (isSet(request.lineNumber)) {
    const wanted = String(request.lineNumber).trim();
    const byNumber = lines.find(
      (line) => String(accessors.lineNumber(line) ?? "").trim() === wanted,
    );
    if (byNumber) return { status: "resolved", line: byNumber };

    // Fall back to position for documents whose line numbers are not 1..n.
    const ordinal = Number(wanted);
    if (Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= lines.length) {
      return { status: "resolved", line: lines[ordinal - 1] };
    }
    return { status: "none", query: `line ${wanted}`, lines };
  }

  const query = String(request.itemQuery || "").trim();
  if (query) {
    const match = matchByLabels(lines, query, accessors.labels);
    if (match.status === "resolved") return { status: "resolved", line: match.item };
    if (match.status === "ambiguous") {
      return { status: "ambiguous", query, candidates: match.candidates };
    }
    return { status: "none", query, lines };
  }

  if (lines.length === 1) return { status: "resolved", line: lines[0] };
  return { status: "unspecified", lines };
}

/** Turns a line-target miss into the message the agent replies with. */
export function formatDocumentLineTargetMessage<TLine>(
  documentNumber: string,
  target: DocumentLineTarget<TLine>,
  describe: (line: TLine) => string,
): string | null {
  const list = (lines: TLine[]) => lines.map((line) => `- ${describe(line)}`).join("\n");

  switch (target.status) {
    case "resolved":
      return null;
    case "empty":
      return `**${documentNumber}** has no line items yet, so there is nothing to update. Add one first.`;
    case "unspecified":
      return (
        `**${documentNumber}** has ${target.lines.length} line items — which one should I change?\n\n` +
        `${list(target.lines)}`
      );
    case "ambiguous":
      return (
        `More than one line on **${documentNumber}** matches "${target.query}". Which one did you mean?\n\n` +
        `${list(target.candidates)}`
      );
    case "none":
      return (
        `I couldn't find "${target.query}" on **${documentNumber}**. Its line items are:\n\n` +
        `${list(target.lines)}`
      );
  }
}

export interface FieldChange {
  label: string;
  from: string | null;
  to: string;
}

/** The before → after list both the preview and the confirmation are built from. */
export function formatChangeList(changes: FieldChange[]): string {
  return changes
    .map((change) =>
      change.from && change.from !== change.to
        ? `- **${change.label}**: ${change.from} → ${change.to}`
        : `- **${change.label}**: ${change.to}`,
    )
    .join("\n");
}

/** A tool argument the caller actually filled in. */
export function editFieldSupplied(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function editText(value: unknown): string | null {
  const text = value == null ? "" : String(value).trim();
  return text.length > 0 ? text : null;
}
