import { StatusCountBadges } from "@/components/status-count-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

interface InvoiceHeader {
  id: number;
  invoice_number: string;
  invoice_status: string | null;
  invoice_type?: string | null;
  invoice_amount: string | number | null;
  invoice_curr_code: string | null;
  invoice_date: string | null;
  inv_due_date: string | null;
  po_number: string | null;
  supplier_name: string | null;
  supplier_id: number | null;
  description: string | null;
  department_name: string | null;
  cost_center_name: string | null;
  inv_match_status: string | null;
  inv_payment_status: string | null;
  tax_amount: string | null;
  created_by: string | null;
  creation_date: string | null;
  submitted_by: string | null;
  invoice_source: string | null;
  payment_terms_name: string | null;
  budget_name: string | null;
  invoice_approvers: string | null;
  currentApprover: string | null;
}

interface InvoicesResponse {
  data: InvoiceHeader[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  exportLines?: InvoiceExportLineRow[];
}

interface InvoiceExportLineRow {
  invoice_mst_id: number;
  invoice_number: string;
  invoice_status: string | null;
  invoice_type?: string | null;
  header_invoice_amount: string | null;
  invoice_curr_code: string | null;
  invoice_date: string | null;
  inv_due_date: string | null;
  po_number: string | null;
  supplier_name: string | null;
  department_name: string | null;
  header_description: string | null;
  submitted_by: string | null;
  line_id: number;
  line_number: number | null;
  po_line_number: string | null;
  item_name: string | null;
  order_qty: string | number | null;
  order_cost: string | number | null;
  order_unit_cost: string | number | null;
  line_status: string | null;
  receipt_num: string | null;
  tax_rate: string | null;
  tax_amount: string | null;
}

interface StatsResponse {
  total: string;
  draft: string;
  pending_approval: string;
  approved: string;
  paid: string;
  rejected: string;
  moreinfo: string;
  po: string;
  non_po: string;
  total_value: string;
}

const statusConfig: Record<
  string,
  {
    label: string;
    icon: typeof Clock;
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
> = {
  Draft: { label: "Draft", icon: FileText, variant: "secondary" },
  "Pending Approval": {
    label: "Pending Approval",
    icon: Clock,
    variant: "outline",
    className: "border-orange-300 text-orange-600 dark:text-orange-400",
  },
  Approved: { label: "Approved", icon: CheckCircle2, variant: "default" },
  Paid: {
    label: "Paid",
    icon: CreditCard,
    variant: "secondary",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  Rejected: { label: "Rejected", icon: XCircle, variant: "destructive" },
  "More Info Required": { label: "More Info Required", icon: Clock, variant: "outline", className: "border-orange-300 text-orange-600 dark:text-orange-400" },
};

function StatusBadge({ status }: { status: string | null }) {
  const config = statusConfig[status || "Draft"] || statusConfig["Draft"];
  const Icon = config.icon;
  return (
    <Badge
      variant={config.variant}
      className={`gap-1 ${config.className || ""}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default function Invoices() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  function getSearchParams(): URLSearchParams {
    if (typeof window !== "undefined" && window.location?.search) {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams(location.split("?")[1] || "");
  }

  const initialQueryParams = getSearchParams();
  const initialStatus = initialQueryParams.get("status") || "all";
  const initialSearch = initialQueryParams.get("search") || "";
  const initialPage = parseInt(initialQueryParams.get("page") || "1", 10) || 1;
  const initialLimit =
    parseInt(initialQueryParams.get("limit") || "10", 10) || 10;

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [sourceFilter, setSourceFilter] = useState<"all" | "po" | "non-po">("all");
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  // Sync filter state when location query params change (e.g. dashboard nav)
  useEffect(() => {
    const qp = getSearchParams();
    setSearch(qp.get("search") || "");
    setStatusFilter(qp.get("status") || "all");
    setPage(parseInt(qp.get("page") || "1", 10) || 1);
    setLimit(parseInt(qp.get("limit") || "10", 10) || 10);
  }, [location]);

  const isSupplierRole = useMemo(() => {
    try {
      const authData = localStorage.getItem("prokraya-auth");
      if (authData) {
        const auth = JSON.parse(authData);
        return auth.role === "vendor";
      }
    } catch { }
    return false;
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: ["/api/invoices/stats"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const buildInvoiceFilterParams = (options?: { page?: number; limit?: number; exportLines?: boolean }) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    const trimmedSearch = search.trim();
    if (trimmedSearch) params.set("search", trimmedSearch);
    params.set("page", String(options?.page ?? page));
    params.set("limit", String(options?.limit ?? limit));
    if (options?.exportLines) params.set("exportLines", "true");
    return params;
  };

  const queryParams = buildInvoiceFilterParams();

  const { data: invoicesData, isLoading } = useQuery<InvoicesResponse>({
    queryKey: [`/api/invoices?${queryParams.toString()}`],
    staleTime: 0,
    refetchOnMount: true,
  });

  const invoices = invoicesData?.data || [];
  const pagination = invoicesData?.pagination;

  const sourceBadgeItems = useMemo(
    () => [
      {
        value: "po",
        label: "PO",
        count: parseInt(stats?.po || "0", 10) || 0,
      },
      {
        value: "non-po",
        label: "Non-PO",
        count: parseInt(stats?.non_po || "0", 10) || 0,
      },
    ],
    [stats],
  );

  const [isExporting, setIsExporting] = useState(false);

  const fetchExportData = async (): Promise<InvoicesResponse> => {
    const params = buildInvoiceFilterParams({ page: 1, limit: 0, exportLines: true });
    const res = await apiRequest("GET", `/api/invoices?${params.toString()}`);
    return res.json();
  };

  const invoiceSummaryRow = (inv: InvoiceHeader) => ({
    "Invoice Number": inv.invoice_number || "",
    Status: inv.invoice_status || "",
    // Type: inv.invoice_type || "Standard",
    Amount: inv.invoice_amount ? Number(inv.invoice_amount) : null,
    Currency: inv.invoice_curr_code || "",
    Supplier: inv.supplier_name || "",
    "PO Number": inv.po_number || "",
    Department: inv.department_name || "",
    "Invoice Date": inv.invoice_date
      ? formatDate(inv.invoice_date)
      : "",
    "Due Date": inv.inv_due_date
      ? formatDate(inv.inv_due_date)
      : "",
    "Submitted By": inv.submitted_by || "",
    Description: inv.description || "",
    "Current Approver": inv.currentApprover || "",
  });

  const emptyInvoiceLineFields = () => ({
    "Line ID": "",
    "Line #": "",
    "PO Line": "",
    "Item Name": "",
    "Order Qty": "",
    "Order Cost": "",
    "Unit Cost": "",
    "Line Status": "",
    "Receipt #": "",
  });

  const mapInvoiceExportLineToFlatRow = (row: InvoiceExportLineRow) => ({
    ...invoiceSummaryRow({
      id: row.invoice_mst_id,
      invoice_number: row.invoice_number,
      invoice_status: row.invoice_status,
      // invoice_type: row.invoice_type,
      invoice_amount: row.header_invoice_amount ? Number(row.header_invoice_amount) : null,
      invoice_curr_code: row.invoice_curr_code,
      invoice_date: row.invoice_date,
      inv_due_date: row.inv_due_date,
      po_number: row.po_number,
      supplier_name: row.supplier_name,
      supplier_id: null,
      description: row.header_description,
      department_name: row.department_name,
      cost_center_name: null,
      inv_match_status: null,
      inv_payment_status: null,
      tax_amount: null,
      created_by: null,
      creation_date: null,
      submitted_by: row.submitted_by,
      invoice_source: null,
      payment_terms_name: null,
      budget_name: null,
      invoice_approvers: null,
      currentApprover: null,
    }),
    "Line ID": row.line_id ?? "",
    "Line #": row.line_number ?? "",
    "PO Line": row.po_line_number || "",
    "Item Name": row.item_name || "",
    "Order Qty": row.order_qty ? Number(row.order_qty) : null,
    "Order Cost": row.order_cost ? Number(row.order_cost) : null,
    "Unit Cost": row.order_unit_cost ? Number(row.order_unit_cost) : null,
    "Tax Rate": row.tax_rate != null ? `${row.tax_rate}%` : "-",
    "Tax": row.tax_amount ? Number(row.tax_amount) : null,
    "Line Status": row.line_status || "",
    "Receipt #": row.receipt_num || "",
  });

  const getExportInvoicePayload = async () => {
    const result = await fetchExportData();
    const exportInvoices = result.data || [];
    const rawLines = result.exportLines ?? [];
    const summaryRows = exportInvoices.map(invoiceSummaryRow);
    const lineRowsFromApi = rawLines.map(mapInvoiceExportLineToFlatRow);
    const invoiceIdsWithLines = new Set(rawLines.map((r) => Number(r.invoice_mst_id)));
    const fillerRows = exportInvoices
      .filter((inv) => !invoiceIdsWithLines.has(Number(inv.id)))
      .map((inv) => ({ ...invoiceSummaryRow(inv), ...emptyInvoiceLineFields() }));
    const lineRowsFlat = [...lineRowsFromApi, ...fillerRows];
    return { summaryRows, lineRowsFlat };
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
    const { summaryRows, lineRowsFlat } = await getExportInvoicePayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No invoices match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const block = (rows: Record<string, string>[]) => {
      if (rows.length === 0) return "";
      const headers = Object.keys(rows[0]);
      return [
        headers.join(","),
        ...rows.map((row) =>
          headers.map((h) => esc(String((row as Record<string, string>)[h] ?? ""))).join(","),
        ),
      ].join("\n");
    };
    const csvParts = [block(summaryRows), "", "Invoice line items", block(lineRowsFlat)].filter(Boolean);
    const csv = csvParts.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices_${statusFilter}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export invoices",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
    const { summaryRows, lineRowsFlat } = await getExportInvoicePayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No invoices match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Invoices");
    if (lineRowsFlat.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRowsFlat), "Invoice lines");
    }
    XLSX.writeFile(
      wb,
      `invoices_${statusFilter}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    toast({ title: "Exported to Excel" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export invoices",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
    const { summaryRows } = await getExportInvoicePayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No invoices match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const columns = Object.keys(summaryRows[0]);
    const rows = summaryRows.map((row) =>
      columns.map((col) => (row as Record<string, any>)[col] || ""),
    );
    generateTablePdf({
      title: "Invoices",
      subtitle: [
        statusFilter !== "all" ? `Status: ${statusFilter}` : null,
        search.trim() ? `Search: ${search.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" | ") || "All invoices",
      columns,
      rows,
      filename: `invoices_${statusFilter}_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export invoices",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const statCards = isSupplierRole
    ? [
      {
        title: "Total Invoices",
        value: stats?.total || "0",
        icon: Receipt,
        color: "text-primary",
        bgColor: "bg-primary/10",
        filterValue: "all",
      },
      {
        title: "Draft",
        value: stats?.draft || "0",
        icon: FileText,
        color: "text-slate-500",
        bgColor: "bg-slate-100 dark:bg-slate-800",
        filterValue: "Draft",
      },
      {
        title: "Pending Approval",
        value: stats?.pending_approval || "0",
        icon: Clock,
        color: "text-orange-500",
        bgColor: "bg-orange-100 dark:bg-orange-900/30",
        filterValue: "Pending Approval",
      },
      {
        title: "Approved",
        value: stats?.approved || "0",
        icon: CheckCircle2,
        color: "text-emerald-500",
        bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
        filterValue: "Approved",
      },
      {
        title: "Paid",
        value: stats?.paid || "0",
        icon: CreditCard,
        color: "text-blue-500",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        filterValue: "Paid",
      },
      {
        title: "More Info Required",
        value: stats?.moreinfo || "0",
        icon: AlertTriangle,
        color: "text-amber-500",
        bgColor: "bg-amber-100 dark:bg-amber-900/30",
        filterValue: "More Info Required",
      },
    ]
    : [
      {
        title: "Total Invoices",
        value: stats?.total || "0",
        icon: Receipt,
        color: "text-primary",
        bgColor: "bg-primary/10",
        filterValue: "all",
      },
      {
        title: "Draft",
        value: stats?.draft || "0",
        icon: FileText,
        color: "text-slate-500",
        bgColor: "bg-slate-100 dark:bg-slate-800",
        filterValue: "Draft",
      },
      {
        title: "Pending Approval",
        value: stats?.pending_approval || "0",
        icon: Clock,
        color: "text-orange-500",
        bgColor: "bg-orange-100 dark:bg-orange-900/30",
        filterValue: "Pending Approval",
      },
      {
        title: "Approved",
        value: stats?.approved || "0",
        icon: CheckCircle2,
        color: "text-emerald-500",
        bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
        filterValue: "Approved",
      },
      {
        title: "Paid",
        value: stats?.paid || "0",
        icon: CreditCard,
        color: "text-blue-500",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        filterValue: "Paid",
      },
      {
        title: "More Info Required",
        value: stats?.moreinfo || "0",
        icon: AlertTriangle,
        color: "text-amber-500",
        bgColor: "bg-amber-100 dark:bg-amber-900/30",
        filterValue: "More Info Required",
      },
      {
        title: "Rejected",
        value: stats?.rejected || "0",
        icon: XCircle,
        color: "text-destructive",
        bgColor: "bg-destructive/10",
        filterValue: "Rejected",
      },
    ];

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            View and manage supplier invoices
          </p>
        </div>
        {!isSupplierRole && (
          <Button
            size="sm"
            onClick={() => setLocation("/app/invoices/create-non-po")}
            data-testid="button-create-non-po-invoice"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create NON-PO Invoice
          </Button>
        )}
      </div>

      <div
        className={`grid gap-3 ${isSupplierRole ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" : "grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4"}`}
      >
        {statCards.map((card) => (
          <Card
            key={card.title}
            className={`hover-elevate cursor-pointer transition-all ${statusFilter === card.filterValue
              ? "ring-primary border-primary bg-primary/5"
              : ""
              }`}
            onClick={() => {
              setStatusFilter(card.filterValue);
              setPage(1);
            }}
            data-testid={`card-stat-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-1">
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  {statsLoading ? (
                    <Skeleton className="h-6 w-12 mt-1" />
                  ) : (
                    <p className="text-xl font-bold">{card.value}</p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-3 border-b space-y-2">
          <StatusCountBadges
            totalLabel="All"
            totalCount={parseInt(stats?.total || "0", 10) || 0}
            selected={sourceFilter}
            loading={statsLoading}
            onSelect={(v) => {
              setSourceFilter(v as "all" | "po" | "non-po");
              setPage(1);
            }}
            items={sourceBadgeItems}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, Invoice, Supplier, PO, Department..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-sm"
                data-testid="input-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="w-[140px] h-8 text-sm"
                  data-testid="select-status-filter"
                >
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Draft">
                    Draft ({stats?.draft || 0})
                  </SelectItem>
                  <SelectItem value="Pending Approval">
                    Pending ({stats?.pending_approval || 0})
                  </SelectItem>
                  <SelectItem value="Approved">
                    Approved ({stats?.approved || 0})
                  </SelectItem>
                  <SelectItem value="Paid">
                    Paid ({stats?.paid || 0})
                  </SelectItem>
                  <SelectItem value="More Info Required">
                    More Info Required ({stats?.moreinfo || 0})
                  </SelectItem>
                  {!isSupplierRole && (
                    <SelectItem value="Rejected">
                      Rejected ({stats?.rejected || 0})
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isExporting}
                    data-testid="button-export"
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    {isExporting ? "Exporting..." : "Export"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={exportToCSV}
                    data-testid="menu-export-csv"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportToExcel}
                    data-testid="menu-export-excel"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportToPDF}
                    data-testid="menu-export-pdf"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium w-[90px]">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Invoice ID
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[130px]">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Invoice No.
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[120px]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Status
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Supplier
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[100px]">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      PO Number
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Department
                    </span>
                  </TableHead>
                  {/* <TableHead className="text-xs font-medium w-[110px]">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Invoice Type
                    </span>
                  </TableHead> */}
                  <TableHead className="text-xs font-medium text-right w-[110px]">
                    <span className="flex items-center justify-end gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" />
                      Amount
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[100px]">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Inv. Date
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[100px]">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Due Date
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[110px]">
                    Submitted By
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[110px]">
                    Current Approver
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="text-center py-12 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <Receipt className="h-12 w-12 text-muted-foreground/50 mb-3" />
                        <h3 className="text-base font-medium mb-1">
                          No invoices found
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {search || statusFilter !== "all"
                            ? "Try adjusting your search or filters"
                            : "No invoices available in the system"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer h-10"
                      onClick={() => setLocation(`/app/invoices/${inv.id}`)}
                      data-testid={`row-invoice-${inv.id}`}
                    >
                      <TableCell className="text-sm py-2 whitespace-nowrap">
                        {inv.id}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium text-primary py-2 whitespace-nowrap">
                        {inv.invoice_number || "-"}
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={inv.invoice_status} />
                      </TableCell>
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[120px] cursor-default">
                              {inv.supplier_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{inv.supplier_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="text-sm font-mono">
                          {inv.po_number || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[100px] cursor-default">
                              {inv.department_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{inv.department_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      {/* <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {inv.invoice_type || "-"}
                      </TableCell> */}
                      <TableCell className="py-2 text-sm font-medium text-right">
                        {formatCurrency(
                          Number(inv.invoice_amount) + Number(inv.tax_amount),
                          inv.invoice_curr_code,
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(inv.invoice_date)}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(inv.inv_due_date)}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {inv.submitted_by || "-"}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {inv.currentApprover || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <div className="text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1} to{" "}
                {Math.min(page * limit, pagination.total)} of {pagination.total}{" "}
                entries
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={limit.toString()}
                  onValueChange={(v) => {
                    setLimit(parseInt(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[70px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs">
                  Page {page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(page + 1)}
                  disabled={page === pagination.totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
