import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Download, Eye, File, FileImage, FileText, Landmark, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useVendorRegistrationDraftOptional } from "@/pages/modules/vendor-registration/vendor-registration-draft-context";
import { bankingFieldHighlightClass } from "@/pages/modules/vendor-registration/vendor-registration-field-states";
import { MANDATORY_BANKING_KEYS } from "@/pages/modules/vendor-registration/registration-mandatory";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";

function validateIBAN(iban: string): boolean {
  if (!iban) return true;
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(cleaned)) return false;
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numericStr = rearranged.split("").map(ch => {
    const code = ch.charCodeAt(0);
    return code >= 65 && code <= 90 ? (code - 55).toString() : ch;
  }).join("");
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i])) % 97;
  }
  return remainder === 1;
}

const bankSchema = z.object({
  country: z.string().min(1, "Country is required"),
  currency: z.string().min(1, "Currency is required"),
  bank_name: z.string().min(1, "Bank name is required").max(100, "Max 100 characters"),
  branch_name: z.string().min(1, "Branch name is required").max(100, "Max 100 characters"),
  swift_code: z.string().regex(/^$|^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, "Invalid SWIFT/BIC format (e.g. ABCDEFGH or ABCDEFGHIJK)").optional().or(z.literal("")),
  aba_routing: z.string().regex(/^$|^[0-9]{9}$/, "ABA routing must be 9 digits").optional().or(z.literal("")),
  ifsccode: z.string().regex(/^$|^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC format (e.g. ABCD0123456)").optional().or(z.literal("")),
  bank_address: z.string().max(200, "Max 200 characters").optional().or(z.literal("")),
  beneficiary_name: z.string().min(1, "Beneficiary name is required").max(150, "Max 150 characters"),
  account_no: z.string().min(1, "Account number is required").max(30, "Max 30 characters").regex(/^\d+$/, "Account number must contain only digits"),
  confirm_account_no: z.string().min(1, "Please confirm account number").regex(/^\d+$/, "Account number must contain only digits"),
  bank_account_type: z.string().min(1, "Account type is required"),
  street: z.string().max(200, "Max 200 characters").optional().or(z.literal("")),
  beneficiary_address: z.string().max(200, "Max 200 characters").optional().or(z.literal("")),
  city: z.string().max(50, "Max 50 characters").optional().or(z.literal("")),
  region: z.string().max(50, "Max 50 characters").optional().or(z.literal("")),
  postal_code: z.string().max(10, "Max 10 characters").optional().or(z.literal("")),
  iban_no: z.string().optional().or(z.literal("")),
  primary_account: z.string().optional(),
}).refine((data) => data.account_no === data.confirm_account_no, {
  message: "Account numbers do not match",
  path: ["confirm_account_no"],
}).refine((data) => !data.iban_no || validateIBAN(data.iban_no), {
  message: "Invalid IBAN number. Must follow international format (e.g. AE070331234567890123456)",
  path: ["iban_no"],
});

type BankFormData = z.infer<typeof bankSchema>;

const accountTypes = [
  { value: "Current", label: "Current Account" },
  { value: "Savings", label: "Savings Account" },
];

interface LookupItem {
  value: string;
  label: string;
}


const AI_BANK_DOC_MARKER_SNIPPET = "auto-uploaded via ai registration assistant";
const BANK_DOC_TYPES_ATTACH = new Set(["BANK_DOCUMENT", "bank_letter", "cancelled_cheque"]);

function isUnlinkedBankDocNo(docNo: unknown): boolean {
  if (docNo == null) return true;
  const s = String(docNo).trim();
  return s === "" || s === "0";
}

function isAiAutoUploadedBankDocDesc(docDesc: unknown): boolean {
  if (docDesc == null) return false;
  return String(docDesc).toLowerCase().includes(AI_BANK_DOC_MARKER_SNIPPET);
}

function bankDocPreviewUrl(doc: any): string | null {
  if (!doc) return null;
  if (doc.doc_uri) {
    return doc.filetype
      ? `data:${doc.filetype};base64,${doc.doc_uri}`
      : `data:image/png;base64,${doc.doc_uri}`;
  }
  if (doc.id && doc.doc_path) {
    return `/api/vendor/documents/${doc.id}/download?inline=true`;
  }
  return null;
}

function findBankDocumentForAccount(docs: any[] | undefined, bankId: unknown): any | null {
  if (!docs?.length || bankId == null) return null;
  const linked = docs.find((d) => Number(d.doc_no) === Number(bankId));
  if (linked) return linked;
  return pickNewestUnlinkedAiBankDocument(docs);
}

/** Newest AI-uploaded bank document not yet linked to a bank account (for auto-attach in the sheet). */
function pickNewestUnlinkedAiBankDocument(docs: any[] | undefined): any | null {
  if (!docs?.length) return null;
  const cands = docs.filter(
    (d) =>
      BANK_DOC_TYPES_ATTACH.has(d.doc_type) &&
      isUnlinkedBankDocNo(d.doc_no) &&
      isAiAutoUploadedBankDocDesc(d.doc_desc),
  );
  if (!cands.length) return null;
  return cands.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
}

export default function VendorBanking() {
  const [location, setLocation] = useLocation();
  const isVendorRegistrationWizard = location.startsWith("/vendor/register");
  const { toast } = useToast();
  const storedAuthStr = localStorage.getItem("prokraya-auth");
  const parsedAuth = storedAuthStr ? JSON.parse(storedAuthStr) : null;
  const vendorStatus = parsedAuth?.vendorStatus;
  const isEditMode = vendorStatus && ["Approved", "Active", "InActive", "Changes In Draft", "More Info Required", "More Information Required"].includes(vendorStatus);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<any>(null);
  const [expandedBankId, setExpandedBankId] = useState<number | null>(null);
  const [docType, setDocType] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [removedExistingDoc, setRemovedExistingDoc] = useState(false);
  const [pendingAiBankDocId, setPendingAiBankDocId] = useState<number | null>(null);
  const userDismissedAutoBankDoc = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/bank-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
  }, []);

  const { data: suppDocsList } = useQuery<LookupItem[]>({
    queryKey: ["/api/lookups/by-property/BANK_DOCUMENT"],
    select: (data: any[]) => data.map(d => ({ value: d.lookup_value, label: d.description})),
  });

  useEffect(() => {
    if (!selectedFile) {
      // Keep preview when an AI-saved bank document is auto-attached (no local File yet).
      if (pendingAiBankDocId != null) return;
      if (editingBank != null) return;
      setPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    if (selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviewUrl(ev.target?.result as string);
        setPreviewLoading(false);
      };
      reader.onerror = () => {
        setPreviewUrl(null);
        setPreviewLoading(false);
      };
      reader.readAsDataURL(selectedFile);
      return;
    }
    if (selectedFile.type === "application/pdf") {
      const renderPdfPreview = async () => {
        try {
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url
          ).toString();
          const arrayBuffer = await selectedFile.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1 });
          const scale = 200 / viewport.width;
          const scaledViewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { setPreviewLoading(false); return; }
          await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas }).promise;
          setPreviewUrl(canvas.toDataURL("image/png"));
        } catch {
          setPreviewUrl(null);
        } finally {
          setPreviewLoading(false);
        }
      };
      renderPdfPreview();
    } else {
      setPreviewLoading(false);
    }
  }, [selectedFile, pendingAiBankDocId]);

  const ALLOWED_FILE_TYPES: Record<string, string[]> = {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  };
  const MAX_FILE_SIZE_MB = 5;
  const DANGEROUS_EXTS = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".vbs", ".js", ".jar", ".php", ".html", ".htm", ".svg", ".xml", ".dll", ".scr"];

  function getFileIcon(filename: string) {
    const ext = filename?.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="h-8 w-8 text-red-500" />;
    if (['jpg', 'jpeg', 'png'].includes(ext || '')) return <FileImage className="h-8 w-8 text-blue-500" />;
    return <File className="h-8 w-8 text-muted-foreground" />;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name || "";
    if (fileName.includes("\0") || fileName.includes("..")) {
      toast({ title: "Invalid filename detected", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const ext = fileName.lastIndexOf(".") >= 0 ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase() : "";
    if (!ext) {
      toast({ title: "File must have a valid extension", variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (DANGEROUS_EXTS.includes(ext)) {
      toast({ title: `File type '${ext}' is not allowed for security reasons`, variant: "destructive" });
      e.target.value = "";
      return;
    }

    const allowedMimes = Object.keys(ALLOWED_FILE_TYPES);
    if (!allowedMimes.includes(file.type)) {
      toast({ title: "Only PDF, JPEG, PNG, DOC, and DOCX files are allowed", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const allowedExtsForType = ALLOWED_FILE_TYPES[file.type];
    if (!allowedExtsForType || !allowedExtsForType.includes(ext)) {
      toast({ title: `File extension '${ext}' does not match the file type`, variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (file.size === 0) {
      toast({ title: "File is empty", variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({ title: `File size must be less than ${MAX_FILE_SIZE_MB}MB`, variant: "destructive" });
      e.target.value = "";
      return;
    }

    setPendingAiBankDocId(null);
    setSelectedFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeSelectedFile() {
    if (pendingAiBankDocId != null) {
      userDismissedAutoBankDoc.current = true;
      setPendingAiBankDocId(null);
    }
    if (!selectedFile && (previewUrl || sheetDocForPreview != null)) setRemovedExistingDoc(true);
    setSelectedFile(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
    setDocType("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
    enabled: !!isEditMode,
  });

  const { data: bankAccounts, isLoading } = useQuery<any[]>({
    queryKey: ["/api/vendor/bank-accounts"],
  });

  const { data: countries } = useQuery<any[]>({
    queryKey: ["/api/countries"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/countries");
      if (!res.ok) return [];
      return res.json();
    },
    select: (data: any[]) => data.map(c => ({
      value: c.key_2,
      label: c.description
    }))
  });

    const getAuthHeaders = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem("prokraya-auth") || "{}"
    );

    return {
      "x-user-email": parsed.userId || "",
      "x-user-name": parsed.userName || "",
    };
  } catch {
    return {};
  }
};

  const { data: currencies } = useQuery<any[]>({
    queryKey: ["/api/vendor/lookups/currencies"],
  });

  const { data: allDocuments } = useQuery<any[]>({
    queryKey: ["/api/vendor/documents"],
  });

  const isBankDocType = (docType: string) => {
    const dt = (docType || "").toLowerCase().replace(/[\s_]/g, "");
    return ["bankdocument", "bankletter", "cancelledcheque"].includes(dt);
  };

  const bankDocuments = (allDocuments || []).filter((d: any) => isBankDocType(d.doc_type));

  const [previewDoc, setPreviewDoc] = useState<any>(null);

    async function handleDownload(doc: any) {
  try {
    const response = await fetch(
      `/api/vendor/documents/${doc.id}/download?path=${encodeURIComponent(doc.doc_path)}`,
      {
        headers: {
          ...getAuthHeaders(),
          // Or Authorization: `Bearer ${token}`
        },
      }
    );

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download =
      doc.filename || doc.doc_name || "document";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download failed:", error);
  }
}

  const form = useForm<BankFormData>({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      country: "", currency: "", bank_name: "", branch_name: "",
      swift_code: "", aba_routing: "", ifsccode: "", bank_address: "",
      beneficiary_name: "", account_no: "", confirm_account_no: "", bank_account_type: "",
      street: "", beneficiary_address: "", city: "", region: "",
      postal_code: "", iban_no: "", primary_account: "N",
    },
  });

  const watchedBank = form.watch();

  const draftCtx = useVendorRegistrationDraftOptional();
  const urlSearch = useSearch();
  const bankDraftPrefilled = useRef(false);
  const isFirstBankAiGuidedEntry = !(bankAccounts && bankAccounts.length > 0);
  const bankHighlight = !!(
    draftCtx?.highlightFromAi &&
    draftCtx?.draft &&
    isFirstBankAiGuidedEntry
  );
  const bankRing = useCallback(
    (key: keyof BankFormData) => {
      const raw = String(watchedBank[key] ?? "").trim();
      const hasHighlightValue =
        key === "primary_account" ? raw !== "" && raw !== "N" : raw !== "";
      return cn(
        bankingFieldHighlightClass(
          draftCtx?.draft ?? null,
          key as string,
          bankHighlight,
          MANDATORY_BANKING_KEYS.includes(key as string) && !raw,
          hasHighlightValue,
        ),
      );
    },
    [draftCtx?.draft, bankHighlight, watchedBank],
  );

  const onBankFormBlur = useCallback(
    (ev: React.FocusEvent<HTMLFormElement>) => {
      if (!draftCtx?.setBankingField) return;
      const t = ev.target as HTMLElement;
      if (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") return;
      const name = (t as HTMLInputElement).name;
      if (!name) return;
      draftCtx.setBankingField(name, String(form.getValues(name as keyof BankFormData) ?? ""));
    },
    [draftCtx, form],
  );

  const refreshDraftFromServer = draftCtx?.refreshDraftFromServer;
  useEffect(() => {
    void refreshDraftFromServer?.();
  }, [refreshDraftFromServer]);

  useEffect(() => {
    if (!sheetOpen || editingBank) return;
    if (bankAccounts && bankAccounts.length > 0) return;
    if (userDismissedAutoBankDoc.current) return;
    if (selectedFile) return;
    const orphan = pickNewestUnlinkedAiBankDocument(allDocuments);
    if (!orphan) return;

    if (pendingAiBankDocId !== orphan.id) {
      setPendingAiBankDocId(orphan.id);
    }
    if (orphan.doc_uri) {
      const nextUrl = orphan.filetype
        ? `data:${orphan.filetype};base64,${orphan.doc_uri}`
        : `data:image/png;base64,${orphan.doc_uri}`;
      setPreviewUrl(nextUrl);
    } else {
      setPreviewUrl(null);
    }
    setPreviewLoading(false);
  }, [sheetOpen, editingBank, bankAccounts, allDocuments, selectedFile, pendingAiBankDocId]);

  const sheetDocForPreview = useMemo(() => {
    if (!sheetOpen) return null;
    if (editingBank) return findBankDocumentForAccount(allDocuments, editingBank.id);
    if (pendingAiBankDocId != null) {
      return (allDocuments || []).find((d: any) => Number(d.id) === pendingAiBankDocId) ?? null;
    }
    return null;
  }, [sheetOpen, editingBank, allDocuments, pendingAiBankDocId]);

  const showBankDocCard = !!(previewUrl || pendingAiBankDocId != null || (sheetDocForPreview != null && !removedExistingDoc));

  useEffect(() => {
    if (bankDraftPrefilled.current) return;
    const b = draftCtx?.draft?.banking;
    if (!b || Object.keys(b).length === 0) return;
    if (bankAccounts && bankAccounts.length > 0) return;
    bankDraftPrefilled.current = true;
    const nextCountry = String(b.country ?? "").trim();
    const nextCurrency = String(b.currency ?? "").trim();
    form.reset({
      country: nextCountry || "",
      currency: nextCurrency || "",
      bank_name: b.bank_name || "",
      branch_name: b.branch_name || "",
      swift_code: b.swift_code || "",
      aba_routing: "",
      ifsccode: b.ifsccode || "",
      bank_address: b.bank_address || "",
      beneficiary_name: b.beneficiary_name || "",
      account_no: b.account_no || "",
      confirm_account_no: b.confirm_account_no || b.account_no || "",
      bank_account_type: b.bank_account_type || "",
      street: b.street || "",
      beneficiary_address: "",
      city: b.city || "",
      region: b.region || "",
      postal_code: b.postal_code || "",
      iban_no: b.iban_no || "",
      primary_account: "N",
    });
    setSheetOpen(true);
    if (new URLSearchParams(urlSearch).get("source") === "ai-draft") {
      draftCtx?.setHighlightFromAi(true);
    }
  }, [bankAccounts, draftCtx, form, urlSearch]);

  const createMutation = useMutation({
    mutationFn: (data: BankFormData) => apiRequest("POST", "/api/vendor/bank-accounts", data),
    onSuccess: async (result: any) => {
      let data: any = null;
      try { data = await result.json(); } catch (_) { }
      if (selectedFile && docType && data?.id) {
        setDocUploading(true);
        await uploadBankDocument(data.id);
        setDocUploading(false);
      } else if (pendingAiBankDocId != null && data?.id) {
        setDocUploading(true);
        try {
          await apiRequest("PATCH", `/api/vendor/documents/${pendingAiBankDocId}/link-bank`, {
            bank_id: data.id,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
        } catch (err: any) {
          toast({ title: err.message || "Failed to link bank document", variant: "destructive" });
        } finally {
          setDocUploading(false);
          setPendingAiBankDocId(null);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "banks"] });
      }
      setSheetOpen(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setDocType("");
      setPendingAiBankDocId(null);
      form.reset();
      draftCtx?.clearBankingDraftLocal?.();
      draftCtx?.setHighlightFromAi(false);
      toast({ title: "Bank account added successfully" });
    },
    onError: () => toast({ title: "Failed to add bank account", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: BankFormData & { id: number }) => apiRequest("PATCH", `/api/vendor/bank-accounts/${data.id}`, data),
    onSuccess: async (result: any) => {
      let data: any = null;
      try { data = await result.json(); } catch (_) { }
      if (selectedFile && docType && data?.id) {
        setDocUploading(true);
        await uploadBankDocument(data.id);
        setDocUploading(false);
      } else if (pendingAiBankDocId != null && data?.id) {
        setDocUploading(true);
        try {
          await apiRequest("PATCH", `/api/vendor/documents/${pendingAiBankDocId}/link-bank`, {
            bank_id: data.id,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
        } catch (err: any) {
          toast({ title: err.message || "Failed to link bank document", variant: "destructive" });
        } finally {
          setDocUploading(false);
          setPendingAiBankDocId(null);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/bank-accounts"] });
      if (isEditMode) {
        const suppId = profile?.id || result.supplierId || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "banks"] });
        const storedAuth = localStorage.getItem("prokraya-auth");
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth);
          if (parsed.vendorStatus === "Approved") parsed.vendorStatus = "Changes In Draft";
          localStorage.setItem("prokraya-auth", JSON.stringify(parsed));
        }
      }
      setSheetOpen(false);
      setEditingBank(null);
      setSelectedFile(null);
      setPreviewUrl(null);
      setDocType("");
      form.reset();
      toast({ title: isEditMode ? "Bank account updated. Submit for approval when ready." : "Bank account updated successfully" });
    },
    onError: (error: any) => toast({ title: "Failed to update bank account", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vendor/bank-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "banks"] });
      }
      toast({ title: "Bank account removed" });
    },
    onError: (error: any) => toast({ title: "Failed to remove bank account", description: error.message, variant: "destructive" }),
  });

  function openAddSheet() {
    setEditingBank(null);
    if (bankAccounts && bankAccounts.length > 0) {
      userDismissedAutoBankDoc.current = true;
      draftCtx?.setHighlightFromAi(false);
    } else {
      userDismissedAutoBankDoc.current = false;
    }
    setPendingAiBankDocId(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
    setDocType("");
    setRemovedExistingDoc(false);
    form.reset({
      country: "", currency: "", bank_name: "", branch_name: "",
      swift_code: "", aba_routing: "", ifsccode: "", bank_address: "",
      beneficiary_name: "", account_no: "", confirm_account_no: "", bank_account_type: "",
      street: "", beneficiary_address: "", city: "", region: "",
      postal_code: "", iban_no: "", primary_account: "N",
    });
    setSheetOpen(true);
  }

  function openEditSheet(bank: any) {
    setEditingBank(bank);
    userDismissedAutoBankDoc.current = false;
    setSelectedFile(null);
    setRemovedExistingDoc(false);
    const bankDoc = findBankDocumentForAccount(allDocuments, bank.id);
    const isOrphanDoc = bankDoc != null && isUnlinkedBankDocNo(bankDoc.doc_no);
    setPendingAiBankDocId(isOrphanDoc ? bankDoc.id : null);
    setPreviewUrl(bankDocPreviewUrl(bankDoc));
    setPreviewLoading(false);
    setDocType(bankDoc?.doc_type || "");
    form.reset({
      country: bank.country || "", currency: bank.currency || "",
      bank_name: bank.bank_name || "", branch_name: bank.branch_name || "",
      swift_code: bank.swift_code || "", aba_routing: bank.aba_routing || "",
      ifsccode: bank.ifsccode || "", bank_address: bank.bank_address || "",
      beneficiary_name: bank.beneficiary_name || "", account_no: bank.account_no || "",
      confirm_account_no: bank.account_no || "", bank_account_type: bank.bank_account_type || "",
      street: bank.street || "", beneficiary_address: bank.beneficiary_address || "",
      city: bank.city || "", region: bank.region || "",
      postal_code: bank.postal_code || "", iban_no: bank.iban_no || "",
      primary_account: bank.primary_account || "N",
    });
    setSheetOpen(true);
  }

  async function uploadBankDocument(bankId: number) {
    if (!selectedFile || !docType || !bankId) return;
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("doc_type", docType);
    formData.append("doc_name", selectedFile.name);
    formData.append("doc_no", String(bankId));
    if (previewUrl && previewUrl.startsWith("data:")) {
      const base64Part = previewUrl.split(",")[1];
      if (base64Part) formData.append("doc_uri", base64Part);
    }
    try {
      const res = await apiRequest("POST", "/api/vendor/documents", formData);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
    } catch (err: any) {
      toast({ title: err.message || "Failed to upload bank document", variant: "destructive" });
    }
  }

  function onSubmit(data: BankFormData) {
    if (editingBank) {
      const hasExistingDoc = !removedExistingDoc && (
        findBankDocumentForAccount(allDocuments, editingBank.id) != null || pendingAiBankDocId != null
      );
      if (!selectedFile && !hasExistingDoc) {
        toast({ title: "At least one document is required", variant: "destructive" });
        return;
      }
      updateMutation.mutate({ ...data, id: editingBank.id });
    } else {
      if (!selectedFile && pendingAiBankDocId == null) {
        toast({ title: "At least one document is required", variant: "destructive" });
        return;
      }
      if (selectedFile && !docType) {
        toast({ title: "Please select document type", variant: "destructive" });
        return;
      }
      createMutation.mutate(data);
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {isEditMode && profile?.attribute_4 === "Active" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const suppId = profile?.id || parsedAuth?.supplierId;
            setLocation(suppId ? `/app/vendors/${suppId}` : "/app/dashboard");
          }}
          data-testid="button-back-to-profile"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Profile
        </Button>
      )}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold tracking-tight" data-testid="text-banking-title">Banking Details</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Please provide <strong>valid bank details</strong> to successfully process your application form.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3 px-4">
          <CardTitle className="text-sm">Bank Accounts</CardTitle>
          <Button size="sm" onClick={openAddSheet} data-testid="button-add-bank">
            <Plus className="h-4 w-4 mr-1" /> Add Bank Account
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {bankAccounts && bankAccounts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium w-[30px]"></TableHead>
                  <TableHead className="text-xs font-medium">Account No.</TableHead>
                  <TableHead className="text-xs font-medium">Bank Name</TableHead>
                  <TableHead className="text-xs font-medium">Account Name</TableHead>
                  <TableHead className="text-xs font-medium">Country</TableHead>
                  <TableHead className="text-xs font-medium">City</TableHead>
                  <TableHead className="text-xs font-medium">Tags</TableHead>
                  <TableHead className="text-xs font-medium w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((bank: any) => {
                  const isExpanded = expandedBankId === bank.id;
                  return (
                    <>
                      <TableRow key={bank.id} className="cursor-pointer" onClick={() => setExpandedBankId(isExpanded ? null : bank.id)} data-testid={`row-bank-${bank.id}`}>
                        <TableCell className="py-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="text-sm py-2 font-medium">{bank.account_no}</TableCell>
                        <TableCell className="text-sm py-2">{bank.bank_name}</TableCell>
                        <TableCell className="text-sm py-2">{bank.beneficiary_name || "-"}</TableCell>
                        <TableCell className="text-sm py-2">{bank.country ? `${countries?.find((c: any) => c.value === bank.country)?.label || bank.country} (${bank.country})` : "-"}</TableCell>
                        <TableCell className="text-sm py-2">{bank.city || "-"}</TableCell>
                        <TableCell className="text-sm py-2">{bank.primary_account === "Y" ? <Badge>Primary</Badge> : "-"}</TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditSheet(bank); }} data-testid={`button-edit-bank-${bank.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(bank.id); }} data-testid={`button-delete-bank-${bank.id}`}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${bank.id}-details`} className="hover:bg-transparent">
                          <TableCell colSpan={8} className="p-4 bg-muted/30">
                            <div className="grid grid-cols-5 gap-x-6 gap-y-3">
                              <div>
                                <p className="text-xs text-muted-foreground">State</p>
                                <p className="text-sm">{bank.region || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">IFSC Code</p>
                                <p className="text-sm">{bank.ifsccode || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Bank Address</p>
                                <p className="text-sm">{bank.bank_address || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Currency</p>
                                <p className="text-sm">{bank.currency || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Swift Code</p>
                                <p className="text-sm">{bank.swift_code || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">ABA Routing No</p>
                                <p className="text-sm">{bank.aba_routing || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Branch Name</p>
                                <p className="text-sm">{bank.branch_name || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Location/Street</p>
                                <p className="text-sm">{bank.street || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Beneficiary Address</p>
                                <p className="text-sm">{bank.beneficiary_address || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">IBAN Number</p>
                                <p className="text-sm">{bank.iban_no || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Postal Code</p>
                                <p className="text-sm">{bank.postal_code || "NA"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Account Type</p>
                                <p className="text-sm">{bank.bank_account_type || "NA"}</p>
                              </div>
                            </div>

                            {bankDocuments.filter((d: any) => isBankDocType(d.doc_type) && Number(d.doc_no) === Number(bank.id)).length > 0 && (
                              <div className="mt-4 pt-3 border-t">
                                <p className="text-xs font-semibold mb-2">Bank Documents</p>
                                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                                  {bankDocuments.filter((item: any) => isBankDocType(item.doc_type) && Number(item.doc_no) === Number(bank.id)).map((doc: any) => {
                                    const isPdf = doc.filetype?.toLowerCase().includes('pdf') || doc.filename?.toLowerCase()?.endsWith('.pdf');
                                    const isImage = doc.filetype?.toLowerCase().includes('image') ||
                                      doc.filename?.toLowerCase()?.match(/\.(jpg|jpeg|png|gif|webp)$/);
                                    return (
                                      <Card
                                        key={doc.id}
                                        className="overflow-visible cursor-pointer relative group"
                                        data-testid={`bank-doc-card-${doc.id}`}
                                      >
                                        <div className="h-28 bg-muted/50 border-b flex items-center justify-center relative rounded-t-md overflow-hidden">
                                          {doc.doc_uri ? (
                                            <img
                                              src={`data:${isPdf ? 'image/png' : (doc.filetype || 'image/png')};base64,${doc.doc_uri}`}
                                              alt="Preview"
                                              className="w-full h-full object-contain p-1"
                                              data-testid={`img-bank-doc-thumb-${doc.id}`}
                                            />
                                          ) : isImage ? (
                                            <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-muted/60 flex items-center justify-center">
                                              <FileImage className="h-10 w-10 text-blue-500/70" />
                                            </div>
                                          ) : isPdf ? (
                                            <div className="flex flex-col items-center gap-1">
                                              <FileText className="h-10 w-10 text-red-500/70" />
                                              <span className="text-[10px] text-muted-foreground font-medium">PDF</span>
                                            </div>
                                          ) : (
                                            <div className="flex flex-col items-center gap-1">
                                              <File className="h-10 w-10 text-muted-foreground/50" />
                                              <span className="text-[10px] text-muted-foreground font-medium">
                                                {doc.filetype?.toUpperCase() || 'DOC'}
                                              </span>
                                            </div>
                                          )}
                                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 invisible group-hover:visible transition-all rounded-t-md"
                                            data-testid={`overlay-bank-doc-${doc.id}`}
                                          >
                                            <Button
                                              size="icon"
                                              variant="secondary"
                                              className="h-8 w-8"
                                              onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                                              title="Preview"
                                              data-testid={`button-preview-bank-doc-${doc.id}`}
                                            >
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                            {doc.doc_path && (
                                              <Button
                                                size="icon"
                                                variant="secondary"
                                                className="h-8 w-8"
                                                onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                                                title="Download"
                                                data-testid={`button-download-bank-doc-${doc.id}`}
                                              >
                                                <Download className="h-4 w-4" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                        <div className="p-2.5 space-y-1">
                                          <p
                                            className="text-xs font-medium truncate"
                                            title={doc.filename || doc.doc_name || ''}
                                            data-testid={`text-bank-doc-name-${doc.id}`}
                                          >
                                            {doc.filename || doc.doc_name || 'Untitled'}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground font-medium truncate">
                                            Bank Document
                                          </p>
                                        </div>
                                      </Card>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Landmark className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">No accounts are added yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setEditingBank(null);
            if (!(bankAccounts && bankAccounts.length > 0)) {
              userDismissedAutoBankDoc.current = false;
            }
            setPendingAiBankDocId(null);
            form.reset();
          }
        }}
      >
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto p-4">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-base">{editingBank ? "Edit Bank Account" : "Add Bank Account"}</SheetTitle>
          </SheetHeader>
          {bankHighlight && (
            <div className="rounded-md border border-amber-500/35 bg-amber-500/[0.06] p-2 text-xs text-muted-foreground mb-3">
              <span className="font-medium text-foreground">Review before submit: </span>
              <span className="font-semibold text-amber-950/80 dark:text-amber-100/90">Amber</span> highlighted fields
              contain AI-filled values that require your confirmation.{" "}
              <span className="font-semibold text-destructive">Red</span> fields are required and still missing.
            </div>
          )}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              onBlur={onBankFormBlur}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="country" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl className={bankRing(field.name as keyof BankFormData)}><SelectTrigger data-testid="select-bank-country"><SelectValue placeholder="Select country" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {countries?.map((c: any) => <SelectItem key={c.value} value={c.value}>{c.label} ({c.value})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="currency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl className={bankRing(field.name as keyof BankFormData)}><SelectTrigger data-testid="select-currency"><SelectValue placeholder="Select currency" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {currencies?.map((c: any) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="bank_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-bank-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="branch_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-branch-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="swift_code" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Swift Code</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-swift" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="aba_routing" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ABA Routing No</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-aba-routing" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="ifsccode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IFSC Code</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-ifsc" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="bank_address" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank/Branch Address</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-bank-address" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="beneficiary_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Account / Beneficiary Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-beneficiary-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="account_no" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number <span className="text-destructive">*</span></FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-account-no" inputMode="numeric" onKeyDown={(e) => { if (!/[\d]/.test(e.key) && !["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) e.preventDefault(); }} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="confirm_account_no" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Account Number <span className="text-destructive">*</span></FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-confirm-account-no" inputMode="numeric" onKeyDown={(e) => { if (!/[\d]/.test(e.key) && !["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) e.preventDefault(); }} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="bank_account_type" render={({ field }) => (
                <FormItem className="w-1/2">
                  <FormLabel>Account Type <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><SelectTrigger data-testid="select-account-type"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {accountTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="street" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location/Street</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-street" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="beneficiary_address" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beneficiary Address</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-beneficiary-address" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-bank-city" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="region" render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-bank-region" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="iban_no" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IBAN Number</FormLabel>
                    <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-iban" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="postal_code" render={({ field }) => (
                <FormItem className="w-1/3">
                  <FormLabel>Postal Code</FormLabel>
                  <FormControl className={bankRing(field.name as keyof BankFormData)}><Input {...field} data-testid="input-bank-postal" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="primary_account" render={({ field }) => (
                <FormItem>
                  <FormLabel>Is Primary <span className="text-destructive">*</span></FormLabel>
                  <FormControl className={bankRing(field.name as keyof BankFormData)}>
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4" data-testid="radio-primary-account">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="Y" id="primary-yes" />
                        <Label htmlFor="primary-yes" className="font-normal cursor-pointer">Yes</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="N" id="primary-no" />
                        <Label htmlFor="primary-no" className="font-normal cursor-pointer">No</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="border-t pt-3 mt-3 space-y-3">
                <h4 className="text-sm font-semibold">Documents <span className="text-destructive">*</span></h4>
                <p className="text-xs text-muted-foreground">Upload a Document (PDF, JPEG, PNG, DOC, DOCX - Max 5MB)</p>

                {(previewUrl || showBankDocCard ) ? (
                  <Card className="overflow-hidden" data-testid="card-bank-doc-preview">
                    <div className="relative group">
                      <div className="h-36 flex items-center justify-center bg-muted/30">
                        {previewLoading ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : previewUrl ? (
                          <img
                            src={previewUrl}
                            alt="Bank letter preview"
                            className="max-h-full max-w-full object-contain"
                            data-testid="img-bank-doc-preview"
                          />
                        ) : (
                          getFileIcon(sheetDocForPreview?.filename ?? selectedFile?.name ?? "")
                        )}
                      </div>
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 invisible group-hover:visible transition-all">
                        {sheetDocForPreview && (
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={() => setPreviewDoc(sheetDocForPreview)}
                            title="Preview"
                            data-testid="button-preview-sheet-bank-doc"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          onClick={removeSelectedFile}
                          data-testid="button-remove-bank-doc"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-2.5 space-y-1">
                      <p className="text-xs font-medium truncate" title={allDocuments?.find((item: any) => Number(item.doc_no) === editingBank?.id)?.filename} data-testid="text-bank-doc-filename">
                        {allDocuments?.find((item: any) => Number(item.doc_no) === editingBank?.id)?.filename ?? selectedFile?.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground" title={allDocuments?.find((item: any) => Number(item.doc_no) === editingBank?.id)?.doc_type ? allDocuments?.find((item: any) => Number(item.doc_no) === editingBank?.id)?.doc_type : selectedFile?.name} data-testid="text-bank-doc-filename">
                        {allDocuments?.find((item: any) => Number(item.doc_no) === editingBank?.id)?.doc_type ? allDocuments?.find((item: any) => Number(item.doc_no) === editingBank?.id)?.doc_type : docType}

                      </p>
                      <p
                        className="text-[11px] text-muted-foreground"
                        title={
                          pendingAiBankDocId != null && !selectedFile
                            ? "From your AI registration uploads"
                            : (sheetDocForPreview?.doc_type ?? docType)
                        }
                        data-testid="text-bank-doc-subtype"
                      >
                        {pendingAiBankDocId != null && !selectedFile
                          ? "From your AI registration uploads"
                          : (sheetDocForPreview?.doc_type ?? docType)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedFile?.size ? `${(selectedFile.size / 1024).toFixed(1)} KB` : null}
                      </p>
                    </div>
                  </Card>
                ) : !selectedFile && !previewUrl && !showBankDocCard ? (
                  <div className="space-y-3">
                    <div className="flex items-end gap-3 flex-wrap">
                      <div className="space-y-1.5 flex-1 min-w-[180px]">
                        <Label className="text-sm">Type of Document</Label>
                        <Select value={docType} onValueChange={setDocType}>
                          <SelectTrigger data-testid="select-doc-type"><SelectValue placeholder="Select Document Type" /></SelectTrigger>
                          <SelectContent>
                            {suppDocsList?.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!docType} data-testid="button-upload-doc">
                        <Upload className="h-4 w-4 mr-1" /> Upload
                      </Button>
                      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={handleFileUpload} />
                    </div>
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground border rounded-md">
                      <FileText className="h-8 w-8 mb-2 opacity-40" />
                      <p className="text-sm">No Documents Uploaded Yet</p>
                    </div>
                  </div>
                ) : selectedFile && (
                  <Card className="overflow-hidden" data-testid="card-bank-doc-preview">
                    <div className="relative group">
                      <div className="h-36 flex items-center justify-center bg-muted/30">
                        {previewLoading ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : previewUrl ? (
                          <img
                            src={previewUrl}
                            alt="Bank letter preview"
                            className="max-h-full max-w-full object-contain"
                            data-testid="img-bank-doc-preview"
                          />
                        ) : (
                          getFileIcon(selectedFile.name)
                        )}
                      </div>
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 invisible group-hover:visible transition-all">
                        {previewUrl && (
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={() => setPreviewDoc({ _previewSrc: previewUrl, filename: selectedFile?.name, filetype: selectedFile?.type })}
                            title="Preview"
                            data-testid="button-preview-selected-bank-doc"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          onClick={removeSelectedFile}
                          data-testid="button-remove-bank-doc"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-2.5 space-y-1">
                      <p className="text-xs font-medium truncate" title={selectedFile.name} data-testid="text-bank-doc-filename">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {docType}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedFile.size ? `${(selectedFile.size / 1024).toFixed(1)} KB` : null}
                      </p>
                    </div>
                  </Card>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || docUploading} data-testid="button-save-bank">
                  {(createMutation.isPending || updateMutation.isPending || docUploading) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {docUploading ? "Uploading Document..." : editingBank ? "Update" : "Add"}
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <span>{previewDoc?.filename || previewDoc?.doc_name || 'Document Preview'}</span>
              <Badge variant="secondary" className="text-[10px]">Bank Document</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 rounded-md min-h-[300px]">
            {previewDoc?._previewSrc ? (
              <img
                src={previewDoc._previewSrc}
                alt="Document preview"
                className="max-w-full max-h-[65vh] object-contain"
                data-testid="img-bank-doc-preview-full"
              />
            ) : previewDoc?.doc_uri ? (
              <img
                src={`data:${previewDoc.filetype?.toLowerCase().includes('pdf') ? 'image/png' : (previewDoc.filetype || 'image/png')};base64,${previewDoc.doc_uri}`}
                alt="Document preview"
                className="max-w-full max-h-[65vh] object-contain"
                data-testid="img-bank-doc-preview-full"
              />
            ) : previewDoc?.doc_path ? (
              (previewDoc.filetype?.toLowerCase().includes('pdf') || previewDoc.filename?.toLowerCase().endsWith('.pdf')) ? (
                <iframe
                  src={`/api/vendor/documents/${previewDoc.id}/download?inline=true`}
                  className="w-full h-[60vh] rounded"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={`/api/vendor/documents/${previewDoc.id}/download?inline=true`}
                  alt="Document preview"
                  className="max-w-full max-h-[65vh] object-contain"
                  data-testid="img-bank-doc-preview-full"
                />
              )
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileText className="h-12 w-12 opacity-40" />
                <p className="text-sm">Preview not available</p>
              </div>
            )}
          </div>
          {previewDoc?.doc_path && (
            <div className="flex justify-end pt-2 border-t">
              <Button size="sm" variant="outline" onClick={() => handleDownload(previewDoc)} data-testid="button-download-bank-doc-preview">
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
