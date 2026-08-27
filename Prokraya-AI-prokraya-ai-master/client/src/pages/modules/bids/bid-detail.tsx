import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FmpBenchmarkCard, type FmpSnapshot } from "@/components/fmpi/fmp-benchmark-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import {
  InviteSuppliersSheet,
  mapApprovedSupplierToInvitePayload,
  type ApprovedSupplierRow,
} from "@/components/invite-suppliers-sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Clock,
  DollarSign,
  Edit,
  File,
  FolderTree,
  Gavel,
  Lightbulb,
  Loader2,
  Mail,
  MapPin,
  Package,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Scale,
  ScrollText,
  Search,
  Send,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  User,
  Users,
  X,
  Zap
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import BidFormSheet from "./bid-form-sheet";

const statusColors: Record<string, string> = {
  Draft: "secondary",
  Published: "default",
  Closed: "outline",
  Awarded: "default",
  Cancelled: "destructive",
  "In review": "secondary",
};

function StatusBadge({ status }: { status: string }) {
  const variant = (statusColors[status] || "secondary") as any;
  return <Badge variant={variant}>{status}</Badge>;
}

const bidTypeLabels: Record<string, string> = {
  RFQ: "Request for Quotation",
  RFP: "Request for Proposal",
  Tender: "Open Tender",
};

const AI_VENDOR_RECS_BATCH_SIZE = 3;

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function AIVendorRecsDialog({
  open,
  onOpenChange,
  recommendations,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recommendations: any[];
  onInvite: (ids: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const visibleRecommendations = recommendations.slice(
    visibleStartIndex,
    visibleStartIndex + AI_VENDOR_RECS_BATCH_SIZE,
  );
  const hasPreviousRecommendations = visibleStartIndex > 0;
  const hasMoreRecommendations =
    visibleStartIndex + AI_VENDOR_RECS_BATCH_SIZE < recommendations.length;

  useEffect(() => {
    if (open) {
      const initialRecommendations = recommendations.slice(0, AI_VENDOR_RECS_BATCH_SIZE);
      setVisibleStartIndex(0);
      setSelected(initialRecommendations.map((r) => r.supplierId));
    }
  }, [open, recommendations]);

  const loadMoreRecommendations = () => {
    const nextStartIndex = Math.min(
      visibleStartIndex + AI_VENDOR_RECS_BATCH_SIZE,
      recommendations.length,
    );
    const nextRecommendations = recommendations.slice(
      nextStartIndex,
      nextStartIndex + AI_VENDOR_RECS_BATCH_SIZE,
    );

    setVisibleStartIndex(nextStartIndex);
    setSelected(nextRecommendations.map((r) => r.supplierId));
  };

  const showPreviousRecommendations = () => {
    const previousStartIndex = Math.max(
      visibleStartIndex - AI_VENDOR_RECS_BATCH_SIZE,
      0,
    );
    const previousRecommendations = recommendations.slice(
      previousStartIndex,
      previousStartIndex + AI_VENDOR_RECS_BATCH_SIZE,
    );

    setVisibleStartIndex(previousStartIndex);
    setSelected(previousRecommendations.map((r) => r.supplierId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI-Recommended Suppliers
          </DialogTitle>
          <DialogDescription>
            Select suppliers to invite based on AI analysis of past bid
            performance
          </DialogDescription>
        </DialogHeader>
        {recommendations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium mb-1">
              No matching supplier recommendations at this time
            </p>
            <p className="text-xs">
              All approved suppliers may already be invited, or there isn't enough
              bid history for these categories. Please select suppliers manually.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleRecommendations.map((v: any) => (
              <div
                key={v.supplierId}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${selected.includes(v.supplierId) ? "border-purple-400 bg-purple-50/50 dark:bg-purple-950/20" : "hover:bg-muted/50"}`}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(v.supplierId)
                      ? prev.filter((id) => id !== v.supplierId)
                      : [...prev, v.supplierId],
                  )
                }
                data-testid={`card-ai-vendor-${v.supplierId}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(v.supplierId)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked
                              ? [...prev, v.supplierId]
                              : prev.filter((id) => id !== v.supplierId),
                          )
                        }
                      />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{v.supplierName}</p>
                      {v.contactEmail && (
                        <p className="text-xs text-muted-foreground">
                          {v.contactEmail}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                      <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                        {v.score}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 ml-9 flex flex-wrap gap-1">
                  {v.reasons?.slice(0, 3).map((r: string, i: number) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      {r}
                    </Badge>
                  ))}
                </div>
                <div className="mt-2 ml-9 flex gap-4 text-xs text-muted-foreground">
                  <span>{v.pastBidsParticipated} bids participated</span>
                  <span>{v.pastBidsWon} bids won</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {hasPreviousRecommendations && (
            <Button
              type="button"
              variant="outline"
              onClick={showPreviousRecommendations}
              data-testid="button-previous-ai-vendors"
            >
              Previous suggestions
            </Button>
          )}
          {hasMoreRecommendations && (
            <Button
              type="button"
              variant="outline"
              onClick={loadMoreRecommendations}
              data-testid="button-load-more-ai-vendors"
            >
              Load more suggestion
            </Button>
          )}
          <Button
            onClick={() => onInvite(selected)}
            disabled={selected.length === 0}
            data-testid="button-invite-ai-vendors"
          >
            <Users className="h-4 w-4 mr-2" />
            Invite {selected.length} Supplier(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReconciledItem {
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

function RegenerateReqDialog({
  open,
  onOpenChange,
  plan,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: ReconciledItem[];
  onApply: (selected: ReconciledItem[]) => void;
}) {
  // An item is "selectable" when applying it changes the DB (new / update / remove).
  const isSelectable = (item: ReconciledItem) => item.action !== "keep";
  // Every actionable change (new / update / remove) is checked by default.
  const defaultChecked = (item: ReconciledItem) => isSelectable(item);

  const [selected, setSelected] = useState<boolean[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(plan.map((item) => defaultChecked(item)));
      setApplying(false);
    }
  }, [open, plan]);

  const toggle = (idx: number) => {
    setSelected((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  // Projected weight total after applying: kept questions + selected non-removed changes.
  const projectedWeight = plan.reduce((sum, item, idx) => {
    if (item.action === "keep") return sum + item.weight;
    if (item.action === "remove") return sum; // removed → excluded
    // new / update: counts only if the user keeps it selected
    return sum + (selected[idx] ? item.weight : 0);
  }, 0);

  const changeCount = plan.filter((item, idx) => isSelectable(item) && selected[idx]).length;

  const handleApply = async () => {
    const chosen = plan.filter((item, idx) => item.action === "keep" || selected[idx]);
    setApplying(true);
    try {
      await onApply(chosen);
    } finally {
      setApplying(false);
    }
  };

  const cardClasses = (item: ReconciledItem, checked: boolean) => {
    if (item.action === "remove") {
      return "border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20";
    }
    if (item.action === "new") {
      return "border-purple-400 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-950/20";
    }
    if (item.action === "update") {
      return "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20";
    }
    // keep
    return item.origin === "ai"
      ? "border-purple-200 bg-purple-50/30 dark:border-purple-900 dark:bg-purple-950/10"
      : "border-border bg-background";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-purple-600" />
            Regenerated Evaluation Criteria
          </DialogTitle>
          <DialogDescription>
            Review the AI's suggested changes below. All changes are selected by default — uncheck
            any you don't want to apply.
          </DialogDescription>
        </DialogHeader>

        {plan.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Scale className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No changes suggested</p>
          </div>
        ) : (
          <div className="space-y-2">
            {plan.map((item, idx) => {
              const checked = selected[idx] || false;
              const selectable = isSelectable(item);
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 transition-colors ${cardClasses(item, checked)} ${
                    selectable ? "cursor-pointer" : ""
                  } ${selectable && !checked ? "opacity-70" : ""}`}
                  onClick={() => selectable && toggle(idx)}
                  data-testid={`card-regen-${idx}`}
                >
                  <div className="flex items-start gap-3">
                    {selectable ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(idx)}
                          data-testid={`checkbox-regen-${idx}`}
                        />
                      </div>
                    ) : (
                      <div className="w-4" />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Status badges */}
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

                      {/* Question text */}
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

                      {/* Meta */}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || plan.length === 0}
            className="gap-1.5"
            data-testid="button-apply-regenerated"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Apply Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AIReqPreviewDialog({
  open,
  onOpenChange,
  requirements,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requirements: any[];
  onAdd: (reqs: any[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    if (open) setSelected(requirements.map((_, i) => i));
  }, [open, requirements]);

  const selectedWeight = selected.reduce(
    (sum, idx) => sum + (parseInt(requirements[idx]?.weight, 10) || 0),
    0,
  );

  const categoryColor = (cat: string) => {
    if (cat === "Technical") return "secondary";
    if (cat === "Finance") return "outline";
    return "outline";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI-Generated Evaluation Criteria
          </DialogTitle>
          <DialogDescription>
            Review and select the criteria you want to add to your bid. Selected
            criteria will consume{" "}
            <span className="font-semibold text-foreground">
              {selectedWeight} weight point{selectedWeight !== 1 ? "s" : ""}
            </span>{" "}
            from your remaining budget.
          </DialogDescription>
        </DialogHeader>

        {requirements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Scale className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No criteria generated</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requirements.map((req: any, idx: number) => (
              <div
                key={idx}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${selected.includes(idx) ? "border-purple-400 bg-purple-50/50 dark:bg-purple-950/20" : "hover:bg-muted/50"}`}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(idx)
                      ? prev.filter((i) => i !== idx)
                      : [...prev, idx],
                  )
                }
                data-testid={`card-ai-req-${idx}`}
              >
                <div className="flex items-start gap-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(idx)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) =>
                          checked
                            ? [...prev, idx]
                            : prev.filter((i) => i !== idx),
                        )
                      }
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Row 1: category, type, weight */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge
                        variant={
                          req.category === "General" ? "secondary" : "outline"
                        }
                        className="text-xs"
                      >
                        {req.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {req.qvtype}
                      </Badge>
                      <span className="text-xs font-medium text-purple-700 dark:text-purple-400 ml-auto">
                        Weight: {req.weight}
                      </span>
                    </div>

                    {/* Row 2: question */}
                    <p className="text-sm font-medium">{req.question}</p>

                    {/* Row 3: expected value */}
                    {req.value && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Expected:</span>{" "}
                        {req.value}
                      </p>
                    )}

                    {/* Row 4: dropdown options (shown only when type=Dropdown) */}
                    {req.qvtype === "Dropdown" &&
                      Array.isArray(req.lovOptions) &&
                      req.lovOptions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {req.lovOptions.map((opt: string, oi: number) => (
                            <span
                              key={oi}
                              className="inline-block text-xs bg-muted px-2 py-0.5 rounded"
                            >
                              {opt}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Weight summary banner */}
        {selected.length > 0 && (
          <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-3 py-2 text-xs text-purple-800 dark:text-purple-300">
            <span className="font-semibold">{selected.length}</span> criteria
            selected ·{" "}
            <span className="font-semibold">{selectedWeight}</span> total weight
            points will be added
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onAdd(selected.map((i) => requirements[i]))}
            disabled={selected.length === 0}
            data-testid="button-add-ai-criteria"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add {selected.length} Criteria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AIClausePreviewDialog({
  open,
  onOpenChange,
  clauses,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clauses: any[];
  onAdd: (clauses: any[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    if (open) setSelected(clauses.map((_, i) => i));
  }, [open, clauses]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI-Generated Terms & Instructions
          </DialogTitle>
          <DialogDescription>
            Review and select clauses to add to your bid
          </DialogDescription>
        </DialogHeader>
        {clauses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No clauses generated</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clauses.map((clause: any, idx: number) => (
              <div
                key={idx}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${selected.includes(idx) ? "border-purple-400 bg-purple-50/50 dark:bg-purple-950/20" : "hover:bg-muted/50"}`}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(idx)
                      ? prev.filter((i) => i !== idx)
                      : [...prev, idx],
                  )
                }
                data-testid={`card-ai-clause-${idx}`}
              >
                <div className="flex items-start gap-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(idx)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) =>
                          checked
                            ? [...prev, idx]
                            : prev.filter((i) => i !== idx),
                        )
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          clause.type === "terms" ? "secondary" : "outline"
                        }
                        className="text-xs capitalize"
                      >
                        {clause.type}
                      </Badge>
                      {clause.class_ref && (
                        <span className="text-xs text-muted-foreground">
                          Ref: {clause.class_ref}
                        </span>
                      )}
                    </div>
                    <p className="text-sm">{clause.class_desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onAdd(selected.map((i) => clauses[i]))}
            disabled={selected.length === 0}
            data-testid="button-add-ai-clauses"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add {selected.length} Clause(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Organization {
  id: number;
  organization_name: string;
}

interface LookupItem {
  value: string;
  label: string;
}

export default function BidDetail() {
  const [, params] = useRoute("/app/bids/:id");
  const bidId = params?.id;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("lines");
  const [addLineSheetOpen, setAddLineSheetOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<any>(null);
  const [itemEntryMode, setItemEntryMode] = useState<"master" | "freetext">(
    "master",
  );
  const [itemOpen, setItemOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [showAddSupplierDialog, setShowAddSupplierDialog] = useState(false);
  const [showAddRequirementDialog, setShowAddRequirementDialog] =
    useState(false);
  const [editingRequirement, setEditingRequirement] = useState<any>(null);
  const [showAddClauseDialog, setShowAddClauseDialog] = useState(false);
  const [teamSearchOpen, setTeamSearchOpen] = useState<Record<string, boolean>>(
    {},
  );
  const [teamSearchQuery, setTeamSearchQuery] = useState<
    Record<string, string>
  >({});
  const [showAddAttachmentDialog, setShowAddAttachmentDialog] = useState(false);
  const [showCriteriaAttachmentDialog, setShowCriteriaAttachmentDialog] =
    useState(false);
  const [showEditHeaderDialog, setShowEditHeaderDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: string;
    id: number;
  } | null>(null);
  const [, navigate] = useLocation();
  const [editAutoOpened, setEditAutoOpened] = useState(false);

  const [showAIStrategyDialog, setShowAIStrategyDialog] = useState(false);
  const [aiStrategy, setAiStrategy] = useState<any>(null);
  const [aiStrategyLoading, setAiStrategyLoading] = useState(false);
  const aiStrategyFingerprintRef = useRef<string | null>(null);
  const [showAIVendorPanel, setShowAIVendorPanel] = useState(false);
  const [aiVendorRecs, setAiVendorRecs] = useState<any[]>([]);
  const [aiVendorLoading, setAiVendorLoading] = useState(false);
  const [aiReqLoading, setAiReqLoading] = useState(false);
  const [aiReqPreview, setAiReqPreview] = useState<any[]>([]);
  const [showAIReqPreview, setShowAIReqPreview] = useState(false);
  // Regenerate / re-evaluate evaluation criteria (triggered by line/question/document changes)
  const [regenerateAvailable, setRegenerateAvailable] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenPlan, setRegenPlan] = useState<any[]>([]);
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [aiClauseLoading, setAiClauseLoading] = useState(false);
  const [aiTeamSuggestionLoading, setAiTeamSuggestionLoading] = useState(false);
  const [aiClausePreview, setAiClausePreview] = useState<any[]>([]);
  const [showAIClausePreview, setShowAIClausePreview] = useState(false);
  const [lineForm, setLineForm] = useState({
    linetype: "Goods",
    description: "",
    uom: "EA",
    quantity: "1",
    currentprice: "0",
    currency: "INR",
    categoryCode: "",
    categoryName: "",
    itemId: "",
    itemName: "",
    needbyfrom: "",
    needbyto: "",
    itemCode: "",
  });
  // Item the FMP benchmark was explicitly requested for. Null = trigger armed.
  const [fmpRequestedItemKey, setFmpRequestedItemKey] = useState<string | null>(
    null,
  );

  const sanitizeDecimalInput = (value: string) =>
    value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
  const sanitizeIntegerInput = (value: string) => value.replace(/\D/g, "");
  const preventInvalidNumberKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (["e", "E", "-", "+"].includes(e.key)) {
      e.preventDefault();
    }
  };
  const [reqForm, setReqForm] = useState({
    category: "",
    question: "",
    qvoption: "Required",
    qvtype: "Text",
    weight: "100",
    lovOptions: [] as string[],
  });
  const [newLovOption, setNewLovOption] = useState("");
  const [clauseForm, setClauseForm] = useState({
    type: "terms",
    class_desc: "",
    class_ref: "",
  });
  const [attachForm, setAttachForm] = useState({
    attach_name: "",
    attach_desc: "",
    attach_source: "Lines",
    attach_type: "application/pdf",
  });
  const [criteriaAttachForm, setCriteriaAttachForm] = useState({
    attach_name: "",
    attach_desc: "",
    attach_source: "Requirements",
    attach_type: "application/pdf",
  });
  const [selectedCriteriaFile, setSelectedCriteriaFile] =
    useState<globalThis.File | null>(null);
  const [showTermsAttachmentDialog, setShowTermsAttachmentDialog] =
    useState(false);
  const [termsAttachForm, setTermsAttachForm] = useState({
    attach_name: "",
    attach_desc: "",
    attach_source: "Terms",
    attach_type: "application/pdf",
  });
  const [selectedTermsFile, setSelectedTermsFile] =
    useState<globalThis.File | null>(null);
  const [editBidInitialData, setEditBidInitialData] = useState<any>(null);

  const [showProxySheet, setShowProxySheet] = useState(false);
  const [proxySupplier, setProxySupplier] = useState<any>(null);
  const [proxyLines, setProxyLines] = useState<Record<number, { bidprice: string; discprice: string; promisedDate: string }>>({});
  const [proxyRequirements, setProxyRequirements] = useState<Record<number, { answer: string; remarks: string }>>({});
  const [proxyComments, setProxyComments] = useState("");
  const [proxyRefNumber, setProxyRefNumber] = useState("");
  const [proxyActiveTab, setProxyActiveTab] = useState("financial");

  const { isAIEnabled } = useAISettings();

  const { data: bid, isLoading } = useQuery<any>({
    queryKey: ["/api/dbo/bids", bidId],
    enabled: !!bidId,
  });

  const { data: businessCategories } = useQuery<LookupItem[]>({
    queryKey: ["/api/lookups/by-property/BID_REQ_CATEGORIES"],
    select: (data: any[]) => data.map(d => ({ value: d.lookup_key, label: d.description })),
  });

  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem("currentTaskId");
    setTaskId(storedTaskId);
  }, []);

  const processApprovalMutation = useMutation({
    mutationFn: async ({
      result,
      comments,
    }: {
      result: string;
      comments: string;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/processBidApprovalStep/${taskId}?result=${result}&comments=${comments}&bidRefNo=${bidId}`,
        {},
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Approval step processed successfully.",
      });
      sessionStorage.removeItem("currentTaskId");
      navigate("/app/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: lines } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "lines"],
    enabled: !!bidId,
  });

  const { data: suppliers } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "suppliers"],
    enabled: !!bidId,
  });

  const { data: requirements } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "requirements"],
    enabled: !!bidId,
  });

  const { data: clauses } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "clauses"],
    enabled: !!bidId,
  });

  const { data: approvers } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "approvers"],
    enabled: !!bidId,
  });

  const { data: allUsers } = useQuery<any[]>({
    queryKey: ["/api/users/dropdown"],
    enabled: !!bidId,
  });

  const { data: attachments } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "attachments"],
    enabled: !!bidId,
  });

  const { data: usersData } = useQuery<
    {
      id: number;
      user_id: string;
      user_name: string;
      name: string;
      email_id: string;
      department_name: string | null;
      user_type: number;
    }[]
  >({
    queryKey: ["/api/users/dropdown"],
  });
  const { data: locationsData } = useQuery<
    { id: number; location_name: string; location_id: string }[]
  >({
    queryKey: ["/api/locations"],
  });
  const { data: paymentTermsData } = useQuery<{
    data: {
      id: number;
      payment_term_id: string;
      terms_name: string;
      status: string;
    }[];
  }>({
    queryKey: ["/api/payment-terms?limit=100"],
  });
  const users = (usersData || []).filter((u) => u.user_type === 0);
  const locations = locationsData || [];
  const paymentTerms = (paymentTermsData?.data || []).filter(
    (pt) => pt.status === "Y",
  );

  const { data: categoryTypeLookups = [] } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/CATEGORY_TYPE"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const categoryTypeLookup = categoryTypeLookups.find(
    (l) => l.lookup_key === "CATEGORY",
  );
  const isNonUnspsc = categoryTypeLookup?.lookup_value === "NON-UNSPSC";

  const { data: productCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/product-categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/product-categories");
      if (!res.ok) throw new Error("Failed to fetch product categories");
      return res.json();
    },
    enabled: isNonUnspsc && (addLineSheetOpen || showAddSupplierDialog),
  });

  const { data: categoriesData } = useQuery<
    { id: string; code: string; name: string; level: string }[]
  >({
    queryKey: ["/api/categories"],
    enabled: !isNonUnspsc && (addLineSheetOpen || showAddSupplierDialog),
  });

  const categories = isNonUnspsc
    ? productCategories.map((pc: any) => ({
      id: String(pc.category_id || pc.categoryId || pc.id),
      code: pc.category_code || pc.categoryCode || String(pc.category_id || pc.categoryId || pc.id),
      name: pc.category_name || pc.categoryName || pc.name,
      level: "1",
    }))
    : categoriesData || [];

  const { data: itemsData } = useQuery<
    {
      id: string;
      itemCode: string;
      name: string;
      categoryCode: string;
      categoryName: string;
      unitOfMeasure: string;
      standardPrice: number | null;
    }[]
  >({
    queryKey: ["/api/items"],
    enabled: addLineSheetOpen && itemEntryMode === "master",
  });
  const items = itemsData || [];

  const { data: uomData } = useQuery<{ id: number; description: string }[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: addLineSheetOpen,
  });
  const uomOptions = uomData || [];

  // True only while the item the benchmark was requested for is still the one
  // in the sheet — picking a different item re-arms the trigger button.
  const fmpRequested =
    !!lineForm.itemId && fmpRequestedItemKey === lineForm.itemId;

  const fmpDeliveryLocation =
    bid?.delivertto_location_name || bid?.shiptoaddress || "";

  // Fair Market Price Intelligence — re-analyses the currently selected line
  // item on every explicit user action. Deliberately POSTs /recalculate rather
  // than GET /snapshot: the GET is cache-first (returns the stored row for
  // STALE_DAYS), so clicking the button would replay an old scrape instead of
  // re-analysing. staleTime/gcTime 0 does the same job on the client — the
  // React Query defaults are staleTime: Infinity, which would otherwise serve
  // the previous result for an item the user already benchmarked this session.
  const {
    data: fmpSnapshot,
    isFetching: fmpFetching,
    isError: fmpFailed,
    refetch: refetchFmpSnapshot,
  } = useQuery<FmpSnapshot>({
    queryKey: [
      "/api/fmpi/recalculate",
      lineForm.itemId,
      lineForm.currency,
      lineForm.description,
      fmpDeliveryLocation,
      lineForm.quantity,
    ],
    queryFn: () =>
      apiRequest("POST", "/api/fmpi/recalculate", {
        itemId: lineForm.itemId,
        itemName: lineForm.itemName || "",
        itemDescription: lineForm.description || lineForm.itemName || "",
        categoryCode: lineForm.categoryCode || "",
        categoryName: lineForm.categoryName || "",
        currency: lineForm.currency || bid?.currency || "INR",
        uom: lineForm.uom || "",
        deliveryLocation: fmpDeliveryLocation || undefined,
        quantity: lineForm.quantity ? Number(lineForm.quantity) : 1,
        // Publish the result against this bid line so suppliers can be shown the
        // same benchmark. Only possible for a saved line — new lines get their
        // snapshot from the backfill that runs when the toggle is switched on.
        ...(editingLine?.id ? { docType: "BID", docId: bidId, docLineId: editingLine.id } : {}),
      }).then((r) => r.json()),
    enabled: fmpRequested && isAIEnabled("AI_FMP_INTELLIGENCE"),
    staleTime: 0,
    gcTime: 0,
  });

  // Bid-wide switch that publishes the fair market price to invited suppliers.
  // It lives in the line dialog because that is where the buyer is looking at
  // the number, but the flag is stored on the bid — turning it on backfills a
  // benchmark for every line that doesn't have one yet, so the suppliers never
  // see a half-filled sheet.
  const fmpVisibilityMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest(
        "PUT",
        `/api/dbo/bids/${bidId}/fmp-visibility`,
        { enabled },
      );
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
      const enabled = !!data?.showFmpToSupplier;
      const pending = Number(data?.pendingBenchmarks) || 0;
      toast({
        title: enabled ? "FMPI shared with suppliers" : "FMPI hidden from suppliers",
        description: enabled
          ? pending > 0
            ? `Suppliers can now see the fair market price on each line. Benchmarking ${pending} more line item${pending === 1 ? "" : "s"} in the background.`
            : "Suppliers can now see the fair market price on each line of this bid."
          : "Suppliers can no longer see the fair market price on this bid.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update FMPI visibility.",
        variant: "destructive",
      });
    },
  });

  const resetLineForm = () => {
    setLineForm({
      linetype: "Goods",
      description: "",
      uom: "EA",
      quantity: "1",
      currentprice: "0",
      currency: bid?.currency || "INR",
      categoryCode: "",
      categoryName: "",
      itemId: "",
      itemName: "",
      needbyfrom: "",
      needbyto: "",
      itemCode: "",
    });
    setItemEntryMode("master");
    setFmpRequestedItemKey(null);
  };

  const addLineMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/lines`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "lines"],
      });
      setRegenerateAvailable(true);
      toast({ title: "Line Added", description: "Bid line has been added." });
      setAddLineSheetOpen(false);
      resetLineForm();
    },
    onError: (response: any) => {
      toast({
        title: "Error",
        description: response.message,
        variant: "destructive",
      });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (lineId: number) => {
      await apiRequest("DELETE", `/api/dbo/bids/${bidId}/lines/${lineId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "lines"],
      });
      setRegenerateAvailable(true);
      toast({
        title: "Line Removed",
        description: "Bid line has been removed.",
      });
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, data }: { lineId: number; data: any }) => {
      const response = await apiRequest(
        "PUT",
        `/api/dbo/bids/${bidId}/lines/${lineId}`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "lines"],
      });
      setRegenerateAvailable(true);
      toast({ title: "Line Updated", description: "Bid line has been updated." });
      setAddLineSheetOpen(false);
      setEditingLine(null);
      resetLineForm();
    },
    onError: (response: any) => {
      toast({
        title: "Error",
        description: response.message,
        variant: "destructive",
      });
    },
  });

  const addSupplierMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/suppliers`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "suppliers"],
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to invite supplier.",
        variant: "destructive",
      });
    },
  });

  const inviteSelectedSuppliers = async (selected: ApprovedSupplierRow[]) => {
    for (const s of selected) {
      await addSupplierMutation.mutateAsync(mapApprovedSupplierToInvitePayload(s));
    }
    toast({
      title: "Suppliers Invited",
      description: `${selected.length} supplier(s) have been invited to this bid.`,
    });
    setShowAddSupplierDialog(false);
  };

  const deleteSupplierMutation = useMutation({
    mutationFn: async (suppId: number) => {
      await apiRequest("DELETE", `/api/dbo/bids/${bidId}/suppliers/${suppId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "suppliers"],
      });
      toast({
        title: "Supplier Removed",
        description: "Supplier has been removed.",
      });
    },
  });

  const addRequirementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/requirements`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "requirements"],
      });
      setRegenerateAvailable(true);
      toast({
        title: "Criteria Added",
        description: "Evaluation criteria has been added.",
      });
      setShowAddRequirementDialog(false);
      setReqForm({
        category: "",
        question: "",
        qvoption: "Required",
        qvtype: "Text",
        weight: "100",
        lovOptions: [],
      });
      setNewLovOption("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add criteria.",
        variant: "destructive",
      });
    },
  });

  const updateRequirementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "PUT",
        `/api/dbo/bids/${bidId}/requirements/${editingRequirement.id}`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "requirements"],
      });
      setRegenerateAvailable(true);
      toast({
        title: "Criteria Updated",
        description: "Evaluation criteria has been updated.",
      });
      setShowAddRequirementDialog(false);
      setEditingRequirement(null);
      setReqForm({
        category: "",
        question: "",
        qvoption: "Required",
        qvtype: "Text",
        weight: "100",
        lovOptions: [],
      });
      setNewLovOption("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update criteria.",
        variant: "destructive",
      });
    },
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: async (reqId: number) => {
      await apiRequest(
        "DELETE",
        `/api/dbo/bids/${bidId}/requirements/${reqId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "requirements"],
      });
      setRegenerateAvailable(true);
      toast({
        title: "Criteria Removed",
        description: "Evaluation criteria has been removed.",
      });
    },
  });

  const getBidDataFingerprint = () => {
    const lineItems = lines || [];
    const categories = Array.from(
      new Set(lineItems.map((l: any) => l.product_category).filter(Boolean))
    ).sort();
    const descriptions = lineItems
      .map((l: any) => `${l.description}|${l.quantity}|${l.currentprice}`)
      .sort();
    const supplierIds = (suppliers || [])
      .map((s: any) => s.supplier_id)
      .sort();
    return JSON.stringify({ categories, descriptions, supplierIds });
  };

  const fetchAIStrategy = async () => {
    const lineItems = lines || [];
    if (lineItems.length === 0) {
      toast({
        title: "No Line Items",
        description: "Add at least one line item before running the AI Strategy Advisor.",
        variant: "destructive",
      });
      return;
    }

    const currentFingerprint = getBidDataFingerprint();
    if (aiStrategy && aiStrategyFingerprintRef.current === currentFingerprint) {
      setShowAIStrategyDialog(true);
      return;
    }

    setAiStrategyLoading(true);
    try {
      const categories = Array.from(
        new Set(lineItems.map((l: any) => l.product_category).filter(Boolean)),
      );
      const itemDescriptions = lineItems
        .map((l: any) => l.description)
        .filter(Boolean);
      const supplierIds = (suppliers || [])
        .map((s: any) => parseInt(String(s.supplier_id), 10))
        .filter((id) => !isNaN(id) && id > 0);
      const res = await apiRequest("POST", "/api/dbo/bids/ai/strategy", {
        bidId,
        categories,
        itemDescriptions,
        supplierIds,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Could not generate strategy recommendations.");
      }
      const data = await res.json();
      setAiStrategy(data);
      aiStrategyFingerprintRef.current = currentFingerprint;
      setShowAIStrategyDialog(true);
    } catch (e: any) {
      toast({
        title: "AI Strategy Advisor",
        description: e?.message || "Could not generate strategy recommendations.",
        variant: "destructive",
      });
    } finally {
      setAiStrategyLoading(false);
    }
  };

  const fetchAIVendorRecs = async () => {
    setAiVendorLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/ai/vendor-recommendations`,
        {},
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length === 0) {
        setAiVendorRecs([]);
        setShowAIVendorPanel(true);
      } else {
        setAiVendorRecs(data);
        setShowAIVendorPanel(true);
      }
    } catch (e) {
      setAiVendorRecs([]);
      setShowAIVendorPanel(true);
    } finally {
      setAiVendorLoading(false);
    }
  };

  const fetchAIRequirements = async () => {
    // Client-side pre-call validation: check total existing weight
    const currentTotal = (requirements || []).reduce((sum: number, r: any) => {
      const w = parseInt(r.weight || "0", 10);
      return sum + (isNaN(w) ? 0 : w);
    }, 0);

    if (currentTotal >= 100) {
      toast({
        title: "Cannot Generate AI Criteria",
        description:
          "Total weightage already equals 100. Reduce existing criteria weights before generating AI suggestions.",
        variant: "destructive",
      });
      return;
    }

    setAiReqLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/ai/generate-requirements`,
        {},
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Could not generate requirements.");
      }

      const data = await res.json();
      if (!data || data.length === 0) {
        toast({
          title: "AI Criteria",
          description:
            "No criteria could be generated. The remaining weight budget may be too small.",
          variant: "destructive",
        });
        return;
      }
      setAiReqPreview(data);
      setShowAIReqPreview(true);
    } catch (e: any) {
      toast({
        title: "AI Error",
        description: e?.message || "Could not generate requirements.",
        variant: "destructive",
      });
    } finally {
      setAiReqLoading(false);
    }
  };

  const fetchAIClauses = async () => {
    setAiClauseLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/ai/generate-clauses`,
        {},
      );
      const data = await res.json();
      setAiClausePreview(data);
      setShowAIClausePreview(true);
    } catch (e) {
      toast({
        title: "AI Error",
        description: "Could not generate terms & instructions.",
        variant: "destructive",
      });
    } finally {
      setAiClauseLoading(false);
    }
  };

  const fetchAITeamSuggestion = async () => {
    if (!bidId) return;
    if (!requirements || requirements.length === 0) {
      toast({
        title: "AI Team Suggestion",
        description: "No evaluation criteria added",
        variant: "destructive",
      });
      return;
    }
    setAiTeamSuggestionLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/ai/evaluation-team-suggestion`,
        {},
      );
      const data = await res.json();
      const added = Number(data?.added || 0);
      const message =
        data?.message ||
        (added > 0
          ? `Added ${added} member(s).`
          : "No eligible team members were added.");

      const toastPayload: any = {
        title: added > 0 ? "AI Team Suggestion Added" : "AI Team Suggestion",
        description: message,
      };
      if (added === 0) {
        toastPayload.variant = "destructive";
      }
      toast(toastPayload);

      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "approvers"],
      });
    } catch (e: any) {
      toast({
        title: "AI Team Suggestion",
        description: e?.message || "No evaluation criteria added ",
        variant: "destructive",
      });
    } finally {
      setAiTeamSuggestionLoading(false);
    }
  };

  const addAIClauses = async (selectedClauses: any[]) => {
    for (const clause of selectedClauses) {
      await addClauseMutation.mutateAsync(clause);
    }
    setShowAIClausePreview(false);
    setAiClausePreview([]);
    toast({
      title: "AI Clauses Added",
      description: `${selectedClauses.length} terms & instructions have been added.`,
    });
  };

  const addAIRequirements = async (selectedReqs: any[]) => {
    for (const req of selectedReqs) {
      // Build the lov string from lovOptions array (comma-separated)
      const lovString =
        req.qvtype === "Dropdown" &&
        Array.isArray(req.lovOptions) &&
        req.lovOptions.length > 0
          ? req.lovOptions.join(",")
          : null;

      await addRequirementMutation.mutateAsync({
        category: req.category,
        question: req.question,
        qvoption: "Required",
        qvtype: req.qvtype || "Text",
        // Use the AI-generated weight directly (already normalized to remaining budget)
        weight: String(req.weight || 1),
        // Save the expected value/benchmark into the target field
        target: req.value || null,
        lov: lovString,
      });
    }
    setShowAIReqPreview(false);
    setAiReqPreview([]);
    // Adding AI-generated criteria reuses addRequirementMutation, which trips the
    // regenerate flag. The questions are in sync right after generating+adding, so
    // clear it to avoid immediately prompting the user to regenerate.
    setRegenerateAvailable(false);
    toast({
      title: "AI Criteria Added",
      description: `${selectedReqs.length} evaluation criteria have been added successfully.`,
    });
  };

  const fetchRegenerate = async () => {
    setRegenLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/ai/regenerate-requirements`,
        {},
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Could not regenerate evaluation criteria.");
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        toast({
          title: "Regenerate Evaluation Criteria",
          description: "No changes were suggested for the current evaluation criteria.",
        });
        setRegenerateAvailable(false);
        return;
      }
      setRegenPlan(data);
      setShowRegenDialog(true);
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

  const applyRegenerated = async (selectedActions: any[]) => {
    const actionable = selectedActions.filter((a) => a.action !== "keep");
    if (actionable.length === 0) {
      setShowRegenDialog(false);
      setRegenPlan([]);
      setRegenerateAvailable(false);
      return;
    }
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/ai/apply-regenerated-requirements`,
        { actions: actionable },
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Could not apply the regenerated criteria.");
      }
      const summary = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "requirements"],
      });
      setShowRegenDialog(false);
      setRegenPlan([]);
      setRegenerateAvailable(false);
      toast({
        title: "Evaluation Criteria Updated",
        description: `Added ${summary.created ?? 0}, updated ${summary.updated ?? 0}, removed ${summary.removed ?? 0}.`,
      });
    } catch (e: any) {
      toast({
        title: "AI Error",
        description: e?.message || "Could not apply the regenerated criteria.",
        variant: "destructive",
      });
    }
  };

  const inviteAIVendors = async (vendorIds: number[]) => {
    const recsToInvite = aiVendorRecs.filter((v) =>
      vendorIds.includes(v.supplierId),
    );
    for (const v of recsToInvite) {
      await addSupplierMutation.mutateAsync({
        supplier_id: v.supplierId,
        supplier_name: v.supplierName,
        supplier_site: v.supplierSite || `${v.supplierName}`,
        supplier_contact: v.contactName || "",
        supplier_contact_email: v.contactEmail || "",
        supplier_contact_no: "",
      });
    }
    toast({
      title: "Suppliers Invited",
      description: `${recsToInvite.length} AI-recommended supplier(s) invited.`,
    });
    setShowAIVendorPanel(false);
    setAiVendorRecs([]);
  };

  const addClauseMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/clauses`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "clauses"],
      });
      toast({
        title: "Clause Added",
        description: "Terms/Instructions clause has been added.",
      });
      setShowAddClauseDialog(false);
      setClauseForm({ type: "terms", class_desc: "", class_ref: "" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add clause.",
        variant: "destructive",
      });
    },
  });

  const deleteClauseMutation = useMutation({
    mutationFn: async (clauseId: number) => {
      await apiRequest("DELETE", `/api/dbo/bids/${bidId}/clauses/${clauseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "clauses"],
      });
      toast({
        title: "Clause Removed",
        description: "Clause has been removed.",
      });
    },
  });

  const addTeamMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/team`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "approvers"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to add team member.",
        variant: "destructive",
      });
    },
  });

  const deleteApproverMutation = useMutation({
    mutationFn: async (approverId: number) => {
      await apiRequest(
        "DELETE",
        `/api/dbo/bids/${bidId}/approvers/${approverId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "approvers"],
      });
      toast({
        title: "Member Removed",
        description: "Team member has been removed.",
      });
    },
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const addAttachmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      if (selectedFile) {
        formData.append("file", selectedFile);
      }
      formData.append("attach_desc", data.attach_desc || "");
      formData.append("attach_source", data.attach_source || "Lines");
      formData.append("attach_name", data.attach_name || "");
      formData.append("attach_type", data.attach_type || "application/pdf");
      const response = await apiRequest("POST", `/api/dbo/bids/${bidId}/attachments`, formData);
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "attachments"],
      });
      setRegenerateAvailable(true);
      toast({
        title: "Attachment Added",
        description: "Document has been attached successfully.",
      });
      setShowAddAttachmentDialog(false);
      setAttachForm({
        attach_name: "",
        attach_desc: "",
        attach_source: "Lines",
        attach_type: "application/pdf",
      });
      setSelectedFile(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add attachment.",
        variant: "destructive",
      });
    },
  });

  const addCriteriaAttachmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      if (selectedCriteriaFile) {
        formData.append("file", selectedCriteriaFile);
      }
      formData.append("attach_desc", data.attach_desc || "");
      formData.append("attach_source", "Requirements");
      formData.append("attach_name", data.attach_name || "");
      formData.append("attach_type", data.attach_type || "application/pdf");
      const response = await apiRequest("POST", `/api/dbo/bids/${bidId}/attachments`, formData);
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "attachments"],
      });
      setRegenerateAvailable(true);
      toast({
        title: "Attachment Added",
        description: "Criteria document has been attached successfully.",
      });
      setShowCriteriaAttachmentDialog(false);
      setCriteriaAttachForm({
        attach_name: "",
        attach_desc: "",
        attach_source: "Requirements",
        attach_type: "application/pdf",
      });
      setSelectedCriteriaFile(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add attachment.",
        variant: "destructive",
      });
    },
  });

  const addTermsAttachmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      if (selectedTermsFile) {
        formData.append("file", selectedTermsFile);
      }
      formData.append("attach_desc", data.attach_desc || "");
      formData.append("attach_source", "Terms");
      formData.append("attach_name", data.attach_name || "");
      formData.append("attach_type", data.attach_type || "application/pdf");
      const response = await apiRequest("POST", `/api/dbo/bids/${bidId}/attachments`, formData);
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "attachments"],
      });
      toast({
        title: "Attachment Added",
        description: "Terms document has been attached successfully.",
      });
      setShowTermsAttachmentDialog(false);
      setTermsAttachForm({
        attach_name: "",
        attach_desc: "",
        attach_source: "Terms",
        attach_type: "application/pdf",
      });
      setSelectedTermsFile(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add attachment.",
        variant: "destructive",
      });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachId: number) => {
      await apiRequest(
        "DELETE",
        `/api/dbo/bids/${bidId}/attachments/${attachId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "attachments"],
      });
      setRegenerateAvailable(true);
      toast({
        title: "Attachment Removed",
        description: "Attachment has been removed.",
      });
    },
  });

  const deleteBidMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/dbo/bids/${bidId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      toast({
        title: "Bid Deleted",
        description: "The bid has been permanently deleted.",
      });
      navigate("/app/bids");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete bid.",
        variant: "destructive",
      });
    },
  });

  const handlePublish = () => {
    if (!bid.startdate) return;

    const now = new Date();
    const startDate = new Date(bid.startdate);

    if (startDate < now) {
      toast({
        title: "Invalid Start Date",
        description: "Bid start date cannot be in the past.",
        variant: "destructive",
      });
      return;
    }

    publishBidMutation.mutate();
  };

  const publishBidMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/publish`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      toast({
        title: "Bid Published",
        description: "The bid has been published to suppliers successfully.",
      });
      setPublishConfirmOpen(false);
      navigate("/app/bids");
    },
    onError: (error: any) => {
      toast({
        title: "Cannot Publish",
        description: error?.message || "Failed to publish bid.",
        variant: "destructive",
      });
      setPublishConfirmOpen(false);
    },
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/save-template`,
        { templateName: name },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      toast({
        title: "Saved as Template",
        description: "This bid has been saved as a reusable template.",
      });
      setShowTemplateDialog(false);
      setTemplateName("");
      navigate("/app/bids");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save as template.",
        variant: "destructive",
      });
    },
  });

  const placeProxyMutation = useMutation({
    mutationFn: async (payload: {
      supplierId: number;
      lines: Array<{ bidLineId: number; bidprice: number | null; discprice: number | null; promisedDate: string | null }>;
      requirements: Array<{ reqId: number; answer: string; remarks: string }>;
      comments: string;
      refNumber: string;
    }) => {
      const response = await apiRequest("POST", `/api/dbo/bids/${bidId}/proxy-response`, payload);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Proxy Response Placed", description: "The proxy bid response has been submitted successfully." });
      setShowProxySheet(false);
      setProxySupplier(null);
      setProxyLines({});
      setProxyRequirements({});
      setProxyComments("");
      setProxyRefNumber("");
      setProxyActiveTab("financial");
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "suppliers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to place proxy response.", variant: "destructive" });
    },
  });

  const handleSubmitProxy = () => {
    if (!proxySupplier) {
      toast({ title: "Validation", description: "Please select a vendor.", variant: "destructive" });
      return;
    }
    if (!proxyRefNumber.trim()) {
      toast({ title: "Validation", description: "Please enter a reference number.", variant: "destructive" });
      return;
    }
    if (!proxyComments.trim()) {
      toast({ title: "Validation", description: "Please enter comments.", variant: "destructive" });
      return;
    }
    const linesPayload = (lines || []).map((l: any) => {
      const entry = proxyLines[l.id] || { bidprice: "", discprice: "", promisedDate: "" };
      return {
        bidLineId: l.id,
        bidprice: entry.bidprice !== "" ? Number(entry.bidprice) : null,
        discprice: entry.discprice !== "" ? Number(entry.discprice) : null,
        promisedDate: entry.promisedDate || null,
      };
    });
    const reqsPayload = (requirements || []).map((r: any) => {
      const entry = proxyRequirements[r.id] || { answer: "", remarks: "" };
      return { reqId: r.id, answer: entry.answer, remarks: entry.remarks };
    });
    placeProxyMutation.mutate({
      supplierId: proxySupplier.supplier_id,
      lines: linesPayload,
      requirements: reqsPayload,
      comments: proxyComments,
      refNumber: proxyRefNumber,
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    if (type === "line") deleteLineMutation.mutate(id);
    else if (type === "supplier") deleteSupplierMutation.mutate(id);
    else if (type === "requirement") deleteRequirementMutation.mutate(id);
    else if (type === "clause") deleteClauseMutation.mutate(id);
    else if (type === "approver") deleteApproverMutation.mutate(id);
    else if (type === "attachment") deleteAttachmentMutation.mutate(id);
    setDeleteConfirm(null);
  };

  const handleEditHeader = () => {
    if (bid) {
      console.log("Bid Data for Editing:", bid);
      const buyerEmail = bid.buyer || "";
      const buyerName = bid.buyer_name || "";
      const matchedBuyer = users.find(
        (u) =>
          (buyerEmail && u.email_id === buyerEmail) ||
          (buyerName && (u.name === buyerName || u.user_name === buyerName)),
      );
      console.log("Matched Buyer:", matchedBuyer);
      const requestorName = bid.requestor_name || "";
      const requestorVal = bid.requestor || "";
      const matchedRequestor = users.find(
        (u) =>
          (requestorVal && String(u.id) === String(requestorVal)) ||
          (requestorName &&
            (u.name === requestorName || u.user_name === requestorName)),
      );

      const paymentTermsName = bid.paymentterms || bid.paymentTerms || "";
      const matchedPT = paymentTerms.find(
        (pt) => pt.terms_name === paymentTermsName,
      );

      const locationId = bid.delivertto_location_id;
      const matchedLoc = locations.find(
        (l) => l.id === locationId || String(l.id) === String(locationId),
      );

      setEditBidInitialData({
        bid_title: bid.bid_title || "",
        type: bid.type || "RFQ",
        currency: bid.currency || "USD",
        org_id: bid.org_id ? String(bid.org_id) : "",
        bid_style: bid.bid_style || "Sealed",
        startdate: bid.startdate
          ? bid.startdate
          : "",
        enddate: bid.enddate
          ? bid.enddate
          : "",
        buyer_id: matchedBuyer ? String(matchedBuyer.id) : "",
        buyer_name: buyerName,
        requestor_id: matchedRequestor ? String(matchedRequestor.id) : "",
        requestor_name: requestorName,
        payment_terms_id: matchedPT ? String(matchedPT.id) : "",
        paymentterms: paymentTermsName,
        delivery_location_id: matchedLoc ? String(matchedLoc.id) : "",
        delivertto_location_name:
          bid.delivertto_location_name || bid.shiptoaddress || "",
        env_open_date: bid.env_open_date
          ? bid.env_open_date
          : "",
      });
      setShowEditHeaderDialog(true);
    }
  };

  useEffect(() => {
    if (editAutoOpened || !bid || !users.length) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "1") {
      setEditAutoOpened(true);
      handleEditHeader();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [bid, users, editAutoOpened]);

  const invitedSupplierIds = suppliers?.map((s: any) => s.supplier_id) || [];

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!bid) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Bid Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">
              The requested bid could not be found.
            </p>
            <Link href="/app/bids">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Bids
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDraft = bid.status === "Draft";
  const isPrCancelled = bid.attribute_15 === "PR Cancelled";
  const bidType = bid.type || "RFQ";
  const statusUpper = String(bid.status || "").trim().toUpperCase();
  const typeUpper = String(bidType || "").trim().toUpperCase();
  const isDraftRfp =
    statusUpper === "DRAFT RFP" || (statusUpper === "DRAFT" && typeUpper === "RFP");
  const isDraftTender =
    statusUpper === "DRAFT TENDER" || (statusUpper === "DRAFT" && typeUpper === "TENDER");
  const showAITeamSuggestion =
    isAIEnabled("AI_EVALUATION_TEAM_SUGGESTION") &&
    (isDraftRfp || isDraftTender);
  const typeLabel = bidTypeLabels[bidType] || bidType;
  const bidNumber = bid.bid_number || bid.attribute_4 || `BID-${bid.id}`;

  const termsClauses = clauses?.filter((c: any) => c.type === "terms") || [];
  const instructionsClauses =
    clauses?.filter((c: any) => c.type === "instructions") || [];

  const teamTypes =
    bidType === "Tender"
      ? [
        "Technical Review Team",
        "Technical Approve Team",
        "Commercial Review Team",
        "Commercial Approve Team",
        "Committee Team",
      ]
      : bidType === "RFP"
        ? ["Technical Review Team", "Commercial Review Team"]
        : [];

  const groupedApprovers: Record<string, any[]> = {};
  teamTypes.forEach((tt) => {
    groupedApprovers[tt] = [];
  });
  (approvers || []).forEach((a: any) => {
    if (!groupedApprovers[a.teamtype]) groupedApprovers[a.teamtype] = [];
    groupedApprovers[a.teamtype].push(a);
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app/bids">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <Gavel className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="text-xl font-semibold"
                data-testid="text-bid-number"
              >
                {bidNumber}
              </h1>
              <StatusBadge status={bid.status} />
              <Badge variant="outline">{bidType}</Badge>
            </div>
            <p
              className="text-xs text-muted-foreground"
              data-testid="text-bid-title"
            >
              {bid.bid_title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {taskId && !isDraft && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="bg-[#3b1c71] hover:bg-[#2d1556] text-white flex items-center gap-2 h-9 px-4 transition-all"
                    disabled={processApprovalMutation.isPending}
                    data-testid="button-approve-dropdown"
                  >
                    {processApprovalMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span className="font-medium">Approve</span>
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36 p-1">
                  <DropdownMenuItem
                    className="flex items-center gap-2 cursor-pointer text-green-600 focus:text-green-700 focus:bg-green-50"
                    onClick={() =>
                      processApprovalMutation.mutate({
                        result: "Approved",
                        comments: "",
                      })
                    }
                    data-testid="menu-item-approve"
                  >
                    <ThumbsUp className="h-4 w-4" />
                    <span className="font-semibold">Approve</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                    onClick={() =>
                      processApprovalMutation.mutate({
                        result: "Rejected",
                        comments: "",
                      })
                    }
                    data-testid="menu-item-reject"
                  >
                    <ThumbsDown className="h-4 w-4" />
                    <span className="font-semibold">Reject</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {bid.status === "Published" && bidType === "RFQ" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProxySupplier(null);
                setProxyLines({});
                setProxyRequirements({});
                setProxyComments("");
                setProxyRefNumber("");
                setProxyActiveTab("financial");
                setShowProxySheet(true);
              }}
              data-testid="button-place-proxy"
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              Place Proxy
            </Button>
          )}
          {isDraft && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    data-testid="button-delete-bid"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Bid</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this bid? The bid will be
                      marked as deleted and the linked requisition reference
                      will be cleared.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-delete-bid-cancel">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteBidMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-delete-bid-confirm"
                    >
                      {deleteBidMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      )}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
          )}
          {isDraft && !isPrCancelled && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditHeader}
                data-testid="button-edit-header"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTemplateName(bid.template_name || bid.bid_title || "");
                  setShowTemplateDialog(true);
                }}
                data-testid="button-save-template"
              >
                <Save className="h-4 w-4 mr-2" />
                Save As Template
              </Button>

              <Button
                size="sm"
                onClick={() => setPublishConfirmOpen(true)}
                disabled={publishBidMutation.isPending}
                data-testid="button-publish-bid"
              >
                {publishBidMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Publish to Suppliers
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gavel className="h-4 w-4" />
              Bid Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Start Date
                </p>
                <p className="text-sm font-medium">
                  {formatDateTime(bid.startdate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  End Date
                </p>
                <p className="text-sm font-medium">{formatDateTime(bid.enddate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Currency
                </p>
                <p className="text-sm font-medium">{bid.currency || "INR"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  Payment Terms
                </p>
                <p className="text-sm font-medium">
                  {bid.paymentTerms || bid.paymentterms || "-"}
                </p>
              </div>
            </div>
            {bid.pr_number && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Linked PR
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-sm">
                      {bid.pr_number}
                    </Badge>
                    {isPrCancelled && (
                      <Badge variant="destructive" className="text-xs" data-testid="badge-pr-cancelled">
                        PR Cancelled
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}
            {bid.description && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Description
                  </p>
                  <p className="text-sm">{bid.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              People & Timelines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Buyer</p>
                <p className="text-sm font-medium">
                  {bid.buyer_name || bid.buyer || "-"}
                </p>
                {bid.buyer_email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="h-3 w-3" />
                    {bid.buyer_email}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  Requestor
                </p>
                <p className="text-sm font-medium">
                  {bid.requestor_name || "-"}
                </p>
                {bid.requestor_email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="h-3 w-3" />
                    {bid.requestor_email}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Delivery Location
                </p>
                <p className="text-sm font-medium">
                  {bid.delivertto_location_name || bid.shiptoaddress || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <FolderTree className="h-3 w-3" />
                  Business Entity
                </p>
                <p className="text-sm font-medium">
                  {organizations?.find(org => String(org.id) === bid.org_id)?.organization_name || "-"}
                </p>
              </div>
              {bid.budget_name ? <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Budget
                </p>
                <div className="text-sm font-medium">
                  {bid.budget_name}
                </div>
              </div> : <></>}
            </div>

            {bidType === "Tender" && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Envelope Open Date
                    </p>
                    <p className="text-sm font-medium">
                      {formatDate(bid.env_open_date)}
                    </p>
                  </div>
                </div>
              </>
            )}

            {bid.notes_to_supplier && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Notes to Supplier
                  </p>
                  <p className="text-sm">{bid.notes_to_supplier}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {isDraft && isAIEnabled("AI_BID_STRATEGY") && (lines?.length ?? 0) > 0 && (
        <Card className="border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">AI Bid Strategy Advisor</p>
                  <p className="text-xs text-muted-foreground">
                    Get AI-powered recommendations for bid type, duration, and
                    pricing strategy
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAIStrategy}
                disabled={aiStrategyLoading}
                className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                data-testid="button-ai-strategy"
              >
                {aiStrategyLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Analyze
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isDraft && (
        <div className="bg-muted/50 border rounded-md p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            This bid is {bid.status}. Editing is limited.
          </span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={cn("grid w-full", bidType === "RFQ" ? "grid-cols-3" : "grid-cols-5")}>
          <TabsTrigger value="lines" className="gap-1" data-testid="tab-lines">
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Scope of Work</span> (
            {lines?.length || 0})
          </TabsTrigger>
          <TabsTrigger
            value="suppliers"
            className="gap-1"
            data-testid="tab-suppliers"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Suppliers</span> (
            {suppliers?.length || 0})
          </TabsTrigger>
          {bidType !== "RFQ" && (
            <>
              <TabsTrigger
                value="criteria"
                className="gap-1"
                data-testid="tab-criteria"
              >
                <Scale className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Evaluation Criteria</span> (
                {requirements?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="team" className="gap-1" data-testid="tab-team">
                <ClipboardList className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Evaluation Team</span> (
                {approvers?.length || 0})
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="terms" className="gap-1" data-testid="tab-terms">
            <ScrollText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Terms & Instructions</span> (
            {clauses?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* LINES TAB */}
        <TabsContent value="lines" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Bid Lines ({lines?.length || 0})
              </CardTitle>
              {isDraft && !bid.pr_number && (
                <Button
                  size="sm"
                  onClick={() => setAddLineSheetOpen(true)}
                  data-testid="button-add-line"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {!lines || lines.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No lines added yet</p>
                  {isDraft && !isPrCancelled && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setAddLineSheetOpen(true)}
                      data-testid="button-add-first-line"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Line
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">S.No</TableHead>
                        <TableHead className="min-w-[180px]">Item</TableHead>
                        <TableHead className="min-w-[150px]">
                          Category
                        </TableHead>
                        <TableHead className="w-20 text-center">Qty</TableHead>
                        <TableHead className="w-16 text-center">UoM</TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Unit/Expected/Indicative
                        </TableHead>
                        <TableHead className="min-w-[110px] whitespace-nowrap">
                          Required From
                        </TableHead>
                        <TableHead className="min-w-[110px] whitespace-nowrap">
                          Required By
                        </TableHead>
                        <TableHead className="min-w-[120px]">
                          Requestor
                        </TableHead>
                        {isDraft && !bid.pr_number && (
                          <TableHead className="w-12"></TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any, idx: number) => (
                        <TableRow
                          key={line.id}
                          data-testid={`row-line-${line.id}`}
                        >
                          <TableCell>
                            {idx+1 || "-"}
                          </TableCell>
                          <TableCell
                            className="font-medium max-w-[180px] truncate"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[180px] cursor-default">
                                  {line.description}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{line.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell
                            className="max-w-[150px] truncate"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[150px] cursor-default">
                                  {line.product_category || ""}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{line.product_category || ""}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {line.quantity || 0}
                          </TableCell>
                          <TableCell className="text-center">
                            {line.uom || "-"}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {formatCurrency(line.currentprice, line.currency)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {line.needbyfrom
                              ? formatDate(line.needbyfrom)
                              : "-"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {line.needbyto ? formatDate(line.needbyto) : "-"}
                          </TableCell>
                          <TableCell
                            className="max-w-[120px] truncate"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[180px] cursor-default">
                                  {line.created_by || "-"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{line.created_by || "-"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          {isDraft && !bid.pr_number && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {isDraft && !bid.pr_number && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setEditingLine(line);
                                      setLineForm({
                                        linetype: line.linetype || "Goods",
                                        description: line.description || "",
                                        uom: line.uom || "EA",
                                        quantity: String(line.quantity || 1),
                                        currentprice: String(line.currentprice || 0),
                                        currency: line.currency || bid?.currency || "INR",
                                        categoryCode: line.product_category_id || "",
                                        categoryName: line.product_category || "",
                                        itemId: line.item_id || "",
                                        itemName: line.description || "",
                                        needbyfrom: line.needbyfrom ? line.needbyfrom.substring(0, 10) : "",
                                        needbyto: line.needbyto ? line.needbyto.substring(0, 10) : "",
                                        itemCode: line.itemCode || "",
                                      });
                                      setItemEntryMode(line.item_id ? "master" : "freetext");
                                      setAddLineSheetOpen(true);
                                    }}
                                    data-testid={`button-edit-line-${line.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {isDraft && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setDeleteConfirm({
                                        type: "line",
                                        id: line.id,
                                      })
                                    }
                                    data-testid={`button-delete-line-${line.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="mt-6 pt-4 border-t">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Technical Specification Documents
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Attach technical specification documents related to
                      Products, Services added as part of Scope of Work.
                    </p>
                  </div>
                  {isDraft && !isPrCancelled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddAttachmentDialog(true)}
                      data-testid="button-attach-document"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Attach Document
                    </Button>
                  )}
                </div>
                {(() => {
                  const lineAttachments =
                    attachments?.filter(
                      (a: any) =>
                        a.attach_source === "Lines" || !a.attach_source,
                    ) || [];
                  return lineAttachments.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No documents attached yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Last Updated By</TableHead>
                            <TableHead>Last Updated Date</TableHead>
                            <TableHead>Status</TableHead>
                            {isDraft && (
                              <TableHead className="w-10"></TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineAttachments.map((att: any) => (
                            <TableRow
                              key={att.id}
                              data-testid={`row-attachment-${att.id}`}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                  {att.attach_path ? (
                                    <a
                                      href={`/api/dbo/bids/${bidId}/attachments/${att.id}/download`}
                                      download
                                      className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                      data-testid={`link-download-attachment-${att.id}`}
                                    >
                                      {att.attach_name}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-sm">
                                      {att.attach_name}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {att.attach_desc || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {att.attach_source || "-"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {att.created_by || "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(att.created_date)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  Active
                                </Badge>
                              </TableCell>
                              {isDraft && (
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setDeleteConfirm({
                                        type: "attachment",
                                        id: att.id,
                                      })
                                    }
                                    data-testid={`button-delete-attachment-${att.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SUPPLIERS TAB */}
        <TabsContent value="suppliers" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Invited Suppliers ({suppliers?.length || 0})
              </CardTitle>
              {(isDraft || bid.status === "Published") && !isPrCancelled && (
                <div className="flex items-center gap-2">
                  {isAIEnabled("AI_SMART_VENDOR_SUGGEST") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={fetchAIVendorRecs}
                      disabled={aiVendorLoading}
                      className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                      data-testid="button-ai-vendor-suggest"
                    >
                      {aiVendorLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      AI Smart Suggest
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setShowAddSupplierDialog(true)}
                    data-testid="button-add-supplier"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Invite Supplier
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {!suppliers || suppliers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No suppliers invited yet</p>
                  {(isDraft || bid.status === "Published") && !isPrCancelled && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowAddSupplierDialog(true)}
                      data-testid="button-invite-first"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Invite First Supplier
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {suppliers.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-start justify-between p-3 rounded-md border"
                      data-testid={`card-supplier-${s.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{s.supplier_name}</p>
                        {s.supplier_site && (
                          <p className="text-sm text-muted-foreground">
                            {s.supplier_site}
                          </p>
                        )}
                        <div className="flex flex-col gap-1 mt-2">
                          {s.supplier_contact && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" /> {s.supplier_contact}
                            </span>
                          )}
                          {s.supplier_contact_email && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />{" "}
                              {s.supplier_contact_email}
                            </span>
                          )}
                          {s.supplier_contact_no && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />{" "}
                              {s.supplier_contact_no}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-2">
                        <Badge
                          variant={
                            s.status === "Submitted" ? "default" : "outline"
                          }
                        >
                          {s.status}
                        </Badge>
                        {isDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDeleteConfirm({ type: "supplier", id: s.id })
                            }
                            data-testid={`button-remove-supplier-${s.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EVALUATION CRITERIA TAB */}
        {bidType !== "RFQ" && (
          <TabsContent value="criteria" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    Evaluation Criteria ({requirements?.length || 0})
                  </CardTitle>
                  {/* Weight budget indicator */}
                  {(() => {
                    const totalWeight = (requirements || []).reduce(
                      (sum: number, r: any) => {
                        const w = parseInt(r.weight || "0", 10);
                        return sum + (isNaN(w) ? 0 : w);
                      },
                      0,
                    );
                    const remaining = 100 - totalWeight;
                    const isComplete = totalWeight === 100;
                    const isOver = totalWeight > 100;
                    return (
                      <p
                        className={`text-xs ${
                          isOver
                            ? "text-destructive font-medium"
                            : isComplete
                              ? "text-green-600 dark:text-green-400 font-medium"
                              : "text-muted-foreground"
                        }`}
                      >
                        {isOver
                          ? "Total evaluation weightage cannot exceed 100."
                          : isComplete
                            ? "Total weight 100/100 — weight allocation complete"
                            : `Total weight ${totalWeight}/100 — ${remaining} remaining`}
                      </p>
                    );
                  })()}
                </div>
                {isDraft && !isPrCancelled && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAIEnabled("AI_GENERATE_REQUIREMENTS") && (() => {
                      const totalWeight = (requirements || []).reduce(
                        (sum: number, r: any) => {
                          const w = parseInt(r.weight || "0", 10);
                          return sum + (isNaN(w) ? 0 : w);
                        },
                        0,
                      );
                      const weightBudgetFull = totalWeight >= 100;
                      return (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* span captures pointer events so the tooltip works even when the button is disabled */}
                              <span
                                className={weightBudgetFull || aiReqLoading ? "cursor-not-allowed" : ""}
                              >
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={fetchAIRequirements}
                                  disabled={aiReqLoading || weightBudgetFull}
                                  className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:pointer-events-none disabled:opacity-50"
                                  data-testid="button-ai-generate-criteria"
                                >
                                  {aiReqLoading ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4 mr-2" />
                                  )}
                                  AI Generate
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-center">
                              {weightBudgetFull
                                ? "Reduce the current total weightage below 100 before generating AI evaluation criteria."
                                : "Generate evaluation criteria using AI"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}
                    {isAIEnabled("AI_GENERATE_REQUIREMENTS") &&
                      (requirements?.length || 0) > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={fetchRegenerate}
                          disabled={regenLoading}
                          className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                          data-testid="button-ai-regenerate-criteria"
                        >
                          {regenLoading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Regenerate
                        </Button>
                      )}
                    <Button
                      size="sm"
                      onClick={() => setShowAddRequirementDialog(true)}
                      data-testid="button-add-criteria"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Criteria
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {isDraft && !isPrCancelled && regenerateAvailable &&
                  isAIEnabled("AI_GENERATE_REQUIREMENTS") &&
                  (requirements?.length || 0) > 0 && (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 dark:border-purple-800 dark:bg-purple-950/30">
                      <div className="flex items-center gap-2 text-xs text-purple-800 dark:text-purple-300">
                        <Sparkles className="h-4 w-4 flex-shrink-0" />
                        <span>
                          Bid details changed. Regenerate evaluation questions to keep them aligned with the latest line items and documents.
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={fetchRegenerate}
                          disabled={regenLoading}
                          className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                          data-testid="button-regenerate-banner"
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
                          data-testid="button-dismiss-regenerate"
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}
                {!requirements || requirements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Scale className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No evaluation criteria added yet</p>
                    {isDraft && !isPrCancelled && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setShowAddRequirementDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Criteria
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium">#</TableHead>
                        <TableHead className="text-xs font-medium">
                          Category
                        </TableHead>
                        <TableHead className="text-xs font-medium w-[40%]">
                          Question / Requirement
                        </TableHead>
                        <TableHead className="text-xs font-medium text-center">
                          Option
                        </TableHead>
                        <TableHead className="text-xs font-medium text-center">
                          Type
                        </TableHead>
                        <TableHead className="text-xs font-medium text-center">
                          Weight
                        </TableHead>
                        {isDraft && !isPrCancelled && (
                          <TableHead className="w-10"></TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requirements.map((req: any, idx: number) => (
                        <TableRow
                          key={req.id}
                          data-testid={`row-criteria-${req.id}`}
                        >
                          <TableCell className="text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                req.category === "General"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {req.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {req.question}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {req.qvoption || "-"}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {req.qvtype || "-"}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {req.weight || "-"}
                          </TableCell>
                          {isDraft && !isPrCancelled && (
                            <TableCell className="flex gap-1 justify-end">
                              {isDraft && !isPrCancelled && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingRequirement(req);
                                    setReqForm({
                                      category: req.category || "Technical",
                                      question: req.question || "",
                                      qvoption: req.qvoption || "Required",
                                      qvtype: req.qvtype || "Text",
                                      weight: String(req.weight || "100"),
                                      lovOptions: req.lov ? req.lov.split(",") : [],
                                    });
                                    setShowAddRequirementDialog(true);
                                  }}
                                  data-testid={`button-edit-criteria-${req.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {isDraft && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setDeleteConfirm({
                                      type: "requirement",
                                      id: req.id,
                                    })
                                  }
                                  data-testid={`button-delete-criteria-${req.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="mt-6 pt-4 border-t">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <span className="text-sm font-semibold flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Evaluation Criteria Documents
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Attach any detail Evaluation Criteria documents to be used
                        during evaluation.
                      </p>
                    </div>
                    {isDraft && !isPrCancelled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCriteriaAttachmentDialog(true)}
                        data-testid="button-attach-criteria-document"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Attach Document
                      </Button>
                    )}
                  </div>
                  {(() => {
                    const criteriaAttachments =
                      attachments?.filter(
                        (a: any) => a.attach_source === "Requirements",
                      ) || [];
                    return criteriaAttachments.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        <p className="text-sm">No documents attached yet</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                          <TableHeader>
                            <TableRow>
                              <TableHead>File Name</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Last Updated By</TableHead>
                              <TableHead>Last Updated Date</TableHead>
                              <TableHead>Status</TableHead>
                              {isDraft && (
                                <TableHead className="w-10"></TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {criteriaAttachments.map((att: any) => (
                              <TableRow
                                key={att.id}
                                data-testid={`row-criteria-attachment-${att.id}`}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                    {att.attach_path ? (
                                      <a
                                        href={`/api/dbo/bids/${bidId}/attachments/${att.id}/download`}
                                        download
                                        className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                        data-testid={`link-download-criteria-attachment-${att.id}`}
                                      >
                                        {att.attach_name}
                                      </a>
                                    ) : (
                                      <span className="font-medium text-sm">
                                        {att.attach_name}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {att.attach_desc || "-"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {att.attach_source || "-"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {att.created_by || "-"}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {formatDate(att.created_date)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-xs">
                                    Active
                                  </Badge>
                                </TableCell>
                                {isDraft && (
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        setDeleteConfirm({
                                          type: "attachment",
                                          id: att.id,
                                        })
                                      }
                                      data-testid={`button-delete-criteria-attachment-${att.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* TEAM TAB */}
        {bidType !== "RFQ" && (
          <TabsContent value="team" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Evaluation Team ({approvers?.length || 0})
                </CardTitle>
                {showAITeamSuggestion && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchAITeamSuggestion}
                    disabled={aiTeamSuggestionLoading}
                    className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                    data-testid="button-ai-team-suggestion"
                  >
                    {aiTeamSuggestionLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    AI Team Suggestion
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-4">
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    ** For RFP, Please add Technical and Commercial review team
                    members.
                  </p>
                  <p>
                    ** For Tender, Please add Technical, Commercial, Committee
                    review team members.
                  </p>
                </div>

                <div
                  className={cn(
                    "grid grid-cols-1 md:grid-cols-2 gap-6",
                    bidType === "Tender"
                      ? "lg:grid-cols-5"
                      : bidType === "RFP"
                        ? "lg:grid-cols-2"
                        : "lg:grid-cols-4",
                  )}
                >
                  {teamTypes.map((tt) => {
                    const members = groupedApprovers[tt] || [];
                    if (!isDraft && members.length === 0) return null;
                    const allApproverUserIds = new Set(
                      (approvers || []).map((a: any) => a.user_id),
                    );
                    const filteredUsers = (allUsers || []).filter((u: any) => {
                      if (allApproverUserIds.has(u.id)) return false;
                      const q = (teamSearchQuery[tt] || "").toLowerCase();
                      if (!q) return true;
                      return (
                        (u.name || "").toLowerCase().includes(q) ||
                        (u.user_name || "").toLowerCase().includes(q) ||
                        (u.email_id || "").toLowerCase().includes(q)
                      );
                    });

                    return (
                      <div
                        key={tt}
                        data-testid={`team-section-${tt.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        <h4 className="text-sm font-semibold mb-3">{tt}</h4>
                        {isDraft && !isPrCancelled && (
                          <Popover
                            open={teamSearchOpen[tt] || false}
                            onOpenChange={(open) =>
                              setTeamSearchOpen((prev) => ({
                                ...prev,
                                [tt]: open,
                              }))
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-between mb-3"
                                data-testid={`button-select-member-${tt.replace(/\s+/g, "-").toLowerCase()}`}
                              >
                                <span className="text-muted-foreground">
                                  Select Member
                                </span>
                                <Search className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[300px] p-0"
                              align="start"
                            >
                              <Command>
                                <CommandInput
                                  placeholder="Search members..."
                                  value={teamSearchQuery[tt] || ""}
                                  onValueChange={(v) =>
                                    setTeamSearchQuery((prev) => ({
                                      ...prev,
                                      [tt]: v,
                                    }))
                                  }
                                  data-testid={`input-search-member-${tt.replace(/\s+/g, "-").toLowerCase()}`}
                                />
                                <CommandList>
                                  <CommandEmpty>No members found.</CommandEmpty>
                                  <CommandGroup>
                                    {filteredUsers.map((u: any) => (
                                      <CommandItem
                                        key={u.id}
                                        value={`${u.name} ${u.user_name} ${u.email_id}`}
                                        onSelect={() => {
                                          addTeamMutation.mutate({
                                            bid_team_type: tt,
                                            bid_apprs_list: String(u.id),
                                          });
                                          setTeamSearchOpen((prev) => ({
                                            ...prev,
                                            [tt]: false,
                                          }));
                                          setTeamSearchQuery((prev) => ({
                                            ...prev,
                                            [tt]: "",
                                          }));
                                        }}
                                        data-testid={`option-member-${u.id}`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">
                                              {u.name || u.user_name}
                                            </p>
                                            {u.department_name && (
                                              <p className="text-xs text-muted-foreground">
                                                {u.department_name}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        )}

                        <div className="space-y-2">
                          {members.map((m: any) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 rounded-md border px-3 py-2 w-full"
                              data-testid={`tag-member-${m.id}`}
                            >
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p
                                  className="text-sm font-medium truncate"
                                  title={m.user_name || `User #${m.user_id}`}
                                >
                                  {m.user_name || `User #${m.user_id}`}
                                </p>
                                <p
                                  className="text-xs text-muted-foreground truncate"
                                  title={m.user_department || "Member"}
                                >
                                  {m.user_department || "Member"}
                                </p>
                              </div>
                              {isDraft && (
                                <button
                                  onClick={() =>
                                    deleteApproverMutation.mutate(m.id)
                                  }
                                  className="text-destructive hover:text-destructive/80 ml-1 shrink-0"
                                  data-testid={`button-remove-member-${m.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          {members.length === 0 && !isDraft && (
                            <p className="text-sm text-muted-foreground py-2">
                              No members assigned
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* TERMS & INSTRUCTIONS TAB */}
        <TabsContent value="terms" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                Terms & Instructions ({clauses?.length || 0})
              </CardTitle>
              {isDraft && !isPrCancelled && (
                <div className="flex items-center gap-2">
                  {isAIEnabled("AI_GENERATE_CLAUSES") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={fetchAIClauses}
                      disabled={aiClauseLoading}
                      className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                      data-testid="button-ai-generate-clauses"
                    >
                      {aiClauseLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      AI Generate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setShowAddClauseDialog(true)}
                    data-testid="button-add-clause"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Term / Instruction
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <ScrollText className="h-3.5 w-3.5" />
                    Terms ({termsClauses.length})
                  </h4>
                  {termsClauses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No terms added
                    </p>
                  ) : (
                    termsClauses.map((c: any, idx: number) => (
                      <div
                        key={c.id}
                        className="flex items-start justify-between p-3 rounded-md border"
                        data-testid={`card-term-${c.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{c.class_desc}</p>
                          {c.class_ref && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Ref: {c.class_ref}
                            </p>
                          )}
                        </div>
                        {isDraft && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setDeleteConfirm({ type: "clause", id: c.id })
                            }
                            data-testid={`button-delete-term-${c.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    Instructions ({instructionsClauses.length})
                  </h4>
                  {instructionsClauses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No instructions added
                    </p>
                  ) : (
                    instructionsClauses.map((c: any, idx: number) => (
                      <div
                        key={c.id}
                        className="flex items-start justify-between p-3 rounded-md border"
                        data-testid={`card-instruction-${c.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{c.class_desc}</p>
                          {c.class_ref && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Ref: {c.class_ref}
                            </p>
                          )}
                        </div>
                        {isDraft && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setDeleteConfirm({ type: "clause", id: c.id })
                            }
                            data-testid={`button-delete-instruction-${c.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attachments
                  </h4>
                  {isDraft && !isPrCancelled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowTermsAttachmentDialog(true)}
                      data-testid="button-add-terms-attachment"
                    >
                      <Paperclip className="h-4 w-4 mr-2" />
                      Attach Document
                    </Button>
                  )}
                </div>
                {(() => {
                  const termsAttachments =
                    attachments?.filter(
                      (a: any) => a.attach_source === "Terms",
                    ) || [];
                  return termsAttachments.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No documents attached yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Last Updated By</TableHead>
                            <TableHead>Last Updated Date</TableHead>
                            <TableHead>Status</TableHead>
                            {isDraft && (
                              <TableHead className="w-10"></TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {termsAttachments.map((att: any) => (
                            <TableRow
                              key={att.id}
                              data-testid={`row-terms-attachment-${att.id}`}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                  {att.attach_path ? (
                                    <a
                                      href={`/api/dbo/bids/${bidId}/attachments/${att.id}/download`}
                                      download
                                      className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                      data-testid={`link-download-terms-attachment-${att.id}`}
                                    >
                                      {att.attach_name}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-sm">
                                      {att.attach_name}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {att.attach_desc || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {att.attach_source || "-"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {att.created_by || "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(att.created_date)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  Active
                                </Badge>
                              </TableCell>
                              {isDraft && (
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setDeleteConfirm({
                                        type: "attachment",
                                        id: att.id,
                                      })
                                    }
                                    data-testid={`button-delete-terms-attachment-${att.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ADD / EDIT LINE SHEET */}
      <Sheet
        open={addLineSheetOpen}
        onOpenChange={(open) => {
          setAddLineSheetOpen(open);
          if (!open) {
            setEditingLine(null);
            resetLineForm();
            setFmpRequestedItemKey(null);
          }
        }}
      >
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {editingLine ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingLine ? "Edit Line Item" : "Add Line Item"}
            </SheetTitle>
            <SheetDescription>
              {editingLine ? "Update the line item details." : "Add a new line item to this bid."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 pt-2 pb-6">
            <div className="space-y-4">
              {/* <h4 className="text-sm font-medium">Item Details</h4> */}

              {/* <div className="flex gap-2">
                <Button
                  type="button"
                  variant={itemEntryMode === "master" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setItemEntryMode("master");
                    setLineForm((f) => ({
                      ...f,
                      description: "",
                      categoryCode: "",
                      categoryName: "",
                      uom: "EA",
                      itemId: "",
                      itemName: "",
                    }));
                  }}
                  data-testid="button-item-master-mode"
                >
                  Item Master
                </Button>
                <Button
                  type="button"
                  variant={itemEntryMode === "freetext" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setItemEntryMode("freetext");
                    setLineForm((f) => ({ ...f, itemId: "", itemName: "" }));
                  }}
                  data-testid="button-freetext-mode"
                >
                  Free Text
                </Button>
              </div> */}

              <div className="grid grid-cols-2 gap-4">
                {itemEntryMode === "master" ? (
                  <div className="col-span-2">
                    <Label htmlFor="line-item">Item</Label>
                    <Popover open={itemOpen} onOpenChange={setItemOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={itemOpen}
                          className="w-full justify-between font-normal"
                          data-testid="select-line-item"
                        >
                          {lineForm.itemId
                            ? `${lineForm.itemCode} - ${lineForm.itemName}`
                            : "Select Item..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search item..." />
                          <CommandList>
                            <CommandEmpty>No item found.</CommandEmpty>
                            <CommandGroup>
                              {items.map((item) => (
                                <CommandItem
                                  key={item.id}
                                  value={item.name}
                                  onSelect={() => {
                                    setLineForm((f) => ({
                                      ...f,
                                      itemId: item.id,
                                      itemName: item.name,
                                      description: item.name,
                                      categoryCode: item.categoryCode || "",
                                      categoryName: item.categoryName || "",
                                      uom: item.unitOfMeasure || "EA",
                                      currentprice: item.standardPrice
                                        ? String(item.standardPrice)
                                        : "0",
                                      itemCode: item.itemCode || "",
                                    }));
                                    setItemOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      lineForm.itemId === item.id
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  {item.itemCode} - {item.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {lineForm.itemId && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Category:{" "}
                        {items.find((i) => i.id === lineForm.itemId)
                          ?.categoryName || "N/A"}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="col-span-2">
                      <Label htmlFor="line-category">Category</Label>
                      <Popover
                        open={categoryOpen}
                        onOpenChange={setCategoryOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={categoryOpen}
                            className="w-full justify-between font-normal"
                            data-testid="select-line-category"
                          >
                            {lineForm.categoryCode
                              ? categories.find(
                                (cat) => cat.code === lineForm.categoryCode,
                              )?.name
                              : "Select Category..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search category..." />
                            <CommandList>
                              <CommandEmpty>No category found.</CommandEmpty>
                              <CommandGroup>
                                {categories.map((cat) => (
                                  <CommandItem
                                    key={cat.id}
                                    value={cat.name}
                                    onSelect={() => {
                                      setLineForm((f) => ({
                                        ...f,
                                        categoryCode: cat.code,
                                        categoryName: cat.name,
                                      }));
                                      setCategoryOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        lineForm.categoryCode === cat.code
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {cat.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="line-description">Description</Label>
                      <Input
                        id="line-description"
                        placeholder="Item description"
                        value={lineForm.description}
                        onChange={(e) =>
                          setLineForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                        data-testid="input-line-description"
                      />
                    </div>
                  </>
                )}

                <div>
                  <Label htmlFor="line-linetype">Line Type</Label>
                  <Select
                    value={lineForm.linetype}
                    onValueChange={(v) =>
                      setLineForm((f) => ({ ...f, linetype: v }))
                    }
                  >
                    <SelectTrigger
                      id="line-linetype"
                      data-testid="select-linetype"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Goods">Goods</SelectItem>
                      <SelectItem value="Service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="line-quantity">Quantity</Label>
                  <Input
                    id="line-quantity"
                    type="number"
                    min="1"
                    value={lineForm.quantity}
                    onChange={(e) =>
                      setLineForm((f) => ({ ...f, quantity: e.target.value }))
                    }
                    data-testid="input-line-quantity"
                  />
                </div>

                <div>
                  <Label htmlFor="line-uom">Unit of Measure</Label>
                  <Select
                    value={lineForm.uom}
                    onValueChange={(value) =>
                      setLineForm((f) => ({ ...f, uom: value }))
                    }
                  >
                    <SelectTrigger id="line-uom" data-testid="select-line-uom">
                      <SelectValue placeholder="Select UoM" />
                    </SelectTrigger>
                    <SelectContent>
                      {uomOptions.length > 0 ? (
                        uomOptions.map((uom) => (
                          <SelectItem
                            key={uom.id}
                            value={uom.description || "EA"}
                          >
                            {uom.description}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="EA">Each</SelectItem>
                          <SelectItem value="KG">Kilogram</SelectItem>
                          <SelectItem value="LTR">Litre</SelectItem>
                          <SelectItem value="MTR">Metre</SelectItem>
                          <SelectItem value="PCS">Pieces</SelectItem>
                          <SelectItem value="SET">Set</SelectItem>
                          <SelectItem value="BOX">Box</SelectItem>
                          <SelectItem value="TON">Ton</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="line-price">
                    Unit Price ({bid?.currency || "INR"})
                  </Label>
                  <Input
                    id="line-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    inputMode="decimal"
                    value={lineForm.currentprice}
                    onChange={(e) =>
                      setLineForm((f) => ({
                        ...f,
                        currentprice: sanitizeDecimalInput(e.target.value),
                      }))
                    }
                    onKeyDown={preventInvalidNumberKey}
                    data-testid="input-line-price"
                  />
                </div>

                {isAIEnabled("AI_FMP_INTELLIGENCE") &&
                  isDraft &&
                  !!lineForm.itemId && (
                    <div className="space-y-2 col-span-2">
                      {!fmpRequested ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => setFmpRequestedItemKey(lineForm.itemId)}
                          data-testid="button-fmp-benchmark"
                        >
                          <Sparkles className="h-4 w-4 mr-1" aria-hidden="true" />
                          AI Fair Market Price
                        </Button>
                      ) : fmpFetching ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          disabled
                          data-testid="button-fmp-benchmark"
                        >
                          <Loader2
                            className="h-4 w-4 mr-1 animate-spin"
                            aria-hidden="true"
                          />
                          Computing benchmark...
                          <span className="sr-only">
                            Computing AI fair market price benchmark, please wait
                          </span>
                        </Button>
                      ) : fmpFailed ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => refetchFmpSnapshot()}
                          data-testid="button-fmp-benchmark"
                        >
                          <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
                          Retry AI Benchmark
                        </Button>
                      ) : (
                        <>
                          <FmpBenchmarkCard
                            snapshot={fmpSnapshot}
                            enteredPrice={
                              parseFloat(lineForm.currentprice) || null
                            }
                            currency={lineForm.currency || bid?.currency || "INR"}
                            onUseFairPrice={(price) =>
                              setLineForm((f) => ({
                                ...f,
                                currentprice: String(price),
                              }))
                            }
                          />
                          {/* The trigger button is gone once the card renders, so
                              this is the only way to re-run the same analysis. */}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="w-full"
                            onClick={() => refetchFmpSnapshot()}
                            data-testid="button-fmp-reanalyze"
                          >
                            <RefreshCw
                              className="h-4 w-4 mr-1"
                              aria-hidden="true"
                            />
                            Re-analyze
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                {isAIEnabled("AI_FMP_INTELLIGENCE") && (
                  <div className="col-span-2 flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="switch-show-fmp-to-supplier"
                        className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Show FMPI to Suppliers
                      </Label>
                    </div>
                    <Switch
                      id="switch-show-fmp-to-supplier"
                      checked={!!bid?.show_fmp_to_supplier}
                      disabled={fmpVisibilityMutation.isPending}
                      onCheckedChange={(checked: boolean) =>
                        fmpVisibilityMutation.mutate(checked)
                      }
                      data-testid="switch-show-fmp-to-supplier"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="line-needbyfrom">Required From</Label>
                  <Input
                    id="line-needbyfrom"
                    type="date"
                    value={lineForm.needbyfrom}
                    onChange={(e) =>
                      setLineForm((f) => ({ ...f, needbyfrom: e.target.value }))
                    }
                    data-testid="input-line-needbyfrom"
                  />
                </div>

                <div>
                  <Label htmlFor="line-needbyto">Required By</Label>
                  <Input
                    id="line-needbyto"
                    type="date"
                    value={lineForm.needbyto}
                    onChange={(e) =>
                      setLineForm((f) => ({ ...f, needbyto: e.target.value }))
                    }
                    data-testid="input-line-needbyto"
                  />
                </div>
              </div>
            </div>
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddLineSheetOpen(false);
                setFmpRequestedItemKey(null);
              }}
              data-testid="button-cancel-line"
            >
              Cancel
            </Button>
            <Button
              disabled={!lineForm.description || addLineMutation.isPending || updateLineMutation.isPending}
              data-testid="button-submit-line"
              onClick={() => {
                if (!lineForm.description) {
                  toast({
                    title: "Required",
                    description: "Description is required.",
                    variant: "destructive",
                  });
                  return;
                }
                const payload = {
                  linetype: lineForm.linetype,
                  description: lineForm.description,
                  uom: lineForm.uom || "EA",
                  quantity: parseInt(lineForm.quantity) || 1,
                  currentprice: parseFloat(lineForm.currentprice) || 0,
                  currency: bid?.currency || "INR",
                  product_category: lineForm.categoryName || null,
                  product_category_id: lineForm.categoryCode || null,
                  item_id: lineForm.itemId || null,
                  needbyfrom: lineForm.needbyfrom || null,
                  needbyto: lineForm.needbyto || null,
                };
                if (editingLine) {
                  updateLineMutation.mutate({ lineId: editingLine.id, data: payload });
                } else {
                  addLineMutation.mutate(payload);
                }
              }}
            >
              {(addLineMutation.isPending || updateLineMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingLine ? "Update Line" : "Add Line"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <InviteSuppliersSheet
        open={showAddSupplierDialog}
        onOpenChange={setShowAddSupplierDialog}
        excludeSupplierIds={invitedSupplierIds}
        onConfirm={inviteSelectedSuppliers}
        isConfirming={addSupplierMutation.isPending}
      />

      {/* ADD CRITERIA SHEET */}
      <Sheet
        open={showAddRequirementDialog}
        onOpenChange={(open) => {
          setShowAddRequirementDialog(open);
          if (!open) {
            setEditingRequirement(null);
            setReqForm({
              category: "",
              question: "",
              qvoption: "Required",
              qvtype: "Text",
              weight: "100",
              lovOptions: [],
            });
            setNewLovOption("");
          }
        }}
      >
        <SheetContent
          className="w-[600px] sm:max-w-[600px] overflow-y-auto"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>
              {editingRequirement
                ? "Edit Evaluation Criteria"
                : "Add Evaluation Criteria"}
            </SheetTitle>
            <SheetDescription>
              {editingRequirement
                ? "Update the evaluation criteria details."
                : "Add evaluation criteria used to evaluate and score bid responses."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-2 pb-6">
            <div>
              <Label htmlFor="criteria-category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={reqForm.category}
                onValueChange={(v) =>
                  setReqForm((f) => ({ ...f, category: v }))
                }
              >
                <SelectTrigger
                  id="criteria-category"
                  data-testid="select-criteria-category"
                >
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {businessCategories?.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="criteria-requirement">
                Requirement <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="criteria-requirement"
                placeholder="Enter Requirement"
                value={reqForm.question}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, question: e.target.value }))
                }
                rows={3}
                data-testid="input-criteria-question"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="criteria-value">
                  Value <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={reqForm.qvoption}
                  onValueChange={(v) =>
                    setReqForm((f) => ({ ...f, qvoption: v }))
                  }
                >
                  <SelectTrigger
                    id="criteria-value"
                    data-testid="select-criteria-option"
                  >
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Required">Required</SelectItem>
                    <SelectItem value="Optional">Optional</SelectItem>
                    <SelectItem value="Desirable">Desirable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="criteria-valuetype">
                  Value Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={reqForm.qvtype}
                  onValueChange={(v) =>
                    setReqForm((f) => ({
                      ...f,
                      qvtype: v,
                      lovOptions: v === "Text" ? [] : f.lovOptions,
                    }))
                  }
                >
                  <SelectTrigger
                    id="criteria-valuetype"
                    data-testid="select-criteria-valuetype"
                  >
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Text">Text</SelectItem>
                    <SelectItem value="Dropdown">Dropdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {reqForm.qvtype === "Dropdown" && (
              <div>
                <Label>
                  Dropdown Options <span className="text-destructive">*</span>
                </Label>
                <div className="border rounded-md">
                  {reqForm.lovOptions.length > 0 && (
                    <div className="divide-y">
                      {reqForm.lovOptions.map((opt, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-2 gap-2"
                        >
                          <span
                            className="text-sm truncate"
                            data-testid={`text-lov-option-${idx}`}
                          >
                            {opt}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() =>
                              setReqForm((f) => ({
                                ...f,
                                lovOptions: f.lovOptions.filter(
                                  (_, i) => i !== idx,
                                ),
                              }))
                            }
                            data-testid={`button-remove-lov-${idx}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
                          setReqForm((f) => ({
                            ...f,
                            lovOptions: [...f.lovOptions, newLovOption.trim()],
                          }));
                          setNewLovOption("");
                        }
                      }}
                      data-testid="input-lov-option"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!newLovOption.trim()}
                      onClick={() => {
                        if (newLovOption.trim()) {
                          setReqForm((f) => ({
                            ...f,
                            lovOptions: [...f.lovOptions, newLovOption.trim()],
                          }));
                          setNewLovOption("");
                        }
                      }}
                      data-testid="button-add-lov-option"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="criteria-weight">
                Weightage (Max Points){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="criteria-weight"
                type="number"
                placeholder="e.g. 20"
                min={1}
                max={90}
                step={1}
                value={reqForm.weight}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, weight: e.target.value }))
                }
                data-testid="input-criteria-weight"
              />
            </div>
          </div>
          <SheetFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowAddRequirementDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reqForm.category) {
                  toast({
                    title: "Required",
                    description: "Category is required.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!reqForm.question) {
                  toast({
                    title: "Required",
                    description: "Requirement is required.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!reqForm.weight) {
                  toast({
                    title: "Required",
                    description: "Weightage is required.",
                    variant: "destructive",
                  });
                  return;
                }
                const parsedWeight = Number(reqForm.weight);
                if (
                  !Number.isInteger(parsedWeight) ||
                  parsedWeight < 1 ||
                  parsedWeight > 100
                ) {
                  toast({
                    title: "Invalid Weightage",
                    description: "Weightage must be between 1 and 100.",
                    variant: "destructive",
                  });
                  return;
                }
                if (
                  reqForm.qvtype === "Dropdown" &&
                  reqForm.lovOptions.length === 0
                ) {
                  toast({
                    title: "Required",
                    description: "Add at least one dropdown option.",
                    variant: "destructive",
                  });
                  return;
                }
                const payload = {
                  category: reqForm.category,
                  question: reqForm.question,
                  qvoption: reqForm.qvoption,
                  qvtype: reqForm.qvtype,
                  weight: reqForm.weight,
                  lov:
                    reqForm.qvtype === "Dropdown"
                      ? reqForm.lovOptions.join(",")
                      : null,
                };
                if (editingRequirement) {
                  updateRequirementMutation.mutate(payload);
                } else {
                  addRequirementMutation.mutate(payload);
                }
              }}
              disabled={
                addRequirementMutation.isPending ||
                updateRequirementMutation.isPending
              }
              data-testid="button-submit-criteria"
            >
              {(addRequirementMutation.isPending ||
                updateRequirementMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
              {editingRequirement ? "Update" : "Submit"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ADD CLAUSE DIALOG */}
      <Sheet
        open={showAddClauseDialog}
        onOpenChange={(open) => {
          setShowAddClauseDialog(open);
          if (!open) {
            setClauseForm({ type: "terms", class_desc: "", class_ref: "" });
          }
        }}
      >
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              Add Term / Instruction
            </SheetTitle>
            <SheetDescription>
              Add a term or instruction clause to this bid.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-4 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="clause-type">Type</Label>
              <Select
                value={clauseForm.type}
                onValueChange={(v) => setClauseForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger
                  id="clause-type"
                  data-testid="select-clause-type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="terms">Terms</SelectItem>
                  <SelectItem value="instructions">Instructions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clause-desc">Description</Label>
              <Textarea
                id="clause-desc"
                value={clauseForm.class_desc}
                onChange={(e) =>
                  setClauseForm((f) => ({ ...f, class_desc: e.target.value }))
                }
                data-testid="input-clause-desc"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clause-ref">Reference (Optional)</Label>
              <Input
                id="clause-ref"
                value={clauseForm.class_ref}
                onChange={(e) =>
                  setClauseForm((f) => ({ ...f, class_ref: e.target.value }))
                }
                data-testid="input-clause-ref"
              />
            </div>
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddClauseDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!clauseForm.class_desc) {
                  toast({
                    title: "Required",
                    description: "Description is required.",
                    variant: "destructive",
                  });
                  return;
                }
                addClauseMutation.mutate(clauseForm);
              }}
              disabled={addClauseMutation.isPending}
              data-testid="button-submit-clause"
            >
              {addClauseMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Add
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ATTACH DOCUMENT SHEET */}
      <Sheet
        open={showAddAttachmentDialog}
        onOpenChange={(open) => {
          setShowAddAttachmentDialog(open);
          if (!open) {
            setAttachForm({
              attach_name: "",
              attach_desc: "",
              attach_source: "Lines",
              attach_type: "application/pdf",
            });
            setSelectedFile(null);
          }
        }}
      >
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Attach Document
            </SheetTitle>
            <SheetDescription>
              Attach a technical specification document to this bid.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 pt-2 pb-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="attach-desc">Description</Label>
                <Input
                  id="attach-desc"
                  value={attachForm.attach_desc}
                  onChange={(e) =>
                    setAttachForm((f) => ({
                      ...f,
                      attach_desc: e.target.value,
                    }))
                  }
                  placeholder="Enter description"
                  data-testid="input-attach-desc"
                />
              </div>
              <div>
                <Label htmlFor="attach-file">Attach File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="attach-file"
                    value={attachForm.attach_name}
                    readOnly
                    placeholder="No File Chosen"
                    className="flex-1"
                    data-testid="input-attach-name"
                  />
                  <input
                    type="file"
                    className="hidden"
                    data-testid="file-input-attach"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          toast({
                            title: "File Too Large",
                            description: "Maximum allowed size is 5MB.",
                            variant: "destructive",
                          });
                          e.target.value = "";
                          return;
                        }
                        setSelectedFile(file);
                        setAttachForm((f) => ({
                          ...f,
                          attach_name: file.name,
                          attach_type: file.type || "application/octet-stream",
                        }));
                      }
                    }}
                  />
                  <Button
                    variant="default"
                    onClick={() => {
                      const fileInput = document.querySelector(
                        '[data-testid="file-input-attach"]',
                      ) as HTMLInputElement;
                      fileInput?.click();
                    }}
                    data-testid="button-select-file"
                  >
                    Select
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum allowed size is 5MB
                </p>
              </div>
            </div>

            <SheetFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddAttachmentDialog(false)}
                data-testid="button-cancel-attach"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!attachForm.attach_desc) {
                    toast({
                      title: "Required",
                      description: "Description is required.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!attachForm.attach_name) {
                    toast({
                      title: "Required",
                      description: "Please select a file.",
                      variant: "destructive",
                    });
                    return;
                  }
                  addAttachmentMutation.mutate(attachForm);
                }}
                disabled={addAttachmentMutation.isPending}
                data-testid="button-submit-attachment"
              >
                {addAttachmentMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Attach
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* CRITERIA ATTACHMENT SHEET */}
      <Sheet
        open={showCriteriaAttachmentDialog}
        onOpenChange={(open) => {
          setShowCriteriaAttachmentDialog(open);
          if (!open) {
            setCriteriaAttachForm({
              attach_name: "",
              attach_desc: "",
              attach_source: "Requirements",
              attach_type: "application/pdf",
            });
            setSelectedCriteriaFile(null);
          }
        }}
      >
        <SheetContent
          className="w-[600px] sm:max-w-[600px] overflow-y-auto"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>
              <div className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" /> Attach Criteria Document
              </div>
            </SheetTitle>
            <SheetDescription>
              Attach evaluation criteria documents to be used during bid
              evaluation.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 pt-2 pb-6">
            <div>
              <Label htmlFor="criteria-attach-desc">Description</Label>
              <Input
                id="criteria-attach-desc"
                value={criteriaAttachForm.attach_desc}
                onChange={(e) =>
                  setCriteriaAttachForm((f) => ({
                    ...f,
                    attach_desc: e.target.value,
                  }))
                }
                placeholder="Enter description"
                data-testid="input-criteria-attach-desc"
              />
            </div>
            <div>
              <Label htmlFor="criteria-attach-file">Attach File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="criteria-attach-file"
                  value={criteriaAttachForm.attach_name}
                  readOnly
                  placeholder="No File Chosen"
                  className="flex-1"
                  data-testid="input-criteria-attach-name"
                />
                <input
                  type="file"
                  className="hidden"
                  data-testid="file-input-criteria-attach"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast({
                          title: "File Too Large",
                          description: "Maximum allowed size is 5MB.",
                          variant: "destructive",
                        });
                        e.target.value = "";
                        return;
                      }
                      setSelectedCriteriaFile(file);
                      setCriteriaAttachForm((f) => ({
                        ...f,
                        attach_name: file.name,
                        attach_type: file.type || "application/octet-stream",
                      }));
                    }
                  }}
                />
                <Button
                  variant="default"
                  onClick={() => {
                    const fileInput = document.querySelector(
                      '[data-testid="file-input-criteria-attach"]',
                    ) as HTMLInputElement;
                    fileInput?.click();
                  }}
                  data-testid="button-select-criteria-file"
                >
                  Select
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Maximum allowed size is 5MB
              </p>
            </div>

            <SheetFooter>
              <Button
                variant="outline"
                onClick={() => setShowCriteriaAttachmentDialog(false)}
                data-testid="button-cancel-criteria-attach"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!criteriaAttachForm.attach_desc) {
                    toast({
                      title: "Required",
                      description: "Description is required.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!criteriaAttachForm.attach_name) {
                    toast({
                      title: "Required",
                      description: "Please select a file.",
                      variant: "destructive",
                    });
                    return;
                  }
                  addCriteriaAttachmentMutation.mutate(criteriaAttachForm);
                }}
                disabled={addCriteriaAttachmentMutation.isPending}
                data-testid="button-submit-criteria-attachment"
              >
                {addCriteriaAttachmentMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Attach
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* TERMS ATTACHMENT SHEET */}
      <Sheet
        open={showTermsAttachmentDialog}
        onOpenChange={(open) => {
          setShowTermsAttachmentDialog(open);
          if (!open) {
            setTermsAttachForm({
              attach_name: "",
              attach_desc: "",
              attach_source: "Terms",
              attach_type: "application/pdf",
            });
            setSelectedTermsFile(null);
          }
        }}
      >
        <SheetContent
          className="w-[420px] sm:max-w-[420px] overflow-y-auto"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>
              <div className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" /> Attach Terms Document
              </div>
            </SheetTitle>
            <SheetDescription>
              Attach terms and instructions documents to this bid.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 pt-4 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="terms-attach-desc">Description</Label>
              <Input
                id="terms-attach-desc"
                value={termsAttachForm.attach_desc}
                onChange={(e) =>
                  setTermsAttachForm((f) => ({
                    ...f,
                    attach_desc: e.target.value,
                  }))
                }
                placeholder="Enter description"
                data-testid="input-terms-attach-desc"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms-attach-file">Attach File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="terms-attach-file"
                  value={termsAttachForm.attach_name}
                  readOnly
                  placeholder="No File Chosen"
                  className="flex-1"
                  data-testid="input-terms-attach-name"
                />
                <input
                  type="file"
                  className="hidden"
                  data-testid="file-input-terms-attach"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast({
                          title: "File Too Large",
                          description: "Maximum allowed size is 5MB.",
                          variant: "destructive",
                        });
                        e.target.value = "";
                        return;
                      }
                      setSelectedTermsFile(file);
                      setTermsAttachForm((f) => ({
                        ...f,
                        attach_name: file.name,
                        attach_type: file.type || "application/octet-stream",
                      }));
                    }
                  }}
                />
                <Button
                  variant="default"
                  onClick={() => {
                    const fileInput = document.querySelector(
                      '[data-testid="file-input-terms-attach"]',
                    ) as HTMLInputElement;
                    fileInput?.click();
                  }}
                  data-testid="button-select-terms-file"
                >
                  Select
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Maximum allowed size is 5MB
              </p>
            </div>

            <SheetFooter>
              <Button
                variant="outline"
                onClick={() => setShowTermsAttachmentDialog(false)}
                data-testid="button-cancel-terms-attach"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!termsAttachForm.attach_desc) {
                    toast({
                      title: "Required",
                      description: "Description is required.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!termsAttachForm.attach_name) {
                    toast({
                      title: "Required",
                      description: "Please select a file.",
                      variant: "destructive",
                    });
                    return;
                  }
                  addTermsAttachmentMutation.mutate(termsAttachForm);
                }}
                disabled={addTermsAttachmentMutation.isPending}
                data-testid="button-submit-terms-attachment"
              >
                {addTermsAttachmentMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Attach
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>

      {/* EDIT HEADER SHEET */}
      <BidFormSheet
        open={showEditHeaderDialog}
        onOpenChange={setShowEditHeaderDialog}
        editBidId={bidId}
        initialData={editBidInitialData}
        prNumber={bid?.pr_number}
      />

      {/* DELETE CONFIRMATION */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this {deleteConfirm?.type}? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PUBLISH CONFIRMATION */}
      <AlertDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Bid to Suppliers</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to publish this bid? Once published, invited
              suppliers will be able to view and respond. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-publish-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handlePublish()}
              data-testid="button-publish-confirm"
            >
              {publishBidMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI STRATEGY ADVISOR DIALOG */}
      <Dialog
        open={showAIStrategyDialog}
        onOpenChange={setShowAIStrategyDialog}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              AI Bid Strategy Recommendation
            </DialogTitle>
            <DialogDescription>
              Based on analysis of historical bids for similar line items
            </DialogDescription>
          </DialogHeader>
          {aiStrategy && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 bg-purple-50/50 dark:bg-purple-950/20">
                  <p className="text-xs text-muted-foreground mb-1">
                    Recommended Bid Type
                  </p>
                  {aiStrategy.recommendedType ? (
                    <>
                      <p
                        className="text-lg font-semibold text-purple-700 dark:text-purple-300"
                        data-testid="text-ai-rec-type"
                      >
                        {aiStrategy.recommendedType}
                      </p>
                      <p
                        className="text-xs text-muted-foreground mt-1"
                        data-testid="text-ai-rec-type-basis"
                      >
                        Based on {aiStrategy.recommendedTypeCount} similar
                        historical bids
                      </p>
                    </>
                  ) : (
                    <p
                      className="text-sm text-muted-foreground"
                      data-testid="text-ai-rec-type-none"
                    >
                      No recommendation — insufficient similar published bid
                      history
                    </p>
                  )}
                </div>
                <div className="rounded-lg border p-3 bg-purple-50/50 dark:bg-purple-950/20">
                  <p className="text-xs text-muted-foreground mb-1">
                    Recommended Duration
                  </p>
                  {aiStrategy.recommendedDuration != null ? (
                    <p
                      className="text-lg font-semibold text-purple-700 dark:text-purple-300"
                      data-testid="text-ai-rec-duration"
                    >
                      {aiStrategy.recommendedDuration} days
                    </p>
                  ) : (
                    <p
                      className="text-sm text-muted-foreground"
                      data-testid="text-ai-rec-duration"
                    >
                      No recommendation — insufficient similar bid history
                    </p>
                  )}
                </div>
              </div>
              <div
                className={`grid gap-3 ${aiStrategy.showAvgResponseRate ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {aiStrategy.showAvgResponseRate && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Avg Response Rate
                    </p>
                    <p
                      className="text-sm font-medium"
                      data-testid="text-ai-avg-response-rate"
                    >
                      {aiStrategy.avgResponseRate != null
                        ? `${aiStrategy.avgResponseRate}%`
                        : "No historical invitation data for invited suppliers"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Average of invited supplier&apos;s historical responses 
                      
                    </p>
                  </div>
                )}
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Users className="h-3 w-3" /> Historical Bids
                  </p>
                  <p className="text-sm font-medium">
                    {aiStrategy.historicalBids} bids analyzed
                  </p>
                </div>
              </div>
              {aiStrategy.pricingInsight && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Pricing Insight
                  </p>
                  <p className="text-sm">{aiStrategy.pricingInsight}</p>
                </div>
              )}
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Reasoning
                </p>
                <p className="text-sm">{aiStrategy.reasoning}</p>
              </div>
              {aiStrategy.tips?.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Target className="h-3 w-3" /> Tips
                  </p>
                  <ul className="space-y-1">
                    {aiStrategy.tips.map((tip: string, i: number) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <Zap className="h-3 w-3 mt-1 text-purple-500 shrink-0" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAIStrategyDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI VENDOR RECOMMENDATIONS DIALOG */}
      <AIVendorRecsDialog
        open={showAIVendorPanel}
        onOpenChange={setShowAIVendorPanel}
        recommendations={aiVendorRecs}
        onInvite={inviteAIVendors}
      />

      {/* AI REQUIREMENTS PREVIEW DIALOG */}
      <AIReqPreviewDialog
        open={showAIReqPreview}
        onOpenChange={setShowAIReqPreview}
        requirements={aiReqPreview}
        onAdd={addAIRequirements}
      />

      {/* AI REGENERATE / RE-EVALUATE DIALOG */}
      <RegenerateReqDialog
        open={showRegenDialog}
        onOpenChange={setShowRegenDialog}
        plan={regenPlan}
        onApply={applyRegenerated}
      />

      {/* AI CLAUSES PREVIEW DIALOG */}
      <AIClausePreviewDialog
        open={showAIClausePreview}
        onOpenChange={setShowAIClausePreview}
        clauses={aiClausePreview}
        onAdd={addAIClauses}
      />

      {/* SAVE AS TEMPLATE DIALOG */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save As Template</DialogTitle>
            <DialogDescription>
              Save this bid as a reusable template. Future bids can be created
              from this template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Enter a descriptive template name"
                data-testid="input-template-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTemplateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!templateName.trim()) {
                  toast({
                    title: "Required",
                    description: "Template name is required.",
                    variant: "destructive",
                  });
                  return;
                }
                saveAsTemplateMutation.mutate(templateName.trim());
              }}
              disabled={saveAsTemplateMutation.isPending}
              data-testid="button-submit-template"
            >
              {saveAsTemplateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Place Proxy Sheet */}
      <Sheet open={showProxySheet} onOpenChange={(open) => { if (!open) setShowProxySheet(false); }}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Place Proxy Bid Response
            </SheetTitle>
            <SheetDescription>
              Submit a bid response on behalf of an invited vendor.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* Vendor Select */}
            <div className="space-y-1">
              <Label>
                Vendor <span className="text-destructive">*</span>
              </Label>
              <Select
                value={proxySupplier ? String(proxySupplier.supplier_id) : ""}
                onValueChange={(val) => {
                  const s = (suppliers || []).find((s: any) => String(s.supplier_id) === val);
                  setProxySupplier(s || null);
                  setProxyLines({});
                  setProxyRequirements({});
                  setProxyActiveTab("financial");
                }}
              >
                <SelectTrigger data-testid="select-proxy-vendor">
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {(suppliers || []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.supplier_id)}>
                      {s.supplier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {proxySupplier && (
              <Tabs value={proxyActiveTab} onValueChange={setProxyActiveTab}>
                <TabsList className={cn("grid w-full", (requirements?.length ?? 0) > 0 ? "grid-cols-2" : "grid-cols-1")}>
                  {(requirements?.length ?? 0) > 0 && (
                    <TabsTrigger value="technical">Technical Response</TabsTrigger>
                  )}
                  <TabsTrigger value="financial">Financial Response</TabsTrigger>
                </TabsList>

                {/* Technical Response Tab */}
                {(requirements?.length ?? 0) > 0 && (
                  <TabsContent value="technical" className="mt-3">
                    <div className="border rounded-md overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Requirement</TableHead>
                            <TableHead className="w-32">Response</TableHead>
                            <TableHead>Remarks</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(requirements || []).map((req: any) => {
                            const entry = proxyRequirements[req.id] || { answer: "", remarks: "" };
                            return (
                              <TableRow key={req.id}>
                                <TableCell className="text-sm">{req.category}</TableCell>
                                <TableCell className="text-sm max-w-[200px] whitespace-normal">{req.question}</TableCell>
                                <TableCell>
                                  <Select
                                    value={entry.answer}
                                    onValueChange={(val) =>
                                      setProxyRequirements((prev) => ({
                                        ...prev,
                                        [req.id]: { ...entry, answer: val },
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Yes">Yes</SelectItem>
                                      <SelectItem value="No">No</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    className="h-8 text-xs"
                                    placeholder="Remarks"
                                    value={entry.remarks}
                                    onChange={(e) =>
                                      setProxyRequirements((prev) => ({
                                        ...prev,
                                        [req.id]: { ...entry, remarks: e.target.value },
                                      }))
                                    }
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                )}

                {/* Financial Response Tab */}
                <TabsContent value="financial" className="mt-3 space-y-4">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="w-20">Qty</TableHead>
                          <TableHead className="w-20">UOM</TableHead>
                          <TableHead className="w-32">Unit Price <span className="text-destructive">*</span></TableHead>
                          <TableHead className="w-32">Disc. Unit Price</TableHead>
                          <TableHead className="w-36">Promised Date <span className="text-destructive">*</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(lines || []).map((line: any) => {
                          const entry = proxyLines[line.id] || { bidprice: "", discprice: "", promisedDate: "" };
                          return (
                            <TableRow key={line.id}>
                              <TableCell className="text-sm">{line.description}</TableCell>
                              <TableCell className="text-sm">{line.quantity}</TableCell>
                              <TableCell className="text-sm">{line.uom}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="h-8 text-xs w-28"
                                  placeholder="0.00"
                                  value={entry.bidprice}
                                  min={0}
                                  onChange={(e) =>
                                    setProxyLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...entry, bidprice: e.target.value },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="h-8 text-xs w-28"
                                  placeholder="0.00"
                                  value={entry.discprice}
                                  min={0}
                                  onChange={(e) =>
                                    setProxyLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...entry, discprice: e.target.value },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="date"
                                  className="h-8 text-xs w-36"
                                  value={entry.promisedDate}
                                  min={new Date().toISOString().split("T")[0]}
                                  onChange={(e) =>
                                    setProxyLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...entry, promisedDate: e.target.value },
                                    }))
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Reference & Comments */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>
                        Reference Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder="Enter reference number"
                        value={proxyRefNumber}
                        onChange={(e) => setProxyRefNumber(e.target.value)}
                        data-testid="input-proxy-ref-number"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Comments <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        placeholder="Enter comments"
                        rows={2}
                        value={proxyComments}
                        onChange={(e) => setProxyComments(e.target.value)}
                        data-testid="input-proxy-comments"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {!proxySupplier && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a vendor to begin entering the proxy response.</p>
              </div>
            )}
          </div>

          <SheetFooter className="border-t pt-4 mt-auto">
            <Button variant="outline" onClick={() => setShowProxySheet(false)} data-testid="button-proxy-cancel">
              Cancel
            </Button>
            {(requirements?.length ?? 0) > 0 && proxyActiveTab === "technical" && (
              <Button onClick={() => setProxyActiveTab("financial")} data-testid="button-proxy-next">
                Next
              </Button>
            )}
            {(proxyActiveTab === "financial" || (requirements?.length ?? 0) === 0) && (
              <Button
                onClick={handleSubmitProxy}
                disabled={placeProxyMutation.isPending || !proxySupplier}
                data-testid="button-proxy-submit"
              >
                {placeProxyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Response
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
