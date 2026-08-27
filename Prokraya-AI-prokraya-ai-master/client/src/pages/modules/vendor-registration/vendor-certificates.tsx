import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Eye,
  File,
  FileCheck,
  FileImage,
  FileText,
  Info,
  Loader2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

const documentTypes = [
  { value: "tradelicense", label: "Trade License" },
  { value: "commercemembership", label: "Chamber of Commerce Membership" },
  { value: "vatcertificate", label: "VAT Certificate" },
  { value: "companyprofile", label: "Company Profile" },
  { value: "memorandum", label: "Memorandum of Association" },
  { value: "listofemployees", label: "List of Employees" },
  { value: "attroney", label: "Power of Attorney" },
  { value: "employeeliability", label: "Employee Liability Certificate" },
  { value: "insurancecert", label: "Insurance Certificate" },
  { value: "bankguarantee", label: "Bank Guarantee Letter" },
  { value: "isoqualification", label: "ISO Qualification Certificate" },
  { value: "BANK_DOCUMENT", label: "Bank Document" },
  { value: "other", label: "Other" },
];

export default function VendorCertificates() {
  const [location, setLocation] = useLocation();
  const isVendorRegistrationWizard = location.startsWith("/vendor/register");
  const { toast } = useToast();
  const storedAuthStr = localStorage.getItem("prokraya-auth");
  const parsedAuth = storedAuthStr ? JSON.parse(storedAuthStr) : null;
  const vendorStatus = parsedAuth?.vendorStatus;
  const isEditMode =
    vendorStatus &&
    ["Approved", "Active", "InActive", "Changes In Draft", "More Info Required", "More Information Required"].includes(
      vendorStatus,
    );
  const [selectedDocType, setSelectedDocType] = useState("");
  const [expiryRequired, setExpiryRequired] = useState(false);
  const [docExpiry, setDocExpiry] = useState("");
  const [remarks, setRemarks] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    if (selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result as string);
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
            import.meta.url,
          ).toString();
          const arrayBuffer = await selectedFile.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
          }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1 });
          const scale = 280 / viewport.width;
          const scaledViewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setPreviewLoading(false);
            return;
          }
          await page.render({
            canvasContext: ctx,
            canvas,
            viewport: scaledViewport,
          }).promise;
          setPreviewUrl(canvas.toDataURL("image/png"));
        } catch (err) {
          console.error("PDF preview error:", err);
          setPreviewUrl(null);
        } finally {
          setPreviewLoading(false);
        }
      };
      renderPdfPreview();
    } else {
      setPreviewLoading(false);
    }
  }, [selectedFile]);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
  }, []);

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
    enabled: !!isEditMode,
  });

  const { data: documents, isLoading } = useQuery<any[]>({
    queryKey: ["/api/vendor/documents"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { formData: FormData }) => {
      const res = await apiRequest("POST", "/api/vendor/documents", data.formData);
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
      }
      resetForm();
      toast({ title: "Document added successfully" });
    },
    onError: () =>
      toast({ title: "Failed to add document", variant: "destructive" }),
  });

  function resetForm() {
    setSelectedDocType("");
    setExpiryRequired(false);
    setDocExpiry("");
    setRemarks("");
    setSelectedFile(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const ALLOWED_FILE_TYPES: Record<string, string[]> = {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
  };
  const MAX_FILE_SIZE_MB = 5;
  const DANGEROUS_EXTS = [
    ".exe",
    ".bat",
    ".cmd",
    ".sh",
    ".ps1",
    ".msi",
    ".vbs",
    ".js",
    ".jar",
    ".php",
    ".html",
    ".htm",
    ".svg",
    ".xml",
    ".dll",
    ".scr",
  ];

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name || "";
    if (fileName.includes("\0") || fileName.includes("..")) {
      toast({ title: "Invalid filename detected", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const ext =
      fileName.lastIndexOf(".") >= 0
        ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase()
        : "";
    if (!ext) {
      toast({
        title: "File must have a valid extension",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    if (DANGEROUS_EXTS.includes(ext)) {
      toast({
        title: `File type '${ext}' is not allowed for security reasons`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    const allowedMimes = Object.keys(ALLOWED_FILE_TYPES);
    if (!allowedMimes.includes(file.type)) {
      toast({
        title: "Only PDF, JPEG, PNG, DOC, and DOCX files are allowed",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    const allowedExtsForType = ALLOWED_FILE_TYPES[file.type];
    if (!allowedExtsForType || !allowedExtsForType.includes(ext)) {
      toast({
        title: `File extension '${ext}' does not match the file type`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    if (file.size === 0) {
      toast({ title: "File is empty", variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({
        title: `File size must be less than ${MAX_FILE_SIZE_MB}MB`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
  }

  const isFileReady = !selectedFile || !!previewUrl || !previewLoading;

  function handleSave() {
    if (!selectedDocType) {
      toast({ title: "Please select a document type", variant: "destructive" });
      return;
    }
    if (selectedFile && !previewUrl && previewLoading) {
      toast({
        title: "Please wait, file is still processing",
        variant: "destructive",
      });
      return;
    }
    if (expiryRequired && !docExpiry) {
      toast({ title: "Please enter the expiry date", variant: "destructive" });
      return;
    }
    if (selectedFile) {
      const docTypeLabel =
        documentTypes.find((t) => t.value === selectedDocType)?.label ||
        selectedDocType;
      const fileName = selectedFile?.name || "pending_upload";
      const docUriBase64 = previewUrl?.startsWith("data:")
        ? previewUrl.split(",")[1] || null
        : null;

      const formData = new FormData();
      formData.append("doc_type", selectedDocType);
      formData.append(
        "doc_name",
        fileName !== "pending_upload" ? fileName : docTypeLabel,
      );
      formData.append("doc_desc", remarks || docTypeLabel);
      formData.append("doc_no", "");
      if (expiryRequired && docExpiry) formData.append("expiry_date", docExpiry);
      if (docUriBase64) formData.append("doc_uri", docUriBase64);
      if (selectedFile) formData.append("file", selectedFile);
      createMutation.mutate({ formData });
    } else {
      toast({ title: "Please upload a document to Save", variant: "destructive" });
      return;
    }
  }

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

  async function handleDownload(doc: any) {
  try {
    const response = await fetch(
      `/api/vendor/documents/${doc.id}/download`,
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

  function getDocTypeLabel(value: string) {
    return documentTypes.find((t) => t.value === value)?.label || value;
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
          <FileCheck className="h-4 w-4 text-muted-foreground" />
          <h2
            className="text-base font-semibold tracking-tight"
            data-testid="text-certificates-title"
          >
            Business Registration Documents
          </h2>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">Note:</span> Allowed file formats : PDF,
          JPEG, PNG
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  Type of Document <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedDocType}
                  onValueChange={setSelectedDocType}
                >
                  <SelectTrigger data-testid="select-doc-type">
                    <SelectValue placeholder="Select Document Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {documentTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="expiry-required"
                  checked={expiryRequired}
                  onCheckedChange={(checked) => {
                    setExpiryRequired(checked === true);
                    if (!checked) setDocExpiry("");
                  }}
                  data-testid="checkbox-expiry-required"
                />
                <Label
                  htmlFor="expiry-required"
                  className="cursor-pointer text-sm"
                >
                  Expiry Date Required
                </Label>
              </div>

              {expiryRequired && (
                <div className="space-y-1.5">
                  <Label>
                    Expiry Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={docExpiry}
                    onChange={(e) => setDocExpiry(e.target.value)}
                    data-testid="input-doc-expiry"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Please write here......"
                  rows={3}
                  data-testid="input-doc-remarks"
                />
              </div>

              <div>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={createMutation.isPending || !isFileReady}
                  data-testid="button-save-document"
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  Save
                </Button>
              </div>
            </div>

            <div className="flex items-start justify-center">
              <div
                className="border-2 border-dashed rounded-md text-center cursor-pointer w-full max-w-[300px] hover-elevate"
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-upload"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                {previewUrl ? (
                  <div className="p-2">
                    <img
                      src={previewUrl}
                      alt="Document preview"
                      className="w-full max-h-[320px] object-contain rounded"
                      data-testid="img-doc-preview"
                    />
                    <p className="text-xs text-muted-foreground mt-2 truncate px-1">
                      {selectedFile?.name}
                    </p>
                  </div>
                ) : selectedFile && previewLoading ? (
                  <div className="p-8">
                    <Loader2 className="h-10 w-10 mx-auto mb-2 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      Generating preview...
                    </p>
                  </div>
                ) : selectedFile && !previewLoading ? (
                  <div className="p-8">
                    {selectedFile.type === "application/pdf" ? (
                      <FileText className="h-10 w-10 mx-auto mb-2 text-red-500/70" />
                    ) : selectedFile.type.startsWith("image/") ? (
                      <FileImage className="h-10 w-10 mx-auto mb-2 text-blue-500/70" />
                    ) : (
                      <File className="h-10 w-10 mx-auto mb-2 text-muted-foreground/70" />
                    )}
                    <p className="text-xs text-muted-foreground mt-1 truncate px-1">
                      {selectedFile.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Preview not available
                    </p>
                  </div>
                ) : (
                  <div className="p-8">
                    <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-medium">
                      Upload
                    </p>
                    <p className="text-xs text-destructive mt-1">
                      Allowed file types are pdf/image (JPEG, PNG) only.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Uploaded Documents</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {documents && documents.length > 0 ? (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {documents.map((doc: any) => {
                const isPdf =
                  doc.filetype?.toLowerCase().includes("pdf") ||
                  doc.filename?.toLowerCase()?.endsWith(".pdf");
                const isImage =
                  doc.filetype?.toLowerCase().includes("image") ||
                  doc.filename
                    ?.toLowerCase()
                    ?.match(/\.(jpg|jpeg|png|gif|webp)$/);

                return (
                  <Card
                    key={doc.id}
                    className="overflow-visible cursor-pointer relative group"
                    data-testid={`doc-card-${doc.id}`}
                  >
                    <div className="h-28 bg-muted/50 border-b flex items-center justify-center relative rounded-t-md overflow-hidden">
                      {doc.doc_uri ? (
                        <img
                          src={`data:image/png;base64,${doc.doc_uri}`}
                          alt="Preview"
                          className="w-full h-full object-contain p-1"
                          data-testid={`img-doc-thumb-${doc.id}`}
                        />
                      ) : isImage ? (
                        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-muted/60 flex items-center justify-center">
                          <FileImage className="h-10 w-10 text-blue-500/70" />
                        </div>
                      ) : isPdf ? (
                        <div className="flex flex-col items-center gap-1">
                          <FileText className="h-10 w-10 text-red-500/70" />
                          <span className="text-[10px] text-muted-foreground font-medium">
                            PDF
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <File className="h-10 w-10 text-muted-foreground/50" />
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {doc.filetype?.toUpperCase() || "DOC"}
                          </span>
                        </div>
                      )}
                      <div
                        className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 invisible group-hover:visible transition-all rounded-t-md"
                        data-testid={`overlay-doc-${doc.id}`}
                      >
                        {doc.doc_uri && (
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewDoc(doc);
                            }}
                            title="Preview"
                            data-testid={`button-preview-doc-${doc.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {doc.doc_path && (
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(doc);
                            }}
                            title="Download"
                            data-testid={`button-download-doc-${doc.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5 space-y-1">
                      <p
                        className="text-xs font-medium truncate"
                        title={doc.filename || doc.doc_name || ""}
                        data-testid={`text-doc-filename-${doc.id}`}
                      >
                        {doc.filename || doc.doc_name || "Untitled"}
                      </p>
                      <p
                        className="text-[11px] text-muted-foreground font-medium truncate"
                        data-testid={`text-doc-type-${doc.id}`}
                      >
                        {getDocTypeLabel(doc.doc_type) ||
                          doc.category ||
                          "Document"}
                      </p>
                      {doc.expiry_date && (
                        <p className="text-[10px] text-muted-foreground">
                          Expires:{" "}
                          {formatDate(doc.expiry_date)}
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileCheck className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">No Documents are Uploaded Yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!previewDoc}
        onOpenChange={(open) => {
          if (!open) setPreviewDoc(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <span>
                {previewDoc?.filename ||
                  previewDoc?.doc_name ||
                  "Document Preview"}
              </span>
              {previewDoc && (
                <Badge variant="secondary" className="text-[10px]">
                  {getDocTypeLabel(previewDoc.doc_type)}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 rounded-md min-h-[300px]">
            {previewDoc?.doc_uri && (
              <img
                src={`data:image/png;base64,${previewDoc.doc_uri}`}
                alt="Document preview"
                className="max-w-full max-h-[65vh] object-contain"
                data-testid="img-preview-dialog"
              />
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => previewDoc && handleDownload(previewDoc)}
              data-testid="button-preview-download"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
