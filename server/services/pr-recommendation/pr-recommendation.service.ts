/**
 * Orchestrates the Purchase Requisition recommendation workflow.
 *
 * Order matters: AI line items run first so that budget matching and every
 * purchase-order search use normalized enterprise item names rather than the
 * raw user sentence.
 *
 * Overrides from the review card pin a field and skip its recommender, which is
 * what makes "edit a field and recalculate dependents" a single code path
 * rather than a second one.
 */

import type {
  PrRecommendationChoice,
  PrRecommendationDecision,
  PrRecommendationLineItem,
  PrRecommendationOverrides,
  PrRecommendationSpec,
  PrRecommendedBudget,
  PrRecommendedIdLabel,
  PrRecommendedValue,
} from "@shared/agent-pr-recommendation";
import { selectBestBudgetLine, type ScoredBudgetLine } from "./budget-matcher";
import { budgetLineLabel, buildBudgetSelectOptions } from "./budget-options";
import { resolveDeliveryLocation, resolveDepartment, type FieldResolution } from "./field-resolver";
import { addDays, averageLeadTime, toIsoDate } from "./lead-time";
import { selectBuyer } from "./buyer-selector";
import type {
  BudgetLineCandidate,
  IdName,
  ItemMatchKeys,
  PoHistoryRow,
  PrRecommendationDeps,
} from "./ports";

export interface PrRecommendationInput {
  request: string;
  sessionUser: { id: number; name: string; department?: string | null };
  overrides?: PrRecommendationOverrides;
}

/** How many alternatives to offer when asking the user to pick a budget. */
const BUDGET_CHOICE_LIMIT = 5;

function value<T>(
  val: T | null,
  source: PrRecommendedValue<T>["source"],
  rationale: string,
  extras: { sampleSize?: number; options?: PrRecommendedValue<T>["options"] } = {},
): PrRecommendedValue<T> {
  return { value: val, source, rationale, ...extras };
}

function toOptions(values: IdName[]) {
  return values.map((entry) => ({ id: entry.id, label: entry.name }));
}

function budgetOptionLabel(line: ScoredBudgetLine): string {
  return budgetLineLabel(line.candidate.budgetName, line.candidate.costCentreName);
}

function toRecommendedBudget(line: ScoredBudgetLine): PrRecommendedBudget {
  return {
    budgetLineId: line.candidate.budgetLineId,
    budgetMasterId: line.candidate.budgetMasterId,
    budgetName: line.candidate.budgetName,
    costCentreCode: line.candidate.costCentreCode,
    costCentreName: line.candidate.costCentreName,
    lineDescription: line.candidate.lineDescription,
    score: Number(line.score.toFixed(4)),
    scoreBreakdown: {
      budgetName: Number(line.breakdown.budgetName.toFixed(4)),
      costCentre: Number(line.breakdown.costCentre.toFixed(4)),
      description: Number(line.breakdown.description.toFixed(4)),
    },
  };
}

/** Builds the item identifiers used to match historical PO lines. */
export function buildItemMatchKeys(lineItems: PrRecommendationLineItem[]): ItemMatchKeys {
  const itemIds = new Set<string>();
  const categoryCodes = new Set<string>();
  const namePatterns = new Set<string>();

  for (const item of lineItems) {
    if (item.itemId) itemIds.add(String(item.itemId));
    if (item.categoryCode) categoryCodes.add(String(item.categoryCode));
    const label = (item.description || "").trim();
    if (label.length >= 3) namePatterns.add(`%${label}%`);
    // Also match on individual significant words, since PO line descriptions
    // rarely repeat a full AI-normalized product name verbatim.
    for (const word of label.split(/\s+/)) {
      if (word.length >= 4) namePatterns.add(`%${word}%`);
    }
  }

  return {
    itemIds: Array.from(itemIds),
    categoryCodes: Array.from(categoryCodes),
    namePatterns: Array.from(namePatterns),
  };
}

function fieldFromResolution(resolution: FieldResolution): PrRecommendedValue<PrRecommendedIdLabel> {
  return {
    value: resolution.value ? { id: resolution.value.id, label: resolution.value.name } : null,
    source: resolution.source,
    rationale: resolution.rationale,
    sampleSize: resolution.sampleSize,
    options: toOptions(resolution.options),
  };
}

export async function recommendRequisition(
  input: PrRecommendationInput,
  deps: PrRecommendationDeps,
): Promise<PrRecommendationSpec> {
  const overrides = input.overrides ?? {};
  const decisionLog: PrRecommendationDecision[] = [];
  const unresolved: string[] = [];
  let pendingChoice: PrRecommendationChoice | undefined;

  const record = (stage: string, outcome: string, detail?: string) => {
    decisionLog.push({ stage, outcome, detail });
    deps.log?.(`${stage}: ${outcome}`, detail ? { detail } : undefined);
  };

  // ---- Step 1: AI-assisted line items (run first; they drive every search) ----
  const userDepartment = input.sessionUser.department ?? (await deps.users.getDepartmentName(input.sessionUser.id));
  const ai = await deps.aiLineItems.generateLineItems(input.request, { department: userDepartment });
  const lineItems = ai.lineItems;
  if (ai.unavailable) {
    record("lineItems", "ai_unavailable", "Falling back to raw request text for matching.");
  } else {
    record("lineItems", `generated_${lineItems.length}`, lineItems.map((item) => item.description).join(", "));
  }

  const queryTerms = [input.request, ...lineItems.map((item) => item.description)].filter(Boolean);

  // ---- Step 2: best matching approved budget line ----
  // The full approved list is loaded up front for two purposes: the matcher
  // scores against it, and every branch below hands all of it to the review
  // card's dropdown. Scoring picks the default; it must not limit the choices.
  let selectedBudget: ScoredBudgetLine | null = null;
  let budgetField: PrRecommendedValue<PrRecommendedBudget>;
  let budgetCandidate: BudgetLineCandidate | null = null;
  const candidates = await deps.budgets.listApprovedBudgetLines();

  if (overrides.budgetLineId != null) {
    budgetCandidate = await deps.budgets.getBudgetLineById(overrides.budgetLineId);
    if (budgetCandidate) {
      selectedBudget = { candidate: budgetCandidate, score: 1, breakdown: { budgetName: 1, costCentre: 1, description: 1 } };
      const recommended = toRecommendedBudget(selectedBudget);
      budgetField = value(recommended, "override", "Selected by you.", {
        options: buildBudgetSelectOptions(candidates, recommended),
      });
      record("budget", "override", `budgetLineId=${overrides.budgetLineId}`);
    } else {
      budgetField = value<PrRecommendedBudget>(null, "none", "The selected budget line could not be found.", {
        options: buildBudgetSelectOptions(candidates),
      });
      unresolved.push("budget");
      record("budget", "override_not_found", `budgetLineId=${overrides.budgetLineId}`);
    }
  } else {
    const selection = selectBestBudgetLine(candidates, queryTerms);

    if (selection.status === "selected") {
      selectedBudget = selection.selected;
      budgetCandidate = selection.selected.candidate;
      const recommended = toRecommendedBudget(selection.selected);
      budgetField = value(
        recommended,
        "budget",
        `Best match of ${candidates.length} approved budget lines (score ${selection.selected.score.toFixed(2)}).`,
        { options: buildBudgetSelectOptions(candidates, recommended) },
      );
      record("budget", "selected", `${selection.selected.candidate.budgetName} (line ${selection.selected.candidate.budgetLineId})`);
    } else if (selection.status === "ambiguous") {
      budgetField = value<PrRecommendedBudget>(null, "none", "Several approved budgets match equally well.", {
        options: buildBudgetSelectOptions(candidates),
      });
      pendingChoice = {
        field: "budget",
        prompt: "Multiple budgets match this request equally well. Which should be used?",
        options: selection.tied.map((line) => ({
          id: String(line.candidate.budgetLineId),
          label: budgetOptionLabel(line),
          detail: `score ${line.score.toFixed(2)}`,
        })),
      };
      unresolved.push("budget");
      record("budget", "ambiguous", `${selection.tied.length} tied candidates`);
    } else {
      budgetField = value<PrRecommendedBudget>(null, "none", "No approved budget matched this request.", {
        options: buildBudgetSelectOptions(candidates),
      });
      pendingChoice = {
        field: "budget",
        prompt: "No approved budget clearly matches this request. Please choose one.",
        options: selection.scored.slice(0, BUDGET_CHOICE_LIMIT).map((line) => ({
          id: String(line.candidate.budgetLineId),
          label: budgetOptionLabel(line),
          detail: `score ${line.score.toFixed(2)}`,
        })),
      };
      unresolved.push("budget");
      record("budget", "no_match", `best score below threshold across ${selection.scored.length} lines`);
    }
  }

  // ---- Step 3: fields carried straight off the budget ----
  const orgId = overrides.orgId ?? budgetCandidate?.businessEntityId ?? null;
  const businessEntity: PrRecommendedValue<PrRecommendedIdLabel> = orgId != null
    ? value(
        { id: String(orgId), label: budgetCandidate?.businessEntityName ?? String(orgId) },
        overrides.orgId != null ? "override" : "budget",
        overrides.orgId != null ? "Selected by you." : "Business entity of the matched budget.",
      )
    : value<PrRecommendedIdLabel>(null, "none", "No business entity — depends on the budget.");
  if (orgId == null) unresolved.push("businessEntity");

  const currencyValue = overrides.currency ?? budgetCandidate?.currency ?? null;
  const currency = currencyValue
    ? value(currencyValue, overrides.currency ? "override" : "budget", overrides.currency ? "Selected by you." : "Currency of the matched budget.")
    : value<string>(null, "none", "No currency — depends on the budget.");
  if (!currencyValue) unresolved.push("currency");

  // ---- Step 4: purchase order history, fetched once and reused ----
  const keys = buildItemMatchKeys(lineItems);
  const hasKeys = keys.itemIds.length > 0 || keys.categoryCodes.length > 0 || keys.namePatterns.length > 0;

  let entityScopedHistory: PoHistoryRow[] = [];
  let unscopedHistory: PoHistoryRow[] = [];
  if (hasKeys) {
    unscopedHistory = await deps.poHistory.findApprovedPoHistory({ keys });
    entityScopedHistory = orgId != null
      ? unscopedHistory.filter((row) => row.orgId === orgId)
      : unscopedHistory;
    record("poHistory", `matched_${unscopedHistory.length}`, `${entityScopedHistory.length} within the selected entity`);
  } else {
    record("poHistory", "skipped", "No item keys available to match against.");
  }

  // ---- Step 5: department (fixed ladder, never random) ----
  const allowedDepartments = budgetCandidate?.departments ?? [];
  let department: PrRecommendedValue<PrRecommendedIdLabel>;
  if (overrides.departmentName) {
    const match = allowedDepartments.find((d) => d.name.toLowerCase() === overrides.departmentName!.toLowerCase());
    department = value(
      { id: match?.id ?? overrides.departmentName, label: match?.name ?? overrides.departmentName },
      "override",
      "Selected by you.",
      { options: toOptions(allowedDepartments) },
    );
    record("department", "override", overrides.departmentName);
  } else {
    const resolution = resolveDepartment({
      allowed: allowedDepartments,
      userDepartment,
      poHistory: entityScopedHistory,
    });
    department = fieldFromResolution(resolution);
    if (!resolution.value) unresolved.push("department");
    record("department", resolution.source, resolution.value?.name);
  }

  // ---- Step 5b: predict quantities the request never stated ----
  // Sits here because the prediction service keys off the department and budget
  // line, neither of which is known when the line items are first generated.
  let resolvedLineItems = lineItems;
  const missingQuantities = lineItems.filter((item) => item.quantity == null).length;
  if (missingQuantities > 0) {
    const predictionDepartment = department.value?.label ?? null;
    if (!predictionDepartment) {
      record("quantity", "skipped", "Department unresolved, so no quantity could be predicted.");
    } else {
      const budgetLineId = budgetCandidate?.budgetLineId ?? null;
      const predictions = await Promise.all(
        lineItems.map((item) =>
          item.quantity != null
            ? Promise.resolve<number | null>(null)
            : deps.aiLineItems.predictQuantity({
                description: item.description,
                department: predictionDepartment,
                budgetLineId,
              }),
        ),
      );
      resolvedLineItems = lineItems.map((item, index) => {
        const predicted = predictions[index];
        return item.quantity == null && predicted != null
          ? { ...item, quantity: predicted, quantityPredicted: true }
          : item;
      });
      const filled = predictions.filter((prediction) => prediction != null).length;
      record("quantity", `predicted_${filled}_of_${missingQuantities}`, predictionDepartment);
    }
  }

  if (resolvedLineItems.some((item) => item.quantity == null)) {
    unresolved.push("lineItemQuantity");
  }

  // A line the parser could not match to the item master carries only free text.
  // Creating from it would write a requisition line with no item id, so the user
  // has to pick a real catalog item on the card first.
  if (resolvedLineItems.some((item) => !item.itemId || !item.description.trim())) {
    unresolved.push("lineItemDescription");
  }

  // ---- Step 6: delivery location ----
  const allowedLocations = budgetCandidate?.locations ?? [];
  let deliveryLocation: PrRecommendedValue<PrRecommendedIdLabel>;
  if (overrides.deliveryLocationId) {
    const match = allowedLocations.find((l) => l.id === overrides.deliveryLocationId);
    deliveryLocation = value(
      { id: overrides.deliveryLocationId, label: match?.name ?? overrides.deliveryLocationId },
      "override",
      "Selected by you.",
      { options: toOptions(allowedLocations) },
    );
    record("deliveryLocation", "override", overrides.deliveryLocationId);
  } else {
    const entityLocations = allowedLocations.length === 0 && orgId != null
      ? await deps.locations.listEntityLocations(orgId)
      : [];
    const resolution = resolveDeliveryLocation({
      allowed: allowedLocations,
      poHistory: entityScopedHistory,
      entityLocations,
    });
    deliveryLocation = fieldFromResolution(resolution);
    if (!resolution.value) unresolved.push("deliveryLocation");
    record("deliveryLocation", resolution.source, resolution.value?.name);
  }

  // ---- Step 7: need by date ----
  const departmentName = department.value?.label ?? null;
  const primaryHistory = departmentName
    ? entityScopedHistory.filter(
        (row) => (row.departmentName ?? "").trim().toLowerCase() === departmentName.trim().toLowerCase(),
      )
    : entityScopedHistory;

  let needByDate: PrRecommendedValue<string>;
  if (overrides.needByDate) {
    needByDate = value(overrides.needByDate, "override", "Selected by you.");
    record("needByDate", "override", overrides.needByDate);
  } else {
    const primaryAverage = averageLeadTime(primaryHistory);
    const fallbackAverage = primaryAverage ? null : averageLeadTime(unscopedHistory);
    const chosen = primaryAverage ?? fallbackAverage;

    if (chosen) {
      const scope = primaryAverage ? "matching entity and department" : "all business entities";
      needByDate = value(
        toIsoDate(addDays(deps.clock.now(), chosen.averageDays)),
        "po_history",
        `Average ${chosen.averageDays}-day lead time across ${chosen.sampleSize} approved PO${chosen.sampleSize === 1 ? "" : "s"} (${scope}).`,
        { sampleSize: chosen.sampleSize },
      );
      record("needByDate", "po_history", `${chosen.averageDays}d from ${chosen.sampleSize} POs`);
    } else if (ai.leadTimeDays != null) {
      needByDate = value(
        toIsoDate(addDays(deps.clock.now(), ai.leadTimeDays)),
        "ai",
        `No matching purchase order history; AI estimated a ${ai.leadTimeDays}-day lead time.`,
      );
      record("needByDate", "ai", `${ai.leadTimeDays}d`);
    } else {
      needByDate = value<string>(null, "none", "No historical or AI lead time available — please select a date.");
      unresolved.push("needByDate");
      if (!pendingChoice) {
        pendingChoice = {
          field: "needByDate",
          prompt: "No lead time could be determined for these items. Please choose a need-by date.",
          options: [],
        };
      }
      record("needByDate", "unresolved");
    }
  }

  // ---- Step 8: buyer ----
  let buyer: PrRecommendedValue<PrRecommendedIdLabel>;
  if (overrides.buyerId != null) {
    // Only honour an override that names someone the card actually offered;
    // anything else would put an unrenderable value back in the dropdown.
    const pool = await deps.buyers.getActiveBuyers(orgId);
    const options = pool.map((entry) => ({ id: String(entry.userId), label: entry.name }));
    const match = pool.find((entry) => entry.userId === overrides.buyerId);
    buyer = match
      ? value({ id: String(match.userId), label: match.name }, "override", "Selected by you.", { options })
      : value<PrRecommendedIdLabel>(
          null,
          "needs_selection",
          "That buyer is no longer selectable for this business entity — please select a buyer from the list.",
          { options },
        );
    if (!match) unresolved.push("buyer");
    record("buyer", match ? "override" : "needs_selection", String(overrides.buyerId));
  } else {
    const entityPool = orgId != null ? await deps.buyers.getActiveBuyers(orgId) : [];
    const needsOrgFallback = entityPool.length === 0;
    const orgPool = needsOrgFallback ? await deps.buyers.getActiveBuyers(null) : [];
    const entityHistory = orgId != null ? await deps.buyers.getBuyerAssignmentCounts(orgId) : [];
    const orgHistory = needsOrgFallback ? await deps.buyers.getBuyerAssignmentCounts(null) : [];

    const selection = selectBuyer({
      poHistory: primaryHistory.length > 0 ? primaryHistory : entityScopedHistory,
      entityPool,
      entityHistory,
      orgPool,
      orgHistory,
    });
    buyer = {
      value: selection.buyer ? { id: selection.buyer.id, label: selection.buyer.name } : null,
      source: selection.source,
      rationale: selection.rationale,
      sampleSize: selection.sampleSize,
      options: selection.options.map((entry) => ({ id: entry.id, label: entry.name })),
    };
    if (!selection.buyer) unresolved.push("buyer");
    record("buyer", selection.source, selection.buyer?.name);
  }

  // ---- Step 9: requestor is always the logged-in user ----
  const requestor = value<PrRecommendedIdLabel>(
    { id: String(input.sessionUser.id), label: input.sessionUser.name },
    "user_profile",
    "The currently logged-in user.",
  );

  return {
    kind: "pr_recommendation",
    request: input.request,
    budget: budgetField,
    businessEntity,
    department,
    deliveryLocation,
    currency,
    needByDate,
    buyer,
    requestor,
    lineItems: resolvedLineItems,
    pendingChoice,
    unresolved,
    canCreate: !pendingChoice && unresolved.length === 0 && resolvedLineItems.length > 0,
    decisionLog,
  };
}
