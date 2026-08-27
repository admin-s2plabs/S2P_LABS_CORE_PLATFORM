import { describe, expect, it } from "vitest";
import { mergeRequisitionLine, type RequisitionLineRow } from "./requisition-line-patch";

/** Line 1 of PR_00076 as the detail page shows it before any edit. */
const EXISTING: RequisitionLineRow = {
  item_description: "harddisk",
  qty: 15,
  uom: "Each",
  unit_cost: 50,
  product_category: 12,
  product_category_name: "Computer Hardware",
  item_id: 11,
  curr_code: "INR",
};

describe("mergeRequisitionLine — a quantity-only edit leaves the rest alone", () => {
  const merged = mergeRequisitionLine(EXISTING, { quantity: 20 });

  it("applies the new quantity", () => {
    expect(merged.qty).toBe(20);
  });

  it("keeps the item description", () => {
    expect(merged.itemDescription).toBe("harddisk");
  });

  it("keeps the unit cost", () => {
    expect(merged.unitCost).toBe(50);
  });

  it("keeps the unit of measure", () => {
    expect(merged.uom).toBe("Each");
  });

  it("keeps the Item Master link and category", () => {
    expect(merged.itemId).toBe("11");
    expect(merged.categoryId).toBe("12");
    expect(merged.categoryName).toBe("Computer Hardware");
  });

  it("keeps the line currency, with no AED default", () => {
    expect(merged.currency).toBe("INR");
  });

  it("recomputes the amount from the merged quantity and unit cost", () => {
    expect(merged.amount).toBe(1000);
  });
});

describe("mergeRequisitionLine — other single-field edits", () => {
  it("changes only the unit price, and the amount that follows from it", () => {
    const merged = mergeRequisitionLine(EXISTING, { unitCost: 150 });
    expect(merged.unitCost).toBe(150);
    expect(merged.qty).toBe(15);
    expect(merged.amount).toBe(2250);
    expect(merged.itemDescription).toBe("harddisk");
  });

  it("changes only the unit of measure", () => {
    const merged = mergeRequisitionLine(EXISTING, { uom: "Box" });
    expect(merged.uom).toBe("Box");
    expect(merged.qty).toBe(15);
    expect(merged.unitCost).toBe(50);
    expect(merged.amount).toBe(750);
  });

  it("changes only the description", () => {
    const merged = mergeRequisitionLine(EXISTING, { description: "harddisk 2TB" });
    expect(merged.itemDescription).toBe("harddisk 2TB");
    expect(merged.itemId).toBe("11");
  });

  it("applies quantity and unit price together", () => {
    const merged = mergeRequisitionLine(EXISTING, { quantity: 20, unitCost: 150 });
    expect(merged.amount).toBe(3000);
  });
});

describe("mergeRequisitionLine — the manual Edit Line Item body", () => {
  // The sheet posts every field, including explicit nulls for a free-text line.
  const merged = mergeRequisitionLine(EXISTING, {
    description: "harddisk",
    quantity: 12,
    unitCost: 60,
    uom: "Each",
    categoryCode: null,
    categoryName: null,
    itemId: null,
  });

  it("writes what the sheet sent", () => {
    expect(merged.qty).toBe(12);
    expect(merged.unitCost).toBe(60);
    expect(merged.amount).toBe(720);
  });

  it("clears the fields it explicitly sent as null", () => {
    expect(merged.itemId).toBeNull();
    expect(merged.categoryId).toBeNull();
    expect(merged.categoryName).toBeNull();
  });

  it("keeps the currency the sheet never sends", () => {
    expect(merged.currency).toBe("INR");
  });
});

describe("mergeRequisitionLine — defaults", () => {
  it("falls back to the header currency for a line that stored none", () => {
    const merged = mergeRequisitionLine({ ...EXISTING, curr_code: null }, { quantity: 2 }, "USD");
    expect(merged.currency).toBe("USD");
  });

  it("never invents a currency when neither the line nor the header has one", () => {
    const merged = mergeRequisitionLine({ ...EXISTING, curr_code: null }, { quantity: 2 });
    expect(merged.currency).toBe("");
  });

  it("keeps a unit on a line that stored none, since the dropdown has no blank", () => {
    const merged = mergeRequisitionLine({ ...EXISTING, uom: null }, { quantity: 2 });
    expect(merged.uom).toBe("Each");
  });

  it("reads string columns the driver returns for numeric types", () => {
    const merged = mergeRequisitionLine(
      { ...EXISTING, qty: "15", unit_cost: "50.5" },
      { quantity: 4 },
    );
    expect(merged.unitCost).toBe(50.5);
    expect(merged.amount).toBe(202);
  });
});
