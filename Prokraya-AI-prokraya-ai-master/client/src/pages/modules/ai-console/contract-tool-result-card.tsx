import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import type { ContractToolResult } from "@shared/agent-contract-tools";

const CAP_LABEL: Record<ContractToolResult["type"], string> = {
  extract: "Clause Extraction",
  risk: "Risk Flagging",
  redline: "Redline Suggestions",
  renewal: "Renewal Alerts",
};

const riskTone = (level?: string) =>
  level === "High"
    ? "border-red-200 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
    : level === "Low"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
    : "border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300";

export function ContractToolResultCard({
  result,
  onRerunRenewals,
  disabled,
}: {
  result: ContractToolResult;
  onRerunRenewals?: (window: 30 | 60 | 90) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const headerTitle = CAP_LABEL[result.type] || "Result";

  const saveExtractedClauses = async () => {
    if (result.type !== "extract") return;
    const clauses = result.clauses ?? [];
    if (!clauses.length) return;

    setSaving(true);
    try {
      await apiRequest("POST", "/api/contracts/ai/save-library-clauses", { clauses });
      setSaved(true);
      toast({
        title: "Saved to clause library",
        description: `${clauses.length} clause(s) added.`,
      });
    } catch {
      toast({ title: "Failed to save clauses", variant: "destructive" });
    } finally {
      setSaving(false);
      document.body.style.pointerEvents = "";
    }
  };

  return (
    <Card className="shadow-sm border border-border">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b">
          <span className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-600 shrink-0" /> {headerTitle}
          </span>
        </div>
        <div className="p-4">
          {result.type === "extract" ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs text-muted-foreground truncate">{result.title}</p>
                {(result.clauses ?? []).length > 0 && (
                  <Button
                    size="sm"
                    className="h-7 gap-1.5 shrink-0"
                    disabled={saving || saved || disabled}
                    onClick={saveExtractedClauses}
                    data-testid="button-save-clauses"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : saved ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {saved ? "Saved" : "Save to library"}
                  </Button>
                )}
              </div>
              {(result.clauses ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {result.note || "No clauses found in this contract."}
                </p>
              ) : (
                <div className="space-y-2">
                  {(result.clauses ?? []).map((c, i) => (
                    <div key={i} className="rounded-md border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{c.section_name || "Clause"}</p>
                        <div className="flex flex-wrap gap-1 justify-end shrink-0">
                          {c.section_type && (
                            <Badge variant="outline" className="text-[10px]">
                              {c.section_type}
                            </Badge>
                          )}
                          {c.clause_mandatory === "Yes" && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                              Mandatory
                            </Badge>
                          )}
                          {c.clause_negotiable === "Yes" && (
                            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                              Negotiable
                            </Badge>
                          )}
                        </div>
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : result.type === "risk" ? (
            <>
              <p className="text-xs text-muted-foreground truncate mb-2">{result.title}</p>
              <div className={cn("rounded-md border p-3 mb-3", riskTone(result.riskLevel))}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Overall Risk: {result.riskLevel || "?"}</span>
                  <span className="text-lg font-bold tabular-nums">{result.riskScore ?? "?"}/10</span>
                </div>
                {result.summary && <p className="text-xs mt-1.5 opacity-90">{result.summary}</p>}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {(["financial", "compliance", "delivery"] as const).map((k) => (
                  <div key={k} className="rounded-md border p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
                    <p className="text-base font-bold tabular-nums">
                      {result.risks?.[k]?.score ?? "-"}
                    </p>
                  </div>
                ))}
              </div>
              {(result.redFlags ?? []).length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold mb-1 flex items-center gap-1 text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> Red Flags
                  </p>
                  <ul className="space-y-1">
                    {(result.redFlags ?? []).map((f, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-red-500">•</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(result.keyPoints ?? []).length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold mb-1">Key Points</p>
                  <ul className="space-y-1">
                    {(result.keyPoints ?? []).map((p, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span>•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.signatoryNote && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-2.5">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
                    Before signing
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">{result.signatoryNote}</p>
                </div>
              )}
            </>
          ) : result.type === "redline" ? (
            <>
              <p className="text-xs text-muted-foreground truncate mb-2">{result.title}</p>
              {(result.suggestions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {result.note || "No redline suggestions — these clauses look acceptable."}
                </p>
              ) : (
                <div className="space-y-3">
                  {(result.suggestions ?? []).map((s, i) => (
                    <div key={i} className="rounded-md border p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-medium">{s.clause_name || "Clause"}</p>
                        {s.risk_level && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] shrink-0",
                              s.risk_level === "High"
                                ? "text-red-600 border-red-300"
                                : "text-amber-600 border-amber-300"
                            )}
                          >
                            {s.risk_level}
                          </Badge>
                        )}
                      </div>
                      {s.issue && <p className="text-xs text-muted-foreground mb-1.5">{s.issue}</p>}
                      {s.before && (
                        <div className="rounded bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 p-2 mb-1">
                          <p className="text-[10px] font-semibold text-red-600 mb-0.5">BEFORE</p>
                          <p className="text-xs text-muted-foreground">{s.before}</p>
                        </div>
                      )}
                      {s.after && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 p-2">
                          <p className="text-[10px] font-semibold text-emerald-600 mb-0.5">AFTER</p>
                          <p className="text-xs text-foreground">{s.after}</p>
                        </div>
                      )}
                      {s.rationale && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 italic">
                          {s.rationale}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : result.type === "renewal" ? (
            <>
              <div className="flex items-center gap-1 mb-3">
                {([30, 60, 90] as const).map((w) => (
                  <Button
                    key={w}
                    size="sm"
                    variant={result.window === w ? "default" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    disabled={disabled}
                    onClick={() => onRerunRenewals?.(w)}
                    data-testid={`renewal-window-${w}`}
                  >
                    {w}d
                  </Button>
                ))}
              </div>
              {(result.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contracts expiring within {result.window} days.
                </p>
              ) : (
                <div className="space-y-2">
                  {(result.items ?? []).map((c) => (
                    <div key={c.id} className="rounded-md border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] shrink-0",
                            c.days_left <= 14
                              ? "text-red-600 border-red-300"
                              : c.days_left <= 30
                              ? "text-amber-600 border-amber-300"
                              : "text-muted-foreground"
                          )}
                        >
                          {c.days_left}d
                        </Badge>
                      </div>
                      {c.note && (
                        <p className="text-xs text-muted-foreground mt-1 flex gap-1.5">
                          <Sparkles className="h-3 w-3 text-violet-500 shrink-0 mt-0.5" />
                          {c.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
