import {
  PAYABLES_ACTIVATION_INTENTS,
  PAYABLES_ACTIVATION_STAGES,
  buildNoPendingInvoiceApprovalsMessage,
  detectPayablesActivationIntentFallback,
  isPayablesInvoiceRecordQueryPrompt,
  isPayablesSubmissionPrompt,
  type PayablesActivationIntent,
  type PayablesActivationIntentClassification,
  type PayablesPendingInvoiceFlowContext,
} from "@shared/payables-activation-signals";

import { getAIClient, getAIModelName } from "./ai-client";

const MIN_CLASSIFIER_CONFIDENCE = 0.72;
const MAX_CONTEXT_MESSAGES = 6;

type ClassifierContext = {
  activationContext?: PayablesPendingInvoiceFlowContext | null;
  conversationHistory?: Array<{ role?: string; content?: string }>;
};

/**
 * Record mentions arrive as their raw trigger text ("$INV-2026-001"). The
 * trigger is composer syntax and only distracts the classifier. Money keeps its
 * "$" because the trigger is always followed by a letter.
 */
function stripMentionTriggers(text: string): string {
  return text.replace(/(^|[\s([{])[$%&^](?=[A-Za-z])/g, "$1");
}

/** Canned Activation Signals replies, which must not steer the next turn. */
const ACTIVATION_BOILERPLATE = new Set([
  buildNoPendingInvoiceApprovalsMessage(),
  "That capability is currently disabled in Activation Signals.",
]);

/**
 * A misrouted turn leaves "no pending invoice approvals" in the transcript,
 * which pulls the following turns back into the approval lane. Drop those
 * replies so one miss does not compound.
 */
function isActivationBoilerplate(message: { role?: string; content?: string }): boolean {
  if (message.role !== "assistant") return false;
  return ACTIVATION_BOILERPLATE.has(String(message.content || "").trim());
}

/**
 * Submitting or paying an invoice, and asking what is on one, are the agent's
 * own capabilities. The classifier reads the word "approval" in them and
 * reports an approval intent, which would answer from the approval queue
 * instead of the invoice.
 */
function applyNonApprovalVeto(
  prompt: string,
  classification: PayablesActivationIntentClassification,
): PayablesActivationIntentClassification {
  if (classification.intent === "general") return classification;
  if (!isPayablesSubmissionPrompt(prompt) && !isPayablesInvoiceRecordQueryPrompt(prompt)) {
    return classification;
  }
  return {
    intent: "general",
    confidence: classification.confidence,
    source: classification.source,
  };
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function parseClassification(value: unknown): PayablesActivationIntentClassification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.intent !== "string" ||
    !PAYABLES_ACTIVATION_INTENTS.includes(candidate.intent as PayablesActivationIntent)
  ) {
    return null;
  }

  const confidence = Number(candidate.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  return {
    intent: candidate.intent as PayablesActivationIntent,
    confidence,
    stageId:
      typeof candidate.stageId === "string" &&
      PAYABLES_ACTIVATION_STAGES.includes(candidate.stageId as any)
        ? (candidate.stageId as PayablesActivationIntentClassification["stageId"])
        : undefined,
    invoiceId: optionalText(candidate.invoiceId, 100),
    invoiceNumber: optionalText(candidate.invoiceNumber, 100),
    taskId: optionalText(candidate.taskId, 100),
    comments: optionalText(candidate.comments, 2000),
    delegateTo: optionalText(candidate.delegateTo, 200),
    contextualHints: optionalText(candidate.contextualHints, 500),
    source: "llm",
  };
}

function sanitizeActionComments(
  prompt: string,
  classification: PayablesActivationIntentClassification,
  deterministic: PayablesActivationIntentClassification,
): PayablesActivationIntentClassification {
  let next = classification;

  if (
    next.comments &&
    ["approve", "reject", "more_info", "delegate"].includes(next.intent)
  ) {
    if (deterministic.intent === next.intent && deterministic.comments) {
      next = { ...next, comments: deterministic.comments };
    } else {
      const normalizedComment = next.comments
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, " ")
        .trim();
      const normalizedPrompt = prompt.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").trim();
      const actionOnlyWords =
        /^(?:(?:please|help|can|could|would|you|me|for|it|this|that|the|latest|invoice|inv|approval|now|go|ahead|and|to|be|is|approve|approving|approved|reject|rejecting|rejected|deny|decline|request|more|info|information|send|back|delegate|delegating|reassign|greenlight|green|light)\s*)+$/i;

      if (
        !normalizedComment ||
        normalizedComment === normalizedPrompt ||
        actionOnlyWords.test(normalizedComment)
      ) {
        next = { ...next, comments: undefined };
      }
    }
  }

  if (next.intent === "delegate") {
    if (deterministic.intent === "delegate" && deterministic.delegateTo) {
      next = { ...next, delegateTo: deterministic.delegateTo };
    } else if (next.delegateTo) {
      const normalizedDelegate = next.delegateTo
        .toLowerCase()
        .replace(/[^a-z0-9@._+\-\s]/gi, " ")
        .trim();
      const actionOnlyDelegate =
        /^(?:(?:please|help|can|could|would|you|me|for|it|this|that|the|invoice|approval|now|delegate|delegating|reassign|to|user|approver)\s*)+$/i;
      if (!normalizedDelegate || actionOnlyDelegate.test(normalizedDelegate)) {
        next = { ...next, delegateTo: undefined };
      }
    }
  }

  return next;
}

export async function classifyPayablesActivationIntent(
  prompt: string,
  context: ClassifierContext = {},
): Promise<PayablesActivationIntentClassification> {
  const classification = await runClassification(prompt, context);
  console.log(
    `[Payables Activation Intent] intent=${classification.intent} confidence=${classification.confidence.toFixed(2)} source=${classification.source}`,
  );
  return classification;
}

async function runClassification(
  prompt: string,
  context: ClassifierContext,
): Promise<PayablesActivationIntentClassification> {
  const normalizedPrompt = stripMentionTriggers(String(prompt || "").trim());
  const fallback = () => detectPayablesActivationIntentFallback(normalizedPrompt);
  if (!normalizedPrompt) return fallback();

  try {
    const openai = await getAIClient();
    const model = await getAIModelName();
    const recentHistory = (context.conversationHistory || [])
      .filter((message) => !isActivationBoilerplate(message))
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
          content: `You classify Payables Agent messages for Invoice Approval Request activation signals and review-card orchestration.

Return exactly one JSON object with:
{
  "intent": "list_pending_invoice_approvals|open_invoice_approval|approve|reject|more_info|delegate|general",
  "confidence": 0.0,
  "stageId": "invoiceApprovalRequest|null",
  "invoiceId": null,
  "invoiceNumber": null,
  "taskId": null,
  "comments": null,
  "delegateTo": null,
  "contextualHints": null
}

Intent rules:
- list_pending_invoice_approvals: asks for all pending invoice approvals, outstanding invoice approval tasks, or invoices awaiting approval.
- open_invoice_approval: show/open/list/review a specific invoice approval or the invoice approval queue.
- approve: expresses a decision to approve, accept, sign off, or greenlight an invoice.
- reject: expresses a decision to reject, deny, decline, or send back as rejected.
- more_info: wants an invoice approval returned for more information, clarification, or additional details.
- delegate: wants to delegate / reassign / hand off the invoice approval to another user.
- general: normal Payables Agent capabilities such as creating invoices, adding lines, submit/pay, search, match, fraud analysis, stats, or ambiguity.

IMPORTANT: Sending an invoice INTO the approval workflow, or paying one, is the user's own action on
their own invoice, not an approver's decision, so it is ALWAYS "general" — never approve,
open_invoice_approval, or more_info. This covers asking whether an invoice is ready or complete
enough to submit. Examples:
- "Submit invoice INV-2026-001 for approval"
- "Send INV-2026-001 for approval"
- "Is INV-2026-001 ready to submit?"
- "What is missing on INV-2026-001 before I can submit it?"
- "Pay invoice INV-2026-001"
The word "approval" in these messages names where the invoice is going; it is not a decision the user
is making on someone else's request.
IMPORTANT: Asking what is on an invoice, or what state it is in, is ALWAYS "general" — even when an
invoice number is named, because the invoice is the subject of the question, not a task awaiting the
user's decision. Examples:
- "What are the line items on invoice INV-2026-001?"
- "What is the total amount of INV-2026-001?"
- "Show me the details of invoice INV-2026-001"
- "Which supplier issued INV-2026-001?"
- "Match INV-2026-001 to its PO"
Only classify an approval intent when the user asks about invoices awaiting their decision, or states
a decision on one.

Extract identifiers exactly as written. invoiceId and invoiceNumber must be strings when present.
Use contextualHints for selectors such as "latest", "first", "this", or other useful disambiguation.
Extract comments only when the user supplies rationale or explicit remarks; never invent them.
For delegate, put the target username/email/display name in delegateTo when stated; never invent a person.
Action wording and politeness are not comments.
Set stageId to "invoiceApprovalRequest" whenever the message is about invoice approval workflow.
Resolve "this" / "it" only when activeReview is supplied. Do not interpret quoted text, hypothetical
questions, or questions about how approvals work as an action.
This is classification and review-card orchestration only. You cannot approve, reject, delegate,
execute, or bypass any workflow action.`,
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
    return applyNonApprovalVeto(
      normalizedPrompt,
      sanitizeActionComments(normalizedPrompt, classification, fallback()),
    );
  } catch (error) {
    console.warn(
      "[Payables Activation Intent] LLM classification failed; using deterministic fallback:",
      error instanceof Error ? error.message : String(error),
    );
    return fallback();
  }
}
