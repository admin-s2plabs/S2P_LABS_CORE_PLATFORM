import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, Settings, RefreshCw, Info, AlertCircle,
  FileText, ShoppingCart, Package, Truck, Receipt, Building2,
  Save, History, ChevronRight, Layers, ChevronDown,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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
interface WfStep { id: number; step_order: number; name: string; step_type: string; assignments: any[] }
interface Workflow { id: number; name: string; stepCount: number; steps: WfStep[] }

interface TatRuleStage {
  id?: number;
  stage_order: number;
  stage_name: string;
  stage_type: string;
  tat_days: number;
  approver_step_id?: number | null;
  is_supplier_stage: boolean;
  escalate_to_supplier: boolean;
  is_editable: boolean;
  sub_type?: string;
  need_by_date_ref?: boolean; // highlight = needs need-by date
}

// ─── Top-level tabs ───────────────────────────────────────────────────────────
const TOP_TABS = [
  { key: "rules",     label: "Rules",       icon: Settings },
  { key: "audit",     label: "Audit Logs",  icon: History },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TatManagement() {
  const [tab, setTab] = useState("rules");

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">TAT Management</h1>
            <p className="text-xs text-muted-foreground">Turnaround Time · Approval Workflows · Escalation</p>
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
        {tab === "rules"    && <RulesTab />}
        {tab === "audit"    && <AuditLogsTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RULES TAB — Restructured per requirements
// ═══════════════════════════════════════════════════════════════════════════════

// Bid sub-types
const BID_SUB_TYPES = [
  { key: "rfq",    label: "RFQ" },
  { key: "rfp",    label: "RFP" },
  { key: "tender", label: "Tender" },
];

// PO sub-types
const PO_SUB_TYPES = [
  { key: "po_direct",   label: "Direct PO" },
  { key: "po_from_bid", label: "From Bid" },
  { key: "po_from_pr",  label: "From PR" },
];

// Invoice sub-types
const INVOICE_SUB_TYPES = [
  { key: "invoice_po",     label: "PO Invoice" },
  { key: "invoice_non_po", label: "Non-PO Invoice" },
];

// Module tree
const RULE_MODULE_TREE = [
  {
    key: "vendor", label: "Vendor", icon: Building2,
    wfKey: "vendor",
    desc: "Internal vendor approval only — single Approver stage",
    subTypes: null,
  },
  {
    key: "pr", label: "PR", icon: FileText,
    wfKey: "pr",
    desc: "Purchase Requisition — Department Approver",
    subTypes: null,
  },
  {
    key: "bids", label: "Bids / Events", icon: Layers,
    wfKey: "bid",
    desc: "Bid → choose type and PR source",
    subTypes: {
      bidSource: [
        { key: "bid_direct", label: "Direct Bid" },
        { key: "bid_from_pr", label: "Bid from PR" },
      ],
      bidType: BID_SUB_TYPES,
    },
  },
  {
    key: "po", label: "PO", icon: ShoppingCart,
    wfKey: "po",
    desc: "Purchase Order — choose source type",
    subTypes: { poType: PO_SUB_TYPES },
  },
  {
    key: "dn", label: "Delivery Note (DN)", icon: Truck,
    wfKey: null,
    desc: "DN Creation by Supplier only",
    subTypes: null,
  },
  {
    key: "grn", label: "GRN / SRN", icon: Package,
    wfKey: null,
    desc: "GRN / Inspection — arrival must be before need-by date",
    subTypes: null,
  },
  {
    key: "invoice", label: "Invoice", icon: Receipt,
    wfKey: "invoice",
    desc: "Invoice — choose PO or Non-PO",
    subTypes: { invoiceType: INVOICE_SUB_TYPES },
  },
];

function RulesTab() {
  const { data: workflows = [], isLoading: wfLoading } = useQuery<Workflow[]>({
    queryKey: ["/api/tat/workflows-summary"],
    queryFn: () => apiFetch("/api/tat/workflows-summary"),
  });

  const { data: allRules = [] } = useQuery<any[]>({
    queryKey: ["/api/tat/rules"],
    queryFn: () => apiFetch("/api/tat/rules"),
  });

  const [activeModule, setActiveModule] = useState("vendor");
  // Sub-selection state
  const [bidSource, setBidSource] = useState("bid_direct");
  const [bidType, setBidType]     = useState("rfq");
  const [poType, setPoType]       = useState("po_direct");
  const [invoiceType, setInvoiceType] = useState("invoice_po");

  const moduleInfo = RULE_MODULE_TREE.find(m => m.key === activeModule)!;

  // Compute the effective module_key for the rule editor
  let effectiveModuleKey = activeModule;
  if (activeModule === "bids") {
    effectiveModuleKey = `${bidSource}_${bidType}`;
  } else if (activeModule === "po") {
    effectiveModuleKey = poType;
  } else if (activeModule === "invoice") {
    effectiveModuleKey = invoiceType;
  }

  const workflow = moduleInfo.wfKey
    ? workflows.find(w => w.name.toLowerCase().includes(moduleInfo.wfKey!))
    : null;

  return (
    <div className="flex gap-4 h-full">
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 bg-white dark:bg-gray-900 rounded-xl border p-2">
        <p className="text-[11px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">Modules</p>
        {RULE_MODULE_TREE.map(m => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => setActiveModule(m.key)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-left transition-colors mb-0.5
                ${activeModule === m.key
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-medium"
                  : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Editor */}
      <div className="flex-1 space-y-3">
        {/* Sub-type selectors */}
        {activeModule === "bids" && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Source:</Label>
              <Select value={bidSource} onValueChange={setBidSource}>
                <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bid_direct" className="text-xs">Direct Bid</SelectItem>
                  <SelectItem value="bid_from_pr" className="text-xs">Bid from PR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Bid Type:</Label>
              <Select value={bidType} onValueChange={setBidType}>
                <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BID_SUB_TYPES.map(t => <SelectItem key={t.key} value={t.key} className="text-xs">{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {bidSource === "bid_from_pr" && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs text-amber-700">
                <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Closing date auto-set to <strong>10 days before</strong> need-by date on PR/Bid</span>
              </div>
            )}
          </div>
        )}

        {activeModule === "po" && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-3 flex items-center gap-4">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">PO Source:</Label>
            <Select value={poType} onValueChange={setPoType}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PO_SUB_TYPES.map(t => <SelectItem key={t.key} value={t.key} className="text-xs">{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {activeModule === "invoice" && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-3 flex items-center gap-4">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Invoice Type:</Label>
            <Select value={invoiceType} onValueChange={setInvoiceType}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_SUB_TYPES.map(t => <SelectItem key={t.key} value={t.key} className="text-xs">{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {wfLoading ? (
          <LoadingState />
        ) : (
          <RuleEditor
            key={effectiveModuleKey}
            moduleKey={effectiveModuleKey}
            moduleInfo={moduleInfo}
            bidSource={bidSource}
            bidType={bidType}
            workflow={workflow}
            existingRules={allRules.filter((r: any) => r.module_key === effectiveModuleKey)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Rule Editor ──────────────────────────────────────────────────────────────
function RuleEditor({
  moduleKey, moduleInfo, bidSource, bidType, workflow, existingRules,
}: {
  moduleKey: string;
  moduleInfo: typeof RULE_MODULE_TREE[0];
  bidSource?: string;
  bidType?: string;
  workflow: Workflow | null | undefined;
  existingRules: any[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stages, setStages] = useState<TatRuleStage[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (existingRules.length > 0) {
      setStages(existingRules.map(r => ({
        id: r.id,
        stage_order: r.stage_order,
        stage_name: r.stage_name,
        stage_type: r.stage_type,
        tat_days: r.tat_days,
        approver_step_id: r.approver_step_id,
        is_supplier_stage: r.is_supplier_stage,
        escalate_to_supplier: r.escalate_to_supplier,
        is_editable: r.is_editable,
        sub_type: r.sub_type,
        need_by_date_ref: r.need_by_date_ref || false,
      })));
    } else {
      setStages(buildDefaultStages(moduleKey, workflow, bidType));
    }
    setDirty(false);
  }, [moduleKey, existingRules.length, bidType]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/tat/rules", {
        method: "PUT",
        body: JSON.stringify({ module_key: moduleKey, rules: stages }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tat/rules"] });
      toast({ title: "Rules saved" });
      setDirty(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function updateTatDays(i: number, val: number) {
    setStages(prev => {
      const next = [...prev];
      next[i] = { ...next[i], tat_days: val };
      return next;
    });
    setDirty(true);
  }

  const Icon = moduleInfo.icon;
  const hasNeedByDate = stages.some(s => s.need_by_date_ref);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-indigo-500" />
            <h3 className="font-semibold text-base">{moduleInfo.label}</h3>
            {moduleKey !== moduleInfo.key && (
              <Badge variant="outline" className="text-xs">{moduleKey}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{moduleInfo.desc}</p>
          {workflow && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              Workflow: <strong>{workflow.name}</strong>
              {workflow.stepCount > 0 && ` · ${workflow.stepCount} approver step${workflow.stepCount !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-500 font-medium">Unsaved changes</span>}
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !dirty}
            className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saveMutation.isPending ? "Saving…" : "Save Rules"}
          </Button>
        </div>
      </div>

      {/* Need-by date banner */}
      {hasNeedByDate && (
        <div className="flex items-start gap-2 p-3 mb-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
          <span>
            <strong>Need-by Date required</strong> — Highlighted stages depend on the need-by date from the PR / Bid.
            Closing date is auto-set to <strong>10 days before</strong> the need-by date.
          </span>
        </div>
      )}

      <div className="flex items-start gap-2 p-2.5 mb-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        <span>Only <strong>TAT days</strong> are editable. Stages derive from the workflow and module configuration.</span>
      </div>

      {/* Stage list */}
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-1">#</div>
          <div className="col-span-5">Stage Name</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">TAT Days</div>
          <div className="col-span-2">Notes</div>
        </div>

        {stages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6">
            No stages configured. Save to initialize.
          </div>
        )}

        {stages.map((s, i) => (
          <StageRow key={i} stage={s} index={i} onChangeDays={val => updateTatDays(i, val)} />
        ))}
      </div>

      {stages.some(s => s.is_supplier_stage) && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800 text-xs text-orange-700 dark:text-orange-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Orange rows are supplier-side stages. Blue rows escalate to the user's manager via internal hierarchy.</span>
        </div>
      )}
    </div>
  );
}

// ─── Stage Row ─────────────────────────────────────────────────────────────────
function StageRow({ stage, index, onChangeDays }: {
  stage: TatRuleStage;
  index: number;
  onChangeDays: (val: number) => void;
}) {
  const STAGE_TYPE_LABELS: Record<string, string> = {
    approver_n:           "Approver",
    supplier:             "Supplier",
    grn_fixed:            "GRN",
    invoice_submission:   "Inv. Submission",
    invoice_payment:      "Payment",
    closing_date:         "Closing Date",
    evaluation:           "Evaluation",
    award:                "Award",
    acknowledgement:      "Acknowledgement",
    reviewer:             "Reviewer",
  };

  const isSupplier = stage.is_supplier_stage;
  const isNeedByRef = stage.need_by_date_ref;

  return (
    <div className={cn(
      `grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg border`,
      isNeedByRef
        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700"
        : isSupplier
          ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
          : "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700"
    )}>
      <div className="col-span-1 text-xs font-bold text-muted-foreground">{stage.stage_order}</div>

      <div className="col-span-5 flex items-center gap-2">
        <span className="text-xs font-medium truncate">{stage.stage_name}</span>
        {isSupplier && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 font-medium flex-shrink-0">
            Supplier
          </span>
        )}
        {isNeedByRef && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 font-medium flex-shrink-0 flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" /> Need-by
          </span>
        )}
      </div>

      <div className="col-span-2">
        <span className="text-xs text-muted-foreground">
          {STAGE_TYPE_LABELS[stage.stage_type] || stage.stage_type}
        </span>
      </div>

      <div className="col-span-2">
        <Input
          type="number"
          min={1}
          max={365}
          value={stage.tat_days}
          onChange={e => onChangeDays(Math.max(1, Number(e.target.value)))}
          className={cn("h-7 text-xs w-20 font-medium", isNeedByRef ? "border-amber-400" : isSupplier ? "border-orange-300" : "")}
        />
      </div>

      <div className="col-span-2 text-[10px] text-muted-foreground">
        {isNeedByRef ? "→ tied to need-by date" : isSupplier ? "→ escalates to supplier" : "→ escalates to manager"}
      </div>
    </div>
  );
}

// ─── Build default stages ─────────────────────────────────────────────────────
function buildDefaultStages(moduleKey: string, workflow: Workflow | null | undefined, bidType?: string): TatRuleStage[] {
  const approverSteps: TatRuleStage[] = (workflow?.steps || []).map((step, i) => ({
    stage_order: i + 1,
    stage_name: `Approver ${i + 1} — ${step.name}`,
    stage_type: "approver_n",
    tat_days: 3,
    approver_step_id: step.id,
    is_supplier_stage: false,
    escalate_to_supplier: false,
    is_editable: false,
    need_by_date_ref: false,
  }));

  const n = approverSteps.length;

  // Helper: fallback single approver if no workflow
  const singleApprover: TatRuleStage[] = approverSteps.length > 0 ? approverSteps : [{
    stage_order: 1, stage_name: "Approver", stage_type: "approver_n",
    tat_days: 3, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false,
  }];
  const na = singleApprover.length;

  switch (moduleKey) {
    // ── Vendor: Approver only ──────────────────────────────────────────────────
    case "vendor":
      return singleApprover;

    // ── PR: Approver only ─────────────────────────────────────────────────────
    case "pr":
      return singleApprover;

    // ── Bids: RFQ ─────────────────────────────────────────────────────────────
    case "bid_direct_rfq":
    case "bid_from_pr_rfq": {
      const isFromPr = moduleKey.startsWith("bid_from_pr");
      return [
        ...singleApprover,
        {
          stage_order: na + 1, stage_name: "Supplier Bid Response (Closing Date)", stage_type: "closing_date",
          tat_days: isFromPr ? 10 : 7, is_supplier_stage: true, escalate_to_supplier: true, is_editable: true,
          need_by_date_ref: isFromPr,
        },
        { stage_order: na + 2, stage_name: "Award Approval", stage_type: "award", tat_days: 2, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
      ];
    }

    // ── Bids: RFP ─────────────────────────────────────────────────────────────
    case "bid_direct_rfp":
    case "bid_from_pr_rfp": {
      const isFromPr = moduleKey.startsWith("bid_from_pr");
      return [
        ...singleApprover,
        {
          stage_order: na + 1, stage_name: "Supplier Bid Response (Closing Date)", stage_type: "closing_date",
          tat_days: isFromPr ? 10 : 7, is_supplier_stage: true, escalate_to_supplier: true, is_editable: true,
          need_by_date_ref: isFromPr,
        },
        { stage_order: na + 2, stage_name: "Technical Evaluation", stage_type: "evaluation", tat_days: 3, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
        { stage_order: na + 3, stage_name: "Commercial Evaluation", stage_type: "evaluation", tat_days: 3, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
        { stage_order: na + 4, stage_name: "Award Approval", stage_type: "award", tat_days: 2, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
      ];
    }

    // ── Bids: Tender ──────────────────────────────────────────────────────────
    case "bid_direct_tender":
    case "bid_from_pr_tender": {
      const isFromPr = moduleKey.startsWith("bid_from_pr");
      return [
        ...singleApprover,
        {
          stage_order: na + 1, stage_name: "Supplier Bid Response (Closing Date)", stage_type: "closing_date",
          tat_days: isFromPr ? 10 : 14, is_supplier_stage: true, escalate_to_supplier: true, is_editable: true,
          need_by_date_ref: isFromPr,
        },
        { stage_order: na + 2, stage_name: "Technical Evaluation", stage_type: "evaluation", tat_days: 5, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
        { stage_order: na + 3, stage_name: "Commercial Evaluation", stage_type: "evaluation", tat_days: 5, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
        { stage_order: na + 4, stage_name: "Technical Reviewer", stage_type: "reviewer", tat_days: 3, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
        { stage_order: na + 5, stage_name: "Commercial Reviewer", stage_type: "reviewer", tat_days: 3, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
      ];
    }

    // ── PO: All types — Supplier Acknowledgement only ─────────────────────────
    case "po_direct":
    case "po_from_bid":
    case "po_from_pr":
      return [
        { stage_order: 1, stage_name: "Supplier Acknowledgement", stage_type: "acknowledgement", tat_days: 2, is_supplier_stage: true, escalate_to_supplier: true, is_editable: false, need_by_date_ref: false },
      ];

    // ── DN: DN Creation only (no dispatch confirmation) ───────────────────────
    case "dn":
      return [
        { stage_order: 1, stage_name: "DN Creation by Supplier", stage_type: "supplier", tat_days: 1, is_supplier_stage: true, escalate_to_supplier: true, is_editable: false, need_by_date_ref: false },
      ];

    // ── GRN: Single stage — GRN/Inspection, arrival before need-by ───────────
    case "grn":
      return [
        {
          stage_order: 1, stage_name: "GRN / Inspection (Arrival before Need-by Date)", stage_type: "grn_fixed",
          tat_days: 1, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false,
          need_by_date_ref: true,
        },
      ];

    // ── Invoice PO ────────────────────────────────────────────────────────────
    case "invoice_po":
      return [
        { stage_order: 1, stage_name: "Invoice Submission Window", stage_type: "invoice_submission", tat_days: 3, is_supplier_stage: true, escalate_to_supplier: true, is_editable: false, need_by_date_ref: false },
        ...singleApprover.map((s, i) => ({ ...s, stage_order: i + 2 })),
        { stage_order: na + 2, stage_name: "Payment Processing", stage_type: "invoice_payment", tat_days: 5, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
      ];

    // ── Invoice Non-PO ────────────────────────────────────────────────────────
    case "invoice_non_po":
      return [
        { stage_order: 1, stage_name: "Invoice Submission", stage_type: "invoice_submission", tat_days: 2, is_supplier_stage: true, escalate_to_supplier: true, is_editable: false, need_by_date_ref: false },
        ...singleApprover.map((s, i) => ({ ...s, stage_order: i + 2 })),
        { stage_order: na + 2, stage_name: "Payment Processing", stage_type: "invoice_payment", tat_days: 5, is_supplier_stage: false, escalate_to_supplier: false, is_editable: false, need_by_date_ref: false },
      ];

    default:
      return singleApprover;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AuditLogsTab() {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/tat/audit-logs"],
    queryFn: () => apiFetch("/api/tat/audit-logs"),
  });
  if (isLoading) return <LoadingState />;
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-indigo-500" /> TAT Audit Logs
      </h3>
      {data.length === 0 ? <EmptyState label="No audit log entries yet" /> : (
        <div className="space-y-1.5">
          {data.map((log: any) => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/40">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">{log.action || log.event_type || "Action"}</span>
                  {log.module_key && <Badge variant="outline" className="text-[10px]">{log.module_key}</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  By: {log.performed_by || log.created_by || "—"}
                  {log.description && ` · ${log.description}`}
                </p>
              </div>
              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                {log.created_date ? new Date(log.created_date).toLocaleString() : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
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
