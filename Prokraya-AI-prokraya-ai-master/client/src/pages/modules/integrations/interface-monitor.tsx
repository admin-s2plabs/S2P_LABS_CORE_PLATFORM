import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { fetchAllFilteredPages } from "@/lib/export-filtered-data";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownToLine, ArrowUpDown, ArrowUpFromLine, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileDown, FileSpreadsheet, Search, X, XCircle } from "lucide-react";
import { useState } from "react";

interface InterfaceLog {
  id: number;
  business_entity: string | null;
  business_entity_method: string | null;
  transaction_type: string | null;
  transaction_system: string | null;
  status: string | null;
  log_msg: string | null;
  log_msg_desc: string | null;
  key_values: string | null;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  creation_date: string | null;
  http_status: string | null;
}

interface InterfaceLogResponse {
  data: InterfaceLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface InterfaceLogStats {
  total_records: string;
  total_entities: string;
  total_types: string;
  success_count: string;
  error_count: string;
  earliest_date: string;
  latest_date: string;
}

interface FilterOptions {
  transactionTypes: string[];
  statuses: string[];
  entities: string[];
}

const STATUS_COLORS: Record<string, string> = {
  "Success": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Completed": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Error": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "Failed": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "Failure": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "Pending": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  "In Progress": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "Processing": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

function getStatusBadgeClass(status: string): string {
  return STATUS_COLORS[status] || "bg-muted text-muted-foreground";
}

function exportToCSV(data: InterfaceLog[], filename: string) {
  const headers = ["ID", "Entity", "Method", "Type", "System", "Status", "Message", "Start Date", "End Date", "Created By"];
  const rows = data.map(log => [
    log.id,
    log.business_entity || "",
    log.business_entity_method || "",
    log.transaction_type || "",
    log.transaction_system || "",
    log.status || "",
    `"${(log.log_msg || "").replace(/"/g, '""')}"`,
    formatDate(log.start_date),
    formatDate(log.end_date),
    log.created_by || "",
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InterfaceMonitor() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState<InterfaceLog | null>(null);

  const buildQueryUrl = () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (typeFilter && typeFilter !== "all") params.set("transactionType", typeFilter);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (entityFilter && entityFilter !== "all") params.set("businessEntity", entityFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/api/admin/interface-logs?${params.toString()}`;
  };

  const { data, isLoading } = useQuery<InterfaceLogResponse>({
    queryKey: ["/api/admin/interface-logs", page, limit, search, typeFilter, statusFilter, entityFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await apiRequest("GET", buildQueryUrl());
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["/api/admin/interface-logs/filters"],
  });

  const { data: stats } = useQuery<InterfaceLogStats>({
    queryKey: ["/api/admin/interface-logs/stats"],
  });

  const logs = data?.data || [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages || 1;

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setSearchInput("");
    setTypeFilter("all");
    setStatusFilter("all");
    setEntityFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasActiveFilters = search || typeFilter !== "all" || statusFilter !== "all" || entityFilter !== "all" || dateFrom || dateTo;

  const buildInterfaceExportParams = (pageNum: number, pageLimit: number) => {
    const params = new URLSearchParams({ page: String(pageNum), limit: String(pageLimit) });
    const trimmed = search.trim();
    if (trimmed) params.set("search", trimmed);
    if (typeFilter && typeFilter !== "all") params.set("transactionType", typeFilter);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (entityFilter && entityFilter !== "all") params.set("businessEntity", entityFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params;
  };

  const exportAllFiltered = async () => {
    setIsExporting(true);
    try {
      const all = await fetchAllFilteredPages<InterfaceLogResponse>(
        "/api/admin/interface-logs",
        buildInterfaceExportParams,
        500,
      );
      if (all.length === 0) {
        toast({
          title: "No data to export",
          description: "No interface logs match the current filters.",
          variant: "destructive",
        });
        return;
      }
      exportToCSV(all as InterfaceLog[], `interface-logs-filtered_${new Date().toISOString().split("T")[0]}.csv`);
      toast({ title: "Exported filtered interface logs" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export interface logs",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-interface-monitor-title">Interface Monitor</h1>
          <p className="text-sm text-muted-foreground">Track all inbound and outbound interface transactions</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isExporting} data-testid="button-export">
              <Download className="h-4 w-4 mr-1.5" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportToCSV(logs, "interface-logs.csv")} data-testid="button-export-csv">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Current Page (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportAllFiltered} data-testid="button-export-all">
              <FileDown className="h-4 w-4 mr-2" />
              Export All Filtered (CSV)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-xs text-muted-foreground">Total Transactions</p>
                {stats ? (
                  <p className="text-xl font-bold" data-testid="text-total-transactions">{parseInt(stats.total_records).toLocaleString()}</p>
                ) : (
                  <Skeleton className="h-6 w-12 mt-1" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-xs text-muted-foreground">Successful</p>
                {stats ? (
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-success-count">{parseInt(stats.success_count).toLocaleString()}</p>
                ) : (
                  <Skeleton className="h-6 w-8 mt-1" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-xs text-muted-foreground">Errors</p>
                {stats ? (
                  <p className="text-xl font-bold text-red-600 dark:text-red-400" data-testid="text-error-count">{parseInt(stats.error_count).toLocaleString()}</p>
                ) : (
                  <Skeleton className="h-6 w-8 mt-1" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <p className="text-xs text-muted-foreground">Entities</p>
                {stats ? (
                  <p className="text-xl font-bold" data-testid="text-total-entities">{stats.total_entities}</p>
                ) : (
                  <Skeleton className="h-6 w-8 mt-1" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <ArrowUpDown className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by entity, message, system..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-8"
                data-testid="input-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {(filterOptions?.transactionTypes || []).map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {(filterOptions?.statuses || []).map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-entity">
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {(filterOptions?.entities || []).map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-[130px]"
              data-testid="input-date-from"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-[130px]"
              data-testid="input-date-to"
            />
            <Button size="sm" onClick={handleSearch} data-testid="button-search">
              <Search className="h-4 w-4" />
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No interface logs found</p>
              {hasActiveFilters && <p className="text-xs mt-1">Try adjusting your filters</p>}
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[60px]">ID</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                        <span className="flex items-center gap-1.5">
                          <ArrowUpDown className="h-3.5 w-3.5" />
                          Type
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">Entity</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">System</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[90px]">Status</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium">Message</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          Start Date
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="cursor-pointer" onClick={() => setSelectedLog(log)} data-testid={`row-interface-${log.id}`}>
                        <TableCell className="py-1.5 text-sm font-mono text-muted-foreground">{log.id}</TableCell>
                        <TableCell className="py-1.5">
                          {log.transaction_type === "INBOUND" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                              <ArrowDownToLine className="h-3 w-3" />
                              IN
                            </span>
                          ) : log.transaction_type === "OUTBOUND" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 dark:text-orange-400">
                              <ArrowUpFromLine className="h-3 w-3" />
                              OUT
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{log.transaction_type || "-"}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className="text-sm font-medium truncate block max-w-[120px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[120px] cursor-default">
                                  {log.business_entity || "-"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{log.business_entity || "-"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                          {log.business_entity_method && (
                            <span className="text-xs text-muted-foreground">{log.business_entity_method}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-sm truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[120px] cursor-default">
                                {log.transaction_system || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{log.transaction_system || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(log.status || "")}`}>
                            {log.status || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 text-sm truncate max-w-[250px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[250px] cursor-default">
                                {log.log_msg || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{log.log_msg || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5 text-sm whitespace-nowrap">{formatDate(log.start_date)}</TableCell>
                        <TableCell className="py-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                            data-testid={`button-view-${log.id}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between gap-4 flex-wrap p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows per page:</span>
                  <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                    <SelectTrigger className="w-[70px] h-8" data-testid="select-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground" data-testid="text-pagination-info">
                    {pagination ? `${((page - 1) * limit) + 1}-${Math.min(page * limit, pagination.total)} of ${pagination.total.toLocaleString()}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs px-2" data-testid="text-page-number">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <SheetContent className="w-[400px] sm:w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Interface Transaction Detail</SheetTitle>
          </SheetHeader>
          {selectedLog && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Transaction ID</p>
                  <p className="text-sm font-mono" data-testid="text-detail-id">{selectedLog.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(selectedLog.status || "")}`} data-testid="text-detail-status">
                    {selectedLog.status || "-"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Transaction Type</p>
                  <div className="flex items-center gap-1.5">
                    {selectedLog.transaction_type === "INBOUND" ? (
                      <Badge variant="outline" className="no-default-active-elevate text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700">
                        <ArrowDownToLine className="h-3 w-3 mr-1" /> INBOUND
                      </Badge>
                    ) : selectedLog.transaction_type === "OUTBOUND" ? (
                      <Badge variant="outline" className="no-default-active-elevate text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700">
                        <ArrowUpFromLine className="h-3 w-3 mr-1" /> OUTBOUND
                      </Badge>
                    ) : (
                      <span className="text-sm" data-testid="text-detail-type">{selectedLog.transaction_type || "-"}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">System</p>
                  <p className="text-sm" data-testid="text-detail-system">{selectedLog.transaction_system || "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Business Entity</p>
                  <p className="text-sm font-medium" data-testid="text-detail-entity">{selectedLog.business_entity || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Method</p>
                  <p className="text-sm" data-testid="text-detail-method">{selectedLog.business_entity_method || "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start Date</p>
                  <p className="text-sm" data-testid="text-detail-start">{formatDate(selectedLog.start_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">End Date</p>
                  <p className="text-sm" data-testid="text-detail-end">{formatDate(selectedLog.end_date)}</p>
                </div>
              </div>
              {selectedLog.http_status && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">HTTP Status</p>
                  <p className="text-sm font-mono" data-testid="text-detail-http">{selectedLog.http_status}</p>
                </div>
              )}
              {selectedLog.key_values && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Key Values</p>
                  <p className="text-sm bg-muted/50 px-2 py-1.5 rounded font-mono break-all" data-testid="text-detail-keys">{selectedLog.key_values}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Log Message</p>
                <p className="text-sm bg-muted/50 px-2 py-1.5 rounded whitespace-pre-wrap" data-testid="text-detail-message">{selectedLog.log_msg || "-"}</p>
              </div>
              {selectedLog.log_msg_desc && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Message Details</p>
                  <p className="text-sm bg-muted/50 px-2 py-1.5 rounded whitespace-pre-wrap text-xs font-mono" data-testid="text-detail-message-desc">{selectedLog.log_msg_desc}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Created By</p>
                <p className="text-sm" data-testid="text-detail-created-by">{selectedLog.created_by || "-"}</p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
