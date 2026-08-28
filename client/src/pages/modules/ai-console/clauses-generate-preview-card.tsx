import { useEffect, useState } from "react";
import { Check, Eye, Pencil, ScrollText, Sparkles, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface ClauseGenerateItem {
  type: string;
  class_desc: string;
  class_ref?: string;
}

function cloneClauses(items: ClauseGenerateItem[]): ClauseGenerateItem[] {
  return items.map((item) => ({ ...item }));
}

function clauseTypeLabel(type: string) {
  return type === "instructions" ? "Instructions" : "Terms";
}

export function ClausesGeneratePreviewCard({
  bidLabel,
  clauses,
  onConfirm,
  disabled,
}: {
  bidLabel?: string;
  clauses: ClauseGenerateItem[];
  onConfirm: (selected: ClauseGenerateItem[]) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<ClauseGenerateItem[]>(() => cloneClauses(clauses));
  const [selected, setSelected] = useState<number[]>(() => clauses.map((_, i) => i));
  const [editMode, setEditMode] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setItems(cloneClauses(clauses));
    setSelected(clauses.map((_, i) => i));
    setEditMode(false);
    setPreviewOpen(false);
  }, [clauses]);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  const updateItem = (idx: number, patch: Partial<ClauseGenerateItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSelected((prev) => prev.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)));
  };

  const selectedItems = selected
    .slice()
    .sort((a, b) => a - b)
    .map((i) => items[i])
    .filter(Boolean);
  const selectedTerms = selectedItems.filter((c) => c.type !== "instructions");
  const selectedInstructions = selectedItems.filter((c) => c.type === "instructions");

  const handleConfirm = () => {
    onConfirm(selectedItems);
  };

  return (
    <>
      <Card className="border-border/80 bg-background shadow-sm mt-2">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-foreground">
              Terms & Instructions ({selected.length})
            </h3>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No clauses remaining. Add some or cancel this action.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const isSelected = selected.includes(idx);
                return (
                  <div
                    key={idx}
                    className={`rounded-lg border p-3 transition-colors ${
                      isSelected ? "border-purple-400 bg-purple-50/50 dark:bg-purple-950/20" : "opacity-60"
                    } ${!editMode ? "cursor-pointer" : ""}`}
                    onClick={() => !editMode && toggleSelect(idx)}
                    data-testid={`card-chat-clause-${idx}`}
                  >
                    <div className="flex items-start gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(idx)}
                          disabled={disabled}
                          data-testid={`checkbox-chat-clause-${idx}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5" onClick={(e) => editMode && e.stopPropagation()}>
                        {editMode ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[11px]">Type</Label>
                                <Select value={item.type} onValueChange={(v) => updateItem(idx, { type: v })}>
                                  <SelectTrigger className="h-8 text-xs" data-testid={`select-chat-clause-type-${idx}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="terms">Terms</SelectItem>
                                    <SelectItem value="instructions">Instructions</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[11px]">Reference (Optional)</Label>
                                <Input
                                  value={item.class_ref || ""}
                                  onChange={(e) => updateItem(idx, { class_ref: e.target.value })}
                                  className="h-8 text-xs"
                                  data-testid={`input-chat-clause-ref-${idx}`}
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-[11px]">Description</Label>
                              <Textarea
                                value={item.class_desc}
                                onChange={(e) => updateItem(idx, { class_desc: e.target.value })}
                                rows={2}
                                className="text-xs"
                                data-testid={`textarea-chat-clause-desc-${idx}`}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-xs text-destructive hover:underline"
                              data-testid={`button-remove-chat-clause-${idx}`}
                            >
                              Remove clause
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={item.type === "instructions" ? "outline" : "secondary"}
                                className="text-xs capitalize"
                              >
                                {clauseTypeLabel(item.type)}
                              </Badge>
                              {item.class_ref && (
                                <span className="text-xs text-muted-foreground">Ref: {item.class_ref}</span>
                              )}
                            </div>
                            <p className="text-sm text-foreground">{item.class_desc}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selected.length > 0 && (
            <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-3 py-2 text-xs text-purple-800 dark:text-purple-300">
              <span className="font-semibold">{selected.length}</span> clause{selected.length === 1 ? "" : "s"}{" "}
              queued ({selectedTerms.length} term{selectedTerms.length === 1 ? "" : "s"},{" "}
              {selectedInstructions.length} instruction{selectedInstructions.length === 1 ? "" : "s"}) and ready to
              be added.
            </div>
          )}

          <div className="pt-1 border-t space-y-2">
            <p className="text-sm text-foreground">
              {editMode
                ? "Edit the clauses below, then confirm when ready."
                : "Would you like to make any changes?"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleConfirm}
                disabled={disabled || selected.length === 0}
                data-testid="button-chat-clauses-looks-good"
              >
                <Check className="h-3.5 w-3.5" />
                Looks Good — Add Terms
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`gap-1.5 ${editMode ? "border-primary text-primary" : ""}`}
                onClick={() => setEditMode((v) => !v)}
                disabled={disabled}
                data-testid="button-chat-clauses-make-changes"
              >
                <Pencil className="h-3.5 w-3.5" />
                {editMode ? "Done Editing" : "Make Changes"}
              </Button>
              {!editMode && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setPreviewOpen(true)}
                  disabled={disabled || selected.length === 0}
                  data-testid="button-chat-clauses-preview"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview Terms
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              Terms & Instructions Preview
            </SheetTitle>
            <SheetDescription>
              Read-only preview of the clauses that will be added{bidLabel ? ` to bid ${bidLabel}` : ""}.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-4">
            {selectedTerms.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-foreground">Terms ({selectedTerms.length})</p>
                <div className="space-y-2">
                  {selectedTerms.map((c, i) => (
                    <div key={i} className="rounded border px-2.5 py-2 text-xs space-y-1">
                      <p className="text-foreground">{c.class_desc}</p>
                      {c.class_ref && <p className="text-muted-foreground">Reference: {c.class_ref}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedInstructions.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-foreground">
                  Instructions ({selectedInstructions.length})
                </p>
                <div className="space-y-2">
                  {selectedInstructions.map((c, i) => (
                    <div key={i} className="rounded border px-2.5 py-2 text-xs space-y-1">
                      <p className="text-foreground">{c.class_desc}</p>
                      {c.class_ref && <p className="text-muted-foreground">Reference: {c.class_ref}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
