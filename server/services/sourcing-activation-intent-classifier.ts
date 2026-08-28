import {
  SOURCING_ACTIVATION_INTENTS,
  SOURCING_ACTIVATION_STAGES,
  detectSourcingActivationIntentFallback,
  isPendingAwardingListPrompt,
  type SourcingActivationIntent,
  type SourcingActivationIntentClassification,
  type PendingTaskFlowContext,
} from "@shared/sourcing-activation-signals";

import { getAIClient, getAIModelName } from "./ai-client";

const MIN_CLASSIFIER_CONFIDENCE = 0.72;
const MAX_CONTEXT_MESSAGES = 6;

type ClassifierContext = {
  activationContext?: PendingTaskFlowContext | null;
  conversationHistory?: Array<{ role?: string; content?: string }>;
};

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function parseClassification(value: unknown): SourcingActivationIntentClassification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.intent !== "string" ||
    !SOURCING_ACTIVATION_INTENTS.includes(candidate.intent as SourcingActivationIntent)
  ) {
    return null;
  }

  const confidence = Number(candidate.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  return {
    intent: candidate.intent as SourcingActivationIntent,
    confidence,
    stageId:
      typeof candidate.stageId === "string" &&
      SOURCING_ACTIVATION_STAGES.includes(candidate.stageId as any)
        ? (candidate.stageId as SourcingActivationIntentClassification["stageId"])
        : undefined,
    bidNumber: optionalText(candidate.bidNumber, 100),
    bidId: optionalText(candidate.bidId, 80),
    awardId: optionalText(candidate.awardId, 80),
    supplierName: optionalText(candidate.supplierName, 200),
    supplierId: optionalText(candidate.supplierId, 80),
    comments: optionalText(candidate.comments, 2000),
    contextualHints: optionalText(candidate.contextualHints, 500),
    source: "llm",
  };
}

function sanitizeActionComments(
  prompt: string,
  classification: SourcingActivationIntentClassification,
  deterministic: SourcingActivationIntentClassification,
): SourcingActivationIntentClassification {
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
    /^(?:(?:please|help|can|could|would|you|me|for|it|this|that|the|latest|bid|rfq|rfp|tender|award|envelope|technical|commercial|review|evaluation|now|go|ahead|and|to|be|is|approve|approving|approved|approval|reject|rejecting|rejected|deny|decline|request|more|info|information|send|back|greenlight|green|light|score|scoring|evaluate)\s*)+$/i;

  if (
    !normalizedComment ||
    normalizedComment === normalizedPrompt ||
    actionOnlyWords.test(normalizedComment)
  ) {
    return { ...classification, comments: undefined };
  }
  return classification;
}

export async function classifySourcingActivationIntent(
  prompt: string,
  context: ClassifierContext = {},
): Promise<SourcingActivationIntentClassification> {
  const fallback = () => detectSourcingActivationIntentFallback(prompt);
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) return fallback();

  // Deterministic: "bids to be awarded" must open Awarding activation signals,
  // never awarded-but-pending-PO analytics (get_pending_awards).
  if (isPendingAwardingListPrompt(normalizedPrompt)) {
    return {
      ...fallback(),
      intent: "open_awarding",
      stageId: "awarding",
      confidence: 0.95,
      source: "fallback",
    };
  }

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
          content: `You classify Sourcing Agent messages for Activation Signals navigation and review-card orchestration.

Return exactly one JSON object with:
{
  "intent": "list_pending_tasks|open_bid_approval|open_open_envelope|open_technical_review|open_technical_approve|open_commercial_review|open_commercial_approve|open_awarding|open_bid_award_approval|approve|reject|more_info|ask_about_task|other",
  "confidence": 0.0,
  "stageId": "bidApproval|openEnvelope|technicalReview|technicalEvaluation|commercialReview|commercialEvaluation|awarding|bidAwardApproval|null",
  "bidNumber": null,
  "bidId": null,
  "awardId": null,
  "supplierName": null,
  "supplierId": null,
  "comments": null,
  "contextualHints": null
}

Intent rules:
- list_pending_tasks: asks for all pending sourcing tasks, work, queue, actions, or approvals.
- open_bid_approval: show/open/list bid publish or extension approvals.
- open_open_envelope: show/open/list tender envelope opening tasks.
- open_technical_review: open technical review / technical scoring / evaluate / score a bid.
- open_technical_approve: open technical approve / technical evaluation approval.
- open_commercial_review: open commercial review / commercial scoring.
- open_commercial_approve: open commercial approve / commercial evaluation approval.
- open_awarding: open the Awarding activation-signal stage / award a pending bid / select winning supplier for a closed bid awaiting award. Also "show bids which are to be awarded", "bids ready for awarding", "awaiting award", including remaining partial/line-wise awards. Do NOT use for already-awarded bids that still need a PO.
- open_bid_award_approval: open bid award approval / approve an award.
- approve: expresses a decision to approve, accept, sign off, or greenlight a sourcing approval.
- reject: expresses a decision to reject, deny, or decline.
- more_info: workflow action to return a PENDING Activation Signal / approval task for clarification. Use ONLY when the user is acting on an inbox/approval task (often with activeReview). NEVER use for viewing bid or supplier response details.
- ask_about_task: wants to open/review a specific PENDING Activation Signal inbox task, e.g. "Open RFQ260023", "Review RFQ260023" from My Tasks. NOT for reading who responded, supplier response totals/prices/status, or "show me the supplier response".
- other: normal Sourcing Agent capabilities — creating RFQs/RFPs/Tenders, bid search, analytics, listing awarded bids, invite vendors, convert PR, ambiguity, AND read-only bid/response questions such as "which supplier responded", "show me the supplier response", "show vendor responses", prices/totals/status for a bid. Use other for "pending awards requiring PO creation" / awarded-without-PO. Do NOT use open_awarding for historical awarded-bid analytics. Do NOT treat "to be awarded" as other — that is open_awarding.

Entity extraction:
- Extract RFQ/RFP/Tender/Bid numbers exactly as written (e.g. RFQ260023, RFP260023, TND260023, Bid260023).
- Extract numeric bid IDs, award IDs, #NNNN references, supplier names/IDs when present.
- Use contextualHints for selectors such as "latest", "first", "this", "newest".
- Extract comments only when the user supplies rationale or explicit remarks; never invent them.
- Action wording and politeness are not comments.
Set stageId whenever the message identifies the sourcing lifecycle stage.
Resolve "this" only when activeReview is supplied.
Do not interpret quoted text, hypothetical questions, or questions about how sourcing workflows work as an action.
Prefer open_* intents when the user wants to view or start a stage, even if they also say "approve" in a stage name (e.g. "Open Technical Approval" → open_technical_approve).
This is classification and review-card orchestration only. You cannot approve, reject, award, score, open envelopes, or execute any workflow action.`,
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
    return sanitizeActionComments(normalizedPrompt, classification, fallback());
  } catch (error) {
    console.warn(
      "[Sourcing Activation Intent] LLM classification failed; using deterministic fallback:",
      error instanceof Error ? error.message : String(error),
    );
    return fallback();
  }
}
