import { useEffect, useRef, useState } from "react";
import { Check, Eye, Loader2, Pencil, FileText, Plus, X } from "lucide-react";
import type {
  CreateBidPreviewClause,
  CreateBidPreviewCriterion,
  CreateBidPreviewEvaluator,
  CreateBidPreviewLineItem,
  CreateBidPreviewSpec,
  CreateBidPreviewSupplier,
} from "@shared/agent-sourcing-preview";
import { bidTypeSupportsEvaluation } from "@shared/agent-sourcing-preview";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { BidHeaderFormFields } from "../bids/bid-header-form-fields";
import {
  BidLineItemSheet,
  formatPreviewLineLabel,
} from "../bids/bid-line-item-sheet";
import type { BidFormData } from "../bids/bid-form-sheet";
import {
  clampDateTimeLocal,
  getCurrentLocalDateTime,
  toLocalISOString,
  validateBidHeaderForm,
  validateBidPreviewDates,
  validatePrBidPreview,
} from "../bids/bid-form-utils";
import {
  bidFormDataToPreview,
  formatCreateBidDateDisplay,
  previewToBidFormData,
} from "./create-bid-preview-utils";

function MetaField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function clonePreview(preview: CreateBidPreviewSpec): CreateBidPreviewSpec {
  return {
    ...preview,
    lineItems: preview.lineItems.map((l) => ({ ...l })),
    suppliers: preview.suppliers.map((s) => ({ ...s })),
    evaluationCriteria: preview.evaluationCriteria.map((c) => ({ ...c })),
    evaluators: preview.evaluators.map((e) => ({ ...e })),
    clauses: preview.clauses.map((c) => ({ ...c })),
  };
}

/** Drop criteria/evaluators staged before the type became an RFQ so hidden rows never get queued. */
function scopeEvaluationToBidType(spec: CreateBidPreviewSpec): CreateBidPreviewSpec {
  if (bidTypeSupportsEvaluation(spec.bidType)) return spec;
  return { ...spec, evaluationCriteria: [], evaluators: [] };
}

const TEAM_TYPE_OPTIONS = [
  "Technical Review Team",
  "Commercial Review Team",
  "Technical Approve Team",
  "Commercial Approve Team",
  "Committee Team",
];

function PrBidConversionForm({
  formData,
  onChange,
}: {
  formData: BidFormData;
  onChange: (next: BidFormData) => void;
}) {
  const { toast } = useToast();

  const handleDateChange = (field: "startdate" | "enddate" | "env_open_date", value: string) => {
    if (!value) {
      onChange({ ...formData, [field]: value });
      return;
    }
    const finalValue = clampDateTimeLocal(value);
    if (finalValue !== value) {
      toast({
        title: "Invalid Time",
        description: "You cannot select a time in the past.",
        variant: "destructive",
      });
    }
    onChange({ ...formData, [field]: finalValue });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">
          Bid Type <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formData.type}
          onValueChange={(v) =>
            onChange({
              ...formData,
              type: v,
              bid_style: v === "Tender" ? "Sealed" : "Open",
            })
          }
        >
          <SelectTrigger data-testid="select-pr-bid-type">
            <SelectValue placeholder="Select Bid Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RFQ">RFQ</SelectItem>
            <SelectItem value="RFP">RFP</SelectItem>
            <SelectItem value="Tender">Tender</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">
          Open Date <span className="text-destructive">*</span>
        </Label>
        <Input
          type="datetime-local"
          value={formData.startdate}
          onChange={(e) => handleDateChange("startdate", e.target.value)}
          min={getCurrentLocalDateTime()}
          max={formData.enddate || undefined}
          data-testid="input-pr-bid-open-date"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">
          Close Date <span className="text-destructive">*</span>
        </Label>
        <Input
          type="datetime-local"
          value={formData.enddate}
          onChange={(e) => handleDateChange("enddate", e.target.value)}
          min={formData.startdate || getCurrentLocalDateTime()}
          data-testid="input-pr-bid-close-date"
        />
      </div>
      {formData.type === "Tender" && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            Envelope Open Date <span className="text-destructive">*</span>
          </Label>
          <Input
            type="datetime-local"
            value={formData.env_open_date}
            onChange={(e) => handleDateChange("env_open_date", e.target.value)}
            min={formData.enddate || getCurrentLocalDateTime()}
            data-testid="input-pr-bid-envelope-open-date"
          />
        </div>
      )}
    </div>
  );
}

function applyPrFormToDraft(formData: BidFormData, draft: CreateBidPreviewSpec): CreateBidPreviewSpec {
  return {
    ...draft,
    bidType: formData.type,
    openDate: formData.startdate ? toLocalISOString(formData.startdate) : draft.openDate,
    closeDate: formData.enddate ? toLocalISOString(formData.enddate) : draft.closeDate,
    envOpenDate:
      formData.type === "Tender" && formData.env_open_date
        ? toLocalISOString(formData.env_open_date)
        : formData.type === "Tender"
          ? draft.envOpenDate
          : undefined,
    bidStyle: formData.type === "Tender" ? "Sealed" : "Open",
  };
}

export function CreateBidPreviewCard({
  preview,
  onConfirm,
  onSave,
  disabled,
  confirmLabel = "Looks Good",
}: {
  preview: CreateBidPreviewSpec;
  onConfirm: (editedPreview: CreateBidPreviewSpec) => void;
  onSave?: (editedPreview: CreateBidPreviewSpec) => Promise<void> | void;
  disabled?: boolean;
  confirmLabel?: string;
}) {
  const { toast } = useToast();
  const [detailOpen, setDetailOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<CreateBidPreviewSpec>(() => clonePreview(preview));
  const [formData, setFormData] = useState<BidFormData>(() => previewToBidFormData(preview));
  const [lineItemSheetOpen, setLineItemSheetOpen] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Signature of the preview we last synced with the parent. Lets us ignore the
  // echo of our own save (which flows back down as a new `preview` prop) so the
  // reset effect doesn't wipe the just-saved draft or in-flight edits.
  const savedSignatureRef = useRef<string>(JSON.stringify(preview));

  const { data: organizations = [] } = useQuery<{ id: number; organization_name: string }[]>({
    queryKey: ["/api/organizations"],
  });

  useEffect(() => {
    const signature = JSON.stringify(preview);
    if (signature === savedSignatureRef.current) return;
    savedSignatureRef.current = signature;
    setDraft(clonePreview(preview));
    setFormData(previewToBidFormData(preview));
    setEditMode(false);
    setLineItemSheetOpen(false);
    setEditingLineIndex(null);
  }, [preview]);

  const resolveOrgName = (orgId: string) =>
    organizations.find((o) => String(o.id) === orgId)?.organization_name;

  const isFromPr = draft.source === "create_bid_from_pr";

  const applyFormToDraft = (): CreateBidPreviewSpec =>
    isFromPr
      ? applyPrFormToDraft(formData, draft)
      : bidFormDataToPreview(formData, draft, resolveOrgName(formData.org_id));

  const buildEditedPreview = (): CreateBidPreviewSpec =>
    scopeEvaluationToBidType(
      isFromPr
        ? applyPrFormToDraft(formData, draft)
        : { ...applyFormToDraft(), notes: draft.notes, department: draft.department },
    );

  const handleSaveAndContinue = async () => {
    const validationError = isFromPr
      ? validatePrBidPreview({
          bidType: formData.type,
          openDate: formData.startdate ? toLocalISOString(formData.startdate) : undefined,
          closeDate: formData.enddate ? toLocalISOString(formData.enddate) : undefined,
          envOpenDate:
            formData.type === "Tender" && formData.env_open_date
              ? toLocalISOString(formData.env_open_date)
              : undefined,
        })
      : validateBidHeaderForm(formData);
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }
    const next = buildEditedPreview();
    setSaving(true);
    try {
      // Mark this preview as our own so the reset effect ignores the echoed prop.
      savedSignatureRef.current = JSON.stringify(next);
      await onSave?.(next);
      setDraft(next);
      setEditMode(false);
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err?.message || "Could not save your changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const enterEditMode = () => {
    setFormData(previewToBidFormData(draft));
    setEditMode(true);
  };

  const previewLabel =
    draft.bidType === "RFQ" ? "RFQ" : draft.bidType === "Tender" ? "Tender" : "RFP";

  // While editing, the form's type wins so the sections react as soon as the user switches type.
  const supportsEvaluation = bidTypeSupportsEvaluation(editMode ? formData.type : draft.bidType);

  const updateDraft = (patch: Partial<CreateBidPreviewSpec>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const openAddLineItem = () => {
    setEditingLineIndex(null);
    setLineItemSheetOpen(true);
  };

  const openEditLineItem = (index: number) => {
    setEditingLineIndex(index);
    setLineItemSheetOpen(true);
  };

  const handleLineItemSubmit = (line: CreateBidPreviewLineItem) => {
    if (editingLineIndex != null) {
      setDraft((prev) => ({
        ...prev,
        lineItems: prev.lineItems.map((existing, i) =>
          i === editingLineIndex ? line : existing,
        ),
      }));
    } else {
      setDraft((prev) => ({ ...prev, lineItems: [...prev.lineItems, line] }));
    }
    setEditingLineIndex(null);
  };

  const updateSupplier = (index: number, patch: Partial<CreateBidPreviewSupplier>) => {
    setDraft((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };

  const updateCriterion = (index: number, patch: Partial<CreateBidPreviewCriterion>) => {
    setDraft((prev) => ({
      ...prev,
      evaluationCriteria: prev.evaluationCriteria.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    }));
  };

  const updateEvaluator = (index: number, patch: Partial<CreateBidPreviewEvaluator>) => {
    setDraft((prev) => ({
      ...prev,
      evaluators: prev.evaluators.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }));
  };

  const updateClause = (index: number, patch: Partial<CreateBidPreviewClause>) => {
    setDraft((prev) => ({
      ...prev,
      clauses: prev.clauses.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const criteriaCount = supportsEvaluation ? draft.evaluationCriteria.length : 0;
  const evaluatorCount = supportsEvaluation ? draft.evaluators.length : 0;
  const queuedCount = isFromPr
    ? draft.suppliers.length + criteriaCount + draft.clauses.length + evaluatorCount
    : draft.lineItems.length +
      draft.suppliers.length +
      criteriaCount +
      draft.clauses.length +
      evaluatorCount;

  const handleConfirm = () => {
    const validationError = editMode
      ? isFromPr
        ? validatePrBidPreview({
            bidType: formData.type,
            openDate: formData.startdate ? toLocalISOString(formData.startdate) : undefined,
            closeDate: formData.enddate ? toLocalISOString(formData.enddate) : undefined,
            envOpenDate:
              formData.type === "Tender" && formData.env_open_date
                ? toLocalISOString(formData.env_open_date)
                : undefined,
          })
        : validateBidHeaderForm(formData)
      : isFromPr
        ? validatePrBidPreview({
            bidType: draft.bidType,
            openDate: draft.openDate,
            closeDate: draft.closeDate,
            envOpenDate: draft.envOpenDate,
          })
        : validateBidPreviewDates(draft.openDate, draft.closeDate);
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }
    const finalPreview = editMode ? buildEditedPreview() : scopeEvaluationToBidType(draft);
    onConfirm({ ...finalPreview, queuedActionCount: queuedCount });
  };

  return (
    <>
      <Card className="border-border/80 bg-background shadow-sm mt-2">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            {!editMode && (
              <h3 className="text-base font-semibold leading-snug text-foreground flex-1">
                {draft.title}
              </h3>
            )}
            {editMode && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded shrink-0 ml-auto">
                Editing
              </span>
            )}
          </div>

          {editMode ? (
            isFromPr ? (
              <div className="space-y-3">
                {draft.prNumber ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Source PR</Label>
                    <Input value={draft.prNumber} disabled className="bg-muted/50" />
                  </div>
                ) : null}
                <PrBidConversionForm formData={formData} onChange={setFormData} />
              </div>
            ) : (
            <div className="space-y-3">
              <BidHeaderFormFields
                formData={formData}
                onChange={setFormData}
                fromPr={!!draft.prNumber}
                variant="inline"
              />
              {draft.prNumber ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Source PR</Label>
                  <Input value={draft.prNumber} disabled className="bg-muted/50" />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={draft.notes || ""}
                  onChange={(e) => updateDraft({ notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetaField label="Bid Type" value={draft.bidType} />
              <MetaField label="Requestor" value={draft.requestor} />
              {draft.buyer ? <MetaField label="Buyer" value={draft.buyer} /> : null}
              {draft.businessEntity ? (
                <MetaField label="Business Entity" value={draft.businessEntity} />
              ) : null}
              {draft.currency ? <MetaField label="Currency" value={draft.currency} /> : null}
              {draft.paymentTerms ? (
                <MetaField label="Payment Terms" value={draft.paymentTerms} />
              ) : null}
              {draft.deliveryLocationName ? (
                <MetaField label="Delivery Location" value={draft.deliveryLocationName} />
              ) : null}
              {draft.openDate ? (
                <MetaField label="Open Date" value={formatCreateBidDateDisplay(draft.openDate)} />
              ) : null}
              {draft.closeDate ? (
                <MetaField label="Close Date" value={formatCreateBidDateDisplay(draft.closeDate)} />
              ) : null}
              {draft.bidType === "Tender" && draft.envOpenDate ? (
                <MetaField
                  label="Envelope Open Date"
                  value={formatCreateBidDateDisplay(draft.envOpenDate)}
                />
              ) : null}
              {draft.prNumber ? <MetaField label="Source PR" value={draft.prNumber} /> : null}
            </div>
          )}

          {draft.lineItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Line Items ({draft.lineItems.length})
                  {isFromPr ? (
                    <span className="ml-1.5 font-normal text-muted-foreground/80">from PR</span>
                  ) : null}
                </p>
                {editMode && !isFromPr && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs gap-1 px-2"
                    onClick={openAddLineItem}
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                {draft.lineItems.map((line, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium text-foreground">{formatPreviewLineLabel(line)}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">
                        {line.quantity != null ? `×${line.quantity}` : ""}
                        {line.unitPrice != null
                          ? ` @ ${Number(line.unitPrice).toLocaleString()}`
                          : ""}
                      </span>
                      {editMode && !isFromPr && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditLineItem(i)}
                            disabled={disabled}
                            className="text-muted-foreground hover:text-violet-600 p-0.5"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft({ lineItems: draft.lineItems.filter((_, idx) => idx !== i) })
                            }
                            disabled={disabled}
                            className="text-muted-foreground hover:text-destructive p-0.5"
                            title="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {editMode && !isFromPr && draft.lineItems.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No line items yet. Click Add.</p>
                )}
              </div>
            </div>
          )}

          {!isFromPr && (
          <BidLineItemSheet
            open={lineItemSheetOpen}
            onOpenChange={setLineItemSheetOpen}
            onSubmit={handleLineItemSubmit}
            currency={draft.currency}
            editingLine={editingLineIndex != null ? draft.lineItems[editingLineIndex] : null}
            disabled={disabled}
          />
          )}

          {!isFromPr && (draft.suppliers.length > 0 || editMode) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Selected Suppliers ({draft.suppliers.length})
                </p>
                {editMode && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs gap-1 px-2"
                    onClick={() =>
                      updateDraft({
                        suppliers: [...draft.suppliers, { supplierName: "" }],
                      })
                    }
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                )}
              </div>
              {editMode ? (
                <div className="space-y-1.5">
                  {draft.suppliers.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        placeholder="Supplier name"
                        value={s.supplierName}
                        onChange={(e) => updateSupplier(i, { supplierName: e.target.value })}
                        className="h-8 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft({ suppliers: draft.suppliers.filter((_, idx) => idx !== i) })
                        }
                        className="text-muted-foreground hover:text-destructive p-1 shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draft.suppliers.map((s, i) => (
                    <Badge
                      key={`${s.supplierName}-${i}`}
                      variant="secondary"
                      className="rounded-full px-2.5 py-0.5 text-xs font-normal bg-muted text-foreground"
                    >
                      @{s.supplierName}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isFromPr && supportsEvaluation && (draft.evaluationCriteria.length > 0 || editMode) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Evaluation Criteria</p>
                {editMode && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs gap-1 px-2"
                    onClick={() =>
                      updateDraft({
                        evaluationCriteria: [
                          ...draft.evaluationCriteria,
                          { category: "", question: "", weight: 20 },
                        ],
                      })
                    }
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                {draft.evaluationCriteria.map((c, i) =>
                  editMode ? (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_72px_auto] gap-1.5 items-center"
                    >
                      <Input
                        placeholder="Criterion / category"
                        value={c.question || c.category || ""}
                        onChange={(e) =>
                          updateCriterion(i, {
                            question: e.target.value,
                            category: e.target.value,
                          })
                        }
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        placeholder="%"
                        value={c.weight ?? ""}
                        onChange={(e) =>
                          updateCriterion(i, {
                            weight: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        className="h-8 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft({
                            evaluationCriteria: draft.evaluationCriteria.filter(
                              (_, idx) => idx !== i,
                            ),
                          })
                        }
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{c.category || c.question}</span>
                      {c.weight != null ? (
                        <span className="text-muted-foreground font-medium">{c.weight}%</span>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {!isFromPr && supportsEvaluation && (draft.evaluators.length > 0 || editMode) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Assigned Evaluators</p>
                {editMode && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs gap-1 px-2"
                    onClick={() =>
                      updateDraft({
                        evaluators: [
                          ...draft.evaluators,
                          { userName: "", teamType: "Technical Review Team" },
                        ],
                      })
                    }
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                )}
              </div>
              {editMode ? (
                <div className="space-y-1.5">
                  {draft.evaluators.map((e, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                      <Input
                        placeholder="Name"
                        value={e.userName}
                        onChange={(ev) => updateEvaluator(i, { userName: ev.target.value })}
                        className="h-8 text-xs"
                      />
                      <Select
                        value={e.teamType || "Technical Review Team"}
                        onValueChange={(v) => updateEvaluator(i, { teamType: v, roleLabel: undefined })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_TYPE_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() =>
                          updateDraft({
                            evaluators: draft.evaluators.filter((_, idx) => idx !== i),
                          })
                        }
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draft.evaluators.map((e, i) => (
                    <Badge
                      key={`${e.userName}-${i}`}
                      variant="outline"
                      className="rounded-full px-2.5 py-0.5 text-xs font-normal border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                    >
                      @{e.userName}
                      {e.roleLabel ? ` (${e.roleLabel})` : ""}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {queuedCount > 0 && !editMode && (
            <p className="text-[11px] text-muted-foreground">
              {queuedCount} queued action{queuedCount === 1 ? "" : "s"} will run after confirmation.
            </p>
          )}

          <div className="pt-1 border-t space-y-2">
            <p className="text-sm text-foreground">
              {editMode
                ? isFromPr
                  ? "Adjust bid type or dates below, then save to continue."
                  : "Edit fields below, then save to continue."
                : isFromPr
                  ? `Review the PR details below. You can change the bid type or dates before creating this ${draft.bidType}.`
                  : `Would you like to make any changes to this ${draft.bidType}?`}
            </p>
            <div className="flex flex-wrap gap-2">
              {editMode ? (
                <Button
                  size="sm"
                  className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={handleSaveAndContinue}
                  disabled={
                    disabled ||
                    saving ||
                    (!isFromPr && !formData.bid_title.trim())
                  }
                  data-testid="button-create-bid-save-continue"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {saving ? "Saving…" : "Save & Continue"}
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleConfirm}
                    disabled={disabled || (!isFromPr && !draft.title.trim())}
                    data-testid="button-create-bid-looks-good"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {confirmLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={enterEditMode}
                    disabled={disabled}
                    data-testid="button-create-bid-make-changes"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </>
              )}
              {!editMode && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setDetailOpen(true)}
                  disabled={disabled}
                  data-testid="button-create-bid-preview"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview {previewLabel}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {draft.title}
            </SheetTitle>
            <SheetDescription>
              Full summary of the staged {draft.bidType} and queued actions.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <MetaField label="Bid Type" value={draft.bidType} />
              <MetaField label="Requestor" value={draft.requestor} />
              <MetaField label="Buyer" value={draft.buyer} />
              <MetaField label="Business Entity" value={draft.businessEntity} />
              <MetaField label="Currency" value={draft.currency} />
              <MetaField label="Department" value={draft.department} />
              <MetaField label="Open Date" value={formatCreateBidDateDisplay(draft.openDate)} />
              <MetaField label="Close Date" value={formatCreateBidDateDisplay(draft.closeDate)} />
            </div>
            {draft.notes ? (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Notes</p>
                <p className="mt-1">{draft.notes}</p>
              </div>
            ) : null}
            {draft.lineItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2">Line Items</p>
                <ul className="space-y-1 text-xs">
                  {draft.lineItems.map((line, i) => (
                    <li key={i} className="rounded border px-2 py-1.5">
                      {formatPreviewLineLabel(line)}
                      {line.quantity != null ? ` · Qty ${line.quantity}` : ""}
                      {line.unitPrice != null ? ` · ${Number(line.unitPrice).toLocaleString()}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {draft.clauses.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2">Terms & Instructions</p>
                <ul className="space-y-1 text-xs">
                  {draft.clauses.map((c, i) => (
                    <li key={i} className="rounded border px-2 py-1.5">
                      [{c.type}] {c.class_desc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
