import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Edit,
  FileDown,
  FileSpreadsheet,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  User
} from "lucide-react";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

interface RoleDelegation {
  id: number;
  from_user: string | null;
  from_user_name: string | null;
  to_user: string | null;
  to_user_name: string | null;
  role_id: string | null;
  from_date: string | null;
  to_date: string | null;
  status: string | null;
  comments: string | null;
  created_by: string | null;
  creation_date: string | null;
  last_modified_by: string | null;
  last_modified_date: string | null;
}

interface UserData {
  id: number;
  email_id: string;
  name: string;
}

interface Role {
  id: number;
  role_id: string;
  role_name: string;
  role_display_name: string | null;
}

interface OrgUser {
  id: number;
  name: string;
  email_id: string;
  designation: string | null;
}

interface PaginatedDelegationResponse {
  data: RoleDelegation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function RoleDelegation() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedDelegation, setSelectedDelegation] = useState<RoleDelegation | null>(null);

  const [fromUser, setFromUser] = useState("");
  const [toUser, setToUser] = useState("");
  const [roleId, setRoleId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [comments, setComments] = useState("");
  const [status, setStatus] = useState("Active");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data: delegationsResponse, isLoading } = useQuery<PaginatedDelegationResponse>({
    queryKey: ["/api/role-delegations", { page, limit, search: debouncedSearch, status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search: debouncedSearch,
        status: statusFilter,
      });
      const res = await apiRequest("GET", `/api/role-delegations?${params}`);
      if (!res.ok) throw new Error("Failed to fetch delegations");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const delegations = delegationsResponse?.data || [];
  const pagination = delegationsResponse?.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 };

  // Fetch only organization users for From/To user dropdowns
  const { data: users = [] } = useQuery<OrgUser[]>({
    queryKey: ["/api/users/org-users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/org-users");
      if (!res.ok) throw new Error("Failed to fetch org users");
      return res.json();
    },
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/role-delegations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/role-delegations"] });
      toast({ title: "Delegation created successfully" });
      handleCloseCreate();
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to create delegation", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PATCH", `/api/role-delegations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/role-delegations"] });
      toast({ title: "Delegation updated successfully" });
      handleCloseEdit();
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to update delegation", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/role-delegations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/role-delegations"] });
      toast({ title: "Delegation deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to delete delegation", variant: "destructive" });
    },
  });

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    setFromUser("");
    setToUser("");
    setRoleId("");
    setFromDate("");
    setToDate("");
    setComments("");
    setStatus("Active");
  };

  const handleCloseEdit = () => {
    setIsEditOpen(false);
    setSelectedDelegation(null);
    setFromUser("");
    setToUser("");
    setRoleId("");
    setFromDate("");
    setToDate("");
    setComments("");
    setStatus("Active");
  };

  const handleCreate = () => {
    if (!fromUser || !toUser || !fromDate || !toDate || !comments) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (fromUser === toUser) {
      toast({ title: "From User and To User cannot be the same", variant: "destructive" });
      return;
    }

    const fromUserObj = users.find(u => u.email_id === fromUser);
    const toUserObj = users.find(u => u.email_id === toUser);

    createMutation.mutate({
      from_user: fromUser,
      from_user_name: fromUserObj?.name || fromUser,
      to_user: toUser,
      to_user_name: toUserObj?.name || toUser,
      role_id: roleId,
      from_date: fromDate,
      to_date: toDate,
      comments,
      status,
    });
  };

  const handleUpdate = () => {
    if (!selectedDelegation) return;

    if (fromUser === toUser) {
      toast({ title: "From User and To User cannot be the same", variant: "destructive" });
      return;
    }

    const fromUserObj = users.find(u => u.email_id === fromUser);
    const toUserObj = users.find(u => u.email_id === toUser);

    updateMutation.mutate({
      id: selectedDelegation.id,
      data: {
        from_user: fromUser,
        from_user_name: fromUserObj?.name || fromUser,
        to_user: toUser,
        to_user_name: toUserObj?.name || toUser,
        role_id: roleId,
        from_date: fromDate,
        to_date: toDate,
        comments,
        status,
      },
    });
  };

  const handleEdit = (delegation: RoleDelegation) => {
    setSelectedDelegation(delegation);
    setFromUser(delegation.from_user || "");
    setToUser(delegation.to_user || "");
    setRoleId(delegation.role_id || "");
    setFromDate(delegation.from_date ? delegation.from_date.split("T")[0] : "");
    setToDate(delegation.to_date ? delegation.to_date.split("T")[0] : "");
    setComments(delegation.comments || "");
    setStatus(delegation.status || "Active");
    setIsEditOpen(true);
  };

  const getStatusBadge = (status: string | null) => {
    if (status === "Active") {
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-xs px-1.5 py-0">Active</Badge>;
    }
    return <Badge className="bg-gray-500/10 text-gray-600 border-gray-200 text-xs px-1.5 py-0">Inactive</Badge>;
  };

  const getRoleDisplayName = (roleId: string | null) => {
    if (!roleId) return "-";
    const role = roles.find(r => r.role_id === roleId);
    return role?.role_display_name || role?.role_name || roleId;
  };

  const getExportData = () => {
    return delegations.map(d => ({
      "From User": d.from_user_name || d.from_user || "",
      "From Email": d.from_user || "",
      "To User": d.to_user_name || d.to_user || "",
      "To Email": d.to_user || "",
      "Role": getRoleDisplayName(d.role_id),
      "From Date": d.from_date ? formatDate(d.from_date) : "",
      "To Date": d.to_date ? formatDate(d.to_date) : "",
      "Status": d.status || "",
      "Comments": d.comments || "",
    }));
  };

  const exportToCSV = () => {
    const data = getExportData();
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `role_delegations_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
  };

  const exportToXLS = () => {
    const data = getExportData();
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Role Delegations");
    XLSX.writeFile(wb, `role_delegations_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportToPDF = () => {
    const data = getExportData();
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const columns = ["From User", "From Email", "To User", "To Email", "Role", "From Date", "To Date", "Status", "Comments"];
    const rows = data.map((d) => [d["From User"], d["From Email"], d["To User"], d["To Email"], d["Role"], d["From Date"], d["To Date"], d["Status"], d["Comments"]]);
    generateTablePdf({
      title: "Role Delegations",
      columns,
      rows,
      filename: `role_delegations_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Role Delegation</h1>
          <p className="text-sm text-muted-foreground">Manage temporary role delegations between users</p>
        </div>
        <Button
          size="sm"
          className="h-8"
          onClick={() => setIsCreateOpen(true)}
          data-testid="button-create-delegation"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Delegation
        </Button>
      </div>

      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search delegations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-delegations"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-8 text-sm" data-testid="select-status-filter">
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
                  <Button size="sm" variant="outline" className="h-8" data-testid="button-export-menu">
                    <Upload className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportToPDF} data-testid="menu-export-pdf">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToXLS} data-testid="menu-export-xls">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as XLS
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToCSV} data-testid="menu-export-csv">
                    <Upload className="h-4 w-4 mr-2" />
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
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      From User
                    </span>
                  </TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      To User
                    </span>
                  </TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Reason
                    </span>
                  </TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      From Date
                    </span>
                  </TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      To Date
                    </span>
                  </TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Status
                    </span>
                  </TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium w-[60px]">
                    <span className="flex items-center gap-1.5">
                      <Edit className="h-3.5 w-3.5" />
                      Actions
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delegations.map((delegation) => (
                  <TableRow key={delegation.id} className="group" data-testid={`row-delegation-${delegation.id}`}>
                    <TableCell className="py-2">
                      <div>
                        <p className="font-medium text-sm">{delegation.from_user_name || "-"}</p>
                        <p className="text-xs text-muted-foreground">{delegation.from_user}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div>
                        <p className="font-medium text-sm">{delegation.to_user_name || "-"}</p>
                        <p className="text-xs text-muted-foreground">{delegation.to_user}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-sm">
                      {delegation.comments || "-"}
                    </TableCell>
                    <TableCell className="py-2 text-sm">
                      {delegation.from_date ? formatDate(delegation.from_date) : "-"}
                    </TableCell>
                    <TableCell className="py-2 text-sm">
                      {delegation.to_date ? formatDate(delegation.to_date) : "-"}
                    </TableCell>
                    <TableCell className="py-2">{getStatusBadge(delegation.status)}</TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(delegation)}
                          data-testid={`button-edit-${delegation.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(delegation.id)}
                          data-testid={`button-delete-${delegation.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {delegations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No delegations found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {/* Pagination Controls */}
          <div className="flex items-center justify-between border-t px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Rows:</span>
              <Select value={limit.toString()} onValueChange={(v) => { setLimit(parseInt(v)); setPage(1); }}>
                <SelectTrigger className="w-[60px] h-7 text-xs" data-testid="select-page-size">
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
                  : "0 results"
                }
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
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
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Delegation FormSheet */}
      <FormSheet
        open={isCreateOpen}
        onOpenChange={(open) => (open ? setIsCreateOpen(true) : handleCloseCreate())}
        title="New Role Delegation"
        onCancel={handleCloseCreate}
        onSubmit={handleCreate}
        submitLabel={createMutation.isPending ? "Creating..." : "Create"}
        isSubmitting={createMutation.isPending}
      >
        <p className="text-xs text-muted-foreground mb-4">
          <span className="text-destructive">*</span> Indicates mandatory fields
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> From User <span className="text-destructive">*</span>
              </Label>
              <Select value={fromUser} onValueChange={setFromUser}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-from-user">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.email_id}>
                      {u.name} ({u.email_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> To User <span className="text-destructive">*</span>
              </Label>
              <Select value={toUser} onValueChange={setToUser}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-to-user">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.email_id}>
                      {u.name} ({u.email_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> From Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-sm"
                data-testid="input-from-date"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> To Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-sm"
                data-testid="input-to-date"
                min={fromDate || new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Enter reason for delegation..."
              className="text-sm min-h-[60px]"
              data-testid="input-comments"
            />
          </div>
        </div>
      </FormSheet>

      {/* Edit Delegation FormSheet */}
      <FormSheet
        open={isEditOpen}
        onOpenChange={(open) => (open ? setIsEditOpen(true) : handleCloseEdit())}
        title="Edit Role Delegation"
        onCancel={handleCloseEdit}
        onSubmit={handleUpdate}
        submitLabel={updateMutation.isPending ? "Updating..." : "Update"}
        isSubmitting={updateMutation.isPending}
      >
        <p className="text-xs text-muted-foreground mb-4">
          <span className="text-destructive">*</span> Indicates mandatory fields
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> From User <span className="text-destructive">*</span>
              </Label>
              <Select value={fromUser} onValueChange={setFromUser}>
                <SelectTrigger className="h-8 text-sm" data-testid="edit-select-from-user">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.email_id}>
                      {u.name} ({u.email_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> To User <span className="text-destructive">*</span>
              </Label>
              <Select value={toUser} onValueChange={setToUser}>
                <SelectTrigger className="h-8 text-sm" data-testid="edit-select-to-user">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.email_id}>
                      {u.name} ({u.email_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> From Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-sm"
                data-testid="edit-input-from-date"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> To Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-sm"
                data-testid="edit-input-to-date"
                min={fromDate || new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Enter reason for delegation..."
              className="text-sm min-h-[60px]"
              data-testid="edit-input-comments"
            />
          </div>
        </div>
      </FormSheet>
    </div>
  );
}
