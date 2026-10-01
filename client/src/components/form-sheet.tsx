import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import type { ReactNode } from "react";

interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Usually a string; pass an icon+text fragment when the popup needs one. */
  title: ReactNode;
  /** Shown for screen readers only (Radix requires a description or an explicit aria-describedby={undefined}). */
  description?: string;
  onCancel?: () => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  children: ReactNode;
  /** Dialog width — defaults to a roomy form width; pass e.g. "sm:max-w-2xl" to override. */
  widthClassName?: string;
}

/**
 * Shared "create/edit" form popup, centered on screen: blue header band with
 * title + circular close button, scrollable body for the form fields, and a
 * footer with Cancel + Create-or-Update.
 */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  onCancel,
  onSubmit,
  submitLabel,
  isSubmitting,
  submitDisabled,
  children,
  widthClassName,
}: FormSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={cn(
          "w-full sm:max-w-3xl max-h-[85vh] p-0 gap-0 flex flex-col",
          widthClassName,
        )}
      >
        <div className="flex items-center justify-between gap-2 px-6 py-4 bg-primary/10 border-b shrink-0">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description || title}</DialogDescription>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate"
            data-testid="button-form-sheet-close"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel ?? (() => onOpenChange(false))}
            data-testid="button-form-sheet-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || submitDisabled}
            data-testid="button-form-sheet-submit"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
