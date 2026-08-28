import { beforeEach, describe, expect, it } from "vitest";
import { buildItemMatchKeys, recommendRequisition } from "./pr-recommendation.service";
import type {
  ActiveBuyer,
  BudgetLineCandidate,
  BuyerFrequency,
  PoHistoryRow,
  PrRecommendationDeps,
} from "./ports";
import type { PrRecommendationLineItem } from "@shared/agent-pr-recommendation";

const TODAY = new Date("2026-08-08T09:00:00");

const TEN_DEPARTMENTS = [
  { id: "1", name: "Admin Department" },
  { id: "2", name: "IT Department" },
  { id: "3", name: "Finance Department" },
];

function budgetLine(overrides: Partial<BudgetLineCandidate> = {}): BudgetLineCandidate {
  return {
    budgetLineId: 104,
    budgetMasterId: 40,
    budgetName: "Laptop Budget FY26",
    costCentreCode: "CC-IT",
    costCentreName: "IT Equipment",
    lineDescription: "engineering laptops",
    currency: "USD",
    businessEntityId: 7,
    businessEntityName: "ProductionQA",
    approvedAt: new Date("2026-06-01"),
    departments: TEN_DEPARTMENTS,
    locations: [
      { id: "1", name: "Head Quarters Dubai" },
      { id: "2", name: "Head Quarters Mumbai" },
    ],
    ...overrides,
  };
}

function po(overrides: Partial<PoHistoryRow> & { poNumber: string }): PoHistoryRow {
  return {
    createdDate: new Date("2026-01-01"),
    requiredDate: new Date("2026-01-15"),
    orgId: 7,
    departmentName: "IT Department",
    buyerId: 11,
    buyerName: "Alice Buyer",
    deliveryLocationId: "1",
    deliveryLocationName: "Head Quarters Dubai",
    ...overrides,
  };
}

const AI_LINES: PrRecommendationLineItem[] = [
  {
    description: "Dell Latitude Laptop",
    quantity: 20,
    unitOfMeasure: "EA",
    estimatedPrice: 1200,
    itemId: "ITEM-1",
    categoryCode: "43211503",
    categoryName: "Computer Hardware",
    aiGenerated: false,
  },
];

interface FakeConfig {
  budgetLines?: BudgetLineCandidate[];
  poHistory?: PoHistoryRow[];
  entityBuyers?: ActiveBuyer[];
  orgBuyers?: ActiveBuyer[];
  buyerCounts?: BuyerFrequency[];
  entityLocations?: Array<{ id: string; name: string }>;
  userDepartment?: string | null;
  aiLineItems?: PrRecommendationLineItem[];
  aiLeadTimeDays?: number | null;
  aiUnavailable?: boolean;
  predictedQuantity?: number | null;
}

/** Arguments the orchestrator passed to the quantity prediction service. */
interface QuantityPredictionCall {
  description: string;
  department: string;
  budgetLineId: number | null;
}

let quantityPredictionCalls: QuantityPredictionCall[] = [];

function makeDeps(config: FakeConfig = {}): PrRecommendationDeps {
  const budgetLines = config.budgetLines ?? [budgetLine()];
  return {
    budgets: {
      listApprovedBudgetLines: async () => budgetLines,
      getBudgetLineById: async (id) => budgetLines.find((line) => line.budgetLineId === id) ?? null,
    },
    poHistory: {
      findApprovedPoHistory: async () => config.poHistory ?? [],
    },
    buyers: {
      getActiveBuyers: async (orgId) =>
        orgId == null ? config.orgBuyers ?? [] : config.entityBuyers ?? [],
      getBuyerAssignmentCounts: async () => config.buyerCounts ?? [],
    },
    locations: {
      listEntityLocations: async () => config.entityLocations ?? [],
    },
    users: {
      getDepartmentName: async () => config.userDepartment ?? null,
    },
    aiLineItems: {
      generateLineItems: async () => ({
        lineItems: config.aiUnavailable ? [] : config.aiLineItems ?? AI_LINES,
        leadTimeDays: config.aiLeadTimeDays ?? null,
        unavailable: config.aiUnavailable ?? false,
      }),
      predictQuantity: async (params) => {
        quantityPredictionCalls.push(params);
        return config.predictedQuantity ?? null;
      },
    },
    clock: { now: () => TODAY },
  };
}

const INPUT = {
  request: "Create a PR for 20 laptops for a new engineering team",
  sessionUser: { id: 99, name: "Jane Requestor", department: "IT Department" },
};

describe("buildItemMatchKeys", () => {
  it("collects ids, categories and name patterns", () => {
    const keys = buildItemMatchKeys(AI_LINES);
    expect(keys.itemIds).toEqual(["ITEM-1"]);
    expect(keys.categoryCodes).toEqual(["43211503"]);
    expect(keys.namePatterns).toContain("%Dell Latitude Laptop%");
    expect(keys.namePatterns).toContain("%Latitude%");
  });

  it("skips short words", () => {
    const keys = buildItemMatchKeys([{ ...AI_LINES[0], description: "HP pc" }]);
    expect(keys.namePatterns).not.toContain("%pc%");
  });

  it("returns empty arrays for no line items", () => {
    expect(buildItemMatchKeys([])).toEqual({ itemIds: [], categoryCodes: [], namePatterns: [] });
  });
});

describe("recommendRequisition", () => {
  let deps: PrRecommendationDeps;

  beforeEach(() => {
    quantityPredictionCalls = [];
    deps = makeDeps({
      poHistory: [
        po({ poNumber: "PO1", createdDate: new Date("2026-01-01"), requiredDate: new Date("2026-01-15") }),
        po({ poNumber: "PO2", createdDate: new Date("2026-02-05"), requiredDate: new Date("2026-02-20") }),
        po({ poNumber: "PO3", createdDate: new Date("2026-03-10"), requiredDate: new Date("2026-03-26") }),
      ],
      entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
    });
  });

  it("produces a complete recommendation from the happy path", async () => {
    const spec = await recommendRequisition(INPUT, deps);

    expect(spec.kind).toBe("pr_recommendation");
    expect(spec.budget.value?.budgetLineId).toBe(104);
    expect(spec.businessEntity.value?.label).toBe("ProductionQA");
    expect(spec.currency.value).toBe("USD");
    expect(spec.department.value?.label).toBe("IT Department");
    expect(spec.buyer.value?.label).toBe("Alice Buyer");
    expect(spec.requestor.value).toEqual({ id: "99", label: "Jane Requestor" });
    expect(spec.canCreate).toBe(true);
    expect(spec.pendingChoice).toBeUndefined();
  });

  it("derives the need-by date from average historical lead time", async () => {
    const spec = await recommendRequisition(INPUT, deps);
    // 14, 15 and 16 day lead times average to 15; 8 Aug + 15 days = 23 Aug.
    expect(spec.needByDate.value).toBe("2026-08-23");
    expect(spec.needByDate.source).toBe("po_history");
    expect(spec.needByDate.sampleSize).toBe(3);
  });

  it("takes business entity and currency from the budget", async () => {
    const spec = await recommendRequisition(INPUT, deps);
    expect(spec.businessEntity.source).toBe("budget");
    expect(spec.currency.source).toBe("budget");
  });

  it("uses the AI lead time when no purchase order history matches", async () => {
    const spec = await recommendRequisition(INPUT, makeDeps({ poHistory: [], aiLeadTimeDays: 30, entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }] }));
    expect(spec.needByDate.source).toBe("ai");
    expect(spec.needByDate.value).toBe("2026-09-07");
  });

  it("leaves the need-by date blank and prompts when nothing is available", async () => {
    const spec = await recommendRequisition(INPUT, makeDeps({ poHistory: [], aiLeadTimeDays: null, entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }] }));
    expect(spec.needByDate.value).toBeNull();
    expect(spec.unresolved).toContain("needByDate");
    expect(spec.pendingChoice?.field).toBe("needByDate");
    expect(spec.canCreate).toBe(false);
  });

  it("asks the user to choose when budgets tie", async () => {
    const approvedAt = new Date("2026-06-01");
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({
        budgetLines: [
          budgetLine({ budgetLineId: 1, approvedAt }),
          budgetLine({ budgetLineId: 2, approvedAt }),
        ],
      }),
    );
    expect(spec.pendingChoice?.field).toBe("budget");
    expect(spec.pendingChoice?.options).toHaveLength(2);
    expect(spec.canCreate).toBe(false);
  });

  it("prompts for a budget when nothing matches", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({ budgetLines: [budgetLine({ budgetName: "Catering", costCentreName: "Facilities", lineDescription: "sandwiches" })] }),
    );
    expect(spec.budget.value).toBeNull();
    expect(spec.pendingChoice?.field).toBe("budget");
    expect(spec.unresolved).toContain("budget");
  });

  it("honours a budget override and skips matching", async () => {
    const spec = await recommendRequisition(
      { ...INPUT, overrides: { budgetLineId: 104 } },
      deps,
    );
    expect(spec.budget.source).toBe("override");
    expect(spec.budget.value?.budgetLineId).toBe(104);
  });

  it("reports an override pointing at a missing budget", async () => {
    const spec = await recommendRequisition({ ...INPUT, overrides: { budgetLineId: 999 } }, deps);
    expect(spec.budget.value).toBeNull();
    expect(spec.unresolved).toContain("budget");
  });

  describe("budget dropdown options", () => {
    /** Six lines so the list is longer than the top-N used for the choice buttons. */
    const manyBudgets = [
      budgetLine({ budgetLineId: 104 }),
      budgetLine({ budgetLineId: 201, budgetName: "Catering", costCentreName: "Facilities", lineDescription: "sandwiches" }),
      budgetLine({ budgetLineId: 202, budgetName: "Travel", costCentreName: "Facilities", lineDescription: "flights" }),
      budgetLine({ budgetLineId: 203, budgetName: "Stationery", costCentreName: "Admin", lineDescription: "pens" }),
      budgetLine({ budgetLineId: 204, budgetName: "Cleaning", costCentreName: "Admin", lineDescription: "supplies" }),
      budgetLine({ budgetLineId: 205, budgetName: "Legal", costCentreName: "Corporate", lineDescription: "counsel" }),
    ];

    function optionIds(options?: Array<{ id: string }>) {
      return (options ?? []).map((option) => option.id);
    }

    it("offers every approved budget alongside the recommended one", async () => {
      const spec = await recommendRequisition(
        INPUT,
        makeDeps({ budgetLines: manyBudgets, entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }] }),
      );

      expect(spec.budget.value?.budgetLineId).toBe(104);
      expect(optionIds(spec.budget.options)).toHaveLength(manyBudgets.length);
      expect(optionIds(spec.budget.options)).toContain("205");
    });

    it("keeps the top-ranked shortlist for the choice buttons when nothing matches", async () => {
      const spec = await recommendRequisition(
        { ...INPUT, request: "Create a PR for an unrelated thing" },
        makeDeps({
          budgetLines: manyBudgets.slice(1),
          entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
        }),
      );

      expect(spec.pendingChoice?.field).toBe("budget");
      expect(spec.pendingChoice?.options).toHaveLength(5);
      expect(optionIds(spec.budget.options)).toHaveLength(5);
    });

    it("still offers the full list when budgets tie", async () => {
      const approvedAt = new Date("2026-06-01");
      const spec = await recommendRequisition(
        INPUT,
        makeDeps({
          budgetLines: [
            budgetLine({ budgetLineId: 1, approvedAt }),
            budgetLine({ budgetLineId: 2, approvedAt }),
            budgetLine({ budgetLineId: 3, budgetName: "Catering", costCentreName: "Facilities", lineDescription: "sandwiches" }),
          ],
        }),
      );

      expect(spec.pendingChoice?.field).toBe("budget");
      expect(optionIds(spec.budget.options)).toEqual(["1", "2", "3"]);
    });

    it("pins an overridden budget into the options so the field renders it", async () => {
      const spec = await recommendRequisition(
        { ...INPUT, overrides: { budgetLineId: 203 } },
        makeDeps({ budgetLines: manyBudgets, entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }] }),
      );

      expect(spec.budget.source).toBe("override");
      expect(spec.budget.options?.[0].id).toBe("203");
      expect(optionIds(spec.budget.options)).toHaveLength(manyBudgets.length);
    });

    it("still offers alternatives when the override points at a missing budget", async () => {
      const spec = await recommendRequisition(
        { ...INPUT, overrides: { budgetLineId: 999 } },
        makeDeps({ budgetLines: manyBudgets, entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }] }),
      );

      expect(spec.budget.value).toBeNull();
      expect(optionIds(spec.budget.options)).toHaveLength(manyBudgets.length);
    });
  });

  it("blocks creation when a line item matched no item master row", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({
        poHistory: [po({ poNumber: "PO1" })],
        entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
        // What the enricher produces for an item the catalog does not have.
        aiLineItems: [
          {
            ...AI_LINES[0],
            description: "MacBook Covers",
            itemId: undefined,
            unitOfMeasure: "",
            estimatedPrice: 0,
            aiGenerated: true,
          },
        ],
      }),
    );

    expect(spec.unresolved).toContain("lineItemDescription");
    expect(spec.canCreate).toBe(false);
  });

  it("allows creation once every line names an item master row", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({
        poHistory: [po({ poNumber: "PO1" })],
        entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
        aiLineItems: [AI_LINES[0], { ...AI_LINES[0], description: "LED Monitor", itemId: "ITEM-2" }],
      }),
    );

    expect(spec.unresolved).not.toContain("lineItemDescription");
    expect(spec.canCreate).toBe(true);
  });

  it("recalculates the need-by date when the department override changes it", async () => {
    const withMixedHistory = makeDeps({
      poHistory: [
        po({ poNumber: "PO1", departmentName: "IT Department", createdDate: new Date("2026-01-01"), requiredDate: new Date("2026-01-11") }),
        po({ poNumber: "PO2", departmentName: "Finance Department", createdDate: new Date("2026-01-01"), requiredDate: new Date("2026-01-31") }),
      ],
      entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
    });

    const asIt = await recommendRequisition(INPUT, withMixedHistory);
    const asFinance = await recommendRequisition(
      { ...INPUT, overrides: { departmentName: "Finance Department" } },
      withMixedHistory,
    );

    expect(asIt.needByDate.value).toBe("2026-08-18");
    expect(asFinance.needByDate.value).toBe("2026-09-07");
  });

  it("keeps user overrides for every editable field", async () => {
    const spec = await recommendRequisition(
      {
        ...INPUT,
        overrides: {
          budgetLineId: 104,
          departmentName: "Finance Department",
          deliveryLocationId: "2",
          currency: "EUR",
          needByDate: "2026-12-01",
          buyerId: 11,
        },
      },
      deps,
    );
    expect(spec.currency.value).toBe("EUR");
    expect(spec.department.value?.label).toBe("Finance Department");
    expect(spec.deliveryLocation.value?.label).toBe("Head Quarters Mumbai");
    expect(spec.needByDate.value).toBe("2026-12-01");
    expect(spec.buyer.value?.id).toBe("11");
    expect(spec.buyer.source).toBe("override");
  });

  it("keeps a quantity the user stated and never calls the prediction service", async () => {
    const spec = await recommendRequisition(INPUT, deps);

    expect(spec.lineItems[0].quantity).toBe(20);
    expect(spec.lineItems[0].quantityPredicted).toBeUndefined();
    expect(quantityPredictionCalls).toHaveLength(0);
    expect(spec.canCreate).toBe(true);
  });

  it("predicts a quantity the request never stated, using the resolved department and budget line", async () => {
    const spec = await recommendRequisition(
      { ...INPUT, request: "Create a PR for laptops" },
      makeDeps({
        poHistory: [po({ poNumber: "PO1" })],
        entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
        aiLineItems: [{ ...AI_LINES[0], quantity: null }],
        predictedQuantity: 12,
      }),
    );

    expect(quantityPredictionCalls).toEqual([
      { description: "Dell Latitude Laptop", department: "IT Department", budgetLineId: 104 },
    ]);
    expect(spec.lineItems[0].quantity).toBe(12);
    expect(spec.lineItems[0].quantityPredicted).toBe(true);
    expect(spec.canCreate).toBe(true);
  });

  it("blocks creation and asks for a quantity when the prediction returns nothing", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({
        poHistory: [po({ poNumber: "PO1" })],
        entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
        aiLineItems: [{ ...AI_LINES[0], quantity: null }],
        predictedQuantity: null,
      }),
    );

    expect(quantityPredictionCalls).toHaveLength(1);
    expect(spec.lineItems[0].quantity).toBeNull();
    expect(spec.unresolved).toContain("lineItemQuantity");
    expect(spec.canCreate).toBe(false);
  });

  it("skips prediction entirely when no department could be resolved", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({
        budgetLines: [budgetLine({ departments: [] })],
        poHistory: [po({ poNumber: "PO1" })],
        entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
        userDepartment: null,
        aiLineItems: [{ ...AI_LINES[0], quantity: null }],
        predictedQuantity: 12,
      }),
    );

    expect(quantityPredictionCalls).toHaveLength(0);
    expect(spec.lineItems[0].quantity).toBeNull();
    expect(spec.decisionLog.some((entry) => entry.stage === "quantity" && entry.outcome === "skipped")).toBe(true);
  });

  it("predicts only the lines that are missing a quantity", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({
        poHistory: [po({ poNumber: "PO1" })],
        entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
        aiLineItems: [
          { ...AI_LINES[0], description: "Dell Latitude Laptop", quantity: 25 },
          { ...AI_LINES[0], description: "LED Monitor", quantity: null },
        ],
        predictedQuantity: 4,
      }),
    );

    expect(quantityPredictionCalls.map((call) => call.description)).toEqual(["LED Monitor"]);
    expect(spec.lineItems[0].quantity).toBe(25);
    expect(spec.lineItems[1].quantity).toBe(4);
  });

  it("still recommends a budget when the AI service is unavailable", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({ aiUnavailable: true, entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }] }),
    );
    expect(spec.budget.value?.budgetLineId).toBe(104);
    expect(spec.lineItems).toHaveLength(0);
    expect(spec.canCreate).toBe(false);
    expect(spec.decisionLog.some((entry) => entry.outcome === "ai_unavailable")).toBe(true);
  });

  it("falls back to organization-wide buyers when the entity has none", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({
        poHistory: [],
        aiLeadTimeDays: 10,
        entityBuyers: [],
        orgBuyers: [{ userId: 21, name: "Org Buyer", email: null }],
        buyerCounts: [{ userId: 21, name: "Org Buyer", count: 4 }],
      }),
    );
    expect(spec.buyer.value?.label).toBe("Org Buyer");
  });

  describe("buyer must be one the user can actually pick", () => {
    // PR_00080: the buyer on the matching approved POs had no procurement role
    // in that entity, so the card showed an empty, unexplained dropdown.
    const outsiderHistory = makeDeps({
      poHistory: [po({ poNumber: "PO1", buyerId: 77, buyerName: "Retired Rita" })],
      entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
    });

    it("leaves the buyer unset and blocks creation", async () => {
      const spec = await recommendRequisition(INPUT, outsiderHistory);

      expect(spec.buyer.value).toBeNull();
      expect(spec.buyer.source).toBe("needs_selection");
      expect(spec.unresolved).toContain("buyer");
      expect(spec.canCreate).toBe(false);
    });

    it("explains who was passed over and still offers the pool", async () => {
      const spec = await recommendRequisition(INPUT, outsiderHistory);

      expect(spec.buyer.rationale).toContain("Retired Rita");
      expect(spec.buyer.options).toEqual([{ id: "11", label: "Alice Buyer" }]);
    });

    it("creates once the user picks someone from that pool", async () => {
      const spec = await recommendRequisition(
        { ...INPUT, overrides: { buyerId: 11 } },
        outsiderHistory,
      );

      expect(spec.buyer.value).toEqual({ id: "11", label: "Alice Buyer" });
      expect(spec.buyer.source).toBe("override");
      expect(spec.unresolved).not.toContain("buyer");
      expect(spec.canCreate).toBe(true);
    });

    it("refuses an override naming someone outside the pool", async () => {
      const spec = await recommendRequisition(
        { ...INPUT, overrides: { buyerId: 77 } },
        outsiderHistory,
      );

      expect(spec.buyer.value).toBeNull();
      expect(spec.buyer.source).toBe("needs_selection");
      expect(spec.unresolved).toContain("buyer");
      expect(spec.canCreate).toBe(false);
    });

    it("says so plainly when the entity has no procurement staff at all", async () => {
      const spec = await recommendRequisition(
        INPUT,
        makeDeps({ poHistory: [po({ poNumber: "PO1" })], entityBuyers: [], orgBuyers: [] }),
      );

      expect(spec.buyer.source).toBe("none");
      expect(spec.buyer.options).toEqual([]);
      expect(spec.buyer.rationale).toContain("No active procurement managers or officers");
    });
  });

  it("falls back to the entity default location when the budget maps none", async () => {
    const spec = await recommendRequisition(
      INPUT,
      makeDeps({
        budgetLines: [budgetLine({ locations: [] })],
        entityLocations: [{ id: "5", name: "Miyapur" }],
        entityBuyers: [{ userId: 11, name: "Alice Buyer", email: null }],
      }),
    );
    expect(spec.deliveryLocation.source).toBe("entity_default");
    expect(spec.deliveryLocation.value?.label).toBe("Miyapur");
  });

  it("logs a decision for every stage", async () => {
    const spec = await recommendRequisition(INPUT, deps);
    const stages = spec.decisionLog.map((entry) => entry.stage);
    expect(stages).toEqual(
      expect.arrayContaining(["lineItems", "budget", "poHistory", "department", "deliveryLocation", "needByDate", "buyer"]),
    );
  });

  it("is deterministic across repeated runs", async () => {
    const first = await recommendRequisition(INPUT, deps);
    const second = await recommendRequisition(INPUT, deps);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
