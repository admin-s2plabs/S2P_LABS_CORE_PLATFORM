export const PROCUREMENT_ACTIVATION_STAGES = [
  "budgetApproval",
  "prApproval",
  "poApproval",
  "requested",
  "alerts",
] as const;

/**
 * TEMP Phase 2 — set `true` to re-enable Alerts + Requested in Activation Signals.
 * When false, those stages are not fetched, counted, displayed, or processed by the agent.
 */
export const ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS = false;

export type ProcurementActivationStageId = (typeof PROCUREMENT_ACTIVATION_STAGES)[number];
export type ProcurementActivationPreferences = Record<ProcurementActivationStageId, boolean>;

export function isProcurementPhase2Stage(
  stageId: ProcurementActivationStageId,
): boolean {
  return stageId === "alerts" || stageId === "requested";
}

/** Stages currently active for Activation Signals (excludes Phase 2 when flagged off). */
export function getActiveProcurementActivationStages(): ProcurementActivationStageId[] {
  return PROCUREMENT_ACTIVATION_STAGES.filter(
    (id) => ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS || !isProcurementPhase2Stage(id),
  );
}

export type ActivationStageStatus = "pending" | "idle";

export type ProcurementAlertType =
  | "poAckPending"
  | "deliveryOverdue"
  | "receiptPending"
  | "dnUpdated"
  | "grnReadyToInvoice"
  | "invoicePending"
  | "invoiceMismatch"
  | "invoiceOverdue"
  | "poRiskCandidate"
  | "poAnomalyCandidate";

export interface ProcurementActivationStageItem {
  title: string;
  taskId?: string;
  budgetId?: string;
  prNumber?: string;
  poNumber?: string;
  invoiceId?: string;
  dnId?: string;
  alertType?: ProcurementAlertType;
  subtitle?: string;
}

export interface ProcurementActivationStage {
  id: ProcurementActivationStageId;
  label: string;
  status: ActivationStageStatus;
  pendingCount: number;
  items: ProcurementActivationStageItem[];
}

export interface ProcurementActivationSignalsResponse {
  stages: ProcurementActivationStage[];
  suggestedNotification: string | null;
  nextStageId: ProcurementActivationStageId | null;
}

export const PROCUREMENT_ACTIVATION_INTENTS = [
  "list_pending_tasks",
  "open_budget_approval",
  "open_pr_approval",
  "open_po_approval",
  "open_requested",
  "open_alerts",
  "approve",
  "reject",
  "more_info",
  "other",
] as const;

export type ProcurementActivationIntent = (typeof PROCUREMENT_ACTIVATION_INTENTS)[number];

export interface ProcurementActivationIntentClassification {
  intent: ProcurementActivationIntent;
  confidence: number;
  stageId?: ProcurementActivationStageId;
  prNumber?: string;
  poNumber?: string;
  budgetNumber?: string;
  requestId?: string;
  comments?: string;
  contextualHints?: string;
  source: "llm" | "fallback";
}

/**
 * A classified action is review-card orchestration only. The review card still
 * requires confirmation and remains the sole caller of the process-approval API.
 */
export interface ProcurementApprovalCommand {
  action: "approve" | "reject" | "more";
  stageId: "budgetApproval" | "prApproval" | "poApproval";
  budgetId?: string;
  prNumber?: string;
  poNumber?: string;
  comments?: string;
}

export const PROCUREMENT_ACTIVATION_STAGE_LABELS: Record<ProcurementActivationStageId, string> = {
  budgetApproval: "Budget Approval",
  prApproval: "PR Approval",
  poApproval: "PO Approval",
  requested: "Requested",
  alerts: "Alerts",
};

export const PROCUREMENT_ACTIVATION_LIFECYCLE_ORDER: ProcurementActivationStageId[] = [
  "budgetApproval",
  "prApproval",
  "poApproval",
  "requested",
  "alerts",
];

/** Lifecycle order for UI / pending-task flow (excludes Phase 2 stages when flagged off). */
export function getActiveProcurementLifecycleOrder(): ProcurementActivationStageId[] {
  return PROCUREMENT_ACTIVATION_LIFECYCLE_ORDER.filter(
    (id) => ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS || !isProcurementPhase2Stage(id),
  );
}

export const PROCUREMENT_STAGE_ACTION_HINTS: Record<ProcurementActivationStageId, string> = {
  budgetApproval: "Review the budget and approve, reject, or request more information",
  prApproval: "Review the purchase requisition and approve, reject, or request more information",
  poApproval: "Review the purchase order and approve, reject, or request more information",
  requested: "Creation requests raised when the initiating user lacks permission",
  alerts: "Review procurement alerts such as supplier acknowledgement, delivery, GRN, and invoice updates",
};

export const PROCUREMENT_ALERT_TYPE_LABELS: Record<ProcurementAlertType, string> = {
  poAckPending: "PO Acknowledgement Pending",
  deliveryOverdue: "Delivery Overdue",
  receiptPending: "GRN / Receipt Pending",
  dnUpdated: "Delivery Note Update",
  grnReadyToInvoice: "GRN Ready to Invoice",
  invoicePending: "Invoice Pending Approval",
  invoiceMismatch: "Invoice Match Issue",
  invoiceOverdue: "Invoice Overdue",
  poRiskCandidate: "PO Delivery Risk",
  poAnomalyCandidate: "PO Anomaly Candidate",
};

export function mapTaskToProcurementStage(task: {
  subject?: string;
  taskName?: string;
  process_name?: string;
}): ProcurementActivationStageId | null {
  const taskName = String(task.taskName || "").trim();
  const processName = String(task.process_name || "").trim();
  const subject = String(task.subject || "");

  if (taskName === "Budget" || processName === "Budget" || /budget\s+approval/i.test(subject)) {
    return "budgetApproval";
  }
  if (
    taskName === "Purchase Request" ||
    processName === "Purchase Request" ||
    /pr\s+approval|purchase\s+request\s+approval/i.test(subject)
  ) {
    return "prApproval";
  }
  if (
    taskName === "Purchase Order" ||
    processName === "Purchase Order" ||
    /po\s+approval|purchase\s+order\s+approval/i.test(subject)
  ) {
    return "poApproval";
  }
  return null;
}

export function isProcurementWorkflowTask(task: {
  subject?: string;
  taskName?: string;
  process_name?: string;
}): boolean {
  return mapTaskToProcurementStage(task) !== null;
}

export function buildSuggestedNotification(
  stages: ProcurementActivationStage[],
): { message: string | null; nextStageId: ProcurementActivationStageId | null } {
  const pending = getActiveProcurementLifecycleOrder()
    .map((id) => stages.find((st) => st.id === id))
    .filter(
      (st): st is ProcurementActivationStage =>
        !!st && st.status === "pending" && st.pendingCount > 0,
    );

  if (pending.length === 0) {
    return { message: null, nextStageId: null };
  }

  const stage = pending[0];
  const itemPart = stage.pendingCount === 1 ? "1 item" : `${stage.pendingCount} items`;
  return {
    message: `${stage.label} is pending (${itemPart}). Open Activation Signals to review.`,
    nextStageId: stage.id,
  };
}

export function defaultActivationPreferences(): ProcurementActivationPreferences {
  return PROCUREMENT_ACTIVATION_STAGES.reduce(
    (acc, id) => {
      // Phase 2 stages default off until ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS is flipped.
      acc[id] = ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS || !isProcurementPhase2Stage(id);
      return acc;
    },
    {} as ProcurementActivationPreferences,
  );
}

export function normalizeActivationPreferences(
  value: unknown,
): ProcurementActivationPreferences {
  const preferences = defaultActivationPreferences();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return preferences;
  }

  const candidate = value as Partial<ProcurementActivationPreferences>;
  for (const id of PROCUREMENT_ACTIVATION_STAGES) {
    if (typeof candidate[id] === "boolean") {
      preferences[id] = candidate[id]!;
    }
  }
  // Force Phase 2 stages off regardless of stored prefs while the flag is disabled.
  if (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS) {
    preferences.alerts = false;
    preferences.requested = false;
  }
  return preferences;
}

export function isActivationStageEnabled(
  preferences: ProcurementActivationPreferences | undefined,
  stageId: ProcurementActivationStageId,
): boolean {
  if (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && isProcurementPhase2Stage(stageId)) {
    return false;
  }
  return preferences?.[stageId] !== false;
}

export function filterActivationSignalsByPreferences(
  response: ProcurementActivationSignalsResponse,
  preferences: ProcurementActivationPreferences | undefined,
): ProcurementActivationSignalsResponse {
  const stages = response.stages.map((stage) =>
    isActivationStageEnabled(preferences, stage.id)
      ? stage
      : { ...stage, status: "idle" as const, pendingCount: 0, items: [] },
  );
  const { message, nextStageId } = buildSuggestedNotification(stages);
  return { stages, suggestedNotification: message, nextStageId };
}

export function countTotalPendingItems(stages: ProcurementActivationStage[]): number {
  return stages.reduce((sum, stage) => sum + stage.pendingCount, 0);
}

export function isPendingProcurementTasksIntent(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  const patterns = [
    /^please show me all my pending (procurement|ops)?\s*tasks\.?$/i,
    /\bshow me all pending alerts,?\s*requests?\s*(and|&)?\s*approvals?\b/i,
    /\b(show|list|get|display|what are)\b.*\b(my\s+)?(pending|outstanding|open)\b.*\b(procurement\s+)?(tasks?|approvals?|alerts?)\b/i,
    /\b(pending|outstanding|open)\b.*\b(procurement\s+)?(tasks?|approvals?|alerts?)\b/i,
    /\bpending\s+actions?\b/i,
    /\bany\s+pending\s+(procurement\s+)?(actions?|work|items?|approvals?|alerts?)\b/i,
    /\bwhat('s|\s+is)\s+pending\b/i,
    /\btasks?\s+(awaiting|needing)\s+(my\s+)?action\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Record analytics questions (e.g. "How many PRs are currently active?",
 * "Count POs with status Approved"). The activation LLM frequently labels these
 * list_pending_tasks because it reads "active" as pending work, but they are
 * served by the agent's stats tools. Prompts that name pending work, tasks, or
 * approvals are left to the classifier so genuine Activation Signals queries
 * keep working.
 */
export function isProcurementRecordAnalyticsPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  if (/\b(?:pending|outstanding|awaiting|sign[\s-]?off|approvals?|tasks?|actions?)\b/i.test(text)) {
    return false;
  }

  const quantifier =
    /\b(?:how\s+many|count|number\s+of|total|breakdown|stats?|statistics|activity|trend)\b/i;
  const record =
    /\b(?:prs?|pos?|purchase\s+requests?|purchase\s+requisitions?|requisitions?|purchase\s+orders?)\b/i;

  return quantifier.test(text) && record.test(text);
}

/**
 * Sending a requisition or purchase order into the approval workflow, or asking
 * whether one is ready to go ("Submit PR_00069 for approval", "Check if
 * PR_00069 is ready for submission").
 *
 * These read as approval traffic to the activation LLM because they contain the
 * word "approval", but they are the requester's own action on their own draft
 * and belong to the agent's submit tools. Approving, rejecting, or asking for
 * more information on someone else's request is the opposite direction and is
 * left to the classifier.
 */
export function isProcurementSubmissionPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  if (/\b(?:approve|reject|deny|decline|sign[\s-]?off|green[\s-]?light)\b/i.test(text)) {
    return false;
  }

  const record =
    /\b(?:PR|PO)[_/-]?\d|\b(?:prs?|pos?|purchase\s+requests?|purchase\s+requisitions?|requisitions?|purchase\s+orders?)\b/i;
  const pronounSubmit = /\b(?:submit|resubmit)\s+(?:it|this|that|these|them)\b/i;
  if (!record.test(text) && !pronounSubmit.test(text)) return false;

  const submitAction = /\b(?:submit|submitted|submitting|submission|resubmit)\b/i;
  const readiness =
    /\b(?:ready|complete|completed|incomplete|missing|valid)\b.*\b(?:submit|submission|approval)\b/i;
  const sendForApproval =
    /\bsend\b.*\b(?:for\s+approval|into\s+the\s+approval|to\s+approval)\b/i;

  return submitAction.test(text) || readiness.test(text) || sendForApproval.test(text);
}

/**
 * Direct PO clickable-choice follow-ups (e.g. "Use budgetId 98").
 * These must NOT be routed through Activation Signals / budget approval.
 */
export function isDirectPoDisambiguationPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;
  return (
    /\buse\s+budget\s*id\s+\d+\b/i.test(text) ||
    /\buse\s+supplier\s*id\s+\d+\b/i.test(text) ||
    /\buse\s+business\s+entity\b/i.test(text) ||
    /\buse\s+department\b/i.test(text) ||
    /\buse\s+delivery\s+location\b/i.test(text) ||
    /\buse\s+payment\s+terms\b/i.test(text) ||
    /\buse\s+buyer\b/i.test(text)
  );
}

/**
 * Legacy deterministic detection retained strictly as the LLM classifier
 * fallback. Keep this precise so unrelated Procurement Agent capabilities
 * continue through the normal agent orchestration.
 */
export function detectProcurementActivationIntentFallback(
  prompt: string,
): ProcurementActivationIntentClassification {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return { intent: "other", confidence: 1, source: "fallback" };

  const prNumber =
    text.match(/\b(PR[_/-]\d[a-z0-9/_-]*)\b/i)?.[1] ||
    text.match(/\b(?:pr|purchase\s+request|requisition)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([a-z0-9/_-]*\d[a-z0-9/_-]*)\b/i)?.[1];
  const poNumber =
    text.match(/\b(PO[_/-]\d[a-z0-9/_-]*)\b/i)?.[1] ||
    text.match(/\b(?:po|purchase\s+order)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([a-z0-9/_-]*\d[a-z0-9/_-]*)\b/i)?.[1];
  const budgetNumber =
    text.match(/\bbudget\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*([a-z0-9/_-]*\d[a-z0-9/_-]*)\b/i)?.[1];
  const requestId =
    text.match(/\brequest\s*(?:id|number|no\.?|#)\s*[:#-]?\s*([a-z0-9/_-]*\d[a-z0-9/_-]*)\b/i)?.[1];
  const comments =
    text.match(
      /\b(?:with\s+(?:comments?|remarks?|reason)|comments?\s*(?:are|is|:)|remarks?\s*(?:are|is|:)|because)\s+(.+)$/i,
    )?.[1]?.trim();
  const contextualHints = text.match(
    /\b(?:latest|newest|most\s+recent|first|next|last|this|current)\b/i,
  )?.[0];

  const stageId: ProcurementActivationStageId | undefined = /\bbudget\b/i.test(text)
    ? "budgetApproval"
    : /\b(?:pr|purchase\s+request|requisition)\b/i.test(text)
      ? "prApproval"
      : /\b(?:po|purchase\s+order)\b/i.test(text)
        ? "poApproval"
        : ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && /\brequests?|requested\b/i.test(text)
          ? "requested"
          : ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && /\balerts?\b/i.test(text)
            ? "alerts"
            : undefined;

  const base = {
    stageId,
    prNumber,
    poNumber,
    budgetNumber,
    requestId,
    comments,
    contextualHints,
    source: "fallback" as const,
  };

  const moreInfo =
    /\b(?:request|ask|need|require|send|return)\b.*\b(?:more\s+info(?:rmation)?|details|clarification)\b/i.test(
      text,
    ) || /\bsend\s+(?:it\s+)?back\b/i.test(text);
  const reject =
    /\b(?:reject|deny|decline|turn\s+(?:it|this|them)\s+down|do\s+not\s+approve|don'?t\s+approve)\b/i.test(
      text,
    );
  const approve =
    /\b(?:approve|green[\s-]?light|give\s+(?:it\s+)?the\s+go[\s-]?ahead|accept|sign\s*off)\b/i.test(
      text,
    );

  if (moreInfo) return { ...base, intent: "more_info", confidence: 0.84 };
  if (reject) return { ...base, intent: "reject", confidence: 0.84 };
  if (approve) return { ...base, intent: "approve", confidence: 0.84 };

  if (isPendingProcurementTasksIntent(text)) {
    return { ...base, intent: "list_pending_tasks", confidence: 0.9 };
  }

  // Stage navigation must actually be about approvals. A record lookup such as
  // "Show details of PO_00055" is a normal agent capability, not Activation Signals.
  const recordLookup = /\b(?:details?|status|summary|history|description|info(?:rmation)?)\b/i.test(
    text,
  );
  const approvalContext =
    /\b(?:approvals?|pending|awaiting|outstanding|sign[\s-]?off|for\s+review)\b/i.test(text);

  const navigation = /\b(?:show|open|list|get|display|view|take\s+me\s+to|do\s+i\s+have)\b/i;
  if (!recordLookup && approvalContext && (navigation.test(text) || /\bpending\b/i.test(text))) {
    if (stageId === "budgetApproval") {
      return { ...base, intent: "open_budget_approval", confidence: 0.82 };
    }
    if (stageId === "prApproval") {
      return { ...base, intent: "open_pr_approval", confidence: 0.82 };
    }
    if (stageId === "poApproval") {
      return { ...base, intent: "open_po_approval", confidence: 0.82 };
    }
    if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stageId === "requested") {
      return { ...base, intent: "open_requested", confidence: 0.82 };
    }
    if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stageId === "alerts") {
      return { ...base, intent: "open_alerts", confidence: 0.82 };
    }
  }

  return { intent: "other", confidence: 1, source: "fallback" };
}

export function hasRecentPendingTasksDiscussion(
  conversationHistory: Array<{ role: string; content: string }>,
): boolean {
  const recent = conversationHistory.slice(-10);
  return recent.some(
    (m) =>
      (m.role === "user" && isPendingProcurementTasksIntent(m.content)) ||
      (m.role === "assistant" &&
        (/\btask\s*#\d+/i.test(m.content) ||
          /\bwhich task would you like\b/i.test(m.content) ||
          /\bpending procurement tasks?\b/i.test(m.content) ||
          /\bhere are your pending procurement task categories\b/i.test(m.content) ||
          /\b\*\*.+\(\d+ pending\)\*\*/i.test(m.content))),
  );
}

export function isProcurementTaskWorkflowContinuation(
  prompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
): boolean {
  if (!hasRecentPendingTasksDiscussion(conversationHistory)) {
    return false;
  }

  const text = String(prompt || "").trim();
  if (!text) return false;

  if (isPendingProcurementTasksIntent(text)) {
    return true;
  }

  return (
    /^\s*(#?\d+|first|second|third|fourth|fifth|next|last)\b/i.test(text) ||
    /\b(let'?s|i'?ll|start with|go with|do|take|pick|choose|work on|guide me)\b/i.test(text) ||
    /\b(budget\s+approval|pr\s+approval|po\s+approval|purchase\s+request|purchase\s+order|requested|alerts?)\b/i.test(
      text,
    ) ||
    /\b(done|completed|finished|next\s+task|what'?s\s+next|move\s+on|all\s+set|remaining|left)\b/i.test(
      text,
    ) ||
    /\btask\s*#?\d+\b/i.test(text)
  );
}

export function disabledProcurementActivationStageRequested(
  prompt: string,
  preferences?: ProcurementActivationPreferences,
): ProcurementActivationStageId | null {
  const text = String(prompt || "").trim();
  if (!text) return null;

  const checks: Array<{ id: ProcurementActivationStageId; patterns: RegExp[] }> = [
    {
      id: "budgetApproval",
      patterns: [/\bbudget\s+approvals?\b/i, /\b(approve|reject)\s+(the\s+|this\s+)?budget\b/i],
    },
    {
      id: "prApproval",
      patterns: [
        /\bpr\s+approvals?\b/i,
        /\bpurchase\s+request\s+approvals?\b/i,
        /\b(approve|reject)\s+(the\s+|this\s+)?(pr|purchase\s+request|requisition)\b/i,
      ],
    },
    {
      id: "poApproval",
      patterns: [
        /\bpo\s+approvals?\b/i,
        /\bpurchase\s+order\s+approvals?\b/i,
        /\b(approve|reject)\s+(the\s+|this\s+)?(po|purchase\s+order)\b/i,
      ],
    },
    // Phase 2 stages — kept for re-enable; still detected so the agent can reply "disabled".
    {
      id: "requested",
      patterns: [/\brequested\b/i, /\bcreation\s+requests?\b/i],
    },
    {
      id: "alerts",
      patterns: [/\balerts?\b/i, /\bpending\s+alerts?\b/i],
    },
  ];

  for (const check of checks) {
    if (isActivationStageEnabled(preferences, check.id)) continue;
    if (check.patterns.some((p) => p.test(text))) return check.id;
  }
  return null;
}

export type ProcurementTaskFlowStep = "categories" | "stageTasks";

export interface ProcurementTaskFlowCategory {
  id: ProcurementActivationStageId;
  label: string;
  pendingCount: number;
}

export interface ProcurementTaskFlowTaskItem {
  index: number;
  globalTaskNumber: number;
  title: string;
  budgetId?: string;
  prNumber?: string;
  poNumber?: string;
  invoiceId?: string;
  taskId?: string;
  alertType?: ProcurementAlertType;
}

export interface ProcurementTaskFlowSpec {
  step: ProcurementTaskFlowStep;
  categories?: ProcurementTaskFlowCategory[];
  stageId?: ProcurementActivationStageId;
  tasks?: ProcurementTaskFlowTaskItem[];
}

export type ProcurementPendingTaskReviewFlowType =
  | "budgetApprovalReview"
  | "prApprovalReview"
  | "poApprovalReview"
  | "procurementAlertReview"
  | "requestedEmpty";

export interface ProcurementPendingTaskFlowContext {
  pendingTaskFlow?: "categories" | "tasks" | ProcurementPendingTaskReviewFlowType;
  stageId?: ProcurementActivationStageId;
  taskIndex?: number;
  activeReview?: {
    stageId: "budgetApproval" | "prApproval" | "poApproval" | "alerts";
    title?: string;
    budgetId?: string;
    prNumber?: string;
    poNumber?: string;
    alertType?: ProcurementAlertType;
  };
}

export interface BudgetApprovalReviewSpec {
  budgetId: string;
  taskId?: string;
  title: string;
}

export interface PrApprovalReviewSpec {
  prNumber: string;
  taskId?: string;
  title: string;
}

export interface PoApprovalReviewSpec {
  poNumber: string;
  taskId?: string;
  title: string;
}

export interface ProcurementAlertReviewSpec {
  alertType: ProcurementAlertType;
  title: string;
  poNumber?: string;
  invoiceId?: string;
  dnId?: string;
  subtitle?: string;
}

export function getPendingTaskReviewFlowType(
  stageId: ProcurementActivationStageId,
): ProcurementPendingTaskReviewFlowType | null {
  if (stageId === "budgetApproval") return "budgetApprovalReview";
  if (stageId === "prApproval") return "prApprovalReview";
  if (stageId === "poApproval") return "poApprovalReview";
  if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stageId === "alerts") {
    return "procurementAlertReview";
  }
  if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stageId === "requested") {
    return "requestedEmpty";
  }
  return null;
}

export function parsePendingTaskFlowContext(
  raw: string | undefined | null,
): ProcurementPendingTaskFlowContext | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as ProcurementPendingTaskFlowContext;
    if (!parsed?.pendingTaskFlow && !parsed?.activeReview) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getPendingStages(
  response: ProcurementActivationSignalsResponse,
): ProcurementActivationStage[] {
  return getActiveProcurementLifecycleOrder()
    .map((id) => response.stages.find((stage) => stage.id === id))
    .filter(
      (stage): stage is ProcurementActivationStage =>
        !!stage &&
        stage.pendingCount > 0 &&
        (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS || !isProcurementPhase2Stage(stage.id)),
    );
}

function formatTaskTitle(item: ProcurementActivationStageItem): string {
  return item.title?.trim() || "Untitled task";
}

export function buildPendingTasksCategoriesResponse(
  response: ProcurementActivationSignalsResponse,
): { message: string; flow: ProcurementTaskFlowSpec } {
  const pendingStages = getPendingStages(response);
  if (pendingStages.length === 0) {
    return {
      message: buildNoPendingProcurementTasksMessage(),
      flow: { step: "categories", categories: [] },
    };
  }

  const lines: string[] = ["Here are your pending procurement task categories:", ""];

  pendingStages.forEach((stage, index) => {
    lines.push(`${index + 1}. **${stage.label}** (${stage.pendingCount} pending)`);
  });

  lines.push("");
  if (response.suggestedNotification) {
    lines.push(`Suggested priority: ${response.suggestedNotification}`);
    lines.push("");
  }
  lines.push("Which task would you like to complete first?");

  return {
    message: lines.join("\n"),
    flow: {
      step: "categories",
      categories: pendingStages.map((stage) => ({
        id: stage.id,
        label: stage.label,
        pendingCount: stage.pendingCount,
      })),
    },
  };
}

function getGlobalTaskNumberOffset(
  response: ProcurementActivationSignalsResponse,
  stageId: ProcurementActivationStageId,
): number {
  let offset = 0;
  for (const id of getActiveProcurementLifecycleOrder()) {
    if (id === stageId) break;
    const stage = response.stages.find((entry) => entry.id === id);
    if (stage && stage.pendingCount > 0) {
      offset += stage.items.length;
    }
  }
  return offset;
}

export function buildPendingTasksStageTasksResponse(
  response: ProcurementActivationSignalsResponse,
  stageId: ProcurementActivationStageId,
): { message: string; flow?: ProcurementTaskFlowSpec } | null {
  if (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && isProcurementPhase2Stage(stageId)) {
    return null;
  }
  if (stageId === "requested") {
    return {
      message:
        "Creation requests will appear here when request tracking is enabled. Item and budget creation requests raised by users without permission will show under **Requested**.",
    };
  }

  const stage = response.stages.find((entry) => entry.id === stageId && entry.pendingCount > 0);
  if (!stage) return null;

  const taskNumberOffset = getGlobalTaskNumberOffset(response, stageId);
  const lines: string[] = [`**${stage.label} (${stage.pendingCount} pending)**`, ""];
  lines.push(`Required action: ${PROCUREMENT_STAGE_ACTION_HINTS[stage.id]}`);
  lines.push("");
  lines.push(
    stage.pendingCount === 1
      ? "Loading details…"
      : "Select an item below to review and take action.",
  );

  return {
    message: lines.join("\n").trim(),
    flow: {
      step: "stageTasks",
      stageId,
      tasks: stage.items.map((item, index) => ({
        index,
        globalTaskNumber: taskNumberOffset + index + 1,
        title: formatTaskTitle(item),
        budgetId: item.budgetId,
        prNumber: item.prNumber,
        poNumber: item.poNumber,
        invoiceId: item.invoiceId,
        taskId: item.taskId,
        alertType: item.alertType,
      })),
    },
  };
}

export function getStageItemByIndex(
  response: ProcurementActivationSignalsResponse,
  stageId: ProcurementActivationStageId,
  taskIndex: number,
): ProcurementActivationStageItem | null {
  const stage = response.stages.find((entry) => entry.id === stageId && entry.pendingCount > 0);
  if (!stage || taskIndex < 0 || taskIndex >= stage.items.length) return null;
  return stage.items[taskIndex];
}

/** The approval stages a classification can name a specific document for. */
export type ProcurementApprovalStageId = "budgetApproval" | "prApproval" | "poApproval";

export function isProcurementApprovalStage(
  stageId: ProcurementActivationStageId | null | undefined,
): stageId is ProcurementApprovalStageId {
  return stageId === "budgetApproval" || stageId === "prApproval" || stageId === "poApproval";
}

/**
 * The document the user named for this stage, if any. Only the classifier's own
 * extraction counts — an in-progress review card is context, not a request for
 * a particular record.
 */
export function getNamedProcurementEntity(
  classification: ProcurementActivationIntentClassification,
  stageId: ProcurementActivationStageId,
): string | undefined {
  if (stageId === "budgetApproval") return classification.budgetNumber;
  if (stageId === "prApproval") return classification.prNumber;
  if (stageId === "poApproval") return classification.poNumber;
  return undefined;
}

function getItemEntity(
  item: ProcurementActivationStageItem,
  stageId: ProcurementActivationStageId,
): string | undefined {
  if (stageId === "budgetApproval") return item.budgetId;
  if (stageId === "prApproval") return item.prNumber;
  if (stageId === "poApproval") return item.poNumber;
  return undefined;
}

function normalizeProcurementEntity(value: unknown): string {
  return String(value || "").trim().toLocaleLowerCase();
}

/**
 * Picks which pending approval a classified message refers to.
 *
 * The important case is the one that used to go wrong: the user names a
 * document that is *not* in their approval queue — "check if PR_00069 is ready
 * to submit" while PR_00059 is the one pending. Naming a document is a request
 * for that record and nothing else, so a miss returns null and the caller
 * hands the message to normal agent orchestration. Falling back to the only
 * pending item would review a record the user never mentioned.
 *
 * With no document named the convenience fallbacks still apply, since then
 * "approve this" or "open my PR approval" can only mean the item in front of
 * the user or their single piece of pending work.
 */
export function resolveProcurementActivationItem(
  response: ProcurementActivationSignalsResponse,
  stageId: ProcurementActivationStageId,
  classification: ProcurementActivationIntentClassification,
  flowContext?: ProcurementPendingTaskFlowContext | null,
): ProcurementActivationStageItem | null {
  const stage = response.stages.find((candidate) => candidate.id === stageId);
  const items = stage?.items || [];
  if (!items.length) return null;

  const activeReview = flowContext?.activeReview;
  const namedEntity = getNamedProcurementEntity(classification, stageId);
  const reviewEntity =
    stageId === "budgetApproval"
      ? activeReview?.budgetId
      : stageId === "prApproval"
        ? activeReview?.prNumber
        : stageId === "poApproval"
          ? activeReview?.poNumber
          : undefined;

  const requestedEntity = namedEntity || reviewEntity;
  if (requestedEntity) {
    const normalized = normalizeProcurementEntity(requestedEntity);
    const match = items.find(
      (candidate) => normalizeProcurementEntity(getItemEntity(candidate, stageId)) === normalized,
    );
    if (match) return match;
  }

  if (namedEntity) return null;

  if (flowContext?.stageId === stageId && flowContext.taskIndex != null) {
    return getStageItemByIndex(response, stageId, flowContext.taskIndex);
  }

  if (
    activeReview?.stageId === stageId ||
    /\b(?:latest|newest|most\s+recent|first|next|this|current)\b/i.test(
      classification.contextualHints || "",
    ) ||
    items.length === 1
  ) {
    return items[0];
  }
  return null;
}

export function buildBudgetApprovalReviewSpec(
  item: ProcurementActivationStageItem,
): BudgetApprovalReviewSpec | null {
  if (!item.budgetId) return null;
  return {
    budgetId: item.budgetId,
    taskId: item.taskId,
    title: item.title || `Budget #${item.budgetId}`,
  };
}

export function buildPrApprovalReviewSpec(
  item: ProcurementActivationStageItem,
): PrApprovalReviewSpec | null {
  if (!item.prNumber) return null;
  return {
    prNumber: item.prNumber,
    taskId: item.taskId,
    title: item.title || item.prNumber,
  };
}

export function buildPoApprovalReviewSpec(
  item: ProcurementActivationStageItem,
): PoApprovalReviewSpec | null {
  if (!item.poNumber) return null;
  return {
    poNumber: item.poNumber,
    taskId: item.taskId,
    title: item.title || item.poNumber,
  };
}

export function buildProcurementAlertReviewSpec(
  item: ProcurementActivationStageItem,
): ProcurementAlertReviewSpec | null {
  if (!item.alertType) return null;
  return {
    alertType: item.alertType,
    title: item.title,
    poNumber: item.poNumber,
    invoiceId: item.invoiceId,
    dnId: item.dnId,
    subtitle: item.subtitle,
  };
}

export function parseStageSelectionFromPrompt(
  prompt: string,
  response: ProcurementActivationSignalsResponse,
): ProcurementActivationStageId | null {
  const text = String(prompt || "").trim().toLowerCase();
  if (!text) return null;

  const pendingStages = getPendingStages(response);
  const numberMatch = text.match(/^#?(\d+)\.?$/);
  if (numberMatch) {
    const index = Number(numberMatch[1]) - 1;
    if (index >= 0 && index < pendingStages.length) {
      return pendingStages[index].id;
    }
  }

  for (const stage of pendingStages) {
    if (text === stage.label.toLowerCase()) return stage.id;
    if (text.includes(stage.label.toLowerCase())) return stage.id;
  }

  const keywordMap: Partial<Record<ProcurementActivationStageId, string[]>> = {
    budgetApproval: ["budget approval", "budget"],
    prApproval: ["pr approval", "purchase request", "requisition"],
    poApproval: ["po approval", "purchase order"],
    ...(ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS
      ? {
          alerts: ["alerts", "alert"],
          requested: ["requested", "creation request"],
        }
      : {}),
  };

  for (const stage of pendingStages) {
    const keywords = keywordMap[stage.id] || [];
    if (keywords.some((keyword) => text.includes(keyword))) {
      return stage.id;
    }
  }

  return null;
}

export function isPendingTasksFlowResetPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim().toLowerCase();
  return (
    /\b(what'?s next|show remaining|back to categories|other tasks?|start over|remaining tasks?)\b/i.test(
      text,
    ) || /\b(done|completed|finished|all set|move on)\b/i.test(text)
  );
}

export function resolvePendingTaskFlowStep(
  prompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
  response: ProcurementActivationSignalsResponse,
  flowContext?: ProcurementPendingTaskFlowContext | null,
): "categories" | "tasks" | ProcurementPendingTaskReviewFlowType | "reset" | null {
  const pendingStages = getPendingStages(response);

  if (
    ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS &&
    (flowContext?.pendingTaskFlow === "requestedEmpty" || flowContext?.stageId === "requested")
  ) {
    return "requestedEmpty";
  }

  if (
    (flowContext?.pendingTaskFlow === "budgetApprovalReview" ||
      flowContext?.pendingTaskFlow === "prApprovalReview" ||
      flowContext?.pendingTaskFlow === "poApprovalReview" ||
      (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS &&
        flowContext?.pendingTaskFlow === "procurementAlertReview")) &&
    flowContext.stageId
  ) {
    return flowContext.pendingTaskFlow;
  }

  if (flowContext?.pendingTaskFlow === "tasks" && flowContext.stageId) {
    return "tasks";
  }

  if (flowContext?.pendingTaskFlow === "categories") {
    return "categories";
  }

  if (isPendingTasksFlowResetPrompt(prompt) && hasRecentPendingTasksDiscussion(conversationHistory)) {
    return "reset";
  }

  if (isPendingProcurementTasksIntent(prompt)) {
    return "categories";
  }

  if (!isProcurementTaskWorkflowContinuation(prompt, conversationHistory)) {
    return null;
  }

  if (pendingStages.length === 0) return null;

  const stageFromPrompt = parseStageSelectionFromPrompt(prompt, response);
  if (stageFromPrompt) {
    return "tasks";
  }

  return null;
}

export function buildNoPendingProcurementTasksMessage(): string {
  return "You're all caught up — there are **no pending tasks from your enabled Activation Signals** right now.";
}

export const PENDING_PROCUREMENT_TASKS_PROMPT = ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS
  ? "Show me all pending alerts, requests and approvals"
  : "Show me all pending approvals";
