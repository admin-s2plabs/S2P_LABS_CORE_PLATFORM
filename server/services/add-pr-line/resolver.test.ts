import { describe, expect, it, vi } from "vitest";
import {
  buildAddPrLineBody,
  findItemMasterMatch,
  findItemMasterMatchForQuery,
  formatAddPrLineConfirmation,
  formatAddPrLineResult,
  itemQueryVariants,
  normalizeItemQuery,
  pickAiAssistedUom,
  resolveAddPrLine,
  type AddPrLineDeps,
  type ItemMasterRecord,
  type PrContext,
  type ResolvedPrLine,
} from "./resolver";

/** The catalog row. Its "EA" unit is deliberately not a valid dropdown value. */
const LAPTOPS: ItemMasterRecord = {
  id: "ITEM_0007",
  itemCode: "SKU-LAP-01",
  name: "LAPTOPS",
  categoryCode: "12",
  categoryName: "Computer Hardware",
  unitOfMeasure: "EA",
  standardPrice: 800,
};

const INR_PR: PrContext = {
  prNumber: "PR_00064",
  currency: "INR",
  department: "Admin Department",
  budgetLineId: 41,
};

function createDeps(overrides: Partial<AddPrLineDeps> = {}) {
  const deps: AddPrLineDeps = {
    loadPrContext: vi.fn(async () => INR_PR),
    searchItemMaster: vi.fn(async () => [LAPTOPS]),
    getItemMasterById: vi.fn(async (id: string) => (id === LAPTOPS.id ? LAPTOPS : null)),
    // Stands in for the AI Assisted Service, which returns a unit from the UoM
    // dropdown master — never the catalog's "EA" — and a resolved price.
    assistItem: vi.fn(async () => ({ uom: "Each", unitPrice: 800, priceAssumed: false })),
    predictQuantity: vi.fn(async () => 10),
    ...overrides,
  };
  return deps;
}

const request = (overrides: Record<string, unknown> = {}) => ({
  prNumber: "PR_00064",
  itemDescription: "/LAPTOPS",
  quantity: 85,
  unitCost: 500,
  ...overrides,
});

async function resolveOk(overrides: Record<string, unknown> = {}, deps = createDeps()) {
  const result = await resolveAddPrLine(request(overrides) as any, deps);
  if (result.status !== "resolved") {
    throw new Error(`expected a resolved line, got ${result.status}: ${result.message}`);
  }
  return result.line;
}

describe("normalizeItemQuery", () => {
  it("strips the mention sigil", () => {
    expect(normalizeItemQuery("/LAPTOPS")).toBe("LAPTOPS");
  });

  it("strips the chip braces the composer renders with", () => {
    expect(normalizeItemQuery("{{/LAPTOPS}}")).toBe("LAPTOPS");
  });

  it("trims surrounding whitespace and collapses inner runs", () => {
    expect(normalizeItemQuery("  office   chairs  ")).toBe("office chairs");
  });

  it("drops trailing sentence punctuation and quotes", () => {
    expect(normalizeItemQuery('"laptops",')).toBe("laptops");
  });

  it("leaves casing alone so messages can quote the user back", () => {
    expect(normalizeItemQuery("Laptops")).toBe("Laptops");
  });
});

describe("findItemMasterMatch", () => {
  it("matches an exact name regardless of case", () => {
    for (const query of ["laptops", "LAPTOPS", "Laptops", "/LAPTOPS", "  laptops  "]) {
      const match = findItemMasterMatch([LAPTOPS], query);
      expect(match.status).toBe("matched");
      expect(match.status === "matched" && match.item.id).toBe("ITEM_0007");
    }
  });

  it("prefers an exact name over a longer catalog neighbour", () => {
    const pro = { ...LAPTOPS, id: "ITEM_0009", name: "LAPTOPS PRO 16" };
    const match = findItemMasterMatch([pro, LAPTOPS], "laptops");
    expect(match.status === "matched" && match.item.id).toBe("ITEM_0007");
  });

  it("matches on item code", () => {
    const match = findItemMasterMatch([LAPTOPS], "sku-lap-01");
    expect(match.status === "matched" && match.item.id).toBe("ITEM_0007");
  });

  it("accepts a single partial hit, so a singular query finds the plural item", () => {
    const match = findItemMasterMatch([LAPTOPS], "laptop");
    expect(match.status === "matched" && match.item.id).toBe("ITEM_0007");
  });

  it("reports ambiguity rather than guessing between partial hits", () => {
    const pro = { ...LAPTOPS, id: "ITEM_0009", name: "LAPTOPS PRO 16" };
    const air = { ...LAPTOPS, id: "ITEM_0010", name: "LAPTOPS AIR 13" };
    expect(findItemMasterMatch([pro, air], "laptop").status).toBe("ambiguous");
  });

  it("reports not-found for an empty catalog", () => {
    expect(findItemMasterMatch([], "green tea").status).toBe("not-found");
  });
});

describe("itemQueryVariants", () => {
  it("tries the literal query before anything else", () => {
    expect(itemQueryVariants("LAPTOPS")[0]).toBe("LAPTOPS");
  });

  it("offers the singular of a plural head noun", () => {
    expect(itemQueryVariants("bottles")).toEqual(["bottles", "bottle"]);
    expect(itemQueryVariants("office chairs")).toEqual(["office chairs", "office chair"]);
    expect(itemQueryVariants("boxes")).toEqual(["boxes", "box"]);
    expect(itemQueryVariants("batteries")).toEqual(["batteries", "battery"]);
  });

  it("leaves singular words that merely end in s alone", () => {
    for (const query of ["glass", "status", "analysis", "gas"]) {
      expect(itemQueryVariants(query)).toEqual([query]);
    }
  });

  it("normalizes before deciding, so a mention is handled like typed text", () => {
    expect(itemQueryVariants("{{/bottles}}")).toEqual(["bottles", "bottle"]);
  });

  it("has nothing to try for an empty query", () => {
    expect(itemQueryVariants("  ")).toEqual([]);
  });
});

describe("findItemMasterMatchForQuery", () => {
  /** Stands in for the catalog's substring search: it only finds longer names. */
  const substringSearch = (catalog: ItemMasterRecord[]) =>
    vi.fn(async (query: string) =>
      catalog.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
    );

  const BOTTLE: ItemMasterRecord = { ...LAPTOPS, id: "ITEM_0008", name: "Bottle" };

  it("finds a singular catalog row from a plural request", async () => {
    const search = substringSearch([BOTTLE]);
    const match = await findItemMasterMatchForQuery("bottles", search);

    expect(match.status === "matched" && match.item.id).toBe("ITEM_0008");
    expect(search).toHaveBeenCalledWith("bottles");
    expect(search).toHaveBeenCalledWith("bottle");
  });

  it("stops at the literal query when that already matches", async () => {
    const search = substringSearch([LAPTOPS]);
    const match = await findItemMasterMatchForQuery("LAPTOPS", search);

    expect(match.status === "matched" && match.item.id).toBe("ITEM_0007");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("keeps a shortlist rather than re-searching a different spelling", async () => {
    const pro = { ...LAPTOPS, id: "ITEM_0009", name: "LAPTOPS PRO 16" };
    const air = { ...LAPTOPS, id: "ITEM_0010", name: "LAPTOPS AIR 13" };
    const search = substringSearch([pro, air]);

    expect((await findItemMasterMatchForQuery("laptops", search)).status).toBe("ambiguous");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("still reports not-found when no form of the query matches", async () => {
    const search = substringSearch([LAPTOPS]);
    expect((await findItemMasterMatchForQuery("green teas", search)).status).toBe("not-found");
  });
});

describe("pickAiAssistedUom", () => {
  it("takes the unit the service returned for this item", () => {
    const suggestions = [
      { itemId: "ITEM_0001", unitOfMeasure: "Kilogram" },
      { itemId: "ITEM_0007", unitOfMeasure: "Each" },
    ];
    expect(pickAiAssistedUom(suggestions, "ITEM_0007")).toBe("Each");
  });

  it("ignores units suggested for other items", () => {
    expect(pickAiAssistedUom([{ itemId: "ITEM_0001", unitOfMeasure: "Box" }], "ITEM_0007")).toBeNull();
  });

  it("treats a blank unit as no answer", () => {
    expect(pickAiAssistedUom([{ itemId: "ITEM_0007", unitOfMeasure: "  " }], "ITEM_0007")).toBeNull();
  });
});

describe("resolveAddPrLine — item comes from the Item Master", () => {
  it("resolves the item id, name and category from the catalog row", async () => {
    const line = await resolveOk();
    expect(line.itemId).toBe("ITEM_0007");
    expect(line.itemCode).toBe("SKU-LAP-01");
    expect(line.itemName).toBe("LAPTOPS");
    expect(line.categoryCode).toBe("12");
    expect(line.categoryName).toBe("Computer Hardware");
  });

  it("searches the catalog with the sigil already stripped", async () => {
    const deps = createDeps();
    await resolveOk({}, deps);
    expect(deps.searchItemMaster).toHaveBeenCalledWith("LAPTOPS");
  });

  it("adds a singular catalog row when the request is phrased in the plural", async () => {
    const bottle = { ...LAPTOPS, id: "ITEM_0008", name: "Bottle" };
    const deps = createDeps({
      searchItemMaster: vi.fn(async (query: string) =>
        query.toLowerCase() === "bottle" ? [bottle] : [],
      ),
    });

    const line = await resolveOk({ itemDescription: "bottles" }, deps);
    expect(line.itemId).toBe("ITEM_0008");
    expect(line.itemName).toBe("Bottle");
  });

  it("names the line after the catalog row, not the user's phrasing", async () => {
    const deps = createDeps({
      searchItemMaster: vi.fn(async () => [{ ...LAPTOPS, name: "Laptop, 14in Business" }]),
    });
    const line = await resolveOk({ itemDescription: "laptop" }, deps);
    expect(line.itemName).toBe("Laptop, 14in Business");
  });

  it("prefers the Item Master row the user picked with a mention", async () => {
    const mentioned = { ...LAPTOPS, id: "ITEM_0042", name: "LAPTOPS" };
    const deps = createDeps({
      getItemMasterById: vi.fn(async () => mentioned),
      searchItemMaster: vi.fn(async () => [LAPTOPS]),
    });
    const line = await resolveOk(
      { itemMentions: [{ itemId: "ITEM_0042", name: "LAPTOPS" }] },
      deps,
    );
    expect(line.itemId).toBe("ITEM_0042");
    expect(deps.searchItemMaster).not.toHaveBeenCalled();
  });

  it("falls back to a catalog search when the mention no longer exists", async () => {
    const deps = createDeps({ getItemMasterById: vi.fn(async () => null) });
    const line = await resolveOk(
      { itemMentions: [{ itemId: "GONE", name: "LAPTOPS" }] },
      deps,
    );
    expect(line.itemId).toBe("ITEM_0007");
  });

  it("rejects an item the Item Master does not have", async () => {
    const deps = createDeps({ searchItemMaster: vi.fn(async () => []) });
    const result = await resolveAddPrLine(request({ itemDescription: "Green Tea" }) as any, deps);
    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" && result.reason).toBe("item-not-found");
    expect(result.status === "rejected" && result.message).toContain(
      `I couldn't find "Green Tea" in the Item Master`,
    );
  });

  it("does not consult the AI Assisted Service for an unresolvable item", async () => {
    const deps = createDeps({ searchItemMaster: vi.fn(async () => []) });
    await resolveAddPrLine(request({ itemDescription: "Green Tea" }) as any, deps);
    expect(deps.assistItem).not.toHaveBeenCalled();
    expect(deps.predictQuantity).not.toHaveBeenCalled();
  });

  it("asks which item was meant when several could match", async () => {
    const deps = createDeps({
      searchItemMaster: vi.fn(async () => [
        { ...LAPTOPS, id: "A", name: "LAPTOPS PRO 16" },
        { ...LAPTOPS, id: "B", name: "LAPTOPS AIR 13" },
      ]),
    });
    const result = await resolveAddPrLine(request({ itemDescription: "laptop" }) as any, deps);
    expect(result.status === "rejected" && result.reason).toBe("item-ambiguous");
    expect(result.status === "rejected" && result.message).toContain("LAPTOPS PRO 16");
  });
});

describe("resolveAddPrLine — unit of measure comes from the AI Assisted Service", () => {
  const withUom = (uom: string) =>
    createDeps({ assistItem: vi.fn(async () => ({ uom, unitPrice: 800, priceAssumed: false })) });

  it("uses the unit the service returned", async () => {
    expect((await resolveOk({}, withUom("Box"))).uom).toBe("Box");
  });

  it("never falls back to the catalog's own unit", async () => {
    const line = await resolveOk();
    expect(line.uom).toBe("Each");
    expect(line.uom).not.toBe(LAPTOPS.unitOfMeasure);
  });

  it("never hardcodes EA", async () => {
    expect((await resolveOk({}, withUom("Kilogram"))).uom).toBe("Kilogram");
  });

  it("asks the service about the resolved catalog item and the PR's department", async () => {
    const deps = createDeps();
    await resolveOk({}, deps);
    expect(deps.assistItem).toHaveBeenCalledWith(LAPTOPS, { department: "Admin Department" });
  });
});

describe("resolveAddPrLine — currency comes from the target PR", () => {
  it("uses the PR's currency", async () => {
    expect((await resolveOk()).currency).toBe("INR");
  });

  it("does not let an INR requisition pick up AED", async () => {
    const line = await resolveOk();
    expect(line.currency).not.toBe("AED");
  });

  it("uses AED when the PR really is in AED", async () => {
    const deps = createDeps({
      loadPrContext: vi.fn(async () => ({ ...INR_PR, currency: "AED" })),
    });
    expect((await resolveOk({}, deps)).currency).toBe("AED");
  });

  it("uses USD when the PR really is in USD", async () => {
    const deps = createDeps({
      loadPrContext: vi.fn(async () => ({ ...INR_PR, currency: "USD" })),
    });
    expect((await resolveOk({}, deps)).currency).toBe("USD");
  });

  it("ignores a currency the caller tries to supply", async () => {
    const line = await resolveOk({ currency: "AED" });
    expect(line.currency).toBe("INR");
  });

  it("reads the PR before anything else, so no step can precede the currency", async () => {
    const order: string[] = [];
    const deps = createDeps({
      loadPrContext: vi.fn(async () => {
        order.push("pr");
        return INR_PR;
      }),
      searchItemMaster: vi.fn(async () => {
        order.push("item");
        return [LAPTOPS];
      }),
      assistItem: vi.fn(async () => {
        order.push("assist");
        return { uom: "Each", unitPrice: 800, priceAssumed: false };
      }),
    });
    await resolveOk({}, deps);
    expect(order).toEqual(["pr", "item", "assist"]);
  });

  it("rejects a PR that does not exist", async () => {
    const deps = createDeps({ loadPrContext: vi.fn(async () => null) });
    const result = await resolveAddPrLine(request() as any, deps);
    expect(result.status === "rejected" && result.reason).toBe("pr-not-found");
  });
});

describe("resolveAddPrLine — quantity, price and total", () => {
  it("keeps the quantity and unit price the user asked for", async () => {
    const line = await resolveOk();
    expect(line.quantity).toBe(85);
    expect(line.unitCost).toBe(500);
  });

  it("multiplies quantity by unit price", async () => {
    expect((await resolveOk()).amount).toBe(42500);
  });

  it("marks nothing as derived when the user stated both", async () => {
    const line = await resolveOk();
    expect(line.quantityPredicted).toBe(false);
    expect(line.priceAssumed).toBe(false);
  });

  it("keeps a stated price of zero, which is a real free-of-charge line", async () => {
    const line = await resolveOk({ unitCost: 0 });
    expect(line.unitCost).toBe(0);
    expect(line.amount).toBe(0);
  });
});

describe("resolveAddPrLine — filling in what the user left out", () => {
  const unstated = { quantity: undefined, unitCost: undefined };

  it("predicts the quantity when the request has none", async () => {
    const line = await resolveOk(unstated);
    expect(line.quantity).toBe(10);
    expect(line.quantityPredicted).toBe(true);
  });

  it("prices the item from the AI Assisted Service when the request has none", async () => {
    const line = await resolveOk(unstated);
    expect(line.unitCost).toBe(800);
  });

  it("totals the derived quantity against the derived price", async () => {
    expect((await resolveOk(unstated)).amount).toBe(8000);
  });

  it("passes the resolved item, department and budget line to prediction", async () => {
    const deps = createDeps();
    await resolveOk(unstated, deps);
    expect(deps.predictQuantity).toHaveBeenCalledWith(LAPTOPS, {
      department: "Admin Department",
      budgetLineId: 41,
    });
  });

  it("does not predict a quantity the user already stated", async () => {
    const deps = createDeps();
    await resolveOk({ unitCost: undefined }, deps);
    expect(deps.predictQuantity).not.toHaveBeenCalled();
  });

  it("keeps a stated quantity even when prediction would disagree", async () => {
    const deps = createDeps({ predictQuantity: vi.fn(async () => 10) });
    expect((await resolveOk({ unitCost: undefined }, deps)).quantity).toBe(85);
  });

  it("keeps a stated price even when the service has one of its own", async () => {
    const line = await resolveOk({ quantity: undefined });
    expect(line.unitCost).toBe(500);
    expect(line.priceAssumed).toBe(false);
  });

  it("flags an estimated price so the user can correct it", async () => {
    const deps = createDeps({
      assistItem: vi.fn(async () => ({ uom: "Each", unitPrice: 750, priceAssumed: true })),
    });
    const line = await resolveOk(unstated, deps);
    expect(line.unitCost).toBe(750);
    expect(line.priceAssumed).toBe(true);
  });

  it("does not flag a stated price as an estimate", async () => {
    const deps = createDeps({
      assistItem: vi.fn(async () => ({ uom: "Each", unitPrice: 750, priceAssumed: true })),
    });
    expect((await resolveOk({ quantity: undefined }, deps)).priceAssumed).toBe(false);
  });

  it("asks for a quantity when prediction cannot answer", async () => {
    const deps = createDeps({ predictQuantity: vi.fn(async () => null) });
    const result = await resolveAddPrLine(request(unstated) as any, deps);
    expect(result.status === "rejected" && result.reason).toBe("invalid-quantity");
    expect(result.status === "rejected" && result.message).toContain("How many LAPTOPS");
  });

  it("asks for a price when no source can price the item", async () => {
    const deps = createDeps({
      assistItem: vi.fn(async () => ({ uom: "Each", unitPrice: null, priceAssumed: false })),
    });
    const result = await resolveAddPrLine(request(unstated) as any, deps);
    expect(result.status === "rejected" && result.reason).toBe("invalid-unit-price");
  });

  it("treats a quantity of zero as unstated rather than as a line for none", async () => {
    const line = await resolveOk({ quantity: 0 });
    expect(line.quantity).toBe(10);
    expect(line.quantityPredicted).toBe(true);
  });
});

describe("confirmation and result messages", () => {
  const line: ResolvedPrLine = {
    prNumber: "PR_00064",
    itemId: "ITEM_0007",
    itemCode: "SKU-LAP-01",
    itemName: "LAPTOPS",
    categoryCode: "12",
    categoryName: "Computer Hardware",
    uom: "Each",
    quantity: 85,
    unitCost: 500,
    currency: "INR",
    amount: 42500,
    quantityPredicted: false,
    priceAssumed: false,
  };

  it("labels a predicted quantity", () => {
    const summary = formatAddPrLineConfirmation({ ...line, quantityPredicted: true });
    expect(summary).toContain("**Quantity:** 85 _(AI predicted)_");
    expect(summary).toContain("Tell me a different quantity");
  });

  it("labels an estimated price", () => {
    const summary = formatAddPrLineConfirmation({ ...line, priceAssumed: true });
    expect(summary).toContain("**Unit Cost:** INR 500 _(estimated)_");
    expect(summary).toContain("Tell me a different price");
  });

  it("leaves values the user stated unlabelled", () => {
    const summary = formatAddPrLineConfirmation(line);
    expect(summary).toContain("**Quantity:** 85\n");
    expect(summary).not.toContain("_(AI predicted)_");
    expect(summary).not.toContain("_(estimated)_");
  });

  it("quotes the PR's currency in the confirmation", () => {
    const summary = formatAddPrLineConfirmation(line);
    expect(summary).toContain("**Unit Cost:** INR 500");
    expect(summary).toContain("**Line Total:** INR 42,500");
    expect(summary).not.toContain("AED");
  });

  it("shows the Item Master name, category and the assisted unit", () => {
    const summary = formatAddPrLineConfirmation(line);
    expect(summary).toContain("**Item:** LAPTOPS");
    expect(summary).toContain("**Category:** Computer Hardware");
    expect(summary).toContain("**UOM:** Each");
  });

  it("quotes the same currency once the line exists", () => {
    const message = formatAddPrLineResult(line);
    expect(message).toContain("**Total**: INR 42,500");
    expect(message).not.toContain("AED");
  });
});

describe("buildAddPrLineBody", () => {
  const line: ResolvedPrLine = {
    prNumber: "PR_00064",
    itemId: "ITEM_0007",
    itemCode: "SKU-LAP-01",
    itemName: "LAPTOPS",
    categoryCode: "12",
    categoryName: "Computer Hardware",
    uom: "Each",
    quantity: 85,
    unitCost: 500,
    currency: "INR",
    amount: 42500,
    quantityPredicted: true,
    priceAssumed: true,
  };

  it("posts the same fields the manual Add Line Item form posts", () => {
    expect(buildAddPrLineBody(line)).toEqual({
      itemDescription: "LAPTOPS",
      quantity: "85",
      uom: "Each",
      unitCost: "500",
      itemId: "ITEM_0007",
      categoryId: "12",
      categoryName: "Computer Hardware",
      currency: "INR",
    });
  });

  it("carries the Item Master reference so the line is not free text", () => {
    const body = buildAddPrLineBody(line);
    expect(body.itemId).toBe("ITEM_0007");
    expect(body.categoryId).toBe("12");
  });
});
