import { useState, useRef, useEffect, useMemo } from "react";
import { useAgentConversation, type ConversationMessage } from "@/hooks/useAgentConversation";
import { Link, useLocation } from "wouter";
import { 
  Send,
  Loader2,
  Sparkles,
  Bot,
  AlertTriangle,
  User,
  Search,
  ArrowLeft,
  CheckCircle2,
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
  Brain,
  FileText,
  List,
  Users,
  ClipboardCheck,
  BarChart3,
  MessageSquare,
  Trophy,
  Plus,
  PlusCircle,
  ArrowRightLeft,
  ExternalLink,
  Scale
} from "lucide-react";
import {
  sourcingAgentPrompts,
  CREATE_BID_QUICK_ACTION_TEMPLATE,
  CONVERT_PR_QUICK_ACTION_TEMPLATE,
  VIEW_BIDS_QUICK_ACTION_TEMPLATE,
  MANAGE_VENDORS_QUICK_ACTION_TEMPLATE,
  AWARDS_ANALYTICS_QUICK_ACTION_TEMPLATE,
  ANALYTICS_QUICK_ACTION_TEMPLATE,
  UPDATES_QUICK_ACTION_TEMPLATE,
} from "./sourcing-agent-prompts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CapabilitiesInfoButton } from "@/components/agent-panels/capabilities-info-button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import { streamAgentQuery } from "@/lib/streamAgentQuery";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { AgentChartSpec } from "@shared/agent-chart";
import type { AgentCompareBidsSpec } from "@shared/agent-compare-bids";
import { AgentChartMessage } from "./agent-chart-message";
import { CompareBidsSpecTabs } from "../bids/compare-bids-tabs";
import { formatDate } from "@/lib/common-functions";
import type { BidMention, BusinessUserMention, InvoiceMention, ItemMention, PoMention, PrMention, SupplierMention } from "@shared/agent-mention";
import type { SourcingActivationStageId, SourcingActivationStageItem } from "@shared/sourcing-activation-signals";
import { getPendingTaskReviewFlowType } from "@shared/sourcing-activation-signals";
import {
  buildBidMentionSearchEndpoint,
  buildBusinessUserMentionSearchEndpoint,
  buildComposerMentionBackdrop,
  buildInvoiceMentionSearchEndpoint,
  buildItemMentionSearchEndpoint,
  buildPoMentionSearchEndpoint,
  buildPrMentionSearchEndpoint,
  buildVendorMentionSearchEndpoint,
  getActiveAmpersandMentionTrigger,
  getActiveCaretMentionTrigger,
  getActiveDollarMentionTrigger,
  getActiveHashMentionTrigger,
  getActiveMentionTrigger,
  getActivePercentMentionTrigger,
  getActiveSlashMentionTrigger,
  getMentionDropdownPosition,
  mentionDropdownAboveLineStyle,
  insertTextAtMentionTrigger,
  itemMentionLabel,
  MENTION_SEARCH_DELAY_MS,
  otherMentionSpans,
  pickActiveMentionDropdown,
  reconcileAllSourcingMentionsAfterTextChange,
  reconcileMentionsAfterTextChange,
  SourcingUserMessageBubbleContent,
  type BidMentionOption,
  type BusinessUserMentionOption,
  type InvoiceMentionOption,
  type ItemMentionOption,
  type MentionTrigger,
  type PoMentionOption,
  type PrMentionOption,
  type SourcingMentionDropdownKind,
  type VendorMentionOption,
} from "@/lib/supplier-mention-utils";
import { RemediationReviewCard, type RemediationData } from "./remediation-review-card";
import { SourcingActivationSignalsPopover } from "./sourcing-activation-signals-popover";
import { SourcingPendingTasksFlow } from "./sourcing-pending-tasks-flow";
import { readSourcingActivationPreferences } from "@/hooks/useSourcingActivationPreferences";
import { BidApprovalReviewCard } from "./bid-approval-review-card";
import { OpenEnvelopeReviewCard } from "./open-envelope-review-card";
import { TechnicalReviewCard } from "./technical-review-card";
import { TechnicalEvaluationCard } from "./technical-evaluation-card";
import { CommercialReviewCard } from "./commercial-review-card";
import { CommercialEvaluationCard } from "./commercial-evaluation-card";
import { AwardingReviewCard } from "./awarding-review-card";
import { BidAwardApprovalReviewCard } from "./bid-award-approval-review-card";
import { BidAwardSubmitReviewCard } from "./bid-award-submit-review-card";
import { ACTIVATION_SIGNALS_QUERY_KEY } from "@/hooks/useSourcingActivationSignals";
import { AWARD_ACTIONS_DENIED_MESSAGE } from "@shared/bid-award-auth";
import {
  type ActiveSourcingConfirmation,
  type SourcingChatActionRequest,
  actionRequiresComments,
  assignmentBlockedActionMessage,
  findLatestPendingActivation,
  isAssignmentBlockReason,
  isChatConfirmation,
  isExplicitReviewViewRequest,
  isReviewActionFollowUp,
  isStagedPublishConfirmation,
  parseSourcingActivationCommand,
  parseSourcingConfirmationFollowUp,
  sourcingActionAck,
  sourcingActionCompleteMessage,
  isSourcingInProgressAck,
  type SourcingActivationCardKind,
  type SourcingActivationOutcome,
} from "./sourcing-activation-chat-actions";
import { CreateBidPreviewCard } from "./create-bid-preview-card";
import { CriteriaGeneratePreviewCard, type CriteriaGenerateItem } from "./criteria-generate-preview-card";
import { RegenerateCriteriaPreviewCard, type ReconciledCriteriaItem } from "./regenerate-criteria-preview-card";
import { ClausesGeneratePreviewCard, type ClauseGenerateItem } from "./clauses-generate-preview-card";
import { CreateBidSuccessCard } from "./create-bid-success-card";
import { CreateBidSourceChoice } from "./create-bid-source-choice";
import { CreateBidPrChoice } from "./create-bid-pr-choice";
import { CreateBidEntityChoice } from "./create-bid-entity-choice";
import { PublishBidSuccessCard } from "./publish-bid-success-card";
import { mergeCreateBidPreviewIntoActions } from "./create-bid-preview-utils";
import { PublishBidPreviewCard } from "./publish-bid-preview-card";
import {
  isCreateBidPreview,
  isCreateBidSuccess,
  isCreateBidSourceChoice,
  isCreateBidPrChoice,
  isCreateBidEntityChoice,
  isPublishBidPreview,
  isPublishBidSuccess,
  type AgentSourcingPreviewSpec,
  type ActiveCreatedBidContext,
  type CreateBidPreviewSpec,
  type CreateBidSuccessSpec,
} from "@shared/agent-sourcing-preview";
import { isPrRecommendation } from "@shared/agent-pr-recommendation";
import { buildPendingActionsFromCreateBidPreview, sanitizeBundleForActiveCreatedBid } from "@shared/create-bid-staged-actions";

const capabilities = [
  { icon: Search, label: "Bid Search", description: "Search and filter RFQs/RFPs/Tenders" },
  { icon: Plus, label: "Create Bids", description: "Create bids from natural language" },
  { icon: ArrowRightLeft, label: "PR to Bid", description: "Convert PRs to sourcing bids" },
  { icon: Users, label: "Vendor Management", description: "Invite vendors to bids" },
  { icon: MessageSquare, label: "Responses", description: "Track vendor responses" },
  { icon: Trophy, label: "Evaluation & Awards", description: "View evaluations and awards" },
  { icon: BarChart3, label: "Analytics", description: "Bid statistics and insights" },
];

const iconMap: Record<string, any> = {
  Search, FileText, List, Users, ClipboardCheck, BarChart3,
  MessageSquare, Trophy, Plus, PlusCircle, Send: Send,
  ArrowRightLeft,
};

interface PendingAction {
  type: string;
  data: any;
  summary: string;
}

function findLastPendingCreateBidMessage(
  history: ConversationMessage[],
): ConversationMessage | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "assistant") continue;
    if (m.actionStatus === "cancelled" || m.actionStatus === "confirmed") continue;
    if (m.actionStatus === "pending" && isCreateBidPreview(m.actionPreview)) return m;
    if (m.actionStatus === "pending" && getMessagePendingActions(m).length > 0) return m;
  }
  return undefined;
}

function resolveStagedContextFromHistory(history: ConversationMessage[]): {
  stagedPendingActions?: PendingAction[];
  stagedActionPreview?: CreateBidPreviewSpec;
} {
  const pendingMsg = findLastPendingCreateBidMessage(history);
  if (!pendingMsg) return {};
  const fromActions = getMessagePendingActions(pendingMsg);
  if (fromActions.length > 0) {
    return {
      stagedPendingActions: fromActions,
      stagedActionPreview: isCreateBidPreview(pendingMsg.actionPreview)
        ? pendingMsg.actionPreview
        : undefined,
    };
  }
  if (isCreateBidPreview(pendingMsg.actionPreview)) {
    return {
      stagedPendingActions: buildPendingActionsFromCreateBidPreview(pendingMsg.actionPreview),
      stagedActionPreview: pendingMsg.actionPreview,
    };
  }
  return {};
}

function isBidActionSuccess(
  result: ConversationMessage["actionResult"],
): result is NonNullable<ConversationMessage["actionResult"]> {
  return isCreateBidSuccess(result) || isPublishBidSuccess(result);
}

function findLastCreateBidSuccess(history: ConversationMessage[]) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && isCreateBidSuccess(m.actionResult)) {
      return m.actionResult;
    }
  }
  return undefined;
}

function resolveActiveCreatedBid(
  history: ConversationMessage[],
  confirmAction?: { type: string; data: any },
): ActiveCreatedBidContext | undefined {
  const success = findLastCreateBidSuccess(history);
  if (!success?.bidId) return undefined;

  if (confirmAction) {
    const actions =
      confirmAction.type === "action_bundle" && Array.isArray(confirmAction.data?.actions)
        ? confirmAction.data.actions
        : [{ type: confirmAction.type, data: confirmAction.data }];
    const isNewBidConfirm = actions.some(
      (a: { type: string }) => a.type === "create_bid" || a.type === "create_bid_from_pr",
    );
    if (isNewBidConfirm) return undefined;
  } else {
    const staged = resolveStagedContextFromHistory(history);
    if (
      staged.stagedPendingActions?.some(
        (a) => a.type === "create_bid" || a.type === "create_bid_from_pr",
      )
    ) {
      return undefined;
    }
    if (staged.stagedActionPreview?.kind === "create_bid_preview") {
      return undefined;
    }
  }

  return {
    bidId: success.bidId,
    bidNumber: success.bidNumber,
    title: success.title,
    currency: success.currency,
    bidType: success.bidType,
  };
}

function getMessagePendingActions(msg: ConversationMessage): PendingAction[] {
  if (msg.pendingActions && msg.pendingActions.length > 0) return msg.pendingActions;
  if (msg.pendingAction) return [msg.pendingAction];
  return [];
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

    if (line.match(/^Screen:\s+(\/app\/\S+)(?:\s+::task:(\S+))?/)) {
      const screenMatch = line.match(/^Screen:\s+(\/app\/\S+)(?:\s+::task:(\S+))?/)!;
      const path = screenMatch[1];
      const taskId = screenMatch[2];
      const safePath = escapeHtml(path);
      const taskAttr = taskId ? ` data-task-id="${escapeHtml(taskId)}"` : "";
      htmlParts.push(
        `<div class="text-xs py-0.5">Screen: <a href="${safePath}"${taskAttr} class="text-primary underline underline-offset-2 hover:opacity-80 sourcing-screen-link">${safePath}</a></div>`,
      );
      i++;
      continue;
    }

    htmlParts.push(`<div class="text-xs py-0.5">${bold(escaped)}</div>`);
    i++;
  }

  return htmlParts.join('');
}

function SourcingCompareBidsCard({ compareBids }: { compareBids: AgentCompareBidsSpec }) {
  const bid = compareBids.bid || {};
  const bidLabel = bid.bid_number || bid.attribute_4 || `BID-${bid.id}`;
  const responseCount = compareBids.responses?.length || 0;

  return (
    <Card className="border-purple-200 dark:border-purple-900 bg-background">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/30 shrink-0">
              <Scale className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Compare Bids</p>
              <p className="text-xs text-muted-foreground">
                Side-by-side comparison of {responseCount} supplier response{responseCount === 1 ? "" : "s"} for {bidLabel}
              </p>
            </div>
          </div>
          {bid.id && (
            <Link href={`/app/bids/${bid.id}/evaluate`}>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 shrink-0" data-testid="button-open-full-bid-evaluation">
                <ExternalLink className="h-3.5 w-3.5" />
                Full evaluation
              </Button>
            </Link>
          )}
        </div>
        <CompareBidsSpecTabs spec={compareBids} compact />
      </CardContent>
    </Card>
  );
}

export default function AISourcingAgent() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sourcingInputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const [sourcingPrompt, setSourcingPrompt] = useState("");
  const [activationChatRequest, setActivationChatRequest] = useState<{
    msgIndex: number;
    request: SourcingChatActionRequest;
  } | null>(null);
  const [activeActivationConfirmation, setActiveActivationConfirmation] =
    useState<ActiveSourcingConfirmation | null>(null);
  /** Remembers review cards where the user is not assigned, so follow-up actions don't reopen them. */
  const assignmentBlockedReviewsRef = useRef<
    Map<string, { card: "technicalReview" | "commercialReview"; bidNumber: string }>
  >(new Map());
  const [supplierMentions, setSupplierMentions] = useState<SupplierMention[]>([]);
  const [businessUserMentions, setBusinessUserMentions] = useState<BusinessUserMention[]>([]);
  const [itemMentions, setItemMentions] = useState<ItemMention[]>([]);
  const [bidMentions, setBidMentions] = useState<BidMention[]>([]);
  const [prMentions, setPrMentions] = useState<PrMention[]>([]);
  const [poMentions, setPoMentions] = useState<PoMention[]>([]);
  const [invoiceMentions, setInvoiceMentions] = useState<InvoiceMention[]>([]);
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null);
  const [hashMentionTrigger, setHashMentionTrigger] = useState<MentionTrigger | null>(null);
  const [slashMentionTrigger, setSlashMentionTrigger] = useState<MentionTrigger | null>(null);
  const [caretMentionTrigger, setCaretMentionTrigger] = useState<MentionTrigger | null>(null);
  const [ampersandMentionTrigger, setAmpersandMentionTrigger] = useState<MentionTrigger | null>(null);
  const [percentMentionTrigger, setPercentMentionTrigger] = useState<MentionTrigger | null>(null);
  const [dollarMentionTrigger, setDollarMentionTrigger] = useState<MentionTrigger | null>(null);
  const [activeMentionDropdown, setActiveMentionDropdown] = useState<SourcingMentionDropdownKind | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<VendorMentionOption[]>([]);
  const [hashMentionSuggestions, setHashMentionSuggestions] = useState<BusinessUserMentionOption[]>([]);
  const [slashMentionSuggestions, setSlashMentionSuggestions] = useState<ItemMentionOption[]>([]);
  const [caretMentionSuggestions, setCaretMentionSuggestions] = useState<BidMentionOption[]>([]);
  const [ampersandMentionSuggestions, setAmpersandMentionSuggestions] = useState<PrMentionOption[]>([]);
  const [percentMentionSuggestions, setPercentMentionSuggestions] = useState<PoMentionOption[]>([]);
  const [dollarMentionSuggestions, setDollarMentionSuggestions] = useState<InvoiceMentionOption[]>([]);
  const [isMentionLoading, setIsMentionLoading] = useState(false);
  const [isHashMentionLoading, setIsHashMentionLoading] = useState(false);
  const [isSlashMentionLoading, setIsSlashMentionLoading] = useState(false);
  const [isCaretMentionLoading, setIsCaretMentionLoading] = useState(false);
  const [isAmpersandMentionLoading, setIsAmpersandMentionLoading] = useState(false);
  const [isPercentMentionLoading, setIsPercentMentionLoading] = useState(false);
  const [isDollarMentionLoading, setIsDollarMentionLoading] = useState(false);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const [hashMentionHighlightIndex, setHashMentionHighlightIndex] = useState(0);
  const [slashMentionHighlightIndex, setSlashMentionHighlightIndex] = useState(0);
  const [caretMentionHighlightIndex, setCaretMentionHighlightIndex] = useState(0);
  const [ampersandMentionHighlightIndex, setAmpersandMentionHighlightIndex] = useState(0);
  const [percentMentionHighlightIndex, setPercentMentionHighlightIndex] = useState(0);
  const [dollarMentionHighlightIndex, setDollarMentionHighlightIndex] = useState(0);
  const [mentionDropdownPos, setMentionDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const {
    conversation,
    setConversation,
    persistConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    groupedConversations,
    currentId,
  } = useAgentConversation("sourcing");
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [capabilitiesPanelWidth, setCapabilitiesPanelWidth] = useState(320);
  const isResizingCapabilitiesRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(320);
  const confirmInFlightRef = useRef(false);
  const pendingTaskNavInFlightRef = useRef(false);

  const CAPABILITIES_PANEL_MIN_WIDTH = 280;
  const CAPABILITIES_PANEL_MAX_WIDTH = 520;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    const handleScreenLinkClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a.sourcing-screen-link");
      if (!anchor) return;
      event.preventDefault();
      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/app/")) return;

      const taskId = anchor.getAttribute("data-task-id");
      if (taskId) {
        sessionStorage.setItem("currentTaskId", taskId);
        sessionStorage.setItem("linkToBack", "/app/ai-sourcing-agent");
      }

      navigate(href);
    };

    document.addEventListener("click", handleScreenLinkClick);
    return () => document.removeEventListener("click", handleScreenLinkClick);
  }, [navigate]);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!composerRef.current) return;
      if (!composerRef.current.contains(event.target as Node)) {
        closeAllMentionSuggestions();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!mentionTrigger || activeMentionDropdown !== "supplier") {
      setMentionSuggestions([]);
      setIsMentionLoading(false);
      return;
    }

    let cancelled = false;
    setIsMentionLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildVendorMentionSearchEndpoint(mentionTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Mention search failed");
        const payload = await res.json();
        if (cancelled) return;
        setMentionSuggestions(Array.isArray(payload?.vendors) ? payload.vendors : []);
        setMentionHighlightIndex(0);
      } catch {
        if (cancelled) return;
        setMentionSuggestions([]);
      } finally {
        if (!cancelled) setIsMentionLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mentionTrigger?.query, activeMentionDropdown]);

  useEffect(() => {
    if (!hashMentionTrigger || activeMentionDropdown !== "businessUser") {
      setHashMentionSuggestions([]);
      setIsHashMentionLoading(false);
      return;
    }

    let cancelled = false;
    setIsHashMentionLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildBusinessUserMentionSearchEndpoint(hashMentionTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Business user search failed");
        const payload = await res.json();
        if (cancelled) return;
        const users = Array.isArray(payload) ? payload : [];
        setHashMentionSuggestions(
          users.map((row: Record<string, unknown>) => ({
            id: Number(row.id),
            name: String(row.name || "").trim(),
            email_id: row.email_id ? String(row.email_id) : null,
            user_name: row.user_name ? String(row.user_name) : null,
            department_name: row.department_name ? String(row.department_name) : null,
          })).filter((u: BusinessUserMentionOption) => Number.isFinite(u.id) && u.id > 0 && u.name),
        );
        setHashMentionHighlightIndex(0);
      } catch {
        if (cancelled) return;
        setHashMentionSuggestions([]);
      } finally {
        if (!cancelled) setIsHashMentionLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hashMentionTrigger?.query, activeMentionDropdown]);

  useEffect(() => {
    if (!slashMentionTrigger || activeMentionDropdown !== "item") {
      setSlashMentionSuggestions([]);
      setIsSlashMentionLoading(false);
      return;
    }

    let cancelled = false;
    setIsSlashMentionLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildItemMentionSearchEndpoint(slashMentionTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Item search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        setSlashMentionSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              id: String(row.id || "").trim(),
              name: String(row.name || "").trim(),
              itemCode: row.itemCode ? String(row.itemCode) : null,
              sku: row.itemCode ? String(row.itemCode) : null,
              categoryName: row.categoryName ? String(row.categoryName) : null,
            }))
            .filter((item: ItemMentionOption) => item.id.length > 0 && item.name.length > 0),
        );
        setSlashMentionHighlightIndex(0);
      } catch {
        if (cancelled) return;
        setSlashMentionSuggestions([]);
      } finally {
        if (!cancelled) setIsSlashMentionLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slashMentionTrigger?.query, activeMentionDropdown]);

  useEffect(() => {
    if (!caretMentionTrigger || activeMentionDropdown !== "bid") {
      setCaretMentionSuggestions([]);
      setIsCaretMentionLoading(false);
      return;
    }

    let cancelled = false;
    setIsCaretMentionLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildBidMentionSearchEndpoint(caretMentionTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Bid search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.bids) ? payload.bids : [];
        setCaretMentionSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              id: Number(row.id),
              bidNumber: String(row.bidNumber || row.bid_number || "").trim(),
              bidTitle: row.bidTitle || row.bid_title ? String(row.bidTitle || row.bid_title) : null,
              bidStatus: row.bidStatus || row.status ? String(row.bidStatus || row.status) : null,
            }))
            .filter((b: BidMentionOption) => Number.isFinite(b.id) && b.id > 0 && b.bidNumber.length > 0),
        );
        setCaretMentionHighlightIndex(0);
      } catch {
        if (cancelled) return;
        setCaretMentionSuggestions([]);
      } finally {
        if (!cancelled) setIsCaretMentionLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [caretMentionTrigger?.query, activeMentionDropdown]);

  useEffect(() => {
    if (!ampersandMentionTrigger || activeMentionDropdown !== "pr") {
      setAmpersandMentionSuggestions([]);
      setIsAmpersandMentionLoading(false);
      return;
    }

    let cancelled = false;
    setIsAmpersandMentionLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildPrMentionSearchEndpoint(ampersandMentionTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("PR search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.purchaseRequests) ? payload.purchaseRequests : [];
        setAmpersandMentionSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              prNumber: String(row.prNumber || row.pr_number || "").trim(),
              prDescription: row.prDescription || row.pr_description ? String(row.prDescription || row.pr_description) : null,
              prStatus: row.prStatus || row.pr_status ? String(row.prStatus || row.pr_status) : null,
            }))
            .filter((pr: PrMentionOption) => pr.prNumber.length > 0),
        );
        setAmpersandMentionHighlightIndex(0);
      } catch {
        if (cancelled) return;
        setAmpersandMentionSuggestions([]);
      } finally {
        if (!cancelled) setIsAmpersandMentionLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ampersandMentionTrigger?.query, activeMentionDropdown]);

  useEffect(() => {
    if (!percentMentionTrigger || activeMentionDropdown !== "po") {
      setPercentMentionSuggestions([]);
      setIsPercentMentionLoading(false);
      return;
    }

    let cancelled = false;
    setIsPercentMentionLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildPoMentionSearchEndpoint(percentMentionTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("PO search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.purchaseOrders) ? payload.purchaseOrders : [];
        setPercentMentionSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              poNumber: String(row.poNumber || row.po_number || "").trim(),
              poDescription:
                row.poDescription || row.po_description
                  ? String(row.poDescription || row.po_description)
                  : null,
              poStatus: row.poStatus || row.po_status ? String(row.poStatus || row.po_status) : null,
              companyName: row.companyName || row.company_name ? String(row.companyName || row.company_name) : null,
            }))
            .filter((po: PoMentionOption) => po.poNumber.length > 0),
        );
        setPercentMentionHighlightIndex(0);
      } catch {
        if (cancelled) return;
        setPercentMentionSuggestions([]);
      } finally {
        if (!cancelled) setIsPercentMentionLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [percentMentionTrigger?.query, activeMentionDropdown]);

  useEffect(() => {
    if (!dollarMentionTrigger || activeMentionDropdown !== "invoice") {
      setDollarMentionSuggestions([]);
      setIsDollarMentionLoading(false);
      return;
    }

    let cancelled = false;
    setIsDollarMentionLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(buildInvoiceMentionSearchEndpoint(dollarMentionTrigger.query), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Invoice search failed");
        const payload = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(payload?.invoices) ? payload.invoices : [];
        setDollarMentionSuggestions(
          rows
            .map((row: Record<string, unknown>) => ({
              invoiceId: String(row.invoiceId || row.id || "").trim(),
              invoiceNumber: String(row.invoiceNumber || row.invoice_number || "").trim(),
              invoiceStatus:
                row.invoiceStatus || row.invoice_status
                  ? String(row.invoiceStatus || row.invoice_status)
                  : null,
              supplierName:
                row.supplierName || row.supplier_name
                  ? String(row.supplierName || row.supplier_name)
                  : null,
              poNumber: row.poNumber || row.po_number ? String(row.poNumber || row.po_number) : null,
            }))
            .filter(
              (inv: InvoiceMentionOption) =>
                inv.invoiceNumber.length > 0 && inv.invoiceId.length > 0,
            ),
        );
        setDollarMentionHighlightIndex(0);
      } catch {
        if (cancelled) return;
        setDollarMentionSuggestions([]);
      } finally {
        if (!cancelled) setIsDollarMentionLoading(false);
      }
    }, MENTION_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dollarMentionTrigger?.query, activeMentionDropdown]);

  const handleCapabilitiesResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingCapabilitiesRef.current = true;
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = capabilitiesPanelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

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

  const closeMentionSuggestions = () => {
    setMentionTrigger(null);
    setMentionSuggestions([]);
    setIsMentionLoading(false);
    setMentionHighlightIndex(0);
  };

  const closeHashMentionSuggestions = () => {
    setHashMentionTrigger(null);
    setHashMentionSuggestions([]);
    setIsHashMentionLoading(false);
    setHashMentionHighlightIndex(0);
  };

  const closeSlashMentionSuggestions = () => {
    setSlashMentionTrigger(null);
    setSlashMentionSuggestions([]);
    setIsSlashMentionLoading(false);
    setSlashMentionHighlightIndex(0);
  };

  const closeCaretMentionSuggestions = () => {
    setCaretMentionTrigger(null);
    setCaretMentionSuggestions([]);
    setIsCaretMentionLoading(false);
    setCaretMentionHighlightIndex(0);
  };

  const closeAmpersandMentionSuggestions = () => {
    setAmpersandMentionTrigger(null);
    setAmpersandMentionSuggestions([]);
    setIsAmpersandMentionLoading(false);
    setAmpersandMentionHighlightIndex(0);
  };

  const closePercentMentionSuggestions = () => {
    setPercentMentionTrigger(null);
    setPercentMentionSuggestions([]);
    setIsPercentMentionLoading(false);
    setPercentMentionHighlightIndex(0);
  };

  const closeDollarMentionSuggestions = () => {
    setDollarMentionTrigger(null);
    setDollarMentionSuggestions([]);
    setIsDollarMentionLoading(false);
    setDollarMentionHighlightIndex(0);
  };

  const closeAllMentionSuggestions = () => {
    closeMentionSuggestions();
    closeHashMentionSuggestions();
    closeSlashMentionSuggestions();
    closeCaretMentionSuggestions();
    closeAmpersandMentionSuggestions();
    closePercentMentionSuggestions();
    closeDollarMentionSuggestions();
    setActiveMentionDropdown(null);
    setMentionDropdownPos(null);
  };

  const mentionBackdrop = useMemo(
    () =>
      buildComposerMentionBackdrop(
        sourcingPrompt,
        supplierMentions,
        businessUserMentions,
        itemMentions,
        bidMentions,
        prMentions,
        poMentions,
        invoiceMentions,
      ),
    [sourcingPrompt, supplierMentions, businessUserMentions, itemMentions, bidMentions, prMentions, poMentions, invoiceMentions],
  );

  const refreshMentionContext = (
    nextText: string,
    caret: number | null,
    supplierMentionsOverride?: SupplierMention[],
    businessUserMentionsOverride?: BusinessUserMention[],
    itemMentionsOverride?: ItemMention[],
    bidMentionsOverride?: BidMention[],
    prMentionsOverride?: PrMention[],
    poMentionsOverride?: PoMention[],
    invoiceMentionsOverride?: InvoiceMention[],
  ) => {
    const caretPosition = typeof caret === "number" ? caret : nextText.length;
    const suppliers = supplierMentionsOverride ?? supplierMentions;
    const businessUsers = businessUserMentionsOverride ?? businessUserMentions;
    const items = itemMentionsOverride ?? itemMentions;
    const bids = bidMentionsOverride ?? bidMentions;
    const prs = prMentionsOverride ?? prMentions;
    const pos = poMentionsOverride ?? poMentions;
    const invoices = invoiceMentionsOverride ?? invoiceMentions;
    const atTrigger = getActiveMentionTrigger(
      nextText,
      caretPosition,
      suppliers,
      otherMentionSpans(suppliers, businessUsers, items, "supplier", bids, prs, pos, invoices),
    );
    const hashTrigger = getActiveHashMentionTrigger(
      nextText,
      caretPosition,
      businessUsers,
      otherMentionSpans(suppliers, businessUsers, items, "businessUser", bids, prs, pos, invoices),
    );
    const slashTrigger = getActiveSlashMentionTrigger(
      nextText,
      caretPosition,
      items,
      otherMentionSpans(suppliers, businessUsers, items, "item", bids, prs, pos, invoices),
    );
    const caretTrigger = getActiveCaretMentionTrigger(
      nextText,
      caretPosition,
      bids,
      otherMentionSpans(suppliers, businessUsers, items, "bid", bids, prs, pos, invoices),
    );
    const ampersandTrigger = getActiveAmpersandMentionTrigger(
      nextText,
      caretPosition,
      prs,
      otherMentionSpans(suppliers, businessUsers, items, "pr", bids, prs, pos, invoices),
    );
    const percentTrigger = getActivePercentMentionTrigger(
      nextText,
      caretPosition,
      pos,
      otherMentionSpans(suppliers, businessUsers, items, "po", bids, prs, pos, invoices),
    );
    const dollarTrigger = getActiveDollarMentionTrigger(
      nextText,
      caretPosition,
      invoices,
      otherMentionSpans(suppliers, businessUsers, items, "invoice", bids, prs, pos, invoices),
    );
    setMentionTrigger(atTrigger);
    setHashMentionTrigger(hashTrigger);
    setSlashMentionTrigger(slashTrigger);
    setCaretMentionTrigger(caretTrigger);
    setAmpersandMentionTrigger(ampersandTrigger);
    setPercentMentionTrigger(percentTrigger);
    setDollarMentionTrigger(dollarTrigger);

    const active = pickActiveMentionDropdown(
      atTrigger,
      hashTrigger,
      slashTrigger,
      caretTrigger,
      ampersandTrigger,
      percentTrigger,
      dollarTrigger,
    );
    setActiveMentionDropdown(active);

    if (!active) {
      setMentionDropdownPos(null);
      return;
    }
    const textarea = sourcingInputRef.current;
    if (!textarea) return;
    setMentionDropdownPos(
      getMentionDropdownPosition(textarea, caretPosition, composerRef.current),
    );
  };

  const applyMentionInsertion = (
    trigger: MentionTrigger,
    replacement: string,
    mentionDisplay: string,
    mergeNewMention: (
      reconciled: ReturnType<typeof reconcileAllSourcingMentionsAfterTextChange>,
      mentionStart: number,
      mentionEnd: number,
    ) => {
      suppliers: SupplierMention[];
      businessUsers: BusinessUserMention[];
      items: ItemMention[];
      bids: BidMention[];
      prs: PrMention[];
      pos: PoMention[];
      invoices: InvoiceMention[];
    },
  ) => {
    const el = sourcingInputRef.current;
    const selectionEnd = el?.selectionStart ?? trigger.end;
    const oldText = sourcingPrompt;
    const { nextText, replaceStart: mentionStart } = insertTextAtMentionTrigger(
      oldText,
      trigger,
      replacement,
      selectionEnd,
    );
    const mentionEnd = mentionStart + mentionDisplay.length;
    const caret = mentionStart + replacement.length;
    const reconciled = reconcileAllSourcingMentionsAfterTextChange(
      oldText,
      nextText,
      supplierMentions,
      businessUserMentions,
      itemMentions,
      bidMentions,
      prMentions,
      poMentions,
      invoiceMentions,
    );
    const merged = mergeNewMention(reconciled, mentionStart, mentionEnd);

    setSupplierMentions(merged.suppliers);
    setBusinessUserMentions(merged.businessUsers);
    setItemMentions(merged.items);
    setBidMentions(merged.bids);
    setPrMentions(merged.prs);
    setPoMentions(merged.pos);
    setInvoiceMentions(merged.invoices);
    setSourcingPrompt(nextText);
    closeAllMentionSuggestions();

    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
      refreshMentionContext(
        nextText,
        caret,
        merged.suppliers,
        merged.businessUsers,
        merged.items,
        merged.bids,
        merged.prs,
        merged.pos,
        merged.invoices,
      );
    });
  };

  const refreshActivationSignals = () => {
    queryClient.invalidateQueries({ queryKey: ACTIVATION_SIGNALS_QUERY_KEY });
  };

  const runStream = async (
    prompt: string,
    history: ConversationMessage[],
    confirmAction?: { type: string; data: any },
    mentions: SupplierMention[] = [],
    businessUsers: BusinessUserMention[] = [],
    items: ItemMention[] = [],
    bids: BidMention[] = [],
    activationContext?: string,
    prs: PrMention[] = [],
    pos: PoMention[] = [],
    invoices: InvoiceMention[] = [],
  ) => {
    setIsStreaming(true);
    const placeholderMsg: ConversationMessage = { role: "assistant", content: "", timestamp: new Date(), isStreaming: true };
    if (!confirmAction) {
      setConversation(prev => [
        ...prev,
        {
          role: "user" as const,
          content: prompt,
          timestamp: new Date(),
          mentions: mentions.length > 0 ? mentions : undefined,
          businessUserMentions: businessUsers.length > 0 ? businessUsers : undefined,
          itemMentions: items.length > 0 ? items : undefined,
          bidMentions: bids.length > 0 ? bids : undefined,
          prMentions: prs.length > 0 ? prs : undefined,
          poMentions: pos.length > 0 ? pos : undefined,
          invoiceMentions: invoices.length > 0 ? invoices : undefined,
        },
        placeholderMsg,
      ]);
      setSourcingPrompt("");
      setSupplierMentions([]);
      setBusinessUserMentions([]);
      setItemMentions([]);
      setBidMentions([]);
      setPrMentions([]);
      setPoMentions([]);
      setInvoiceMentions([]);
      closeAllMentionSuggestions();
    } else {
      setConversation(prev => [...prev, placeholderMsg]);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const stagedContext = !confirmAction ? resolveStagedContextFromHistory(history) : {};
    const { stagedPendingActions, stagedActionPreview } = stagedContext;
    const activeCreatedBid = resolveActiveCreatedBid(history, confirmAction);

    await streamAgentQuery({
      endpoint: "/api/sourcing-agent/query/stream",
      prompt,
      conversationHistory: history.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.actionResult ? { actionResult: m.actionResult } : {}),
      })),
      confirmAction,
      mentions,
      businessUserMentions: businessUsers,
      itemMentions: items,
      bidMentions: bids,
      activationContext,
      activationPreferences: readSourcingActivationPreferences(),
      prMentions: prs,
      poMentions: pos,
      invoiceMentions: invoices,
      stagedPendingActions,
      stagedActionPreview,
      activeCreatedBid,
      signal: controller.signal,
      onToken: (token) => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") updated[updated.length - 1] = { ...last, content: last.content + token };
          return updated;
        });
      },
      onDone: (pendingAction, chart, _charts, pendingActions, compareBids, sourcingTaskFlow, bidApprovalReview, openEnvelopeReview, technicalReview, commercialReview, technicalEvaluation, commercialEvaluation, awardingReview, bidAwardApprovalReview, bidAwardSubmitReview, rawActionPreview, actionResult, _supplierTaskFlow, _supplierApprovalReview, createBidSourceChoice) => {
        // The shared stream contract also carries the procurement agent's PR
        // recommendation card, which this agent never renders.
        const actionPreview = isPrRecommendation(rawActionPreview) ? undefined : rawActionPreview;
        const actions =
          pendingActions && pendingActions.length > 0
            ? pendingActions
            : pendingAction
              ? [pendingAction]
              : [];
        if (
          technicalReview &&
          isAssignmentBlockReason(technicalReview.blockReason) &&
          technicalReview.bidNumber
        ) {
          assignmentBlockedReviewsRef.current.set(
            `technicalReview:${technicalReview.bidNumber}`.toLowerCase(),
            { card: "technicalReview", bidNumber: technicalReview.bidNumber },
          );
        }
        if (
          commercialReview &&
          isAssignmentBlockReason(commercialReview.blockReason) &&
          commercialReview.bidNumber
        ) {
          assignmentBlockedReviewsRef.current.set(
            `commercialReview:${commercialReview.bidNumber}`.toLowerCase(),
            { card: "commercialReview", bidNumber: commercialReview.bidNumber },
          );
        }
        const hasExecutableActions = actions.length > 0;
        const previewOnlyPublish =
          actionPreview &&
          isPublishBidPreview(actionPreview) &&
          !actionPreview.canPublish &&
          !hasExecutableActions;
        setConversation(prev => {
          let superseded = prev;
          if (confirmAction) {
            const createConfirmSucceeded = isBidActionSuccess(actionResult);
            const confirmedCreateBundle =
              confirmAction.type === "create_bid" ||
              confirmAction.type === "create_bid_from_pr" ||
              (confirmAction.type === "action_bundle" &&
                Array.isArray(confirmAction.data?.actions) &&
                confirmAction.data.actions.some(
                  (a: { type: string }) =>
                    a.type === "create_bid" || a.type === "create_bid_from_pr",
                ));
            superseded = prev.map((m, i) => {
              if (
                confirmedCreateBundle &&
                !createConfirmSucceeded &&
                i < prev.length - 1 &&
                m.role === "assistant" &&
                m.actionStatus === "confirmed" &&
                getMessagePendingActions(m).length > 0
              ) {
                // Optimistic "confirmed" was set before execute; revert when create failed.
                return { ...m, actionStatus: "pending" as const };
              }
              if (
                i < prev.length - 1 &&
                m.role === "assistant" &&
                m.actionStatus === "pending" &&
                m.actionPreview &&
                isPublishBidPreview(m.actionPreview)
              ) {
                return {
                  ...m,
                  actionStatus: "cancelled" as const,
                  actionPreview: undefined,
                  pendingAction: undefined,
                  pendingActions: undefined,
                };
              }
              return m;
            });
          } else if (hasExecutableActions) {
            superseded = prev.map((m, i) =>
              i < prev.length - 1 &&
              m.role === "assistant" &&
              m.actionStatus === "pending" &&
              getMessagePendingActions(m).length > 0
                ? {
                    ...m,
                    actionStatus: "cancelled" as const,
                    actionPreview: undefined,
                    pendingAction: undefined,
                    pendingActions: undefined,
                  }
                : m,
            );
          }
          const updated = [...superseded];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              content: isBidActionSuccess(actionResult) ? "" : last.content,
              pendingAction: actions[0],
              pendingActions: actions.length > 0 ? actions : undefined,
              actionStatus:
                hasExecutableActions || previewOnlyPublish ? ("pending" as const) : undefined,
              actionPreview: actionPreview || undefined,
              actionResult: actionResult || undefined,
              chart: hasExecutableActions ? undefined : chart || undefined,
              compareBids: hasExecutableActions ? undefined : compareBids || undefined,
              sourcingTaskFlow: actions.length > 0 ? undefined : sourcingTaskFlow || undefined,
              createBidSourceChoice:
                actions.length > 0 ? undefined : createBidSourceChoice || undefined,
              bidApprovalReview: actions.length > 0 ? undefined : bidApprovalReview || undefined,
              bidApprovalStatus: bidApprovalReview ? "pending" as const : undefined,
              openEnvelopeReview: actions.length > 0 ? undefined : openEnvelopeReview || undefined,
              openEnvelopeStatus: openEnvelopeReview ? "pending" as const : undefined,
              technicalReview: actions.length > 0 ? undefined : technicalReview || undefined,
              technicalReviewStatus: technicalReview ? "pending" as const : undefined,
              technicalEvaluation: actions.length > 0 ? undefined : technicalEvaluation || undefined,
              technicalEvaluationStatus: technicalEvaluation ? "pending" as const : undefined,
              commercialReview: actions.length > 0 ? undefined : commercialReview || undefined,
              commercialReviewStatus: commercialReview ? "pending" as const : undefined,
              commercialEvaluation: actions.length > 0 ? undefined : commercialEvaluation || undefined,
              commercialEvaluationStatus: commercialEvaluation ? "pending" as const : undefined,
              awardingReview: actions.length > 0 ? undefined : awardingReview || undefined,
              awardingReviewStatus: awardingReview ? "pending" as const : undefined,
              awardingSubmitStatus: awardingReview ? "pending" as const : undefined,
              bidAwardApprovalReview: actions.length > 0 ? undefined : bidAwardApprovalReview || undefined,
              bidAwardApprovalStatus: bidAwardApprovalReview ? "pending" as const : undefined,
              bidAwardSubmitReview: actions.length > 0 ? undefined : bidAwardSubmitReview || undefined,
              bidAwardSubmitReviewStatus: bidAwardSubmitReview ? "pending" as const : undefined,
            };
          }
          return updated;
        });
        setIsStreaming(false);
        confirmInFlightRef.current = false;
        abortRef.current = null;
        const involvedActivationFlow =
          Boolean(activationContext) ||
          Boolean(sourcingTaskFlow) ||
          Boolean(
            bidApprovalReview ||
              openEnvelopeReview ||
              technicalReview ||
              commercialReview ||
              technicalEvaluation ||
              commercialEvaluation ||
              awardingReview ||
              bidAwardApprovalReview ||
              bidAwardSubmitReview,
          );
        // Only refresh the Activation Signals badge when this turn actually
        // touched the pending-task / review-card flow — not on every query.
        if (involvedActivationFlow) {
          refreshActivationSignals();
        }
      },
      onError: (message) => {
        confirmInFlightRef.current = false;
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
        confirmInFlightRef.current = false;
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

  const handlePendingTaskCategorySelect = (stageId: SourcingActivationStageId, label: string) => {
    if (
      isStreaming ||
      pendingTaskNavInFlightRef.current ||
      readSourcingActivationPreferences()[stageId] === false
    ) {
      return;
    }
    pendingTaskNavInFlightRef.current = true;
    void runStream(
      label,
      conversation,
      undefined,
      [],
      [],
      [],
      [],
      JSON.stringify({ pendingTaskFlow: "tasks", stageId }),
    ).finally(() => {
      pendingTaskNavInFlightRef.current = false;
    });
  };

  const handleCreateBidSourceSelect = (prompt: string) => {
    if (isStreaming) return;
    const fromHistory = gatherMentionsForConfirm(conversation.length);
    runStream(
      prompt,
      conversation,
      undefined,
      fromHistory.suppliers,
      fromHistory.businessUsers,
      fromHistory.items,
      fromHistory.bids,
      undefined,
      fromHistory.prs,
      fromHistory.pos,
      fromHistory.invoices,
    );
  };

  const handlePendingStageTaskSelect = (
    stageId: SourcingActivationStageId,
    taskIndex: number,
    label: string,
  ) => {
    if (
      isStreaming ||
      pendingTaskNavInFlightRef.current ||
      readSourcingActivationPreferences()[stageId] === false
    ) {
      return;
    }
    const reviewFlow = getPendingTaskReviewFlowType(stageId);
    const flowContext = reviewFlow
      ? JSON.stringify({ pendingTaskFlow: reviewFlow, stageId, taskIndex })
      : JSON.stringify({ pendingTaskFlow: "tasks", stageId, taskIndex });
    pendingTaskNavInFlightRef.current = true;
    void runStream(label, conversation, undefined, [], [], [], [], flowContext).finally(() => {
      pendingTaskNavInFlightRef.current = false;
    });
  };

  const activationLabelFromMessage = (
    msg: ConversationMessage | undefined,
    card: SourcingActivationCardKind,
  ): string => {
    if (!msg) return "this bid";
    switch (card) {
      case "bidApproval":
        return msg.bidApprovalReview?.bidNumber || "this bid";
      case "openEnvelope":
        return msg.openEnvelopeReview?.bidNumber || "this bid";
      case "technicalReview":
        return msg.technicalReview?.bidNumber || "this bid";
      case "technicalEvaluation":
        return msg.technicalEvaluation?.bidNumber || "this bid";
      case "commercialReview":
        return msg.commercialReview?.bidNumber || "this bid";
      case "commercialEvaluation":
        return msg.commercialEvaluation?.bidNumber || "this bid";
      case "awarding":
        return msg.awardingReview?.bidNumber || "this bid";
      case "bidAwardSubmit":
        return (
          msg.bidAwardSubmitReview?.bidNumber ||
          msg.awardingReview?.bidNumber ||
          "this award"
        );
      case "bidAwardApproval":
        return msg.bidAwardApprovalReview?.bidNumber || "this award";
      default:
        return "this bid";
    }
  };

  const finalizeActivationOutcome = (
    msgIndex: number,
    applyStatus: (msg: ConversationMessage) => ConversationMessage,
    outcome: Omit<SourcingActivationOutcome, "label"> & { label?: string },
  ) => {
    setActiveActivationConfirmation((prev) =>
      prev?.msgIndex === msgIndex ? null : prev,
    );
    setActivationChatRequest(null);
    setConversation((prev) => {
      const label =
        outcome.label ||
        activationLabelFromMessage(prev[msgIndex], outcome.card);
      const completeMessage = sourcingActionCompleteMessage({
        ...outcome,
        label,
      });
      const updated = prev.map((m, i) => (i === msgIndex ? applyStatus(m) : m));
      for (let i = updated.length - 1; i > msgIndex; i--) {
        const content = updated[i].content || "";
        if (updated[i].role === "assistant" && isSourcingInProgressAck(content)) {
          return updated.map((m, idx) =>
            idx === i
              ? { ...m, content: completeMessage, timestamp: new Date() }
              : m,
          );
        }
      }
      return [
        ...updated,
        {
          role: "assistant" as const,
          content: completeMessage,
          timestamp: new Date(),
        },
      ];
    });
    refreshActivationSignals();
  };

  const handleBidApprovalComplete = (msgIndex: number, result: "approved" | "rejected") => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({ ...m, bidApprovalStatus: result }),
      { card: "bidApproval", result },
    );
  };

  const handleOpenEnvelopeComplete = (msgIndex: number) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({ ...m, openEnvelopeStatus: "opened" as const }),
      { card: "openEnvelope", result: "opened" },
    );
  };

  const handleTechnicalReviewComplete = (msgIndex: number) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({ ...m, technicalReviewStatus: "submitted" as const }),
      { card: "technicalReview", result: "submitted" },
    );
  };

  const handleTechnicalEvaluationComplete = (msgIndex: number) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({ ...m, technicalEvaluationStatus: "approved" as const }),
      { card: "technicalEvaluation", result: "approved" },
    );
  };

  const handleCommercialReviewComplete = (msgIndex: number) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({ ...m, commercialReviewStatus: "submitted" as const }),
      { card: "commercialReview", result: "submitted" },
    );
  };

  const handleCommercialEvaluationComplete = (msgIndex: number) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({ ...m, commercialEvaluationStatus: "approved" as const }),
      { card: "commercialEvaluation", result: "approved" },
    );
  };

  const handleAwardingComplete = (
    msgIndex: number,
    details?: { supplierName?: string; comments?: string },
  ) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({
        ...m,
        awardingReviewStatus: "awarded" as const,
        awardingSubmitStatus: "pending" as const,
      }),
      {
        card: "awarding",
        result: "awarded",
        supplierName: details?.supplierName,
        comments: details?.comments,
      },
    );
  };

  const handleAwardingEvaluationSaved = (msgIndex: number) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => m,
      { card: "awarding", result: "saved" },
    );
  };

  const handleAwardingSubmitComplete = (
    msgIndex: number,
    details?: { notes?: string },
  ) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({
        ...m,
        awardingSubmitStatus: "submitted" as const,
        bidAwardSubmitReviewStatus: "submitted" as const,
      }),
      { card: "bidAwardSubmit", result: "submitted", notes: details?.notes },
    );
  };

  const handleBidAwardSubmitComplete = (
    msgIndex: number,
    details?: { notes?: string },
  ) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({ ...m, bidAwardSubmitReviewStatus: "submitted" as const }),
      { card: "bidAwardSubmit", result: "submitted", notes: details?.notes },
    );
  };

  const handleBidAwardApprovalComplete = (
    msgIndex: number,
    result: "approved" | "rejected" | "accepted",
    details?: { comments?: string },
  ) => {
    finalizeActivationOutcome(
      msgIndex,
      (m) => ({
        ...m,
        bidAwardApprovalStatus: result === "accepted" ? "approved" : result,
      }),
      {
        card: "bidAwardApproval",
        result,
        comments: details?.comments,
      },
    );
  };

  const handleActivationStageSelect = (
    stageId: SourcingActivationStageId,
    item: SourcingActivationStageItem | null,
    taskIndex: number,
    label: string,
  ) => {
    if (isStreaming || readSourcingActivationPreferences()[stageId] === false) return;
    if (item && taskIndex >= 0) {
      handlePendingStageTaskSelect(stageId, taskIndex, label);
      return;
    }
    handlePendingTaskCategorySelect(stageId, label);
  };

  const scrollToActivationCard = (msgIndex: number, card: string) => {
    requestAnimationFrame(() => {
      const testIds: Record<string, string> = {
        bidApproval: `agent-bid-approval-card-${msgIndex}`,
        openEnvelope: `agent-open-envelope-card-${msgIndex}`,
        technicalReview: `agent-technical-review-card-${msgIndex}`,
        technicalEvaluation: `agent-technical-evaluation-card-${msgIndex}`,
        commercialReview: `agent-commercial-review-card-${msgIndex}`,
        commercialEvaluation: `agent-commercial-evaluation-card-${msgIndex}`,
        awarding: `agent-awarding-review-card-${msgIndex}`,
        bidAwardSubmit: `agent-bid-award-submit-card-${msgIndex}`,
        bidAwardApproval: `agent-bid-award-approval-card-${msgIndex}`,
      };
      const id = testIds[card] || `agent-awarding-review-card-${msgIndex}`;
      const cardElement =
        document.querySelector(`[data-testid="${id}"]`) ||
        (card === "bidAwardSubmit"
          ? document.querySelector(
              `[data-testid="agent-awarding-review-card-${msgIndex}"]`,
            )
          : null);
      cardElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const clearPromptAndMentions = () => {
    setSourcingPrompt("");
    setSupplierMentions([]);
    setBusinessUserMentions([]);
    setItemMentions([]);
    setBidMentions([]);
    setPrMentions([]);
    setPoMentions([]);
    setInvoiceMentions([]);
  };

  const syncActivationConfirmation = (
    msgIndex: number,
    card: ActiveSourcingConfirmation["card"],
    action: ActiveSourcingConfirmation["action"] | null,
  ) => {
    setActiveActivationConfirmation((current) => {
      if (!action) {
        return current?.msgIndex === msgIndex ? null : current;
      }
      const sameCard =
        current?.msgIndex === msgIndex && current.card === card;
      return {
        msgIndex,
        card,
        action,
        // Preserve multi-turn comments / supplier context collected via chat.
        comments: sameCard ? current?.comments : undefined,
        supplierId: sameCard ? current?.supplierId : undefined,
        supplierName: sameCard ? current?.supplierName : undefined,
      };
    });
  };

  const clearActivationChatState = () => {
    setActiveActivationConfirmation(null);
    setActivationChatRequest(null);
    assignmentBlockedReviewsRef.current.clear();
  };

  const dispatchActivationChat = (opts: {
    msgIndex: number;
    request: SourcingChatActionRequest;
    userText: string;
    ack: string;
    keepConfirmation?: ActiveSourcingConfirmation | null;
  }) => {
    setConversation((prev) => [
      ...prev,
      { role: "user", content: opts.userText, timestamp: new Date() },
      { role: "assistant", content: opts.ack, timestamp: new Date() },
    ]);
    clearPromptAndMentions();
    setActiveActivationConfirmation(
      opts.keepConfirmation === undefined ? null : opts.keepConfirmation,
    );
    setActivationChatRequest({ msgIndex: opts.msgIndex, request: opts.request });
    scrollToActivationCard(opts.msgIndex, opts.request.card);
  };

  const resolveActivationReady = (
    card: SourcingChatActionRequest["card"],
    action: NonNullable<SourcingChatActionRequest["action"]>,
    comments: string,
    supplierId?: string,
  ): boolean => {
    if (
      card === "technicalReview" ||
      card === "commercialReview" ||
      card === "technicalEvaluation" ||
      card === "commercialEvaluation"
    ) {
      return false; // always open confirm panel first
    }
    if (card === "bidApproval" || card === "openEnvelope") return true;
    if (card === "bidAwardApproval") {
      return false; // workflow and committee actions mirror the UI confirmation panel
    }
    if (card === "bidAwardSubmit") return !!comments.trim();
    if (card === "awarding" && action === "save_evaluation") return false;
    if (card === "awarding" && action === "award") {
      return !!(supplierId && comments.trim());
    }
    if (card === "awarding" && action === "submit") return !!comments.trim();
    return false;
  };

  const handleSourcingSubmit = () => {
    if (!sourcingPrompt.trim() || isStreaming) return;
    const confirmText = sourcingPrompt.trim();
    const fromHistory = gatherMentionsForConfirm(conversation.length);
    const pendingActivation = findLatestPendingActivation(conversation);

    // Prefer activation cards over create-bid pendingAction for bare affirmatives.
    // Staged create/publish pendingAction: type "confirm" / "yes" / etc.
    const pendingActionEntry = [...conversation]
      .map((msg, index) => ({ msg, index }))
      .reverse()
      .find(
        ({ msg }) =>
          msg.actionStatus === "pending" && getMessagePendingActions(msg).length > 0,
      );
    // "publish bid" typed at a ready-to-publish card confirms it; otherwise the
    // prompt round-trips to prepare_publish_bid and re-renders the same card.
    const stagedPublishAction = (() => {
      if (!pendingActionEntry) return null;
      const actions = getMessagePendingActions(pendingActionEntry.msg);
      if (actions.length !== 1 || actions[0].type !== "publish_bid") return null;
      return actions[0];
    })();
    const isTypedPublishConfirmation =
      !!stagedPublishAction &&
      isStagedPublishConfirmation(confirmText, {
        bidLabel: stagedPublishAction.data?.preview?.bidLabel ?? stagedPublishAction.data?.bidLabel,
        bidId: stagedPublishAction.data?.bidId ?? stagedPublishAction.data?.preview?.bidId,
      });

    if (
      (isChatConfirmation(confirmText) || isTypedPublishConfirmation) &&
      pendingActionEntry &&
      !activeActivationConfirmation &&
      !pendingActivation
    ) {
      const { index: pendingActionIndex, msg } = pendingActionEntry;
      const actions = getMessagePendingActions(msg);
      const confirmedConversation: ConversationMessage[] = [
        ...conversation.map((m, index) =>
          index === pendingActionIndex ? { ...m, actionStatus: "confirmed" as const } : m,
        ),
        { role: "user", content: confirmText, timestamp: new Date() },
      ];
      clearPromptAndMentions();
      setConversation(confirmedConversation);
      const mentions = gatherMentionsForConfirm(pendingActionIndex);
      if (actions.length === 1) {
        confirmInFlightRef.current = true;
        runStream(
          "",
          confirmedConversation,
          { type: actions[0].type, data: actions[0].data },
          mentions.suppliers,
          mentions.businessUsers,
          mentions.items,
          mentions.bids,
          undefined,
          mentions.prs,
          mentions.pos,
          mentions.invoices,
        );
      } else if (actions.length > 1) {
        confirmInFlightRef.current = true;
        runStream(
          "",
          confirmedConversation,
          { type: "action_bundle", data: { actions } },
          mentions.suppliers,
          mentions.businessUsers,
          mentions.items,
          mentions.bids,
          undefined,
          mentions.prs,
          mentions.pos,
          mentions.invoices,
        );
      }
      return;
    }

    // Confirmation panel already open for an activation card.
    if (activeActivationConfirmation) {
      const { msgIndex, card, action } = activeActivationConfirmation;
      const target = findLatestPendingActivation(conversation);
      const stillPending = target?.msgIndex === msgIndex && target.card === card;
      if (stillPending) {
        const followUp = parseSourcingConfirmationFollowUp(confirmText);
        const switched = parseSourcingActivationCommand(confirmText, target);
        const explicitlyNamesDifferentAction =
          switched &&
          switched.action !== action &&
          /\b(?:approve|reject|deny|decline|accept|submit(?:\s+score)?|award|open|save\s+evaluation)\b/i.test(
            confirmText,
          ) &&
          !/^\s*(?:confirm(?:ed)?|yes|yep|yeah|continue|proceed|go\s+ahead|ok(?:ay)?|sure|do\s+it)\s*[.!]?\s*$/i.test(
            confirmText,
          );
        if (switched && explicitlyNamesDifferentAction) {
          const ready = resolveActivationReady(
            card,
            switched.action,
            switched.comments,
            switched.supplierId,
          );
          dispatchActivationChat({
            msgIndex,
            userText: confirmText,
            ack: sourcingActionAck(card, switched.action, target.label, {
              hasComments: !!switched.comments.trim(),
              needsComments:
                actionRequiresComments(card, switched.action, target) && !ready,
              confirmationRequired: !ready,
              supplierName: switched.supplierName,
            }),
            keepConfirmation: ready
              ? null
              : {
                  msgIndex,
                  card,
                  action: switched.action,
                  comments: switched.comments || undefined,
                  supplierId: switched.supplierId,
                  supplierName: switched.supplierName,
                },
            request: {
              nonce: Date.now(),
              kind: ready ? "confirm" : "start",
              card,
              action: switched.action,
              comments: switched.comments || undefined,
              supplierId: switched.supplierId,
              supplierName: switched.supplierName,
            },
          });
          return;
        }

        if (followUp.intent === "cancel") {
          dispatchActivationChat({
            msgIndex,
            userText: confirmText,
            ack: `Cancelled. You can still act on **${target.label}** from the card above.`,
            keepConfirmation: null,
            request: { nonce: Date.now(), kind: "cancel", card, action },
          });
          return;
        }

        if (followUp.intent === "unknown") {
          setConversation((prev) => [
            ...prev,
            { role: "user", content: confirmText, timestamp: new Date() },
            {
              role: "assistant",
              content: `Please type **confirm** to continue with **${target.label}**, or **cancel** to dismiss.`,
              timestamp: new Date(),
            },
          ]);
          clearPromptAndMentions();
          return;
        }

        const currentCommand =
          switched?.action === action ? switched : null;
        const needsComments = actionRequiresComments(card, action, target);
        const comments = (
          currentCommand?.comments ||
          followUp.comments.trim() ||
          activeActivationConfirmation.comments ||
          ""
        ).trim();
        const savedSupplierId =
          currentCommand?.supplierId || activeActivationConfirmation.supplierId;
        const savedSupplierName =
          currentCommand?.supplierName || activeActivationConfirmation.supplierName;

        // Capture comments first when required, then ask for an explicit confirm.
        // For card-owned fields (award notes / approval comments), dispatch confirm
        // and let the card validate / toast if the textarea is still empty.
        const cardOwnsComments =
          card === "bidAwardSubmit" ||
          card === "bidAwardApproval" ||
          (card === "awarding" && action === "award");

        if (needsComments && !comments && !cardOwnsComments) {
          setConversation((prev) => [
            ...prev,
            { role: "user", content: confirmText, timestamp: new Date() },
            {
              role: "assistant",
              content:
                action === "award"
                  ? `Award comments are required. Add comments for **${target.label}** (and name the supplier if needed), then confirm.`
                  : `Comments are required to continue. Add a brief comment for **${target.label}**, then confirm.`,
              timestamp: new Date(),
            },
          ]);
          clearPromptAndMentions();
          return;
        }

        if (needsComments && !comments && cardOwnsComments && !followUp.explicitConfirmation) {
          setConversation((prev) => [
            ...prev,
            { role: "user", content: confirmText, timestamp: new Date() },
            {
              role: "assistant",
              content:
                card === "bidAwardSubmit" || action === "submit"
                  ? `Award notes are required. Enter notes on the card for **${target.label}**, or type them here, then confirm.`
                  : action === "award"
                    ? `Award comments are required. Enter them on the card for **${target.label}** (and select a supplier), or type them here, then confirm.`
                    : `Comments are required. Enter them on the card for **${target.label}**, or type them here, then confirm.`,
              timestamp: new Date(),
            },
          ]);
          clearPromptAndMentions();
          return;
        }

        const workflowApprovalNeedsExplicitConfirm =
          card === "bidAwardApproval" &&
          target.canApprove &&
          (action === "approve" || action === "reject");
        if (
          workflowApprovalNeedsExplicitConfirm &&
          comments &&
          !activeActivationConfirmation.comments &&
          !followUp.explicitConfirmation
        ) {
          dispatchActivationChat({
            msgIndex,
            userText: confirmText,
            ack: sourcingActionAck(card, action, target.label, {
              hasComments: true,
              confirmationRequired: true,
            }),
            keepConfirmation: {
              msgIndex,
              card,
              action,
              comments,
            },
            request: {
              nonce: Date.now(),
              kind: "start",
              card,
              action,
              comments,
            },
          });
          return;
        }

        if (action === "award" && !savedSupplierId && target.suppliers?.length !== 1) {
          dispatchActivationChat({
            msgIndex,
            userText: confirmText,
            ack: `Select a supplier on the compare panel for **${target.label}**, or type e.g. "award to SupplierName with your comments".`,
            keepConfirmation: {
              msgIndex,
              card,
              action,
              comments: comments || undefined,
            },
            request: {
              nonce: Date.now(),
              kind: "start",
              card: "awarding",
              action: "award",
              comments: comments || undefined,
            },
          });
          return;
        }

        const supplierId =
          savedSupplierId ||
          (action === "award" && target.suppliers?.length === 1
            ? target.suppliers[0].id
            : undefined);
        const supplierName =
          savedSupplierName ||
          (action === "award" && target.suppliers?.length === 1
            ? target.suppliers[0].name
            : undefined);

        dispatchActivationChat({
          msgIndex,
          userText: confirmText,
          ack: sourcingActionAck(card, action, target.label, {
            hasComments: !!comments,
            supplierName,
          }),
          keepConfirmation: null,
          request: {
            nonce: Date.now(),
            kind: "confirm",
            card,
            action,
            comments: comments || undefined,
            supplierId,
            supplierName,
          },
        });
        return;
      }
      setActiveActivationConfirmation(null);
    }

    // Active activation review card: handle actions in-chat without the LLM.
    const pendingTarget = pendingActivation;
    const activationCommand = pendingTarget
      ? parseSourcingActivationCommand(confirmText, pendingTarget)
      : null;

    // Assignment-blocked review: never reopen the card on submit/approve follow-ups.
    // Only an explicit view request (handled below via runStream) may show it again.
    const rememberedAssignmentBlock =
      pendingTarget &&
      (pendingTarget.card === "technicalReview" || pendingTarget.card === "commercialReview") &&
      !!pendingTarget.bidNumber &&
      assignmentBlockedReviewsRef.current.has(
        `${pendingTarget.card}:${pendingTarget.bidNumber}`.toLowerCase(),
      );
    const assignmentBlockedTarget =
      !!pendingTarget?.assignmentBlocked || !!rememberedAssignmentBlock;
    if (
      assignmentBlockedTarget &&
      pendingTarget &&
      !isExplicitReviewViewRequest(confirmText) &&
      (activationCommand ||
        isReviewActionFollowUp(confirmText) ||
        isChatConfirmation(confirmText))
    ) {
      const actionKind =
        activationCommand?.action === "approve_score" ||
        pendingTarget.card === "technicalEvaluation" ||
        pendingTarget.card === "commercialEvaluation"
          ? ("approve_score" as const)
          : ("submit_score" as const);
      setConversation((prev) => [
        ...prev,
        { role: "user", content: confirmText, timestamp: new Date() },
        {
          role: "assistant",
          content: assignmentBlockedActionMessage(actionKind),
          timestamp: new Date(),
        },
      ]);
      clearPromptAndMentions();
      return;
    }

    if (activationCommand && pendingTarget) {
      const { card, msgIndex, label } = pendingTarget;

      if (
        card === "awarding" &&
        (activationCommand.action === "award" || activationCommand.action === "save_evaluation") &&
        pendingTarget.canAward === false
      ) {
        setConversation((prev) => [
          ...prev,
          { role: "user", content: confirmText, timestamp: new Date() },
          {
            role: "assistant",
            content: AWARD_ACTIONS_DENIED_MESSAGE,
            timestamp: new Date(),
          },
        ]);
        clearPromptAndMentions();
        return;
      }

      // Premature submit-for-approval before a draft award exists.
      if (
        card === "awarding" &&
        activationCommand.action === "submit" &&
        !pendingTarget.canSubmitAward
      ) {
        setConversation((prev) => [
          ...prev,
          { role: "user", content: confirmText, timestamp: new Date() },
          {
            role: "assistant",
            content: `Award a supplier for **${label}** first, then submit the draft award for approval.`,
            timestamp: new Date(),
          },
        ]);
        clearPromptAndMentions();
        scrollToActivationCard(msgIndex, card);
        return;
      }

      // Open envelope blocked — prompt instead of silent no-op.
      if (
        card === "openEnvelope" &&
        activationCommand.action === "open" &&
        pendingTarget.canOpenEnvelope === false
      ) {
        setConversation((prev) => [
          ...prev,
          { role: "user", content: confirmText, timestamp: new Date() },
          {
            role: "assistant",
            content: `Cannot open the envelope for **${label}**: ${
              pendingTarget.openEnvelopeBlockReason ||
              "Opening is not available for your role or the current bid state."
            }`,
            timestamp: new Date(),
          },
        ]);
        clearPromptAndMentions();
        scrollToActivationCard(msgIndex, card);
        return;
      }

      // Score submit / approve blocked from the card payload — prompt explicitly.
      if (
        (card === "technicalReview" || card === "commercialReview") &&
        activationCommand.action === "submit_score" &&
        pendingTarget.canSubmitScore === false
      ) {
        setConversation((prev) => [
          ...prev,
          { role: "user", content: confirmText, timestamp: new Date() },
          {
            role: "assistant",
            content: isAssignmentBlockReason(pendingTarget.scoreBlockReason)
              ? assignmentBlockedActionMessage("submit_score")
              : `Cannot submit scores for **${label}**: ${
                  pendingTarget.scoreBlockReason ||
                  "Scoring is not available for your role, this bid type, or the current review state."
                }`,
            timestamp: new Date(),
          },
        ]);
        clearPromptAndMentions();
        if (!isAssignmentBlockReason(pendingTarget.scoreBlockReason)) {
          scrollToActivationCard(msgIndex, card);
        }
        return;
      }
      if (
        (card === "technicalEvaluation" || card === "commercialEvaluation") &&
        activationCommand.action === "approve_score" &&
        pendingTarget.canApproveScore === false
      ) {
        setConversation((prev) => [
          ...prev,
          { role: "user", content: confirmText, timestamp: new Date() },
          {
            role: "assistant",
            content: `Cannot approve scores for **${label}**: score approval is not available for your role, or scores are not ready yet.`,
            timestamp: new Date(),
          },
        ]);
        clearPromptAndMentions();
        scrollToActivationCard(msgIndex, card);
        return;
      }

      const ready = resolveActivationReady(
        card,
        activationCommand.action,
        activationCommand.comments,
        activationCommand.supplierId,
      );
      const needsComments = actionRequiresComments(card, activationCommand.action, pendingTarget);
      dispatchActivationChat({
        msgIndex,
        userText: confirmText,
        ack: sourcingActionAck(card, activationCommand.action, label, {
          hasComments: !!activationCommand.comments.trim(),
          needsComments: needsComments && !ready,
          confirmationRequired: !ready,
          supplierName: activationCommand.supplierName,
        }),
        keepConfirmation: ready
          ? null
          : {
              msgIndex,
              card,
              action: activationCommand.action,
              comments: activationCommand.comments || undefined,
              supplierId: activationCommand.supplierId,
              supplierName: activationCommand.supplierName,
            },
        request: {
          nonce: Date.now(),
          kind: ready ? "confirm" : "start",
          card,
          action: activationCommand.action,
          comments: activationCommand.comments || undefined,
          supplierId: activationCommand.supplierId,
          supplierName: activationCommand.supplierName,
        },
      });
      return;
    }

    // Bare confirm with a pending activation card but no open panel → prompt.
    if (pendingTarget && isChatConfirmation(confirmText)) {
      const defaultAction =
        pendingTarget.card === "bidApproval"
          ? ("approve" as const)
          : pendingTarget.card === "openEnvelope"
            ? ("open" as const)
            : pendingTarget.card === "technicalReview" ||
                pendingTarget.card === "commercialReview"
              ? ("submit_score" as const)
              : pendingTarget.card === "technicalEvaluation" ||
                  pendingTarget.card === "commercialEvaluation"
                ? ("approve_score" as const)
                : pendingTarget.card === "bidAwardSubmit"
                  ? ("submit" as const)
                  : pendingTarget.card === "bidAwardApproval"
                    ? pendingTarget.canApprove
                      ? ("approve" as const)
                      : ("accept" as const)
                    : ("award" as const);
      dispatchActivationChat({
        msgIndex: pendingTarget.msgIndex,
        userText: confirmText,
        ack: sourcingActionAck(pendingTarget.card, defaultAction, pendingTarget.label, {
          confirmationRequired: true,
          needsComments: actionRequiresComments(
            pendingTarget.card,
            defaultAction,
            pendingTarget,
          ),
        }),
        keepConfirmation: {
          msgIndex: pendingTarget.msgIndex,
          card: pendingTarget.card,
          action: defaultAction,
        },
        request: {
          nonce: Date.now(),
          kind: "start",
          card: pendingTarget.card,
          action: defaultAction,
        },
      });
      return;
    }

    // Remembered assignment block with no pending card match — still deny action
    // follow-ups without reopening a review card.
    if (
      assignmentBlockedReviewsRef.current.size > 0 &&
      !isExplicitReviewViewRequest(confirmText) &&
      (isReviewActionFollowUp(confirmText) || isChatConfirmation(confirmText))
    ) {
      setConversation((prev) => [
        ...prev,
        { role: "user", content: confirmText, timestamp: new Date() },
        {
          role: "assistant",
          content: assignmentBlockedActionMessage("submit_score"),
          timestamp: new Date(),
        },
      ]);
      clearPromptAndMentions();
      return;
    }

    runStream(
      sourcingPrompt,
      conversation,
      undefined,
      supplierMentions.length > 0 ? supplierMentions : fromHistory.suppliers,
      businessUserMentions.length > 0 ? businessUserMentions : fromHistory.businessUsers,
      itemMentions.length > 0 ? itemMentions : fromHistory.items,
      bidMentions.length > 0 ? bidMentions : fromHistory.bids,
      undefined,
      prMentions.length > 0 ? prMentions : fromHistory.prs,
      poMentions.length > 0 ? poMentions : fromHistory.pos,
      invoiceMentions.length > 0 ? invoiceMentions : fromHistory.invoices,
    );
  };

  const gatherMentionsForConfirm = (throughIndex: number) => {
    let suppliers: SupplierMention[] = [];
    let businessUsers: BusinessUserMention[] = [];
    let items: ItemMention[] = [];
    let bids: BidMention[] = [];
    let prs: PrMention[] = [];
    let pos: PoMention[] = [];
    let invoices: InvoiceMention[] = [];
    for (let i = 0; i < throughIndex; i++) {
      const m = conversation[i];
      if (m.role !== "user") continue;
      if (m.mentions?.length) suppliers = m.mentions;
      if (m.businessUserMentions?.length) businessUsers = m.businessUserMentions;
      if (m.itemMentions?.length) items = m.itemMentions;
      if (m.bidMentions?.length) bids = m.bidMentions;
      if (m.prMentions?.length) prs = m.prMentions;
      if (m.poMentions?.length) pos = m.poMentions;
      if (m.invoiceMentions?.length) invoices = m.invoiceMentions;
    }
    return { suppliers, businessUsers, items, bids, prs, pos, invoices };
  };

  const handleConfirmAction = (msgIndex: number) => {
    if (isStreaming || confirmInFlightRef.current) return;
    const msg = conversation[msgIndex];
    if (msg.actionStatus !== "pending") return;
    const actions = getMessagePendingActions(msg);
    if (actions.length !== 1) return;
    const action = actions[0];
    confirmInFlightRef.current = true;
    setConversation(prev =>
      prev.map((m, i) =>
        i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m,
      ),
    );
    const { suppliers, businessUsers, items, bids, prs, pos, invoices } = gatherMentionsForConfirm(msgIndex);
    runStream(
      "",
      conversation,
      { type: action.type, data: action.data },
      suppliers,
      businessUsers,
      items,
      bids,
      undefined,
      prs,
      pos,
      invoices,
    );
  };

  const handleConfirmAllActions = (msgIndex: number) => {
    if (isStreaming || confirmInFlightRef.current) return;
    const msg = conversation[msgIndex];
    if (msg.actionStatus !== "pending") return;
    const actions = getMessagePendingActions(msg);
    if (actions.length === 0) return;
    confirmInFlightRef.current = true;
    setConversation(prev =>
      prev.map((m, i) => (i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m)),
    );
    const { suppliers, businessUsers, items, bids, prs, pos, invoices } = gatherMentionsForConfirm(msgIndex);
    const tentativeConfirm = { type: "action_bundle", data: { actions } };
    const activeCreatedBid = resolveActiveCreatedBid(conversation, tentativeConfirm);
    const sanitized = activeCreatedBid
      ? sanitizeBundleForActiveCreatedBid(actions, activeCreatedBid)
      : actions;
    runStream(
      "",
      conversation,
      { type: "action_bundle", data: { actions: sanitized } },
      suppliers,
      businessUsers,
      items,
      bids,
      undefined,
      prs,
      pos,
      invoices,
    );
  };

  // Persist create-bid preview edits ("Save & Continue") to the conversation
  // record. Rebuilds the staged pending actions from the edited preview so every
  // downstream execution path (composer "yes", Confirm All, follow-up turns)
  // uses the saved values instead of the original AI-staged ones.
  const handleSaveCreateBidPreviewEdits = async (
    msgIndex: number,
    nextPreview: CreateBidPreviewSpec,
  ) => {
    const msg = conversation[msgIndex];
    if (!msg || msg.actionStatus !== "pending") return;
    const nextActions = mergeCreateBidPreviewIntoActions(
      nextPreview,
      getMessagePendingActions(msg),
    ) as PendingAction[];
    await persistConversation(
      conversation.map((m, i) =>
        i === msgIndex
          ? {
              ...m,
              actionPreview: nextPreview,
              pendingActions: nextActions,
              pendingAction: nextActions[0],
            }
          : m,
      ),
    );
  };

  const handleConfirmCreateBidPreview = (msgIndex: number, editedPreview: CreateBidPreviewSpec) => {
    if (isStreaming || confirmInFlightRef.current) return;
    const msg = conversation[msgIndex];
    if (msg.actionStatus !== "pending") return;
    const actions = getMessagePendingActions(msg);
    if (actions.length === 0) return;
    confirmInFlightRef.current = true;
    const merged = mergeCreateBidPreviewIntoActions(editedPreview, actions);
    setConversation(prev =>
      prev.map((m, i) =>
        i === msgIndex ? { ...m, actionStatus: "confirmed" as const, actionPreview: editedPreview } : m,
      ),
    );
    const { suppliers, businessUsers, items, bids, prs, pos, invoices } = gatherMentionsForConfirm(msgIndex);
    const tentativeConfirm =
      merged.some((a) => a.type === "add_bid_line") || merged.length > 1
        ? { type: "action_bundle", data: { actions: merged } }
        : { type: merged[0].type, data: merged[0].data };
    const activeCreatedBid = resolveActiveCreatedBid(conversation, tentativeConfirm);
    const sanitized = activeCreatedBid
      ? sanitizeBundleForActiveCreatedBid(merged, activeCreatedBid)
      : merged;
    const confirmAction =
      sanitized.some((a) => a.type === "add_bid_line") || sanitized.length > 1
        ? { type: "action_bundle", data: { actions: sanitized } }
        : { type: sanitized[0].type, data: sanitized[0].data };
    runStream("", conversation, confirmAction, suppliers, businessUsers, items, bids, undefined, prs, pos, invoices);
  };

  const handleMakeChanges = (msgIndex: number) => {
    setConversation(prev => {
      const updated = prev.map((m, i) =>
        i === msgIndex
          ? { ...m, actionStatus: "cancelled" as const, actionPreview: undefined }
          : m,
      );
      return [
        ...updated,
        {
          role: "assistant" as const,
          content: "No problem — tell me what you'd like to change and I'll update the preview.",
          timestamp: new Date(),
        },
      ];
    });
  };

  const handleApplyPublishRemediation = (
    msgIndex: number,
    data: RemediationData & { openDate?: string; closeDate?: string },
  ) => {
    if (isStreaming || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    const { suppliers, businessUsers, items, bids, prs, pos, invoices } = gatherMentionsForConfirm(msgIndex);
    runStream(
      "",
      conversation,
      { type: "ai_remediate_bid", data: { ...data, _confirmed: true } },
      suppliers,
      businessUsers,
      items,
      bids,
      undefined,
      prs,
      pos,
      invoices,
    );
  };

  const handlePublishPreviewMakeChanges = () => {
    setConversation((prev) => [
      ...prev,
      {
        role: "assistant" as const,
        content:
          "Edit the fields directly on the preview card, or tell me what to change — for example, update the close date, add suppliers, or adjust evaluation criteria.",
        timestamp: new Date(),
      },
    ]);
  };

  const handlePublishFromCreateSuccess = (result: CreateBidSuccessSpec) => {
    if (isStreaming || confirmInFlightRef.current) return;
    const mentionDisplay = `^${result.bidNumber}`;
    // Keeps "publish", "bid" and the bid reference so the server still routes straight to
    // prepare_publish_bid, while the chat bubble no longer reads as if the bid went live.
    const prompt = `Check readiness to publish bid ${mentionDisplay}`;
    const mentionStart = prompt.indexOf(mentionDisplay);
    const bidMention: BidMention = {
      bidId: result.bidId,
      bidNumber: result.bidNumber,
      bidTitle: result.title || null,
      bidStatus: result.status || null,
      start: mentionStart,
      end: mentionStart + mentionDisplay.length,
      display: mentionDisplay,
    };
    runStream(prompt, conversation, undefined, [], [], [], [bidMention]);
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

  const handleConfirmCriteriaGeneration = (msgIndex: number, selectedRequirements: CriteriaGenerateItem[]) => {
    if (isStreaming || confirmInFlightRef.current) return;
    const msg = conversation[msgIndex];
    if (msg.actionStatus !== "pending") return;
    const actions = getMessagePendingActions(msg);
    if (actions.length !== 1) return;
    const action = actions[0];
    confirmInFlightRef.current = true;
    setConversation(prev =>
      prev.map((m, i) => (i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m)),
    );
    const bidId = action.data?.bidId;
    if (bidId) {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
    }
    const { suppliers, businessUsers, items, bids, prs, pos, invoices } = gatherMentionsForConfirm(msgIndex);
    runStream(
      "",
      conversation,
      { type: action.type, data: { ...action.data, requirements: selectedRequirements } },
      suppliers,
      businessUsers,
      items,
      bids,
      undefined,
      prs,
      pos,
      invoices,
    );
  };

  const handleConfirmCriteriaRegeneration = (msgIndex: number, selectedActions: ReconciledCriteriaItem[]) => {
    if (isStreaming || confirmInFlightRef.current) return;
    const msg = conversation[msgIndex];
    if (msg.actionStatus !== "pending") return;
    const actions = getMessagePendingActions(msg);
    if (actions.length !== 1) return;
    const action = actions[0];
    confirmInFlightRef.current = true;
    setConversation(prev =>
      prev.map((m, i) => (i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m)),
    );
    const bidId = action.data?.bidId;
    if (bidId) {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
    }
    const { suppliers, businessUsers, items, bids, prs, pos, invoices } = gatherMentionsForConfirm(msgIndex);
    runStream(
      "",
      conversation,
      { type: action.type, data: { bidId: action.data?.bidId, bidLabel: action.data?.bidLabel, actions: selectedActions } },
      suppliers,
      businessUsers,
      items,
      bids,
      undefined,
      prs,
      pos,
      invoices,
    );
  };

  const handleConfirmClausesGeneration = (msgIndex: number, selectedClauses: ClauseGenerateItem[]) => {
    if (isStreaming || confirmInFlightRef.current) return;
    const msg = conversation[msgIndex];
    if (msg.actionStatus !== "pending") return;
    const actions = getMessagePendingActions(msg);
    if (actions.length !== 1) return;
    const action = actions[0];
    confirmInFlightRef.current = true;
    setConversation(prev =>
      prev.map((m, i) => (i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m)),
    );
    const bidId = action.data?.bidId;
    if (bidId) {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "clauses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
    }
    const { suppliers, businessUsers, items, bids, prs, pos, invoices } = gatherMentionsForConfirm(msgIndex);
    runStream(
      "",
      conversation,
      { type: action.type, data: { ...action.data, clauses: selectedClauses } },
      suppliers,
      businessUsers,
      items,
      bids,
      undefined,
      prs,
      pos,
      invoices,
    );
  };

  const handleApplyRemediation = (msgIndex: number, modifiedData: any) => {
    if (isStreaming || confirmInFlightRef.current) return;
    const msg = conversation[msgIndex];
    if (msg.actionStatus !== "pending") return;
    const actions = getMessagePendingActions(msg);
    if (actions.length === 0) return;
    const action = actions[0];
    confirmInFlightRef.current = true;
    setConversation(prev =>
      prev.map((m, i) => (i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m)),
    );
    const { suppliers, businessUsers, items, bids, prs, pos, invoices } = gatherMentionsForConfirm(msgIndex);
    runStream(
      "",
      conversation,
      { type: action.type, data: modifiedData },
      suppliers,
      businessUsers,
      items,
      bids,
      undefined,
      prs,
      pos,
      invoices,
    );
  };
  
  const handleClearConversation = () => {
    clearActivationChatState();
    newConversation();
    replacePromptText("");
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
    const el = sourcingInputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.setSelectionRange(start, end);
    } catch {
      // ignore if element doesn't support selection
    }
  };

  const replacePromptText = (text: string) => {
    setSourcingPrompt(text);
    setSupplierMentions([]);
    setBusinessUserMentions([]);
    setItemMentions([]);
    setBidMentions([]);
    setPrMentions([]);
    setPoMentions([]);
    setInvoiceMentions([]);
    closeAllMentionSuggestions();
  };

  const handleMentionPick = (vendor: VendorMentionOption) => {
    if (!mentionTrigger) return;
    const label = vendor.companyName || "Unnamed vendor";
    const mentionDisplay = `@${label}`;
    const replacement = `${mentionDisplay} `;
    applyMentionInsertion(mentionTrigger, replacement, mentionDisplay, (reconciled, mentionStart, mentionEnd) => {
      const withoutOverlap = reconciled.suppliers.filter(
        (existing) => existing.end <= mentionStart || existing.start >= mentionEnd,
      );
      return {
        suppliers: [
          ...withoutOverlap,
          {
            supplierId: vendor.id,
            companyName: label,
            emailId: vendor.emailId || null,
            start: mentionStart,
            end: mentionEnd,
            display: mentionDisplay,
          },
        ].sort((a, b) => a.start - b.start),
        businessUsers: reconciled.businessUsers,
        items: reconciled.items,
        bids: reconciled.bids,
        prs: reconciled.prs,
        pos: reconciled.pos,
        invoices: reconciled.invoices,
      };
    });
  };

  const handleHashMentionPick = (user: BusinessUserMentionOption) => {
    if (!hashMentionTrigger) return;
    const label = user.name || "Unnamed user";
    const mentionDisplay = `#${label}`;
    const replacement = `${mentionDisplay} `;
    applyMentionInsertion(hashMentionTrigger, replacement, mentionDisplay, (reconciled, mentionStart, mentionEnd) => {
      const withoutOverlap = reconciled.businessUsers.filter(
        (existing) => existing.end <= mentionStart || existing.start >= mentionEnd,
      );
      return {
        suppliers: reconciled.suppliers,
        businessUsers: [
          ...withoutOverlap,
          {
            userId: user.id,
            name: label,
            emailId: user.email_id || null,
            userName: user.user_name || null,
            start: mentionStart,
            end: mentionEnd,
            display: mentionDisplay,
          },
        ].sort((a, b) => a.start - b.start),
        items: reconciled.items,
        bids: reconciled.bids,
        prs: reconciled.prs,
        pos: reconciled.pos,
        invoices: reconciled.invoices,
      };
    });
  };

  const handleSlashMentionPick = (item: ItemMentionOption) => {
    if (!slashMentionTrigger) return;
    const label = itemMentionLabel(item);
    const mentionDisplay = `/${label}`;
    const replacement = `${mentionDisplay} `;
    const sku = String(item.sku || item.itemCode || "").trim() || null;
    applyMentionInsertion(slashMentionTrigger, replacement, mentionDisplay, (reconciled, mentionStart, mentionEnd) => {
      const withoutOverlap = reconciled.items.filter(
        (existing) => existing.end <= mentionStart || existing.start >= mentionEnd,
      );
      return {
        suppliers: reconciled.suppliers,
        businessUsers: reconciled.businessUsers,
        items: [
          ...withoutOverlap,
          {
            itemId: item.id,
            name: label,
            sku,
            categoryName: item.categoryName || null,
            start: mentionStart,
            end: mentionEnd,
            display: mentionDisplay,
          },
        ].sort((a, b) => a.start - b.start),
        bids: reconciled.bids,
        prs: reconciled.prs,
        pos: reconciled.pos,
        invoices: reconciled.invoices,
      };
    });
  };

  const handleCaretMentionPick = (bid: BidMentionOption) => {
    if (!caretMentionTrigger) return;
    const label = bid.bidNumber;
    const mentionDisplay = `^${label}`;
    const replacement = `${mentionDisplay} `;
    applyMentionInsertion(caretMentionTrigger, replacement, mentionDisplay, (reconciled, mentionStart, mentionEnd) => {
      const withoutOverlap = reconciled.bids.filter(
        (existing) => existing.end <= mentionStart || existing.start >= mentionEnd,
      );
      return {
        suppliers: reconciled.suppliers,
        businessUsers: reconciled.businessUsers,
        items: reconciled.items,
        bids: [
          ...withoutOverlap,
          {
            bidId: bid.id,
            bidNumber: bid.bidNumber,
            bidTitle: bid.bidTitle || null,
            bidStatus: bid.bidStatus || null,
            start: mentionStart,
            end: mentionEnd,
            display: mentionDisplay,
          },
        ].sort((a, b) => a.start - b.start),
        prs: reconciled.prs,
        pos: reconciled.pos,
        invoices: reconciled.invoices,
      };
    });
  };

  const handleAmpersandMentionPick = (pr: PrMentionOption) => {
    if (!ampersandMentionTrigger) return;
    const label = pr.prNumber;
    const mentionDisplay = `&${label}`;
    const replacement = `${mentionDisplay} `;
    applyMentionInsertion(ampersandMentionTrigger, replacement, mentionDisplay, (reconciled, mentionStart, mentionEnd) => {
      const withoutOverlap = reconciled.prs.filter(
        (existing) => existing.end <= mentionStart || existing.start >= mentionEnd,
      );
      return {
        suppliers: reconciled.suppliers,
        businessUsers: reconciled.businessUsers,
        items: reconciled.items,
        bids: reconciled.bids,
        prs: [
          ...withoutOverlap,
          {
            prNumber: pr.prNumber,
            prDescription: pr.prDescription || null,
            prStatus: pr.prStatus || null,
            start: mentionStart,
            end: mentionEnd,
            display: mentionDisplay,
          },
        ].sort((a, b) => a.start - b.start),
        pos: reconciled.pos,
        invoices: reconciled.invoices,
      };
    });
  };

  const handlePercentMentionPick = (po: PoMentionOption) => {
    if (!percentMentionTrigger) return;
    const label = po.poNumber;
    const mentionDisplay = `%${label}`;
    const replacement = `${mentionDisplay} `;
    applyMentionInsertion(percentMentionTrigger, replacement, mentionDisplay, (reconciled, mentionStart, mentionEnd) => {
      const withoutOverlap = reconciled.pos.filter(
        (existing) => existing.end <= mentionStart || existing.start >= mentionEnd,
      );
      return {
        suppliers: reconciled.suppliers,
        businessUsers: reconciled.businessUsers,
        items: reconciled.items,
        bids: reconciled.bids,
        prs: reconciled.prs,
        pos: [
          ...withoutOverlap,
          {
            poNumber: po.poNumber,
            poDescription: po.poDescription || null,
            poStatus: po.poStatus || null,
            companyName: po.companyName || null,
            start: mentionStart,
            end: mentionEnd,
            display: mentionDisplay,
          },
        ].sort((a, b) => a.start - b.start),
        invoices: reconciled.invoices,
      };
    });
  };

  const handleDollarMentionPick = (invoice: InvoiceMentionOption) => {
    if (!dollarMentionTrigger) return;
    const label = invoice.invoiceNumber;
    const mentionDisplay = `$${label}`;
    const replacement = `${mentionDisplay} `;
    applyMentionInsertion(dollarMentionTrigger, replacement, mentionDisplay, (reconciled, mentionStart, mentionEnd) => {
      const withoutOverlap = reconciled.invoices.filter(
        (existing) => existing.end <= mentionStart || existing.start >= mentionEnd,
      );
      return {
        suppliers: reconciled.suppliers,
        businessUsers: reconciled.businessUsers,
        items: reconciled.items,
        bids: reconciled.bids,
        prs: reconciled.prs,
        pos: reconciled.pos,
        invoices: [
          ...withoutOverlap,
          {
            invoiceId: invoice.invoiceId,
            invoiceNumber: label,
            invoiceStatus: invoice.invoiceStatus,
            supplierName: invoice.supplierName,
            poNumber: invoice.poNumber,
            start: mentionStart,
            end: mentionEnd,
            display: mentionDisplay,
          },
        ].sort((a, b) => a.start - b.start),
      };
    });
  };

  const handlePromptChange = (nextValue: string, caret: number | null) => {
    const nextSupplierMentions = reconcileMentionsAfterTextChange(
      supplierMentions,
      sourcingPrompt,
      nextValue,
    );
    const nextBusinessUserMentions = reconcileMentionsAfterTextChange(
      businessUserMentions,
      sourcingPrompt,
      nextValue,
    );
    const nextItemMentions = reconcileMentionsAfterTextChange(
      itemMentions,
      sourcingPrompt,
      nextValue,
    );
    const nextBidMentions = reconcileMentionsAfterTextChange(
      bidMentions,
      sourcingPrompt,
      nextValue,
    );
    const nextPrMentions = reconcileMentionsAfterTextChange(
      prMentions,
      sourcingPrompt,
      nextValue,
    );
    const nextPoMentions = reconcileMentionsAfterTextChange(
      poMentions,
      sourcingPrompt,
      nextValue,
    );
    const nextInvoiceMentions = reconcileMentionsAfterTextChange(
      invoiceMentions,
      sourcingPrompt,
      nextValue,
    );
    setSupplierMentions(nextSupplierMentions);
    setBusinessUserMentions(nextBusinessUserMentions);
    setItemMentions(nextItemMentions);
    setBidMentions(nextBidMentions);
    setPrMentions(nextPrMentions);
    setPoMentions(nextPoMentions);
    setInvoiceMentions(nextInvoiceMentions);
    setSourcingPrompt(nextValue);
    refreshMentionContext(
      nextValue,
      caret,
      nextSupplierMentions,
      nextBusinessUserMentions,
      nextItemMentions,
      nextBidMentions,
      nextPrMentions,
      nextPoMentions,
      nextInvoiceMentions,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (activeMentionDropdown === "supplier" && mentionTrigger) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (mentionSuggestions.length > 0) {
          setMentionHighlightIndex((prev) => (prev + 1) % mentionSuggestions.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (mentionSuggestions.length > 0) {
          setMentionHighlightIndex(
            (prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length,
          );
        }
        return;
      }
      if (e.key === "Enter") {
        if (mentionSuggestions.length > 0) {
          e.preventDefault();
          handleMentionPick(mentionSuggestions[mentionHighlightIndex] || mentionSuggestions[0]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllMentionSuggestions();
        return;
      }
    }

    if (activeMentionDropdown === "businessUser" && hashMentionTrigger) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (hashMentionSuggestions.length > 0) {
          setHashMentionHighlightIndex((prev) => (prev + 1) % hashMentionSuggestions.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (hashMentionSuggestions.length > 0) {
          setHashMentionHighlightIndex(
            (prev) => (prev - 1 + hashMentionSuggestions.length) % hashMentionSuggestions.length,
          );
        }
        return;
      }
      if (e.key === "Enter") {
        if (hashMentionSuggestions.length > 0) {
          e.preventDefault();
          handleHashMentionPick(
            hashMentionSuggestions[hashMentionHighlightIndex] || hashMentionSuggestions[0],
          );
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllMentionSuggestions();
        return;
      }
    }

    if (activeMentionDropdown === "item" && slashMentionTrigger) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (slashMentionSuggestions.length > 0) {
          setSlashMentionHighlightIndex((prev) => (prev + 1) % slashMentionSuggestions.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (slashMentionSuggestions.length > 0) {
          setSlashMentionHighlightIndex(
            (prev) => (prev - 1 + slashMentionSuggestions.length) % slashMentionSuggestions.length,
          );
        }
        return;
      }
      if (e.key === "Enter") {
        if (slashMentionSuggestions.length > 0) {
          e.preventDefault();
          handleSlashMentionPick(
            slashMentionSuggestions[slashMentionHighlightIndex] || slashMentionSuggestions[0],
          );
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllMentionSuggestions();
        return;
      }
    }

    if (activeMentionDropdown === "bid" && caretMentionTrigger) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (caretMentionSuggestions.length > 0) {
          setCaretMentionHighlightIndex((prev) => (prev + 1) % caretMentionSuggestions.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (caretMentionSuggestions.length > 0) {
          setCaretMentionHighlightIndex(
            (prev) => (prev - 1 + caretMentionSuggestions.length) % caretMentionSuggestions.length,
          );
        }
        return;
      }
      if (e.key === "Enter") {
        if (caretMentionSuggestions.length > 0) {
          e.preventDefault();
          handleCaretMentionPick(
            caretMentionSuggestions[caretMentionHighlightIndex] || caretMentionSuggestions[0],
          );
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllMentionSuggestions();
        return;
      }
    }

    if (activeMentionDropdown === "pr" && ampersandMentionTrigger) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (ampersandMentionSuggestions.length > 0) {
          setAmpersandMentionHighlightIndex((prev) => (prev + 1) % ampersandMentionSuggestions.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (ampersandMentionSuggestions.length > 0) {
          setAmpersandMentionHighlightIndex(
            (prev) => (prev - 1 + ampersandMentionSuggestions.length) % ampersandMentionSuggestions.length,
          );
        }
        return;
      }
      if (e.key === "Enter") {
        if (ampersandMentionSuggestions.length > 0) {
          e.preventDefault();
          handleAmpersandMentionPick(
            ampersandMentionSuggestions[ampersandMentionHighlightIndex] || ampersandMentionSuggestions[0],
          );
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllMentionSuggestions();
        return;
      }
    }

    if (activeMentionDropdown === "po" && percentMentionTrigger) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (percentMentionSuggestions.length > 0) {
          setPercentMentionHighlightIndex((prev) => (prev + 1) % percentMentionSuggestions.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (percentMentionSuggestions.length > 0) {
          setPercentMentionHighlightIndex(
            (prev) => (prev - 1 + percentMentionSuggestions.length) % percentMentionSuggestions.length,
          );
        }
        return;
      }
      if (e.key === "Enter") {
        if (percentMentionSuggestions.length > 0) {
          e.preventDefault();
          handlePercentMentionPick(
            percentMentionSuggestions[percentMentionHighlightIndex] || percentMentionSuggestions[0],
          );
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllMentionSuggestions();
        return;
      }
    }

    if (activeMentionDropdown === "invoice" && dollarMentionTrigger) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (dollarMentionSuggestions.length > 0) {
          setDollarMentionHighlightIndex((prev) => (prev + 1) % dollarMentionSuggestions.length);
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (dollarMentionSuggestions.length > 0) {
          setDollarMentionHighlightIndex(
            (prev) => (prev - 1 + dollarMentionSuggestions.length) % dollarMentionSuggestions.length,
          );
        }
        return;
      }
      if (e.key === "Enter") {
        if (dollarMentionSuggestions.length > 0) {
          e.preventDefault();
          handleDollarMentionPick(
            dollarMentionSuggestions[dollarMentionHighlightIndex] || dollarMentionSuggestions[0],
          );
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllMentionSuggestions();
        return;
      }
    }

    if (e.key === "Tab") {
      const el = sourcingInputRef.current;
      if (!el) return;
      const ranges = getPlaceholderRanges(sourcingPrompt);
      if (ranges.length === 0) return;

      e.preventDefault();
      const caret = el.selectionStart ?? 0;
      const isShift = e.shiftKey;

      if (isShift) {
        const prev = [...ranges].reverse().find((r) => r.end < caret) ?? ranges[ranges.length - 1];
        focusAndSelectRange(prev.start, prev.end);
      } else {
        const next = ranges.find((r) => r.start > caret) ?? ranges[0];
        focusAndSelectRange(next.start, next.end);
      }
    }
  };

  const applyQuickActionTemplate = (
    template: string,
    confirmLabel: string,
    firstPlaceholderKey?: string,
  ) => {
    if (isStreaming) return;

    if (sourcingPrompt.trim()) {
      const ok = window.confirm(
        `Replace your current message with the ${confirmLabel} template?`,
      );
      if (!ok) {
        sourcingInputRef.current?.focus();
        return;
      }
    }

    replacePromptText(template);

    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(template);
      const target = firstPlaceholderKey
        ? ranges.find((r) => r.key === firstPlaceholderKey)
        : ranges[0];
      if (target) focusAndSelectRange(target.start, target.end);
      else focusAndSelectRange(template.length, template.length);
    });
  };

  const handleCreateBidClick = () => {
    applyQuickActionTemplate(
      CREATE_BID_QUICK_ACTION_TEMPLATE,
      "Create Bid",
      "RFQ/RFP/Tender",
    );
  };

  const handleConvertPRClick = () => {
    applyQuickActionTemplate(
      CONVERT_PR_QUICK_ACTION_TEMPLATE,
      "Convert PR",
      "pr_number",
    );
  };

  const handleViewBidsClick = () => {
    applyQuickActionTemplate(
      VIEW_BIDS_QUICK_ACTION_TEMPLATE,
      "View Bids",
      "status/type/department",
    );
  };

  const handleManageVendorsClick = () => {
    applyQuickActionTemplate(
      MANAGE_VENDORS_QUICK_ACTION_TEMPLATE,
      "Manage Vendors",
      "Bid Number",
    );
  };

  const handleAwardsAnalyticsClick = () => {
    applyQuickActionTemplate(
      AWARDS_ANALYTICS_QUICK_ACTION_TEMPLATE,
      "Awards",
    );
  };

  const handleAnalyticsClick = () => {
    applyQuickActionTemplate(
      ANALYTICS_QUICK_ACTION_TEMPLATE,
      "Analytics",
    );
  };

  const handleUpdatesClick = () => {
    if (isStreaming) return;
    runStream(UPDATES_QUICK_ACTION_TEMPLATE, conversation);
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
          <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30">
            <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Sourcing Agent</h1>
          <Badge variant="outline" className="gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
            <Zap className="h-3 w-3" />
            Action-Capable
          </Badge>
          <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3 w-3" />
            Active
          </Badge>
          <SourcingActivationSignalsPopover onStageActivate={handleActivationStageSelect} />
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
                        onClick={() => {
                          clearActivationChatState();
                          switchConversation(conv.id);
                        }}
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

        <Card className="flex-1 flex flex-col min-h-0 min-w-0">
          <CardContent className="flex-1 p-4 flex flex-col min-h-0 min-w-0">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4" data-testid="chat-messages">
              {conversation.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="p-4 rounded-full bg-purple-100 dark:bg-purple-900/30 w-fit mx-auto mb-4">
                      <Bot className="h-10 w-10 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Sourcing Agent</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your most strategic procurement assistant. Create RFQs, RFPs, and Tenders from natural language. Manage the complete sourcing lifecycle — from requirements to awards.
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
                          <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30 h-fit flex-shrink-0">
                            <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          </div>
                        )}
                        {!(msg.role === "assistant" && isBidActionSuccess(msg.actionResult) && !msg.content) && (
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
                                {!isBidActionSuccess(msg.actionResult) && msg.content ? (
                                  <div
                                    className="text-sm [&_h3]:text-foreground [&_h4]:text-muted-foreground [&_strong]:text-foreground"
                                    dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                                  />
                                ) : null}
                                {msg.chart && getMessagePendingActions(msg).length === 0 ? (
                                  <AgentChartMessage spec={msg.chart} />
                                ) : null}
                                {msg.sourcingTaskFlow ? (
                                  <SourcingPendingTasksFlow
                                    flow={msg.sourcingTaskFlow}
                                    disabled={
                                      isStreaming ||
                                      // After the user picks a category/task, older chip rows stay inert.
                                      conversation.slice(i + 1).some((later) => later.role === "user")
                                    }
                                    onSelectCategory={handlePendingTaskCategorySelect}
                                    onSelectStageTask={handlePendingStageTaskSelect}
                                  />
                                ) : null}
                                {msg.createBidSourceChoice && isCreateBidSourceChoice(msg.createBidSourceChoice) ? (
                                  <CreateBidSourceChoice
                                    choice={msg.createBidSourceChoice}
                                    disabled={isStreaming}
                                    onSelect={(prompt) => handleCreateBidSourceSelect(prompt)}
                                  />
                                ) : null}
                                {msg.createBidSourceChoice && isCreateBidPrChoice(msg.createBidSourceChoice) ? (
                                  <CreateBidPrChoice
                                    choice={msg.createBidSourceChoice}
                                    disabled={isStreaming}
                                    onSelect={(prompt) => handleCreateBidSourceSelect(prompt)}
                                  />
                                ) : null}
                                {msg.createBidSourceChoice && isCreateBidEntityChoice(msg.createBidSourceChoice) ? (
                                  <CreateBidEntityChoice
                                    choice={msg.createBidSourceChoice}
                                    disabled={isStreaming}
                                    onSelect={(prompt) => handleCreateBidSourceSelect(prompt)}
                                  />
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
                        )}
                        {msg.role === "user" && (
                          <div className="p-1.5 rounded-md bg-primary/10 h-fit flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>

                      {msg.role === "assistant" && msg.compareBids && (
                        <div className="ml-10 mt-2 max-w-full overflow-hidden" data-testid={`agent-compare-bids-card-${i}`}>
                          <SourcingCompareBidsCard compareBids={msg.compareBids} />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.bidApprovalReview && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-bid-approval-card-${i}`}>
                          <BidApprovalReviewCard
                            spec={msg.bidApprovalReview}
                            disabled={isStreaming}
                            status={msg.bidApprovalStatus || "pending"}
                            onComplete={(result) => handleBidApprovalComplete(i, result)}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "bidApproval"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.openEnvelopeReview && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-open-envelope-card-${i}`}>
                          <OpenEnvelopeReviewCard
                            spec={msg.openEnvelopeReview}
                            disabled={isStreaming}
                            status={msg.openEnvelopeStatus || "pending"}
                            onComplete={() => handleOpenEnvelopeComplete(i)}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "openEnvelope"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.technicalReview && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-technical-review-card-${i}`}>
                          <TechnicalReviewCard
                            spec={msg.technicalReview}
                            disabled={isStreaming}
                            status={msg.technicalReviewStatus || "pending"}
                            onComplete={() => {
                              handleTechnicalReviewComplete(i);
                            }}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "technicalReview"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onConfirmationStateChange={(action) =>
                              syncActivationConfirmation(i, "technicalReview", action)
                            }
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.technicalEvaluation && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-technical-evaluation-card-${i}`}>
                          <TechnicalEvaluationCard
                            spec={msg.technicalEvaluation}
                            disabled={isStreaming}
                            status={msg.technicalEvaluationStatus || "pending"}
                            onComplete={() => {
                              handleTechnicalEvaluationComplete(i);
                            }}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "technicalEvaluation"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onConfirmationStateChange={(action) =>
                              syncActivationConfirmation(i, "technicalEvaluation", action)
                            }
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.commercialReview && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-commercial-review-card-${i}`}>
                          <CommercialReviewCard
                            spec={msg.commercialReview}
                            disabled={isStreaming}
                            status={msg.commercialReviewStatus || "pending"}
                            onComplete={() => {
                              handleCommercialReviewComplete(i);
                            }}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "commercialReview"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onConfirmationStateChange={(action) =>
                              syncActivationConfirmation(i, "commercialReview", action)
                            }
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.commercialEvaluation && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-commercial-evaluation-card-${i}`}>
                          <CommercialEvaluationCard
                            spec={msg.commercialEvaluation}
                            disabled={isStreaming}
                            status={msg.commercialEvaluationStatus || "pending"}
                            onComplete={() => {
                              handleCommercialEvaluationComplete(i);
                            }}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "commercialEvaluation"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onConfirmationStateChange={(action) =>
                              syncActivationConfirmation(i, "commercialEvaluation", action)
                            }
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.awardingReview && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-awarding-review-card-${i}`}>
                          <AwardingReviewCard
                            spec={msg.awardingReview}
                            disabled={isStreaming}
                            status={msg.awardingReviewStatus || "pending"}
                            submitStatus={msg.awardingSubmitStatus || "pending"}
                            onComplete={(details) => {
                              handleAwardingComplete(i, details);
                            }}
                            onSubmitComplete={(details) => {
                              handleAwardingSubmitComplete(i, details);
                            }}
                            onEvaluationSaved={() => {
                              handleAwardingEvaluationSaved(i);
                            }}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              (activationChatRequest.request.card === "awarding" ||
                                activationChatRequest.request.card === "bidAwardSubmit")
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onConfirmationStateChange={(action) => {
                              const card =
                                action === "submit" ? "bidAwardSubmit" : "awarding";
                              syncActivationConfirmation(i, card, action);
                            }}
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.bidAwardSubmitReview && !msg.awardingReview && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-bid-award-submit-card-${i}`}>
                          <BidAwardSubmitReviewCard
                            spec={msg.bidAwardSubmitReview}
                            disabled={isStreaming}
                            status={msg.bidAwardSubmitReviewStatus || "pending"}
                            onComplete={(details) => {
                              handleBidAwardSubmitComplete(i, details);
                            }}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "bidAwardSubmit"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onConfirmationStateChange={(action) =>
                              syncActivationConfirmation(i, "bidAwardSubmit", action)
                            }
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && msg.bidAwardApprovalReview && (
                        <div className="sourcing-activation-card ml-10 mt-2 max-w-4xl w-full overflow-hidden" data-testid={`agent-bid-award-approval-card-${i}`}>
                          <BidAwardApprovalReviewCard
                            spec={msg.bidAwardApprovalReview}
                            disabled={isStreaming}
                            status={msg.bidAwardApprovalStatus || "pending"}
                            onComplete={(result, details) => {
                              handleBidAwardApprovalComplete(i, result, details);
                            }}
                            chatActionRequest={
                              activationChatRequest?.msgIndex === i &&
                              activationChatRequest.request.card === "bidAwardApproval"
                                ? activationChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setActivationChatRequest(null)}
                            onConfirmationStateChange={(action) =>
                              syncActivationConfirmation(i, "bidAwardApproval", action)
                            }
                          />
                        </div>
                      )}

                      {msg.role === "assistant" && isCreateBidSuccess(msg.actionResult) && (
                        <div className="ml-10 mt-2 max-w-xl" data-testid={`create-bid-success-card-${i}`}>
                          <CreateBidSuccessCard
                            result={msg.actionResult}
                            onPublish={() => {
                              if (!isCreateBidSuccess(msg.actionResult)) return;
                              handlePublishFromCreateSuccess(msg.actionResult);
                            }}
                            publishDisabled={isStreaming || confirmInFlightRef.current}
                          />
                          <p className="text-xs opacity-50 mt-1.5">
                            {formatDate(msg.timestamp, true)}
                          </p>
                        </div>
                      )}

                      {msg.role === "assistant" && isPublishBidSuccess(msg.actionResult) && (
                        <div className="ml-10 mt-2 max-w-xl" data-testid={`publish-bid-success-card-${i}`}>
                          <PublishBidSuccessCard result={msg.actionResult} />
                          <p className="text-xs opacity-50 mt-1.5">
                            {formatDate(msg.timestamp, true)}
                          </p>
                        </div>
                      )}

                      {msg.role === "assistant" && msg.actionPreview && msg.actionStatus === "pending" && (
                        <div className="ml-10 mt-2 max-w-xl">
                          {isCreateBidPreview(msg.actionPreview) ? (
                            <CreateBidPreviewCard
                              preview={msg.actionPreview}
                              onConfirm={(editedPreview) =>
                                handleConfirmCreateBidPreview(i, editedPreview)
                              }
                              onSave={(editedPreview) =>
                                handleSaveCreateBidPreviewEdits(i, editedPreview)
                              }
                              disabled={isStreaming || confirmInFlightRef.current}
                              confirmLabel={
                                getMessagePendingActions(msg).length > 1 ? "Looks Good — Confirm All" : "Looks Good"
                              }
                            />
                          ) : isPublishBidPreview(msg.actionPreview) ? (
                            <PublishBidPreviewCard
                              preview={msg.actionPreview}
                              onConfirmPublish={
                                msg.actionPreview.canPublish && getMessagePendingActions(msg).length > 0
                                  ? () => handleConfirmAction(i)
                                  : undefined
                              }
                              onApplyRemediation={(data) => handleApplyPublishRemediation(i, data)}
                              onMakeChanges={handlePublishPreviewMakeChanges}
                              onPreviewUpdated={(nextPreview) => {
                                setConversation((prev) =>
                                  prev.map((m, idx) => {
                                    if (idx !== i) return m;
                                    if (nextPreview.canPublish) {
                                      const publishAction = {
                                        type: "publish_bid",
                                        data: { bidId: nextPreview.bidId, preview: nextPreview },
                                        summary: `Publish bid ${nextPreview.bidLabel}`,
                                      };
                                      return {
                                        ...m,
                                        actionPreview: nextPreview,
                                        pendingAction: publishAction,
                                        pendingActions: [publishAction],
                                        actionStatus: "pending" as const,
                                      };
                                    }
                                    return {
                                      ...m,
                                      actionPreview: nextPreview,
                                      pendingAction: undefined,
                                      pendingActions: undefined,
                                      actionStatus: "pending" as const,
                                    };
                                  }),
                                );
                              }}
                              disabled={isStreaming || confirmInFlightRef.current}
                            />
                          ) : null}
                        </div>
                      )}

                      {getMessagePendingActions(msg).length > 0 && msg.actionStatus === "pending" && (() => {
                        const actions = getMessagePendingActions(msg);
                        const isRemediation = actions.length === 1 && actions[0].type === "ai_remediate_bid";
                        if (isRemediation && !isPublishBidPreview(msg.actionPreview)) {
                          return (
                            <div className="ml-10 mt-2">
                              <RemediationReviewCard
                                data={actions[0].data as RemediationData}
                                onApply={(modifiedData) => handleApplyRemediation(i, modifiedData)}
                                onCancel={() => handleCancelAction(i)}
                                disabled={isStreaming || confirmInFlightRef.current}
                              />
                            </div>
                          );
                        }
                        const isCriteriaGeneration =
                          actions.length === 1 && actions[0].type === "ai_generate_requirements";
                        if (isCriteriaGeneration) {
                          return (
                            <div className="ml-10 mt-2 max-w-xl">
                              <CriteriaGeneratePreviewCard
                                bidLabel={actions[0].data?.bidLabel}
                                requirements={(actions[0].data?.requirements || []) as CriteriaGenerateItem[]}
                                onConfirm={(selectedRequirements) =>
                                  handleConfirmCriteriaGeneration(i, selectedRequirements)
                                }
                                disabled={isStreaming || confirmInFlightRef.current}
                              />
                            </div>
                          );
                        }
                        const isCriteriaRegeneration =
                          actions.length === 1 && actions[0].type === "ai_regenerate_requirements";
                        if (isCriteriaRegeneration) {
                          return (
                            <div className="ml-10 mt-2 max-w-xl">
                              <RegenerateCriteriaPreviewCard
                                bidLabel={actions[0].data?.bidLabel}
                                plan={(actions[0].data?.plan || []) as ReconciledCriteriaItem[]}
                                onConfirm={(selectedActions) =>
                                  handleConfirmCriteriaRegeneration(i, selectedActions)
                                }
                                disabled={isStreaming || confirmInFlightRef.current}
                              />
                            </div>
                          );
                        }
                        const isClausesGeneration =
                          actions.length === 1 && actions[0].type === "ai_generate_clauses";
                        if (isClausesGeneration) {
                          return (
                            <div className="ml-10 mt-2 max-w-xl">
                              <ClausesGeneratePreviewCard
                                bidLabel={actions[0].data?.bidLabel}
                                clauses={(actions[0].data?.clauses || []) as ClauseGenerateItem[]}
                                onConfirm={(selectedClauses) =>
                                  handleConfirmClausesGeneration(i, selectedClauses)
                                }
                                disabled={isStreaming || confirmInFlightRef.current}
                              />
                            </div>
                          );
                        }
                        if (msg.actionPreview && (isCreateBidPreview(msg.actionPreview) || isPublishBidPreview(msg.actionPreview))) {
                          return null;
                        }
                        return (
                          <div className="ml-10 mt-2">
                            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2 mb-2">
                                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                      {actions.length === 1 ? "Confirm Action" : `Confirm Actions (${actions.length})`}
                                    </p>
                                    <ul className="text-xs text-amber-700 dark:text-amber-300 mt-1 space-y-0.5 list-decimal list-inside">
                                      {actions.map((action, actionIdx) => (
                                        <li key={`${action.type}-${actionIdx}`}>{action.summary}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 ml-6">
                                  {actions.length > 1 ? (
                                    <Button
                                      size="sm"
                                      className="bg-emerald-600 text-white gap-1"
                                      onClick={() => handleConfirmAllActions(i)}
                                      disabled={isStreaming || confirmInFlightRef.current}
                                      data-testid={`button-confirm-all-actions-${i}`}
                                    >
                                      <Check className="h-3 w-3" />
                                      Confirm all
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      className="bg-emerald-600 text-white gap-1"
                                      onClick={() => handleConfirmAction(i)}
                                      disabled={isStreaming || confirmInFlightRef.current}
                                      data-testid={`button-confirm-action-${i}`}
                                    >
                                      <Check className="h-3 w-3" />
                                      Confirm
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    onClick={() => handleCancelAction(i)}
                                    disabled={isStreaming || confirmInFlightRef.current}
                                    data-testid={`button-cancel-action-${i}`}
                                  >
                                    <X className="h-3 w-3" />
                                    Cancel
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        );
                      })()}

                      {getMessagePendingActions(msg).length > 0 && msg.actionStatus === "confirmed" && (
                        <div className="ml-10 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Action confirmed and executed
                          </div>
                        </div>
                      )}

                      {getMessagePendingActions(msg).length > 0 && msg.actionStatus === "cancelled" && (
                        <div className="ml-10 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <X className="h-3.5 w-3.5" />
                            Action cancelled
                          </div>
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
                onClick={handleCreateBidClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-create-bid"
              >
                Create Bid
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConvertPRClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-convert-pr"
              >
                Convert PR
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewBidsClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-view-bids"
              >
                View Bids
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAwardsAnalyticsClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-awards"
              >
                Awards
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAnalyticsClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-analytics"
              >
                Analytics
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdatesClick}
                disabled={isStreaming}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-updates"
              >
                Updates
              </Button>
            </div>
            <div className="relative w-full flex-shrink-0" ref={composerRef}>
            <ChatComposer
              isCompact
              singleRow
              placeholder="Ask Prokraya Ai (@ supplier, # user, / item, ^ bid, & PR, % PO, $ invoice)"
              value={sourcingPrompt}
              onChange={(e) =>
                handlePromptChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
              }
              onClick={(e) =>
                refreshMentionContext(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart ?? e.currentTarget.value.length,
                )
              }
              onKeyUp={(e) =>
                refreshMentionContext(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart ?? e.currentTarget.value.length,
                )
              }
              onSelect={(e) =>
                refreshMentionContext(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart ?? e.currentTarget.value.length,
                )
              }
              onKeyDown={handleKeyDown}
              onSubmit={handleSourcingSubmit}
              onStop={stopStreaming}
              isStreaming={isStreaming}
              colorTheme="purple"
              ref={sourcingInputRef}
              textareaDataTestId="input-sourcing-prompt"
              submitDataTestId="button-sourcing-submit"
              backdrop={mentionBackdrop}
              onMicTranscript={(t) => setSourcingPrompt((p) => (p ? p + " " + t : t))}
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
              {activeMentionDropdown === "supplier" && mentionTrigger && (
                  <div
                    className="absolute z-[100] min-w-[260px] max-w-[320px] rounded-md border bg-background shadow-lg"
                    style={mentionDropdownAboveLineStyle(mentionDropdownPos)}
                    data-testid="sourcing-mention-dropdown"
                  >
                    <div className="max-h-60 overflow-auto py-1">
                      {isMentionLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching suppliers...
                        </div>
                      ) : mentionSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No suppliers found
                        </div>
                      ) : (
                        mentionSuggestions.map((vendor, idx) => (
                          <button
                            type="button"
                            key={`${vendor.id}-${vendor.companyName || "vendor"}`}
                            className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${
                              idx === mentionHighlightIndex ? "bg-muted" : ""
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleMentionPick(vendor);
                            }}
                            data-testid={`sourcing-mention-option-${vendor.id}`}
                          >
                            <div className="text-sm">{vendor.companyName || "Unnamed vendor"}</div>
                            <div className="text-xs text-muted-foreground">
                              {vendor.emailId || "No email"}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
                {activeMentionDropdown === "businessUser" && hashMentionTrigger && (
                  <div
                    className="absolute z-[100] min-w-[260px] max-w-[320px] rounded-md border bg-background shadow-lg"
                    style={mentionDropdownAboveLineStyle(mentionDropdownPos)}
                    data-testid="sourcing-hash-mention-dropdown"
                  >
                    <div className="max-h-60 overflow-auto py-1">
                      {isHashMentionLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching business users...
                        </div>
                      ) : hashMentionSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No business users found
                        </div>
                      ) : (
                        hashMentionSuggestions.map((user, idx) => (
                          <button
                            type="button"
                            key={`${user.id}-${user.name}`}
                            className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${
                              idx === hashMentionHighlightIndex ? "bg-muted" : ""
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleHashMentionPick(user);
                            }}
                            data-testid={`sourcing-hash-mention-option-${user.id}`}
                          >
                            <div className="text-sm">{user.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {user.email_id || "No email"}
                              {user.department_name ? ` · ${user.department_name}` : ""}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              {activeMentionDropdown === "item" && slashMentionTrigger && (
                  <div
                    className="absolute z-[100] min-w-[260px] max-w-[320px] rounded-md border bg-background shadow-lg"
                    style={mentionDropdownAboveLineStyle(mentionDropdownPos)}
                    data-testid="sourcing-slash-mention-dropdown"
                  >
                    <div className="max-h-60 overflow-auto py-1">
                      {isSlashMentionLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching items...
                        </div>
                      ) : slashMentionSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No items found
                        </div>
                      ) : (
                        slashMentionSuggestions.map((item, idx) => (
                          <button
                            type="button"
                            key={`${item.id}-${item.name}`}
                            className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${
                              idx === slashMentionHighlightIndex ? "bg-muted" : ""
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleSlashMentionPick(item);
                            }}
                            data-testid={`sourcing-slash-mention-option-${item.id}`}
                          >
                            <div className="text-sm">{itemMentionLabel(item)}</div>
                            <div className="text-xs text-muted-foreground">
                              SKU: {item.sku || item.itemCode || "N/A"}
                              {item.categoryName ? ` · ${item.categoryName}` : ""}
                              {` · ID: ${item.id}`}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
              )}
              {activeMentionDropdown === "bid" && caretMentionTrigger && (
                  <div
                    className="absolute z-[100] min-w-[280px] max-w-[360px] rounded-md border bg-background shadow-lg"
                    style={mentionDropdownAboveLineStyle(mentionDropdownPos)}
                    data-testid="sourcing-caret-mention-dropdown"
                  >
                    <div className="max-h-60 overflow-auto py-1">
                      {isCaretMentionLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching bids...
                        </div>
                      ) : caretMentionSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No bids found
                        </div>
                      ) : (
                        caretMentionSuggestions.map((bid, idx) => (
                          <button
                            type="button"
                            key={`${bid.id}-${bid.bidNumber}`}
                            className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${
                              idx === caretMentionHighlightIndex ? "bg-muted" : ""
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleCaretMentionPick(bid);
                            }}
                            data-testid={`sourcing-caret-mention-option-${bid.id}`}
                          >
                            <div className="text-sm font-medium">{bid.bidNumber}</div>
                            <div className="text-xs text-muted-foreground">
                              {bid.bidTitle || "No title"}
                              {bid.bidStatus ? ` · ${bid.bidStatus}` : ""}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              {activeMentionDropdown === "pr" && ampersandMentionTrigger && (
                  <div
                    className="absolute z-[100] min-w-[280px] max-w-[360px] rounded-md border bg-background shadow-lg"
                    style={mentionDropdownAboveLineStyle(mentionDropdownPos)}
                    data-testid="sourcing-ampersand-mention-dropdown"
                  >
                    <div className="max-h-60 overflow-auto py-1">
                      {isAmpersandMentionLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching purchase requests...
                        </div>
                      ) : ampersandMentionSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No purchase requests found
                        </div>
                      ) : (
                        ampersandMentionSuggestions.map((pr, idx) => (
                          <button
                            type="button"
                            key={pr.prNumber}
                            className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${
                              idx === ampersandMentionHighlightIndex ? "bg-muted" : ""
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleAmpersandMentionPick(pr);
                            }}
                            data-testid={`sourcing-ampersand-mention-option-${pr.prNumber}`}
                          >
                            <div className="text-sm font-medium">{pr.prNumber}</div>
                            <div className="text-xs text-muted-foreground">
                              {pr.prDescription || "No description"}
                              {pr.prStatus ? ` · ${pr.prStatus}` : ""}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              {activeMentionDropdown === "po" && percentMentionTrigger && (
                  <div
                    className="absolute z-[100] min-w-[280px] max-w-[360px] rounded-md border bg-background shadow-lg"
                    style={mentionDropdownAboveLineStyle(mentionDropdownPos)}
                    data-testid="sourcing-percent-mention-dropdown"
                  >
                    <div className="max-h-60 overflow-auto py-1">
                      {isPercentMentionLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching purchase orders...
                        </div>
                      ) : percentMentionSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No purchase orders found
                        </div>
                      ) : (
                        percentMentionSuggestions.map((po, idx) => (
                          <button
                            type="button"
                            key={po.poNumber}
                            className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${
                              idx === percentMentionHighlightIndex ? "bg-muted" : ""
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handlePercentMentionPick(po);
                            }}
                            data-testid={`sourcing-percent-mention-option-${po.poNumber}`}
                          >
                            <div className="text-sm font-medium">{po.poNumber}</div>
                            <div className="text-xs text-muted-foreground">
                              {po.poDescription || po.companyName || "No description"}
                              {po.poStatus ? ` · ${po.poStatus}` : ""}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              {activeMentionDropdown === "invoice" && dollarMentionTrigger && (
                  <div
                    className="absolute z-[100] min-w-[280px] max-w-[360px] rounded-md border bg-background shadow-lg"
                    style={mentionDropdownAboveLineStyle(mentionDropdownPos)}
                    data-testid="sourcing-dollar-mention-dropdown"
                  >
                    <div className="max-h-60 overflow-auto py-1">
                      {isDollarMentionLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching invoices...
                        </div>
                      ) : dollarMentionSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No invoices found
                        </div>
                      ) : (
                        dollarMentionSuggestions.map((invoice, idx) => (
                          <button
                            type="button"
                            key={`${invoice.invoiceId}-${invoice.invoiceNumber}`}
                            className={`w-full text-left px-3 py-2 hover:bg-muted/80 ${
                              idx === dollarMentionHighlightIndex ? "bg-muted" : ""
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleDollarMentionPick(invoice);
                            }}
                            data-testid={`sourcing-dollar-mention-option-${invoice.invoiceNumber}`}
                          >
                            <div className="text-sm font-medium">{invoice.invoiceNumber}</div>
                            <div className="text-xs text-muted-foreground">
                              {[invoice.supplierName, invoice.poNumber, invoice.invoiceStatus]
                                .filter(Boolean)
                                .join(" · ") || "Invoice"}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
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
              <div className="mx-auto h-full w-px bg-border/70 hover:bg-purple-500" />
            </div>
          <Card className="w-full h-full flex flex-col min-h-0 overflow-hidden">
            <CardContent className="flex-1 p-0 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3 border-b flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-purple-600 dark:text-purple-400" />
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
                {sourcingAgentPrompts.map((category) => (
                    <div key={category.module} className="border rounded-md">
                      <Button
                        variant="ghost"
                        onClick={() => toggleCategory(category.module)}
                        className="w-full flex items-start justify-between gap-2 h-auto py-2 px-3"
                        data-testid={`button-category-${category.module}`}
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1 text-left">
                          {expandedCategories.has(category.module) ? (
                            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          )}
                          <span className="font-medium text-xs whitespace-normal">{category.module}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {category.prompts.length}
                        </Badge>
                      </Button>
                      {expandedCategories.has(category.module) && (
                        <div className="px-3 pb-2 pt-1 border-t space-y-1 bg-muted/30">
                          {category.prompts.map((prompt, idx) => (
                            <Button
                              key={idx}
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-xs h-auto py-1.5 text-left whitespace-normal"
                              onClick={() => {
                                replacePromptText(prompt);
                                requestAnimationFrame(() => {
                                  const ranges = getPlaceholderRanges(prompt);
                                  const first = ranges[0];
                                  if (first) focusAndSelectRange(first.start, first.end);
                                  else focusAndSelectRange(prompt.length, prompt.length);
                                });
                              }}
                              data-testid={`button-prompt-${category.module}-${idx}`}
                            >
                              {prompt}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
}
