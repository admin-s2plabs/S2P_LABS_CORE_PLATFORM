export const SOURCING_ACTIVATION_STAGES = [
  "bidApproval",
  "openEnvelope",
  "technicalReview",
  "technicalEvaluation",
  "commercialReview",
  "commercialEvaluation",
  "awarding",
  "bidAwardApproval",
] as const;

export type SourcingActivationStageId = (typeof SOURCING_ACTIVATION_STAGES)[number];
export type SourcingActivationPreferences = Record<SourcingActivationStageId, boolean>;

export type ActivationStageStatus = "pending" | "idle";

export interface SourcingActivationStageItem {
  bidId?: string;
  awardId?: string;
  title: string;
  taskId?: string;
  responseCount?: number;
}

export interface SourcingActivationStage {
  id: SourcingActivationStageId;
  label: string;
  status: ActivationStageStatus;
  pendingCount: number;
  items: SourcingActivationStageItem[];
}

export interface SourcingActivationSignalsResponse {
  stages: SourcingActivationStage[];
  suggestedNotification: string | null;
  nextStageId: SourcingActivationStageId | null;
}

export const SOURCING_ACTIVATION_STAGE_LABELS: Record<SourcingActivationStageId, string> = {
  bidApproval: "Bid Approval",
  openEnvelope: "Open Envelope",
  technicalReview: "Technical Review",
  technicalEvaluation: "Technical Approve",
  commercialReview: "Commercial Review",
  commercialEvaluation: "Commercial Approve",
  awarding: "Awarding",
  bidAwardApproval: "Bid Award Approval",
};

export const SOURCING_ACTIVATION_LIFECYCLE_ORDER: SourcingActivationStageId[] = [
  "bidApproval",
  "openEnvelope",
  "technicalReview",
  "technicalEvaluation",
  "commercialReview",
  "commercialEvaluation",
  "awarding",
  "bidAwardApproval",
];

const NEXT_STAGE_HINT: Partial<Record<SourcingActivationStageId, string>> = {
  bidApproval: "Open Envelope",
  openEnvelope: "Technical Review",
  technicalReview: "Technical Approve",
  technicalEvaluation: "Commercial Review",
  commercialReview: "Commercial Approve",
  commercialEvaluation: "Awarding",
  awarding: "Bid Award Approval",
};

export function mapTaskSubjectToStage(subject: string): SourcingActivationStageId | null {
  const s = String(subject || "");
  if (s.includes("Bid Publish") || s.includes("Bid Extension Approval")) {
    return "bidApproval";
  }
  if (s.includes("Tender opening")) {
    return "openEnvelope";
  }
  if (s.includes("Technical scoring approval")) {
    return "technicalEvaluation";
  }
  if (s.includes("Technical scoring")) {
    return "technicalReview";
  }
  if (s.includes("Commercial scoring approval")) {
    return "commercialEvaluation";
  }
  if (s.includes("Commercial scoring")) {
    return "commercialReview";
  }
  if (s.includes("Bid Award") || s.includes("Tender award accept")) {
    return "bidAwardApproval";
  }
  return null;
}

export function isBidWorkflowTask(task: {
  subject?: string;
  taskName?: string;
  process_name?: string;
}): boolean {
  const subject = String(task.subject || "");
  const taskName = String(task.taskName || "");
  const processName = String(task.process_name || "");
  if (taskName === "Bid" || processName === "Bid") return true;
  return mapTaskSubjectToStage(subject) !== null;
}

export function buildSuggestedNotification(
  stages: SourcingActivationStage[],
): { message: string | null; nextStageId: SourcingActivationStageId | null } {
  const pending = SOURCING_ACTIVATION_LIFECYCLE_ORDER.map((id) =>
    stages.find((st) => st.id === id),
  ).filter((st): st is SourcingActivationStage => !!st && st.status === "pending" && st.pendingCount > 0);

  if (pending.length === 0) {
    return { message: null, nextStageId: null };
  }

  const stage = pending[0];
  const nextHint = NEXT_STAGE_HINT[stage.id];
  const label = stage.label;
  const count = stage.pendingCount;

  if (stage.id === "technicalReview" || stage.id === "commercialReview") {
    const supplierTotal = stage.items.reduce((sum, item) => sum + (item.responseCount || 0), 0);
    const bidPart = count === 1 ? "1 bid" : `${count} bids`;
    const supplierPart =
      supplierTotal > 0
        ? ` (${supplierTotal} supplier response${supplierTotal === 1 ? "" : "s"} across those bids)`
        : "";
    const nextPart = nextHint ? ` Complete this step to proceed to ${nextHint}.` : "";
    return {
      message: `${label} is pending on ${bidPart}${supplierPart}.${nextPart}`,
      nextStageId: stage.id,
    };
  }

  if (stage.id === "awarding") {
    const bidPart = count === 1 ? "1 bid is" : `${count} bids are`;
    return {
      message: `${bidPart} ready for awarding. Compare supplier responses and submit the award from the Sourcing Agent.`,
      nextStageId: stage.id,
    };
  }

  const itemPart = count === 1 ? "1 item" : `${count} items`;
  const nextPart = nextHint ? ` Please complete this to proceed to ${nextHint}.` : "";
  return {
    message: `${label} is pending (${itemPart}).${nextPart}`,
    nextStageId: stage.id,
  };
}

export function defaultActivationPreferences(): SourcingActivationPreferences {
  return SOURCING_ACTIVATION_STAGES.reduce(
    (acc, id) => {
      acc[id] = true;
      return acc;
    },
    {} as SourcingActivationPreferences,
  );
}

export function normalizeActivationPreferences(
  value: unknown,
): SourcingActivationPreferences {
  const preferences = defaultActivationPreferences();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return preferences;
  }

  const candidate = value as Partial<SourcingActivationPreferences>;
  for (const id of SOURCING_ACTIVATION_STAGES) {
    if (typeof candidate[id] === "boolean") {
      preferences[id] = candidate[id]!;
    }
  }
  return preferences;
}

export function isActivationStageEnabled(
  preferences: SourcingActivationPreferences | undefined,
  stageId: SourcingActivationStageId,
): boolean {
  return preferences?.[stageId] !== false;
}

export function filterActivationSignalsByPreferences(
  response: SourcingActivationSignalsResponse,
  preferences: SourcingActivationPreferences | undefined,
): SourcingActivationSignalsResponse {
  const stages = response.stages.map((stage) =>
    isActivationStageEnabled(preferences, stage.id)
      ? stage
      : { ...stage, status: "idle" as const, pendingCount: 0, items: [] },
  );
  const { message, nextStageId } = buildSuggestedNotification(stages);
  return { stages, suggestedNotification: message, nextStageId };
}

export const STAGE_ACTION_HINTS: Record<SourcingActivationStageId, string> = {
  bidApproval: "Review and approve or reject the bid publish/extension request",
  openEnvelope: "Open the tender envelope as a Committee Team member",
  technicalReview: "Complete technical scoring for supplier responses",
  technicalEvaluation: "Review and approve technical scores",
  commercialReview: "Complete commercial scoring for supplier responses",
  commercialEvaluation: "Review and approve commercial scores",
  awarding:
    "Review supplier responses, compare bids, award remaining quantity or line items (including partial awards), and submit the award with required award notes",
  bidAwardApproval:
    "Review and approve or reject the bid award (workflow approvals require comments)",
};

export function countTotalPendingItems(stages: SourcingActivationStage[]): number {
  return stages.reduce((sum, stage) => sum + stage.pendingCount, 0);
}

export function isPendingSourcingTasksIntent(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  const patterns = [
    /^please show me all my pending sourcing tasks\.?$/i,
    /\b(show|list|get|display|what are)\b.*\b(my\s+)?(pending|outstanding|open)\b.*\b(sourcing\s+)?(tasks?|approvals?|work|queue)\b/i,
    /\b(pending|outstanding)\b.*\b(sourcing\s+)?(tasks?|approvals?)\b/i,
    /\bopen\b.*\b(sourcing\s+)?tasks?\b/i,
    /\b(sourcing\s+)?updates\b/i,
    /\bwhat(\s+do|\s+should)\s+i\s+(do|need\s+to\s+do)\s+(next|now)\b/i,
    /\bany\s+pending\s+(sourcing\s+)?(actions?|work|items?|approvals?)\b/i,
    /\bwhat('s|\s+is)\s+pending\b/i,
    /\bwhat('s|\s+is)\s+waiting\s+(for\s+me|on\s+me)\b/i,
    /\b(show|list|get|display)\b.*\b(everything|all)\b.*\b(i\s+need\s+to\s+review|assigned\s+to\s+me)\b/i,
    /\b(my\s+)?sourcing\s+queue\b/i,
    /\bwhat\s+sourcing\s+work\s+is\s+assigned\s+to\s+me\b/i,
    /\btasks?\s+(awaiting|needing)\s+(my\s+)?action\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

export function hasRecentPendingTasksDiscussion(
  conversationHistory: Array<{ role: string; content: string }>,
): boolean {
  const recent = conversationHistory.slice(-10);
  return recent.some(
    (m) =>
      (m.role === "user" && isPendingSourcingTasksIntent(m.content)) ||
      (m.role === "assistant" &&
        (/\btask\s*#\d+/i.test(m.content) ||
          /\bwhich task would you like\b/i.test(m.content) ||
          /\bpending sourcing tasks?\b/i.test(m.content) ||
          /\bhere are your pending sourcing task categories\b/i.test(m.content) ||
          /\b\*\*.+\(\d+ pending\)\*\*/i.test(m.content) ||
          /\bhere(?:'s| is) (?:a )?summary of (?:your )?pending\b/i.test(m.content))),
  );
}

export function isSourcingTaskWorkflowContinuation(
  prompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
): boolean {
  if (!hasRecentPendingTasksDiscussion(conversationHistory)) {
    return false;
  }

  const text = String(prompt || "").trim();
  if (!text) return false;

  if (isPendingSourcingTasksIntent(text)) {
    return true;
  }

  return (
    /^\s*(#?\d+|first|second|third|fourth|fifth|next|last)\b/i.test(text) ||
    /\b(let'?s|i'?ll|start with|go with|do|take|pick|choose|work on|guide me)\b/i.test(text) ||
    /\b(bid\s+approval|open\s+envelope|tender\s+opening|technical\s+(eval|evaluation|evaluate|review|approve)|commercial\s+(eval|evaluation|evaluate|review|approve)|award(ing)?|bid\s+award)\b/i.test(
      text,
    ) ||
    /\b(done|completed|finished|next\s+task|what'?s\s+next|move\s+on|all\s+set|remaining|left)\b/i.test(text) ||
    /\btask\s*#?\d+\b/i.test(text)
  );
}

export function getStageNavigationPath(
  stageId: SourcingActivationStageId,
  item: SourcingActivationStageItem,
): string {
  const bidId = item.bidId;
  const awardId = item.awardId;
  switch (stageId) {
    case "bidApproval":
      return bidId ? `/app/bids/${bidId}` : "/app/my-tasks";
    case "openEnvelope":
    case "awarding":
      return bidId ? `/app/bids/${bidId}/evaluate` : "/app/my-tasks";
    case "technicalEvaluation":
    case "technicalReview":
      return bidId ? `/app/bids/${bidId}/tech-score` : "/app/my-tasks";
    case "commercialEvaluation":
    case "commercialReview":
      return bidId ? `/app/bids/${bidId}/comm-score` : "/app/my-tasks";
    case "bidAwardApproval":
      return awardId || bidId ? `/app/bids/${awardId || bidId}/award` : "/app/my-tasks";
    default:
      return "/app/my-tasks";
  }
}

/** Screen line for pending-task messages. Appends hidden ::task: metadata when a workflow task id exists. */
export function formatPendingTaskScreenLine(
  stageId: SourcingActivationStageId,
  item: SourcingActivationStageItem,
): string {
  const path = getStageNavigationPath(stageId, item);
  if (item.taskId) {
    return `Screen: ${path} ::task:${item.taskId}`;
  }
  return `Screen: ${path}`;
}

export function formatActivationSignalsForAgent(
  response: SourcingActivationSignalsResponse,
): string | null {
  const pendingStages = response.stages.filter((stage) => stage.pendingCount > 0);
  if (pendingStages.length === 0) return null;

  const totalItems = countTotalPendingItems(response.stages);
  const lines: string[] = [
    `Total pending items: ${totalItems} across ${pendingStages.length} lifecycle stage(s).`,
    "",
  ];

  let taskNumber = 1;
  for (const stage of pendingStages) {
    lines.push(`## ${stage.label} (${stage.pendingCount} pending)`);
    for (const item of stage.items) {
      const details: string[] = [`Task #${taskNumber}`, stage.label];
      if (item.title) details.push(item.title);
      if (item.bidId) details.push(`Bid ID: ${item.bidId}`);
      if (item.awardId) details.push(`Award ID: ${item.awardId}`);
      if (item.taskId) details.push(`Workflow Task ID: ${item.taskId}`);
      if (item.responseCount) details.push(`Supplier responses: ${item.responseCount}`);
      details.push(`Required action: ${STAGE_ACTION_HINTS[stage.id]}`);
      details.push(`Screen: ${getStageNavigationPath(stage.id, item)}`);
      lines.push(`- ${details.join(" | ")}`);
      taskNumber += 1;
    }
    lines.push("");
  }

  if (response.suggestedNotification) {
    lines.push(`Suggested priority: ${response.suggestedNotification}`);
  }

  return lines.join("\n").trim();
}

export type SourcingTaskFlowStep = "categories" | "stageTasks";

export interface SourcingTaskFlowCategory {
  id: SourcingActivationStageId;
  label: string;
  pendingCount: number;
}

export interface SourcingTaskFlowTaskItem {
  index: number;
  globalTaskNumber: number;
  title: string;
  bidId?: string;
  awardId?: string;
  taskId?: string;
}

export interface SourcingTaskFlowSpec {
  step: SourcingTaskFlowStep;
  categories?: SourcingTaskFlowCategory[];
  stageId?: SourcingActivationStageId;
  tasks?: SourcingTaskFlowTaskItem[];
}

export type PendingTaskReviewFlowType =
  | "bidApprovalReview"
  | "openEnvelopeReview"
  | "technicalReviewReview"
  | "technicalEvaluationReview"
  | "commercialReviewReview"
  | "commercialEvaluationReview"
  | "awardingReview"
  | "bidAwardApprovalReview";

export interface PendingTaskFlowContext {
  pendingTaskFlow?: "categories" | "tasks" | PendingTaskReviewFlowType;
  stageId?: SourcingActivationStageId;
  taskIndex?: number;
  /** Optional active review card context for pronoun resolution ("this bid", "it"). */
  activeReview?: {
    stageId: SourcingActivationStageId;
    title?: string;
    bidId?: string;
    bidNumber?: string;
    awardId?: string;
  };
}

export const SOURCING_ACTIVATION_INTENTS = [
  "list_pending_tasks",
  "open_bid_approval",
  "open_open_envelope",
  "open_technical_review",
  "open_technical_approve",
  "open_commercial_review",
  "open_commercial_approve",
  "open_awarding",
  "open_bid_award_approval",
  "approve",
  "reject",
  "more_info",
  "ask_about_task",
  "other",
] as const;

export type SourcingActivationIntent = (typeof SOURCING_ACTIVATION_INTENTS)[number];

/**
 * Classification is orchestration-only. Workflow execution stays in existing
 * review cards, tool calls, and APIs — the classifier never approves, awards,
 * scores, or mutates workflow state.
 */
export interface SourcingActivationIntentClassification {
  intent: SourcingActivationIntent;
  confidence: number;
  stageId?: SourcingActivationStageId;
  bidNumber?: string;
  bidId?: string;
  awardId?: string;
  supplierName?: string;
  supplierId?: string;
  comments?: string;
  contextualHints?: string;
  source: "llm" | "fallback";
}

const INTENT_TO_STAGE: Partial<Record<SourcingActivationIntent, SourcingActivationStageId>> = {
  open_bid_approval: "bidApproval",
  open_open_envelope: "openEnvelope",
  open_technical_review: "technicalReview",
  open_technical_approve: "technicalEvaluation",
  open_commercial_review: "commercialReview",
  open_commercial_approve: "commercialEvaluation",
  open_awarding: "awarding",
  open_bid_award_approval: "bidAwardApproval",
};

export function getStageIdFromSourcingActivationIntent(
  intent: SourcingActivationIntent,
): SourcingActivationStageId | null {
  return INTENT_TO_STAGE[intent] || null;
}

export function getClassifiedSourcingStage(
  classification: SourcingActivationIntentClassification,
  flowContext?: PendingTaskFlowContext | null,
): SourcingActivationStageId | null {
  if (classification.stageId) return classification.stageId;
  const fromIntent = getStageIdFromSourcingActivationIntent(classification.intent);
  if (fromIntent) return fromIntent;
  return flowContext?.activeReview?.stageId || flowContext?.stageId || null;
}

function extractSourcingBidRefs(text: string): {
  bidNumber?: string;
  bidId?: string;
  awardId?: string;
} {
  const bidNumber =
    text.match(/\b((?:RFQ|RFP|TND|TENDER|BID)[-_]?\d{4,})\b/i)?.[1]?.toUpperCase()?.replace(/^TENDER/, "TND") ||
    text.match(/\b(?:bid|rfq|rfp|tender)\s*(?:number|no\.?|#)?\s*[:#-]?\s*((?:RFQ|RFP|TND|BID)?\d{4,})\b/i)?.[1]?.toUpperCase();
  const hashId = text.match(/(?:^|\s)#(\d{4,})\b/)?.[1];
  const bidId =
    text.match(/\bbid\s*(?:id|#)?\s*[:#-]?\s*(\d{2,})\b/i)?.[1] ||
    text.match(/\bid\s*[:#-]?\s*(\d{2,})\b/i)?.[1] ||
    hashId;
  const awardId = text.match(/\baward\s*(?:id|#|number|no\.?)?\s*[:#-]?\s*(\d{2,})\b/i)?.[1];
  return {
    bidNumber: bidNumber || undefined,
    bidId: bidId || undefined,
    awardId: awardId || undefined,
  };
}

/**
 * Legacy deterministic detection retained strictly as the LLM classifier
 * fallback. Keep this precise so unrelated Sourcing Agent capabilities
 * continue through the normal agent orchestration.
 */
/**
 * Read-only "who responded / show supplier responses" queries belong to the
 * normal Sourcing Agent (get_bid_responses), not Activation Signal inbox tasks.
 * Exclude compare/award/scoring/detail wording so those stay on activation paths.
 */
export function isReadOnlyBidResponsesPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return false;
  if (
    /\b(?:award(?:ing)?|compare|side[-\s]?by[-\s]?side|technical|financial|full|detailed|score|scoring|evaluate|evaluation)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return (
    /\b(?:who|which)\b[\s\S]*\brespond/i.test(text) ||
    /\b(?:show|list|view|display|see|get|tell)\b[\s\S]*\b(?:supplier|vendor)?\s*responses?\b/i.test(
      text,
    ) ||
    /\b(?:supplier|vendor)\s+responses?\b/i.test(text)
  );
}

/**
 * "Show bids which are to be Awarded" / ready-for-award list requests → Awarding
 * activation signals. Must NOT route to awarded-but-pending-PO analytics.
 */
export function isPendingAwardingListPrompt(prompt: string): boolean {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return false;
  // Explicitly exclude already-awarded / pending-PO wording.
  if (
    /\b(?:requiring|need(?:ing)?|without|pending)\s+(?:a\s+)?po\b/i.test(text) ||
    /\bpo\s+creation\b/i.test(text) ||
    /\bawarded\s+bids?\b/i.test(text) ||
    /\balready\s+awarded\b/i.test(text)
  ) {
    return false;
  }
  return (
    /\bto\s+be\s+awarded\b/i.test(text) ||
    /\byet\s+to\s+(?:be\s+)?award(?:ed)?\b/i.test(text) ||
    /\bready\s+(?:for|to)\s+(?:be\s+)?award(?:ed|ing)?\b/i.test(text) ||
    /\bawaiting\s+(?:an?\s+)?award(?:ing)?\b/i.test(text) ||
    /\bbids?\s+(?:which|that)\s+are\s+to\s+be\s+awarded\b/i.test(text) ||
    /\b(?:show|list|get|display|view)\s+bids?\s+(?:which|that)\s+(?:are\s+)?to\s+be\s+awarded\b/i.test(
      text,
    ) ||
    /\b(?:show|list|get|display|view)\s+bids?\s+to\s+(?:be\s+)?award(?:ed)?\b/i.test(text)
  );
}

function looksLikeHistoricalAwardedPrompt(text: string): boolean {
  if (isPendingAwardingListPrompt(text)) return false;
  return /\bawarded\b/i.test(text);
}

export function detectSourcingActivationIntentFallback(
  prompt: string,
): SourcingActivationIntentClassification {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (!text) return { intent: "other", confidence: 1, source: "fallback" };

  // "show me the responses for TND…" must not become ask_about_task just because
  // navigation words + a bid number are present — that opens pending Awarding.
  if (isReadOnlyBidResponsesPrompt(text)) {
    const refs = extractSourcingBidRefs(text);
    return {
      intent: "other",
      confidence: 0.92,
      source: "fallback",
      bidNumber: refs.bidNumber,
      bidId: refs.bidId,
      awardId: refs.awardId,
    };
  }

  const refs = extractSourcingBidRefs(text);
  const comments =
    text.match(
      /\b(?:with\s+(?:comments?|remarks?|reason)|comments?\s*(?:are|is|:)|remarks?\s*(?:are|is|:)|because)\s+(.+)$/i,
    )?.[1]?.trim();
  const contextualHints = text.match(
    /\b(?:latest|newest|most\s+recent|first|next|last|this|current)\b/i,
  )?.[0];
  const supplierName =
    text.match(/\b(?:supplier|vendor)\s+(?:named|called)\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim() ||
    text.match(/\b(?:for|to)\s+(?:supplier|vendor)\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim();

  let stageId: SourcingActivationStageId | undefined;
  if (/\bbid\s+award\s+approvals?\b|\bapprove\s+(?:the\s+)?(?:bid\s+)?award\b|\bapprove\b.+\baward\b/i.test(text)) {
    stageId = "bidAwardApproval";
  } else if (/\bbid\s+(?:publish\s+|extension\s+)?approvals?\b/i.test(text)) {
    stageId = "bidApproval";
  } else if (/\b(?:open|opening)\s+(?:the\s+)?(?:tender\s+)?envelopes?\b|\btender\s+openings?\b|\bopen\s+open\s+envelope\b/i.test(text)) {
    stageId = "openEnvelope";
  } else if (/\btechnical\s+(?:evaluat(?:e|ion)|approves?|approvals?)\b/i.test(text)) {
    stageId = "technicalEvaluation";
  } else if (
    /\btechnical\s+(?:reviews?|scoring|scores?)\b/i.test(text) ||
    /\b(?:score|evaluate|review)\b.*\b(?:technical|tech)\b/i.test(text) ||
    /\b(?:score|scoring|evaluate|evaluation)\b.+\b(?:rfq|rfp|tnd|tender|bid)\b/i.test(text) ||
    /\b(?:rfq|rfp|tnd|tender|bid)[-_]?\d*.*\b(?:score|scoring|evaluate|evaluation)\b/i.test(text) ||
    (/^\s*(?:score|evaluate|evaluation|scoring)\b/i.test(text) && !/\bcommercial\b/i.test(text))
  ) {
    stageId = "technicalReview";
  } else if (/\bcommercial\s+(?:evaluat(?:e|ion)|approves?|approvals?)\b/i.test(text)) {
    stageId = "commercialEvaluation";
  } else if (/\bcommercial\s+(?:reviews?|scoring|scores?)\b/i.test(text)) {
    stageId = "commercialReview";
  } else if (
    isPendingAwardingListPrompt(text) ||
    (!looksLikeHistoricalAwardedPrompt(text) &&
      (/\bawarding\b/i.test(text) ||
        /\baward\s+(?:this|the|rfq|rfp|tender|bid|it)\b/i.test(text) ||
        /\baward\s+(?:rfq|rfp|tnd|tender|bid)[-_]?\d+/i.test(text) ||
        /\bselect\s+(?:a\s+)?(?:winning\s+)?supplier\b/i.test(text) ||
        /\bopen\s+awarding\b/i.test(text)))
  ) {
    stageId = "awarding";
  }

  const base = {
    stageId,
    bidNumber: refs.bidNumber,
    bidId: refs.bidId,
    awardId: refs.awardId,
    supplierName: supplierName || undefined,
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

  if (isPendingSourcingTasksIntent(text)) {
    return { ...base, intent: "list_pending_tasks", confidence: 0.9 };
  }

  const navigation = /\b(?:show|open|list|get|display|view|take\s+me\s+to|do\s+i\s+have|start|begin)\b/i;
  const scoreLike = /\b(?:score|scoring|evaluate|evaluation|review)\b/i;

  if (stageId === "bidAwardApproval" && (navigation.test(text) || /\bpending\b/i.test(text) || approve)) {
    return { ...base, intent: "open_bid_award_approval", confidence: 0.86 };
  }
  if (stageId === "bidApproval" && (navigation.test(text) || /\bpending\b/i.test(text))) {
    return { ...base, intent: "open_bid_approval", confidence: 0.86 };
  }
  if (stageId === "openEnvelope" && (navigation.test(text) || /\bpending\b/i.test(text))) {
    return { ...base, intent: "open_open_envelope", confidence: 0.86 };
  }
  if (stageId === "technicalEvaluation" && (navigation.test(text) || /\bpending\b/i.test(text) || approve)) {
    return { ...base, intent: "open_technical_approve", confidence: 0.86 };
  }
  if (stageId === "technicalReview" && (navigation.test(text) || scoreLike.test(text) || /\bpending\b/i.test(text))) {
    return { ...base, intent: "open_technical_review", confidence: 0.86 };
  }
  if (stageId === "commercialEvaluation" && (navigation.test(text) || /\bpending\b/i.test(text) || approve)) {
    return { ...base, intent: "open_commercial_approve", confidence: 0.86 };
  }
  if (stageId === "commercialReview" && (navigation.test(text) || scoreLike.test(text) || /\bpending\b/i.test(text))) {
    return { ...base, intent: "open_commercial_review", confidence: 0.86 };
  }
  if (
    stageId === "awarding" &&
    (navigation.test(text) ||
      /\baward\b/i.test(text) ||
      /\bpending\b/i.test(text) ||
      isPendingAwardingListPrompt(text))
  ) {
    return { ...base, intent: "open_awarding", confidence: 0.9 };
  }

  // Only phrasings that ask to open/review the task itself. A bare "what" would
  // turn any attribute question ("what currency is used in bid RFQ260054?") into
  // an inbox task open whenever that bid happens to have a pending task.
  const askAboutTask = /\b(?:tell\s+me\s+about|ask\s+about|what\s+about)\b/i;

  if (
    (refs.bidNumber || refs.bidId || refs.awardId) &&
    (navigation.test(text) || scoreLike.test(text) || askAboutTask.test(text))
  ) {
    return { ...base, intent: "ask_about_task", confidence: 0.78 };
  }

  return { intent: "other", confidence: 1, source: "fallback" };
}

function normalizeSourcingEntity(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Match pending inbox items for a bid/award reference without guessing across ambiguous hits. */
export function findPendingItemsMatchingBidRef(
  response: SourcingActivationSignalsResponse,
  refs: {
    bidNumber?: string;
    bidId?: string;
    awardId?: string;
    /** Numeric bid id after DB resolution of RFQ/RFP/TND/Bid numbers. */
    resolvedNumericId?: string | number;
  },
  stageId?: SourcingActivationStageId | null,
): Array<{ stageId: SourcingActivationStageId; item: SourcingActivationStageItem; index: number }> {
  const needles = [refs.bidNumber, refs.bidId, refs.awardId, refs.resolvedNumericId]
    .map(normalizeSourcingEntity)
    .filter(Boolean);

  // RFQ260015 / TND260015 → also try the numeric suffix for title/ref matching.
  for (const needle of [...needles]) {
    const digits = needle.replace(/^[a-z]+/, "");
    if (digits && digits !== needle && digits.length >= 4 && !needles.includes(digits)) {
      needles.push(digits);
    }
  }

  if (needles.length === 0) return [];

  const stages = stageId
    ? response.stages.filter((stage) => stage.id === stageId && stage.pendingCount > 0)
    : getPendingStages(response);

  const matches: Array<{
    stageId: SourcingActivationStageId;
    item: SourcingActivationStageItem;
    index: number;
  }> = [];

  for (const stage of stages) {
    stage.items.forEach((item, index) => {
      const haystacks = [item.bidId, item.awardId, item.title, item.taskId].map(normalizeSourcingEntity);
      const matched = needles.some((needle) =>
        haystacks.some(
          (hay) =>
            hay === needle ||
            (needle.length >= 4 && hay.includes(needle)) ||
            // Only a bare numeric form of the same reference (title "260015" for
            // RFQ260015). Plain substrings would let a task titled "RFP2" match
            // an unrelated RFP260021.
            (hay.length >= 4 && /^\d+$/.test(hay) && needle.endsWith(hay)),
        ),
      );
      if (matched) {
        matches.push({ stageId: stage.id, item, index });
      }
    });
  }

  return matches;
}

export function resolveClassifiedSourcingItem(
  response: SourcingActivationSignalsResponse,
  stageId: SourcingActivationStageId,
  classification: SourcingActivationIntentClassification,
  flowContext?: PendingTaskFlowContext | null,
): SourcingActivationStageItem | null {
  const stage = response.stages.find((candidate) => candidate.id === stageId);
  const items = stage?.items || [];
  if (!items.length) return null;

  const matches = findPendingItemsMatchingBidRef(
    response,
    {
      bidNumber: classification.bidNumber || flowContext?.activeReview?.bidNumber,
      bidId: classification.bidId || flowContext?.activeReview?.bidId,
      awardId: classification.awardId || flowContext?.activeReview?.awardId,
    },
    stageId,
  );
  if (matches.length === 1) return matches[0].item;
  if (matches.length > 1) return null;

  if (flowContext?.stageId === stageId && flowContext.taskIndex != null) {
    return getStageItemByIndex(response, stageId, flowContext.taskIndex);
  }

  if (
    flowContext?.activeReview?.stageId === stageId ||
    /\b(?:latest|newest|most\s+recent|first|next|this|current)\b/i.test(
      classification.contextualHints || "",
    ) ||
    items.length === 1
  ) {
    return items[0];
  }

  return null;
}

export function getPendingTaskReviewFlowType(
  stageId: SourcingActivationStageId,
): PendingTaskReviewFlowType | null {
  if (stageId === "bidApproval") return "bidApprovalReview";
  if (stageId === "openEnvelope") return "openEnvelopeReview";
  if (stageId === "technicalReview") return "technicalReviewReview";
  if (stageId === "technicalEvaluation") return "technicalEvaluationReview";
  if (stageId === "commercialReview") return "commercialReviewReview";
  if (stageId === "commercialEvaluation") return "commercialEvaluationReview";
  if (stageId === "awarding") return "awardingReview";
  if (stageId === "bidAwardApproval") return "bidAwardApprovalReview";
  return null;
}

export function parsePendingTaskFlowContext(raw: string | undefined | null): PendingTaskFlowContext | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as PendingTaskFlowContext;
    if (!parsed?.pendingTaskFlow) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getPendingStages(response: SourcingActivationSignalsResponse): SourcingActivationStage[] {
  return SOURCING_ACTIVATION_LIFECYCLE_ORDER.map((id) =>
    response.stages.find((stage) => stage.id === id),
  ).filter((stage): stage is SourcingActivationStage => !!stage && stage.pendingCount > 0);
}

function formatTaskTitle(item: SourcingActivationStageItem): string {
  return item.title?.trim() || "Untitled task";
}

export function buildPendingTasksCategoriesResponse(
  response: SourcingActivationSignalsResponse,
): { message: string; flow: SourcingTaskFlowSpec } {
  const pendingStages = getPendingStages(response);
  const lines: string[] = ["Here are your pending sourcing task categories:", ""];

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
  response: SourcingActivationSignalsResponse,
  stageId: SourcingActivationStageId,
): number {
  let offset = 0;
  for (const id of SOURCING_ACTIVATION_LIFECYCLE_ORDER) {
    if (id === stageId) break;
    const stage = response.stages.find((entry) => entry.id === id);
    if (stage && stage.pendingCount > 0) {
      offset += stage.items.length;
    }
  }
  return offset;
}

export function buildPendingTasksStageTasksResponse(
  response: SourcingActivationSignalsResponse,
  stageId: SourcingActivationStageId,
): { message: string; flow?: SourcingTaskFlowSpec } | null {
  const stage = response.stages.find((entry) => entry.id === stageId && entry.pendingCount > 0);
  if (!stage) return null;

  const taskNumberOffset = getGlobalTaskNumberOffset(response, stageId);
  const lines: string[] = [`**${stage.label} (${stage.pendingCount} pending)**`, ""];

  if (
    stageId === "bidApproval" ||
    stageId === "openEnvelope" ||
    stageId === "technicalReview" ||
    stageId === "technicalEvaluation" ||
    stageId === "commercialReview" ||
    stageId === "commercialEvaluation" ||
    stageId === "awarding" ||
    stageId === "bidAwardApproval"
  ) {
    lines.push(`Required action: ${STAGE_ACTION_HINTS[stage.id]}`);
    lines.push("");
    const loadingMessage =
      stageId === "bidApproval"
        ? stage.pendingCount === 1
          ? "Loading bid approval details…"
          : "Select a bid below to review and approve or reject."
        : stageId === "openEnvelope"
          ? stage.pendingCount === 1
            ? "Loading envelope opening details…"
            : "Select a bid below to review and open the envelope."
          : stageId === "technicalReview"
            ? stage.pendingCount === 1
              ? "Loading technical review details…"
              : "Select a bid below to review supplier responses and complete technical scoring."
            : stageId === "technicalEvaluation"
              ? stage.pendingCount === 1
                ? "Loading technical approve details…"
                : "Select a bid below to review and approve technical scores."
              : stageId === "commercialEvaluation"
                ? stage.pendingCount === 1
                  ? "Loading commercial approve details…"
                  : "Select a bid below to review and approve commercial scores."
                : stageId === "commercialReview"
                  ? stage.pendingCount === 1
                    ? "Loading commercial review details…"
                    : "Select a bid below to review supplier responses and complete commercial scoring."
                  : stageId === "bidAwardApproval"
                    ? stage.pendingCount === 1
                      ? "Loading bid award approval details…"
                      : "Select an award below to review and approve or reject."
                    : stage.pendingCount === 1
                      ? "Loading awarding details…"
                      : "Select a bid below to compare responses and submit the award.";

    lines.push(loadingMessage);

    return {
      message: lines.join("\n").trim(),
      flow: {
        step: "stageTasks",
        stageId,
        tasks: stage.items.map((item, index) => ({
          index,
          globalTaskNumber: taskNumberOffset + index + 1,
          title: formatTaskTitle(item),
          bidId: item.bidId,
          awardId: item.awardId,
          taskId: item.taskId,
        })),
      },
    };
  }

  stage.items.forEach((item, index) => {
    const title = formatTaskTitle(item);
    const globalTaskNum = taskNumberOffset + index + 1;
    lines.push(`**${index + 1}. Task #${globalTaskNum} | ${stage.label} | ${title}**`);
    if (item.bidId) lines.push(`Bid ID: ${item.bidId}`);
    if (item.awardId) lines.push(`Award ID: ${item.awardId}`);
    if (item.responseCount) {
      lines.push(`Supplier responses: ${item.responseCount}`);
    }
    lines.push(`Required action: ${STAGE_ACTION_HINTS[stage.id]}`);
    lines.push(formatPendingTaskScreenLine(stage.id, item));
    lines.push("");
  });

  return {
    message: lines.join("\n").trim(),
  };
}

export function getStageItemByIndex(
  response: SourcingActivationSignalsResponse,
  stageId: SourcingActivationStageId,
  taskIndex: number,
): SourcingActivationStageItem | null {
  const stage = response.stages.find((entry) => entry.id === stageId && entry.pendingCount > 0);
  if (!stage || taskIndex < 0 || taskIndex >= stage.items.length) return null;
  return stage.items[taskIndex];
}

export function parseStageSelectionFromPrompt(
  prompt: string,
  response: SourcingActivationSignalsResponse,
): SourcingActivationStageId | null {
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

  const keywordMap: Partial<Record<SourcingActivationStageId, string[]>> = {
    bidApproval: ["bid approval", "publish approval"],
    openEnvelope: ["open envelope", "tender opening", "envelope opening"],
    technicalReview: ["technical review", "tech review", "technical scoring"],
    technicalEvaluation: [
      "technical evaluate",
      "technical evaluation",
      "technical eval",
      "technical approve",
      "tech approve",
    ],
    commercialReview: ["commercial review", "comm review", "commercial scoring"],
    commercialEvaluation: [
      "commercial evaluate",
      "commercial evaluation",
      "commercial eval",
      "commercial approve",
      "comm approve",
    ],
    awarding: [
      "awarding",
      "award ready",
      "to be awarded",
      "bids to award",
      "ready for award",
      "awaiting award",
    ],
    bidAwardApproval: ["bid award approval", "award approval"],
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
    ) ||
    /\b(done|completed|finished|all set|move on)\b/i.test(text)
  );
}

export function resolvePendingTaskFlowStep(
  prompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
  response: SourcingActivationSignalsResponse,
  flowContext?: PendingTaskFlowContext | null,
): "categories" | "tasks" | PendingTaskReviewFlowType | "reset" | null {
  const pendingStages = getPendingStages(response);
  if (pendingStages.length === 0) return null;

  if (isPendingTasksFlowResetPrompt(prompt) && hasRecentPendingTasksDiscussion(conversationHistory)) {
    return "reset";
  }

  if (
    (flowContext?.pendingTaskFlow === "bidApprovalReview" ||
      flowContext?.pendingTaskFlow === "openEnvelopeReview" ||
      flowContext?.pendingTaskFlow === "technicalReviewReview" ||
      flowContext?.pendingTaskFlow === "technicalEvaluationReview" ||
      flowContext?.pendingTaskFlow === "commercialReviewReview" ||
      flowContext?.pendingTaskFlow === "commercialEvaluationReview" ||
      flowContext?.pendingTaskFlow === "awardingReview" ||
      flowContext?.pendingTaskFlow === "bidAwardApprovalReview") &&
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

  if (isPendingSourcingTasksIntent(prompt)) {
    return "categories";
  }

  if (!isSourcingTaskWorkflowContinuation(prompt, conversationHistory)) {
    return null;
  }

  const stageFromPrompt = parseStageSelectionFromPrompt(prompt, response);
  if (stageFromPrompt) {
    return "tasks";
  }

  return null;
}

export function buildNoPendingSourcingTasksMessage(): string {
  return "You're all caught up — there are **no pending tasks from your enabled Activation Signals** right now.";
}
