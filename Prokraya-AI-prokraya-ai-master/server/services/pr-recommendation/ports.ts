/**
 * Data shapes and injected dependencies for the PR recommendation engine.
 *
 * Every side effect (database, AI, clock) is reached through one of these
 * interfaces so the recommenders stay pure and the orchestrator can be driven
 * by fakes in tests.
 */

import type { PrRecommendationLineItem } from "@shared/agent-pr-recommendation";

export interface IdName {
  id: string;
  name: string;
}

export interface BudgetLineCandidate {
  budgetLineId: number;
  budgetMasterId: number;
  budgetName: string;
  costCentreCode: string | null;
  costCentreName: string | null;
  lineDescription: string | null;
  currency: string | null;
  businessEntityId: number | null;
  businessEntityName: string | null;
  /** Latest approval timestamp, for the most-recently-approved tiebreak. */
  approvedAt: Date | null;
  departments: IdName[];
  locations: IdName[];
}

export interface PoHistoryRow {
  poNumber: string;
  createdDate: Date;
  requiredDate: Date;
  orgId: number | null;
  departmentName: string | null;
  buyerId: number | null;
  buyerName: string | null;
  deliveryLocationId: string | null;
  deliveryLocationName: string | null;
}

export interface BuyerFrequency {
  userId: number;
  name: string;
  count: number;
}

export interface ActiveBuyer {
  userId: number;
  name: string;
  email: string | null;
}

/** Item identifiers used to match PO lines, in descending order of precision. */
export interface ItemMatchKeys {
  itemIds: string[];
  categoryCodes: string[];
  namePatterns: string[];
}

export interface BudgetPort {
  listApprovedBudgetLines(): Promise<BudgetLineCandidate[]>;
  getBudgetLineById(budgetLineId: number): Promise<BudgetLineCandidate | null>;
}

export interface PoHistoryPort {
  /** Approved POs whose lines match the item keys. Null filters are ignored. */
  findApprovedPoHistory(params: {
    keys: ItemMatchKeys;
    orgId?: number | null;
    departmentName?: string | null;
  }): Promise<PoHistoryRow[]>;
}

export interface BuyerPort {
  /** Buyer assignment counts from approved POs and PRs. Omit orgId for org-wide. */
  getBuyerAssignmentCounts(orgId?: number | null): Promise<BuyerFrequency[]>;
  /** Active procurement managers and officers. Omit orgId for org-wide. */
  getActiveBuyers(orgId?: number | null): Promise<ActiveBuyer[]>;
}

export interface LocationPort {
  listEntityLocations(orgId: number): Promise<IdName[]>;
}

export interface UserPort {
  getDepartmentName(userId: number): Promise<string | null>;
}

export interface AiLineItemResult {
  lineItems: PrRecommendationLineItem[];
  /** AI-estimated procurement lead time in days, when the model offers one. */
  leadTimeDays: number | null;
  /** True when the AI backend was unreachable or unconfigured. */
  unavailable: boolean;
}

export interface AiLineItemPort {
  generateLineItems(request: string, context: { department?: string | null }): Promise<AiLineItemResult>;
  /**
   * Predicted order quantity for a line the user gave no quantity for. Runs
   * after the budget and department are known, since the prediction service
   * uses both. Returns null when no prediction is possible.
   */
  predictQuantity(params: {
    description: string;
    department: string;
    budgetLineId: number | null;
  }): Promise<number | null>;
}

export interface ClockPort {
  now(): Date;
}

export interface PrRecommendationDeps {
  budgets: BudgetPort;
  poHistory: PoHistoryPort;
  buyers: BuyerPort;
  locations: LocationPort;
  users: UserPort;
  aiLineItems: AiLineItemPort;
  clock: ClockPort;
  log?: (message: string, meta?: Record<string, unknown>) => void;
}
