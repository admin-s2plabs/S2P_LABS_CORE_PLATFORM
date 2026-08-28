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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Eye,
  FileCheck,
  FileDown,
  FileSpreadsheet,
  FileText,
  Handshake,
  PenLine,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  Upload,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";
import ContractFormSheet from "./contract-form-sheet";
import { CreatePOFromContractSheet } from "./create-po-from-contract-sheet";

interface Contract {
  id: number;
  title: string;
  status: string;
  type: string;
  contr_ref_no: string | null;
  contract_amount: number | string | null;
  owner: string | null;
  department_name: string | null;
  start_date: string | null;
  end_date: string | null;
  creation_date: string | null;
  created_by: string | null;
  requestor_name: string | null;
  bid_ref_no: string | null;
  version: string | null;
  template_name: string | null;
  description: string | null;
  last_modified_date: string | null;
  vendor_names: string;
  currency: string | null;
  all_lines_have_po: boolean;
  po_numbers: string | null;
}

const PUBLISHED_STATUSES = [
  "Vendor Submit For Negotiation",
  "Closed",
  "Cancelled",
  "Under Negotiation",
  "Negotiation Under Review",
  "Terminated",
  "More Info Required for Termination",
  "Pending Termination",
  "Termination Rejected",
  "Expired",
  "Approved",
  "Accepted",
  "Signed",
  "Pending Approval",
  "Active",
  "Pending Signature",
  "Supplier Submit For Negotiation",
];

const contractStatusConfig: Record<string, {
  label: string;
  icon: typeof Clock;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}> = {
  // ── Draft-table statuses ──────────────────────────────────────────────────
  "Draft":                             { label: "Draft",                icon: FileText,    variant: "secondary" },
  "Pending Signature":                 { label: "Pending Signature",    icon: PenLine,     variant: "outline",   className: "border-amber-300 text-amber-600 dark:text-amber-400" },
  "Under Review":                      { label: "Under Review",         icon: Eye,         variant: "outline",   className: "border-purple-300 text-purple-600 dark:text-purple-400" },
  "Review Completed":                  { label: "Review Completed",     icon: CircleDot,   variant: "secondary", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  "Review Rejected":                   { label: "Review Rejected",      icon: XCircle,     variant: "destructive" },
  "Rejected":                          { label: "Rejected",             icon: XCircle,     variant: "destructive" },
  "Deleted":                           { label: "Deleted",              icon: Ban,         variant: "secondary" },
  // ── Published-table statuses ─────────────────────────────────────────────
  "Approved":                          { label: "Approved",             icon: CheckCircle2, variant: "secondary", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "Active":                            { label: "Active",               icon: CheckCircle2, variant: "secondary", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "Accepted":                          { label: "Accepted",             icon: FileCheck,   variant: "secondary", className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  "Signed":                            { label: "Signed",               icon: PenLine,     variant: "secondary", className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  "Under Negotiation":                 { label: "Under Negotiation",    icon: Handshake,   variant: "outline",   className: "border-blue-300 text-blue-600 dark:text-blue-400" },
  "Vendor Submit For Negotiation":     { label: "Vendor Submitted",     icon: RotateCcw,   variant: "secondary", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  "Supplier Submit For Negotiation":   { label: "Supplier Submitted",   icon: RotateCcw,   variant: "secondary", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  "Negotiation Under Review":          { label: "Negotiation Under Review", icon: Eye,     variant: "outline",   className: "border-purple-300 text-purple-600 dark:text-purple-400" },
  "Pending Approval":                  { label: "Pending Approval",     icon: Clock,       variant: "outline",   className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "Cancelled":                         { label: "Cancelled",            icon: Ban,         variant: "destructive" },
  "Closed":                            { label: "Closed",               icon: XCircle,     variant: "secondary" },
  "Expired":                           { label: "Expired",              icon: Clock,       variant: "secondary" },
  "Terminated":                        { label: "Terminated",           icon: Ban,         variant: "destructive" },
  "Pending Termination":               { label: "Pending Termination",  icon: AlertTriangle, variant: "outline", className: "border-red-300 text-red-600 dark:text-red-400" },
  "More Info Required for Termination":{ label: "More Info Required",   icon: AlertTriangle, variant: "outline", className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "Termination Rejected":              { label: "Termination Rejected", icon: XCircle,     variant: "destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = contractStatusConfig[status] || { label: status, icon: CircleDot, variant: "outline" as const };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className={`gap-1 ${cfg.className || ""}`} data-testid={`status-badge-${status}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

const PAGE_SIZE = 10;

const DRAFT_STATUS_OPTIONS = [
  "Draft",
  "Under Review",
  "Review Completed",
  "Review Rejected",
  "Rejected",
  "More Info Required",
  "Deleted",
] as const;

const PENDING_ACTION_STATUSES = [
  "Pending Approval",
  "Pending Termination",
  "More Info Required for Termination",
] as const;

const STATUS_TO_STAT_CARD: Record<string, string> = {
  "Under Negotiation": "In Negotiation",
  "Vendor Submit For Negotiation": "In Negotiation",
  "Supplier Submit For Negotiation": "In Negotiation",
  "Negotiation Under Review": "In Negotiation",
  "Pending Signature": "Pending Signature",
  "Pending Approval": "Pending Action",
  "Pending Termination": "Pending Action",
  "More Info Required for Termination": "Pending Action",
  "Active": "Active",
  "Approved": "Active",
  "Signed": "Active",
  "Accepted": "Active",
};

export default function Contracts() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [publishedStatusFilter, setPublishedStatusFilter] = useState("all");
  const [draftStatusFilter, setDraftStatusFilter] = useState("all");
  const [publishedPage, setPublishedPage] = useState(1);
  const [draftPage, setDraftPage] = useState(1);
  const [listTab, setListTab] = useState<"published" | "draft">("published");
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null);
  const [poDialogContract, setPoDialogContract] = useState<{ id: number; refNo: string } | null>(null);
  const [createdPoByContract, setCreatedPoByContract] = useState<Record<number, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const status = params.get("status");
    if (!status) return;
    const statuses = status
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      statuses.length > 0 &&
      statuses.every((s) =>
        (PENDING_ACTION_STATUSES as readonly string[]).includes(s),
      )
    ) {
      setActiveStatCard("Pending Action");
      setListTab("published");
      return;
    }
    const card = STATUS_TO_STAT_CARD[statuses[0] ?? status];
    if (card) {
      setActiveStatCard(card);
      setListTab("published");
    }
  }, [searchString]);

  const { data: contracts, isLoading } = useQuery<Contract[]>({
    queryKey: ["/api/contracts/list"],
    refetchOnMount: "always",
    staleTime: 0,
  });

  const isPublished = (s: string) => PUBLISHED_STATUSES.includes(s);

  function matchesStatCard(c: Contract): boolean {
    switch (activeStatCard) {
      case "Active":
        return ["Active", "Approved", "Signed", "Accepted"].includes(c.status);
      case "In Negotiation":
        return ["Under Negotiation", "Vendor Submit For Negotiation", "Supplier Submit For Negotiation"].includes(c.status);
      case "Pending Signature":
        return c.status === "Pending Signature";
      case "Expiring in 30d": {
        if (!c.end_date) return false;
        const diff = (new Date(c.end_date).getTime() - Date.now()) / 86400000;
        return diff >= 0 && diff <= 30;
      }
      case "Pending Action":
        return ["Pending Approval", "Pending Termination", "More Info Required for Termination"].includes(c.status);
      default:
        return true;
    }
  }

  function matchesSearch(c: Contract) {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.title || "").toLowerCase().includes(q) ||
      (c.contr_ref_no || "").toLowerCase().includes(q) ||
      (c.vendor_names || "").toLowerCase().includes(q) ||
      (c.department_name || "").toLowerCase().includes(q) ||
      (c.owner || "").toLowerCase().includes(q) ||
      (c.requestor_name || "").toLowerCase().includes(q) ||
      String(c.id).includes(q)
    );
  }

  const publishedPoolForBadges = useMemo(
    () =>
      (contracts || []).filter(
        (c) => isPublished(c.status) && matchesSearch(c),
      ),
    [contracts, search],
  );

  const draftPoolForBadges = useMemo(
    () =>
      (contracts || []).filter(
        (c) => !isPublished(c.status) && matchesSearch(c),
      ),
    [contracts, search],
  );

  const publishedStatusBadgeItems = useMemo(
    () =>
      PUBLISHED_STATUSES.map((status) => ({
        value: status,
        label: status,
        count: publishedPoolForBadges.filter((c) => c.status === status)
          .length,
      })),
    [publishedPoolForBadges],
  );

  const draftStatusBadgeItems = useMemo(
    () =>
      DRAFT_STATUS_OPTIONS.map((status) => ({
        value: status,
        label: status,
        count: draftPoolForBadges.filter((c) => c.status === status).length,
      })),
    [draftPoolForBadges],
  );

  const publishedContracts = (contracts || []).filter(
    (c) =>
      isPublished(c.status) &&
      matchesSearch(c) &&
      (publishedStatusFilter === "all" ||
        c.status === publishedStatusFilter) &&
      matchesStatCard(c),
  );
  const draftContracts = (contracts || []).filter(
    (c) => !isPublished(c.status) && matchesSearch(c) && (draftStatusFilter === "all" || c.status === draftStatusFilter)
  );

  const publishedPageCount = Math.ceil(publishedContracts.length / PAGE_SIZE) || 1;
  const draftPageCount = Math.ceil(draftContracts.length / PAGE_SIZE) || 1;
  const pagedPublished = publishedContracts.slice((publishedPage - 1) * PAGE_SIZE, publishedPage * PAGE_SIZE);
  const pagedDraft = draftContracts.slice((draftPage - 1) * PAGE_SIZE, draftPage * PAGE_SIZE);

  const publishedOnly = (contracts || []).filter((c) => isPublished(c.status));
  const totalContracts = contracts?.length || 0;
  const activeCount = publishedOnly.filter((c) => ["Active", "Approved", "Signed", "Accepted"].includes(c.status)).length;
  const inNegotiationCount = publishedOnly.filter((c) => ["Under Negotiation", "Vendor Submit For Negotiation", "Supplier Submit For Negotiation"].includes(c.status)).length;
  const expiringSoon = publishedOnly.filter((c) => {
    if (!c.end_date) return false;
    const diff = (new Date(c.end_date).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 30;
  }).length;
  const pendingActionCount = publishedOnly.filter((c) => ["Pending Approval", "Pending Termination", "More Info Required for Termination"].includes(c.status)).length;
  const pendingSignatureCount = publishedOnly.filter((c) => c.status === "Pending Signature").length;

  const statCards = [
    { title: "Total Contracts",    value: totalContracts,       icon: ScrollText,     color: "text-primary",      bgColor: "bg-primary/10" },
    { title: "Active",             value: activeCount,           icon: CheckCircle2,   color: "text-emerald-600",  bgColor: "bg-emerald-100 dark:bg-emerald-900/30" },
    { title: "In Negotiation",     value: inNegotiationCount,    icon: Handshake,      color: "text-blue-600",     bgColor: "bg-blue-100 dark:bg-blue-900/30" },
    { title: "Pending Signature",  value: pendingSignatureCount, icon: PenLine,        color: "text-violet-600",   bgColor: "bg-violet-100 dark:bg-violet-900/30" },
    { title: "Expiring in 30d",    value: expiringSoon,          icon: AlertTriangle,  color: "text-amber-600",    bgColor: "bg-amber-100 dark:bg-amber-900/30" },
    { title: "Pending Action",     value: pendingActionCount,    icon: Clock,          color: "text-orange-600",   bgColor: "bg-orange-100 dark:bg-orange-900/30" },
  ];

  function getExportRows(rows: Contract[]) {
    return rows.map((c) => ({
      "Contract Ref": c.contr_ref_no || c.id,
      "Title": c.title || "",
      "Status": c.status || "",
      "Type": c.type || "",
      "Vendor": c.vendor_names || "",
      "Department": c.department_name || "",
      "Amount": c.contract_amount ? Number(c.contract_amount) : null,
      "Currency": c.currency || "",
      "Start Date": formatDate(c.start_date),
      "End Date": formatDate(c.end_date),
      "Owner": c.requestor_name || c.owner || "",
      "Created Date": formatDate(c.creation_date)
    }));
  }

  function exportCSV(rows: Contract[]) {
    if (!rows.length) { toast({ title: "No data to export", variant: "destructive" }); return; }
    const data = getExportRows(rows);
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map((r) => headers.map((h) => `"${(r as any)[h] || ""}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `contracts_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast({ title: "Exported to CSV" });
  }

  function exportExcel(rows: Contract[]) {
    if (!rows.length) { toast({ title: "No data to export", variant: "destructive" }); return; }
    const ws = XLSX.utils.json_to_sheet(getExportRows(rows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contracts");
    XLSX.writeFile(wb, `contracts_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported to Excel" });
  }

  const renderTable = (
    rows: Contract[],
    page: number,
    totalPages: number,
    totalCount: number,
    onPageChange: (p: number) => void,
    emptyMessage: string,
    tableId: string,
  ) => {
    const isDraft = tableId === "draft";
    const colCount = isDraft ? 5 : 7;
    return (
    <CardContent className="p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-medium whitespace-nowrap">
                <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Ref No</span>
              </TableHead>
              <TableHead className="text-xs font-medium whitespace-nowrap">
                <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Status</span>
              </TableHead>
              <TableHead className="text-xs font-medium whitespace-nowrap">Title</TableHead>
              {!isDraft && (
                <TableHead className="text-xs font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Supplier</span>
                </TableHead>
              )}
              <TableHead className="text-xs font-medium whitespace-nowrap">
                <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Period</span>
              </TableHead>
              {!isDraft && (
                <TableHead className="text-xs font-medium whitespace-nowrap text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <ScrollText className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <h3 className="text-base font-medium mb-1">{emptyMessage}</h3>
                    <p className="text-sm text-muted-foreground">
                      {search || publishedStatusFilter !== "all" || draftStatusFilter !== "all"
                        ? "Try adjusting your search or filters"
                        : "No contracts available"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="h-10 cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    // Clear any stale taskId from a previous My Tasks / Bell navigation
                    // so contract-detail falls back to the active-task API for this contract
                    sessionStorage.removeItem("currentTaskId");
                    queryClient.invalidateQueries({ queryKey: ["/api/contracts", String(c.id)] });
                    navigate(`/app/contracts/${c.id}`);
                  }}
                  data-testid={`row-${tableId}-contract-${c.id}`}
                >
                  <TableCell className="py-2 font-mono text-sm font-medium whitespace-nowrap">
                    <span className="text-primary">{c.contr_ref_no || c.id}</span>
                  </TableCell>
                  <TableCell className="py-2 whitespace-nowrap">
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="py-2 whitespace-nowrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm block truncate max-w-[160px] cursor-default">{c.title || "-"}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top"><p>{c.title}</p></TooltipContent>
                    </Tooltip>
                  </TableCell>
                  {!isDraft && (
                    <TableCell className="py-2 whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm block truncate max-w-[130px] cursor-default">
                            {c.vendor_names || <span className="text-muted-foreground">-</span>}
                          </span>
                        </TooltipTrigger>
                        {c.vendor_names && <TooltipContent side="top">{c.vendor_names}</TooltipContent>}
                      </Tooltip>
                    </TableCell>
                  )}
                  <TableCell className="py-2 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(c.start_date)}
                      {c.start_date && c.end_date && " → "}
                      <span className={c.end_date && new Date(c.end_date) < new Date() ? "text-red-500" : ""}>
                        {formatDate(c.end_date)}
                      </span>
                    </span>
                  </TableCell>
                  {!isDraft && (
                    <TableCell className="py-2 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(createdPoByContract[c.id] || c.po_numbers) && (
                          <button
                            className="text-xs font-mono font-medium text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/app/purchase-orders/${createdPoByContract[c.id] || c.po_numbers}`);
                            }}
                            data-testid={`link-created-po-${c.id}`}
                          >
                            {createdPoByContract[c.id] || c.po_numbers}
                          </button>
                        )}
                        {c.status === "Approved" && !c.all_lines_have_po && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPoDialogContract({ id: c.id, refNo: c.contr_ref_no || String(c.id) });
                            }}
                            data-testid={`button-create-po-contract-${c.id}`}
                          >
                            <Plus className="h-3 w-3" /> Create PO
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => onPageChange(page - 1)} disabled={page <= 1}
              data-testid={`button-prev-page-${tableId}`}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="icon" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
              data-testid={`button-next-page-${tableId}`}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </CardContent>
  );
  };

  return (
    <div className="p-4 space-y-3">
      {/* Page title */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Contracts</h1>
          <p className="text-sm text-muted-foreground">Manage and track all supplier contracts</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className={`hover-elevate cursor-pointer transition-all ${(card.title === "Total Contracts" && activeStatCard === null) || activeStatCard === card.title ? "ring-primary border-primary bg-primary/5" : ""}`}
              onClick={() => {
                if (card.title === "Total Contracts") {
                  setActiveStatCard(null);
                  setPublishedStatusFilter("all");
                  setDraftStatusFilter("all");
                } else {
                  setActiveStatCard(card.title);
                  setPublishedStatusFilter("all");
                }
                setPublishedPage(1);
                setListTab("published");
              }}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{card.title}</p>
                    {isLoading ? (
                      <Skeleton className="h-6 w-12 mt-1" />
                    ) : (
                      <p className="text-xl font-bold">{card.value}</p>
                    )}
                  </div>
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Published / Draft tabs */}
      <Card>
        <Tabs
          value={listTab}
          onValueChange={(v) => setListTab(v as "published" | "draft")}
          className="w-full"
        >
          <div className="p-3 border-b flex flex-wrap items-center justify-between gap-3">
            <TabsList className="h-9" data-testid="tabs-contract-list">
              <TabsTrigger value="published" className="gap-1.5 px-3" data-testid="tab-published-contracts">
                <ScrollText className="h-4 w-4" />
                Published
                <Badge variant="secondary" className="ml-0.5 font-normal tabular-nums">
                  {publishedContracts.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="draft" className="gap-1.5 px-3" data-testid="tab-draft-contracts">
                <FileText className="h-4 w-4" />
                Draft
                <Badge variant="secondary" className="ml-0.5 font-normal tabular-nums">
                  {draftContracts.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
            <Button size="sm" onClick={() => setCreateSheetOpen(true)} data-testid="button-new-contract">
              <Plus className="h-4 w-4 mr-1" />
              New Contract
            </Button>
          </div>

          <TabsContent value="published" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <div className="p-3 border-b">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by title, supplier, ref, department..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPublishedPage(1); setDraftPage(1); }}
                    className="pl-8 h-8 text-sm"
                    data-testid="input-search-contracts"
                  />
                </div>
                <Select value={publishedStatusFilter} onValueChange={(v) => { setPublishedStatusFilter(v); setActiveStatCard(null); setPublishedPage(1); }}>
                  <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-status-filter">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {PUBLISHED_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8" data-testid="button-export-published">
                      <Upload className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportCSV(publishedContracts)} data-testid="menu-export-csv">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportExcel(publishedContracts)} data-testid="menu-export-excel">
                      <FileDown className="h-4 w-4 mr-2" />
                      Export as Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {renderTable(pagedPublished, publishedPage, publishedPageCount, publishedContracts.length, setPublishedPage, "No published contracts found", "published")}
          </TabsContent>

          <TabsContent value="draft" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <div className="p-3 border-b">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search draft contracts..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPublishedPage(1); setDraftPage(1); }}
                    className="pl-8 h-8 text-sm"
                    data-testid="input-search-drafts"
                  />
                </div>
                <Select value={draftStatusFilter} onValueChange={(v) => { setDraftStatusFilter(v); setDraftPage(1); }}>
                  <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-draft-status-filter">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {["Draft", "Under Review", "Review Completed", "Review Rejected", "Rejected", "More Info Required", "Deleted"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8" data-testid="button-export-draft">
                      <Upload className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportCSV(draftContracts)} data-testid="menu-export-csv-draft">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportExcel(draftContracts)} data-testid="menu-export-excel-draft">
                      <FileDown className="h-4 w-4 mr-2" />
                      Export as Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {renderTable(pagedDraft, draftPage, draftPageCount, draftContracts.length, setDraftPage, "No draft contracts found", "draft")}
          </TabsContent>
        </Tabs>
      </Card>

      <ContractFormSheet open={createSheetOpen} onOpenChange={setCreateSheetOpen} />

      {poDialogContract && (
        <CreatePOFromContractSheet
          contractId={poDialogContract.id}
          refNo={poDialogContract.refNo}
          open={!!poDialogContract}
          onOpenChange={(o) => { if (!o) setPoDialogContract(null); }}
          onCreated={(poNumber) => {
            setCreatedPoByContract((prev) => ({ ...prev, [poDialogContract.id]: poNumber }));
            queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
          }}
        />
      )}
    </div>
  );
}
