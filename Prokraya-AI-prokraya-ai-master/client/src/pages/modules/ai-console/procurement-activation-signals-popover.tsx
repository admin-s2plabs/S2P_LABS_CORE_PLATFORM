import { useMemo } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useProcurementActivationSignals } from "@/hooks/useProcurementActivationSignals";
import { useProcurementActivationPreferences } from "@/hooks/useProcurementActivationPreferences";
import {
  ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS,
  getActiveProcurementLifecycleOrder,
  PROCUREMENT_ACTIVATION_STAGE_LABELS,
  getPendingTaskReviewFlowType,
  isProcurementPhase2Stage,
  type ProcurementActivationStage,
  type ProcurementActivationStageId,
  type ProcurementActivationStageItem,
} from "@shared/procurement-activation-signals";

function StatusDot({ pending }: { pending: boolean }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        pending ? "bg-amber-500" : "bg-muted-foreground/30",
      )}
      aria-hidden
    />
  );
}

function StageRow({
  stage,
  enabled,
  onToggleEnabled,
  onNavigate,
}: {
  stage: ProcurementActivationStage;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onNavigate: () => void;
}) {
  const isPending = stage.status === "pending" || (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stage.id === "requested");
  const showActive = stage.status === "pending" && enabled && stage.pendingCount > 0;
  const canClick =
    enabled && (stage.pendingCount > 0 || (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stage.id === "requested"));

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b last:border-b-0 transition-colors",
        canClick && "hover:bg-muted/50",
        !enabled && "opacity-50",
      )}
    >
      <button
        type="button"
        aria-disabled={!canClick}
        tabIndex={canClick ? 0 : -1}
        className={cn(
          "flex flex-1 items-center gap-2 min-w-0 text-left",
          canClick ? "cursor-pointer" : "cursor-default",
        )}
        onClick={() => {
          if (canClick) onNavigate();
        }}
        data-testid={`activation-signal-row-${stage.id}`}
      >
        <StatusDot pending={showActive || (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stage.id === "requested" && enabled)} />
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-foreground"
          title={stage.label}
        >
          {stage.label}
        </span>
        <span
          className={cn(
            "ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
            showActive
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
              : "bg-muted text-muted-foreground",
            !enabled && stage.pendingCount > 0 && "opacity-70",
          )}
          aria-label={`${stage.pendingCount} pending${!enabled ? " (not tracked)" : ""}`}
        >
          {stage.pendingCount}
        </span>
      </button>
      <Switch
        checked={enabled}
        onCheckedChange={onToggleEnabled}
        aria-label={`Track ${stage.label}`}
        data-testid={`activation-signal-pref-${stage.id}`}
        className="data-[state=checked]:bg-amber-500 shrink-0"
      />
    </div>
  );
}

export function ProcurementActivationSignalsPopover({
  onStageActivate,
}: {
  onStageActivate?: (
    stageId: ProcurementActivationStageId,
    item: ProcurementActivationStageItem | null,
    taskIndex: number,
    label: string,
  ) => void;
} = {}) {
  const { preferences, setStageEnabled, isStageEnabled } = useProcurementActivationPreferences();
  const { data, isLoading, isFetching } = useProcurementActivationSignals();

  const stages = data?.stages ?? [];

  const enabledPendingTotal = useMemo(() => {
    return stages.reduce((sum, stage) => {
      if (!isStageEnabled(stage.id)) return sum;
      return sum + (stage.status === "pending" ? stage.pendingCount : 0);
    }, 0);
  }, [stages, isStageEnabled, preferences]);

  const orderedStages = useMemo(() => {
    const byId = new Map(stages.map((s) => [s.id, s]));
    return getActiveProcurementLifecycleOrder().map(
      (id) =>
        byId.get(id) ?? {
          id,
          label: PROCUREMENT_ACTIVATION_STAGE_LABELS[id],
          status: "idle" as const,
          pendingCount: 0,
          items: [] as ProcurementActivationStageItem[],
        },
    );
  }, [stages]);

  const handleNavigate = (stage: ProcurementActivationStage) => {
    if (!onStageActivate) return;
    if (!ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && isProcurementPhase2Stage(stage.id)) return;
    if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && stage.id === "requested") {
      onStageActivate(stage.id, null, -1, stage.label);
      return;
    }
    if (stage.pendingCount === 0) return;
    const inlineFlow = getPendingTaskReviewFlowType(stage.id);
    if (!inlineFlow) return;

    if (stage.pendingCount === 1) {
      const item = stage.items[0];
      if (!item) return;
      const label =
        item.budgetId || item.prNumber || item.poNumber || item.invoiceId
          ? `${item.budgetId || item.prNumber || item.poNumber || item.invoiceId} — ${item.title}`
          : item.title;
      onStageActivate(stage.id, item, 0, label);
      return;
    }
    onStageActivate(stage.id, null, -1, stage.label);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 relative"
          data-testid="button-activation-signals"
        >
          <Activity className="h-3.5 w-3.5" />
          Activation Signals
          {enabledPendingTotal > 0 && (
            <Badge
              variant="secondary"
              className="h-5 min-w-5 px-1.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
            >
              {enabledPendingTotal}
            </Badge>
          )}
          {(isLoading || isFetching) && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" data-testid="activation-signals-popover">
        <div className="border-b px-3 py-2">
          <div className="text-xs font-semibold">Activation Signals</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Toggle which signals the agent tracks. Counts always reflect live pending work.
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {orderedStages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              enabled={isStageEnabled(stage.id)}
              onToggleEnabled={(enabled) => setStageEnabled(stage.id, enabled)}
              onNavigate={() => handleNavigate(stage)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
