import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronDown, ChevronRight,
  LayoutTemplate,
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const CONTRACT_TYPES = [
  { id: "Service Contract",       description: "Service delivery with SLAs and payment terms" },
  { id: "Supply Contract",        description: "Goods procurement and supply chain agreements" },
  { id: "Maintenance Contract",   description: "Equipment maintenance and support contracts" },
  { id: "Rate Contract",          description: "Fixed-rate agreements for recurring procurement" },
  { id: "Consultancy Agreement",  description: "Professional services and advisory engagements" },
  { id: "Construction Contract",  description: "FIDIC/NEC-aligned construction project contracts" },
  { id: "NDA",                    description: "Non-disclosure and confidentiality agreements" },
  { id: "Master Service Agreement", description: "Foundational vendor contract governing the overall business relationship" },
  { id: "IT Services Contract",   description: "Software, cloud, and managed IT support agreements" },
  { id: "Outsourcing Agreement",  description: "BPO, facilities management, and managed services" },
];

export default function ContractInitializeLibrary() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [orgContext, setOrgContext]           = useState("");
  const [activeType, setActiveType]           = useState<string | null>(null);
  const [generatedByType, setGeneratedByType] = useState<Record<string, any[]>>({});
  const [loadingTypes, setLoadingTypes]       = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys]       = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys]       = useState<Set<string>>(new Set());
  const [saved, setSaved]                     = useState(false);

  // ── Save as Template dialog state ─────────────────────────────────────────
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateMode, setTemplateMode]             = useState<"existing" | "new">("existing");
  const [templateSearch, setTemplateSearch]         = useState("");
  const [selectedTemplate, setSelectedTemplate]     = useState<{ id: number; name: string } | null>(null);
  const [newTemplateName, setNewTemplateName]       = useState("");

  const { data: templatesData } = useQuery<any>({
    queryKey: ["/api/contracts/templates", templateSearch],
    queryFn: () =>
      apiRequest("GET", `/api/contracts/templates?search=${encodeURIComponent(templateSearch)}&limit=50`)
        .then((r) => r.json()),
    enabled: templateDialogOpen && templateMode === "existing",
  });
  const templates: any[] = templatesData?.records || [];

  async function generateForType(typeId: string) {
    if (generatedByType[typeId] || loadingTypes.has(typeId)) return;
    setLoadingTypes((prev) => new Set([...prev, typeId]));
    try {
      const r = await apiRequest("POST", "/api/contracts/ai/initialize-library", {
        contractTypes: [typeId],
        organizationContext: orgContext,
        preview: true,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "AI request failed");
      const clauses: any[] = data.clauses || [];
      setGeneratedByType((prev) => ({ ...prev, [typeId]: clauses }));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        clauses.forEach((c: any, i: number) => {
          if (!c._already_exists) next.add(`${typeId}::${i}`);
        });
        return next;
      });
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        clauses.forEach((_: any, i: number) => next.add(`${typeId}::${i}`));
        return next;
      });
    } catch (err: any) {
      toast({ title: `Failed to generate clauses for ${typeId}`, description: err?.message, variant: "destructive" });
    } finally {
      setLoadingTypes((prev) => { const n = new Set(prev); n.delete(typeId); return n; });
    }
  }

  function getSelectedClauses() {
    const toSave: any[] = [];
    for (const key of selectedKeys) {
      const [type, idxStr] = key.split("::");
      const clause = generatedByType[type]?.[parseInt(idxStr)];
      if (clause) toSave.push({ ...clause, _contract_type: type });
    }
    return toSave;
  }

  const saveMutation = useMutation({
    mutationFn: (clauses: any[]) =>
      apiRequest("POST", "/api/contracts/ai/save-library-clauses", { clauses }).then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/sections"] });
      setSaved(true);
      toast({ title: `${data.count} clauses added to your library!` });
    },
    onError: () => toast({ title: "Failed to save clauses", variant: "destructive" }),
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: (body: any) =>
      apiRequest("POST", "/api/contracts/ai/save-as-template", body).then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/templates"] });
      setTemplateDialogOpen(false);
      setSelectedTemplate(null);
      setNewTemplateName("");
      setSaved(true);
      toast({
        title: `Saved to template "${data.templateName}"`,
        description: `${data.globalAdded} added to library · ${data.templateAdded} added to template`,
      });
    },
    onError: () => toast({ title: "Failed to save as template", variant: "destructive" }),
  });

  function handleSave() {
    saveMutation.mutate(getSelectedClauses());
  }

  function handleSaveAsTemplate() {
    const clauses = getSelectedClauses();
    if (templateMode === "existing") {
      if (!selectedTemplate) return;
      saveAsTemplateMutation.mutate({ clauses, templateId: selectedTemplate.id, templateName: selectedTemplate.name });
    } else {
      if (!newTemplateName.trim()) return;
      saveAsTemplateMutation.mutate({ clauses, templateName: newTemplateName.trim() });
    }
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const activeClauses  = activeType ? generatedByType[activeType] : null;
  const activeLoading  = activeType ? loadingTypes.has(activeType) : false;

  if (saved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-violet-600" />
          </div>
          <h2 className="text-xl font-bold mb-2">Library Ready!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {selectedKeys.size} industry-standard clauses have been added to your library and are ready to use in contract templates.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => { setSaved(false); setGeneratedByType({}); setSelectedKeys(new Set()); setActiveType(null); }}>
              Generate More
            </Button>
            <Button onClick={() => setLocation("/app/contract-sections")} className="bg-violet-600 hover:bg-violet-700 gap-2">
              <BookOpen className="h-4 w-4" /> View Clause Library
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background">

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-2.5 border-b bg-white dark:bg-gray-950">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/app/contract-sections")} className="gap-1.5 text-muted-foreground hover:text-foreground h-7 px-2 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold leading-none">Global Clause Repository</span>
              <p className="text-xs text-muted-foreground mt-0.5 leading-none">Curated world-standard clauses for your library</p>
            </div>
            <Badge className="bg-violet-100 text-violet-700 border-0 text-xs gap-1 dark:bg-violet-900/30 dark:text-violet-300 h-5">
              <Sparkles className="w-2.5 h-2.5" /> AI
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Your industry or core business (optional)"
            value={orgContext}
            onChange={(e) => setOrgContext(e.target.value)}
            className="h-7 text-xs w-52"
          />
          <Button
            disabled={selectedKeys.size === 0 || saveMutation.isPending || saveAsTemplateMutation.isPending}
            onClick={handleSave}
            variant="outline"
            className="gap-1.5 h-7 text-xs px-3 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300"
          >
            {saveMutation.isPending
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
              : <><CheckSquare className="h-3 w-3" /> Add {selectedKeys.size > 0 ? `${selectedKeys.size} ` : ""}to Library</>}
          </Button>
          <Button
            disabled={selectedKeys.size === 0 || saveMutation.isPending || saveAsTemplateMutation.isPending}
            onClick={() => { setTemplateDialogOpen(true); setTemplateMode("existing"); setSelectedTemplate(null); setNewTemplateName(""); setTemplateSearch(""); }}
            className="bg-violet-600 hover:bg-violet-700 gap-1.5 h-7 text-xs px-3"
          >
            <LayoutTemplate className="h-3 w-3" /> Save as Template
          </Button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1">

        {/* Left: Contract type list */}
        <div className="w-52 shrink-0 border-r flex flex-col bg-gray-50/40 dark:bg-gray-900/20">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contract Types</p>
          </div>
          <div className="flex-1 py-1">
            {CONTRACT_TYPES.map((ct) => {
              const generated  = generatedByType[ct.id];
              const loading    = loadingTypes.has(ct.id);
              const isActive   = activeType === ct.id;
              const selCount   = generated
                ? generated.filter((_: any, i: number) => selectedKeys.has(`${ct.id}::${i}`)).length
                : 0;

              return (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => { setActiveType(ct.id); generateForType(ct.id); }}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors text-sm ${
                    isActive
                      ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-medium border-r-2 border-violet-500"
                      : "text-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <span className="truncate">{ct.id}</span>
                  <span className="shrink-0">
                    {loading && <Loader2 className="h-3 w-3 animate-spin text-violet-500" />}
                    {!loading && generated && (
                      <span className={`text-xs font-medium rounded-full px-1.5 py-0.5 ${
                        selCount === generated.length
                          ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                          : "bg-gray-100 dark:bg-gray-800 text-muted-foreground"
                      }`}>
                        {selCount}/{generated.length}
                      </span>
                    )}
                    {!loading && !generated && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Clause review */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Empty state */}
          {!activeType && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-12 py-12">
              <ListChecks className="h-10 w-10 text-violet-300 mb-3" />
              <h3 className="text-sm font-semibold mb-1">Select a contract type</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Click a type on the left — AI will generate 20–25 comprehensive, industry-standard clauses for you to review and add to your library.
              </p>
            </div>
          )}

          {/* Loading */}
          {activeType && activeLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <div className="text-center">
                <p className="text-sm font-medium">Generating <strong>{activeType}</strong> clauses…</p>
                <p className="text-xs text-muted-foreground mt-0.5">Generating 20–25 clauses · About 20–30 seconds</p>
              </div>
            </div>
          )}

          {/* Clause list */}
          {activeType && !activeLoading && activeClauses && (() => {
            const selInType = activeClauses.filter((_: any, i: number) => selectedKeys.has(`${activeType}::${i}`)).length;
            const allSelected = selInType === activeClauses.length;

            const existsCount = activeClauses.filter((c: any) => c._already_exists).length;
            const selectAll = () => setSelectedKeys((prev) => {
              const n = new Set(prev);
              activeClauses.forEach((c: any, i: number) => { if (!c._already_exists) n.add(`${activeType}::${i}`); });
              return n;
            });
            const deselectAll = () => setSelectedKeys((prev) => {
              const n = new Set(prev);
              activeClauses.forEach((_: any, i: number) => n.delete(`${activeType}::${i}`));
              return n;
            });

            return (
              <>
                {/* Sub-header */}
                <div className="flex items-center justify-between px-5 py-2 border-b bg-white dark:bg-gray-950 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{activeType}</span>
                    <span className="text-xs text-muted-foreground">
                      {activeClauses.length} clauses · {selInType} selected
                      {existsCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {existsCount} already in library</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={allSelected ? deselectAll : selectAll}>
                      {allSelected
                        ? <><Square className="h-3 w-3" /> Deselect All</>
                        : <><CheckSquare className="h-3 w-3" /> Select All</>}
                    </Button>
                  </div>
                </div>

                {/* Clause rows */}
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {activeClauses.map((clause: any, i: number) => {
                    const key      = `${activeType}::${i}`;
                    const checked  = selectedKeys.has(key);
                    const expanded = expandedKeys.has(key);
                    const exists   = !!clause._already_exists;

                    return (
                      <div
                        key={i}
                        className={`transition-colors ${exists ? "opacity-60" : ""} ${checked ? "bg-violet-50/50 dark:bg-violet-900/10" : "bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900/40"}`}
                      >
                        <div
                          className="flex items-start gap-3 px-5 py-2.5 cursor-pointer"
                          onClick={() => toggleKey(key)}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleKey(key)}
                            className="mt-0.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium">{clause.section_name}</span>
                              {exists && (
                                <Badge
                                  className="text-xs h-4 px-1.5 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-normal gap-1"
                                  title={`Similar clause already in library: "${clause._match_name}"`}
                                >
                                  Already in Library
                                </Badge>
                              )}
                              {clause.section_type && (
                                <Badge variant="outline" className="text-xs h-4 px-1 font-normal">{clause.section_type}</Badge>
                              )}
                              {clause.clause_mandatory === "Yes" && (
                                <Badge className="text-xs h-4 px-1 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800 font-normal">Mandatory</Badge>
                              )}
                              {clause.clause_negotiable === "Yes" && (
                                <Badge className="text-xs h-4 px-1 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-normal">Negotiable</Badge>
                              )}
                            </div>
                            {clause.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{clause.description}</p>
                            )}
                          </div>
                          {clause.html_content && (
                            <button
                              type="button"
                              className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => { e.stopPropagation(); toggleExpand(key); }}
                            >
                              {expanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>

                        {expanded && clause.html_content && (
                          <div className="px-5 pb-3 pl-12">
                            <div
                              className="text-xs text-gray-600 dark:text-gray-400 prose prose-xs dark:prose-invert max-w-none leading-relaxed border-l-2 border-violet-200 dark:border-violet-800 pl-3 [&_p]:mb-1.5 [&_p:last-child]:mb-0"
                              dangerouslySetInnerHTML={{ __html: clause.html_content }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* Retry fallback */}
          {activeType && !activeLoading && !activeClauses && (
            <div className="flex-1 flex items-center justify-center">
              <Button onClick={() => generateForType(activeType)} className="gap-2 bg-violet-600 hover:bg-violet-700 text-sm h-8">
                <Zap className="h-3.5 w-3.5" /> Generate Clauses
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Save as Template Dialog ───────────────────────────────────────────── */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <LayoutTemplate className="h-4 w-4 text-violet-600" />
              Save as Template
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground -mt-1">
            {selectedKeys.size} selected clause{selectedKeys.size !== 1 ? "s" : ""} will be saved to the global library and added to the chosen template.
          </p>

          {/* Mode toggle */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setTemplateMode("existing")}
              className={`flex-1 py-1.5 font-medium transition-colors ${templateMode === "existing" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800"}`}
            >
              Existing Template
            </button>
            <button
              type="button"
              onClick={() => setTemplateMode("new")}
              className={`flex-1 py-1.5 font-medium transition-colors ${templateMode === "new" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800"}`}
            >
              New Template
            </button>
          </div>

          {templateMode === "existing" ? (
            <div className="space-y-2">
              <Input
                placeholder="Search templates…"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No templates found</p>
                ) : (
                  templates.map((t: any) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplate({ id: t.id, name: t.template_name })}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                        selectedTemplate?.id === t.id
                          ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span className="font-medium truncate">{t.template_name}</span>
                      <span className="shrink-0 text-muted-foreground">{t.section_count} clauses</span>
                    </button>
                  ))
                )}
              </div>
              {selectedTemplate && (
                <p className="text-xs text-violet-600 dark:text-violet-400">
                  Selected: <strong>{selectedTemplate.name}</strong>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">New Template Name</label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Service Contract Template"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">A new template will be created with this name.</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplateDialogOpen(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAsTemplate}
              disabled={
                saveAsTemplateMutation.isPending ||
                (templateMode === "existing" && !selectedTemplate) ||
                (templateMode === "new" && !newTemplateName.trim())
              }
              className="bg-violet-600 hover:bg-violet-700 h-8 text-xs gap-1.5"
            >
              {saveAsTemplateMutation.isPending
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                : <><Plus className="h-3 w-3" /> Save to Template</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
