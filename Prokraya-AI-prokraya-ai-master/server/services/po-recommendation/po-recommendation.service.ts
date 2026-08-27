/**
 * Direct PO recommendation — reuses the PR recommendation engine for shared
 * fields (budget, BE, dept, location, currency, need-by, line items), then
 * adds vendor + payment terms. Requestor is the session user; Buyer is not
 * exposed (same person on Direct PO).
 */

import { recommendRequisition } from "../pr-recommendation/pr-recommendation.service";
import { buildBudgetSelectOptions } from "../pr-recommendation/budget-options";
import type { PrRecommendationDeps } from "../pr-recommendation/ports";
import type {
  PrRecommendationOverrides,
  PrRecommendedBudget,
  PrRecommendedIdLabel,
  PrRecommendedValue,
} from "@shared/agent-pr-recommendation";
import type {
  PoRecommendationChoice,
  PoRecommendationOverrides,
  PoRecommendationSpec,
  PoRecommendedValue,
} from "@shared/agent-po-recommendation";
import { addDays, toIsoDate } from "../pr-recommendation/lead-time";

export interface PoRecommendationInput {
  request: string;
  sessionUser: { id: number; name: string; department?: string | null };
  overrides?: PoRecommendationOverrides;
}

export interface VendorSuggestion {
  vendorId: number;
  vendorName: string;
  matchScore?: number;
  reason?: string;
}

export interface PaymentTermsCandidate {
  paymentTermsId: string;
  paymentTermsName: string;
}

/** Cap for amber choice buttons; larger lists use the Select only. */
const VENDOR_CHOICE_BUTTON_LIMIT = 8;
/** Cap for the vendor Select fallback when AI suggests nothing. */
const VENDOR_SELECT_FALLBACK_LIMIT = 200;

/** Line shape passed into vendor suggest — includes category/item keys for SOS matching. */
export interface PoVendorSuggestLine {
  description: string;
  itemId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  qty?: number | null;
}

export interface PoRecommendationDeps {
  pr: PrRecommendationDeps;
  vendors: {
    suggest(params: {
      request: string;
      lineItems: PoVendorSuggestLine[];
      deliveryLocation?: string | null;
    }): Promise<VendorSuggestion[]>;
    /** Approved suppliers for manual pick when AI returns no matches. */
    listSelectable(limit?: number): Promise<VendorSuggestion[]>;
  };
  paymentTerms: {
    listActive(): Promise<PaymentTermsCandidate[]>;
    getDefault(): Promise<PaymentTermsCandidate | null>;
  };
}

function toVendorOptions(vendors: VendorSuggestion[]) {
  return vendors.map((s) => ({
    id: String(s.vendorId),
    label: s.vendorName,
    detail: s.matchScore != null ? `score ${s.matchScore.toFixed(2)}` : undefined,
  }));
}

/** Keep AI matches first, then fill from approved suppliers so the Select stays usable. */
async function vendorSelectOptions(
  deps: PoRecommendationDeps,
  suggestions: VendorSuggestion[],
  ensureId?: number,
): Promise<{ options: ReturnType<typeof toVendorOptions>; ensured?: VendorSuggestion }> {
  const byId = new Map<number, VendorSuggestion>();
  for (const s of suggestions) byId.set(s.vendorId, s);

  const selectable = await deps.vendors.listSelectable(VENDOR_SELECT_FALLBACK_LIMIT);
  for (const s of selectable) {
    if (!byId.has(s.vendorId)) byId.set(s.vendorId, s);
  }

  if (ensureId != null && !byId.has(ensureId)) {
    byId.set(ensureId, { vendorId: ensureId, vendorName: String(ensureId) });
  }

  const ordered: VendorSuggestion[] = [];
  for (const s of suggestions) {
    const entry = byId.get(s.vendorId);
    if (entry) ordered.push(entry);
  }
  if (ensureId != null) {
    const pinned = byId.get(ensureId);
    if (pinned && !ordered.some((s) => s.vendorId === ensureId)) ordered.unshift(pinned);
  }
  for (const s of byId.values()) {
    if (!ordered.some((entry) => entry.vendorId === s.vendorId)) ordered.push(s);
  }

  const options = toVendorOptions(ordered.slice(0, VENDOR_SELECT_FALLBACK_LIMIT));
  return {
    options,
    ensured: ensureId != null ? byId.get(ensureId) : undefined,
  };
}

function toPrOverrides(overrides: PoRecommendationOverrides): PrRecommendationOverrides {
  return {
    budgetLineId: overrides.budgetLineId,
    orgId: overrides.orgId,
    departmentName: overrides.departmentName,
    deliveryLocationId: overrides.deliveryLocationId,
    currency: overrides.currency,
    needByDate: overrides.needByDate,
    // Pin buyer to nothing — we strip buyer after; do not pass buyerId
  };
}

function mapPendingChoice(
  field: NonNullable<PoRecommendationSpec["pendingChoice"]>["field"] | string | undefined,
  prompt: string,
  options: PoRecommendationChoice["options"],
): PoRecommendationChoice | undefined {
  if (!field) return undefined;
  const allowed: PoRecommendationChoice["field"][] = [
    "budget",
    "department",
    "deliveryLocation",
    "needByDate",
    "vendor",
    "paymentTerms",
  ];
  if (!allowed.includes(field as PoRecommendationChoice["field"])) return undefined;
  return { field: field as PoRecommendationChoice["field"], prompt, options };
}

export async function recommendPurchaseOrder(
  input: PoRecommendationInput,
  deps: PoRecommendationDeps,
): Promise<PoRecommendationSpec> {
  const overrides = input.overrides ?? {};
  const prSpec = await recommendRequisition(
    {
      request: input.request,
      sessionUser: input.sessionUser,
      overrides: toPrOverrides(overrides),
    },
    deps.pr,
  );

  const decisionLog = [...prSpec.decisionLog];
  const unresolved = prSpec.unresolved.filter((f) => f !== "buyer");

  // Requestor is always the logged-in user (Buyer is not shown on Direct PO).
  const requestor = {
    value: { id: String(input.sessionUser.id), label: input.sessionUser.name },
    source: "user_profile" as const,
    rationale: "The currently logged-in user.",
  };

  // Soft-default need-by to +14 days when PR engine left it unresolved.
  let needByDate: PoRecommendedValue<string> = {
    value: prSpec.needByDate.value,
    source: (prSpec.needByDate.source as PoRecommendedValue<string>["source"]) || "none",
    rationale: prSpec.needByDate.rationale,
    sampleSize: prSpec.needByDate.sampleSize,
    options: prSpec.needByDate.options,
  };
  if (!needByDate.value) {
    const fallback = toIsoDate(addDays(deps.pr.clock.now(), 14));
    needByDate = {
      value: fallback,
      source: "default",
      rationale: "No historical lead time available — defaulted to 14 days from today.",
    };
    const idx = unresolved.indexOf("needByDate");
    if (idx >= 0) unresolved.splice(idx, 1);
    decisionLog.push({ stage: "needByDate", outcome: "default_14_days", detail: fallback });
  }

  // ---- Vendor ----
  let vendor: PoRecommendedValue<PrRecommendedIdLabel>;
  const termsList = await deps.paymentTerms.listActive();
  // Pass category/item keys from PR line enrichment so SOS matching can score vendors.
  const vendorSuggestLines: PoVendorSuggestLine[] =
    prSpec.lineItems.length > 0
      ? prSpec.lineItems.map((i) => ({
          description: i.description || input.request,
          itemId: i.itemId ?? i.itemCode ?? null,
          categoryCode: i.categoryCode ?? null,
          categoryName: i.categoryName ?? null,
          qty: i.quantity,
        }))
      : [{ description: input.request, qty: null }];

  if (overrides.supplierId != null) {
    const suggestions = await deps.vendors.suggest({
      request: input.request,
      lineItems: vendorSuggestLines,
      deliveryLocation: prSpec.deliveryLocation.value?.label ?? null,
    });
    const { options, ensured } = await vendorSelectOptions(deps, suggestions, overrides.supplierId);
    const match = ensured ?? suggestions.find((s) => s.vendorId === overrides.supplierId);
    vendor = {
      value: {
        id: String(overrides.supplierId),
        label: match?.vendorName ?? String(overrides.supplierId),
      },
      source: "override",
      rationale: "Selected by you.",
      options,
    };
    decisionLog.push({ stage: "vendor", outcome: "override", detail: String(overrides.supplierId) });
  } else {
    const suggestions = await deps.vendors.suggest({
      request: input.request,
      lineItems: vendorSuggestLines,
      deliveryLocation: prSpec.deliveryLocation.value?.label ?? null,
    });
    if (suggestions.length > 0) {
      const top = suggestions[0];
      const { options } = await vendorSelectOptions(deps, suggestions);
      vendor = {
        value: { id: String(top.vendorId), label: top.vendorName },
        source: "ai",
        rationale: top.reason || `Best vendor match for "${input.request}".`,
        options,
      };
      decisionLog.push({ stage: "vendor", outcome: "ai", detail: top.vendorName });
    } else {
      const { options } = await vendorSelectOptions(deps, []);
      vendor = {
        value: null,
        source: "none",
        rationale:
          options.length > 0
            ? "No vendor recommendation available — please select a supplier."
            : "No approved suppliers found — add a supplier before creating this PO.",
        options,
      };
      unresolved.push("vendor");
      decisionLog.push({
        stage: "vendor",
        outcome: options.length > 0 ? "unresolved_with_fallback" : "unresolved",
      });
    }
  }

  // ---- Payment terms ----
  let paymentTerms: PoRecommendedValue<PrRecommendedIdLabel>;
  const termOptions = termsList.slice(0, 30).map((t) => ({
    id: t.paymentTermsId,
    label: t.paymentTermsName,
  }));

  if (overrides.paymentTermsId) {
    const match =
      termsList.find((t) => t.paymentTermsId === overrides.paymentTermsId) ||
      termsList.find((t) => t.paymentTermsName === overrides.paymentTermsId);
    paymentTerms = {
      value: {
        id: match?.paymentTermsId ?? overrides.paymentTermsId,
        label: match?.paymentTermsName ?? overrides.paymentTermsId,
      },
      source: "override",
      rationale: "Selected by you.",
      options: termOptions,
    };
    decisionLog.push({ stage: "paymentTerms", outcome: "override", detail: overrides.paymentTermsId });
  } else {
    const def = await deps.paymentTerms.getDefault();
    if (def) {
      paymentTerms = {
        value: { id: def.paymentTermsId, label: def.paymentTermsName },
        source: "default",
        rationale: "Admin Payment Settings default.",
        options: termOptions,
      };
      decisionLog.push({ stage: "paymentTerms", outcome: "default", detail: def.paymentTermsName });
    } else if (termsList.length === 1) {
      const only = termsList[0];
      paymentTerms = {
        value: { id: only.paymentTermsId, label: only.paymentTermsName },
        source: "single_option",
        rationale: "Only active payment term available.",
        options: termOptions,
      };
      decisionLog.push({ stage: "paymentTerms", outcome: "single_option", detail: only.paymentTermsName });
    } else if (termsList.length > 0) {
      paymentTerms = {
        value: null,
        source: "none",
        rationale: "No payment-terms default configured — please choose one.",
        options: termOptions,
      };
      unresolved.push("paymentTerms");
      decisionLog.push({ stage: "paymentTerms", outcome: "unresolved" });
    } else {
      paymentTerms = {
        value: null,
        source: "none",
        rationale: "No payment terms found in the system.",
        options: [],
      };
      unresolved.push("paymentTerms");
      decisionLog.push({ stage: "paymentTerms", outcome: "none" });
    }
  }

  let pendingChoice: PoRecommendationChoice | undefined;
  if (prSpec.pendingChoice && prSpec.pendingChoice.field !== "needByDate") {
    pendingChoice = mapPendingChoice(
      prSpec.pendingChoice.field,
      prSpec.pendingChoice.prompt,
      prSpec.pendingChoice.options,
    );
  } else if (
    !vendor.value &&
    (vendor.options?.length ?? 0) > 0 &&
    (vendor.options?.length ?? 0) <= VENDOR_CHOICE_BUTTON_LIMIT
  ) {
    // Small lists get amber buttons; larger fallback lists use the Select only.
    pendingChoice = {
      field: "vendor",
      prompt: "No vendor matched this request. Please choose a supplier.",
      options: vendor.options ?? [],
    };
  } else if (!paymentTerms.value && (paymentTerms.options?.length ?? 0) > 0) {
    pendingChoice = {
      field: "paymentTerms",
      prompt: "Please choose payment terms for this purchase order.",
      options: paymentTerms.options ?? [],
    };
  }

  if (prSpec.lineItems.some((item) => !item.itemId || !String(item.description || "").trim())) {
    if (!unresolved.includes("lineItemDescription")) unresolved.push("lineItemDescription");
  }
  if (prSpec.lineItems.some((item) => item.quantity == null)) {
    if (!unresolved.includes("lineItemQuantity")) unresolved.push("lineItemQuantity");
  }

  const canCreate =
    !pendingChoice &&
    unresolved.length === 0 &&
    prSpec.lineItems.length > 0 &&
    prSpec.lineItems.every((item) => item.quantity != null && !!item.itemId && !!item.description?.trim()) &&
    !!vendor.value &&
    !!paymentTerms.value &&
    !!needByDate.value;

  // Full approved-budget list for the PO Select (AI default stays on prSpec.budget.value).
  const budgetOptions = buildBudgetSelectOptions(
    await deps.pr.budgets.listApprovedBudgetLines(),
    prSpec.budget.value,
  );
  const budget: PrRecommendedValue<PrRecommendedBudget> = {
    ...prSpec.budget,
    options: budgetOptions,
  };

  return {
    kind: "po_recommendation",
    request: input.request,
    budget,
    businessEntity: prSpec.businessEntity,
    department: prSpec.department,
    deliveryLocation: prSpec.deliveryLocation,
    currency: prSpec.currency,
    needByDate,
    requestor,
    vendor,
    paymentTerms,
    lineItems: prSpec.lineItems,
    pendingChoice,
    unresolved,
    canCreate,
    decisionLog,
  };
}
