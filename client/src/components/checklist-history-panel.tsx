import { Check, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatChecklistDate, type ChecklistHistoryStep } from "@/hooks/use-approval-checklist";

interface ChecklistHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refNumber: string | undefined;
  steps: ChecklistHistoryStep[];
}

export function ChecklistHistoryPanel({ open, onOpenChange, refNumber, steps }: ChecklistHistoryPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="panel-checklist-history">
        <SheetHeader>
          <SheetTitle>Checklist History</SheetTitle>
          <SheetDescription>Previous approvers · {refNumber}</SheetDescription>
        </SheetHeader>

        <Accordion type="single" collapsible className="mt-4">
          {steps.map((step) => (
            <AccordionItem key={step.step} value={String(step.step)} data-testid={`row-checklist-history-${step.step}`}>
              <AccordionTrigger data-testid={`button-checklist-history-approver-${step.step}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </span>
                  <div className="text-left min-w-0">
                    <div className="text-sm font-medium truncate">
                      {step.approvedBy} · Step {step.step}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Completed {formatChecklistDate(step.completedDate)}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary" className="mr-2 shrink-0">
                  {step.checkedCount} / {step.total}
                </Badge>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pl-10">
                  {step.items.map((item) => (
                    <div key={item.questionId} className="text-sm" data-testid={`text-checklist-history-item-${item.questionId}`}>
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
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SheetContent>
    </Sheet>
  );
}
