import { Button } from "@/components/ui/button";
import type {
  SourcingActivationStageId,
  SourcingTaskFlowSpec,
} from "@shared/sourcing-activation-signals";

export function SourcingPendingTasksFlow({
  flow,
  disabled,
  onSelectCategory,
  onSelectStageTask,
}: {
  flow: SourcingTaskFlowSpec;
  disabled?: boolean;
  onSelectCategory: (stageId: SourcingActivationStageId, label: string) => void;
  onSelectStageTask?: (
    stageId: SourcingActivationStageId,
    taskIndex: number,
    label: string,
  ) => void;
}) {
  if (flow.step === "categories" && flow.categories?.length) {
    return (
      <div className="mt-3 flex flex-wrap gap-2" data-testid="pending-tasks-categories">
        {flow.categories.map((category) => (
          <Button
            key={category.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-8 max-w-full gap-1.5 bg-background"
            onClick={() => onSelectCategory(category.id, category.label)}
            data-testid={`pending-task-category-${category.id}`}
          >
            <span className="min-w-0 truncate" title={category.label}>
              {category.label}
            </span>
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              {category.pendingCount}
            </span>
          </Button>
        ))}
      </div>
    );
  }

  if (flow.step === "stageTasks" && flow.tasks?.length && flow.stageId) {
    return (
      <div className="mt-3 flex flex-wrap gap-2" data-testid="pending-stage-tasks">
        {flow.tasks.map((task) => {
          const label = task.bidId
            ? `${task.bidId} — ${task.title}`
            : task.awardId
              ? `Award #${task.awardId} — ${task.title}`
              : task.title;
          return (
            <Button
              key={`${flow.stageId}-${task.index}`}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || !onSelectStageTask}
              className="h-8 max-w-full bg-background text-left"
              onClick={() => onSelectStageTask?.(flow.stageId!, task.index, label)}
              data-testid={`pending-stage-task-${flow.stageId}-${task.index}`}
            >
              <span className="min-w-0 truncate" title={label}>
                {label}
              </span>
            </Button>
          );
        })}
      </div>
    );
  }

  return null;
}
