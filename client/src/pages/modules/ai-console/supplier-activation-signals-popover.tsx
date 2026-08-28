import { useMemo } from "react";

import { Activity, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSupplierActivationSignals } from "@/hooks/useSupplierActivationSignals";
import { useSupplierActivationPreferences } from "@/hooks/useSupplierActivationPreferences";
import {
  SUPPLIER_ACTIVATION_LIFECYCLE_ORDER,
  SUPPLIER_ACTIVATION_STAGE_LABELS,
  type SupplierActivationStage,
  type SupplierActivationStageItem,
} from "@shared/supplier-activation-signals";

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
  stage: SupplierActivationStage;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onActivate: () => void;
}) {
  const isPending = stage.status === "pending" && stage.pendingCount > 0;
  const showActive = isPending && enabled;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b last:border-b-0 transition-colors",
        isPending && enabled && "hover:bg-muted/50",
        !enabled && "opacity-50",
      )}
    >
      <button
        type="button"
        aria-disabled={!isPending || !enabled}
        tabIndex={isPending && enabled ? 0 : -1}
        className={cn(
          "flex flex-1 items-center gap-2 min-w-0 text-left",
          isPending && enabled && "cursor-pointer",
          (!isPending || !enabled) && "cursor-default",
        )}
        onClick={() => {
          if (isPending && enabled) onActivate();
        }}
        data-testid={`supplier-activation-signal-row-${stage.id}`}
      >
        <StatusDot pending={showActive} />
        <span className="flex-1 text-[11px] font-medium text-foreground leading-tight min-w-0">
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
        data-testid={`supplier-activation-signal-pref-${stage.id}`}
        className="data-[state=checked]:bg-amber-500 shrink-0"
      />
    </div>
  );
}

export function SupplierActivationSignalsPopover({
  onStageActivate,
}: {
  onStageActivate?: (
    item: SupplierActivationStageItem | null,
    taskIndex: number,
    label: string,
  ) => void;
} = {}) {
  const { preferences, setStageEnabled, isStageEnabled } = useSupplierActivationPreferences();
  const { data, isLoading, isFetching } = useSupplierActivationSignals();

  const stages = data?.stages ?? [];

  const enabledPendingTotal = useMemo(() => {
    return stages.reduce((sum, stage) => {
      if (!isStageEnabled(stage.id)) return sum;
      return sum + (stage.status === "pending" ? stage.pendingCount : 0);
    }, 0);
  }, [stages, isStageEnabled, preferences]);

  const orderedStages = useMemo(() => {
    const byId = new Map(stages.map((s) => [s.id, s]));
    return SUPPLIER_ACTIVATION_LIFECYCLE_ORDER.map(
      (id) =>
        byId.get(id) ?? {
          id,
          label: SUPPLIER_ACTIVATION_STAGE_LABELS[id],
          status: "idle" as const,
          pendingCount: 0,
          items: [] as SupplierActivationStageItem[],
        },
    );
  }, [stages]);

  const handleActivate = (stage: SupplierActivationStage) => {
    if (!isStageEnabled(stage.id) || stage.pendingCount === 0) return;
    if (stage.pendingCount === 1) {
      const item = stage.items[0];
      if (!item) return;
      onStageActivate?.(item, 0, item.companyName || item.title);
      return;
    }
    onStageActivate?.(null, -1, stage.label);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 relative"
          data-testid="button-supplier-activation-signals"
        >
          <Activity className="h-3.5 w-3.5" />
          Activation Signals
          {enabledPendingTotal > 0 && (
            <Badge
              variant="secondary"
              className="h-4 min-w-4 px-1 text-[10px] bg-amber-500 text-white border-0"
            >
              {enabledPendingTotal}
            </Badge>
          )}
          {(isLoading || isFetching) && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="px-3 py-2 border-b">
          <h4 className="text-xs font-medium">Activation Signals</h4>
          <p className="text-[10px] text-muted-foreground">Monitor supplier approvals</p>
        </div>
        <div className="max-h-[9.25rem] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
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
