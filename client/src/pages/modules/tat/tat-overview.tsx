import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock, AlertTriangle, CheckCircle2, Timer,
  Eye, RefreshCw, TrendingUp, Info,
  FileText, ShoppingCart, Package, Truck, Receipt, Building2,
  GanttChart, Bell, BellOff, Gauge,
  PauseCircle, Layers, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

// ─── API helper ───────────────────────────────────────────────────────────────
// Delegates to the shared apiRequest (correct auth headers + 401/session-expiry
// handling) instead of duplicating that logic locally.
async function apiFetch(url: string, opts: RequestInit = {}) {
  const method = (opts.method as string) || "GET";
  const body = opts.body ? JSON.parse(opts.body as string) : undefined;
  const res = await apiRequest(method, url, body);
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface TatLog {
  id: number;
  module_key: string;
  entity_type: string;
  entity_id: string;
  stage_order: number;
  stage_name: string;
  tat_days_allowed: number;
  started_at: string;
  completed_at: string;
  due_at: string;
  status: string;
  owner_name: string;
  owner_email: string;
  is_supplier_stage: boolean;
  actual_days: number;
  is_overdue: boolean;
  overdue_days: number;
}

// ─── Status colours ───────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  pending:     "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  completed:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  overdue:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  skipped:     "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// ─── Top-level tabs ───────────────────────────────────────────────────────────
const TOP_TABS = [
  { key: "overview", label: "Overview", icon: Gauge },
  { key: "modules",  label: "Modules",  icon: Layers },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TatOverview() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">TAT Overview</h1>
            <p className="text-xs text-muted-foreground">Live Monitoring · Alerts · Stallers</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b px-2">
        <div className="flex gap-0.5">
          {TOP_TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors
                  ${tab === t.key
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
                  }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "overview" && <OverviewTab />}
        {tab === "modules"  && <ModulesTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/tat/overview"],
    queryFn: () => apiFetch("/api/tat/overview"),
  });

  const stats = data?.stats || {};
  const overdueByModule: any[] = data?.overdueByModule || [];
  const pendingByModule: any[] = data?.pendingByModule || [];

  const statCards = [
    { label: "Overdue",   value: stats.overdue_count || 0,          icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-50 dark:bg-red-950/30" },
    { label: "Pending",   value: stats.pending_count || 0,          icon: Timer,         color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
    { label: "Completed", value: stats.completed_count || 0,        icon: CheckCircle2,  color: "text-green-500",  bg: "bg-green-50 dark:bg-green-950/30" },
    { label: "Avg Days",  value: stats.avg_completion_days || "—",  icon: TrendingUp,    color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/30" },
  ];

  const modIcons: Record<string, any> = {
    VENDOR: Building2, PR: FileText, BID: Layers, PO: ShoppingCart,
    DN: Truck, GRN: Package, INVOICE: Receipt,
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`rounded-xl border ${s.bg} p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <div className="text-2xl font-bold">{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* By module */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" /> Overdue by Module
          </h3>
          {overdueByModule.length === 0 ? (
            <EmptyState label="No overdue items" />
          ) : overdueByModule.map((m: any) => {
            const Icon = modIcons[m.entity_type] || Clock;
            return (
              <div key={m.entity_type} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{m.entity_type}</span>
                </div>
                <Badge variant="destructive" className="text-xs">{m.cnt} overdue</Badge>
              </div>
            );
          })}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Timer className="h-4 w-4 text-yellow-500" /> Pending by Module
          </h3>
          {pendingByModule.length === 0 ? (
            <EmptyState label="No pending items" />
          ) : pendingByModule.map((m: any) => {
            const Icon = modIcons[m.entity_type] || Clock;
            return (
              <div key={m.entity_type} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{m.entity_type}</span>
                </div>
                <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">{m.cnt} pending</Badge>
              </div>
            );
          })}
        </div>
      </div>

      {/* Universal TAT Life Cycle Check */}
      <UniversalCheck />
    </div>
  );
}

// ─── Universal Check ──────────────────────────────────────────────────────────
function UniversalCheck() {
  const [entityType, setEntityType] = useState("PR");
  const [inputId, setInputId] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const { data: ids = [], isLoading: idsLoading } = useQuery<string[]>({
    queryKey: ["/api/tat/lifecycle-ids", entityType],
    queryFn: () => apiFetch(`/api/tat/lifecycle-ids/${entityType}`),
    enabled: !!entityType,
  });

  const { data: stages = [], isLoading: stagesLoading } = useQuery<TatLog[]>({
    queryKey: ["/api/tat/lifecycle", entityType, selectedId],
    queryFn: () => apiFetch(`/api/tat/lifecycle/${entityType}/${encodeURIComponent(selectedId)}`),
    enabled: !!selectedId,
  });

  const handleCheck = () => {
    if (inputId.trim()) setSelectedId(inputId.trim());
  };

  const handleDropdownSelect = (val: string) => {
    setInputId(val);
    setSelectedId(val);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <GanttChart className="h-4 w-4 text-indigo-500" /> Universal TAT Life Cycle Check
      </h3>

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={entityType} onValueChange={v => { setEntityType(v); setSelectedId(""); setInputId(""); }}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["PR","PO","BID","INVOICE","VENDOR","DN","GRN"].map(t => (
              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={inputId}
          onValueChange={handleDropdownSelect}
          disabled={idsLoading || ids.length === 0}
        >
          <SelectTrigger className="w-52 h-8 text-xs">
            <SelectValue placeholder={idsLoading ? "Loading…" : ids.length === 0 ? "No IDs found" : "Select ID…"} />
          </SelectTrigger>
          <SelectContent>
            {ids.map((id: string) => (
              <SelectItem key={id} value={id} className="text-xs">{id}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          className="w-40 h-8 text-xs"
          placeholder="Or type ID…"
          value={inputId}
          onChange={e => setInputId(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCheck()}
        />

        <Button size="sm" className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={handleCheck} disabled={!inputId.trim()}>
          <Eye className="h-3.5 w-3.5 mr-1" /> Check
        </Button>
      </div>

      {selectedId && (
        stagesLoading ? (
          <p className="text-xs text-muted-foreground py-2">Loading lifecycle…</p>
        ) : stages.length === 0 ? (
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border text-xs text-muted-foreground">
            <Info className="h-4 w-4 flex-shrink-0" />
            No TAT lifecycle data found for {entityType} — {selectedId}.
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-2 pl-8">
              {stages.map((s) => (
                <div key={s.id} className="relative">
                  <div className={`absolute -left-[1.35rem] w-3 h-3 rounded-full border-2 border-white dark:border-gray-900
                    ${s.status === "completed" ? "bg-green-500" : s.is_overdue ? "bg-red-500" : s.status === "in_progress" ? "bg-blue-500" : "bg-gray-300"}`} />
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{s.stage_order}. {s.stage_name}</span>
                        {s.is_supplier_stage && <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600">Supplier</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{s.tat_days_allowed}d TAT</Badge>
                        {s.is_overdue && <Badge variant="destructive" className="text-[10px]">+{s.overdue_days}d overdue</Badge>}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[s.status] || STATUS_COLOR.pending}`}>
                          {s.status}
                        </span>
                      </div>
                    </div>
                    {s.owner_name && <p className="text-[11px] text-muted-foreground mt-1">Owner: {s.owner_name}</p>}
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                      {s.started_at   && <span>Started: {new Date(s.started_at).toLocaleDateString()}</span>}
                      {s.due_at       && <span>Due: {new Date(s.due_at).toLocaleDateString()}</span>}
                      {s.completed_at && <span>Done: {new Date(s.completed_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULES TAB
// ═══════════════════════════════════════════════════════════════════════════════
const MODULE_SUB_TABS = [
  { key: "vendor",   label: "Vendor",         entityType: "VENDOR",  icon: Building2 },
  { key: "pr",       label: "PR",             entityType: "PR",      icon: FileText },
  { key: "bids",     label: "Bids / Events",  entityType: "BID",     icon: Layers },
  { key: "po",       label: "PO",             entityType: "PO",      icon: ShoppingCart },
  { key: "dn",       label: "DN",             entityType: "DN",      icon: Truck },
  { key: "grn",      label: "GRN / SRN",      entityType: "GRN",     icon: Package },
  { key: "invoice",  label: "Invoice",        entityType: "INVOICE", icon: Receipt },
];

function ModulesTab() {
  const [activeModule, setActiveModule] = useState("vendor");
  const current = MODULE_SUB_TABS.find(t => t.key === activeModule)!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {MODULE_SUB_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveModule(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${activeModule === t.key
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-gray-900 border text-muted-foreground hover:text-foreground"
                }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
      <ModuleContent moduleKey={current.key} entityType={current.entityType} label={current.label} />
    </div>
  );
}

function ModuleContent({ moduleKey, entityType, label }: { moduleKey: string; entityType: string; label: string }) {
  const [section, setSection] = useState<"alerts" | "missed" | "stallers" | "ignored">("alerts");

  const sections = [
    { key: "alerts",   label: "Alerts",        icon: Bell },
    { key: "missed",   label: "Missed Alerts", icon: BellOff },
    { key: "stallers", label: "Stallers",       icon: PauseCircle },
    { key: "ignored",  label: "Ignored TATs",  icon: X },
  ] as const;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border">
      <div className="flex border-b px-4">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px
                ${section === s.key
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="p-4">
        {section === "alerts"   && <AlertsSection   module={moduleKey} entityType={entityType} label={label} />}
        {section === "missed"   && <MissedSection   module={moduleKey} entityType={entityType} label={label} />}
        {section === "stallers" && <StallersSection module={moduleKey} entityType={entityType} label={label} />}
        {section === "ignored"  && <IgnoredSection  module={moduleKey} entityType={entityType} label={label} />}
      </div>
    </div>
  );
}

function AlertsSection({ module, entityType, label }: { module: string; entityType: string; label: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/tat/alerts", module],
    queryFn: () => apiFetch(`/api/tat/alerts?module=${module}`),
  });
  if (isLoading) return <LoadingState />;
  if (data.length === 0) return <EmptyState label={`No alerts for ${label}`} />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{data.length} alert{data.length !== 1 ? "s" : ""}</p>
      {data.map((a: any) => (
        <div key={a.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium">{a.entity_type} — {a.entity_id}</span>
              <span className="text-xs text-muted-foreground">{a.stage_name}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              From: {a.escalated_from_name} → To: {a.escalated_to_name || "—"}
            </p>
          </div>
          <div className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {a.escalated_at ? new Date(a.escalated_at).toLocaleDateString() : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function MissedSection({ module, entityType, label }: { module: string; entityType: string; label: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/tat/missed-alerts", module],
    queryFn: () => apiFetch(`/api/tat/missed-alerts?module=${module}`),
  });
  if (isLoading) return <LoadingState />;
  if (data.length === 0) return <EmptyState label={`No missed alerts for ${label}`} />;
  return (
    <div className="space-y-2">
      {data.map((m: any) => (
        <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <div>
            <div className="text-xs font-medium">{m.entity_type} — {m.entity_id}</div>
            <div className="text-[11px] text-muted-foreground">{m.stage_name} · {m.missed_reason || "No reason"}</div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {m.updated_at ? new Date(m.updated_at).toLocaleDateString() : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function StallersSection({ module, entityType, label }: { module: string; entityType: string; label: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/tat/stallers", module],
    queryFn: () => apiFetch(`/api/tat/stallers?module=${module}`),
  });
  if (isLoading) return <LoadingState />;
  if (data.length === 0) return <EmptyState label={`No stallers for ${label}`} />;
  return (
    <div className="space-y-2">
      {data.map((s: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
          <div>
            <div className="text-xs font-medium">{s.stage_name}</div>
            <div className="text-[11px] text-muted-foreground">Owner: {s.owner_name || "—"}</div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">{s.occurrences}×</span>
            <Badge variant="outline" className="text-purple-600 border-purple-300">Avg {s.avg_overdue}d</Badge>
            <Badge variant="destructive" className="text-[10px]">Max {s.max_overdue}d</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function IgnoredSection({ module, entityType, label }: { module: string; entityType: string; label: string }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/tat/ignored", module],
    queryFn: () => apiFetch(`/api/tat/ignored?module=${module}`),
  });
  if (isLoading) return <LoadingState />;
  if (data.length === 0) return <EmptyState label={`No ignored TATs for ${label}`} />;
  return (
    <div className="space-y-2">
      {data.map((ig: any) => (
        <div key={ig.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
          <div>
            <div className="text-xs font-medium">{ig.entity_type} — {ig.entity_id}</div>
            <div className="text-[11px] text-muted-foreground">{ig.stage_name}</div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {ig.ignored_at ? new Date(ig.ignored_at).toLocaleDateString() : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Info className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
