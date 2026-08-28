import RichTextEditor from "@/components/rich-text-editor";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertDialogCancel } from "@radix-ui/react-alert-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Globe,
  History,
  Loader2,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import * as XLSX from "xlsx";

const TERM_STATUSES = ["Draft", "Published", "Archived"];

const DIFF_FIELDS: { key: string; label: string }[] = [
  { key: "terms_name", label: "Term Name" },
  { key: "term_type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "terms_department_name", label: "Department" },
  { key: "term_amendable", label: "Amendable" },
  { key: "term_negotiable", label: "Negotiable" },
  { key: "mandatory", label: "Mandatory" },
  { key: "term_details", label: "Term Details" },
];

function stripHtml(html: string): string {
  return (html ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

const statusConfig: Record<string, string> = {
  Published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Draft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};


interface Term {
  terms_id: number;
  terms_name: string;
  term_type: string;
  description: string;
  term_details: string;
  status: string;
  version: number;
  term_amendable: string;
  term_negotiable: string;
  mandatory: string;
  terms_department: string;
  terms_department_name: string;
  created_by: string;
  creation_date: string;
  last_modified_by: string;
  last_modified_date: string;
}

interface TermsResponse {
  data: Term[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const emptyForm = {
  terms_name: "",
  term_type: "",
  status: "Draft",
  terms_department_name: "",
  description: "",
  term_details: "",
  term_amendable: "No",
  term_negotiable: "No",
  mandatory: "No",
};

export default function ContractTerms() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const limit = 20;
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showSheet, setShowSheet] = useState(false);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [deletingTerm, setDeletingTerm] = useState<Term | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [historyTerm, setHistoryTerm] = useState<Term | null>(null);

  const { data: termTypes = [] } = useQuery<string[]>({
    queryKey: ["/api/contracts/terms/types"],
  });

  const { data, isLoading } = useQuery<TermsResponse>({
    queryKey: ["/api/contracts/terms", page, limit, search, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
      return apiRequest("GET", `/api/contracts/terms?${params}`).then((r) => r.json());
    },
  });

  const { data: historyData = [] } = useQuery<any[]>({
    queryKey: ["/api/contracts/terms", historyTerm?.terms_id, "history"],
    queryFn: () =>
      apiRequest("GET", `/api/contracts/terms/${historyTerm!.terms_id}/history`).then((r) => r.json()),
    enabled: !!historyTerm,
    staleTime: 0,
    gcTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/contracts/terms", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/terms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/terms/types"] });
      toast({ title: "Term created successfully" });
      setShowSheet(false);
      setForm({ ...emptyForm });
    },
    onError: () => toast({ title: "Failed to create term", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiRequest("PUT", `/api/contracts/terms/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/terms"] });
      toast({ title: "Term updated successfully" });
      setShowSheet(false);
      setEditingTerm(null);
      setForm({ ...emptyForm });
    },
    onError: () => toast({ title: "Failed to update term", variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: (term: Term) =>
      apiRequest("PUT", `/api/contracts/terms/${term.terms_id}`, {
        ...term,
        status: "Published",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/terms"] });
      toast({ title: "Term published successfully" });
    },
    onError: () => toast({ title: "Failed to publish term", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/contracts/terms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/terms"] });
      toast({ title: "Term deleted successfully" });
      setDeletingTerm(null);
    },
    onError: () => toast({ title: "Failed to delete term", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleTypeChange(val: string) {
    setTypeFilter(val);
    setPage(1);
  }

  function openCreate() {
    setEditingTerm(null);
    setForm({ ...emptyForm });
    setFormErrors({});
    setShowSheet(true);
  }

  function openEdit(term: Term) {
    setEditingTerm(term);
    setForm({
      terms_name: term.terms_name || "",
      term_type: term.term_type || "",
      status: term.status || "Draft",
      terms_department_name: term.terms_department_name || "",
      description: term.description || "",
      term_details: term.term_details || "",
      term_amendable: term.term_amendable || "No",
      term_negotiable: term.term_negotiable || "No",
      mandatory: term.mandatory || "No",
    });
    setFormErrors({});
    setShowSheet(true);
  }

  function validate() {
    const errors: Record<string, string> = {};
    if (!form.terms_name.trim()) errors.terms_name = "Terms Name is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    if (editingTerm) {
      updateMutation.mutate({ id: editingTerm.terms_id, body: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleExportCSV() {
    const rows = (data?.data || []).map((t) => ({
      ID: t.terms_id,
      "Terms Name": t.terms_name,
      Type: t.term_type,
      Status: t.status,
      Version: t.version,
      Description: t.description,
      Amendable: t.term_amendable,
      Negotiable: t.term_negotiable,
      Mandatory: t.mandatory,
      Department: t.terms_department_name,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Terms");
    XLSX.writeFile(wb, "contract-terms.xlsx");
  }

  const terms = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Contract Terms</h1>
          <p className="text-sm text-muted-foreground">Define reusable contract terms and conditions</p>
        </div>
        <Button size="sm" onClick={openCreate} data-testid="button-new-term">
          <Plus className="h-4 w-4 mr-1" />
          New Term
        </Button>
      </div>

      {/* Table Card */}
      <Card>
        <CardContent className="p-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                data-testid="input-search-terms"
                placeholder="Search terms..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 h-8 text-sm w-[220px]"
              />
            </form>

            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-[140px] h-8 text-sm" data-testid="select-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {termTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8" data-testid="button-export-menu">
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCSV} data-testid="button-export-excel">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export to Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium w-[110px]">ID</TableHead>
                  <TableHead className="text-xs font-medium">Terms Name</TableHead>
                  <TableHead className="text-xs font-medium w-[120px]">Status</TableHead>
                  <TableHead className="text-xs font-medium">Department</TableHead>
                  <TableHead className="text-xs font-medium">Term Details</TableHead>
                  <TableHead className="text-xs font-medium w-[96px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : terms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10">
                      <Tag className="h-8 w-8 text-indigo-400 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No terms found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  terms.map((term) => (
                    <TableRow key={term.terms_id} data-testid={`row-term-${term.terms_id}`}>
                      <TableCell className="font-mono text-sm font-medium text-primary py-2">
                        {term.terms_id}
                      </TableCell>
                      <TableCell className="text-sm font-medium py-2">{term.terms_name}</TableCell>
                      <TableCell className="text-sm py-2">
                        {term.status ? (
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusConfig[term.status] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {term.status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm py-2 max-w-[160px] text-muted-foreground">
                        {term.terms_department_name ? (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block cursor-default">
                                  {term.terms_department_name}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[260px] text-xs">
                                {term.terms_department_name}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm py-2 max-w-[200px] text-muted-foreground">
                        {term.term_details ? (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block cursor-default">
                                  {stripHtml(term.term_details)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[320px] text-xs whitespace-pre-wrap">
                                {stripHtml(term.term_details).slice(0, 250)}
                                {stripHtml(term.term_details).length > 250 ? "…" : ""}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-0.5">
                          {term.status !== "Draft" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setHistoryTerm(term)}
                              data-testid={`button-history-term-${term.terms_id}`}
                              title="Version history"
                            >
                              <History className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                          {term.status === "Draft" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => publishMutation.mutate(term)}
                              disabled={publishMutation.isPending}
                              data-testid={`button-publish-term-${term.terms_id}`}
                              title="Publish term"
                            >
                              <Globe className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(term)}
                            data-testid={`button-edit-term-${term.terms_id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeletingTerm(term)}
                            data-testid={`button-delete-term-${term.terms_id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">
                Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs px-2">{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Sheet */}
      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent className="w-[65vw] sm:max-w-[65vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingTerm ? "Edit Term" : "New Term"}</SheetTitle>
            <SheetDescription>
              {editingTerm
                ? "Update this contract term. A version snapshot is saved automatically."
                : "Add a new reusable contract term or condition."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">

              {/* Top two-panel row: Left = text fields, Right = toggles */}
              <div className="col-span-2 grid grid-cols-2 gap-4">

                {/* LEFT: Terms Name, Term Type, Department */}
                <div className="flex flex-col gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="terms_name">
                      Terms Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="terms_name"
                      data-testid="input-terms-name"
                      placeholder="e.g. Payment Terms, Confidentiality Clause"
                      value={form.terms_name}
                      onChange={(e) => setForm({ ...form, terms_name: e.target.value })}
                    />
                    {formErrors.terms_name && (
                      <p className="text-xs text-destructive">{formErrors.terms_name}</p>
                    )}
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="term_type">Term Type</Label>
                    <Select
                      value={form.term_type}
                      onValueChange={(v) => setForm({ ...form, term_type: v })}
                    >
                      <SelectTrigger id="term_type" data-testid="select-term-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {termTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="terms_department_name">Department</Label>
                    <Input
                      id="terms_department_name"
                      data-testid="input-terms-department"
                      placeholder="e.g. Finance Department, Legal"
                      value={form.terms_department_name}
                      onChange={(e) => setForm({ ...form, terms_department_name: e.target.value })}
                    />
                  </div>
                </div>

                {/* RIGHT: Amendable + Negotiable side by side, Mandatory below */}
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Amendable</Label>
                      <div className="flex items-center gap-2 pt-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={form.term_amendable === "Yes" ? "default" : "outline"}
                          onClick={() => setForm({ ...form, term_amendable: "Yes" })}
                          data-testid="btn-amendable-yes"
                          className="w-14"
                        >Yes</Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={form.term_amendable === "No" ? "default" : "outline"}
                          onClick={() => setForm({ ...form, term_amendable: "No" })}
                          data-testid="btn-amendable-no"
                          className="w-14"
                        >No</Button>
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Negotiable</Label>
                      <div className="flex items-center gap-2 pt-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={form.term_negotiable === "Yes" ? "default" : "outline"}
                          onClick={() => setForm({ ...form, term_negotiable: "Yes" })}
                          data-testid="btn-negotiable-yes"
                          className="w-14"
                        >Yes</Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={form.term_negotiable === "No" ? "default" : "outline"}
                          onClick={() => setForm({ ...form, term_negotiable: "No" })}
                          data-testid="btn-negotiable-no"
                          className="w-14"
                        >No</Button>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Mandatory</Label>
                    <div className="flex items-center gap-2 pt-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={form.mandatory === "Yes" ? "default" : "outline"}
                        onClick={() => setForm({ ...form, mandatory: "Yes" })}
                        data-testid="btn-mandatory-yes"
                        className="w-14"
                      >Yes</Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={form.mandatory === "No" ? "default" : "outline"}
                        onClick={() => setForm({ ...form, mandatory: "No" })}
                        data-testid="btn-mandatory-no"
                        className="w-14"
                      >No</Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Term Details */}
              <div className="col-span-2 grid gap-1.5">
                <Label>Term Details</Label>
                <RichTextEditor
                  value={form.term_details}
                  onChange={(value) => setForm({ ...form, term_details: value })}
                  placeholder="Enter the full term text or clause content..."
                  height={300}
                  testId="input-term-details"
                />
              </div>

            </div>
          </div>

          <SheetFooter className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowSheet(false)}
              disabled={isPending}
              data-testid="button-cancel-term"
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-term">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTerm ? "Save Changes" : "Create Term"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTerm} onOpenChange={() => setDeletingTerm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Term</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingTerm?.terms_name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTerm && deleteMutation.mutate(deletingTerm.terms_id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Version History Sheet */}
      <Sheet open={!!historyTerm} onOpenChange={() => setHistoryTerm(null)}>
        <SheetContent className="w-[55vw] sm:max-w-[55vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Version History — {historyTerm?.terms_name}</SheetTitle>
            <SheetDescription>
              Each snapshot shows the state of this term before it was edited. Differences are shown against the current version.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 py-4">

            {/* Current live version */}
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge className="text-xs">Current — v{historyTerm?.version}</Badge>
                <span className="text-xs text-muted-foreground">
                  {historyTerm?.last_modified_date
                    ? formatDate(historyTerm.last_modified_date)
                    : "—"}
                </span>
                {historyTerm?.last_modified_by && (
                  <span className="text-xs text-muted-foreground">by {historyTerm.last_modified_by}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                {DIFF_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex gap-1 min-w-0">
                    <span className="text-muted-foreground w-24 shrink-0">{label}:</span>
                    <span className="font-medium truncate">
                      {stripHtml((historyTerm as any)?.[key] ?? "") || <span className="italic text-muted-foreground">empty</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Snapshots */}
            {historyData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No previous snapshots yet — edit this term to start tracking changes.
              </p>
            ) : (
              historyData.map((h: any) => {
                const changes = DIFF_FIELDS.filter(({ key }) => {
                  const prev = stripHtml(h[key] ?? "");
                  const curr = stripHtml((historyTerm as any)?.[key] ?? "");
                  return prev !== curr;
                });
                return (
                  <div key={h.id} className="rounded-md border p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">v{h.version}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {h.last_modified_date
                          ? formatDate(h.last_modified_date)
                          : "—"}
                      </span>
                      {(h.last_modified_by || h.created_by) && (
                        <span className="text-xs text-muted-foreground">
                          by {h.last_modified_by || h.created_by}
                        </span>
                      )}
                      {changes.length > 0 ? (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/20">
                          {changes.length} field{changes.length > 1 ? "s" : ""} changed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          No changes detected
                        </Badge>
                      )}
                    </div>

                    {changes.length > 0 && (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left font-medium text-muted-foreground pb-1.5 w-24">Field</th>
                            <th className="text-left font-medium text-red-600 pb-1.5 pr-2">Before (v{h.version})</th>
                            <th className="text-left font-medium text-green-600 pb-1.5">Current (v{historyTerm?.version})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.map(({ key, label }) => (
                            <tr key={key} className="border-t border-border/40">
                              <td className="py-1.5 pr-3 text-muted-foreground align-top">{label}</td>
                              <td className="py-1.5 pr-3 align-top">
                                <span className="inline-block bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded px-1.5 py-0.5 max-w-[240px] break-words">
                                  {stripHtml(h[key] ?? "") || <span className="italic">empty</span>}
                                </span>
                              </td>
                              <td className="py-1.5 align-top">
                                <span className="inline-block bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded px-1.5 py-0.5 max-w-[240px] break-words">
                                  {stripHtml((historyTerm as any)?.[key] ?? "") || <span className="italic">empty</span>}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
