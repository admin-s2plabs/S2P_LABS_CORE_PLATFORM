import RichTextEditor from "@/components/rich-text-editor";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent,
  DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription,
  SheetFooter,
  SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft, ChevronRight,
  FileSpreadsheet,
  FileText,
  Layers,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  Wand2,
  X,
  Zap
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  section_id: number;
  section_name: string;
  section_type: string;
  description: string | null;
  html_content: string | null;
  clause_ammendable: string | null;
  clause_negotiable: string | null;
  clause_mandatory: string | null;
  orderby: number | null;
  created_by: string | null;
  creation_date: string | null;
  last_modified_by: string | null;
  last_modified_date: string | null;
}

interface SectionResponse {
  data: Section[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface RiskResult {
  level: "Low" | "Medium" | "High";
  score: number;
  issues: string[];
  summary: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  generatedClause?: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const typeConfig: Record<string, { className: string }> = {
  Custom: { className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  Standard: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Legal: { className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Financial: { className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  Operational: { className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  Compliance: { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const riskConfig = {
  Low: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  Medium: { cls: "bg-amber-100 text-amber-700 border-amber-200", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  High: { cls: "bg-red-100 text-red-700 border-red-200", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

const CONTRACT_TYPES = [
  "Service Contract",
  "Supply Contract",
  "Maintenance Contract",
  "Rate Contract",
  "Consultancy Agreement",
  "Construction Contract",
  "NDA",
];

const IMPROVE_OPTIONS = [
  "Make more formal and professional",
  "Simplify the language",
  "Make supplier-friendly",
  "Make buyer-friendly",
  "Make more comprehensive",
  "Shorten it",
];

const emptyForm = {
  section_name: "", section_type: "", description: "", html_content: "",
  clause_ammendable: "No", clause_negotiable: "No", clause_mandatory: "No", orderby: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContractSections() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isAIEnabled } = useAISettings();

  // List state
  const [page, setPage] = useState(1);
  const limit = 10;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Sheet state
  const [showSheet, setShowSheet] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [deletingSection, setDeletingSection] = useState<Section | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // AI — Generate (new clause)
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generateContractType, setGenerateContractType] = useState("");
  const [showGeneratePanel, setShowGeneratePanel] = useState(false);

  // AI — Improve
  const [improveInstruction, setImproveInstruction] = useState("");
  const [showCustomImprove, setShowCustomImprove] = useState(false);

  // AI — Risk
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null);

  // AI — Duplicates
  const [duplicates, setDuplicates] = useState<any[]>([]);


  // AI — Extract from Document dialog
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [extractText, setExtractText] = useState("");
  const [extractedClauses, setExtractedClauses] = useState<any[]>([]);
  const [selectedExtracted, setSelectedExtracted] = useState<Set<number>>(new Set());

  // AI — Chat panel
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ─── Queries ─────────────────────────────────────────────────────────────

  const sectionTypes = Object.keys(typeConfig); // Custom, Standard, Legal, Financial, Operational, Compliance

  const { data, isLoading } = useQuery<SectionResponse>({
    queryKey: ["/api/contracts/sections", page, limit, search, typeFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", String(limit));
      if (search) p.set("search", search);
      if (typeFilter !== "all") p.set("type", typeFilter);
      return apiRequest("GET", `/api/contracts/sections?${p}`).then((r) => r.json());
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  // ─── CRUD Mutations ───────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/sections", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/sections"] });
      toast({ title: "Clause created successfully" });
      setShowSheet(false);
    },
    onError: () => toast({ title: "Failed to create clause", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiRequest("PUT", `/api/contracts/sections/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/sections"] });
      toast({ title: "Clause updated successfully" });
      setShowSheet(false);
    },
    onError: () => toast({ title: "Failed to update clause", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/contracts/sections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/sections"] });
      toast({ title: "Clause deleted" });
      setDeletingSection(null);
    },
    onError: () => toast({ title: "Failed to delete clause", variant: "destructive" }),
  });

  // ─── AI Mutations ─────────────────────────────────────────────────────────

  async function parseAIResponse(r: Response) {
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "AI request failed");
    return data;
  }

  const generateMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/ai/generate", body).then(parseAIResponse),
    onSuccess: (data: any) => {
      setForm((f) => ({
        ...f,
        section_name: data.section_name || f.section_name,
        section_type: data.section_type || f.section_type,
        description: data.description || f.description,
        html_content: data.html_content || f.html_content,
        clause_ammendable: data.clause_ammendable || f.clause_ammendable,
        clause_negotiable: data.clause_negotiable || f.clause_negotiable,
        clause_mandatory: data.clause_mandatory || f.clause_mandatory,
      }));
      setShowGeneratePanel(false);
      setGeneratePrompt("");
      toast({ title: "Clause generated", description: "Review and adjust before saving." });
    },
    onError: (err: any) => toast({ title: "AI generation failed", description: err?.message, variant: "destructive" }),
  });

  const improveMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/ai/improve", body).then(parseAIResponse),
    onSuccess: (data: any) => {
      setForm((f) => ({ ...f, html_content: data.html_content }));
      setImproveInstruction("");
      setShowCustomImprove(false);
      toast({ title: "Clause improved by AI" });
    },
    onError: (err: any) => toast({ title: "AI improvement failed", description: err?.message, variant: "destructive" }),
  });

  const riskMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/ai/analyze-risk", body).then(parseAIResponse),
    onSuccess: (data: any) => setRiskResult(data),
    onError: (err: any) => toast({ title: "Risk analysis failed", description: err?.message, variant: "destructive" }),
  });

  const suggestVarsMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/ai/suggest-variables", body).then(parseAIResponse),
    onSuccess: (data: any) => {
      setForm((f) => ({ ...f, html_content: data.html_content }));
      toast({ title: "Variables auto-inserted by AI" });
    },
    onError: (err: any) => toast({ title: "Variable suggestion failed", description: err?.message, variant: "destructive" }),
  });

  const duplicatesMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/ai/find-duplicates", body).then(parseAIResponse),
    onSuccess: (data: any) => setDuplicates(Array.isArray(data) ? data : []),
    onError: (err: any) => toast({ title: "Duplicate check failed", description: err?.message, variant: "destructive" }),
  });

  const extractMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/ai/extract", body).then(parseAIResponse),
    onSuccess: (data: any) => {
      const clauses = Array.isArray(data) ? data : [];
      setExtractedClauses(clauses);
      setSelectedExtracted(new Set(clauses.map((_: any, i: number) => i)));
    },
    onError: (err: any) => toast({ title: "Extraction failed", description: err?.message, variant: "destructive" }),
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (clauses: any[]) => {
      for (const c of clauses) {
        await apiRequest("POST", "/api/contracts/sections", c);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/sections"] });
      toast({ title: `${selectedExtracted.size} clauses imported successfully` });
      setShowExtractDialog(false);
      setExtractedClauses([]);
      setExtractText("");
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const chatMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/ai/chat", body).then(parseAIResponse),
    onSuccess: (data: any) => {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response, generatedClause: data.generatedClause },
      ]);
      setChatInput("");
    },
    onError: (err: any) => {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: err?.message || "Sorry, I couldn't process that. Please try again." },
      ]);
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingSection(null);
    setForm({ ...emptyForm });
    setFormErrors({});
    setRiskResult(null);
    setDuplicates([]);
    setShowGeneratePanel(false);
    setShowSheet(true);
  }

  function openEdit(section: Section) {
    setEditingSection(section);
    setForm({
      section_name: section.section_name || "",
      section_type: section.section_type || "Custom",
      description: section.description || "",
      html_content: section.html_content || "",
      clause_ammendable: section.clause_ammendable || "No",
      clause_negotiable: section.clause_negotiable || "No",
      clause_mandatory: section.clause_mandatory || "No",
      orderby: section.orderby != null ? String(section.orderby) : "",
    });
    setFormErrors({});
    setRiskResult(null);
    setDuplicates([]);
    setShowGeneratePanel(false);
    setShowSheet(true);
  }

  function validate() {
    const errors: Record<string, string> = {};
    if (!form.section_name.trim()) errors.section_name = "Clause name is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const body = {
      section_name: form.section_name.trim(),
      section_type: form.section_type,
      description: form.description || null,
      html_content: form.html_content || null,
      clause_ammendable: form.clause_ammendable,
      clause_negotiable: form.clause_negotiable,
      clause_mandatory: form.clause_mandatory,
      orderby: form.orderby !== "" ? parseInt(form.orderby) : null,
    };
    if (editingSection) updateMutation.mutate({ id: editingSection.section_id, body });
    else createMutation.mutate(body);
  }

  function handleSearchChange(val: string) { setSearch(val); setPage(1); }
  function handleTypeChange(val: string) { setTypeFilter(val); setPage(1); }

  function sendChatMessage(msg: string) {
    if (!msg.trim() || chatMutation.isPending) return;
    const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
    setChatMessages((prev) => [...prev, { role: "user", content: msg.trim() }]);
    setChatInput("");
    chatMutation.mutate({ message: msg.trim(), history });
  }

  function sendChat() {
    sendChatMessage(chatInput);
  }

  function addChatClauseToLibrary(clause: any) {
    createMutation.mutate(clause);
    toast({ title: "Adding clause to library…" });
  }

  function exportToXLS() {
    const rows = (data?.data || []).map((s) => ({
      "Clause Name": s.section_name, "Type": s.section_type || "",
      "Description": s.description || "", "Amendable": s.clause_ammendable || "",
      "Negotiable": s.clause_negotiable || "", "Mandatory": s.clause_mandatory || "",
      "Created By": s.created_by || "", "Created Date": formatDate(s.creation_date),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Clauses");
    XLSX.writeFile(wb, `clauses_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported to Excel" });
  }

  function exportToCSV() {
    const rows = (data?.data || []).map((s) => ({
      "Clause Name": s.section_name, "Type": s.section_type || "",
      "Description": s.description || "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Clauses");
    XLSX.writeFile(wb, `clauses_${new Date().toISOString().split("T")[0]}.csv`);
    toast({ title: "Exported to CSV" });
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const sections = data?.data || [];
  const pagination = data?.pagination;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-3">

      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
            Contract Clauses
            <Badge className="bg-violet-100 text-violet-700 border-0 text-xs gap-1 dark:bg-violet-900/30 dark:text-violet-300">
              <Sparkles className="w-3 h-3" /> AI-Powered
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">Manage and build your contract clause library</p>
        </div>
        <div className="flex items-center gap-2">
          {isAIEnabled('AI_CONTRACT_LIBRARY_INIT') && <Button
            variant="outline" size="sm"
            className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-900/20"
            onClick={() => setLocation("/app/contract-sections/initialize")}
            data-testid="button-initialize-library"
          >
            <Zap className="h-4 w-4" /> AI Clause Builder
          </Button>}
          {isAIEnabled('AI_CONTRACT_EXTRACT') && <Button
            variant="outline" size="sm"
            className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
            onClick={() => setLocation("/app/contract-sections/extract")}
            data-testid="button-extract-document"
          >
            <UploadCloud className="h-4 w-4" /> Extract Contract Clauses
          </Button>}
          {isAIEnabled('AI_CONTRACT_ADVISOR') && <Button
            variant="outline" size="sm"
            className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
            onClick={() => setShowChat(true)}
            data-testid="button-ai-chat"
          >
            <Bot className="h-4 w-4" /> AI Legal Advisor
          </Button>}
          <Button size="sm" onClick={openAdd} data-testid="button-new-section">
            <Plus className="h-4 w-4 mr-1" /> New Clause
          </Button>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search-sections"
                placeholder="Search by name, type, description..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-[140px] h-8 text-sm" data-testid="select-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {sectionTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8" data-testid="button-export-menu">
                    <Upload className="h-4 w-4 mr-1" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => toast({ title: "PDF Export", description: "Use Excel or CSV for now." })}>
                    <FileText className="h-4 w-4 mr-2" /> Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToXLS}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Export as XLS
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToCSV}>
                    <Upload className="h-4 w-4 mr-2" /> Export as CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b">
                  <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-48 flex-1" />
                  <Skeleton className="h-5 w-20" /><Skeleton className="h-4 w-64" /><Skeleton className="h-6 w-6" />
                </div>
              ))}
            </div>
          ) : sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 bg-violet-50 dark:bg-violet-950/40 rounded-full mb-4">
                <Layers className="h-10 w-10 text-violet-400" />
              </div>
              <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
                {search || typeFilter !== "all" ? "No clauses match your filters" : "Your clause library is empty"}
              </p>
              <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm">
                {search || typeFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Use AI to instantly populate with 80+ standard clauses, or add them one by one."}
              </p>
              {!search && typeFilter === "all" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setLocation("/app/contract-sections/initialize")} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
                    <Zap className="h-4 w-4" /> Initialize with AI
                  </Button>
                  <Button size="sm" variant="outline" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Manually</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-medium w-[120px]">ID</TableHead>
                    <TableHead className="text-xs font-medium">Clause Name</TableHead>
                    <TableHead className="text-xs font-medium w-[120px]">Type</TableHead>
                    <TableHead className="text-xs font-medium">Description</TableHead>
                    <TableHead className="text-xs font-medium text-right w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map((section) => (
                    <TableRow key={section.section_id} data-testid={`row-section-${section.section_id}`}>
                      <TableCell className="font-mono text-sm font-medium text-primary py-2">
                        {section.section_id}
                      </TableCell>
                      <TableCell className="text-sm py-2 font-medium">{section.section_name}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant="secondary" className={`text-xs border-0 ${typeConfig[section.section_type]?.className || ""}`}>
                          {section.section_type || "Custom"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm py-2 max-w-sm text-muted-foreground">
                        <span className="line-clamp-2">{section.description || "—"}</span>
                      </TableCell>
                      <TableCell className="text-right py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(section)} data-testid={`button-edit-${section.section_id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeletingSection(section)} data-testid={`button-delete-${section.section_id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {pagination && pagination.total > 0 && (
            <div className="flex items-center justify-between border-t px-3 py-2 mt-1">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-1">{page}/{pagination.totalPages || 1}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Add / Edit Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent className="w-[65vw] sm:max-w-[65vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {editingSection ? "Edit Clause" : "New Clause"}
            </SheetTitle>
            <SheetDescription>
              {editingSection ? "Update the details for this contract clause." : "Add a new contract clause to your library."}
            </SheetDescription>
          </SheetHeader>

          {/* ── AI Generate Panel (New only) ────────────────────────────────── */}
          {!editingSection && isAIEnabled('AI_CONTRACT_GENERATE') && (
            <div className="mt-4 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-violet-100/60 dark:hover:bg-violet-900/20 transition-colors"
                onClick={() => setShowGeneratePanel((v) => !v)}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                  <Sparkles className="w-4 h-4" />
                  Generate with AI
                </div>
                <ChevronDown className={`w-4 h-4 text-violet-600 transition-transform ${showGeneratePanel ? "rotate-180" : ""}`} />
              </button>
              {showGeneratePanel && (
                <div className="px-4 pb-4 space-y-3 border-t border-violet-200 dark:border-violet-800 pt-3">
                  <div>
                    <Label className="text-xs text-violet-700 dark:text-violet-300 mb-1.5 block">Describe the clause you need</Label>
                    <Textarea
                      placeholder='e.g. "Payment terms with net 30 days and 1.5% monthly late fee"'
                      value={generatePrompt}
                      onChange={(e) => setGeneratePrompt(e.target.value)}
                      className="text-sm resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={generateContractType} onValueChange={setGenerateContractType}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Contract type (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRACT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!generatePrompt.trim() || generateMutation.isPending}
                      onClick={() => generateMutation.mutate({ description: generatePrompt, contractType: generateContractType })}
                      className="bg-violet-600 hover:bg-violet-700 shrink-0"
                    >
                      {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                      Generate
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── AI Assistant Panel (Edit only) ─────────────────────────────── */}
          {editingSection && (isAIEnabled('AI_CONTRACT_IMPROVE') || isAIEnabled('AI_CONTRACT_RISK') || isAIEnabled('AI_CONTRACT_VARIABLES') || isAIEnabled('AI_CONTRACT_DUPLICATES')) && (
            <div className="mt-4 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 px-4 py-3">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-2 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" /> AI Assistant
              </p>
              <div className="flex flex-wrap gap-2">
                {/* Improve */}
                {isAIEnabled('AI_CONTRACT_IMPROVE') && <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300" disabled={improveMutation.isPending}>
                      {improveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      Improve
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {IMPROVE_OPTIONS.map((opt) => (
                      <DropdownMenuItem key={opt} className="cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 focus:bg-violet-50 dark:focus:bg-violet-900/20" onSelect={() => improveMutation.mutate({ name: form.section_name, htmlContent: form.html_content, instruction: opt })}>
                        <Wand2 className="h-3.5 w-3.5 mr-2 text-violet-500 shrink-0" />
                        {opt}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20 focus:bg-amber-50 dark:focus:bg-amber-900/20" onSelect={() => setShowCustomImprove(true)}>
                      <Lightbulb className="h-3.5 w-3.5 mr-2 text-amber-500 shrink-0" />
                      <span>Custom instruction…</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">type your own</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>}

                {/* Analyze Risk */}
                {isAIEnabled('AI_CONTRACT_RISK') && <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300"
                  disabled={riskMutation.isPending}
                  onClick={() => riskMutation.mutate({ name: form.section_name, htmlContent: form.html_content })}
                >
                  {riskMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  Analyze Risk
                </Button>}

                {/* Suggest Variables */}
                {isAIEnabled('AI_CONTRACT_VARIABLES') && <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
                  disabled={suggestVarsMutation.isPending}
                  onClick={() => suggestVarsMutation.mutate({ htmlContent: form.html_content })}
                >
                  {suggestVarsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Suggest Variables
                </Button>}

                {/* Check Duplicates */}
                {isAIEnabled('AI_CONTRACT_DUPLICATES') && <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300"
                  disabled={duplicatesMutation.isPending}
                  onClick={() => {
                    const plain = form.html_content.replace(/<[^>]+>/g, " ").trim();
                    duplicatesMutation.mutate({
                      name: form.section_name,
                      plainText: plain,
                      existingClauses: sections
                        .filter((s) => s.section_id !== editingSection?.section_id)
                        .map((s) => ({ section_id: s.section_id, section_name: s.section_name, description: s.description })),
                    });
                  }}
                >
                  {duplicatesMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Check Duplicates
                </Button>}
              </div>

              {/* Custom improve input */}
              {showCustomImprove && (
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="e.g. Add a penalty clause for late delivery"
                    value={improveInstruction}
                    onChange={(e) => setImproveInstruction(e.target.value)}
                    className="h-8 text-xs flex-1"
                    onKeyDown={(e) => e.key === "Enter" && improveInstruction.trim() && improveMutation.mutate({ name: form.section_name, htmlContent: form.html_content, instruction: improveInstruction })}
                  />
                  <Button size="sm" className="h-8 text-xs" disabled={!improveInstruction.trim() || improveMutation.isPending}
                    onClick={() => improveMutation.mutate({ name: form.section_name, htmlContent: form.html_content, instruction: improveInstruction })}>
                    Apply
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowCustomImprove(false)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              )}

              {/* Risk Result */}
              {riskResult && (
                <div className={`mt-3 rounded-md border px-3 py-2.5 ${riskConfig[riskResult.level].cls}`}>
                  <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                    {riskConfig[riskResult.level].icon}
                    Risk Level: {riskResult.level} (Score {riskResult.score}/10)
                  </div>
                  <p className="text-xs mb-1 opacity-90">{riskResult.summary}</p>
                  {riskResult.issues.length > 0 && (
                    <ul className="text-xs space-y-0.5">
                      {riskResult.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-1"><span className="opacity-60 mt-0.5">•</span>{issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Duplicates */}
              {duplicates.length > 0 && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 px-3 py-2.5">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {duplicates.length} Similar Clause{duplicates.length > 1 ? "s" : ""} Found
                  </p>
                  {duplicates.map((d: any, i: number) => (
                    <div key={i} className="text-xs text-blue-700 dark:text-blue-300 mb-1">
                      <span className="font-medium">{d.section_name}</span>
                      <span className="opacity-70 ml-1">({d.similarity}% similar) — {d.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              {duplicates.length === 0 && duplicatesMutation.isSuccess && (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> No duplicates or conflicts found.
                </p>
              )}
            </div>
          )}

          {/* ── Form Fields ─────────────────────────────────────────────────── */}
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="section_name">Clause Name <span className="text-destructive">*</span></Label>
                    <Input id="section_name" data-testid="input-section-name" placeholder="e.g. Payment Terms, Confidentiality"
                      value={form.section_name} onChange={(e) => setForm({ ...form, section_name: e.target.value })} />
                    {formErrors.section_name && <p className="text-xs text-destructive">{formErrors.section_name}</p>}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="section_type">Clause Type</Label>
                    <Select value={form.section_type} onValueChange={(v) => setForm({ ...form, section_type: v })}>
                      <SelectTrigger id="section_type" data-testid="select-section-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {sectionTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Amendable</Label>
                      <div className="flex items-center gap-2 pt-0.5">
                        {["Yes", "No"].map((v) => (
                          <Button key={v} type="button" size="sm" variant={form.clause_ammendable === v ? "default" : "outline"}
                            onClick={() => setForm({ ...form, clause_ammendable: v })} data-testid={`btn-amendable-${v.toLowerCase()}`} className="w-14">{v}</Button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Negotiable</Label>
                      <div className="flex items-center gap-2 pt-0.5">
                        {["Yes", "No"].map((v) => (
                          <Button key={v} type="button" size="sm" variant={form.clause_negotiable === v ? "default" : "outline"}
                            onClick={() => setForm({ ...form, clause_negotiable: v })} data-testid={`btn-negotiable-${v.toLowerCase()}`} className="w-14">{v}</Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Mandatory</Label>
                    <div className="flex items-center gap-2 pt-0.5">
                      {["Yes", "No"].map((v) => (
                        <Button key={v} type="button" size="sm" variant={form.clause_mandatory === v ? "default" : "outline"}
                          onClick={() => setForm({ ...form, clause_mandatory: v })} data-testid={`btn-mandatory-${v.toLowerCase()}`} className="w-14">{v}</Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-2 grid gap-1.5">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  data-testid="input-description"
                  placeholder="Short summary of this clause (optional)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="col-span-2 grid gap-1.5">
                <Label>Clause Content</Label>
                <RichTextEditor
                  value={form.html_content}
                  onChange={(value) => setForm({ ...form, html_content: value })}
                  placeholder="Enter clause content..."
                  height={300}
                  testId="input-html-content"
                />
              </div>
            </div>
          </div>

          <SheetFooter className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowSheet(false)} disabled={isPending} data-testid="button-cancel-section">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-section">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingSection ? "Save Changes" : "Create Clause"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ─── Extract from Document Dialog ──────────────────────────────────── */}
      <Dialog open={showExtractDialog} onOpenChange={(open) => { if (!open) { setShowExtractDialog(false); setExtractText(""); setExtractedClauses([]); setSelectedExtracted(new Set()); } }}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden" style={{ height: "80vh", display: "flex", flexDirection: "column" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-blue-600" /> Import Clauses from Document
            </DialogTitle>
            <DialogDescription>
              Paste your existing contract document text. AI will identify and extract individual clauses into your library.
            </DialogDescription>
          </DialogHeader>

          {extractedClauses.length === 0 ? (
            <div className="space-y-3 py-2">
              <Textarea
                placeholder="Paste your contract document text here..."
                value={extractText}
                onChange={(e) => setExtractText(e.target.value)}
                className="min-h-[200px] text-sm font-mono resize-none"
              />
              {extractMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analysing document…
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{extractedClauses.length} clauses extracted</p>
                <Button size="sm" variant="ghost" onClick={() => setSelectedExtracted(
                  selectedExtracted.size === extractedClauses.length
                    ? new Set()
                    : new Set(extractedClauses.map((_, i) => i))
                )}>
                  {selectedExtracted.size === extractedClauses.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {extractedClauses.map((c, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedExtracted((prev) => {
                      const next = new Set(prev);
                      next.has(i) ? next.delete(i) : next.add(i);
                      return next;
                    })}
                    className={`rounded-md border p-3 cursor-pointer transition-colors ${selectedExtracted.has(i)
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selectedExtracted.has(i) ? "bg-blue-600 border-blue-600" : "border-gray-400"}`}>
                        {selectedExtracted.has(i) && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{c.section_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className={`text-xs border-0 ${typeConfig[c.section_type]?.className || ""}`}>{c.section_type}</Badge>
                          {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowExtractDialog(false); setExtractedClauses([]); setExtractText(""); }}>Cancel</Button>
            {extractedClauses.length === 0 ? (
              <Button
                disabled={!extractText.trim() || extractMutation.isPending}
                onClick={() => extractMutation.mutate({ documentText: extractText })}
                className="gap-1.5"
              >
                {extractMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Extract Clauses
              </Button>
            ) : (
              <Button
                disabled={selectedExtracted.size === 0 || bulkImportMutation.isPending}
                onClick={() => bulkImportMutation.mutate(extractedClauses.filter((_, i) => selectedExtracted.has(i)))}
                className="gap-1.5"
              >
                {bulkImportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Import {selectedExtracted.size} Clause{selectedExtracted.size !== 1 ? "s" : ""}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── AI Clause Chat Panel ───────────────────────────────────────────── */}
      {showChat && isAIEnabled('AI_CONTRACT_ADVISOR') && (
        <div className="fixed inset-y-0 right-0 w-[400px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-violet-600 to-indigo-600">
            <div className="flex items-center gap-2 text-white">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">AI Clause Assistant</p>
                <p className="text-xs opacity-80">Generate, improve, explain clauses</p>
              </div>
            </div>
            <button data-testid="button-chat-close" onClick={() => setShowChat(false)} className="text-white/80 hover:text-white p-1 rounded transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="h-6 w-6 text-violet-600" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">How can I help with your clauses?</p>
                <p className="text-xs text-muted-foreground mt-1">Try: "Generate a confidentiality clause for a service contract"</p>
                <div className="mt-4 space-y-1.5">
                  {[
                    "Generate a force majeure clause",
                    "Write a payment terms clause with net 30",
                    "Create a termination clause",
                    "Explain liability limitation clauses",
                  ].map((s) => (
                    <button key={s} onClick={() => sendChatMessage(s)}
                      disabled={chatMutation.isPending}
                      className="w-full text-left text-xs px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-300 transition-colors disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2.5 text-sm ${msg.role === "user"
                    ? "bg-violet-600 text-white rounded-br-sm"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm"
                  }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.generatedClause && (
                    <div className="mt-2 rounded-md border border-violet-300 dark:border-violet-700 bg-white dark:bg-gray-900 p-2.5">
                      <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">📄 {msg.generatedClause.section_name}</p>
                      <p className="text-xs text-muted-foreground mb-2">{msg.generatedClause.description}</p>
                      <Button size="sm" className="h-6 text-xs w-full bg-violet-600 hover:bg-violet-700"
                        onClick={() => addChatClauseToLibrary(msg.generatedClause)}>
                        <Plus className="h-3 w-3 mr-1" /> Add to Library
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                  <span className="text-xs text-muted-foreground">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <Input
                data-testid="input-chat-message"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                placeholder="Ask me anything about clauses…"
                className="text-sm flex-1"
                disabled={chatMutation.isPending}
              />
              <Button size="icon" data-testid="button-chat-send" className="h-9 w-9 shrink-0 bg-violet-600 hover:bg-violet-700"
                onClick={sendChat} disabled={!chatInput.trim() || chatMutation.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Chat backdrop */}
      {showChat && <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowChat(false)} />}

      {/* ─── Delete Confirmation ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deletingSection} onOpenChange={() => setDeletingSection(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Clause</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">"{deletingSection?.section_name}"</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingSection && deleteMutation.mutate(deletingSection.section_id)}
              data-testid="button-confirm-delete">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
