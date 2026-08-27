export const PAYABLES_ACTIVATION_STAGES = ["invoiceApprovalRequest"] as const;

export type PayablesActivationStageId = (typeof PAYABLES_ACTIVATION_STAGES)[number];
export type PayablesActivationPreferences = Record<PayablesActivationStageId, boolean>;

export type ActivationStageStatus = "pending" | "idle";

export interface PayablesActivationStageItem {
  title: string;
  taskId?: string;
  /** Invoice primary key — always a string (matches workflow srms ref). */
  invoiceId: string;
  invoiceNumber?: string;
  supplierName?: string;
  description?: string;
  subtitle?: string;
  poNumber?: string;
}

export interface PayablesActivationStage {
  id: PayablesActivationStageId;
  label: string;
  status: ActivationStageStatus;
  pendingCount: number;
  items: PayablesActivationStageItem[];
}

export interface PayablesActivationSignalsResponse {
  stages: PayablesActivationStage[];
  suggestedNotification: string | null;
  nextStageId: PayablesActivationStageId | null;
}

export const PAYABLES_ACTIVATION_INTENTS = [
  "list_pending_invoice_approvals",
  "open_invoice_approval",
  "approve",
  "reject",
  "more_info",
  "delegate",
  "general",
] as const;

export type PayablesActivationIntent = (typeof PAYABLES_ACTIVATION_INTENTS)[number];

export interface PayablesActivationIntentClassification {
  intent: PayablesActivationIntent;
  confidence: number;
  stageId?: PayablesActivationStageId;
  invoiceId?: string;
  invoiceNumber?: string;
  taskId?: string;
  comments?: string;
  /** Username / email / display hint for delegate intents. */
  delegateTo?: string;
  contextualHints?: string;
  source: "llm" | "fallback";
}

/**
 * A classified action is review-card orchestration only. The review card still
 * requires confirmation and remains the sole caller of process-approval /
 * delegate-request APIs.
 */
export interface PayablesApprovalCommand {
  action: "approve" | "reject" | "more" | "delegate";
  stageId: "invoiceApprovalRequest";
  invoiceId: string;
  taskId?: string;
  comments?: string;
  delegateUserName?: string;
}

export const PAYABLES_ACTIVATION_STAGE_LABELS: Record<PayablesActivationStageId, string> = {
  invoiceApprovalRequest: "Invoice Approval Request",
};

export const PAYABLES_ACTIVATION_LIFECYCLE_ORDER: PayablesActivationStageId[] = [
  "invoiceApprovalRequest",
];

export const PAYABLES_STAGE_ACTION_HINTS: Record<PayablesActivationStageId, string> = {
  invoiceApprovalRequest:
    "Review the invoice and approve, reject, request more information, or delegate",
};

export function mapTaskToPayablesStage(task: {
  subject?: string;
  taskName?: string;
  process_name?: string;
}): PayablesActivationStageId | null {
  const taskName = String(task.taskName || "").trim();
  const processName = String(task.process_name || "").trim();
  const subject = String(task.subject || "");

  if (taskName === "Invoice" || processName === "Invoice") {
    return "invoiceApprovalRequest";
  }
  if (
    /invoice\s+approval\s+request/i.test(subject) ||
    /(?:po\s+advance\s+)?invoice\s+(?:re-?submit\s+)?approval/i.test(subject) ||
    /\binvoice\s+approval\b/i.test(subject)
  ) {
    return "invoiceApprovalRequest";
  }
  return null;
}

export function isInvoiceWorkflowTask(task: {
  subject?: string;
  taskName?: string;
  process_name?: string;
}): boolean {
  return mapTaskToPayablesStage(task) !== null;
}

export function buildSuggestedNotification(
  stages: PayablesActivationStage[],
): { message: string | null; nextStageId: PayablesActivationStageId | null } {
  const pending = PAYABLES_ACTIVATION_LIFECYCLE_ORDER.map((id) =>
    stages.find((st) => st.id === id),
  ).filter(
    (st): st is PayablesActivationStage =>
      !!st && st.status === "pending" && st.pendingCount > 0,
  );

  if (pending.length === 0) {
    return { message: null, nextStageId: null };
  }

  const stage = pending[0];
  const itemPart = stage.pendingCount === 1 ? "1 invoice" : `${stage.pendingCount} invoices`;
  return {
    message: `${stage.label} is pending (${itemPart}). Open Activation Signals to review.`,
    nextStageId: stage.id,
  };
}

export function defaultPayablesActivationPreferences(): PayablesActivationPreferences {
  return PAYABLES_ACTIVATION_STAGES.reduce(
    (acc, id) => {
      acc[id] = true;
      return acc;
    },
    {} as PayablesActivationPreferences,
  );
}

export function normalizePayablesActivationPreferences(
  value: unknown,
): PayablesActivationPreferences {
  const preferences = defaultPayablesActivationPreferences();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return preferences;
  }

  const candidate = value as Partial<PayablesActivationPreferences>;
  for (const id of PAYABLES_ACTIVATION_STAGES) {
    if (typeof candidate[id] === "boolean") {
      preferences[id] = candidate[id]!;
    }
  }
  return preferences;
}

export function isPayablesActivationStageEnabled(
  preferences: PayablesActivationPreferences | undefined,
  stageId: PayablesActivationStageId,
): boolean {
  return preferences?.[stageId] !== false;
}

export function filterPayablesActivationSignalsByPreferences(
  response: PayablesActivationSignalsResponse,
  preferences: PayablesActivationPreferences | undefined,
): PayablesActivationSignalsResponse {
  const stages = response.stages.map((stage) =>
    isPayablesActivationStageEnabled(preferences, stage.id)
      ? stage
      : { ...stage, status: "idle" as const, pendingCount: 0, items: [] },
  );
  const { message, nextStageId } = buildSuggestedNotification(stages);
  return { stages, suggestedNotification: message, nextStageId };
}

export function countTotalPendingInvoices(stages: PayablesActivationStage[]): number {
  return stages.reduce((sum, stage) => sum + stage.pendingCount, 0);
}

export function isPendingInvoiceApprovalsIntent(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  const patterns = [
    /^please show me all my pending invoice approvals?\.?$/i,
    /\bshow me all pending invoice approvals?\b/i,
    /\b(show|list|get|display|what are)\b.*\b(my\s+)?(pending|outstanding|open)\b.*\binvoice\s+approvals?\b/i,
    /\b(pending|outstanding|open)\b.*\binvoice\s+approvals?\b/i,
    /\bpending\s+invoice\s+(approvals?|tasks?|actions?)\b/i,
    /\bany\s+pending\s+invoice\s+(approvals?|work|items?|actions?)\b/i,
    /\binvoices?\s+(?:are\s+|is\s+)?(awaiting|needing|pending)\s+(my\s+)?(approval|action)\b/i,
    /\bwhat\s+invoices?\s+do\s+i\s+need\s+to\s+approve\b/i,
    /\b(show|list|what\s+are)\s+(?:me\s+)?my\s+pending\s+approvals?\b/i,
    /\bwhat('s|\s+is)\s+pending\b.*\binvoice/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

const PAYABLES_DECISION_VERBS =
  /\b(?:approve|approving|reject|rejecting|deny|denying|decline|declining|sign[\s-]?off|green[\s-]?light|delegate|delegating|reassign)\b/i;

/**
 * Sending an invoice into the approval workflow, or paying one ("Submit invoice
 * INV-2026-001 for approval", "Is INV-2026-001 ready to submit?").
 *
 * These read as approval traffic because they contain the word "approval", but
 * they are the user's own action on their own invoice and belong to the agent's
 * submit/pay tools. Approving, rejecting, delegating, or requesting more
 * information on an invoice awaiting a decision is the opposite direction and
 * is left to the classifier.
 */
export function isPayablesSubmissionPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  if (PAYABLES_DECISION_VERBS.test(text)) return false;
  if (isPendingInvoiceApprovalsIntent(text)) return false;

  const record = /\b(?:INV|NPI)[_/-]?\d|\binvoices?\b/i;
  const pronounSubmit = /\b(?:submit|resubmit)\s+(?:it|this|that|these|them)\b/i;
  if (!record.test(text) && !pronounSubmit.test(text)) return false;

  const submitAction = /\b(?:submit|submitted|submitting|submission|resubmit)\b/i;
  const readiness =
    /\b(?:ready|complete|completed|incomplete|missing|valid)\b.*\b(?:submit|submission|approval)\b/i;
  const sendForApproval =
    /\bsend\b.*\b(?:for\s+approval|into\s+the\s+approval|to\s+approval)\b/i;
  // Paying is an action, so "payment approval" on its own does not count.
  const payAction =
    /\b(?:pay|paying)\b/i.test(text) ||
    /\b(?:process|schedule|record|make)\s+(?:the\s+)?payment\b/i.test(text) ||
    /\bmark\s+(?:it\s+|this\s+)?as\s+paid\b/i.test(text);

  return (
    submitAction.test(text) || readiness.test(text) || sendForApproval.test(text) || payAction
  );
}

/**
 * Asking what is on an invoice or what state it is in ("What are the line items
 * on invoice INV-2026-001?").
 *
 * Naming an invoice is a request for that record, not a request for the
 * approvals waiting on the user, so these stay on the agent's invoice tools.
 * Anything phrased around approvals or a pending queue is left to the
 * classifier.
 */
export function isPayablesInvoiceRecordQueryPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  if (/\bapprovals?\b/i.test(text) || PAYABLES_DECISION_VERBS.test(text)) return false;
  if (/\b(?:pending|outstanding|awaiting)\b/i.test(text)) return false;
  if (!/\binvoices?\b|\b(?:INV|NPI)[_/-]?\d/i.test(text)) return false;

  const attribute =
    /\b(?:line\s+items?|lines?|items?|quantity|qty|unit\s+price|amount|total|subtotal|tax|currency|status|details?|summary|description|due\s+date|payment\s+terms|supplier|vendor|po\s+number|attachments?|documents?|history|fraud|duplicate|match(?:ed|es|ing)?)\b/i;
  const question =
    /\b(?:what|which|how\s+much|how\s+many|when|who|where|is|are|does|do|did|show|list|display|tell|give|get|find|check|view|open)\b/i;

  return attribute.test(text) && question.test(text);
}

function extractInvoiceNumber(text: string): string | undefined {
  const explicit =
    text.match(/\b(INV[_/-][a-z0-9/_-]+)\b/i)?.[1] ||
    text.match(/\b(NPI[_/-][a-z0-9/_-]+)\b/i)?.[1] ||
    text.match(
      /\b(?:invoice|inv)\s*(?:number|no\.?|#)\s*[:#-]?\s*([a-z0-9][a-z0-9/_-]*)\b/i,
    )?.[1] ||
    text.match(/\b(?:open|review|show|view)\s+(?:invoice\s+)?([a-z0-9][a-z0-9/_-]*\d[a-z0-9/_-]*)\b/i)?.[1] ||
    text.match(/\b(?:approve|reject|delegate)\s+(?:invoice\s+)?([a-z0-9][a-z0-9/_-]*\d[a-z0-9/_-]*)\b/i)?.[1] ||
    text.match(/\binvoice\s+([a-z0-9][a-z0-9/_-]*\d[a-z0-9/_-]*)\b/i)?.[1];
  if (!explicit) return undefined;
  // Guard against matching phrase words such as "approvals" / "pending".
  if (/^(approvals?|pending|requests?|tasks?|actions?|items?|work)$/i.test(explicit)) {
    return undefined;
  }
  return explicit;
}

function extractInvoiceId(text: string): string | undefined {
  const explicit =
    text.match(/\binvoice\s*(?:id|pk)\s*[:#-]?\s*([a-z0-9][a-z0-9/_-]*)\b/i)?.[1] ||
    text.match(/\bid\s*[:#-]?\s*(\d+)\b/i)?.[1];
  return explicit ? String(explicit) : undefined;
}

/**
 * The invoice a message names, if any. Lets a caller tell "asking about this
 * invoice" apart from "asking about my approval queue" without depending on
 * what the classifier managed to extract.
 */
export function extractInvoiceIdentifiersFromPrompt(prompt: string): {
  invoiceId?: string;
  invoiceNumber?: string;
} {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return {};
  return { invoiceId: extractInvoiceId(text), invoiceNumber: extractInvoiceNumber(text) };
}

function extractDelegateTo(text: string): string | undefined {
  const match =
    text.match(
      /\b(?:delegate|assign|reassign|hand\s*off|handoff|request\s+for\s+delegate)\b(?:\s+(?:this|it|the))?(?:\s+(?:invoice|approval|request|task))?\s+(?:to|onto)\s+([a-z0-9._@+\-]+(?:\s+[a-z0-9._@+\-]+){0,3}?)(?=\s+(?:with|because|remarks?|comments?|reason)\b|[.,!]|$)/i,
    ) ||
    text.match(
      /\bdelegate\s+to\s+([a-z0-9._@+\-]+(?:\s+[a-z0-9._@+\-]+){0,3}?)(?=\s+(?:with|because|remarks?|comments?|reason)\b|[.,!]|$)/i,
    );
  const value = match?.[1]?.trim();
  if (!value) return undefined;
  const cleaned = value.replace(/\b(?:please|now|thanks|thank you)\b/gi, "").trim();
  return cleaned || undefined;
}

function extractComments(text: string): string | undefined {
  return text
    .match(
      /\b(?:with\s+(?:comments?|remarks?|reason)|comments?\s*(?:are|is|:)|remarks?\s*(?:are|is|:)|because|reason\s*:)\s+(.+)$/i,
    )?.[1]
    ?.trim();
}

/**
 * Legacy deterministic detection retained strictly as the LLM classifier
 * fallback. Keep this precise so unrelated Payables Agent capabilities
 * continue through the normal agent orchestration.
 */
export function detectPayablesActivationIntentFallback(
  prompt: string,
): PayablesActivationIntentClassification {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return { intent: "general", confidence: 1, source: "fallback" };

  const invoiceNumber = extractInvoiceNumber(text);
  const invoiceId = extractInvoiceId(text);
  const comments = extractComments(text);
  const delegateTo = extractDelegateTo(text);
  const contextualHints = text.match(
    /\b(?:latest|newest|most\s+recent|first|next|last|this|current|it)\b/i,
  )?.[0];

  const mentionsInvoice =
    /\binvoice\b/i.test(text) || !!invoiceNumber || !!invoiceId || /\binv[_/-]/i.test(text);

  const base = {
    stageId: mentionsInvoice || /\bapproval\b/i.test(text) ? ("invoiceApprovalRequest" as const) : undefined,
    invoiceId,
    invoiceNumber,
    comments,
    delegateTo,
    contextualHints,
    source: "fallback" as const,
  };

  // Questions about the user's queue can contain the verb "approve" without
  // expressing an approval decision, so classify them before action verbs. A
  // named invoice means the user wants that invoice, not the whole queue —
  // "open the invoice approval for INV-2026-001" reads as the status word
  // "open" to the queue patterns.
  if (isPendingInvoiceApprovalsIntent(text) && !invoiceNumber && !invoiceId) {
    return { ...base, intent: "list_pending_invoice_approvals", confidence: 0.9 };
  }

  // Submitting or paying an invoice, and asking what is on one, are the agent's
  // own capabilities even though they name an invoice.
  if (isPayablesSubmissionPrompt(text) || isPayablesInvoiceRecordQueryPrompt(text)) {
    return { intent: "general", confidence: 0.9, source: "fallback" };
  }

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
  const delegate =
    /\b(?:delegate|reassign|hand\s+off|handoff|request\s+for\s+delegate)\b/i.test(text);

  if (moreInfo) return { ...base, intent: "more_info", confidence: 0.84 };
  if (delegate) return { ...base, intent: "delegate", confidence: 0.84 };
  if (reject) return { ...base, intent: "reject", confidence: 0.84 };
  if (approve) return { ...base, intent: "approve", confidence: 0.84 };

  // An invoice number on its own says nothing about approvals, so the message
  // also has to be about the approval queue to enter Activation Signals.
  const approvalContext =
    /\bapprovals?\b/i.test(text) || /\b(?:pending|outstanding|awaiting)\b/i.test(text);
  const navigation = /\b(?:show|open|list|get|display|view|take\s+me\s+to|review|do\s+i\s+have)\b/i;
  if (
    approvalContext &&
    (navigation.test(text) || /\bpending\b/i.test(text) || !!invoiceNumber || !!invoiceId) &&
    (mentionsInvoice || /\binvoice\s+approval\b/i.test(text))
  ) {
    return { ...base, intent: "open_invoice_approval", confidence: 0.82 };
  }

  return { intent: "general", confidence: 1, source: "fallback" };
}

export function hasRecentPendingInvoiceApprovalsDiscussion(
  conversationHistory: Array<{ role: string; content: string }>,
): boolean {
  const recent = conversationHistory.slice(-10);
  return recent.some(
    (m) =>
      (m.role === "user" && isPendingInvoiceApprovalsIntent(m.content)) ||
      (m.role === "assistant" &&
        (/\binvoice\s*#?\d+/i.test(m.content) ||
          /\bwhich invoice would you like\b/i.test(m.content) ||
          /\bpending invoice approvals?\b/i.test(m.content) ||
          /\bhere are your pending invoice approvals?\b/i.test(m.content) ||
          /\b\*\*.+\(\d+ pending\)\*\*/i.test(m.content))),
  );
}

export function isPayablesInvoiceWorkflowContinuation(
  prompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
): boolean {
  if (!hasRecentPendingInvoiceApprovalsDiscussion(conversationHistory)) {
    return false;
  }

  const text = String(prompt || "").trim();
  if (!text) return false;

  if (isPendingInvoiceApprovalsIntent(text)) {
    return true;
  }

  return (
    /^\s*(#?\d+|first|second|third|fourth|fifth|next|last)\b/i.test(text) ||
    /\b(let'?s|i'?ll|start with|go with|do|take|pick|choose|work on|guide me|review)\b/i.test(
      text,
    ) ||
    /\b(invoice\s+approval|pending\s+invoice)\b/i.test(text) ||
    /\b(done|completed|finished|next\s+(?:invoice|task)|what'?s\s+next|move\s+on|all\s+set|remaining|left)\b/i.test(
      text,
    ) ||
    /\binvoice\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*[a-z0-9/_-]+/i.test(text)
  );
}

export function disabledPayablesActivationStageRequested(
  prompt: string,
  preferences?: PayablesActivationPreferences,
): PayablesActivationStageId | null {
  const text = String(prompt || "").trim();
  if (!text) return null;

  const checks: Array<{ id: PayablesActivationStageId; patterns: RegExp[] }> = [
    {
      id: "invoiceApprovalRequest",
      patterns: [
        /\binvoice\s+approvals?\b/i,
        /\binvoice\s+approval\s+request\b/i,
        /\b(approve|reject|delegate)\s+(the\s+|this\s+)?invoice\b/i,
        /\bpending\s+invoice\b/i,
      ],
    },
  ];

  for (const check of checks) {
    if (isPayablesActivationStageEnabled(preferences, check.id)) continue;
    if (check.patterns.some((p) => p.test(text))) return check.id;
  }
  return null;
}

export type PayablesTaskFlowStep = "categories" | "stageTasks";

export interface PayablesTaskFlowCategory {
  id: PayablesActivationStageId;
  label: string;
  pendingCount: number;
}

export interface PayablesTaskFlowTaskItem {
  index: number;
  globalTaskNumber: number;
  title: string;
  invoiceId: string;
  invoiceNumber?: string;
  supplierName?: string;
  description?: string;
  taskId?: string;
}

export interface PayablesTaskFlowSpec {
  step: PayablesTaskFlowStep;
  categories?: PayablesTaskFlowCategory[];
  stageId?: PayablesActivationStageId;
  tasks?: PayablesTaskFlowTaskItem[];
}

export type PayablesPendingInvoiceReviewFlowType = "invoiceApprovalReview";

export interface PayablesPendingInvoiceFlowContext {
  pendingTaskFlow?: "categories" | "tasks" | PayablesPendingInvoiceReviewFlowType;
  stageId?: PayablesActivationStageId;
  taskIndex?: number;
  activeReview?: {
    stageId: "invoiceApprovalRequest";
    title?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    taskId?: string;
  };
}

export interface PayablesInvoiceApprovalReviewSpec {
  invoiceId: string;
  taskId?: string;
  title: string;
  invoiceNumber?: string;
  supplierName?: string;
  description?: string;
}

export function getPendingInvoiceReviewFlowType(
  stageId: PayablesActivationStageId,
): PayablesPendingInvoiceReviewFlowType | null {
  if (stageId === "invoiceApprovalRequest") return "invoiceApprovalReview";
  return null;
}

export function parsePayablesPendingFlowContext(
  raw: string | undefined | null,
): PayablesPendingInvoiceFlowContext | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as PayablesPendingInvoiceFlowContext;
    if (!parsed?.pendingTaskFlow && !parsed?.activeReview) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getPendingStages(
  response: PayablesActivationSignalsResponse,
): PayablesActivationStage[] {
  return PAYABLES_ACTIVATION_LIFECYCLE_ORDER.map((id) =>
    response.stages.find((stage) => stage.id === id),
  ).filter(
    (stage): stage is PayablesActivationStage => !!stage && stage.pendingCount > 0,
  );
}

function formatTaskTitle(item: PayablesActivationStageItem): string {
  return item.title?.trim() || item.invoiceNumber || `Invoice ${item.invoiceId}` || "Untitled invoice";
}

export function buildNoPendingInvoiceApprovalsMessage(): string {
  return "You're all caught up — there are **no pending invoice approvals from your enabled Activation Signals** right now.";
}

export function buildPendingInvoiceApprovalsCategoriesResponse(
  response: PayablesActivationSignalsResponse,
): { message: string; flow: PayablesTaskFlowSpec } {
  const pendingStages = getPendingStages(response);
  if (pendingStages.length === 0) {
    return {
      message: buildNoPendingInvoiceApprovalsMessage(),
      flow: { step: "categories", categories: [] },
    };
  }

  // Single-stage product: surface invoices directly when only one category exists.
  if (pendingStages.length === 1) {
    const stageResult = buildPendingInvoiceApprovalsStageTasksResponse(
      response,
      pendingStages[0].id,
    );
    if (stageResult?.flow) {
      return { message: stageResult.message, flow: stageResult.flow };
    }
  }

  const lines: string[] = ["Here are your pending invoice approval categories:", ""];

  pendingStages.forEach((stage, index) => {
    lines.push(`${index + 1}. **${stage.label}** (${stage.pendingCount} pending)`);
  });

  lines.push("");
  if (response.suggestedNotification) {
    lines.push(`Suggested priority: ${response.suggestedNotification}`);
    lines.push("");
  }
  lines.push("Which invoice would you like to review first?");

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

export function buildPendingInvoiceApprovalsStageTasksResponse(
  response: PayablesActivationSignalsResponse,
  stageId: PayablesActivationStageId = "invoiceApprovalRequest",
): { message: string; flow?: PayablesTaskFlowSpec } | null {
  const stage = response.stages.find((entry) => entry.id === stageId && entry.pendingCount > 0);
  if (!stage) return null;

  const lines: string[] = [`**${stage.label} (${stage.pendingCount} pending)**`, ""];
  lines.push(`Required action: ${PAYABLES_STAGE_ACTION_HINTS[stage.id]}`);
  lines.push("");
  lines.push(
    stage.pendingCount === 1
      ? "Loading invoice details…"
      : "Select an invoice below to review and take action.",
  );

  return {
    message: lines.join("\n").trim(),
    flow: {
      step: "stageTasks",
      stageId,
      tasks: stage.items.map((item, index) => ({
        index,
        globalTaskNumber: index + 1,
        title: formatTaskTitle(item),
        invoiceId: item.invoiceId,
        invoiceNumber: item.invoiceNumber,
        supplierName: item.supplierName,
        description: item.description,
        taskId: item.taskId,
      })),
    },
  };
}

export function getStageItemByIndex(
  response: PayablesActivationSignalsResponse,
  stageId: PayablesActivationStageId,
  taskIndex: number,
): PayablesActivationStageItem | null {
  const stage = response.stages.find((entry) => entry.id === stageId && entry.pendingCount > 0);
  if (!stage || taskIndex < 0 || taskIndex >= stage.items.length) return null;
  return stage.items[taskIndex];
}

export function buildInvoiceApprovalReviewSpec(
  item: PayablesActivationStageItem,
): PayablesInvoiceApprovalReviewSpec | null {
  if (!item.invoiceId) return null;
  return {
    invoiceId: String(item.invoiceId),
    taskId: item.taskId,
    title: item.title || item.invoiceNumber || `Invoice ${item.invoiceId}`,
    invoiceNumber: item.invoiceNumber,
    supplierName: item.supplierName,
    description: item.description,
  };
}

export function findInvoiceItemByIdentifier(
  response: PayablesActivationSignalsResponse,
  opts: { invoiceId?: string; invoiceNumber?: string; contextualHints?: string },
): PayablesActivationStageItem | null {
  const stage = response.stages.find(
    (entry) => entry.id === "invoiceApprovalRequest" && entry.pendingCount > 0,
  );
  if (!stage || stage.items.length === 0) return null;

  if (opts.invoiceId) {
    const id = String(opts.invoiceId).trim().toLowerCase();
    const byId = stage.items.find((item) => String(item.invoiceId).toLowerCase() === id);
    if (byId) return byId;
  }

  if (opts.invoiceNumber) {
    const number = String(opts.invoiceNumber).trim().toLowerCase();
    const byNumber = stage.items.find(
      (item) => String(item.invoiceNumber || "").toLowerCase() === number,
    );
    if (byNumber) return byNumber;
  }

  const hint = String(opts.contextualHints || "").toLowerCase();
  if (/\b(latest|newest|most\s+recent|first|next|current)\b/i.test(hint) && stage.items.length > 0) {
    return stage.items[0];
  }
  if (/\blast\b/i.test(hint) && stage.items.length > 0) {
    return stage.items[stage.items.length - 1];
  }

  if (stage.items.length === 1) return stage.items[0];
  return null;
}

export function parseInvoiceSelectionFromPrompt(
  prompt: string,
  response: PayablesActivationSignalsResponse,
): PayablesActivationStageItem | null {
  const text = String(prompt || "").trim();
  if (!text) return null;

  const stage = response.stages.find(
    (entry) => entry.id === "invoiceApprovalRequest" && entry.pendingCount > 0,
  );
  if (!stage) return null;

  const numberMatch = text.match(/^#?(\d+)\.?$/);
  if (numberMatch) {
    const index = Number(numberMatch[1]) - 1;
    if (index >= 0 && index < stage.items.length) {
      return stage.items[index];
    }
  }

  const invoiceNumber = extractInvoiceNumber(text);
  const invoiceId = extractInvoiceId(text);
  return findInvoiceItemByIdentifier(response, { invoiceId, invoiceNumber });
}

export function isPendingInvoiceFlowResetPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim().toLowerCase();
  return (
    /\b(what'?s next|show remaining|back to (?:list|categories)|other invoices?|start over|remaining invoices?)\b/i.test(
      text,
    ) || /\b(done|completed|finished|all set|move on)\b/i.test(text)
  );
}

export function resolvePendingInvoiceFlowStep(
  prompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
  response: PayablesActivationSignalsResponse,
  flowContext?: PayablesPendingInvoiceFlowContext | null,
): "categories" | "tasks" | PayablesPendingInvoiceReviewFlowType | "reset" | null {
  const pendingStages = getPendingStages(response);

  if (
    flowContext?.pendingTaskFlow === "invoiceApprovalReview" &&
    flowContext.stageId === "invoiceApprovalRequest"
  ) {
    return "invoiceApprovalReview";
  }

  if (flowContext?.pendingTaskFlow === "tasks" && flowContext.stageId) {
    return "tasks";
  }

  if (flowContext?.pendingTaskFlow === "categories") {
    return "categories";
  }

  if (
    isPendingInvoiceFlowResetPrompt(prompt) &&
    hasRecentPendingInvoiceApprovalsDiscussion(conversationHistory)
  ) {
    return "reset";
  }

  if (isPendingInvoiceApprovalsIntent(prompt)) {
    return pendingStages.length <= 1 ? "tasks" : "categories";
  }

  if (!isPayablesInvoiceWorkflowContinuation(prompt, conversationHistory)) {
    return null;
  }

  if (pendingStages.length === 0) return null;

  const itemFromPrompt = parseInvoiceSelectionFromPrompt(prompt, response);
  if (itemFromPrompt) {
    return "invoiceApprovalReview";
  }

  return "tasks";
}

export const PENDING_INVOICE_APPROVALS_PROMPT = "Show me all pending invoice approvals";
