import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import { ViewChecklistButton } from "@/components/view-checklist-button";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import {
  CollaborationPanel,
  CollaborationPanelRef,
} from "@/components/collaboration-panel";
import Rating from "@/components/rating";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FormSheet } from "@/components/form-sheet";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { generatePOPdf } from "@/lib/generate-po-pdf";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Copy,
  DollarSign,
  Download,
  Eye,
  File,
  FileCheck,
  FileImage,
  FileText,
  HelpCircle,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Truck,
  Upload,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import TermsConditions from "../common/terms-conditions";
import { Question } from "../evaluation/evaluation-preview";
import EvaluationReview from "../evaluation/evaluation-review";
import EvaluationScore from "../evaluation/evaluation-score";

interface POLineItem {
  id: number;
  po_line_number: string;
  item_id: string | null;
  item_name: string | null;
  line_description: string | null;
  line_qty: number | null;
  line_unit: string | null;
  line_unit_cost: number | null;
  line_cost: number | null;
  line_curr: string | null;
  line_status: string | null;
  product_category: number | null;
  product_category_name: string | null;
  tax_rate_code: string | null;
  tax_rate: number | null;
  tax_amount: number | null;
  discount: number | null;
  supplier_name: string | null;
}

interface Supplier {
  id: number;
  supplier_name: string | null;
  email_id: string | null;
  phone: string | null;
  address_1: string | null;
  city: string | null;
  country: string | null;
}

interface PurchaseOrderDetail {
  po_number: string;
  po_description: string | null;
  po_status: string | null;
  po_type: string | null;
  po_total_cost: number | null;
  po_net_cost: number | null;
  po_tax: number | null;
  po_currency: string | null;
  department_name: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  po_owner_name: string | null;
  po_owner_email: string | null;
  creation_date: string | null;
  po_issue_date: string | null;
  po_required_date: string | null;
  delivertto_location_name: string | null;
  shipto_address: string | null;
  billto_address: string | null;
  pr_number: string | null;
  contract_ref_no: string | null;
  budget_name: string | null;
  budget_segment: string | null;
  payment_terms_name: string | null;
  po_notes: string | null;
  company_name: string | null;
  supplier_id: number | null;
  buyer: string | null;
  po_owner_id: string | null;
  delivertto_location_id: string | null;
  po_payment_terms_id: string | null;
  advance_flag: string | null;
  advance_percentage: number | null;
  invoiced_amount: number | null;
  approvers_list: string | null;
  bid_award_id: string | null;
  items: POLineItem[];
  supplier: Supplier | null;
  approvalHistory: Array<{
    id: number;
    object_id: string;
    approver_id: number | null;
    approver_name: string | null;
    email: string | null;
    designation: string | null;
    status: string | null;
    comments: string | null;
    approved_date: string | null;
    requested_date: string | null;
    attribute_1: string | null;
  }>;
  attribute_2: string | null;
  attribute_4: string | null;
  attribute_5: string | null;
  attribute_6: string | null;
  attribute_8: string | null;
  attribute_9: string | null;
  attribute_10: string | null;
  attribute_12: string | null;
  /** Supplier PO acknowledgement: null until Accept/Reject via updatePOSuppStatus */
  attribute_13: string | null;
  attribute_14: string | null;
  attribute_15: string | null;
  created_by: string | null;
  org_id: number | null;
  tax_included: "Yes" | "No" | null;
  data: Array<{
    attribute_12: string | null;
    star_rate: string | null;
  }>;
}

interface Organization {
  id: number;
  organization_name: string;
}

interface DeliveryNote {
  id: number;
  asn_number: string | null;
  po_number: string | null;
  status: string | null;
  ship_date: string | null;
  expected_arrival_date: string | null;
  carrier: string | null;
  ship_from: string | null;
  ship_to: string | null;
  supplier_id: number | null;
  creation_date: string | null;
  bill_of_landing: string | null;
}

interface GRN {
  maximo_grn_id: number;
  receiptnum: string | null;
  po_number: string | null;
  po_line_number: string | null;
  item_name: string | null;
  item_desc: string | null;
  received_qty: number | null;
  received_unit: string | null;
  received_cost: number | null;
  received_date: string | null;
  received_by_name: string | null;
  status: string | null;
  tax_amount: number | null;
  currency_code: string | null;
  supp_receipt_no: string | null;
  attribute_10: string | null;
  attribute_11: string | null;
  to_store_loc: string | null;
  delivertto_location_id: string | null;
  wms_id: string | null;
  requested_by: string | null;
  loaded_qty: number | null;
  loaded_cost: number | null;
  order_qty: number | null;
  order_cost: number | null;
}

interface Invoice {
  id: number;
  invoice_number: string | null;
  po_number: string | null;
  invoice_amount: number | null;
  invoice_curr_code: string | null;
  invoice_date: string | null;
  inv_due_date: string | null;
  invoice_status: string | null;
  supplier_name: string | null;
  tax_amount: number | null;
  submitted_by: string | null;
  creation_date: string | null;
  inv_payment_status: string | null;
  description: string | null;
  invoice_type?: string | null;
}

interface InvoiceReceipt {
  maximo_grn_id: number;
  receiptnum: string;
  po_number: string;
  po_line_number: string;
  item_name: string;
  product_category: string;
  product_category_name: string;
  order_qty: number;
  received_qty: number;
  received_cost: number;
  loaded_cost: number;
  tax_rate: number;
  tax_rate_code: string;
  tax_amount: number;
  received_date: string;
  received_by_name: string;
  attribute_9: string | null;
  status: string;
  attribute_15: string | null;
}

// Role names for approval workflow
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

  if (ROLE_NAMES.some((role) => upperApprover === role)) {
    return `Any User in ${trimmed} Role`;
  }
  return trimmed;
}

interface RoleUser {
  id: number;
  name: string;
  email_id: string;
  user_name: string;
  designation: string;
  department_name: string;
}

function RoleUsersTooltip({
  roleName,
  children,
}: {
  roleName: string;
  children: ReactNode;
}) {
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const handleMouseEnter = async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const response = await apiRequest("GET",
        `/api/roles/by-name/${encodeURIComponent(roleName)}/users`,
      );
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching role users:", error);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild onMouseEnter={handleMouseEnter}>
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {loading ? (
          <p className="text-xs">Loading users...</p>
        ) : users.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold mb-1">Users in this role:</p>
            {users.slice(0, 5).map((user) => (
              <p key={user.id} className="text-xs">
                {user.name} {user.designation ? `(${user.designation})` : ""}
              </p>
            ))}
            {users.length > 5 && (
              <p className="text-xs text-muted-foreground">
                +{users.length - 5} more
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs">No users found in this role</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

const statusConfig: Record<
  string,
  {
    label: string;
    icon: typeof Clock;
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
> = {
  Draft: { label: "Draft", icon: FileText, variant: "secondary" },
  "Pending Approval": {
    label: "Pending Approval",
    icon: Clock,
    variant: "outline",
    className: "border-orange-300 text-orange-600 dark:text-orange-400",
  },
  Approved: { label: "Approved", icon: CheckCircle2, variant: "default" },
  Complete: {
    label: "Complete",
    icon: Package,
    variant: "secondary",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  Closed: {
    label: "Closed",
    icon: CheckCircle2,
    variant: "secondary",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  Rejected: { label: "Rejected", icon: XCircle, variant: "destructive" },
  Cancelled: { label: "Cancelled", icon: XCircle, variant: "destructive" },
  "More Info Required": {
    label: "More Info Required",
    icon: Clock,
    variant: "outline",
    className: "border-orange-300 text-orange-600 dark:text-orange-400",
  },
};

function StatusBadge({ status }: { status: string | null }) {
  const config = statusConfig[status || "Draft"] || statusConfig["Draft"];
  const Icon = config.icon;
  return (
    <Badge
      variant={config.variant}
      className={`gap-1 ${config.className || ""}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function DeliveryNoteLines({ deliveryId }: { deliveryId: number }) {
  const { data: lines = [], isLoading } = useQuery<
    Array<{
      id: number;
      po_line_number: string;
      item_name: string;
      qty: number;
      uom: string;
      description: string;
      status: string;
    }>
  >({
    queryKey: ["/api/delivery-notes", deliveryId, "lines"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/delivery-notes/${deliveryId}/lines`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!deliveryId,
  });

  if (isLoading) {
    return (
      <div className="px-12 py-3 text-sm text-muted-foreground">
        Loading lines...
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="px-12 py-3 text-sm text-muted-foreground">
        No line items
      </div>
    );
  }

  return (
    <div className="bg-muted/30 border-t">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs font-medium pl-12">Line #</TableHead>
            <TableHead className="text-xs font-medium">Item Name</TableHead>
            <TableHead className="text-xs font-medium">Description</TableHead>
            <TableHead className="text-xs font-medium text-right">
              Qty
            </TableHead>
            <TableHead className="text-xs font-medium">UOM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, idx) => (
            <TableRow
              key={line.id}
              className="hover:bg-muted/50"
              data-testid={`row-dn-line-${idx}`}
            >
              <TableCell className="text-sm py-2 pl-12">
                {line.po_line_number}
              </TableCell>
              <TableCell className="text-sm py-2">
                {line.item_name || "-"}
              </TableCell>
              <TableCell className="text-sm py-2 max-w-[200px] truncate">
                {line.description || "-"}
              </TableCell>
              <TableCell className="text-sm py-2 text-right">
                {line.qty}
              </TableCell>
              <TableCell className="text-sm py-2">{line.uom || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const getDueDateFormatted = (dateStr: string, paymentTerms: string | null | undefined) => {
  if (!dateStr || !paymentTerms) return "";
  const daysMatch = paymentTerms.match(/(\d+)\s*Days/i);
  if (!daysMatch) return "";
  const days = parseInt(daysMatch[1]);
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
};

export default function PurchaseOrderDetail() {
  const { poNumber } = useParams<{ poNumber: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Collaboration Panel ref and state
  const { isAIEnabled } = useAISettings();
  const collaborationPanelRef = useRef<CollaborationPanelRef>(null);
  const [collaborationCount, setCollaborationCount] = useState(0);
  const [isPanelPinned, setIsPanelPinned] = useState(false);
  const [openEvaluation, setOpenEvaluation] = useState<boolean>(false);
  const [openReviewModal, setOpenReviewModal] = useState<boolean>(false);
  const [savedResponses, setSavedResponses] = useState<{ questions: Question[]; comment: string }>({ questions: [], comment: "" });
  const [openResult, setOpenResult] = useState<boolean>(false);

  // DN expanded rows state
  const [expandedDnIds, setExpandedDnIds] = useState<Set<number>>(new Set());
  const [expandedGrnIds, setExpandedGrnIds] = useState<Set<string>>(new Set());
  const toggleGrnExpand = (id: string) => {
    setExpandedGrnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleDnExpand = (id: number) => {
    setExpandedDnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Raise DN states
  const [isDNOpen, setIsDNOpen] = useState(false);
  const [dnForm, setDnForm] = useState({
    asn_number: "",
    bill_of_landing: "",
    carrier: "",
    ship_date: "",
    expected_arrival_date: "",
    ship_to: "",
    ship_from: "",
  });
  const [dnLines, setDnLines] = useState<
    Array<{
      selected: boolean;
      po_line_number: string;
      item_name: string;
      line_qty: number;
      received_qty: number;
      pending_qty: number;
      delivery_qty: number;
      line_unit: string;
    }>
  >([]);

  // Raise Receipt states
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    receipt_date: "",
    receipt_number: "",
    receipt_notes: "",
    received_location: "",
  });
  const [receiptLines, setReceiptLines] = useState<
    Array<{
      selected: boolean;
      po_line_number: string;
      item_name: string;
      line_qty: number;
      pending_del_qty: number;
      received_qty: number;
      line_unit: string;
      line_unit_price: number;
      line_cost: number;
      item_id: string | null;
      item_type: string | null;
      line_curr: string | null;
      discount: number;
      tax_rate_code: string | null;
      attribute_12: string | null;
      attribute_15: string | null;
    }>
  >([]);

  // Raise Invoice states
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_description: "",
    invoice_number: "",
    invoice_type: "Standard",
    invoice_date: "",
    invoice_due_date: "",
    invoice_notes: "",
  });

  const [supplierRejectDialogOpen, setSupplierRejectDialogOpen] = useState(false);
  const [supplierRejectComments, setSupplierRejectComments] = useState("");
  const [invoiceReceiptLines, setInvoiceReceiptLines] = useState<
    Array<InvoiceReceipt & { selected: boolean }>
  >([]);
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0);
  const [invoiceTaxAmount, setInvoiceTaxAmount] = useState<number>(0);
  const [invoiceTotalAmount, setInvoiceTotalAmount] = useState<number>(0);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [invoiceDocuments, setInvoiceDocuments] = useState<
    { id: string; name: string; file?: File; previewUrl?: string | null }[]
  >([]);
  const [selectedInvoiceFile, setSelectedInvoiceFile] = useState<File | null>(
    null,
  );
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const [invoiceNumDuplicate, setInvoiceNumDuplicate] = useState<{
    duplicate: boolean;
    invoice?: {
      id: number;
      invoice_number: string;
      supplier_name: string;
      invoice_status: string;
    };
  } | null>(null);
  const [checkingInvoiceDuplicate, setCheckingInvoiceDuplicate] =
    useState(false);

  // Advance Invoice states
  const [isAdvanceInvoiceOpen, setIsAdvanceInvoiceOpen] = useState(false);
  const [advanceInvoiceForm, setAdvanceInvoiceForm] = useState({
    invoice_description: "",
    invoice_number: "",
    invoice_date: "",
    invoice_due_date: "",
    invoice_amount: 0,
  });
  const [agreeToTermsAdvance, setAgreeToTermsAdvance] = useState(false);
  const [advanceInvoiceDocuments, setAdvanceInvoiceDocuments] = useState<
    { id: string; name: string; file?: File; previewUrl?: string | null }[]
  >([]);
  const advanceInvoiceFileInputRef = useRef<HTMLInputElement>(null);

  // Draft PO action states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [reSubmitConfirmOpen, setReSubmitConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    description: "",
    deliveryLocation: "",
    requiredDate: "",
    requestorId: "",
    requestorName: "",
    requestorDepartment: "",
    orgId: "",
    supplierId: "",
    supplierName: "",
    budgetId: "",
    budgetName: "",
    currency: "",
    paymentTermsId: "",
    paymentTermsName: "",
    notes: "",
    advanceFlag: false,
    advancePercentage: "",
  });
  const [editVendorSearch, setEditVendorSearch] = useState("");
  const [editVendorDropdownOpen, setEditVendorDropdownOpen] = useState(false);

  // Add/Edit Line Item states
  const [addLineSheetOpen, setAddLineSheetOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [deleteLineConfirmOpen, setDeleteLineConfirmOpen] = useState(false);
  const [lineToDelete, setLineToDelete] = useState<number | null>(null);
  const [itemEntryMode, setItemEntryMode] = useState<"master" | "freetext">(
    "master",
  );
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const orgDetails = JSON.parse(localStorage.getItem("orgDetails") || "{}");
  const default_tax = orgDetails.default_tax;

  // Excel import state
  const [isLinesImportOpen, setIsLinesImportOpen] = useState(false);
  const [linesImportFile, setLinesImportFile] = useState<File | null>(null);
  const [linesImportPreview, setLinesImportPreview] = useState<{
    total: number; valid: number; invalid: number;
    results: { rowNumber: number; description: string; quantity: number; discount: number; unitPrice: number; valid: boolean; errors: string[] }[];
  } | null>(null);
  const [linesImportResults, setLinesImportResults] = useState<{
    created: number; errors: number; total: number;
    results: { rowNumber: number; description: string; success: boolean; lineId?: number; errors?: string[] }[];
  } | null>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);

  const [newLineItem, setNewLineItem] = useState({
    description: "",
    quantity: "1",
    discount: "0",
    unitPrice: "",
    uom: "Each",
    taxRate: "0",
    taxCode: "",
    categoryCode: "",
    categoryName: "",
    itemId: "",
    itemName: "",
    taxId: "",
    inclusiveTaxAmt: ""
  });

  // Approval workflow state
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<
    "Approve" | "Reject" | "More" | "Request" | "ReSubmit"
  >("Approve");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [delegateApproverId, setDelegateApproverId] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);

  const { data: delegateApprovers = [] } = useQuery<
    { id: number; name: string; user_name: string }[]
  >({
    queryKey: ["/api/users/dropdown"],
    enabled: approvalDialogOpen && approvalAction === "Request",
  });

  // Get taskId from sessionStorage (set when navigating from my-tasks)
  useEffect(() => {
    const storedTaskId = sessionStorage.getItem("currentTaskId");
    console.log("Reading taskId from sessionStorage:", storedTaskId);
    setTaskId(storedTaskId);
  }, []);

  const {
    data: po,
    isLoading,
    error,
  } = useQuery<PurchaseOrderDetail>({
    queryKey: ["/api/purchase-orders", poNumber],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${poNumber}`);
      if (!res.ok) throw new Error("Failed to fetch purchase order");
      return res.json();
    },
  });

  const { data: evaluationModuleStatus } = useQuery<{ moduleIsActive: string }>({
    queryKey: ["/api/form/modulestatus"],
  });

  const isPendingApprovalStatus = po?.po_status?.toLowerCase() === "pending approval";

  const { data: activeTask } = useQuery<any>({
    queryKey: ["/api/purchase-orders", poNumber, "active-task"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${poNumber}/active-task`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isPendingApprovalStatus && !taskId,
  });

  useEffect(() => {
    if ((activeTask?.id_ || po?.attribute_12) && !taskId && !isPoRequestor) {
      setTaskId(activeTask?.id_ || po?.attribute_12);
    }
  }, [activeTask, po?.attribute_12, taskId]);

  useEffect(() => {
    if (evaluationModuleStatus?.moduleIsActive !== "Yes") {
      setOpenEvaluation(false);
      return;
    }

    if (po?.po_status === "Complete" && po?.attribute_4 !== null && Number(po?.attribute_4) !== 0 && (po?.attribute_2 === null || po?.attribute_2 === "Draft") && po?.po_owner_email === authParsed?.email) {
      setOpenEvaluation(true);
    }
  }, [evaluationModuleStatus?.moduleIsActive, po?.po_status, po?.attribute_4, po?.attribute_2, po?.po_owner_email]);

  const submittedResponse = () => {
    setOpenReviewModal(false);
    setOpenResult(false);
    queryClient.invalidateQueries({
      queryKey: ["/api/purchase-orders", poNumber],
    });
  }

  const openSupplierEvaluationResults = () => {
    setOpenReviewModal(true);
    setOpenResult(true);
    setOpenEvaluation(false);
  }

  const resumeEvaluation = () => {
    if (evaluationModuleStatus?.moduleIsActive !== "Yes") {
      setOpenEvaluation(false);
      toast({
        title: "Evaluation is disabled",
        variant: "destructive",
      });
      return;
    }

    setOpenEvaluation(true);
  };

  const { data: deliveryNotes = [] } = useQuery<DeliveryNote[]>({
    queryKey: ["/api/purchase-orders", poNumber, "delivery-notes"],
    queryFn: async () => {
      const res = await apiRequest("GET",
        `/api/purchase-orders/${poNumber}/delivery-notes`,
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!poNumber,
  });

  const { data: grns = [] } = useQuery<GRN[]>({
    queryKey: ["/api/purchase-orders", poNumber, "grns"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${poNumber}/grns`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!poNumber,
  });

  const groupedGrns = useMemo(() => {
    const groups: Record<string, {
      id: string;
      receiptnum: string;
      received_date: string;
      received_by_name: string;
      status: string;
      supp_receipt_no: string;
      currency_code: string;
      attribute_11: string;
      lines: GRN[]
    }> = {};

    grns.forEach((grn) => {
      const key = `${grn.receiptnum}_${grn.received_date}_${grn.supp_receipt_no || ''}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          receiptnum: grn.receiptnum || "NA",
          received_date: grn.received_date || "",
          received_by_name: grn.received_by_name || "NA",
          status: grn.status || "Draft",
          supp_receipt_no: grn.supp_receipt_no || "NA",
          currency_code: grn.currency_code || po?.po_currency || "USD",
          attribute_11: grn.attribute_11 || "NA",
          lines: [],
        };
      }
      groups[key].lines.push(grn);
    });

    return Object.values(groups);
  }, [grns, po?.po_currency]);

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/purchase-orders", poNumber, "invoices"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${poNumber}/invoices`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!poNumber,
  });

  function shouldEnableButton(
    invoices: any[],
    invoiceType: string
  ): boolean {
    const latestInvoice = invoices
      .filter((inv) => inv.invoice_type === invoiceType)
      .sort(
        (a, b) =>
          new Date(b.creation_date).getTime() -
          new Date(a.creation_date).getTime()
      )[0];

    if (!latestInvoice) return true;

    return latestInvoice.invoice_status === "Rejected";
  }
  const enabled = shouldEnableButton(invoices, "PREPAYMENT");

  // Categories query for line item form
  const { data: categoriesData } = useQuery<
    { id: string; code: string; name: string; level: string }[]
  >({
    queryKey: ["/api/categories"],
  });
  const categories = categoriesData || [];

  // Items query for line item form
  const { data: itemsData } = useQuery<
    {
      id: string;
      itemCode: string;
      name: string;
      categoryCode: string;
      categoryName: string;
      unitOfMeasure: string;
      standardPrice: number | null;
    }[]
  >({
    queryKey: ["/api/items"],
  });
  const items = itemsData || [];

  // Tax codes query for dropdown
  const { data: taxCodesData } = useQuery<
    {
      id: number;
      tax_code_id: string;
      tax_code: string;
      tax_code_desc: string;
      tax_rate: number;
      tax_type: string;
    }[]
  >({
    queryKey: ["/api/tax-codes"],
  });
  const taxCodes = taxCodesData || [];
  const defaultTaxCode = taxCodes.find((t) => t.tax_code === default_tax);

  // Check PO status
  const isDraft = po?.po_status === "Draft";
  const isPendingApproval = po?.po_status?.toLowerCase() === "pending approval";
  const isMoreInfoRequired =
    po?.po_status?.toLowerCase() === "more info required" ||
    po?.po_status?.toLowerCase() === "more" ||
    po?.po_status === "More Information Required";
  const isApproved = po?.po_status?.toLowerCase() === "approved";
  const isRejected = po?.po_status?.toLowerCase() === "rejected";
  const isCancelled = po?.po_status?.toLowerCase() === "cancelled";
  const isComplete = po?.po_status?.toLowerCase() === "complete";
  const isClosed = po?.po_status?.toLowerCase() === "closed";

  const canRaiseAdvance = useMemo(() => {
    if (!invoices || invoices.length === 0) return true;

    // Hide if any prepayment invoice is Pending Approval, More Info Required, or Approved.
    const hasActiveAdvance = invoices.some(inv =>
      (inv.invoice_type?.toLowerCase() === "prepayment") &&
      (inv.invoice_status === "Pending Approval" ||
        inv.invoice_status === "Approved" ||
        inv.invoice_status === "More Info Required" ||
        inv.invoice_status?.toLowerCase() === "more")
    );

    return !hasActiveAdvance;
  }, [invoices]);

  // Edit PO form queries (only fetch when PO is editable)
  const poIsDraft = isDraft || isMoreInfoRequired;
  const { data: locationsData } = useQuery<
    { id: number; location_id: string; location_name: string }[]
  >({
    queryKey: ["/api/locations"],
    enabled: !!poIsDraft,
  });
  const { data: usersData } = useQuery<
    {
      id: number;
      name: string;
      user_name: string;
      department_name: string | null;
    }[]
  >({
    queryKey: ["/api/users/dropdown"],
    enabled: !!poIsDraft,
  });
  const { data: departmentsData } = useQuery<{
    data: { id: number; code: string; value: string; status: string }[];
  }>({
    queryKey: ["/api/cost-centers/3/items?limit=100"],
    enabled: !!poIsDraft,
  });
  const { data: suppliersData } = useQuery<{
    data: { id: number; company_name?: string; companyName?: string }[];
  }>({
    queryKey: ["/api/dbo/suppliers?status=Active,Changes%20In%20Draft&limit=500"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dbo/suppliers?status=Active%2CChanges%20In%20Draft&limit=500");
      if (!res.ok) throw new Error("Failed to fetch suppliers");
      const json = await res.json();
      if (Array.isArray(json)) return { data: json } as any;
      return json;
    },
    enabled: !!poIsDraft,
  });
  const { data: currencyOptions = [] } = useQuery<
    { value: string; label: string }[]
  >({
    queryKey: ["/api/vendor/lookups/currencies"],
    enabled: !!poIsDraft,
  });
  const { data: budgetLinesData } = useQuery<
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
      dept_id: string | null;
      loc_id: string | null;
    }[]
  >({
    queryKey: ["/api/budgets/approved-lines"],
    enabled: !!poIsDraft,
  });
  const { data: paymentTermsData } = useQuery<{
    data: {
      id: number;
      payment_term_id: string;
      terms_name: string;
      status: string;
    }[];
  }>({
    queryKey: ["/api/payment-terms?limit=100"],
    enabled: !!poIsDraft,
  });
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const editLocations = locationsData || [];
  const editUsers = (Array.isArray(usersData) ? usersData : []) as {
    id: number;
    name: string;
    user_name: string;
    department_name: string | null;
  }[];
  const editDepartments =
    departmentsData?.data?.filter((d) => d.status === "Y") || [];
  const editVendors = (suppliersData?.data || []) as {
    id: number;
    company_name?: string;
    companyName?: string;
  }[];
  const editBudgetLines = budgetLinesData || [];
  const editFilteredBudgets = useMemo(
    () =>
      editBudgetLines.filter((item) => {
        const matchOrg =
          !editForm.orgId || item.business_entity === editForm.orgId;
        const matchDept =
          !editForm.requestorDepartment ||
          String(item.dept_id) === String(editForm.requestorDepartment);
        const matchLoc =
          !editForm.deliveryLocation ||
          String(item.loc_id) === String(editForm.deliveryLocation);
        return matchOrg && matchDept && matchLoc;
      }),
    [
      editBudgetLines,
      editForm.orgId,
      editForm.requestorDepartment,
      editForm.deliveryLocation,
    ],
  );
  const editUniqueBudgets = useMemo(
    () =>
      Array.from(
        new Map(editFilteredBudgets.map((item) => [item.id, item])).values(),
      ),
    [editFilteredBudgets],
  );
  const editPaymentTerms = (paymentTermsData?.data || []).filter(
    (pt) => pt.status === "Y",
  );

  // Raise DN queries
  const { data: carriersData } = useQuery<
    { id: number; lookup_value: string }[]
  >({
    queryKey: ["/api/lookups/by-property/Carrier"],
    enabled: isDNOpen,
  });
  const { data: dnLocationsData } = useQuery<
    { id: number; location_name: string }[]
  >({
    queryKey: ["/api/locations"],
    enabled: isDNOpen,
  });
  const { data: dnPoLines } = useQuery<
    Array<{
      id: number;
      po_line_number: string;
      item_name: string;
      line_qty: number;
      received_qty: number;
      pending_qty: number;
      line_unit: string;
    }>
  >({
    queryKey: ["/api/purchase-orders", poNumber, "lines-for-dn"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${poNumber}/lines-for-dn`);
      if (!res.ok) throw new Error("Failed to fetch lines");
      return res.json();
    },
    enabled: isDNOpen && !!poNumber,
  });

  useEffect(() => {
    if (dnPoLines && isDNOpen) {
      setDnLines(
        dnPoLines.map((line) => ({
          selected: line.pending_qty > 0,
          po_line_number: line.po_line_number,
          item_name: line.item_name || "-",
          line_qty: line.line_qty,
          received_qty: line.received_qty,
          pending_qty: line.pending_qty,
          delivery_qty: line.pending_qty,
          line_unit: line.line_unit || "-",
        })),
      );
    }
  }, [dnPoLines, isDNOpen]);

  const createDnMutation = useMutation({
    mutationFn: async () => {
      const selectedLines = dnLines.filter(
        (l) => l.selected && l.delivery_qty > 0,
      );
      await apiRequest(
        "POST",
        `/api/purchase-orders/${poNumber}/delivery-notes`,
        {
          header: {
            asn_number: dnForm.asn_number,
            bill_of_landing: dnForm.bill_of_landing || undefined,
            carrier: dnForm.carrier,
            ship_date: dnForm.ship_date,
            expected_arrival_date: dnForm.expected_arrival_date,
            ship_to: dnForm.ship_to,
            ship_from: dnForm.ship_from,
            supplier_id: po?.supplier_id || 0,
          },
          lines: selectedLines.map((l) => ({
            po_line_number: l.po_line_number,
            item_name: l.item_name,
            qty: l.delivery_qty,
            uom: l.line_unit,
          })),
        },
      );
    },
    onSuccess: () => {
      toast({
        title: "Delivery Note Created",
        description: "Delivery note has been created successfully.",
      });
      setIsDNOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber, "delivery-notes"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber, "lines-for-dn"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create DN",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const carriers = carriersData || [];
  const dnLocations = dnLocationsData || [];

  // Raise Receipt queries
  const { data: receiptLocationsData } = useQuery<
    { id: number; location_name: string }[]
  >({
    queryKey: ["/api/locations"],
    enabled: isReceiptOpen,
  });
  const { data: receiptPoLines } = useQuery<
    Array<{
      id: number;
      po_line_number: string;
      item_name: string;
      line_description: string;
      line_qty: number;
      pending_del_qty: number;
      total_grn_qty: number;
      line_unit: string;
      line_unit_price: number;
      line_cost: number;
      item_id: string | null;
      item_type: string | null;
      line_curr: string | null;
      discount: number;
      tax_rate_code: string | null;
      attribute_12: string | null;
      attribute_15: string | null;
    }>
  >({
    queryKey: ["/api/purchase-orders", poNumber, "lines-for-receipt"],
    queryFn: async () => {
      const res = await apiRequest("GET",
        `/api/purchase-orders/${poNumber}/lines-for-receipt`,
      );
      if (!res.ok) throw new Error("Failed to fetch lines");
      return res.json();
    },
    enabled: isReceiptOpen && !!poNumber,
  });
  const receiptLocations = receiptLocationsData || [];

  useEffect(() => {
    if (receiptPoLines && isReceiptOpen) {
      setReceiptLines(
        receiptPoLines.map((line) => ({
          selected: line.pending_del_qty > 0,
          po_line_number: line.po_line_number,
          item_name: line.item_name || "-",
          line_qty: line.line_qty,
          pending_del_qty: line.pending_del_qty,
          received_qty: line.pending_del_qty,
          line_unit: line.line_unit || "-",
          line_unit_price: line.line_unit_price || 0,
          line_cost: line.line_cost || 0,
          item_id: line.item_id || null,
          item_type: line.item_type || null,
          line_curr: line.line_curr || null,
          discount: line.discount || 0,
          tax_rate_code: line.tax_rate_code || null,
          attribute_12: line.attribute_12 || null,
          attribute_15: line.attribute_15 || null,
        })),
      );
    }
  }, [receiptPoLines, isReceiptOpen]);

  const createReceiptMutation = useMutation({
    mutationFn: async () => {
      const selectedLines = receiptLines.filter(
        (l) => l.selected && l.received_qty > 0,
      );
      await apiRequest("POST", `/api/purchase-orders/${poNumber}/receipts`, {
        header: {
          receipt_date: receiptForm.receipt_date,
          receipt_number: receiptForm.receipt_number || undefined,
          receipt_notes: receiptForm.receipt_notes || undefined,
          received_location: receiptForm.received_location,
          supplier_name: po?.supplier?.supplier_name || "",
          currency_code: po?.po_currency || "",
          requested_by: po?.po_owner_name || "",
        },
        lines: selectedLines.map((l) => ({
          po_line_number: l.po_line_number,
          item_name: l.item_name,
          received_qty: l.received_qty,
          uom: l.line_unit,
          unit_price: l.line_unit_price,
          item_id: l.item_id || null,
          item_type: l.item_type || null,
          line_curr: l.line_curr || null,
          discount: l.discount || 0,
          tax_rate_code: l.tax_rate_code || null,
          attribute_12: l.attribute_12 || null,
          line_cost: l.line_cost || 0,
        })),
      });
    },
    onSuccess: () => {
      toast({
        title: "Receipt Created",
        description: "Receipt has been created successfully.",
      });
      setIsReceiptOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber, "receipts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber, "lines-for-receipt"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create receipt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Raise Invoice queries
  const { data: invoiceReceiptsData } = useQuery<InvoiceReceipt[]>({
    queryKey: ["/api/purchase-orders", poNumber, "receipts-for-invoice"],
    queryFn: async () => {
      const res = await apiRequest("GET",
        `/api/purchase-orders/${poNumber}/receipts-for-invoice`,
      );
      if (!res.ok) throw new Error("Failed to fetch receipts");
      return res.json();
    },
    enabled: isInvoiceOpen && !!poNumber,
  });

  useEffect(() => {
    if (invoiceReceiptsData && isInvoiceOpen) {
      setInvoiceReceiptLines(
        invoiceReceiptsData.map((r) => ({ ...r, selected: false })),
      );
      setInvoiceAmount(0);
      setInvoiceTaxAmount(0);
      setInvoiceTotalAmount(0);
    }
  }, [invoiceReceiptsData, isInvoiceOpen]);

  useEffect(() => {
    const selected = invoiceReceiptLines.filter((l) => l.selected);
    const amount = selected.reduce(
      (sum, l) => sum + (Number(l.received_cost) || 0),
      0,
    );
    const tax = selected.reduce(
      (sum, l) => sum + (Number(l.tax_amount) || 0),
      0,
    );
    setInvoiceAmount(amount);
    setInvoiceTaxAmount(tax);
    setInvoiceTotalAmount(amount + tax);
  }, [invoiceReceiptLines]);

  const checkInvoiceNumberDuplicate = async (invoiceNumber: string) => {
    if (!invoiceNumber.trim()) {
      setInvoiceNumDuplicate(null);
      return;
    }
    setCheckingInvoiceDuplicate(true);
    try {
      const res = await apiRequest("GET",
        `/api/invoices/check-duplicate?invoice_number=${encodeURIComponent(invoiceNumber.trim())}`,
      );
      if (res.ok) {
        const data = await res.json();
        setInvoiceNumDuplicate(data);
      }
    } catch {
      setInvoiceNumDuplicate(null);
    } finally {
      setCheckingInvoiceDuplicate(false);
    }
  };

  const ALLOWED_INV_FILE_TYPES: Record<string, string[]> = {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
  };
  const MAX_INV_FILE_SIZE_MB = 5;
  const DANGEROUS_INV_EXTS = [
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

  function handleInvoiceFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
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

    if (DANGEROUS_INV_EXTS.includes(ext)) {
      toast({ title: "This file type is not allowed", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const isAllowed = Object.entries(ALLOWED_INV_FILE_TYPES).some(
      ([mime, exts]) => exts.includes(ext) || file.type === mime,
    );
    if (!isAllowed) {
      toast({
        title: "Unsupported file type. Allowed: PDF, JPG, PNG, DOC, DOCX",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    if (file.size === 0) {
      toast({
        title: "File is empty (0 KB). Please upload a valid file.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_INV_FILE_SIZE_MB * 1024 * 1024) {
      toast({
        title: `File too large. Max ${MAX_INV_FILE_SIZE_MB}MB allowed.`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    setSelectedInvoiceFile(file);
  }

  useEffect(() => {
    if (!selectedInvoiceFile) return;

    const processFile = async () => {
      let preview: string | null = null;

      if (selectedInvoiceFile.type.startsWith("image/")) {
        preview = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(selectedInvoiceFile);
        });
      } else if (selectedInvoiceFile.type === "application/pdf") {
        try {
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url,
          ).toString();
          const arrayBuffer = await selectedInvoiceFile.arrayBuffer();
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
          if (ctx) {
            await page.render({
              canvasContext: ctx,
              canvas,
              viewport: scaledViewport,
            }).promise;
            preview = canvas.toDataURL("image/png");
          }
        } catch (err) {
          console.error("PDF preview error:", err);
        }
      }

      setInvoiceDocuments((prev) => [
        ...prev,
        {
          id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: selectedInvoiceFile.name,
          file: selectedInvoiceFile,
          previewUrl: preview,
        },
      ]);
      setSelectedInvoiceFile(null);
      if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = "";
    };

    processFile();
  }, [selectedInvoiceFile]);

  const removeInvoiceDocument = (id: string) => {
    setInvoiceDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  // Advance Invoice document handling helpers
  const [selectedAdvInvoiceFile, setSelectedAdvInvoiceFile] = useState<File | null>(null);

  function handleAdvInvoiceFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name || "";
    const ext = fileName.lastIndexOf(".") >= 0 ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase() : "";

    if (DANGEROUS_INV_EXTS.includes(ext) || file.size > MAX_INV_FILE_SIZE_MB * 1024 * 1024 || file.size === 0) {
      toast({ title: "Invalid file or file too large", variant: "destructive" });
      e.target.value = "";
      return;
    }

    setSelectedAdvInvoiceFile(file);
  }

  useEffect(() => {
    if (!selectedAdvInvoiceFile) return;

    const processFile = async () => {
      let preview: string | null = null;
      if (selectedAdvInvoiceFile.type.startsWith("image/")) {
        preview = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(selectedAdvInvoiceFile);
        });
      } else if (selectedAdvInvoiceFile.type === "application/pdf") {
        try {
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url,
          ).toString();
          const arrayBuffer = await selectedAdvInvoiceFile.arrayBuffer();
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
          if (ctx) {
            await page.render({
              canvasContext: ctx,
              canvas,
              viewport: scaledViewport,
            }).promise;
            preview = canvas.toDataURL("image/png");
          }
        } catch (err) {
          console.error("PDF preview error:", err);
        }
      }

      setAdvanceInvoiceDocuments((prev) => [
        ...prev,
        {
          id: `adv_doc_${Date.now()}`,
          name: selectedAdvInvoiceFile.name,
          file: selectedAdvInvoiceFile,
          previewUrl: preview,
        },
      ]);
      setSelectedAdvInvoiceFile(null);
      if (advanceInvoiceFileInputRef.current) advanceInvoiceFileInputRef.current.value = "";
    };

    processFile();
  }, [selectedAdvInvoiceFile]);

  function removeAdvInvoiceDocument(id: string) {
    setAdvanceInvoiceDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const selectedLines = invoiceReceiptLines.filter((l) => l.selected);
      if (selectedLines.length === 0)
        throw new Error("Please select at least one receipt");
      if (!invoiceForm.invoice_description.trim())
        throw new Error("Invoice description is required");
      if (!invoiceForm.invoice_number.trim())
        throw new Error("Invoice number is required");
      if (!invoiceForm.invoice_date)
        throw new Error("Invoice date is required");
      if (!invoiceForm.invoice_due_date)
        throw new Error("Invoice due date is required");
      if (!agreeToTerms) throw new Error("Please agree to Terms & Conditions");
      if (invoiceDocuments.length === 0)
        throw new Error("Please upload an invoice document");

      const formData = new FormData();
      formData.append(
        "header",
        JSON.stringify({
          invoice_description: invoiceForm.invoice_description,
          invoice_number: invoiceForm.invoice_number,
          invoice_type: invoiceForm.invoice_type || "Standard",
          invoice_date: invoiceForm.invoice_date,
          invoice_due_date: invoiceForm.invoice_due_date,
          invoice_amount: invoiceAmount,
          tax_amount: invoiceTaxAmount,
          supplier_id: po?.supplier_id || 0,
          supplier_name: po?.supplier?.supplier_name || po?.company_name || "",
          org_id: 0,
          payment_terms_name: po?.payment_terms_name || "",
          currency_code: po?.po_currency || "AED",
          invoice_notes: invoiceForm.invoice_notes || undefined,
        }),
      );
      formData.append("receiptLines", JSON.stringify(selectedLines));
      const docPreviews: (string | null)[] = [];
      for (const doc of invoiceDocuments) {
        if (doc.file) {
          formData.append("files", doc.file);
          docPreviews.push(doc.previewUrl || null);
        }
      }
      formData.append("docPreviews", JSON.stringify(docPreviews));

      const res = await apiRequest("POST", `/api/purchase-orders/${poNumber}/invoices`, formData);
      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ message: "Failed to submit invoice" }));
        throw new Error(errData.error || errData.message || "Failed to submit invoice");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Invoice Submitted",
        description: "Invoice has been submitted successfully for approval.",
      });
      setIsInvoiceOpen(false);
      setAgreeToTerms(false);
      setInvoiceDocuments([]);
      setInvoiceNumDuplicate(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber, "invoices"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber, "receipts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber, "receipts-for-invoice"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createAdvanceInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!po) throw new Error("PO details not available");

      // Explicit front-end validation before submission
      if (!advanceInvoiceForm.invoice_description.trim()) throw new Error("Description is required");
      if (!advanceInvoiceForm.invoice_number.trim()) throw new Error("Invoice number is required");
      if (!advanceInvoiceForm.invoice_date) throw new Error("Invoice date is required");
      if (!advanceInvoiceForm.invoice_due_date) throw new Error("Invoice due date is required");
      if (advanceInvoiceDocuments.length === 0) throw new Error("Please upload at least one attachment");
      if (!agreeToTermsAdvance) throw new Error("You must agree to the terms and conditions");

      const formData = new FormData();

      const header = {
        ...advanceInvoiceForm,
        po_number: po.po_number,
        supplier_id: po.supplier_id,
        supplier_name: po.company_name || po.supplier?.supplier_name,
        invoice_type: "Prepayment",
        invoice_due_date: advanceInvoiceForm.invoice_due_date,
        invoice_date: advanceInvoiceForm.invoice_date,
        invoice_amount: advanceInvoiceForm.invoice_amount,
        tax_amount: 0,
        currency_code: po.po_currency || "AED",
      };

      formData.append("invoiceData", JSON.stringify(header));

      const docPreviews: (string | null)[] = [];
      for (const doc of advanceInvoiceDocuments) {
        if (doc.file) {
          formData.append("invDocFiles", doc.file);
          docPreviews.push(doc.previewUrl || null);
        }
      }
      formData.append("docPreviews", JSON.stringify(docPreviews));

      const res = await apiRequest("POST", "/api/invoices/raise-po-advance", formData);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: "Failed to submit advance invoice" }));
        throw new Error(errData.error || errData.message || "Failed to submit advance invoice");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Advance Invoice Submitted",
        description: "Advance invoice has been submitted successfully for approval.",
      });
      setIsAdvanceInvoiceOpen(false);
      setAgreeToTermsAdvance(false);
      setAdvanceInvoiceDocuments([]);
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poNumber] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poNumber, "invoices"] });

      // Navigate to the newly created invoice page if ID is returned
      if (data?.invoiceId) {
        navigate(`/app/invoices/${data.invoiceId}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Notes query for collaboration panel
  const { data: notesData, isLoading: notesLoading } = useQuery<{
    notes: string;
  }>({
    queryKey: ["/api/purchase-orders", poNumber, "notes"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${poNumber}/notes`);
      if (!res.ok) return { notes: "" };
      return res.json();
    },
    enabled: !!poNumber,
  });

  // Notes save handler for collaboration panel
  const handleSaveNotes = async (notes: string) => {
    await apiRequest("PUT", `/api/purchase-orders/${poNumber}/notes`, {
      notes,
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/purchase-orders", poNumber, "notes"],
    });
  };

  const [budgetValidation, setBudgetValidation] = useState<{
    isWithinBudget: boolean;
    totalAmount: number;
    departmentBudget: number;
    warnings: string[];
    severity: "low" | "medium" | "high";
  } | null>(null);

  const budgetCheckMutation = useMutation({
    mutationFn: async () => {
      const matchingBudgetLine = editBudgetLines.find(
        (bl) => String(bl.id) === String(po?.budget_segment),
      );
      const res = await apiRequest(
        "POST",
        "/api/purchase-requests/ai/validate-budget",
        {
          department: po?.department_name || "",
          totalAmount: totalAmount,
          title: po?.po_description || po?.po_number || "",
          budgetLineId: matchingBudgetLine?.id ?? null,
          currency: po?.po_currency || "",
          fromPR: po?.pr_number ? true : false,
          prNumber: po?.pr_number || "",
          fromBid: po?.bid_award_id ? true : false,
          bidAwardId: po?.bid_award_id || "",
        },
      );
      return res.json();
    },
    onSuccess: (data: any) => {
      setBudgetValidation(data);
      if (data.warnings?.length === 0) {
        toast({
          title: "Budget Check Passed",
          description: "This PO is within budget limits.",
        });
      } else {
        toast({
          title: data.isWithinBudget ? "Budget Check Warning" : "Budget Check Failed",
          description: data.warnings?.[0] || "This PO exceeds budget limits.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Budget Check Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete PO mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/purchase-orders/${poNumber}`);
    },
    onSuccess: () => {
      toast({
        title: "PO Deleted",
        description: "Purchase order has been deleted successfully.",
      });
      navigate("/app/purchase-orders");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete PO",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUpdatePOLine = () => {
    if (editForm.advanceFlag && (editForm.advancePercentage === null || editForm.advancePercentage === undefined || editForm.advancePercentage === "" || !editForm.advancePercentage)) {
      toast({
        title: "Validation Failure",
        description:
          "Please add Advance Percentage to Continue!",
        variant: "destructive",
      });
      return;
    }
    editMutation.mutate(editForm);
  }

  // Edit PO mutation
  const editMutation = useMutation({
    mutationFn: async (formData: typeof editForm) => {
      await apiRequest("PUT", `/api/purchase-orders/${poNumber}`, formData);
    },
    onSuccess: () => {
      toast({
        title: "PO Updated",
        description: "Purchase order has been updated successfully.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      setBudgetValidation(null);
      setIsEditOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update PO",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Submit for approval mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/purchase-orders/${poNumber}/submit`);
    },
    onSuccess: () => {
      toast({
        title: "PO Submitted",
        description: "Purchase order has been submitted for approval.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      setSubmitConfirmOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit PO",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelPoMutation = useMutation({
    mutationFn: async () => {
      if (!poNumber) throw new Error("Missing PO number");
      const res = await apiRequest(
        "POST",
        `/api/purchase-orders/${poNumber}/cancel`,
        {},
      );
      return parseJsonResponse<{ message?: string }>(res);
    },
    onSuccess: (data) => {
      toast({
        title: "PO Cancelled",
        description:
          data?.message || "Purchase order cancelled and budget released.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      const linkedPr = po?.pr_number?.trim();
      if (linkedPr) {
        queryClient.invalidateQueries({
          queryKey: [`/api/requisitions/${linkedPr}`],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/requisitions"] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to cancel PO",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSupplierPoStatusMutation = useMutation({
    mutationFn: async (vars: { status: string; comments: string }) => {
      if (!poNumber) throw new Error("Missing PO number");
      const res = await apiRequest(
        "POST",
        "/api/purchase-orders/updatePOSuppStatus",
        {
          poNumber,
          status: vars.status,
          comments: vars.comments,
        },
      );
      return parseJsonResponse<{ message?: string }>(res);
    },
    onSuccess: (data) => {
      toast({
        title: "Response recorded",
        description: data?.message || "Request processed successfully",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      setSupplierRejectDialogOpen(false);
      setSupplierRejectComments("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update PO",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get current user info from localStorage (same pattern as invoice-detail)
  const authData =
    typeof window !== "undefined"
      ? localStorage.getItem("prokraya-auth")
      : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const currentUserId = authParsed?.userId || null;
  const isVendorUser = authParsed?.role === "vendor";
  const isSuperadmin = authParsed?.userRole === "ROLE_SUPERADMIN" || authParsed?.userRole === "ROLE_SYSADMIN";
  const userOrgIds: string[] = authParsed?.orgIds
    ? authParsed.orgIds.split(",").map((id: string) => id.trim())
    : [];

  const isPoRequestor =
    !isVendorUser &&
    !!po?.po_owner_id &&
    String(currentUserId) === String(po.po_owner_id);

  const { data: currentUserProfile } = useQuery<{
    user_name?: string;
    email_id?: string;
    roles?: { role_name: string }[];
  }>({
    queryKey: ["/api/profile", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return null;
      const res = await apiRequest("GET",
        `/api/profile/${encodeURIComponent(currentUserId)}`,
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentUserId,
  });

  const isOwner = (() => {
    if (!po || !authParsed) return false;
    const creator = po.created_by?.toLowerCase();
    if (!creator) return true; // Default to true for legacy data
    const currentUserIdentifiers = [
      authParsed.userName?.toLowerCase(),
      authParsed.email?.toLowerCase(),
      currentUserProfile?.user_name?.toLowerCase(),
      currentUserProfile?.email_id?.toLowerCase()
    ].filter(Boolean);
    return currentUserIdentifiers.includes(creator);
  })();

  const isBuyer = (() => {
    if (!po || !authParsed) return false;
    const creator = po.buyer_email?.toLowerCase();
    if (!creator) return true; // Default to true for legacy data
    const currentUserIdentifiers = [
      authParsed.userName?.toLowerCase(),
      authParsed.email?.toLowerCase(),
      currentUserProfile?.user_name?.toLowerCase(),
      currentUserProfile?.email_id?.toLowerCase()
    ].filter(Boolean);
    return currentUserIdentifiers.includes(creator);
  })();

  const userRoleNames =
    currentUserProfile?.roles?.map((r) => r.role_name) || [];

  // Fetch task details - use taskId from sessionStorage OR from activeTask auto-detection
  const effectiveTaskId = taskId || activeTask?.id_ || null;

  const { data: taskDetails } = useQuery<{
    assignee_: string | null;
    id_: string;
  }>({
    queryKey: ["/api/workflow-engine/task", effectiveTaskId],
    queryFn: async () => {
      if (!effectiveTaskId) return null;
      const res = await apiRequest("GET",
        `/api/workflow-engine/task/${encodeURIComponent(effectiveTaskId)}`,
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!effectiveTaskId,
  });

  // Check if current user can approve this task (same pattern as invoice-detail)
  const canApprove = (() => {
    if (!taskId || !taskDetails) return false;

    const currentOwner = taskDetails.assignee_;
    if (!currentOwner) return false;

    // Super-admin can approve any task (backend shows all tasks to them)
    const isSuperAdmin = userRoleNames.some(
      (r) => r === "ROLE_SUPERADMIN" || r === "ROLE_SYSADMIN"
    );
    if (isSuperAdmin) return true;

    // If current owner is a role, check if user has that role
    if (ROLE_NAMES.some((role) => currentOwner.toUpperCase() === role)) {
      return userRoleNames.includes(currentOwner);
    }

    // If current owner is a user, check if it matches current user's email or username
    const currentUserIdentifiers = [
      currentUserProfile?.user_name?.toLowerCase(),
      currentUserProfile?.email_id?.toLowerCase(),
    ].filter(Boolean);

    return currentUserIdentifiers.includes(currentOwner.toLowerCase());
  })();

  // Approval mutation
  const approvalMutation = useMutation({
    mutationFn: async (data: { action: string; remarks: string }) => {
      //const storedTaskId = sessionStorage.getItem("currentTaskId");
      const approvalTaskId = po?.attribute_12 !== undefined && po?.attribute_12 !== null
        ? po?.attribute_12
        : sessionStorage.getItem("currentTaskId");
      // For ReSubmit, use attribute_12 to store original taskId of the approval task
      return apiRequest(
        "POST",
        `/api/purchase-orders/${poNumber}/process-approval`,
        {
          taskId: approvalTaskId,
          result: data.action,
          comments: data.remarks,
        },
      );
    },
    onSuccess: (_, variables) => {
      const actionMessages: Record<string, string> = {
        Approve: "Purchase order has been approved.",
        Reject: "Purchase order has been rejected.",
        More: "Request for more information has been sent.",
      };
      toast({
        title:
          variables.action === "Approve"
            ? "PO Approved"
            : variables.action === "Reject"
              ? "PO Rejected"
              : variables.action === "More"
                ? "returned for more information"
                : variables.action === "ReSubmit"
                  ? "resubmit"
                  : "More Info Requested",
        description:
          actionMessages[variables.action] || "Action completed successfully.",
        duration: 5000,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
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
        duration: 5000,
      });
      // Force cleanup even on error
      document.body.style.pointerEvents = "auto";
    },
  });

  const delegateActionMutation = useMutation({
    mutationFn: async (data: { userName: string; comments: string }) => {
      const approvalTaskId = po?.attribute_12 !== undefined && po?.attribute_12 !== null
        ? po?.attribute_12
        : sessionStorage.getItem("currentTaskId");
      return apiRequest("POST", "/api/workflow/delegate-request", {
        taskId: approvalTaskId,
        userName: data.userName,
        comments: data.comments,
        entityId: poNumber,
        module: "PO",
      });
    },
    onSuccess: () => {
      toast({
        title: "Request Delegated",
        description: "Purchase order approval has been delegated.",
        duration: 5000,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
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
        duration: 5000,
      });
      document.body.style.pointerEvents = "auto";
    },
  });

  // Modal Janitor - Forcefully restores interactivity when all known modally-interactive components are closed
  useEffect(() => {
    const isAnyModalOpen =
      submitConfirmOpen ||
      reSubmitConfirmOpen ||
      approvalDialogOpen ||
      isDNOpen ||
      isReceiptOpen ||
      isEditOpen;

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

          console.log("PO Modal Janitor: DOM Cleanup completed.");
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [
    submitConfirmOpen,
    reSubmitConfirmOpen,
    approvalDialogOpen,
    isDNOpen,
    isReceiptOpen,
    isEditOpen
  ]);

  // Check PO status
  // const isDraft = po?.po_status === "Draft";
  // const isPendingApproval = po?.po_status?.toLowerCase() === "pending approval";
  // const isMoreInfoRequired = po?.po_status?.toLowerCase() === "more info required";
  // const isApproved = po?.po_status?.toLowerCase() === "approved";
  // const isRejected = po?.po_status?.toLowerCase() === "rejected";
  // const isCancelled = po?.po_status?.toLowerCase() === "cancelled";
  // const isComplete = po?.po_status?.toLowerCase() === "complete";
  // const isClosed = po?.po_status?.toLowerCase() === "closed";

  const supplierPoAck = (po?.attribute_13 ?? "").trim();
  const showSupplierAckDropdown =
    isVendorUser && isApproved && supplierPoAck === "";
  const supplierAcceptedPo = supplierPoAck.toLowerCase() === "accept";

  const editFilteredVendors = editVendors.filter((v) => {
    const name = v.companyName || v.company_name || "";
    return name.toLowerCase().includes(editVendorSearch.toLowerCase());
  });

  // Initialize edit form when sheet opens
  const handleOpenEdit = () => {
    if (po) {
      setEditForm({
        description: po.po_description || "",
        deliveryLocation: po.delivertto_location_id
          ? String(po.delivertto_location_id)
          : "",
        requiredDate: po.po_required_date
          ? po.po_required_date.split("T")[0]
          : "",
        requestorId:
          po.po_owner_id && Number(po.po_owner_id) !== 0
            ? String(po.po_owner_id)
            : "",
        requestorName: po.po_owner_name || "",
        requestorDepartment: (() => {
          if (!po.department_name) return "";
          const matched = editDepartments.find(
            (d) =>
              d.value?.toLowerCase() === po.department_name?.toLowerCase(),
          );
          return matched ? String(matched.id) : "";
        })(),
        orgId: po.org_id ? String(po.org_id) : "",
        supplierId:
          po.supplier_id && Number(po.supplier_id) !== 0
            ? String(po.supplier_id)
            : "",
        supplierName: po?.supplier?.supplier_name || po.company_name || "",
        budgetId: (() => {
          if (po.budget_name && editBudgetLines.length > 0) {
            const match = editBudgetLines.find(
              (bl) =>
                String(bl.id) === String(po?.budget_segment),
            );
            return match ? String(match.id) : "";
          }
          return "";
        })(),
        budgetName: po.budget_name || "",
        currency: po.po_currency || "AED",
        paymentTermsId:
          po.po_payment_terms_id && Number(po.po_payment_terms_id) !== 0
            ? String(po.po_payment_terms_id)
            : "",
        paymentTermsName: po.payment_terms_name || "",
        notes: po.po_notes || "",
        advanceFlag: po.advance_flag === "Y",
        advancePercentage: po.advance_percentage
          ? String(po.advance_percentage)
          : "",
      });
      setEditVendorSearch("");
      setEditVendorDropdownOpen(false);
    }
    setIsEditOpen(true);
  };

  const calculateInclusiveLineValues = (lineData: typeof newLineItem) => {
    const qty = parseFloat(lineData.quantity) || 1;
    const lineTotal = parseFloat(lineData.inclusiveTaxAmt) || 0;
    const taxRate = parseFloat(lineData.taxRate) || 0;
    const taxAmount = (lineTotal * taxRate) / 100;
    const netAmount = Math.max(0, lineTotal - taxAmount);
    const unitPrice = qty > 0 ? netAmount / qty : 0;
    const lineCost = netAmount;

    return { unitPrice, lineCost, taxAmount };
  };

  // Add line item mutation
  const addLineMutation = useMutation({
    mutationFn: async (lineData: typeof newLineItem) => {
      const qty = parseFloat(lineData.quantity) || 1;
      const taxRate = parseFloat(lineData.taxRate) || 0;
      const isInclusivePo = po?.tax_included === "Yes";
      let unitPrice = parseFloat(lineData.unitPrice) || 0;
      let lineCost = Math.max(0, (qty * unitPrice) - (qty * (parseFloat(lineData.discount) || 0)));
      let taxAmount = lineCost * (taxRate / 100);

      if (isInclusivePo) {
        const inclusiveValues = calculateInclusiveLineValues(lineData);
        unitPrice = inclusiveValues.unitPrice;
        lineCost = inclusiveValues.lineCost;
        taxAmount = inclusiveValues.taxAmount;
      }

      return apiRequest("POST", `/api/purchase-orders/${poNumber}/lines`, {
        description: lineData.description,
        quantity: qty,
        discount: parseFloat(lineData.discount) || 0,
        unitPrice: unitPrice,
        uom: lineData.uom,
        taxRate: taxRate,
        taxCode: lineData.taxCode,
        taxAmount: taxAmount,
        lineCost: lineCost,
        categoryCode: lineData.categoryCode || null,
        categoryName: lineData.categoryName || null,
        itemId: lineData.itemId || null,
        itemName: lineData.itemName || null,
        taxId: lineData.taxId || null,
      });
    },
    onSuccess: () => {
      toast({
        title: "Line item added",
        description: "New line item has been added to the PO.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      setBudgetValidation(null);
      setAddLineSheetOpen(false);
      setItemEntryMode("master");
      setNewLineItem({
        description: "",
        quantity: "1",
        discount: "0",
        unitPrice: "",
        uom: "Each",
        taxRate: "0",
        taxCode: "",
        categoryCode: "",
        categoryName: "",
        itemId: "",
        itemName: "",
        taxId: "",
        inclusiveTaxAmt: ""
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add line item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Edit line item mutation
  const editLineMutation = useMutation({
    mutationFn: async (lineData: typeof newLineItem & { lineId: number }) => {
      const qty = parseFloat(lineData.quantity) || 1;
      const taxRate = parseFloat(lineData.taxRate) || 0;
      const isInclusivePo = po?.tax_included === "Yes";
      let unitPrice = parseFloat(lineData.unitPrice) || 0;
      let lineCost = Math.max(0, (qty * unitPrice) - (qty * (parseFloat(lineData.discount) || 0)));
      let taxAmount = lineCost * (taxRate / 100);

      if (isInclusivePo) {
        const inclusiveValues = calculateInclusiveLineValues(lineData);
        unitPrice = inclusiveValues.unitPrice;
        lineCost = inclusiveValues.lineCost;
        taxAmount = inclusiveValues.taxAmount;
      }

      return apiRequest(
        "PUT",
        `/api/purchase-orders/${poNumber}/lines/${lineData.lineId}`,
        {
          description: lineData.description,
          quantity: qty,
          discount: parseFloat(lineData.discount) || 0,
          unitPrice: unitPrice,
          uom: lineData.uom,
          taxRate: taxRate,
          taxCode: lineData.taxCode,
          taxAmount: taxAmount,
          lineCost: lineCost,
          categoryCode: lineData.categoryCode || null,
          categoryName: lineData.categoryName || null,
          itemId: lineData.itemId || null,
          itemName: lineData.itemName || null,
          taxId: lineData.taxId || null,
        },
      );
    },
    onSuccess: () => {
      toast({
        title: "Line item updated",
        description: "Line item has been updated.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      setBudgetValidation(null);
      setAddLineSheetOpen(false);
      setEditingLineId(null);
      setItemEntryMode("master");
      setNewLineItem({
        description: "",
        quantity: "1",
        discount: "0",
        unitPrice: "",
        uom: "Each",
        taxRate: "0",
        taxCode: "",
        categoryCode: "",
        categoryName: "",
        itemId: "",
        itemName: "",
        taxId: "",
        inclusiveTaxAmt: ""
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update line item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete line item mutation
  const deleteLineMutation = useMutation({
    mutationFn: async (lineId: number) => {
      return apiRequest(
        "DELETE",
        `/api/purchase-orders/${poNumber}/lines/${lineId}`,
      );
    },
    onSuccess: () => {
      toast({ title: "Line item deleted" });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
      setBudgetValidation(null);
      setDeleteLineConfirmOpen(false);
      setLineToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete line item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: uomData } = useQuery<{ id: number; description: string }[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: addLineSheetOpen || isLinesImportOpen,
  });
  const uomOptions = uomData || [];

  const updateTaxIncludedMethod = (value: string) => {
    updateTaxMutation.mutate(value);
  }

  const updateTaxMutation = useMutation({
    mutationFn: async (data: string) => {
      return apiRequest("PUT", `/api/purchase-orders/${poNumber}/update-tax-included`, {
        taxIncluded: data
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Tax Included updated successfully",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/purchase-orders", poNumber],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update Tax Included",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler for opening add line sheet
  const handleOpenAddLine = () => {
    setEditingLineId(null);
    setNewLineItem({
      description: "",
      quantity: "1",
      discount: "0",
      unitPrice: "",
      uom: "Each",
      taxRate: "0",
      taxCode: taxCodes.filter((t) => Number(t.tax_rate) === Number(0))[0]?.tax_code,
      categoryCode: "",
      categoryName: "",
      itemId: "",
      itemName: "",
      taxId: String(taxCodes.filter((t) => Number(t.tax_rate) === Number(0))[0]?.id),
      inclusiveTaxAmt: ""
    });
    setAddLineSheetOpen(true);
  };

  const validateLinesImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("POST", `/api/purchase-orders/${poNumber}/lines/bulk-import/validate`, formData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Validation failed" }));
        throw new Error(err.error || "Validation failed");
      }
      return response.json();
    },
    onSuccess: (data) => { setLinesImportPreview(data); },
    onError: (error: Error) => {
      toast({ title: "Validation failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkImportLinesMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("POST", `/api/purchase-orders/${poNumber}/lines/bulk-import`, formData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error || "Import failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setLinesImportPreview(null);
      setLinesImportResults(data);
      setLinesImportFile(null);
      if (data.created > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poNumber] });
        toast({ title: "Import complete", description: `${data.created} line${data.created !== 1 ? "s" : ""} created${data.errors > 0 ? `, ${data.errors} failed` : ""}` });
      } else {
        toast({ title: "Import failed", description: "No lines were created", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  // Handler for submitting line item form
  const handleSubmitLine = () => {
    // Validate based on entry mode
    if (itemEntryMode === "master") {
      if (!newLineItem.itemId) {
        toast({
          title: "Please select an item from the catalog",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Free text mode
      if (!newLineItem.categoryCode) {
        toast({ title: "Please select a category", variant: "destructive" });
        return;
      }
      if (!newLineItem.description.trim()) {
        toast({ title: "Description is required", variant: "destructive" });
        return;
      }
    }
    const qty = parseFloat(newLineItem.quantity);
    if (!newLineItem.quantity || isNaN(qty) || qty < 1) {
      toast({ title: "Quantity must be at least 1", variant: "destructive" });
      return;
    }

    const isInclusivePo = po?.tax_included === "Yes";
    if (isInclusivePo) {
      const lineTotal = parseFloat(newLineItem.inclusiveTaxAmt);
      if (!newLineItem.inclusiveTaxAmt || isNaN(lineTotal) || lineTotal <= 0) {
        toast({ title: "Line total must be at least 1", variant: "destructive" });
        return;
      }
      if (!newLineItem.taxRate || isNaN(parseFloat(newLineItem.taxRate))) {
        toast({ title: "Tax rate is required", variant: "destructive" });
        return;
      }
    } else {
      const price = parseFloat(newLineItem.unitPrice);
      if (!newLineItem.unitPrice || isNaN(price) || price === 0) {
        toast({ title: "Unit price must be at least 1", variant: "destructive" });
        return;
      }
    }

    if (editingLineId) {
      editLineMutation.mutate({ ...newLineItem, lineId: editingLineId });
    } else {
      addLineMutation.mutate(newLineItem);
    }
  };

  const handleCopyPoNumber = () => {
    if (poNumber) {
      navigator.clipboard.writeText(poNumber);
      toast({ title: "PO Number copied to clipboard" });
    }
  };

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

  // Real attachment upload/view/delete for the "Upload Document" card — reuses
  // the same /api/purchase-orders/:poNumber/documents endpoints the
  // CollaborationPanel below already calls for this same PO. Declared above
  // the isLoading early-return so these hooks always run (Rules of Hooks).
  const poDocumentsUrl = `/api/purchase-orders/${poNumber}/documents`;
  const { data: poDocumentsData } = useQuery<
    { id: number; file_name: string; file_path: string; created_by: string; created_date: string }[]
  >({
    queryKey: [poDocumentsUrl],
    enabled: !!poNumber,
  });
  const poDocuments = poDocumentsData || [];
  const uploadDocInputRef = useRef<HTMLInputElement>(null);

  const uploadPoDocumentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(poDocumentsUrl, {
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
      queryClient.invalidateQueries({ queryKey: [poDocumentsUrl] });
      toast({ title: "Document added", description: "Document has been attached to this purchase order." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add document", description: error.message, variant: "destructive" });
    },
  });

  const handleViewPoDocument = async (doc: { id: number; file_name: string }) => {
    try {
      const res = await fetch(`${poDocumentsUrl}/${doc.id}/download`, {
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

  const deletePoDocumentMutation = useMutation({
    mutationFn: async (docId: number) => apiRequest("DELETE", `${poDocumentsUrl}/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [poDocumentsUrl] });
      toast({ title: "Document deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete document", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">
              Purchase Order Not Found
            </h2>
            <p className="text-muted-foreground mb-4">
              The purchase order {poNumber} could not be found.
            </p>
            <Button
              variant="outline"
              onClick={() => navigate("/app/purchase-orders")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Purchase Orders
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAmount = po.po_total_cost || 0;
  const netAmount = po.po_net_cost || totalAmount;
  const taxAmount = po.po_tax || 0;
  const downloadTemplate = async () => {
    try {
      const response = await fetch(
        `/api/purchase-orders/${poNumber}/lines/bulk-import/template`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to download template");
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "po_line_items_template.xlsx";

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    }
  };
  return (
    <div className="flex h-full">
      <div
        className={`flex-1 min-w-0 overflow-y-auto p-4 space-y-4 transition-all duration-300`}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate("/app/purchase-orders")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className="text-xl font-semibold"
                  data-testid="text-po-number"
                >
                  {po.po_number}
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCopyPoNumber}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <StatusBadge status={po.po_status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {po.po_type || "STANDARD"} Purchase Order
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(isDraft && (isBuyer || isSuperadmin)) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    data-testid="button-delete-po"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this purchase order?
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-delete-cancel">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-delete-confirm"
                    >
                      {deleteMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      )}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {(isDraft && (isBuyer || isSuperadmin)) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenEdit}
                  data-testid="button-edit-po"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>

                {isAIEnabled("AI_BUDGET_VALIDATION") && po.items && po.items.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => budgetCheckMutation.mutate()}
                    disabled={budgetCheckMutation.isPending}
                  >
                    {budgetCheckMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Wallet className="h-4 w-4 mr-2" />
                    )}
                    {budgetCheckMutation.isPending ? "Checking..." : "Check Budget"}
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => {
                    if (!po.items || po.items.length === 0) {
                      toast({
                        title: "Cannot submit PO",
                        description:
                          "Please add at least one line item before submitting for approval.",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (parseFloat(String(totalAmount)) <= 0) {
                      toast({
                        title: "Cannot submit PO",
                        description:
                          "Purchase order amount must be greater than zero.",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (isAIEnabled("AI_BUDGET_VALIDATION") && po.budget_name) {
                      if (!budgetValidation) {
                        toast({
                          title: "Budget check required",
                          description:
                            "Please run the budget check before submitting this PO for approval.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!budgetValidation.isWithinBudget) {
                        toast({
                          title: "Cannot submit — over budget",
                          description:
                            "This PO exceeds the available budget. Please adjust the PO or contact your budget owner.",
                          variant: "destructive",
                          duration: 6000,
                        });
                        return;
                      }
                    }

                    setSubmitConfirmOpen(true);
                  }}
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-approval"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Submit for Approval
                </Button>
              </>
            )}

            {((po.po_status === "More Info Required" || po.po_status?.toLowerCase() === "more info required" || po.po_status?.toLowerCase() === "more" || po.po_status === "More Information Required") && (isOwner || isSuperadmin)) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenEdit}
                  data-testid="button-edit-po"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                {isAIEnabled("AI_BUDGET_VALIDATION") && po.items && po.items.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => budgetCheckMutation.mutate()}
                    disabled={budgetCheckMutation.isPending}
                  >
                    {budgetCheckMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Wallet className="h-4 w-4 mr-2" />
                    )}
                    {budgetCheckMutation.isPending ? "Checking..." : "Check Budget"}
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => {
                    if (!po.items || po.items.length === 0) {
                      toast({
                        title: "Cannot submit PO",
                        description:
                          "Please add at least one line item before submitting for approval.",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (parseFloat(String(totalAmount)) <= 0) {
                      toast({
                        title: "Cannot submit PO",
                        description:
                          "Purchase order amount must be greater than zero.",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (isAIEnabled("AI_BUDGET_VALIDATION") && po.budget_name) {
                      if (!budgetValidation) {
                        toast({
                          title: "Budget check required",
                          description:
                            "Please run the budget check before submitting this PO for approval.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!budgetValidation.isWithinBudget) {
                        toast({
                          title: "Cannot submit — over budget",
                          description:
                            "This PO exceeds the available budget. Please adjust the PO or contact your budget owner.",
                          variant: "destructive",
                          duration: 6000,
                        });
                        return;
                      }
                    }

                    setReSubmitConfirmOpen(true);
                  }}
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-approval"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Re-Submit for Approval
                </Button>
              </>
            )}
            {/* Approval Actions Button - Only visible for Pending Approval status and authorized users */}
            {isPendingApproval && (canApprove || isSuperadmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="button-approve">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      resolveApprovalChecklistAvailability("Purchase Order").then((available) => {
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

            {/* Supplier must Accept/Reject approved PO before DN/Invoice (attribute_13) */}
            {showSupplierAckDropdown && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={updateSupplierPoStatusMutation.isPending}
                    data-testid="button-supplier-po-response"
                  >
                    {updateSupplierPoStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Accept / Reject
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      updateSupplierPoStatusMutation.mutate({
                        status: "Accept",
                        comments: "",
                      });
                    }}
                    className="text-green-600 dark:text-green-400"
                    data-testid="menu-item-supplier-accept-po"
                  >
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Accept
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setSupplierRejectDialogOpen(true);
                    }}
                    className="text-red-600 dark:text-red-400"
                    data-testid="menu-item-supplier-reject-po"
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Reject
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Approved PO Actions - Raise DN and Raise Invoice only for vendor users after Accept */}
            {isApproved && (
              <>
                <ViewChecklistButton moduleName="Purchase Order" refNumber={poNumber} />
                {((isVendorUser && supplierAcceptedPo) || isSuperadmin) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDnForm({
                        asn_number: "",
                        bill_of_landing: "",
                        carrier: "",
                        ship_date: "",
                        expected_arrival_date: "",
                        ship_to: po?.delivertto_location_name || "",
                        ship_from: po?.supplier?.supplier_name || "",
                      });
                      setIsDNOpen(true);
                    }}
                    data-testid="button-raise-dn"
                  >
                    <Truck className="h-4 w-4 mr-2" />
                    Raise DN
                  </Button>
                )}
                {(isPoRequestor || isSuperadmin) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={deliveryNotes.length === 0 ? 0 : undefined}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deliveryNotes.length === 0}
                          onClick={() => {
                            setReceiptForm({
                              receipt_date: "",
                              receipt_number: "",
                              receipt_notes: "",
                              received_location: po?.delivertto_location_name || "",
                            });
                            setIsReceiptOpen(true);
                          }}
                          data-testid="button-raise-receipt"
                        >
                          <Receipt className="h-4 w-4 mr-2" />
                          Raise Receipt
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {deliveryNotes.length === 0 && (
                      <TooltipContent>
                        A Delivery Note must be raised before creating a receipt
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
                {((isVendorUser && supplierAcceptedPo) || isSuperadmin) &&
                  po.advance_flag === "Y" &&
                  canRaiseAdvance && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!enabled}
                      onClick={() => {
                        const totalCost = Number(po.po_total_cost) || 0;
                        const advPct = Number(po.advance_percentage) || 0;
                        const advAmt = (totalCost * advPct) / 100;

                        const today = new Date().toISOString().split("T")[0];
                        const dueDate = getDueDateFormatted(today, po?.payment_terms_name) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

                        setAdvanceInvoiceForm({
                          invoice_description: "",
                          invoice_number: "",
                          invoice_date: today,
                          invoice_due_date: dueDate,
                          invoice_amount: advAmt,
                        });
                        setAgreeToTermsAdvance(false);
                        setAdvanceInvoiceDocuments([]);
                        setIsAdvanceInvoiceOpen(true);
                      }}
                      data-testid="button-advance-invoice"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Advance Invoice
                    </Button>
                  )}
                {((isVendorUser && supplierAcceptedPo) || isSuperadmin) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const openReceipts = grns.filter(
                        (g) => g.status !== "Invoice Submitted",
                      );
                      if (openReceipts.length === 0) {
                        toast({
                          title: "No Open Receipts",
                          description:
                            "All receipts already have invoices submitted. No open receipts available to raise an invoice.",
                          variant: "destructive",
                        });
                        return;
                      }
                      const today = new Date().toISOString().split("T")[0];
                      const dueDate = getDueDateFormatted(today, po?.payment_terms_name) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                      setInvoiceForm({
                        invoice_description: "",
                        invoice_number: "",
                        invoice_type: "Standard",
                        invoice_date: today,
                        invoice_due_date: dueDate,
                        invoice_notes: "",
                      });
                      setAgreeToTerms(false);
                      setIsInvoiceOpen(true);
                    }}
                    data-testid="button-raise-invoice"
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    Raise Invoice
                  </Button>
                )}
              </>
            )}

            {/* Complete PO Actions */}
            {isComplete && ((isVendorUser && supplierAcceptedPo) || isSuperadmin) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const openReceipts = grns.filter(
                    (g) => g.status !== "Invoice Submitted",
                  );
                  if (openReceipts.length === 0) {
                    toast({
                      title: "No Open Receipts",
                      description:
                        "All receipts already have invoices submitted. No open receipts available to raise an invoice.",
                      variant: "destructive",
                    });
                    return;
                  }
                  const today = new Date().toISOString().split("T")[0];
                  const dueDate = getDueDateFormatted(today, po?.payment_terms_name) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                  setInvoiceForm({
                    invoice_description: "",
                    invoice_number: "",
                    invoice_type: "Standard",
                    invoice_date: today,
                    invoice_due_date: dueDate,
                    invoice_notes: "",
                  });
                  setAgreeToTerms(false);
                  setIsInvoiceOpen(true);
                }}
                data-testid="button-raise-invoice-complete"
              >
                <FileCheck className="h-4 w-4 mr-2" />
                Raise Invoice
              </Button>
            )}

            {/* Copy button - Visible for Approved, Rejected, Cancelled, Complete and Closed POs (internal users only) */}
            {!isVendorUser &&
              (isApproved ||
                isRejected ||
                isCancelled ||
                isComplete ||
                isClosed) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await apiRequest("POST", `/api/purchase-orders/${poNumber}/copy`);
                      const result = await res.json();
                      toast({
                        title: "PO Copied",
                        description: `New draft PO ${result.poNumber} created successfully.`,
                        duration: 5000,
                      });
                      navigate(`/app/purchase-orders`);
                    } catch (error: any) {
                      toast({
                        title: "Failed to copy PO",
                        description: error.message || "An error occurred",
                        variant: "destructive",
                        duration: 5000,
                      });
                    }
                  }}
                  data-testid="button-copy-po"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              )}

            {/* Cancel button - Visible for Approved and Rejected POs (internal users only) */}
            {(!isVendorUser || isSuperadmin) && (isApproved || isRejected) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    data-testid="button-cancel-po"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Purchase Order</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel this purchase order? This
                      will mark it as cancelled.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-po-dismiss">
                      Dismiss
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelPoMutation.mutate()}
                      disabled={cancelPoMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-cancel-po-confirm"
                    >
                      {cancelPoMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Cancel PO
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Download PO PDF - Available for all statuses except Draft */}
            {po && !isDraft && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => generatePOPdf(po, orgDetails)}
                aria-label="Download PO PDF"
                data-testid="button-download-po-pdf"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}

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

        <AlertDialog
          open={supplierRejectDialogOpen}
          onOpenChange={setSupplierRejectDialogOpen}
        >
          <AlertDialogContent data-testid="dialog-supplier-reject-po">
            <AlertDialogHeader>
              <AlertDialogTitle>Reject purchase order</AlertDialogTitle>
              <AlertDialogDescription>
                The PO will be cancelled. You can add an optional note for the
                buyer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Label htmlFor="supplier-reject-comments">Comments</Label>
              <Textarea
                id="supplier-reject-comments"
                className="mt-2"
                rows={3}
                value={supplierRejectComments}
                onChange={(e) => setSupplierRejectComments(e.target.value)}
                placeholder="Reason for rejection (optional)"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-supplier-reject-cancel">
                Cancel
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={updateSupplierPoStatusMutation.isPending}
                onClick={() => {
                  updateSupplierPoStatusMutation.mutate({
                    status: "Reject",
                    comments: supplierRejectComments.trim(),
                  });
                }}
                data-testid="button-supplier-reject-confirm"
              >
                {updateSupplierPoStatusMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Reject PO
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* PO details card */}
          <Card className="break-words">
            <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                PO details
              </CardTitle>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  Created on : {formatDate(po.creation_date)}
                </p>
                <p className="text-xs font-medium text-primary">
                  Total Cost: {formatCurrency(totalAmount, po.po_currency)}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4 pt-4 text-sm">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  PO Description
                </p>
                <div className="rounded-md border px-3 py-2 text-sm min-h-[38px]" data-testid="text-po-description">
                  {po.po_description || "-"}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Issue Date
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    {formatDate(po.po_issue_date)}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Required Date
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    {formatDate(po.po_required_date)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Buyer
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate">
                    <div className="font-medium truncate">{po.buyer_name || "-"}</div>
                    {po.buyer_email && (
                      <div className="text-xs text-muted-foreground truncate">{po.buyer_email}</div>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Owner
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate">
                    <div className="font-medium truncate">{po.po_owner_name || "-"}</div>
                    {po.po_owner_email && (
                      <div className="text-xs text-muted-foreground truncate">{po.po_owner_email}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Department
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate">
                    {po.department_name || "-"}
                  </div>
                </div>
                {po.org_id && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Business Entity
                    </p>
                    <div className="rounded-md border px-3 py-2 text-sm truncate">
                      {organizations.find((o) => o.id === po.org_id)?.organization_name || String(po.org_id)}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Supplier
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    <div className="font-medium truncate">
                      {po.company_name || po.supplier?.supplier_name || "-"}
                    </div>
                    {po.supplier?.email_id && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        {po.supplier.email_id}
                      </div>
                    )}
                    {po.supplier?.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        <Phone className="h-3 w-3 shrink-0" />
                        {po.supplier.phone}
                      </div>
                    )}
                    {(po.supplier?.city || po.supplier?.country) && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {[po.supplier.city, po.supplier.country].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Delivery Location
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate" title={po.delivertto_location_name || undefined}>
                    {po.delivertto_location_name || "-"}
                    {po.shipto_address && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{po.shipto_address}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Payment Terms
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate">
                    {po.payment_terms_name || "-"}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Currency
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    {po.po_currency || "USD"}
                  </div>
                </div>
              </div>

              {po.advance_flag === "Y" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                      Advance Payment
                    </p>
                    <div className="rounded-md border px-3 py-2 text-sm">
                      <Badge variant="secondary" className="text-xs">
                        {po.advance_percentage ? `${po.advance_percentage}%` : "Yes"}
                      </Badge>
                    </div>
                  </div>
                  {po.advance_percentage && po.po_total_cost ? (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                        Advance Amount
                      </p>
                      <div className="rounded-md border px-3 py-2 text-sm">
                        {formatCurrency(
                          String(
                            (parseFloat(String(po.po_total_cost)) *
                              Number(po.advance_percentage)) /
                            100,
                          ),
                          po.po_currency,
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {po.budget_name && !isVendorUser && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Budget
                  </p>
                  {(() => {
                    const matchedBudgetLine = editBudgetLines.find(
                      (bl) => String(bl.id) === String(po?.budget_segment),
                    );
                    const availableAmount = matchedBudgetLine
                      ? Math.max(
                          0,
                          (parseFloat(matchedBudgetLine.amount) || 0) -
                          (parseFloat(matchedBudgetLine.consumed_amount) || 0) -
                          (parseFloat(matchedBudgetLine.reserved_amount) || 0),
                        )
                      : null;
                    const currencySymbol = matchedBudgetLine
                      ? matchedBudgetLine.budget_curr === "INR"
                        ? "₹ "
                        : matchedBudgetLine.budget_curr === "USD"
                          ? "$ "
                          : matchedBudgetLine.budget_curr === "AED"
                            ? "AED "
                            : matchedBudgetLine.budget_curr === "EUR"
                              ? "€ "
                              : matchedBudgetLine.budget_curr === "GBP"
                                ? "£ "
                                : `${matchedBudgetLine.budget_curr} `
                      : "";
                    return (
                      <div className="rounded-md border px-3 py-2 text-sm flex items-center justify-between flex-wrap gap-2">
                        <span className="flex items-center gap-1 truncate">
                          <DollarSign className="h-3 w-3 text-muted-foreground shrink-0" />
                          {po.budget_name}
                        </span>
                        {availableAmount !== null && (
                          <span className="text-xs font-medium text-primary shrink-0">
                            Available - {currencySymbol}
                            {availableAmount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Notes
                </p>
                <Textarea
                  value={po.po_notes || ""}
                  readOnly
                  placeholder="No notes provided"
                  rows={2}
                  className="resize-none bg-muted/30"
                  data-testid="text-po-notes"
                />
              </div>

              {((po.pr_number && !isVendorUser) || po.attribute_5) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                  {po.pr_number && !isVendorUser && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                        Source PR
                      </p>
                      <div className="rounded-md border px-3 py-2 text-sm">
                        <Link href={`/app/requisitions/${po.pr_number}`}>
                          <span className="text-primary hover:underline font-medium">
                            {po.pr_number}
                          </span>
                        </Link>
                      </div>
                    </div>
                  )}
                  {po.attribute_5 && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                        Source Bid
                      </p>
                      <div className="rounded-md border px-3 py-2 text-sm">
                        <Link href={!isVendorUser ? `/app/bids/${po.attribute_6}/view` : `/app/suppbids/${po.attribute_6}/view`}>
                          <span className="text-primary hover:underline font-medium">
                            {po.attribute_5}
                          </span>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Gross Amount
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    {formatCurrency(netAmount, po.po_currency)}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Tax
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    {formatCurrency(taxAmount, po.po_currency)}
                  </div>
                </div>
              </div>
              <div className="rounded-md border px-3 py-2 text-sm flex items-center justify-between bg-primary/5">
                <span className="font-medium">Net Amount</span>
                <span className="font-bold text-lg">
                  {formatCurrency(totalAmount, po.po_currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Right sidebar column */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Status stepper card - includes Receipt/Invoice/Payment sub-status as additional nodes */}
              <Card className="h-full flex flex-col">
                <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
                  <CardTitle className="text-sm">
                    Status - {po.po_status || "Draft"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-4 flex-1">
                  {(() => {
                    // PO lifecycle: Draft -> submitted for approval (Pending
                    // Approval / More Info Required) -> Approved -> Complete
                    // (or Closed). Rejected/Cancelled are terminal off-path
                    // outcomes, shown at the "Submitted" stage with
                    // destructive styling since that is as far as the PO got.
                    const stageLabels = ["Submitted", "Approved", "Complete"];
                    let currentStage = 0;
                    if (isPendingApproval || isMoreInfoRequired) currentStage = 1;
                    if (isApproved) currentStage = 2;
                    if (isComplete || isClosed) currentStage = 3;
                    const isTerminalNegative = isRejected || isCancelled;
                    if (isTerminalNegative) currentStage = 1;

                    const hasFulfillmentStages = !!(po.attribute_8 || po.attribute_9 || po.attribute_10);

                    const fulfillmentStages = [
                      { label: "Receipt", value: po.attribute_8, icon: Truck },
                      { label: "Invoice", value: po.attribute_9, icon: Receipt },
                      { label: "Payment", value: po.attribute_10, icon: Wallet },
                    ];

                    return (
                      <>
                        {stageLabels.map((label, idx) => {
                          const stageNum = idx + 1;
                          const isDone = currentStage > stageNum;
                          const isActive = currentStage === stageNum;
                          const isNegativeActive = isTerminalNegative && isActive;
                          const isLastMainStage = idx === stageLabels.length - 1;
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
                                {(!isLastMainStage || hasFulfillmentStages) && (
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
                                {isNegativeActive && (
                                  <span className="ml-1.5 text-xs">
                                    ({isRejected ? "Rejected" : "Cancelled"})
                                  </span>
                                )}
                              </p>
                            </div>
                          );
                        })}
                        {hasFulfillmentStages && fulfillmentStages.map((stage, idx) => {
                          const value = (stage.value || "").toLowerCase();
                          const isDone = value === "received" || value === "invoiced" || value === "paid";
                          const isPartial = value.startsWith("partially");
                          const isSet = !!stage.value;
                          const Icon = stage.icon;
                          return (
                            <div key={stage.label} className="flex items-start gap-3" data-testid={`fulfillment-stage-${stage.label.toLowerCase()}`}>
                              <div className="flex flex-col items-center">
                                <div
                                  className={cn(
                                    "h-9 w-9 rounded-full border-2 flex items-center justify-center shrink-0",
                                    isDone
                                      ? "border-primary"
                                      : isPartial
                                        ? "border-primary/60"
                                        : "border-muted-foreground/40",
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "h-4 w-4 rounded-full flex items-center justify-center",
                                      isDone
                                        ? "bg-primary"
                                        : isPartial
                                          ? "bg-primary/60"
                                          : "bg-muted-foreground/60",
                                    )}
                                  >
                                    <Icon className="h-2.5 w-2.5 text-primary-foreground" />
                                  </div>
                                </div>
                                {idx < fulfillmentStages.length - 1 && (
                                  <div className="w-0 flex-1 min-h-[28px] border-l-2 border-dotted border-primary" />
                                )}
                              </div>
                              <p
                                className={cn(
                                  "text-sm pb-6 mt-2",
                                  isDone || isPartial ? "text-primary font-medium" : "text-muted-foreground",
                                )}
                              >
                                {stage.label}
                                {isSet && (
                                  <span className="ml-1.5 text-xs text-muted-foreground">
                                    ({stage.value})
                                  </span>
                                )}
                              </p>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Upload Document card — real attachments, via the same
                  /api/purchase-orders/:poNumber/documents endpoints the
                  CollaborationPanel below already uses for this PO. */}
              <Card className="h-full flex flex-col">
                <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
                  <CardTitle className="text-sm">Upload Document</CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-4 space-y-1 flex-1">
                  <input
                    ref={uploadDocInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadPoDocumentMutation.mutate(file);
                      e.target.value = "";
                    }}
                    data-testid="input-upload-document"
                  />
                  <button
                    type="button"
                    className="w-full rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center py-3 gap-1.5 text-center hover-elevate disabled:opacity-60"
                    onClick={() => uploadDocInputRef.current?.click()}
                    disabled={uploadPoDocumentMutation.isPending}
                    data-testid="button-upload-document"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      {uploadPoDocumentMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </div>
                    <p className="text-xs font-medium text-primary">Upload Document</p>
                  </button>

                  <div className="pt-1">
                    {poDocuments.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        No documents attached
                      </p>
                    ) : (
                      poDocuments.slice(0, 5).map((doc, i) => (
                        <div
                          key={doc.id}
                          className={cn(
                            "flex items-center justify-between gap-2 py-2 px-1 text-xs",
                            i < Math.min(poDocuments.length, 5) - 1 && "border-b",
                          )}
                          data-testid={`row-document-${doc.id}`}
                        >
                          <span className="truncate text-muted-foreground" title={doc.file_name}>
                            {doc.file_name}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleViewPoDocument(doc)}
                              className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate"
                              data-testid={`button-view-document-${doc.id}`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePoDocumentMutation.mutate(doc.id)}
                              disabled={deletePoDocumentMutation.isPending}
                              className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate disabled:opacity-60"
                              data-testid={`button-delete-document-${doc.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                    {poDocuments.length > 0 && (
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

              {/* Quick actions card — mirrors the header's Submit/Delete/Edit
                  buttons for Draft POs, same handlers as the header versions. */}
              {isDraft && (isBuyer || isSuperadmin) && (
                <Card className="h-full flex flex-col">
                  <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
                    <CardTitle className="text-sm">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 flex-1 flex flex-col gap-3">
                    <Button
                      className="font-semibold"
                      onClick={() => {
                        if (!po.items || po.items.length === 0) {
                          toast({
                            title: "Cannot submit PO",
                            description: "Please add at least one line item before submitting for approval.",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (parseFloat(String(totalAmount)) <= 0) {
                          toast({
                            title: "Cannot submit PO",
                            description: "Purchase order amount must be greater than zero.",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (isAIEnabled("AI_BUDGET_VALIDATION") && po.budget_name) {
                          if (!budgetValidation) {
                            toast({
                              title: "Budget check required",
                              description: "Please run the budget check before submitting this PO for approval.",
                              variant: "destructive",
                            });
                            return;
                          }
                          if (!budgetValidation.isWithinBudget) {
                            toast({
                              title: "Cannot submit — over budget",
                              description: "This PO exceeds the available budget. Please adjust the PO or contact your budget owner.",
                              variant: "destructive",
                              duration: 6000,
                            });
                            return;
                          }
                        }
                        setSubmitConfirmOpen(true);
                      }}
                      disabled={submitMutation.isPending}
                      data-testid="button-submit-approval-sidebar"
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Submit for Approval
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="text-destructive hover:text-destructive border-destructive/40"
                          data-testid="button-delete-po-sidebar"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this purchase order? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-delete-cancel-sidebar">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid="button-delete-confirm-sidebar"
                          >
                            {deleteMutation.isPending && (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            )}
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Button
                      variant="outline"
                      onClick={handleOpenEdit}
                      data-testid="button-edit-po-sidebar"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Purchase Order
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Approval History Section - Hidden for vendor users, only shown when status is not Draft */}
            {!isDraft && (!isVendorUser || po.po_status === "More Info Required" || po.po_status === "More Information Required" || po.po_status?.toLowerCase() === "more") && (
              <Card>
                <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
                  <CardTitle className="text-sm">Approval history</CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-4">
                  <div className="overflow-x-auto w-full pb-1 custom-scrollbar min-w-0">
                  {/* Horizontal Timeline */}
                  <div className="flex items-start min-w-max">
                    {(() => {
                      // Get approval history from database
                      const approvalHistory = po?.approvalHistory || [];

                      // Build timeline
                      const timelineItems: Array<{
                        name: string;
                        email?: string;
                        designation?: string;
                        status: "Approved" | "Rejected" | "More" | "Pending" | "ReSubmit" | "more" | "Delegation" | "Delegated User";
                        date?: string;
                        comments?: string;
                        stepOrder: number;
                        roleName?: string;
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
                          const approverTrimmed = (approval.approver_name || "").trim();
                          const isRole = ROLE_NAMES.some(
                            (role) => approverTrimmed.toUpperCase() === role,
                          );

                          timelineItems.push({
                            name: approval.approver_name || approval.email || formatApproverDisplayName(""),
                            email: approval.email || undefined,
                            designation: approval.designation || undefined,
                            status:
                              (approval.status === "Approve" || approval.status === "approve") ? "Approved" :
                                (approval.status === "Reject" || approval.status === "reject") ? "Rejected" :
                                  (approval.status === "More" || approval.status === "more" || approval.status === "More Info Required") ? "More" :
                                    approval.status === "ReSubmit" || approval.status === "resubmit" ? "ReSubmit" : approval.status === "Delegation" ? "Delegation" : approval.status === "Delegated User" ? "Delegated User" : "Approved",
                            date: formatDate(approval.approved_date) || undefined,
                            comments: approval.comments || undefined,
                            stepOrder: index + 1,
                            roleName: isRole ? approverTrimmed : undefined,
                          });
                        });

                      // 2. Add pending approvers from approvers_list if in a pending state
                      const pendingStatuses = ["Pending Approval", "Pending", "PENDING", "Pending_Approval", "In Approval"];
                      if (po.po_status && pendingStatuses.includes(po.po_status)) {
                        const currentApprovers = po.approvers_list
                          ? po.approvers_list
                            .split(",")
                            .map((a: string) => a.trim())
                            .filter(Boolean)
                          : [];

                        currentApprovers.forEach((approver: string, index: number) => {
                          const approverTrimmed = approver.trim();
                          const isRole = ROLE_NAMES.some(
                            (role) => approverTrimmed.toUpperCase() === role,
                          );

                          timelineItems.push({
                            name: formatApproverDisplayName(approver),
                            status: "Pending",
                            stepOrder: timelineItems.length + 1,
                            roleName: isRole ? approverTrimmed : undefined,
                          });
                        });
                      }

                      if (timelineItems.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground">
                            No approval history available
                          </p>
                        );
                      }

                      return timelineItems.map((item, index, arr) => {
                        const isApproved = item.status === "Approved";
                        const isRejected = item.status === "Rejected";
                        const isMoreInfo = item.status === "More";
                        const isPending = item.status === "Pending";
                        const isResubmit = item.status === "ReSubmit";
                        const isDelegated = (item.status === "Delegation" || item.status === "Delegated User");

                        const statusColor = isApproved
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : isRejected
                            ? "bg-red-500 border-red-500 text-white"
                            : isMoreInfo
                              ? "bg-amber-500 border-amber-500 text-white"
                              : isResubmit
                                ? "bg-blue-500 border-blue-500 text-white"
                                : "bg-muted border-muted-foreground/30 text-muted-foreground";

                        const dotColor = isApproved
                          ? "bg-emerald-500"
                          : isRejected
                            ? "bg-red-500"
                            : isMoreInfo
                              ? "bg-amber-500"
                              : isResubmit
                                ? "bg-blue-500"
                                : "bg-orange-500";

                        const statusLabel = isApproved
                          ? "Approved"
                          : isRejected
                            ? "Rejected"
                            : isMoreInfo
                              ? "More Info"
                              : isResubmit
                                ? "ReSubmit"
                                : isDelegated ? item.status :"Pending";

                        const iconElement = (
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${statusColor} cursor-pointer`}
                          >
                            {isPending ? (
                              <Clock className="h-4 w-4" />
                            ) : isApproved ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : isRejected ? (
                              <XCircle className="h-4 w-4" />
                            ) : (
                              <AlertCircle className="h-4 w-4" />
                            )}
                          </div>
                        );

                        return (
                          <div
                            key={index}
                            className="flex items-start"
                            data-testid={`approval-history-item-${index}`}
                          >
                            {/* Approver Node */}
                            <div className="flex flex-col items-center min-w-[140px] max-w-[160px]">
                              {/* Circle with icon - wrap in tooltip if role-based */}
                              {item.roleName ? (
                                <RoleUsersTooltip roleName={item.roleName}>
                                  {iconElement}
                                </RoleUsersTooltip>
                              ) : (
                                iconElement
                              )}

                              {/* Approver Details */}
                              <div className="mt-1.5 text-center px-1">
                                <p
                                  className="text-xs font-medium truncate max-w-[140px]"
                                  title={item.name}
                                >
                                  {item.name}
                                </p>
                                <div className="flex items-center justify-center gap-1 mt-0.5">
                                  <span
                                    className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`}
                                  />
                                  <span className="text-xs">{statusLabel}</span>
                                </div>
                                {/* Date for completed steps */}
                                {item.date && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {item.date}
                                  </p>
                                )}
                                {/* Comments for completed steps */}
                                {item.comments && (
                                  <p
                                    className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 break-all"
                                    title={item.comments}
                                  >
                                    {item.comments}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Dotted Connector Line */}
                            {index < arr.length - 1 && (
                              <div className="flex items-center h-8">
                                <div
                                  className={`w-10 border-t-2 border-dashed ${isApproved
                                    ? "border-emerald-500"
                                    : "border-muted-foreground/30"
                                    }`}
                                />
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
          </div>
        </div>

        {po?.attribute_2 === "Submitted" ?
          <Card>
            <CardContent className="p-3 text-sm">
              Supplier Performance Feedback
              <div className="rounded-lg border border-[#cfc3ff] bg-[#f8f6ff] p-3 mt-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-amber-500 tracking-wide">
                      {Rating({ rating: Number(po?.data?.[0].star_rate) || 0, showRatingNumber: false })}
                    </span>
                    <span className="text-md font-semibold text-[#4f2cc8]">
                      Exceptional
                    </span>
                    <span className="text-md font-semibold text-[#4f2cc8]">
                      - {po?.data?.[0].attribute_12 || "0"} / 100
                    </span>
                  </div>
                  <span className="text-xs text-[#6b4ce6]">
                    05-06-2026
                  </span>
                </div>
                <p className="mt-2 text-sm italic leading-6 text-[#4f2cc8]">
                  {po?.attribute_15 || "No feedback provided"}.
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Reviewed by <span className="font-medium">{po?.po_owner_name || "NA"}</span>
                  </span>
                  <button className="rounded-md bg-[#5b2fd3] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#4a25b5]" onClick={openSupplierEvaluationResults}>
                    View Full Evaluation
                  </button>
                </div>
              </div>
            </CardContent>
          </Card> : po?.attribute_2 === "Draft" && po?.po_owner_email === authParsed?.email ? (
            <Card>
              <CardContent className="p-4 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-slate-700">Evaluation Saved as Draft</p>
                  <p className="text-xs text-muted-foreground">You can resume and submit your evaluation for this purchase order.</p>
                </div>
                <Button size="sm" className="bg-[#5b2fd3] hover:bg-[#4a25b5]" onClick={resumeEvaluation}>
                  Resume Evaluation
                </Button>
              </CardContent>
            </Card>
          ) : <></>}

        {budgetValidation && isAIEnabled("AI_BUDGET_VALIDATION") && (
          <Card
            className={`border ${budgetValidation.severity === "high" ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20" : budgetValidation.severity === "medium" ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20" : "border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"}`}
            data-testid="card-budget-validation"
          >
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  {budgetValidation.isWithinBudget ? (
                    <ShieldCheck
                      className={`h-4 w-4 ${budgetValidation.severity === "low" ? "text-green-600" : "text-amber-600"}`}
                    />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  Budget Validation
                  <Badge
                    variant={
                      budgetValidation.severity === "high"
                        ? "destructive"
                        : budgetValidation.severity === "medium"
                          ? "outline"
                          : "default"
                    }
                    className="text-xs"
                  >
                    {budgetValidation.severity === "high"
                      ? "Over Budget"
                      : budgetValidation.severity === "medium"
                        ? "Warning"
                        : "Within Budget"}
                  </Badge>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setBudgetValidation(null)}
                  data-testid="button-close-budget"
                >
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            {budgetValidation.warnings.length > 0 && (
              <CardContent className="py-2 px-4">
                <ul className="space-y-1">
                  {budgetValidation.warnings.map((w, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <AlertCircle
                        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${budgetValidation.severity === "high" ? "text-red-500" : "text-amber-500"}`}
                      />
                      {w}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Available budget:{" "}
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0,
                  }).format(budgetValidation.departmentBudget)}
                </p>
              </CardContent>
            )}
          </Card>
        )}

        <Card>
          <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Line Items ({po.items?.length || 0})
              </CardTitle>
              {(isDraft || isMoreInfoRequired) && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center space-y-2">
                    <Label className="w-[150px] mr-4" htmlFor="incl-of-tax">Type of Tax</Label>
                    <Select
                      value={po?.tax_included || "No"}
                      onValueChange={(v) =>
                        updateTaxIncludedMethod(v)
                      }
                      disabled={false}
                    >
                      <SelectTrigger id="incl-of-tax" data-testid="select-incl-of-tax">
                        <SelectValue placeholder="Select Type of Tax" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Inclusive</SelectItem>
                        <SelectItem value="No">Exclusive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!po.pr_number && !po.contract_ref_no && <Button
                    size="sm"
                    onClick={handleOpenAddLine}
                    data-testid="button-add-line-item"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Line Item
                  </Button>
                  }
                  {!po.contract_ref_no && <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsLinesImportOpen(true)}
                    data-testid="button-import-excel"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Import from Excel
                  </Button>
                  }
                  <Input
                    ref={excelFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setLinesImportFile(file);
                        setLinesImportPreview(null);
                        setLinesImportResults(null);
                      }
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!po.items || po.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Package className="h-10 w-10 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No line items</p>
                {/* {isDraft && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={handleOpenAddLine}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add First Line Item
                  </Button>
                )} */}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium w-[50px]">
                        Line
                      </TableHead>
                      <TableHead className="text-xs font-medium">
                        Description
                      </TableHead>
                      <TableHead className="text-xs font-medium">
                        Category
                      </TableHead>
                      <TableHead className="text-xs font-medium text-right">
                        Qty
                      </TableHead>
                      <TableHead className="text-xs font-medium">UoM</TableHead>
                      <TableHead className="text-xs font-medium text-right">
                        Unit Price
                      </TableHead>
                      {po?.tax_included !== "Yes" && <TableHead className="text-xs font-medium text-right">
                        Discount
                      </TableHead>}
                      <TableHead className="text-xs font-medium text-right">
                        Amount
                      </TableHead>
                      <TableHead className="text-xs font-medium text-right">
                        Tax Rate
                      </TableHead>
                      <TableHead className="text-xs font-medium text-right">
                        Tax
                      </TableHead>
                      {(isDraft ||
                        (po.po_status === "More Info Required" || po.po_status?.toLowerCase() === "more info required" || po.po_status?.toLowerCase() === "more"))
                        && !po.attribute_5 && !po.bid_award_id && (
                          <TableHead className="text-xs font-medium text-center">
                            Actions
                          </TableHead>
                        )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {po.items.map((item, index) => (
                      <TableRow
                        key={item.id || index}
                        data-testid={`row-line-${index}`}
                      >
                        <TableCell className="font-mono text-sm py-2">
                          {item.po_line_number || index + 1}
                        </TableCell>
                        <TableCell className="py-2">
                          <div>
                            <p className="text-sm font-medium">
                              {item.item_name || item.line_description || "-"}
                            </p>
                            {item.item_name && item.line_description && (
                              <p
                                className="text-xs text-muted-foreground truncate max-w-[250px]"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[250px] cursor-default">
                                      {item.line_description || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{item.line_description || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {item.product_category_name || "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm py-2">
                          {item.line_qty || 0}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {item.line_unit || "EA"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm py-2">
                          {formatCurrency(
                            item.line_unit_cost,
                            item.line_curr || po.po_currency,
                          )}
                        </TableCell>
                        {po?.tax_included !== "Yes" && <TableCell className="text-right font-mono text-sm py-2">
                          {formatCurrency(
                            item.discount,
                            item.line_curr || po.po_currency,
                          )}
                        </TableCell>}
                        <TableCell className="text-right font-mono text-sm font-medium py-2">
                          {formatCurrency(
                            item.line_cost,
                            item.line_curr || po.po_currency,
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm py-2">
                          {item.tax_rate != null ? `${item.tax_rate}%` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm py-2">
                          {formatCurrency(
                            item.tax_amount,
                            item.line_curr || po.po_currency,
                          )}
                        </TableCell>
                        {(isDraft ||
                          (po.po_status === "More Info Required" || po.po_status?.toLowerCase() === "more info required" || po.po_status?.toLowerCase() === "more"))
                          && !po.attribute_5 && !po.bid_award_id && !po.contract_ref_no && (
                            <TableCell className="py-2">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    // Determine entry mode based on whether item has an itemId
                                    const hasItemId = Boolean(item.item_id);
                                    setItemEntryMode(
                                      hasItemId ? "master" : "freetext",
                                    );
                                    setNewLineItem({
                                      description:
                                        item.line_description ||
                                        item.item_name ||
                                        "",
                                      quantity: String(item.line_qty || 1),
                                      discount: String(item.discount || 0),
                                      unitPrice: String(
                                        item.line_unit_cost || "",
                                      ),
                                      uom: item.line_unit || "Each",
                                      taxRate: String(item.tax_rate || 0),
                                      taxCode: item.tax_rate_code || taxCodes.filter((t) => Number(t.tax_rate) === Number(item.tax_rate))[0]?.tax_code,
                                      categoryCode: item.product_category
                                        ? String(item.product_category)
                                        : "",
                                      categoryName:
                                        item.product_category_name || "",
                                      itemId: item.item_id || "",
                                      itemName: item.item_name || "",
                                      taxId: String(taxCodes.filter((t) => Number(t.tax_rate) === Number(item.tax_rate))[0]?.id || ""),
                                      inclusiveTaxAmt: po?.tax_included === "Yes" ?
                                        Math.round((Number(item.line_cost) || 0) + (Number(item.tax_amount) || 0)).toString()
                                        : ""
                                    });
                                    setEditingLineId(item.id);
                                    setAddLineSheetOpen(true);
                                  }}
                                  data-testid={`button-edit-line-${item.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {((isDraft ||
                                  (po.po_status === "More Info Required" || po.po_status?.toLowerCase() === "more info required" || po.po_status?.toLowerCase() === "more"))
                                  && !po.attribute_5 && !po.bid_award_id && !po.pr_number) && <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                      setLineToDelete(item.id);
                                      setDeleteLineConfirmOpen(true);
                                    }}
                                    data-testid={`button-delete-line-${item.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>}
                              </div>
                            </TableCell>
                          )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery Notes, Receipts, Invoices - Only shown for statuses other than Draft, Pending Approval, and Rejected */}
        {po.po_status !== "Draft" &&
          po.po_status !== "Pending Approval" &&
          po.po_status !== "Rejected" && (
            <Tabs defaultValue="delivery-notes">
              <TabsList>
                <TabsTrigger
                  value="delivery-notes"
                  data-testid="tab-delivery-notes"
                >
                  Delivery Notes ({deliveryNotes.length})
                </TabsTrigger>
                <TabsTrigger value="receipts" data-testid="tab-receipts">
                  Receipts ({groupedGrns.length})
                </TabsTrigger>
                <TabsTrigger value="invoices" data-testid="tab-invoices">
                  Invoices ({invoices.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="delivery-notes" className="mt-3">
                <Card>
                  {deliveryNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Truck className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No delivery notes
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs font-medium w-[40px]"></TableHead>
                            <TableHead className="text-xs font-medium">
                              ASN Number
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Carrier
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Ship From
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Ship To
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Ship Date
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Expected Arrival
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deliveryNotes.map((dn, index) => {
                            const isExpanded = expandedDnIds.has(dn.id);
                            return (
                              <>
                                <TableRow
                                  key={dn.id}
                                  className="cursor-pointer"
                                  onClick={() => toggleDnExpand(dn.id)}
                                  data-testid={`row-dn-${index}`}
                                >
                                  <TableCell className="py-2">
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm py-2">
                                    {dn.asn_number || "-"}
                                  </TableCell>
                                  <TableCell className="text-sm py-2">
                                    {dn.carrier || "-"}
                                  </TableCell>
                                  <TableCell className="text-sm py-2">
                                    {dn.ship_from || "-"}
                                  </TableCell>
                                  <TableCell className="text-sm py-2">
                                    {dn.ship_to || "-"}
                                  </TableCell>
                                  <TableCell className="text-sm py-2">
                                    {formatDate(dn.ship_date)}
                                  </TableCell>
                                  <TableCell className="text-sm py-2">
                                    {formatDate(dn.expected_arrival_date)}
                                  </TableCell>
                                </TableRow>
                                {isExpanded && (
                                  <TableRow key={`${dn.id}-lines`}>
                                    <TableCell colSpan={7} className="p-0">
                                      <DeliveryNoteLines deliveryId={dn.id} />
                                    </TableCell>
                                  </TableRow>
                                )}
                              </>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="receipts" className="mt-3">
                <Card>
                  {grns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Receipt className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No receipts
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs font-medium w-[40px]"></TableHead>
                            <TableHead className="text-xs font-medium">
                              Receipt Id
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              PO Line
                            </TableHead>
                            <TableHead className="text-xs font-medium">

                            </TableHead>
                            <TableHead className="text-xs font-medium text-right">

                            </TableHead>
                            <TableHead className="text-xs font-medium">

                            </TableHead>
                            <TableHead className="text-xs font-medium text-right">
                              Rec. Cost
                            </TableHead>
                            <TableHead className="text-xs font-medium text-right">
                              Tax
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Rec. By
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Rec. Date
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Status
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupedGrns.map((group: {
                            id: string;
                            receiptnum: string;
                            received_date: string;
                            received_by_name: string;
                            status: string;
                            supp_receipt_no: string;
                            currency_code: string;
                            attribute_11: string;
                            lines: GRN[];
                          }, index) => {
                            const isGrnExpanded = expandedGrnIds.has(group.id);
                            return (
                              <>
                                <TableRow
                                  key={group.id}
                                  className="cursor-pointer"
                                  onClick={() => toggleGrnExpand(group.id)}
                                  data-testid={`row-grn-${index}`}
                                >
                                  <TableCell className="py-2">
                                    {isGrnExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm py-2">
                                    {group.receiptnum}
                                  </TableCell>
                                  <TableCell className="text-sm py-2 italic text-muted-foreground font-normal" colSpan={4}>
                                    {group.lines.length} Line Item(s) Received
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm py-2">
                                    {formatCurrency(
                                      group.lines.reduce((acc, l) => acc + (Number(l.received_cost) || 0), 0),
                                      group.currency_code
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm py-2">
                                    {formatCurrency(
                                      group.lines.reduce((acc, l) => acc + (Number(l.tax_amount) || 0), 0),
                                      group.currency_code
                                    )}
                                  </TableCell>
                                  <TableCell
                                    className="text-sm py-2 max-w-[120px] truncate"
                                  >
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-sm block truncate max-w-[120px] cursor-default">
                                          {group.received_by_name}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p>{group.received_by_name}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell className="text-sm py-2 whitespace-nowrap">
                                    {formatDate(group.received_date)}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Badge
                                      variant={
                                        group.status === "Invoice Submitted"
                                          ? "default"
                                          : "secondary"
                                      }
                                      className="text-xs"
                                    >
                                      {group.status}
                                    </Badge>
                                  </TableCell>
                                </TableRow>

                                {isGrnExpanded && (
                                  <TableRow key={`${group.id}-details`} className="hover:bg-transparent">
                                    <TableCell colSpan={11} className="p-0 border-b">
                                      <div className="bg-muted/10 p-4">
                                        <div className="grid grid-cols-4 gap-x-8 gap-y-3 mb-4">
                                          <div>
                                            <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Supplier Receipt Number</p>
                                            <p className="text-xs font-medium">{group.supp_receipt_no}</p>
                                          </div>
                                          <div>
                                            <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Shipped From</p>
                                            <p className="text-xs font-medium">{group.attribute_11}</p>
                                          </div>
                                        </div>

                                        <div className="border rounded-md bg-background overflow-hidden shadow-sm">
                                          <Table>
                                            <TableHeader className="bg-muted/30">
                                              <TableRow className="hover:bg-transparent h-7">
                                                <TableHead className="text-[10px] py-0 h-7 font-bold">PO Line</TableHead>
                                                <TableHead className="text-[10px] py-0 h-7 font-bold">Item Name</TableHead>
                                                <TableHead className="text-right text-[10px] py-0 h-7 font-bold">Rec. Qty</TableHead>
                                                <TableHead className="text-[10px] py-0 h-7 font-bold">UOM</TableHead>
                                                <TableHead className="text-right text-[10px] py-0 h-7 font-bold">Rec. Cost</TableHead>
                                                <TableHead className="text-right text-[10px] py-0 h-7 font-bold">Tax</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {group.lines.map((line, lIndex) => (
                                                <TableRow key={lIndex} className="h-7 hover:bg-accent/30 border-b last:border-0">
                                                  <TableCell className="text-[11px] py-1">{line.po_line_number}</TableCell>
                                                  <TableCell className="text-[11px] py-1 truncate max-w-[200px]">
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <span className="text-sm block truncate max-w-[200px] cursor-default">
                                                          {line.item_name || ""}
                                                        </span>
                                                      </TooltipTrigger>
                                                      <TooltipContent side="top">
                                                        <p>{line.item_name || ""}</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TableCell>
                                                  <TableCell className="text-right text-[11px] py-1 font-mono">{line.received_qty}</TableCell>
                                                  <TableCell className="text-[11px] py-1">{line.received_unit}</TableCell>
                                                  <TableCell className="text-right text-[11px] py-1 font-mono">{formatCurrency(line.received_cost, group.currency_code)}</TableCell>
                                                  <TableCell className="text-right text-[11px] py-1 font-mono">{line.tax_amount ? formatCurrency(line.tax_amount, group.currency_code) : "NA"}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="invoices" className="mt-3">
                <Card>
                  {invoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <FileCheck className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No invoices
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs font-medium">
                              Invoice Number
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Description
                            </TableHead>
                            <TableHead className="text-xs font-medium text-right">
                              Amount
                            </TableHead>
                            <TableHead className="text-xs font-medium text-right">
                              Tax
                            </TableHead>
                            {/* <TableHead className="text-xs font-medium">
                              Type
                            </TableHead> */}
                            <TableHead className="text-xs font-medium">
                              Invoice Date
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Due Date
                            </TableHead>
                            <TableHead className="text-xs font-medium">
                              Status
                            </TableHead>
                            <TableHead className="text-xs font-medium w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.map((inv, index) => (
                            <TableRow
                              key={inv.id}
                              data-testid={`row-invoice-${index}`}
                            >
                              <TableCell className="text-sm py-2">
                                {inv.invoice_number || "-"}
                              </TableCell>
                              <TableCell
                                className="text-sm py-2 max-w-[150px] truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {inv.description || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{inv.description || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm py-2">
                                {formatCurrency(
                                  inv.invoice_amount,
                                  inv.invoice_curr_code || po.po_currency,
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm py-2">
                                {inv.tax_amount
                                  ? formatCurrency(
                                    inv.tax_amount,
                                    inv.invoice_curr_code || po.po_currency,
                                  )
                                  : "NA"}
                              </TableCell>
                              {/* <TableCell className="text-sm py-2">
                                {inv.invoice_type || "Standard"}
                              </TableCell> */}
                              <TableCell className="text-sm py-2 whitespace-nowrap">
                                {formatDate(inv.invoice_date)}
                              </TableCell>
                              <TableCell className="text-sm py-2 whitespace-nowrap">
                                {formatDate(inv.inv_due_date)}
                              </TableCell>
                              <TableCell className="py-2">
                                <Badge
                                  variant={
                                    inv.invoice_status === "Approved"
                                      ? "default"
                                      : inv.invoice_status === "Rejected"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                  className="text-xs"
                                >
                                  {inv.invoice_status || "Draft"}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2">
                                <Link href={`/app/invoices/${inv.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    data-testid={`button-view-invoice-${index}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          )}
      </div>

      {/* Collaboration Panel - Reusable Component */}
      <CollaborationPanel
        ref={collaborationPanelRef}
        entityType="PO"
        entityId={poNumber || ""}
        notes={notesData?.notes || ""}
        notesLoading={notesLoading}
        onSaveNotes={handleSaveNotes}
        notesLabel="PO Notes"
        onCountsChange={(counts) => setCollaborationCount(counts.totalCount)}
        onPinChange={(pinned) => setIsPanelPinned(pinned)}
        currentUserName={currentUserProfile?.user_name}
      />

      {/* Edit PO Sheet */}
      <FormSheet
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title={`Edit Purchase Order - ${po?.po_number}`}
        description="Update the purchase order details below."
        onSubmit={handleUpdatePOLine}
        submitLabel={editMutation.isPending ? "Saving..." : "Save Changes"}
        isSubmitting={editMutation.isPending}
        submitDisabled={
          !editForm.description ||
          !editForm.supplierId ||
          !editForm.orgId ||
          !editForm.currency ||
          !editForm.budgetId ||
          !editForm.paymentTermsId
        }
        widthClassName="w-full sm:max-w-3xl"
      >
          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-destructive">*</span> Indicates mandatory fields
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                placeholder="Enter PO description"
                rows={2}
                data-testid="input-edit-po-description"
                disabled={(po.pr_number || po?.bid_award_id) ? true : false}
              />
            </div>

            <div className="space-y-2">
              <Label>Delivery Location</Label>
              <Select
                value={editForm.deliveryLocation}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, deliveryLocation: v, budgetId: "", budgetName: "" })
                }
                disabled={(po.pr_number || po?.bid_award_id) ? true : false}
              >
                <SelectTrigger data-testid="select-edit-delivery-location">
                  <SelectValue placeholder="Select Location" />
                </SelectTrigger>
                <SelectContent>
                  {editLocations.map((loc) => (
                    <SelectItem key={loc.id} value={String(loc.id)}>
                      {loc.location_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Required Date</Label>
              <Input
                type="date"
                value={editForm.requiredDate}
                onChange={(e) =>
                  setEditForm({ ...editForm, requiredDate: e.target.value })
                }
                disabled={(po.pr_number || po?.bid_award_id) ? true : false}
                data-testid="input-edit-po-required-date"
              />
            </div>

            <div className="space-y-2">
              <Label>Requestor</Label>
              <Select
                value={editForm.requestorId}
                onValueChange={(v) => {
                  const selectedUser = editUsers.find(
                    (u) => String(u.id) === v,
                  );
                  setEditForm({
                    ...editForm,
                    requestorId: v,
                    requestorName: selectedUser?.name || "",
                    requestorDepartment:
                      selectedUser?.department_name ||
                      editForm.requestorDepartment,
                  });
                }}
                disabled
              >
                <SelectTrigger data-testid="select-edit-requestor">
                  <SelectValue placeholder="Select Requestor" />
                </SelectTrigger>
                <SelectContent>
                  {editUsers.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={editForm.requestorDepartment}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, requestorDepartment: v, budgetId: "", budgetName: "" })
                }
                disabled={(po.pr_number || po?.bid_award_id) ? true : false}
              >
                <SelectTrigger data-testid="select-edit-department">
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  {editDepartments.map((dept) => (
                    <SelectItem key={dept.id} value={String(dept.id)}>
                      {dept.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-po-business-entity">
                Business Entity <span className="text-destructive">*</span>
              </Label>
              <Select
                value={editForm.orgId || ""}
                onValueChange={(value) => {
                  setEditForm({ ...editForm, budgetId: "", budgetName: "", orgId: value });
                }}
                disabled={(po.pr_number || po?.bid_award_id) ? true : false}
              >
                <SelectTrigger data-testid="select-pr-business-entity">
                  <SelectValue placeholder="Select business entity..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations
                    ?.filter((org) => !isSuperadmin ? userOrgIds.includes(String(org.id)) : true)
                    ?.map((org) => (
                      <SelectItem key={org.id} value={String(org.id)}>
                        {org.organization_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5 relative">
              <Label>
                Vendor <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={
                    editVendorDropdownOpen
                      ? editVendorSearch
                      : editForm.supplierName || editVendorSearch
                  }
                  onChange={(e) => {
                    setEditVendorSearch(e.target.value);
                    setEditVendorDropdownOpen(true);
                    if (!e.target.value) {
                      setEditForm({
                        ...editForm,
                        supplierId: "",
                        supplierName: "",
                      });
                    }
                  }}
                  onFocus={() => setEditVendorDropdownOpen(true)}
                  onBlur={() =>
                    setTimeout(() => setEditVendorDropdownOpen(false), 200)
                  }
                  placeholder="Search by Name..."
                  className="pl-8"
                  data-testid="input-edit-vendor-search"
                  disabled={po?.bid_award_id ? true : false}
                />
                {editVendorDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 w-full mt-1 border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                    {editFilteredVendors.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-2">
                        No vendors found
                      </p>
                    ) : (
                      editFilteredVendors.slice(0, 20).map((vendor) => {
                        const vendorName =
                          vendor.companyName || vendor.company_name || "";
                        return (
                          <button
                            key={vendor.id}
                            className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setEditForm({
                                ...editForm,
                                supplierId: String(vendor.id),
                                supplierName: vendorName,
                              });
                              setEditVendorDropdownOpen(false);
                              setEditVendorSearch("");
                            }}
                            data-testid={`edit-vendor-option-${vendor.id}`}
                          >
                            {vendorName}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Budget <span className="text-destructive">*</span></Label>
              <Select
                value={editForm.budgetId}
                onValueChange={(v) => {
                  const selectedBudget = editUniqueBudgets.find(
                    (bl) => String(bl.id) === v,
                  );
                  setEditForm({
                    ...editForm,
                    budgetId: v,
                    budgetName: selectedBudget
                      ? `${selectedBudget.budget_name} . ${selectedBudget.segment_dtl_name}`
                      : "",
                  });
                }}
                disabled={(po.pr_number || po?.bid_award_id) ? true : false}
              >
                <SelectTrigger data-testid="select-edit-budget">
                  <SelectValue
                    placeholder={editForm.budgetName || "Select Budget"}
                  >
                    {editForm.budgetId &&
                      (() => {
                        const selected = editUniqueBudgets.find(
                          (bl) => String(bl.id) === editForm.budgetId,
                        );
                        return selected
                          ? `${selected.budget_name} . ${selected.segment_dtl_name}`
                          : editForm.budgetName || "Select Budget";
                      })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {editUniqueBudgets.length > 0 ? editUniqueBudgets
                    .map((budgetLine) => {
                      const lineAmount = Math.max(
                        0,
                        (parseFloat(budgetLine.amount) || 0) -
                        (parseFloat(budgetLine.consumed_amount) || 0) -
                        (parseFloat(budgetLine.reserved_amount) || 0),
                      );
                      const currencySymbol =
                        budgetLine.budget_curr === "INR"
                          ? "\u20B9 "
                          : budgetLine.budget_curr === "USD"
                            ? "$ "
                            : budgetLine.budget_curr === "AED"
                              ? "AED "
                              : budgetLine.budget_curr === "EUR"
                                ? "\u20AC "
                                : budgetLine.budget_curr === "GBP"
                                  ? "\u00A3 "
                                  : budgetLine.budget_curr + " ";
                      return (
                        <SelectItem
                          key={budgetLine.id}
                          value={String(budgetLine.id)}
                          className="py-2"
                        >
                          <div className="flex flex-col">
                            <span>
                              {budgetLine.budget_name} .{" "}
                              {budgetLine.segment_dtl_name}
                            </span>
                            <span className="text-xs text-green-600">
                              Available Budget - {currencySymbol}
                              {lineAmount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    }) : <div className="p-2 text-sm text-muted-foreground">
                    No budgets available for selected entity and department
                  </div>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Currency <span className="text-destructive">*</span>
              </Label>
              <Select
                value={editForm.currency}
                onValueChange={(v) => setEditForm({ ...editForm, currency: v })}
                disabled={(po.pr_number || po?.bid_award_id) ? true : false}
              >
                <SelectTrigger data-testid="select-edit-currency">
                  <SelectValue placeholder="Select Currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Terms <span className="text-destructive">*</span></Label>
              <Select
                value={editForm.paymentTermsId}
                onValueChange={(v) => {
                  const selectedPT = editPaymentTerms.find(
                    (pt) => String(pt.id) === v,
                  );
                  setEditForm({
                    ...editForm,
                    paymentTermsId: v,
                    paymentTermsName: selectedPT?.terms_name || "",
                  });
                }}
              >
                <SelectTrigger data-testid="select-edit-payment-terms">
                  <SelectValue placeholder="Select Payment Terms" />
                </SelectTrigger>
                <SelectContent>
                  {editPaymentTerms.map((pt) => (
                    <SelectItem key={pt.id} value={String(pt.id)}>
                      {pt.terms_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-advance-flag"
                  checked={editForm.advanceFlag}
                  onCheckedChange={(checked) =>
                    setEditForm({
                      ...editForm,
                      advanceFlag: !!checked,
                      advancePercentage: checked
                        ? editForm.advancePercentage
                        : "",
                    })
                  }
                  data-testid="checkbox-edit-advance-flag"
                />
                <Label htmlFor="edit-advance-flag" className="cursor-pointer">
                  Advance Payment %
                </Label>
              </div>
              {editForm.advanceFlag && (
                <div className="space-y-1">
                  <Input
                    id="edit-advance-pct"
                    type="text"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="e.g. 10"
                    value={editForm.advancePercentage}
                    onChange={(e) => {
                      let value = e.target.value;
                      if (value === "") {
                        setEditForm({ ...editForm, advancePercentage: "" });
                        return;
                      }
                      if (!/^\d*\.?\d*$/.test(value)) return;
                      let num = Number(value);
                      if (num < 0 || num > 100) return;
                      setEditForm({
                        ...editForm,
                        advancePercentage: value,
                      });
                    }}
                    inputMode="decimal"
                    data-testid="input-edit-advance-percentage"
                  />
                </div>
              )}
            </div>
          </div>
      </FormSheet>

      {/* Submit for Approval Confirmation Dialog */}
      <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Submit Purchase Order for Approval?</DialogTitle>
            <DialogDescription>
              This will submit the purchase order for workflow approval. You won&apos;t be able to make changes while it&apos;s pending approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setSubmitConfirmOpen(false);
                document.body.style.pointerEvents = "auto";
              }}
              data-testid="button-submit-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setSubmitConfirmOpen(false);
                document.body.style.pointerEvents = "auto";
                setTimeout(() => {
                  submitMutation.mutate();
                }, 50);
              }}
              disabled={submitMutation.isPending}
              data-testid="button-submit-confirm"
            >
              {submitMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-Submit for Approval Confirmation Dialog */}
      <Dialog open={reSubmitConfirmOpen} onOpenChange={setReSubmitConfirmOpen}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Re-Submit Purchase Order for Approval?</DialogTitle>
            <DialogDescription>
              This will re-submit the purchase order for approval. You won&apos;t be able to make changes while it&apos;s pending approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setReSubmitConfirmOpen(false);
                document.body.style.pointerEvents = "auto";
              }}
              data-testid="button-re-submit-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setReSubmitConfirmOpen(false);
                document.body.style.pointerEvents = "auto";
                setTimeout(() => {
                  approvalMutation.mutate({
                    action: "ReSubmit",
                    remarks: approvalRemarks
                  });
                }, 50);
              }}
              disabled={approvalMutation.isPending}
              data-testid="button-re-submit-confirm"
            >
              {approvalMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Re-Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Action Dialog */}
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
              {approvalAction === "Approve" ? "Approve Purchase Order" :
                approvalAction === "Reject" ? "Reject Purchase Order" :
                  approvalAction === "More" ? "Request More Information" :
                    "Request for Delegate"}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === "Approve" && "This will approve the purchase order and move it to the next step."}
              {approvalAction === "Reject" && "This will reject the purchase order."}
              {approvalAction === "More" && "This will request additional information."}
              {approvalAction === "Request" && "This will delegate the approval to another approver."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {approvalAction === "Request" && (
              <div>
                <Label htmlFor="po-delegate-approver">
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
              onClick={() => {
                if (approvalAction !== "Approve" && !approvalRemarks.trim()) {
                  toast({
                    title: "Remarks required",
                    description: "Please provide a reason for this action.",
                    variant: "destructive",
                  });
                  return;
                }
                if (approvalAction === "Request" && !delegateApproverId) {
                  toast({
                    title: "Approver required",
                    description: "Please select an approver to delegate to.",
                    variant: "destructive",
                  });
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
              className={
                approvalAction === "Approve"
                  ? "bg-green-600 hover:bg-green-700"
                  : approvalAction === "Reject"
                    ? "bg-red-600 hover:bg-red-700"
                    : approvalAction === "More"
                      ? "bg-orange-600 hover:bg-orange-700"
                      : "bg-blue-600 hover:bg-blue-700"
              }
              data-testid="button-approval-confirm"
              disabled={approvalMutation.isPending || delegateActionMutation.isPending}
            >
              {(approvalMutation.isPending || delegateActionMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {approvalAction === "Approve"
                ? "Approve"
                : approvalAction === "Reject"
                  ? "Reject"
                  : approvalAction === "More"
                    ? "Request Info"
                    : "Delegate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApprovalChecklistDialog
        open={checklistDialogOpen}
        onOpenChange={setChecklistDialogOpen}
        moduleName="Purchase Order"
        title="Purchase Order Approval Checklist"
        refNumber={poNumber}
        approving={approvalMutation.isPending}
        onApprove={(comments) => {
          setChecklistDialogOpen(false);
          setTimeout(() => {
            approvalMutation.mutate({ action: "Approve", remarks: comments });
          }, 50);
        }}
      />

      {/* Add/Edit Line Item Sheet */}
      <FormSheet
        open={addLineSheetOpen}
        onOpenChange={(open) => {
          setAddLineSheetOpen(open);
          if (!open) {
            setEditingLineId(null);
            setItemEntryMode("master");
            setCategoryOpen(false);
            setItemOpen(false);
            setNewLineItem({
              description: "",
              quantity: "1",
              discount: "0",
              unitPrice: "",
              uom: "Each",
              taxRate: "0",
              taxCode: "",
              categoryCode: "",
              categoryName: "",
              itemId: "",
              itemName: "",
              taxId: "",
              inclusiveTaxAmt: ""
            });
          }
        }}
        title={editingLineId ? "Edit Line Item" : "Add Line Item"}
        description={
          editingLineId
            ? "Update line item details."
            : "Add a new line item to this purchase order."
        }
        onSubmit={handleSubmitLine}
        submitLabel={editingLineId ? "Update Line Item" : "Add Line Item"}
        isSubmitting={addLineMutation.isPending || editLineMutation.isPending}
        widthClassName="w-full sm:max-w-[600px]"
      >
          <div className="space-y-4 pb-6">
            {/* Item Entry Mode Toggle - Free Text hidden, master mode only */}

            {/* Item Master Mode - Item Selection */}
            {itemEntryMode === "master" && (
              <div className="space-y-2">
                <Label>Select Item <span className="text-destructive">*</span></Label>
                <Popover open={itemOpen} onOpenChange={() => !po.pr_number ? setItemOpen(!itemOpen) : {}}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={itemOpen}
                      className="w-full justify-between font-normal"
                      data-testid="button-select-item"
                    >
                      {
                        newLineItem.itemId
                          ? (() => {
                            const item = items.find((i) => i.id === newLineItem.itemId);
                            return item
                              ? `${item.itemCode} - ${item.name}`
                              : newLineItem.itemName || "Search and select an item...";
                          })()
                          : "Search and select an item..."
                      }
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                    <Command>
                      <CommandInput placeholder="Search items..." />
                      <CommandList>
                        <CommandEmpty>No items found.</CommandEmpty>
                        <CommandGroup>
                          {items.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.itemCode} ${item.name}`}
                              onSelect={() => {
                                setNewLineItem({
                                  ...newLineItem,
                                  itemId: item.id,
                                  itemName: item.name,
                                  description: item.name,
                                  categoryCode: item.categoryCode || "",
                                  categoryName: item.categoryName || "",
                                  uom: item.unitOfMeasure || "Each",
                                  unitPrice: item.standardPrice
                                    ? String(item.standardPrice)
                                    : "",
                                  discount: "0",
                                });
                                setItemOpen(false);
                              }}
                              data-testid={`item-option-${item.id}`}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newLineItem.itemId === item.id
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {item.itemCode} - {item.name}
                                </span>
                                {item.categoryName && (
                                  <span className="text-xs text-muted-foreground">
                                    {item.categoryName}
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {newLineItem.categoryName && (
                  <div className="text-xs text-muted-foreground">
                    Category: {newLineItem.categoryName}
                  </div>
                )}
              </div>
            )}

            {/* Free Text Mode - Category Selection and Description */}
            {itemEntryMode === "freetext" && (
              <>
                <div className="space-y-2">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={categoryOpen}
                        className="w-full justify-between font-normal"
                        data-testid="button-select-category"
                      >
                        {newLineItem.categoryCode
                          ? newLineItem.categoryName ||
                          categories.find(
                            (c) => c.code === newLineItem.categoryCode,
                          )?.name
                          : "Select a category..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                      <Command>
                        <CommandInput placeholder="Search categories..." />
                        <CommandList>
                          <CommandEmpty>No categories found.</CommandEmpty>
                          <CommandGroup>
                            {categories.map((cat) => (
                              <CommandItem
                                key={cat.id}
                                value={`${cat.code} ${cat.name}`}
                                onSelect={() => {
                                  setNewLineItem({
                                    ...newLineItem,
                                    categoryCode: cat.code,
                                    categoryName: cat.name,
                                  });
                                  setCategoryOpen(false);
                                }}
                                data-testid={`category-option-${cat.code}`}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newLineItem.categoryCode === cat.code
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {cat.code} - {cat.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Level {cat.level}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="line-description">Description <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="line-description"
                    value={newLineItem.description}
                    onChange={(e) =>
                      setNewLineItem({
                        ...newLineItem,
                        description: e.target.value,
                      })
                    }
                    placeholder="Enter item description"
                    rows={2}
                    data-testid="input-line-description"
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              {po?.tax_included === "Yes" ?
                <>
                  <div className="space-y-2">
                    <Label htmlFor="line-incl-of-tax-amt">Line Total *</Label>
                    <Input
                      id="line-incl-of-tax-amt"
                      type="number"
                      min="1"
                      value={newLineItem.inclusiveTaxAmt}
                      onKeyDown={(e) => {
                        if (["-", "+", "e", "E"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => {
                        const inclusiveTaxAmt = parseFloat(e.target.value) || 0;
                        const quantity = parseFloat(newLineItem.quantity) || 1;
                        const taxRate = Number(newLineItem.taxRate) || 0;
                        const taxAmount = (inclusiveTaxAmt * taxRate) / 100;
                        const netAmount = Math.max(0, inclusiveTaxAmt - taxAmount);
                        const unitPrice = quantity > 0 ? netAmount / quantity : 0;
                        setNewLineItem({ ...newLineItem, inclusiveTaxAmt: e.target.value, unitPrice: unitPrice.toFixed(2) });
                      }}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const rounded = Math.round(val);
                        const quantity = parseFloat(newLineItem.quantity) || 1;
                        const taxRate = Number(newLineItem.taxRate) || 0;
                        const taxAmount = (rounded * taxRate) / 100;
                        const netAmount = Math.max(0, rounded - taxAmount);
                        const unitPrice = quantity > 0 ? netAmount / quantity : 0;
                        setNewLineItem({
                          ...newLineItem,
                          inclusiveTaxAmt: rounded.toString(),
                          unitPrice: unitPrice.toFixed(2)
                        });
                      }}
                      data-testid="input-line-incl-of-tax-amt"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-tax-rate">Tax Rate</Label>
                    <Select
                      value={newLineItem.taxRate}
                      onValueChange={(value) => {
                        const selectedTax = taxCodes.find(
                          (t) => Number(t.tax_rate) === Number(value),
                        );
                        const qty = Number(newLineItem.quantity) || 1;
                        const totalAmount = Number(newLineItem.inclusiveTaxAmt) || 0;
                        const taxRate = Number(value) || 0;
                        const taxAmount = (totalAmount * taxRate) / 100;
                        const amountExcludingTax = Math.max(0, totalAmount - taxAmount);
                        setNewLineItem({
                          ...newLineItem,
                          taxRate: value,
                          taxCode: selectedTax?.tax_code || "",
                          taxId: selectedTax?.id?.toString() || "",
                          unitPrice: qty > 0 ? (amountExcludingTax / qty).toFixed(2) : "0.00",
                        });
                      }}
                    >
                      <SelectTrigger data-testid="select-line-tax-rate">
                        <SelectValue placeholder="Select tax rate" />
                      </SelectTrigger>
                      <SelectContent>
                        {taxCodes.map((tax) => (
                          <SelectItem
                            key={tax.id}
                            value={Number(tax.tax_rate).toString()}
                            data-testid={`select-tax-${tax.id}`}
                          >
                            {tax.tax_code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-quantity">Quantity</Label>
                    <Input
                      id="line-quantity"
                      type="number"
                      min="1"
                      value={newLineItem.quantity}
                      onKeyDown={(e) => {
                        if (["-", "+", "e", "E"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => {
                        const qty = Number(e.target.value) || 1;
                        const totalAmount = Number(newLineItem.inclusiveTaxAmt) || 0;
                        const taxRate = Number(newLineItem.taxRate) || 0;
                        const taxAmount = (totalAmount * taxRate) / 100;
                        const amountExcludingTax = Math.max(0, totalAmount - taxAmount);
                        setNewLineItem({
                          ...newLineItem,
                          quantity: e.target.value,
                          unitPrice: qty > 0 ? (amountExcludingTax / qty).toFixed(2) : "0.00",
                        });
                      }}
                      data-testid="input-line-quantity"
                      disabled={po.pr_number ? true : false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-uom">Unit of Measure</Label>
                    <Select
                      value={newLineItem.uom}
                      onValueChange={(v) =>
                        setNewLineItem({ ...newLineItem, uom: v })
                      }
                      disabled={po.pr_number ? true : false}
                    >
                      <SelectTrigger id="line-uom" data-testid="select-line-uom">
                        <SelectValue placeholder="Select UoM" />
                      </SelectTrigger>
                      <SelectContent>
                        {uomOptions.map((uom) => (
                          <SelectItem key={uom.id} value={uom.description || "Each"}>
                            {uom.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="line-unit-price">
                      Unit Price ({po?.po_currency || "AED"}) *
                    </Label>
                    <Input
                      id="line-unit-price"
                      type="number"
                      min="1"
                      step="0.01"
                      value={newLineItem.unitPrice}
                      onKeyDown={(e) => {
                        if (["-", "+", "e", "E"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) =>
                        setNewLineItem({
                          ...newLineItem,
                          unitPrice: e.target.value,
                        })
                      }
                      placeholder="0.00"
                      data-testid="input-line-unit-price"
                      disabled
                    />
                  </div>
                </>
                :
                <>
                  <div className="space-y-2">
                    <Label htmlFor="line-quantity">Quantity</Label>
                    <Input
                      id="line-quantity"
                      type="number"
                      min="1"
                      value={newLineItem.quantity}
                      onKeyDown={(e) => {
                        if (["-", "+", "e", "E"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) =>
                        setNewLineItem({
                          ...newLineItem,
                          quantity: e.target.value,
                          unitPrice: String(newLineItem.unitPrice),
                        })
                      }
                      data-testid="input-line-quantity"
                      disabled={po.pr_number ? true : false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-uom">Unit of Measure</Label>
                    <Select
                      value={newLineItem.uom}
                      onValueChange={(v) =>
                        setNewLineItem({ ...newLineItem, uom: v })
                      }
                      disabled={po.pr_number ? true : false}
                    >
                      <SelectTrigger id="line-uom" data-testid="select-line-uom">
                        <SelectValue placeholder="Select UoM" />
                      </SelectTrigger>
                      <SelectContent>
                        {uomOptions.map((uom) => (
                          <SelectItem key={uom.id} value={uom.description || "Each"}>
                            {uom.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="line-unit-price">
                      Unit Price ({po?.po_currency || "AED"}) *
                    </Label>
                    <Input
                      id="line-unit-price"
                      type="number"
                      min="1"
                      step="0.01"
                      value={newLineItem.unitPrice}
                      onKeyDown={(e) => {
                        if (["-", "+", "e", "E"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) =>
                        setNewLineItem({
                          ...newLineItem,
                          unitPrice: e.target.value,
                        })
                      }
                      placeholder="0.00"
                      data-testid="input-line-unit-price"
                      disabled={po?.tax_included !== "No" && po?.tax_included !== null ? true : false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-discount">Discount</Label>
                    <Input
                      id="line-discount"
                      type="number"
                      min="1"
                      value={newLineItem.discount}
                      onKeyDown={(e) => {
                        if (["-", "+", "e", "E"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => {
                        if (parseFloat(e.target.value) >= parseFloat(newLineItem.unitPrice)) {
                          toast({
                            title: "Validation Failure",
                            description: "Discount cannot be greater than unit price.",
                            variant: "destructive",
                          });
                          return;
                        } else {
                          setNewLineItem({ ...newLineItem, discount: e.target.value });
                        }
                      }}
                      data-testid="input-line-discount"
                      disabled={po?.tax_included !== "No" && po?.tax_included !== null ? true : false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-tax-rate">Tax Rate</Label>
                    <Select
                      value={newLineItem.taxRate}
                      onValueChange={(value) => {
                        const selectedTax = taxCodes.find(
                          (t) => Number(t.tax_rate) === Number(value),
                        );
                        setNewLineItem({
                          ...newLineItem,
                          taxRate: value,
                          taxCode: selectedTax?.tax_code || "",
                          taxId: selectedTax?.id?.toString() || "",
                        });
                      }}
                    >
                      <SelectTrigger data-testid="select-line-tax-rate">
                        <SelectValue placeholder="Select tax rate" />
                      </SelectTrigger>
                      <SelectContent>
                        {taxCodes.map((tax) => (
                          <SelectItem
                            key={tax.id}
                            value={Number(tax.tax_rate).toString()}
                            data-testid={`select-tax-${tax.id}`}
                          >
                            {tax.tax_code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>}
            </div>

            {/* Preview calculated values */}
            <div className="mt-4 p-3 bg-muted rounded-md space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-mono break-all">
                  {po?.tax_included === "Yes" ?
                    formatCurrency(
                      (parseFloat(newLineItem.inclusiveTaxAmt) || 0) - (
                        ((parseFloat(newLineItem.taxRate) || 0) *
                          (parseFloat(newLineItem.inclusiveTaxAmt) || 0)) / 100
                      ),
                      po?.po_currency || "AED",
                    ) : formatCurrency(
                      (parseFloat(newLineItem.quantity) || 1) *
                      (parseFloat(newLineItem.unitPrice) || 0),
                      po?.po_currency || "AED",
                    )
                  }
                </span>
              </div>
              {po?.tax_included !== "Yes" && <div className="flex justify-between">
                <span className="text-muted-foreground">Discount:</span>
                <span className="font-mono break-all">
                  {formatCurrency(
                    (parseFloat(newLineItem.quantity) || 1) *
                    (parseFloat(newLineItem.discount) || 0),
                    po?.po_currency || "AED"
                  )}
                </span>
              </div>}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Tax ({newLineItem.taxRate || 0}%):
                </span>
                <span className="font-mono break-all">
                  {po?.tax_included === "Yes" ?
                    formatCurrency(
                      (
                        (parseFloat(newLineItem.taxRate) || 0) *
                        (parseFloat(newLineItem.inclusiveTaxAmt) || 0)
                      ) / 100,
                      po?.po_currency || "AED"
                    ) : formatCurrency(
                      (
                        (
                          (parseFloat(newLineItem.quantity) || 1) *
                          (parseFloat(newLineItem.unitPrice) || 0)
                        ) -
                        (parseFloat(newLineItem.quantity) || 1) *
                        (parseFloat(newLineItem.discount) || 0)
                      ) *
                      (parseFloat(newLineItem.taxRate) || 0) /
                      100,
                      po?.po_currency || "AED"
                    )
                  }
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Total:</span>
                <span className="font-mono break-all">
                  {po?.tax_included === "Yes" ?

                    formatCurrency(
                      (parseFloat(newLineItem.inclusiveTaxAmt) || 0),
                      po?.po_currency || "AED"
                    ) : formatCurrency(
                      (
                        (
                          (parseFloat(newLineItem.quantity) || 1) *
                          (parseFloat(newLineItem.unitPrice) || 0)
                        ) -
                        (parseFloat(newLineItem.quantity) || 1) *
                        (parseFloat(newLineItem.discount) || 0)
                      ) *
                      (1 + (parseFloat(newLineItem.taxRate) || 0) / 100),
                      po?.po_currency || "AED"
                    )}
                </span>
              </div>
            </div>
          </div>
      </FormSheet>

      {/* Raise Delivery Note Sheet */}
      <Sheet open={isDNOpen} onOpenChange={setIsDNOpen}>
        <SheetContent className="w-[60vw] sm:max-w-[60vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Raise Delivery Note - {po?.po_number}</SheetTitle>
            <SheetDescription>
              Create a delivery note for this purchase order.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  ASN Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={dnForm.asn_number}
                  onChange={(e) =>
                    setDnForm((prev) => ({
                      ...prev,
                      asn_number: e.target.value,
                    }))
                  }
                  placeholder="Enter ASN number"
                  data-testid="input-dn-asn"
                />
              </div>
              <div className="space-y-2">
                <Label>Bill of Lading</Label>
                <Input
                  value={dnForm.bill_of_landing}
                  onChange={(e) =>
                    setDnForm((prev) => ({
                      ...prev,
                      bill_of_landing: e.target.value,
                    }))
                  }
                  placeholder="Enter bill of lading"
                  data-testid="input-dn-bol"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Carrier <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={dnForm.carrier}
                  onValueChange={(val) =>
                    setDnForm((prev) => ({ ...prev, carrier: val }))
                  }
                >
                  <SelectTrigger data-testid="select-dn-carrier">
                    <SelectValue placeholder="Select carrier" />
                  </SelectTrigger>
                  <SelectContent>
                    {carriers.map((c: any) => (
                      <SelectItem key={c.id} value={c.lookup_value}>
                        {c.lookup_value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  Ship Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={dnForm.ship_date}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) =>
                    setDnForm((prev) => ({
                      ...prev,
                      ship_date: e.target.value,
                      expected_arrival_date:
                        prev.expected_arrival_date &&
                          (e.target.value > prev.expected_arrival_date || e.target.value === prev.expected_arrival_date)
                          ? ""
                          : prev.expected_arrival_date,
                    }))
                  }
                  data-testid="input-dn-ship-date"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Expected Arrival Date{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={dnForm.expected_arrival_date}
                  min={dnForm.ship_date || new Date().toISOString().split("T")[0]}
                  onChange={(e) =>
                    setDnForm((prev) => ({
                      ...prev,
                      expected_arrival_date: e.target.value,
                      ship_date:
                        prev.ship_date && e.target.value < prev.ship_date
                          ? e.target.value
                          : prev.ship_date,
                    }))
                  }
                  data-testid="input-dn-arrival-date"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Ship To <span className="text-destructive">*</span>
                </Label>
                <Input
                  data-testid="select-dn-ship-to"
                  value={dnForm.ship_to || ""}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              </div>
              <div className="space-y-2">
                <Label>Ship From</Label>
                <Input
                  value={dnForm.ship_from}
                  disabled
                  data-testid="input-dn-ship-from"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">PO Line Items</Label>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Line #</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-right">Delivery Qty</TableHead>
                      <TableHead>UOM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dnLines.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-muted-foreground py-6"
                        >
                          No line items with pending quantities
                        </TableCell>
                      </TableRow>
                    ) : (
                      dnLines.map((line, idx) => (
                        <TableRow
                          key={idx}
                          className={line.pending_qty === 0 ? "opacity-50" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={line.selected}
                              disabled={line.pending_qty === 0}
                              onCheckedChange={(checked) => {
                                const updated = [...dnLines];
                                updated[idx] = {
                                  ...updated[idx],
                                  selected: !!checked,
                                };
                                setDnLines(updated);
                              }}
                              data-testid={`checkbox-dn-line-${idx}`}
                            />
                          </TableCell>
                          <TableCell>{line.po_line_number}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {line.item_name}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.line_qty}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.received_qty}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.pending_qty}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={line.pending_qty}
                              value={line.delivery_qty}
                              disabled={
                                !line.selected || line.pending_qty === 0
                              }
                              onChange={(e) => {
                                const val = Math.min(
                                  Number(e.target.value) || 0,
                                  line.pending_qty,
                                );
                                const updated = [...dnLines];
                                updated[idx] = {
                                  ...updated[idx],
                                  delivery_qty: val,
                                };
                                setDnLines(updated);
                              }}
                              className="w-20 text-right"
                              data-testid={`input-dn-qty-${idx}`}
                            />
                          </TableCell>
                          <TableCell>{line.line_unit}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <SheetFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDNOpen(false)}
              data-testid="button-dn-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createDnMutation.mutate()}
              disabled={
                createDnMutation.isPending ||
                !dnForm.asn_number ||
                !dnForm.carrier ||
                !dnForm.ship_date ||
                !dnForm.expected_arrival_date ||
                !dnForm.ship_to ||
                dnLines.filter((l) => l.selected && l.delivery_qty > 0)
                  .length === 0
              }
              data-testid="button-dn-submit"
            >
              {createDnMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Create Delivery Note
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Raise Receipt Sheet */}
      <Sheet open={isReceiptOpen} onOpenChange={setIsReceiptOpen}>
        <SheetContent className="w-[60vw] sm:max-w-[60vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Raise Receipt - {po?.po_number}</SheetTitle>
            <SheetDescription>
              Create a goods receipt for this purchase order.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Receipt Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={receiptForm.receipt_date}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) =>
                    setReceiptForm((prev) => ({
                      ...prev,
                      receipt_date: e.target.value,
                    }))
                  }
                  data-testid="input-receipt-date"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Receipt Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={receiptForm.receipt_number}
                  onChange={(e) =>
                    setReceiptForm((prev) => ({
                      ...prev,
                      receipt_number: e.target.value,
                    }))
                  }
                  placeholder="Enter receipt number"
                  data-testid="input-receipt-number"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Receipt Notes</Label>
                <Textarea
                  value={receiptForm.receipt_notes}
                  onChange={(e) =>
                    setReceiptForm((prev) => ({
                      ...prev,
                      receipt_notes: e.target.value,
                    }))
                  }
                  placeholder="Enter receipt notes"
                  rows={2}
                  data-testid="input-receipt-notes"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Received Location <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={receiptForm.received_location}
                  onValueChange={(val) =>
                    setReceiptForm((prev) => ({
                      ...prev,
                      received_location: val,
                    }))
                  }
                >
                  <SelectTrigger data-testid="select-receipt-location">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {receiptLocations.map((loc: any) => (
                      <SelectItem key={loc.id} value={loc.location_name}>
                        {loc.location_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ship From</Label>
                <Input
                  value={po?.supplier?.supplier_name || ""}
                  disabled
                  data-testid="input-receipt-ship-from"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">PO Line Items</Label>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>PO Line</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">
                        Pending Del Qty
                      </TableHead>
                      <TableHead className="text-right">Rec. Qty</TableHead>
                      <TableHead>UOM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiptLines.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-muted-foreground py-6"
                        >
                          No line items available
                        </TableCell>
                      </TableRow>
                    ) : (
                      receiptLines.map((line, idx) => (
                        <TableRow
                          key={idx}
                          className={
                            line.pending_del_qty === 0 ? "opacity-50" : ""
                          }
                        >
                          <TableCell>
                            <Checkbox
                              checked={line.selected}
                              disabled={line.pending_del_qty === 0}
                              onCheckedChange={(checked) => {
                                const updated = [...receiptLines];
                                updated[idx] = {
                                  ...updated[idx],
                                  selected: !!checked,
                                };
                                setReceiptLines(updated);
                              }}
                              data-testid={`checkbox-receipt-line-${idx}`}
                            />
                          </TableCell>
                          <TableCell>{line.po_line_number}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {line.item_name}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.line_qty}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.pending_del_qty}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={line.pending_del_qty}
                              value={line.received_qty}
                              disabled={
                                !line.selected || line.pending_del_qty === 0
                              }
                              onChange={(e) => {
                                const val = Math.min(
                                  Number(e.target.value) || 0,
                                  line.pending_del_qty,
                                );
                                const updated = [...receiptLines];
                                updated[idx] = {
                                  ...updated[idx],
                                  received_qty: val,
                                };
                                setReceiptLines(updated);
                              }}
                              className="w-20 text-right"
                              data-testid={`input-receipt-qty-${idx}`}
                            />
                          </TableCell>
                          <TableCell>{line.line_unit}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <SheetFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsReceiptOpen(false)}
              data-testid="button-receipt-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createReceiptMutation.mutate()}
              disabled={
                createReceiptMutation.isPending ||
                !receiptForm.receipt_date ||
                !receiptForm.receipt_number?.trim() ||
                !receiptForm.received_location ||
                receiptLines.filter((l) => l.selected && l.received_qty > 0)
                  .length === 0
              }
              data-testid="button-receipt-submit"
            >
              {createReceiptMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Add
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Line Item Confirmation Dialog */}
      <Dialog
        open={deleteLineConfirmOpen}
        onOpenChange={(open) => {
          setDeleteLineConfirmOpen(open);
          if (!open) setLineToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Line Item?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this line item? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteLineConfirmOpen(false);
                setLineToDelete(null);
              }}
              data-testid="button-delete-line-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                lineToDelete && deleteLineMutation.mutate(lineToDelete)
              }
              disabled={deleteLineMutation.isPending}
              data-testid="button-delete-line-confirm"
            >
              {deleteLineMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise Invoice Sheet - 3/4 page slider */}
      <Sheet open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
        <SheetContent
          className="w-[75vw] sm:max-w-[75vw] overflow-y-auto"
          data-testid="sheet-raise-invoice"
        >
          <SheetHeader>
            <SheetTitle>Raise Invoice - {po?.po_number}</SheetTitle>
            <SheetDescription>
              Create an invoice for this purchase order. Ensure all details are
              valid to avoid rejection of payments.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-[1fr_360px] gap-6">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">
                      Supplier Name
                    </Label>
                    <p
                      className="text-sm font-medium"
                      data-testid="text-invoice-supplier"
                    >
                      {po?.supplier?.supplier_name || po?.company_name || "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">PO Number</Label>
                    <p
                      className="text-sm font-medium"
                      data-testid="text-invoice-po-number"
                    >
                      {po?.po_number || "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">
                      PO Total Cost
                    </Label>
                    <p
                      className="text-sm font-medium"
                      data-testid="text-invoice-po-total"
                    >
                      {po?.po_currency || "AED"}{" "}
                      {(po?.po_total_cost || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">
                      Payment Terms
                    </Label>
                    <p
                      className="text-sm font-medium"
                      data-testid="text-invoice-payment-terms"
                    >
                      {po?.payment_terms_name || "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">
                      PO Description
                    </Label>
                    <p
                      className="text-sm font-medium"
                      data-testid="text-invoice-po-desc"
                    >
                      {po?.po_description || "-"}
                    </p>
                  </div>
                  {/* <div className="space-y-1">
                    <Label className="text-muted-foreground">
                      Invoiced Amount
                    </Label>
                    <p
                      className="text-sm font-medium"
                      data-testid="text-invoice-invoiced-amount"
                    >
                      {po?.po_currency || "AED"}{" "}
                      {(Number(po?.invoiced_amount) || 0).toLocaleString(
                        undefined,
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                      )}
                    </p>
                  </div> */}
                </div>

                <Label className="text-base font-semibold">
                  Invoice Details
                </Label>

                <div className="space-y-2">
                  <Label>
                    Invoice Description{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={invoiceForm.invoice_description}
                    onChange={(e) =>
                      setInvoiceForm((prev) => ({
                        ...prev,
                        invoice_description: e.target.value,
                      }))
                    }
                    placeholder="Enter invoice description"
                    rows={2}
                    data-testid="input-invoice-description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      Invoice Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={invoiceForm.invoice_number}
                      onChange={(e) => {
                        setInvoiceForm((prev) => ({
                          ...prev,
                          invoice_number: e.target.value,
                        }));
                        setInvoiceNumDuplicate(null);
                      }}
                      onBlur={() =>
                        checkInvoiceNumberDuplicate(invoiceForm.invoice_number)
                      }
                      placeholder="Enter invoice number"
                      data-testid="input-invoice-number"
                      className={
                        invoiceNumDuplicate?.duplicate
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                    />
                    {checkingInvoiceDuplicate && (
                      <p className="text-xs text-muted-foreground">
                        Checking for duplicates...
                      </p>
                    )}
                    {invoiceNumDuplicate?.duplicate &&
                      invoiceNumDuplicate.invoice && (
                        <p
                          className="text-xs text-destructive"
                          data-testid="text-duplicate-warning"
                        >
                          Duplicate: Invoice "
                          {invoiceNumDuplicate.invoice.invoice_number}" already
                          exists for {invoiceNumDuplicate.invoice.supplier_name}{" "}
                          (Status: {invoiceNumDuplicate.invoice.invoice_status})
                        </p>
                      )}
                  </div>
                  {/* <div className="space-y-2">
                    <Label>
                      Invoice Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={invoiceForm.invoice_type}
                      onValueChange={(v) =>
                        setInvoiceForm((prev) => ({ ...prev, invoice_type: v }))
                      }
                    >
                      <SelectTrigger data-testid="select-invoice-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Standard">Standard</SelectItem>
                        <SelectItem value="Credit Memo">Credit Memo</SelectItem>
                        <SelectItem value="Debit Memo">Debit Memo</SelectItem>
                        <SelectItem value="Prepayment">Prepayment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div> */}
                  <div className="space-y-2">
                    <Label>
                      Invoice Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={invoiceForm.invoice_date}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setInvoiceForm((prev) => ({
                          ...prev,
                          invoice_date: newDate,
                          invoice_due_date: getDueDateFormatted(newDate, po?.payment_terms_name) || prev.invoice_due_date,
                        }));
                      }}
                      data-testid="input-invoice-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Invoice Due Date{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={invoiceForm.invoice_due_date}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({
                          ...prev,
                          invoice_due_date: e.target.value,
                        }))
                      }
                      readOnly={!!po?.payment_terms_name}
                      data-testid="input-invoice-due-date"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col h-full">
                <h3 className="text-sm font-semibold mb-2">
                  Click here or Drag and Drop to Upload Documents{" "}
                  <span className="text-destructive">*</span>
                </h3>
                <div className="flex-1 overflow-y-auto max-h-[420px] space-y-2 border rounded-md p-2">
                  {invoiceDocuments.map((doc) => {
                    const isPdf =
                      doc.file?.type === "application/pdf" ||
                      doc.name.toLowerCase().endsWith(".pdf");
                    const isImage =
                      doc.file?.type?.startsWith("image/") ||
                      doc.name.toLowerCase().match(/\.(jpg|jpeg|png)$/);
                    return (
                      <div
                        key={doc.id}
                        className="relative border rounded-md overflow-hidden group"
                        data-testid={`doc-item-${doc.id}`}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-0.5 right-0.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/70"
                          style={{ visibility: "visible" }}
                          onClick={() => removeInvoiceDocument(doc.id)}
                          data-testid={`button-remove-doc-${doc.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        {doc.previewUrl ? (
                          <img
                            src={doc.previewUrl}
                            alt={doc.name}
                            className="w-full h-[280px] object-cover rounded-t"
                          />
                        ) : isPdf ? (
                          <div className="flex justify-center py-4">
                            <FileText className="h-10 w-10 text-red-500/70" />
                          </div>
                        ) : isImage ? (
                          <div className="flex justify-center py-4">
                            <FileImage className="h-10 w-10 text-blue-500/70" />
                          </div>
                        ) : (
                          <div className="flex justify-center py-4">
                            <File className="h-10 w-10 text-muted-foreground/70" />
                          </div>
                        )}
                        <p className="text-[11px] text-primary truncate w-full px-1.5 py-1">
                          {doc.name}
                        </p>
                      </div>
                    );
                  })}

                  <div
                    className="border-2 border-dashed rounded-md text-center cursor-pointer hover-elevate"
                    onClick={() => invoiceFileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        if (invoiceFileInputRef.current) {
                          invoiceFileInputRef.current.files = dt.files;
                          invoiceFileInputRef.current.dispatchEvent(
                            new Event("change", { bubbles: true }),
                          );
                        }
                      }
                    }}
                    data-testid="dropzone-invoice-file"
                  >
                    <Input
                      ref={invoiceFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={handleInvoiceFileSelect}
                      className="hidden"
                      data-testid="input-invoice-file"
                    />
                    <div className="p-4">
                      <Upload className="h-8 w-8 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-medium">
                        Upload
                      </p>
                      <p className="text-[10px] text-destructive mt-0.5">
                        Allowed: PDF, JPEG, PNG, DOC, DOCX
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-semibold">Receipts</Label>
              <p className="text-sm text-muted-foreground">
                Select the receipts for which this invoice is being raised.
              </p>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Receipt No</TableHead>
                      <TableHead>PO Line</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Ord Qty</TableHead>
                      <TableHead className="text-right">Rec Qty</TableHead>
                      <TableHead className="text-right">Rec Cost</TableHead>
                      <TableHead>Tax Rate</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead>Rec Date</TableHead>
                      <TableHead className="whitespace-nowrap">
                        Rec By
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceReceiptLines.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={11}
                          className="text-center text-muted-foreground py-6"
                        >
                          No receipts available for invoicing.
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoiceReceiptLines.map((line, idx) => (
                        <TableRow
                          key={line.maximo_grn_id}
                          className={cn(line.selected && "bg-primary/5")}
                          data-testid={`row-invoice-receipt-${idx}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={line.selected}
                              onCheckedChange={(checked) => {
                                setInvoiceReceiptLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? { ...l, selected: !!checked }
                                      : l,
                                  ),
                                );
                              }}
                              data-testid={`checkbox-invoice-receipt-${idx}`}
                            />
                          </TableCell>
                          <TableCell>{line.receiptnum}</TableCell>
                          <TableCell>{line.po_line_number}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {line.item_name}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(line.order_qty).toFixed(0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(line.received_qty).toFixed(0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(line.received_cost).toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </TableCell>
                          <TableCell>
                            {line.tax_rate_code ||
                              (line.tax_rate ? `${line.tax_rate}%` : "-")}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(line.tax_amount || 0).toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </TableCell>
                          <TableCell>
                            {line.received_date
                              ? new Date(
                                line.received_date,
                              ).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell
                            className="max-w-[120px] truncate"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[120px] cursor-default">
                                  {line.received_by_name || ""}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{line.received_by_name || ""}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-72 space-y-3">
                <div className="space-y-2">
                  <Label>Invoice Amount</Label>
                  <Input
                    type="number"
                    value={invoiceAmount.toFixed(2)}
                    readOnly
                    className="text-right"
                    data-testid="input-invoice-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tax Amount</Label>
                  <Input
                    type="number"
                    value={invoiceTaxAmount.toFixed(2)}
                    readOnly
                    className="text-right"
                    data-testid="input-invoice-tax-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold">Total Amount</Label>
                  <Input
                    type="number"
                    value={invoiceTotalAmount.toFixed(2)}
                    readOnly
                    className="text-right font-semibold"
                    data-testid="input-invoice-total-amount"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={agreeToTerms}
                onCheckedChange={(checked) => setAgreeToTerms(!!checked)}
                data-testid="checkbox-invoice-terms"
              />
              <Label
                className="cursor-pointer"
                onClick={() => setAgreeToTerms(!agreeToTerms)}
              >
                I Agree to{" "}
                <TermsConditions type="PO Preview Submit Invoice" className="text-primary underline" dataTestId="link-terms" />
              </Label>
            </div>
          </div>
          <SheetFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsInvoiceOpen(false)}
              data-testid="button-invoice-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createInvoiceMutation.mutate()}
              disabled={
                createInvoiceMutation.isPending ||
                !agreeToTerms ||
                invoiceReceiptLines.filter((l) => l.selected).length === 0 ||
                invoiceNumDuplicate?.duplicate
              }
              data-testid="button-submit-invoice"
            >
              {createInvoiceMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Submit Invoice
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Raise Advance Invoice Sheet */}
      <Sheet open={isAdvanceInvoiceOpen} onOpenChange={setIsAdvanceInvoiceOpen}>
        <SheetContent
          className="w-[50vw] sm:max-w-[50vw] overflow-y-auto"
          data-testid="sheet-raise-advance-invoice"
        >
          <SheetHeader>
            <SheetTitle>Advance Invoice - {po?.po_number}</SheetTitle>
            <SheetDescription>
              Submit an advance payment invoice against this purchase order.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Supplier</Label>
                <p className="text-sm font-semibold">{po?.supplier?.supplier_name || po?.company_name}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Advance Percentage</Label>
                <p className="text-sm font-semibold">{po?.advance_percentage}%</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={advanceInvoiceForm.invoice_description}
                  onChange={(e) =>
                    setAdvanceInvoiceForm((prev) => ({
                      ...prev,
                      invoice_description: e.target.value,
                    }))
                  }
                  placeholder="Enter invoice description"
                  rows={2}
                  data-testid="input-advance-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Invoice Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={advanceInvoiceForm.invoice_number}
                    onChange={(e) => {
                      setAdvanceInvoiceForm((prev) => ({
                        ...prev,
                        invoice_number: e.target.value,
                      }));
                    }}
                    placeholder="Enter invoice number"
                    data-testid="input-advance-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Advance Amount ({po?.po_currency || "AED"})
                  </Label>
                  <Input
                    value={advanceInvoiceForm.invoice_amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    readOnly
                    className="bg-muted font-mono"
                    data-testid="input-advance-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Invoice Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={advanceInvoiceForm.invoice_date}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setAdvanceInvoiceForm((prev) => ({
                        ...prev,
                        invoice_date: newDate,
                        invoice_due_date: getDueDateFormatted(newDate, po?.payment_terms_name) || prev.invoice_due_date,
                      }));
                    }}
                    data-testid="input-advance-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Invoice Due Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={advanceInvoiceForm.invoice_due_date}
                    onChange={(e) =>
                      setAdvanceInvoiceForm((prev) => ({
                        ...prev,
                        invoice_due_date: e.target.value,
                      }))
                    }
                    readOnly={!!po?.payment_terms_name}
                    data-testid="input-advance-due-date"
                  />
                </div>
              </div>

              <div className="flex flex-col h-full mt-4">
                <h3 className="text-sm font-semibold mb-2">
                  Click here or Drag and Drop to Upload Documents{" "}
                  <span className="text-destructive">*</span>
                </h3>
                <div className="flex-1 overflow-y-auto max-h-[420px] space-y-2 border rounded-md p-2">
                  {advanceInvoiceDocuments.map((doc) => {
                    const isPdf =
                      doc.file?.type === "application/pdf" ||
                      doc.name.toLowerCase().endsWith(".pdf");
                    const isImage =
                      doc.file?.type?.startsWith("image/") ||
                      doc.name.toLowerCase().match(/\.(jpg|jpeg|png)$/);
                    return (
                      <div
                        key={doc.id}
                        className="relative border rounded-md overflow-hidden group"
                        data-testid={`adv-doc-item-${doc.id}`}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-0.5 right-0.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/70"
                          onClick={() => removeAdvInvoiceDocument(doc.id)}
                          data-testid={`button-remove-adv-doc-${doc.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        {doc.previewUrl ? (
                          <img
                            src={doc.previewUrl}
                            alt={doc.name}
                            className="w-full h-[280px] object-cover rounded-t"
                          />
                        ) : isPdf ? (
                          <div className="flex justify-center py-8">
                            <FileText className="h-12 w-12 text-red-500/70" />
                          </div>
                        ) : isImage ? (
                          <div className="flex justify-center py-8">
                            <FileImage className="h-12 w-12 text-blue-500/70" />
                          </div>
                        ) : (
                          <div className="flex justify-center py-8">
                            <File className="h-12 w-12 text-muted-foreground/70" />
                          </div>
                        )}
                        <div className="p-1.5 bg-muted/30 border-t">
                          <p className="text-[11px] font-medium text-primary truncate" title={doc.name}>
                            {doc.name}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  <div
                    className="border-2 border-dashed rounded-md text-center cursor-pointer hover-elevate py-8"
                    onClick={() => advanceInvoiceFileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        if (advanceInvoiceFileInputRef.current) {
                          advanceInvoiceFileInputRef.current.files = dt.files;
                          advanceInvoiceFileInputRef.current.dispatchEvent(
                            new Event("change", { bubbles: true }),
                          );
                        }
                      }
                    }}
                    data-testid="dropzone-adv-invoice-file"
                  >
                    <Input
                      ref={advanceInvoiceFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={handleAdvInvoiceFileSelect}
                      className="hidden"
                      data-testid="input-adv-invoice-file"
                    />
                    <Upload className="h-8 w-8 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground font-medium">Upload</p>
                    <p className="text-[10px] text-destructive mt-0.5">
                      Allowed: PDF, Image (JPEG, PNG)
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <Checkbox
                  id="terms-advance"
                  checked={agreeToTermsAdvance}
                  onCheckedChange={(checked) => setAgreeToTermsAdvance(!!checked)}
                  data-testid="checkbox-advance-terms"
                />
                <Label
                  htmlFor="terms-advance"
                  className="text-sm cursor-pointer"
                >
                  I Agree to{" "}
                  <TermsConditions type="PO Preview Submit Invoice" className="text-primary underline" />
                </Label>
              </div>
            </div>
          </div>
          <SheetFooter className="pt-6">
            <Button
              variant="outline"
              onClick={() => setIsAdvanceInvoiceOpen(false)}
              className="mr-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!advanceInvoiceForm.invoice_description.trim()) {
                  toast({
                    title: "Description is required",
                    variant: "destructive",
                  });
                  return;
                }
                if (!advanceInvoiceForm.invoice_number.trim()) {
                  toast({
                    title: "Invoice number is required",
                    variant: "destructive",
                  });
                  return;
                }
                if (!advanceInvoiceForm.invoice_date) {
                  toast({
                    title: "Invoice date is required",
                    variant: "destructive",
                  });
                  return;
                }
                if (!advanceInvoiceForm.invoice_due_date) {
                  toast({
                    title: "Invoice due date is required",
                    variant: "destructive",
                  });
                  return;
                }
                if (advanceInvoiceDocuments.length === 0) {
                  toast({
                    title: "Please upload at least one document",
                    variant: "destructive",
                  });
                  return;
                }
                if (!agreeToTermsAdvance) {
                  toast({
                    title: "Please agree to terms",
                    variant: "destructive",
                  });
                  return;
                }
                createAdvanceInvoiceMutation.mutate();
              }}
              disabled={createAdvanceInvoiceMutation.isPending}
              data-testid="button-submit-advance"
            >
              {createAdvanceInvoiceMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Submit Advance Invoice
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Import Line Items from Excel — 3-step dialog */}
      <Dialog
        open={isLinesImportOpen}
        onOpenChange={(open) => {
          setIsLinesImportOpen(open);
          if (!open) { setLinesImportFile(null); setLinesImportPreview(null); setLinesImportResults(null); }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import Line Items from Excel
            </DialogTitle>
            <DialogDescription>
              {linesImportResults
                ? "Import complete. See results below."
                : linesImportPreview
                  ? "Review the rows below. Rows with errors will be skipped."
                  : "Upload an Excel file to bulk-add line items."}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: file selection */}
          {!linesImportPreview && !linesImportResults && (
            <div className="space-y-4">
              <div className="rounded-md border border-dashed p-4 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Required: Item ,Quantity, Unit Price<br />
                  Optional: Unit of Measure, Tax Rate (%)
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => excelFileRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {linesImportFile ? linesImportFile.name : "Choose File"}
              </Button>
              {linesImportFile && (
                <p className="text-xs text-muted-foreground text-center">
                  {(linesImportFile.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          )}

          {/* Step 2: review */}
          {linesImportPreview && !linesImportResults && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm pb-1 border-b">
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {linesImportPreview.valid} will be imported
                </span>
                {linesImportPreview.invalid > 0 && (
                  <span className="flex items-center gap-1 text-destructive font-medium">
                    <XCircle className="h-4 w-4" />
                    {linesImportPreview.invalid} will be skipped
                  </span>
                )}
                <span className="text-muted-foreground ml-auto">of {linesImportPreview.total} total</span>
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
                {linesImportPreview.results.map((r, i) => (
                  <div
                    key={i}
                    className={`rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${r.valid ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-destructive/30 bg-destructive/5"}`}
                  >
                    {r.valid
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        Row {r.rowNumber}: {r.description}
                        {r.valid && <span className="ml-2 text-muted-foreground font-normal">Qty {r.quantity} × {r.unitPrice.toFixed(2)}</span>}
                      </p>
                      {r.errors.length > 0 && (
                        <ul className="text-xs text-destructive mt-0.5 space-y-0.5">
                          {r.errors.map((e, j) => <li key={j}>{e}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: results */}
          {linesImportResults && (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              <div className="flex gap-3 text-sm">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  {linesImportResults.created} created
                </span>
                {linesImportResults.errors > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-4 w-4" />
                    {linesImportResults.errors} failed
                  </span>
                )}
                <span className="text-muted-foreground">of {linesImportResults.total} total</span>
              </div>
              <div className="space-y-1">
                {linesImportResults.results.map((r, i) => (
                  <div
                    key={i}
                    className={`rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${r.success ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-destructive/30 bg-destructive/5"}`}
                  >
                    {r.success
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium truncate">Row {r.rowNumber}: {r.description}</p>
                      {r.errors && r.errors.length > 0 && (
                        <ul className="text-xs text-destructive mt-0.5 space-y-0.5">
                          {r.errors.map((e, j) => <li key={j}>{e}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {/* Step 1 footer */}
            {!linesImportPreview && !linesImportResults && (
              <>
                <Button variant="outline" onClick={() => { setIsLinesImportOpen(false); setLinesImportFile(null); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => linesImportFile && validateLinesImportMutation.mutate(linesImportFile)}
                  disabled={!linesImportFile || validateLinesImportMutation.isPending}
                >
                  {validateLinesImportMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Review
                </Button>
              </>
            )}
            {/* Step 2 footer */}
            {linesImportPreview && !linesImportResults && (
              <>
                <Button variant="outline" onClick={() => { setLinesImportPreview(null); setLinesImportFile(null); }}>
                  Back
                </Button>
                <Button
                  onClick={() => linesImportFile && bulkImportLinesMutation.mutate(linesImportFile)}
                  disabled={linesImportPreview.valid === 0 || bulkImportLinesMutation.isPending}
                >
                  {bulkImportLinesMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  <Upload className="h-4 w-4 mr-1" />
                  Import {linesImportPreview.valid > 0 ? `${linesImportPreview.valid} Line${linesImportPreview.valid !== 1 ? "s" : ""}` : ""}
                </Button>
              </>
            )}
            {/* Step 3 footer */}
            {linesImportResults && (
              <>
                <Button variant="outline" onClick={() => { setIsLinesImportOpen(false); setLinesImportResults(null); setLinesImportFile(null); }}>
                  Close
                </Button>
                {linesImportResults.errors > 0 && (
                  <Button variant="outline" onClick={() => { setLinesImportResults(null); setLinesImportPreview(null); setLinesImportFile(null); }}>
                    Import Again
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={openEvaluation} onOpenChange={setOpenEvaluation}>
        <SheetContent side="right" className="w-[80vw] sm:max-w-[80vw] overflow-y-auto p-0 pt-10">
          <EvaluationScore
            poNumber={po?.po_number}
            evaluationId={po?.attribute_4}
            status={po?.attribute_2}
            initialResponses={savedResponses}
            closeScoreModal={(questions: Question[], comment: string, isDraft?: boolean) => {
              setOpenEvaluation(false);
              setSavedResponses({ questions, comment });
              if (!isDraft) {
                setOpenReviewModal(true);
                setOpenResult(false);
              }
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={openReviewModal} onOpenChange={setOpenReviewModal}>
        <SheetContent side="right" className="w-[80vw] sm:max-w-[80vw] overflow-y-auto p-0 pt-10">
          <EvaluationReview poNumber={po?.po_number} evaluationId={po?.attribute_4} savedResponses={savedResponses} submittedResponse={submittedResponse} openResult={openResult} goBack={() => {
            setOpenReviewModal(false);
            setOpenEvaluation(true);
          }} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
