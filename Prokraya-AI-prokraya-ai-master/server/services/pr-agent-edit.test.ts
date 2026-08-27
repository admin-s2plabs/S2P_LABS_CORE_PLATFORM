import { describe, expect, it } from "vitest";
import {
  buildPrLineEdit,
  formatPrLineLabel,
  formatPrLineTargetMessage,
  prStatusBlocksEditMessage,
  resolvePrLineTarget,
  type PrLineRow,
} from "./pr-agent-edit";

/** PR_00076's lines, as the detail page lists them. */
const HARDDISK: PrLineRow = {
  id: 41,
  line_num: 1,
  item_description: "harddisk",
  qty: 15,
  uom: "Each",
  unit_cost: 50,
};

const LAPTOPS: PrLineRow = {
  id: 42,
  line_num: 2,
  item_description: "LAPTOPS",
  qty: 5,
  uom: "Each",
  unit_cost: 800,
};

describe("prStatusBlocksEditMessage", () => {
  it("allows the two statuses the server accepts", () => {
    expect(prStatusBlocksEditMessage({ pr_status: "Draft" })).toBeNull();
    expect(prStatusBlocksEditMessage({ pr_status: "More Info Required" })).toBeNull();
  });

  it("explains that a PR out for approval has to come back first", () => {
    const message = prStatusBlocksEditMessage({
      pr_number: "PR_00076",
      pr_status: "Pending Approval",
    });
    expect(message).toContain("PR_00076");
    expect(message).toContain("Pending Approval");
    expect(message).toContain("approver");
  });

  it("refuses an approved requisition", () => {
    expect(prStatusBlocksEditMessage({ pr_status: "Approved" })).toContain("raise a new one");
  });
});

describe("resolvePrLineTarget", () => {
  it("takes the only line when the PR has one", () => {
    const target = resolvePrLineTarget([HARDDISK], {});
    expect(target.status === "resolved" && target.line.id).toBe(41);
  });

  it("asks which line when the PR has several and the user named none", () => {
    const target = resolvePrLineTarget([HARDDISK, LAPTOPS], {});
    expect(target.status).toBe("unspecified");
    const message = formatPrLineTargetMessage("PR_00076", target);
    expect(message).toContain("2 line items");
    expect(message).toContain("Line 1: harddisk — 15 Each @ 50");
    expect(message).toContain("Line 2: LAPTOPS");
  });

  it("finds the line by the number printed on the PR", () => {
    const target = resolvePrLineTarget([HARDDISK, LAPTOPS], { lineNumber: 2 });
    expect(target.status === "resolved" && target.line.id).toBe(42);
  });

  it("finds the line by item name", () => {
    const target = resolvePrLineTarget([HARDDISK, LAPTOPS], { itemQuery: "laptops" });
    expect(target.status === "resolved" && target.line.id).toBe(42);
  });

  it("finds the line by row id, which is what confirm sends back", () => {
    const target = resolvePrLineTarget([HARDDISK, LAPTOPS], { lineId: "42" });
    expect(target.status === "resolved" && target.line.id).toBe(42);
  });

  it("falls back to position when line numbers are not 1..n", () => {
    const renumbered = [
      { ...HARDDISK, line_num: 10 },
      { ...LAPTOPS, line_num: 20 },
    ];
    const target = resolvePrLineTarget(renumbered, { lineNumber: 2 });
    expect(target.status === "resolved" && target.line.id).toBe(42);
  });

  it("lists the lines when the named item is not on the PR", () => {
    const target = resolvePrLineTarget([HARDDISK, LAPTOPS], { itemQuery: "monitors" });
    expect(target.status).toBe("none");
    expect(formatPrLineTargetMessage("PR_00076", target)).toContain("couldn't find \"monitors\"");
  });

  it("says there is nothing to update on an empty PR", () => {
    const target = resolvePrLineTarget([], { quantity: 5 } as any);
    expect(target.status).toBe("empty");
    expect(formatPrLineTargetMessage("PR_00076", target)).toContain("no line items yet");
  });
});

describe("formatPrLineLabel", () => {
  it("reads back the line the way the PR shows it", () => {
    expect(formatPrLineLabel(HARDDISK)).toBe("Line 1: harddisk — 15 Each @ 50");
  });
});

describe("buildPrLineEdit", () => {
  it("changes only the quantity, and recomputes the amount from the stored price", () => {
    const edit = buildPrLineEdit(HARDDISK, { quantity: 20 });

    expect(edit.error).toBeUndefined();
    expect(edit.body).toEqual({ quantity: 20 });
    expect(edit.lineTotal).toBe(1000);
    expect(edit.changes).toEqual([{ label: "Quantity", from: "15", to: "20" }]);
  });

  it("never sends the fields the user did not mention", () => {
    const edit = buildPrLineEdit(HARDDISK, { quantity: 20 });
    expect(edit.body).not.toHaveProperty("unitCost");
    expect(edit.body).not.toHaveProperty("uom");
    expect(edit.body).not.toHaveProperty("itemDescription");
  });

  it("changes only the unit price", () => {
    const edit = buildPrLineEdit(HARDDISK, { unitCost: 150 });
    expect(edit.body).toEqual({ unitCost: 150 });
    expect(edit.lineTotal).toBe(2250);
    expect(edit.changes).toEqual([{ label: "Unit Price", from: "50", to: "150" }]);
  });

  it("applies quantity and price together", () => {
    const edit = buildPrLineEdit(HARDDISK, { quantity: 20, unitCost: 150 });
    expect(edit.body).toEqual({ quantity: 20, unitCost: 150 });
    expect(edit.lineTotal).toBe(3000);
  });

  it("changes the unit of measure and the description", () => {
    const edit = buildPrLineEdit(HARDDISK, { uom: "Box", itemDescription: "harddisk 2TB" });
    expect(edit.body).toEqual({ uom: "Box", itemDescription: "harddisk 2TB" });
    expect(edit.lineTotal).toBe(750);
  });

  it("allows a free-of-charge line but not a quantity of zero", () => {
    expect(buildPrLineEdit(HARDDISK, { unitCost: 0 }).error).toBeUndefined();
    expect(buildPrLineEdit(HARDDISK, { quantity: 0 }).error).toContain("not a valid quantity");
  });

  it("rejects values that are not numbers", () => {
    expect(buildPrLineEdit(HARDDISK, { quantity: "twenty" }).error).toContain("not a valid quantity");
    expect(buildPrLineEdit(HARDDISK, { unitCost: -5 }).error).toContain("not a valid unit price");
  });

  it("asks what to change when nothing was supplied", () => {
    const edit = buildPrLineEdit(HARDDISK, {});
    expect(edit.error).toContain("Tell me what to change");
    expect(edit.body).toEqual({});
  });
});
