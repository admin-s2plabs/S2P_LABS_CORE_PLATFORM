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
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  Truck,
  Upload,
  User,
  UserCheck,
  Users,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

interface User {
  id: number;
  name: string;
  email_id: string;
  user_name: string;
  designation: string;
  department_name: string;
  mobile_no: string;
  phone_no: string;
  user_status: number;
  user_type: number;
  created_by: string;
  creation_date: string;
  last_login_date: string;
  activated: string;
  role_name: string;
  company: string;
  org_id: number | null;
  attribute_12: string | null;
  manager_id: string | null;
  manager_name: string | null;
  attribute_1: string | null;
}

interface Role {
  id: number;
  role_name: string;
  role_display_name: string;
  description: string;
  status: number;
}

interface Organization {
  id: number;
  organization_name: string;
}

interface OrgDetailsResponse {
  org_country?: string | null;
}

interface PaginatedResponse {
  data: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatSelectedBusinessEntityNames(
  orgIds: string[],
  organizations: Organization[],
): string {
  return orgIds
    .map((id) => organizations.find((o) => String(o.id) === id)?.organization_name)
    .filter((n): n is string => Boolean(n?.trim()))
    .join(", ");
}

export default function ManageUsers() {
  const { toast } = useToast();
  const [location] = useLocation();
  function getSearchParams(): URLSearchParams {
    if (typeof window !== "undefined" && window.location?.search) {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams(location.split("?")[1] || "");
  }

  const queryParams = getSearchParams();
  const initialTab =
    queryParams.get("type") === "supplier" ? "supplier" : "organization";
  const initialStatus = queryParams.get("status") || "all";
  const initialSearch = queryParams.get("search") || "";

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);

  // Keep tab and filters in sync with URL query params when navigating via links
  useEffect(() => {
    const queryParams = getSearchParams();
    const type = queryParams.get("type") || "organization";
    const status = queryParams.get("status") || "all";
    const search = queryParams.get("search") || "";

    setActiveTab(type === "supplier" ? "supplier" : "organization");
    setStatusFilter(status);
    setSearchQuery(search);
    setDebouncedSearch(search);
  }, [location]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email_id: "",
    mobile_no: "",
    department_name: "",
    designation: "",
    org_id: [] as string[],
    role_id: "",
    reporting_to: "",
    user_type: 0,
  });
  const [editUser, setEditUser] = useState({
    id: 0,
    name: "",
    email_id: "",
    mobile_no: "",
    department_name: "",
    designation: "",
    org_id: [] as string[],
    reporting_to: "",
    user_status: 1,
  });
  const [originalOrgIds, setOriginalOrgIds] = useState<string[]>([]);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [selectedAvailableRoles, setSelectedAvailableRoles] = useState<
    number[]
  >([]);
  const [selectedAssignedRoles, setSelectedAssignedRoles] = useState<number[]>(
    [],
  );
  const [assignedRoleIds, setAssignedRoleIds] = useState<number[]>([]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to page 1 on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when tab or filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, statusFilter]);

  const userType = activeTab === "organization" ? "0" : "1";

  const { data: usersResponse, isLoading } = useQuery<PaginatedResponse>({
    queryKey: [
      "/api/users",
      { page, limit, userType, search: debouncedSearch, status: statusFilter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        userType,
        search: debouncedSearch,
        status: statusFilter,
      });
      const res = await apiRequest("GET", `/api/users?${params}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Get counts for tabs (separate queries without pagination)
  const { data: orgCountData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/users", { userType: "0", limit: 1 }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users?userType=0&limit=1");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: supplierCountData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/users", { userType: "1", limit: 1 }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users?userType=1&limit=1");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: userRoles = [] } = useQuery<Role[]>({
    queryKey: ["/api/users", selectedUser?.id, "roles"],
    enabled: !!selectedUser,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Queries for create user dialog
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: orgDetails } = useQuery<OrgDetailsResponse>({
    queryKey: ["/api/org-details"],
  });

  const { data: departments = [] } = useQuery<{ id: number; value: string }[]>({
    queryKey: ["/api/departments"],
  });

  const defaultPhoneDialCode = getDialCodeByIso(orgDetails?.org_country || "");

  // Fetch organization users for Reporting To dropdown (only org users, not suppliers)
  const { data: orgUsersForReporting = [] } = useQuery<User[]>({
    queryKey: ["/api/users/org-users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/org-users");
      if (!res.ok) throw new Error("Failed to fetch org users");
      return res.json();
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      return apiRequest("POST", "/api/users", {
        ...userData,
        org_id: userData.org_id.length ? userData.org_id.join(",") : null,
        role_id: userData.role_id ? parseInt(userData.role_id) : null,
        user_type: activeTab === "organization" ? 0 : 1,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User created successfully" });
      setShowCreateDialog(false);
      setNewUser({
        name: "",
        email_id: "",
        mobile_no: "",
        department_name: "",
        designation: "",
        org_id: [],
        role_id: "",
        reporting_to: "",
        user_type: 0,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!newUser.email_id.trim()) {
      errors.email_id = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email_id)) {
      errors.email_id = "Enter a valid email address";
    }
    if (!newUser.name.trim()) errors.name = "Full name is required";
    if (!newUser.designation.trim()) errors.designation = "Designation is required";
    if (!newUser.department_name) errors.department_name = "Department is required";
    if (!newUser.org_id.length) errors.org_id = "Business entity is required";
    if (!newUser.role_id) errors.role_id = "Role is required";
    if (!newUser.mobile_no.trim()) {
      errors.mobile_no = "Phone is required";
    } else if (!validatePhoneNumber(newUser.mobile_no)) {
      errors.mobile_no = getPhoneValidationMessage(newUser.mobile_no);
    }
    if (activeTab === "organization" && !newUser.reporting_to) errors.reporting_to = "Reporting To is required";

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }
    setCreateErrors({});
    createUserMutation.mutate(newUser);
  };

  const updateUserMutation = useMutation({
    mutationFn: async (userData: typeof editUser) => {
      const removedOrgIds = originalOrgIds.filter((id) => !userData.org_id.includes(id));
      return apiRequest("PUT", `/api/users/${userData.id}`, {
        name: userData.name,
        email_id: userData.email_id,
        mobile_no: userData.mobile_no,
        department_name: userData.department_name,
        designation: userData.designation,
        org_id: userData.org_id.length ? userData.org_id.join(",") : null,
        removedOrgIds: removedOrgIds.length ? removedOrgIds.join(",") : null,
        role_ids: assignedRoleIds,
        reporting_to: userData.reporting_to
          ? parseInt(userData.reporting_to)
          : null,
        user_status: userData.user_status,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User updated successfully" });
      setShowEditSheet(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({
      userId,
      newStatus,
    }: {
      userId: number;
      newStatus: number;
    }) => {
      return apiRequest("PATCH", `/api/users/${userId}/status`, {
        user_status: newStatus,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("POST", `/api/users/${userId}/reset-password`, {});
    },
    onSuccess: () => {
      toast({
        title: "Password Reset",
        description:
          "Password has been reset and an email has been sent to the user with the new credentials.",
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

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  const [isExporting, setIsExporting] = useState(false);

  const buildUserExportParams = () => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", "0");
    params.set("userType", userType);
    params.set("search", debouncedSearch.trim());
    params.set("status", statusFilter);
    return params;
  };

  const fetchExportData = async (): Promise<PaginatedResponse> => {
    const res = await apiRequest("GET", `/api/users?${buildUserExportParams().toString()}`);
    return res.json();
  };

  // Export functions
  const getExportData = async () => {
    const result = await fetchExportData();
    const exportUsers = result.data || [];

    return exportUsers.map((user) => ({
      Name: user.name || "",
      Email: user.email_id || "",
      Designation: user.designation || "",
      Phone: user.phone_no || user.mobile_no || "",
      Department: user.department_name || "",
      Role: user.role_name
        ? user.role_name.replace("ROLE_", "").replace(/_/g, " ")
        : "",
      "Business Entity": user.attribute_1
        ? user.attribute_1
          .split(",")
          .filter((item) => item.trim() !== "")
          .map((item) => item.trim())
          .join(", ")
        : "",
      Status: user.user_status === 1 ? "Active" : "Inactive",
      Type: activeTab === "organization" ? "Organization" : "Supplier",
    }));
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
    const data = await getExportData();
    if (data.length === 0) {
      toast({
        title: "No data to export",
        description: "No users match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}_users_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export users",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToXLS = async () => {
    setIsExporting(true);
    try {
    const data = await getExportData();
    if (data.length === 0) {
      toast({
        title: "No data to export",
        description: "No users match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(
      wb,
      `${activeTab}_users_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    toast({ title: "Exported to Excel" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export users",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
    const data = await getExportData();
    if (data.length === 0) {
      toast({
        title: "No data to export",
        description: "No users match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const columns = ["Name", "Email", "Designation", "Phone", "Department", "Role", "Business Entity", "Status", "Type"];
    const rows = data.map((d) => [d.Name, d.Email, d.Designation, d.Phone, d.Department, d.Role, d["Business Entity"], d.Status, d.Type]);
    generateTablePdf({
      title: `${activeTab === "organization" ? "Organization" : "Supplier"} Users`,
      columns,
      rows,
      filename: `${activeTab}_users_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export users",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    const orgIds = user.attribute_12 ? user.attribute_12.toString().split(",").map((s) => s.trim()).filter(Boolean) : [];
    setOriginalOrgIds(orgIds);
    setEditUser({
      id: user.id,
      name: user.name || "",
      email_id: user.email_id || "",
      mobile_no: user.mobile_no || "",
      department_name: user.department_name || "",
      designation: user.designation || "",
      org_id: orgIds,
      reporting_to: user.manager_id || "",
      user_status: user.user_status,
    });
    setSelectedAvailableRoles([]);
    setSelectedAssignedRoles([]);
    const userRoleIds = user.role_name
      ? user.role_name
      .split(",")
      .map((roleName) =>
        roles.find(
          (r) => r.role_name === roleName.trim()
        )?.id
      )
      .filter(Boolean) as number[]
      : [];
    setAssignedRoleIds(userRoleIds);
    setShowEditSheet(true);
  };

  const moveToAssigned = () => {
    setAssignedRoleIds([...assignedRoleIds, ...selectedAvailableRoles]);
    setSelectedAvailableRoles([]);
  };

  const moveToAvailable = () => {
    setAssignedRoleIds(
      assignedRoleIds.filter((id) => !selectedAssignedRoles.includes(id)),
    );
    setSelectedAssignedRoles([]);
  };

  const toggleAvailableRole = (roleId: number) => {
    setSelectedAvailableRoles((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    );
  };

  const toggleAssignedRole = (roleId: number) => {
    setSelectedAssignedRoles((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    );
  };

  const availableRoles = roles.filter(
    (role) => !assignedRoleIds.includes(role.id),
  );
  const assignedRoles = roles.filter((role) =>
    assignedRoleIds.includes(role.id),
  );

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!editUser.name.trim()) errors.name = "Full name is required";
    if (!editUser.designation.trim()) errors.designation = "Designation is required";
    if (!editUser.department_name) errors.department_name = "Department is required";
    if (!editUser.org_id.length) errors.org_id = "Business entity is required";
    if (!editUser.mobile_no.trim()) {
      errors.mobile_no = "Phone is required";
    } else if (!validatePhoneNumber(editUser.mobile_no)) {
      errors.mobile_no = getPhoneValidationMessage(editUser.mobile_no);
    }
    if (activeTab === "organization" && !editUser.reporting_to) errors.reporting_to = "Reporting To is required";

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }
    setEditErrors({});
    updateUserMutation.mutate(editUser);
  };

  const users = usersResponse?.data || [];
  const pagination = usersResponse?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  };
  const orgTotal = orgCountData?.pagination?.total || 0;
  const supplierTotal = supplierCountData?.pagination?.total || 0;

  const getStatusBadge = (status: number) => {
    if (status === 1) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-xs px-1.5 py-0">
          Active
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-xs px-1.5 py-0">
        Inactive
      </Badge>
    );
  };

  const getUserTypeBadge = (type: number) => {
    if (type === 0) {
      return (
        <Badge
          variant="outline"
          className="border-blue-300 text-blue-600 text-xs px-1.5 py-0"
        >
          Internal
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="border-purple-300 text-purple-600 text-xs px-1.5 py-0"
      >
        External
      </Badge>
    );
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            Manage Users
          </h1>
          <p className="text-sm text-muted-foreground">
            View and manage system users
          </p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <TabsList className="grid max-w-sm grid-cols-2">
            <TabsTrigger
              value="organization"
              className="flex items-center gap-1.5 text-sm"
              data-testid="tab-organization-users"
            >
              <Building className="h-3.5 w-3.5" />
              Organization ({orgTotal})
            </TabsTrigger>
            <TabsTrigger
              value="supplier"
              className="flex items-center gap-1.5 text-sm"
              data-testid="tab-supplier-users"
            >
              <Truck className="h-3.5 w-3.5" />
              Supplier ({supplierTotal})
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              {pagination.total}{" "}
              {debouncedSearch || statusFilter !== "all" ? "matching" : "total"}
            </span>
            {activeTab === "organization" && (
              <Button
                size="sm"
                onClick={() => setShowCreateDialog(true)}
                data-testid="button-create-user"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create New User
              </Button>
            )}
          </div>
        </div>

        <Card>
          <div className="p-3 border-b">
            <div className="flex flex-col sm:flex-row gap-2 justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, role, business entity..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-users"
                />
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger
                    className="w-[120px] h-8 text-sm"
                    data-testid="select-status-filter"
                  >
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

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
                      <FileDown className="h-4 w-4 mr-2" />
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
          </div>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <>
                <Table className="text-sm table-fixed">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          Name
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          Email ID
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" />
                          Contact
                        </span>
                      </TableHead>
                      {activeTab === "organization" ? <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                        <span className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          Department
                        </span>
                      </TableHead> : <></>}
                      <TableHead className="h-9 py-2 text-xs font-medium w-[140px]">
                        <span className="flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5" />
                          Role
                        </span>
                      </TableHead>
                      {activeTab === "organization" ? <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                        <span className="flex items-center gap-1.5">
                          <Building className="h-3.5 w-3.5" />
                          Business Entity
                        </span>
                      </TableHead> : <></>}
                      <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                        <span className="flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5" />
                          Status
                        </span>
                      </TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[60px]">
                        <span className="flex items-center gap-1.5">
                          <Settings className="h-3.5 w-3.5" />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow
                        key={user.id}
                        data-testid={`row-user-${user.id}`}
                      >
                        <TableCell
                          className="py-1.5 font-medium text-sm truncate"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[120px] cursor-default">
                                {activeTab === "supplier" ? user.attribute_1 || "-" : user.name || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{activeTab === "supplier" ? user.attribute_1 || "-" : user.name || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell
                          className="py-1.5 text-sm truncate"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[180px] cursor-default">
                                {user.email_id || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{user.email_id || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell
                          className="py-1.5 text-sm truncate"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[120px] cursor-default">
                                {user.phone_no || user.mobile_no || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{user.phone_no || user.mobile_no || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        {activeTab === "organization" ? <TableCell
                          className="py-1.5 text-sm truncate"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[120px] cursor-default">
                                {user.department_name || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{user.department_name || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell> : <></>}
                        <TableCell
                          className="py-1.5 text-sm truncate"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[140px] cursor-default">
                                {user.role_name
                                  ? user.role_name
                                    .replace("ROLE_", "")
                                    .replace(/_/g, " ")
                                  : "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{user.role_name
                                ? user.role_name
                                  .replace("ROLE_", "")
                                  .replace(/_/g, " ")
                                : "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        {activeTab === "organization" ? <TableCell
                          className="py-1.5 text-sm truncate"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[120px] cursor-default">
                                {user.attribute_1 ? user.attribute_1
                                  .split(",")
                                  .filter((item) => item.trim() !== "")
                                  .map((item) => item.trim())
                                  .join(", ") : "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{user.attribute_1 ? user.attribute_1
                                .split(",")
                                .filter((item) => item.trim() !== "")
                                .map((item) => item.trim())
                                .join(", ") : "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell> : <></>}
                        <TableCell className="py-1.5">
                          <Switch
                            checked={user.user_status === 1}
                            onCheckedChange={(checked) => {
                              toggleStatusMutation.mutate({
                                userId: user.id,
                                newStatus: checked ? 1 : 2,
                              });
                            }}
                            disabled={toggleStatusMutation.isPending}
                            data-testid={`switch-status-${user.id}`}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-1">
                            {activeTab === "organization" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEditUser(user)}
                                title="Edit User"
                                data-testid={`button-edit-user-${user.id}`}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setResetPasswordUser(user)}
                              disabled={resetPasswordMutation.isPending}
                              title="Reset Password"
                              data-testid={`button-reset-password-${user.id}`}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  data-testid={`button-delete-user-${user.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this user?
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel data-testid="button-delete-cancel">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUserMutation.mutate(user.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    data-testid={`button-delete-user-${user.id}`}
                                  >
                                    {deleteUserMutation.isPending && (
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    )}
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center py-6 text-muted-foreground"
                        >
                          No users found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between border-t px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rows:</span>
                    <Select
                      value={limit.toString()}
                      onValueChange={(v) => {
                        setLimit(parseInt(v));
                        setPage(1);
                      }}
                    >
                      <SelectTrigger
                        className="w-[60px] h-7 text-xs"
                        data-testid="select-page-size"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {pagination.total > 0
                        ? `${(page - 1) * limit + 1}-${Math.min(page * limit, pagination.total)} of ${pagination.total}`
                        : "0 results"}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs px-1">
                        {page}/{pagination.totalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setPage((p) => Math.min(pagination.totalPages, p + 1))
                        }
                        disabled={page >= pagination.totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </Tabs>

      <Sheet
        open={showEditSheet}
        onOpenChange={(open) => {
          setShowEditSheet(open);
          if (!open) { setSelectedUser(null); setEditErrors({}); }
        }}
      >
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto p-4">
          <SheetHeader className="space-y-0 pb-1">
            <SheetTitle className="text-base">Edit User</SheetTitle>
            <p className="text-xs text-muted-foreground text-right">
              * indicates mandatory fields
            </p>
          </SheetHeader>
          {selectedUser && (
            <form onSubmit={handleUpdateUser} className="space-y-3 mt-2">
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email ID <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-email"
                    type="email"
                    value={editUser.email_id}
                    disabled
                    className="pl-9 bg-muted"
                    data-testid="input-edit-user-email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="edit-name"
                    value={editUser.name}
                    onChange={(e) => {
                      setEditUser({ ...editUser, name: e.target.value });
                      if (e.target.value.trim()) setEditErrors((p) => ({ ...p, name: "" }));
                    }}
                    placeholder="Full name"
                    className={editErrors.name ? "border-destructive" : ""}
                    data-testid="input-edit-user-name"
                  />
                  {editErrors.name && <p className="text-xs text-destructive mt-1">{editErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-designation">Designation <span className="text-destructive">*</span></Label>
                  <Input
                    id="edit-designation"
                    value={editUser.designation}
                    onChange={(e) => {
                      setEditUser({ ...editUser, designation: e.target.value });
                      if (e.target.value.trim()) setEditErrors((p) => ({ ...p, designation: "" }));
                    }}
                    placeholder="Job title"
                    className={editErrors.designation ? "border-destructive" : ""}
                    data-testid="input-edit-user-designation"
                  />
                  {editErrors.designation && <p className="text-xs text-destructive mt-1">{editErrors.designation}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-department">Department <span className="text-destructive">*</span></Label>
                  <Select
                    value={editUser.department_name}
                    onValueChange={(v) => {
                      setEditUser({ ...editUser, department_name: v });
                      setEditErrors((p) => ({ ...p, department_name: "" }));
                    }}
                  >
                    <SelectTrigger className={editErrors.department_name ? "border-destructive" : ""} data-testid="select-edit-user-department">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.value}>
                          {dept.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editErrors.department_name && <p className="text-xs text-destructive mt-1">{editErrors.department_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-organization">Business Entity <span className="text-destructive">*</span></Label>
                  <Select
                    value=""
                    onValueChange={(value) => {
                      const id = value;
                      const next = editUser.org_id?.includes(id)
                        ? editUser.org_id
                        : [...(editUser.org_id || []), id];
                      setEditUser({ ...editUser, org_id: next });
                      setEditErrors((p) => ({ ...p, org_id: "" }));
                    }}
                  >
                    <SelectTrigger
                      className={editErrors.org_id ? "border-destructive" : "border-input"}
                      data-testid="select-edit-user-organization"
                    >
                      <span
                        className={
                          !editUser.org_id || editUser.org_id.length === 0
                            ? "text-muted-foreground"
                            : "text-sm font-medium"
                        }
                      >
                        {!editUser.org_id || editUser.org_id.length === 0
                          ? "Select business entities..."
                          : `${editUser.org_id.length} entit${editUser.org_id.length === 1 ? "y" : "ies"
                          } selected`}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id.toString()}>
                          {org.organization_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editUser.org_id.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {editUser.org_id.map((id) => {
                        const org = organizations.find((o) => String(o.id) === id);
                        return org ? (
                          <Badge key={id} variant="secondary" className="text-xs pl-2 pr-1 py-0.5 gap-1">
                            {org.organization_name}
                            <button
                              type="button"
                              onClick={() => setEditUser({ ...editUser, org_id: editUser.org_id.filter((x) => x !== id) })}
                              className="rounded-full opacity-60 hover:opacity-100 focus:outline-none"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                  {editErrors.org_id && <p className="text-xs text-destructive mt-1">{editErrors.org_id}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-mobile">Phone <span className="text-destructive">*</span></Label>
                  <PhoneInput
                    value={editUser.mobile_no}
                    onChange={(v) => {
                      setEditUser({ ...editUser, mobile_no: v });
                      if (editErrors.mobile_no) setEditErrors((p) => ({ ...p, mobile_no: "" }));
                    }}
                    defaultCountryCode={defaultPhoneDialCode}
                    data-testid="input-edit-user-mobile"
                  />
                  {editErrors.mobile_no && <p className="text-xs text-destructive mt-1">{editErrors.mobile_no}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reporting">Reporting To {activeTab === "organization" && <span className="text-destructive">*</span>}</Label>
                  <Select
                    value={editUser.reporting_to}
                    onValueChange={(v) => {
                      setEditUser({ ...editUser, reporting_to: v });
                      if (v) setEditErrors((p) => ({ ...p, reporting_to: "" }));
                    }}
                  >
                    <SelectTrigger className={editErrors.reporting_to ? "border-destructive" : ""} data-testid="select-edit-user-reporting">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {orgUsersForReporting
                        .filter((u) => u.id !== selectedUser.id)
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {editErrors.reporting_to && <p className="text-xs text-destructive mt-1">{editErrors.reporting_to}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Available Roles</Label>
                  <div className="border rounded-md h-48 overflow-y-auto p-2 space-y-1">
                    {availableRoles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAvailableRoles.includes(role.id)}
                          onChange={() => toggleAvailableRole(role.id)}
                          className="rounded border-gray-300"
                        />
                        {role.role_display_name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Assigned Roles</Label>
                  <div className="border rounded-md h-48 overflow-y-auto p-2 space-y-1">
                    {assignedRoles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAssignedRoles.includes(role.id)}
                          onChange={() => toggleAssignedRole(role.id)}
                          className="rounded border-gray-300"
                        />
                        {role.role_display_name}
                      </label>
                    ))}
                    {assignedRoles.length === 0 && (
                      <p className="text-sm text-muted-foreground p-2">
                        No roles assigned
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={moveToAssigned}
                  disabled={selectedAvailableRoles.length === 0}
                  data-testid="button-move-to-assigned"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={moveToAvailable}
                  disabled={selectedAssignedRoles.length === 0}
                  data-testid="button-move-to-available"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEditSheet(false);
                    setSelectedUser(null);
                  }}
                  data-testid="button-cancel-edit-user"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  data-testid="button-submit-edit-user"
                >
                  {updateUserMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Update
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setCreateErrors({});
          setNewUser((prev) => ({
            ...prev,
            org_id: [],
          }));
        }
      }}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto p-4">
          <SheetHeader className="space-y-0 pb-1">
            <SheetTitle className="text-base">
              Create New{" "}
              {activeTab === "organization" ? "Organization" : "Supplier"} User
            </SheetTitle>
            <p className="text-xs text-muted-foreground text-right">
              * indicates mandatory fields
            </p>
          </SheetHeader>
          <form onSubmit={handleCreateUser} className="space-y-3 mt-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email ID <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={newUser.email_id}
                  onChange={(e) => {
                    setNewUser({ ...newUser, email_id: e.target.value });
                    if (e.target.value.trim()) setCreateErrors((p) => ({ ...p, email_id: "" }));
                  }}
                  placeholder="email@example.com"
                  className={`pl-9${createErrors.email_id ? " border-destructive" : ""}`}
                  data-testid="input-new-user-email"
                />
              </div>
              {createErrors.email_id && <p className="text-xs text-destructive mt-1">{createErrors.email_id}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => {
                    setNewUser({ ...newUser, name: e.target.value });
                    if (e.target.value.trim()) setCreateErrors((p) => ({ ...p, name: "" }));
                  }}
                  placeholder="Full name"
                  className={createErrors.name ? "border-destructive" : ""}
                  data-testid="input-new-user-name"
                />
                {createErrors.name && <p className="text-xs text-destructive mt-1">{createErrors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation">Designation <span className="text-destructive">*</span></Label>
                <Input
                  id="designation"
                  value={newUser.designation}
                  onChange={(e) => {
                    setNewUser({ ...newUser, designation: e.target.value });
                    if (e.target.value.trim()) setCreateErrors((p) => ({ ...p, designation: "" }));
                  }}
                  placeholder="Job title"
                  className={createErrors.designation ? "border-destructive" : ""}
                  data-testid="input-new-user-designation"
                />
                {createErrors.designation && <p className="text-xs text-destructive mt-1">{createErrors.designation}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department <span className="text-destructive">*</span></Label>
                <Select
                  value={newUser.department_name}
                  onValueChange={(v) => {
                    setNewUser({ ...newUser, department_name: v });
                    setCreateErrors((p) => ({ ...p, department_name: "" }));
                  }}
                >
                  <SelectTrigger className={createErrors.department_name ? "border-destructive" : ""} data-testid="select-new-user-department">
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.value}>
                        {dept.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createErrors.department_name && <p className="text-xs text-destructive mt-1">{createErrors.department_name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization">Business Entity <span className="text-destructive">*</span></Label>
                <Select
                  onValueChange={(value) => {
                    const id = value;
                    const next = newUser.org_id?.includes(id)
                      ? newUser.org_id
                      : [...(newUser.org_id || []), id];
                    setNewUser({ ...newUser, org_id: next });
                    setEditErrors((p) => ({ ...p, org_id: "" }));
                  }}
                >
                  <SelectTrigger
                    className={editErrors.org_id ? "border-destructive" : "border-input"}
                    data-testid="select-add-user-organization"
                  >
                    <span
                      className={
                        !newUser.org_id || newUser.org_id.length === 0
                          ? "text-muted-foreground"
                          : "text-sm font-medium"
                      }
                    >
                      {!newUser.org_id || newUser.org_id.length === 0
                        ? "Select business entities..."
                        : `${newUser.org_id.length} entit${newUser.org_id.length === 1 ? "y" : "ies"
                        } selected`}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id.toString()}>
                        {org.organization_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newUser.org_id.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {newUser.org_id.map((id) => {
                      const org = organizations.find((o) => String(o.id) === id);
                      return org ? (
                        <Badge key={id} variant="secondary" className="text-xs pl-2 pr-1 py-0.5 gap-1">
                          {org.organization_name}
                          <button
                            type="button"
                            onClick={() => setNewUser({ ...newUser, org_id: newUser.org_id.filter((x) => x !== id) })}
                            className="rounded-full opacity-60 hover:opacity-100 focus:outline-none"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
                {createErrors.org_id && <p className="text-xs text-destructive mt-1">{createErrors.org_id}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile">Phone <span className="text-destructive">*</span></Label>
                <PhoneInput
                  value={newUser.mobile_no}
                  onChange={(v) => {
                    setNewUser({ ...newUser, mobile_no: v });
                    if (v.trim()) setCreateErrors((p) => ({ ...p, mobile_no: "" }));
                  }}
                  defaultCountryCode={defaultPhoneDialCode}
                  data-testid="input-new-user-mobile"
                />
                {createErrors.mobile_no && <p className="text-xs text-destructive mt-1">{createErrors.mobile_no}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reporting_to">Reporting To {activeTab === "organization" && <span className="text-destructive">*</span>}</Label>
                <Select
                  value={newUser.reporting_to}
                  onValueChange={(v) => {
                    setNewUser({ ...newUser, reporting_to: v });
                    if (v) setCreateErrors((p) => ({ ...p, reporting_to: "" }));
                  }}
                >
                  <SelectTrigger className={createErrors.reporting_to ? "border-destructive" : ""} data-testid="select-new-user-reporting">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {orgUsersForReporting.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createErrors.reporting_to && <p className="text-xs text-destructive mt-1">{createErrors.reporting_to}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Assign Role <span className="text-destructive">*</span></Label>
              <Select
                value={newUser.role_id}
                onValueChange={(v) => {
                  setNewUser({ ...newUser, role_id: v });
                  setCreateErrors((p) => ({ ...p, role_id: "" }));
                }}
              >
                <SelectTrigger className={createErrors.role_id ? "border-destructive" : ""} data-testid="select-new-user-role">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {roles
                    .filter((role) => role.role_name !== "ROLE_SUPPLIER_ADMIN")
                    .map((role) => (
                      <SelectItem key={role.id} value={role.id.toString()}>
                        {role.role_name.replace("ROLE_", "").replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {createErrors.role_id && <p className="text-xs text-destructive mt-1">{createErrors.role_id}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreateDialog(false); setNewUser({ ...newUser, org_id: [] }) }}
                data-testid="button-cancel-create-user"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createUserMutation.isPending}
                data-testid="button-submit-create-user"
              >
                {createUserMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                )}
                Add
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Reset Password Confirmation Dialog */}
      <AlertDialog
        open={!!resetPasswordUser}
        onOpenChange={(open) => !open && setResetPasswordUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset the password for{" "}
              <strong>
                {resetPasswordUser?.name || resetPasswordUser?.email_id}
              </strong>
              ?
              <br />
              <br />A new password will be generated and sent to the user's
              email address.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset-password">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetPasswordUser) {
                  resetPasswordMutation.mutate(resetPasswordUser.id);
                  setResetPasswordUser(null);
                }
              }}
              disabled={resetPasswordMutation.isPending}
              data-testid="button-confirm-reset-password"
            >
              {resetPasswordMutation.isPending ? (
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
