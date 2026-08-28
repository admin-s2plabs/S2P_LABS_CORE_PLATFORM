import { describe, expect, it } from "vitest";
import { scoreBudgetLine, selectBestBudgetLine } from "./budget-matcher";
import type { BudgetLineCandidate } from "./ports";

function line(overrides: Partial<BudgetLineCandidate> & { budgetLineId: number }): BudgetLineCandidate {
  return {
    budgetMasterId: overrides.budgetLineId * 10,
    budgetName: "Generic Budget",
    costCentreCode: null,
    costCentreName: null,
    lineDescription: null,
    currency: "USD",
    businessEntityId: 1,
    businessEntityName: "ProductionQA",
    approvedAt: null,
    departments: [],
    locations: [],
    ...overrides,
  };
}

const REQUEST = "Create a PR for 20 laptops for a new engineering team";

describe("scoreBudgetLine", () => {
  it("scores each criterion independently", () => {
    const scored = scoreBudgetLine([REQUEST], line({
      budgetLineId: 1,
      budgetName: "Laptop Budget",
      costCentreName: "IT Equipment",
      lineDescription: "developer laptops",
    }));
    expect(scored.breakdown.budgetName).toBeGreaterThan(0.8);
    expect(scored.breakdown.description).toBeGreaterThan(0.5);
    expect(scored.score).toBeGreaterThan(0.5);
  });

  it("scores an unrelated line near zero", () => {
    const scored = scoreBudgetLine([REQUEST], line({
      budgetLineId: 2,
      budgetName: "Office Catering",
      costCentreName: "Facilities",
      lineDescription: "sandwiches",
    }));
    expect(scored.score).toBeLessThan(0.2);
  });

  it("uses the strongest of several query terms", () => {
    const candidate = line({ budgetLineId: 3, budgetName: "Laptop Budget" });
    const withAiName = scoreBudgetLine(["office supplies", "Dell Latitude Laptop"], candidate);
    expect(withAiName.breakdown.budgetName).toBeGreaterThan(0.8);
  });

  it("ignores a missing description instead of failing", () => {
    const scored = scoreBudgetLine([REQUEST], line({ budgetLineId: 4, budgetName: "Laptop Budget" }));
    expect(scored.breakdown.description).toBe(0);
  });
});

describe("selectBestBudgetLine", () => {
  it("picks the highest scoring line", () => {
    const result = selectBestBudgetLine(
      [
        line({ budgetLineId: 1, budgetName: "Marketing Budget", costCentreName: "Advertising" }),
        line({ budgetLineId: 2, budgetName: "Engineering Laptop Budget", costCentreName: "IT Equipment" }),
      ],
      [REQUEST],
    );
    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;
    expect(result.selected.candidate.budgetLineId).toBe(2);
  });

  it("reports no match when nothing clears the relevance floor", () => {
    const result = selectBestBudgetLine(
      [line({ budgetLineId: 1, budgetName: "Catering", costCentreName: "Facilities" })],
      [REQUEST],
    );
    expect(result.status).toBe("no_match");
  });

  it("reports no match for an empty candidate set", () => {
    expect(selectBestBudgetLine([], [REQUEST]).status).toBe("no_match");
  });

  it("breaks a tie by most recently approved", () => {
    const result = selectBestBudgetLine(
      [
        line({ budgetLineId: 1, budgetName: "Laptop Budget", approvedAt: new Date("2026-01-01") }),
        line({ budgetLineId: 2, budgetName: "Laptop Budget", approvedAt: new Date("2026-06-01") }),
      ],
      [REQUEST],
    );
    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;
    expect(result.selected.candidate.budgetLineId).toBe(2);
  });

  it("asks the user when scores and approval dates are both tied", () => {
    const approvedAt = new Date("2026-06-01");
    const result = selectBestBudgetLine(
      [
        line({ budgetLineId: 1, budgetName: "Laptop Budget", approvedAt }),
        line({ budgetLineId: 2, budgetName: "Laptop Budget", approvedAt }),
      ],
      [REQUEST],
    );
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.tied.map((entry) => entry.candidate.budgetLineId).sort()).toEqual([1, 2]);
  });

  it("prefers the line whose cost centre matches when budget names are equal", () => {
    const result = selectBestBudgetLine(
      [
        line({ budgetLineId: 1, budgetName: "IT Budget", costCentreName: "Travel Expenses" }),
        line({ budgetLineId: 2, budgetName: "IT Budget", costCentreName: "Laptop Hardware" }),
      ],
      [REQUEST],
    );
    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;
    expect(result.selected.candidate.budgetLineId).toBe(2);
  });

  it("returns every candidate scored and sorted", () => {
    const result = selectBestBudgetLine(
      [
        line({ budgetLineId: 1, budgetName: "Catering" }),
        line({ budgetLineId: 2, budgetName: "Laptop Budget" }),
      ],
      [REQUEST],
    );
    expect(result.scored).toHaveLength(2);
    expect(result.scored[0].score).toBeGreaterThanOrEqual(result.scored[1].score);
  });

  it("is deterministic when scores and dates are identical", () => {
    const candidates = [
      line({ budgetLineId: 7, budgetName: "Laptop Budget" }),
      line({ budgetLineId: 3, budgetName: "Laptop Budget" }),
    ];
    const first = selectBestBudgetLine(candidates, [REQUEST]);
    const second = selectBestBudgetLine([...candidates].reverse(), [REQUEST]);
    expect(first.scored[0].candidate.budgetLineId).toBe(second.scored[0].candidate.budgetLineId);
  });
});
