import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// Shared header "(i)" button used across every AI agent page so the
// capabilities popover looks and behaves identically everywhere. Accepts the
// agent's `capabilities` array (only label + description are used; the `icon`
// field on those objects is ignored here).
export interface AgentCapability {
  label: string;
  description: string;
}

export function CapabilitiesInfoButton({ capabilities }: { capabilities: AgentCapability[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" data-testid="button-capabilities-info">
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 bg-[#1a1a18] text-white border-[#1a1a18] rounded-lg p-4 space-y-3">
        {capabilities.map((cap, i) => (
          <p key={i} className="text-xs leading-relaxed">
            <span className="font-semibold">{cap.label}</span> — {cap.description}
          </p>
        ))}
      </PopoverContent>
    </Popover>
  );
}
