import { describe, expect, it } from "vitest";
import { buyerFrequencyFromPoHistory, mostFrequent, selectBuyer } from "./buyer-selector";
import type { ActiveBuyer, PoHistoryRow } from "./ports";

function po(poNumber: string, buyerId: number | null, buyerName: string | null): PoHistoryRow {
  return {
    poNumber,
    createdDate: new Date("2026-01-01"),
    requiredDate: new Date("2026-01-15"),
    orgId: 1,
    departmentName: "IT Department",
    buyerId,
    buyerName,
    deliveryLocationId: "1",
    deliveryLocationName: "Head Quarters Dubai",
  };
}

const POOL: ActiveBuyer[] = [
  { userId: 11, name: "Alice Buyer", email: "alice@example.com" },
  { userId: 12, name: "Bob Buyer", email: "bob@example.com" },
];

const EMPTY = { poHistory: [], entityPool: [], entityHistory: [], orgPool: [], orgHistory: [] };

describe("mostFrequent", () => {
  it("returns the highest count", () => {
    const result = mostFrequent([
      { userId: 1, name: "A", count: 2 },
      { userId: 2, name: "B", count: 9 },
    ]);
    expect(result?.userId).toBe(2);
  });

  it("breaks ties by name", () => {
    const result = mostFrequent([
      { userId: 2, name: "Zoe", count: 5 },
      { userId: 1, name: "Adam", count: 5 },
    ]);
    expect(result?.name).toBe("Adam");
  });

  it("restricts to the allowed set", () => {
    const result = mostFrequent(
      [
        { userId: 1, name: "Inactive", count: 99 },
        { userId: 2, name: "Active", count: 1 },
      ],
      new Set([2]),
    );
    expect(result?.userId).toBe(2);
  });

  it("returns null when nothing is eligible", () => {
    expect(mostFrequent([{ userId: 1, name: "A", count: 3 }], new Set([9]))).toBeNull();
    expect(mostFrequent([])).toBeNull();
  });
});

describe("buyerFrequencyFromPoHistory", () => {
  it("counts each purchase order once", () => {
    const result = buyerFrequencyFromPoHistory([
      po("PO1", 5, "Buyer Five"),
      po("PO1", 5, "Buyer Five"),
      po("PO2", 5, "Buyer Five"),
    ]);
    expect(result).toEqual([{ userId: 5, name: "Buyer Five", count: 2 }]);
  });

  it("skips rows without a buyer", () => {
    expect(buyerFrequencyFromPoHistory([po("PO1", null, null)])).toEqual([]);
  });
});

describe("selectBuyer", () => {
  it("prefers the most frequent buyer on matching purchase orders", () => {
    const selection = selectBuyer({
      ...EMPTY,
      poHistory: [po("PO1", 11, "Alice Buyer"), po("PO2", 11, "Alice Buyer"), po("PO3", 12, "Bob Buyer")],
      entityPool: POOL,
    });
    expect(selection.source).toBe("po_history");
    expect(selection.buyer?.name).toBe("Alice Buyer");
    expect(selection.sampleSize).toBe(2);
  });

  it("falls back to entity assignment history", () => {
    const selection = selectBuyer({
      ...EMPTY,
      entityPool: POOL,
      entityHistory: [{ userId: 12, name: "Bob Buyer", count: 17 }],
    });
    expect(selection.source).toBe("po_history");
    expect(selection.buyer?.id).toBe("12");
  });

  it("falls back organization-wide when the entity has no buyers", () => {
    const selection = selectBuyer({
      ...EMPTY,
      orgPool: [{ userId: 21, name: "Org Buyer", email: null }],
      orgHistory: [{ userId: 21, name: "Org Buyer", count: 4 }],
    });
    expect(selection.buyer?.name).toBe("Org Buyer");
    expect(selection.rationale).toContain("the organization");
  });

  it("returns none when there are no active buyers anywhere", () => {
    const selection = selectBuyer(EMPTY);
    expect(selection.source).toBe("none");
    expect(selection.buyer).toBeNull();
    expect(selection.options).toEqual([]);
  });
});

describe("selectBuyer — never proposes someone the dropdown cannot show", () => {
  // The PR_00080 case: two approved T-shirt POs name a buyer who no longer
  // holds a procurement role, so the card rendered an unexplained empty box.
  const outsider = [po("PO1", 77, "Retired Rita"), po("PO2", 77, "Retired Rita")];

  it("leaves the field for the user and names who was passed over", () => {
    const selection = selectBuyer({ ...EMPTY, poHistory: outsider, entityPool: POOL });
    expect(selection.buyer).toBeNull();
    expect(selection.source).toBe("needs_selection");
    expect(selection.rationale).toContain("Retired Rita");
    expect(selection.rationale).toContain("2 matching approved POs");
    expect(selection.rationale).toContain("please select a buyer from the list");
  });

  it("still offers the pool, so the user can actually choose", () => {
    const selection = selectBuyer({ ...EMPTY, poHistory: outsider, entityPool: POOL });
    expect(selection.options).toEqual([
      { id: "11", name: "Alice Buyer" },
      { id: "12", name: "Bob Buyer" },
    ]);
  });

  it("prefers assignment history over an unselectable purchase order buyer", () => {
    const selection = selectBuyer({
      ...EMPTY,
      poHistory: outsider,
      entityPool: POOL,
      entityHistory: [{ userId: 12, name: "Bob Buyer", count: 3 }],
    });
    expect(selection.buyer?.name).toBe("Bob Buyer");
    expect(selection.source).toBe("po_history");
  });

  it("asks rather than picking at random when there is no history at all", () => {
    const selection = selectBuyer({ ...EMPTY, entityPool: POOL });
    expect(selection.buyer).toBeNull();
    expect(selection.source).toBe("needs_selection");
    expect(selection.rationale).toBe(
      "No buyer history for these items — please select a buyer from the list.",
    );
  });

  it("asks when every historical assignee has left the pool", () => {
    const selection = selectBuyer({
      ...EMPTY,
      entityPool: POOL,
      entityHistory: [{ userId: 99, name: "Departed", count: 50 }],
    });
    expect(selection.buyer).toBeNull();
    expect(selection.source).toBe("needs_selection");
  });

  it("only ever returns a buyer that is one of the options", () => {
    const cases = [
      { ...EMPTY, poHistory: outsider, entityPool: POOL },
      { ...EMPTY, entityPool: POOL },
      { ...EMPTY, poHistory: [po("PO1", 11, "Alice Buyer")], entityPool: POOL },
      { ...EMPTY, entityPool: POOL, entityHistory: [{ userId: 12, name: "Bob Buyer", count: 1 }] },
      { ...EMPTY, orgPool: POOL, orgHistory: [{ userId: 11, name: "Alice Buyer", count: 2 }] },
    ];
    for (const input of cases) {
      const selection = selectBuyer(input);
      if (selection.buyer) {
        expect(selection.options.map((option) => option.id)).toContain(selection.buyer.id);
      }
    }
  });
});
