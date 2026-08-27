import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ArrowLeft,
  BarChart2,
  BarChart3,
  Bookmark,
  BookmarkPlus,
  Boxes,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Columns,
  DollarSign,
  FileBarChart,
  FileDown,
  FileText,
  Filter,
  Hash,
  Loader2,
  Package,
  Receipt,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
  type LucideIcon
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Sector,
  XAxis,
  YAxis
} from "recharts";
import { useLocation, useRoute } from "wouter";
import * as XLSX from "xlsx";

const ICON_MAP: Record<string, LucideIcon> = {
  Truck, FileText, ShoppingCart, Receipt, Users, Wallet, Package, Boxes, FileBarChart,
};

const ICON_COLORS: Record<string, { icon: string; bg: string }> = {
  "supplier-by-category": { icon: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" },
  "requisitions-by-item": { icon: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  "po-by-department": { icon: "text-violet-500", bg: "bg-violet-100 dark:bg-violet-900/30" },
  "invoice-summary": { icon: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30" },
  "user-report": { icon: "text-cyan-500", bg: "bg-cyan-100 dark:bg-cyan-900/30" },
  "budget-summary": { icon: "text-rose-500", bg: "bg-rose-100 dark:bg-rose-900/30" },
  "p2p-overview": { icon: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900/30" },
  "grn-report": { icon: "text-lime-500", bg: "bg-lime-100 dark:bg-lime-900/30" },
  "supplier-performance": { icon: "text-sky-500", bg: "bg-sky-100 dark:bg-sky-900/30" },
  "aging-report": { icon: "text-red-500", bg: "bg-red-100 dark:bg-red-900/30" },
  "bid-summary": { icon: "text-purple-500", bg: "bg-purple-100 dark:bg-purple-900/30" },
  "contract-register": { icon: "text-teal-500", bg: "bg-teal-100 dark:bg-teal-900/30" },
  "contract-expiry": { icon: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900/30" },
  "contract-spend": { icon: "text-indigo-500", bg: "bg-indigo-100 dark:bg-indigo-900/30" },
};

const CHART_COLORS = [
  "hsl(215, 70%, 55%)", "hsl(150, 60%, 45%)", "hsl(280, 60%, 55%)",
  "hsl(35, 80%, 50%)", "hsl(190, 70%, 45%)", "hsl(340, 65%, 55%)",
  "hsl(100, 55%, 45%)", "hsl(250, 55%, 60%)", "hsl(20, 75%, 55%)",
  "hsl(170, 60%, 40%)",
];

interface FilterDefinition {
  key: string;
  label: string;
  type: "date" | "select" | "multiselect";
  options?: string[];
}

interface ColumnDefinition {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "currency" | "status";
}

interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  filters: FilterDefinition[];
  columns: ColumnDefinition[];
}

interface ReportResult {
  definition: ReportDefinition;
  rows: Record<string, any>[];
  total: number;
  page: number;
  pageSize: number;
}

interface ReportsProps {
  rest?: string;
}

export default function Reports(props: ReportsProps) {
  const [, navigate] = useLocation();
  const [, routeParams] = useRoute("/app/reports/:rest*");

  const reportId = routeParams?.["rest*"] || props.rest || null;

  if (reportId) {
    return <ReportDetail reportId={reportId} onBack={() => navigate("/app/reports")} />;
  }

  return <ReportGallery onSelect={(id) => navigate(`/app/reports/${id}`)} />;
}

function ReportGallery({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: definitions, isLoading } = useQuery<ReportDefinition[]>({
    queryKey: ["/api/reports/definitions"],
  });

  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-reports-title">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate and export standard MIS reports</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-lg ml-3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {definitions?.map((report) => {
            const Icon = ICON_MAP[report.icon] || FileText;
            const colors = ICON_COLORS[report.id] || { icon: "text-gray-500", bg: "bg-gray-100 dark:bg-gray-800" };

            return (
              <Card
                key={report.id}
                className="hover-elevate cursor-pointer"
                onClick={() => onSelect(report.id)}
                data-testid={`card-report-${report.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold truncate">{report.name}</p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{report.description}</p>
                    </div>
                    <div className={`p-2.5 rounded-lg ${colors.bg} ml-4 shrink-0`}>
                      <Icon className={`h-5 w-5 ${colors.icon}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryInsights({ reportId, summary }: { reportId: string; summary: any }) {
  const [hiddenChartData, setHiddenChartData] = useState<Record<string, boolean>>({});
  const [hiddenSecondChartData, setHiddenSecondChartData] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeSecondIndex, setActiveSecondIndex] = useState<number | null>(null);

  if (!summary) return null;

  const kpiCards: { label: string; value: string | number; icon: LucideIcon; color: string }[] = [];
  let chartData: { name: string; value: number }[] = [];
  let chartTitle = "";
  let secondChartData: { name: string; value: number }[] = [];
  let secondChartTitle = "";

  switch (reportId) {
    case "supplier-by-category":
      kpiCards.push(
        { label: "Total Suppliers", value: summary.totalSuppliers, icon: Truck, color: "text-blue-600" },
      );
      if (summary.statusBreakdown?.length) {
        summary.statusBreakdown.forEach((s: any) => {
          kpiCards.push({ label: s.status, value: s.count, icon: Hash, color: "text-gray-600" });
        });
      }
      chartData = (summary.topCountries || []).map((c: any) => ({ name: c.country, value: c.count }));
      chartTitle = "Suppliers by Country";
      chartData = (summary.statusBreakdown || []).map((s: any) => ({ name: s.status, value: s.count }));
      chartTitle = "Suppliers by Status";
      secondChartData = (summary.topCountries || []).map((c: any) => ({ name: c.country, value: c.count }));
      secondChartTitle = "Top Countries";
      break;

    case "requisitions-by-item":
      kpiCards.push(
        { label: "Total PRs", value: summary.totalPRs, icon: FileText, color: "text-emerald-600" },
        { label: "Total Amount", value: formatCurrency(summary.totalAmount || 0, null), icon: DollarSign, color: "text-green-600" },
        { label: "Avg Amount", value: formatCurrency(summary.avgAmount || 0, null), icon: TrendingUp, color: "text-blue-600" },
      );
      chartData = (summary.statusBreakdown || []).map((s: any) => ({ name: s.status, value: s.count }));
      chartTitle = "PRs by Status";
      secondChartData = (summary.byDepartment || []).map((d: any) => ({ name: d.department, value: d.count }));
      secondChartTitle = "PRs by Department";
      break;

    case "po-by-department":
      kpiCards.push(
        { label: "Total POs", value: summary.totalPOs, icon: ShoppingCart, color: "text-violet-600" },
        { label: "Total Cost", value: formatCurrency(summary.totalCost || 0, null), icon: DollarSign, color: "text-green-600" },
        { label: "Avg Cost", value: formatCurrency(summary.avgCost || 0, null), icon: TrendingUp, color: "text-blue-600" },
      );
      chartData = (summary.statusBreakdown || []).map((s: any) => ({ name: s.status, value: s.count }));
      chartTitle = "POs by Status";
      secondChartData = (summary.topSuppliers || []).map((s: any) => ({ name: s.supplier, value: s.total }));
      secondChartTitle = "Top Suppliers by Spend";
      break;

    case "invoice-summary":
      kpiCards.push(
        { label: "Total Invoices", value: summary.totalInvoices, icon: Receipt, color: "text-amber-600" },
        { label: "Total Amount", value: formatCurrency(summary.totalAmount || 0, null), icon: DollarSign, color: "text-green-600" },
        { label: "Avg Amount", value: formatCurrency(summary.avgAmount || 0, null), icon: TrendingUp, color: "text-blue-600" },
      );
      chartData = (summary.statusBreakdown || []).map((s: any) => ({ name: s.status, value: s.count }));
      chartTitle = "Invoices by Status";
      secondChartData = (summary.byPaymentStatus || []).map((s: any) => ({ name: s.status || "Unknown", value: s.count }));
      secondChartTitle = "Payment Status";
      break;

    case "user-report":
      kpiCards.push(
        { label: "Total Users", value: summary.totalUsers, icon: Users, color: "text-cyan-600" },
        { label: "Active", value: summary.activeCount, icon: Hash, color: "text-emerald-600" },
        { label: "Inactive", value: summary.inactiveCount, icon: Hash, color: "text-red-600" },
      );
      chartData = [
        { name: "Active", value: summary.activeCount || 0 },
        { name: "Inactive", value: summary.inactiveCount || 0 },
      ];
      chartTitle = "User Status";
      secondChartData = (summary.byDepartment || []).map((d: any) => ({ name: d.department, value: d.count }));
      secondChartTitle = "Users by Department";
      break;

    case "budget-summary":
      kpiCards.push(
        { label: "Total Budgets", value: summary.totalBudgets, icon: Wallet, color: "text-rose-600" },
        { label: "Total Budget", value: formatCurrency(summary.totalBudgetAmount || 0, null), icon: DollarSign, color: "text-green-600" },
        { label: "Consumed", value: formatCurrency(summary.totalConsumed || 0, null), icon: TrendingUp, color: "text-amber-600" },
        { label: "Utilization", value: `${(summary.utilizationPct || 0).toFixed(1)}%`, icon: BarChart3, color: "text-blue-600" },
      );
      chartData = (summary.statusBreakdown || []).map((s: any) => ({ name: s.status, value: s.count }));
      chartTitle = "Budget Status";
      secondChartData = [
        { name: "Consumed", value: summary.totalConsumed || 0 },
        { name: "Reserved", value: summary.totalReserved || 0 },
        { name: "Available", value: Math.max(0, (summary.totalBudgetAmount || 0) - (summary.totalConsumed || 0) - (summary.totalReserved || 0)) },
      ];
      secondChartTitle = "Budget Allocation";
      break;

    case "grn-report":
      kpiCards.push(
        { label: "Total GRN Lines", value: summary.totalLines, icon: Package, color: "text-lime-600" },
        { label: "Total Ordered", value: summary.totalOrdered?.toLocaleString() || "0", icon: Hash, color: "text-blue-600" },
        { label: "Total Received", value: summary.totalReceived?.toLocaleString() || "0", icon: TrendingUp, color: "text-green-600" },
        { label: "Total Rejected", value: summary.totalRejected?.toLocaleString() || "0", icon: X, color: "text-red-600" },
      );
      chartData = (summary.statusBreakdown || []).map((s: any) => ({ name: s.status, value: s.count }));
      chartTitle = "GRN by Status";
      secondChartData = (summary.topItems || []).map((i: any) => ({ name: i.item, value: parseFloat(i.qty) }));
      secondChartTitle = "Top Items by Received Qty";
      break;

    case "supplier-performance":
      kpiCards.push(
        { label: "Total Suppliers", value: summary.totalSuppliers, icon: Truck, color: "text-sky-600" },
        { label: "Avg On-Time Rate", value: `${(summary.avgOnTimeRate || 0).toFixed(1)}%`, icon: TrendingUp, color: "text-green-600" },
        { label: "Avg Rejection Rate", value: `${(summary.avgRejectionRate || 0).toFixed(1)}%`, icon: X, color: "text-red-600" },
      );
      chartData = (summary.topByOrders || []).map((s: any) => ({ name: s.supplier, value: s.count }));
      chartTitle = "Top Suppliers by POs";
      secondChartData = (summary.topByRejection || []).map((s: any) => ({ name: s.supplier, value: parseFloat(s.rate) }));
      secondChartTitle = "Highest Rejection Rates (%)";
      break;

    case "aging-report":
      kpiCards.push(
        { label: "Outstanding Invoices", value: summary.totalOutstanding, icon: Receipt, color: "text-red-600" },
        { label: "Outstanding Amount", value: formatCurrency(summary.totalOutstandingAmount || 0, null), icon: DollarSign, color: "text-amber-600" },
        { label: "Overdue Amount", value: formatCurrency(summary.overdueAmount || 0, null), icon: TrendingUp, color: "text-red-600" },
      );
      chartData = (summary.agingBuckets || []).map((b: any) => ({ name: b.bucket, value: b.count }));
      chartTitle = "Aging Distribution";
      secondChartData = (summary.topSuppliers || []).map((s: any) => ({ name: s.supplier, value: parseFloat(s.amount) }));
      secondChartTitle = "Top Suppliers by Outstanding";
      break;

    case "bid-summary":
      kpiCards.push(
        { label: "Total Bids", value: summary.totalBids, icon: FileBarChart, color: "text-purple-600" },
        { label: "Total PR Amount", value: formatCurrency(summary.totalPRAmount || 0, null), icon: DollarSign, color: "text-blue-600" },
        { label: "Total Awarded", value: formatCurrency(summary.totalAwarded || 0, null), icon: DollarSign, color: "text-green-600" },
        { label: "Total Savings", value: formatCurrency(summary.totalSavings || 0, null), icon: TrendingUp, color: "text-emerald-600" },
      );
      chartData = (summary.statusBreakdown || []).map((s: any) => ({ name: s.status, value: s.count }));
      chartTitle = "Bids by Status";
      secondChartData = (summary.byType || []).map((t: any) => ({ name: t.type, value: t.count }));
      secondChartTitle = "Bids by Type";
      break;

    case "contract-register":
      kpiCards.push(
        { label: "Total Contracts", value: summary.totalContracts, icon: FileText, color: "text-teal-600" },
        { label: "Total Value", value: formatCurrency(summary.totalValue || 0, null), icon: DollarSign, color: "text-green-600" },
        { label: "Avg Value", value: formatCurrency(summary.avgValue || 0, null), icon: TrendingUp, color: "text-blue-600" },
      );
      chartData = (summary.statusBreakdown || []).map((s: any) => ({ name: s.status, value: s.count }));
      chartTitle = "Contracts by Status";
      break;

    case "contract-expiry":
      kpiCards.push(
        { label: "Total Contracts", value: summary.totalContracts, icon: CalendarClock, color: "text-orange-600" },
        { label: "Total Value", value: formatCurrency(summary.totalValue || 0, null), icon: DollarSign, color: "text-green-600" },
        { label: "Renewable", value: summary.renewableCount, icon: TrendingUp, color: "text-emerald-600" },
      );
      chartData = (summary.byExpiryBucket || []).map((b: any) => ({ name: b.bucket, value: b.count }));
      chartTitle = "Contracts by Expiry Window";
      break;
    case "contract-spend":
      kpiCards.push(
        { label: "Total Contracts", value: summary.totalContracts, icon: BarChart2, color: "text-indigo-600" },
        { label: "Contract Value", value: formatCurrency(summary.totalContractValue || 0, null), icon: DollarSign, color: "text-green-600" },
        { label: "Total Invoiced", value: formatCurrency(summary.totalInvoiced || 0, null), icon: Receipt, color: "text-amber-600" },
        { label: "Utilization", value: `${(summary.overallUtilization || 0).toFixed(1)}%`, icon: TrendingUp, color: "text-blue-600" },
      );
      chartData = (summary.byDepartment || []).map((d: any) => ({ name: d.department, value: d.contractValue }));
      chartTitle = "Contract Value by Department";
      break;

  }

  const filteredChartData = chartData.filter((d) => !hiddenChartData[d.name]);
  const filteredSecondChartData = secondChartData.filter((d) => !hiddenSecondChartData[d.name]);
  const hasCharts = chartData.length > 0 || secondChartData.length > 0;
  const getChartHeight = (dataLength: number) => {
    if (dataLength <= 3) return 180;
    if (dataLength <= 6) return 230;
    return 260;
  };

  return (
    <div className="space-y-3">
      {kpiCards.length > 0 && (
        <div className={`grid gap-3 ${kpiCards.length <= 3 ? "grid-cols-3" : "grid-cols-4"}`}>
          {kpiCards.map((card, i) => {
            const KpiIcon = card.icon;
            return (
              <Card key={i}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                      <p className="text-lg font-bold mt-0.5" data-testid={`kpi-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>{card.value}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/50">
                      <KpiIcon className={`h-4 w-4 ${card.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {hasCharts && (
        <div className={`grid gap-3 ${secondChartData.length > 0 && chartData.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
          {chartData.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <p className="text-sm font-medium mb-2">{chartTitle}</p>
                <div className={`h-[${getChartHeight(chartData.length)}px]`}>
                  {chartData.length <= 6 ? (
                    <div>
                      <div className="h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 20, bottom: 10 }}>
                            <Pie
                              data={filteredChartData}
                              cx="50%"
                              cy="55%"
                              innerRadius={35}
                              outerRadius={60}
                              paddingAngle={2}
                              dataKey="value"
                              nameKey="name"
                              onMouseEnter={(_, index) => setActiveIndex(index)}
                              onMouseLeave={() => setActiveIndex(null)}
                              isAnimationActive={true}
                              animationDuration={300}
                              activeShape={(props: any) => {
                                const RADIAN = Math.PI / 180;
                                const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

                                return (
                                  <g>
                                    <Sector
                                      cx={cx}
                                      cy={cy}
                                      innerRadius={innerRadius}
                                      outerRadius={outerRadius + 1}
                                      startAngle={startAngle}
                                      endAngle={endAngle}
                                      fill={fill}
                                      style={{
                                        transition: "all 1s ease-in-out",
                                        filter: "drop-shadow(0px 2px 6px rgba(0,0,0,0.2))",
                                      }}
                                    />
                                  </g>
                                );
                              }}
                            // label={({ value }: any) => value.toLocaleString()}
                            // labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }}
                            >
                              {filteredChartData.map((d, i) => {
                                const originalIndex = chartData.findIndex((od) => od.name === d.name);
                                return <Cell
                                  key={i}
                                  fill={CHART_COLORS[originalIndex % CHART_COLORS.length]}
                                  fillOpacity={
                                    activeIndex === null || activeIndex === i
                                      ? 1
                                      : 0.25
                                  }
                                />;
                              })}
                            </Pie>
                            <RechartsTooltip formatter={(val: any) => val.toLocaleString()} contentStyle={{
                              fontSize: "11px",
                              padding: "6px 8px",
                            }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-2">
                        {chartData.map((d: any, i: number) => {
                          const isHidden = hiddenChartData[d.name];
                          return (
                            <div key={i} className={`flex items-center gap-1.5 text-[11px] cursor-pointer hover:opacity-80 transition-opacity ${isHidden ? "opacity-50" : ""}`} onClick={() => setHiddenChartData(prev => ({ ...prev, [d.name]: !prev[d.name] }))}>
                              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: isHidden ? "transparent" : CHART_COLORS[i % CHART_COLORS.length], border: isHidden ? "1px solid hsl(var(--border))" : "none" }} />
                              <span className={`text-muted-foreground ${isHidden ? "line-through" : ""}`}>{d.name}</span>
                              <span className={`text-xs text-muted-foreground ${isHidden ? "line-through" : ""}`}>({typeof d.value === 'number' ? d.value.toLocaleString() : d.value})</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                        <RechartsTooltip formatter={(val: any) => val.toLocaleString()} />
                        <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {secondChartData.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <p className="text-sm font-medium mb-2">{secondChartTitle}</p>
                <div className={`h-[${getChartHeight(secondChartData.length)}px]`}>
                  {secondChartData.length <= 5 ? (
                    <div>
                      <div className="h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 20, bottom: 10 }}>
                            <Pie
                              data={filteredSecondChartData}
                              cx="50%"
                              cy="55%"
                              innerRadius={35}
                              outerRadius={60}
                              paddingAngle={2}
                              dataKey="value"
                              nameKey="name"
                              onMouseEnter={(_, index) => setActiveSecondIndex(index)}
                              onMouseLeave={() => setActiveSecondIndex(null)}
                              isAnimationActive={true}
                              animationDuration={300}
                              activeShape={(props: any) => {
                                const RADIAN = Math.PI / 180;
                                const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

                                return (
                                  <g>
                                    <Sector
                                      cx={cx}
                                      cy={cy}
                                      innerRadius={innerRadius}
                                      outerRadius={outerRadius + 1}
                                      startAngle={startAngle}
                                      endAngle={endAngle}
                                      fill={fill}
                                      style={{
                                        transition: "all 1s ease-in-out",
                                        filter: "drop-shadow(0px 2px 6px rgba(0,0,0,0.2))",
                                      }}
                                    />
                                  </g>
                                );
                              }}
                            // label={({ value }: any) => typeof value === 'number' ? value.toLocaleString() : value}
                            // labelLine={{ strokeWidth: 1, stroke: "hsl(var(--muted-foreground))" }}
                            >
                              {filteredSecondChartData.map((d, i) => {
                                const originalIndex = secondChartData.findIndex((od) => od.name === d.name);
                                return <Cell
                                  key={i}
                                  fill={CHART_COLORS[originalIndex % CHART_COLORS.length]}
                                  fillOpacity={
                                    activeSecondIndex === null || activeSecondIndex === i
                                      ? 1
                                      : 0.25
                                  }
                                />;
                              })}
                            </Pie>
                            <RechartsTooltip formatter={(val: any) => typeof val === 'number' ? val.toLocaleString() : val} contentStyle={{
                              fontSize: "11px",
                              padding: "6px 8px",
                            }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-2">
                        {secondChartData.map((d: any, i: number) => {
                          const isHidden = hiddenSecondChartData[d.name];
                          return (
                            <div key={i} className={`flex items-center gap-1.5 text-[11px] cursor-pointer hover:opacity-80 transition-opacity ${isHidden ? "opacity-50" : ""}`} onClick={() => setHiddenSecondChartData(prev => ({ ...prev, [d.name]: !prev[d.name] }))}>
                              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: isHidden ? "transparent" : CHART_COLORS[i % CHART_COLORS.length], border: isHidden ? "1px solid hsl(var(--border))" : "none" }} />
                              <span className={`text-muted-foreground ${isHidden ? "line-through" : ""}`}>{d.name}</span>
                              <span className={`text-xs text-muted-foreground ${isHidden ? "line-through" : ""}`}>({typeof d.value === 'number' ? d.value.toLocaleString() : d.value})</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={secondChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                        <RechartsTooltip formatter={(val: any) => typeof val === 'number' ? val.toLocaleString() : val} />
                        <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

interface SavedTemplate {
  id: number;
  user_id: number;
  report_id: string;
  template_name: string;
  filters: Record<string, any>;
  created_at: string;
  updated_at: string;
}

function ReportDetail({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: definition, isLoading: defLoading } = useQuery<ReportDefinition>({
    queryKey: ["/api/reports/definitions", reportId],
  });

  const { data: filterOptions } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/reports/filters", reportId],
  });

  const { data: templates } = useQuery<SavedTemplate[]>({
    queryKey: ["/api/reports/templates", reportId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/templates?reportId=${reportId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: categoryTypeLookups = [] } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/CATEGORY_TYPE"],
  });

  const categoryTypeLookup = categoryTypeLookups.find(l => l.lookup_key === "CATEGORY");
  const isNonUnspsc = categoryTypeLookup?.lookup_value === "NON-UNSPSC";
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories"],
  });
  const { data: productCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/product-categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/product-categories");
      if (!res.ok) throw new Error("Failed to fetch product categories");
      return res.json();
    }
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async ({ name, filters: f }: { name: string; filters: Record<string, any> }) => {
      if (editingTemplateId) {
        const res = await apiRequest("PUT", `/api/reports/templates/${editingTemplateId}`, { name, filters: f });
        return res.json();
      }
      const res = await apiRequest("POST", "/api/reports/templates", { reportId, name, filters: f });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/templates", reportId] });
      setShowSaveDialog(false);
      setTemplateName("");
      setEditingTemplateId(null);
      toast({ title: editingTemplateId ? "Template updated" : "Template saved", description: "Your filter configuration has been saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save template", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/reports/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/templates", reportId] });
      toast({ title: "Template deleted" });
    },
  });

  const handleLoadTemplate = (template: SavedTemplate) => {
    setFilters(template.filters || {});
    toast({ title: "Template loaded", description: `"${template.template_name}" filters applied.` });
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    saveTemplateMutation.mutate({ name: templateName.trim(), filters });
  };

  const handleUpdateTemplate = (template: SavedTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateName(template.template_name);
    setShowSaveDialog(true);
  };

  const generateMutation = useMutation<ReportResult, Error, { page: number }>({
    mutationFn: async ({ page }) => {
      const res = await apiRequest("POST", `/api/reports/generate/${reportId}`, { ...filters, page, pageSize });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to generate report" }));
        throw new Error(err.error || "Failed to generate report");
      }
      return res.json();
    },
    onSuccess: () => {
      setHasGenerated(true);
    },
  });

  const summaryMutation = useMutation<any, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/reports/summary/${reportId}`, filters);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const handleGenerate = useCallback(() => {
    setCurrentPage(0);
    generateMutation.mutate({ page: 0 });
    summaryMutation.mutate();
  }, [filters, generateMutation, summaryMutation]);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    generateMutation.mutate({ page: newPage });
  }, [generateMutation]);

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleMultiselectToggle = (key: string, val: string) => {
    setFilters((prev) => {
      const current: string[] = prev[key] || [];
      const updated = current.includes(val)
        ? current.filter((v: string) => v !== val)
        : [...current, val];
      return { ...prev, [key]: updated };
    });
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  const handleExportAll = async () => {
    if (!definition) return;
    setIsExporting(true);

    try {
      const allRows: Record<string, any>[] = [];
      let page = 0;
      const batchSize = 200;
      let hasMore = true;

      while (hasMore) {
        const res = await apiRequest("POST", `/api/reports/generate/${reportId}`, { ...filters, page, pageSize: batchSize });
        if (!res.ok) break;
        const result = await res.json();
        allRows.push(...result.rows);
        hasMore = allRows.length < result.total;
        page++;
      }

      const exportCols = visibleColumns;
      const exportData = allRows.map((row) => {
        const obj: Record<string, any> = {};
        exportCols.forEach((col) => {
          let val = row[col.key];
          if (col.type === "currency" && val != null) {
            val = parseFloat(val);
          }
          obj[col.label] = val ?? "";
        });
        return obj;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");

      const colWidths = exportCols.map((col) => ({
        wch: Math.max(
          col.label.length + 2,
          ...exportData.slice(0, 100).map((r) => String(r[col.label] || "").length)
        ),
      }));
      ws["!cols"] = colWidths;

      const fileName = `${definition.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!definition) return;
    setIsExportingPdf(true);

    try {
      const allRows: Record<string, any>[] = [];
      let page = 0;
      const batchSize = 200;
      let hasMore = true;

      while (hasMore) {
        const res = await apiRequest("POST", `/api/reports/generate/${reportId}`, { ...filters, page, pageSize: batchSize });
        if (!res.ok) break;
        const r = await res.json();
        allRows.push(...r.rows);
        hasMore = allRows.length < r.total;
        page++;
      }

      const pdfCols = visibleColumns;
      const doc = new jsPDF({ orientation: pdfCols.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(definition.name, 14, 18);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(definition.description, 14, 24);
      doc.text(`Generated: ${formatDate(new Date())} | Total Records: ${allRows.length}`, 14, 29);
      doc.setTextColor(0);

      const headers = pdfCols.map((col) => col.label);
      const body = allRows.map((row) =>
        pdfCols.map((col) => {
          const val = row[col.key];
          if (val == null || val === "") return "-";
          if (col.type === "currency") return parseFloat(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          if (col.type === "number") return parseFloat(val).toLocaleString();
          if (col.type === "date") {
            const d = new Date(val);
            return isNaN(d.getTime()) ? String(val) : formatDate(d);
          }
          return String(val);
        })
      );

      // Dynamic font size adjustment based on column count
      let fontSize = 7;
      if (pdfCols.length > 12) fontSize = 5.5;
      else if (pdfCols.length > 8) fontSize = 6.5;

      // Define column specific styles for better space utilization
      const columnStyles: Record<string, any> = {};
      pdfCols.forEach((col, index) => {
        const labelLower = col.label.toLowerCase();
        const keyLower = col.key.toLowerCase();

        let minWidth = 10;
        let halign = "left";

        // Certain columns need more space/alignment
        if (keyLower.includes("id") || keyLower.includes("num") || keyLower.includes("code") || labelLower === "currency" || labelLower === "uom") {
          minWidth = 12;
          halign = "center";
        }
        else if (labelLower.includes("status")) {
          minWidth = 15;
          halign = "center";
        }
        else if (col.type === "number" || col.type === "currency") {
          halign = "right";
        }

        columnStyles[index] = { minCellWidth: minWidth, halign };
      });

      autoTable(doc, {
        head: [headers],
        body,
        startY: 33,
        styles: {
          fontSize: fontSize,
          cellPadding: 1.2,
          overflow: "linebreak",
          cellWidth: "auto"
        },
        columnStyles,
        headStyles: { fillColor: [99, 60, 180], textColor: 255, fontStyle: "bold", fontSize: fontSize },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        margin: { left: 10, right: 10 },
        didDrawPage: (data: any) => {
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text(`Page ${data.pageNumber} of ${pageCount}`, doc.internal.pageSize.getWidth() - 28, doc.internal.pageSize.getHeight() - 8);
          doc.text("Prokraya - Procurement Analytics", 10, doc.internal.pageSize.getHeight() - 8);
        },
      });

      const fileName = `${definition.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const visibleColumns = useMemo(() => {
    if (!definition) return [];
    return definition.columns.filter(col => !hiddenColumns.has(col.key));
  }, [definition, hiddenColumns]);

  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns(prev => {
      const totalCols = definition?.columns?.length ?? 0;
      if (totalCols === 0) return prev;
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (totalCols - next.size <= 1) return prev;
        next.add(key);
      }
      return next;
    });
  }, [definition]);

  const showAllColumns = useCallback(() => {
    setHiddenColumns(new Set());
  }, []);

  const result = generateMutation.data;
  const totalPages = result ? Math.ceil(result.total / pageSize) : 0;

  const aggregates = useMemo(() => {
    if (!result?.rows?.length || !definition) return null;
    const numericCols = definition.columns.filter(c => c.type === "currency" || c.type === "number");
    if (numericCols.length === 0) return null;

    const agg: Record<string, { sum: number; count: number }> = {};
    numericCols.forEach(col => {
      agg[col.key] = { sum: 0, count: 0 };
    });

    result.rows.forEach(row => {
      numericCols.forEach(col => {
        const val = parseFloat(row[col.key]);
        if (!isNaN(val)) {
          agg[col.key].sum += val;
          agg[col.key].count++;
        }
      });
    });

    return agg;
  }, [result, definition]);

  const formatCellValue = (value: any, type?: string) => {
    if (value == null || value === "") return "-";
    switch (type) {
      case "currency":
        return parseFloat(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case "number":
        return parseFloat(value).toLocaleString();
      case "date": {
        if (!value) return "-";
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        return formatDate(d);
      }
      case "status":
        return value;
      default:
        return String(value);
    }
  };

  const getStatusColor = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("approved") || s.includes("active") || s.includes("completed") || s.includes("paid")) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (s.includes("pending") || s.includes("draft") || s.includes("in progress") || s.includes("new")) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    if (s.includes("rejected") || s.includes("cancelled") || s.includes("inactive") || s.includes("closed")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  };

  if (defLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (!definition) {
    return (
      <div className="p-4 space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-reports">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Reports
        </Button>
        <div className="text-center py-12">
          <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="text-base font-medium mb-1">Report not found</h3>
          <p className="text-sm text-muted-foreground">The requested report could not be loaded</p>
        </div>
      </div>
    );
  }

  const Icon = ICON_MAP[definition.icon] || FileText;
  const colors = ICON_COLORS[reportId] || { icon: "text-gray-500", bg: "bg-gray-100" };
  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)
  ).length;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onBack} data-testid="button-back-to-reports">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-report-name">{definition.name}</h1>
            <p className="text-sm text-muted-foreground">{definition.description}</p>
          </div>
        </div>
        {hasGenerated && result && result.total > 0 && (
          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-column-chooser">
                  <Columns className="h-4 w-4 mr-1" />
                  Columns
                  {hiddenColumns.size > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                      {visibleColumns.length}/{definition.columns.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end" data-testid="popover-column-chooser">
                <div className="p-2.5 border-b flex items-center justify-between">
                  <span className="text-sm font-medium">Toggle Columns</span>
                  {hiddenColumns.size > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={showAllColumns} data-testid="button-show-all-columns">
                      Show All
                    </Button>
                  )}
                </div>
                <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-0.5">
                  {definition.columns.map((col) => {
                    const isVisible = !hiddenColumns.has(col.key);
                    const isLastVisible = isVisible && visibleColumns.length <= 1;
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-muted/50 transition-colors ${!isVisible ? "opacity-60" : ""
                          } ${isLastVisible ? "cursor-not-allowed" : ""}`}
                        data-testid={`column-toggle-${col.key}`}
                      >
                        <Checkbox
                          checked={isVisible}
                          disabled={isLastVisible}
                          onCheckedChange={() => toggleColumn(col.key)}
                        />
                        <span className="flex-1 truncate">{col.label}</span>
                        {col.type && (
                          <span className="text-[10px] text-muted-foreground uppercase">{col.type}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportAll}
              disabled={isExporting || isExportingPdf}
              data-testid="button-export-excel"
            >
              {isExporting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Excel...</>
              ) : (
                <><FileDown className="h-4 w-4 mr-1" /> Excel ({result.total})</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPdf}
              disabled={isExporting || isExportingPdf}
              data-testid="button-export-pdf"
            >
              {isExportingPdf ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> PDF...</>
              ) : (
                <><FileText className="h-4 w-4 mr-1" /> PDF</>
              )}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showSaveDialog} onOpenChange={(open) => { setShowSaveDialog(open); if (!open) { setEditingTemplateId(null); setTemplateName(""); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingTemplateId ? "Update Template" : "Save Filter Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Template name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); }}
              className="h-9"
              data-testid="input-template-name"
            />
            <p className="text-xs text-muted-foreground">
              {activeFilterCount > 0
                ? `This will save your current ${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""}.`
                : "No filters are currently set. The template will save an empty configuration."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveTemplate} disabled={!templateName.trim() || saveTemplateMutation.isPending} data-testid="button-confirm-save-template">
              {saveTemplateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {editingTemplateId ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {activeFilterCount > 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingTemplateId(null); setTemplateName(""); setShowSaveDialog(true); }} data-testid="button-save-template">
                    <BookmarkPlus className="h-3.5 w-3.5 mr-1" /> Save Template
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClearFilters} data-testid="button-clear-filters">
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                </>
              )}
            </div>
          </div>

          {templates && templates.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mr-1">Saved:</span>
              {templates.map((t) => (
                <div key={t.id} className="group flex items-center gap-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2 gap-1"
                    onClick={() => handleLoadTemplate(t)}
                    data-testid={`button-load-template-${t.id}`}
                  >
                    <Bookmark className="h-3 w-3" />
                    {t.template_name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleUpdateTemplate(t)}
                    data-testid={`button-update-template-${t.id}`}
                  >
                    <Save className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-500"
                    onClick={() => deleteTemplateMutation.mutate(t.id)}
                    data-testid={`button-delete-template-${t.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {definition.filters.map((filter) => {
              let options = filterOptions?.[filter.key] || filter.options || [];

              if (isNonUnspsc && filter.key === "category") {
                options = productCategories
                  .map(cat => cat.category_name || cat.categoryName || cat.name)
                  .filter(Boolean);
              }
              else if (filter.key === "category") {
                options = categories
                  .map(cat => cat.category_name || cat.categoryName || cat.name)
                  .filter(Boolean);
              }

              return (
                <FilterField
                  key={filter.key}
                  filter={filter}
                  value={filters[filter.key]}
                  options={options}
                  onChange={(val) => handleFilterChange(filter.key, val)}
                  onToggle={(val) => handleMultiselectToggle(filter.key, val)}
                />
              );
            })}
          </div>
          <div className="flex justify-end mt-3">
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              data-testid="button-generate-report"
            >
              {generateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
              ) : (
                <><Search className="h-4 w-4 mr-1" /> Generate Report</>
              )}
            </Button>
          </div>
        </div>
        <CardContent className="p-0">
          {generateMutation.isError && (
            <div className="p-3 border-b border-red-200 bg-red-50 dark:bg-red-950/20">
              <p className="text-sm text-red-600 dark:text-red-400">
                Error: {generateMutation.error?.message || "Failed to generate report"}
              </p>
            </div>
          )}

          {hasGenerated && result ? (
            result.rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="flex flex-col items-center justify-center">
                  <FileBarChart className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <h3 className="text-base font-medium mb-1">No records found</h3>
                  <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
                </div>
              </div>
            ) : (
              <>
                {summaryMutation.data && (
                  <div className="p-3 border-b">
                    <SummaryInsights reportId={reportId} summary={summaryMutation.data} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-medium w-12 text-center">#</TableHead>
                        {visibleColumns.map((col) => (
                          <TableHead
                            key={col.key}
                            className={`text-xs font-medium whitespace-nowrap ${col.type === "currency" || col.type === "number" ? "text-right" : ""}`}
                          >
                            {col.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.map((row, idx) => (
                        <TableRow key={idx} className="h-10" data-testid={`row-report-${idx}`}>
                          <TableCell className="text-sm text-center text-muted-foreground py-2">
                            {currentPage * pageSize + idx + 1}
                          </TableCell>
                          {visibleColumns.map((col) => {
                            const value = row[col.key];
                            const formattedValue = formatCellValue(value, col.type);
                            const isDescription = col.key.toLowerCase().includes("description") || col.key.toLowerCase().includes("reason");
                            const isLongText = typeof formattedValue === "string" && formattedValue.length > 40 && isDescription;

                            return (
                              <TableCell
                                key={col.key}
                                className={`text-sm whitespace-nowrap py-2 ${col.type === "currency" || col.type === "number" ? "text-right font-medium tabular-nums" : ""}`}
                                title={isLongText ? formattedValue : undefined}
                              >
                                {col.type === "status" ? (
                                  <Badge
                                    variant="secondary"
                                    className={`gap-1 ${getStatusColor(String(value || ""))}`}
                                  >
                                    {value || "-"}
                                  </Badge>
                                ) : (
                                  isLongText ? `${formattedValue.substring(0, 40)}...` : formattedValue
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                    {aggregates && (
                      <TableFooter>
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell className="text-xs text-center">Total</TableCell>
                          {visibleColumns.map((col) => (
                            <TableCell
                              key={col.key}
                              className={`text-sm whitespace-nowrap ${col.type === "currency" || col.type === "number" ? "text-right tabular-nums" : ""}`}
                            >
                              {aggregates[col.key] ? (
                                col.type === "currency"
                                  ? parseFloat(String(aggregates[col.key].sum)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  : aggregates[col.key].sum.toLocaleString()
                              ) : ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </div>

                {totalPages > 0 && (
                  <div className="flex items-center justify-between p-3 border-t">
                    <div className="text-xs text-muted-foreground">
                      Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, result.total)} of {result.total} entries
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(0); generateMutation.mutate({ page: 0 }); }}>
                        <SelectTrigger className="w-[70px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="200">200</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 0 || generateMutation.isPending}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs">
                        Page {currentPage + 1} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages - 1 || generateMutation.isPending}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )
          ) : !hasGenerated && !generateMutation.isPending ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="flex flex-col items-center justify-center">
                <FileBarChart className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <h3 className="text-base font-medium mb-1">Ready to generate</h3>
                <p className="text-sm text-muted-foreground">Set your filters and click "Generate Report" to view results</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterField({
  filter,
  value,
  options,
  onChange,
  onToggle,
}: {
  filter: FilterDefinition;
  value: any;
  options: string[];
  onChange: (val: any) => void;
  onToggle: (val: string) => void;
}) {
  if (filter.type === "date") {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{filter.label}</label>
        <Input
          type="date"
          className="h-8 text-sm"
          value={value || ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          max={new Date().toISOString().split("T")[0]}
          data-testid={`input-filter-${filter.key}`}
        />
      </div>
    );
  }

  if (filter.type === "select") {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{filter.label}</label>
        <Select value={value || ""} onValueChange={(v) => onChange(v || undefined)}>
          <SelectTrigger className="h-8 text-sm" data-testid={`select-filter-${filter.key}`}>
            <SelectValue placeholder={`All ${filter.label}`} />
          </SelectTrigger>
          <SelectContent>
            {options.filter((opt) => opt !== "").map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (filter.type === "multiselect") {
    const selected: string[] = value || [];
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {filter.label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
              {selected.length}
            </Badge>
          )}
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-left flex items-center justify-between gap-2 hover:bg-accent hover:text-accent-foreground"
              data-testid={`multiselect-filter-${filter.key}`}
            >
              <span className="truncate text-muted-foreground">
                {selected.length > 0
                  ? selected.length === 1
                    ? selected[0]
                    : `${selected.length} selected`
                  : `All ${filter.label}`}
              </span>
              <svg className="h-4 w-4 shrink-0 opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-1 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto" align="start">
            {options.filter((opt) => opt !== "").map((opt) => (
              <div
                key={opt}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                onClick={() => onToggle(opt)}
              >
                <span className={`h-3 w-3 rounded border flex items-center justify-center shrink-0 ${selected.includes(opt) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                  {selected.includes(opt) && <span className="text-[8px] text-primary-foreground">✓</span>}
                </span>
                {opt}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return null;
}
