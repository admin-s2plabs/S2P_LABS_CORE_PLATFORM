import { describe, expect, it } from "vitest";
import { budgetLineLabel, buildBudgetSelectOptions } from "./budget-options";
import type { BudgetLineCandidate } from "./ports";

function line(overrides: Partial<BudgetLineCandidate> & { budgetLineId: number }): BudgetLineCandidate {
  return {
    budgetMasterId: 40,
    budgetName: `Budget ${overrides.budgetLineId}`,
    costCentreCode: "CC-IT",
    costCentreName: "IT Consulting Services",
    lineDescription: null,
    currency: "INR",
    businessEntityId: 7,
    businessEntityName: "ProductionQA",
    approvedAt: new Date("2026-06-01"),
    departments: [],
    locations: [],
    ...overrides,
  };
}

describe("budgetLineLabel", () => {
  it("joins the budget name and cost centre", () => {
    expect(budgetLineLabel("laptops", "IT Consulting Services")).toBe(
      "laptops · IT Consulting Services",
    );
  });

  it("omits a missing cost centre", () => {
    expect(budgetLineLabel("laptops", null)).toBe("laptops");
  });
});

describe("buildBudgetSelectOptions", () => {
  const lines = [line({ budgetLineId: 1 }), line({ budgetLineId: 2 }), line({ budgetLineId: 3 })];

  it("offers every approved line, not just the top matches", () => {
    const options = buildBudgetSelectOptions(lines);
    expect(options.map((option) => option.id)).toEqual(["1", "2", "3"]);
  });

  it("pins the selected line first so the Select can render its value", () => {
    const options = buildBudgetSelectOptions(lines, {
      budgetLineId: 3,
      budgetName: "Budget 3",
      costCentreName: "IT Consulting Services",
    });
    expect(options[0].id).toBe("3");
    expect(options.map((option) => option.id)).toEqual(["3", "1", "2"]);
  });

  it("does not duplicate the selected line", () => {
    const options = buildBudgetSelectOptions(lines, {
      budgetLineId: 2,
      budgetName: "Budget 2",
      costCentreName: null,
    });
    expect(options.filter((option) => option.id === "2")).toHaveLength(1);
    expect(options).toHaveLength(3);
  });

  it("injects a selected line that is no longer in the approved list", () => {
    const options = buildBudgetSelectOptions(lines, {
      budgetLineId: 99,
      budgetName: "Retired Budget",
      costCentreName: "Facilities",
    });
    expect(options[0]).toEqual({ id: "99", label: "Retired Budget · Facilities" });
    expect(options).toHaveLength(4);
  });

  it("falls back to the id when an injected line has no name", () => {
    const options = buildBudgetSelectOptions([], {
      budgetLineId: 99,
      budgetName: "",
      costCentreName: null,
    });
    expect(options).toEqual([{ id: "99", label: "99" }]);
  });

  it("returns nothing for no lines and no selection", () => {
    expect(buildBudgetSelectOptions([])).toEqual([]);
  });
});
