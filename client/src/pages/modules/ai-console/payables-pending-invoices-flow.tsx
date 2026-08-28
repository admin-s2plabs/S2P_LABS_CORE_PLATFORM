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
  PayablesActivationStageId,
  PayablesTaskFlowSpec,
  PayablesTaskFlowTaskItem,
} from "@shared/payables-activation-signals";

function invoiceRef(task: PayablesTaskFlowTaskItem): string {
  return task.invoiceNumber || task.invoiceId || "";
}

function invoiceLabel(task: PayablesTaskFlowTaskItem): string {
  const ref = invoiceRef(task);
  if (ref && task.title && task.title !== ref) return `${ref} — ${task.title}`;
  return task.title || ref || "Untitled invoice";
}

function invoiceSearchText(task: PayablesTaskFlowTaskItem): string {
  return [
    task.invoiceNumber,
    task.invoiceId,
    task.title,
    task.description,
    task.supplierName,
    task.taskId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function PendingInvoicesCombobox({
  stageId,
  tasks,
  disabled,
  onSelect,
}: {
  stageId: PayablesActivationStageId;
  tasks: PayablesTaskFlowTaskItem[];
  disabled?: boolean;
  onSelect?: (stageId: PayablesActivationStageId, taskIndex: number, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const visible = trimmed
    ? tasks.filter((task) => invoiceSearchText(task).includes(trimmed))
    : tasks;

  return (
    <div className="mt-3" data-testid="payables-pending-invoices">
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
            data-testid={`payables-pending-invoice-picker-${stageId}`}
          >
            <span className="truncate text-muted-foreground">
              Search by invoice number, title, description or supplier ({tasks.length} pending)…
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by invoice number, title, description or supplier…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[min(50vh,320px)]">
              <CommandEmpty>No matching invoices.</CommandEmpty>
              <CommandGroup>
                {visible.map((task) => {
                  const label = invoiceLabel(task);
                  const meta = [task.supplierName, task.description].filter(Boolean).join(" · ");
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
                      data-testid={`payables-pending-invoice-${stageId}-${task.index}`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="min-w-0 truncate" title={label}>
                          {label}
                        </span>
                        {meta ? (
                          <span
                            className="min-w-0 truncate text-[10px] text-muted-foreground"
                            title={meta}
                          >
                            {meta}
                          </span>
                        ) : null}
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

export function PayablesPendingInvoicesFlow({
  flow,
  disabled,
  onSelectCategory,
  onSelectInvoice,
}: {
  flow: PayablesTaskFlowSpec;
  disabled?: boolean;
  onSelectCategory?: (stageId: PayablesActivationStageId, label: string) => void;
  onSelectInvoice?: (
    stageId: PayablesActivationStageId,
    taskIndex: number,
    label: string,
  ) => void;
}) {
  if (flow.step === "categories" && flow.categories?.length) {
    return (
      <div className="mt-3 flex flex-wrap gap-2" data-testid="payables-pending-categories">
        {flow.categories.map((category) => (
          <Button
            key={category.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !onSelectCategory}
            className="h-8 max-w-full gap-1.5 bg-background"
            onClick={() => onSelectCategory?.(category.id, category.label)}
            data-testid={`payables-pending-category-${category.id}`}
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
      <PendingInvoicesCombobox
        stageId={flow.stageId}
        tasks={flow.tasks}
        disabled={disabled}
        onSelect={onSelectInvoice}
      />
    );
  }

  return null;
}
