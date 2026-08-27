import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChatComposer } from "@/components/ui/ChatComposer";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Clock,
  Eye,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
  X,
  Zap,
} from "lucide-react";
import {
  hasMeaningfulDraftContent,
  useVendorRegistrationDraft,
} from "@/pages/modules/vendor-registration/vendor-registration-draft-context";
import { isVendorDocumentGatheringComplete } from "@shared/vendor-registration-ai-document-flow";
import { buildVendorUploadAssistantMarkdown } from "@shared/vendor-registration-draft-chat-summary";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { mergeDraftWithProfileForDisplay } from "@/pages/modules/vendor-registration/draft-profile-merge";
import { DocumentExtractionSummaryCard } from "@/pages/modules/vendor-registration/document-extraction-summary-card";
import {
  getVendorRegistrationStorageScope,
  readScopedSessionRaw,
  removeAllVendorAiChatKeysForScope,
  vendorAiChatStorageKey,
} from "@/pages/modules/vendor-registration/vendor-registration-storage-scope";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Collapse older assistant replies that echoed raw extraction / missing lists. */
function stripLegacyAssistantNoise(text: string): string {
  if (
    !/Document type\(s\) so far|Still required \(company\)|Still required \(banking\)|From your document\(s\):/i.test(
      text,
    )
  ) {
    return text;
  }
  return "We've updated your registration draft. Use **Confirm & Continue** below, or **Switch to Manual Form**, to review on the manual form.";
}

function formatMarkdown(text: string) {
  const cleaned = stripLegacyAssistantNoise(text);
  let escaped = escapeHtml(cleaned);
  let html = escaped
    .replace(/## (.*?)$/gm, '<h3 class="font-semibold text-sm mt-3 mb-1">$1</h3>')
    .replace(/### (.*?)$/gm, '<h4 class="font-medium text-xs mt-2 mb-1 text-muted-foreground">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/✅/g, '<span class="text-amber-700 dark:text-amber-400" aria-hidden="true">•</span>')
    .replace(/❌/g, '<span class="text-red-500">&#10007;</span>')
    .replace(/\| (.*?) \|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => c.trim().match(/^-+$/))) return '';
      return `<div class="flex gap-4 text-xs py-0.5">${cells.map(c => `<span class="min-w-[80px]">${c.trim()}</span>`).join('')}</div>`;
    })
    .replace(/^- (.*?)$/gm, '<div class="flex items-start gap-1.5 text-xs py-0.5"><span class="text-muted-foreground mt-0.5">&bull;</span><span>$1</span></div>')
    .replace(/\n\n/g, '<div class="h-2"></div>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/<br\/>\s*(<div class="flex|<h[34])/g, '$1');
  return html;
}

const starterPrompts = [
  "I have my documents ready, let's start",
  "Let's start my registration",
  "I want to register as a supplier",
  "What documents do you need from me?",
];

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: string[];
  extraction?: {
    draft: import("@/pages/modules/vendor-registration/vendor-registration-draft-context").VendorRegistrationDraftSession;
    lastUploadExtraction?: { company: Record<string, string>; banking: Record<string, string> } | null;
    extractionsPerFile?: Array<{ company: Record<string, string>; banking: Record<string, string> }> | null;
    documentTypesProcessedInBatch?: string[];
  };
}

interface PersistedConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: string[];
}

interface AiChatResponse {
  response: string;
  draft?: import("@/pages/modules/vendor-registration/vendor-registration-draft-context").VendorRegistrationDraftSession;
  /** Set when structured document(s) were processed in this response */
  lastDocumentType?: string;
  /** Non-empty fields from structured extraction for this request only (post validation). */
  lastUploadExtraction?: { company: Record<string, string>; banking: Record<string, string> };
  extractionsPerFile?: Array<{ company: Record<string, string>; banking: Record<string, string> }>;
  /** Structured documentType from each file processed in this request (same order as successful extractions). */
  documentTypesProcessedInBatch?: string[];
  missingMandatory?: {
    company: string[];
    banking: string[];
    companyLabels: string[];
    bankingLabels: string[];
  };
  validationWarnings?: string[];
}

export default function VendorAIChat() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const {
    applyServerDraft,
    confirmDraftOnServer,
    setHighlightFromAi,
    refreshDraftFromServer,
    clearDraftLocalAndServer,
    draft,
    applySessionDraftMergeAndSync,
    setServerAutoSaveEnabled,
    persistDraftToServerNow,
  } = useVendorRegistrationDraft();
  const [startOverPending, setStartOverPending] = useState(false);

  const { data: vendorProfile } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
  });
  const { data: bankAccounts } = useQuery<any[]>({
    queryKey: ["/api/vendor/bank-accounts"],
  });
  const { data: allDocuments } = useQuery<any[]>({
    queryKey: ["/api/vendor/documents"],
  });

  const storageScope = useMemo(
    () => getVendorRegistrationStorageScope(vendorProfile),
    [vendorProfile],
  );
  const chatStorageKey = useMemo(
    () => vendorAiChatStorageKey(storageScope),
    [storageScope],
  );

  const handleStartOver = async () => {
    if (startOverPending || chatMutation.isPending) return;
    setStartOverPending(true);
    try {
      const { profileReset } = await clearDraftLocalAndServer();
      setConversation([]);
      setPrompt("");
      setPendingFiles([]);
      removeAllVendorAiChatKeysForScope(getVendorRegistrationStorageScope(vendorProfile));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/bank-accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/scope-of-supply"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/status"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/workflow-approval-history"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/registration-summary"] }),
      ]);
      toast({
        title: "Started over",
        description: profileReset
          ? "Your saved registration sections, uploaded certificates, AI draft, and this chat were cleared. You can start fresh."
          : "Your draft and this chat were cleared. Upload again whenever you are ready.",
      });
    } catch {
      toast({
        title: "Could not clear draft",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setStartOverPending(false);
    }
  };

  const switchToManualForm = async () => {
    try {
      if (draft && hasMeaningfulDraftContent(draft)) {
        // Field data is kept local during the chat — persist it to the server only now,
        // on the explicit Confirm & Continue / Switch action, then confirm.
        await persistDraftToServerNow();
        await confirmDraftOnServer();
        // Turn on AI review highlights only when a real extraction happened in this chat
        // session. `draft` is loaded from the existing saved profile on mount, so merely
        // opening and closing the assistant (no upload/extraction) leaves it non-empty —
        // that is not an AI extraction and must never paint the manual form red/amber.
        if (hasExtractionMessage) {
          setHighlightFromAi(true);
          navigate("/vendor/register/company-details?source=ai-draft");
        } else {
          navigate("/vendor/register/company-details");
        }
        return;
      }
      navigate("/vendor/register/company-details");
    } catch {
      toast({
        title: "Could not continue",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatHydratedScopeRef = useRef<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    refreshDraftFromServer();
  }, [refreshDraftFromServer]);

  // While on the AI chat, extracted/edited field data stays local — it is persisted to
  // the server session only when the user clicks Confirm & Continue. Re-enable normal
  // auto-save (used by the manual form) when leaving this page.
  useEffect(() => {
    setServerAutoSaveEnabled(false);
    return () => setServerAutoSaveEnabled(true);
  }, [setServerAutoSaveEnabled]);

  useEffect(() => {
    if (chatHydratedScopeRef.current === storageScope) {
      return;
    }
    chatHydratedScopeRef.current = storageScope;

    try {
      const raw = readScopedSessionRaw(storageScope, "chat");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          prompt?: string;
          conversation?: PersistedConversationMessage[];
        };
        const conv = parsed.conversation ?? [];
        setPrompt(parsed.prompt ?? "");
        setConversation(
          conv.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        );
      } else {
        setPrompt("");
        setConversation([]);
      }
    } catch (error) {
      console.error("[VendorAIChat] Failed to restore persisted chat:", error);
      removeAllVendorAiChatKeysForScope(storageScope);
    } finally {
      setIsHydrated(true);
    }
  }, [storageScope, chatStorageKey]);

  useEffect(() => {
    if (!isHydrated) return;
    sessionStorage.setItem(
      chatStorageKey,
      JSON.stringify({ prompt, conversation }),
    );
  }, [prompt, conversation, isHydrated, chatStorageKey]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const chatMutation = useMutation({
    mutationFn: async ({ userPrompt, history, files, currentDraft }: { userPrompt: string; history: ConversationMessage[]; files: File[]; currentDraft: import("@/pages/modules/vendor-registration/vendor-registration-draft-context").VendorRegistrationDraftSession | null }) => {
      const formData = new FormData();
      formData.append("prompt", userPrompt);
      formData.append("conversationHistory", JSON.stringify(
        history.map(m => ({ role: m.role, content: m.content }))
      ));
      // Carry the locally-accumulated draft so the server can merge new extractions onto
      // it without auto-persisting field data to its session (saved only on confirm).
      if (currentDraft) {
        formData.append("currentDraft", JSON.stringify(currentDraft));
      }
      files.forEach(file => {
        formData.append("files", file);
      });

      const response = await apiRequest("POST", "/api/vendor/ai-chat", formData);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      return response.json() as Promise<AiChatResponse>;
    },
    onSuccess: (result, variables) => {
      const attachmentNames = variables.files.map(f => f.name);
      const displayContent = attachmentNames.length > 0
        ? `${variables.userPrompt || "Uploaded documents"}${attachmentNames.length > 0 ? `\n[Attached: ${attachmentNames.join(", ")}]` : ""}`
        : variables.userPrompt;

      const hadFileUpload = attachmentNames.length > 0;
      const hadStructuredBatch = (result.documentTypesProcessedInBatch?.length ?? 0) > 0;
      if (
        result.draft &&
        (hasMeaningfulDraftContent(result.draft) || (hadFileUpload && hadStructuredBatch))
      ) {
        applyServerDraft(result.draft, result.missingMandatory ?? null);
      }

      const assistantMarkdown =
        hadFileUpload && result.draft
          ? buildVendorUploadAssistantMarkdown(
            result.draft,
            attachmentNames,
            result.lastDocumentType,
            {
              company: result.missingMandatory?.company ?? [],
              banking: result.missingMandatory?.banking ?? [],
            },
            result.lastUploadExtraction ?? null,
            result.documentTypesProcessedInBatch,
          )
          : result.response;

      setConversation(prev => [
        ...prev,
        { role: "user" as const, content: displayContent, timestamp: new Date(), attachments: attachmentNames },
        {
          role: "assistant" as const,
          content: assistantMarkdown,
          timestamp: new Date(),
          extraction:
            hadFileUpload && hadStructuredBatch && result.draft
              ? {
                draft: result.draft,
                lastUploadExtraction: result.lastUploadExtraction ?? null,
                extractionsPerFile: result.extractionsPerFile ?? null,
                documentTypesProcessedInBatch: result.documentTypesProcessedInBatch,
              }
              : undefined,
        },
      ]);
      setPrompt("");
      setPendingFiles([]);

      if (hadFileUpload) {
        void queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
      }

      if (result.validationWarnings?.length && !hadFileUpload) {
        toast({
          title: "Review",
          description: result.validationWarnings.slice(0, 3).join(" "),
          variant: "default",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process your message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Use session `draft` only — merged profile can look "filled" before any AI upload.
  const hasExtractionMessage = useMemo(
    () => conversation.some((msg) => !!msg.extraction?.draft),
    [conversation],
  );
  const hasDraft = isHydrated && draft != null && hasMeaningfulDraftContent(draft);
  const isDocGatheringComplete = !!(
    draft && isVendorDocumentGatheringComplete(draft.uploadedDocumentTypes ?? [])
  );
  const showConfirmContinueBar = hasDraft && (hasExtractionMessage || isDocGatheringComplete);

  const handleSubmit = () => {
    if (!prompt.trim() && pendingFiles.length === 0) return;
    chatMutation.mutate({ userPrompt: prompt, history: conversation, files: pendingFiles, currentDraft: draft });
  };


  const handleStarterClick = (text: string) => {
    chatMutation.mutate({ userPrompt: text, history: conversation, files: [], currentDraft: draft });
  };

  const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);
  const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
  const maxFileSizeBytes = 5 * 1024 * 1024;

  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const queueFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      const isAllowedType =
        (f.type && allowedMimeTypes.has(f.type)) ||
        (ext ? allowedExtensions.has(ext) : false);
      if (!isAllowedType) {
        toast({ title: `${f.name}: Only PDF, JPG, PNG files are accepted`, variant: "destructive" });
        return false;
      }
      if (f.size > maxFileSizeBytes) {
        toast({ title: `${f.name}: File too large (max 5MB)`, variant: "destructive" });
        return false;
      }
      return true;
    });
    if (validFiles.length > 0) {
      setPendingFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      queueFiles(newFiles);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (chatMutation.isPending) return;
    if (!isFileDrag(e)) return;
    dragCounterRef.current += 1;
    if (!isDragging) setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (chatMutation.isPending) return;
    if (!isFileDrag(e)) return;
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (chatMutation.isPending) return;
    if (!isFileDrag(e)) return;
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) queueFiles(dropped);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png'].includes(ext || '')) return ImageIcon;
    return FileText;
  };

  const normalizeDocName = (value: string | undefined | null) => {
    if (!value) return "";
    return value
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  };

  const normalizeDocBase = (value: string | undefined | null) => {
    const n = normalizeDocName(value);
    return n.replace(/\.[^.]+$/, "");
  };

  const inferMimeFromFilename = (name: string | undefined | null) => {
    const n = String(name ?? "").toLowerCase();
    if (n.endsWith(".pdf")) return "application/pdf";
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
    if (n.endsWith(".png")) return "image/png";
    return "";
  };

  const resolveDocUriMime = (doc: any) => {
    const filetype = String(doc?.filetype || "").toLowerCase();
    const filename = String(doc?.filename || doc?.doc_name || "").toLowerCase();
    const isPdf = filetype.includes("pdf") || filename.endsWith(".pdf");
    if (isPdf) return "image/png";
    if (filetype.startsWith("image/")) return filetype;
    return inferMimeFromFilename(filename) || "image/png";
  };

  const resolveDownloadMime = (doc: any, blobType: string) => {
    const cleanedBlobType = blobType && blobType !== "application/octet-stream" ? blobType : "";
    if (cleanedBlobType) return cleanedBlobType;
    const filetype = String(doc?.filetype || "").toLowerCase();
    if (filetype && filetype !== "application/octet-stream") return filetype;
    return inferMimeFromFilename(doc?.filename || doc?.doc_name || "");
  };

  const resolveDocumentForAttachment = (name: string) => {
    const docs = allDocuments || [];
    if (!docs.length) return null;
    const target = normalizeDocName(name);
    const targetBase = normalizeDocBase(name);
    const matches = docs.filter((doc: any) => {
      const fileName = normalizeDocName(doc.filename || doc.doc_name || "");
      const fileBase = normalizeDocBase(doc.filename || doc.doc_name || "");
      if (fileName && (fileName === target || fileBase === targetBase)) return true;
      const docName = normalizeDocName(doc.doc_name || "");
      const docBase = normalizeDocBase(doc.doc_name || "");
      return docName && (docName === target || docBase === targetBase);
    });
    if (!matches.length) return null;
    return matches.sort((a: any, b: any) => Number(b.id || 0) - Number(a.id || 0))[0];
  };

  const openPreview = async (doc: any) => {
    if (!doc) return;
    setPreviewDoc(doc);
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewMime(null);
    if (doc.doc_uri) {
      const docUriMime = resolveDocUriMime(doc);
      setPreviewUrl(`data:${docUriMime};base64,${doc.doc_uri}`);
      setPreviewMime(docUriMime);
      return;
    }
    if (!doc.id) {
      setPreviewError("Preview is not available for this document.");
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/vendor/documents/${doc.id}/download`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
      const blob = await res.blob();
      const inferredMime = resolveDownloadMime(doc, blob.type);
      const finalBlob =
        inferredMime && inferredMime !== blob.type
          ? new Blob([blob], { type: inferredMime })
          : blob;
      const url = URL.createObjectURL(finalBlob);
      setPreviewUrl(url);
      setPreviewMime(inferredMime || blob.type || doc.filetype || "");
    } catch {
      setPreviewError("Could not load the document preview. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPendingPreview = async (name: string) => {
    if (!name) return;
    setPreviewDoc({ filename: name, doc_name: name });
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewMime(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/vendor/ai-chat/pending-documents/${encodeURIComponent(name)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
      const blob = await res.blob();
      const inferredMime = resolveDownloadMime({ filename: name }, blob.type);
      const finalBlob =
        inferredMime && inferredMime !== blob.type
          ? new Blob([blob], { type: inferredMime })
          : blob;
      const url = URL.createObjectURL(finalBlob);
      setPreviewUrl(url);
      setPreviewMime(inferredMime || blob.type || "");
    } catch {
      setPreviewError("Could not load the document preview. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewUrl(null);
    setPreviewMime(null);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const infoFeatures = [
    { icon: Upload, title: "Document-First", desc: "Upload certificates and I'll extract all the details automatically" },
    { icon: Zap, title: "5-Minute Setup", desc: "Complete registration in minutes, not days" },
    { icon: ShieldCheck, title: "Secure processing", desc: "Your documents are handled securely and not kept in raw form after processing" },
    { icon: Clock, title: "Smart Auto-Fill", desc: "AI reads your documents and fills the forms for you" },
  ];

  const keyLabelMap: Record<string, string> = {
    // company / incorporation
    type_of_company: "Company name",
    legal_entity_type: "Legal entity type",
    pan_no: "Primary tax ID",
    start_date: "Incorporation date",
    address_1: "Address",
    city: "City",
    state: "State",
    country: "Country",
    postalcode: "Postal code",
    phone: "Phone",
    email_id: "Email",
    web_address: "Website",
    // tax
    tax_reg_no: "GST / tax registration no.",
    tax_payer_id: "TIN / tax payer ID",
    tax_effective_date: "Effective from",
    // banking
    bank_name: "Bank name",
    branch_name: "Branch",
    beneficiary_name: "Account name",
    account_no: "Account number",
    ifsccode: "IFSC code",
    swift_code: "SWIFT code",
    bank_account_type: "Account type",
    // license
    license_no: "License number",
    expiry_date: "License expiry",
    place_of_issue: "Place of issue",
  };

  const maskAccount = (raw: string) => {
    const v = String(raw ?? "").trim();
    if (!v) return "";
    const digits = v.replace(/\D/g, "");
    if (digits.length < 6) return "••••";
    return `•••• ${digits.slice(-4)}`;
  };

  function pickImportantKeysForDocType(docType?: string | null): string[] {
    const t = String(docType ?? "").toLowerCase();
    // best-effort mapping only; logic stays unchanged
    if (t.includes("bank") || t.includes("cheque")) {
      return ["beneficiary_name", "bank_name", "branch_name", "account_no", "ifsccode", "swift_code", "bank_account_type"];
    }
    if (t.includes("gst") || t.includes("tax") || t.includes("vat")) {
      return ["tax_reg_no", "tax_payer_id", "tax_effective_date", "state"];
    }
    if (t.includes("license") || t.includes("trade")) {
      return ["license_no", "expiry_date", "place_of_issue", "start_date"];
    }
    // incorporation / company default
    return ["type_of_company", "legal_entity_type", "pan_no", "start_date", "address_1", "city", "state", "country", "postalcode", "phone", "email_id", "web_address"];
  }

  function preferredSectionForDocType(docType?: string | null): "company" | "banking" {
    const t = String(docType ?? "").toLowerCase();
    if (t.includes("bank") || t.includes("cheque")) return "banking";
    return "company";
  }

  function buildBulletPairs(
    draftForValues: import("@/pages/modules/vendor-registration/vendor-registration-draft-context").VendorRegistrationDraftSession,
    slice: { company: Record<string, string>; banking: Record<string, string> } | null | undefined,
    docType?: string | null,
  ): Array<{
    key: string;
    section: "company" | "banking";
    label: string;
    value: string;
    displayValue?: string;
  }> {
    const keys = pickImportantKeysForDocType(docType);
    const preferredSection = preferredSectionForDocType(docType);
    const out: Array<{
      key: string;
      section: "company" | "banking";
      label: string;
      value: string;
      displayValue?: string;
    }> = [];

    const draftCompany = draftForValues.company || {};
    const draftBanking = draftForValues.banking || {};
    const sliceCompany = slice?.company || {};
    const sliceBanking = slice?.banking || {};

    const pickVal = (section: "company" | "banking", key: string) => {
      const fromSlice =
        section === "company" ? sliceCompany[key] : sliceBanking[key];
      const otherSlice =
        section === "company" ? sliceBanking[key] : sliceCompany[key];
      const s = String(fromSlice ?? "").trim();
      const os = String(otherSlice ?? "").trim();
      if (!s && !os) return "";

      const fromDraft =
        section === "company" ? draftCompany[key] : draftBanking[key];
      const d = String(fromDraft ?? "").trim();
      if (d) return d;
      if (s) return s;

      const otherDraft =
        section === "company" ? draftBanking[key] : draftCompany[key];
      const od = String(otherDraft ?? "").trim();
      if (od) return od;
      if (os) return os;
      return "";
    };

    for (const key of keys) {
      // Ensure edits for bank docs apply to banking slice (and company docs to company slice),
      // even when both sections share a key like `country`.
      const section: "company" | "banking" = preferredSection;
      const v = pickVal(section, key);
      if (!v) continue;

      const label = keyLabelMap[key] || key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
      out.push({
        key,
        section,
        label,
        value: v,
        displayValue: key === "account_no" ? maskAccount(v) : undefined,
      });
    }
    return out;
  }

  const faqItems = [
    { q: "What documents do I need?", a: "Incorporation Certificate, GST/Tax Certificate, Bank Letter or Cancelled Cheque, and your Business License." },
    { q: "What file formats work?", a: "PDF, JPG, and PNG files up to 5MB each." },
    { q: "Can I complete this later?", a: "Yes, your progress is saved. You can return anytime to continue." },
  ];

  return (
    <div className="flex h-full min-h-0 p-4 gap-4">
      <div className="hidden lg:flex flex-col w-80 flex-shrink-0 gap-4 overflow-y-auto pr-3" data-testid="ai-info-panel">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 mb-3"
            data-testid="button-switch-to-form"
            onClick={() => void switchToManualForm()}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Switch to Manual Form
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mb-3 w-full justify-start text-muted-foreground"
            data-testid="button-start-over-ai-draft"
            disabled={startOverPending || chatMutation.isPending}
            onClick={() => void handleStartOver()}
          >
            {startOverPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Start over
          </Button>

          <div className="flex items-center gap-2.5 mb-2">
            <div className="p-2 rounded-md bg-cyan-100 dark:bg-cyan-900/30">
              <Bot className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="font-semibold text-base" data-testid="text-ai-registration-title">AI Registration Assistant</h2>
              <Badge variant="outline" className="gap-1 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 text-[10px]">
                <Sparkles className="h-2.5 w-2.5" />
                AI-Powered
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Your intelligent registration companion. Upload your business documents and let AI handle the heavy lifting.
          </p>
        </div>

        <Card>
          <CardContent className="p-3 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">How it works</h3>
            {infoFeatures.map((f, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-md bg-cyan-50 dark:bg-cyan-900/20 flex-shrink-0 mt-0.5">
                  <f.icon className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight">{f.title}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{f.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <HelpCircle className="h-3 w-3" /> FAQ
            </h3>
            {faqItems.map((faq, i) => (
              <div key={i}>
                <p className="text-xs font-medium">{faq.q}</p>
                <p className="text-xs text-muted-foreground leading-snug">{faq.a}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="flex items-center gap-2 mb-3 flex-shrink-0 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            data-testid="button-switch-to-form-mobile"
            onClick={() => void switchToManualForm()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-muted-foreground shrink-0"
            data-testid="button-start-over-ai-draft-mobile"
            disabled={startOverPending || chatMutation.isPending}
            onClick={() => void handleStartOver()}
          >
            {startOverPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Start over
          </Button>
          <div className="p-1.5 rounded-md bg-cyan-100 dark:bg-cyan-900/30">
            <Bot className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">AI Registration Assistant</h1>
        </div>

        <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <CardContent
            className="flex-1 p-0 flex flex-col min-h-0 overflow-hidden relative"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div
              className={`pointer-events-none absolute inset-3 rounded-lg border-2 border-dashed bg-muted/70 flex items-center justify-center text-sm text-muted-foreground transition-opacity ${isDragging ? "opacity-100" : "opacity-0"
                }`}
            >
              Drop PDF, JPG, PNG files to upload
            </div>
            <div
              className="flex-1 min-h-0 overflow-y-auto space-y-4 p-4 pb-2"
              data-testid="chat-messages-vendor-reg"
            >
              {conversation.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <div className="p-4 rounded-full bg-cyan-100 dark:bg-cyan-900/30 mb-4">
                    <Bot className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1" data-testid="text-ai-welcome">Ready to get started?</h3>
                  <p className="text-sm text-muted-foreground max-w-md mb-4">
                    Upload your business documents or start a conversation. I'll guide you through the entire registration process.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {starterPrompts.map((sp, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => handleStarterClick(sp)}
                        data-testid={`button-starter-prompt-${i}`}
                      >
                        {sp}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {conversation.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                      {msg.role === "assistant" && (
                        <div className="p-1.5 rounded-md bg-cyan-100 dark:bg-cyan-900/30 h-fit flex-shrink-0">
                          <Bot className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                        </div>
                      )}
                      <div
                        className={`rounded-xl px-3.5 py-2.5 max-w-[min(96%,52rem)] ${msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/80 border border-border/60 shadow-sm"
                          }`}
                      >
                        {msg.role === "assistant" ? (
                          <div className="space-y-3">
                            {msg.extraction?.draft && (() => {
                              const prev = conversation[i - 1];
                              const files = prev?.role === "user" ? (prev.attachments ?? []) : [];
                              const types = msg.extraction?.documentTypesProcessedInBatch ?? [];
                              const mergedForValues = mergeDraftWithProfileForDisplay(
                                draft ?? msg.extraction.draft ?? null,
                                vendorProfile,
                                bankAccounts,
                              );
                              const show = files.length > 0 ? files : ["Uploaded document"];
                              return (
                                <div className="space-y-2" data-testid="ai-extraction-summaries">
                                  {show.map((fileName, idx) => {
                                    const docType = types[idx] ?? msg.extraction?.draft?.fieldMeta?.lastDocumentType ?? null;
                                    const fileExtraction = msg.extraction?.extractionsPerFile?.[idx] ?? msg.extraction?.lastUploadExtraction ?? null;
                                    const bulletPairs = buildBulletPairs(
                                      mergedForValues,
                                      fileExtraction,
                                      docType,
                                    );
                                    return (
                                      <DocumentExtractionSummaryCard
                                        key={`${fileName}-${idx}`}
                                        fileName={fileName}
                                        processedAt={msg.timestamp}
                                        documentType={docType}
                                        extractedValues={bulletPairs}
                                        onApplyEdits={(patch) => {
                                          void applySessionDraftMergeAndSync(patch);
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              );
                            })()}
                            <div
                              className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_h3]:text-foreground [&_h4]:text-muted-foreground [&_strong]:text-foreground [&_ul]:my-1 [&_li]:my-0.5"
                              dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                            />
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm whitespace-pre-wrap">{msg.content.split('\n[Attached:')[0]}</p>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {msg.attachments.map((name, idx) => {
                                  const Icon = getFileIcon(name);
                                  const docMatch = resolveDocumentForAttachment(name);
                                  const canPreview = !!docMatch || !!inferMimeFromFilename(name);
                                  return (
                                    <span key={idx} className="inline-flex items-center gap-1 text-xs bg-primary-foreground/20 rounded px-1.5 py-0.5">
                                      <Icon className="h-3 w-3" />
                                      {name}
                                      {canPreview && (
                                        <button
                                          type="button"
                                          className="ml-0.5 rounded-sm p-0.5 hover:bg-primary-foreground/20"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (docMatch) {
                                              void openPreview(docMatch);
                                            } else {
                                              void openPendingPreview(name);
                                            }
                                          }}
                                          title="View document"
                                          data-testid={`button-view-attachment-${idx}`}
                                        >
                                          <Eye className="h-3 w-3" />
                                        </button>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        <p className="text-xs opacity-50 mt-1.5">
                          {formatDate(msg.timestamp)}
                        </p>
                      </div>
                      {msg.role === "user" && (
                        <div className="p-1.5 rounded-md bg-primary/10 h-fit flex-shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <div className="p-1.5 rounded-md bg-cyan-100 dark:bg-cyan-900/30 h-fit">
                    <Bot className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/80 px-3.5 py-2.5 flex items-center gap-2 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {pendingFiles.length > 0 ? "Reading your documents…" : "Thinking…"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 border-t bg-card p-3 pt-2 space-y-2">
              {showConfirmContinueBar && (
                <div
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  data-testid="vendor-ai-draft-summary"
                >
                  <p className="text-sm text-muted-foreground">
                    {isDocGatheringComplete
                      ? "All required documents are uploaded. Continue to the form to review or complete remaining details."
                      : "Documents processed. Continue to the form to review or complete remaining details."}
                  </p>
                  <Button
                    size="sm"
                    className="w-full shrink-0 sm:w-auto"
                    onClick={() => void switchToManualForm()}
                    data-testid="button-confirm-continue-ai-draft"
                  >
                    Confirm & Continue
                  </Button>
                </div>
              )}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2" data-testid="pending-files-list">
                  {pendingFiles.map((file, index) => {
                    const Icon = getFileIcon(file.name);
                    return (
                      <div key={index} className="inline-flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-[11px]">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="max-w-[160px] truncate">{file.name}</span>
                        <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)}KB)</span>
                        <button
                          onClick={() => removePendingFile(index)}
                          className="ml-0.5 rounded-sm hover-elevate"
                          data-testid={`button-remove-file-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                data-testid="input-file-upload"
              />
              <ChatComposer
                isCompact
                placeholder={pendingFiles.length > 0
                  ? "Add a message with your documents (optional)..."
                  : "Type your message or attach documents..."}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={chatMutation.isPending}
                textareaDataTestId="input-vendor-ai-chat"
                submitDataTestId="button-vendor-ai-send"
                onSubmit={handleSubmit}
                isStreaming={chatMutation.isPending}
                colorTheme="cyan"
                isSubmitDisabled={(!prompt.trim() && pendingFiles.length === 0) || chatMutation.isPending}
                leftActions={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 rounded-md"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={chatMutation.isPending}
                    data-testid="button-attach-file"
                    type="button"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!previewDoc}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              {previewDoc?.filename || previewDoc?.doc_name || "Document Preview"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 rounded-md min-h-[280px]">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading preview...
              </div>
            ) : previewError ? (
              <p className="text-sm text-muted-foreground">{previewError}</p>
            ) : previewUrl ? (
              previewMime?.startsWith("image/") || previewUrl.startsWith("data:image/") ? (
                <img
                  src={previewUrl}
                  alt="Document preview"
                  className="max-w-full max-h-[65vh] object-contain"
                  data-testid="img-vendor-ai-preview"
                />
              ) : (
                <iframe
                  title="Document preview"
                  src={previewUrl}
                  className="w-full h-[65vh]"
                />
              )
            ) : (
              <p className="text-sm text-muted-foreground">Preview not available.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
