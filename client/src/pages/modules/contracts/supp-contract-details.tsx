import TiptapClauseEditor from "@/components/tiptap-clause-editor";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormSheet } from "@/components/form-sheet";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  BookOpen,
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
  CreditCard,
  DollarSign,
  Download,
  Eye,
  File,
  FileText,
  FolderOpen,
  GitBranch,
  GripVertical,
  HelpCircle,
  History,
  Info,
  Layers,
  LayoutList,
  Loader2,
  MessageSquare,
  Package,
  PanelLeftOpen, PanelRight,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Truck,
  UploadCloud,
  User,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";

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
  is_owner?: boolean;
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
                          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{formatDate(entry.action_date)}</span>
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

export default function SupplierContractDetail() {
  const [, params] = useRoute("/app/supp-contract-details/:id");
  const contractId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComments, setRejectComments] = useState("");
  const [historyClauseId, setHistoryClauseId] = useState<number | null>(null);
  const [historyClauseName, setHistoryClauseName] = useState("");
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"Approve" | "Reject" | "More">("Approve");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'classic' | 'modern'>('modern');
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sheetPreviewHtml, setSheetPreviewHtml] = useState<string | null>(null);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [rightPanel, setRightPanel] = useState<null | 'details' | 'sow' | 'delivery'>(null);
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
  const [submitNegotiationOpen, setSubmitNegotiationOpen] = useState(false);
  const [submitAcceptanceOpen, setSubmitAcceptanceOpen] = useState(false);

  const submitNegotiationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/vendor-submit-negotiation`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit negotiation");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Negotiation submitted", description: "Your negotiation has been submitted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/supplier/list"] });
      navigate("/app/supp-contracts");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const submitAcceptanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/vendor-submit-acceptance`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit acceptance");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract accepted", description: "You have accepted the contract successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/supplier/list"] });
      setTimeout(() => navigate("/app/supp-contracts"), 800);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
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
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/supplier/list"] });
      navigate("/app/supp-contracts");
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
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/supplier/list"] });
      navigate("/app/supp-contracts");
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
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/supplier/list"] });
      navigate("/app/supp-contracts");
    },
    onError: (err: any) => toast({ title: "Cannot reject review", description: err.message, variant: "destructive" }),
  });

  const approvalMutation = useMutation({
    mutationFn: async (vars: { action: "Approve" | "Reject" | "More"; remarks: string }) => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}/process-approval`, vars);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to process approval");
      }
      return { ...(await res.json()), action: vars.action };
    },
    onSuccess: (data) => {
      const titles: Record<string, string> = { Approve: "Contract Approved", Reject: "Contract Rejected", More: "More Info Requested" };
      const descs: Record<string, string> = { Approve: "Contract status updated to Approved.", Reject: "Contract status updated to Rejected.", More: "Contract status updated to More Info Required." };
      toast({ title: titles[data.action], description: descs[data.action] });
      setApprovalDialogOpen(false);
      setApprovalRemarks("");
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId] });
    },
    onError: (err: any) => toast({ title: "Approval action failed", description: err.message, variant: "destructive" }),
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

  const blankSowForm = { description: "", quantity: "", uom: "EA", unit_cost: "", start_date: "", deliverydate: "", specifications: "", linetype: "Goods", categoryCode: "", categoryName: "", itemId: "", itemName: "" };

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

  // Fetch the live preview HTML via apiRequest (carries the Authorization/Bearer header)
  // and inject it into the iframe via srcDoc — a plain iframe `src=` navigation can't
  // attach that header, so the API's auth gate would reject it.
  useEffect(() => {
    if (viewMode !== 'modern' || modernEditingClause !== null || !contractId) return;
    let cancelled = false;
    setPreviewLoading(true);
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/contracts/${contractId}/preview`);
        const html = await res.text();
        if (!cancelled) setPreviewHtml(html);
      } catch (e) {
        if (!cancelled) {
          setPreviewHtml('<div style="padding:24px;font-family:sans-serif;color:#b91c1c">Failed to load document preview.</div>');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contractId, previewRefreshKey, viewMode, modernEditingClause]);

  // Same fix for the classic-view "Preview Document" sheet's iframe.
  useEffect(() => {
    if (!previewOpen || !contractId) return;
    let cancelled = false;
    setSheetPreviewLoading(true);
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/contracts/${contractId}/preview`);
        const html = await res.text();
        if (!cancelled) setSheetPreviewHtml(html);
      } catch (e) {
        if (!cancelled) {
          setSheetPreviewHtml('<div style="padding:24px;font-family:sans-serif;color:#b91c1c">Failed to load document preview.</div>');
        }
      } finally {
        if (!cancelled) setSheetPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contractId, previewOpen]);

  // Downloads also go through apiRequest (for the Authorization header) rather than a
  // raw `<a href>`/`window.open` navigation, then save the returned PDF blob manually.
  const handleDownloadContractPdf = async () => {
    if (!contractId) return;
    try {
      const res = await apiRequest("GET", `/api/contracts/${contractId}/preview?download=1`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${contract?.contr_ref_no || contractId}-contract.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Download failed", description: "Could not download the contract document.", variant: "destructive" });
    }
  };

  // Navigate back to contracts list when vendor signs and contract is fully signed
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "FULLY_EXECUTED") {
        // Remove cache entirely so list page fetches fresh on mount
        queryClient.removeQueries({ queryKey: ["/api/contracts/supplier/list"] });
        queryClient.removeQueries({ queryKey: [`/api/contracts/${contractId}`] });
        setTimeout(() => navigate("/app/supp-contracts"), 800);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [contractId, navigate, queryClient]);

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
    setDirtyClauses(prev => new Set([...prev, id]));
  }

  function discardClauseChanges(id: number) {
    const original = serverClauses.find((c: any) => c.id === id);
    if (!original) return;
    setLocalClauses(prev => prev.map(c => c.id === id ? { ...c, term_details: original.term_details, terms_name: original.terms_name } : c));
    setDirtyClauses(prev => { const s = new Set(prev); s.delete(id); return s; });
    setClauseResetCounters(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
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
      term_details: lib.description || "",
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
      uom: sow.uom || "EA",
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
    if (editingSow) {
      updateSowMutation.mutate({ sowId: editingSow.id, data: sowForm });
    } else {
      createSowMutation.mutate(sowForm);
    }
  }

  const { data: contract, isLoading } = useQuery<ContractHeader>({
    queryKey: ["/api/contracts", contractId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contracts/${contractId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!contractId,
  });

  // ── Auth identity — must live above early returns so callbacks can close over it
  const _auth = (() => { try { return JSON.parse(localStorage.getItem("prokraya-auth") || "{}"); } catch { return {}; } })();
  const currentUserId = Number(_auth.userId) || 0;
  const currentUserName: string = _auth.userName || "";

  // ── Fetch current user's roles to determine superadmin ──────────────────────
  const { data: currentUserProfile } = useQuery<{ roles: { role_name: string }[] }>({
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
            <Link href="/app/supp-contracts">
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
  const isReviewCompleted = contract.status === "Review Completed";
  const isReviewRejected = contract.status === "Review Rejected";
  const isPendingApproval = contract.status === "Pending Approval";
  const isUnderReview = contract.status === "Under Review";
  const isUnderNegotiation = contract.status === "Under Negotiation";
  const modernClause = modernEditingClause !== null ? (localClauses.find(c => c.id === modernEditingClause) ?? null) : null;
  const refNo = contract.contr_ref_no || String(contract.id);

  // ── Track Changes: current user identity + role ──────────────────────────────
  const isContractOwner: boolean = contract.is_owner === true;
  // Only the contract owner can edit, delete, submit, or publish
  const canDoOwnerActions = isContractOwner;
  // Owners can perform all edit actions in Draft, Review Completed, and Review Rejected
  const canOwnerEdit = (isDraft || isReviewCompleted || isReviewRejected) && canDoOwnerActions;
  const isCurrentUserReviewer = isUnderReview && !reviewersLoading && reviewers.some((r: any) => r.user_id === currentUserId);
  const canEditClauses = isDraft || isReviewCompleted && isContractOwner || isReviewRejected && isContractOwner || (isUnderReview && isCurrentUserReviewer) || isUnderNegotiation;
  const showOwnerReviewBar = isUnderReview && !reviewersLoading && isContractOwner && !isCurrentUserReviewer;
  // Owner can accept/reject/resolve track changes in ANY status (not just Under Review)
  const canOwnerResolveChanges = !reviewersLoading && isContractOwner && !isCurrentUserReviewer;

  return (
    <div className="p-4 space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app/supp-contracts">
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
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-contract-title">{contract.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'classic' && (
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} data-testid="button-preview-contract">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
          )}

          {/* Under Negotiation actions */}
          {isUnderNegotiation && (
            <>
              <Button
                size="sm"
                onClick={() => setSubmitNegotiationOpen(true)}
                disabled={submitNegotiationMutation.isPending}
                data-testid="button-submit-negotiation"
              >
                {submitNegotiationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit Negotiation
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const hasUnresolved = localClauses.some(c => hasTrackChanges(c.term_details || ""));
                  if (hasUnresolved) {
                    toast({ title: "Unresolved track changes", description: "Please resolve all track changes before submitting acceptance.", variant: "destructive" });
                    return;
                  }
                  const hasComments = localClauses.some(c => hasOpenComments(c.id));
                  if (hasComments) {
                    toast({ title: "Open comments", description: "Please resolve all open comments before submitting acceptance.", variant: "destructive" });
                    return;
                  }
                  setSubmitAcceptanceOpen(true);
                }}
                disabled={submitAcceptanceMutation.isPending}
                data-testid="button-submit-acceptance"
              >
                {submitAcceptanceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Submit Acceptance
              </Button>
            </>
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
                    variant={rightPanel === 'details' ? 'secondary' : 'ghost'}
                    size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                    data-testid="button-modern-panel-menu"
                  >
                    {rightPanel === 'details' ? <><FileText className="h-3.5 w-3.5" /> Details</> : <><Info className="h-3.5 w-3.5" /> Contract Info</>}
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
                </DropdownMenuContent>
              </DropdownMenu>
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
              <span className="w-px h-4 bg-border mx-1" />
              <Button
                variant="ghost" size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                onClick={handleDownloadContractPdf}
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
                {canOwnerEdit && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1.5 h-3 w-3 text-muted-foreground" />
                    <input type="text" placeholder="Search library…" value={clauseLibSearch} onChange={e => setClauseLibSearch(e.target.value)}
                      className="w-full pl-7 pr-3 py-1 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      data-testid="input-modern-clause-search" />
                  </div>
                )}
              </div>
              {isUnderNegotiation && (
                <div className="mx-2 mb-2 px-2.5 py-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    Click any clause to review &amp; edit. All changes are <strong>tracked</strong> so the owner can see exactly what you modified.
                  </p>
                </div>
              )}
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
                          {clause.status && ['Published', 'Accepted', 'Deleted'].includes(clause.status) && (
                            <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded shrink-0",
                              clause.status === 'Accepted' ? "bg-emerald-100 text-emerald-700" :
                              clause.status === 'Deleted' ? "bg-red-100 text-red-700" :
                              "bg-sky-100 text-sky-700"
                            )}>{clause.status}</span>
                          )}
                          {hasTrackChanges(clause.term_details || "") && !dirtyClauses.has(clause.id) && (
                            <GitBranch className="h-3 w-3 text-orange-500 shrink-0" aria-label="Has tracked changes" />
                          )}
                          {dirtyClauses.has(clause.id) && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
                          {canOwnerEdit && clause.status !== 'Deleted' && (
                            <button onClick={e => { e.stopPropagation(); setDeleteClauseId(clause.id); }} className="opacity-0 group-hover:opacity-100 text-destructive shrink-0" data-testid={`button-modern-delete-clause-${clause.id}`}>
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {canOwnerEdit && <div className="mx-2 my-1.5 border-t" />}
                {canOwnerEdit && <div className="px-2 pb-3">
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
                        const canDrag = canOwnerEdit && !alreadyAdded && !addClauseMutation.isPending;
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
                              alreadyAdded ? "opacity-40 cursor-default" : canOwnerEdit ? "hover:bg-primary/10 cursor-grab active:cursor-grabbing" : "opacity-40 cursor-default")}
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
                  {canOwnerEdit && (
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
                    {modernClause.status && ['Published', 'Accepted', 'Deleted'].includes(modernClause.status) && (
                      <Badge variant="outline" className={cn("text-xs shrink-0",
                        modernClause.status === 'Accepted' ? "border-emerald-300 bg-emerald-50 text-emerald-700" :
                        modernClause.status === 'Deleted' ? "border-red-300 bg-red-50 text-red-700" :
                        "border-sky-300 bg-sky-50 text-sky-700"
                      )}>{modernClause.status}</Badge>
                    )}
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
                        disabled={!canEditClauses || isUnderNegotiation}
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
                          trackChangesMode={(isUnderReview && isCurrentUserReviewer) || isUnderNegotiation}
                          showChangesBar={canOwnerResolveChanges && hasTrackChanges(modernClause.term_details || "")}
                          reviewerId={String(currentUserId)}
                          reviewerName={currentUserName}
                          readOnly={!canEditClauses || modernClause.status === 'Deleted'}
                          restrictedMode={isUnderNegotiation}
                          onAddComment={(isCurrentUserReviewer || isUnderNegotiation) && modernClause.status !== 'Deleted' ? (cid, sel, txt) => handleAddComment(modernClause.id, cid, sel, txt) : undefined}
                          onAcceptAll={async (cleanHtml) => {
                            updateLocalClause(modernClause.id, { term_details: cleanHtml });
                            await saveClauseImmediate(modernClause.id, cleanHtml, modernClause.terms_name);
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
                      srcDoc={previewHtml || ""}
                      className="absolute inset-0 w-full h-full border-0"
                      title="Live Contract Preview"
                      data-testid="iframe-modern-preview"
                    />
                    {previewLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
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
                    {rightPanel === 'sow' && 'Scope of Work'}
                    {rightPanel === 'delivery' && 'Delivery & Payment'}
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
                    </>
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
                          <div className="flex items-center gap-2 py-3 text-muted-foreground/60">
                            <CreditCard className="h-4 w-4 shrink-0" />
                            <p className="text-xs">No payment terms yet</p>
                          </div>
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
          </TabsList>
        </div>

        <TabsContent value="scope-of-work" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Scope of Work ({sowLines.length})
              </CardTitle>
              {canOwnerEdit && (
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
                  {canOwnerEdit && (
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
                        {canOwnerEdit && <TableHead className="w-20"></TableHead>}
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
                          {canOwnerEdit && (
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
                  {canOwnerEdit && (
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
                        {clause.status && ['Published', 'Accepted', 'Deleted'].includes(clause.status) && (
                          <Badge variant="outline" className={cn("text-xs shrink-0",
                            clause.status === 'Accepted' ? "border-emerald-300 bg-emerald-50 text-emerald-700" :
                            clause.status === 'Deleted' ? "border-red-300 bg-red-50 text-red-700" :
                            "border-sky-300 bg-sky-50 text-sky-700"
                          )}>{clause.status}</Badge>
                        )}
                        {dirtyClauses.has(clause.id) && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50">Unsaved</Badge>
                            <button onClick={e => { e.stopPropagation(); discardClauseChanges(clause.id); }} title="Discard changes" className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" data-testid={`button-discard-clause-${clause.id}`}>
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {canOwnerEdit && clause.status !== 'Deleted' && (
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
                                disabled={!canEditClauses || isUnderNegotiation || clause.status === 'Deleted'}
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
                                  trackChangesMode={(isUnderReview && isCurrentUserReviewer) || isUnderNegotiation}
                                  showChangesBar={canOwnerResolveChanges && hasTrackChanges(clause.term_details || "")}
                                  reviewerId={String(currentUserId)}
                                  reviewerName={currentUserName}
                                  readOnly={!canEditClauses || clause.status === 'Deleted'}
                                  restrictedMode={isUnderNegotiation}
                                  onAddComment={(isCurrentUserReviewer || isUnderNegotiation) && clause.status !== 'Deleted' ? (cid, sel, txt) => handleAddComment(clause.id, cid, sel, txt) : undefined}
                                  onAcceptAll={async (cleanHtml) => {
                                    updateLocalClause(clause.id, { term_details: cleanHtml });
                                    await saveClauseImmediate(clause.id, cleanHtml, clause.terms_name);
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
                {canOwnerEdit ? (
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

              {(!canOwnerEdit || clauseLibTab === "added") ? (
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
                        <span className={cn("truncate font-medium", clause.status === 'Deleted' && "line-through text-muted-foreground")}>
                          Clause {idx + 1}{clause.terms_name ? `: ${clause.terms_name}` : ""}
                        </span>
                        <span className="flex items-center gap-1 shrink-0 ml-auto">
                          {clause.status && ['Published', 'Accepted', 'Deleted'].includes(clause.status) && (
                            <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded",
                              clause.status === 'Accepted' ? "bg-emerald-100 text-emerald-700" :
                              clause.status === 'Deleted' ? "bg-red-100 text-red-700" :
                              "bg-sky-100 text-sky-700"
                            )}>{clause.status}</span>
                          )}
                          {hasTrackChanges(clause.term_details || "") && !dirtyClauses.has(clause.id) && (
                            <GitBranch className="h-3 w-3 text-orange-500" aria-label="Has tracked changes" />
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
                        draggable={canOwnerEdit}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; setDragLibraryClause(lib); setDragClauseId(null); }}
                        onDragEnd={() => { setDragLibraryClause(null); setLibDragOverLeft(false); }}
                        onClick={() => canOwnerEdit && addFromLibrary(lib)}
                        className={cn(
                          "w-full px-2 py-2 text-xs text-left transition-colors select-none border-b last:border-b-0",
                          canOwnerEdit ? "hover:bg-primary/10 cursor-grab active:cursor-grabbing" : "cursor-pointer hover:bg-accent"
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
                          <TableCell className="text-muted-foreground max-w-[180px] truncate" title={s.details || ""}>{s.details || "—"}</TableCell>
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
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No payment terms have been set up for this contract.</p>
                </div>
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

      </Tabs>
      )}

      {/* Add / Edit Delivery Schedule — Form Dialog (works in both Classic and Modern view) */}
      <FormSheet
        open={delivSchedOpen}
        onOpenChange={(o) => { setDelivSchedOpen(o); if (!o) setEditingDelivSched(null); }}
        title={editingDelivSched ? "Edit Delivery Schedule" : "Add Delivery Schedule"}
        onSubmit={() => saveDelivSchedMutation.mutate({ ...delivSchedForm, elasped_days: delivSchedForm.elasped_days ? Number(delivSchedForm.elasped_days) : null, amt_milestone: delivSchedForm.amt_milestone ? Number(delivSchedForm.amt_milestone) : null, pcnt_milestone: delivSchedForm.pcnt_milestone ? Number(delivSchedForm.pcnt_milestone) : null })}
        submitLabel={editingDelivSched ? "Save Changes" : "Add Schedule"}
        isSubmitting={saveDelivSchedMutation.isPending}
        submitDisabled={saveDelivSchedMutation.isPending || !delivSchedForm.deliverable_name.trim()}
        widthClassName="w-full sm:max-w-[65vw]"
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

      {/* Add / Edit Payment Term — Form Dialog (works in both Classic and Modern view) */}
      <FormSheet
        open={payTermOpen}
        onOpenChange={(o) => { setPayTermOpen(o); if (!o) setEditingPayTerm(null); }}
        title={editingPayTerm ? "Edit Payment Term" : "Add Payment Term"}
        onSubmit={() => savePayTermMutation.mutate({ ...payTermForm, amt_milestone: payTermForm.amt_milestone ? Number(payTermForm.amt_milestone) : null, pcnt_milestone: payTermForm.pcnt_milestone ? Number(payTermForm.pcnt_milestone) : null })}
        submitLabel={editingPayTerm ? "Save Changes" : "Add Payment Term"}
        isSubmitting={savePayTermMutation.isPending}
        submitDisabled={savePayTermMutation.isPending || !payTermForm.name.trim()}
        widthClassName="w-full sm:max-w-[65vw]"
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
        widthClassName="w-full sm:max-w-[600px]"
      >
          <div className="space-y-6">
            {/* Item Entry Mode Toggle */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Item Details</h4>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={itemEntryMode === "master" ? "default" : "outline"} onClick={() => { setItemEntryMode("master"); setSowForm(f => ({ ...f, description: "", categoryCode: "", categoryName: "", uom: "EA", itemId: "", itemName: "" })); }} data-testid="button-item-master-mode">
                  Item Master
                </Button>
                <Button type="button" size="sm" variant={itemEntryMode === "freetext" ? "default" : "outline"} onClick={() => { setItemEntryMode("freetext"); setSowForm(f => ({ ...f, itemId: "", itemName: "" })); }} data-testid="button-freetext-mode">
                  Free Text
                </Button>
              </div>

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
                                    uom: item.unitOfMeasure || "EA",
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
                  <Label htmlFor="sow-quantity">Quantity</Label>
                  <Input id="sow-quantity" type="number" min="0" placeholder="0" value={sowForm.quantity} onChange={e => setSowForm(f => ({ ...f, quantity: e.target.value }))} data-testid="input-sow-quantity" />
                </div>

                <div className="space-y-1.5">
                  <Label>Unit of Measure</Label>
                  <Select value={sowForm.uom} onValueChange={v => setSowForm(f => ({ ...f, uom: v }))}>
                    <SelectTrigger data-testid="select-sow-uom"><SelectValue placeholder="Select UoM" /></SelectTrigger>
                    <SelectContent>
                      {uomOptions.length > 0 ? uomOptions.map(u => (
                        <SelectItem key={u.id} value={u.description || "EA"}>{u.description}</SelectItem>
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
                  <Label htmlFor="sow-unit-cost">Unit Cost ({contract?.currency || ""})</Label>
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

      {/* Submit Negotiation Confirmation */}
      <AlertDialog open={submitNegotiationOpen} onOpenChange={setSubmitNegotiationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Negotiation</AlertDialogTitle>
            <AlertDialogDescription>
              This will submit your negotiation to the contract owner for review. The contract status will change to <strong>Supplier Submit For Negotiation</strong>. Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setSubmitNegotiationOpen(false); submitNegotiationMutation.mutate(); }}
              data-testid="button-confirm-submit-negotiation"
            >
              Submit Negotiation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit Acceptance Confirmation */}
      <AlertDialog open={submitAcceptanceOpen} onOpenChange={setSubmitAcceptanceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept Contract</AlertDialogTitle>
            <AlertDialogDescription>
              By accepting this contract, you confirm that you agree to all terms and conditions. The contract status will change to <strong>Accepted</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setSubmitAcceptanceOpen(false); submitAcceptanceMutation.mutate(); }}
              data-testid="button-confirm-submit-acceptance"
            >
              Accept Contract
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Attach Document Form Dialog */}
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
        submitDisabled={addAttachMutation.isPending}
        widthClassName="w-full sm:max-w-[600px]"
      >
          <p className="text-xs text-muted-foreground mb-4"><span className="text-destructive">*</span> Indicates mandatory fields</p>
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


      {/* Preview Document Slider */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="flex flex-col p-0 gap-0" style={{ width: "65vw", maxWidth: "900px" }}>
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Preview Document</SheetTitle>
            <SheetDescription>Scroll to review the full contract document.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden relative">
            {previewOpen && (
              <iframe
                srcDoc={sheetPreviewHtml || ""}
                className="w-full h-full border-0"
                title="Contract Preview"
                data-testid="iframe-contract-preview"
              />
            )}
            {sheetPreviewLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t shrink-0 flex justify-end">
            <Button
              onClick={handleDownloadContractPdf}
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

    </div>
  );
}
