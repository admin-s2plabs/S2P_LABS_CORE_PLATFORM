import type { PrRecommendationSpec } from "@shared/agent-pr-recommendation";

/**
 * Flattens the (possibly edited) recommendation into the confirm payload the
 * agent's execute tool expects. Mirrors buildCreatePayloadFromSpec on the
 * server, which builds the same shape for the un-edited case.
 */
export function buildPrCreatePayload(spec: PrRecommendationSpec) {
  return {
    description: spec.request,
    budgetLineId: spec.budget.value?.budgetLineId ?? null,
    orgId: spec.businessEntity.value ? Number(spec.businessEntity.value.id) : null,
    departmentId: spec.department.value?.id ?? null,
    deliveryLocationId: spec.deliveryLocation.value?.id ?? null,
    currency: spec.currency.value,
    needByDate: spec.needByDate.value,
    buyerId: spec.buyer.value ? Number(spec.buyer.value.id) : null,
    buyerName: spec.buyer.value?.label ?? null,
    lineItems: spec.lineItems,
  };
}

/** Short human label for where a recommended value came from. */
export function sourceLabel(source: string): string {
  switch (source) {
    case "budget":
      return "from budget";
    case "single_option":
      return "only option";
    case "user_profile":
      return "your profile";
    case "po_history":
      return "PO history";
    case "ai":
      return "AI estimate";
    case "entity_default":
      return "entity default";
    case "alphabetical":
      return "default";
    case "needs_selection":
      return "choose one";
    // Retired source, still present on recommendations stored in older chats.
    case "random_pool":
      return "active buyer pool";
    case "override":
      return "edited";
    default:
      return "not set";
  }
}

/** Sources that deserve visual emphasis because the engine had little to go on. */
export function isWeakSource(source: string): boolean {
  return (
    source === "alphabetical" ||
    source === "random_pool" ||
    source === "needs_selection" ||
    source === "none"
  );
}

/** Sources that mean the card is waiting on the user rather than reporting a result. */
export function needsUserChoice(source: string): boolean {
  return source === "needs_selection" || source === "none";
}
