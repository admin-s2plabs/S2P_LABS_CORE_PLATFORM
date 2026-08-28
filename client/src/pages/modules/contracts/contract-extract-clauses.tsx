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
  FileText,
  LayoutTemplate,
  Loader2,
  Plus,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";

export default function ContractExtractClauses() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging]     = useState(false);
  const [extracting, setExtracting]     = useState(false);

  const [clauses, setClauses]           = useState<any[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());
  const [saved, setSaved]               = useState(false);

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

  // ── Text extraction ────────────────────────────────────────────────────────
  async function extractTextFromFile(file: File): Promise<string> {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((item: any) => item.str).join(" ") + "\n";
      }
      return fullText;
    }
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    if (name.endsWith(".doc")) {
      throw new Error(
        "Legacy .doc format is not supported for text extraction. Please open your file in Microsoft Word and save it as .docx (File → Save As → Word Document), then upload again."
      );
    }
    throw new Error("Unsupported file type. Please upload a PDF or DOCX file.");
  }

  function handleFileDrop(file: File) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".doc")) {
      toast({
        title: "Legacy .doc format not supported",
        description: "Please save your Word document as .docx (File → Save As → Word Document) and upload again. PDF files are also accepted.",
        variant: "destructive",
      });
      return;
    }
    if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
      toast({ title: "Unsupported file type", description: "Please upload a PDF or DOCX file.", variant: "destructive" });
      return;
    }
    setUploadedFile(file);
    setClauses([]);
    setSelectedKeys(new Set());
    setExpandedKeys(new Set());
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileDrop(file);
  }, []);

  async function handleExtract() {
    if (!uploadedFile) return;
    try {
      setExtracting(true);
      const documentText = await extractTextFromFile(uploadedFile);
      if (!documentText.trim()) throw new Error("Could not read any text from this file.");
      const resp = await apiRequest("POST", "/api/contracts/ai/extract", { documentText });
      const result: any = await resp.json();
      if (!resp.ok) throw new Error(result?.error || "AI request failed");
      const extracted: any[] = result.clauses || [];
      if (extracted.length === 0) {
        toast({
          title: "No clauses found",
          description: "The AI couldn't identify any clauses. Make sure the PDF contains selectable text (not a scanned image), or try uploading a DOCX file instead.",
          variant: "destructive",
        });
        return;
      }
      setClauses(extracted);
      const sel = new Set<number>();
      const exp = new Set<number>();
      extracted.forEach((c: any, i: number) => {
        if (!c._already_exists) sel.add(i);
        exp.add(i);
      });
      setSelectedKeys(sel);
      setExpandedKeys(exp);
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }

  function getSelectedClauses() {
    return clauses
      .filter((_, i) => selectedKeys.has(i))
      .map((c) => { const { _already_exists, _match_name, ...rest } = c; return rest; });
  }

  // ── Save to Library ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (toSave: any[]) =>
      apiRequest("POST", "/api/contracts/ai/save-library-clauses", { clauses: toSave }).then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/sections"] });
      setSaved(true);
      toast({ title: `${data.count} clauses added to your library!` });
    },
    onError: () => toast({ title: "Failed to save clauses", variant: "destructive" }),
  });

  // ── Save as Template ───────────────────────────────────────────────────────
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
    const toSave = getSelectedClauses();
    if (templateMode === "existing") {
      if (!selectedTemplate) return;
      saveAsTemplateMutation.mutate({ clauses: toSave, templateId: selectedTemplate.id, templateName: selectedTemplate.name });
    } else {
      if (!newTemplateName.trim()) return;
      saveAsTemplateMutation.mutate({ clauses: toSave, templateName: newTemplateName.trim() });
    }
  }

  function toggleKey(i: number) {
    setSelectedKeys((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  function toggleExpand(i: number) {
    setExpandedKeys((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  const existsCount = clauses.filter((c) => c._already_exists).length;
  const allSelected = clauses.length > 0 && selectedKeys.size === clauses.filter((c) => !c._already_exists).length;

  // ── Success state ──────────────────────────────────────────────────────────
  if (saved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-violet-600" />
          </div>
          <h2 className="text-xl font-bold mb-2">Clauses Imported!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {selectedKeys.size} clause{selectedKeys.size !== 1 ? "s" : ""} extracted from your contract have been added to your library.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => { setSaved(false); setUploadedFile(null); setClauses([]); setSelectedKeys(new Set()); }}>
              Extract Another
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
              <UploadCloud className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold leading-none">Extract Contract Clauses</span>
              <p className="text-xs text-muted-foreground mt-0.5 leading-none">Upload a contract — AI extracts every clause for your library</p>
            </div>
            <Badge className="bg-violet-100 text-violet-700 border-0 text-xs gap-1 dark:bg-violet-900/30 dark:text-violet-300 h-5">
              <Sparkles className="w-2.5 h-2.5" /> AI
            </Badge>
          </div>
        </div>

        {clauses.length > 0 && (
          <div className="flex items-center gap-2">
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
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0" style={{ height: "calc(100vh - 49px)" }}>

        {/* Left: Upload panel */}
        <div className="w-64 shrink-0 border-r flex flex-col bg-gray-50/40 dark:bg-gray-900/20">
          <div className="px-4 py-2.5 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upload Contract</p>
          </div>

          <div className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto">
            {/* Drop zone */}
            <div
              className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 p-6 text-center ${
                isDragging
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                  : uploadedFile
                  ? "border-violet-300 bg-violet-50/50 dark:bg-violet-900/10"
                  : "border-gray-200 dark:border-gray-700 hover:border-violet-300 hover:bg-violet-50/30 dark:hover:bg-violet-900/10"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); e.target.value = ""; }}
              />
              {uploadedFile ? (
                <>
                  <FileText className="h-8 w-8 text-violet-500" />
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-300 break-all leading-snug">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                  <button
                    type="button"
                    className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); setUploadedFile(null); setClauses([]); setSelectedKeys(new Set()); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <UploadCloud className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-xs font-medium text-muted-foreground">Drag & drop or click to upload</p>
                  <p className="text-xs text-muted-foreground/60">PDF, DOCX · Max 5 MB</p>
                </>
              )}
            </div>

            {/* Extract button */}
            <Button
              disabled={!uploadedFile || extracting}
              onClick={handleExtract}
              className="w-full bg-violet-600 hover:bg-violet-700 gap-1.5"
            >
              {extracting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</>
                : <><Sparkles className="h-4 w-4" /> Extract Clauses</>}
            </Button>

            {/* Tips */}
            {clauses.length === 0 && !extracting && (
              <div className="rounded-md bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 p-3">
                <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-1.5">How it works</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Upload a PDF, DOC, or DOCX file</li>
                  <li>• AI reads and identifies every clause</li>
                  <li>• Review, select, and save to your library</li>
                  <li>• Duplicates are automatically flagged</li>
                </ul>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                  Note: Scanned image PDFs cannot be read — use a digital PDF or Word document.
                </p>
              </div>
            )}

            {/* Result summary */}
            {clauses.length > 0 && (
              <div className="rounded-md border p-3 space-y-1.5">
                <p className="text-xs font-semibold">{clauses.length} clauses found</p>
                <p className="text-xs text-muted-foreground">
                  {selectedKeys.size} selected
                  {existsCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {existsCount} already in library</span>}
                </p>
                <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={handleExtract} disabled={extracting}>
                  <Sparkles className="h-3 w-3 mr-1" /> Re-extract
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Clause review */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

          {/* Empty state */}
          {clauses.length === 0 && !extracting && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-12 py-12">
              <UploadCloud className="h-10 w-10 text-violet-300 mb-3" />
              <h3 className="text-sm font-semibold mb-1">Upload your contract</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Upload a PDF or Word document on the left — AI will identify every clause and tag it with Mandatory, Negotiable, and Amendable flags.
              </p>
            </div>
          )}

          {/* Loading */}
          {extracting && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <div className="text-center">
                <p className="text-sm font-medium">Reading contract and extracting clauses…</p>
                <p className="text-xs text-muted-foreground mt-0.5">This takes about 15–25 seconds</p>
              </div>
            </div>
          )}

          {/* Clause list */}
          {clauses.length > 0 && !extracting && (
            <>
              <div className="flex items-center justify-between px-5 py-2 border-b bg-white dark:bg-gray-950 shrink-0 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Extracted Clauses</span>
                  <span className="text-xs text-muted-foreground">
                    {clauses.length} found · {selectedKeys.size} selected
                    {existsCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {existsCount} already in library</span>}
                  </span>
                </div>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 text-xs gap-1 px-2"
                  onClick={() =>
                    allSelected
                      ? setSelectedKeys(new Set())
                      : setSelectedKeys(new Set(clauses.map((_, i) => i).filter((i) => !clauses[i]._already_exists)))
                  }
                >
                  {allSelected ? <><Square className="h-3 w-3" /> Deselect All</> : <><CheckSquare className="h-3 w-3" /> Select All</>}
                </Button>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {clauses.map((clause: any, i: number) => {
                  const checked  = selectedKeys.has(i);
                  const expanded = expandedKeys.has(i);
                  const exists   = !!clause._already_exists;

                  return (
                    <div
                      key={i}
                      className={`transition-colors ${exists ? "opacity-60" : ""} ${checked ? "bg-violet-50/50 dark:bg-violet-900/10" : "bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900/40"}`}
                    >
                      <div className="flex items-start gap-3 px-5 py-2.5 cursor-pointer" onClick={() => toggleKey(i)}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleKey(i)}
                          className="mt-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium">{clause.section_name}</span>
                            {exists && (
                              <Badge
                                className="text-xs h-4 px-1.5 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-normal"
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
                              <Badge className="text-xs h-4 px-1 bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400 border border-violet-200 dark:border-violet-800 font-normal">Negotiable</Badge>
                            )}
                            {clause.clause_ammendable === "Yes" && (
                              <Badge className="text-xs h-4 px-1 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-normal">Amendable</Badge>
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
                            onClick={(e) => { e.stopPropagation(); toggleExpand(i); }}
                          >
                            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>

                      {expanded && clause.html_content && (
                        <div
                          className="px-5 pb-3 ml-10 text-xs text-muted-foreground leading-relaxed prose prose-xs max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: clause.html_content }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
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
              <Input
                placeholder="e.g. Service Contract Template"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="h-8 text-xs"
              />
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
