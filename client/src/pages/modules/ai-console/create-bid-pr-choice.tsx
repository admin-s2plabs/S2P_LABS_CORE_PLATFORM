import { Button } from "@/components/ui/button";
import type { CreateBidPrChoiceSpec } from "@shared/agent-sourcing-preview";
import { FileText } from "lucide-react";

export function CreateBidPrChoice({
  choice,
  disabled,
  onSelect,
}: {
  choice: CreateBidPrChoiceSpec;
  disabled?: boolean;
  onSelect: (prompt: string, label: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="create-bid-pr-choice">
      {choice.options.map((option) => (
        <Button
          key={option.prNumber}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className="h-auto min-h-8 justify-start gap-2 bg-background py-2 text-left whitespace-normal"
          onClick={() => onSelect(option.prompt, option.label)}
          data-testid={`create-bid-pr-${option.prNumber}`}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{option.prNumber}</span>
            {option.description ? (
              <span className="text-muted-foreground"> — {option.description}</span>
            ) : null}
            {(option.department || option.amountLabel) && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground font-normal">
                {[option.department, option.amountLabel].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        </Button>
      ))}
    </div>
  );
}
