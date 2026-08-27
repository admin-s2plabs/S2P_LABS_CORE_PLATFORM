import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

export interface ThinkingTip {
  key?: string;
  text: string;
}

/** Shared loading tips rotated across all AI agent chats while the first token streams. Add more here — every agent picks them up automatically. */
export const THINKING_TIPS: ThinkingTip[] = [
  { key: "@", text: "to search and mention suppliers" },
  { key: "/", text: "to add items to your request" },
  { key: "#", text: "to tag a business user" },
  { key: "Shift + Enter", text: "to next line" },
  { key: '^', text: "to search Bids"},
  { key: '&', text: "to search PR"},
  { key: "%", text: "to search POs" },
  { key: "$", text: "to search invoices" },
];

/** Spinner + rotating tip shown while waiting on an agent's first streamed token. */
export function ThinkingTips() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_TIPS.length),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % THINKING_TIPS.length);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  const tip = THINKING_TIPS[index];

  return (
    <div className="flex items-center gap-2" data-testid="agent-thinking-tips">
      <Loader2 className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400" />
      <span
        key={index}
        className="flex items-center gap-1.5 text-xs text-muted-foreground animate-in fade-in duration-300"
      >
        <Sparkles className="h-3 w-3 flex-shrink-0 text-purple-500" />
        {tip.key ? (
          <>
            <span>Type</span>
            <kbd className="rounded border bg-background px-1 font-mono text-[10px] font-semibold text-purple-600 dark:text-purple-400">
              {tip.key}
            </kbd>
            <span>{tip.text}</span>
          </>
        ) : (
          <span>{tip.text}</span>
        )}
      </span>
    </div>
  );
}
