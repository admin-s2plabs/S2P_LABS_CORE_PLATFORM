import { describe, expect, it } from "vitest";
import type { PrRecommendationLineItem } from "@shared/agent-pr-recommendation";
import {
  applyLineItemPatch,
  applyMasterItemSelection,
  deriveLineState,
  isLineItemComplete,
  lineItemIssues,
  type MasterItem,
} from "./recommendation-line-items";

function lineItem(overrides: Partial<PrRecommendationLineItem> = {}): PrRecommendationLineItem {
  return {
    description: "Dell Latitude Laptop",
    quantity: 8,
    unitOfMeasure: "Each",
    estimatedPrice: 800,
    itemId: "ITEM-1",
    itemCode: "IT-001",
    categoryName: "Office Supplies",
    aiGenerated: false,
    ...overrides,
  };
}

function master(overrides: Partial<MasterItem> = {}): MasterItem {
  return {
    id: "ITEM-9",
    itemCode: "IT-009",
    name: "LED Monitor",
    categoryCode: "43211902",
    categoryName: "Displays",
    unitOfMeasure: "Nos",
    standardPrice: 250,
    ...overrides,
  };
}

describe("applyLineItemPatch", () => {
  it("edits only the targeted row", () => {
    const items = [lineItem(), lineItem({ description: "LED Monitor" })];
    const next = applyLineItemPatch(items, 1, { quantity: "3" });
    expect(next[0]).toBe(items[0]);
    expect(next[1].quantity).toBe(3);
  });

  it("clears the predicted-quantity badge once the user types a quantity", () => {
    const next = applyLineItemPatch([lineItem({ quantity: 8, quantityPredicted: true })], 0, {
      quantity: "12",
    });
    expect(next[0].quantity).toBe(12);
    expect(next[0].quantityPredicted).toBe(false);
  });

  it("treats a blank, zero or negative quantity as unset", () => {
    for (const raw of ["", "   ", "0", "-4", "abc"]) {
      expect(applyLineItemPatch([lineItem()], 0, { quantity: raw })[0].quantity).toBeNull();
    }
  });

  it("edits the unit of measure", () => {
    expect(applyLineItemPatch([lineItem()], 0, { unitOfMeasure: "Box" })[0].unitOfMeasure).toBe("Box");
  });

  it("edits the unit price and clears the estimated-price badge", () => {
    const next = applyLineItemPatch([lineItem({ priceAssumed: true })], 0, { estimatedPrice: "900" });
    expect(next[0].estimatedPrice).toBe(900);
    expect(next[0].priceAssumed).toBe(false);
  });

  it("floors a blank or negative unit price at zero", () => {
    for (const raw of ["", "-1", "nope"]) {
      expect(applyLineItemPatch([lineItem()], 0, { estimatedPrice: raw })[0].estimatedPrice).toBe(0);
    }
  });

  it("leaves untouched fields alone", () => {
    const next = applyLineItemPatch([lineItem()], 0, { quantity: "2" });
    expect(next[0].unitOfMeasure).toBe("Each");
    expect(next[0].estimatedPrice).toBe(800);
    expect(next[0].itemId).toBe("ITEM-1");
  });
});

describe("applyMasterItemSelection", () => {
  it("replaces the free-text line with the catalog item", () => {
    const items = [lineItem({ description: "MacBook Covers", itemId: undefined, aiGenerated: true })];
    const next = applyMasterItemSelection(items, 0, master());

    expect(next[0].itemId).toBe("ITEM-9");
    expect(next[0].itemCode).toBe("IT-009");
    expect(next[0].description).toBe("LED Monitor");
    expect(next[0].categoryName).toBe("Displays");
    expect(next[0].unitOfMeasure).toBe("Nos");
    expect(next[0].estimatedPrice).toBe(250);
    expect(next[0].aiGenerated).toBe(false);
    expect(next[0].priceAssumed).toBe(false);
  });

  it("keeps the quantity the user already entered", () => {
    const next = applyMasterItemSelection([lineItem({ quantity: 8 })], 0, master());
    expect(next[0].quantity).toBe(8);
  });

  it("keeps the existing price when the catalog item has none", () => {
    const next = applyMasterItemSelection(
      [lineItem({ estimatedPrice: 800, priceAssumed: true })],
      0,
      master({ standardPrice: null }),
    );
    expect(next[0].estimatedPrice).toBe(800);
    expect(next[0].priceAssumed).toBe(true);
  });

  it("keeps the existing unit when the catalog item has none", () => {
    const next = applyMasterItemSelection([lineItem()], 0, master({ unitOfMeasure: null }));
    expect(next[0].unitOfMeasure).toBe("Each");
  });

  it("allows swapping an already-selected item", () => {
    const first = applyMasterItemSelection([lineItem()], 0, master());
    const second = applyMasterItemSelection(first, 0, master({ id: "ITEM-3", name: "Keyboard" }));
    expect(second[0].itemId).toBe("ITEM-3");
    expect(second[0].description).toBe("Keyboard");
  });
});

describe("applyMasterItemSelection over an unmatched line", () => {
  /** What the engine now produces for "Green Tea" when it is not a catalog item. */
  const unmatched = lineItem({
    description: "Green Tea",
    quantity: null,
    unitOfMeasure: "",
    estimatedPrice: 0,
    itemId: undefined,
    itemCode: undefined,
    aiGenerated: true,
  });

  it("takes the unit and price from the chosen catalog item", () => {
    const next = applyMasterItemSelection([unmatched], 0, master());

    expect(next[0].itemId).toBe("ITEM-9");
    expect(next[0].description).toBe("LED Monitor");
    expect(next[0].unitOfMeasure).toBe("Nos");
    expect(next[0].estimatedPrice).toBe(250);
    expect(next[0].priceAssumed).toBe(false);
  });

  it("does not inherit a stale price when the chosen item has none", () => {
    // The pre-fix failure: Green Tea's guessed price following a real item.
    const stale = { ...unmatched, estimatedPrice: 10, priceAssumed: true };
    const next = applyMasterItemSelection([stale], 0, master({ standardPrice: null }));

    expect(next[0].estimatedPrice).toBe(0);
    expect(next[0].priceAssumed).toBe(false);
  });

  it("does not inherit a stale unit when the chosen item has none", () => {
    const stale = { ...unmatched, unitOfMeasure: "EA" };
    const next = applyMasterItemSelection([stale], 0, master({ unitOfMeasure: null }));

    expect(next[0].unitOfMeasure).toBe("Each");
  });

  it("keeps the quantity the user typed against the placeholder", () => {
    const next = applyMasterItemSelection([{ ...unmatched, quantity: 8 }], 0, master());

    expect(next[0].quantity).toBe(8);
  });

  it("unblocks creation once a catalog item replaces the placeholder", () => {
    expect(lineItemIssues([unmatched])).toEqual(["lineItemQuantity", "lineItemDescription"]);

    const next = applyMasterItemSelection([{ ...unmatched, quantity: 8 }], 0, master());
    expect(lineItemIssues(next)).toEqual([]);
  });
});

describe("lineItemIssues", () => {
  it("reports nothing for a complete line", () => {
    expect(lineItemIssues([lineItem()])).toEqual([]);
  });

  it("reports a missing quantity", () => {
    expect(lineItemIssues([lineItem({ quantity: null })])).toEqual(["lineItemQuantity"]);
  });

  it("reports a line with no item master id", () => {
    expect(lineItemIssues([lineItem({ itemId: undefined })])).toEqual(["lineItemDescription"]);
  });

  it("reports a line whose description is blank", () => {
    expect(lineItemIssues([lineItem({ description: "  " })])).toEqual(["lineItemDescription"]);
  });

  it("reports both problems at once", () => {
    expect(lineItemIssues([lineItem({ quantity: null, itemId: undefined })])).toEqual([
      "lineItemQuantity",
      "lineItemDescription",
    ]);
  });
});

describe("isLineItemComplete", () => {
  it("requires a quantity and an item master id", () => {
    expect(isLineItemComplete(lineItem())).toBe(true);
    expect(isLineItemComplete(lineItem({ quantity: null }))).toBe(false);
    expect(isLineItemComplete(lineItem({ itemId: undefined }))).toBe(false);
  });
});

describe("deriveLineState", () => {
  const ready = { unresolved: [] as string[] };

  it("allows creation when the header and every line are complete", () => {
    expect(deriveLineState(ready, [lineItem()])).toEqual({ unresolved: [], canCreate: true });
  });

  it("blocks creation while a header field is unresolved", () => {
    const state = deriveLineState({ unresolved: ["budget"] }, [lineItem()]);
    expect(state.canCreate).toBe(false);
    expect(state.unresolved).toEqual(["budget"]);
  });

  it("blocks creation while a choice is pending", () => {
    expect(deriveLineState({ ...ready, pendingChoice: { field: "budget" } }, [lineItem()]).canCreate).toBe(
      false,
    );
  });

  it("blocks creation when there are no line items at all", () => {
    expect(deriveLineState(ready, []).canCreate).toBe(false);
  });

  it("blocks creation until an unmatched item is replaced with a catalog item", () => {
    const items = [lineItem({ description: "MacBook Covers", itemId: undefined })];
    expect(deriveLineState(ready, items).canCreate).toBe(false);

    const fixed = applyMasterItemSelection(items, 0, master());
    expect(deriveLineState(ready, fixed)).toEqual({ unresolved: [], canCreate: true });
  });

  it("drops stale line-item keys the server sent and rebuilds them from the rows", () => {
    const state = deriveLineState({ unresolved: ["lineItemQuantity", "lineItemDescription"] }, [
      lineItem(),
    ]);
    expect(state.unresolved).toEqual([]);
    expect(state.canCreate).toBe(true);
  });

  it("honours the card's extra header requirements", () => {
    expect(deriveLineState(ready, [lineItem()], false).canCreate).toBe(false);
  });
});
