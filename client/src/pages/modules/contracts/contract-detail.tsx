import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import { ViewChecklistButton } from "@/components/view-checklist-button";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import TiptapClauseEditor from "@/components/tiptap-clause-editor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog, DialogContent,
  DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent,
  SheetDescription,
  SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookMarked,
  BookOpen,
  Braces,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft, ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Edit,
  Eye,
  File,
  FileCheck,
  FileText,
  FolderOpen,
  GripVertical,
  HelpCircle,
  History,
  Info,
  Layers,
  LayoutList,
  Loader2,
  Mail,
  MessageSquare,
  Package,
  PanelLeftOpen, PanelRight,
  Paperclip,
  Pencil,
  PenLine,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Square,
  Store,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Truck,
  UploadCloud,
  User,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { FormSheet } from "@/components/form-sheet";
import ContractFormSheet from "./contract-form-sheet";
import { CreatePOFromContractSheet } from "./create-po-from-contract-sheet";

interface ContractHeader {
  id: number;
  title: string;
  description: string | null;
  status: string;
  type: string | null;
  version: string | null;
  contr_ref_no: string | null;
  owner: string | null;
  owner_name: string | null;
  requestor: string | null;
  requestor_name: string | null;
  requestor_email: string | null;
  department: string | null;
  department_name: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  contract_amount: string | null;
  is_renewable: string | null;
  project_name: string | null;
  project_ref_no: string | null;
  creation_date: string | null;
  created_by: string | null;
  approvers_list: string | null;
  appr_status: string | null;
  curr_appr_comments: string | null;
  is_owner?: boolean;
  is_approver?: boolean;
  attribute_12?: string;
}

interface ClauseComment {
  id: number;
  contr_term_id: number;
  action_taken_by: string;
  action_taken_by_name: string;
  action_date: string;
  attribute_2: string | null; // 'Y' = resolved
  attribute_3: string | null; // selected text excerpt
  attribute_4: string | null; // anchor UUID
  attribute_5: string | null; // comment body
}

interface ClauseHistoryEntry {
  id: number;
  action: string; // 'Comment' | 'Modified' | 'Agreed'
  action_date: string;
  action_taken_by: string;
  action_taken_by_name: string;
  attribute_1: string | null;
  attribute_2: string | null;
  attribute_3: string | null;
  attribute_4: string | null;
  attribute_5: string | null;
  term_details: string | null;
  contr_term_id: number;
}

interface ContractVendor {
  id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_contact: string | null;
  supplier_contact_no: string | null;
  supplier_contact_email: string | null;
}

interface Reviewer {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  level: number;
}

interface SupplierOption {
  id: number;
  companyName: string | null;
  emailId?: string | null;
  phone?: string | null;
}

interface UserOption {
  id: number;
  name: string;
  email_id: string;
  mobile_no?: string;
  department_name?: string;
}

const ROLE_NAMES = [
  "ROLE_PROCUREMENT_OFFICER",
  "ROLE_PROCUREMENT_MANAGER",
  "ROLE_FINANCE_OFFICER",
  "ROLE_FINANCE_MANAGER",
  "ROLE_DEPARTMENT_HEAD",
  "ROLE_SYSADMIN",
  "ROLE_SUPERADMIN",
  "ROLE_DEPARTMENT_USER",
];

function formatApproverDisplayName(approver: string): string {
  const trimmed = approver.trim();
  if (ROLE_NAMES.some(r => trimmed.toUpperCase() === r)) {
    return trimmed.replace(/^ROLE_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  if (trimmed.includes("@")) {
    return trimmed.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  return trimmed;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Active: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  Approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Expired: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  Terminated: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "Pending Approval": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Pending Signature": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "Under Negotiation": "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "Negotiation Under Review": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Signed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Accepted: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

const CONTRACT_STEP_KEYS = ["draft", "review", "negotiation", "approval", "signature", "active", "expired"] as const;
const CONTRACT_STEP_LABELS: Record<typeof CONTRACT_STEP_KEYS[number], string> = {
  draft: "Draft",
  review: "Review",
  negotiation: "Negotiation",
  approval: "Approval",
  signature: "Signature",
  active: "Active",
  expired: "Expired",
};

function deriveContractStepPosition(status: string): { activeStep: string | null; completedSteps: string[]; note: string | null; isException: boolean } {
  switch (status) {
    case "Draft":
      return { activeStep: "draft", completedSteps: [], note: "Contract is being drafted. Add scope of work and terms, then submit for review.", isException: false };
    case "Under Review":
      return { activeStep: "review", completedSteps: ["draft"], note: "Contract is with the review team. Waiting for reviewers to accept or reject.", isException: false };
    case "Review Rejected":
      return { activeStep: "review", completedSteps: ["draft"], note: "Review was rejected. Update the contract and resubmit for review.", isException: false };
    case "More Info Required":
      return { activeStep: "review", completedSteps: ["draft"], note: "Reviewer requested more information. Update the contract and resubmit for review.", isException: false };
    case "Review Completed":
      return { activeStep: "review", completedSteps: ["draft"], note: "Review completed. Publish the contract to the supplier to begin negotiation.", isException: false };
    case "Vendor Submit For Negotiation":
    case "Supplier Submit For Negotiation":
      return { activeStep: "negotiation", completedSteps: ["draft", "review"], note: "Supplier submitted a negotiation. Review their changes and respond.", isException: false };
    case "Negotiation Under Review":
      return { activeStep: "negotiation", completedSteps: ["draft", "review"], note: "Owner's negotiation response is with the review team. Waiting for reviewers to accept or reject before it goes back to the supplier.", isException: false };
    case "Under Negotiation":
      return { activeStep: "negotiation", completedSteps: ["draft", "review"], note: "Published to the supplier. Ball is in the supplier's court — they can submit acceptance or submit a negotiation.", isException: false };
    case "Accepted":
      return { activeStep: "negotiation", completedSteps: ["draft", "review"], note: "Supplier accepted the contract. Submit it for approval to continue.", isException: false };
    case "Pending Approval":
      return { activeStep: "approval", completedSteps: ["draft", "review", "negotiation"], note: "Contract is awaiting approver sign-off.", isException: false };
    case "Approved":
      return { activeStep: "approval", completedSteps: ["draft", "review", "negotiation"], note: "Contract approved. Send it for signature to proceed.", isException: false };
    case "Pending Signature":
      return { activeStep: "signature", completedSteps: ["draft", "review", "negotiation", "approval"], note: "Awaiting signatures from all signing parties.", isException: false };
    case "Signed":
      return { activeStep: "signature", completedSteps: ["draft", "review", "negotiation", "approval"], note: "All parties have signed. Contract will move to Active on the start date.", isException: false };
    case "Active":
      return { activeStep: "active", completedSteps: ["draft", "review", "negotiation", "approval", "signature"], note: "Contract is active and in effect.", isException: false };
    case "Expired":
      return { activeStep: "expired", completedSteps: ["draft", "review", "negotiation", "approval", "signature", "active"], note: "Contract has passed its end date.", isException: false };
    case "Terminated":
      return { activeStep: null, completedSteps: [], note: "Contract was terminated before completion.", isException: true };
    case "Cancelled":
      return { activeStep: null, completedSteps: [], note: "Contract was cancelled.", isException: true };
    default:
      return { activeStep: null, completedSteps: [], note: null, isException: false };
  }
}

function ContractStepper({ status }: { status: string }) {
  const { activeStep, completedSteps, note, isException } = deriveContractStepPosition(status);

  return (
    <Card data-testid="card-contract-stepper">
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground mb-2">Indicating current step to track the Flow Status of the Contract.</p>
        <div className="flex items-center flex-wrap gap-y-1">
          {CONTRACT_STEP_KEYS.map((key, idx) => {
            const isCompleted = !isException && completedSteps.includes(key);
            const isCurrent = !isException && activeStep === key;

            return (
              <div key={key} className="flex items-center" data-testid={`step-${idx}`}>
                <div
                  className={`
                    flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors
                    ${isCompleted
                      ? "bg-emerald-600 text-white dark:bg-emerald-700"
                      : isCurrent
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                        : isException
                          ? "bg-muted text-muted-foreground line-through"
                          : "bg-muted text-muted-foreground"
                    }
                  `}
                >
                  <span className={`
                    flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold shrink-0
                    ${isCompleted
                      ? "bg-white/20"
                      : isCurrent
                        ? "bg-white/20"
                        : "bg-foreground/10"
                    }
                  `}>
                    {isCompleted ? <Check className="h-2.5 w-2.5" /> : idx + 1}
                  </span>
                  {CONTRACT_STEP_LABELS[key]}
                </div>
                {idx < CONTRACT_STEP_KEYS.length - 1 && (
                  <div className={`w-3 h-0.5 shrink-0 ${isCompleted ? "bg-emerald-600 dark:bg-emerald-700" : "bg-muted"}`} />
                )}
              </div>
            );
          })}
        </div>
        {note && (
          <div className="mt-3 rounded-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs">
            {note}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value, subValue, icon: Icon }: { label: string; value: string | null | undefined; subValue?: string | null; icon?: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm font-medium">{value || "—"}</p>
      {subValue && <p className="text-xs text-muted-foreground mt-0.5">{subValue}</p>}
    </div>
  );
}

const SCHED_TYPES = [
  { value: 'fixed',     label: 'Fixed' },
  { value: 'frequency', label: 'Frequency Based' },
  { value: 'flexible',  label: 'Flexible' },
  { value: 'milestone', label: 'MileStone' },
  { value: 'amount',    label: 'Amount Based' },
] as const;

const PAYMENT_TYPES = [
  { value: 'advance',   label: 'Advance' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'progress',  label: 'Progress' },
  { value: 'retention', label: 'Retention' },
  { value: 'final',     label: 'Final Payment' },
] as const;

// ─── Clause Comments Panel ────────────────────────────────────────────────────

function ClauseCommentsPanel({
  comments,
  clauseId,
  canResolve,
  onResolve,
}: {
  comments: ClauseComment[];
  clauseId: number;
  canResolve: boolean;
  onResolve: (commentId: number) => void;
}) {
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const open = comments.filter(c => c.attribute_2 !== "Y");
  const resolved = comments.filter(c => c.attribute_2 === "Y");
  const [showResolved, setShowResolved] = useState(false);
  if (comments.length === 0) return null;

  const handleResolve = async (id: number) => {
    setResolvingId(id);
    try { await onResolve(id); } finally { setResolvingId(null); }
  };

  return (
    <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10 text-xs" data-testid={`comments-panel-${clauseId}`}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-amber-200 dark:border-amber-800">
        <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold text-amber-800 dark:text-amber-300">
          {open.length > 0 ? `${open.length} open comment${open.length > 1 ? "s" : ""}` : "Comments"}
        </span>
        {resolved.length > 0 && (
          <button
            onClick={() => setShowResolved(v => !v)}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            {showResolved ? "Hide" : `Show ${resolved.length} resolved`}
          </button>
        )}
      </div>
      <div className="divide-y divide-amber-100 dark:divide-amber-900">
        {open.map(c => (
          <div key={c.id} className="px-3 py-2 flex flex-col gap-1" data-testid={`comment-item-${c.id}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-5 w-5 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-[10px] font-bold text-amber-800 dark:text-amber-200 flex-shrink-0">
                  {(c.action_taken_by_name || "?")[0].toUpperCase()}
                </div>
                <span className="font-medium text-foreground">{c.action_taken_by_name || c.action_taken_by}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {formatDate(c.action_date)}
                </span>
              </div>
              {canResolve && (
                <button
                  onClick={() => handleResolve(c.id)}
                  disabled={resolvingId === c.id}
                  data-testid={`button-resolve-comment-${c.id}`}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30 disabled:opacity-40"
                >
                  <CheckCheck className="h-3 w-3" />
                  {resolvingId === c.id ? "…" : "Resolve"}
                </button>
              )}
            </div>
            {c.attribute_3 && (
              <div className="text-[10px] text-muted-foreground bg-amber-100 dark:bg-amber-900/30 rounded px-1.5 py-0.5 italic border-l-2 border-amber-400 truncate">
                "{c.attribute_3}"
              </div>
            )}
            <p className="text-foreground leading-relaxed">{c.attribute_5}</p>
          </div>
        ))}
        {showResolved && resolved.map(c => (
          <div key={c.id} className="px-3 py-2 flex flex-col gap-1 opacity-50" data-testid={`comment-resolved-${c.id}`}>
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {(c.action_taken_by_name || "?")[0].toUpperCase()}
              </div>
              <span className="font-medium line-through">{c.action_taken_by_name || c.action_taken_by}</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Resolved</Badge>
            </div>
            {c.attribute_3 && (
              <div className="text-[10px] text-muted-foreground italic truncate">"{c.attribute_3}"</div>
            )}
            <p className="line-through text-muted-foreground">{c.attribute_5}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<insert[^>]*>([\s\S]*?)<\/insert>/gi, "⟦+$1⟧")
    .replace(/<delete[^>]*>([\s\S]*?)<\/delete>/gi, "⟦-$1⟧")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function ClauseHistorySheet({ clauseId, clauseName, open, onClose, hasUnsaved }: {
  clauseId: number | null;
  clauseName: string;
  open: boolean;
  onClose: () => void;
  hasUnsaved?: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const { data: history = [], isLoading } = useQuery<ClauseHistoryEntry[]>({
    queryKey: ["/api/contracts/terms", clauseId, "history"],
    queryFn: () => apiRequest("GET", `/api/contracts/terms/${clauseId}/history`).then(r => r.json()),
    enabled: open && clauseId !== null,
  });

  const sorted = [...history].sort((a, b) => new Date(b.action_date).getTime() - new Date(a.action_date).getTime());

  const actionMeta: Record<string, { label: string; color: string; icon: ReactNode }> = {
    Comment:  { label: "Comment",  color: "bg-amber-100 text-amber-800 border-amber-300",   icon: <MessageSquare className="h-3.5 w-3.5" /> },
    Modified: { label: "Modified", color: "bg-blue-100 text-blue-800 border-blue-300",       icon: <Pencil className="h-3.5 w-3.5" /> },
    Agreed:   { label: "Agreed",   color: "bg-green-100 text-green-800 border-green-300",    icon: <CheckCheck className="h-3.5 w-3.5" /> },
  };

  const initials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Clause History
          </SheetTitle>
          <SheetDescription className="text-xs truncate">{clauseName || "Clause"}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {hasUnsaved && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed">
                This clause has <strong>unsaved changes</strong>. Save the clause first — edits are recorded in history on save.
              </p>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <History className="h-8 w-8 opacity-30" />
              <p className="text-sm">No history recorded for this clause yet.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-5">
                {sorted.map((entry) => {
                  const meta = actionMeta[entry.action] || { label: entry.action, color: "bg-muted text-muted-foreground border-border", icon: <History className="h-3.5 w-3.5" /> };
                  const isExpanded = expandedIds.has(entry.id);
                  const plainText = entry.term_details ? stripHtml(entry.term_details) : null;
                  const PREVIEW_LEN = 180;
                  return (
                    <div key={entry.id} className="relative pl-10">
                      <div className="absolute left-2 top-1 h-5 w-5 rounded-full bg-background border-2 border-primary/30 flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      </div>

                      <div className="rounded-lg border bg-card p-3 space-y-2 shadow-sm">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
                              {initials(entry.action_taken_by_name || entry.action_taken_by || "?")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-semibold">{entry.action_taken_by_name || entry.action_taken_by}</span>
                          {entry.attribute_2 === "EXTERNAL" && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-300 text-violet-700 bg-violet-50">Supplier</Badge>
                          )}
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border flex items-center gap-1 ${meta.color}`}>
                            {meta.icon}{meta.label}
                          </Badge>
                          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{formatDate(entry.action_date, true)}</span>
                        </div>

                        {/* Comment body */}
                        {entry.action === "Comment" && (
                          <>
                            {entry.attribute_3 && (
                              <div className="rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300 italic">
                                "{entry.attribute_3}"
                              </div>
                            )}
                            {entry.attribute_5 && (
                              <p className="text-xs text-foreground">{entry.attribute_5}</p>
                            )}
                          </>
                        )}

                        {/* Modified body — shows PREVIOUS clause text before the edit */}
                        {entry.action === "Modified" && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Previous version</p>
                            {plainText ? (
                              <div className="rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2.5 py-2 text-[11px] text-blue-900 dark:text-blue-200 leading-relaxed">
                                {isExpanded ? plainText : plainText.slice(0, PREVIEW_LEN) + (plainText.length > PREVIEW_LEN ? "…" : "")}
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground italic">No previous content recorded</p>
                            )}
                            {plainText && plainText.length > PREVIEW_LEN && (
                              <button
                                onClick={() => toggleExpand(entry.id)}
                                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {isExpanded ? "Show less" : "Show full text"}
                              </button>
                            )}
                            {entry.attribute_3 && (
                              <p className="text-[11px] text-muted-foreground">Note: {entry.attribute_3}</p>
                            )}
                          </div>
                        )}

                        {/* Agreed body */}
                        {entry.action === "Agreed" && (
                          <div className="space-y-1.5">
                            {entry.attribute_1 && (
                              <p className="text-xs text-green-700 dark:text-green-400">{entry.attribute_1}</p>
                            )}
                            {entry.term_details && plainText && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Agreed text</p>
                                <div className="rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-2.5 py-2 text-[11px] text-green-900 dark:text-green-200 leading-relaxed">
                                  {isExpanded ? plainText : plainText.slice(0, PREVIEW_LEN) + (plainText.length > PREVIEW_LEN ? "…" : "")}
                                </div>
                                {plainText.length > PREVIEW_LEN && (
                                  <button
                                    onClick={() => toggleExpand(entry.id)}
                                    className="text-[10px] text-green-600 dark:text-green-400 hover:underline"
                                  >
                                    {isExpanded ? "Show less" : "Show full text"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ContractDetail() {
  const [, params] = useRoute("/app/contracts/:id");
  const contractId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [ownerSubmitNegOpen, setOwnerSubmitNegOpen] = useState(false);
  const [submitForApprovalOpen, setSubmitForApprovalOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComments, setRejectComments] = useState("");
  const [negoAcceptOpen, setNegoAcceptOpen] = useState(false);
  const [negoRejectOpen, setNegoRejectOpen] = useState(false);
  const [negoRejectComments, setNegoRejectComments] = useState("");
  const [historyClauseId, setHistoryClauseId] = useState<number | null>(null);
  const [historyClauseName, setHistoryClauseName] = useState("");
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"Approve" | "Reject" | "More">("Approve");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [sendForSigningOpen, setSendForSigningOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [signingPanelOpen, setSigningPanelOpen] = useState(false);
  const [signingParty, setSigningParty] = useState<"first" | "second">("first");
  const [signingPartyName, setSigningPartyName] = useState("");
  const [signMode, setSignMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");
  const signCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'classic' | 'modern'>('classic');
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [rightPanel, setRightPanel] = useState<null | 'details' | 'vendors' | 'team' | 'variables' | 'sow' | 'delivery' | 'history' | 'audit' | 'approval'>(null);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [reviewerDialogOpen, setReviewerDialogOpen] = useState(false);
  const [delivSchedOpen, setDelivSchedOpen] = useState(false);
  const [editingDelivSched, setEditingDelivSched] = useState<any>(null);
  const emptyDelivForm = { deliverable_name: '', details: '', schedule_type: 'fixed', schedule_date: '', tentative_date: '', elasped_days: '', amt_milestone: '', pcnt_milestone: '', schedule_frequency: '' };
  const [delivSchedForm, setDelivSchedForm] = useState(emptyDelivForm);
  const [payTermOpen, setPayTermOpen] = useState(false);
  const [editingPayTerm, setEditingPayTerm] = useState<any>(null);
  const emptyPayTermForm = { name: '', payment_type: 'advance', period: '', amt_milestone: '', pcnt_milestone: '' };
  const [payTermForm, setPayTermForm] = useState(emptyPayTermForm);
  const [activeTab, setActiveTab] = useState("scope-of-work");
  const [sowSheetOpen, setSowSheetOpen] = useState(false);
  const [editingSow, setEditingSow] = useState<any>(null);
  const [sowForm, setSowForm] = useState({ description: "", quantity: "", uom: "", unit_cost: "", start_date: "", deliverydate: "", specifications: "", linetype: "Goods", categoryCode: "", categoryName: "", itemId: "", itemName: "" });
  const [deleteSowId, setDeleteSowId] = useState<number | null>(null);
  const [createPODialogOpen, setCreatePODialogOpen] = useState(false);
  const [createdPoNumber, setCreatedPoNumber] = useState<string | null>(null);
  const [itemEntryMode, setItemEntryMode] = useState<"master" | "freetext">("master");
  const [itemOpen, setItemOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [attachForm, setAttachForm] = useState({ attach_desc: "", attach_name: "", attach_type: "application/pdf" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteAttachId, setDeleteAttachId] = useState<number | null>(null);

  const [localClauses, setLocalClauses] = useState<any[]>([]);
  const [dirtyClauses, setDirtyClauses] = useState<Set<number>>(new Set());
  const [clauseResetCounters, setClauseResetCounters] = useState<Record<number, number>>({});
  const [expandedClauseId, setExpandedClauseId] = useState<number | null>(null);
  const [modernEditingClause, setModernEditingClause] = useState<number | null>(null);
  const [clausePanelCollapsed, setClausePanelCollapsed] = useState(false);
  const [clauseLibSearch, setClauseLibSearch] = useState("");
  const [clauseLibTab, setClauseLibTab] = useState<"added" | "library">("added");
  const [dragClauseId, setDragClauseId] = useState<number | null>(null);
  const [dragOverClauseId, setDragOverClauseId] = useState<number | null>(null);
  const [dragLibraryClause, setDragLibraryClause] = useState<any | null>(null);
  const [libDragOverLeft, setLibDragOverLeft] = useState(false);
  const [libDragOverCenter, setLibDragOverCenter] = useState(false);
  const [savingClauses, setSavingClauses] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [deleteClauseId, setDeleteClauseId] = useState<number | null>(null);
  const clausesInitialized = useRef(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [reviewerPage, setReviewerPage] = useState(1);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

   const getAuthHeaders = (): Record<string, string> => {
      try {
        const parsed = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
        return {
          "x-user-email": parsed.userId || "",
          "x-user-name": parsed.userName || "",
        };
      } catch {
        return {};
      }
    };
  useEffect(() => {
    const loadPreview = async () => {
      try {
        const response = await fetch(
          `/api/contracts/${contractId}/preview`,
          {
            headers: getAuthHeaders(),
          }
        );

        const blob = await response.blob();
        setPreviewUrl(URL.createObjectURL(blob));
      } catch (err) {
        console.error(err);
      }
    };

    loadPreview();
  }, [previewOpen, contractId]);

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/contracts/${contractId}`),
    onSuccess: () => {
      toast({ title: "Contract deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      navigate("/app/contracts");
    },
    onError: () => toast({ title: "Failed to delete contract", variant: "destructive" }),
  });
  
  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/submit`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit contract");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract submitted for review", description: "Status updated to Under Review." });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
    },
    onError: (err: any) => toast({ title: "Cannot submit", description: err.message, variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/publish`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to publish contract");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract published to suppliers", description: "Status updated to Under Negotiation." });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot publish", description: err.message, variant: "destructive" }),
  });

  const ownerSubmitNegMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/owner-submit-negotiation`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit negotiation");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Negotiation submitted for review", description: "Sent to the review team for approval before it goes back to the supplier." });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot submit negotiation", description: err.message, variant: "destructive" }),
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/submit-for-approval`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit for approval");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Submitted for approval", description: "Contract status updated to Pending Approval." });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot submit for approval", description: err.message, variant: "destructive" }),
  });

  const sendForSigningMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/send-for-signing`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send for signing");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sent for Signing", description: "Contract status updated to Pending Signature." });
      setSendForSigningOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot send for signing", description: err.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/activate`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to activate contract");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract Activated", description: "Contract status changed to Active." });
      setActivateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot activate contract", description: err.message, variant: "destructive" }),
  });

  const terminateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/terminate`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to terminate contract");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract Terminated", description: "Contract status changed to Terminated.", variant: "destructive" });
      setTerminateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot terminate contract", description: err.message, variant: "destructive" }),
  });

  const getSignatureData = (): string => {
    if (signMode === "type") {
      // Render typed name onto a canvas and return as base64
      const c = document.createElement("canvas");
      c.width = 400; c.height = 100;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 400, 100);
      ctx.font = "italic 52px 'Brush Script MT', cursive";
      ctx.fillStyle = "#1e40af";
      ctx.fillText(typedName || "", 10, 72);
      return c.toDataURL("image/png");
    }
    const canvas = signCanvasRef.current;
    if (!canvas) return "";
    return canvas.toDataURL("image/png");
  };

  const signMutation = useMutation({
    mutationFn: async () => {
      const signatureData = getSignatureData();
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/sign`, {
        party: signingParty,
        signatureData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to sign contract");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Signed successfully", description: data.fullyExecuted ? "Both parties have signed. Contract is now Signed." : "Your signature has been recorded." });
      setSigningPanelOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      if (data.fullyExecuted) {
        setTimeout(() => navigate("/app/contracts"), 1200);
      } else {
        setPreviewRefreshKey(k => k + 1);
      }
    },
    onError: (err: any) => toast({ title: "Signing failed", description: err.message, variant: "destructive" }),
  });

  const acceptReviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/accept-review`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to accept review");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const msg = data.status === "Review Completed"
        ? "All reviewers have accepted. Status updated to Review Completed."
        : "Your acceptance has been recorded.";
      toast({ title: "Review accepted", description: msg });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot accept review", description: err.message, variant: "destructive" }),
  });

  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [moreInfoComments, setMoreInfoComments] = useState("");

  const moreInfoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/accept-review`, {
        type: "MoreInfoRequired",
        comments: moreInfoComments.trim() || undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to request more info");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "More info requested", description: "Contract status updated to More Info Required." });
      setMoreInfoComments("");
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot request more info", description: err.message, variant: "destructive" }),
  });

  const rejectReviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/reject-review`, { comments: rejectComments });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to reject review");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Review rejected", description: "Contract status updated to Review Rejected." });
      setRejectComments("");
      setRejectOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot reject review", description: err.message, variant: "destructive" }),
  });

  const negotiationAcceptReviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/negotiation-accept-review`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to accept negotiation review");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const msg = data.status === "Under Negotiation"
        ? "All reviewers have accepted. Contract is back Under Negotiation with the supplier."
        : "Your acceptance has been recorded.";
      toast({ title: "Negotiation review accepted", description: msg });
      setNegoAcceptOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot accept negotiation review", description: err.message, variant: "destructive" }),
  });

  const negotiationRejectReviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/negotiation-reject-review`, { comments: negoRejectComments });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to reject negotiation review");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Negotiation review rejected", description: "Sent back to the owner to revise before resubmitting." });
      setNegoRejectComments("");
      setNegoRejectOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Cannot reject negotiation review", description: err.message, variant: "destructive" }),
  });

  const approvalMutation = useMutation({
    mutationFn: async (vars: { action: "Approve" | "Reject" | "More"; remarks: string }) => {
      // Include the active workflow taskId so the backend can advance the workflow engine
      const payload = { ...vars, taskId: effectiveTaskId ?? undefined };
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/process-approval`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to process approval");
      }
      return { ...(await res.json()), action: vars.action };
    },
    onSuccess: (data) => {
      const titles: Record<string, string> = {
        Approve: data.newTaskId ? "Approved — Next Approver Notified" : "Contract Approved",
        Reject: "Contract Rejected",
        More: "More Info Requested",
      };
      const descs: Record<string, string> = {
        Approve: data.newTaskId
          ? "Your approval was recorded. The contract moves to the next approver."
          : "Contract has been fully approved.",
        Reject: "Contract status updated to Rejected.",
        More: "Contract status updated to More Info Required.",
      };
      toast({ title: titles[data.action], description: descs[data.action] });
      setApprovalDialogOpen(false);
      setApprovalRemarks("");
      // Clear stale taskId and redirect back to the list (with fresh data)
      sessionStorage.removeItem("currentTaskId");
      sessionStorage.removeItem("currentTaskRefNumber");
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      setTimeout(() => navigate("/app/contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Approval action failed", description: err.message, variant: "destructive" }),
  });

  // Re-Submit after More Info Required:
  //   - If appr_status === "More Info Required" → came from approval workflow → ReSubmit via process-approval
  //   - Otherwise → came from review → re-submit for review via /submit
  const resubmitMutation = useMutation({
    mutationFn: async () => {
      if (contract?.appr_status === "More Info Required") {
        const res = await apiRequest("PATCH", `/api/contracts/${contractId}/process-approval`, {
          action: "ReSubmit",
          taskId: effectiveTaskId ?? undefined,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to re-submit for approval");
        }
        return res.json();
      } else {
        const res = await apiRequest("PATCH", `/api/contracts/${contractId}/submit`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to re-submit for review");
        }
        return res.json();
      }
    },
    onSuccess: () => {
      const isApprovalResubmit = contract?.appr_status === "More Info Required";
      toast({
        title: "Re-submitted successfully",
        description: isApprovalResubmit
          ? "Contract re-submitted for approval."
          : "Contract re-submitted for review.",
      });
      setResubmitOpen(false);
      // Clear stale task state so the fresh step-1 task is picked up by active-task query
      setTaskId(null);
      sessionStorage.removeItem("currentTaskId");
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "active-task"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
    },
    onError: (err: any) => toast({ title: "Re-submit failed", description: err.message, variant: "destructive" }),
  });

  const { data: vendor, isLoading: vendorLoading } = useQuery<ContractVendor | null>({
    queryKey: ["/api/contracts", contractId, "vendor"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/${contractId}/vendor`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!contractId,
  });

  const { data: reviewers = [], isLoading: reviewersLoading } = useQuery<Reviewer[]>({
    queryKey: ["/api/contracts", contractId, "reviewers"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/${contractId}/reviewers`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!contractId,
  });

  const { data: supplierOptions = [], isLoading: suppliersLoading } = useQuery<SupplierOption[]>({
    queryKey: ["/api/dbo/suppliers", "Active", vendorSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "30", status: "Active", search: vendorSearch });
      const res = await apiRequest("GET", `/api/dbo/suppliers?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      const list = data.data || data || [];
      return (Array.isArray(list) ? list : []).map((s: any) => ({
        id: s.id,
        companyName: s.supplier_name || s.company_name || s.companyName || "-",
        emailId: s.supplier_contact_email || s.email_id || s.emailId || "",
        phone: s.supplier_contact_no || s.mobile_no || s.phone_no || s.phone || "",
      }));
    },
    enabled: vendorDialogOpen && vendorSearch.trim().length > 0,
  });

  const { data: usersPageData, isFetching: usersLoading } = useQuery<{ data: UserOption[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>({
    queryKey: ["/api/users/dropdown", reviewerSearch, reviewerPage],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(reviewerPage), limit: "10" });
      if (reviewerSearch.trim()) qs.set("search", reviewerSearch.trim());
      const res = await apiRequest("GET", `/api/users/dropdown?${qs}`);
      if (!res.ok) return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } };
      const json = await res.json();
      const data = Array.isArray(json) ? json : (json.data || []);
      const pagination = json.pagination || { page: 1, limit: 10, total: data.length, totalPages: 1 };
      return {
        data: data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email_id: u.email_id || u.user_name || "",
          mobile_no: u.mobile_no || "",
          department_name: u.department_name || ""
        })),
        pagination,
      };
    },
    enabled: reviewerDialogOpen,
    staleTime: 30000,
  });
  const userOptions = usersPageData?.data ?? [];
  const usersPagination = usersPageData?.pagination ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  const saveVendorMutation = useMutation({
    mutationFn: (v: SupplierOption) => apiRequest("POST", `/api/contracts/${contractId}/vendor`, {
      supplier_id: v.id,
      supplier_name: v.companyName || "",
      supplier_contact_no: v.phone || "",
      supplier_contact_email: v.emailId || "",
    }),
    onSuccess: () => {
      toast({ title: "Supplier saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "vendor"] });
      setVendorDialogOpen(false);
    },
    onError: () => toast({ title: "Failed to save supplier", variant: "destructive" }),
  });

  const removeVendorMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/contracts/${contractId}/vendor`),
    onSuccess: () => {
      toast({ title: "Supplier removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "vendor"] });
    },
    onError: () => toast({ title: "Failed to remove supplier", variant: "destructive" }),
  });

  const addReviewerMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("POST", `/api/contracts/${contractId}/reviewers`, { user_id: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to add reviewer", variant: "destructive" }),
  });

  async function handleAddSelected() {
    const ids = Array.from(selectedUserIds);
    try {
      for (const uid of ids) {
        await apiRequest(
          "POST",
          `/api/contracts/${contractId}/reviewers`,
          { user_id: uid }
        );
      }
      toast({ title: `${ids.length} reviewer${ids.length > 1 ? "s" : ""} added` });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
      setSelectedUserIds(new Set());
      setReviewerDialogOpen(false);
    } catch {
      toast({ title: "Failed to add some reviewers", variant: "destructive" });
    }
  }

  const removeReviewerMutation = useMutation({
    mutationFn: (reviewerId: number) => apiRequest("DELETE", `/api/contracts/${contractId}/reviewers/${reviewerId}`),
    onSuccess: () => {
      toast({ title: "Reviewer removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "reviewers"] });
    },
    onError: () => toast({ title: "Failed to remove reviewer", variant: "destructive" }),
  });

  const { data: deliverySchedules = [], isLoading: delivSchedLoading } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "delivery-schedules"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/${contractId}/delivery-schedules`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!contractId,
  });

  // All milestones must share the same schedule type — derive the locked type from saved entries
  const lockedSchedType: string | null = deliverySchedules.length > 0
    ? (deliverySchedules.filter((s: any) => !editingDelivSched || s.id !== editingDelivSched.id)[0]?.schedule_type ?? null)
    : null;
  const lockedSchedLabel = SCHED_TYPES.find(o => o.value === lockedSchedType)?.label ?? lockedSchedType;

  const saveDelivSchedMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingDelivSched) {
        return apiRequest("PUT", `/api/contracts/${contractId}/delivery-schedules/${editingDelivSched.id}`, data);
      }
      return apiRequest("POST", `/api/contracts/${contractId}/delivery-schedules`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "delivery-schedules"] });
      setDelivSchedOpen(false);
      setEditingDelivSched(null);
      toast({ title: editingDelivSched ? "Milestone updated" : "Milestone added" });
    },
    onError: () => toast({ title: "Failed to save milestone", variant: "destructive" }),
  });

  const deleteDelivSchedMutation = useMutation({
    mutationFn: (schedId: number) => apiRequest("DELETE", `/api/contracts/${contractId}/delivery-schedules/${schedId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "delivery-schedules"] });
      toast({ title: "Milestone deleted" });
    },
    onError: () => toast({ title: "Failed to delete milestone", variant: "destructive" }),
  });

  const { data: paymentTerms = [], isLoading: payTermLoading } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "payment-terms"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/${contractId}/payment-terms`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!contractId,
  });

  const savePayTermMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingPayTerm) {
        return apiRequest("PUT", `/api/contracts/${contractId}/payment-terms/${editingPayTerm.id}`, data);
      }
      return apiRequest("POST", `/api/contracts/${contractId}/payment-terms`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "payment-terms"] });
      setPayTermOpen(false);
      setEditingPayTerm(null);
      toast({ title: editingPayTerm ? "Payment term updated" : "Payment term added" });
    },
    onError: () => toast({ title: "Failed to save payment term", variant: "destructive" }),
  });

  const deletePayTermMutation = useMutation({
    mutationFn: (termId: number) => apiRequest("DELETE", `/api/contracts/${contractId}/payment-terms/${termId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "payment-terms"] });
      toast({ title: "Payment term deleted" });
    },
    onError: () => toast({ title: "Failed to delete payment term", variant: "destructive" }),
  });

  // Item master / category / UOM lookups for SOW sheet
  const { data: categoriesData } = useQuery<{ id: string; code: string; name: string }[]>({
    queryKey: ["/api/categories"],
    enabled: sowSheetOpen,
  });
  const categories = categoriesData || [];

  const { data: itemsData } = useQuery<{ id: string; name: string; categoryCode: string; categoryName: string; unitOfMeasure: string; standardPrice: number | null }[]>({
    queryKey: ["/api/items"],
    enabled: sowSheetOpen && itemEntryMode === "master",
  });
  const sowItems = itemsData || [];

  const { data: uomData } = useQuery<{ id: number; description: string }[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: sowSheetOpen,
  });
  const uomOptions = uomData || [];

  // SOW queries and mutations
  const { data: sowLines = [], isLoading: sowLoading } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "sow"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/${contractId}/sow`);
      if (!res.ok) throw new Error("Failed to fetch SOW");
      return res.json();
    },
    enabled: !!contractId,
  });

  const blankSowForm = { description: "", quantity: "", uom: "", unit_cost: "", start_date: "", deliverydate: "", specifications: "", linetype: "Goods", categoryCode: "", categoryName: "", itemId: "", itemName: "" };

  const createSowMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/contracts/${contractId}/sow`, data),
    onSuccess: () => {
      toast({ title: "Line added" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "sow"] });
      setSowSheetOpen(false);
      setSowForm(blankSowForm);
      setEditingSow(null);
      setItemEntryMode("master");
    },
    onError: () => toast({ title: "Failed to add line", variant: "destructive" }),
  });

  const updateSowMutation = useMutation({
    mutationFn: ({ sowId, data }: { sowId: number; data: any }) => apiRequest("PUT", `/api/contracts/${contractId}/sow/${sowId}`, data),
    onSuccess: () => {
      toast({ title: "Line updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "sow"] });
      setSowSheetOpen(false);
      setSowForm(blankSowForm);
      setEditingSow(null);
      setItemEntryMode("master");
    },
    onError: () => toast({ title: "Failed to update line", variant: "destructive" }),
  });

  const deleteSowMutation = useMutation({
    mutationFn: (sowId: number) => apiRequest("DELETE", `/api/contracts/${contractId}/sow/${sowId}`),
    onSuccess: () => {
      toast({ title: "Line deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "sow"] });
      setDeleteSowId(null);
    },
    onError: () => toast({ title: "Failed to delete line", variant: "destructive" }),
  });

  const [auditPage, setAuditPage] = useState(1);
  const { data: auditData } = useQuery<any>({
    queryKey: ["/api/contracts", contractId, "audit-logs", auditPage],
    queryFn: () => apiRequest("GET", `/api/contracts/${contractId}/audit-logs?page=${auditPage}&limit=10`).then(r => r.json()),
    enabled: !!contractId,
  });

  const { data: attachments = [], isLoading: attachLoading } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "attachments"],
    queryFn: () => apiRequest("GET", `/api/contracts/${contractId}/attachments`).then(r => r.json()),
    enabled: !!contractId,
  });

  const addAttachMutation = useMutation({
    mutationFn: async (form: typeof attachForm) => {
      const fd = new FormData();
      if (selectedFile) fd.append("file", selectedFile);
      fd.append("attach_desc", form.attach_desc);
      fd.append("attach_name", form.attach_name);
      fd.append("attach_type", form.attach_type);
      fd.append("attach_source", "SOW");
      const res = await apiRequest("POST", `/api/contracts/${contractId}/attachments`, fd);
      if (!res.ok) throw new Error("Failed to upload");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document attached" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "attachments"] });
      setShowAttachDialog(false);
      setAttachForm({ attach_desc: "", attach_name: "", attach_type: "application/pdf" });
      setSelectedFile(null);
    },
    onError: () => toast({ title: "Failed to attach document", variant: "destructive" }),
  });

  const deleteAttachMutation = useMutation({
    mutationFn: (attachId: number) => apiRequest("DELETE", `/api/contracts/${contractId}/attachments/${attachId}`),
    onSuccess: () => {
      toast({ title: "Attachment removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "attachments"] });
      setDeleteAttachId(null);
    },
    onError: () => toast({ title: "Failed to remove attachment", variant: "destructive" }),
  });

  const { data: serverClauses = [], isLoading: clausesLoading, isFetching: clausesFetching } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "clauses"],
    enabled: !!contractId,
  });

  useEffect(() => {
    if (!clausesInitialized.current && !clausesLoading && !clausesFetching) {
      clausesInitialized.current = true;
      setLocalClauses(serverClauses);
      if (serverClauses.length > 0) {
        setExpandedClauseId(serverClauses[0].id);
      }
    }
  }, [serverClauses, clausesLoading, clausesFetching]);

  useEffect(() => {
    if (viewMode !== 'modern') return;
    const timer = setTimeout(() => setPreviewRefreshKey(k => k + 1), 1500);
    return () => clearTimeout(timer);
  }, [localClauses, viewMode]);

  // Read taskId from sessionStorage (set when navigating from My Tasks inbox)
  useEffect(() => {
    const storedTaskId = sessionStorage.getItem("currentTaskId");
    if (storedTaskId) setTaskId(storedTaskId);
  }, []);

  const { data: clauseLibrary = [] } = useQuery<any[]>({
    queryKey: [`/api/contracts/clause-library?search=${encodeURIComponent(clauseLibSearch)}`],
  });

  const { data: allComments = [], refetch: refetchComments } = useQuery<ClauseComment[]>({
    queryKey: [`/api/contracts/${contractId}/comments`],
    enabled: !!contractId,
  });

  const addClauseMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/contracts/${contractId}/clauses`, data).then(r => r.json()),
    onSuccess: (newClause: any) => {
      setLocalClauses(prev => [...prev, newClause]);
      setExpandedClauseId(newClause.id);
      setModernEditingClause(newClause.id);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "clauses"] });
      toast({ title: "Clause added" });
    },
    onError: () => toast({ title: "Failed to add clause", variant: "destructive" }),
  });

  const deleteClauseMutation = useMutation({
    mutationFn: (clauseId: number) => apiRequest("DELETE", `/api/contracts/${contractId}/clauses/${clauseId}`),
    onSuccess: (_data, clauseId) => {
      toast({ title: "Clause deleted" });
      // Optimistically mark as Deleted in local state; query invalidation will sync server state
      // (backend soft-deletes during negotiation, physically deletes otherwise)
      setLocalClauses(prev => prev.map(c => c.id === clauseId ? { ...c, status: 'Deleted' } : c));
      setDirtyClauses(prev => { const s = new Set(prev); s.delete(clauseId); return s; });
      if (expandedClauseId === clauseId) setExpandedClauseId(null);
      setDeleteClauseId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "clauses"] });
    },
    onError: () => toast({ title: "Failed to delete clause", variant: "destructive" }),
  });

  const reorderClauseMutation = useMutation({
    mutationFn: (orderedIds: number[]) => apiRequest("PUT", `/api/contracts/${contractId}/clauses/reorder`, { orderedIds }),
    onError: () => toast({ title: "Failed to reorder clauses", variant: "destructive" }),
  });

  function updateLocalClause(id: number, changes: Partial<any>) {
    setLocalClauses(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    setDirtyClauses(prev => new Set(prev).add(id));
  }

  function discardClauseChanges(id: number) {
    const original = serverClauses.find((c: any) => c.id === id);
    if (!original) return;
    setLocalClauses(prev => prev.map(c => c.id === id ? { ...c, term_details: original.term_details, terms_name: original.terms_name } : c));
    setDirtyClauses(prev => { const s = new Set(prev); s.delete(id); return s; });
    setClauseResetCounters(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  async function updateClauseStatus(id: number, status: string) {
    try {
      const updated = await apiRequest("PATCH", `/api/contracts/${contractId}/clauses/${id}/status`, { status }).then(r => r.json());
      setLocalClauses(prev => prev.map(c => c.id === id ? { ...c, status: updated.status } : c));
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "clauses"] });
    } catch {
      // non-critical: status update failure doesn't break the flow
    }
  }

  async function saveClauseImmediate(id: number, term_details: string, terms_name?: string) {
    try {
      await apiRequest("PUT", `/api/contracts/${contractId}/clauses/${id}`, { terms_name, term_details });
      setDirtyClauses(prev => { const s = new Set(prev); s.delete(id); return s; });
      setPreviewRefreshKey(k => k + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "clauses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/terms", id, "history"] });
    } catch {
      toast({ title: "Failed to save clause", variant: "destructive" });
    }
  }

  function handleClauseDrop(targetId: number) {
    if (!dragClauseId || dragClauseId === targetId) { setDragOverClauseId(null); return; }
    const from = localClauses.findIndex(c => c.id === dragClauseId);
    const to = localClauses.findIndex(c => c.id === targetId);
    const reordered = [...localClauses];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setLocalClauses(reordered);
    setDragClauseId(null);
    setDragOverClauseId(null);
    reorderClauseMutation.mutate(reordered.map(c => c.id));
  }

  async function saveAllClauses() {
    if (dirtyClauses.size === 0) return;
    setSavingClauses(true);
    try {
      for (const id of Array.from(dirtyClauses)) {
        const clause = localClauses.find(c => c.id === id);
        if (clause) {
          await apiRequest("PUT", `/api/contracts/${contractId}/clauses/${id}`, {
            terms_name: clause.terms_name,
            term_details: clause.term_details,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/contracts/terms", id, "history"] });
        }
      }
      setDirtyClauses(new Set());
      setPreviewRefreshKey(k => k + 1);
      toast({ title: "All clauses saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "clauses"] });
    } catch {
      toast({ title: "Failed to save some clauses", variant: "destructive" });
    } finally {
      setSavingClauses(false);
    }
  }

  async function submitReview() {
    setSubmittingReview(true);
    try {
      // 1. Save any pending changes first
      if (dirtyClauses.size > 0) {
        setSavingClauses(true);
        for (const id of Array.from(dirtyClauses)) {
          const clause = localClauses.find(c => c.id === id);
          if (clause) {
            await apiRequest("PUT", `/api/contracts/${contractId}/clauses/${id}`, {
              terms_name: clause.terms_name,
              term_details: clause.term_details,
            });
          }
        }
        setDirtyClauses(new Set());
        setSavingClauses(false);
      }
      // 2. Formally submit the review
      await apiRequest("PATCH", `/api/contracts/${contractId}/accept-review`, {});
      toast({
        title: "Review submitted",
        description: "Your tracked changes have been saved and submitted to the contract owner.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "clauses"] });
    } catch (err: any) {
      toast({
        title: "Failed to submit review",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmittingReview(false);
    }
  }

  function extractVariables(): { name: string; clauseIds: number[] }[] {
    const varMap = new Map<string, number[]>();
    const pattern = /\{\{([^}]+)\}\}/g;
    for (const clause of localClauses) {
      const text = (clause.term_details || "") + (clause.terms_name || "");
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const varName = match[1].trim();
        if (!varMap.has(varName)) varMap.set(varName, []);
        varMap.get(varName)!.push(clause.id);
      }
    }
    return Array.from(varMap.entries()).map(([name, clauseIds]) => ({ name, clauseIds }));
  }

  function applyVariable(varName: string, value: string) {
    const pattern = new RegExp(`\\{\\{${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
    for (const clause of localClauses) {
      const newDetails = (clause.term_details || "").replace(pattern, value);
      const newName = (clause.terms_name || "").replace(pattern, value);
      if (newDetails !== clause.term_details || newName !== clause.terms_name) {
        updateLocalClause(clause.id, { term_details: newDetails, terms_name: newName });
      }
    }
  }

  function addBlankClause() {
    addClauseMutation.mutate({ terms_name: "New Clause", term_details: "", order_by: localClauses.length + 1 });
  }

  function addFromLibrary(lib: any) {
    addClauseMutation.mutate({
      terms_name: lib.section_name,
      term_details: lib.html_content || lib.description || "",
      mandatory: lib.clause_mandatory || "No",
      term_amendable: lib.clause_ammendable || "Yes",
      term_negotiable: lib.clause_negotiable || "Yes",
      order_by: localClauses.length + 1,
    });
    toast({ title: `"${lib.section_name}" added from library` });
  }

  function openAddSow() {
    setEditingSow(null);
    setSowForm(blankSowForm);
    setItemEntryMode("master");
    setSowSheetOpen(true);
  }

  function openEditSow(sow: any) {
    setEditingSow(sow);
    setSowForm({
      description: sow.description || "",
      quantity: sow.quantity || "",
      uom: sow.uom || "",
      unit_cost: sow.unit_cost != null ? String(sow.unit_cost) : "",
      start_date: sow.start_date ? sow.start_date.substring(0, 10) : "",
      deliverydate: sow.deliverydate ? sow.deliverydate.substring(0, 10) : "",
      specifications: sow.specifications || "",
      linetype: sow.linetype || "Goods",
      categoryCode: sow.category_code || "",
      categoryName: sow.category_name || "",
      itemId: sow.item_id || "",
      itemName: sow.item_name || "",
    });
    setItemEntryMode(sow.item_id ? "master" : "freetext");
    setSowSheetOpen(true);
  }

  function submitSowForm() {
     if(!sowForm.description) return toast({ title: "Description is required", variant: "destructive" });
      if(!sowForm.quantity || isNaN(Number(sowForm.quantity)) || Number(sowForm.quantity) <= 0) {
        return toast({ title: "Quantity must be a positive number", variant: "destructive" });
      }
      if(!sowForm.unit_cost || isNaN(Number(sowForm.unit_cost)) || Number(sowForm.unit_cost) < 0) {
        return toast({ title: "Unit Cost must be a non-negative number", variant: "destructive" });
      }
      if(!sowForm.uom) return toast({ title: "Unit of Measure is required", variant: "destructive" });
    if (editingSow) {
      updateSowMutation.mutate({ sowId: editingSow.id, data: sowForm });
    } else {
      createSowMutation.mutate(sowForm);
    }
  }

 const { data: contract, isLoading, error } = useQuery<ContractHeader>({
  queryKey: ["/api/contracts", contractId],
  queryFn: async () => {
    const res = await apiRequest("GET", `/api/contracts/${contractId}`);
    if (!res.ok) throw new Error("Not found");
    return res.json();
  },
  enabled: !!contractId,
  staleTime: 0,
  refetchOnMount: "always",
});

  const { data: riskSummary } = useQuery<{ risk: { level: string } }>({
    queryKey: ["/api/contracts/performance", contractId, "risk"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/performance/${contractId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!contractId && (contract?.status === "Active" || contract?.status === "Terminated"),
    staleTime: 5 * 60 * 1000,
  });

  const viewModeInitialized = useRef(false);
  useEffect(() => {
    if (!contract?.status || viewModeInitialized.current) return;
    viewModeInitialized.current = true;
    const classicStatuses = ["Draft", "Review Completed", "Review Rejected"];
    setViewMode(classicStatuses.includes(contract.status) ? 'classic' : 'modern');
  }, [contract?.status]);

  // ── Auth identity — must live above early returns so callbacks can close over it
  const _auth = (() => { try { return JSON.parse(localStorage.getItem("prokraya-auth") || "{}"); } catch { return {}; } })();
  const currentUserId = Number(_auth.userId) || 0;
  const currentUserName: string = _auth.userName || "";

  // ── Fetch current user's roles to determine superadmin ──────────────────────
  const { data: currentUserProfile } = useQuery<{ roles: { role_name: string }[]; user_name?: string; email_id?: string }>({
    queryKey: ["/api/profile", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return null;
      const res = await apiRequest("GET", `/api/profile/${encodeURIComponent(currentUserId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentUserId,
    staleTime: 5 * 60 * 1000,
  });
  const isSuperAdmin = (currentUserProfile?.roles || []).some(
    (r: { role_name: string }) => r.role_name === "ROLE_SUPERADMIN" || r.role_name === "ROLE_SYSADMIN"
  );
  const userRoleNames = (currentUserProfile?.roles || []).map(r => r.role_name);

  // ── Active task + canApprove (mirrors PO pattern) ──────────────────────────
  const isPendingApprovalForTask = contract?.status === "Pending Approval";
  const { data: activeTask } = useQuery<any>({
    queryKey: ["/api/contracts", contractId, "active-task"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/${contractId}/active-task`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isPendingApprovalForTask,
    staleTime: 0,
  });
  useEffect(() => {
    if (activeTask?.id_) setTaskId(activeTask.id_);
  }, [activeTask]);

  // Listen for FULLY_EXECUTED from the contract preview iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "FULLY_EXECUTED") {
        setPreviewOpen(false);
        queryClient.invalidateQueries({ queryKey: [`/api/contracts/${contractId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [contractId]);

  const effectiveTaskId = contract?.attribute_12 !== undefined && contract?.attribute_12 !== null
    ? contract.attribute_12
    : sessionStorage.getItem("currentTaskId") || taskId || activeTask?.id_;
  const { data: taskDetails } = useQuery<{ assignee_: string | null; id_: string } | null>({
    queryKey: ["/api/workflow-engine/task", effectiveTaskId],
    queryFn: async () => {
      if (!effectiveTaskId) return null;
      const res = await apiRequest("GET", `/api/workflow-engine/task/${encodeURIComponent(effectiveTaskId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!effectiveTaskId,
  });
  const canApprove = (() => {
    if (!isPendingApprovalForTask) return false;

    // ── Primary: use server-computed flag (most reliable) ───────────────────────
    if (contract?.is_approver === true) return true;
    if (contract?.is_approver === false) {
      // Server explicitly said no — but fall through to client checks as safety net
    }

    // ── Super-admin bypass: can approve any task ────────────────────────────────
    if (userRoleNames.some((r) => r === "ROLE_SUPERADMIN" || r === "ROLE_SYSADMIN")) return true;

    // ── Fallback A: workflow engine task matches current user ────────────────────
    if (effectiveTaskId) {
      const assignee = taskDetails?.assignee_ || activeTask?.assignee_;
      if (assignee) {
        const assigneeUpper = assignee.toUpperCase();
        if (assigneeUpper.startsWith("ROLE_")) {
          return userRoleNames.some(r => r.toUpperCase() === assigneeUpper);
        }
        const currentUserIdentifiers = [
          currentUserProfile?.user_name?.toLowerCase(),
          currentUserProfile?.email_id?.toLowerCase(),
          currentUserName?.toLowerCase(),
        ].filter(Boolean);
        return currentUserIdentifiers.includes(assignee.toLowerCase());
      }
    }

    // ── Fallback B: check approvers_list directly using _auth identifiers ────────
    // Uses synchronous localStorage auth so it works before profile API loads
    if (!contract?.approvers_list) return false;
    const authUserName = (_auth.userName || "").toLowerCase();
    const authEmail = (_auth.email || "").toLowerCase();
    const approverEntries = (contract.approvers_list as string)
      .split(",")
      .map((a: string) => a.trim())
      .filter(Boolean);
    return approverEntries.some((entry: string) => {
      const entryUpper = entry.toUpperCase();
      if (entryUpper.startsWith("ROLE_")) {
        return userRoleNames.some(r => r.toUpperCase() === entryUpper);
      }
      const entryLower = entry.toLowerCase();
      return (authUserName && entryLower === authUserName) || (authEmail && entryLower === authEmail);
    });
  })();

  // ── Approval History ─────────────────────────────────────────────────────────
  const { data: allApprovalHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/contracts", contractId, "approval-history"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/${contractId}/approval-history`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!contractId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const approvalHistory = allApprovalHistory.filter((r: any) => r.attribute_2 !== 'REVIEW');
  const reviewHistory = allApprovalHistory.filter((r: any) => r.attribute_2 === 'REVIEW');

  // ── Comments: group by clause ID ─────────────────────────────────────────────
  // IMPORTANT: these hooks must stay ABOVE the early returns below
  const commentsByClause = useMemo(() => {
    const map: Record<number, ClauseComment[]> = {};
    allComments.forEach(c => {
      if (!map[c.contr_term_id]) map[c.contr_term_id] = [];
      map[c.contr_term_id].push(c);
    });
    return map;
  }, [allComments]);

  const hasTrackChanges = (html: string) => /<insert[\s>]|<delete[\s>]/i.test(html || "");
  const hasOpenComments = (clauseId: number) =>
    (commentsByClause[clauseId] ?? []).some(c => c.attribute_2 !== "Y");

  const handleAddComment = useCallback(async (clauseId: number, commentId: string, selectedText: string, commentText: string) => {
    await apiRequest("POST", `/api/contracts/${contractId}/clauses/${clauseId}/comments`, {
      comment_uuid: commentId,
      selected_text: selectedText,
      comment_text: commentText,
      author_name: currentUserName,
      author_email: _auth.email || "",
    });
    refetchComments();
  }, [contractId, currentUserName, _auth.email, refetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResolveComment = useCallback(async (clauseId: number, commentId: number) => {
    // Find the comment UUID (attribute_4) so we can strip the highlight from the HTML
    const comment = (commentsByClause[clauseId] ?? []).find((c: any) => c.id === commentId);
    const commentUuid = comment?.attribute_4;

    await apiRequest("PATCH", `/api/contracts/${contractId}/clauses/${clauseId}/comments/${commentId}/resolve`, {});
    refetchComments();

    // Strip the comment-mark span from the clause HTML, keeping its inner text
    if (commentUuid) {
      const clause = localClauses.find((c: any) => c.id === clauseId);
      if (clause?.term_details) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(clause.term_details, "text/html");
        doc.querySelectorAll(`span[data-comment-id="${commentUuid}"]`).forEach(span => {
          while (span.firstChild) span.parentNode?.insertBefore(span.firstChild, span);
          span.remove();
        });
        const newHtml = doc.body.innerHTML;
        updateLocalClause(clauseId, { term_details: newHtml });
        await saveClauseImmediate(clauseId, newHtml);
      }
    }

    queryClient.invalidateQueries({ queryKey: [`/api/contracts/${contractId}/clauses`] });
  }, [contractId, refetchComments, queryClient, commentsByClause, localClauses, updateLocalClause, saveClauseImmediate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <h2 className="text-lg font-medium mb-2">Contract Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">The requested contract could not be found.</p>
            <Link href="/app/contracts">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Contracts
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDraft = contract.status === "Draft";
  const isMoreInfoRequired = contract.status === "More Info Required";
  const isEditable = isDraft || isMoreInfoRequired;
  const isReviewCompleted = contract.status === "Review Completed";
  const isReviewRejected = contract.status === "Review Rejected";
  const isPendingApproval = contract.status === "Pending Approval";
  const isUnderReview = contract.status === "Under Review";
  const isVendorSubmitForNegotiation = contract.status === "Vendor Submit For Negotiation" || contract.status === "Supplier Submit For Negotiation";
  const isNegotiationUnderReview = contract.status === "Negotiation Under Review";
  const isUnderNegotiation = contract.status === "Under Negotiation";
  const isAccepted = contract.status === "Accepted";
  const isSigned = contract.status === "Signed";
  const isActive = contract.status === "Active";
  const isInNegotiation = isUnderNegotiation || isVendorSubmitForNegotiation;
  const modernClause = modernEditingClause !== null ? (localClauses.find(c => c.id === modernEditingClause) ?? null) : null;
  const refNo = contract.contr_ref_no || String(contract.id);
  const allSowLinesHavePo = sowLines.length > 0 && sowLines.every((l: any) => !!l.po_number);
  const linkedPoNumbers = Array.from(new Set(sowLines.map((l: any) => l.po_number).filter(Boolean)));

  // ── Track Changes: current user identity + role ──────────────────────────────
  const isContractOwner: boolean = contract.is_owner === true;

  // Only the contract owner can edit, delete, submit, or publish
  const canDoOwnerActions = isContractOwner;
  // Owners can perform all edit actions in Draft, More Info Required, Review Completed, and Review Rejected
  const canOwnerEdit = (isEditable || isReviewCompleted || isReviewRejected) && canDoOwnerActions;
  const canOwnerEditClauses = canOwnerEdit || (isVendorSubmitForNegotiation && isContractOwner);
  const currentUserReviewerEntry = !reviewersLoading ? reviewers.find((r: any) => r.user_id === currentUserId) : undefined;
  const isCurrentUserReviewer = isUnderReview && !!currentUserReviewerEntry &&
      (currentUserReviewerEntry as any).accepted_contract !== 'Y' &&
      (currentUserReviewerEntry as any).rejected_contract !== 'Y';
  const isCurrentUserNegotiationReviewer = isNegotiationUnderReview && !!currentUserReviewerEntry &&
      (currentUserReviewerEntry as any).accepted_contract !== 'Y' &&
      (currentUserReviewerEntry as any).rejected_contract !== 'Y';

  const canEditClauses = (isEditable && isContractOwner) || (isReviewCompleted && isContractOwner) || (isReviewRejected && isContractOwner) || (isUnderReview && isCurrentUserReviewer) || (isVendorSubmitForNegotiation && isContractOwner);
  // Owner can accept/reject/resolve track changes in ANY status (not just Under Review)
  const canOwnerResolveChanges = !reviewersLoading && isContractOwner && !isCurrentUserReviewer;

  // True when a clause has unresolved track changes OR open comments — drives the orange dot indicator
  const clauseNeedsAttention = (clause: any): boolean =>
    hasTrackChanges(clause.term_details || "") || hasOpenComments(clause.id);

  const handleDownload = async () => {
  try {
    const response = await fetch(
  `/api/contracts/${contractId}/preview?download=1`,
  {
    headers: getAuthHeaders(),
  }
  );

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Contract_${contractId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
  }
};
  return (
    <div className="p-4 space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app/contracts">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold" data-testid="text-contract-ref">{refNo}</h1>
              <StatusBadge status={contract.status} />
              {riskSummary?.risk?.level && (() => {
                const level = riskSummary.risk.level;
                const cls = level === "High"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800"
                  : level === "Medium"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                  : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800";
                return (
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 font-medium ${cls}`} data-testid="badge-contract-risk">
                    {level} Risk
                  </Badge>
                );
              })()}
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-contract-title">{contract.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canOwnerEdit && viewMode === 'classic' && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="button-edit-contract">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}

            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
              data-testid="button-delete-contract"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>

          {viewMode === 'classic' && (
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} data-testid="button-preview-contract">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
          )}

          {contract.status === "Draft" && canOwnerEdit && (
          <Button
            size="sm"
            onClick={() => {
              if (!sowLines || sowLines.length === 0) {
                toast({
                  title: "Cannot submit",
                  description: "Please add at least one Scope of Work item before submitting.",
                  variant: "destructive",
                });
                return;
              }
                  if (!vendor) {
                    toast({
                      title: "Cannot submit",
                      description: "Please select a supplier before submitting.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!localClauses || localClauses.length === 0) {
                    toast({
                      title: "Cannot submit",
                      description: "Please add at least one clause before submitting.",
                      variant: "destructive",
                    });
                    return;
                  }
              setSubmitOpen(true);
            }}
            disabled={submitMutation.isPending}
            data-testid="button-submit-contract"
          >
            <Send className="h-4 w-4 mr-2" />
            Submit for Review
          </Button>
          )}

          {isMoreInfoRequired && canDoOwnerActions && (
            <Button
              size="sm"
              onClick={() => setResubmitOpen(true)}
              disabled={resubmitMutation.isPending}
              data-testid="button-resubmit-contract"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Re-Submit
            </Button>
          )}

          {isReviewCompleted && canDoOwnerActions && (
            <Button
              size="sm"
              onClick={() => {
                if (dirtyClauses.size > 0) {
                  toast({ title: "Unsaved changes", description: "Please save all clause changes before publishing.", variant: "destructive" });
                  return;
                }
                const hasUnresolved = localClauses.some(c => hasTrackChanges(c.term_details || ""));
                if (hasUnresolved) {
                  toast({ title: "Unresolved track changes", description: "Please accept or reject all reviewer track changes before publishing.", variant: "destructive" });
                  return;
                }
                setPublishOpen(true);
              }}
              disabled={publishMutation.isPending}
              data-testid="button-publish-contract"
            >
              <Send className="h-4 w-4 mr-2" />
              Publish to Suppliers
            </Button>
          )}

          {isVendorSubmitForNegotiation && isContractOwner && (
            <Button
              size="sm"
              onClick={() => {
                if (dirtyClauses.size > 0) {
                  toast({ title: "Unsaved changes", description: "Please save all clause changes before submitting negotiation.", variant: "destructive" });
                  return;
                }
                const hasUnresolved = localClauses.some(c => hasTrackChanges(c.term_details || ""));
                if (hasUnresolved) {
                  toast({ title: "Unresolved track changes", description: "Please accept or reject all supplier track changes before submitting negotiation.", variant: "destructive" });
                  return;
                }
                setOwnerSubmitNegOpen(true);
              }}
              disabled={ownerSubmitNegMutation.isPending}
              data-testid="button-owner-submit-negotiation"
            >
              <Send className="h-4 w-4 mr-2" />
              Submit Negotiation
            </Button>
          )}

          {isAccepted && isContractOwner && (
            <Button
              size="sm"
              onClick={() => setSubmitForApprovalOpen(true)}
              disabled={submitForApprovalMutation.isPending}
              data-testid="button-submit-for-approval"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Submit For Approval
            </Button>
          )}

          {/* {contract.status === "Approved" && isContractOwner && (
            <Button
              size="sm"
              onClick={() => setSendForSigningOpen(true)}
              data-testid="button-send-for-signing"
            >
              <Send className="h-4 w-4 mr-2" />
              Send for Signing
            </Button>
          )} */}

          {isSigned && isContractOwner && (
            <Button
              size="sm"
              onClick={() => setActivateOpen(true)}
              disabled={activateMutation.isPending}
              data-testid="button-activate-contract"
            >
              <Zap className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}

          {(isActive || contract.status === "Terminated") && isContractOwner && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/app/contract-performance/${refNo}`)}
              data-testid="button-view-performance"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              View Performance
            </Button>
          )}

          {isActive && isContractOwner && (
            <Button
              size="sm"
              onClick={() => setTerminateOpen(true)}
              disabled={terminateMutation.isPending}
              data-testid="button-terminate-contract"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Terminate
            </Button>
          )}


          {isPendingApproval && (canApprove || (currentUserProfile?.roles || []).some((r: { role_name: string }) => r.role_name === "ROLE_SUPERADMIN")) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="button-approve">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  className="text-green-600 dark:text-green-400 cursor-pointer"
                  onClick={() => {
                    resolveApprovalChecklistAvailability("Contract").then((available) => {
                      if (available) {
                        setChecklistDialogOpen(true);
                      } else {
                        setApprovalAction("Approve");
                        setTimeout(() => setApprovalDialogOpen(true), 0);
                      }
                    });
                  }}
                  data-testid="menu-item-approve"
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Approve
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 dark:text-red-400 cursor-pointer"
                  onClick={() => { setApprovalAction("Reject"); setTimeout(() => setApprovalDialogOpen(true), 0); }}
                  data-testid="menu-item-reject"
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Reject
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-orange-600 dark:text-orange-400 cursor-pointer"
                  onClick={() => { setApprovalAction("More"); setTimeout(() => setApprovalDialogOpen(true), 0); }}
                  data-testid="menu-item-more-info"
                >
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Request More Info
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isCurrentUserReviewer && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-review-actions">
                  Review Actions
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  className="text-green-600 focus:text-green-600 focus:bg-green-50 dark:focus:bg-green-950/30 cursor-pointer"
                  onClick={() => setTimeout(() => setAcceptOpen(true), 0)}
                  data-testid="menuitem-accept-review"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Accept Review
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-amber-600 focus:text-amber-600 focus:bg-amber-50 dark:focus:bg-amber-950/30 cursor-pointer"
                  onClick={() => setTimeout(() => setMoreInfoOpen(true), 0)}
                  data-testid="menuitem-more-info-review"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  More Info Required
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                  onClick={() => setTimeout(() => setRejectOpen(true), 0)}
                  data-testid="menuitem-reject-review"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Review
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isCurrentUserNegotiationReviewer && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-negotiation-review-actions">
                  Negotiation Review Actions
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  className="text-green-600 focus:text-green-600 focus:bg-green-50 dark:focus:bg-green-950/30 cursor-pointer"
                  onClick={() => setTimeout(() => setNegoAcceptOpen(true), 0)}
                  data-testid="menuitem-accept-negotiation-review"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Accept Review
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                  onClick={() => setTimeout(() => setNegoRejectOpen(true), 0)}
                  data-testid="menuitem-reject-negotiation-review"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Review
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {contract.status === "Approved" && (
            <ViewChecklistButton moduleName="Contract" refNumber={refNo} />
          )}

          {createdPoNumber && (
            <Link href={`/app/purchase-orders/${createdPoNumber}`}>
              <span className="text-sm font-mono font-medium text-primary hover:underline cursor-pointer" data-testid="link-created-po-from-contract">
                {createdPoNumber}
              </span>
            </Link>
          )}

          {contract.status === "Approved" && !allSowLinesHavePo && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => setCreatePODialogOpen(true)}
              data-testid="button-create-po-from-contract"
            >
              <Plus className="h-3.5 w-3.5" /> Create PO
            </Button>
          )}

          {/* View toggle — always last */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
            onClick={() => setViewMode(viewMode === 'classic' ? 'modern' : 'classic')}
            title={viewMode === 'classic' ? 'Switch to Modern View' : 'Switch to Classic View'}
            data-testid="button-view-toggle"
          >
            {viewMode === 'classic' ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <LayoutList className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Contract flow status tracker — business users only, not shown on the supplier portal */}
      <ContractStepper status={contract.status} />

      {/* Info cards — Classic mode only */}
      {viewMode === 'classic' && (
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Card 1 — Contract Details */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Contract Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="grid grid-cols-3 gap-3">
              <InfoRow label="Start Date" value={formatDate(contract.start_date)} icon={Calendar} />
              <InfoRow label="End Date" value={formatDate(contract.end_date)} icon={Calendar} />
              <InfoRow label="Currency" value={contract.currency} icon={DollarSign} />
              <InfoRow
                label="Contract Amount"
                value={formatCurrency(contract.contract_amount, contract.currency)}
                icon={DollarSign}
              />
              <InfoRow label="Renewable" value={contract.is_renewable} icon={RefreshCw} />
            </div>
            {linkedPoNumbers.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                    <FileCheck className="h-3 w-3" />
                    Linked PO
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {linkedPoNumbers.map((po) => (
                      <Link key={po as string} href={`/app/purchase-orders/${po}`}>
                        <Badge
                          variant="outline"
                          className="font-mono text-sm cursor-pointer hover:bg-accent"
                          data-testid={`badge-linked-po-${po}`}
                        >
                          {po as string}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            )}
            {contract.description && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Description</p>
                  <p className="text-sm">{contract.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 2 — People & Info */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              People & Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Buyer" value={contract.owner_name} subValue={contract.owner} icon={User} />
              <InfoRow label="Requestor" value={contract.requestor_name} subValue={contract.requestor_email} icon={User} />
              <InfoRow label="Department" value={contract.department_name} icon={Building2} />
              <InfoRow label="Created By" value={contract.created_by} icon={User} />
            </div>
            {(contract.project_name || contract.project_ref_no) && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Project Name" value={contract.project_name} icon={FolderOpen} />
                  <InfoRow label="Project Ref No" value={contract.project_ref_no} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

      </div>
      )}

      {/* ── Classic View: Approval History (below info cards, above vendor band) ── */}
      {viewMode === 'classic' && (contract?.approvers_list || approvalHistory.length > 0) && (
        <Accordion type="single" collapsible defaultValue="approval-history" className="mt-4">
          <AccordionItem value="approval-history" className="border rounded-lg">
            <AccordionTrigger className="px-4 py-2 hover:no-underline">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Approval History</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3">
              <div className="overflow-x-auto">
                <div className="flex items-start min-w-max">
                  {(() => {
                    type TimelineItem = {
                      name: string; status: "Approved" | "Rejected" | "More" | "ReSubmit" | "Pending" | "Delegation";
                      date?: string; comments?: string; stepOrder: number; roleName?: string;
                    };
                    const timelineItems: TimelineItem[] = [];

                    // 1. All completed actions from DB (sorted by date then id)
                    [...approvalHistory]
                      .sort((a, b) => {
                        const da = a.approved_date ? new Date(a.approved_date).getTime() : 0;
                        const db_ = b.approved_date ? new Date(b.approved_date).getTime() : 0;
                        return da !== db_ ? da - db_ : (a.id || 0) - (b.id || 0);
                      })
                      .forEach((approval, idx) => {
                        const approverTrimmed = (approval.approver_name || "").trim();
                        const isRole = ROLE_NAMES.some(r => approverTrimmed.toUpperCase() === r);
                        const s = approval.status;
                        const status: TimelineItem["status"] =
                          (s === "Approve" || s === "Approved") ? "Approved" :
                          (s === "Reject"  || s === "Rejected") ? "Rejected" :
                          (s === "More"    || s === "more")     ? "More"     :
                           s === "ReSubmit" ? "ReSubmit" : s === "Delegation" ? "Delegation" : "Approved";
                        timelineItems.push({
                          name: approval.approver_name || approval.email || "—",
                          status,
                          date: formatDate(approval.approved_date) || undefined,
                          comments: approval.comments || undefined,
                          stepOrder: idx + 1,
                          roleName: isRole ? approverTrimmed : undefined,
                        });
                      });

                    // 2. Pending approvers appended only when still in Pending Approval
                    if (contract.status === "Pending Approval" && contract.approvers_list) {
                      (contract.approvers_list as string)
                        .split(",").map((a: string) => a.trim()).filter(Boolean)
                        .forEach((approver: string) => {
                          const approverTrimmed = approver.trim();
                          const isRole = ROLE_NAMES.some(r => approverTrimmed.toUpperCase() === r);
                          timelineItems.push({
                            name: formatApproverDisplayName(approver),
                            status: "Pending",
                            stepOrder: timelineItems.length + 1,
                            roleName: isRole ? approverTrimmed : undefined,
                          });
                        });
                    }

                    if (timelineItems.length === 0) {
                      return <p className="text-sm text-muted-foreground">No approval history available</p>;
                    }
                    return timelineItems.map((item, index, arr) => {
                      const isApproved  = item.status === "Approved";
                      const isRejected  = item.status === "Rejected";
                      const isMoreInfo  = item.status === "More";
                      const isResubmit  = item.status === "ReSubmit";
                      const isPending   = item.status === "Pending";
                      const isDelegated   = item.status === "Delegation";
                      const statusColor = isApproved  ? "bg-emerald-500 border-emerald-500 text-white" :
                                         isRejected   ? "bg-red-500 border-red-500 text-white"         :
                                         isMoreInfo   ? "bg-amber-500 border-amber-500 text-white"     :
                                         isResubmit   ? "bg-blue-500 border-blue-500 text-white"       :
                                         "bg-muted border-muted-foreground/30 text-muted-foreground";
                      const dotColor   = isApproved  ? "bg-emerald-500" : isRejected ? "bg-red-500" :
                                         isMoreInfo   ? "bg-amber-500"  : isResubmit ? "bg-blue-500" : "bg-orange-500";
                      const statusLabel = isApproved ? "Approved" : isRejected ? "Rejected" :
                                          isMoreInfo ? "More Info" : isResubmit ? "Re-Submitted" : isDelegated ? "Delegated" : "Pending";
                      return (
                        <div key={index} className="flex items-start" data-testid={`classic-approval-item-${index}`}>
                          <div className="flex flex-col items-center min-w-[140px] max-w-[160px]">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${statusColor}`}>
                              {isPending   ? <Clock        className="h-4 w-4" /> :
                               isApproved  ? <CheckCircle2 className="h-4 w-4" /> :
                               isRejected  ? <XCircle      className="h-4 w-4" /> :
                               <AlertCircle className="h-4 w-4" />}
                            </div>
                            <div className="mt-1.5 text-center px-1">
                              <p className="text-xs font-medium truncate max-w-[140px]" title={item.name}>{item.name}</p>
                              {item.roleName && (
                                <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                  {item.roleName.replace(/^ROLE_/, "").replace(/_/g, " ")}
                                </p>
                              )}
                              <div className="flex items-center justify-center gap-1 mt-0.5">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                <span className="text-xs">{statusLabel}</span>
                              </div>
                              {item.date && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{item.date}</p>
                              )}
                              {item.comments && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 break-all" title={item.comments}>{item.comments}</p>
                              )}
                            </div>
                          </div>
                          {index < arr.length - 1 && (
                            <div className="flex items-center h-8">
                              <div className={`w-10 border-t-2 border-dashed ${isApproved ? "border-emerald-500" : "border-muted-foreground/30"}`} />
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* ── Classic View: Review Team History (buyer/owner only) ── */}
      {viewMode === 'classic' && isContractOwner && reviewHistory.length > 0 && (
        <Accordion type="single" collapsible defaultValue="review-history" className="mt-4">
          <AccordionItem value="review-history" className="border rounded-lg">
            <AccordionTrigger className="px-4 py-2 hover:no-underline">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Review Team History</span>
                <Badge variant="secondary" className="text-xs">{reviewHistory.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3">
              <div className="space-y-2">
                {reviewHistory.map((r: any, index: number) => {
                  const isAccepted = r.status === "Accepted" || r.status === "Negotiation Review Accepted";
                  const isRejected = r.status === "Rejected";
                  const iconClass = isAccepted ? "text-emerald-500" : isRejected ? "text-red-500" : "text-amber-500";
                  const badgeClass = isAccepted
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : isRejected
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
                  return (
                    <div key={index} className="flex items-start gap-3 rounded-lg border p-3 bg-muted/20">
                      <div className={`shrink-0 mt-0.5 ${iconClass}`}>
                        {isAccepted
                          ? <CheckCircle2 className="h-4 w-4" />
                          : isRejected
                          ? <XCircle className="h-4 w-4" />
                          : <AlertCircle className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-medium">{r.approver_name || r.email || "Reviewer"}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                            {r.status}
                          </span>
                        </div>
                        {r.email && r.approver_name && (
                          <p className="text-xs text-muted-foreground">{r.email}</p>
                        )}
                        {r.approved_date && (
                          <p className="text-xs text-muted-foreground">{formatDate(r.approved_date)}</p>
                        )}
                        {r.comments && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{r.comments}"</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Vendor + Review Team strips — Classic mode only */}
      {viewMode === 'classic' && (
      <div className="flex gap-3">

        {/* Vendor band — wider fixed */}
        <div className="w-80 shrink-0 border rounded-lg px-3 py-2.5 bg-background">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Store className="h-3.5 w-3.5" />
              Supplier
            </div>
            {canOwnerEdit && (
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setVendorDialogOpen(true)} data-testid="button-select-vendor">
                {vendor ? "Change" : <><Plus className="h-3 w-3 mr-1" />Add</>}
              </Button>
            )}
          </div>
          {vendorLoading ? (
            <div className="space-y-1.5"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-52" /></div>
          ) : vendor ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-sm font-semibold text-primary leading-tight truncate">{vendor.supplier_name}</p>
                {canOwnerEdit && (
                  <button className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeVendorMutation.mutate()} data-testid="button-remove-vendor">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5">
                {vendor.supplier_contact && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3 shrink-0" />{vendor.supplier_contact}
                  </span>
                )}
                {vendor.supplier_contact_email && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />{vendor.supplier_contact_email}
                  </span>
                )}
                {vendor.supplier_contact_no && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />{vendor.supplier_contact_no}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No supplier assigned yet.</p>
          )}
        </div>

        {/* Review Team band — flex-1 */}
        <div className="flex-1 border rounded-lg px-3 py-2.5 bg-background min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Users className="h-3.5 w-3.5" />
              Review Team
            </div>
            {canOwnerEdit && (
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setReviewerDialogOpen(true)} data-testid="button-add-reviewer">
                <Plus className="h-3 w-3 mr-1" />Add
              </Button>
            )}
          </div>
          {reviewersLoading ? (
            <div className="flex gap-2"><Skeleton className="h-9 w-28" /><Skeleton className="h-9 w-28" /></div>
          ) : reviewers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
                  {[...reviewers]
                    .sort((a, b) => a.level - b.level)
                    .map((r) => (
                <TooltipProvider key={r.id} delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <h1 className="text-center text-xs">Level : {r?.level}</h1>
                      <div className="flex items-center gap-2 bg-muted/40 border rounded-md px-2 py-1 min-w-0 cursor-default">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                            {r.user_name?.charAt(0)?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight truncate max-w-[100px]">{r.user_name}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight truncate max-w-[100px]">{r.user_email}</p>
                        </div>
                        {canOwnerEdit && (
                          <button
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeReviewerMutation.mutate(r.id)}
                            data-testid={`button-remove-reviewer-${r.id}`}
                            title={`Remove ${r.user_name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">
                      <p className="font-semibold">{r.user_name}</p>
                      {r.user_email && <p className="text-xs text-muted-foreground">{r.user_email}</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No reviewers added yet.</p>
          )}
        </div>

      </div>
      )}

      {/* ═══ MODERN CLM VIEW ═══ */}
      {viewMode === 'modern' && (
        <div className="mt-4" style={{ height: 'calc(100vh - 158px)', minHeight: '620px' }}>

          {/* ── Slim header action bar ── */}
          <div className="flex items-center justify-between border rounded-t-xl px-4 py-2 bg-background gap-3 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Layers className="h-3.5 w-3.5" />
                {localClauses.length} {localClauses.length === 1 ? 'clause' : 'clauses'}
              </span>
              {contract.contract_amount && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <DollarSign className="h-3.5 w-3.5" />
                  {formatCurrency(contract.contract_amount, contract.currency)}
                </span>
              )}
              {dirtyClauses.size > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-400 text-[10px] shrink-0">
                  {dirtyClauses.size} unsaved
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Right panel toggle — grouped dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={rightPanel && rightPanel !== 'variables' ? 'secondary' : 'ghost'}
                    size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                    data-testid="button-modern-panel-menu"
                  >
                    {rightPanel === 'details' && <><FileText className="h-3.5 w-3.5" /> Details</>}
                    {rightPanel === 'vendors' && <><Store className="h-3.5 w-3.5" /> Supplier</>}
                    {rightPanel === 'team' && <><Users className="h-3.5 w-3.5" /> Team</>}
                    {(rightPanel === 'variables' || !rightPanel) && <><Info className="h-3.5 w-3.5" /> Contract Info</>}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    className={`gap-2 text-xs ${rightPanel === 'details' ? 'bg-accent' : ''}`}
                    onClick={() => setRightPanel(p => p === 'details' ? null : 'details')}
                    data-testid="button-modern-panel-details"
                  >
                    <FileText className="h-3.5 w-3.5" /> Details
                    {rightPanel === 'details' && <span className="ml-auto text-primary">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={`gap-2 text-xs ${rightPanel === 'vendors' ? 'bg-accent' : ''}`}
                    onClick={() => setRightPanel(p => p === 'vendors' ? null : 'vendors')}
                    data-testid="button-modern-panel-vendors"
                  >
                    <Store className="h-3.5 w-3.5" /> Supplier
                    {rightPanel === 'vendors' && <span className="ml-auto text-primary">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={`gap-2 text-xs ${rightPanel === 'team' ? 'bg-accent' : ''}`}
                    onClick={() => setRightPanel(p => p === 'team' ? null : 'team')}
                    data-testid="button-modern-panel-team"
                  >
                    <Users className="h-3.5 w-3.5" /> Team
                    {rightPanel === 'team' && <span className="ml-auto text-primary">✓</span>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Variables — standalone quick-access button */}
              <Button
                variant={rightPanel === 'variables' ? 'secondary' : 'ghost'}
                size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                onClick={() => setRightPanel(p => p === 'variables' ? null : 'variables')}
                data-testid="button-modern-panel-variables"
              >
                <Braces className="h-3.5 w-3.5" /> Variables
              </Button>
              {/* SOW + Delivery — grouped dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={rightPanel === 'sow' || rightPanel === 'delivery' ? 'secondary' : 'ghost'}
                    size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                    data-testid="button-modern-panel-content-menu"
                  >
                    <FileText className="h-3.5 w-3.5" /> SOW <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem
                    className={`text-xs gap-2 cursor-pointer ${rightPanel === 'sow' ? 'bg-accent font-medium' : ''}`}
                    onClick={() => setRightPanel(p => p === 'sow' ? null : 'sow')}
                    data-testid="button-modern-panel-sow"
                  >
                    <ClipboardList className="h-3.5 w-3.5" /> Scope of Work
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={`text-xs gap-2 cursor-pointer ${rightPanel === 'delivery' ? 'bg-accent font-medium' : ''}`}
                    onClick={() => setRightPanel(p => p === 'delivery' ? null : 'delivery')}
                    data-testid="button-modern-panel-delivery"
                  >
                    <CalendarClock className="h-3.5 w-3.5" /> Delivery & Payment
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Audit History — standalone quick-access button */}
              <Button
                variant={rightPanel === 'audit' ? 'secondary' : 'ghost'}
                size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                onClick={() => setRightPanel(p => p === 'audit' ? null : 'audit')}
                data-testid="button-modern-panel-audit"
              >
                <ClipboardList className="h-3.5 w-3.5" /> Audit
              </Button>
              {/* Approval History — shown when contract has approvers */}
              {contract?.approvers_list && (
                <Button
                  variant={rightPanel === 'approval' ? 'secondary' : 'ghost'}
                  size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                  onClick={() => setRightPanel(p => p === 'approval' ? null : 'approval')}
                  data-testid="button-modern-panel-approval"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approvals
                </Button>
              )}
              <span className="w-px h-4 bg-border mx-1" />
              <Button
                variant="ghost" size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                onClick={handleDownload}
                data-testid="button-modern-download"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>
          </div>

          {/* ── Main three-column body ── */}
          <div className="flex border border-t-0 rounded-b-xl overflow-hidden bg-background" style={{ height: 'calc(100% - 42px)' }}>

            {/* ── Left: Clause Panel ── */}
            <div className={cn("flex-shrink-0 flex flex-col border-r bg-muted/20 transition-all duration-200", clausePanelCollapsed ? "w-8" : "w-56")}>
              {/* Collapsed strip */}
              {clausePanelCollapsed && (
                <div className="flex flex-col items-center pt-2 gap-2 flex-1">
                  <button
                    onClick={() => setClausePanelCollapsed(false)}
                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Expand clause panel"
                    data-testid="button-expand-clause-panel"
                  >
                    <PanelRight className="h-3.5 w-3.5" />
                  </button>
                  {dirtyClauses.size > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title={`${dirtyClauses.size} unsaved`} />
                  )}
                </div>
              )}
              {/* Expanded content */}
              {!clausePanelCollapsed && (
              <div className="flex flex-col flex-1 min-h-0">
              <div className="px-3 py-2 border-b bg-background">
                <div className="flex items-center gap-1.5 mb-2">
                  <BookMarked className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold">Clause Editor</span>
                  {dirtyClauses.size > 0 && (
                    <button onClick={saveAllClauses} disabled={savingClauses} className="ml-auto text-[10px] px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 font-medium" data-testid="button-modern-save-clauses">
                      {savingClauses ? "Saving…" : `Save Changes`}
                    </button>
                  )}
                  <button
                    onClick={() => setClausePanelCollapsed(true)}
                    className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                    title="Collapse clause panel"
                    data-testid="button-collapse-clause-panel"
                  >
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                  </button>
                </div>
                {canOwnerEditClauses && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1.5 h-3 w-3 text-muted-foreground" />
                    <input type="text" placeholder="Search library…" value={clauseLibSearch} onChange={e => setClauseLibSearch(e.target.value)}
                      className="w-full pl-7 pr-3 py-1 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      data-testid="input-modern-clause-search" />
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="px-2 pt-2 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">In This Contract ({localClauses.length})</p>
                  {localClauses.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4 opacity-60">No clauses yet</p>
                  ) : (
                    <div className="space-y-0.5">
                      {localClauses.map((clause, idx) => (
                        <div
                          key={clause.id}
                          onClick={() => {
                            if (clause.status === 'Deleted') return;
                            if (modernEditingClause && modernEditingClause !== clause.id && dirtyClauses.has(modernEditingClause)) {
                              saveAllClauses();
                            }
                            setModernEditingClause(modernEditingClause === clause.id ? null : clause.id);
                          }}
                          className={cn(
                            "group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs transition-colors",
                            clause.status === 'Deleted' ? "opacity-50 cursor-default" : "cursor-pointer",
                            modernEditingClause === clause.id
                              ? "bg-primary/15 border border-primary/40 text-primary"
                              : clause.status !== 'Deleted' ? "hover:bg-muted/60" : "",
                            dirtyClauses.has(clause.id) && modernEditingClause !== clause.id && "border-l-2 border-l-amber-400"
                          )}
                          data-testid={`modern-clause-row-${clause.id}`}
                        >
                          <span className="w-4 text-muted-foreground/50 text-[10px] shrink-0 text-right">{idx + 1}.</span>
                          <span className={cn("flex-1 truncate font-medium", clause.status === 'Deleted' && "line-through")} title={clause.terms_name || clause.row_name}>
                            {clause.terms_name || clause.row_name || "Untitled Clause"}
                          </span>
                          {isInNegotiation && clause.status && ['Published', 'Accepted', 'Deleted'].includes(clause.status) && (
                            <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded shrink-0",
                              clause.status === 'Accepted' ? "bg-emerald-100 text-emerald-700" :
                              clause.status === 'Deleted' ? "bg-red-100 text-red-700" :
                              "bg-sky-100 text-sky-700"
                            )}>{clause.status}</span>
                          )}
                          {clauseNeedsAttention(clause) && (
                            <span
                              className="h-2 w-2 rounded-full bg-orange-500 shrink-0 ring-1 ring-orange-300"
                              title="Has unresolved reviewer changes or open comments"
                            />
                          )}
                          {dirtyClauses.has(clause.id) && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
                          {canOwnerEditClauses && clause.status !== 'Deleted' && (
                            <button onClick={e => { e.stopPropagation(); setDeleteClauseId(clause.id); }} className="opacity-0 group-hover:opacity-100 text-destructive shrink-0" data-testid={`button-modern-delete-clause-${clause.id}`}>
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {canOwnerEditClauses && <div className="mx-2 my-1.5 border-t" />}
                {canOwnerEditClauses && <div className="px-2 pb-3">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Clause Library</p>
                    <span className="text-[9px] text-muted-foreground/60 italic">drag → doc</span>
                  </div>
                  {clauseLibrary.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3 opacity-60">No library clauses</p>
                  ) : (
                    <div className="divide-y">
                      {clauseLibrary.map((lib: any) => {
                        const alreadyAdded = localClauses.some(c => c.terms_name === lib.section_name);
                        const canDrag = canOwnerEditClauses && !alreadyAdded && !addClauseMutation.isPending;
                        const plainText = lib.description
                          ? lib.description.replace(/\s+/g, " ").trim()
                          : lib.html_content
                            ? (() => { try { return new DOMParser().parseFromString(lib.html_content, "text/html").body.textContent?.replace(/\s+/g, " ").trim() || ""; } catch { return ""; } })()
                            : "";
                        return (
                          <div
                            key={lib.id}
                            draggable={canDrag}
                            onDragStart={canDrag ? (e) => { e.dataTransfer.effectAllowed = "copy"; setDragLibraryClause(lib); } : undefined}
                            onDragEnd={() => { setDragLibraryClause(null); setLibDragOverCenter(false); }}
                            onClick={() => canDrag && addFromLibrary(lib)}
                            className={cn("w-full px-2 py-2 text-xs text-left transition-colors select-none",
                              alreadyAdded ? "opacity-40 cursor-default" : canOwnerEditClauses ? "hover:bg-primary/10 cursor-grab active:cursor-grabbing" : "opacity-40 cursor-default")}
                            data-testid={`button-modern-add-lib-${lib.id}`}
                          >
                            <div className="flex items-start gap-1.5 mb-0.5">
                              {alreadyAdded
                                ? <Check className="h-3 w-3 shrink-0 text-green-500 mt-0.5" />
                                : <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/40 mt-0.5" />}
                              <span className={cn("font-medium leading-snug", alreadyAdded ? "" : "group-hover:text-primary")}>
                                {lib.section_name}
                              </span>
                              {alreadyAdded && <span className="text-[10px] text-green-600 shrink-0 ml-auto">Added</span>}
                            </div>
                            {plainText && (
                              <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 pl-4">
                                {plainText}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {canOwnerEditClauses && (
                    <button onClick={addBlankClause} disabled={addClauseMutation.isPending}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-muted-foreground/30 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      data-testid="button-modern-add-blank-clause">
                      <Plus className="h-3 w-3" /> Add blank clause
                    </button>
                  )}
                </div>}
              </div>
              </div>
              )}
            </div>

            {/* ── Center: Clause Editor or Live Document ── */}
            <div
              className="flex-1 flex flex-col min-w-0 relative"
              onDragOver={(e) => { if (dragLibraryClause) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setLibDragOverCenter(true); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setLibDragOverCenter(false); }}
              onDrop={(e) => { e.preventDefault(); if (dragLibraryClause) { addFromLibrary(dragLibraryClause); setDragLibraryClause(null); setLibDragOverCenter(false); } }}
            >
              {/* Drop zone overlay — shown when dragging a library clause over the center */}
              {libDragOverCenter && dragLibraryClause && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-sm pointer-events-none">
                  <Plus className="h-8 w-8 text-primary mb-2" />
                  <p className="text-sm font-semibold text-primary">Drop to add "{dragLibraryClause.section_name}"</p>
                  <p className="text-xs text-primary/70 mt-1">Release to append this clause to the contract</p>
                </div>
              )}
              {modernClause ? (
                <>
                  {/* Editor header */}
                  <div className="px-4 py-2 border-b bg-muted/10 flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => setModernEditingClause(null)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-modern-back-preview"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Back to Preview
                    </button>
                    <span className="text-muted-foreground/40">|</span>
                    <span className="text-xs font-medium text-foreground truncate flex-1">
                      {modernClause.terms_name || modernClause.row_name || "Untitled Clause"}
                    </span>
                    {isCurrentUserReviewer && dirtyClauses.has(modernClause.id) && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">Unsaved changes</Badge>
                        <button onClick={e => { e.stopPropagation(); discardClauseChanges(modernClause.id); }} title="Discard changes" className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" data-testid={`button-discard-clause-${modernClause.id}`}>
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {!isCurrentUserReviewer && dirtyClauses.has(modernClause.id) && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50">Unsaved</Badge>
                        <button onClick={e => { e.stopPropagation(); discardClauseChanges(modernClause.id); }} title="Discard changes" className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" data-testid={`button-discard-clause-${modernClause.id}`}>
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {isContractOwner && !isDraft && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setHistoryClauseId(modernClause.id); setHistoryClauseName(modernClause.terms_name || modernClause.row_name || "Untitled Clause"); }}
                        className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="View clause history"
                        data-testid={`button-clause-history-${modernClause.id}`}
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isCurrentUserReviewer ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {dirtyClauses.size > 0 && (
                          <button
                            onClick={saveAllClauses}
                            disabled={savingClauses || submittingReview}
                            className="text-xs px-2 py-1 rounded-md border border-input bg-background hover:bg-accent font-medium transition-colors"
                            data-testid="button-modern-save-from-editor"
                          >
                            {savingClauses ? "Saving…" : "Save Changes"}
                          </button>
                        )}
                        <button
                          onClick={submitReview}
                          disabled={submittingReview || savingClauses}
                          className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors"
                          data-testid="button-modern-submit-review"
                        >
                          {submittingReview ? "Submitting…" : "Submit Review"}
                        </button>
                      </div>
                    ) : dirtyClauses.size > 0 ? (
                      <button
                        onClick={saveAllClauses}
                        disabled={savingClauses}
                        className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium shrink-0 transition-colors"
                        data-testid="button-modern-save-from-editor"
                      >
                        {savingClauses ? "Saving…" : "Save Changes"}
                      </button>
                    ) : null}
                  </div>

                  {/* Editor body */}
                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clause Title</Label>
                      <Input
                        className="mt-1.5"
                        value={modernClause.terms_name || ""}
                        onChange={e => updateLocalClause(modernClause.id, { terms_name: e.target.value })}
                        placeholder="Enter clause title"
                        disabled={!canEditClauses}
                        data-testid={`input-modern-clause-title-${modernClause.id}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clause Content</Label>
                      <div className="mt-1.5">
                        <TiptapClauseEditor
                          key={`tiptap-modern-${modernClause.id}-${clauseResetCounters[modernClause.id] || 0}`}
                          value={modernClause.term_details || ""}
                          onChange={val => { if (canEditClauses) updateLocalClause(modernClause.id, { term_details: val }); }}
                          placeholder="Start writing the clause content here…"
                          height={380}
                          trackChangesMode={isUnderReview && isCurrentUserReviewer}
                          showChangesBar={canOwnerResolveChanges && hasTrackChanges(modernClause.term_details || "")}
                          reviewerId={String(currentUserId)}
                          reviewerName={currentUserName}
                          readOnly={!canEditClauses}
                          onAddComment={isCurrentUserReviewer ? (cid, sel, txt) => handleAddComment(modernClause.id, cid, sel, txt) : undefined}
                          onAcceptAll={async (cleanHtml) => {
                            updateLocalClause(modernClause.id, { term_details: cleanHtml });
                            await saveClauseImmediate(modernClause.id, cleanHtml, modernClause.terms_name);
                            if (isInNegotiation) await updateClauseStatus(modernClause.id, 'Accepted');
                            toast({ title: "Changes accepted", description: "Clause saved with accepted content." });
                          }}
                          onRejectAll={async (cleanHtml) => {
                            updateLocalClause(modernClause.id, { term_details: cleanHtml });
                            await saveClauseImmediate(modernClause.id, cleanHtml, modernClause.terms_name);
                            toast({ title: "Changes rejected", description: "Clause restored to original content." });
                          }}
                        />
                        {/* Comments panel */}
                        <ClauseCommentsPanel
                          comments={commentsByClause[modernClause.id] || []}
                          clauseId={modernClause.id}
                          canResolve={canOwnerResolveChanges && hasOpenComments(modernClause.id)}
                          onResolve={(commentId) => handleResolveComment(modernClause.id, commentId)}
                        />
                      </div>
                    </div>
                    {modernClause.mandatory === "Yes" && (
                      <Badge variant="secondary" className="text-xs">Mandatory Clause</Badge>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="px-3 py-1.5 border-b bg-muted/10 flex items-center gap-2 flex-shrink-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] text-muted-foreground">Live document — click a clause to edit</span>
                  </div>
                  <div className="flex-1 relative min-h-0">
                    <iframe
                      key={previewRefreshKey}
                      src={previewUrl}
                      className="absolute inset-0 w-full h-full border-0"
                      title="Live Contract Preview"
                      data-testid="iframe-modern-preview"
                    />
                    {/* Transparent drag-shield: blocks iframe from eating drag events while a library clause is being dragged */}
                    {dragLibraryClause && (
                      <div className="absolute inset-0 z-10" style={{ background: 'transparent' }} />
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Right: Contextual Info Panel ── */}
            {rightPanel && (
              <div className="w-72 flex-shrink-0 border-l flex flex-col bg-background">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {rightPanel === 'details' && 'Contract Details'}
                    {rightPanel === 'vendors' && 'Vendor'}
                    {rightPanel === 'team' && 'Review Team'}
                    {rightPanel === 'variables' && 'Variables'}
                    {rightPanel === 'sow' && 'Scope of Work'}
                    {rightPanel === 'delivery' && 'Delivery & Payment'}
                    {rightPanel === 'audit' && 'Audit History'}
                    {rightPanel === 'approval' && 'Approval History'}
                  </span>
                  <button onClick={() => setRightPanel(null)} className="text-muted-foreground hover:text-foreground" data-testid="button-modern-close-panel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                  {/* ── Details Panel ── */}
                  {rightPanel === 'details' && (
                    <>
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contract</p>
                        <InfoRow label="Start Date" value={formatDate(contract.start_date)} icon={Calendar} />
                        <InfoRow label="End Date" value={formatDate(contract.end_date)} icon={Calendar} />
                        <InfoRow label="Currency" value={contract.currency} icon={DollarSign} />
                        <InfoRow label="Amount" value={formatCurrency(contract.contract_amount, contract.currency)} icon={DollarSign} />
                        <InfoRow label="Renewable" value={contract.is_renewable} icon={RefreshCw} />
                      </div>
                      {contract.description && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Description</p>
                          <p className="text-xs text-foreground">{contract.description}</p>
                        </div>
                      )}
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">People</p>
                        <InfoRow label="Buyer" value={contract.owner_name} subValue={contract.owner} icon={User} />
                        <InfoRow label="Requestor" value={contract.requestor_name} subValue={contract.requestor_email} icon={User} />
                        <InfoRow label="Department" value={contract.department_name} icon={Building2} />
                        <InfoRow label="Created By" value={contract.created_by} icon={User} />
                      </div>
                      {(contract.project_name || contract.project_ref_no) && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project</p>
                          <InfoRow label="Name" value={contract.project_name} icon={FolderOpen} />
                          <InfoRow label="Ref No" value={contract.project_ref_no} />
                        </div>
                      )}
                      {canOwnerEdit && (
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setEditOpen(true)} data-testid="button-modern-panel-edit">
                          <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit Contract Details
                        </Button>
                      )}
                    </>
                  )}

                  {/* ── Vendors Panel ── */}
                  {rightPanel === 'vendors' && (
                    <div className="space-y-3">
                      {vendorLoading ? (
                        <Skeleton className="h-24 w-full" />
                      ) : vendor ? (
                        <div className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-primary">{vendor.supplier_name}</p>
                            {canOwnerEdit && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeVendorMutation.mutate()} data-testid="button-modern-remove-vendor">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          {(vendor.supplier_contact || vendor.supplier_contact_email || vendor.supplier_contact_no) && <Separator />}
                          {vendor.supplier_contact && <div className="flex items-center gap-2 text-xs text-muted-foreground"><User className="h-3 w-3 shrink-0" /><span>{vendor.supplier_contact}</span></div>}
                          {vendor.supplier_contact_email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3 w-3 shrink-0" /><span>{vendor.supplier_contact_email}</span></div>}
                          {vendor.supplier_contact_no && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" /><span>{vendor.supplier_contact_no}</span></div>}
                          {canOwnerEdit && (
                            <Button variant="outline" size="sm" className="w-full text-xs mt-1" onClick={() => setVendorDialogOpen(true)} data-testid="button-modern-change-vendor">
                              Change Supplier
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <Store className="h-10 w-10 text-muted-foreground/30 mb-2" />
                          <p className="text-sm text-muted-foreground mb-3">No supplier selected</p>
                          {canOwnerEdit && (
                            <Button variant="outline" size="sm" className="text-xs" onClick={() => setVendorDialogOpen(true)} data-testid="button-modern-select-vendor">
                              <Plus className="h-3.5 w-3.5 mr-1" /> Select Supplier
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Variables Panel ── */}
                  {rightPanel === 'variables' && (() => {
                    const vars = extractVariables();
                    return (
                      <div className="space-y-4">
                        {vars.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 text-center">
                            <Braces className="h-10 w-10 text-muted-foreground/30 mb-2" />
                            <p className="text-sm font-medium text-muted-foreground">No variables found</p>
                            <p className="text-xs text-muted-foreground/70 mt-1 px-2">Use <code className="bg-muted px-1 rounded text-[10px]">{"{{variable_name}}"}</code> in clause text to define fillable variables.</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">{vars.length} variable{vars.length !== 1 ? 's' : ''} found across clauses. Fill in values to replace placeholders.</p>
                            <div className="space-y-3">
                              {vars.map(({ name, clauseIds }) => (
                                <div key={name} className="space-y-1">
                                  <Label className="text-xs font-medium capitalize">{name.replace(/_/g, ' ')}</Label>
                                  <p className="text-[10px] text-muted-foreground">Used in {clauseIds.length} clause{clauseIds.length !== 1 ? 's' : ''}</p>
                                  <Input
                                    className="h-7 text-xs"
                                    placeholder={`Enter ${name.replace(/_/g, ' ')}`}
                                    data-testid={`input-variable-${name}`}
                                    onBlur={e => { if (e.target.value) applyVariable(name, e.target.value); }}
                                    onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; if (v) applyVariable(name, v); } }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="pt-2 border-t">
                              <p className="text-[10px] text-muted-foreground">Press Enter or Tab to apply each value. Changes are reflected in the editor immediately and saved with your next save.</p>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Team Panel ── */}
                  {rightPanel === 'team' && (
                    <div className="space-y-3">
                      {reviewersLoading ? (
                        <Skeleton className="h-20 w-full" />
                      ) : reviewers.length > 0 ? (
                        <div className="space-y-2">
                          {reviewers.map((r) => (
                            <div key={r.id} className="flex items-center justify-between gap-2">
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 min-w-0 cursor-default">
                                      <Avatar className="h-7 w-7 shrink-0">
                                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                          {r.user_name?.charAt(0)?.toUpperCase() || "U"}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{r.user_name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{r.user_email}</p>
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[220px]">
                                    <p className="font-semibold">{r.user_name}</p>
                                    {r.user_email && <p className="text-xs text-muted-foreground">{r.user_email}</p>}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {canOwnerEdit && (
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeReviewerMutation.mutate(r.id)} data-testid={`button-modern-remove-reviewer-${r.id}`}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <Users className="h-10 w-10 text-muted-foreground/30 mb-2" />
                          <p className="text-sm text-muted-foreground">No members added</p>
                        </div>
                      )}
                      {canOwnerEdit && (
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setReviewerDialogOpen(true)} data-testid="button-modern-add-reviewer">
                          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Team Member
                        </Button>
                      )}
                    </div>
                  )}

                  {/* ── SOW Panel ── */}
                  {rightPanel === 'sow' && (
                    <div className="space-y-3">
                      {canOwnerEdit && (
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={openAddSow} data-testid="button-modern-add-sow">
                          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add SOW Line
                        </Button>
                      )}
                      {sowLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      ) : sowLines.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-2" />
                          <p className="text-sm text-muted-foreground">No SOW lines yet</p>
                          {isDraft && <p className="text-xs text-muted-foreground/60 mt-1">Click "Add SOW Line" to begin</p>}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {sowLines.map((line: any) => (
                            <div key={line.id} className="rounded-lg border bg-muted/20 p-2.5 space-y-1.5" data-testid={`modern-sow-row-${line.id}`}>
                              <div className="flex items-start justify-between gap-1">
                                <p className="text-xs font-medium leading-snug flex-1 truncate" title={line.description}>{line.description || "—"}</p>
                                {canOwnerEdit && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button onClick={() => openEditSow(line)} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10" data-testid={`button-modern-edit-sow-${line.id}`}>
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button onClick={() => deleteSowMutation.mutate(line.id)} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10" data-testid={`button-modern-delete-sow-${line.id}`}>
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                                {line.quantity && <span>Qty: <strong className="text-foreground">{line.quantity}</strong>{line.uom ? ` ${line.uom}` : ""}</span>}
                                {line.unit_cost != null && <span>Unit: <strong className="text-foreground">{formatCurrency(String(line.unit_cost), contract?.currency)}</strong></span>}
                                {line.total_cost != null && <span>Total: <strong className="text-primary">{formatCurrency(String(line.total_cost), contract?.currency)}</strong></span>}
                              </div>
                              {line.deliverydate && (
                                <p className="text-[10px] text-muted-foreground">Delivery: <strong className="text-foreground">{formatDate(line.deliverydate)}</strong></p>
                              )}
                            </div>
                          ))}
                          {sowLines.some((l: any) => l.total_cost != null) && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-center justify-between">
                              <span className="text-xs font-semibold text-primary">Grand Total</span>
                              <span className="text-sm font-bold text-primary">
                                {formatCurrency(String(sowLines.reduce((s: number, l: any) => s + (l.total_cost ? Number(l.total_cost) : 0), 0)), contract?.currency)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* ── Documents section inside SOW panel ── */}
                      <div className="pt-1">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Documents</p>
                          {canOwnerEdit && (
                            <button onClick={() => setShowAttachDialog(true)} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10" data-testid="button-modern-attach-document">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {attachLoading ? (
                          <Skeleton className="h-12 w-full" />
                        ) : attachments.length === 0 ? (
                          <div className="flex items-center gap-2 py-3 text-muted-foreground/60">
                            <Paperclip className="h-4 w-4 shrink-0" />
                            <p className="text-xs">No documents attached</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {attachments.map((att: any) => (
                              <div key={att.id} className="rounded-md border bg-muted/20 px-2.5 py-2 flex items-start gap-2" data-testid={`modern-sow-attachment-row-${att.id}`}>
                                <File className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  {att.attach_path ? (
                                    <a href={`/api/contracts/${contractId}/attachments/${att.id}/download`} download className="text-xs font-medium text-primary hover:underline block truncate" title={att.attach_name} data-testid={`link-modern-sow-download-${att.id}`}>
                                      {att.attach_name}
                                    </a>
                                  ) : (
                                    <span className="text-xs font-medium block truncate" title={att.attach_name}>{att.attach_name}</span>
                                  )}
                                  {att.attach_desc && <p className="text-[10px] text-muted-foreground truncate" title={att.attach_desc}>{att.attach_desc}</p>}
                                </div>
                                {canOwnerEdit && (
                                  <button onClick={() => setDeleteAttachId(att.id)} className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0" data-testid={`button-modern-sow-delete-attachment-${att.id}`}>
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Delivery Schedule + Payment Terms Panel ── */}
                  {rightPanel === 'delivery' && (
                    <div className="space-y-5">

                      {/* ─ Delivery Schedule section ─ */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <CalendarClock className="h-3 w-3" /> Delivery Schedule
                          </p>
                          {canOwnerEdit && (
                            <button onClick={() => { setEditingDelivSched(null); setDelivSchedForm({ ...emptyDelivForm, schedule_type: lockedSchedType || 'fixed' }); setDelivSchedOpen(true); }} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10" data-testid="button-modern-add-delivery">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {lockedSchedType && (
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>Type:</span>
                            <span className="font-medium text-foreground">{SCHED_TYPES.find(t => t.value === lockedSchedType)?.label || lockedSchedType}</span>
                            <span className="opacity-40">· locked</span>
                          </div>
                        )}
                        {delivSchedLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-14 w-full" />
                            <Skeleton className="h-14 w-full" />
                          </div>
                        ) : deliverySchedules.length === 0 ? (
                          <div className="flex items-center gap-2 py-3 text-muted-foreground/60">
                            <CalendarClock className="h-4 w-4 shrink-0" />
                            <p className="text-xs">No milestones yet</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {deliverySchedules.map((s: any) => (
                              <div key={s.id} className="rounded-lg border bg-muted/20 p-2.5 space-y-1.5" data-testid={`modern-delivery-row-${s.id}`}>
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-xs font-medium leading-snug flex-1 truncate" title={s.deliverable_name}>{s.deliverable_name || s.schedule_frequency || "—"}</p>
                                  {canOwnerEdit && (
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button onClick={() => { setEditingDelivSched(s); setDelivSchedForm({ deliverable_name: s.deliverable_name || '', details: s.details || '', schedule_type: s.schedule_type || 'fixed', schedule_date: s.schedule_date ? s.schedule_date.split('T')[0] : '', tentative_date: s.tentative_date ? s.tentative_date.split('T')[0] : '', elasped_days: s.elasped_days ?? '', amt_milestone: s.amt_milestone ?? '', pcnt_milestone: s.pcnt_milestone ?? '', schedule_frequency: s.schedule_frequency || '' }); setDelivSchedOpen(true); }} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10" data-testid={`button-modern-edit-delivery-${s.id}`}>
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      <button onClick={() => deleteDelivSchedMutation.mutate(s.id)} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10" data-testid={`button-modern-delete-delivery-${s.id}`}>
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                                  {s.schedule_date && <span>Due: <strong className="text-foreground">{formatDate(s.schedule_date)}</strong></span>}
                                  {s.elasped_days && <span>Duration: <strong className="text-foreground">{s.elasped_days}d</strong></span>}
                                  {s.amt_milestone && <span>Amount: <strong className="text-primary">{formatCurrency(String(s.amt_milestone), contract?.currency)}</strong></span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="border-t" />

                      {/* ─ Payment Terms section ─ */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <CreditCard className="h-3 w-3" /> Payment Terms
                          </p>
                          {canOwnerEdit && deliverySchedules.length > 0 && (
                            <button onClick={() => { setEditingPayTerm(null); setPayTermForm({ ...emptyPayTermForm }); setPayTermOpen(true); }} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10" data-testid="button-modern-add-payment">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {deliverySchedules.length === 0 ? (
                          isDraft ? (
                            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-400">
                              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>Add delivery milestones first.</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 py-3 text-muted-foreground/60">
                              <CreditCard className="h-4 w-4 shrink-0" />
                              <p className="text-xs">No payment terms yet</p>
                            </div>
                          )
                        ) : payTermLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-14 w-full" />
                            <Skeleton className="h-14 w-full" />
                          </div>
                        ) : paymentTerms.length === 0 ? (
                          <div className="flex items-center gap-2 py-3 text-muted-foreground/60">
                            <CreditCard className="h-4 w-4 shrink-0" />
                            <p className="text-xs">No payment terms yet</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {paymentTerms.map((t: any) => (
                              <div key={t.id} className="rounded-lg border bg-muted/20 p-2.5 space-y-1.5" data-testid={`modern-payment-row-${t.id}`}>
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-xs font-medium leading-snug flex-1 truncate" title={t.name}>{t.name || "—"}</p>
                                  {canOwnerEdit && (
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button onClick={() => { setEditingPayTerm(t); setPayTermForm({ name: t.name || '', payment_type: t.payment_type || 'advance', period: t.period || '', amt_milestone: t.amt_milestone ?? '', pcnt_milestone: t.pcnt_milestone ?? '' }); setPayTermOpen(true); }} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10" data-testid={`button-modern-edit-payment-${t.id}`}>
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      <button onClick={() => deletePayTermMutation.mutate(t.id)} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10" data-testid={`button-modern-delete-payment-${t.id}`}>
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                                  <span className="font-medium text-foreground">{PAYMENT_TYPES.find(p => p.value === t.payment_type)?.label ?? t.payment_type ?? "—"}</span>
                                  {t.pcnt_milestone && <span>%: <strong className="text-foreground">{t.pcnt_milestone}%</strong></span>}
                                  {t.amt_milestone && <span>Amt: <strong className="text-primary">{formatCurrency(String(t.amt_milestone), contract?.currency)}</strong></span>}
                                </div>
                                {t.period && <p className="text-[10px] text-muted-foreground truncate" title={t.period}>{t.period}</p>}
                              </div>
                            ))}
                            {paymentTerms.some((t: any) => t.amt_milestone) && (
                              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-center justify-between">
                                <span className="text-xs font-semibold text-primary">Total</span>
                                <span className="text-sm font-bold text-primary">
                                  {formatCurrency(String(paymentTerms.reduce((s: number, t: any) => s + (t.amt_milestone ? Number(t.amt_milestone) : 0), 0)), contract?.currency)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                  {/* ── Audit History Panel ── */}
                  {rightPanel === 'audit' && (
                    <div className="space-y-2">
                      {!auditData ? (
                        <div className="space-y-2">
                          {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                        </div>
                      ) : !auditData.records?.length ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-2" />
                          <p className="text-sm text-muted-foreground">No audit records found</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">{auditData.total} total record{auditData.total !== 1 ? 's' : ''}</p>
                          {auditData.records.map((log: any) => (
                            <div key={log.id} className="rounded-lg border p-2.5 bg-muted/20 space-y-1" data-testid={`modern-audit-row-${log.id}`}>
                              <div className="flex items-center justify-between gap-1">
                                <Badge variant="outline" className="text-[11px] h-5 px-1.5">{log.audit_action}</Badge>
                                {log.module && <span className="text-[11px] text-muted-foreground">{log.module}</span>}
                              </div>
                              <p className="text-xs leading-snug">{log.audit_message}</p>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{log.full_name || log.user_id}</span>
                                <span>{log.audit_date ? formatDate(log.audit_date) : "—"}</span>
                              </div>
                            </div>
                          ))}
                          {auditData.totalPages > 1 && (
                            <div className="flex items-center justify-between pt-1">
                              <Button variant="outline" size="sm" className="h-6 text-xs px-2" disabled={auditPage <= 1} onClick={() => setAuditPage(p => p - 1)} data-testid="button-modern-audit-prev">Prev</Button>
                              <span className="text-xs text-muted-foreground">{auditPage} / {auditData.totalPages}</span>
                              <Button variant="outline" size="sm" className="h-6 text-xs px-2" disabled={auditPage >= auditData.totalPages} onClick={() => setAuditPage(p => p + 1)} data-testid="button-modern-audit-next">Next</Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Review History Panel (buyer/owner only) ── */}
                  {rightPanel === 'approval' && isContractOwner && reviewHistory.length > 0 && (
                    <div className="space-y-2 pb-3 border-b mb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Review Actions</p>
                      {reviewHistory.map((r: any, index: number) => {
                        const isAccepted = r.status === "Accepted";
                        const isRejected = r.status === "Rejected";
                        const iconClass = isAccepted ? "text-emerald-500" : isRejected ? "text-red-500" : "text-amber-500";
                        return (
                          <div key={index} className="rounded-lg border p-2.5 bg-muted/20 space-y-1">
                            <div className="flex items-start gap-2">
                              <div className={`mt-0.5 shrink-0 ${iconClass}`}>
                                {isAccepted ? <CheckCircle2 className="h-4 w-4" /> : isRejected ? <XCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-xs font-medium truncate">{r.approver_name || r.email || "Reviewer"}</p>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isAccepted ? "bg-emerald-100 text-emerald-700" : isRejected ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                    {r.status}
                                  </span>
                                </div>
                                {r.approved_date && <p className="text-[10px] text-muted-foreground">{formatDate(r.approved_date)}</p>}
                                {r.comments && <p className="text-[10px] text-muted-foreground line-clamp-2">{r.comments}</p>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Approval History Panel ── */}
                  {rightPanel === 'approval' && (
                    <div className="space-y-3">
                      {(() => {
                        type ModernItem = {
                          name: string; status: string; date?: string;
                          comments?: string; roleName?: string; stepOrder: number;
                        };
                        const items: ModernItem[] = [];

                        // 1. All completed actions from DB (sorted by date then id)
                        [...approvalHistory]
                          .sort((a, b) => {
                            const da = a.approved_date ? new Date(a.approved_date).getTime() : 0;
                            const db_ = b.approved_date ? new Date(b.approved_date).getTime() : 0;
                            return da !== db_ ? da - db_ : (a.id || 0) - (b.id || 0);
                          })
                          .forEach((a, idx) => {
                            const approverTrimmed = (a.approver_name || "").trim();
                            const isRole = ROLE_NAMES.some(r => approverTrimmed.toUpperCase() === r);
                            const s = a.status;
                            const status =
                              (s === "Approve" || s === "Approved") ? "Approved" :
                              (s === "Reject"  || s === "Rejected") ? "Rejected" :
                              (s === "More"    || s === "more")     ? "More Info" :
                               s === "ReSubmit"                     ? "Re-Submitted" : "Approved";
                            items.push({
                              name: a.approver_name || a.email || "—",
                              status,
                              date: formatDate(a.approved_date) || undefined,
                              comments: a.comments || undefined,
                              roleName: isRole ? approverTrimmed : undefined,
                              stepOrder: idx + 1,
                            });
                          });

                        // 2. Pending approvers appended only when still Pending Approval
                        if (contract.status === "Pending Approval" && contract.approvers_list) {
                          (contract.approvers_list as string)
                            .split(",").map((a: string) => a.trim()).filter(Boolean)
                            .forEach((approver: string) => {
                              const approverTrimmed = approver.trim();
                              const isRole = ROLE_NAMES.some(r => approverTrimmed.toUpperCase() === r);
                              items.push({
                                name: formatApproverDisplayName(approver),
                                status: "Pending",
                                roleName: isRole ? approverTrimmed : undefined,
                                stepOrder: items.length + 1,
                              });
                            });
                        }

                        if (items.length === 0) {
                          return (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                              <CheckCircle2 className="h-10 w-10 text-muted-foreground/30 mb-2" />
                              <p className="text-sm text-muted-foreground">No approval history available</p>
                            </div>
                          );
                        }

                        return items.map((item, index) => {
                          const isApproved  = item.status === "Approved";
                          const isRejected  = item.status === "Rejected";
                          const isMoreInfo  = item.status === "More Info";
                          const isResubmit  = item.status === "Re-Submitted";
                          const isPending   = item.status === "Pending";
                          const dotColor = isApproved ? "bg-emerald-500" : isRejected ? "bg-red-500" :
                                           isMoreInfo ? "bg-amber-500"  : isResubmit ? "bg-blue-500" : "bg-orange-400";
                          const iconClass = isApproved ? "text-emerald-500" : isRejected ? "text-red-500" :
                                            isMoreInfo ? "text-amber-500"  : isResubmit ? "text-blue-500" : "text-muted-foreground";
                          return (
                            <div key={index} className="rounded-lg border p-2.5 bg-muted/20 space-y-1.5" data-testid={`modern-approval-row-${index}`}>
                              <div className="flex items-start gap-2">
                                <div className={`mt-0.5 shrink-0 ${iconClass}`}>
                                  {isPending   ? <Clock        className="h-4 w-4" /> :
                                   isApproved  ? <CheckCircle2 className="h-4 w-4" /> :
                                   isRejected  ? <XCircle      className="h-4 w-4" /> :
                                   <AlertCircle className="h-4 w-4" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{item.name}</p>
                                  {item.roleName && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {item.roleName.replace(/^ROLE_/, "").replace(/_/g, " ")}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                    <span className="text-[11px] text-muted-foreground">{item.status}</span>
                                  </div>
                                </div>
                                <span className="text-[10px] text-muted-foreground shrink-0">Step {item.stepOrder}</span>
                              </div>
                              {item.date && (
                                <p className="text-[10px] text-muted-foreground pl-6">{item.date}</p>
                              )}
                              {item.comments && (
                                <p className="text-[10px] text-muted-foreground pl-6 line-clamp-2" title={item.comments}>{item.comments}</p>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}

                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ═══ CLASSIC TAB VIEW ═══ */}
      {viewMode === 'classic' && (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex h-9 w-auto min-w-full items-center justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
            <TabsTrigger value="scope-of-work" className="gap-1 whitespace-nowrap" data-testid="tab-scope-of-work">
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Scope of Work</span>
            </TabsTrigger>
            <TabsTrigger value="clauses" className="gap-1 whitespace-nowrap" data-testid="tab-clauses">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Clauses</span>
            </TabsTrigger>
            {/* <TabsTrigger value="delivery-schedule" className="gap-1 whitespace-nowrap" data-testid="tab-delivery-schedule">
              <Truck className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Delivery Schedule</span>
            </TabsTrigger> */}
            <TabsTrigger value="audit-history" className="gap-1 whitespace-nowrap" data-testid="tab-audit-history">
              <ClipboardList className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Audit History</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="scope-of-work" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Scope of Work ({sowLines.length})
              </CardTitle>
              {canOwnerEdit && !contract.project_ref_no && (
                <Button size="sm" onClick={openAddSow} data-testid="button-add-sow-line">
                  <Plus className="h-4 w-4 mr-2" /> Add Line
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {sowLoading ? (
                <div className="space-y-2 pt-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : sowLines.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No lines added yet</p>
                  {canOwnerEdit && !contract.project_ref_no && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={openAddSow} data-testid="button-add-first-sow-line">
                      <Plus className="h-4 w-4 mr-2" /> Add First Line
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Item</TableHead>
                        <TableHead className="w-20 text-center">Qty</TableHead>
                        <TableHead className="w-20 text-center">UOM</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead className="min-w-[110px]">Start Date</TableHead>
                        <TableHead className="min-w-[110px]">Delivery Date</TableHead>
                        {canOwnerEdit && !contract.project_ref_no && (
                          <TableHead className="w-20"></TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sowLines.map((line: any) => (
                        <TableRow key={line.id} data-testid={`row-sow-${line.id}`}>
                          <TableCell className="font-medium max-w-[200px]">
                            <p className="truncate">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[200px] cursor-default">
                                    {line.description || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{line.description || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </p>
                            {line.specifications && <p className="text-xs text-muted-foreground truncate mt-0.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[200px] cursor-default">
                                    {line.specifications || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{line.specifications || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </p>}
                          </TableCell>
                          <TableCell className="text-center">{line.quantity || "—"}</TableCell>
                          <TableCell className="text-center">{line.uom || "—"}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {line.unit_cost != null ? formatCurrency(String(line.unit_cost), contract?.currency) : "—"}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {line.total_cost != null ? formatCurrency(String(line.total_cost), contract?.currency) : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{line.start_date ? formatDate(line.start_date) : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{line.deliverydate ? formatDate(line.deliverydate) : "—"}</TableCell>
                          {canOwnerEdit && !contract.project_ref_no && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSow(line)} data-testid={`button-edit-sow-${line.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteSowId(line.id)} data-testid={`button-delete-sow-${line.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
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
                    <p className="text-xs text-muted-foreground mt-0.5">Attach technical specification documents related to products and services in the Scope of Work.</p>
                  </div>
                  {canOwnerEdit && (
                    <Button size="sm" variant="outline" onClick={() => setShowAttachDialog(true)} data-testid="button-attach-document">
                      <Plus className="h-4 w-4 mr-2" />
                      Attach Document
                    </Button>
                  )}
                </div>
                {attachLoading ? (
                  <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading attachments...</div>
                ) : attachments.length === 0 ? (
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
                          <TableHead>Uploaded By</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          {canOwnerEdit && <TableHead className="w-10"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attachments.map((att: any) => (
                          <TableRow key={att.id} data-testid={`row-attachment-${att.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                {att.attach_path ? (
                                  <a
                                    href={`/api/contracts/${contractId}/attachments/${att.id}/download`}
                                    download
                                    className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                    data-testid={`link-download-attachment-${att.id}`}
                                  >
                                    {att.attach_name}
                                  </a>
                                ) : (
                                  <span className="font-medium text-sm">{att.attach_name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{att.created_by || "-"}</TableCell>
                            <TableCell className="text-sm">{att.created_date ? formatDate(att.created_date) : "-"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">Active</Badge>
                            </TableCell>
                            {canOwnerEdit && (
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteAttachId(att.id)} data-testid={`button-delete-attachment-${att.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="clauses" className="mt-4">
          <div
            className="border rounded-xl overflow-hidden flex bg-background"
            style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}
          >
            {/* ── Left: Clause list ── */}
            <div className="flex-1 flex flex-col min-w-0">

              {/* Toolbar */}
              <div className="flex items-center justify-between border-b px-4 py-2 bg-background gap-3 flex-shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  {localClauses.length} {localClauses.length === 1 ? "clause" : "clauses"}
                  {dirtyClauses.size > 0 && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">
                      {dirtyClauses.size} unsaved
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {canEditClauses && dirtyClauses.size > 0 && (
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1.5 px-2.5"
                      onClick={saveAllClauses}
                      disabled={savingClauses}
                      data-testid="button-save-clauses"
                    >
                      {savingClauses ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save Changes
                    </Button>
                  )}
                  {canOwnerEditClauses && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5 px-2.5"
                      onClick={addBlankClause}
                      disabled={addClauseMutation.isPending}
                      data-testid="button-add-clause"
                    >
                      {addClauseMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Add Clause
                    </Button>
                  )}
                </div>
              </div>

              {/* Clause list */}
              <div
                className={cn("flex-1 overflow-y-auto p-3 space-y-1.5 transition-colors", libDragOverLeft && "bg-primary/5")}
                onDragOver={(e) => { if (dragLibraryClause) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setLibDragOverLeft(true); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setLibDragOverLeft(false); }}
                onDrop={(e) => { e.preventDefault(); if (dragLibraryClause) { addFromLibrary(dragLibraryClause); setDragLibraryClause(null); setLibDragOverLeft(false); } }}
              >
                {clausesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : localClauses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm font-medium text-muted-foreground">No clauses added yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Add clauses manually or drag from the Clause Library →</p>
                  </div>
                ) : (
                  localClauses.map((clause, idx) => (
                    <div
                      key={clause.id}
                      draggable={canOwnerEdit}
                      onDragStart={() => { setDragClauseId(clause.id); setDragLibraryClause(null); }}
                      onDragOver={(e) => { if (dragClauseId) { e.preventDefault(); e.stopPropagation(); setDragOverClauseId(clause.id); } }}
                      onDragEnd={() => { setDragClauseId(null); setDragOverClauseId(null); }}
                      onDrop={(e) => { e.stopPropagation(); handleClauseDrop(clause.id); }}
                      className={cn(
                        "border rounded-lg transition-colors",
                        dragOverClauseId === clause.id && dragClauseId !== clause.id && "border-primary bg-primary/5",
                        dragClauseId === clause.id && "opacity-50"
                      )}
                      data-testid={`clause-item-${clause.id}`}
                    >
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
                        onClick={() => setExpandedClauseId(expandedClauseId === clause.id ? null : clause.id)}
                      >
                        {canOwnerEdit && (
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" onClick={e => e.stopPropagation()} />
                        )}
                        <span className={cn("text-sm font-medium flex-1 truncate", clause.status === 'Deleted' && "line-through text-muted-foreground")}>
                          Clause {idx + 1}{clause.terms_name ? `: ${clause.terms_name}` : ""}
                        </span>
                        {isInNegotiation && clause.status && ['Published', 'Accepted', 'Deleted'].includes(clause.status) && (
                          <Badge variant="outline" className={cn("text-xs shrink-0",
                            clause.status === 'Accepted' ? "border-emerald-300 bg-emerald-50 text-emerald-700" :
                            clause.status === 'Deleted' ? "border-red-300 bg-red-50 text-red-700" :
                            "border-sky-300 bg-sky-50 text-sky-700"
                          )}>{clause.status}</Badge>
                        )}
                        {clauseNeedsAttention(clause) && (
                          <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50 shrink-0 gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 inline-block" />
                            Needs Review
                          </Badge>
                        )}
                        {dirtyClauses.has(clause.id) && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50">Unsaved</Badge>
                            <button onClick={e => { e.stopPropagation(); discardClauseChanges(clause.id); }} title="Discard changes" className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" data-testid={`button-discard-clause-${clause.id}`}>
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {canOwnerEditClauses && clause.status !== 'Deleted' && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setDeleteClauseId(clause.id); }}
                            data-testid={`button-delete-clause-${clause.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isContractOwner && !isDraft && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setHistoryClauseId(clause.id); setHistoryClauseName(clause.terms_name || `Clause ${idx + 1}`); }}
                            className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="View clause history"
                            data-testid={`button-clause-history-${clause.id}`}
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {expandedClauseId === clause.id
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>
                      {expandedClauseId === clause.id && (
                        <div className="px-4 pb-4 border-t bg-muted/20">
                          <div className="mt-3 space-y-3">
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clause Title</Label>
                              <Input
                                className="mt-1"
                                value={clause.terms_name || ""}
                                onChange={e => updateLocalClause(clause.id, { terms_name: e.target.value })}
                                placeholder="Enter clause title"
                                disabled={!canEditClauses}
                                data-testid={`input-clause-title-${clause.id}`}
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clause Description</Label>
                              <div className="mt-1">
                                <TiptapClauseEditor
                                  key={`tiptap-classic-${clause.id}-${clauseResetCounters[clause.id] || 0}`}
                                  value={clause.term_details || ""}
                                  onChange={(val) => { if (canEditClauses) updateLocalClause(clause.id, { term_details: val }); }}
                                  placeholder="Click here to start editing..."
                                  height={180}
                                  trackChangesMode={isUnderReview && isCurrentUserReviewer}
                                  showChangesBar={canOwnerResolveChanges && hasTrackChanges(clause.term_details || "")}
                                  reviewerId={String(currentUserId)}
                                  reviewerName={currentUserName}
                                  readOnly={!canEditClauses}
                                  onAddComment={isCurrentUserReviewer ? (cid, sel, txt) => handleAddComment(clause.id, cid, sel, txt) : undefined}
                                  onAcceptAll={async (cleanHtml) => {
                                    updateLocalClause(clause.id, { term_details: cleanHtml });
                                    await saveClauseImmediate(clause.id, cleanHtml, clause.terms_name);
                                    if (isInNegotiation) await updateClauseStatus(clause.id, 'Accepted');
                                    toast({ title: "Changes accepted", description: "Clause saved with accepted content." });
                                  }}
                                  onRejectAll={async (cleanHtml) => {
                                    updateLocalClause(clause.id, { term_details: cleanHtml });
                                    await saveClauseImmediate(clause.id, cleanHtml, clause.terms_name);
                                    toast({ title: "Changes rejected", description: "Clause restored to original content." });
                                  }}
                                />
                                <ClauseCommentsPanel
                                  comments={commentsByClause[clause.id] || []}
                                  clauseId={clause.id}
                                  canResolve={canOwnerResolveChanges && hasOpenComments(clause.id)}
                                  onResolve={(commentId) => handleResolveComment(clause.id, commentId)}
                                />
                              </div>
                            </div>
                            {clause.mandatory === "Yes" && (
                              <Badge variant="secondary" className="text-xs">Mandatory</Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Right: nav + library panel ── */}
            <div className="w-64 flex-shrink-0 flex flex-col border-l bg-muted/20">

              {/* Tab toggle — Clause Library tab shown when owner can edit */}
              <div className="px-3 py-2 border-b bg-background">
                {canOwnerEditClauses ? (
                  <div className="flex rounded-md border overflow-hidden text-xs">
                    <button
                      type="button"
                      className={cn("flex-1 py-1.5 font-medium transition-colors", clauseLibTab === "added" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                      onClick={() => setClauseLibTab("added")}
                      data-testid="tab-added-clauses"
                    >
                      In This Contract ({localClauses.length})
                    </button>
                    <button
                      type="button"
                      className={cn("flex-1 py-1.5 font-medium transition-colors", clauseLibTab === "library" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                      onClick={() => setClauseLibTab("library")}
                      data-testid="tab-clause-library"
                    >
                      Clause Library
                    </button>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-center py-0.5">In This Contract ({localClauses.length})</p>
                )}
              </div>

              {(!canOwnerEditClauses || clauseLibTab === "added") ? (
                <div className="flex-1 overflow-y-auto">
                  {localClauses.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8 px-3">No clauses added yet</p>
                  ) : (
                    localClauses.map((clause, idx) => (
                      <button
                        key={clause.id}
                        type="button"
                        onClick={() => setExpandedClauseId(clause.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs flex items-center gap-1.5 transition-colors border-b",
                          expandedClauseId === clause.id ? "bg-primary/10 text-primary" : "hover:bg-accent"
                        )}
                        data-testid={`added-clause-nav-${clause.id}`}
                      >
                        <span className={cn("truncate font-medium flex-1", clause.status === 'Deleted' && "line-through text-muted-foreground")}>
                          Clause {idx + 1}{clause.terms_name ? `: ${clause.terms_name}` : ""}
                        </span>
                        <span className="flex items-center gap-1 shrink-0 ml-auto">
                          {isInNegotiation && clause.status && ['Published', 'Accepted', 'Deleted'].includes(clause.status) && (
                            <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded",
                              clause.status === 'Accepted' ? "bg-emerald-100 text-emerald-700" :
                              clause.status === 'Deleted' ? "bg-red-100 text-red-700" :
                              "bg-sky-100 text-sky-700"
                            )}>{clause.status}</span>
                          )}
                          {clauseNeedsAttention(clause) && (
                            <span
                              className="h-2 w-2 rounded-full bg-orange-500 ring-1 ring-orange-300"
                              title="Has unresolved reviewer changes or open comments"
                            />
                          )}
                          {dirtyClauses.has(clause.id) && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-3 py-2 border-b bg-background">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="pl-8 h-7 text-xs"
                        placeholder="Search library…"
                        value={clauseLibSearch}
                        onChange={e => setClauseLibSearch(e.target.value)}
                        data-testid="input-clause-search"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {clauseLibrary.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8 px-3">No clauses in library</p>
                    ) : clauseLibrary.map((lib: any) => (
                      <div
                        key={lib.section_id}
                        draggable={canOwnerEditClauses}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; setDragLibraryClause(lib); setDragClauseId(null); }}
                        onDragEnd={() => { setDragLibraryClause(null); setLibDragOverLeft(false); }}
                        onClick={() => canOwnerEditClauses && addFromLibrary(lib)}
                        className={cn(
                          "w-full px-2 py-2 text-xs text-left transition-colors select-none border-b last:border-b-0",
                          canOwnerEditClauses ? "hover:bg-primary/10 cursor-grab active:cursor-grabbing" : "cursor-pointer hover:bg-accent"
                        )}
                        data-testid={`library-clause-${lib.section_id}`}
                      >
                        <div className="flex items-start gap-1.5 mb-0.5">
                          <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/40 mt-0.5" />
                          <span className="font-medium leading-snug flex-1">{lib.section_name}</span>
                        </div>
                        {lib.description && (
                          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 pl-4">{lib.description}</p>
                        )}
                        <div className="flex items-center gap-1 mt-0.5 pl-4">
                          <Badge variant="secondary" className="text-[10px] h-4 px-1 font-normal">{lib.section_type || "Custom"}</Badge>
                          {lib.clause_mandatory === "Yes" && <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">Mandatory</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </TabsContent>
        {/* ── Delivery Schedule Tab ── */}
        <TabsContent value="delivery-schedule" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Delivery Schedule ({deliverySchedules.length})
              </CardTitle>
              {canOwnerEdit && (
                <Button size="sm" onClick={() => { setEditingDelivSched(null); setDelivSchedForm({ ...emptyDelivForm, schedule_type: lockedSchedType || 'fixed' }); setDelivSchedOpen(true); }} data-testid="button-add-delivery-sched">
                  <Plus className="h-4 w-4 mr-2" /> Add Milestone
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {delivSchedLoading ? (
                <div className="space-y-2 pt-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : deliverySchedules.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Deliverable</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="whitespace-nowrap">Schedule Date</TableHead>
                        <TableHead className="whitespace-nowrap">Tentative Date</TableHead>
                        <TableHead className="whitespace-nowrap">Duration (Days)</TableHead>
                        <TableHead>Milestone</TableHead>
                        {canOwnerEdit && <TableHead className="w-16" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliverySchedules.map((s: any, idx: number) => (
                        <TableRow key={s.id} data-testid={`row-delivery-sched-${s.id}`}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{s.deliverable_name || "—"}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[180px] truncate">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[200px] cursor-default">
                                  {s.details || "-"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{s.details || "-"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{s.schedule_type || "—"}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{s.schedule_date ? formatDate(s.schedule_date) : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{s.tentative_date ? formatDate(s.tentative_date) : "—"}</TableCell>
                          <TableCell>{s.elasped_days ?? "—"}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {s.schedule_type === 'milestone' && s.pcnt_milestone ? `${s.pcnt_milestone}%` :
                             s.amt_milestone ? `${contract?.currency || ''} ${Number(s.amt_milestone).toLocaleString()}` : "—"}
                          </TableCell>
                          {canOwnerEdit && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDelivSched(s); setDelivSchedForm({ deliverable_name: s.deliverable_name || '', details: s.details || '', schedule_type: s.schedule_type || 'fixed', schedule_date: s.schedule_date ? s.schedule_date.split('T')[0] : '', tentative_date: s.tentative_date ? s.tentative_date.split('T')[0] : '', elasped_days: s.elasped_days ?? '', amt_milestone: s.amt_milestone ?? '', pcnt_milestone: s.pcnt_milestone ?? '', schedule_frequency: s.schedule_frequency || '' }); setDelivSchedOpen(true); }} data-testid={`button-edit-delivery-sched-${s.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteDelivSchedMutation.mutate(s.id)} data-testid={`button-delete-delivery-sched-${s.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Truck className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No delivery milestones added yet</p>
                  {canOwnerEdit && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditingDelivSched(null); setDelivSchedForm({ ...emptyDelivForm, schedule_type: lockedSchedType || 'fixed' }); setDelivSchedOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" /> Add First Milestone
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Payment Terms (inside Delivery Schedule tab) ── */}
          <Card className="mt-4">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Terms ({paymentTerms.length})
              </CardTitle>
              {canOwnerEdit && deliverySchedules.length > 0 && (
                <Button size="sm" onClick={() => { setEditingPayTerm(null); setPayTermForm({ ...emptyPayTermForm }); setPayTermOpen(true); }} data-testid="button-add-payment-term">
                  <Plus className="h-4 w-4 mr-2" /> Add Payment Term
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {deliverySchedules.length === 0 ? (
                isDraft ? (
                  <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Add at least one delivery milestone above before setting up payment terms.</span>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No payment terms have been set up for this contract.</p>
                  </div>
                )
              ) : payTermLoading ? (
                <div className="space-y-2 pt-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : paymentTerms.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Payment Term Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Payment Upon</TableHead>
                        {!['amount', 'frequency'].includes(lockedSchedType || '') && <TableHead>% of Contract</TableHead>}
                        <TableHead>Amount ({contract?.currency || ''})</TableHead>
                        {canOwnerEdit && <TableHead className="w-16" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentTerms.map((t: any, idx: number) => (
                        <TableRow key={t.id} data-testid={`row-payment-term-${t.id}`}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{t.name || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {PAYMENT_TYPES.find(p => p.value === t.payment_type)?.label ?? t.payment_type ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{t.period || "—"}</TableCell>
                          {!['amount', 'frequency'].includes(lockedSchedType || '') && <TableCell>{t.pcnt_milestone != null ? `${t.pcnt_milestone}%` : "—"}</TableCell>}
                          <TableCell className="font-medium">{t.amt_milestone != null ? Number(t.amt_milestone).toLocaleString() : "—"}</TableCell>
                          {canOwnerEdit && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingPayTerm(t); setPayTermForm({ name: t.name || '', payment_type: t.payment_type || 'advance', period: t.period || '', amt_milestone: t.amt_milestone ?? '', pcnt_milestone: t.pcnt_milestone ?? '' }); setPayTermOpen(true); }} data-testid={`button-edit-payment-term-${t.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deletePayTermMutation.mutate(t.id)} data-testid={`button-delete-payment-term-${t.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No payment terms added yet</p>
                  {canOwnerEdit && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditingPayTerm(null); setPayTermForm({ ...emptyPayTermForm }); setPayTermOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" /> Add First Payment Term
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="audit-history" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Audit History</CardTitle>
              {auditData?.total > 0 && <Badge variant="secondary" className="text-xs">{auditData.total}</Badge>}
              <p className="text-xs text-muted-foreground ml-1">All audit activity for this contract</p>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {!auditData ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : !auditData.records?.length ? (
                <div className="text-center py-10 text-muted-foreground" data-testid="text-no-audit">
                  <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No audit records found.</p>
                </div>
              ) : (
                <>
                  <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Module</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditData.records.map((log: any, idx: number) => (
                        <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                          <TableCell className="text-muted-foreground text-sm">{(auditPage - 1) * 10 + idx + 1}</TableCell>
                          <TableCell className="text-sm max-w-[280px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[280px] cursor-default">
                                  {log.audit_message || "-"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{log.audit_message || "-"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[120px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[120px] cursor-default">
                                  {log.module || "-"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{log.module || "-"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-sm">{log.full_name || log.user_id || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{log.audit_date ? formatDateTime(log.audit_date) : "—"}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{log.audit_action}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {auditData.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                      <span>Showing {(auditPage - 1) * 10 + 1}–{Math.min(auditPage * 10, auditData.total)} of {auditData.total} records</span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={auditPage <= 1} onClick={() => setAuditPage(p => p - 1)} data-testid="button-audit-prev">Previous</Button>
                        <span>Page {auditPage} of {auditData.totalPages}</span>
                        <Button variant="outline" size="sm" disabled={auditPage >= auditData.totalPages} onClick={() => setAuditPage(p => p + 1)} data-testid="button-audit-next">Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      )}

      {/* Add / Edit Delivery Schedule — Side Sheet (works in both Classic and Modern view) */}
      <FormSheet
        open={delivSchedOpen}
        onOpenChange={(o) => { setDelivSchedOpen(o); if (!o) setEditingDelivSched(null); }}
        title={editingDelivSched ? "Edit Delivery Schedule" : "Add Delivery Schedule"}
        onSubmit={() => saveDelivSchedMutation.mutate({ ...delivSchedForm, elasped_days: delivSchedForm.elasped_days ? Number(delivSchedForm.elasped_days) : null, amt_milestone: delivSchedForm.amt_milestone ? Number(delivSchedForm.amt_milestone) : null, pcnt_milestone: delivSchedForm.pcnt_milestone ? Number(delivSchedForm.pcnt_milestone) : null })}
        submitLabel={editingDelivSched ? "Save Changes" : "Add Schedule"}
        isSubmitting={saveDelivSchedMutation.isPending}
        submitDisabled={!delivSchedForm.deliverable_name.trim()}
        widthClassName="sm:max-w-[65vw]"
      >
          <p className="text-xs text-muted-foreground mb-4"><span className="text-destructive">*</span> Indicates mandatory fields</p>
          <div className="flex gap-0 min-h-0">
            <div className="w-[210px] shrink-0 pr-5 border-r border-border space-y-3">
              <div>
                <p className="text-sm font-medium mb-0.5">Schedule Type <span className="text-destructive">*</span></p>
                <p className="text-xs text-muted-foreground">Applies to all milestones in this contract</p>
              </div>
              {lockedSchedType ? (
                <div className="space-y-2">
                  <div className="flex flex-col gap-2">
                    {SCHED_TYPES.map(opt => (
                      <div key={opt.value} className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${opt.value === lockedSchedType ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground/35'}`}>
                        {opt.value === lockedSchedType ? <Check className="h-3.5 w-3.5 shrink-0" /> : <div className="h-3.5 w-3.5 shrink-0" />}
                        {opt.label}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Locked to <strong>{lockedSchedLabel}</strong>
                  </p>
                </div>
              ) : (
                <>
                  <RadioGroup value={delivSchedForm.schedule_type} onValueChange={v => setDelivSchedForm(f => ({ ...f, schedule_type: v }))} className="flex flex-col gap-2" data-testid="radio-schedule-type">
                    {SCHED_TYPES.map(opt => (
                      <label key={opt.value} className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors text-sm ${delivSchedForm.schedule_type === opt.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40'}`} data-testid={`radio-stype-${opt.value}`}>
                        <RadioGroupItem value={opt.value} id={`stype-${opt.value}`} className="shrink-0" />
                        {opt.label}
                      </label>
                    ))}
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1 border-t border-border mt-1">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                    <span>For goods, <strong>Fixed</strong> or <strong>Amount Based</strong> is typical. For services, <strong>Milestone</strong> or <strong>Frequency</strong> is common.</span>
                  </p>
                </>
              )}
            </div>
            <div className="flex-1 pl-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Delivery Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Phase 1 Delivery" value={delivSchedForm.deliverable_name} onChange={e => setDelivSchedForm(f => ({ ...f, deliverable_name: e.target.value }))} data-testid="input-deliverable-name" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Deliverable Details</Label>
                  <Textarea className="resize-none" rows={3} placeholder="Describe what will be delivered..." value={delivSchedForm.details} onChange={e => setDelivSchedForm(f => ({ ...f, details: e.target.value }))} data-testid="input-deliverable-details" />
                </div>
                {['fixed', 'frequency', 'flexible'].includes(delivSchedForm.schedule_type) && (
                  <div className="space-y-2">
                    <Label>Schedule Date</Label>
                    <Input type="date" value={delivSchedForm.schedule_date} onChange={e => setDelivSchedForm(f => ({ ...f, schedule_date: e.target.value }))} data-testid="input-schedule-date" />
                  </div>
                )}
                {delivSchedForm.schedule_type === 'frequency' && (
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select value={delivSchedForm.schedule_frequency} onValueChange={v => setDelivSchedForm(f => ({ ...f, schedule_frequency: v }))}>
                      <SelectTrigger data-testid="select-frequency"><SelectValue placeholder="Select frequency..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Weekly">Weekly</SelectItem>
                        <SelectItem value="Twice Weekly">Twice Weekly</SelectItem>
                        <SelectItem value="Biweekly">Biweekly</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                        <SelectItem value="Bimonthly (Every 2 Months)">Bimonthly (Every 2 Months)</SelectItem>
                        <SelectItem value="Quarterly">Quarterly</SelectItem>
                        <SelectItem value="Half-Yearly">Half-Yearly</SelectItem>
                        <SelectItem value="Annually">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Duration (Working Days)</Label>
                  <Input type="number" placeholder="0" value={delivSchedForm.elasped_days} onChange={e => setDelivSchedForm(f => ({ ...f, elasped_days: e.target.value }))} data-testid="input-elapsed-days" />
                </div>
                {delivSchedForm.schedule_type === 'milestone' && (
                  <div className="space-y-2">
                    <Label>% of Milestone</Label>
                    <Input type="number" placeholder="0" min="0" max="100" value={delivSchedForm.pcnt_milestone} onChange={e => setDelivSchedForm(f => ({ ...f, pcnt_milestone: e.target.value }))} data-testid="input-pcnt-milestone" />
                  </div>
                )}
                {['milestone', 'amount'].includes(delivSchedForm.schedule_type) && (
                  <div className="space-y-2">
                    <Label>Amount{contract?.currency ? ` (${contract.currency})` : ''}</Label>
                    <Input type="number" placeholder="0.00" value={delivSchedForm.amt_milestone} onChange={e => setDelivSchedForm(f => ({ ...f, amt_milestone: e.target.value }))} data-testid="input-amt-milestone" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Tentative Delivery Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={delivSchedForm.tentative_date} onChange={e => setDelivSchedForm(f => ({ ...f, tentative_date: e.target.value }))} data-testid="input-tentative-date" />
                </div>
              </div>
            </div>
          </div>
      </FormSheet>

      {/* Add / Edit Payment Term — Side Sheet (works in both Classic and Modern view) */}
      <FormSheet
        open={payTermOpen}
        onOpenChange={(o) => { setPayTermOpen(o); if (!o) setEditingPayTerm(null); }}
        title={editingPayTerm ? "Edit Payment Term" : "Add Payment Term"}
        onSubmit={() => savePayTermMutation.mutate({ ...payTermForm, amt_milestone: payTermForm.amt_milestone ? Number(payTermForm.amt_milestone) : null, pcnt_milestone: payTermForm.pcnt_milestone ? Number(payTermForm.pcnt_milestone) : null })}
        submitLabel={editingPayTerm ? "Save Changes" : "Add Payment Term"}
        isSubmitting={savePayTermMutation.isPending}
        submitDisabled={!payTermForm.name.trim()}
        widthClassName="sm:max-w-[65vw]"
      >
          <p className="text-xs text-muted-foreground mb-4"><span className="text-destructive">*</span> Indicates mandatory fields</p>
          <div className="flex gap-0 min-h-0">
            <div className="w-[210px] shrink-0 pr-5 border-r border-border space-y-3">
              <div>
                <p className="text-sm font-medium mb-0.5">Payment Type <span className="text-destructive">*</span></p>
                <p className="text-xs text-muted-foreground">Select the type of payment</p>
              </div>
              <RadioGroup value={payTermForm.payment_type} onValueChange={v => setPayTermForm(f => ({ ...f, payment_type: v }))} className="flex flex-col gap-2" data-testid="radio-payment-type">
                {PAYMENT_TYPES.map(opt => (
                  <label key={opt.value} className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors text-sm ${payTermForm.payment_type === opt.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40'}`} data-testid={`radio-ptype-${opt.value}`}>
                    <RadioGroupItem value={opt.value} id={`ptype-${opt.value}`} className="shrink-0" />
                    {opt.label}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="flex-1 pl-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Payment Term Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. 30% Advance on Contract Signing" value={payTermForm.name} onChange={e => setPayTermForm(f => ({ ...f, name: e.target.value }))} data-testid="input-payment-term-name" />
                </div>
                <div className="col-span-2 space-y-2">
                  <div>
                    <Label>Payment Upon</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Describe criteria for payment release</p>
                  </div>
                  <Input placeholder="e.g. Upon completion of Phase 1 and Phase 2 deliveries" value={payTermForm.period} onChange={e => setPayTermForm(f => ({ ...f, period: e.target.value }))} data-testid="input-payment-period" />
                </div>
                {!['amount', 'frequency'].includes(lockedSchedType || '') && (
                  <div className="space-y-2">
                    <Label>% of Contract Value</Label>
                    <Input type="number" placeholder="0" min="0" max="100" value={payTermForm.pcnt_milestone} onChange={e => setPayTermForm(f => ({ ...f, pcnt_milestone: e.target.value }))} data-testid="input-pay-pcnt" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Amount{contract?.currency ? ` (${contract.currency})` : ''}</Label>
                  <Input type="number" placeholder="0.00" value={payTermForm.amt_milestone} onChange={e => setPayTermForm(f => ({ ...f, amt_milestone: e.target.value }))} data-testid="input-pay-amount" />
                </div>
              </div>
            </div>
          </div>
      </FormSheet>

      <CreatePOFromContractSheet
        contractId={contractId!}
        refNo={refNo}
        open={createPODialogOpen}
        onOpenChange={setCreatePODialogOpen}
        onCreated={setCreatedPoNumber}
      />

      {/* Add / Edit SOW Line Sheet */}
      <FormSheet
        open={sowSheetOpen}
        onOpenChange={(o) => { setSowSheetOpen(o); if (!o) { setEditingSow(null); setSowForm(blankSowForm); setItemEntryMode("master"); } }}
        title={editingSow ? "Edit Line Item" : "Add Line Item"}
        description={editingSow ? "Update the scope of work line details." : "Add a new scope of work line to this contract."}
        onSubmit={submitSowForm}
        submitLabel={editingSow ? "Save Changes" : "Add Line"}
        isSubmitting={createSowMutation.isPending || updateSowMutation.isPending}
        submitDisabled={!sowForm.description.trim() || createSowMutation.isPending || updateSowMutation.isPending}
        widthClassName="sm:max-w-[600px]"
      >
          <p className="text-xs text-muted-foreground mb-4"><span className="text-destructive">*</span> Indicates mandatory fields</p>
          <div className="space-y-6">
            {/* Item Entry Mode Toggle */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Item Details</h4>
              {/* <div className="flex gap-2">
                <Button type="button" size="sm" variant={itemEntryMode === "master" ? "default" : "outline"} onClick={() => { setItemEntryMode("master"); setSowForm(f => ({ ...f, description: "", categoryCode: "", categoryName: "", uom: "", itemId: "", itemName: "" })); }} data-testid="button-item-master-mode">
                  Item Master
                </Button>
                <Button type="button" size="sm" variant={itemEntryMode === "freetext" ? "default" : "outline"} onClick={() => { setItemEntryMode("freetext"); setSowForm(f => ({ ...f, itemId: "", itemName: "" })); }} data-testid="button-freetext-mode">
                  Free Text
                </Button>
              </div> */}

              <div className="grid grid-cols-2 gap-4">
                {itemEntryMode === "master" ? (
                  <div className="col-span-2 space-y-1.5">
                    <Label>Item</Label>
                    <Popover open={itemOpen} onOpenChange={setItemOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={itemOpen} className="w-full justify-between font-normal" data-testid="select-sow-item">
                          {sowForm.itemId ? sowForm.itemName : "Select Item..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search item..." />
                          <CommandList>
                            <CommandEmpty>No item found.</CommandEmpty>
                            <CommandGroup>
                              {sowItems.map((item) => (
                                <CommandItem key={item.id} value={item.name} onSelect={() => {
                                  setSowForm(f => ({
                                    ...f,
                                    itemId: item.id,
                                    itemName: item.name,
                                    description: item.name,
                                    categoryCode: item.categoryCode || "",
                                    categoryName: item.categoryName || "",
                                    unit_cost: item.standardPrice ? String(item.standardPrice) : f.unit_cost,
                                  }));
                                  setItemOpen(false);
                                }}>
                                  <Check className={cn("mr-2 h-4 w-4", sowForm.itemId === item.id ? "opacity-100" : "opacity-0")} />
                                  {item.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {sowForm.itemId && <p className="text-xs text-muted-foreground">Category: {sowItems.find(i => i.id === sowForm.itemId)?.categoryName || "N/A"}</p>}
                  </div>
                ) : (
                  <>
                    <div className="col-span-2 space-y-1.5">
                      <Label>Category</Label>
                      <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" aria-expanded={categoryOpen} className="w-full justify-between font-normal" data-testid="select-sow-category">
                            {sowForm.categoryCode ? categories.find(c => c.code === sowForm.categoryCode)?.name : "Select Category..."}
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
                                  <CommandItem key={cat.id} value={cat.name} onSelect={() => { setSowForm(f => ({ ...f, categoryCode: cat.code, categoryName: cat.name })); setCategoryOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", sowForm.categoryCode === cat.code ? "opacity-100" : "opacity-0")} />
                                    {cat.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="sow-description">Description <span className="text-destructive">*</span></Label>
                      <Input id="sow-description" placeholder="Item description" value={sowForm.description} onChange={e => setSowForm(f => ({ ...f, description: e.target.value }))} data-testid="input-sow-description" />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label>Line Type</Label>
                  <Select value={sowForm.linetype} onValueChange={v => setSowForm(f => ({ ...f, linetype: v }))}>
                    <SelectTrigger data-testid="select-sow-linetype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Goods">Goods</SelectItem>
                      <SelectItem value="Service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sow-quantity">Quantity <span className="text-destructive">*</span></Label>
                  <Input id="sow-quantity" type="number" min="0" placeholder="0" value={sowForm.quantity} onChange={e => setSowForm(f => ({ ...f, quantity: e.target.value }))} data-testid="input-sow-quantity" />
                </div>

                <div className="space-y-1.5">
                  <Label>Unit of Measure <span className="text-destructive">*</span></Label>
                  <Select value={sowForm.uom} onValueChange={v => setSowForm(f => ({ ...f, uom: v }))}>
                    <SelectTrigger data-testid="select-sow-uom"><SelectValue placeholder="Select UoM" /></SelectTrigger>
                    <SelectContent>
                      {uomOptions.length > 0 ? uomOptions.map(u => (
                        <SelectItem key={u.id} value={u.description || ""}>{u.description}</SelectItem>
                      )) : (
                        <>
                          <SelectItem value="EA">Each</SelectItem>
                          <SelectItem value="KG">Kilogram</SelectItem>
                          <SelectItem value="LTR">Litre</SelectItem>
                          <SelectItem value="MTR">Metre</SelectItem>
                          <SelectItem value="PCS">Pieces</SelectItem>
                          <SelectItem value="SET">Set</SelectItem>
                          <SelectItem value="BOX">Box</SelectItem>
                          <SelectItem value="TON">Ton</SelectItem>
                          <SelectItem value="HRS">Hours</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sow-unit-cost">Unit Cost <span className="text-destructive">*</span> ({contract?.currency || ""})</Label>
                  <Input id="sow-unit-cost" type="number" min="0" step="0.01" placeholder="0.00" value={sowForm.unit_cost} onChange={e => setSowForm(f => ({ ...f, unit_cost: e.target.value }))} data-testid="input-sow-unit-cost" />
                  {sowForm.quantity && sowForm.unit_cost && (
                    <p className="text-xs text-muted-foreground">Total: {formatCurrency(String((parseFloat(sowForm.quantity) || 0) * (parseFloat(sowForm.unit_cost) || 0)), contract?.currency)}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sow-start-date">Start Date</Label>
                  <Input id="sow-start-date" type="date" value={sowForm.start_date} onChange={e => setSowForm(f => ({ ...f, start_date: e.target.value }))} data-testid="input-sow-start-date" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sow-delivery-date">Delivery Date</Label>
                  <Input id="sow-delivery-date" type="date" value={sowForm.deliverydate} onChange={e => setSowForm(f => ({ ...f, deliverydate: e.target.value }))} data-testid="input-sow-delivery-date" />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="sow-specifications">Specifications</Label>
                  <Textarea id="sow-specifications" placeholder="Additional specifications or notes..." rows={3} value={sowForm.specifications} onChange={e => setSowForm(f => ({ ...f, specifications: e.target.value }))} data-testid="input-sow-specifications" />
                </div>
              </div>
            </div>
          </div>
      </FormSheet>

      {/* Delete Clause Confirmation — lives at root so it works in both Classic and Modern view */}
      <AlertDialog open={deleteClauseId !== null} onOpenChange={(o) => { if (!o) setDeleteClauseId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Clause</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this clause? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteClauseId !== null && deleteClauseMutation.mutate(deleteClauseId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SOW Delete Confirmation */}
      <AlertDialog open={deleteSowId !== null} onOpenChange={(o) => { if (!o) setDeleteSowId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Line</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this scope of work line? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteSowId !== null && deleteSowMutation.mutate(deleteSowId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Attach Document Sheet */}
      <FormSheet
        open={showAttachDialog}
        onOpenChange={(open) => {
          setShowAttachDialog(open);
          if (!open) { setAttachForm({ attach_desc: "", attach_name: "", attach_type: "application/pdf" }); setSelectedFile(null); }
        }}
        title="Attach Document"
        onSubmit={() => {
          if (!attachForm.attach_desc.trim()) { toast({ title: "Required", description: "Description is required.", variant: "destructive" }); return; }
          if (!attachForm.attach_name) { toast({ title: "Required", description: "Please select a file.", variant: "destructive" }); return; }
          addAttachMutation.mutate(attachForm);
        }}
        submitLabel="Attach"
        isSubmitting={addAttachMutation.isPending}
        widthClassName="sm:max-w-[600px]"
      >
          <p className="text-xs text-muted-foreground mb-4"><span className="text-destructive">*</span> Indicates mandatory fields</p>
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="attach-desc">Description <span className="text-destructive">*</span></Label>
                <Input id="attach-desc" value={attachForm.attach_desc}
                  onChange={e => setAttachForm(f => ({ ...f, attach_desc: e.target.value }))}
                  placeholder="Enter description" data-testid="input-attach-desc" />
              </div>
              <div>
                <Label htmlFor="attach-file">Attach File <span className="text-destructive">*</span></Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input id="attach-file" value={attachForm.attach_name} readOnly placeholder="No file chosen" className="flex-1" data-testid="input-attach-name" />
                  <input
                    type="file"
                    className="hidden"
                    data-testid="file-input-attach"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          toast({ title: "File Too Large", description: "Maximum allowed size is 5MB.", variant: "destructive" });
                          e.target.value = "";
                          return;
                        }
                        setSelectedFile(file);
                        setAttachForm(f => ({ ...f, attach_name: file.name, attach_type: file.type || "application/octet-stream" }));
                      }
                    }}
                  />
                  <Button variant="default" onClick={() => {
                    const fi = document.querySelector('[data-testid="file-input-attach"]') as HTMLInputElement;
                    fi?.click();
                  }} data-testid="button-select-file">Select</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Maximum allowed size is 5MB</p>
              </div>
            </div>
          </div>
      </FormSheet>

      {/* Delete Attachment Confirmation */}
      <AlertDialog open={deleteAttachId !== null} onOpenChange={(o) => { if (!o) setDeleteAttachId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Attachment</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this attachment? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteAttachId !== null && deleteAttachMutation.mutate(deleteAttachId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Vendor Selection Slider */}
      <Sheet open={vendorDialogOpen} onOpenChange={(o) => { setVendorDialogOpen(o); if (!o) setVendorSearch(""); }}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Select Supplier</SheetTitle>
            <SheetDescription>Choose an active supplier for this contract.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name..." className="pl-9" value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} data-testid="input-vendor-search" />
            </div>
            <div className="space-y-1">
              {vendorSearch.trim().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Search for a supplier</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Type a supplier name to see results</p>
                </div>
              ) : suppliersLoading ? (
                <div className="space-y-2 pt-2">
                  {[1,2,3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                </div>
              ) : supplierOptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Store className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No suppliers found for &ldquo;{vendorSearch}&rdquo;</p>
                </div>
              ) : (
                supplierOptions.map((s) => (
                  <button
                    key={s.id}
                    className="w-full text-left px-4 py-3 rounded-lg border hover:bg-accent hover:border-primary/30 transition-colors"
                    onClick={() => saveVendorMutation.mutate(s)}
                    disabled={saveVendorMutation.isPending}
                    data-testid={`option-vendor-${s.id}`}
                  >
                    <p className="text-sm font-medium">{s.companyName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.emailId ? s.emailId : s.phone ? s.phone : `ID: ${s.id}`}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Reviewer Slider */}
      <FormSheet
        open={reviewerDialogOpen}
        onOpenChange={(o) => { setReviewerDialogOpen(o); if (!o) { setReviewerSearch(""); setSelectedUserIds(new Set()); setReviewerPage(1); } }}
        title="Add Review Members"
        description="Select one or more users to add to the review team."
        onSubmit={handleAddSelected}
        submitLabel={`Add Selected ${selectedUserIds.size > 0 ? `(${selectedUserIds.size})` : ""}`}
        submitDisabled={selectedUserIds.size === 0}
        widthClassName="sm:max-w-[640px]"
      >
          <div className="space-y-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, email or department..." className="pl-9 h-9 text-sm" value={reviewerSearch} onChange={(e) => { setReviewerSearch(e.target.value); setReviewerPage(1); }} data-testid="input-reviewer-search" />
            </div>

            {/* Table */}
            {(() => {
              if (usersLoading) return (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              );
              const filtered = userOptions.filter((u) => !reviewers.some((r) => r.user_id === u.id));
              if (filtered.length === 0) return (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-muted-foreground">No users found</p>
                </div>
              );
              return (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8 py-2 px-2 text-left"></th>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground text-xs">Name</th>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground text-xs">Email</th>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground text-xs">Contact No.</th>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground text-xs">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => {
                      const checked = selectedUserIds.has(u.id);
                      return (
                        <tr
                          key={u.id}
                          className={`border-b last:border-0 cursor-pointer transition-colors hover:bg-accent/50 ${checked ? "bg-primary/5" : ""}`}
                          onClick={() => {
                            const next = new Set(selectedUserIds);
                            checked ? next.delete(u.id) : next.add(u.id);
                            setSelectedUserIds(next);
                          }}
                          data-testid={`row-user-${u.id}`}
                        >
                          <td className="py-2.5 px-2">
                            <input type="checkbox" checked={checked} readOnly className="h-4 w-4 cursor-pointer accent-primary" />
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 shrink-0">
                                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                  {u.name?.charAt(0)?.toUpperCase() || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium truncate max-w-[100px]">{u.name || "—"}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-muted-foreground truncate max-w-[120px]">{u.email_id || "—"}</td>
                          <td className="py-2.5 px-2 text-muted-foreground">{u.mobile_no || "—"}</td>
                          <td className="py-2.5 px-2 text-muted-foreground truncate max-w-[100px]">{u.department_name || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}

            {/* Pagination */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {usersPagination.total > 0
                  ? `${(usersPagination.page - 1) * usersPagination.limit + 1}–${Math.min(usersPagination.page * usersPagination.limit, usersPagination.total)} of ${usersPagination.total}`
                  : "0 users"}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={reviewerPage <= 1 || usersLoading} onClick={() => setReviewerPage(p => p - 1)} data-testid="button-reviewer-prev">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-muted-foreground text-sm px-1">{usersPagination.page} / {usersPagination.totalPages || 1}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={reviewerPage >= usersPagination.totalPages || usersLoading} onClick={() => setReviewerPage(p => p + 1)} data-testid="button-reviewer-next">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
      </FormSheet>

      {/* Preview Document Slider */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="flex flex-col p-0 gap-0" style={{ width: "65vw", maxWidth: "900px" }}>
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Preview Document</SheetTitle>
            <SheetDescription>Scroll to review the full contract document.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            {previewOpen && (
              <iframe
                key={previewRefreshKey}
                src={previewUrl}
                className="w-full h-full border-0"
                title="Contract Preview"
                data-testid="iframe-contract-preview"
              />
            )}
          </div>
          <div className="px-6 py-4 border-t shrink-0 flex justify-end">
            <Button
              onClick={handleDownload}
              data-testid="button-download-document"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Document
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ClauseHistorySheet
        clauseId={historyClauseId}
        clauseName={historyClauseName}
        open={historyClauseId !== null}
        onClose={() => setHistoryClauseId(null)}
        hasUnsaved={historyClauseId !== null && dirtyClauses.has(historyClauseId)}
      />

      <ContractFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        contract={contract}
        contractId={contract?.id}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{contract.title}</strong>? The contract status will be changed to <strong>Deleted</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish to vendors confirmation */}
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish to Suppliers</AlertDialogTitle>
            <AlertDialogDescription>
              Publish <strong>{contract.title}</strong> to suppliers? The status will be updated to <strong>Under Negotiation</strong>. All review team members must have accepted before publishing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { publishMutation.mutate(); setPublishOpen(false); }}
              data-testid="button-confirm-publish"
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Owner: Submit For Approval confirmation */}
      <AlertDialog open={submitForApprovalOpen} onOpenChange={setSubmitForApprovalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit For Approval</AlertDialogTitle>
            <AlertDialogDescription>
              Submit <strong>{contract.title}</strong> for approval? The status will change to <strong>Pending Approval</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { submitForApprovalMutation.mutate(); setSubmitForApprovalOpen(false); }}
              data-testid="button-confirm-submit-for-approval"
            >
              Submit For Approval
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Owner: Submit Negotiation confirmation */}
      <AlertDialog open={ownerSubmitNegOpen} onOpenChange={setOwnerSubmitNegOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Negotiation</AlertDialogTitle>
            <AlertDialogDescription>
              Submit the negotiation response for <strong>{contract.title}</strong>? It will go to the review team for approval (status <strong>Negotiation Under Review</strong>) before it returns to the supplier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { ownerSubmitNegMutation.mutate(); setOwnerSubmitNegOpen(false); }}
              data-testid="button-confirm-owner-submit-negotiation"
            >
              Submit Negotiation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit for review confirmation */}
      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit for Review</AlertDialogTitle>
            <AlertDialogDescription>
              Submit <strong>{contract.title}</strong> for review? The status will be updated to <strong>Under Review</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { submitMutation.mutate(); setSubmitOpen(false); }}
              data-testid="button-confirm-submit"
            >
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Re-Submit confirmation */}
      <AlertDialog open={resubmitOpen} onOpenChange={setResubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              Re-Submit Contract
            </AlertDialogTitle>
            <AlertDialogDescription>
              Re-submit <strong>{contract.title}</strong>?{" "}
              {contract.appr_status === "More Info Required"
                ? "The contract will be re-submitted for approval and status will update to Pending Approval."
                : "The contract will be re-submitted for review and status will update to Under Review."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resubmitMutation.mutate()}
              disabled={resubmitMutation.isPending}
              data-testid="button-confirm-resubmit"
            >
              {resubmitMutation.isPending ? "Re-Submitting…" : "Re-Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Review confirmation */}
      <AlertDialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Accept Review
            </AlertDialogTitle>
            <AlertDialogDescription>
              Accept the review for <strong>{contract.title}</strong>? Your acceptance will be recorded. If all reviewers have accepted, the status will advance to <strong>Review Completed</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => { acceptReviewMutation.mutate(); setAcceptOpen(false); }}
              data-testid="button-confirm-accept-review"
            >
              {acceptReviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept Review"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Negotiation Review confirmation */}
      <AlertDialog open={negoAcceptOpen} onOpenChange={setNegoAcceptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Accept Negotiation Review
            </AlertDialogTitle>
            <AlertDialogDescription>
              Accept the owner's negotiation response for <strong>{contract.title}</strong>? Your acceptance will be recorded. If all reviewers have accepted, the status will advance to <strong>Under Negotiation</strong> and the supplier will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => negotiationAcceptReviewMutation.mutate()}
              data-testid="button-confirm-accept-negotiation-review"
            >
              {negotiationAcceptReviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept Review"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* More Info Required confirmation */}
      <AlertDialog open={moreInfoOpen} onOpenChange={(open) => { setMoreInfoOpen(open); if (!open) setMoreInfoComments(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Request More Information
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the review as requiring more information from the contract owner and set the status to <strong>More Info Required</strong>. All reviewer acceptances will be reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <label className="text-sm font-medium text-foreground mb-1.5 block">Comments (optional)</label>
            <Textarea
              placeholder="Describe what additional information is needed…"
              rows={3}
              value={moreInfoComments}
              onChange={e => setMoreInfoComments(e.target.value)}
              className="resize-none"
              data-testid="input-more-info-comments"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { moreInfoMutation.mutate(); setMoreInfoOpen(false); }}
              data-testid="button-confirm-more-info"
            >
              {moreInfoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request More Info"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate Contract Confirmation */}
      <AlertDialog open={activateOpen} onOpenChange={setActivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Activate <strong>{contract?.title}</strong>? The contract status will change from <strong>Signed</strong> to <strong>Active</strong>. This makes the contract officially live.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-activate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              data-testid="button-confirm-activate"
            >
              {activateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Terminate Contract Confirmation */}
      <AlertDialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to terminate <strong>{contract?.title}</strong>? The contract status will change from <strong>Active</strong> to <strong>Terminated</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-terminate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => terminateMutation.mutate()}
              disabled={terminateMutation.isPending}
              data-testid="button-confirm-terminate"
            >
              {terminateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Terminate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contract Signing Panel */}
      <Dialog open={signingPanelOpen} onOpenChange={setSigningPanelOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-blue-600" />
              Sign Contract — {signingParty === "first" ? "First Party" : "Second Party"}
            </DialogTitle>
            <DialogDescription>
              Signing as <strong>{signingPartyName}</strong>. Choose how you would like to sign below.
            </DialogDescription>
          </DialogHeader>

          {/* Mode tabs */}
          <div className="flex gap-2 border-b pb-2 mb-4">
            <button
              onClick={() => setSignMode("draw")}
              className={`px-4 py-2 text-sm font-medium rounded-t ${signMode === "draw" ? "border-b-2 border-blue-600 text-blue-600" : "text-muted-foreground"}`}
              data-testid="tab-sign-draw"
            >
              Draw Signature
            </button>
            <button
              onClick={() => setSignMode("type")}
              className={`px-4 py-2 text-sm font-medium rounded-t ${signMode === "type" ? "border-b-2 border-blue-600 text-blue-600" : "text-muted-foreground"}`}
              data-testid="tab-sign-type"
            >
              Type Signature
            </button>
          </div>

          {signMode === "draw" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Draw your signature in the box below</p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white relative">
                <canvas
                  ref={signCanvasRef}
                  width={448}
                  height={160}
                  className="w-full cursor-crosshair rounded-lg"
                  style={{ touchAction: "none" }}
                  onMouseDown={(e) => {
                    const canvas = signCanvasRef.current!;
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    const ctx = canvas.getContext("2d")!;
                    ctx.beginPath();
                    ctx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
                    ctx.strokeStyle = "#1e40af";
                    ctx.lineWidth = 2.5;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    isDrawing.current = true;
                  }}
                  onMouseMove={(e) => {
                    if (!isDrawing.current) return;
                    const canvas = signCanvasRef.current!;
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    const ctx = canvas.getContext("2d")!;
                    ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
                    ctx.stroke();
                  }}
                  onMouseUp={() => { isDrawing.current = false; }}
                  onMouseLeave={() => { isDrawing.current = false; }}
                  data-testid="canvas-signature"
                />
                <p className="absolute bottom-2 right-3 text-[10px] text-gray-300 pointer-events-none select-none">Sign here</p>
              </div>
              <button
                onClick={() => {
                  const ctx = signCanvasRef.current?.getContext("2d");
                  if (ctx) ctx.clearRect(0, 0, signCanvasRef.current!.width, signCanvasRef.current!.height);
                }}
                className="text-xs text-muted-foreground underline"
                data-testid="button-clear-signature"
              >
                Clear
              </button>
            </div>
          )}

          {signMode === "type" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Type your name — it will appear as your signature</p>
              <input
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder="Your full name"
                className="w-full border rounded-md px-3 py-2 text-sm"
                data-testid="input-type-signature"
              />
              {typedName && (
                <div className="border rounded-lg bg-white p-4 min-h-[80px] flex items-center justify-center">
                  <span style={{ fontFamily: "'Brush Script MT', cursive", fontSize: "2.5rem", color: "#1e40af", lineHeight: 1.1 }}>
                    {typedName}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 mt-2">
            By clicking <strong>Sign Document</strong>, you agree that your electronic signature is the legal equivalent of your handwritten signature.
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSigningPanelOpen(false)} disabled={signMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => signMutation.mutate()}
              disabled={signMutation.isPending || (signMode === "type" && !typedName.trim())}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-sign-document"
            >
              {signMutation.isPending ? "Signing..." : "Sign Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send for Signing — Confirmation dialog */}
      <AlertDialog open={sendForSigningOpen} onOpenChange={setSendForSigningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Send Contract for Signing
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will update the contract status to <strong>Pending Signature</strong> and notify all signing parties.
              Both parties will need to review and sign the contract before it becomes fully executed.
              <br /><br />
              Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-send-signing" disabled={sendForSigningMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-send-signing"
              disabled={sendForSigningMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                sendForSigningMutation.mutate();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {sendForSigningMutation.isPending ? "Sending..." : "Yes, Send for Signing"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pending Approval — Approve / Reject / More Info Required dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={(open) => { setApprovalDialogOpen(open); if (!open) setApprovalRemarks(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {approvalAction === "Approve" && <ThumbsUp className="h-5 w-5 text-green-600" />}
              {approvalAction === "Reject" && <ThumbsDown className="h-5 w-5 text-red-600" />}
              {approvalAction === "More" && <HelpCircle className="h-5 w-5 text-orange-600" />}
              {approvalAction === "Approve" ? "Approve Contract" : approvalAction === "Reject" ? "Reject Contract" : "Request More Information"}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === "Approve" && `Approve "${contract.title}"? The status will be updated to Approved.`}
              {approvalAction === "Reject" && `Reject "${contract.title}"? The status will be updated to Rejected.`}
              {approvalAction === "More" && `Request more information for "${contract.title}"? The status will be updated to More Info Required.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="approval-remarks">Remarks {approvalAction !== "Approve" && <span className="text-red-500">*</span>}</Label>
            <Textarea
              id="approval-remarks"
              placeholder={approvalAction === "Approve" ? "Optional remarks..." : "Please provide a reason..."}
              value={approvalRemarks}
              onChange={(e) => setApprovalRemarks(e.target.value)}
              rows={4}
              className="mt-2"
              data-testid="input-approval-remarks"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)} data-testid="button-approval-cancel">Cancel</Button>
            <Button
              onClick={() => {
                if (approvalAction !== "Approve" && !approvalRemarks.trim()) {
                  toast({ title: "Remarks required", description: "Please provide a reason for this action.", variant: "destructive" });
                  return;
                }
                approvalMutation.mutate({ action: approvalAction, remarks: approvalRemarks });
              }}
              className={approvalAction === "Approve" ? "bg-green-600 hover:bg-green-700 text-white" : approvalAction === "Reject" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"}
              disabled={approvalMutation.isPending}
              data-testid="button-approval-confirm"
            >
              {approvalMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {approvalAction === "Approve" ? "Approve" : approvalAction === "Reject" ? "Reject" : "Request Info"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApprovalChecklistDialog
        open={checklistDialogOpen}
        onOpenChange={setChecklistDialogOpen}
        moduleName="Contract"
        title="Contract Approval Checklist"
        refNumber={refNo}
        approving={approvalMutation.isPending}
        onApprove={(comments) => {
          setChecklistDialogOpen(false);
          approvalMutation.mutate({ action: "Approve", remarks: comments });
        }}
      />

      {/* Reject Review dialog */}
      <Dialog open={rejectOpen} onOpenChange={(o) => { setRejectOpen(o); if (!o) setRejectComments(""); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Reject Review
            </DialogTitle>
            <DialogDescription>
              Reject the review for <strong>{contract.title}</strong>? The status will be updated to <strong>Review Rejected</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Rejection Comments <span className="text-muted-foreground">(optional)</span></label>
            <Textarea
              placeholder="Enter your reason for rejection..."
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              rows={4}
              data-testid="textarea-reject-comments"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectComments(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectReviewMutation.mutate()}
              disabled={rejectReviewMutation.isPending}
              data-testid="button-confirm-reject-review"
            >
              {rejectReviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Negotiation Review dialog */}
      <Dialog open={negoRejectOpen} onOpenChange={(o) => { setNegoRejectOpen(o); if (!o) setNegoRejectComments(""); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Reject Negotiation Review
            </DialogTitle>
            <DialogDescription>
              Reject the owner's negotiation response for <strong>{contract.title}</strong>? It will go back to the owner (status <strong>Supplier Submit For Negotiation</strong>) to revise and resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Rejection Comments <span className="text-muted-foreground">(optional)</span></label>
            <Textarea
              placeholder="Enter your reason for rejection..."
              value={negoRejectComments}
              onChange={(e) => setNegoRejectComments(e.target.value)}
              rows={4}
              data-testid="textarea-negotiation-reject-comments"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNegoRejectOpen(false); setNegoRejectComments(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => negotiationRejectReviewMutation.mutate()}
              disabled={negotiationRejectReviewMutation.isPending}
              data-testid="button-confirm-reject-negotiation-review"
            >
              {negotiationRejectReviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
