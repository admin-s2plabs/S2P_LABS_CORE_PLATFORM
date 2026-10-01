import { StatusCountBadges } from "@/components/status-count-badges";
import { FormSheet } from "@/components/form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, isBefore, parseISO, startOfDay } from "date-fns";
import {
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  Plus,
  Search,
  Truck,
  Upload,
  User,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

interface Organization {
  id: number;
  organization_name: string;
  currency: string;
}

interface PurchaseOrderHeader {
  po_number: string;
  po_description?: string | null;
  po_status: string | null;
  po_type: string | null;
  po_total_cost: string | number | null;
  po_currency: string | null;
  department_name: string | null;
  buyer_name: string | null;
  po_owner_name: string | null;
  creation_date: string | null;
  po_issue_date: string | null;
  po_required_date: string | null;
  delivertto_location_name: string | null;
  pr_number: string | null;
  budget_name: string | null;
  supplier_id: number | null;
  company_name: string | null;
  advance_flag: string | null;
  advance_percentage: number | null;
  currentApprover: string | null;
}

interface PurchaseOrdersResponse {
  data: PurchaseOrderHeader[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  exportLines?: PoExportLineRow[];
}

interface PoExportLineRow {
  po_number: string;
  po_description: string | null;
  po_status: string | null;
  po_type: string | null;
  po_total_cost: string | null;
  po_currency: string | null;
  department_name: string | null;
  buyer_name: string | null;
  po_owner_name: string | null;
  creation_date: string | null;
  po_issue_date: string | null;
  po_required_date: string | null;
  delivertto_location_name: string | null;
  pr_number: string | null;
  budget_name: string | null;
  company_name: string | null;
  line_id: number;
  line_number: number | null;
  line_description: string | null;
  line_qty: string | number | null;
  line_unit_cost: string | number | null;
  line_unit: string | null;
  tax_rate: string | number | null;
  tax_amount: string | number | null;
  line_cost: string | number | null;
  item_name: string | null;
  line_status: string | null;
  currentApprover: string | null;
}

interface StatsResponse {
  total: string;
  draft: string;
  pending_approval: string;
  more_info_required: string;
  approved: string;
  complete: string;
  closed: string;
  rejected: string;
  cancelled: string;
  sourcing: string;
  non_sourcing: string;
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
  "More Info Required": {
    label: "More Info Required",
    icon: AlertTriangle,
    variant: "outline",
    className: "border-amber-300 text-amber-600 dark:text-amber-400",
  },
  Approved: { label: "Approved", icon: CheckCircle2, variant: "default" },
  Complete: {
    label: "Complete",
    icon: Package,
    variant: "secondary",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  Closed: {
    label: "Closed",
    icon: CheckCircle2,
    variant: "secondary",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  Rejected: { label: "Rejected", icon: XCircle, variant: "destructive" },
  Cancelled: { label: "Cancelled", icon: XCircle, variant: "destructive" },
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

export default function PurchaseOrders() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const initialQueryParams = new URLSearchParams(location.split("?")[1] || "");
  const initialStatus = initialQueryParams.get("status") || "all";
  const initialSearch = initialQueryParams.get("search") || "";
  const initialPage = parseInt(initialQueryParams.get("page") || "1", 10) || 1;
  const initialLimit =
    parseInt(initialQueryParams.get("limit") || "10", 10) || 10;

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "sourcing" | "non-sourcing"
  >("all");
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Keep filters in sync with URL query params when navigating via dashboard cards
  function getSearchParams(): URLSearchParams {
    if (typeof window !== "undefined" && window.location?.search) {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams(location.split("?")[1] || "");
  }

  useEffect(() => {
    const queryParams = getSearchParams();
    setSearch(queryParams.get("search") || "");
    setStatusFilter(queryParams.get("status") || "all");
    setPage(parseInt(queryParams.get("page") || "1", 10) || 1);
    setLimit(parseInt(queryParams.get("limit") || "10", 10) || 10);
  }, [location]);

  const authData = localStorage.getItem("prokraya-auth");
  const authParsed = authData ? JSON.parse(authData) : {};
  const isSupplier = authParsed.role === "vendor";
  const userOrgIds: string[] = authParsed?.orgIds
    ? authParsed.orgIds.split(",").map((id: string) => id.trim())
    : [];
  const userRole: string = authParsed?.userRole || "";
  const isSuperadmin = userRole === "ROLE_SUPERADMIN" || userRole === "ROLE_SYSADMIN";
  const orgDetails = JSON.parse(localStorage.getItem("orgDetails") || "{}");
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const [newPO, setNewPO] = useState({
    description: "",
    supplierId: "",
    supplierName: "",
    deliveryLocation: "",
    requiredDate: "",
    requestorId: "",
    requestorName: "",
    requestorDepartment: "",
    orgId: "",
    currency: "",
    budgetId: "",
    budgetName: "",
    paymentTermsId: "",
    paymentTermsName: "",
    advanceFlag: false,
    advancePercentage: "",
  });

  const todayIso = format(new Date(), "yyyy-MM-dd");

  const { data: stats, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: ["/api/purchase-orders/stats"],
  });

  // Fetch suppliers for dropdown
  const { data: suppliersData } = useQuery<{
    data: { id: number; company_name: string }[];
    total: number;
  }>({
    queryKey: ["/api/dbo/suppliers", { page: 1, limit: 500, status: "Active,Changes In Draft" }],
    queryFn: () =>
      apiRequest("GET", "/api/dbo/suppliers?page=1&limit=500&status=Active%2CChanges%20In%20Draft").then((r) =>
        r.json(),
      ),
  });

  // Fetch locations for dropdown
  const { data: locationsData } = useQuery<
    { id: string; location_id: string; location_name: string; status: string }[]
  >({
    queryKey: ["/api/locations"],
  });

  // Fetch users for dropdown
  const { data: usersData } = useQuery<
    {
      id: number;
      name: string;
      user_name: string;
      department_name: string | null;
    }[]
  >({
    queryKey: ["/api/users/dropdown"],
  });

  // Fetch departments for dropdown
  const { data: departmentsData } = useQuery<{
    data: { id: number; code: string; value: string; status: string }[];
  }>({
    queryKey: ["/api/cost-centers/3/items?limit=100"],
  });

  const { data: currencyOptions = [] } = useQuery<
    { value: string; label: string }[]
  >({
    queryKey: ["/api/vendor/lookups/currencies"],
  });

  const { data: budgetLinesData } = useQuery<
    {
      id: number;
      segment_dtl_code: string;
      segment_dtl_name: string;
      amount: string;
      consumed_amount: string;
      reserved_amount: string;
      business_entity: string;
      budget_mst_id: number;
      budget_name: string;
      budget_curr: string;
      dept_id: string;
      loc_id: string
    }[]
  >({
    queryKey: ["/api/budgets/approved-lines"],
  });

  const { data: paymentTermsData } = useQuery<{
    data: {
      id: number;
      payment_term_id: string;
      terms_name: string;
      status: string;
    }[];
  }>({
    queryKey: ["/api/payment-terms?limit=100"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });
  
  const initializeBaseValues = useRef(false);

  useEffect(() => {
    if (initializeBaseValues.current) return;
    if (
      !orgDetails?.currency ||
      !currencyOptions.length ||
      !paymentTermsData?.data.length ||
      !orgDetails?.default_paymentterms
    ) return;
    initializeBaseValues.current = true;
    const defaultCurrency = currencyOptions.find(
      (t) => t.value === orgDetails.currency
    );
    const defaultTerm = paymentTermsData?.data.find(
      (t) => t.payment_term_id === orgDetails.default_paymentterms
    );
    setNewPO((prev: any) => {
      let updated = { ...prev };
      let changed = false;
      if (defaultCurrency && prev.currency !== defaultCurrency.value) {
        updated.currency = defaultCurrency.value;
        changed = true;
      }
      if (
        defaultTerm &&
        defaultTerm.status === "Y" &&
        prev.paymentTermsId !== defaultTerm.payment_term_id
      ) {
        updated.paymentTermsId = defaultTerm.payment_term_id;
        updated.paymentTermsName = defaultTerm.terms_name;
        changed = true;
      }
      return changed ? updated : prev;
    });
  }, [currencyOptions, paymentTermsData, orgDetails]);

  const budgetLines = budgetLinesData || [];
  const paymentTerms = (paymentTermsData?.data || []).filter(
    (pt) => pt.status === "Y",
  );

  const vendors = (suppliersData?.data || []) as {
    id: number;
    companyName?: string;
    company_name?: string;
  }[];
  const filteredVendors = vendors.filter((v) => {
    const name = v.companyName || v.company_name || "";
    return name.toLowerCase().includes(vendorSearch.toLowerCase());
  });
  const locations = (locationsData || []).filter((loc) => loc.status === "Y");
  const users = (Array.isArray(usersData) ? usersData : []) as {
    id: number;
    name: string;
    user_name: string;
    department_name: string | null;
  }[];
  const departments =
    departmentsData?.data?.filter((d) => d.status === "Y") || [];

  // Handle opening the create dialog - auto-populate Requestor with logged-in user
  const handleOpenCreateDialog = (open: boolean) => {
    if (open && users.length > 0) {
      const authData = localStorage.getItem("prokraya-auth");
      if (authData) {
        try {
          const auth = JSON.parse(authData);
          const loggedInUserId = auth.userId;
          const matchedUser = users.find(
            (u) => String(u.id) === String(loggedInUserId),
          );
          if (matchedUser) {
            const matchedDept = matchedUser.department_name
              ? departments.find(
                (d) =>
                  d.value?.toLowerCase() ===
                  matchedUser.department_name?.toLowerCase(),
              )
              : null;
            setNewPO((prev) => ({
              ...prev,
              requestorId: String(matchedUser.id),
              requestorName: matchedUser.name || matchedUser.user_name || "",
              requestorDepartment: matchedDept
                ? String(matchedDept.id)
                : prev.requestorDepartment,
            }));
          }
        } catch (e) {
          console.error("Error parsing auth data:", e);
        }
      }
    }
    setCreateDialogOpen(open);
  };

  const createPOMutation = useMutation({
    mutationFn: async (poData: typeof newPO) => {
      const res = await apiRequest("POST", "/api/purchase-orders", poData);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "PO Created",
        description: `Draft PO ${data.poNumber || ""} created successfully`,
      });
      setCreateDialogOpen(false);
      setVendorSearch("");
      setVendorDropdownOpen(false);
      setNewPO({
        description: "",
        supplierId: "",
        supplierName: "",
        deliveryLocation: "",
        requiredDate: "",
        requestorId: "",
        requestorName: "",
        requestorDepartment: "",
        orgId: "",
        currency: "",
        budgetId: "",
        budgetName: "",
        paymentTermsId: "",
        paymentTermsName: "",
        advanceFlag: false,
        advancePercentage: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders/stats"],
      });
      if (data.poNumber) {
        setLocation(`/app/purchase-orders/${data.poNumber}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create PO",
        variant: "destructive",
      });
    },
  });

  const handleCreatePO = () => {
    if (newPO.requiredDate) {
      const required = parseISO(newPO.requiredDate);
      const today = startOfDay(new Date());

      if (isBefore(required, today)) {
        toast({
          title: "Invalid Required Date",
          description:
            "Required Date cannot be in the past. Please select today or a future date.",
          variant: "destructive",
        });
        return;
      }
    }

    if (newPO.advanceFlag && (newPO.advancePercentage === null || newPO.advancePercentage === undefined || newPO.advancePercentage === "" || !newPO.advancePercentage)) {
      toast({
        title: "Validation Failure",
        description:
          "Please add Advance Percentage to Continue!",
        variant: "destructive",
      });
      return;
    }

    createPOMutation.mutate(newPO);
  };

  const buildPoFilterParams = (options?: { page?: number; limit?: number; exportLines?: boolean }) => {
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

  const queryParams = buildPoFilterParams();

  const { data: ordersData, isLoading } = useQuery<PurchaseOrdersResponse>({
    queryKey: [`/api/purchase-orders?${queryParams.toString()}`],
    staleTime: 0,
    refetchOnMount: true,
  });

  const orders = ordersData?.data || [];
  const pagination = ordersData?.pagination;

  const sourceBadgeItems = useMemo(
    () => [
      {
        value: "sourcing",
        label: "Sourcing",
        count: parseInt(stats?.sourcing || "0", 10) || 0,
      },
      {
        value: "non-sourcing",
        label: "Non-sourcing",
        count: parseInt(stats?.non_sourcing || "0", 10) || 0,
      },
    ],
    [stats],
  );

  const [isExporting, setIsExporting] = useState(false);

  const fetchExportData = async (): Promise<PurchaseOrdersResponse> => {
    const params = buildPoFilterParams({ page: 1, limit: 0, exportLines: true });
    const res = await apiRequest("GET", `/api/purchase-orders?${params.toString()}`);
    return res.json();
  };

  const poHeaderBaseRow = (po: {
    po_number: string;
    po_status: string | null;
    po_type: string | null;
    po_total_cost: string | number | null;
    po_currency: string | null;
    company_name: string | null;
    po_owner_name: string | null;
    buyer_name: string | null;
    department_name: string | null;
    creation_date: string | null;
    po_issue_date: string | null;
    po_required_date: string | null;
    delivertto_location_name: string | null;
    pr_number: string | null;
    currentApprover: string | null;
  }) => ({
    "PO Number": po.po_number || "",
    "Current Approver": po.currentApprover || "",
    Status: po.po_status || "",
    Type: po.po_type || "",
    Amount: po.po_total_cost ? Number(po.po_total_cost) : null,
    Currency: po.po_currency || "",
    Supplier: po.company_name || "",
    Requestor: po.po_owner_name || "",
    Buyer: po.buyer_name || "",
    Department: po.department_name || "",
    "Created Date": po.creation_date
      ? formatDate(po.creation_date)
      : "",
    "Issue Date": po.po_issue_date
      ? formatDate(po.po_issue_date)
      : "",
    "Required Date": po.po_required_date
      ? formatDate(po.po_required_date)
      : "",
    "Delivery Location": po.delivertto_location_name || "",
    "PR Number": po.pr_number || "",
  });

  const poSummaryRow = (po: PurchaseOrderHeader) => ({
    ...poHeaderBaseRow(po),
    "Advance Payment": po.advance_flag === "Y" ? "Yes" : "No",
    "Advance %": po.advance_percentage ? String(po.advance_percentage) : "",
  });

  const emptyPoLineFields = () => ({
    "Line ID": "",
    "Line #": "",
    Description: "",
    "Line Qty": "",
    "Unit Cost": "",
    UOM: "",
    "Tax %": "",
    "Tax Amount": "",
    "Line Cost": "",
    "Item Name": "",
    "Line Status": "",
  });

  const mapPoExportLineToFlatRow = (row: PoExportLineRow) => ({
    ...poHeaderBaseRow({
      po_number: row.po_number,
      po_status: row.po_status,
      po_type: row.po_type,
      po_total_cost: row.po_total_cost ? Number(row.po_total_cost) : null,
      po_currency: row.po_currency,
      department_name: row.department_name,
      buyer_name: row.buyer_name,
      po_owner_name: row.po_owner_name,
      creation_date: row.creation_date,
      po_issue_date: row.po_issue_date,
      po_required_date: row.po_required_date,
      delivertto_location_name: row.delivertto_location_name,
      pr_number: row.pr_number,
      company_name: row.company_name,
      currentApprover: row.currentApprover || null,
    }),
    "Line ID": row.line_id ?? "",
    "Line #": row.line_number ?? "",
    Description: row.line_description || "",
    "Line Qty": row.line_qty ? Number(row.line_qty) : null,
    "Unit Cost": row.line_unit_cost ? Number(row.line_unit_cost) : null,
    UOM: row.line_unit || "",
    "Tax %": row.tax_rate ?? "",
    "Tax Amount": row.tax_amount ? Number(row.tax_amount) : null,
    "Line Cost": row.line_cost ? Number(row.line_cost) : null,
    "Item Name": row.item_name || "",
    "Line Status": row.line_status || "",
  });

  const getExportPoPayload = async () => {
    const result = await fetchExportData();
    const exportPO = result.data || [];
    const rawLines = result.exportLines ?? [];
    const summaryRows = exportPO.map(poSummaryRow);
    const lineRowsFromApi = rawLines.map(mapPoExportLineToFlatRow);
    const poNumbersWithLines = new Set(rawLines.map((r) => r.po_number));
    const fillerRows = exportPO
      .filter((po) => !poNumbersWithLines.has(po.po_number))
      .map((po) => ({ ...poHeaderBaseRow(po), ...emptyPoLineFields() }));
    const lineRowsFlat = [...lineRowsFromApi, ...fillerRows];
    return { summaryRows, lineRowsFlat };
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
    const { summaryRows, lineRowsFlat } = await getExportPoPayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No purchase orders match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const block = (rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return "";
      const headers = Object.keys(rows[0]);
      return [
        headers.join(","),
        ...rows.map((row) =>
          headers.map((h) => esc(String(row[h] ?? ""))).join(","),
        ),
      ].join("\n");
    };
    const csvParts = [block(summaryRows), "", "PO line items", block(lineRowsFlat)].filter(Boolean);
    const csv = csvParts.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase_orders_${statusFilter}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export purchase orders",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
    const { summaryRows, lineRowsFlat } = await getExportPoPayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No purchase orders match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Purchase Orders");
    if (lineRowsFlat.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRowsFlat), "PO lines");
    }
    XLSX.writeFile(
      wb,
      `purchase_orders_${statusFilter}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    toast({ title: "Exported to Excel" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export purchase orders",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
    const { summaryRows } = await getExportPoPayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No purchase orders match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const columns = Object.keys(summaryRows[0]);
    const rows = summaryRows.map((row) =>
      columns.map((col) => String((row as Record<string, unknown>)[col] ?? "")),
    );
    generateTablePdf({
      title: "Purchase Orders",
      subtitle: [
        statusFilter !== "all" ? `Status: ${statusFilter}` : null,
        search.trim() ? `Search: ${search.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" | ") || "All purchase orders",
      columns,
      rows,
      filename: `purchase_orders_${statusFilter}_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export purchase orders",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const statCards = isSupplier
    ? [
      {
        title: "Total POs",
        value: stats?.total || "0",
        icon: ClipboardList,
        color: "text-primary",
        bgColor: "bg-primary/10",
        filterValue: "all",
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
        title: "Complete",
        value: stats?.complete || "0",
        icon: Package,
        color: "text-blue-500",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        filterValue: "Complete",
      },
      {
        title: "Closed",
        value: stats?.closed || "0",
        icon: XCircle,
        color: "text-slate-500",
        bgColor: "bg-slate-100 dark:bg-slate-800",
        filterValue: "Closed",
      },
    ]
    : [
      {
        title: "Total POs",
        value: stats?.total || "0",
        icon: ClipboardList,
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
        title: "More Info Required",
        value: stats?.more_info_required || "0",
        icon: AlertTriangle,
        color: "text-amber-500",
        bgColor: "bg-amber-100 dark:bg-amber-900/30",
        filterValue: "More Info Required",
      },
      {
        title: "Pending + info",
        value: String(
          (parseInt(stats?.pending_approval || "0", 10) || 0) +
            (parseInt(stats?.more_info_required || "0", 10) || 0),
        ),
        icon: AlertTriangle,
        color: "text-amber-600",
        bgColor: "bg-amber-100 dark:bg-amber-900/30",
        filterValue: "Pending Approval,More Info Required",
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
        title: "Complete",
        value: stats?.complete || "0",
        icon: Package,
        color: "text-blue-500",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        filterValue: "Complete",
      },
      {
        title: "Closed",
        value: stats?.closed || "0",
        icon: CheckCircle2,
        color: "text-slate-600",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        filterValue: "Closed",
      },
      {
        title: "Rejected",
        value: stats?.rejected || "0",
        icon: XCircle,
        color: "text-destructive",
        bgColor: "bg-destructive/10",
        filterValue: "Rejected",
      },
      {
        title: "Cancelled",
        value: stats?.cancelled || "0",
        icon: Ban,
        color: "text-destructive",
        bgColor: "bg-destructive/10",
        filterValue: "Cancelled",
      },
    ];

  const filteredBudgets = budgetLines?.filter((item) => {

    const matchOrg =
      !newPO.orgId || item.business_entity === newPO.orgId;

    const matchDept =
      !newPO.requestorDepartment ||
      String(item.dept_id) === String(newPO.requestorDepartment);

    const matchLoc =
      !newPO.deliveryLocation ||
      String(item.loc_id) === String(newPO.deliveryLocation);

    return matchOrg && matchDept && matchLoc;
  });

  const uniqueBudgets = Array.from(
    new Map(
      filteredBudgets?.map((item) => [item.id, item])
    ).values()
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">
            Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            View and manage purchase orders
          </p>
        </div>
        {!isSupplier && (
          <>
          <Button size="sm" onClick={() => handleOpenCreateDialog(true)} data-testid="button-create-po">
            <Plus className="h-4 w-4 mr-2" />
            Create PO
          </Button>
          <FormSheet
            open={createDialogOpen}
            onOpenChange={handleOpenCreateDialog}
            title="Create Purchase Order"
            onSubmit={handleCreatePO}
            submitLabel={createPOMutation.isPending ? "Creating..." : "Create"}
            isSubmitting={createPOMutation.isPending}
            submitDisabled={
              createPOMutation.isPending ||
              !newPO.description ||
              !newPO.supplierId ||
              !newPO.deliveryLocation ||
              !newPO.requiredDate ||
              !newPO.requestorId ||
              !newPO.requestorDepartment ||
              !newPO.orgId ||
              !newPO.currency ||
              !newPO.budgetId ||
              !newPO.paymentTermsId
            }
            widthClassName="w-full sm:max-w-3xl"
          >
              <p className="text-xs text-muted-foreground mb-4">
                <span className="text-destructive">*</span> Indicates mandatory fields
              </p>
              <div className="mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="po-description">
                      PO Description <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="po-description"
                      placeholder="Enter a brief description of purchase order"
                      value={newPO.description}
                      onChange={(e) =>
                        setNewPO({ ...newPO, description: e.target.value })
                      }
                      data-testid="input-po-description"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="po-delivery-location">
                      Delivery Location{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newPO.deliveryLocation}
                      onValueChange={(v) =>
                        setNewPO({ ...newPO, deliveryLocation: v })
                      }
                    >
                      <SelectTrigger data-testid="select-delivery-location">
                        <SelectValue placeholder="Select Location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={String(loc.id)}>
                            {loc.location_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="po-required-date">
                      Required Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="po-required-date"
                      type="date"
                      min={todayIso}
                      value={newPO.requiredDate}
                      onChange={(e) =>
                        setNewPO({ ...newPO, requiredDate: e.target.value })
                      }
                      data-testid="input-required-date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="po-requestor">
                      Requestor <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newPO.requestorId}
                      onValueChange={(v) => {
                        const selectedUser = users.find(
                          (u) => String(u.id) === v,
                        );
                        const matchedDept = selectedUser?.department_name
                          ? departments.find(
                            (d) =>
                              d.value?.toLowerCase() ===
                              selectedUser.department_name?.toLowerCase(),
                          )
                          : null;
                        setNewPO({
                          ...newPO,
                          requestorId: v,
                          requestorName:
                            selectedUser?.name || selectedUser?.user_name || "",
                          requestorDepartment: matchedDept
                            ? String(matchedDept.id)
                            : newPO.requestorDepartment,
                        });
                      }}
                      disabled={!isSuperadmin}
                    >
                      <SelectTrigger data-testid="select-requestor">
                        <SelectValue placeholder="Select Requestor" />
                      </SelectTrigger>
                      <SelectContent>
                        {users
                          .filter((u) => u.id)
                          .map((user) => (
                            <SelectItem key={user.id} value={String(user.id)}>
                              {user.name || user.user_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="po-business-entity">
                      Business Entity <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newPO.orgId || ""}
                      onValueChange={(value) => {
                        setNewPO({ ...newPO, budgetId: "", budgetName: "", orgId: value, currency: organizations?.filter((item) => String(item.id) === String(value))[0]?.currency });
                      }}
                    >
                      <SelectTrigger data-testid="select-pr-business-entity">
                        <SelectValue placeholder="Select business entity..." />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations
                          ?.filter((org) => !isSuperadmin ? userOrgIds.includes(String(org.id)) : true)
                          ?.map((org) => (
                            <SelectItem key={org.id} value={String(org.id)}>
                              {org.organization_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="po-department">
                      Department{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newPO.requestorDepartment}
                      onValueChange={(v) =>
                        setNewPO({ ...newPO, requestorDepartment: v, budgetId: "", budgetName: "" })
                      }
                    >
                      <SelectTrigger data-testid="select-department">
                        <SelectValue placeholder="Select Department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={String(dept.id)}>
                            {dept.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2 space-y-1.5 relative">
                    <Label>
                      Vendor <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={
                          vendorDropdownOpen
                            ? vendorSearch
                            : newPO.supplierName || vendorSearch
                        }
                        onChange={(e) => {
                          setVendorSearch(e.target.value);
                          setVendorDropdownOpen(true);
                          if (!e.target.value) {
                            setNewPO({
                              ...newPO,
                              supplierId: "",
                              supplierName: "",
                            });
                          }
                        }}
                        onFocus={() => setVendorDropdownOpen(true)}
                        onBlur={() =>
                          setTimeout(() => setVendorDropdownOpen(false), 200)
                        }
                        placeholder="Search by Name..."
                        className="pl-8"
                        data-testid="input-vendor-search"
                      />
                      {vendorDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 w-full mt-1 border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                          {filteredVendors.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-2">
                              No vendors found
                            </p>
                          ) : (
                            filteredVendors.slice(0, 20).map((vendor) => {
                              const name =
                                vendor.companyName || vendor.company_name || "";
                              return (
                                <button
                                  key={vendor.id}
                                  className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setNewPO({
                                      ...newPO,
                                      supplierId: String(vendor.id),
                                      supplierName: name,
                                    });
                                    setVendorDropdownOpen(false);
                                    setVendorSearch("");
                                  }}
                                  data-testid={`vendor-option-${vendor.id}`}
                                >
                                  {name}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="po-budget">Budget <span className="text-destructive">*</span></Label>
                    <Select
                      value={newPO.budgetId}
                      onValueChange={(v) => {
                        const selectedBudget = budgetLines?.filter((item) => {
                          const entityMatch = item.business_entity?.split(",").filter(Boolean).includes(String(newPO.orgId));
                          const deptMatch = !item.dept_id || !newPO.requestorDepartment ||
                            item.dept_id.split(",").map((d) => d.trim()).includes(String(newPO.requestorDepartment));
                          return entityMatch && deptMatch;
                        })?.filter((u) => u.id).find(
                          (bl) => String(bl.id) === v,
                        );
                        setNewPO({
                          ...newPO,
                          budgetId: v,
                          budgetName: selectedBudget
                            ? `${selectedBudget.budget_name} . ${selectedBudget.segment_dtl_name}`
                            : "",
                        });
                      }}
                    >
                      <SelectTrigger data-testid="select-budget">
                        <SelectValue placeholder="Select Budget">
                          {newPO.budgetId &&
                            (() => {
                              const selected = budgetLines
                                ?.filter((item) => {
                                  const matchOrg =
                                    !newPO.orgId || item.business_entity === newPO.orgId;

                                  const matchDept =
                                    !newPO.requestorDepartment ||
                                    String(item.dept_id) === String(newPO.requestorDepartment);

                                  const matchLoc =
                                    !newPO.deliveryLocation ||
                                    String(item.loc_id) === String(newPO.deliveryLocation);

                                  return matchOrg && matchDept && matchLoc;
                                })
                                ?.find((bl) => String(bl.id) === newPO.budgetId);
                              return selected
                                ? `${selected.budget_name} . ${selected.segment_dtl_name}`
                                : "Select Budget";
                            })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueBudgets?.length > 0 ? uniqueBudgets
                          ?.map((budgetLine) => {
                            const lineAmount = Math.max(
                              0,
                              (parseFloat(budgetLine.amount) || 0) -
                                (parseFloat(budgetLine.consumed_amount) || 0) -
                                (parseFloat(budgetLine.reserved_amount) || 0),
                            );
                            const currencySymbol =
                              budgetLine.budget_curr === "INR"
                                ? "₹ "
                                : budgetLine.budget_curr === "USD"
                                  ? "$ "
                                  : budgetLine.budget_curr === "AED"
                                    ? "AED "
                                    : budgetLine.budget_curr === "EUR"
                                      ? "€ "
                                      : budgetLine.budget_curr === "GBP"
                                        ? "£ "
                                        : budgetLine.budget_curr + " ";
                            return (
                              <SelectItem
                                key={budgetLine.id}
                                value={String(budgetLine.id)}
                                className="py-2"
                              >
                                <div className="flex flex-col">
                                  <span>
                                    {budgetLine.budget_name} .{" "}
                                    {budgetLine.segment_dtl_name}
                                  </span>
                                  <span className="text-xs text-green-600">
                                    Available Budget - {currencySymbol}
                                    {lineAmount.toLocaleString("en-IN", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                              </SelectItem>
                            );
                          }) : <div className="p-2 text-sm text-muted-foreground">
                          No budgets available in selected entity
                        </div>}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="po-currency">
                      Currency <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newPO.currency}
                      onValueChange={(v) => setNewPO({ ...newPO, currency: v })}
                    >
                      <SelectTrigger data-testid="select-currency">
                        <SelectValue placeholder="Select Currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {currencyOptions.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="po-payment-terms">Payment Terms <span className="text-destructive">*</span></Label>
                    <Select
                      value={newPO.paymentTermsId}
                      onValueChange={(v) => {
                        const selectedTerm = paymentTerms.find(
                          (pt) => String(pt.id) === v,
                        );
                        setNewPO({
                          ...newPO,
                          paymentTermsId: v,
                          paymentTermsName: selectedTerm?.terms_name || "",
                        });
                      }}
                    >
                      <SelectTrigger data-testid="select-payment-terms">
                        <SelectValue placeholder="Select Payment Terms" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentTerms.map((pt) => (
                          <SelectItem key={pt.id} value={String(pt.id)}>
                            {pt.terms_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="po-advance-flag"
                        checked={newPO.advanceFlag}
                        onCheckedChange={(checked) =>
                          setNewPO({
                            ...newPO,
                            advanceFlag: !!checked,
                            advancePercentage: checked
                              ? newPO.advancePercentage
                              : "",
                          })
                        }
                        data-testid="checkbox-advance-flag"
                      />
                      <Label
                        htmlFor="po-advance-flag"
                        className="cursor-pointer"
                      >
                        Advance Payment %
                      </Label>
                    </div>
                    {newPO.advanceFlag && (
                      <div className="space-y-1">
                        <Input
                          id="po-advance-pct"
                          type="text"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="e.g. 10"
                          value={newPO.advancePercentage}
                          onChange={(e) => {
                            let value = e.target.value;
                            if (value === "") {
                              setNewPO({ ...newPO, advancePercentage: "" });
                              return;
                            }
                            if (!/^\d*\.?\d*$/.test(value)) return;
                            let num = Number(value);
                            if (num < 0 || num > 100) return;
                            setNewPO({
                              ...newPO,
                              advancePercentage: value,
                            });
                          }}
                          inputMode="decimal"
                          data-testid="input-advance-percentage"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
          </FormSheet>
          </>
        )}
      </div>

      <div
        className={`grid gap-3 ${isSupplier ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"}`}
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
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
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
              setSourceFilter(v as "all" | "sourcing" | "non-sourcing");
              setPage(1);
            }}
            items={sourceBadgeItems}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by PO, Vendor, Requestor, Buyer, Department..."
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
                  {!isSupplier && (
                    <SelectItem value="Draft">
                      Draft ({stats?.draft || 0})
                    </SelectItem>
                  )}
                  {!isSupplier && (
                    <SelectItem value="Pending Approval">
                      Pending ({stats?.pending_approval || 0})
                    </SelectItem>

                  )}
                  {!isSupplier && (
                    <SelectItem value="More Info Required">
                      More Info Required ({stats?.more_info_required || 0})
                    </SelectItem>
                  )}
                  {!isSupplier && (
                    <SelectItem value="Pending Approval,More Info Required">
                      Pending & more info (
                      {Number(stats?.pending_approval) || 0 +
                        Number(stats?.more_info_required) || 0}
                      )
                    </SelectItem>
                  )}
                  <SelectItem value="Approved">
                    Approved ({stats?.approved || 0})
                  </SelectItem>
                  <SelectItem value="Complete">
                    Complete ({stats?.complete || 0})
                  </SelectItem>
                  <SelectItem value="Closed">
                    Closed ({stats?.closed || 0})
                  </SelectItem>
                  {!isSupplier && (
                    <SelectItem value="Rejected">
                      Rejected ({stats?.rejected || 0})
                    </SelectItem>
                  )}
                  {!isSupplier && (
                    <SelectItem value="Cancelled">
                      Cancelled ({stats?.cancelled || 0})
                    </SelectItem>
                  )}
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
                  <TableHead className="text-xs font-medium w-[120px]">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      PO Number
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[100px]">
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
                  <TableHead className="text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      Requestor
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" />
                      Buyer
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Department
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium text-right w-[100px]">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[90px]">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Created
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[90px]">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Delivery
                    </span>
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[120px]">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Current Approver
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center py-12 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
                        <h3 className="text-base font-medium mb-1">
                          No purchase orders found
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {search || statusFilter !== "all"
                            ? "Try adjusting your search or filters"
                            : "No purchase orders available in the system"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((po) => (
                    <TableRow
                      key={po.po_number}
                      className="cursor-pointer h-10"
                      onClick={() =>
                        (window.location.href = `/app/purchase-orders/${po.po_number}`)
                      }
                      data-testid={`row-po-${po.po_number}`}
                    >
                      <TableCell className="font-mono text-sm font-medium text-primary py-2">
                        {po.po_number}
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={po.po_status} />
                      </TableCell>
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[120px] cursor-default">
                              {po.company_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{po.company_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[100px] cursor-default">
                              {po.po_owner_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{po.po_owner_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[100px] cursor-default">
                              {po.buyer_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{po.buyer_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[100px] cursor-default">
                              {po.department_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{po.department_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2 text-sm font-medium text-right">
                        {formatCurrency(po.po_total_cost, po.po_currency)}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(po.creation_date)}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(po.po_required_date)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2 whitespace-nowrap">
                        {po.currentApprover || "-"}
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
                  size="sm"
                  className="h-7 w-7 p-0"
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
                  size="sm"
                  className="h-7 w-7 p-0"
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
