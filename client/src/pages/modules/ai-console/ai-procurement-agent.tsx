import { useState, useRef, useEffect } from "react";
import { useAgentConversation } from "@/hooks/useAgentConversation";
import {
  AGENT_MENTION_PLACEHOLDER_HINT,
  useAgentMentions,
} from "@/hooks/useAgentMentions";
import { SourcingUserMessageBubbleContent } from "@/lib/supplier-mention-utils";
import type {
  BidMention,
  BusinessUserMention,
  InvoiceMention,
  ItemMention,
  PoMention,
  PrMention,
  SupplierMention,
} from "@shared/agent-mention";
import { Link } from "wouter";
import { 
  Send,
  ShoppingCart,
  Sparkles,
  Bot,
  FileText,
  Search,
  BarChart3,
  Package,
  ClipboardList,
  User,
  ArrowLeft,
  CheckCircle2,
  X,
  Check,
  Zap,
  AlertTriangle,
  Truck,
  FolderTree,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  BookOpen,
  PanelRightClose,
  PanelLeftOpen,
  PanelLeftClose,
  Trash2,
  MessageSquare,
  Plus,
  Brain,
  RotateCcw
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CapabilitiesInfoButton } from "@/components/agent-panels/capabilities-info-button";
import { MessageFeedback } from "@/components/agent-panels/message-feedback";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import { streamAgentQuery } from "@/lib/streamAgentQuery";
import { useToast } from "@/hooks/use-toast";
import { AgentChartMessage } from "./agent-chart-message";
import { ProcurementChoiceButtons } from "./procurement-choice-buttons";
import { isSelectOptionPendingAction } from "./direct-po-choice-types";
import type { AgentChoiceOption } from "./direct-po-choice-types";
import type { AgentChartSpec } from "@shared/agent-chart";
import { formatDate } from "@/lib/common-functions";
import { ProcurementActivationSignalsPopover } from "./procurement-activation-signals-popover";
import { ProcurementPendingTasksFlow } from "./procurement-pending-tasks-flow";
import { BudgetApprovalReviewCard } from "./budget-approval-review-card";
import { PrRecommendationCard } from "./pr-recommendation-card";
import { isPrRecommendation } from "@shared/agent-pr-recommendation";
import type { PrRecommendationSpec } from "@shared/agent-pr-recommendation";
import { PoRecommendationCard } from "./po-recommendation-card";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { isPoRecommendation } from "@shared/agent-po-recommendation";
import type { PoRecommendationSpec } from "@shared/agent-po-recommendation";
import { hasPoChatOverrides, parsePoChatOverrides } from "@shared/po-chat-overrides";
import {
  applyPoChatEditLocally,
  mergePoChatOverrides,
  resolveVendorIdFromSpec,
} from "./po-recommendation-utils";
import { PrApprovalReviewCard } from "./pr-approval-review-card";
import { PoApprovalReviewCard } from "./po-approval-review-card";
import { ProcurementAlertReviewCard } from "./procurement-alert-review-card";
import { PROCUREMENT_ACTIVATION_SIGNALS_QUERY_KEY } from "@/hooks/useProcurementActivationSignals";
import { readProcurementActivationPreferences } from "@/hooks/useProcurementActivationPreferences";
import {
  ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS,
  PENDING_PROCUREMENT_TASKS_PROMPT,
  getPendingTaskReviewFlowType,
  isProcurementPhase2Stage,
  type ProcurementActivationStageId,
  type ProcurementActivationStageItem,
} from "@shared/procurement-activation-signals";
import {
  actionRequiresComments,
  findLatestPendingProcurementActivation,
  isProcurementActivationCardPending,
  parseProcurementActivationCommand,
  parseProcurementConfirmationFollowUp,
  procurementActionAck,
  procurementActionCompleteMessage,
  type ActiveProcurementConfirmation,
  type ProcurementChatActionRequest,
} from "./procurement-activation-chat-actions";

const capabilities = [
  { icon: Search, label: "Search PRs & POs", description: "Search and query purchase requisitions and orders" },
  { icon: FileText, label: "Create & Update PRs", description: "Create, modify, and add items to PRs" },
  { icon: ClipboardList, label: "Submit & Convert", description: "Submit PRs for approval, create POs from PRs" },
  { icon: Package, label: "Item Catalog", description: "Search items and products" },
  { icon: FolderTree, label: "UNSPSC Categories", description: "Browse and search category hierarchy" },
  { icon: Truck, label: "Delivery & GRN", description: "Track shipments and goods receipt" },
  { icon: BarChart3, label: "Analytics", description: "PR and PO statistics" },
  { icon: Sparkles, label: "29 AI Tools", description: "13 read + 16 write tools" },
];

interface PendingAction {
  type: string;
  data: any;
  summary: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  pendingAction?: PendingAction;
  actionStatus?: "pending" | "confirmed" | "cancelled";
  chart?: AgentChartSpec;
  mentions?: SupplierMention[];
  businessUserMentions?: BusinessUserMention[];
  itemMentions?: ItemMention[];
  bidMentions?: BidMention[];
  prMentions?: PrMention[];
  poMentions?: PoMention[];
  invoiceMentions?: InvoiceMention[];
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarkdown(text: string) {
  const lines = text.split('\n');
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      htmlParts.push('<div class="h-2"></div>');
      i++;
      continue;
    }

    const escaped = escapeHtml(line);
    const bold = (s: string) => s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (line.match(/^## /)) {
      htmlParts.push(`<h3 class="font-semibold text-sm mt-3 mb-1">${bold(escaped.replace(/^## /, ''))}</h3>`);
      i++;
      continue;
    }
    if (line.match(/^### /)) {
      htmlParts.push(`<h4 class="font-medium text-xs mt-2 mb-1 text-muted-foreground">${bold(escaped.replace(/^### /, ''))}</h4>`);
      i++;
      continue;
    }

    if (line.match(/^- /)) {
      while (i < lines.length && lines[i].match(/^- /)) {
        const itemText = escapeHtml(lines[i].replace(/^- /, ''));
        htmlParts.push(`<div class="flex items-start gap-1.5 text-xs py-0.5"><span class="text-muted-foreground mt-0.5">&bull;</span><span>${bold(itemText)}</span></div>`);
        i++;
      }
      continue;
    }

    if (line.match(/^_/) && line.match(/_$/)) {
      htmlParts.push(`<div class="text-xs py-0.5 italic text-muted-foreground">${bold(escaped.replace(/^_|_$/g, ''))}</div>`);
      i++;
      continue;
    }

    if (line.match(/^\s{2,}/)) {
      htmlParts.push(`<div class="text-xs pl-4 py-0.5 text-muted-foreground">${bold(escaped.trim())}</div>`);
      i++;
      continue;
    }

    htmlParts.push(`<div class="text-xs py-0.5">${bold(escaped)}</div>`);
    i++;
  }

  return htmlParts.join('');
}

interface PromptCategory {
  module: string;
  icon: string;
  prompts: string[];
}

interface AgentSuggestions {
  quickActions: Record<string, string>;
  categories: PromptCategory[];
}

export default function AIProcurementAgent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mention = useAgentMentions();
  const { prompt, setPromptText, reset: resetMentions, streamMentions } = mention;
  const activationChatNonceRef = useRef(0);

  // Example prompts and quick-action templates come from the knowledge layer
  // (ai/prompts/suggestions/) so they can be edited without a client rebuild.
  // Phase 1 only: render `categories[].prompts` and Phase 1 quick-action buttons.
  // Phase 2 templates live in phase2Prompts / phase2Categories / phase2QuickActions
  // in procurement-suggestions.json and are unused here.
  const { data: suggestions } = useQuery<AgentSuggestions>({
    queryKey: ["/api/agent-prompts", "procurement"],
  });
  const procurementAgentPrompts = suggestions?.categories ?? [];
  const quickActions = suggestions?.quickActions ?? {};

  /**
   * Dev/testing switch for the feedback layer.
   *
   * ON  — this user's stored feedback shapes the answer (normal behaviour).
   * OFF — the agent answers from its baseline prompt, ignoring stored feedback.
   *
   * Either way, thumbs up/down and comments stay visible and keep writing to
   * am_agent_feedback; only the *application* of feedback is suppressed. That makes it a
   * true A/B comparison: ask the same question twice with the switch flipped.
   *
   * Persisted per browser so a reload doesn't silently change how answers are produced.
   */
  const [applyFeedback, setApplyFeedback] = useState<boolean>(() => {
    try {
      return localStorage.getItem("prokraya-procurement-apply-feedback") !== "false";
    } catch {
      return true;
    }
  });

  const toggleApplyFeedback = () => {
    setApplyFeedback((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("prokraya-procurement-apply-feedback", String(next));
      } catch {
        /* private browsing — in-memory only */
      }
      toast({
        title: next ? "Feedback learning ON" : "Feedback learning OFF",
        description: next
          ? "Applies from your next message in this chat."
          : "Applies from your next message in this chat. Thumbs and comments are still recorded.",
      });
      return next;
    });
  };

  /**
   * One-shot flag consumed by the very next request after a reset.
   *
   * Deleting the rows removes the guidance immediately, but this conversation still
   * replays earlier assistant turns that were written in the personalised style, and the
   * model imitates them. This tells the server to explicitly disregard that style, so the
   * reset is visible on the next message rather than only in a brand-new chat.
   */
  const [feedbackJustReset, setFeedbackJustReset] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedbackCount, setFeedbackCount] = useState<{ total: number; activeLessons: number } | null>(null);

  /** Fetch the current counts so the confirmation can say exactly what will be deleted. */
  const openResetDialog = async () => {
    setFeedbackCount(null);
    setResetDialogOpen(true);
    try {
      const res = await apiRequest("GET", "/api/agent-feedback/count?agentType=procurement");
      setFeedbackCount(await res.json());
    } catch {
      /* dialog still works; it just won't show counts */
    }
  };

  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      const res = await apiRequest("DELETE", "/api/agent-feedback/mine?agentType=procurement");
      const { deleted } = await res.json();
      setFeedbackJustReset(true); // consumed by the next message
      setResetDialogOpen(false);
      toast({
        title: "Feedback reset",
        description: `${deleted} feedback ${deleted === 1 ? "entry" : "entries"} deleted. Takes effect from your next message.`,
      });
    } catch {
      toast({
        title: "Couldn't reset feedback",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  const {
    conversation,
    setConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    groupedConversations,
    currentId,
  } = useAgentConversation("procurement");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [capabilitiesPanelWidth, setCapabilitiesPanelWidth] = useState(320);
  const isResizingCapabilitiesRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(320);
  const [activeActivationConfirmation, setActiveActivationConfirmation] =
    useState<ActiveProcurementConfirmation | null>(null);
  const [activationChatRequest, setActivationChatRequest] = useState<{
    msgIndex: number;
    request: ProcurementChatActionRequest;
  } | null>(null);

  const CAPABILITIES_PANEL_MIN_WIDTH = 280;
  const CAPABILITIES_PANEL_MAX_WIDTH = 520;

  const refreshActivationSignals = () => {
    queryClient.invalidateQueries({ queryKey: PROCUREMENT_ACTIVATION_SIGNALS_QUERY_KEY });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingCapabilitiesRef.current) return;
      const delta = resizeStartXRef.current - event.clientX;
      const nextWidth = Math.min(
        CAPABILITIES_PANEL_MAX_WIDTH,
        Math.max(CAPABILITIES_PANEL_MIN_WIDTH, resizeStartWidthRef.current + delta),
      );
      setCapabilitiesPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      if (!isResizingCapabilitiesRef.current) return;
      isResizingCapabilitiesRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel an in-flight agent query and finalize the streaming placeholder.
  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const runStream = async (
    promptText: string,
    history: typeof conversation,
    confirmAction?: { type: string; data: any },
    activationContext?: string,
    mentionPayload: {
      mentions?: SupplierMention[];
      businessUserMentions?: BusinessUserMention[];
      itemMentions?: ItemMention[];
      bidMentions?: BidMention[];
      prMentions?: PrMention[];
      poMentions?: PoMention[];
      invoiceMentions?: InvoiceMention[];
    } = {},
  ) => {
    setIsStreaming(true);
    const placeholderMsg = { role: "assistant" as const, content: "", timestamp: new Date(), isStreaming: true };
    if (!confirmAction) {
      setConversation(prev => [
        ...prev,
        {
          role: "user" as const,
          content: promptText,
          timestamp: new Date(),
          mentions: mentionPayload.mentions,
          businessUserMentions: mentionPayload.businessUserMentions,
          itemMentions: mentionPayload.itemMentions,
          bidMentions: mentionPayload.bidMentions,
          prMentions: mentionPayload.prMentions,
          poMentions: mentionPayload.poMentions,
          invoiceMentions: mentionPayload.invoiceMentions,
        },
        placeholderMsg,
      ]);
      resetMentions();
    } else {
      setConversation(prev => [...prev, placeholderMsg]);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    // The reset signal applies to exactly one request; clear it as soon as it is sent.
    if (feedbackJustReset) setFeedbackJustReset(false);
    const preferences = readProcurementActivationPreferences();

    await streamAgentQuery({
      endpoint: "/api/procurement-agent/query/stream",
      prompt: promptText,
      conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      confirmAction,
      activationContext,
      activationPreferences: preferences,
      ...mentionPayload,
      // Dev toggle: when off, the agent answers from its baseline prompt. Capture is
      // unaffected — thumbs and comments are still recorded either way.
      applyFeedback,
      feedbackJustReset,
      signal: controller.signal,
      onToken: (token) => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") updated[updated.length - 1] = { ...last, content: last.content + token };
          return updated;
        });
      },
      onDone: (
        pendingAction,
        chart,
        _charts,
        _pendingActions,
        _compareBids,
        _sourcingTaskFlow,
        _bidApprovalReview,
        _openEnvelopeReview,
        _technicalReview,
        _commercialReview,
        _technicalEvaluation,
        _commercialEvaluation,
        _awardingReview,
        _bidAwardApprovalReview,
        _bidAwardSubmitReview,
        actionPreview,
        _actionResult,
        _supplierTaskFlow,
        _supplierApprovalReview,
        _createBidSourceChoice,
        procurementTaskFlow,
        budgetApprovalReview,
        prApprovalReview,
        poApprovalReview,
        procurementAlertReview,
        _supplierApprovalCommand,
        procurementApprovalCommand,
      ) => {
        const existingApprovalIndex = procurementApprovalCommand
          ? [...history]
              .map((message, index) => ({ message, index }))
              .reverse()
              .find(({ message }) => {
                if (
                  procurementApprovalCommand.stageId === "budgetApproval" &&
                  message.budgetApprovalReview?.budgetId === procurementApprovalCommand.budgetId
                ) {
                  return message.budgetApprovalStatus === "pending" || !message.budgetApprovalStatus;
                }
                if (
                  procurementApprovalCommand.stageId === "prApproval" &&
                  message.prApprovalReview?.prNumber === procurementApprovalCommand.prNumber
                ) {
                  return message.prApprovalStatus === "pending" || !message.prApprovalStatus;
                }
                if (
                  procurementApprovalCommand.stageId === "poApproval" &&
                  message.poApprovalReview?.poNumber === procurementApprovalCommand.poNumber
                ) {
                  return message.poApprovalStatus === "pending" || !message.poApprovalStatus;
                }
                return false;
              })?.index
          : undefined;
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            let nextPoRecommendation = isPoRecommendation(actionPreview) ? actionPreview : undefined;
            let nextPoRecommendationStatus = nextPoRecommendation ? ("pending" as const) : undefined;
            let nextPendingAction = pendingAction;
            let mergedFieldEdit = false;
            if (nextPoRecommendation) {
              const lastUser = [...updated].reverse().find((msg) => msg.role === "user");
              const isFieldEdit = !!(lastUser && hasPoChatOverrides(parsePoChatOverrides(lastUser.content)));
              let existingPendingIdx = -1;
              for (let i = updated.length - 2; i >= 0; i--) {
                if (
                  updated[i].poRecommendation &&
                  (updated[i].poRecommendationStatus === "pending" || !updated[i].poRecommendationStatus)
                ) {
                  existingPendingIdx = i;
                  break;
                }
              }
              if (isFieldEdit && existingPendingIdx >= 0) {
                updated[existingPendingIdx] = {
                  ...updated[existingPendingIdx],
                  poRecommendation: nextPoRecommendation,
                };
                nextPoRecommendation = undefined;
                nextPoRecommendationStatus = undefined;
                nextPendingAction = undefined;
                mergedFieldEdit = true;
              } else {
                for (let i = 0; i < updated.length - 1; i++) {
                  if (
                    updated[i].poRecommendation &&
                    (updated[i].poRecommendationStatus === "pending" || !updated[i].poRecommendationStatus)
                  ) {
                    updated[i] = { ...updated[i], poRecommendationStatus: "cancelled" as const };
                  }
                }
              }
            }
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              content: mergedFieldEdit ? "Updated the recommendation above." : last.content,
              pendingAction: nextPendingAction || undefined,
              actionStatus: nextPendingAction ? "pending" as const : undefined,
              chart: nextPendingAction ? undefined : chart || undefined,
              procurementTaskFlow: procurementTaskFlow || undefined,
              budgetApprovalReview:
                procurementApprovalCommand && existingApprovalIndex !== undefined
                  ? undefined
                  : budgetApprovalReview || undefined,
              budgetApprovalStatus:
                budgetApprovalReview &&
                !(procurementApprovalCommand && existingApprovalIndex !== undefined)
                  ? "pending"
                  : undefined,
              prApprovalReview:
                procurementApprovalCommand && existingApprovalIndex !== undefined
                  ? undefined
                  : prApprovalReview || undefined,
              prApprovalStatus:
                prApprovalReview &&
                !(procurementApprovalCommand && existingApprovalIndex !== undefined)
                  ? "pending"
                  : undefined,
              poApprovalReview:
                procurementApprovalCommand && existingApprovalIndex !== undefined
                  ? undefined
                  : poApprovalReview || undefined,
              poApprovalStatus:
                poApprovalReview &&
                !(procurementApprovalCommand && existingApprovalIndex !== undefined)
                  ? "pending"
                  : undefined,
              procurementAlertReview: procurementAlertReview || undefined,
              procurementAlertStatus: procurementAlertReview ? "pending" : undefined,
              prRecommendation: isPrRecommendation(actionPreview) ? actionPreview : undefined,
              prRecommendationStatus: isPrRecommendation(actionPreview) ? "pending" as const : undefined,
              poRecommendation: nextPoRecommendation,
              poRecommendationStatus: nextPoRecommendationStatus,
            };
          }
          return updated;
        });
        if (procurementApprovalCommand) {
          const card =
            procurementApprovalCommand.stageId === "budgetApproval"
              ? "budgetApproval"
              : procurementApprovalCommand.stageId === "prApproval"
                ? "prApproval"
                : "poApproval";
          const targetIndex =
            existingApprovalIndex ?? history.length + (confirmAction ? 0 : 1);
          const confirmation: ActiveProcurementConfirmation = {
            msgIndex: targetIndex,
            card,
            action: procurementApprovalCommand.action,
            comments: procurementApprovalCommand.comments?.trim() || undefined,
          };
          activationChatNonceRef.current += 1;
          setActiveActivationConfirmation(confirmation);
          setActivationChatRequest({
            msgIndex: targetIndex,
            request: {
              nonce: activationChatNonceRef.current,
              kind: "start",
              card,
              action: procurementApprovalCommand.action,
              comments: procurementApprovalCommand.comments,
            },
          });
        }
        setIsStreaming(false);
        abortRef.current = null;
        refreshActivationSignals();
      },
      onError: (message) => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            updated[updated.length - 1] = { ...last, content: message, isStreaming: false };
          } else {
            updated.push({ role: "assistant" as const, content: message, timestamp: new Date() });
          }
          return updated;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
      onAbort: () => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              content: last.content || "_Stopped._",
            };
          }
          return updated;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
    });
  };

  const handlePendingTaskCategorySelect = (stageId: ProcurementActivationStageId, label: string) => {
    if (isStreaming) return;
    if (
      readProcurementActivationPreferences()[stageId] === false ||
      (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && isProcurementPhase2Stage(stageId))
    ) {
      toast({ title: "Disabled", description: `${label} is turned off in Activation Signals.` });
      return;
    }
    if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stageId === "requested") {
      runStream(
        `Show Requested`,
        conversation,
        undefined,
        JSON.stringify({ pendingTaskFlow: "requestedEmpty", stageId }),
      );
      return;
    }
    runStream(
      `Show ${label}`,
      conversation,
      undefined,
      JSON.stringify({ pendingTaskFlow: "tasks", stageId }),
    );
  };

  const handlePendingStageTaskSelect = (
    stageId: ProcurementActivationStageId,
    taskIndex: number,
    label: string,
  ) => {
    if (isStreaming) return;
    if (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && isProcurementPhase2Stage(stageId)) return;
    const reviewFlow = getPendingTaskReviewFlowType(stageId);
    if (!reviewFlow || reviewFlow === "requestedEmpty") return;
    runStream(
      label,
      conversation,
      undefined,
      JSON.stringify({ pendingTaskFlow: reviewFlow, stageId, taskIndex }),
    );
  };

  const handleActivationStageSelect = (
    stageId: ProcurementActivationStageId,
    item: ProcurementActivationStageItem | null,
    taskIndex: number,
    label: string,
  ) => {
    if (isStreaming || readProcurementActivationPreferences()[stageId] === false) return;
    if (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && isProcurementPhase2Stage(stageId)) return;
    if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stageId === "requested") {
      handlePendingTaskCategorySelect(stageId, label);
      return;
    }
    if (item && taskIndex >= 0) {
      handlePendingStageTaskSelect(stageId, taskIndex, label);
      return;
    }
    handlePendingTaskCategorySelect(stageId, label);
  };

  const finalizeActivationOutcome = (
    msgIndex: number,
    card: ActiveProcurementConfirmation["card"],
    result: string,
    action: NonNullable<ProcurementChatActionRequest["action"]>,
    label: string,
  ) => {
    setConversation((prev) => {
      const updated = [...prev];
      const msg = updated[msgIndex];
      if (!msg) return prev;
      if (card === "budgetApproval") {
        updated[msgIndex] = { ...msg, budgetApprovalStatus: result as any };
      } else if (card === "prApproval") {
        updated[msgIndex] = { ...msg, prApprovalStatus: result as any };
      } else if (card === "poApproval") {
        updated[msgIndex] = { ...msg, poApprovalStatus: result as any };
      } else if (card === "procurementAlert") {
        updated[msgIndex] = { ...msg, procurementAlertStatus: "acknowledged" };
      }
      updated.push({
        role: "assistant",
        content: procurementActionCompleteMessage(action, label),
        timestamp: new Date(),
      });
      return updated;
    });
    // Completing the action ends the flow: the refreshed counts land on the
    // Activation Signals badge, and the next step is whatever the user asks for.
    setActiveActivationConfirmation(null);
    setActivationChatRequest(null);
    refreshActivationSignals();
  };

  const reportActivationFailure = (msgIndex: number, message: string) => {
    setActiveActivationConfirmation((cur) => (cur?.msgIndex === msgIndex ? null : cur));
    setConversation((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `That didn't go through: ${message}`,
        timestamp: new Date(),
      },
    ]);
  };

  const dispatchActivationChat = (opts: {
    msgIndex: number;
    request: ProcurementChatActionRequest;
    userText: string;
    ack: string;
    keepConfirmation?: ActiveProcurementConfirmation | null;
  }) => {
    setConversation((prev) => [
      ...prev,
      { role: "user", content: opts.userText, timestamp: new Date() },
      { role: "assistant", content: opts.ack, timestamp: new Date() },
    ]);
    setPromptText("");
    setActiveActivationConfirmation(
      opts.keepConfirmation === undefined ? null : opts.keepConfirmation,
    );
    setActivationChatRequest({ msgIndex: opts.msgIndex, request: opts.request });
  };

  // Only the card rendered at this message index can execute the action, so a
  // stale index would leave the confirmation acknowledged but never run.
  const resolveConfirmationMsgIndex = (
    confirmation: ActiveProcurementConfirmation,
  ): number | null => {
    if (
      isProcurementActivationCardPending(
        conversation[confirmation.msgIndex],
        confirmation.card,
      )
    ) {
      return confirmation.msgIndex;
    }
    const latest = findLatestPendingProcurementActivation(conversation);
    return latest?.card === confirmation.card ? latest.msgIndex : null;
  };

  const handleSubmit = () => {
    if (!prompt.trim() || isStreaming) return;
    const text = prompt.trim();

    // Confirmation follow-up for an open activation action panel
    if (activeActivationConfirmation) {
      const followUp = parseProcurementConfirmationFollowUp(text);
      if (followUp === "cancel") {
        activationChatNonceRef.current += 1;
        dispatchActivationChat({
          msgIndex: activeActivationConfirmation.msgIndex,
          request: {
            nonce: activationChatNonceRef.current,
            kind: "cancel",
            card: activeActivationConfirmation.card,
          },
          userText: text,
          ack: "Cancelled.",
          keepConfirmation: null,
        });
        return;
      }
      if (followUp === "confirm") {
        const needsComments = actionRequiresComments(
          activeActivationConfirmation.card,
          activeActivationConfirmation.action,
        );
        if (needsComments && !activeActivationConfirmation.comments?.trim()) {
          setConversation((prev) => [
            ...prev,
            { role: "user", content: text, timestamp: new Date() },
            {
              role: "assistant",
              content: "Comments are required for this action. Please provide a reason.",
              timestamp: new Date(),
            },
          ]);
          setPromptText("");
          return;
        }
        const confirmMsgIndex = resolveConfirmationMsgIndex(activeActivationConfirmation);
        if (confirmMsgIndex === null) {
          setActiveActivationConfirmation(null);
          setActivationChatRequest(null);
          setConversation((prev) => [
            ...prev,
            { role: "user", content: text, timestamp: new Date() },
            {
              role: "assistant",
              content:
                "That approval is no longer open. Ask me to show the pending approvals and I'll pull up the current list.",
              timestamp: new Date(),
            },
          ]);
          setPromptText("");
          return;
        }
        activationChatNonceRef.current += 1;
        dispatchActivationChat({
          msgIndex: confirmMsgIndex,
          request: {
            nonce: activationChatNonceRef.current,
            kind: "confirm",
            card: activeActivationConfirmation.card,
            action: activeActivationConfirmation.action,
            comments: activeActivationConfirmation.comments,
          },
          userText: text,
          ack: "Confirming…",
          keepConfirmation: null,
        });
        return;
      }
      // Treat free text as comments while confirmation is open
      if (actionRequiresComments(activeActivationConfirmation.card, activeActivationConfirmation.action)) {
        setActiveActivationConfirmation({
          ...activeActivationConfirmation,
          comments: text,
        });
        setConversation((prev) => [
          ...prev,
          { role: "user", content: text, timestamp: new Date() },
          {
            role: "assistant",
            content: `Got it. Reply **yes** to confirm or **cancel** to abort.`,
            timestamp: new Date(),
          },
        ]);
        setPromptText("");
        return;
      }
    }

    const target = findLatestPendingProcurementActivation(conversation);
    if (target) {
      const parsed = parseProcurementActivationCommand(text, target);
      if (parsed) {
        const needsComments = actionRequiresComments(target.card, parsed.action);
        if (needsComments && !parsed.comments?.trim()) {
          setActiveActivationConfirmation({
            msgIndex: target.msgIndex,
            card: target.card,
            action: parsed.action,
          });
          setConversation((prev) => [
            ...prev,
            { role: "user", content: text, timestamp: new Date() },
            {
              role: "assistant",
              content: procurementActionAck(parsed.action, target.label, false, true),
              timestamp: new Date(),
            },
          ]);
          setPromptText("");
          return;
        }
        activationChatNonceRef.current += 1;
        const keep: ActiveProcurementConfirmation = {
          msgIndex: target.msgIndex,
          card: target.card,
          action: parsed.action,
          comments: parsed.comments,
        };
        dispatchActivationChat({
          msgIndex: target.msgIndex,
          request: {
            nonce: activationChatNonceRef.current,
            kind: "start",
            card: target.card,
            action: parsed.action,
            comments: parsed.comments,
          },
          userText: text,
          ack: procurementActionAck(parsed.action, target.label, true, false),
          keepConfirmation: keep,
        });
        return;
      }
    }

    const activeMessage = target ? conversation[target.msgIndex] : undefined;
    const activeReview =
      target?.card === "budgetApproval" && activeMessage?.budgetApprovalReview
        ? {
            stageId: "budgetApproval",
            title: activeMessage.budgetApprovalReview.title,
            budgetId: activeMessage.budgetApprovalReview.budgetId,
          }
        : target?.card === "prApproval" && activeMessage?.prApprovalReview
          ? {
              stageId: "prApproval",
              title: activeMessage.prApprovalReview.title,
              prNumber: activeMessage.prApprovalReview.prNumber,
            }
          : target?.card === "poApproval" && activeMessage?.poApprovalReview
            ? {
                stageId: "poApproval",
                title: activeMessage.poApprovalReview.title,
                poNumber: activeMessage.poApprovalReview.poNumber,
              }
            : target?.card === "procurementAlert" && activeMessage?.procurementAlertReview
              ? {
                  stageId: "alerts",
                  title: activeMessage.procurementAlertReview.title,
                  poNumber: activeMessage.procurementAlertReview.poNumber,
                  alertType: activeMessage.procurementAlertReview.alertType,
                }
              : undefined;

    const poChatEdit = parsePoChatOverrides(text);
    if (hasPoChatOverrides(poChatEdit)) {
      let pendingPoIdx = -1;
      for (let i = conversation.length - 1; i >= 0; i--) {
        const msg = conversation[i];
        if (msg.poRecommendation && (msg.poRecommendationStatus === "pending" || !msg.poRecommendationStatus)) {
          pendingPoIdx = i;
          break;
        }
      }
      if (pendingPoIdx >= 0 && conversation[pendingPoIdx].poRecommendation) {
        const spec = conversation[pendingPoIdx].poRecommendation as PoRecommendationSpec;
        setPromptText("");
        setIsStreaming(true);
        // Show the user turn immediately (same as runStream) while the card update runs.
        setConversation((prev) => [
          ...prev,
          { role: "user" as const, content: text, timestamp: new Date() },
          { role: "assistant" as const, content: "", timestamp: new Date(), isStreaming: true },
        ]);
        void (async () => {
          try {
            let supplierId: number | null = null;
            if (poChatEdit.supplierName) {
              supplierId = resolveVendorIdFromSpec(spec, poChatEdit.supplierName);
              if (supplierId == null) {
                try {
                  const res = await apiRequest(
                    "GET",
                    `/api/dbo/suppliers?page=1&limit=20&search=${encodeURIComponent(poChatEdit.supplierName)}`,
                  );
                  const json = await parseJsonResponse<{
                    data?: Array<{ id: number; companyName?: string; company_name?: string }>;
                  }>(res);
                  const rows = json.data ?? [];
                  const needle = poChatEdit.supplierName.toLowerCase();
                  const exact = rows.filter(
                    (row) => String(row.companyName || row.company_name || "").toLowerCase() === needle,
                  );
                  const partial = rows.filter((row) =>
                    String(row.companyName || row.company_name || "").toLowerCase().includes(needle),
                  );
                  const picked = exact[0] ?? (partial.length === 1 ? partial[0] : rows.length === 1 ? rows[0] : undefined);
                  if (picked?.id != null) supplierId = Number(picked.id);
                } catch {
                  // Keep the open card; resolve from the dropdown or apply other fields locally.
                }
              }
            }

            let next = applyPoChatEditLocally(spec, poChatEdit, supplierId);
            const onlyQuantity =
              poChatEdit.quantity != null && !poChatEdit.supplierName && !poChatEdit.needByDateRaw;
            if (!onlyQuantity) {
              try {
                const overrides = mergePoChatOverrides(spec, poChatEdit, supplierId);
                const recRes = await apiRequest("POST", "/api/procurement-agent/po-recommendation", {
                  request: spec.request,
                  overrides,
                });
                next = await parseJsonResponse<PoRecommendationSpec>(recRes);
                if (poChatEdit.quantity != null && next.lineItems.length > 0) {
                  next = {
                    ...next,
                    lineItems: next.lineItems.map((item, index) =>
                      index === 0 ? { ...item, quantity: poChatEdit.quantity!, quantityPredicted: false } : item,
                    ),
                  };
                }
              } catch {
                next = applyPoChatEditLocally(spec, poChatEdit, supplierId);
              }
            }

            const vendorMissing = !!(poChatEdit.supplierName && supplierId == null);
            if (vendorMissing) {
              toast({
                title: "Vendor not found",
                description: `Could not match "${poChatEdit.supplierName}". Pick it from the Vendor dropdown on the card above.`,
                variant: "destructive",
              });
            }
            const ack = [
              poChatEdit.supplierName && !vendorMissing
                ? `vendor to ${next.vendor.value?.label || poChatEdit.supplierName}`
                : null,
              poChatEdit.needByDateRaw ? `need-by date to ${next.needByDate.value}` : null,
              poChatEdit.quantity != null ? `quantity to ${poChatEdit.quantity}` : null,
            ].filter(Boolean).join(" and ");
            const ackContent =
              vendorMissing && !ack
                ? `I couldn't find that vendor. Pick it from the Vendor dropdown on the recommendation above.`
                : ack
                  ? `Updated ${ack} on the recommendation above.`
                  : "Updated the recommendation above.";
            setConversation((prev) => {
              const updated = prev.map((msg, i) =>
                i === pendingPoIdx ? { ...msg, poRecommendation: next } : msg,
              );
              const last = updated[updated.length - 1];
              if (last?.role === "assistant" && last.isStreaming) {
                updated[updated.length - 1] = {
                  ...last,
                  isStreaming: false,
                  content: ackContent,
                };
              } else {
                updated.push({ role: "assistant", content: ackContent, timestamp: new Date() });
              }
              return updated;
            });
          } catch {
            setConversation((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant" && last.isStreaming) {
                updated[updated.length - 1] = {
                  ...last,
                  isStreaming: false,
                  content: "Couldn't update the recommendation. Please try again.",
                };
              } else {
                updated.push({
                  role: "assistant",
                  content: "Couldn't update the recommendation. Please try again.",
                  timestamp: new Date(),
                });
              }
              return updated;
            });
          } finally {
            setIsStreaming(false);
          }
        })();
        return;
      }
    }

    runStream(
      text,
      conversation,
      undefined,
      activeReview ? JSON.stringify({ activeReview }) : undefined,
    );
  };

  const handleConfirmAction = (msgIndex: number) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction) return;
    if (isSelectOptionPendingAction(msg.pendingAction)) return;
    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));
    runStream("", conversation, { type: msg.pendingAction.type, data: msg.pendingAction.data });
  };

  const handleSelectOption = (msgIndex: number, option: AgentChoiceOption) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction || !isSelectOptionPendingAction(msg.pendingAction)) return;
    setConversation((prev) =>
      prev.map((m, i) =>
        i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m,
      ),
    );
    runStream(option.prompt, conversation);
  };

  const handleRecommendationChange = (msgIndex: number, next: PrRecommendationSpec) => {
    setConversation(prev =>
      prev.map((m, i) => (i === msgIndex ? { ...m, prRecommendation: next } : m)),
    );
  };

  const handleCreateFromRecommendation = (msgIndex: number, data: any) => {
    setConversation(prev =>
      prev.map((m, i) => (i === msgIndex ? { ...m, prRecommendationStatus: "created" as const } : m)),
    );
    runStream("", conversation, { type: "create_requisition_from_recommendation", data });
  };

  const handleCancelRecommendation = (msgIndex: number) => {
    setConversation(prev => [
      ...prev.map((m, i) => (i === msgIndex ? { ...m, prRecommendationStatus: "cancelled" as const } : m)),
      {
        role: "assistant" as const,
        content: "No problem — I've discarded that recommendation. Let me know if you'd like to try a different request.",
        timestamp: new Date(),
      },
    ]);
  };

  const handlePoRecommendationChange = (msgIndex: number, next: PoRecommendationSpec) => {
    setConversation((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, poRecommendation: next } : m)),
    );
  };

  const handleCreateFromPoRecommendation = (msgIndex: number, data: any) => {
    setConversation((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, poRecommendationStatus: "created" as const } : m)),
    );
    runStream("", conversation, { type: "create_purchase_order_from_recommendation", data });
  };

  const handleCancelPoRecommendation = (msgIndex: number) => {
    setConversation((prev) => [
      ...prev.map((m, i) => (i === msgIndex ? { ...m, poRecommendationStatus: "cancelled" as const } : m)),
      {
        role: "assistant" as const,
        content:
          "No problem — I've discarded that purchase order recommendation. Let me know if you'd like to try a different request.",
        timestamp: new Date(),
      },
    ]);
  };

  const handleCancelAction = (msgIndex: number) => {
    setConversation(prev => {
      const updated = prev.map((m, i) => 
        i === msgIndex ? { ...m, actionStatus: "cancelled" as const } : m
      );
      return [
        ...updated,
        { role: "assistant" as const, content: "Action cancelled. Let me know if you need anything else.", timestamp: new Date() }
      ];
    });
  };
  
  const handleClearConversation = () => {
    newConversation();
    resetMentions();
  };

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  };

  const handleCapabilitiesResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingCapabilitiesRef.current = true;
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = capabilitiesPanelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleCloseCapabilities = () => {
    if (isResizingCapabilitiesRef.current) {
      isResizingCapabilitiesRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    setShowCapabilities(false);
  };

  const handleToggleCapabilities = () => {
    if (showCapabilities) {
      handleCloseCapabilities();
      return;
    }
    setExpandedCategories(new Set());
    setShowCapabilities(true);
  };

  const getPlaceholderRanges = (text: string) => {
    const matches: Array<{ key: string; start: number; end: number }> = [];
    const re = /\{\{([^}]+)\}\}/g;
    let m: RegExpExecArray | null = null;
    while ((m = re.exec(text)) !== null) {
      const inner = m[1];
      const start = m.index + 2;
      const end = start + inner.length;
      matches.push({ key: inner, start, end });
    }
    return matches;
  };

  const focusAndSelectRange = (start: number, end: number) => {
    const el = mention.inputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.setSelectionRange(start, end);
    } catch {
      // ignore if element doesn't support selection
    }
  };

  const applyCapabilityPrompt = (template: string) => {
    setPromptText(template);
    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(template);
      const first = ranges[0];
      if (first) focusAndSelectRange(first.start, first.end);
      else focusAndSelectRange(template.length, template.length);
    });
  };

  const applyQuickActionTemplate = (
    template: string | undefined,
    confirmLabel: string,
    firstPlaceholderKey?: string,
  ) => {
    if (isStreaming) return;
    // Templates arrive from /api/agent-prompts; ignore clicks until they land.
    if (!template) return;

    if (prompt.trim()) {
      const ok = window.confirm(
        `Replace your current message with the ${confirmLabel} template?`,
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    setPromptText(template);

    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(template);
      const target = firstPlaceholderKey
        ? ranges.find((r) => r.key === firstPlaceholderKey)
        : ranges[0];
      if (target) focusAndSelectRange(target.start, target.end);
      else focusAndSelectRange(template.length, template.length);
    });
  };

  const handleCreatePrClick = () => {
    applyQuickActionTemplate(quickActions.createPr, "Create PR", "description");
  };

  // Phase 2 quick action — hidden from UI for now.
  // const handleCreateBudgetClick = () => {
  //   applyQuickActionTemplate(quickActions.createBudget, "Create Budget", "description");
  // };

  const handleConvertPrToPoClick = () => {
    applyQuickActionTemplate(quickActions.convertPrToPo, "Convert PR to PO", "pr_id");
  };

  // Phase 2 quick action — hidden from UI for now.
  // const handleTrackStatusClick = () => {
  //   applyQuickActionTemplate(quickActions.trackStatus, "Track Status", "pr_id/po_id");
  // };

  // Phase 2 quick action — hidden from UI for now.
  // const handleProcurementDashboardClick = () => {
  //   applyQuickActionTemplate(
  //     quickActions.procurementDashboard,
  //     "Procurement Dashboard",
  //   );
  // };

  const handlePendingActionsClick = () => {
    if (isStreaming) return;
    runStream(PENDING_PROCUREMENT_TASKS_PROMPT, conversation, undefined, JSON.stringify({ pendingTaskFlow: "categories" }));
  };

  return (
    <div className="px-4 pt-2 pb-3 flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      <div className="flex items-center justify-between flex-wrap gap-1 mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen((p) => !p)} data-testid="button-toggle-history">
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <Link href="/app/ai-agents">
            <Button variant="ghost" size="icon" data-testid="button-back-ai-agents">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
            <ShoppingCart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Procurement Ops Agent</h1>
          <Badge variant="outline" className="gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
            <Zap className="h-3 w-3" />
            Action-Capable
          </Badge>
          <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3 w-3" />
            Active
          </Badge>
          <ProcurementActivationSignalsPopover onStageActivate={handleActivationStageSelect} />
        </div>
        <div className="flex items-center gap-1.5">
          {/* Dev/testing switch — decides whether stored feedback shapes the answer.
              Feedback capture (thumbs + comments) is unaffected by this. */}
          <Button
            variant={applyFeedback ? "default" : "outline"}
            size="sm"
            onClick={toggleApplyFeedback}
            className="h-7 gap-1.5 px-2.5 text-[11px]"
            title={
              applyFeedback
                ? "Feedback learning is ON — answers are adjusted using your past feedback. Click to compare against the baseline."
                : "Feedback learning is OFF — answers ignore your past feedback. Thumbs and comments are still recorded."
            }
            aria-pressed={applyFeedback}
            data-testid="button-toggle-apply-feedback"
          >
            <Brain className="h-3.5 w-3.5" />
            Feedback: {applyFeedback ? "ON" : "OFF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openResetDialog}
            className="h-7 gap-1.5 px-2.5 text-[11px]"
            title="Permanently delete all of your feedback for this agent"
            data-testid="button-reset-feedback"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <CapabilitiesInfoButton capabilities={capabilities} />
        </div>
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset your feedback?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This permanently deletes <strong>your own</strong> feedback for the Procurement Ops
                  Agent — every thumbs up/down, comment, and learned adjustment. No other user is
                  affected, and no other agent is affected.
                </p>
                {feedbackCount && (
                  <p className="text-foreground">
                    <strong>{feedbackCount.total}</strong>{" "}
                    {feedbackCount.total === 1 ? "entry" : "entries"} will be deleted
                    {feedbackCount.activeLessons > 0 && (
                      <>
                        , including <strong>{feedbackCount.activeLessons}</strong> active{" "}
                        {feedbackCount.activeLessons === 1 ? "adjustment" : "adjustments"} currently
                        shaping your answers
                      </>
                    )}
                    .
                  </p>
                )}
                <p>This cannot be undone. Answers revert to the standard behaviour from your next message.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting} data-testid="button-reset-cancel">No, keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open until the request settles
                handleConfirmReset();
              }}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-reset-confirm"
            >
              {resetting ? "Resetting…" : "Yes, reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex-1 flex gap-3 min-h-0 max-h-full overflow-hidden">
        {/* Conversation History Sidebar */}
        {sidebarOpen && (
          <Card className="w-56 flex-shrink-0 flex flex-col min-h-0 hidden lg:flex">
            <CardContent className="p-0 flex flex-col h-full">
              <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-semibold">History</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)}>
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="p-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={handleClearConversation} data-testid="button-sidebar-new-chat">
                  <Plus className="h-3.5 w-3.5" />
                  New Chat
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-1 pb-2">
                {groupedConversations.map((group) => (
                  <div key={group.label} className="mb-2">
                    <div className="text-xs text-muted-foreground px-2 py-1 font-medium">{group.label}</div>
                    {group.items.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-md hover:bg-muted transition-colors ${currentId === conv.id ? "bg-muted" : ""}`}
                        onClick={() => switchConversation(conv.id)}
                        data-testid={`conv-item-${conv.id}`}
                      >
                        <MessageSquare className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-xs truncate">{conv.title || "New Chat"}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          data-testid={`button-delete-conv-${conv.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex-1 flex flex-col min-h-0">
          <CardContent className="flex-1 p-4 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4" data-testid="chat-messages">
              {conversation.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30 w-fit mx-auto mb-4">
                      <Bot className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Procurement Ops Agent</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      I manage the complete procurement lifecycle — PRs, POs, items, categories, delivery notes, and goods receipt. Just ask in natural language.
                    </p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => { setExpandedCategories(new Set()); setShowCapabilities(true); }} data-testid="button-open-capabilities-empty">
                      <BookOpen className="h-4 w-4" />
                      Explore Capabilities
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {conversation.map((msg, i) => (
                    <div key={i}>
                      <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30 h-fit flex-shrink-0">
                            <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        )}
                        <div className={`rounded-md p-3 max-w-[75%] ${
                          msg.role === "user" 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted"
                        }`}>
                          {msg.role === "assistant" ? (
                            msg.isStreaming && !msg.content ? (
                              <ThinkingTips />
                            ) : msg.isStreaming ? (
                              <p className="text-xs whitespace-pre-wrap">{msg.content}<span className="inline-block w-0.5 h-3 bg-current ml-0.5 align-middle animate-pulse" /></p>
                            ) : (
                              <>
                                <div
                                  className="text-sm [&_h3]:text-foreground [&_h4]:text-muted-foreground [&_strong]:text-foreground"
                                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                                />
                                {msg.chart && !msg.pendingAction ? (
                                  <AgentChartMessage spec={msg.chart} />
                                ) : null}
                              </>
                            )
                          ) : (
                            <SourcingUserMessageBubbleContent
                              content={msg.content}
                              mentions={msg.mentions}
                              businessUserMentions={msg.businessUserMentions}
                              itemMentions={msg.itemMentions}
                              bidMentions={msg.bidMentions}
                              prMentions={msg.prMentions}
                              poMentions={msg.poMentions}
                              invoiceMentions={msg.invoiceMentions}
                            />
                          )}
                          <p className="text-xs opacity-50 mt-1.5">
                            {formatDate(msg.timestamp, true)}
                          </p>
                        </div>
                        {msg.role === "user" && (
                          <div className="p-1.5 rounded-md bg-primary/10 h-fit flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>

                      {msg.prRecommendation && (
                        <div className="ml-10" data-testid={`agent-pr-recommendation-card-${i}`}>
                          <PrRecommendationCard
                            spec={msg.prRecommendation}
                            status={msg.prRecommendationStatus || "pending"}
                            onSpecChange={(next) => handleRecommendationChange(i, next)}
                            onConfirm={(payload) => handleCreateFromRecommendation(i, payload)}
                            onCancel={() => handleCancelRecommendation(i)}
                          />
                        </div>
                      )}

                      {msg.poRecommendation && (
                        <div className="ml-10" data-testid={`agent-po-recommendation-card-${i}`}>
                          <PoRecommendationCard
                            spec={msg.poRecommendation}
                            status={msg.poRecommendationStatus || "pending"}
                            onSpecChange={(next) => handlePoRecommendationChange(i, next)}
                            onConfirm={(payload) => handleCreateFromPoRecommendation(i, payload)}
                            onCancel={() => handleCancelPoRecommendation(i)}
                          />
                        </div>
                      )}


                      {/* The recommendation card carries its own confirm/cancel controls. */}
                      {msg.pendingAction &&
                        msg.actionStatus === "pending" &&
                        isSelectOptionPendingAction(msg.pendingAction) && (
                        <div className="ml-10 mt-2">
                          <Card className="border-border bg-muted/30">
                            <CardContent className="p-3">
                              <ProcurementChoiceButtons
                                choice={msg.pendingAction.data}
                                disabled={isStreaming}
                                onSelect={(option) => handleSelectOption(i, option)}
                              />
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {msg.pendingAction &&
                        !msg.prRecommendation &&
                        !msg.poRecommendation &&
                        msg.actionStatus === "pending" &&
                        !isSelectOptionPendingAction(msg.pendingAction) && (
                        <div className="ml-10 mt-2">
                          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
                            <CardContent className="p-3">
                              <div className="flex items-start gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Confirm Action</p>
                                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                                    {msg.pendingAction.summary}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2 ml-6">
                                <Button 
                                  size="sm" 
                                  className="bg-emerald-600 text-white gap-1"
                                  onClick={() => handleConfirmAction(i)}
                                  disabled={isStreaming}
                                  data-testid={`button-confirm-action-${i}`}
                                >
                                  <Check className="h-3 w-3" />
                                  Confirm
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => handleCancelAction(i)}
                                  disabled={isStreaming}
                                  data-testid={`button-cancel-action-${i}`}
                                >
                                  <X className="h-3 w-3" />
                                  Cancel
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {msg.pendingAction && !msg.prRecommendation && !msg.poRecommendation && msg.actionStatus === "confirmed" && (
                        <div className="ml-10 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {isSelectOptionPendingAction(msg.pendingAction)
                              ? "Option selected"
                              : "Action confirmed and executed"}
                          </div>
                        </div>
                      )}

                      {msg.pendingAction && !msg.prRecommendation && !msg.poRecommendation && msg.actionStatus === "cancelled" && (
                        <div className="ml-10 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <X className="h-3.5 w-3.5" />
                            Action cancelled
                          </div>
                        </div>
                      )}

                      {/* Feedback on completed assistant replies only — never while streaming,
                          never on the empty placeholder bubble, never on the user's own message. */}
                      {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                        <MessageFeedback
                          key={`fb-${currentId ?? "new"}-${i}`}
                          agentType="procurement"
                          conversationId={currentId}
                          messageIndex={i}
                          queryText={conversation[i - 1]?.role === "user" ? conversation[i - 1].content : ""}
                          responseText={msg.content}
                        />
                      )}

                      {msg.procurementTaskFlow && (
                        <div className="ml-10">
                          <ProcurementPendingTasksFlow
                            flow={msg.procurementTaskFlow}
                            disabled={isStreaming}
                            onSelectCategory={handlePendingTaskCategorySelect}
                            onSelectStageTask={handlePendingStageTaskSelect}
                          />
                        </div>
                      )}

                      {msg.budgetApprovalReview && (
                        <div className="ml-10" data-testid={`agent-budget-approval-card-${i}`}>
                          <BudgetApprovalReviewCard
                            spec={msg.budgetApprovalReview}
                            status={msg.budgetApprovalStatus || "pending"}
                            disabled={isStreaming}
                            onComplete={(result) =>
                              finalizeActivationOutcome(
                                i,
                                "budgetApproval",
                                result,
                                result === "approved"
                                  ? "approve"
                                  : result === "rejected"
                                    ? "reject"
                                    : result === "resubmitted"
                                      ? "resubmit"
                                      : "more",
                                msg.budgetApprovalReview?.title || "this budget",
                              )
                            }
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "budgetApproval"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onChatActionFailed={(message) => reportActivationFailure(i, message)}
                            onConfirmationStateChange={(action) => {
                              if (!action) {
                                setActiveActivationConfirmation((cur) =>
                                  cur?.msgIndex === i ? null : cur,
                                );
                                return;
                              }
                              setActiveActivationConfirmation({
                                msgIndex: i,
                                card: "budgetApproval",
                                action,
                              });
                            }}
                          />
                        </div>
                      )}

                      {msg.prApprovalReview && (
                        <div className="ml-10" data-testid={`agent-pr-approval-card-${i}`}>
                          <PrApprovalReviewCard
                            spec={msg.prApprovalReview}
                            status={msg.prApprovalStatus || "pending"}
                            disabled={isStreaming}
                            onComplete={(result) =>
                              finalizeActivationOutcome(
                                i,
                                "prApproval",
                                result,
                                result === "approved"
                                  ? "approve"
                                  : result === "rejected"
                                    ? "reject"
                                    : result === "resubmitted"
                                      ? "resubmit"
                                      : "more",
                                msg.prApprovalReview?.title || "this PR",
                              )
                            }
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "prApproval"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onChatActionFailed={(message) => reportActivationFailure(i, message)}
                            onConfirmationStateChange={(action) => {
                              if (!action) {
                                setActiveActivationConfirmation((cur) =>
                                  cur?.msgIndex === i ? null : cur,
                                );
                                return;
                              }
                              setActiveActivationConfirmation({
                                msgIndex: i,
                                card: "prApproval",
                                action,
                              });
                            }}
                          />
                        </div>
                      )}

                      {msg.poApprovalReview && (
                        <div className="ml-10" data-testid={`agent-po-approval-card-${i}`}>
                          <PoApprovalReviewCard
                            spec={msg.poApprovalReview}
                            status={msg.poApprovalStatus || "pending"}
                            disabled={isStreaming}
                            onComplete={(result) =>
                              finalizeActivationOutcome(
                                i,
                                "poApproval",
                                result,
                                result === "approved"
                                  ? "approve"
                                  : result === "rejected"
                                    ? "reject"
                                    : result === "resubmitted"
                                      ? "resubmit"
                                      : "more",
                                msg.poApprovalReview?.title || "this PO",
                              )
                            }
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "poApproval"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onChatActionFailed={(message) => reportActivationFailure(i, message)}
                            onConfirmationStateChange={(action) => {
                              if (!action) {
                                setActiveActivationConfirmation((cur) =>
                                  cur?.msgIndex === i ? null : cur,
                                );
                                return;
                              }
                              setActiveActivationConfirmation({
                                msgIndex: i,
                                card: "poApproval",
                                action,
                              });
                            }}
                          />
                        </div>
                      )}

                      {msg.procurementAlertReview && (
                        <div className="ml-10" data-testid={`agent-procurement-alert-card-${i}`}>
                          <ProcurementAlertReviewCard
                            spec={msg.procurementAlertReview}
                            status={msg.procurementAlertStatus || "pending"}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            <div className="flex flex-nowrap items-center gap-1.5 w-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1.5 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreatePrClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-create-pr"
              >
                Create PR
              </Button>
              {/* Phase 2 — Create Budget
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateBudgetClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-create-budget"
              >
                Create Budget
              </Button>
              */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleConvertPrToPoClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-convert-pr-to-po"
              >
                Convert PR to PO
              </Button>
              {/* Phase 2 — Track Status
              <Button
                variant="outline"
                size="sm"
                onClick={handleTrackStatusClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-track-status"
              >
                Track Status
              </Button>
              */}
              {/* Phase 2 — Procurement Dashboard
              <Button
                variant="outline"
                size="sm"
                onClick={handleProcurementDashboardClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-procurement-dashboard"
              >
                Procurement Dashboard
              </Button>
              */}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePendingActionsClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-pending-actions"
              >
                Pending actions
              </Button>
            </div>
            <div className="relative w-full flex-shrink-0" ref={mention.composerRef}>
            <ChatComposer
              isCompact
              singleRow
              ref={mention.inputRef}
              placeholder={`Ask Prokraya Ai ${AGENT_MENTION_PLACEHOLDER_HINT}`}
              {...mention.composerProps}
              onSubmit={handleSubmit}
              onStop={stopStreaming}
              isStreaming={isStreaming}
              colorTheme="blue"
              submitButtonClassName="rounded-full h-9 w-9"
              textareaDataTestId="input-procurement-prompt"
              submitDataTestId="button-procurement-submit"
              onMicTranscript={(t) => setPromptText(prompt ? `${prompt} ${t}` : t)}
              leftActions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-full flex-shrink-0"
                      data-testid="button-composer-plus"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="min-w-[220px] rounded-xl p-1.5">
                    <DropdownMenuItem
                      className="gap-3 px-3 py-2.5 text-sm font-medium cursor-pointer rounded-lg"
                      onClick={handleToggleCapabilities}
                      data-testid="button-toggle-capabilities"
                    >
                      <BookOpen className="h-4 w-4" />
                      Explore
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-3 px-3 py-2.5 text-sm font-medium cursor-pointer rounded-lg"
                      onClick={handleClearConversation}
                      data-testid="button-new-chat"
                    >
                      <MessageSquare className="h-4 w-4" />
                      New Chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
            {mention.dropdown}
            </div>
          </CardContent>
        </Card>

        {showCapabilities && (
          <div
            className="relative flex-shrink-0 h-full min-h-0 max-h-full hidden md:flex"
            style={{ width: `${capabilitiesPanelWidth}px` }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize capabilities panel"
              className="absolute left-0 top-0 z-20 h-full w-2 -translate-x-1 cursor-col-resize"
              onMouseDown={handleCapabilitiesResizeStart}
              data-testid="capabilities-resize-handle"
            >
              <div className="mx-auto h-full w-px bg-border/70 hover:bg-blue-500" />
            </div>
          <Card className="w-full h-full flex flex-col min-h-0 overflow-hidden">
            <CardContent className="flex-1 p-0 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3 border-b flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold text-sm">Explore Capabilities</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={handleCloseCapabilities} data-testid="button-close-capabilities">
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
              <div className="px-3 py-2 border-b flex-shrink-0">
                <p className="text-xs text-muted-foreground">These are examples — you can ask anything in natural language</p>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1.5 custom-scrollbar min-h-0">
                {procurementAgentPrompts.map((category, catIndex) => {
                  const isExpanded = expandedCategories.has(category.module);
                  return (
                    <div key={catIndex} className="border rounded-md">
                      <Button
                        variant="ghost"
                        onClick={() => toggleCategory(category.module)}
                        className="w-full flex items-center justify-between gap-2 h-auto py-2 px-3"
                        data-testid={`button-category-toggle-${catIndex}`}
                      >
                        <div className="flex items-center gap-2 flex-1 text-left">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="font-medium text-xs">{category.module}</span>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {category.prompts.length}
                        </Badge>
                      </Button>
                      {isExpanded && (
                        <div className="px-3 pb-2 pt-1 border-t space-y-1 bg-muted/30">
                          {category.prompts.map((prompt, promptIndex) => (
                            <Button
                              key={promptIndex}
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-xs h-auto py-1.5 text-left whitespace-normal"
                              onClick={() => applyCapabilityPrompt(prompt)}
                              data-testid={`button-prompt-${catIndex}-${promptIndex}`}
                            >
                              {prompt}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
}
