import TermsConditions from "@/pages/modules/common/terms-conditions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Send, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useLocation } from "wouter";

const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
const MAX_FILE_SIZE_MB = 5;
const DANGEROUS_EXTS = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".vbs", ".js", ".jar", ".php", ".html", ".htm", ".svg", ".xml", ".dll", ".scr"];

/** Small preview thumbnail for doc_uri — images pass through as-is, PDFs render page 1 to a canvas PNG. */
async function generateDocPreviewDataUrl(file: File): Promise<string | null> {
  if (file.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
  if (file.type === "application/pdf") {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = 280 / viewport.width;
      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      await page.render({ canvasContext: ctx, canvas, viewport: scaledViewport }).promise;
      return canvas.toDataURL("image/png");
    } catch (err) {
      console.error("PDF preview error:", err);
      return null;
    }
  }
  return null;
}

export const vendorRegistrationSteps = [
  { title: "Company Details", path: "/vendor/register/company-details" },
  { title: "Contacts", path: "/vendor/register/contacts" },
  { title: "Scope of Supply", path: "/vendor/register/scope-of-supply" },
  { title: "Banking", path: "/vendor/register/banking" },
  { title: "Certificates", path: "/vendor/register/certificates" },
  { title: "Review Profile", path: "/vendor/register/review" },
];

interface LookupItem {
  value: string;
  label: string;
}

export function VendorRegistrationWizardActionBar() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [documentURL, setDocumentURL] = useState("");
  const [docLoader, setDocLoader] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStepIndex = vendorRegistrationSteps.findIndex((s) =>
    location.startsWith(s.path),
  );
  const isReviewPage = location.startsWith("/vendor/register/review");

  const { data: vendorProfile } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
  });
  const { data: contacts } = useQuery<any[]>({
    queryKey: ["/api/vendor/contacts"],
  });
  const { data: bankAccounts } = useQuery<any[]>({
    queryKey: ["/api/vendor/bank-accounts"],
  });
  const { data: scopeData } = useQuery<any>({
    queryKey: ["/api/vendor/scope-of-supply"],
  });
  const { data: documents } = useQuery<any[]>({
    queryKey: ["/api/vendor/documents"],
  });
  const { data: lookupsResponse } = useQuery<LookupItem[]>({
    queryKey: ["/api/lookups/by-property/BANK_DOCUMENT"],
    select: (data: any[]) =>
      data.map((d) => ({ value: d.lookup_key, label: d.description })),
  });

  const lookupValues = [
    ...(lookupsResponse?.map((item) => item.value) || []),
    "BANK_DOCUMENT",
  ];

  const hasActiveContact = !!contacts?.some(
    (c: any) => c.is_primary === "Yes" || c.is_auth_signatory === "Yes",
  );

  const sectionComplete = [
    !!(
      vendorProfile?.address_1 &&
      vendorProfile?.city &&
      vendorProfile?.country &&
      vendorProfile?.state &&
      vendorProfile?.postalcode &&
      vendorProfile?.phone &&
      vendorProfile?.legal_entity_type
    ),
    hasActiveContact,
    !!(scopeData?.categories?.length > 0),
    !!(
      bankAccounts &&
      bankAccounts.length > 0 &&
      bankAccounts.some((acc) => acc.primary_account === "Y")
    ),
    !!(
      (documents ?? []).filter((item) => !lookupValues.includes(item.doc_type))
        .length >= 1
    ),
    false,
  ];
  const completedCount = sectionComplete.filter(Boolean).length;
  const allComplete = completedCount >= 3;

  const effectiveStatus = String(vendorProfile?.status || "").trim();
  const isRejected = effectiveStatus.toLowerCase() === "rejected";
  /** Active suppliers update an existing profile — must not use new-registration submit. */
  const isActiveVendorUpdate = vendorProfile?.attribute_4 === "Active";

  const submitMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isActiveVendorUpdate
        ? "/api/vendor/submit-changes"
        : "/api/vendor/submit-registration";
      const res = await apiRequest("POST", endpoint);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor/registration-summary"],
      });
      const suppId = vendorProfile?.id;
      if (suppId) {
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", String(suppId)] });
      }
      const storedAuth = localStorage.getItem("prokraya-auth");
      if (storedAuth) {
        const parsed = JSON.parse(storedAuth);
        parsed.vendorStatus = "Pending Approval";
        localStorage.setItem("prokraya-auth", JSON.stringify(parsed));
      }
      toast({
        title: isActiveVendorUpdate ? "Changes submitted" : "Registration submitted for approval!",
        description: isActiveVendorUpdate
          ? "Your profile changes have been submitted for approval."
          : undefined,
      });
      setConfirmOpen(false);
      if (suppId) {
        navigate(`/app/vendors/${suppId}`);
      } else {
        navigate("/app/dashboard");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Submission failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDocumentURL = async () => {
    const storedAuth = localStorage.getItem("prokraya-auth");
    const parsedAuth = storedAuth ? JSON.parse(storedAuth) : null;
    const supplierId = vendorProfile?.id ?? parsedAuth?.supplierId;
    if (!supplierId) return;
    setDocLoader(true);
    try {
      const res = await apiRequest("GET", `/api/vendor/reviewpdf/${supplierId}`);
      const blob = await res.blob();
      setDocumentURL(blob.size > 0 ? URL.createObjectURL(blob) : "");
    } catch (error: any) {
      setDocumentURL("");
      toast({
        title: "Failed to load registration document",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDocLoader(false);
    }
  };

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
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

    setUploadingDoc(true);
    try {
      const previewDataUrl = await generateDocPreviewDataUrl(file);
      const docUriBase64 = previewDataUrl?.startsWith("data:")
        ? previewDataUrl.split(",")[1] || null
        : null;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("doc_type", "Review Document");
      formData.append("doc_name", file.name);
      // doc_no stays "" so a repeat upload matches the existing Review Document row and replaces it instead of duplicating.
      formData.append("doc_no", "");
      if (docUriBase64) formData.append("doc_uri", docUriBase64);

      const res = await apiRequest("POST", "/api/vendor/documents", formData);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
      toast({ title: "Signed document uploaded" });
      setReviewOpen(false);
    } catch (err: any) {
      toast({ title: err.message || "Failed to upload signed document", variant: "destructive" });
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (currentStepIndex < 0) return null;

  return (
    <>
      <div
        className="flex items-center justify-between px-6 py-2.5 border-t bg-background shrink-0"
        data-testid="action-bar"
      >
        {currentStepIndex > 0 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate(vendorRegistrationSteps[currentStepIndex - 1].path)
            }
            data-testid="button-previous"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
        ) : (
          <div />
        )}
        {isReviewPage ? (
          !isRejected ? (
            <div className="flex items-center gap-4">
              <label
                className="flex items-center gap-2 cursor-pointer"
                data-testid="label-agree-terms"
              >
                <Checkbox
                  checked={agreedTerms}
                  onCheckedChange={(checked) => setAgreedTerms(checked === true)}
                  data-testid="checkbox-agree-terms"
                />
                <span className="text-sm">
                  I Agree to{" "}
                  <TermsConditions
                    type="Submit Registration Approval - Supplier"
                    className="text-primary underline hover:no-underline"
                    dataTestId="link-terms"
                  />
                </span>
              </label>
              <Button
                size="sm"
                onClick={() => {
                  setReviewOpen(true);
                  handleDocumentURL();
                }}
                disabled={!allComplete}
                data-testid="button-review-profile"
              >
                <Send className="h-4 w-4 mr-1" />
                Review Profile
              </Button>
              <Button
                size="sm"
                onClick={() => {const matches = (documents ?? []).filter(item => item.doc_type === "Review Document"); if (!matches || matches.length < 1) { toast({ title: "Please upload the signed review document before submitting", variant: "destructive" }); return; } setConfirmOpen(true);}}
                disabled={!allComplete || !agreedTerms}
                data-testid="button-submit-registration"
              >
                <Send className="h-4 w-4 mr-1" />
                Submit for Approval
              </Button>
            </div>
          ) : null
        ) : currentStepIndex === 0 ? (
          <Button
            key="save-company"
            size="sm"
            type="submit"
            form="vendor-company-form"
            data-testid="button-save-continue"
          >
            Save & Continue <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : currentStepIndex === 2 ? (
          <Button
            key="save-scope"
            size="sm"
            type="submit"
            form="vendor-scope-form"
            data-testid="button-save-continue"
          >
            Save & Continue <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : currentStepIndex === 1 ? (
          <Button
            key="save-contacts"
            type="button"
            size="sm"
            onClick={() => {
              if (!hasActiveContact) {
                toast({
                  title: "Atleast one primary contact is required",
                  variant: "destructive",
                });
                return;
              }
              navigate(vendorRegistrationSteps[currentStepIndex + 1]?.path);
            }}
            data-testid="button-save-continue"
          >
            Save & Continue <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            key={`nav-step-${currentStepIndex}`}
            type="button"
            size="sm"
            onClick={() => {
              if (
                currentStepIndex === 3 &&
                (!bankAccounts || bankAccounts.length === 0)
              ) {
                toast({
                  title: "Atleast one bank account is required",
                  variant: "destructive",
                });
                return;
              }
              if (
                currentStepIndex === 3 &&
                bankAccounts &&
                bankAccounts.length > 0 &&
                bankAccounts.filter((acc) => acc.primary_account === "Y")
                  .length === 0
              ) {
                toast({
                  title: "One bank account must be marked as primary",
                  variant: "destructive",
                });
                return;
              }
              const certDocs = (documents ?? []).filter(
                (item) => !lookupValues.includes(item.doc_type),
              );
              if (currentStepIndex === 4 && certDocs.length < 1) {
                toast({
                  title:
                    "Atleast one certificate is required other than bank document",
                  variant: "destructive",
                });
                return;
              }
              navigate(vendorRegistrationSteps[currentStepIndex + 1]?.path);
            }}
            data-testid="button-save-continue"
          >
            Save & Continue <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Registration</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit your registration for approval?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Review Registration Form</SheetTitle>
            <SheetDescription></SheetDescription>
          </SheetHeader>
          {docLoader ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <object
              aria-label="registration-document"
              data={`${documentURL}#toolbar=0&navpanes=0&scrollbar=0`}
              width="100%"
              height="100%"
            />
          )}
          <SheetFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setReviewOpen(false)}
              data-testid="button-cancel-upload-document"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (documentURL) {
                  const link = document.createElement("a");
                  link.href = documentURL;
                  link.download = "registration_document.pdf";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }}
              data-testid="button-download-document"
            >
              Download Document
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingDoc}
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload-doc"
            >
              {uploadingDoc ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Upload Signed Document
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden"
              onChange={handleFileUpload}
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
