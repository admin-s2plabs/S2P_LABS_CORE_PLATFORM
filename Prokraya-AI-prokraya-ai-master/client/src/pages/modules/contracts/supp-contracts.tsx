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
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  Download,
  Eye,
  FileCheck,
  FileDown,
  FileSpreadsheet,
  FileText,
  Handshake,
  PenLine,
  RotateCcw,
  ScrollText,
  Search,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";

interface SupplierContract {
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
  last_modified_date: string | null;
  requestor_name: string | null;
  version: string | null;
  description: string | null;
  supplier_name: string | null;
  supplier_site: string | null;
  supplier_contact: string | null;
  supplier_contact_email: string | null;
}

const OPEN_STATUSES = [
  "Under Negotiation",
  "Vendor Submit For Negotiation",
  "Accepted",
  "Pending Approval",
  "More Info Required",
  "Rejected",
  "Approved",
  "Pending Signature",
  "Supplier Submit For Negotiation",
  "Negotiation Under Review",
];

const ACTIVE_STATUSES = [
  "Active",
  "Expired",
  "Terminated",
  "Pending Termination",
  "More Info Required for Termination",
  "Termination Rejected",
  "Signed",
];

const contractStatusConfig: Record<string, {
  label: string;
  icon: typeof Clock;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}> = {
  "Draft":                              { label: "Draft",                icon: FileText,      variant: "secondary" },
  "Under Review":                       { label: "Under Review",         icon: Eye,           variant: "outline",   className: "border-purple-300 text-purple-600 dark:text-purple-400" },
  "Review Completed":                   { label: "Review Completed",     icon: CircleDot,     variant: "secondary", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  "Review Rejected":                    { label: "Review Rejected",      icon: XCircle,       variant: "destructive" },
  "Approved":                           { label: "Approved",             icon: CheckCircle2,  variant: "secondary", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "Active":                             { label: "Active",               icon: CheckCircle2,  variant: "secondary", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "Accepted":                           { label: "Accepted",             icon: FileCheck,     variant: "secondary", className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  "Signed":                             { label: "Signed",               icon: PenLine,       variant: "secondary", className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  "Under Negotiation":                  { label: "Under Negotiation",    icon: Handshake,     variant: "outline",   className: "border-blue-300 text-blue-600 dark:text-blue-400" },
  "Vendor Submit For Negotiation":      { label: "Vendor Submitted",     icon: RotateCcw,     variant: "secondary", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  "Supplier Submit For Negotiation":   { label: "Supplier Submitted",   icon: RotateCcw,   variant: "secondary", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  "Negotiation Under Review":           { label: "Under Internal Review", icon: Eye,          variant: "outline",   className: "border-purple-300 text-purple-600 dark:text-purple-400" },
  "Pending Approval":                   { label: "Pending Approval",     icon: Clock,         variant: "outline",   className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "Pending Signature":                  { label: "Pending Signature",    icon: PenLine,       variant: "outline",   className: "border-amber-300 text-amber-600 dark:text-amber-400" },
  "More Info Required":                 { label: "More Info Required",   icon: AlertTriangle, variant: "outline",   className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "Rejected":                           { label: "Rejected",             icon: XCircle,       variant: "destructive" },
  "Cancelled":                          { label: "Cancelled",            icon: Ban,           variant: "destructive" },
  "Closed":                             { label: "Closed",               icon: XCircle,       variant: "secondary" },
  "Expired":                            { label: "Expired",              icon: Clock,         variant: "secondary" },
  "Terminated":                         { label: "Terminated",           icon: Ban,           variant: "destructive" },
  "Pending Termination":                { label: "Pending Termination",  icon: AlertTriangle, variant: "outline",   className: "border-red-300 text-red-600 dark:text-red-400" },
  "More Info Required for Termination": { label: "More Info Required",   icon: AlertTriangle, variant: "outline",   className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "Termination Rejected":               { label: "Termination Rejected", icon: XCircle,       variant: "destructive" },
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

export default function SupplierContracts() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();

  const [search, setSearch] = useState("");
  const [openStatusFilter, setOpenStatusFilter] = useState("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [openPage, setOpenPage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const filter = params.get("filter");
    if (filter) setActiveStatCard(filter);
  }, [searchString]);

  const { data: contracts, isLoading, isError, error } = useQuery<SupplierContract[]>({
    queryKey: ["/api/contracts/supplier/list"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const isOpen = (s: string) => OPEN_STATUSES.includes(s);

  function matchesSearch(c: SupplierContract) {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.title || "").toLowerCase().includes(q) ||
      (c.contr_ref_no || "").toLowerCase().includes(q) ||
      (c.department_name || "").toLowerCase().includes(q) ||
      (c.supplier_name || "").toLowerCase().includes(q) ||
      (c.requestor_name || "").toLowerCase().includes(q) ||
      String(c.id).includes(q)
    );
  }

  function matchesStatCard(c: SupplierContract): boolean {
    switch (activeStatCard) {
      case "Active / Signed":
        return ["Active", "Signed"].includes(c.status);
      case "In Negotiation":
        return c.status === "Under Negotiation";
      case "Pending Action":
        return ["Pending Approval", "Pending Signature"].includes(c.status);
      case "Expiring in 30d": {
        if (!c.end_date) return false;
        const diff = (new Date(c.end_date).getTime() - Date.now()) / 86400000;
        return diff >= 0 && diff <= 30;
      }
      default:
        return true;
    }
  }

  const openContracts = (contracts || []).filter(
    (c) => isOpen(c.status) && matchesSearch(c) && (openStatusFilter === "all" || c.status === openStatusFilter) && matchesStatCard(c)
  );
  const activeContracts = (contracts || []).filter(
    (c) => ACTIVE_STATUSES.includes(c.status) && matchesSearch(c) && (activeStatusFilter === "all" || c.status === activeStatusFilter) && matchesStatCard(c)
  );

  const openPageCount = Math.ceil(openContracts.length / PAGE_SIZE) || 1;
  const activePageCount = Math.ceil(activeContracts.length / PAGE_SIZE) || 1;
  const pagedOpen = openContracts.slice((openPage - 1) * PAGE_SIZE, openPage * PAGE_SIZE);
  const pagedActive = activeContracts.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const knownContracts = (contracts || []).filter((c) => OPEN_STATUSES.includes(c.status) || ACTIVE_STATUSES.includes(c.status));
  const total = contracts?.length || 0;
  const activeCount = knownContracts.filter((c) => ["Active", "Signed"].includes(c.status)).length;
  const negotiationCount = knownContracts.filter((c) => c.status === "Under Negotiation").length;
  const pendingCount = knownContracts.filter((c) => ["Pending Approval", "Pending Signature"].includes(c.status)).length;
  const expiringSoon = knownContracts.filter((c) => {
    if (!c.end_date) return false;
    const diff = (new Date(c.end_date).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 30;
  }).length;

  const statCards = [
    { title: "Total Contracts",   value: total,            icon: ScrollText,    color: "text-primary",     bgColor: "bg-primary/10" },
    { title: "Active / Signed",   value: activeCount,      icon: CheckCircle2,  color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900/30" },
    { title: "In Negotiation",    value: negotiationCount, icon: Handshake,     color: "text-blue-600",    bgColor: "bg-blue-100 dark:bg-blue-900/30" },
    { title: "Pending Action",    value: pendingCount,     icon: Clock,         color: "text-orange-600",  bgColor: "bg-orange-100 dark:bg-orange-900/30" },
    { title: "Expiring in 30d",   value: expiringSoon,     icon: AlertTriangle, color: "text-amber-600",   bgColor: "bg-amber-100 dark:bg-amber-900/30" },
  ];

  function getExportRows(rows: SupplierContract[]) {
    return rows.map((c) => ({
      "Contract Ref": c.contr_ref_no || c.id,
      "Title": c.title || "",
      "Status": c.status || "",
      "Type": c.type || "",
      "Department": c.department_name || "",
      "Owner": c.requestor_name || c.owner || "",
      "Supplier Site": c.supplier_site || "",
      "Amount": formatCurrency(c.contract_amount, null),
      "Start Date": formatDate(c.start_date),
      "End Date": formatDate(c.end_date),
      "Last Updated": formatDate(c.last_modified_date),
    }));
  }

  function exportCSV(rows: SupplierContract[], filename: string) {
    if (!rows.length) { toast({ title: "No data to export", variant: "destructive" }); return; }
    const data = getExportRows(rows);
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map((r) => headers.map((h) => `"${(r as any)[h] || ""}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast({ title: "Exported to CSV" });
  }

  function exportExcel(rows: SupplierContract[], filename: string, sheetName: string) {
    if (!rows.length) { toast({ title: "No data to export", variant: "destructive" }); return; }
    const ws = XLSX.utils.json_to_sheet(getExportRows(rows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported to Excel" });
  }

  if (isError) {
    const errMsg = (error as any)?.message || "";
    const isForbidden = errMsg.includes("403") || errMsg.includes("Forbidden");
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Ban className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <h3 className="text-base font-medium mb-1">
                {isForbidden ? "Access Denied" : "Failed to load contracts"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isForbidden
                  ? "This page is only accessible to supplier users."
                  : "An error occurred while loading contracts. Please try again later."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderTable = (
    rows: SupplierContract[],
    page: number,
    totalPages: number,
    totalCount: number,
    onPageChange: (p: number) => void,
    emptyMessage: string,
    tableId: string,
  ) => (
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
              <TableHead className="text-xs font-medium whitespace-nowrap">
                <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Period</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <ScrollText className="h-10 w-10 text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-medium">{emptyMessage}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {search ? "Try adjusting your search or filters" : ""}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="h-10 cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/app/supp-contract-details/${c.id}`)}
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
                        <span className="text-sm block truncate max-w-[200px] cursor-default">{c.title || "-"}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top"><p>{c.title}</p></TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="py-2 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(c.start_date)}
                      {c.start_date && c.end_date && " → "}
                      <span className={c.end_date && new Date(c.end_date) < new Date() ? "text-red-500" : ""}>
                        {formatDate(c.end_date)}
                      </span>
                    </span>
                  </TableCell>
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

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">My Contracts</h1>
          <p className="text-sm text-muted-foreground">View contracts you are a party to</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className={`hover-elevate cursor-pointer transition-all ${(card.title === "Total Contracts" && activeStatCard === null) || activeStatCard === card.title ? "ring-primary border-primary bg-primary/5" : ""}`}
              data-testid={`card-stat-${card.title.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => {
                if (card.title === "Total Contracts") {
                  setActiveStatCard(null);
                } else {
                  setActiveStatCard(card.title);
                  setOpenStatusFilter("all");
                  setActiveStatusFilter("all");
                }
                setOpenPage(1);
                setActivePage(1);
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

      {/* Open Contracts */}
      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-blue-500" />
              <span className="font-semibold text-sm">Open Contracts</span>
              <Badge variant="secondary">{openContracts.length}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, ref, department..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setOpenPage(1); setActivePage(1); }}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-open"
                />
              </div>
              <Select value={openStatusFilter} onValueChange={(v) => { setOpenStatusFilter(v); setActiveStatCard(null); setOpenPage(1); }}>
                <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-open-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {OPEN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8" data-testid="button-export-open">
                    <Download className="h-4 w-4 mr-1" />Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportCSV(openContracts, "open_contracts")} data-testid="menu-export-open-csv">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportExcel(openContracts, "open_contracts", "Open Contracts")} data-testid="menu-export-open-excel">
                    <FileDown className="h-4 w-4 mr-2" />Export as Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        {renderTable(pagedOpen, openPage, openPageCount, openContracts.length, setOpenPage, "No open contracts found", "open")}
      </Card>

      {/* Active Contracts */}
      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="font-semibold text-sm">Active Contracts</span>
              <Badge variant="secondary">{activeContracts.length}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search active contracts..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setOpenPage(1); setActivePage(1); }}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-active"
                />
              </div>
              <Select value={activeStatusFilter} onValueChange={(v) => { setActiveStatusFilter(v); setActiveStatCard(null); setActivePage(1); }}>
                <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-active-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {ACTIVE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8" data-testid="button-export-active">
                    <Download className="h-4 w-4 mr-1" />Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportCSV(activeContracts, "active_contracts")} data-testid="menu-export-active-csv">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportExcel(activeContracts, "active_contracts", "Active Contracts")} data-testid="menu-export-active-excel">
                    <FileDown className="h-4 w-4 mr-2" />Export as Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        {renderTable(pagedActive, activePage, activePageCount, activeContracts.length, setActivePage, "No active contracts found", "active")}
      </Card>
    </div>
  );
}
