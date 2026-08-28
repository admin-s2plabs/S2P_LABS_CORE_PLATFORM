/** Structured recommendation spec for the Procurement Ops Agent's Direct PO workflow. */

import type {
  PrRecommendationDecision,
  PrRecommendationLineItem,
  PrRecommendedBudget,
  PrRecommendedIdLabel,
  PrRecommendedValue,
} from "./agent-pr-recommendation";

export type PoRecommendationSource =
  | "budget"
  | "single_option"
  | "user_profile"
  | "po_history"
  | "ai"
  | "entity_default"
  | "alphabetical"
  | "override"
  | "default"
  | "none";

export interface PoRecommendationOption {
  id: string;
  label: string;
  detail?: string;
}

export interface PoRecommendedValue<T> {
  value: T | null;
  source: PoRecommendationSource;
  rationale: string;
  sampleSize?: number;
  options?: PoRecommendationOption[];
}

export interface PoRecommendationChoice {
  field: "budget" | "department" | "deliveryLocation" | "needByDate" | "vendor" | "paymentTerms";
  prompt: string;
  options: PoRecommendationOption[];
}

export interface PoRecommendationOverrides {
  budgetLineId?: number;
  orgId?: number;
  departmentName?: string;
  deliveryLocationId?: string;
  currency?: string;
  needByDate?: string;
  supplierId?: number;
  paymentTermsId?: string;
}

export interface PoRecommendationSpec {
  kind: "po_recommendation";
  request: string;
  budget: PrRecommendedValue<PrRecommendedBudget>;
  businessEntity: PrRecommendedValue<PrRecommendedIdLabel>;
  department: PrRecommendedValue<PrRecommendedIdLabel>;
  deliveryLocation: PrRecommendedValue<PrRecommendedIdLabel>;
  currency: PrRecommendedValue<string>;
  needByDate: PoRecommendedValue<string>;
  /** Always the logged-in user; Buyer is not shown (same person on Direct PO). */
  requestor: PoRecommendedValue<PrRecommendedIdLabel>;
  vendor: PoRecommendedValue<PrRecommendedIdLabel>;
  paymentTerms: PoRecommendedValue<PrRecommendedIdLabel>;
  lineItems: PrRecommendationLineItem[];
  pendingChoice?: PoRecommendationChoice;
  unresolved: string[];
  canCreate: boolean;
  decisionLog: PrRecommendationDecision[];
}

const PO_FIELD_LABELS: Record<string, string> = {
  budget: "budget",
  businessEntity: "business entity",
  department: "department",
  deliveryLocation: "delivery location",
  currency: "currency",
  needByDate: "need by date",
  vendor: "vendor",
  paymentTerms: "payment terms",
  lineItemQuantity: "line item quantity",
  lineItemDescription: "item master item",
};

export function poFieldLabel(field: string): string {
  return PO_FIELD_LABELS[field] ?? field;
}

export function isPoRecommendation(value: unknown): value is PoRecommendationSpec {
  return !!value && (value as PoRecommendationSpec).kind === "po_recommendation";
}

/**
 * Fields whose recommendation is invalidated when the keyed field changes.
 * Mirrors PR dependents, plus vendor (location/budget change may re-suggest).
 */
export const PO_RECOMMENDATION_DEPENDENTS: Record<
  keyof PoRecommendationOverrides,
  Array<keyof PoRecommendationOverrides>
> = {
  budgetLineId: [
    "orgId",
    "departmentName",
    "deliveryLocationId",
    "currency",
    "needByDate",
    "supplierId",
  ],
  orgId: ["deliveryLocationId", "needByDate", "supplierId"],
  departmentName: ["needByDate", "supplierId"],
  deliveryLocationId: ["supplierId"],
  currency: [],
  needByDate: [],
  supplierId: [],
  paymentTermsId: [],
};

/** Confirm payload for execute_create_purchase_order_from_recommendation. */
export function buildPoCreatePayload(spec: PoRecommendationSpec) {
  const requestorId = spec.requestor.value ? Number(spec.requestor.value.id) : null;
  return {
    description: spec.request,
    budgetLineId: spec.budget.value?.budgetLineId ?? null,
    budgetName: spec.budget.value?.budgetName ?? null,
    orgId: spec.businessEntity.value ? Number(spec.businessEntity.value.id) : null,
    orgName: spec.businessEntity.value?.label ?? null,
    departmentId: spec.department.value?.id ?? null,
    departmentName: spec.department.value?.label ?? null,
    deliveryLocationId: spec.deliveryLocation.value?.id ?? null,
    deliveryLocationName: spec.deliveryLocation.value?.label ?? null,
    currency: spec.currency.value,
    needByDate: spec.needByDate.value,
    supplierId: spec.vendor.value ? Number(spec.vendor.value.id) : null,
    supplierName: spec.vendor.value?.label ?? null,
    paymentTermsId: spec.paymentTerms.value?.id ?? null,
    paymentTermsName: spec.paymentTerms.value?.label ?? null,
    requestorId,
    requestorName: spec.requestor.value?.label ?? null,
    // Direct PO: buyer = requestor
    buyerId: requestorId,
    buyerName: spec.requestor.value?.label ?? null,
    lineItems: spec.lineItems,
  };
}

/** Snapshot of the current card, so a later chat edit can keep vendor when only the date changes. */
export function specToPoOverrides(spec: PoRecommendationSpec): PoRecommendationOverrides {
  return {
    budgetLineId: spec.budget.value?.budgetLineId,
    orgId: spec.businessEntity.value ? Number(spec.businessEntity.value.id) : undefined,
    departmentName: spec.department.value?.label ?? undefined,
    deliveryLocationId: spec.deliveryLocation.value?.id,
    currency: spec.currency.value ?? undefined,
    needByDate: spec.needByDate.value ?? undefined,
    supplierId: spec.vendor.value ? Number(spec.vendor.value.id) : undefined,
    paymentTermsId: spec.paymentTerms.value?.id,
  };
}
