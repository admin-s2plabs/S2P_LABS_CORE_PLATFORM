export const SUPPLIER_ACTIVATION_STAGES = ["supplierApproval"] as const;

export type SupplierActivationStageId = (typeof SUPPLIER_ACTIVATION_STAGES)[number];
export type SupplierActivationPreferences = Record<SupplierActivationStageId, boolean>;

export type SupplierActivationStageStatus = "pending" | "idle";

export interface SupplierActivationStageItem {
  /** Supplier id (equals the workflow ref_number for the Vendor Registration process). */
  supplierId: string;
  /** Activiti/Camunda task id (act_ru_task.id_) used to complete the approval step. */
  taskId?: string;
  title: string;
  companyName?: string;
}

export interface SupplierActivationStage {
  id: SupplierActivationStageId;
  label: string;
  status: SupplierActivationStageStatus;
  pendingCount: number;
  items: SupplierActivationStageItem[];
}

export interface SupplierActivationSignalsResponse {
  stages: SupplierActivationStage[];
  suggestedNotification: string | null;
}

export const SUPPLIER_ACTIVATION_STAGE_LABELS: Record<SupplierActivationStageId, string> = {
  supplierApproval: "Supplier Approval",
};

export const SUPPLIER_ACTIVATION_LIFECYCLE_ORDER: SupplierActivationStageId[] = [
  "supplierApproval",
];

export const SUPPLIER_STAGE_ACTION_HINTS: Record<SupplierActivationStageId, string> = {
  supplierApproval: "Review the supplier profile and approve or reject the registration",
};

export function defaultActivationPreferences(): SupplierActivationPreferences {
  return SUPPLIER_ACTIVATION_STAGES.reduce(
    (acc, id) => {
      acc[id] = true;
      return acc;
    },
    {} as SupplierActivationPreferences,
  );
}

export function normalizeActivationPreferences(
  value: unknown,
): SupplierActivationPreferences {
  const preferences = defaultActivationPreferences();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return preferences;
  }

  const candidate = value as Partial<SupplierActivationPreferences>;
  for (const id of SUPPLIER_ACTIVATION_STAGES) {
    if (typeof candidate[id] === "boolean") {
      preferences[id] = candidate[id]!;
    }
  }
  return preferences;
}

export function isActivationStageEnabled(
  preferences: SupplierActivationPreferences | undefined,
  stageId: SupplierActivationStageId,
): boolean {
  return preferences?.[stageId] !== false;
}

export function filterActivationSignalsByPreferences(
  response: SupplierActivationSignalsResponse,
  preferences: SupplierActivationPreferences | undefined,
): SupplierActivationSignalsResponse {
  const stages = response.stages.map((stage) =>
    isActivationStageEnabled(preferences, stage.id)
      ? stage
      : { ...stage, status: "idle" as const, pendingCount: 0, items: [] },
  );
  return { stages, suggestedNotification: null };
}

/**
 * Detects prompts that ask for Supplier Approval work so we can reject them when
 * the stage is disabled in Activation Signals — even if the phrasing does not
 * match `isPendingSupplierTasksIntent`.
 */
export function disabledSupplierActivationStageRequested(
  prompt: string,
  preferences?: SupplierActivationPreferences,
): boolean {
  if (isActivationStageEnabled(preferences, "supplierApproval")) return false;

  const text = String(prompt || "").trim();
  if (!text) return false;

  if (isPendingSupplierTasksIntent(text)) return true;

  const patterns = [
    /\bsupplier\s+approvals?\b/i,
    /\b(approve|reject)\s+(the\s+|this\s+)?(supplier|vendor)\b/i,
    /\b(pending|outstanding|open)\b.*\b(supplier|vendor)\b.*\bapprovals?\b/i,
    /\b(supplier|vendor)\b.*\b(pending|awaiting|to\s+review)\b.*\bapprovals?\b/i,
    /\bregistration\s+approvals?\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Supplier onboarding approval tasks are created by the "Vendor Registration" workflow.
 * Their subjects look like:
 *   - "Vendor Registration Approval Request-<company>"          (new onboarding)
 *   - "Update Supplier Registration Approval Request-<company>" (profile update)
 * We match on the "registration approval request" phrase, which uniquely identifies these
 * and excludes the "...Request For More Info..." variants as well as unrelated approval
 * requests (PR/PO/Bid/Budget/Invoice), none of which contain "registration approval request".
 * The task DTO from `getAllTasks` doesn't carry `process_name`, so we key off the subject.
 */
export function isSupplierApprovalTask(task: { subject?: string; taskName?: string }): boolean {
  const subject = String(task?.subject || "");
  return /registration approval request/i.test(subject);
}

/**
 * Parse the company name out of the approval subject. Handles both the space-delimited
 * ("... Approval Request - <company>") and hyphen-delimited ("... Approval Request-<company>")
 * forms produced by the workflow.
 */
export function extractCompanyFromSubject(subject: string): string {
  const text = String(subject || "").trim();
  const afterApproval = text.match(/approval request\s*[-–—]\s*(.+)$/i);
  if (afterApproval?.[1]?.trim()) {
    return afterApproval[1].trim();
  }
  const dashIndex = text.lastIndexOf(" - ");
  if (dashIndex >= 0) {
    const company = text.slice(dashIndex + 3).trim();
    if (company) return company;
  }
  return text;
}

export interface SupplierApprovalReviewSpec {
  supplierId: string;
  taskId?: string;
  companyName: string;
}

export const SUPPLIER_APPROVAL_INTENTS = [
  "list_pending_approvals",
  "open_supplier_review",
  "approve",
  "reject",
  "more_info",
  "ask_about_supplier",
  "other",
] as const;

export type SupplierApprovalIntent = (typeof SUPPLIER_APPROVAL_INTENTS)[number];

export interface SupplierApprovalIntentClassification {
  intent: SupplierApprovalIntent;
  confidence: number;
  supplierName?: string;
  supplierId?: string;
  comments?: string;
  context?: string;
  source: "llm" | "fallback";
}

/**
 * A classified action is UI orchestration only. The review card still requires
 * confirmation and remains the sole caller of the process-approval API.
 */
export interface SupplierApprovalCommand {
  action: "Approve" | "Reject" | "More";
  supplierId: string;
  comments?: string;
}

export interface SupplierTaskFlowItem {
  index: number;
  supplierId: string;
  taskId?: string;
  companyName: string;
  title: string;
}

export interface SupplierTaskFlowSpec {
  step: "tasks";
  tasks: SupplierTaskFlowItem[];
}

export type SupplierPendingTaskFlowType = "tasks" | "supplierApprovalReview";

export interface SupplierPendingTaskFlowContext {
  pendingTaskFlow?: SupplierPendingTaskFlowType;
  taskIndex?: number;
  activeSupplierReview?: SupplierApprovalReviewSpec;
}

export function parseSupplierFlowContext(
  raw: string | undefined | null,
): SupplierPendingTaskFlowContext | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as SupplierPendingTaskFlowContext;
    if (!parsed?.pendingTaskFlow && !parsed?.activeSupplierReview) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isPendingSupplierTasksIntent(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  const patterns = [
    /\bgive me all my supplier pending tasks\b/i,
    /\b(show|list|get|display|what are)\b.*\b(my\s+)?(pending|outstanding|open)\b.*\b(supplier\s+)?(approvals?|tasks?)\b/i,
    /\b(pending|outstanding|open)\b.*\bsupplier\b.*\b(approvals?|tasks?)\b/i,
    /\bsupplier\b.*\b(approvals?)\b.*\b(pending|awaiting|to\s+review)\b/i,
    /\b(any\s+)?suppliers?\s+(pending\s+)?(my\s+)?approval\b/i,
    /\bsuppliers?\s+(awaiting|needing)\s+(my\s+)?(approval|action|review)\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Catalog listing (e.g. "give all supplier list", "show all suppliers").
 * The activation LLM often labels these list_pending_approvals because they
 * contain "supplier" + "list", but they are served by search_vendors.
 * Prompts that name pending work, tasks, or approvals stay on Activation Signals.
 */
export function isSupplierCatalogListPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  if (
    /\b(?:pending|outstanding|awaiting|approvals?|tasks?|sign[\s-]?off|to\s+review|registration\s+approval)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (/\b(?:approve|reject|deny|decline|green[\s-]?light)\b/i.test(text)) {
    return false;
  }
  if (!/\b(?:suppliers?|vendors?)\b/i.test(text)) return false;

  return (
    /\b(?:supplier|vendor)s?\s+list\b/i.test(text) ||
    /\blist\s+(?:of\s+)?(?:all\s+)?(?:the\s+)?(?:suppliers?|vendors?)\b/i.test(text) ||
    /\b(?:give|show|list|get|display|fetch)\b.{0,40}\b(?:all|every|entire|full|the)?\s*(?:my\s+)?(?:suppliers?|vendors?)\b/i.test(
      text,
    )
  );
}

/**
 * Ordinary profile-field lookups (bank name, account, IFSC, etc.).
 * The activation LLM labels these ask_about_supplier because they mention
 * "the supplier", but they are served by get_supplier_bank_details — not the
 * pending-approval profile card. Approval/pending wording stays on Activation Signals.
 */
export function isSupplierFieldLookupPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  if (
    /\b(?:pending|outstanding|awaiting|approvals?|tasks?|sign[\s-]?off|to\s+review|registration\s+approval|what\s+changed|profile\s+changes?)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (/\b(?:approve|reject|deny|decline|green[\s-]?light)\b/i.test(text)) {
    return false;
  }

  return /\b(?:bank(?:ing)?(?:\s+name|\s+details?|\s+accounts?)?|account\s+(?:no|number|name)|ifsc|swift|iban|beneficiary)\b/i.test(
    text,
  );
}

/**
 * Legacy deterministic detection retained strictly as the classifier fallback.
 * It intentionally favors precision so unrelated Supplier Agent capabilities
 * continue through the normal agent orchestration.
 */
export function detectSupplierApprovalIntentFallback(
  prompt: string,
): SupplierApprovalIntentClassification {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return { intent: "other", confidence: 1, source: "fallback" };
  if (isSupplierFieldLookupPrompt(text) || isSupplierCatalogListPrompt(text)) {
    return { intent: "other", confidence: 1, source: "fallback" };
  }

  const supplierId =
    text.match(/\b(?:supplier|vendor)\s*(?:id|#)\s*[:#-]?\s*(\d+)\b/i)?.[1] ||
    text.match(/\b(?:id|#)\s*[:#-]?\s*(\d+)\b/i)?.[1] ||
    text.match(/\b(?:supplier|vendor)\s+(\d+)\b/i)?.[1];
  const openSupplierName = text
    .match(
      /\b(?:open|show|display|review|view)\s+(?:the\s+)?(.+?)\s+(?:supplier|vendor)(?:\s+(?:approval|profile|registration))?\b/i,
    )?.[1]
    ?.trim();
  const namedSupplierName = text
    .match(/\b(?:supplier|vendor)\s+(?:named|called)\s+(.+?)(?:[.!?]|$)/i)?.[1]
    ?.trim();
  const supplierName =
    openSupplierName && !/^(?:my\s+)?(?:pending|open|outstanding|this|the)$/i.test(openSupplierName)
      ? openSupplierName
      : namedSupplierName;

  if (
    supplierName &&
    /\b(?:open|show|display|review|view)\b.*\b(?:supplier|vendor)\b/i.test(text)
  ) {
    return {
      intent: "open_supplier_review",
      confidence: 0.84,
      supplierId,
      supplierName,
      source: "fallback",
    };
  }

  if (isPendingSupplierTasksIntent(text)) {
    return {
      intent: "list_pending_approvals",
      confidence: 0.9,
      supplierId,
      source: "fallback",
    };
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
    /\b(?:approve|green[\s-]?light|give\s+(?:it\s+)?the\s+go[\s-]?ahead|accept)\b/i.test(
      text,
    );

  const actionIntent: SupplierApprovalIntent | null = moreInfo
    ? "more_info"
    : reject
      ? "reject"
      : approve
        ? "approve"
        : null;
  if (actionIntent) {
    const extractedComments =
      text.match(/\b(?:with|add|comments?\s*(?:are|is|:)?|because)\s+(.+)$/i)?.[1]?.trim();
    const comments =
      extractedComments && !/^comments?\s*[.!]?$/i.test(extractedComments)
        ? extractedComments
        : undefined;
    return {
      intent: actionIntent,
      confidence: 0.82,
      supplierId,
      supplierName,
      comments,
      source: "fallback",
    };
  }

  if (
    /\b(?:open|show|display|review|view)\b.*\b(?:supplier|vendor|approval|profile)\b/i.test(text)
  ) {
    return {
      intent: "open_supplier_review",
      confidence: 0.78,
      supplierId,
      supplierName,
      source: "fallback",
    };
  }

  if (
    /^(?:what|which|why|how|tell\s+me|can\s+you\s+explain)\b.*\b(?:supplier|vendor|profile|changed|change)\b/i.test(
      text,
    )
  ) {
    return {
      intent: "ask_about_supplier",
      confidence: 0.75,
      supplierId,
      supplierName,
      source: "fallback",
    };
  }

  return { intent: "other", confidence: 1, source: "fallback" };
}

function getStage(
  response: SupplierActivationSignalsResponse,
): SupplierActivationStage | undefined {
  return response.stages.find((stage) => stage.id === "supplierApproval");
}

export function getSupplierApprovalReviewSpec(
  response: SupplierActivationSignalsResponse,
  taskIndex: number,
): SupplierApprovalReviewSpec | null {
  const stage = getStage(response);
  if (!stage || taskIndex < 0 || taskIndex >= stage.items.length) return null;
  const item = stage.items[taskIndex];
  return {
    supplierId: item.supplierId,
    taskId: item.taskId,
    companyName: item.companyName || item.title || `Supplier #${item.supplierId}`,
  };
}

export function buildSupplierPendingTasksResponse(
  response: SupplierActivationSignalsResponse,
): { message: string; flow?: SupplierTaskFlowSpec } {
  const stage = getStage(response);
  const items = stage?.items ?? [];

  if (items.length === 0) {
    return { message: buildNoPendingSupplierTasksMessage() };
  }

  const lines: string[] = [
    `**Supplier Approval (${items.length} pending)**`,
    "",
    `Required action: ${SUPPLIER_STAGE_ACTION_HINTS.supplierApproval}`,
    "",
    items.length === 1
      ? "Loading the supplier profile below…"
      : "Select a supplier below to review the full profile and approve or reject.",
  ];

  return {
    message: lines.join("\n").trim(),
    flow: {
      step: "tasks",
      tasks: items.map((item, index) => ({
        index,
        supplierId: item.supplierId,
        taskId: item.taskId,
        companyName: item.companyName || item.title || `Supplier #${item.supplierId}`,
        title: item.title,
      })),
    },
  };
}

export function buildNoPendingSupplierTasksMessage(): string {
  return "You're all caught up — there are **no pending tasks from your enabled Activation Signals** right now.\n\nWhen a supplier finishes onboarding and needs your sign-off, it will appear here and in **Activation Signals**.";
}
