import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft, ChevronRight,
  Clock,
  Eye,
  Hash,
  Server,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

interface EntityDetail {
  entity: {
    id: number;
    business_entity: string;
    description: string;
    status: string;
    last_execution_date: string | null;
    last_modified_by: string | null;
    created_by: string | null;
    creation_date: string | null;
  };
  stats: {
    total: string;
    success_count: string;
    failed_count: string;
    skipped_count: string;
    run_count: string;
    first_sync: string | null;
    last_sync: string | null;
  };
}

interface SyncRun {
  run_id: number;
  execution_time: string;
  overall_status: string;
  inserted: number | null;
  updated: number | null;
  failed: number | null;
  skipped: number | null;
  total: string;
}

interface MigrationRecord {
  id: number;
  execution_id: number;
  status: string | null;
  record: string | null;
  errormsg: string | null;
}

interface MigrationRecordDetail extends MigrationRecord {
  execution_time: string | null;
  run_status: string | null;
}

interface RecordsResponse {
  rows: MigrationRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function getStatusBadge(status: string | null) {
  if (!status || status === "") return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
  const s = status.toLowerCase();
  if (s === "success" || s === "inserted" || s === "updated") {
    return <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"><CheckCircle2 className="h-3 w-3" />{status}</Badge>;
  }
  if (s === "failed" || s === "failure" || s === "error") {
    return <Badge variant="outline" className="gap-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"><XCircle className="h-3 w-3" />{status}</Badge>;
  }
  if (s === "skipped") {
    return <Badge variant="outline" className="gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"><Clock className="h-3 w-3" />{status}</Badge>;
  }
  return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{status}</Badge>;
}

function getRunStatusIndicator(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "success") return <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />;
  if (s === "failed" || s === "failure" || s === "error") return <div className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />;
  return <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />;
}

export default function MasterDataDetail({ entityName }: { entityName: string }) {
  const [, setLocation] = useLocation();
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

  const { data: detail, isLoading: loadingDetail } = useQuery<EntityDetail>({
    queryKey: ["/api/admin/masterdata-entities", entityName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/masterdata-entities/${entityName}`);
      if (!res.ok) throw new Error("Failed to fetch entity details");
      return res.json();
    },
  });

  const { data: syncRuns, isLoading: loadingRuns } = useQuery<SyncRun[]>({
    queryKey: ["/api/admin/masterdata-entities", entityName, "sync-runs"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/masterdata-entities/${entityName}/sync-runs`);
      if (!res.ok) throw new Error("Failed to fetch sync runs");
      return res.json();
    },
  });

  const { data: records, isLoading: loadingRecords } = useQuery<RecordsResponse>({
    queryKey: ["/api/admin/masterdata-entities", entityName, "records-by-run", selectedRunId, page, statusFilter],
    queryFn: async () => {
      let url = `/api/admin/masterdata-entities/${entityName}/records-by-run?runId=${selectedRunId}&page=${page}&limit=10`;
      if (statusFilter && statusFilter !== "all") url += `&status=${statusFilter}`;
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedRunId,
  });

  const { data: recordDetail, isLoading: loadingRecordDetail } = useQuery<MigrationRecordDetail>({
    queryKey: ["/api/admin/masterdata-records", selectedRecordId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/masterdata-records/${selectedRecordId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedRecordId,
  });

  useEffect(() => {
    if (syncRuns && syncRuns.length > 0 && selectedRunId === null) {
      setSelectedRunId(syncRuns[0].run_id);
    }
  }, [syncRuns, selectedRunId]);

  const stats = detail?.stats;
  const entity = detail?.entity;
  const selectedRun = syncRuns?.find(r => r.run_id === selectedRunId);

  const handleSelectRun = (runId: number) => {
    setSelectedRunId(runId);
    setPage(1);
    setStatusFilter("all");
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/app/master-data")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            {loadingDetail ? (
              <Skeleton className="h-6 w-64" />
            ) : (
              <>
                <h1 className="text-lg font-semibold" data-testid="text-entity-name">
                  {entityName.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                </h1>
                <p className="text-sm text-muted-foreground">{entity?.description || entityName}</p>
              </>
            )}
          </div>
        </div>
        {!loadingDetail && entity && (
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Last Execution: {formatDate(entity.last_execution_date)}
          </span>
        )}
      </div>

      <div className="flex gap-4 items-start">
        <div className="w-[320px] shrink-0">
          <Card style={{ minHeight: "380px" }}>
            <div className="p-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" />
                Sync Runs
              </h3>
            </div>
            <CardContent className="p-0">
              {loadingRuns ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !syncRuns || syncRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Server className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No sync runs found</p>
                </div>
              ) : (
                <div className="overflow-y-auto" style={{ maxHeight: "520px" }}>
                  {syncRuns.map((run) => {
                    const isSelected = selectedRunId === run.run_id;
                    const inserted = run.inserted || 0;
                    const updated = run.updated || 0;
                    const failed = run.failed || 0;
                    const skipped = run.skipped || 0;
                    return (
                      <button
                        key={run.run_id}
                        onClick={() => handleSelectRun(run.run_id)}
                        className={`w-full text-left p-3 border-b last:border-b-0 transition-colors ${
                          isSelected ? "bg-accent" : "hover-elevate"
                        }`}
                        data-testid={`button-run-${run.run_id}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            {getRunStatusIndicator(run.overall_status)}
                            {formatDate(run.execution_time)}
                          </span>
                          {getStatusBadge(run.overall_status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {inserted > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Inserted: {inserted}
                            </span>
                          )}
                          {updated > 0 && (
                            <span className="text-blue-600 dark:text-blue-400">
                              Updated: {updated}
                            </span>
                          )}
                          {failed > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              Failed: {failed}
                            </span>
                          )}
                          {skipped > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              Skipped: {skipped}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 min-w-0">
          <Card style={{ minHeight: "380px" }}>
            {!selectedRunId ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Calendar className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a sync run</p>
                <p className="text-xs mt-1">Choose a run from the left to view records</p>
              </div>
            ) : (
              <>
                <div className="p-3 border-b flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Records — {selectedRun ? formatDate(selectedRun.execution_time) : `Run #${selectedRunId}`}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Select value={statusFilter} onValueChange={handleStatusFilter}>
                      <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-status-filter">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="inserted">Inserted</SelectItem>
                        <SelectItem value="updated">Updated</SelectItem>
                        <SelectItem value="skipped">Skipped</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                    {records && (
                      <span className="text-xs text-muted-foreground" data-testid="text-record-count">
                        {records.total} records
                      </span>
                    )}
                  </div>
                </div>
                <CardContent className="p-0">
                  {loadingRecords ? (
                    <div className="p-3 space-y-2">
                      {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                    </div>
                  ) : (
                    <>
                      <div className="overflow-auto" style={{ maxHeight: "420px" }}>
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="h-9 py-2 text-xs font-medium w-[70px]">
                                <span className="flex items-center gap-1.5">
                                  <Hash className="h-3.5 w-3.5" />
                                  ID
                                </span>
                              </TableHead>
                              <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                                <span className="flex items-center gap-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Status
                                </span>
                              </TableHead>
                              <TableHead className="h-9 py-2 text-xs font-medium">
                                <span className="flex items-center gap-1.5">Record</span>
                              </TableHead>
                              <TableHead className="h-9 py-2 text-xs font-medium max-w-[250px]">
                                <span className="flex items-center gap-1.5">Error Message</span>
                              </TableHead>
                              <TableHead className="h-9 py-2 text-xs font-medium w-[60px]">
                                <span className="flex items-center gap-1.5">Action</span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(!records?.rows || records.rows.length === 0) ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                                  <Server className="h-6 w-6 mx-auto mb-2 opacity-40" />
                                  <p className="text-sm">No records found</p>
                                </TableCell>
                              </TableRow>
                            ) : (
                              records.rows.map((rec) => (
                                <TableRow key={rec.id} data-testid={`row-rec-${rec.id}`}>
                                  <TableCell className="py-1.5 text-xs text-muted-foreground font-mono">{rec.id}</TableCell>
                                  <TableCell className="py-1.5">{getStatusBadge(rec.status)}</TableCell>
                                  <TableCell className="py-1.5 max-w-[250px]">
                                    <span className="block truncate text-xs">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-sm block truncate max-w-[120px] cursor-default">
                                            {rec.record || "-"}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          <p>{rec.record || "-"}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-1.5 max-w-[250px]">
                                    <span className="block truncate text-xs text-muted-foreground">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-sm block truncate max-w-[120px] cursor-default">
                                            {rec.errormsg || "-"}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          <p>{rec.errormsg || "-"}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-1.5">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setSelectedRecordId(rec.id)}
                                      data-testid={`button-view-rec-${rec.id}`}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      {records && records.totalPages > 1 && (
                        <div className="flex items-center justify-between gap-2 p-3 border-t">
                          <p className="text-xs text-muted-foreground">
                            Page {records.page} of {records.totalPages}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={page <= 1}
                              onClick={() => setPage(p => p - 1)}
                              data-testid="button-prev-page"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={page >= records.totalPages}
                              onClick={() => setPage(p => p + 1)}
                              data-testid="button-next-page"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>

      <Sheet open={!!selectedRecordId} onOpenChange={(open) => { if (!open) setSelectedRecordId(null); }}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Record #{selectedRecordId}
            </SheetTitle>
          </SheetHeader>
          {loadingRecordDetail ? (
            <div className="space-y-3 mt-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : recordDetail && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(recordDetail.status)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Run Status</p>
                  <div className="mt-1">{getStatusBadge(recordDetail.run_status)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Execution ID</p>
                  <p className="font-medium font-mono text-xs">{recordDetail.execution_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Execution Time</p>
                  <p className="font-medium">{formatDate(recordDetail.execution_time)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Record</p>
                <div className="p-3 bg-muted rounded-md text-sm break-all">
                  {recordDetail.record || "—"}
                </div>
              </div>

              {recordDetail.errormsg && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Error Message
                  </p>
                  <div className="p-3 bg-muted rounded-md text-sm text-red-600 dark:text-red-400 break-all">
                    {recordDetail.errormsg}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
