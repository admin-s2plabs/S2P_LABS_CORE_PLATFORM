import type {
  CreateBidPreviewCriterion,
  CreateBidPreviewLineItem,
  PublishBidChecklistItem,
  PublishBidPreviewSpec,
} from "@shared/agent-sourcing-preview";
import {
  formatDateTimeDisplay,
  formatPublishDateTimeLocal,
  PAST_CLOSE_DATE_MESSAGE,
  PAST_OPEN_DATE_MESSAGE,
  resolveDefaultPublishDates,
} from "@shared/publish-bid-dates";
import {
  formatDateTimeInput,
  toLocalISOString,
} from "../bids/bid-form-utils";
import type { RemediationData, RemediationSectionFlags } from "./remediation-review-card";

function firstNonEmpty<T>(...lists: (T[] | undefined | null)[]): T[] {
  for (const list of lists) {
    if (list && list.length > 0) return list;
  }
  return [];
}

function mapPreviewVendors(preview: PublishBidPreviewSpec): RemediationData["vendors"] {
  const normalized = normalizePublishPreview(preview);
  const seen = new Set<string>();
  const vendors: RemediationData["vendors"] = [];
  for (const s of normalized.suppliers) {
    const id = String(s.supplierId ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    vendors.push({ supplierId: s.supplierId, supplierName: s.supplierName });
  }
  for (const s of normalized.suggestedSuppliers) {
    const id = String(s.supplierId ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    vendors.push({ supplierId: s.supplierId, supplierName: s.supplierName });
  }
  return vendors;
}

function lineItemSignature(line: CreateBidPreviewLineItem): string {
  return `${line.itemId ?? ""}|${line.description?.trim() ?? ""}|${line.quantity ?? ""}|${line.unitPrice ?? ""}`;
}

export function previewLineToApiPayload(
  line: CreateBidPreviewLineItem,
  currency?: string,
): Record<string, unknown> {
  return {
    linetype: line.lineType || "Goods",
    description: line.description,
    uom: line.uom || "EA",
    quantity: line.quantity ?? 1,
    currentprice: line.unitPrice ?? 0,
    currency: currency || "INR",
    product_category: line.categoryName || null,
    product_category_id: line.categoryCode ?? null,
    item_id: line.itemId ?? null,
    needbyfrom: line.needByFrom || null,
    needbyto: line.needByTo || null,
  };
}

export function diffNewLineItems(
  original: CreateBidPreviewLineItem[],
  draft: CreateBidPreviewLineItem[],
): CreateBidPreviewLineItem[] {
  const originalSigs = new Set(original.map(lineItemSignature));
  return draft.filter((line) => {
    if (!line.description?.trim()) return false;
    return !originalSigs.has(lineItemSignature(line));
  });
}

function buildLegacyChecklist(preview: PublishBidPreviewSpec): PublishBidChecklistItem[] {
  const items: PublishBidChecklistItem[] = [];
  for (const ready of preview.ready ?? []) {
    items.push({
      id: ready.label,
      label: ready.label,
      ok: true,
      detail: ready.detail,
    });
  }
  for (const gap of preview.manualRequired ?? []) {
    if (!items.some((item) => item.label === gap)) {
      items.push({ id: gap, label: gap, ok: false });
    }
  }
  for (const gap of preview.aiResolvable ?? []) {
    if (!items.some((item) => item.label === gap.gap)) {
      items.push({ id: gap.gap, label: gap.gap, ok: false });
    }
  }
  return items;
}

function resolvePreviewDates(preview: PublishBidPreviewSpec): {
  openDate: string;
  closeDate: string;
  datesRequireUpdate: boolean;
  openDateError?: string;
  closeDateError?: string;
} {
  if (preview.datesRequireUpdate != null) {
    return {
      openDate: formatDateTimeInput(preview.openDate),
      closeDate: formatDateTimeInput(preview.closeDate),
      datesRequireUpdate: preview.datesRequireUpdate,
      openDateError: preview.openDateError,
      closeDateError: preview.closeDateError,
    };
  }

  const resolved = resolveDefaultPublishDates({
    openDate: preview.openDate,
    closeDate: preview.closeDate,
    preservePastDates: true,
  });

  return {
    openDate: formatPublishDateTimeLocal(resolved.openDate),
    closeDate: formatPublishDateTimeLocal(resolved.closeDate),
    datesRequireUpdate: resolved.datesRequireUpdate,
    openDateError: resolved.openDateInPast ? PAST_OPEN_DATE_MESSAGE : undefined,
    closeDateError: resolved.closeDateInPast ? PAST_CLOSE_DATE_MESSAGE : undefined,
  };
}

/** Backfill array fields missing on previews stored before the publish-card redesign. */
export function normalizePublishPreview(preview: PublishBidPreviewSpec): PublishBidPreviewSpec {
  const checklist =
    preview.checklist && preview.checklist.length > 0
      ? preview.checklist
      : buildLegacyChecklist(preview);
  const dates = resolvePreviewDates(preview);

  return {
    ...preview,
    checklist,
    openDate: dates.openDate,
    closeDate: dates.closeDate,
    datesRequireUpdate: dates.datesRequireUpdate,
    openDateError: dates.openDateError,
    closeDateError: dates.closeDateError,
    lineItems: preview.lineItems ?? [],
    suppliers: preview.suppliers ?? [],
    suggestedSuppliers: preview.suggestedSuppliers ?? [],
    evaluationCriteria: preview.evaluationCriteria ?? [],
    evaluators: preview.evaluators ?? [],
    clauses: preview.clauses ?? [],
    ready: preview.ready ?? [],
    aiResolvable: preview.aiResolvable ?? [],
    manualRequired: preview.manualRequired ?? [],
  };
}

export function buildRemediationDataFromPreview(
  preview: PublishBidPreviewSpec,
  fetched?: Partial<RemediationData>,
): RemediationData {
  const normalized = normalizePublishPreview(preview);
  const ai = normalized.aiRecommendations;

  const previewCriteria = normalized.evaluationCriteria.map((c) => ({
    id: c.id,
    category: c.category,
    question: c.question,
    weight: c.weight,
    qvtype: c.qvtype || "Text",
    qvoption: c.qvoption || "Required",
    lov: c.lov,
  }));
  const previewTeam = normalized.evaluators.map((e) => ({
    userId: e.userId,
    userName: e.userName,
    teamType: e.teamType,
  }));
  const previewClauses = normalized.clauses.map((c) => ({
    type: c.type,
    class_desc: c.class_desc,
  }));
  const previewVendors = mapPreviewVendors(normalized);

  const result = {
    bidId: normalized.bidId,
    bidLabel: normalized.bidLabel,
    criteria: firstNonEmpty(ai?.criteria, fetched?.criteria, previewCriteria),
    team: firstNonEmpty(ai?.team, fetched?.team, previewTeam),
    vendors: firstNonEmpty(ai?.vendors, fetched?.vendors, previewVendors),
    clauses: firstNonEmpty(ai?.clauses, fetched?.clauses, previewClauses),
  };

  return result;
}

export function formatPublishDateTimeDisplay(value?: string): string | undefined {
  if (!value) return undefined;
  return formatDateTimeDisplay(value);
}

/** datetime-local inputs are minute-precision, so allow the current minute to count as now. */
const PAST_DATE_GRACE_MS = 60_000;

/** True when a `YYYY-MM-DDTHH:mm` local value is already in the past. */
export function isPastDateTimeLocal(value: string): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now() - PAST_DATE_GRACE_MS;
}

export function validatePublishDateTimes(openDate: string, closeDate: string): string | null {
  if (!openDate) return "Bid open date & time is required.";
  if (!closeDate) return "Bid close date & time is required.";
  if (isPastDateTimeLocal(openDate)) return PAST_OPEN_DATE_MESSAGE;
  if (isPastDateTimeLocal(closeDate)) return PAST_CLOSE_DATE_MESSAGE;
  if (new Date(openDate) > new Date(closeDate)) return "Open date cannot be after close date.";
  return null;
}

function criterionWasModified(
  draft: { id?: number; category?: string; question?: string; weight?: number },
  original?: CreateBidPreviewCriterion,
): boolean {
  if (!original) return true;
  const draftWeight = draft.weight != null ? Number(draft.weight) : undefined;
  const origWeight = original.weight != null ? Number(original.weight) : undefined;
  return (
    draft.category !== original.category ||
    draft.question !== original.question ||
    draftWeight !== origWeight
  );
}

/** Only criteria that are new or were edited — avoids re-inserting existing requirements on save. */
export function diffCriteriaForApply(
  original: CreateBidPreviewCriterion[],
  draft: RemediationData["criteria"],
): RemediationData["criteria"] {
  const originalById = new Map(
    original.filter((c) => c.id != null).map((c) => [Number(c.id), c]),
  );
  return draft.filter((c, i) => {
    if (c.id != null) {
      const orig = originalById.get(Number(c.id));
      return orig ? criterionWasModified(c, orig) : true;
    }
    return criterionWasModified(c, original[i]);
  });
}

function totalCriteriaWeight(criteria: Array<{ weight?: number }>): number {
  return criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
}

export function buildApplyPayload(
  preview: PublishBidPreviewSpec,
  data: RemediationData,
  dates: { openDate?: string; closeDate?: string },
  lineItemsDraft?: CreateBidPreviewLineItem[],
  sectionFlags?: RemediationSectionFlags,
): RemediationData & { openDate?: string; closeDate?: string; replaceCriteria?: boolean } {
  const normalized = normalizePublishPreview(preview);
  const gaps = sectionFlags ?? remediationSectionFlagsFromPreview(normalized);
  const payload: RemediationData & {
    openDate?: string;
    closeDate?: string;
    replaceCriteria?: boolean;
  } = {
    bidId: normalized.bidId,
    bidLabel: normalized.bidLabel,
    criteria: [],
    team: [],
    vendors: [],
    clauses: [],
  };

  const previewOpen = formatDateTimeInput(normalized.openDate);
  const previewClose = formatDateTimeInput(normalized.closeDate);

  const mustApplyDates = normalized.datesRequireUpdate === true;
  if (dates.openDate && (mustApplyDates || dates.openDate !== previewOpen)) {
    payload.openDate = toLocalISOString(dates.openDate);
  }
  if (dates.closeDate && (mustApplyDates || dates.closeDate !== previewClose)) {
    payload.closeDate = toLocalISOString(dates.closeDate);
  }

  if (gaps.vendors && data.vendors?.length) payload.vendors = data.vendors;
  if (gaps.criteria && data.criteria?.length) {
    const changedCriteria = diffCriteriaForApply(normalized.evaluationCriteria, data.criteria);
    const criteriaGap = normalized.checklist.some((c) => c.id === "criteria" && !c.ok);
    const weightageGap = normalized.checklist.some((c) => c.id === "weightage" && !c.ok);
    const draftWeight = totalCriteriaWeight(data.criteria);
    const shouldApply =
      changedCriteria.length > 0 ||
      criteriaGap ||
      (weightageGap && draftWeight === 100);
    if (shouldApply) {
      payload.criteria = data.criteria;
      payload.replaceCriteria = true;
    }
  }
  if (gaps.team && data.team?.length) payload.team = data.team;
  if (gaps.clauses && data.clauses?.length) payload.clauses = data.clauses;

  const newLineItems = normalized.prNumber
    ? []
    : diffNewLineItems(normalized.lineItems, lineItemsDraft ?? []);
  if (newLineItems.length > 0) payload.lineItems = newLineItems;

  return payload;
}

export function remediationFlagsFromPreview(preview: PublishBidPreviewSpec) {
  const normalized = normalizePublishPreview(preview);
  const gaps = [
    ...normalized.aiResolvable.map((g) => g.gap),
    ...normalized.manualRequired,
    ...normalized.checklist.filter((c) => !c.ok).map((c) => c.label),
  ];
  return {
    resolveCriteria: gaps.some((f) => /evaluation criteria|weightage/i.test(f)),
    resolveTeam: gaps.some((f) => /review team|approver assigned|Committee team/i.test(f)),
    resolveVendors: gaps.some((f) => /suppliers|vendors invited/i.test(f)),
    resolveClauses: gaps.some((f) => /terms and instructions/i.test(f)),
  };
}

export function remediationSectionFlagsFromPreview(
  preview: PublishBidPreviewSpec,
): RemediationSectionFlags {
  const flags = remediationFlagsFromPreview(preview);
  return {
    criteria: flags.resolveCriteria,
    team: flags.resolveTeam,
    vendors: flags.resolveVendors,
    clauses: flags.resolveClauses,
  };
}
