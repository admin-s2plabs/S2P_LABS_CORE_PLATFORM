import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bold, Italic, Palette, Underline, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormatCommand, ToolbarAnchor } from "@/hooks/useContractPreviewSelection";

const FONT_FAMILIES = [
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Calibri", value: "Calibri, sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
];

const FONT_SIZES = ["9pt", "10pt", "10.5pt", "11pt", "12pt", "13pt", "14pt", "16pt", "18pt"];

const COLOR_SWATCHES = ["#1a1a1a", "#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#64748b"];

interface ContractPreviewToolbarProps {
  anchor: ToolbarAnchor;
  onFormat: (cmd: FormatCommand) => void;
  onClose: () => void;
}

export function ContractPreviewToolbar({ anchor, onFormat, onClose }: ContractPreviewToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [flipBelow, setFlipBelow] = useState(false);

  useEffect(() => {
    setFlipBelow(anchor.top < 56);
  }, [anchor.top]);

  // Toolbar buttons mutate the live iframe selection on mousedown+preventDefault so
  // the browser never collapses the in-iframe text selection before onFormat runs.
  const guardMouseDown = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-1 rounded-lg border bg-popover text-popover-foreground shadow-lg px-1.5 py-1"
      style={{
        top: anchor.top,
        left: anchor.left,
        transform: flipBelow ? "translate(-50%, 10px)" : "translate(-50%, calc(-100% - 10px))",
      }}
      onMouseDown={guardMouseDown}
      data-testid="contract-preview-toolbar"
    >
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        onMouseDown={guardMouseDown}
        onClick={() => onFormat({ type: "bold" })}
        title="Bold" data-testid="button-format-bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        onMouseDown={guardMouseDown}
        onClick={() => onFormat({ type: "italic" })}
        title="Italic" data-testid="button-format-italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost" size="icon" className="h-7 w-7"
        onMouseDown={guardMouseDown}
        onClick={() => onFormat({ type: "underline" })}
        title="Underline" data-testid="button-format-underline"
      >
        <Underline className="h-3.5 w-3.5" />
      </Button>

      <div className="w-px h-5 bg-border mx-0.5" />

      <Select onValueChange={(value) => onFormat({ type: "fontFamily", value })}>
        <SelectTrigger className="h-7 w-[104px] text-xs" onMouseDown={guardMouseDown} data-testid="select-font-family">
          <SelectValue placeholder="Font" />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={(value) => onFormat({ type: "fontSize", value })}>
        <SelectTrigger className="h-7 w-[64px] text-xs" onMouseDown={guardMouseDown} data-testid="select-font-size">
          <SelectValue placeholder="Size" />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="w-px h-5 bg-border mx-0.5" />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={guardMouseDown} title="Text color" data-testid="button-format-color">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" onMouseDown={guardMouseDown}>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                className={cn("h-6 w-6 rounded-full border border-black/10")}
                style={{ backgroundColor: c }}
                onMouseDown={guardMouseDown}
                onClick={() => onFormat({ type: "color", value: c })}
                title={c}
                data-testid={`color-swatch-${c}`}
              />
            ))}
          </div>
          <input
            type="color"
            className="w-full h-7 cursor-pointer"
            onMouseDown={guardMouseDown}
            onChange={(e) => onFormat({ type: "color", value: e.target.value })}
            data-testid="input-color-custom"
          />
        </PopoverContent>
      </Popover>

      <div className="w-px h-5 bg-border mx-0.5" />

      <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={guardMouseDown} onClick={onClose} title="Close" data-testid="button-toolbar-close">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
