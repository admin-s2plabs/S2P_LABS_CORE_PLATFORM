import prokrayaLogoLight from "@/assets/images/prokraya-logo-light.png";
import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserMenu } from "@/components/user-menu";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import FeedbackPage from "@/pages/modules/common/feedback";
import ProfilePage from "@/pages/modules/common/profile";
import TermsConditions from "@/pages/modules/common/terms-conditions";
import VendorAIChat from "@/pages/modules/vendor-registration/vendor-ai-chat";
import { VendorRegistrationDraftProvider } from "@/pages/modules/vendor-registration/vendor-registration-draft-context";
import VendorBanking from "@/pages/modules/vendor-registration/vendor-banking";
import VendorCertificates from "@/pages/modules/vendor-registration/vendor-certificates";
import VendorCompanyDetails from "@/pages/modules/vendor-registration/vendor-company-details";
import VendorContacts from "@/pages/modules/vendor-registration/vendor-contacts";
import VendorReview from "@/pages/modules/vendor-registration/vendor-review";
import VendorScopeOfSupply from "@/pages/modules/vendor-registration/vendor-scope-of-supply";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Building2,
  CircleCheck,
  ClipboardCheck,
  File,
  FileCheck,
  FileImage,
  FileText,
  Landmark,
  Loader2,
  Lock,
  Mail,
  Package,
  Send,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";


interface VendorRegistrationPortalProps {
  onLogout: () => void;
}

interface TaskItem {
  subject: string;
  srmsRefNumber: string;
  inboxDate: string;
  initiator: string;
  taskId: string;
  potentialOwners: string[];
  taskName: string;
}

interface LookupItem {
  value: string;
  label: string;
}

interface TasksResponse {
  tasks: TaskItem[];
  total: number;
}

/** Matches review page badge (`profile.status`) and auth storage after submit. */
function isPendingApprovalStatus(
  vendorStatus?: string | null,
  profileStatus?: string | null,
): boolean {
  const matches = (s?: string | null) =>
    (s || "").trim().toLowerCase() === "pending approval";
  return matches(vendorStatus) || matches(profileStatus);
}

/** Supplier must edit all sections and resubmit — unlock wizard nav without clicking the bell task. */
function isMoreInfoRequiredStatus(
  vendorStatus?: string | null,
  profileStatus?: string | null,
): boolean {
  const matches = (s?: string | null) => {
    const t = (s || "").trim().toLowerCase();
    return t === "more info required" || t === "more information required";
  };
  return matches(vendorStatus) || matches(profileStatus);
}

interface EmailNotification {
  id: number;
  notification_id: string;
  notif_subject: string;
  from_user: string;
  to_user: string;
  status: string | null;
  recieved_date: string | null;
}

const registrationSteps = [
  {
    title: "Company Details",
    path: "/vendor/register/company-details",
    icon: Building2,
  },
  { title: "Contacts", path: "/vendor/register/contacts", icon: Users },
  {
    title: "Scope of Supply",
    path: "/vendor/register/scope-of-supply",
    icon: Package,
  },
  { title: "Banking", path: "/vendor/register/banking", icon: Landmark },
  {
    title: "Certificates",
    path: "/vendor/register/certificates",
    icon: FileCheck,
  },
  {
    title: "Review Profile",
    path: "/vendor/register/review",
    icon: ClipboardCheck,
  },
];

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

export default function VendorRegistrationPortal({
  onLogout,
}: VendorRegistrationPortalProps) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [documentURL, setDocumentURL] = useState("");
  const [docLoader, setDocLoader] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const root = document.getElementById("root");
    if (root) {
      root.style.overflow = "hidden";
      root.style.height = "100vh";
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      if (root) {
        root.style.overflow = "";
        root.style.height = "";
      }
    };
  }, []);

  const authData = localStorage.getItem("prokraya-auth");
  const parsedAuth = authData ? JSON.parse(authData) : null;
  const storedUserName = parsedAuth?.userName || null;

  const { data: vendorProfile, isFetching: isProfileFetching } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
  });

  /**
   * Prefer `/api/vendor/profile` over localStorage — after "More info required",
   * auth may still say "Pending Approval", which wrongly locked the wizard and hid Save & Continue.
   */
  const profileStatusStr =
    vendorProfile?.status != null && String(vendorProfile.status).trim() !== ""
      ? String(vendorProfile.status).trim()
      : "";
  const authStatusStr =
    parsedAuth?.vendorStatus != null
      ? String(parsedAuth.vendorStatus).trim()
      : "";
  const effectiveVendorStatus = profileStatusStr || authStatusStr || "";

  const isPendingApproval = isPendingApprovalStatus(
    effectiveVendorStatus,
    effectiveVendorStatus,
  );

  const isMoreInfoResubmit = isMoreInfoRequiredStatus(
    effectiveVendorStatus,
    effectiveVendorStatus,
  );

  const isRejected = (effectiveVendorStatus || "").trim().toLowerCase() === "rejected";

  useEffect(() => {
    if (!profileStatusStr) return;
    const raw = localStorage.getItem("prokraya-auth");
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      if (p.vendorStatus !== profileStatusStr) {
        p.vendorStatus = profileStatusStr;
        localStorage.setItem("prokraya-auth", JSON.stringify(p));
      }
    } catch {
      /* ignore */
    }
  }, [profileStatusStr]);

  const { data: contacts, isFetching: isContactsFetching } = useQuery<any[]>({
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
  const { data: workflowHistory } = useQuery<any[]>({
    queryKey: ["/api/vendor/workflow-approval-history"],
  });

  const viewTaskDetails = (task: TaskItem) => {
    if (localStorage.getItem("vendorPrevStatus") === "Draft") {
      setNotificationOpen(false);
      return;
    }
    const { taskName, subject, srmsRefNumber, taskId } = task;
    let navigation = "";

    if (taskName === "Purchase Request") {
      navigation = `/app/requisitions/${srmsRefNumber}`;
    } else if (taskName === "Purchase Order") {
      navigation = `/app/purchase-orders/${srmsRefNumber}`;
    } else if (taskName === "Invoice") {
      navigation = `/app/invoices/${srmsRefNumber}`;
    } else if (
      taskName === "Vendor Registration" ||
      taskName === "Supplier Registration" ||
      taskName === "Approve by Procurement"
    ) {
      navigation =
        parsedAuth?.role === "vendor"
          ? "/vendor/register/company-details"
          : `/app/vendors/${srmsRefNumber}`;
    } else if (taskName === "Budget") {
      navigation = `/app/budgets/${srmsRefNumber}`;
    } else if (taskName === "Bid") {
      if (subject?.includes("Bid Publish") || subject?.includes("Bid Extension Approval")) {
        navigation = `/app/bids/${srmsRefNumber}`;
      } else if (subject?.includes("Bid Award")) {
        navigation = `/app/bids/${srmsRefNumber}/award`;
      } else if (subject?.includes("Tender award accept")) {
        navigation = `/app/bids/${srmsRefNumber}/award`;
      } else if (subject?.includes("Technical scoring")) {
        navigation = `/app/bids/${srmsRefNumber}/tech-score`;
      } else if (subject?.includes("Commercial scoring")) {
        navigation = `/app/bids/${srmsRefNumber}/comm-score`;
      } else if (subject?.includes("Tender opening")) {
        navigation = `/app/bids/${srmsRefNumber}/evaluate`;
      } else {
        navigation = `/app/bids/${srmsRefNumber}`;
      }
    } else if (taskName === "Purchase Agreement" || taskName === "Contract") {
      navigation = `/app/contracts/${srmsRefNumber}`;
    } else if (taskName === "Auction") {
      if (subject?.includes("Auction Award")) {
        navigation = `/app/auction-details/${srmsRefNumber}/award`;
      } else {
        navigation = `/app/auction-details/${srmsRefNumber}`;
      }
    }

    if (navigation) {
      // Store taskId in sessionStorage for approval actions
      console.log("Bell Icon: Storing taskId in sessionStorage:", taskId);
      sessionStorage.setItem("currentTaskId", taskId);
      sessionStorage.setItem("linkToBack", "/app/my-tasks");
      setNotificationOpen(false);
      navigate(navigation);
    }
  };

  const { data: lookupsResponse } = useQuery<LookupItem[]>({
    queryKey: ["/api/lookups/by-property/BANK_DOCUMENT"],
    select: (data: any[]) => data.map(d => ({ value: d.lookup_key, label: d.description })),
  });

  const lookupValues = [...(lookupsResponse?.map(item => item.value) || []), "BANK_DOCUMENT"];

  const hasSupplier = !!vendorProfile?.id;

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
      vendorProfile?.legal_entity_type &&
      vendorProfile?.pan_no &&
      vendorProfile?.start_date &&
      vendorProfile?.license_no &&
      vendorProfile?.expiry_date &&
      vendorProfile?.place_of_issue &&
      vendorProfile?.workingday_start &&
      vendorProfile?.workingday_end &&
      vendorProfile?.annual_turn_over &&
      vendorProfile?.turn_over_currency &&
      vendorProfile?.working_time_start_time &&
      vendorProfile?.working_time_end_time &&
      vendorProfile?.tax_reg_no &&
      vendorProfile?.tax_payer_id &&
      vendorProfile?.payment_terms &&
      vendorProfile?.tax_effective_date
    ),
    hasActiveContact,
    !!(scopeData?.categories?.length > 0),
    !!(bankAccounts && bankAccounts.length > 0 && (bankAccounts?.some(acc => acc.primary_account === "Y") || false)),
    !!(documents && documents.length >= 2),
    false,
  ];

  const completedCount = sectionComplete.filter(Boolean).length;
  const completionPercent = Math.round((completedCount / 6) * 100);

  const isAIChatMode = location.startsWith("/vendor/register/ai-chat");
  const isModeSelection =
    location === "/vendor/register" || location === "/vendor/register/";
  const currentStepIndex = registrationSteps.findIndex((s) =>
    location.startsWith(s.path),
  );
  const isReviewPage = location.startsWith("/vendor/register/review");
  const isNonRegistrationPage =
    location.startsWith("/vendor/profile") ||
    location.startsWith("/vendor/feedback");
  const allComplete = completedCount >= 3;

  const { data: tasksData } = useQuery<TasksResponse>({
    queryKey: ["/api/dashboard/all-tasks", "notifications", 0, 3],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dashboard/all-tasks?pageNo=0&pageSize=3");
      if (!res.ok) return { tasks: [], total: 0 };
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });

  // Email notifications
  const { data: latestEmails } = useQuery<EmailNotification[]>({
    queryKey: ["/api/email-notifications/latest"],
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/email-notifications/unread-count"],
    refetchInterval: 30000,
  });

  const pendingCount = tasksData?.total || 0;
  const latestTasks = tasksData?.tasks || [];
  const emailCount = unreadCount?.count || 0;
  const emails = latestEmails || [];

  // Sync vendor status from API – if vendor has been approved/activated,
  // update localStorage and reload into AppPortal


  useEffect(() => {
    if (isAIChatMode || isModeSelection || isPendingApproval) return;
    if (location === "/vendor" || location === "/vendor/") {
      navigate("/vendor/register");
      return;
    }

    if (
      !hasSupplier &&
      !isProfileFetching &&
      location !== "/vendor/register/company-details" &&
      !location.startsWith("/vendor/profile") &&
      !location.startsWith("/vendor/feedback")
    ) {
      navigate("/vendor/register/company-details");
      return;
    }

    // Require at least one active contact before proceeding past Contacts
    if (
      hasSupplier &&
      !isContactsFetching &&
      !hasActiveContact &&
      !location.startsWith("/vendor/register/company-details") &&
      !location.startsWith("/vendor/register/contacts") &&
      !location.startsWith("/vendor/profile") &&
      !location.startsWith("/vendor/feedback")
    ) {
      navigate("/vendor/register/contacts");
    }
  }, [
    location,
    navigate,
    hasSupplier,
    isProfileFetching,
    isContactsFetching,
    isAIChatMode,
    isModeSelection,
    hasActiveContact,
    isPendingApproval,
  ]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const profile =
        queryClient.getQueryData<any>(["/api/vendor/profile"]) ?? vendorProfile;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
      } catch {
        parsed = {};
      }
      const pStatus =
        profile?.status != null && String(profile.status).trim() !== ""
          ? String(profile.status).trim()
          : "";
      const aStatus =
        parsed.vendorStatus != null ? String(parsed.vendorStatus).trim() : "";
      const effective = pStatus || aStatus || "";
      if (isMoreInfoRequiredStatus(effective, effective)) {
        const supplierId = Number(
          profile?.id ?? parsed.supplierId ?? parsedAuth?.supplierId,
        );
        const taskRaw = profile?.attribute_12 ?? profile?.attribute12;
        const taskId = taskRaw != null ? String(taskRaw).trim() : "";
        if (!Number.isFinite(supplierId) || supplierId <= 0) {
          throw new Error("Missing supplier id. Please refresh and try again.");
        }
        if (!taskId) {
          throw new Error(
            "No workflow task (attribute_12). Refresh the page or contact support.",
          );
        }
        const res = await apiRequest(
          "POST",
          `/api/dbo/suppliers/${supplierId}/process-approval`,
          { taskId, result: "ReSubmit", comments: "" },
        );
        return res.json();
      }
      const res = await apiRequest("POST", "/api/vendor/submit-registration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor/registration-summary"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/all-tasks", "notifications", 0, 3],
      });
      setConfirmOpen(false);
      toast({ title: "Registration submitted for approval!" });
      const ad = localStorage.getItem("prokraya-auth");
      if (ad) {
        const p = JSON.parse(ad);
        p.vendorStatus = "Pending Approval";
        localStorage.setItem("prokraya-auth", JSON.stringify(p));
      }
      // setTimeout(() => {
      //   window.location.href = "/app/dashboard";
      // }, 1500);
    },
    onError: (error: any) => {
      let msg = error?.response?.data?.error || error?.message || "Failed to submit registration";
      try {
        const raw = error?.message || error?.response?.data?.error || "";
        const jsonPart = raw.substring(raw.indexOf("{"));
        const parsed = JSON.parse(jsonPart);
        if (parsed.error) msg = parsed.error;
      } catch {
        /* use default */
      }
      toast({ title: msg, variant: "destructive" });
    },
  });

  const handleDocumentURL = async () => {
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

  return (
    <VendorRegistrationDraftProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
      {!isAIChatMode && !isModeSelection && (
        <aside className="w-[240px] bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-sidebar-border">
            <div className="flex flex-col" data-testid="img-vendor-reg-logo">
              <img
                src={prokrayaLogoLight}
                alt="Prokraya"
                className="h-7 w-32 object-contain object-left"
              />
              <span className="text-[10px] text-emerald-400 font-semibold mt-0.5 uppercase tracking-wider ml-[34px] bg-emerald-500/20 px-1.5 py-0.5 rounded">
                AI-Powered S2P
              </span>
            </div>
          </div>

          <nav className="p-3 space-y-2">
            {registrationSteps.map((step, index) => {
              const isActive = location.startsWith(step.path);
              const isComplete = sectionComplete[index];
              const StepIcon = step.icon;
              const isLocked =
                isPendingApproval ||
                (!isMoreInfoResubmit && index > 0 && !sectionComplete[index - 1]);

              if (isLocked) {
                return (
                  <div
                    key={step.path}
                    className={`flex items-center gap-2 px-2 h-8 rounded-md text-sm cursor-not-allowed opacity-50 ${isPendingApproval && isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : ""
                      }`}
                    data-testid={`nav-step-${step.title.toLowerCase().replace(/\s+/g, "-")}`}
                    title={
                      isPendingApproval
                        ? "Application is pending approval"
                        : index === 1 && !sectionComplete[0]
                          ? "Complete Company Details"
                          : index === 2 && !sectionComplete[1]
                            ? "Add at least one primary contact"
                            : index === 3 && !sectionComplete[2]
                              ? "Add at least one category"
                              : index === 4 && !sectionComplete[3]
                                ? "Add at least one bank account and mark it as primary"
                                : index === 5 && !sectionComplete[4]
                                  ? "Add at least two certificates"
                                  : ""
                    }
                  >
                    {isPendingApproval ? (
                      <StepIcon className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{step.title}</span>
                  </div>
                );
              }

              return (
                <Link key={step.path} href={step.path}>
                  <div
                    className={`flex items-center gap-2 px-2 h-8 rounded-md text-sm cursor-pointer transition-colors ${isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover-elevate"
                      }`}
                    data-testid={`nav-step-${step.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {isComplete && !isActive ? (
                      <CircleCheck className="h-4 w-4 text-green-400 shrink-0" />
                    ) : (
                      <StepIcon className="h-4 w-4 shrink-0" />
                    )}
                    <span>{step.title}</span>
                  </div>
                </Link>
              );
            })}

            {isPendingApproval && (
              <div className="mt-3 px-2 py-2 rounded-md bg-amber-500/15 border border-amber-500/30">
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Pending Approval
                </p>
                <p className="text-[10px] text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                  Your application is under review
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 px-2">
              <div className="relative w-12 h-12">
                <svg
                  className="w-12 h-12 transform -rotate-90"
                  viewBox="0 0 36 36"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-sidebar-foreground/20"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray={`${completionPercent} ${100 - completionPercent}`}
                    strokeLinecap="round"
                    className="text-sidebar-primary-foreground"
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-sidebar-foreground"
                  data-testid="text-completion-percent"
                >
                  {completionPercent}%
                </span>
              </div>
              <span className="text-xs font-medium text-sidebar-foreground/70">
                Profile
                <br />
                Completion
              </span>
            </div>
          </nav>
        </aside>
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex items-center justify-between h-14 px-6 border-b bg-background shrink-0 z-40">
          <div className="flex items-center gap-3">
            <h1
              className="text-lg font-semibold"
              data-testid="text-registration-title"
            >
              {isAIChatMode
                ? "AI-Powered Registration"
                : isModeSelection
                  ? "Supplier Registration"
                  : "New Supplier Registration"}
            </h1>
            {!isAIChatMode && !isModeSelection && !isNonRegistrationPage && !isPendingApproval && (
              <Link href="/vendor/register/ai-chat">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  data-testid="button-switch-to-ai"
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Try AI Assistant</span>
                  <Sparkles className="h-3 w-3 text-cyan-500" />
                </Button>
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span
              className="text-sm text-muted-foreground"
              data-testid="text-vendor-welcome"
            >
              Welcome,{" "}
              <strong className="text-gray-700">
                {vendorProfile?.company_name || storedUserName || "Vendor"}
              </strong>
            </span>
            <Popover open={emailOpen} onOpenChange={setEmailOpen}>
              <PopoverTrigger asChild>
                <button className="p-2 hover:bg-muted rounded-md relative" data-testid="button-email">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  {emailCount > 0 && (
                    <span
                      className="absolute top-0 -right-2 h-4 min-w-4 px-1 bg-blue-500 text-white text-[10px] font-semibold flex items-center justify-center rounded-full"
                      data-testid="badge-email-count"
                    >
                      {emailCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <div className="px-3 py-2 border-b">
                  <h4 className="text-xs font-medium">Email Notifications</h4>
                  <p className="text-[10px] text-muted-foreground">{emailCount} unread notifications</p>
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  {emails.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No email notifications
                    </div>
                  ) : (
                    emails.map((email, index) => (
                      <div
                        key={email.id}
                        className={`flex items-start gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer ${email.status === 'New' || !email.status ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                        data-testid={`email-notification-${index}`}
                        onClick={() => {
                          setEmailOpen(false);
                          if (localStorage.getItem("vendorPrevStatus") === "Draft") {
                            return;
                          }
                          navigate("/app/email-notifications");
                        }}
                      >
                        <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-medium text-blue-500">
                            {(email.notif_subject || "E").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" title={email.notif_subject}>
                            {email.notif_subject || "-"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {email.to_user || "System"} · {formatDate(email.recieved_date)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {emailCount > 0 && (
                  <div className="px-2 py-1.5 border-t">
                    <Link href="/app/email-notifications" onClick={() => setEmailOpen(false)}>
                      <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-primary" data-testid="link-view-all-emails">
                        View All
                      </Button>
                    </Link>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
              <PopoverTrigger asChild>
                <button className="p-2 hover:bg-muted rounded-md relative" data-testid="button-notifications">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  {pendingCount > 0 && (
                    <span
                      className="absolute top-0 -right-1 h-4 min-w-4 px-1 bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center rounded-full"
                      data-testid="badge-notification-count"
                    >
                      {pendingCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <div className="px-3 py-2 border-b">
                  <h4 className="text-xs font-medium">Pending Tasks</h4>
                  <p className="text-[10px] text-muted-foreground">{pendingCount} tasks awaiting action</p>
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  {latestTasks.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No pending tasks
                    </div>
                  ) : (
                    latestTasks.map((task, index) => (
                      <div
                        key={task.taskId}
                        className="flex items-start gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => viewTaskDetails(task)}
                        data-testid={`notification-task-${index}`}
                      >
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-medium text-primary">
                            {(task.subject || task.taskName || "T").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" title={task.subject || task.taskName}>
                            {task.subject || task.taskName}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {task.initiator} · {formatDate(task.inboxDate)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {pendingCount > 0 && localStorage.getItem("vendorPrevStatus") !== "Draft" && (
                  <div className="px-2 py-1.5 border-t">
                    <Link href="/app/my-tasks" onClick={() => setNotificationOpen(false)}>
                      <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-primary" data-testid="link-view-all-notifications">
                        View All
                      </Button>
                    </Link>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <UserMenu
              userName={storedUserName || "Vendor"}
              userEmail={parsedAuth?.email || ""}
              userInitials={(storedUserName || "V").charAt(0).toUpperCase()}
              onLogout={onLogout}
              profilePath="/vendor/profile"
              feedbackPath="/vendor/feedback"
            />
          </div>
        </header>

        <main className="flex-1 min-h-0 bg-muted/30 overflow-auto">
          <Switch>
            <Route path="/vendor/register/ai-chat" component={VendorAIChat} />
            <Route
              path="/vendor/register/company-details"
              component={VendorCompanyDetails}
            />
            <Route
              path="/vendor/register/contacts"
              component={VendorContacts}
            />
            <Route
              path="/vendor/register/scope-of-supply"
              component={VendorScopeOfSupply}
            />
            <Route path="/vendor/register/banking" component={VendorBanking} />
            <Route
              path="/vendor/register/certificates"
              component={VendorCertificates}
            />
            <Route path="/vendor/register/review" component={VendorReview} />
            <Route path="/vendor/profile" component={ProfilePage} />
            <Route path="/vendor/feedback" component={FeedbackPage} />
            <Route>
              {isModeSelection ? (
                <div className="flex items-center justify-center h-full p-6">
                  <div className="max-w-2xl w-full space-y-6 text-center">
                    <div>
                      <img
                        src={prokrayaLogoLight}
                        alt="Prokraya"
                        className="h-10 mx-auto mb-4"
                      />
                      <h2
                        className="text-2xl font-semibold mb-1"
                        data-testid="text-mode-selection-title"
                      >
                        Choose Your Registration Method
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Select how you'd like to complete your supplier
                        registration
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Card
                        className="hover-elevate cursor-pointer"
                        onClick={() => navigate("/vendor/register/ai-chat")}
                        data-testid="card-ai-registration"
                      >
                        <CardContent className="p-6 text-center space-y-3">
                          <div className="p-3 rounded-full bg-cyan-100 dark:bg-cyan-900/30 w-fit mx-auto">
                            <Bot className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
                          </div>
                          <h3 className="font-semibold text-lg">
                            AI Assistant
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Complete registration through a guided conversation.
                            Just tell the AI your details and it handles the
                            rest.
                          </p>
                          <Badge
                            variant="outline"
                            className="gap-1 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400"
                          >
                            <Sparkles className="h-3 w-3" /> Recommended
                          </Badge>
                        </CardContent>
                      </Card>
                      <Card
                        className="hover-elevate cursor-pointer"
                        onClick={() =>
                          navigate("/vendor/register/company-details")
                        }
                        data-testid="card-form-registration"
                      >
                        <CardContent className="p-6 text-center space-y-3">
                          <div className="p-3 rounded-full bg-muted w-fit mx-auto">
                            <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <h3 className="font-semibold text-lg">
                            Step-by-Step Form
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Fill out a traditional 6-step form wizard with
                            structured fields for each registration section.
                          </p>
                          <Badge variant="outline">Classic Method</Badge>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              ) : (
                <VendorCompanyDetails />
              )}
            </Route>
          </Switch>
        </main>

        {!isAIChatMode &&
          !isModeSelection &&
          !isNonRegistrationPage &&
          !isPendingApproval &&
          currentStepIndex >= 0 && (
            <div
              className="flex items-center justify-between px-6 py-2.5 border-t bg-background shrink-0"
              data-testid="action-bar"
            >
              {currentStepIndex > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate(registrationSteps[currentStepIndex - 1].path)
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
                        onCheckedChange={(checked) =>
                          setAgreedTerms(checked === true)
                        }
                        data-testid="checkbox-agree-terms"
                      />
                      <span className="text-sm">
                        I Agree to{" "}
                        <TermsConditions type="Submit Registration Approval - Supplier" className="text-primary underline hover:no-underline" dataTestId="link-terms" />
                      </span>
                    </label>
                      <Button
                      size="sm"
                      onClick={() => {
                        setReviewOpen(true);
                        handleDocumentURL();
                      }}
                      disabled={!allComplete}
                      data-testid="button-submit-registration"
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
                ) : (
                  ""
                )
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
                    navigate(registrationSteps[currentStepIndex + 1]?.path);
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
                    if (currentStepIndex === 3 && (!bankAccounts || bankAccounts.length === 0)) {
                      toast({
                        title: "Atleast one bank account is required",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (currentStepIndex === 3 && bankAccounts && bankAccounts.length > 0 && bankAccounts?.filter(acc => acc.primary_account === "Y")?.length === 0) {
                      toast({
                        title: "One bank account must be marked as primary",
                        variant: "destructive",
                      });
                      return;
                    }
                    // const validDocs = documents?.filter(
                    //   (doc) => doc.doc_type !== "BANK_DOCUMENT"
                    // );
                    const matches = (documents ?? []).filter(item =>
                      !lookupValues.includes(item.doc_type)
                    );
                    if (currentStepIndex === 4 && (!matches || matches.length < 1)) {
                      toast({
                        title: "Atleast one certificate is required other than bank document",
                        variant: "destructive",
                      });
                      return;
                    }
                    navigate(registrationSteps[currentStepIndex + 1]?.path);
                  }}
                  data-testid="button-save-continue"
                >
                  Save & Continue <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          )}

        <Footer />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Registration</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit your registration for approval?
              Once submitted, you will not be able to edit your profile until it
              is reviewed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              data-testid="button-confirm-submit"
            >
              {submitMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Yes, Submit
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
                  aria-label="terms-conditions-document"
                  data={`${documentURL}#toolbar=0&navpanes=0&scrollbar=0`}
                  width="100%"
                  height="100%"
                />
              )}
            <SheetFooter className="mt-4">
              <Button
                variant="outline"
                onClick={() => {setReviewOpen(false); handleDocumentURL();}}
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
                <Button type="button" variant="outline" size="sm" disabled={uploadingDoc} onClick={() => fileInputRef.current?.click()} data-testid="button-upload-doc">
                  {uploadingDoc ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  Upload Signed Document
                </Button>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={handleFileUpload} />
              </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </VendorRegistrationDraftProvider>
  );
}
