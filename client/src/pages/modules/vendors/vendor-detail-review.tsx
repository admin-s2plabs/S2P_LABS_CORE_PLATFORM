import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import { ViewChecklistButton } from "@/components/view-checklist-button";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import { StatusBadge } from "@/components/status-badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDeleteFunction } from "@/hooks/use-delete-function";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import EvaluationReview from "@/pages/modules/evaluation/evaluation-review";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Textarea } from "@/components/ui/textarea";
import { useAISettings } from "@/hooks/use-ai-settings";
import { useToast } from "@/hooks/use-toast";
import { formatDate, handleDownloadDocument } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import type {
  BusinessCategory,
  DboSupplier,
  DboSupplierApprovalHistory,
  DboSupplierBank,
  DboSupplierContact,
  DboSupplierDocument,
  DboSupplierRefCompany,
  DboSupplierService,
  VendorType,
} from "@shared/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip } from "recharts";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Download,
  ExternalLink,
  Eye,
  File,
  FileImage,
  FileText,
  Globe,
  History,
  Landmark,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Receipt,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  User,
  UserCheck,
  Users,
  X,
  XCircle
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";

const vendorTypeLabels: Record<VendorType, string> = {
  individual: "Individual / Proprietorship",
  company: "Private Limited Company",
  partnership: "Partnership Firm",
  llp: "Limited Liability Partnership",
  trust: "Trust / Society",
};

const businessCategoryLabels: Record<BusinessCategory, string> = {
  it_services: "IT Services & Software",
  manufacturing: "Manufacturing",
  raw_materials: "Raw Materials",
  construction: "Construction",
  logistics: "Logistics",
  consulting: "Consulting",
  healthcare: "Healthcare",
  utilities: "Utilities",
  other: "Other",
};

const staffDocTypeLabels: Record<string, string> = {
  tradelicense: "Trade License",
  commercemembership: "Chamber of Commerce Membership",
  vatcertificate: "VAT Certificate",
  companyprofile: "Company Profile",
  memorandum: "Memorandum of Association",
  listofemployees: "List of Employees",
  attroney: "Power of Attorney",
  employeeliability: "Employee Liability Certificate",
  insurancecert: "Insurance Certificate",
  bankguarantee: "Bank Guarantee Letter",
  isoqualification: "ISO Qualification Certificate",
  BANK_DOCUMENT: "Bank Document",
};

function getStaffDocTypeLabel(value: string) {
  return staffDocTypeLabels[value] || value;
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

function InfoItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  const testId = `info-${label.toLowerCase().replace(/[\s\/]+/g, "-")}`;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-medium ${mono ? "font-mono" : ""}`}
        data-testid={testId}
      >
        {value || "Not provided"}
      </p>
    </div>
  );
}

export default function VendorDetailReview() {
  const [, params] = useRoute("/app/vendors/:id");
  const vendorId = params?.id;
  const [rejectionReason, setRejectionReason] = useState("");
  const [perfPage, setPerfPage] = useState(1);
  const [perfLimit, setPerfLimit] = useState(10);
  const [selectedPoNumber, setSelectedPoNumber] = useState<string | null>(null);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const [showEvaluationDetails, setShowEvaluationDetails] = useState<boolean>(false);
  const [staffPreviewDoc, setStaffPreviewDoc] = useState<any>(null);
  const [expandedStaffBankId, setExpandedStaffBankId] = useState<number | null>(
    null,
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  const formatCountry = (code?: string | null) => {
    if (!code) return null;
    const country = countries?.find((c: any) => c.value === code);
    return country ? `${country.label} (${code})` : code;
  };

  const { isAIEnabled, isLoading: aiSettingsLoading } = useAISettings();
  const showAiVendorDocAnalysis = !aiSettingsLoading && isAIEnabled("AI_VENDOR_DOC_ANALYSIS");
  const showAiVendorCompliance = !aiSettingsLoading && isAIEnabled("AI_VENDOR_COMPLIANCE");
  const showAiVendorAutofill = !aiSettingsLoading && isAIEnabled("AI_VENDOR_AUTOFILL");
  const { canDelete } = useDeleteFunction();
  const [, navigate] = useLocation();
  const authStr = localStorage.getItem("prokraya-auth");
  const authParsed = authStr ? JSON.parse(authStr) : null;
  const isVendorUser = authParsed?.role === "vendor";
  const currentUserId = authParsed?.userId;

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
    enabled: !!currentUserId && !isVendorUser,
  });

  const userRoleNames =
    currentUserProfile?.roles?.map((r) => r.role_name) || [];

  const isSuperAdmin = userRoleNames.some(
    (r) => r === "ROLE_SUPERADMIN" || r === "ROLE_SYSADMIN",
  );

  const [editingSupplierEmail, setEditingSupplierEmail] = useState(false);
  const [editingSupplierEmailValue, setEditingSupplierEmailValue] = useState("");

  const { data: vendor, isLoading } = useQuery<DboSupplier>({
    queryKey: ["/api/dbo/suppliers", vendorId],
    enabled: !!vendorId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const [storedTaskId, setStoredTaskId] = useState<string | null | undefined>(null);
  useEffect(() => {
    const taskIdFromStorage = vendor?.attribute12;
    setStoredTaskId(taskIdFromStorage);
  }, [vendor]);

  const { data: taskDetails } = useQuery<{
    assignee_: string | null;
    id_: string;
  }>({
    queryKey: ["/api/workflow-engine/task", storedTaskId],
    queryFn: async () => {
      if (!storedTaskId) return null;
      const res = await apiRequest("GET", 
        `/api/workflow-engine/task/${encodeURIComponent(storedTaskId)}`,
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!storedTaskId,
  });

  const canApprove = (() => {
    if (!storedTaskId || !taskDetails) return false;

    const currentOwner = taskDetails.assignee_;
    if (!currentOwner) return false;

    // Super-admin can approve any task (backend shows all tasks to them)
    if (userRoleNames.some((r) => r === "ROLE_SUPERADMIN" || r === "ROLE_SYSADMIN")) return true;

    if (ROLE_NAMES.some((role) => currentOwner.toUpperCase() === role)) {
      return userRoleNames.includes(currentOwner);
    }

    const currentUserIdentifiers = [
      currentUserProfile?.user_name?.toLowerCase(),
      currentUserProfile?.email_id?.toLowerCase(),
    ].filter(Boolean);

    return currentUserIdentifiers.includes(currentOwner.toLowerCase());
  })();



  // DBO related data queries
  const { data: dboContacts = [] } = useQuery<DboSupplierContact[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "contacts"],
    enabled: !!vendorId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: dboBanks = [] } = useQuery<DboSupplierBank[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "banks"],
    enabled: !!vendorId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: dboDocuments = [] } = useQuery<DboSupplierDocument[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "documents"],
    enabled: !!vendorId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: dboServices = [] } = useQuery<DboSupplierService[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "services"],
    enabled: !!vendorId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: dboRefCompanies = [] } = useQuery<DboSupplierRefCompany[]>({
    queryKey: ["/api/dbo/suppliers", vendorId, "ref-companies"],
    enabled: !!vendorId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: ratingStats } = useQuery<any>({
    queryKey: [`/api/form/supplierratestats/${vendorId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/form/supplierratestats/${vendorId}`);
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    },
    enabled: !!vendorId,
  });

  const { data: surveyResponsesAll = [] } = useQuery<any, any, any[]>({
    queryKey: [`/api/form/surveyformresponse/${vendorId}/all`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/form/surveyformresponse/${vendorId}?limit=0`);
      return res.json();
    },
    select: (data: any) => data.data || [],
    enabled: !!vendorId,
  });

  const { data: surveyResponsesPageResponse } = useQuery<any>({
    queryKey: [`/api/form/surveyformresponse/${vendorId}/page`, perfPage, perfLimit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/form/surveyformresponse/${vendorId}?page=${perfPage}&limit=${perfLimit}`);
      return res.json();
    },
    enabled: !!vendorId,
  });

  const surveyResponsesPage = surveyResponsesPageResponse?.data || [];
  const surveyPagination = surveyResponsesPageResponse?.pagination;

  const { data: dboApprovalHistory = [] } = useQuery<
    DboSupplierApprovalHistory[]
  >({
    queryKey: ["/api/dbo/suppliers", vendorId, "approval-history"],
    enabled: !!vendorId && vendor?.status !== "Draft",
  });

  const { data: workflowHistory = [] } = useQuery<
    Array<{
      instanceId: number;
      subject: string;
      type: string;
      instanceStatus: string;
      startDate: string;
      startedBy: string;
      steps: Array<{
        stepOrder: number;
        assignee: string;
        status: string;
        result: string | null;
        actionBy: string | null;
        actionDate: string | null;
        remarks: string | null;
        taskId: string;
      }>;
    }>
  >({
    queryKey: ["/api/dbo/suppliers", vendorId, "workflow-approval-history"],
    enabled: !!vendorId && vendor?.status !== "Draft",
  });

  const { data: vendorChanges = [] } = useQuery<
    Array<{
      section: string;
      field: string;
      label: string;
      oldValue: string | null;
      newValue: string | null;
      recordId?: number;
    }>
  >({
    queryKey: ["/api/dbo/suppliers", vendorId, "changes"],
    enabled:
      !!vendorId &&
      (vendor?.status === "More Info Required" ||
        vendor?.status === "Pending Approval" ||
        vendor?.status === "pending" ||
        vendor?.status === "Pending" ||
        vendor?.status === "Changes In Draft"),
    staleTime: 0,
    refetchOnMount: true,
  });

  const filteredChanges = vendorChanges.filter(change => {
    const oldVal = change.oldValue?.trim();
    const newVal = change.newValue?.trim();

    return oldVal !== null && oldVal !== undefined && oldVal !== "" &&
      oldVal !== newVal;
  });

  const isAlreadyApproved =
    dboApprovalHistory.some(
      (h) =>
        h.status?.toLowerCase() === "approve" ||
        h.status?.toLowerCase() === "approved",
    );

  const isStatus =
    vendor?.status === "Changes In Draft" ||
    vendor?.status === "Pending Approval" ||
    vendor?.status === "More Info Required";

  interface DocumentValidation {
    documentType: string;
    displayName: string;
    fileName: string | null;
    validationSource: string;
    sourceDescription: string;
    confidenceScore: number;
    status:
    | "verified"
    | "pending"
    | "failed"
    | "not_applicable"
    | "not_uploaded";
    extractedData: Record<string, string>;
    verifiedAt?: string | null;
    mandatory: boolean;
    verifyFields?: string[];
    expiryDate?: string | null;
  }

  interface ComplianceCheck {
    checkType: string;
    source: string;
    status: "clear" | "flagged" | "pending";
    details: string;
    checkedAt: string;
  }

  interface AIAnalysis {
    overallScore: number;
    riskLevel: "low" | "medium" | "high";
    recommendation: "approve" | "review" | "reject";
    confidence: number;
    summary: string;
    reasoning: string[];
    analyzedAt?: string;
    companyProfile: {
      description: string;
      established?: string;
      topCustomers?: string[];
      industryFocus?: string;
      employeeCount?: string;
      location?: string;
    };
    documentValidations: DocumentValidation[];
    complianceChecks: ComplianceCheck[];
    riskFactors: Array<{
      category: string;
      score: number;
      weight: number;
      findings: string[];
      status: string;
    }>;
    anomalies: Array<{
      severity: string;
      type: string;
      description: string;
      recommendation: string;
    }>;
    financialHealth?: {
      creditRating: {
        score: string;
        source: string;
        description: string;
        status: string;
      };
      paymentHistory: {
        onTimePayments: number;
        averagePaymentDays: number;
        source: string;
        status: string;
      };
      financialStability: {
        score: number;
        indicators: string[];
        source: string;
        status: string;
      };
      dunBradstreetRating: {
        rating: string;
        riskIndicator: string;
        source: string;
        lastUpdated: string;
      };
    };
    beneficialOwnership?: {
      ownershipStructure: Array<{
        name: string;
        designation: string;
        ownership: number;
        nationality: string;
        verified: boolean;
      }>;
      uboVerification: { status: string; source: string; description: string };
      shellCompanyIndicators: {
        status: string;
        checks: Array<{ indicator: string; status: string; details: string }>;
      };
      politicalExposure: { status: string; source: string; details: string };
    };
    litigationHistory?: {
      status: string;
      activeCases: number;
      historicalCases: number;
      checks: Array<{
        courtType: string;
        source: string;
        casesFound: number;
        status: string;
        lastChecked: string;
      }>;
      summary: string;
    };
    esgScore?: {
      overallScore: number;
      rating: string;
      breakdown: {
        environmental: {
          score: number;
          factors: Array<{ factor: string; status: string; details: string }>;
        };
        social: {
          score: number;
          factors: Array<{ factor: string; status: string; details: string }>;
        };
        governance: {
          score: number;
          factors: Array<{ factor: string; status: string; details: string }>;
        };
      };
      source: string;
    };
    geographicRisk?: {
      overallRisk: string;
      countryRisk: { country: string; riskLevel: string; factors: string[] };
      sanctionsCheck: {
        status: string;
        databases: Array<{ name: string; status: string; lastChecked: string }>;
      };
      operationalRisk: {
        state: string;
        city: string;
        factors: Array<{ factor: string; rating: string }>;
      };
    };
    profileValidation?: {
      checks: Array<{
        category: string;
        checkName: string;
        status: "pass" | "warning" | "fail" | "pending";
        field1?: string;
        field2?: string;
        details: string;
        recommendation?: string;
      }>;
      sectionScores: {
        companyInfo: {
          label: string;
          filledFields: number;
          totalFields: number;
          score: number;
          fields: Array<{ name: string; filled: boolean }>;
        };
        businessDetails: {
          label: string;
          filledFields: number;
          totalFields: number;
          score: number;
          fields: Array<{ name: string; filled: boolean }>;
        };
        scopeOfSupply: {
          label: string;
          filledFields: number;
          totalFields: number;
          score: number;
          fields: Array<{ name: string; filled: boolean }>;
        };
        contacts: {
          label: string;
          filledFields: number;
          totalFields: number;
          score: number;
          fields: Array<{ name: string; filled: boolean }>;
        };
        banking: {
          label: string;
          filledFields: number;
          totalFields: number;
          score: number;
          fields: Array<{ name: string; filled: boolean }>;
        };
      };
      overallProfileScore: number;
      summary: {
        totalChecks: number;
        passed: number;
        warnings: number;
        failed: number;
        pending: number;
      };
    };
    companyIntelligence?: {
      available: boolean;
      websiteUrl: string | null;
      description: string | null;
      keyFacts: string[];
      industries: string[];
      productsServices: string[];
      analyzedAt: string | null;
      error: string | null;
      extractedCompanyName?: string | null;
      vendorNameMismatch?: boolean;
    };
    performanceRank?: {
      rank: number;
      score: number;
      totalScore?: number;
      metrics?: {
        bwr?: number;
        otdr?: number;
        ic?: number;
        fr?: number;
        pc?: number;
      };
      trend: string;
      ai_analysis?: {
        summary: string;
        reasoning: string[];
      };
    };
    estimatedProcessingTime: string;
  }

  // Don't fetch AI analysis for draft vendors - application not yet submitted
  const isDraftVendor =
    vendor?.status === "draft" || vendor?.status === "Draft";

  const {
    data: aiAnalysis,
    isLoading: isAnalyzing,
    isFetching: isRefetching,
  } = useQuery<AIAnalysis>({
    queryKey: ["/api/vendors", vendorId, "ai-analysis"],
    enabled:
      !!vendorId &&
      !!vendor &&
      !isDraftVendor &&
      !isVendorUser &&
      !aiSettingsLoading &&
      isAIEnabled("AI_VENDOR_INTELLIGENCE"),
  });

  // Mutation for re-analyzing with refresh parameter
  const reanalyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", 
        `/api/vendors/${vendorId}/ai-analysis?refresh=true`,
      );
      if (!response.ok) throw new Error("Failed to re-analyze");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendors", vendorId, "ai-analysis"],
      });
    },
  });

  // Same endpoint as reanalyzeMutation, but a separate mutation so the toolbar
  // "Rank analysis" button has its own loading state and doesn't spin in lockstep
  // with the AI Analysis tab's "Re-analyze" button.
  const rankAnalyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/vendors/${vendorId}/ai-analysis?refresh=true`,
      );
      if (!response.ok) throw new Error("Failed to re-analyze");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendors", vendorId, "ai-analysis"],
      });
    },
  });

  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<
    "Approve" | "Reject" | "More" | "Request" | null
  >(null);
  const [approvalComments, setApprovalComments] = useState("");
  const [delegateApproverId, setDelegateApproverId] = useState("");

  const { data: delegateApprovers = [] } = useQuery<
    { id: number; name: string; user_name: string }[]
  >({
    queryKey: ["/api/users/dropdown"],
    enabled: approvalDialogOpen && approvalAction === "Request",
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/dbo/suppliers/${vendorId}`);
    },
    onSuccess: () => {
      toast({ title: "Supplier deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers"] });
      navigate("/app/vendors");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete supplier",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      return apiRequest(
        "DELETE",
        `/api/dbo/suppliers/${vendorId}/contacts/${contactId}`,
      );
    },
    onSuccess: () => {
      toast({ title: "Contact deleted successfully" });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId, "contacts"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete contact",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteBankMutation = useMutation({
    mutationFn: async (bankId: number) => {
      return apiRequest(
        "DELETE",
        `/api/dbo/suppliers/${vendorId}/banks/${bankId}`,
      );
    },
    onSuccess: () => {
      toast({ title: "Bank account deleted successfully" });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId, "banks"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete bank account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (docId: number) => {
      return apiRequest(
        "DELETE",
        `/api/dbo/suppliers/${vendorId}/documents/${docId}`,
      );
    },
    onSuccess: () => {
      toast({ title: "Document deleted successfully" });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId, "documents"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  const [activeTab, setActiveTab] = useState("vendor-profile");
  const [showRankAnalysis, setShowRankAnalysis] = useState(false);

  const approvalActionMutation = useMutation({
    mutationFn: async ({
      action,
      remarks,
    }: {
      action: "Approve" | "Reject" | "More" | "Request";
      remarks?: string;
    }) => {
      const taskId = vendor?.attribute12 !== undefined && vendor?.attribute12 !== null
        ? vendor?.attribute12
        : sessionStorage.getItem("currentTaskId");
      if (!taskId) {
        throw new Error(
          "No active task found. Please navigate from My Tasks page.",
        );
      }
      return apiRequest(
        "POST",
        `/api/dbo/suppliers/${vendorId}/process-approval`,
        {
          taskId,
          result: action,
          comments: remarks || "",
        },
      );
    },
    onSuccess: (_, variables) => {
      const actionLabel =
        variables.action === "Approve"
          ? "approved"
          : variables.action === "Reject"
            ? "rejected"
            : "returned for more information";
      toast({
        title: "Action completed",
        description: `Supplier registration has been ${actionLabel}`,
      });
      sessionStorage.removeItem("currentTaskId");
      setStoredTaskId(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId, "approval-history"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId, "workflow-approval-history"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/pending-approvals"],
      });
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
    mutationFn: async ({
      userName,
      comments,
    }: {
      userName: string;
      comments: string;
    }) => {
      const taskId = vendor?.attribute12 !== undefined && vendor?.attribute12 !== null
        ? vendor?.attribute12
        : sessionStorage.getItem("currentTaskId");
      if (!taskId) {
        throw new Error(
          "No active task found. Please navigate from My Tasks page.",
        );
      }
      return apiRequest("POST", "/api/workflow/delegate-request", {
        taskId,
        userName,
        comments,
        entityId: vendorId,
        module: "SUPPLIER",
      });
    },
    onSuccess: () => {
      toast({
        title: "Action completed",
        description: "Supplier registration approval has been delegated",
      });
      sessionStorage.removeItem("currentTaskId");
      setStoredTaskId(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId, "approval-history"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId, "workflow-approval-history"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/pending-approvals"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delegate request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const checkSupplierConditions = () => {
    if (!vendor?.address1 ||
      !vendor?.city ||
      !vendor?.country ||
      !vendor?.state ||
      !vendor?.postalcode ||
      !vendor?.phone ||
      !vendor?.legalEntityType ||
      !vendor?.panNo ||
      !vendor?.startDate ||
      !vendor?.licenseNo ||
      !vendor?.expiryDate ||
      !vendor?.placeOfIssue ||
      !vendor?.workingdayStart ||
      !vendor?.workingdayEnd ||
      !vendor?.annualTurnOver ||
      !vendor?.turnOverCurrency ||
      !vendor?.workingTimeStartTime ||
      !vendor?.workingTimeEndTime ||
      !vendor?.taxRegNo ||
      !vendor?.taxPayerId ||
      !vendor?.paymentTerms ||
      !vendor?.taxEffectiveDate) {
      toast({
        title: "Validation Failure",
        description: "Fill all mandatory fields in Company Details",
        variant: "destructive",
      });
      return;
    }

    const hasValidContact = dboContacts?.some(
      (c: DboSupplierContact) =>
        c.isPrimary === "Yes" || c.isAuthSignatory === "Yes"
    );

    if (dboContacts?.length === 0 || !hasValidContact) {
      toast({
        title: "Validation Failure",
        description: "Add at least one Contact marked as Primary",
        variant: "destructive",
      });
      return;
    }

    if (!dboServices || dboServices.length === 0) {
      toast({
        title: "Validation Failure",
        description: "Add at least one Category in Scope of Supply",
        variant: "destructive",
      });
      return;
    }

    const hasPrimaryBank = dboBanks?.some(
      (acc: DboSupplierBank) => acc.primaryAccount === "Y"
    );

    if (dboBanks.length === 0 || !hasPrimaryBank) {
      toast({
        title: "Validation Failure",
        description: "Add at least one Bank with a Primary account",
        variant: "destructive",
      });
      return;
    }

    if (!dboDocuments || dboDocuments.length < 2) {
      toast({
        title: "Validation Failure",
        description: "Upload at least 2 mandatory documents",
        variant: "destructive",
      });
      return;
    }

    submitChangesMutation.mutate();
  };

  const submitChangesMutation = useMutation({
    mutationFn: async () => {
      const status = vendor?.status;
      const isResubmit = status === "More Info Required" || status === "More Information Required";
      if (isResubmit) {
        const taskId = vendor?.attribute12 !== undefined && vendor?.attribute12 !== null
          ? vendor?.attribute12
          : sessionStorage.getItem("currentTaskId");
        if (!taskId) {
          throw new Error("No active task ID found for re-submission.");
        }
        return apiRequest("POST", `/api/dbo/suppliers/${vendorId}/process-approval`, {
          taskId,
          result: "ReSubmit",
          comments: "Resubmitted by vendor",
        });
      }
      return apiRequest("POST", "/api/vendor/submit-changes");
    },
    onSuccess: () => {
      toast({
        title: "Submitted",
        description: "Your changes have been submitted for approval.",
      });
      const storedAuth = localStorage.getItem("prokraya-auth");
      if (storedAuth) {
        const parsed = JSON.parse(storedAuth);
        parsed.vendorStatus = "Pending Approval";
        localStorage.setItem("prokraya-auth", JSON.stringify(parsed));
      }
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId, "changes"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed",
        description: error.message || "Failed to submit changes",
        variant: "destructive",
      });
    },
  });

  const updateSupplierEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest(
        "PATCH",
        `/api/dbo/suppliers/${vendorId}/email`,
        { email },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email Updated" });
      setEditingSupplierEmail(false);
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/suppliers", vendorId],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update email",
        variant: "destructive",
      });
    },
  });

  const handleSupplierEmailSave = () => {
    const trimmed = editingSupplierEmailValue.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    updateSupplierEmailMutation.mutate(trimmed);
  };

  const historyToolTip = (current: any, previous: any) => {
    const isChanged = hasChanged(current, previous);
    if (isChanged && previous && (vendor?.status === "More Info Required" || vendor?.status === "Pending Approval" || vendor?.status === "Changes In Draft")) return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <History className="w-4 h-4 cursor-pointer text-orange-500" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {previous || "-"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    return "";
  }

  const hasChanged = (current: any, previous: any) => {
    if (previous === null || previous === undefined) return false;
    const normalize = (value: any) => {
      if (value === null || value === undefined) return "";
      return String(value).trim();
    };

    return normalize(current) !== normalize(previous);
  };
  let hasAddressChanged = false;
  let previousAddress = null;
  if (vendor) {
    hasAddressChanged =
      (hasChanged(vendor.address1, vendor.prevAddress1) ||
        hasChanged(vendor.address2, vendor.prevAddress2) ||
        hasChanged(vendor.city, vendor.prevCity) ||
        hasChanged(vendor.state, vendor.prevState) ||
        hasChanged(formatCountry(vendor.country), formatCountry(vendor.prevCountry)) ||
        hasChanged(vendor.postalcode, vendor.prevPostalCode)) && (vendor.status === "More Info Required" || vendor.status === "Pending Approval" || vendor.status === "Changes In Draft");

    previousAddress = [
      vendor.prevAddress1,
      vendor.prevAddress2,
      vendor.prevCity,
      vendor.prevState,
      formatCountry(vendor.prevCountry),
      vendor.prevPostalCode,
    ]
      .filter(Boolean)
      .join(", ") || "-";
  }
  const helperToolTip = (content: string) => {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <History className="w-4 h-4 cursor-pointer text-orange-500" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {content || "-"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const hasWorkingChanged = (current1: string | null | undefined, previous1: string | null | undefined, current2: string | null | undefined, previous2: string | null | undefined) => {
    if (hasChanged(current1, previous1) &&
      hasChanged(current2, previous2)) return helperToolTip(previous1 + " - " + previous2);
    if (hasChanged(current1, previous1)) return helperToolTip(previous1 + " - " + current2);
    if (hasChanged(current2, previous2)) return helperToolTip(current1 + " - " + previous2);
    return "";
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h2 className="text-lg font-medium mb-2">Vendor not found</h2>
          <Link href={isVendorUser ? "/app/dashboard" : "/vendor/register/review"}>
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {isVendorUser ? "Back to Dashboard" : "Back to Suppliers"}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const canVendorEdit =
    isVendorUser &&
    vendor &&
    (vendor.status === "Approved" ||
      vendor.status === "Active" ||
      vendor.status === "InActive" ||
      vendor.status === "Changes In Draft" ||
      vendor.status === "More Info Required" ||
      vendor.status === "More Information Required");

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={isVendorUser ? (vendor.status === "Pending Approval" ? "/vendor/register/review" : "/app/dashboard") : "/app/vendors"}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-center gap-2">
            <h1
              className="text-xl font-semibold"
              data-testid="text-vendor-name"
            >
              {vendor.companyName || "Unknown Supplier"}
            </h1>
            <StatusBadge status={vendor.status as any} />
          </div>
        </div>
        {isVendorUser &&
          vendor.status === "Active" &&
          showAiVendorAutofill && (
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
        {isVendorUser && (vendor.status === "Changes In Draft" || vendor.status === "More Info Required" || vendor.status === "More Information Required") && (
          <Button
            size="sm"
            onClick={() => checkSupplierConditions()}
            disabled={submitChangesMutation.isPending}
            variant="default"
            data-testid="button-submit-for-approval"
          >
            {submitChangesMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {vendor.status === "More Info Required" || vendor.status === "More Information Required" ? "Resubmitting..." : "Submitting..."}
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                {vendor.status === "More Info Required" || vendor.status === "More Information Required" ? "Resubmit for Approval" : "Submit for Approval"}
              </>
            )}
          </Button>
        )}
        {(vendor.status === "pending" ||
          vendor.status === "under_review" ||
          vendor.status === "Pending" ||
          vendor.status === "Under Review" ||
          vendor.status === "Pending Approval") &&
          (canApprove || (currentUserProfile?.roles || []).some((r: { role_name: string }) => r.role_name === "ROLE_SUPERADMIN")) && (
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
                    resolveApprovalChecklistAvailability("Vendor Registration").then((available) => {
                      if (available) {
                        setChecklistDialogOpen(true);
                      } else {
                        setApprovalAction("Approve");
                        setApprovalComments("");
                        setApprovalDialogOpen(true);
                      }
                    });
                  }}
                  disabled={approvalActionMutation.isPending}
                  data-testid="button-approve"
                  className="text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setApprovalAction("More");
                    setApprovalComments("");
                    setApprovalDialogOpen(true);
                  }}
                  disabled={approvalActionMutation.isPending}
                  data-testid="button-more-info"
                  className="text-orange-600 dark:text-orange-400"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  More Info Requested
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setApprovalAction("Reject");
                    setApprovalComments("");
                    setApprovalDialogOpen(true);
                  }}
                  disabled={approvalActionMutation.isPending}
                  data-testid="button-reject"
                  className="text-destructive"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setApprovalAction("Request");
                    setApprovalComments("");
                    setApprovalDialogOpen(true);
                  }}
                  disabled={approvalActionMutation.isPending}
                  data-testid="button-more-info"
                  className="text-blue-600 dark:text-orange-400"
                >
                  <User className="h-4 w-4 mr-2" />
                  Requst For Delegate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        {(vendor?.status === "Active" || vendor?.status === "Approved") && (
          <ViewChecklistButton moduleName="Vendor Registration" refNumber={vendorId} />
        )}
        {/* {!isVendorUser && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                data-testid="button-delete-supplier"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Supplier
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
                <AlertDialogDescription>
                  Permanently delete {vendor.companyName || "this supplier"} and all
                  related contacts, banks, and documents? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteSupplierMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-delete-supplier-confirm"
                >
                  {deleteSupplierMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}*/}

        {!isVendorUser &&
          isAIEnabled("AI_SUPPLIER_RANK") &&
          (vendor?.status === "Active" || vendor?.status === "Approved") &&
          activeTab === "vendor-profile" && (
            <Button
              size="sm"
              variant="outline"
              className="bg-white hover:bg-primary/5 text-primary border-primary/20 gap-1.5 h-8 px-3"
              onClick={() => {
                setShowRankAnalysis(true);
                rankAnalyzeMutation.mutate();
              }}
              disabled={rankAnalyzeMutation.isPending || isRefetching}
            >
              {rankAnalyzeMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Rank analysis
            </Button>
          )}
      </div>

      {filteredChanges.length > 0 && isStatus && (
        <Card
          className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"
          data-testid="card-changes-review"
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <CardTitle className="text-base text-amber-800 dark:text-amber-300">
                  {vendor?.status === "Changes In Draft"
                    ? "Draft Changes"
                    : "Changes Pending Review"}
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-amber-400 text-amber-700 dark:text-amber-300"
                >
                  {filteredChanges.length} change
                  {filteredChanges.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </div>
            <CardDescription className="text-amber-700/80 dark:text-amber-400/80">
              {isVendorUser
                ? vendor?.status === "Changes In Draft"
                  ? "Review your changes below. You can continue editing or submit for approval when ready."
                  : "Your profile changes are pending review by the procurement team."
                : "The supplier has modified their profile. Review the changes below before approving or rejecting."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {(() => {
              const grouped: Record<string, typeof vendorChanges> = {};
              for (const c of filteredChanges) {
                if (!grouped[c.section]) grouped[c.section] = [];
                grouped[c.section].push(c);
              }
              return Object.entries(grouped).map(([section, items]) => (
                <div key={section} className="mb-4 last:mb-0">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                    {section}
                  </h4>
                  <div className="space-y-2">
                    {items.map((change, idx) => (
                      <div
                        key={`${change.field}-${change.recordId || idx}`}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm rounded-md bg-white/60 dark:bg-white/5 px-3 py-2"
                        data-testid={`change-item-${change.field}`}
                      >
                        <span className="font-medium text-muted-foreground min-w-[140px]">
                          {change.label}
                        </span>
                        <span className="line-through text-destructive/70">
                          {change.oldValue || "(empty)"}
                        </span>
                        <span className="text-muted-foreground">{"-->"}</span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {change.newValue || "(empty)"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="vendor-profile" className="space-y-4">
        {!isVendorUser && isAIEnabled("AI_VENDOR_INTELLIGENCE") ? (
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger
              value="vendor-profile"
              data-testid="tab-vendor-profile"
            >
              <Building2 className="h-4 w-4 mr-2" />
              Vendor Profile
            </TabsTrigger>
            <TabsTrigger value="ai-analysis" data-testid="tab-ai-analysis">
              <Bot className="h-4 w-4 mr-2" />
              AI Analysis
            </TabsTrigger>
          </TabsList>
        ) :
          !isVendorUser ? (
            <TabsList className="max-w-md">
              <TabsTrigger
                value="vendor-profile"
                data-testid="tab-vendor-profile"
              >
                <Building2 className="h-4 w-4 mr-2" />
                Vendor Profile
              </TabsTrigger>
            </TabsList>
          ) : null}

        {!isVendorUser && isAIEnabled("AI_VENDOR_INTELLIGENCE") && (
          <TabsContent value="ai-analysis">
            {/* Check if vendor is in draft status - no analysis available yet */}
            {vendor &&
              (vendor.status === "draft" || vendor.status === "Draft") ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">
                    Application Not Yet Submitted
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    AI analysis will be available once the supplier completes and
                    submits their application. The analysis is automatically
                    triggered upon submission.
                  </p>
                </CardContent>
              </Card>
            ) : isAnalyzing ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  Analyzing supplier profile...
                </span>
              </div>
            ) : aiAnalysis ? (
              <div className="space-y-4">
                {/* Re-analyze Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Bot className="h-4 w-4" />
                    <span>AI analysis completed</span>
                    {aiAnalysis.analyzedAt && (
                      <span className="text-xs">
                        • Last updated:{" "}
                        {formatDate(aiAnalysis.analyzedAt)}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reanalyzeMutation.mutate()}
                    disabled={reanalyzeMutation.isPending || isRefetching}
                    data-testid="button-reanalyze"
                  >
                    {reanalyzeMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Re-analyzing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Re-analyze
                      </>
                    )}
                  </Button>
                </div>

                {/* Top Row: Company Info + Recommendation & Decision */}
                <div className="grid gap-4 lg:grid-cols-3">
                  {/* Company Profile - Left */}
                  <div className="lg:col-span-2">
                    <Card className="h-full" data-testid="card-company-profile">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Globe className="h-4 w-4 text-primary" />
                          Company Overview
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          AI-extracted insights from supplier website
                        </p>
                      </CardHeader>
                      <CardContent>
                        {aiAnalysis.companyIntelligence?.available ? (
                          <div className="space-y-3">
                            {/* Website URL */}
                            {aiAnalysis.companyIntelligence.websiteUrl && (
                              <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                <Globe className="h-4 w-4 text-blue-600 shrink-0" />
                                <a
                                  href={
                                    aiAnalysis.companyIntelligence.websiteUrl
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-blue-600 hover:underline truncate"
                                  data-testid="link-vendor-website"
                                >
                                  {aiAnalysis.companyIntelligence.websiteUrl}
                                </a>
                                <ExternalLink className="h-3 w-3 text-blue-600 shrink-0" />
                              </div>
                            )}

                            {/* AI Description */}
                            {aiAnalysis.companyIntelligence.description && (
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {aiAnalysis.companyIntelligence.description}
                              </p>
                            )}

                            {/* Key Facts & Industries */}
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                              {aiAnalysis.companyIntelligence.industries
                                ?.length > 0 && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">
                                      Industries
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {aiAnalysis.companyIntelligence.industries
                                        .slice(0, 3)
                                        .map((ind: string, i: number) => (
                                          <Badge
                                            key={i}
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            {ind}
                                          </Badge>
                                        ))}
                                    </div>
                                  </div>
                                )}
                              {aiAnalysis.companyIntelligence.productsServices
                                ?.length > 0 && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">
                                      Services
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {aiAnalysis.companyIntelligence.productsServices
                                        .slice(0, 3)
                                        .map((svc: string, i: number) => (
                                          <Badge
                                            key={i}
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            {svc}
                                          </Badge>
                                        ))}
                                    </div>
                                  </div>
                                )}
                            </div>

                            {/* Key Facts summary */}
                            {aiAnalysis.companyIntelligence.keyFacts?.length >
                              0 && (
                                <div className="pt-2 border-t">
                                  <p className="text-xs text-muted-foreground mb-1">
                                    Key Facts
                                  </p>
                                  <ul className="space-y-0.5">
                                    {aiAnalysis.companyIntelligence.keyFacts
                                      .slice(0, 3)
                                      .map((fact: string, i: number) => (
                                        <li
                                          key={i}
                                          className="text-xs flex items-start gap-1.5"
                                        >
                                          <CheckCircle className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                                          <span>{fact}</span>
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              )}
                          </div>
                        ) : (
                          /* No Website - Show message */
                          <div className="text-center py-6">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                              <Globe className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium text-muted-foreground">
                              No Website Provided
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Supplier must provide a website URL for company
                              overview
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Recommendation & Decision - Right */}
                  <div className="space-y-4">
                    {/* AI Recommendation Card */}
                    <Card
                      data-testid="card-ai-recommendation"
                      className={`border-2 ${aiAnalysis.recommendation === "approve"
                        ? "border-emerald-500/50"
                        : aiAnalysis.recommendation === "review"
                          ? "border-amber-500/50"
                          : "border-destructive/50"
                        }`}
                    >
                      <CardContent className="pt-4">
                        {/* Recommendation Header */}
                        <div className="flex items-center gap-3 mb-4">
                          {aiAnalysis.recommendation === "approve" ? (
                            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                              <ThumbsUp className="h-5 w-5 text-emerald-600" />
                            </div>
                          ) : aiAnalysis.recommendation === "review" ? (
                            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                              <AlertTriangle className="h-5 w-5 text-amber-600" />
                            </div>
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                              <ThumbsDown className="h-5 w-5 text-destructive" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-sm">
                              {aiAnalysis.recommendation === "approve"
                                ? "Approve"
                                : aiAnalysis.recommendation === "review"
                                  ? "Review"
                                  : "Reject"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              AI Recommendation
                            </p>
                          </div>
                        </div>

                        {/* Overall Score & Risk */}
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div
                            className="p-2 rounded bg-muted/50"
                            data-testid="score-overall"
                          >
                            <p
                              className={`text-xl font-bold ${aiAnalysis.overallScore >= 80
                                ? "text-emerald-600"
                                : aiAnalysis.overallScore >= 60
                                  ? "text-amber-600"
                                  : "text-destructive"
                                }`}
                            >
                              {aiAnalysis.overallScore}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Overall Score
                            </p>
                          </div>
                          <div
                            className="p-2 rounded bg-muted/50"
                            data-testid="score-risk"
                          >
                            <p
                              className={`text-xl font-bold capitalize ${aiAnalysis.riskLevel === "low"
                                ? "text-emerald-600"
                                : aiAnalysis.riskLevel === "medium"
                                  ? "text-amber-600"
                                  : "text-destructive"
                                }`}
                            >
                              {aiAnalysis.riskLevel}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Risk Level
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Anomalies & Red Flags - Critical for Decision */}
                    {aiAnalysis.anomalies &&
                      aiAnalysis.anomalies.length > 0 && (
                        <Card className="border-amber-500/50">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 text-amber-500" />
                                Red Flags
                              </CardTitle>
                              <Badge variant="destructive" className="text-xs">
                                {aiAnalysis.anomalies.length}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2 max-h-[200px] overflow-y-auto">
                            {aiAnalysis.anomalies.map((anomaly, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded-lg border text-xs ${anomaly.severity === "high"
                                  ? "border-destructive/50 bg-destructive/5"
                                  : "border-amber-500/30 bg-amber-500/5"
                                  }`}
                              >
                                <div className="flex items-start gap-2">
                                  <Badge
                                    variant={
                                      anomaly.severity === "high"
                                        ? "destructive"
                                        : "secondary"
                                    }
                                    className="text-xs shrink-0"
                                  >
                                    {anomaly.severity}
                                  </Badge>
                                  <div className="min-w-0">
                                    <p className="font-medium">
                                      {anomaly.type}
                                    </p>
                                    <p className="text-muted-foreground mt-0.5 line-clamp-2">
                                      {anomaly.description}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                  </div>
                </div>

                {/* Analysis Sub-Tabs: All Analysis Sections */}
                <Tabs defaultValue="profile-validation" className="w-full">
                  <TabsList className="flex w-auto mb-4 h-auto gap-1 justify-start">
                    <TabsTrigger
                      value="profile-validation"
                      className="text-xs gap-1 px-3"
                      data-testid="tab-profile-validation"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Profile Validation
                    </TabsTrigger>
                    {showAiVendorDocAnalysis && (
                      <TabsTrigger
                        value="documents"
                        className="text-xs gap-1 px-3"
                        data-testid="tab-documents"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Documents
                      </TabsTrigger>
                    )}
                    {showAiVendorCompliance && (
                      <TabsTrigger
                        value="compliance"
                        className="text-xs gap-1 px-3"
                        data-testid="tab-compliance"
                      >
                        <Shield className="h-3.5 w-3.5" />
                        Compliance
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {/* Profile Validation Tab */}
                  <TabsContent value="profile-validation">
                    {aiAnalysis.profileValidation ? (
                      <div className="space-y-4">
                        {/* Section Completeness Scores */}
                        <Card>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                  <TrendingUp className="h-5 w-5 text-primary" />
                                  Profile Completeness
                                </CardTitle>
                                <CardDescription className="mt-1">
                                  Section-wise analysis of supplier profile data
                                </CardDescription>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                  Overall:
                                </span>
                                <Badge
                                  className={`text-sm ${aiAnalysis.profileValidation
                                    .overallProfileScore >= 80
                                    ? "bg-emerald-500"
                                    : aiAnalysis.profileValidation
                                      .overallProfileScore >= 60
                                      ? "bg-amber-500"
                                      : "bg-destructive"
                                    } text-white`}
                                >
                                  {
                                    aiAnalysis.profileValidation
                                      .overallProfileScore
                                  }
                                  %
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                              {Object.entries(
                                aiAnalysis.profileValidation.sectionScores,
                              ).map(([key, section]) => (
                                <div
                                  key={key}
                                  className="p-3 rounded-lg border bg-muted/30"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium">
                                      {section.label}
                                    </span>
                                    <span
                                      className={`text-sm font-bold ${section.score >= 80
                                        ? "text-emerald-600"
                                        : section.score >= 60
                                          ? "text-amber-600"
                                          : "text-destructive"
                                        }`}
                                    >
                                      {section.score}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-muted rounded-full h-2 mb-2">
                                    <div
                                      className={`h-2 rounded-full ${section.score >= 80
                                        ? "bg-emerald-500"
                                        : section.score >= 60
                                          ? "bg-amber-500"
                                          : "bg-destructive"
                                        }`}
                                      style={{ width: `${section.score}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {section.filledFields}/{section.totalFields}{" "}
                                    fields
                                  </p>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Cross-Field Validation Checks */}
                        <Card>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                  <UserCheck className="h-5 w-5 text-primary" />
                                  Validation Checks
                                </CardTitle>
                                <CardDescription className="mt-1">
                                  AI-powered cross-field consistency and data
                                  validation
                                </CardDescription>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <Badge className="bg-emerald-500 text-white text-xs">
                                  {aiAnalysis.profileValidation.summary.passed}{" "}
                                  Passed
                                </Badge>
                                {aiAnalysis.profileValidation.summary.warnings >
                                  0 && (
                                    <Badge className="bg-amber-500 text-white text-xs">
                                      {
                                        aiAnalysis.profileValidation.summary
                                          .warnings
                                      }{" "}
                                      Warnings
                                    </Badge>
                                  )}
                                {aiAnalysis.profileValidation.summary.failed >
                                  0 && (
                                    <Badge
                                      variant="destructive"
                                      className="text-xs"
                                    >
                                      {
                                        aiAnalysis.profileValidation.summary
                                          .failed
                                      }{" "}
                                      Failed
                                    </Badge>
                                  )}
                                {aiAnalysis.profileValidation.summary.pending >
                                  0 && (
                                    <Badge variant="outline" className="text-xs">
                                      {
                                        aiAnalysis.profileValidation.summary
                                          .pending
                                      }{" "}
                                      Pending
                                    </Badge>
                                  )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <Accordion type="multiple" className="w-full">
                              {/* Group checks by category */}
                              {Array.from(
                                new Set(
                                  aiAnalysis.profileValidation.checks.map(
                                    (c) => c.category,
                                  ),
                                ),
                              ).map((category) => (
                                <AccordionItem value={category} key={category}>
                                  <AccordionTrigger className="text-sm hover:no-underline py-3">
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium">
                                        {category}
                                      </span>
                                      <div className="flex gap-1">
                                        {aiAnalysis
                                          .profileValidation!.checks.filter(
                                            (c) => c.category === category,
                                          )
                                          .map((check, idx) => (
                                            <div
                                              key={idx}
                                              className={`h-2 w-2 rounded-full ${check.status === "pass"
                                                ? "bg-emerald-500"
                                                : check.status === "warning"
                                                  ? "bg-amber-500"
                                                  : check.status === "fail"
                                                    ? "bg-destructive"
                                                    : "bg-muted-foreground"
                                                }`}
                                            />
                                          ))}
                                      </div>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent>
                                    <div className="space-y-3 pt-2">
                                      {aiAnalysis
                                        .profileValidation!.checks.filter(
                                          (c) => c.category === category,
                                        )
                                        .map((check, idx) => (
                                          <div
                                            key={idx}
                                            className={`p-3 rounded-lg border ${check.status === "pass"
                                              ? "border-emerald-500/30 bg-emerald-500/5"
                                              : check.status === "warning"
                                                ? "border-amber-500/30 bg-amber-500/5"
                                                : check.status === "fail"
                                                  ? "border-destructive/30 bg-destructive/5"
                                                  : "border-muted bg-muted/30"
                                              }`}
                                          >
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                  {check.status === "pass" ? (
                                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                                  ) : check.status ===
                                                    "warning" ? (
                                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                                  ) : check.status ===
                                                    "fail" ? (
                                                    <XCircle className="h-4 w-4 text-destructive" />
                                                  ) : (
                                                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                                  )}
                                                  <span className="font-medium text-sm">
                                                    {check.checkName}
                                                  </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-2">
                                                  {check.details}
                                                </p>
                                                {(check.field1 ||
                                                  check.field2) && (
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                      {check.field1 && (
                                                        <Badge
                                                          variant="secondary"
                                                          className="text-xs font-normal"
                                                        >
                                                          {check.field1}
                                                        </Badge>
                                                      )}
                                                      {check.field2 && (
                                                        <Badge
                                                          variant="secondary"
                                                          className="text-xs font-normal"
                                                        >
                                                          {check.field2}
                                                        </Badge>
                                                      )}
                                                    </div>
                                                  )}
                                                {check.recommendation && (
                                                  <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-500/10 p-2 rounded">
                                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                    <span>
                                                      {check.recommendation}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                              <Badge
                                                className={`shrink-0 text-xs ${check.status === "pass"
                                                  ? "bg-emerald-500 text-white"
                                                  : check.status === "warning"
                                                    ? "bg-amber-500 text-white"
                                                    : check.status === "fail"
                                                      ? "bg-destructive text-white"
                                                      : ""
                                                  }`}
                                                variant={
                                                  check.status === "pending"
                                                    ? "outline"
                                                    : "default"
                                                }
                                              >
                                                {check.status.toUpperCase()}
                                              </Badge>
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                            </Accordion>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <Card>
                        <CardContent className="p-8 text-center">
                          <UserCheck className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                          <p className="text-muted-foreground">
                            Profile validation data not available
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Document Verification Tab */}
                  {showAiVendorDocAnalysis && (
                    <TabsContent value="documents">
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" />
                                Core Document Verification
                              </CardTitle>
                              <CardDescription className="mt-1">
                                3-layer validation: Field Matching, Database
                                Verification, Authenticity Check
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                className={`text-sm ${aiAnalysis.documentValidations?.filter(
                                  (d: any) => d.overallStatus === "verified",
                                ).length === 3
                                  ? "bg-emerald-500 text-white"
                                  : aiAnalysis.documentValidations?.filter(
                                    (d: any) =>
                                      d.overallStatus === "verified",
                                  ).length === 0
                                    ? "bg-destructive text-destructive-foreground"
                                    : "bg-amber-500 text-white"
                                  }`}
                              >
                                {aiAnalysis.documentValidations?.filter(
                                  (d: any) => d.overallStatus === "verified",
                                ).length || 0}{" "}
                                / 3 Verified
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {aiAnalysis.documentValidations?.map(
                            (doc: any, idx: number) => {
                              const DocIcon =
                                doc.documentType === "trade_license"
                                  ? Building2
                                  : doc.documentType === "vat_certificate"
                                    ? Receipt
                                    : Landmark;

                              return (
                                <div
                                  key={idx}
                                  className={`rounded-lg border ${doc.overallStatus === "not_uploaded"
                                    ? "border-dashed border-muted-foreground/30"
                                    : doc.overallStatus === "verified"
                                      ? "border-emerald-500/50"
                                      : doc.overallStatus === "failed"
                                        ? "border-destructive/50"
                                        : "border-amber-500/50"
                                    }`}
                                  data-testid={`doc-card-${doc.documentType}`}
                                >
                                  {/* Document Header */}
                                  <div
                                    className={`p-4 ${doc.overallStatus === "verified"
                                      ? "bg-emerald-500/5"
                                      : doc.overallStatus === "failed"
                                        ? "bg-destructive/5"
                                        : doc.overallStatus === "not_uploaded"
                                          ? "bg-muted/20"
                                          : "bg-amber-500/5"
                                      }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div
                                          className={`p-2.5 rounded-lg ${doc.overallStatus === "verified"
                                            ? "bg-emerald-500/20"
                                            : doc.overallStatus ===
                                              "not_uploaded"
                                              ? "bg-muted"
                                              : doc.overallStatus === "failed"
                                                ? "bg-destructive/20"
                                                : "bg-amber-500/20"
                                            }`}
                                        >
                                          <DocIcon
                                            className={`h-5 w-5 ${doc.overallStatus === "verified"
                                              ? "text-emerald-600"
                                              : doc.overallStatus ===
                                                "not_uploaded"
                                                ? "text-muted-foreground"
                                                : doc.overallStatus === "failed"
                                                  ? "text-destructive"
                                                  : "text-amber-600"
                                              }`}
                                          />
                                        </div>
                                        <div>
                                          <h4 className="font-semibold text-sm">
                                            {doc.displayName}
                                          </h4>
                                          {doc.fileName && (
                                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[250px]">
                                              {doc.fileName}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        {doc.overallStatus !== "not_uploaded" && (
                                          <div className="text-right">
                                            <p className="text-xs text-muted-foreground">
                                              Overall Score
                                            </p>
                                            <p
                                              className={`text-2xl font-bold font-mono ${doc.overallScore >= 80
                                                ? "text-emerald-600"
                                                : doc.overallScore >= 50
                                                  ? "text-amber-600"
                                                  : "text-destructive"
                                                }`}
                                            >
                                              {doc.overallScore}%
                                            </p>
                                          </div>
                                        )}
                                        {doc.overallStatus === "verified" ? (
                                          <Badge className="bg-emerald-500 text-white">
                                            <CheckCircle className="h-3 w-3 mr-1" />
                                            Verified
                                          </Badge>
                                        ) : doc.overallStatus ===
                                          "not_uploaded" ? (
                                          <Badge
                                            variant="outline"
                                            className="text-muted-foreground"
                                          >
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            Not Uploaded
                                          </Badge>
                                        ) : doc.overallStatus === "failed" ? (
                                          <Badge variant="destructive">
                                            <XCircle className="h-3 w-3 mr-1" />
                                            Issues Found
                                          </Badge>
                                        ) : (
                                          <Badge className="bg-amber-500 text-white">
                                            <Clock className="h-3 w-3 mr-1" />
                                            Review Required
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* 3 Validation Layers */}
                                  {doc.overallStatus !== "not_uploaded" && (
                                    <div className="p-4 space-y-4">
                                      {/* Layer 1: Field Extraction & Matching */}
                                      <div
                                        className="rounded-lg border p-3"
                                        data-testid={`layer1-${doc.documentType}`}
                                      >
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                          <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded bg-primary/10">
                                              <Sparkles className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                              <h5 className="text-sm font-medium">
                                                Layer 1: Field Extraction &
                                                Matching
                                              </h5>
                                              <p className="text-xs text-muted-foreground">
                                                AI extracts fields and compares
                                                with supplier profile
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span
                                              className={`font-mono font-bold ${doc.layer1?.score >= 90
                                                ? "text-emerald-600"
                                                : doc.layer1?.score >= 70
                                                  ? "text-amber-600"
                                                  : "text-destructive"
                                                }`}
                                              data-testid={`text-layer1-score-${doc.documentType}`}
                                            >
                                              {doc.layer1?.score || 0}%
                                            </span>
                                            {doc.layer1?.status === "pass" ? (
                                              <Badge
                                                className="bg-emerald-500 text-white text-xs"
                                                data-testid={`badge-layer1-pass-${doc.documentType}`}
                                              >
                                                Pass
                                              </Badge>
                                            ) : doc.layer1?.status ===
                                              "issues_found" ? (
                                              <Badge
                                                variant="destructive"
                                                className="text-xs"
                                                data-testid={`badge-layer1-issues-${doc.documentType}`}
                                              >
                                                Issues
                                              </Badge>
                                            ) : (
                                              <Badge
                                                variant="outline"
                                                className="text-xs"
                                                data-testid={`badge-layer1-na-${doc.documentType}`}
                                              >
                                                N/A
                                              </Badge>
                                            )}
                                          </div>
                                        </div>

                                        {/* Field Matching Grid */}
                                        {doc.layer1?.fields &&
                                          doc.layer1.fields.length > 0 && (
                                            <div
                                              className="rounded border overflow-hidden"
                                              data-testid={`grid-fields-${doc.documentType}`}
                                            >
                                              {/* Header Row */}
                                              <div className="grid grid-cols-[1fr_1.5fr_1.5fr_60px] gap-1 bg-muted/50 text-xs">
                                                <div className="p-2 font-medium">
                                                  Field
                                                </div>
                                                <div className="p-2 font-medium">
                                                  Document Value
                                                </div>
                                                <div className="p-2 font-medium">
                                                  Profile Value
                                                </div>
                                                <div className="p-2 font-medium text-center">
                                                  Match
                                                </div>
                                              </div>
                                              {/* Data Rows */}
                                              {doc.layer1.fields.map(
                                                (
                                                  field: any,
                                                  fieldIdx: number,
                                                ) => (
                                                  <div
                                                    key={fieldIdx}
                                                    className="grid grid-cols-[1fr_1.5fr_1.5fr_60px] gap-1 border-t text-xs"
                                                    data-testid={`row-field-${doc.documentType}-${fieldIdx}`}
                                                  >
                                                    <div className="p-2 font-medium">
                                                      {field.fieldName}
                                                    </div>
                                                    <div
                                                      className="p-2 font-mono text-muted-foreground truncate"
                                                      title={field.extractedValue}
                                                    >
                                                      {field.extractedValue ||
                                                        "-"}
                                                    </div>
                                                    <div
                                                      className="p-2 font-mono text-muted-foreground truncate"
                                                      title={field.profileValue}
                                                    >
                                                      {field.profileValue || "-"}
                                                    </div>
                                                    <div className="p-2 flex justify-center">
                                                      {field.matchStatus ===
                                                        "match" ? (
                                                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                                                      ) : field.matchStatus ===
                                                        "mismatch" ? (
                                                        <XCircle className="h-4 w-4 text-destructive" />
                                                      ) : field.matchStatus ===
                                                        "not_in_profile" ? (
                                                        <AlertCircle className="h-4 w-4 text-amber-500" />
                                                      ) : (
                                                        <span className="text-muted-foreground">
                                                          -
                                                        </span>
                                                      )}
                                                    </div>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        <p className="text-xs text-muted-foreground mt-2">
                                          {doc.layer1?.summary}
                                        </p>
                                      </div>

                                      {/* Layer 2: Database Verification */}
                                      <div
                                        className="rounded-lg border p-3"
                                        data-testid={`layer2-${doc.documentType}`}
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded bg-amber-500/10">
                                              <Database className="h-4 w-4 text-amber-600" />
                                            </div>
                                            <div>
                                              <h5 className="text-sm font-medium">
                                                Layer 2: Government Database
                                                Verification
                                              </h5>
                                              <p className="text-xs text-muted-foreground">
                                                {doc.layer2?.source}
                                              </p>
                                            </div>
                                          </div>
                                          <Badge
                                            variant="outline"
                                            className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/30"
                                            data-testid={`badge-layer2-pending-${doc.documentType}`}
                                          >
                                            <Clock className="h-3 w-3 mr-1" />
                                            Pending API
                                          </Badge>
                                        </div>
                                        <div className="mt-2 p-2 rounded bg-amber-500/5 border border-amber-500/20">
                                          <p
                                            className="text-xs text-amber-700"
                                            data-testid={`text-layer2-message-${doc.documentType}`}
                                          >
                                            {doc.layer2?.message}
                                          </p>
                                        </div>
                                      </div>

                                      {/* Layer 3: Authenticity Check */}
                                      <div
                                        className="rounded-lg border p-3"
                                        data-testid={`layer3-${doc.documentType}`}
                                      >
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                          <div className="flex items-center gap-2">
                                            <div
                                              className={`p-1.5 rounded ${doc.layer3?.status === "genuine"
                                                ? "bg-emerald-500/10"
                                                : doc.layer3?.status ===
                                                  "suspicious"
                                                  ? "bg-destructive/10"
                                                  : "bg-amber-500/10"
                                                }`}
                                            >
                                              <Shield
                                                className={`h-4 w-4 ${doc.layer3?.status === "genuine"
                                                  ? "text-emerald-600"
                                                  : doc.layer3?.status ===
                                                    "suspicious"
                                                    ? "text-destructive"
                                                    : "text-amber-600"
                                                  }`}
                                              />
                                            </div>
                                            <div>
                                              <h5 className="text-sm font-medium">
                                                Layer 3: Document Authenticity
                                              </h5>
                                              <p className="text-xs text-muted-foreground">
                                                Fraud detection & tampering
                                                analysis
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span
                                              className={`font-mono font-bold ${doc.layer3?.score >= 80
                                                ? "text-emerald-600"
                                                : doc.layer3?.score >= 50
                                                  ? "text-amber-600"
                                                  : "text-destructive"
                                                }`}
                                              data-testid={`text-layer3-score-${doc.documentType}`}
                                            >
                                              {doc.layer3?.score || 0}%
                                            </span>
                                            {doc.layer3?.status === "genuine" ? (
                                              <Badge
                                                className="bg-emerald-500 text-white text-xs"
                                                data-testid={`badge-layer3-genuine-${doc.documentType}`}
                                              >
                                                Genuine
                                              </Badge>
                                            ) : doc.layer3?.status ===
                                              "suspicious" ? (
                                              <Badge
                                                variant="destructive"
                                                className="text-xs"
                                                data-testid={`badge-layer3-suspicious-${doc.documentType}`}
                                              >
                                                Suspicious
                                              </Badge>
                                            ) : (
                                              <Badge
                                                className="bg-amber-500 text-white text-xs"
                                                data-testid={`badge-layer3-review-${doc.documentType}`}
                                              >
                                                Review
                                              </Badge>
                                            )}
                                          </div>
                                        </div>

                                        {/* Authenticity Checks */}
                                        {doc.layer3?.checks &&
                                          doc.layer3.checks.length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                              {doc.layer3.checks.map(
                                                (
                                                  check: any,
                                                  checkIdx: number,
                                                ) => (
                                                  <div
                                                    key={checkIdx}
                                                    className={`p-2 rounded text-xs flex items-center gap-2 ${check.passed
                                                      ? "bg-emerald-500/10"
                                                      : "bg-destructive/10"
                                                      }`}
                                                  >
                                                    {check.passed ? (
                                                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                    ) : (
                                                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                                    )}
                                                    <span
                                                      className={
                                                        check.passed
                                                          ? "text-emerald-700"
                                                          : "text-destructive"
                                                      }
                                                    >
                                                      {check.name}
                                                    </span>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        <p className="text-xs text-muted-foreground mt-2">
                                          {doc.layer3?.summary}
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Not Uploaded Message */}
                                  {doc.overallStatus === "not_uploaded" && (
                                    <div className="p-4">
                                      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-dashed">
                                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                                        <div>
                                          <p className="text-sm font-medium">
                                            Document Not Uploaded
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            Upload this document to enable 3-layer
                                            validation (Field Matching, Database
                                            Verification, Authenticity Check)
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            },
                          )}

                          {/* Summary Footer */}
                          <div className="pt-4 border-t flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                              All 3 documents are mandatory for supplier approval in
                              UAE
                            </p>
                            {aiAnalysis.documentValidations?.filter(
                              (d: any) => d.overallStatus === "verified",
                            ).length === 3 && (
                                <Badge className="bg-emerald-500 text-white">
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                  All Documents Verified
                                </Badge>
                              )}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  )}

                  {/* Compliance Checks Tab */}
                  {showAiVendorCompliance && (
                    <TabsContent value="compliance">
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                <Shield className="h-5 w-5 text-amber-500" />
                                Sanctions & Regulatory Screening
                              </CardTitle>
                              <CardDescription className="mt-1">
                                UAE regulatory compliance, international
                                sanctions, and blacklist checks
                              </CardDescription>
                            </div>
                            <div className="flex gap-2">
                              {(aiAnalysis.complianceChecks?.filter(
                                (c: any) => c.status === "pending_api",
                              ).length || 0) > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-500/10 text-amber-700 border-amber-500/30"
                                    data-testid="badge-compliance-pending"
                                  >
                                    <Clock className="h-3 w-3 mr-1" />
                                    {
                                      aiAnalysis.complianceChecks?.filter(
                                        (c: any) => c.status === "pending_api",
                                      ).length
                                    }{" "}
                                    Pending API
                                  </Badge>
                                )}
                              {(aiAnalysis.complianceChecks?.filter(
                                (c: any) => c.status === "clear",
                              ).length || 0) > 0 && (
                                  <Badge
                                    className="bg-emerald-500 text-white"
                                    data-testid="badge-compliance-clear"
                                  >
                                    {
                                      aiAnalysis.complianceChecks?.filter(
                                        (c: any) => c.status === "clear",
                                      ).length
                                    }{" "}
                                    Clear
                                  </Badge>
                                )}
                              {(aiAnalysis.complianceChecks?.filter(
                                (c: any) => c.status === "flagged",
                              ).length || 0) > 0 && (
                                  <Badge
                                    variant="destructive"
                                    data-testid="badge-compliance-flagged"
                                  >
                                    {
                                      aiAnalysis.complianceChecks?.filter(
                                        (c: any) => c.status === "flagged",
                                      ).length
                                    }{" "}
                                    Flagged
                                  </Badge>
                                )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid gap-4 md:grid-cols-2">
                            {aiAnalysis.complianceChecks?.map(
                              (check: any, idx: number) => (
                                <div
                                  key={idx}
                                  className={`p-4 rounded-lg border ${check.status === "clear"
                                    ? "border-emerald-500/50 bg-emerald-500/5"
                                    : check.status === "flagged"
                                      ? "border-destructive/50 bg-destructive/5"
                                      : "border-amber-500/30 bg-amber-500/5"
                                    }`}
                                  data-testid={`compliance-check-${idx}`}
                                >
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-sm">
                                        {check.checkType}
                                      </h4>
                                      {check.priority === "critical" && (
                                        <Badge
                                          variant="destructive"
                                          className="text-[10px] px-1.5 py-0"
                                        >
                                          Critical
                                        </Badge>
                                      )}
                                      {check.priority === "high" && (
                                        <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">
                                          High
                                        </Badge>
                                      )}
                                    </div>
                                    {check.status === "clear" ? (
                                      <Badge className="bg-emerald-500 text-white">
                                        CLEAR
                                      </Badge>
                                    ) : check.status === "flagged" ? (
                                      <Badge variant="destructive">FLAGGED</Badge>
                                    ) : check.status === "pending_api" ? (
                                      <Badge
                                        variant="outline"
                                        className="bg-amber-500/10 text-amber-700 border-amber-500/30"
                                      >
                                        <Clock className="h-3 w-3 mr-1" />
                                        Pending API
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline">PENDING</Badge>
                                    )}
                                  </div>

                                  <div
                                    className={`p-2.5 rounded-lg ${check.status === "clear"
                                      ? "bg-emerald-500/10 border border-emerald-500/20"
                                      : check.status === "flagged"
                                        ? "bg-destructive/10 border border-destructive/20"
                                        : "bg-amber-500/5 border border-amber-500/20"
                                      } mb-3`}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                                      <span className="text-xs font-medium text-muted-foreground">
                                        Data Source
                                      </span>
                                    </div>
                                    <p className="text-sm font-medium">
                                      {check.source}
                                    </p>
                                    {check.status === "clear" && (
                                      <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1.5">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                        No adverse records found
                                      </p>
                                    )}
                                    {check.status === "flagged" && (
                                      <p className="text-xs text-destructive mt-1.5 flex items-center gap-1.5">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Issue detected - manual review required
                                      </p>
                                    )}
                                    {check.status === "pending_api" && (
                                      <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Requires API integration for real-time
                                        verification
                                      </p>
                                    )}
                                  </div>

                                  {check.details && (
                                    <div className="pt-3 border-t">
                                      <p className="text-sm text-muted-foreground">
                                        {check.details}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ),
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">AI analysis not available</p>
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="vendor-profile">
          <div className="space-y-4">
            {/* Row 1: Combined Company Information + Primary Contact Card */}
            <Card data-testid="card-company-info">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Company Information Section - takes ~70% */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">
                          Company Information
                        </h3>
                      </div>
                      {canVendorEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate("/vendor/register/company-details")
                          }
                          data-testid="button-edit-company"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          Company Name
                        </p>
                        <p
                          className="text-sm font-medium"
                          data-testid="text-vendor-company-name"
                        >
                          {vendor.companyName || "-"}
                        </p>
                      </div>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                          Phone{historyToolTip(vendor.phone, vendor.prevPhone)}
                        </p>
                        <p className="text-sm" data-testid="text-vendor-phone">
                          {[
                            vendor.phoneCtryCode,
                            vendor.phoneAreaCode,
                            vendor.phone,
                          ]
                            .filter(Boolean)
                            .join(" ") || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                          Email{historyToolTip(vendor.emailId, vendor.prevEmailId)}
                        </p>
                        {isSuperAdmin && editingSupplierEmail ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="email"
                              value={editingSupplierEmailValue}
                              onChange={(e) =>
                                setEditingSupplierEmailValue(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSupplierEmailSave();
                                if (e.key === "Escape")
                                  setEditingSupplierEmail(false);
                              }}
                              className="h-8 text-sm"
                              autoFocus
                              data-testid="input-vendor-email-edit"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={handleSupplierEmailSave}
                              disabled={updateSupplierEmailMutation.isPending}
                              data-testid="button-save-vendor-email"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => setEditingSupplierEmail(false)}
                              data-testid="button-cancel-vendor-email"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 min-w-0">
                            <p
                              className="text-sm truncate"
                              data-testid="text-vendor-email"
                              title={vendor.emailId || undefined}
                            >
                              {vendor.emailId || "-"}
                            </p>
                            {isSuperAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => {
                                  setEditingSupplierEmailValue(
                                    vendor.emailId || "",
                                  );
                                  setEditingSupplierEmail(true);
                                }}
                                title="Edit supplier email"
                                data-testid="button-edit-vendor-email"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                          Website{historyToolTip(vendor.webAddress, vendor.prevWebAddress)}
                        </p>
                        <p
                          className="text-sm truncate"
                          data-testid="text-vendor-website"
                        >
                          {vendor.webAddress || "-"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Address
                        {hasAddressChanged && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <History className="w-4 h-4 cursor-pointer text-orange-500" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {previousAddress}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </p>
                      {(() => {
                        const fullAddress = [
                          vendor.address1,
                          vendor.address2,
                          vendor.city,
                          vendor.state,
                          formatCountry(vendor.country),
                          vendor.postalcode,
                        ]
                          .filter(Boolean)
                          .join(", ");

                        if (!fullAddress || fullAddress === "-") return <p className="text-sm">-</p>;

                        const displayAddress = fullAddress.length > 100
                          ? fullAddress.substring(0, 100) + "..."
                          : fullAddress;

                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p
                                  className="text-sm cursor-auto"
                                  data-testid="text-vendor-address"
                                >
                                  {displayAddress}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <p className="text-xs">{fullAddress}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Vertical Separator */}
                  <Separator
                    orientation="vertical"
                    className="hidden lg:block h-auto self-stretch"
                  />
                  <Separator className="lg:hidden" />

                  {/* Primary Contact Section - fixed width on right */}
                  <div className="lg:w-64 shrink-0 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">
                          Primary Contact
                        </h3>
                      </div>
                      {canVendorEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate("/vendor/register/contacts")}
                          data-testid="button-edit-contact"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {(() => {
                      const primaryContact = dboContacts.find(
                        (c) => c.isPrimary === "Y" || c.isPrimary === "Yes",
                      );
                      if (!primaryContact) {
                        return (
                          <div
                            className="text-center py-4"
                            data-testid="empty-primary-contact"
                          >
                            <User className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">
                              No primary contact
                            </p>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-sm">
                                {primaryContact.contactName
                                  ?.charAt(0)
                                  .toUpperCase() || "C"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p
                                className="font-medium text-sm truncate flex items-center gap-1"
                                data-testid="text-primary-contact-name"
                              >
                                {primaryContact.contactName}{historyToolTip(primaryContact.contactName, primaryContact.prevContactName)}
                              </p>
                              <p
                                className="text-xs text-muted-foreground truncate flex items-center gap-1"
                                data-testid="text-primary-contact-role"
                              >
                                {[
                                  primaryContact.contactCategory,
                                  primaryContact.designation,
                                  primaryContact.department,
                                ]
                                  .filter(Boolean)
                                  .join(", ") || "-"}{(hasChanged(primaryContact.contactCategory, primaryContact.prevContactCategory) || hasChanged(primaryContact.designation, primaryContact.prevDesignation) || hasChanged(primaryContact.department, primaryContact.prevDepartment)) && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span>
                                            <History className="w-4 h-4 cursor-pointer text-orange-500" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {[
                                            primaryContact.prevContactCategory,
                                            primaryContact.prevDesignation,
                                            primaryContact.prevDepartment,
                                          ]
                                            .filter(Boolean)
                                            .join(", ") || "-"}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                                Email{historyToolTip(primaryContact.email, primaryContact.prevEmail)}
                              </p>
                              <p
                                className="truncate"
                                data-testid="text-primary-contact-email"
                              >
                                {primaryContact.email || "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                                Mobile{historyToolTip(primaryContact.mobile, primaryContact.prevMobile)}
                              </p>
                              <p data-testid="text-primary-contact-phone">
                                {primaryContact.mobile
                                  ? `${primaryContact.mobileCtryCode || ""} ${primaryContact.mobile}`
                                  : "-"}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {(primaryContact.isPrimary === "Y" ||
                              primaryContact.isPrimary === "Yes") && (
                                <Badge
                                  className="bg-primary text-primary-foreground text-[10px]"
                                  data-testid="badge-primary-contact"
                                >
                                  Primary
                                </Badge>
                              )}
                            {(primaryContact.isAuthSignatory === "Y" ||
                              primaryContact.isAuthSignatory === "Yes") && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                  data-testid="badge-auth-signatory"
                                >
                                  Auth Signatory
                                </Badge>
                              )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Vendor Intelligence Section */}
            {!isVendorUser && isAIEnabled("AI_SUPPLIER_RANK") &&
              (vendor?.status === "Active" || vendor?.status === "Approved") &&
              showRankAnalysis && (
                <Card
                  className="border-primary/20 bg-primary/[0.02]"
                  data-testid="card-rank-analysis"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-semibold">
                          Rank Analysis
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {aiAnalysis?.performanceRank?.score !== undefined && (
                          <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1">
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold leading-none whitespace-nowrap">
                              Total
                            </p>
                            <p className="text-xl font-bold text-primary leading-tight">
                              {aiAnalysis.performanceRank.totalScore ??
                                Number(
                                  (aiAnalysis.performanceRank.score * 100).toFixed(0),
                                )}
                            </p>
                          </div>
                        )}
                        {aiAnalysis?.performanceRank?.rank && (
                          <Badge className="bg-[#4b2ca5] hover:bg-[#4b2ca5] text-white font-semibold text-sm px-3 py-1 rounded-lg">
                            Rank  {aiAnalysis.performanceRank.rank}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[1fr_auto] items-start">
                      <div>
                        <p className="text-sm text-muted-foreground uppercase tracking-wider font-bold">
                          AI Reasoning
                        </p>
                        <p className="text-sm text-foreground/90 leading-relaxed italic mt-1">
                          {aiAnalysis?.performanceRank?.ai_analysis?.reasoning
                            ?.map((item: any) =>
                              typeof item === "string" ? item : item.point,
                            )
                            .join(" ") ||
                            "No AI reasoning generated yet. Click 'Rank analysis' button at the top to generate analysis."}
                        </p>
                      </div>

                      <div className="min-w-[280px]">
                        {!!aiAnalysis?.performanceRank?.metrics && (
                          <TooltipProvider>
                            <div className="grid grid-cols-5 gap-1.5">
                              {[
                                {
                                  key: "bwr",
                                  label: "BWR",
                                  fullForm: "Bid Win Rate",
                                  weight: "20%",
                                },
                                {
                                  key: "otdr",
                                  label: "OTDR",
                                  fullForm: "On-Time Delivery Ratio",
                                  weight: "25%",
                                },
                                {
                                  key: "ic",
                                  label: "IC",
                                  fullForm: "Issue-Free Ratio",
                                  weight: "15%",
                                },
                                {
                                  key: "fr",
                                  label: "FR",
                                  fullForm: "Fulfillment Rate",
                                  weight: "25%",
                                },
                                {
                                  key: "pc",
                                  label: "PC",
                                  fullForm: "Price Competitiveness",
                                  weight: "15%",
                                },
                              ].map((metric) => (
                                <Tooltip key={metric.key}>
                                  <TooltipTrigger asChild>
                                    <div className="rounded-md bg-muted px-1.5 py-1.5 text-center cursor-help">
                                      <p className="text-[10px] text-muted-foreground font-semibold uppercase leading-none">
                                        {metric.label}
                                      </p>
                                      <p className="text-lg font-bold text-primary leading-tight mt-0.5">
                                        {(aiAnalysis.performanceRank?.metrics?.[
                                          metric.key as keyof NonNullable<
                                            NonNullable<
                                              AIAnalysis["performanceRank"]
                                            >["metrics"]
                                          >
                                        ] ?? 0).toString()}
                                      </p>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[220px]">
                                    <p className="text-xs font-semibold">
                                      {metric.fullForm}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Weight: {metric.weight}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </TooltipProvider>
                        )}

                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Approval History Section - only show if not Draft */}
            {vendor && !isVendorUser &&
              vendor.status !== "Draft" &&
              vendor.status !== "draft" && (
                <Accordion
                  type="single"
                  collapsible
                  defaultValue="approval-history"
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
                    <AccordionContent className="px-4 pb-3 max-h-[210px] overflow-auto">
                      {/*This is based on wf step instances*/}
                      {/* {workflowHistory.length > 0 ? (
                        <div className="space-y-4">
                          {workflowHistory.map(
                            (wfInstance: any, wfIndex: number) => {
                              const isRunning =
                                wfInstance.instanceStatus === "Running";
                              const isCompleted =
                                wfInstance.instanceStatus === "Completed";
                              const typeBadgeVariant =
                                wfInstance.type === "Profile Update"
                                  ? "secondary"
                                  : "outline";

                              return (
                                <div
                                  key={wfInstance.instanceId}
                                  className="border rounded-md p-3"
                                  data-testid={`workflow-instance-${wfIndex}`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant={typeBadgeVariant}>
                                        {wfInstance.type}
                                      </Badge>
                                      <Badge
                                        variant={
                                          isRunning
                                            ? "default"
                                            : isCompleted
                                              ? "outline"
                                              : "destructive"
                                        }
                                      >
                                        {wfInstance.instanceStatus}
                                      </Badge>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                      {formatDate(
                                        wfInstance.startDate, true
                                      )}
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <div className="flex items-start min-w-max">
                                      {wfInstance.steps.map(
                                        (step: any, stepIndex: number) => {
                                          const resultLower = (
                                            step.result || ""
                                          ).toLowerCase();
                                          const isStepApproved =
                                            resultLower === "approved" ||
                                            resultLower === "approve";
                                          const isStepRejected =
                                            resultLower === "rejected" ||
                                            resultLower === "reject";
                                          const isStepMoreInfo =
                                            resultLower ===
                                            "more info requested" ||
                                            resultLower === "more" ||
                                            resultLower ===
                                            "more info required";
                                          const isStepWaiting =
                                            step.status === "Waiting";
                                          const isStepPending =
                                            step.status === "Ready" ||
                                            step.status === "Pending" ||
                                            (!step.result && !isStepWaiting);
                                          const isStepCompleted =
                                            step.status === "Completed";

                                          const statusColor =
                                            isStepCompleted && isStepApproved
                                              ? "bg-emerald-500 border-emerald-500 text-white"
                                              : isStepCompleted &&
                                                isStepRejected
                                                ? "bg-red-500 border-red-500 text-white"
                                                : isStepCompleted &&
                                                  isStepMoreInfo
                                                  ? "bg-amber-500 border-amber-500 text-white"
                                                  : isStepWaiting
                                                    ? "bg-muted border-dashed border-muted-foreground/20 text-muted-foreground/50"
                                                    : "bg-muted border-muted-foreground/30 text-muted-foreground";

                                          const dotColor =
                                            isStepCompleted && isStepApproved
                                              ? "bg-emerald-500"
                                              : isStepCompleted &&
                                                isStepRejected
                                                ? "bg-red-500"
                                                : isStepCompleted &&
                                                  isStepMoreInfo
                                                  ? "bg-amber-500"
                                                  : isStepWaiting
                                                    ? "bg-muted-foreground/30"
                                                    : "bg-orange-500";

                                          const statusLabel = isStepCompleted
                                            ? isStepApproved
                                              ? "Approved"
                                              : isStepRejected
                                                ? "Rejected"
                                                : isStepMoreInfo
                                                  ? "More Info"
                                                  : step.result || "Completed"
                                            : isStepWaiting
                                              ? "Waiting"
                                              : isStepPending
                                                ? "Pending"
                                                : step.status;

                                          return (
                                            <div
                                              key={stepIndex}
                                              className="flex items-start"
                                              data-testid={`wf-${wfIndex}-step-${stepIndex}`}
                                            >
                                              <div className="flex flex-col items-center min-w-[140px] max-w-[160px]">
                                                <div
                                                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${statusColor}`}
                                                >
                                                  {isStepWaiting ? (
                                                    <Circle className="h-4 w-4" />
                                                  ) : isStepPending ? (
                                                    <Clock className="h-4 w-4" />
                                                  ) : isStepApproved ? (
                                                    <CheckCircle2 className="h-4 w-4" />
                                                  ) : isStepRejected ? (
                                                    <XCircle className="h-4 w-4" />
                                                  ) : (
                                                    <AlertCircle className="h-4 w-4" />
                                                  )}
                                                </div>
                                                <div className="mt-1.5 w-full text-center px-1 min-w-0">
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <span className="text-xs font-medium truncate block w-full cursor-pointer">
                                                          {step.actionBy || step.assignee || "Unknown"}
                                                        </span>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p>{step.actionBy || step.assignee || "Unknown"}</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                  <div className="flex items-center justify-center gap-1 mt-0.5">
                                                    <span
                                                      className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`}
                                                    />
                                                    <span className="text-xs">
                                                      {statusLabel}
                                                    </span>
                                                  </div>
                                                  {step.actionDate && (
                                                    <span className="text-[10px] text-muted-foreground block">
                                                      {formatDate(step.actionDate)}
                                                    </span>
                                                  )}
                                                  {step.remarks && (
                                                    <span className="text-[10px] text-muted-foreground block break-words" title={step.remarks}>
                                                      {step.remarks}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              {stepIndex <
                                                wfInstance.steps.length - 1 && (
                                                  <div className="flex items-center h-8">
                                                    <div className="w-10 border-t-2 border-dashed border-muted-foreground/30" />
                                                  </div>
                                                )}
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                      ) : (
                        <div
                          className="text-center py-3 w-full"
                          data-testid="empty-approval-history"
                        >
                          <Clock className="h-5 w-5 text-muted-foreground/50 mx-auto mb-1" />
                          <span className="text-xs text-muted-foreground">
                            No approval history available
                          </span>
                        </div>
                      )} */}
                      <div className="flex items-start min-w-max">
                        {(() => {
                          // Get approval history from database
                          const approvalHistory = dboApprovalHistory || [];

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
                              const dateA = a.approvedDate ? new Date(a.approvedDate).getTime() : 0;
                              const dateB = b.approvedDate ? new Date(b.approvedDate).getTime() : 0;
                              if (dateA !== dateB) return dateA - dateB;
                              return (a.id || 0) - (b.id || 0); // Fallback to ID sorting
                            })
                            .forEach((approval, index) => {
                              const approverTrimmed = (approval.approverName || "").trim();
                              const isRole = ROLE_NAMES.some(
                                (role) => approverTrimmed.toUpperCase() === role,
                              );

                              timelineItems.push({
                                name: approval.approverName || approval.attribute1 || "",
                                status:
                                  (approval.status === "Approve" || approval.status === "approve") ? "Approved" :
                                    (approval.status === "Reject" || approval.status === "reject") ? "Rejected" :
                                      (approval.status === "More" || approval.status === "more" || approval.status === "More Info Required") ? "More" :
                                          approval.status === "ReSubmit" || approval.status === "resubmit" ? "ReSubmit" : approval.status === "Delegation" ? "Delegation" : approval.status === "Delegated User" ? "Delegated User" : "Approved",
                                date: formatDate(approval.approvedDate) || undefined,
                                comments: approval.comments || undefined,
                                stepOrder: index + 1,
                                roleName: isRole ? approverTrimmed : undefined,
                              });
                            });

                          // 2. Add pending approvers from approvers_list if in a pending state
                          const pendingStatuses = ["Pending Approval", "Pending", "PENDING", "Pending_Approval", "In Approval"];
                          if (vendor.status && pendingStatuses.includes(vendor.status)) {
                            const currentApprovers = vendor.approversList
                              ? vendor.approversList
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
                                    : isDelegated ? item.status : "Pending";

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
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

            {/* Row 2: Business Details Card + Scope of Supply Card */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Business Details Card (includes Working Hours) */}
              <Card data-testid="card-business-details">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Business Details
                    </CardTitle>
                    {canVendorEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          navigate("/vendor/register/company-details")
                        }
                        data-testid="button-edit-business"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4 pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        License Number {historyToolTip(vendor.licenseNo, vendor.prevLicenseNo)}
                      </p>
                      <p
                        className="text-sm font-mono"
                        data-testid="text-license-number"
                      >
                        {vendor.licenseNo || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Place of Issue {historyToolTip(vendor.placeOfIssue, vendor.prevPlaceOfIssue)}
                      </p>
                      <p className="text-sm" data-testid="text-place-of-issue">
                        {vendor.placeOfIssue || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Business Expiry Date{historyToolTip(formatDate(vendor.expiryDate), formatDate(vendor.prevExpiryDate) === "-" ? null : formatDate(vendor.prevExpiryDate))}
                      </p>
                      <p
                        className="text-sm"
                        data-testid="text-business-expiry-date"
                      >
                        {formatDate(vendor.expiryDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Legal Entity Type {historyToolTip(vendor.legalEntityType, vendor.prevLegalEntityType)}
                      </p>
                      <p
                        className="text-sm font-medium"
                        data-testid="text-legal-entity-type"
                      >
                        {vendor.legalEntityType || vendor.typeOfCompany || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        PAN No (Company) {historyToolTip(vendor.panNo, vendor.prevPanNo)}
                      </p>
                      <p
                        className="text-sm font-mono"
                        data-testid="text-pan-no"
                      >
                        {vendor.panNo || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Incorporation Date{historyToolTip(formatDate(vendor.startDate), formatDate(vendor.prevStartDate) === "-" ? null : formatDate(vendor.prevStartDate))}
                      </p>
                      <p
                        className="text-sm font-medium"
                        data-testid="text-incorporation-date"
                      >
                        {vendor.startDate
                          ? formatDate(vendor.startDate)
                          : vendor.busTradingDate
                            ? formatDate(vendor.busTradingDate)
                            : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Annual Turn Over {historyToolTip(vendor.annualTurnOver, vendor.prevAnnualTurnOver)}
                      </p>
                      <p
                        className="text-sm font-medium"
                        data-testid="text-annual-revenue"
                      >
                        {vendor.annualTurnOver
                          ? `${vendor.turnOverCurrency || ""} ${vendor.annualTurnOver}`
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Transaction Currency
                      </p>
                      <p
                        className="text-sm"
                        data-testid="text-transaction-currency"
                      >
                        {vendor.turnOverCurrency || "-"}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Working Days{hasWorkingChanged(vendor.workingdayStart, vendor.prevWorkingDayStart, vendor.workingdayEnd, vendor.prevWorkingDayEnd)}
                      </p>
                      <p className="text-sm" data-testid="text-working-days">
                        {vendor.workingdayStart && vendor.workingdayEnd
                          ? `${vendor.workingdayStart} - ${vendor.workingdayEnd}`
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Working Hours{hasWorkingChanged(vendor.workingTimeStartTime, vendor.prevWorkingTimeStartTime, vendor.workingTimeEndTime, vendor.prevWorkingTimeEndTime)}
                      </p>
                      <p className="text-sm" data-testid="text-working-hours">
                        {vendor.workingTimeStartTime &&
                          vendor.workingTimeEndTime
                          ? `${vendor.workingTimeStartTime} - ${vendor.workingTimeEndTime}`
                          : "-"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-tax-details">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Landmark className="h-4 w-4" />
                    Tax Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4 pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        GST/VAT Registration No{historyToolTip(vendor.taxRegNo, vendor.prevTaxRegNo)}
                      </p>
                      <p
                        className="text-sm font-mono"
                        data-testid="text-tax-reg-no"
                      >
                        {vendor.taxRegNo || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Payment Terms{historyToolTip(vendor.paymentTerms, vendor.prevPaymentTerms)}
                      </p>
                      <p
                        className="text-sm font-medium"
                        data-testid="text-payment-terms"
                      >
                        {vendor.paymentTerms || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Tax Identification No (TIN){historyToolTip(vendor.taxPayerId, vendor.prevTaxPayerId)}
                      </p>
                      <p
                        className="text-sm font-mono"
                        data-testid="text-tax-payer-id"
                      >
                        {vendor.taxPayerId || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Tax Effective Date{historyToolTip(formatDate(vendor.taxEffectiveDate), formatDate(vendor.prevTaxEffectiveDate) === "-" ? null : formatDate(vendor.prevTaxEffectiveDate))}
                      </p>
                      <p className="text-sm" data-testid="text-tax-effective-date">
                        {formatDate(vendor.taxEffectiveDate)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Scope of Supply Card */}
              <Card data-testid="card-scope">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Scope of Supply
                    </CardTitle>
                    {canVendorEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          navigate("/vendor/register/scope-of-supply")
                        }
                        data-testid="button-edit-scope"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 space-y-3">
                  {/* Experience Details */}
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                        Service Experience Details{historyToolTip(vendor.typeOfService, vendor.prevTypeOfService)}
                      </p>
                      <p
                        className="text-sm"
                        data-testid="text-service-experience"
                      >
                        {vendor.typeOfService || "-"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                          Domestic Experience{historyToolTip(vendor.yearOfExpLocMarket, vendor.prevYearOfExpLocMarket)}
                        </p>
                        <p
                          className="text-sm"
                          data-testid="text-domestic-experience"
                        >
                          {vendor.yearOfExpLocMarket
                            ? `${vendor.yearOfExpLocMarket} years`
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                          International Experience{historyToolTip(vendor.yearOfExpInternational, vendor.prevYearOfExpInternational)}
                        </p>
                        <p
                          className="text-sm"
                          data-testid="text-international-experience"
                        >
                          {vendor.yearOfExpInternational
                            ? `${vendor.yearOfExpInternational} years`
                            : "-"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Categories as Tags */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Categories ({dboServices.length})
                    </p>
                    {dboServices.length === 0 ? (
                      <p
                        className="text-sm text-muted-foreground"
                        data-testid="empty-scope"
                      >
                        No categories registered
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {dboServices.slice(0, 8).map((service) => (
                          <Badge
                            key={service.id}
                            variant="outline"
                            className="text-xs"
                            data-testid={`badge-category-${service.id}`}
                          >
                            {service.goodServiceCode ||
                              service.subCategory ||
                              service.categoryCode ||
                              "General"}
                            {service.categoryType && ` (${service.categoryType})`}
                          </Badge>
                        ))}
                        {dboServices.length > 8 && (
                          <Badge variant="secondary" className="text-xs">
                            +{dboServices.length - 8} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Row 3: Tabbed View for Contacts, Banking, Documents, References */}
            <Tabs defaultValue="contacts" className="w-full">
              <TabsList className="grid w-full grid-cols-5 max-w-3xl">
                <TabsTrigger
                  value="contacts"
                  className="text-xs gap-1.5"
                  data-testid="tab-contacts"
                >
                  <Users className="h-3.5 w-3.5" />
                  Contacts ({dboContacts.length})
                </TabsTrigger>
                <TabsTrigger
                  value="banking"
                  className="text-xs gap-1.5"
                  data-testid="tab-banking"
                >
                  <Landmark className="h-3.5 w-3.5" />
                  Banking ({dboBanks.length})
                </TabsTrigger>
                <TabsTrigger
                  value="documents"
                  className="text-xs gap-1.5"
                  data-testid="tab-documents"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Documents ({dboDocuments.length})
                </TabsTrigger>
                <TabsTrigger
                  value="references"
                  className="text-xs gap-1.5"
                  data-testid="tab-references"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  References ({dboRefCompanies.length})
                </TabsTrigger>
                <TabsTrigger
                  value="performance"
                  className="text-xs gap-1.5"
                  data-testid="tab-performance"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Performance
                </TabsTrigger>
              </TabsList>

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="mt-4 space-y-4">
                <Card data-testid="card-contacts">
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Contacts ({dboContacts.length})
                      </CardTitle>
                      {canVendorEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate("/vendor/register/contacts")}
                          data-testid="button-edit-contacts"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {dboContacts.length === 0 ? (
                      <div
                        className="text-center py-6"
                        data-testid="empty-contacts"
                      >
                        <Users className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No contacts registered
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {dboContacts.map((contact) => (
                          <Card
                            key={contact.id}
                            className="p-3"
                            data-testid={`contact-card-${contact.id}`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                                  {contact.contactName
                                    ?.charAt(0)
                                    .toUpperCase() || "C"}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="font-medium text-sm truncate"
                                    data-testid={`text-contact-name-${contact.id}`}
                                  >
                                    {contact.contactName}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {[
                                      contact.contactCategory,
                                      contact.designation,
                                      contact.department,
                                    ]
                                      .filter(Boolean)
                                      .join(", ") || "-"}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-1 text-xs">
                                {contact.mobile && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Phone className="h-3 w-3 shrink-0" />
                                    <span
                                      className="truncate"
                                      data-testid={`text-contact-phone-${contact.id}`}
                                    >
                                      {contact.mobileCtryCode || ""}{" "}
                                      {contact.mobile}
                                    </span>
                                  </div>
                                )}
                                {contact.email && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Mail className="h-3 w-3 shrink-0" />
                                    <span
                                      className="truncate"
                                      data-testid={`text-contact-email-${contact.id}`}
                                    >
                                      {contact.email}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {(contact.isPrimary === "Y" ||
                                  contact.isPrimary === "Yes") && (
                                    <Badge
                                      className="bg-primary text-primary-foreground text-[10px]"
                                      data-testid={`badge-contact-primary-${contact.id}`}
                                    >
                                      Primary
                                    </Badge>
                                  )}
                                {(contact.isAuthSignatory === "Y" ||
                                  contact.isAuthSignatory === "Yes") && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px]"
                                      data-testid={`badge-contact-auth-${contact.id}`}
                                    >
                                      Auth Signatory
                                    </Badge>
                                  )}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Banking Tab */}
              <TabsContent value="banking" className="mt-4">
                <Card data-testid="card-banking">
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Landmark className="h-4 w-4" />
                        Banking ({dboBanks.length})
                      </CardTitle>
                      {canVendorEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate("/vendor/register/banking")}
                          data-testid="button-edit-banking"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {dboBanks.length === 0 ? (
                      <div
                        className="text-center py-6"
                        data-testid="empty-banking"
                      >
                        <Landmark className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No bank accounts registered
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dboBanks.map((bank) => {
                          const isExpanded = expandedStaffBankId === bank.id;
                          const bankDocs = dboDocuments.filter(
                            (d: any) => d.doc_type === "BANK_DOCUMENT",
                          );
                          return (
                            <Card
                              key={bank.id}
                              className="p-4"
                              data-testid={`bank-card-${bank.id}`}
                            >
                              <div
                                className="flex items-start justify-between gap-4 mb-3 cursor-pointer"
                                onClick={() =>
                                  setExpandedStaffBankId(
                                    isExpanded ? null : bank.id,
                                  )
                                }
                                data-testid={`bank-expander-${bank.id}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                                    <Landmark className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                  <div>
                                    <p
                                      className="font-medium"
                                      data-testid={`text-bank-name-${bank.id}`}
                                    >
                                      {bank.bankName}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {bank.branchName ||
                                        "Branch not specified"}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {bank.primaryAccount === "Y" ? (
                                    <Badge
                                      className="bg-emerald-500 text-white text-xs"
                                      data-testid={`badge-bank-primary-${bank.id}`}
                                    >
                                      Primary Account
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                      data-testid={`badge-bank-secondary-${bank.id}`}
                                    >
                                      Secondary
                                    </Badge>
                                  )}
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">
                                    Account Number
                                  </p>
                                  <p
                                    className="font-mono font-medium"
                                    data-testid={`text-bank-account-${bank.id}`}
                                  >
                                    {bank.accountNo
                                      ? `****${bank.accountNo.slice(-4)}`
                                      : "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">
                                    Account Type
                                  </p>
                                  <p className="font-medium">
                                    {bank.bankAccountType || "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">
                                    Currency
                                  </p>
                                  <p className="font-medium">
                                    {bank.currency || "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">
                                    SWIFT Code
                                  </p>
                                  <p className="font-mono font-medium">
                                    {bank.swiftCode || "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">
                                    IFSC Code
                                  </p>
                                  <p
                                    className="font-mono font-medium"
                                    data-testid={`text-bank-ifsc-${bank.id}`}
                                  >
                                    {bank.ifsccode || "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">
                                    IBAN
                                  </p>
                                  <p className="font-mono font-medium break-all">
                                    {bank.ibanNo || "-"}
                                  </p>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="mt-4 space-y-4 border-t pt-4">
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">
                                        Beneficiary Name
                                      </p>
                                      <p className="font-medium">
                                        {bank.beneficiaryName || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">
                                        Beneficiary Address
                                      </p>
                                      <p className="font-medium">
                                        {bank.beneficiaryAddress || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">
                                        Bank Address
                                      </p>
                                      <p className="font-medium">
                                        {bank.bankAddress || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">
                                        Country
                                      </p>
                                      <p className="font-medium">
                                        {formatCountry(bank.country) || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">
                                        City
                                      </p>
                                      <p className="font-medium">
                                        {bank.city || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">
                                        State / Region
                                      </p>
                                      <p className="font-medium">
                                        {bank.region || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">
                                        Postal Code
                                      </p>
                                      <p className="font-medium">
                                        {bank.postalCode || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-0.5">
                                        ABA Routing
                                      </p>
                                      <p className="font-mono font-medium">
                                        {bank.abaRouting || "-"}
                                      </p>
                                    </div>
                                  </div>

                                  {bankDocs.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-2">
                                        Bank Documents
                                      </p>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {bankDocs.map((doc: any) => (
                                          <div
                                            key={doc.id}
                                            className="group relative rounded-md border overflow-hidden"
                                            data-testid={`bank-doc-${doc.id}`}
                                          >
                                            <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                                              {doc.doc_uri ? (
                                                <img
                                                  src={`data:image/png;base64,${doc.doc_uri}`}
                                                  alt={
                                                    doc.doc_name ||
                                                    "Bank document"
                                                  }
                                                  className="w-full h-full object-cover"
                                                />
                                              ) : (
                                                <FileText className="h-8 w-8 text-muted-foreground/40" />
                                              )}
                                            </div>
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-white"
                                                onClick={() =>
                                                  setStaffPreviewDoc(doc)
                                                }
                                                data-testid={`btn-preview-bank-doc-${doc.id}`}
                                              >
                                                <Eye className="h-4 w-4" />
                                              </Button>
                                              {doc.doc_path && (
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className="h-8 w-8 text-white"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDownloadDocument(doc, `/api/vendor/documents/${doc.id}/download`)
                                                  }}  
                                                  data-testid={`btn-download-bank-doc-${doc.id}`}
                                                >
                                                  <Download className="h-4 w-4" />
                                                </Button>
                                              )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground truncate px-1.5 py-1">
                                              {doc.filename ||
                                                doc.doc_name ||
                                                "Bank Document"}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="mt-4">
                <Card data-testid="card-documents">
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Documents ({dboDocuments.length})
                      </CardTitle>
                      {canVendorEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate("/vendor/register/certificates")
                          }
                          data-testid="button-edit-documents"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {dboDocuments.length === 0 ? (
                      <div
                        className="text-center py-6"
                        data-testid="empty-documents"
                      >
                        <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No documents uploaded
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {dboDocuments.map((doc: any) => {
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
                                        setStaffPreviewDoc(doc);
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
                                        handleDownloadDocument(doc, `/api/vendor/documents/${doc.id}/download`)
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
                                  {getStaffDocTypeLabel(doc.doc_type) ||
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
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* References Tab */}
              <TabsContent value="references" className="mt-4">
                <Card data-testid="card-ref-companies">
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        References ({dboRefCompanies.length})
                      </CardTitle>
                      {canVendorEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate("/vendor/register/contacts")}
                          data-testid="button-edit-references"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {dboRefCompanies.length === 0 ? (
                      <div
                        className="text-center py-6"
                        data-testid="empty-ref-companies"
                      >
                        <Building2 className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No reference companies provided
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {dboRefCompanies.map((refCompany) => (
                          <Card
                            key={refCompany.id}
                            className="p-3"
                            data-testid={`ref-company-card-${refCompany.id}`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                                  {refCompany.contactName
                                    ?.charAt(0)
                                    .toUpperCase() || "R"}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="font-medium text-sm truncate"
                                    data-testid={`text-ref-company-name-${refCompany.id}`}
                                  >
                                    {refCompany.contactName || "Unknown"}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {refCompany.refCompanyName || "-"}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-1 text-xs">
                                {refCompany.phone && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Phone className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {refCompany.phone}
                                    </span>
                                  </div>
                                )}
                                {refCompany.email && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Mail className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {refCompany.email}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Performance Tab */}
              <TabsContent value="performance" className="mt-4 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Card 1: Overall Rating */}
                  <Card className="shadow-sm border-slate-100 rounded-2xl">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Overall Rating
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-extrabold text-slate-800 tabular-nums">
                            {ratingStats?.avg_supplier_rating ? Number(ratingStats.avg_supplier_rating).toFixed(1) : "0.0"}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <svg
                                key={star}
                                className={`w-4 h-4 ${star <= Math.round(Number(ratingStats?.avg_supplier_rating || 0)) ? "text-amber-400" : "text-slate-200"}`}
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500">
                        <Star className="h-5 w-5" />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Evaluated POs */}
                  <Card className="shadow-sm border-slate-100 rounded-2xl">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Evaluated POs
                        </p>
                        <p className="text-3xl font-extrabold text-slate-800 tabular-nums">
                          {ratingStats?.evaluated_pos ?? 0}
                        </p>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-500">
                        <Receipt className="h-5 w-5" />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: Last Evaluated */}
                  <Card className="shadow-sm border-slate-100 rounded-2xl">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Last Evaluated
                        </p>
                        <p className="text-lg font-bold text-slate-800 truncate max-w-[200px]">
                          {ratingStats?.last_evaluation_date ? formatDate(ratingStats.last_evaluation_date) : "N/A"}
                        </p>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500">
                        <Calendar className="h-5 w-5" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Rating Trend Chart */}
                <Card className="shadow-sm border-slate-100 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Rating Trend</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">
                      {surveyResponsesAll.length} {surveyResponsesAll.length === 1 ? "evaluation" : "evaluations"}
                    </span>
                  </div>
                  {surveyResponsesAll.length === 0 ? (
                    <div className="h-48 flex items-center justify-center bg-slate-50 border border-dashed rounded-xl">
                      <p className="text-xs text-slate-400">No evaluations recorded to show trend line</p>
                    </div>
                  ) : (
                    <div className="h-48 w-full mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={[...surveyResponsesAll]
                            .reverse()
                            .map((r: any) => ({
                              poNumber: r.po_number,
                              score: Number(r.attribute_12 || 0),
                              date: formatDate(r.creation_date)
                            }))}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6b4ce6" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#6b4ce6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis 
                            dataKey="poNumber" 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                          />
                          <YAxis 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            domain={[0, 100]}
                          />
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white border border-slate-100 p-2.5 rounded-lg shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">{data.poNumber}</p>
                                    <p className="text-xs font-semibold text-slate-700 mt-0.5">Score: {Number(data.score).toFixed(1)} / 100</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{data.date}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="score"
                            stroke="#6b4ce6"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorScore)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                {/* PO Evaluation History Table */}
                <Card className="shadow-sm border-slate-100 rounded-2xl overflow-hidden">
                  <CardHeader className="py-4 px-5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold text-slate-800">
                        PO Evaluation History
                      </CardTitle>
                      <Badge className="bg-slate-50 border border-slate-100 text-slate-600 rounded-lg font-medium text-xs py-0.5 px-2">
                        {surveyPagination?.total || 0}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {surveyResponsesAll.length === 0 ? (
                      <div className="text-center py-10">
                        <TrendingUp className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-500">No evaluations recorded yet</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Supplier evaluations will appear here once submitted.</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left text-slate-500">
                            <thead className="text-[10px] text-slate-400 uppercase bg-slate-50/50 tracking-wider font-semibold border-b border-slate-100">
                              <tr>
                                <th scope="col" className="px-6 py-3 font-semibold">PO Number</th>
                                <th scope="col" className="px-6 py-3 font-semibold">Items Supplied</th>
                                <th scope="col" className="px-6 py-3 font-semibold">Eval Date</th>
                                <th scope="col" className="px-6 py-3 font-semibold">Reviewed By</th>
                                <th scope="col" className="px-6 py-3 font-semibold">Score</th>
                                <th scope="col" className="px-6 py-3 font-semibold text-right">Rating</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {surveyResponsesPage.map((r: any) => {
                                const itemsText = dboServices
                                  .map((s) => s.subCategory || s.categoryCode || "Products")
                                  .slice(0, 3)
                                  .join(", ") || "General Supplies";

                                return (
                                  <tr key={r.id} className="hover:bg-slate-50/30 transition-colors">
                                    <td 
                                      className="px-6 py-4 font-semibold text-violet-600 hover:underline cursor-pointer"
                                      onClick={() => {
                                        setSelectedPoNumber(r.po_number);
                                        setSelectedEvaluationId(String(r.survey_id));
                                        setShowEvaluationDetails(true);
                                      }}
                                    >
                                      {r.po_number}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-700 max-w-[200px] truncate">
                                      {itemsText}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 font-medium">
                                      {formatDate(r.creation_date)}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 font-medium">
                                      {r.attribute_14 || r.createdby || "System"}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-700 tabular-nums">
                                      {Number(r.attribute_12 || 0).toFixed(1)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end gap-0.5">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <svg
                                            key={star}
                                            className={`w-3.5 h-3.5 ${star <= Math.round(Number(r.star_rate || 0)) ? "text-amber-400" : "text-slate-200"}`}
                                            fill="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                          </svg>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination */}
                        {surveyPagination && (
                          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                Rows per page:
                              </span>
                              <Select
                                value={perfLimit.toString()}
                                onValueChange={(v) => {
                                  setPerfLimit(parseInt(v));
                                  setPerfPage(1);
                                }}
                              >
                                <SelectTrigger
                                  className="h-7 w-[60px] text-xs"
                                  data-testid="select-rows-per-page-perf"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="10">10</SelectItem>
                                  <SelectItem value="25">25</SelectItem>
                                  <SelectItem value="50">50</SelectItem>
                                  <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                              </Select>
                              <span className="text-xs text-muted-foreground ml-2">
                                {surveyPagination.total > 0
                                  ? `${(surveyPagination.page - 1) * perfLimit + 1}-${Math.min(surveyPagination.page * perfLimit, surveyPagination.total)} of ${surveyPagination.total.toLocaleString()}`
                                  : "0 results"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setPerfPage((p) => Math.max(1, p - 1))}
                                disabled={surveyPagination.page <= 1}
                                data-testid="button-prev-page-perf"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </Button>
                              <span className="text-xs px-1 font-medium text-slate-600">
                                {surveyPagination.page}/{surveyPagination.totalPages || 1}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setPerfPage((p) => Math.min(surveyPagination.totalPages, p + 1))}
                                disabled={surveyPagination.page >= surveyPagination.totalPages}
                                data-testid="button-next-page-perf"
                              >
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!staffPreviewDoc}
        onOpenChange={(open) => {
          if (!open) setStaffPreviewDoc(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <span>
                {staffPreviewDoc?.filename ||
                  staffPreviewDoc?.doc_name ||
                  "Document Preview"}
              </span>
              {staffPreviewDoc && (
                <Badge variant="secondary" className="text-[10px]">
                  {getStaffDocTypeLabel(staffPreviewDoc.doc_type)}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 rounded-md min-h-[300px]">
            {staffPreviewDoc?.doc_uri && (
              <img
                src={`data:image/png;base64,${staffPreviewDoc.doc_uri}`}
                alt="Document preview"
                className="max-w-full max-h-[65vh] object-contain"
                data-testid="img-staff-doc-preview-full"
              />
            )}
          </div>
          {staffPreviewDoc?.doc_path && (
            <div className="flex justify-end pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!staffPreviewDoc) return;
                  handleDownloadDocument(staffPreviewDoc, `/api/vendor/documents/${staffPreviewDoc.id}/download`);
                }}
                data-testid="button-download-staff-doc-preview"
              >
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              Are you sure want to{" "}
              {approvalAction === "Approve"
                ? "Approve"
                : approvalAction === "Reject"
                  ? "Reject"
                :  approvalAction === "More" ? "Request More Info for" : "Request for delegate"}{" "}
              this Supplier?
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm your action
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {approvalAction === "Request" && (
              <div className="space-y-2">
                <Label htmlFor="supplier-delegate-approver">
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
              <Label
                htmlFor="vendor-approval-comments"
                className="text-sm font-medium"
              >
                Comments <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="vendor-approval-comments"
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
                    remarks: approvalComments,
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
                approvalAction === "Approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : approvalAction === "Reject"
                    ? "bg-destructive hover:bg-destructive/90"
                    : approvalAction === "More"
                      ? "bg-orange-500 hover:bg-orange-600"
                      : "bg-blue-600 hover:bg-blue-700"
              }
              data-testid="button-approval-yes"
            >
              {(approvalActionMutation.isPending || delegateActionMutation.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              YES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApprovalChecklistDialog
        open={checklistDialogOpen}
        onOpenChange={setChecklistDialogOpen}
        moduleName="Vendor Registration"
        title="Supplier Approval Checklist"
        refNumber={vendorId}
        approving={approvalActionMutation.isPending}
        onApprove={(comments) => {
          setChecklistDialogOpen(false);
          approvalActionMutation.mutate({ action: "Approve", remarks: comments });
        }}
      />

      <Sheet open={showEvaluationDetails} onOpenChange={setShowEvaluationDetails}>
        <SheetContent side="right" className="w-[80vw] sm:max-w-[80vw] overflow-y-auto p-0 pt-10">
          {selectedPoNumber && selectedEvaluationId && (
            <EvaluationReview
              poNumber={selectedPoNumber}
              evaluationId={selectedEvaluationId}
              savedResponses={{ questions: [], comment: "" }}
              submittedResponse={() => {}}
              openResult={true}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
