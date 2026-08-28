import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import type {
  CreateBidPreviewLineItem,
  PublishBidPreviewSpec,
} from "@shared/agent-sourcing-preview";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAISettings } from "@/hooks/use-ai-settings";
import {
  BidLineItemSheet,
  formatPreviewLineLabel,
} from "../bids/bid-line-item-sheet";
import {
  clampDateTimeLocal,
  formatDateTimeInput,
  getCurrentLocalDateTime,
} from "../bids/bid-form-utils";
import {
  RemediationReviewCard,
  type RemediationData,
} from "./remediation-review-card";
import {
  RegenerateCriteriaPreviewCard,
  type ReconciledCriteriaItem,
} from "./regenerate-criteria-preview-card";
import {
  buildApplyPayload,
  buildRemediationDataFromPreview,
  formatPublishDateTimeDisplay,
  isPastDateTimeLocal,
  normalizePublishPreview,
  previewLineToApiPayload,
  remediationFlagsFromPreview,
  remediationSectionFlagsFromPreview,
  validatePublishDateTimes,
} from "./publish-bid-preview-utils";
import { PAST_CLOSE_DATE_MESSAGE, PAST_OPEN_DATE_MESSAGE } from "@shared/publish-bid-dates";

function mapGeneratedCriteriaToPreview(generated: any[]) {
  return generated.map((c: any) => ({
    category: c.category,
    question: c.question,
    weight: c.weight != null ? Number(c.weight) : undefined,
    qvtype: c.qvtype || "Text",
    qvoption: c.qvoption || "Required",
    lov:
      Array.isArray(c.lovOptions) && c.lovOptions.length > 0
        ? c.lovOptions.join(",")
        : c.lov,
  }));
}

function mapGeneratedCriteriaToDraft(generated: any[]) {
  return generated.map((c: any) => ({
    category: c.category,
    question: c.question,
    weight: c.weight,
    qvtype: c.qvtype || "Text",
    qvoption: c.qvoption || "Required",
    lov: Array.isArray(c.lovOptions) ? c.lovOptions.join(",") : c.lov,
    value: c.value,
    lovOptions: c.lovOptions,
  }));
}
function MetaField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
    </div>
  );
}

export function PublishBidPreviewCard({
  preview,
  onConfirmPublish,
  onApplyRemediation,
  onMakeChanges,
  onPreviewUpdated,
  disabled,
}: {
  preview: PublishBidPreviewSpec;
  onConfirmPublish?: () => void;
  onApplyRemediation: (data: RemediationData & { openDate?: string; closeDate?: string }) => void;
  onMakeChanges?: () => void;
  onPreviewUpdated?: (preview: PublishBidPreviewSpec) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const { isAIEnabled } = useAISettings();
  const queryClient = useQueryClient();
  const normalizedPreview = useMemo(() => normalizePublishPreview(preview), [preview]);
  const [editMode, setEditMode] = useState(false);
  const [openDate, setOpenDate] = useState(() => formatDateTimeInput(normalizedPreview.openDate));
  const [closeDate, setCloseDate] = useState(() => formatDateTimeInput(normalizedPreview.closeDate));
  const [remediationDraft, setRemediationDraft] = useState<RemediationData | null>(null);
  const [lineItemsDraft, setLineItemsDraft] = useState<CreateBidPreviewLineItem[]>(
    () => normalizedPreview.lineItems.map((l) => ({ ...l })),
  );
  const [lineItemSheetOpen, setLineItemSheetOpen] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [lineSaving, setLineSaving] = useState(false);
  const [regenerateAvailable, setRegenerateAvailable] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenPlan, setRegenPlan] = useState<ReconciledCriteriaItem[] | null>(null);
  const [regenApplying, setRegenApplying] = useState(false);
  const skipFullResetRef = useRef(false);
  /** Survives preview-refresh effect resets so the regenerate banner is not cleared. */
  const pendingRegenRef = useRef(false);

  useEffect(() => {
    if (skipFullResetRef.current) {
      skipFullResetRef.current = false;
      setLineItemsDraft(normalizedPreview.lineItems.map((l) => ({ ...l })));
      setRemediationDraft(null);
      if (pendingRegenRef.current) {
        pendingRegenRef.current = false;
        setRegenerateAvailable(true);
      }
      return;
    }
    setOpenDate(formatDateTimeInput(normalizedPreview.openDate));
    setCloseDate(formatDateTimeInput(normalizedPreview.closeDate));
    setEditMode(false);
    setRemediationDraft(null);
    setLineItemsDraft(normalizedPreview.lineItems.map((l) => ({ ...l })));
    setLineItemSheetOpen(false);
    setEditingLineIndex(null);
    setRegenerateAvailable(false);
    setRegenPlan(null);
    if (pendingRegenRef.current) {
      pendingRegenRef.current = false;
      setRegenerateAvailable(true);
    }
  }, [normalizedPreview]);

  const handleOpenDateChange = (value: string) => {
    if (!value) {
      setOpenDate("");
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
    setOpenDate(finalValue);
  };

  const handleCloseDateChange = (value: string) => {
    if (!value) {
      setCloseDate("");
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
    setCloseDate(finalValue);
  };

  const remediationFlags = useMemo(
    () => remediationFlagsFromPreview(normalizedPreview),
    [normalizedPreview],
  );
  const sectionFlags = useMemo(
    () => remediationSectionFlagsFromPreview(normalizedPreview),
    [normalizedPreview],
  );
  const checklist = normalizedPreview.checklist;
  const failingChecklist = useMemo(
    () => checklist.filter((c) => !c.ok),
    [checklist],
  );
  const needsClientFetch =
    !normalizedPreview.canPublish &&
    (!normalizedPreview.aiRecommendations ||
      ((normalizedPreview.aiRecommendations.vendors?.length ?? 0) === 0 &&
        normalizedPreview.suggestedSuppliers.length === 0 &&
        remediationFlags.resolveVendors));

  const { data: fetchedRemediation, isLoading: remediationLoading } = useQuery({
    queryKey: ["/api/sourcing-agent/bid-remediation-preview", normalizedPreview.bidId, remediationFlags],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/sourcing-agent/bid-remediation-preview", {
        bidId: normalizedPreview.bidId,
        ...remediationFlags,
      });
      return res.json();
    },
    enabled: needsClientFetch,
  });

  const remediationData = useMemo(
    () => buildRemediationDataFromPreview(normalizedPreview, fetchedRemediation),
    [normalizedPreview, fetchedRemediation],
  );

  const minDateTime = getCurrentLocalDateTime();
  // Validate what is actually in the field so the error clears once a future date is picked;
  // fall back to the preview's error when the field is empty.
  const openDateMessage = openDate
    ? isPastDateTimeLocal(openDate)
      ? PAST_OPEN_DATE_MESSAGE
      : undefined
    : normalizedPreview.openDateError;
  const closeDateMessage = closeDate
    ? isPastDateTimeLocal(closeDate)
      ? PAST_CLOSE_DATE_MESSAGE
      : undefined
    : normalizedPreview.closeDateError;
  const blockingCount = failingChecklist.length;
  const datesNeedAttention = checklist.some(
    (c) => !c.ok && (c.id === "openDate" || c.id === "closeDate"),
  );
  const showTimelines = editMode || datesNeedAttention;
  const isRfpOrTender = normalizedPreview.bidType === "RFP" || normalizedPreview.bidType === "Tender";
  const showRemediation =
    !normalizedPreview.canPublish &&
    (remediationFlags.resolveVendors ||
      (isRfpOrTender &&
        (remediationFlags.resolveCriteria ||
          remediationFlags.resolveTeam ||
          remediationFlags.resolveClauses)));
  const lineItemsNeedAttention = checklist.some((c) => !c.ok && c.id === "lineItems");
  const isFromPr = !!normalizedPreview.prNumber;
  const showLineItems = editMode || lineItemsNeedAttention || lineItemsDraft.length > 0;
  const hasPersistedCriteria = normalizedPreview.evaluationCriteria.some((c) => c.id != null);
  /** Suggested (unsaved) AI criteria still count — publish card often shows these before Save Changes. */
  const hasCriteriaToRegen =
    hasPersistedCriteria ||
    normalizedPreview.evaluationCriteria.length > 0 ||
    remediationData.criteria.length > 0 ||
    remediationFlags.resolveCriteria;
  const aiEnabled = isAIEnabled("AI_GENERATE_REQUIREMENTS");
  const showRegenerateBanner =
    regenerateAvailable && isRfpOrTender && hasCriteriaToRegen && aiEnabled;

  const markRegenerateAvailable = useCallback(() => {
    if (!isRfpOrTender || !hasCriteriaToRegen) return;
    pendingRegenRef.current = true;
    setRegenerateAvailable(true);
  }, [isRfpOrTender, hasCriteriaToRegen]);

  const refreshPublishPreview = useCallback(async () => {
    const res = await apiRequest("POST", "/api/sourcing-agent/publish-preview", {
      bidId: normalizedPreview.bidId,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not refresh publish preview.");
    }
    const next = (await res.json()) as PublishBidPreviewSpec;
    skipFullResetRef.current = true;
    onPreviewUpdated?.(next);
    return next;
  }, [normalizedPreview.bidId, onPreviewUpdated]);

  /** Re-generate draft (unsaved) AI criteria from current DB line items and push into the preview. */
  const refreshSuggestedCriteria = useCallback(
    async (basePreview: PublishBidPreviewSpec, opts?: { silent?: boolean }) => {
      const res = await apiRequest("POST", "/api/sourcing-agent/bid-remediation-preview", {
        bidId: basePreview.bidId,
        resolveCriteria: true,
        resolveTeam: false,
        resolveVendors: false,
        resolveClauses: false,
      });
      const data = await res.json();
      const generated = Array.isArray(data.criteria) ? data.criteria : [];
      if (generated.length === 0) {
        throw new Error("Could not regenerate evaluation criteria for the updated line items.");
      }
      const mapped = mapGeneratedCriteriaToPreview(generated);
      const draftCriteria = mapGeneratedCriteriaToDraft(generated);
      const nextPreview: PublishBidPreviewSpec = {
        ...basePreview,
        evaluationCriteria: mapped,
        aiRecommendations: {
          bidId: basePreview.bidId,
          bidLabel: basePreview.bidLabel,
          criteria: generated,
          team: basePreview.aiRecommendations?.team || [],
          vendors: basePreview.aiRecommendations?.vendors || [],
          clauses: basePreview.aiRecommendations?.clauses || [],
        },
      };
      skipFullResetRef.current = true;
      pendingRegenRef.current = false;
      onPreviewUpdated?.(nextPreview);
      setRemediationDraft((prev) => ({
        ...(prev || {
          bidId: basePreview.bidId,
          bidLabel: basePreview.bidLabel,
          criteria: [],
          team: [],
          vendors: [],
          clauses: [],
        }),
        criteria: draftCriteria,
      }));
      setRegenerateAvailable(false);
      setRegenPlan(null);
      queryClient.setQueryData(
        [
          "/api/sourcing-agent/bid-remediation-preview",
          basePreview.bidId,
          remediationFlagsFromPreview(basePreview),
        ],
        (old: any) => ({ ...(old || {}), criteria: generated }),
      );
      if (!opts?.silent) {
        toast({
          title: "Evaluation Criteria Regenerated",
          description: `Updated ${generated.length} suggested criteria based on current line items.`,
        });
      }
      return nextPreview;
    },
    [onPreviewUpdated, queryClient, toast],
  );

  /** After a line change: auto-refresh draft suggestions, or prompt regenerate for persisted criteria. */
  const afterLineItemsChanged = useCallback(
    async (refreshedPreview: PublishBidPreviewSpec) => {
      const persisted = (refreshedPreview.evaluationCriteria || []).some((c) => c.id != null);
      const isRfp =
        refreshedPreview.bidType === "RFP" || refreshedPreview.bidType === "Tender";
      if (!isRfp || !isAIEnabled("AI_GENERATE_REQUIREMENTS")) return;

      if (!persisted) {
        const shouldRefreshSuggestions =
          (refreshedPreview.evaluationCriteria?.length ?? 0) > 0 ||
          remediationFlagsFromPreview(refreshedPreview).resolveCriteria;
        if (!shouldRefreshSuggestions) return;
        try {
          setRegenLoading(true);
          await refreshSuggestedCriteria(refreshedPreview, { silent: true });
        } catch (e: any) {
          // Fall back to banner so the user can retry manually.
          markRegenerateAvailable();
          toast({
            title: "Could not auto-update criteria",
            description: e?.message || "Use Regenerate to refresh evaluation criteria.",
            variant: "destructive",
          });
        } finally {
          setRegenLoading(false);
        }
        return;
      }

      markRegenerateAvailable();
    },
    [isAIEnabled, markRegenerateAvailable, refreshSuggestedCriteria, toast],
  );

  const openAddLineItem = () => {
    setEditingLineIndex(null);
    setLineItemSheetOpen(true);
  };

  const openEditLineItem = (index: number) => {
    setEditingLineIndex(index);
    setLineItemSheetOpen(true);
  };

  const handleLineItemSubmit = async (line: CreateBidPreviewLineItem) => {
    if (isFromPr) return;
    const bidId = normalizedPreview.bidId;
    const payload = previewLineToApiPayload(line, normalizedPreview.currency);
    const editingLine =
      editingLineIndex != null ? lineItemsDraft[editingLineIndex] : null;
    const lineId = editingLine?.lineId ?? line.lineId;

    setLineSaving(true);
    try {
      if (lineId != null) {
        const res = await apiRequest("PUT", `/api/dbo/bids/${bidId}/lines/${lineId}`, payload);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.error || "Could not update line item.");
        }
        toast({ title: "Line Updated", description: "Bid line has been updated." });
      } else {
        const res = await apiRequest("POST", `/api/dbo/bids/${bidId}/lines`, payload);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.error || "Could not add line item.");
        }
        toast({ title: "Line Added", description: "Bid line has been added." });
      }
      setEditingLineIndex(null);
      const refreshed = await refreshPublishPreview();
      await afterLineItemsChanged(refreshed);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Could not save line item.",
        variant: "destructive",
      });
      throw e;
    } finally {
      setLineSaving(false);
    }
  };

  const handleRemoveLineItem = async (index: number) => {
    if (isFromPr || disabled || lineSaving) return;
    const line = lineItemsDraft[index];
    if (!line) return;

    setLineSaving(true);
    try {
      if (line.lineId != null) {
        const res = await apiRequest(
          "DELETE",
          `/api/dbo/bids/${normalizedPreview.bidId}/lines/${line.lineId}`,
        );
        if (!res.ok && res.status !== 204) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || err.error || "Could not remove line item.");
        }
        toast({ title: "Line Removed", description: "Bid line has been removed." });
        const refreshed = await refreshPublishPreview();
        await afterLineItemsChanged(refreshed);
      } else {
        setLineItemsDraft((prev) => prev.filter((_, idx) => idx !== index));
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Could not remove line item.",
        variant: "destructive",
      });
    } finally {
      setLineSaving(false);
    }
  };

  const handleDraftChange = useCallback((data: RemediationData) => {
    setRemediationDraft(data);
  }, []);

  const handleSaveChanges = () => {
    const dateError = validatePublishDateTimes(openDate, closeDate);
    if (dateError) {
      toast({
        title: "Validation Error",
        description: dateError,
        variant: "destructive",
      });
      return;
    }

    const draft = remediationDraft || remediationData;
    const payload = buildApplyPayload(
      normalizedPreview,
      draft,
      { openDate, closeDate },
      isFromPr ? normalizedPreview.lineItems : lineItemsDraft,
      sectionFlags,
    );
    const hasChanges =
      payload.openDate ||
      payload.closeDate ||
      (payload.vendors?.length ?? 0) > 0 ||
      (payload.criteria?.length ?? 0) > 0 ||
      payload.replaceCriteria ||
      (payload.team?.length ?? 0) > 0 ||
      (payload.clauses?.length ?? 0) > 0 ||
      (payload.lineItems?.length ?? 0) > 0;
    if (!hasChanges) {
      setEditMode(false);
      return;
    }
    onApplyRemediation(payload);
  };

  const enterEditMode = () => {
    setEditMode(true);
    onMakeChanges?.();
  };

  const fetchRegenerate = async () => {
    setRegenLoading(true);
    try {
      // Unsaved AI suggestions: re-generate criteria from current line items (no DB reconcile).
      if (!hasPersistedCriteria) {
        await refreshSuggestedCriteria(normalizedPreview);
        return;
      }

      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${normalizedPreview.bidId}/ai/regenerate-requirements`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not regenerate evaluation criteria.");
      }
      const plan = (await res.json()) as ReconciledCriteriaItem[];
      const changed = plan.filter((p) => p.action !== "keep");
      if (changed.length === 0) {
        toast({
          title: "Already in sync",
          description: "Evaluation criteria already match the current line items.",
        });
        setRegenerateAvailable(false);
        setRegenPlan(null);
        return;
      }
      setRegenPlan(plan);
    } catch (e: any) {
      toast({
        title: "AI Error",
        description: e?.message || "Could not regenerate evaluation criteria.",
        variant: "destructive",
      });
    } finally {
      setRegenLoading(false);
    }
  };

  const applyRegenerated = async (selectedActions: ReconciledCriteriaItem[]) => {
    const actionable = selectedActions.filter((a) => a.action !== "keep");
    if (actionable.length === 0) {
      setRegenPlan(null);
      setRegenerateAvailable(false);
      return;
    }
    setRegenApplying(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${normalizedPreview.bidId}/ai/apply-regenerated-requirements`,
        { actions: actionable },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not apply the regenerated criteria.");
      }
      const summary = await res.json().catch(() => ({}));
      setRegenPlan(null);
      setRegenerateAvailable(false);
      toast({
        title: "Evaluation Criteria Updated",
        description: `Added ${summary.created ?? 0}, updated ${summary.updated ?? 0}, removed ${summary.removed ?? 0}.`,
      });
      await refreshPublishPreview();
    } catch (e: any) {
      toast({
        title: "AI Error",
        description: e?.message || "Could not apply the regenerated criteria.",
        variant: "destructive",
      });
    } finally {
      setRegenApplying(false);
    }
  };

  return (
    <Card className="border-border/80 bg-background shadow-sm mt-2">
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold leading-snug">{normalizedPreview.title}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {normalizedPreview.bidLabel} · {normalizedPreview.bidType} · {normalizedPreview.lineItemCount} line item
            {normalizedPreview.lineItemCount === 1 ? "" : "s"} · {normalizedPreview.vendorCount} vendor
            {normalizedPreview.vendorCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-foreground uppercase tracking-wide">
            Publish requirements
          </p>
          <ul className="space-y-1.5">
            {failingChecklist.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                {item.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <span className={item.ok ? "text-muted-foreground" : "text-foreground font-medium"}>
                  {item.label}
                  {item.detail ? (
                    <span className="font-normal text-muted-foreground"> — {item.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {!editMode && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetaField label="Business entity" value={normalizedPreview.businessEntity} />
            <MetaField label="Buyer" value={normalizedPreview.buyer} />
            <MetaField label="Requestor" value={normalizedPreview.requestor} />
            <MetaField label="Currency" value={normalizedPreview.currency} />
            {normalizedPreview.prNumber ? (
              <MetaField label="Source PR" value={normalizedPreview.prNumber} />
            ) : null}
            {!showTimelines ? (
              <>
                <MetaField
                  label="Open date & time"
                  value={formatPublishDateTimeDisplay(normalizedPreview.openDate)}
                />
                <MetaField
                  label="Close date & time"
                  value={formatPublishDateTimeDisplay(normalizedPreview.closeDate)}
                />
              </>
            ) : null}
          </div>
        )}

        {showTimelines && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Timelines
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="publish-open-date" className="text-xs">
                  Bid Open Date & Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="publish-open-date"
                  type="datetime-local"
                  min={minDateTime}
                  max={closeDate || undefined}
                  value={openDate}
                  onChange={(e) => handleOpenDateChange(e.target.value)}
                  disabled={disabled}
                  aria-invalid={openDateMessage ? true : undefined}
                  data-testid="input-publish-open-datetime"
                />
                {openDateMessage ? (
                  <p className="text-xs text-destructive" data-testid="error-publish-open-datetime">
                    {openDateMessage}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="publish-close-date" className="text-xs">
                  Bid Close Date & Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="publish-close-date"
                  type="datetime-local"
                  min={openDate || minDateTime}
                  value={closeDate}
                  onChange={(e) => handleCloseDateChange(e.target.value)}
                  disabled={disabled}
                  aria-invalid={closeDateMessage ? true : undefined}
                  data-testid="input-publish-close-datetime"
                />
                {closeDateMessage ? (
                  <p className="text-xs text-destructive" data-testid="error-publish-close-datetime">
                    {closeDateMessage}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {showLineItems && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Line Items ({lineItemsDraft.length})
                {isFromPr ? (
                  <span className="ml-1.5 font-normal normal-case text-muted-foreground/80">from PR</span>
                ) : null}
              </p>
              {editMode && !isFromPr && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs gap-1 px-2"
                  onClick={openAddLineItem}
                  disabled={disabled || lineSaving}
                  data-testid="button-publish-add-line-item"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              {lineItemsDraft.map((line, i) => (
                <div
                  key={line.lineId ?? i}
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
                          disabled={disabled || lineSaving}
                          className="text-muted-foreground hover:text-violet-600 p-0.5"
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(i)}
                          disabled={disabled || lineSaving}
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
              {editMode && !isFromPr && lineItemsDraft.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No line items yet. Click Add.</p>
              )}
            </div>
          </div>
        )}

        {regenLoading && !regenPlan && !showRegenerateBanner && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating evaluation criteria for the latest line items…
          </div>
        )}

        {showRegenerateBanner && !regenPlan && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 dark:border-purple-800 dark:bg-purple-950/30">
            <div className="flex items-center gap-2 text-xs text-purple-800 dark:text-purple-300">
              <Sparkles className="h-4 w-4 flex-shrink-0" />
              <span>
                Line items changed. Regenerate evaluation questions to keep them aligned with the
                latest items.
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={fetchRegenerate}
                disabled={disabled || regenLoading || lineSaving}
                className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                data-testid="button-publish-regenerate-criteria"
              >
                {regenLoading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                )}
                Regenerate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRegenerateAvailable(false)}
                disabled={disabled || regenLoading}
                data-testid="button-publish-dismiss-regenerate"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {regenPlan && (
          <div className={regenApplying ? "opacity-60 pointer-events-none" : undefined}>
            <RegenerateCriteriaPreviewCard
              bidLabel={normalizedPreview.bidLabel}
              plan={regenPlan}
              onConfirm={applyRegenerated}
              disabled={disabled || regenApplying}
            />
            <div className="mt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRegenPlan(null)}
                disabled={disabled || regenApplying}
              >
                Cancel regenerate
              </Button>
            </div>
          </div>
        )}

        {!isFromPr && (
          <BidLineItemSheet
            open={lineItemSheetOpen}
            onOpenChange={setLineItemSheetOpen}
            onSubmit={handleLineItemSubmit}
            currency={normalizedPreview.currency}
            editingLine={editingLineIndex != null ? lineItemsDraft[editingLineIndex] : null}
            disabled={disabled || lineSaving}
          />
        )}

        {showRemediation && (
          <>
            {remediationLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading AI suggestions…
              </div>
            ) : (
              <RemediationReviewCard
                embedded
                hideApplyButton
                bidType={normalizedPreview.bidType}
                data={remediationData}
                editMode={editMode}
                onEditModeChange={setEditMode}
                onApply={handleDraftChange}
                disabled={disabled}
                sectionFlags={sectionFlags}
              />
            )}
            {normalizedPreview.remediationErrors?.length ? (
              <p className="text-xs text-muted-foreground">{normalizedPreview.remediationErrors.join(" ")}</p>
            ) : null}
          </>
        )}

        <div className="pt-1 border-t space-y-2">
          <p className="text-sm text-foreground">
            {normalizedPreview.canPublish
              ? "All requirements are satisfied. Ready to publish?"
              : blockingCount > 0
                ? `${blockingCount} requirement${blockingCount === 1 ? "" : "s"} still need attention. Edit below or tell me what to change in chat.`
                : "Review the details below, then save changes before publishing."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!normalizedPreview.canPublish ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className={`gap-1.5 ${editMode ? "border-violet-400 text-violet-700" : ""}`}
                  onClick={() => (editMode ? setEditMode(false) : enterEditMode())}
                  disabled={disabled || lineSaving}
                  data-testid="button-publish-make-changes"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {editMode ? "Done Editing" : "Make Changes"}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={handleSaveChanges}
                  disabled={disabled || lineSaving}
                  data-testid="button-publish-save-changes"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save Changes
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onConfirmPublish}
              disabled={disabled || !normalizedPreview.canPublish || !onConfirmPublish || lineSaving}
              data-testid="button-publish-bid-confirm"
            >
              <Check className="h-3.5 w-3.5" />
              Publish Bid
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
