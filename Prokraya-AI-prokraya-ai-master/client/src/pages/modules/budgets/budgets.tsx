import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
  User,
  Wallet,
  XCircle
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

interface Budget {
  id: number;
  budget_id: string | null;
  budget_name: string | null;
  budget_amount: string | null;
  budget_curr: string | null;
  status: string | null;
  budget_owner_id: string | null;
  budget_owner_name: string | null;
  business_entity: string | null;
  business_entity_name: string | null;
  start_date: string | null;
  end_date: string | null;
  period_mst_id: string | null;
  locations: string | null;
  notes: string | null;
  consumed_amount: string | null;
  reserved_amount: string | null;
  creation_date: string | null;
  created_by: string | null;
  last_modified_date: string | null;
  last_modified_by: string | null;
  currentApprover: string | null;
}

interface BudgetsResponse {
  data: Budget[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  exportLines?: BudgetExportLineRow[];
}

function toExportAmount(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined || value === "") return "";
  const n = parseFloat(String(value));
  return Number.isNaN(n) ? String(value) : n;
}

function getBudgetAmountBreakdown(fields: {
  totalAmount: string | null;
  consumed_amount: string | null;
  reserved_amount: string | null;
}) {
  const consumed = parseFloat(fields.consumed_amount || "0") || 0;
  const reserved = parseFloat(fields.reserved_amount || "0") || 0;
  const total = parseFloat(fields.totalAmount || "0") || 0;
  const available = Math.max(0, total - consumed - reserved);
  return { consumed, reserved, available, total };
}

/** Budget + line row returned when listing with exportLines=1 and limit=0 */
interface BudgetExportLineRow {
  budget_mst_id: number;
  budget_id: string | null;
  budget_name: string | null;
  status: string | null;
  budget_owner_name: string | null;
  business_entity_name: string | null;
  budget_amount: string | null;
  budget_curr: string | null;
  consumed_amount: string | null;
  reserved_amount: string | null;
  start_date: string | null;
  end_date: string | null;
  line_id: number;
  line_cost_center_code: string | null;
  line_cost_center_name: string | null;
  line_amount: string | null;
  line_description: string | null;
  line_consumed_amount: string | null;
  line_reserved_amount: string | null;
  line_locations: string | null;
  line_departments: string | null;
}

interface StatsResponse {
  total: string;
  draft: string;
  pending_approval: string;
  approved: string;
  rejected: string;
  expired: string;
  more_info_required: string;
  total_budget: string;
  total_consumed: string;
  total_reserved: string;
}

interface BulkImportResult {
  budgetName: string;
  success: boolean;
  budgetId?: string;
  id?: number;
  linesCreated?: number;
  errors?: string[];
}

interface BulkImportResponse {
  created: number;
  errors: number;
  total: number;
  results: BulkImportResult[];
}

interface BulkImportPreviewResult {
  budgetName: string;
  valid: boolean;
  lineCount: number;
  errors: string[];
}

interface BulkImportPreview {
  total: number;
  valid: number;
  invalid: number;
  results: BulkImportPreviewResult[];
}

interface Period {
  id: number;
  period_name: string;
}

interface UserOption {
  id: number;
  name: string;
  user_name: string;
  orgids: string;
}

interface EntityOption {
  id: string;
  name: string;
}

interface CreateBudgetForm {
  budget_name: string;
  business_entity: string;
  business_entity_name: string;
  budget_owner_id: string;
  budget_owner_name: string;
  period_mst_id: string;
  start_date: any;
  end_date: any;
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
  draft: { label: "Draft", icon: FileText, variant: "secondary" },
  "pending approval": {
    label: "Pending Approval",
    icon: Clock,
    variant: "outline",
    className:
      "border-amber-300 text-amber-600 dark:border-amber-600 dark:text-amber-400",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    variant: "default",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  rejected: { label: "Rejected", icon: XCircle, variant: "destructive" },
  expired: {
    label: "Expired",
    icon: AlertTriangle,
    variant: "outline",
    className: "border-orange-300 text-orange-600 dark:text-orange-400",
  },
  "more info required": {
    variant: "outline",
    label: "More Info Required",
    icon: Clock,
    className: "border-orange-300 text-orange-600",
  },
};

function StatusBadge({ status }: { status: string | null }) {
  const config = statusConfig[(status || "").toLowerCase()] || {
    label: status || "Unknown",
    icon: FileText,
    variant: "outline" as const,
  };
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={`text-xs gap-1 px-1.5 py-0.5 ${config.className || ""}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function UtilizationBar({
  consumed,
  total,
}: {
  consumed: number;
  total: number;
}) {
  const percentage = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;
  const color =
    percentage >= 90
      ? "bg-red-500"
      : percentage >= 75
        ? "bg-orange-500"
        : "bg-emerald-500";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{percentage.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function BudgetsPage() {
  const [location, setLocation] = useLocation();
  const { isAIEnabled } = useAISettings();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  function getSearchParams(): URLSearchParams {
    if (typeof window !== "undefined" && window.location?.search) {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams(location.split("?")[1] || "");
  }

  const initialQueryParams = getSearchParams();
  const initialStatus = initialQueryParams.get("status") || "all";
  const initialSearch = initialQueryParams.get("search") || "";
  const initialYear = initialQueryParams.get("year") || currentYear.toString();
  const initialPage = parseInt(initialQueryParams.get("page") || "1", 10) || 1;
  const initialLimit =
    parseInt(initialQueryParams.get("limit") || "10", 10) || 10;

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [yearFilter, setYearFilter] = useState(initialYear);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<BulkImportPreview | null>(null);
  const [importResults, setImportResults] = useState<BulkImportResponse | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiEntityOptions, setAiEntityOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [aiSelectedEntityId, setAiSelectedEntityId] = useState("");
  const [aiClarificationMessage, setAiClarificationMessage] = useState("");
  const [formData, setFormData] = useState<CreateBudgetForm>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setDate(endDate.getDate() - 1);
    return {
      budget_name: "",
      business_entity: "",
      business_entity_name: "",
      budget_owner_id: "",
      budget_owner_name: "",
      period_mst_id: "",
      start_date: today,
      end_date: endDate,
    };
  });

  // Sync filter state when location query params change (e.g. dashboard nav)
  useEffect(() => {
    const qp = getSearchParams();
    setSearch(qp.get("search") || "");
    setStatusFilter(qp.get("status") || "all");
    setYearFilter(qp.get("year") || currentYear.toString());
    setPage(parseInt(qp.get("page") || "1", 10) || 1);
    setLimit(parseInt(qp.get("limit") || "10", 10) || 10);
  }, [location]);

  const { data: stats, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: [`/api/budgets/stats?year=${yearFilter}`],
  });

  const { data: periods } = useQuery<Period[]>({
    queryKey: ["/api/budgets/periods"],
  });

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["/api/budgets/users"],
  });

  const { data: entities } = useQuery<EntityOption[]>({
    queryKey: ["/api/budgets/entities"],
  });

  const buildBudgetFilterParams = (options?: { page?: number; limit?: number; exportLines?: boolean }) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    const trimmedSearch = search.trim();
    if (trimmedSearch) params.set("search", trimmedSearch);
    params.set("year", yearFilter);
    params.set("page", String(options?.page ?? page));
    params.set("limit", String(options?.limit ?? limit));
    if (options?.exportLines) params.set("exportLines", "true");
    return params;
  };

  const queryParams = buildBudgetFilterParams();

  const { data: budgetsData, isLoading } = useQuery<BudgetsResponse>({
    queryKey: ["/api/budgets", queryParams.toString()],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/budgets?${queryParams.toString()}`
      ).then((res) => res.json()),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const budgets = budgetsData?.data || [];
  const pagination = budgetsData?.pagination;

  // Helper to format date as YYYY-MM-DD (local date, no timezone shift)
  const formatDateForApi = (date: Date | undefined) => {
    if (!date) return undefined;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const createBudgetMutation = useMutation({
    mutationFn: async (data: CreateBudgetForm) => {
      const response = await apiRequest("POST", "/api/budgets", {
        budget_name: data.budget_name,
        business_entity: data.business_entity,
        business_entity_name: data.business_entity_name,
        budget_owner_id: data.budget_owner_id,
        budget_owner_name: data.budget_owner_name,
        period_mst_id: data.period_mst_id,
        start_date: formatDateForApi(data.start_date),
        end_date: formatDateForApi(data.end_date),
      });
      return response.json();
    },
    onSuccess: (data: { id: number }) => {
      toast({ title: "Budget created as Draft" });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets/stats"] });
      setIsCreateOpen(false);
      resetForm();
      setLocation(`/app/budgets/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create budget",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // AI Budget Creation mutation
  const createBudgetWithAIMutation = useMutation({
    mutationFn: async (payload: { prompt: string; businessEntityId?: string }) => {
      const response = await apiRequest("POST", "/api/budgets/create-with-ai", {
        prompt: payload.prompt,
        businessEntityId: payload.businessEntityId || undefined,
      });
      return response.json();
    },
    onSuccess: (data: {
      needsClarification?: boolean;
      clarification?: {
        type: string;
        message: string;
        options: Array<{ id: string; name: string }>;
      };
      id?: number;
      budgetName?: string;
      linesCount?: number;
      totalAmount?: number;
      rationale?: string;
      learnedFromHistory?: string;
      amountEstimateBasis?: string;
      warnings?: string[];
      approvalWorkflow?: { processName: string; approvers: string[]; message: string };
    }) => {
      if (data.needsClarification && data.clarification?.type === "business_entity") {
        setAiEntityOptions(data.clarification.options || []);
        setAiClarificationMessage(
          data.clarification.message || "Please select a business entity to continue."
        );
        setAiSelectedEntityId("");
        toast({
          title: "Clarification needed",
          description: data.clarification.message,
        });
        return;
      }

      if (!data.id || !data.budgetName) {
        toast({
          title: "Failed to create budget with AI",
          description: "Unexpected response from AI budget creation.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Budget created with AI",
        description: `Created "${data.budgetName}" with ${data.linesCount} line items (${new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" }).format(data.totalAmount || 0)})`,
      });

      if (data.rationale || data.learnedFromHistory) {
        setTimeout(() => {
          toast({
            title: "AI Analysis",
            description: [data.rationale, data.learnedFromHistory].filter(Boolean).join(" "),
          });
        }, 500);
      }

      if (data.approvalWorkflow?.message) {
        setTimeout(() => {
          toast({
            title: "Suggested approval workflow",
            description: data.approvalWorkflow?.message,
          });
        }, 800);
      }

      if (data.warnings && data.warnings.length > 0) {
        setTimeout(() => {
          data.warnings?.forEach((warning) => {
            toast({
              title: "Note",
              description: warning,
              variant: "destructive",
            });
          });
        }, 1000);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets/stats"] });
      setIsAIDialogOpen(false);
      setAiPrompt("");
      setAiEntityOptions([]);
      setAiSelectedEntityId("");
      setAiClarificationMessage("");
      setLocation(`/app/budgets/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create budget with AI",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const validateImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("POST", "/api/budgets/bulk-import/validate", formData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Validation failed" }));
        throw new Error(err.error || "Validation failed");
      }
      return response.json() as Promise<BulkImportPreview>;
    },
    onSuccess: (data) => {
      setImportPreview(data);
    },
    onError: (error: Error) => {
      toast({ title: "Validation failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("POST", "/api/budgets/bulk-import", formData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return response.json() as Promise<BulkImportResponse>;
    },
    onSuccess: (data) => {
      setImportPreview(null);
      setImportResults(data);
      setImportFile(null);
      if (data.created > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/budgets/stats"] });
        toast({
          title: `Import complete`,
          description: `${data.created} budget${data.created !== 1 ? "s" : ""} created${data.errors > 0 ? `, ${data.errors} failed` : ""}`,
        });
      } else {
        toast({ title: "Import failed", description: "No budgets were created", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setDate(endDate.getDate() - 1);
    setFormData({
      budget_name: "",
      business_entity: "",
      business_entity_name: "",
      budget_owner_id: "",
      budget_owner_name: "",
      period_mst_id: "",
      start_date: today,
      end_date: endDate,
    });
  };

  const handleDownloadBudgetTemplate = () => {
    const a = document.createElement("a");
    a.href = "/api/budgets/bulk-import/template";
    a.download = "budget_import_template.xlsx";
    a.click();
  };

  const handleCreateSubmit = () => {
    if (!formData.budget_name) {
      toast({ title: "Budget Name is required", variant: "destructive" });
      return;
    }
    if (!formData.business_entity) {
      toast({ title: "Business Entity is required", variant: "destructive" });
      return;
    }
    if (!formData.budget_owner_id) {
      toast({ title: "Budget Owner is required", variant: "destructive" });
      return;
    }
    if (!formData.period_mst_id) {
      toast({ title: "Period is required", variant: "destructive" });
      return;
    }
    if (!formData.start_date) {
      toast({ title: "Start Date is required", variant: "destructive" });
      return;
    }
    if (!formData.end_date) {
      toast({ title: "End Date is required", variant: "destructive" });
      return;
    }
    createBudgetMutation.mutate(formData);
  };

  const [isExporting, setIsExporting] = useState(false);

  const fetchExportData = async (): Promise<BudgetsResponse> => {
    const params = buildBudgetFilterParams({ page: 1, limit: 0, exportLines: true });
    const res = await apiRequest("GET", `/api/budgets?${params.toString()}`);
    return res.json();
  };

  const buildExportFilterSummaryRows = (rowCount: number) => {
    const rows: { Metric: string; Value: string | number }[] = [
      { Metric: "Year", Value: yearFilter },
      { Metric: "Records exported", Value: rowCount },
    ];
    if (statusFilter !== "all") rows.push({ Metric: "Status", Value: statusFilter });
    const trimmedSearch = search.trim();
    if (trimmedSearch) rows.push({ Metric: "Search", Value: trimmedSearch });
    return rows;
  };

  const sumBudgetField = (budgets: Budget[], field: keyof Budget) =>
    budgets.reduce((sum, b) => sum + (parseFloat(String(b[field] ?? "0")) || 0), 0);

  const budgetSummaryRow = (budget: Budget) => {
    const { available } = getBudgetAmountBreakdown({
      totalAmount: budget.budget_amount,
      consumed_amount: budget.consumed_amount,
      reserved_amount: budget.reserved_amount,
    });
    return {
      "Budget ID": budget.budget_id || "",
      "Budget Name": budget.budget_name || "",
      Status: budget.status || "",
      Owner: budget.budget_owner_name || "",
      "Business Entity": budget.business_entity_name || "",
      "Total Budget": toExportAmount(budget.budget_amount),
      Currency: budget.budget_curr || "",
      Consumed: toExportAmount(budget.consumed_amount),
      Reserved: toExportAmount(budget.reserved_amount),
      Available: toExportAmount(available),
      "Start Date": formatDate(budget.start_date) !== "-" ? formatDate(budget.start_date) : "",
      "End Date": formatDate(budget.end_date) !== "-" ? formatDate(budget.end_date) : "",
    };
  };

  const mapExportLineToFlatRow = (row: BudgetExportLineRow) => ({
    ...budgetSummaryRow({
      id: row.budget_mst_id,
      budget_id: row.budget_id,
      budget_name: row.budget_name,
      budget_amount: row.budget_amount,
      budget_curr: row.budget_curr,
      status: row.status,
      budget_owner_id: null,
      budget_owner_name: row.budget_owner_name,
      business_entity: null,
      business_entity_name: row.business_entity_name,
      start_date: row.start_date,
      end_date: row.end_date,
      period_mst_id: null,
      locations: null,
      notes: null,
      consumed_amount: row.consumed_amount,
      reserved_amount: row.reserved_amount,
      creation_date: null,
      created_by: null,
      last_modified_date: null,
      last_modified_by: null,
    }),
    "Line ID": row.line_id ?? "",
    "Cost Center Code": row.line_cost_center_code || "",
    "Cost Center Name": row.line_cost_center_name || "",
    "Line Total Budget": toExportAmount(
      getBudgetAmountBreakdown({
        totalAmount: row.line_amount != null ? String(row.line_amount) : null,
        consumed_amount: row.line_consumed_amount,
        reserved_amount: row.line_reserved_amount,
      }).total,
    ),
    "Line Description": row.line_description || "",
    "Line Consumed": row.line_consumed_amount ?? "",
    "Line Reserved": row.line_reserved_amount ?? "",
    Locations: row.line_locations || "",
    Departments: row.line_departments || "",
  });

  const emptyLineFields = () => ({
    "Line ID": "",
    "Cost Center Code": "",
    "Cost Center Name": "",
    "Line Total Budget": "",
    "Line Description": "",
    "Line Consumed": "",
    "Line Reserved": "",
    Locations: "",
    Departments: "",
  });

  const getExportBudgetPayload = async () => {
    const result = await fetchExportData();
    const exportBudgets = result.data || [];
    const rawLines = result.exportLines ?? [];

    const summaryRows = exportBudgets.map(budgetSummaryRow);

    const lineRowsFromApi = rawLines.map(mapExportLineToFlatRow);
    const budgetIdsWithLines = new Set(rawLines.map((r) => r.budget_mst_id));
    const fillerRows = exportBudgets
      .filter((b) => !budgetIdsWithLines.has(b.id))
      .map((b) => ({ ...budgetSummaryRow(b), ...emptyLineFields() }));

    const lineRowsFlat = [...lineRowsFromApi, ...fillerRows];

    const exportStats: Pick<StatsResponse, "total_budget" | "total_consumed" | "total_reserved"> = {
      total_budget: String(sumBudgetField(exportBudgets, "budget_amount")),
      total_consumed: String(sumBudgetField(exportBudgets, "consumed_amount")),
      total_reserved: String(sumBudgetField(exportBudgets, "reserved_amount")),
    };

    return { summaryRows, lineRowsFlat, exportStats };
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
    const { summaryRows, lineRowsFlat, exportStats } = await getExportBudgetPayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No budgets match the current filters.",
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
    const totalsBlock = block([
      ...buildExportFilterSummaryRows(summaryRows.length).map((r) => ({
        Metric: r.Metric,
        Value: String(r.Value),
      })),
      {
        Metric: "Total Budget",
        Value: String(toExportAmount(exportStats?.total_budget)),
      },
      {
        Metric: "Total Consumed",
        Value: String(toExportAmount(exportStats?.total_consumed)),
      },
      {
        Metric: "Total Reserved",
        Value: String(toExportAmount(exportStats?.total_reserved)),
      },
    ]);
    const csvParts = [
      totalsBlock,
      "",
      block(summaryRows),
      "",
      "Budget line items",
      block(lineRowsFlat),
    ].filter(Boolean);
    const csv = csvParts.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budgets_${yearFilter}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export budgets",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
    const { summaryRows, lineRowsFlat, exportStats } = await getExportBudgetPayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No budgets match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const wb = XLSX.utils.book_new();
    const totalsSheet = [
      ...buildExportFilterSummaryRows(summaryRows.length),
      { Metric: "Total Budget", Value: toExportAmount(exportStats?.total_budget) },
      { Metric: "Total Consumed", Value: toExportAmount(exportStats?.total_consumed) },
      { Metric: "Total Reserved", Value: toExportAmount(exportStats?.total_reserved) },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalsSheet), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Budgets");
    if (lineRowsFlat.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRowsFlat), "Budget lines");
    }
    XLSX.writeFile(
      wb,
      `budgets_${yearFilter}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    toast({ title: "Exported to Excel" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export budgets",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
    const { summaryRows, exportStats } = await getExportBudgetPayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No budgets match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const columns = Object.keys(summaryRows[0]);
    const rows = summaryRows.map((row) =>
      columns.map((col) => String((row as Record<string, string | number>)[col] ?? "")),
    );
    generateTablePdf({
      title: "Budgets",
      subtitle: [
        `Year: ${yearFilter}`,
        `Total Budget: ${formatCurrency(exportStats?.total_budget ?? 0, null)}`,
        statusFilter !== "all" ? `Status: ${statusFilter}` : null,
        search.trim() ? `Search: ${search.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
      columns,
      rows,
      filename: `budgets_${yearFilter}_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export budgets",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const statCards = [
    {
      title: "Total Budgets",
      value: stats?.total || "0",
      icon: Wallet,
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
      filterValue: "draft",
    },
    {
      title: "Pending Approval",
      value: stats?.pending_approval || "0",
      icon: Clock,
      color: "text-amber-500",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      filterValue: "pending approval",
    },
    {
      title: "Approved",
      value: stats?.approved || "0",
      icon: CheckCircle2,
      color: "text-emerald-500",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      filterValue: "approved",
    },
    {
      title: "Rejected",
      value: stats?.rejected || "0",
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      filterValue: "rejected",
    },
    {
      title: "Expired",
      value: stats?.expired || "0",
      icon: Clock,
      color: "text-muted-foreground",
      bgColor: "bg-slate-100 dark:bg-slate-800",
      filterValue: "expired",
    },
    {
      title: "More Info Required",
      value: stats?.more_info_required || "0",
      icon: AlertTriangle,
      color: "text-orange-500",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      filterValue: "more info required",
    },
  ];

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            Budgets
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage and track budget allocations and utilization
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAIEnabled("AI_BUDGET_CREATION") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAIDialogOpen(true)}
              data-testid="button-create-with-ai"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Create with AI
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setImportResults(null); setImportFile(null); setIsImportOpen(true); }}
            data-testid="button-bulk-import"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Import from Excel
          </Button>
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            data-testid="button-create-budget"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create New
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
        {statsLoading
          ? [...Array(7)].map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-10" />
                </div>
              </CardContent>
            </Card>
          ))
          : statCards.map((stat) => (
            <Card
              key={stat.title}
              className={`hover-elevate cursor-pointer transition-all ${statusFilter === stat.filterValue
                ? "ring-primary border-primary bg-primary/5"
                : ""
                }`}
              onClick={() => {
                setStatusFilter(stat.filterValue);
                setPage(1);
              }}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bgColor} ${stat.color}`}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <p
                    className="text-xl font-bold"
                    data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {parseInt(stat.value).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search budget name, owner, entity..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-budget"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={yearFilter}
                onValueChange={(v) => {
                  setYearFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="w-[100px] h-8 text-sm"
                  data-testid="select-year"
                >
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={currentYear.toString()}>
                    {currentYear}
                  </SelectItem>
                  <SelectItem value={(currentYear - 1).toString()}>
                    {currentYear - 1}
                  </SelectItem>
                  <SelectItem value={(currentYear - 2).toString()}>
                    {currentYear - 2}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="w-[140px] h-8 text-sm"
                  data-testid="select-status"
                >
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">
                    Draft ({stats?.draft || 0})
                  </SelectItem>
                  <SelectItem value="pending approval">
                    Pending Approval ({stats?.pending_approval || 0})
                  </SelectItem>
                  <SelectItem value="approved">
                    Approved ({stats?.approved || 0})
                  </SelectItem>
                  <SelectItem value="rejected">
                    Rejected ({stats?.rejected || 0})
                  </SelectItem>
                  <SelectItem value="expired">
                    Expired ({stats?.expired || 0})
                  </SelectItem>
                  <SelectItem value="more info required">
                    More Info Required ({stats?.more_info_required || 0})
                  </SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
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
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={exportToCSV}
                    data-testid="menu-item-csv"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportToExcel}
                    data-testid="menu-item-excel"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportToPDF}
                    data-testid="menu-item-pdf"
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
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : budgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <h3 className="text-base font-medium mb-1">No budgets found</h3>
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "No budgets available in the system"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-medium w-[100px]">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Budget ID
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" />
                        Budget Name
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[140px]">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Status
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[150px]">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        Owner
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        Entity
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium text-right w-[110px]">
                      <span className="flex items-center gap-1.5 justify-end">
                        <DollarSign className="h-3.5 w-3.5" />
                        Amount
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[100px]">
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Utilization
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[90px]">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Start
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[90px]">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        End
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[150px]">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        Current Approver
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.map((budget) => (
                    <TableRow
                      key={budget.id}
                      className="cursor-pointer"
                      onClick={() => setLocation(`/app/budgets/${budget.id}`)}
                      data-testid={`budget-row-${budget.id}`}
                    >
                      <TableCell
                        className="font-mono text-sm font-medium text-primary py-1.5 select-text"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {budget.budget_id || budget.id}
                      </TableCell>
                      <TableCell
                        className="py-1.5 select-text"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="truncate max-w-[200px]"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[200px] cursor-default">
                                {budget.budget_name || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{budget.budget_name || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 w-[140px]">
                        <StatusBadge status={budget.status} />
                      </TableCell>
                      <TableCell
                        className="py-1.5 text-sm text-muted-foreground truncate w-[150px] select-text"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[150px] cursor-default">
                              {budget.budget_owner_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{budget.budget_owner_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        className="py-1.5 text-sm text-muted-foreground truncate max-w-[150px] select-text"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[150px] cursor-default">
                              {budget.business_entity_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{budget.business_entity_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        className="py-1.5 text-sm text-right font-medium select-text"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {formatCurrency(
                          budget.budget_amount,
                          budget.budget_curr,
                        )}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <UtilizationBar
                          consumed={parseFloat(budget.consumed_amount || "0")}
                          total={parseFloat(budget.budget_amount || "0")}
                        />
                      </TableCell>
                      <TableCell
                        className="py-1.5 text-xs text-muted-foreground select-text"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {formatDate(budget.start_date)}
                      </TableCell>
                      <TableCell
                        className="py-1.5 text-xs text-muted-foreground select-text"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {formatDate(budget.end_date)}
                      </TableCell>
                      <TableCell
                        className="text-sm block truncate max-w-[150px] cursor-default"
                      >
                      {budget.currentApprover || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {pagination && (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Rows per page:
              </span>
              <Select
                value={limit.toString()}
                onValueChange={(v) => {
                  setLimit(parseInt(v));
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="h-7 w-[60px] text-xs"
                  data-testid="select-rows-per-page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {pagination.total > 0
                  ? `${(pagination.page - 1) * limit + 1}-${Math.min(pagination.page * limit, pagination.total)} of ${pagination.total.toLocaleString()}`
                  : "0 results"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs px-1">
                {pagination.page}/{pagination.totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
                disabled={pagination.page >= pagination.totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Sheet open={isCreateOpen} onOpenChange={() => {
        setIsCreateOpen(false);
        setFormData(() => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const endDate = new Date(today);
          endDate.setFullYear(endDate.getFullYear() + 1);
          endDate.setDate(endDate.getDate() - 1);
          return {
            budget_name: "",
            business_entity: "",
            business_entity_name: "",
            budget_owner_id: "",
            budget_owner_name: "",
            period_mst_id: "",
            start_date: today,
            end_date: endDate,
          };
        })
      }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create Budget</SheetTitle>
            <SheetDescription>
              <span className="text-destructive">*</span> Indicates mandatory
              fields
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="budget_name">
                Budget Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="budget_name"
                value={formData.budget_name}
                onChange={(e) =>
                  setFormData({ ...formData, budget_name: e.target.value })
                }
                placeholder="Enter budget name"
                data-testid="input-budget-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_entity">
                Business Entity <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.business_entity}
                onValueChange={(value) => {
                  const entity = entities?.find((e) => e.id === value);
                  setFormData({
                    ...formData,
                    business_entity: value,
                    business_entity_name: entity?.name || "",
                    budget_owner_id: "",
                    budget_owner_name: "",
                  });
                }}
              >
                <SelectTrigger data-testid="select-business-entity">
                  <SelectValue placeholder="Select Entity" />
                </SelectTrigger>
                <SelectContent>
                  {entities?.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget_owner">
                Budget Owner <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.budget_owner_id}
                onValueChange={(value) => {
                  const user = users?.find((u) => u.id.toString() === value);
                  setFormData({
                    ...formData,
                    budget_owner_id: value,
                    budget_owner_name: user?.name || "",
                  });
                }}
              >
                <SelectTrigger data-testid="select-budget-owner">
                  <SelectValue placeholder="Select Owner" />
                </SelectTrigger>
                <SelectContent>
                  {users?.filter((user) => user.orgids?.includes(formData?.business_entity))?.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="period">
                Period <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.period_mst_id}
                onValueChange={(value) => {
                  const selectedPeriod = periods?.find(p => p.id.toString() === value);
                  const periodName = selectedPeriod?.period_name?.toLowerCase() || "";
                  const isCustom = value === "4" || periodName === "custom";

                  const start = formData.start_date || (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
                  let endDate = formData.end_date ? new Date(formData.end_date) : new Date(start);

                  if (!isCustom) {
                    endDate = new Date(start);
                    if (periodName === "quarterly" || value === "2") {
                      endDate.setMonth(endDate.getMonth() + 3);
                    } else if (periodName === "monthly" || value === "3") {
                      endDate.setMonth(endDate.getMonth() + 1);
                    } else {
                      endDate.setFullYear(endDate.getFullYear() + 1);
                    }
                    endDate.setDate(endDate.getDate() - 1);
                  } else {
                    if (!formData.end_date || endDate < start) {
                      endDate = new Date(start);
                      endDate.setFullYear(endDate.getFullYear() + 1);
                      endDate.setDate(endDate.getDate() - 1);
                    }
                  }

                  setFormData({
                    ...formData,
                    period_mst_id: value,
                    start_date: start,
                    end_date: endDate,
                  });
                }}
              >
                <SelectTrigger data-testid="select-period">
                  <SelectValue placeholder="Select Period" />
                </SelectTrigger>
                <SelectContent>
                  {periods?.map((period) => (
                    <SelectItem key={period.id} value={period.id.toString()}>
                      {period.period_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  const date = new Date(value);
                  const selectedPeriod = periods?.find(
                    (p) => p.id.toString() === formData.period_mst_id
                  );
                  const periodName = selectedPeriod?.period_name?.toLowerCase() || "";
                  const isCustom =
                    formData.period_mst_id === "4" || periodName === "custom";
                  let endDate = formData.end_date
                    ? new Date(formData.end_date)
                    : new Date(date);
                  if (!isCustom) {
                    endDate = new Date(date);
                    if (periodName === "quarterly" || formData.period_mst_id === "2") {
                      endDate.setMonth(endDate.getMonth() + 3);
                    } else if (periodName === "monthly" || formData.period_mst_id === "3") {
                      endDate.setMonth(endDate.getMonth() + 1);
                    } else {
                      endDate.setFullYear(endDate.getFullYear() + 1);
                    }
                    endDate.setDate(endDate.getDate() - 1);
                  } else {
                    if (endDate < date) {
                      endDate = new Date(date);
                      endDate.setFullYear(endDate.getFullYear() + 1);
                      endDate.setDate(endDate.getDate() - 1);
                    }
                  }
                  setFormData({
                    ...formData,
                    start_date: date,
                    end_date: endDate,
                  });
                }}
                data-testid="budget-start-date"
              />
            </div>

            <div className="space-y-2">
              <Label>
                End Date {formData.period_mst_id === "4" && <span className="text-destructive">*</span>}
              </Label>
              <Input
                className={formData.period_mst_id !== "4" ? "bg-muted" : ""}
                type="date"
                value={formData.end_date}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  const date = new Date(value);
                  if (formData.start_date && date < new Date(formData.start_date)) {
                    return;
                  }
                  setFormData((prev) => ({
                    ...prev,
                    end_date: date,
                  }));
                }}
                min={formData.start_date ? new Date(formData.start_date).toISOString().split("T")[0] : undefined}
                data-testid="input-end-date"
                disabled={formData.period_mst_id !== "4"}
              />
              {formData.period_mst_id !== "4" ?
                <p className="text-xs text-muted-foreground">
                  End date is auto-calculated based on Period
                </p> : <></>}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                resetForm();
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createBudgetMutation.isPending}
              data-testid="button-create-submit"
            >
              {createBudgetMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Create
            </Button>
          </div>
        </SheetContent>
      </Sheet>



      {/* Import Budgets from Excel Dialog */}
      <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if (!open) { setImportResults(null); setImportPreview(null); setImportFile(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Budgets from Excel
            </DialogTitle>
            <DialogDescription>
              {importResults
                ? "Import complete. See results below."
                : importPreview
                  ? "Review the imported rows below. Rows with errors will be skipped."
                  : "Upload an Excel file to create multiple budgets with lines at once."}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: File selection */}
          {!importPreview && !importResults && (
            <div className="space-y-4">
              <div className="rounded-md border border-dashed p-4 text-center space-y-2">
                <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Excel Format (columns in order):</p>
                  <p className="text-xs leading-relaxed">
                    Budget Name · Description · Period · Start Date · End Date · Budget Owner · Business Entity · Cost Center Code · Amount · Location · Department
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Rows with the same Budget Name, Budget Owner, Period and Business Entity are grouped as one budget with multiple lines.
                </p>
              </div>

              <Button variant="outline" className="w-full" onClick={handleDownloadBudgetTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>

              <input
                ref={excelFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => excelFileRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {importFile ? importFile.name : "Choose File"}
              </Button>
              {importFile && (
                <p className="text-xs text-muted-foreground text-center">
                  {(importFile.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          )}

          {/* Step 2: Review */}
          {importPreview && !importResults && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm pb-1 border-b">
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {importPreview.valid} will be imported
                </span>
                {importPreview.invalid > 0 && (
                  <span className="flex items-center gap-1 text-destructive font-medium">
                    <XCircle className="h-4 w-4" />
                    {importPreview.invalid} will be skipped
                  </span>
                )}
                <span className="text-muted-foreground ml-auto">of {importPreview.total} total</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {importPreview.results.map((r, i) => (
                  <div
                    key={i}
                    className={`rounded-md border p-2.5 text-xs ${r.valid ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900" : "border-destructive/30 bg-destructive/5"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{r.budgetName}</span>
                      {r.valid ? (
                        <span className="shrink-0 text-emerald-600 font-medium">
                          {r.lineCount} line{r.lineCount !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="shrink-0 text-destructive font-medium">Skipped</span>
                      )}
                    </div>
                    {r.errors.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-destructive">
                        {r.errors.map((e, j) => <li key={j}>• {e}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {importResults && (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              <div className="flex gap-3 text-sm">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  {importResults.created} created
                </span>
                {importResults.errors > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-4 w-4" />
                    {importResults.errors} failed
                  </span>
                )}
                <span className="text-muted-foreground">of {importResults.total} total</span>
              </div>
              <div className="space-y-2">
                {importResults.results.map((r, i) => (
                  <div
                    key={i}
                    className={`rounded-md border p-2.5 text-xs ${r.success ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900" : "border-destructive/30 bg-destructive/5"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{r.budgetName}</span>
                      {r.success ? (
                        <span className="shrink-0 text-emerald-600 font-medium">{r.linesCreated} line{r.linesCreated !== 1 ? "s" : ""}</span>
                      ) : (
                        <span className="shrink-0 text-destructive font-medium">Failed</span>
                      )}
                    </div>
                    {r.success && r.budgetId && (
                      <p className="text-muted-foreground mt-0.5">{r.budgetId}</p>
                    )}
                    {r.errors && r.errors.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-destructive">
                        {r.errors.map((e, j) => <li key={j}>• {e}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {/* Step 1 footer */}
            {!importPreview && !importResults && (
              <>
                <Button variant="outline" onClick={() => { setIsImportOpen(false); setImportFile(null); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => importFile && validateImportMutation.mutate(importFile)}
                  disabled={!importFile || validateImportMutation.isPending}
                >
                  {validateImportMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Review
                </Button>
              </>
            )}
            {/* Step 2 footer */}
            {importPreview && !importResults && (
              <>
                <Button variant="outline" onClick={() => { setImportPreview(null); setImportFile(null); }}>
                  Back
                </Button>
                <Button
                  onClick={() => importFile && bulkImportMutation.mutate(importFile)}
                  disabled={importPreview.valid === 0 || bulkImportMutation.isPending}
                >
                  {bulkImportMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  <Upload className="h-4 w-4 mr-1" />
                  Import {importPreview.valid > 0 ? `${importPreview.valid} Budget${importPreview.valid !== 1 ? "s" : ""}` : ""}
                </Button>
              </>
            )}
            {/* Step 3 footer */}
            {importResults && (
              <>
                <Button variant="outline" onClick={() => { setIsImportOpen(false); setImportResults(null); setImportFile(null); }}>
                  Close
                </Button>
                {importResults.errors > 0 && (
                  <Button variant="outline" onClick={() => { setImportResults(null); setImportPreview(null); setImportFile(null); }}>
                    Import Again
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAIEnabled("AI_BUDGET_CREATION") && (
        <Dialog
          open={isAIDialogOpen}
          onOpenChange={(open) => {
            setIsAIDialogOpen(open);
            if (!open) {
              setAiPrompt("");
              setAiEntityOptions([]);
              setAiSelectedEntityId("");
              setAiClarificationMessage("");
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Create Budget with AI
              </DialogTitle>
              <DialogDescription>
                Describe your budget in natural language and AI will create an
                editable draft with line items, reasons, and a suggested approval
                workflow.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea
                placeholder="Examples:
• Create HR annual budget FY2027
• IT budget for 500K AED
• Marketing budget 2025
• Finance department annual budget"
                value={aiPrompt}
                onChange={(e) => {
                  setAiPrompt(e.target.value);
                  if (aiEntityOptions.length > 0) {
                    setAiEntityOptions([]);
                    setAiSelectedEntityId("");
                    setAiClarificationMessage("");
                  }
                }}
                rows={5}
                className="resize-none"
                data-testid="textarea-ai-prompt"
              />
              {aiEntityOptions.length > 0 && (
                <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                  <Label className="text-sm font-medium">Business Entity</Label>
                  <p className="text-xs text-muted-foreground">
                    {aiClarificationMessage ||
                      "Multiple business entities could apply. Please choose one."}
                  </p>
                  <Select
                    value={aiSelectedEntityId}
                    onValueChange={setAiSelectedEntityId}
                  >
                    <SelectTrigger data-testid="select-ai-entity">
                      <SelectValue placeholder="Select business entity" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiEntityOptions.map((entity) => (
                        <SelectItem key={entity.id} value={String(entity.id)}>
                          {entity.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Mention the department and purpose. AI uses approved historical
                budgets, master data, and budget rules to estimate amounts and
                allocate cost centers.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAIDialogOpen(false);
                  setAiPrompt("");
                  setAiEntityOptions([]);
                  setAiSelectedEntityId("");
                  setAiClarificationMessage("");
                }}
                data-testid="button-ai-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  createBudgetWithAIMutation.mutate({
                    prompt: aiPrompt,
                    businessEntityId: aiSelectedEntityId || undefined,
                  })
                }
                disabled={
                  createBudgetWithAIMutation.isPending
                  || !aiPrompt.trim()
                  || (aiEntityOptions.length > 0 && !aiSelectedEntityId)
                }
                data-testid="button-ai-create"
              >
                {createBudgetWithAIMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                <Sparkles className="h-4 w-4 mr-1" />
                {aiEntityOptions.length > 0 ? "Continue" : "Generate Budget"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
