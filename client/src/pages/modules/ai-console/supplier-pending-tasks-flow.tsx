import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SupplierTaskFlowSpec } from "@shared/supplier-activation-signals";

export function SupplierPendingTasksFlow({
  flow,
  disabled,
  onSelectTask,
}: {
  flow: SupplierTaskFlowSpec;
  disabled?: boolean;
  onSelectTask: (taskIndex: number, label: string) => void;
}) {
  if (flow.step !== "tasks" || !flow.tasks?.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="supplier-pending-tasks">
      {flow.tasks.map((task) => {
        const label = task.companyName || task.title || `Supplier #${task.supplierId}`;
        return (
          <Button
            key={`${task.supplierId}-${task.index}`}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-8 max-w-full gap-1.5 bg-background text-left"
            onClick={() => onSelectTask(task.index, label)}
            data-testid={`supplier-pending-task-${task.index}`}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
