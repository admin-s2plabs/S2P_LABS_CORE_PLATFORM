import { Button } from "@/components/ui/button";
import type { AgentChoiceOption, AgentChoiceSpec } from "./direct-po-choice-types";

export type { AgentChoiceOption, AgentChoiceSpec };

export function ProcurementChoiceButtons({
  choice,
  disabled,
  onSelect,
}: {
  choice: AgentChoiceSpec;
  disabled?: boolean;
  onSelect: (option: AgentChoiceOption) => void;
}) {
  return (
    <div className="mt-3 space-y-2" data-testid="procurement-choice-options">
      <p className="text-xs font-medium text-muted-foreground">{choice.title}</p>
      <div className="flex flex-col gap-2">
        {choice.options.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-auto min-h-8 justify-start gap-2 whitespace-normal px-3 py-2 text-left bg-background"
            onClick={() => onSelect(option)}
            data-testid={`procurement-choice-${choice.field}-${option.id}`}
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium">{option.label}</span>
              {option.description ? (
                <span className="text-[11px] font-normal text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
