import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft, ArrowRight,
  CheckCircle2,
  ChevronLeft, ChevronRight,
  Clock,
  Code,
  Database, Globe,
  Info,
  Loader2,
  Play,
  Plug,
  Plus,
  Save,
  Settings,
  Settings2,
  Trash2,
  XCircle,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

interface SyncRun {
  run_id: number;
  execution_time: string;
  overall_status: string;
  inserted: number;
  updated: number;
  failed: number;
  skipped: number;
  total: number;
}

interface SyncRecord {
  id: number;
  execution_id: number;
  status: string;
  record: string;
  errormsg: string | null;
}

interface SyncRecordsResponse {
  rows: SyncRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

interface MasterDataEntity {
  id: number;
  business_entity: string;
  description: string;
  status: string;
  last_execution_date: string | null;
  target_table: string | null;
  field_mappings: Record<string, string> | null;
  erp_endpoint: string | null;
  last_modified_by: string | null;
  last_modified_date: string | null;
  sync_mode: string | null;
  custom_sync_handler: string | null;
}

function formatEntityName(businessEntity: string) {
  return businessEntity
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bMigration\b/gi, "")
    .replace(/\bDtls\b/gi, "Details")
    .replace(/\bMst\b/gi, "Master")
    .trim();
}


function getStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "syncing":
      return <Badge variant="outline" className="gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 no-default-active-elevate"><Loader2 className="h-3.5 w-3.5 animate-spin" />Syncing</Badge>;
    case "executed":
      return <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 no-default-active-elevate"><CheckCircle2 className="h-3.5 w-3.5" />Executed</Badge>;
    case "failed":
      return <Badge variant="outline" className="gap-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 no-default-active-elevate"><XCircle className="h-3.5 w-3.5" />Failed</Badge>;
    default:
      return <Badge variant="outline" className="gap-1 text-muted-foreground no-default-active-elevate"><Clock className="h-3.5 w-3.5" />{status || "Pending"}</Badge>;
  }
}

function formatDataType(dt: string) {
  if (dt === "character varying") return "varchar";
  if (dt === "timestamp with time zone") return "timestamptz";
  if (dt === "timestamp without time zone") return "timestamp";
  return dt;
}

const SYSTEM_COLUMNS = new Set([
  "id", "business_entity", "description", "status", "target_table",
  "field_mappings", "erp_endpoint", "object_version_number",
  "ip_address", "start_date", "end_date", "last_execution_date",
  "created_by", "creation_date", "last_modified_by", "last_modified_date",
]);

function formatColumnLabel(col: string) {
  return col.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface MappingRow {
  prokrayaColumn: string;
  erpField: string;
}

export default function EntityConfigDetail({ entityKey }: { entityKey: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("sync");
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
  const [endpoint, setEndpoint] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [recordsPage, setRecordsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [erpColumns, setErpColumns] = useState<string[]>([]);
  const [erpConnected, setErpConnected] = useState(false);
  const [syncMode, setSyncMode] = useState<string>("standard");
  const [customHandler, setCustomHandler] = useState<string>("");
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    status: string; entityStatus?: string; inserted: number; updated: number; failed: number; skipped: number; total: number;
  } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollMaxRef = useRef(0);

  const { data: entity, isLoading: loadingEntity } = useQuery<MasterDataEntity>({
    queryKey: ["/api/admin/entity-configs", entityKey],
  });

  const { data: syncRuns, isLoading: loadingSyncRuns } = useQuery<SyncRun[]>({
    queryKey: [`/api/admin/masterdata-entities/${entityKey}/sync-runs`],
    enabled: activeTab === "sync",
  });

  const recordsQueryParams = new URLSearchParams({
    runId: String(selectedRunId),
    page: String(recordsPage),
    limit: "50",
    ...(statusFilter ? { status: statusFilter } : {}),
  }).toString();

  const { data: runRecords, isLoading: loadingRecords } = useQuery<SyncRecordsResponse>({
    queryKey: [`/api/admin/masterdata-entities/${entityKey}/records-by-run?${recordsQueryParams}`],
    enabled: !!selectedRunId,
  });

  useEffect(() => {
    setSelectedRunId(null);
    setRecordsPage(1);
    setStatusFilter("");
    setErpColumns([]);
    setErpConnected(false);
  }, [entityKey]);

  useEffect(() => {
    if (syncRuns && syncRuns.length > 0 && selectedRunId === null) {
      setSelectedRunId(syncRuns[0].run_id);
    }
  }, [syncRuns, selectedRunId]);

  const { data: tableColumns, isLoading: loadingColumns } = useQuery<TableColumn[]>({
    queryKey: ["/api/admin/table-columns", entity?.target_table],
    queryFn: async () => {
      if (!entity?.target_table) return [];
      const res = await apiRequest("GET", `/api/admin/table-columns?table=${encodeURIComponent(entity.target_table)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!entity?.target_table,
  });

  const { data: registeredHandlers } = useQuery<string[]>({
    queryKey: ["/api/admin/custom-sync-handlers"],
    enabled: activeTab === "settings",
  });

  useEffect(() => {
    if (entity) {
      const fm = entity.field_mappings || {};
      const rows: MappingRow[] = Object.entries(fm)
        .filter(([k, v]) => v?.trim() && !SYSTEM_COLUMNS.has(k.toLowerCase()))
        .map(([prokrayaColumn, erpField]) => ({ prokrayaColumn, erpField }));
      setMappingRows(rows.length > 0 ? rows : [{ prokrayaColumn: "", erpField: "" }]);
      setEndpoint(entity.erp_endpoint || "");
      setSyncMode(entity.sync_mode || "standard");
      setCustomHandler(entity.custom_sync_handler || "");
      setHasChanges(false);
      setSettingsChanged(false);
      if (entity.status === "Syncing" && !showSyncProgress && !pollIntervalRef.current) {
        startPolling();
      }
    }
  }, [entity?.business_entity, entity?.field_mappings, entity?.erp_endpoint, entity?.sync_mode, entity?.custom_sync_handler]);

  const rowsToMappings = (rows: MappingRow[]): Record<string, string> => {
    const result: Record<string, string> = {};
    const seen = new Set<string>();
    rows.forEach(r => {
      const col = r.prokrayaColumn.trim();
      const erp = r.erpField.trim();
      if (col && erp && !seen.has(col)) {
        result[col] = erp;
        seen.add(col);
      }
    });
    return result;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/entity-configs/${entityKey}/mapping`, {
        erp_endpoint: endpoint,
        field_mappings: rowsToMappings(mappingRows),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entity-configs", entityKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterdata-entities"] });
      toast({ title: "Mapping Saved", description: `Field mappings updated successfully.` });
      setHasChanges(false);
    },
    onError: () => toast({ title: "Failed to save mapping", variant: "destructive" }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/entity-configs/${entityKey}`, {
        sync_mode: syncMode,
        custom_sync_handler: syncMode === "custom" ? customHandler : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entity-configs", entityKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterdata-entities"] });
      toast({ title: "Settings Saved", description: `Sync mode updated to ${syncMode === "custom" ? "Custom Handler" : "Standard"}.` });
      setSettingsChanged(false);
    },
    onError: (error: any) => toast({ title: "Failed to save settings", description: error?.message || "Unknown error", variant: "destructive" }),
  });

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollMaxRef.current = 0;
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setSyncProgress(null);
    setShowSyncProgress(true);
    pollMaxRef.current = 0;
    pollIntervalRef.current = setInterval(async () => {
      pollMaxRef.current++;
      if (pollMaxRef.current > 300) {
        stopPolling();
        return;
      }
      try {
        const res = await apiRequest("GET", `/api/admin/entity-configs/${entityKey}/sync-progress`);
        if (!res.ok) return;
        const data = await res.json();
        setSyncProgress(data);
        const isDone = data.status !== "IN_PROGRESS";
        const entityDone = data.entityStatus && data.entityStatus !== "Syncing";
        if (isDone || entityDone) {
          stopPolling();
          queryClient.invalidateQueries({ queryKey: ["/api/admin/entity-configs", entityKey] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/masterdata-entities"] });
          queryClient.invalidateQueries({ queryKey: [`/api/admin/masterdata-entities/${entityKey}/sync-runs`] });
        }
      } catch {}
    }, 2000);
  }, [entityKey, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/entity-configs/${entityKey}/sync`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entity-configs", entityKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterdata-entities"] });
      toast({ title: "Sync Initiated", description: result.message });
      startPolling();
    },
    onError: (error: any) => {
      toast({ title: "Sync Failed", description: error?.message || "Failed to trigger sync", variant: "destructive" });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/entity-configs/${entityKey}/erp-metadata`, {
        erp_endpoint: endpoint,
      });
      return res.json();
    },
    onSuccess: (result: { connected: boolean; columns: string[] }) => {
      setErpColumns(result.columns);
      setErpConnected(true);
      toast({ title: "Connected", description: `Fetched ${result.columns.length} fields from ERP.` });
    },
    onError: (error: any) => {
      setErpColumns([]);
      setErpConnected(false);
      toast({
        title: "Connection Failed",
        description: error?.message || "Could not fetch ERP metadata. You can type field names manually.",
        variant: "destructive",
      });
    },
  });

  const updateEndpoint = (value: string) => {
    setEndpoint(value);
    setHasChanges(true);
  };

  const resetToSaved = () => {
    if (entity) {
      const fm = entity.field_mappings || {};
      const rows: MappingRow[] = Object.entries(fm)
        .filter(([k, v]) => v?.trim() && !SYSTEM_COLUMNS.has(k.toLowerCase()))
        .map(([prokrayaColumn, erpField]) => ({ prokrayaColumn, erpField }));
      setMappingRows(rows.length > 0 ? rows : [{ prokrayaColumn: "", erpField: "" }]);
      setEndpoint(entity.erp_endpoint || "");
      setHasChanges(false);
    }
  };

  const addMappingRow = () => {
    setMappingRows(prev => [...prev, { prokrayaColumn: "", erpField: "" }]);
    setHasChanges(true);
  };

  const removeMappingRow = (idx: number) => {
    setMappingRows(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [{ prokrayaColumn: "", erpField: "" }];
    });
    setHasChanges(true);
  };

  const updateMappingRow = (idx: number, field: "prokrayaColumn" | "erpField", value: string) => {
    setMappingRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setHasChanges(true);
  };

  const allColumns = tableColumns || [];
  const mappableColumns = allColumns.filter(c => !SYSTEM_COLUMNS.has(c.column_name.toLowerCase()));
  const usedProkrayaCols = new Set(mappingRows.map(r => r.prokrayaColumn).filter(Boolean));
  const mappedCount = mappingRows.filter(r => r.prokrayaColumn.trim() && r.erpField.trim()).length;
  const totalMappable = mappableColumns.length;

  if (loadingEntity) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/app/master-data")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Entity Not Found</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Entity "{entityKey}" was not found.</p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/app/master-data")}>
              Back to Master Data
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName = formatEntityName(entity.business_entity);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/app/master-data")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2" data-testid="text-entity-title">
              <Settings2 className="h-4.5 w-4.5 text-primary" />
              {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">{entity.description || entity.business_entity}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(entity.status)}
          {(entity.sync_mode === "custom" && entity.custom_sync_handler) && (
            <Badge variant="outline" className="gap-1 text-xs no-default-active-elevate">
              <Code className="h-3 w-3" />
              {entity.custom_sync_handler}
            </Badge>
          )}
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || entity.status === "Syncing"}
            className="gap-1.5"
            data-testid="button-run-sync"
          >
            {syncMutation.isPending || entity.status === "Syncing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {entity.status === "Syncing" ? "Syncing..." : "Run Sync"}
          </Button>
        </div>
      </div>

      {showSyncProgress && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {syncProgress?.status === "IN_PROGRESS" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                ) : syncProgress?.status === "SUCCESS" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : syncProgress?.status === "FAILED" ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : syncProgress?.status === "PARTIAL" ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <span className="text-sm font-medium" data-testid="text-sync-status">
                  {!syncProgress ? "Starting sync..." : syncProgress.status === "IN_PROGRESS"
                    ? `Syncing records (batch size: 100)...`
                    : syncProgress.status === "SUCCESS"
                    ? "Sync completed successfully"
                    : syncProgress.status === "PARTIAL"
                    ? "Sync completed with some errors"
                    : "Sync failed"}
                </span>
              </div>
              {syncProgress && syncProgress.status !== "IN_PROGRESS" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowSyncProgress(false);
                    setActiveTab("sync");
                    queryClient.invalidateQueries({ queryKey: [`/api/admin/masterdata-entities/${entityKey}/sync-runs`] });
                  }}
                  data-testid="button-close-progress"
                >
                  View Details
                </Button>
              )}
            </div>
            {syncProgress && (
              <>
                <Progress
                  value={syncProgress.status === "IN_PROGRESS" ? undefined : 100}
                  className="h-2"
                  data-testid="progress-bar-sync"
                />
                <div className="flex items-center gap-4 flex-wrap text-xs">
                  <span className="text-muted-foreground" data-testid="text-total-processed">
                    Total processed: <span className="font-medium text-foreground">{syncProgress.total}</span>
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400" data-testid="text-inserted-count">
                    Inserted: {syncProgress.inserted}
                  </span>
                  <span className="text-blue-600 dark:text-blue-400" data-testid="text-updated-count">
                    Updated: {syncProgress.updated}
                  </span>
                  <span className="text-muted-foreground" data-testid="text-skipped-count">
                    Skipped: {syncProgress.skipped}
                  </span>
                  {syncProgress.failed > 0 && (
                    <span className="text-red-600 dark:text-red-400" data-testid="text-failed-count">
                      Failed: {syncProgress.failed}
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sync" className="gap-1.5" data-testid="tab-sync">
            <Zap className="h-3.5 w-3.5" />
            Sync Status
          </TabsTrigger>
          <TabsTrigger value="mapping" className="gap-1.5" data-testid="tab-mapping">
            <Database className="h-3.5 w-3.5" />
            Field Mapping
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5" data-testid="tab-settings">
            <Settings className="h-3.5 w-3.5" />
            Sync Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mapping" className="mt-4 space-y-4">
          <Card>
            <div className="p-4 border-b space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  ERP Entity Name
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={endpoint}
                    onChange={(e) => { updateEndpoint(e.target.value); setErpConnected(false); setErpColumns([]); }}
                    placeholder="e.g., /data/VendorsV2 or /fscmRestApi/resources/suppliers"
                    className="flex-1"
                    data-testid="input-erp-endpoint"
                  />
                  <Button
                    variant={erpConnected ? "default" : "outline"}
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending || !endpoint.trim()}
                    data-testid="button-connect-erp"
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : erpConnected ? (
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <Plug className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {erpConnected ? "Connected" : "Connect"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {erpConnected
                    ? `${erpColumns.length} ERP fields loaded — use dropdowns below to map`
                    : "Enter the ERP entity path and click Connect to fetch field metadata automatically"}
                </p>
              </div>

              {entity.target_table && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Database className="h-3.5 w-3.5" />
                  Target Table: <span className="font-mono font-medium text-foreground">{entity.target_table}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-b">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm font-medium">Column Mappings</p>
                  <Badge variant="outline" className="text-xs no-default-active-elevate">
                    {mappedCount} / {totalMappable} mapped
                  </Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {hasChanges && (
                    <Button variant="ghost" size="sm" onClick={resetToSaved} data-testid="button-reset-mappings">
                      Reset
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addMappingRow}
                    disabled={mappingRows.length >= totalMappable}
                    data-testid="button-add-mapping"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Row
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !hasChanges}
                    data-testid="button-save-mapping"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Save Mapping
                  </Button>
                </div>
              </div>
            </div>

            <CardContent className="p-0">
              {!entity.target_table ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No target table configured</p>
                  <p className="text-xs mt-1">A target table must be assigned to this entity to load columns for mapping.</p>
                </div>
              ) : loadingColumns ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : mappableColumns.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No mappable columns found</p>
                  <p className="text-xs mt-1">Table "{entity.target_table}" has no attribute columns available for mapping.</p>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 border-b bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      System columns (ID, Created By, Created Date, Last Updated By, Last Updated Date) are auto-populated and excluded from mapping.
                    </p>
                  </div>

                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 py-2 text-xs font-medium w-[40px] text-center">#</TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium">
                            <span className="flex items-center gap-1.5">
                              <Database className="h-3.5 w-3.5" />
                              Prokraya Column
                            </span>
                          </TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium w-[40px]"></TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium">
                            <span className="flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5" />
                              ERP Source Field
                            </span>
                          </TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium w-[70px]">Status</TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappingRows.map((row, idx) => {
                          const isComplete = row.prokrayaColumn.trim() && row.erpField.trim();
                          return (
                            <TableRow key={idx} data-testid={`row-mapping-${idx}`}>
                              <TableCell className="py-2 text-center text-xs text-muted-foreground">
                                {idx + 1}
                              </TableCell>
                              <TableCell className="py-2">
                                <Select
                                  value={row.prokrayaColumn || ""}
                                  onValueChange={(val) => updateMappingRow(idx, "prokrayaColumn", val === "__clear__" ? "" : val)}
                                >
                                  <SelectTrigger
                                    className={row.prokrayaColumn ? "border-emerald-300 dark:border-emerald-700" : ""}
                                    data-testid={`select-prokraya-${idx}`}
                                  >
                                    <SelectValue placeholder="Select Prokraya column..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__clear__">— None —</SelectItem>
                                    {mappableColumns.map((col) => {
                                      const isUsed = usedProkrayaCols.has(col.column_name) && col.column_name !== row.prokrayaColumn;
                                      return (
                                        <SelectItem
                                          key={col.column_name}
                                          value={col.column_name}
                                          disabled={isUsed}
                                        >
                                          {formatColumnLabel(col.column_name)}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                              </TableCell>
                              <TableCell className="py-2">
                                {erpConnected && erpColumns.length > 0 ? (
                                  <Select
                                    value={row.erpField || ""}
                                    onValueChange={(val) => updateMappingRow(idx, "erpField", val === "__clear__" ? "" : val)}
                                  >
                                    <SelectTrigger
                                      className={row.erpField ? "border-emerald-300 dark:border-emerald-700" : ""}
                                      data-testid={`select-erp-${idx}`}
                                    >
                                      <SelectValue placeholder="Select ERP field..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__clear__">— None —</SelectItem>
                                      {erpColumns.map((erpCol) => (
                                        <SelectItem key={erpCol} value={erpCol}>
                                          {erpCol}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={row.erpField || ""}
                                    onChange={(e) => updateMappingRow(idx, "erpField", e.target.value)}
                                    placeholder="Enter ERP field name..."
                                    className={row.erpField ? "border-emerald-300 dark:border-emerald-700" : ""}
                                    data-testid={`input-erp-${idx}`}
                                  />
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                {isComplete ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 mx-auto" />
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeMappingRow(idx)}
                                  className="text-muted-foreground"
                                  data-testid={`button-remove-mapping-${idx}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between border-t px-4 py-2.5 gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground" data-testid="text-column-count">
                      {mappingRows.length} mapping{mappingRows.length !== 1 ? "s" : ""} configured — {totalMappable} attribute columns available
                    </span>
                    {hasChanges && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Unsaved changes
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <Card>
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-1.5" data-testid="text-sync-settings-title">
                <Settings className="h-3.5 w-3.5" />
                Sync Mode
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Choose how this entity syncs data from the ERP system.
              </p>
            </div>
            <CardContent className="py-4 space-y-4">
              <div className="space-y-3">
                <div
                  className={`p-3 rounded-md border cursor-pointer transition-colors ${syncMode === "standard" ? "border-primary bg-primary/5" : "border-border"}`}
                  onClick={() => { setSyncMode("standard"); setSettingsChanged(true); }}
                  data-testid="option-sync-standard"
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${syncMode === "standard" ? "border-primary" : "border-muted-foreground/40"}`}>
                      {syncMode === "standard" && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5" />
                      <span className="text-sm font-medium">Standard Sync</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 ml-6">
                    Uses the visual field mapping configuration above. Best for simple entities with one-to-one field mapping between ERP and Prokraya.
                  </p>
                </div>

                <div
                  className={`p-3 rounded-md border cursor-pointer transition-colors ${syncMode === "custom" ? "border-primary bg-primary/5" : "border-border"}`}
                  onClick={() => { setSyncMode("custom"); setSettingsChanged(true); }}
                  data-testid="option-sync-custom"
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${syncMode === "custom" ? "border-primary" : "border-muted-foreground/40"}`}>
                      {syncMode === "custom" && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Code className="h-3.5 w-3.5" />
                      <span className="text-sm font-medium">Custom Handler</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 ml-6">
                    Uses a developer-written sync function. Best for complex entities with parent-child relationships, multiple ERP endpoints, or custom transformation logic.
                  </p>
                </div>
              </div>

              {syncMode === "custom" && (
                <div className="space-y-2 pl-6">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Code className="h-3.5 w-3.5" />
                    Handler Name
                  </label>
                  <div className="flex items-center gap-2">
                    {registeredHandlers && registeredHandlers.length > 0 ? (
                      <Select
                        value={customHandler}
                        onValueChange={(val) => { setCustomHandler(val); setSettingsChanged(true); }}
                      >
                        <SelectTrigger className="flex-1" data-testid="select-custom-handler">
                          <SelectValue placeholder="Select a registered handler" />
                        </SelectTrigger>
                        <SelectContent>
                          {registeredHandlers.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={customHandler}
                        onChange={(e) => { setCustomHandler(e.target.value); setSettingsChanged(true); }}
                        placeholder="e.g., vendor_sync"
                        className="flex-1"
                        data-testid="input-custom-handler"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {registeredHandlers && registeredHandlers.length > 0
                      ? `${registeredHandlers.length} handler(s) registered on the server.`
                      : "No handlers registered yet. A developer needs to create and register a handler in the server code."}
                  </p>
                  <div className="mt-3 p-3 rounded-md bg-muted/50">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Developer path:</span>{" "}
                      Create a handler file in <span className="font-mono text-[11px]">server/modules/integrations/custom-sync/</span>, register it, and import it in <span className="font-mono text-[11px]">index.ts</span>. See the example file for a parent-child sync pattern.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                {settingsChanged && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSyncMode(entity?.sync_mode || "standard");
                      setCustomHandler(entity?.custom_sync_handler || "");
                      setSettingsChanged(false);
                    }}
                    data-testid="button-reset-settings"
                  >
                    Reset
                  </Button>
                )}
                <Button
                  onClick={() => saveSettingsMutation.mutate()}
                  disabled={saveSettingsMutation.isPending || !settingsChanged || (syncMode === "custom" && !customHandler.trim())}
                  data-testid="button-save-settings"
                >
                  {saveSettingsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {syncMode === "custom" && entity?.custom_sync_handler && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4 text-blue-500" />
                  <span>
                    This entity uses custom handler <span className="font-mono font-medium">"{entity.custom_sync_handler}"</span>.
                    The "Run Sync" button will execute the custom handler instead of the standard field-mapping sync engine.
                    Sync logs and progress tracking work the same way.
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sync" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold" data-testid="text-migration-log-title">View Migration Log</h3>
            {syncRuns && syncRuns.length > 0 && (() => {
              const lastRun = syncRuns[0];
              return (
                <span className="text-xs text-muted-foreground" data-testid="text-last-execution">
                  Last Execution time: {new Date(lastRun.execution_time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} | {new Date(lastRun.execution_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                </span>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 xl:col-span-4">
              <Card className="h-[500px] flex flex-col">
                <ScrollArea className="flex-1">
                  {loadingSyncRuns ? (
                    <div className="p-4 space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : !syncRuns || syncRuns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Clock className="h-8 w-8 mb-3 opacity-40" />
                      <p className="text-sm">No sync runs found</p>
                      <p className="text-xs mt-1">Run a sync to see execution history here.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {syncRuns.map((run) => {
                        const isSelected = selectedRunId === run.run_id;
                        const isSuccess = run.overall_status?.toUpperCase() === "SUCCESS";
                        const isFailed = run.overall_status?.toUpperCase() === "FAILED";
                        return (
                          <div
                            key={run.run_id}
                            className={`p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-primary/5 border-l-2 border-l-primary"
                                : "hover:bg-muted/50"
                            }`}
                            onClick={() => {
                              setSelectedRunId(run.run_id);
                              setRecordsPage(1);
                              setStatusFilter("");
                            }}
                            data-testid={`run-item-${run.run_id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1.5 min-w-0 flex-1">
                                <p className="text-sm font-medium" data-testid={`run-date-${run.run_id}`}>
                                  {new Date(run.execution_time).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </p>
                                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                                  <span className="text-emerald-600 dark:text-emerald-400">Inserted: {run.inserted ?? 0}</span>
                                  <span className="text-blue-600 dark:text-blue-400">Updated: {run.updated ?? 0}</span>
                                  <span>Skipped: {run.skipped ?? 0}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  <span className="text-red-600 dark:text-red-400">Failed: {run.failed ?? 0}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    isSuccess
                                      ? "bg-emerald-500"
                                      : isFailed
                                      ? "bg-red-500"
                                      : "bg-amber-500"
                                  }`}
                                />
                                <span
                                  className={`text-xs font-medium ${
                                    isSuccess
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : isFailed
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-amber-600 dark:text-amber-400"
                                  }`}
                                  data-testid={`run-status-${run.run_id}`}
                                >
                                  {run.overall_status}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </Card>
            </div>

            <div className="lg:col-span-7 xl:col-span-8">
              <Card className="h-[500px] flex flex-col overflow-hidden">
                {selectedRunId && (() => {
                  const selectedRun = syncRuns?.find(r => r.run_id === selectedRunId);
                  if (!selectedRun) return null;
                  const filters = [
                    { label: "All", value: "", count: selectedRun.total },
                    { label: "Inserted", value: "inserted", count: selectedRun.inserted ?? 0 },
                    { label: "Updated", value: "updated", count: selectedRun.updated ?? 0 },
                    { label: "Skipped", value: "skipped", count: selectedRun.skipped ?? 0 },
                    { label: "Failed", value: "failed", count: selectedRun.failed ?? 0 },
                  ];
                  return (
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b flex-wrap" data-testid="record-status-filters">
                      {filters.map((f) => (
                        <Button
                          key={f.value}
                          variant={statusFilter === f.value ? "default" : "outline"}
                          size="sm"
                          onClick={() => { setStatusFilter(f.value); setRecordsPage(1); }}
                          className="gap-1 text-xs"
                          data-testid={`filter-${f.label.toLowerCase()}`}
                        >
                          {f.label}
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 min-w-[18px] no-default-active-elevate">
                            {f.count}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  );
                })()}
                {!selectedRunId ? (
                  <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                    <Info className="h-8 w-8 mb-3 opacity-40" />
                    <p className="text-sm">Select a sync run to view records</p>
                  </div>
                ) : loadingRecords ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : !runRecords || runRecords.rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                    <Database className="h-8 w-8 mb-3 opacity-40" />
                    <p className="text-sm">No records found{statusFilter ? ` with status "${statusFilter}"` : " for this run"}</p>
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 min-h-0">
                    <div className="overflow-auto flex-1">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent bg-primary/5">
                            <TableHead className="h-9 py-2 text-xs font-semibold text-primary" data-testid="header-execution-id">Execution ID</TableHead>
                            <TableHead className="h-9 py-2 text-xs font-semibold text-primary" data-testid="header-status">Status</TableHead>
                            <TableHead className="h-9 py-2 text-xs font-semibold text-primary" data-testid="header-record">Record</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {runRecords.rows.map((rec) => (
                            <TableRow
                              key={rec.id}
                              data-testid={`record-row-${rec.id}`}
                            >
                              <TableCell className="py-2">
                                <span className="text-sm text-primary font-medium" data-testid={`record-id-${rec.id}`}>
                                  {rec.id}
                                </span>
                              </TableCell>
                              <TableCell className="py-2">
                                <span className="text-sm" data-testid={`record-status-${rec.id}`}>
                                  {rec.status}
                                </span>
                              </TableCell>
                              <TableCell className="py-2">
                                <span className="text-sm text-muted-foreground" data-testid={`record-value-${rec.id}`}>
                                  {rec.record}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {runRecords.totalPages > 1 && (
                      <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 flex-wrap">
                        <span className="text-xs text-muted-foreground" data-testid="text-record-pagination">
                          Page {runRecords.page} of {runRecords.totalPages} ({runRecords.total} records)
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={recordsPage <= 1}
                            onClick={() => setRecordsPage(p => Math.max(1, p - 1))}
                            data-testid="button-prev-records"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={recordsPage >= runRecords.totalPages}
                            onClick={() => setRecordsPage(p => p + 1)}
                            data-testid="button-next-records"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
