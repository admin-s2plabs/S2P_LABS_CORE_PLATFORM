import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentConversation, type ConversationMessage } from "@/hooks/useAgentConversation";
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
  Receipt,
  Sparkles,
  Bot,
  Shield,
  FileCheck,
  AlertTriangle,
  User,
  Search,
  ArrowLeft,
  CheckCircle2,
  BarChart3,
  CreditCard,
  X,
  Check,
  Zap,
  ChevronDown,
  ChevronRight,
  BookOpen,
  PanelRightClose,
  PanelLeftOpen,
  PanelLeftClose,
  Trash2,
  MessageSquare,
  Plus,
  GitCompare,
  ShieldAlert,
  Wallet
} from "lucide-react";
// Phase 1 only: render payablesAgentPrompts[].prompts + payablesQuickActions.
// Phase 2 templates (phase2Prompts / payablesAgentPhase2Categories) are unused here.
import { payablesAgentPrompts, payablesQuickActions } from "./payables-agent-prompts";
// import { payablesAgentPhase2Categories } from "./payables-agent-prompts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CapabilitiesInfoButton } from "@/components/agent-panels/capabilities-info-button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import { streamAgentQuery } from "@/lib/streamAgentQuery";
import { useToast } from "@/hooks/use-toast";
import type { AgentChartSpec } from "@shared/agent-chart";
import { AgentChartMessage } from "./agent-chart-message";
import { formatDate } from "@/lib/common-functions";
import { PayablesActivationSignalsPopover } from "./payables-activation-signals-popover";
import { PayablesPendingInvoicesFlow } from "./payables-pending-invoices-flow";
import { PayablesInvoiceApprovalReviewCard } from "./payables-invoice-approval-review-card";
import {
  delegateApproverLabel,
  findLatestPendingPayablesActivation,
  parsePayablesActivationCommand,
  parsePayablesConfirmationFollowUp,
  payablesActionAck,
  payablesActionCompleteMessage,
  payablesActionRequiresComments,
  payablesActionRequiresDelegateUser,
  resolveDelegateApprover,
  type ActivePayablesConfirmation,
  type PayablesChatActionRequest,
} from "./payables-activation-chat-actions";
import { usePayablesDelegateApprovers } from "@/hooks/usePayablesDelegateApprovers";
import {
  PENDING_INVOICE_APPROVALS_PROMPT,
  type PayablesActivationStageId,
  type PayablesActivationStageItem,
} from "@shared/payables-activation-signals";
import {
  readPayablesActivationPreferences,
  usePayablesActivationPreferences,
} from "@/hooks/usePayablesActivationPreferences";
import { PAYABLES_ACTIVATION_SIGNALS_QUERY_KEY } from "@/hooks/usePayablesActivationSignals";

const capabilities = [
  { icon: Search, label: "Invoice Search", description: "Search and query invoice data in real-time" },
  { icon: CreditCard, label: "Create & Pay", description: "Create invoices and process payments" },
  { icon: GitCompare, label: "3-Way Matching", description: "AI-powered PO-GRN-Invoice matching" },
  { icon: ShieldAlert, label: "Fraud Detection", description: "AI-powered fraud risk analysis" },
  { icon: FileCheck, label: "Line Items", description: "Add and manage invoice line items" },
  { icon: BarChart3, label: "Statistics", description: "Dashboard-level invoice analytics" },
  { icon: Shield, label: "Approvals", description: "Submit and track approval workflow" },
  { icon: Wallet, label: "Payments", description: "Payment records and tracking" },
];

interface PendingAction {
  type: "create_invoice" | "add_invoice_line" | "submit_invoice" | "process_payment";
  data: any;
  summary: string;
}

/** A turn can stage several writes (e.g. one line item per requested product). */
function getStagedActions(msg?: ConversationMessage) {
  if (!msg) return [];
  if (msg.pendingActions && msg.pendingActions.length > 0) return msg.pendingActions;
  return msg.pendingAction ? [msg.pendingAction] : [];
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

export default function AIPayablesAgent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activationChatNonceRef = useRef(0);
  const mention = useAgentMentions();
  const { prompt, setPromptText, reset: resetMentions, streamMentions } = mention;
  const {
    conversation,
    setConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    groupedConversations,
    currentId,
  } = useAgentConversation("payables");
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { preferences: activationPreferences } = usePayablesActivationPreferences();
  const activationEnabled = activationPreferences.invoiceApprovalRequest;
  const { data: delegateApprovers = [] } = usePayablesDelegateApprovers(activationEnabled);
  const [activeActivationConfirmation, setActiveActivationConfirmation] =
    useState<ActivePayablesConfirmation | null>(null);
  const [activationChatRequest, setActivationChatRequest] = useState<{
    msgIndex: number;
    request: PayablesChatActionRequest;
  } | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const toggleCategory = (module: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(module)) {
        newSet.delete(module);
      } else {
        newSet.add(module);
      }
      return newSet;
    });
  };

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel an in-flight agent query and finalize the streaming placeholder.
  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const runStream = async (
    promptText: string,
    history: ConversationMessage[],
    confirmAction?: { type: string; data: any },
    mentionPayload: {
      mentions?: SupplierMention[];
      businessUserMentions?: BusinessUserMention[];
      itemMentions?: ItemMention[];
      bidMentions?: BidMention[];
      prMentions?: PrMention[];
      poMentions?: PoMention[];
      invoiceMentions?: InvoiceMention[];
    } = {},
    activationContext?: string,
  ) => {
    setIsStreaming(true);
    const placeholderMsg: ConversationMessage = { role: "assistant", content: "", timestamp: new Date(), isStreaming: true };
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

    await streamAgentQuery({
      endpoint: "/api/payables-agent/query/stream",
      prompt: promptText,
      conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      confirmAction,
      activationContext: activationEnabled ? activationContext : undefined,
      activationPreferences: readPayablesActivationPreferences(),
      ...mentionPayload,
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
        pendingActions,
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
        _actionPreview,
        _actionResult,
        _supplierTaskFlow,
        _supplierApprovalReview,
        _createBidSourceChoice,
        _procurementTaskFlow,
        _budgetApprovalReview,
        _prApprovalReview,
        _poApprovalReview,
        _procurementAlertReview,
        _supplierApprovalCommand,
        _procurementApprovalCommand,
        payablesTaskFlow,
        payablesInvoiceApprovalReview,
        payablesApprovalCommand,
      ) => {
        const existingReviewIndex = payablesApprovalCommand
          ? [...history]
              .map((message, index) => ({ message, index }))
              .reverse()
              .find(
                ({ message }) =>
                  message.payablesInvoiceApprovalReview?.invoiceId ===
                    payablesApprovalCommand.invoiceId &&
                  (!message.payablesInvoiceApprovalStatus ||
                    message.payablesInvoiceApprovalStatus === "pending"),
              )?.index
          : undefined;
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            const staged = pendingActions && pendingActions.length > 0
              ? pendingActions
              : pendingAction
                ? [pendingAction]
                : [];
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              pendingAction: staged[0] || undefined,
              pendingActions: staged.length > 1 ? staged : undefined,
              actionStatus: staged.length > 0 ? "pending" as const : undefined,
              chart: staged.length > 0 ? undefined : chart || undefined,
              payablesTaskFlow: activationEnabled ? payablesTaskFlow || undefined : undefined,
              payablesInvoiceApprovalReview:
                activationEnabled &&
                !(payablesApprovalCommand && existingReviewIndex !== undefined)
                  ? payablesInvoiceApprovalReview || undefined
                  : undefined,
              payablesInvoiceApprovalStatus:
                activationEnabled &&
                payablesInvoiceApprovalReview &&
                !(payablesApprovalCommand && existingReviewIndex !== undefined)
                  ? "pending"
                  : undefined,
            };
          }
          return updated;
        });
        if (activationEnabled && payablesApprovalCommand) {
          const targetIndex =
            existingReviewIndex ?? history.length + (confirmAction ? 0 : 1);
          const confirmation: ActivePayablesConfirmation = {
            msgIndex: targetIndex,
            card: "invoiceApproval",
            action: payablesApprovalCommand.action,
            comments: payablesApprovalCommand.comments?.trim() || undefined,
            delegateUserName: payablesApprovalCommand.delegateUserName,
          };
          activationChatNonceRef.current += 1;
          setActiveActivationConfirmation(confirmation);
          setActivationChatRequest({
            msgIndex: targetIndex,
            request: {
              nonce: activationChatNonceRef.current,
              kind: "start",
              card: "invoiceApproval",
              action: payablesApprovalCommand.action,
              comments: payablesApprovalCommand.comments,
              delegateUserName: payablesApprovalCommand.delegateUserName,
            },
          });
        }
        setIsStreaming(false);
        abortRef.current = null;
        queryClient.invalidateQueries({ queryKey: PAYABLES_ACTIVATION_SIGNALS_QUERY_KEY });
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

  useEffect(() => {
    if (!activationEnabled) {
      setActiveActivationConfirmation(null);
      setActivationChatRequest(null);
    }
  }, [activationEnabled]);

  const handleActivationStageSelect = (
    stageId: PayablesActivationStageId,
    item: PayablesActivationStageItem | null,
    taskIndex: number,
    label: string,
  ) => {
    if (isStreaming) return;
    if (!readPayablesActivationPreferences().invoiceApprovalRequest) {
      toast({
        title: "Activation signal is off",
        description: "Turn on Invoice Approval Request to review pending approvals.",
      });
      return;
    }
    runStream(
      item ? `Review invoice ${item.invoiceNumber || item.invoiceId}` : PENDING_INVOICE_APPROVALS_PROMPT,
      conversation,
      undefined,
      {},
      JSON.stringify(
        item
          ? { pendingTaskFlow: "invoiceApprovalReview", stageId, taskIndex }
          : { pendingTaskFlow: "tasks", stageId },
      ),
    );
  };

  const handlePendingCategorySelect = (stageId: PayablesActivationStageId, label: string) => {
    handleActivationStageSelect(stageId, null, -1, label);
  };

  const handlePendingInvoiceSelect = (
    stageId: PayablesActivationStageId,
    taskIndex: number,
    label: string,
  ) => {
    if (isStreaming || !activationEnabled) return;
    runStream(
      `Review ${label}`,
      conversation,
      undefined,
      {},
      JSON.stringify({ pendingTaskFlow: "invoiceApprovalReview", stageId, taskIndex }),
    );
  };

  const dispatchActivationChat = (opts: {
    msgIndex: number;
    request: PayablesChatActionRequest;
    userText: string;
    ack: string;
    keepConfirmation?: ActivePayablesConfirmation | null;
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

  const finalizeActivationOutcome = (
    msgIndex: number,
    result: "pending" | "approved" | "rejected" | "more_info" | "delegated",
    action: "approve" | "reject" | "more" | "delegate",
    label: string,
  ) => {
    setConversation((prev) => [
      ...prev.map((message, index) =>
        index === msgIndex
          ? { ...message, payablesInvoiceApprovalStatus: result }
          : message,
      ),
      {
        role: "assistant",
        content: payablesActionCompleteMessage(action, label),
        timestamp: new Date(),
      },
    ]);
    setActiveActivationConfirmation(null);
    setActivationChatRequest(null);
    queryClient.invalidateQueries({ queryKey: PAYABLES_ACTIVATION_SIGNALS_QUERY_KEY });
  };

  const handleSubmit = () => {
    if (!prompt.trim() || isStreaming) return;
    const text = prompt.trim();

    if (activationEnabled && activeActivationConfirmation) {
      const conf = activeActivationConfirmation;
      const followUp = parsePayablesConfirmationFollowUp(text);

      const appendExchange = (assistantContent: string) => {
        setConversation((prev) => [
          ...prev,
          { role: "user", content: text, timestamp: new Date() },
          { role: "assistant", content: assistantContent, timestamp: new Date() },
        ]);
        setPromptText("");
      };

      const needApprover =
        payablesActionRequiresDelegateUser(conf.action) && !conf.delegateUserName?.trim();
      const needComments =
        payablesActionRequiresComments(conf.action) && !conf.comments?.trim();

      // While required inputs are still outstanding, only an explicit cancel may
      // short-circuit collection — otherwise a name or remark that happens to
      // read like "ok"/"no" would be misread as a yes/no answer.
      if ((needApprover || needComments) && followUp !== "cancel") {
        if (needApprover) {
          if (followUp === "confirm") {
            appendExchange(
              "I still need to know who to delegate to. Reply with the approver's name or email.",
            );
            return;
          }
          const resolution = resolveDelegateApprover(text, delegateApprovers);
          if (resolution.status === "matched") {
            const nextConf: ActivePayablesConfirmation = {
              ...conf,
              delegateUserName: resolution.userName,
            };
            setActiveActivationConfirmation(nextConf);
            // Reflect the resolved approver in the card's Select immediately.
            activationChatNonceRef.current += 1;
            setActivationChatRequest({
              msgIndex: conf.msgIndex,
              request: {
                nonce: activationChatNonceRef.current,
                kind: "start",
                card: "invoiceApproval",
                action: "delegate",
                comments: conf.comments,
                delegateUserName: resolution.userName,
              },
            });
            const stillNeedComments =
              payablesActionRequiresComments("delegate") && !conf.comments?.trim();
            appendExchange(
              stillNeedComments
                ? `Delegating to **${resolution.label}**. Please provide remarks for the delegation.`
                : `Delegating to **${resolution.label}**. Reply **yes** to confirm or **cancel** to abort.`,
            );
            return;
          }
          if (resolution.status === "ambiguous") {
            const list = resolution.candidates
              .map((candidate) => `- ${delegateApproverLabel(candidate)}`)
              .join("\n");
            appendExchange(
              `I found multiple approvers matching that. Who did you mean?\n\n${list}`,
            );
            return;
          }
          if (resolution.status === "empty") {
            appendExchange(
              "Please tell me the approver's name or email to delegate this to.",
            );
            return;
          }
          const options = delegateApprovers
            .slice(0, 8)
            .map((approver) => `- ${delegateApproverLabel(approver)}`)
            .join("\n");
          appendExchange(
            options
              ? `I couldn't find an approver matching that. Available approvers include:\n\n${options}`
              : "I couldn't find a matching approver, and no approvers are available right now.",
          );
          return;
        }

        // Approver satisfied (or not required); collect the required remarks.
        if (followUp === "confirm") {
          appendExchange("Please provide the required remarks/reason first.");
          return;
        }
        setActiveActivationConfirmation({ ...conf, comments: text });
        appendExchange("Got it. Reply **yes** to confirm or **cancel** to abort.");
        return;
      }

      if (followUp === "cancel") {
        activationChatNonceRef.current += 1;
        dispatchActivationChat({
          msgIndex: conf.msgIndex,
          request: {
            nonce: activationChatNonceRef.current,
            kind: "cancel",
            card: "invoiceApproval",
          },
          userText: text,
          ack: "Cancelled.",
          keepConfirmation: null,
        });
        return;
      }
      if (followUp === "confirm") {
        activationChatNonceRef.current += 1;
        dispatchActivationChat({
          msgIndex: conf.msgIndex,
          request: {
            nonce: activationChatNonceRef.current,
            kind: "confirm",
            card: "invoiceApproval",
            action: conf.action,
            comments: conf.comments,
            delegateUserName: conf.delegateUserName,
          },
          userText: text,
          ack: "Confirming…",
          keepConfirmation: null,
        });
        return;
      }
    }

    const target = activationEnabled
      ? findLatestPendingPayablesActivation(conversation)
      : null;
    if (target) {
      const parsed = parsePayablesActivationCommand(text, target);
      if (parsed) {
        // Resolve a same-utterance approver reference to a canonical user_name;
        // leave it unset (and collect it conversationally) if it can't be matched.
        let resolvedDelegateUserName = parsed.delegateUserName;
        if (parsed.action === "delegate" && parsed.delegateUserName?.trim()) {
          const resolution = resolveDelegateApprover(
            parsed.delegateUserName,
            delegateApprovers,
          );
          resolvedDelegateUserName =
            resolution.status === "matched" ? resolution.userName : undefined;
        }
        const needsDelegate =
          payablesActionRequiresDelegateUser(parsed.action) && !resolvedDelegateUserName?.trim();
        const needsComments =
          payablesActionRequiresComments(parsed.action) && !parsed.comments?.trim();
        const keep: ActivePayablesConfirmation = {
          msgIndex: target.msgIndex,
          card: "invoiceApproval",
          action: parsed.action,
          comments: parsed.comments,
          delegateUserName: resolvedDelegateUserName,
        };
        activationChatNonceRef.current += 1;
        dispatchActivationChat({
          msgIndex: target.msgIndex,
          request: {
            nonce: activationChatNonceRef.current,
            kind: "start",
            card: "invoiceApproval",
            action: parsed.action,
            comments: parsed.comments,
            delegateUserName: resolvedDelegateUserName,
          },
          userText: text,
          ack: payablesActionAck(
            parsed.action,
            target.label,
            !needsDelegate && !needsComments,
            needsComments,
            needsDelegate,
          ),
          keepConfirmation: keep,
        });
        return;
      }
    }

    const activeReview = target
      ? conversation[target.msgIndex]?.payablesInvoiceApprovalReview
      : undefined;
    runStream(
      text,
      conversation,
      undefined,
      streamMentions,
      activeReview
        ? JSON.stringify({
            activeReview: {
              stageId: "invoiceApprovalRequest",
              title: activeReview.title,
              invoiceId: activeReview.invoiceId,
              invoiceNumber: activeReview.invoiceNumber,
              taskId: activeReview.taskId,
            },
          })
        : undefined,
    );
  };

  const handleConfirmAction = (msgIndex: number) => {
    const msg = conversation[msgIndex];
    const staged = getStagedActions(msg);
    if (staged.length === 0) return;
    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));
    runStream(
      "",
      conversation,
      staged.length > 1
        ? { type: "action_bundle", data: { actions: staged } }
        : { type: staged[0].type, data: staged[0].data },
    );
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
          <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30">
            <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Payables Agent</h1>
          <Badge variant="outline" className="gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
            <Zap className="h-3 w-3" />
            Action-Capable
          </Badge>
          <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3 w-3" />
            Active
          </Badge>
          <PayablesActivationSignalsPopover onStageActivate={handleActivationStageSelect} />
        </div>
        <CapabilitiesInfoButton capabilities={capabilities} />
      </div>

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
            <div className="flex-1 overflow-y-auto space-y-4 mb-4" data-testid="chat-messages-payables">
              {conversation.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="p-4 rounded-full bg-amber-100 dark:bg-amber-900/30 w-fit mx-auto mb-4">
                      <Bot className="h-10 w-10 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Payables Agent</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Ask me anything about invoices — search, create, match against POs, detect fraud, process payments, and more. I understand natural language.
                    </p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => { setExpandedCategories(new Set()); setShowCapabilities(true); }} data-testid="button-open-capabilities-empty">
                      <BookOpen className="h-4 w-4" />
                      Explore Capabilities
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {conversation.map((msg, i) =>
                    !activationEnabled &&
                    msg.role === "assistant" &&
                    (msg.payablesTaskFlow || msg.payablesInvoiceApprovalReview) ? null : (
                    <div key={i}>
                      <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30 h-fit flex-shrink-0">
                            <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400" />
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

                      {msg.pendingAction && msg.actionStatus === "pending" && (
                        <div className="ml-10 mt-2">
                          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
                            <CardContent className="p-3">
                              <div className="flex items-start gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                    {getStagedActions(msg).length > 1
                                      ? `Confirm ${getStagedActions(msg).length} Actions`
                                      : "Confirm Action"}
                                  </p>
                                  {getStagedActions(msg).map((action, actionIdx) => (
                                    <p
                                      key={`${action.type}-${actionIdx}`}
                                      className="text-xs text-amber-700 dark:text-amber-300 mt-0.5"
                                      data-testid={`pending-action-summary-${i}-${actionIdx}`}
                                    >
                                      {getStagedActions(msg).length > 1 ? `${actionIdx + 1}. ` : ""}
                                      {action.summary}
                                    </p>
                                  ))}
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
                                  {getStagedActions(msg).length > 1 ? "Confirm All" : "Confirm"}
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

                      {msg.pendingAction && msg.actionStatus === "confirmed" && (
                        <div className="ml-10 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Action confirmed and executed
                          </div>
                        </div>
                      )}

                      {msg.pendingAction && msg.actionStatus === "cancelled" && (
                        <div className="ml-10 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <X className="h-3.5 w-3.5" />
                            Action cancelled
                          </div>
                        </div>
                      )}

                      {activationEnabled && msg.payablesTaskFlow && (
                        <div className="ml-10">
                          <PayablesPendingInvoicesFlow
                            flow={msg.payablesTaskFlow}
                            disabled={isStreaming}
                            onSelectCategory={handlePendingCategorySelect}
                            onSelectInvoice={handlePendingInvoiceSelect}
                          />
                        </div>
                      )}

                      {activationEnabled && msg.payablesInvoiceApprovalReview && (
                        <div className="ml-10" data-testid={`agent-payables-invoice-review-${i}`}>
                          <PayablesInvoiceApprovalReviewCard
                            spec={msg.payablesInvoiceApprovalReview}
                            status={msg.payablesInvoiceApprovalStatus || "pending"}
                            disabled={isStreaming}
                            onComplete={(result) =>
                              finalizeActivationOutcome(
                                i,
                                result,
                                result === "approved"
                                  ? "approve"
                                  : result === "rejected"
                                    ? "reject"
                                    : result === "delegated"
                                      ? "delegate"
                                      : "more",
                                msg.payablesInvoiceApprovalReview?.invoiceNumber ||
                                  msg.payablesInvoiceApprovalReview?.title ||
                                  "this invoice",
                              )
                            }
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onActionError={(_action, message) => {
                              setActiveActivationConfirmation((current) =>
                                current?.msgIndex === i ? null : current,
                              );
                              setActivationChatRequest(null);
                              setConversation((prev) => [
                                ...prev,
                                {
                                  role: "assistant",
                                  content: `That didn't go through: ${message} You can try again from the card above.`,
                                  timestamp: new Date(),
                                },
                              ]);
                            }}
                            onConfirmationStateChange={(action) => {
                              if (!action) {
                                setActiveActivationConfirmation((current) =>
                                  current?.msgIndex === i ? null : current,
                                );
                                return;
                              }
                              setActiveActivationConfirmation((current) => ({
                                msgIndex: i,
                                card: "invoiceApproval",
                                action,
                                comments:
                                  current?.msgIndex === i && current.action === action
                                    ? current.comments
                                    : undefined,
                                delegateUserName:
                                  current?.msgIndex === i && current.action === action
                                    ? current.delegateUserName
                                    : undefined,
                              }));
                            }}
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
                onClick={() => setPromptText(payablesQuickActions.invoiceDetails)}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-invoice-details"
              >
                Invoice Details
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPromptText(payablesQuickActions.threeWayMatching)}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-3way-matching"
              >
                3-Way Matching
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPromptText(payablesQuickActions.invoiceCreation)}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-invoice-creation"
              >
                Invoice Creation
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
              colorTheme="amber"
              submitButtonClassName="rounded-full h-9 w-9"
              textareaDataTestId="input-payables-prompt"
              submitDataTestId="button-payables-submit"
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
                      onClick={() => {
                        setShowCapabilities((prev) => {
                          if (!prev) setExpandedCategories(new Set());
                          return !prev;
                        });
                      }}
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
          <Card className="w-[275px] flex-shrink-0 flex flex-col min-h-0 max-h-full hidden md:flex">
            <CardContent className="flex-1 p-0 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3 border-b flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="font-semibold text-sm">Explore Capabilities</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowCapabilities(false)} data-testid="button-close-capabilities">
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
              <div className="px-3 py-2 border-b flex-shrink-0">
                <p className="text-xs text-muted-foreground">These are examples — you can ask anything in natural language</p>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1.5 custom-scrollbar min-h-0">
                {payablesAgentPrompts.map((category) => (
                  <div key={category.module} className="border rounded-md">
                    <Button
                      variant="ghost"
                      onClick={() => toggleCategory(category.module)}
                      className="w-full flex items-center justify-between gap-2 h-auto py-2 px-3"
                      data-testid={`button-category-${category.module}`}
                    >
                      <div className="flex items-center gap-2">
                        {expandedCategories.has(category.module) ? (
                          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span className="font-medium text-xs">{category.module}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {category.prompts.length}
                      </Badge>
                    </Button>
                    {expandedCategories.has(category.module) && (
                      <div className="px-3 pb-2 pt-1 border-t space-y-1 bg-muted/30">
                        {category.prompts.map((p, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            className="w-full justify-start text-xs h-auto py-1.5 text-left whitespace-normal"
                            onClick={() => { setPromptText(p); }}
                            data-testid={`button-prompt-${category.module}-${idx}`}
                          >
                            {p}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
