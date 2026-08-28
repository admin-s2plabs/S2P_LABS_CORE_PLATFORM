import { useEffect, useState } from "react";
import { Check, Eye, Pencil, Plus, Scale, Sparkles, Trash2 } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";

export interface CriteriaGenerateItem {
  category: string;
  question: string;
  value?: string;
  qvoption?: string;
  qvtype: string;
  weight: number;
  lovOptions?: string[];
}

interface CategoryLookupItem {
  value: string;
  label: string;
}

const DEFAULT_CATEGORIES = ["Business", "Finance", "General", "Management"];
const VALUE_OPTIONS = ["Required", "Optional", "Desirable"];
const TOTAL_WEIGHT_BUDGET = 100;

function cloneItems(items: CriteriaGenerateItem[]): CriteriaGenerateItem[] {
  return items.map((item) => ({ ...item, lovOptions: item.lovOptions ? [...item.lovOptions] : [] }));
}

function groupByCategory(items: CriteriaGenerateItem[]) {
  const groups = new Map<string, CriteriaGenerateItem[]>();
  for (const item of items) {
    const key = item.category || "General";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.entries());
}

export function CriteriaGeneratePreviewCard({
  bidLabel,
  requirements,
  onConfirm,
  disabled,
}: {
  bidLabel?: string;
  requirements: CriteriaGenerateItem[];
  onConfirm: (selected: CriteriaGenerateItem[]) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<CriteriaGenerateItem[]>(() => cloneItems(requirements));
  const [selected, setSelected] = useState<number[]>(() => requirements.map((_, i) => i));
  const [editMode, setEditMode] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newLovOption, setNewLovOption] = useState<Record<number, string>>({});

  const { data: categoryLookup = [] } = useQuery<CategoryLookupItem[]>({
    queryKey: ["/api/lookups/by-property/BID_REQ_CATEGORIES"],
    select: (data: any[]) => data.map((d) => ({ value: d.lookup_key, label: d.description })),
  });

  useEffect(() => {
    setItems(cloneItems(requirements));
    setSelected(requirements.map((_, i) => i));
    setEditMode(false);
    setPreviewOpen(false);
    setNewLovOption({});
  }, [requirements]);

  const categoryOptions = categoryLookup.length > 0 ? categoryLookup.map((c) => c.value) : DEFAULT_CATEGORIES;

  const toggleSelect = (idx: number) => {
    setSelected((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  const updateItem = (idx: number, patch: Partial<CriteriaGenerateItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSelected((prev) => prev.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)));
  };

  const addDropdownOption = (idx: number) => {
    const val = (newLovOption[idx] || "").trim();
    if (!val) return;
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, lovOptions: [...(it.lovOptions || []), val] } : it)),
    );
    setNewLovOption((prev) => ({ ...prev, [idx]: "" }));
  };

  const removeDropdownOption = (idx: number, optIdx: number) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, lovOptions: (it.lovOptions || []).filter((_, oi) => oi !== optIdx) } : it,
      ),
    );
  };

  const selectedItems = selected
    .slice()
    .sort((a, b) => a - b)
    .map((i) => items[i])
    .filter(Boolean);
  const selectedWeight = selectedItems.reduce((sum, it) => sum + (Number(it.weight) || 0), 0);

  const handleConfirm = () => {
    onConfirm(selectedItems.map((it) => ({ ...it, qvoption: it.qvoption || "Required" })));
  };

  return (
    <>
      <Card className="border-border/80 bg-background shadow-sm mt-2">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-foreground">
              Evaluation Criteria ({selected.length})
            </h3>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Scale className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No criteria remaining. Add some or cancel this action.</p>
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
                    data-testid={`card-chat-criteria-${idx}`}
                  >
                    <div className="flex items-start gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(idx)}
                          disabled={disabled}
                          data-testid={`checkbox-chat-criteria-${idx}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5" onClick={(e) => editMode && e.stopPropagation()}>
                        {editMode ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[11px]">Category</Label>
                                <Select value={item.category} onValueChange={(v) => updateItem(idx, { category: v })}>
                                  <SelectTrigger className="h-8 text-xs" data-testid={`select-chat-criteria-category-${idx}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categoryOptions.map((c) => (
                                      <SelectItem key={c} value={c}>
                                        {c}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[11px]">Weightage (Max Points)</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={90}
                                  value={item.weight}
                                  onChange={(e) => updateItem(idx, { weight: Number(e.target.value) || 0 })}
                                  className="h-8 text-xs"
                                  data-testid={`input-chat-criteria-weight-${idx}`}
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-[11px]">Requirement</Label>
                              <Textarea
                                value={item.question}
                                onChange={(e) => updateItem(idx, { question: e.target.value })}
                                rows={2}
                                className="text-xs"
                                data-testid={`textarea-chat-criteria-question-${idx}`}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[11px]">Value</Label>
                                <Select
                                  value={item.qvoption || "Required"}
                                  onValueChange={(v) => updateItem(idx, { qvoption: v })}
                                >
                                  <SelectTrigger className="h-8 text-xs" data-testid={`select-chat-criteria-value-${idx}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {VALUE_OPTIONS.map((v) => (
                                      <SelectItem key={v} value={v}>
                                        {v}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[11px]">Value Type</Label>
                                <Select
                                  value={item.qvtype}
                                  onValueChange={(v) =>
                                    updateItem(idx, { qvtype: v, lovOptions: v === "Text" ? [] : item.lovOptions })
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs" data-testid={`select-chat-criteria-valuetype-${idx}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Text">Text</SelectItem>
                                    <SelectItem value="Dropdown">Dropdown</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {item.qvtype === "Dropdown" && (
                              <div>
                                <Label className="text-[11px]">Dropdown Options</Label>
                                <div className="border rounded-md">
                                  {(item.lovOptions || []).length > 0 && (
                                    <div className="divide-y">
                                      {(item.lovOptions || []).map((opt, oi) => (
                                        <div key={oi} className="flex items-center justify-between px-2 py-1 gap-2">
                                          <span className="text-xs truncate">{opt}</span>
                                          <button
                                            type="button"
                                            onClick={() => removeDropdownOption(idx, oi)}
                                            className="text-muted-foreground hover:text-destructive shrink-0"
                                            data-testid={`button-remove-chat-lov-${idx}-${oi}`}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1 p-1.5 border-t">
                                    <Input
                                      placeholder="Enter option"
                                      value={newLovOption[idx] || ""}
                                      onChange={(e) =>
                                        setNewLovOption((prev) => ({ ...prev, [idx]: e.target.value }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          addDropdownOption(idx);
                                        }
                                      }}
                                      className="h-7 text-xs"
                                      data-testid={`input-chat-new-lov-${idx}`}
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs shrink-0 px-2"
                                      onClick={() => addDropdownOption(idx)}
                                      data-testid={`button-add-chat-lov-${idx}`}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-xs text-destructive hover:underline"
                              data-testid={`button-remove-chat-criteria-${idx}`}
                            >
                              Remove criterion
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={item.category === "General" ? "secondary" : "outline"} className="text-xs">
                                {item.category}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {item.qvtype}
                              </Badge>
                              <span className="text-xs font-medium text-purple-700 dark:text-purple-400 ml-auto">
                                Weight: {item.weight}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-foreground">{item.question}</p>
                            {item.value && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Expected:</span> {item.value}
                              </p>
                            )}
                            {item.qvtype === "Dropdown" && (item.lovOptions?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.lovOptions!.map((opt, oi) => (
                                  <span key={oi} className="inline-block text-xs bg-muted px-2 py-0.5 rounded">
                                    {opt}
                                  </span>
                                ))}
                              </div>
                            )}
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
              <span className="font-semibold">{selected.length}</span> criteria queued ·{" "}
              <span className="font-semibold">{selectedWeight}</span> total weight point
              {selectedWeight === 1 ? "" : "s"} will be added.
            </div>
          )}

          <div className="pt-1 border-t space-y-2">
            <p className="text-sm text-foreground">
              {editMode
                ? "Edit the criteria below, then confirm when ready."
                : "Would you like to make any changes?"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleConfirm}
                disabled={disabled || selected.length === 0}
                data-testid="button-chat-criteria-looks-good"
              >
                <Check className="h-3.5 w-3.5" />
                Looks Good — Add Criteria
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`gap-1.5 ${editMode ? "border-primary text-primary" : ""}`}
                onClick={() => setEditMode((v) => !v)}
                disabled={disabled}
                data-testid="button-chat-criteria-make-changes"
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
                  data-testid="button-chat-criteria-preview"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview Criteria
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
              <Scale className="h-5 w-5" />
              Evaluation Criteria Preview
            </SheetTitle>
            <SheetDescription>
              Read-only preview of the criteria that will be added{bidLabel ? ` to bid ${bidLabel}` : ""}.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-4">
            {groupByCategory(selectedItems).map(([category, group]) => (
              <div key={category}>
                <p className="text-sm font-semibold mb-2 text-foreground">
                  {category} ({group.reduce((s, g) => s + (Number(g.weight) || 0), 0)})
                </p>
                <div className="space-y-2">
                  {group.map((it, i) => (
                    <div key={i} className="rounded border px-2.5 py-2 text-xs space-y-1">
                      <p className="font-medium text-foreground">{it.question}</p>
                      <p className="text-muted-foreground">Value: {it.qvoption || "Required"}</p>
                      <p className="text-muted-foreground">Type: {it.qvtype}</p>
                      {it.qvtype === "Dropdown" && (it.lovOptions?.length ?? 0) > 0 && (
                        <p className="text-muted-foreground">
                          <span>Options: </span>
                          {it.lovOptions!.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="pt-3 border-t flex items-center justify-between text-sm font-semibold">
              <span>Total Weight</span>
              <span className={selectedWeight === TOTAL_WEIGHT_BUDGET ? "text-emerald-600" : "text-foreground"}>
                {selectedWeight} / {TOTAL_WEIGHT_BUDGET}
              </span>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
