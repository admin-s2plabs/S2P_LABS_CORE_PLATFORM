import RichTextEditor from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  LayoutTemplate,
  Loader2,
  Plus,
  Save, Search,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";

interface TemplateSection {
  section_id: number;
  section_name: string;
  section_type: string;
  description: string | null;
  html_content: string | null;
  clause_ammendable: string;
  clause_negotiable: string;
  clause_mandatory: string;
  orderby: number | null;
}

export default function ContractTemplateDetail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [, params] = useRoute("/app/contract-templates/:id");
  const templateId = params?.id;
  const isNew = templateId === "new";

  // ── Form state ─────────────────────────────────────────────────────────────
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [nameError, setNameError]       = useState("");

  // ── Sections state ─────────────────────────────────────────────────────────
  const [localSections, setLocalSections] = useState<TemplateSection[]>([]);
  const [expandedIds, setExpandedIds]     = useState<Set<number>>(new Set());
  const [dirtyIds, setDirtyIds]           = useState<Set<number>>(new Set());
  const [savingAll, setSavingAll]         = useState(false);
  const [focusedId, setFocusedId]         = useState<number | null>(null);

  // ── Right panel state ──────────────────────────────────────────────────────
  const [rightTab, setRightTab] = useState<"clauses" | "library">("clauses");
  const [libSearch, setLibSearch] = useState("");
  const [dragLibraryClause, setDragLibraryClause] = useState<any | null>(null);

  // ── Fetch template ─────────────────────────────────────────────────────────
  const { data: template, isLoading: templateLoading } = useQuery<any>({
    queryKey: ["/api/contracts/templates", templateId],
    queryFn: () =>
      apiRequest("GET", `/api/contracts/templates/${templateId}`).then(r => r.json()),
    enabled: !isNew && !!templateId,
  });

  const { data: sectionsData = [], isLoading: sectionsLoading } = useQuery<TemplateSection[]>({
    queryKey: ["/api/contracts/templates", templateId, "sections"],
    queryFn: () =>
      apiRequest("GET", `/api/contracts/templates/${templateId}/sections`).then(r => r.json()),
    enabled: !isNew && !!templateId,
  });

  const { data: clauseLibrary = [] } = useQuery<any[]>({
    queryKey: [`/api/contracts/clause-library?search=${encodeURIComponent(libSearch)}`],
    enabled: rightTab === "library",
  });

  // ── Sync fetched data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (template) {
      setTemplateName(template.template_name || "");
      setTemplateDesc(template.template_description || "");
    }
  }, [template]);

  useEffect(() => {
    if (sectionsData.length) {
      setLocalSections(sectionsData);
    }
  }, [sectionsData]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createTemplateMutation = useMutation({
    mutationFn: (body: any) =>
      apiRequest("POST", "/api/contracts/templates", body).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/templates"] });
      toast({ title: "Template created" });
      setLocation(`/app/contract-templates/${data.id}`);
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to create template", variant: "destructive" }),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: (body: any) =>
      apiRequest("PUT", `/api/contracts/templates/${templateId}`, body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/templates"] });
      toast({ title: "Template saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to save template", variant: "destructive" }),
  });

  const addSectionMutation = useMutation({
    mutationFn: (body: any) =>
      apiRequest("POST", `/api/contracts/templates/${templateId}/sections`, body).then(r => r.json()),
    onSuccess: (data: any) => {
      setLocalSections(prev => [...prev, data]);
      setExpandedIds(prev => new Set([...prev, data.section_id]));
      setFocusedId(data.section_id);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/templates", templateId, "sections"] });
    },
    onError: () => toast({ title: "Failed to add clause", variant: "destructive" }),
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: number) =>
      apiRequest("DELETE", `/api/contracts/templates/${templateId}/sections/${sectionId}`),
    onSuccess: (_, sectionId) => {
      setLocalSections(prev => prev.filter(s => s.section_id !== sectionId));
      setDirtyIds(prev => { const n = new Set(prev); n.delete(sectionId); return n; });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/templates", templateId, "sections"] });
    },
    onError: () => toast({ title: "Failed to delete clause", variant: "destructive" }),
  });

  // ── Save dirty clauses ─────────────────────────────────────────────────────
  async function saveAllClauses() {
    setSavingAll(true);
    try {
      for (const id of Array.from(dirtyIds)) {
        const s = localSections.find(x => x.section_id === id);
        if (s) {
          await apiRequest("PUT", `/api/contracts/templates/${templateId}/sections/${id}`, {
            section_name: s.section_name,
            html_content: s.html_content,
            description: s.description,
          });
        }
      }
      setDirtyIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/templates", templateId, "sections"] });
      toast({ title: "All clauses saved" });
    } catch {
      toast({ title: "Failed to save some clauses", variant: "destructive" });
    } finally {
      setSavingAll(false);
    }
  }

  async function handleSave() {
    if (!templateName.trim()) { setNameError("Template name is required"); return; }
    setNameError("");
    if (isNew) {
      createTemplateMutation.mutate({
        template_name: templateName.trim(),
        template_description: templateDesc.trim() || null,
      });
    } else {
      await updateTemplateMutation.mutateAsync({
        template_name: templateName.trim(),
        template_description: templateDesc.trim() || null,
      });
      if (dirtyIds.size > 0) await saveAllClauses();
    }
  }

  function updateSection(id: number, field: keyof TemplateSection, value: any) {
    setLocalSections(prev => prev.map(s => s.section_id === id ? { ...s, [field]: value } : s));
    setDirtyIds(prev => new Set([...prev, id]));
  }

  function addFromLibrary(lib: any) {
    if (isNew) {
      toast({ title: "Save the template first before adding clauses", variant: "destructive" });
      return;
    }
    addSectionMutation.mutate({
      section_name: lib.section_name,
      section_type: lib.section_type || "Custom",
      description: lib.description || null,
      html_content: lib.html_content || null,
      clause_ammendable: lib.clause_ammendable || "No",
      clause_negotiable: lib.clause_negotiable || "No",
      clause_mandatory: lib.clause_mandatory || "No",
      orderby: localSections.length + 1,
    });
  }

  function toggleExpand(id: number) {
    setExpandedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const isSaving = createTemplateMutation.isPending || updateTemplateMutation.isPending || savingAll;
  const hasChanges = dirtyIds.size > 0;

  if (!isNew && templateLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">

      {/* ── Standard detail page header ───────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setLocation("/app/contract-templates")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <LayoutTemplate className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight truncate">
              {isNew ? "New Template" : (template?.template_name || "Template")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isNew
                ? "Create a new contract template"
                : `${localSections.length} clause${localSections.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && !isNew && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
          <Button
            variant="outline" size="sm"
            className="h-8 text-xs px-3 gap-1.5 font-medium"
            onClick={() => setLocation("/app/contract-templates")}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs px-3 gap-1.5 font-medium"
            onClick={handleSave}
            disabled={isSaving}
            data-testid="button-save-template"
          >
            {isSaving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
              : <><Save className="h-3.5 w-3.5" /> {isNew ? "Create Template" : "Save Template"}</>}
          </Button>
        </div>
      </div>

      {/* ── Template info card ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="template-name" className="text-xs font-medium">
                Template Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={e => { setTemplateName(e.target.value); setNameError(""); }}
                placeholder="e.g. Service Contract Template"
                className={cn("h-8 text-sm", nameError && "border-destructive")}
                data-testid="input-template-name"
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-description" className="text-xs font-medium">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="template-description"
                value={templateDesc}
                onChange={e => setTemplateDesc(e.target.value)}
                placeholder="Brief description of this template's purpose"
                className="h-8 text-sm"
                data-testid="input-template-description"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Clauses split pane ───────────────────────────────────────────────── */}
      {isNew ? (
        <div className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-16 text-center">
          <LayoutTemplate className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">Create the template to start adding clauses</p>
          <p className="text-xs text-muted-foreground mt-1">Fill in the name above and click "Create Template"</p>
        </div>
      ) : (
        <div
          className="border rounded-xl overflow-hidden flex bg-background"
          style={{ height: "calc(100vh - 252px)", minHeight: "400px" }}
        >
          {/* Left: clause list */}
          <div className="flex-1 flex flex-col min-w-0">

            {/* Clause toolbar */}
            <div className="flex items-center justify-between border-b px-4 py-2 bg-background gap-3 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                {localSections.length} {localSections.length === 1 ? "clause" : "clauses"}
                {hasChanges && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">
                    {dirtyIds.size} unsaved
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {hasChanges && (
                  <Button
                    variant="outline" size="sm"
                    className="h-7 text-xs gap-1.5 px-2.5"
                    onClick={saveAllClauses}
                    disabled={savingAll}
                  >
                    {savingAll
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                      : <><Save className="h-3 w-3" /> Save Changes</>}
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 px-2.5"
                  onClick={() => addSectionMutation.mutate({
                    section_name: "New Clause",
                    orderby: localSections.length + 1,
                  })}
                  disabled={addSectionMutation.isPending}
                  data-testid="button-add-blank-clause"
                >
                  {addSectionMutation.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Plus className="h-3 w-3" />}
                  Add Clause
                </Button>
              </div>
            </div>

            {/* Clause list */}
            <div
              className="flex-1 overflow-y-auto p-3 space-y-1.5"
              onDragOver={e => { if (dragLibraryClause) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
              onDrop={e => { e.preventDefault(); if (dragLibraryClause) { addFromLibrary(dragLibraryClause); setDragLibraryClause(null); } }}
            >
              {sectionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : localSections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <BookOpen className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">No clauses yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add a blank clause or pick one from the Clause Library →
                  </p>
                </div>
              ) : (
                localSections.map((section, idx) => {
                  const expanded = expandedIds.has(section.section_id);
                  const dirty    = dirtyIds.has(section.section_id);
                  const focused  = focusedId === section.section_id;

                  return (
                    <Card
                      key={section.section_id}
                      className={cn(
                        "transition-all",
                        focused && "ring-1 ring-primary",
                        dirty   && "border-amber-300 dark:border-amber-700"
                      )}
                      data-testid={`card-clause-${section.section_id}`}
                    >
                      <CardContent className="p-0">
                        {/* Clause header row */}
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none group"
                          onClick={() => toggleExpand(section.section_id)}
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" onClick={e => e.stopPropagation()} />
                          <span className={cn(
                            "flex-1 text-sm font-medium truncate",
                            !section.section_name && "italic text-muted-foreground"
                          )}>
                            Clause {idx + 1}{section.section_name ? `: ${section.section_name}` : ""}
                          </span>
                          {dirty && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50 shrink-0">Unsaved</Badge>
                          )}
                          {section.clause_mandatory === "Yes" && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal shrink-0">
                              Mandatory
                            </Badge>
                          )}
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={e => { e.stopPropagation(); deleteSectionMutation.mutate(section.section_id); }}
                            data-testid={`button-delete-clause-${section.section_id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          {expanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        </div>

                        {/* Expanded editor */}
                        {expanded && (
                          <div
                            className="border-t px-4 pb-4 bg-muted/20"
                            onClick={() => setFocusedId(section.section_id)}
                          >
                            <div className="mt-3 space-y-3">
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clause Title</Label>
                                <Input
                                  value={section.section_name}
                                  onChange={e => updateSection(section.section_id, "section_name", e.target.value)}
                                  className="mt-1"
                                  data-testid={`input-clause-name-${section.section_id}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clause Content</Label>
                                <div className="mt-1">
                                  <RichTextEditor
                                    value={section.html_content || ""}
                                    onChange={val => updateSection(section.section_id, "html_content", val)}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: nav + library panel */}
          <div className="w-56 flex-shrink-0 flex flex-col border-l bg-muted/20">

            {/* Tab toggle */}
            <div className="px-3 py-2 border-b bg-background">
              <div className="flex rounded-md border overflow-hidden text-xs">
                <button
                  type="button"
                  className={cn(
                    "flex-1 py-1.5 font-medium transition-colors",
                    rightTab === "clauses"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => setRightTab("clauses")}
                  data-testid="tab-clauses"
                >
                  Clauses
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 py-1.5 font-medium transition-colors",
                    rightTab === "library"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => setRightTab("library")}
                  data-testid="tab-clause-library"
                >
                  Library
                </button>
              </div>
            </div>

            {rightTab === "clauses" ? (
              <div className="flex-1 overflow-y-auto">
                {localSections.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8 px-3">
                    No clauses added yet
                  </p>
                ) : (
                  localSections.map((s, idx) => (
                    <button
                      key={s.section_id}
                      type="button"
                      onClick={() => {
                        setFocusedId(s.section_id);
                        setExpandedIds(prev => new Set([...prev, s.section_id]));
                        document
                          .querySelector(`[data-testid="card-clause-${s.section_id}"]`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs flex items-center gap-1.5 transition-colors border-b",
                        focusedId === s.section_id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent"
                      )}
                      data-testid={`nav-clause-${s.section_id}`}
                    >
                      <span className="truncate font-medium">
                        Clause {idx + 1}{s.section_name ? `: ${s.section_name}` : ""}
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
                      value={libSearch}
                      onChange={e => setLibSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {clauseLibrary.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8 px-3">
                      No clauses in global library
                    </p>
                  ) : (
                    clauseLibrary.map((lib: any) => {
                      const plainText = lib.description
                        ? lib.description.replace(/\s+/g, " ").trim()
                        : lib.html_content
                          ? (() => { try { return new DOMParser().parseFromString(lib.html_content, "text/html").body.textContent?.replace(/\s+/g, " ").trim() || ""; } catch { return ""; } })()
                          : "";
                      return (
                        <div
                          key={lib.section_id}
                          draggable
                          onDragStart={e => { e.dataTransfer.effectAllowed = "copy"; setDragLibraryClause(lib); }}
                          onDragEnd={() => setDragLibraryClause(null)}
                          onClick={() => addFromLibrary(lib)}
                          className="w-full px-2 py-2 text-xs text-left transition-colors select-none border-b last:border-b-0 hover:bg-primary/10 cursor-grab active:cursor-grabbing"
                          data-testid={`library-clause-${lib.section_id}`}
                        >
                          <div className="flex items-start gap-1.5 mb-0.5">
                            <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/40 mt-0.5" />
                            <span className="font-medium leading-snug flex-1">
                              {lib.section_name}
                            </span>
                          </div>
                          {plainText && (
                            <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 pl-4">
                              {plainText}
                            </p>
                          )}
                          {lib.section_type && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 mt-1 font-normal ml-4">
                              {lib.section_type}
                            </Badge>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
