import { apiRequest } from "@/lib/queryClient";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentChartSpec } from "@shared/agent-chart";
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
import type { AgentSourcingPreviewSpec, AgentSourcingResultSpec, CreateBidFlowChoiceSpec } from "@shared/agent-sourcing-preview";
import type { PrRecommendationSpec } from "@shared/agent-pr-recommendation";
import type { PoRecommendationSpec } from "@shared/agent-po-recommendation";
import type { ContractToolResult } from "@shared/agent-contract-tools";
import type { BidMention, BusinessUserMention, InvoiceMention, ItemMention, PoMention, PrMention, SupplierMention } from "@shared/agent-mention";
import type { SourcingTaskFlowSpec } from "@shared/sourcing-activation-signals";
import type {
  SupplierApprovalReviewSpec,
  SupplierTaskFlowSpec,
} from "@shared/supplier-activation-signals";
import type {
  BudgetApprovalReviewSpec,
  PoApprovalReviewSpec,
  PrApprovalReviewSpec,
  ProcurementAlertReviewSpec,
  ProcurementTaskFlowSpec,
} from "@shared/procurement-activation-signals";
import type {
  PayablesInvoiceApprovalReviewSpec,
  PayablesTaskFlowSpec,
} from "@shared/payables-activation-signals";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mentions?: SupplierMention[];
  businessUserMentions?: BusinessUserMention[];
  itemMentions?: ItemMention[];
  bidMentions?: BidMention[];
  prMentions?: PrMention[];
  poMentions?: PoMention[];
  invoiceMentions?: InvoiceMention[];
  pendingAction?: { type: string; data: any; summary: string };
  pendingActions?: { type: string; data: any; summary: string }[];
  actionStatus?: "pending" | "confirmed" | "cancelled";
  confirmedActionIndex?: number;
  isStreaming?: boolean;
  chart?: AgentChartSpec;
  charts?: AgentChartSpec[];
  compareBids?: AgentCompareBidsSpec;
  sourcingTaskFlow?: SourcingTaskFlowSpec;
  createBidSourceChoice?: CreateBidFlowChoiceSpec;
  supplierTaskFlow?: SupplierTaskFlowSpec;
  supplierApprovalReview?: SupplierApprovalReviewSpec;
  supplierApprovalStatus?: "pending" | "approved" | "rejected" | "more_info";
  procurementTaskFlow?: ProcurementTaskFlowSpec;
  budgetApprovalReview?: BudgetApprovalReviewSpec;
  budgetApprovalStatus?: "pending" | "approved" | "rejected" | "more_info" | "resubmitted";
  prApprovalReview?: PrApprovalReviewSpec;
  prApprovalStatus?: "pending" | "approved" | "rejected" | "more_info" | "resubmitted";
  poApprovalReview?: PoApprovalReviewSpec;
  poApprovalStatus?: "pending" | "approved" | "rejected" | "more_info" | "resubmitted";
  procurementAlertReview?: ProcurementAlertReviewSpec;
  procurementAlertStatus?: "pending" | "acknowledged" | "resolved";
  payablesTaskFlow?: PayablesTaskFlowSpec;
  payablesInvoiceApprovalReview?: PayablesInvoiceApprovalReviewSpec;
  payablesInvoiceApprovalStatus?: "pending" | "approved" | "rejected" | "more_info" | "delegated";
  prRecommendation?: PrRecommendationSpec;
  prRecommendationStatus?: "pending" | "created" | "cancelled";
  poRecommendation?: PoRecommendationSpec;
  poRecommendationStatus?: "pending" | "created" | "cancelled";
  bidApprovalReview?: BidApprovalReviewSpec;
  bidApprovalStatus?: "pending" | "approved" | "rejected";
  openEnvelopeReview?: OpenEnvelopeReviewSpec;
  openEnvelopeStatus?: "pending" | "opened";
  technicalReview?: TechnicalReviewSpec;
  technicalReviewStatus?: "pending" | "submitted";
  technicalEvaluation?: TechnicalEvaluationSpec;
  technicalEvaluationStatus?: "pending" | "approved";
  commercialReview?: CommercialReviewSpec;
  commercialReviewStatus?: "pending" | "submitted";
  commercialEvaluation?: CommercialEvaluationSpec;
  commercialEvaluationStatus?: "pending" | "approved";
  awardingReview?: AwardingReviewSpec;
  awardingReviewStatus?: "pending" | "awarded";
  awardingSubmitStatus?: "pending" | "submitted";
  bidAwardApprovalReview?: BidAwardApprovalReviewSpec;
  bidAwardApprovalStatus?: "pending" | "approved" | "rejected";
  bidAwardSubmitReview?: BidAwardSubmitReviewSpec;
  bidAwardSubmitReviewStatus?: "pending" | "submitted";
  actionPreview?: AgentSourcingPreviewSpec;
  actionResult?: AgentSourcingResultSpec;
  contractToolResult?: ContractToolResult;
  // Contract Co-Pilot WYSIWYG: this user message targeted one selected part of the
  // live preview rather than the whole builder conversation.
  scopedEdit?: { sectionKey: string; label: string; selectedText?: string };
}

export interface ConversationSummary {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
}

type SetConversationArg =
  | ConversationMessage[]
  | ((prev: ConversationMessage[]) => ConversationMessage[]);

function groupConversationsByDate(conversations: ConversationSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  const month = new Date(today);
  month.setDate(month.getDate() - 30);

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Previous 30 Days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const c of conversations) {
    const d = new Date(c.updated_at);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today) groups[0].items.push(c);
    else if (day >= yesterday) groups[1].items.push(c);
    else if (d >= week) groups[2].items.push(c);
    else if (d >= month) groups[3].items.push(c);
    else groups[4].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

export { groupConversationsByDate };

// Marks, per agent type, that this login session already started on a fresh chat.
// Nested inside "prokraya-auth" so logout (full clear or the 401 auto-logout, which
// only removes that key) always wipes it, forcing a new chat on the next login.
function isAgentFreshened(agentType: string): boolean {
  try {
    const auth = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
    return !!auth.chatFreshened?.[agentType];
  } catch {
    return false;
  }
}

function markAgentFreshened(agentType: string) {
  try {
    const auth = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
    auth.chatFreshened = { ...auth.chatFreshened, [agentType]: true };
    localStorage.setItem("prokraya-auth", JSON.stringify(auth));
  } catch {
    // silent
  }
}

export function useAgentConversation(agentType: string) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [conversation, setConversationState] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentIdRef = useRef<number | null>(null);
  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  const fetchList = useCallback(async (): Promise<ConversationSummary[]> => {
    const res = await apiRequest("GET", `/api/agent-conversations/${agentType}`);
    const data = await res.json();
    const list: ConversationSummary[] = data.conversations || [];
    setConversations(list);
    return list;
  }, [agentType]);

  const loadMessages = useCallback(
    async (id: number): Promise<ConversationMessage[]> => {
      const res = await apiRequest("GET", `/api/agent-conversations/${agentType}/${id}`);
      const data = await res.json();
      return (data.messages || []).map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    },
    [agentType]
  );

  // On mount: load list, then load most recent (or create a fresh one)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        let list = await fetchList();

        if (cancelled) return;

        if (list.length === 0 || !isAgentFreshened(agentType)) {
          // First conversation ever, or first visit to this agent since the last login: start fresh.
          markAgentFreshened(agentType);
          const res = await apiRequest("POST", `/api/agent-conversations/${agentType}`, {});
          const data = await res.json();
          if (!cancelled) {
            const newId = data.id;
            setCurrentId(newId);
            setConversationState([]);
            list = await fetchList();
          }
        } else {
          const msgs = await loadMessages(list[0].id);
          if (!cancelled) {
            setCurrentId(list[0].id);
            setConversationState(msgs);
          }
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentType]);

  const saveToServer = useCallback(
    (msgs: ConversationMessage[], id: number) => {
      const firstUser = msgs.find((m) => m.role === "user");
      const title = firstUser ? firstUser.content.slice(0, 60) : undefined;
      return apiRequest("PUT", `/api/agent-conversations/${agentType}/${id}`, {
        messages: msgs,
        title,
      }).then(() => fetchList());
    },
    [agentType, fetchList]
  );

  const setConversation = useCallback(
    (arg: SetConversationArg) => {
      const id = currentIdRef.current;
      if (typeof arg === "function") {
        setConversationState((prev) => {
          const next = (arg as (p: ConversationMessage[]) => ConversationMessage[])(prev);
          if (id !== null) saveToServer(next, id).catch(() => {});
          return next;
        });
      } else {
        setConversationState(arg);
        if (id !== null) saveToServer(arg, id).catch(() => {});
      }
    },
    [saveToServer]
  );

  // Awaitable variant: updates local state and resolves only once the server
  // write succeeds (throws on failure). Callers that must gate UI on a
  // successful save (e.g. exiting an edit mode) should use this.
  const persistConversation = useCallback(
    async (next: ConversationMessage[]) => {
      const id = currentIdRef.current;
      setConversationState(next);
      if (id !== null) await saveToServer(next, id);
    },
    [saveToServer]
  );

  // Start a new chat (create a new conversation in DB)
  const newConversation = useCallback(async () => {
    // If current conversation is already empty, just stay on it
    if (conversation.length === 0) return;
    try {
      const res = await apiRequest("POST", `/api/agent-conversations/${agentType}`, {});
      const data = await res.json();
      setCurrentId(data.id);
      setConversationState([]);
      await fetchList();
    } catch {
      // silent
    }
  }, [agentType, conversation.length, fetchList]);

  // Switch to a different conversation
  const switchConversation = useCallback(
    async (id: number) => {
      if (id === currentIdRef.current) return;
      try {
        const msgs = await loadMessages(id);
        setCurrentId(id);
        setConversationState(msgs);
      } catch {
        // silent
      }
    },
    [loadMessages]
  );

  // Delete a specific conversation
  const deleteConversation = useCallback(
    async (id: number) => {
      try {
        await apiRequest("DELETE", `/api/agent-conversations/${agentType}/${id}`);
        const newList = await fetchList();

        // If we deleted the active conversation, switch to the next one or create fresh
        if (id === currentIdRef.current) {
          const remaining = newList.filter((c) => c.id !== id);
          if (remaining.length > 0) {
            const msgs = await loadMessages(remaining[0].id);
            setCurrentId(remaining[0].id);
            setConversationState(msgs);
          } else {
            // No conversations left — create a fresh one
            const res = await apiRequest("POST", `/api/agent-conversations/${agentType}`, {});
            const data = await res.json();
            setCurrentId(data.id);
            setConversationState([]);
            await fetchList();
          }
        }
      } catch {
        // silent
      }
    },
    [agentType, fetchList, loadMessages]
  );

  const groupedConversations = groupConversationsByDate(conversations);

  return {
    conversations,
    groupedConversations,
    currentId,
    conversation,
    setConversation,
    persistConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    isLoading,
  };
}