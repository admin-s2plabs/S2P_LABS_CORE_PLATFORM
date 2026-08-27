import { Button } from "@/components/ui/button";
import type { CreateBidSourceChoiceSpec } from "@shared/agent-sourcing-preview";
import { FileText, Plus } from "lucide-react";

export function CreateBidSourceChoice({
  choice,
  disabled,
  onSelect,
}: {
  choice: CreateBidSourceChoiceSpec;
  disabled?: boolean;
  onSelect: (prompt: string, label: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="create-bid-source-choice">
      {choice.options.map((option) => {
        const Icon = option.id === "from_pr" ? FileText : Plus;
        return (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-8 gap-1.5 bg-background"
            onClick={() => onSelect(option.prompt, option.label)}
            data-testid={`create-bid-source-${option.id}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
