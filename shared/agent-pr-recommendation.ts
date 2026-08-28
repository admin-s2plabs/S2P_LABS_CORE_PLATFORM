/** Structured recommendation spec for the Procurement Ops Agent's PR creation workflow. */

/** Where a recommended value came from. Rendered as provenance on the review card. */
export type PrRecommendationSource =
  /** Read directly off the matched budget (entity, currency). */
  | "budget"
  /** The budget allowed exactly one value. */
  | "single_option"
  /** The logged-in user's own profile (department, requestor). */
  | "user_profile"
  /** Derived from historical approved purchase orders. */
  | "po_history"
  /** Estimated by the AI line item service. */
  | "ai"
  /** Default for the business entity when the budget mapped none. */
  | "entity_default"
  /** Deterministic last resort: first of the allowed set, alphabetically. */
  | "alphabetical"
  /** Options exist but none can be justified — the user must pick one. */
  | "needs_selection"
  /** Supplied by the user as an override; recommendation was skipped. */
  | "override"
  /** Nothing available — the user must supply this value. */
  | "none";

export interface PrRecommendationOption {
  id: string;
  label: string;
  detail?: string;
}

export interface PrRecommendedValue<T> {
  value: T | null;
  source: PrRecommendationSource;
  /** Human-readable justification, e.g. "average of 7 approved POs". */
  rationale: string;
  /** Count of historical records behind the value. Present when source is po_history. */
  sampleSize?: number;
  /** Full allowed set, so the review card can render an editable dropdown. */
  options?: PrRecommendationOption[];
}

export interface PrRecommendedIdLabel {
  id: string;
  label: string;
}

export interface PrRecommendedBudget {
  budgetLineId: number;
  budgetMasterId: number;
  budgetName: string;
  costCentreCode: string | null;
  costCentreName: string | null;
  lineDescription: string | null;
  /** Relevance score in [0,1] from the budget matcher. */
  score: number;
  /** Per-criterion breakdown, for explaining why this budget won. */
  scoreBreakdown: {
    budgetName: number;
    costCentre: number;
    description: number;
  };
}

export interface PrRecommendationLineItem {
  description: string;
  /** Null when the request stated no quantity and none could be predicted. */
  quantity: number | null;
  unitOfMeasure: string;
  estimatedPrice: number;
  itemId?: string;
  itemCode?: string;
  categoryCode?: string;
  categoryName?: string;
  /** True when the AI synthesized this line rather than matching the catalog. */
  aiGenerated: boolean;
  /** True when estimatedPrice is an AI estimate rather than a real purchase price. */
  priceAssumed?: boolean;
  /** Set when the quantity came from the AI prediction service instead of the request. */
  quantityPredicted?: boolean;
}

/** Emitted when the engine refuses to guess and needs the user to disambiguate. */
export interface PrRecommendationChoice {
  field: "budget" | "department" | "deliveryLocation" | "needByDate";
  prompt: string;
  options: PrRecommendationOption[];
}

export interface PrRecommendationDecision {
  stage: string;
  outcome: string;
  detail?: string;
}

export interface PrRecommendationSpec {
  kind: "pr_recommendation";
  /** The original natural-language request. */
  request: string;
  budget: PrRecommendedValue<PrRecommendedBudget>;
  businessEntity: PrRecommendedValue<PrRecommendedIdLabel>;
  department: PrRecommendedValue<PrRecommendedIdLabel>;
  deliveryLocation: PrRecommendedValue<PrRecommendedIdLabel>;
  currency: PrRecommendedValue<string>;
  /** ISO date (YYYY-MM-DD). */
  needByDate: PrRecommendedValue<string>;
  buyer: PrRecommendedValue<PrRecommendedIdLabel>;
  requestor: PrRecommendedValue<PrRecommendedIdLabel>;
  lineItems: PrRecommendationLineItem[];
  /** Set when the user must choose before the PR can be created. */
  pendingChoice?: PrRecommendationChoice;
  /** Field keys with no recommendation; the user must fill them in. */
  unresolved: string[];
  /** False while a pendingChoice or unresolved required field remains. */
  canCreate: boolean;
  decisionLog: PrRecommendationDecision[];
}

/** User edits from the review card. A set field pins that value and skips its recommender. */
export interface PrRecommendationOverrides {
  budgetLineId?: number;
  orgId?: number;
  departmentName?: string;
  deliveryLocationId?: string;
  currency?: string;
  needByDate?: string;
  buyerId?: number;
}

/** Display names for the keys that appear in `unresolved`. */
const PR_FIELD_LABELS: Record<string, string> = {
  budget: "budget",
  businessEntity: "business entity",
  department: "department",
  deliveryLocation: "delivery location",
  currency: "currency",
  needByDate: "need by date",
  buyer: "buyer",
  lineItemQuantity: "line item quantity",
  lineItemDescription: "item master item",
};

export function prFieldLabel(field: string): string {
  return PR_FIELD_LABELS[field] ?? field;
}

export function isPrRecommendation(value: unknown): value is PrRecommendationSpec {
  return !!value && (value as PrRecommendationSpec).kind === "pr_recommendation";
}

/**
 * Fields whose recommendation is invalidated when the keyed field changes.
 * Drives the review card's recalculation without a second code path.
 */
export const PR_RECOMMENDATION_DEPENDENTS: Record<
  keyof PrRecommendationOverrides,
  Array<keyof PrRecommendationOverrides>
> = {
  budgetLineId: ["orgId", "departmentName", "deliveryLocationId", "currency", "needByDate", "buyerId"],
  orgId: ["deliveryLocationId", "needByDate", "buyerId"],
  departmentName: ["needByDate", "buyerId"],
  deliveryLocationId: [],
  currency: [],
  needByDate: [],
  buyerId: [],
};
