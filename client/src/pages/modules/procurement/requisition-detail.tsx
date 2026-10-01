import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import { ViewChecklistButton } from "@/components/view-checklist-button";
import {
  checkRequisitionSubmitReadiness,
  describeMissingRequirements,
} from "@shared/requisition-submit-readiness";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import {
  CollaborationPanel,
  CollaborationPanelRef,
} from "@/components/collaboration-panel";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  Copy,
  DollarSign,
  Download,
  Eye,
  FileCheck,
  FileText,
  HelpCircle,
  Loader2,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  User,
  Wallet,
  XCircle,
} from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";

interface RequisitionLine {
  id: number;
  pr_number: string;
  line_num: number;
  line_type: string | null;
  item_description: string | null;
  uom: string | null;
  unit_cost: string | null;
  qty: string | null;
  amount: string | null;
  status: string | null;
  need_by_date: string | null;
  product_category: number | null;
  product_category_name: string | null;
  item_id: number | null;
  buyer: string | null;
  requestor: string | null;
  supplier_name: string | null;
  curr_code: string | null;
  po_number: string | null;
}

interface RequisitionHeader {
  pr_number: string;
  pr_description: string | null;
  pr_status: string | null;
  pr_type: string | null;
  pr_amount: string | null;
  currency: string | null;
  department_name: string | null;
  requestor_id: number | null;
  requestor_name: string | null;
  requestor_email: string | null;
  pr_owner_id: number | null;
  pr_owner_name: string | null;
  pr_owner_email: string | null;
  pr_created_date: string | null;
  approved_date: string | null;
  delivertto_location_id: number | null;
  delivertto_location_name: string | null;
  delivery_date: string | null;
  operating_unit: number | null;
  is_contract_required: string | null;
  closed_code: string | null;
  po_number: string | null;
  notes: string | null;
  notes_to_approver: string | null;
  budget_name: string | null;
  budget_segment: string | null;
  budgeted: boolean | null;
  estimated_cost: string | null;
  billto_address: string | null;
  shipto_address: string | null;
  approvers_list: string | null;
  bidno: number | null;
  bid_award_id: string | null;
  org_id: number | null;
  external_pr_no: string | null;
  business_justification: string | null;
  business_justification_reason: string | null;
  business_justification_details: string | null;
  attribute_12: string | null;
  created_by: string | null;
}

interface ApprovalHistoryItem {
  id: number;
  object_id: string;
  approver_id: number;
  approver_name: string;
  email: string | null;
  designation: string | null;
  status: string;
  comments: string | null;
  approved_date: string | null;
  requested_date: string | null;
  attribute_1: string;
}

interface LinkedPurchaseOrder {
  po_number: string;
  po_status: string | null;
}

interface RequisitionResponse {
  header: RequisitionHeader;
  lines: RequisitionLine[];
  approvalHistory: ApprovalHistoryItem[];
  linkedPos?: LinkedPurchaseOrder[];
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
  Rejected: { label: "Rejected", icon: XCircle, variant: "destructive" },
  Cancelled: { label: "Cancelled", icon: XCircle, variant: "destructive" },
  "More Info Required": {
    label: "More Info Required",
    icon: AlertTriangle,
    variant: "outline",
    className: "border-amber-300 text-amber-600 dark:text-amber-400",
  },
};

/** Blank line-item form state — used both as the initial value and to reset
 *  the Add/Edit Line Item sheet (on close and via its "Reset all" button). */
const EMPTY_NEW_LINE_ITEM = {
  description: "",
  quantity: "1",
  unitPrice: "",
  uom: "",
  categoryCode: "",
  categoryName: "",
  itemId: "",
  itemName: "",
};

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

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function LineStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="secondary">-</Badge>;

  const statusLower = status.toLowerCase();
  if (statusLower.includes("approved")) {
    return (
      <Badge variant="default" className="bg-emerald-600">
        {status}
      </Badge>
    );
  }
  if (statusLower.includes("pending") || statusLower.includes("info")) {
    return (
      <Badge variant="outline" className="border-orange-300 text-orange-600">
        {status}
      </Badge>
    );
  }
  if (statusLower.includes("reject") || statusLower.includes("cancel")) {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

interface Location {
  id: number;
  location_id: string;
  location_name: string;
  status: string;
  org_id: string;
}

interface UserRecord {
  id: number;
  user_id: string;
  name: string;
  user_name: string;
  email_id?: string;
  department_name?: string;
  user_type?: number;
  org_id: string;
}

interface Department {
  id: number;
  code: string;
  value: string;
  status: string;
}

interface BudgetLine {
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
  loc_id: string;
}

interface Organization {
  id: number;
  organization_name: string;
}

interface EditPRForm {
  description: string;
  deliveryLocation: string;
  needByDate: string;
  requestorId: string;
  requestorDepartment: string;
  buyerId: string;
  currency: string;
  isBudgeted: string;
  budgetId: string;
  orgId: string;
}

export default function RequisitionDetail() {
  const [, params] = useRoute("/app/requisitions/:prNumber");
  const prNumber = params?.prNumber;
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { isAIEnabled } = useAISettings();
  const [addLineSheetOpen, setAddLineSheetOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [reSubmitConfirmOpen, setReSubmitConfirmOpen] = useState(false);
  const [deleteLineConfirmOpen, setDeleteLineConfirmOpen] = useState(false);
  const [lineToDelete, setLineToDelete] = useState<number | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<
    "Approve" | "Reject" | "More" | "Request" | "ReSubmit"
  >("Approve");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [delegateApproverId, setDelegateApproverId] = useState("");

  const { data: delegateApprovers = [] } = useQuery<
    { id: number; name: string; user_name: string }[]
  >({
    queryKey: ["/api/users/dropdown"],
    enabled: approvalDialogOpen && approvalAction === "Request",
  });
  const [budgetValidation, setBudgetValidation] = useState<{
    isWithinBudget: boolean;
    totalAmount: number;
    departmentBudget: number;
    warnings: string[];
    severity: "low" | "medium" | "high";
  } | null>(null);
  const [newLineItem, setNewLineItem] = useState(EMPTY_NEW_LINE_ITEM);

  const sanitizeDecimalInput = (value: string) =>
    value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

  const sanitizeIntegerInput = (value: string) => value.replace(/\D/g, "");
  const preventInvalidNumberKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (["e", "E", "-", "+"].includes(e.key)) {
      e.preventDefault();
    }
  };

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemEntryMode, setItemEntryMode] = useState<"master" | "freetext">(
    "master",
  );

  // Excel import state
  const [isLinesImportOpen, setIsLinesImportOpen] = useState(false);
  const [linesImportFile, setLinesImportFile] = useState<File | null>(null);
  const [linesImportPreview, setLinesImportPreview] = useState<{
    total: number; valid: number; invalid: number;
    results: { rowNumber: number; description: string; quantity: number; unitPrice: number; valid: boolean; errors: string[] }[];
  } | null>(null);
  const [linesImportResults, setLinesImportResults] = useState<{
    created: number; errors: number; total: number;
    results: { rowNumber: number; description: string; success: boolean; lineId?: number; errors?: string[] }[];
  } | null>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState<EditPRForm>({
    description: "",
    deliveryLocation: "",
    needByDate: "",
    requestorId: "",
    requestorDepartment: "",
    buyerId: "",
    currency: "AED",
    isBudgeted: "yes",
    budgetId: "",
    orgId: "",
  });

  // Collaboration Panel ref
  const collaborationPanelRef = useRef<CollaborationPanelRef>(null);
  const [collaborationCount, setCollaborationCount] = useState(0);

  // Get current user info from localStorage
  const authData = localStorage.getItem("prokraya-auth");
  const currentUserId = authData ? JSON.parse(authData).userId : null;
  const currentUserName = authData ? JSON.parse(authData).userName : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const userOrgIds: string[] = authParsed?.orgIds
    ? authParsed.orgIds.split(",").map((id: string) => id.trim())
    : [];
  const isSuperadmin = authParsed?.userRole === "ROLE_SUPERADMIN" || authParsed?.userRole === "ROLE_SYSADMIN";
  // Fetch current user profile with roles
  const { data: currentUserProfile } = useQuery<{
    user_name: string;
    email_id: string;
    name: string;
    roles: { role_name: string }[];
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

  // Fetch requisition data
  const { data, isLoading, error } = useQuery<RequisitionResponse>({
    queryKey: [`/api/requisitions/${prNumber}`],
    enabled: !!prNumber,
  });

  // Common data shortcuts
  const header = data?.header;
  const lines = data?.lines || [];
  const totalAmount = lines.reduce((sum, line) => {
    const amt = parseFloat(line.amount || "0");
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const isOwner = (() => {
    if (!header || !authData) return false;
    const creator = header.created_by?.toLowerCase();
    if (!creator) return true; // Default to true for legacy data
    const currentUserIdentifiers = [
      currentUserName?.toLowerCase(),
      currentUserProfile?.user_name?.toLowerCase(),
      currentUserProfile?.email_id?.toLowerCase()
    ].filter(Boolean);
    return currentUserIdentifiers.includes(creator);
  })();

  // Get user's role names for checking approval authorization
  const userRoleNames =
    currentUserProfile?.roles?.map((r) => r.role_name) || [];

  // Get taskId from sessionStorage (set when navigating from my-tasks)
  const [taskId, setTaskId] = useState<string | null>(null);
  useEffect(() => {
    const storedTaskId = sessionStorage.getItem("currentTaskId");
    console.log("Reading taskId from sessionStorage:", storedTaskId);
    setTaskId(storedTaskId);
  }, []);

  // Fetch task details to get current owner
  const { data: taskDetails } = useQuery<{
    assignee_: string | null;
    id_: string;
  }>({
    queryKey: ["/api/workflow-engine/task", taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const res = await apiRequest("GET", 
        `/api/workflow-engine/task/${encodeURIComponent(taskId)}`,
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!taskId,
  });

  // Check if current user can approve this task
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


  // Lookup queries for edit form
  const { data: locationsData } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: isEditOpen,
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });
  const locations = (locationsData || []).filter(
    (loc) => loc.status === "Y" && (!editForm.orgId || String(loc.org_id) === String(editForm.orgId))
  );

  const { data: usersData } = useQuery<UserRecord[]>({
    queryKey: ["/api/users/dropdown"],
    enabled: isEditOpen,
  });
  
  const roles = ["ROLE_PROCUREMENT_OFFICER", "ROLE_PROCUREMENT_MANAGER"];
  const { data: buyersData } = useQuery<
    {
      id: number;
      user_id: string;
      user_name: string;
      name: string;
      email_id: string;
      department_name: string | null;
      org_id: string;
    }[]
  >({
    queryKey: ["/api/users/dropdown", roles],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (roles?.length) {
        params.append("roles", roles.join(","));
      }
      const res = await apiRequest("GET", `/api/users/dropdown?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });
  const users = usersData || [];
  const buyers = buyersData || [];

  const { data: departmentsData } = useQuery<{ data: Department[] }>({
    queryKey: ["/api/cost-centers/3/items?limit=100"],
    enabled: isEditOpen,
  });
  const departments =
    departmentsData?.data?.filter((d) => d.status === "Y") || [];

  const { data: budgetLinesData } = useQuery<BudgetLine[]>({
    queryKey: ["/api/budgets/approved-lines"],
  });
  const budgetLines = budgetLinesData || [];

  const filteredBudgets = budgetLines?.filter((item) => {

    const matchOrg =
      !editForm.orgId || item.business_entity === editForm.orgId;

    const matchDept =
      !editForm.requestorDepartment ||
      String(item.dept_id) === String(editForm.requestorDepartment);

    const matchLoc =
      !editForm.deliveryLocation ||
      String(item.loc_id) === String(editForm.deliveryLocation);

    return matchOrg && matchDept && matchLoc;
  });

  const uniqueBudgets = Array.from(
    new Map(
      filteredBudgets?.map((item) => [item.id, item])
    ).values()
  );

  // Fetch categories for line item dropdown
  const { data: categoriesData } = useQuery<
    { id: string; code: string; name: string; level: string }[]
  >({
    queryKey: ["/api/categories"],
    enabled: addLineSheetOpen || isLinesImportOpen,
  });
  const categories = categoriesData || [];

  // Fetch items for item master dropdown
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
    enabled: addLineSheetOpen && itemEntryMode === "master",
  });
  const items = itemsData || [];

  // Fetch UOM values from lookup table
  const { data: uomData } = useQuery<{ id: number; description: string }[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: addLineSheetOpen || isLinesImportOpen,
  });
  const uomOptions = uomData || [];

  const { data: currencyOptions = [] } = useQuery<
    { value: string; label: string }[]
  >({
    queryKey: ["/api/vendor/lookups/currencies"],
  });

  // Notes query for collaboration panel (notes are module-specific)
  const { data: notesData, isLoading: notesLoading } = useQuery<{
    notes: string;
  }>({
    queryKey: [`/api/requisitions/${prNumber}/notes`],
    enabled: !!prNumber,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/requisitions/${prNumber}`);
    },
    onSuccess: () => {
      toast({
        title: "PR Deleted",
        description: "Purchase requisition has been deleted successfully.",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions"] });
      navigate("/app/purchase-requests");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete PR",
        description: error.message,
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (isMoreInfoRequired) {
        const storedTaskId = header?.attribute_12 !== undefined && header?.attribute_12 !== null
            ? header.attribute_12
            : sessionStorage.getItem("currentTaskId");
        return apiRequest("POST", `/api/requisitions/${prNumber}/process-approval`, {
          taskId: storedTaskId,
          result: "resubmit",
          comments: "PR Resubmitted"
        });
      }
      return apiRequest("POST", `/api/requisitions/${prNumber}/submit`);
    },
    onSuccess: () => {
      toast({
        title: "PR Submitted",
        description: "Purchase requisition has been submitted for approval.",
        duration: 5000,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/requisitions/${prNumber}`],
      });
      setSubmitConfirmOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit PR",
        description: error.message,
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const budgetCheckMutation = useMutation({
    mutationFn: async () => {
      const matchingBudgetLine = budgetLines.find(
        (bl) => String(bl.id) === String(header?.budget_segment),
      );
      const res = await apiRequest(
        "POST",
        "/api/purchase-requests/ai/validate-budget",
        {
          department: header?.department_name || "",
          totalAmount: totalAmount,
          title: header?.pr_description || "",
          budgetLineId: matchingBudgetLine?.id ?? null,
          currency: header?.currency || "",
          prNumber: header?.pr_number || "",
        },
      );
      return res.json();
    },
    onSuccess: (data: any) => {
      setBudgetValidation(data);
      if (data.warnings?.length === 0) {
        toast({
          title: "Budget Check Passed",
          description: "This PR is within budget limits.",
        });
      } else {
        toast({
          title: data.isWithinBudget ? "Budget Check Warning" : "Budget Check Failed",
          description: data.warnings?.[0] || "This PR exceeds budget limits.",
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

  // Shared submit-for-approval validation, used by both the header's Submit
  // button and the sidebar action card so the two stay in sync.
  const handleSubmitForApproval = () => {
    if (!header) return;
    const readiness = checkRequisitionSubmitReadiness(header, lines?.length || 0);
    if (!readiness.ready) {
      toast({
        title: "Cannot submit requisition",
        description: `Please complete ${describeMissingRequirements(readiness.missing)} before submitting for approval.`,
        variant: "destructive",
        duration: 6000,
      });
      return;
    }

    const prAmount = parseFloat(header.pr_amount || totalAmount.toString() || "0");
    if (isNaN(prAmount) || prAmount <= 0) {
      toast({
        title: "Cannot submit requisition",
        description: "PR amount must be greater than 0 to submit for approval.",
        variant: "destructive",
      });
      return;
    }

    if (isAIEnabled("AI_BUDGET_VALIDATION") && header?.budget_name) {
      if (!budgetValidation) {
        toast({
          title: "Budget check required",
          description: "Please run the budget check before submitting this PR for approval.",
          variant: "destructive",
        });
        return;
      }
      if (!budgetValidation.isWithinBudget) {
        toast({
          title: "Cannot submit — over budget",
          description: "This PR exceeds the available budget. Please adjust the PR or contact your budget owner.",
          variant: "destructive",
          duration: 6000,
        });
        return;
      }
    }

    setSubmitConfirmOpen(true);
  };

  const approvalMutation = useMutation({
    mutationFn: async (data: { action: string; remarks: string }) => {
      // Get taskId from sessionStorage
      //const storedTaskId = sessionStorage.getItem("currentTaskId");
      const storedTaskId = header?.attribute_12 !== undefined && header?.attribute_12 !== null
        ? header?.attribute_12
        : sessionStorage.getItem("currentTaskId");
      console.log("Sending approval with taskId:", storedTaskId);
      return apiRequest(
        "POST",
        `/api/requisitions/${prNumber}/process-approval`,
        {
          taskId: storedTaskId,
          result: data.action,
          comments: data.remarks,
        },
      );
    },
    onSuccess: (_, variables) => {
      const actionMessages: Record<string, string> = {
        Approve: "Purchase requisition has been approved.",
        Reject: "Purchase requisition has been rejected.",
        More: "Request for more information has been sent.",
      };
      toast({
        title:
          variables.action === "Approve"
            ? "PR Approved"
            : variables.action === "Reject"
              ? "PR Rejected"
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
        queryKey: [`/api/requisitions/${prNumber}`],
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
      const storedTaskId = header?.attribute_12 !== undefined && header?.attribute_12 !== null
        ? header?.attribute_12
        : sessionStorage.getItem("currentTaskId");
      return apiRequest("POST", "/api/workflow/delegate-request", {
        taskId: storedTaskId,
        userName: data.userName,
        comments: data.comments,
        entityId: prNumber,
        module: "PR",
      });
    },
    onSuccess: () => {
      toast({
        title: "Request Delegated",
        description: "Purchase requisition approval has been delegated.",
        duration: 5000,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/requisitions/${prNumber}`],
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
      isEditOpen ||
      addLineSheetOpen ||
      deleteLineConfirmOpen ||
      isLinesImportOpen ||
      categoryOpen ||
      itemOpen;

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
            // Only remove if it's not part of a currently opening modal (double check)
            el.removeAttribute('aria-hidden');
          });

          console.log("Modal Janitor: DOM Cleanup completed.");
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [
    submitConfirmOpen,
    reSubmitConfirmOpen,
    approvalDialogOpen,
    isEditOpen,
    addLineSheetOpen,
    deleteLineConfirmOpen,
    isLinesImportOpen,
    categoryOpen,
    itemOpen
  ]);

  const updatePRMutation = useMutation({
    mutationFn: async (formData: EditPRForm) => {
      return apiRequest("PUT", `/api/requisitions/${prNumber}`, formData);
    },
    onSuccess: () => {
      toast({
        title: "PR Updated",
        description: "Purchase requisition has been updated successfully.",
        duration: 5000,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/requisitions/${prNumber}`],
      });
      setIsEditOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update PR",
        description: error.message,
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  // Collaboration mutations
  // Notes save handler for collaboration panel
  const handleSaveNotes = async (notes: string) => {
    await apiRequest("PUT", `/api/requisitions/${prNumber}/notes`, { notes });
    queryClient.invalidateQueries({
      queryKey: [`/api/requisitions/${prNumber}/notes`],
    });
  };

  // Track if edit form has been initialized to prevent resetting on dependency changes
  const editFormInitialized = useRef(false);

  // Reset the initialized flag when sheet closes
  useEffect(() => {
    if (!isEditOpen) {
      editFormInitialized.current = false;
    }
  }, [isEditOpen]);

  // Populate edit form only once when opening the edit sheet
  // Shared by the initial-open effect below and the "Reset all" button —
  // both need to rebuild the edit form from the PR header exactly the same way.
  const buildInitialEditForm = () => {
    const header = data?.header;
    if (!header) return null;
    const matchingLocation = locations.find(
      (l) => l.location_name === header.delivertto_location_name,
    );
    const matchingDept = departments.find(
      (d) => d.value === header.department_name,
    );
    const matchingBudget = budgetLines.find(
      (bl) => String(bl.id) === String(header?.budget_segment),
    );

    return {
      description: header.pr_description || "",
      deliveryLocation: matchingLocation?.id?.toString() || "",
      needByDate: header.delivery_date
        ? header.delivery_date.split("T")[0]
        : "",
      requestorId: header.requestor_id?.toString() || "",
      requestorDepartment: matchingDept?.id?.toString() || "",
      buyerId: header.pr_owner_id?.toString() || "",
      currency: header.currency || "AED",
      isBudgeted: header.budgeted ? "yes" : "no",
      budgetId: matchingBudget?.id?.toString() || "",
      orgId: header.org_id?.toString() || "",
    };
  };

  useEffect(() => {
    if (
      isEditOpen &&
      data?.header &&
      !editFormInitialized.current &&
      locations.length > 0 &&
      departments.length > 0
    ) {
      editFormInitialized.current = true;
      const initial = buildInitialEditForm();
      if (initial) setEditForm(initial);
    }
  }, [isEditOpen, data?.header, locations, departments, budgetLines, organizations]);

  const handleUpdatePR = () => {
    updatePRMutation.mutate(editForm);
  };

  const handleResetEditForm = () => {
    const initial = buildInitialEditForm();
    if (initial) setEditForm(initial);
  };

  const handleOpenAddLine = () => {
    setAddLineSheetOpen(true);
  };

  const handleResetLineForm = () => {
    setNewLineItem(EMPTY_NEW_LINE_ITEM);
  };

  const handleSaveLine = async () => {
    const price = parseFloat(newLineItem.unitPrice);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Invalid Unit Price",
        description: "Unit price must be greater than 0.",
        variant: "destructive",
      });
      return;
    }
    setIsSavingLine(true);
    try {
      if (editingLineId) {
        // Update existing line
        await apiRequest(
          "PUT",
          `/api/requisitions/${prNumber}/lines/${editingLineId}`,
          {
            itemDescription: newLineItem.description,
            quantity: parseFloat(newLineItem.quantity) || 1,
            unitCost: parseFloat(newLineItem.unitPrice) || 0,
            uom: newLineItem.uom || "Each",
            categoryId: newLineItem.categoryCode || null,
            categoryName: newLineItem.categoryName || null,
            itemId: newLineItem.itemId || null,
          },
        );
        toast({
          title: "Line Updated",
          description: "Line item updated successfully",
        });
      } else {
        // Add new line
        await apiRequest(
          "POST",
          `/api/requisitions/${prNumber}/lines`,
          {
            itemDescription: newLineItem.description,
            quantity: parseFloat(newLineItem.quantity) || 1,
            unitCost: parseFloat(newLineItem.unitPrice) || 0,
            uom: newLineItem.uom || "Each",
            categoryId: newLineItem.categoryCode || null,
            categoryName: newLineItem.categoryName || null,
            itemId: newLineItem.itemId || null,
          },
        );
        toast({
          title: "Line Added",
          description: "Line item added successfully",
        });
      }
      queryClient.invalidateQueries({
        queryKey: [`/api/requisitions/${prNumber}`],
      });
      setAddLineSheetOpen(false);
      setEditingLineId(null);
      setNewLineItem(EMPTY_NEW_LINE_ITEM);
    } catch (error) {
      console.error("Failed to save line:", error);
      toast({
        title: "Error",
        description: editingLineId
          ? "Failed to update line item"
          : "Failed to add line item",
        variant: "destructive",
      });
    } finally {
      setIsSavingLine(false);
    }
  };

  const validateLinesImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("POST", `/api/requisitions/${prNumber}/lines/bulk-import/validate`, formData);
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
      const response = await apiRequest("POST", `/api/requisitions/${prNumber}/lines/bulk-import`, formData);
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
        queryClient.invalidateQueries({ queryKey: [`/api/requisitions/${prNumber}`] });
        toast({ title: "Import complete", description: `${data.created} line${data.created !== 1 ? "s" : ""} created${data.errors > 0 ? `, ${data.errors} failed` : ""}` });
      } else {
        toast({ title: "Import failed", description: "No lines were created", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  // Duplicates a line item by re-posting its fields through the standard
  // "create line" endpoint.
  const duplicateLineMutation = useMutation({
    mutationFn: async (line: RequisitionLine) => {
      return apiRequest("POST", `/api/requisitions/${prNumber}/lines`, {
        itemDescription: line.item_description || "",
        quantity: line.qty ? Number(line.qty) : 1,
        unitCost: line.unit_cost ? Number(line.unit_cost) : 0,
        uom: line.uom || "Each",
        categoryId: line.product_category ? String(line.product_category) : null,
        categoryName: line.product_category_name || null,
        itemId: line.item_id ? String(line.item_id) : null,
      });
    },
    onSuccess: () => {
      toast({
        title: "Line duplicated",
        description: "A copy of the line item has been added.",
        duration: 4000,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/requisitions/${prNumber}`],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to duplicate line",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteLine = async () => {
    if (!lineToDelete) return;
    try {
      await apiRequest(
        "DELETE",
        `/api/requisitions/${prNumber}/lines/${lineToDelete}`,
      );
      toast({
        title: "Line Deleted",
        description: "Line item deleted successfully",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/requisitions/${prNumber}`],
      });
    } catch (error) {
      console.error("Failed to delete line:", error);
      toast({
        title: "Error",
        description: "Failed to delete line item",
        variant: "destructive",
      });
    } finally {
      setDeleteLineConfirmOpen(false);
      setLineToDelete(null);
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
  // the same /api/requisitions/:prNumber/documents endpoints the
  // CollaborationPanel below already calls for this same PR. Declared above
  // the isLoading early-return so these hooks always run (Rules of Hooks).
  const prDocumentsUrl = `/api/requisitions/${prNumber}/documents`;
  const { data: prDocumentsData } = useQuery<
    { id: number; file_name: string; file_path: string; created_by: string; created_date: string }[]
  >({
    queryKey: [prDocumentsUrl],
    enabled: !!prNumber,
  });
  const prDocuments = prDocumentsData || [];
  const uploadDocInputRef = useRef<HTMLInputElement>(null);

  const uploadPrDocumentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(prDocumentsUrl, {
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
      queryClient.invalidateQueries({ queryKey: [prDocumentsUrl] });
      toast({ title: "Document added", description: "Document has been attached to this requisition." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add document", description: error.message, variant: "destructive" });
    },
  });

  const handleViewPrDocument = async (doc: { id: number; file_name: string }) => {
    try {
      const res = await fetch(`${prDocumentsUrl}/${doc.id}/download`, {
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

  const deletePrDocumentMutation = useMutation({
    mutationFn: async (docId: number) => apiRequest("DELETE", `${prDocumentsUrl}/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [prDocumentsUrl] });
      toast({ title: "Document deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete document", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data || !header) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
            <h3 className="text-base font-medium mb-1">
              Requisition Not Found
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Unable to load requisition {prNumber}
            </p>
            <Link href="/app/purchase-requests">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Requisitions
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDraft = header.pr_status?.toLowerCase() === "draft";
  const isPendingApproval =
    header.pr_status?.toLowerCase() === "pending approval";
  const isMoreInfoRequired =
    header.pr_status?.toLowerCase() === "more info required";
  const isApproved = header.pr_status?.toLowerCase() === "approved";
  const isRejected = header.pr_status?.toLowerCase() === "rejected";
  const isCancelled = header.pr_status?.toLowerCase() === "cancelled";
  const isComplete = header.pr_status?.toLowerCase() === "complete";

  const linkedPos = data?.linkedPos ?? [];
  const canCancelAfterPoCancelled = (() => {
    if (!isComplete || linkedPos.length === 0) return false;
    const statuses = linkedPos.map((p) =>
      (p.po_status || "").toLowerCase().trim(),
    );
    const activeStatuses = new Set([
      "approved",
      "pending approval",
      "complete",
      "closed",
      "finally closed",
    ]);
    const hasCancelled = statuses.some((s) => s === "cancelled");
    const hasActive = statuses.some((s) => activeStatuses.has(s));
    return hasCancelled && !hasActive;
  })();

  const canShowCancelPr =
    (isSuperadmin || isOwner) &&
    (isApproved || isRejected || canCancelAfterPoCancelled);

  return (
    <div className="flex">
      {/* Main Content Area */}
      <div
        className={`flex-1 min-w-0 p-4 space-y-4 transition-all duration-300 ${collaborationPanelRef.current?.isPinned ? "pr-6" : ""}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/app/purchase-requests">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-testid="button-back-to-requisitions">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className="text-2xl font-bold text-primary leading-tight"
                  data-testid="text-pr-number"
                >
                  {header.pr_number}
                </h1>
                <HelpCircle
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <StatusBadge status={header.pr_status} />
              </div>
              <Link href="/app/purchase-requests">
                <span
                  className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline cursor-pointer"
                  data-testid="link-back-to-requisitions"
                >
                  {header.pr_type || "STANDARD"} Purchase Requisition
                </span>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(isDraft && (isOwner || isSuperadmin)) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive border-destructive/40"
                      data-testid="button-delete-pr"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete Purchase Requisition
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this purchase
                        requisition? This action cannot be undone.
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
            {(isDraft && (isOwner || isSuperadmin)) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                  data-testid="button-edit-pr"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Save as draft
                </Button>

                {isAIEnabled("AI_BUDGET_VALIDATION") && lines.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => budgetCheckMutation.mutate()}
                    disabled={budgetCheckMutation.isPending}
                    data-testid="button-check-budget"
                  >
                    {budgetCheckMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Wallet className="h-4 w-4 mr-2" />
                    )}
                    {budgetCheckMutation.isPending
                      ? "Checking..."
                      : "Check Budget"}
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => {
                    const readiness = checkRequisitionSubmitReadiness(header, lines?.length || 0);
                    if (!readiness.ready) {
                      toast({
                        title: "Cannot submit requisition",
                        description: `Please complete ${describeMissingRequirements(readiness.missing)} before submitting for approval.`,
                        variant: "destructive",
                        duration: 6000,
                      });
                      return;
                    }

                    const prAmount = parseFloat(header.pr_amount || totalAmount.toString() || "0");
                    if (isNaN(prAmount) || prAmount <= 0) {
                      toast({
                        title: "Cannot submit requisition",
                        description:
                          "PR amount must be greater than 0 to submit for approval.",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (isAIEnabled("AI_BUDGET_VALIDATION") && header?.budget_name) {
                      if (!budgetValidation) {
                        toast({
                          title: "Budget check required",
                          description:
                            "Please run the budget check before submitting this PR for approval.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!budgetValidation.isWithinBudget) {
                        toast({
                          title: "Cannot submit — over budget",
                          description:
                            "This PR exceeds the available budget. Please adjust the PR or contact your budget owner.",
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
                  Submit
                </Button>
              </>
            )}

            {(header.pr_status === "More Info Required" || header.pr_status?.toLowerCase() === "more info required" || header.pr_status?.toLowerCase() === "more" || header.pr_status === "More Information Required") && (isOwner || isSuperadmin) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                  data-testid="button-edit-pr"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                {isAIEnabled("AI_BUDGET_VALIDATION") && lines.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => budgetCheckMutation.mutate()}
                    disabled={budgetCheckMutation.isPending}
                    data-testid="button-check-budget-resubmit"
                  >
                    {budgetCheckMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Wallet className="h-4 w-4 mr-2" />
                    )}
                    {budgetCheckMutation.isPending
                      ? "Checking..."
                      : "Check Budget"}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    const readiness = checkRequisitionSubmitReadiness(header, lines?.length || 0);
                    if (!readiness.ready) {
                      toast({
                        title: "Cannot submit requisition",
                        description: `Please complete ${describeMissingRequirements(readiness.missing)} before submitting for approval.`,
                        variant: "destructive",
                        duration: 6000,
                      });
                      return;
                    }

                    const prAmount = parseFloat(header.pr_amount || totalAmount.toString() || "0");
                    if (isNaN(prAmount) || prAmount <= 0) {
                      toast({
                        title: "Cannot submit requisition",
                        description:
                          "PR amount must be greater than 0 to submit for approval.",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (isAIEnabled("AI_BUDGET_VALIDATION") && header?.budget_name) {
                      if (!budgetValidation) {
                        toast({
                          title: "Budget check required",
                          description:
                            "Please run the budget check before submitting this PR for approval.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!budgetValidation.isWithinBudget) {
                        toast({
                          title: "Cannot submit — over budget",
                          description:
                            "This PR exceeds the available budget. Please adjust the PR or contact your budget owner.",
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
            {isPendingApproval && (canApprove || isSuperadmin)  && (
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
                      resolveApprovalChecklistAvailability("Purchase Request").then((available) => {
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

            {isApproved && <ViewChecklistButton moduleName="Purchase Request" refNumber={prNumber} />}

            {/* Copy button - Visible for Approved, Rejected, and Cancelled PRs */}
            {(isApproved || isRejected || isCancelled || isComplete) && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await apiRequest("POST", `/api/requisitions/${prNumber}/copy`);
                    const result = await res.json();
                    toast({
                      title: "PR Copied",
                      description: `New draft PR ${result.prNumber} created successfully.`,
                      duration: 5000,
                    });
                    navigate(`/app/purchase-requests`);
                  } catch (error: any) {
                    toast({
                      title: "Failed to copy PR",
                      description: error.message || "An error occurred",
                      variant: "destructive",
                      duration: 5000,
                    });
                  }
                }}
                data-testid="button-copy-pr"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            )}

            {/* Cancel: Approved/Rejected PRs, or Complete PR after linked PO(s) are cancelled */}
            {canShowCancelPr && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    data-testid="button-cancel-pr"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Cancel Purchase Requisition
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel this purchase requisition?
                      This will mark it as cancelled
                      {canCancelAfterPoCancelled
                        ? " and release the budget reserved on this PR."
                        : "."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-pr-dismiss">
                      Dismiss
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          await apiRequest(
                            "POST",
                            `/api/requisitions/${prNumber}/cancel`,
                          );
                          toast({
                            title: "PR Cancelled",
                            description:
                              "Purchase requisition has been cancelled successfully.",
                            duration: 5000,
                          });
                          queryClient.invalidateQueries({
                            queryKey: [`/api/requisitions/${prNumber}`],
                          });
                          queryClient.invalidateQueries({
                            queryKey: ["/api/requisitions"],
                          });
                          navigate("/app/purchase-requests");
                        } catch (error: any) {
                          toast({
                            title: "Failed to cancel PR",
                            description:
                              error.message || "An error occurred",
                            variant: "destructive",
                            duration: 5000,
                          });
                        }
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-cancel-pr-confirm"
                    >
                      Cancel PR
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Collaboration Button - Always visible */}
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

        <div className="grid gap-4 lg:grid-cols-2">
          {/* PR details card */}
          <Card>
            <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                PR details
              </CardTitle>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  Created on : {formatDate(header.pr_created_date)}
                </p>
                <p className="text-xs font-medium text-primary">
                  Estimated Cost: {formatCurrency(
                    header.estimated_cost || header.pr_amount || totalAmount.toString(),
                    header.currency,
                  )}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4 pt-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  PR Description
                </p>
                <div className="rounded-md border px-3 py-2 text-sm min-h-[38px]" data-testid="text-pr-description">
                  {header.pr_description || "-"}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Delivery Location
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate" title={header.delivertto_location_name || undefined}>
                    {header.delivertto_location_name || "-"}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Need By Date
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    {formatDate(header.delivery_date)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Requestor
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate" title={header.requestor_name || undefined}>
                    {header.requestor_name || "-"}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Requestor Department
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate" title={header.department_name || undefined}>
                    {header.department_name || "-"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Buyer
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm truncate" title={header.pr_owner_name || undefined}>
                    {header.pr_owner_name || "-"}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Currency
                  </p>
                  <div className="rounded-md border px-3 py-2 text-sm">
                    {header.currency || "-"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Budgeted
                  </p>
                  <RadioGroup value={header.budgeted ? "yes" : "no"} className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="yes" id="pr-budgeted-yes-display" disabled />
                      <Label htmlFor="pr-budgeted-yes-display" className="cursor-default text-sm">
                        Yes
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="no" id="pr-budgeted-no-display" disabled />
                      <Label htmlFor="pr-budgeted-no-display" className="cursor-default text-sm">
                        No
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Budget
                  </p>
                  {header.budgeted && header.budget_name ? (() => {
                    const matchedBudgetLine = budgetLines.find(
                      (bl) => String(bl.id) === String(header.budget_segment),
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
                              : `${matchedBudgetLine.budget_curr} `
                      : "";
                    return (
                      <div className="rounded-md border px-3 py-2 text-sm flex items-center justify-between flex-wrap gap-2">
                        <span className="flex items-center gap-1 truncate">
                          <DollarSign className="h-3 w-3 text-muted-foreground shrink-0" />
                          {header.budget_name}
                          {matchedBudgetLine?.segment_dtl_name ? ` · ${matchedBudgetLine.segment_dtl_name}` : ""}
                        </span>
                        {availableAmount !== null && (
                          <span className="text-xs font-medium text-primary shrink-0">
                            Available Amount: {currencySymbol}
                            {availableAmount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">-</div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Notes to Approver
                </p>
                <Textarea
                  value={header.notes_to_approver || ""}
                  readOnly
                  placeholder="No notes to approver provided"
                  rows={2}
                  className="resize-none bg-muted/30"
                  data-testid="text-notes-to-approver"
                />
              </div>

              {(header.org_id || header.po_number || header.business_justification) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                  {header.org_id && (() => {
                    const orgName = organizations.find((o) => String(o.id) === String(header.org_id))?.organization_name;
                    return orgName ? (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          Business Entity
                        </p>
                        <div className="rounded-md border px-3 py-2 text-sm truncate" title={orgName}>
                          {orgName}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {header.po_number && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                        <FileCheck className="h-3 w-3" />
                        Linked PO
                      </p>
                      <div className="rounded-md border px-3 py-2 text-sm">
                        <Badge variant="outline" className="font-mono">
                          {header.po_number}
                        </Badge>
                      </div>
                    </div>
                  )}
                  {header.business_justification && (
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                        Business Justification
                      </p>
                      <div className="rounded-md border px-3 py-2 text-sm">
                        {header.business_justification}
                        {header.business_justification_details && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {header.business_justification_details}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right sidebar column */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Status stepper card */}
            <Card className="h-full flex flex-col">
              <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
                <CardTitle className="text-sm">
                  Status - {header.pr_status || "Draft"}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-4 flex-1">
                {(() => {
                  // Real PR lifecycle: Draft -> submitted for approval
                  // (Pending Approval / More Info Required) -> Approved ->
                  // Complete (a PO has been raised against it). Rejected and
                  // Cancelled are terminal off-path outcomes — shown at the
                  // "Submitted" stage with destructive styling since that is
                  // as far as the PR got.
                  const stageLabels = ["Submitted", "Approved", "Converted to PO"];
                  let currentStage = 0;
                  if (isPendingApproval || isMoreInfoRequired) currentStage = 1;
                  if (isApproved) currentStage = 2;
                  if (isComplete) currentStage = 3;
                  const isTerminalNegative = isRejected || isCancelled;
                  if (isTerminalNegative) currentStage = 1;

                  return stageLabels.map((label, idx) => {
                    const stageNum = idx + 1;
                    const isDone = currentStage > stageNum;
                    const isActive = currentStage === stageNum;
                    const isNegativeActive = isTerminalNegative && isActive;
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
                          {isNegativeActive && (
                            <span className="ml-1.5 text-xs">
                              ({isRejected ? "Rejected" : "Cancelled"})
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>

            {/* Upload Document card — real attachments, via the same
                /api/requisitions/:prNumber/documents endpoints the
                CollaborationPanel below already uses for this PR. */}
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
                    if (file) uploadPrDocumentMutation.mutate(file);
                    e.target.value = "";
                  }}
                  data-testid="input-upload-document"
                />
                <button
                  type="button"
                  className="w-full rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center py-3 gap-1.5 text-center hover-elevate disabled:opacity-60"
                  onClick={() => uploadDocInputRef.current?.click()}
                  disabled={uploadPrDocumentMutation.isPending}
                  data-testid="button-upload-document"
                >
                  <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    {uploadPrDocumentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </div>
                  <p className="text-xs font-medium text-primary">Upload Document</p>
                </button>

                <div className="pt-1">
                  {prDocuments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      No documents attached
                    </p>
                  ) : (
                    prDocuments.slice(0, 5).map((doc, i) => (
                      <div
                        key={doc.id}
                        className={cn(
                          "flex items-center justify-between gap-2 py-2 px-1 text-xs",
                          i < Math.min(prDocuments.length, 5) - 1 && "border-b",
                        )}
                        data-testid={`row-document-${doc.id}`}
                      >
                        <span className="truncate text-muted-foreground" title={doc.file_name}>
                          {doc.file_name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleViewPrDocument(doc)}
                            className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate"
                            data-testid={`button-view-document-${doc.id}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePrDocumentMutation.mutate(doc.id)}
                            disabled={deletePrDocumentMutation.isPending}
                            className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover-elevate disabled:opacity-60"
                            data-testid={`button-delete-document-${doc.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  {prDocuments.length > 0 && (
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
                buttons for Draft PRs, same handlers as the header versions
                (handleSubmitForApproval, deleteMutation, setIsEditOpen). */}
            {isDraft && (isOwner || isSuperadmin) && (
              <Card className="h-full flex flex-col">
                <CardContent className="p-4 flex-1 flex flex-col gap-3">
                  <Button
                    className="font-semibold"
                    onClick={handleSubmitForApproval}
                    disabled={submitMutation.isPending}
                    data-testid="button-submit-approval-sidebar"
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin mr-2" />
                    ) :""}
                    Submit for Approval
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="text-destructive hover:text-destructive border-destructive/40"
                        data-testid="button-delete-pr-sidebar"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete Purchase Requisition
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this purchase
                          requisition? This action cannot be undone.
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
                    onClick={() => setIsEditOpen(true)}
                    data-testid="button-edit-pr-sidebar"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Requisition
                  </Button>
                </CardContent>
              </Card>
            )}
            </div>

            {/* Approval history card */}
            <Card>
              <CardHeader className="py-3 px-4 bg-primary/5 border-b border-primary/20">
                <CardTitle className="text-sm">Approval history</CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-4">
                {(() => {
                  // Get approval history from database
                  const approvalHistory = data?.approvalHistory || [];

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
                              (approval.status === "More" || approval.status === "more") ? "More" :
                                approval.status === "ReSubmit" ? "ReSubmit" :  approval.status === "Delegation" ? "Delegation" : approval.status === "Delegated User" ? "Delegated User" : "Approved",
                        date: formatDate(approval.approved_date) || undefined,
                        comments: approval.comments || undefined,
                        stepOrder: index + 1,
                        roleName: isRole ? approverTrimmed : undefined,
                      });
                    });

                  // 2. Add pending approvers from approvers_list if in a pending state
                  const pendingStatus = ["Pending Approval", "Pending", "PENDING", "Pending_Approval"];
                  if (header.pr_status && pendingStatus.includes(header.pr_status)) {
                    const currentApprovers = header.approvers_list
                      ? header.approvers_list
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
                      <div className="flex flex-col items-center justify-center py-6 gap-1.5 text-center">
                        <FileText className="h-10 w-10 text-primary/70 -rotate-12 mb-1" />
                        <p className="text-sm font-medium">No Records!</p>
                        <p className="text-xs text-muted-foreground px-4">
                          No approval history is available as of now
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-0">
                      {timelineItems.map((item, index, arr) => {
                        const status = item.status;
                        const isApproved = status.toLowerCase() === "approved";
                        const isRejected = status.toLowerCase() === "rejected";
                        const isMoreInfo = status.toLowerCase() === "more" || status.toLowerCase() === "more info" || status.toLowerCase() === "more information required" || status.toLowerCase() === "more info required";
                        const isResubmit = status.toLowerCase() === "resubmit";
                        const isPending = status.toLowerCase() === "pending";
                        const isDelegated = (status.toLowerCase() === "delegation" || status.toLowerCase() === "delegated user");

                        const statusColor = isApproved
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : isRejected
                            ? "bg-red-500 border-red-500 text-white"
                            : isMoreInfo
                              ? "bg-amber-500 border-amber-500 text-white"
                              : isResubmit
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-muted border-muted-foreground/30 text-muted-foreground";

                        const dotColor = isApproved
                          ? "bg-emerald-500"
                          : isRejected
                            ? "bg-red-500"
                            : isMoreInfo
                              ? "bg-amber-500"
                              : isResubmit
                                ? "bg-primary"
                                : "bg-orange-500";

                        const statusLabel = isApproved
                          ? "Approved"
                          : isRejected
                            ? "Rejected"
                            : isMoreInfo
                              ? "More Info"
                              : isResubmit
                                ? "ReSubmit"
                                : isDelegated ? status : "Pending";

                        const iconElement = (
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${statusColor} cursor-pointer`}
                          >
                            {isPending ? (
                              <Clock className="h-3.5 w-3.5" />
                            ) : isApproved ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : isRejected ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5" />
                            )}
                          </div>
                        );

                        return (
                          <div
                            key={index}
                            className="flex items-start gap-3"
                            data-testid={`approval-history-item-${index}`}
                          >
                            <div className="flex flex-col items-center">
                              {item.roleName ? (
                                <RoleUsersTooltip roleName={item.roleName}>
                                  {iconElement}
                                </RoleUsersTooltip>
                              ) : (
                                iconElement
                              )}
                              {index < arr.length - 1 && (
                                <div
                                  className={`w-0.5 flex-1 min-h-[20px] border-l-2 border-dashed ${isApproved ? "border-emerald-500" : "border-muted-foreground/30"}`}
                                />
                              )}
                            </div>
                            <div className="pb-4 min-w-0">
                              <p className="text-xs font-medium truncate" title={item.name}>
                                {item.name}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                <span className="text-xs">{statusLabel}</span>
                                {item.date && (
                                  <span className="text-[10px] text-muted-foreground ml-1">{item.date}</span>
                                )}
                              </div>
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
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>

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
                    <AlertCircle className={`h-4 w-4 ${budgetValidation.severity === "medium" ? "text-amber-600" : "text-red-600"}`} />
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
                  Department budget:{" "}
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 2,
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
                Line items ({lines.length})
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {(isDraft || isMoreInfoRequired) && (
                  <>
                   
                    {(isOwner || isSuperadmin) && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsLinesImportOpen(true)}
                          data-testid="button-import-excel"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Import excel
                        </Button>
                        <input
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
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {lines.length === 0 && !(isDraft || isMoreInfoRequired) ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Package className="h-10 w-10 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No line items found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium w-[50px]">
                        No
                      </TableHead>
                      <TableHead className="text-xs font-medium">
                        Item name
                      </TableHead>
                      <TableHead className="text-xs font-medium">
                        Category
                      </TableHead>
                      <TableHead className="text-xs font-medium text-right">
                        Qty
                      </TableHead>
                      <TableHead className="text-xs font-medium">UOM</TableHead>
                      <TableHead className="text-xs font-medium text-right">
                        Unit Price
                      </TableHead>
                      <TableHead className="text-xs font-medium text-right">
                        Total Cost
                      </TableHead>
                      <TableHead className="text-xs font-medium">
                        Delivery location
                      </TableHead>
                      <TableHead className="text-xs font-medium">
                        Delivery date
                      </TableHead>
                      <TableHead className="text-xs font-medium">
                        Status
                      </TableHead>
                      {((header.pr_status === "Draft" ||
                        (header.pr_status === "More Info Required" || header.pr_status?.toLowerCase() === "more info required" || header.pr_status?.toLowerCase() === "more" || header.pr_status === "More Information Required")) && (isOwner || isSuperadmin)) &&
                        (
                          <TableHead className="text-xs font-medium text-center">
                            Actions
                          </TableHead>
                        )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const canEditLine =
                        (header.pr_status === "Draft" ||
                          header.pr_status === "More Info Required" ||
                          header.pr_status?.toLowerCase() === "more info required" ||
                          header.pr_status?.toLowerCase() === "more") &&
                        (isOwner || isSuperadmin);
                      return (
                      <TableRow key={line.id}>
                        <TableCell className="font-mono text-sm py-2">
                          {line.line_num || "-"}
                        </TableCell>
                        <TableCell className="py-2">
                          <div>
                            <p className="text-sm font-medium">
                              {line.item_description || "-"}
                            </p>
                            {line.supplier_name && (
                              <p className="text-xs text-muted-foreground">
                                Supplier: {line.supplier_name}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {line.product_category_name || "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm py-2">
                          {line.qty || "-"}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {line.uom || "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm py-2">
                          {formatCurrency(
                            line.unit_cost,
                            line.curr_code || header.currency,
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium py-2">
                          {formatCurrency(
                            line.amount,
                            line.curr_code || header.currency,
                          )}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {header.delivertto_location_name || "-"}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {formatDate(line.need_by_date) || "-"}
                        </TableCell>
                        <TableCell className="py-2">
                          <LineStatusBadge status={line.status} />
                        </TableCell>
                        {canEditLine && (
                            <TableCell className="py-2">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    // Auto-populate form with line data
                                    setNewLineItem({
                                      description: line.item_description || "",
                                      quantity: String(line.qty || 1),
                                      unitPrice: String(line.unit_cost || ""),
                                      uom: line.uom || "Each",
                                      categoryCode: line.product_category
                                        ? String(line.product_category)
                                        : "",
                                      categoryName:
                                        line.product_category_name || "",
                                      itemId: line.item_id
                                        ? String(line.item_id)
                                        : "",
                                      itemName: line.item_description || "",
                                    });
                                    // Set mode based on whether item_id exists
                                    setItemEntryMode("master");
                                    setEditingLineId(line.id);
                                    setAddLineSheetOpen(true);
                                  }}
                                  data-testid={`button-edit-line-${line.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => duplicateLineMutation.mutate(line)}
                                  disabled={duplicateLineMutation.isPending}
                                  data-testid={`button-duplicate-line-${line.id}`}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setLineToDelete(line.id);
                                    setDeleteLineConfirmOpen(true);
                                  }}
                                  data-testid={`button-delete-line-${line.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {(isDraft || isMoreInfoRequired) && (isOwner || isSuperadmin) && (
                  <button
                    type="button"
                    onClick={handleOpenAddLine}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-primary/40 text-primary text-sm font-medium py-3 hover:bg-primary/5 transition-colors"
                    data-testid="button-add-new-line-row"
                  >
                    <Plus className="h-4 w-4" />
                    ADD NEW
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <FormSheet
          open={addLineSheetOpen}
          onOpenChange={(open) => {
            setAddLineSheetOpen(open);
            if (!open) {
              setEditingLineId(null);
              setNewLineItem(EMPTY_NEW_LINE_ITEM);
            }
          }}
          title={editingLineId ? "Edit Line Item" : "Add Line Item"}
          description={
            editingLineId
              ? "Update line item details."
              : "Add a new line item to this requisition manually."
          }
          onSubmit={handleSaveLine}
          submitLabel={editingLineId ? "Update Line Item" : "Add Line Item"}
          isSubmitting={isSavingLine}
          submitDisabled={!newLineItem.description || !newLineItem.quantity || !newLineItem.unitPrice}
          widthClassName="w-full sm:max-w-[600px]"
        >
            <div className="space-y-4 pb-6">
            {/* Item Entry Mode Toggle - Free Text hidden, master mode only */}

            {/* Item Master Mode - Item Selection */}
            {itemEntryMode === "master" && (
              <div className="space-y-2">
                <Label>Select Item <span className="text-destructive">*</span></Label>
                <Popover open={itemOpen} onOpenChange={setItemOpen}>
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
              <div className="space-y-2">
                <Label htmlFor="line-quantity">Quantity <span className="text-destructive">*</span></Label>
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
                    setNewLineItem({ ...newLineItem, quantity: e.target.value })
                  }
                  data-testid="input-line-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line-uom">Unit of Measure</Label>
                <Select
                  value={newLineItem.uom}
                  onValueChange={(v) =>
                    setNewLineItem({ ...newLineItem, uom: v })
                  }
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="line-unit-price">
                  Unit Price ({header.currency || "AED"}) <span className="text-destructive">*</span>
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
                />
              </div>              
            </div>

          </div>
        </FormSheet>

        {/* Edit PR Sheet */}
        <FormSheet
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          title="Edit Purchase Requisition"
          onSubmit={handleUpdatePR}
          submitLabel={updatePRMutation.isPending ? "Updating..." : "Update"}
          isSubmitting={updatePRMutation.isPending}
          submitDisabled={
            !editForm.description ||
            !editForm.deliveryLocation ||
            !editForm.needByDate ||
            !editForm.requestorId ||
            !editForm.requestorDepartment ||
            !editForm.buyerId ||
            (editForm.isBudgeted === "yes" && !editForm.budgetId)
          }
        >
            <p className="text-xs text-muted-foreground mb-4">
              <span className="text-destructive">*</span> Indicates mandatory fields
            </p>
            <div className="mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-pr-description">
                    PR Description <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="edit-pr-description"
                    placeholder="Enter a brief description of purchase request"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                    data-testid="input-edit-pr-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-pr-business-entity">
                    Business Entity <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={editForm.orgId || ""}
                    onValueChange={(value) =>
                      setEditForm({ ...editForm, buyerId: "", budgetId: "", orgId: value, deliveryLocation: "" })
                    }
                  >
                    <SelectTrigger data-testid="select-edit-pr-business-entity">
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

                <div className="space-y-2">
                  <Label htmlFor="edit-pr-need-by-date">
                    Need By Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="edit-pr-need-by-date"
                    type="date"
                    value={editForm.needByDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) =>
                      setEditForm({ ...editForm, needByDate: e.target.value })
                    }
                    data-testid="input-edit-need-by-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-pr-requestor">
                    Requestor <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={editForm.requestorId}
                    onValueChange={(v) => {
                      const selectedUser = users.find((u) => u.id?.toString() === v);
                      const matchingDept = departments.find(
                        (d) => d.value === selectedUser?.department_name,
                      );
                      setEditForm({
                        ...editForm,
                        requestorId: v,
                        requestorDepartment:
                          matchingDept?.id?.toString() || editForm.requestorDepartment,
                      });
                    }}
                    disabled={!isSuperadmin}
                  >
                    <SelectTrigger data-testid="select-edit-requestor">
                      <SelectValue placeholder="Select Requestor" />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((u) => u.id)
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.name || user.user_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-pr-delivery-location">
                    Delivery Location{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={editForm.deliveryLocation}
                    onValueChange={(v) =>
                      setEditForm({ ...editForm, deliveryLocation: v, budgetId: "" })
                    }
                    disabled={!editForm.orgId}
                  >
                    <SelectTrigger data-testid="select-edit-delivery-location">
                      <SelectValue placeholder={editForm.orgId ? "Select Location" : "Select business entity first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.length > 0 ? (
                        locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id.toString()}>
                            {loc.location_name}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-muted-foreground">
                          No locations available for selected entity
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-pr-department">
                    Department{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={editForm.requestorDepartment}
                    onValueChange={(v) =>
                      setEditForm({ ...editForm, requestorDepartment: v, budgetId: "" })
                    }
                  >
                    <SelectTrigger data-testid="select-edit-department">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id.toString()}>
                          {dept.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-pr-buyer">
                    Buyer <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={editForm.buyerId}
                    onValueChange={(v) =>
                      setEditForm({ ...editForm, buyerId: v })
                    }
                  >
                    <SelectTrigger data-testid="select-edit-buyer">
                      <SelectValue placeholder="Select Buyer" />
                    </SelectTrigger>
                    <SelectContent>
                      {buyers?.filter((item) =>
                        item.org_id
                          ?.split(",")
                          .filter(Boolean)
                          .includes(String(editForm.orgId))
                      )?.filter((u) => u.id)
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.name || user.user_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-pr-currency">
                    Currency <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={editForm.currency}
                    onValueChange={(v) =>
                      setEditForm({ ...editForm, currency: v })
                    }
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

                <div className="col-span-2 space-y-2">
                  <Label>
                    Budgeted <span className="text-destructive">*</span>
                  </Label>
                  <RadioGroup
                    value={editForm.isBudgeted}
                    onValueChange={(v) =>
                      setEditForm({
                        ...editForm,
                        isBudgeted: v,
                        budgetId: v === "no" ? "" : editForm.budgetId,
                      })
                    }
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="yes" id="edit-budgeted-yes" />
                      <Label htmlFor="edit-budgeted-yes" className="cursor-pointer">Yes</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="no" id="edit-budgeted-no" />
                      <Label htmlFor="edit-budgeted-no" className="cursor-pointer">No</Label>
                    </div>
                  </RadioGroup>
                </div>

                {editForm.isBudgeted === "yes" && (
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="edit-pr-budget">
                      Budget <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={editForm.budgetId}
                      onValueChange={(v) =>
                        setEditForm({ ...editForm, budgetId: v })
                      }
                    >
                      <SelectTrigger data-testid="select-edit-budget">
                        <SelectValue placeholder="Select Budget">
                          {editForm.budgetId &&
                            (() => {
                              const selected = budgetLines?.filter((item) => item.business_entity === editForm.orgId)?.find(
                                (bl) => String(bl.id) === editForm.budgetId,
                              );
                              return selected
                                ? `${selected.budget_name} . ${selected.segment_dtl_name}`
                                : "Select Budget";
                            })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueBudgets?.filter((item) => item.business_entity === editForm.orgId && item.id != null)?.length > 0 ? 
                          uniqueBudgets?.filter((item) => item.business_entity === editForm.orgId && item.id != null)
                            ?.map((budgetLine) => {
                              const lineAmount = Math.max(
                                0,
                                (parseFloat(budgetLine.amount) || 0) -
                                  (parseFloat(budgetLine.consumed_amount) || 0) -
                                  (parseFloat(budgetLine.reserved_amount) || 0),
                              );
                              const currencySymbol =
                                budgetLine.budget_curr === "INR"
                                  ? "₹ "
                                  : budgetLine.budget_curr === "USD"
                                    ? "$ "
                                    : budgetLine.budget_curr === "AED"
                                      ? "AED "
                                      : budgetLine.budget_curr === "EUR"
                                        ? "€ "
                                        : budgetLine.budget_curr === "GBP"
                                          ? "£ "
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
                          No budgets available in selected entity
                        </div>}
                      </SelectContent>
                    </Select>
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
              <DialogTitle>
                Submit Purchase Requisition for Approval?
              </DialogTitle>
              <DialogDescription>
                This will submit the PR for workflow approval. You won't be able to make changes while it's pending approval.
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
              <DialogTitle>
                Re-Submit Purchase Requisition for Approval?
              </DialogTitle>
              <DialogDescription>
                This will submit the PR for workflow approval. You won't be able to make changes while it's pending approval.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setReSubmitConfirmOpen(false);
                  document.body.style.pointerEvents = "auto";
                }}
                data-testid="button-submit-cancel"
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
                data-testid="button-submit-yes"
              >
                {approvalMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                {approvalAction === "Approve" ? "Approve Purchase Requisition" :
                  approvalAction === "Reject" ? "Reject Purchase Requisition" :
                    approvalAction === "More" ? "Request More Information" :
                      "Request for Delegate"}
              </DialogTitle>
              <DialogDescription>
                {approvalAction === "Approve" && "This will approve the purchase requisition and move it to the next step in the workflow."}
                {approvalAction === "Reject" && "This will reject the purchase requisition and send it back to the requester."}
                {approvalAction === "More" && "This will request additional information from the requester before proceeding."}
                {approvalAction === "Request" && "This will delegate the approval to another approver."}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {approvalAction === "Request" && (
                <div>
                  <Label htmlFor="pr-delegate-approver">
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
                      approvalMutation.mutate({ action: approvalAction, remarks: approvalRemarks });
                    }, 50);
                  }
                }}
                disabled={approvalMutation.isPending || delegateActionMutation.isPending}
                className={
                  approvalAction === "Approve" ? "bg-green-600 hover:bg-green-700" :
                    approvalAction === "Reject" ? "bg-red-600 hover:bg-red-700" :
                      approvalAction === "More" ? "bg-orange-600 hover:bg-orange-700" :
                        "bg-blue-600 hover:bg-blue-700"
                }
                data-testid="button-approval-confirm"
              >
                {(approvalMutation.isPending || delegateActionMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {approvalAction === "Approve" ? "Approve" : approvalAction === "Reject" ? "Reject" : approvalAction === "More" ? "Request Info" : "Delegate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ApprovalChecklistDialog
          open={checklistDialogOpen}
          onOpenChange={setChecklistDialogOpen}
          moduleName="Purchase Request"
          title="Purchase Request Approval Checklist"
          refNumber={prNumber}
          approving={approvalMutation.isPending}
          onApprove={(comments) => {
            setChecklistDialogOpen(false);
            setTimeout(() => {
              approvalMutation.mutate({ action: "Approve", remarks: comments });
            }, 50);
          }}
        />

        {/* Delete Line Item Confirmation Dialog */}
        <Dialog open={deleteLineConfirmOpen} onOpenChange={(open) => {
          setDeleteLineConfirmOpen(open);
          if (!open) setLineToDelete(null);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Line Item?</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this line item? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
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
                onClick={handleDeleteLine}
                data-testid="button-delete-line-confirm"
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                  Required: Item, Quantity, Unit Price<br />
                  Optional: Unit of Measure
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                  try {
                    const response = await fetch(
                      `/api/requisitions/${prNumber}/lines/bulk-import/template`,
                      {
                        method: "GET",
                        headers: getAuthHeaders(),
                        credentials: "include",
                      }
                    );

                    if (!response.ok) {
                      throw new Error("Failed to download template");
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);

                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "pr_line_items_template.xlsx";
                    document.body.appendChild(a);
                    a.click();

                    a.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error(err);
                  }
                }}
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

      {/* Collaboration Panel - Reusable Component */}
      <CollaborationPanel
        ref={collaborationPanelRef}
        entityType="PR"
        entityId={prNumber || ""}
        notes={notesData?.notes || ""}
        notesLoading={notesLoading}
        onSaveNotes={handleSaveNotes}
        notesLabel="Requisition Notes"
        onCountsChange={(counts) => setCollaborationCount(counts.totalCount)}
      />
    </div>
  );
}
