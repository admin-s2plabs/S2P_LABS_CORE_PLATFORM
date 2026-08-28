import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getDialCodeByIso,
  getPhoneValidationMessage,
  PhoneInput,
  validatePhoneNumber,
} from "@/components/ui/phone-input";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAISettings } from "@/hooks/use-ai-settings";
import { formatDate } from "@/lib/common-functions";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DboSupplier } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FilePen,
  FileSpreadsheet,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Trophy,
  Sparkles,
  TrendingUp,
  Filter,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";

interface SupplierExportContactRow {
  supplier_id: number;
  company_name: string | null;
  contact_name: string | null;
  contact_category: string | null;
  contact_type: string | null;
  salutation: string | null;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  phone_ctry_code: string | null;
  areacode: string | null;
  mobile: string | null;
  mobile_ctry_code: string | null;
  fax: string | null;
  is_primary: string | null;
  is_auth_signatory: string | null;
}

interface SupplierExportBankRow {
  supplier_id: number;
  company_name: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_no: string | null;
  beneficiary_name: string | null;
  beneficiary_address: string | null;
  bank_address: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  postal_code: string | null;
  bank_account_type: string | null;
  currency: string | null;
  swift_code: string | null;
  iban_no: string | null;
  ifsccode: string | null;
  aba_routing: string | null;
  primary_account: string | null;
}

interface SupplierExportServiceRow {
  supplier_id: number;
  company_name: string | null;
  category_code: string | null;
  sub_category: string | null;
  sub_category_code: string | null;
  good_service_code: string | null;
  service_details: string | null;
  contact_details: string | null;
  dpworld_terminal: string | null;
  is_existing: string | null;
}

interface SuppliersResponse {
  data: (DboSupplier & { currentApprover: string | null })[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  statusCounts: Record<string, number>;
  exportContacts?: SupplierExportContactRow[];
  exportBanks?: SupplierExportBankRow[];
  exportServices?: SupplierExportServiceRow[];
}

interface OrgDetailsResponse {
  org_country?: string | null;
}

const statusConfig: Record<
  string,
  {
    variant: "default" | "secondary" | "destructive" | "outline";
    label: string;
    icon: any;
    className?: string;
  }
> = {
  Active: {
    variant: "default",
    label: "Active",
    icon: CheckCircle2,
    className: "bg-emerald-500",
  },
  Approved: {
    variant: "default",
    label: "Approved",
    icon: CheckCircle2,
    className: "bg-emerald-500",
  },
  Draft: { variant: "secondary", label: "Draft", icon: FileText },
  "Changes In Draft": {
    variant: "default",
    label: "Active",
    icon: CheckCircle2,
    className: "bg-emerald-500",
  },
  "Pending Approval": {
    variant: "outline",
    label: "Pending",
    icon: Clock,
    className: "border-orange-300 text-orange-600",
  },
  "More Info Required": {
    variant: "outline",
    label: "More Info",
    icon: Clock,
    className: "border-orange-300 text-orange-600",
  },
  Rejected: { variant: "destructive", label: "Rejected", icon: XCircle },
  ReSubmit: {
    variant: "outline",
    label: "Resubmit",
    icon: Clock,
    className: "border-orange-300 text-orange-600",
  },
  InActive: { variant: "secondary", label: "Inactive", icon: XCircle },
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

/** Wouter's useLocation() is pathname-only; real query string lives on window (see purchase-requests.tsx). */
function getVendorListSearchParams(locationPath: string): URLSearchParams {
  if (typeof window !== "undefined" && window.location.search) {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams(locationPath.split("?")[1] || "");
}

export default function VendorReview() {
  const [location] = useLocation();
  const urlSearch = useSearch();

  const queryParams = getVendorListSearchParams(location);
  const initialStatus = queryParams.get("status") || "all";
  const initialSearch = queryParams.get("search") || "";
  const initialPage = parseInt(queryParams.get("page") || "1", 10) || 1;
  const initialLimit = parseInt(queryParams.get("limit") || "10", 10) || 10;

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const { isAIEnabled } = useAISettings();
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [sortBy, setSortBy] = useState("id");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["BWR", "OTDR", "IC", "FR", "PC"]);
  const { toast } = useToast();
  const [isRankVisible, setIsRankVisible] = useState(false);

  // Sync filters when URL query changes (dashboard cards, browser back/forward, same path new search)
  useEffect(() => {
    const qp = getVendorListSearchParams(location);
    setSearch(qp.get("search") || "");
    setStatusFilter(qp.get("status") || "all");
    setPage(parseInt(qp.get("page") || "1", 10) || 1);
    setLimit(parseInt(qp.get("limit") || "10", 10) || 10);
  }, [location, urlSearch]);

  const emptyCreateForm = {
    companyName: "",
    address: "",
    legalEntityType: "",
    city: "",
    state: "",
    licenseNo: "",
    country: "",
    postalCode: "",
    placeOfIssue: "",
    incorporationDate: "",
    contactName: "",
    designation: "",
    emailId: "",
    mobileNo: "",
    bankName: "",
    beneficiaryName: "",
    bankAddress: "",
    bankCity: "",
    bankState: "",
    accountNo: "",
    confirmAccountNo: "",
    ifscCode: "",
    bankCountry: "",
    bankPostalCode: "",
    swiftCode: "",
  };
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const updateCreate = (field: string, value: string) =>
    setCreateForm((f) => ({ ...f, [field]: value }));

  const [inviteForm, setInviteForm] = useState({ companyName: "", email: "" });
  const [inviteAnyway, setInviteAnyway] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<any[] | null>(null);
  const [invSearch, setInvSearch] = useState("");
  const [invStatusFilter, setInvStatusFilter] = useState("all");
  const [invPage, setInvPage] = useState(1);

  const { data: countryOptions = [] } = useQuery<
    { value: string; label: string }[]
  >({
    queryKey: ["/api/countries"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/countries");
      if (!res.ok) throw new Error("Failed to fetch countries");
      return res.json();
    },
    select: (data: any[]) => data.map(c => ({
      value: c.key_2,
      label: c.description
    }))
  });

  const { data: legalEntityOptions = [] } = useQuery<
    { value: string; label: string }[]
  >({
    queryKey: ["/api/vendor/lookups/legal-entities"],
  });

  const { data: orgDetails } = useQuery<OrgDetailsResponse>({
    queryKey: ["/api/org-details"],
  });

  const defaultOrgCountryLabel = useMemo(() => {
    const orgCountry = (orgDetails?.org_country || "").trim();
    if (!orgCountry) return "";
    const byValue = countryOptions.find(
      (c) => c.value.toUpperCase() === orgCountry.toUpperCase(),
    );
    if (byValue) return byValue.label;
    const byLabel = countryOptions.find(
      (c) => c.label.toLowerCase() === orgCountry.toLowerCase(),
    );
    return byLabel?.label || "";
  }, [orgDetails?.org_country, countryOptions]);

  const defaultOrgPhoneDialCode = useMemo(() => {
    const orgCountry = (orgDetails?.org_country || "").trim();
    if (!orgCountry) return "+1";
    if (orgCountry.length === 2) return getDialCodeByIso(orgCountry.toUpperCase());
    const matched = countryOptions.find(
      (c) => c.label.toLowerCase() === orgCountry.toLowerCase(),
    );
    return getDialCodeByIso(matched?.value || "");
  }, [orgDetails?.org_country, countryOptions]);

  const selectedCreateCountryDialCode = useMemo(() => {
    const selectedLabel = (createForm.country || "").trim();
    if (!selectedLabel) return defaultOrgPhoneDialCode;
    const matched = countryOptions.find(
      (c) => c.label.toLowerCase() === selectedLabel.toLowerCase(),
    );
    return getDialCodeByIso(matched?.value || "");
  }, [createForm.country, countryOptions, defaultOrgPhoneDialCode]);

  const buildInitialCreateForm = () => ({
    ...emptyCreateForm,
    country: defaultOrgCountryLabel,
  });

  const runRankMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/supplier-rank/run");
      return res.json();
    },
    onSuccess: (data) => {
      setIsRankVisible(true);
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers"] });
      toast({
        title: "Ranking complete",
        description: `${data.count} suppliers ranked.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ranking failed",
        description: error.message || "Failed to run supplier ranking.",
        variant: "destructive",
      });
    },
  });

  const createSupplierMutation = useMutation({
    mutationFn: async (formData: typeof emptyCreateForm) => {
      const res = await apiRequest(
        "POST",
        "/api/dbo/suppliers/quick-create",
        formData,
      );
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Success",
          description: data.message || "Supplier created successfully",
        });
        setCreateSheetOpen(false);
        setCreateForm(buildInitialCreateForm());
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers"] });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to create supplier",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create supplier",
        variant: "destructive",
      });
    },
  });

  const listQueryParams = new URLSearchParams();
  if (statusFilter !== "all") {
    // const effectiveStatus = statusFilter === "Active"
    //   ? "Active,Changes In Draft"
    //   : statusFilter;
    listQueryParams.append("status", statusFilter);
  }
  if (search) listQueryParams.append("search", search);
  if (sortBy) listQueryParams.append("sortBy", sortBy);
  if (selectedMetrics.length > 0) listQueryParams.append("metrics", selectedMetrics.join(","));
  listQueryParams.append("page", page.toString());
  listQueryParams.append("limit", limit.toString());

  const { data: suppliersData, isLoading, refetch } = useQuery<SuppliersResponse>({
    queryKey: ["/api/dbo/suppliers", listQueryParams.toString()],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/dbo/suppliers?${listQueryParams.toString()}`
      ).then((res) => res.json()),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const suppliers = suppliersData?.data || [];
  const pagination = suppliersData?.pagination;
  const statusCounts = suppliersData?.statusCounts || {};
  const totalSuppliers = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const rankControlsDisabled = !isRankVisible || runRankMutation.isPending;
  const rankControlsTooltip = "Run AI Vendor Rank to enable sorting and KPI metrics.";

  const statCards = [
    {
      title: "Total Suppliers",
      value: totalSuppliers,
      icon: Building2,
      color: "text-primary",
      bgColor: "bg-primary/10",
      filterValue: "all",
    },
    {
      title: "Active",
      value: statusCounts["Active"] || 0,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      filterValue: "Active",
    },
    {
      title: "Draft",
      value: statusCounts["Draft"] || 0,
      icon: FileText,
      color: "text-slate-500",
      bgColor: "bg-slate-100 dark:bg-slate-800",
      filterValue: "Draft",
    },
    {
      title: "Pending Approval",
      value: statusCounts["Pending Approval"] || 0,
      icon: Clock,
      color: "text-orange-500",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      filterValue: "Pending Approval",
    },
    {
      title: "More Info Required",
      value: statusCounts["More Info Required"] || 0,
      icon: AlertTriangle,
      color: "text-amber-500",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      filterValue: "More Info Required",
    },
    {
      title: "Pending + info",
      value:
        (statusCounts["Pending Approval"] || 0) +
        (statusCounts["More Info Required"] || 0),
      icon: AlertTriangle,
      color: "text-amber-600",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      filterValue: "Pending Approval,More Info Required",
    },
    {
      title: "Changes In Draft",
      value: statusCounts["Changes In Draft"] || 0,
      icon: FilePen,
      color: "text-emerald-500",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      filterValue: "Changes In Draft",
    },
    {
      title: "Rejected",
      value: statusCounts["Rejected"] || 0,
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      filterValue: "Rejected",
    },
  ];

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleCreateSupplier = () => {
    if (
      !createForm.companyName ||
      !createForm.address ||
      !createForm.legalEntityType ||
      !createForm.city ||
      !createForm.country ||
      !createForm.postalCode ||
      !createForm.contactName ||
      !createForm.emailId ||
      !createForm.mobileNo
    ) {
      toast({
        title: "Validation Error",
        description: "Please fill in all mandatory fields",
        variant: "destructive",
      });
      return;
    }
    if (!validatePhoneNumber(createForm.mobileNo)) {
      toast({
        title: "Validation Error",
        description: getPhoneValidationMessage(createForm.mobileNo),
        variant: "destructive",
      });
      return;
    }
    if (
      createForm.accountNo &&
      createForm.confirmAccountNo &&
      createForm.accountNo !== createForm.confirmAccountNo
    ) {
      toast({
        title: "Validation Error",
        description: "Account Number and Confirm Account Number do not match",
        variant: "destructive",
      });
      return;
    }
    createSupplierMutation.mutate(createForm);
  };

  const invQueryString = (() => {
    const p = new URLSearchParams();
    if (invSearch) p.append("search", invSearch);
    if (invStatusFilter !== "all") p.append("status", invStatusFilter);
    p.append("page", invPage.toString());
    p.append("limit", "10");
    return p.toString();
  })();

  const { data: invitationsData, isLoading: invLoading } = useQuery<{
    data: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    statusCounts: Record<string, number>;
  }>({
    queryKey: [`/api/vendors/invitations?${invQueryString}`],
    enabled: inviteSheetOpen,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: {
      companyName: string;
      email: string;
      inviteAnyway: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/vendors/invitations", data);
      return res.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({ title: "Invitation Sent", description: result.message });
        setInviteForm({ companyName: "", email: "" });
        setInviteAnyway(false);
        setDuplicateWarning(null);
        queryClient.invalidateQueries({
          predicate: (query) =>
            (query.queryKey[0] as string)?.startsWith(
              "/api/vendors/invitations",
            ),
        });
      } else if (result.duplicates) {
        setDuplicateWarning(result.duplicates);
        toast({
          title: "Duplicate Found",
          description: result.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(
        "POST",
        `/api/vendors/invitations/${id}/resend`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation Resent" });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as string)?.startsWith("/api/vendors/invitations"),
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resendSupplierInvitationMutation = useMutation({
    mutationFn: async (supplierId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/dbo/suppliers/${supplierId}/resend-invitation`,
        {},
      );
      return res.json();
    },
    onSuccess: (result: { message?: string }) => {
      toast({
        title: "Invitation Resent",
        description: result.message || "Invitation email has been resent to the supplier.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers"] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as string)?.startsWith("/api/vendors/invitations"),
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resend invitation",
        variant: "destructive",
      });
    },
  });

  const [resetPasswordSupplier, setResetPasswordSupplier] = useState<DboSupplier | null>(null);

  const resetSupplierPasswordMutation = useMutation({
    mutationFn: async (supplierId: number) => {
      return apiRequest("POST", `/api/dbo/suppliers/${supplierId}/reset-password`, {});
    },
    onSuccess: async (res) => {
      const result = await res.json();
      toast({
        title: "Password Reset",
        description:
          result.message ||
          "Password reset email has been sent to the supplier user.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const [editingEmailId, setEditingEmailId] = useState<number | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState("");

  const updateEmailMutation = useMutation({
    mutationFn: async ({ id, email }: { id: number; email: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/vendors/invitations/${id}/email`,
        { email },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email Updated" });
      setEditingEmailId(null);
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as string)?.startsWith("/api/vendors/invitations"),
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(
        "POST",
        `/api/vendors/invitations/${id}/cancel`,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation Cancelled" });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as string)?.startsWith("/api/vendors/invitations"),
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEmailEditSave = (id: number) => {
    const trimmed = editingEmailValue.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    updateEmailMutation.mutate({ id, email: trimmed });
  };

  const handleInviteSubmit = () => {
    if (!inviteForm.companyName.trim() || !inviteForm.email.trim()) {
      toast({
        title: "Required",
        description: "Company name and email are required.",
        variant: "destructive",
      });
      return;
    }
    inviteMutation.mutate({
      companyName: inviteForm.companyName.trim(),
      email: inviteForm.email.trim(),
      inviteAnyway,
    });
  };

  const invStatusBadgeConfig: Record<
    string,
    {
      variant: "default" | "secondary" | "destructive" | "outline";
      className?: string;
    }
  > = {
    Active: { variant: "default", className: "bg-emerald-500" },
    "Account Created": { variant: "default", className: "bg-blue-500" },
    Initiated: {
      variant: "outline",
      className: "border-blue-300 text-blue-600",
    },
    "In Progress": {
      variant: "outline",
      className: "border-orange-300 text-orange-600",
    },
    "Pending Approval": {
      variant: "outline",
      className: "border-orange-300 text-orange-600",
    },
    Expired: { variant: "destructive" },
    Rejected: { variant: "destructive" },
    Cancelled: { variant: "secondary" },
  };

  const [isExporting, setIsExporting] = useState(false);

  const ynLabel = (v: string | null | undefined) =>
    v === "Y" || v === "y" || v === "1" ? "Yes" : v === "N" || v === "n" ? "No" : v || "";

  const formatExportDate = (value: Date | string | null | undefined) =>
    value ? formatDate(String(value)) : "";

  const formatIncorporationDate = (vendor: DboSupplier) =>
    vendor.startDate
      ? formatExportDate(vendor.startDate)
      : vendor.busTradingDate
        ? formatExportDate(vendor.busTradingDate)
        : "";

  const formatAnnualTurnover = (vendor: DboSupplier) =>
    vendor.annualTurnOver
      ? `${vendor.turnOverCurrency || ""} ${vendor.annualTurnOver}`.trim()
      : "";

  const formatWorkingDays = (vendor: DboSupplier) =>
    vendor.workingdayStart && vendor.workingdayEnd
      ? `${vendor.workingdayStart} - ${vendor.workingdayEnd}`
      : "";

  const formatWorkingHours = (vendor: DboSupplier) =>
    vendor.workingTimeStartTime && vendor.workingTimeEndTime
      ? `${vendor.workingTimeStartTime} - ${vendor.workingTimeEndTime}`
      : "";

  const fetchExportData = async (): Promise<SuppliersResponse> => {
    const params = buildSupplierFilterParams({ page: 1, limit: 0 });
    params.set("exportDetails", "true");
    const res = await apiRequest("GET", `/api/dbo/suppliers?${params.toString()}`);
    return res.json();
  };

  const mapSupplierSummaryRow = (vendor: DboSupplier) => ({
    "Ref No": vendor.id ?? "",
    "Supplier Name": vendor.companyName || "",
    Status: vendor.status || "",
    Country: vendor.country || "",
    City: vendor.city || "",
    State: vendor.state || "",
    Address: vendor.address1 || "",
    "Postal Code": vendor.postalcode || "",
    "Contact Email": vendor.emailId || "",
    "Contact No": vendor.phone || "",
    Website: vendor.webAddress || "",
    "License Number": vendor.licenseNo || "",
    "Place of Issue": vendor.placeOfIssue || "",
    "Business Expiry Date": formatExportDate(vendor.expiryDate),
    "Legal Entity Type": vendor.legalEntityType || vendor.typeOfCompany || "",
    "PAN No (Company)": vendor.panNo || "",
    "Incorporation Date": formatIncorporationDate(vendor),
    "Annual Turn Over": formatAnnualTurnover(vendor),
    "Working Days": formatWorkingDays(vendor),
    "Working Hours": formatWorkingHours(vendor),
    "GST/VAT Registration No": vendor.taxRegNo || "",
    "Payment Terms": vendor.paymentTerms || "",
    "Tax Identification No (TIN)": vendor.taxPayerId || "",
    "Tax Effective Date": formatExportDate(vendor.taxEffectiveDate),
    "Created By": vendor.createdBy || "",
    "Created Date": formatExportDate(vendor.creationDate),
  });

  const mapContactExportRow = (row: SupplierExportContactRow) => ({
    "Ref No": row.supplier_id ?? "",
    "Supplier Name": row.company_name || "",
    "Contact Name": row.contact_name || "",
    Category: row.contact_category || "",
    Type: row.contact_type || "",
    Salutation: row.salutation || "",
    Designation: row.designation || "",
    Department: row.department || "",
    Email: row.email || "",
    Phone: row.phone || "",
    "Phone Country Code": row.phone_ctry_code || "",
    "Area Code": row.areacode || "",
    Mobile: row.mobile || "",
    "Mobile Country Code": row.mobile_ctry_code || "",
    Fax: row.fax || "",
    Primary: ynLabel(row.is_primary),
    "Auth Signatory": ynLabel(row.is_auth_signatory),
  });

  const mapBankExportRow = (row: SupplierExportBankRow) => ({
    "Ref No": row.supplier_id ?? "",
    "Supplier Name": row.company_name || "",
    "Bank Name": row.bank_name || "",
    Branch: row.branch_name || "",
    "Account No": row.account_no || "",
    "Beneficiary Name": row.beneficiary_name || "",
    "Beneficiary Address": row.beneficiary_address || "",
    "Bank Address": row.bank_address || "",
    City: row.city || "",
    Country: row.country || "",
    Region: row.region || "",
    "Postal Code": row.postal_code || "",
    "Account Type": row.bank_account_type || "",
    Currency: row.currency || "",
    "SWIFT Code": row.swift_code || "",
    IBAN: row.iban_no || "",
    IFSC: row.ifsccode || "",
    "ABA Routing": row.aba_routing || "",
    "Primary Account": ynLabel(row.primary_account),
  });

  const mapServiceExportRow = (row: SupplierExportServiceRow) => ({
    "Ref No": row.supplier_id ?? "",
    "Supplier Name": row.company_name || "",
    "Category Code": row.category_code || "",
    "Sub Category": row.sub_category || "",
    "Sub Category Code": row.sub_category_code || "",
    "Good/Service Code": row.good_service_code || "",
    "Service Details": row.service_details || "",
    "Contact Details": row.contact_details || "",
    "DP World Terminal": row.dpworld_terminal || "",
    Existing: ynLabel(row.is_existing),
  });

  const getExportPayload = async () => {
    const result = await fetchExportData();
    const suppliers = result.data || [];
    const supplierIds = new Set(suppliers.map((s) => Number(s.id)));
    const summaryRows = suppliers.map(mapSupplierSummaryRow);
    const contactRows = (result.exportContacts ?? [])
      .filter((r) => supplierIds.has(Number(r.supplier_id)))
      .map(mapContactExportRow);
    const bankRows = (result.exportBanks ?? [])
      .filter((r) => supplierIds.has(Number(r.supplier_id)))
      .map(mapBankExportRow);
    const serviceRows = (result.exportServices ?? [])
      .filter((r) => supplierIds.has(Number(r.supplier_id)))
      .map(mapServiceExportRow);
    return { summaryRows, contactRows, bankRows, serviceRows };
  };

  const exportFileDate = () => new Date().toISOString().split("T")[0];

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      const { summaryRows, contactRows, bankRows, serviceRows } =
        await getExportPayload();
      if (summaryRows.length === 0) {
        toast({
          title: "No data to export",
          description: "No suppliers match the current filters.",
          variant: "destructive",
        });
        return;
      }
      const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
      const block = (rows: Record<string, string | number>[]) => {
        if (rows.length === 0) return "";
        const headers = Object.keys(rows[0]);
        return [
          headers.join(","),
          ...rows.map((row) =>
            headers.map((h) => esc(String(row[h] ?? ""))).join(","),
          ),
        ].join("\n");
      };
      const section = (
        title: string,
        rows: Record<string, string | number>[],
      ) => [title, rows.length > 0 ? block(rows) : "(No records)"].join("\n");
      const csv = [
        block(summaryRows),
        "",
        section("Contacts", contactRows),
        "",
        section("Bank details", bankRows),
        "",
        section("Scope of supply / service", serviceRows),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `suppliers_${exportFileDate()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported to CSV" });
    } catch (err) {
      toast({
        title: "Export failed",
        description:
          err instanceof Error ? err.message : "Could not export suppliers",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToXLS = async () => {
    setIsExporting(true);
    try {
      const { summaryRows, contactRows, bankRows, serviceRows } =
        await getExportPayload();
      if (summaryRows.length === 0) {
        toast({
          title: "No data to export",
          description: "No suppliers match the current filters.",
          variant: "destructive",
        });
        return;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(summaryRows),
        "Suppliers",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          contactRows.length > 0 ? contactRows : [{ Note: "No contacts" }],
        ),
        "Contacts",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          bankRows.length > 0 ? bankRows : [{ Note: "No bank details" }],
        ),
        "Bank details",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          serviceRows.length > 0
            ? serviceRows
            : [{ Note: "No scope of supply records" }],
        ),
        "Scope of supply",
      );
      XLSX.writeFile(wb, `suppliers_${exportFileDate()}.xlsx`);
      toast({ title: "Exported to Excel" });
    } catch (err) {
      toast({
        title: "Export failed",
        description:
          err instanceof Error ? err.message : "Could not export suppliers",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const { summaryRows } = await getExportPayload();
      if (summaryRows.length === 0) {
        toast({
          title: "No data to export",
          description: "No suppliers match the current filters.",
          variant: "destructive",
        });
        return;
      }
      const columns = [
        "Ref No",
        "Supplier Name",
        "Status",
        "Legal Entity Type",
        "Country",
        "License Number",
        "GST/VAT Registration No",
        "Contact Email",
        "Website",
      ];
      const rows = summaryRows.map((d) =>
        columns.map((col) => String(d[col as keyof typeof d] ?? "")),
      );
      generateTablePdf({
        title: "Suppliers",
        subtitle: [
          statusFilter !== "all" ? `Status: ${statusFilter}` : null,
          search.trim() ? `Search: ${search.trim()}` : null,
          "Includes contacts, bank details, and scope in CSV/Excel export",
        ]
          .filter(Boolean)
          .join(" | ") || "All suppliers",
        columns,
        rows,
        filename: `suppliers_${exportFileDate()}`,
      });
      toast({ title: "Exported to PDF" });
    } catch (err) {
      toast({
        title: "Export failed",
        description:
          err instanceof Error ? err.message : "Could not export suppliers",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            Suppliers
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your supplier database
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAIEnabled('AI_SUPPLIER_RANK') && (
            <Button
              size="sm"
              variant="outline"
              className="text-primary border-primary/20 hover:bg-primary/5 gap-1.5"
              onClick={() => runRankMutation.mutate()}
              disabled={runRankMutation.isPending}
            >
              {runRankMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {runRankMutation.isPending ? "Ranking..." : "Ai Supplier Rank"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setInviteSheetOpen(true)}
            data-testid="button-invite-supplier"
          >
            <Send className="h-4 w-4 mr-1" />
            Invite Supplier
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setCreateForm(buildInitialCreateForm());
              setCreateSheetOpen(true);
            }}
            data-testid="button-create-supplier"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Supplier
          </Button>
        </div>

        <Sheet
          open={inviteSheetOpen}
          onOpenChange={(open) => {
            setInviteSheetOpen(open);
            if (!open) {
              setInviteForm({ companyName: "", email: "" });
              setInviteAnyway(false);
              setDuplicateWarning(null);
              setInvSearch("");
              setInvStatusFilter("all");
              setInvPage(1);
            }
          }}
        >
          <SheetContent
            className="w-[60vw] sm:max-w-[60vw] overflow-y-auto p-4"
            data-testid="sheet-invite-supplier"
          >
            <SheetHeader className="space-y-0 pb-1">
              <SheetTitle className="text-base">Invite Suppliers</SheetTitle>
              <p className="text-xs text-muted-foreground text-right">
                * indicates mandatory fields
              </p>
            </SheetHeader>

            <form onSubmit={(e) => {
              e.preventDefault();
              handleInviteSubmit();
            }}>
              <div className="space-y-4 mt-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm" htmlFor="inv-company">
                      Supplier Company Name{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="inv-company"
                      placeholder="Enter company name"
                      value={inviteForm.companyName}
                      onChange={(e) =>
                        setInviteForm((f) => ({
                          ...f,
                          companyName: e.target.value,
                        }))
                      }
                      data-testid="input-invite-company"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm" htmlFor="inv-email">
                      Email Id <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="inv-email"
                      type="email"
                      placeholder="supplier@company.com"
                      value={inviteForm.email}
                      onChange={(e) =>
                        setInviteForm((f) => ({ ...f, email: e.target.value }))
                      }
                      data-testid="input-invite-email"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="invite-anyway"
                    checked={inviteAnyway}
                    onCheckedChange={(c) => setInviteAnyway(c === true)}
                    data-testid="checkbox-invite-anyway"
                  />
                  <Label htmlFor="invite-anyway" className="cursor-pointer">
                    Invite Anyway
                  </Label>
                </div>

                {duplicateWarning && duplicateWarning.length > 0 && (
                  <div
                    className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm"
                    data-testid="alert-duplicate-warning"
                  >
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium mb-1">
                        Duplicate invitations found:
                      </p>
                      {duplicateWarning.map((d: any, idx: number) => {
                        const sourceLabel =
                          d.source === "user"
                            ? "Existing User"
                            : d.source === "organization"
                              ? "Existing Organization"
                              : d.source === "supplier"
                                ? "Registered Supplier"
                                : d.source === "supplier_pattern"
                                  ? "Similar Supplier"
                                  : d.source === "invitation"
                                    ? "Existing Invitation"
                                    : d.source === "invitation_pattern"
                                      ? "Similar Invitation"
                                      : "Match";
                        return (
                          <p key={`${d.source}-${d.id || d.email_id || idx}`}>
                            [{sourceLabel}] {d.company_name}
                            {d.email_id ? ` (${d.email_id})` : ""} - {d.status}
                          </p>
                        );
                      })}
                      <p className="mt-1 text-muted-foreground">
                        Check &quot;Invite Anyway&quot; to proceed.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button
                    type="reset"
                    variant="outline"
                    onClick={() => setInviteSheetOpen(false)}
                    data-testid="button-cancel-invite"
                  >
                    CANCEL
                  </Button>
                  <Button
                    type="submit"
                    disabled={inviteMutation.isPending}
                    data-testid="button-send-invite"
                  >
                    {inviteMutation.isPending && (
                      <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                    )}
                    INVITE
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-6 pt-4 border-t space-y-3">
              <div>
                <h3 className="text-sm font-semibold">List of Invitations</h3>
                <p className="text-xs text-muted-foreground">
                  Browse and manage all invitations sent for suppliers.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ID, name, email..."
                    value={invSearch}
                    onChange={(e) => {
                      setInvSearch(e.target.value);
                      setInvPage(1);
                    }}
                    className="pl-9"
                    data-testid="input-invite-search"
                  />
                </div>
                <Select
                  value={invStatusFilter}
                  onValueChange={(v) => {
                    setInvStatusFilter(v);
                    setInvPage(1);
                  }}
                >
                  <SelectTrigger
                    className="w-[180px]"
                    data-testid="select-invite-status"
                  >
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Account Created">
                      Account Created
                    </SelectItem>
                    <SelectItem value="Initiated">Initiated</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Pending Approval">
                      Pending Approval
                    </SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {invLoading ? (
                <div className="space-y-2 pt-2">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2 border-b"
                    >
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  ))}
                </div>
              ) : !invitationsData?.data?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Mail className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No invitations found
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-md">
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 text-xs font-medium w-[90px]">
                          Inv. ID
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">
                          Supplier Name
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">
                          Email Id
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          Inv. Date
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[130px]">
                          Status
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[60px] text-center">
                          Count
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitationsData.data.map((inv: any) => {
                        const badgeConf = invStatusBadgeConfig[inv.status] || {
                          variant: "secondary" as const,
                        };
                        return (
                          <TableRow
                            key={inv.id}
                            data-testid={`invitation-row-${inv.id}`}
                          >
                            <TableCell className="py-1.5 text-sm font-mono truncate">
                              {inv.id}
                            </TableCell>
                            <TableCell
                              className="py-1.5 text-sm truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {inv.company_name || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{inv.company_name || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="py-1.5 text-sm truncate">
                              {editingEmailId === inv.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editingEmailValue}
                                    onChange={(e) =>
                                      setEditingEmailValue(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        handleEmailEditSave(inv.id);
                                      if (e.key === "Escape")
                                        setEditingEmailId(null);
                                    }}
                                    className="h-7 text-sm"
                                    autoFocus
                                    data-testid={`input-edit-email-${inv.id}`}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => handleEmailEditSave(inv.id)}
                                    disabled={updateEmailMutation.isPending}
                                    data-testid={`button-save-email-${inv.id}`}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => setEditingEmailId(null)}
                                    data-testid={`button-cancel-email-${inv.id}`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <span
                                  className="cursor-pointer"
                                  onDoubleClick={() => {
                                    setEditingEmailId(inv.id);
                                    setEditingEmailValue(inv.email_id || "");
                                  }}
                                  data-testid={`text-email-${inv.id}`}
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-sm block truncate max-w-[180px] cursor-default">
                                        {inv.email_id || "-"}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p>{inv.email_id || "-"}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-1.5 text-sm">
                              {inv.invitation_date
                                ? formatDate(
                                  inv.invitation_date,
                                )
                                : "-"}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Badge
                                variant={badgeConf.variant}
                                className={badgeConf.className || ""}
                              >
                                {inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-1.5 text-sm text-center">
                              {inv.resend_count ?? 0}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {inv.status === "Initiated" && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      data-testid={`button-actions-${inv.id}`}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() =>
                                        resendMutation.mutate(inv.id)
                                      }
                                      disabled={resendMutation.isPending}
                                      data-testid={`button-resend-${inv.id}`}
                                    >
                                      <RefreshCw className="h-4 w-4 mr-2" />
                                      Resend
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        cancelInvitationMutation.mutate(inv.id)
                                      }
                                      disabled={
                                        cancelInvitationMutation.isPending
                                      }
                                      className="text-destructive"
                                      data-testid={`button-cancel-inv-${inv.id}`}
                                    >
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Cancel
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              {inv.status === "Expired" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => resendMutation.mutate(inv.id)}
                                  disabled={resendMutation.isPending}
                                  title="Resend Invitation"
                                  data-testid={`button-resend-${inv.id}`}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {invitationsData?.pagination && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-muted-foreground">
                    {invitationsData.pagination.total > 0
                      ? `${(invitationsData.pagination.page - 1) * invitationsData.pagination.limit + 1}-${Math.min(invitationsData.pagination.page * invitationsData.pagination.limit, invitationsData.pagination.total)} of ${invitationsData.pagination.total}`
                      : "0 results"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setInvPage((p) => Math.max(1, p - 1))}
                      disabled={invitationsData.pagination.page <= 1}
                      data-testid="button-inv-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      {invitationsData.pagination.page}/
                      {invitationsData.pagination.totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setInvPage((p) =>
                          Math.min(
                            invitationsData.pagination.totalPages,
                            p + 1,
                          ),
                        )
                      }
                      disabled={
                        invitationsData.pagination.page >=
                        invitationsData.pagination.totalPages
                      }
                      data-testid="button-inv-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card
            key={stat.title}
            className={`hover-elevate cursor-pointer transition-all ${statusFilter === stat.filterValue
                ? "ring-primary border-primary bg-primary/5"
                : ""
              }`}
            onClick={() => handleStatusChange(stat.filterValue)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, name, type, status, country..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger
                  className="w-[140px] h-8 text-sm"
                  data-testid="select-status"
                >
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status ({totalSuppliers})</SelectItem>
                  <SelectItem value="Active">Active ({statusCounts["Active"] || 0})</SelectItem>
                  <SelectItem value="Draft">Draft ({statusCounts["Draft"] || 0})</SelectItem>
                  <SelectItem value="Pending Approval">Pending ({statusCounts["Pending Approval"] || 0})</SelectItem>
                  <SelectItem value="More Info Required">
                    More info ({statusCounts["More Info Required"] || 0})
                  </SelectItem>
                  <SelectItem value="Pending Approval,More Info Required">
                    Pending & more info (
                    {(statusCounts["Pending Approval"] || 0) +
                      (statusCounts["More Info Required"] || 0)}
                    )
                  </SelectItem>
                  <SelectItem value="Changes In Draft">Changes In Draft ({statusCounts["Changes In Draft"] || 0})</SelectItem>
                  <SelectItem value="Rejected">Rejected ({statusCounts["Rejected"] || 0})</SelectItem>
                </SelectContent>
              </Select>

              {isAIEnabled('AI_SUPPLIER_RANK') && (
                <>
                  {rankControlsDisabled ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Select value={sortBy} onValueChange={setSortBy} disabled={rankControlsDisabled}>
                            <SelectTrigger className="w-fit min-w-[160px] h-8 text-sm" data-testid="select-sort-by">
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-3.5 w-3.5" />
                                <SelectValue placeholder="Sort by" />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="id">ID (Default)</SelectItem>
                              <SelectItem value="rank_asc">High to Low (Rank)</SelectItem>
                              <SelectItem value="rank_desc">Low to High (Rank)</SelectItem>
                            </SelectContent>
                          </Select>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {rankControlsTooltip}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Select value={sortBy} onValueChange={setSortBy} disabled={rankControlsDisabled}>
                      <SelectTrigger className="w-fit min-w-[160px] h-8 text-sm" data-testid="select-sort-by">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-3.5 w-3.5" />
                          <SelectValue placeholder="Sort by" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="id">ID (Default)</SelectItem>
                        <SelectItem value="rank_asc">High to Low (Rank)</SelectItem>
                        <SelectItem value="rank_desc">Low to High (Rank)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {rankControlsDisabled ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-sm gap-2"
                            data-testid="button-metrics-filter"
                            disabled={rankControlsDisabled}
                          >
                            <Filter className="h-3.5 w-3.5" />
                            Metrics ({selectedMetrics.length})
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {rankControlsTooltip}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-sm gap-2"
                          data-testid="button-metrics-filter"
                          disabled={rankControlsDisabled}
                        >
                          <Filter className="h-3.5 w-3.5" />
                          Metrics ({selectedMetrics.length})
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <div className="p-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-2 px-2">Active KPI Metrics</p>
                          {["BWR", "OTDR", "IC", "FR", "PC"].map((metric) => (
                            <div
                              key={metric}
                              className="flex items-center space-x-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm"
                              onClick={() => {
                                setSelectedMetrics(prev => 
                                  prev.includes(metric) 
                                    ? prev.filter(m => m !== metric)
                                    : [...prev, metric]
                                );
                              }}
                            >
                              <Checkbox checked={selectedMetrics.includes(metric)} />
                              <span className="text-sm">
                                {metric === "BWR" && "Bid Win Rate"}
                                {metric === "OTDR" && "On-Time Delivery Ratio"}
                                {metric === "IC" && "Issue Count"}
                                {metric === "FR" && "Fulfillment Rate"}
                                {metric === "PC" && "Price Competitiveness"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}

              {/* Export Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={isExporting}
                    data-testid="button-export-menu"
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    {isExporting ? "Exporting..." : "Export"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={exportToPDF}
                    data-testid="menu-export-pdf"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportToXLS}
                    data-testid="menu-export-xls"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as XLS
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportToCSV}
                    data-testid="menu-export-csv"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          ) : suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <h3 className="text-base font-medium mb-1">No supplier found</h3>
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "No supplier applications yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-medium w-[80px]">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        ID
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        Name
                      </span>
                    </TableHead>
                    {isAIEnabled('AI_SUPPLIER_RANK') && isRankVisible && (
                      <TableHead className="text-xs font-medium w-[100px]">
                        <span className="flex items-center gap-1.5">
                          <Trophy className="h-3.5 w-3.5" />
                          Rank
                        </span>
                      </TableHead>
                    )}
                    <TableHead className="text-xs font-medium w-[100px]">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Status
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium hidden lg:table-cell">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                        Current Approver
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium hidden md:table-cell">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Type
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium hidden lg:table-cell">
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" />
                        Country
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium hidden xl:table-cell">
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium hidden xl:table-cell">
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        Contact No
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium hidden lg:table-cell">
                      <span className="flex items-center gap-1.5">
                        <UserPlus className="h-3.5 w-3.5" />
                        Created By
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium hidden lg:table-cell">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                        Registered
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[90px]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow
                      key={supplier.id}
                      className="cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/app/vendors/${supplier.id}`)
                      }
                      data-testid={`vendor-row-${supplier.id}`}
                    >
                      <TableCell className="font-mono text-sm font-medium text-primary py-2">
                        {supplier.supplierId}
                      </TableCell>
                      <TableCell
                        className="text-sm py-2 max-w-[180px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[180px] cursor-default">
                              {supplier.companyName || "Unknown"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{supplier.companyName || "Unknown"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      {isAIEnabled('AI_SUPPLIER_RANK') && isRankVisible && (
                        <TableCell className="py-2">
                          {((supplier as any).rank && (supplier.status === 'Active' || supplier.status === 'Approved')) ? (
                            <Badge variant="outline" className="font-bold border-primary/30 text-primary bg-primary/5">
                              #{ (supplier as any).rank }
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="py-2">
                        <StatusBadge status={supplier.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm py-2 max-w-[120px] truncate">
                        {supplier.currentApprover || "-"}
                      </TableCell>
                      <TableCell
                        className="hidden md:table-cell text-sm py-2 max-w-[120px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[120px] cursor-default">
                              {supplier.legalEntityType || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{supplier.legalEntityType || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        className="hidden lg:table-cell text-sm py-2 max-w-[100px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[100px] cursor-default">
                              {supplier.country || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{supplier.country || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        className="hidden xl:table-cell text-sm py-2 max-w-[180px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[180px] cursor-default">
                              {supplier.emailId || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{supplier.emailId || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        className="hidden xl:table-cell text-sm py-2 max-w-[120px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[120px] cursor-default">
                              {supplier.phone || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{supplier.phone || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        className="hidden lg:table-cell text-sm py-2 text-muted-foreground max-w-[100px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[100px] cursor-default">
                              {supplier.createdBy || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{supplier.createdBy || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell py-2">
                        {supplier.userRegistered === "Yes" ? (
                          <Badge variant="default" className="bg-emerald-500">
                            Yes
                          </Badge>
                        ) : supplier.userRegistered === "No" ? (
                          <Badge variant="secondary">No</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell
                        className="py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              resendSupplierInvitationMutation.mutate(supplier.id)
                            }
                            disabled={
                              resendSupplierInvitationMutation.isPending ||
                              supplier.userRegistered === "Yes"
                            }
                            title={
                              supplier.userRegistered === "Yes"
                                ? "Supplier already registered"
                                : "Resend Invitation"
                            }
                            data-testid={`button-resend-invitation-${supplier.id}`}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setResetPasswordSupplier(supplier)}
                            disabled={
                              resetSupplierPasswordMutation.isPending ||
                              supplier.userRegistered !== "Yes"
                            }
                            title={
                              supplier.userRegistered !== "Yes"
                                ? "Supplier must be registered to reset password"
                                : "Reset Password"
                            }
                            data-testid={`button-reset-password-${supplier.id}`}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {pagination && (
            <div className="flex items-center justify-between border-t px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Rows per page:
                </span>
                <Select
                  value={limit.toString()}
                  onValueChange={(v) => {
                    setLimit(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className="h-7 w-16 text-xs"
                    data-testid="select-rows-per-page"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {pagination.total > 0
                    ? `${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total.toLocaleString()}`
                    : "0 results"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs px-1">
                  {pagination.page}/{pagination.totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={pagination.page >= pagination.totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={createSheetOpen}
        onOpenChange={(open) => {
          setCreateSheetOpen(open);
          if (!open) setCreateForm(buildInitialCreateForm());
        }}
      >
        <SheetContent
          className="w-[60vw] sm:max-w-[60vw] overflow-y-auto"
          side="right"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateSupplier();
            }}
          >
            <SheetHeader>
              <SheetTitle>Create Supplier</SheetTitle>
              <SheetDescription>
                Add a new supplier with organization, contact, and banking
                details.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-4">
              <div>
                <h3 className="text-sm font-semibold mb-3">
                  Organization Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>
                      Company Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Enter company name"
                      value={createForm.companyName}
                      onChange={(e) =>
                        updateCreate("companyName", e.target.value)
                      }
                      data-testid="input-create-company-name"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>
                      Legal Entity Type{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={createForm.legalEntityType}
                      onValueChange={(v) => updateCreate("legalEntityType", v)}
                    >
                      <SelectTrigger data-testid="select-create-legal-entity">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {legalEntityOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label>
                      Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Enter address"
                      value={createForm.address}
                      onChange={(e) => updateCreate("address", e.target.value)}
                      data-testid="input-create-address"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>
                      City <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Enter city"
                      value={createForm.city}
                      onChange={(e) => updateCreate("city", e.target.value)}
                      data-testid="input-create-city"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>State</Label>
                    <Input
                      placeholder="Enter state"
                      value={createForm.state}
                      onChange={(e) => updateCreate("state", e.target.value)}
                      data-testid="input-create-state"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>
                      Country <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={createForm.country}
                      onValueChange={(v) => updateCreate("country", v)}
                    >
                      <SelectTrigger data-testid="select-create-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {countryOptions.map((c) => (
                          <SelectItem key={c.label} value={c.label}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>
                      Postal Code <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Enter postal code"
                      value={createForm.postalCode}
                      onChange={(e) => updateCreate("postalCode", e.target.value)}
                      data-testid="input-create-postal-code"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>License No</Label>
                    <Input
                      placeholder="Enter license number"
                      value={createForm.licenseNo}
                      onChange={(e) => updateCreate("licenseNo", e.target.value)}
                      data-testid="input-create-license-no"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Place of Issue</Label>
                    <Input
                      placeholder="Enter place of issue"
                      value={createForm.placeOfIssue}
                      onChange={(e) =>
                        updateCreate("placeOfIssue", e.target.value)
                      }
                      data-testid="input-create-place-of-issue"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Incorporation Date</Label>
                    <Input
                      type="date"
                      value={createForm.incorporationDate}
                      onChange={(e) =>
                        updateCreate("incorporationDate", e.target.value)
                      }
                      data-testid="input-create-incorporation-date"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3">Contact Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>
                      Contact Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Enter contact name"
                      value={createForm.contactName}
                      onChange={(e) =>
                        updateCreate("contactName", e.target.value)
                      }
                      data-testid="input-create-contact-name"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Designation</Label>
                    <Input
                      placeholder="Enter designation"
                      value={createForm.designation}
                      onChange={(e) =>
                        updateCreate("designation", e.target.value)
                      }
                      data-testid="input-create-designation"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="email"
                      placeholder="supplier@company.com"
                      value={createForm.emailId}
                      onChange={(e) => updateCreate("emailId", e.target.value)}
                      data-testid="input-create-email"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>
                      Mobile No <span className="text-destructive">*</span>
                    </Label>
                    <PhoneInput
                      value={createForm.mobileNo}
                      onChange={(v) => updateCreate("mobileNo", v)}
                      defaultCountryCode={selectedCreateCountryDialCode}
                      data-testid="input-create-mobile"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3">
                  Bank Details{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    (Optional)
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>Bank Name</Label>
                    <Input
                      placeholder="Enter bank name"
                      value={createForm.bankName}
                      onChange={(e) => updateCreate("bankName", e.target.value)}
                      data-testid="input-create-bank-name"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Beneficiary Name</Label>
                    <Input
                      placeholder="Enter beneficiary name"
                      value={createForm.beneficiaryName}
                      onChange={(e) =>
                        updateCreate("beneficiaryName", e.target.value)
                      }
                      data-testid="input-create-beneficiary-name"
                    />
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label>Bank Address</Label>
                    <Input
                      placeholder="Enter bank address"
                      value={createForm.bankAddress}
                      onChange={(e) =>
                        updateCreate("bankAddress", e.target.value)
                      }
                      data-testid="input-create-bank-address"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bank City</Label>
                    <Input
                      placeholder="Enter bank city"
                      value={createForm.bankCity}
                      onChange={(e) => updateCreate("bankCity", e.target.value)}
                      data-testid="input-create-bank-city"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bank State</Label>
                    <Input
                      placeholder="Enter bank state"
                      value={createForm.bankState}
                      onChange={(e) => updateCreate("bankState", e.target.value)}
                      data-testid="input-create-bank-state"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Account No</Label>
                    <Input
                      placeholder="Enter account number"
                      value={createForm.accountNo}
                      onChange={(e) => updateCreate("accountNo", e.target.value)}
                      data-testid="input-create-account-no"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Confirm Account No</Label>
                    <Input
                      placeholder="Re-enter account number"
                      value={createForm.confirmAccountNo}
                      onChange={(e) =>
                        updateCreate("confirmAccountNo", e.target.value)
                      }
                      data-testid="input-create-confirm-account-no"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>IFSC Code</Label>
                    <Input
                      placeholder="Enter IFSC code"
                      value={createForm.ifscCode}
                      onChange={(e) => updateCreate("ifscCode", e.target.value)}
                      data-testid="input-create-ifsc-code"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>SWIFT Code</Label>
                    <Input
                      placeholder="Enter SWIFT code"
                      value={createForm.swiftCode}
                      onChange={(e) => updateCreate("swiftCode", e.target.value)}
                      data-testid="input-create-swift-code"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bank Country</Label>
                    <Select
                      value={createForm.bankCountry}
                      onValueChange={(v) => updateCreate("bankCountry", v)}
                    >
                      <SelectTrigger data-testid="select-create-bank-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {countryOptions.map((c) => (
                          <SelectItem key={c.label} value={c.label}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bank Postal Code</Label>
                    <Input
                      placeholder="Enter postal code"
                      value={createForm.bankPostalCode}
                      onChange={(e) =>
                        updateCreate("bankPostalCode", e.target.value)
                      }
                      data-testid="input-create-bank-postal-code"
                    />
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateSheetOpen(false);
                  setCreateForm(buildInitialCreateForm());
                }}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createSupplierMutation.isPending}
                data-testid="button-submit-create"
              >
                {createSupplierMutation.isPending
                  ? "Creating..."
                  : "Create Supplier"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!resetPasswordSupplier}
        onOpenChange={(open) => !open && setResetPasswordSupplier(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset the password for{" "}
              <span className="font-medium text-foreground">
                {resetPasswordSupplier?.companyName ||
                  resetPasswordSupplier?.emailId}
              </span>
              ? A password reset link will be emailed to the supplier user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset-supplier-password">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetPasswordSupplier) {
                  resetSupplierPasswordMutation.mutate(resetPasswordSupplier.id);
                  setResetPasswordSupplier(null);
                }
              }}
              disabled={resetSupplierPasswordMutation.isPending}
              data-testid="button-confirm-reset-supplier-password"
            >
              {resetSupplierPasswordMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function buildSupplierFilterParams({ page, limit }: { page: number; limit: number }) {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  params.set("page", String(page));
  params.set("limit", String(limit));
  return params;
}
