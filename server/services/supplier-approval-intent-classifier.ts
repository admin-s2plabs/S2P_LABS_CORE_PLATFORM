import {
  SUPPLIER_APPROVAL_INTENTS,
  detectSupplierApprovalIntentFallback,
  isSupplierCatalogListPrompt,
  isSupplierFieldLookupPrompt,
  type SupplierApprovalIntent,
  type SupplierApprovalIntentClassification,
  type SupplierApprovalReviewSpec,
} from "@shared/supplier-activation-signals";
import type { SupplierMention } from "@shared/agent-mention";

import { getAIClient, getAIModelName } from "./ai-client";

const MIN_CLASSIFIER_CONFIDENCE = 0.72;
const MAX_CONTEXT_MESSAGES = 6;

type ClassifierContext = {
  activeSupplierReview?: SupplierApprovalReviewSpec;
  conversationHistory?: Array<{ role?: string; content?: string }>;
  mentions?: SupplierMention[];
};

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function parseClassification(value: unknown): SupplierApprovalIntentClassification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.intent !== "string" ||
    !SUPPLIER_APPROVAL_INTENTS.includes(candidate.intent as SupplierApprovalIntent)
  ) {
    return null;
  }

  const confidence = Number(candidate.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;

  return {
    intent: candidate.intent as SupplierApprovalIntent,
    confidence,
    supplierName: optionalText(candidate.supplierName, 200),
    supplierId: optionalText(candidate.supplierId, 80),
    comments: optionalText(candidate.comments, 2000),
    context: optionalText(candidate.context, 500),
    source: "llm",
  };
}

/**
 * Catalog list/search belongs to the Supplier Agent tools. The activation LLM
 * often reports list_pending_approvals for "give all supplier list".
 */
function applyCatalogListVeto(
  prompt: string,
  classification: SupplierApprovalIntentClassification,
): SupplierApprovalIntentClassification {
  if (classification.intent === "other") return classification;
  if (!isSupplierCatalogListPrompt(prompt)) return classification;
  return {
    intent: "other",
    confidence: classification.confidence,
    source: classification.source,
  };
}

/**
 * Bank/field lookups belong to Supplier Agent tools. The activation LLM
 * often reports ask_about_supplier for "what is the supplier's banking name".
 */
function applyFieldLookupVeto(
  prompt: string,
  classification: SupplierApprovalIntentClassification,
): SupplierApprovalIntentClassification {
  if (classification.intent === "other") return classification;
  if (!isSupplierFieldLookupPrompt(prompt)) return classification;
  return {
    intent: "other",
    confidence: classification.confidence,
    source: classification.source,
  };
}

function applyCapabilityVetoes(
  prompt: string,
  classification: SupplierApprovalIntentClassification,
): SupplierApprovalIntentClassification {
  return applyFieldLookupVeto(prompt, applyCatalogListVeto(prompt, classification));
}

function sanitizeActionComments(
  prompt: string,
  classification: SupplierApprovalIntentClassification,
  deterministic: SupplierApprovalIntentClassification,
): SupplierApprovalIntentClassification {
  if (
    !classification.comments ||
    !["approve", "reject", "more_info"].includes(classification.intent)
  ) {
    return classification;
  }

  // When the deterministic parser recognizes the same action, use its stricter
  // extraction. It deliberately strips action wording, pronouns, and politeness.
  if (deterministic.intent === classification.intent) {
    return { ...classification, comments: deterministic.comments };
  }

  const comment = classification.comments.trim();
  const normalizedComment = comment.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").trim();
  const normalizedPrompt = prompt.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").trim();
  const actionOnlyWords =
    /^(?:(?:please|help|can|could|would|you|me|for|it|this|that|the|supplier|vendor|registration|profile|now|go|ahead|and|to|be|is|approve|approving|approved|approval|reject|rejecting|rejected|deny|decline|request|more|info|information|send|back|greenlight|green|light)\s*)+$/i;

  if (
    !normalizedComment ||
    normalizedComment === normalizedPrompt ||
    actionOnlyWords.test(normalizedComment)
  ) {
    return { ...classification, comments: undefined };
  }
  return classification;
}

export async function classifySupplierApprovalIntent(
  prompt: string,
  context: ClassifierContext = {},
): Promise<SupplierApprovalIntentClassification> {
  const fallback = () =>
    applyCapabilityVetoes(prompt, detectSupplierApprovalIntentFallback(prompt));
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
    const mentions = (context.mentions || []).map((mention) => ({
      supplierId: String(mention.supplierId),
      companyName: mention.companyName,
    }));

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You classify Supplier Agent messages related to supplier registration approvals.

Return exactly one JSON object with:
{
  "intent": "list_pending_approvals|open_supplier_review|approve|reject|more_info|ask_about_supplier|other",
  "confidence": 0.0,
  "supplierName": null,
  "supplierId": null,
  "comments": null,
  "context": null
}

Intent rules:
- list_pending_approvals: ONLY registrations awaiting this user's approval (pending/awaiting approval, approval queue, pending tasks). NEVER a general supplier catalog list.
- open_supplier_review: open or review a particular pending supplier registration.
- approve: user expresses a decision to approve/accept/greenlight a supplier.
- reject: user expresses a decision to reject/deny/decline a supplier.
- more_info: user wants the registration returned for more information or clarification.
- ask_about_supplier: asks what changed on the active/pending registration-approval profile, or to open that approval profile. NOT ordinary field lookups, risk, rank, performance, compliance, or spend questions.
- other: any normal Supplier Agent capability, onboarding request, search, analytics, catalog listing, field lookup, or ambiguity. "give all supplier list", "list all suppliers", "show all suppliers", "supplier list", and questions like "what is the supplier's banking name" / bank details / IFSC / SWIFT / IBAN are other.

Analytics and scoring questions about a supplier are always other, even when the message
names one supplier. Examples that must return other:
- "assess risk score for supplier Acme", "what is the risk score of Acme", "how risky is Acme",
  "run a risk check on Acme", "any red flags for Acme", "which suppliers have the highest risk"
- "what is Acme's AI supplier rank", "show the performance score for Acme", "compare rank of Acme and Globex"
- "is Acme compliant", "which documents are expiring for Acme", "how much did we spend with Acme"
Only route to an approval intent when the message itself refers to the registration approval
queue, an approval decision, or the pending registration profile. Words such as risk, score,
rank, performance, compliance, documents, or spend are never approval intent on their own.

A supplier mention chip in supplierMentions is only how the user names a supplier in this agent.
It is not evidence of approval intent — classify from the message wording alone, and use the
mention only to fill supplierName/supplierId once the wording already implies an approval intent.

Extract comments only when the user supplies rationale or explicit approval comments. Never invent them.
Action wording and politeness are not comments. For example, "approve it for me",
"help me approve it", "reject it", and "request more info" must return comments: null.
Only text such as "because the documents were verified" or "comments: compliance checks passed"
is an approval comment.
Resolve pronouns such as "this supplier" or "it" only when an active review is supplied.
Do not interpret quoted text, hypothetical questions, or questions about how approval works as an action.
This is classification only. You cannot approve, reject, or execute any workflow action.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            message: normalizedPrompt,
            activeSupplierReview: context.activeSupplierReview || null,
            supplierMentions: mentions,
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
    return applyCapabilityVetoes(
      normalizedPrompt,
      sanitizeActionComments(normalizedPrompt, classification, fallback()),
    );
  } catch (error) {
    console.warn(
      "[Supplier Approval Intent] LLM classification failed; using deterministic fallback:",
      error instanceof Error ? error.message : String(error),
    );
    return fallback();
  }
}
