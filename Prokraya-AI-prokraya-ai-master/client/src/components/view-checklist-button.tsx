import { useState } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatChecklistDate, useApprovalChecklist } from "@/hooks/use-approval-checklist";

interface ViewChecklistButtonProps {
  /** Workflow/module name the checklist questions are configured under, e.g. "Invoice", "Purchase Order". */
  moduleName: string;
  /** The record's own identifier (invoice number, PO number, ...) used to look up recorded responses. */
  refNumber: string | undefined;
}

/**
 * Read-only entry point shown once a record is fully approved — opens the last approver's
 * completed checklist. Renders nothing if the module has no checklist or none was completed.
 */
export function ViewChecklistButton({ moduleName, refNumber }: ViewChecklistButtonProps) {
  const [open, setOpen] = useState(false);
  const { historySteps } = useApprovalChecklist(moduleName, refNumber, !!refNumber);
  const lastStep = historySteps[historySteps.length - 1];

  if (!lastStep) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="button-view-checklist"
      >
        <ClipboardCheck className="h-4 w-4 mr-2" />
        View Checklist
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-view-checklist">
          <DialogHeader>
            <DialogTitle>Approval Checklist</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Approved by <span className="font-semibold text-foreground">{lastStep.approvedBy}</span> ·{" "}
              {formatChecklistDate(lastStep.completedDate)}
            </p>
          </DialogHeader>

          <div className="space-y-3">
            {lastStep.items.map((item) => (
              <div key={item.questionId} className="text-sm" data-testid={`text-view-checklist-item-${item.questionId}`}>
                <div className="flex items-start gap-2">
                  {item.checked ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <span>{item.text}</span>
                </div>
                {item.remarks && (
                  <p className="pl-6 text-xs italic text-muted-foreground">"{item.remarks}"</p>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-view-checklist-close">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
