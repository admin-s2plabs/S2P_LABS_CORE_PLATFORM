import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type {
  ProcurementActivationStageId,
  ProcurementTaskFlowSpec,
  ProcurementTaskFlowTaskItem,
} from "@shared/procurement-activation-signals";

function taskRef(task: ProcurementTaskFlowTaskItem): string {
  return task.budgetId || task.prNumber || task.poNumber || task.invoiceId || "";
}

function taskLabel(task: ProcurementTaskFlowTaskItem): string {
  const ref = taskRef(task);
  return ref ? `${ref} — ${task.title}` : task.title;
}

function taskSearchText(task: ProcurementTaskFlowTaskItem): string {
  return [taskRef(task), task.title, task.taskId, task.alertType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function StageTasksCombobox({
  stageId,
  tasks,
  disabled,
  onSelect,
}: {
  stageId: ProcurementActivationStageId;
  tasks: ProcurementTaskFlowTaskItem[];
  disabled?: boolean;
  onSelect?: (stageId: ProcurementActivationStageId, taskIndex: number, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const visible = trimmed
    ? tasks.filter((task) => taskSearchText(task).includes(trimmed))
    : tasks;

  return (
    <div className="mt-3" data-testid="procurement-pending-stage-tasks">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !onSelect}
            className="h-9 w-full max-w-xl justify-between bg-background px-3 text-sm font-normal"
            data-testid={`procurement-pending-stage-task-picker-${stageId}`}
          >
            <span className="truncate text-muted-foreground">
              Search by number or title ({tasks.length} pending)…
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by number or title…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[min(50vh,320px)]">
              <CommandEmpty>No matching requests.</CommandEmpty>
              <CommandGroup>
                {visible.map((task) => {
                  const label = taskLabel(task);
                  return (
                    <CommandItem
                      key={`${stageId}-${task.index}`}
                      value={`${task.index}-${label}`}
                      disabled={disabled || !onSelect}
                      onSelect={() => {
                        onSelect?.(stageId, task.index, label);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="text-xs"
                      data-testid={`procurement-pending-stage-task-${stageId}-${task.index}`}
                    >
                      <span className="min-w-0 truncate" title={label}>
                        {label}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ProcurementPendingTasksFlow({
  flow,
  disabled,
  onSelectCategory,
  onSelectStageTask,
}: {
  flow: ProcurementTaskFlowSpec;
  disabled?: boolean;
  onSelectCategory: (stageId: ProcurementActivationStageId, label: string) => void;
  onSelectStageTask?: (
    stageId: ProcurementActivationStageId,
    taskIndex: number,
    label: string,
  ) => void;
}) {
  if (flow.step === "categories" && flow.categories?.length) {
    return (
      <div className="mt-3 flex flex-wrap gap-2" data-testid="procurement-pending-tasks-categories">
        {flow.categories.map((category) => (
          <Button
            key={category.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-8 max-w-full gap-1.5 bg-background"
            onClick={() => onSelectCategory(category.id, category.label)}
            data-testid={`procurement-pending-task-category-${category.id}`}
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
      <StageTasksCombobox
        stageId={flow.stageId}
        tasks={flow.tasks}
        disabled={disabled}
        onSelect={onSelectStageTask}
      />
    );
  }

  return null;
}
