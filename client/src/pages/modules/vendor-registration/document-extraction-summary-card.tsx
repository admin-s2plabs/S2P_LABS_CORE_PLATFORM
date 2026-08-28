import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/common-functions";
import { CheckCircle2, ChevronDown, ChevronUp, Pencil, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Props = {
  fileName: string;
  processedAt: Date;
  documentType?: string | null;
  extractedValues: Array<{
    key: string;
    section: "company" | "banking";
    label: string;
    /** Raw value (unmasked). */
    value: string;
    /** Optional masked display value for read-only view. */
    displayValue?: string;
  }>;
  onApplyEdits: (patch: { company?: Record<string, string>; banking?: Record<string, string> }) => void;
  className?: string;
};

function displayDocType(docType?: string | null): string | null {
  if (!docType) return null;
  const t = String(docType).trim();
  if (!t) return null;
  // keep it simple + readable for chat
  return t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function DocumentExtractionSummaryCard({
  fileName,
  processedAt,
  documentType,
  extractedValues,
  onApplyEdits,
  className,
}: Props) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);

  const cleaned = useMemo(() => {
    const seen = new Set<string>();
    return (extractedValues || [])
      .map((it) => ({
        label: String(it.label ?? "").trim(),
        key: String(it.key ?? "").trim(),
        section: it.section,
        value: String(it.value ?? "").trim(),
        displayValue: String(it.displayValue ?? "").trim(),
      }))
      .filter((it) => it.key && it.label && it.value)
      .filter((it) => {
        const dedupeKey = `${it.key}::${it.value}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      })
      .slice(0, 8);
  }, [extractedValues]);

  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!editing) return;
    const init: Record<string, string> = {};
    for (const it of cleaned) init[`${it.section}.${it.key}`] = it.value;
    setLocalValues(init);
  }, [editing, cleaned]);

  const docTypeLabel = displayDocType(documentType);

  const applyInlineEdits = () => {
    const company: Record<string, string> = {};
    const banking: Record<string, string> = {};
    for (const it of cleaned) {
      const mk = `${it.section}.${it.key}`;
      const next = String(localValues[mk] ?? "").trim();
      if (!next) continue;
      if (it.section === "company") company[it.key] = next;
      else banking[it.key] = next;
    }
    onApplyEdits({
      company: Object.keys(company).length ? company : undefined,
      banking: Object.keys(banking).length ? banking : undefined,
    });
    setEditing(false);
  };

  return (
    <Card
      className={cn(
        "border-border/60 bg-card/95 shadow-sm overflow-hidden",
        className,
      )}
      data-testid="ai-doc-extraction-summary-card"
    >
      <div className="px-3.5 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" title={fileName}>
                {fileName}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Processed on {formatDate(processedAt)}
                {docTypeLabel ? ` • ${docTypeLabel}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen((v) => !v)}
            data-testid="button-toggle-doc-summary"
            title={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="px-3.5 pb-3 pt-0">
          <p className="text-xs text-muted-foreground mb-2">
            We extracted the following information:
          </p>

          {cleaned.length > 0 ? (
            <div className="space-y-1.5">
              {cleaned.map((it) => (
                <div key={`${it.label}-${it.value}`} className="flex items-start gap-2">
                  <span className="mt-[6px] h-1 w-1 rounded-full bg-muted-foreground/60 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      <span className="text-muted-foreground">{it.label}:</span>{" "}
                      {!editing ? (
                        <span className="font-medium">
                          {it.displayValue ? it.displayValue : it.value}
                        </span>
                      ) : (
                        <span className="inline-block align-middle w-full max-w-[340px]">
                          <Input
                            value={localValues[`${it.section}.${it.key}`] ?? it.value}
                            onChange={(e) =>
                              setLocalValues((p) => ({
                                ...p,
                                [`${it.section}.${it.key}`]: e.target.value,
                              }))
                            }
                            className="h-8 text-sm"
                            data-testid={`input-inline-edit-${it.section}-${it.key}`}
                          />
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No data found
            </p>
          )}

          <div className="flex items-center gap-2 mt-3">
            {!editing ? (
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto px-0 text-sm"
                onClick={() => setEditing(true)}
                data-testid="button-edit-extracted-info"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit extracted info
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={applyInlineEdits}
                  data-testid="button-save-inline-edits"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(false)}
                  data-testid="button-cancel-inline-edits"
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

