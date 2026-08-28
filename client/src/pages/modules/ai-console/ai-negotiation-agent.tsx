import { useState, useRef, useEffect } from "react";
import { useAgentConversation } from "@/hooks/useAgentConversation";
import type { ConversationMessage as AgentConversationMessage } from "@/hooks/useAgentConversation";
import { Link } from "wouter";
import {
  Send,
  Loader2,
  Handshake,
  Bot,
  User,
  Search,
  ArrowLeft,
  CheckCircle2,
  BarChart3,
  TrendingUp,
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
  AlertTriangle,
  TrendingDown,
  Scale,
  DollarSign,
  ShieldAlert,
  MapPin,
  LocateFixed,
  ArrowLeftRight
} from "lucide-react";
import { negotiationAgentPrompts } from "./negotiation-agent-prompts";
import {
  AiInsightPanel,
  FairMarketPricePanel,
  LocalSuppliersPanel,
  CostWaterfallChart,
  SpendTrendChart,
  CURRENCY_SYMBOLS,
} from "@/components/agent-panels/market-grounding-panels";
import { INTEL_COLOR, INTEL_FONT } from "@/components/agent-panels/intel-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import { streamAgentQuery } from "@/lib/streamAgentQuery";
import { useSupplierMentions } from "@/hooks/useSupplierMentions";
import { AGENT_MENTION_PLACEHOLDER_HINT } from "@/hooks/useAgentMentions";
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
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { CapabilitiesInfoButton } from "@/components/agent-panels/capabilities-info-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ClipboardCheck, Calendar, Clock } from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

const capabilities = [
  { icon: Search, label: "Bid Opportunities", description: "Discover and analyze negotiation margins on active bids" },
  { icon: Handshake, label: "Live Rounds", description: "Work bids already under negotiation and counter in-flight offers" },
  { icon: Scale, label: "BATNA & Risk", description: "Formulate walk-away thresholds and alternative awards" },
  { icon: TrendingDown, label: "Historical Trends", description: "Benchmark pricing against past purchases & PO history" },
  { icon: ShieldAlert, label: "Renewal Analysis", description: "Identify escalation clause leverage and quote variances" }
];

// ─── Selector Menu Component for Bids / Contracts ───

function DropdownSelectorCard({
  data,
  disabled,
  type,
  onSelect
}: {
  data: any;
  disabled: boolean;
  type: "bid" | "contract" | "supplier" | "item" | "bidLine";
  onSelect: (selected: any) => void;
}) {
  const [candidates, setCandidates] = useState<any[]>(() => Array.isArray(data?.initialCandidates) ? data.initialCandidates : []);
  const [query, setQuery] = useState("");

  // Suppliers: only a few are preloaded, so search the server (debounced).
  // An empty query restores the preloaded list (never wipes it on mount).
  useEffect(() => {
    if (type !== "supplier") return;
    if (!query.trim()) {
      setCandidates(Array.isArray(data?.initialCandidates) ? data.initialCandidates : []);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/negotiation-agent/suppliers/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json.suppliers)) setCandidates(json.suppliers);
      } catch {
        /* keep current candidates on failure */
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, type, data?.initialCandidates]);

  const matchesQuery = (item: any) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      item.bid_number, item.bid_title, item.contract_number, item.title,
      item.company_name, item.email_id, item.country,
      item.product_name, item.sub_category, item.sku_no, item.description,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  };

  // Suppliers are filtered server-side; everything else filters in-memory.
  const visibleCandidates = type === "supplier" ? candidates : candidates.filter(matchesQuery);

  let title = "";
  let description = "";

  if (type === "bid") {
    title = "Select Bid";
    description = "Please choose one of the following bids from the database to run the negotiation analysis.";
  } else if (type === "contract") {
    title = "Select Contract";
    description = "Please choose one of the following contracts from the database to run the negotiation analysis.";
  } else if (type === "supplier") {
    title = "Select Supplier";
    description = "Please choose one of the following suppliers to analyze their participated bids.";
  } else if (type === "bidLine") {
    title = "Select Line Item";
    description = "This bid has multiple line items — choose one to analyze.";
  } else {
    title = "Select Scope of Supply Item";
    description = "Please choose one of the following items from the supplier's Scope of Supply to analyze pricing benchmarks and bulk savings.";
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
      <CardContent className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <Search className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">{title}</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="ml-6 mb-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            placeholder={`Search ${type}s...`}
            className="h-7 text-xs"
            data-testid={`selector-search-${type}`}
          />
        </div>
        <div className="ml-6 space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
          {visibleCandidates.map((item: any, idx) => {
            let label = "";
            let subLabel = "";
            if (type === "bid") {
              label = item.bid_number;
              subLabel = item.bid_title;
            } else if (type === "contract") {
              label = item.contract_number;
              subLabel = item.title;
            } else if (type === "supplier") {
              label = item.company_name;
              subLabel = [item.supplier_id, item.email_id || item.country].filter(Boolean).join(" · ");
            } else if (type === "bidLine") {
              label = item.description;
              subLabel = `Qty: ${item.quantity} ${item.uom || ""} | Category: ${item.product_category || "—"}`.trim();
            } else {
              label = item.product_name;
              subLabel = `Sub-category: ${item.sub_category || "General"} | SKU: ${item.sku_no} | Std Price: ${item.currency} ${item.last_purchase_rate}`;
            }

            return (
              <button
                key={idx}
                disabled={disabled}
                onClick={() => onSelect(item)}
                className="w-full text-left px-3 py-2 text-xs rounded border bg-background hover:bg-muted transition-colors flex justify-between items-center"
                data-testid={`selector-item-${idx}`}
              >
                <div>
                  <span className="font-semibold block text-foreground">{label}</span>
                  {subLabel && (
                    <span className="text-muted-foreground truncate max-w-[250px] block">{subLabel}</span>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {item.status || "Active"}
                </Badge>
              </button>
            );
          })}
          {visibleCandidates.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">No records found.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Searchable combobox for the negotiation start card ───
// Same Popover+Command pattern as the contracting agent's supplier picker.
// Pass `search`/`onSearchChange` to filter server-side; otherwise filters locally.
function StartCombobox({
  options,
  value,
  onSelect,
  placeholder,
  searchPlaceholder,
  selectedLabel,
  disabled,
  testId,
  search,
  onSearchChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  selectedLabel?: string;
  disabled?: boolean;
  testId: string;
  search?: string;
  onSearchChange?: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const query = onSearchChange ? (search ?? "") : localSearch;
  const setQuery = onSearchChange ?? setLocalSearch;
  const visible = onSearchChange
    ? options
    : options.filter((o) => o.label.toLowerCase().includes(localSearch.trim().toLowerCase()));
  const label = selectedLabel ?? options.find((o) => o.value === value)?.label;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 w-full justify-between px-3 text-sm font-normal bg-[#fafafa] border-[#e5e5e5] font-['Google_Sans'] hover:bg-[#fafafa]"
          data-testid={testId}
        >
          <span className={`truncate ${label ? "" : "text-muted-foreground"}`}>{label || placeholder}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {visible.map((o, i) => (
                <CommandItem
                  key={`${o.value}-${i}`}
                  value={o.value}
                  onSelect={() => { onSelect(o.value); setOpen(false); setQuery(""); }}
                  className="text-xs"
                >
                  <Check className={`mr-2 h-3.5 w-3.5 shrink-0 ${o.value === value ? "opacity-100" : "opacity-0"}`} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Supplier option label — the supp id (e.g. SUPP_1075) is shown because the
// dropdown searches on it too. Name-only for rows without a code.
function supplierLabel(s: { supplier_id?: string; company_name: string }) {
  const code = String(s.supplier_id || "").trim();
  return `${code ? `${code} — ` : ""}${s.company_name}`;
}

// Money formatter for the Without-Bids summaries (currency code prefix).
function fmtMoney(currency: string, n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `${currency || ""} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
}

// ── With Bids / Without Bids mode buttons ──────────────────────────────────
function NegotiationModeCard({
  data,
  disabled,
  onChoose,
}: {
  data: any;
  disabled: boolean;
  onChoose: (mode: "with_bids" | "without_bids") => void;
}) {
  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
      <CardContent className="p-3">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-0.5">
          Negotiation Mode — {data?.supplierName}
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mb-2.5">
          Analyze a closed bid this supplier quoted on, or run a bid-free summary from their purchase history.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => onChoose("with_bids")}
            className="flex-1 gap-1.5 h-9 text-xs"
            data-testid="button-mode-with-bids"
          >
            <TrendingUp className="h-3.5 w-3.5" /> With Bids
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onChoose("without_bids")}
            className="flex-1 gap-1.5 h-9 text-xs"
            data-testid="button-mode-without-bids"
          >
            <TrendingDown className="h-3.5 w-3.5" /> Without Bids
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Supplier-level summary (deterministic rollup) + reusable item picker ────
function SupplierSummaryCard({
  data,
  disabled,
  onSelectItem,
  onChangeCurrency,
}: {
  data: any;
  disabled: boolean;
  onSelectItem: (item: any) => void;
  onChangeCurrency: (currency: string) => void;
}) {
  const r = data?.rollup || {};
  const cur = data?.currency || "";
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const available: string[] = Array.isArray(data?.availableCurrencies) ? data.availableCurrencies : [];
  const [itemQuery, setItemQuery] = useState("");
  const visibleItems = items.filter((item) => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return true;
    return [item.sub_category, item.good_service_code, item.category_code, item.service_details]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  const stat = (label: string, value: string) => (
    <div className="rounded border bg-background px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold text-foreground">{value}</div>
    </div>
  );

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Negotiation Overview — {data?.supplierName}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              Based on the last 12 months of purchase history.
            </p>
          </div>
          {available.length > 1 && (
            <Select value={cur} onValueChange={onChangeCurrency} disabled={disabled}>
              <SelectTrigger className="h-7 w-[88px] text-xs" data-testid="select-summary-currency">
                <SelectValue placeholder={cur} />
              </SelectTrigger>
              <SelectContent>
                {available.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {r.hasHistory ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-3">
            {stat("Total Spend", fmtMoney(cur, r.totalSpend))}
            {stat("Avg Unit Price", fmtMoney(cur, r.avgUnitPrice))}
            {stat("PO Count", String(r.poCount ?? 0))}
            {stat("Avg Discount", `${r.avgHistoricalDiscountPct ?? 0}%`)}
            {stat("Recoverable", fmtMoney(cur, r.recoverableSpend))}
            {stat("Headroom", `${r.headroomPct ?? 0}%`)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mb-3">
            No purchase history in the last 12 months — pick an item below for a category estimate.
          </p>
        )}

        <div className="flex items-center gap-1.5 mb-1.5">
          <Search className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
            Drill into a Scope-of-Supply sub-category
          </p>
        </div>
        {items.length > 0 && (
          <Input
            value={itemQuery}
            onChange={(e) => setItemQuery(e.target.value)}
            disabled={disabled}
            placeholder="Search items..."
            className="h-7 text-xs mb-1.5"
            data-testid="summary-item-search"
          />
        )}
        <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
          {visibleItems.map((item, idx) => (
            <button
              key={item.id ?? idx}
              disabled={disabled}
              onClick={() => onSelectItem(item)}
              className="w-full text-left px-3 py-2 text-xs rounded border bg-background hover:bg-muted transition-colors flex justify-between items-center disabled:opacity-50"
              data-testid={`summary-item-${idx}`}
            >
              <div>
                <span className="font-semibold block text-foreground">
                  {item.sub_category || item.good_service_code || "Item"}
                </span>
                {(item.category_code || item.service_details) && (
                  <span className="text-muted-foreground truncate max-w-[260px] block">
                    {[item.category_code, item.service_details].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
          {items.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">No scope-of-supply items registered.</div>
          )}
          {items.length > 0 && visibleItems.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">No items match your search.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Item-level (sub-category) summary — clean, no charts/tables ─────────────
function ItemSummaryCard({ data }: { data: any }) {
  const item = data?.item || {};
  const cur = data?.currency || "";

  const row = (label: string, value: string, accent?: boolean) => (
    <div className="flex items-center justify-between py-1.5 border-b border-blue-100/60 dark:border-blue-900/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${accent ? "text-blue-700 dark:text-blue-300" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );

  const fmtDate = (d: any) => {
    if (!d) return "";
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? "" : ` (${dt.toLocaleDateString()})`;
  };

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
      <CardContent className="p-3">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
          {item.label} — {data?.supplierName}
        </p>
        {item.singlePurchase ? (
          <>
            {row("Reference price", `${fmtMoney(cur, item.referencePrice)}${fmtDate(item.bestPriceDate)}`)}
            {row("Qty at that purchase", String(item.qtyAtBest ?? "—"))}
            {row("Negotiable", "See market estimate below", true)}
            <p className="text-[11px] text-muted-foreground mt-2">
              Only one prior purchase — negotiable margin is an estimate (see context above).
            </p>
          </>
        ) : (
          <>
            {row("Best price paid", `${fmtMoney(cur, item.bestPrice)}${fmtDate(item.bestPriceDate)}`)}
            {row("Qty at best price", String(item.qtyAtBest ?? "—"))}
            {row("Last price", `${fmtMoney(cur, item.lastPrice)}${fmtDate(item.lastPriceDate)}`)}
            {row("Negotiable", `${fmtMoney(cur, item.negotiable)} (~${item.negotiablePct ?? 0}%)`, true)}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NegotiationRequestFormCard({
  bidId,
  suggestedComment,
  analyzedSupplierName,
  marketBenchmark,
  currency,
  externalSelectedSupplierName,
  overrideComment,
  conversationHistory,
  onSuccess
}: {
  bidId: number | string;
  suggestedComment?: string;
  analyzedSupplierName?: any;
  marketBenchmark?: number | string;
  currency?: { symbol: string; isPrefix: boolean };
  externalSelectedSupplierName?: string | null;
  overrideComment?: string | null;
  conversationHistory?: { role: string; content: string }[];
  onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([]);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [comments, setComments] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [regeneratingComment, setRegeneratingComment] = useState(false);

  const pad = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${h}:${min}`;
  };

  const [openDate, setOpenDate] = useState(() => pad(new Date()));
  const [closeDate, setCloseDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return pad(d);
  });
  const [envOpenDate, setEnvOpenDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return pad(d);
  });

  const toNum = (v: any) => {
    const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const fmtMoney = (n: number) => {
    const rounded = Math.round(n).toLocaleString();
    const sym = currency?.symbol ?? "";
    return currency?.isPrefix === false ? `${rounded}${sym}` : `${sym}${rounded}`;
  };

  const analyzedName =
    analyzedSupplierName && typeof analyzedSupplierName === "object"
      ? Object.keys(analyzedSupplierName).join(", ")
      : String(analyzedSupplierName ?? "");

  const isAnalyzedSupplier = (name: any) =>
    !!analyzedName && String(name ?? "").trim().toLowerCase() === analyzedName.trim().toLowerCase();

  // Pick the leading supplier to negotiate with: the one the strategy was built
  // for, else an explicitly recommended one, else the most competitive quote.
  const getBestResponse = (list: any[]) => {
    if (!list || list.length === 0) return null;
    const analyzed = list.find((r: any) => isAnalyzedSupplier(r.supplier_name));
    if (analyzed) return analyzed;
    const flagged = list.find(
      (r: any) => r.recommended === "Y" || r.is_commercially_selected === "Y" || r.fin_recommended === "Y"
    );
    if (flagged) return flagged;
    const withTotals = list.filter((r: any) => toNum(r.bidtotal) > 0);
    if (withTotals.length > 0) {
      return withTotals.reduce((best: any, r: any) => (toNum(r.bidtotal) < toNum(best.bidtotal) ? r : best));
    }
    return list[0];
  };

  // Draft a professional negotiation comment tailored to a single supplier.
  const draftCommentFor = (r: any) => {
    const quote = toNum(r.bidtotal);
    const benchmark = toNum(marketBenchmark);
    const target = benchmark > 0 && benchmark < quote ? benchmark : quote > 0 ? quote * 0.95 : 0;
    const parts = [`Dear ${r.supplier_name || "Supplier"},`];
    parts.push(quote > 0 ? `thank you for your quote of ${fmtMoney(quote)}.` : `thank you for your proposal.`);
    if (benchmark > 0) {
      parts.push(`Based on current market benchmarks of approximately ${fmtMoney(benchmark)},`);
      parts.push(
        `we believe a more competitive price${target > 0 ? ` closer to ${fmtMoney(target)}` : ""} would better reflect prevailing market rates.`
      );
    } else if (target > 0) {
      parts.push(`Based on market benchmarks, we believe a price closer to ${fmtMoney(target)} would be more competitive.`);
    }
    parts.push(`We value our partnership and look forward to your revised proposal.`);
    return parts.join(" ");
  };

  // Comment shown for the current supplier selection. Keeps the AI-suggested
  // comment for the analyzed supplier; drafts a fresh one for any other choice.
  const buildCommentForSelection = (ids: number[]) => {
    const selected = responses.filter((r: any) => ids.includes(r.supplier_id));
    if (selected.length === 0) return suggestedComment || "";
    if (selected.length === 1) {
      const r = selected[0];
      if (isAnalyzedSupplier(r.supplier_name) && suggestedComment) return suggestedComment;
      return draftCommentFor(r);
    }
    const names = selected.map((r: any) => r.supplier_name).filter(Boolean).join(", ");
    return `Dear ${names || "Suppliers"}, thank you for your quotes. Based on current market benchmarks, we believe more competitive pricing is achievable and invite you to submit revised proposals. We value our partnership and look forward to your best offers.`;
  };

  useEffect(() => {
    if (!bidId) return;
    let active = true;
    setLoading(true);
    fetch(`/api/dbo/bids/${bidId}/evaluate`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch evaluation data");
        return res.json();
      })
      .then((data) => {
        if (active) {
          setBid(data.bid);
          const rList = data.responses || [];
          setResponses(rList);

          if (data.bid?.status === 'Negotiation') {
            setIsSubmitted(true);

            if (data.bid.enddate) {
              const d = new Date(data.bid.enddate);
              if (!isNaN(d.getTime())) setCloseDate(pad(d));
            }
            if (data.bid.startdate) {
              const d = new Date(data.bid.startdate);
              if (!isNaN(d.getTime())) setOpenDate(pad(d));
            }
            if (data.bid.env_open_date) {
              const d = new Date(data.bid.env_open_date);
              if (!isNaN(d.getTime())) setEnvOpenDate(pad(d));
            }

            const invited = rList.filter((r: any) =>
              r.status === 'Request Negotiation' || r.status === 'Under Negotiation'
            );

            if (invited.length > 0) {
              const ids = Array.from(new Set(invited.map((r: any) => r.supplier_id)));
              setSelectedSuppliers(ids);

              const firstWithComment = invited.find((r: any) => r.negotiation_comments);
              if (firstWithComment?.negotiation_comments) {
                setComments(firstWithComment.negotiation_comments);
              }
            }
          } else {
            // Auto-select the best/leading supplier for a fresh negotiation request.
            const best = getBestResponse(rList);
            if (best) setSelectedSuppliers([best.supplier_id]);
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bidId]);

  // Regenerate the negotiation comment whenever the selected supplier(s) change.
  useEffect(() => {
    if (isSubmitted) return;
    setComments(buildCommentForSelection(selectedSuppliers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSuppliers, responses, suggestedComment, isSubmitted]);

  // A user-picked comment (from chat "Replace in Comments" or the "Update
  // Comment" button) always wins over the auto-derived draft above.
  useEffect(() => {
    if (overrideComment) setComments(overrideComment);
  }, [overrideComment]);

  const handleUpdateComment = async () => {
    setRegeneratingComment(true);
    try {
      const currentComment = comments.trim();
      const prompt = currentComment
        ? `Refine this negotiation comment — keep the parts that already work, sharpen the variance percentage, benchmark price, and specific ask where they're weak or missing. Do not rewrite it from scratch.\n\nCurrent comment:\n"""\n${currentComment}\n"""`
        : "Give me a better, more specific negotiation comment for this bid — cite the concrete variance percentage and benchmark price, and one specific ask.";
      const res = await apiRequest("POST", "/api/negotiation-agent/query", {
        prompt,
        conversationHistory: conversationHistory || [],
      });
      const json = await res.json();
      const suggested = json?.pendingAction?.type === "comment_suggestion" ? json.pendingAction.data?.comment : null;
      if (suggested) {
        setComments(suggested);
      } else {
        toast({ title: "Error", description: "Failed to generate a comment. Please try again.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update comment.", variant: "destructive" });
    } finally {
      setRegeneratingComment(false);
    }
  };

  // Follow the panel's supplier selection when this form is driven externally.
  useEffect(() => {
    if (!externalSelectedSupplierName || isSubmitted || responses.length === 0) return;
    const target = String(externalSelectedSupplierName).trim().toLowerCase();
    const match = responses.find((r: any) => {
      const n = String(r.supplier_name || "").trim().toLowerCase();
      return n === target || n.includes(target) || target.includes(n);
    });
    if (match) {
      setSelectedSuppliers((prev) =>
        prev.length === 1 && prev[0] === match.supplier_id ? prev : [match.supplier_id]
      );
    }
  }, [externalSelectedSupplierName, responses, isSubmitted]);

  if (!bidId) return null;

  if (loading) {
    return (
      <Card className="border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/10">
        <CardContent className="p-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span>Fetching bid details and suppliers...</span>
        </CardContent>
      </Card>
    );
  }

  // Only the buyer who raised this bid (or a superadmin) may request
  // negotiation — same buyer field bid-view.tsx's isBidBuyer compares
  // against. The server enforces this too; this just keeps the form from
  // appearing for someone who can't submit it anyway.
  const authData = typeof window !== "undefined" ? localStorage.getItem("prokraya-auth") : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const currentUserId = authParsed?.userId?.toLowerCase?.() || "";
  const isSuperAdmin = authParsed?.userRole === "ROLE_SUPERADMIN" || authParsed?.userRole === "ROLE_SYSADMIN";
  const isBidBuyer = isSuperAdmin || (bid?.buyer && currentUserId && String(bid.buyer).toLowerCase() === currentUserId);

  if (!isBidBuyer) {
    return (
      <Card className="border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/10">
        <CardContent className="p-4 flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Only the buyer who raised this bid can request negotiation.</span>
        </CardContent>
      </Card>
    );
  }

  const allSelected = responses.length > 0 && selectedSuppliers.length === responses.length;

  const toggleSupplier = (id: number) => {
    setSelectedSuppliers((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedSuppliers([]);
    } else {
      setSelectedSuppliers(responses.map((r: any) => r.supplier_id));
    }
  };

  const selectedNames = responses
    .filter((r: any) => selectedSuppliers.includes(r.supplier_id))
    .map((r: any) => r.supplier_name);

  const handleNegotiate = async () => {
    if (selectedSuppliers.length === 0) {
      toast({ title: "Validation Error", description: "Please select at least one supplier.", variant: "destructive" });
      return;
    }
    if (!closeDate) {
      toast({ title: "Validation Error", description: "Please select a close date.", variant: "destructive" });
      return;
    }
    if (!comments.trim()) {
      toast({ title: "Validation Error", description: "Please enter negotiation comments.", variant: "destructive" });
      return;
    }

    const closeDateParsed = new Date(closeDate);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (closeDateParsed < todayStart) {
      toast({ title: "Validation Error", description: "End date must be a future date, not a past date.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("POST", `/api/dbo/bids/${bidId}/request-negotiation`, {
        supplierIds: selectedSuppliers,
        openDate,
        closeDate,
        envOpenDate: bid?.type === "Tender" ? envOpenDate : "",
        comments,
      });

      toast({ title: "Success", description: "Negotiation request sent successfully." });
      setIsSubmitted(true);
      setConfirming(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to initiate negotiation request.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/20 dark:bg-blue-950/10">
        <CardContent className="p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span className="font-semibold text-xs uppercase tracking-wider">Negotiation Requested</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The negotiation has been successfully requested. The bid status has been updated to <strong>Negotiation</strong>, and invitation notifications have been sent to the selected suppliers.
          </p>
          <div className="text-[11px] bg-background/50 border rounded p-2 mt-1 space-y-1">
            <div><span className="font-medium text-muted-foreground">Suppliers:</span> {selectedNames.join(", ")}</div>
            <div><span className="font-medium text-muted-foreground">Close Date:</span> {formatDate(new Date(closeDate), true)}</div>
            <div className="truncate"><span className="font-medium text-muted-foreground">Comments:</span> {comments}</div>
          </div>
          <div className="pt-2 flex justify-end">
            <Link href={`/app/bids/${bidId}`} target="_blank">
              <Button variant="outline" size="sm" className="h-8 text-xs">
                Preview Bid
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="p-4 pb-3 border-b flex flex-row items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-blue-900 dark:text-blue-100">
          Request negotiation
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {confirming ? (
          <div className="space-y-3 py-2 text-center sm:text-left">
            <div className="flex items-start gap-2.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2.5 rounded-lg border border-amber-200 dark:border-amber-900/30">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-[11px] uppercase tracking-wider">Confirm Action</p>
                <p className="text-muted-foreground mt-0.5 leading-relaxed">
                  Are you sure you want to request negotiation with <strong>{selectedSuppliers.length} supplier(s)</strong>? This will update the bid status to <strong>Negotiation</strong> and notify the selected suppliers immediately.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setConfirming(false)}
                disabled={submitting}
              >
                Go Back / Edit
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleNegotiate}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Sending...
                  </>
                ) : (
                  "Confirm & Request"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Select Supplier(s) <span className="text-destructive">*</span>
                </Label>
                <Popover open={supplierDropdownOpen} onOpenChange={setSupplierDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-10 justify-between font-normal text-sm text-foreground bg-background hover:bg-muted/50 border border-border rounded-lg"
                      data-testid="negotiate-supplier-popover-trigger"
                    >
                      <span className="truncate flex-1 text-left">
                        {selectedNames.length > 0 ? selectedNames.join(", ") : "Select Supplier(s)"}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[340px] max-w-[calc(100vw-3rem)] p-1 bg-popover text-popover-foreground shadow-lg border border-border rounded-md" align="start">
                    <div className="p-1 space-y-0.5 max-h-[200px] overflow-y-auto">
                      <label className="flex items-center gap-2 px-2.5 py-2 rounded-sm hover:bg-muted cursor-pointer transition-colors">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleAll}
                        />
                        <span className="text-xs font-semibold">Select All Suppliers</span>
                      </label>
                      <Separator className="my-1" />
                      {responses.map((r: any) => (
                        <label key={r.supplier_id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-sm hover:bg-muted cursor-pointer transition-colors">
                          <Checkbox
                            checked={selectedSuppliers.includes(r.supplier_id)}
                            onCheckedChange={() => toggleSupplier(r.supplier_id)}
                          />
                          <span className="text-xs truncate">{r.supplier_name}</span>
                        </label>
                      ))}
                      {responses.length === 0 && (
                        <div className="text-xs text-muted-foreground p-3 text-center">No suppliers available for this bid.</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedSuppliers.length > 0 && (
                  <Badge variant="secondary" className="rounded-full text-[10px] px-2.5 py-1 font-bold uppercase tracking-wide">
                    {selectedSuppliers.length} Selected
                  </Badge>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Open Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={openDate}
                  onChange={(e) => setOpenDate(e.target.value)}
                  className="h-10 text-sm rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Close Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  className="h-10 text-sm rounded-lg"
                />
              </div>
            </div>

            {bid?.type === "Tender" && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Envelope Open Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={envOpenDate}
                  onChange={(e) => setEnvOpenDate(e.target.value)}
                  className="h-10 text-sm rounded-lg"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Negotiation Comments <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Enter comments or proposal to initiate negotiation"
                rows={3}
                className="text-sm leading-relaxed rounded-lg"
              />
            </div>

            <div className="pt-1 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleUpdateComment}
                disabled={regeneratingComment}
                data-testid="button-update-comment"
              >
                {regeneratingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update Comment"}
              </Button>
              <Link href={`/app/bids/${bidId}/evaluate`} target="_blank">
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  Preview Bid
                </Button>
              </Link>
              <Button
                size="sm"
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
                onClick={() => {
                  if (selectedSuppliers.length === 0) {
                    toast({ title: "Validation Error", description: "Please select at least one supplier.", variant: "destructive" });
                    return;
                  }
                  if (!closeDate) {
                    toast({ title: "Validation Error", description: "Please select a close date.", variant: "destructive" });
                    return;
                  }
                  if (!comments.trim()) {
                    toast({ title: "Validation Error", description: "Please enter negotiation comments.", variant: "destructive" });
                    return;
                  }
                  setConfirming(true);
                }}
              >
                Request Negotiation
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to escape HTML characters
function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Markdown formatting helper
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

    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      if (tableLines.length >= 2) {
        const headerCols = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map(c => c.trim());

        const hasSeparator = tableLines[1].includes('---');
        const startRowIdx = hasSeparator ? 2 : 1;

        let tableHtml = '<div class="overflow-x-auto my-2 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm"><table class="w-full text-left border-collapse text-xs">';

        tableHtml += '<thead class="bg-stone-50 dark:bg-stone-850/60 border-b border-stone-200 dark:border-stone-800"><tr>';
        headerCols.forEach(col => {
          tableHtml += `<th class="px-3 py-2 font-mono uppercase tracking-wider text-[9px] font-bold text-muted-foreground">${bold(col)}</th>`;
        });
        tableHtml += '</tr></thead>';

        tableHtml += '<tbody class="divide-y divide-stone-100 dark:divide-stone-800/40 bg-white dark:bg-stone-900">';
        for (let r = startRowIdx; r < tableLines.length; r++) {
          const rowCols = tableLines[r]
            .split('|')
            .slice(1, -1)
            .map(c => c.trim());

          tableHtml += '<tr class="hover:bg-stone-50/50 dark:hover:bg-stone-850/20">';
          rowCols.forEach(col => {
            tableHtml += `<td class="px-3 py-2 text-foreground font-medium">${bold(col)}</td>`;
          });
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table></div>';
        htmlParts.push(tableHtml);
      }
      continue;
    }

    if (line.match(/^## /)) {
      htmlParts.push(`<h3 class="font-semibold text-sm mt-3 mb-1 text-foreground">${bold(escaped.replace(/^## /, ''))}</h3>`);
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
        htmlParts.push(`<div class="flex items-start gap-1.5 text-xs py-0.5 text-foreground"><span class="text-muted-foreground mt-0.5">&bull;</span><span>${bold(itemText)}</span></div>`);
        i++;
      }
      continue;
    }

    if (line.match(/^\s{2,}/)) {
      htmlParts.push(`<div class="text-xs pl-4 py-0.5 text-muted-foreground">${bold(escaped.trim())}</div>`);
      i++;
      continue;
    }

    htmlParts.push(`<div class="text-xs py-0.5 text-foreground">${bold(escaped)}</div>`);
    i++;
  }

  return htmlParts.join('');
}

const formatAxisValue = (val: any) => {
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return "";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
  return String(Math.round(num));
};

const truncateLabel = (label: string, maxLen = 8) => {
  if (typeof label !== "string") return "";
  return label.length > maxLen ? `${label.substring(0, maxLen)}..` : label;
};

// Custom Tooltip for Recharts
const CustomChartTooltip = ({ active, payload, currency }: any) => {
  if (active && payload && payload.length) {
    const formatWithCurrencyLocal = (val: number | string, currDetails: any) => {
      if (!currDetails) currDetails = { symbol: "$", isPrefix: true };
      const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(num)) return String(val);
      const formattedNum = Math.round(num).toLocaleString();
      return currDetails.isPrefix ? `${currDetails.symbol}${formattedNum}` : `${formattedNum}${currDetails.symbol}`;
    };

    return (
      <div className="bg-background border border-border p-2 rounded shadow-md text-xs">
        <p className="font-semibold">{payload[0].name}</p>
        <p className="text-primary font-medium">{`Price: ${formatWithCurrencyLocal(payload[0].value, currency)}`}</p>
      </div>
    );
  }
  return null;
};

// ── Module-level strategy helpers ──
// Pulled out of the main component so a secondary bid-line item's cached
// analysis can be run through the exact same math as the active item's
// (see ItemInsightCard below) without duplicating the logic per-callsite.

// Prefer the actual selected/analyzed currency code (overview.currency) over
// guessing from a quote string — a plain numeric currentQuote (e.g. 167,
// with no "$"/"INR" markup) would otherwise silently default to "$" even
// when the buyer picked a different working currency.
function getCurrencyDetails(quoteStr: string | number, currencyCode?: string): { symbol: string; isPrefix: boolean } {
  if (currencyCode && CURRENCY_SYMBOLS[currencyCode.toUpperCase()]) {
    return { symbol: CURRENCY_SYMBOLS[currencyCode.toUpperCase()], isPrefix: true };
  }
  if (!quoteStr) return { symbol: "$", isPrefix: true };
  const str = String(quoteStr).trim();
  if (str.startsWith("$")) return { symbol: "$", isPrefix: true };
  if (str.startsWith("£")) return { symbol: "£", isPrefix: true };
  if (str.startsWith("€")) return { symbol: "€", isPrefix: true };
  if (str.startsWith("¥")) return { symbol: "¥", isPrefix: true };
  if (str.startsWith("₹")) return { symbol: "₹", isPrefix: true };
  if (str.endsWith("INR") || str.includes("INR")) return { symbol: " INR", isPrefix: false };
  if (str.endsWith("AED") || str.includes("AED")) return { symbol: " AED", isPrefix: false };
  if (str.endsWith("USD") || str.includes("USD")) return { symbol: "$", isPrefix: true };
  if (str.endsWith("EUR") || str.includes("EUR")) return { symbol: "€", isPrefix: true };
  const letters = str.replace(/[0-9.,\s-]/g, "");
  if (letters.length > 0) {
    const isPrefix = /^[a-zA-Z$£€₹¥]/.test(str);
    return { symbol: isPrefix ? letters : ` ${letters}`, isPrefix };
  }
  return { symbol: "$", isPrefix: true };
}

function formatWithCurrency(val: number | string, currDetails: { symbol: string; isPrefix: boolean }): string {
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return String(val);
  const formattedNum = Math.round(num).toLocaleString();
  return currDetails.isPrefix ? `${currDetails.symbol}${formattedNum}` : `${formattedNum}${currDetails.symbol}`;
}

// Posture-driven target/walk-away/ask-for math — a pure function of one
// item's analysis data, usable for the active item (with a live posture
// toggle) and for any cached secondary item (read-only, default posture).
function computeCalculatedStrategy(data: any, postureOverride: string | null) {
  if (!data) return null;
  const currency = getCurrencyDetails(data.summary?.currentQuote, data.overview?.currency);

  const baseVal = parseFloat(String(data.summary?.currentQuote || "0").replace(/[^0-9.]/g, ""));
  const benchmarkVal = parseFloat(String(data.summary?.marketBenchmark || "0").replace(/[^0-9.]/g, ""));

  const posture = postureOverride || data.strategy?.approach || "Aggressive";

  let target = 0;
  let walkAway = 0;
  let targetPercent = 0;
  let expectedSavings = 0;
  let askFor: string[] = [];

  const hasBenchmark = benchmarkVal > 0 && benchmarkVal < baseVal;

  if (posture === "Aggressive") {
    if (hasBenchmark) {
      target = benchmarkVal;
      walkAway = benchmarkVal + (baseVal - benchmarkVal) * 0.33;
    } else {
      target = baseVal * 0.88;
      walkAway = baseVal * 0.92;
    }
    targetPercent = Math.round(((baseVal - target) / baseVal) * 100);
    expectedSavings = Math.round(baseVal - target);
    askFor = [
      `${targetPercent}% outright price reduction to align with market benchmarks`,
      "Extended payment terms from Net 30 to Net 60",
      "Price locking for 12 months with no escalation clauses",
      "Free freight/logistics and delivery insurance"
    ];
  } else if (posture === "Moderate") {
    if (hasBenchmark) {
      target = benchmarkVal + (baseVal - benchmarkVal) * 0.5;
      walkAway = benchmarkVal + (baseVal - benchmarkVal) * 0.66;
    } else {
      target = baseVal * 0.92;
      walkAway = baseVal * 0.95;
    }
    targetPercent = Math.round(((baseVal - target) / baseVal) * 100);
    expectedSavings = Math.round(baseVal - target);
    askFor = [
      `${targetPercent}% price reduction representing fair volume benchmark discount`,
      "Net 45 payment terms flexibility",
      "Price locking for 6 months with bi-annual reviews",
      "Free freight on orders exceeding MOQ thresholds"
    ];
  } else {
    // Collaborative
    if (hasBenchmark) {
      target = benchmarkVal + (baseVal - benchmarkVal) * 0.75;
      walkAway = baseVal * 0.98;
    } else {
      target = baseVal * 0.95;
      walkAway = baseVal;
    }
    targetPercent = Math.round(((baseVal - target) / baseVal) * 100);
    expectedSavings = Math.round(baseVal - target);
    askFor = [
      `${targetPercent}% collaborative efficiency rebate/discount`,
      "Standard Net 30 payment terms with 2% Net 10 prompt payment discount",
      "Annual volume discount rebate schedules",
      "Co-invest in process efficiency to reduce future logistical overhead"
    ];
  }

  const formattedTarget = formatWithCurrency(target, currency);
  const formattedWalkAway = formatWithCurrency(walkAway, currency);
  const formattedSavings = formatWithCurrency(expectedSavings, currency);

  // Price benchmark shows only the selected supplier's quote — not every
  // alternative supplier on the bid — matching the reference's 4-bar
  // Market / Your Price / Target / Walk-Away chart, with the actual
  // supplier name in place of the generic "Your Price" label.
  const activeSupplierLabel = String(data.summary?.supplier || "Your Price").trim() || "Your Price";
  const currentPriceChart = [
    { name: "Market", price: benchmarkVal },
    { name: activeSupplierLabel, price: baseVal },
    { name: "Target Price", price: target },
    { name: "Walk-Away", price: walkAway },
  ];

  return {
    posture,
    targetPrice: formattedTarget,
    targetPercent,
    walkAwayThreshold: formattedWalkAway,
    askFor,
    expectedSavingsValue: formattedSavings,
    priceChart: currentPriceChart,
    // Raw numbers (vs. the formatted-string fields above) for the Price
    // History / Scorecard / Savings Calculation sections' own math.
    quoteValue: baseVal,
    benchmarkValue: benchmarkVal,
    targetValue: target,
    walkAwayValue: walkAway,
    expectedSavingsRaw: expectedSavings,
  };
}

// Flattens the LLM's reasoning (string or bullet array) into one readable
// paragraph for AiInsightPanel — same normalization for the active item and
// any cached secondary item.
function extractReasoningText(rawReasoning: any): string {
  let text = "";
  if (Array.isArray(rawReasoning)) {
    text = rawReasoning
      .map(s => {
        let str = String(s).trim().replace(/^[•\-\*\s]+/, "");
        if (str && !str.endsWith(".") && !str.endsWith("!") && !str.endsWith("?")) {
          str += ".";
        }
        return str;
      })
      .filter(Boolean)
      .join(" ");
  } else if (typeof rawReasoning === "string" && rawReasoning.trim()) {
    text = rawReasoning
      .split(/[•\-\*\n]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(str => {
        if (str && !str.endsWith(".") && !str.endsWith("!") && !str.endsWith("?")) {
          return str + ".";
        }
        return str;
      })
      .join(" ");
  }
  return text;
}

// Read-only full insight card for a secondary bid-line item (not the active
// one) inside "Items in This Bid" — same panels as the main strategy panel
// (quotes summary, BATNA, cost waterfall, fair market price, AI reasoning,
// local suppliers) minus the interactive posture toggle / supplier switch,
// which stay exclusive to the active item via "Change Item".
function ItemInsightCard({ data }: { data: any }) {
  const currency = getCurrencyDetails(data?.summary?.currentQuote, data?.overview?.currency);
  const calculatedStrategy = computeCalculatedStrategy(data, null);
  const reasoningText = extractReasoningText(data?.strategy?.reasoning);
  if (!calculatedStrategy) return null;

  const confidence = data?.strategy?.confidence || "High";
  const dotColor = confidence === "High" ? INTEL_COLOR.blue : confidence === "Low" ? INTEL_COLOR.red : INTEL_COLOR.amber;

  return (
    <div className="space-y-3 px-3 pb-3 pt-1 bg-[#fafafa] border-t border-[#ebebeb]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] pt-2">
        <div>
          <span className="text-[#888888]">Supplier: </span>
          <span className="font-medium text-[#1a1a18]">
            {typeof data?.summary?.supplier === "string" ? data.summary.supplier : "N/A"}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[#888888]">Quote: </span>
          <span className="font-medium text-[#1a1a18]">{formatWithCurrency(calculatedStrategy.quoteValue, currency)}</span>
        </div>
        <div>
          <span className="text-[#888888]">Market Benchmark: </span>
          <span className="font-medium text-[#1a1a18]">{formatWithCurrency(calculatedStrategy.benchmarkValue, currency)}</span>
        </div>
        <div className="text-right">
          <span className="text-[#888888]">Suggested Target: </span>
          <span className="font-medium text-[#1a1a18]">{calculatedStrategy.targetPrice}</span>
        </div>
      </div>

      {data?.batna?.bestAlternative && (
        <div className="text-[11px] rounded border border-[#ebebeb] bg-white p-2">
          <span className="text-[#888888]">BATNA: </span>
          <span className="font-medium text-[#1a1a18]">{data.batna.bestAlternative}</span>
          {data.batna?.expectedSavings != null && (
            <span className="text-[#43a047] ml-2">Savings: {formatWithCurrency(data.batna.expectedSavings, currency)}</span>
          )}
        </div>
      )}

      {data?.costStructure?.length > 0 && (
        <CostWaterfallChart costStructure={data.costStructure} currencySymbol={currency.symbol.trim()} />
      )}

      {data?.fairMarketPrice && (
        <FairMarketPricePanel
          fairMarketPrice={data.fairMarketPrice}
          quotePrice={calculatedStrategy.quoteValue}
          currencySymbol={currency.symbol.trim()}
        />
      )}

      {reasoningText && (
        <AiInsightPanel
          label="AI Reasoning & Strategy Insights"
          text={reasoningText}
          accentBorder
          footer={{
            confidenceLabel: `Confidence: ${confidence}`,
            dotColor,
            savingsText: `Est. Savings: ${calculatedStrategy.expectedSavingsValue}`,
          }}
        />
      )}

      {data?.localSuppliers?.length > 0 && (
        <LocalSuppliersPanel
          localSuppliers={data.localSuppliers}
          localSuppliersNear={data.localSuppliersNear || data?.overview?.country || "Delivery Location"}
        />
      )}
    </div>
  );
}

export default function AINegotiationAgent() {
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const mention = useSupplierMentions();
  const {
    conversation,
    setConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    groupedConversations,
    currentId,
  } = useAgentConversation("negotiation");

  const [showCapabilities, setShowCapabilities] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Sticky currency for the conversation: once established (via the Without-Bids
  // summary card's currency picker, or a bid analysis' overview.currency), later
  // turns are told to keep using it so the Insights panel stays consistent.
  const negotiationCurrencyRef = useRef<string | null>(null);

  // Cancel an in-flight agent query and finalize the streaming placeholder.
  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  // Negotiation Panel State
  // Index of the conversation message whose insights panel is expanded inline,
  // or null when none is. The panel's derived state (activeStrategyData,
  // postureOverride, panelSuppliers, ...) is a singleton, so only one message
  // can be expanded at a time.
  const [openInsightsMsgIndex, setOpenInsightsMsgIndex] = useState<number | null>(null);
  const [activeStrategyData, setActiveStrategyData] = useState<any>(null);
  const [postureOverride, setPostureOverride] = useState<"Aggressive" | "Moderate" | "Collaborative" | null>(null);
  // Per-supplier panel switching: the AI defaults to L1, the user can switch.
  const [panelSuppliers, setPanelSuppliers] = useState<any[]>([]);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string | null>(null);
  const [refreshingSupplier, setRefreshingSupplier] = useState(false);
  // Set when the user clicks "Replace in Comments" beside a chat-suggested
  // comment; threaded into whichever NegotiationRequestFormCard is active.
  const [commentOverride, setCommentOverride] = useState<string | null>(null);
  // Tracks which strategy message is loaded so unrelated conversation updates
  // don't clobber an ephemeral supplier switch; guards stale refresh responses.
  const appliedStrategyKeyRef = useRef<string | null>(null);
  const refreshSeqRef = useRef(0);

  // Full per-item analysis for secondary items on a multi-line bid ("Items in
  // This Bid" list), keyed by bid-line id. Populated lazily — only when a
  // user expands that item — since each entry is a full LLM + market-grounding
  // re-run server-side, not a cheap lookup. Cleared when the active item's
  // underlying analysis message changes (a different bid/supplier entirely).
  const [itemAnalysisCache, setItemAnalysisCache] = useState<Record<string, any>>({});
  const [expandedItemKeys, setExpandedItemKeys] = useState<Set<string>>(new Set());
  const [fetchingItemKey, setFetchingItemKey] = useState<string | null>(null);

  // ── Negotiation "start" card (chat empty-state) ──
  // A structured bid/supplier picker shown before any conversation exists.
  // It doesn't call any new analysis endpoint — it composes the same kind of
  // prompt a user would type, then submits it through the existing
  // runStream() chat pipeline, so it gets the same real market-grounded
  // analysis as typing/mentioning a supplier does today.
  const [startTab, setStartTab] = useState<"bids" | "supplier">("bids");
  const [startBids, setStartBids] = useState<Array<{ id: number; bidNumber: string; bidTitle: string | null; bidType: string | null; deliveryLocation: string | null }>>([]);
  const [startBidsLoading, setStartBidsLoading] = useState(false);
  const [startSelectedBidId, setStartSelectedBidId] = useState("");
  const [startBidSuppliers, setStartBidSuppliers] = useState<any[]>([]);
  const [startSelectedBidSupplier, setStartSelectedBidSupplier] = useState("");
  const [startBidLines, setStartBidLines] = useState<any[]>([]);
  const [startSelectedBidLineId, setStartSelectedBidLineId] = useState("");
  const [startBidDeliveryLocation, setStartBidDeliveryLocation] = useState("");
  const [startBidLat, setStartBidLat] = useState<number | null>(null);
  const [startBidLng, setStartBidLng] = useState<number | null>(null);
  const [startBidLocating, setStartBidLocating] = useState(false);
  const [startSupplierQuery, setStartSupplierQuery] = useState("");
  const [startSupplierOptions, setStartSupplierOptions] = useState<Array<{ id: number; supplier_id?: string; company_name: string; email_id?: string; country?: string }>>([]);
  const [startSupplierLoading, setStartSupplierLoading] = useState(false);
  const [startSelectedSupplier, setStartSelectedSupplier] = useState<{ id: number; company_name: string; email_id?: string; country?: string } | null>(null);
  const [startScopeItems, setStartScopeItems] = useState<Array<{ id: number; sub_category?: string; category_code?: string; good_service_code?: string; service_details?: string }>>([]);
  const [startScopeLoading, setStartScopeLoading] = useState(false);
  const [startScope, setStartScope] = useState("");
  const [startScopeBids, setStartScopeBids] = useState<Array<{ id: number; bid_number: string; bid_title: string | null; status: string; bidprice?: number; rate?: number; currency?: string }>>([]);
  const [startScopeBidsLoading, setStartScopeBidsLoading] = useState(false);
  const [startScopeBidsMatched, setStartScopeBidsMatched] = useState(true);
  const [startSelectedScopeBid, setStartSelectedScopeBid] = useState<any | null>(null);
  const [startCity, setStartCity] = useState("");
  const [startCountry, setStartCountry] = useState("");
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [startLocating, setStartLocating] = useState(false);

  // Recent bids for Step 1 — loaded once when the "From Bids" tab is first
  // shown. Only bids with at least one supplier response, since there's
  // nothing to negotiate against otherwise.
  useEffect(() => {
    if (startTab !== "bids" || startBids.length > 0) return;
    setStartBidsLoading(true);
    fetch("/api/bids/mention-search?withResponses=1&limit=50")
      .then((r) => r.json())
      .then((d) => setStartBids(Array.isArray(d.bids) ? d.bids : []))
      .catch(() => setStartBids([]))
      .finally(() => setStartBidsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTab]);

  // Step 2 lists suppliers who actually responded with a quote (not every
  // invited supplier) — /suppliers is the invitation list, /responses is
  // the real submitted quotes.
  useEffect(() => {
    setStartBidDeliveryLocation("");
    setStartSelectedBidLineId("");
    if (!startSelectedBidId) {
      setStartBidSuppliers([]);
      setStartSelectedBidSupplier("");
      setStartBidLines([]);
      return;
    }
    fetch(`/api/negotiation-agent/bids/${startSelectedBidId}/responses`)
      .then((r) => r.json())
      .then((d) => setStartBidSuppliers(Array.isArray(d?.responses) ? d.responses : []))
      .catch(() => setStartBidSuppliers([]));
    fetch(`/api/dbo/bids/${startSelectedBidId}/lines`)
      .then((r) => r.json())
      .then((d) => {
        const lines = Array.isArray(d) ? d : [];
        setStartBidLines(lines);
        if (lines.length > 0) setStartSelectedBidLineId(String(lines[0].id));
      })
      .catch(() => setStartBidLines([]));
  }, [startSelectedBidId]);

  // Supplier list for the "From Supplier" tab — a real dropdown of all
  // active suppliers (not a capped typeahead), narrowed further if the user
  // types to filter.
  useEffect(() => {
    if (startTab !== "supplier") return;
    setStartSupplierLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/negotiation-agent/suppliers/search?q=${encodeURIComponent(startSupplierQuery)}&limit=500`)
        .then((r) => r.json())
        .then((d) => setStartSupplierOptions(Array.isArray(d.suppliers) ? d.suppliers : []))
        .catch(() => setStartSupplierOptions([]))
        .finally(() => setStartSupplierLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [startTab, startSupplierQuery]);

  // Scope of Supply items for the chosen supplier — real sub-category-driven
  // items from dbo.supp_scope_of_supply_service, not free text.
  useEffect(() => {
    setStartScope("");
    if (!startSelectedSupplier) {
      setStartScopeItems([]);
      return;
    }
    setStartScopeLoading(true);
    fetch(`/api/negotiation-agent/suppliers/${startSelectedSupplier.id}/scope-of-supply`)
      .then((r) => r.json())
      .then((d) => setStartScopeItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setStartScopeItems([]))
      .finally(() => setStartScopeLoading(false));
  }, [startSelectedSupplier]);

  // Available Bids for the chosen supplier + SOS item — the closed bids that
  // supplier actually quoted on for this item, so "Run Negotiation Analysis"
  // can be grounded in a concrete bid instead of a freeform prompt.
  useEffect(() => {
    setStartSelectedScopeBid(null);
    if (!startSelectedSupplier || !startScope.trim()) {
      setStartScopeBids([]);
      setStartScopeBidsMatched(true);
      return;
    }
    setStartScopeBidsLoading(true);
    fetch(`/api/negotiation-agent/suppliers/${startSelectedSupplier.id}/bids?scope=${encodeURIComponent(startScope.trim())}`)
      .then((r) => r.json())
      .then((d) => {
        setStartScopeBids(Array.isArray(d.bids) ? d.bids : []);
        setStartScopeBidsMatched(d.itemMatched !== false);
      })
      .catch(() => {
        setStartScopeBids([]);
        setStartScopeBidsMatched(true);
      })
      .finally(() => setStartScopeBidsLoading(false));
  }, [startSelectedSupplier, startScope]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  // Open panel and load strategy data when a new negotiation action is loaded or when switching conversations.
  // Only (re)initialize on a genuinely different strategy message so an ephemeral
  // supplier switch survives unrelated conversation updates (e.g. autosave).
  // Re-derive the sticky negotiation currency when resuming a saved conversation
  // (switchConversation replaces `conversation` directly, bypassing runStream's onDone).
  useEffect(() => {
    const lastWithCurrency = [...conversation].reverse().find(
      (m) => m.pendingAction?.data?.currency || m.pendingAction?.data?.overview?.currency
    );
    const cur = lastWithCurrency?.pendingAction?.data?.currency || lastWithCurrency?.pendingAction?.data?.overview?.currency;
    negotiationCurrencyRef.current = cur ? String(cur).toUpperCase() : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  useEffect(() => {
    const idx = [...conversation]
      .map((m, i) => ({ m, i }))
      .reverse()
      .find(({ m }) => m.role === "assistant" && m.pendingAction?.type === "negotiation_insights");
    const strategyMsg = idx?.m;

    if (strategyMsg && strategyMsg.pendingAction) {
      const data = strategyMsg.pendingAction.data;
      const key = `${idx?.i}|${data?.summary?.bidId ?? ""}`;
      if (appliedStrategyKeyRef.current !== key) {
        appliedStrategyKeyRef.current = key;
        // Clone so panel edits never mutate the stored conversation message (ephemeral).
        setActiveStrategyData(JSON.parse(JSON.stringify(data)));
        setPanelSuppliers([]);
        setSelectedSupplierName(null);
      }

      const lastMsg = conversation[conversation.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && lastMsg.pendingAction?.type === "negotiation_insights") {
        setPostureOverride(null); // Reset override for new strategies
        setOpenInsightsMsgIndex(conversation.length - 1);
      }
    } else {
      appliedStrategyKeyRef.current = null;
      setActiveStrategyData(null);
      setOpenInsightsMsgIndex(null);
    }
  }, [conversation]);

  // Apply a per-supplier strategy refresh (client-optimistic + deterministic server merge).
  // Pass no name to let the server default to L1 (also seeds the supplier dropdown list).
  const applySupplierRefresh = async (name?: string) => {
    const data = activeStrategyData;
    const bidId = data?.summary?.bidId;
    if (!bidId) return;
    const seq = ++refreshSeqRef.current;

    // Instant client recompute when the chosen supplier's quote is already known.
    if (name) {
      setSelectedSupplierName(name);
      const match = panelSuppliers.find((s: any) => s.supplierName === name);
      if (match) {
        setActiveStrategyData((prev: any) => prev ? {
          ...prev,
          summary: {
            ...prev.summary,
            supplier: match.supplierName,
            currentQuote: match.quote,
            variance: match.variance,
            negotiationPotential: match.negotiationPotential,
          },
        } : prev);
      }
    }

    setRefreshingSupplier(true);
    try {
      const benchmarkNum = parseFloat(String(data?.summary?.marketBenchmark || "0").replace(/[^0-9.]/g, ""));
      // On a multi-line bid, price the supplier switcher on the ONE item
      // currently being analyzed — not the whole bid total.
      const hasMultipleLines = Array.isArray(data?.overview?.availableBidLines) && data.overview.availableBidLines.length > 1;
      const res = await apiRequest("POST", "/api/negotiation-agent/strategy/refresh", {
        bidId,
        supplierName: name,
        marketBenchmark: benchmarkNum > 0 ? benchmarkNum : undefined,
        marketConditions: data?.strength?.marketConditions,
        costStructure: data?.costStructure,
        lineItemDescription: hasMultipleLines ? data?.overview?.item : undefined,
        itemDescription: data?.overview?.item,
      });
      const json = await res.json();
      if (seq !== refreshSeqRef.current) return; // a newer switch superseded this one
      if (Array.isArray(json.suppliers) && json.suppliers.length > 0) setPanelSuppliers(json.suppliers);
      if (json.summary) {
        setSelectedSupplierName(json.summary.supplier);
        setActiveStrategyData((prev: any) => prev ? {
          ...prev,
          summary: { ...prev.summary, ...json.summary },
          strength: { ...prev.strength, ...json.strength },
          batna: json.batna || prev.batna,
          supplierScorecard: json.supplierScorecard ?? prev.supplierScorecard,
          avgDiscountWonPct: json.avgDiscountWonPct ?? prev.avgDiscountWonPct,
          activeContractsCount: json.activeContractsCount ?? prev.activeContractsCount,
          costStructure: json.costStructure ?? prev.costStructure,
        } : prev);
      }
    } catch {
      // Keep the optimistic client state if the refresh fails.
    } finally {
      if (seq === refreshSeqRef.current) setRefreshingSupplier(false);
    }
  };

  // On a new strategy (bid) — or a different item selected on the same bid —
  // seed the supplier list and default to L1. Keying on the item too ensures
  // switching items on an unchanged bid still re-prices the supplier switcher.
  const activeBidId = activeStrategyData?.summary?.bidId;
  const activeItem = activeStrategyData?.overview?.item;
  useEffect(() => {
    if (!activeBidId) return;
    void applySupplierRefresh(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBidId, activeItem]);

  // Negotiation rounds already run on this bid — fetched live (not carried in
  // the insights JSON) so a reopened analysis reflects negotiations requested
  // since it was generated. Scoped to the item under analysis so the prices
  // line up with the rest of the panel instead of showing whole-bid totals.
  const [negotiationHistory, setNegotiationHistory] = useState<any[]>([]);
  useEffect(() => {
    if (!activeBidId) {
      setNegotiationHistory([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/negotiation-agent/bids/${activeBidId}/negotiations?item=${encodeURIComponent(activeItem || "")}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setNegotiationHistory(Array.isArray(d.negotiations) ? d.negotiations : []);
      })
      .catch(() => {
        if (!cancelled) setNegotiationHistory([]);
      });
    return () => { cancelled = true; };
  }, [activeBidId, activeItem]);

  // Whole-bid quote total for the supplier currently in view. panelSuppliers
  // carries it next to the (per-item on multi-line bids) quote, so no extra fetch.
  const activeBidTotal = (() => {
    const name = selectedSupplierName || activeStrategyData?.summary?.supplier;
    if (!name || typeof name !== "string") return 0;
    const match = panelSuppliers.find((s: any) => s.supplierName === name);
    return Number(match?.bidTotal) || 0;
  })();

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

  const runStream = async (
    promptStr: string,
    history: AgentConversationMessage[],
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
  ) => {
    setIsStreaming(true);
    const placeholderMsg: AgentConversationMessage = {
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true
    };

    if (!confirmAction) {
      setConversation(prev => [
        ...prev,
        {
          role: "user" as const,
          content: promptStr,
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
      mention.reset();
    } else {
      setConversation(prev => [...prev, placeholderMsg]);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    await streamAgentQuery({
      endpoint: "/api/negotiation-agent/query/stream",
      prompt: promptStr,
      conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      confirmAction,
      ...mentionPayload,
      preferredCurrency: negotiationCurrencyRef.current || undefined,
      signal: controller.signal,
      onToken: (token) => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + token };
          }
          return updated;
        });
      },
      onDone: (pendingAction) => {
        setConversation(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            const finalPendingAction = pendingAction ? { ...pendingAction } : undefined;
            if (
              finalPendingAction?.type === "negotiation_insights" &&
              finalPendingAction.data &&
              confirmAction?.type === "select_bid" &&
              confirmAction.data?.selectedBid?.id
            ) {
              if (!finalPendingAction.data.summary) {
                finalPendingAction.data.summary = {};
              }
              if (!finalPendingAction.data.summary.bidId) {
                finalPendingAction.data.summary.bidId = confirmAction.data.selectedBid.id;
              }
            }

            const nextCurrency = finalPendingAction?.data?.currency || finalPendingAction?.data?.overview?.currency;
            if (nextCurrency) negotiationCurrencyRef.current = String(nextCurrency).toUpperCase();

            updated[updated.length - 1] = {
              ...last,
              isStreaming: false,
              pendingAction: finalPendingAction || undefined,
              actionStatus: finalPendingAction ? "pending" as const : undefined,
            };
          }
          return updated;
        });
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

  const handleSubmit = () => {
    if (!mention.prompt.trim() || isStreaming) return;
    runStream(mention.prompt, conversation, undefined, mention.streamMentions);
  };

  const handleDropdownSelect = (msgIndex: number, selectedItem: any) => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction) return;

    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));

    let actionKey = "";
    if (msg.pendingAction.type === "select_bid") {
      actionKey = "selectedBid";
    } else if (msg.pendingAction.type === "select_contract") {
      actionKey = "selectedContract";
    } else if (msg.pendingAction.type === "select_supplier") {
      actionKey = "selectedSupplier";
    } else if (msg.pendingAction.type === "select_item") {
      actionKey = "selectedItem";
    } else if (msg.pendingAction.type === "select_bid_line") {
      actionKey = "selectedBidLine";
    }

    runStream("", conversation, {
      type: msg.pendingAction.type,
      data: {
        ...msg.pendingAction.data,
        originalPrompt: msg.pendingAction.data?.originalPrompt || mention.prompt,
        [actionKey]: selectedItem
      }
    });
  };

  // "Change Item" on a bid analysis response — appends a fresh line-item
  // picker card in chat (not the insights panel), reusing the line list
  // already present on this response so no backend round-trip is needed
  // just to re-show it.
  const handleChangeItemClick = (msg: AgentConversationMessage) => {
    const lines = msg.pendingAction?.data?.overview?.availableBidLines;
    const bidId = msg.pendingAction?.data?.summary?.bidId;
    if (!Array.isArray(lines) || !bidId) return;
    setConversation(prev => [...prev, {
      role: "assistant",
      content: "Please choose a different line item to analyze.",
      timestamp: new Date(),
      pendingAction: {
        type: "select_bid_line",
        data: {
          initialCandidates: lines,
          bidId,
          bidNumber: msg.pendingAction?.data?.overview?.bidNumber,
          supplierName: msg.pendingAction?.data?.summary?.supplier,
        },
        summary: "Select a different line item",
      },
      actionStatus: "pending",
    }]);
  };

  // Expand/collapse a row in "Items in This Bid". The active item already has
  // its full panel below, so this just toggles visibility for it; any other
  // item triggers a headless background re-analysis the first time it's
  // opened — the same select_bid_line round trip "Change Item" uses, minus
  // the visible chat message — and caches the result so re-toggling is instant.
  const toggleItemExpand = (msg: AgentConversationMessage, line: any) => {
    const key = String(line.id);
    setExpandedItemKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

    const isActive = line.description === msg.pendingAction?.data?.overview?.item;
    const bidId = msg.pendingAction?.data?.summary?.bidId;
    if (isActive || !bidId || itemAnalysisCache[key] || fetchingItemKey === key) return;

    setFetchingItemKey(key);
    streamAgentQuery({
      endpoint: "/api/negotiation-agent/query/stream",
      prompt: "",
      conversationHistory: conversation.map(m => ({ role: m.role, content: m.content })),
      confirmAction: {
        type: "select_bid_line",
        data: {
          bidId,
          bidNumber: msg.pendingAction?.data?.overview?.bidNumber,
          supplierName: msg.pendingAction?.data?.summary?.supplier,
          selectedBidLine: line,
        },
      },
      preferredCurrency: negotiationCurrencyRef.current || undefined,
      onToken: () => {},
      onDone: (pendingAction) => {
        if (pendingAction?.type === "negotiation_insights" && pendingAction.data) {
          setItemAnalysisCache(prev => ({ ...prev, [key]: pendingAction.data }));
        }
        setFetchingItemKey(null);
      },
      onError: () => setFetchingItemKey(null),
    });
  };

  // With/Without Bids mode buttons — one-shot, locks the card.
  const handleModeChoose = (msgIndex: number, mode: "with_bids" | "without_bids") => {
    const msg = conversation[msgIndex];
    if (!msg.pendingAction) return;
    setConversation(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));
    runStream("", conversation, {
      type: "select_negotiation_mode",
      data: { ...msg.pendingAction.data, mode },
    });
  };

  // Reusable item picker on the supplier-level summary — does NOT lock the card.
  const handleSummaryItemSelect = (msg: AgentConversationMessage, item: any) => {
    if (!msg.pendingAction) return;
    runStream("", conversation, {
      type: "supplier_negotiation_summary",
      data: {
        supplierId: msg.pendingAction.data?.supplierId,
        supplierName: msg.pendingAction.data?.supplierName,
        currency: msg.pendingAction.data?.currency,
        selectedItem: item,
      },
    });
  };

  // Currency switch on the supplier-level summary — recomputes the rollup.
  const handleSummaryCurrencyChange = (msg: AgentConversationMessage, currency: string) => {
    if (!msg.pendingAction) return;
    if (currency === msg.pendingAction.data?.currency) return;
    runStream("", conversation, {
      type: "select_negotiation_mode",
      data: {
        supplierId: msg.pendingAction.data?.supplierId,
        supplierName: msg.pendingAction.data?.supplierName,
        mode: "without_bids",
        currency,
      },
    });
  };

  const handleClearConversation = () => {
    newConversation();
    mention.reset();
    setActiveStrategyData(null);
    setOpenInsightsMsgIndex(null);
    negotiationCurrencyRef.current = null;
  };

  // Fill delivery city/country from the browser's geolocation via the same
  // keyless reverse geocode used by the Cost Intelligence agent's Get
  // Estimates form (ai-cost-intelligence-agent.tsx).
  const handleStartUseCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      toast({ title: "Location unavailable", description: "Your browser does not support geolocation.", variant: "destructive" });
      return;
    }
    setStartLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          setStartLat(latitude);
          setStartLng(longitude);
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
          const geo = await res.json();
          setStartCity(geo.city || geo.locality || geo.principalSubdivision || "");
          setStartCountry(geo.countryName || "");
        } catch {
          toast({ title: "Couldn't detect location", description: "Please enter your delivery city and country manually.", variant: "destructive" });
        } finally {
          setStartLocating(false);
        }
      },
      () => {
        setStartLocating(false);
        toast({ title: "Location permission denied", description: "Please enter your delivery city and country manually.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Same keyless reverse geocode as handleStartUseCurrentLocation, but fills
  // the single free-text Step 3 field used by the "From Bids" tab.
  const handleStartBidUseCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      toast({ title: "Location unavailable", description: "Your browser does not support geolocation.", variant: "destructive" });
      return;
    }
    setStartBidLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          setStartBidLat(latitude);
          setStartBidLng(longitude);
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
          const geo = await res.json();
          const city = geo.city || geo.locality || geo.principalSubdivision || "";
          const country = geo.countryName || "";
          setStartBidDeliveryLocation([city, country].filter(Boolean).join(", "));
        } catch {
          toast({ title: "Couldn't detect location", description: "Please enter the delivery location manually.", variant: "destructive" });
        } finally {
          setStartBidLocating(false);
        }
      },
      () => {
        setStartBidLocating(false);
        toast({ title: "Location permission denied", description: "Please enter the delivery location manually.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startSelectedBid = startBids.find((b) => String(b.id) === startSelectedBidId);

  // "From Bids" step numbers shift when a sub-step is hidden (e.g. a
  // single-line-item bid skips the item picker), so number them by what's
  // actually visible rather than hardcoding 1/2/3.
  let startBidStepCounter = 1;
  const startBidLineStepNum = startSelectedBidId && startBidLines.length > 1 ? ++startBidStepCounter : null;
  const startBidSupplierStepNum = startSelectedBidId && startBidSuppliers.length > 0 ? ++startBidStepCounter : null;
  const startBidDeliveryStepNum = startSelectedBidId && !startSelectedBid?.deliveryLocation ? ++startBidStepCounter : null;

  const startCanRun = startTab === "bids"
    ? !!startSelectedBidId && (!!startSelectedBid?.deliveryLocation || !!startBidDeliveryLocation.trim())
    : !!startSelectedSupplier && !!startScope.trim() && !!startCity.trim() && !!startCountry.trim()
      && (startScopeBids.length === 0 || !!startSelectedScopeBid);

  // "From Bids" still composes a freeform prompt through the chat pipeline.
  // "From Supplier" submits a structured confirmAction (select_bid, or
  // select_negotiation_mode when no bid was found) — the same mechanism the
  // chat-driven With/Without Bids flow uses — so it lands on a concrete bid
  // (or the deterministic no-bids summary) instead of a freeform prompt that
  // can be hijacked by the server's keyword auto-trigger (e.g. any prompt
  // text containing "scope of supply" bounces back to a generic supplier
  // picker when sent without a confirmAction).
  const handleStartNegotiation = () => {
    if (!startCanRun || isStreaming) return;

    if (startTab === "bids") {
      const bid = startBids.find((b) => String(b.id) === startSelectedBidId);
      const supplierPart = startSelectedBidSupplier ? `, focusing on ${startSelectedBidSupplier}'s quotation` : "";
      const selectedLine = startBidLines.find((l: any) => String(l.id) === startSelectedBidLineId);
      const linePart = selectedLine ? `, for line item "${selectedLine.description}" (qty ${selectedLine.quantity} ${selectedLine.uom || ""})`.trim() : "";
      const deliveryLocation = bid?.deliveryLocation || startBidDeliveryLocation.trim();
      const deliveryPart = deliveryLocation ? `, delivering to ${deliveryLocation}` : "";
      const promptText = `Run a negotiation analysis for bid ${bid?.bidNumber || startSelectedBidId}${bid?.bidTitle ? ` (${bid.bidTitle})` : ""}${supplierPart}${linePart}${deliveryPart}.`;
      runStream(promptText, [], undefined, {});
    } else if (startSelectedSupplier) {
      const label = startSelectedSupplier.company_name || "Unnamed vendor";
      const mentionText = `@${label}`;
      const promptText = `Run a negotiation analysis for ${mentionText}, scope of supply ${startScope.trim()}, delivering to ${startCity.trim()}, ${startCountry.trim()}.`;
      const start = promptText.indexOf(mentionText);
      const mentions: SupplierMention[] = [{
        supplierId: startSelectedSupplier.id,
        companyName: label,
        emailId: startSelectedSupplier.email_id || null,
        start,
        end: start + mentionText.length,
        display: mentionText,
      }];

      if (startSelectedScopeBid) {
        runStream("", [], {
          type: "select_bid",
          data: {
            selectedBid: startSelectedScopeBid,
            supplierId: startSelectedSupplier.id,
            supplierName: label,
            scopeItem: startScope.trim(),
            city: startCity.trim(),
            country: startCountry.trim(),
            lat: startLat,
            lng: startLng,
          },
        }, { mentions });
      } else {
        runStream("", [], {
          type: "select_negotiation_mode",
          data: { supplierId: startSelectedSupplier.id, supplierName: label, mode: "without_bids" },
        }, { mentions });
      }
    }
  };

  // ── Strategy Calculations based on chosen posture ──
  // getCurrencyDetails/formatWithCurrency/computeCalculatedStrategy are
  // module-level (above) so ItemInsightCard can run the same math for a
  // cached secondary item.
  const currency = getCurrencyDetails(activeStrategyData?.summary?.currentQuote, activeStrategyData?.overview?.currency);
  const calculatedStrategy = computeCalculatedStrategy(activeStrategyData, postureOverride);

  const rawOverallStr = activeStrategyData?.strength?.overallPosition || "Strong";
  const overallBadgeColor = rawOverallStr.toUpperCase().includes("STRONG")
    ? "bg-blue-500 text-white"
    : rawOverallStr.toUpperCase().includes("MODERATE")
      ? "bg-amber-500 text-white"
      : "bg-red-500 text-white";

  return (
    <div className="px-4 pt-2 pb-3 flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      {/* Top Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-1 mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen((p) => !p)} data-testid="button-toggle-history">
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <Link href="/app/ai-intelligence-suite">
            <Button variant="ghost" size="icon" data-testid="button-back-ai-agents">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30">
            <Handshake className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Negotiation Intelligence Agent</h1>
          <Badge variant="outline" className="gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
            <Zap className="h-3 w-3" />
            Negotiation-Ready
          </Badge>
          <Badge variant="outline" className="gap-1.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400">
            Active
          </Badge>
        </div>
        <CapabilitiesInfoButton capabilities={capabilities} />
      </div>

      <div className="flex-1 flex gap-3 min-h-0 max-h-full overflow-hidden relative">
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

        {/* Central Chat Interface */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardContent className="flex-1 p-4 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4" data-testid="chat-messages-negotiation">
              {conversation.length === 0 ? (
                <div className="h-full flex items-center justify-center overflow-y-auto py-4">
                  <div className="w-full max-w-lg space-y-4">
                    <div className="text-center">
                      <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30 w-fit mx-auto mb-3">
                        <Handshake className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h3 className="font-semibold text-lg mb-1">Negotiation Intelligence</h3>
                      <p className="text-sm text-muted-foreground">
                        Pick a bid or a supplier below to run a market-grounded negotiation analysis, or just type/mention one in the chat.
                      </p>
                    </div>

                    {/* Negotiation start card: structured picker that submits through
                        the same chat pipeline as typing/mentioning a bid or supplier. */}
                    <div className="rounded-lg border border-[#ebebeb] bg-white p-5 font-['Google_Sans'] text-left">
                      <p className="text-[9px] uppercase text-[#888888] tracking-[0.1em] mb-3">Select Source</p>
                      <div className="flex border border-[#ebebeb] rounded-md overflow-hidden w-fit mb-4">
                        {(["bids", "supplier"] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setStartTab(tab)}
                            className={`text-[10px] uppercase tracking-[0.06em] px-5 py-2 border-none cursor-pointer ${
                              startTab === tab ? "bg-[#1a1a18] text-white" : "bg-white text-[#888888]"
                            } ${tab === "bids" ? "border-r border-[#ebebeb]" : ""}`}
                          >
                            {tab === "bids" ? "From Bids" : "From Supplier"}
                          </button>
                        ))}
                      </div>

                      {startTab === "bids" ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] uppercase text-[#888888] tracking-[0.08em] block mb-1.5">
                              Step 1 — Select Bid <span className="text-[#e53935]">*</span>
                            </label>
                            <StartCombobox
                              options={startBids.map((b) => ({ value: String(b.id), label: `${b.bidNumber}${b.bidType ? ` (${b.bidType})` : ""}${b.bidTitle ? ` — ${b.bidTitle}` : ""}` }))}
                              value={startSelectedBidId}
                              onSelect={setStartSelectedBidId}
                              placeholder={startBidsLoading ? "Loading bids…" : "Choose a bid…"}
                              searchPlaceholder="Search bids…"
                              testId="select-start-bid"
                            />
                          </div>

                          {startBidLineStepNum && (
                            <div>
                              <label className="text-[10px] uppercase text-[#888888] tracking-[0.08em] block mb-1.5">
                                Step {startBidLineStepNum} — Select Item
                              </label>
                              <StartCombobox
                                options={startBidLines.map((line: any) => ({
                                  value: String(line.id),
                                  label: `${line.description}${line.quantity ? ` (Qty: ${line.quantity} ${line.uom || ""})`.trim() : ""}`,
                                }))}
                                value={startSelectedBidLineId}
                                onSelect={setStartSelectedBidLineId}
                                placeholder="Any item (analyzes across all items)"
                                searchPlaceholder="Search items…"
                                testId="select-start-bid-line"
                              />
                            </div>
                          )}

                          {startBidSupplierStepNum && (
                            <div>
                              <label className="text-[10px] uppercase text-[#888888] tracking-[0.08em] block mb-1.5">
                                Step {startBidSupplierStepNum} — Select Supplier Quotation
                              </label>
                              <StartCombobox
                                options={startBidSuppliers.map((s: any) => ({
                                  value: String(s.supplier_name || s.supplierName || ""),
                                  label: s.supplier_name || s.supplierName || "Unnamed supplier",
                                }))}
                                value={startSelectedBidSupplier}
                                onSelect={setStartSelectedBidSupplier}
                                placeholder="Any supplier (defaults to lowest quote)"
                                searchPlaceholder="Search suppliers…"
                                testId="select-start-bid-supplier"
                              />
                            </div>
                          )}

                          {startBidDeliveryStepNum && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                                <label className="flex items-center gap-1.5 text-[10px] uppercase text-[#888888] tracking-[0.08em]">
                                  <MapPin className="h-3 w-3" />
                                  Step {startBidDeliveryStepNum} — Delivery Location <span className="text-[#e53935]">*</span>
                                </label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleStartBidUseCurrentLocation}
                                  disabled={startBidLocating}
                                  className="h-7 text-[10px] gap-1.5 font-['Google_Sans']"
                                >
                                  {startBidLocating ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
                                  Use current location
                                </Button>
                              </div>
                              <Input
                                value={startBidDeliveryLocation}
                                onChange={(e) => { setStartBidDeliveryLocation(e.target.value); setStartBidLat(null); setStartBidLng(null); }}
                                placeholder="e.g. Frankfurt, Germany"
                                className="h-10 text-sm bg-[#fafafa] border-[#e5e5e5] font-['Google_Sans']"
                                data-testid="input-start-bid-delivery-location"
                              />
                              {startBidLat != null && startBidLng != null && (
                                <p className="text-[10px] text-[#aaaaaa] mt-1.5 font-['Google_Sans']" data-testid="text-start-bid-coordinates">
                                  Coordinates: {startBidLat.toFixed(5)}, {startBidLng.toFixed(5)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] uppercase text-[#888888] tracking-[0.08em] block mb-1.5">
                              Select Supplier <span className="text-[#e53935]">*</span>
                            </label>
                            <StartCombobox
                              options={startSupplierOptions.map((s) => ({
                                value: String(s.id),
                                label: supplierLabel(s),
                              }))}
                              value={startSelectedSupplier ? String(startSelectedSupplier.id) : ""}
                              onSelect={(v) => setStartSelectedSupplier(startSupplierOptions.find((s) => String(s.id) === v) || null)}
                              selectedLabel={startSelectedSupplier ? supplierLabel(startSelectedSupplier) : undefined}
                              placeholder={startSupplierLoading ? "Searching…" : "Choose a supplier…"}
                              searchPlaceholder="Search by supplier name or ID…"
                              testId="select-start-supplier"
                              search={startSupplierQuery}
                              onSearchChange={setStartSupplierQuery}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] uppercase text-[#888888] tracking-[0.08em] block mb-1.5">
                              Scope of Supply (SOS) <span className="text-[#e53935]">*</span>
                            </label>
                            <StartCombobox
                              options={startScopeItems.map((item) => {
                                const label = item.sub_category || item.good_service_code || item.service_details || item.category_code || "Unnamed item";
                                return { value: label, label };
                              })}
                              value={startScope}
                              onSelect={setStartScope}
                              disabled={!startSelectedSupplier}
                              placeholder={
                                !startSelectedSupplier
                                  ? "Select a supplier first"
                                  : startScopeLoading
                                    ? "Loading scope of supply…"
                                    : startScopeItems.length === 0
                                      ? "No scope of supply items found"
                                      : "Select scope of supply…"
                              }
                              searchPlaceholder="Search scope of supply…"
                              testId="select-start-scope"
                            />
                          </div>

                          {startScope && (
                            <div>
                              <label className="text-[10px] uppercase text-[#888888] tracking-[0.08em] block mb-1.5">
                                Available Bids
                              </label>
                              <StartCombobox
                                options={startScopeBids.map((bid) => ({
                                  value: String(bid.id),
                                  label: `${bid.bid_number}${bid.bid_title ? ` — ${bid.bid_title}` : ""}${bid.bidprice != null ? ` (${bid.currency || ""} ${bid.bidprice})` : ""}${bid.status === "Negotiation" ? " · In Negotiation" : ""}`,
                                }))}
                                value={startSelectedScopeBid ? String(startSelectedScopeBid.id) : ""}
                                onSelect={(v) => setStartSelectedScopeBid(startScopeBids.find((b) => String(b.id) === v) || null)}
                                disabled={startScopeBidsLoading || startScopeBids.length === 0}
                                placeholder={
                                  startScopeBidsLoading
                                    ? "Loading available bids…"
                                    : startScopeBids.length === 0
                                      ? "No bids found for this item"
                                      : "Select a bid…"
                                }
                                searchPlaceholder="Search bids…"
                                testId="select-start-scope-bid"
                              />
                              {!startScopeBidsLoading && startScopeBids.length === 0 && (
                                <p className="text-xs text-[#888888] mt-1.5">
                                  No bids found for this supplier & item — analysis will use purchase history instead.
                                </p>
                              )}
                              {!startScopeBidsLoading && startScopeBids.length > 0 && !startScopeBidsMatched && (
                                <p className="text-xs text-[#888888] mt-1.5">
                                  No exact item match — showing all closed bids from this supplier.
                                </p>
                              )}
                            </div>
                          )}

                          <div className="border border-[#e5e5e5] rounded-md p-3.5 bg-[#fafafa]">
                            <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                              <span className="flex items-center gap-1.5 text-[10px] uppercase text-[#888888] tracking-[0.08em]">
                                <MapPin className="h-3 w-3" />
                                Delivery Location <span className="text-[#e53935]">*</span>
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleStartUseCurrentLocation}
                                disabled={startLocating}
                                className="h-7 text-[10px] gap-1.5 font-['Google_Sans']"
                              >
                                {startLocating ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
                                Use current location
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] uppercase text-[#888888] tracking-[0.08em] block mb-1">City</label>
                                <Input
                                  value={startCity}
                                  onChange={(e) => { setStartCity(e.target.value); setStartLat(null); setStartLng(null); }}
                                  placeholder="e.g. Frankfurt, Dubai"
                                  className="h-9 text-sm bg-white border-[#e5e5e5] font-['Google_Sans']"
                                  data-testid="input-start-city"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase text-[#888888] tracking-[0.08em] block mb-1">Country</label>
                                <Input
                                  value={startCountry}
                                  onChange={(e) => { setStartCountry(e.target.value); setStartLat(null); setStartLng(null); }}
                                  placeholder="e.g. Germany, UAE"
                                  className="h-9 text-sm bg-white border-[#e5e5e5] font-['Google_Sans']"
                                  data-testid="input-start-country"
                                />
                              </div>
                            </div>
                            {startLat != null && startLng != null && (
                              <p className="text-[10px] text-[#aaaaaa] mt-1.5 font-['Google_Sans']" data-testid="text-start-coordinates">
                                Coordinates: {startLat.toFixed(5)}, {startLng.toFixed(5)}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={handleStartNegotiation}
                        disabled={!startCanRun || isStreaming}
                        className="mt-4 w-full h-10 px-6 bg-[#1a1a18] hover:bg-[#2a2a26] text-white text-[10px] uppercase tracking-[0.1em] font-['Google_Sans'] gap-2"
                        data-testid="button-run-negotiation-start"
                      >
                        <Handshake className="h-3.5 w-3.5" />
                        Run Negotiation Analysis
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {conversation.map((msg, i) => (
                    <div key={i}>
                      <div className={`flex gap-3 items-start ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="w-8 h-8 rounded-full border border-stone-200/50 dark:border-stone-800 bg-[#fbfbfb] dark:bg-stone-900 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                            <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        )}
                        <div className={`p-3 max-w-[70%] shadow-sm ${msg.role === "user"
                          ? "bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 font-medium rounded-2xl rounded-tr-sm border-none"
                          : "bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-850 rounded-2xl rounded-tl-sm"
                          }`}>
                          {msg.role === "assistant" ? (
                            msg.isStreaming && !msg.content ? (
                              <ThinkingTips />
                            ) : msg.isStreaming ? (
                              <p className="text-xs whitespace-pre-wrap">{msg.content}<span className="inline-block w-0.5 h-3 bg-current ml-0.5 align-middle animate-pulse" /></p>
                            ) : (
                              <>
                                <div
                                  className="text-sm leading-relaxed text-stone-850 dark:text-stone-200 [&_h3]:text-foreground [&_h4]:text-muted-foreground [&_strong]:text-foreground"
                                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                                />
                                {msg.pendingAction?.type === "negotiation_insights" && (
                                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        if (openInsightsMsgIndex === i) {
                                          setOpenInsightsMsgIndex(null);
                                          return;
                                        }
                                        setActiveStrategyData(msg.pendingAction?.data);
                                        setOpenInsightsMsgIndex(i);
                                      }}
                                      className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-[9px] tracking-wider uppercase px-3 h-7 font-bold rounded shadow-sm gap-1.5"
                                      data-testid="button-toggle-insights"
                                    >
                                      <TrendingDown className="h-3.5 w-3.5" />
                                      {openInsightsMsgIndex === i ? "Close Insights" : "Open Insights"}
                                    </Button>
                                    {/* Change Item — only when this bid has more than one line item */}
                                    {Array.isArray(msg.pendingAction.data?.overview?.availableBidLines) &&
                                      msg.pendingAction.data.overview.availableBidLines.length > 1 && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleChangeItemClick(msg)}
                                          className="gap-1.5 h-7 px-2.5 text-[11px]"
                                          data-testid="button-change-item"
                                        >
                                          <Search className="h-3 w-3" />
                                          Change Item
                                        </Button>
                                      )}
                                  </div>
                                )}
                                {msg.pendingAction?.type === "comment_suggestion" && (
                                  <div className="mt-2.5">
                                    <Button
                                      size="sm"
                                      onClick={() => setCommentOverride(msg.pendingAction?.data?.comment)}
                                      className="bg-[#c5c4c0] hover:bg-[#b8b7b3] text-white dark:bg-stone-700 dark:hover:bg-stone-600 dark:text-stone-200 font-mono text-[9px] tracking-wider uppercase px-3 h-7 font-bold rounded shadow-sm gap-1.5"
                                      data-testid="button-replace-comment"
                                    >
                                      <ClipboardCheck className="h-3.5 w-3.5" />
                                      Replace in Comments
                                    </Button>
                                  </div>
                                )}
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
                          <p className="text-[10px] opacity-40 mt-1.5 text-right font-mono">
                            {formatDate(msg.timestamp, true)}
                          </p>
                        </div>
                        {msg.role === "user" && (
                          <div className="w-8 h-8 rounded-full border border-stone-200/50 dark:border-stone-800 bg-[#fbfbfb] dark:bg-stone-900 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                            <User className="h-4 w-4 text-stone-700 dark:text-stone-300" />
                          </div>
                        )}
                      </div>

                      {/* Dropdown selectors for Bids or Contracts or Suppliers */}
                      {msg.pendingAction && msg.actionStatus === "pending" && (
                        (msg.pendingAction.type === "select_bid" ||
                          msg.pendingAction.type === "select_contract" ||
                          msg.pendingAction.type === "select_supplier" ||
                          msg.pendingAction.type === "select_item" ||
                          msg.pendingAction.type === "select_bid_line") && (
                          <div className="ml-10 mt-2">
                            <DropdownSelectorCard
                              data={msg.pendingAction.data}
                              disabled={isStreaming}
                              type={
                                msg.pendingAction.type === "select_bid"
                                  ? "bid"
                                  : msg.pendingAction.type === "select_contract"
                                    ? "contract"
                                    : msg.pendingAction.type === "select_supplier"
                                      ? "supplier"
                                      : msg.pendingAction.type === "select_bid_line"
                                        ? "bidLine"
                                        : "item"
                              }
                              onSelect={(item) => handleDropdownSelect(i, item)}
                            />
                          </div>
                        )
                      )}

                      {/* With Bids / Without Bids mode buttons */}
                      {msg.pendingAction && msg.actionStatus === "pending" &&
                        msg.pendingAction.type === "select_negotiation_mode" && (
                          <div className="ml-10 mt-2 max-w-[70%]">
                            <NegotiationModeCard
                              data={msg.pendingAction.data}
                              disabled={isStreaming}
                              onChoose={(mode) => handleModeChoose(i, mode)}
                            />
                          </div>
                        )}

                      {/* Supplier-level Without-Bids summary (reusable item picker) */}
                      {msg.pendingAction && msg.pendingAction.type === "supplier_negotiation_summary" && (
                        <div className="ml-10 mt-2 max-w-[70%]">
                          <SupplierSummaryCard
                            data={msg.pendingAction.data}
                            disabled={isStreaming}
                            onSelectItem={(item) => handleSummaryItemSelect(msg, item)}
                            onChangeCurrency={(cur) => handleSummaryCurrencyChange(msg, cur)}
                          />
                        </div>
                      )}

                      {/* Item-level Without-Bids summary (read-only) */}
                      {msg.pendingAction && msg.pendingAction.type === "item_negotiation_summary" && (
                        <div className="ml-10 mt-2 max-w-[70%]">
                          <ItemSummaryCard data={msg.pendingAction.data} />
                        </div>
                      )}

                      {/* Interactive Negotiation Request Form Card */}
                      {msg.pendingAction && msg.pendingAction.type === "negotiation_insights" && (
                        <div className="ml-10 mt-2 max-w-[70%]">
                          <NegotiationRequestFormCard
                            bidId={msg.pendingAction.data?.summary?.bidId}
                            suggestedComment={msg.pendingAction.data?.strategy?.suggestedComment}
                            analyzedSupplierName={msg.pendingAction.data?.summary?.supplier}
                            marketBenchmark={msg.pendingAction.data?.summary?.marketBenchmark}
                            currency={getCurrencyDetails(msg.pendingAction.data?.summary?.currentQuote, msg.pendingAction.data?.overview?.currency)}
                            externalSelectedSupplierName={
                              msg.pendingAction.data?.summary?.bidId === activeBidId ? selectedSupplierName : null
                            }
                            overrideComment={
                              msg.pendingAction.data?.summary?.bidId === activeBidId ? commentOverride : null
                            }
                            conversationHistory={conversation.map((m) => ({ role: m.role, content: m.content }))}
                          />
                        </div>
                      )}

                      {/* Inline Negotiation Strategy Panel (one open at a time) */}
                      {openInsightsMsgIndex === i && calculatedStrategy && (
                        <div className="ml-10 mt-2 max-w-[min(70%,880px)] @container">
                          <Card className="border-blue-100 dark:border-blue-900/40">
                            <CardHeader className="p-3 border-b flex flex-row items-center justify-between flex-shrink-0 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <TrendingDown className="h-4.5 w-4.5 text-blue-600 flex-shrink-0" />
                                <div className="min-w-0">
                                  <CardTitle className="text-sm font-semibold leading-tight">Negotiation Strategy Panel</CardTitle>
                                  {activeStrategyData?.overview?.item && (
                                    <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 mt-1 inline-block truncate max-w-full font-medium" data-testid="text-active-item">
                                      Item: {activeStrategyData.overview.item}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={() => setOpenInsightsMsgIndex(null)} data-testid="button-close-insights">
                                <X className="h-4 w-4" />
                              </Button>
                            </CardHeader>

                            <CardContent className="p-4 space-y-4 font-['Google_Sans']">

                              <div>
                                <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">Quotations Overview</p>
                                <div className="rounded-lg border border-[#ebebeb] p-3 space-y-2.5 bg-white">
                                  {/* Whole-bid total for the supplier in view — the rest of the
                                      panel prices a single line item on multi-item bids. */}
                                  {activeBidTotal > 0 && (
                                    <div className="flex justify-between items-baseline text-[11px] border-b border-[#f0f0f0] pb-2" data-testid="text-total-bid-value">
                                      <span className="text-[#555555]">Total Bid Value:</span>
                                      <span className="font-semibold text-[#1a1a18]">
                                        {formatWithCurrency(activeBidTotal, currency)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between items-baseline text-[11px] border-b border-[#f0f0f0] pb-2">
                                    <span className="text-[#555555]">Fair Market Price (FMP):</span>
                                    <span className="font-medium text-[#1a1a18]">
                                      {formatWithCurrency(activeStrategyData.summary?.marketBenchmark || 0, currency)}
                                    </span>
                                  </div>

                                  {activeStrategyData.summary?.quotes && activeStrategyData.summary.quotes.length > 0 ? (
                                    <div className="overflow-hidden border border-[#ebebeb] rounded-md">
                                      <table className="w-full border-collapse text-left text-[11px]">
                                        <thead>
                                          <tr className="bg-[#fafafa] border-b border-[#ebebeb] text-[9px] uppercase text-[#555555]">
                                            <th className="p-1.5 font-normal">Supplier</th>
                                            <th className="p-1.5 text-right font-normal">Quote</th>
                                            <th className="p-1.5 text-right font-normal">Variance</th>
                                            <th className="p-1.5 text-center font-normal">Potential</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {activeStrategyData.summary.quotes.map((qRow: any, idx: number) => {
                                            const quoteVal = parseFloat(String(qRow.quote || "0").replace(/[^0-9.]/g, ""));
                                            const varianceStr = String(qRow.variance || "");
                                            const isBelowBenchmark = varianceStr.startsWith("-");

                                            const badgeColor = qRow.negotiationPotential?.toUpperCase() === "HIGH"
                                              ? "text-[#43a047] border-[#c8e6c9] bg-[#f1f8f1]"
                                              : qRow.negotiationPotential?.toUpperCase() === "MEDIUM"
                                                ? "text-[#b45309] border-[#fde68a] bg-[#fffbeb]"
                                                : "text-[#e53935] border-[#fecaca] bg-[#fef2f2]";

                                            return (
                                              <tr key={idx} className="border-b border-[#f5f5f4] last:border-0 hover:bg-[#fafafa]">
                                                <td className="p-1.5 text-[#333333] truncate max-w-[90px]">{qRow.supplierName || "N/A"}</td>
                                                <td className="p-1.5 text-right font-medium text-[#1a1a18]">
                                                  {formatWithCurrency(quoteVal, currency)}
                                                </td>
                                                <td className={`p-1.5 text-right font-medium ${isBelowBenchmark ? "text-[#43a047]" : "text-[#e53935]"}`}>
                                                  {varianceStr}
                                                </td>
                                                <td className="p-1.5 text-center">
                                                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${badgeColor}`}>
                                                    {qRow.negotiationPotential || "Low"}
                                                  </span>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#555555]">Supplier:</span>
                                        <span className="font-medium text-[#1a1a18]">
                                          {activeStrategyData.summary?.supplier && typeof activeStrategyData.summary.supplier === "object"
                                            ? Object.keys(activeStrategyData.summary.supplier).join(", ")
                                            : activeStrategyData.summary?.supplier || "N/A"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#555555]">Current Quote:</span>
                                        <span className="font-medium text-[#1a1a18]">
                                          {activeStrategyData.summary?.currentQuote && typeof activeStrategyData.summary.currentQuote === "object"
                                            ? Object.entries(activeStrategyData.summary.currentQuote).map(([k, v]) => `${k}: ${v}`).join(", ")
                                            : activeStrategyData.summary?.currentQuote || "N/A"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#555555]">Market Benchmark:</span>
                                        <span className="font-medium text-[#1a1a18]">
                                          {formatWithCurrency(activeStrategyData.summary?.marketBenchmark || 0, currency)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#555555]">Variance:</span>
                                        <span className="font-medium text-[#e53935]">{activeStrategyData.summary?.variance || "N/A"}</span>
                                      </div>
                                      {activeStrategyData.summary?.renewalIncrease && (
                                        <div className="flex justify-between items-center text-xs">
                                          <span className="text-[#555555]">Renewal Increase:</span>
                                          <span className="font-medium text-[#b45309]">{activeStrategyData.summary.renewalIncrease}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-[#555555]">Negotiation Potential:</span>
                                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium text-[#43a047] border-[#c8e6c9] bg-[#f1f8f1]">
                                          {activeStrategyData.summary?.negotiationPotential || "High"}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Suppliers already negotiated on this bid — one row per past
                                  round. Hidden entirely when the bid has never been negotiated. */}
                              {negotiationHistory.length > 0 && (
                                <div data-testid="section-previous-negotiations">
                                  <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">
                                    Previous Negotiations ({negotiationHistory.length})
                                  </p>
                                  <div className="overflow-hidden border border-[#ebebeb] rounded-md bg-white">
                                    <table className="w-full border-collapse text-left text-[11px]">
                                      <thead>
                                        <tr className="bg-[#fafafa] border-b border-[#ebebeb] text-[9px] uppercase text-[#555555]">
                                          <th className="p-1.5 font-normal">Supplier</th>
                                          <th className="p-1.5 font-normal">Item</th>
                                          <th className="p-1.5 text-right font-normal">Before</th>
                                          <th className="p-1.5 text-right font-normal">After</th>
                                          <th className="p-1.5 text-center font-normal">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {negotiationHistory.map((n: any, idx: number) => {
                                          const before = Number(n.original_total);
                                          const after = Number(n.negotiated_total);
                                          const moved = Number.isFinite(before) && Number.isFinite(after) && before > 0
                                            ? ((after - before) / before) * 100
                                            : null;
                                          // 'Request Negotiation' = round sent, supplier hasn't re-quoted yet.
                                          const awaiting = String(n.status) === "Request Negotiation";
                                          return (
                                            <tr
                                              key={idx}
                                              className="border-b border-[#f5f5f4] last:border-0 hover:bg-[#fafafa] align-top"
                                              title={[n.supplier_code, n.negotiation_comments].filter(Boolean).join(" — ")}
                                              data-testid={`row-previous-negotiation-${idx}`}
                                            >
                                              <td className="p-1.5 text-[#333333]">
                                                <span className="block truncate max-w-[110px]">{n.supplier_name || "N/A"}</span>
                                                <span className="text-[9px] text-[#aaaaaa]">
                                                  {`Round ${n.round}`}
                                                  {n.creation_date ? ` · ${new Date(n.creation_date).toLocaleDateString()}` : ""}
                                                </span>
                                              </td>
                                              {/* item_name is null when the round wasn't scoped to one
                                                  line — then the prices are whole-bid totals. */}
                                              <td className="p-1.5 text-[#333333]">
                                                <span className="block truncate max-w-[100px]">
                                                  {n.item_name || (Number(n.line_count) > 1 ? `All ${n.line_count} items` : "—")}
                                                </span>
                                              </td>
                                              <td className="p-1.5 text-right text-[#555555]">{fmtMoney(n.currency, before)}</td>
                                              <td className="p-1.5 text-right font-medium text-[#1a1a18]">
                                                {fmtMoney(n.currency, after)}
                                                {moved != null && moved !== 0 && (
                                                  <span className={`block text-[9px] ${moved < 0 ? "text-[#43a047]" : "text-[#e53935]"}`}>
                                                    {moved > 0 ? "+" : ""}{moved.toFixed(1)}%
                                                  </span>
                                                )}
                                              </td>
                                              <td className="p-1.5 text-center">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${awaiting
                                                  ? "text-[#b45309] border-[#fde68a] bg-[#fffbeb]"
                                                  : "text-[#43a047] border-[#c8e6c9] bg-[#f1f8f1]"}`}>
                                                  {awaiting ? "Awaiting" : "Revised"}
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Items in this bid — only shown when the bid has more than
                                  one line item (overview.availableBidLines, enriched server-side
                                  with each item's price for the responding supplier). */}
                              {Array.isArray(activeStrategyData?.overview?.availableBidLines) &&
                                activeStrategyData.overview.availableBidLines.length > 1 && (
                                  <div>
                                    <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">
                                      Items in This Bid ({activeStrategyData.overview.availableBidLines.length})
                                    </p>
                                    <div className="rounded-lg border border-[#ebebeb] bg-white divide-y divide-[#f0f0f0]">
                                      {activeStrategyData.overview.availableBidLines.map((line: any, idx: number) => {
                                        const isActive = line.description === activeStrategyData.overview?.item;
                                        const key = String(line.id ?? idx);
                                        const isExpanded = isActive || expandedItemKeys.has(key);
                                        const isFetching = fetchingItemKey === key;
                                        const cached = itemAnalysisCache[key];
                                        return (
                                          <div key={key}>
                                            <button
                                              type="button"
                                              onClick={() => toggleItemExpand(msg, line)}
                                              className={`w-full flex justify-between items-center gap-2 px-3 py-2 text-[11px] text-left hover:bg-[#fafafa] transition-colors ${isActive ? "bg-blue-50" : ""}`}
                                              data-testid={`row-bid-item-${idx}`}
                                            >
                                              <div className="min-w-0 flex items-center gap-1.5">
                                                {isActive ? null : (
                                                  <ChevronRight className={`h-3 w-3 flex-shrink-0 text-[#bbbbbb] transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                                )}
                                                <div className="min-w-0">
                                                  <p className={`truncate ${isActive ? "font-semibold text-blue-900" : "text-[#333333]"}`}>
                                                    {line.description}
                                                    {isActive && <span className="ml-1.5 text-[9px] font-normal text-blue-600">(active)</span>}
                                                  </p>
                                                  <p className="text-[10px] text-[#999999]">
                                                    Qty: {line.quantity} {line.uom || ""}
                                                  </p>
                                                </div>
                                              </div>
                                              <span className="font-medium text-[#1a1a18] flex-shrink-0 flex items-center gap-1.5">
                                                {isFetching && <Loader2 className="h-3 w-3 animate-spin text-[#2d6a8f]" />}
                                                {line.quotePrice != null ? formatWithCurrency(line.quotePrice, currency) : "—"}
                                              </span>
                                            </button>
                                            {!isActive && isExpanded && (
                                              cached ? (
                                                <ItemInsightCard data={cached} />
                                              ) : isFetching ? (
                                                <p className="text-[10px] text-[#999999] px-3 pb-2.5">Analyzing this item…</p>
                                              ) : null
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                              {/* Recharts Price comparison graph */}
                              <div>
                                <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">Price Benchmark Chart</p>
                                <div className="h-[150px] w-full rounded-lg border border-[#ebebeb] bg-white p-1">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={calculatedStrategy.priceChart} margin={{ left: -15, right: 5, top: 10, bottom: 0 }}>
                                      <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#f0f0f0" />
                                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }} tickFormatter={(val) => truncateLabel(val, 8)} />
                                      <YAxis tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }} tickFormatter={formatAxisValue} />
                                      <Tooltip content={<CustomChartTooltip currency={currency} />} contentStyle={{ fontFamily: INTEL_FONT, fontSize: "10px", borderRadius: "6px", border: "1px solid #ebebeb" }} />
                                      <Bar dataKey="price" fill={INTEL_COLOR.navy} radius={[3, 3, 0, 0]}>
                                        {/* Fixed 4-bar order from currentPriceChart: Market, selected
                                            supplier, Target, Walk-Away — colored by position since the
                                            supplier bar's label is now the real supplier name. */}
                                        {["#1a1a18", "#555555", "#888888", "#cccccc"].map((color, index) => (
                                          <Cell key={`cell-${index}`} fill={color} />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              {/* Negotiating-with supplier selector (AI defaults to the lowest quote / L1).
                                  Quotes shown are priced for the active item only (see overview.item badge above). */}
                              {panelSuppliers.length > 0 && (
                                <div>
                                  <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2 flex items-center gap-1.5">
                                    Negotiating With
                                    {activeStrategyData?.overview?.item && (
                                      <span className="normal-case tracking-normal text-[#999999] font-normal">— {activeStrategyData.overview.item}</span>
                                    )}
                                    {refreshingSupplier && <Loader2 className="h-3 w-3 animate-spin text-[#2d6a8f]" />}
                                  </p>
                                  <Select value={selectedSupplierName || undefined} onValueChange={(v) => applySupplierRefresh(v)}>
                                    <SelectTrigger className="h-9 text-xs w-full font-['Google_Sans'] border-[#e5e5e5] bg-[#fafafa]" data-testid="select-panel-supplier">
                                      <SelectValue placeholder="Select supplier" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {panelSuppliers.map((s: any) => (
                                        <SelectItem key={s.supplierId ?? s.supplierName} value={s.supplierName} className="text-xs">
                                          <span className="flex items-center justify-between gap-3 w-full">
                                            <span className="truncate">{s.supplierName}</span>
                                            <span className="text-muted-foreground">{formatWithCurrency(s.quote, currency)}</span>
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {/* Interactive Posture Overrides */}
                              <div>
                                <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">Strategy Posture</p>
                                <div className="flex border border-[#ebebeb] rounded-md overflow-hidden">
                                  {(["Aggressive", "Moderate", "Collaborative"] as const).map((post, i) => (
                                    <button
                                      key={post}
                                      onClick={() => setPostureOverride(post)}
                                      className={`flex-1 text-[10px] uppercase tracking-[0.06em] py-2 border-none cursor-pointer transition-colors ${i < 2 ? "border-r border-[#ebebeb]" : ""} ${
                                        calculatedStrategy.posture === post
                                          ? post === "Aggressive"
                                            ? "bg-[#1a1a18] text-white"
                                            : post === "Moderate"
                                              ? "bg-[#2d4a6b] text-white"
                                              : "bg-[#2d6b4a] text-white"
                                          : "bg-white text-[#555555]"
                                      }`}
                                    >
                                      {post}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Target & walk away pricing thresholds */}
                              <div className="grid grid-cols-2 gap-2.5">
                                <div className="bg-[#fafafa] border border-[#ebebeb] rounded-md p-3.5">
                                  <p className="text-[9px] uppercase text-[#555555] tracking-[0.08em] mb-1.5">Target Price ({calculatedStrategy.targetPercent}% Cut)</p>
                                  <p className="text-lg font-medium text-[#1a1a18]">{calculatedStrategy.targetPrice}</p>
                                </div>
                                <div className="bg-[#fff4e5] border border-[#ffe0b2] rounded-md p-3.5">
                                  <p className="text-[9px] uppercase text-[#e65100] tracking-[0.08em] mb-1.5">Walk-Away Threshold</p>
                                  <p className="text-lg font-medium text-[#e65100]">{calculatedStrategy.walkAwayThreshold}</p>
                                </div>
                              </div>

                              {/* Concession/Ask Items list */}
                              <div>
                                <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">Recommended Demands</p>
                                <div className="space-y-1.5">
                                  {calculatedStrategy.askFor.map((item, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                      <Check className="h-3.5 w-3.5 text-[#43a047] mt-0.5 flex-shrink-0" />
                                      <span className="text-[11px] leading-[1.6] text-[#444444]">{item}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Negotiation Strength Factor Scoring */}
                              <div>
                                <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">Leverage Score Matrix</p>
                                <div className="flex flex-col">
                                  {[
                                    { label: "Historical Discounts", val: activeStrategyData.strength?.historicalDiscounts || "Medium" },
                                    { label: "Market Conditions", val: activeStrategyData.strength?.marketConditions || "High" },
                                    { label: "Supplier Dependency", val: activeStrategyData.strength?.supplierDependency || "Low" }
                                  ].map((sRow, idx) => {
                                    const dotColor = sRow.val === "High" || (sRow.val === "Low" && sRow.label.includes("Dependency"))
                                      ? INTEL_COLOR.blue
                                      : sRow.val === "Medium"
                                        ? INTEL_COLOR.amber
                                        : INTEL_COLOR.red;
                                    return (
                                      <div key={idx} className="flex justify-between items-center py-2 border-b border-[#f5f5f4]">
                                        <span className="text-[11px] text-[#555555]">{sRow.label}</span>
                                        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: dotColor }}>
                                          <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: dotColor }} />
                                          {sRow.val}
                                        </span>
                                      </div>
                                    );
                                  })}
                                  <div className="pt-2 flex justify-between items-center text-[11px] font-medium">
                                    <span className="text-[#1a1a18]">Overall Leverage:</span>
                                    <Badge className={overallBadgeColor}>{rawOverallStr}</Badge>
                                  </div>
                                </div>
                              </div>

                              {/* BATNA Details */}
                              <div>
                                <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">BATNA Summary</p>
                                <div className="flex flex-col">
                                  {(() => {
                                    const bestAltLabel = activeStrategyData.batna?.bestAlternative || "N/A";
                                    const bestAltSupplier = activeStrategyData.batna?.alternatives?.[0]?.supplierName;
                                    const canSwitch = !!bestAltSupplier &&
                                      !String(bestAltLabel).toLowerCase().startsWith("no switch needed") &&
                                      bestAltSupplier !== selectedSupplierName;
                                    return (
                                      <div className="flex justify-between items-center py-2 border-b border-[#f5f5f4]">
                                        <span className="text-[11px] text-[#555555]">Best Alternative</span>
                                        <span className="flex items-center gap-2">
                                          <span className="text-[11px] font-medium text-[#43a047]">{bestAltLabel}</span>
                                          {canSwitch && (
                                            <button
                                              onClick={() => applySupplierRefresh(bestAltSupplier)}
                                              className="flex items-center gap-1 text-[9px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border border-[#43a047] text-[#43a047] hover:bg-[#f1f8f1] transition-colors"
                                              data-testid="button-batna-switch"
                                            >
                                              <ArrowLeftRight className="h-2.5 w-2.5" />
                                              Switch
                                            </button>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })()}

                                  {activeStrategyData.batna?.alternatives && activeStrategyData.batna.alternatives.length > 0 ? (
                                    <div className="overflow-hidden border border-[#ebebeb] rounded-md mt-2">
                                      <table className="w-full border-collapse text-left text-[11px]">
                                        <thead>
                                          <tr className="bg-[#fafafa] border-b border-[#ebebeb] text-[9px] uppercase text-[#555555]">
                                            <th className="p-1.5 font-normal">Supplier</th>
                                            <th className="p-1.5 text-right font-normal">Quote</th>
                                            <th className="p-1.5 text-right font-normal">Savings / Premium</th>
                                            <th className="p-1.5 text-center font-normal">Risk</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {activeStrategyData.batna.alternatives.map((alt: any, idx: number) => {
                                            const quoteVal = parseFloat(String(alt.quote || "0").replace(/[^0-9.]/g, ""));
                                            const savingsVal = parseFloat(String(alt.savingsOrPremium || "0").replace(/[^0-9.-]/g, ""));
                                            const isSavings = savingsVal > 0;
                                            const isPremium = savingsVal < 0;

                                            return (
                                              <tr key={idx} className="border-b border-[#f5f5f4] last:border-0 hover:bg-[#fafafa]">
                                                <td className="p-1.5 text-[#333333] truncate max-w-[90px]">{alt.supplierName || "N/A"}</td>
                                                <td className="p-1.5 text-right font-medium text-[#1a1a18]">
                                                  {formatWithCurrency(quoteVal, currency)}
                                                </td>
                                                <td className={`p-1.5 text-right font-medium ${isSavings ? "text-[#43a047]" : isPremium ? "text-[#e53935]" : "text-[#555555]"}`}>
                                                  {savingsVal === 0 ? "—" : `${isSavings ? "+" : ""}${formatWithCurrency(savingsVal, currency)}`}
                                                </td>
                                                <td className="p-1.5 text-center">
                                                  <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                                                    String(alt.switchingRisk || "").toUpperCase() === "LOW"
                                                      ? "text-[#43a047] bg-[#f1f8f1]"
                                                      : String(alt.switchingRisk || "").toUpperCase() === "MEDIUM"
                                                        ? "text-[#b45309] bg-[#fffbeb]"
                                                        : "text-[#e53935] bg-[#fef2f2]"
                                                  }`}>
                                                    {alt.switchingRisk || "Low"}
                                                  </span>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex justify-between items-center py-2 border-b border-[#f5f5f4] text-[11px]">
                                        <span className="text-[#555555]">Expected Price</span>
                                        <span className="font-medium text-[#1a1a18]">
                                          {formatWithCurrency(activeStrategyData.batna?.expectedPrice || 0, currency)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center py-2 border-b border-[#f5f5f4] text-[11px]">
                                        <span className="text-[#555555]">Expected Savings</span>
                                        <span className="font-medium text-[#43a047]">
                                          {formatWithCurrency(activeStrategyData.batna?.expectedSavings || 0, currency)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center py-2 text-[11px]">
                                        <span className="text-[#555555]">Switching Risk</span>
                                        <span className={`font-medium ${String(activeStrategyData.batna?.switchingRisk || "").toUpperCase() === "LOW" ? "text-[#43a047]" : "text-[#b45309]"}`}>
                                          {activeStrategyData.batna?.switchingRisk || "Low"}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* ─── Price Trend — Current vs Market ───
                                  Real data: applyRealSpendTrend() (negotiation-agent-service.ts)
                                  blends real monthly PO price history with a market series into
                                  data.charts.spendTrend — replaces the old synthetic chart. */}
                              <SpendTrendChart
                                spendTrend={activeStrategyData.charts?.spendTrend}
                                hasPurchaseHistory={activeStrategyData.charts?.hasPurchaseHistory}
                                currencySymbol={currency.symbol.trim()}
                                title="Marketing negotiation agent Comparison"
                                xAxisMode="category"
                              />

                              {/* ─── B. Supplier Negotiation Scorecard ───
                                  Net-new: Price Competitiveness is derived from the real
                                  quote-vs-benchmark premium; the other two metrics fall back to
                                  mock constants when supplierScorecard data is absent (no live
                                  delivery performance feed exists yet). Quality History removed
                                  (2026-07-19) — was a hardcoded 91 with no backing data. */}
                              {(() => {
                                const q = calculatedStrategy.quoteValue;
                                const bm = calculatedStrategy.benchmarkValue;
                                if (!(q > 0)) return null;
                                const premiumPct = bm > 0 ? Math.round(((q - bm) / bm) * 100) : 0;
                                const scorecard = [
                                  { label: "Price Competitiveness", score: activeStrategyData.supplierScorecard?.priceCompetitivenessScore ?? Math.max(30, 100 - Math.round(premiumPct * 2)), color: INTEL_COLOR.navy, note: `${premiumPct}% above fair market` },
                                  { label: "Delivery Performance", score: activeStrategyData.supplierScorecard?.deliveryPerformanceScore ?? 88, color: INTEL_COLOR.steel, note: "On-time delivery last 6 deliveries" },
                                  { label: "Previous Negotiation Outcome", score: activeStrategyData.supplierScorecard?.previousNegotiationOutcomePct ?? 65, color: INTEL_COLOR.skyPale, note: "Avg 8% discount achieved historically" },
                                ];
                                const overallScore = Math.round(scorecard.reduce((a, s) => a + s.score, 0) / scorecard.length);
                                const supplierLabel = selectedSupplierName || activeStrategyData.summary?.supplier;
                                return (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em]">B. Supplier Negotiation Scorecard</p>
                                      <span className="text-[9px] px-2 py-1 rounded bg-[#f0f4fa] text-[#2d6a8f] border border-[#b8d4e3] truncate max-w-[140px]">
                                        {supplierLabel || "Supplier"}
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                      {scorecard.map((s, i) => (
                                        <div key={i}>
                                          <div className="flex justify-between mb-1.5">
                                            <span className="text-[11px] text-[#444444]">{s.label}</span>
                                            <span className="text-[9px] text-[#aaaaaa]">{s.note}</span>
                                          </div>
                                          <div className="flex items-center gap-2.5">
                                            <div className="flex-1 h-1.5 bg-[#f0f0ee] rounded-full overflow-hidden">
                                              <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: s.color }} />
                                            </div>
                                            <span className="text-[11px] font-medium text-[#1a1a18] min-w-[28px] text-right">{s.score}%</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                      {[
                                        { label: "Overall Score", value: `${overallScore}/100` },
                                        { label: "Preferred Status", value: "Preferred" },
                                        { label: "Contracts Active", value: String(activeStrategyData.activeContractsCount ?? 2) },
                                        { label: "Avg Discount Won", value: activeStrategyData.avgDiscountWonPct != null ? `${activeStrategyData.avgDiscountWonPct}%` : "8%" },
                                      ].map((m, i) => (
                                        <div key={i} className={`rounded-md p-2 border ${i === 0 ? "bg-[#1a1a18] border-[#1a1a18]" : "bg-[#fafafa] border-[#ebebeb]"}`}>
                                          <div className={`text-[9px] uppercase tracking-[0.06em] mb-0.5 ${i === 0 ? "text-white/40" : "text-[#555555]"}`}>{m.label}</div>
                                          <div className={`text-[13px] font-medium ${i === 0 ? "text-white" : "text-[#1a1a18]"}`}>{m.value}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* ─── C. Savings Calculation ───
                                  Net-new: "vs previous purchase" uses the reference's mock
                                  prior-PO multiplier (1.07× the current quote — no purchase-
                                  history API for this bid exists yet); "vs current quote" is
                                  entirely real (quoteValue / targetValue). */}
                              {(() => {
                                const q = calculatedStrategy.quoteValue;
                                const t = calculatedStrategy.targetValue;
                                if (!(q > 0)) return null;
                                const qty = activeStrategyData.overview?.annualQuantity || activeStrategyData.overview?.quantity || 0;
                                const prevPOPrice = activeStrategyData.previousPurchasePrice;
                                const hasPrevPO = prevPOPrice != null;
                                const savingsVsQuote = { amount: +(q - t).toFixed(2), pct: q > 0 ? +(((q - t) / q) * 100).toFixed(1) : 0 };
                                const cols = [
                                  ...(hasPrevPO ? [{
                                    header: "1. Savings vs Previous Purchase", formula: "Formula: Previous PO − Negotiated Price", bg: INTEL_COLOR.navy,
                                    rowLabel: "Previous Purchase Price", rowValue: formatWithCurrency(prevPOPrice, currency),
                                    savings: { amount: +(prevPOPrice - t).toFixed(2), pct: prevPOPrice > 0 ? +(((prevPOPrice - t) / prevPOPrice) * 100).toFixed(1) : 0 },
                                  }] : []),
                                  {
                                    header: hasPrevPO ? "2. Savings vs Current Supplier Quote" : "Savings vs Current Supplier Quote", formula: "Formula: Supplier Quote − Negotiated Price", bg: INTEL_COLOR.steel,
                                    rowLabel: "Current Supplier Quote", rowValue: formatWithCurrency(q, currency),
                                    savings: savingsVsQuote,
                                  },
                                ];
                                return (
                                  <div>
                                    <p className="text-[9px] uppercase text-[#555555] tracking-[0.1em] mb-2">C. Savings Calculation</p>
                                    <div className="grid grid-cols-1 gap-3">
                                      {cols.map((c, i) => (
                                        <div key={i} className="border border-[#ebebeb] rounded-md overflow-hidden">
                                          <div className="px-3.5 py-2.5" style={{ background: c.bg }}>
                                            <div className="text-[10px] uppercase tracking-[0.08em] text-white/60 mb-0.5">{c.header}</div>
                                            <div className="text-[9px] text-white/40">{c.formula}</div>
                                          </div>
                                          <div className="p-3.5 flex flex-col gap-2">
                                            <div className="flex justify-between text-[11px]">
                                              <span className="text-[#555555]">{c.rowLabel}</span>
                                              <span className="text-[#555555]">{c.rowValue}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]">
                                              <span className="text-[#555555]">Negotiated Target Price</span>
                                              <span className="text-[#555555]">{formatWithCurrency(t, currency)}</span>
                                            </div>
                                            <div className="border-t border-[#ebebeb] pt-2 flex flex-col gap-1.5">
                                              <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-medium text-[#333333]">Savings Amount</span>
                                                <span className="text-sm font-semibold" style={{ color: c.bg }}>{formatWithCurrency(c.savings.amount, currency)}</span>
                                              </div>
                                              <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-medium text-[#333333]">Savings %</span>
                                                <span className="text-sm font-semibold" style={{ color: c.bg }}>{c.savings.pct}%</span>
                                              </div>
                                              {qty > 0 && (
                                                <div className="bg-[#f0f4fa] rounded-md px-2.5 py-2 flex justify-between items-center mt-0.5">
                                                  <span className="text-[10px] text-[#555555]">Annual Savings ({Number(qty).toLocaleString()} units)</span>
                                                  <span className="text-[13px] font-semibold text-[#1e3a5f]">{formatWithCurrency(Math.round(c.savings.amount * qty), currency)}</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Real Market Grounding: Fair Market Price / Local Suppliers / Cost Waterfall / Spend Trend.
                                  Populated server-side (negotiation-agent-service.ts) from live scraped-supplier and
                                  Govt. of India mandi data — only present when that grounding pipeline ran. costStructure
                                  is always the LLM's own real breakdown for this item/supplier (a server-side repair pass
                                  re-asks the model when it's missing or incomplete); no client-side fabricated values here. */}
                              {activeStrategyData.costStructure?.length > 0 && (
                                <CostWaterfallChart
                                  costStructure={activeStrategyData.costStructure}
                                  currencySymbol={currency.symbol.trim()}
                                />
                              )}

                              {activeStrategyData.fairMarketPrice && (
                                <FairMarketPricePanel
                                  fairMarketPrice={activeStrategyData.fairMarketPrice}
                                  quotePrice={parseFloat(String(activeStrategyData.overview?.quotePrice ?? activeStrategyData.summary?.currentQuote ?? 0).replace(/[^0-9.]/g, "")) || 0}
                                  currencySymbol={currency.symbol.trim()}
                                />
                              )}

                              {/* AI Reasoning Narrative */}
                              {(() => {
                                const text = extractReasoningText(activeStrategyData.strategy?.reasoning);
                                if (!text) return null;
                                const confidence = activeStrategyData.strategy?.confidence || "High";
                                const dotColor = confidence === "High" ? INTEL_COLOR.blue : confidence === "Low" ? INTEL_COLOR.red : INTEL_COLOR.amber;
                                return (
                                  <AiInsightPanel
                                    label="AI Reasoning & Strategy Insights"
                                    text={text}
                                    accentBorder
                                    footer={{
                                      confidenceLabel: `Confidence: ${confidence}`,
                                      dotColor,
                                      savingsText: `Est. Savings: ${calculatedStrategy.expectedSavingsValue}`,
                                    }}
                                  />
                                );
                              })()}

                              <LocalSuppliersPanel
                                localSuppliers={activeStrategyData.localSuppliers}
                                localSuppliersNear={activeStrategyData.localSuppliersNear || activeStrategyData.overview?.country || "Delivery Location"}
                              />
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            <div className="relative w-full flex-shrink-0" ref={mention.composerRef}>
            <ChatComposer
              isCompact
              singleRow
              placeholder={`Ask Prokraya Ai ${AGENT_MENTION_PLACEHOLDER_HINT}`}
              {...mention.composerProps}
              ref={mention.inputRef}
              onSubmit={handleSubmit}
              onStop={stopStreaming}
              isStreaming={isStreaming}
              colorTheme="blue"
              submitButtonClassName="rounded-full h-9 w-9"
              textareaDataTestId="input-negotiation-prompt"
              submitDataTestId="button-negotiation-submit"
              onMicTranscript={(t) => mention.setPromptText((mention.composerProps.value ? mention.composerProps.value + " " + t : t))}
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
                      data-testid="button-negotiation-form"
                    >
                      <Handshake className="h-4 w-4" />
                      Negotiation Form
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
            {mention.dropdown}
            </div>
          </CardContent>
        </Card>

        {/* Explore Capabilities Panel */}
        {showCapabilities && (
          <Card className="w-[275px] flex-shrink-0 flex flex-col min-h-0 max-h-full hidden md:flex">
            <CardContent className="flex-1 p-0 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3 border-b flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold text-sm">Explore Capabilities</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowCapabilities(false)} data-testid="button-close-capabilities">
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
              <div className="px-3 py-2 border-b flex-shrink-0">
                <p className="text-xs text-muted-foreground">Select a recommended query below to start</p>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1.5 custom-scrollbar min-h-0">
                {negotiationAgentPrompts.map((category) => (
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
                            onClick={() => { mention.setPromptText(p); }}
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
