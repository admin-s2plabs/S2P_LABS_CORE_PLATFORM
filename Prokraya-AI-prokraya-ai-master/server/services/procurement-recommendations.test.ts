import { describe, expect, it } from "vitest";
import {
  classifyProcurementRecommendationIntent,
  formatItemRecommendations,
  formatQuantityRecommendation,
  formatRequisitionItemSuggestions,
} from "./procurement-recommendations";

describe("classifyProcurementRecommendationIntent — the three suggestion templates", () => {
  it("routes 'Recommend items for {description}' to the AI Advisor", () => {
    expect(classifyProcurementRecommendationIntent("Recommend items for apple laptops.")).toEqual({
      tool: "recommend_items_for_description",
      description: "apple laptops",
    });
  });

  it("routes 'Suggest the most appropriate items for {pr_id}' to AI Assisted", () => {
    expect(
      classifyProcurementRecommendationIntent("Suggest the most appropriate items for PR_00072."),
    ).toEqual({
      tool: "suggest_items_for_requisition",
      prNumber: "PR_00072",
    });
  });

  it("routes 'Recommend the quantity for {item}' to quantity prediction", () => {
    expect(classifyProcurementRecommendationIntent("Recommend the quantity for laptops.")).toEqual({
      tool: "recommend_item_quantity",
      itemName: "laptops",
    });
  });

  it("strips the {{ }} the composer wraps a filled template in", () => {
    expect(classifyProcurementRecommendationIntent("Recommend the quantity for {{laptops}}.")).toEqual({
      tool: "recommend_item_quantity",
      itemName: "laptops",
    });
    expect(
      classifyProcurementRecommendationIntent("Suggest the most appropriate items for {{PR_00072}}."),
    ).toEqual({ tool: "suggest_items_for_requisition", prNumber: "PR_00072" });
  });
});

describe("classifyProcurementRecommendationIntent — wording variations", () => {
  it("accepts other ways of asking for items", () => {
    expect(classifyProcurementRecommendationIntent("suggest items for a new engineering hire")).toEqual({
      tool: "recommend_items_for_description",
      description: "a new engineering hire",
    });
    expect(
      classifyProcurementRecommendationIntent("Recommend some relevant items for office setup"),
    ).toEqual({ tool: "recommend_items_for_description", description: "office setup" });
  });

  it("accepts other ways of asking for a quantity", () => {
    expect(classifyProcurementRecommendationIntent("suggest a quantity for monitors")).toEqual({
      tool: "recommend_item_quantity",
      itemName: "monitors",
    });
    expect(
      classifyProcurementRecommendationIntent("predict the optimal order quantity of A4 paper"),
    ).toEqual({ tool: "recommend_item_quantity", itemName: "A4 paper" });
  });

  it("prefers the named PR over free text when both could match", () => {
    expect(
      classifyProcurementRecommendationIntent("Recommend items for PR_00072"),
    ).toEqual({ tool: "suggest_items_for_requisition", prNumber: "PR_00072" });
  });

  it("prefers a quantity question over an item question", () => {
    expect(
      classifyProcurementRecommendationIntent("Recommend the quantity for laptops for PR_00072"),
    ).toMatchObject({ tool: "recommend_item_quantity" });
  });
});

describe("classifyProcurementRecommendationIntent — creation requests are untouched", () => {
  const creationPrompts = [
    "Create a PO for 10 laptops",
    "Create a PR for 10 laptops",
    "create a po for laptops",
    "Create a purchase requisition based on office chairs",
    "I need 20 laptops for a new engineering team",
    "Convert PR_00072 to a PO for vendor 5",
    "add laptops to PR_00072",
    "Submit PR_00072 for approval",
    "Show details of PR_00072",
    "How many PRs are currently active?",
  ];

  it.each(creationPrompts)("leaves %s to the existing flow", (prompt) => {
    expect(classifyProcurementRecommendationIntent(prompt)).toBeNull();
  });

  it("does not fire on an empty or item-less message", () => {
    expect(classifyProcurementRecommendationIntent("")).toBeNull();
    expect(classifyProcurementRecommendationIntent("recommend items for")).toBeNull();
    expect(classifyProcurementRecommendationIntent("recommend something")).toBeNull();
  });
});

describe("formatItemRecommendations", () => {
  const items = [
    {
      itemId: "1",
      itemCode: "ITM-100",
      name: "MacBook Pro 14",
      unitPrice: 185000,
      priceAssumed: true,
      unitOfMeasure: "Each",
      categoryName: "IT Hardware",
      reason: "Matches the request for apple laptops.",
      frequency: 3,
      fromPRs: ["PR_00011", "PR_00042"],
    },
  ];

  it("renders the item without offering to create anything", () => {
    const output = formatItemRecommendations("apple laptops", items);
    expect(output).toContain("Recommended Items");
    expect(output).toContain("MacBook Pro 14");
    expect(output).toContain("ITM-100");
    expect(output).toContain("IT Hardware");
    expect(output).toContain("185,000");
    expect(output).toContain("_(estimated)_");
    expect(output).toContain("Ordered on 3 previous requisitions");
    expect(output).toContain("PR_00011");
    expect(output).toContain("nothing has been created");
  });

  it("says so plainly when the catalog has no match", () => {
    const output = formatItemRecommendations("unobtainium", []);
    expect(output).toContain("couldn't find");
    expect(output).toContain("unobtainium");
  });
});

describe("formatRequisitionItemSuggestions", () => {
  it("makes clear nothing was added to the PR", () => {
    const output = formatRequisitionItemSuggestions("PR_00072", [
      {
        itemId: "9",
        name: "LAPTOPS",
        unitPrice: 1200,
        unitOfMeasure: "Each",
        categoryName: "Office Supplies",
      },
    ]);
    expect(output).toContain("Suggested Items for PR_00072");
    expect(output).toContain("LAPTOPS");
    expect(output).toContain("no line items were added to PR_00072");
    expect(output).toContain('add LAPTOPS to PR_00072');
  });

  it("explains an empty result", () => {
    const output = formatRequisitionItemSuggestions("PR_00072", []);
    expect(output).toContain("PR_00072");
    expect(output).toContain("description");
  });
});

describe("formatQuantityRecommendation", () => {
  const prediction = {
    suggestedQuantity: 7,
    reasoning: "Historical average quantity is 7.5 with recent purchases of 7.",
    confidence: 0.9,
    basedOn: ["historical_quantities", "purchase_frequency"],
  };

  it("matches what the requisition screen's card shows", () => {
    const output = formatQuantityRecommendation("LAPTOPS", prediction);
    expect(output).toContain("AI Quantity Recommendation — LAPTOPS");
    expect(output).toContain("**Suggested Quantity:** 7");
    expect(output).toContain("High Confidence (90%)");
    expect(output).toContain("Historical average quantity is 7.5");
    expect(output).toContain("Historical Quantities, Purchase Frequency");
  });

  it("states that no budget context was used for a standalone question", () => {
    const output = formatQuantityRecommendation("LAPTOPS", prediction);
    expect(output).toContain("No requisition or budget context was used");
    expect(output).toContain("Nothing has been created");
  });

  it("names the requisition when its budget informed the prediction", () => {
    const output = formatQuantityRecommendation("LAPTOPS", prediction, { prNumber: "PR_00072" });
    expect(output).toContain("Using PR_00072's budget for context");
    expect(output).not.toContain("No requisition or budget context");
  });

  it("grades confidence the same way the card does", () => {
    expect(
      formatQuantityRecommendation("X", { ...prediction, confidence: 0.65 }),
    ).toContain("Medium Confidence (65%)");
    expect(
      formatQuantityRecommendation("X", { ...prediction, confidence: 0.4 }),
    ).toContain("Low Confidence (40%)");
  });

  it("omits the badge when the service returned no confidence", () => {
    const output = formatQuantityRecommendation("X", { suggestedQuantity: 7 });
    expect(output).toContain("**Suggested Quantity:** 7");
    expect(output).not.toContain("Confidence");
  });
});
