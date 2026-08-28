import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Package,
  PiggyBank,
  Receipt,
  RotateCcw,
  Shield,
  ShoppingCart,
  TrendingUp,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

interface PerformanceData {
  contract: {
    id: number;
    title: string;
    status: string;
    contr_ref_no: string;
    contract_amount: string;
    currency: string;
    start_date: string;
    end_date: string;
    supplier_name: string;
    department_name: string;
    owner_name: string;
    type: string;
  };
  pos: Array<{
    po_number: string;
    po_status: string;
    po_total_cost: string;
    invoiced_amount: string;
    creation_date: string;
    po_description: string;
  }>;
  invoices: Array<{
    invoice_number: string;
    invoice_status: string;
    invoice_amount: string;
    invoice_amount_paid: string;
    invoice_date: string;
    supplier_name: string;
    inv_payment_status: string;
    creation_date: string;
  }>;
  paymentTerms: Array<{
    id: number;
    name: string;
    payment_type: string;
    period: string;
    amt_milestone: string;
    pcnt_milestone: string;
  }>;
  deliverySchedules: Array<{
    id: number;
    deliverable_name: string;
    details: string;
    schedule_date: string;
    tentative_date: string;
    schedule_frequency: string;
    schedule_type: string;
    amt_milestone: string;
    pcnt_milestone: string;
  }>;
  sow: Array<{
    id: number;
    item_name: string;
    description: string;
    start_date: string;
    deliverydate: string;
    quantity: string;
    unit_cost: string;
    total_cost: string;
    uom: string;
    type: string;
    del_status: string;
    received_qty: string;
  }>;
  summary: {
    contractValue: number;
    totalPoValue: number;
    totalInvoiced: number;
    totalPaid: number;
    utilizationPct: number;
  };
  savings: {
    contractedSowValue: number;
    savingsValue: number;
    savingsPct: number;
  };
  rateCompliance: {
    violations: Array<{
      item_name: string;
      contracted_rate: number;
      actual_rate: number;
      variance_pct: number;
      po_number: string;
    }>;
    totalPoLines: number;
  };
  risk: {
    level: string;
    flags: string[];
    daysTotal: number;
    daysElapsed: number;
    daysRemaining: number | null;
    timeElapsedPct: number;
    spendPct: number;
    spendPaceDelta: number;
    overdueInvoices: number;
    poCoveragePct: number;
    isRenewable: boolean;
    inRenewalWindow: boolean;
  };
}

function statusColor(status: string) {
  const s = (status || "").toLowerCase();
  if (["approved", "active", "paid", "completed", "received"].includes(s)) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (["pending", "draft", "submitted", "partial"].includes(s)) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  if (["rejected", "cancelled", "terminated", "overdue"].includes(s)) return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  return "bg-muted text-muted-foreground";
}

function riskColor(level: string) {
  if (level === "High") return { bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: "text-red-500" };
  if (level === "Medium") return { bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: "text-amber-500" };
  return { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: "text-emerald-500" };
}

function RiskIndicatorCard({ icon: Icon, label, value, status, description }: {
  icon: any; label: string; value: string; status: "good" | "warn" | "bad" | "neutral"; description: string;
}) {
  const colors = {
    good: { card: "border-emerald-200 dark:border-emerald-800", icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
    warn: { card: "border-amber-200 dark:border-amber-800", icon: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
    bad: { card: "border-red-200 dark:border-red-800", icon: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
    neutral: { card: "border-border", icon: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  }[status];
  return (
    <Card className={`border ${colors.card}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${colors.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
            </div>
            <p className="text-sm font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
      <Icon className="h-8 w-8 opacity-25" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default function ContractPerformance({ refNo: refNoProp }: { refNo?: string }) {
  const [, navigate] = useLocation();
  const [activeRefNo] = useState(refNoProp || "");

  const { data, isLoading, error } = useQuery<PerformanceData>({
    queryKey: ["/api/contracts/performance", activeRefNo],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/performance/${encodeURIComponent(activeRefNo)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load performance data");
      }
      return res.json();
    },
    enabled: !!activeRefNo,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const currency = data?.contract?.currency || "AED";
  const risk = data?.risk;

  return (
    <div className="p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(data?.contract?.id ? `/app/contracts/${data.contract.id}` : "/app/contracts")} data-testid="button-back-contracts">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Contract Performance</h1>
            <p className="text-xs text-muted-foreground">Financial, obligation and risk overview</p>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">{(error as Error).message}</span>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* ── Contract Header Card ── */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{data.contract.contr_ref_no}</p>
                  <h2 className="text-base font-semibold leading-tight">{data.contract.title}</h2>
                </div>
                <Badge className={statusColor(data.contract.status)}>{data.contract.status}</Badge>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{data.contract.supplier_name || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{data.contract.owner_name || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{formatDate(data.contract.start_date)} - {formatDate(data.contract.end_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{data.contract.department_name || data.contract.type || "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Main Tabs ── */}
          <Tabs defaultValue="financials">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="financials" data-testid="tab-financials" className="gap-2">
                <DollarSign className="h-3.5 w-3.5" />
                Financials
              </TabsTrigger>
              <TabsTrigger value="obligations" data-testid="tab-obligations" className="gap-2">
                <ClipboardList className="h-3.5 w-3.5" />
                Obligations
              </TabsTrigger>
              <TabsTrigger value="risk" data-testid="tab-risk" className="gap-2">
                <Shield className="h-3.5 w-3.5" />
                Risk
              </TabsTrigger>
            </TabsList>

            {/* ══ FINANCIALS TAB ══ */}
            <TabsContent value="financials" className="mt-4 space-y-4">
              {/* Summary metric cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { icon: DollarSign, label: "Contract Value", value: formatCurrency(data.summary.contractValue, currency), color: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" },
                  { icon: ShoppingCart, label: "POs Raised", value: formatCurrency(data.summary.totalPoValue, currency), sub: `${data.pos.length} order${data.pos.length !== 1 ? "s" : ""}`, color: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300" },
                  { icon: Receipt, label: "Total Invoiced", value: formatCurrency(data.summary.totalInvoiced, currency), sub: `${data.invoices.length} invoice${data.invoices.length !== 1 ? "s" : ""}`, color: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300" },
                  { icon: TrendingUp, label: "Total Paid", value: formatCurrency(data.summary.totalPaid, currency), color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300" },
                ].map(({ icon: Icon, label, value, sub, color }) => (
                  <Card key={label}>
                    <CardContent className="p-3 flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-md shrink-0 ${color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] leading-none text-muted-foreground mb-1">{label}</p>
                        <p className="text-sm font-bold leading-none truncate">{value}</p>
                        {sub && <p className="text-[11px] leading-none text-muted-foreground mt-1">{sub}</p>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Spend utilization bar */}
              {data.summary.contractValue > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Spend Utilization</span>
                      <span className="text-sm font-semibold">{data.summary.utilizationPct}%</span>
                    </div>
                    <Progress value={data.summary.utilizationPct} className="h-2" />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>{formatCurrency(data.summary.totalInvoiced, currency)} invoiced</span>
                      <span>{formatCurrency(data.summary.contractValue, currency)} total</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Savings Realization */}
              {data.savings && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <PiggyBank className="h-4 w-4 text-primary" />
                      Savings Realization
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {data.savings.contractedSowValue > 0 ? (
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1">SOW Contracted Value</p>
                          <p className="text-sm font-bold">{formatCurrency(data.savings.contractedSowValue, currency)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1">Actual PO Spend</p>
                          <p className="text-sm font-bold">{formatCurrency(data.summary.totalPoValue, currency)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1">Savings / Variance</p>
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-bold ${data.savings.savingsValue >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {formatCurrency(Math.abs(data.savings.savingsValue), currency)}
                            </p>
                            <Badge variant="outline" className={`text-[10px] border-0 ${data.savings.savingsValue >= 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                              {data.savings.savingsValue >= 0 ? "↓" : "↑"} {Math.abs(data.savings.savingsPct)}%
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{data.savings.savingsValue >= 0 ? "under contracted value" : "over contracted value"}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">No SOW line items with cost data to compute savings. Add unit costs to Scope of Work items to enable this metric.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Rate Compliance */}
              {data.rateCompliance && data.rateCompliance.totalPoLines > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 text-primary" />
                      Rate Compliance
                      {data.rateCompliance.violations.length > 0 ? (
                        <Badge className="ml-auto bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">
                          {data.rateCompliance.violations.length} violation{data.rateCompliance.violations.length !== 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge className="ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0">All rates compliant</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {data.rateCompliance.violations.length === 0 ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>All {data.rateCompliance.totalPoLines} PO line item{data.rateCompliance.totalPoLines !== 1 ? "s" : ""} are priced within contracted rates.</span>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>PO Number</TableHead>
                            <TableHead className="text-right">Contracted Rate</TableHead>
                            <TableHead className="text-right">Actual Rate</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.rateCompliance.violations.map((v, i) => (
                            <TableRow key={i} data-testid={`row-rate-violation-${i}`}>
                              <TableCell className="font-medium max-w-[160px] truncate">{v.item_name || "—"}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{v.po_number || "—"}</TableCell>
                              <TableCell className="text-right">{formatCurrency(v.contracted_rate, currency)}</TableCell>
                              <TableCell className="text-right font-medium text-red-600 dark:text-red-400">{formatCurrency(v.actual_rate, currency)}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">+{v.variance_pct}%</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* PO & Invoice sub-tabs */}
              <Tabs defaultValue="pos">
                <TabsList>
                  <TabsTrigger value="pos" data-testid="tab-purchase-orders">
                    Purchase Orders ({data.pos.length})
                  </TabsTrigger>
                  <TabsTrigger value="invoices" data-testid="tab-invoices">
                    Invoices ({data.invoices.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pos" className="mt-4">
                  <Card>
                    <CardContent className="p-0">
                      {data.pos.length === 0 ? <EmptyState icon={ShoppingCart} message="No purchase orders linked to this contract" /> : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>PO Number</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">PO Value</TableHead>
                              <TableHead className="text-right">Invoiced</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.pos.map((po, i) => (
                              <TableRow key={i} data-testid={`row-po-${po.po_number}`}>
                                <TableCell className="font-medium">{po.po_number || "—"}</TableCell>
                                <TableCell className="text-muted-foreground max-w-[200px] truncate">{po.po_description || "—"}</TableCell>
                                <TableCell><Badge variant="outline" className={statusColor(po.po_status)}>{po.po_status || "—"}</Badge></TableCell>
                                <TableCell className="text-muted-foreground">{formatDate(po.creation_date)}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(po.po_total_cost, currency)}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{formatCurrency(po.invoiced_amount, currency)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="invoices" className="mt-4">
                  <Card>
                    <CardContent className="p-0">
                      {data.invoices.length === 0 ? <EmptyState icon={Receipt} message="No invoices linked to this contract" /> : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice No.</TableHead>
                              <TableHead>Supplier</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Payment</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">Paid</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.invoices.map((inv, i) => (
                              <TableRow key={i} data-testid={`row-invoice-${inv.invoice_number}`}>
                                <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                                <TableCell className="text-muted-foreground truncate max-w-[140px]">{inv.supplier_name || "—"}</TableCell>
                                <TableCell><Badge variant="outline" className={statusColor(inv.invoice_status)}>{inv.invoice_status || "—"}</Badge></TableCell>
                                <TableCell><Badge variant="outline" className={statusColor(inv.inv_payment_status)}>{inv.inv_payment_status || "—"}</Badge></TableCell>
                                <TableCell className="text-muted-foreground">{formatDate(inv.invoice_date || inv.creation_date)}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(inv.invoice_amount, currency)}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{formatCurrency(inv.invoice_amount_paid, currency)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ══ OBLIGATIONS TAB ══ */}
            <TabsContent value="obligations" className="mt-3 space-y-3">

              {/* Scope of Work — full detail table */}
              <Card>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Scope of Work
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{data.sow.length} item{data.sow.length !== 1 ? "s" : ""}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {data.sow.length === 0 ? <EmptyState icon={Package} message="No scope of work items defined for this contract" /> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item / Description</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>UOM</TableHead>
                          <TableHead className="text-right">Unit Cost</TableHead>
                          <TableHead className="text-right">Qty (Rcvd / Total)</TableHead>
                          <TableHead className="text-right">Total Value</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Completion</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.sow.map((item) => {
                          const qty = parseFloat(item.quantity || "0");
                          const received = parseFloat(item.received_qty || "0");
                          const pct = qty > 0 ? Math.min(100, Math.round((received / qty) * 100)) : 0;
                          const hasQtyTracking = qty > 0 && item.received_qty !== null;
                          return (
                            <TableRow key={item.id} data-testid={`row-sow-${item.id}`}>
                              <TableCell className="font-medium max-w-[180px]">
                                <p className="truncate">{item.item_name || "—"}</p>
                                {item.description && item.description !== item.item_name && (
                                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">{item.type || "—"}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{item.uom || "—"}</TableCell>
                              <TableCell className="text-right text-xs">{item.unit_cost ? formatCurrency(item.unit_cost, currency) : "—"}</TableCell>
                              <TableCell className="text-right text-xs">
                                {hasQtyTracking ? `${received} / ${qty}` : qty > 0 ? qty : "—"}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium">{item.total_cost ? formatCurrency(item.total_cost, currency) : "—"}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{formatDate(item.deliverydate)}</TableCell>
                              <TableCell>
                                {item.del_status ? (
                                  <Badge className={`border-0 text-[10px] ${statusColor(item.del_status)}`}>{item.del_status}</Badge>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-right">
                                {hasQtyTracking ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="text-xs font-semibold">{pct}%</span>
                                    <div className="w-14">
                                      <Progress value={pct} className="h-1.5" />
                                    </div>
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Payment Terms */}
              <Card>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Payment Terms
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {data.paymentTerms.length === 0 ? <EmptyState icon={CreditCard} message="No payment terms defined for this contract" /> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Milestone %</TableHead>
                          <TableHead className="text-right">Milestone Amt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.paymentTerms.map((pt) => (
                          <TableRow key={pt.id} data-testid={`row-payment-term-${pt.id}`}>
                            <TableCell className="font-medium">{pt.name || "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{pt.payment_type || "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{pt.period || "—"}</TableCell>
                            <TableCell className="text-right text-xs">{pt.pcnt_milestone ? `${pt.pcnt_milestone}%` : "—"}</TableCell>
                            <TableCell className="text-right font-medium text-xs">{formatCurrency(pt.amt_milestone, currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Delivery Schedules */}
              <Card>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    Delivery Schedules
                    {data.deliverySchedules.length > 0 && (() => {
                      const today = new Date();
                      const overdue = data.deliverySchedules.filter(ds => {
                        const d = ds.schedule_date || ds.tentative_date;
                        return d && new Date(d) < today;
                      }).length;
                      return overdue > 0 ? (
                        <Badge className="ml-auto bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">{overdue} overdue</Badge>
                      ) : null;
                    })()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  {data.deliverySchedules.length === 0 ? <EmptyState icon={Truck} message="No delivery schedules defined for this contract" /> : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Deliverable</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Scheduled Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Milestone %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.deliverySchedules.map((ds) => {
                          const schedDate = ds.schedule_date || ds.tentative_date;
                          const isPast = schedDate && new Date(schedDate) < new Date();
                          const schedStatus = isPast ? "Overdue" : "Upcoming";
                          return (
                            <TableRow key={ds.id} data-testid={`row-delivery-${ds.id}`}>
                              <TableCell className="font-medium">{ds.deliverable_name || ds.details || "—"}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{ds.schedule_type || ds.schedule_frequency || "—"}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{formatDate(schedDate)}</TableCell>
                              <TableCell>
                                <Badge className={schedStatus === "Overdue"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0"
                                  : "bg-muted text-muted-foreground border-0"}>
                                  {schedDate ? schedStatus : "No date set"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs">{ds.pcnt_milestone ? `${ds.pcnt_milestone}%` : "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

            </TabsContent>

            {/* ══ RISK TAB ══ */}
            <TabsContent value="risk" className="mt-4 space-y-4">
              {risk && (() => {
                const rc = riskColor(risk.level);
                const RiskIcon = risk.level === "High" ? XCircle : risk.level === "Medium" ? AlertTriangle : CheckCircle2;

                const expiryStatus = risk.daysRemaining === null ? "neutral" : risk.daysRemaining < 30 ? "bad" : risk.daysRemaining < 90 ? "warn" : "good";
                const paceStatus = risk.timeElapsedPct === 0 ? "neutral" : risk.spendPaceDelta > 40 ? "warn" : "good";
                const invoiceStatus = risk.overdueInvoices > 2 ? "bad" : risk.overdueInvoices > 0 ? "warn" : "good";
                const engagementStatus = data.pos.length === 0 && risk.timeElapsedPct > 20 ? "warn" : data.pos.length > 0 ? "good" : "neutral";

                const signalColors = {
                  good: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", icon: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", label: "Healthy" },
                  warn: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", icon: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label: "Needs Attention" },
                  bad: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", icon: "text-red-600 dark:text-red-400", dot: "bg-red-500", label: "At Risk" },
                  neutral: { bg: "bg-muted", text: "text-muted-foreground", icon: "text-muted-foreground", dot: "bg-muted-foreground", label: "No Data" },
                };

                return (
                  <>
                    {/* ── Overall Health Score ── */}
                    <Card className={`border-2 ${rc.border} ${rc.bg}`}>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-5">
                          <div className={`h-16 w-16 rounded-full flex items-center justify-center shrink-0 ${rc.bg} border-2 ${rc.border}`}>
                            <RiskIcon className={`h-8 w-8 ${rc.icon}`} />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Contract Health</p>
                            <h3 className={`text-2xl font-bold ${rc.icon}`}>{risk.level} Risk</h3>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {risk.flags.length === 0
                                ? "No issues detected. This contract is performing well."
                                : `${risk.flags.length} issue${risk.flags.length > 1 ? "s" : ""} flagged that require attention.`}
                            </p>
                          </div>
                        </div>

                        {risk.flags.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-border/50 space-y-1.5">
                            {risk.flags.map((f, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                                <span className="text-sm text-muted-foreground">{f}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* ── 4 Health Signal Cards ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                      {/* Contract Lifespan */}
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Clock className={`h-4 w-4 ${signalColors[expiryStatus].icon}`} />
                            <span className="text-sm font-medium">Contract Lifespan</span>
                            <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${signalColors[expiryStatus].bg} ${signalColors[expiryStatus].text}`}>
                              {signalColors[expiryStatus].label}
                            </span>
                          </div>
                          {risk.daysTotal > 0 ? (
                            <>
                              <Progress value={risk.timeElapsedPct} className="h-2 mb-2" />
                              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                                <span>{formatDate(data.contract.start_date)}</span>
                                <span>{formatDate(data.contract.end_date)}</span>
                              </div>
                              <p className="text-sm font-semibold">
                                {risk.daysRemaining === 0 ? "Expired" : `${risk.daysRemaining} days remaining`}
                              </p>
                              <p className="text-xs text-muted-foreground">{risk.daysElapsed} of {risk.daysTotal} days elapsed ({risk.timeElapsedPct}%)</p>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">No contract dates set</p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Spend Velocity */}
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Activity className={`h-4 w-4 ${signalColors[paceStatus].icon}`} />
                            <span className="text-sm font-medium">Spend Velocity</span>
                            <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${signalColors[paceStatus].bg} ${signalColors[paceStatus].text}`}>
                              {signalColors[paceStatus].label}
                            </span>
                          </div>
                          {risk.timeElapsedPct > 0 ? (
                            <>
                              <div className="space-y-2 mb-2">
                                <div>
                                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>Time elapsed</span><span>{risk.timeElapsedPct}%</span>
                                  </div>
                                  <Progress value={risk.timeElapsedPct} className="h-1.5" />
                                </div>
                                <div>
                                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>Budget spent</span><span>{risk.spendPct}%</span>
                                  </div>
                                  <Progress value={risk.spendPct} className="h-1.5" />
                                </div>
                              </div>
                              <p className="text-sm font-semibold">
                                {risk.spendPaceDelta > 40 ? "Underspending" : risk.spendPaceDelta < -10 ? "Overspending" : "On Track"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {risk.spendPaceDelta > 40
                                  ? `Spend (${risk.spendPct}%) is lagging behind time (${risk.timeElapsedPct}%)`
                                  : risk.spendPaceDelta < -10
                                  ? `Spend (${risk.spendPct}%) is ahead of time elapsed (${risk.timeElapsedPct}%)`
                                  : "Spend and time are in balance"}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">Contract has not started yet</p>
                          )}
                        </CardContent>
                      </Card>

                      {/* SOW / Delivery Compliance */}
                      {(() => {
                        const today = new Date();
                        const sowItems = data.sow;
                        const delivItems = data.deliverySchedules;
                        const overdueDeliveries = delivItems.filter(ds => {
                          const d = ds.schedule_date || ds.tentative_date;
                          return d && new Date(d) < today;
                        }).length;
                        const totalScheduled = delivItems.length;
                        const delivStatus = totalScheduled === 0 ? "neutral" : overdueDeliveries > 2 ? "bad" : overdueDeliveries > 0 ? "warn" : "good";
                        return (
                          <Card>
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <Package className={`h-4 w-4 ${signalColors[delivStatus].icon}`} />
                                <span className="text-sm font-medium">Delivery Compliance</span>
                                <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${signalColors[delivStatus].bg} ${signalColors[delivStatus].text}`}>
                                  {signalColors[delivStatus].label}
                                </span>
                              </div>
                              {totalScheduled === 0 ? (
                                <>
                                  <p className="text-sm font-semibold mb-0.5">{sowItems.length} SOW item{sowItems.length !== 1 ? "s" : ""} defined</p>
                                  <p className="text-xs text-muted-foreground">No delivery schedules configured yet. Add them to track compliance.</p>
                                </>
                              ) : (
                                <>
                                  <div className="space-y-1 mb-2">
                                    {overdueDeliveries > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Overdue deliveries</span>
                                        <span className="font-medium text-red-600">{overdueDeliveries}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Total scheduled</span>
                                      <span className="font-medium">{totalScheduled}</span>
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {overdueDeliveries === 0
                                      ? "All delivery schedules are on track"
                                      : `${overdueDeliveries} delivery batch${overdueDeliveries !== 1 ? "es" : ""} past scheduled date — see Obligations tab`}
                                  </p>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })()}

                      {/* Payment Health */}
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Receipt className={`h-4 w-4 ${signalColors[invoiceStatus].icon}`} />
                            <span className="text-sm font-medium">Payment Health</span>
                            <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${signalColors[invoiceStatus].bg} ${signalColors[invoiceStatus].text}`}>
                              {signalColors[invoiceStatus].label}
                            </span>
                          </div>
                          <p className="text-sm font-semibold mb-0.5">
                            {risk.overdueInvoices === 0
                              ? data.invoices.length === 0 ? "No invoices yet" : "All payments settled"
                              : `${risk.overdueInvoices} invoice${risk.overdueInvoices !== 1 ? "s" : ""} awaiting payment`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {risk.overdueInvoices === 0
                              ? data.invoices.length === 0
                                ? "No invoices have been raised on this contract"
                                : "All received invoices have been settled"
                              : "Outstanding invoices may affect supplier relationship"}
                          </p>
                        </CardContent>
                      </Card>

                      {/* Renewal Status */}
                      {(() => {
                        const renewalStatus = !risk.isRenewable ? "neutral" : risk.inRenewalWindow ? "warn" : "good";
                        return (
                          <Card>
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <RotateCcw className={`h-4 w-4 ${signalColors[renewalStatus].icon}`} />
                                <span className="text-sm font-medium">Renewal Window</span>
                                <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${signalColors[renewalStatus].bg} ${signalColors[renewalStatus].text}`}>
                                  {risk.isRenewable ? (risk.inRenewalWindow ? "Decision Needed" : "Renewable") : "Non-Renewable"}
                                </span>
                              </div>
                              {risk.isRenewable ? (
                                <>
                                  <p className="text-sm font-semibold mb-0.5">
                                    {risk.inRenewalWindow
                                      ? `Renewal decision window — ${risk.daysRemaining} day${risk.daysRemaining !== 1 ? "s" : ""} remaining`
                                      : `Renewable contract — ${risk.daysRemaining !== null ? `${risk.daysRemaining} days to expiry` : "no end date set"}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {risk.inRenewalWindow
                                      ? "Contract expires within 90 days. Review renewal terms and initiate opt-in or opt-out."
                                      : "Contract is eligible for renewal. No immediate action required."}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm font-semibold mb-0.5">Not renewable</p>
                                  <p className="text-xs text-muted-foreground">This contract does not include a renewal option. Plan for re-tendering before expiry.</p>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })()}
                    </div>
                  </>
                );
              })()}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
