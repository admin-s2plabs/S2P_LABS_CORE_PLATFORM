import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { ThinkingTips } from "@/components/ui/ThinkingTips";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { formatDate } from "@/lib/common-functions";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Edit,
  Edit2,
  FileCheck,
  FileSearch,
  FileText,
  ListPlus,
  Loader2,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PenSquare,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Truck,
  User,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAgentConversation, type ConversationMessage } from "@/hooks/useAgentConversation";
import {
  AGENT_MENTION_PLACEHOLDER_HINT,
  useAgentMentions,
} from "@/hooks/useAgentMentions";
import { SourcingUserMessageBubbleContent } from "@/lib/supplier-mention-utils";
import { applyAllMentionsToPrompt } from "@shared/agent-mention";
import { useContractPreviewSelection, type FormatCommand } from "@/hooks/useContractPreviewSelection";
import { ContractPreviewToolbar } from "@/components/contract-preview-toolbar";
import { ContractToolResultCard } from "./contract-tool-result-card";
import type { ContractToolResult } from "@shared/agent-contract-tools";

type CopilotSource = "scratch" | "pr" | "bid";
// Capability actions: extract/risk/redline/editLive all run against a contract the
// user picks; "renewal" scans the contract list directly (no picker).
type CapAction = "extract" | "risk" | "redline" | "renewal" | "editLive";

const capabilities: { key: CapAction; icon: typeof FileSearch; label: string; description: string }[] = [
  { key: "extract", icon: FileSearch, label: "Clause Extraction", description: "Automatically extract key terms and clauses" },
  { key: "risk", icon: AlertTriangle, label: "Risk Flagging", description: "Identify high-risk clauses and terms" },
  { key: "renewal", icon: Calendar, label: "Renewal Alerts", description: "Track and alert on contract renewals" },
  { key: "redline", icon: Scale, label: "Redline Suggestions", description: "AI-powered contract negotiation support" },
  { key: "editLive", icon: Edit2, label: "Edit Live", description: "Open the document in the WYSIWYG editor to edit text directly" },
];

const CAP_LABEL: Record<CapAction, string> = {
  extract: "Clause Extraction",
  risk: "Risk Flagging",
  redline: "Redline Suggestions",
  renewal: "Renewal Alerts",
  editLive: "Edit Live",
};

const examplePrompts: string[] = [
  "What are the high-risk clauses to watch for in a supplier agreement?",
  "Draft an indemnification clause for a services contract",
  "Suggest redlines to soften an auto-renewal clause",
  "Explain the difference between liquidated damages and a penalty clause",
  "What notice period should I set for contract renewal?",
];

const SOURCE_OPTIONS: {
  key: CopilotSource; title: string; desc: string; icon: typeof PenSquare;
  iconClass: string; ringClass: string;
}[] = [
  {
    key: "scratch", title: "Build from Scratch",
    desc: "Create a new contract from a blank template with full customization",
    icon: PenSquare,
    iconClass: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
    ringClass: "border-violet-400 ring-1 ring-violet-300 dark:ring-violet-700",
  },
  {
    key: "pr", title: "Use Approved PR",
    desc: "Generate contract terms from an approved Purchase Requisition",
    icon: ClipboardCheck,
    iconClass: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    ringClass: "border-blue-400 ring-1 ring-blue-300 dark:ring-blue-700",
  },
  {
    key: "bid", title: "Use Awarded Bid",
    desc: "Convert an awarded bid / tender into a contract automatically",
    icon: Award,
    iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    ringClass: "border-emerald-400 ring-1 ring-emerald-300 dark:ring-emerald-700",
  },
];

const COPILOT_WELCOME: Record<CopilotSource, string> = {
  scratch: "Hi! I'm your Contract Co-Pilot. I'll help you create a professional contract step by step. Let's start — what type of contract are you creating, and what should we title it?",
  pr: "Hi! I'm your Contract Co-Pilot. You're creating a contract from an Approved PR. Tell me the PR reference number or describe the procurement, and I'll map the details into a contract.",
  bid: "Hi! I'm your Contract Co-Pilot. You're converting an Awarded Bid into a contract. Share the Bid reference or describe the awarded scope, and I'll pull the terms into the contract.",
};

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD"];

// Essential fields the guided panel walks the user through.
const SCRATCH_GUIDED_STEPS: { key: string; label: string; hint: string }[] = [
  { key: "contract_type", label: "Type", hint: "What type of contract is this?" },
  { key: "title", label: "Title", hint: "Give the contract a short title." },
  { key: "supplier", label: "Supplier", hint: "Select the supplier for this contract." },
  { key: "dates", label: "Dates", hint: "Choose the start and end dates." },
  { key: "currency", label: "Currency", hint: "Pick the contract currency." },
  { key: "sow", label: "Scope of Work", hint: "Add Scope of Work line items, products, or services." },
  { key: "payment_terms", label: "Payment Terms", hint: "Set up payment milestones and schedule." },
  { key: "delivery_inspection", label: "Delivery & Inspection", hint: "Specify delivery milestones and inspection criteria." },
  { key: "special_clauses", label: "Special Clauses", hint: "Add special clauses, terms, or legal provisions." },
  { key: "reviewers", label: "Review Team", hint: "Select team members to review this contract." },
];

const IMPORTED_GUIDED_STEPS: { key: string; label: string; hint: string }[] = [
  { key: "contract_type", label: "Type", hint: "What type of contract is this?" },
  { key: "title", label: "Title", hint: "Give the contract a short title." },
  { key: "supplier", label: "Supplier", hint: "Select the supplier for this contract." },
  { key: "dates", label: "Dates", hint: "Choose the start and end dates." },
  { key: "currency", label: "Currency", hint: "Pick the contract currency." },
  { key: "sow", label: "Scope of Work", hint: "Review and refine Scope of Work line items." },
  { key: "payment_terms", label: "Payment Terms", hint: "Set up payment milestones and schedule." },
  { key: "delivery_inspection", label: "Delivery & Inspection", hint: "Specify delivery milestones and inspection criteria." },
  { key: "special_clauses", label: "Special Clauses", hint: "Add special clauses, terms, or legal provisions." },
  { key: "reviewers", label: "Review Team", hint: "Select team members to review this contract." },
];

const CLAUSE_PRESETS = [
  {
    type: "Confidentiality",
    label: "Confidentiality & NDA",
    content: "Both parties agree to maintain strict confidentiality regarding all proprietary information, trade secrets, and technical data disclosed during the term of this contract.",
  },
  {
    type: "Governing Law",
    label: "Governing Law",
    content: "This Agreement shall be governed by and construed in accordance with the laws of the United Arab Emirates as applicable in the Emirate of Ajman.",
  },
  {
    type: "Limitation of Liability",
    label: "Limitation of Liability",
    content: "Neither party's aggregate liability arising out of or related to this contract shall exceed the total fees paid or payable by the Buyer under this Agreement.",
  },
  {
    type: "Termination Notice",
    label: "30-Day Termination",
    content: "Either party may terminate this Agreement without cause by providing at least thirty (30) days prior written notice to the other party.",
  },
  {
    type: "Intellectual Property",
    label: "IP Ownership",
    content: "All deliverables, materials, work product, and intellectual property developed or delivered under this Agreement shall be the sole and exclusive property of the Buyer.",
  },
];

export default function AIContractingAgent() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const mention = useAgentMentions();
  const { prompt, setPromptText, reset: resetMentions, streamMentions } = mention;
  const [isProcessing, setIsProcessing] = useState(false);
  // Server-backed chat history (per user + "contracting" agent), same system every
  // other AI agent uses — gives us the History sidebar, persistence and restore.
  const {
    conversation,
    setConversation,
    newConversation,
    switchConversation,
    deleteConversation,
    groupedConversations,
    currentId,
  } = useAgentConversation("contracting");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Co-Pilot contract-builder state ──
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<CopilotSource | null>(null);
  const [copilotSource, setCopilotSource] = useState<CopilotSource | null>(null);
  const [dialogStep, setDialogStep] = useState<1 | 2>(1);
  const [recordSearch, setRecordSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [copilotMode, setCopilotMode] = useState(false);
  const [contractData, setContractData] = useState<Record<string, any>>({});
  const [copilotComplete, setCopilotComplete] = useState(false);
  // Set when the Co-Pilot is live-editing an already-saved contract (via the "Edit
  // Live" capability) rather than building a brand-new draft — routes Save through
  // the update endpoint and suppresses the new-draft guided-setup wizard.
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [docPreviewHtml, setDocPreviewHtml] = useState("");
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  // WYSIWYG select-and-edit: click/highlight a part of the live preview, then either
  // format it directly (floating toolbar) or scope the chat instruction to just that part.
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const { selection, clearSelection, toolbarPos, applyFormat, getSectionHtml, setSectionHtml, beginTextEdit } =
    useContractPreviewSelection(previewIframeRef);
  // Which guided step the user is editing; null = follow the first incomplete one.
  const [activeStepKey, setActiveStepKey] = useState<string | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");

  // ── Inline guided editors state ──
  // 1. Scope of Work (SOW)
  const [sowDialogOpen, setSowDialogOpen] = useState(false);
  const [editingSowIndex, setEditingSowIndex] = useState<number | null>(null);
  const [sowItemMode, setSowItemMode] = useState<"master" | "custom">("master");
  const [sowForm, setSowForm] = useState({
    item_name: "",
    description: "",
    linetype: "Goods",
    quantity: "1",
    uom: "",
    unit_cost: "",
    start_date: "",
    deliverydate: "",
    specifications: "",
    categoryCode: "",
    categoryName: "",
    itemId: "",
  });

  // 2. Payment Terms
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPaymentIndex, setEditingPaymentIndex] = useState<number | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    name: "",
    payment_type: "milestone",
    pcnt_milestone: "",
    amt_milestone: "",
    period: "",
  });

  // 3. Delivery Milestones
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [editingDeliveryIndex, setEditingDeliveryIndex] = useState<number | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    name: "",
    details: "",
    schedule_type: "milestone",
    schedule_date: "",
    pcnt_milestone: "",
    amt_milestone: "",
  });

  // 4. Special Clauses
  const [clauseDialogOpen, setClauseDialogOpen] = useState(false);
  const [editingClauseIndex, setEditingClauseIndex] = useState<number | null>(null);
  const [clauseForm, setClauseForm] = useState({
    type: "Special Clause",
    content: "",
  });

  // ── Capability tools (Clause Extraction / Risk / Redline / Renewals) ──
  const [capDialogOpen, setCapDialogOpen] = useState(false);
  const [capAction, setCapAction] = useState<CapAction | null>(null); // which tool the picker is for
  const [capSearch, setCapSearch] = useState("");

  // Lookups for SOW (Items, Categories, UOM)
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories"],
    enabled: copilotMode,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/categories");
      if (!res.ok) return [];
      return (await parseJsonResponse<any[]>(res)) || [];
    },
  });

  const { data: itemMasterList = [] } = useQuery<any[]>({
    queryKey: ["/api/items"],
    enabled: copilotMode,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/items");
      if (!res.ok) return [];
      return (await parseJsonResponse<any[]>(res)) || [];
    },
  });

  const { data: uomList = [] } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: copilotMode,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/lookups/by-property/UOM");
      if (!res.ok) return [];
      return (await parseJsonResponse<any[]>(res)) || [];
    },
  });

  // Users lookup for Review Team picker
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [reviewerOpen, setReviewerOpen] = useState(false);

  const { data: usersDropdown = [] } = useQuery<any[]>({
    queryKey: ["/api/users/dropdown", reviewerSearch],
    enabled: copilotMode,
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: "20" });
      if (reviewerSearch.trim()) qs.set("search", reviewerSearch.trim());
      const res = await apiRequest("GET", `/api/users/dropdown?${qs}`);
      if (!res.ok) return [];
      const json = await parseJsonResponse<any>(res);
      const list = Array.isArray(json) ? json : (json?.data || []);
      return list.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email_id || u.user_name || u.email || "",
        department: u.department_name || u.department || "",
      }));
    },
  });

  // Contracts for the picker + renewals — reuses the module list endpoint
  // (already visibility-filtered per user). Returns a bare array.
  const { data: contractsList = [] } = useQuery<any[]>({
    queryKey: ["/api/contracts/list"],
    enabled: !copilotMode && capDialogOpen,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/contracts/list");
      if (!res.ok) return [];
      const data = await parseJsonResponse<any>(res);
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
  });

  // Suppliers come from the same endpoint the contract module uses (status=Active,
  // server-side search). /api/suppliers filters to Approved/NULL and is often empty.
  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/dbo/suppliers", "Active", supplierSearch],
    enabled: copilotMode,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "30", status: "Active" });
      if (supplierSearch.trim()) params.set("search", supplierSearch.trim());
      const res = await apiRequest("GET", `/api/dbo/suppliers?${params}`);
      if (!res.ok) return [];
      const data = await parseJsonResponse<any>(res);
      const list = data?.data ?? data ?? [];
      return Array.isArray(list) ? list : [];
    },
  });
  const supplierLabel = (s: any) => s.supplier_name || s.company_name || s.companyName || s.name || "-";

  // Step-2 record pickers (Approved PRs / Awarded Bids) for the source dialog.
  const { data: prList = [] } = useQuery<any[]>({
    queryKey: ["/api/contracts/copilot/source/prs", recordSearch],
    enabled: sourceDialogOpen && dialogStep === 2 && selectedSource === "pr",
    queryFn: async () => {
      const qs = recordSearch.trim() ? `?search=${encodeURIComponent(recordSearch.trim())}` : "";
      const res = await apiRequest("GET", `/api/contracts/copilot/source/prs${qs}`);
      return (await parseJsonResponse<{ data: any[] }>(res))?.data ?? [];
    },
  });
  const { data: bidList = [] } = useQuery<any[]>({
    queryKey: ["/api/contracts/copilot/source/awarded-bids", recordSearch],
    enabled: sourceDialogOpen && dialogStep === 2 && selectedSource === "bid",
    queryFn: async () => {
      const qs = recordSearch.trim() ? `?search=${encodeURIComponent(recordSearch.trim())}` : "";
      const res = await apiRequest("GET", `/api/contracts/copilot/source/awarded-bids${qs}`);
      return (await parseJsonResponse<{ data: any[] }>(res))?.data ?? [];
    },
  });
  const records = selectedSource === "pr" ? prList : selectedSource === "bid" ? bidList : [];
  const recordKey = (r: any) => (selectedSource === "pr" ? r.pr_number : r.award_id);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, isProcessing]);

  const isScratchMode = copilotSource === "scratch" || contractData._source === "scratch";
  const guidedSteps = isScratchMode ? SCRATCH_GUIDED_STEPS : IMPORTED_GUIDED_STEPS;

  const stepDone = (key: string) => {
    if (key === "dates") return !!contractData.start_date && !!contractData.end_date;
    if (key === "supplier") return !!contractData.supplier_id;
    if (key === "sow") return Array.isArray(contractData.scope_of_work) && contractData.scope_of_work.length > 0;
    if (key === "payment_terms") return Array.isArray(contractData.payment_terms) && contractData.payment_terms.length > 0;
    if (key === "delivery_inspection") {
      return (Array.isArray(contractData.delivery_milestones) && contractData.delivery_milestones.length > 0) ||
             !!(contractData.inspection_criteria && String(contractData.inspection_criteria).trim());
    }
    if (key === "special_clauses") return Array.isArray(contractData.special_clauses) && contractData.special_clauses.length > 0;
    if (key === "reviewers") return Array.isArray(contractData.reviewers) && contractData.reviewers.length > 0;
    return !!contractData[key];
  };

  const nextIncompleteStep = guidedSteps.find(s => !stepDone(s.key))?.key ?? null;
  const currentStepKey = activeStepKey ?? nextIncompleteStep;

  // ── Review Team handlers ──
  const handleAddReviewer = (user: { id: any; name: string; email: string; department?: string }) => {
    const currentReviewers = [...(contractData.reviewers || [])];
    if (currentReviewers.some((r: any) => String(r.id) === String(user.id))) {
      toast({ title: "Already added", description: `${user.name} is already in the review team.` });
      return;
    }
    const updatedReviewers = [...currentReviewers, user];
    const updatedIds = updatedReviewers.map((r: any) => r.id);
    patchDraft({
      reviewers: updatedReviewers,
      reviewerIds: updatedIds,
    });
    setReviewerOpen(false);
    setReviewerSearch("");
  };

  const handleRemoveReviewer = (userId: any) => {
    const currentReviewers = (contractData.reviewers || []).filter((r: any) => String(r.id) !== String(userId));
    const updatedIds = currentReviewers.map((r: any) => r.id);
    patchDraft({
      reviewers: currentReviewers,
      reviewerIds: updatedIds,
    });
  };

  // Merge a guided selection into the draft and trigger live preview update.
  // Pass { advance: true } only for steps with no separate Next/Done button,
  // where the action itself is the confirmation to move to the next step.
  const patchDraft = (updates: Record<string, any>, opts?: { advance?: boolean }) => {
    setContractData(prev => {
      const merged = { ...prev, ...updates };
      if (merged.title) generateDocument(merged);
      return merged;
    });
    if (opts?.advance) setActiveStepKey(null);
  };

  // ── SOW inline form handlers ──
  const openAddSowDialog = () => {
    setEditingSowIndex(null);
    setSowItemMode("master");
    setSowForm({
      item_name: "",
      description: "",
      linetype: "Goods",
      quantity: "1",
      uom: uomList?.[0]?.description || "EA",
      unit_cost: "",
      start_date: contractData.start_date || "",
      deliverydate: contractData.end_date || "",
      specifications: "",
      categoryCode: "",
      categoryName: "",
      itemId: "",
    });
    setSowDialogOpen(true);
  };

  const openEditSowDialog = (index: number) => {
    const item = contractData.scope_of_work?.[index];
    if (!item) return;
    setEditingSowIndex(index);
    setSowItemMode(item.item_id ? "master" : "custom");
    setSowForm({
      item_name: item.item_name || item.name || item.description || "",
      description: item.description || item.item_name || "",
      linetype: item.linetype || item.line_type || item.type || "Goods",
      quantity: item.quantity != null ? String(item.quantity) : "1",
      uom: item.uom || "",
      unit_cost: item.unit_cost != null ? String(item.unit_cost) : "",
      start_date: item.start_date || item.startDate || "",
      deliverydate: item.deliverydate || item.delivery_date || item.deliveryDate || "",
      specifications: item.specifications || item.specs || "",
      categoryCode: item.category_code || item.categoryCode || "",
      categoryName: item.category_name || item.categoryName || "",
      itemId: item.item_id || item.itemId || "",
    });
    setSowDialogOpen(true);
  };

  const handleDeleteSowItem = (index: number) => {
    const currentSow = [...(contractData.scope_of_work || [])];
    currentSow.splice(index, 1);
    const grandTotal = currentSow.reduce((acc, row) => {
      const rowTot = row.total_cost != null && row.total_cost !== ""
        ? parseFloat(row.total_cost)
        : (parseFloat(row.quantity || "0") || 0) * (parseFloat(row.unit_cost || "0") || 0);
      return acc + (isNaN(rowTot) ? 0 : rowTot);
    }, 0);

    patchDraft({
      scope_of_work: currentSow,
      contract_amount: grandTotal > 0 ? String(grandTotal) : contractData.contract_amount,
    });
  };

  const handleSaveSowItem = () => {
    const desc = sowForm.description.trim() || sowForm.item_name.trim();
    if (!desc) {
      toast({ title: "Description required", description: "Please enter an item name or description.", variant: "destructive" });
      return;
    }
    const qty = parseFloat(sowForm.quantity || "0") || 0;
    const cost = parseFloat(sowForm.unit_cost || "0") || 0;
    const total = qty * cost;

    const newItem = {
      id: editingSowIndex !== null && contractData.scope_of_work?.[editingSowIndex]?.id
        ? contractData.scope_of_work[editingSowIndex].id
        : Math.random().toString(36).slice(2),
      item_name: sowForm.item_name || desc,
      description: desc,
      linetype: sowForm.linetype || "Goods",
      type: sowForm.linetype || "Goods",
      quantity: sowForm.quantity || "1",
      uom: sowForm.uom || "",
      unit_cost: sowForm.unit_cost || "0",
      total_cost: String(total),
      start_date: sowForm.start_date || null,
      deliverydate: sowForm.deliverydate || null,
      specifications: sowForm.specifications || null,
      item_id: sowForm.itemId || null,
      category_code: sowForm.categoryCode || null,
      category_name: sowForm.categoryName || null,
    };

    const currentSow: any[] = [...(contractData.scope_of_work || [])];
    if (editingSowIndex !== null && editingSowIndex >= 0 && editingSowIndex < currentSow.length) {
      currentSow[editingSowIndex] = newItem;
    } else {
      currentSow.push(newItem);
    }

    const grandTotal = currentSow.reduce((acc, row) => {
      const rowTot = row.total_cost != null && row.total_cost !== ""
        ? parseFloat(row.total_cost)
        : (parseFloat(row.quantity || "0") || 0) * (parseFloat(row.unit_cost || "0") || 0);
      return acc + (isNaN(rowTot) ? 0 : rowTot);
    }, 0);

    patchDraft({
      scope_of_work: currentSow,
      contract_amount: grandTotal > 0 ? String(grandTotal) : contractData.contract_amount,
    });

    setSowDialogOpen(false);
    setEditingSowIndex(null);
  };

  // ── Payment Terms inline form handlers ──
  const openAddPaymentDialog = () => {
    setEditingPaymentIndex(null);
    setPaymentForm({ name: "", payment_type: "milestone", pcnt_milestone: "", amt_milestone: "", period: "" });
    setPaymentDialogOpen(true);
  };

  const openEditPaymentDialog = (index: number) => {
    const item = contractData.payment_terms?.[index];
    if (!item) return;
    setEditingPaymentIndex(index);
    setPaymentForm({
      name: item.name || item.description || "",
      payment_type: item.payment_type || "milestone",
      pcnt_milestone: item.pcnt_milestone != null ? String(item.pcnt_milestone) : "",
      amt_milestone: item.amt_milestone != null ? String(item.amt_milestone) : "",
      period: item.period || "",
    });
    setPaymentDialogOpen(true);
  };

  const handleDeletePaymentTerm = (index: number) => {
    const currentTerms = [...(contractData.payment_terms || [])];
    currentTerms.splice(index, 1);
    patchDraft({ payment_terms: currentTerms });
  };

  const handleSavePaymentTerm = () => {
    if (!paymentForm.name.trim()) {
      toast({ title: "Name required", description: "Please enter payment term description.", variant: "destructive" });
      return;
    }
    const newTerm = {
      id: editingPaymentIndex !== null && contractData.payment_terms?.[editingPaymentIndex]?.id
        ? contractData.payment_terms[editingPaymentIndex].id
        : Math.random().toString(36).slice(2),
      name: paymentForm.name.trim(),
      payment_type: paymentForm.payment_type || "milestone",
      pcnt_milestone: paymentForm.pcnt_milestone ? parseFloat(paymentForm.pcnt_milestone) : null,
      amt_milestone: paymentForm.amt_milestone ? parseFloat(paymentForm.amt_milestone) : null,
      period: paymentForm.period.trim() || null,
    };
    const currentTerms = [...(contractData.payment_terms || [])];
    if (editingPaymentIndex !== null && editingPaymentIndex >= 0 && editingPaymentIndex < currentTerms.length) {
      currentTerms[editingPaymentIndex] = newTerm;
    } else {
      currentTerms.push(newTerm);
    }
    patchDraft({ payment_terms: currentTerms });
    setPaymentDialogOpen(false);
    setEditingPaymentIndex(null);
  };

  const applyPaymentPreset = (presetType: "100_completion" | "20_80" | "monthly") => {
    let terms: any[] = [];
    if (presetType === "100_completion") {
      terms = [{ id: Math.random().toString(36).slice(2), name: "100% Payment on Completion and Acceptance", payment_type: "milestone", pcnt_milestone: 100, period: "Net 30" }];
    } else if (presetType === "20_80") {
      terms = [
        { id: Math.random().toString(36).slice(2), name: "20% Advance Payment upon Contract Signing", payment_type: "advance", pcnt_milestone: 20, period: "Immediate" },
        { id: Math.random().toString(36).slice(2), name: "80% Final Payment upon Delivery and Acceptance", payment_type: "final", pcnt_milestone: 80, period: "Net 30" },
      ];
    } else if (presetType === "monthly") {
      terms = [{ id: Math.random().toString(36).slice(2), name: "Equal Monthly Invoicing based on Milestones", payment_type: "monthly", period: "Monthly (Net 30)" }];
    }
    patchDraft({ payment_terms: terms });
  };

  // ── Delivery Milestones inline form handlers ──
  const openAddDeliveryDialog = () => {
    setEditingDeliveryIndex(null);
    setDeliveryForm({ name: "", details: "", schedule_type: "milestone", schedule_date: "", pcnt_milestone: "", amt_milestone: "" });
    setDeliveryDialogOpen(true);
  };

  const openEditDeliveryDialog = (index: number) => {
    const item = contractData.delivery_milestones?.[index];
    if (!item) return;
    setEditingDeliveryIndex(index);
    setDeliveryForm({
      name: item.name || item.deliverable_name || "",
      details: item.details || "",
      schedule_type: item.schedule_type || "milestone",
      schedule_date: item.schedule_date || "",
      pcnt_milestone: item.pcnt_milestone != null ? String(item.pcnt_milestone) : "",
      amt_milestone: item.amt_milestone != null ? String(item.amt_milestone) : "",
    });
    setDeliveryDialogOpen(true);
  };

  const handleDeleteDeliveryMilestone = (index: number) => {
    const currentMilestones = [...(contractData.delivery_milestones || [])];
    currentMilestones.splice(index, 1);
    patchDraft({ delivery_milestones: currentMilestones });
  };

  const handleSaveDeliveryMilestone = () => {
    if (!deliveryForm.name.trim()) {
      toast({ title: "Name required", description: "Please enter deliverable milestone name.", variant: "destructive" });
      return;
    }
    const newMile = {
      id: editingDeliveryIndex !== null && contractData.delivery_milestones?.[editingDeliveryIndex]?.id
        ? contractData.delivery_milestones[editingDeliveryIndex].id
        : Math.random().toString(36).slice(2),
      name: deliveryForm.name.trim(),
      deliverable_name: deliveryForm.name.trim(),
      details: deliveryForm.details.trim() || null,
      schedule_type: deliveryForm.schedule_type || "milestone",
      schedule_date: deliveryForm.schedule_date || null,
      pcnt_milestone: deliveryForm.pcnt_milestone ? parseFloat(deliveryForm.pcnt_milestone) : null,
      amt_milestone: deliveryForm.amt_milestone ? parseFloat(deliveryForm.amt_milestone) : null,
    };
    const currentMilestones = [...(contractData.delivery_milestones || [])];
    if (editingDeliveryIndex !== null && editingDeliveryIndex >= 0 && editingDeliveryIndex < currentMilestones.length) {
      currentMilestones[editingDeliveryIndex] = newMile;
    } else {
      currentMilestones.push(newMile);
    }
    patchDraft({ delivery_milestones: currentMilestones, include_delivery: "Y" });
    setDeliveryDialogOpen(false);
    setEditingDeliveryIndex(null);
  };

  // ── Special Clauses inline form handlers ──
  const addPresetClause = (preset: typeof CLAUSE_PRESETS[0]) => {
    const currentClauses = [...(contractData.special_clauses || [])];
    if (currentClauses.some(c => (c.type || c.name) === preset.type)) {
      toast({ title: "Clause already added", description: `${preset.type} clause is already in the draft.` });
      return;
    }
    currentClauses.push({
      id: Math.random().toString(36).slice(2),
      type: preset.type,
      name: preset.type,
      content: preset.content,
    });
    patchDraft({ special_clauses: currentClauses });
  };

  const openAddClauseDialog = () => {
    setEditingClauseIndex(null);
    setClauseForm({ type: "Special Clause", content: "" });
    setClauseDialogOpen(true);
  };

  const openEditClauseDialog = (index: number) => {
    const item = contractData.special_clauses?.[index];
    if (!item) return;
    setEditingClauseIndex(index);
    setClauseForm({
      type: item.type || item.name || "Special Clause",
      content: item.content || item.text || "",
    });
    setClauseDialogOpen(true);
  };

  const handleDeleteClause = (index: number) => {
    const currentClauses = [...(contractData.special_clauses || [])];
    currentClauses.splice(index, 1);
    patchDraft({ special_clauses: currentClauses });
  };

  const handleSaveSpecialClause = () => {
    if (!clauseForm.content.trim()) {
      toast({ title: "Content required", description: "Please enter clause content.", variant: "destructive" });
      return;
    }
    const newClause = {
      id: editingClauseIndex !== null && contractData.special_clauses?.[editingClauseIndex]?.id
        ? contractData.special_clauses[editingClauseIndex].id
        : Math.random().toString(36).slice(2),
      type: clauseForm.type.trim() || "Special Clause",
      name: clauseForm.type.trim() || "Special Clause",
      content: clauseForm.content.trim(),
    };
    const currentClauses = [...(contractData.special_clauses || [])];
    if (editingClauseIndex !== null && editingClauseIndex >= 0 && editingClauseIndex < currentClauses.length) {
      currentClauses[editingClauseIndex] = newClause;
    } else {
      currentClauses.push(newClause);
    }
    patchDraft({ special_clauses: currentClauses });
    setClauseDialogOpen(false);
    setEditingClauseIndex(null);
  };

  // Cancel the in-flight (simulated) response.
  const stopProcessing = () => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    setIsProcessing(false);
  };

  const resetDialog = () => {
    setSourceDialogOpen(false);
    setSelectedSource(null);
    setDialogStep(1);
    setRecordSearch("");
    setSelectedRecord(null);
  };

  // Start a Co-Pilot session — blank, or seeded with an imported PR/Bid draft.
  const beginCopilot = (source: CopilotSource, initialDraft?: Record<string, any>, summary?: string) => {
    setCopilotMode(true);
    setCopilotComplete(false);
    setCopilotSource(source);
    const seededDraft = { ...(initialDraft || {}), _source: source };
    setContractData(seededDraft);
    setDocPreviewHtml("");
    setActiveStepKey(null);
    setConversation([
      { role: "assistant", content: summary || COPILOT_WELCOME[source], timestamp: new Date() },
    ]);
    resetDialog();
    if (seededDraft?.title) generateDocument(seededDraft);
  };

  const handleDialogContinue = async () => {
    if (!selectedSource) return;
    if (selectedSource === "scratch") { beginCopilot("scratch"); return; }
    if (dialogStep === 1) { setDialogStep(2); setRecordSearch(""); setSelectedRecord(null); return; }
    if (!selectedRecord) return;

    setIsImporting(true);
    try {
      let draft: any, summary: string;
      if (selectedSource === "pr") {
        const res = await apiRequest("POST", "/api/contracts/copilot/from-pr", { prNumber: selectedRecord.pr_number });
        draft = (await parseJsonResponse<{ draft: any }>(res)).draft;
        summary = `Imported **${selectedRecord.pr_number}** — ${draft.scope_of_work?.length || 0} line item(s)${draft.contract_amount ? `, total ${draft.currency} ${draft.contract_amount}` : ""}. Choose the supplier and contract type on the left, then refine here and Save.`;
      } else {
        const res = await apiRequest("POST", "/api/contracts/copilot/from-bid", { awardId: selectedRecord.award_id });
        draft = (await parseJsonResponse<{ draft: any }>(res)).draft;
        summary = `Imported **${selectedRecord.title}** awarded to **${draft.supplier_name || "supplier"}** — supplier profile filled (no entry needed), ${draft.scope_of_work?.length || 0} awarded line(s)${draft.special_clauses?.length ? `, ${draft.special_clauses.length} clause(s)` : ""}${draft.contract_amount ? `, total ${draft.currency} ${draft.contract_amount}` : ""}. Review on the left, refine here, then Save.`;
      }
      beginCopilot(selectedSource, draft, summary);
    } catch {
      toast({ title: "Import failed", description: "Couldn't load that record. Please try another.", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  // Reset only the Co-Pilot builder UI — never clears `conversation` (that would
  // persist an empty array over the saved chat, destroying its history entry).
  const resetCopilotState = () => {
    setCopilotMode(false);
    setCopilotComplete(false);
    setCopilotSource(null);
    setEditingContractId(null);
    setContractData({});
    setDocPreviewHtml("");
    setActiveStepKey(null);
  };

  // "Exit" / "New Chat": drop the builder and start a fresh conversation, keeping
  // the current one in history (newConversation no-ops if the chat is already empty).
  const exitCopilot = () => {
    resetCopilotState();
    newConversation();
  };

  // Open a past conversation from the History sidebar.
  const handleSwitchConversation = (id: number) => {
    resetCopilotState();
    switchConversation(id);
  };

  // Render the accumulated draft as a live HTML document via the Co-Pilot backend.
  // `interactive: true` turns on the in-preview click/highlight-to-select script.
  const generateDocument = async (data: Record<string, any> = contractData) => {
    if (!data.title) return;
    setIsGeneratingDoc(true);
    try {
      const res = await apiRequest("POST", "/api/contracts/copilot/generate-doc", { contractData: data, interactive: true });
      const out = await parseJsonResponse<{ html?: string }>(res);
      setDocPreviewHtml(out.html || "");
    } catch {
      // silent — preview is best-effort
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  // Write a section's edited HTML (from the toolbar or a scoped AI edit) back into
  // contractData so it survives the next full regeneration. Tier-1 sections (backed
  // by a real contractData field) are written straight into that field; Tier-2
  // sections (template-generated: payment/delivery tables, title/glossary/intro/
  // signatory/SOW) go into `_content_overrides`, guarded by a fingerprint of the
  // generated HTML they were made against (see contract-document-template.ts).
  const applySectionHtml = (sectionKey: string, html: string, fingerprint?: string) => {
    setContractData((prev) => {
      if (sectionKey.startsWith("special_clause:")) {
        const id = sectionKey.slice("special_clause:".length);
        return {
          ...prev,
          special_clauses: (prev.special_clauses || []).map((c: any) => (c.id === id ? { ...c, content: html } : c)),
        };
      }
      if (sectionKey.startsWith("term:")) {
        const id = sectionKey.slice("term:".length);
        return {
          ...prev,
          terms: (prev.terms || []).map((t: any, i: number) => ((t.id || `i${i + 1}`) === id ? { ...t, content: html } : t)),
        };
      }
      if (sectionKey === "inspection") return { ...prev, inspection_criteria: html };
      if (sectionKey === "failure") return { ...prev, failure_obligations: html };
      if (sectionKey.startsWith("clause:")) {
        const id = sectionKey.slice("clause:".length);
        return {
          ...prev,
          _loaded_clauses: (prev._loaded_clauses || []).map((c: any) => (c.id === id ? { ...c, term_details: html } : c)),
        };
      }
      return {
        ...prev,
        _content_overrides: {
          ...(prev._content_overrides || {}),
          [sectionKey]: { html, base_fingerprint: fingerprint ?? "" },
        },
      };
    });
  };

  // Kept in sync so the debounced regen below (fired well after the triggering
  // render) always sees the latest merged contractData, not a stale closure.
  const contractDataRef = useRef(contractData);
  useEffect(() => { contractDataRef.current = contractData; }, [contractData]);
  const formatRegenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Floating-toolbar formatting: mutate the live iframe DOM instantly, persist the
  // serialized section HTML, and — only for size/font changes, which can shift
  // pagination — silently re-paginate a moment later (bold/italic/underline/color
  // never change layout, so they skip the regen).
  const handleToolbarFormat = (cmd: FormatCommand) => {
    if (isGeneratingDoc || !selection) return;
    const html = applyFormat(cmd);
    if (html == null) return;
    const info = getSectionHtml(selection.sectionKey);
    applySectionHtml(selection.sectionKey, html, info?.fingerprint);
    if (cmd.type === "fontFamily" || cmd.type === "fontSize") {
      if (formatRegenTimerRef.current) clearTimeout(formatRegenTimerRef.current);
      formatRegenTimerRef.current = setTimeout(() => generateDocument(contractDataRef.current), 1500);
    }
  };

  // Direct manual typing: enter contentEditable on the selected section, then on
  // blur persist the edited HTML through the same path as formatting/AI edits and
  // re-paginate once typing is done. Never regenerate mid-edit — the pagination
  // script clones section nodes into new pages and would rip focus out from under
  // the user's cursor.
  const handleEditText = () => {
    if (!selection) return;
    const info = getSectionHtml(selection.sectionKey);
    beginTextEdit((html) => {
      applySectionHtml(selection.sectionKey, html, info?.fingerprint);
      if (formatRegenTimerRef.current) clearTimeout(formatRegenTimerRef.current);
      formatRegenTimerRef.current = setTimeout(() => generateDocument(contractDataRef.current), 1200);
    });
  };

  // Word-like editing: enter edit mode the moment a section is selected — no extra
  // "Edit text" click. Keyed on sectionKey only, so re-dragging a sub-range inside the
  // same already-editable section doesn't re-trigger (that's just native contentEditable
  // behavior at that point).
  useEffect(() => {
    if (selection) handleEditText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.sectionKey]);

  // ── Capability tools ──────────────────────────────────────────────────────────
  // Renewals: filter the visible contract list to those expiring within the window,
  // then ask the agent for a per-contract renewal action note.
  const runRenewals = async (windowDays: 30 | 60 | 90) => {
    if (isProcessing) return;
    setCapAction("renewal");
    setConversation(prev => [
      ...prev,
      { role: "user", content: `Check renewal alerts for the next ${windowDays} days`, timestamp: new Date() },
    ]);
    setIsProcessing(true);
    try {
      const res = await apiRequest("GET", "/api/contracts/list");
      const raw = res.ok ? await parseJsonResponse<any>(res) : [];
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const now = Date.now();
      const items = list
        .map((c: any) => {
          const end = c.end_date ? new Date(c.end_date).getTime() : NaN;
          const days_left = Number.isNaN(end) ? null : Math.ceil((end - now) / 86400000);
          return { id: c.id, title: c.title || c.contr_ref_no || `Contract ${c.id}`, status: c.status, days_left };
        })
        .filter((c: any) => c.days_left != null && c.days_left >= 0 && c.days_left <= windowDays
          && !["Expired", "Terminated", "Cancelled", "Deleted"].includes(c.status))
        .sort((a: any, b: any) => a.days_left - b.days_left);

      let notes: Record<string, string> = {};
      if (items.length > 0) {
        try {
          const nres = await apiRequest("POST", "/api/contracts/copilot/renewal-notes", {
            contracts: items.map((c: any) => ({ id: c.id, title: c.title, days_left: c.days_left, status: c.status })),
          });
          notes = (await parseJsonResponse<any>(nres)).notes || {};
        } catch { /* notes are best-effort */ }
      }
      const resultItems = items.map((c: any) => ({ ...c, note: notes[String(c.id)] }));
      setConversation(prev => [
        ...prev,
        {
          role: "assistant",
          content: `${items.length} contract(s) expiring within ${windowDays} days.`,
          timestamp: new Date(),
          contractToolResult: { type: "renewal", window: windowDays, items: resultItems },
        },
      ]);
    } catch {
      toast({ title: "Renewal Alerts failed", description: "Couldn't load contracts.", variant: "destructive" });
      setConversation(prev => [
        ...prev,
        { role: "assistant", content: `Sorry — Renewal Alerts failed for the next ${windowDays} days.`, timestamp: new Date() },
      ]);
    } finally {
      setIsProcessing(false);
      setCapAction(null);
    }
  };

  // Launch a capability: extract/risk/redline open the contract picker; renewals run directly.
  const launchCapability = (action: CapAction) => {
    if (copilotMode || isProcessing) return;
    setCapAction(action);
    if (action === "renewal") { runRenewals(90); return; }
    setCapSearch("");
    setCapDialogOpen(true);
  };

  // "Edit Live": load an already-saved contract's real content into the same
  // WYSIWYG builder UI used for drafts (iframe + toolbar + edit-section), so text
  // can be edited in place. Save routes to the update endpoint, not create.
  const openContractForLiveEdit = async (contract: any) => {
    if (isProcessing) return;
    setCapDialogOpen(false);
    setCapAction(null);
    const title = contract.title || contract.contr_ref_no || `Contract ${contract.id}`;
    setIsProcessing(true);
    try {
      const res = await apiRequest("POST", "/api/contracts/copilot/from-contract", { contractId: contract.id });
      const data = await parseJsonResponse<{ id: number; draft: Record<string, any> }>(res);
      setCopilotMode(true);
      setCopilotComplete(true);
      setCopilotSource(null);
      setEditingContractId(String(data.id));
      const seeded: Record<string, any> = { ...data.draft, _source: "existing" };
      setContractData(seeded);
      setActiveStepKey(null);
      setConversation([{
        role: "assistant",
        content: `Opened "${title}" for live editing. Select any text or section in the document to format it or ask me to rewrite it.`,
        timestamp: new Date(),
      }]);
      if (seeded.title) generateDocument(seeded);
    } catch {
      toast({ title: "Couldn't open contract", description: "Please try another.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  // Run extract/risk/redline against the chosen contract.
  const runOnContract = async (contract: any) => {
    if (!capAction || capAction === "renewal" || isProcessing) return;
    const action = capAction;
    setCapDialogOpen(false);
    setCapAction(null);
    const title = contract.title || contract.contr_ref_no || `Contract ${contract.id}`;
    setConversation(prev => [
      ...prev,
      { role: "user", content: `Run ${CAP_LABEL[action]} on "${title}"`, timestamp: new Date() },
    ]);
    setIsProcessing(true);
    try {
      if (action === "extract") {
        const res = await apiRequest("POST", "/api/contracts/copilot/extract-clauses", { contractId: contract.id });
        const data = await parseJsonResponse<any>(res);
        const content = `Extracted ${data.clauses?.length || 0} clause(s) from "${title}".${data.note ? ` ${data.note}` : ""}`;
        const resultPayload: ContractToolResult = {
          type: "extract",
          contractId: contract.id,
          title,
          clauses: data.clauses || [],
          note: data.note,
        };
        setConversation(prev => [
          ...prev,
          { role: "assistant", content, timestamp: new Date(), contractToolResult: resultPayload },
        ]);
      } else if (action === "risk") {
        const res = await apiRequest("POST", `/api/contracts/${contract.id}/ai-analysis`, {});
        const data = await parseJsonResponse<any>(res);
        const content = `Risk analysis for "${title}" — overall ${data.riskLevel || "?"} (${data.riskScore ?? "?"}/10), ${data.redFlags?.length || 0} red flag(s).`;
        const resultPayload: ContractToolResult = {
          type: "risk",
          title,
          summary: data.summary,
          riskScore: data.riskScore,
          riskLevel: data.riskLevel,
          risks: data.risks ? {
            financial: data.risks.financial ? { score: data.risks.financial.score } : undefined,
            compliance: data.risks.compliance ? { score: data.risks.compliance.score } : undefined,
            delivery: data.risks.delivery ? { score: data.risks.delivery.score } : undefined,
          } : undefined,
          keyPoints: data.keyPoints,
          redFlags: data.redFlags,
          signatoryNote: data.signatoryNote,
        };
        setConversation(prev => [
          ...prev,
          { role: "assistant", content, timestamp: new Date(), contractToolResult: resultPayload },
        ]);
      } else if (action === "redline") {
        const res = await apiRequest("POST", "/api/contracts/copilot/redline", { contractId: contract.id });
        const data = await parseJsonResponse<any>(res);
        const content = `Generated ${data.suggestions?.length || 0} redline suggestion(s) for "${title}".${data.note ? ` ${data.note}` : ""}`;
        const resultPayload: ContractToolResult = {
          type: "redline",
          title,
          suggestions: data.suggestions || [],
          note: data.note,
        };
        setConversation(prev => [
          ...prev,
          { role: "assistant", content, timestamp: new Date(), contractToolResult: resultPayload },
        ]);
      }
    } catch {
      toast({ title: `${CAP_LABEL[action]} failed`, description: "Couldn't analyze that contract. Please try another.", variant: "destructive" });
      setConversation(prev => [
        ...prev,
        { role: "assistant", content: `Sorry — ${CAP_LABEL[action]} failed for "${title}".`, timestamp: new Date() },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim() || isProcessing) return;

    const userMessage: ConversationMessage = {
      role: "user",
      content: prompt,
      timestamp: new Date(),
      mentions: streamMentions.mentions,
      businessUserMentions: streamMentions.businessUserMentions,
      itemMentions: streamMentions.itemMentions,
      bidMentions: streamMentions.bidMentions,
      prMentions: streamMentions.prMentions,
      poMentions: streamMentions.poMentions,
      invoiceMentions: streamMentions.invoiceMentions,
    };
    if (copilotMode && selection) {
      userMessage.scopedEdit = { sectionKey: selection.sectionKey, label: selection.label, selectedText: selection.selectedText };
    }
    const nextConversation = [...conversation, userMessage];
    setConversation(nextConversation);
    const apiPrompt = applyAllMentionsToPrompt(prompt, streamMentions);
    resetMentions();
    setIsProcessing(true);

    // ── Scoped edit: a part of the live preview is selected, so the instruction
    // targets only that section instead of driving the whole builder conversation ──
    if (copilotMode && selection) {
      const info = getSectionHtml(selection.sectionKey);
      try {
        const res = await apiRequest("POST", "/api/contracts/copilot/edit-section", {
          instruction: apiPrompt,
          target: { sectionKey: selection.sectionKey, label: selection.label, selectedText: selection.selectedText },
          currentHtml: info?.html || "",
          context: { title: contractData.title, contract_type: contractData.contract_type, currency: contractData.currency },
        });
        const data = await parseJsonResponse<{ message?: string; html?: string }>(res);
        if (data.html != null) {
          applySectionHtml(selection.sectionKey, data.html, info?.fingerprint);
          setSectionHtml(selection.sectionKey, data.html);
        }
        setConversation(prev => [...prev, {
          role: "assistant",
          content: data.message || "Updated.",
          timestamp: new Date(),
        }]);
      } catch {
        setConversation(prev => [...prev, {
          role: "assistant",
          content: "Sorry, I couldn't update that section. Please try again.",
          timestamp: new Date(),
        }]);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ── Editing an existing contract: edits only happen via a selection (above) —
    // there's no draft to build, so skip the guided-builder chat entirely. ──
    if (editingContractId) {
      setConversation(prev => [...prev, {
        role: "assistant",
        content: "Select some text or a section in the document above, then describe the change you'd like.",
        timestamp: new Date(),
      }]);
      setIsProcessing(false);
      return;
    }

    // ── Co-Pilot mode: drive the contract builder through this chat ──
    if (copilotMode) {
      try {
        const res = await apiRequest("POST", "/api/contracts/copilot/chat", {
          messages: nextConversation.map((m, idx) => ({
            role: m.role,
            content:
              idx === nextConversation.length - 1 && m.role === "user" ? apiPrompt : m.content,
          })),
          context: contractData,
        });
        const data = await parseJsonResponse<any>(res);

        setConversation(prev => [...prev, {
          role: "assistant",
          content: data.message || "Got it. I've updated your contract.",
          timestamp: new Date(),
        }]);
        const update = { ...(data.contract_update || {}) };
        if (Array.isArray(update.terms)) {
          update.terms = update.terms.map((t: any, i: number) => (t.id ? t : { ...t, id: `i${i + 1}` }));
        }
        const merged = { ...contractData, ...update };
        if (data.contract_update) setContractData(merged);
        if (data.is_complete) {
          setCopilotComplete(true);
          generateDocument(merged);
        }
      } catch {
        setConversation(prev => [...prev, {
          role: "assistant",
          content: "Sorry, I couldn't process that. Please try again.",
          timestamp: new Date(),
        }]);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // ── Default agent mode (LLM advisory assistant) ──
    try {
      const res = await apiRequest("POST", "/api/contracts/copilot/agent-chat", {
        messages: nextConversation.map((m, idx) => ({
          role: m.role,
          content:
            idx === nextConversation.length - 1 && m.role === "user" ? apiPrompt : m.content,
        })),
      });
      const data = await parseJsonResponse<{ message?: string }>(res);
      setConversation(prev => [...prev, {
        role: "assistant",
        content: data.message || "Sorry, I couldn't generate a response. Please try again.",
        timestamp: new Date(),
      }]);
    } catch {
      setConversation(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I couldn't process that. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Persist live edits back to an already-saved contract (Edit Live mode) —
  // updates clause text + Tier-2 section overrides only, not a new contract.
  const handleSaveExistingContract = async () => {
    if (!editingContractId) return;
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/contracts/copilot/${editingContractId}/save`, { contractData });
      toast({ title: "Changes saved" });
      navigate(`/app/contracts/${editingContractId}`);
    } catch {
      toast({ title: "Failed to save changes", variant: "destructive" });
    } finally {
      setIsSaving(false);
      document.body.style.pointerEvents = "";
    }
  };

  const handleSaveDraft = async () => {
    if (!contractData.title) {
      toast({ title: "Not enough info yet", description: "Give the contract a title in the chat first.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const reviewerIds = (contractData.reviewers || []).map((r: any) => r.id);
      const res = await apiRequest("POST", "/api/contracts/copilot/save", {
        contractData,
        supplierId: contractData.supplier_id ?? null,
        supplierName: contractData.supplier_name ?? "",
        reviewerIds,
      });
      const data = await parseJsonResponse<{ id: number }>(res);
      // Guard against a duplicate contract if the user stays on this page and saves
      // again — any further save now routes through the update endpoint, not create.
      setEditingContractId(String(data.id));
      toast({ title: "Contract saved as Draft", description: `Contract ID: ${data.id}` });
      navigate(`/app/contracts/${data.id}`);
    } catch {
      toast({ title: "Failed to save contract", variant: "destructive" });
    } finally {
      setIsSaving(false);
      document.body.style.pointerEvents = "";
    }
  };

  const handleSaveAndSubmit = async () => {
    if (!contractData.title) {
      toast({ title: "Not enough info yet", description: "Give the contract a title in the chat first.", variant: "destructive" });
      return;
    }

    const reviewersList = contractData.reviewers || [];
    if (reviewersList.length === 0) {
      toast({
        title: "Review Team required",
        description: "Please add at least one Review Team member before submitting for review.",
        variant: "destructive",
      });
      setActiveStepKey("reviewers");
      return;
    }

    setIsSaving(true);
    let savedContractId: number | null = null;

    try {
      const reviewerIds = reviewersList.map((r: any) => r.id);
      const res = await apiRequest("POST", "/api/contracts/copilot/save", {
        contractData,
        supplierId: contractData.supplier_id ?? null,
        supplierName: contractData.supplier_name ?? "",
        reviewerIds,
      });
      const data = await parseJsonResponse<{ id: number }>(res);
      savedContractId = data.id;
      // Guard against a duplicate contract if the user stays on this page and saves
      // again — any further save now routes through the update endpoint, not create.
      setEditingContractId(String(savedContractId));
    } catch {
      toast({ title: "Failed to save contract", variant: "destructive" });
      setIsSaving(false);
      return;
    }

    try {
      const submitRes = await apiRequest("PATCH", `/api/contracts/${savedContractId}/submit`, {});
      if (!submitRes.ok) {
        const errJson = await parseJsonResponse<any>(submitRes).catch(() => ({}));
        throw new Error(errJson.error || errJson.message || "Submission failed");
      }
      toast({ title: "Contract submitted for review", description: `Contract ID: ${savedContractId}` });
      navigate(`/app/contracts/${savedContractId}`);
    } catch (err: any) {
      toast({
        title: "Draft saved, not submitted",
        description: err?.message || "Contract saved as Draft, but submission for review failed.",
        variant: "destructive",
      });
      if (savedContractId) {
        navigate(`/app/contracts/${savedContractId}`);
      }
    } finally {
      setIsSaving(false);
      document.body.style.pointerEvents = "";
    }
  };

  const canSave = copilotMode && !!contractData.title;

  // Contracts filtered for the capability picker.
  const capContracts = contractsList.filter((c: any) => {
    const q = capSearch.trim().toLowerCase();
    if (!q) return true;
    return [c.title, c.contr_ref_no, c.vendor_names, c.status].some((v: any) => String(v ?? "").toLowerCase().includes(q));
  });



  return (
    <div className="px-4 pt-2 pb-3 flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      <div className="flex items-center justify-between flex-wrap gap-1 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen((p) => !p)} data-testid="button-toggle-history">
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <Link href="/app/ai-agents">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30">
                <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              Contracting Agent
            </h1>
            <p className="text-sm text-muted-foreground">
              {editingContractId
                ? `Editing "${contractData.title || "contract"}" live`
                : copilotMode
                ? "Co-Pilot: building a new contract through chat"
                : "Extract clauses, flag risks, track renewals, and suggest redlines"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editingContractId ? (
            <>
              <Button size="sm" onClick={handleSaveExistingContract} disabled={isSaving} className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-save-existing-contract">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
              <Button size="sm" variant="ghost" onClick={exitCopilot} className="gap-1.5" data-testid="button-exit-copilot">
                <X className="h-4 w-4" /> Exit
              </Button>
            </>
          ) : copilotMode ? (
            <>
              <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={isSaving || !canSave} className="gap-1.5" data-testid="button-save-copilot-draft">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Draft
              </Button>
              <Button size="sm" onClick={handleSaveAndSubmit} disabled={isSaving || !canSave} className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-submit-copilot-review">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Save & Submit for Review
              </Button>
              <Button size="sm" variant="ghost" onClick={exitCopilot} className="gap-1.5" data-testid="button-exit-copilot">
                <X className="h-4 w-4" /> Exit
              </Button>
            </>
          ):
           (
            <>
            {/*<Button size="sm" variant="outline" onClick={() => setSourceDialogOpen(true)} className="gap-1.5" data-testid="button-launch-copilot">
              <Sparkles className="h-4 w-4 text-violet-600" /> contract co-pilot
            </Button> */}
            </>
          )}
          <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3 w-3" />
            Active
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
        {/* ── Conversation History sidebar ── */}
        {sidebarOpen && (
          <Card className="w-56 flex-shrink-0 flex flex-col min-h-0 hidden lg:flex">
            <CardContent className="p-0 flex flex-col h-full">
              <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-semibold">History</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)}>
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="p-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={exitCopilot} data-testid="button-sidebar-new-chat">
                  <Plus className="h-3.5 w-3.5" />
                  New Chat
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-1 pb-2">
                {groupedConversations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center px-2 py-6">No past chats yet.</p>
                ) : groupedConversations.map((group) => (
                  <div key={group.label} className="mb-2">
                    <div className="text-xs text-muted-foreground px-2 py-1 font-medium">{group.label}</div>
                    {group.items.map((conv) => (
                      <div
                        key={conv.id}
                        className={cn(
                          "group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-md hover:bg-muted transition-colors",
                          currentId === conv.id && "bg-muted"
                        )}
                        onClick={() => handleSwitchConversation(conv.id)}
                        data-testid={`conv-item-${conv.id}`}
                      >
                        <MessageSquare className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-xs truncate">{conv.title || "New Chat"}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                          data-testid={`button-delete-conv-${conv.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      <div className={cn("flex-1 min-w-0 grid grid-cols-1 gap-3 min-h-0 overflow-hidden", copilotMode ? "lg:grid-cols-2" : "lg:grid-cols-3")}>
        <div className={cn("flex flex-col min-h-0", !copilotMode && "lg:col-span-2")}>
          <Card className="flex-grow flex flex-col min-h-0">
            <CardContent className="flex-1 p-4 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {conversation.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                      <Bot className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Contracting Agent</h3>
                    <p className="text-sm text-muted-foreground max-w-md mb-4">
                      I can help you analyze contracts, extract key terms, identify risks, and track renewals —
                      or build a brand-new contract with the AI Co-Pilot.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center mb-3">
                      {examplePrompts.slice(0, 3).map((ex, i) => (
                        <Button key={i} variant="outline" size="sm" className="text-xs" onClick={() => setPromptText(ex)}>
                          {ex.length > 40 ? ex.substring(0, 40) + "..." : ex}
                        </Button>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSourceDialogOpen(true)} data-testid="button-empty-launch-copilot">
                      <Sparkles className="h-4 w-4 text-violet-600" /> Start with AI Co-Pilot
                    </Button>
                  </div>
                ) : (
                  conversation.map((msg, i) => (
                    <div key={i} className="space-y-2">
                      <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 h-fit">
                            <Bot className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                        )}
                        <div className={`rounded-lg p-3 max-w-[80%] ${
                          msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}>
                          {msg.role === "user" && msg.scopedEdit && (
                            <Badge variant="secondary" className="mb-1.5 gap-1 text-[10px] bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/15">
                              <PenSquare className="h-2.5 w-2.5" /> Scoped: {msg.scopedEdit.label}
                            </Badge>
                          )}
                          {msg.role === "user" ? (
                            <SourcingUserMessageBubbleContent
                              content={msg.content}
                              mentions={msg.mentions}
                              businessUserMentions={msg.businessUserMentions}
                              itemMentions={msg.itemMentions}
                              bidMentions={msg.bidMentions}
                              prMentions={msg.prMentions}
                              poMentions={msg.poMentions}
                              invoiceMentions={msg.invoiceMentions}
                            />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          )}
                          <p className="text-xs opacity-60 mt-1">{formatDate(msg.timestamp)}</p>
                        </div>
                        {msg.role === "user" && (
                          <div className="p-1.5 rounded-lg bg-primary/10 h-fit">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>
                      {msg.role === "assistant" && msg.contractToolResult && (
                        <div className="ml-10 mt-2 max-w-[80%]">
                          <ContractToolResultCard
                            result={msg.contractToolResult}
                            onRerunRenewals={runRenewals}
                            disabled={isProcessing}
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}
                {isProcessing && (
                  <div className="flex gap-3">
                    <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 h-fit">
                      <Bot className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="rounded-lg p-3 bg-muted">
                      <ThinkingTips />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {!editingContractId && copilotMode && copilotComplete && canSave && (
                <div className="mb-3 flex items-center justify-between gap-2 flex-wrap rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-3 py-2">
                  <span className="text-xs text-violet-700 dark:text-violet-300 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Draft ready — "{contractData.title}"
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleSaveDraft} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Draft
                    </Button>
                    <Button size="sm" className="h-7 gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white" onClick={handleSaveAndSubmit} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Save & Submit for Review
                    </Button>
                  </div>
                </div>
              )}

              {!editingContractId && copilotMode && (
                <div className="mb-3 rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <span className="text-[11px] font-semibold text-muted-foreground mr-1">Guided setup:</span>
                    {guidedSteps.map((s, i) => {
                      const done = stepDone(s.key);
                      const active = currentStepKey === s.key;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setActiveStepKey(s.key)}
                          className={cn(
                            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                            active
                              ? "border-violet-400 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                              : done
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : "border-border text-muted-foreground hover:text-foreground"
                          )}
                          data-testid={`guided-chip-${s.key}`}
                        >
                          {done ? <CheckCircle2 className="h-3 w-3" /> : <span className="text-[9px] tabular-nums">{i + 1}</span>}
                          {s.label}
                        </button>
                      );
                    })}
                  </div>

                  {currentStepKey ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {guidedSteps.find(s => s.key === currentStepKey)?.hint}
                      </p>

                      {currentStepKey === "contract_type" && (
                        <div className="flex gap-2">
                          {[{ v: "goods", l: "Goods / Products" }, { v: "services", l: "Services" }].map(o => (
                            <Button
                              key={o.v}
                              size="sm"
                              variant={contractData.contract_type === o.v ? "default" : "outline"}
                              onClick={() => patchDraft({ contract_type: o.v }, { advance: true })}
                              data-testid={`guided-type-${o.v}`}
                            >
                              {o.l}
                            </Button>
                          ))}
                        </div>
                      )}

                      {currentStepKey === "title" && (
                        <div className="flex gap-2">
                          <Input
                            className="h-8 text-sm"
                            placeholder="e.g. IT Support Services Agreement"
                            value={contractData.title ?? ""}
                            onChange={e => setContractData(prev => ({ ...prev, title: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter" && contractData.title) patchDraft({ title: contractData.title }, { advance: true }); }}
                            data-testid="guided-title"
                          />
                          <Button size="sm" disabled={!contractData.title} onClick={() => patchDraft({ title: contractData.title }, { advance: true })}>
                            Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </div>
                      )}

                      {currentStepKey === "supplier" && (
                        <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full justify-between h-8 text-sm font-normal" data-testid="guided-supplier">
                              {contractData.supplier_name || "Select supplier"}
                              <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput placeholder="Search suppliers..." value={supplierSearch} onValueChange={setSupplierSearch} />
                              <CommandList>
                                <CommandEmpty>No suppliers found.</CommandEmpty>
                                <CommandGroup>
                                  {suppliers.map((s: any) => (
                                    <CommandItem
                                      key={s.id}
                                      value={String(s.id)}
                                      onSelect={() => {
                                        patchDraft({ supplier_id: s.id, supplier_name: supplierLabel(s) }, { advance: true });
                                        setSupplierOpen(false);
                                        setSupplierSearch("");
                                      }}
                                      data-testid={`guided-supplier-option-${s.id}`}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", contractData.supplier_id === s.id ? "opacity-100" : "opacity-0")} />
                                      <div>
                                        <p className="text-sm">{supplierLabel(s)}</p>
                                        {(s.email_id || s.supplier_contact_email) && (
                                          <p className="text-xs text-muted-foreground">{s.email_id || s.supplier_contact_email}</p>
                                        )}
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}

                      {currentStepKey === "dates" && (
                        <div className="flex items-end gap-2">
                          <div className="space-y-0.5">
                            <label className="text-[11px] text-muted-foreground">Start</label>
                            <Input
                              type="date"
                              className="h-8 text-sm"
                              value={contractData.start_date ?? ""}
                              onChange={e => setContractData(prev => ({ ...prev, start_date: e.target.value }))}
                              data-testid="guided-start-date"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[11px] text-muted-foreground">End</label>
                            <Input
                              type="date"
                              className="h-8 text-sm"
                              value={contractData.end_date ?? ""}
                              onChange={e => setContractData(prev => ({ ...prev, end_date: e.target.value }))}
                              data-testid="guided-end-date"
                            />
                          </div>
                          <Button size="sm" disabled={!contractData.start_date || !contractData.end_date} onClick={() => patchDraft({ start_date: contractData.start_date, end_date: contractData.end_date }, { advance: true })}>
                            Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </div>
                      )}

                      {currentStepKey === "currency" && (
                        <Select value={contractData.currency || undefined} onValueChange={(v) => patchDraft({ currency: v }, { advance: true })}>
                          <SelectTrigger className="h-8 text-sm w-40" data-testid="guided-currency">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}

                      {currentStepKey === "sow" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Line Items ({contractData.scope_of_work?.length || 0})</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAddSowDialog} data-testid="button-add-sow-line">
                              <Plus className="h-3.5 w-3.5" /> Add Line Item
                            </Button>
                          </div>

                          {(contractData.scope_of_work?.length || 0) > 0 ? (
                            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                              {contractData.scope_of_work.map((item: any, idx: number) => {
                                const qty = parseFloat(item.quantity || "0") || 0;
                                const cost = parseFloat(item.unit_cost || "0") || 0;
                                const tot = item.total_cost != null && item.total_cost !== "" ? parseFloat(item.total_cost) : qty * cost;
                                return (
                                  <div key={item.id || idx} className="flex items-start justify-between gap-2 p-2 rounded-md border bg-background text-xs">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                          {item.linetype || item.line_type || item.type || "Goods"}
                                        </Badge>
                                        <span className="font-medium truncate">{item.item_name || item.description}</span>
                                      </div>
                                      {item.description && item.description !== item.item_name && (
                                        <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
                                      )}
                                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                                        <span>Qty: {item.quantity} {item.uom || ""}</span>
                                        <span>Unit: {contractData.currency || "$"}{item.unit_cost}</span>
                                        <span className="font-semibold text-foreground">Total: {contractData.currency || "$"}{tot}</span>
                                      </div>
                                      {(item.start_date || item.deliverydate || item.specifications) && (
                                        <p className="text-[10px] text-muted-foreground mt-0.5 italic truncate">
                                          {[
                                            item.start_date ? `Start: ${item.start_date}` : null,
                                            item.deliverydate ? `Delivery: ${item.deliverydate}` : null,
                                            item.specifications ? `Specs: ${item.specifications}` : null,
                                          ].filter(Boolean).join(" | ")}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditSowDialog(idx)} data-testid={`edit-sow-${idx}`}>
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteSowItem(idx)} data-testid={`delete-sow-${idx}`}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic py-1">No line items added yet. Click "+ Add Line Item" to define products or services.</p>
                          )}

                          <div className="flex justify-end pt-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => setActiveStepKey(null)}>
                              Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {currentStepKey === "payment_terms" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Payment Milestones ({contractData.payment_terms?.length || 0})</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAddPaymentDialog} data-testid="button-add-payment-term">
                              <Plus className="h-3.5 w-3.5" /> Add Payment Term
                            </Button>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">Presets:</span>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 bg-muted/60" onClick={() => applyPaymentPreset("100_completion")}>
                              100% On Completion
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 bg-muted/60" onClick={() => applyPaymentPreset("20_80")}>
                              20% Advance / 80% Final
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 bg-muted/60" onClick={() => applyPaymentPreset("monthly")}>
                              Monthly Billing
                            </Button>
                          </div>

                          {(contractData.payment_terms?.length || 0) > 0 ? (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                              {contractData.payment_terms.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex items-center justify-between gap-2 p-2 rounded-md border bg-background text-xs">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium">{item.name || item.description}</span>
                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                      <Badge variant="outline" className="text-[9px] capitalize px-1">{item.payment_type || "milestone"}</Badge>
                                      {item.pcnt_milestone != null && <span>{item.pcnt_milestone}%</span>}
                                      {item.amt_milestone != null && <span>{contractData.currency || "$"}{item.amt_milestone}</span>}
                                      {item.period && <span>({item.period})</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditPaymentDialog(idx)}>
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeletePaymentTerm(idx)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic py-1">No payment terms added. Use a preset above or add custom terms.</p>
                          )}

                          <div className="flex justify-end pt-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => setActiveStepKey(null)}>
                              Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {currentStepKey === "delivery_inspection" && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">Delivery Milestones ({contractData.delivery_milestones?.length || 0})</span>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAddDeliveryDialog} data-testid="button-add-delivery-milestone">
                                <Plus className="h-3.5 w-3.5" /> Add Milestone
                              </Button>
                            </div>

                            {(contractData.delivery_milestones?.length || 0) > 0 && (
                              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                                {contractData.delivery_milestones.map((item: any, idx: number) => (
                                  <div key={item.id || idx} className="flex items-center justify-between gap-2 p-2 rounded-md border bg-background text-xs">
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium">{item.name || item.deliverable_name}</span>
                                      {item.details && <p className="text-[11px] text-muted-foreground truncate">{item.details}</p>}
                                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        {item.schedule_date && <span>Date: {item.schedule_date}</span>}
                                        {item.pcnt_milestone != null && <span>{item.pcnt_milestone}%</span>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDeliveryDialog(idx)}>
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteDeliveryMilestone(idx)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted-foreground">Inspection & Acceptance Criteria</label>
                            <Textarea
                              rows={2}
                              className="text-xs resize-none"
                              placeholder="e.g. Goods subject to quality inspection upon arrival at facility within 5 business days..."
                              value={contractData.inspection_criteria ?? ""}
                              onChange={(e) => setContractData(prev => ({ ...prev, inspection_criteria: e.target.value }))}
                              onBlur={() => patchDraft({ inspection_criteria: contractData.inspection_criteria })}
                            />
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-4 text-xs">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={contractData.include_delivery !== false}
                                  onChange={(e) => patchDraft({ include_delivery: e.target.checked })}
                                  className="rounded text-violet-600"
                                />
                                Delivery Required
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={contractData.include_inspection !== false}
                                  onChange={(e) => patchDraft({ include_inspection: e.target.checked })}
                                  className="rounded text-violet-600"
                                />
                                Inspection Required
                              </label>
                            </div>
                            <Button size="sm" className="h-7 text-xs" onClick={() => setActiveStepKey(null)}>
                              Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {currentStepKey === "special_clauses" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Special Clauses ({contractData.special_clauses?.length || 0})</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAddClauseDialog} data-testid="button-add-special-clause">
                              <Plus className="h-3.5 w-3.5" /> Custom Clause
                            </Button>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground block">Quick Add Standard Clauses:</span>
                            <div className="flex flex-wrap gap-1">
                              {CLAUSE_PRESETS.map((preset) => (
                                <Button
                                  key={preset.type}
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2 bg-background hover:bg-violet-50 hover:text-violet-700"
                                  onClick={() => addPresetClause(preset)}
                                >
                                  + {preset.label}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {(contractData.special_clauses?.length || 0) > 0 ? (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                              {contractData.special_clauses.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex items-start justify-between gap-2 p-2 rounded-md border bg-background text-xs">
                                  <div className="flex-1 min-w-0">
                                    <Badge variant="secondary" className="text-[9px] mb-0.5 px-1.5 py-0">{item.type || item.name}</Badge>
                                    <p className="text-[11px] line-clamp-2 text-muted-foreground">{item.content || item.text}</p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditClauseDialog(idx)}>
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteClause(idx)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic py-1">No special clauses added yet. Use quick-add chips above or add a custom clause.</p>
                          )}

                          <div className="flex justify-end pt-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => setActiveStepKey(null)}>
                              Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {currentStepKey === "reviewers" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Review Team Members ({contractData.reviewers?.length || 0})</span>
                            <Popover open={reviewerOpen} onOpenChange={setReviewerOpen}>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="button-add-reviewer">
                                  <UserCheck className="h-3.5 w-3.5 text-violet-600" /> + Add Reviewer
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[320px] p-0" align="end">
                                <Command shouldFilter={false}>
                                  <CommandInput placeholder="Search users by name or email..." value={reviewerSearch} onValueChange={setReviewerSearch} />
                                  <CommandList>
                                    <CommandEmpty>No users found.</CommandEmpty>
                                    <CommandGroup>
                                      {usersDropdown.map((u: any) => {
                                        const isSelected = (contractData.reviewers || []).some((r: any) => String(r.id) === String(u.id));
                                        return (
                                          <CommandItem
                                            key={u.id}
                                            value={String(u.id)}
                                            onSelect={() => handleAddReviewer(u)}
                                            data-testid={`reviewer-option-${u.id}`}
                                          >
                                            <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-medium truncate">{u.name}</p>
                                              <p className="text-[10px] text-muted-foreground truncate">{u.email} {u.department ? `· ${u.department}` : ""}</p>
                                            </div>
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>

                          {(contractData.reviewers?.length || 0) > 0 ? (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                              {contractData.reviewers.map((u: any, idx: number) => (
                                <div key={u.id || idx} className="flex items-center justify-between gap-2 p-2 rounded-md border bg-background text-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-7 w-7 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center font-semibold text-xs shrink-0">
                                      {u.name?.[0]?.toUpperCase() || "U"}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-xs truncate">{u.name}</p>
                                      <p className="text-[10px] text-muted-foreground truncate">{u.email || "No email"} {u.department ? `· ${u.department}` : ""}</p>
                                    </div>
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => handleRemoveReviewer(u.id)} data-testid={`remove-reviewer-${u.id}`}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic py-1">No reviewers added yet. Select team members who will review and approve this contract.</p>
                          )}

                          <div className="flex justify-end pt-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => setActiveStepKey(null)}>
                              Done <Check className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Essentials captured — click <span className="font-medium text-foreground">Save Draft</span> or <span className="font-medium text-foreground">Save & Submit for Review</span>.
                    </p>
                  )}
                </div>
              )}

              {copilotMode && selection && (
                <div className="mb-2 flex items-center gap-2 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-2.5 py-1.5 text-xs">
                  <PenSquare className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                  <span className="text-violet-700 dark:text-violet-300 font-medium shrink-0">Editing: {selection.label}</span>
                  {selection.kind === "text" && selection.selectedText && (
                    <span className="text-violet-600/70 dark:text-violet-400/70 truncate italic">
                      "{selection.selectedText.length > 60 ? selection.selectedText.slice(0, 60) + "…" : selection.selectedText}"
                    </span>
                  )}
                  <button
                    className="ml-auto shrink-0 text-violet-500 hover:text-violet-700 dark:hover:text-violet-300"
                    onClick={clearSelection}
                    data-testid="button-clear-preview-selection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="relative w-full flex-shrink-0" ref={mention.composerRef}>
              <ChatComposer
                isCompact
                singleRow
                ref={mention.inputRef}
                placeholder={
                  selection
                    ? `Describe the change to "${selection.label}"... ${AGENT_MENTION_PLACEHOLDER_HINT}`
                    : editingContractId ? `Select text or a section in the document to edit it... ${AGENT_MENTION_PLACEHOLDER_HINT}`
                    : copilotMode ? `Answer the Co-Pilot or add contract details... ${AGENT_MENTION_PLACEHOLDER_HINT}` : `Ask Prokraya Ai ${AGENT_MENTION_PLACEHOLDER_HINT}`
                }
                {...mention.composerProps}
                onSubmit={handleSend}
                onStop={stopProcessing}
                isStreaming={isProcessing}
                colorTheme="primary"
                submitButtonClassName="rounded-full h-9 w-9"
                textareaDataTestId="input-contracting-prompt"
                submitDataTestId="button-send-contracting"
                onMicTranscript={(t) => setPromptText(prompt ? `${prompt} ${t}` : t)}
              />
              {mention.dropdown}
              </div>
            </CardContent>
          </Card>
        </div>

        {copilotMode ? (
          <div className="flex flex-col min-h-0">
            <Card className="flex-grow flex flex-col min-h-0">
              <CardContent className="flex-1 p-0 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> Live Document Preview
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => generateDocument()} disabled={isGeneratingDoc || !contractData.title} data-testid="button-refresh-preview">
                    {isGeneratingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                  </Button>
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  {isGeneratingDoc ? (
                    <div className="flex items-center justify-center h-full p-4">
                      <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-violet-500" />
                        <p className="text-sm text-muted-foreground">Generating contract document...</p>
                      </div>
                    </div>
                  ) : docPreviewHtml ? (
                    <iframe
                      ref={previewIframeRef}
                      srcDoc={docPreviewHtml}
                      title="Contract document preview"
                      className="flex-1 w-full border-0 bg-white"
                      data-testid="contract-preview-frame"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full p-4">
                      <div className="text-center max-w-xs">
                        <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                        <h3 className="text-sm font-medium mb-1">No preview yet</h3>
                        <p className="text-xs text-muted-foreground mb-3">Answer the Co-Pilot's questions, then generate a live preview of the contract document.</p>
                        <Button size="sm" onClick={() => generateDocument()} disabled={!contractData.title || isGeneratingDoc}>
                          <Sparkles className="h-4 w-4 mr-1" /> Generate Preview
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            {toolbarPos && selection && (
              <ContractPreviewToolbar
                anchor={toolbarPos}
                onFormat={handleToolbarFormat}
                onClose={clearSelection}
              />
            )}
          </div>
        ) : (
        <div className="space-y-3 overflow-y-auto pr-1">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Contract Tools
              </h3>
              <div className="space-y-1.5">
                {capabilities.map((cap) => (
                  <button
                    key={cap.key}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => launchCapability(cap.key)}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-md border p-2.5 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/50 dark:hover:bg-violet-900/10",
                      isProcessing && "opacity-50 cursor-not-allowed"
                    )}
                    data-testid={`capability-${cap.key}`}
                  >
                    <div className="p-1 rounded bg-muted">
                      <cap.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{cap.label}</p>
                      <p className="text-xs text-muted-foreground">{cap.description}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium text-sm mb-3">Modules Covered</h3>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">Contracts</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">Human-in-the-Loop</p>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    All contract changes require your approval
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        )}
      </div>
      </div>

      {/* ── Source-selection dialog ── */}
      <Dialog open={sourceDialogOpen} onOpenChange={(o) => (o ? setSourceDialogOpen(true) : resetDialog())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-violet-600" />
              Create with AI Co-Pilot
            </DialogTitle>
            <DialogDescription>
              {dialogStep === 1
                ? "Choose how you want to start this contract"
                : selectedSource === "pr" ? "Select the Approved Purchase Requisition to import" : "Select the Awarded Bid to import"}
            </DialogDescription>
          </DialogHeader>

          {dialogStep === 1 ? (
            <div className="space-y-3 py-1">
              {SOURCE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = selectedSource === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSelectedSource(opt.key)}
                    className={cn(
                      "w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors",
                      selected ? opt.ringClass : "hover:border-muted-foreground/40"
                    )}
                    data-testid={`copilot-source-${opt.key}`}
                  >
                    <div className={cn("h-12 w-12 shrink-0 rounded-lg flex items-center justify-center", opt.iconClass)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{opt.title}</p>
                      <p className="text-sm text-muted-foreground">{opt.desc}</p>
                    </div>
                    <div className={cn(
                      "h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center",
                      selected ? "border-violet-500" : "border-muted-foreground/30"
                    )}>
                      {selected && <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-1">
              <Input
                placeholder={selectedSource === "pr" ? "Search approved PRs..." : "Search awarded bids / suppliers..."}
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                className="h-9 mb-2"
                data-testid="copilot-record-search"
              />
              <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                {records.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    {selectedSource === "pr" ? "No approved PRs found." : "No awarded bids found."}
                  </div>
                ) : records.map((r: any) => {
                  const selected = selectedRecord && recordKey(selectedRecord) === recordKey(r);
                  return (
                    <button
                      key={recordKey(r)}
                      type="button"
                      onClick={() => setSelectedRecord(r)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                        selected ? "border-violet-400 ring-1 ring-violet-300 dark:ring-violet-700" : "hover:border-muted-foreground/40"
                      )}
                      data-testid={`copilot-record-${recordKey(r)}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {selectedSource === "pr"
                            ? `${r.pr_number}${r.department ? ` · ${r.department}` : ""}`
                            : `BID ${r.bid_ref_no} · ${r.supplier_name}`}
                          {r.amount != null && r.amount !== "" ? ` · ${r.currency || ""} ${r.amount}` : ""}
                        </p>
                      </div>
                      <div className={cn(
                        "h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                        selected ? "border-violet-500" : "border-muted-foreground/30"
                      )}>
                        {selected && <div className="h-2 w-2 rounded-full bg-violet-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            {dialogStep === 2 ? (
              <Button variant="outline" onClick={() => { setDialogStep(1); setSelectedRecord(null); }} disabled={isImporting} data-testid="button-back-source">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            ) : (
              <Button variant="outline" onClick={resetDialog} data-testid="button-cancel-source">
                Cancel
              </Button>
            )}
            <Button
              onClick={handleDialogContinue}
              disabled={!selectedSource || (dialogStep === 2 && (!selectedRecord || isImporting))}
              className="gap-1.5"
              data-testid="button-continue-source"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {dialogStep === 2 ? "Import" : "Continue"} <ArrowRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contract picker for capability tools ── */}
      <Dialog open={capDialogOpen} onOpenChange={(o) => { if (o) { setCapDialogOpen(true); } else { setCapDialogOpen(false); setCapAction(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              {capAction ? CAP_LABEL[capAction] : "Select a contract"}
            </DialogTitle>
            <DialogDescription>Choose a contract to run this on.</DialogDescription>
          </DialogHeader>

          <div className="py-1">
            <Input
              placeholder="Search contracts..."
              value={capSearch}
              onChange={(e) => setCapSearch(e.target.value)}
              className="h-9 mb-2"
              data-testid="cap-contract-search"
            />
            <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
              {capContracts.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">No contracts found.</div>
              ) : capContracts.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => (capAction === "editLive" ? openContractForLiveEdit(c) : runOnContract(c))}
                  className="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-violet-400"
                  data-testid={`cap-contract-${c.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.title || c.contr_ref_no || `Contract ${c.id}`}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[c.contr_ref_no, c.status, c.vendor_names].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCapDialogOpen(false); setCapAction(null); }} data-testid="button-cancel-cap">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Scope of Work Line Item Dialog ── */}
      <Dialog open={sowDialogOpen} onOpenChange={setSowDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-violet-600" />
              {editingSowIndex !== null ? "Edit Line Item" : "Add Scope of Work Line Item"}
            </DialogTitle>
            <DialogDescription className="text-xs">Define contract product or service line details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-md">
              <Button
                type="button"
                size="sm"
                variant={sowItemMode === "master" ? "default" : "ghost"}
                className="flex-1 h-7 text-xs"
                onClick={() => setSowItemMode("master")}
              >
                From Item Master
              </Button>
              <Button
                type="button"
                size="sm"
                variant={sowItemMode === "custom" ? "default" : "ghost"}
                className="flex-1 h-7 text-xs"
                onClick={() => setSowItemMode("custom")}
              >
                Custom Entry
              </Button>
            </div>

            {sowItemMode === "master" && (
              <div className="space-y-1">
                <Label className="text-[11px]">Select Item Master</Label>
                <Select
                  value={sowForm.itemId || undefined}
                  onValueChange={(val) => {
                    const selected = itemMasterList.find((it: any) => String(it.id) === String(val));
                    if (selected) {
                      setSowForm(prev => ({
                        ...prev,
                        itemId: String(selected.id),
                        item_name: selected.name,
                        description: selected.name,
                        categoryCode: selected.categoryCode || "",
                        categoryName: selected.categoryName || "",
                        uom: selected.unitOfMeasure || prev.uom || "EA",
                        unit_cost: selected.standardPrice != null ? String(selected.standardPrice) : prev.unit_cost,
                      }));
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="sow-item-master-select">
                    <SelectValue placeholder="Choose item from catalog..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-48">
                    {itemMasterList.map((it: any) => (
                      <SelectItem key={it.id} value={String(it.id)} className="text-xs">
                        {it.name} {it.standardPrice != null ? `(${contractData.currency || "$"}${it.standardPrice})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 col-span-2">
                <Label className="text-[11px]">Item / Description *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Cloud Server Hosting / Software License"
                  value={sowForm.description}
                  onChange={(e) => setSowForm(prev => ({ ...prev, description: e.target.value, item_name: prev.item_name || e.target.value }))}
                  data-testid="sow-form-description"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Line Type</Label>
                <Select value={sowForm.linetype} onValueChange={(val) => setSowForm(prev => ({ ...prev, linetype: val }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="sow-form-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Goods">Goods</SelectItem>
                    <SelectItem value="Services">Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Category</Label>
                <Select
                  value={sowForm.categoryCode || undefined}
                  onValueChange={(val) => {
                    const cat = categories.find((c: any) => c.code === val);
                    setSowForm(prev => ({ ...prev, categoryCode: val, categoryName: cat?.name || "" }));
                  }}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="sow-form-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="max-h-40">
                    {categories.map((c: any) => (
                      <SelectItem key={c.code || c.id} value={c.code || c.name} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Quantity</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={sowForm.quantity}
                  onChange={(e) => setSowForm(prev => ({ ...prev, quantity: e.target.value }))}
                  data-testid="sow-form-qty"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">UOM</Label>
                <Select value={sowForm.uom || undefined} onValueChange={(val) => setSowForm(prev => ({ ...prev, uom: val }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="sow-form-uom">
                    <SelectValue placeholder="UOM" />
                  </SelectTrigger>
                  <SelectContent className="max-h-40">
                    {uomList.map((u: any) => (
                      <SelectItem key={u.id || u.description} value={u.description} className="text-xs">
                        {u.description}
                      </SelectItem>
                    ))}
                    <SelectItem value="EA">EA (Each)</SelectItem>
                    <SelectItem value="LOT">LOT</SelectItem>
                    <SelectItem value="HRS">HRS (Hours)</SelectItem>
                    <SelectItem value="MONTH">MONTH</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Unit Cost ({contractData.currency || "$"})</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="0.00"
                  value={sowForm.unit_cost}
                  onChange={(e) => setSowForm(prev => ({ ...prev, unit_cost: e.target.value }))}
                  data-testid="sow-form-unit-cost"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Total Cost</Label>
                <div className="h-8 px-3 rounded-md border bg-muted/30 flex items-center font-semibold text-xs text-foreground">
                  {contractData.currency || "$"}{((parseFloat(sowForm.quantity || "0") || 0) * (parseFloat(sowForm.unit_cost || "0") || 0)).toLocaleString()}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Start Date</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={sowForm.start_date}
                  onChange={(e) => setSowForm(prev => ({ ...prev, start_date: e.target.value }))}
                  data-testid="sow-form-start-date"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Delivery Date</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={sowForm.deliverydate}
                  onChange={(e) => setSowForm(prev => ({ ...prev, deliverydate: e.target.value }))}
                  data-testid="sow-form-delivery-date"
                />
              </div>

              <div className="space-y-1 col-span-2">
                <Label className="text-[11px]">Specifications / Details</Label>
                <Textarea
                  rows={2}
                  className="text-xs resize-none"
                  placeholder="Technical specifications, scope requirements..."
                  value={sowForm.specifications}
                  onChange={(e) => setSowForm(prev => ({ ...prev, specifications: e.target.value }))}
                  data-testid="sow-form-specs"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSowDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveSowItem} data-testid="button-save-sow-item">
              {editingSowIndex !== null ? "Update Line" : "Add Line Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Term Dialog ── */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-violet-600" />
              {editingPaymentIndex !== null ? "Edit Payment Term" : "Add Payment Term"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-[11px]">Term Description *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. 20% Advance Upon Signing"
                value={paymentForm.name}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, name: e.target.value }))}
                data-testid="payment-form-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Payment Type</Label>
                <Select value={paymentForm.payment_type} onValueChange={(val) => setPaymentForm(prev => ({ ...prev, payment_type: val }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advance">Advance</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="retention">Retention</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="final">Final</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Milestone %</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="e.g. 20"
                  value={paymentForm.pcnt_milestone}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, pcnt_milestone: e.target.value }))}
                  data-testid="payment-form-pcnt"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Milestone Amount ({contractData.currency || "$"})</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="0.00"
                  value={paymentForm.amt_milestone}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, amt_milestone: e.target.value }))}
                  data-testid="payment-form-amt"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Period / Payment Terms</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Net 30"
                  value={paymentForm.period}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, period: e.target.value }))}
                  data-testid="payment-form-period"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSavePaymentTerm} data-testid="button-save-payment-term">Save Term</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delivery Milestone Dialog ── */}
      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4 text-violet-600" />
              {editingDeliveryIndex !== null ? "Edit Delivery Milestone" : "Add Delivery Milestone"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-[11px]">Deliverable Name *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. Phase 1 Hardware Delivery"
                value={deliveryForm.name}
                onChange={(e) => setDeliveryForm(prev => ({ ...prev, name: e.target.value }))}
                data-testid="delivery-form-name"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Details / Scope</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Detailed description of deliverable"
                value={deliveryForm.details}
                onChange={(e) => setDeliveryForm(prev => ({ ...prev, details: e.target.value }))}
                data-testid="delivery-form-details"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Schedule Type</Label>
                <Select value={deliveryForm.schedule_type} onValueChange={(val) => setDeliveryForm(prev => ({ ...prev, schedule_type: val }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="acceptance">Acceptance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Target Date</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={deliveryForm.schedule_date}
                  onChange={(e) => setDeliveryForm(prev => ({ ...prev, schedule_date: e.target.value }))}
                  data-testid="delivery-form-date"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Milestone %</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="e.g. 50"
                  value={deliveryForm.pcnt_milestone}
                  onChange={(e) => setDeliveryForm(prev => ({ ...prev, pcnt_milestone: e.target.value }))}
                  data-testid="delivery-form-pcnt"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Milestone Amount ({contractData.currency || "$"})</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="0.00"
                  value={deliveryForm.amt_milestone}
                  onChange={(e) => setDeliveryForm(prev => ({ ...prev, amt_milestone: e.target.value }))}
                  data-testid="delivery-form-amt"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeliveryDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveDeliveryMilestone} data-testid="button-save-delivery-milestone">Save Milestone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Special Clause Dialog ── */}
      <Dialog open={clauseDialogOpen} onOpenChange={setClauseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileCheck className="h-4 w-4 text-violet-600" />
              {editingClauseIndex !== null ? "Edit Special Clause" : "Add Special Clause"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-[11px]">Clause Title / Type *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. Confidentiality, Governing Law, Indemnification"
                value={clauseForm.type}
                onChange={(e) => setClauseForm(prev => ({ ...prev, type: e.target.value }))}
                data-testid="clause-form-type"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Clause Content *</Label>
              <Textarea
                rows={4}
                className="text-xs resize-none"
                placeholder="Enter the full text of the clause..."
                value={clauseForm.content}
                onChange={(e) => setClauseForm(prev => ({ ...prev, content: e.target.value }))}
                data-testid="clause-form-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setClauseDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveSpecialClause} data-testid="button-save-special-clause">Save Clause</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
