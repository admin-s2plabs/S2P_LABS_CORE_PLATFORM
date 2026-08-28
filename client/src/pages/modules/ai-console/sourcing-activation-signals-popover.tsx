import { useMemo } from "react";

import { useLocation } from "wouter";

import { Activity, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

import { Switch } from "@/components/ui/switch";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { cn } from "@/lib/utils";

import { useSourcingActivationSignals } from "@/hooks/useSourcingActivationSignals";

import { useSourcingActivationPreferences } from "@/hooks/useSourcingActivationPreferences";

import { apiRequest, parseJsonResponse } from "@/lib/queryClient";

import {

  SOURCING_ACTIVATION_LIFECYCLE_ORDER,

  SOURCING_ACTIVATION_STAGE_LABELS,

  getPendingTaskReviewFlowType,

  type SourcingActivationStage,

  type SourcingActivationStageId,

  type SourcingActivationStageItem,

} from "@shared/sourcing-activation-signals";



async function handleStageItemActivation(

  stageId: SourcingActivationStageId,

  stage: SourcingActivationStage,

  navigate: (path: string) => void,

  onStageActivate?: (

    stageId: SourcingActivationStageId,

    item: SourcingActivationStageItem | null,

    taskIndex: number,

    label: string,

  ) => void,

) {

  if (stage.pendingCount === 0) return;

  const inlineFlow = getPendingTaskReviewFlowType(stageId);

  if (onStageActivate && inlineFlow) {

    if (stage.pendingCount === 1) {

      const item = stage.items[0];

      if (!item) return;

      const label = item.bidId
        ? `${item.bidId} — ${item.title}`
        : item.awardId
          ? `Award #${item.awardId} — ${item.title}`
          : item.title;

      onStageActivate(stageId, item, 0, label);

      return;

    }

    onStageActivate(stageId, null, -1, stage.label);

    return;

  }

  if (stage.pendingCount > 1) {

    navigate("/app/my-tasks");

    return;

  }



  const item = stage.items[0];

  if (!item) return;



  const bidId = item.bidId;

  const taskId = item.taskId;



  if (taskId) {

    sessionStorage.setItem("currentTaskId", taskId);

    sessionStorage.setItem("linkToBack", "/app/ai-sourcing-agent");

  }



  switch (stageId) {

    case "bidApproval":

      if (bidId) navigate(`/app/bids/${bidId}`);

      break;

    case "openEnvelope":

      if (bidId) navigate(`/app/bids/${bidId}/evaluate`);

      break;

    case "awarding":

      if (bidId) navigate(`/app/bids/${bidId}/evaluate`);

      break;

    case "technicalEvaluation":

    case "technicalReview":

      if (bidId) navigate(`/app/bids/${bidId}/tech-score`);

      break;

    case "commercialEvaluation":

    case "commercialReview":

      if (bidId) navigate(`/app/bids/${bidId}/comm-score`);

      break;

    case "bidAwardApproval": {

      const awardRef = item.awardId || bidId;

      if (!awardRef) {

        navigate("/app/my-tasks");

        break;

      }

      if (item.awardId) {

        try {

          const res = await apiRequest("GET", `/api/dbo/bids/awards/${awardRef}/award-details`);

          const awardData = await parseJsonResponse<any>(res);

          const resolvedBidId = awardData.bidAwards?.bidrefno;

          navigate(resolvedBidId ? `/app/bids/${resolvedBidId}/award` : `/app/bids/${awardRef}/award`);

        } catch {

          navigate(`/app/bids/${awardRef}/award`);

        }

      } else if (bidId) {

        navigate(`/app/bids/${bidId}/award`);

      }

      break;

    }

    default:

      navigate("/app/my-tasks");

  }

}



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

  stage: SourcingActivationStage;

  enabled: boolean;

  onToggleEnabled: (enabled: boolean) => void;

  onNavigate: () => void;

}) {

  const isPending = stage.status === "pending";

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

          if (isPending && enabled) onNavigate();

        }}

        data-testid={`activation-signal-row-${stage.id}`}

      >

        <StatusDot pending={showActive} />

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



export function SourcingActivationSignalsPopover({

  onStageActivate,

}: {

  onStageActivate?: (

    stageId: SourcingActivationStageId,

    item: SourcingActivationStageItem | null,

    taskIndex: number,

    label: string,

  ) => void;

} = {}) {

  const [, navigate] = useLocation();

  const { preferences, setStageEnabled, isStageEnabled } = useSourcingActivationPreferences();

  const { data, isLoading, isFetching } = useSourcingActivationSignals();



  const stages = data?.stages ?? [];



  const enabledPendingTotal = useMemo(() => {

    return stages.reduce((sum, stage) => {

      if (!isStageEnabled(stage.id)) return sum;

      return sum + (stage.status === "pending" ? stage.pendingCount : 0);

    }, 0);

  }, [stages, isStageEnabled, preferences]);



  const orderedStages = useMemo(() => {

    const byId = new Map(stages.map((s) => [s.id, s]));

    return SOURCING_ACTIVATION_LIFECYCLE_ORDER.map((id) =>

      byId.get(id) ?? {

        id,

        label: SOURCING_ACTIVATION_STAGE_LABELS[id],

        status: "idle" as const,

        pendingCount: 0,

        items: [] as SourcingActivationStageItem[],

      },

    );

  }, [stages]);



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

          <p className="text-[10px] text-muted-foreground">

            Monitor sourcing lifecycle activities

          </p>

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

                onNavigate={() => handleStageItemActivation(stage.id, stage, navigate, onStageActivate)}

              />

            ))

          )}

        </div>

      </PopoverContent>

    </Popover>

  );

}

