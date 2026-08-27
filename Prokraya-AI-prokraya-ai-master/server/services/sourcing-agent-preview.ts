import type {
  AgentSourcingPreviewSpec,
  CreateBidPreviewClause,
  CreateBidPreviewCriterion,
  CreateBidPreviewEvaluator,
  CreateBidPreviewLineItem,
  CreateBidPreviewSpec,
  CreateBidPreviewSupplier,
  CreateBidSuccessSpec,
  PublishBidAiGap,
  PublishBidChecklistItem,
  PublishBidPreviewSpec,
  PublishBidReadyItem,
  PublishBidSuccessSpec,
} from "@shared/agent-sourcing-preview";
import { bidTypeSupportsEvaluation } from "@shared/agent-sourcing-preview";
import * as bidService from "../modules/bids/bids.service";
import * as bidAI from "./bid-ai-service";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  formatDateTimeDisplay,
  formatPublishDateTimeLocal,
  PAST_CLOSE_DATE_MESSAGE,
  PAST_OPEN_DATE_MESSAGE,
  resolveDefaultEnvelopeOpenDate,
  resolveDefaultPublishDates,
} from "@shared/publish-bid-dates";

export interface PendingActionLike {
  type: string;
  data: any;
  summary: string;
}

export interface PublishValidationResult {
  bidId: number;
  bidLabel: string;
  detail: any;
  bidType: string;
  lines: any[];
  suppliers: any[];
  requirements: any[];
  approvers: any[];
  failures: string[];
}

function hasBusinessEntity(detail: any): boolean {
  return !!(detail?.operating_unit || detail?.org_id || detail?.attribute_15);
}

async function resolveBusinessEntityLabel(detail: any): Promise<string | undefined> {
  if (detail?.attribute_15) return String(detail.attribute_15);
  if (detail?.operating_unit) return String(detail.operating_unit);
  if (!detail?.org_id) return undefined;
  try {
    const { getOrganizations } = await import("../modules/administration/administration.service");
    const orgs = (await getOrganizations()) as { id: number; organization_name: string }[];
    const found = orgs.find((o) => String(o.id) === String(detail.org_id));
    if (found?.organization_name) return found.organization_name;
  } catch {
    // fall through
  }
  return String(detail.org_id);
}

function businessEntityDisplayLabel(detail: any): string | undefined {
  return detail?._businessEntityLabel || detail?.attribute_15 || detail?.operating_unit || undefined;
}

const MANUAL_FAILURE_PATTERNS: RegExp[] = [
  /title is missing/i,
  /requestor/i,
  /buyer/i,
  /currency/i,
  /business entity/i,
  /Bid open date/i,
  /Bid close date/i,
  /Envelope open date/i,
  /No bid lines/i,
  /weightage is \d+/i,
  /Approval workflow/i,
];

function teamRoleLabel(teamType?: string): string | undefined {
  if (!teamType) return undefined;
  if (/technical/i.test(teamType)) return "Tech";
  if (/commercial/i.test(teamType)) return "Commercial";
  if (/committee/i.test(teamType)) return "Committee";
  if (/approve/i.test(teamType)) return "Approver";
  return teamType.replace(/ Team$/i, "");
}

function aggregateCriteriaByCategory(
  criteria: Array<{ category?: string; question: string; weight?: number }>,
): CreateBidPreviewSpec["evaluationCriteria"] {
  if (criteria.length === 0) return [];
  const byCategory = new Map<string, number>();
  for (const c of criteria) {
    const cat = c.category || "General";
    byCategory.set(cat, (byCategory.get(cat) || 0) + (Number(c.weight) || 0));
  }
  return Array.from(byCategory.entries()).map(([category, weight]) => ({
    category,
    question: category,
    weight,
  }));
}

export function buildCreateBidPreviewSpec(
  createAction: PendingActionLike,
  expandedActions: PendingActionLike[] = [],
): CreateBidPreviewSpec {
  const data = createAction.data || {};
  const source = createAction.type === "create_bid_from_pr" ? "create_bid_from_pr" : "create_bid";

  const lineItems = (
    (data._queuedLines || data._previewLines || []) as any[]
  ).map((line) => ({
    description: String(line.description || ""),
    quantity: line.quantity != null ? Number(line.quantity) : undefined,
    unitPrice: line.unitPrice != null ? Number(line.unitPrice) : undefined,
    uom: line.uom ? String(line.uom) : undefined,
    itemId: line.itemId ? String(line.itemId) : undefined,
  }));

  const suppliers = ((data._queuedVendors || []) as any[]).map((v) => ({
    supplierId: v.supplierId,
    supplierName: String(v.supplierName || v.companyName || "Supplier"),
  }));

  const lineFromExpanded = expandedActions
    .filter((a) => a.type === "add_bid_line" && !a.data?.bidId)
    .map((line) => ({
      description: String(line.data?.description || ""),
      quantity: line.data?.quantity != null ? Number(line.data.quantity) : undefined,
      unitPrice: line.data?.unitPrice != null ? Number(line.data.unitPrice) : undefined,
      uom: line.data?.uom ? String(line.data.uom) : undefined,
      itemId: line.data?.itemId ? String(line.data.itemId) : undefined,
    }));
  const resolvedLineItems = lineFromExpanded.length > 0 ? lineFromExpanded : lineItems;

  const supplierFromExpanded = expandedActions
    .filter((a) => a.type === "add_bid_vendor" && !a.data?.bidId)
    .map((v) => ({
      supplierId: v.data?.supplierId,
      supplierName: String(v.data?.supplierName || v.data?.companyName || "Supplier"),
    }));
  const resolvedSuppliers = supplierFromExpanded.length > 0 ? supplierFromExpanded : suppliers;

  const criteriaFromExpanded = expandedActions
    .filter((a) => a.type === "add_bid_requirement" && !a.data?.bidId)
    .map((r) => ({
      category: r.data?.category ? String(r.data.category) : undefined,
      question: String(r.data?.question || ""),
      weight: r.data?.weight != null ? Number(r.data.weight) : undefined,
    }));
  const queuedCriteria = ((data._queuedRequirements || []) as any[]).map((r) => ({
    category: r.category ? String(r.category) : undefined,
    question: String(r.question || ""),
    weight: r.weight != null ? Number(r.weight) : undefined,
  }));
  // RFQs are priced, not scored — never surface criteria/evaluators for them.
  const supportsEvaluation = bidTypeSupportsEvaluation(data.bidType);
  const evaluationCriteria = !supportsEvaluation
    ? []
    : criteriaFromExpanded.length > 0
      ? criteriaFromExpanded
      : queuedCriteria.length > 0
        ? queuedCriteria
        : aggregateCriteriaByCategory(queuedCriteria);

  const evaluatorsFromQueue = !supportsEvaluation
    ? []
    : expandedActions
        .filter((a) => a.type === "add_bid_team_member" && !a.data?.bidId)
        .map((a) => ({
          userId: a.data?.userId,
          userName: String(a.data?.userName || a.data?.name || "Team member"),
          teamType: a.data?.teamType ? String(a.data.teamType) : undefined,
          roleLabel: teamRoleLabel(a.data?.teamType),
        }));

  const clauseFromExpanded = expandedActions
    .filter((a) => a.type === "add_bid_clause" && !a.data?.bidId)
    .map((c) => ({
      type: c.data?.type || "terms",
      class_desc: String(c.data?.class_desc || ""),
    }));
  const clauses = ((data._queuedClauses || []) as any[]).map((c) => ({
    type: c.type || "terms",
    class_desc: String(c.class_desc || ""),
  }));
  const resolvedClauses = clauseFromExpanded.length > 0 ? clauseFromExpanded : clauses;

  const queuedCount =
    (source === "create_bid_from_pr" ? 0 : resolvedLineItems.length) +
    resolvedSuppliers.length +
    evaluationCriteria.length +
    resolvedClauses.length +
    evaluatorsFromQueue.length;

  return {
    kind: "create_bid_preview",
    source,
    title: String(data.title || data.prDescription || "New Bid"),
    bidType: String(data.bidType || "RFQ"),
    orgId: data.orgId ?? undefined,
    businessEntity: data.orgName ? String(data.orgName) : undefined,
    buyerId: data.buyerId ?? undefined,
    buyer: data.buyerName ? String(data.buyerName) : undefined,
    requestorId: data.requestorId ?? undefined,
    requestor: data.requestorName ? String(data.requestorName) : undefined,
    currency: data.currency ? String(data.currency) : undefined,
    openDate: data.openDate ? String(data.openDate) : undefined,
    closeDate: data.closingDate ? String(data.closingDate) : undefined,
    department: data.department ? String(data.department) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
    paymentTermsId: data.paymentTermsId ? String(data.paymentTermsId) : undefined,
    paymentTerms: data.paymentTerms ? String(data.paymentTerms) : undefined,
    deliveryLocationId: data.deliveryLocationId ? String(data.deliveryLocationId) : undefined,
    deliveryLocationName: data.deliveryLocationName ? String(data.deliveryLocationName) : undefined,
    envOpenDate: data.envOpenDate ? String(data.envOpenDate) : undefined,
    bidStyle: data.bidStyle ? String(data.bidStyle) : undefined,
    prNumber: data.prNumber ? String(data.prNumber) : undefined,
    prDescription: data.prDescription ? String(data.prDescription) : undefined,
    prAmount: data.prAmount ? String(data.prAmount) : undefined,
    lineItems: resolvedLineItems,
    suppliers: resolvedSuppliers,
    evaluationCriteria,
    evaluators: evaluatorsFromQueue,
    clauses: resolvedClauses,
    queuedActionCount: queuedCount,
  };
}

function expandQueuedChildActionsForPreview(queue: PendingActionLike[]): PendingActionLike[] {
  const expanded: PendingActionLike[] = [];
  // A staged queue sent back by the client already carries flattened add_bid_line actions while
  // the create action re-queues the same lines, so de-dupe to match the execution queue.
  const seenLineKeys = new Set<string>();
  const pushLine = (action: PendingActionLike) => {
    const key = `${action.data?.description || ""}:${action.data?.quantity || ""}`;
    if (seenLineKeys.has(key)) return;
    seenLineKeys.add(key);
    expanded.push(action);
  };
  for (const action of queue) {
    if (action.type === "create_bid" || action.type === "create_bid_from_pr") {
      expanded.push(action);
      for (const line of (action.data._queuedLines || []) as any[]) {
        pushLine({
          type: "add_bid_line",
          data: line,
          summary: line._summary || "",
        });
      }
    } else if (action.type === "add_bid_line") {
      pushLine(action);
    } else {
      expanded.push(action);
    }
  }
  return expanded;
}

export function buildActionPreviewFromPendingQueue(
  queue: PendingActionLike[],
): AgentSourcingPreviewSpec | undefined {
  const createAction = queue.find(
    (a) => a.type === "create_bid" || a.type === "create_bid_from_pr",
  );
  if (createAction) {
    const expanded = expandQueuedChildActionsForPreview(queue);
    return buildCreateBidPreviewSpec(createAction, expanded);
  }

  const publishPreview = queue.find((a) => a.type === "publish_bid_preview");
  if (publishPreview?.data?.preview) {
    return publishPreview.data.preview as PublishBidPreviewSpec;
  }

  const publishReady = queue.find((a) => a.type === "publish_bid");
  if (publishReady?.data?.preview) {
    return publishReady.data.preview as PublishBidPreviewSpec;
  }

  return undefined;
}

export function isSuccessfulToolResult(result: string): boolean {
  const text = String(result || "").trim();
  if (!text) return false;
  if (/^Error executing/i.test(text)) return false;
  if (/^Please confirm/i.test(text)) return false;
  if (/^No bid found/i.test(text)) return false;
  return true;
}

export function buildCreateBidSuccessFromActions(
  actions: PendingActionLike[],
  executed: Array<{ action: PendingActionLike; result: string }>,
  bidId: number,
  bidNumber: string,
): CreateBidSuccessSpec | undefined {
  const createAction = actions.find(
    (a) => a.type === "create_bid" || a.type === "create_bid_from_pr",
  );
  if (!createAction) return undefined;

  const createExecuted = executed.find((e) => e.action.type === createAction.type);
  if (!createExecuted || !isSuccessfulToolResult(createExecuted.result)) return undefined;

  const data = createAction.data || {};
  const source = createAction.type === "create_bid_from_pr" ? "create_bid_from_pr" : "create_bid";

  const lineItems: CreateBidSuccessSpec["lineItems"] = [];
  const suppliers: CreateBidSuccessSpec["suppliers"] = [];
  const evaluationCriteria: CreateBidSuccessSpec["evaluationCriteria"] = [];
  const evaluators: CreateBidSuccessSpec["evaluators"] = [];
  const clauses: CreateBidSuccessSpec["clauses"] = [];

  for (const { action, result } of executed) {
    if (!isSuccessfulToolResult(result)) continue;
    const d = action.data || {};
    switch (action.type) {
      case "add_bid_line":
        lineItems.push({
          description: String(d.description || ""),
          quantity: d.quantity != null ? Number(d.quantity) : undefined,
          unitPrice: d.unitPrice != null ? Number(d.unitPrice) : undefined,
          uom: d.uom ? String(d.uom) : undefined,
        });
        break;
      case "add_bid_vendor":
        suppliers.push({
          supplierId: d.supplierId,
          supplierName: String(d.supplierName || d.companyName || "Supplier"),
        });
        break;
      case "add_bid_requirement":
        evaluationCriteria.push({
          category: d.category ? String(d.category) : undefined,
          question: String(d.question || d.category || ""),
          weight: d.weight != null ? Number(d.weight) : undefined,
        });
        break;
      case "add_bid_team_member":
        evaluators.push({
          userId: d.userId,
          userName: String(d.userName || d.name || "Team member"),
          teamType: d.teamType ? String(d.teamType) : undefined,
          roleLabel: teamRoleLabel(d.teamType),
        });
        break;
      case "add_bid_clause":
        clauses.push({
          type: d.type || "terms",
          class_desc: String(d.class_desc || ""),
        });
        break;
      default:
        break;
    }
  }

  return {
    kind: "create_bid_success",
    source,
    bidId,
    bidNumber,
    title: String(data.title || data.prDescription || bidNumber),
    bidType: String(data.bidType || "RFQ"),
    businessEntity: data.orgName ? String(data.orgName) : undefined,
    buyer: data.buyerName ? String(data.buyerName) : undefined,
    requestor: data.requestorName ? String(data.requestorName) : undefined,
    currency: data.currency ? String(data.currency) : undefined,
    openDate: data.openDate ? String(data.openDate) : undefined,
    closeDate: data.closingDate ? String(data.closingDate) : undefined,
    envOpenDate: data.envOpenDate ? String(data.envOpenDate) : undefined,
    department: data.department ? String(data.department) : undefined,
    paymentTerms: data.paymentTerms ? String(data.paymentTerms) : undefined,
    deliveryLocationName: data.deliveryLocationName ? String(data.deliveryLocationName) : undefined,
    prNumber: data.prNumber ? String(data.prNumber) : undefined,
    status: "Draft",
    lineItems,
    suppliers,
    evaluationCriteria,
    evaluators,
    clauses,
  };
}

export function classifyPublishFailure(failure: string): "manual" | "ai" {
  if (MANUAL_FAILURE_PATTERNS.some((re) => re.test(failure))) return "manual";
  return "ai";
}

export function mapFailureToAiGap(failure: string): PublishBidAiGap | null {
  if (classifyPublishFailure(failure) !== "ai") return null;
  if (/evaluation criteria/i.test(failure)) {
    return { gap: failure, resolutionLabel: "Generate Evaluation Criteria" };
  }
  if (/review team|approver assigned|Committee team/i.test(failure)) {
    return { gap: failure, resolutionLabel: "Suggest Evaluation Team" };
  }
  if (/suppliers\/vendors invited/i.test(failure)) {
    return { gap: failure, resolutionLabel: "Smart Vendor Suggestion" };
  }
  if (/terms and instructions/i.test(failure)) {
    return { gap: failure, resolutionLabel: "Generate Terms & Instructions" };
  }
  return { gap: failure, resolutionLabel: "AI-assisted resolution" };
}

export async function runPublishBidValidation(
  bidId: number,
): Promise<PublishValidationResult | { error: string }> {
  const detail = (await bidService.getDboBidDetail(bidId)) as any;
  if (!detail) return { error: `No bid found with ID ${bidId}.` };

  detail._businessEntityLabel = await resolveBusinessEntityLabel(detail);

  const bidLabel = detail.attribute_4 || String(bidId);
  const bidType: string = (detail.type || "").trim();
  const failures: string[] = [];
  const now = new Date();

  if (!detail.bid_title) failures.push("Bid title is missing");
  if (!detail.requestor) failures.push("No requestor assigned");
  if (!detail.buyer) failures.push("No buyer assigned");
  if (!detail.currency) failures.push("Currency is not set");
  if (!hasBusinessEntity(detail)) failures.push("Business entity is not set");

  if (!detail.startdate) {
    failures.push("Bid open date is not set");
  } else {
    const openDate = new Date(detail.startdate);
    if (!isNaN(openDate.getTime()) && openDate < now) {
      failures.push("Bid open date is in the past");
    }
  }

  if (!detail.enddate) {
    failures.push("Bid close date is not set");
  } else {
    const closeDate = new Date(detail.enddate);
    if (!isNaN(closeDate.getTime()) && closeDate < now) {
      failures.push("Bid close date is in the past");
    }
  }

  if (bidType === "Tender") {
    if (!detail.env_open_date) {
      failures.push("Envelope open date is not set");
    } else if (detail.enddate) {
      const envOpen = new Date(detail.env_open_date);
      const closeDate = new Date(detail.enddate);
      if (
        !isNaN(envOpen.getTime()) &&
        !isNaN(closeDate.getTime()) &&
        envOpen <= closeDate
      ) {
        failures.push("Envelope open date must be after bid close date");
      }
    }
  }

  const [lines, suppliers] = (await Promise.all([
    bidService.getDboBidLines(bidId),
    bidService.getDboBidSuppliers(bidId),
  ])) as [any[], any[]];

  if (!lines?.length) failures.push("No bid lines added");
  if (!suppliers?.length) failures.push("No suppliers/vendors invited");

  let requirements: any[] = [];
  let approvers: any[] = [];

  if (bidType === "RFP" || bidType === "Tender") {
    [requirements, approvers] = (await Promise.all([
      bidService.getDboBidRequirements(bidId),
      bidService.getDboBidApprovers(bidId),
    ])) as [any[], any[]];

    if (!requirements?.length) {
      failures.push("No evaluation criteria defined");
    } else {
      const totalWeightage = requirements.reduce((sum: number, r: any) => {
        const w = parseInt(r.weight || "0", 10);
        return sum + (isNaN(w) ? 0 : w);
      }, 0);
      if (totalWeightage !== 100) {
        failures.push(`Evaluation weightage is ${totalWeightage} — must equal exactly 100`);
      }
    }

    let hasTechReview = false;
    let hasCommReview = false;
    let hasTechApprove = false;
    let hasCommApprove = false;
    let committeeCount = 0;

    for (const a of approvers || []) {
      const tt: string = (a as any).teamtype || "";
      if (tt === "Technical Review Team" || tt.includes("Techno")) hasTechReview = true;
      if (tt === "Commercial Review Team" || tt.includes("Techno")) hasCommReview = true;
      if ((tt === "Technical Approve Team" || tt.includes("Techno")) && bidType !== "RFP") {
        hasTechApprove = true;
      }
      if ((tt === "Commercial Approve Team" || tt.includes("Techno")) && bidType !== "RFP") {
        hasCommApprove = true;
      }
      if (tt === "Committee Team") committeeCount++;
    }

    if (!hasTechReview) failures.push("No technical review team assigned");

    if (bidType === "Tender") {
      if (!hasCommReview) failures.push("No commercial review team assigned");
      if (!hasTechApprove) failures.push("No technical approver assigned");
      if (!hasCommApprove) failures.push("No commercial approver assigned");
      if (committeeCount < 3) {
        failures.push(`Committee team requires at least 3 members (currently ${committeeCount})`);
      }

      const { workflowService } = await import("./workflowService");
      const wfParams = {
        subject: `Bid Publish Approval Request - ${detail.bid_title || ""}`,
        srmsRefNumber: String(bidId),
        status: "Pending Approval",
        startDate: Date.now(),
        createdBy: detail.buyer_name || "System",
        organization: detail.attribute_15 || "",
        department: detail.buyer_department || detail.department_name || "",
        amount: "0",
        orgId: detail.org_id,
      };
      const approverList = await workflowService.getFirstStepApproversList("Bid", wfParams);
      if (!approverList?.length) failures.push("Approval workflow is not configured");
    }
  }

  return {
    bidId,
    bidLabel,
    detail,
    bidType,
    lines: lines || [],
    suppliers: suppliers || [],
    requirements: requirements || [],
    approvers: approvers || [],
    failures,
  };
}

function buildPublishReadyItems(validation: PublishValidationResult): PublishBidReadyItem[] {
  const ready: PublishBidReadyItem[] = [];
  const { detail, lines, suppliers, requirements, approvers, failures } = validation;
  const failureSet = new Set(failures);

  if (detail.bid_title && !failureSet.has("Bid title is missing")) {
    ready.push({ label: "Bid title", detail: detail.bid_title });
  }
  if (detail.requestor && !failureSet.has("No requestor assigned")) {
    ready.push({ label: "Requestor", detail: detail.requestor_name || String(detail.requestor) });
  }
  if (detail.buyer && !failureSet.has("No buyer assigned")) {
    ready.push({ label: "Buyer", detail: detail.buyer_name || String(detail.buyer) });
  }
  if (detail.currency && !failureSet.has("Currency is not set")) {
    ready.push({ label: "Currency", detail: detail.currency });
  }
  if (hasBusinessEntity(detail) && !failureSet.has("Business entity is not set")) {
    ready.push({ label: "Business entity", detail: businessEntityDisplayLabel(detail) });
  }
  if (
    validation.bidType === "Tender" &&
    detail.env_open_date &&
    !failures.some((f) => /Envelope open date/i.test(f))
  ) {
    ready.push({
      label: "Envelope open date",
      detail: formatDateTimeForDisplay(detail.env_open_date),
    });
  }
  if (lines.length && !failureSet.has("No bid lines added")) {
    ready.push({ label: "Line items", detail: `${lines.length} item${lines.length === 1 ? "" : "s"}` });
  }
  if (suppliers.length && !failureSet.has("No suppliers/vendors invited")) {
    ready.push({
      label: "Suppliers invited",
      detail: `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}`,
    });
  }
  if (
    requirements.length &&
    !failures.some((f) => /evaluation criteria|weightage/i.test(f))
  ) {
    ready.push({
      label: "Evaluation criteria",
      detail: `${requirements.length} criteria (100% weight)`,
    });
  }
  if (
    approvers.length &&
    !failures.some((f) => /review team|approver assigned|Committee team/i.test(f))
  ) {
    ready.push({
      label: "Evaluation team",
      detail: `${approvers.length} member${approvers.length === 1 ? "" : "s"}`,
    });
  }

  return ready;
}

function parseDateTimeValue(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTimeForInput(value: unknown): string | undefined {
  if (!value) return undefined;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) && !/[Z+-]\d{2}:\d{2}$/.test(raw)) {
    return raw.slice(0, 16);
  }
  const date = parseDateTimeValue(value);
  if (!date) return undefined;
  return formatPublishDateTimeLocal(date);
}

function formatDateTimeForDisplay(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : parseDateTimeValue(value);
  if (!date) return undefined;
  return formatDateTimeDisplay(date);
}

function formatDateForInput(value: unknown): string | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function mapLinesToPreview(lines: any[]): CreateBidPreviewLineItem[] {
  return (lines || []).map((l) => ({
    lineId: l.id != null ? Number(l.id) : undefined,
    description: l.description || l.product_description || "Line item",
    quantity: l.quantity != null ? Number(l.quantity) : undefined,
    unitPrice: l.currentprice != null ? Number(l.currentprice) : undefined,
    uom: l.uom || l.unit_of_measure || undefined,
    lineType: l.linetype || undefined,
    itemId: l.item_id ?? undefined,
    categoryCode: l.product_category_id ?? undefined,
    categoryName: l.product_category || undefined,
    needByFrom: l.needbyfrom || undefined,
    needByTo: l.needbyto || undefined,
  }));
}

function mapSuppliersToPreview(suppliers: any[]): CreateBidPreviewSupplier[] {
  return (suppliers || []).map((s) => ({
    supplierId: s.supplier_id ?? s.supplierId,
    supplierName: s.supplier_name || s.supplierName || String(s.supplier_id ?? ""),
  }));
}

function mapCriteriaToPreview(requirements: any[]): CreateBidPreviewCriterion[] {
  return (requirements || []).map((r) => ({
    id: r.id != null ? Number(r.id) : undefined,
    category: r.category,
    question: r.question,
    weight: r.weight != null ? Number(r.weight) : undefined,
    qvtype: r.qvtype,
    qvoption: r.qvoption,
    lov: r.lov,
  }));
}

function mapTeamToPreview(approvers: any[]): CreateBidPreviewEvaluator[] {
  return (approvers || []).map((a) => ({
    userId: a.user_id ?? a.userId ?? a.id,
    userName: a.user_name || a.userName || a.name || String(a.user_id ?? ""),
    teamType: a.teamtype || a.teamType,
    roleLabel: teamRoleLabel(a.teamtype || a.teamType),
  }));
}

function buildPublishChecklist(validation: PublishValidationResult): PublishBidChecklistItem[] {
  const { detail, bidType, lines, suppliers, failures } = validation;
  const hasFailure = (re: RegExp) => failures.some((f) => re.test(f));

  const items: PublishBidChecklistItem[] = [
    {
      id: "title",
      label: "Bid title",
      ok: !!detail.bid_title && !hasFailure(/title is missing/i),
      detail: detail.bid_title || undefined,
    },
    {
      id: "requestor",
      label: "Requestor",
      ok: !!detail.requestor && !hasFailure(/requestor/i),
      detail: detail.requestor_name || (detail.requestor ? String(detail.requestor) : undefined),
    },
    {
      id: "buyer",
      label: "Buyer",
      ok: !!detail.buyer && !hasFailure(/buyer/i),
      detail: detail.buyer_name || (detail.buyer ? String(detail.buyer) : undefined),
    },
    {
      id: "currency",
      label: "Currency",
      ok: !!detail.currency && !hasFailure(/currency/i),
      detail: detail.currency || undefined,
    },
    {
      id: "businessEntity",
      label: "Business entity",
      ok: hasBusinessEntity(detail) && !hasFailure(/business entity/i),
      detail: businessEntityDisplayLabel(detail),
    },
    {
      id: "openDate",
      label: "Open date & time",
      ok: !!detail.startdate && !hasFailure(/Bid open date/i),
      detail: formatDateTimeForDisplay(detail.startdate),
    },
    {
      id: "closeDate",
      label: "Close date & time",
      ok: !!detail.enddate && !hasFailure(/Bid close date/i),
      detail: formatDateTimeForDisplay(detail.enddate),
    },
  ];

  if (bidType === "Tender") {
    items.push({
      id: "envOpenDate",
      label: "Envelope open date",
      ok: !!detail.env_open_date && !hasFailure(/Envelope open date/i),
      detail: formatDateTimeForDisplay(detail.env_open_date),
    });
  }

  items.push(
    {
      id: "lineItems",
      label: "Line items",
      ok: lines.length > 0 && !hasFailure(/No bid lines/i),
      detail: lines.length ? `${lines.length} item${lines.length === 1 ? "" : "s"}` : undefined,
    },
    {
      id: "suppliers",
      label: "Suppliers invited",
      ok: suppliers.length > 0 && !hasFailure(/suppliers\/vendors invited/i),
      detail: suppliers.length
        ? `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}`
        : undefined,
    },
  );

  if (bidType === "RFP" || bidType === "Tender") {
    items.push(
      {
        id: "criteria",
        label: "Evaluation criteria",
        ok: !hasFailure(/evaluation criteria/i),
      },
      {
        id: "weightage",
        label: "Criteria weightage (100%)",
        ok: !hasFailure(/weightage/i),
      },
      {
        id: "techReview",
        label: "Technical review team",
        ok: !hasFailure(/technical review team/i),
      },
    );
    if (bidType === "Tender") {
      items.push(
        {
          id: "commReview",
          label: "Commercial review team",
          ok: !hasFailure(/commercial review team/i),
        },
        {
          id: "techApprove",
          label: "Technical approver",
          ok: !hasFailure(/technical approver/i),
        },
        {
          id: "commApprove",
          label: "Commercial approver",
          ok: !hasFailure(/commercial approver/i),
        },
        {
          id: "committee",
          label: "Committee team (3+ members)",
          ok: !hasFailure(/Committee team/i),
        },
        {
          id: "workflow",
          label: "Approval workflow",
          ok: !hasFailure(/Approval workflow/i),
        },
      );
    }
  }

  return items;
}

export async function generateBidRemediationPreview(
  bidId: number,
  options: {
    resolveCriteria?: boolean;
    resolveTeam?: boolean;
    resolveVendors?: boolean;
    resolveClauses?: boolean;
  } = {},
): Promise<{
  bidLabel: string;
  criteria: any[];
  team: any[];
  vendors: any[];
  clauses: any[];
  errors: string[];
}> {
  const detail = (await bidService.getDboBidDetail(bidId)) as any;
  if (!detail) throw new Error(`No bid found with ID ${bidId}.`);

  const bidLabel = detail.attribute_4 || String(bidId);
  const bidTypeUpper = String(detail.type || "").toUpperCase();
  const resolveCriteria = options.resolveCriteria !== false;
  const resolveTeam = options.resolveTeam !== false;
  const resolveVendors = options.resolveVendors !== false;
  const resolveClauses = options.resolveClauses !== false;

  const [lines, existingSuppliers, existingRequirements] = (await Promise.all([
    bidService.getDboBidLines(bidId),
    bidService.getDboBidSuppliers(bidId),
    bidService.getDboBidRequirements(bidId),
  ])) as [any[], any[], any[]];

  const categories = Array.from(
    new Set((lines || []).map((l: any) => l.product_category).filter(Boolean)),
  ) as string[];
  const itemDescriptions = (lines || []).map((l: any) => l.description).filter(Boolean) as string[];

  const generatedCriteria: any[] = [];
  const generatedClauses: any[] = [];
  const generatedVendors: any[] = [];
  const generatedTeam: any[] = [];
  const errors: string[] = [];
  const isRfpOrTender = bidTypeUpper === "RFP" || bidTypeUpper === "TENDER";
  const criteriaToUse = existingRequirements?.length ? existingRequirements : [];

  if (resolveCriteria && isRfpOrTender && !existingRequirements?.length) {
    try {
      const crit = await bidAI.generateBidRequirements({
        categories,
        itemDescriptions,
        bidType: detail.type || "RFP",
        existingCount: 0,
        remainingWeight: 100,
        existingQuestions: [],
      });
      generatedCriteria.push(...(crit || []));
    } catch (err: any) {
      errors.push(`Criteria generation failed: ${err?.message || "AI error"}`);
    }
  }

  if (resolveClauses && lines?.length) {
    try {
      const cl = await bidAI.generateBidClauses({
        categories,
        itemDescriptions,
        bidType: detail.type || "RFQ",
      });
      generatedClauses.push(...(cl || []));
    } catch (err: any) {
      errors.push(`Terms/instructions generation failed: ${err?.message || "AI error"}`);
    }
  }

  if (resolveVendors && lines?.length) {
    try {
      const existingIds = new Set(
        (existingSuppliers || []).map((s: any) => String(s.supplier_id || s.supplierId || "")),
      );
      const recs = await bidAI.getSmartVendorRecommendations({ bidId, categories, itemDescriptions });
      const newVendors = (recs || [])
        .filter((r: any) => !existingIds.has(String(r.supplierId)))
        .slice(0, 5);
      generatedVendors.push(
        ...newVendors.map((v: any) => ({
          supplierId: v.supplierId,
          supplierName: v.supplierName,
          contactEmail: v.contactEmail || "",
          supplierSite: v.supplierSite || "",
          score: v.score,
          reasons: v.reasons?.slice(0, 2) || [],
        })),
      );
    } catch (err: any) {
      errors.push(`Vendor recommendation failed: ${err?.message || "AI error"}`);
    }
  }

  const allCriteriaForTeam = generatedCriteria.length ? generatedCriteria : criteriaToUse;
  if (resolveTeam && isRfpOrTender && allCriteriaForTeam.length > 0) {
    try {
      const existingApprovers = (await bidService.getDboBidApprovers(bidId)) as any[];
      const teamTypes =
        bidTypeUpper === "TENDER"
          ? [
              "Technical Review Team",
              "Technical Approve Team",
              "Commercial Review Team",
              "Commercial Approve Team",
              "Committee Team",
            ]
          : ["Technical Review Team", "Commercial Review Team"];
      const requiredCounts: Record<string, number> = {
        "Technical Review Team": 1,
        "Commercial Review Team": 1,
        "Technical Approve Team": 1,
        "Commercial Approve Team": 1,
        "Committee Team": 3,
      };
      const existingCounts: Record<string, number> = {};
      for (const tt of teamTypes) existingCounts[tt] = 0;
      (existingApprovers || []).forEach((a: any) => {
        const tt = a.teamtype || "";
        existingCounts[tt] = (existingCounts[tt] || 0) + 1;
      });
      const teamNeeds: Record<string, number> = {};
      for (const tt of teamTypes) {
        const missing = Math.max(0, (requiredCounts[tt] ?? 1) - (existingCounts[tt] || 0));
        if (missing > 0) teamNeeds[tt] = missing;
      }

      if (Object.keys(teamNeeds).length > 0) {
        const usersResult = await db.execute(sql`
          SELECT u.id, u.name, u.user_name, u.email_id,
                 COALESCE(u.mobile_no, u.phone_no, '') as contact,
                 u.department_name, r.role_name, r.description as role_description, r.role_type
          FROM dbo.um_user_dtls u
          LEFT JOIN dbo.um_user_roles_map_dtls urm ON u.id = urm.user_id
          LEFT JOIN dbo.um_role_dtls r ON urm.role_id = r.id
          WHERE u.user_status = 1 AND u.user_type = 0
        `);
        const usersRows = (usersResult as any).rows || [];
        const userMap = new Map<number, any>();
        for (const row of usersRows) {
          const uid = Number(row.id);
          if (!Number.isFinite(uid)) continue;
          if (!userMap.has(uid)) {
            userMap.set(uid, {
              id: uid,
              name: row.name,
              user_name: row.user_name,
              email_id: row.email_id,
              department_name: row.department_name,
              roles: [],
            });
          }
          if (row.role_name) {
            userMap.get(uid).roles.push({
              role_name: row.role_name,
              role_description: row.role_description,
              role_type: row.role_type,
            });
          }
        }
        const existingUserIds = new Set((existingApprovers || []).map((a: any) => String(a.user_id)));
        const buyerEmail = String(detail.buyer_email || "").toLowerCase();
        const candidates = Array.from(userMap.values()).filter((u: any) => {
          if (!u.id) return false;
          if (existingUserIds.has(String(u.id))) return false;
          if (buyerEmail && String(u.email_id || "").toLowerCase() === buyerEmail) return false;
          const hasAdminRole = u.roles.some((r: any) => {
            const roleNameUpper = String(r.role_name || "").toUpperCase();
            return roleNameUpper.includes("SUPERADMIN") || roleNameUpper.includes("SYSADMIN");
          });
          return !hasAdminRole;
        });

        if (candidates.length > 0) {
          const candidateIds = candidates
            .map((c: any) => Number(c.id))
            .filter((id: number) => Number.isFinite(id));
          let statsRows: any[] = [];
          if (candidateIds.length > 0) {
            const statsResult = await db.execute(sql`
              SELECT a.user_id, a.teamtype, COUNT(*)::int as cnt
              FROM dbo.supp_bid_approvers a
              JOIN dbo.supp_bid_dtls b ON b.id = a.bidrefno
              WHERE a.user_id IN (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)})
                AND b.status NOT IN ('Deleted') AND UPPER(b.type) = ${bidTypeUpper}
              GROUP BY a.user_id, a.teamtype
            `);
            statsRows = (statsResult as any).rows || [];
          }
          const statsMap = new Map<number, Record<string, number>>();
          for (const row of statsRows) {
            const uid = Number(row.user_id);
            if (!Number.isFinite(uid)) continue;
            const tc = statsMap.get(uid) || {};
            tc[String(row.teamtype)] = Number(row.cnt || 0);
            statsMap.set(uid, tc);
          }
          const candidatePayload = candidates.map((u: any) => {
            const id = Number(u.id);
            const teamCounts = statsMap.get(id) || {};
            return {
              id,
              name: u.name || u.user_name || `User ${id}`,
              user_name: u.user_name || "",
              email_id: u.email_id || "",
              contact: "",
              department: u.department_name || "",
              roles: u.roles,
              teamCounts,
              totalAssignments: Object.values(teamCounts).reduce(
                (s, v) => s + Number(v || 0),
                0,
              ),
            };
          });

          const scopeOfWork = (lines || [])
            .map((l: any) => ({ itemName: l.description || "", category: l.product_category || "" }))
            .filter((i: any) => i.itemName || i.category);
          const evalCriteria = allCriteriaForTeam.map((r: any) => ({
            category: r.category || r.question_category || "Technical",
            question: r.question || r.requirement_text || "",
            weight: parseInt(r.weight || "0", 10) || 0,
          }));

          const suggestions = await bidAI.suggestEvaluationTeam({
            bidTitle: detail.bid_title || "",
            bidType: bidTypeUpper,
            categories,
            scopeOfWork,
            evaluationCriteria: evalCriteria,
            teamNeeds,
            candidates: candidatePayload,
          });

          const userById = new Map(candidatePayload.map((c: any) => [c.id, c]));
          for (const [teamType, userIds] of Object.entries(suggestions || {})) {
            // suggestions[teamType] carries spares past teamNeeds for the
            // real insertion path's substitution-on-rejection; this preview
            // never inserts, so only show the actually-required count.
            const displayIds = (userIds as number[]).slice(0, teamNeeds[teamType]);
            for (const userId of displayIds) {
              const userDetail = userById.get(userId) as any;
              generatedTeam.push({
                teamType,
                userId,
                userName: userDetail?.name || `User ${userId}`,
                userEmail: userDetail?.email_id || "",
              });
            }
          }
        }
      }
    } catch (err: any) {
      errors.push(`Team suggestion failed: ${err?.message || "AI error"}`);
    }
  }

  return {
    bidLabel,
    criteria: generatedCriteria,
    team: generatedTeam,
    vendors: generatedVendors,
    clauses: generatedClauses,
    errors,
  };
}

export async function buildPublishBidPreviewSpec(
  validation: PublishValidationResult,
): Promise<PublishBidPreviewSpec> {
  const {
    bidId,
    bidLabel,
    detail,
    bidType,
    lines,
    suppliers,
    requirements,
    approvers,
    failures,
  } = validation;

  const manualRequired = failures.filter((f) => classifyPublishFailure(f) === "manual");
  const aiFailures = failures.filter((f) => classifyPublishFailure(f) === "ai");
  const aiResolvable = aiFailures
    .map(mapFailureToAiGap)
    .filter((g): g is PublishBidAiGap => g != null);

  const uniqueAiResolvable = Array.from(
    new Map(aiResolvable.map((g) => [g.resolutionLabel, g])).values(),
  );

  const needsVendors = failures.some((f) => /suppliers\/vendors invited/i.test(f));
  const needsCriteria = failures.some((f) => /evaluation criteria|weightage/i.test(f));
  const needsTeam = failures.some(
    (f) => /review team|approver assigned|Committee team/i.test(f),
  );
  const needsClauses = failures.some((f) => /terms and instructions/i.test(f));

  let aiRecommendations: PublishBidPreviewSpec["aiRecommendations"];
  let remediationErrors: string[] | undefined;
  if (needsVendors || needsCriteria || needsTeam || needsClauses) {
    const remediation = await generateBidRemediationPreview(bidId, {
      resolveCriteria: needsCriteria,
      resolveTeam: needsTeam,
      resolveVendors: needsVendors,
      resolveClauses: needsClauses,
    });
    aiRecommendations = {
      bidId,
      bidLabel,
      criteria: remediation.criteria,
      team: remediation.team,
      vendors: remediation.vendors,
      clauses: remediation.clauses,
    };
    if (remediation.errors.length > 0) {
      remediationErrors = remediation.errors;
    }
  }

  const existingSupplierIds = new Set(
    suppliers.map((s) => String(s.supplier_id ?? s.supplierId ?? "")),
  );
  const suggestedSuppliers: CreateBidPreviewSupplier[] = (aiRecommendations?.vendors || [])
    .filter((v: any) => !existingSupplierIds.has(String(v.supplierId ?? "")))
    .map((v: any) => ({
      supplierId: v.supplierId,
      supplierName: v.supplierName || String(v.supplierId),
    }));

  const suggestedCriteria: CreateBidPreviewCriterion[] = (aiRecommendations?.criteria || []).map(
    (c: any) => ({
      category: c.category,
      question: c.question,
      weight: c.weight != null ? Number(c.weight) : undefined,
    }),
  );
  const suggestedEvaluators: CreateBidPreviewEvaluator[] = (aiRecommendations?.team || []).map(
    (m: any) => ({
      userId: m.userId,
      userName: m.userName || String(m.userId),
      teamType: m.teamType,
      roleLabel: teamRoleLabel(m.teamType),
    }),
  );
  const suggestedClauses: CreateBidPreviewClause[] = (aiRecommendations?.clauses || []).map(
    (c: any) => ({
      type: c.type || "terms",
      class_desc: c.class_desc || "",
    }),
  );

  const resolvedDates = resolveDefaultPublishDates({
    openDate: detail.startdate,
    closeDate: detail.enddate,
    preservePastDates: true,
  });
  const previewOpenDate = formatPublishDateTimeLocal(resolvedDates.openDate);
  const previewCloseDate = formatPublishDateTimeLocal(resolvedDates.closeDate);

  const checklist = buildPublishChecklist(validation);
  if (resolvedDates.datesRequireUpdate) {
    for (const item of checklist) {
      // Only offer a suggested default for a date that is missing. A stored past date
      // stays on screen, paired with an error, so the user can see what to correct.
      if (item.id === "openDate" && !item.ok && !resolvedDates.openDateInPast) {
        item.detail = formatDateTimeForDisplay(resolvedDates.openDate);
      }
      if (item.id === "closeDate" && !item.ok && !resolvedDates.closeDateInPast) {
        item.detail = formatDateTimeForDisplay(resolvedDates.closeDate);
      }
    }
  }
  if (bidType === "Tender") {
    for (const item of checklist) {
      if (item.id === "envOpenDate" && !item.ok && !detail.env_open_date && detail.enddate) {
        const suggested = resolveDefaultEnvelopeOpenDate({
          closeDate: new Date(detail.enddate),
        });
        item.detail = formatDateTimeForDisplay(suggested);
      }
    }
  }

  return {
    kind: "publish_bid_preview",
    bidId,
    bidLabel,
    title: detail.bid_title || bidLabel,
    bidType,
    lineItemCount: lines.length,
    vendorCount: suppliers.length,
    businessEntity: businessEntityDisplayLabel(detail),
    buyer: detail.buyer_name || (detail.buyer ? String(detail.buyer) : undefined),
    requestor: detail.requestor_name || (detail.requestor ? String(detail.requestor) : undefined),
    currency: detail.currency || undefined,
    prNumber: detail.pr_number ? String(detail.pr_number) : undefined,
    openDate: previewOpenDate,
    closeDate: previewCloseDate,
    datesRequireUpdate: resolvedDates.datesRequireUpdate,
    openDateError: resolvedDates.openDateInPast ? PAST_OPEN_DATE_MESSAGE : undefined,
    closeDateError: resolvedDates.closeDateInPast ? PAST_CLOSE_DATE_MESSAGE : undefined,
    lineItems: mapLinesToPreview(lines),
    suppliers: mapSuppliersToPreview(suppliers),
    suggestedSuppliers,
    evaluationCriteria:
      requirements.length > 0 ? mapCriteriaToPreview(requirements) : suggestedCriteria,
    evaluators: approvers.length > 0 ? mapTeamToPreview(approvers) : suggestedEvaluators,
    clauses: suggestedClauses,
    checklist,
    ready: buildPublishReadyItems(validation),
    aiResolvable: uniqueAiResolvable,
    manualRequired,
    aiRecommendations,
    remediationErrors,
    canPublish: failures.length === 0,
    canRemediate: uniqueAiResolvable.length > 0 || needsVendors || needsCriteria || needsTeam,
  };
}

export async function buildPublishBidSuccessSpec(
  bidId: number,
): Promise<PublishBidSuccessSpec | undefined> {
  const detail = (await bidService.getDboBidDetail(bidId)) as any;
  if (!detail) return undefined;

  return {
    kind: "publish_bid_success",
    bidId,
    bidNumber: detail.attribute_4 || String(bidId),
    title: detail.bid_title || detail.attribute_4 || String(bidId),
    bidType: detail.type || "RFQ",
    status: detail.status || "Published",
  };
}

export function createBidPreviewPromptText(bidType: string): string {
  return `Would you like to make any changes to this ${bidType}?`;
}

export function createBidFromPrPreviewPromptText(bidType: string): string {
  return `Review the PR details below. You can change the bid type or dates before creating this ${bidType}.`;
}

export function publishPreviewPromptText(canPublish: boolean): string {
  if (canPublish) {
    return "All publish requirements are satisfied. Would you like to publish this bid?";
  }
  return "Review the bid details below, edit anything you need, then apply changes before publishing.";
}
