import { describe, expect, it } from "vitest";
import { bestSimilarity, diceCoefficient, normalize, similarity, singularize, tokenize } from "./text-match";

describe("normalize", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalize("Laptops, FY-26!")).toBe("laptops fy 26");
  });

  it("handles empty input", () => {
    expect(normalize("")).toBe("");
  });
});

describe("singularize", () => {
  it("strips a trailing s", () => {
    expect(singularize("laptops")).toBe("laptop");
  });

  it("handles ies plurals", () => {
    expect(singularize("accessories")).toBe("accessory");
  });

  it("handles es plurals", () => {
    expect(singularize("boxes")).toBe("box");
  });

  it("leaves double-s words alone", () => {
    expect(singularize("access")).toBe("access");
  });

  it("leaves short words alone", () => {
    expect(singularize("gas")).toBe("gas");
  });
});

describe("tokenize", () => {
  it("drops stopwords and pure numbers, and singularizes", () => {
    expect(tokenize("Create a PR for 20 laptops")).toEqual(["laptop"]);
  });

  it("falls back to unfiltered tokens when everything is a stopword", () => {
    expect(tokenize("Budget")).toEqual(["budget"]);
  });

  it("returns an empty array for empty input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("diceCoefficient", () => {
  it("is 1 for identical strings", () => {
    expect(diceCoefficient("laptop", "laptop")).toBe(1);
  });

  it("is 0 when there is no overlap", () => {
    expect(diceCoefficient("laptop", "chair")).toBe(0);
  });

  it("scores near-misses between 0 and 1", () => {
    const score = diceCoefficient("laptop", "laptopp");
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });
});

describe("similarity", () => {
  it("matches plural request against singular label", () => {
    expect(similarity("20 laptops", "Laptop")).toBe(1);
  });

  it("ranks a more specific budget above a generic one", () => {
    const request = "20 laptops for a new engineering team";
    const specific = similarity(request, "Engineering Laptop Budget");
    const generic = similarity(request, "Laptop Budget FY26");
    expect(specific).toBeGreaterThan(generic);
  });

  it("scores an unrelated budget far lower than a relevant one", () => {
    const request = "20 laptops for a new engineering team";
    expect(similarity(request, "Marketing Travel Budget")).toBeLessThan(0.3);
    expect(similarity(request, "Engineering Laptop Budget")).toBeGreaterThan(0.8);
  });

  it("does not reward a shared stopword", () => {
    expect(similarity("20 laptops", "Marketing Budget")).toBeLessThan(0.3);
  });

  it("returns 0 when either side is empty", () => {
    expect(similarity("", "Laptop Budget")).toBe(0);
    expect(similarity("laptops", "")).toBe(0);
  });
});

describe("bestSimilarity", () => {
  it("takes the strongest term", () => {
    const score = bestSimilarity(["office chairs", "Dell Latitude Laptop"], "Laptop Budget");
    expect(score).toBeGreaterThan(0.8);
  });

  it("returns 0 for a null candidate", () => {
    expect(bestSimilarity(["laptops"], null)).toBe(0);
  });
});
