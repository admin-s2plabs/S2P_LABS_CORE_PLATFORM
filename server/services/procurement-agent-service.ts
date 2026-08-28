import OpenAI from "openai";
import { getAIClient, getAIModelName } from "./ai-client";
import { renderPrompt } from "./knowledge-layer/prompt-renderer";
import { loadKnowledge } from "./knowledge-layer/knowledge-loader";
import { loadSkills, assertDispatcherParity } from "./knowledge-layer/skills-loader";
import { getFeedbackGuidance } from "./knowledge-layer/feedback-service";
import * as procService from "../modules/procurement/procurement.service";
import {
  checkRequisitionSubmitReadiness,
  formatRequisitionReadinessMessage,
} from "@shared/requisition-submit-readiness";
import * as vendorService from "../modules/vendors/vendors.service";
import { logAudit } from "../modules/administration/administration.service";
import { recommendRequisition } from "./pr-recommendation/pr-recommendation.service";
import { createDefaultDeps } from "./pr-recommendation/adapters";
import * as prRecommendationRepo from "../modules/procurement/pr-recommendation.repository";
import { recommendPurchaseOrder } from "./po-recommendation/po-recommendation.service";
import { createDefaultPoDeps } from "./po-recommendation/adapters";
import {
  buildAddPrLineBody,
  findItemMasterMatchForQuery,
  formatAddPrLineConfirmation,
  formatAddPrLineResult,
  formatItemAmbiguousMessage,
  formatItemNotFoundMessage,
  normalizeItemQuery,
  resolveAddPrLine,
  type ResolvedPrLine,
} from "./add-pr-line/resolver";
import { createAddPrLineDeps } from "./add-pr-line/adapters";
import {
  buildAddPoLineBody,
  formatAddPoLineConfirmation,
  formatAddPoLineResult,
  resolveAddPoLine,
  type ResolvedPoLine,
} from "./add-po-line/resolver";
import { createAddPoLineDeps } from "./add-po-line/adapters";
import {
  classifyProcurementRecommendationIntent,
  formatItemRecommendations,
  formatQuantityRecommendation,
  formatRequisitionItemSuggestions,
} from "./procurement-recommendations";
import { getSmartRecommendations } from "./pr-ai-service";
import { getContextPool } from "../tenant-context";
import { prFieldLabel } from "@shared/agent-pr-recommendation";
import type { PrRecommendationSpec } from "@shared/agent-pr-recommendation";
import { buildPoCreatePayload, poFieldLabel } from "@shared/agent-po-recommendation";
import type { PoRecommendationOverrides, PoRecommendationSpec } from "@shared/agent-po-recommendation";
import { parseNeedByDate, parsePoChatOverrides } from "./po-recommendation/chat-overrides";
import { matchByLabels } from "./direct-po-name-match";
import type { AgentChartSpec } from "@shared/agent-chart";
import { agentToolIsMutatingForChartGate, barChartFromCountMap } from "@shared/agent-chart";
import type {
  BidMention,
  BusinessUserMention,
  InvoiceMention,
  ItemMention,
  PrMention,
  PoMention,
  SupplierMention,
} from "@shared/agent-mention";
import { applyAllMentionsToPrompt, normalizeItemMentions } from "./agent-mention-utils";
import {
  buildDirectPoDraft,
  flattenDirectPoDraft,
  formatDirectPoPreparePreview,
  formatDirectPoValidationMessage,
  toCreatePurchaseOrderPayload,
  validateDirectPoMandatoryFields,
} from "./direct-po-agent-validation";
import {
  findOrganizationById,
  formatBusinessEntityAmbiguityMessage,
  formatBusinessEntityNotFoundMessage,
  isNumericOrgId,
  matchBusinessEntityByName,
  parseNumericOrgId,
  type OrganizationRecord,
} from "./direct-po-business-entity";
import {
  findBudgetById,
  findDepartmentById,
  findLocationById,
  findPaymentTermsById,
  formatBudgetAmbiguity,
  formatBudgetNotFound,
  formatBudgetSearchLine,
  formatDepartmentAmbiguity,
  formatDepartmentNotFound,
  formatLocationAmbiguity,
  formatLocationNotFound,
  formatPaymentTermsAmbiguity,
  formatPaymentTermsNotFound,
  isCanonicalNumericId,
  isOrdinalChoice,
  matchBudget,
  matchDepartment,
  matchLocation,
  matchPaymentTerms,
  pickBudgetFromCandidates,
  extractBudgetIdFromPrompt,
  resolveDefaultPaymentTerms,
  toBudgetCandidate,
  uniqueBudgetLines,
  type ApprovedBudgetLine,
  type BudgetCandidate,
  type DepartmentRecord,
  type LocationRecord,
  type PaymentTermRecord,
} from "./direct-po-lookups";
import {
  budgetChoiceFromCandidates,
  buildSelectOptionPendingAction,
  businessEntityChoiceFromCandidates,
  buyerChoiceFromNames,
  departmentChoiceFromCandidates,
  locationChoiceFromCandidates,
  paymentTermsChoiceFromCandidates,
  vendorChoiceFromRows,
  type AgentChoiceSpec,
} from "./direct-po-choice";
import * as adminService from "../modules/administration/administration.service";
import * as budgetsService from "../modules/budgets/budgets.service";
import {
  buildPoLineEdit,
  formatPoChangeList,
  formatPoLineLabel,
  formatPoLineTargetMessage,
  lockedPoFieldsMessage,
  poEditFieldSupplied,
  poEditText,
  poLineEditBlockedMessage,
  poStatusBlocksEditMessage,
  resolvePoLineTarget,
  type PoFieldChange,
  type PoHeaderField,
} from "./po-agent-edit";
import { formatChangeList } from "./agent-line-edit";
import { mergePendingActions } from "./agent-pending-action";
import {
  buildPrLineEdit,
  formatPrLineLabel,
  formatPrLineTargetMessage,
  prStatusBlocksEditMessage,
  resolvePrLineTarget,
} from "./pr-agent-edit";

/** Last ambiguous budget list per user — enables ordinal replies like "1" / "2". */
const lastBudgetAmbiguityByUser = new Map<string, BudgetCandidate[]>();

/** Last buyer shortlist (name → id from PO history) for clickable "Use buyer …" replies. */
const lastBuyerAmbiguityByUser = new Map<
  string,
  Array<{ buyerId: string | number; buyerName: string; buyerEmail?: string | null }>
>();

function budgetAmbiguityKey(sessionUser?: any): string {
  const id = sessionUser?.id ?? sessionUser?.userId ?? sessionUser?.email ?? "anon";
  return String(id);
}

function rememberBudgetAmbiguity(sessionUser: any, candidates: BudgetCandidate[]): void {
  lastBudgetAmbiguityByUser.set(budgetAmbiguityKey(sessionUser), candidates.slice());
}

function clearBudgetAmbiguity(sessionUser: any): void {
  lastBudgetAmbiguityByUser.delete(budgetAmbiguityKey(sessionUser));
}

function getRememberedBudgetAmbiguity(sessionUser: any): BudgetCandidate[] {
  return lastBudgetAmbiguityByUser.get(budgetAmbiguityKey(sessionUser)) || [];
}

function rememberBuyerAmbiguity(
  sessionUser: any,
  buyers: Array<{ buyerId: string | number; buyerName: string; buyerEmail?: string | null }>,
): void {
  lastBuyerAmbiguityByUser.set(budgetAmbiguityKey(sessionUser), buyers.slice());
}

function clearBuyerAmbiguity(sessionUser: any): void {
  lastBuyerAmbiguityByUser.delete(budgetAmbiguityKey(sessionUser));
}

function getRememberedBuyerAmbiguity(
  sessionUser: any,
): Array<{ buyerId: string | number; buyerName: string; buyerEmail?: string | null }> {
  return lastBuyerAmbiguityByUser.get(budgetAmbiguityKey(sessionUser)) || [];
}

function extractBuyerNameFromPrompt(text: string): string | null {
  const t = String(text || "").trim();
  if (!t) return null;
  const m = t.match(/^use\s+buyer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  type: string;
  data: any;
  summary: string;
}

interface ProcurementAgentResponse {
  response: string;
  pendingAction?: PendingAction;
  chart?: AgentChartSpec;
  /** Structured spec rendered as an editable review card by the client. */
  actionPreview?: PrRecommendationSpec | PoRecommendationSpec;
}

/**
 * Prompt and tool definitions now live in the knowledge layer as editable assets:
 *   ai/prompts/procurement.system.hbs   — persona, tool usage, response format
 *   ai/knowledge/procurement/*.md       — business rules, recipes, data context
 *   ai/skills/procurement.skills.json   — the tool definitions
 * Only the dispatcher (executeToolCall) and orchestration remain in this file.
 */
function buildProcurementSystemPrompt(feedbackGuidance = "", feedbackSuppressed = false): string {
  return renderPrompt("procurement.system", {
    staticKnowledge: loadKnowledge("procurement"),
    // Rendered per request, so a long-running process never serves a stale date.
    currentDate: new Date().toISOString().split("T")[0],
    // Per-user, advisory-only, dynamic-suffix. Empty string => prompt unchanged.
    feedbackGuidance,
    // Set when the user has just switched personalisation off or reset their feedback.
    // Without this the change appears not to take effect mid-conversation: the request
    // already omits the guidance, but earlier assistant turns are replayed in
    // conversationHistory and the model keeps imitating the style they demonstrate.
    feedbackSuppressed,
  });
}

function getProcurementTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return loadSkills("procurement");
}

/**
 * Greedy decoding — the same question should give the same answer.
 *
 * This is a data-retrieval and reporting agent, not a creative one: it lists PRs and POs,
 * formats records and calls tools. Sampling variety has no value here and actively gets in
 * the way, because it makes it impossible to tell whether an output changed because of a
 * prompt/feedback change or just because the model rolled differently. (It was 0.5, an
 * outlier — the structured agents in this codebase already run at 0.0-0.2.)
 *
 * Caveat: temperature 0 makes output *highly consistent*, not formally deterministic.
 * Providers do not guarantee bit-identical responses even at 0 (batched GPU floating-point
 * non-determinism, MoE routing). Genuine per-request variance also remains from the
 * injected date, live database results, and any feedback guidance that has accumulated.
 *
 * Declared once and shared by both completion calls below, so the initial call and the
 * tool-loop follow-up can never drift apart.
 */
const AGENT_TEMPERATURE = 0;

/**
 * Tool names handled by executeToolCall() below. Kept adjacent to the dispatcher and
 * cross-checked against ai/skills/procurement.skills.json at boot, so a tool that is
 * advertised to the model without an implementation (or vice versa) fails startup
 * rather than a user's query.
 */
const DISPATCHER_TOOL_NAMES: readonly string[] = [
  "execute_add_po_line",
  "execute_add_pr_line",
  "execute_create_delivery_note",
  "execute_create_grn",
  "execute_create_po_from_pr",
  "execute_create_purchase_order",
  "execute_create_purchase_order_from_recommendation",
  "execute_create_requisition",
  "execute_create_requisition_from_recommendation",
  "execute_submit_purchase_order",
  "execute_submit_requisition",
  "execute_update_po_line",
  "execute_update_pr_line",
  "execute_update_purchase_order",
  "execute_update_requisition",
  "get_category_details",
  "get_po_delivery_notes",
  "get_po_details",
  "get_po_grns",
  "get_po_receipt_status",
  "get_po_stats",
  "get_po_stats_by_department",
  "get_pr_stats",
  "get_pr_stats_by_department",
  "get_requisition_details",
  "get_vendors_by_category",
  "prepare_add_po_line",
  "prepare_add_pr_line",
  "prepare_create_delivery_note",
  "prepare_create_grn",
  "prepare_create_po_from_pr",
  "prepare_create_purchase_order",
  "prepare_create_requisition",
  "prepare_submit_purchase_order",
  "prepare_submit_requisition",
  "prepare_update_po_line",
  "prepare_update_pr_line",
  "prepare_update_purchase_order",
  "prepare_update_requisition",
  "search_budgets",
  "recommend_item_quantity",
  "recommend_items_for_description",
  "recommend_purchase_order",
  "recommend_requisition",
  "suggest_items_for_requisition",
  "search_categories",
  "search_departments",
  "search_items",
  "search_locations",
  "search_organizations",
  "search_payment_terms",
  "search_purchase_orders",
  "search_requisitions",
  "search_vendors",
];

/** Boot-time validation for this agent's slice of the knowledge layer. */
export function verifyProcurementKnowledgeLayer(): { tools: number } {
  assertDispatcherParity("procurement", DISPATCHER_TOOL_NAMES);
  buildProcurementSystemPrompt();
  return { tools: DISPATCHER_TOOL_NAMES.length };
}

/**
 * Used for both a missing PR and one the user may not see, so the agent never reveals that
 * a requisition outside their visibility exists.
 */
function prNotFoundMessage(prNumber: string): string {
  return `No purchase requisition found with number ${prNumber}.`;
}

/**
 * Guard for tools that read or act on one specific PR. Returns a tool result to short-circuit
 * with when the PR is outside the user's Requisitions visibility, otherwise null.
 */
async function denyIfPrHidden(
  prNumber: string,
  sessionUser: any,
): Promise<{ result: string } | null> {
  if (!prNumber) return null;
  if (await procService.canUserAccessPr(prNumber, sessionUser)) return null;
  return { result: prNotFoundMessage(prNumber) };
}

/**
 * Agent-side budget gate for PO submit — mirrors the PO detail page validate-budget call
 * (including from-PR / from-bid reserved amounts). Does not change traditional submitPurchaseOrder.
 */
async function validatePoBudgetForAgentSubmit(po: any): Promise<{
  ok: boolean;
  message: string;
  warnings: string[];
}> {
  const department = String(po?.department_name || "");
  const totalAmount = Number(po?.po_total_cost) || 0;
  const title = String(po?.po_description || po?.po_number || "");
  const segmentRaw = po?.budget_segment;
  const parsedSegment =
    segmentRaw != null && String(segmentRaw).trim() !== ""
      ? Number(segmentRaw)
      : NaN;
  const budgetLineId = Number.isFinite(parsedSegment) ? parsedSegment : null;
  const currency = String(po?.po_currency || "");
  const fromPR = Boolean(po?.pr_number);
  const fromBid = Boolean(po?.bid_award_id);

  try {
    const validation = await procService.validateBudgetAmount(
      department,
      totalAmount,
      title,
      budgetLineId,
      currency,
      fromPR,
      po?.pr_number || "",
      fromBid,
      po?.bid_award_id || "",
    );
    const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
    if (!validation.isWithinBudget) {
      return {
        ok: false,
        message: warnings[0] || "This PO exceeds the available budget.",
        warnings,
      };
    }
    return {
      ok: true,
      message: warnings[0] || "This PO is within budget limits.",
      warnings,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Budget check failed.",
      warnings: [err?.message || "Budget check failed."],
    };
  }
}

async function loadOrganizations(): Promise<OrganizationRecord[]> {
  try {
    return (await adminService.getOrganizations()) as OrganizationRecord[];
  } catch {
    return [];
  }
}

async function loadApprovedBudgetLines(): Promise<ApprovedBudgetLine[]> {
  try {
    return (await budgetsService.getApprovedLines()) as ApprovedBudgetLine[];
  } catch {
    return [];
  }
}

async function loadDepartments(): Promise<DepartmentRecord[]> {
  try {
    const result = await adminService.getCostCenterItems("3", 1, 200, undefined);
    return ((result as any)?.data || []) as DepartmentRecord[];
  } catch {
    return [];
  }
}

async function loadLocations(): Promise<LocationRecord[]> {
  try {
    return (await adminService.getLocations()) as LocationRecord[];
  } catch {
    return [];
  }
}

async function loadPaymentTerms(): Promise<PaymentTermRecord[]> {
  try {
    const result = await adminService.getPaymentTerms(1, 200, "");
    return ((result as any)?.data || []) as PaymentTermRecord[];
  } catch {
    return [];
  }
}

/**
 * Resolve Business Entity for Direct PO: prefer orgName (user-facing), or numeric orgId.
 * If orgId is a non-numeric name (e.g. "ProductionQA"), treat it as orgName.
 * Never invents an ID.
 */
async function resolveDirectPoBusinessEntity(args: any): Promise<{
  resolvedOrg: { orgId: number; orgName: string } | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  const orgNameHint =
    (typeof args.orgName === "string" && args.orgName.trim()) ||
    (!isNumericOrgId(args.orgId) && args.orgId != null && String(args.orgId).trim()
      ? String(args.orgId).trim()
      : null);
  const numericId = parseNumericOrgId(args.orgId);

  if (!orgNameHint && numericId == null) {
    return { resolvedOrg: null };
  }

  const orgs = await loadOrganizations();

  if (orgNameHint) {
    const match = matchBusinessEntityByName(orgs, orgNameHint);
    if (match.status === "resolved") {
      return { resolvedOrg: { orgId: match.orgId, orgName: match.orgName } };
    }
    if (match.status === "ambiguous") {
      return {
        resolvedOrg: null,
        error: formatBusinessEntityAmbiguityMessage(match.query, match.candidates),
        choice: businessEntityChoiceFromCandidates(match.query, match.candidates) || undefined,
      };
    }
    return {
      resolvedOrg: null,
      error: formatBusinessEntityNotFoundMessage(match.query),
    };
  }

  const found = findOrganizationById(orgs, numericId!);
  if (!found) {
    return {
      resolvedOrg: null,
      error: `I couldn't find a Business Entity with id ${numericId}. Please provide the Business Entity by name.`,
    };
  }
  return { resolvedOrg: { orgId: found.id, orgName: found.name } };
}

async function resolveDirectPoBudget(
  args: any,
  sessionUser?: any,
): Promise<{
  resolvedBudget: { budgetId: number; budgetName: string } | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  let nameHint: string | null =
    (typeof args.budgetName === "string" && args.budgetName.trim()) ||
    (!isCanonicalNumericId(args.budgetId) && args.budgetId != null && String(args.budgetId).trim()
      ? String(args.budgetId).trim()
      : null);
  let numericId = isCanonicalNumericId(args.budgetId) ? Number(args.budgetId) : null;

  // Clickable option prompts embedded in budgetName / turn prompt: "Use budgetId 98"
  if (numericId == null) {
    const fromName = nameHint ? extractBudgetIdFromPrompt(nameHint) : null;
    const fromTurn =
      typeof args._turnPrompt === "string" ? extractBudgetIdFromPrompt(args._turnPrompt) : null;
    const extracted = fromName ?? fromTurn;
    if (extracted != null) {
      numericId = extracted;
      // Name is only a prompt wrapper — do not re-run ambiguous name matching.
      if (fromName != null) nameHint = null;
    }
  }

  // Ordinal / id reply against the last ambiguous list (e.g. user said "1" or "58")
  // Prefer numeric id / ordinal over ambiguous display name when LLM passes both.
  const remembered = getRememberedBudgetAmbiguity(sessionUser);
  const selectionHints: string[] = [];
  if (nameHint && isOrdinalChoice(nameHint) != null) selectionHints.push(nameHint);
  if (numericId != null) selectionHints.push(String(numericId));
  if (nameHint && !selectionHints.includes(nameHint)) selectionHints.push(nameHint);

  for (const selectionHint of selectionHints) {
    const picked = pickBudgetFromCandidates(selectionHint, remembered);
    if (picked) {
      clearBudgetAmbiguity(sessionUser);
      return {
        resolvedBudget: { budgetId: picked.budgetId, budgetName: picked.budgetName },
      };
    }
  }

  const lines = await loadApprovedBudgetLines();

  // No explicit budget from the user/LLM — leave unresolved (recommend flow handles matching).
  if (!nameHint && numericId == null) {
    return { resolvedBudget: null };
  }

  // Prefer explicit numeric budgetId even when the LLM also sends an ambiguous budgetName.
  if (numericId != null) {
    const found = findBudgetById(lines, numericId);
    if (found) {
      clearBudgetAmbiguity(sessionUser);
      return { resolvedBudget: { budgetId: found.budgetId, budgetName: found.budgetName } };
    }
    // May be an ordinal with no remembered list, or unknown id
    if (isOrdinalChoice(String(numericId)) != null && !nameHint) {
      return {
        resolvedBudget: null,
        error:
          `I don't have a recent budget shortlist to apply option ${numericId}. ` +
          `Please search budgets again (e.g. search_budgets) and reply with the option number or budgetId.`,
      };
    }
    if (!nameHint) {
      return {
        resolvedBudget: null,
        error: `I couldn't find a Budget with id ${numericId}. Please provide the Budget by name or code.`,
      };
    }
    // Numeric id unknown but a name was also provided — fall through to name matching.
  }

  if (nameHint) {
    // Ordinal-only reply without going through name match noise
    if (isOrdinalChoice(nameHint) != null) {
      const picked = pickBudgetFromCandidates(nameHint, remembered);
      if (picked) {
        clearBudgetAmbiguity(sessionUser);
        return {
          resolvedBudget: { budgetId: picked.budgetId, budgetName: picked.budgetName },
        };
      }
      return {
        resolvedBudget: null,
        error:
          `I don't have a recent budget shortlist to apply option ${nameHint}. ` +
          `Please search budgets again and reply with the option number or budgetId from the list.`,
      };
    }

    const match = matchBudget(lines, nameHint);
    if (match.status === "resolved") {
      clearBudgetAmbiguity(sessionUser);
      return { resolvedBudget: { budgetId: match.budgetId, budgetName: match.budgetName } };
    }
    if (match.status === "ambiguous") {
      rememberBudgetAmbiguity(sessionUser, match.candidates);
      return {
        resolvedBudget: null,
        error: formatBudgetAmbiguity(match.query, match.candidates),
        choice: budgetChoiceFromCandidates(match.query, match.candidates) || undefined,
      };
    }

    return { resolvedBudget: null, error: formatBudgetNotFound(nameHint) };
  }

  return { resolvedBudget: null };
}

async function resolveDirectPoDepartment(args: any): Promise<{
  resolvedDepartment: { departmentId: number; departmentName: string } | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  const nameHint =
    (typeof args.requestorDepartmentName === "string" && args.requestorDepartmentName.trim()) ||
    (!isCanonicalNumericId(args.requestorDepartment) &&
    args.requestorDepartment != null &&
    String(args.requestorDepartment).trim()
      ? String(args.requestorDepartment).trim()
      : null);
  const numericId = isCanonicalNumericId(args.requestorDepartment)
    ? Number(args.requestorDepartment)
    : null;

  if (!nameHint && numericId == null) return { resolvedDepartment: null };

  const depts = await loadDepartments();
  if (nameHint) {
    const match = matchDepartment(depts, nameHint);
    if (match.status === "resolved") {
      return {
        resolvedDepartment: {
          departmentId: match.departmentId,
          departmentName: match.departmentName,
        },
      };
    }
    if (match.status === "ambiguous") {
      return {
        resolvedDepartment: null,
        error: formatDepartmentAmbiguity(match.query, match.candidates),
        choice: departmentChoiceFromCandidates(match.query, match.candidates) || undefined,
      };
    }
    return { resolvedDepartment: null, error: formatDepartmentNotFound(match.query) };
  }

  const found = findDepartmentById(depts, numericId!);
  if (!found) {
    return {
      resolvedDepartment: null,
      error: `I couldn't find a Department with id ${numericId}. Please provide the Department by name.`,
    };
  }
  return {
    resolvedDepartment: {
      departmentId: found.departmentId,
      departmentName: found.departmentName,
    },
  };
}

async function resolveDirectPoLocation(args: any): Promise<{
  resolvedLocation: { locationId: number; locationName: string } | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  const nameHint =
    (typeof args.deliveryLocationName === "string" && args.deliveryLocationName.trim()) ||
    (!isCanonicalNumericId(args.deliveryLocation) &&
    args.deliveryLocation != null &&
    String(args.deliveryLocation).trim()
      ? String(args.deliveryLocation).trim()
      : null);
  const numericId = isCanonicalNumericId(args.deliveryLocation)
    ? Number(args.deliveryLocation)
    : null;

  if (!nameHint && numericId == null) return { resolvedLocation: null };

  const locations = await loadLocations();
  if (nameHint) {
    const match = matchLocation(locations, nameHint);
    if (match.status === "resolved") {
      return {
        resolvedLocation: { locationId: match.locationId, locationName: match.locationName },
      };
    }
    if (match.status === "ambiguous") {
      return {
        resolvedLocation: null,
        error: formatLocationAmbiguity(match.query, match.candidates),
        choice: locationChoiceFromCandidates(match.query, match.candidates) || undefined,
      };
    }
    return { resolvedLocation: null, error: formatLocationNotFound(match.query) };
  }

  const found = findLocationById(locations, numericId!);
  if (!found) {
    return {
      resolvedLocation: null,
      error: `I couldn't find a Delivery Location with id ${numericId}. Please provide the location by name.`,
    };
  }
  return {
    resolvedLocation: { locationId: found.locationId, locationName: found.locationName },
  };
}

async function resolveDirectPoPaymentTerms(args: any): Promise<{
  resolvedPaymentTerms: { paymentTermsId: string; paymentTermsName: string } | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  const nameHint =
    (typeof args.paymentTermsName === "string" && args.paymentTermsName.trim()) ||
    (args.paymentTermsId != null &&
    String(args.paymentTermsId).trim() &&
    !isCanonicalNumericId(args.paymentTermsId) &&
    (/\s/.test(String(args.paymentTermsId)) ||
      /days/i.test(String(args.paymentTermsId)) ||
      /^net\s/i.test(String(args.paymentTermsId)))
      ? String(args.paymentTermsId).trim()
      : null);
  const idHint =
    args.paymentTermsId != null && String(args.paymentTermsId).trim() && !nameHint
      ? String(args.paymentTermsId).trim()
      : null;

  const terms = await loadPaymentTerms();

  if (nameHint) {
    const match = matchPaymentTerms(terms, nameHint);
    if (match.status === "resolved") {
      return {
        resolvedPaymentTerms: {
          paymentTermsId: match.paymentTermsId,
          paymentTermsName: match.paymentTermsName,
        },
      };
    }
    if (match.status === "ambiguous") {
      return {
        resolvedPaymentTerms: null,
        error: formatPaymentTermsAmbiguity(match.query, match.candidates),
        choice: paymentTermsChoiceFromCandidates(match.query, match.candidates) || undefined,
      };
    }
    return { resolvedPaymentTerms: null, error: formatPaymentTermsNotFound(match.query) };
  }

  if (idHint) {
    const found = findPaymentTermsById(terms, idHint);
    if (!found) {
      // Try as name/code via matcher
      const match = matchPaymentTerms(terms, idHint);
      if (match.status === "resolved") {
        return {
          resolvedPaymentTerms: {
            paymentTermsId: match.paymentTermsId,
            paymentTermsName: match.paymentTermsName,
          },
        };
      }
      if (match.status === "ambiguous") {
        return {
          resolvedPaymentTerms: null,
          error: formatPaymentTermsAmbiguity(match.query, match.candidates),
          choice: paymentTermsChoiceFromCandidates(match.query, match.candidates) || undefined,
        };
      }
      return {
        resolvedPaymentTerms: null,
        error: `I couldn't find Payment Terms "${idHint}". Please provide a valid term name (e.g. Net 30).`,
      };
    }
    return {
      resolvedPaymentTerms: {
        paymentTermsId: found.paymentTermsId,
        paymentTermsName: found.paymentTermsName,
      },
    };
  }

  // Admin Payment Settings default when user didn't specify
  try {
    const orgDetails = await adminService.getOrgDetails();
    const defaultCode = (orgDetails as any)?.default_paymentterms;
    const def = resolveDefaultPaymentTerms(terms, defaultCode);
    if (def) {
      return {
        resolvedPaymentTerms: {
          paymentTermsId: def.paymentTermsId,
          paymentTermsName: def.paymentTermsName,
        },
      };
    }
  } catch {
    // ignore — leave unresolved
  }

  return { resolvedPaymentTerms: null };
}

/**
 * When Budget is resolved and user did not supply BE/Dept/Location, derive from the
 * approved budget line (same eligibility fields the manual form filters on).
 * Single-valued ids auto-resolve; multi-valued lists ask the user to choose among
 * the budget's options (never invent ids).
 */
async function deriveFieldsFromBudget(
  budgetId: number | null | undefined,
  current: {
    resolvedOrg: { orgId: number; orgName: string } | null;
    resolvedDepartment: { departmentId: number; departmentName: string } | null;
    resolvedLocation: { locationId: number; locationName: string } | null;
  },
  autoSuggest = false,
): Promise<{
  resolvedOrg: { orgId: number; orgName: string } | null;
  resolvedDepartment: { departmentId: number; departmentName: string } | null;
  resolvedLocation: { locationId: number; locationName: string } | null;
  budgetCurrency?: string | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  if (budgetId == null || !Number.isFinite(Number(budgetId))) {
    return { ...current };
  }

  const lines = await loadApprovedBudgetLines();
  const line = uniqueBudgetLines(lines).find((l) => Number(l.id) === Number(budgetId));
  if (!line) return { ...current };

  let resolvedOrg = current.resolvedOrg;
  let resolvedDepartment = current.resolvedDepartment;
  let resolvedLocation = current.resolvedLocation;

  if (!resolvedOrg) {
    const beRaw = String(line.business_entity || "").trim();
    const beParts = beRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (beParts.length === 1 && isCanonicalNumericId(beParts[0])) {
      const orgs = await loadOrganizations();
      const found = findOrganizationById(orgs, Number(beParts[0]));
      if (found) resolvedOrg = { orgId: found.id, orgName: found.name };
    } else if (beParts.length > 1) {
      const orgs = await loadOrganizations();
      const candidates = beParts
        .filter((p) => isCanonicalNumericId(p))
        .map((p) => findOrganizationById(orgs, Number(p)))
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => ({ id: o.id, name: o.name, currency: o.currency }));
      if (candidates.length === 1) {
        resolvedOrg = { orgId: candidates[0].id, orgName: candidates[0].name };
      } else if (candidates.length > 1) {
        if (autoSuggest) {
          resolvedOrg = { orgId: candidates[0].id, orgName: candidates[0].name };
        } else {
          return {
            resolvedOrg: null,
            resolvedDepartment,
            resolvedLocation,
            budgetCurrency: line.budget_curr ? String(line.budget_curr) : null,
            error: formatBusinessEntityAmbiguityMessage("budget", candidates),
            choice: businessEntityChoiceFromCandidates("budget", candidates) || undefined,
          };
        }
      }
    }
  }

  if (!resolvedDepartment) {
    const deptRaw = String(line.dept_id || "").trim();
    const deptParts = deptRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (deptParts.length === 1 && isCanonicalNumericId(deptParts[0])) {
      const depts = await loadDepartments();
      const found = findDepartmentById(depts, Number(deptParts[0]));
      if (found) {
        resolvedDepartment = {
          departmentId: found.departmentId,
          departmentName: found.departmentName,
        };
      }
    } else if (deptParts.length > 1) {
      const depts = await loadDepartments();
      const candidates = deptParts
        .filter((p) => isCanonicalNumericId(p))
        .map((p) => findDepartmentById(depts, Number(p)))
        .filter((d): d is NonNullable<typeof d> => !!d);
      if (candidates.length === 1) {
        resolvedDepartment = {
          departmentId: candidates[0].departmentId,
          departmentName: candidates[0].departmentName,
        };
      } else if (candidates.length > 1) {
        if (autoSuggest) {
          resolvedDepartment = {
            departmentId: candidates[0].departmentId,
            departmentName: candidates[0].departmentName,
          };
        } else {
          return {
            resolvedOrg,
            resolvedDepartment: null,
            resolvedLocation,
            budgetCurrency: line.budget_curr ? String(line.budget_curr) : null,
            error: formatDepartmentAmbiguity("budget", candidates),
            choice: departmentChoiceFromCandidates("budget", candidates) || undefined,
          };
        }
      }
    }
  }

  if (!resolvedLocation) {
    const locRaw = String(line.loc_id || "").trim();
    const locParts = locRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (locParts.length === 1 && isCanonicalNumericId(locParts[0])) {
      const locations = await loadLocations();
      const found = findLocationById(locations, Number(locParts[0]));
      if (found) {
        resolvedLocation = {
          locationId: found.locationId,
          locationName: found.locationName,
        };
      }
    } else if (locParts.length > 1) {
      const locations = await loadLocations();
      const candidates = locParts
        .filter((p) => isCanonicalNumericId(p))
        .map((p) => findLocationById(locations, Number(p)))
        .filter((l): l is NonNullable<typeof l> => !!l);
      if (candidates.length === 1) {
        resolvedLocation = {
          locationId: candidates[0].locationId,
          locationName: candidates[0].locationName,
        };
      } else if (candidates.length > 1) {
        if (autoSuggest) {
          resolvedLocation = {
            locationId: candidates[0].locationId,
            locationName: candidates[0].locationName,
          };
        } else {
          return {
            resolvedOrg,
            resolvedDepartment,
            resolvedLocation: null,
            budgetCurrency: line.budget_curr ? String(line.budget_curr) : null,
            error: formatLocationAmbiguity("budget", candidates),
            choice: locationChoiceFromCandidates("budget", candidates) || undefined,
          };
        }
      }
    }
  }

  return {
    resolvedOrg,
    resolvedDepartment,
    resolvedLocation,
    budgetCurrency: line.budget_curr ? String(line.budget_curr) : null,
  };
}

async function resolveDefaultCurrency(): Promise<string | null> {
  try {
    const orgDetails = await adminService.getOrgDetails();
    const c = String((orgDetails as any)?.currency || "").trim();
    return c || null;
  } catch {
    return null;
  }
}

/**
 * Resolve buyer from prior POs for the same supplier and/or requestor when unambiguous.
 * Prefers the most recent relevant buyer. Asks when multiple equally valid buyers appear.
 * Falls back to session user only when no PO history buyers are found (manual Create PO parity).
 */
async function resolveDirectPoBuyer(
  args: any,
  sessionUser?: any,
  supplierId?: number | null,
  supplierName?: string | null,
): Promise<{
  resolvedBuyer: { buyerId: string | number; buyerName: string; buyerEmail?: string | null } | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  // Clickable "Use buyer …" from a prior shortlist
  const fromTurn =
    typeof args._turnPrompt === "string" ? extractBuyerNameFromPrompt(args._turnPrompt) : null;
  const buyerNameHint =
    fromTurn ||
    (typeof args.buyerName === "string" && args.buyerName.trim() ? args.buyerName.trim() : null);

  if (buyerNameHint) {
    const remembered = getRememberedBuyerAmbiguity(sessionUser);
    const needle = buyerNameHint.toLowerCase();
    const hit = remembered.find((b) => b.buyerName.toLowerCase() === needle);
    if (hit) {
      clearBuyerAmbiguity(sessionUser);
      return {
        resolvedBuyer: {
          buyerId: hit.buyerId,
          buyerName: hit.buyerName,
          buyerEmail: hit.buyerEmail ?? null,
        },
      };
    }
  }

  if (args.buyerId != null && String(args.buyerId).trim() !== "") {
    clearBuyerAmbiguity(sessionUser);
    return {
      resolvedBuyer: {
        buyerId: args.buyerId,
        buyerName: String(args.buyerName || "").trim() || String(args.buyerId),
        buyerEmail: args.buyerEmail ?? null,
      },
    };
  }

  if (buyerNameHint && !fromTurn) {
    // Name without id and not from a remembered shortlist — ask rather than invent
    return {
      resolvedBuyer: null,
      error:
        `I need the Buyer identified uniquely. You mentioned "${buyerNameHint}". ` +
        `Please confirm the buyer (or I can use your session user if that is intended).`,
    };
  }

  type BuyerRow = {
    buyerId: string | number;
    buyerName: string;
    buyerEmail?: string | null;
    creationDate?: string | null;
    score: number;
  };
  const collected: BuyerRow[] = [];

  async function collectFromPoRows(rows: any[], scoreBoost: number) {
    for (const r of rows) {
      const name = String(r.buyer_name || "").trim();
      if (!name) continue;
      let buyerId: string | number | null = r.buyer ?? r.buyer_id ?? null;
      let buyerEmail: string | null = r.buyer_email ?? null;
      // List rows often lack buyer id — hydrate from detail for uniqueness
      if (buyerId == null && r.po_number) {
        try {
          const detail = await procService.getPurchaseOrderDetail(String(r.po_number));
          const h = detail as any;
          buyerId = h?.buyer ?? h?.buyer_id ?? null;
          buyerEmail = h?.buyer_email ?? buyerEmail;
        } catch {
          // keep name-only; cannot use without id
        }
      }
      if (buyerId == null) continue;
      collected.push({
        buyerId,
        buyerName: name,
        buyerEmail,
        creationDate: r.creation_date ?? null,
        score: scoreBoost,
      });
    }
  }

  try {
    // Prefer recent POs for the same supplier
    if (supplierId != null && Number.isFinite(Number(supplierId))) {
      const query: any = { page: "1", limit: "25" };
      if (supplierName) query.search = String(supplierName);
      const result = await procService.getPurchaseOrders(query, sessionUser || {});
      const rows = ((result as any).data || []).filter(
        (r: any) => Number(r.supplier_id) === Number(supplierId),
      );
      await collectFromPoRows(rows, 3);
    }

    // Also consider recent POs for the same requestor (session user)
    if (sessionUser?.id != null && collected.length === 0) {
      const reqName =
        String(sessionUser.name || sessionUser.userName || "").trim() || null;
      const query: any = { page: "1", limit: "25" };
      if (reqName) query.search = reqName;
      const result = await procService.getPurchaseOrders(query, sessionUser || {});
      const rows = ((result as any).data || []) as any[];
      await collectFromPoRows(rows, 2);
    }
  } catch {
    // fall through
  }

  if (collected.length > 0) {
    // Prefer highest score, then most recent
    collected.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = a.creationDate ? Date.parse(String(a.creationDate)) : 0;
      const db = b.creationDate ? Date.parse(String(b.creationDate)) : 0;
      return db - da;
    });

    const byName = new Map<string, BuyerRow>();
    for (const row of collected) {
      const key = row.buyerName.toLowerCase();
      if (!byName.has(key)) byName.set(key, row);
    }

    if (byName.size === 1) {
      const only = Array.from(byName.values())[0];
      clearBuyerAmbiguity(sessionUser);
      return {
        resolvedBuyer: {
          buyerId: only.buyerId,
          buyerName: only.buyerName,
          buyerEmail: only.buyerEmail ?? null,
        },
      };
    }

    const unique = Array.from(byName.values());
    rememberBuyerAmbiguity(
      sessionUser,
      unique.map((u) => ({
        buyerId: u.buyerId,
        buyerName: u.buyerName,
        buyerEmail: u.buyerEmail ?? null,
      })),
    );
    const names = unique.map((u) => u.buyerName);
    return {
      resolvedBuyer: null,
      error:
        `I found multiple Buyers on recent POs for this request. Which one should I use?\n\n` +
        names.map((n, i) => `${i + 1}. **${n}**`).join("\n") +
        `\n\nReply with the Buyer name or click an option.`,
      choice: buyerChoiceFromNames(names) || undefined,
    };
  }

  // No reliable PO-history match — use session user (same as manual Create PO injection)
  if (sessionUser?.id != null) {
    clearBuyerAmbiguity(sessionUser);
    return {
      resolvedBuyer: {
        buyerId: sessionUser.id,
        buyerName:
          String(sessionUser.name || sessionUser.userName || "").trim() ||
          String(sessionUser.id),
        buyerEmail: sessionUser.email ?? null,
      },
    };
  }

  return {
    resolvedBuyer: null,
    error: "I couldn't determine the Buyer from previous POs or your session. Please provide the Buyer.",
  };
}

async function resolveAllDirectPoLookups(
  args: any,
  sessionUser?: any,
): Promise<{
  resolvedOrg: { orgId: number; orgName: string } | null;
  resolvedBudget: { budgetId: number; budgetName: string } | null;
  resolvedDepartment: { departmentId: number; departmentName: string } | null;
  resolvedLocation: { locationId: number; locationName: string } | null;
  resolvedPaymentTerms: { paymentTermsId: string; paymentTermsName: string } | null;
  resolvedBuyer: { buyerId: string | number; buyerName: string; buyerEmail?: string | null } | null;
  defaultCurrency: string | null;
  budgetCurrency?: string | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  const empty = {
    resolvedOrg: null as { orgId: number; orgName: string } | null,
    resolvedBudget: null as { budgetId: number; budgetName: string } | null,
    resolvedDepartment: null as {
      departmentId: number;
      departmentName: string;
    } | null,
    resolvedLocation: null as { locationId: number; locationName: string } | null,
    resolvedPaymentTerms: null as {
      paymentTermsId: string;
      paymentTermsName: string;
    } | null,
    resolvedBuyer: null as {
      buyerId: string | number;
      buyerName: string;
      buyerEmail?: string | null;
    } | null,
    defaultCurrency: null as string | null,
    budgetCurrency: null as string | null,
  };

  const org = await resolveDirectPoBusinessEntity(args);
  if (org.error) return { ...empty, error: org.error, choice: org.choice };

  const budget = await resolveDirectPoBudget(args, sessionUser);
  if (budget.error) {
    return {
      ...empty,
      resolvedOrg: org.resolvedOrg,
      error: budget.error,
      choice: budget.choice,
    };
  }

  let dept = await resolveDirectPoDepartment(args);
  if (dept.error) {
    return {
      ...empty,
      resolvedOrg: org.resolvedOrg,
      resolvedBudget: budget.resolvedBudget,
      error: dept.error,
      choice: dept.choice,
    };
  }

  let loc = await resolveDirectPoLocation(args);
  if (loc.error) {
    return {
      ...empty,
      resolvedOrg: org.resolvedOrg,
      resolvedBudget: budget.resolvedBudget,
      resolvedDepartment: dept.resolvedDepartment,
      error: loc.error,
      choice: loc.choice,
    };
  }

  // Prefer budget-derived BE / Dept / Location when user did not resolve them.
  const derived = await deriveFieldsFromBudget(
    budget.resolvedBudget?.budgetId,
    {
      resolvedOrg: org.resolvedOrg,
      resolvedDepartment: dept.resolvedDepartment,
      resolvedLocation: loc.resolvedLocation,
    },
    !!args._autoSuggest,
  );
  if (derived.error) {
    return {
      ...empty,
      resolvedOrg: derived.resolvedOrg,
      resolvedBudget: budget.resolvedBudget,
      resolvedDepartment: derived.resolvedDepartment,
      resolvedLocation: derived.resolvedLocation,
      error: derived.error,
      choice: derived.choice,
    };
  }

  const pt = await resolveDirectPoPaymentTerms(args);
  if (pt.error) {
    return {
      ...empty,
      resolvedOrg: derived.resolvedOrg,
      resolvedBudget: budget.resolvedBudget,
      resolvedDepartment: derived.resolvedDepartment,
      resolvedLocation: derived.resolvedLocation,
      error: pt.error,
      choice: pt.choice,
    };
  }

  const supplierIdNum =
    args.supplierId != null && args.supplierId !== "" && Number.isFinite(Number(args.supplierId))
      ? Number(args.supplierId)
      : null;
  const buyer = await resolveDirectPoBuyer(
    args,
    sessionUser,
    supplierIdNum,
    args.supplierName ? String(args.supplierName) : null,
  );
  if (buyer.error) {
    return {
      ...empty,
      resolvedOrg: derived.resolvedOrg,
      resolvedBudget: budget.resolvedBudget,
      resolvedDepartment: derived.resolvedDepartment,
      resolvedLocation: derived.resolvedLocation,
      resolvedPaymentTerms: pt.resolvedPaymentTerms,
      error: buyer.error,
      choice: buyer.choice,
    };
  }

  const orgDefaultCurrency = await resolveDefaultCurrency();
  // Prefer budget-derived currency (description-first), then Admin org default.
  const defaultCurrency =
    (derived.budgetCurrency ? String(derived.budgetCurrency) : null) || orgDefaultCurrency;

  return {
    resolvedOrg: derived.resolvedOrg,
    resolvedBudget: budget.resolvedBudget,
    resolvedDepartment: derived.resolvedDepartment,
    resolvedLocation: derived.resolvedLocation,
    resolvedPaymentTerms: pt.resolvedPaymentTerms,
    resolvedBuyer: buyer.resolvedBuyer,
    defaultCurrency,
    budgetCurrency: derived.budgetCurrency ? String(derived.budgetCurrency) : null,
  };
}

/**
 * Loads a PO for one of the edit tools and applies the gates the PO detail page applies:
 * it must exist, and it must be Draft or More Info Required.
 */
async function loadPoForEdit(
  poNumber: string,
): Promise<{ po: any; lines: any[] } | { error: string }> {
  const number = String(poNumber || "").trim();
  if (!number) return { error: "Please tell me which purchase order to update (e.g. PO_00058)." };

  const detail = (await procService.getPurchaseOrderDetail(number)) as any;
  if (!detail) return { error: `No purchase order found with number ${number}.` };

  const statusBlocked = poStatusBlocksEditMessage(detail);
  if (statusBlocked) return { error: statusBlocked };

  return { po: detail, lines: Array.isArray(detail.items) ? detail.items : [] };
}

/**
 * The requisition twin of loadPoForEdit: visibility, existence and the
 * status gate, plus the currency the preview quotes its totals in.
 */
async function loadPrForEdit(
  prNumber: string,
  sessionUser: any,
): Promise<{ prNumber: string; currency: string; lines: any[] } | { error: string }> {
  const number = String(prNumber || "").trim();
  if (!number) return { error: "Please tell me which requisition to update (e.g. PR_00076)." };

  const denied = await denyIfPrHidden(number, sessionUser);
  if (denied) return { error: denied.result };

  const detail = (await procService.getRequisitionDetail(number)) as any;
  if (!detail?.header) return { error: prNotFoundMessage(number) };

  const statusBlocked = prStatusBlocksEditMessage(detail.header);
  if (statusBlocked) return { error: statusBlocked };

  return {
    prNumber: String(detail.header.pr_number ?? number),
    currency: String(detail.header.currency ?? "").trim(),
    lines: Array.isArray(detail.lines) ? detail.lines : [],
  };
}

/**
 * Resolves a vendor for an edit by name or id, the same way the Vendor field on the edit
 * sheet does — pick from the supplier list, never invent an id.
 */
async function resolvePoEditVendor(args: any): Promise<{
  resolvedVendor: { supplierId: string; supplierName: string } | null;
  error?: string;
  choice?: AgentChoiceSpec;
}> {
  const numericId = isCanonicalNumericId(args.supplierId) ? String(args.supplierId).trim() : null;
  const nameHint =
    (typeof args.vendorName === "string" && args.vendorName.trim()) ||
    (typeof args.supplierName === "string" && args.supplierName.trim()) ||
    (!numericId && args.supplierId != null && String(args.supplierId).trim()
      ? String(args.supplierId).trim()
      : null);

  if (numericId) {
    const supplier = (await vendorService.getDboSupplier(numericId)) as any;
    if (!supplier) {
      return {
        resolvedVendor: null,
        error: `I couldn't find a vendor with ID ${numericId}. Please give me the vendor name instead.`,
      };
    }
    return {
      resolvedVendor: {
        supplierId: numericId,
        supplierName:
          supplier.companyName || supplier.company_name || supplier.supplier_name || `Vendor ${numericId}`,
      },
    };
  }

  if (!nameHint) return { resolvedVendor: null };

  const result = (await vendorService.getDboSuppliersPaginated({
    page: 1,
    limit: 100,
    search: nameHint,
  })) as any;
  const rows = (result?.data || []) as any[];

  const match = matchByLabels(rows, nameHint, (row: any) => [
    row.companyName || "",
    row.company_name || "",
    row.supplier_name || "",
  ]);

  if (match.status === "resolved") {
    const row: any = match.item;
    return {
      resolvedVendor: {
        supplierId: String(row.id),
        supplierName: row.companyName || row.company_name || row.supplier_name || nameHint,
      },
    };
  }
  if (match.status === "ambiguous") {
    return {
      resolvedVendor: null,
      error:
        `I found more than one vendor matching "${nameHint}". Which one should I put on the PO?\n\n` +
        match.candidates
          .map(
            (row: any, i: number) =>
              `${i + 1}. **${row.companyName || row.company_name || row.supplier_name}** (ID: ${row.id})`,
          )
          .join("\n"),
      choice: vendorChoiceFromRows(nameHint, match.candidates as any[]) || undefined,
    };
  }

  return {
    resolvedVendor: null,
    error: `I couldn't find a vendor called "${nameHint}". Use search_vendors to see the registered vendors.`,
  };
}

interface PoHeaderEditResolution {
  /** Only the keys that change, for procService.updatePurchaseOrder's partial body. */
  body: Record<string, unknown>;
  changes: PoFieldChange[];
  error?: string;
  choice?: AgentChoiceSpec;
}

/**
 * Turns "change the supplier to Acme, and the currency to USD" into the partial body
 * updatePurchaseOrder expects, resolving every name against the same lists the Create PO
 * and Edit PO forms use. Refuses fields this PO does not own before resolving anything.
 */
async function resolvePoHeaderEdit(
  po: any,
  args: any,
  sessionUser?: any,
): Promise<PoHeaderEditResolution> {
  const body: Record<string, unknown> = {};
  const changes: PoFieldChange[] = [];
  const requested: PoHeaderField[] = [];

  const wantsVendor =
    poEditFieldSupplied(args.vendorName) ||
    poEditFieldSupplied(args.supplierName) ||
    poEditFieldSupplied(args.supplierId);
  const wantsPaymentTerms =
    poEditFieldSupplied(args.paymentTermsName) || poEditFieldSupplied(args.paymentTermsId);
  const wantsLocation =
    poEditFieldSupplied(args.deliveryLocationName) || poEditFieldSupplied(args.deliveryLocation);
  const wantsDepartment =
    poEditFieldSupplied(args.requestorDepartmentName) ||
    poEditFieldSupplied(args.requestorDepartment);
  const wantsOrg = poEditFieldSupplied(args.orgName) || poEditFieldSupplied(args.orgId);
  const wantsBudget = poEditFieldSupplied(args.budgetName) || poEditFieldSupplied(args.budgetId);

  if (poEditFieldSupplied(args.description)) requested.push("description");
  if (poEditFieldSupplied(args.needByDate)) requested.push("requiredDate");
  if (poEditFieldSupplied(args.currency)) requested.push("currency");
  if (args.notes !== undefined) requested.push("notes");
  if (wantsVendor) requested.push("vendor");
  if (wantsPaymentTerms) requested.push("paymentTerms");
  if (wantsLocation) requested.push("deliveryLocation");
  if (wantsDepartment) requested.push("department");
  if (wantsOrg) requested.push("businessEntity");
  if (wantsBudget) requested.push("budget");
  if (args.advanceFlag !== undefined) requested.push("advance");

  if (requested.length === 0) {
    return {
      body,
      changes,
      error:
        `Tell me what to change on **${po.po_number}** — I can update the description, vendor, ` +
        `need-by date, currency, delivery location, department, business entity, budget, ` +
        `payment terms, notes or the advance payment.`,
    };
  }

  const locked = lockedPoFieldsMessage(po, requested);
  if (locked) return { body, changes, error: locked };

  if (poEditFieldSupplied(args.description)) {
    const description = poEditText(args.description)!;
    body.description = description;
    changes.push({ label: "Description", from: poEditText(po.po_description), to: description });
  }

  if (poEditFieldSupplied(args.needByDate)) {
    const parsed = parseNeedByDate(String(args.needByDate));
    if (!parsed) {
      return {
        body,
        changes,
        error: `I couldn't read "${args.needByDate}" as a date. Give me a date like 2026-09-30.`,
      };
    }
    body.requiredDate = parsed;
    changes.push({
      label: "Need By Date",
      from: po.po_required_date ? new Date(po.po_required_date).toLocaleDateString() : null,
      to: parsed,
    });
  }

  if (poEditFieldSupplied(args.currency)) {
    const currency = poEditText(args.currency)!.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return {
        body,
        changes,
        error: `"${args.currency}" is not a currency code. Use a three-letter code such as INR or AED.`,
      };
    }
    body.currency = currency;
    changes.push({ label: "Currency", from: poEditText(po.po_currency), to: currency });
  }

  if (args.notes !== undefined) {
    const notes = poEditText(args.notes);
    body.notes = notes ?? "";
    changes.push({ label: "Notes", from: poEditText(po.po_notes), to: notes ?? "_cleared_" });
  }

  if (wantsVendor) {
    const vendor = await resolvePoEditVendor(args);
    if (vendor.error) return { body, changes, error: vendor.error, choice: vendor.choice };
    if (vendor.resolvedVendor) {
      body.supplierId = vendor.resolvedVendor.supplierId;
      body.supplierName = vendor.resolvedVendor.supplierName;
      changes.push({
        label: "Vendor",
        from: poEditText(po.company_name),
        to: vendor.resolvedVendor.supplierName,
      });
    }
  }

  if (wantsPaymentTerms) {
    const terms = await resolveDirectPoPaymentTerms(args);
    if (terms.error) return { body, changes, error: terms.error, choice: terms.choice };
    if (terms.resolvedPaymentTerms) {
      body.paymentTermsId = terms.resolvedPaymentTerms.paymentTermsId;
      body.paymentTermsName = terms.resolvedPaymentTerms.paymentTermsName;
      changes.push({
        label: "Payment Terms",
        from: poEditText(po.payment_terms_name),
        to: terms.resolvedPaymentTerms.paymentTermsName,
      });
    }
  }

  if (wantsLocation) {
    const location = await resolveDirectPoLocation(args);
    if (location.error) return { body, changes, error: location.error, choice: location.choice };
    if (location.resolvedLocation) {
      body.deliveryLocation = String(location.resolvedLocation.locationId);
      changes.push({
        label: "Delivery Location",
        from: poEditText(po.delivertto_location_name),
        to: location.resolvedLocation.locationName,
      });
    }
  }

  if (wantsDepartment) {
    const department = await resolveDirectPoDepartment(args);
    if (department.error) {
      return { body, changes, error: department.error, choice: department.choice };
    }
    if (department.resolvedDepartment) {
      body.requestorDepartment = String(department.resolvedDepartment.departmentId);
      changes.push({
        label: "Department",
        from: poEditText(po.department_name),
        to: department.resolvedDepartment.departmentName,
      });
    }
  }

  if (wantsOrg) {
    const org = await resolveDirectPoBusinessEntity(args);
    if (org.error) return { body, changes, error: org.error, choice: org.choice };
    if (org.resolvedOrg) {
      body.orgId = org.resolvedOrg.orgId;
      changes.push({ label: "Business Entity", from: null, to: org.resolvedOrg.orgName });
    }
  }

  if (wantsBudget) {
    const budget = await resolveDirectPoBudget(args, sessionUser);
    if (budget.error) return { body, changes, error: budget.error, choice: budget.choice };
    if (budget.resolvedBudget) {
      body.budgetId = String(budget.resolvedBudget.budgetId);
      body.budgetName = budget.resolvedBudget.budgetName;
      changes.push({
        label: "Budget",
        from: poEditText(po.budget_name),
        to: budget.resolvedBudget.budgetName,
      });
    }
  }

  if (args.advanceFlag !== undefined) {
    const flag = args.advanceFlag === true || String(args.advanceFlag).toLowerCase() === "true";
    const percentage = poEditText(args.advancePercentage);
    if (flag && !percentage) {
      return {
        body,
        changes,
        error: "An advance payment needs a percentage — how much of the PO value is paid up front?",
      };
    }
    body.advanceFlag = flag;
    body.advancePercentage = flag ? percentage : null;
    changes.push({
      label: "Advance Payment",
      from: po.advance_flag === "Y" ? `${po.advance_percentage ?? ""}%`.trim() : "none",
      to: flag ? `${percentage}%` : "none",
    });
  }

  if (Object.keys(body).length === 0) {
    return {
      body,
      changes,
      error: `I couldn't work out any change to make to **${po.po_number}**. Could you rephrase it?`,
    };
  }

  return { body, changes };
}

/** Fire-and-forget audit entry for writes performed by the agent. */
function audit(sessionUser: any, auditKey: string, auditAction: string, auditMessage: string) {
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: sessionUser?.name || sessionUser?.userName || "AI Agent",
    userId: String(sessionUser?.id ?? ""),
    module: "Procurement",
  }).catch((error) => console.error("Audit log failed:", error));
}

/**
 * Flattens a recommendation into the arguments the execute tool expects. The
 * client rebuilds this from the edited card, so the shape is part of the
 * confirm contract.
 */
function buildCreatePayloadFromSpec(spec: PrRecommendationSpec) {
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

function formatRecommendationMarkdown(spec: PrRecommendationSpec): string {
  const row = (label: string, text: string | null | undefined, note?: string) =>
    `**${label}:** ${text ?? "_not determined_"}${note ? `  \n_${note}_` : ""}\n`;

  let summary = `## Recommended Purchase Requisition\n\n`;
  summary += row("Budget", spec.budget.value?.budgetName, spec.budget.rationale);
  summary += row("Business Entity", spec.businessEntity.value?.label);
  summary += row("Department", spec.department.value?.label, spec.department.rationale);
  summary += row("Delivery Location", spec.deliveryLocation.value?.label, spec.deliveryLocation.rationale);
  summary += row("Currency", spec.currency.value);
  summary += row("Need By Date", spec.needByDate.value, spec.needByDate.rationale);
  summary += row("Buyer", spec.buyer.value?.label, spec.buyer.rationale);
  summary += row("Requestor", spec.requestor.value?.label);

  if (spec.lineItems.length > 0) {
    summary += `\n**Line Items**\n`;
    for (const item of spec.lineItems) {
      const quantity = item.quantity == null ? "quantity needed" : `${item.quantity} ×`;
      const price = item.estimatedPrice > 0
        ? ` @ ${spec.currency.value ?? ""} ${item.estimatedPrice.toLocaleString()}${item.priceAssumed ? " (estimated)" : ""}`
        : "";
      const unmatched = item.itemId ? "" : " — _not in the item master; pick a catalog item on the card_";
      summary += `- ${quantity} ${item.description}${item.unitOfMeasure ? ` (${item.unitOfMeasure})` : ""}${price}${unmatched}\n`;
    }
  }

  if (spec.pendingChoice) {
    summary += `\n${spec.pendingChoice.prompt}\n`;
  } else if (spec.unresolved.length > 0) {
    summary += `\n_Still needed: ${spec.unresolved.map(prFieldLabel).join(", ")}._\n`;
  }

  return summary;
}

function formatPoRecommendationMarkdown(spec: PoRecommendationSpec): string {
  const row = (label: string, text: string | null | undefined, note?: string) =>
    `**${label}:** ${text ?? "_not determined_"}${note ? `  \n_${note}_` : ""}\n`;

  let summary = `## Recommended Purchase Order\n\n`;
  summary += row("Budget", spec.budget.value?.budgetName, spec.budget.rationale);
  summary += row("Business Entity", spec.businessEntity.value?.label);
  summary += row("Department", spec.department.value?.label, spec.department.rationale);
  summary += row("Delivery Location", spec.deliveryLocation.value?.label, spec.deliveryLocation.rationale);
  summary += row("Currency", spec.currency.value);
  summary += row("Need By Date", spec.needByDate.value, spec.needByDate.rationale);
  summary += row("Vendor", spec.vendor.value?.label, spec.vendor.rationale);
  summary += row("Payment Terms", spec.paymentTerms.value?.label, spec.paymentTerms.rationale);
  summary += row("Requestor", spec.requestor.value?.label);

  if (spec.lineItems.length > 0) {
    summary += `\n**Line Items**\n`;
    for (const item of spec.lineItems) {
      const quantity = item.quantity == null ? "quantity needed" : `${item.quantity} ×`;
      const price = item.estimatedPrice > 0
        ? ` @ ${spec.currency.value ?? ""} ${item.estimatedPrice.toLocaleString()}${item.priceAssumed ? " (estimated)" : ""}`
        : "";
      summary += `- ${quantity} ${item.description}${item.unitOfMeasure ? ` (${item.unitOfMeasure})` : ""}${price}\n`;
    }
  }

  if (spec.pendingChoice) {
    summary += `\n${spec.pendingChoice.prompt}\n`;
  } else if (spec.unresolved.length > 0) {
    summary += `\n_Still needed: ${spec.unresolved.map(poFieldLabel).join(", ")}._\n`;
  }

  return summary;
}

/** Same gate as the PO detail Raise DN / Raise Receipt buttons: Approved only. */
function fulfillmentBlockedMessage(
  action: "delivery note" | "receipt",
  poNumber: string,
  poStatus: string | null | undefined,
): string | null {
  const status = String(poStatus || "").trim();
  if (status.toLowerCase() === "approved") return null;

  const label = status || "unknown";
  let nextStep = "The PO must be Approved before fulfillment actions are available.";
  const lower = label.toLowerCase();
  if (lower === "draft") {
    nextStep = "Submit the PO for approval first (prepare_submit_purchase_order).";
  } else if (lower === "pending approval") {
    nextStep = "Wait until the PO is Approved, then raise the delivery note / receipt.";
  } else if (lower === "rejected" || lower === "cancelled") {
    nextStep = `A ${label} PO cannot receive delivery notes or receipts.`;
  }

  return (
    `Cannot raise a ${action} for ${poNumber} — current status is "${label}". ` +
    `On the PO detail page, Raise DN / Raise Receipt only appear for Approved POs. ${nextStep}`
  );
}

const SUPERADMIN_ROLE_NAMES = new Set(["ROLE_SUPERADMIN", "ROLE_SYSADMIN"]);
const SUPPLIER_ROLE_NAMES = new Set(["ROLE_SUPPLIER_ADMIN", "ROLE_SUPPLIER_USER"]);

/**
 * Same audience as the Raise DN button on the PO detail page: the supplier user on
 * the PO once they have accepted it (`attribute_13 = Accept`), or a superadmin.
 * Internal users never see that button — they raise the receipt instead — so the
 * agent must not create delivery notes for them either.
 */
function deliveryNoteRoleBlockedMessage(
  poNumber: string,
  po: any,
  sessionUser: any,
): string | null {
  const role = String(sessionUser?.userRole || "").trim().toUpperCase();
  if (SUPERADMIN_ROLE_NAMES.has(role)) return null;

  const sessionSupplierId = String(sessionUser?.supplierId ?? "").trim();
  const isSupplierUser = SUPPLIER_ROLE_NAMES.has(role) || sessionSupplierId !== "";
  if (!isSupplierUser) {
    const roleLabel = sessionUser?.roleDisplayName || sessionUser?.userRole || "your role";
    return (
      `Cannot raise a delivery note for ${poNumber} — delivery notes are raised by the supplier ` +
      `on the PO (or a superadmin), which is the same rule as the Raise DN button on the PO ` +
      `detail page — your role (${roleLabel}) cannot raise one. Once the supplier ships, record ` +
      `the goods receipt instead with prepare_create_grn.`
    );
  }

  const poSupplierId = String((po as any)?.supplier_id ?? "").trim();
  if (sessionSupplierId && poSupplierId && sessionSupplierId !== poSupplierId) {
    return (
      `Cannot raise a delivery note for ${poNumber} — that purchase order belongs to a ` +
      `different supplier.`
    );
  }

  const acknowledgement = String((po as any)?.attribute_13 ?? "").trim().toLowerCase();
  if (acknowledgement !== "accept") {
    return (
      `Cannot raise a delivery note for ${poNumber} — the supplier has not accepted the PO yet. ` +
      `Accept the PO on the PO detail page first; Raise DN only becomes available afterwards.`
    );
  }

  return null;
}

async function assertPoApprovedForFulfillment(
  poNumber: string,
  action: "delivery note" | "receipt",
): Promise<{ po: any } | { error: string }> {
  const po = await procService.getPurchaseOrderDetail(poNumber);
  if (!po) return { error: `Purchase order ${poNumber} was not found.` };
  const blocked = fulfillmentBlockedMessage(action, poNumber, (po as any).po_status);
  if (blocked) return { error: blocked };
  return { po };
}

/**
 * Turns the lines an agent asked to ship into the `supp_po_line_dtls` rows they
 * actually mean.
 *
 * A PO's stored `po_line_number` is not its position in a list: delete a line and
 * the numbers left behind are 1, 3, 4. The model reads line items off a numbered
 * list, so it sends the position, and an unchecked position reaches the delivery
 * insert as a line number that does not exist — the DN then fails at the write
 * with "PO line 2 not found" after the user has already confirmed it.
 *
 * The item name is therefore matched first and the stored line number is what
 * gets written. Quantities are capped at what is still pending, as the Raise DN
 * screen does, and anything that cannot be resolved is reported rather than sent.
 */
/** Tenant pool, falling back to the master pool when no tenant context is set. */
async function getAsnPool() {
  return getContextPool() ?? (await import("../db")).pool;
}

/** Is this ASN free in the tenant DB? */
async function isAsnFree(asnNumber: string): Promise<boolean> {
  const pool = await getAsnPool();
  const result = await pool.query(
    `SELECT COUNT(*) as cnt FROM dbo.supp_delivery_hdr_dtls WHERE LOWER(TRIM(asn_number)) = LOWER(TRIM($1))`,
    [asnNumber],
  );
  return Number(result.rows[0]?.cnt) === 0;
}

/** Next day-sequenced ASN: ASN-YYYYMMDD-NNNN (DB MAX+1 for today's prefix). */
async function generateNextAsn(): Promise<string> {
  const yyyymmdd = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const prefix = `ASN-${yyyymmdd}-`;
  const pool = await getAsnPool();
  const result = await pool.query(
    `SELECT COALESCE(
       MAX(CAST(REPLACE(asn_number, $1, '') AS INTEGER)),
       0
     ) + 1 AS next_num
     FROM dbo.supp_delivery_hdr_dtls
     WHERE asn_number LIKE $2
       AND asn_number ~ ('^' || $1 || '[0-9]+$')`,
    [prefix, `${prefix}%`],
  );
  const nextNum = Number(result.rows[0]?.next_num) || 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

/**
 * Keep a caller-supplied ASN only if it is still free; otherwise allocate the
 * next free day-sequenced ASN. Retries briefly under race, then falls back to a
 * random suffix so the fallback path always yields a unique value.
 */
async function allocateUniqueAsn(
  preferred?: string | null,
): Promise<{ asnNumber: string; replacedPreferred: boolean }> {
  const trimmed = String(preferred || "").trim();
  if (trimmed && (await isAsnFree(trimmed))) {
    return { asnNumber: trimmed, replacedPreferred: false };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = await generateNextAsn();
    if (await isAsnFree(candidate)) {
      return { asnNumber: candidate, replacedPreferred: Boolean(trimmed) };
    }
  }

  const yyyymmdd = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const fallback = `ASN-${yyyymmdd}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  return { asnNumber: fallback, replacedPreferred: Boolean(trimmed) };
}

async function resolveDeliveryNoteLines(
  poNumber: string,
  requested: any[],
): Promise<{ lines: any[]; errors: string[] }> {
  const poLines = await procService.getPoLinesForDN(poNumber);
  const available = Array.isArray(poLines) ? poLines : [];

  const lines: any[] = [];
  const errors: string[] = [];
  const taken = new Set<string>();

  for (const raw of requested) {
    const itemQuery = String(raw?.itemName || "").trim();
    const label = itemQuery || `line ${raw?.poLineNumber ?? "?"}`;

    // Name first: the number the model supplies is often a display position.
    const byName = itemQuery ? resolvePoLineTarget(available, { itemQuery }) : null;
    const target =
      byName?.status === "resolved"
        ? byName
        : resolvePoLineTarget(available, { lineNumber: raw?.poLineNumber });

    if (target.status !== "resolved") {
      errors.push(`"${label}" is not a line on ${poNumber}.`);
      continue;
    }

    const line = target.line as any;
    const lineNumber = String(line.po_line_number);
    if (taken.has(lineNumber)) {
      errors.push(`Line ${lineNumber} (${line.item_name}) was listed more than once.`);
      continue;
    }

    const pending = Number(line.pending_qty) || 0;
    if (pending <= 0) {
      errors.push(`Line ${lineNumber} (${line.item_name}) has already been fully delivered.`);
      continue;
    }

    let qty = Number(raw?.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push(`Shipped quantity must be greater than 0 for line ${lineNumber}.`);
      continue;
    }
    if (qty > pending) qty = pending;

    taken.add(lineNumber);
    lines.push({
      poLineNumber: lineNumber,
      itemName: line.item_name || itemQuery,
      qty,
      uom: raw?.uom || line.line_unit || "EA",
      pendingQty: pending,
    });
  }

  return { lines, errors };
}

async function executeToolCall(
  toolName: string,
  args: any,
  sessionUser?: any

): Promise<{
  result: string;
  pendingAction?: PendingAction;
  chart?: AgentChartSpec;
  actionPreview?: PrRecommendationSpec | PoRecommendationSpec;
}> {
  try {
    switch (toolName) {
      case "search_requisitions": {
        const limit = Math.min(args.limit || 20, 50);
        const page = Math.max(args.page || 1, 1);
        const query: any = { page: String(page), limit: String(limit) };
        if (args.search) query.search = args.search;
        if (args.status && args.status !== "all") query.status = args.status;
        if (args.department) query.department = args.department;

        const result = await procService.getRequisitions(
          query,
          String(sessionUser?.userRole),
          String(sessionUser?.orgIds),
          String(sessionUser?.department),
          sessionUser?.id,
        );
        const rows = (result as any).data || [];
        const total = (result as any).pagination?.total || rows.length;
        const totalPages = Math.ceil(total / limit);

        if (rows.length === 0) {
          const filters = [args.search && `matching "${args.search}"`, args.status && args.status !== "all" && `status "${args.status}"`, args.department && `department "${args.department}"`].filter(Boolean).join(", ");
          if (page > 1) return { result: `No more purchase requisitions to show (you've reached the end).` };
          return { result: `No purchase requisitions found${filters ? ` with ${filters}` : ""}.` };
        }

        const startIdx = (page - 1) * limit;
        const formatted = rows.map((r: any, idx: number) => {
          let entry = `**${startIdx + idx + 1}. ${r.pr_number}** — ${r.pr_description || r.description || "No description"}\n`;
          entry += `   Status: ${r.pr_status || r.status || "N/A"}\n`;
          if (r.department_name) entry += `   Department: ${r.department_name}\n`;
          if (r.requestor_name) entry += `   Requestor: ${r.requestor_name}\n`;
          if (r.pr_amount) entry += `   Amount: ${r.currency || "AED"} ${Number(r.pr_amount).toLocaleString()}\n`;
          if (r.delivery_date) entry += `   Delivery Date: ${new Date(r.delivery_date).toLocaleDateString()}\n`;
          if (r.pr_created_date || r.creation_date) entry += `   Created: ${new Date(r.pr_created_date || r.creation_date).toLocaleDateString()}\n`;
          return entry;
        }).join("\n");

        let pagination = `Showing page ${page} of ${totalPages} (${total} total)`;
        if (page < totalPages) pagination += ` — say "show more" to see the next page`;

        return { result: `${pagination}\n\n${formatted}` };
      }

      case "get_requisition_details": {
        const prNumber = args.prNumber;
        if (!prNumber) return { result: "Please provide a PR number (e.g. PR_00001)." };

        if (!(await procService.canUserAccessPr(prNumber, sessionUser))) {
          return { result: prNotFoundMessage(prNumber) };
        }

        const detail = await procService.getRequisitionDetail(prNumber);
        if (!detail) return { result: prNotFoundMessage(prNumber) };

        const h = detail.header as any;
        let info = `## Purchase Requisition: ${h.pr_number || prNumber}\n\n`;
        info += `**Description:** ${h.pr_description || h.description || "N/A"}\n`;
        info += `**Status:** ${h.pr_status || "N/A"}\n`;
        if (h.department_name) info += `**Department:** ${h.department_name}\n`;
        if (h.requestor_name) info += `**Requestor:** ${h.requestor_name}\n`;
        if (h.pr_owner_name) info += `**Buyer:** ${h.pr_owner_name}\n`;
        info += `**Currency:** ${h.currency || "AED"}\n`;
        if (h.pr_amount) info += `**Total Amount:** ${h.currency || "AED"} ${Number(h.pr_amount).toLocaleString()}\n`;
        if (h.delivery_date) info += `**Delivery Date:** ${new Date(h.delivery_date).toLocaleDateString()}\n`;
        if (h.delivertto_location_name) info += `**Delivery Location:** ${h.delivertto_location_name}\n`;
        if (h.budget_name) info += `**Budget:** ${h.budget_name}\n`;
        if (h.pr_created_date || h.creation_date) info += `**Created:** ${new Date(h.pr_created_date || h.creation_date).toLocaleDateString()}\n`;
        if (h.created_by) info += `**Created By:** ${h.created_by}\n`;

        const lines = detail.lines as any[];
        if (lines?.length > 0) {
          info += `\n### Line Items (${lines.length})\n`;
          lines.forEach((l: any, li: number) => {
            info += `**${li + 1}. ${l.item_description || "Item"}**\n`;
            if (l.qty) info += `   Qty: ${l.qty}`;
            if (l.uom) info += ` ${l.uom}`;
            info += "\n";
            if (l.unit_cost) info += `   Unit Cost: ${h.currency || "AED"} ${Number(l.unit_cost).toLocaleString()}\n`;
            if (l.amount) info += `   Amount: ${h.currency || "AED"} ${Number(l.amount).toLocaleString()}\n`;
            if (l.product_category_name) info += `   Category: ${l.product_category_name}\n`;
          });
        } else {
          info += `\n_No line items added yet._\n`;
        }

        const approvals = detail.approvalHistory as any[];
        if (approvals?.length > 0) {
          info += `\n### Approval History\n`;
          approvals.forEach((a: any) => {
            info += `- ${a.action || a.approval_action || "Action"} by ${a.approver_name || a.acted_by || "N/A"} on ${a.action_date || a.acted_date ? new Date(a.action_date || a.acted_date).toLocaleDateString() : "N/A"}\n`;
            if (a.comments) info += `  Comments: ${a.comments}\n`;
          });
        }

        return { result: info };
      }

      case "get_pr_stats": {
        const mockSessionUser = sessionUser || {};
        const stats = await procService.getRequisitionStats(
          mockSessionUser.department,
          mockSessionUser.userRole,
          mockSessionUser.orgIds,
          mockSessionUser.id,
          mockSessionUser.userName,
        ) as any;
        let summary = `## Purchase Requisition Statistics\n\n`;
        const counts: Record<string, number> = {};

        if (stats && typeof stats === 'object') {
          if (Array.isArray(stats)) {
            summary += `### By Status\n`;
            let totalCount = 0;
            stats.forEach((r: any) => {
              const status = r.pr_status || r.status || "Unknown";
              const count = parseInt(r.count) || 0;
              totalCount += count;
              counts[status] = (counts[status] || 0) + count;
              summary += `- ${status}: ${count}\n`;
            });
            summary += `\n**Total PRs**: ${totalCount}\n`;
          } else {
            const total = parseInt(stats.total) || 0;
            const statusMap: Record<string, string> = {
              draft: "Draft", pending_approval: "Pending Approval", approved: "Approved",
              complete: "Complete", rejected: "Rejected", cancelled: "Cancelled",
              more_info_required: "More Info Required"
            };
            summary += `### By Status\n`;
            for (const [key, label] of Object.entries(statusMap)) {
              const count = parseInt(stats[key]) || 0;
              if (count > 0) {
                counts[label] = count;
                summary += `- ${label}: ${count}\n`;
              }
            }
            summary += `\n**Total PRs**: ${total}\n`;
            if (stats.total_value) {
              summary += `**Total Value**: ${Number(parseFloat(stats.total_value)).toLocaleString()}\n`;
            }
          }
        } else {
          summary += `No purchase requisition data available.\n`;
        }

        const chart = barChartFromCountMap("Purchase requisitions by status", counts, { valueSeriesLabel: "PRs" });
        return { result: summary, chart };
      }

      case "get_pr_stats_by_department": {
        const mockSessionUser = sessionUser || {};
        const rows = await procService.getPrStatsByDepartment(mockSessionUser) as any[];
        if (!Array.isArray(rows) || rows.length === 0) {
          return { result: "No purchase requisition data available by department." };
        }

        const statusMap: Array<[string, string]> = [
          ["approved", "Approved"], ["pending_approval", "Pending Approval"],
          ["draft", "Draft"], ["complete", "Complete"],
          ["rejected", "Rejected"], ["cancelled", "Cancelled"],
          ["more_info_required", "More Info Required"],
        ];

        let summary = `## Purchase Requisition Activity by Department\n\n`;
        const counts: Record<string, number> = {};
        let grandTotal = 0;
        let grandValue = 0;

        rows.forEach((r: any) => {
          const dept = r.department_name || "Unassigned";
          const total = parseInt(r.total) || 0;
          const value = parseFloat(r.total_value) || 0;
          grandTotal += total;
          grandValue += value;
          counts[dept] = total;

          summary += `### ${dept}\n`;
          summary += `- **Total PRs**: ${total}\n`;
          for (const [key, label] of statusMap) {
            const count = parseInt(r[key]) || 0;
            if (count > 0) summary += `- ${label}: ${count}\n`;
          }
          if (value > 0) summary += `- Total Value: ${value.toLocaleString()}\n`;
          summary += `\n`;
        });

        summary += `**Total PRs**: ${grandTotal}\n`;
        if (grandValue > 0) summary += `**Total Value**: ${grandValue.toLocaleString()}\n`;

        const chart = barChartFromCountMap("Purchase requisitions by department", counts, { valueSeriesLabel: "PRs" });
        return { result: summary, chart };
      }

      case "search_purchase_orders": {
        const limit = Math.min(args.limit || 20, 50);
        const page = Math.max(args.page || 1, 1);
        const query: any = { page: String(page), limit: String(limit) };
        // A bare numeric `search` is the model passing a supplier id, which ILIKE-matches
        // digits inside unrelated PO numbers. Treat it as the supplier filter it meant.
        const numericSearch = /^\d+$/.test(String(args.search ?? "").trim());
        const supplierId = Number(args.supplierId ?? (numericSearch ? args.search : NaN));
        const hasSupplierId = Number.isFinite(supplierId) && supplierId > 0;
        if (args.search && !numericSearch) query.search = args.search;
        if (hasSupplierId) query.supplierId = supplierId;
        if (args.status && args.status !== "all") query.status = args.status;
        if (args.department) query.department = args.department;
        const minAmount = Number(args.minAmount);
        const maxAmount = Number(args.maxAmount);
        const hasMinAmount = Number.isFinite(minAmount);
        const hasMaxAmount = Number.isFinite(maxAmount);
        if (hasMinAmount) query.minAmount = minAmount;
        if (hasMaxAmount) query.maxAmount = maxAmount;

        const mockSessionUser = sessionUser || {};
        const result = await procService.getPurchaseOrders(query, mockSessionUser);
        const rows = (result as any).data || [];
        const total = (result as any).pagination?.total || rows.length;
        const totalPages = Math.ceil(total / limit);

        if (rows.length === 0) {
          const filters = [query.search && `matching "${query.search}"`, hasSupplierId && `supplier id ${supplierId}`, args.status && args.status !== "all" && `status "${args.status}"`, args.department && `department "${args.department}"`, hasMinAmount && `total value above ${minAmount.toLocaleString()}`, hasMaxAmount && `total value below ${maxAmount.toLocaleString()}`].filter(Boolean).join(", ");
          if (page > 1) return { result: `No more purchase orders to show (you've reached the end).` };
          return { result: `No purchase orders found${filters ? ` with ${filters}` : ""}.` };
        }

        const startIdx = (page - 1) * limit;
        const formatted = rows.map((r: any, idx: number) => {
          let entry = `**${startIdx + idx + 1}. ${r.po_number}** — ${r.po_description || "No description"}\n`;
          entry += `   Status: ${r.po_status || "N/A"}\n`;
          if (r.company_name) entry += `   Vendor: ${r.company_name}\n`;
          if (r.department_name) entry += `   Department: ${r.department_name}\n`;
          if (r.po_owner_name) entry += `   Buyer: ${r.po_owner_name}\n`;
          if (r.po_total_cost) entry += `   Amount: ${r.po_currency || "AED"} ${Number(r.po_total_cost).toLocaleString()}\n`;
          if (r.creation_date) entry += `   Date: ${new Date(r.creation_date).toLocaleDateString()}\n`;
          return entry;
        }).join("\n");

        const appliedFilters = [hasMinAmount && `total value above ${minAmount.toLocaleString()}`, hasMaxAmount && `total value below ${maxAmount.toLocaleString()}`].filter(Boolean).join(", ");
        let pagination = appliedFilters
          ? `Purchase orders with ${appliedFilters} — the database already applied this filter, so list every row below as-is. Showing page ${page} of ${totalPages} (${total} total)`
          : `Showing page ${page} of ${totalPages} (${total} total)`;
        if (page < totalPages) pagination += ` — say "show more" to see the next page`;

        return { result: `${pagination}\n\n${formatted}` };
      }

      case "get_po_details": {
        const poNumber = args.poNumber;
        if (!poNumber) return { result: "Please provide a PO number." };

        const detail = await procService.getPurchaseOrderDetail(poNumber);
        if (!detail) return { result: `No purchase order found with number ${poNumber}.` };

        const h = detail as any;
        let info = `## Purchase Order: ${h.po_number || poNumber}\n\n`;
        info += `**Description:** ${h.po_description || "N/A"}\n`;
        info += `**Status:** ${h.po_status || "N/A"}\n`;
        info += `**PO Type:** ${h.po_type || "N/A"}\n`;
        if (h.company_name) info += `**Vendor:** ${h.company_name}\n`;
        if (h.department_name) info += `**Department:** ${h.department_name}\n`;
        if (h.po_owner_name) info += `**Buyer:** ${h.po_owner_name}\n`;
        info += `**Currency:** ${h.po_currency || "AED"}\n`;
        if (h.po_total_cost) info += `**Total Cost:** ${h.po_currency || "AED"} ${Number(h.po_total_cost).toLocaleString()}\n`;
        if (h.po_required_date) info += `**Required Date:** ${new Date(h.po_required_date).toLocaleDateString()}\n`;
        if (h.delivertto_location_name) info += `**Delivery Location:** ${h.delivertto_location_name}\n`;
        if (h.budget_name) info += `**Budget:** ${h.budget_name}\n`;
        if (h.creation_date) info += `**PO Date:** ${new Date(h.creation_date).toLocaleDateString()}\n`;
        if (h.po_issue_date) info += `**Issue Date:** ${new Date(h.po_issue_date).toLocaleDateString()}\n`;

        if (h.supplier) {
          const s = h.supplier;
          info += `\n### Vendor Info\n`;
          if (s.supplier_name || s.company_name) info += `**Company:** ${s.supplier_name || s.company_name}\n`;
          if (s.email_id) info += `**Email:** ${s.email_id}\n`;
          if (s.phone) info += `**Phone:** ${s.phone}\n`;
          if (s.city || s.country) info += `**Location:** ${[s.city, s.country].filter(Boolean).join(", ")}\n`;
        }

        const items = h.items as any[];
        if (items?.length > 0) {
          info += `\n### Line Items (${items.length})\n`;
          items.forEach((l: any, li: number) => {
            // The stored line number, not the position: PO lines are not always
            // 1..n, and tools that write against a line need the real one.
            const lineNo = l.po_line_number ?? li + 1;
            info += `**Line ${lineNo}: ${l.item_name || l.line_description || "Item"}**\n`;
            if (l.line_qty) info += `   Qty: ${l.line_qty}`;
            if (l.line_unit) info += ` ${l.line_unit}`;
            info += "\n";
            if (l.line_unit_cost) info += `   Unit Price: ${h.po_currency || "AED"} ${Number(l.line_unit_cost).toLocaleString()}\n`;
            if (l.line_cost) info += `   Total: ${h.po_currency || "AED"} ${Number(l.line_cost).toLocaleString()}\n`;
          });
        } else {
          info += `\n_No line items added yet._\n`;
        }

        const approvals = h.approvalHistory as any[];
        if (approvals?.length > 0) {
          info += `\n### Approval History\n`;
          approvals.forEach((a: any) => {
            info += `- ${a.action || a.approval_action || "Action"} by ${a.approver_name || a.acted_by || "N/A"} on ${a.action_date || a.acted_date ? new Date(a.action_date || a.acted_date).toLocaleDateString() : "N/A"}\n`;
            if (a.comments) info += `  Comments: ${a.comments}\n`;
          });
        }

        return { result: info };
      }

      case "get_po_stats": {
        const mockSessionUser = sessionUser || {};
        const stats = await procService.getPoStats(mockSessionUser) as any;
        let summary = `## Purchase Order Statistics\n\n`;
        const counts: Record<string, number> = {};

        if (stats && typeof stats === 'object') {
          if (Array.isArray(stats)) {
            let totalCount = 0;
            let totalValue = 0;
            summary += `### By Status\n`;
            stats.forEach((r: any) => {
              const status = r.po_status || r.status || "Unknown";
              const count = parseInt(r.count) || 0;
              const value = parseFloat(r.total_value) || 0;
              totalCount += count;
              totalValue += value;
              counts[status] = (counts[status] || 0) + count;
              summary += `- ${status}: ${count} POs`;
              if (value > 0) summary += ` (Value: ${value.toLocaleString()})`;
              summary += "\n";
            });
            summary += `\n**Total POs**: ${totalCount}\n`;
            if (totalValue > 0) summary += `**Total Value**: ${totalValue.toLocaleString()}\n`;
          } else {
            const total = parseInt(stats.total) || 0;
            const statusMap: Record<string, string> = {
              draft: "Draft", pending_approval: "Pending Approval", approved: "Approved",
              complete: "Complete", closed: "Closed", rejected: "Rejected",
              cancelled: "Cancelled", issued: "Issued"
            };
            summary += `### By Status\n`;
            for (const [key, label] of Object.entries(statusMap)) {
              const count = parseInt(stats[key]) || 0;
              if (count > 0) {
                counts[label] = count;
                summary += `- ${label}: ${count} POs\n`;
              }
            }
            summary += `\n**Total POs**: ${total}\n`;
            if (stats.total_value) {
              summary += `**Total Value**: ${Number(parseFloat(stats.total_value)).toLocaleString()}\n`;
            }
          }
        } else {
          summary += `No purchase order data available.\n`;
        }

        const chart = barChartFromCountMap("Purchase orders by status", counts, { valueSeriesLabel: "POs" });
        return { result: summary, chart };
      }

      case "get_po_stats_by_department": {
        const mockSessionUser = sessionUser || {};
        const rows = await procService.getPoStatsByDepartment(mockSessionUser) as any[];
        if (!Array.isArray(rows) || rows.length === 0) {
          return { result: "No purchase order data available by department." };
        }

        const statusMap: Array<[string, string]> = [
          ["approved", "Approved"], ["pending_approval", "Pending Approval"],
          ["draft", "Draft"], ["complete", "Complete"], ["closed", "Closed"],
          ["rejected", "Rejected"], ["cancelled", "Cancelled"],
          ["more_info_required", "More Info Required"],
        ];

        let summary = `## Purchase Order Activity by Department\n\n`;
        const counts: Record<string, number> = {};
        let grandTotal = 0;
        let grandValue = 0;

        rows.forEach((r: any) => {
          const dept = r.department_name || "Unassigned";
          const total = parseInt(r.total) || 0;
          const value = parseFloat(r.total_value) || 0;
          grandTotal += total;
          grandValue += value;
          counts[dept] = total;

          summary += `### ${dept}\n`;
          summary += `- **Total POs**: ${total}\n`;
          for (const [key, label] of statusMap) {
            const count = parseInt(r[key]) || 0;
            if (count > 0) summary += `- ${label}: ${count}\n`;
          }
          if (value > 0) summary += `- Total Value: ${value.toLocaleString()}\n`;
          summary += `\n`;
        });

        summary += `**Total POs**: ${grandTotal}\n`;
        if (grandValue > 0) summary += `**Total Value**: ${grandValue.toLocaleString()}\n`;

        const chart = barChartFromCountMap("Purchase orders by department", counts, { valueSeriesLabel: "POs" });
        return { result: summary, chart };
      }

      case "search_items": {
        const limit = Math.min(args.limit || 20, 50);
        const page = Math.max(args.page || 1, 1);
        const query: any = { page: String(page), limit: String(limit) };
        if (args.search) query.search = args.search;
        if (args.category) query.category = args.category;

        const result = await procService.getItems(query);
        let items: any[] = [];
        let total = 0;

        if (Array.isArray(result)) {
          items = result.slice(0, limit);
          total = result.length;
        } else if ((result as any)?.data) {
          items = (result as any).data;
          total = (result as any).pagination?.total || items.length;
        } else if ((result as any)?.items) {
          items = (result as any).items;
          total = (result as any).total || items.length;
        }

        const totalPages = Math.ceil(total / limit);

        if (items.length === 0) {
          if (page > 1) return { result: `No more items to show (you've reached the end).` };
          return { result: `No items found${args.search ? ` matching "${args.search}"` : ""}${args.category ? ` in category "${args.category}"` : ""}.` };
        }

        const startIdx = (page - 1) * limit;
        const formatted = items.map((item: any, idx: number) => {
          let entry = `**${startIdx + idx + 1}. ${item.name || item.productName || "Item"}**\n`;
          if (item.itemCode || item.skuNo) entry += `   Code: ${item.itemCode || item.skuNo}\n`;
          if (item.categoryName || item.category) entry += `   Category: ${item.categoryName || item.category}\n`;
          if (item.description || item.productShortDesc) {
            const desc = item.description || item.productShortDesc;
            entry += `   Description: ${desc.substring(0, 100)}${desc.length > 100 ? "..." : ""}\n`;
          }
          if (item.unitOfMeasure || item.uom) entry += `   UOM: ${item.unitOfMeasure || item.uom}\n`;
          if (item.standardPrice || item.unitPrice || item.unit_price) entry += `   Unit Price: ${Number(item.standardPrice || item.unitPrice || item.unit_price).toLocaleString()}\n`;
          if (item.status) entry += `   Status: ${item.status}\n`;
          return entry;
        }).join("\n");

        let pagination = `Showing page ${page} of ${totalPages} (${total} total)`;
        if (page < totalPages) pagination += ` — say "show more" to see the next page`;

        return { result: `${pagination}\n\n${formatted}` };
      }

      /**
       * The three read-only recommendation answers. Each returns markdown and
       * nothing else — no actionPreview, no pendingAction — so the chat renders
       * the service's result rather than a PO/PR review card.
       */
      case "recommend_items_for_description": {
        const description = normalizeItemQuery(String(args.description || ""));
        if (!description) {
          return { result: 'What should I recommend items for? For example: "recommend items for apple laptops".' };
        }

        const recommendations = await getSmartRecommendations(description, getContextPool());
        return { result: formatItemRecommendations(description, recommendations) };
      }

      case "suggest_items_for_requisition": {
        const prNumber = String(args.prNumber || "").trim();
        if (!prNumber) return { result: "Please provide a PR number (e.g. PR_00072)." };

        const denied = await denyIfPrHidden(prNumber, sessionUser);
        if (denied) return denied;

        const detail = await procService.getRequisitionDetail(prNumber);
        if (!detail) return { result: prNotFoundMessage(prNumber) };

        // Same three inputs the AI Assisted button sends from the PR screen.
        const h = detail.header as any;
        const title = String(h.pr_description ?? "").trim();
        if (!title) {
          return { result: `${prNumber} has no description yet, so there is nothing for the AI Assisted Service to work from. Add a description first.` };
        }

        const suggestions = await procService.suggestItems(
          title,
          String(h.business_justification ?? ""),
          String(h.department_name ?? ""),
        );
        return { result: formatRequisitionItemSuggestions(prNumber, suggestions) };
      }

      case "recommend_item_quantity": {
        const itemQuery = normalizeItemQuery(String(args.itemName || ""));
        if (!itemQuery) {
          return { result: 'Which item should I size? For example: "recommend the quantity for laptops".' };
        }

        // Resolved against the Item Master first, through the same lookup the
        // Add Line Item flow uses: a quantity for something the catalog does not
        // stock cannot be acted on, and the historical lookup would have nothing
        // to average.
        const match = await findItemMasterMatchForQuery(
          itemQuery,
          createAddPrLineDeps().searchItemMaster,
        );
        if (match.status === "not-found") return { result: formatItemNotFoundMessage(itemQuery) };
        if (match.status === "ambiguous") {
          return { result: formatItemAmbiguousMessage(itemQuery, match.candidates) };
        }

        // A bare "recommend the quantity for laptops" has no requisition and no
        // budget. The prediction service treats a null budget line as
        // unconstrained and falls back to this item's purchase history, which
        // is the intended answer — no budget is selected to obtain one.
        let department = String(sessionUser?.departmentName ?? "").trim();
        let budgetLineId: number | null = null;
        const prNumber = String(args.prNumber || "").trim();
        if (prNumber) {
          const denied = await denyIfPrHidden(prNumber, sessionUser);
          if (denied) return denied;
          const detail = await procService.getRequisitionDetail(prNumber);
          const header = (detail as any)?.header;
          if (header) {
            department = String(header.department_name ?? department).trim();
            const segment = Number(header.budget_segment);
            budgetLineId = Number.isFinite(segment) && segment > 0 ? segment : null;
          }
        }

        const prediction = await procService.predictQty(
          match.item.name,
          department,
          undefined,
          budgetLineId,
        );
        return {
          result: formatQuantityRecommendation(match.item.name, prediction, {
            prNumber: budgetLineId ? prNumber : null,
          }),
        };
      }

      case "recommend_requisition": {
        const request = String(args.request || "").trim();
        if (!request) {
          return { result: "Please describe what you need to purchase so I can build a recommendation." };
        }

        const spec = await recommendRequisition(
          {
            request,
            sessionUser: {
              id: Number(sessionUser?.id ?? 0),
              name: sessionUser?.name || sessionUser?.userName || "Current user",
              department: sessionUser?.departmentName ?? null,
            },
          },
          createDefaultDeps(),
        );

        // Only offer Confirm once every required field is resolved; otherwise the
        // card collects the outstanding choice first and sets it on recalculation.
        const pendingAction = spec.canCreate
          ? {
              type: "create_requisition_from_recommendation",
              data: buildCreatePayloadFromSpec(spec),
              summary: `Create PR "${request}" against budget ${spec.budget.value?.budgetName}`,
            }
          : undefined;

        return { result: formatRecommendationMarkdown(spec), actionPreview: spec, pendingAction };
      }

      case "execute_create_requisition_from_recommendation": {
        if (!args._confirmed) {
          return { result: "Please review the recommendation above and use the **Confirm** button to create this requisition." };
        }

        // Without this the missing id is simply dropped below and the PR is
        // created with the requestor as buyer, silently ignoring the card.
        const buyerId = Number(args.buyerId);
        if (!Number.isFinite(buyerId) || buyerId <= 0) {
          return { result: "Please select a buyer on the recommendation card before creating this requisition." };
        }
        const eligibleBuyers = await prRecommendationRepo.getActiveBuyers(
          args.orgId != null ? Number(args.orgId) : null,
        );
        const chosenBuyer = eligibleBuyers.find((entry) => Number(entry.user_id) === buyerId);
        if (!chosenBuyer) {
          return {
            result:
              "That buyer is not an active procurement manager or officer for this business entity. Please pick one from the Buyer list on the card.",
          };
        }

        const body: any = {
          description: args.description,
          currency: args.currency,
          requestorId: sessionUser?.id ? String(sessionUser.id) : undefined,
          requestorName: sessionUser?.name || sessionUser?.userName,
          isBudgeted: args.budgetLineId ? "yes" : "no",
        };
        if (args.budgetLineId) body.budgetId = String(args.budgetLineId);
        if (args.orgId) body.orgId = String(args.orgId);
        if (args.departmentId) body.requestorDepartment = String(args.departmentId);
        if (args.deliveryLocationId) body.deliveryLocation = String(args.deliveryLocationId);
        if (args.needByDate) body.needByDate = args.needByDate;
        body.buyerId = String(buyerId);
        // The name follows the id from the user table, not from the payload.
        if (chosenBuyer.name) body.buyerName = chosenBuyer.name;

        const created: any = await procService.createRequisition(body);
        const prNumber = created?.prNumber;

        const lineItems: any[] = Array.isArray(args.lineItems) ? args.lineItems : [];
        const lineFailures: string[] = [];
        for (const item of lineItems) {
          try {
            if (item.quantity == null) {
              lineFailures.push(`${item.description}: no quantity was set`);
              continue;
            }
            await procService.addRequisitionLine(prNumber, {
              itemDescription: item.description,
              quantity: String(item.quantity),
              uom: item.unitOfMeasure || "Each",
              unitCost: String(item.estimatedPrice ?? 0),
              categoryId: item.categoryCode || null,
              categoryName: item.categoryName || null,
              itemId: item.itemId || null,
              currency: args.currency,
            });
          } catch (error: any) {
            lineFailures.push(`${item.description}: ${error?.message || "could not be added"}`);
          }
        }

        audit(
          sessionUser,
          prNumber,
          "CREATE",
          `Purchase Requisition ${prNumber} created from AI recommendation`,
        );

        let message = `Purchase Requisition **${prNumber}** has been created.\n\n`;
        message += `- **Status**: Draft\n- **Description**: ${args.description}\n`;
        if (args.currency) message += `- **Currency**: ${args.currency}\n`;
        if (args.needByDate) message += `- **Need By Date**: ${args.needByDate}\n`;
        message += `- **Line Items**: ${lineItems.length - lineFailures.length} of ${lineItems.length} added\n`;
        if (lineFailures.length > 0) {
          message += `\n_Some line items could not be added:_\n${lineFailures.map((failure) => `- ${failure}`).join("\n")}\n`;
        }
        return { result: message };
      }

      case "recommend_purchase_order": {
        const request = String(args.request || args.description || "").trim();
        if (!request) {
          return { result: "Please describe what you need to purchase so I can build a purchase order recommendation." };
        }

        const turnPrompt = typeof args._turnPrompt === "string" ? args._turnPrompt : "";
        const parsedChat = parsePoChatOverrides(turnPrompt);
        const overrides: PoRecommendationOverrides = { ...(args.overrides || {}) };
        if (args.supplierId != null && Number.isFinite(Number(args.supplierId))) {
          overrides.supplierId = Number(args.supplierId);
        }
        const supplierName = String(args.supplierName || parsedChat.supplierName || "").replace(/^@+/, "").trim();
        const needByRaw = String(args.needByDate || parsedChat.needByDateRaw || "").trim();
        if (needByRaw) {
          const iso = parseNeedByDate(needByRaw);
          if (iso) overrides.needByDate = iso;
        }
        if (supplierName && overrides.supplierId == null) {
          try {
            const result = await vendorService.getDboSuppliersPaginated({
              page: 1,
              limit: 20,
              search: supplierName,
            });
            const rows = ((result as any).data || []) as Array<{ id?: number; companyName?: string; company_name?: string }>;
            const match = matchByLabels(rows, supplierName, (row) => [
              String(row.companyName || ""),
              String(row.company_name || ""),
            ]);
            if (match.status === "resolved" && match.item.id != null) {
              overrides.supplierId = Number(match.item.id);
            }
          } catch (error) {
            console.error("[recommend_purchase_order] vendor name resolve failed:", error);
          }
        }

        const spec = await recommendPurchaseOrder(
          {
            request,
            sessionUser: {
              id: Number(sessionUser?.id ?? 0),
              name: sessionUser?.name || sessionUser?.userName || "Current user",
              department: sessionUser?.departmentName ?? null,
            },
            overrides,
          },
          createDefaultPoDeps(),
        );

        if (parsedChat.quantity != null && spec.lineItems.length > 0) {
          spec.lineItems = spec.lineItems.map((item, index) =>
            index === 0
              ? { ...item, quantity: parsedChat.quantity!, quantityPredicted: false }
              : item,
          );
        }

        const pendingAction = spec.canCreate
          ? {
              type: "create_purchase_order_from_recommendation",
              data: buildPoCreatePayload(spec),
              summary: `Create PO "${request}" against budget ${spec.budget.value?.budgetName}`,
            }
          : undefined;

        return { result: formatPoRecommendationMarkdown(spec), actionPreview: spec, pendingAction };
      }

      case "execute_create_purchase_order_from_recommendation": {
        if (!args._confirmed) {
          return {
            result:
              "Please review the recommendation above and use the **Confirm** button to create this purchase order.",
          };
        }

        if (!args.supplierId) {
          return { result: "Cannot create Direct PO — vendor is missing. Pick a vendor on the recommendation card." };
        }
        if (!args.budgetLineId) {
          return { result: "Cannot create Direct PO — budget is missing. Pick a budget on the recommendation card." };
        }
        if (!args.orgId) {
          return { result: "Cannot create Direct PO — business entity is missing." };
        }
        if (!args.departmentId) {
          return { result: "Cannot create Direct PO — department is missing." };
        }
        if (!args.deliveryLocationId) {
          return { result: "Cannot create Direct PO — delivery location is missing." };
        }
        if (!args.paymentTermsId) {
          return { result: "Cannot create Direct PO — payment terms are missing." };
        }
        if (!args.needByDate) {
          return { result: "Cannot create Direct PO — need-by date is missing." };
        }

        const requestorId = args.requestorId ?? sessionUser?.id;
        const requestorName =
          args.requestorName || sessionUser?.name || sessionUser?.userName || null;

        const poBody = {
          description: String(args.description || "").trim(),
          poType: "Standard",
          supplierId: Number(args.supplierId),
          supplierName: args.supplierName ?? null,
          deliveryLocation: String(args.deliveryLocationId),
          requiredDate: String(args.needByDate),
          requestorId,
          requestorName,
          requestorDepartment: String(args.departmentId),
          buyerId: args.buyerId ?? requestorId,
          buyerName: args.buyerName ?? requestorName,
          buyerEmail: null,
          orgId: Number(args.orgId),
          orgName: args.orgName ?? null,
          currency: String(args.currency || "AED"),
          budgetId: Number(args.budgetLineId),
          budgetName: args.budgetName ?? null,
          paymentTermsId: String(args.paymentTermsId),
          paymentTermsName: args.paymentTermsName ?? null,
          advanceFlag: false,
          advancePercentage: "",
        };

        const poResult = await procService.createPurchaseOrder(poBody);
        const poNumber = (poResult as any).poNumber;

        const lineItems: any[] = Array.isArray(args.lineItems) ? args.lineItems : [];
        const lineFailures: string[] = [];
        for (const item of lineItems) {
          try {
            if (item.quantity == null) {
              lineFailures.push(`${item.description}: no quantity was set`);
              continue;
            }
            const unitPrice = Number(item.estimatedPrice ?? 0);
            const quantity = Number(item.quantity);
            const lineCost = quantity * unitPrice;
            await procService.addPoLine(poNumber, {
              description: item.description,
              quantity,
              unitPrice,
              uom: item.unitOfMeasure || "EA",
              taxRate: 0,
              taxAmount: 0,
              lineCost,
              itemId: item.itemId || null,
              itemName: item.description || null,
              categoryCode: item.categoryCode || null,
              categoryName: item.categoryName || null,
            });
          } catch (error: any) {
            lineFailures.push(`${item.description}: ${error?.message || "could not be added"}`);
          }
        }

        audit(
          sessionUser,
          poNumber,
          "CREATE",
          `Purchase Order ${poNumber} created from AI recommendation`,
        );

        let message = `Purchase Order **${poNumber}** has been created.\n\n`;
        message += `- **Status**: Draft\n- **Description**: ${poBody.description}\n`;
        message += `- **Supplier**: ${poBody.supplierName || poBody.supplierId}\n`;
        message += `- **Budget**: ${poBody.budgetName || poBody.budgetId}\n`;
        if (poBody.currency) message += `- **Currency**: ${poBody.currency}\n`;
        if (poBody.requiredDate) message += `- **Need By Date**: ${poBody.requiredDate}\n`;
        message += `- **Line Items**: ${lineItems.length - lineFailures.length} of ${lineItems.length} added\n`;
        if (lineFailures.length > 0) {
          message += `\n_Some line items could not be added:_\n${lineFailures.map((failure) => `- ${failure}`).join("\n")}\n`;
        }
        return { result: message };
      }

      case "prepare_create_requisition": {
        let summary = `## Purchase Requisition Preview\n\n`;
        summary += `**Description:** ${args.description}\n`;
        if (args.requestorName) summary += `**Requestor:** ${args.requestorName}\n`;
        summary += `**Currency:** ${args.currency || "AED"}\n`;
        if (args.needByDate) summary += `**Need By Date:** ${args.needByDate}\n`;
        summary += `\n_Note: The PR will be created in Draft status. You can add line items after creation._\n`;

        return {
          result: summary,
          pendingAction: {
            type: "create_requisition",
            data: args,
            summary: `Create PR "${args.description}"${args.requestorName ? ` for ${args.requestorName}` : ""} in ${args.currency || "AED"}`,
          },
        };
      }

      case "execute_create_requisition": {
        if (!args._confirmed) {
          return { result: "I've prepared the PR details above. Please use the **Confirm** button to create this requisition, or **Cancel** to abort." };
        }

        const body: any = {
          description: args.description,
          currency: args.currency || "AED",
        };
        if (args.requestorName) body.requestorName = args.requestorName;
        if (args.needByDate) body.needByDate = args.needByDate;

        const result = await procService.createRequisition(body);

        return { result: `Purchase Requisition **${(result as any).prNumber}** has been successfully created!\n\n- **Status**: Draft\n- **Description**: ${args.description}\n- **Currency**: ${args.currency || "AED"}\n\nYou can now add line items to this PR or ask me to add them.` };
      }

      case "prepare_add_pr_line": {
        const denied = await denyIfPrHidden(args.prNumber, sessionUser);
        if (denied) return denied;

        const resolution = await resolveAddPrLine(
          {
            prNumber: args.prNumber,
            itemDescription: args.itemDescription,
            quantity: args.quantity,
            unitCost: args.unitCost,
            itemMentions: args._itemMentions,
          },
          createAddPrLineDeps(),
        );
        if (resolution.status === "rejected") {
          return { result: resolution.message };
        }

        const { line } = resolution;
        return {
          result: formatAddPrLineConfirmation(line),
          pendingAction: {
            type: "add_pr_line",
            data: { prNumber: line.prNumber, resolvedLine: line },
            summary: `Add "${line.itemName}" (${line.quantity} × ${line.unitCost}) to ${line.prNumber}`,
          },
        };
      }

      case "execute_add_pr_line": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to add this line item, or **Cancel** to abort." };
        }

        const denied = await denyIfPrHidden(args.prNumber, sessionUser);
        if (denied) return denied;

        // The confirm round-trips through the client, so the line is re-resolved
        // when it comes back without the payload prepare produced.
        const deps = createAddPrLineDeps();
        let line: ResolvedPrLine | null = (args.resolvedLine as ResolvedPrLine) ?? null;
        if (!line?.itemId) {
          const resolution = await resolveAddPrLine(
            {
              prNumber: args.prNumber,
              itemDescription: args.itemDescription,
              quantity: args.quantity,
              unitCost: args.unitCost,
              itemMentions: args._itemMentions,
            },
            deps,
          );
          if (resolution.status === "rejected") return { result: resolution.message };
          line = resolution.line;
        }

        // Quantity, price and unit are what the user confirmed; everything that
        // identifies master data is read again here, so nothing the payload
        // picked up in transit can reach the line.
        const pr = await deps.loadPrContext(line.prNumber);
        if (!pr) return { result: prNotFoundMessage(line.prNumber) };
        const item = await deps.getItemMasterById(line.itemId);
        if (!item) return { result: formatItemNotFoundMessage(line.itemName) };
        line = {
          ...line,
          currency: pr.currency,
          itemName: item.name,
          itemCode: item.itemCode ?? null,
          categoryCode: item.categoryCode ?? null,
          categoryName: item.categoryName ?? null,
        };

        await procService.addRequisitionLine(line.prNumber, buildAddPrLineBody(line));

        audit(
          sessionUser,
          line.prNumber,
          "UPDATE",
          `Line item "${line.itemName}" added to Purchase Requisition ${line.prNumber}`,
        );

        return { result: formatAddPrLineResult(line) };
      }

      case "prepare_update_pr_line": {
        const loaded = await loadPrForEdit(args.prNumber, sessionUser);
        if ("error" in loaded) return { result: loaded.error };

        const target = resolvePrLineTarget(loaded.lines, {
          lineId: args.lineId,
          lineNumber: args.lineNumber,
          itemQuery: args.itemName,
        });
        const targetMessage = formatPrLineTargetMessage(loaded.prNumber, target);
        if (targetMessage || target.status !== "resolved") {
          return { result: targetMessage || `I couldn't work out which line to change.` };
        }

        const edit = buildPrLineEdit(target.line, args);
        if (edit.error) return { result: edit.error };

        return {
          result:
            `## Update Line Item on ${loaded.prNumber}\n\n` +
            `**${formatPrLineLabel(target.line)}**\n\n` +
            `**Changes to apply:**\n${formatChangeList(edit.changes)}\n\n` +
            `_Line total becomes ${loaded.currency} ${edit.lineTotal.toLocaleString()}._\n`,
          pendingAction: {
            type: "update_pr_line",
            data: { ...args, prNumber: loaded.prNumber, lineId: target.line.id },
            summary: `Update line ${target.line.line_num ?? target.line.id} on ${loaded.prNumber}`,
          },
        };
      }

      case "execute_update_pr_line": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to apply these changes, or **Cancel** to abort." };
        }

        const loaded = await loadPrForEdit(args.prNumber, sessionUser);
        if ("error" in loaded) return { result: loaded.error };

        const target = resolvePrLineTarget(loaded.lines, {
          lineId: args.lineId,
          lineNumber: args.lineNumber,
          itemQuery: args.itemName,
        });
        const targetMessage = formatPrLineTargetMessage(loaded.prNumber, target);
        if (targetMessage || target.status !== "resolved") {
          return { result: targetMessage || `I couldn't work out which line to change.` };
        }

        const edit = buildPrLineEdit(target.line, args);
        if (edit.error) return { result: edit.error };

        await procService.updateRequisitionLine(
          loaded.prNumber,
          String(target.line.id),
          edit.body,
        );

        audit(
          sessionUser,
          loaded.prNumber,
          "UPDATE",
          `Purchase Requisition ${loaded.prNumber} line ${target.line.line_num ?? target.line.id} updated (${edit.changes
            .map((change) => change.label)
            .join(", ")})`,
        );

        return {
          result:
            `Line item on **${loaded.prNumber}** updated.\n\n` +
            `${formatChangeList(edit.changes)}\n\n` +
            `_Line total is now ${loaded.currency} ${edit.lineTotal.toLocaleString()}. ` +
            `Everything else on that line is unchanged._\n`,
        };
      }

      case "prepare_update_requisition": {
        const denied = await denyIfPrHidden(args.prNumber, sessionUser);
        if (denied) return denied;

        let summary = `## Update Requisition ${args.prNumber}\n\n`;
        summary += `**Changes to apply:**\n`;
        if (args.description) summary += `- Description → ${args.description}\n`;
        if (args.currency) summary += `- Currency → ${args.currency}\n`;
        if (args.needByDate) summary += `- Need By Date → ${args.needByDate}\n`;
        if (!args.description && !args.currency && !args.needByDate) {
          return { result: "No changes specified. Please provide at least one field to update (description, currency, or needByDate)." };
        }

        return {
          result: summary,
          pendingAction: {
            type: "update_requisition",
            data: args,
            summary: `Update ${args.prNumber}${args.description ? ` — "${args.description}"` : ""}`,
          },
        };
      }

      case "execute_update_requisition": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to apply these changes, or **Cancel** to abort." };
        }

        const denied = await denyIfPrHidden(args.prNumber, sessionUser);
        if (denied) return denied;

        const updateBody: any = {};
        if (args.description) updateBody.description = args.description;
        if (args.currency) updateBody.currency = args.currency;
        if (args.needByDate) updateBody.needByDate = args.needByDate;

        const detail = await procService.getRequisitionDetail(args.prNumber);
        if (!detail) return { result: prNotFoundMessage(args.prNumber) };

        await procService.updateRequisition(args.prNumber, updateBody);

        audit(
          sessionUser,
          args.prNumber,
          "UPDATE",
          `Purchase Requisition ${args.prNumber} updated (${Object.keys(updateBody).join(", ")})`,
        );

        let result = `Requisition **${args.prNumber}** updated successfully!\n\n`;
        if (args.description) result += `- **Description**: ${args.description}\n`;
        if (args.currency) result += `- **Currency**: ${args.currency}\n`;
        if (args.needByDate) result += `- **Need By Date**: ${args.needByDate}\n`;
        result += `\n_Everything else on ${args.prNumber} is unchanged._\n`;

        return { result };
      }

      case "prepare_submit_requisition": {
        const denied = await denyIfPrHidden(args.prNumber, sessionUser);
        if (denied) return denied;

        const detail = await procService.getRequisitionDetail(args.prNumber);
        if (!detail) return { result: prNotFoundMessage(args.prNumber) };

        const h = detail.header as any;
        const lines = detail.lines as any[];
        const lineCount = lines?.length || 0;

        const status = (h.pr_status || "").toLowerCase().trim();
        if (status !== "draft" && status !== "more info required") {
          return { result: `Cannot submit ${args.prNumber} — current status is "${h.pr_status}". Only Draft requisitions can be submitted.` };
        }

        // Same completeness rule the submit endpoint enforces, so "is it ready?"
        // and "submit it" can never disagree.
        const readiness = checkRequisitionSubmitReadiness(h, lineCount);
        if (!readiness.ready) {
          return { result: formatRequisitionReadinessMessage(args.prNumber, readiness) };
        }

        let summary = `## Submit ${args.prNumber} for Approval\n\n`;
        summary += `**Description:** ${h.description || h.pr_description || "N/A"}\n`;
        summary += `**Status:** ${h.pr_status} → Pending Approval\n`;
        summary += `**Line Items:** ${lineCount}\n`;
        if (h.pr_amount) summary += `**Total Amount:** ${h.currency} ${Number(h.pr_amount).toLocaleString()}\n`;
        summary += `\n_This will send the requisition into the approval workflow._\n`;

        return {
          result: summary,
          pendingAction: {
            type: "submit_requisition",
            data: { prNumber: args.prNumber },
            summary: `Submit ${args.prNumber} for approval (${lineCount} line items)`,
          },
        };
      }

      case "execute_submit_requisition": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to submit this requisition, or **Cancel** to abort." };
        }

        const denied = await denyIfPrHidden(args.prNumber, sessionUser);
        if (denied) return denied;

        const submitResult = await procService.submitRequisition(args.prNumber, sessionUser || { username: "system" });

        let response = `Requisition **${args.prNumber}** has been submitted for approval!\n\n`;
        response += `- **New Status**: Pending Approval\n`;
        if ((submitResult as any).approvers?.length > 0) {
          response += `- **Approvers**: ${(submitResult as any).approvers.join(", ")}\n`;
        }
        response += `\nThe approvers will be notified to review this requisition.`;

        return { result: response };
      }

      case "prepare_submit_purchase_order": {
        const poNumber = String(args.poNumber || "").trim();
        if (!poNumber) return { result: "Please provide a PO number." };

        const detail = await procService.getPurchaseOrderDetail(poNumber);
        if (!detail) return { result: `No purchase order found with number ${poNumber}.` };

        const po = detail as any;
        const items = (po.items as any[]) || [];
        const lineCount = items.length;
        const totalAmount = Number(po.po_total_cost) || 0;
        const currency = po.po_currency || "AED";

        if ((po.po_status || "").toLowerCase() !== "draft") {
          return {
            result: `Cannot submit ${poNumber} — current status is "${po.po_status}". Only Draft purchase orders can be submitted.`,
          };
        }

        if (lineCount === 0) {
          return {
            result: `Cannot submit ${poNumber} — it has no line items. Please add at least one line item first.`,
          };
        }

        if (totalAmount <= 0) {
          return {
            result: `Cannot submit ${poNumber} — purchase order amount must be greater than zero.`,
          };
        }

        const budgetCheck = await validatePoBudgetForAgentSubmit(po);
        if (!budgetCheck.ok) {
          let blocked = `## Cannot Submit ${poNumber} — Budget Check Failed\n\n`;
          blocked += `**Description:** ${po.po_description || "N/A"}\n`;
          blocked += `**Total Amount:** ${currency} ${totalAmount.toLocaleString()}\n`;
          if (po.budget_name) blocked += `**Budget:** ${po.budget_name}\n`;
          if (po.department_name) blocked += `**Department:** ${po.department_name}\n`;
          blocked += `\n**Budget check:** ${budgetCheck.message}\n`;
          blocked += `\nAdjust the PO amount or budget assignment, then try submitting again.`;
          return { result: blocked };
        }

        let summary = `## Submit ${poNumber} for Approval\n\n`;
        summary += `**Description:** ${po.po_description || "N/A"}\n`;
        summary += `**Status:** ${po.po_status} → Pending Approval\n`;
        summary += `**Line Items:** ${lineCount}\n`;
        summary += `**Total Amount:** ${currency} ${totalAmount.toLocaleString()}\n`;
        if (po.company_name || po.supplier_name) {
          summary += `**Vendor:** ${po.company_name || po.supplier_name}\n`;
        }
        if (po.budget_name) summary += `**Budget:** ${po.budget_name}\n`;
        if (po.department_name) summary += `**Department:** ${po.department_name}\n`;
        if (po.pr_number) summary += `**Linked PR:** ${po.pr_number}\n`;
        summary += `\n**Budget check:** Passed — ${budgetCheck.message}\n`;
        summary += `\n_This will send the purchase order into the approval workflow._\n`;

        return {
          result: summary,
          pendingAction: {
            type: "submit_purchase_order",
            data: { poNumber },
            summary: `Submit ${poNumber} for approval (${lineCount} line items, budget OK)`,
          },
        };
      }

      case "execute_submit_purchase_order": {
        if (!args._confirmed) {
          return {
            result:
              "Please use the **Confirm** button to submit this purchase order, or **Cancel** to abort.",
          };
        }

        const poNumber = String(args.poNumber || "").trim();
        if (!poNumber) return { result: "Please provide a PO number." };

        const detail = await procService.getPurchaseOrderDetail(poNumber);
        if (!detail) return { result: `No purchase order found with number ${poNumber}.` };

        const po = detail as any;
        const items = (po.items as any[]) || [];
        const totalAmount = Number(po.po_total_cost) || 0;

        if ((po.po_status || "").toLowerCase() !== "draft") {
          return {
            result: `Cannot submit ${poNumber} — current status is "${po.po_status}". Only Draft purchase orders can be submitted.`,
          };
        }
        if (items.length === 0) {
          return {
            result: `Cannot submit ${poNumber} — it has no line items. Please add at least one line item first.`,
          };
        }
        if (totalAmount <= 0) {
          return {
            result: `Cannot submit ${poNumber} — purchase order amount must be greater than zero.`,
          };
        }

        const budgetCheck = await validatePoBudgetForAgentSubmit(po);
        if (!budgetCheck.ok) {
          return {
            result: `Cannot submit ${poNumber}: ${budgetCheck.message}`,
          };
        }

        await procService.submitPurchaseOrder(
          poNumber,
          sessionUser || { username: "system" },
        );

        let response = `Purchase Order **${poNumber}** has been submitted for approval!\n\n`;
        response += `- **New Status**: Pending Approval\n`;
        response += `- **Budget check**: Passed\n`;
        response += `\nThe approvers will be notified to review this purchase order.`;

        return { result: response };
      }

      case "prepare_create_po_from_pr": {
        const denied = await denyIfPrHidden(args.prNumber, sessionUser);
        if (denied) return denied;

        const prDetail = await procService.getRequisitionDetail(args.prNumber);
        if (!prDetail) return { result: prNotFoundMessage(args.prNumber) };

        const prH = prDetail.header as any;
        const prLines = prDetail.lines as any[];

        const { pool } = await import("../db");
        const suppResult = await pool.query(
          `SELECT id, company_name, email_id, phone, city, country FROM dbo.supp_basic_org_dtls WHERE id = $1`,
          [args.supplierId]
        );
        const supplier = suppResult.rows[0];
        if (!supplier) return { result: `Supplier with ID ${args.supplierId} not found. Please provide a valid supplier ID.` };

        let summary = `## Create Purchase Order from ${args.prNumber}\n\n`;
        summary += `**PR Description:** ${prH.description || prH.pr_description || "N/A"}\n`;
        summary += `**PR Status:** ${prH.pr_status}\n`;
        summary += `**Supplier:** ${supplier.company_name} (ID: ${supplier.id})\n`;
        if (supplier.city || supplier.country) summary += `**Location:** ${[supplier.city, supplier.country].filter(Boolean).join(", ")}\n`;
        summary += `**Line Items:** ${prLines?.length || 0}\n`;
        if (prH.pr_amount) summary += `**Total Amount:** ${prH.currency || "AED"} ${Number(prH.pr_amount).toLocaleString()}\n`;
        summary += `\n_A new PO in Draft status will be created with all PR line items._\n`;

        return {
          result: summary,
          pendingAction: {
            type: "create_po_from_pr",
            data: { prNumber: args.prNumber, supplierId: args.supplierId },
            summary: `Create PO from ${args.prNumber} for ${supplier.company_name}`,
          },
        };
      }

      case "execute_create_po_from_pr": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to create this PO, or **Cancel** to abort." };
        }

        const denied = await denyIfPrHidden(args.prNumber, sessionUser);
        if (denied) return denied;

        const poResult = await procService.createPOFromPR(
          { prNumber: args.prNumber, supplierId: args.supplierId },
          sessionUser || {}
        );

        return { result: `Purchase Order **${(poResult as any).poNumber}** has been created from ${args.prNumber}!\n\n- **Status**: Draft\n- **Linked PR**: ${args.prNumber}\n\nYou can now review and submit this PO for approval.` };
      }

      case "prepare_create_purchase_order": {
        // Bare header prepare (fallback). Prefer recommend_purchase_order for conversational Direct PO.
        let supplierNameFromLookup: string | null = null;
        if (args.supplierId != null && args.supplierId !== "") {
          const supplier = await vendorService.getDboSupplier(args.supplierId);
          if (!supplier) {
            return { result: `Supplier with ID ${args.supplierId} not found. Please provide a valid supplier ID.` };
          }
          supplierNameFromLookup =
            (supplier as any).companyName ||
            (supplier as any).company_name ||
            (supplier as any).supplier_name ||
            null;
        }

        if (supplierNameFromLookup && !args.supplierName) {
          args = { ...args, supplierName: supplierNameFromLookup };
        }

        const lookups = await resolveAllDirectPoLookups(args, sessionUser);
        if (lookups.error) {
          return {
            result: lookups.error,
            pendingAction: lookups.choice
              ? buildSelectOptionPendingAction(lookups.choice)
              : undefined,
          };
        }

        const draft = buildDirectPoDraft(args, sessionUser, {
          supplierNameFromLookup,
          resolvedOrg: lookups.resolvedOrg,
          resolvedBudget: lookups.resolvedBudget,
          resolvedDepartment: lookups.resolvedDepartment,
          resolvedLocation: lookups.resolvedLocation,
          resolvedPaymentTerms: lookups.resolvedPaymentTerms,
          resolvedBuyer: lookups.resolvedBuyer,
          defaultCurrency: lookups.defaultCurrency,
        });
        const validation = validateDirectPoMandatoryFields(draft);
        if (!validation.ok) {
          return {
            result: formatDirectPoValidationMessage(validation, {
              heading: "Cannot prepare Direct PO yet",
            }),
          };
        }

        const flat = flattenDirectPoDraft(draft);
        const supplierLabel =
          (flat.supplierName as string) ||
          (flat.supplierId != null ? `ID ${flat.supplierId}` : "vendor TBD");

        return {
          result: formatDirectPoPreparePreview(draft),
          pendingAction: {
            type: "create_purchase_order",
            data: flat,
            summary: `Create PO "${flat.description}" for ${supplierLabel}`,
          },
        };
      }

      case "execute_create_purchase_order": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to create this PO, or **Cancel** to abort." };
        }

        let supplierNameFromLookup: string | null = null;
        if (args.supplierId != null && args.supplierId !== "") {
          const supplier = await vendorService.getDboSupplier(args.supplierId);
          if (!supplier) {
            return { result: `Supplier with ID ${args.supplierId} not found. Please provide a valid supplier ID.` };
          }
          supplierNameFromLookup =
            (supplier as any).companyName ||
            (supplier as any).company_name ||
            (supplier as any).supplier_name ||
            null;
        }

        if (supplierNameFromLookup && !args.supplierName) {
          args = { ...args, supplierName: supplierNameFromLookup };
        }

        const lookups = await resolveAllDirectPoLookups(args, sessionUser);
        if (lookups.error) {
          return {
            result: lookups.error,
            pendingAction: lookups.choice
              ? buildSelectOptionPendingAction(lookups.choice)
              : undefined,
          };
        }

        const draft = buildDirectPoDraft(args, sessionUser, {
          supplierNameFromLookup,
          resolvedOrg: lookups.resolvedOrg,
          resolvedBudget: lookups.resolvedBudget,
          resolvedDepartment: lookups.resolvedDepartment,
          resolvedLocation: lookups.resolvedLocation,
          resolvedPaymentTerms: lookups.resolvedPaymentTerms,
          resolvedBuyer: lookups.resolvedBuyer,
          defaultCurrency: lookups.defaultCurrency,
        });
        const validation = validateDirectPoMandatoryFields(draft);

        if (!validation.ok) {
          // Safety net: never call createPurchaseOrder with incomplete mandatory fields.
          return {
            result: formatDirectPoValidationMessage(validation, {
              heading: "Cannot create Direct PO — mandatory fields missing",
            }),
          };
        }

        if (!isNumericOrgId(draft.orgId.value)) {
          return {
            result:
              `Cannot create Direct PO: Business Entity orgId must be a numeric organization ID ` +
              `(got "${String(draft.orgId.value)}"). Resolve the entity by name via search_organizations first.`,
          };
        }
        if (!isCanonicalNumericId(draft.budgetId.value)) {
          return {
            result:
              `Cannot create Direct PO: budgetId must be a numeric budget line ID ` +
              `(got "${String(draft.budgetId.value)}"). Resolve via search_budgets.`,
          };
        }
        if (!isCanonicalNumericId(draft.requestorDepartment.value)) {
          return {
            result:
              `Cannot create Direct PO: Department must be a numeric id ` +
              `(got "${String(draft.requestorDepartment.value)}"). Resolve via search_departments.`,
          };
        }
        if (!isCanonicalNumericId(draft.deliveryLocation.value)) {
          return {
            result:
              `Cannot create Direct PO: Delivery Location must be a numeric id ` +
              `(got "${String(draft.deliveryLocation.value)}"). Resolve via search_locations.`,
          };
        }
        if (!draft.paymentTermsId.value || String(draft.paymentTermsId.value).trim() === "") {
          return {
            result:
              `Cannot create Direct PO: Payment Terms are unresolved. ` +
              `Provide a term name (e.g. Net 30) or ensure Admin Payment Settings has a default.`,
          };
        }

        const poBody = toCreatePurchaseOrderPayload(draft);
        // Defensive: never send a non-numeric orgId to the DB layer.
        if (!isNumericOrgId(poBody.orgId)) {
          return {
            result:
              `Cannot create Direct PO: invalid Business Entity orgId "${String(poBody.orgId)}". ` +
              `Provide the Business Entity by name and I will resolve it.`,
          };
        }

        const poResult = await procService.createPurchaseOrder(poBody);

        return {
          result:
            `Purchase Order **${(poResult as any).poNumber}** has been successfully created!\n\n` +
            `- **Status**: Draft\n` +
            `- **Description**: ${poBody.description}\n` +
            `- **Supplier**: ${poBody.supplierName || poBody.supplierId}\n` +
            `- **Business Entity**: ${poBody.orgName || poBody.orgId}\n` +
            `- **Budget**: ${poBody.budgetName || poBody.budgetId}\n` +
            `- **Department**: ${draft.requestorDepartmentName.value || poBody.requestorDepartment}\n` +
            `- **Delivery Location**: ${draft.deliveryLocationName.value || poBody.deliveryLocation}\n` +
            `- **Payment Terms**: ${poBody.paymentTermsName || poBody.paymentTermsId}\n` +
            `- **Currency**: ${poBody.currency}\n` +
            `- **Required Date**: ${poBody.requiredDate}\n\n` +
            `You can now add line items with prepare_add_po_line, or ask me to add them.`,
        };
      }

      case "prepare_add_po_line": {
        const resolution = await resolveAddPoLine(
          {
            poNumber: args.poNumber,
            itemDescription: args.description,
            quantity: args.quantity,
            unitPrice: args.unitPrice,
            taxRate: args.taxRate,
            itemMentions: args._itemMentions,
          },
          createAddPoLineDeps(),
        );
        if (resolution.status === "rejected") {
          return { result: resolution.message };
        }

        const { line } = resolution;
        return {
          result: formatAddPoLineConfirmation(line),
          pendingAction: {
            type: "add_po_line",
            data: { poNumber: line.poNumber, resolvedLine: line },
            summary: `Add "${line.itemName}" (${line.quantity} × ${line.unitPrice}) to ${line.poNumber}`,
          },
        };
      }

      case "execute_add_po_line": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to add this line item, or **Cancel** to abort." };
        }

        const deps = createAddPoLineDeps();
        let line: ResolvedPoLine | null = (args.resolvedLine as ResolvedPoLine) ?? null;
        if (!line?.itemId) {
          const resolution = await resolveAddPoLine(
            {
              poNumber: args.poNumber,
              itemDescription: args.description,
              quantity: args.quantity,
              unitPrice: args.unitPrice,
              taxRate: args.taxRate,
              itemMentions: args._itemMentions,
            },
            deps,
          );
          if (resolution.status === "rejected") return { result: resolution.message };
          line = resolution.line;
        }

        // Quantity, price and UOM are what the user confirmed. Refresh the PO
        // currency and Item Master metadata so category/id cannot be tampered
        // with while the confirmation payload round-trips through the client.
        const po = await deps.loadPrContext(line.poNumber);
        if (!po) return { result: `No purchase order found with number ${line.poNumber}.` };
        const item = await deps.getItemMasterById(line.itemId);
        if (!item) return { result: formatItemNotFoundMessage(line.itemName) };
        line = {
          ...line,
          currency: po.currency,
          itemName: item.name,
          itemCode: item.itemCode ?? null,
          categoryCode: item.categoryCode ?? null,
          categoryName: item.categoryName ?? null,
          lineCost: line.quantity * line.unitPrice,
          taxAmount: line.quantity * line.unitPrice * (line.taxRate / 100),
        };

        await procService.addPoLine(line.poNumber, buildAddPoLineBody(line));

        audit(
          sessionUser,
          line.poNumber,
          "UPDATE",
          `Line item "${line.itemName}" added to Purchase Order ${line.poNumber}`,
        );

        return { result: formatAddPoLineResult(line) };
      }

      case "prepare_update_purchase_order": {
        const loaded = await loadPoForEdit(args.poNumber);
        if ("error" in loaded) return { result: loaded.error };

        const resolution = await resolvePoHeaderEdit(loaded.po, args, sessionUser);
        if (resolution.error) {
          return {
            result: resolution.error,
            pendingAction: resolution.choice
              ? buildSelectOptionPendingAction(resolution.choice)
              : undefined,
          };
        }

        const summary =
          `## Update Purchase Order ${loaded.po.po_number}\n\n` +
          `**Changes to apply:**\n${formatPoChangeList(resolution.changes)}\n\n` +
          `_Everything else on ${loaded.po.po_number} stays as it is._\n`;

        return {
          result: summary,
          pendingAction: {
            type: "update_purchase_order",
            data: args,
            summary: `Update ${loaded.po.po_number} — ${resolution.changes
              .map((change) => change.label)
              .join(", ")}`,
          },
        };
      }

      case "execute_update_purchase_order": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to apply these changes, or **Cancel** to abort." };
        }

        const loaded = await loadPoForEdit(args.poNumber);
        if ("error" in loaded) return { result: loaded.error };

        const resolution = await resolvePoHeaderEdit(loaded.po, args, sessionUser);
        if (resolution.error) {
          return {
            result: resolution.error,
            pendingAction: resolution.choice
              ? buildSelectOptionPendingAction(resolution.choice)
              : undefined,
          };
        }

        await procService.updatePurchaseOrder(loaded.po.po_number, resolution.body);

        audit(
          sessionUser,
          loaded.po.po_number,
          "UPDATE",
          `Purchase Order ${loaded.po.po_number} updated (${resolution.changes
            .map((change) => change.label)
            .join(", ")})`,
        );

        return {
          result:
            `Purchase Order **${loaded.po.po_number}** updated.\n\n` +
            `${formatPoChangeList(resolution.changes)}\n\n` +
            `_Everything else on ${loaded.po.po_number} is unchanged._\n`,
        };
      }

      case "prepare_update_po_line": {
        const loaded = await loadPoForEdit(args.poNumber);
        if ("error" in loaded) return { result: loaded.error };

        const lineBlocked = poLineEditBlockedMessage(loaded.po);
        if (lineBlocked) return { result: lineBlocked };

        const target = resolvePoLineTarget(loaded.lines, {
          lineId: args.lineId,
          lineNumber: args.lineNumber,
          itemQuery: args.itemName,
        });
        const targetMessage = formatPoLineTargetMessage(loaded.po.po_number, target);
        if (targetMessage || target.status !== "resolved") {
          return { result: targetMessage || `I couldn't work out which line to change.` };
        }

        const edit = buildPoLineEdit(loaded.po, target.line, args);
        if (edit.error) return { result: edit.error };

        return {
          result:
            `## Update Line Item on ${loaded.po.po_number}\n\n` +
            `**${formatPoLineLabel(target.line)}**\n\n` +
            `**Changes to apply:**\n${formatPoChangeList(edit.changes)}\n\n` +
            `_Line total becomes ${loaded.po.po_currency || ""} ${edit.lineTotal.toLocaleString()}` +
            `${edit.taxAmount > 0 ? ` plus ${edit.taxAmount.toLocaleString()} tax` : ""}._\n`,
          pendingAction: {
            type: "update_po_line",
            data: { ...args, lineId: target.line.id },
            summary: `Update line ${target.line.po_line_number ?? target.line.id} on ${loaded.po.po_number}`,
          },
        };
      }

      case "execute_update_po_line": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to apply these changes, or **Cancel** to abort." };
        }

        const loaded = await loadPoForEdit(args.poNumber);
        if ("error" in loaded) return { result: loaded.error };

        const lineBlocked = poLineEditBlockedMessage(loaded.po);
        if (lineBlocked) return { result: lineBlocked };

        const target = resolvePoLineTarget(loaded.lines, {
          lineId: args.lineId,
          lineNumber: args.lineNumber,
          itemQuery: args.itemName,
        });
        const targetMessage = formatPoLineTargetMessage(loaded.po.po_number, target);
        if (targetMessage || target.status !== "resolved") {
          return { result: targetMessage || `I couldn't work out which line to change.` };
        }

        const edit = buildPoLineEdit(loaded.po, target.line, args);
        if (edit.error) return { result: edit.error };

        await procService.updatePoLine(loaded.po.po_number, String(target.line.id), edit.body);

        audit(
          sessionUser,
          loaded.po.po_number,
          "UPDATE",
          `Purchase Order ${loaded.po.po_number} line ${target.line.po_line_number ?? target.line.id} updated (${edit.changes
            .map((change) => change.label)
            .join(", ")})`,
        );

        return {
          result:
            `Line item updated on **${loaded.po.po_number}**.\n\n` +
            `${formatPoChangeList(edit.changes)}\n\n` +
            `- **Line Total**: ${loaded.po.po_currency || ""} ${edit.lineTotal.toLocaleString()}\n` +
            `${edit.taxAmount > 0 ? `- **Tax**: ${edit.taxAmount.toLocaleString()}\n` : ""}` +
            `\nThe PO totals have been recalculated.`,
        };
      }

      case "search_categories": {
        const limit = Math.min(args.limit || 20, 50);
        const page = Math.max(args.page || 1, 1);
        const query: any = {};
        if (args.search) query.search = args.search;
        if (args.level) query.level = args.level;
        else if (!args.search && !args.parentCode) query.level = "segment";
        if (args.parentCode) query.parent = args.parentCode;

        const categories = await procService.getCategories(query);
        const allItems = Array.isArray(categories) ? categories : [];
        const total = allItems.length;
        const totalPages = Math.ceil(total / limit);
        const startIdx = (page - 1) * limit;
        const items = allItems.slice(startIdx, startIdx + limit);

        if (items.length === 0) {
          if (page > 1) return { result: `No more categories to show (you've reached the end).` };
          return { result: `No categories found${args.search ? ` matching "${args.search}"` : ""}${args.level ? ` at level "${args.level}"` : ""}.` };
        }

        const isSegmentView = !args.search && !args.parentCode && !args.level;

        const formatted = items.map((c: any, idx: number) => {
          let entry = `**${startIdx + idx + 1}. ${c.name || c.category_name || "Category"}**\n`;
          if (c.code || c.category_code) entry += `   Code: ${c.code || c.category_code}\n`;
          if (c.level) entry += `   Level: ${c.level}\n`;
          if (c.parentCode || c.parent_code) entry += `   Parent: ${c.parentCode || c.parent_code}\n`;
          if (c.description) entry += `   Description: ${c.description.substring(0, 100)}\n`;
          return entry;
        }).join("\n");

        let header = "";
        if (isSegmentView) {
          header = `Here are the top-level category segments (${total}):\n\n`;
        } else {
          header = `Showing page ${page} of ${totalPages} (${total} total)`;
          if (page < totalPages) header += ` — say "show more" to see the next page`;
          header += `\n\n`;
        }

        let footer = "";
        if (isSegmentView) {
          footer = `\n\n_To explore sub-categories, ask me to show categories under a specific code (e.g. "show categories under 43" for IT sub-categories)._`;
        } else if (page < totalPages) {
          footer = `\n\n_Say "show more" to see the next page._`;
        }

        return { result: `${header}${formatted}${footer}` };
      }

      case "get_category_details": {
        if (!args.code) return { result: "Please provide a category code." };

        const category = await procService.getCategoryByCode(args.code);
        if (!category) return { result: `No category found with code ${args.code}.` };

        const c = category as any;
        let info = `## Category: ${c.name || c.category_name || args.code}\n\n`;
        if (c.code || c.category_code) info += `**Code:** ${c.code || c.category_code}\n`;
        if (c.level) info += `**Level:** ${c.level}\n`;
        if (c.parentCode || c.parent_code) info += `**Parent Code:** ${c.parentCode || c.parent_code}\n`;
        if (c.description) info += `**Description:** ${c.description}\n`;
        if (c.status) info += `**Status:** ${c.status}\n`;

        return { result: info };
      }

      case "search_vendors": {
        const limit = Math.min(args.limit || 20, 50);
        const page = Math.max(args.page || 1, 1);

        const result = await vendorService.getDboSuppliersPaginated({
          page,
          limit,
          status: args.status && args.status !== "all" ? args.status : undefined,
          search: args.search || undefined,
        });

        const rows = (result as any).data || [];
        const total = (result as any).pagination?.total || rows.length;
        const totalPages = Math.ceil(total / limit);

        if (rows.length === 0) {
          const filters = [args.search && `matching "${args.search}"`, args.status && args.status !== "all" && `status "${args.status}"`].filter(Boolean).join(", ");
          if (page > 1) return { result: `No more vendors to show (you've reached the end).` };
          return { result: `No vendors found${filters ? ` with ${filters}` : ""}.` };
        }

        const startIdx = (page - 1) * limit;
        const formatted = rows.map((s: any, idx: number) => {
          let entry = `**${startIdx + idx + 1}. ${s.companyName || s.company_name || "N/A"}** (ID: ${s.id})\n`;
          if (s.city || s.country) entry += `   Location: ${[s.city, s.country].filter(Boolean).join(", ")}\n`;
          if (s.phone) entry += `   Phone: ${s.phone}\n`;
          if (s.emailId || s.email_id) entry += `   Email: ${s.emailId || s.email_id}\n`;
          if (s.status) entry += `   Status: ${s.status}\n`;
          return entry;
        }).join("\n");

        let pagination = `Showing page ${page} of ${totalPages} (${total} total)`;
        if (page < totalPages) pagination += ` — say "show more" to see the next page`;

        const vendorChoice =
          args.search && rows.length >= 2
            ? vendorChoiceFromRows(String(args.search), rows)
            : null;

        return {
          result: `${pagination}\n\n${formatted}`,
          pendingAction: vendorChoice
            ? buildSelectOptionPendingAction(vendorChoice)
            : undefined,
        };
      }

      case "search_organizations": {
        const orgs = await loadOrganizations();
        const search = args.search != null ? String(args.search).trim() : "";
        let matches = orgs;
        if (search) {
          const match = matchBusinessEntityByName(orgs, search);
          if (match.status === "resolved") {
            matches = orgs.filter((o) => Number(o.id) === match.orgId);
          } else if (match.status === "ambiguous") {
            const ids = new Set(match.candidates.map((c) => c.id));
            matches = orgs.filter((o) => ids.has(Number(o.id)));
          } else {
            matches = [];
          }
        }
        const limit = Math.min(args.limit || 20, 50);
        const slice = matches.slice(0, limit);
        if (slice.length === 0) {
          return {
            result: search
              ? formatBusinessEntityNotFoundMessage(search)
              : "No business entities found.",
          };
        }
        // Show names prominently; include id only for the model to pass as orgId after resolution.
        const formatted = slice
          .map((o, i) => {
            const name = String(o.organization_name || "").trim() || "N/A";
            const currency = o.currency ? `, Currency: ${o.currency}` : "";
            return `**${i + 1}. ${name}** (orgId: ${o.id}${currency})`;
          })
          .join("\n");
        const header = search
          ? `Business entities matching "${search}" (${matches.length}):`
          : `Business entities (${matches.length}):`;
        const orgChoice =
          search && slice.length >= 2
            ? businessEntityChoiceFromCandidates(
                search,
                slice.map((o) => ({
                  id: Number(o.id),
                  name: String(o.organization_name || "").trim(),
                  currency: o.currency ?? null,
                })),
              )
            : null;
        return {
          result:
            `${header}\n\n${formatted}\n\n` +
            `_When creating a Direct PO, pass orgName (the display name) or the numeric orgId from this list — never invent an ID._`,
          pendingAction: orgChoice
            ? buildSelectOptionPendingAction(orgChoice)
            : undefined,
        };
      }

      case "search_budgets": {
        const lines = uniqueBudgetLines(await loadApprovedBudgetLines());
        const search = args.search != null ? String(args.search).trim() : "";
        let matches = lines;
        if (search) {
          // Ordinal / id against last shortlist
          const remembered = getRememberedBudgetAmbiguity(sessionUser);
          const picked = pickBudgetFromCandidates(search, remembered);
          if (picked) {
            clearBudgetAmbiguity(sessionUser);
            return {
              result:
                `Selected budget option:\n\n` +
                `**${picked.budgetName}** — budgetId: ${picked.budgetId}` +
                (picked.segmentCode ? `, code: ${picked.segmentCode}` : "") +
                `\n\n_Use budgetId ${picked.budgetId} (or budgetName with this id) on prepare_create_purchase_order._`,
            };
          }

          const match = matchBudget(lines, search);
          if (match.status === "resolved") {
            clearBudgetAmbiguity(sessionUser);
            matches = lines.filter((l) => Number(l.id) === match.budgetId);
          } else if (match.status === "ambiguous") {
            rememberBudgetAmbiguity(sessionUser, match.candidates);
            const choice = budgetChoiceFromCandidates(match.query, match.candidates);
            return {
              result: formatBudgetAmbiguity(match.query, match.candidates),
              pendingAction: choice
                ? buildSelectOptionPendingAction(choice)
                : undefined,
            };
          } else {
            return { result: formatBudgetNotFound(search) };
          }
        }
        const limit = Math.min(args.limit || 20, 50);
        const slice = matches.slice(0, limit);
        if (slice.length === 0) return { result: "No approved budgets found." };
        if (slice.length > 1 && search) {
          rememberBudgetAmbiguity(sessionUser, slice.map(toBudgetCandidate));
        }
        const formatted = slice.map((l, i) => formatBudgetSearchLine(l, i + 1)).join("\n");
        const budgetChoice =
          search && slice.length >= 2
            ? budgetChoiceFromCandidates(search, slice.map(toBudgetCandidate))
            : null;
        return {
          result:
            `${search ? `Budgets matching "${search}"` : "Approved budgets"} (${matches.length}):\n\n${formatted}\n\n` +
            `_If multiple options look the same, reply with the **option number** (1, 2, …) or the **budgetId**. ` +
            `Pass that budgetId to prepare_create_purchase_order — never invent an ID._`,
          pendingAction: budgetChoice
            ? buildSelectOptionPendingAction(budgetChoice)
            : undefined,
        };
      }

      case "search_departments": {
        const depts = await loadDepartments();
        const search = args.search != null ? String(args.search).trim() : "";
        let matches = depts.filter((d) => !d.status || String(d.status).toUpperCase() === "Y");
        if (search) {
          const match = matchDepartment(matches, search);
          if (match.status === "resolved") {
            matches = matches.filter((d) => Number(d.id) === match.departmentId);
          } else if (match.status === "ambiguous") {
            const ids = new Set(match.candidates.map((c) => c.departmentId));
            matches = matches.filter((d) => ids.has(Number(d.id)));
          } else {
            return { result: formatDepartmentNotFound(search) };
          }
        }
        const limit = Math.min(args.limit || 20, 50);
        const slice = matches.slice(0, limit);
        if (slice.length === 0) return { result: "No departments found." };
        const formatted = slice
          .map((d, i) => `**${i + 1}. ${d.value || d.code || d.id}**`)
          .join("\n");
        const deptChoice =
          search && slice.length >= 2
            ? departmentChoiceFromCandidates(
                search,
                slice.map((d) => ({
                  departmentId: Number(d.id),
                  departmentName: String(d.value || d.code || d.id).trim(),
                  code: d.code ?? null,
                })),
              )
            : null;
        return {
          result:
            `${search ? `Departments matching "${search}"` : "Departments"} (${matches.length}):\n\n${formatted}\n\n` +
            `_Pass the department name (e.g. IT) as requestorDepartment / requestorDepartmentName — do not invent IDs._`,
          pendingAction: deptChoice
            ? buildSelectOptionPendingAction(deptChoice)
            : undefined,
        };
      }

      case "search_locations": {
        const locations = await loadLocations();
        const search = args.search != null ? String(args.search).trim() : "";
        let matches = locations.filter((l) => !l.status || String(l.status).toUpperCase() === "Y");
        if (search) {
          const match = matchLocation(matches, search);
          if (match.status === "resolved") {
            matches = matches.filter((l) => Number(l.id) === match.locationId);
          } else if (match.status === "ambiguous") {
            const ids = new Set(match.candidates.map((c) => c.locationId));
            matches = matches.filter((l) => ids.has(Number(l.id)));
          } else {
            return { result: formatLocationNotFound(search) };
          }
        }
        const limit = Math.min(args.limit || 20, 50);
        const slice = matches.slice(0, limit);
        if (slice.length === 0) return { result: "No delivery locations found." };
        const formatted = slice
          .map((l, i) => `**${i + 1}. ${l.location_name || l.location_id || l.id}**`)
          .join("\n");
        const locChoice =
          search && slice.length >= 2
            ? locationChoiceFromCandidates(
                search,
                slice.map((l) => ({
                  locationId: Number(l.id),
                  locationName: String(l.location_name || l.location_id || l.id).trim(),
                  locationCode: l.location_id ?? null,
                })),
              )
            : null;
        return {
          result:
            `${search ? `Locations matching "${search}"` : "Delivery locations"} (${matches.length}):\n\n${formatted}\n\n` +
            `_Pass the location name (e.g. Mumbai) as deliveryLocation / deliveryLocationName — do not invent IDs._`,
          pendingAction: locChoice
            ? buildSelectOptionPendingAction(locChoice)
            : undefined,
        };
      }

      case "search_payment_terms": {
        const terms = await loadPaymentTerms();
        const search = args.search != null ? String(args.search).trim() : "";
        let matches = terms.filter((t) => !t.status || String(t.status).toUpperCase() === "Y");
        if (search) {
          const match = matchPaymentTerms(matches, search);
          if (match.status === "resolved") {
            matches = matches.filter((t) => String(t.id) === match.paymentTermsId);
          } else if (match.status === "ambiguous") {
            const ids = new Set(match.candidates.map((c) => c.paymentTermsId));
            matches = matches.filter((t) => ids.has(String(t.id)));
          } else {
            return { result: formatPaymentTermsNotFound(search) };
          }
        }
        const limit = Math.min(args.limit || 20, 50);
        const slice = matches.slice(0, limit);
        if (slice.length === 0) return { result: "No payment terms found." };
        const formatted = slice
          .map((t, i) => `**${i + 1}. ${t.terms_name || t.payment_term_id || t.id}**`)
          .join("\n");
        const ptChoice =
          search && slice.length >= 2
            ? paymentTermsChoiceFromCandidates(
                search,
                slice.map((t) => ({
                  paymentTermsId: String(t.id),
                  paymentTermsName: String(t.terms_name || t.payment_term_id || t.id).trim(),
                  paymentTermCode: t.payment_term_id ?? null,
                })),
              )
            : null;
        return {
          result:
            `${search ? `Payment terms matching "${search}"` : "Payment terms"} (${matches.length}):\n\n${formatted}\n\n` +
            `_Pass paymentTermsName (e.g. Net 30 / 30 days). If omitted, Admin Payment Settings default is used when available._`,
          pendingAction: ptChoice
            ? buildSelectOptionPendingAction(ptChoice)
            : undefined,
        };
      }

      case "get_vendors_by_category": {
        if (!args.categoryCode) return { result: "Please provide a category code." };

        const { pool } = await import("../db");

        const catResult = await pool.query(
          `SELECT DISTINCT s.id, s.company_name, s.email_id, s.phone, s.city, s.country, s.status
           FROM dbo.supp_basic_org_dtls s
           INNER JOIN dbo.supp_scope_of_supply_service ss ON s.id = ss.supplier_id
           WHERE (
             CAST(ss.category_code AS TEXT) LIKE $1 || '%'
             OR CAST(ss.sub_category_code AS TEXT) LIKE $1 || '%'
           )
           AND (s.status = 'Approved' OR s.status IS NULL)
           ORDER BY s.company_name
           LIMIT 20`,
          [args.categoryCode]
        );

        if (catResult.rows.length === 0) {
          const vendorResult = await vendorService.getDboSuppliersPaginated({ page: 1, limit: 10, status: "Approved" });
          const approvedVendors = (vendorResult as any).data || [];
          if (approvedVendors.length === 0) {
            return { result: `No vendors found registered under category code ${args.categoryCode}. There are no approved vendors in the system.` };
          }
          const vendorList = approvedVendors.slice(0, 5).map((s: any, idx: number) => {
            return `**${idx + 1}. ${s.companyName || s.company_name || "N/A"}** (ID: ${s.id}) — ${s.status || "N/A"}`;
          }).join("\n");
          return { result: `No vendors found specifically registered under category code ${args.categoryCode}. However, here are some approved vendors you could consider:\n\n${vendorList}\n\n_Use search_vendors to find vendors by name or browse more._` };
        }

        const formatted = catResult.rows.map((s: any, idx: number) => {
          let entry = `**${idx + 1}. ${s.company_name || "N/A"}** (ID: ${s.id})\n`;
          if (s.city || s.country) entry += `   Location: ${[s.city, s.country].filter(Boolean).join(", ")}\n`;
          if (s.email_id) entry += `   Email: ${s.email_id}\n`;
          if (s.phone) entry += `   Phone: ${s.phone}\n`;
          entry += `   Status: ${s.status || "N/A"}\n`;
          return entry;
        }).join("\n");

        return { result: `Found ${catResult.rows.length} vendor(s) registered under category ${args.categoryCode}:\n\n${formatted}` };
      }

      case "get_po_delivery_notes": {
        if (!args.poNumber) return { result: "Please provide a PO number." };

        const dns = await procService.getPoDeliveryNotes(args.poNumber);
        const items = Array.isArray(dns) ? dns : [];

        if (items.length === 0) {
          return { result: `No delivery notes found for ${args.poNumber}.` };
        }

        const formatted = items.map((d: any, idx: number) => {
          let entry = `**${idx + 1}. ASN: ${d.asn_number || "N/A"}**\n`;
          entry += `   Status: ${d.status || "N/A"}\n`;
          if (d.carrier) entry += `   Carrier: ${d.carrier}\n`;
          if (d.ship_from) entry += `   Ship From: ${d.ship_from}\n`;
          if (d.ship_to) entry += `   Ship To: ${d.ship_to}\n`;
          if (d.ship_date) entry += `   Ship Date: ${new Date(d.ship_date).toLocaleDateString()}\n`;
          if (d.expected_arrival_date) entry += `   Expected Arrival: ${new Date(d.expected_arrival_date).toLocaleDateString()}\n`;
          if (d.bill_of_landing) entry += `   Bill of Lading: ${d.bill_of_landing}\n`;
          if (d.creation_date) entry += `   Created: ${new Date(d.creation_date).toLocaleDateString()}\n`;
          return entry;
        }).join("\n");

        return { result: `Found ${items.length} delivery note(s) for ${args.poNumber}:\n\n${formatted}` };
      }

      case "get_po_grns": {
        if (!args.poNumber) return { result: "Please provide a PO number." };

        const grns = await procService.getPoGrns(args.poNumber);
        const items = Array.isArray(grns) ? grns : [];

        if (items.length === 0) {
          return { result: `No GRNs (Goods Receipt Notes) found for ${args.poNumber}.` };
        }

        const formatted = items.map((g: any, idx: number) => {
          let entry = `**${idx + 1}. Receipt #${g.receiptnum || g.maximo_grn_id || "N/A"}**\n`;
          entry += `   PO Line: ${g.po_line_number || "N/A"}\n`;
          if (g.item_name) entry += `   Item: ${g.item_name}\n`;
          if (g.received_qty) entry += `   Received Qty: ${g.received_qty} ${g.received_unit || ""}\n`;
          if (g.received_cost) entry += `   Received Cost: ${Number(g.received_cost).toLocaleString()}\n`;
          if (g.received_date) entry += `   Received Date: ${new Date(g.received_date).toLocaleDateString()}\n`;
          if (g.received_by_name) entry += `   Received By: ${g.received_by_name}\n`;
          entry += `   Status: ${g.status || "N/A"}\n`;
          if (g.supp_receipt_no) entry += `   Supplier Receipt: ${g.supp_receipt_no}\n`;
          return entry;
        }).join("\n");

        return { result: `Found ${items.length} GRN(s) for ${args.poNumber}:\n\n${formatted}` };
      }

      case "get_po_receipt_status": {
        if (!args.poNumber) return { result: "Please provide a PO number." };

        const lines = await procService.getPoLinesForReceipt(args.poNumber);
        const items = Array.isArray(lines) ? lines : [];

        if (items.length === 0) {
          return { result: `No PO lines found for ${args.poNumber}, or no receipt data available.` };
        }

        let summary = `## Receipt Status for ${args.poNumber}\n\n`;
        items.forEach((l: any, idx: number) => {
          summary += `**${idx + 1}. ${l.item_name || l.line_description || "Item"}** (Line ${l.po_line_number})\n`;
          summary += `   Ordered: ${l.line_qty} ${l.line_unit || ""}\n`;
          summary += `   GRN Received: ${l.total_grn_qty || 0}\n`;
          summary += `   Pending: ${l.pending_del_qty || 0}\n`;
          if (l.line_unit_price) summary += `   Unit Price: ${Number(l.line_unit_price).toLocaleString()}\n`;
          const pct = l.line_qty > 0 ? Math.round(((l.total_grn_qty || 0) / l.line_qty) * 100) : 0;
          summary += `   Fulfillment: ${pct}%\n`;
        });

        const totalOrdered = items.reduce((s: number, l: any) => s + (Number(l.line_qty) || 0), 0);
        const totalReceived = items.reduce((s: number, l: any) => s + (Number(l.total_grn_qty) || 0), 0);
        const totalPending = items.reduce((s: number, l: any) => s + (Number(l.pending_del_qty) || 0), 0);
        const overallPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

        summary += `\n### Overall\n`;
        summary += `**Total Ordered:** ${totalOrdered}\n`;
        summary += `**Total Received:** ${totalReceived}\n`;
        summary += `**Total Pending:** ${totalPending}\n`;
        summary += `**Overall Fulfillment:** ${overallPct}%\n`;

        return { result: summary };
      }

      case "prepare_create_delivery_note": {
        if (!args.poNumber) return { result: "Please provide a PO number." };

        const dnGate = await assertPoApprovedForFulfillment(args.poNumber, "delivery note");
        if ("error" in dnGate) return { result: dnGate.error };
        const dnPo = dnGate.po;

        const dnRoleBlocked = deliveryNoteRoleBlockedMessage(args.poNumber, dnPo, sessionUser);
        if (dnRoleBlocked) return { result: dnRoleBlocked };

        const today = new Date().toISOString().split("T")[0];
        const asnAlloc = await allocateUniqueAsn(args.asnNumber);
        args.asnNumber = asnAlloc.asnNumber;
        if (!args.shipDate) args.shipDate = today;
        if (!args.expectedArrivalDate) {
          const arrival = new Date();
          arrival.setDate(arrival.getDate() + 7);
          args.expectedArrivalDate = arrival.toISOString().split("T")[0];
        }
        if (!args.shipFrom) {
          args.shipFrom =
            (dnPo as any).supplier?.supplier_name ||
            (dnPo as any).company_name ||
            "Supplier Warehouse";
        }
        if (!args.shipTo) {
          args.shipTo =
            String((dnPo as any).delivertto_location_name || "").trim() || "Main Warehouse";
        }

        if (!Array.isArray(args.lines) || args.lines.length === 0) {
          return { result: "At least one line item with a quantity is required to raise a delivery note." };
        }

        const dnResolved = await resolveDeliveryNoteLines(args.poNumber, args.lines);
        if (dnResolved.lines.length === 0) {
          return {
            result:
              `Cannot prepare a delivery note for ${args.poNumber}:\n- ${dnResolved.errors.join("\n- ")}\n\n` +
              `Use get_po_receipt_status to see the line numbers still pending delivery.`,
          };
        }
        args.lines = dnResolved.lines;

        let summary = `## Create Delivery Note for ${args.poNumber}\n\n`;
        summary += `**PO Status:** ${(dnPo as any).po_status}\n`;
        summary += `**ASN Number:** ${args.asnNumber}\n`;
        if (asnAlloc.replacedPreferred) {
          summary += `_Requested ASN was already in use; assigned a unique number instead._\n`;
        }
        summary += `**Carrier:** ${args.carrier}\n`;
        summary += `**Ship Date:** ${args.shipDate}\n`;
        summary += `**Expected Arrival:** ${args.expectedArrivalDate}\n`;
        summary += `**Ship From:** ${args.shipFrom}\n`;
        summary += `**Ship To:** ${args.shipTo}\n`;
        if (args.billOfLanding) summary += `**Bill of Lading:** ${args.billOfLanding}\n`;

        summary += `\n### Line Items (${dnResolved.lines.length})\n`;
        dnResolved.lines.forEach((l: any, idx: number) => {
          summary += `**${idx + 1}.** Line ${l.poLineNumber} — ${l.itemName || "Item"}, Qty: ${l.qty} ${l.uom || ""}`;
          summary += ` (of ${l.pendingQty} pending)\n`;
        });
        if (dnResolved.errors.length > 0) {
          summary += `\n_Skipped lines:_\n- ${dnResolved.errors.join("\n- ")}\n`;
        }
        summary += `\n_This will create a delivery note in Pending status._\n`;

        return {
          result: summary,
          pendingAction: {
            type: "create_delivery_note",
            data: args,
            summary: `Create delivery note ASN ${args.asnNumber} for ${args.poNumber} (${dnResolved.lines.length} lines)`,
          },
        };
      }

      case "execute_create_delivery_note": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to create this delivery note, or **Cancel** to abort." };
        }
        if (!args.poNumber) return { result: "Please provide a PO number." };

        const dnExecGate = await assertPoApprovedForFulfillment(args.poNumber, "delivery note");
        if ("error" in dnExecGate) return { result: dnExecGate.error };
        const dnExecPo = dnExecGate.po;

        // Re-checked on the confirm leg too: a pending action carries only the tool
        // args, so the role that prepared it is not what authorises the write.
        const dnExecRoleBlocked = deliveryNoteRoleBlockedMessage(args.poNumber, dnExecPo, sessionUser);
        if (dnExecRoleBlocked) return { result: dnExecRoleBlocked };

        const dnToday = new Date().toISOString().split("T")[0];
        const dnAsnAlloc = await allocateUniqueAsn(args.asnNumber);
        args.asnNumber = dnAsnAlloc.asnNumber;
        if (!args.shipDate) args.shipDate = dnToday;
        if (!args.expectedArrivalDate) {
          const arr = new Date();
          arr.setDate(arr.getDate() + 7);
          args.expectedArrivalDate = arr.toISOString().split("T")[0];
        }
        if (!args.shipFrom) {
          args.shipFrom =
            (dnExecPo as any).supplier?.supplier_name ||
            (dnExecPo as any).company_name ||
            "Supplier Warehouse";
        }
        if (!args.shipTo) {
          args.shipTo =
            String((dnExecPo as any).delivertto_location_name || "").trim() || "Main Warehouse";
        }

        const supplierId = Number((dnExecPo as any).supplier_id) || 0;

        if (!Array.isArray(args.lines) || args.lines.length === 0) {
          return { result: "At least one line item with a quantity is required to raise a delivery note." };
        }

        // Re-resolved here too: a confirm can carry the model's original line
        // numbers, and the insert rejects anything that is not a stored line.
        const dnExecResolved = await resolveDeliveryNoteLines(args.poNumber, args.lines);
        if (dnExecResolved.lines.length === 0) {
          return {
            result:
              `Cannot create a delivery note for ${args.poNumber}:\n- ${dnExecResolved.errors.join("\n- ")}\n\n` +
              `Use get_po_receipt_status to see the line numbers still pending delivery.`,
          };
        }

        const dnLines = dnExecResolved.lines.map((l: any) => ({
          po_line_number: l.poLineNumber,
          item_name: l.itemName || "",
          qty: l.qty,
          uom: l.uom || "EA",
          po_number: args.poNumber,
        }));

        const dnHeader = {
          asn_number: args.asnNumber,
          bill_of_landing: args.billOfLanding || undefined,
          carrier: args.carrier,
          ship_date: args.shipDate,
          expected_arrival_date: args.expectedArrivalDate,
          ship_from: args.shipFrom,
          ship_to: args.shipTo,
          po_number: args.poNumber,
          supplier_id: supplierId,
          created_by: sessionUser?.name || sessionUser?.userName || sessionUser?.username || "system",
        };

        try {
          await procService.createDeliveryNote(dnHeader, dnLines, sessionUser);
        } catch (dnCreateErr: any) {
          // Race: another DN claimed this ASN between allocate and insert — retry once.
          const msg = String(dnCreateErr?.message || "");
          if (!/ASN Number must be unique/i.test(msg)) throw dnCreateErr;
          const retryAlloc = await allocateUniqueAsn(null);
          args.asnNumber = retryAlloc.asnNumber;
          await procService.createDeliveryNote(
            { ...dnHeader, asn_number: args.asnNumber },
            dnLines,
            sessionUser,
          );
        }

        const dnLineSummary = dnExecResolved.lines
          .map((l: any) => `  - Line ${l.poLineNumber} — ${l.itemName || "Item"}: ${l.qty} ${l.uom}`)
          .join("\n");
        const dnSkipped =
          dnExecResolved.errors.length > 0
            ? `\n\n_Skipped:_\n- ${dnExecResolved.errors.join("\n- ")}`
            : "";

        return { result: `Delivery note **${args.asnNumber}** created successfully for ${args.poNumber}!\n\n- **Status**: Pending\n- **Carrier**: ${args.carrier}\n- **Ship Date**: ${args.shipDate}\n- **Expected Arrival**: ${args.expectedArrivalDate}\n- **Lines**: ${dnLines.length}\n${dnLineSummary}\n\nThe delivery note is ready for tracking.${dnSkipped}` };
      }

      case "prepare_create_grn": {
        if (!args.poNumber) return { result: "Please provide a PO number." };

        // Backward-compatible aliases from the older tool schema
        if (!args.receiptNumber && args.supplierReceiptNo) args.receiptNumber = args.supplierReceiptNo;
        if (!args.receivedLocation && args.storeLocation) args.receivedLocation = args.storeLocation;

        if (!args.receiptNumber || !String(args.receiptNumber).trim()) {
          return { result: "Receipt Number is required (same as the Raise Receipt form)." };
        }
        if (!Array.isArray(args.lines) || args.lines.length === 0) {
          return { result: "At least one line item with receivedQty is required." };
        }

        const grnGate = await assertPoApprovedForFulfillment(args.poNumber, "receipt");
        if ("error" in grnGate) return { result: grnGate.error };
        const poDetail = grnGate.po;

        const deliveryNotes = await procService.getPoDeliveryNotes(args.poNumber);
        if (!Array.isArray(deliveryNotes) || deliveryNotes.length === 0) {
          return {
            result:
              `Cannot create a receipt for ${args.poNumber} without delivery notes. ` +
              `Raise a delivery note first (same rule as the Raise Receipt UI).`,
          };
        }

        const today = new Date().toISOString().split("T")[0];
        if (!args.receiptDate) args.receiptDate = today;
        // UI caps receipt date at today
        if (String(args.receiptDate) > today) {
          return { result: `Receipt Date cannot be in the future (got ${args.receiptDate}).` };
        }

        const locationHint =
          (typeof args.receivedLocation === "string" && args.receivedLocation.trim()) ||
          String((poDetail as any).delivertto_location_name || "").trim() ||
          "";

        if (!locationHint) {
          return {
            result:
              "Received Location is required. Provide a location name (use search_locations) " +
              "or ensure the PO has a deliver-to location.",
          };
        }

        const locations = await loadLocations();
        const locMatch = matchLocation(locations, locationHint);
        if (locMatch.status === "ambiguous") {
          const locChoice = locationChoiceFromCandidates(locMatch.query, locMatch.candidates);
          return {
            result: formatLocationAmbiguity(locMatch.query, locMatch.candidates),
            pendingAction: locChoice ? buildSelectOptionPendingAction(locChoice) : undefined,
          };
        }
        if (locMatch.status === "none") {
          // Allow exact PO deliver-to name even if not in active location master
          const poLocName = String((poDetail as any).delivertto_location_name || "").trim();
          const poLocId = (poDetail as any).delivertto_location_id;
          if (poLocName && poLocName.toLowerCase() === locationHint.toLowerCase()) {
            args.receivedLocation = poLocName;
            args.receivedLocationId = poLocId != null ? String(poLocId) : undefined;
          } else {
            return { result: formatLocationNotFound(locMatch.query) };
          }
        } else {
          args.receivedLocation = locMatch.locationName;
          args.receivedLocationId = String(locMatch.locationId);
        }

        const receiptLines = await procService.getPoLinesForReceipt(args.poNumber);
        const availableLines = Array.isArray(receiptLines) ? receiptLines : [];

        const normalizedLines: any[] = [];
        const lineErrors: string[] = [];
        for (const raw of args.lines) {
          const avail = availableLines.find(
            (a: any) => String(a.po_line_number) === String(raw.poLineNumber),
          );
          if (!avail) {
            lineErrors.push(`PO line ${raw.poLineNumber} was not found on ${args.poNumber}.`);
            continue;
          }
          const pending = Number(avail.pending_del_qty) || 0;
          if (pending <= 0) {
            lineErrors.push(
              `PO line ${raw.poLineNumber} (${avail.item_name}) has no pending delivery quantity to receive.`,
            );
            continue;
          }
          let qty = Number(raw.receivedQty);
          if (!Number.isFinite(qty) || qty <= 0) {
            lineErrors.push(`Received quantity must be greater than 0 for line ${raw.poLineNumber}.`);
            continue;
          }
          if (qty > pending) qty = pending;

          normalizedLines.push({
            poLineNumber: String(avail.po_line_number),
            itemName: raw.itemName || avail.item_name || "",
            receivedQty: qty,
            receivedCost:
              raw.receivedCost != null && Number.isFinite(Number(raw.receivedCost))
                ? Number(raw.receivedCost)
                : Number(avail.line_unit_price) || 0,
          });
        }

        if (lineErrors.length > 0 && normalizedLines.length === 0) {
          return { result: `Cannot prepare GRN:\n- ${lineErrors.join("\n- ")}` };
        }
        if (normalizedLines.length === 0) {
          return { result: "At least one line item with receivedQty > 0 is required." };
        }

        args.lines = normalizedLines;
        args.receiptNumber = String(args.receiptNumber).trim();
        args.receiptNotes =
          typeof args.receiptNotes === "string" ? args.receiptNotes.trim() : args.receiptNotes;

        let summary = `## Raise Receipt for ${args.poNumber}\n\n`;
        summary += `**PO Status:** ${(poDetail as any).po_status}\n`;
        summary += `**Receipt Date:** ${args.receiptDate}\n`;
        summary += `**Receipt Number:** ${args.receiptNumber}\n`;
        summary += `**Received Location:** ${args.receivedLocation}\n`;
        if (args.receiptNotes) summary += `**Receipt Notes:** ${args.receiptNotes}\n`;
        const shipFrom =
          (poDetail as any).supplier?.supplier_name ||
          (poDetail as any).company_name ||
          "";
        if (shipFrom) summary += `**Ship From:** ${shipFrom}\n`;

        summary += `\n### PO Line Items (${normalizedLines.length})\n`;
        normalizedLines.forEach((l: any, idx: number) => {
          const avail = availableLines.find(
            (a: any) => String(a.po_line_number) === String(l.poLineNumber),
          );
          summary += `**${idx + 1}.** Line ${l.poLineNumber} — ${l.itemName || "Item"}\n`;
          summary += `   Receiving: ${l.receivedQty}`;
          if (avail) summary += ` (of ${avail.pending_del_qty} pending)`;
          summary += ` ${avail?.line_unit || ""}\n`;
          if (l.receivedCost) summary += `   Unit Price: ${Number(l.receivedCost).toLocaleString()}\n`;
        });
        if (lineErrors.length > 0) {
          summary += `\n_Skipped lines:_\n- ${lineErrors.join("\n- ")}\n`;
        }
        summary += `\n_This will record goods receipt and update PO fulfillment._\n`;

        return {
          result: summary,
          pendingAction: {
            type: "create_grn",
            data: {
              poNumber: args.poNumber,
              receiptDate: args.receiptDate,
              receiptNumber: args.receiptNumber,
              receivedLocation: args.receivedLocation,
              receivedLocationId: args.receivedLocationId,
              receiptNotes: args.receiptNotes || "",
              lines: normalizedLines,
            },
            summary: `Raise receipt ${args.receiptNumber} for ${args.poNumber} — ${normalizedLines.length} line(s) at ${args.receivedLocation}`,
          },
        };
      }

      case "execute_create_grn": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to create this GRN, or **Cancel** to abort." };
        }

        if (!args.receiptNumber && args.supplierReceiptNo) args.receiptNumber = args.supplierReceiptNo;
        if (!args.receivedLocation && args.storeLocation) args.receivedLocation = args.storeLocation;

        if (!args.poNumber) return { result: "Please provide a PO number." };
        if (!args.receiptNumber || !String(args.receiptNumber).trim()) {
          return { result: "Receipt Number is required." };
        }
        if (!args.receiptDate) {
          return { result: "Receipt Date is required." };
        }
        if (!args.receivedLocation || !String(args.receivedLocation).trim()) {
          return { result: "Received Location is required." };
        }
        if (!Array.isArray(args.lines) || args.lines.length === 0) {
          return { result: "At least one line item is required." };
        }

        const grnExecGate = await assertPoApprovedForFulfillment(args.poNumber, "receipt");
        if ("error" in grnExecGate) return { result: grnExecGate.error };
        const poDetail = grnExecGate.po;

        const deliveryNotes = await procService.getPoDeliveryNotes(args.poNumber);
        if (!Array.isArray(deliveryNotes) || deliveryNotes.length === 0) {
          return {
            result: `Cannot create receipt without delivery notes for ${args.poNumber}.`,
          };
        }

        const supplierName =
          (poDetail as any).supplier?.supplier_name ||
          (poDetail as any).company_name ||
          "";

        const poLineInfo = await procService.getPoLinesForReceipt(args.poNumber);
        const poLinesMap = new Map<string, any>();
        if (Array.isArray(poLineInfo)) {
          poLineInfo.forEach((l: any) => poLinesMap.set(String(l.po_line_number), l));
        }

        const grnLines: any[] = [];
        for (const l of args.lines) {
          const poLine = poLinesMap.get(String(l.poLineNumber));
          if (!poLine) {
            return { result: `PO line ${l.poLineNumber} was not found on ${args.poNumber}.` };
          }
          const pending = Number(poLine.pending_del_qty) || 0;
          let qty = Number(l.receivedQty);
          if (!Number.isFinite(qty) || qty <= 0) {
            return {
              result: `Received quantity must be greater than 0 for line ${l.poLineNumber}.`,
            };
          }
          if (qty > pending) qty = pending;
          if (qty <= 0) {
            return {
              result: `PO line ${l.poLineNumber} has no pending delivery quantity to receive.`,
            };
          }

          grnLines.push({
            po_line_number: String(poLine.po_line_number),
            item_name: l.itemName || poLine.item_name || "",
            received_qty: qty,
            uom: poLine.line_unit || "EA",
            unit_price: l.receivedCost ?? poLine.line_unit_price ?? 0,
            po_number: args.poNumber,
            item_id: poLine.item_id || null,
            item_type: poLine.item_type || null,
            line_curr: poLine.line_curr || null,
            discount: poLine.discount || 0,
            tax_rate_code: poLine.tax_rate_code || null,
            attribute_12: poLine.attribute_12 || null,
            line_cost: poLine.line_cost || 0,
          });
        }

        const createdBy =
          sessionUser?.userName || sessionUser?.username || sessionUser?.email || "system";
        const createdByName =
          sessionUser?.name || sessionUser?.userName || sessionUser?.username || "System";

        const result = await procService.createReceipt(
          {
            receipt_date: args.receiptDate,
            receipt_number: String(args.receiptNumber).trim(),
            receipt_notes: args.receiptNotes || "",
            received_location: String(args.receivedLocation).trim(),
            received_location_id: args.receivedLocationId
              ? String(args.receivedLocationId)
              : (poDetail as any).delivertto_location_id
                ? String((poDetail as any).delivertto_location_id)
                : "",
            po_number: args.poNumber,
            supplier_name: supplierName,
            created_by: createdBy,
            created_by_name: createdByName,
            requested_by: (poDetail as any).po_owner_name || null,
            org_id: (poDetail as any).org_id || sessionUser?.org_id || null,
            currency_code: (poDetail as any).po_currency || "",
          },
          grnLines,
        );

        return {
          result:
            `Receipt created successfully for ${args.poNumber}!\n\n` +
            `- **Receipt Number**: ${result?.supp_receipt_no || args.receiptNumber}\n` +
            `- **System Receipt #**: ${result?.receiptnum || "N/A"}\n` +
            `- **Receipt Date**: ${args.receiptDate}\n` +
            `- **Received Location**: ${args.receivedLocation}\n` +
            `- **Items Received**: ${grnLines.length}\n\n` +
            `The goods have been recorded as received. PO fulfillment status has been updated.`,
        };
      }

      default:
        return { result: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`Procurement tool execution error [${toolName}]:`, error);
    return { result: `Error executing ${toolName}: ${error.message || "Unknown error occurred"}` };
  }
}

export async function processProcurementQuery(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
  sessionUser?: any,
  confirmAction?: { type: string; data: any },
  mentions?: SupplierMention[],
  businessUserMentions?: BusinessUserMention[],
  itemMentions?: ItemMention[],
  bidMentions?: BidMention[],
  prMentions?: PrMention[],
  /**
   * Whether this user's stored feedback may shape the answer. Defaults to true, so any
   * caller that does not pass it keeps the normal behaviour; the chat UI sends `false`
   * to compare against the un-personalised baseline. Turning it off suppresses only the
   * *application* of feedback — capture continues regardless.
   */
  applyFeedback: boolean = true,
  /**
   * One-shot signal that the user just reset their feedback, so the reply should also
   * shake off the personalised style demonstrated by earlier turns in this conversation.
   * (Switching the toggle off implies the same thing and does not need the flag.)
   */
  feedbackJustReset: boolean = false,
  poMentions?: PoMention[],
  invoiceMentions?: InvoiceMention[],
): Promise<ProcurementAgentResponse> {

  if (confirmAction) {
    const actionMap: Record<string, string> = {
      create_requisition: "execute_create_requisition",
      create_requisition_from_recommendation: "execute_create_requisition_from_recommendation",
      add_pr_line: "execute_add_pr_line",
      update_pr_line: "execute_update_pr_line",
      update_requisition: "execute_update_requisition",
      submit_requisition: "execute_submit_requisition",
      submit_purchase_order: "execute_submit_purchase_order",
      create_po_from_pr: "execute_create_po_from_pr",
      create_purchase_order: "execute_create_purchase_order",
      create_purchase_order_from_recommendation: "execute_create_purchase_order_from_recommendation",
      add_po_line: "execute_add_po_line",
      update_purchase_order: "execute_update_purchase_order",
      update_po_line: "execute_update_po_line",
      create_delivery_note: "execute_create_delivery_note",
      create_grn: "execute_create_grn",
    };
    const executeTool = actionMap[confirmAction.type];
    if (executeTool) {
      const toolResult = await executeToolCall(executeTool, { ...confirmAction.data, _confirmed: true }, sessionUser);
      return { response: toolResult.result };
    }
  }

  const reinforcedPrompt = applyAllMentionsToPrompt(prompt, {
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  });

  // This user's own past feedback, distilled. Returns "" on any failure (including a
  // missing feedback table), in which case the prompt is byte-identical to before this
  // feature existed. Never scoped to anyone but the current user.
  //
  // With applyFeedback=false the lookup is skipped entirely, so the rendered prompt is
  // exactly the baseline one — that is what makes the UI toggle a true A/B comparison
  // rather than a cosmetic switch.
  const feedbackGuidance = applyFeedback
    ? await getFeedbackGuidance(sessionUser?.id || sessionUser?.userId, "procurement", prompt)
    : "";

  // Tell the model to disregard the personalised style of earlier turns whenever the user
  // has just turned personalisation off or wiped their feedback — otherwise the change
  // only becomes visible in a brand-new conversation.
  const feedbackSuppressed = !applyFeedback || feedbackJustReset;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildProcurementSystemPrompt(feedbackGuidance, feedbackSuppressed) },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: reinforcedPrompt },
  ];

  const procurementTools = getProcurementTools();

  /**
   * "Recommend items for laptops" and its two siblings are answered by their own
   * services, but the Direct PO section of the system prompt is emphatic that any
   * item word means a PO, and the model follows it. Naming the tool for these
   * shapes settles the routing before the model can reach for
   * recommend_purchase_order; everything else is still its own choice.
   */
  const recommendationIntent = classifyProcurementRecommendationIntent(prompt);
  const firstToolChoice = recommendationIntent
    ? ({ type: "function", function: { name: recommendationIntent.tool } } as const)
    : ("auto" as const);

  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();
    let completion = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: procurementTools,
      tool_choice: firstToolChoice,
      temperature: AGENT_TEMPERATURE,
      max_tokens: 2000,
    });

    let assistantMessage = completion.choices[0]?.message;
    let pendingAction: PendingAction | undefined;
    let actionPreview: PrRecommendationSpec | PoRecommendationSpec | undefined;
    let lastChart: AgentChartSpec | undefined;
    let executedMutatingTool = false;

    let loopCount = 0;
    const MAX_LOOPS = 8;

    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0 && loopCount < MAX_LOOPS) {
      loopCount++;

      messages.push({
        role: "assistant",
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      } as any);

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = (toolCall as any).function.name;
        let fnArgs: any = {};
        try {
          fnArgs = JSON.parse((toolCall as any).function.arguments);
        } catch (e) {
          fnArgs = {};
        }

        if (agentToolIsMutatingForChartGate(fnName)) {
          executedMutatingTool = true;
        }

        // _confirmed is only ever legitimate from the user's Confirm click, which comes back
        // through the confirmAction branch above. The model can set it too — and does, on
        // prompts like "create the PR and submit it" — which runs the write with no human in
        // the loop and then leaves a stale Confirm button that re-fires it.
        const toolResult = await executeToolCall(
          fnName,
          {
            ...fnArgs,
            _confirmed: false,
            _turnPrompt: reinforcedPrompt,
            _itemMentions: normalizeItemMentions(itemMentions),
          },
          sessionUser,
        );

        // Write confirms (create_*, add_*, …) always win over disambiguation choices.
        // select_option only sticks when no other pendingAction was produced this turn.
        // An edit the model split over several calls is folded back into one action,
        // so Confirm carries every field the reply promised — see mergePendingActions.
        if (toolResult.pendingAction) {
          if (toolResult.pendingAction.type !== "select_option") {
            pendingAction = mergePendingActions(pendingAction, toolResult.pendingAction);
            if (toolResult.actionPreview) {
              actionPreview = toolResult.actionPreview;
            }
          } else if (!pendingAction) {
            pendingAction = toolResult.pendingAction;
            actionPreview = undefined;
          }
        }
        if (toolResult.chart) {
          lastChart = toolResult.chart;
        }
        // Same first-wins rule as pendingAction: a second recommendation in one
        // turn would replace the card the user is about to act on.
        if (toolResult.actionPreview && !actionPreview) {
          actionPreview = toolResult.actionPreview;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult.result,
        } as any);
      }

      completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools: procurementTools,
        tool_choice: "auto",
        temperature: AGENT_TEMPERATURE,
        max_tokens: 2000,
      });

      assistantMessage = completion.choices[0]?.message;
    }

    const rawResponse =
      assistantMessage?.content ||
      "I apologize, I couldn't process your request. Please try rephrasing.";
    // Card owns the field detail — keep the chat text short like PR recommendation.
    const response =
      actionPreview?.kind === "po_recommendation"
        ? "I've prepared a purchase order recommendation — review the card below, edit anything you need, then confirm."
        : actionPreview?.kind === "pr_recommendation"
          ? "I've prepared a purchase requisition recommendation — review the card below, edit anything you need, then confirm."
          : rawResponse;

    const chart = pendingAction || executedMutatingTool ? undefined : lastChart;
    return { response, pendingAction, chart, actionPreview };
  } catch (error: any) {
    console.error("Procurement Agent API error:", error);
    return {
      response: "I'm having trouble connecting to the AI service. Please try again in a moment.",
    };
  }
}
