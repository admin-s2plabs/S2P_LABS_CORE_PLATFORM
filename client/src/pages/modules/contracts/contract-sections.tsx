import RichTextEditor from "@/components/rich-text-editor";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const typeConfig: Record<string, { className: string }> = {
  Custom: { className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  Standard: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Legal: { className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Financial: { className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  Operational: { className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  Compliance: { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const emptyForm = {
  section_name: "", section_type: "", description: "", html_content: "",
  clause_ammendable: "No", clause_negotiable: "No", clause_mandatory: "No", orderby: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContractSections() {
  const { toast } = useToast();

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

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingSection(null);
    setForm({ ...emptyForm });
    setFormErrors({});
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
          </h1>
          <p className="text-sm text-muted-foreground">Manage and build your contract clause library</p>
        </div>
        <div className="flex items-center gap-2">
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
                  : "Add clauses one by one to build your library."}
              </p>
              {!search && typeFilter === "all" && (
                <div className="flex gap-2">
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

      {/* ─── Add / Edit Form ─────────────────────────────────────────────────── */}
      <FormSheet
        open={showSheet}
        onOpenChange={setShowSheet}
        title={editingSection ? "Edit Clause" : "New Clause"}
        description={editingSection ? "Update the details for this contract clause." : "Add a new contract clause to your library."}
        onSubmit={handleSubmit}
        submitLabel={editingSection ? "Save Changes" : "Create Clause"}
        isSubmitting={isPending}
        widthClassName="sm:max-w-4xl"
      >
        <p className="text-xs text-muted-foreground mb-4">
          <span className="text-destructive">*</span> Indicates mandatory fields
        </p>

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
      </FormSheet>


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
