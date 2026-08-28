import { describe, expect, it } from "vitest";
import {
  mergePendingActions,
  pendingActionsShareTarget,
  type PendingActionLike,
} from "./agent-pending-action";
import { buildPrLineEdit } from "./pr-agent-edit";

const updatePrLine = (data: Record<string, unknown>): PendingActionLike => ({
  type: "update_pr_line",
  data: { prNumber: "PR_00077", lineId: 51, ...data },
  summary: "Update line 1 on PR_00077",
});

describe("mergePendingActions — an edit the model split across calls", () => {
  // "update quantity to 10 and unit price to 1000 and UOM to each" answered with
  // three prepare_update_pr_line calls.
  const merged = [
    updatePrLine({ quantity: 10 }),
    updatePrLine({ unitCost: 1000 }),
    updatePrLine({ uom: "each" }),
  ].reduce<PendingActionLike | undefined>(
    (current, incoming) => mergePendingActions(current, incoming),
    undefined,
  );

  it("carries every field the reply promised", () => {
    expect(merged?.data).toEqual({
      prNumber: "PR_00077",
      lineId: 51,
      quantity: 10,
      unitCost: 1000,
      uom: "each",
    });
  });

  it("still executes as one edit, not just the last field", () => {
    const edit = buildPrLineEdit(
      { id: 51, line_num: 1, item_description: "LAPTOPS", qty: 9, uom: "dozen", unit_cost: 900 },
      merged!.data,
    );
    expect(edit.body).toEqual({ quantity: 10, unitCost: 1000, uom: "each" });
    expect(edit.lineTotal).toBe(10000);
    expect(edit.changes.map((change) => change.label)).toEqual([
      "UOM",
      "Quantity",
      "Unit Price",
    ]);
  });

  it("takes the newest value when a field is restated", () => {
    const merged = mergePendingActions(updatePrLine({ quantity: 10 }), updatePrLine({ quantity: 12 }));
    expect(merged.data.quantity).toBe(12);
  });
});

describe("mergePendingActions — what must still replace", () => {
  it("keeps two added lines separate, since each call is another line item", () => {
    const laptops: PendingActionLike = {
      type: "add_pr_line",
      data: { prNumber: "PR_00077", resolvedLine: { itemName: "LAPTOPS" } },
      summary: "Add LAPTOPS",
    };
    const monitors: PendingActionLike = {
      type: "add_pr_line",
      data: { prNumber: "PR_00077", resolvedLine: { itemName: "MONITORS" } },
      summary: "Add MONITORS",
    };
    expect(mergePendingActions(laptops, monitors)).toBe(monitors);
  });

  it("does not merge edits to different lines of the same PR", () => {
    const lineOne = updatePrLine({ quantity: 10 });
    const lineTwo: PendingActionLike = {
      ...updatePrLine({ quantity: 4 }),
      data: { prNumber: "PR_00077", lineId: 52, quantity: 4 },
    };
    expect(mergePendingActions(lineOne, lineTwo)).toBe(lineTwo);
  });

  it("does not merge the same edit across different documents", () => {
    const first = updatePrLine({ quantity: 10 });
    const other: PendingActionLike = {
      ...first,
      data: { prNumber: "PR_00099", lineId: 51, quantity: 4 },
    };
    expect(mergePendingActions(first, other)).toBe(other);
  });

  it("does not merge across action types", () => {
    const line = updatePrLine({ quantity: 10 });
    const submit: PendingActionLike = {
      type: "submit_requisition",
      data: { prNumber: "PR_00077" },
      summary: "Submit PR_00077",
    };
    expect(mergePendingActions(line, submit)).toBe(submit);
  });

  it("takes the incoming action when the turn has produced none yet", () => {
    const line = updatePrLine({ quantity: 10 });
    expect(mergePendingActions(undefined, line)).toBe(line);
  });
});

describe("mergePendingActions — header edits", () => {
  const header = (data: Record<string, unknown>): PendingActionLike => ({
    type: "update_requisition",
    data: { prNumber: "PR_00077", ...data },
    summary: "Update PR_00077",
  });

  it("folds a header edit split over two calls into one", () => {
    const merged = mergePendingActions(
      header({ description: "laptops for the design team" }),
      header({ needByDate: "2026-09-30" }),
    );
    expect(merged.data).toEqual({
      prNumber: "PR_00077",
      description: "laptops for the design team",
      needByDate: "2026-09-30",
    });
  });
});

describe("pendingActionsShareTarget", () => {
  it("compares the document and the line, however they were typed", () => {
    const a = updatePrLine({ quantity: 10 });
    const b: PendingActionLike = {
      ...a,
      data: { prNumber: "pr_00077", lineId: "51", unitCost: 1000 },
    };
    expect(pendingActionsShareTarget(a, b)).toBe(true);
  });

  it("treats a PO line and a PR line as different targets", () => {
    const pr = updatePrLine({ quantity: 10 });
    const po: PendingActionLike = {
      type: "update_po_line",
      data: { poNumber: "PO_00058", lineId: 51, quantity: 10 },
      summary: "Update line 1 on PO_00058",
    };
    expect(pendingActionsShareTarget(pr, po)).toBe(false);
  });
});
