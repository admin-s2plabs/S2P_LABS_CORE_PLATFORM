import { useState, useRef, useEffect } from "react";
import { useAgentConversation, type ConversationMessage } from "@/hooks/useAgentConversation";
import { Link } from "wouter";
import { 
  Send,
  Loader2,
  Users,
  Sparkles,
  Bot,
  Shield,
  FileCheck,
  TrendingUp,
  AlertTriangle,
  User,
  Search,
  ArrowLeft,
  CheckCircle2,
  BarChart3,
  UserPlus,
  Mail,
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
  Pencil
} from "lucide-react";
import { vendorAgentPrompts } from "./vendor-agent-prompts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CapabilitiesInfoButton } from "@/components/agent-panels/capabilities-info-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
/* Vendor selection has been intentionally disabled.
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
*/
import { streamAgentQuery } from "@/lib/streamAgentQuery";
import { AgentChartMessage } from "./agent-chart-message";
import { SupplierActivationSignalsPopover } from "./supplier-activation-signals-popover";
import { SupplierPendingTasksFlow } from "./supplier-pending-tasks-flow";
import { SupplierApprovalReviewCard } from "./supplier-approval-review-card";
import type {
  SupplierApprovalAction,
  SupplierApprovalChatActionRequest,
} from "./supplier-approval-review-card";
import type { SupplierActivationStageItem } from "@shared/supplier-activation-signals";
import {
  readSupplierActivationPreferences,
  useSupplierActivationPreferences,
} from "@/hooks/useSupplierActivationPreferences";
import { SUPPLIER_ACTIVATION_SIGNALS_QUERY_KEY } from "@/hooks/useSupplierActivationSignals";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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

/**
 * Detects a short, unambiguous affirmative reply used to confirm a pending
 * onboard/invite action in chat (the "type a confirmation" path, alongside the
 * Confirm button). Matches the whole message so things like "yes but change the
 * email" do NOT trigger execution. Keep in sync with the confirmation words
 * documented in the vendor-agent system prompt (confirm/approve/yes/proceed/...).
 */
function isChatConfirmation(text: string): boolean {
  return /^\s*(?:confirm(?:ed)?|proceed|approve[d]?|yes(?:\s+please)?|yeah|yep|ok(?:ay)?|sure|go(?:\s+ahead)?|do\s+it|send(?:\s+it)?|create(?:\s+it)?|continue)\s*[.!]?\s*$/i.test(
    text,
  );
}

/**
 * Semantic intent detection for approval-card chat commands.
 * Recognizes natural-language approve / reject / more-info variations
 * (e.g. "please approve this", "go ahead and approve", "confirm approval")
 * rather than requiring exact phrase matches. Trailing remarks become comments.
 */
function parseSupplierApprovalCommand(
  text: string,
): { action: SupplierApprovalAction; comments: string } | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 280) return null;

  const lower = normalized.toLowerCase();

  // Skip clear information-seeking / list queries even when a card is active.
  if (
    /^(?:how|what|why|when|where|who|which|list|show|find|get|search|tell\s+me|how\s+many)\b/.test(lower) ||
    /\b(?:how\s+(?:do|can|should)\s+i|what\s+(?:does|is)|list\s+of|show\s+me\s+all)\b/.test(lower)
  ) {
    return null;
  }

  const moreInfoIntent =
    /\b(?:(?:please\s+)?(?:request(?:ing)?|ask(?:ing)?\s+for|need(?:s|ed)?|require(?:s|d)?|want|send\s+back\s+for|return(?:ing)?(?:\s+it)?\s+for|seek(?:ing)?)\s+more\s+(?:info(?:rmation)?|details|data|clarification)|more\s+info(?:rmation)?(?:\s+(?:requested|required|needed))?|request\s+more\s+info(?:rmation)?|ask\s+(?:them|the\s+supplier)\s+for\s+more|need\s+more\s+(?:info(?:rmation)?|details)|send\s+(?:it\s+)?back(?:\s+for\s+more)?)\b/i;

  const rejectIntent =
    /\b(?:(?:please\s+)?reject(?:ing|ed)?|(?:please\s+)?deny(?:ing)?|(?:please\s+)?denie[ds]?|(?:please\s+)?decline(?:d|s)?|turn(?:ing)?\s+(?:this|it|them)?\s*down|refuse(?:d|s)?|do\s+not\s+approve|don'?t\s+approve|not\s+approv(?:e|ed|ing)|go\s+ahead\s+and\s+reject|confirm(?:ing)?\s+(?:the\s+)?rejection)\b/i;

  const approveIntent =
    /\b(?:(?:please\s+)?approve(?:d|s|ing)?|(?:please\s+)?(?:give|grant)\s+(?:it\s+)?(?:the\s+)?approval|confirm(?:ing)?\s+(?:the\s+)?approval|go\s+ahead(?:\s+and\s+approve)?|give\s+(?:it\s+)?(?:the\s+)?(?:go[\s-]?ahead|green[\s-]?light)|green[\s-]?light(?:\s+(?:this|it|them|the\s+supplier))?|proceed\s+with\s+(?:the\s+)?approv(?:e|al)|accept(?:ing|ed)?\s+(?:this|it|the\s+supplier)|i\s+(?:want\s+to\s+)?approve|let'?s\s+approve|ok(?:ay)?\s+to\s+approve)\b/i;

  type Detected = { action: SupplierApprovalAction; strength: number };
  const candidates: Detected[] = [];

  if (moreInfoIntent.test(normalized)) candidates.push({ action: "More", strength: 3 });
  if (rejectIntent.test(normalized)) candidates.push({ action: "Reject", strength: 2 });
  if (approveIntent.test(normalized)) candidates.push({ action: "Approve", strength: 1 });

  if (candidates.length === 0) return null;

  // Prefer more-info > reject > approve when signals overlap (e.g. "do not approve").
  candidates.sort((a, b) => b.strength - a.strength);
  const action = candidates[0].action;

  const comments = extractApprovalComments(normalized, action);
  return { action, comments };
}

/** Strip the intent phrasing and common filler so any leftover text becomes comments. */
function extractApprovalComments(text: string, action: SupplierApprovalAction): string {
  let remainder = text;

  if (action === "More") {
    remainder = remainder.replace(
      /(?:please\s+)?(?:request(?:ing)?|ask(?:ing)?\s+for|need(?:s|ed)?|require(?:s|d)?|want|send\s+back\s+for|return(?:ing)?(?:\s+it)?\s+for|seek(?:ing)?)\s+more\s+(?:info(?:rmation)?|details|data|clarification)/gi,
      " ",
    );
    remainder = remainder.replace(
      /more\s+info(?:rmation)?(?:\s+(?:requested|required|needed))?|request\s+more\s+info(?:rmation)?|ask\s+(?:them|the\s+supplier)\s+for\s+more|need\s+more\s+(?:info(?:rmation)?|details)|send\s+(?:it\s+)?back(?:\s+for\s+more)?/gi,
      " ",
    );
  } else if (action === "Reject") {
    remainder = remainder.replace(
      /(?:please\s+)?(?:go\s+ahead\s+and\s+)?(?:reject(?:ing|ed)?|deny(?:ing)?|denie[ds]?|decline(?:d|s)?|turn(?:ing)?\s+(?:this|it|them)?\s*down|refuse(?:d|s)?|do\s+not\s+approve|don'?t\s+approve|not\s+approv(?:e|ed|ing)|confirm(?:ing)?\s+(?:the\s+)?rejection)/gi,
      " ",
    );
  } else {
    remainder = remainder.replace(
      /(?:please\s+)?(?:go\s+ahead\s+and\s+)?(?:approve(?:d|s|ing)?|(?:give|grant)\s+(?:it\s+)?(?:the\s+)?approval|confirm(?:ing)?\s+(?:the\s+)?approval|go\s+ahead|give\s+(?:it\s+)?(?:the\s+)?(?:go[\s-]?ahead|green[\s-]?light)|green[\s-]?light|proceed\s+with\s+(?:the\s+)?approv(?:e|al)|accept(?:ing|ed)?|i\s+(?:want\s+to\s+)?approve|let'?s\s+approve|ok(?:ay)?\s+to\s+approve)/gi,
      " ",
    );
  }

  remainder = remainder
    .replace(
      /\b(?:this|it|them|the\s+supplier|supplier|registration|profile|vendor|for\s+me|help\s+me|now|please|thanks|thank\s+you)\b/gi,
      " ",
    )
    .replace(/^[\s:–—,.\-]+|[\s:–—,.\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Ignore leftovers that are only politeness / deixis, not real comments.
  if (!remainder || /^(?:yes|ok|okay|sure|please|thanks|thank you)$/i.test(remainder)) {
    return "";
  }
  return remainder;
}

function approvalActionAck(
  action: SupplierApprovalAction,
  companyName: string,
  hasComments: boolean,
): string {
  if (hasComments) {
    return action === "Approve"
      ? `Approve is selected for **${companyName}** and your comments are prefilled. Review them, then confirm.`
      : action === "Reject"
        ? `Reject is selected for **${companyName}** and your comments are prefilled. Review them, then confirm.`
        : `Request More Info is selected for **${companyName}** and your comments are prefilled. Review them, then confirm.`;
  }
  return action === "Approve"
    ? `Approve is selected for **${companyName}**. Add the required comments, then confirm the approval.`
    : action === "Reject"
      ? `Reject is selected for **${companyName}**. Add the required comments, then confirm the rejection.`
      : `Request More Info is selected for **${companyName}**. Add the required comments, then confirm the request.`;
}

/**
 * Follow-up intent while an approval confirmation panel is already open.
 * Treats the message as part of that workflow: cancel, or confirm with
 * optional extracted comments (e.g. "add looks good and confirm").
 */
function parseApprovalConfirmationFollowUp(text: string): {
  intent: "confirm" | "cancel";
  comments: string;
} {
  const normalized = text.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();

  const isCancel =
    /^(?:no|nope|nah|cancel(?:led|ation)?|never\s*mind|nevermind|abort|stop|dismiss|go\s+back|not\s+now|forget\s+it)\s*[.!]?\s*$/i.test(
      lower,
    ) ||
    (/\b(?:cancel(?:\s+that|\s+it)?|never\s*mind|forget\s+it|don'?t\s+(?:do\s+it|proceed|confirm|submit)|abort|dismiss)\b/i.test(
      lower,
    ) &&
      !/\b(?:approve|reject|more\s+info|confirm\s+approv)/i.test(lower));

  if (isCancel) {
    return { intent: "cancel", comments: "" };
  }

  // Strip confirm / add-comment scaffolding; leftover text is the comment body.
  let comments = normalized
    .replace(
      /\b(?:please\s+)?(?:add(?:\s+(?:a\s+)?comment(?:s)?)?|comment(?:s)?\s*(?:is|are|:)?|set\s+comment(?:s)?(?:\s+to)?|with\s+comment(?:s)?)\b/gi,
      " ",
    )
    .replace(
      /\b(?:and\s+)?(?:then\s+)?(?:please\s+)?(?:confirm(?:\s+it|\s+the\s+approval|\s+the\s+rejection|\s+the\s+request)?|yes|yep|yeah|proceed|go\s+ahead|submit|do\s+it|ok(?:ay)?|sure)\b/gi,
      " ",
    )
    .replace(/^[\s:–—,.\-]+|[\s:–—,.\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Pure confirmation with no comment content.
  if (
    !comments &&
    /^(?:yes|yep|yeah|ok(?:ay)?|sure|confirm(?:ed)?|proceed|go\s+ahead|do\s+it|submit)\s*[.!]?\s*$/i.test(
      lower,
    )
  ) {
    return { intent: "confirm", comments: "" };
  }

  // Any other message in this state is treated as comments (+ implicit confirm).
  if (!comments) comments = normalized;
  return { intent: "confirm", comments };
}

/** Legal entity types accepted by the onboarding form (mirrors the vendor-agent system prompt). */
const LEGAL_ENTITY_OPTIONS = [
  "Proprietor",
  "Partner",
  "LLP",
  "Private",
  "Public",
  "Government",
  "Trust",
  "Society",
  "Cooperative",
  "Other",
] as const;

type ActionEditField = { key: string; label: string; type?: "text" | "select" | "textarea" };

/** Editable fields for an onboarding pending action (keys match the server `normalized` data shape). */
const ONBOARD_EDIT_FIELDS: ActionEditField[] = [
  { key: "companyName", label: "Company Name" },
  { key: "address", label: "Address", type: "textarea" },
  { key: "legalEntityType", label: "Legal Entity", type: "select" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "postalCode", label: "Postal Code" },
  { key: "contactName", label: "Contact" },
  { key: "emailId", label: "Email" },
  { key: "mobileNo", label: "Mobile" },
];

/** Editable fields for a single-vendor invite pending action. */
const INVITE_EDIT_FIELDS: ActionEditField[] = [
  { key: "companyName", label: "Company Name" },
  { key: "email", label: "Email" },
];

/** Rebuilds the short pending-action summary after the user edits the data, keeping it in sync with the server format. */
function rebuildActionSummary(type: string, d: any): string {
  if (type === "onboard") {
    return `Create vendor "${d?.companyName ?? ""}" in ${d?.city ?? ""}, ${d?.country ?? ""} with contact ${d?.contactName ?? ""} (${d?.emailId ?? ""})`;
  }
  if (type === "invite") {
    return `Send invitation to "${d?.companyName ?? ""}" at ${d?.email ?? ""}`;
  }
  if (type === "bulk_invite") {
    const count = Array.isArray(d?.invites) ? d.invites.length : 0;
    return `Send ${count} vendor invitation${count === 1 ? "" : "s"}`;
  }
  return "";
}

/** Rebuilds the full preview bubble (msg.content) after an edit so it matches the edited data. Mirrors the server preview format. Returns null for types whose card already renders live values (bulk_invite). */
function rebuildActionPreview(type: string, d: any): string | null {
  if (type === "onboard") {
    let s = `## Vendor Onboarding Preview\n\n`;
    s += `**Company Name:** ${d?.companyName ?? ""}\n`;
    s += `**Address:** ${d?.address ?? ""}\n`;
    s += `**Legal Entity:** ${d?.legalEntityType ?? ""}\n`;
    s += `**City:** ${d?.city ?? ""}\n`;
    if (d?.state) s += `**State:** ${d.state}\n`;
    s += `**Country:** ${d?.country ?? ""}\n`;
    s += `**Postal Code:** ${d?.postalCode ?? ""}\n`;
    s += `**Contact:** ${d?.contactName ?? ""}\n`;
    if (d?.designation) s += `**Designation:** ${d.designation}\n`;
    s += `**Email:** ${d?.emailId ?? ""}\n`;
    s += `**Mobile:** ${d?.mobileNo ?? ""}\n`;
    if (d?.licenseNo) s += `**License No:** ${d.licenseNo}\n`;
    return s;
  }
  if (type === "invite") {
    let s = `## Vendor Invitation Preview\n\n`;
    s += `**Company Name:** ${d?.companyName ?? ""}\n`;
    s += `**Email:** ${d?.email ?? ""}\n`;
    s += `**Action:** Send registration invitation\n`;
    return s;
  }
  return null;
}

function VendorMessageCharts({ msg }: { msg: ConversationMessage }) {
  if (msg.pendingAction) return null;
  if (msg.charts?.length) {
    return (
      <div className="mt-3 flex flex-col gap-4">
        {msg.charts.map((spec, idx) => (
          <AgentChartMessage key={idx} spec={spec} />
        ))}
      </div>
    );
  }
  if (msg.chart) {
    return (
      <div className="mt-3">
        <AgentChartMessage spec={msg.chart} />
      </div>
    );
  }
  return null;
}
import { formatDate } from "@/lib/common-functions";

const capabilities = [
  { icon: Search, label: "Supplier Search", description: "Search and query supplier data in real-time" },
  { icon: UserPlus, label: "AI Onboarding", description: "Create suppliers from natural language" },
  { icon: Mail, label: "Invite Suppliers", description: "Send invitations conversationally" },
  // { icon: Shield, label: "Risk Assessment", description: "AI-powered supplier risk scoring" },
  { icon: TrendingUp, label: "Performance", description: "Track supplier KPIs and delivery" },
  { icon: BarChart3, label: "Statistics", description: "Dashboard-level supplier analytics" },
  { icon: FileCheck, label: "Compliance", description: "Monitor documents and certifications" },
  { icon: AlertTriangle, label: "Alerts", description: "Proactive risk and expiry alerts" },
];

interface VendorOption {
  id: number;
  companyName: string | null;
  emailId: string | null;
  supplierId?: string | null;
}

interface ComparisonVendor {
  name: string;
  id: string;
  metrics: Record<string, string>;
}

interface ParsedVendorComparison {
  vendors: ComparisonVendor[];
}

/* Vendor selection has been intentionally disabled.
const VENDOR_BROWSE_PAGE_SIZE = 50;
*/

/* Vendor selection has been intentionally disabled — Select Vendor UI must not be shown.
function VendorSelectionCard(props: {
  data: any;
  disabled: boolean;
  onSelect: (vendor: VendorOption) => void;
}) {
  const { data, disabled, onSelect } = props;
  const isComparisonSelection = /\bcompare|comparison|vs\.?|versus\b/i.test(String(data?.originalPrompt || ""));
  const shouldRenderSearchInput = !isComparisonSelection;
  const [query, setQuery] = useState<string>(data?.prefill || "");
  const [vendors, setVendors] = useState<VendorOption[]>(
    () => (Array.isArray(data?.initialCandidates) ? data.initialCandidates : []),
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const queryRef = useRef(query);
  const browseHasMoreRef = useRef(false);
  const vendorsLengthRef = useRef(0);
  const loadingMoreInFlightRef = useRef(false);

  queryRef.current = query;
  browseHasMoreRef.current = browseHasMore;
  vendorsLengthRef.current = vendors.length;

  useEffect(() => {
    setQuery(data?.prefill || "");
    setVendors(Array.isArray(data?.initialCandidates) ? data.initialCandidates : []);
  }, [data?.prefill, data?.initialCandidates]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();

    if (!q) {
      (async () => {
        try {
          setLoading(true);
          setBrowseHasMore(false);
          const res = await fetch(
            `/api/vendor-agent/vendors/search?limit=${VENDOR_BROWSE_PAGE_SIZE}&offset=0`,
            { credentials: "include" },
          );
          if (!res.ok) throw new Error("Browse failed");
          const payload = await res.json();
          if (cancelled) return;
          if (queryRef.current.trim()) return;
          setVendors(Array.isArray(payload?.vendors) ? payload.vendors : []);
          setBrowseHasMore(!!payload?.hasMore);
        } catch {
          if (!cancelled && !queryRef.current.trim()) setVendors([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/vendor-agent/vendors/search?q=${encodeURIComponent(q)}&limit=8`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error("Search failed");
        const payload = await res.json();
        if (cancelled) return;
        if (queryRef.current.trim() !== q) return;
        setVendors(Array.isArray(payload?.vendors) ? payload.vendors : []);
        setBrowseHasMore(false);
      } catch {
        if (!cancelled && queryRef.current.trim() === q) setVendors([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const loadMoreBrowse = async () => {
    if (queryRef.current.trim()) return;
    if (!browseHasMoreRef.current || loadingMoreInFlightRef.current) return;
    loadingMoreInFlightRef.current = true;
    setLoadingMore(true);
    try {
      const offset = vendorsLengthRef.current;
      const res = await fetch(
        `/api/vendor-agent/vendors/search?limit=${VENDOR_BROWSE_PAGE_SIZE}&offset=${offset}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Browse page failed");
      const payload = await res.json();
      if (queryRef.current.trim()) return;
      const next = Array.isArray(payload?.vendors) ? payload.vendors : [];
      setVendors((prev) => [...prev, ...next]);
      setBrowseHasMore(!!payload?.hasMore);
    } catch {
      // keep existing list
    } finally {
      loadingMoreInFlightRef.current = false;
      setLoadingMore(false);
    }
  };

  const handleListScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (queryRef.current.trim()) return;
    if (loading || !browseHasMoreRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    void loadMoreBrowse();
  };

  return (
    <Card className="border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-900/10">
      <CardContent className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <Search className="h-4 w-4 text-cyan-600 dark:text-cyan-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-cyan-900 dark:text-cyan-100">Select Vendor</p>
            <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-0.5">
              {isComparisonSelection
                ? "Scroll the list to pick a vendor."
                : "Scroll the list to pick a vendor, or type a name, email or ID to filter results."}
            </p>
          </div>
        </div>
        <div className="ml-6">
          <Command shouldFilter={false} className="rounded-md border bg-background">
            {shouldRenderSearchInput && (
              <CommandInput
                placeholder="Type vendor name, email or ID..."
                value={query}
                onValueChange={setQuery}
              />
            )}
            <CommandList className="max-h-[min(50vh,380px)]" onScroll={handleListScroll}>
              {loading && (
                <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {query.trim() ? "Searching vendors..." : "Loading vendors..."}
                </div>
              )}
              {!loading && (
                <>
                  <CommandEmpty>
                    {query.trim() ? "No vendors found" : "No vendors in the database"}
                  </CommandEmpty>
                  <CommandGroup heading="Vendors">
                    {vendors.map((vendor) => (
                      <CommandItem
                        key={vendor.id}
                        value={`${vendor.companyName || ""} ${vendor.emailId || ""} ${vendor.supplierId || ""} ${vendor.id}`}
                        onSelect={() => onSelect(vendor)}
                        disabled={disabled}
                      >
                        <div className="flex flex-col w-full">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{vendor.companyName || "Unnamed vendor"}</span>
                            {vendor.supplierId && (
                              <span className="text-xs text-muted-foreground font-mono shrink-0">
                                (ID: {vendor.supplierId})
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{vendor.emailId || "No email"}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {!query.trim() && loadingMore && (
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2 border-t">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading more...
                    </div>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </div>
      </CardContent>
    </Card>
  );
}
*/

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMarkdown(text: string, opts?: { highlightConfirm?: boolean }) {
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

    if (opts?.highlightConfirm && /^\s*(?:\*\*\s*Warning|\[!WARNING\]|Warning\s*:|Please note|Note\s*:|Heads up|Caution)/i.test(line)) {
      const warnText = bold(escaped.replace(/^\s*\[!WARNING\]\s*/i, '<strong>Warning</strong>: '));
      htmlParts.push(
        `<div class="flex items-start gap-2 my-2 px-3 py-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800"><span class="text-red-600 dark:text-red-400 mt-0.5 text-sm leading-none">&#9888;</span><span class="text-sm font-semibold text-red-700 dark:text-red-300 tracking-wide">${warnText}</span></div>`,
      );
      i++;
      continue;
    }

    if (opts?.highlightConfirm && /(do you want to proceed|would you like to proceed|would you like to (?:send|create|continue)|shall i proceed|please confirm)/i.test(line)) {
      htmlParts.push(
        `<div class="text-sm font-semibold text-amber-700 dark:text-amber-400 py-1">${bold(escaped)}</div>`,
      );
      i++;
      continue;
    }

    htmlParts.push(`<div class="text-xs py-0.5">${bold(escaped)}</div>`);
    i++;
  }

  return htmlParts.join('');
}

function parseVendorComparison(text: string): ParsedVendorComparison | null {
  if (/\*\*Duplicate\s+(Supplier|Invitation)\s+Report\*\*/i.test(text)) return null;

  const strictHeading = /^##\s*Vendor Comparison\b/im.test(text);
  const looseComparisonCue =
    /comparison|compare|versus|\bvs\.?\b/i.test(text) ||
    /^#{1,6}\s*.*comparison/im.test(text);
  const metricLineCount = (text.match(/^\s*\*\*[^*]+:\*\*\s*/gm) || []).length;

  const lines = text.split("\n");
  const parsedVendors: ComparisonVendor[] = [];

  const pushVendor = (nameRaw: string, explicitId?: string) => {
    let name = nameRaw.replace(/^\*\*|\*\*$/g, "").trim();
    const idFromParen = name.match(/\s*\(ID:\s*([^)]+)\)\s*$/i)?.[1]?.trim();
    name = name.replace(/\s*\(ID:\s*[^)]+\)\s*$/i, "").trim();
    if (!name) return;
    const id =
      (explicitId && explicitId !== "N/A" ? explicitId : undefined) ||
      idFromParen ||
      "N/A";
    parsedVendors.push({ name, id, metrics: {} });
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const h3Vendor = trimmed.match(/^###\s+\d+\.\s+(.+?)(?:\s+\(ID:\s*([^)]+)\))?\s*$/);
    if (h3Vendor) {
      pushVendor(h3Vendor[1] || "", h3Vendor[2]?.trim());
      continue;
    }

    const plainNum = trimmed.match(
      /^(\d+)[.)]\s*(?:\*\*([^*]+)\*\*|([^\n*].*?))\s*$/,
    );
    if (plainNum) {
      const namePart = (plainNum[2] || plainNum[3] || "").trim();
      if (namePart && !/:\s*$/.test(namePart)) {
        pushVendor(namePart);
      }
      continue;
    }

    const metricMatch = trimmed.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    if (metricMatch) {
      const last = parsedVendors[parsedVendors.length - 1];
      if (!last) continue;
      const key = metricMatch[1].trim();
      const value = metricMatch[2].trim();
      last.metrics[key] = value || "N/A";
      if (/^id$/i.test(key) && value && value !== "N/A") {
        last.id = value.trim();
      }
    }
  }

  for (const v of parsedVendors) {
    const mid = v.metrics["ID"] ?? v.metrics["Vendor ID"];
    if (mid && mid !== "N/A" && v.id === "N/A") {
      v.id = String(mid).trim();
    }
  }

  const totalMetrics = parsedVendors.reduce((n, v) => n + Object.keys(v.metrics).length, 0);
  const qualifiesTopic = strictHeading || looseComparisonCue || metricLineCount >= 6;
  const qualifiesStructure =
    parsedVendors.length >= 2 &&
    (strictHeading ? totalMetrics >= 1 : totalMetrics >= 4);

  if (!qualifiesTopic || !qualifiesStructure) {
    return null;
  }

  for (const v of parsedVendors) {
    delete v.metrics["ID"];
    delete v.metrics["Vendor ID"];
  }

  return { vendors: parsedVendors };
}

function riskToneClass(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized.includes("HIGH")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  if (normalized.includes("MEDIUM")) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  if (normalized.includes("LOW")) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  return "bg-muted text-muted-foreground";
}

/** Parsed metric value → numeric percent, or null if N/A / unparseable. */
function parseOverallScorePercent(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (raw.trim().toUpperCase() === "N/A") return null;
  const n = Number.parseFloat(String(raw).replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** Same breakpoints as supplier AI Agent Analysis recommendation card. */
function overallScoreTextClass(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-destructive";
}

/** Solid pill styling aligned with Risk Level row (LOW / MEDIUM / HIGH) for comparable emphasis. */
function overallScoreRiskPillClass(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (score >= 60) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
}

function parseAiVendorRankNumeric(raw: string): number | null {
  const m = String(raw || "").match(/#?\s*(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** When overall score is absent, tint rank badges by relative position among compared vendors (lower # = better). */
function comparativeRankRiskPillClass(rank: number, ranks: number[]): string {
  if (ranks.length === 0) return "bg-muted text-muted-foreground";
  const mn = Math.min(...ranks);
  const mx = Math.max(...ranks);
  if (mn === mx) return overallScoreRiskPillClass(80);
  if (rank === mn) return overallScoreRiskPillClass(85);
  if (rank === mx) return overallScoreRiskPillClass(40);
  return overallScoreRiskPillClass(68);
}

function VendorComparisonSheet({ comparison }: { comparison: ParsedVendorComparison }) {
  const metricPriority = [
    "AI Vendor Rank",
    "Legal Entity",
    "Location",
    "Turnover",
    "Employees",
    "Documents",
    "Contacts",
    "Bank Accounts",
    "Risk Level",
  ];

  const metricSet = new Set<string>();
  for (const vendor of comparison.vendors) {
    Object.keys(vendor.metrics).forEach((k) => metricSet.add(k));
  }

  const metrics = Array.from(metricSet)
    .filter((m) => {
      if (m === "Email" || m === "Phone" || m === "Status") return false;
      if (m === "Overall Score") {
        const otherMetrics = Array.from(metricSet).filter(
          (key) => key !== "Email" && key !== "Phone" && key !== "Status" && key !== "Overall Score",
        );
        return otherMetrics.length === 0;
      }
      return true;
    })
    .sort((a, b) => {
      const ia = metricPriority.indexOf(a);
      const ib = metricPriority.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  const comparedAiRankNums = comparison.vendors
    .map((v) => parseAiVendorRankNumeric(v.metrics["AI Vendor Rank"] || ""))
    .filter((n): n is number => n != null);

  const focusedMetric =
    metrics.length === 1 ? metrics[0] : comparison.vendors.every((v) => Object.keys(v.metrics).length <= 2)
      ? metrics[0]
      : null;

  const isCompactComparison = comparison.vendors.length <= 3;

  const renderMetricValue = (metric: string, vendor: ComparisonVendor) => {
    const value = vendor.metrics[metric] || "N/A";
    const showRiskPill = metric === "Risk Level";
    const showAiRankPill = metric === "AI Vendor Rank";
    const showOverallPill = metric === "Overall Score";
    const overallForVendor = parseOverallScorePercent(vendor.metrics["Overall Score"]);
    const rankNum = parseAiVendorRankNumeric(value);
    const rankPillClass =
      overallForVendor != null
        ? overallScoreRiskPillClass(overallForVendor)
        : rankNum != null && comparedAiRankNums.length > 0
          ? comparativeRankRiskPillClass(rankNum, comparedAiRankNums)
          : "bg-muted text-muted-foreground";

    if (showRiskPill) {
      return <Badge className={riskToneClass(value)}>{value}</Badge>;
    }
    if (showAiRankPill) {
      return <Badge className={rankPillClass}>{value}</Badge>;
    }
    if (showOverallPill) {
      const n = parseOverallScorePercent(value);
      return n !== null ? (
        <Badge
          variant="outline"
          className={`text-xs font-semibold bg-muted/50 border-transparent dark:bg-muted/40 ${overallScoreTextClass(n)}`}
        >
          {n}%
        </Badge>
      ) : (
        <span className="text-muted-foreground">N/A</span>
      );
    }
    return <span>{value}</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {focusedMetric ? `Supplier Comparison — ${focusedMetric}` : " Supplier Comparison Sheet"}
        </h3>
        <Badge variant="secondary">{comparison.vendors.length} suppliers</Badge>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {comparison.vendors.map((vendor) => (
          <Card key={`${vendor.name}-${vendor.id}`} className="bg-background/70">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold leading-tight">{vendor.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {vendor.id}</p>
                </div>
                {(() => {
                  if (focusedMetric) {
                    const focusedValue = vendor.metrics[focusedMetric];
                    if (focusedValue === undefined) return null;

                    if (focusedMetric === "Overall Score") {
                      const n = parseOverallScorePercent(focusedValue);
                      return n !== null ? (
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-xs font-semibold bg-muted/50 border-transparent dark:bg-muted/40 ${overallScoreTextClass(n)}`}
                        >
                          Overall Score: {n}%
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs font-semibold bg-muted/50 border-transparent text-muted-foreground"
                        >
                          Overall Score: N/A
                        </Badge>
                      );
                    }

                    if (focusedMetric === "Risk Level") {
                      return (
                        <Badge className={riskToneClass(focusedValue)}>
                          {focusedValue}
                        </Badge>
                      );
                    }

                    return (
                      <div className="shrink-0 text-right space-y-0.5">
                        <p className="text-[10px] text-muted-foreground">{focusedMetric}</p>
                        {renderMetricValue(focusedMetric, vendor)}
                      </div>
                    );
                  }

                  const rawOverall = vendor.metrics["Overall Score"];
                  if (rawOverall !== undefined) {
                    const n = parseOverallScorePercent(rawOverall);
                    return n !== null ? (
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs font-semibold bg-muted/50 border-transparent dark:bg-muted/40 ${overallScoreTextClass(n)}`}
                      >
                        Overall Score: {n}%
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="shrink-0 text-xs font-semibold bg-muted/50 border-transparent text-muted-foreground"
                      >
                        Overall Score: N/A
                      </Badge>
                    );
                  }
                  if (vendor.metrics["Risk Level"]) {
                    return (
                      <Badge className={riskToneClass(vendor.metrics["Risk Level"])}>
                        {vendor.metrics["Risk Level"]}
                      </Badge>
                    );
                  }
                  return null;
                })()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!focusedMetric && (
      <div className="rounded-md border overflow-hidden">
        <div className={isCompactComparison ? "" : "overflow-x-auto"}>
          <table className={`w-full text-sm ${isCompactComparison ? "table-fixed" : "min-w-[680px]"}`}>
            <thead className="bg-muted/50">
              <tr>
                <th className={`text-left px-3 py-2 font-medium ${isCompactComparison ? "w-[38%]" : "w-[220px]"}`}>
                  Metric
                </th>
                {comparison.vendors.map((vendor) => (
                  <th
                    key={`${vendor.name}-${vendor.id}-header`}
                    className="text-left px-3 py-2 font-medium truncate"
                    title={vendor.name}
                  >
                    {vendor.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric} className="border-t align-top">
                  <td className="px-3 py-2 text-muted-foreground">{metric}</td>
                  {comparison.vendors.map((vendor) => (
                    <td key={`${vendor.name}-${vendor.id}-${metric}`} className="px-3 py-2">
                      {renderMetricValue(metric, vendor)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}

export default function AIVendorAgent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isStageEnabled: isSupplierActivationStageEnabled } = useSupplierActivationPreferences();
  const supplierApprovalEnabled = isSupplierActivationStageEnabled("supplierApproval");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mention = useAgentMentions();
  const { prompt: vendorPrompt, setPromptText, reset: resetMentions, streamMentions } = mention;
  const {
    conversation,
    setConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    groupedConversations,
    currentId,
  } = useAgentConversation("vendor");
  const [showCapabilities, setShowCapabilities] = useState(false);
  // Tracks an in-progress edit of a pending onboard/invite action: which message and a working copy of its data.
  const [editingAction, setEditingAction] = useState<{ index: number; data: any } | null>(null);
  // Chat-driven approval commands ("approve this") are applied to the active card via this request.
  const [approvalChatRequest, setApprovalChatRequest] = useState<{
    msgIndex: number;
    request: SupplierApprovalChatActionRequest;
  } | null>(null);
  // Tracks an open Approve/Reject/More confirmation panel awaiting comments + confirm.
  const [activeApprovalConfirmation, setActiveApprovalConfirmation] = useState<{
    msgIndex: number;
    action: SupplierApprovalAction;
    comments?: string;
  } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [capabilitiesPanelWidth, setCapabilitiesPanelWidth] = useState(320);
  const isResizingCapabilitiesRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(320);

  const CAPABILITIES_PANEL_MIN_WIDTH = 280;
  const CAPABILITIES_PANEL_MAX_WIDTH = 520;

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

  const handleCapabilitiesResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingCapabilitiesRef.current = true;
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = capabilitiesPanelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel an in-flight agent query and finalize the streaming placeholder.
  const stopStreaming = () => {
    abortRef.current?.abort();
  };
  /* Vendor selection has been intentionally disabled.
  const hasPendingVendorSelection = conversation.some(
    (m) => m.pendingAction?.type === "select_vendor" && m.actionStatus === "pending",
  );
  */
  const hasPendingVendorSelection = false;

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
      endpoint: "/api/vendor-agent/query/stream",
      prompt: promptText,
      conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      confirmAction,
      ...mentionPayload,
      activationContext,
      activationPreferences: readSupplierActivationPreferences(),
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
        charts,
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
        _actionPreview,
        _actionResult,
        supplierTaskFlow,
        supplierApprovalReview,
        _createBidSourceChoice,
        _procurementTaskFlow,
        _budgetApprovalReview,
        _prApprovalReview,
        _poApprovalReview,
        _procurementAlertReview,
        supplierApprovalCommand,
      ) => {
        // Vendor selection has been intentionally disabled — never surface select_vendor pending actions.
        const safePendingAction =
          pendingAction?.type === "select_vendor" ? undefined : pendingAction || undefined;
        const existingApprovalIndex = supplierApprovalCommand
          ? [...history]
              .map((message, index) => ({ message, index }))
              .reverse()
              .find(
                ({ message }) =>
                  message.supplierApprovalReview?.supplierId ===
                    supplierApprovalCommand.supplierId &&
                  (message.supplierApprovalStatus === "pending" ||
                    !message.supplierApprovalStatus),
              )?.index
          : undefined;
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              pendingAction: safePendingAction,
              actionStatus: safePendingAction ? "pending" as const : undefined,
              chart: safePendingAction ? undefined : chart || undefined,
              charts: safePendingAction ? undefined : charts || undefined,
              supplierTaskFlow: supplierApprovalReview ? undefined : supplierTaskFlow || undefined,
              supplierApprovalReview:
                supplierApprovalCommand && existingApprovalIndex !== undefined
                  ? undefined
                  : supplierApprovalReview || undefined,
              supplierApprovalStatus:
                supplierApprovalReview &&
                !(supplierApprovalCommand && existingApprovalIndex !== undefined)
                  ? "pending" as const
                  : undefined,
            };
          }
          return updated;
        });
        if (supplierApprovalCommand) {
          const targetIndex =
            existingApprovalIndex ?? history.length + (confirmAction ? 0 : 1);
          setActiveApprovalConfirmation({
            msgIndex: targetIndex,
            action: supplierApprovalCommand.action,
            comments: supplierApprovalCommand.comments?.trim() || undefined,
          });
          setApprovalChatRequest({
            msgIndex: targetIndex,
            request: {
              nonce: Date.now(),
              kind: "start",
              action: supplierApprovalCommand.action,
              comments: supplierApprovalCommand.comments,
            },
          });
        }
        setIsStreaming(false);
        abortRef.current = null;
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

  const handleVendorSubmit = () => {
    if (!vendorPrompt.trim() || isStreaming || hasPendingVendorSelection) return;
    const pendingActionIndex = [...conversation]
      .map((msg, index) => ({ msg, index }))
      .reverse()
      .find(({ msg }) => msg.pendingAction && msg.actionStatus === "pending" && msg.pendingAction.type !== "select_vendor")?.index;
    const pendingAction =
      pendingActionIndex !== undefined ? conversation[pendingActionIndex]?.pendingAction : undefined;
    if (isChatConfirmation(vendorPrompt) && pendingAction && pendingActionIndex !== undefined) {
      const confirmText = vendorPrompt.trim();
      const confirmedConversation: ConversationMessage[] = [
        ...conversation.map((msg, index) =>
          index === pendingActionIndex ? { ...msg, actionStatus: "confirmed" as const } : msg,
        ),
        { role: "user", content: confirmText, timestamp: new Date() },
      ];
      setConversation(confirmedConversation);
      resetMentions();
      runStream("", confirmedConversation, { type: pendingAction.type, data: pendingAction.data });
      return;
    }

    // Confirmation panel already open → treat the next message as part of that workflow.
    if (activeApprovalConfirmation) {
      const { msgIndex, action, comments: storedComments } = activeApprovalConfirmation;
      const approvalMsg = conversation[msgIndex];
      const stillPending =
        !!approvalMsg?.supplierApprovalReview &&
        (approvalMsg.supplierApprovalStatus === "pending" || !approvalMsg.supplierApprovalStatus);

      if (stillPending) {
        const confirmText = vendorPrompt.trim();
        const companyName =
          approvalMsg.supplierApprovalReview?.companyName || "this supplier";
        const followUp = parseApprovalConfirmationFollowUp(confirmText);

        // User may switch to a different approval action mid-flow.
        const switched = parseSupplierApprovalCommand(confirmText);
        if (switched) {
          const hasComments = !!switched.comments.trim();
          setConversation((prev) => [
            ...prev,
            { role: "user", content: confirmText, timestamp: new Date() },
            {
              role: "assistant",
              content: approvalActionAck(switched.action, companyName, hasComments),
              timestamp: new Date(),
            },
          ]);
          resetMentions();
          setActiveApprovalConfirmation({
            msgIndex,
            action: switched.action,
            comments: switched.comments || undefined,
          });
          setApprovalChatRequest({
            msgIndex,
            request: {
              nonce: Date.now(),
              kind: "start",
              action: switched.action,
              comments: switched.comments || undefined,
            },
          });
          return;
        }

        if (followUp.intent === "cancel") {
          setConversation((prev) => [
            ...prev,
            { role: "user", content: confirmText, timestamp: new Date() },
            {
              role: "assistant",
              content: `Cancelled. You can still approve, reject, or request more information for **${companyName}** from the card above.`,
              timestamp: new Date(),
            },
          ]);
          resetMentions();
          setActiveApprovalConfirmation(null);
          setApprovalChatRequest({
            msgIndex,
            request: { nonce: Date.now(), kind: "cancel", action },
          });
          return;
        }

        const approvalComments = followUp.comments.trim() || storedComments?.trim() || "";
        if (!approvalComments) {
          setConversation((prev) => [
            ...prev,
            { role: "user", content: confirmText, timestamp: new Date() },
            {
              role: "assistant",
              content: `Comments are required to continue. Add a brief comment for **${companyName}**, then confirm.`,
              timestamp: new Date(),
            },
          ]);
          resetMentions();
          return;
        }

        const actionVerb =
          action === "Approve"
            ? "Approving"
            : action === "Reject"
              ? "Rejecting"
              : "Requesting more information from";
        setConversation((prev) => [
          ...prev,
          { role: "user", content: confirmText, timestamp: new Date() },
          {
            role: "assistant",
            content: `${actionVerb} **${companyName}** with your comments…`,
            timestamp: new Date(),
          },
        ]);
        resetMentions();
        setActiveApprovalConfirmation(null);
        setApprovalChatRequest({
          msgIndex,
          request: {
            nonce: Date.now(),
            kind: "confirm",
            action,
            comments: approvalComments,
          },
        });
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-testid="supplier-approval-card-${msgIndex}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return;
      }

      // Card already completed or missing — drop stale confirmation state.
      setActiveApprovalConfirmation(null);
    }

    const activeSupplierReview = [...conversation]
      .reverse()
      .find(
        (message) =>
          !!message.supplierApprovalReview &&
          (message.supplierApprovalStatus === "pending" ||
            !message.supplierApprovalStatus),
      )?.supplierApprovalReview;
    const activationContext = activeSupplierReview
      ? JSON.stringify({ activeSupplierReview })
      : undefined;

    // Active supplier-approval card: handle approve / reject / more-info in-chat without the LLM.
    const approvalCommand = parseSupplierApprovalCommand(vendorPrompt);
    const pendingApprovalIndex = approvalCommand
      ? [...conversation]
          .map((msg, index) => ({ msg, index }))
          .reverse()
          .find(
            ({ msg }) =>
              !!msg.supplierApprovalReview &&
              (msg.supplierApprovalStatus === "pending" ||
                !msg.supplierApprovalStatus),
          )?.index
      : undefined;
    if (approvalCommand && pendingApprovalIndex !== undefined) {
      const confirmText = vendorPrompt.trim();
      const approvalMsg = conversation[pendingApprovalIndex];
      const companyName =
        approvalMsg.supplierApprovalReview?.companyName || "this supplier";
      const hasComments = !!approvalCommand.comments.trim();
      setConversation((prev) => [
        ...prev,
        { role: "user", content: confirmText, timestamp: new Date() },
        {
          role: "assistant",
          content: approvalActionAck(approvalCommand.action, companyName, hasComments),
          timestamp: new Date(),
        },
      ]);
      resetMentions();
      setActiveApprovalConfirmation(
        hasComments
          ? null
          : { msgIndex: pendingApprovalIndex, action: approvalCommand.action },
      );
      setApprovalChatRequest({
        msgIndex: pendingApprovalIndex,
        request: {
          nonce: Date.now(),
          kind: hasComments ? "confirm" : "start",
          action: approvalCommand.action,
          comments: approvalCommand.comments || undefined,
        },
      });
      // Scroll the active approval card into view so the inline confirm panel is visible.
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-testid="supplier-approval-card-${pendingApprovalIndex}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return;
    }

    runStream(
      vendorPrompt,
      conversation,
      undefined,
      mention.streamMentions,
      activationContext,
    );
  };

  const handleConfirmAction = (msgIndex: number) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction) return;
    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));
    runStream("", conversation, { type: msg.pendingAction.type, data: msg.pendingAction.data });
  };

  // Activation Signals popover → open the pending supplier-approval flow (single item jumps
  // straight into the inline profile; multiple items surface a selectable list).
  const handleSupplierApprovalActivate = (
    item: SupplierActivationStageItem | null,
    taskIndex: number,
    label: string,
  ) => {
    if (isStreaming || readSupplierActivationPreferences().supplierApproval === false) return;
    if (item && taskIndex >= 0) {
      handleSupplierTaskSelect(taskIndex, label);
      return;
    }
    runStream(
      "Give me all my Supplier pending tasks",
      conversation,
      undefined,
      {},
      JSON.stringify({ pendingTaskFlow: "tasks" }),
    );
  };

  // A supplier chip (or single-item activation) was selected → render its full profile inline.
  const handleSupplierTaskSelect = (taskIndex: number, label: string) => {
    if (isStreaming || readSupplierActivationPreferences().supplierApproval === false) return;
    runStream(
      label,
      conversation,
      undefined,
      {},
      JSON.stringify({ pendingTaskFlow: "supplierApprovalReview", taskIndex }),
    );
  };

  const refreshActivationSignals = () => {
    queryClient.invalidateQueries({ queryKey: SUPPLIER_ACTIVATION_SIGNALS_QUERY_KEY });
  };

  const handleSupplierApprovalComplete = (
    msgIndex: number,
    result: "approved" | "rejected" | "more_info",
  ) => {
    const resultContent =
      result === "approved"
        ? "Supplier registration has been **approved**."
        : result === "rejected"
          ? "Supplier registration has been **rejected**."
          : "Supplier registration has been **returned for more information**.";
    setActiveApprovalConfirmation((prev) =>
      prev?.msgIndex === msgIndex ? null : prev,
    );
    setConversation((prev) => {
      const updated = prev.map((m, i) =>
        i === msgIndex ? { ...m, supplierApprovalStatus: result } : m,
      );
      return [
        ...updated,
        { role: "assistant" as const, content: resultContent, timestamp: new Date() },
      ];
    });
    refreshActivationSignals();
  };

  /* Vendor selection has been intentionally disabled.
  const handleVendorSelection = (msgIndex: number, vendor: VendorOption) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction || msg.pendingAction.type !== "select_vendor") return;

    const confirmData = {
      ...msg.pendingAction.data,
      selectedVendor: {
        id: vendor.id,
        companyName: vendor.companyName,
        emailId: vendor.emailId,
      },
    };

    setConversation((prev) =>
      prev.map((m, i) =>
        i === msgIndex
          ? {
              ...m,
              actionStatus: "confirmed" as const,
              pendingAction: { ...m.pendingAction!, data: confirmData },
            }
          : m,
      ),
    );
    runStream("", conversation, { type: "select_vendor", data: confirmData });
  };
  */

  // Begin editing a pending action — clone its data into a working copy so edits don't mutate the message until saved.
  const handleStartEdit = (msgIndex: number) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction || msg.pendingAction.type === "select_vendor") return;
    setEditingAction({ index: msgIndex, data: JSON.parse(JSON.stringify(msg.pendingAction.data ?? {})) });
  };

  const handleEditFieldChange = (key: string, value: string) => {
    setEditingAction(prev => (prev ? { ...prev, data: { ...prev.data, [key]: value } } : prev));
  };

  const handleEditInviteChange = (idx: number, key: "companyName" | "email", value: string) => {
    setEditingAction(prev => {
      if (!prev) return prev;
      const invites = Array.isArray(prev.data?.invites) ? [...prev.data.invites] : [];
      invites[idx] = { ...invites[idx], [key]: value };
      return { ...prev, data: { ...prev.data, invites } };
    });
  };

  const handleCancelEdit = () => setEditingAction(null);

  // Persist the edited working copy back onto the pending action and refresh its summary; Confirm then sends the new data to execute (server re-validates).
  const handleSaveEdit = () => {
    if (!editingAction) return;
    const { index, data } = editingAction;
    setConversation(prev =>
      prev.map((m, i) => {
        if (i !== index || !m.pendingAction) return m;
        const rebuiltContent = rebuildActionPreview(m.pendingAction.type, data);
        return {
          ...m,
          content: rebuiltContent ?? m.content,
          pendingAction: { ...m.pendingAction, data, summary: rebuildActionSummary(m.pendingAction.type, data) },
        };
      }),
    );
    setEditingAction(null);
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
    replacePromptText("");
  };

  const ONBOARD_VENDOR_TEMPLATE =
    "Onboard {{Supplier Name}}, with contact person {{Contact Name}}, email {{Email}}, mobile number {{Mobile Number}}, company type {{Company Type}}, Address {{Address}}";
  const INVITE_SUPPLIER_TEMPLATE =
    "Send onboarding invitation to {{Supplier Name}} at {{Supplier Email}} for supplier registration";
  const RISK_ASSESSMENT_TEMPLATE =
    "Assess risk score for supplier {{Supplier Name}}";
  const FIND_VENDORS_TEMPLATE =
    "Find suppliers in {{Category/Location/Certification}}";
  const TOP_VENDORS_TEMPLATE =
    "Give me top 5 suppliers";
  const COMPARE_VENDORS_TEMPLATE =
    "Compare {{Supplier A}} and {{Supplier B}}";
  const EXPIRED_DOC_VENDORS_TEMPLATE =
    "Find suppliers with expired documents";
  const SUPPLIER_DETAILS_TEMPLATE =
    "Get the complete supplier profile for {{Supplier Name}}";
  const SUPPLIER_APPROVALS_TEMPLATE =
    "Give me all my Supplier pending tasks";

  const getPlaceholderRanges = (text: string) => {
    const matches: Array<{ key: string; start: number; end: number }> = [];
    const re = /\{\{([^}]+)\}\}/g;
    let m: RegExpExecArray | null = null;
    while ((m = re.exec(text)) !== null) {
      const inner = m[1];
      const start = m.index + 2; // after {{
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
      // ignore if element doesn't support selection (shouldn't happen for textarea)
    }
  };

  const replacePromptText = (text: string) => {
    setPromptText(text);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      const el = mention.inputRef.current;
      if (!el) return;
      const ranges = getPlaceholderRanges(vendorPrompt);
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
      return;
    }

    mention.composerProps.onKeyDown(e);
  };

  const handleOnboardVendorClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Onboard Supplier template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = ONBOARD_VENDOR_TEMPLATE;

    replacePromptText(nextText);

    // Wait for the controlled Textarea to reflect the new value.
    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(nextText);
      const vendorName = ranges.find((r) => r.key === "Supplier Name");
      if (vendorName) focusAndSelectRange(vendorName.start, vendorName.end);
      else focusAndSelectRange(nextText.length, nextText.length);
    });
  };

  const handleInviteSupplierClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Invite Supplier template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = INVITE_SUPPLIER_TEMPLATE;

    replacePromptText(nextText);

    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(nextText);
      const email = ranges.find((r) => r.key === "Supplier Email");
      if (email) focusAndSelectRange(email.start, email.end);
      else focusAndSelectRange(nextText.length, nextText.length);
    });
  };

  const handleRiskAssessmentClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Risk Assessment template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = RISK_ASSESSMENT_TEMPLATE;
    replacePromptText(nextText);

    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(nextText);
      const vendorName = ranges.find((r) => r.key === "Supplier Name");
      if (vendorName) focusAndSelectRange(vendorName.start, vendorName.end);
      else focusAndSelectRange(nextText.length, nextText.length);
    });
  };

  const handleFindVendorsClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Find Suppliers template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = FIND_VENDORS_TEMPLATE;
    replacePromptText(nextText);

    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(nextText);
      const category = ranges.find((r) => r.key === "Category");
      if (category) focusAndSelectRange(category.start, category.end);
      else focusAndSelectRange(nextText.length, nextText.length);
    });
  };

  const handleTopVendorsClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Top Suppliers template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = TOP_VENDORS_TEMPLATE;
    replacePromptText(nextText);

    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(nextText);
      const timePeriod = ranges.find((r) => r.key === "Time Period");
      if (timePeriod) focusAndSelectRange(timePeriod.start, timePeriod.end);
      else focusAndSelectRange(nextText.length, nextText.length);
    });
  };

  const handleCompareVendorsClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Compare Suppliers template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = COMPARE_VENDORS_TEMPLATE;
    replacePromptText(nextText);

    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(nextText);
      const vendorA = ranges.find((r) => r.key === "Supplier A");
      if (vendorA) focusAndSelectRange(vendorA.start, vendorA.end);
      else focusAndSelectRange(nextText.length, nextText.length);
    });
  };

  const handleExpiredDocVendorsClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Expired Doc Suppliers template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = EXPIRED_DOC_VENDORS_TEMPLATE;
    replacePromptText(nextText);

    requestAnimationFrame(() => {
      focusAndSelectRange(nextText.length, nextText.length);
    });
  };

  const handleSupplierDetailsClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Supplier Details template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = SUPPLIER_DETAILS_TEMPLATE;
    replacePromptText(nextText);

    requestAnimationFrame(() => {
      const ranges = getPlaceholderRanges(nextText);
      const supplierName = ranges.find((r) => r.key === "Supplier Name");
      if (supplierName) focusAndSelectRange(supplierName.start, supplierName.end);
      else focusAndSelectRange(nextText.length, nextText.length);
    });
  };

  const handleSupplierApprovalsClick = () => {
    if (isStreaming || hasPendingVendorSelection) return;
    if (readSupplierActivationPreferences().supplierApproval === false) return;

    if (vendorPrompt.trim()) {
      const ok = window.confirm(
        "Replace your current message with the Approvals template?",
      );
      if (!ok) {
        mention.inputRef.current?.focus();
        return;
      }
    }

    const nextText = SUPPLIER_APPROVALS_TEMPLATE;
    replacePromptText(nextText);

    requestAnimationFrame(() => {
      focusAndSelectRange(nextText.length, nextText.length);
    });
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
          <div className="p-1.5 rounded-md bg-cyan-100 dark:bg-cyan-900/30">
            <Users className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Supplier Agent</h1>
          <Badge variant="outline" className="gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
            <Zap className="h-3 w-3" />
            Action-Capable
          </Badge>
          <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3 w-3" />
            Active
          </Badge>
          <SupplierActivationSignalsPopover onStageActivate={handleSupplierApprovalActivate} />
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

        <Card className="flex-1 flex flex-col min-h-0 min-w-0">
          <CardContent className="flex-1 p-4 flex flex-col min-h-0 min-w-0" style={{ position: "relative" }}>
            <div className="flex-1 overflow-y-auto space-y-4 mb-4" data-testid="chat-messages">
              {conversation.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="p-4 rounded-full bg-cyan-100 dark:bg-cyan-900/30 w-fit mx-auto mb-4">
                      <Bot className="h-10 w-10 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Supplier Agent</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Ask me anything about suppliers — search, onboard, invite, assess risk, and more. I understand natural language.
                    </p>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => { setExpandedCategories(new Set()); setShowCapabilities(true); }} data-testid="button-open-capabilities-empty">
                      <BookOpen className="h-4 w-4" />
                      Explore Capabilities
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {conversation.map((msg, i) => {
                    const parsedComparison =
                      msg.role === "assistant" && !msg.isStreaming
                        ? parseVendorComparison(msg.content)
                        : null;

                    return (
                    <div key={i}>
                      <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="p-1.5 rounded-md bg-cyan-100 dark:bg-cyan-900/30 h-fit flex-shrink-0">
                            <Bot className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                          </div>
                        )}
                        <div className={`rounded-md p-3 ${parsedComparison ? "max-w-[92%]" : "max-w-[75%]"} ${
                          msg.role === "user" 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted"
                        }`}>
                          {msg.role === "assistant" ? (
                            msg.isStreaming && !msg.content ? (
                              <ThinkingTips />
                            ) : msg.isStreaming ? (
                              <p className="text-xs whitespace-pre-wrap">{msg.content}<span className="inline-block w-0.5 h-3 bg-current ml-0.5 align-middle animate-pulse" /></p>
                            ) : parsedComparison ? (
                              <>
                                <VendorComparisonSheet comparison={parsedComparison} />
                                <VendorMessageCharts msg={msg} />
                              </>
                            ) : (
                              <>
                                <div
                                  className="text-sm [&_h3]:text-foreground [&_h4]:text-muted-foreground [&_strong]:text-foreground"
                                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content, { highlightConfirm: !!msg.pendingAction && msg.actionStatus === "pending" }) }}
                                />
                                <VendorMessageCharts msg={msg} />
                                {msg.supplierTaskFlow ? (
                                  <SupplierPendingTasksFlow
                                    flow={msg.supplierTaskFlow}
                                    disabled={isStreaming}
                                    onSelectTask={handleSupplierTaskSelect}
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
                        {msg.role === "user" && (
                          <div className="p-1.5 rounded-md bg-primary/10 h-fit flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>

                      {msg.role === "assistant" && msg.supplierApprovalReview && (
                        <div className="ml-10 mt-2 max-w-3xl w-full overflow-hidden" data-testid={`supplier-approval-card-${i}`}>
                          <SupplierApprovalReviewCard
                            spec={msg.supplierApprovalReview}
                            status={msg.supplierApprovalStatus || "pending"}
                            disabled={isStreaming}
                            onComplete={(result) => handleSupplierApprovalComplete(i, result)}
                            chatActionRequest={
                              approvalChatRequest?.msgIndex === i
                                ? approvalChatRequest.request
                                : null
                            }
                            onChatActionHandled={() => setApprovalChatRequest(null)}
                            onConfirmationStateChange={(action) => {
                              if (action) {
                                setActiveApprovalConfirmation((prev) => ({
                                  msgIndex: i,
                                  action,
                                  comments:
                                    prev?.msgIndex === i && prev.action === action
                                      ? prev.comments
                                      : undefined,
                                }));
                              } else {
                                setActiveApprovalConfirmation((prev) =>
                                  prev?.msgIndex === i ? null : prev,
                                );
                              }
                            }}
                          />
                        </div>
                      )}

                      {msg.pendingAction && msg.actionStatus === "pending" && msg.pendingAction.type !== "select_vendor" && (
                        <div className="ml-10 mt-2">
                          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
                            <CardContent className="p-3">
                              <div className="flex items-start gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                    {editingAction?.index === i ? "Edit Details" : "Confirm Action"}
                                  </p>
                                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                                    {editingAction?.index === i
                                      ? "Update the details below, then save and confirm."
                                      : msg.pendingAction.summary}
                                  </p>
                                  {editingAction?.index !== i &&
                                    msg.pendingAction.type === "bulk_invite" &&
                                    Array.isArray(msg.pendingAction.data?.invites) &&
                                    msg.pendingAction.data.invites.length > 0 && (
                                      <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                                        {msg.pendingAction.data.invites.map((invite: { companyName?: string; email?: string }, idx: number) => (
                                          <li key={`${invite.email || idx}-${idx}`}>
                                            {idx + 1}. {invite.companyName || "Supplier"} — {invite.email || "—"}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                </div>
                              </div>

                              {editingAction?.index === i ? (
                                <div className="ml-6">
                                  {(msg.pendingAction.type === "onboard" || msg.pendingAction.type === "invite") && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {(msg.pendingAction.type === "onboard" ? ONBOARD_EDIT_FIELDS : INVITE_EDIT_FIELDS).map((field) => (
                                        <div
                                          key={field.key}
                                          className={`flex flex-col gap-1 ${field.type === "textarea" ? "sm:col-span-2" : ""}`}
                                        >
                                          <label className="text-xs font-medium text-amber-900 dark:text-amber-100">
                                            {field.label}
                                          </label>
                                          {field.type === "select" ? (
                                            <select
                                              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                              value={editingAction.data?.[field.key] ?? ""}
                                              onChange={(e) => handleEditFieldChange(field.key, e.target.value)}
                                              data-testid={`input-edit-${field.key}-${i}`}
                                            >
                                              <option value="">Select…</option>
                                              {LEGAL_ENTITY_OPTIONS.map((opt) => (
                                                <option key={opt} value={opt}>
                                                  {opt}
                                                </option>
                                              ))}
                                            </select>
                                          ) : field.type === "textarea" ? (
                                            <Textarea
                                              className="text-sm"
                                              rows={2}
                                              value={editingAction.data?.[field.key] ?? ""}
                                              onChange={(e) => handleEditFieldChange(field.key, e.target.value)}
                                              data-testid={`input-edit-${field.key}-${i}`}
                                            />
                                          ) : (
                                            <Input
                                              className="h-9 text-sm"
                                              value={editingAction.data?.[field.key] ?? ""}
                                              onChange={(e) => handleEditFieldChange(field.key, e.target.value)}
                                              data-testid={`input-edit-${field.key}-${i}`}
                                            />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {msg.pendingAction.type === "bulk_invite" && Array.isArray(editingAction.data?.invites) && (
                                    <div className="space-y-3">
                                      {editingAction.data.invites.map((invite: { companyName?: string; email?: string }, idx: number) => (
                                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                          <div className="flex flex-col gap-1">
                                            <label className="text-xs font-medium text-amber-900 dark:text-amber-100">
                                              Company Name {idx + 1}
                                            </label>
                                            <Input
                                              className="h-9 text-sm"
                                              value={invite.companyName ?? ""}
                                              onChange={(e) => handleEditInviteChange(idx, "companyName", e.target.value)}
                                              data-testid={`input-edit-invite-company-${i}-${idx}`}
                                            />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                            <label className="text-xs font-medium text-amber-900 dark:text-amber-100">
                                              Email {idx + 1}
                                            </label>
                                            <Input
                                              className="h-9 text-sm"
                                              value={invite.email ?? ""}
                                              onChange={(e) => handleEditInviteChange(idx, "email", e.target.value)}
                                              data-testid={`input-edit-invite-email-${i}-${idx}`}
                                            />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="flex gap-2 mt-3">
                                    <Button
                                      size="sm"
                                      className="bg-emerald-600 text-white gap-1"
                                      onClick={handleSaveEdit}
                                      disabled={isStreaming}
                                      data-testid={`button-save-edit-${i}`}
                                    >
                                      <Check className="h-3 w-3" />
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1"
                                      onClick={handleCancelEdit}
                                      disabled={isStreaming}
                                      data-testid={`button-discard-edit-${i}`}
                                    >
                                      <X className="h-3 w-3" />
                                      Discard
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2 ml-6">
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
                                    onClick={() => handleStartEdit(i)}
                                    disabled={isStreaming}
                                    data-testid={`button-edit-action-${i}`}
                                  >
                                    <Pencil className="h-3 w-3" />
                                    Edit
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
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* Vendor selection has been intentionally disabled.
                      {msg.pendingAction && msg.actionStatus === "pending" && msg.pendingAction.type === "select_vendor" && (
                        <div className="ml-10 mt-2">
                          <VendorSelectionCard
                            data={msg.pendingAction.data}
                            disabled={isStreaming}
                            onSelect={(vendor) => handleVendorSelection(i, vendor)}
                          />
                        </div>
                      )}
                      */}

                      {msg.pendingAction && msg.actionStatus === "confirmed" && (
                        <div className="ml-10 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {/* Vendor selection has been intentionally disabled.
                            {msg.pendingAction.type === "select_vendor"
                              ? `Vendor selected: ${msg.pendingAction.data?.selectedVendor?.companyName || "Selected vendor"}`
                              : "Action confirmed and executed"}
                            */}
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
                    </div>
                  )})}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            <div className="flex flex-nowrap items-center gap-1.5 w-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1.5 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOnboardVendorClick}
                disabled={isStreaming || hasPendingVendorSelection}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-onboard-vendor"
              >
                Create Supplier
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInviteSupplierClick}
                disabled={isStreaming || hasPendingVendorSelection}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-invite-supplier"
              >
                Invite Supplier
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRiskAssessmentClick}
                disabled={isStreaming || hasPendingVendorSelection}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-risk-assessment"
              >
                Risk Assessment
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFindVendorsClick}
                disabled={isStreaming || hasPendingVendorSelection}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-find-vendors"
              >
                Find Suppliers
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTopVendorsClick}
                disabled={isStreaming || hasPendingVendorSelection}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-top-vendors"
              >
                Top Suppliers
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCompareVendorsClick}
                disabled={isStreaming || hasPendingVendorSelection}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-compare-vendors"
              >
                Compare Suppliers
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExpiredDocVendorsClick}
                disabled={isStreaming || hasPendingVendorSelection}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-expired-doc-vendors"
              >
                Expired Doc Suppliers
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSupplierDetailsClick}
                disabled={isStreaming || hasPendingVendorSelection}
                className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                data-testid="button-supplier-details"
              >
                Supplier Details
              </Button>
              {supplierApprovalEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSupplierApprovalsClick}
                  disabled={isStreaming || hasPendingVendorSelection}
                  className="h-7 px-2.5 rounded-md text-[11px] flex-shrink-0"
                  data-testid="button-supplier-approvals"
                >
                  Approvals
                </Button>
              )}
            </div>
            <div className="relative w-full flex-shrink-0" ref={mention.composerRef}>
              <ChatComposer
                isCompact
                singleRow
                placeholder={`Ask Prokraya Ai ${AGENT_MENTION_PLACEHOLDER_HINT}`}
                {...mention.composerProps}
                onKeyDown={handleComposerKeyDown}
                disabled={hasPendingVendorSelection}
                ref={mention.inputRef}
                textareaDataTestId="input-vendor-prompt"
                submitDataTestId="button-vendor-submit"
                onMicTranscript={(t) => setPromptText(vendorPrompt ? `${vendorPrompt} ${t}` : t)}
                onSubmit={handleVendorSubmit}
                onStop={stopStreaming}
                isStreaming={isStreaming}
                colorTheme="cyan"
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
          <div className="relative flex-shrink-0 min-h-0 max-h-full hidden md:flex" style={{ width: `${capabilitiesPanelWidth}px` }}>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize capabilities panel"
              className="absolute left-0 top-0 z-20 h-full w-2 -translate-x-1 cursor-col-resize"
              onMouseDown={handleCapabilitiesResizeStart}
              data-testid="capabilities-resize-handle"
            >
              <div className="mx-auto h-full w-px bg-border/70 hover:bg-cyan-500" />
            </div>
          <Card className="w-full flex-shrink-0 flex flex-col min-h-0 max-h-full">
            <CardContent className="flex-1 p-0 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3 border-b flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
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
                {vendorAgentPrompts.map((category) => (
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