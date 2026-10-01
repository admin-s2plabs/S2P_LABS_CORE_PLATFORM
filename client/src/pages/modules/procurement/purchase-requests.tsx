import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSheet } from "@/components/form-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

interface RequisitionHeader {
  pr_number: string;
  pr_description: string | null;
  pr_status: string | null;
  pr_type: string | null;
  pr_amount: string | number | null;
  currency: string | null;
  department_name: string | null;
  requestor_name: string | null;
  pr_owner_name: string | null;
  pr_created_date: string | null;
  approved_date: string | null;
  delivertto_location_name: string | null;
  delivery_date: string | null;
  po_number: string | null;
  notes: string | null;
  budget_name: string | null;
  budgeted: boolean | null;
  estimated_cost: string | null;
  creation_date: string | null;
  bidno: number | null;
  all_lines_have_po?: boolean | null;
  contract_refs?: string | null;
  all_lines_have_contract?: boolean | null;
  currentApprover: string | null;
}

interface RequisitionsResponse {
  data: RequisitionHeader[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  exportLines?: PrExportLineRow[];
}

interface PrExportLineRow {
  pr_number: string;
  pr_description: string | null;
  pr_status: string | null;
  pr_type: string | null;
  header_pr_amount: string | number | null;
  header_currency: string | null;
  department_name: string | null;
  requestor_name: string | null;
  pr_owner_name: string | null;
  pr_created_date: string | null;
  delivery_date: string | null;
  delivertto_location_name: string | null;
  po_number: string | null;
  budget_name: string | null;
  line_id: number;
  line_number: number | null;
  line_item_description: string | null;
  line_qty: string | number | null;
  line_uom: string | null;
  line_unit_cost: string | number | null;
  line_amount: string | number | null;
  line_currency: string | null;
  line_category: string | null;
  currentApprover: string | null;
}

interface StatsResponse {
  total: string;
  draft: string;
  pending_approval: string;
  approved: string;
  complete: string;
  rejected: string;
  cancelled: string;
  more_info_required: string;
  total_value: string;
}

interface Organization {
  id: number;
  organization_name: string;
  currency: string;
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
  loc_id: string
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

export default function PurchaseRequests() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Determine the logged-in user for buyer-only actions
  const parsedAuth = useMemo(() => {
    const authData = localStorage.getItem("prokraya-auth");
    return authData ? JSON.parse(authData) : null;
  }, []);

  const loggedInUserName: string = parsedAuth?.userName || "";
  const loggedInUserNameId: string = parsedAuth?.userNameId || "";
  const userOrgIds: string[] = parsedAuth?.orgIds
    ? parsedAuth.orgIds.split(",").map((id: string) => id.trim())
    : [];
  const userRole: string = parsedAuth?.userRole || "";
  const isSuperadmin = userRole === "ROLE_SUPERADMIN" || userRole === "ROLE_SYSADMIN";

  const orgDetails = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("orgDetails") || "{}");
    } catch (e) {
      return {};
    }
  }, []);
  const initialQueryParams = new URLSearchParams(location.split("?")[1] || "");
  const initialStatus = initialQueryParams.get("status") || "all";
  const initialSearch = initialQueryParams.get("search") || "";
  const initialPage = parseInt(initialQueryParams.get("page") || "1", 10) || 1;
  const initialLimit =
    parseInt(initialQueryParams.get("limit") || "10", 10) || 10;

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Keep filters in sync with URL query params when navigating via dashboard cards
  function getSearchParams(): URLSearchParams {
    if (typeof window !== "undefined" && window.location?.search) {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams(location.split("?")[1] || "");
  }

  useEffect(() => {
    const queryParams = getSearchParams();
    setSearch(queryParams.get("search") || "");
    setStatusFilter(queryParams.get("status") || "all");
    setPage(parseInt(queryParams.get("page") || "1", 10) || 1);
    setLimit(parseInt(queryParams.get("limit") || "10", 10) || 10);
  }, [location]);
  const [newPR, setNewPR] = useState({
    description: "",
    deliveryLocation: "",
    needByDate: "",
    requestorId: "",
    requestorName: "",
    requestorDepartment: "",
    buyerId: "",
    buyerName: "",
    currency: "",
    budgetId: "",
    isBudgeted: "yes",
    orgId: "",
  });

  const { data: locationsData } = useQuery<
    { id: string; location_name: string; location_id: string; status: string; org_id: string }[]
  >({
    queryKey: ["/api/locations"],
  });

  const { data: usersData } = useQuery<
    {
      id: number;
      user_id: string;
      user_name: string;
      name: string;
      email_id: string;
      department_name: string | null;
    }[]
  >({
    queryKey: ["/api/users/dropdown"],
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

  const { data: budgetLinesData } = useQuery<BudgetLine[]>({
    queryKey: ["/api/budgets/approved-lines"],
  });

  const { data: departmentsData } = useQuery<{
    data: { id: number; code: string; value: string; status: string }[];
  }>({
    queryKey: ["/api/cost-centers/3/items?limit=100"],
  });

  const { data: currencyOptions = [] } = useQuery<
    { value: string; label: string }[]
  >({
    queryKey: ["/api/vendor/lookups/currencies"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });
    
  const initializeBaseValues = useRef(false);

  useEffect(() => {
    if (initializeBaseValues.current) return;
    if (!orgDetails?.currency || !currencyOptions.length) return;
    initializeBaseValues.current = true;
    setNewPR((prev: any) => {
      // If currency is already set (user made a selection), don't overwrite it
      if (prev.currency) return prev;
      const defaultCurrency = currencyOptions.find(
        (t) => t.value === orgDetails.currency
      );
      if (defaultCurrency) {
        return {
          ...prev,
          currency: defaultCurrency.value,
        };
      }
      return prev;
    });
  }, [currencyOptions, orgDetails]);

  const locations = (locationsData || []).filter(
    (loc) => loc.status === "Y" && (!newPR.orgId || String(loc.org_id) === String(newPR.orgId))
  );
  const users = usersData || [];
  const buyers = buyersData || [];
  const budgetLines = budgetLinesData || [];
  const departments =
    departmentsData?.data?.filter((d) => d.status === "Y") || [];

  // Handle opening the create dialog - auto-populate Requestor and Department with logged-in user
  const handleOpenCreateDialog = (open: boolean) => {
    if (open && users.length > 0) {
      const authData = localStorage.getItem("prokraya-auth");
      if (authData) {
        try {
          const auth = JSON.parse(authData);
          const loggedInUserId = auth.userId; // userId is the numeric ID
          // Match by ID (could be numeric or string)
          const matchedUser = users.find(
            (u) => String(u.id) === String(loggedInUserId),
          );
          if (matchedUser) {
            // Also match department
            const matchedDept = matchedUser.department_name
              ? departments.find(
                (d) =>
                  d.value?.toLowerCase() ===
                  matchedUser.department_name?.toLowerCase(),
              )
              : null;
            setNewPR((prev) => ({
              ...prev,
              requestorId: String(matchedUser.id),
              requestorName: matchedUser.name || matchedUser.user_name || "",
              requestorDepartment: matchedDept
                ? String(matchedDept.id)
                : prev.requestorDepartment,
            }));
          }
        } catch (e) {
          console.error("Error parsing auth data:", e);
        }
      }
    }
    setCreateDialogOpen(open);
  };

  const createPRMutation = useMutation({
    mutationFn: async (prData: typeof newPR) => {
      const res = await apiRequest("POST", "/api/requisitions", prData);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "PR Created",
        description: `Draft PR ${data.prNumber || ""} created successfully`,
      });
      setCreateDialogOpen(false);
      setNewPR({
        description: "",
        deliveryLocation: "",
        needByDate: "",
        requestorId: "",
        requestorName: "",
        requestorDepartment: "",
        buyerId: "",
        buyerName: "",
        currency: "AED",
        budgetId: "",
        isBudgeted: "yes",
        orgId: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions/stats"] });
      if (data.prNumber) {
        setLocation(`/app/requisitions/${data.prNumber}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create PR",
        variant: "destructive",
      });
    },
  });

  const handleCreatePR = () => {
    createPRMutation.mutate(newPR);
  };

  const [createPODialogOpen, setCreatePODialogOpen] = useState(false);
  const [selectedPRForPO, setSelectedPRForPO] = useState<string | null>(null);
  const [prDetailsForPO, setPrDetailsForPO] = useState<any>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [selectedVendorName, setSelectedVendorName] = useState<string>("");
  const [vendorSearchPO, setVendorSearchPO] = useState("");
  const [vendorDropdownOpenPO, setVendorDropdownOpenPO] = useState(false);
  const [poPaymentTermsId, setPoPaymentTermsId] = useState("");
  const [poPaymentTermsName, setPoPaymentTermsName] = useState("");
  const [poAdvanceFlag, setPoAdvanceFlag] = useState(false);
  const [poAdvancePercentage, setPoAdvancePercentage] = useState("");

  const [createContractDialogOpen, setCreateContractDialogOpen] = useState(false);
  const [selectedPRForContract, setSelectedPRForContract] = useState<string | null>(null);
  const [prDetailsForContract, setPrDetailsForContract] = useState<any>(null);
  const [contractTitle, setContractTitle] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [contractTemplateName, setContractTemplateName] = useState("");
  const [contractIsRenewable, setContractIsRenewable] = useState("");
  const [selectedContractVendorId, setSelectedContractVendorId] = useState("");
  const [selectedContractVendorName, setSelectedContractVendorName] = useState("");
  const [vendorSearchContract, setVendorSearchContract] = useState("");
  const [vendorDropdownOpenContract, setVendorDropdownOpenContract] = useState(false);

  const { data: contractTemplatesData } = useQuery<any>({
    queryKey: ["/api/contracts/templates"],
    queryFn: () => apiRequest("GET", "/api/contracts/templates?limit=100").then((r) => r.json()),
  });
  const contractTemplates: { id: number; template_name: string }[] = contractTemplatesData?.records || [];

  const { data: suppliersData } = useQuery<{
    data: { id: number; company_name: string }[];
    total: number;
  }>({
    queryKey: ["/api/dbo/suppliers", { page: 1, limit: 500, status: "Active,Changes In Draft" }],
    queryFn: () =>
      apiRequest("GET", "/api/dbo/suppliers?page=1&limit=500&status=Active%2CChanges%20In%20Draft").then((r) =>
        r.json(),
      ),
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
  });

  const vendors = (suppliersData?.data || []) as {
    id: number;
    companyName?: string;
    company_name?: string;
  }[];
  const filteredVendorsPO = vendors.filter((v) => {
    const name = v.companyName || v.company_name || "";
    return name.toLowerCase().includes(vendorSearchPO.toLowerCase());
  });
  const filteredVendorsContract = vendors.filter((v) => {
    const name = v.companyName || v.company_name || "";
    return name.toLowerCase().includes(vendorSearchContract.toLowerCase());
  });
  const paymentTerms = (paymentTermsData?.data || []).filter(
    (pt) => pt.status === "Y",
  );

  const handleOpenCreatePODialog = async (prNumber: string) => {
    setSelectedPRForPO(prNumber);
    setCreatePODialogOpen(true);
    setPrDetailsForPO(null);
    setSelectedVendorId("");
    setSelectedVendorName("");
    setVendorSearchPO("");
    setPoPaymentTermsId("");
    setPoPaymentTermsName("");
    setPoAdvanceFlag(false);
    setPoAdvancePercentage("");
    setNewPR((prev) => ({ ...prev, budgetId: "" }));

    try {
      const res = await apiRequest("GET", `/api/purchase-orders/pr-details/${prNumber}`);
      const data = await res.json();
      setPrDetailsForPO(data);
    } catch (e) {
      console.error("Error fetching PR details:", e);
      toast({
        title: "Error",
        description: "Failed to load PR details",
        variant: "destructive",
      });
    }
  };

  const createPOFromPRMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "POST",
        "/api/purchase-orders/from-pr",
        data,
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "PO Created",
        description: `Draft PO ${data.poNumber} created from PR ${selectedPRForPO}`,
      });
      setCreatePODialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      if (data.poNumber) {
        setLocation(`/app/purchase-orders/${data.poNumber}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create PO from PR",
        variant: "destructive",
      });
    },
  });

  const handleCreatePOFromPR = () => {
    if (!selectedPRForPO || !selectedVendorId) return;
    if (poAdvanceFlag && (poAdvancePercentage === null || poAdvancePercentage === undefined || poAdvancePercentage === "" || !poAdvancePercentage)) {
      toast({
        title: "Validation Failure",
        description:
          "Please add Advance Percentage to Continue!",
        variant: "destructive",
      });
      return;
    }
    if (prDetailsForPO?.selectedLines?.trim() === "" || !prDetailsForPO?.selectedLines) {
      toast({ title: "Validation Failure", description: "Please select Lines to proceed", variant: "destructive" });
      return;
    }
    if (prDetailsForPO?.header?.budgeted === false && !newPR.budgetId) {
      toast({ title: "Validation Failure", description: "Please select a Budget to proceed", variant: "destructive" });
      return;
    }
    createPOFromPRMutation.mutate({
      prNumber: selectedPRForPO,
      supplierId: selectedVendorId,
      paymentTermsId: poPaymentTermsId || null,
      paymentTerms: poPaymentTermsName || null,
      advanceFlag: poAdvanceFlag ? "Y" : "N",
      advancePercentage: poAdvancePercentage || null,
      selectedLines: (prDetailsForPO?.selectedLines || "")?.split(",")?.join("~"),
      budgetId: prDetailsForPO?.header?.budgeted === false ? newPR.budgetId : null,
    });
  };

  const handleOpenCreateContractDialog = async (prNumber: string) => {
    setSelectedPRForContract(prNumber);
    setCreateContractDialogOpen(true);
    setPrDetailsForContract(null);
    setContractTitle("");
    setContractStartDate("");
    setContractEndDate("");
    setContractTemplateName("");
    setContractIsRenewable("");
    setSelectedContractVendorId("");
    setSelectedContractVendorName("");
    setVendorSearchContract("");

    try {
      const res = await apiRequest("GET", `/api/contracts/pr-details/${prNumber}`);
      const data = await res.json();
      setPrDetailsForContract(data);
      setContractTitle(data?.header?.pr_description || `Contract for ${prNumber}`);
    } catch (e) {
      console.error("Error fetching PR details:", e);
      toast({
        title: "Error",
        description: "Failed to load PR details",
        variant: "destructive",
      });
    }
  };

  const createContractFromPRMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/contracts/from-pr", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Contract Created",
        description: `Draft contract created from PR ${selectedPRForContract}`,
      });
      setCreateContractDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      if (data.id) {
        setLocation(`/app/contracts/${data.id}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create contract from PR",
        variant: "destructive",
      });
    },
  });

  const handleCreateContractFromPR = () => {
    if (!selectedPRForContract || !selectedContractVendorId) return;
    if (!contractStartDate || !contractEndDate) {
      toast({ title: "Validation Failure", description: "Please select Start and End dates to proceed", variant: "destructive" });
      return;
    }
    if (prDetailsForContract?.selectedLines?.trim() === "" || !prDetailsForContract?.selectedLines) {
      toast({ title: "Validation Failure", description: "Please select Lines to proceed", variant: "destructive" });
      return;
    }
    createContractFromPRMutation.mutate({
      prNumber: selectedPRForContract,
      supplierId: selectedContractVendorId,
      title: contractTitle || undefined,
      start_date: contractStartDate,
      end_date: contractEndDate,
      currency: prDetailsForContract?.header?.currency || undefined,
      template_name: contractTemplateName || undefined,
      is_renewable: contractIsRenewable || undefined,
      selectedLines: (prDetailsForContract?.selectedLines || "")?.split(",")?.join("~"),
    });
  };

  const handleBidDateChange = (
    field: "open" | "close" | "envelope",
    value: string
  ) => {
    const result = validateDate(value);
    if (!result.valid) return;

    if (field === "open") {
      setBidOpenDate(result.value);
      setBidCloseDate((prevClose) => {
        if (!prevClose) return prevClose;
        return new Date(prevClose) <= new Date(result.value)
          ? ""
          : prevClose;
      });
    }

    if (field === "close") {
      const openDate = bidOpenDate ? new Date(bidOpenDate) : null;
      const selectedClose = new Date(result.value);
      if (openDate && selectedClose <= openDate) {
        toast({
          title: "Invalid Time",
          description: "Close date must be after open date.",
          variant: "destructive",
        });
        return;
      }
      setBidCloseDate(result.value);
    }
    if (field === "envelope") {
      const closeDate = bidCloseDate ? new Date(bidCloseDate) : null;
      const selectedEnvelope = new Date(result.value);
      if (closeDate && selectedEnvelope <= closeDate) {
        toast({
          title: "Invalid Time",
          description: "Envelope open date must be after close date.",
          variant: "destructive",
        });
        return;
      }
      setBidEnvelopeOpenDate(result.value);
    }
  };

  const validateDate = (value: string) => {
    if (!value) return { valid: true, value };

    const selectedDate = new Date(value);
    const currentDate = new Date();
    currentDate.setSeconds(0, 0);

    if (selectedDate < currentDate) {
      toast({
        title: "Invalid Time",
        description: "You cannot select a past date.",
        variant: "destructive",
      });

      return { valid: false, value: "" };
    }

    return { valid: true, value };
  };

  const [createBidDialogOpen, setCreateBidDialogOpen] = useState(false);
  const [selectedPRForBid, setSelectedPRForBid] = useState<string | null>(null);
  const [bidType, setBidType] = useState("");
  const [bidOpenDate, setBidOpenDate] = useState("");
  const [bidCloseDate, setBidCloseDate] = useState("");
  const [bidTemplateId, setBidTemplateId] = useState("");
  const [bidEnvelopeOpenDate, setBidEnvelopeOpenDate] = useState("");
  const { data: allBids } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids"],
  });

  const templateBids = (allBids || []).filter(
    (b: any) => b.templateName && b.templateName.trim() !== "",
  );

  const createBidFromPRMutation = useMutation({
    mutationFn: async (data: {
      prNumber: string;
      bidType: string;
      openDate: string;
      closeDate: string;
      envelopeOpenDate?: string;
      templateId?: string;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/create-from-pr/${data.prNumber}`,
        {
          bidType: data.bidType,
          openDate: data.openDate,
          closeDate: data.closeDate,
          templateId: data.templateId || undefined,
          envelopeOpenDate: data.envelopeOpenDate || undefined,
        },
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bid Created",
        description: `Bid ${data.bid_number || "BID-" + data.id} created from PR ${selectedPRForBid}`,
      });
      setCreateBidDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      setLocation(`/app/bids/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create bid from PR",
        variant: "destructive",
      });
    },
  });

  const checkBidStatus = useMutation({
    mutationFn: async (bidNumber: number) => {
      const res = await apiRequest(
        "GET",
        `/api/dbo/bids/${bidNumber}/status`
      );
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "Draft") {
        setLocation(`/app/bids/${data.id}`);
      } else {
        setLocation(`/app/bids/${data.id}/view`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch bid status",
        variant: "destructive",
      });
    },
  });

  const handleOpenCreateBidDialog = (prNumber: string) => {
    setSelectedPRForBid(prNumber);
    setBidType("");
    setBidTemplateId("");
    const toLocalDateTimeString = (d: Date) =>
      new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    setBidOpenDate(toLocalDateTimeString(now));
    const close = new Date(now);
    close.setDate(close.getDate() + 10);
    setBidCloseDate(toLocalDateTimeString(close));
    setCreateBidDialogOpen(true);
  };

  const handleCreateBidFromPR = () => {
    if (!selectedPRForBid || !bidType || !bidOpenDate || !bidCloseDate || (bidType === "Tender" && !bidEnvelopeOpenDate)) return;

    const openDateUTC = new Date(bidOpenDate).toISOString();
    const closeDateUTC = new Date(bidCloseDate).toISOString();
    const envelopeOpenDateUTC = bidType === "Tender" ? new Date(bidEnvelopeOpenDate).toISOString() : undefined;

    if (new Date(bidOpenDate) >= new Date(bidCloseDate)) {
      toast({
        title: "Invalid Dates",
        description: "Close date must be greater than Open date",
        variant: "destructive",
      });
      return;
    }
    const currentDate = new Date();
    currentDate.setSeconds(0, 0);
    if (new Date(bidOpenDate) < currentDate) {
      toast({
        title: "Invalid Open Date",
        description: "Open date cannot be in the past",
        variant: "destructive",
      });
      return;
    }
    if (bidType === "Tender" && new Date(bidEnvelopeOpenDate) < new Date(bidCloseDate)) {
      toast({
        title: "Invalid Envelope Open Date",
        description: "Envelope open date cannot be before close date",
        variant: "destructive",
      });
      return;
    }

    createBidFromPRMutation.mutate({
      prNumber: selectedPRForBid,
      bidType,
      openDate: openDateUTC,
      closeDate: closeDateUTC,
      templateId: bidTemplateId || undefined,
      envelopeOpenDate: envelopeOpenDateUTC,
    });
  };

  const { data: stats, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: ["/api/requisitions/stats"],
  });

  const buildPrFilterParams = (options?: { page?: number; limit?: number; exportLines?: boolean }) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    const trimmedSearch = search.trim();
    if (trimmedSearch) params.set("search", trimmedSearch);
    params.set("page", String(options?.page ?? page));
    params.set("limit", String(options?.limit ?? limit));
    if (options?.exportLines) params.set("exportLines", "true");
    return params;
  };

  const queryParams = buildPrFilterParams();

  const { data: requisitionsData, isLoading } = useQuery<RequisitionsResponse>({
    queryKey: [`/api/requisitions?${queryParams.toString()}`],
    staleTime: 0,
    refetchOnMount: true,
  });

  const requisitions = requisitionsData?.data || [];
  const pagination = requisitionsData?.pagination;

  const [isExporting, setIsExporting] = useState(false);

  const fetchExportData = async (): Promise<RequisitionsResponse> => {
    const params = buildPrFilterParams({ page: 1, limit: 0, exportLines: true });
    const res = await apiRequest("GET", `/api/requisitions?${params.toString()}`);
    return res.json();
  };

  const prSummaryRow = (pr: RequisitionHeader) => ({
    "PR Number": pr.pr_number || "",
    Description: pr.pr_description || "",
    Status: pr.pr_status || "",
    Type: pr.pr_type || "",
    Amount: pr.pr_amount ? Number(pr.pr_amount) : null,
    Currency: pr.currency || "",
    Department: pr.department_name || "",
    Requestor: pr.requestor_name || "",
    Owner: pr.pr_owner_name || "",
    "Created Date": pr.pr_created_date
      ? formatDate(pr.pr_created_date)
      : "",
    "Delivery Date": pr.delivery_date
      ? formatDate(pr.delivery_date)
      : "",
    "Delivery Location": pr.delivertto_location_name || "",
    Budget: pr.budget_name || "",
    "PO Number": pr.po_number || "",
    "Current Approver": pr.currentApprover || "",
  });

  const emptyPrLineFields = () => ({
    "Line ID": "",
    "Line #": "",
    "Item Description": "",
    Qty: "",
    UOM: "",
    "Unit Cost": "",
    "Line Amount": "",
    "Line Currency": "",
    Category: "",
  });

  const mapPrExportLineToFlatRow = (row: PrExportLineRow) => ({
    ...prSummaryRow({
      pr_number: row.pr_number,
      pr_description: row.pr_description,
      pr_status: row.pr_status,
      pr_type: row.pr_type,
      pr_amount: row.header_pr_amount ? Number(row.header_pr_amount) : null,
      currency: row.header_currency,
      department_name: row.department_name,
      requestor_name: row.requestor_name,
      pr_owner_name: row.pr_owner_name,
      pr_created_date: row.pr_created_date,
      approved_date: null,
      delivertto_location_name: row.delivertto_location_name,
      delivery_date: row.delivery_date,
      po_number: row.po_number,
      notes: null,
      budget_name: row.budget_name,
      budgeted: null,
      estimated_cost: null,
      creation_date: null,
      bidno: null,
      currentApprover: row.currentApprover || "",
    }),
    "Line ID": row.line_id ?? "",
    "Line #": row.line_number ?? "",
    "Item Description": row.line_item_description || "",
    Qty: row.line_qty ? Number(row.line_qty) : null,
    UOM: row.line_uom || "",
    "Unit Cost": row.line_unit_cost ? Number(row.line_unit_cost) : null,
    "Line Amount": row.line_amount ? Number(row.line_amount) : null,
    "Line Currency": row.line_currency || "",
    Category: row.line_category || "",
  });

  const getExportRequisitionPayload = async () => {
    const result = await fetchExportData();
    const exportPR = result.data || [];
    const rawLines = result.exportLines ?? [];
    const summaryRows = exportPR.map(prSummaryRow);
    const lineRowsFromApi = rawLines.map(mapPrExportLineToFlatRow);
    const prNumbersWithLines = new Set(rawLines.map((r) => r.pr_number));
    const fillerRows = exportPR
      .filter((pr) => !prNumbersWithLines.has(pr.pr_number))
      .map((pr) => ({ ...prSummaryRow(pr), ...emptyPrLineFields() }));
    const lineRowsFlat = [...lineRowsFromApi, ...fillerRows];
    return { summaryRows, lineRowsFlat };
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      const { summaryRows, lineRowsFlat } = await getExportRequisitionPayload();
      if (summaryRows.length === 0) {
        toast({
          title: "No data to export",
          description: "No purchase requests match the current filters.",
          variant: "destructive",
        });
        return;
      }
      const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
      const block = (rows: Record<string, string>[]) => {
        if (rows.length === 0) return "";
        const headers = Object.keys(rows[0]);
        return [
          headers.join(","),
          ...rows.map((row) =>
            headers.map((h) => esc(String((row as Record<string, string>)[h] ?? ""))).join(","),
          ),
        ].join("\n");
      };
      const csvParts = [block(summaryRows), "", "PR line items", block(lineRowsFlat)].filter(Boolean);
      const csv = csvParts.join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchase_requests_${statusFilter}_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported to CSV" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export purchase requests",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
    const { summaryRows, lineRowsFlat } = await getExportRequisitionPayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No purchase requests match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Purchase Requests");
    if (lineRowsFlat.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRowsFlat), "PR lines");
    }
    XLSX.writeFile(
      wb,
      `purchase_requests_${statusFilter}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    toast({ title: "Exported to Excel" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export purchase requests",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
    const { summaryRows } = await getExportRequisitionPayload();
    if (summaryRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No purchase requests match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const columns = Object.keys(summaryRows[0]);
    const rows = summaryRows.map((row) =>
      columns.map((col) => (row as Record<string, string>)[col] || ""),
    );
    generateTablePdf({
      title: "Purchase Requisitions",
      subtitle: [
        statusFilter !== "all" ? `Status: ${statusFilter}` : null,
        search.trim() ? `Search: ${search.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" | ") || "All purchase requests",
      columns,
      rows,
      filename: `purchase_requests_${statusFilter}_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export purchase requests",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const statCards = [
    {
      title: "Total PRs",
      value: stats?.total || "0",
      icon: ShoppingCart,
      color: "text-primary",
      bgColor: "bg-primary/10",
      filterValue: "all",
    },
    {
      title: "Draft",
      value: stats?.draft || "0",
      icon: FileText,
      color: "text-slate-500",
      bgColor: "bg-slate-100 dark:bg-slate-800",
      filterValue: "Draft",
    },
    {
      title: "Pending Approval",
      value: stats?.pending_approval || "0",
      icon: Clock,
      color: "text-orange-500",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      filterValue: "Pending Approval",
    },
    {
      title: "Approved",
      value: stats?.approved || "0",
      icon: CheckCircle2,
      color: "text-emerald-500",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      filterValue: "Approved",
    },
    {
      title: "Complete",
      value: stats?.complete || "0",
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      filterValue: "Complete",
    },
    {
      title: "More Info Required",
      value: stats?.more_info_required || "0",
      icon: AlertTriangle,
      color: "text-amber-500",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      filterValue: "More Info Required",
    },
    {
      title: "Rejected",
      value: stats?.rejected || "0",
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      filterValue: "Rejected",
    },
    {
      title: "Cancelled",
      value: stats?.cancelled || "0",
      icon: Ban,
      color: "text-muted-foreground",
      bgColor: "bg-slate-100 dark:bg-slate-800",
      filterValue: "Cancelled",
    },
  ];

  const filteredBudgets = budgetLines?.filter((item) => {

    const matchOrg =
      !newPR.orgId || item.business_entity === newPR.orgId;

    const matchDept =
      !newPR.requestorDepartment ||
      String(item.dept_id) === String(newPR.requestorDepartment);

    const matchLoc =
      !newPR.deliveryLocation ||
      String(item.loc_id) === String(newPR.deliveryLocation);

    return matchOrg && matchDept && matchLoc;
  });

  const uniqueBudgets = Array.from(
    new Map(
      filteredBudgets?.map((item) => [item.id, item])
    ).values()
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">
            Purchase Requisitions
          </h1>
          <p className="text-sm text-muted-foreground">
            View and manage procurement requests from the ERP system
          </p>
        </div>
        <Button size="sm" onClick={() => handleOpenCreateDialog(true)} data-testid="button-create-pr">
          <Plus className="h-4 w-4 mr-2" />
          Create PR
        </Button>
        <FormSheet
          open={createDialogOpen}
          onOpenChange={handleOpenCreateDialog}
          title="Create Purchase Requisition"
          onSubmit={handleCreatePR}
          submitLabel={createPRMutation.isPending ? "Creating..." : "Create"}
          isSubmitting={createPRMutation.isPending}
          submitDisabled={
            !newPR.description ||
            !newPR.deliveryLocation ||
            !newPR.needByDate ||
            !newPR.requestorId ||
            !newPR.requestorDepartment ||
            !newPR.buyerId ||
            !newPR.orgId ||
            (newPR.isBudgeted === "yes" && !newPR.budgetId)
          }
        >
            <p className="text-xs text-muted-foreground mb-4">
              <span className="text-destructive">*</span> Indicates mandatory fields
            </p>
            <div className="mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="pr-description">
                    PR Description <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="pr-description"
                    placeholder="Enter a brief description of purchase request"
                    value={newPR.description}
                    onChange={(e) =>
                      setNewPR({ ...newPR, description: e.target.value })
                    }
                    data-testid="input-pr-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pr-business-entity">
                    Business Entity <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={newPR.orgId || ""}
                    onValueChange={(value) => {
                      setNewPR({ ...newPR, buyerId: "", buyerName: "", orgId: value, deliveryLocation: "", currency: organizations?.filter((item) => String(item.id) === String(value))[0]?.currency });
                    }}
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

                <div className="space-y-2">
                  <Label htmlFor="pr-need-by-date">
                    Need By Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="pr-need-by-date"
                    type="date"
                    value={newPR.needByDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) =>
                      setNewPR({ ...newPR, needByDate: e.target.value })
                    }
                    data-testid="input-need-by-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pr-requestor">
                    Requestor <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={newPR.requestorId}
                    onValueChange={(v) => {
                      const selectedUser = users.find(
                        (u) => String(u.id) === v,
                      );
                      const matchedDept = selectedUser?.department_name
                        ? departments.find(
                          (d) =>
                            d.value?.toLowerCase() ===
                            selectedUser.department_name?.toLowerCase(),
                        )
                        : null;
                      setNewPR({
                        ...newPR,
                        requestorId: v,
                        requestorName:
                          selectedUser?.name || selectedUser?.user_name || "",
                        requestorDepartment: matchedDept
                          ? String(matchedDept.id)
                          : newPR.requestorDepartment,
                      });
                    }}
                    disabled={!isSuperadmin}
                  >
                    <SelectTrigger data-testid="select-requestor">
                      <SelectValue placeholder="Select Requestor" />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((u) => u.id)
                        .map((user) => (
                          <SelectItem key={user.id} value={String(user.id)}>
                            {user.name || user.user_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pr-delivery-location">
                    Delivery Location{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={newPR.deliveryLocation}
                    onValueChange={(v) =>
                      setNewPR({ ...newPR, deliveryLocation: v })
                    }
                    disabled={!newPR.orgId}
                  >
                    <SelectTrigger data-testid="select-delivery-location">
                      <SelectValue placeholder={newPR.orgId ? "Select Location" : "Select business entity first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.length > 0 ? (
                        locations.map((loc) => (
                          <SelectItem key={loc.id} value={String(loc.id)}>
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
                  <Label htmlFor="pr-department">
                    Department{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={newPR.requestorDepartment}
                    onValueChange={(v) =>
                      setNewPR({ ...newPR, requestorDepartment: v })
                    }
                  >
                    <SelectTrigger data-testid="select-department">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={String(dept.id)}>
                          {dept.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pr-buyer">
                    Buyer <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={newPR.buyerId}
                    onValueChange={(v) => {
                      const selectedUser = buyers?.filter((item) =>
                        item.org_id
                          ?.split(",")
                          .filter(Boolean)
                          .includes(String(newPR.orgId))
                      )?.filter((u) => u.id)?.find(
                        (u) => String(u.id) === v,
                      );
                      setNewPR({
                        ...newPR,
                        buyerId: v,
                        buyerName:
                          selectedUser?.name || selectedUser?.user_name || "",
                      });
                    }}
                  >
                    <SelectTrigger data-testid="select-buyer">
                      <SelectValue placeholder="Select Buyer" />
                    </SelectTrigger>
                    <SelectContent>
                      {buyers?.filter((item) =>
                        item.org_id
                          ?.split(",")
                          .filter(Boolean)
                          .includes(String(newPR.orgId))
                      )?.filter((u) => u.id)?.map((user) => (
                        <SelectItem key={user.id} value={String(user.id)}>
                          {user.name || user.user_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pr-currency">
                    Currency <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={newPR.currency}
                    onValueChange={(v) => setNewPR({ ...newPR, currency: v })}
                  >
                    <SelectTrigger data-testid="select-currency">
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
                    value={newPR.isBudgeted}
                    onValueChange={(v) =>
                      setNewPR({
                        ...newPR,
                        isBudgeted: v,
                        budgetId: v === "no" ? "" : newPR.budgetId,
                      })
                    }
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="yes" id="budgeted-yes" />
                      <Label htmlFor="budgeted-yes" className="cursor-pointer">
                        Yes
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="no" id="budgeted-no" />
                      <Label htmlFor="budgeted-no" className="cursor-pointer">
                        No
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {newPR.isBudgeted === "yes" && (
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="pr-budget">
                      Budget <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newPR.budgetId}
                      onValueChange={(v) => setNewPR({ ...newPR, budgetId: v })}
                    >
                      <SelectTrigger data-testid="select-budget">
                        <SelectValue placeholder="Select Budget">
                          {newPR.budgetId &&
                            (() => {
                              const selected = budgetLines
                                ?.filter((item) => {
                                  const matchOrg =
                                    !newPR.orgId || item.business_entity === newPR.orgId;

                                  const matchDept =
                                    !newPR.requestorDepartment ||
                                    String(item.dept_id) === String(newPR.requestorDepartment);

                                  const matchLoc =
                                    !newPR.deliveryLocation ||
                                    String(item.loc_id) === String(newPR.deliveryLocation);

                                  return matchOrg && matchDept && matchLoc;
                                })
                                ?.find((bl) => String(bl.id) === newPR.budgetId);

                              return selected
                                ? `${selected.budget_name} . ${selected.segment_dtl_name}`
                                : "Select Budget";
                            })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueBudgets?.length > 0 ? uniqueBudgets
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
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
        {statsLoading
          ? [...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </CardContent>
            </Card>
          ))
          : statCards.map((stat) => (
            <Card
              key={stat.title}
              className={`hover-elevate cursor-pointer transition-all ${statusFilter === stat.filterValue
                  ? "ring-primary border-primary bg-primary/5"
                  : ""
                }`}
              onClick={() => {
                setStatusFilter(stat.filterValue);
                setPage(1);
              }}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bgColor} ${stat.color}`}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <p
                    className="text-xl font-bold"
                    data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {parseInt(stat.value).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search PR#, requestor, department, buyer..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-pr"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="w-[140px] h-8 text-sm"
                  data-testid="select-status"
                >
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Draft">
                    Draft ({stats?.draft || 0})
                  </SelectItem>
                  <SelectItem value="Pending Approval">
                    Pending ({stats?.pending_approval || 0})
                  </SelectItem>
                  <SelectItem value="Approved">
                    Approved ({stats?.approved || 0})
                  </SelectItem>
                  <SelectItem value="Complete">
                    Complete ({stats?.complete || 0})
                  </SelectItem>
                  <SelectItem value="More Info Required">
                    More Info ({stats?.more_info_required || 0})
                  </SelectItem>
                  <SelectItem value="Rejected">
                    Rejected ({stats?.rejected || 0})
                  </SelectItem>
                  <SelectItem value="Cancelled">
                    Cancelled ({stats?.cancelled || 0})
                  </SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={isExporting}
                    data-testid="button-export"
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    {isExporting ? "Exporting..." : "Export"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={exportToCSV}
                    data-testid="menu-item-csv"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportToExcel}
                    data-testid="menu-item-excel"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportToPDF}
                    data-testid="menu-item-pdf"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : requisitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <h3 className="text-base font-medium mb-1">
                No requisitions found
              </h3>
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "No requisitions available in the system"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-medium w-[120px]">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        PR Number
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[100px]">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Status
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[80px]">
                      <span className="flex items-center gap-1.5">
                        <FileCheck2 className="h-3.5 w-3.5" />
                        Bid
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[80px]">
                      <span className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        PO
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[90px]">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Contract
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        Requestor
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        Department
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5" />
                        Buyer
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium text-right w-[100px]">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[90px]">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Created
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[90px]">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Delivery
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-[120px]">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Current Approver
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requisitions.map((pr) => (
                    <TableRow
                      key={pr.pr_number}
                      className="cursor-pointer"
                      onClick={() =>
                        (window.location.href = `/app/requisitions/${pr.pr_number}`)
                      }
                      data-testid={`pr-row-${pr.pr_number}`}
                    >
                      <TableCell className="font-mono text-sm font-medium text-primary py-2">
                        {pr.pr_number}
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={pr.pr_status} />
                      </TableCell>
                      <TableCell className="py-2">
                        {pr.bidno ? (
                          <span
                            className="font-mono text-sm text-primary truncate max-w-[100px] inline-block"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              pr.bidno && checkBidStatus.mutate(pr.bidno);
                            }}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[100px] cursor-default">
                                  BID-{pr.bidno}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>BID-{pr.bidno}</p>
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        ) : pr.pr_status === "Approved" &&
                          !pr.po_number &&
                          !pr.contract_refs &&
                          (pr.pr_owner_name === loggedInUserName ||
                            pr.pr_owner_name === loggedInUserNameId || isSuperadmin) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenCreateBidDialog(pr.pr_number);
                            }}
                            data-testid={`button-create-bid-${pr.pr_number}`}
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            Bid
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {pr.po_number && (
                          (() => {
                            const poNumbers = pr.po_number?.split(",") ?? [];
                            return poNumbers.map((po, index) => (
                              <span key={po.trim()}>
                                <span
                                  className="font-mono text-sm text-primary underline underline-offset-2 cursor-pointer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.location.href = `/app/purchase-orders/${po.trim()}`;
                                  }}
                                >
                                  {po.trim()}
                                </span>
                                {index < poNumbers.length - 1 && ", "}
                              </span>
                            ));
                          })()
                        )}
                        {pr.pr_status === "Approved" &&
                          !pr.bidno &&
                          (pr.pr_owner_name === loggedInUserName ||
                            pr.pr_owner_name === loggedInUserNameId || isSuperadmin) && pr.all_lines_have_po !== true && !pr.contract_refs ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenCreatePODialog(pr.pr_number);
                            }}
                            data-testid={`button-create-po-${pr.pr_number}`}
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            PO
                          </Button>
                        ) : !pr.po_number ? (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        ) : <></>}
                      </TableCell>
                      <TableCell className="py-2">
                        {pr.contract_refs && (
                          (() => {
                            const contractIds = pr.contract_refs?.split(",") ?? [];
                            return contractIds.map((cid, index) => (
                              <span key={cid.trim()}>
                                <span
                                  className="font-mono text-sm text-primary underline underline-offset-2 cursor-pointer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.location.href = `/app/contracts/${cid.trim()}`;
                                  }}
                                >
                                  {cid.trim()}
                                </span>
                                {index < contractIds.length - 1 && ", "}
                              </span>
                            ));
                          })()
                        )}
                        {pr.pr_status === "Approved" &&
                          !pr.bidno &&
                          !pr.po_number &&
                          pr.all_lines_have_contract !== true &&
                          (pr.pr_owner_name === loggedInUserName ||
                            pr.pr_owner_name === loggedInUserNameId || isSuperadmin) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenCreateContractDialog(pr.pr_number);
                            }}
                            data-testid={`button-create-contract-${pr.pr_number}`}
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            Contract
                          </Button>
                        ) : !pr.contract_refs ? (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        ) : <></>}
                      </TableCell>
                      <TableCell
                        className="text-sm py-2 max-w-[120px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[120px] cursor-default">
                              {pr.requestor_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{pr.requestor_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        className="text-sm py-2 max-w-[120px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[120px] cursor-default">
                              {pr.department_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{pr.department_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell
                        className="text-sm py-2 max-w-[120px] truncate"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[120px] cursor-default">
                              {pr.pr_owner_name || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{pr.pr_owner_name || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-right py-2">
                        {formatCurrency(pr.pr_amount, pr.currency)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2 whitespace-nowrap">
                        {formatDate(pr.pr_created_date)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2 whitespace-nowrap">
                        {formatDate(pr.delivery_date)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-2 whitespace-nowrap">
                        {pr.currentApprover || "-"}
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
      
      <FormSheet
        open={createPODialogOpen}
        onOpenChange={setCreatePODialogOpen}
        title={`Create PO from PR ${selectedPRForPO}`}
        description="Auto-filled from Purchase Request. Select a supplier and review details."
        onSubmit={handleCreatePOFromPR}
        submitLabel={createPOFromPRMutation.isPending ? "Creating..." : "Create PO"}
        isSubmitting={createPOFromPRMutation.isPending}
        submitDisabled={
          !prDetailsForPO ||
          createPOFromPRMutation.isPending || !selectedVendorId || (prDetailsForPO.header?.budgeted === false && !newPR.budgetId)
        }
        widthClassName="w-full sm:max-w-[55vw]"
      >
          {!prDetailsForPO ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading PR details...
              </span>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    PR Description
                  </Label>
                  <p
                    className="text-sm font-medium"
                    data-testid="text-pr-description"
                  >
                    {prDetailsForPO.header?.pr_description || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Amount
                  </Label>
                  <p
                    className="text-sm font-medium"
                    data-testid="text-pr-amount"
                  >
                    {formatCurrency(
                      prDetailsForPO.header?.pr_amount,
                      prDetailsForPO.header?.currency,
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Requestor
                  </Label>
                  <p className="text-sm" data-testid="text-pr-requestor">
                    {prDetailsForPO.header?.requestor_name || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Department
                  </Label>
                  <p className="text-sm" data-testid="text-pr-department">
                    {prDetailsForPO.header?.department_name || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Delivery Location
                  </Label>
                  <p className="text-sm">
                    {prDetailsForPO.header?.delivertto_location_name || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Required Date
                  </Label>
                  <p className="text-sm">
                    {formatDate(prDetailsForPO.header?.delivery_date)}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Budget
                  </Label>
                  <p className="text-sm">
                    {prDetailsForPO.header?.budget_name || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Currency
                  </Label>
                  <p className="text-sm">
                    {prDetailsForPO.header?.currency || "AED"}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-2">
                  Line Items ({prDetailsForPO.lines?.length || 0})
                </h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium w-[50px]">
                          #
                        </TableHead>
                        <TableHead className="text-xs py-1.5">#</TableHead>
                        <TableHead className="text-xs py-1.5">Item</TableHead>
                        <TableHead className="text-xs py-1.5">
                          Category
                        </TableHead>
                        <TableHead className="text-xs py-1.5 text-right">
                          Qty
                        </TableHead>
                        <TableHead className="text-xs py-1.5">UOM</TableHead>
                        <TableHead className="text-xs py-1.5 text-right">
                          Unit Price
                        </TableHead>
                        <TableHead className="text-xs py-1.5 text-right">
                          Amount
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(prDetailsForPO.lines || []).map(
                        (line: any, idx: number) => (
                          <TableRow key={line.id || idx}>
                            <TableCell className="font-mono text-sm py-2">
                              <Checkbox
                                id={"pr-to-po-line" + line.id}
                                checked={prDetailsForPO?.selectedLines?.split(",")?.includes(String(line.id))}
                                onCheckedChange={(checked) => {
                                  const existingIds = prDetailsForPO?.selectedLines
                                    ? prDetailsForPO.selectedLines?.split(",")?.filter(Boolean)
                                    : [];
                                  let updatedIds = [...existingIds];
                                  if (checked) {
                                    if (!updatedIds.includes(String(line.id))) {
                                      updatedIds.push(String(line.id));
                                    }
                                  } else {
                                    updatedIds = updatedIds.filter(
                                      (id) => id !== String(line.id)
                                    );
                                  }
                                  setPrDetailsForPO({
                                    ...prDetailsForPO,
                                    selectedLines: updatedIds.join(","),
                                  });
                                }}
                                data-testid={"pr-to-po-line-test-id" + line.id}
                                disabled={line.po_number !== null ? true : false}
                              />
                            </TableCell>
                            <TableCell className="text-xs py-1.5">
                              {line.line_num || idx + 1}
                            </TableCell>
                            <TableCell
                              className="text-xs py-1.5 max-w-[160px] truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[160px] cursor-default">
                                    {line.item_description || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{line.item_description || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              className="text-xs py-1.5 max-w-[100px] truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[100px] cursor-default">
                                    {line.product_category_name || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{line.product_category_name || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-xs py-1.5 text-right">
                              {line.qty || 0}
                            </TableCell>
                            <TableCell className="text-xs py-1.5">
                              {line.uom || "-"}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 text-right">
                              {parseFloat(line.unit_cost || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 text-right">
                              {parseFloat(line.amount || 0).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Supplier Selection
                  </h4>
                </div>

                <div className="space-y-1.5 relative">
                  <Label>
                    Supplier <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={
                        vendorDropdownOpenPO
                          ? vendorSearchPO
                          : selectedVendorName || vendorSearchPO
                      }
                      onChange={(e) => {
                        setVendorSearchPO(e.target.value);
                        setVendorDropdownOpenPO(true);
                        if (!e.target.value) {
                          setSelectedVendorId("");
                          setSelectedVendorName("");
                        }
                      }}
                      onFocus={() => setVendorDropdownOpenPO(true)}
                      onBlur={() =>
                        setTimeout(() => setVendorDropdownOpenPO(false), 200)
                      }
                      placeholder="Search suppliers..."
                      className="pl-8"
                      data-testid="input-vendor-search-po"
                    />
                    {vendorDropdownOpenPO && (
                      <div className="absolute z-50 top-full left-0 w-full mt-1 border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                        {filteredVendorsPO.length === 0 ? (
                          <p className="text-sm text-muted-foreground p-2">
                            No suppliers found
                          </p>
                        ) : (
                          filteredVendorsPO.slice(0, 20).map((vendor) => {
                            const name =
                              vendor.companyName || vendor.company_name || "";
                            return (
                              <button
                                key={vendor.id}
                                className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSelectedVendorId(String(vendor.id));
                                  setSelectedVendorName(name);
                                  setVendorDropdownOpenPO(false);
                                  setVendorSearchPO("");
                                }}
                                data-testid={`vendor-po-option-${vendor.id}`}
                              >
                                {name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {prDetailsForPO.header?.budgeted === false &&(
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="pr-budget">
                      Budget <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newPR.budgetId}
                      onValueChange={(v) => setNewPR({ ...newPR, budgetId: v })}
                    >
                      <SelectTrigger data-testid="select-budget">
                        <SelectValue placeholder="Select Budget">
                          {newPR.budgetId &&
                            (() => {
                              const selected = budgetLines
                                ?.filter((item) => {
                                  const matchOrg =
                                    !newPR.orgId || item.business_entity === newPR.orgId;

                                  const matchDept =
                                    !newPR.requestorDepartment ||
                                    String(item.dept_id) === String(newPR.requestorDepartment);

                                  const matchLoc =
                                    !newPR.deliveryLocation ||
                                    String(item.loc_id) === String(newPR.deliveryLocation);

                                  return matchOrg && matchDept && matchLoc;
                                })
                                ?.find((bl) => String(bl.id) === newPR.budgetId);

                              return selected
                                ? `${selected.budget_name} . ${selected.segment_dtl_name}`
                                : "Select Budget";
                            })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueBudgets?.length > 0 ? uniqueBudgets
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Payment Terms</Label>
                    <Select
                      value={poPaymentTermsId}
                      onValueChange={(v) => {
                        const selectedTerm = paymentTerms.find(
                          (pt) => String(pt.id) === v,
                        );
                        setPoPaymentTermsId(v);
                        setPoPaymentTermsName(selectedTerm?.terms_name || "");
                      }}
                    >
                      <SelectTrigger data-testid="select-payment-terms-po">
                        <SelectValue placeholder="Select Payment Terms" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentTerms.map((pt) => (
                          <SelectItem key={pt.id} value={String(pt.id)}>
                            {pt.terms_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mt-6">
                      <Checkbox
                        id="po-advance-flag-pr"
                        checked={poAdvanceFlag}
                        onCheckedChange={(checked) => {
                          setPoAdvanceFlag(!!checked);
                          if (!checked) setPoAdvancePercentage("");
                        }}
                        data-testid="checkbox-advance-flag-po"
                      />
                      <Label
                        htmlFor="po-advance-flag-pr"
                        className="cursor-pointer"
                      >
                        Advance Payment %
                      </Label>
                    </div>
                    {poAdvanceFlag && (
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="e.g. 10"
                        value={poAdvancePercentage}
                        onChange={(e) => {
                          let value = e.target.value;
                          if (value === "") {
                            setPoAdvancePercentage(value);
                            return;
                          }
                          if (!/^\d*\.?\d*$/.test(value)) return;
                          let num = Number(value);
                          if (num < 0 || num > 100) return;
                          setPoAdvancePercentage(value);
                        }}
                        inputMode="decimal"
                        data-testid="input-advance-percentage-po"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
      </FormSheet>

      <FormSheet
        open={createContractDialogOpen}
        onOpenChange={setCreateContractDialogOpen}
        title={`Create Contract from PR ${selectedPRForContract}`}
        description="Auto-filled from Purchase Request. Select the lines to include, a supplier, and the contract dates."
        onSubmit={handleCreateContractFromPR}
        submitLabel={createContractFromPRMutation.isPending ? "Creating..." : "Create Contract"}
        isSubmitting={createContractFromPRMutation.isPending}
        submitDisabled={
          !prDetailsForContract ||
          createContractFromPRMutation.isPending ||
          !selectedContractVendorId ||
          !contractStartDate ||
          !contractEndDate ||
          !prDetailsForContract?.selectedLines
        }
        widthClassName="w-full sm:max-w-[55vw]"
      >
          {!prDetailsForContract ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading PR details...
              </span>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label>
                  Contract Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={contractTitle}
                  onChange={(e) => setContractTitle(e.target.value)}
                  data-testid="input-contract-title"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Requestor
                  </Label>
                  <p className="text-sm" data-testid="text-pr-requestor-contract">
                    {prDetailsForContract.header?.requestor_name || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Department
                  </Label>
                  <p className="text-sm" data-testid="text-pr-department-contract">
                    {prDetailsForContract.header?.department_name || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Currency
                  </Label>
                  <p className="text-sm">
                    {prDetailsForContract.header?.currency || "USD"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    PR Amount
                  </Label>
                  <p className="text-sm">
                    {formatCurrency(
                      prDetailsForContract.header?.pr_amount,
                      prDetailsForContract.header?.currency,
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    Start Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={contractStartDate}
                    onChange={(e) => setContractStartDate(e.target.value)}
                    data-testid="input-contract-start-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    End Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={contractEndDate}
                    onChange={(e) => setContractEndDate(e.target.value)}
                    min={contractStartDate}
                    data-testid="input-contract-end-date"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Copy From Template</Label>
                  <Select
                    value={contractTemplateName || "__none__"}
                    onValueChange={(v) => setContractTemplateName(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger data-testid="select-contract-template">
                      <SelectValue placeholder="Select Template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None (Blank)</SelectItem>
                      {contractTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.template_name}>
                          {t.template_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Renewable</Label>
                  <Select value={contractIsRenewable} onValueChange={setContractIsRenewable}>
                    <SelectTrigger data-testid="select-contract-renewable-from-pr">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                      <SelectItem value="Auto">Auto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-2">
                  Line Items ({prDetailsForContract.lines?.length || 0}) — select lines to include{" "}
                  <span className="text-destructive">*</span>
                </h4>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium w-[50px]">
                          #
                        </TableHead>
                        <TableHead className="text-xs py-1.5">#</TableHead>
                        <TableHead className="text-xs py-1.5">Item</TableHead>
                        <TableHead className="text-xs py-1.5">
                          Category
                        </TableHead>
                        <TableHead className="text-xs py-1.5 text-right">
                          Qty
                        </TableHead>
                        <TableHead className="text-xs py-1.5">UOM</TableHead>
                        <TableHead className="text-xs py-1.5 text-right">
                          Unit Price
                        </TableHead>
                        <TableHead className="text-xs py-1.5 text-right">
                          Amount
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(prDetailsForContract.lines || []).map(
                        (line: any, idx: number) => (
                          <TableRow key={line.id || idx}>
                            <TableCell className="font-mono text-sm py-2">
                              <Checkbox
                                id={"pr-to-contract-line" + line.id}
                                checked={prDetailsForContract?.selectedLines?.split(",")?.includes(String(line.id))}
                                onCheckedChange={(checked) => {
                                  const existingIds = prDetailsForContract?.selectedLines
                                    ? prDetailsForContract.selectedLines?.split(",")?.filter(Boolean)
                                    : [];
                                  let updatedIds = [...existingIds];
                                  if (checked) {
                                    if (!updatedIds.includes(String(line.id))) {
                                      updatedIds.push(String(line.id));
                                    }
                                  } else {
                                    updatedIds = updatedIds.filter(
                                      (id) => id !== String(line.id)
                                    );
                                  }
                                  setPrDetailsForContract({
                                    ...prDetailsForContract,
                                    selectedLines: updatedIds.join(","),
                                  });
                                }}
                                data-testid={"pr-to-contract-line-test-id" + line.id}
                                disabled={!!line.attribute_15}
                              />
                            </TableCell>
                            <TableCell className="text-xs py-1.5">
                              {line.line_num || idx + 1}
                            </TableCell>
                            <TableCell
                              className="text-xs py-1.5 max-w-[160px] truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[160px] cursor-default">
                                    {line.item_description || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{line.item_description || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              className="text-xs py-1.5 max-w-[100px] truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[100px] cursor-default">
                                    {line.product_category_name || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{line.product_category_name || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-xs py-1.5 text-right">
                              {line.qty || 0}
                            </TableCell>
                            <TableCell className="text-xs py-1.5">
                              {line.uom || "-"}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 text-right">
                              {parseFloat(line.unit_cost || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 text-right">
                              {parseFloat(line.amount || 0).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <h4 className="text-sm font-semibold">Supplier Selection</h4>
                <div className="space-y-1.5 relative">
                  <Label>
                    Supplier <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={
                        vendorDropdownOpenContract
                          ? vendorSearchContract
                          : selectedContractVendorName || vendorSearchContract
                      }
                      onChange={(e) => {
                        setVendorSearchContract(e.target.value);
                        setVendorDropdownOpenContract(true);
                        if (!e.target.value) {
                          setSelectedContractVendorId("");
                          setSelectedContractVendorName("");
                        }
                      }}
                      onFocus={() => setVendorDropdownOpenContract(true)}
                      onBlur={() =>
                        setTimeout(() => setVendorDropdownOpenContract(false), 200)
                      }
                      placeholder="Search suppliers..."
                      className="pl-8"
                      data-testid="input-vendor-search-contract"
                    />
                    {vendorDropdownOpenContract && (
                      <div className="absolute z-50 top-full left-0 w-full mt-1 border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                        {filteredVendorsContract.length === 0 ? (
                          <p className="text-sm text-muted-foreground p-2">
                            No suppliers found
                          </p>
                        ) : (
                          filteredVendorsContract.slice(0, 20).map((vendor) => {
                            const name =
                              vendor.companyName || vendor.company_name || "";
                            return (
                              <button
                                key={vendor.id}
                                className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSelectedContractVendorId(String(vendor.id));
                                  setSelectedContractVendorName(name);
                                  setVendorDropdownOpenContract(false);
                                  setVendorSearchContract("");
                                }}
                                data-testid={`vendor-contract-option-${vendor.id}`}
                              >
                                {name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
      </FormSheet>

      <FormSheet
        open={createBidDialogOpen}
        onOpenChange={(open) => {
          if (!createBidFromPRMutation.isPending) setCreateBidDialogOpen(open);
        }}
        title="Create Bid from PR"
        description="Select bid type, dates and optionally a template"
        onSubmit={handleCreateBidFromPR}
        submitLabel={createBidFromPRMutation.isPending ? "Creating..." : "Submit"}
        isSubmitting={createBidFromPRMutation.isPending}
        submitDisabled={
          createBidFromPRMutation.isPending ||
          !bidType ||
          !bidOpenDate ||
          !bidCloseDate
        }
        widthClassName="sm:max-w-[480px]"
      >
          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-destructive">*</span> Indicates mandatory fields
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">
                Bid Type <span className="text-red-500">*</span>
              </Label>
              <Select value={bidType} onValueChange={setBidType}>
                <SelectTrigger data-testid="select-bid-type">
                  <SelectValue placeholder="Select Bid Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RFQ">RFQ</SelectItem>
                  <SelectItem value="RFP">RFP</SelectItem>
                  <SelectItem value="Tender">Tender</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                Open Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="datetime-local"
                value={bidOpenDate}
                onChange={(e) => handleBidDateChange("open", e.target.value)}
                data-testid="input-bid-open-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                Close Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="datetime-local"
                value={bidCloseDate}
                onChange={(e) => handleBidDateChange("close", e.target.value)}
                data-testid="input-bid-close-date"
                min={bidOpenDate}
              />
            </div>
            { bidType === "Tender" && (
              <div className="space-y-1.5">
              <Label className="text-sm">
                Envelope Open Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="datetime-local"
                value={bidEnvelopeOpenDate}
                onChange={(e) => handleBidDateChange("envelope", e.target.value)}
                data-testid="input-bid-envelope-open-date"
                min={bidCloseDate}
              />
            </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Copy From Template</Label>
              <Select value={bidTemplateId} onValueChange={setBidTemplateId}>
                <SelectTrigger data-testid="select-bid-template">
                  <SelectValue placeholder="Select Template" />
                </SelectTrigger>
                <SelectContent>
                  {templateBids.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.templateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
      </FormSheet>
    </div>
  );
}
