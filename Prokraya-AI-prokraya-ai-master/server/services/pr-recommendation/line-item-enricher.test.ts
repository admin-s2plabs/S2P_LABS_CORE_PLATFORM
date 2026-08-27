import { describe, expect, it } from "vitest";
import {
  ENRICHMENT_MATCH_FLOOR,
  applyEstimatedPrices,
  enrichParsedLine,
  findMatchingSuggestion,
  lineItemsFromSuggestions,
  mergeParsedWithSuggestions,
  type CatalogEnrichment,
  type ParsedLine,
  type SuggestedLine,
} from "./line-item-enricher";

function parsed(overrides: Partial<ParsedLine> = {}): ParsedLine {
  return {
    description: "Dell Latitude Laptop",
    quantity: 25,
    // What the parser produces today: an unvalidated UoM code and no price
    // because the item master has none.
    unitOfMeasure: "EA",
    estimatedPrice: 0,
    ...overrides,
  };
}

function suggested(overrides: Partial<SuggestedLine> = {}): SuggestedLine {
  return {
    itemId: "ITEM-1",
    itemCode: "EL-WIRE-0023",
    name: "Dell Latitude Laptop",
    unitPrice: 800,
    priceAssumed: false,
    unitOfMeasure: "Each",
    categoryCode: "43211503",
    categoryName: "Office Supplies",
    ...overrides,
  };
}

function catalog(overrides: Partial<CatalogEnrichment> = {}): CatalogEnrichment {
  return {
    itemId: "ITEM-1",
    itemCode: "EL-WIRE-0023",
    unitOfMeasure: "Each",
    unitPrice: 1200,
    categoryCode: "43211503",
    categoryName: "Computer Hardware",
    ...overrides,
  };
}

describe("findMatchingSuggestion", () => {
  it("prefers an exact item id match over a closer-looking name", () => {
    const target = suggested({ itemId: "ITEM-2", name: "Completely Different Thing" });
    const decoy = suggested({ itemId: "ITEM-9", name: "Dell Latitude Laptop" });

    const match = findMatchingSuggestion(parsed({ suggestedItemId: "ITEM-2" }), [decoy, target]);

    expect(match).toBe(target);
  });

  it("falls back to the best name match when the parser matched no catalog item", () => {
    const laptop = suggested({ itemId: "ITEM-1", name: "Laptop Computer" });
    const monitor = suggested({ itemId: "ITEM-2", name: "LED Monitor" });

    expect(findMatchingSuggestion(parsed({ description: "laptops" }), [monitor, laptop])).toBe(laptop);
  });

  it("matches on the name when the parser's item id is not among the suggestions", () => {
    const laptop = suggested({ itemId: "ITEM-7", name: "Dell Latitude Laptop" });

    expect(findMatchingSuggestion(parsed({ suggestedItemId: "ITEM-MISSING" }), [laptop])).toBe(laptop);
  });

  it("returns null rather than borrowing an unrelated item's price", () => {
    const unrelated = suggested({ itemId: "ITEM-3", name: "Cement Bag" });

    expect(findMatchingSuggestion(parsed({ description: "laptops" }), [unrelated])).toBeNull();
  });

  it("returns null when there are no suggestions at all", () => {
    expect(findMatchingSuggestion(parsed(), [])).toBeNull();
  });

  it("keeps the acceptance floor within a sane range", () => {
    expect(ENRICHMENT_MATCH_FLOOR).toBeGreaterThan(0);
    expect(ENRICHMENT_MATCH_FLOOR).toBeLessThan(1);
  });
});

describe("enrichParsedLine", () => {
  it("takes the resolved unit and real price from the suggestion", () => {
    const result = enrichParsedLine(parsed(), suggested());

    expect(result.unitOfMeasure).toBe("Each");
    expect(result.estimatedPrice).toBe(800);
    expect(result.priceAssumed).toBe(false);
  });

  it("keeps the parser's description and quantity", () => {
    const result = enrichParsedLine(
      parsed({ description: "25 engineering laptops", quantity: 25 }),
      suggested({ name: "Dell Latitude Laptop" }),
    );

    expect(result.description).toBe("25 engineering laptops");
    expect(result.quantity).toBe(25);
  });

  it("preserves a null quantity so it can be predicted later", () => {
    expect(enrichParsedLine(parsed({ quantity: null }), suggested()).quantity).toBeNull();
  });

  it("flags a price the suggestion service had to estimate", () => {
    const result = enrichParsedLine(parsed(), suggested({ unitPrice: 950, priceAssumed: true }));

    expect(result.estimatedPrice).toBe(950);
    expect(result.priceAssumed).toBe(true);
  });

  it("falls back to the parser's unit and price for a line the catalog did place", () => {
    const result = enrichParsedLine(
      parsed({ suggestedItemId: "ITEM-1", unitOfMeasure: "EA", estimatedPrice: 42 }),
      null,
    );

    expect(result.unitOfMeasure).toBe("EA");
    expect(result.estimatedPrice).toBe(42);
    expect(result.quantity).toBe(25);
  });

  it("does not let a zero-priced suggestion overwrite a price the parser found", () => {
    const result = enrichParsedLine(parsed({ estimatedPrice: 500 }), suggested({ unitPrice: 0 }));

    expect(result.estimatedPrice).toBe(500);
  });

  it("fills in the category and item ids the parser could not resolve", () => {
    const result = enrichParsedLine(
      parsed({ categoryCode: undefined, categoryName: undefined, suggestedItemId: undefined }),
      suggested(),
    );

    expect(result.categoryName).toBe("Office Supplies");
    expect(result.itemId).toBe("ITEM-1");
    expect(result.aiGenerated).toBe(false);
  });

  it("never overwrites a category the parser already resolved", () => {
    const result = enrichParsedLine(
      parsed({ categoryName: "IT Equipment" }),
      suggested({ categoryName: "Office Supplies" }),
    );

    expect(result.categoryName).toBe("IT Equipment");
  });
});

describe("enrichParsedLine for an item that is not in the item master", () => {
  // "Create a PR for Green Tea" when Green Tea is not a catalog item: the
  // parser still returns a line, with an unvalidated unit and a guessed price.
  const greenTea = parsed({
    description: "Green Tea",
    quantity: null,
    unitOfMeasure: "EA",
    estimatedPrice: 10,
    suggestedItemId: undefined,
  });

  it("leaves the unit blank rather than showing the parser's code", () => {
    expect(enrichParsedLine(greenTea, null).unitOfMeasure).toBe("");
  });

  it("leaves the price at zero rather than showing the parser's guess", () => {
    const result = enrichParsedLine(greenTea, null);

    expect(result.estimatedPrice).toBe(0);
    expect(result.priceAssumed).toBe(false);
  });

  it("keeps what the user asked for and marks the line as unmatched", () => {
    const result = enrichParsedLine(greenTea, null);

    expect(result.description).toBe("Green Tea");
    expect(result.quantity).toBeNull();
    expect(result.itemId).toBeUndefined();
    expect(result.aiGenerated).toBe(true);
  });

  it("keeps the guessed category, which is still useful for matching", () => {
    const result = enrichParsedLine(
      { ...greenTea, categoryCode: "50201706", categoryName: "Beverages" },
      null,
    );

    expect(result.categoryName).toBe("Beverages");
  });

  it("still enriches a line an unrelated suggestion could not match", () => {
    const unrelated = suggested({ itemId: "ITEM-3", name: "Cement Bag" });
    const result = enrichParsedLine(greenTea, findMatchingSuggestion(greenTea, [unrelated]));

    expect(result.unitOfMeasure).toBe("");
    expect(result.estimatedPrice).toBe(0);
  });
});

describe("enrichParsedLine with a catalog lookup", () => {
  it("prefers the catalog over a suggestion for both unit and price", () => {
    const result = enrichParsedLine(
      parsed(),
      suggested({ unitOfMeasure: "Box", unitPrice: 800 }),
      catalog({ unitOfMeasure: "Each", unitPrice: 1200 }),
    );

    expect(result.unitOfMeasure).toBe("Each");
    expect(result.estimatedPrice).toBe(1200);
  });

  it("never marks a catalog price as assumed, since it is a real price", () => {
    const result = enrichParsedLine(
      parsed(),
      suggested({ unitPrice: 800, priceAssumed: true }),
      catalog({ unitPrice: 1200 }),
    );

    expect(result.priceAssumed).toBe(false);
  });

  it("falls through to the suggestion when the catalog has never priced the item", () => {
    const result = enrichParsedLine(
      parsed(),
      suggested({ unitPrice: 800, priceAssumed: true }),
      catalog({ unitPrice: null }),
    );

    expect(result.estimatedPrice).toBe(800);
    expect(result.priceAssumed).toBe(true);
    // The unit still comes from the catalog even when the price did not.
    expect(result.unitOfMeasure).toBe("Each");
  });

  it("still resolves the unit when the catalog has no price and no suggestion matched", () => {
    const result = enrichParsedLine(parsed(), null, catalog({ unitPrice: null }));

    expect(result.unitOfMeasure).toBe("Each");
    expect(result.estimatedPrice).toBe(0);
    expect(result.priceAssumed).toBe(true);
  });
});

describe("mergeParsedWithSuggestions", () => {
  it("enriches each line independently and keeps every parsed line", () => {
    const lines = mergeParsedWithSuggestions(
      [
        parsed({ description: "laptops", quantity: 25 }),
        parsed({ description: "monitors", quantity: null }),
      ],
      [
        suggested({ itemId: "ITEM-1", name: "Laptop Computer", unitPrice: 800 }),
        suggested({ itemId: "ITEM-2", name: "Monitor", unitPrice: 200, unitOfMeasure: "Each" }),
      ],
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ quantity: 25, estimatedPrice: 800, unitOfMeasure: "Each" });
    expect(lines[1]).toMatchObject({ quantity: null, estimatedPrice: 200 });
  });

  it("keeps a line that matched nothing, with no unit or price on it", () => {
    const lines = mergeParsedWithSuggestions([parsed()], []);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ unitOfMeasure: "", estimatedPrice: 0 });
    expect(lines[0].itemId).toBeUndefined();
  });

  it("enriches the matched lines of a request and leaves the unmatched one bare", () => {
    const lines = mergeParsedWithSuggestions(
      [
        parsed({ description: "laptops", suggestedItemId: "ITEM-1" }),
        parsed({ description: "Green Tea", unitOfMeasure: "EA", estimatedPrice: 10 }),
      ],
      [],
      [catalog({ itemId: "ITEM-1", unitPrice: 1200, unitOfMeasure: "Each" })],
    );

    expect(lines[0]).toMatchObject({ unitOfMeasure: "Each", estimatedPrice: 1200 });
    expect(lines[1]).toMatchObject({ unitOfMeasure: "", estimatedPrice: 0 });
  });

  it("applies each catalog entry only to the line holding that item id", () => {
    const lines = mergeParsedWithSuggestions(
      [
        parsed({ description: "laptops", suggestedItemId: "ITEM-1" }),
        parsed({ description: "monitors", suggestedItemId: "ITEM-2" }),
      ],
      [],
      [
        catalog({ itemId: "ITEM-1", unitPrice: 1200, unitOfMeasure: "Each" }),
        catalog({ itemId: "ITEM-2", unitPrice: 200, unitOfMeasure: "Box" }),
      ],
    );

    expect(lines[0]).toMatchObject({ estimatedPrice: 1200, unitOfMeasure: "Each" });
    expect(lines[1]).toMatchObject({ estimatedPrice: 200, unitOfMeasure: "Box" });
  });

  it("prices every line of a multi-item request, even the ones no suggestion covers", () => {
    // Reproduces "create PR 20 laptops, 10 T-shirts, 5 hard disks": the
    // suggestion service's substring search only found the hard disk, so
    // laptops and T-shirts previously came out as "EA" with no price.
    const lines = mergeParsedWithSuggestions(
      [
        parsed({ description: "LAPTOPS", quantity: 20, suggestedItemId: "ITEM-1" }),
        parsed({ description: "Tshirts", quantity: 10, suggestedItemId: "ITEM-2" }),
        parsed({ description: "harddisk", quantity: 5, suggestedItemId: "ITEM-3" }),
      ],
      [suggested({ itemId: "ITEM-3", name: "harddisk", unitPrice: 150, priceAssumed: true })],
      [
        catalog({ itemId: "ITEM-1", unitPrice: 1200 }),
        catalog({ itemId: "ITEM-2", unitPrice: 20 }),
        catalog({ itemId: "ITEM-3", unitPrice: null }),
      ],
    );

    expect(lines.map((line) => line.unitOfMeasure)).toEqual(["Each", "Each", "Each"]);
    expect(lines.map((line) => line.estimatedPrice)).toEqual([1200, 20, 150]);
    expect(lines.map((line) => line.priceAssumed)).toEqual([false, false, true]);
  });
});

describe("applyEstimatedPrices", () => {
  // A catalog item the item master has never priced. That is the only case the
  // estimator serves now, since unmatched lines are filtered out upstream.
  const unpriced = mergeParsedWithSuggestions(
    [parsed({ suggestedItemId: "ITEM-1", estimatedPrice: 0 })],
    [],
    [catalog({ itemId: "ITEM-1", unitPrice: null })],
  );

  it("fills a zero price and flags it as assumed", () => {
    const [line] = applyEstimatedPrices(unpriced, [640]);

    expect(line.estimatedPrice).toBe(640);
    expect(line.priceAssumed).toBe(true);
  });

  it("never replaces a price that was already resolved", () => {
    const priced = mergeParsedWithSuggestions(
      [parsed({ suggestedItemId: "ITEM-1" })],
      [],
      [catalog({ itemId: "ITEM-1", unitPrice: 1200 })],
    );
    const [line] = applyEstimatedPrices(priced, [640]);

    expect(line.estimatedPrice).toBe(1200);
    expect(line.priceAssumed).toBe(false);
  });

  it("leaves the line unpriced when the estimate is missing or not positive", () => {
    expect(applyEstimatedPrices(unpriced, [null])[0].estimatedPrice).toBe(0);
    expect(applyEstimatedPrices(unpriced, [0])[0].estimatedPrice).toBe(0);
    expect(applyEstimatedPrices(unpriced, [])[0].estimatedPrice).toBe(0);
  });
});

describe("lineItemsFromSuggestions", () => {
  it("leaves quantity unset so it is predicted rather than assumed to be one", () => {
    const lines = lineItemsFromSuggestions([suggested()]);

    expect(lines[0].quantity).toBeNull();
    expect(lines[0].unitOfMeasure).toBe("Each");
    expect(lines[0].estimatedPrice).toBe(800);
  });
});
