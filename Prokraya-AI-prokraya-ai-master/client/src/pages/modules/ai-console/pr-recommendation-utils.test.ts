import { describe, expect, it } from "vitest";
import type { PrRecommendationSpec, PrRecommendedValue } from "@shared/agent-pr-recommendation";
import {
  buildPrCreatePayload,
  isWeakSource,
  needsUserChoice,
  sourceLabel,
} from "./pr-recommendation-utils";

function resolved<T>(value: T): PrRecommendedValue<T> {
  return { value, source: "budget", rationale: "test" };
}

function empty<T>(): PrRecommendedValue<T> {
  return { value: null, source: "none", rationale: "nothing available" };
}

function makeSpec(overrides: Partial<PrRecommendationSpec> = {}): PrRecommendationSpec {
  return {
    kind: "pr_recommendation",
    request: "20 laptops for the new engineering team",
    budget: resolved({
      budgetLineId: 42,
      budgetMasterId: 7,
      budgetName: "IT Laptop Procurement FY26",
      costCentreCode: "CC-IT",
      costCentreName: "IT Equipment",
      lineDescription: "engineering laptops",
      score: 0.82,
      scoreBreakdown: { budgetName: 0.9, costCentre: 0.8, description: 0.7 },
    }),
    businessEntity: resolved({ id: "3", label: "ProductionQA" }),
    department: resolved({ id: "11", label: "Engineering" }),
    deliveryLocation: resolved({ id: "5", label: "Dubai HQ" }),
    currency: resolved("USD"),
    needByDate: resolved("2026-08-19"),
    buyer: resolved({ id: "204", label: "John Doe" }),
    requestor: resolved({ id: "17", label: "Current user" }),
    lineItems: [
      {
        description: "Dell Latitude Laptop",
        quantity: 20,
        unitOfMeasure: "Each",
        estimatedPrice: 1200,
        categoryName: "IT Equipment",
        aiGenerated: true,
      },
    ],
    unresolved: [],
    canCreate: true,
    decisionLog: [],
    ...overrides,
  };
}

describe("buildPrCreatePayload", () => {
  it("flattens a fully resolved recommendation into the confirm payload", () => {
    expect(buildPrCreatePayload(makeSpec())).toEqual({
      description: "20 laptops for the new engineering team",
      budgetLineId: 42,
      orgId: 3,
      departmentId: "11",
      deliveryLocationId: "5",
      currency: "USD",
      needByDate: "2026-08-19",
      buyerId: 204,
      buyerName: "John Doe",
      lineItems: makeSpec().lineItems,
    });
  });

  it("sends null rather than a guess for fields the engine could not resolve", () => {
    const payload = buildPrCreatePayload(
      makeSpec({
        needByDate: empty<string>(),
        buyer: empty(),
        deliveryLocation: empty(),
        canCreate: false,
        unresolved: ["needByDate", "buyer", "deliveryLocation"],
      }),
    );

    expect(payload.needByDate).toBeNull();
    expect(payload.buyerId).toBeNull();
    expect(payload.buyerName).toBeNull();
    expect(payload.deliveryLocationId).toBeNull();
    // Resolved fields are unaffected.
    expect(payload.budgetLineId).toBe(42);
  });

  it("carries edited values through, since the card mutates the spec in place", () => {
    const edited = makeSpec();
    edited.department = { value: { id: "9", label: "Finance" }, source: "override", rationale: "edited" };

    expect(buildPrCreatePayload(edited).departmentId).toBe("9");
  });
});

describe("sourceLabel", () => {
  it("gives every provenance a human label", () => {
    expect(sourceLabel("po_history")).toBe("PO history");
    expect(sourceLabel("ai")).toBe("AI estimate");
    expect(sourceLabel("none")).toBe("not set");
  });

  it("labels a field waiting on the user as an instruction, not a state", () => {
    expect(sourceLabel("needs_selection")).toBe("choose one");
  });

  it("keeps labelling the retired source, which older chats still carry", () => {
    expect(sourceLabel("random_pool")).toBe("active buyer pool");
  });

  it("flags the low-confidence sources so the card can highlight them", () => {
    expect(isWeakSource("alphabetical")).toBe(true);
    expect(isWeakSource("random_pool")).toBe(true);
    expect(isWeakSource("needs_selection")).toBe(true);
    expect(isWeakSource("po_history")).toBe(false);
    expect(isWeakSource("budget")).toBe(false);
  });

  it("separates fields awaiting a choice from merely weak ones", () => {
    expect(needsUserChoice("needs_selection")).toBe(true);
    expect(needsUserChoice("none")).toBe(true);
    expect(needsUserChoice("alphabetical")).toBe(false);
    expect(needsUserChoice("po_history")).toBe(false);
  });
});
