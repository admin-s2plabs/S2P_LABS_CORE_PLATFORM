import {
  ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS,
  PROCUREMENT_ACTIVATION_INTENTS,
  PROCUREMENT_ACTIVATION_STAGES,
  detectProcurementActivationIntentFallback,
  type ProcurementActivationIntent,
  type ProcurementActivationIntentClassification,
  type ProcurementPendingTaskFlowContext,
} from "@shared/procurement-activation-signals";

import { getAIClient, getAIModelName } from "./ai-client";

const MIN_CLASSIFIER_CONFIDENCE = 0.72;
const MAX_CONTEXT_MESSAGES = 6;

type ClassifierContext = {
  activationContext?: ProcurementPendingTaskFlowContext | null;
  conversationHistory?: Array<{ role?: string; content?: string }>;
};

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function parseClassification(value: unknown): ProcurementActivationIntentClassification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.intent !== "string" ||
    !PROCUREMENT_ACTIVATION_INTENTS.includes(candidate.intent as ProcurementActivationIntent)
  ) {
    return null;
  }

  const confidence = Number(candidate.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  return {
    intent: candidate.intent as ProcurementActivationIntent,
    confidence,
    stageId:
      typeof candidate.stageId === "string" &&
      PROCUREMENT_ACTIVATION_STAGES.includes(candidate.stageId as any)
        ? (candidate.stageId as ProcurementActivationIntentClassification["stageId"])
        : undefined,
    prNumber: optionalText(candidate.prNumber, 100),
    poNumber: optionalText(candidate.poNumber, 100),
    budgetNumber: optionalText(candidate.budgetNumber, 100),
    requestId: optionalText(candidate.requestId, 100),
    comments: optionalText(candidate.comments, 2000),
    contextualHints: optionalText(candidate.contextualHints, 500),
    source: "llm",
  };
}

function sanitizeActionComments(
  prompt: string,
  classification: ProcurementActivationIntentClassification,
  deterministic: ProcurementActivationIntentClassification,
): ProcurementActivationIntentClassification {
  if (
    !classification.comments ||
    !["approve", "reject", "more_info"].includes(classification.intent)
  ) {
    return classification;
  }

  if (deterministic.intent === classification.intent) {
    return { ...classification, comments: deterministic.comments };
  }

  const normalizedComment = classification.comments
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim();
  const normalizedPrompt = prompt.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").trim();
  const actionOnlyWords =
    /^(?:(?:please|help|can|could|would|you|me|for|it|this|that|the|latest|budget|pr|po|purchase|request|order|requisition|now|go|ahead|and|to|be|is|approve|approving|approved|approval|reject|rejecting|rejected|deny|decline|request|more|info|information|send|back|greenlight|green|light)\s*)+$/i;

  if (
    !normalizedComment ||
    normalizedComment === normalizedPrompt ||
    actionOnlyWords.test(normalizedComment)
  ) {
    return { ...classification, comments: undefined };
  }
  return classification;
}

function remapDisabledPhase2Classification(
  classification: ProcurementActivationIntentClassification,
): ProcurementActivationIntentClassification {
  if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS) return classification;
  if (
    classification.intent === "open_alerts" ||
    classification.intent === "open_requested" ||
    classification.stageId === "alerts" ||
    classification.stageId === "requested"
  ) {
    return { intent: "other", confidence: 1, source: classification.source };
  }
  return classification;
}

export async function classifyProcurementActivationIntent(
  prompt: string,
  context: ClassifierContext = {},
): Promise<ProcurementActivationIntentClassification> {
  const fallback = () => remapDisabledPhase2Classification(detectProcurementActivationIntentFallback(prompt));
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) return fallback();

  try {
    const openai = await getAIClient();
    const model = await getAIModelName();
    const recentHistory = (context.conversationHistory || [])
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: String(message.content || "").slice(0, 1000),
      }));

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You classify Procurement Ops Agent messages for Activation Signals navigation and approval review.

Return exactly one JSON object with:
{
  "intent": <one of: list_pending_tasks, open_budget_approval, open_pr_approval, open_po_approval, approve, reject, more_info, other>,
  "confidence": <number between 0 and 1 — your own certainty in this classification>,
  "stageId": <one of: budgetApproval, prApproval, poApproval — or JSON null>,
  "prNumber": <string or JSON null>,
  "poNumber": <string or JSON null>,
  "budgetNumber": <string or JSON null>,
  "requestId": <string or JSON null>,
  "comments": <string or JSON null>,
  "contextualHints": <string or JSON null>
}

The angle-bracket text above describes each field; never copy it literally. "confidence" must be a
number you actually compute — a clear-cut classification should score well above 0.9. Empty fields
must be JSON null, not the string "null".

Intent rules:
- list_pending_tasks: asks for all pending procurement tasks, work, actions, or approvals.
- open_budget_approval: show/open/list budget approvals or a specific budget approval.
- open_pr_approval: show/open/list purchase requisition or PR approvals.
- open_po_approval: show/open/list purchase order or PO approvals.
- approve: expresses a decision to approve, accept, sign off, or greenlight a PR, PO, budget, or requisition.
- reject: expresses a decision to reject, deny, decline, or send back as rejected.
- more_info: wants an approval returned for more information, clarification, or additional details.
- other: normal Procurement Agent capabilities such as creating/updating PRs or POs, tracking, dashboards, catalog search, analytics, or ambiguity.
IMPORTANT: Counting, statistics, and reporting questions about PR/PO records are ALWAYS "other", never list_pending_tasks. "Active", "open", or "in progress" used to describe records is a status filter, not pending work. Examples:
- "How many PRs are currently active?"
- "How many POs are currently active?"
- "Count PRs with status Approved"
- "Show PR activity by department"
Only classify list_pending_tasks when the user asks about work assigned to them — pending tasks, actions, or approvals awaiting their decision.
IMPORTANT: Sending a record INTO the approval workflow is the requester's own action, not an approver's decision, so it is ALWAYS "other" — never approve, open_pr_approval, open_po_approval, or more_info. This covers asking whether a record is ready, complete, or valid enough to submit. Examples:
- "Submit PR_00069 for approval"
- "Check if PR_00069 is ready for submission"
- "Is PO_00012 ready to submit?"
- "Send PR_00069 into the approval workflow"
- "What is missing on PR_00069 before I can submit it?"
The word "approval" in these messages names where the record is going; it is not a decision the user is making on someone else's request.
IMPORTANT: Asking what to buy, or how much of it, is ALWAYS "other" — even when a PR number is named, because the PR is the context for the suggestion, not a task awaiting the user's decision. Examples:
- "Recommend items for apple laptops"
- "Suggest the most appropriate items for PR_00072"
- "Recommend the quantity for laptops"
IMPORTANT: Messages that select a Direct PO field by canonical id/name are ALWAYS "other", never open_budget_approval / open_po_approval / list_pending_tasks. Examples:
- "Use budgetId 98"
- "Use supplierId 37 (CR IT)"
- "Use department IT"
- "Use delivery location Mumbai"
- "Use business entity ProductionQA"
- "Use payment terms Net 30"
These continue an in-progress Direct PO create flow; they are not Activation Signals approval navigation.
${
  ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS
    ? `
Also available (Phase 2 enabled):
- open_requested: show requests raised or tracked under Requested.
- open_alerts: show procurement alerts.
stageId may also be "requested" or "alerts".
`
    : `
Do NOT classify as open_requested or open_alerts — Alerts and Requested are disabled.
If the user asks about alerts or creation requests, use intent "other".
`
}

Extract identifiers exactly as written. Use contextualHints for selectors such as "latest", "first",
"this", or other useful disambiguation. Extract comments only when the user supplies rationale or
explicit remarks; never invent them. Action wording and politeness are not comments.
Set stageId whenever the message identifies the type of procurement item.
Resolve "this" only when activeReview is supplied. Do not interpret quoted text, hypothetical
questions, or questions about how approvals work as an action.
This is classification and review-card orchestration only. You cannot approve, reject, execute,
or bypass any workflow action.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            message: normalizedPrompt,
            activeReview: context.activationContext?.activeReview || null,
            pendingTaskFlow: context.activationContext?.pendingTaskFlow || null,
            currentStage: context.activationContext?.stageId || null,
            recentConversation: recentHistory,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return fallback();
    const classification = parseClassification(JSON.parse(content));
    if (!classification || classification.confidence < MIN_CLASSIFIER_CONFIDENCE) {
      return fallback();
    }
    const sanitized = remapDisabledPhase2Classification(
      sanitizeActionComments(normalizedPrompt, classification, fallback()),
    );
    return sanitized;
  } catch (error) {
    console.warn(
      "[Procurement Activation Intent] LLM classification failed; using deterministic fallback:",
      error instanceof Error ? error.message : String(error),
    );
    return fallback();
  }
}
