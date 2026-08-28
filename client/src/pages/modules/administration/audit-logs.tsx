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
import { Activity, Calendar, ChevronLeft, ChevronRight, Eye, FileDown, FileSpreadsheet, Layers, Search, Upload, Users, X, Zap } from "lucide-react";
import { useState } from "react";

interface AuditLog {
  id: number;
  audit_action: string;
  audit_date: string;
  audit_key: string;
  audit_message: string;
  full_name: string;
  user_id: string;
  module: string;
}

interface AuditLogResponse {
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface AuditLogStats {
  total_records: string;
  total_modules: string;
  total_actions: string;
  total_users: string;
  earliest_date: string;
  latest_date: string;
}

const ACTION_COLORS: Record<string, string> = {
  "CREATE": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "CREATED": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "ADDED": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "NEW": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "UPDATE": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "UPDATED": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "Updated/ADDED": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "DELETE": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "DELETED": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "APPROVED": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "APPROVE": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "APPROVAL": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "REJECTED": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "REJECT": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "LOGIN": "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  "REGISTRATION": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  "PUBLISHED": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  "CANCEL": "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  "CLOSED": "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

function getActionBadgeClass(action: string): string {
  return ACTION_COLORS[action] || "bg-muted text-muted-foreground";
}

function exportToCSV(data: AuditLog[], filename: string) {
  const headers = ["ID", "Date", "User", "User ID", "Module", "Action", "Message"];
  const rows = data.map(log => [
    log.id,
    formatDate(log.audit_date),
    log.full_name || "",
    log.user_id || "",
    log.module || "",
    log.audit_action || "",
    `"${(log.audit_message || "").replace(/"/g, '""')}"`,
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

export default function AuditLogs() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const buildQueryUrl = () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (moduleFilter && moduleFilter !== "all") params.set("module", moduleFilter);
    if (actionFilter && actionFilter !== "all") params.set("action", actionFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/api/audit-logs?${params.toString()}`;
  };

  const { data, isLoading } = useQuery<AuditLogResponse>({
    queryKey: ["/api/audit-logs", page, limit, search, moduleFilter, actionFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await apiRequest("GET", buildQueryUrl());
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: modules } = useQuery<string[]>({
    queryKey: ["/api/audit-logs/modules"],
  });

  const { data: actions } = useQuery<string[]>({
    queryKey: ["/api/audit-logs/actions"],
  });

  const { data: stats } = useQuery<AuditLogStats>({
    queryKey: ["/api/audit-logs/stats"],
    staleTime: 0,
    refetchOnMount: "always",
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
    setModuleFilter("all");
    setActionFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasActiveFilters = search || moduleFilter !== "all" || actionFilter !== "all" || dateFrom || dateTo;

  const buildAuditExportParams = (pageNum: number, pageLimit: number) => {
    const params = new URLSearchParams({ page: String(pageNum), limit: String(pageLimit) });
    const trimmed = search.trim();
    if (trimmed) params.set("search", trimmed);
    if (moduleFilter && moduleFilter !== "all") params.set("module", moduleFilter);
    if (actionFilter && actionFilter !== "all") params.set("action", actionFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params;
  };

  const exportAllFiltered = async () => {
    setIsExporting(true);
    try {
      const all = await fetchAllFilteredPages<AuditLogResponse>(
        "/api/audit-logs",
        buildAuditExportParams,
        500,
      );
      if (all.length === 0) {
        toast({
          title: "No data to export",
          description: "No audit logs match the current filters.",
          variant: "destructive",
        });
        return;
      }
      exportToCSV(all as AuditLog[], `audit-logs-filtered_${new Date().toISOString().split("T")[0]}.csv`);
      toast({ title: "Exported filtered audit logs" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export audit logs",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-audit-logs-title">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">Track all system activities and user actions</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isExporting} data-testid="button-export">
              <Upload className="h-4 w-4 mr-1.5" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportToCSV(logs, "audit-logs.csv")} data-testid="button-export-csv">
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Records</p>
                {stats ? (
                  <p className="text-xl font-bold" data-testid="text-total-records">{parseInt(stats.total_records).toLocaleString()}</p>
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Modules</p>
                {stats ? (
                  <p className="text-xl font-bold" data-testid="text-total-modules">{stats.total_modules}</p>
                ) : (
                  <Skeleton className="h-6 w-8 mt-1" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Action Types</p>
                {stats ? (
                  <p className="text-xl font-bold" data-testid="text-total-actions">{stats.total_actions}</p>
                ) : (
                  <Skeleton className="h-6 w-8 mt-1" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active Users</p>
                {stats ? (
                  <p className="text-xl font-bold" data-testid="text-total-users">{stats.total_users}</p>
                ) : (
                  <Skeleton className="h-6 w-8 mt-1" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
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
                placeholder="Search by message, key, user..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-8"
                data-testid="input-search"
              />
            </div>
            <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-module">
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {(modules || []).map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-action">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {(actions || []).map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-[145px]"
                data-testid="input-date-from"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-[145px]"
                data-testid="input-date-to"
              />
            </div>
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
              <p>No audit logs found</p>
              {hasActiveFilters && <p className="text-xs mt-1">Try adjusting your filters</p>}
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          Date & Time
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          User
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[110px]">
                        <span className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5" />
                          Module
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[110px]">
                        <span className="flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5" />
                          Action
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium">Message</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="cursor-pointer" onClick={() => setSelectedLog(log)} data-testid={`row-audit-${log.id}`}>
                        <TableCell className="py-1.5 text-sm whitespace-nowrap">{formatDate(log.audit_date)}</TableCell>
                        <TableCell className="py-1.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[160px] cursor-default">
                                    {log.full_name}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{log.full_name}</p>
                                </TooltipContent>
                              </Tooltip>
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[160px] cursor-default">
                                    {log.user_id || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{log.user_id || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge variant="outline" className="text-xs font-normal no-default-active-elevate">
                            {log.module || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getActionBadgeClass(log.audit_action)}`}>
                            {log.audit_action || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 text-sm truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[240px] cursor-default">
                                {log.audit_message || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{log.audit_message || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
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
                      <SelectItem value="20">20</SelectItem>
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
        <SheetContent className="w-[400px] sm:w-[450px]">
          <SheetHeader>
            <SheetTitle>Audit Log Detail</SheetTitle>
          </SheetHeader>
          {selectedLog && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">ID</p>
                  <p className="text-sm font-mono" data-testid="text-detail-id">{selectedLog.id}</p>
                </div>
                
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Date & Time</p>
                  <p className="text-sm" data-testid="text-detail-date">{formatDate(selectedLog.audit_date)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">User</p>
                  <p className="text-sm font-medium" data-testid="text-detail-user">{selectedLog.full_name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">User ID</p>
                  <p className="text-sm" data-testid="text-detail-userid">{selectedLog.user_id || "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Module</p>
                  <Badge variant="outline" className="no-default-active-elevate" data-testid="text-detail-module">{selectedLog.module || "-"}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Action</p>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getActionBadgeClass(selectedLog.audit_action)}`} data-testid="text-detail-action">
                    {selectedLog.audit_action || "-"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Ref Number</p>
                  <p className="text-sm font-mono" data-testid="text-detail-audit-key">{selectedLog.audit_key || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Message</p>
                <p className="text-sm bg-muted/50 px-2 py-1.5 rounded whitespace-pre-wrap" data-testid="text-detail-message">{selectedLog.audit_message || "-"}</p>
              </div>
            </div>
            
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
