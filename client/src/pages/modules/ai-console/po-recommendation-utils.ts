import type { PoRecommendationOverrides, PoRecommendationSpec } from "@shared/agent-po-recommendation";
import { buildPoCreatePayload, specToPoOverrides } from "@shared/agent-po-recommendation";
import { parseNeedByDate, type ParsedPoChatOverrides } from "@shared/po-chat-overrides";

export { buildPoCreatePayload };

/** Short human label for where a recommended value came from. */
export function poSourceLabel(source: string): string {
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
    case "default":
      return "default";
    case "override":
      return "edited";
    default:
      return "not set";
  }
}

export function isWeakPoSource(source: string): boolean {
  return source === "alphabetical" || source === "default" || source === "none";
}

export type PoCreatePayload = ReturnType<typeof buildPoCreatePayload>;

export function mergePoChatOverrides(
  spec: PoRecommendationSpec,
  parsed: ParsedPoChatOverrides,
  resolvedSupplierId?: number | null,
): PoRecommendationOverrides {
  const next = specToPoOverrides(spec);
  if (resolvedSupplierId != null && Number.isFinite(resolvedSupplierId)) {
    next.supplierId = resolvedSupplierId;
  }
  if (parsed.needByDateRaw) {
    const iso = parseNeedByDate(parsed.needByDateRaw);
    if (iso) next.needByDate = iso;
  }
  return next;
}

/** Match a typed vendor name against options already on the open PO card. */
export function resolveVendorIdFromSpec(
  spec: PoRecommendationSpec,
  supplierName: string,
): number | null {
  const needle = supplierName.trim().toLowerCase();
  if (!needle) return null;
  const candidates = [
    ...(spec.vendor.options ?? []),
    ...(spec.vendor.value
      ? [{ id: spec.vendor.value.id, label: spec.vendor.value.label }]
      : []),
  ];
  const exact = candidates.filter((row) => row.label.toLowerCase() === needle);
  const partial = candidates.filter((row) => row.label.toLowerCase().includes(needle));
  const picked = exact[0] ?? (partial.length === 1 ? partial[0] : undefined);
  if (picked?.id == null) return null;
  const id = Number(picked.id);
  return Number.isFinite(id) ? id : null;
}

/** Patch vendor / date / qty on the existing spec when a full re-recommend is unavailable. */
export function applyPoChatEditLocally(
  spec: PoRecommendationSpec,
  parsed: ParsedPoChatOverrides,
  resolvedSupplierId?: number | null,
): PoRecommendationSpec {
  let next: PoRecommendationSpec = {
    ...spec,
    lineItems: spec.lineItems.map((item) => ({ ...item })),
  };
  if (parsed.quantity != null && next.lineItems.length > 0) {
    next = {
      ...next,
      lineItems: next.lineItems.map((item, index) =>
        index === 0 ? { ...item, quantity: parsed.quantity!, quantityPredicted: false } : item,
      ),
    };
  }
  if (parsed.needByDateRaw) {
    const iso = parseNeedByDate(parsed.needByDateRaw);
    if (iso) {
      next = {
        ...next,
        needByDate: {
          ...next.needByDate,
          value: iso,
          source: "override",
          rationale: "edited in chat",
        },
      };
    }
  }
  if (resolvedSupplierId != null && Number.isFinite(resolvedSupplierId)) {
    const options = next.vendor.options ?? [];
    const existing = options.find((row) => Number(row.id) === resolvedSupplierId);
    const label =
      existing?.label || parsed.supplierName || next.vendor.value?.label || String(resolvedSupplierId);
    next = {
      ...next,
      vendor: {
        ...next.vendor,
        value: { id: String(resolvedSupplierId), label },
        source: "override",
        rationale: "edited in chat",
        options: existing
          ? options
          : [{ id: String(resolvedSupplierId), label }, ...options],
      },
    };
  }
  return next;
}
