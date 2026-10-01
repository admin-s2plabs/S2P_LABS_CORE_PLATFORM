import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import { ViewChecklistButton } from "@/components/view-checklist-button";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import { CollaborationPanel, CollaborationPanelRef } from "@/components/collaboration-panel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSheet } from "@/components/form-sheet";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import * as XLSX from "xlsx";

interface BudgetLine {
  id: number;
  budget_mst_id: number;
  segment_dtl_code: string | null;
  segment_dtl_id: string | null;
  segment_dtl_name: string | null;
  amount: string | null;
  consumed_amount: string | null;
  reserved_amount: string | null;
  description: string | null;
}

interface PeriodAmount {
  id: number;
  budget_line_id: number;
  period_line_id: string | null;
  period_line_name: string | null;
  amount: string | null;
  currency: string | null;
  consumed_amount: string | null;
  reserved_amount: string | null;
}

interface DepartmentMapping {
  id: number;
  budget_line_id: number;
  dept_id: string | null;
  dept_name: string | null;
}

interface LocationMapping {
  id: number;
  budget_line_id: number;
  loc_id: string | null;
  loc_name: string | null;
}

interface BudgetDocument {
  id: number;
  file_name: string | null;
  file_path: string | null;
  attach_source: string | null;
  created_by: string | null;
  created_date: string | null;
  last_modified_by: string | null;
  last_modified_date: string | null;
}

interface BudgetNotesResponse {
  notes: string;
}

interface BudgetComment {
  id: number;
  comments: string | null;
  created_by: string | null;
  created_by_name: string | null;
  creation_date: string | null;
  reviewer: string | null;
  reviewer_name: string | null;
  section: string | null;
  from_action: string | null;
}

interface BudgetHeader {
  id: number;
  budget_id: string | null;
  budget_name: string | null;
  budget_amount: string | null;
  budget_curr: string | null;
  status: string | null;
  budget_owner_id: string | null;
  budget_owner_name: string | null;
  business_entity: string | null;
  business_entity_name: string | null;
  start_date: string | null;
  end_date: string | null;
  period_mst_id: string | null;
  period_name: string | null;
  locations: string | null;
  notes: string | null;
  consumed_amount: string | null;
  reserved_amount: string | null;
  creation_date: string | null;
  created_by: string | null;
  last_modified_date: string | null;
  last_modified_by: string | null;
  approvers_list: string | null;
  attribute_12: string | null;
}
// Role names for approval workflow
const ROLE_NAMES = [
  "ROLE_PROCUREMENT_OFFICER",
  "ROLE_PROCUREMENT_MANAGER",
  "ROLE_FINANCE_MANAGER",
  "ROLE_FINANCE_OFFICER",
  "ROLE_DEPARTMENT_HEAD",
  "ROLE_DEPARTMENT_USER",
  "ROLE_SYSADMIN",
  "ROLE_SUPERADMIN",
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
  businessEntity,
}: {
  roleName: string;
  children: ReactNode;
  businessEntity?: string;
}) {
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const handleMouseEnter = async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const response = await apiRequest("GET",
        `/api/roles/by-name/${encodeURIComponent(roleName)}/:${encodeURIComponent(businessEntity || "")}/users`,
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

interface WorkflowStep {
  id: number;
  name: string;
  step_order: number;
  step_type: string | null;
  assignment_type: string | null;
  assignment_expression: string | null;
}

interface BudgetDetailResponse {
  header: BudgetHeader;
  lines: BudgetLine[];
  periodAmounts: PeriodAmount[];
  departmentMappings: DepartmentMapping[];
  locationMappings: LocationMapping[];
  approvalHistory: ApprovalHistoryItem[];
  workflowSteps: WorkflowStep[];
}

function toExportAmount(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined || value === "") return "";
  const n = parseFloat(String(value));
  return Number.isNaN(n) ? String(value) : n;
}

function buildBudgetDetailSummaryRow(header: BudgetHeader): Record<string, string | number> {
  const { available } = getBudgetAmountBreakdown({
    totalAmount: header.budget_amount,
    consumed_amount: header.consumed_amount,
    reserved_amount: header.reserved_amount,
  });
  return {
    "Budget ID": header.budget_id || String(header.id),
    "Budget Name": header.budget_name || "",
    Status: header.status || "",
    Owner: header.budget_owner_name || "",
    "Business Entity": header.business_entity_name || "",
    "Total Budget": toExportAmount(header.budget_amount),
    Currency: header.budget_curr || "",
    Consumed: toExportAmount(header.consumed_amount),
    Reserved: toExportAmount(header.reserved_amount),
    Available: toExportAmount(available),
    "Start Date": formatDate(header.start_date) !== "-" ? formatDate(header.start_date) : "",
    "End Date": formatDate(header.end_date) !== "-" ? formatDate(header.end_date) : "",
  };
}

function emptyBudgetDetailLineFields(): Record<string, string | number> {
  return {
    "Line ID": "",
    "Cost Center Code": "",
    "Cost Center Name": "",
    "Line Total Budget": "",
    "Line Description": "",
    "Line Consumed": "",
    "Line Reserved": "",
    Locations: "",
    Departments: "",
  };
}

function buildBudgetDetailLineRowsFlat(
  header: BudgetHeader,
  lines: BudgetLine[],
  departmentMappings: DepartmentMapping[],
  locationMappings: LocationMapping[],
): Record<string, string | number>[] {
  const summary = buildBudgetDetailSummaryRow(header);
  const emptyLine = emptyBudgetDetailLineFields();

  if (!lines.length) {
    return [{ ...summary, ...emptyLine }];
  }

  return lines.map((line) => {
    const { total: lineTotal } = getBudgetLineAmountBreakdown(line);
    const locs = locationMappings
      .filter((m) => Number(m.budget_line_id) === Number(line.id))
      .map((m) => m.loc_name)
      .filter(Boolean) as string[];
    const depts = departmentMappings
      .filter((m) => Number(m.budget_line_id) === Number(line.id))
      .map((m) => m.dept_name)
      .filter(Boolean) as string[];
    const locStr = [...new Set(locs)].sort().join(", ");
    const deptStr = [...new Set(depts)].sort().join(", ");
    return {
      ...summary,
      "Line ID": String(line.id),
      "Cost Center Code": line.segment_dtl_code || "",
      "Cost Center Name": line.segment_dtl_name || "",
      "Line Total Budget": toExportAmount(lineTotal),
      "Line Description": line.description || "",
      "Line Consumed": toExportAmount(line.consumed_amount),
      "Line Reserved": toExportAmount(line.reserved_amount),
      Locations: locStr,
      Departments: deptStr,
    };
  });
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  "draft": { label: "Draft", icon: FileText, variant: "secondary" },
  "pending approval": { label: "Pending Approval", icon: Clock, variant: "outline", className: "border-amber-300 text-amber-600 dark:border-amber-600 dark:text-amber-400" },
  "active": { label: "Active", icon: CheckCircle2, variant: "default", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "approved": { label: "Approved", icon: CheckCircle2, variant: "default", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "rejected": { label: "Rejected", icon: XCircle, variant: "destructive" },
  "expired": { label: "Expired", icon: AlertTriangle, variant: "outline", className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "closed": { label: "Closed", icon: XCircle, variant: "secondary" },
  "more info required": { label: "More Info Required", icon: Clock, variant: "outline", className: "border-orange-300 text-orange-600 dark:border-amber-600 dark:text-amber-400" },
};

function StatusBadge({ status }: { status: string | null }) {
  const config = statusConfig[(status || "").toLowerCase()] || {
    label: status || "Unknown",
    icon: FileText,
    variant: "outline" as const
  };
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={`text-xs gap-1 ${config.className || ""}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

/** `totalAmount` is the full budget allocation; AA = total − CA − RA. */
function getBudgetAmountBreakdown(fields: {
  totalAmount: string | null;
  consumed_amount: string | null;
  reserved_amount: string | null;
}) {
  const consumed = parseFloat(fields.consumed_amount || "0") || 0;
  const reserved = parseFloat(fields.reserved_amount || "0") || 0;
  const total = parseFloat(fields.totalAmount || "0") || 0;
  const available = Math.max(0, total - consumed - reserved);
  return { consumed, reserved, available, total };
}

function getBudgetLineAmountBreakdown(line: Pick<BudgetLine, "amount" | "consumed_amount" | "reserved_amount">) {
  const consumed = parseFloat(line.consumed_amount || "0") || 0;
  const reserved = parseFloat(line.reserved_amount || "0") || 0;
  const total = parseFloat(line.amount || "0") || 0;
  const available = Math.max(0, total - consumed - reserved);
  return { consumed, reserved, available, total };
}

function UtilizationBar({ consumed, total, label }: { consumed: number; total: number; label?: string }) {
  const percentage = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;
  const color = percentage >= 90 ? "bg-red-500" : percentage >= 75 ? "bg-orange-500" : "bg-emerald-500";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        {label && <span className="text-muted-foreground">{label}</span>}
        <span className="font-medium">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface Entity {
  id: string;
  name: string;
}

interface BudgetUser {
  id: number;
  name: string;
  user_name: string;
}

interface Period {
  id: number;
  period_name: string;
}

interface EditFormData {
  budget_name: string;
  business_entity: string;
  business_entity_name: string;
  budget_owner_id: string;
  budget_owner_name: string;
  period_mst_id: string;
  start_date: any;
  end_date: any;
}

interface CostCenter {
  id: number;
  code: string;
  name: string;
}

interface Location {
  id: number;
  name: string;
}

interface Department {
  id: number;
  code: string;
  name: string;
}

interface LineFormData {
  cost_center_id: string;
  cost_center_code: string;
  cost_center_name: string;
  amount: string;
  description: string;
  all_locations: boolean;
  location_ids: number[];
  all_departments: boolean;
  department_ids: number[];
  period_amounts: Record<string, string>;
}

interface BulkLinesImportPreviewRow {
  rowNumber: number;
  costCenterName: string;
  amount: number;
  description: string;
  valid: boolean;
  errors: string[];
}

interface BulkLinesImportPreview {
  total: number;
  valid: number;
  invalid: number;
  results: BulkLinesImportPreviewRow[];
}

interface BulkLinesImportResultRow {
  rowNumber: number;
  costCenterName: string;
  success: boolean;
  lineId?: number;
  errors?: string[];
}

interface BulkLinesImportResponse {
  created: number;
  errors: number;
  total: number;
  results: BulkLinesImportResultRow[];
}

interface PeriodAmountPayload {
  periodLineId: string;
  periodLineName: string;
  amount: number;
  consumedAmount: number;
  reservedAmount: number;
  currency: string | null;
}

const QUARTERLY_PERIODS = [
  { key: "q1", label: "Jan-Mar" },
  { key: "q2", label: "Apr-Jun" },
  { key: "q3", label: "Jul-Sep" },
  { key: "q4", label: "Oct-Dec" },
];

const MONTHLY_PERIODS = [
  { key: "jan", label: "Jan" },
  { key: "feb", label: "Feb" },
  { key: "mar", label: "Mar" },
  { key: "apr", label: "Apr" },
  { key: "may", label: "May" },
  { key: "jun", label: "Jun" },
  { key: "jul", label: "Jul" },
  { key: "aug", label: "Aug" },
  { key: "sep", label: "Sep" },
  { key: "oct", label: "Oct" },
  { key: "nov", label: "Nov" },
  { key: "dec", label: "Dec" },
];

function getPeriodDefinitions(periodMstId: string) {
  if (periodMstId === "2") return QUARTERLY_PERIODS;
  if (periodMstId === "3") return MONTHLY_PERIODS;
  return [];
}

function buildPeriodAmountsPayload(
  periodMstId: string,
  periodAmounts: Record<string, string>,
  currency: string | null | undefined
): PeriodAmountPayload[] {
  const defs = getPeriodDefinitions(periodMstId);
  if (!defs.length) return [];
  return defs.map((period) => ({
    periodLineId: period.key,
    periodLineName: period.label,
    amount: parseFloat(periodAmounts[period.key] || "0") || 0,
    consumedAmount: 0,
    reservedAmount: 0,
    currency: currency || null,
  }));
}

const preventInvalidNumberKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (["e", "E", "-", "+", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
  }
};

export default function BudgetDetailPage() {
  const [, params] = useRoute("/app/budgets/:id");
  const budgetId = params?.id;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddLineOpen, setIsAddLineOpen] = useState(false);
  const [formData, setFormData] = useState<EditFormData>({
    budget_name: "",
    business_entity: "",
    business_entity_name: "",
    budget_owner_id: "",
    budget_owner_name: "",
    period_mst_id: "",
    start_date: undefined,
    end_date: undefined,
  });
  const [lineFormData, setLineFormData] = useState<LineFormData>({
    cost_center_id: "",
    cost_center_code: "",
    cost_center_name: "",
    amount: "0",
    description: "",
    all_locations: true,
    location_ids: [],
    all_departments: true,
    department_ids: [],
    period_amounts: {},
  });
  const [locationSearch, setLocationSearch] = useState("");
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [showEditLocationDropdown, setShowEditLocationDropdown] = useState(false);
  const [showEditDepartmentDropdown, setShowEditDepartmentDropdown] = useState(false);
  const [editLocationSearch, setEditLocationSearch] = useState("");
  const [editDepartmentSearch, setEditDepartmentSearch] = useState("");
  const [isEditLineOpen, setIsEditLineOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null);
  const [lineToDelete, setLineToDelete] = useState<BudgetLine | null>(null);

  // Collaboration Panel ref
  const collaborationPanelRef = useRef<CollaborationPanelRef>(null);
  const [collaborationCount, setCollaborationCount] = useState(0);

  // Excel import state
  const [isLinesImportOpen, setIsLinesImportOpen] = useState(false);
  const [linesImportFile, setLinesImportFile] = useState<File | null>(null);
  const [linesImportPreview, setLinesImportPreview] = useState<BulkLinesImportPreview | null>(null);
  const [linesImportResults, setLinesImportResults] = useState<BulkLinesImportResponse | null>(null);
  const linesImportFileRef = useRef<HTMLInputElement>(null);

  // Approval confirmation dialog state
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"Approve" | "Reject" | "More" | "Request" | null>(null);
  const [approvalComments, setApprovalComments] = useState("");
  const [delegateApproverId, setDelegateApproverId] = useState("");

  const { data: delegateApprovers = [] } = useQuery<
    { id: number; name: string; user_name: string }[]
  >({
    queryKey: ["/api/users/dropdown"],
    enabled: approvalDialogOpen && approvalAction === "Request",
  });

  // Submit for approval confirmation dialog state
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  // Submit for approval confirmation dialog state
  const [reSubmitConfirmOpen, setReSubmitConfirmOpen] = useState(false);

  // Copy budget confirmation dialog state
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);

  const { data, isLoading, error } = useQuery<BudgetDetailResponse>({
    queryKey: ["/api/budgets", budgetId],
    enabled: !!budgetId,
  });

  const { data: entities } = useQuery<Entity[]>({
    queryKey: ["/api/budgets/entities"],
  });

  const { data: users } = useQuery<BudgetUser[]>({
    queryKey: ["/api/budgets/users"],
  });

  const { data: periods } = useQuery<Period[]>({
    queryKey: ["/api/budgets/periods"],
  });

  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["/api/budgets/cost-centers"],
  });

  const businessEntityId = data?.header?.business_entity;
  const { data: locations } = useQuery<Location[]>({
    queryKey: ["/api/budgets/locations", businessEntityId],
    queryFn: async () => {
      const url = businessEntityId
        ? `/api/budgets/locations?businessEntityId=${encodeURIComponent(businessEntityId)}`
        : "/api/budgets/locations";
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
    enabled: !!businessEntityId,
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/budgets/departments"],
  });

  // Notes query for collaboration panel (notes are module-specific)
  const { data: notesData, isLoading: notesLoading } = useQuery<BudgetNotesResponse>({
    queryKey: ["/api/budgets", budgetId, "notes"],
    enabled: !!budgetId,
  });

  // Get current user from localStorage to check task ownership
  const authData = localStorage.getItem("prokraya-auth");
  const authParsed = authData ? JSON.parse(authData) : null;
  const currentUserId = authParsed ? authParsed.userId : null;
  const currentUserEmail = authParsed ? authParsed.email : null;
  const currentUserIdStr = currentUserId ? String(currentUserId) : null;
  const isSuperadmin = authParsed?.userRole === "ROLE_SUPERADMIN" || authParsed?.userRole === "ROLE_SYSADMIN";

  // Role names for checking role-based assignments
  const ROLE_NAMES = [
    "ROLE_PROCUREMENT_OFFICER",
    "ROLE_PROCUREMENT_MANAGER",
    "ROLE_FINANCE_MANAGER",
    "ROLE_FINANCE_OFFICER",
    "ROLE_DEPARTMENT_HEAD",
    "ROLE_DEPARTMENT_USER",
    "ROLE_SYSADMIN",
    "ROLE_SUPERADMIN"
  ];

  // Fetch current user profile to get user_name and roles
  const { data: currentUserProfile } = useQuery<{
    user_name: string;
    email_id: string;
    name: string;
    roles: { role_name: string }[];
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

  // Get user's role names for checking approval authorization
  const userRoleNames = currentUserProfile?.roles?.map(r => r.role_name) || [];

  // Get taskId from sessionStorage (set when navigating from my-tasks)
  const [storedTaskId, setStoredTaskId] = useState<string | null>(null);
  useEffect(() => {
    const taskIdFromStorage = sessionStorage.getItem("currentTaskId");
    setStoredTaskId(taskIdFromStorage);
  }, []);

 

  // Fetch task details to get current owner
  const { data: taskDetails } = useQuery<{
    assignee_: string | null;
    id_: string;
  }>({
    queryKey: ["/api/workflow-engine/task", storedTaskId],
    queryFn: async () => {
      if (!storedTaskId) return null;
      const res = await apiRequest("GET", `/api/workflow-engine/task/${encodeURIComponent(storedTaskId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!storedTaskId,
  });

   useEffect(() => {
    if ((data?.header?.attribute_12) && !storedTaskId) {
      setStoredTaskId(data?.header?.attribute_12);
    }
  }, [data?.header?.attribute_12, storedTaskId]);
  // Check if current user can approve this task
  const canApprove = (() => {
    if (!storedTaskId || !taskDetails || !data?.header || !data?.header?.attribute_12) return false;

    const header = data.header;
    const currentOwner = taskDetails.assignee_;
    if (!currentOwner) return false;

    // Superadmin status
    const isSuperAdminUser = userRoleNames.some((r) => r === "ROLE_SUPERADMIN" || r === "ROLE_SYSADMIN");

    // Get current user identifiers for comparison
    const currentUserIdentifiers = [
      currentUserProfile?.user_name?.toLowerCase(),
      currentUserProfile?.email_id?.toLowerCase(),
      currentUserEmail?.toLowerCase(),
      authParsed?.userNameId?.toLowerCase()
    ].filter(Boolean);

    // Check if current user is the creator
    const creatorIdentifier = header.created_by?.toLowerCase();
    const isCreator = creatorIdentifier && currentUserIdentifiers.includes(creatorIdentifier);

    // Rule: Creator can never approve their own budget
    if (isCreator) {
      if (!isSuperAdminUser) {
        return false;
      }
    }

    // Determine if the task assignment is role-based
    const isRoleBased = ROLE_NAMES.some(role => currentOwner.toUpperCase() === role);

    if (isRoleBased) {
      // For role-based tasks, any user with the assigned role (or superadmin) can approve
      return userRoleNames.includes(currentOwner.toUpperCase()) || isSuperAdminUser;
    } else {
      return currentUserIdentifiers.includes(currentOwner.toLowerCase()) || isSuperAdminUser;
    }
  })();

  // Helper to format date as YYYY-MM-DD (local date, no timezone shift)
  const formatDateForApi = (date: Date | undefined) => {
    if (!date) return undefined;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const updateMutation = useMutation({
    mutationFn: async (updateData: EditFormData) => {
      return apiRequest("PUT", `/api/budgets/${budgetId}`, {
        budget_name: updateData.budget_name,
        business_entity: updateData.business_entity,
        business_entity_name: updateData.business_entity_name,
        budget_owner_id: updateData.budget_owner_id,
        budget_owner_name: updateData.budget_owner_name,
        period_mst_id: updateData.period_mst_id,
        start_date: formatDateForApi(updateData.start_date),
        end_date: formatDateForApi(updateData.end_date),
      });
    },
    onSuccess: () => {
      toast({ title: "Budget updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
      setIsEditOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update budget",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/budgets/${budgetId}`);
    },
    onSuccess: () => {
      toast({ title: "Budget deleted successfully" });
      // Invalidate all budget-related queries (list with params, stats, etc.)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/budgets');
        }
      });
      setLocation("/app/budgets");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete budget",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/budgets/${budgetId}/submit`);
    },
    onSuccess: () => {
      toast({ title: "Budget submitted for approval" });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit budget",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Copy budget mutation
  const copyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/budgets/${budgetId}/copy`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Budget copied successfully", description: `New budget ID: ${data.newBudgetNumber}` });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      setLocation("/app/budgets");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to copy budget",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Approval action mutation using budget-specific approval API
  const approvalActionMutation = useMutation({
    mutationFn: async ({ action, remarks }: { action: "Approve" | "Reject" | "More" | "ReSubmit"; remarks?: string }) => {
      // Get taskId from sessionStorage (set when navigating from my-tasks)
      const taskId = data?.header?.attribute_12 !== undefined && data?.header?.attribute_12 !== null
        ? data?.header?.attribute_12
        : sessionStorage.getItem("currentTaskId");
      if (!taskId) {
        throw new Error("No active task found. Please navigate from My Tasks page.");
      }

      // Use budget-specific approval API which handles both workflow and status updates
      return apiRequest("POST", `/api/budgets/${budgetId}/process-approval`, {
        taskId,
        result: action,
        comments: remarks || "",
      });
    },
    onSuccess: (_, variables) => {
      const actionLabel = variables.action === "Approve" ? "approved" :
        variables.action === "Reject" ? "rejected" :
          variables.action === "More" ? "returned for more information" :
            variables.action === "ReSubmit" ? "resubmit" :
              "returned for more information";
      toast({
        title: "Action completed",
        description: `Budget has been ${actionLabel}`
      });
      // Clear the taskId from session storage
      sessionStorage.removeItem("currentTaskId");
      // Invalidate queries to refresh the page with updated data
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-engine/my-tasks"] });
      // Stay on the same page - do not redirect
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to complete action",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const delegateActionMutation = useMutation({
    mutationFn: async ({ userName, comments }: { userName: string; comments: string }) => {
      const taskId = data?.header?.attribute_12 !== undefined && data?.header?.attribute_12 !== null
        ? data?.header?.attribute_12
        : sessionStorage.getItem("currentTaskId");
      if (!taskId) {
        throw new Error("No active task found. Please navigate from My Tasks page.");
      }
      return apiRequest("POST", "/api/workflow/delegate-request", {
        taskId,
        userName,
        comments,
        entityId: budgetId,
        module: "BUDGET",
      });
    },
    onSuccess: () => {
      toast({
        title: "Action completed",
        description: "Budget approval has been delegated",
      });
      sessionStorage.removeItem("currentTaskId");
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-engine/my-tasks"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delegate request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addLineMutation = useMutation({
    mutationFn: async (lineData: LineFormData) => {
      // Calculate total amount from period amounts if using quarterly/monthly
      const periodMstId = String(data?.header?.period_mst_id || "");
      const periodPayload = buildPeriodAmountsPayload(
        periodMstId,
        lineData.period_amounts,
        data?.header?.budget_curr
      );
      let totalAmount = parseFloat(lineData.amount) || 0;

      if (periodMstId === "2" || periodMstId === "3") {
        totalAmount = periodPayload.reduce((sum, val) => sum + (val.amount || 0), 0);
      }

      if (totalAmount === 0) {
        throw new Error("Total amount shouldn't be zero");
      }

      return apiRequest("POST", `/api/budgets/${budgetId}/lines`, {
        cost_center_id: lineData.cost_center_id,
        cost_center_code: lineData.cost_center_code,
        cost_center_name: lineData.cost_center_name,
        amount: totalAmount,
        description: lineData.description || null,
        location_ids: lineData.location_ids,
        department_ids: lineData.department_ids,
        period_amounts: periodPayload,
      });
    },
    onSuccess: () => {
      toast({ title: "Budget line added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
      setIsAddLineOpen(false);
      setLineFormData({
        cost_center_id: "",
        cost_center_code: "",
        cost_center_name: "",
        amount: "0",
        description: "",
        all_locations: true,
        location_ids: [],
        all_departments: true,
        department_ids: [],
        period_amounts: {},
      });
      setLocationSearch("");
      setDepartmentSearch("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add budget line",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddLine = () => {
    if (!lineFormData.cost_center_id) {
      toast({
        title: "Please select a cost centre",
        variant: "destructive",
      });
      return;
    }
    if (
      // !lineFormData.all_locations && 
      lineFormData.location_ids.length === 0) {
      toast({
        title: "Please select at least one location", // or choose All
        variant: "destructive",
      });
      return;
    }
    if (
      // !lineFormData.all_departments && 
      lineFormData.department_ids.length === 0) {
      toast({
        title: "Please select at least one department", // or choose All
        variant: "destructive",
      });
      return;
    }

    // If "All" is selected, send all IDs
    const submitData = {
      ...lineFormData,
      location_ids: 
      // lineFormData.all_locations ? (locations?.map(l => l.id) || []) : 
      lineFormData.location_ids,
      department_ids: 
      // lineFormData.all_departments ? (departments?.map(d => d.id) || []) : 
      lineFormData.department_ids,
    };
    addLineMutation.mutate(submitData);
  };

  const validateLinesImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("POST", `/api/budgets/${budgetId}/lines/bulk-import/validate`, formData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Validation failed" }));
        throw new Error(err.error || "Validation failed");
      }
      return response.json() as Promise<BulkLinesImportPreview>;
    },
    onSuccess: (data) => {
      setLinesImportPreview(data);
    },
    onError: (error: Error) => {
      toast({ title: "Validation failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkImportLinesMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("POST", `/api/budgets/${budgetId}/lines/bulk-import`, formData);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error || "Import failed");
      }
      return response.json() as Promise<BulkLinesImportResponse>;
    },
    onSuccess: (data) => {
      setLinesImportPreview(null);
      setLinesImportResults(data);
      setLinesImportFile(null);
      if (data.created > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
        toast({
          title: "Import complete",
          description: `${data.created} line${data.created !== 1 ? "s" : ""} created${data.errors > 0 ? `, ${data.errors} failed` : ""}`,
        });
      } else {
        toast({ title: "Import failed", description: "No lines were created", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, lineData }: { lineId: number; lineData: LineFormData }) => {
      const periodMstId = String(data?.header?.period_mst_id || "");
      const periodPayload = buildPeriodAmountsPayload(
        periodMstId,
        lineData.period_amounts,
        data?.header?.budget_curr
      );
      let totalAmount = parseFloat(lineData.amount) || 0;

      if (periodMstId === "2" || periodMstId === "3") {
        totalAmount = periodPayload.reduce((sum, val) => sum + (val.amount || 0), 0);
      }

      if (totalAmount === 0) {
        throw new Error("Total amount shouldn't be zero");
      }

      return apiRequest("PUT", `/api/budgets/${budgetId}/lines/${lineId}`, {
        cost_center_id: lineData.cost_center_id,
        cost_center_code: lineData.cost_center_code,
        cost_center_name: lineData.cost_center_name,
        amount: totalAmount,
        description: lineData.description || null,
        location_ids: lineData.location_ids,
        department_ids: lineData.department_ids,
        period_amounts: periodPayload,
      });
    },
    onSuccess: () => {
      toast({ title: "Budget line updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
      setIsEditLineOpen(false);
      setEditingLine(null);
      resetLineForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update budget line",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (lineId: number) => {
      return apiRequest("DELETE", `/api/budgets/${budgetId}/lines/${lineId}`);
    },
    onSuccess: () => {
      toast({ title: "Budget line deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
      setLineToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete budget line",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyLineMutation = useMutation({
    mutationFn: async (lineId: number) => {
      return apiRequest("POST", `/api/budgets/${budgetId}/lines/${lineId}/copy`);
    },
    onSuccess: () => {
      toast({ title: "Budget line copied successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to copy budget line",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Notes save handler for collaboration panel
  const handleSaveNotes = async (notes: string) => {
    await apiRequest("PUT", `/api/budgets/${budgetId}/notes`, { notes });
    queryClient.invalidateQueries({ queryKey: ["/api/budgets", budgetId, "notes"] });
  };

  const resetLineForm = () => {
    setLineFormData({
      cost_center_id: "",
      cost_center_code: "",
      cost_center_name: "",
      amount: "0",
      description: "",
      all_locations: true,
      location_ids: [],
      all_departments: true,
      department_ids: [],
      period_amounts: {},
    });
    setLocationSearch("");
    setDepartmentSearch("");
  };

  const handleEditLine = (line: BudgetLine) => {
    setEditingLine(line);

    // Get existing location mappings for this line
    const lineLocationMappings = data?.locationMappings?.filter(
      (m) => Number(m.budget_line_id) === Number(line.id)
    ) || [];
    const lineLocationIds = lineLocationMappings.map((m) => Number(m.loc_id));
    // Get existing department mappings for this line
    const lineDepartmentMappings = data?.departmentMappings?.filter(
      (m) => Number(m.budget_line_id) === Number(line.id)
    ) || [];
    const lineDepartmentIds = lineDepartmentMappings.map((m) => Number(m.dept_id));

    // Determine if "All" was selected by checking every available location/department
    // is present in the stored mappings. Count equality is insufficient because it can
    // give false positives when mappings are missing.
    const storedLocSet = new Set(lineLocationIds);
    const allLocationsSelected =
      lineLocationIds.length > 0 &&
      !!locations?.length &&
      locations.every((loc) => storedLocSet.has(loc.id));

    const storedDeptSet = new Set(lineDepartmentIds);
    const allDepartmentsSelected =
      lineDepartmentIds.length > 0 &&
      !!departments?.length &&
      departments.every((dept) => storedDeptSet.has(dept.id));

    // Get period amounts for this line
    const linePeriodAmounts = data?.periodAmounts?.filter(
      (p) => Number(p.budget_line_id) === Number(line.id)
    ) || [];
    const periodAmountsMap: Record<string, string> = {};
    linePeriodAmounts.forEach((p) => {
      if (p.period_line_id) {
        periodAmountsMap[p.period_line_id.toLowerCase()] = String(p.amount || 0);
      }
    });

    setLineFormData({
      cost_center_id: line.segment_dtl_id || "",
      cost_center_code: line.segment_dtl_code || "",
      cost_center_name: line.segment_dtl_name || "",
      amount: line.amount || "0",
      description: line.description || "",
      all_locations: allLocationsSelected,
      location_ids:  lineLocationIds,
      all_departments: allDepartmentsSelected,
      department_ids: lineDepartmentIds,
      period_amounts: periodAmountsMap,
    });
    setIsEditLineOpen(true);
  };

  const handleUpdateLine = () => {
    if (!editingLine) return;

    if (!lineFormData.cost_center_id) {
      toast({
        title: "Please select a cost centre",
        variant: "destructive",
      });
      return;
    }
    if (
      // !lineFormData.all_locations && 
      lineFormData.location_ids?.length === 0) {
      toast({
        title: "Please select at least one location",
        variant: "destructive",
      });
      return;
    }
    if (
      // !lineFormData.all_departments && 
      lineFormData.department_ids?.length === 0) {
      toast({
        title: "Please select at least one department",
        variant: "destructive",
      });
      return;
    }

    const submitData = {
      ...lineFormData,
      location_ids: 
      // lineFormData.all_locations ? (locations?.map(l => l.id) || []) : 
      lineFormData.location_ids,
      department_ids: 
      // lineFormData.all_departments ? (departments?.map(d => d.id) || []) : 
      lineFormData.department_ids,
    };

    updateLineMutation.mutate({ lineId: editingLine.id, lineData: submitData });
  };

  const handleDeleteLine = () => {
    if (lineToDelete) {
      deleteLineMutation.mutate(lineToDelete.id);
    }
  };

  const handleCopyLine = (line: BudgetLine) => {
    copyLineMutation.mutate(line.id);
  };

  const openEditSheet = () => {
    if (data?.header) {
      const header = data.header;
      setFormData({
        budget_name: header.budget_name || "",
        business_entity: header.business_entity || "",
        business_entity_name: header.business_entity_name || "",
        budget_owner_id: header.budget_owner_id || "",
        budget_owner_name: header.budget_owner_name || "",
        period_mst_id: header.period_mst_id || "",
        start_date: header.start_date ? new Date(header.start_date) : undefined,
        end_date: header.end_date ? new Date(header.end_date) : undefined,
      });
      setIsEditOpen(true);
    }
  };

  const handleSave = () => {
    if (!formData.budget_name || !formData.business_entity || !formData.budget_owner_id ||
      !formData.period_mst_id || !formData.start_date || !formData.end_date) {
      toast({
        title: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(formData);
  };

  const isDraft = data?.header?.status?.toLowerCase() === "draft";

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
            <h3 className="text-base font-medium mb-1">Budget Not Found</h3>
            <p className="text-sm text-muted-foreground mb-3">Unable to load budget {budgetId}</p>
            <Link href="/app/budgets">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Budgets
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { header, lines, departmentMappings, locationMappings } = data;

  const summaryRowsDetail = [buildBudgetDetailSummaryRow(header)];
  const lineRowsFlatDetail = buildBudgetDetailLineRowsFlat(
    header,
    lines,
    departmentMappings,
    locationMappings,
  );
  const exportFileSlug = `budget_${header.budget_id || header.id}_${new Date().toISOString().split("T")[0]}`;

  const exportDetailToCSV = () => {
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const block = (rows: Record<string, any>[]) => {
      if (rows.length === 0) return "";
      const headers = Object.keys(rows[0]);
      return [
        headers.join(","),
        ...rows.map((row) =>
          headers.map((h) => esc(String((row as Record<string, any>)[h] ?? ""))).join(","),
        ),
      ].join("\n");
    };
    const csvParts = [block(summaryRowsDetail), "", "Budget line items", block(lineRowsFlatDetail)].filter(
      Boolean,
    );
    const csv = csvParts.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
  };

  const exportDetailToExcel = () => {
    const wb = XLSX.utils.book_new();
    const totalsSheet = [
      { Metric: "Total Budget", Value: toExportAmount(budgetAmount) },
      { Metric: "Currency", Value: header.budget_curr || "" },
      { Metric: "Consumed", Value: toExportAmount(consumedAmount) },
      { Metric: "Reserved", Value: toExportAmount(reservedAmount) },
      { Metric: "Available", Value: toExportAmount(availableAmount) },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalsSheet), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRowsDetail), "Budgets");
    if (lineRowsFlatDetail.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRowsFlatDetail), "Budget lines");
    }
    XLSX.writeFile(wb, `${exportFileSlug}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportDetailToPDF = () => {
    const data = summaryRowsDetail;
    const columns = Object.keys(data[0]);
    const rows = data.map((row) =>
      columns.map((col) => String((row as Record<string, string | number>)[col] ?? "")),
    );
    generateTablePdf({
      title: "Budget",
      subtitle: [
        header.budget_name || undefined,
        `Total Budget: ${formatCurrency(String(budgetAmount), header.budget_curr)}`,
      ]
        .filter(Boolean)
        .join(" | "),
      columns,
      rows,
      filename: exportFileSlug,
    });
    toast({ title: "Exported to PDF" });
  };

  const {
    consumed: consumedAmount,
    reserved: reservedAmount,
    available: availableAmount,
    total: budgetAmount,
  } = getBudgetAmountBreakdown({
    totalAmount: header.budget_amount,
    consumed_amount: header.consumed_amount,
    reserved_amount: header.reserved_amount,
  });

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

  return (
    <div className="flex">
      {/* Main Content Area */}
      <div className={`flex-1 p-4 space-y-4 transition-all duration-300 ${collaborationPanelRef.current?.isPinned ? "pr-6" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/app/budgets">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold" data-testid="text-budget-name">
                  {header.budget_name || `Budget #${header.budget_id || header.id}`}
                </h1>
                <StatusBadge status={header.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                Budget ID: {header.budget_id || header.id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(isDraft && (String(header.created_by) === currentUserEmail || String(header.created_by) === currentUserIdStr || String(header.budget_owner_id) === currentUserIdStr || header.budget_owner_name === currentUserProfile?.name || isSuperadmin)) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      data-testid="button-delete-budget"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Budget</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this budget? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-delete-confirm"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            )}
            {(isDraft && (String(header.created_by) === currentUserEmail || String(header.created_by) === currentUserIdStr || String(header.budget_owner_id) === currentUserIdStr || header.budget_owner_name === currentUserProfile?.name || isSuperadmin)) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditSheet}
                  data-testid="button-edit-budget"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>

                <Button
                  size="sm"
                  onClick={() => {
                    if (!lines || lines.length === 0) {
                      toast({
                        title: "Cannot submit budget",
                        description: "Please add at least one budget line item before submitting for approval.",
                        variant: "destructive",
                      });
                      return;
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

            {(header.status === "More Info Required" || header.status?.toLowerCase() === "more info required" || header.status?.toLowerCase() === "more") && (String(header.created_by) === currentUserEmail || String(header.created_by) === currentUserIdStr || isSuperadmin) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditSheet}
                  data-testid="button-edit-budget"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>

                <Button
                  size="sm"
                  onClick={() => {
                    if (!lines || lines.length === 0) {
                      toast({
                        title: "Cannot submit budget",
                        description: "Please add at least one budget line item before submitting for approval.",
                        variant: "destructive",
                      });
                      return;
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
            {/* Approval Actions - Show when status is Pending Approval AND current user is the task owner */}
            {(header.status === "Pending Approval" || header.status?.toLowerCase() === "pending approval") && (canApprove || isSuperadmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="button-actions">
                    Approve
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      resolveApprovalChecklistAvailability("Budget").then((available) => {
                        if (available) {
                          setChecklistDialogOpen(true);
                        } else {
                          setApprovalAction("Approve");
                          setApprovalComments("");
                          setApprovalDialogOpen(true);
                        }
                      });
                    }}
                    data-testid="button-approve"
                    className="text-emerald-600 dark:text-emerald-400"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setApprovalAction("Reject");
                      setApprovalComments("");
                      setApprovalDialogOpen(true);
                    }}
                    data-testid="button-reject"
                    className="text-destructive"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setApprovalAction("More");
                      setApprovalComments("");
                      setApprovalDialogOpen(true);
                    }}
                    data-testid="button-more-info"
                    className="text-orange-600 dark:text-orange-400"
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Request for More Info
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setApprovalAction("Request");
                      setApprovalComments("");
                      setApprovalDialogOpen(true);
                    }}
                    data-testid="button-delegate"
                    className="text-blue-600 dark:text-blue-400"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Request for Delegate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Copy Budget Button - Show when status is Approved or Expired */}
            {(header.status?.toLowerCase() === "approved" || header.status?.toLowerCase() === "expired") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCopyConfirmOpen(true)}
                data-testid="button-copy-budget"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Budget
              </Button>
            )}

            {header.status?.toLowerCase() === "approved" && (
              <ViewChecklistButton moduleName="Budget" refNumber={header.budget_id || String(header.id)} />
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-export-budget">
                  <Upload className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportDetailToCSV} data-testid="menu-item-export-csv">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportDetailToExcel} data-testid="menu-item-export-excel">
                  <FileDown className="h-4 w-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportDetailToPDF} data-testid="menu-item-export-pdf">
                  <FileText className="h-4 w-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Budget Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Budget</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(String(budgetAmount), header.budget_curr)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Currency</p>
                  <p className="text-sm font-medium">{header.budget_curr || "-"}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Consumed</p>
                  <p className="text-sm font-medium text-orange-600">
                    {formatCurrency(header.consumed_amount, header.budget_curr)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Reserved</p>
                  <p className="text-sm font-medium text-amber-600">
                    {formatCurrency(header.reserved_amount, header.budget_curr)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Available</p>
                  <p className="text-sm font-medium text-emerald-600">
                    {formatCurrency(availableAmount.toString(), header.budget_curr)}
                  </p>
                </div>
              </div>
              <UtilizationBar
                consumed={consumedAmount}
                total={budgetAmount}
                label="Utilization"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Budget Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Owner</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {header.budget_owner_name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Business Entity</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {header.business_entity_name || "-"}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start Date</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(header.start_date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">End Date</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(header.end_date)}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Period</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {header.period_name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Created By</p>
                  <p className="text-sm font-medium">{header.created_by || "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Approval History Section - Hidden for vendor users, only shown when status is not Draft */}
        {header.status?.toLowerCase() !== "draft" && (
          <Accordion
            type="single"
            collapsible
            defaultValue="approval-history"
            className="mb-4"
          >
            <AccordionItem
              value="approval-history"
              className="border rounded-lg"
            >
              <AccordionTrigger className="px-4 py-2 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    Approval History
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-0">
                <div className="overflow-x-auto w-full pb-4 custom-scrollbar min-w-0">
                  {/* Horizontal Timeline */}
                  <div className="flex items-start min-w-max">
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
                      if (data.header.status && pendingStatuses.includes(data.header.status)) {
                        const currentApprovers = data.header.approvers_list
                          ? data.header.approvers_list
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
                                <RoleUsersTooltip roleName={item.roleName} businessEntity={header?.business_entity || ""}>
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <Card>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Budget Line Items ({lines.length})
            </CardTitle>
            {((isDraft || (header.status === "More Info Required" || header.status?.toLowerCase() === "more info required" || header.status?.toLowerCase() === "more")) && (header.created_by === currentUserEmail || isSuperadmin)) && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setIsAddLineOpen(true)}
                  data-testid="button-add-budget-line"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Budget Line
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsLinesImportOpen(true)}
                  data-testid="button-import-excel"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Import from Excel
                </Button>
                <input
                  ref={linesImportFileRef}
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
          </CardHeader>
          <CardContent className="p-0">
            {lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <h3 className="text-base font-medium mb-1">No line items</h3>
                <p className="text-sm text-muted-foreground">
                  Add budget line items to allocate funds
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-primary/10">
                    <TableHead className="text-xs font-medium">Cost Centre</TableHead>
                    <TableHead className="text-xs font-medium">Description</TableHead>
                    <TableHead className="text-xs font-medium">Department</TableHead>
                    <TableHead className="text-xs font-medium">Location</TableHead>
                    <TableHead className="text-xs font-medium">Amount</TableHead>
                    {((isDraft || (header.status === "More Info Required" || header.status?.toLowerCase() === "more info required" || header.status?.toLowerCase() === "more")) && (header.created_by === currentUserEmail || isSuperadmin)) && (
                      <TableHead className="text-xs font-medium w-[80px]">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {

                    const { consumed, reserved, available, total: amount } =
                      getBudgetLineAmountBreakdown(line);

                    // Get locations for this line
                    const lineLocations = data?.locationMappings?.filter(
                      (m) => Number(m.budget_line_id) === Number(line.id)
                    ) || [];
                    const locationDisplay = 
                    // lineLocations.length === 0
                    //   ? "All"
                    //   : 
                      lineLocations.map((l) => l.loc_name).join(", ");
                    // Get departments for this line
                    const lineDepartments = data?.departmentMappings?.filter(
                      (m) => Number(m.budget_line_id) === Number(line.id)
                    ) || [];
                    const departmentDisplay = 
                    // lineDepartments.length === 0
                    //   ? "All"
                    //   : 
                      lineDepartments.map((d) => d.dept_name).join(", ");

                    return (
                      <TableRow key={line.id} className="align-top">
                        <TableCell className="py-3 text-sm">
                          {line.segment_dtl_name || "-"}
                        </TableCell>
                        <TableCell className="py-3 text-sm max-w-[180px]">
                          {line.description ? (
                            <span className="line-clamp-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[180px] cursor-default">
                                    {line.description}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{line.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-sm max-w-[150px]">
                          <span className="line-clamp-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[150px] cursor-default">
                                  {departmentDisplay}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{departmentDisplay}</p>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-sm max-w-[150px]">
                          <span className="line-clamp-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[150px] cursor-default">
                                  {locationDisplay}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{locationDisplay}</p>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-sm">
                          <div className="space-y-1">
                            <div className="font-semibold">{formatCurrency(String(amount), header.budget_curr)}</div>
                            <div className="text-xs">
                              <span className="text-blue-600">RA:</span> {formatCurrency(String(reserved), header.budget_curr)}
                            </div>
                            <div className="text-xs">
                              <span className="text-orange-600">CA:</span> {formatCurrency(String(consumed), header.budget_curr)}
                            </div>
                            <div className="text-xs">
                              <span className="text-amber-600">AA:</span> {formatCurrency(String(available), header.budget_curr)}
                            </div>
                          </div>
                        </TableCell>
                        {/* <TableCell className="py-3 text-sm">
                          <div className="space-y-1">
                            <div className="font-semibold">{formatCurrency(String(amount), header.budget_curr)}</div>
                            <div className="text-xs">
                              <span className="text-blue-600">RA:</span> {formatCurrency(String(reserved), header.budget_curr)}
                            </div>
                            <div className="text-xs">
                              <span className="text-orange-600">CA:</span> {formatCurrency(String(consumed), header.budget_curr)}
                            </div>
                            <div className="text-xs">
                              <span className="text-amber-600">AA:</span> {formatCurrency(String(available), header.budget_curr)}
                            </div>
                          </div>
                        </TableCell> */}
                        {((isDraft || (header.status === "More Info Required" || header.status?.toLowerCase() === "more info required" || header.status?.toLowerCase() === "more")) && (header.created_by === currentUserEmail || isSuperadmin)) && (
                          <TableCell className="py-3">
                            <div className="flex items-center gap-1">
                              {((isDraft || (header.status === "More Info Required" || header.status?.toLowerCase() === "more info required" || header.status?.toLowerCase() === "more")) && (header.created_by === currentUserEmail || isSuperadmin)) && (
                              <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditLine(line)}
                                data-testid={`button-edit-line-${line.id}`}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCopyLine(line)}
                                data-testid={`button-copy-line-${line.id}`}
                                title="Copy"
                              >
                                <Copy className="h-4 w-4 text-green-600" />
                              </Button>
                              </>
                              )}
                              {((isDraft || (header.status === "More Info Required" || header.status?.toLowerCase() === "more info required" || header.status?.toLowerCase() === "more")) && (header.created_by === currentUserEmail || isSuperadmin)) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLineToDelete(line)}
                                data-testid={`button-delete-line-${line.id}`}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>


      {/* Collaboration Panel - Reusable Component */}
      <CollaborationPanel
        ref={collaborationPanelRef}
        entityType="BUDGET"
        entityId={budgetId || ""}
        notes={notesData?.notes || ""}
        notesLoading={notesLoading}
        onSaveNotes={handleSaveNotes}
        notesLabel="Budget Notes"
        onCountsChange={(counts) => setCollaborationCount(counts.totalCount)}
      />

      <FormSheet
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Budget"
        onSubmit={handleSave}
        submitLabel="Save Changes"
        isSubmitting={updateMutation.isPending}
        widthClassName="sm:max-w-md"
      >
        <p className="text-xs text-muted-foreground mb-4">
          <span className="text-destructive">*</span> Indicates mandatory fields
        </p>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="budget_name">
                Budget Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="budget_name"
                value={formData.budget_name}
                onChange={(e) => setFormData({ ...formData, budget_name: e.target.value })}
                placeholder="Enter budget name"
                data-testid="input-edit-budget-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_entity">
                Business Entity <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.business_entity}
                onValueChange={(value) => {
                  const entity = entities?.find(e => e.id === value);
                  setFormData({
                    ...formData,
                    business_entity: value,
                    business_entity_name: entity?.name || "",
                  });
                }}
              >
                <SelectTrigger data-testid="select-edit-business-entity">
                  <SelectValue placeholder="Select Entity" />
                </SelectTrigger>
                <SelectContent>
                  {entities?.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget_owner">
                Budget Owner <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.budget_owner_id}
                onValueChange={(value) => {
                  const user = users?.find(u => u.id.toString() === value);
                  setFormData({
                    ...formData,
                    budget_owner_id: value,
                    budget_owner_name: user?.name || "",
                  });
                }}
              >
                <SelectTrigger data-testid="select-edit-budget-owner">
                  <SelectValue placeholder="Select Owner" />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="period">
                Period <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.period_mst_id}
                onValueChange={(value) => {
                  const selectedPeriod = periods?.find(p => p.id.toString() === value);
                  const periodName = selectedPeriod?.period_name?.toLowerCase() || "";
                  const isCustom = value === "4" || periodName === "custom";

                  const start = formData.start_date || (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
                  let endDate = formData.end_date ? new Date(formData.end_date) : new Date(start);

                  if (!isCustom) {
                    endDate = new Date(start);
                    if (periodName === "quarterly" || value === "2") {
                      endDate.setMonth(endDate.getMonth() + 3);
                    } else if (periodName === "monthly" || value === "3") {
                      endDate.setMonth(endDate.getMonth() + 1);
                    } else {
                      endDate.setFullYear(endDate.getFullYear() + 1);
                    }
                    endDate.setDate(endDate.getDate() - 1);
                  } else {
                    if (!formData.end_date || endDate < start) {
                      endDate = new Date(start);
                      endDate.setFullYear(endDate.getFullYear() + 1);
                      endDate.setDate(endDate.getDate() - 1);
                    }
                  }

                  setFormData({
                    ...formData,
                    period_mst_id: value,
                    start_date: start,
                    end_date: endDate,
                  });
                }}
              >
                <SelectTrigger data-testid="select-edit-period">
                  <SelectValue placeholder="Select Period" />
                </SelectTrigger>
                <SelectContent>
                  {periods?.map((period) => (
                    <SelectItem key={period.id} value={period.id.toString()}>
                      {period.period_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  const date = new Date(value);
                  const selectedPeriod = periods?.find(
                    (p) => p.id.toString() === formData.period_mst_id
                  );
                  const periodName = selectedPeriod?.period_name?.toLowerCase() || "";
                  const isCustom =
                    formData.period_mst_id === "4" || periodName === "custom";
                  let endDate = formData.end_date
                    ? new Date(formData.end_date)
                    : new Date(date);
                  if (!isCustom) {
                    endDate = new Date(date);
                    if (periodName === "quarterly" || formData.period_mst_id === "2") {
                      endDate.setMonth(endDate.getMonth() + 3);
                    } else if (periodName === "monthly" || formData.period_mst_id === "3") {
                      endDate.setMonth(endDate.getMonth() + 1);
                    } else {
                      endDate.setFullYear(endDate.getFullYear() + 1);
                    }
                    endDate.setDate(endDate.getDate() - 1);
                  } else {
                    if (endDate < date) {
                      endDate = new Date(date);
                      endDate.setFullYear(endDate.getFullYear() + 1);
                      endDate.setDate(endDate.getDate() - 1);
                    }
                  }
                  setFormData({
                    ...formData,
                    start_date: date,
                    end_date: endDate,
                  });
                }}
                data-testid="budget-start-date"
              />
            </div>

            <div className="space-y-2">
              <Label>
                End Date {formData.period_mst_id === "4" && <span className="text-destructive">*</span>}
              </Label>
              <Input
                type="date"
                className={formData.period_mst_id !== "4" ? "bg-muted" : ""}
                value={formData.end_date}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  const date = new Date(value);
                  if (formData.start_date && date < new Date(formData.start_date)) {
                    return;
                  }
                  setFormData((prev) => ({
                    ...prev,
                    end_date: date,
                  }));
                }}
                min={formData.start_date ? new Date(formData.start_date).toISOString().split("T")[0] : undefined}
                data-testid="input-end-date"
                disabled={formData.period_mst_id !== "4"}
              />
              {formData.period_mst_id !== "4" && (
                <p className="text-xs text-muted-foreground">
                  End date is auto-calculated based on Period
                </p>
              )}
            </div>
          </div>
      </FormSheet>

      <FormSheet
        open={isAddLineOpen}
        onOpenChange={setIsAddLineOpen}
        title="Add Budget Line"
        description="Add a new budget line item with cost centre allocation."
        onSubmit={handleAddLine}
        submitLabel="Add Line"
        isSubmitting={addLineMutation.isPending}
        widthClassName="sm:max-w-2xl"
      >
        <p className="text-xs text-muted-foreground mb-4">
          <span className="text-destructive">*</span> Indicates mandatory fields
        </p>
          <div className="space-y-1.5 mt-4">
            <Label>Description</Label>
            <Textarea
              value={lineFormData.description}
              onChange={(e) => setLineFormData({ ...lineFormData, description: e.target.value })}
              placeholder="Optional description for this budget line"
              rows={2}
              data-testid="textarea-line-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-6 mt-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Cost Centre <span className="text-destructive">*</span></Label>
                <Select
                  value={lineFormData.cost_center_id}
                  onValueChange={(value) => {
                    const cc = costCenters?.find(c => String(c.id) === value);
                    setLineFormData({
                      ...lineFormData,
                      cost_center_id: value,
                      cost_center_code: cc?.code || "",
                      cost_center_name: cc?.name || "",
                    });
                  }}
                  data-testid="select-line-cost-center"
                >
                  <SelectTrigger data-testid="trigger-line-cost-center">
                    <SelectValue placeholder="Select cost centre" />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters?.map((cc) => (
                      <SelectItem key={cc.id} value={String(cc.id)}>
                        {cc.code} - {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Location <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <div
                    className="border rounded-md p-2 min-h-[42px] flex flex-wrap gap-1.5 items-center cursor-pointer hover:border-primary/50"
                    onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                    data-testid="container-locations"
                  >
                    {/* {lineFormData.all_locations ? (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        All
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLineFormData({ ...lineFormData, all_locations: false });
                          }}
                          className="ml-1 hover:bg-muted rounded-full p-0.5"
                          data-testid="remove-all-locations"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : (
                      <> */}
                        {lineFormData.location_ids.map((locId) => {
                          const loc = locations?.find(l => l.id === locId);
                          return loc ? (
                            <Badge key={locId} variant="secondary" className="gap-1 pr-1">
                              {loc.name}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextLine = {
                                    ...lineFormData,
                                    location_ids: lineFormData.location_ids.filter(id => id !== locId),
                                  };
                                  setLineFormData(nextLine);
                                }}
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                                data-testid={`remove-location-${locId}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      {/* </>
                    )} */}
                    <div className="ml-auto p-1">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  {showLocationDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Search locations..."
                          value={locationSearch}
                          onChange={(e) => setLocationSearch(e.target.value)}
                          className="h-8"
                          data-testid="input-search-locations"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto p-1">
                        {/* <button
                          type="button"
                          onClick={() => {
                            setLineFormData({ ...lineFormData, all_locations: true, location_ids: [] });
                            setShowLocationDropdown(false);
                          }}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded font-medium"
                          data-testid="select-all-locations"
                        >
                          All
                        </button> */}
                        {locations
                          ?.filter(loc =>
                            loc.name.toLowerCase().includes(locationSearch.toLowerCase()) &&
                            !lineFormData.location_ids.includes(loc.id)
                          )
                          .map((loc) => (
                            <button
                              key={loc.id}
                              type="button"
                              onClick={() => {
                                const nextLine = {
                                  ...lineFormData,
                                  all_locations: false,
                                  location_ids: [...lineFormData.location_ids, loc.id],
                                };
                                setLineFormData(nextLine);
                                setShowLocationDropdown(false);
                                setLocationSearch("");
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
                              data-testid={`select-location-${loc.id}`}
                            >
                              {loc.name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Department <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <div
                    className="border rounded-md p-2 min-h-[42px] flex flex-wrap gap-1.5 items-center cursor-pointer hover:border-primary/50"
                    onClick={() => setShowDepartmentDropdown(!showDepartmentDropdown)}
                    data-testid="container-departments"
                  >
                    {/* {lineFormData.all_departments ? (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        All
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLineFormData({ ...lineFormData, all_departments: false });
                          }}
                          className="ml-1 hover:bg-muted rounded-full p-0.5"
                          data-testid="remove-all-departments"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : (
                      <> */}
                        {lineFormData.department_ids.map((deptId) => {
                          const dept = departments?.find(d => d.id === deptId);
                          return dept ? (
                            <Badge key={deptId} variant="secondary" className="gap-1 pr-1">
                              {dept.name}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextLine = {
                                    ...lineFormData,
                                    department_ids: lineFormData.department_ids.filter(id => id !== deptId),
                                  };
                                  setLineFormData(nextLine);
                                }}
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                                data-testid={`remove-department-${deptId}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      {/* </>
                    )} */}
                    <div className="ml-auto p-1">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  {showDepartmentDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Search departments..."
                          value={departmentSearch}
                          onChange={(e) => setDepartmentSearch(e.target.value)}
                          className="h-8"
                          data-testid="input-search-departments"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto p-1">
                        {/* <button
                          type="button"
                          onClick={() => {
                            setLineFormData({ ...lineFormData, all_departments: true, department_ids: [] });
                            setShowDepartmentDropdown(false);
                          }}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded font-medium"
                          data-testid="select-all-departments"
                        >
                          All
                        </button> */}
                        {departments
                          ?.filter(dept =>
                            dept.name.toLowerCase().includes(departmentSearch.toLowerCase()) &&
                            !lineFormData.department_ids.includes(dept.id)
                          )
                          .map((dept) => (
                            <button
                              key={dept.id}
                              type="button"
                              onClick={() => {
                                const nextLine = {
                                  ...lineFormData,
                                  all_departments: false,
                                  department_ids: [...lineFormData.department_ids, dept.id],
                                };
                                setLineFormData(nextLine);
                                setShowDepartmentDropdown(false);
                                setDepartmentSearch("");
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
                              data-testid={`select-department-${dept.id}`}
                            >
                              {dept.name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Annually or Custom - single amount field */}
              {(String(data?.header?.period_mst_id) === "1" || String(data?.header?.period_mst_id) === "4") && (
                <div className="space-y-1.5">
                  <Label>Amount <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={lineFormData.amount}
                    onChange={(e) => setLineFormData({ ...lineFormData, amount: e.target.value })}
                    onKeyDown={preventInvalidNumberKey}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    placeholder="0"
                    data-testid="input-line-amount"
                  />
                </div>
              )}

              {/* Quarterly - 4 amount fields */}
              {String(data?.header?.period_mst_id) === "2" && (
                <>
                  {QUARTERLY_PERIODS.map((period) => (
                    <div key={period.key} className="space-y-1.5">
                      <Label>{period.label} <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        min="0"
                        value={lineFormData.period_amounts[period.key] || "0"}
                        onChange={(e) => setLineFormData({
                          ...lineFormData,
                          period_amounts: { ...lineFormData.period_amounts, [period.key]: String(Math.max(0, parseFloat(e.target.value) || 0)) }
                        })}
                        onKeyDown={preventInvalidNumberKey}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        placeholder="0"
                        data-testid={`input-line-amount-${period.key}`}
                      />
                    </div>
                  ))}
                </>
              )}

              {/* Monthly - 12 amount fields */}
              {String(data?.header?.period_mst_id) === "3" && (
                <>
                  {MONTHLY_PERIODS.map((period) => (
                    <div key={period.key} className="space-y-1.5">
                      <Label>{period.label} <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        min="0"
                        value={lineFormData.period_amounts[period.key] || "0"}
                        onChange={(e) => setLineFormData({
                          ...lineFormData,
                          period_amounts: { ...lineFormData.period_amounts, [period.key]: String(Math.max(0, parseFloat(e.target.value) || 0)) }
                        })}
                        onKeyDown={preventInvalidNumberKey}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        placeholder="0"
                        data-testid={`input-line-amount-${period.key}`}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

      </FormSheet>

      {/* Edit Line Sheet */}
      <FormSheet
        open={isEditLineOpen}
        onOpenChange={(open) => {
          setIsEditLineOpen(open);
          if (!open) {
            setEditingLine(null);
            resetLineForm();
            setShowEditLocationDropdown(false);
            setShowEditDepartmentDropdown(false);
            setEditLocationSearch("");
            setEditDepartmentSearch("");
          }
        }}
        title="Edit Budget Line"
        description="Update budget line item with cost centre allocation."
        onSubmit={handleUpdateLine}
        submitLabel="Update Line"
        isSubmitting={updateLineMutation.isPending}
        widthClassName="sm:max-w-2xl"
      >
        <p className="text-xs text-muted-foreground mb-4">
          <span className="text-destructive">*</span> Indicates mandatory fields
        </p>
          <div className="space-y-1.5 mt-2">
            <Label>Description</Label>
            <Textarea
              value={lineFormData.description}
              onChange={(e) => setLineFormData({ ...lineFormData, description: e.target.value })}
              placeholder="Optional description for this budget line"
              rows={2}
              data-testid="textarea-edit-line-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-6 mt-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Cost Centre <span className="text-destructive">*</span></Label>
                <Select
                  value={lineFormData.cost_center_id}
                  onValueChange={(value) => {
                    const cc = costCenters?.find(c => String(c.id) === value);
                    setLineFormData({
                      ...lineFormData,
                      cost_center_id: value,
                      cost_center_code: cc?.code || "",
                      cost_center_name: cc?.name || "",
                    });
                  }}
                >
                  <SelectTrigger data-testid="select-edit-cost-center">
                    <SelectValue placeholder="Select cost centre" />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters?.map((cc) => (
                      <SelectItem key={cc.id} value={String(cc.id)}>
                        {cc.code} - {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Location <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <div
                    className="border rounded-md p-2 min-h-[42px] flex flex-wrap gap-1.5 items-center cursor-pointer hover:border-primary/50"
                    onClick={() => setShowEditLocationDropdown(!showEditLocationDropdown)}
                    data-testid="container-edit-locations"
                  >
                    {/* {lineFormData.all_locations ? (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        All
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLineFormData({ ...lineFormData, all_locations: false });
                          }}
                          className="ml-1 hover:bg-muted rounded-full p-0.5"
                          data-testid="edit-remove-all-locations"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : (
                      <> */}
                        {lineFormData.location_ids.map((locId) => {
                          const loc = locations?.find(l => l.id === locId);
                          return loc ? (
                            <Badge key={locId} variant="secondary" className="gap-1 pr-1">
                              {loc.name}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLineFormData({
                                    ...lineFormData,
                                    location_ids: lineFormData.location_ids.filter(id => id !== locId),
                                  });
                                }}
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                                data-testid={`edit-remove-location-${locId}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      {/* </>
                    )} */}
                    <div className="ml-auto p-1">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  {showEditLocationDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Search locations..."
                          value={editLocationSearch}
                          onChange={(e) => setEditLocationSearch(e.target.value)}
                          className="h-8"
                          data-testid="input-edit-search-locations"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto p-1">
                        {/* <button
                          type="button"
                          onClick={() => {
                            setLineFormData({ ...lineFormData, all_locations: true, location_ids: [] });
                            setShowEditLocationDropdown(false);
                          }}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded font-medium"
                          data-testid="edit-select-all-locations"
                        >
                          All
                        </button> */}
                        {locations
                          ?.filter(loc =>
                            loc.name.toLowerCase().includes(editLocationSearch.toLowerCase()) &&
                            !lineFormData.location_ids.includes(loc.id)
                          )
                          .map((loc) => (
                            <button
                              key={loc.id}
                              type="button"
                              onClick={() => {
                                setLineFormData({
                                  ...lineFormData,
                                  all_locations: false,
                                  location_ids: [...lineFormData.location_ids, loc.id],
                                });
                                setShowEditLocationDropdown(false);
                                setEditLocationSearch("");
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
                              data-testid={`edit-select-location-${loc.id}`}
                            >
                              {loc.name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Department <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <div
                    className="border rounded-md p-2 min-h-[42px] flex flex-wrap gap-1.5 items-center cursor-pointer hover:border-primary/50"
                    onClick={() => !lineFormData.all_departments && setShowEditDepartmentDropdown(!showEditDepartmentDropdown)}
                    data-testid="container-edit-departments"
                  >
                    {/* {lineFormData.all_departments ? (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        All
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLineFormData({ ...lineFormData, all_departments: false });
                          }}
                          className="ml-1 hover:bg-muted rounded-full p-0.5"
                          data-testid="edit-remove-all-departments"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : (
                      <> */}
                        {lineFormData.department_ids.map((deptId) => {
                          const dept = departments?.find(d => d.id === deptId);
                          return dept ? (
                            <Badge key={deptId} variant="secondary" className="gap-1 pr-1">
                              {dept.name}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLineFormData({
                                    ...lineFormData,
                                    department_ids: lineFormData.department_ids.filter(id => id !== deptId),
                                  });
                                }}
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                                data-testid={`edit-remove-department-${deptId}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      {/* </>
                    )} */}
                    <div className="ml-auto p-1">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  {showEditDepartmentDropdown && !lineFormData.all_departments && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Search departments..."
                          value={editDepartmentSearch}
                          onChange={(e) => setEditDepartmentSearch(e.target.value)}
                          className="h-8"
                          data-testid="input-edit-search-departments"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto p-1">
                        {/* <button
                          type="button"
                          onClick={() => {
                            setLineFormData({ ...lineFormData, all_departments: true, department_ids: [] });
                            setShowEditDepartmentDropdown(false);
                          }}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded font-medium"
                          data-testid="edit-select-all-departments"
                        >
                          All
                        </button> */}
                        {departments
                          ?.filter(dept =>
                            dept.name.toLowerCase().includes(editDepartmentSearch.toLowerCase()) &&
                            !lineFormData.department_ids.includes(dept.id)
                          )
                          .map((dept) => (
                            <button
                              key={dept.id}
                              type="button"
                              onClick={() => {
                                setLineFormData({
                                  ...lineFormData,
                                  all_departments: false,
                                  department_ids: [...lineFormData.department_ids, dept.id],
                                });
                                setShowEditDepartmentDropdown(false);
                                setEditDepartmentSearch("");
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
                              data-testid={`edit-select-department-${dept.id}`}
                            >
                              {dept.name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(!header?.period_mst_id || String(header?.period_mst_id) === "1" || String(header?.period_mst_id) === "4") && (
                <div className="space-y-1.5">
                  <Label>Amount <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={lineFormData.amount}
                    onChange={(e) => setLineFormData({ ...lineFormData, amount: e.target.value })}
                    onKeyDown={preventInvalidNumberKey}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    placeholder="0"
                    data-testid="input-edit-line-amount"
                  />
                </div>
              )}

              {String(header?.period_mst_id) === "2" && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Quarterly Amounts</Label>
                  {QUARTERLY_PERIODS.map((period) => (
                    <div key={period.key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{period.label}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={lineFormData.period_amounts[period.key] || "0"}
                        onChange={(e) => setLineFormData({
                          ...lineFormData,
                          period_amounts: { ...lineFormData.period_amounts, [period.key]: String(Math.max(0, parseFloat(e.target.value) || 0)) }
                        })}
                        onKeyDown={preventInvalidNumberKey}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        placeholder="0"
                        data-testid={`input-edit-line-amount-${period.key}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {String(header?.period_mst_id) === "3" && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Monthly Amounts</Label>
                  {MONTHLY_PERIODS.map((period) => (
                    <div key={period.key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{period.label}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={lineFormData.period_amounts[period.key] || "0"}
                        onChange={(e) => setLineFormData({
                          ...lineFormData,
                          period_amounts: { ...lineFormData.period_amounts, [period.key]: String(Math.max(0, parseFloat(e.target.value) || 0)) }
                        })}
                        onKeyDown={preventInvalidNumberKey}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        placeholder="0"
                        data-testid={`input-edit-line-amount-${period.key}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

      </FormSheet>

      {/* Delete Line Confirmation Dialog */}
      <AlertDialog open={!!lineToDelete} onOpenChange={(open) => !open && setLineToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget Line</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this budget line for "{lineToDelete?.segment_dtl_name}"?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-line-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLine}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-line-confirm"
            >
              {deleteLineMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit for Approval Confirmation Dialog */}
      <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Are you sure want to Submit Budget for Approval?
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm submission
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSubmitConfirmOpen(false)}
              data-testid="button-submit-no"
            >
              NO
            </Button>
            <Button
              onClick={() => {
                submitMutation.mutate();
                setSubmitConfirmOpen(false);
              }}
              disabled={submitMutation.isPending}
              data-testid="button-submit-yes"
            >
              {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              YES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-Submit for Approval Confirmation Dialog */}
      <Dialog open={reSubmitConfirmOpen} onOpenChange={setReSubmitConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Are you sure want to Re-Submit Budget for Approval?
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm submission
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setReSubmitConfirmOpen(false)}
              data-testid="button-submit-no"
            >
              NO
            </Button>
            <Button
              onClick={() => {
                approvalActionMutation.mutate({
                  action: "ReSubmit",
                  remarks: approvalComments
                });
                setReSubmitConfirmOpen(false);
              }}
              disabled={approvalActionMutation.isPending}
              data-testid="button-submit-yes"
            >
              {approvalActionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              YES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Budget Confirmation Dialog */}
      <Dialog open={copyConfirmOpen} onOpenChange={setCopyConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Copy Budget
            </DialogTitle>
            <DialogDescription>
              This will create a new budget as a copy of the current budget with status set to Draft. All line items, period amounts, departments, and locations will be copied.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCopyConfirmOpen(false)}
              data-testid="button-copy-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                copyMutation.mutate();
                setCopyConfirmOpen(false);
              }}
              disabled={copyMutation.isPending}
              data-testid="button-copy-confirm"
            >
              {copyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Copy Budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Confirmation Dialog */}
      <Dialog
        open={approvalDialogOpen}
        onOpenChange={(open) => {
          setApprovalDialogOpen(open);
          if (!open) {
            setApprovalAction(null);
            setApprovalComments("");
            setDelegateApproverId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Are you sure want to {approvalAction === "Approve" ? "Approve" : approvalAction === "Reject" ? "Reject" : approvalAction === "More" ? "Request More Info for" : "Request for Delegate"} Budget?
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm your action
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {approvalAction === "Request" && (
              <div className="space-y-2">
                <Label htmlFor="budget-delegate-approver">
                  Approver <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={delegateApproverId}
                  onValueChange={setDelegateApproverId}
                >
                  <SelectTrigger data-testid="select-delegate-approver">
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
              <Label htmlFor="approval-comments" className="text-sm font-medium">
                Comments <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="approval-comments"
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                placeholder="Enter your comments..."
                rows={5}
                className="mt-1.5 resize-none"
                data-testid="input-approval-comments"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setApprovalDialogOpen(false);
                setApprovalAction(null);
                setApprovalComments("");
                setDelegateApproverId("");
              }}
              data-testid="button-approval-no"
            >
              NO
            </Button>
            <Button
              onClick={() => {
                if (!approvalAction) return;
                if (approvalAction === "Request") {
                  const selectedUser = delegateApprovers.find(
                    (u) => String(u.id) === delegateApproverId,
                  );
                  if (!selectedUser) return;
                  delegateActionMutation.mutate({
                    userName: selectedUser.user_name,
                    comments: approvalComments,
                  });
                } else {
                  approvalActionMutation.mutate({
                    action: approvalAction,
                    remarks: approvalComments
                  });
                }
                setApprovalDialogOpen(false);
                setDelegateApproverId("");
              }}
              disabled={
                !approvalComments.trim() ||
                (approvalAction === "Request" && !delegateApproverId) ||
                approvalActionMutation.isPending ||
                delegateActionMutation.isPending
              }
              className={
                approvalAction === "Approve" ? "bg-emerald-600 hover:bg-emerald-700" :
                  approvalAction === "Reject" ? "bg-destructive hover:bg-destructive/90" :
                    approvalAction === "More" ? "bg-orange-500 hover:bg-orange-600" :
                      "bg-blue-600 hover:bg-blue-700"
              }
              data-testid="button-approval-yes"
            >
              {(approvalActionMutation.isPending || delegateActionMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              YES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApprovalChecklistDialog
        open={checklistDialogOpen}
        onOpenChange={setChecklistDialogOpen}
        moduleName="Budget"
        title="Budget Approval Checklist"
        refNumber={header.budget_id || String(header.id)}
        approving={approvalActionMutation.isPending}
        onApprove={(comments) => {
          setChecklistDialogOpen(false);
          approvalActionMutation.mutate({ action: "Approve", remarks: comments });
        }}
      />

      {/* Import Budget Lines from Excel — 3-step dialog */}
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
              Import Budget Lines from Excel
            </DialogTitle>
            <DialogDescription>
              {linesImportResults
                ? "Import complete. See results below."
                : linesImportPreview
                  ? "Review the rows below. Rows with errors will be skipped."
                  : "Upload an Excel file to bulk-add budget lines."}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: file selection */}
          {!linesImportPreview && !linesImportResults && (
            <div className="space-y-4">
              <div className="rounded-md border border-dashed p-4 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Required: Cost Center, Amount, Location, Department<br />
                  Optional: Description
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                  try {
                    const response = await fetch(
                      `/api/budgets/${budgetId}/lines/bulk-import/template`,
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
                    a.download = "budget_lines_import_template.xlsx";
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
                onClick={() => linesImportFileRef.current?.click()}
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
                        Row {r.rowNumber}: {r.costCenterName}
                        {r.valid && <span className="ml-2 text-muted-foreground font-normal">{r.amount.toFixed(2)}</span>}
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
                      <p className="font-medium truncate">Row {r.rowNumber}: {r.costCenterName}</p>
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
    </div>
  );
}
