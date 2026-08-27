import { useEffect, useState } from "react";
import { Check, RefreshCw, Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export interface ReconciledCriteriaItem {
  id: number | null;
  action: "keep" | "update" | "remove" | "new";
  category: string;
  question: string;
  value: string;
  qvtype: string;
  weight: number;
  lovOptions: string[];
  origin: "ai" | "manual";
  questionChanged: boolean;
  weightChanged: boolean;
  originalQuestion?: string;
  originalWeight?: number;
}

// Applying a change touches the DB only for new / update / remove; "keep" is a no-op.
const isSelectable = (item: ReconciledCriteriaItem) => item.action !== "keep";

function cardClasses(item: ReconciledCriteriaItem) {
  if (item.action === "remove") {
    return "border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20";
  }
  if (item.action === "new") {
    return "border-purple-400 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-950/20";
  }
  if (item.action === "update") {
    return "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20";
  }
  return item.origin === "ai"
    ? "border-purple-200 bg-purple-50/30 dark:border-purple-900 dark:bg-purple-950/10"
    : "border-border bg-background";
}

export function RegenerateCriteriaPreviewCard({
  bidLabel,
  plan,
  onConfirm,
  disabled,
}: {
  bidLabel?: string;
  plan: ReconciledCriteriaItem[];
  onConfirm: (selected: ReconciledCriteriaItem[]) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<boolean[]>([]);

  useEffect(() => {
    // Every actionable change (new / update / remove) is checked by default.
    setSelected(plan.map((item) => isSelectable(item)));
  }, [plan]);

  const toggle = (idx: number) => {
    setSelected((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  // Projected total after applying: kept questions + selected non-removed changes.
  const projectedWeight = plan.reduce((sum, item, idx) => {
    if (item.action === "keep") return sum + item.weight;
    if (item.action === "remove") return sum;
    return sum + (selected[idx] ? item.weight : 0);
  }, 0);

  const changeCount = plan.filter((item, idx) => isSelectable(item) && selected[idx]).length;

  const handleApply = () => {
    const chosen = plan.filter((item, idx) => isSelectable(item) && selected[idx]);
    onConfirm(chosen);
  };

  return (
    <Card className="border-border/80 bg-background shadow-sm mt-2">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-foreground">
            Regenerated Evaluation Criteria{bidLabel ? ` — ${bidLabel}` : ""}
          </h3>
        </div>

        {plan.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Scale className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No changes suggested.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {plan.map((item, idx) => {
              const checked = selected[idx] || false;
              const selectable = isSelectable(item);
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 transition-colors ${cardClasses(item)} ${
                    selectable ? "cursor-pointer" : ""
                  } ${selectable && !checked ? "opacity-70" : ""}`}
                  onClick={() => selectable && !disabled && toggle(idx)}
                  data-testid={`card-chat-regen-${idx}`}
                >
                  <div className="flex items-start gap-3">
                    {selectable ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(idx)}
                          disabled={disabled}
                          data-testid={`checkbox-chat-regen-${idx}`}
                        />
                      </div>
                    ) : (
                      <div className="w-4" />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.action === "new" && (
                          <Badge className="bg-purple-600 hover:bg-purple-600 text-white text-[10px]">
                            New Question
                          </Badge>
                        )}
                        {item.action === "update" && item.questionChanged && (
                          <Badge className="bg-amber-400 hover:bg-amber-400 text-amber-950 text-[10px]">
                            Updated Question
                          </Badge>
                        )}
                        {item.action === "update" && item.weightChanged && (
                          <Badge className="bg-blue-500 hover:bg-blue-500 text-white text-[10px]">
                            Updated Weight
                          </Badge>
                        )}
                        {item.action === "remove" && (
                          <Badge className="bg-red-500 hover:bg-red-500 text-white text-[10px]">
                            Removed Question
                          </Badge>
                        )}
                        {item.action === "keep" && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Unchanged
                          </Badge>
                        )}
                        <span className="ml-auto text-xs font-medium text-purple-700 dark:text-purple-400">
                          Weight: {item.weight}
                          {item.action === "update" && item.weightChanged && item.originalWeight != null && (
                            <span className="text-muted-foreground"> (was {item.originalWeight})</span>
                          )}
                        </span>
                      </div>

                      <p
                        className={`text-sm ${
                          item.action === "remove" ? "line-through text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {item.question}
                      </p>
                      {item.action === "update" && item.questionChanged && item.originalQuestion && (
                        <p className="text-xs text-muted-foreground line-through">{item.originalQuestion}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {item.category}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {item.qvtype}
                        </Badge>
                        {item.value && (
                          <span className="text-xs text-muted-foreground">Expected: {item.value}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span className="font-semibold">{changeCount}</span> change{changeCount === 1 ? "" : "s"} selected ·
          projected total weight{" "}
          <span
            className={`font-semibold ${
              projectedWeight === 100
                ? "text-green-600 dark:text-green-400"
                : projectedWeight > 100
                  ? "text-destructive"
                  : "text-foreground"
            }`}
          >
            {projectedWeight}/100
          </span>
          {projectedWeight !== 100 && (
            <span className="text-muted-foreground"> — adjust selections to reach 100 before publishing.</span>
          )}
        </div>

        <div className="pt-1 border-t">
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleApply}
            disabled={disabled || changeCount === 0}
            data-testid="button-chat-regen-apply"
          >
            <Check className="h-3.5 w-3.5" />
            Apply Selected Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
