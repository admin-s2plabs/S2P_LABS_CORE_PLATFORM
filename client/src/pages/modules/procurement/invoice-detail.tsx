import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import { ViewChecklistButton } from "@/components/view-checklist-button";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import { CollaborationPanel, CollaborationPanelRef } from "@/components/collaboration-panel";
import { FormSheet } from "@/components/form-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PhoneInput,
  getPhoneValidationMessage,
  validatePhoneNumber,
} from "@/components/ui/phone-input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, handleDownloadDocument } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  File,
  FileImage,
  FileText,
  Hash,
  HelpCircle,
  Info,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";

interface InvoiceDetail {
  id: number;
  invoice_number: string;
  invoice_status: string | null;
  invoice_type: string | null;
  invoice_amount: number | null;
  invoice_curr_code: string | null;
  invoice_date: string | null;
  inv_due_date: string | null;
  po_number: string | null;
  supplier_name: string | null;
  supplier_id: number | null;
  description: string | null;
  department_name: string | null;
  cost_center_name: string | null;
  inv_match_status: string | null;
  inv_payment_status: string | null;
  tax_amount: number | null;
  tax_included: string | null;
  created_by: string | null;
  creation_date: string | null;
  last_modified_by: string | null;
  last_modified_date: string | null;
  submitted_by: string | null;
  invoice_source: string | null;
  payment_terms_name: string | null;
  payment_terms_id: string | null;
  budget_name: string | null;
  budget_segment: string | null;
  invoice_notes: string | null;
  invoice_reason: string | null;
  invoice_approvers: string | null;
  do_number: string | null;
  contr_ref_no: string | null;
  invoice_amount_paid: number | null;
  balance_amount: number | null;
  exchange_rate: number | null;
  supplier_contact: string | null;
  supplier_contact_email: string | null;
  supplier_contact_no: string | null;
  supplier_contact_phone: string | null;
  supplier_display_name: string | null;
  po_description: string | null;
  po_requestor_name: string | null;
  po_requestor_email: string | null;
  po_buyer_name: string | null;
  po_buyer_email: string | null;
  po_total_amount: number | null;
  pay_group_code: string | null;
  payment_description: string | null;
  payment_date: string | null;
  ppayment_amount: number | null;
  bank_account_no: string | null;
  attribute_12: string | null;
  org_id: number | null;
}

/** Payable total for payment — NON-PO invoice_amount already includes tax. */
function getInvoicePayableTotal(invoice: Pick<InvoiceDetail, "invoice_amount" | "tax_amount" | "invoice_source">) {
  const invoiceAmount = Number(invoice.invoice_amount) || 0;
  const taxAmount = Number(invoice.tax_amount) || 0;
  if (invoice.invoice_source === "NON-PO") {
    return invoiceAmount;
  }
  return invoiceAmount;
}

interface InvoiceLine {
  id: number;
  invoice_id: number;
  line_number: number | null;
  item_id?: string | null;
  itemCode?: string | null;
  item_name: string | null;
  item_type: string | null;
  description: string | null;
  order_qty: string | number | null;
  order_unit_cost: string | number | null;
  order_cost: number | null;
  tax_amount: string | number | null;
  tax_rate: string | number | null;
  tax_rate_code: string | number | null;
  // taxable_flag: string | null;
  po_number: string | null;
  po_line_number: string | null;
  product_category_name: string | null;
  line_status: string | null;
  uom?: string | null;
  delivery_date?: string | null;
  inclusiveTaxAmt?: string;
}

interface BankDetail {
  id: number;
  bank_name: string | null;
  account_no: string | null;
  bank_account_type: string | null;
  beneficiary_name: string | null;
  bank_address: string | null;
  swift_code: string | null;
  ifsccode: string | null;
  iban_no: string | null;
  branch_name: string | null;
  currency: string | null;
  primary_account: string | null;
}

interface ApprovalHistoryItem {
  id: number;
  object_id: string;
  approver_id: string | null;
  approver_name: string | null;
  email: string | null;
  designation: string | null;
  status: string | null;
  comments: string | null;
  approved_date: string | null;
  requested_date: string | null;
  attribute_1: string | null;
}

interface Organization {
  id: number;
  organization_name: string;
}

interface DboSupplier {
  id: number;
  companyName?: string;
  status?: string;
}

const ROLE_NAMES = [
  "ROLE_PROCUREMENT_OFFICER",
  "ROLE_PROCUREMENT_MANAGER",
  "ROLE_FINANCE_MANAGER",
  "ROLE_FINANCE_OFFICER",
  "ROLE_DEPARTMENT_HEAD",
  "ROLE_SYSADMIN",
  "ROLE_SUPERADMIN",
  "ROLE_DEPARTMENT_USER",
];

function formatApproverDisplayName(approver: string): string {
  const trimmed = approver.trim();
  const upperApprover = trimmed.toUpperCase();
  if (ROLE_NAMES.some(role => upperApprover === role)) {
    return `Any User in ${trimmed} Role`;
  }
  return trimmed;
}

const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
const MAX_FILE_SIZE_MB = 5;
const DANGEROUS_EXTS = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".vbs", ".js", ".jar", ".php", ".html", ".htm", ".svg", ".xml", ".dll", ".scr"];

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  "Draft": { label: "Draft", icon: FileText, variant: "secondary" },
  "Pending Approval": { label: "Pending Approval", icon: Clock, variant: "outline", className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "Approved": { label: "Approved", icon: CheckCircle2, variant: "default" },
  "Paid": { label: "Paid", icon: CreditCard, variant: "secondary", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "Rejected": { label: "Rejected", icon: XCircle, variant: "destructive" },
  "More Info Required": { label: "More Info Required", icon: Clock, variant: "outline", className: "border-orange-300 text-orange-600 dark:text-orange-400" },
};

function StatusBadge({ status }: { status: string | null }) {
  const config = statusConfig[status || "Draft"] || statusConfig["Draft"];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className || ""}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: typeof Building2 }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || "-"}</p>
      </div>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id ? String(params.id) || "0" : "0";
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState("lines");
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [editLineOpen, setEditLineOpen] = useState(false);
  const [editInvoiceSheetOpen, setEditInvoiceSheetOpen] = useState(false);
  const [isEditInvoiceFormInitialized, setIsEditInvoiceFormInitialized] = useState(false);
  const [editingLine, setEditingLine] = useState<InvoiceLine | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"Approve" | "Reject" | "More" | "Request">("Approve");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [delegateApproverId, setDelegateApproverId] = useState("");
  const { data: delegateApprovers = [] } = useQuery<
    { id: number; name: string; user_name: string }[]
  >({
    queryKey: ["/api/users/dropdown"],
    enabled: approvalDialogOpen && approvalAction === "Request",
  });
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [deletedDocIds, setDeletedDocIds] = useState<number[]>([]);
  const [newFiles, setNewFiles] = useState<{ id: string; file: File; name: string; previewUrl: string | null }[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taxSelectKey, setTaxSelectKey] = useState(0);
  const [invoiceNumDuplicate, setInvoiceNumDuplicate] = useState<{ duplicate: boolean; invoice?: { id: number; invoice_number: string; supplier_name: string; invoice_status: string } } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const authData1 = typeof window !== "undefined" ? localStorage.getItem("prokraya-auth") : null;
  const authParsed1 = authData1 ? JSON.parse(authData1) : null;
  const userOrgIds: string[] = authParsed1?.orgIds || [];

  const checkInvoiceNumberDuplicate = async (invoiceNumber: string) => {
    if (!invoiceNumber.trim()) {
      setInvoiceNumDuplicate(null);
      return;
    }
    setCheckingDuplicate(true);
    try {
      const res = await apiRequest("GET", `/api/invoices/check-duplicate?invoice_number=${encodeURIComponent(invoiceNumber.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setInvoiceNumDuplicate(data);
      }
    } catch {
      setInvoiceNumDuplicate(null);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const [editInvoiceForm, setEditInvoiceForm] = useState({
    invoice_number: "",
    invoice_date: "",
    description: "",
    invoice_type: "Standard",
    invoice_curr_code: "AED",
    department_name: "",
    payment_terms_name: "",
    budget_name: "",
    invoice_reason: "",
    invoice_notes: "",
    orgId: "",
    budget_id: "",
    inv_due_date: "",
    supplier_id: "",
    supplier_name: "",
  });

  const isFormValid =
    isEditInvoiceFormInitialized &&
    Boolean(editInvoiceForm.supplier_name) &&
    Boolean(editInvoiceForm.department_name) &&
    Boolean(editInvoiceForm.orgId) &&
    Boolean(editInvoiceForm.invoice_number) &&
    Boolean(editInvoiceForm.invoice_date) &&
    Boolean(editInvoiceForm.invoice_type) &&
    Boolean(editInvoiceForm.invoice_curr_code) &&
    Boolean(editInvoiceForm.description) &&
    Boolean(editInvoiceForm.invoice_reason) &&
    Boolean(editInvoiceForm.budget_id) &&
    Boolean(editInvoiceForm.budget_name) &&
    Boolean(editInvoiceForm.payment_terms_name);

  const collaborationPanelRef = useRef<CollaborationPanelRef>(null);
  const [collaborationCount, setCollaborationCount] = useState(0);

  const { data: invoice, isLoading } = useQuery<InvoiceDetail>({
    queryKey: [`/api/invoices/${invoiceId}`],
    enabled: !!invoiceId,
  });

  const { data: lines = [], isLoading: linesLoading } = useQuery<InvoiceLine[]>({
    queryKey: [`/api/invoices/${invoiceId}/lines`],
    enabled: !!invoiceId,
  });

  const { data: departments = [] } = useQuery<{ id: number; value: string }[]>({
    queryKey: ["/api/departments"],
    enabled: editInvoiceSheetOpen,
  });

  const { data: currencies = [] } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["/api/vendor/lookups/currencies"],
    enabled: editInvoiceSheetOpen,
  });

  const { data: paymentTerms = [] } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["/api/vendor/lookups/payment-terms"],
    enabled: editInvoiceSheetOpen,
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: suppliersData } = useQuery<{ data: DboSupplier[]; total: number }>({
    queryKey: ["/api/dbo/suppliers", { page: 1, limit: 500, status: "Active,Changes In Draft" }],
    queryFn: () => apiRequest("GET", "/api/dbo/suppliers?page=1&limit=500&status=Active%2CChanges%20In%20Draft").then(r => r.json()),
  });
  const suppliers = suppliersData?.data || [];

  const currentYear = new Date().getFullYear().toString();
  const { data: budgetLines = [] } = useQuery<
    {
      id: number;
      segment_dtl_code: string;
      segment_dtl_name: string;
      amount: string;
      consumed_amount: string;
      reserved_amount: string;
      business_entity: string;
      budget_mst_id: number;
      budget_name: string;
      budget_curr: string;
      dept_id: string;
    }[]
  >({
    queryKey: ["/api/budgets/approved-lines"],
    enabled: editInvoiceSheetOpen,
  });

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem("currentTaskId");
    setTaskId(storedTaskId);
  }, []);

  useEffect(() => {
    // Fallback: If taskId is not set via sessionStorage (direct navigation) or is out of sync,
    // get it from the invoice attribute_12 field which stores the act_ru_task ID
    if (invoice) {
      if (invoice.attribute_12 && invoice.attribute_12 !== taskId) {
        console.log("Invoice Detail: Syncing taskId with attribute_12:", invoice.attribute_12);
        setTaskId(invoice.attribute_12);
        // Synchronize with sessionStorage so mutations can read it correctly
        sessionStorage.setItem("currentTaskId", invoice.attribute_12);
      } else if (!invoice.attribute_12 && taskId) {
        // If the current invoice has no task ID but we have an old one, clear it
        console.log("Invoice Detail: Clearing out-of-sync taskId");
        setTaskId(null);
        sessionStorage.removeItem("currentTaskId");
      }
    }
  }, [invoice?.id, invoice?.attribute_12, taskId]);

  const [newLine, setNewLine] = useState({
    item_id: "",
    item_name: "",
    description: "",
    item_type: "ITEM",
    uom: "",
    order_qty: "",
    order_unit_cost: "",
    tax_rate: "",
    tax_rate_code: "",
    tax_amount: "",
    // taxable_flag: "N",
    po_number: "",
    po_line_number: "",
    product_category_name: "",
    category_code: "",
    itemCode: "",
    delivery_date: "",
    line_cost: "",
    inclusiveTaxAmt: "",
  });
  const [itemOpen, setItemOpen] = useState(false);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const authData = typeof window !== "undefined" ? localStorage.getItem("prokraya-auth") : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const currentUserId = authParsed?.userId ?? null;
  const isVendorUser = authParsed?.role === "vendor";
  const isSuperadmin = authParsed?.userRole === "ROLE_SUPERADMIN" || authParsed?.userRole === "ROLE_SYSADMIN";


  const { data: currentUserProfile } = useQuery<{
    name?: string;
    user_name?: string;
    email_id?: string;
    roles?: { role_name: string }[];
  }>({
    queryKey: ["/api/profile", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return null;
      const res = await apiRequest("GET", `/api/profile/${encodeURIComponent(currentUserId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentUserId,
  });

  const userRoleNames = [
    ...(currentUserProfile?.roles?.map(r => r.role_name) || []),
    authParsed?.userRole
  ].filter(Boolean);

  const hasPaymentTabAccess = userRoleNames.some(role =>
    ["ROLE_FINANCE_OFFICER", "ROLE_FINANCE_MANAGER", "ROLE_SUPERADMIN", "ROLE_SYSADMIN"].includes(role.toUpperCase())
  );
  const isSupplierUser = userRoleNames.some(role => ["ROLE_SUPPLIER_ADMIN", "ROLE_SUPPLIER_USER"].includes(role.toUpperCase()));

  const showPaymentTab = ((invoice?.invoice_status === "Approved" || invoice?.invoice_status === "Paid") && hasPaymentTabAccess) || (isSupplierUser && invoice?.invoice_status === "Paid");
  const isPaid = invoice?.invoice_status === "Paid";

  const paymentReady =
    invoice?.invoice_status === "Approved" || invoice?.invoice_status === "Paid";

  const { data: bankDetails = [], isLoading: bankLoading, isError: bankError } = useQuery<BankDetail[]>({
    queryKey: [`/api/invoices/${invoiceId}/bank-details`],
    enabled: invoiceId !== "0" && paymentReady && hasPaymentTabAccess,
  });

  const { data: paymentRecord } = useQuery<any>({
    queryKey: [`/api/invoices/${invoiceId}/payment-record`],
    enabled: invoiceId !== "0" && invoice?.invoice_status === "Paid",
  });

  const { data: notesData, isLoading: notesLoading } = useQuery<{ notes: string }>({
    queryKey: [`/api/invoices/${invoiceId}/notes`],
    enabled: invoiceId !== "0",
  });

  const isDraft = invoice?.invoice_status === "Draft";
  const isMoreInfoRequired = invoice?.invoice_status === "More Info Required" || invoice?.invoice_status === "more" || invoice?.invoice_status === "More Information Required";
  const isEditable = (isDraft || isMoreInfoRequired);

  const isOwner = (() => {
    if (!invoice || !currentUserProfile) return false;
    const owner = invoice.created_by?.toLowerCase();
    if (!owner) return true; // Allow if no creator specified (legacy or draft)
    const currentSpecs = [
      currentUserProfile.user_name?.toLowerCase(),
      currentUserProfile.email_id?.toLowerCase()
    ].filter(Boolean);
    return currentSpecs.includes(owner);
  })();

  const canVendorEdit = isVendorUser && !!invoice?.po_number && Number(invoice?.supplier_id) === Number(authParsed?.supplierId);
  const canEditInvoice = isEditable && (isOwner || isSuperadmin || canVendorEdit);

  const { data: approvalHistory = [] } = useQuery<ApprovalHistoryItem[]>({
    queryKey: [`/api/invoices/${invoiceId}/approval-history`],
    enabled: !!invoiceId && !isDraft,
  });

  const { data: invoiceDocuments = [], isLoading: docsLoading } = useQuery<{
    id: number;
    file_name: string;
    file_path: string;
    doc_type: string;
    source: string;
    created_by: string;
    created_date: string;
    preview_url?: string;
  }[]>({
    queryKey: ['/api/invoices', invoiceId, 'documents'],
    enabled: !!invoiceId,
  });

  // Real attachment upload/view/delete for the "Upload Document" card — reuses
  // the same /api/invoices/:invoiceId/documents endpoints the invoiceDocuments
  // query above and the CollaborationPanel below already call for this same
  // invoice. Declared above the isLoading early-return so these hooks always
  // run (Rules of Hooks).
  const invoiceDocumentsUrl = `/api/invoices/${invoiceId}/documents`;
  const getAuthHeaders = (): Record<string, string> => {
    try {
      const parsed = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
      return {
        "x-user-email": parsed.userId || "",
        "x-user-name": parsed.userName || "",
      };
    } catch {
      return {};
    }
  };
  const uploadDocInputRef = useRef<HTMLInputElement>(null);

  const uploadInvoiceDocumentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(invoiceDocumentsUrl, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to upload document");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId, 'documents'] });
      toast({ title: "Document added", description: "Document has been attached to this invoice." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add document", description: error.message, variant: "destructive" });
    },
  });

  const handleViewInvoiceDocument = async (doc: { id: number; file_name: string }) => {
    try {
      const res = await fetch(`${invoiceDocumentsUrl}/${doc.id}/download`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch document");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const tab = window.open(url, "_blank");
      if (!tab) toast({ title: "Allow pop-ups to view documents", variant: "destructive" });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast({ title: "Failed to open document", variant: "destructive" });
    }
  };

  const deleteInvoiceDocumentMutation = useMutation({
    mutationFn: async (docId: number) => apiRequest("DELETE", `${invoiceDocumentsUrl}/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId, 'documents'] });
      toast({ title: "Document deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete document", variant: "destructive" });
    },
  });

  const handleSaveNotes = async (notes: string) => {
    await apiRequest("PUT", `/api/invoices/${invoiceId}/notes`, { notes });
    queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/notes`] });
  };

  const [paymentForm, setPaymentForm] = useState({
    payment_method: "",
    payment_description: "",
    payment_date: new Date().toISOString().split("T")[0],
    total_invoice_amount: "",
    amount_to_pay: "",
    bank_name: "",
    branch_name: "",
    online_transfer_account_no: "",
    bank_transfer_ref_no: "",
    cheque_number: "",
    cheque_date: "",
    cheque_collected_by: "",
    cheque_collection_date: "",
    cheque_collector_contact_no: "",
    cheque_collector_email: "",
    tds_category: "",
    tds_amount: "",
  });

  const [phoneError, setPhoneError] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (isMoreInfoRequired) {
        const storedTaskId = invoice?.attribute_12 !== undefined && invoice?.attribute_12 !== null
          ? invoice?.attribute_12
          : sessionStorage.getItem("currentTaskId");
        const res = await apiRequest("POST", `/api/invoices/${invoiceId}/process-approval`, {
          taskId: storedTaskId,
          result: "resubmit",
          comments: "Invoices Resubmitted"
        });
        return res.json();
      }
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/submit`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice submitted for approval" });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  const canSubmit = isFormValid && lines.length > 0 && !invoiceNumDuplicate?.duplicate && invoiceDocuments?.length > 0;
  const canSaveDraft = Boolean(editInvoiceForm.supplier_name && editInvoiceForm.department_name && editInvoiceForm.orgId && editInvoiceForm.invoice_number && !invoiceNumDuplicate?.duplicate);
  const activeSubmissionType = (submitMutation.variables as { submissionType?: "Draft" | "Submit" } | undefined)?.submissionType;
  const isSubmitPending = submitMutation.isPending && activeSubmissionType === "Submit";
  const isDraftPending = submitMutation.isPending && activeSubmissionType === "Draft";

  // authData & currentUserProfile logic moved up for showPaymentTab evaluation

  const { data: taskDetails } = useQuery<{
    assignee_: string | null;
    id_: string;
  }>({
    queryKey: ["/api/workflow-engine/task", taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const res = await apiRequest("GET", `/api/workflow-engine/task/${encodeURIComponent(taskId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!taskId,
  });

  const canApprove = (() => {
    if (!taskId || !taskDetails) return false;

    // Super-admin can approve any task (backend shows all tasks to them)
    if (userRoleNames.some((r) => r === "ROLE_SUPERADMIN" || r === "ROLE_SYSADMIN")) return true;

    const currentOwner = taskDetails.assignee_;
    if (!currentOwner) return false;

    // Check if assigned to a role
    if (ROLE_NAMES.some(role => currentOwner.toUpperCase() === role)) {
      return userRoleNames.some(r => r.toUpperCase() === currentOwner.toUpperCase());
    }

    // Check if assigned to specific user (by name, email, or ID)
    const currentUserIdentifiers = [
      currentUserId?.toString(),
      authParsed?.userId?.toString(),
      authParsed?.userName?.toLowerCase(),
      authParsed?.email?.toLowerCase(),
      authParsed?.userNameId?.toLowerCase(),
      currentUserProfile?.user_name?.toLowerCase(),
      currentUserProfile?.email_id?.toLowerCase(),
      currentUserProfile?.name?.toLowerCase()
    ].filter(Boolean);

    return currentUserIdentifiers.includes(currentOwner.toLowerCase());
  })();

  const approvalMutation = useMutation({
    mutationFn: async (data: { action: string; remarks: string }) => {
      const storedTaskId = invoice?.attribute_12 !== undefined && invoice?.attribute_12 !== null
        ? invoice?.attribute_12
        : sessionStorage.getItem("currentTaskId");
      return apiRequest("POST", `/api/invoices/${invoiceId}/process-approval`, {
        taskId: storedTaskId,
        result: data.action,
        comments: data.remarks
      });
    },
    onSuccess: (_, variables) => {
      const actionMessages: Record<string, string> = {
        Approve: "Invoice has been approved.",
        Reject: "Invoice has been rejected.",
        More: "Request for more information has been sent.",
      };
      toast({
        title: variables.action === "Approve" ? "Invoice Approved" : variables.action === "Reject" ? "Invoice Rejected" : "More Info Requested",
        description: actionMessages[variables.action] || "Action completed successfully.",
        duration: 5000
      });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/bank-details`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/approval-history`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-engine/task"] });
      sessionStorage.removeItem("currentTaskId");
      setTaskId(null);
      setApprovalDialogOpen(false);
      setApprovalRemarks("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to process approval",
        description: error.message,
        variant: "destructive",
      });
      // Force cleanup even on error
      document.body.style.pointerEvents = "auto";
    },
  });

  const delegateActionMutation = useMutation({
    mutationFn: async (data: { userName: string; comments: string }) => {
      const storedTaskId = invoice?.attribute_12 !== undefined && invoice?.attribute_12 !== null
        ? invoice?.attribute_12
        : sessionStorage.getItem("currentTaskId");
      return apiRequest("POST", "/api/workflow/delegate-request", {
        taskId: storedTaskId,
        userName: data.userName,
        comments: data.comments,
        entityId: invoiceId,
        module: "INVOICE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Request Delegated",
        description: "Invoice approval has been delegated.",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/approval-history`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-engine/task"] });
      sessionStorage.removeItem("currentTaskId");
      setTaskId(null);
      setApprovalDialogOpen(false);
      setApprovalRemarks("");
      setDelegateApproverId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delegate request",
        description: error.message,
        variant: "destructive",
      });
      document.body.style.pointerEvents = "auto";
    },
  });

  // Item master dropdown data
  const { data: itemsData } = useQuery<{
    id: string; itemCode: string; name: string;
    categoryCode: string; categoryName: string;
    unitOfMeasure: string; standardPrice: number | null;
  }[]>({
    queryKey: ["/api/items"],
    enabled: addLineOpen || editLineOpen,
  });
  const items = itemsData || [];

  const { data: categoriesData } = useQuery<{ id: string; code: string; name: string; level: string }[]>({
    queryKey: ["/api/categories"],
    enabled: addLineOpen || editLineOpen,
  });
  const categories = categoriesData || [];

  const { data: uomData } = useQuery<{ id: number; description: string }[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: addLineOpen || editLineOpen,
  });
  const uomOptions = uomData || [];

  const { data: taxCodesData } = useQuery<{ id: number; tax_code_id: string; tax_code: string; tax_code_desc: string; tax_rate: number; tax_type: string }[]>({
    queryKey: ["/api/tax-codes"],
  });
  const taxCodes = taxCodesData || [];

  // Modal Janitor - Forcefully restores interactivity when all known modally-interactive components are closed
  useEffect(() => {
    const isAnyModalOpen =
      approvalDialogOpen ||
      addLineOpen ||
      editLineOpen;

    if (!isAnyModalOpen) {
      // Add a slight delay to ensure Radix has finished its own cleanup attempt
      const timer = setTimeout(() => {
        if (typeof document !== 'undefined') {
          // Restore pointer events
          document.body.style.pointerEvents = "auto";

          // Forcefully remove aria-hidden from all elements (Radix often sticks it on #root or body)
          const appRoot = document.getElementById('root');
          if (appRoot) {
            appRoot.removeAttribute('aria-hidden');
            appRoot.style.pointerEvents = "auto";
          }

          document.body.removeAttribute('aria-hidden');
          document.body.style.overflow = "auto";

          // If we are really stuck, we can re-query all elements that might have aria-hidden
          const hiddenElements = document.querySelectorAll('[aria-hidden="true"]');
          hiddenElements.forEach(el => {
            el.removeAttribute('aria-hidden');
          });

          console.log("Invoice Modal Janitor: DOM Cleanup completed.");
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [approvalDialogOpen, addLineOpen, editLineOpen]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/invoices/${invoiceId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice deleted" });
      setLocation("/app/invoices");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });


  const updateInvoiceMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await apiRequest("PUT", `/api/invoices/${invoiceId}`, formData);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice updated successfully" });
      setEditInvoiceSheetOpen(false);
      setDeletedDocIds([]);
      setNewFiles([]);
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId, 'documents'] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
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
      toast({ title: "This file type is not allowed", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const isAllowed = Object.entries(ALLOWED_FILE_TYPES).some(
      ([mime, exts]) => exts.includes(ext) || file.type === mime
    );
    if (!isAllowed) {
      toast({ title: "Unsupported file type. Allowed: PDF, JPG, PNG, DOC, DOCX", variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({ title: `File too large. Max ${MAX_FILE_SIZE_MB}MB allowed.`, variant: "destructive" });
      e.target.value = "";
      return;
    }

    let preview: string | null = null;
    if (file.type.startsWith("image/")) {
      preview = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }

    const newId = `new_doc_${Date.now()}`;
    setNewFiles((prev) => [...prev, { id: newId, file, name: file.name, previewUrl: preview }]);
    e.target.value = "";
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Re-use logic from handleFileSelect but tailored for drop
      const fileName = file.name || "";
      const ext = fileName.lastIndexOf(".") >= 0 ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase() : "";

      if (DANGEROUS_EXTS.includes(ext)) {
        toast({ title: "This file type is not allowed", variant: "destructive" });
        return;
      }

      const isAllowed = Object.entries(ALLOWED_FILE_TYPES).some(
        ([mime, exts]) => exts.includes(ext) || file.type === mime
      );
      if (!isAllowed) {
        toast({ title: "Unsupported file type", variant: "destructive" });
        return;
      }

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast({ title: `File too large. Max ${MAX_FILE_SIZE_MB}MB allowed.`, variant: "destructive" });
        return;
      }

      let preview: string | null = null;
      if (file.type.startsWith("image/")) {
        preview = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      const newId = `new_doc_${Date.now()}`;
      setNewFiles((prev) => [...prev, { id: newId, file, name: file.name, previewUrl: preview }]);
    }
  }

  const addLineMutation = useMutation({
    mutationFn: async (lineData: any) => {
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/lines`, lineData);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Line item added" });
      setAddLineOpen(false);
      setNewLine({ item_id: "", item_name: "", description: "", item_type: "ITEM", uom: "", order_qty: "", order_unit_cost: "", tax_rate: "", tax_rate_code: "", tax_amount: "", po_number: "", po_line_number: "", product_category_name: "", category_code: "", itemCode: "", delivery_date: "", line_cost: "", inclusiveTaxAmt: "" });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/lines`] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, data }: { lineId: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/invoices/${invoiceId}/lines/${lineId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Line item updated" });
      setEditLineOpen(false);
      setEditingLine(null);
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/lines`] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const payMutation = useMutation({
    mutationFn: async (payData: any) => {
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/pay`, payData);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payment recorded successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (lineId: number) => {
      const res = await apiRequest("DELETE", `/api/invoices/${invoiceId}/lines/${lineId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Line item deleted" });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/lines`] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateTaxMutation = useMutation({
    mutationFn: async (data: string) => {
      const res = await apiRequest("PUT", `/api/invoices/${invoiceId}/update-tax-included`, {
        taxIncluded: data
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Tax type updated successfully",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/invoices/${invoiceId}/lines`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/invoices/${invoiceId}`],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update Tax type",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTaxIncludedMethod = (value: string) => {
    updateTaxMutation.mutate(value);
  };

  const calculateInclusiveLineValues = (lineData: { order_qty: string | number | null; inclusiveTaxAmt: string | number | null; tax_rate: string | number | null }) => {
    const qty = parseFloat(String(lineData.order_qty)) || 1;
    const lineTotal = parseFloat(String(lineData.inclusiveTaxAmt)) || 0;
    const taxRate = parseFloat(String(lineData.tax_rate)) || 0;
    const taxAmount = (lineTotal * taxRate) / 100;
    const netAmount = Math.max(0, lineTotal - taxAmount);
    const unitPrice = qty > 0 ? netAmount / qty : 0;
    const lineCost = netAmount;

    return { unitPrice, lineCost, taxAmount };
  };

  const handleAddLine = () => {
    const isInclusive = invoice?.tax_included === "Yes";
    const qty = parseFloat(newLine.order_qty) || 0;
    const taxRate = parseFloat(newLine.tax_rate) || 0;
    
    let unitCost = parseFloat(newLine.order_unit_cost) || 0;
    let orderCost = qty * unitCost;
    let taxAmount = orderCost * (taxRate / 100);

    if (isInclusive) {
      const lineData = {
        order_qty: newLine.order_qty,
        inclusiveTaxAmt: newLine.inclusiveTaxAmt || "0",
        tax_rate: newLine.tax_rate
      };
      const inclusiveValues = calculateInclusiveLineValues(lineData);
      unitCost = inclusiveValues.unitPrice;
      orderCost = inclusiveValues.lineCost;
      taxAmount = inclusiveValues.taxAmount;
    }

    addLineMutation.mutate({
      item_id: newLine.item_id || null,
      item_name: newLine.item_name,
      description: newLine.description || newLine.item_name,
      item_type: newLine.item_type,
      uom: newLine.uom || null,
      order_qty: qty,
      order_unit_cost: unitCost,
      order_cost: orderCost,
      tax_rate: taxRate,
      tax_rate_code: newLine.tax_rate_code,
      tax_amount: taxAmount,
      // taxable_flag: newLine.taxable_flag,
      po_number: newLine.po_number || null,
      po_line_number: newLine.po_line_number || null,
      product_category_name: newLine.product_category_name || null,
      line_number: lines.length + 1,
      delivery_date: newLine.delivery_date || null,
      line_cost: orderCost,
    });
  };

  const handleEditLine = () => {
    if (!editingLine) return;
    const isInclusive = invoice?.tax_included === "Yes";
    const qty = parseFloat(String(editingLine.order_qty)) || 0;
    const taxRate = parseFloat(String(editingLine.tax_rate)) || 0;

    let unitCost = parseFloat(String(editingLine.order_unit_cost)) || 0;
    let orderCost = Number(qty) * Number(unitCost);
    let taxAmount = orderCost * (Number(taxRate) / 100);

    if (isInclusive) {
      const lineData = {
        order_qty: editingLine.order_qty,
        inclusiveTaxAmt: editingLine.inclusiveTaxAmt || "0",
        tax_rate: editingLine.tax_rate
      };
      const inclusiveValues = calculateInclusiveLineValues(lineData);
      unitCost = inclusiveValues.unitPrice;
      orderCost = inclusiveValues.lineCost;
      taxAmount = inclusiveValues.taxAmount;
    }

    updateLineMutation.mutate({
      lineId: editingLine.id,
      data: {
        item_name: editingLine.item_name,
        description: editingLine.description,
        item_type: editingLine.item_type,
        order_qty: qty,
        order_unit_cost: unitCost,
        order_cost: orderCost,
        tax_rate: taxRate,
        tax_rate_code: editingLine.tax_rate_code,
        tax_amount: taxAmount,
        po_number: editingLine.po_number,
        po_line_number: editingLine.po_line_number,
        product_category_name: editingLine.product_category_name,
        uom: editingLine.uom,
        delivery_date: editingLine.delivery_date,
      },
    });
  };

  const isPending = invoice?.invoice_status === "Pending Approval";

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link href="/app/invoices">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Invoice Not Found</h1>
        </div>
      </div>
    );
  }

  const filteredBudgets = budgetLines?.filter((item) => {

    if (
      !editInvoiceForm.orgId &&
      !editInvoiceForm.department_name
    ) {
      return false;
    }

    const matchOrg =
      !editInvoiceForm.orgId ||
      item.business_entity
        ?.split(",")
        .map((id) => id.trim())
        .includes(String(editInvoiceForm.orgId));

    const selectedDept = departments.find(
      (d) => d.value === editInvoiceForm.department_name
    );

    const matchDept =
      !editInvoiceForm.department_name ||
      item.dept_id
        ?.split(",")
        .map((id) => id.trim())
        .includes(String(selectedDept?.id));

    return matchOrg && matchDept;
  });

  const uniqueBudgets = Array.from(
    new Map(
      filteredBudgets?.map((item) => [item.id, item])
    ).values()
  );

  // Shared submit-for-approval validation, used by both the header's Submit
  // button and the Quick Actions sidebar card so the two stay in sync.
  const handleSubmitInvoice = () => {
    if (invoiceNumDuplicate?.duplicate) {
      toast({ title: "Duplicate: Invoice number already exists", variant: "destructive" });
      return;
    }
    if (invoice.invoice_source === "NON-PO" && isEditInvoiceFormInitialized && !isFormValid) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (lines.length === 0) {
      toast({ title: "At least one line item is required before submitting", variant: "destructive" });
      return;
    }
    if (isMoreInfoRequired && lines.length === 0) {
      toast({ title: "At least one line item is required before re-submitting", variant: "destructive" });
      return;
    }
    if (invoiceDocuments.length === 0 && newFiles.length === 0) {
      toast({ title: "At least one document is required before submitting", variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  };

  // Shared "open Edit Invoice sheet" setup, used by both the header's Edit
  // button and the Quick Actions sidebar card.
  const handleOpenEditInvoice = () => {
    setIsEditInvoiceFormInitialized(true);
    setEditInvoiceForm({
      invoice_number: invoice.invoice_number || "",
      invoice_date: invoice.invoice_date?.split("T")[0] || "",
      description: invoice.description || "",
      invoice_type: invoice.invoice_type?.toLowerCase() || "Standard",
      invoice_curr_code: invoice.invoice_curr_code || "AED",
      department_name: invoice.department_name || "",
      payment_terms_name: invoice.payment_terms_name || "",
      budget_name: invoice.budget_name || "",
      invoice_reason: invoice.invoice_reason || "",
      invoice_notes: invoice.invoice_notes || "",
      orgId: String(invoice.org_id) || "",
      budget_id: String(invoice.budget_segment) || "",
      inv_due_date: invoice.inv_due_date?.split("T")[0] || "",
      supplier_id: invoice.supplier_id?.toString() || "",
      supplier_name: invoice.supplier_name || "",
    });
    setDeletedDocIds([]);
    setNewFiles([]);
    setEditInvoiceSheetOpen(true);
  };

  return (
    <div className="flex">
      <div className={`flex-1 min-w-0 p-4 space-y-3 transition-all duration-300 ${collaborationPanelRef.current?.isPinned ? "pr-6" : ""}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Link href="/app/invoices">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold" data-testid="text-invoice-number">
                  {invoice.invoice_number}
                </h1>
                <StatusBadge status={invoice.invoice_status} />
              </div>
              {/* <p className="text-sm text-muted-foreground">{invoice.description || "Invoice Details"}</p> */}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(isSuperadmin || isVendorUser) && invoice.invoice_status !== "Pending Approval" && invoice.invoice_status !== "Paid" && invoice.invoice_status !== "Approved" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" data-testid="button-delete-invoice">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete invoice {invoice.invoice_number}? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canEditInvoice && (
              <>
                <Button
                  size="sm"
                  onClick={handleSubmitInvoice}
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-invoice"
                >
                  {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  {isMoreInfoRequired ? "Re-submit" : "Submit"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenEditInvoice}
                  data-testid="button-edit-invoice"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </>
            )}
            {isPending && (canApprove || (currentUserProfile?.roles || []).some((r: { role_name: string }) => r.role_name === "ROLE_SUPERADMIN")) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="button-approve-invoice">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      resolveApprovalChecklistAvailability("Invoice").then((available) => {
                        if (available) {
                          setChecklistDialogOpen(true);
                        } else {
                          setApprovalAction("Approve");
                          setTimeout(() => setApprovalDialogOpen(true), 100);
                        }
                      });
                    }}
                    className="text-green-600 dark:text-green-400"
                    data-testid="menu-item-approve"
                  >
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setApprovalAction("Reject");
                      setTimeout(() => setApprovalDialogOpen(true), 100);
                    }}
                    className="text-red-600 dark:text-red-400"
                    data-testid="menu-item-reject"
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Reject
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setApprovalAction("More");
                      setTimeout(() => setApprovalDialogOpen(true), 100);
                    }}
                    className="text-orange-600 dark:text-orange-400"
                    data-testid="menu-item-more-info"
                  >
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Request More Info
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setApprovalAction("Request");
                      setTimeout(() => setApprovalDialogOpen(true), 100);
                    }}
                    className="text-blue-600 dark:text-blue-400"
                    data-testid="menu-item-delegate"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Request for Delegate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {paymentReady && <ViewChecklistButton moduleName="Invoice" refNumber={invoice?.invoice_number} />}

            <Button
              variant="outline"
              size="icon"
              onClick={() => collaborationPanelRef.current?.toggle()}
              className="relative"
              aria-label="Collaboration panel"
              data-testid="button-collaboration-panel"
            >
              <MessageSquare className="h-4 w-4" />
              {collaborationCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                  {collaborationCount > 9 ? "9+" : collaborationCount}
                </span>
              )}
            </Button>
          </div>
        </div>

        {invoiceDocuments.length > 0 && (
          <div className="flex items-center gap-2 py-1.5 px-1 rounded-md border bg-muted/30" data-testid="quick-docs-strip">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium pl-2 shrink-0">
              <Paperclip className="h-3.5 w-3.5" />
              <span>Documents ({invoiceDocuments.length})</span>
            </div>
            <div className="h-4 w-px bg-border shrink-0" />
            <div className="flex items-center gap-1.5">
              {invoiceDocuments.map((doc) => {
                const ext = doc.file_name?.split('.').pop()?.toLowerCase() || '';
                const isPdf = ext === 'pdf';
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                const isDoc = ['doc', 'docx'].includes(ext);
                const downloadUrl = doc?.source === 'SUPP_INVOICE'
                  ? `/api/invoices/documents/${doc?.id}/download`
                  : `/api/invoices/${invoiceId}/documents/${doc?.id}/download`;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded border bg-background group relative cursor-pointer shrink-0 hover-elevate"
                    title={doc.file_name}
                    data-testid={`quick-doc-${doc.id}`}
                  >
                    {doc.preview_url ? (
                      <img src={doc.preview_url} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" />
                    ) : isPdf ? (
                      <FileText className="h-3.5 w-3.5 text-red-500/70 shrink-0" />
                    ) : isImage ? (
                      <FileImage className="h-3.5 w-3.5 text-blue-500/70 shrink-0" />
                    ) : isDoc ? (
                      <FileText className="h-3.5 w-3.5 text-blue-600/70 shrink-0" />
                    ) : (
                      <File className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span className="text-xs truncate max-w-[120px]">{doc.file_name}</span>
                    <button
                      type="button"
                      className="h-5 w-5 ml-0.5 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadDocument(doc, downloadUrl)
                      }}
                      title="Download"
                      data-testid={`quick-download-${doc.id}`}
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewDoc(doc);
                      }}
                      title="Preview"
                      data-testid={`quick-preview-${doc.id}`}
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Invoice details
              </CardTitle>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  Created on : {formatDate(invoice.creation_date)}
                </p>
                <p className="text-xs font-medium text-primary">
                  Total Amount: {formatCurrency(Number(invoice.invoice_amount || 0) + Number(invoice.tax_amount || 0), invoice.invoice_curr_code)}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Invoice Description</p>
                <p className="text-sm font-medium">{invoice.description || "No description"}</p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <InfoRow label="Invoice Number" value={invoice.invoice_number} icon={Hash} />
                </div>
                <div>
                  <InfoRow label="Invoice Date" value={formatDate(invoice.invoice_date)} icon={Calendar} />
                  <p className="text-xs text-muted-foreground mt-0.5">Submitted: {formatDate(invoice.creation_date)}</p>
                </div>
                {/* <InfoRow label="Invoice Type" value={invoice.invoice_type || "Standard"} /> */}
                <InfoRow label="Invoice Currency" value={invoice.invoice_curr_code || "-"} />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Due Date" value={formatDate(invoice.inv_due_date)} icon={Calendar} />
                <InfoRow label="Submitted By" value={invoice.submitted_by} />
              </div>
              {invoice.po_number ? (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <InfoRow label="PO Number" value={invoice.po_number} icon={FileText} />
                      {invoice.po_description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{invoice.po_description}</p>
                      )}
                    </div>
                    <div>
                      <InfoRow label="PO Total Amount" value={invoice.po_total_amount ? formatCurrency(invoice.po_total_amount, invoice.invoice_curr_code) : "-"} />
                      <p className="text-xs text-muted-foreground mt-0.5">Invoiced: {formatCurrency(Number(invoice.invoice_amount || 0) + Number(invoice.tax_amount || 0), invoice.invoice_curr_code)}</p>
                    </div>
                  </div>
                </>
              ) : invoice.invoice_reason ? (
                <>
                  <Separator />
                  <div>
                    <InfoRow label="Reason for Non PO" value={invoice.invoice_reason} icon={FileText} />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Supplier & Financial Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Supplier
                  </p>
                  <p className="text-sm font-medium">{invoice.supplier_display_name || invoice.supplier_name || "-"}</p>
                  {invoice.supplier_contact && (
                    <p className="text-xs text-muted-foreground mt-0.5">{invoice.supplier_contact}</p>
                  )}
                  {invoice.supplier_contact_email && (
                    <p className="text-xs text-muted-foreground mt-0.5">{invoice.supplier_contact_email}</p>
                  )}
                  {invoice.supplier_contact_phone && (
                    <p className="text-xs text-muted-foreground mt-0.5">{invoice.supplier_contact_phone}</p>
                  )}
                </div>
                <InfoRow label="Department" value={invoice.department_name} icon={Building2} />
              </div>
              {invoice.po_number && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Requestor
                      </p>
                      <p className="text-sm font-medium">{invoice.po_requestor_name || "-"}</p>
                      {invoice.po_requestor_email && (
                        <p className="text-xs text-muted-foreground mt-0.5">{invoice.po_requestor_email}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Buyer
                      </p>
                      <p className="text-sm font-medium">{invoice.po_buyer_name || "-"}</p>
                      {invoice.po_buyer_email && (
                        <p className="text-xs text-muted-foreground mt-0.5">{invoice.po_buyer_email}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Gross Amount" value={formatCurrency(Number(invoice.invoice_amount || 0), invoice.invoice_curr_code)} icon={DollarSign} />
                <InfoRow label="Tax Amount" value={formatCurrency(invoice.tax_amount, invoice.invoice_curr_code)} />
                <InfoRow label="Payment Terms" value={invoice.payment_terms_name} icon={CreditCard} />
                {!isVendorUser && (
                  <div className="col-span-2">
                    <InfoRow label="Budget" value={invoice.budget_name} icon={Wallet} />
                  </div>
                )}
                {!isVendorUser && invoice.org_id && (
                  <div className="col-span-2">
                    <InfoRow label="Business Entity" value={organizations.find((o) => o.id === invoice.org_id)?.organization_name || String(invoice.org_id)} icon={Building2} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Status stepper card */}
          <Card className="h-full flex flex-col">
            <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
              <CardTitle className="text-sm">
                Status - {invoice.invoice_status || "Draft"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4 flex-1">
              {(() => {
                // Real invoice lifecycle: Draft -> submitted for approval
                // (Pending Approval / More Info Required) -> Approved -> Paid.
                // Rejected is a terminal off-path outcome — shown at the
                // "Submitted" stage with destructive styling since that is
                // as far as the invoice got.
                const stageLabels = ["Submitted", "Approved", "Paid"];
                let currentStage = 0;
                if (isPending || isMoreInfoRequired) currentStage = 1;
                if (invoice.invoice_status === "Approved") currentStage = 2;
                if (isPaid) currentStage = 3;
                const isRejectedStatus = invoice.invoice_status === "Rejected";
                if (isRejectedStatus) currentStage = 1;

                return stageLabels.map((label, idx) => {
                  const stageNum = idx + 1;
                  const isDone = currentStage > stageNum;
                  const isActive = currentStage === stageNum;
                  const isNegativeActive = isRejectedStatus && isActive;
                  return (
                    <div key={label} className="flex items-start gap-3" data-testid={`status-stage-${stageNum}`}>
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "h-9 w-9 rounded-full border-2 flex items-center justify-center shrink-0",
                            isNegativeActive
                              ? "border-destructive"
                              : isDone || isActive
                                ? "border-primary"
                                : "border-muted-foreground/40",
                          )}
                        >
                          <div
                            className={cn(
                              "h-4 w-4 rounded-full",
                              isNegativeActive
                                ? "bg-destructive"
                                : isDone || isActive
                                  ? "bg-primary"
                                  : "bg-muted-foreground/60",
                            )}
                          />
                        </div>
                        {idx < stageLabels.length - 1 && (
                          <div className="w-0 flex-1 min-h-[28px] border-l-2 border-dotted border-primary" />
                        )}
                      </div>
                      <p
                        className={cn(
                          "text-sm pb-6 mt-2",
                          isNegativeActive
                            ? "text-destructive font-medium"
                            : isActive
                              ? "text-primary font-medium"
                              : isDone
                                ? "font-medium"
                                : "text-muted-foreground",
                        )}
                      >
                        {label}
                        {isNegativeActive && <span className="ml-1.5 text-xs">(Rejected)</span>}
                      </p>
                    </div>
                  );
                });
              })()}
            </CardContent>
          </Card>

          {/* Upload Document card — real attachments, via the same
              /api/invoices/:invoiceId/documents endpoints the
              CollaborationPanel below already uses for this invoice. */}
          <Card className="h-full flex flex-col">
            <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
              <CardTitle className="text-sm">Upload Document</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4 space-y-1 flex-1">
              <input
                ref={uploadDocInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadInvoiceDocumentMutation.mutate(file);
                  e.target.value = "";
                }}
                data-testid="input-upload-document"
              />
              <button
                type="button"
                className="w-full rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center py-3 gap-1.5 text-center hover-elevate disabled:opacity-60"
                onClick={() => uploadDocInputRef.current?.click()}
                disabled={uploadInvoiceDocumentMutation.isPending}
                data-testid="button-upload-document"
              >
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  {uploadInvoiceDocumentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </div>
                <p className="text-xs font-medium text-primary">Upload Document</p>
              </button>

              <div className="pt-1">
                {invoiceDocuments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    No documents attached
                  </p>
                ) : (
                  invoiceDocuments.slice(0, 5).map((doc, i) => (
                    <div
                      key={doc.id}
                      className={cn(
                        "flex items-center justify-between gap-2 py-2 px-1 text-xs",
                        i < Math.min(invoiceDocuments.length, 5) - 1 && "border-b",
                      )}
                      data-testid={`row-document-${doc.id}`}
                    >
                      <span className="truncate text-muted-foreground" title={doc.file_name}>
                        {doc.file_name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleViewInvoiceDocument(doc)}
                          className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate"
                          data-testid={`button-view-document-${doc.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteInvoiceDocumentMutation.mutate(doc.id)}
                          disabled={deleteInvoiceDocumentMutation.isPending}
                          className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate disabled:opacity-60"
                          data-testid={`button-delete-document-${doc.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
                {invoiceDocuments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => collaborationPanelRef.current?.open()}
                    className="w-full text-center text-xs font-medium text-primary hover:underline pt-2"
                    data-testid="button-view-all-documents"
                  >
                    View all
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick actions card — mirrors the header's Submit/Edit/Delete
              buttons, same handlers as the header versions (handleSubmitInvoice,
              handleOpenEditInvoice, deleteMutation). */}
          {(canEditInvoice || ((isSuperadmin || isVendorUser) && invoice.invoice_status !== "Pending Approval" && invoice.invoice_status !== "Paid" && invoice.invoice_status !== "Approved")) && (
            <Card className="h-full flex flex-col">
              <CardContent className="p-4 flex-1 flex flex-col gap-3">
                {canEditInvoice && (
                  <>
                    <Button
                      className="font-semibold"
                      onClick={handleSubmitInvoice}
                      disabled={submitMutation.isPending}
                      data-testid="button-submit-invoice-sidebar"
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin mr-2" />
                      ) : ""}
                      {isMoreInfoRequired ? "Re-submit" : "Submit for Approval"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleOpenEditInvoice}
                      data-testid="button-edit-invoice-sidebar"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Invoice
                    </Button>
                  </>
                )}
                {(isSuperadmin || isVendorUser) && invoice.invoice_status !== "Pending Approval" && invoice.invoice_status !== "Paid" && invoice.invoice_status !== "Approved" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="text-destructive hover:text-destructive border-destructive/40"
                        data-testid="button-delete-invoice-sidebar"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete invoice {invoice.invoice_number}? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-delete-cancel-sidebar">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid="button-delete-confirm-sidebar"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {invoice.invoice_notes && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{invoice.invoice_notes}</p>
            </CardContent>
          </Card>
        )}

        {invoice.po_number && invoice.invoice_reason && invoice.invoice_status === "More Info Required" && (
          <Card className="border-destructive/30">
            <CardContent className="p-3">
              <p className="text-xs text-destructive mb-1">{invoice.invoice_status} Reason</p>
              <p className="text-sm">{invoice.invoice_reason}</p>
            </CardContent>
          </Card>
        )}

        {!isDraft && !isVendorUser && (
          <Card className="mb-4" data-testid="card-approval-history">
            <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Approval history
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-4 pb-0">
                <div className="overflow-x-auto w-full pb-4 custom-scrollbar">
                  <div className="flex items-start min-w-max">
                    {(() => {
                      const timelineItems: Array<{
                        name: string;
                        email?: string;
                        designation?: string;
                        status: "Approved" | "Rejected" | "More" | "Pending" | "resubmit" | "ReSubmit" | "more" | "Delegation" | "Delegated User";
                        date?: string;
                        comments?: string;
                        stepOrder: number;
                      }> = [];

                      // 1. Add all completed actions from approvalHistory (sorted by date/id)
                      [...approvalHistory]
                        .sort((a, b) => {
                          const dateA = a.approved_date ? new Date(a.approved_date).getTime() : 0;
                          const dateB = b.approved_date ? new Date(b.approved_date).getTime() : 0;
                          if (dateA !== dateB) return dateA - dateB;
                          return (a.id || 0) - (b.id || 0); // Fallback to ID sorting
                        })
                        .forEach((approval, index) => {
                          timelineItems.push({
                            name: approval.approver_name || approval.email || formatApproverDisplayName(""),
                            email: approval.email || undefined,
                            designation: approval.designation || undefined,
                            status:
                              (approval.status === "Approve" || approval.status === "approve") ? "Approved" :
                                (approval.status === "Reject" || approval.status === "reject") ? "Rejected" :
                                  (approval.status === "More" || approval.status === "more" || approval.status === "More Info Required") ? "More" :
                                    (approval.status === "ReSubmit" || approval.status === "resubmit") ? "ReSubmit" :
                                     (approval.status === "Delegation" || approval.status === "delegation") ? "Delegation" : 
                                     (approval.status === "Delegated User" || approval.status === "delegated user") ? "Delegated User" : "Approved",
                            date: formatDate(approval.approved_date) || undefined,
                            comments: approval.comments || undefined,
                            stepOrder: index + 1,
                          });
                        });

                      // 2. Add pending approvers if in a pending state
                      const pendingStatuses = ["Pending Approval", "Review", "In Approval"];
                      if (invoice.invoice_status && pendingStatuses.includes(invoice.invoice_status)) {
                        const allApprovers = invoice.invoice_approvers
                          ? invoice.invoice_approvers.split(",").map((a: string) => a.trim()).filter(Boolean)
                          : [];

                        allApprovers.forEach((approver: string, index: number) => {
                          timelineItems.push({
                            name: formatApproverDisplayName(approver),
                            status: "Pending",
                            stepOrder: timelineItems.length + 1,
                          });
                        });
                      }

                      if (timelineItems.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground" data-testid="text-no-approval-history">No approval history available</p>
                        );
                      }

                      return timelineItems.map((item, index, arr) => {
                        const isApproved = item.status === "Approved";
                        const isRejected = item.status === "Rejected";
                        const isMoreInfo = item.status === "More";
                        const isResubmit = item.status === "ReSubmit";
                        const isPendingStep = item.status === "Pending";
                        const isDelegated = (item.status === "Delegation" || item.status === "Delegated User");

                        const statusColor = isApproved ? 'bg-emerald-500 border-emerald-500 text-white' :
                          isRejected ? 'bg-red-500 border-red-500 text-white' :
                            isMoreInfo ? 'bg-amber-500 border-amber-500 text-white' :
                              isResubmit
                                ? "bg-blue-500 border-blue-500 text-white"
                                : "bg-muted border-muted-foreground/30 text-muted-foreground";

                        const dotColor = isApproved ? 'bg-emerald-500' :
                          isRejected ? 'bg-red-500' :
                            isMoreInfo ? 'bg-amber-500'
                              : isResubmit
                                ? "bg-blue-500"
                                : "bg-orange-500";

                        const statusLabel = isApproved ? 'Approved' :
                          isRejected ? 'Rejected' :
                            isMoreInfo ? 'More Info' :
                              isResubmit
                                ? "ReSubmit"
                                : isDelegated ? item.status : "Pending";

                        return (
                          <div
                            key={index}
                            className="flex items-start"
                            data-testid={`approval-history-item-${index}`}
                          >
                            <div className="flex flex-col items-center min-w-[140px] max-w-[160px]">
                              <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${statusColor}`}>
                                {isPendingStep ? <Clock className="h-4 w-4" /> :
                                  isApproved ? <CheckCircle2 className="h-4 w-4" /> :
                                    isRejected ? <XCircle className="h-4 w-4" /> :
                                      <AlertCircle className="h-4 w-4" />}
                              </div>
                              <div className="mt-1.5 text-center px-1">
                                <p className="text-xs font-medium truncate max-w-[140px]" title={item.name}>
                                  {item.name}
                                </p>
                                <div className="flex items-center justify-center gap-1 mt-0.5">
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                  <span className="text-xs">{statusLabel}</span>
                                </div>
                                {item.date && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {item.date}
                                  </p>
                                )}
                                {item.comments && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 break-all" title={item.comments}>
                                    {item.comments}
                                  </p>
                                )}
                              </div>
                            </div>
                            {index < arr.length - 1 && (
                              <div className="flex items-center h-8">
                                <div className={`w-10 border-t-2 border-dashed ${isApproved ? 'border-emerald-500' : 'border-muted-foreground/30'
                                  }`} />
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="lines" data-testid="tab-lines">
              Line Items ({lines.length})
            </TabsTrigger>
            {showPaymentTab && (
              <TabsTrigger value="payment" data-testid="tab-payment">
                Payment Details
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="lines" className="mt-3">
            <Card>
              <div className="p-3 bg-primary/5 border-b border-primary/20 flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  Line Items
                </h3>
                <div className="flex items-center gap-4 flex-wrap">
                  {canEditInvoice && !invoice?.po_number && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap" htmlFor="incl-of-tax">Type of Tax</Label>
                      <Select
                        key={taxSelectKey}
                        value={invoice?.tax_included || "No"}
                        onValueChange={updateTaxIncludedMethod}
                      >
                        <SelectTrigger id="incl-of-tax" className="w-[120px] h-8 text-xs" data-testid="select-incl-of-tax">
                          <SelectValue placeholder="Select Type of Tax" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Inclusive</SelectItem>
                          <SelectItem value="No">Exclusive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {canEditInvoice && !invoice?.po_number && (
                    <Button size="sm" onClick={() => setAddLineOpen(true)} data-testid="button-add-line">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Line
                    </Button>
                  )}
                </div>
              </div>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-medium w-[50px]">#</TableHead>
                        <TableHead className="text-xs font-medium">Item Name</TableHead>
                        {invoice.invoice_type !== "PREPAYMENT" &&
                          <>
                            <TableHead className="text-xs font-medium">Type</TableHead>
                            <TableHead className="text-xs font-medium">Delivery Date</TableHead>
                            <TableHead className="text-xs font-medium text-right">Qty</TableHead>
                          </>
                        }
                        <TableHead className="text-xs font-medium text-right">Unit Cost</TableHead>
                        <TableHead className="text-xs font-medium text-right">Amount</TableHead>
                        <TableHead className="text-xs font-medium text-right">Tax Rate</TableHead>
                        <TableHead className="text-xs font-medium text-right">Tax</TableHead>
                        {canEditInvoice && !invoice?.po_number && <TableHead className="text-xs font-medium w-[80px]">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linesLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: isDraft ? 10 : 9 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : lines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={isDraft ? 10 : 9} className="text-center py-8 text-muted-foreground">
                            <Receipt className="h-8 w-8 text-muted-foreground/50 mb-2 mx-auto" />
                            <p className="text-sm">No line items</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        lines.map((line) => (
                          <TableRow key={line.id} className="h-10" data-testid={`row-line-${line.id}`}>
                            <TableCell className="text-sm py-2">{line.line_number}</TableCell>
                            <TableCell className="text-sm py-2 font-medium">{line.item_name || "-"}</TableCell>
                            {invoice.invoice_type !== "PREPAYMENT" &&
                              <>
                                <TableCell className="text-sm py-2">{line.product_category_name || "-"}</TableCell>
                                <TableCell className="text-sm py-2">
                                  {line.delivery_date ? formatDate(line.delivery_date) : "-"}
                                </TableCell>
                                <TableCell className="text-sm py-2 text-right">{line.order_qty ?? "-"}</TableCell>
                              </>
                            }
                            <TableCell className="text-sm py-2 text-right">
                              {formatCurrency(line.order_unit_cost, invoice.invoice_curr_code)}
                            </TableCell>
                            <TableCell className="text-sm py-2 text-right font-medium">
                              {formatCurrency(line.order_cost, invoice.invoice_curr_code)}
                            </TableCell>
                            <TableCell className="text-sm py-2 text-right">
                              {line.tax_rate != null ? `${line.tax_rate}%` : "-"}
                            </TableCell>
                            <TableCell className="text-sm py-2 text-right">
                              {formatCurrency(line.tax_amount, invoice.invoice_curr_code)}
                            </TableCell>
                            {(canEditInvoice && !invoice?.po_number) && (
                              <TableCell className="py-2">
                                <div className="flex items-center gap-1">
                                  {canEditInvoice && !invoice?.po_number && (
                                    <button
                                      type="button"
                                      className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate"
                                      onClick={() => {
                                        setEditingLine({
                                          ...line,
                                          tax_rate: taxCodes.find(t => Number(t.tax_rate) === Number(line.tax_rate))?.tax_rate || "",
                                          tax_rate_code: taxCodes.find(t => Number(t.tax_rate) === Number(line.tax_rate))?.tax_code || "",
                                          order_cost: Number(line.order_qty || 0) * Number(line.order_unit_cost || 0),
                                          inclusiveTaxAmt: invoice?.tax_included === "Yes" ?
                                            Math.round((Number(line.order_cost) || 0) + (Number(line.tax_amount) || 0)).toString()
                                            : ""
                                        });
                                        setEditLineOpen(true);
                                      }}
                                      data-testid={`button-edit-line-${line.id}`}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                  {(canEditInvoice && !invoice?.po_number) && (invoice.invoice_status !== "Pending Approval" && invoice.invoice_status !== "Paid" && invoice.invoice_status !== "Approved") && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <button
                                          type="button"
                                          className="h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover-elevate"
                                          data-testid={`button-delete-line-${line.id}`}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Line Item</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Remove line item "{line.item_name}"?
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => deleteLineMutation.mutate(line.id)}
                                            className="bg-destructive text-destructive-foreground"
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {lines.length > 0 && (
                  <div className="p-3 border-t flex justify-end gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Subtotal</p>
                      <p className="text-sm font-medium">
                        {formatCurrency(
                          lines.reduce((sum, l) => sum + (Number(l.order_cost) || 0), 0),
                          invoice.invoice_curr_code
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Tax</p>
                      <p className="text-sm font-medium">
                        {formatCurrency(
                          lines.reduce((sum, l) => sum + (Number(l.tax_amount) || 0), 0),
                          invoice.invoice_curr_code
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-sm font-bold">
                        {formatCurrency(
                          lines.reduce((sum, l) => sum + (Number(l.order_cost) || 0) + (Number(l.tax_amount) || 0), 0),
                          invoice.invoice_curr_code
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {showPaymentTab && (
            <TabsContent value="payment" className="mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Bank Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {bankLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-4 w-full" />
                        ))}
                      </div>
                    ) : bankError ? (
                      <p className="text-sm text-destructive py-4 text-center">Failed to load bank details</p>
                    ) : (() => {
                      const primaryBank = bankDetails.find((b: any) => b.primary_account === "Y") || bankDetails[0];
                      return primaryBank ? (
                        <div className="space-y-2 border rounded-md p-3">
                          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-sm w-full">
                            <span className="text-muted-foreground font-medium">Bank Name:</span>
                            <span>{primaryBank.bank_name || "-"}</span>
                            <span className="text-muted-foreground font-medium">Account No:</span>
                            <span>{primaryBank.account_no || "-"}</span>
                            <span className="text-muted-foreground font-medium">Account Type:</span>
                            <span>{primaryBank.bank_account_type || "-"}</span>
                            <span className="text-muted-foreground font-medium">Beneficiary Name:</span>
                            <span>{primaryBank.beneficiary_name || "-"}</span>
                            <span className="text-muted-foreground font-medium">Bank Address:</span>
                            <span>{primaryBank.bank_address || "-"}</span>
                            <span className="text-muted-foreground font-medium">SWIFT Code:</span>
                            <span>{primaryBank.swift_code || "-"}</span>
                          </div>
                          <Badge variant="outline" className="text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                            Primary Account
                          </Badge>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 text-center">No bank details available</p>
                      );
                    })()}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {isPaid ? "Payment Information" : "Record Payment"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {isPaid ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2.5 text-sm">
                          <span className="text-muted-foreground font-medium">Payment Method:</span>
                          <span>{paymentRecord?.paymentmethod || invoice.pay_group_code || "-"}</span>
                          <span className="text-muted-foreground font-medium">Payment Description:</span>
                          <span>{paymentRecord?.paymentdescription || invoice.payment_description || "-"}</span>
                          {paymentRecord?.paymentmethod === "Wire Transfer" && (
                            <>
                              <span className="text-muted-foreground font-medium">Bank Name:</span>
                              <span>{paymentRecord?.bankname || "-"}</span>
                              <span className="text-muted-foreground font-medium">Branch Name:</span>
                              <span>{paymentRecord?.bankbranch || "-"}</span>
                              <span className="text-muted-foreground font-medium">Account Number:</span>
                              <span>{paymentRecord?.onlinetrsfdacntno || "-"}</span>
                              <span className="text-muted-foreground font-medium">Bank Transfer Ref:</span>
                              <span>{paymentRecord?.banktransferrefno || "-"}</span>
                            </>
                          )}
                          {paymentRecord?.paymentmethod === "Cheque" && (
                            <>
                              <span className="text-muted-foreground font-medium">Cheque Number:</span>
                              <span>{paymentRecord?.checknumber || "-"}</span>
                              <span className="text-muted-foreground font-medium">Cheque Date:</span>
                              <span>{formatDate(paymentRecord?.checkdate)}</span>
                              <span className="text-muted-foreground font-medium">Collected By:</span>
                              <span>{paymentRecord?.checkcollectedby || "-"}</span>
                              <span className="text-muted-foreground font-medium">Collection Date:</span>
                              <span>{formatDate(paymentRecord?.checkcollectiondate)}</span>
                              <span className="text-muted-foreground font-medium">Collector Contact:</span>
                              <span>{paymentRecord?.checkcollectorcontactno || "-"}</span>
                              <span className="text-muted-foreground font-medium">Collector Email:</span>
                              <span>{paymentRecord?.checkcollectoremail || "-"}</span>
                            </>
                          )}
                          <span className="text-muted-foreground font-medium">Payment Date:</span>
                          <span>{formatDate(paymentRecord?.payment_date || invoice.payment_date)}</span>
                          <span className="text-muted-foreground font-medium">Total Invoice Amount:</span>
                          <span>{formatCurrency(Number(invoice.invoice_amount) + Number(invoice.tax_amount) || 0, invoice.invoice_curr_code)}</span>
                          {paymentRecord?.tdscategory && paymentRecord.tdscategory !== "none" && (
                            <>
                              <span className="text-muted-foreground font-medium">TDS (%):</span>
                              <span>{paymentRecord.tdspcrnt || paymentRecord.tdscategory}%</span>
                              <span className="text-muted-foreground font-medium">TDS Amount:</span>
                              <span>{formatCurrency(paymentRecord.tdsamount, invoice.invoice_curr_code)}</span>
                            </>
                          )}
                          <span className="text-muted-foreground font-medium">Amount Paid:</span>
                          <span className="font-semibold">{formatCurrency(paymentRecord?.amountpaid || invoice.ppayment_amount, invoice.invoice_curr_code)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Payment Method <span className="text-destructive">*</span></Label>
                          <Select
                            value={paymentForm.payment_method}
                            onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}
                          >
                            <SelectTrigger data-testid="select-payment-method"><SelectValue placeholder="Select method" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Cash">Cash</SelectItem>
                              <SelectItem value="Cheque">Cheque</SelectItem>
                              <SelectItem value="Wire Transfer">Wire Transfer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Payment Description <span className="text-destructive">*</span></Label>
                          <Textarea
                            value={paymentForm.payment_description}
                            onChange={(e) => setPaymentForm({ ...paymentForm, payment_description: e.target.value })}
                            data-testid="input-payment-description"
                          />
                        </div>

                        {paymentForm.payment_method === "Cheque" && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>Cheque Date <span className="text-destructive">*</span></Label>
                                <Input
                                  type="date"
                                  value={paymentForm.cheque_date}
                                  onChange={(e) => setPaymentForm({ ...paymentForm, cheque_date: e.target.value })}
                                  data-testid="input-cheque-date"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Cheque Number <span className="text-destructive">*</span></Label>
                                <Input
                                  value={paymentForm.cheque_number}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    setPaymentForm({ ...paymentForm, cheque_number: val });
                                  }}
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  data-testid="input-cheque-number"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>Cheque Collected By <span className="text-destructive">*</span></Label>
                                <Input
                                  value={paymentForm.cheque_collected_by}
                                  onChange={(e) => setPaymentForm({ ...paymentForm, cheque_collected_by: e.target.value })}
                                  data-testid="input-cheque-collected-by"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Cheque Collection Date <span className="text-destructive">*</span></Label>
                                <Input
                                  type="date"
                                  value={paymentForm.cheque_collection_date}
                                  onChange={(e) => setPaymentForm({ ...paymentForm, cheque_collection_date: e.target.value })}
                                  data-testid="input-cheque-collection-date"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>Cheque Collector Contact <span className="text-destructive">*</span></Label>
                                <PhoneInput
                                  value={paymentForm.cheque_collector_contact_no}
                                  onChange={(v) => {
                                    setPaymentForm({ ...paymentForm, cheque_collector_contact_no: v });
                                    if (v && !validatePhoneNumber(v)) {
                                      setPhoneError(getPhoneValidationMessage(v));
                                    } else {
                                      setPhoneError("");
                                    }
                                  }}
                                  placeholder="50 123 4567"
                                  data-testid="input-cheque-collector-contact"
                                />
                                {phoneError && <p className="text-xs text-destructive mt-1" data-testid="error-phone-number">{phoneError}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label>Cheque Collector Email <span className="text-destructive">*</span></Label>
                                <Input
                                  type="email"
                                  value={paymentForm.cheque_collector_email}
                                  onChange={(e) => setPaymentForm({ ...paymentForm, cheque_collector_email: e.target.value })}
                                  data-testid="input-cheque-collector-email"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {paymentForm.payment_method === "Wire Transfer" && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>Bank Name <span className="text-destructive">*</span></Label>
                                <Input
                                  value={paymentForm.bank_name}
                                  onChange={(e) => setPaymentForm({ ...paymentForm, bank_name: e.target.value })}
                                  data-testid="input-bank-name"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Branch Name <span className="text-destructive">*</span></Label>
                                <Input
                                  value={paymentForm.branch_name}
                                  onChange={(e) => setPaymentForm({ ...paymentForm, branch_name: e.target.value })}
                                  data-testid="input-branch-name"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>Online Transfer Account Number <span className="text-destructive">*</span></Label>
                                <Input
                                  value={paymentForm.online_transfer_account_no}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    setPaymentForm({ ...paymentForm, online_transfer_account_no: val });
                                  }}
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  data-testid="input-online-account-no"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Bank Transfer Ref Number <span className="text-destructive">*</span></Label>
                                <Input
                                  value={paymentForm.bank_transfer_ref_no}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    setPaymentForm({ ...paymentForm, bank_transfer_ref_no: val });
                                  }}
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  data-testid="input-bank-transfer-ref"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Payment Date <span className="text-destructive">*</span></Label>
                            <Input
                              type="date"
                              value={paymentForm.payment_date}
                              onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                              data-testid="input-payment-date"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Total Invoice Amount <span className="text-destructive">*</span></Label>
                            <Input
                              type="number"
                              value={String((Number(invoice.invoice_amount) + Number(invoice.tax_amount) || 0).toFixed(2))}
                              readOnly
                              className="bg-muted"
                              data-testid="input-total-invoice-amount"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <Label>TDS Category (%)</Label>
                            <Select
                              value={paymentForm.tds_category}
                              onValueChange={(v) => {
                                const totalAmount = getInvoicePayableTotal(invoice);
                                const pct = v === "none" ? 0 : Number(v);
                                const tdsAmt = Number((totalAmount * pct / 100).toFixed(2));
                                const amtToPay = Number((totalAmount - tdsAmt).toFixed(2)) + Number(invoice.tax_amount);
                                setPaymentForm({
                                  ...paymentForm,
                                  tds_category: v,
                                  tds_amount: tdsAmt > 0 ? String(tdsAmt) : "",
                                  amount_to_pay: String(amtToPay),
                                });
                              }}
                            >
                              <SelectTrigger data-testid="select-tds-category"><SelectValue placeholder="Select TDS %" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None (0%)</SelectItem>
                                <SelectItem value="10">10%</SelectItem>
                                <SelectItem value="20">20%</SelectItem>
                                <SelectItem value="30">30%</SelectItem>
                                <SelectItem value="40">40%</SelectItem>
                                <SelectItem value="50">50%</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>TDS Amount</Label>
                            <Input
                              type="number"
                              value={paymentForm.tds_amount}
                              readOnly
                              className="bg-muted"
                              placeholder="0.00"
                              data-testid="input-tds-amount"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Amount To be Paid <span className="text-destructive">*</span></Label>
                            <Input
                              type="number"
                              value={paymentForm.amount_to_pay || String(Number(invoice.invoice_amount) + Number(invoice.tax_amount))}
                              readOnly
                              className="bg-muted"
                              data-testid="input-amount-to-pay"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            onClick={() => {
                              if (!paymentForm.payment_method) {
                                toast({ title: "Payment method is required", variant: "destructive" });
                                return;
                              }
                              if (!paymentForm.payment_description) {
                                toast({ title: "Payment description is required", variant: "destructive" });
                                return;
                              }
                              if (!paymentForm.payment_date) {
                                toast({ title: "Payment date is required", variant: "destructive" });
                                return;
                              }
                              if (paymentForm.payment_method === "Cheque") {
                                if (!paymentForm.cheque_date || !paymentForm.cheque_number) {
                                  toast({ title: "Cheque date and number are required", variant: "destructive" });
                                  return;
                                }
                                if (!paymentForm.cheque_collected_by) {
                                  toast({ title: "Cheque collected by is required", variant: "destructive" });
                                  return;
                                }
                                if (!paymentForm.cheque_collection_date) {
                                  toast({ title: "Cheque collection date is required", variant: "destructive" });
                                  return;
                                }
                                if (!paymentForm.cheque_collector_contact_no) {
                                  toast({ title: "Cheque collector contact number is required", variant: "destructive" });
                                  return;
                                }
                                if (!validatePhoneNumber(paymentForm.cheque_collector_contact_no)) {
                                  toast({
                                    title: "Invalid contact number",
                                    description: getPhoneValidationMessage(paymentForm.cheque_collector_contact_no),
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                if (!paymentForm.cheque_collector_email) {
                                  toast({ title: "Cheque collector email is required", variant: "destructive" });
                                  return;
                                }
                                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paymentForm.cheque_collector_email)) {
                                  toast({ title: "Invalid email format in invoice cheque collector field", variant: "destructive" });
                                  return;
                                }
                              }
                              if (paymentForm.payment_method === "Wire Transfer") {
                                if (!paymentForm.bank_name || !paymentForm.branch_name) {
                                  toast({ title: "Bank name and branch are required", variant: "destructive" });
                                  return;
                                }
                                if (!paymentForm.online_transfer_account_no) {
                                  toast({ title: "Account number is required", variant: "destructive" });
                                  return;
                                }
                                if (!paymentForm.bank_transfer_ref_no) {
                                  toast({ title: "Bank transfer reference number is required", variant: "destructive" });
                                  return;
                                }
                              }
                              const totalAmount = getInvoicePayableTotal(invoice);
                              payMutation.mutate({
                                payment_method: paymentForm.payment_method,
                                payment_description: paymentForm.payment_description,
                                payment_date: paymentForm.payment_date,
                                amount_to_pay: paymentForm.amount_to_pay ? Number(paymentForm.amount_to_pay) : totalAmount + Number(invoice.tax_amount),
                                bank_account_no: bankDetails.length > 0 ? bankDetails[0].account_no : null,
                                bank_name: paymentForm.bank_name || null,
                                branch_name: paymentForm.branch_name || null,
                                online_transfer_account_no: paymentForm.online_transfer_account_no || null,
                                bank_transfer_ref_no: paymentForm.bank_transfer_ref_no || null,
                                cheque_number: paymentForm.cheque_number || null,
                                cheque_date: paymentForm.cheque_date || null,
                                cheque_collected_by: paymentForm.cheque_collected_by || null,
                                cheque_collection_date: paymentForm.cheque_collection_date || null,
                                cheque_collector_contact_no: paymentForm.cheque_collector_contact_no || null,
                                cheque_collector_email: paymentForm.cheque_collector_email || null,
                                tds_category: paymentForm.tds_category && paymentForm.tds_category !== "none" ? paymentForm.tds_category : null,
                                tds_percentage: paymentForm.tds_category && paymentForm.tds_category !== "none" ? Number(paymentForm.tds_category) : null,
                                tds_amount: paymentForm.tds_amount ? Number(paymentForm.tds_amount) : null,
                              });
                            }}
                            disabled={payMutation.isPending}
                            data-testid="button-pay"
                          >
                            {payMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            Pay
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>

        <FormSheet
          open={addLineOpen}
          onOpenChange={setAddLineOpen}
          title="Add Line Item"
          description="Add a new line item to this invoice."
          onSubmit={handleAddLine}
          submitLabel="Add Line"
          isSubmitting={addLineMutation.isPending}
          submitDisabled={!newLine.item_name || !newLine.order_qty || (invoice?.tax_included === "Yes" ? !newLine.inclusiveTaxAmt : !newLine.order_unit_cost)}
          widthClassName="w-full sm:max-w-[700px]"
        >
            <div className="space-y-4 pb-6">
              {/* Item dropdown */}
              <div className="space-y-2">
                <Label>Select Item <span className="text-destructive">*</span></Label>
                <Popover open={itemOpen} onOpenChange={setItemOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={itemOpen}
                      className="w-full justify-between font-normal"
                      data-testid="select-line-item"
                    >
                      {newLine.item_id ? `${newLine.itemCode} - ${newLine.item_name}` : "Select Item..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[360px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                    <Command>
                      <CommandInput placeholder="Search item..." />
                      <CommandList>
                        <CommandEmpty>No item found.</CommandEmpty>
                        <CommandGroup>
                          {items.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={item.name}
                              onSelect={() => {
                                setNewLine({
                                  ...newLine,
                                  item_id: String(item.id),
                                  item_name: item.name,
                                  description: item.name,
                                  category_code: item.categoryCode || "",
                                  product_category_name: item.categoryName || "",
                                  uom: item.unitOfMeasure || newLine.uom,
                                  order_unit_cost: item.standardPrice ? String(item.standardPrice) : newLine.order_unit_cost,
                                  itemCode: item.itemCode || "",
                                });
                                setItemOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", newLine.item_id === String(item.id) ? "opacity-100" : "opacity-0")} />
                              {item.itemCode} - {item.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {newLine.product_category_name && (
                  <p className="text-xs text-muted-foreground">Category: {newLine.product_category_name}</p>
                )}
              </div>

              {/* Category dropdown */}
              {/* <div className="space-y-2">
                <Label>Category</Label>
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryOpen}
                      className="w-full justify-between font-normal"
                      data-testid="select-line-category"
                    >
                      {newLine.product_category_name || "Select Category..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[360px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                    <Command>
                      <CommandInput placeholder="Search category..." />
                      <CommandList>
                        <CommandEmpty>No category found.</CommandEmpty>
                        <CommandGroup>
                          {categories.map((cat) => (
                            <CommandItem
                              key={cat.id}
                              value={cat.name}
                              onSelect={() => {
                                setNewLine({ ...newLine, category_code: cat.code, product_category_name: cat.name });
                                setCategoryOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", newLine.category_code === cat.code ? "opacity-100" : "opacity-0")} />
                              {cat.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div> */}

              {/* <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value })} data-testid="input-line-description" />
              </div> */}

              {/* <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newLine.item_type} onValueChange={(v) => setNewLine({ ...newLine, item_type: v })}>
                  <SelectTrigger data-testid="select-line-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ITEM">Item</SelectItem>
                    <SelectItem value="SERVICE">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div> */}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">Delivery Date</Label>
                  <Input
                    type="date"
                    value={newLine.delivery_date}
                    onChange={(e) => setNewLine({ ...newLine, delivery_date: e.target.value })}
                    data-testid="input-line-delivery-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit of Measure</Label>
                  <Select value={newLine.uom} onValueChange={(v) => setNewLine({ ...newLine, uom: v })}>
                    <SelectTrigger data-testid="select-line-uom"><SelectValue placeholder="Select UoM" /></SelectTrigger>
                    <SelectContent>
                      {uomOptions.map((uom) => (
                        <SelectItem key={uom.id} value={uom.description || "EA"}>{uom.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {invoice?.tax_included === "Yes" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="line-incl-of-tax-amt">Line Total *</Label>
                      <Input
                        id="line-incl-of-tax-amt"
                        type="number"
                        min="1"
                        value={newLine.inclusiveTaxAmt}
                        onKeyDown={(e) => {
                          if (["-", "+", "e", "E"].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          const inclusiveTaxAmt = parseFloat(e.target.value) || 0;
                          const quantity = parseFloat(newLine.order_qty) || 1;
                          const taxRate = parseFloat(newLine.tax_rate) || 0;
                          const taxAmount = (inclusiveTaxAmt * taxRate) / 100;
                          const netAmount = Math.max(0, inclusiveTaxAmt - taxAmount);
                          const unitPrice = quantity > 0 ? netAmount / quantity : 0;
                          setNewLine({
                            ...newLine,
                            inclusiveTaxAmt: e.target.value,
                            order_unit_cost: unitPrice.toFixed(2),
                            line_cost: netAmount.toFixed(2),
                            tax_amount: taxAmount.toFixed(2),
                          });
                        }}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const rounded = Math.round(val);
                          const quantity = parseFloat(newLine.order_qty) || 1;
                          const taxRate = parseFloat(newLine.tax_rate) || 0;
                          const taxAmount = (rounded * taxRate) / 100;
                          const netAmount = Math.max(0, rounded - taxAmount);
                          const unitPrice = quantity > 0 ? netAmount / quantity : 0;
                          setNewLine({
                            ...newLine,
                            inclusiveTaxAmt: rounded.toString(),
                            order_unit_cost: unitPrice.toFixed(2),
                            line_cost: netAmount.toFixed(2),
                            tax_amount: taxAmount.toFixed(2),
                          });
                        }}
                        data-testid="input-line-incl-of-tax-amt"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="line-tax-rate">Tax Rate (%)</Label>
                      <Select
                        value={String(newLine.tax_rate)}
                        onValueChange={(value) => {
                          const selectedTax = taxCodes.find(t => String(t.tax_rate) === value);
                          const qty = parseFloat(newLine.order_qty) || 1;
                          const totalAmount = parseFloat(newLine.inclusiveTaxAmt) || 0;
                          const taxRate = parseFloat(value) || 0;
                          const taxAmount = (totalAmount * taxRate) / 100;
                          const amountExcludingTax = Math.max(0, totalAmount - taxAmount);
                          setNewLine({
                            ...newLine,
                            tax_rate: value,
                            tax_rate_code: selectedTax?.tax_code || "",
                            order_unit_cost: qty > 0 ? (amountExcludingTax / qty).toFixed(2) : "0.00",
                            line_cost: amountExcludingTax.toFixed(2),
                            tax_amount: taxAmount.toFixed(2),
                          });
                        }}
                      >
                        <SelectTrigger data-testid="select-line-tax-rate">
                          <SelectValue placeholder="Select tax rate" />
                        </SelectTrigger>
                        <SelectContent>
                          {taxCodes.map((tax) => (
                            <SelectItem key={"tax" + tax.id} value={String(tax.tax_rate)} data-testid={`select-tax-${tax.id}`}>
                              {tax.tax_code} - {tax.tax_code_desc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={newLine.order_qty}
                        onKeyDown={(e) => {
                          if (["-", "+", "e", "E"].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          const qty = parseFloat(e.target.value) || 1;
                          const totalAmount = parseFloat(newLine.inclusiveTaxAmt) || 0;
                          const taxRate = parseFloat(newLine.tax_rate) || 0;
                          const taxAmount = (totalAmount * taxRate) / 100;
                          const amountExcludingTax = Math.max(0, totalAmount - taxAmount);
                          setNewLine({
                            ...newLine,
                            order_qty: e.target.value,
                            order_unit_cost: qty > 0 ? (amountExcludingTax / qty).toFixed(2) : "0.00",
                          });
                        }}
                        data-testid="input-line-qty"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Cost ({invoice.invoice_curr_code || "AED"}) *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newLine.order_unit_cost}
                        disabled
                        data-testid="input-line-unit-cost"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Line Cost (excl. Tax)</Label>
                      <Input
                        value={newLine.line_cost ? parseFloat(newLine.line_cost).toFixed(2) : "0.00"}
                        readOnly
                        className="bg-muted"
                        data-testid="input-line-cost-display"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Tax Amount</Label>
                      <Input
                        value={newLine.tax_amount ? parseFloat(newLine.tax_amount).toFixed(2) : "0.00"}
                        readOnly
                        className="bg-muted"
                        data-testid="input-line-tax-amount"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Quantity <span className="text-destructive">*</span></Label>
                      <Input type="number" min="1" value={newLine.order_qty} onChange={(e) => {
                        const qtyLine = e.target.value;
                        setNewLine((prev) => {
                          const qty = Number(qtyLine) || 0;
                          const cost = Number(prev.order_unit_cost) || 0;
                          const lineCost = qty * Number(cost);
                          const taxRate = Number(prev.tax_rate_code) || 0;
                          const taxAmount = lineCost * (taxRate / 100);
                          return {
                            ...prev,
                            order_qty: qtyLine,
                            order_unit_cost: String(cost),
                            tax_amount: taxAmount.toFixed(2),
                            line_cost: lineCost.toFixed(2),
                          };
                        });
                      }} data-testid="input-line-qty" />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Cost <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newLine.order_unit_cost}
                        onChange={(e) => {
                          const unitCost = e.target.value;
                          setNewLine((prev) => {
                            const qty = Number(prev.order_qty) || 0;
                            const cost = Number(unitCost) || 0;
                            const lineCost = qty * cost;
                            const taxRate = Number(prev.tax_rate_code) || 0;
                            const taxAmount = lineCost * (taxRate / 100);
                            return {
                              ...prev,
                              order_unit_cost: unitCost,
                              tax_amount: taxAmount.toFixed(2),
                              line_cost: lineCost.toFixed(2),
                            };
                          });
                        }}
                        data-testid="input-line-unit-cost"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Line Cost</Label>
                      <Input
                        value={newLine.line_cost ? parseFloat(newLine.line_cost).toFixed(2) : "0.00"}
                        readOnly
                        className="bg-muted"
                        data-testid="input-line-cost-display"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Tax Rate (%)</Label>
                      <Select
                        value={String(newLine.tax_rate)}
                        onValueChange={(value) => {
                          const selectedTax = taxCodes.find(t => String(t.tax_rate) === value);
                          const qty = parseFloat(newLine.order_qty) || 0;
                          const cost = parseFloat(newLine.order_unit_cost) || 0;
                          const lineCost = qty * cost;
                          const taxAmount = lineCost * ((parseFloat(value) || 0) / 100);
                          setNewLine((prev) => ({
                            ...prev,
                            tax_rate_code: selectedTax?.tax_code || "",
                            tax_rate: value,
                            tax_amount: taxAmount.toFixed(2),
                          }));
                        }}
                      >
                        <SelectTrigger data-testid="select-line-tax-rate">
                          <SelectValue placeholder="Select tax rate" />
                        </SelectTrigger>
                        <SelectContent>
                          {taxCodes.map((tax) => (
                            <SelectItem key={"tax" + tax.id} value={String(tax.tax_rate)} data-testid={`select-tax-${tax.id}`}>
                              {tax.tax_code} - {tax.tax_code_desc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Tax Amount</Label>
                      <Input
                        value={newLine.tax_amount ? parseFloat(newLine.tax_amount).toFixed(2) : "0.00"}
                        readOnly
                        className="bg-muted"
                        data-testid="input-line-tax-amount"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
        </FormSheet>

        <FormSheet
          open={editLineOpen}
          onOpenChange={setEditLineOpen}
          title="Edit Line Item"
          description="Update line item details."
          onSubmit={handleEditLine}
          submitLabel="Update Line"
          isSubmitting={updateLineMutation.isPending}
          submitDisabled={!editingLine?.item_name || !editingLine?.order_qty || (invoice?.tax_included === "Yes" ? !editingLine?.inclusiveTaxAmt : !editingLine?.order_unit_cost)}
          widthClassName="w-full sm:max-w-[700px]"
        >
            <div className="space-y-4 pb-6">
            {editingLine && (
              <div className="mt-2 space-y-4">
                {/* Item dropdown */}
                <div className="space-y-2">
                  <Label>Select Item <span className="text-destructive">*</span></Label>
                  <Popover open={editItemOpen} onOpenChange={setEditItemOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={editItemOpen}
                        className="w-full justify-between font-normal"
                        data-testid="select-edit-line-item"
                      >
                        {editingLine.item_name
                          ? `${editingLine.itemCode ? editingLine.itemCode + " - " : ""}${editingLine.item_name}`
                          : "Select Item..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[360px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                      <Command>
                        <CommandInput placeholder="Search item..." />
                        <CommandList>
                          <CommandEmpty>No item found.</CommandEmpty>
                          <CommandGroup>
                            {items.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={item.name}
                                onSelect={() => {
                                  setEditingLine((prev) => {
                                    if (!prev) return null;
                                    const newUnitCost = item.standardPrice ? String(item.standardPrice) : prev.order_unit_cost;
                                    const qty = Number(prev.order_qty) || 0;
                                    const cost = Number(newUnitCost) || 0;
                                    const lineCost = qty * cost;
                                    const taxRate = Number(prev.tax_rate) || 0;
                                    const taxAmount = lineCost * (taxRate / 100);
                                    return {
                                      ...prev,
                                      item_id: String(item.id),
                                      item_name: item.name,
                                      description: item.name,
                                      product_category_name: item.categoryName || prev.product_category_name,
                                      uom: item.unitOfMeasure || prev.uom,
                                      order_unit_cost: newUnitCost,
                                      itemCode: item.itemCode || "",
                                      order_cost: lineCost,
                                      tax_amount: Number(taxAmount.toFixed(2)),
                                    };
                                  });
                                  setEditItemOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", editingLine.item_id === String(item.id) ? "opacity-100" : "opacity-0")} />
                                {item.itemCode} - {item.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {editingLine.product_category_name && (
                    <p className="text-xs text-muted-foreground">Category: {editingLine.product_category_name}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Delivery Date</Label>
                    <Input
                      type="date"
                      value={editingLine.delivery_date ? String(editingLine.delivery_date).split("T")[0] : ""}
                      onChange={(e) => setEditingLine({ ...editingLine, delivery_date: e.target.value })}
                      data-testid="input-edit-line-delivery-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit of Measure</Label>
                    <Select value={editingLine.uom || ""} onValueChange={(v) => setEditingLine({ ...editingLine, uom: v })}>
                      <SelectTrigger data-testid="select-edit-line-uom"><SelectValue placeholder="Select UoM" /></SelectTrigger>
                      <SelectContent>
                        {uomOptions.map((uom) => (
                          <SelectItem key={uom.id} value={uom.description || "EA"}>{uom.description}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {invoice?.tax_included === "Yes" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="line-incl-of-tax-amt">Line Total *</Label>
                        <Input
                          id="line-incl-of-tax-amt"
                          type="number"
                          min="1"
                          value={editingLine.inclusiveTaxAmt || ""}
                          onKeyDown={(e) => {
                            if (["-", "+", "e", "E"].includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onChange={(e) => {
                            const inclusiveTaxAmt = parseFloat(e.target.value) || 0;
                            const quantity = parseFloat(String(editingLine.order_qty)) || 1;
                            const taxRate = parseFloat(String(editingLine.tax_rate)) || 0;
                            const taxAmount = (inclusiveTaxAmt * taxRate) / 100;
                            const netAmount = Math.max(0, inclusiveTaxAmt - taxAmount);
                            const unitPrice = quantity > 0 ? netAmount / quantity : 0;
                            setEditingLine({
                              ...editingLine,
                              inclusiveTaxAmt: e.target.value,
                              order_unit_cost: unitPrice.toFixed(2),
                              order_cost: netAmount,
                              tax_amount: Number(taxAmount.toFixed(2)),
                            });
                          }}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const rounded = Math.round(val);
                            const quantity = parseFloat(String(editingLine.order_qty)) || 1;
                            const taxRate = parseFloat(String(editingLine.tax_rate)) || 0;
                            const taxAmount = (rounded * taxRate) / 100;
                            const netAmount = Math.max(0, rounded - taxAmount);
                            const unitPrice = quantity > 0 ? netAmount / quantity : 0;
                            setEditingLine({
                              ...editingLine,
                              inclusiveTaxAmt: rounded.toString(),
                              order_unit_cost: unitPrice.toFixed(2),
                              order_cost: netAmount,
                              tax_amount: Number(taxAmount.toFixed(2)),
                            });
                          }}
                          data-testid="input-edit-line-incl-of-tax-amt"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="line-tax-rate">Tax Rate (%)</Label>
                        <Select
                          value={String(editingLine.tax_rate)}
                          onValueChange={(value) => {
                            const selectedTax = taxCodes.find(t => String(t.tax_rate) === value);
                            const qty = parseFloat(String(editingLine.order_qty)) || 1;
                            const totalAmount = parseFloat(String(editingLine.inclusiveTaxAmt)) || 0;
                            const taxRate = parseFloat(value) || 0;
                            const taxAmount = (totalAmount * taxRate) / 100;
                            const amountExcludingTax = Math.max(0, totalAmount - taxAmount);
                            setEditingLine({
                              ...editingLine,
                              tax_rate: value,
                              tax_rate_code: selectedTax?.tax_code || "",
                              order_unit_cost: qty > 0 ? (amountExcludingTax / qty).toFixed(2) : "0.00",
                              order_cost: amountExcludingTax,
                              tax_amount: Number(taxAmount.toFixed(2)),
                            });
                          }}
                        >
                          <SelectTrigger data-testid="select-edit-line-tax-rate">
                            <SelectValue placeholder="Select tax rate" />
                          </SelectTrigger>
                          <SelectContent>
                            {taxCodes.map((tax) => (
                              <SelectItem key={"tax" + tax.id} value={String(tax.tax_rate)} data-testid={`select-edit-tax-${tax.id}`}>
                                {tax.tax_code} - {tax.tax_code_desc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Quantity *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={editingLine.order_qty ?? ""}
                          onKeyDown={(e) => {
                            if (["-", "+", "e", "E"].includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onChange={(e) => {
                            const qty = parseFloat(e.target.value) || 1;
                            const totalAmount = parseFloat(String(editingLine.inclusiveTaxAmt)) || 0;
                            const taxRate = parseFloat(String(editingLine.tax_rate)) || 0;
                            const taxAmount = (totalAmount * taxRate) / 100;
                            const amountExcludingTax = Math.max(0, totalAmount - taxAmount);
                            setEditingLine({
                              ...editingLine,
                              order_qty: e.target.value,
                              order_unit_cost: qty > 0 ? (amountExcludingTax / qty).toFixed(2) : "0.00",
                            });
                          }}
                          data-testid="input-edit-line-qty"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit Cost ({invoice.invoice_curr_code || "AED"}) *</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingLine.order_unit_cost ?? ""}
                          disabled
                          data-testid="input-edit-line-unit-cost"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Line Cost (excl. Tax)</Label>
                        <Input
                          value={editingLine.order_cost != null ? Number(editingLine.order_cost).toFixed(2) : "0.00"}
                          readOnly
                          className="bg-muted"
                          data-testid="input-edit-line-cost-display"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Tax Amount</Label>
                        <Input
                          value={editingLine.tax_amount != null ? Number(editingLine.tax_amount).toFixed(2) : "0.00"}
                          readOnly
                          className="bg-muted"
                          data-testid="input-edit-line-tax-amount"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Quantity <span className="text-destructive">*</span></Label>
                        <Input
                          type="number"
                          min="1"
                          value={editingLine.order_qty ?? ""}
                          onChange={(e) => {
                            const qtyLine = e.target.value;
                            setEditingLine((prev) => {
                              if (!prev) return null;
                              const qty = Number(qtyLine) || 0;
                              const cost = Number(prev.order_unit_cost) || 0;
                              const lineCost = qty * cost;
                              const taxRate = Number(prev.tax_rate) || 0;
                              const taxAmount = lineCost * (taxRate / 100);
                              return {
                                ...prev,
                                order_qty: qtyLine,
                                order_cost: lineCost,
                                tax_amount: Number(taxAmount.toFixed(2)),
                              };
                            });
                          }}
                          data-testid="input-edit-line-qty"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit Cost <span className="text-destructive">*</span></Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingLine.order_unit_cost ?? ""}
                          onChange={(e) => {
                            const unitCost = e.target.value;
                            setEditingLine((prev) => {
                              if (!prev) return null;
                              const qty = Number(prev.order_qty) || 0;
                              const cost = Number(unitCost) || 0;
                              const lineCost = qty * cost;
                              const taxRate = Number(prev.tax_rate) || 0;
                              const taxAmount = lineCost * (taxRate / 100);
                              return {
                                ...prev,
                                order_unit_cost: unitCost,
                                order_cost: lineCost,
                                tax_amount: Number(taxAmount.toFixed(2)),
                              };
                            });
                          }}
                          data-testid="input-edit-line-unit-cost"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Line Cost</Label>
                        <Input
                          value={editingLine.order_cost != null ? Number(editingLine.order_cost).toFixed(2) : "0.00"}
                          readOnly
                          className="bg-muted"
                          data-testid="input-edit-line-cost-display"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Tax Rate (%)</Label>
                        <Select
                          value={String(editingLine.tax_rate)}
                          onValueChange={(value) => {
                            const selectedTax = taxCodes.find((t) => String(t.tax_rate) === value);
                            const qty = Number(editingLine.order_qty) || 0;
                            const cost = Number(editingLine.order_unit_cost) || 0;
                            const lineCost = qty * cost;
                            const taxAmount = lineCost * ((parseFloat(value) || 0) / 100);
                            setEditingLine((prev) => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                tax_rate_code: selectedTax?.tax_code || "",
                                tax_rate: value,
                                tax_amount: Number(taxAmount.toFixed(2)),
                              };
                            });
                          }}
                        >
                          <SelectTrigger data-testid="select-edit-line-tax-rate">
                            <SelectValue placeholder="Select tax rate" />
                          </SelectTrigger>
                          <SelectContent>
                            {taxCodes.map((tax) => (
                              <SelectItem key={"tax" + tax.id} value={String(tax.tax_rate)} data-testid={`select-edit-tax-${tax.id}`}>
                                {tax.tax_code} - {tax.tax_code_desc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Tax Amount</Label>
                        <Input
                          value={editingLine.tax_amount != null ? Number(editingLine.tax_amount).toFixed(2) : "0.00"}
                          readOnly
                          className="bg-muted"
                          data-testid="input-edit-line-tax-amount"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            </div>
        </FormSheet>

        <Dialog open={approvalDialogOpen} onOpenChange={(open) => {
          setApprovalDialogOpen(open);
          if (!open) {
            setApprovalRemarks("");
            setDelegateApproverId("");
          }
        }}>
          <DialogContent
            className="sm:max-w-md"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {approvalAction === "Approve" && <ThumbsUp className="h-5 w-5 text-green-600" />}
                {approvalAction === "Reject" && <ThumbsDown className="h-5 w-5 text-red-600" />}
                {approvalAction === "More" && <HelpCircle className="h-5 w-5 text-orange-600" />}
                {approvalAction === "Request" && <User className="h-5 w-5 text-blue-600" />}
                {approvalAction === "Approve" ? "Approve Invoice" :
                  approvalAction === "Reject" ? "Reject Invoice" :
                    approvalAction === "More" ? "Request More Information" :
                      "Request for Delegate"}
              </DialogTitle>
              <DialogDescription>
                {approvalAction === "Approve" && "This will approve the invoice and move it to the next step."}
                {approvalAction === "Reject" && "This will reject the invoice."}
                {approvalAction === "More" && "This will request additional information."}
                {approvalAction === "Request" && "This will delegate the approval to another approver."}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {approvalAction === "Request" && (
                <div>
                  <Label htmlFor="invoice-delegate-approver">
                    Approver <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={delegateApproverId}
                    onValueChange={setDelegateApproverId}
                  >
                    <SelectTrigger className="mt-2" data-testid="select-delegate-approver">
                      <SelectValue placeholder="Select Approver" />
                    </SelectTrigger>
                    <SelectContent>
                      {delegateApprovers
                        .filter((u) => u.id)
                        .map((user) => (
                          <SelectItem key={user.id} value={String(user.id)}>
                            {user.name || user.user_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="approval-remarks">Remarks {approvalAction !== "Approve" && <span className="text-red-500">*</span>}</Label>
                <Textarea
                  id="approval-remarks"
                  placeholder={approvalAction === "Approve" ? "Optional remarks..." : "Please provide a reason..."}
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                  className="mt-2"
                  rows={3}
                  data-testid="input-approval-remarks"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setApprovalDialogOpen(false);
                  setApprovalRemarks("");
                  setDelegateApproverId("");
                  document.body.style.pointerEvents = "auto";
                }}
                data-testid="button-approval-cancel"
              >
                Cancel
              </Button>
              <Button
                variant={approvalAction === "Reject" ? "destructive" : "default"}
                onClick={() => {
                  if (approvalAction !== "Approve" && !approvalRemarks) {
                    return;
                  }
                  if (approvalAction === "Request" && !delegateApproverId) {
                    return;
                  }
                  setApprovalDialogOpen(false);
                  document.body.style.pointerEvents = "auto";
                  if (approvalAction === "Request") {
                    const selectedUser = delegateApprovers.find(
                      (u) => String(u.id) === delegateApproverId,
                    );
                    if (!selectedUser) return;
                    setTimeout(() => {
                      delegateActionMutation.mutate({
                        userName: selectedUser.user_name,
                        comments: approvalRemarks,
                      });
                    }, 50);
                  } else {
                    setTimeout(() => {
                      approvalMutation.mutate({
                        action: approvalAction,
                        remarks: approvalRemarks,
                      });
                    }, 50);
                  }
                }}
                disabled={
                  approvalMutation.isPending ||
                  delegateActionMutation.isPending ||
                  (approvalAction !== "Approve" && !approvalRemarks) ||
                  (approvalAction === "Request" && !delegateApproverId)
                }
                data-testid="button-confirm-approval"
              >
                {(approvalMutation.isPending || delegateActionMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                {approvalAction === "Approve" ? "Approve" :
                  approvalAction === "Reject" ? "Reject" :
                    approvalAction === "More" ? "Request Info" :
                      "Delegate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ApprovalChecklistDialog
          open={checklistDialogOpen}
          onOpenChange={setChecklistDialogOpen}
          moduleName="Invoice"
          title="Invoice Payment Checklist"
          refNumber={invoice?.invoice_number}
          approving={approvalMutation.isPending}
          onApprove={(comments) => {
            setChecklistDialogOpen(false);
            setTimeout(() => {
              approvalMutation.mutate({ action: "Approve", remarks: comments });
            }, 50);
          }}
        />

      </div>

      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>{previewDoc?.file_name || 'Document Preview'}</span>
            </DialogTitle>
            <DialogDescription>
              {previewDoc?.source === 'SUPP_INVOICE' ? 'Invoice Document' : 'Attachment'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {(() => {
              const ext = previewDoc?.file_name?.split('.').pop()?.toLowerCase() || '';
              const isPdf = ext === 'pdf';
              const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
              const isDoc = ['doc', 'docx'].includes(ext);
              const downloadUrl = previewDoc?.source === 'SUPP_INVOICE'
                ? `/api/invoices/documents/${previewDoc?.id}/download`
                : `/api/invoices/${invoiceId}/documents/${previewDoc?.id}/download`;

              return (
                <>
                  <div className="w-full h-64 bg-muted/50 rounded-lg flex items-center justify-center border overflow-hidden">
                    {previewDoc?.preview_url ? (
                      <img src={previewDoc.preview_url} alt={previewDoc.file_name} className="max-h-full max-w-full object-contain" />
                    ) : isImage ? (
                      <FileImage className="h-16 w-16 text-blue-500/50" />
                    ) : isPdf ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-16 w-16 text-red-500/50" />
                        <span className="text-sm text-muted-foreground font-medium">PDF Document</span>
                      </div>
                    ) : isDoc ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-16 w-16 text-blue-600/50" />
                        <span className="text-sm text-muted-foreground font-medium">Word Document</span>
                        <span className="text-xs text-muted-foreground text-center">Download to open in Microsoft Word or a compatible app</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <File className="h-16 w-16 text-muted-foreground/40" />
                        <span className="text-sm text-muted-foreground font-medium">{ext?.toUpperCase() || 'Document'}</span>
                      </div>
                    )}
                  </div>
                  <div className="w-full space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">File Name</span>
                      <span className="font-medium text-right truncate max-w-[300px]" title={previewDoc?.file_name}>{previewDoc?.file_name}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Type</span>
                      <span className="font-medium">{ext?.toUpperCase()}</span>
                    </div>
                    {previewDoc?.created_by && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Uploaded By</span>
                        <span className="font-medium">{previewDoc.created_by}</span>
                      </div>
                    )}
                    {previewDoc?.created_date && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Date</span>
                        <span className="font-medium">{formatDate(previewDoc.created_date)}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadDocument(previewDoc, downloadUrl)
                    }}
                    data-testid="button-download-preview-doc"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Document
                  </Button>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <FormSheet
        open={editInvoiceSheetOpen}
        onOpenChange={(open) => {
          setEditInvoiceSheetOpen(open);
          if (!open) {
            setIsEditInvoiceFormInitialized(false);
          }
        }}
        title="Edit Invoice Header"
        description="Update this invoice's header details."
        onSubmit={() => {
          const currentDocsCount = (invoiceDocuments || []).filter(d => !deletedDocIds.includes(d.id)).length;
          const totalDocs = currentDocsCount + newFiles.length;
          if (!isFormValid && invoice.invoice_source === "NON-PO") {
            toast({
              title: "Validation Error",
              description: "Please fill all required fields before saving changes.",
              variant: "destructive"
            });
            return;
          }

          if (invoice.invoice_source !== "NON-PO" && (!editInvoiceForm.invoice_number || !editInvoiceForm.invoice_date || !editInvoiceForm.description || !editInvoiceForm.inv_due_date)) {
            toast({
              title: "Validation Error",
              description: "Please fill all required fields before saving changes.",
              variant: "destructive"
            });
            return;
          }

          if (totalDocs === 0) {
            toast({
              title: "Validation Error",
              description: "At least one document is required before saving changes.",
              variant: "destructive"
            });
            return;
          }

          if (!editInvoiceForm.department_name || editInvoiceForm.department_name === "" || editInvoiceForm.department_name === null || editInvoiceForm.department_name === undefined) {
            toast({
              title: "Validation Error",
              description: "Select Department to Continue!",
              variant: "destructive"
            });
            return;
          }

          if (!editInvoiceForm.budget_id || editInvoiceForm.budget_id === "" || editInvoiceForm.budget_id === null || editInvoiceForm.budget_id === undefined || !editInvoiceForm.budget_name || editInvoiceForm.budget_name === "" || editInvoiceForm.budget_name === null || editInvoiceForm.budget_name === undefined) {
            toast({
              title: "Validation Error",
              description: "Select Budget to Continue!",
              variant: "destructive"
            });
            return;
          }

          const formData = new FormData();
          const dataToSend = {
            ...editInvoiceForm,
            deletedDocIds: deletedDocIds
          };
          formData.append("invoiceData", JSON.stringify(dataToSend));

          newFiles.forEach((nf) => {
            formData.append("invDocFiles", nf.file);
          });

          formData.append("docPreviews", JSON.stringify(newFiles.map(nf => nf.previewUrl)));

          updateInvoiceMutation.mutate(formData);
        }}
        submitLabel="Save Changes"
        isSubmitting={updateInvoiceMutation.isPending}
        submitDisabled={!canSaveDraft || isSubmitPending || isDraftPending}
        widthClassName="w-full sm:max-w-2xl"
      >
          <div className="space-y-6 pb-6">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Indicates mandatory fields
            </p>
            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-invoice-number">Invoice Number <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-invoice-number"
                  value={editInvoiceForm.invoice_number}
                  onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, invoice_number: e.target.value })}
                  onBlur={() => {
                    if (editInvoiceForm.invoice_number.trim() === (invoice.invoice_number || "").trim()) {
                      setInvoiceNumDuplicate(null);
                      return;
                    }
                    checkInvoiceNumberDuplicate(editInvoiceForm.invoice_number);
                  }}
                  placeholder="INV-XXXX"
                  className={invoiceNumDuplicate?.duplicate ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {checkingDuplicate && (
                    <p className="text-xs text-muted-foreground" data-testid="text-checking-duplicate">Checking for duplicates...</p>
                  )}
                  {invoiceNumDuplicate?.duplicate && invoiceNumDuplicate.invoice && (
                    <p className="text-xs text-destructive" data-testid="text-duplicate-warning">
                      Duplicate: Invoice "{invoiceNumDuplicate.invoice.invoice_number}" already exists for {invoiceNumDuplicate.invoice.supplier_name} (Status: {invoiceNumDuplicate.invoice.invoice_status})
                    </p>
                  )}
              </div>

              {/* <div className="space-y-2">
                <Label htmlFor="edit-invoice-type">Invoice Type <span className="text-destructive">*</span></Label>
                <Select
                  value={editInvoiceForm.invoice_type}
                  onValueChange={(v) => setEditInvoiceForm({ ...editInvoiceForm, invoice_type: v })}
                >
                  <SelectTrigger id="edit-invoice-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="prepayment">Prepayment</SelectItem>
                  </SelectContent>
                </Select>
              </div> */}

              <div className="space-y-2">
                <Label htmlFor="edit-invoice-date">Invoice Date <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-invoice-date"
                  type="date"
                  value={editInvoiceForm.invoice_date}
                  onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, invoice_date: e.target.value })}
                />
              </div>

              {invoice?.invoice_source === "EXTERNAL" && <div className="space-y-2">
                <Label htmlFor="edit-invoice-due-date">Invoice Due Date <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-invoice-due-date"
                  type="date"
                  value={editInvoiceForm.inv_due_date}
                  onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, inv_due_date: e.target.value })}
                />
              </div>}

              {invoice?.invoice_source === "NON-PO" && <div className="space-y-2">
                <Label htmlFor="edit-currency">Currency <span className="text-destructive">*</span></Label>
                <Select
                  value={editInvoiceForm.invoice_curr_code}
                  onValueChange={(v) => setEditInvoiceForm({ ...editInvoiceForm, invoice_curr_code: v })}
                >
                  <SelectTrigger id="edit-currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.length > 0 ? (
                      currencies.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value={editInvoiceForm.invoice_curr_code}>{editInvoiceForm.invoice_curr_code}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>}

              {invoice.invoice_source === "NON-PO" && <div className="space-y-1.5">
                <Label>
                  Department <span className="text-destructive">*</span>
                </Label>

                <Select
                  value={editInvoiceForm.department_name || ""}
                  onValueChange={(v) =>
                    setEditInvoiceForm({
                      ...editInvoiceForm,
                      department_name: v,
                      budget_id: "",
                      budget_name: "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>

                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem
                        key={dept.id}
                        value={dept.value}
                      >
                        {dept.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>}

              {invoice.invoice_source === "NON-PO" && <div className="space-y-1.5">
                <Label className="text-sm">
                  Business Entity <span className="text-destructive">*</span>
                </Label>

                <Select
                  value={editInvoiceForm.orgId || ""}
                  onValueChange={(value) => {
                    setEditInvoiceForm({
                      ...editInvoiceForm,
                      orgId: value,
                      department_name: "",
                      budget_id: "",
                      budget_name: "",
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Business Entity" />
                  </SelectTrigger>

                  <SelectContent>
                    {organizations
                      ?.filter((org) => !isSuperadmin ? userOrgIds.includes(String(org.id)) : true)
                      ?.map((org) => (
                        <SelectItem key={"org" + org.id} value={String(org.id)}>
                          {org.organization_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>}

              {invoice.po_number === null && <div className="space-y-1.5">
                <Label className="text-sm">
                  Vendor <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={editInvoiceForm.supplier_id || ""}
                  onValueChange={(value) => {
                    const selectedSupplier = suppliers.find(
                      (s) => String(s.id) === value
                    );
                    setEditInvoiceForm({
                      ...editInvoiceForm,
                      supplier_id: value,
                      supplier_name: selectedSupplier?.companyName || "",
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem
                        key={supplier.id}
                        value={String(supplier.id)}
                      >
                        {supplier.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>}

              {invoice.invoice_source === "NON-PO" && <div className="space-y-2">
                <Label htmlFor="edit-payment-terms">Payment Terms <span className="text-destructive">*</span></Label>
                <Select
                  value={editInvoiceForm.payment_terms_name}
                  onValueChange={(v) => setEditInvoiceForm({ ...editInvoiceForm, payment_terms_name: v })}
                >
                  <SelectTrigger id="edit-payment-terms">
                    <SelectValue placeholder="Select terms" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentTerms.map((pt) => (
                      <SelectItem key={pt.value} value={pt.label}>{pt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>}

              {invoice.invoice_source === "NON-PO" && <div className="col-span-1 md:col-span-2 space-y-2">
                <Label htmlFor="edit-budget">Budget <span className="text-destructive">*</span></Label>
                <Select
                  value={editInvoiceForm.budget_id || ""}
                  onValueChange={(v) => {

                    const selectedDept = departments.find(
                      (d) => d.value === editInvoiceForm.department_name
                    );

                    const selectedBudget = budgetLines
                      ?.filter((item) => {

                        const matchOrg =
                          !editInvoiceForm.orgId ||
                          item.business_entity
                            ?.split(",")
                            .map((id) => id.trim())
                            .includes(String(editInvoiceForm.orgId));

                        const matchDept =
                          !editInvoiceForm.department_name ||
                          item.dept_id
                            ?.split(",")
                            .map((id) => id.trim())
                            .includes(String(selectedDept?.id));

                        return matchOrg && matchDept;
                      })
                      ?.find((bl) => String(bl.id) === v);

                    setEditInvoiceForm({
                      ...editInvoiceForm,
                      budget_id: v,
                      budget_name: selectedBudget
                        ? `${selectedBudget.budget_name} . ${selectedBudget.segment_dtl_name}`
                        : "",
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Budget">
                      {editInvoiceForm.budget_id &&
                        (() => {

                          const selectedDept = departments.find(
                            (d) => d.value === editInvoiceForm.department_name
                          );

                          const selected = budgetLines
                            ?.filter((item) => {

                              const matchOrg =
                                !editInvoiceForm.orgId ||
                                item.business_entity
                                  ?.split(",")
                                  .map((id) => id.trim())
                                  .includes(String(editInvoiceForm.orgId));

                              const matchDept =
                                !editInvoiceForm.department_name ||
                                item.dept_id
                                  ?.split(",")
                                  .map((id) => id.trim())
                                  .includes(String(selectedDept?.id));

                              return matchOrg && matchDept;
                            })
                            ?.find(
                              (bl) =>
                                String(bl.id) ===
                                String(editInvoiceForm.budget_id)
                            );

                          return selected
                            ? `${selected.budget_name} . ${selected.segment_dtl_name}`
                            : "Select Budget";
                        })()}
                    </SelectValue>
                  </SelectTrigger>

                  <SelectContent>
                    {uniqueBudgets?.length > 0 ? (
                      uniqueBudgets.map((budgetLine, index) => {

                        const lineAmount = Math.max(
                          0,
                          (parseFloat(budgetLine.amount) || 0) -
                          (parseFloat(budgetLine.consumed_amount) || 0) -
                          (parseFloat(budgetLine.reserved_amount) || 0)
                        );

                        return (
                          <SelectItem
                            key={"budget" + budgetLine.id + "-" + index}
                            value={String(budgetLine.id)}
                          >
                            <div className="flex flex-col">
                              <span>
                                {budgetLine.budget_name} .{" "}
                                {budgetLine.segment_dtl_name}
                              </span>

                              <span className="text-xs text-green-600">
                                Available Budget - ₹{" "}
                                {lineAmount.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground">
                        No budgets available in selected entity
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>}

              <div className="col-span-1 md:col-span-2 space-y-2">
                <Label htmlFor="edit-description">Description <span className="text-destructive">*</span></Label>
                <Textarea
                  id="edit-description"
                  value={editInvoiceForm.description}
                  onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, description: e.target.value })}
                  placeholder="Describe this invoice..."
                  rows={2}
                />
              </div>

              {invoice?.invoice_source === "NON-PO" && <div className="col-span-1 md:col-span-2 space-y-2">
                <Label htmlFor="edit-invoice-reason">Reason for Non-PO Invoice <span className="text-destructive">*</span></Label>
                <Textarea
                  id="edit-invoice-reason"
                  value={editInvoiceForm.invoice_reason}
                  onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, invoice_reason: e.target.value })}
                  placeholder="Reason for raising non-PO invoice..."
                  rows={2}
                />
              </div>}

              <div className="col-span-1 md:col-span-2 space-y-2">
                <Label htmlFor="edit-notes">Internal Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editInvoiceForm.invoice_notes}
                  onChange={(e) => setEditInvoiceForm({ ...editInvoiceForm, invoice_notes: e.target.value })}
                  placeholder="Additional internal notes..."
                  rows={2}
                />
              </div>
            </div>

            {/* Document Upload Section - Matches Screenshot Design */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex flex-col gap-1">
                <Label className="text-sm font-bold">
                  Click here or Drag and Drop to Upload Documents <span className="text-destructive">*</span>
                </Label>
              </div>

              <div
                className={cn(
                  "relative p-6 rounded-xl border border-gray-200 bg-gray-50/50 space-y-4 transition-all",
                  dragActive && "border-primary bg-primary/5 ring-2 ring-primary/20 ring-offset-2"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {/* File List / Previews */}
                <div className="space-y-3">
                  {/* Existing Documents as Cards */}
                  {invoiceDocuments
                    .filter((doc) => !deletedDocIds.includes(doc.id))
                    .map((doc) => (
                      <div key={doc.id} className="relative group rounded-xl border border-gray-200 bg-white p-6 min-h-[160px] flex flex-col items-center justify-center transition-all hover:border-gray-300">
                        <FileText className="h-16 w-16 text-red-400 mb-4" strokeWidth={1.5} />
                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-blue-600 truncate underline decoration-blue-600/30 underline-offset-4 flex-1" title={doc.file_name}>
                            {doc.file_name}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setDeletedDocIds((prev) => [...prev, doc.id])}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                  {/* New Files as Cards */}
                  {newFiles.map((nf) => (
                    <div key={nf.id} className="relative group rounded-xl border border-gray-200 bg-white p-6 min-h-[160px] flex flex-col items-center justify-center transition-all hover:border-gray-300">
                      {nf.previewUrl ? (
                        <div className="h-20 w-16 mb-4 rounded border overflow-hidden shadow-sm">
                          <img src={nf.previewUrl} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <FileText className="h-16 w-16 text-red-400 mb-4" strokeWidth={1.5} />
                      )}
                      <div className="absolute bottom-4 left-6 right-16 flex items-center gap-2">
                        <p className="text-sm font-medium text-blue-600 truncate underline decoration-blue-600/30 underline-offset-4" title={nf.name}>
                          {nf.name}
                        </p>
                        <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0 bg-blue-50 text-blue-600 border-blue-200">New</Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4 h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setNewFiles((prev) => prev.filter((f) => f.id !== nf.id))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Upload Action Box */}
                <div
                  className="mt-4 flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 text-gray-400 group-hover:text-primary transition-colors mb-3" strokeWidth={1.5} />
                  <p className="text-base font-medium text-gray-600 group-hover:text-primary">Upload</p>
                  <p className="text-xs text-red-500 font-medium">Allowed: PDF, Image (JPEG, PNG)</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                    accept="application/pdf,image/jpeg,image/png"
                  />
                </div>
              </div>
            </div>
          </div>
      </FormSheet>

      <CollaborationPanel
        ref={collaborationPanelRef}
        entityType="INVOICE"
        entityId={String(invoiceId)}
        notes={notesData?.notes || ""}
        notesLoading={notesLoading}
        onSaveNotes={handleSaveNotes}
        notesLabel="Invoice Notes"
        onCountsChange={(counts) => setCollaborationCount(counts.totalCount)}
        onPinChange={() => { }}
      />
    </div>
  );
}
