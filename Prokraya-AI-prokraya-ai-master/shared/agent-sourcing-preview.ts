/** Structured chat preview specs for the Sourcing Agent create/publish workflows. */

export interface CreateBidPreviewLineItem {
  /** Persisted bid line id when the line already exists on the bid. */
  lineId?: number;
  description: string;
  quantity?: number;
  unitPrice?: number;
  uom?: string;
  lineType?: string;
  itemId?: string | number;
  itemName?: string;
  itemCode?: string;
  categoryCode?: string | number;
  categoryName?: string;
  needByFrom?: string;
  needByTo?: string;
}

export interface CreateBidPreviewSupplier {
  supplierId?: number | string;
  supplierName: string;
}

export interface CreateBidPreviewCriterion {
  id?: number;
  category?: string;
  question: string;
  weight?: number;
  qvtype?: string;
  qvoption?: string;
  lov?: string;
}

export interface CreateBidPreviewEvaluator {
  userId?: number | string;
  userName: string;
  teamType?: string;
  roleLabel?: string;
}

export interface CreateBidPreviewClause {
  type: "terms" | "instructions" | string;
  class_desc: string;
}

export interface CreateBidPreviewSpec {
  kind: "create_bid_preview";
  source: "create_bid" | "create_bid_from_pr";
  title: string;
  bidType: string;
  orgId?: string | number;
  businessEntity?: string;
  buyerId?: string | number;
  buyer?: string;
  requestorId?: string | number;
  requestor?: string;
  currency?: string;
  openDate?: string;
  closeDate?: string;
  department?: string;
  notes?: string;
  paymentTermsId?: string;
  paymentTerms?: string;
  deliveryLocationId?: string;
  deliveryLocationName?: string;
  envOpenDate?: string;
  bidStyle?: string;
  prNumber?: string;
  prDescription?: string;
  prAmount?: string;
  lineItems: CreateBidPreviewLineItem[];
  suppliers: CreateBidPreviewSupplier[];
  evaluationCriteria: CreateBidPreviewCriterion[];
  evaluators: CreateBidPreviewEvaluator[];
  clauses: CreateBidPreviewClause[];
  queuedActionCount: number;
}

export interface PublishBidReadyItem {
  label: string;
  detail?: string;
}

export interface PublishBidAiGap {
  gap: string;
  resolutionLabel: string;
}

export interface PublishBidAiRecommendations {
  bidId: number;
  bidLabel?: string;
  criteria: any[];
  team: any[];
  vendors: any[];
  clauses: any[];
}

export interface PublishBidChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface PublishBidPreviewSpec {
  kind: "publish_bid_preview";
  bidId: number;
  bidLabel: string;
  title: string;
  bidType: string;
  lineItemCount: number;
  vendorCount: number;
  businessEntity?: string;
  buyer?: string;
  requestor?: string;
  currency?: string;
  openDate?: string;
  closeDate?: string;
  /** Set when bid was created from a purchase requisition — line items are read-only. */
  prNumber?: string;
  /** True when preview dates are suggested defaults not yet saved on the bid. */
  datesRequireUpdate?: boolean;
  /** Set when the saved open date is in the past and must be corrected before publishing. */
  openDateError?: string;
  /** Set when the saved close date is in the past and must be corrected before publishing. */
  closeDateError?: string;
  lineItems: CreateBidPreviewLineItem[];
  suppliers: CreateBidPreviewSupplier[];
  suggestedSuppliers: CreateBidPreviewSupplier[];
  evaluationCriteria: CreateBidPreviewCriterion[];
  evaluators: CreateBidPreviewEvaluator[];
  clauses: CreateBidPreviewClause[];
  checklist: PublishBidChecklistItem[];
  ready: PublishBidReadyItem[];
  aiResolvable: PublishBidAiGap[];
  manualRequired: string[];
  aiRecommendations?: PublishBidAiRecommendations;
  remediationErrors?: string[];
  canPublish: boolean;
  canRemediate: boolean;
}

export type AgentSourcingPreviewSpec = CreateBidPreviewSpec | PublishBidPreviewSpec;

/** Inline buttons asking whether to create a bid from a PR or directly. */
export interface CreateBidSourceChoiceOption {
  id: "from_pr" | "direct";
  label: string;
  /** Prompt sent when the user clicks this option. */
  prompt: string;
}

export interface CreateBidSourceChoiceSpec {
  kind: "create_bid_source_choice";
  options: CreateBidSourceChoiceOption[];
}

export function isCreateBidSourceChoice(
  value: CreateBidFlowChoiceSpec | undefined | null,
): value is CreateBidSourceChoiceSpec {
  return value?.kind === "create_bid_source_choice";
}

/** Inline buttons to pick an approved PR to convert into a bid. */
export interface CreateBidPrChoiceOption {
  prNumber: string;
  label: string;
  /** Prompt sent when the user clicks this option. */
  prompt: string;
  description?: string;
  department?: string;
  amountLabel?: string;
}

export interface CreateBidPrChoiceSpec {
  kind: "create_bid_pr_choice";
  options: CreateBidPrChoiceOption[];
}

export function isCreateBidPrChoice(
  value: CreateBidFlowChoiceSpec | undefined | null,
): value is CreateBidPrChoiceSpec {
  return value?.kind === "create_bid_pr_choice";
}

/** Inline buttons to pick which assigned business entity a bid belongs to. */
export interface CreateBidEntityChoiceOption {
  orgId: string;
  label: string;
  /** Prompt sent when the user clicks this option. */
  prompt: string;
}

export interface CreateBidEntityChoiceSpec {
  kind: "create_bid_entity_choice";
  options: CreateBidEntityChoiceOption[];
}

export function isCreateBidEntityChoice(
  value: CreateBidFlowChoiceSpec | undefined | null,
): value is CreateBidEntityChoiceSpec {
  return value?.kind === "create_bid_entity_choice";
}

export type CreateBidFlowChoiceSpec =
  | CreateBidSourceChoiceSpec
  | CreateBidPrChoiceSpec
  | CreateBidEntityChoiceSpec;

/** Post-execution summary after create-bid actions are confirmed. */
export interface CreateBidSuccessSpec {
  kind: "create_bid_success";
  source: "create_bid" | "create_bid_from_pr";
  bidId: number;
  bidNumber: string;
  title: string;
  bidType: string;
  businessEntity?: string;
  buyer?: string;
  requestor?: string;
  currency?: string;
  openDate?: string;
  closeDate?: string;
  envOpenDate?: string;
  department?: string;
  paymentTerms?: string;
  deliveryLocationName?: string;
  prNumber?: string;
  status: string;
  lineItems: CreateBidPreviewLineItem[];
  suppliers: CreateBidPreviewSupplier[];
  evaluationCriteria: CreateBidPreviewCriterion[];
  evaluators: CreateBidPreviewEvaluator[];
  clauses: CreateBidPreviewClause[];
}

export type AgentSourcingResultSpec = CreateBidSuccessSpec | PublishBidSuccessSpec;

/** Post-execution summary after publish-bid action is confirmed. */
export interface PublishBidSuccessSpec {
  kind: "publish_bid_success";
  bidId: number;
  bidNumber: string;
  title: string;
  bidType: string;
  status: string;
}

/** Recently created bid in this chat — target for follow-up line/vendor actions. */
export interface ActiveCreatedBidContext {
  bidId: number;
  bidNumber: string;
  title?: string;
  bidType?: string;
  currency?: string;
}

/** Evaluation criteria and evaluator teams only apply to RFP/Tender — an RFQ is priced, not scored. */
export function bidTypeSupportsEvaluation(bidType?: string | null): boolean {
  const normalized = String(bidType || "").trim().toUpperCase();
  return normalized === "RFP" || normalized === "TENDER";
}

export function isCreateBidPreview(
  preview: AgentSourcingPreviewSpec | undefined | null,
): preview is CreateBidPreviewSpec {
  return preview?.kind === "create_bid_preview";
}

export function isPublishBidPreview(
  preview: AgentSourcingPreviewSpec | undefined | null,
): preview is PublishBidPreviewSpec {
  return preview?.kind === "publish_bid_preview";
}

export function isCreateBidSuccess(
  result: AgentSourcingResultSpec | undefined | null,
): result is CreateBidSuccessSpec {
  return result?.kind === "create_bid_success";
}

export function isPublishBidSuccess(
  result: AgentSourcingResultSpec | undefined | null,
): result is PublishBidSuccessSpec {
  return result?.kind === "publish_bid_success";
}
