import type { BidMention, BusinessUserMention, InvoiceMention, ItemMention, PoMention, PrMention, SupplierMention } from "@shared/agent-mention";
import type { AgentCompareBidsSpec } from "@shared/agent-compare-bids";
import type { BidApprovalReviewSpec } from "@shared/sourcing-bid-approval-review";
import type { OpenEnvelopeReviewSpec } from "@shared/sourcing-open-envelope-review";
import type { TechnicalReviewSpec } from "@shared/sourcing-technical-review";
import type { TechnicalEvaluationSpec } from "@shared/sourcing-technical-evaluation";
import type { CommercialReviewSpec } from "@shared/sourcing-commercial-review";
import type { CommercialEvaluationSpec } from "@shared/sourcing-commercial-evaluation";
import type { AwardingReviewSpec } from "@shared/sourcing-awarding-review";
import type { BidAwardApprovalReviewSpec } from "@shared/sourcing-bid-award-approval-review";
import type { BidAwardSubmitReviewSpec } from "@shared/sourcing-bid-award-submit-review";
import type { SourcingActivationPreferences, SourcingTaskFlowSpec } from "@shared/sourcing-activation-signals";
import type {
  SupplierActivationPreferences,
  SupplierApprovalCommand,
  SupplierApprovalReviewSpec,
  SupplierTaskFlowSpec,
} from "@shared/supplier-activation-signals";
import type {
  BudgetApprovalReviewSpec,
  PoApprovalReviewSpec,
  PrApprovalReviewSpec,
  ProcurementActivationPreferences,
  ProcurementApprovalCommand,
  ProcurementAlertReviewSpec,
  ProcurementTaskFlowSpec,
} from "@shared/procurement-activation-signals";
import type {
  PayablesActivationPreferences,
  PayablesApprovalCommand,
  PayablesInvoiceApprovalReviewSpec,
  PayablesTaskFlowSpec,
} from "@shared/payables-activation-signals";
import type { AgentSourcingPreviewSpec, AgentSourcingResultSpec, ActiveCreatedBidContext, CreateBidPreviewSpec, CreateBidFlowChoiceSpec } from "@shared/agent-sourcing-preview";
import type { PrRecommendationSpec } from "@shared/agent-pr-recommendation";
import type { PoRecommendationSpec } from "@shared/agent-po-recommendation";
import { buildPendingActionsFromCreateBidPreview, sanitizeBundleForActiveCreatedBid } from "@shared/create-bid-staged-actions";

export async function streamAgentQuery(options: {
  endpoint: string;
  prompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  confirmAction?: { type: string; data: any };
  mentions?: SupplierMention[];
  businessUserMentions?: BusinessUserMention[];
  itemMentions?: ItemMention[];
  bidMentions?: BidMention[];
  activationContext?: string;
  activationPreferences?:
    | SourcingActivationPreferences
    | SupplierActivationPreferences
    | ProcurementActivationPreferences
    | PayablesActivationPreferences;
  prMentions?: PrMention[];
  poMentions?: PoMention[];
  invoiceMentions?: InvoiceMention[];
  stagedPendingActions?: { type: string; data: any; summary: string }[];
  stagedActionPreview?: CreateBidPreviewSpec;
  activeCreatedBid?: ActiveCreatedBidContext;
  /** Currency already established earlier in this conversation (e.g. Netra's negotiation currency) that later turns should stay consistent with. */
  preferredCurrency?: string;
  /**
   * When false, the agent answers from its baseline prompt and ignores this user's stored
   * feedback. Capture is unaffected — thumbs and comments are still recorded either way.
   * Omit to keep the default (feedback applied).
   */
  applyFeedback?: boolean;
  /**
   * Set on the first turn after the user resets their feedback, so the reply also drops the
   * personalised style demonstrated by earlier turns still present in conversationHistory.
   */
  feedbackJustReset?: boolean;
  /** Abort the request mid-flight (e.g. user pressed Stop). When aborted, `onAbort` fires instead of `onError`. */
  signal?: AbortSignal;
  onToken: (token: string) => void;
  onDone: (
    pendingAction?: any,
    chart?: any,
    charts?: any,
    pendingActions?: any[],
    compareBids?: AgentCompareBidsSpec,
    sourcingTaskFlow?: SourcingTaskFlowSpec,
    bidApprovalReview?: BidApprovalReviewSpec,
    openEnvelopeReview?: OpenEnvelopeReviewSpec,
    technicalReview?: TechnicalReviewSpec,
    commercialReview?: CommercialReviewSpec,
    technicalEvaluation?: TechnicalEvaluationSpec,
    commercialEvaluation?: CommercialEvaluationSpec,
    awardingReview?: AwardingReviewSpec,
    bidAwardApprovalReview?: BidAwardApprovalReviewSpec,
    bidAwardSubmitReview?: BidAwardSubmitReviewSpec,
     
    actionPreview?: AgentSourcingPreviewSpec | PrRecommendationSpec | PoRecommendationSpec, 
    
    actionResult?: AgentSourcingResultSpec,
    supplierTaskFlow?: SupplierTaskFlowSpec,
    supplierApprovalReview?: SupplierApprovalReviewSpec,
    createBidSourceChoice?: CreateBidFlowChoiceSpec,
    procurementTaskFlow?: ProcurementTaskFlowSpec,
    budgetApprovalReview?: BudgetApprovalReviewSpec,
    prApprovalReview?: PrApprovalReviewSpec,
    poApprovalReview?: PoApprovalReviewSpec,
    procurementAlertReview?: ProcurementAlertReviewSpec,
    supplierApprovalCommand?: SupplierApprovalCommand,
    procurementApprovalCommand?: ProcurementApprovalCommand,
    payablesTaskFlow?: PayablesTaskFlowSpec,
    payablesInvoiceApprovalReview?: PayablesInvoiceApprovalReviewSpec,
    payablesApprovalCommand?: PayablesApprovalCommand,
  ) => void;
  onError: (message: string) => void;
  /** Called when the request is cancelled via `signal`. Use to finalize UI without showing an error. */
  onAbort?: () => void;
}): Promise<void> {
  const {
    endpoint,
    prompt,
    conversationHistory,
    confirmAction,
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    activationContext,
    activationPreferences,
    prMentions,
    poMentions,
    invoiceMentions,
    stagedPendingActions,
    stagedActionPreview,
    activeCreatedBid,
    preferredCurrency,
    applyFeedback,
    feedbackJustReset,
    signal,
    onToken,
    onDone,
    onError,
    onAbort,
  } = options;

  // The user may abort before the request is even issued.
  if (signal?.aborted) {
    onAbort?.();
    return;
  }

  const authData = localStorage.getItem("prokraya-auth");
  const extraHeaders: Record<string, string> = {};
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      extraHeaders["x-user-email"] = parsed.userId || "";
      extraHeaders["x-user-name"] = parsed.userName || "";
    } catch {}
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      credentials: "include",
      signal,
      body: JSON.stringify({
        prompt,
        conversationHistory,
        confirmAction,
        mentions,
        businessUserMentions,
        itemMentions,
        bidMentions,
        activationContext,
        activationPreferences,
        prMentions,
        poMentions,
        invoiceMentions,
        stagedPendingActions,
        stagedActionPreview,
        activeCreatedBid,
        preferredCurrency,
        applyFeedback,
        feedbackJustReset,
      }),
    });
  } catch {
    if (signal?.aborted) {
      onAbort?.();
      return;
    }
    onError("Network error. Please check your connection and try again.");
    return;
  }

  if (!response.ok) {
    let msg = `Request failed (${response.status})`;
    try {
      const text = await response.text();
      const parsed = JSON.parse(text);
      msg = parsed.error || msg;
    } catch {}
    onError(msg);
    return;
  }

  if (!response.body) {
    onError("Streaming not supported in this environment.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr);
          if (data.type === "token") {
            onToken(data.content);
          } else if (data.type === "done") {
            onDone(
              data.pendingAction ?? undefined,
              data.chart ?? undefined,
              Array.isArray(data.charts) && data.charts.length > 0 ? data.charts : undefined,
              Array.isArray(data.pendingActions) && data.pendingActions.length > 0
                ? data.pendingActions
                : undefined,
              data.compareBids ?? undefined,
              data.sourcingTaskFlow ?? undefined,
              data.bidApprovalReview ?? undefined,
              data.openEnvelopeReview ?? undefined,
              data.technicalReview ?? undefined,
              data.commercialReview ?? undefined,
              data.technicalEvaluation ?? undefined,
              data.commercialEvaluation ?? undefined,
              data.awardingReview ?? undefined,
              data.bidAwardApprovalReview ?? undefined,
              data.bidAwardSubmitReview ?? undefined,
              data.actionPreview ?? undefined,
              data.actionResult ?? undefined,
              data.supplierTaskFlow ?? undefined,
              data.supplierApprovalReview ?? undefined,
              data.createBidSourceChoice ?? undefined,
              data.procurementTaskFlow ?? undefined,
              data.budgetApprovalReview ?? undefined,
              data.prApprovalReview ?? undefined,
              data.poApprovalReview ?? undefined,
              data.procurementAlertReview ?? undefined,
              data.supplierApprovalCommand ?? undefined,
              data.procurementApprovalCommand ?? undefined,
              data.payablesTaskFlow ?? undefined,
              data.payablesInvoiceApprovalReview ?? undefined,
              data.payablesApprovalCommand ?? undefined,
            );
          } else if (data.type === "error") {
            onError(data.message || "An error occurred.");
          }
        } catch {}
      }
    }
  } catch {
    if (signal?.aborted) {
      onAbort?.();
      return;
    }
    onError("Connection interrupted. Please try again.");
  }
}
