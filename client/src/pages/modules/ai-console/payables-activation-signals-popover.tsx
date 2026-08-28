import { useMemo } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePayablesActivationSignals } from "@/hooks/usePayablesActivationSignals";
import { usePayablesActivationPreferences } from "@/hooks/usePayablesActivationPreferences";
import {
  getPendingInvoiceReviewFlowType,
  PAYABLES_ACTIVATION_LIFECYCLE_ORDER,
  PAYABLES_ACTIVATION_STAGE_LABELS,
  type PayablesActivationStage,
  type PayablesActivationStageId,
  type PayablesActivationStageItem,
} from "@shared/payables-activation-signals";

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
  onActivate,
}: {
  stage: PayablesActivationStage;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onActivate: () => void;
}) {
  const showActive = stage.status === "pending" && enabled && stage.pendingCount > 0;
  const canClick = enabled && stage.pendingCount > 0;

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
          if (canClick) onActivate();
        }}
        data-testid={`payables-activation-signal-row-${stage.id}`}
      >
        <StatusDot pending={showActive} />
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-foreground"
          title={stage.label}
        >
          {stage.label}
        </span>
        {showActive ? (
          <span
            className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
            aria-label={`${stage.pendingCount} pending`}
          >
            {stage.pendingCount}
          </span>
        ) : null}
      </button>
      <Switch
        checked={enabled}
        onCheckedChange={onToggleEnabled}
        aria-label={`Track ${stage.label}`}
        data-testid={`payables-activation-signal-pref-${stage.id}`}
        className="data-[state=checked]:bg-amber-500 shrink-0"
      />
    </div>
  );
}

export function PayablesActivationSignalsPopover({
  onStageActivate,
}: {
  onStageActivate?: (
    stageId: PayablesActivationStageId,
    item: PayablesActivationStageItem | null,
    taskIndex: number,
    label: string,
  ) => void;
} = {}) {
  const { preferences, setStageEnabled, isStageEnabled } = usePayablesActivationPreferences();
  const { data, isLoading, isFetching } = usePayablesActivationSignals();

  const stages = data?.stages ?? [];

  const enabledPendingTotal = useMemo(() => {
    return stages.reduce((sum, stage) => {
      if (!isStageEnabled(stage.id)) return sum;
      return sum + (stage.status === "pending" ? stage.pendingCount : 0);
    }, 0);
  }, [stages, isStageEnabled, preferences]);

  const orderedStages = useMemo(() => {
    const byId = new Map(stages.map((s) => [s.id, s]));
    return PAYABLES_ACTIVATION_LIFECYCLE_ORDER.map(
      (id) =>
        byId.get(id) ?? {
          id,
          label: PAYABLES_ACTIVATION_STAGE_LABELS[id],
          status: "idle" as const,
          pendingCount: 0,
          items: [] as PayablesActivationStageItem[],
        },
    );
  }, [stages]);

  const handleActivate = (stage: PayablesActivationStage) => {
    if (!onStageActivate) return;
    if (!isStageEnabled(stage.id) || stage.pendingCount === 0) return;
    if (!getPendingInvoiceReviewFlowType(stage.id)) return;

    if (stage.pendingCount === 1) {
      const item = stage.items[0];
      if (!item) return;
      const reference = item.invoiceNumber || item.invoiceId;
      const label = reference && item.title !== reference ? `${reference} — ${item.title}` : item.title;
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
          data-testid="button-payables-activation-signals"
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
      <PopoverContent
        align="start"
        className="w-80 p-0"
        data-testid="payables-activation-signals-popover"
      >
        <div className="border-b px-3 py-2">
          <div className="text-xs font-semibold">Activation Signals</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Turn invoice approval requests on or off for this agent.
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading signals…
            </div>
          ) : (
            orderedStages.map((stage) => (
              <StageRow
                key={stage.id}
                stage={stage}
                enabled={isStageEnabled(stage.id)}
                onToggleEnabled={(enabled) => setStageEnabled(stage.id, enabled)}
                onActivate={() => handleActivate(stage)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
