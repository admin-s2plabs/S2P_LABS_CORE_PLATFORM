import { Button } from "@/components/ui/button";
import type { CreateBidEntityChoiceSpec } from "@shared/agent-sourcing-preview";
import { Building } from "lucide-react";

export function CreateBidEntityChoice({
  choice,
  disabled,
  onSelect,
}: {
  choice: CreateBidEntityChoiceSpec;
  disabled?: boolean;
  onSelect: (prompt: string, label: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="create-bid-entity-choice">
      {choice.options.map((option) => (
        <Button
          key={option.orgId}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className="h-8 gap-1.5 bg-background"
          onClick={() => onSelect(option.prompt, option.label)}
          data-testid={`create-bid-entity-${option.orgId}`}
        >
          <Building className="h-3.5 w-3.5" />
          {option.label}
        </Button>
      ))}
    </div>
  );
}
