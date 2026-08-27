import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  X,
  Check,
  Eye,
  Pencil,
  Plus,
  ScrollText,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import {
  InviteSuppliersSheet,
  mapApprovedSupplierToVendor,
  type ApprovedSupplierRow,
} from "@/components/invite-suppliers-sheet";

export interface RemediationData {
  bidId: number;
  bidLabel?: string;
  criteria: any[];
  team: any[];
  vendors: any[];
  clauses: any[];
  lineItems?: Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    uom?: string;
    lineType?: string;
    itemId?: string | number;
    itemName?: string;
    itemCode?: string;
    categoryCode?: string | number;
    categoryName?: string;
    needByFrom?: string;
    needByTo?: string;
  }>;
  /** When true, server replaces all bid requirements with the criteria list (publish preview save). */
  replaceCriteria?: boolean;
}

/** When set (e.g. publish preview card), only render sections that still need fixing. */
export type RemediationSectionFlags = {
  criteria?: boolean;
  team?: boolean;
  vendors?: boolean;
  clauses?: boolean;
};

interface CriterionForm {
  category: string;
  question: string;
  qvoption: string;
  qvtype: string;
  weight: string;
  lovOptions: string[];
}

const DEFAULT_CRITERION_FORM: CriterionForm = {
  category: "",
  question: "",
  qvoption: "Required",
  qvtype: "Text",
  weight: "20",
  lovOptions: [],
};

interface ClauseForm {
  type: string;
  class_desc: string;
  class_ref: string;
}

const DEFAULT_CLAUSE_FORM: ClauseForm = {
  type: "terms",
  class_desc: "",
  class_ref: "",
};

function criterionToForm(c: any): CriterionForm {
  return {
    category: c.category || "",
    question: c.question || "",
    qvoption: c.qvoption || "Required",
    qvtype: c.qvtype || "Text",
    weight: String(c.weight ?? "20"),
    lovOptions: Array.isArray(c.lovOptions)
      ? c.lovOptions
      : c.lov
        ? String(c.lov).split(",").filter(Boolean)
        : [],
  };
}

export function RemediationReviewCard({
  data,
  onApply,
  onCancel,
  disabled,
  embedded = false,
  editMode: controlledEditMode,
  onEditModeChange,
  bidType,
  hideApplyButton = false,
  sectionFlags,
}: {
  data: RemediationData;
  onApply: (modifiedData: RemediationData) => void;
  onCancel?: () => void;
  disabled?: boolean;
  /** When true, renders inline inside another card (no outer card, no bid-page link). */
  embedded?: boolean;
  editMode?: boolean;
  onEditModeChange?: (value: boolean) => void;
  /** When RFQ, only supplier suggestions are shown. */
  bidType?: string;
  /** When true, parent card owns Save — hide the inline Apply button. */
  hideApplyButton?: boolean;
  /** Limit visible sections to publish gaps that still need attention. */
  sectionFlags?: RemediationSectionFlags;
}) {
  const { toast } = useToast();
  const [criteria, setCriteria] = useState<any[]>(data.criteria || []);
  const [team, setTeam] = useState<any[]>(data.team || []);
  const [vendors, setVendors] = useState<any[]>(data.vendors || []);
  const [clauses, setClauses] = useState<any[]>(data.clauses || []);

  useEffect(() => {
    setCriteria(data.criteria || []);
    setTeam(data.team || []);
    setVendors(data.vendors || []);
    setClauses(data.clauses || []);
  }, [data.bidId, data.criteria, data.team, data.vendors, data.clauses]);

  useEffect(() => {
    if (!hideApplyButton) return;
    onApply({
      bidId: data.bidId,
      bidLabel: data.bidLabel,
      criteria,
      team,
      vendors,
      clauses,
    });
  }, [hideApplyButton, data.bidId, data.bidLabel, criteria, team, vendors, clauses, onApply]);

  const [internalEditMode, setInternalEditMode] = useState(embedded);
  const isEditMode = controlledEditMode ?? internalEditMode;
  const setIsEditMode = (value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(isEditMode) : value;
    onEditModeChange?.(next);
    if (controlledEditMode === undefined) setInternalEditMode(next);
  };
  const [criterionSheetOpen, setCriterionSheetOpen] = useState(false);
  const [editingCriterionIdx, setEditingCriterionIdx] = useState<number | null>(null);
  const [criterionForm, setCriterionForm] = useState<CriterionForm>(DEFAULT_CRITERION_FORM);
  const [newLovOption, setNewLovOption] = useState("");

  const [teamSheetOpen, setTeamSheetOpen] = useState(false);
  const [teamPickerContext, setTeamPickerContext] = useState<{
    mode: "replace" | "add";
    teamType: string;
    idx?: number;
  } | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");

  const [supplierSheetOpen, setSupplierSheetOpen] = useState(false);
  const [supplierPickerContext, setSupplierPickerContext] = useState<{
    mode: "replace" | "add";
    idx?: number;
  } | null>(null);

  const [clauseSheetOpen, setClauseSheetOpen] = useState(false);
  const [editingClauseIdx, setEditingClauseIdx] = useState<number | null>(null);
  const [clauseForm, setClauseForm] = useState<ClauseForm>(DEFAULT_CLAUSE_FORM);

  const needsLookupData =
    isEditMode || criterionSheetOpen || teamSheetOpen;

  const { data: businessCategories = [] } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["/api/lookups/by-property/BID_REQ_CATEGORIES"],
    queryFn: async () => {
      const res = await fetch("/api/lookups/by-property/BID_REQ_CATEGORIES");
      if (!res.ok) throw new Error("Failed to fetch categories");
      const rows = await res.json();
      return rows.map((d: any) => ({ value: d.lookup_key, label: d.description }));
    },
    enabled: needsLookupData,
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users/dropdown"],
    enabled: teamSheetOpen,
  });

  const { data: bidSuppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", data.bidId, "suppliers"],
    enabled: supplierSheetOpen && !!data.bidId,
  });

  const removeCriterion = (idx: number) => setCriteria((prev) => prev.filter((_, i) => i !== idx));
  const removeTeamMember = (idx: number) => setTeam((prev) => prev.filter((_, i) => i !== idx));
  const removeVendor = (idx: number) => setVendors((prev) => prev.filter((_, i) => i !== idx));
  const removeClause = (idx: number) => setClauses((prev) => prev.filter((_, i) => i !== idx));

  const totalItems = criteria.length + team.length + vendors.length + clauses.length;
  const totalCriteriaWeight = criteria.reduce(
    (sum, r) => sum + (parseInt(String(r.weight), 10) || 0),
    0,
  );

  const teamByType: Record<string, any[]> = {};
  team.forEach((m) => {
    (teamByType[m.teamType] = teamByType[m.teamType] || []).push(m);
  });

  const teamTypes = useMemo(() => {
    const fromData = [...new Set(team.map((m) => m.teamType).filter(Boolean))];
    const hasTenderTeams = fromData.some(
      (t) => t.includes("Approve") || t.includes("Committee"),
    );
    const base = hasTenderTeams
      ? [
          "Technical Review Team",
          "Technical Approve Team",
          "Commercial Review Team",
          "Commercial Approve Team",
          "Committee Team",
        ]
      : ["Technical Review Team", "Commercial Review Team"];
    return [...new Set([...base, ...fromData])];
  }, [team]);

  const categoryOptions = useMemo(() => {
    const opts = [...businessCategories];
    if (
      criterionForm.category &&
      !opts.some((c) => c.value === criterionForm.category)
    ) {
      opts.unshift({ value: criterionForm.category, label: criterionForm.category });
    }
    return opts;
  }, [businessCategories, criterionForm.category]);

  const terms = clauses.filter((c) => c.type === "terms");
  const instructions = clauses.filter((c) => c.type === "instructions");

  const assignedUserIds = new Set(team.map((m) => String(m.userId)));
  const isRfq = String(bidType || "").toUpperCase() === "RFQ";
  const wantsCriteria = sectionFlags?.criteria ?? true;
  const wantsTeam = sectionFlags?.team ?? true;
  const wantsVendors = sectionFlags?.vendors ?? true;
  const wantsClauses = sectionFlags?.clauses ?? true;
  const showCriteria = wantsCriteria && !isRfq && (criteria.length > 0 || isEditMode);
  const showTeam = wantsTeam && !isRfq && (team.length > 0 || isEditMode);
  const showClauses = wantsClauses && !isRfq && (clauses.length > 0 || isEditMode);
  const showVendors = wantsVendors && (vendors.length > 0 || isEditMode);

  const openCriterionEditor = (idx: number | null) => {
    setEditingCriterionIdx(idx);
    if (idx === null) {
      setCriterionForm(DEFAULT_CRITERION_FORM);
    } else {
      setCriterionForm(criterionToForm(criteria[idx]));
    }
    setNewLovOption("");
    setCriterionSheetOpen(true);
  };

  const saveCriterion = () => {
    if (!criterionForm.category) {
      toast({ title: "Required", description: "Category is required.", variant: "destructive" });
      return;
    }
    if (!criterionForm.question.trim()) {
      toast({ title: "Required", description: "Requirement is required.", variant: "destructive" });
      return;
    }
    const parsedWeight = Number(criterionForm.weight);
    if (!Number.isInteger(parsedWeight) || parsedWeight < 1 || parsedWeight > 100) {
      toast({
        title: "Invalid Weightage",
        description: "Weightage must be between 1 and 100.",
        variant: "destructive",
      });
      return;
    }
    if (criterionForm.qvtype === "Dropdown" && criterionForm.lovOptions.length === 0) {
      toast({
        title: "Required",
        description: "Add at least one dropdown option.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      category: criterionForm.category,
      question: criterionForm.question.trim(),
      qvoption: criterionForm.qvoption,
      qvtype: criterionForm.qvtype,
      weight: parsedWeight,
      lovOptions: criterionForm.qvtype === "Dropdown" ? criterionForm.lovOptions : [],
      lov:
        criterionForm.qvtype === "Dropdown"
          ? criterionForm.lovOptions.join(",")
          : undefined,
    };

    if (editingCriterionIdx === null) {
      setCriteria((prev) => [...prev, payload]);
    } else {
      setCriteria((prev) =>
        prev.map((c, i) => (i === editingCriterionIdx ? { ...c, ...payload } : c)),
      );
    }
    setCriterionSheetOpen(false);
    setEditingCriterionIdx(null);
  };

  const openClauseEditor = (
    idx: number | null,
    defaultType: "terms" | "instructions" = "terms",
  ) => {
    setEditingClauseIdx(idx);
    if (idx === null) {
      setClauseForm({ ...DEFAULT_CLAUSE_FORM, type: defaultType });
    } else {
      const c = clauses[idx];
      setClauseForm({
        type: c.type || "terms",
        class_desc: c.class_desc || "",
        class_ref: c.class_ref || "",
      });
    }
    setClauseSheetOpen(true);
  };

  const saveClause = () => {
    if (!clauseForm.class_desc.trim()) {
      toast({
        title: "Required",
        description: "Description is required.",
        variant: "destructive",
      });
      return;
    }
    const payload = {
      type: clauseForm.type,
      class_desc: clauseForm.class_desc.trim(),
      class_ref: clauseForm.class_ref.trim() || undefined,
    };
    if (editingClauseIdx === null) {
      setClauses((prev) => [...prev, payload]);
    } else {
      setClauses((prev) =>
        prev.map((c, i) => (i === editingClauseIdx ? { ...c, ...payload } : c)),
      );
    }
    setClauseSheetOpen(false);
    setEditingClauseIdx(null);
  };

  const openTeamPicker = (ctx: { mode: "replace" | "add"; teamType: string; idx?: number }) => {
    setTeamPickerContext(ctx);
    setTeamSearchQuery("");
    setTeamSheetOpen(true);
  };

  const selectTeamMember = (u: any) => {
    if (!teamPickerContext) return;
    const member = {
      teamType: teamPickerContext.teamType,
      userId: u.id,
      userName: u.name || u.user_name || `User ${u.id}`,
      userEmail: u.email_id || "",
    };
    if (teamPickerContext.mode === "replace" && teamPickerContext.idx != null) {
      setTeam((prev) => prev.map((m, i) => (i === teamPickerContext.idx ? member : m)));
    } else {
      setTeam((prev) => [...prev, member]);
    }
    setTeamSheetOpen(false);
    setTeamPickerContext(null);
  };

  const openSupplierPicker = (ctx: { mode: "replace" | "add"; idx?: number }) => {
    setSupplierPickerContext(ctx);
    setSupplierSheetOpen(true);
  };

  const handleSupplierConfirm = (selected: ApprovedSupplierRow[]) => {
    if (!supplierPickerContext || selected.length === 0) return;
    const mapped = selected.map((s) =>
      mapApprovedSupplierToVendor(
        s,
        supplierPickerContext.mode === "replace" && supplierPickerContext.idx != null
          ? {
              score: vendors[supplierPickerContext.idx]?.score,
              reasons: vendors[supplierPickerContext.idx]?.reasons,
            }
          : undefined,
      ),
    );
    if (supplierPickerContext.mode === "replace" && supplierPickerContext.idx != null) {
      setVendors((prev) =>
        prev.map((v, i) => (i === supplierPickerContext.idx ? mapped[0] : v)),
      );
    } else {
      setVendors((prev) => [...prev, ...mapped]);
    }
    setSupplierSheetOpen(false);
    setSupplierPickerContext(null);
  };

  const replacingUserId =
    teamPickerContext?.mode === "replace" && teamPickerContext.idx != null
      ? String(team[teamPickerContext.idx]?.userId ?? "")
      : "";

  const filteredUsers = (allUsers || []).filter((u: any) => {
    if (assignedUserIds.has(String(u.id)) && String(u.id) !== replacingUserId) {
      return false;
    }
    const q = teamSearchQuery.toLowerCase();
    if (!q) return true;
    return (
      (u.name || "").toLowerCase().includes(q) ||
      (u.user_name || "").toLowerCase().includes(q) ||
      (u.email_id || "").toLowerCase().includes(q)
    );
  });

  const excludeSupplierIds = useMemo(() => {
    const ids = new Set<string>();
    vendors.forEach((v, i) => {
      if (supplierPickerContext?.mode === "replace" && supplierPickerContext.idx === i) {
        return;
      }
      ids.add(String(v.supplierId));
    });
    (bidSuppliers || []).forEach((s: any) => ids.add(String(s.supplier_id)));
    return Array.from(ids);
  }, [vendors, bidSuppliers, supplierPickerContext]);

  const inner = (
    <>
      {!embedded && (
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
            Review AI-Generated Content
          </p>
          {isEditMode && (
            <span className="text-xs bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-100 px-1.5 py-0.5 rounded">
              Editing
            </span>
          )}
        </div>
      )}
      {!embedded && (
        <p className="text-xs text-violet-700 dark:text-violet-300 -mt-2">
          {isEditMode
            ? "Edit items below, then click Done Editing and Apply All Approved Changes to save."
            : "Remove items you don't want, use Make Changes to edit, or Preview to open the bid."}
        </p>
      )}

          {/* Evaluation Criteria */}
          {(criteria.length > 0 || isEditMode) && showCriteria && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-violet-800 dark:text-violet-200 uppercase tracking-wide">
                  Evaluation Criteria ({criteria.length})
                  {criteria.length > 0 && (
                    <span className="normal-case font-normal text-muted-foreground ml-1">
                      · Total weight: {totalCriteriaWeight}
                    </span>
                  )}
                </p>
                {isEditMode && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs gap-1 px-2"
                    onClick={() => openCriterionEditor(null)}
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                {criteria.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 bg-white dark:bg-violet-950/30 rounded px-2 py-1.5 border border-violet-100 dark:border-violet-800"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-violet-500 dark:text-violet-400 font-medium">
                        [{r.category}]
                      </span>{" "}
                      <span className="text-xs text-foreground">{r.question}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        · Weight: {r.weight}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => openCriterionEditor(i)}
                          disabled={disabled}
                          className="text-muted-foreground hover:text-violet-600 transition-colors p-0.5"
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeCriterion(i)}
                        disabled={disabled}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {criteria.length === 0 && isEditMode && (
                  <p className="text-xs text-muted-foreground italic px-1">No criteria yet. Click Add.</p>
                )}
              </div>
            </div>
          )}

          {/* Evaluation Team */}
          {(team.length > 0 || isEditMode) && showTeam && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-violet-800 dark:text-violet-200 uppercase tracking-wide">
                Evaluation Team ({team.length})
              </p>
              <div className="space-y-1">
                {teamTypes.map((teamType) => {
                  const members = teamByType[teamType] || [];
                  return (
                    <div
                      key={teamType}
                      className="bg-white dark:bg-violet-950/30 rounded px-2 py-1.5 border border-violet-100 dark:border-violet-800"
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                          {teamType}
                        </p>
                        {isEditMode && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs gap-1 px-2"
                            onClick={() => openTeamPicker({ mode: "add", teamType })}
                            disabled={disabled}
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {members.map((m, mi) => {
                          const globalIdx = team.findIndex(
                            (t) => t.userId === m.userId && t.teamType === m.teamType,
                          );
                          return (
                            <span
                              key={mi}
                              className="inline-flex items-center gap-1 bg-violet-100 dark:bg-violet-800/40 rounded px-1.5 py-0.5 text-xs"
                            >
                              {m.userName}
                              {isEditMode && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openTeamPicker({ mode: "replace", teamType, idx: globalIdx })
                                  }
                                  disabled={disabled}
                                  className="text-muted-foreground hover:text-violet-600 transition-colors"
                                  title="Replace"
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => removeTeamMember(globalIdx)}
                                disabled={disabled}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Remove"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          );
                        })}
                        {members.length === 0 && isEditMode && (
                          <span className="text-xs text-muted-foreground italic">No members</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommended Suppliers */}
          {(vendors.length > 0 || isEditMode) && showVendors && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-violet-800 dark:text-violet-200 uppercase tracking-wide">
                  Recommended Suppliers ({vendors.length})
                </p>
                {isEditMode && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs gap-1 px-2"
                    onClick={() => openSupplierPicker({ mode: "add" })}
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                {vendors.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 bg-white dark:bg-violet-950/30 rounded px-2 py-1.5 border border-violet-100 dark:border-violet-800"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-foreground">{v.supplierName}</span>
                      {v.score != null && (
                        <span className="text-xs text-muted-foreground ml-1">
                          · Score: {v.score}/100
                        </span>
                      )}
                      {v.contactEmail && (
                        <span className="text-xs text-muted-foreground ml-1">
                          · {v.contactEmail}
                        </span>
                      )}
                      {v.reasons?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">
                          {v.reasons.slice(0, 1).join("; ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => openSupplierPicker({ mode: "replace", idx: i })}
                          disabled={disabled}
                          className="text-muted-foreground hover:text-violet-600 transition-colors p-0.5"
                          title="Replace"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeVendor(i)}
                        disabled={disabled}
                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {vendors.length === 0 && isEditMode && (
                  <p className="text-xs text-muted-foreground italic px-1">No suppliers yet. Click Add.</p>
                )}
              </div>
            </div>
          )}

          {/* Terms & Instructions */}
          {(clauses.length > 0 || isEditMode) && showClauses && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-violet-800 dark:text-violet-200 uppercase tracking-wide">
                Terms & Instructions ({clauses.length})
              </p>
              {(terms.length > 0 || isEditMode) && (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">
                      Terms ({terms.length})
                    </p>
                    {isEditMode && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-5 text-xs gap-1 px-1.5"
                        onClick={() => openClauseEditor(null, "terms")}
                        disabled={disabled}
                      >
                        <Plus className="h-2.5 w-2.5" />
                        Add
                      </Button>
                    )}
                  </div>
                  {terms.map((c, i) => {
                    const globalIdx = clauses.findIndex((cl) => cl === c);
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-white dark:bg-violet-950/30 rounded px-2 py-1.5 border border-violet-100 dark:border-violet-800"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground">{c.class_desc}</p>
                          {c.class_ref && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Ref: {c.class_ref}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => openClauseEditor(globalIdx)}
                              disabled={disabled}
                              className="text-muted-foreground hover:text-violet-600 transition-colors p-0.5"
                              title="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeClause(globalIdx)}
                            disabled={disabled}
                            className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                            title="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {terms.length === 0 && isEditMode && (
                    <p className="text-xs text-muted-foreground italic px-1">No terms yet.</p>
                  )}
                </div>
              )}
              {(instructions.length > 0 || isEditMode) && (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">
                      Instructions ({instructions.length})
                    </p>
                    {isEditMode && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-5 text-xs gap-1 px-1.5"
                        onClick={() => openClauseEditor(null, "instructions")}
                        disabled={disabled}
                      >
                        <Plus className="h-2.5 w-2.5" />
                        Add
                      </Button>
                    )}
                  </div>
                  {instructions.map((c, i) => {
                    const globalIdx = clauses.findIndex((cl) => cl === c);
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-white dark:bg-violet-950/30 rounded px-2 py-1.5 border border-violet-100 dark:border-violet-800"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground">{c.class_desc}</p>
                          {c.class_ref && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Ref: {c.class_ref}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => openClauseEditor(globalIdx)}
                              disabled={disabled}
                              className="text-muted-foreground hover:text-violet-600 transition-colors p-0.5"
                              title="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeClause(globalIdx)}
                            disabled={disabled}
                            className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                            title="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {instructions.length === 0 && isEditMode && (
                    <p className="text-xs text-muted-foreground italic px-1">
                      No instructions yet.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {totalItems === 0 && (
            <p className="text-xs text-muted-foreground italic">
              All items removed. Cancel or regenerate.
            </p>
          )}

          <div className={`flex flex-wrap items-center gap-2 pt-1 ${embedded ? "" : "border-t border-violet-100 dark:border-violet-800"}`}>
            {!embedded && (
              <Button
                size="sm"
                variant="outline"
                className={`gap-1 ${isEditMode ? "border-violet-400 text-violet-700" : ""}`}
                onClick={() => setIsEditMode((v) => !v)}
                disabled={disabled}
                data-testid="button-make-changes-remediation"
              >
                <Pencil className="h-3 w-3" />
                {isEditMode ? "Done Editing" : "Make Changes"}
              </Button>
            )}
            {!embedded && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => window.open(`/app/bids/${data.bidId}`, "_blank")}
                disabled={disabled}
                data-testid="button-preview-remediation"
              >
                <Eye className="h-3 w-3" />
                Preview
              </Button>
            )}
            {!hideApplyButton ? (
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white gap-1"
                onClick={() => onApply({ ...data, criteria, team, vendors, clauses })}
                disabled={disabled || (!embedded && totalItems === 0)}
                data-testid="button-apply-remediation"
              >
                <Check className="h-3 w-3" />
                {embedded ? "Apply AI Fixes & Re-check" : "Apply All Approved Changes"}
              </Button>
            ) : null}
            {onCancel && !embedded ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={onCancel}
                disabled={disabled}
                data-testid="button-cancel-remediation"
              >
                <X className="h-3 w-3" />
                Cancel
              </Button>
            ) : null}
          </div>
    </>
  );

  return (
    <>
      {embedded ? (
        <div className="space-y-3">{inner}</div>
      ) : (
        <Card className="border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-900/10 mt-2">
          <CardContent className="p-4 space-y-4">{inner}</CardContent>
        </Card>
      )}

      {/* Clause edit sheet */}
      <Sheet
        open={clauseSheetOpen}
        onOpenChange={(open) => {
          setClauseSheetOpen(open);
          if (!open) setEditingClauseIdx(null);
        }}
      >
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              {editingClauseIdx === null ? "Add Term / Instruction" : "Edit Term / Instruction"}
            </SheetTitle>
            <SheetDescription>
              {editingClauseIdx === null
                ? "Add a term or instruction clause before applying to the bid."
                : "Update the term or instruction details."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-4 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="rem-clause-type">Type</Label>
              <Select
                value={clauseForm.type}
                onValueChange={(v) => setClauseForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger id="rem-clause-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="terms">Terms</SelectItem>
                  <SelectItem value="instructions">Instructions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-clause-desc">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rem-clause-desc"
                value={clauseForm.class_desc}
                onChange={(e) =>
                  setClauseForm((f) => ({ ...f, class_desc: e.target.value }))
                }
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-clause-ref">Reference (Optional)</Label>
              <Input
                id="rem-clause-ref"
                value={clauseForm.class_ref}
                onChange={(e) =>
                  setClauseForm((f) => ({ ...f, class_ref: e.target.value }))
                }
              />
            </div>
          </div>
          <SheetFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setClauseSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveClause}>
              {editingClauseIdx === null ? "Add" : "Update"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Criterion edit sheet */}
      <Sheet open={criterionSheetOpen} onOpenChange={setCriterionSheetOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto" side="right">
          <SheetHeader>
            <SheetTitle>
              {editingCriterionIdx === null ? "Add Evaluation Criteria" : "Edit Evaluation Criteria"}
            </SheetTitle>
            <SheetDescription>
              Update evaluation criteria before applying to the bid.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-2 pb-6">
            <div>
              <Label htmlFor="rem-criteria-category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={criterionForm.category}
                onValueChange={(v) => setCriterionForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger id="rem-criteria-category">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rem-criteria-requirement">
                Requirement <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rem-criteria-requirement"
                placeholder="Enter Requirement"
                value={criterionForm.question}
                onChange={(e) => setCriterionForm((f) => ({ ...f, question: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Value</Label>
                <Select
                  value={criterionForm.qvoption}
                  onValueChange={(v) => setCriterionForm((f) => ({ ...f, qvoption: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Required">Required</SelectItem>
                    <SelectItem value="Optional">Optional</SelectItem>
                    <SelectItem value="Desirable">Desirable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Value Type</Label>
                <Select
                  value={criterionForm.qvtype}
                  onValueChange={(v) =>
                    setCriterionForm((f) => ({
                      ...f,
                      qvtype: v,
                      lovOptions: v === "Text" ? [] : f.lovOptions,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Text">Text</SelectItem>
                    <SelectItem value="Dropdown">Dropdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {criterionForm.qvtype === "Dropdown" && (
              <div>
                <Label>Dropdown Options</Label>
                <div className="border rounded-md">
                  {criterionForm.lovOptions.length > 0 && (
                    <div className="divide-y">
                      {criterionForm.lovOptions.map((opt, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-2 gap-2"
                        >
                          <span className="text-sm truncate">{opt}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-7 w-7"
                            onClick={() =>
                              setCriterionForm((f) => ({
                                ...f,
                                lovOptions: f.lovOptions.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 p-2 border-t">
                    <Input
                      placeholder="Enter option"
                      value={newLovOption}
                      onChange={(e) => setNewLovOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newLovOption.trim()) {
                          e.preventDefault();
                          setCriterionForm((f) => ({
                            ...f,
                            lovOptions: [...f.lovOptions, newLovOption.trim()],
                          }));
                          setNewLovOption("");
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!newLovOption.trim()}
                      onClick={() => {
                        if (newLovOption.trim()) {
                          setCriterionForm((f) => ({
                            ...f,
                            lovOptions: [...f.lovOptions, newLovOption.trim()],
                          }));
                          setNewLovOption("");
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="rem-criteria-weight">
                Weightage (Max Points) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rem-criteria-weight"
                type="number"
                min={1}
                max={90}
                step={1}
                value={criterionForm.weight}
                onChange={(e) => setCriterionForm((f) => ({ ...f, weight: e.target.value }))}
              />
            </div>
          </div>
          <SheetFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCriterionSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCriterion}>
              {editingCriterionIdx === null ? "Add" : "Update"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Team member picker */}
      <Sheet open={teamSheetOpen} onOpenChange={setTeamSheetOpen}>
        <SheetContent className="w-[400px] sm:max-w-[400px] flex flex-col p-0 gap-0">
          <SheetHeader className="px-6 pt-6 pb-4">
            <SheetTitle>
              {teamPickerContext?.mode === "replace" ? "Replace Team Member" : "Add Team Member"}
            </SheetTitle>
            <SheetDescription>
              {teamPickerContext?.teamType
                ? `Select a member for ${teamPickerContext.teamType}.`
                : "Select a team member."}
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6 flex-1 overflow-hidden flex flex-col">
            <Command className="flex-1 overflow-hidden">
              <CommandInput
                placeholder="Search members..."
                value={teamSearchQuery}
                onValueChange={setTeamSearchQuery}
              />
              <CommandList className="max-h-[60vh]">
                <CommandEmpty>No members found.</CommandEmpty>
                <CommandGroup>
                  {filteredUsers.map((u: any) => (
                    <CommandItem
                      key={u.id}
                      value={`${u.name} ${u.user_name} ${u.email_id}`}
                      onSelect={() => selectTeamMember(u)}
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {u.name || u.user_name}
                          </p>
                          {u.department_name && (
                            <p className="text-xs text-muted-foreground">{u.department_name}</p>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </SheetContent>
      </Sheet>

      <InviteSuppliersSheet
        open={supplierSheetOpen}
        onOpenChange={(open) => {
          setSupplierSheetOpen(open);
          if (!open) setSupplierPickerContext(null);
        }}
        excludeSupplierIds={excludeSupplierIds}
        selectionMode={supplierPickerContext?.mode === "replace" ? "single" : "multi"}
        title="Invite Suppliers"
        description="Select active suppliers to invite to this bid."
        confirmLabel={
          supplierPickerContext?.mode === "replace" ? "Replace Supplier" : undefined
        }
        onConfirm={handleSupplierConfirm}
      />
    </>
  );
}
