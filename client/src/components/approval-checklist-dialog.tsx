import { useState } from "react";
import { AlertTriangle, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChecklistHistoryPanel } from "@/components/checklist-history-panel";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useApprovalChecklist } from "@/hooks/use-approval-checklist";

interface ApprovalChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workflow/module name the checklist questions are configured under, e.g. "Invoice", "Purchase Order". */
  moduleName: string;
  title: string;
  /** The record's own identifier (invoice number, PO number, ...) — also used as the audit ref number. */
  refNumber: string | undefined;
  /** True while the caller's own process-approval mutation is in flight. */
  approving: boolean;
  /** Called once checklist responses are saved (or immediately if the module has no checklist configured). */
  onApprove: (comments: string) => void;
}

export function ApprovalChecklistDialog({
  open,
  onOpenChange,
  moduleName,
  title,
  refNumber,
  approving,
  onApprove,
}: ApprovalChecklistDialogProps) {
  const {
    isLoading,
    hasChecklist,
    historySteps,
    draftItems,
    checkedCount,
    itemsRemaining,
    remarksRemaining,
    canApprove,
    toggleChecked,
    setRemarks,
    saveResponsesMutation,
  } = useApprovalChecklist(moduleName, refNumber, open);

  const [comments, setComments] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleClose = () => {
    onOpenChange(false);
    setComments("");
  };

  const handleApproveClick = () => {
    if (!hasChecklist) {
      onApprove(comments);
      return;
    }
    saveResponsesMutation.mutate(undefined, {
      onSuccess: () => onApprove(comments),
    });
  };

  const isBusy = approving || saveResponsesMutation.isPending;
  const total = draftItems.length;
  const progressPct = total > 0 ? (checkedCount / total) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : handleClose())}>
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>{title}</DialogTitle>
            {hasChecklist && !isLoading && (
              <span className="text-xs italic text-destructive whitespace-nowrap">*Indicates mandatory fields</span>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Confirm each item before approving <span className="font-semibold text-foreground">{refNumber}</span>. Recorded in the audit log.
            </p>
            {historySteps.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => setHistoryOpen(true)}
                data-testid="button-checklist-history"
              >
                <History className="h-4 w-4" />
                Checklist History
                <Badge variant="secondary" className="ml-1">
                  {historySteps.length}
                </Badge>
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading checklist...
          </div>
        ) : hasChecklist ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-primary whitespace-nowrap">
                {checkedCount} of {total}
              </span>
              <Progress value={progressPct} className="h-2 flex-1" data-testid="progress-checklist" />
            </div>

            <div className="space-y-1">
              <div className="grid gap-2 px-1 text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: "24px 1fr 1fr" }}>
                <span />
                <span>Check Item</span>
                <span>Remarks</span>
              </div>
              {draftItems.map((item) => (
                <div
                  key={item.questionId}
                  className="grid items-center gap-2 py-1.5 border-b last:border-b-0"
                  style={{ gridTemplateColumns: "24px 1fr 1fr" }}
                  data-testid={`row-approval-checklist-${item.questionId}`}
                >
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) => toggleChecked(item.questionId, checked === true)}
                    data-testid={`checkbox-checklist-item-${item.questionId}`}
                  />
                  <span className="text-sm">
                    {item.text}
                    {item.itemMandatory && <span className="text-destructive"> *</span>}
                  </span>
                  <div className="relative">
                    <Input
                      value={item.remarks}
                      onChange={(e) => setRemarks(item.questionId, e.target.value)}
                      placeholder={item.remarkMandatory ? "Remarks (required)" : "Remarks, if any"}
                      className="h-8 text-sm pr-4"
                      data-testid={`input-checklist-remarks-${item.questionId}`}
                    />
                    {item.remarkMandatory && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-destructive text-sm">*</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {(itemsRemaining > 0 || remarksRemaining > 0) && (
              <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                {[
                  itemsRemaining > 0 ? `${itemsRemaining} item${itemsRemaining === 1 ? "" : "s"} to tick` : null,
                  remarksRemaining > 0 ? `${remarksRemaining} required remark${remarksRemaining === 1 ? "" : "s"} to fill` : null,
                ].filter(Boolean).join(" · ")} before Approve
              </div>
            )}

            <div className="pt-1 space-y-1.5">
              <Label htmlFor="approval-checklist-comments">Comments</Label>
              <Textarea
                id="approval-checklist-comments"
                rows={3}
                placeholder="Optional comments..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                data-testid="input-checklist-comments"
              />
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-1.5">
            <Label htmlFor="approval-checklist-comments">Remarks</Label>
            <Textarea
              id="approval-checklist-comments"
              rows={3}
              placeholder="Optional remarks..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              data-testid="input-checklist-fallback-remarks"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-checklist-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleApproveClick}
            disabled={isBusy || isLoading || (hasChecklist && !canApprove)}
            data-testid="button-checklist-approve"
          >
            {isBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
      <ChecklistHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        refNumber={refNumber}
        steps={historySteps}
      />
    </Dialog>
  );
}
