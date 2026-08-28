import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  DollarSign,
  FileCheck,
  FileText,
  Gavel,
  GitPullRequest,
  IndianRupee,
  Lightbulb,
  Loader2,
  Package,
  PieChart as PieChartIcon,
  Receipt,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShoppingCart,
  Sparkles, Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck, UserPlus,
  Users,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area, AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis
} from "recharts";

const CHART_COLORS = [
  "hsl(262, 60%, 35%)",
  "hsl(217, 91%, 35%)",
  "hsl(188, 78%, 32%)",
  "hsl(280, 65%, 35%)",
  "hsl(25, 90%, 38%)",
  "hsl(340, 82%, 38%)",
  "hsl(150, 60%, 35%)",
  "hsl(45, 85%, 40%)",
  "hsl(200, 70%, 40%)",
  "hsl(320, 60%, 40%)",
];

function formatCurrency(value: number, curr: string = "USD"): string {
  if (value >= 1_000_000) return `${curr} ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${curr} ${(value / 1_000).toFixed(2)}K`;
  return `${curr} ${value.toFixed(0)}`;
}

function formatAxisCurrency(value: number, curr: string = "USD"): string {
  if (value >= 1_000_000) return `${curr} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${curr} ${(value / 1_000).toFixed(0)}k`;
  return `${curr} ${value.toFixed(0)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(percent: number): string {
  const p = percent * 100;
  if (p > 0 && p < 0.1) return "< 0.1%";
  return `${p.toFixed(1)}%`;
}

function truncate(str: string, len: number): string {
  if (!str) return "";
  return str.length > len ? str.substring(0, len) + "..." : str;
}

function makeChartTooltip(curr: string) {
  return ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
        <p className="font-semibold mb-1.5">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span>{p.name}:</span>
            <span className="font-medium text-foreground ml-auto">
              {typeof p.value === "number" && p.name !== "PO Count" ? formatCurrency(p.value, curr) : formatNumber(p.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };
}

function makePieTooltip(curr: string, isCurrencyChart?: boolean) {
  return ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const displayCurr = isCurrencyChart ? d.name : curr;
    return (
      <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
        <p className="font-semibold">{d.name}</p>
        <p className="text-muted-foreground">{formatCurrency(d.value, displayCurr)}</p>
      </div>
    );
  };
}

function StatCard({ title, value, icon: Icon, bgColor, textColor, loading }: {
  title: string; value: string; icon: any; bgColor: string; textColor: string; loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="hover-elevate">
        <CardContent className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-3.5 w-16 mb-1" />
            <Skeleton className="h-6 w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="hover-elevate" data-testid={`stat-card-${title.toLowerCase().replace(/['\s]+/g, "-")}`}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bgColor} ${textColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-xl font-bold" data-testid={`text-${title.toLowerCase().replace(/['\s]+/g, "-")}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetSummaryCard({ label, value, percentage, variant }: {
  label: string; value: string; percentage: string; variant: "default" | "success";
}) {
  return (
    <Card className={`hover-elevate ${variant === "success" ? "border-emerald-200 dark:border-emerald-800" : ""}`}
      data-testid={`budget-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-3 text-center space-y-0.5">
        <Badge variant="secondary" className={`text-[10px] font-medium ${variant === "success" ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"
          }`}>
          {percentage}
        </Badge>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${variant === "success" ? "text-emerald-600" : "text-primary"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export default function SpendAnalysis() {
  const { toast } = useToast();
  const { isAIEnabled } = useAISettings();
  const [year, setYear] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");
  const [baseCurrency, setBaseCurrency] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("spend");
  const [consumedType, setConsumedType] = useState<string>("total");
  const [hiddenDepartments, setHiddenDepartments] = useState<Record<string, boolean>>({});
  const [hiddenBudgets, setHiddenBudgets] = useState<Record<string, boolean>>({});
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const [hiddenBidStatus, setHiddenBidStatus] = useState<Record<string, boolean>>({});
  const [hiddenPoVsNonPo, setHiddenPoVsNonPo] = useState<Record<string, boolean>>({});
  const [hiddenSpendByCurrency, setHiddenSpendByCurrency] = useState<Record<string, boolean>>({});
  const [hiddenContractVsSpot, setHiddenContractVsSpot] = useState<Record<string, boolean>>({});

  const toggleDepartment = (name: string) => {
    setHiddenDepartments((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleBudget = (name: string) => {
    setHiddenBudgets((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleSeries = (name: string) => {
    setHiddenSeries((prev) => ({ ...prev, [name]: !prev[name] }));
  };


  function buildParams(extra?: Record<string, string>) {
    const params = new URLSearchParams();
    if (year !== "all") params.set("year", year);
    if (entity !== "all") params.set("orgId", entity);
    if (baseCurrency) params.set("baseCurrency", baseCurrency);
    if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    const str = params.toString();
    return str ? `?${str}` : "";
  }

  const lastSpendErrorRef = useRef("");

  const fetchSpendApi = useCallback(async (path: string) => {
    const res = await apiRequest("GET", path);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error || "Failed to load spend analysis data";
      if (lastSpendErrorRef.current !== message) {
        lastSpendErrorRef.current = message;
        toast({
          title: "Currency conversion unavailable",
          description: message,
          variant: "destructive",
        });
        window.setTimeout(() => {
          lastSpendErrorRef.current = "";
        }, 4000);
      }
      throw new Error(message);
    }
    return data;
  }, [toast]);

  const { data: orgDetails } = useQuery<{ currency?: string }>({
    queryKey: ["/api/org-details"],
  });

  const { data: baseCurrencyLookups = [] } = useQuery<
    Array<{ id: number; lookup_key: string; lookup_value: string; description?: string }>
  >({
    queryKey: ["/api/lookups/by-property/BASE_CURRENCY"],
  });

  useEffect(() => {
    if (baseCurrency || !baseCurrencyLookups.length) return;
    const orgCur = (orgDetails?.currency || "").trim().toUpperCase();
    const match = baseCurrencyLookups.find(
      (row) => row.lookup_key.trim().toUpperCase() === orgCur
    );
    setBaseCurrency(match?.lookup_key.trim() || baseCurrencyLookups[0].lookup_key.trim());
  }, [baseCurrency, baseCurrencyLookups, orgDetails?.currency]);

  const curr = baseCurrency || orgDetails?.currency || "USD";


  const { data: yearLookup } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/SPEND_YEARS"],
  });

  const yearOptions = useMemo(() => {
    if (yearLookup?.[0]?.lookup_value) {
      return yearLookup[0].lookup_value
        .split(",")
        .map((y: string) => y.trim())
        .filter((y: string) => y !== "");
    }
    return [new Date().getFullYear().toString()];
  }, [yearLookup]);

  useEffect(() => {
    if (yearLookup?.[0]?.lookup_value && !yearOptions.includes(year) && year !== "all") {
      setYear(yearOptions[0]);
    }
  }, [yearOptions, year, yearLookup]);

  const { data: businessEntities } = useQuery<{ id: number; name: string; type: string; currency?: string }[]>({
    queryKey: ["/api/spend-analysis/business-entities"],
  });

  const spendQueryOpts = { enabled: !!baseCurrency };

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/spend-analysis/summary", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/summary${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: budgetSummary, isLoading: budgetLoading } = useQuery({
    queryKey: ["/api/spend-analysis/budget-summary", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/budget-summary${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: consumedAmount } = useQuery({
    queryKey: ["/api/spend-analysis/consumed-amount", consumedType, year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/consumed-amount${buildParams({ type: consumedType })}`),
    ...spendQueryOpts,
  });

  const { data: budgetVsSpend } = useQuery({
    queryKey: ["/api/spend-analysis/budget-vs-spend", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/budget-vs-spend${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: spendByDepartment } = useQuery({
    queryKey: ["/api/spend-analysis/spend-by-department", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/spend-by-department${buildParams()}`),
    ...spendQueryOpts,
  });


  const { data: spendTrend } = useQuery({
    queryKey: ["/api/spend-analysis/spend-trend", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/spend-trend${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: spendByCategory } = useQuery({
    queryKey: ["/api/spend-analysis/spend-by-category", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/spend-by-category${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: spendBySupplier } = useQuery({
    queryKey: ["/api/spend-analysis/spend-by-supplier", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/spend-by-supplier${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: poVsNonPo } = useQuery({
    queryKey: ["/api/spend-analysis/po-vs-nonpo-spend", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/po-vs-nonpo-spend${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: spendByCurrency } = useQuery({
    queryKey: ["/api/spend-analysis/spend-by-currency", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/spend-by-currency${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: savingsAnalysis } = useQuery({
    queryKey: ["/api/spend-analysis/savings-analysis", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/savings-analysis${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: contractVsSpot } = useQuery({
    queryKey: ["/api/spend-analysis/contract-vs-spot", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/contract-vs-spot${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: maverickSpend } = useQuery({
    queryKey: ["/api/spend-analysis/maverick-spend", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/maverick-spend${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: bidSavingsSummary } = useQuery({
    queryKey: ["/api/spend-analysis/bid-savings-summary", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/bid-savings-summary${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: bidSavingsByType } = useQuery({
    queryKey: ["/api/spend-analysis/bid-savings-by-type", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/bid-savings-by-type${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: competitiveSavings } = useQuery({
    queryKey: ["/api/spend-analysis/competitive-savings", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/competitive-savings${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: bidStatusDist } = useQuery({
    queryKey: ["/api/spend-analysis/bid-status-distribution", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/bid-status-distribution${buildParams()}`),
    ...spendQueryOpts,
  });

  const { data: topSavingsBids } = useQuery({
    queryKey: ["/api/spend-analysis/top-savings-bids", year, entity, baseCurrency],
    queryFn: () => fetchSpendApi(`/api/spend-analysis/top-savings-bids${buildParams()}`),
    ...spendQueryOpts,
  });


  const { data: contractPortfolio, isLoading: contractPortfolioLoading } = useQuery({
    queryKey: ["/api/spend-analysis/contract-portfolio"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/spend-analysis/contract-portfolio");
      return res.json();
    },
  });

  const filteredSpendByDepartment = spendByDepartment?.filter((d: any) => !hiddenDepartments[d.name]);
  const filteredBudgetVsSpend = budgetVsSpend?.filter((d: any) => !hiddenBudgets[d.name]);
  const filteredBidStatusDist = bidStatusDist?.filter((d: any) => !hiddenBidStatus[d.name]);
  const bidPipelineTotal = bidStatusDist?.reduce((s: number, d: any) => s + (d.count || 0), 0) ?? 0;
  const filteredPoVsNonPo = poVsNonPo?.filter((d: any) => !hiddenPoVsNonPo[d.name]);
  const filteredSpendByCurrency = spendByCurrency?.filter((d: any) => !hiddenSpendByCurrency[d.name]);
  const filteredContractVsSpot = contractVsSpot?.filter((d: any) => !hiddenContractVsSpot[d.name]);

  const consumedTypeLabels: Record<string, string> = {
    total: "Total Consumed Amount",
    po: "PO Based Consumed Amount",
    "non-po": "NON-PO Based Consumed Amount",
  };

  const kpis = [
    { title: "Total Spend", value: formatCurrency(summary?.totalSpend || 0, curr), icon: IndianRupee, bgColor: "bg-primary/10", textColor: "text-primary" },
    { title: "Invoiced Suppliers", value: formatNumber(summary?.totalSuppliers || 0), icon: Building2, bgColor: "bg-blue-500/10", textColor: "text-blue-600" },
    { title: "Total PR's", value: formatNumber(summary?.totalPRs || 0), icon: FileText, bgColor: "bg-amber-500/10", textColor: "text-amber-600" },
    { title: "Total PO's", value: formatNumber(summary?.totalPOs || 0), icon: ShoppingCart, bgColor: "bg-emerald-500/10", textColor: "text-emerald-600" },
    { title: "Total Invoices", value: formatNumber(summary?.totalInvoices || 0), icon: Receipt, bgColor: "bg-purple-500/10", textColor: "text-purple-600" },
    { title: "Total Users", value: formatNumber(summary?.totalUsers || 0), icon: Users, bgColor: "bg-cyan-500/10", textColor: "text-cyan-600" },
    { title: "Company Users", value: formatNumber(summary?.companyUsers || 0), icon: UserCheck, bgColor: "bg-indigo-500/10", textColor: "text-indigo-600" },
    { title: "Supplier Users", value: formatNumber(summary?.supplierUsers || 0), icon: UserPlus, bgColor: "bg-rose-500/10", textColor: "text-rose-600" },
  ];

  return (
    <div className="p-3 space-y-2.5 [&_.shadcn-card]:rounded-lg" data-testid="spend-analysis-page">

      <div className="space-y-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">
              Procurement Performance Analysis
            </h1>
            <p className="text-sm text-muted-foreground">
              Analysis of various procurement functions w.r.t industry standards
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 border-b mt-1">
          <button
            onClick={() => setActiveTab("spend")}
            className={`px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "spend"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            data-testid="tab-spend-analysis"
          >
            Spend Analysis
          </button>
          <button
            onClick={() => setActiveTab("operational")}
            className={`px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "operational"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            data-testid="tab-operational-analysis"
          >
            Operational Analysis
          </button>
          <button
            onClick={() => setActiveTab("strategic")}
            className={`px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "strategic"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            data-testid="tab-strategic-insights"
          >
            Strategic Insights
          </button>
          {isAIEnabled('AI_SPEND_INSIGHTS') && (
            <button
              onClick={() => setActiveTab("ai-insights")}
              className={`px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === "ai-insights"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              data-testid="tab-ai-insights"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Insights
            </button>
          )}
        </div>
      </div>

      {activeTab === "spend" && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Select value={entity} onValueChange={setEntity} data-testid="select-business-entity">
              <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-business-entity-trigger">
                <SelectValue placeholder="Business Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-entity-all">All Entities</SelectItem>
                {businessEntities?.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id.toString()} data-testid={`select-entity-${entity.id}`}>
                    {entity.name} {entity.type === "MAIN" ? "(Main)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear} data-testid="select-year">
              <SelectTrigger className="w-[110px] h-8 text-sm" data-testid="select-year-trigger">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-year-all">All Years</SelectItem>
                {yearOptions.map((y: any) => (
                  <SelectItem key={y} value={y.toString()} data-testid={`select-year-${y}`}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={baseCurrency || undefined}
              onValueChange={setBaseCurrency}
              data-testid="select-base-currency"
            >
              <SelectTrigger className="w-[150px] h-8 text-sm" data-testid="select-base-currency-trigger">
                <SelectValue placeholder="Base currency" />
              </SelectTrigger>
              <SelectContent>
                {baseCurrencyLookups.map((row) => (
                  <SelectItem
                    key={row.id}
                    value={row.lookup_key.trim()}
                    data-testid={`select-base-currency-${row.lookup_key}`}
                  >
                    {row.description?.trim() &&
                      row.description.trim().toUpperCase() !== row.lookup_key.trim().toUpperCase()
                      ? `${row.description.trim()} (${row.lookup_key})`
                      : row.lookup_key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {kpis.map((kpi) => (
              <StatCard key={kpi.title} {...kpi} loading={summaryLoading} />
            ))}
          </div>

          <SectionHeader title="Bid & Sourcing Savings" />

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-12 lg:col-span-8">
              <Card className="h-full" data-testid="card-bid-savings-overview">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-primary" />
                    Sourcing Savings Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {bidSavingsSummary?.totalBids > 0 ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-5 gap-2">
                        <div className="text-center p-2.5 bg-muted/30 rounded-md">
                          <p className="text-xs text-muted-foreground">Total Bids</p>
                          <p className="text-lg font-bold">{bidSavingsSummary.totalBids}</p>
                        </div>
                        <div className="text-center p-2.5 bg-emerald-500/5 rounded-md border border-emerald-200 dark:border-emerald-800">
                          <p className="text-xs text-muted-foreground">Awarded</p>
                          <p className="text-lg font-bold text-emerald-600">{bidSavingsSummary.awardedBids}</p>
                        </div>
                        <div className="text-center p-2.5 bg-blue-500/5 rounded-md border border-blue-200 dark:border-blue-800">
                          <p className="text-xs text-muted-foreground">In Progress</p>
                          <p className="text-lg font-bold text-blue-600">{bidSavingsSummary.inProgressBids}</p>
                        </div>
                        <div className="text-center p-2.5 bg-muted/30 rounded-md">
                          <p className="text-xs text-muted-foreground">Estimated</p>
                          <p className="text-sm font-bold">{formatCurrency(bidSavingsSummary.totalEstimated, curr)}</p>
                        </div>
                        <div className="text-center p-2.5 bg-muted/30 rounded-md">
                          <p className="text-xs text-muted-foreground">Awarded</p>
                          <p className="text-sm font-bold">{formatCurrency(bidSavingsSummary.totalAwarded, curr)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 p-2.5 rounded-md border-2" style={{
                        borderColor: bidSavingsSummary.savings > 0 ? "hsl(142,71%,45%)" : "hsl(38,92%,50%)",
                        backgroundColor: bidSavingsSummary.savings > 0 ? "hsla(142,71%,45%,0.05)" : "hsla(38,92%,50%,0.05)",
                      }}>
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">Negotiation Savings (Estimated vs Awarded)</p>
                          <p className="text-xl font-bold" style={{ color: bidSavingsSummary.savings > 0 ? "hsl(142,71%,45%)" : "hsl(38,92%,50%)" }}>
                            {formatCurrency(Math.abs(bidSavingsSummary.savings), curr)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs px-2 py-0.5">
                          {bidSavingsSummary.savings >= 0 ? "▼" : "▲"} {Math.abs(bidSavingsSummary.savingsPercent)}%
                        </Badge>
                      </div>

                      {bidSavingsByType?.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Savings by Bid Type</p>
                          {bidSavingsByType.map((t: any) => (
                            <div key={t.type} className="flex items-center justify-between text-xs p-2 bg-muted/20 rounded">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px] px-1.5">{t.type}</Badge>
                                <span className="text-muted-foreground">{t.awardedCount}/{t.bidCount} awarded</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-muted-foreground">{formatCurrency(t.estimated, curr)} → {formatCurrency(t.awarded, curr)}</span>
                                <span className={`font-bold ${t.savings >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {t.savings >= 0 ? "▼" : "▲"} {Math.abs(t.savingsPercent)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-xs flex-col gap-2">
                      <Gavel className="h-8 w-8 text-muted-foreground/30" />
                      <p>No bid/sourcing data available</p>
                      <p className="text-[9px]">Create RFQs or Tenders to see savings analytics</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 lg:col-span-4">
              <Card className="h-full" data-testid="card-competitive-savings">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-blue-600" />
                    Competitive Bidding Impact
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {competitiveSavings?.competitiveBids > 0 ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-center p-2.5 bg-muted/30 rounded-md">
                          <p className="text-xs text-muted-foreground">Competitive Bids</p>
                          <p className="text-lg font-bold">{competitiveSavings.competitiveBids}</p>
                        </div>
                        <div className="text-center p-2.5 bg-muted/30 rounded-md">
                          <p className="text-xs text-muted-foreground">Avg Responses</p>
                          <p className="text-lg font-bold">{competitiveSavings.avgResponses}</p>
                        </div>
                      </div>
                      <div className="text-center p-2.5 bg-blue-500/5 rounded-md border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-muted-foreground mb-0.5">Competitive Savings</p>
                        <p className="text-xl font-bold text-blue-600">
                          {formatCurrency(competitiveSavings.competitiveSavings, curr)}
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          Highest bid vs awarded: {competitiveSavings.competitiveSavingsPercent}% saved
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-muted/20 rounded">
                          <p className="text-muted-foreground">Highest Bid Total</p>
                          <p className="font-semibold">{formatCurrency(competitiveSavings.totalHighestBid, curr)}</p>
                        </div>
                        <div className="p-2 bg-muted/20 rounded">
                          <p className="text-muted-foreground">Lowest Bid Total</p>
                          <p className="font-semibold">{formatCurrency(competitiveSavings.totalLowestBid, curr)}</p>
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground italic text-center">
                        {competitiveSavings.bidsWith3Plus} bids with 3+ supplier responses
                      </p>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-xs flex-col gap-2 min-h-[200px]">
                      <p>No competitive bid data</p>
                      <p className="text-[9px]">Awarded bids with supplier responses will appear here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-12 md:col-span-5">
              <Card className="h-full" data-testid="chart-bid-status">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-primary" />
                    Bid Pipeline Status
                    {bidStatusDist?.length ? (
                      <Badge variant="secondary" className="text-xs ml-auto font-normal">
                        {bidPipelineTotal} bids
                      </Badge>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {bidStatusDist?.length ? (
                    <div>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={filteredBidStatusDist} cx="50%" cy="50%" outerRadius={65} innerRadius={35} dataKey="count" nameKey="name" label={({ count }: any) => count} labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }} strokeWidth={2} stroke="hsl(var(--card))">
                            {filteredBidStatusDist?.map((d: any, i: number) => {
                              const originalIdx = bidStatusDist.findIndex((item: any) => item.name === d.name);
                              return <Cell key={i} fill={CHART_COLORS[Math.max(0, originalIdx) % CHART_COLORS.length]} />;
                            })}
                          </Pie>
                          <Tooltip content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0];
                            return (
                              <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
                                <p className="font-semibold">{d.payload.name}</p>
                                <p className="text-muted-foreground">{d.value} bids • {formatCurrency(d.payload.value, curr)}</p>
                              </div>
                            );
                          }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-1">
                        {bidStatusDist.map((d: any, i: number) => {
                          const isHidden = hiddenBidStatus[d.name];
                          return (
                            <div key={i} className={`flex items-center justify-between text-[10px] cursor-pointer hover:bg-muted/50 p-1 rounded-sm transition-colors ${isHidden ? "opacity-40" : ""}`} onClick={() => setHiddenBidStatus(prev => ({ ...prev, [d.name]: !prev[d.name] }))}>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                <span className={`text-muted-foreground ${isHidden ? "line-through" : ""}`}>{d.name}</span>
                              </div>
                              <span className="font-medium">{d.count} bids</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No bid data</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 md:col-span-7">
              <Card className="h-full" data-testid="table-top-savings-bids">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    Top Savings from Bids
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {topSavingsBids?.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-1.5 pr-2 font-medium">Bid Title</th>
                            <th className="text-left py-1.5 px-1 font-medium">Type</th>
                            <th className="text-right py-1.5 px-1 font-medium">Estimated</th>
                            <th className="text-right py-1.5 px-1 font-medium">Awarded</th>
                            <th className="text-right py-1.5 px-1 font-medium">Savings</th>
                            <th className="text-right py-1.5 pl-1 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topSavingsBids.map((b: any, i: number) => (
                            <tr key={i} className="border-b border-muted/50 hover:bg-muted/20">
                              <td className="py-1.5 pr-2 max-w-[180px] truncate" title={b.bidTitle}>{b.bidTitle}</td>
                              <td className="py-1.5 px-1">
                                <Badge variant="outline" className="text-[8px] px-1">{b.type}</Badge>
                              </td>
                              <td className="py-1.5 px-1 text-right">{formatCurrency(b.estimated, b.currency || curr)}</td>
                              <td className="py-1.5 px-1 text-right">{formatCurrency(b.awarded, b.currency || curr)}</td>
                              <td className="py-1.5 px-1 text-right font-semibold text-emerald-600">
                                {formatCurrency(b.savings, b.currency || curr)}
                              </td>
                              <td className="py-1.5 pl-1 text-right">
                                <Badge variant="secondary" className="text-[8px] px-1 bg-emerald-500/10 text-emerald-600">
                                  {b.savingsPercent}%
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-muted-foreground text-xs flex-col gap-2">
                      <p>No awarded bids with savings data</p>
                      <p className="text-[9px]">Bids need estimated amount and award amount to calculate savings</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <SectionHeader title="Budget Overview" />

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-12 lg:col-span-8">
              <Card className="h-full" data-testid="chart-budget-vs-spend">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Budget VS Spend
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {budgetVsSpend?.length ? (
                    <>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={filteredBudgetVsSpend} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-25} textAnchor="end" height={55} />
                          <YAxis tickFormatter={(v: number) => formatAxisCurrency(v, curr)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                          <Tooltip content={makeChartTooltip(curr)} />
                          <Legend content={() => (
                            <div className="flex justify-center gap-5 pt-3 mb-1">
                              {[
                                { key: 'spend', name: 'Spend', color: 'hsl(340, 82%, 38%)' },
                                { key: 'budget', name: 'Budget', color: 'hsl(262, 60%, 35%)' }
                              ].map(item => {
                                const isHidden = hiddenSeries[item.key];
                                return (
                                  <div key={item.key} className="flex items-center gap-1.5 cursor-pointer text-xs transition-colors hover:opacity-80" onClick={() => toggleSeries(item.key)}>
                                    <div className="w-3 h-3 rounded-[2px] border" style={{ backgroundColor: isHidden ? "transparent" : item.color, borderColor: item.color }} />
                                    <span className={`text-muted-foreground font-medium ${isHidden ? "line-through" : ""}`}>{item.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )} />
                          <Bar hide={hiddenSeries.spend} dataKey="spend" name="Spend" fill="hsl(340, 82%, 38%)" radius={[3, 3, 0, 0]} barSize={18} />
                          <Bar hide={hiddenSeries.budget} dataKey="budget" name="Budget" fill="hsl(262, 60%, 35%)" radius={[3, 3, 0, 0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 justify-center">
                        {budgetVsSpend.map((d: any, i: number) => {
                          const isHidden = hiddenBudgets[d.name];
                          return (
                            <div key={i} className="flex items-center gap-1.5 cursor-pointer text-[9px] transition-colors hover:opacity-80" onClick={() => toggleBudget(d.name)}>
                              <div className="w-2.5 h-2.5 rounded-sm border" style={{ backgroundColor: isHidden ? "transparent" : "hsl(var(--muted-foreground)/0.2)", borderColor: "hsl(var(--border))" }} />
                              <span className={`text-muted-foreground font-medium ${isHidden ? "line-through" : ""}`}>{d.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No budget data available</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 lg:col-span-4 flex flex-col gap-2">
              {budgetLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="hover-elevate flex-1">
                    <CardContent className="p-3 text-center space-y-1.5">
                      <Skeleton className="h-5 w-10 mx-auto" />
                      <Skeleton className="h-3.5 w-24 mx-auto" />
                      <Skeleton className="h-6 w-16 mx-auto" />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <>
                  <BudgetSummaryCard label="Total Budget" value={formatCurrency(budgetSummary?.totalBudget || 0, curr)} percentage="100%" variant="default" />
                  <BudgetSummaryCard label="Consumed" value={formatCurrency(budgetSummary?.totalConsumed || 0, curr)} percentage={`${budgetSummary?.consumedPct || 0}%`} variant="default" />
                  <BudgetSummaryCard label="Reserved" value={formatCurrency(budgetSummary?.totalReserved || 0, curr)} percentage={`${budgetSummary?.reservedPct || 0}%`} variant="default" />
                  <BudgetSummaryCard label="Available" value={formatCurrency(budgetSummary?.available || 0, curr)} percentage={`${budgetSummary?.availablePct || 0}%`} variant="success" />
                </>
              )}
            </div>
          </div>

          <Card data-testid="consumed-amount-section">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-5">
                {(["total", "po", "non-po"] as const).map((type) => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid={`radio-consumed-${type}`}>
                    <input type="radio" name="consumedType" value={type} checked={consumedType === type} onChange={() => setConsumedType(type)} className="accent-[hsl(262,60%,35%)] w-3.5 h-3.5" />
                    {consumedTypeLabels[type]}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <span className="text-xs font-medium text-muted-foreground">{consumedTypeLabels[consumedType]}</span>
                </div>
                <div className="flex-1 h-1.5 bg-primary rounded-full" />
                <span className="text-sm font-bold" data-testid="text-consumed-value">{formatCurrency(consumedAmount?.value || 0, curr)}</span>
              </div>
            </CardContent>
          </Card>

          <SectionHeader title="Spend Intelligence" />

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-12 lg:col-span-7">
              <Card className="h-full" data-testid="chart-spend-trend">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Yearly Spend Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {spendTrend?.length ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={spendTrend} margin={{ top: 10, right: 20, left: 5, bottom: 5 }}>
                        <defs>
                          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(262, 60%, 35%)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="hsl(262, 60%, 35%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tickFormatter={(v: number) => formatAxisCurrency(v, curr)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip content={makeChartTooltip(curr)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="spend" name="Spend Trend" stroke="hsl(262, 60%, 35%)" strokeWidth={2.5} fill="url(#spendGrad)" dot={{ r: 4, fill: "hsl(262, 60%, 35%)", strokeWidth: 2, stroke: "hsl(var(--card))" }} activeDot={{ r: 6, strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No trend data</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 lg:col-span-5">
              <Card className="h-full" data-testid="chart-dept-spending">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-primary" />
                    Spend by Department
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {spendByDepartment?.length ? (
                    <div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                        {spendByDepartment.map((d: any, i: number) => {
                          const isHidden = hiddenDepartments[d.name];
                          return (
                            <div key={i} className="flex items-center gap-1 text-[9px] cursor-pointer transition-opacity hover:opacity-80" onClick={() => toggleDepartment(d.name)}>
                              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: isHidden ? 'transparent' : CHART_COLORS[i % CHART_COLORS.length], border: isHidden ? '1px solid hsl(var(--border))' : 'none' }} />
                              <span className={`text-muted-foreground ${isHidden ? 'line-through' : ''}`}>{d.name}</span>
                            </div>
                          )
                        })}
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={filteredSpendByDepartment} cx="50%" cy="50%" outerRadius={75} innerRadius={30} dataKey="value" nameKey="name" label={({ value }: any) => formatCurrency(value, curr)} labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }} strokeWidth={2} stroke="hsl(var(--card))">
                            {filteredSpendByDepartment?.map((_: any, idx: number) => {
                              // We need to match original index for stable colors
                              const originalIndex = spendByDepartment.findIndex((od: any) => od.name === _.name);
                              return <Cell key={idx} fill={CHART_COLORS[originalIndex % CHART_COLORS.length]} />;
                            })}
                          </Pie>
                          <Tooltip content={makePieTooltip(curr)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No department data</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <SectionHeader title="Supplier & Category Breakdown" />

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-12 lg:col-span-5">
              <Card className="h-full" data-testid="chart-top-categories">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                    Top 10 Categories
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {spendByCategory?.length ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={spendByCategory} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v: number) => formatAxisCurrency(v, curr)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip content={makeChartTooltip(curr)} />
                        <Bar dataKey="value" name="Spend" radius={[0, 4, 4, 0]} barSize={14} label={{ position: "right", fontSize: 8, fill: "hsl(var(--muted-foreground))", formatter: (v: number) => formatCurrency(v, curr) }}>
                          {spendByCategory.map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">No category data</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 lg:col-span-7">
              <Card className="h-full" data-testid="chart-top-suppliers">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Top 10 Suppliers by Spend
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {spendBySupplier?.length ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={spendBySupplier} margin={{ top: 20, right: 10, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} angle={-35} textAnchor="end" height={60} />
                        <YAxis tickFormatter={(v: number) => formatAxisCurrency(v, curr)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip content={makeChartTooltip(curr)} />
                        <Bar dataKey="value" name="Spend" radius={[4, 4, 0, 0]} barSize={28} label={{ position: "top", fontSize: 8, fill: "hsl(var(--muted-foreground))", formatter: (v: number) => formatCurrency(v, curr) }}>
                          {spendBySupplier.map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">No supplier data</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <SectionHeader title="Procurement Compliance" />

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-12 md:col-span-4">
              <Card className="h-full" data-testid="chart-po-vs-nonpo">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-primary" />
                    PO vs Non-PO Spend
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {poVsNonPo?.length ? (
                    <div>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <Pie data={filteredPoVsNonPo} cx="50%" cy="50%" outerRadius={65} innerRadius={35} dataKey="value" nameKey="name" label={({ percent }: any) => formatPercent(percent)} labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }} strokeWidth={2} stroke="hsl(var(--card))">
                            {filteredPoVsNonPo?.map((d: any, idx: number) => {
                              const originalIndex = poVsNonPo.findIndex((od: any) => od.name === d.name);
                              return <Cell key={idx} fill={originalIndex === 0 ? "hsl(262, 60%, 35%)" : "hsl(340, 82%, 38%)"} />;
                            })}
                          </Pie>
                          <Tooltip content={makePieTooltip(curr)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-1">
                        {poVsNonPo.map((d: any, i: number) => {
                          const isHidden = hiddenPoVsNonPo[d.name];
                          return (
                            <div key={i} className={`flex items-center justify-between text-[10px] cursor-pointer hover:bg-muted/50 p-1 rounded-sm transition-colors ${isHidden ? "opacity-40" : ""}`} onClick={() => setHiddenPoVsNonPo(prev => ({ ...prev, [d.name]: !prev[d.name] }))}>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: i === 0 ? "hsl(262, 60%, 35%)" : "hsl(340, 82%, 38%)" }} />
                                <span className={`text-muted-foreground ${isHidden ? "line-through" : ""}`}>{d.name}</span>
                              </div>
                              <span className="font-medium">{formatCurrency(d.value, curr)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 md:col-span-4">
              <Card className="h-full" data-testid="chart-spend-by-currency">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <IndianRupee className="h-4 w-4 text-primary" />
                    Spend by Currency
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {spendByCurrency?.length ? (
                    <div>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <Pie data={filteredSpendByCurrency} cx="50%" cy="50%" outerRadius={65} innerRadius={35} dataKey="value" nameKey="name" label={({ percent }: any) => formatPercent(percent)} labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }} strokeWidth={2} stroke="hsl(var(--card))">
                            {filteredSpendByCurrency?.map((d: any, idx: number) => {
                              const originalIndex = spendByCurrency.findIndex((od: any) => od.name === d.name);
                              return <Cell key={idx} fill={CHART_COLORS[originalIndex % CHART_COLORS.length]} />;
                            })}
                          </Pie>
                          <Tooltip content={makePieTooltip(curr, true)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-1">
                        {spendByCurrency.map((d: any, i: number) => {
                          const isHidden = hiddenSpendByCurrency[d.name];
                          return (
                            <div key={i} className={`flex items-center justify-between text-[10px] cursor-pointer hover:bg-muted/50 p-1 rounded-sm transition-colors ${isHidden ? "opacity-40" : ""}`} onClick={() => setHiddenSpendByCurrency(prev => ({ ...prev, [d.name]: !prev[d.name] }))}>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                <span className={`text-muted-foreground ${isHidden ? "line-through" : ""}`}>{d.name} ({d.count} POs)</span>
                              </div>
                              <span className="font-medium">{formatCurrency(d.value, curr)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 md:col-span-4">
              <Card className="h-full" data-testid="chart-contract-vs-spot">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Contract vs Spot Buy
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {contractVsSpot?.length ? (
                    <div>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <Pie data={filteredContractVsSpot} cx="50%" cy="50%" outerRadius={65} innerRadius={35} dataKey="value" nameKey="name" label={({ percent }: any) => formatPercent(percent)} labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }} strokeWidth={2} stroke="hsl(var(--card))">
                            {filteredContractVsSpot?.map((d: any, idx: number) => {
                              const originalIndex = contractVsSpot.findIndex((od: any) => od.name === d.name);
                              return <Cell key={idx} fill={originalIndex === 0 ? "hsl(188, 78%, 32%)" : "hsl(25, 90%, 38%)"} />;
                            })}
                          </Pie>
                          <Tooltip content={makePieTooltip(curr)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-1">
                        {contractVsSpot.map((d: any, i: number) => {
                          const isHidden = hiddenContractVsSpot[d.name];
                          return (
                            <div key={i} className={`flex items-center justify-between text-[10px] cursor-pointer hover:bg-muted/50 p-1 rounded-sm transition-colors ${isHidden ? "opacity-40" : ""}`} onClick={() => setHiddenContractVsSpot(prev => ({ ...prev, [d.name]: !prev[d.name] }))}>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: i === 0 ? "hsl(188, 78%, 32%)" : "hsl(25, 90%, 38%)" }} />
                                <span className={`text-muted-foreground ${isHidden ? "line-through" : ""}`}>{d.name}</span>
                              </div>
                              <span className="font-medium">{formatCurrency(d.value, curr)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <SectionHeader title="Savings & Risk" />

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-12 lg:col-span-8">
              <Card className="h-full" data-testid="card-maverick-spend">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Maverick Spend Detection
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center p-2.5 bg-muted/30 rounded-md">
                      <p className="text-xs text-muted-foreground">Total Invoices</p>
                      <p className="text-lg font-bold">{maverickSpend?.totalInvoices || 0}</p>
                    </div>
                    <div className="text-center p-2.5 bg-muted/30 rounded-md">
                      <p className="text-xs text-muted-foreground">Total Spend</p>
                      <p className="text-lg font-bold">{formatCurrency(maverickSpend?.totalSpend || 0, curr)}</p>
                    </div>
                    <div className="text-center p-2.5 bg-amber-500/5 rounded-md border border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-muted-foreground">Maverick (No PO)</p>
                      <p className="text-lg font-bold text-amber-600">{maverickSpend?.maverickCount || 0}</p>
                      <p className="text-xs font-medium text-amber-600">{formatCurrency(maverickSpend?.maverickSpend || 0, curr)}</p>
                    </div>
                    <div className="text-center p-2 rounded-md border-2" style={{
                      borderColor: (maverickSpend?.maverickPercent || 0) > 35 ? "hsl(0,84%,60%)" : (maverickSpend?.maverickPercent || 0) > 15 ? "hsl(38,92%,50%)" : "hsl(142,71%,45%)",
                      backgroundColor: (maverickSpend?.maverickPercent || 0) > 35 ? "hsla(0,84%,60%,0.05)" : (maverickSpend?.maverickPercent || 0) > 15 ? "hsla(38,92%,50%,0.05)" : "hsla(142,71%,45%,0.05)",
                    }}>
                      <p className="text-xs text-muted-foreground">Rate</p>
                      <p className="text-2xl font-bold" style={{ color: (maverickSpend?.maverickPercent || 0) > 35 ? "hsl(0,84%,60%)" : (maverickSpend?.maverickPercent || 0) > 15 ? "hsl(38,92%,50%)" : "hsl(142,71%,45%)" }}>
                        {maverickSpend?.maverickPercent || 0}%
                      </p>
                      <Badge variant="secondary" className="text-[9px]">
                        {(maverickSpend?.maverickPercent || 0) <= 10 ? "Excellent" : (maverickSpend?.maverickPercent || 0) <= 20 ? "Good" : (maverickSpend?.maverickPercent || 0) <= 35 ? "Needs Improvement" : "Critical"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{
                        width: `${Math.min(maverickSpend?.maverickPercent || 0, 100)}%`,
                        backgroundColor: (maverickSpend?.maverickPercent || 0) > 35 ? "hsl(0,84%,60%)" : (maverickSpend?.maverickPercent || 0) > 15 ? "hsl(38,92%,50%)" : "hsl(142,71%,45%)",
                      }} />
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1.5 italic">Industry benchmark: below 10% excellent, 10-20% good, above 30% needs attention.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="col-span-12 lg:col-span-4">
              <Card className="h-full" data-testid="card-savings-analysis">
                <CardHeader className="px-3 py-2 pb-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    Savings Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {savingsAnalysis?.prCount > 0 ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-center p-2.5 bg-muted/30 rounded-md">
                          <p className="text-xs text-muted-foreground">PR Estimated</p>
                          <p className="text-sm font-bold">{formatCurrency(savingsAnalysis.estimated, curr)}</p>
                        </div>
                        <div className="text-center p-2.5 bg-muted/30 rounded-md">
                          <p className="text-xs text-muted-foreground">PO Actual</p>
                          <p className="text-sm font-bold">{formatCurrency(savingsAnalysis.actual, curr)}</p>
                        </div>
                      </div>
                      <div className="text-center p-2.5 bg-emerald-500/5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        <p className="text-xs text-muted-foreground mb-0.5">Negotiation Savings</p>
                        <p className={`text-xl font-bold ${savingsAnalysis.savings >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {formatCurrency(Math.abs(savingsAnalysis.savings), curr)}
                        </p>
                        <Badge variant={savingsAnalysis.savings >= 0 ? "secondary" : "destructive"} className="text-[9px] mt-1">
                          {savingsAnalysis.savings >= 0 ? "▼" : "▲"} {Math.abs(savingsAnalysis.savingsPercent)}%
                        </Badge>
                      </div>
                      <p className="text-[9px] text-muted-foreground italic text-center">
                        Based on {savingsAnalysis.prCount} linked PR-PO pairs
                      </p>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-xs flex-col gap-2 min-h-[180px]">
                      <p>No linked PR-PO data</p>
                      <p className="text-[9px]">PR and PO must share matching references</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {activeTab === "operational" && (
        <OperationalAnalysisTab entity={entity} curr={curr} />
      )}

      {activeTab === "strategic" && (
        <StrategicInsightsTab entity={entity} year={year} curr={curr} />
      )}

      {activeTab === "ai-insights" && isAIEnabled('AI_SPEND_INSIGHTS') && (
        <AIInsightsTab entity={entity} year={year} curr={curr} />
      )}
    </div>
  );
}

function OperationalAnalysisTab({ entity, curr }: { entity: string; curr: string }) {
  const [hiddenInvoiceStatus, setHiddenInvoiceStatus] = useState<Record<string, boolean>>({});
  const orgParam = entity !== "all" ? `?orgId=${entity}` : "";

  const { data: cycleTime, isLoading: cycleLoading } = useQuery({
    queryKey: ["/api/spend-analysis/purchase-cycle-time", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/purchase-cycle-time${orgParam}`);
      return res.json();
    },
  });

  const { data: latePayment, isLoading: lateLoading } = useQuery({
    queryKey: ["/api/spend-analysis/late-payment-percent", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/late-payment-percent${orgParam}`);
      return res.json();
    },
  });

  const { data: invoiceStatus } = useQuery({
    queryKey: ["/api/spend-analysis/invoice-status-counts", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/invoice-status-counts${orgParam}`);
      return res.json();
    },
  });

  const { data: poAging } = useQuery({
    queryKey: ["/api/spend-analysis/open-po-aging", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/open-po-aging${orgParam}`);
      return res.json();
    },
  });

  const { data: uninvoicedGRNs } = useQuery({
    queryKey: ["/api/spend-analysis/uninvoiced-grns", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/uninvoiced-grns${orgParam}`);
      return res.json();
    },
  });

  const { data: topApprovers } = useQuery({
    queryKey: ["/api/spend-analysis/top-approvers", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/top-approvers${orgParam}`);
      return res.json();
    },
  });

  const { data: avgApprovalDays } = useQuery({
    queryKey: ["/api/spend-analysis/avg-approval-days", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/avg-approval-days${orgParam}`);
      return res.json();
    },
  });

  const { data: poYearTrend } = useQuery({
    queryKey: ["/api/spend-analysis/po-year-trend", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/po-year-trend${orgParam}`);
      return res.json();
    },
  });

  const cycleSteps = [
    { label: "PR to PO", key: "prToPo", color: "bg-primary" },
    { label: "PO Confirmation", key: "poToPoConf", color: "bg-blue-500" },
    { label: "PO to Delivery", key: "poToDelivery", color: "bg-emerald-500" },
    { label: "Delivery to Invoice", key: "deliveryToInvoice", color: "bg-amber-500" },
    { label: "Invoice to Payment", key: "invoiceToPayment", color: "bg-rose-500" },
  ];

  const totalCycleDays = cycleTime
    ? Object.values(cycleTime as Record<string, number>).reduce((s: number, v: number) => s + v, 0)
    : 0;

  const latePercent = latePayment?.percent || 0;
  const filteredInvoiceStatus = invoiceStatus?.filter((d: any) => !hiddenInvoiceStatus[d.name]);

  return (
    <div className="space-y-2.5" data-testid="operational-analysis-tab">
      <p className="text-sm text-muted-foreground">
        Operational efficiency metrics across the procurement lifecycle.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          title="Avg Cycle Time"
          value={cycleLoading ? "..." : `${totalCycleDays} days`}
          icon={Timer}
          bgColor="bg-primary/10"
          textColor="text-primary"
          loading={cycleLoading}
        />
        <StatCard
          title="Late Payments"
          value={lateLoading ? "..." : `${latePercent}%`}
          icon={AlertTriangle}
          bgColor={latePercent > 20 ? "bg-red-500/10" : "bg-amber-500/10"}
          textColor={latePercent > 20 ? "text-red-600" : "text-amber-600"}
          loading={lateLoading}
        />
        <StatCard
          title="Uninvoiced GRNs"
          value={uninvoicedGRNs ? formatNumber(uninvoicedGRNs.count) : "0"}
          icon={Package}
          bgColor="bg-orange-500/10"
          textColor="text-orange-600"
        />
        <StatCard
          title="Uninvoiced Value"
          value={uninvoicedGRNs ? formatCurrency(uninvoicedGRNs.totalValue, curr) : `${curr} 0`}
          icon={Receipt}
          bgColor="bg-purple-500/10"
          textColor="text-purple-600"
        />
      </div>

      <Card data-testid="chart-purchase-cycle">
        <CardHeader className="px-3 py-2 pb-1">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Purchase-to-Pay Cycle Time (Avg Days)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          {cycleLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2.5">
              {cycleSteps.map((step) => {
                const days = (cycleTime as any)?.[step.key] || 0;
                const maxDays = Math.max(...Object.values(cycleTime || {}).map(Number), 1);
                const pct = Math.max((days / maxDays) * 100, 4);
                return (
                  <div key={step.key} className="flex items-center gap-3" data-testid={`cycle-step-${step.key}`}>
                    <span className="text-xs font-medium text-muted-foreground w-36 shrink-0 text-right">{step.label}</span>
                    <div className="flex-1 bg-muted/50 rounded-full h-6 relative overflow-hidden">
                      <div
                        className={`h-full ${step.color} rounded-full transition-all duration-700 flex items-center justify-end pr-2`}
                        style={{ width: `${pct}%` }}
                      >
                        <span className="text-[10px] font-bold text-white drop-shadow-sm">{days}d</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 pt-1 border-t">
                <span className="text-xs font-semibold w-36 shrink-0 text-right">Total Cycle</span>
                <span className="text-sm font-bold text-primary">{totalCycleDays} days</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        <Card data-testid="chart-invoice-status">
          <CardHeader className="px-3 py-2 pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" />
              Invoice Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {invoiceStatus?.length ? (
              <div>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3">
                  {invoiceStatus.map((d: any, i: number) => {
                    const isHidden = hiddenInvoiceStatus[d.name];
                    return (
                      <div key={i} className={`flex items-center gap-1.5 text-[10px] cursor-pointer transition-colors hover:opacity-80 ${isHidden ? "opacity-50" : ""}`} onClick={() => setHiddenInvoiceStatus(prev => ({ ...prev, [d.name]: !prev[d.name] }))}>
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: isHidden ? "transparent" : CHART_COLORS[i % CHART_COLORS.length], border: isHidden ? "1px solid hsl(var(--border))" : "none" }} />
                        <span className={`text-muted-foreground ${isHidden ? "line-through" : ""}`}>{d.name} ({d.value})</span>
                      </div>
                    );
                  })}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={filteredInvoiceStatus}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      dataKey="value"
                      nameKey="name"
                      label={({ value }: any) => value}
                      labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }}
                      strokeWidth={2}
                      stroke="hsl(var(--card))"
                    >
                      {filteredInvoiceStatus?.map((d: any, i: number) => {
                        const originalIndex = invoiceStatus.findIndex((od: any) => od.name === d.name);
                        return <Cell key={i} fill={CHART_COLORS[originalIndex % CHART_COLORS.length]} />;
                      })}
                    </Pie>
                    <Tooltip content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      return (
                        <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
                          <p className="font-semibold">{d.name}</p>
                          <p className="text-muted-foreground">{d.value} invoices</p>
                        </div>
                      );
                    }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">No invoice data</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="chart-po-aging">
          <CardHeader className="px-3 py-2 pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Open PO Aging
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {poAging?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={poAging} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => formatAxisCurrency(v, curr)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
                        <p className="font-semibold mb-1.5">{label}</p>
                        {payload.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-muted-foreground">
                            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                            <span>{p.name}:</span>
                            <span className="font-medium text-foreground ml-auto">
                              {p.name === "Value" ? formatCurrency(p.value, curr) : formatNumber(p.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="count" name="PO Count" fill="hsl(262, 60%, 35%)" radius={[3, 3, 0, 0]} barSize={28} />
                  <Bar yAxisId="right" dataKey="value" name="Value" fill="hsl(188, 78%, 32%)" radius={[3, 3, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No open PO data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        <Card data-testid="chart-avg-approval-days">
          <CardHeader className="px-3 py-2 pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gavel className="h-4 w-4 text-primary" />
              Avg Approval Days by Entity Type
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {avgApprovalDays?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={avgApprovalDays} margin={{ top: 15, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="entityType" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} label={{ value: "Days", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } }} />
                  <Tooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
                        <p className="font-semibold">{label}</p>
                        <p className="text-muted-foreground">{payload[0].value} avg days</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="avgDays" name="Avg Days" radius={[4, 4, 0, 0]} barSize={36}>
                    {avgApprovalDays.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No approval data</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="chart-po-year-trend">
          <CardHeader className="px-3 py-2 pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              PO Value Trend (Quarterly)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {poYearTrend?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={poYearTrend} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tickFormatter={(v: number) => formatAxisCurrency(v, curr)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={makeChartTooltip(curr)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="q1" name="Q1" fill="hsl(262, 60%, 35%)" radius={[3, 3, 0, 0]} barSize={16} />
                  <Bar dataKey="q2" name="Q2" fill="hsl(217, 91%, 35%)" radius={[3, 3, 0, 0]} barSize={16} />
                  <Bar dataKey="q3" name="Q3" fill="hsl(188, 78%, 32%)" radius={[3, 3, 0, 0]} barSize={16} />
                  <Bar dataKey="q4" name="Q4" fill="hsl(280, 65%, 35%)" radius={[3, 3, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No PO trend data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="table-top-approvers">
        <CardHeader className="px-3 py-2 pb-1">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Top Approvers
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          {topApprovers?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground">#</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Approver</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Approvals</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Avg Days</th>
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground w-40">Performance</th>
                  </tr>
                </thead>
                <tbody>
                  {topApprovers.map((a: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-approver-${i}`}>
                      <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3 font-medium">{a.name}</td>
                      <td className="py-2 px-3 text-right">
                        <Badge variant="secondary" className="text-[10px]">{a.approvalCount}</Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-medium">
                        <span className={a.avgDays <= 2 ? "text-emerald-600" : a.avgDays <= 5 ? "text-amber-600" : "text-red-600"}>
                          {a.avgDays}d
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${a.avgDays <= 2 ? "bg-emerald-500" : a.avgDays <= 5 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${Math.max(100 - a.avgDays * 10, 10)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground shrink-0">
                            {a.avgDays <= 2 ? "Fast" : a.avgDays <= 5 ? "Moderate" : "Slow"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No approver data</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <Card data-testid="card-late-payment-detail">
          <CardHeader className="px-3 py-2 pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Late Payment Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Paid Invoices</span>
                <span className="text-sm font-semibold">{latePayment?.paidCount || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Late Payments</span>
                <span className="text-sm font-semibold text-red-600">{latePayment?.lateCount || 0}</span>
              </div>
              <div className="w-full bg-muted/50 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${latePercent > 20 ? "bg-red-500" : latePercent > 10 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(latePercent, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Late Payment Rate</span>
                <Badge variant={latePercent > 20 ? "destructive" : "secondary"} className="text-[10px]">
                  {latePercent}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-uninvoiced-grn-detail">
          <CardHeader className="px-3 py-2 pb-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-orange-500" />
              Uninvoiced GRN Details
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="space-y-2.5">
              <div className="text-center py-2">
                <p className="text-2xl font-bold text-orange-600">{uninvoicedGRNs?.count || 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">GRNs pending invoicing</p>
              </div>
              <div className="border-t pt-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total Uninvoiced Value</span>
                  <span className="text-sm font-bold text-orange-600">
                    {formatCurrency(uninvoicedGRNs?.totalValue || 0, curr)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Goods received but not yet invoiced — potential accrual liability
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <ContractExpirySection curr={curr} />
    </div>
  );
}

function ContractExpirySection({ curr }: { curr: string }) {
  const { data: contractPipeline } = useQuery({
    queryKey: ["/api/spend-analysis/contract-pipeline"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/spend-analysis/contract-pipeline");
      return res.json();
    },
  });

  const exp30 = contractPipeline?.expiry30 || { count: 0, value: 0 };
  const exp60 = contractPipeline?.expiry60 || { count: 0, value: 0 };
  const exp90 = contractPipeline?.expiry90 || { count: 0, value: 0 };
  const totalExpiring = exp30.count + exp60.count + exp90.count;

  return (
    <>
      <SectionHeader title="Contract Lifecycle & Expiry Alerts" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="hover-elevate" data-testid="card-expiry-30">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Expiring ≤30 Days</p>
              <p className="text-xl font-bold text-red-600">{exp30.count}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(exp30.value, curr)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-expiry-60">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <CalendarClock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Expiring 31–60 Days</p>
              <p className="text-xl font-bold text-amber-600">{exp60.count}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(exp60.value, curr)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-expiry-90">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <CalendarClock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Expiring 61–90 Days</p>
              <p className="text-xl font-bold text-blue-600">{exp90.count}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(exp90.value, curr)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-contract-lifecycle">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <RefreshCw className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Renewable (Active)</p>
              <p className="text-xl font-bold text-emerald-600">{contractPipeline?.renewableCount || 0}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(contractPipeline?.renewableValue || 0, curr)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {totalExpiring > 0 && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-500/5 rounded-lg border border-amber-200 dark:border-amber-800 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            <span className="font-semibold text-amber-700 dark:text-amber-400">{totalExpiring} contract{totalExpiring !== 1 ? "s" : ""}</span> are expiring in the next 90 days.
            {exp30.count > 0 && <span className="font-semibold text-red-600"> {exp30.count} require immediate action (≤30 days).</span>}
            {" "}Review and initiate renewal or renegotiation now to avoid coverage gaps.
          </p>
        </div>
      )}
    </>
  );
}
function StrategicInsightsTab({ entity, year, curr }: { entity: string; year: string; curr: string }) {
  const [hiddenPaymentTerms, setHiddenPaymentTerms] = useState<Record<string, boolean>>({});
  const orgParam = entity !== "all" ? `orgId=${entity}` : "";
  const yearParam = year !== "all" ? `year=${year}` : "";
  const queryStr = [orgParam, yearParam].filter(Boolean).join("&");
  const qs = queryStr ? `?${queryStr}` : "";
  const orgQs = orgParam ? `?${orgParam}` : "";

  const { data: yoyData } = useQuery({
    queryKey: ["/api/spend-analysis/yoy-spend", year, entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/yoy-spend${qs}`);
      return res.json();
    },
  });

  const { data: vendorConc } = useQuery({
    queryKey: ["/api/spend-analysis/vendor-concentration", year, entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/vendor-concentration${qs}`);
      return res.json();
    },
  });

  const { data: paymentTerms } = useQuery({
    queryKey: ["/api/spend-analysis/payment-terms-analysis", year, entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/payment-terms-analysis${qs}`);
      return res.json();
    },
  });

  const { data: upcomingPayments } = useQuery({
    queryKey: ["/api/spend-analysis/upcoming-payments", entity],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/upcoming-payments${orgQs}`);
      return res.json();
    },
  });

  const riskColorMap: Record<string, string> = {
    High: "text-red-600",
    Medium: "text-amber-600",
    Low: "text-emerald-600",
  };

  const riskBgMap: Record<string, string> = {
    High: "bg-red-500/10 border-red-200 dark:border-red-800",
    Medium: "bg-amber-500/10 border-amber-200 dark:border-amber-800",
    Low: "bg-emerald-500/10 border-emerald-200 dark:border-emerald-800",
  };

  const paymentStatusColors: Record<string, string> = {
    "On-Time/Early": "hsl(142,71%,45%)",
    "Late": "hsl(0,84%,60%)",
    "Overdue": "hsl(25,95%,53%)",
    "Not Yet Due": "hsl(217,91%,60%)",
    "No Due Date": "hsl(215,14%,55%)",
  };

  const bucketColors: Record<string, string> = {
    "Overdue": "hsl(0,84%,50%)",
    "0-30 Days": "hsl(25,95%,50%)",
    "31-60 Days": "hsl(45,93%,47%)",
    "61-90 Days": "hsl(217,91%,60%)",
    "90+ Days": "hsl(215,14%,55%)",
  };

  const filteredPaymentTerms = paymentTerms?.breakdown?.filter((d: any) => !hiddenPaymentTerms[d.status]);

  return (
    <div className="space-y-2.5" data-testid="strategic-insights-tab">
      <p className="text-sm text-muted-foreground">
        Forward-looking risk assessment, supplier dependency, and cash flow visibility for executive decision-making.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          title="YoY Spend Growth"
          value={yoyData ? `${yoyData.growth > 0 ? "+" : ""}${yoyData.growth}%` : "..."}
          icon={yoyData?.growth >= 0 ? TrendingUp : TrendingDown}
          bgColor={yoyData?.growth > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}
          textColor={yoyData?.growth > 0 ? "text-red-600" : "text-emerald-600"}
          loading={!yoyData}
        />
        <StatCard
          title="Top 5 Supplier Share"
          value={vendorConc ? `${vendorConc.top5Pct}%` : "..."}
          icon={Shield}
          bgColor={(riskColorMap[vendorConc?.riskLevel] || "text-muted-foreground").replace("text-", "bg-").replace("-600", "-500/10")}
          textColor={riskColorMap[vendorConc?.riskLevel] || "text-muted-foreground"}
          loading={!vendorConc}
        />
        <StatCard
          title="Early Payments"
          value={paymentTerms ? `${paymentTerms.earlyPayments.count}` : "..."}
          icon={CheckCircle2}
          bgColor="bg-emerald-500/10"
          textColor="text-emerald-600"
          loading={!paymentTerms}
        />
        <StatCard
          title="Outstanding Payables"
          value={upcomingPayments ? formatCurrency(upcomingPayments.totalOutstanding, curr) : "..."}
          icon={CalendarClock}
          bgColor="bg-blue-500/10"
          textColor="text-blue-600"
          loading={!upcomingPayments}
        />
      </div>

      <SectionHeader title="Year-over-Year Comparison" />

      <div className="grid grid-cols-12 gap-2.5">
        <div className="col-span-12 lg:col-span-8">
          <Card className="h-full" data-testid="chart-yoy-spend">
            <CardHeader className="px-3 py-2 pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Monthly Spend Comparison
                {yoyData && (
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {yoyData.currentYear} vs {yoyData.prevYear}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {yoyData?.data?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={yoyData.data} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatAxisCurrency(v, curr)} />
                    <Tooltip content={makeChartTooltip(curr)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="currentYear" name={`${yoyData.currentYear}`} fill="hsl(262, 60%, 35%)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="prevYear" name={`${yoyData.prevYear}`} fill="hsl(215, 14%, 65%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No YoY data available</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Card className="h-full" data-testid="card-yoy-summary">
            <CardHeader className="px-3 py-2 pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                YoY Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {yoyData ? (
                <div className="space-y-2.5">
                  <div className="p-2.5 bg-muted/30 rounded-md">
                    <p className="text-xs text-muted-foreground">{yoyData.currentYear} Total Spend</p>
                    <p className="text-lg font-bold">{formatCurrency(yoyData.totalCurrent, curr)}</p>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-md">
                    <p className="text-xs text-muted-foreground">{yoyData.prevYear} Total Spend</p>
                    <p className="text-lg font-bold">{formatCurrency(yoyData.totalPrev, curr)}</p>
                  </div>
                  <div className={`p-2.5 rounded-md border-2 ${yoyData.growth > 0 ? "border-red-200 bg-red-500/5 dark:border-red-800" : "border-emerald-200 bg-emerald-500/5 dark:border-emerald-800"}`}>
                    <p className="text-xs text-muted-foreground">Year-over-Year Change</p>
                    <p className={`text-xl font-bold ${yoyData.growth > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {yoyData.growth > 0 ? "+" : ""}{yoyData.growth}%
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {yoyData.growth > 0 ? "Spend increased" : yoyData.growth < 0 ? "Spend decreased" : "No change"} vs prior year
                    </p>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-md">
                    <p className="text-xs text-muted-foreground">Absolute Change</p>
                    <p className="text-sm font-bold">
                      {formatCurrency(Math.abs(yoyData.totalCurrent - yoyData.totalPrev), curr)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SectionHeader title="Supplier Concentration Risk" />

      <div className="grid grid-cols-12 gap-2.5">
        <div className="col-span-12 lg:col-span-8">
          <Card className="h-full" data-testid="chart-vendor-concentration">
            <CardHeader className="px-3 py-2 pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Supplier Spend Concentration
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {vendorConc?.suppliers?.length ? (
                <div className="space-y-2">
                  {vendorConc.suppliers.map((s: any, i: number) => {
                    const isTop5 = i < 5;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className={`text-xs w-5 text-center font-bold ${isTop5 ? "text-foreground" : "text-muted-foreground"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className={isTop5 ? "font-medium" : "text-muted-foreground"}>{s.name}</span>
                            <span className="font-medium">{formatCurrency(s.spend, curr)} ({s.pct}%)</span>
                          </div>
                          <div className="w-full bg-muted/40 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{
                                width: `${Math.min(s.pct, 100)}%`,
                                backgroundColor: isTop5 ? CHART_COLORS[i % CHART_COLORS.length] : "hsl(var(--muted-foreground))",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No supplier data</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Card className="h-full" data-testid="card-concentration-risk">
            <CardHeader className="px-3 py-2 pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {vendorConc ? (
                <div className="space-y-2.5">
                  <div className={`p-3 rounded-md border ${riskBgMap[vendorConc.riskLevel] || ""}`}>
                    <p className="text-xs text-muted-foreground mb-1">Concentration Risk Level</p>
                    <p className={`text-2xl font-bold ${riskColorMap[vendorConc.riskLevel] || ""}`}>
                      {vendorConc.riskLevel}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Top 5 suppliers control {vendorConc.top5Pct}% of total spend
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-muted/30 rounded-md text-center">
                      <p className="text-xs text-muted-foreground">Top 5 Spend</p>
                      <p className="text-sm font-bold">{formatCurrency(vendorConc.top5Spend, curr)}</p>
                    </div>
                    <div className="p-2.5 bg-muted/30 rounded-md text-center">
                      <p className="text-xs text-muted-foreground">Total Spend</p>
                      <p className="text-sm font-bold">{formatCurrency(vendorConc.totalSpend, curr)}</p>
                    </div>
                  </div>
                  <div className="p-2.5 bg-muted/20 rounded text-xs">
                    <p className="font-medium mb-1">Recommendation</p>
                    <p className="text-muted-foreground">
                      {vendorConc.riskLevel === "High"
                        ? "Consider diversifying supplier base. High dependency on few suppliers increases supply chain risk."
                        : vendorConc.riskLevel === "Medium"
                          ? "Moderate concentration. Monitor top supplier dependencies and develop alternative sources."
                          : "Healthy supplier diversity. Continue monitoring for any emerging concentrations."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SectionHeader title="Payment Performance" />

      <div className="grid grid-cols-12 gap-2.5">
        <div className="col-span-12 md:col-span-5">
          <Card className="h-full" data-testid="chart-payment-terms">
            <CardHeader className="px-3 py-2 pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Payment Terms Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {paymentTerms?.breakdown?.length ? (
                <div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={filteredPaymentTerms}
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        innerRadius={35}
                        dataKey="amount"
                        nameKey="status"
                        label={({ payload }: any) => payload.count}
                        labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }}
                        strokeWidth={2}
                        stroke="hsl(var(--card))"
                      >
                        {filteredPaymentTerms?.map((d: any, i: number) => {
                          const originalIndex = paymentTerms.breakdown.findIndex((od: any) => od.status === d.status);
                          return <Cell key={i} fill={paymentStatusColors[d.status] || CHART_COLORS[originalIndex % CHART_COLORS.length]} />;
                        })}
                      </Pie>
                      <Tooltip content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0];
                        return (
                          <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
                            <p className="font-semibold">{d.payload.status}</p>
                            <p className="text-muted-foreground">{d.payload.count} invoices • {formatCurrency(d.value, curr)}</p>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-1">
                    {paymentTerms.breakdown.map((d: any, i: number) => {
                      const isHidden = hiddenPaymentTerms[d.status];
                      return (
                        <div key={i} className={`flex items-center justify-between text-[10px] cursor-pointer hover:bg-muted/50 p-1 rounded-sm transition-colors ${isHidden ? "opacity-40" : ""}`} onClick={() => setHiddenPaymentTerms(prev => ({ ...prev, [d.status]: !prev[d.status] }))}>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: paymentStatusColors[d.status] || CHART_COLORS[i] }} />
                            <span className={`text-muted-foreground ${isHidden ? "line-through" : ""}`}>{d.status}</span>
                          </div>
                          <span className="font-medium">{d.count} invoices • {formatCurrency(d.amount, curr)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No payment data</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-7">
          <Card className="h-full" data-testid="chart-upcoming-payments">
            <CardHeader className="px-3 py-2 pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                Upcoming Payment Obligations
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {upcomingPayments?.buckets?.length ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2.5 bg-red-500/5 rounded-md border border-red-200 dark:border-red-800">
                      <p className="text-xs text-muted-foreground">Overdue</p>
                      <p className="text-lg font-bold text-red-600">{formatCurrency(upcomingPayments.overdueAmount, curr)}</p>
                      <p className="text-[10px] text-muted-foreground">{upcomingPayments.overdueCount} invoices</p>
                    </div>
                    <div className="text-center p-2.5 bg-amber-500/5 rounded-md border border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-muted-foreground">Due in 30 Days</p>
                      <p className="text-lg font-bold text-amber-600">{formatCurrency(upcomingPayments.next30Amount, curr)}</p>
                      <p className="text-[10px] text-muted-foreground">{upcomingPayments.next30Count} invoices</p>
                    </div>
                    <div className="text-center p-2.5 bg-blue-500/5 rounded-md border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-muted-foreground">Total Outstanding</p>
                      <p className="text-lg font-bold text-blue-600">{formatCurrency(upcomingPayments.totalOutstanding, curr)}</p>
                      <p className="text-[10px] text-muted-foreground">{upcomingPayments.buckets.reduce((s: number, b: any) => s + b.count, 0)} invoices</p>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={upcomingPayments.buckets} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatAxisCurrency(v, curr)} />
                      <Tooltip content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
                            <p className="font-semibold">{label}</p>
                            <p className="text-muted-foreground">{payload[0].payload.count} invoices • {formatCurrency(payload[0].value, curr)}</p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                        {upcomingPayments.buckets.map((b: any, i: number) => (
                          <Cell key={i} fill={bucketColors[b.bucket] || CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {upcomingPayments.overdueAmount > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-red-500/5 rounded border border-red-200 dark:border-red-800 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                      <p className="text-muted-foreground">
                        <span className="font-medium text-red-600">{formatCurrency(upcomingPayments.overdueAmount, curr)}</span> in overdue payments require immediate attention
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No outstanding payment data</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <ContractIntelligenceSection curr={curr} />
    </div>
  );
}
function ContractIntelligenceSection({ curr }: { curr: string }) {
  const { data: contractPipeline } = useQuery({
    queryKey: ["/api/spend-analysis/contract-pipeline"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/spend-analysis/contract-pipeline");
      return res.json();
    },
  });

  const statusColor: Record<string, string> = {
    Active: "text-emerald-600 bg-emerald-500/10",
    Terminated: "text-red-600 bg-red-500/10",
    "Pending Approval": "text-amber-600 bg-amber-500/10",
    "Pending Signature": "text-orange-600 bg-orange-500/10",
    Expired: "text-slate-600 bg-slate-500/10",
  };

  return (
    <>
      <SectionHeader title="Contract Intelligence" />

      <div className="grid grid-cols-12 gap-2.5">
        <div className="col-span-12 md:col-span-7">
          <Card data-testid="chart-renewal-pipeline">
            <CardHeader className="px-3 py-2 pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" />
                Contract Renewal Pipeline (Next 6 Months)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {contractPipeline?.renewalPipeline?.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={contractPipeline.renewalPipeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatAxisCurrency(v, curr)} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                    <Tooltip content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border bg-card px-3 py-2.5 text-xs shadow-md">
                          <p className="font-semibold mb-1">{label}</p>
                          {payload.map((p: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-muted-foreground">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                              <span>{p.name}:</span>
                              <span className="font-medium text-foreground ml-auto">
                                {p.name === "Count" ? p.value : formatCurrency(p.value, curr)}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="value" name="Contract Value" fill="hsl(262, 60%, 35%)" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="right" dataKey="count" name="Count" fill="hsl(188, 78%, 32%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                  <RefreshCw className="h-8 w-8 text-muted-foreground/40" />
                  <p>No contracts expiring in the next 6 months</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-5">
          <Card className="h-full" data-testid="card-top-contracts">
            <CardHeader className="px-3 py-2 pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Top Contracts by Value
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {contractPipeline?.topContracts?.length ? (
                <div className="space-y-2">
                  {contractPipeline.topContracts.map((c: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{c.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{c.supplier}</p>
                        {c.department && <p className="text-[10px] text-muted-foreground">{c.department}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold">{formatCurrency(c.value, curr)}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColor[c.status] || "text-muted-foreground bg-muted"}`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No contracts found</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

const severityConfig: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" },
  low: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" },
  critical: { bg: "bg-red-600/15", text: "text-red-700 dark:text-red-400", border: "border-red-300 dark:border-red-700" },
};

const priorityConfig: Record<string, { bg: string; text: string }> = {
  immediate: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400" },
  "short-term": { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" },
  "long-term": { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400" },
};

const effortConfig: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-green-500/10", text: "text-green-700 dark:text-green-400" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" },
  high: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400" },
};

function HealthScoreRing({ score, label, size = "sm" }: { score: number; label: string; size?: "sm" | "lg" }) {
  const strokeColor = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const textColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600";
  const dim = size === "lg" ? 96 : 56;
  const strokeW = size === "lg" ? 6 : 4;
  const r = (dim - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const fontSize = size === "lg" ? "text-2xl" : "text-sm";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="transform -rotate-90">
          <circle cx={dim / 2} cy={dim / 2} r={r} stroke="currentColor" strokeWidth={strokeW} fill="none" className="text-muted/20" />
          <circle cx={dim / 2} cy={dim / 2} r={r} stroke={strokeColor} strokeWidth={strokeW} fill="none"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-in-out" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${fontSize} font-bold ${textColor}`}>{score}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

function MetricPill({ icon: Icon, value, label, color }: { icon: any; value: string | number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-card" data-testid={`metric-pill-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className={`p-1.5 rounded-md ${color}`}>
        <Icon className="h-3.5 w-3.5 text-white" />
      </div>
      <div>
        <p className="text-sm font-bold leading-none">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function AIInsightsTab({ entity, year, curr }: { entity: string; year: string; curr: string }) {
  const params = new URLSearchParams();
  if (year !== "all") params.set("year", year);
  if (entity !== "all") params.set("orgId", entity);
  params.set("currency", curr);
  const qp = `?${params.toString()}`;

  const { data: insights, isLoading, error, refetch, isFetching } = useQuery<any>({
    queryKey: ["/api/spend-analysis/ai-insights", year, entity, curr],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spend-analysis/ai-insights${qp}`);
      if (!res.ok) throw new Error("Failed to fetch AI insights");
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <Brain className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-base">Analyzing procurement data...</p>
          <p className="text-sm text-muted-foreground mt-1">AI is reviewing spend patterns, risks, and opportunities</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div className="text-center">
          <p className="font-semibold text-sm">Unable to generate insights</p>
          <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-retry-insights">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try Again
        </Button>
      </div>
    );
  }

  if (!insights) return null;

  const hs = insights.healthScore || {};

  const dc = insights.dataContext || {};
  const pulseMetrics = [
    { icon: GitPullRequest, value: `${dc.prConversionRate ?? 0}%`, label: "PR-to-PO Rate", color: "bg-violet-600" },
    { icon: FileCheck, value: `${dc.invoiceMatchRate ?? 0}%`, label: "Invoice Match", color: "bg-blue-600" },
    { icon: Truck, value: `${dc.grnRejectionRate ?? 0}%`, label: "GRN Rejection", color: dc.grnRejectionRate > 5 ? "bg-red-600" : "bg-emerald-600" },
    { icon: Clock, value: `${dc.avgPaymentCycleDays ?? 0}d`, label: "Payment Cycle", color: "bg-amber-600" },
    { icon: CircleDollarSign, value: formatCurrency(dc.totalSpend || 0, curr), label: "Total Spend", color: "bg-indigo-600" },
    { icon: Activity, value: `${dc.sourcingSavingsPercent ?? 0}%`, label: "Sourcing Savings", color: dc.sourcingSavingsPercent > 0 ? "bg-emerald-600" : "bg-red-600" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            AI-powered analysis of your procurement data. Insights are generated from real transactional data.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="btn-refresh-insights">
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-testid="procurement-pulse">
        {pulseMetrics.map((m) => (
          <MetricPill key={m.label} icon={m.icon} value={m.value} label={m.label} color={m.color} />
        ))}
      </div>

      <div className="grid grid-cols-12 gap-2.5">
        <div className="col-span-12 md:col-span-8">
          <Card data-testid="card-executive-summary">
            <CardHeader className="px-4 py-3 pb-1.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {insights.organizationProfile && (
                <div className="p-3 rounded-md bg-primary/5 border border-primary/10 mb-3" data-testid="org-profile-insight">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">Organization Profile</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{insights.organizationProfile}</p>
                </div>
              )}
              <p className="text-sm leading-relaxed text-muted-foreground">{insights.executiveSummary}</p>
              {dc.poCount != null && (
                <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t">
                  <div className="text-xs">
                    <span className="text-muted-foreground">POs: </span>
                    <span className="font-semibold">{formatNumber(dc.poCount)}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Suppliers: </span>
                    <span className="font-semibold">{dc.supplierCount}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Invoices: </span>
                    <span className="font-semibold">{formatNumber(dc.invoiceCount)}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">PRs: </span>
                    <span className="font-semibold">{formatNumber(dc.prCount || 0)}</span>
                  </div>
                  {dc.totalBids > 0 && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Bids: </span>
                      <span className="font-semibold">{formatNumber(dc.totalBids)}</span>
                    </div>
                  )}
                  <div className="text-xs">
                    <span className="text-muted-foreground">GRN Lines: </span>
                    <span className="font-semibold">{formatNumber(dc.grnLines || 0)}</span>
                  </div>
                  {dc.activeContracts > 0 && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Active Contracts: </span>
                      <span className="font-semibold">{formatNumber(dc.activeContracts)}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-4">
          <Card data-testid="card-health-score">
            <CardHeader className="px-4 py-3 pb-1.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4.5 w-4.5 text-primary" />
                Procurement Health
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="flex items-center justify-center mb-3">
                <HealthScoreRing score={hs.overall || 0} label="Overall Score" size="lg" />
              </div>
              <div className="grid grid-cols-5 gap-1">
                <HealthScoreRing score={hs.spending || 0} label="Spend" />
                <HealthScoreRing score={hs.supplierRisk || 0} label="Supplier" />
                <HealthScoreRing score={hs.paymentDiscipline || 0} label="Payments" />
                <HealthScoreRing score={hs.budgetCompliance || 0} label="Budget" />
                <HealthScoreRing score={hs.sourcingEfficiency || 0} label="Sourcing" />
                <HealthScoreRing score={hs.contractCompliance || 0} label="Contracts" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2.5">
        <div className="col-span-12 md:col-span-6">
          <Card data-testid="card-spend-anomalies">
            <CardHeader className="px-4 py-3 pb-1.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
                Spend Anomalies
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="space-y-2.5">
                {(insights.spendAnomalies || []).map((a: any, i: number) => {
                  const sev = severityConfig[a.severity] || severityConfig.medium;
                  return (
                    <div key={i} className={`p-3 rounded-lg border ${sev.border} ${sev.bg}`} data-testid={`anomaly-${i}`}>
                      <div className="flex items-start gap-3">
                        {a.keyMetric && (
                          <div className="flex flex-col items-center justify-center min-w-[60px] py-1">
                            <span className={`text-xl font-bold ${sev.text} leading-none`}>{a.keyMetric.value}</span>
                            <span className="text-[11px] text-muted-foreground mt-1 text-center leading-tight">{a.keyMetric.label}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="text-sm font-semibold">{a.title}</h4>
                            <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${sev.text} border-current shrink-0`}>
                              {a.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1.5">{a.description}</p>
                          {a.impact && (
                            <p className="text-[11px] font-medium mb-1">
                              <span className="text-muted-foreground">Impact: </span>{a.impact}
                            </p>
                          )}
                          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-current/10">
                            <ChevronRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-[11px] text-primary font-medium">{a.recommendation}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-6">
          <Card data-testid="card-savings-opportunities">
            <CardHeader className="px-4 py-3 pb-1.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <DollarSign className="h-4.5 w-4.5 text-green-600" />
                Savings Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="space-y-2.5">
                {(insights.savingsOpportunities || []).map((s: any, i: number) => {
                  const eff = effortConfig[s.effort] || effortConfig.medium;
                  return (
                    <div key={i} className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-500/5" data-testid={`saving-${i}`}>
                      <div className="flex items-start gap-3">
                        {s.keyMetric && (
                          <div className="flex flex-col items-center justify-center min-w-[60px] py-1">
                            <span className="text-xl font-bold text-green-700 dark:text-green-400 leading-none">{s.keyMetric.value}</span>
                            <span className="text-[11px] text-muted-foreground mt-1 text-center leading-tight">{s.keyMetric.label}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="text-sm font-semibold">{s.title}</h4>
                            <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${eff.text} border-current shrink-0`}>
                              {s.effort} effort
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1.5">{s.description}</p>
                          {s.estimatedSavings && (
                            <p className="text-[11px] font-semibold text-green-700 dark:text-green-400 mb-1">
                              Potential Savings: {s.estimatedSavings}
                            </p>
                          )}
                          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-green-200/50 dark:border-green-800/50">
                            <ChevronRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-[11px] text-primary font-medium">{s.recommendation}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2.5">
        <div className="col-span-12 md:col-span-6">
          <Card data-testid="card-risk-alerts">
            <CardHeader className="px-4 py-3 pb-1.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4.5 w-4.5 text-red-600" />
                Risk Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="space-y-2.5">
                {(insights.riskAlerts || []).map((r: any, i: number) => {
                  const sev = severityConfig[r.riskLevel] || severityConfig.medium;
                  const catIcons: Record<string, any> = {
                    concentration: Building2,
                    compliance: Shield,
                    financial: DollarSign,
                    operational: Package,
                    sourcing: Gavel,
                  };
                  const CatIcon = catIcons[r.category] || Shield;
                  return (
                    <div key={i} className={`p-3 rounded-lg border ${sev.border} ${sev.bg}`} data-testid={`risk-${i}`}>
                      <div className="flex items-start gap-3">
                        {r.keyMetric && (
                          <div className="flex flex-col items-center justify-center min-w-[60px] py-1">
                            <span className={`text-xl font-bold ${sev.text} leading-none`}>{r.keyMetric.value}</span>
                            <span className="text-[11px] text-muted-foreground mt-1 text-center leading-tight">{r.keyMetric.label}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5">
                              <CatIcon className={`h-4 w-4 ${sev.text}`} />
                              <h4 className="text-sm font-semibold">{r.title}</h4>
                            </div>
                            <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${sev.text} border-current shrink-0`}>
                              {r.riskLevel}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1.5">{r.description}</p>
                          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-current/10">
                            <Zap className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-[11px] text-primary font-medium">{r.mitigation}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-6">
          <Card data-testid="card-strategic-recommendations">
            <CardHeader className="px-4 py-3 pb-1.5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Lightbulb className="h-4.5 w-4.5 text-amber-500" />
                Strategic Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="space-y-2.5">
                {(insights.strategicRecommendations || []).map((r: any, i: number) => {
                  const pr = priorityConfig[r.priority] || priorityConfig["short-term"];
                  return (
                    <div key={i} className="p-3 rounded-lg border bg-card" data-testid={`recommendation-${i}`}>
                      <div className="flex items-start gap-3">
                        {r.keyMetric && (
                          <div className="flex flex-col items-center justify-center min-w-[60px] py-1">
                            <span className="text-xl font-bold text-primary leading-none">{r.keyMetric.value}</span>
                            <span className="text-[11px] text-muted-foreground mt-1 text-center leading-tight">{r.keyMetric.label}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="text-sm font-semibold">{r.title}</h4>
                            <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${pr.text} border-current shrink-0`}>
                              {r.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1.5">{r.description}</p>
                          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t">
                            <ArrowRight className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-green-700 dark:text-green-400 font-medium">{r.expectedOutcome}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {insights.generatedAt && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Analysis generated {new Date(insights.generatedAt).toLocaleString()} using AI (GPT-4o-mini). Results are cached for 15 minutes.
        </div>
      )}
    </div>
  );
}
