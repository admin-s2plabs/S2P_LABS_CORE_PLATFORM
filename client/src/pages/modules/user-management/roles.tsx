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
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  FileDown,
  FileSpreadsheet,
  Key,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

interface Role {
  id: number;
  role_name: string;
  role_display_name: string;
  description: string;
  status: number;
  role_type: string;
  created_by: string;
  creation_date: string;
  start_date: string;
  end_date: string;
  role_id: string;
}

interface RoleFunction {
  id: number;
  function_name: string;
  description: string;
  module_name: string;
  category: string;
  status: number;
}

export default function ManageRoles() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [selectedFunctionIds, setSelectedFunctionIds] = useState<number[]>([]);
  const [functionSearch, setFunctionSearch] = useState("");

  // Create role state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSelectedFunctionIds, setNewSelectedFunctionIds] = useState<number[]>([]);
  const [newFunctionSearch, setNewFunctionSearch] = useState("");

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    staleTime: 0,
    refetchOnMount: true,
  });

  // All available functions for edit/create mode (filtered by role context)
  const { data: allFunctions = [] } = useQuery<RoleFunction[]>({
    queryKey: ["/api/functions", editingRole?.id],
    queryFn: async () => {
      const params = editingRole?.id ? `?roleId=${editingRole.id}` : '';
      const res = await apiRequest("GET", `/api/functions${params}`);
      if (!res.ok) throw new Error("Failed to fetch functions");
      return res.json();
    },
    enabled: !!editingRole || isCreateOpen,
  });

  // Functions for the role being edited
  const { data: editRoleFunctions = [] } = useQuery<RoleFunction[]>({
    queryKey: ["/api/roles", editingRole?.id, "functions"],
    enabled: !!editingRole,
  });

  // Set initial values when editing role opens
  useEffect(() => {
    if (editingRole) {
      setEditDisplayName(editingRole.role_display_name || "");
      setEditDescription(editingRole.description || "");
    }
  }, [editingRole]);

  // Set initial selected functions when data loads
  useEffect(() => {
    if (editRoleFunctions.length > 0) {
      setSelectedFunctionIds(editRoleFunctions.map(f => f.id));
    }
  }, [editRoleFunctions]);

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async (data: { role_display_name: string; description: string }) => {
      return apiRequest("PATCH", `/api/roles/${editingRole?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
    },
  });

  // Update role functions mutation
  const updateRoleFunctionsMutation = useMutation({
    mutationFn: async (function_ids: number[]) => {
      return apiRequest("PUT", `/api/roles/${editingRole?.id}/functions`, { function_ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", editingRole?.id, "functions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-menu"] });
    },
  });

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (data: { role_name: string; role_display_name: string; description: string }) => {
      return apiRequest("POST", "/api/roles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
    },
  });

  // Delete role mutation (only for User/Custom roles, not System roles)
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: number) => {
      return apiRequest("DELETE", `/api/roles/${roleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({ title: "Role deleted successfully" });
    },
    onError: (error: any) => {
      const raw = error?.message || "Failed to delete role";
      const match = raw.match(/^\d+: (.+)$/);
      const msg = match ? match[1] : raw;
      let parsed = msg;
      try { parsed = JSON.parse(msg)?.error || msg; } catch { }
      toast({ title: parsed || "Failed to delete role", variant: "destructive" });
    },
  });

  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !newDisplayName.trim()) {
      toast({ title: "Role name and display name are required", variant: "destructive" });
      return;
    }
    if (newSelectedFunctionIds.length === 0) {
      toast({ title: "At least one function must be assigned to the role", variant: "destructive" });
      return;
    }

    try {
      const response = await createRoleMutation.mutateAsync({
        role_name: newRoleName.toUpperCase().replace(/\s+/g, "_"),
        role_display_name: newDisplayName,
        description: newDescription,
      });

      // Assign functions if any selected - parse JSON from response
      const newRole = await (response as Response).json() as Role;
      if (newSelectedFunctionIds.length > 0 && newRole?.id) {
        await apiRequest("PUT", `/api/roles/${newRole.id}/functions`, { function_ids: newSelectedFunctionIds });
      }

      toast({ title: "Role created successfully" });
      handleCloseCreate();
    } catch (error: any) {
      toast({
        title: error?.message || "Failed to create role",
        variant: "destructive"
      });
    }
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    setNewRoleName("");
    setNewDisplayName("");
    setNewDescription("");
    setNewSelectedFunctionIds([]);
    setNewFunctionSearch("");
  };

  const handleSaveRole = async () => {
    if (selectedFunctionIds.length === 0) {
      toast({ title: "At least one function must be assigned to the role", variant: "destructive" });
      return;
    }
    try {
      await updateRoleMutation.mutateAsync({
        role_display_name: editDisplayName,
        description: editDescription,
      });
      await updateRoleFunctionsMutation.mutateAsync(selectedFunctionIds);
      toast({ title: "Role updated successfully" });
      setEditingRole(null);
      setFunctionSearch("");
    } catch (error) {
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  };

  const handleOpenEdit = (role: Role) => {
    setEditingRole(role);
    setSelectedFunctionIds([]);
    setFunctionSearch("");
  };

  const handleCloseEdit = () => {
    setEditingRole(null);
    setSelectedFunctionIds([]);
    setFunctionSearch("");
  };

  // Available functions (not selected)
  const availableFunctions = allFunctions.filter(
    f => !selectedFunctionIds.includes(f.id) &&
      (f.description?.toLowerCase().includes(functionSearch.toLowerCase()) ||
        f.function_name?.toLowerCase().includes(functionSearch.toLowerCase()) ||
        f.module_name?.toLowerCase().includes(functionSearch.toLowerCase()))
  );

  // Selected functions
  const selectedFunctions = allFunctions.filter(f => selectedFunctionIds.includes(f.id));

  // Available functions for create mode (not selected)
  const newAvailableFunctions = allFunctions.filter(
    f => !newSelectedFunctionIds.includes(f.id) &&
      (f.description?.toLowerCase().includes(newFunctionSearch.toLowerCase()) ||
        f.function_name?.toLowerCase().includes(newFunctionSearch.toLowerCase()) ||
        f.module_name?.toLowerCase().includes(newFunctionSearch.toLowerCase()))
  );

  // Selected functions for create mode
  const newSelectedFunctions = allFunctions.filter(f => newSelectedFunctionIds.includes(f.id));

  // Group functions by module
  const groupByModule = (functions: RoleFunction[]) => {
    return functions.reduce((acc, fn) => {
      const module = fn.module_name || "Other";
      if (!acc[module]) acc[module] = [];
      acc[module].push(fn);
      return acc;
    }, {} as Record<string, RoleFunction[]>);
  };

  const filteredRoles = roles.filter((role) => {
    const matchesSearch =
      (role.role_display_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (role.role_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (role.description?.toLowerCase() || "").includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "active" && role.status === 1) ||
      (statusFilter === "inactive" && role.status === 0);

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: number) => {
    if (status === 1) {
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-xs px-1.5 py-0">Active</Badge>;
    }
    return <Badge variant="secondary" className="text-xs px-1.5 py-0">Inactive</Badge>;
  };

  const getRoleTypeBadge = (type: string) => {
    if (type === "System Role") {
      return <Badge variant="outline" className="border-blue-300 text-blue-600 text-xs px-1.5 py-0">System</Badge>;
    }
    return <Badge variant="outline" className="text-xs px-1.5 py-0">Custom</Badge>;
  };

  // Export functions
  const getExportData = () => {
    return filteredRoles.map((role) => ({
      "Role Name": role.role_display_name || role.role_name || "",
      "Description": role.description || "",
      "Type": role.role_type || "",
      "Status": role.status === 1 ? "Active" : "Inactive"
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
    a.download = `roles_${new Date().toISOString().split("T")[0]}.csv`;
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
    XLSX.utils.book_append_sheet(wb, ws, "Roles");
    XLSX.writeFile(wb, `roles_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportToPDF = () => {
    const data = getExportData();
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const columns = ["Role Name", "Description", "Type", "Status"];
    const rows = data.map((d) => [d["Role Name"], d["Description"], d["Type"], d["Status"]]);
    generateTablePdf({
      title: "Manage Roles",
      columns,
      rows,
      filename: `roles_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Manage Roles</h1>
          <p className="text-sm text-muted-foreground">View and manage system roles and permissions</p>
        </div>
        <Button
          size="sm"
          className="h-8"
          onClick={() => setIsCreateOpen(true)}
          data-testid="button-create-role"
        >
          <Plus className="h-4 w-4 mr-1" />
          Create New Role
        </Button>
      </div>

      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search roles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-roles"
              />
            </div>
            <div className="flex items-center gap-2">
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
                      <Shield className="h-3.5 w-3.5" />
                      Role Name
                    </span>
                  </TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <FileDown className="h-3.5 w-3.5" />
                      Description
                    </span>
                  </TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Type
                    </span>
                  </TableHead>
                  {/* <TableHead className="h-9 py-2 text-xs font-medium">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Status
                    </span>
                  </TableHead> */}
                  <TableHead className="h-9 py-2 text-xs font-medium w-[60px]">
                    <span className="flex items-center gap-1.5">
                      <Edit className="h-3.5 w-3.5" />
                      Actions
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.map((role) => (
                  <TableRow key={role.id} data-testid={`row-role-${role.id}`}>
                    <TableCell className="py-1.5 text-sm font-medium">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm block truncate max-w-[240px] cursor-default">
                            {role.role_display_name || role.role_name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{role.role_display_name || role.role_name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="py-1.5 text-sm max-w-md truncate">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm block truncate max-w-[600px] cursor-default">
                            {role.description || "-"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{role.description || "-"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="py-1.5">{getRoleTypeBadge(role.role_type)}</TableCell>
                    {/* <TableCell className="py-1.5">{getStatusBadge(role.status)}</TableCell> */}
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleOpenEdit(role)}
                          data-testid={`button-edit-role-${role.id}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {role.role_type !== "System Role" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteRoleMutation.mutate(role.id)}
                            data-testid={`button-delete-role-${role.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRoles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      No roles found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Role FormSheet */}
      <FormSheet
        open={!!editingRole}
        onOpenChange={(open) => !open && handleCloseEdit()}
        title="Edit Role"
        widthClassName="sm:max-w-4xl"
        onCancel={handleCloseEdit}
        onSubmit={handleSaveRole}
        submitLabel="Update"
        isSubmitting={updateRoleMutation.isPending || updateRoleFunctionsMutation.isPending}
      >
        {editingRole && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground mb-2">
                <span className="text-destructive">*</span> Indicates mandatory fields
              </p>
              {/* Role Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Role Name (Read Only)</Label>
                  <Input
                    value={editingRole.role_name}
                    disabled
                    className="h-8 text-sm bg-muted"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Role Display Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="input-edit-display-name"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Role Description</Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="text-sm min-h-[60px]"
                  data-testid="input-edit-description"
                />
              </div>

              {/* Dual List Function Picker */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Key className="h-4 w-4" /> Assign Functions
                </Label>

                <div className="grid grid-cols-[1fr,auto,1fr] gap-2">
                  {/* Available Functions */}
                  <div className="border rounded-lg">
                    <div className="p-2 border-b bg-muted/50">
                      <p className="text-xs font-medium mb-1">Available Functions</p>
                      <Input
                        placeholder="Search..."
                        value={functionSearch}
                        onChange={(e) => setFunctionSearch(e.target.value)}
                        className="h-7 text-xs"
                        data-testid="input-function-search"
                      />
                    </div>
                    <ScrollArea className="h-[280px]">
                      <div className="p-1">
                        {Object.entries(groupByModule(availableFunctions)).map(([module, fns]) => (
                          <div key={module} className="mb-2">
                            <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">{module}</p>
                            {fns.map((fn) => (
                              <div
                                key={fn.id}
                                className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 rounded cursor-pointer"
                                onClick={() => setSelectedFunctionIds(prev => prev.includes(fn.id) ? prev : [...prev, fn.id])}
                              >
                                <Checkbox
                                  checked={false}
                                  className="h-3.5 w-3.5"
                                />
                                <span className="text-xs truncate">{fn.description || fn.function_name}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                        {availableFunctions.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">No functions available</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Arrow buttons */}
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => {
                        // Add all available to selected (with deduplication)
                        const newIds = availableFunctions.map(f => f.id);
                        setSelectedFunctionIds(prev => Array.from(new Set([...prev, ...newIds])));
                      }}
                      data-testid="button-add-all"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => {
                        // Remove all selected
                        setSelectedFunctionIds([]);
                      }}
                      data-testid="button-remove-all"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Selected Functions */}
                  <div className="border rounded-lg">
                    <div className="p-2 border-b bg-muted/50">
                      <p className="text-xs font-medium">Selected Functions ({selectedFunctionIds.length})</p>
                    </div>
                    <ScrollArea className="h-[300px]">
                      <div className="p-1">
                        {Object.entries(groupByModule(selectedFunctions)).map(([module, fns]) => (
                          <div key={module} className="mb-2">
                            <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">{module}</p>
                            {fns.map((fn) => (
                              <div
                                key={fn.id}
                                className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 rounded cursor-pointer"
                                onClick={() => setSelectedFunctionIds(selectedFunctionIds.filter(id => id !== fn.id))}
                              >
                                <Checkbox
                                  checked={true}
                                  className="h-3.5 w-3.5"
                                />
                                <span className="text-xs truncate">{fn.description || fn.function_name}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                        {selectedFunctions.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">No functions selected</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </div>
          )}
      </FormSheet>

      {/* Create Role FormSheet */}
      <FormSheet
        open={isCreateOpen}
        onOpenChange={(open) => (open ? setIsCreateOpen(true) : handleCloseCreate())}
        title="Create New Role"
        widthClassName="sm:max-w-4xl"
        onCancel={handleCloseCreate}
        onSubmit={handleCreateRole}
        submitLabel="Create"
        isSubmitting={createRoleMutation.isPending}
        submitDisabled={!newRoleName.trim() || !newDisplayName.trim()}
      >
          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-destructive">*</span> Indicates mandatory fields
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Role Name <span className="text-destructive">*</span></Label>
                <Input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g., ROLE_CUSTOM_BUYER"
                  className="h-8 text-sm"
                  data-testid="input-new-role-name"
                />
                <p className="text-xs text-muted-foreground">
                  Will be formatted: {newRoleName ? newRoleName.toUpperCase().replace(/\s+/g, "_") : "ROLE_NAME"}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Display Name <span className="text-destructive">*</span></Label>
                <Input
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="e.g., Custom Buyer"
                  className="h-8 text-sm"
                  data-testid="input-new-display-name"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Enter role description..."
                className="text-sm min-h-[60px]"
                data-testid="input-new-description"
              />
            </div>

            {/* Dual List Function Picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Key className="h-4 w-4" /> Assign Functions
              </Label>

              <div className="grid grid-cols-[1fr,auto,1fr] gap-2">
                {/* Available Functions */}
                <div className="border rounded-lg">
                  <div className="p-2 border-b bg-muted/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium">Available Functions</span>
                      <Badge variant="outline" className="text-xs px-1.5 py-0">{newAvailableFunctions.length}</Badge>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        value={newFunctionSearch}
                        onChange={(e) => setNewFunctionSearch(e.target.value)}
                        className="h-7 text-xs pl-7"
                        data-testid="input-new-function-search"
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <div className="p-1.5 space-y-1">
                      {Object.entries(groupByModule(newAvailableFunctions)).map(([module, funcs]) => (
                        <div key={module}>
                          <div className="text-xs font-medium text-muted-foreground px-1.5 py-1 bg-muted/30 rounded">
                            {module}
                          </div>
                          {funcs.map((fn) => (
                            <div
                              key={fn.id}
                              className="flex items-center gap-2 p-1.5 rounded hover-elevate cursor-pointer text-xs"
                              onClick={() => {
                                if (!newSelectedFunctionIds.includes(fn.id)) {
                                  setNewSelectedFunctionIds([...newSelectedFunctionIds, fn.id]);
                                }
                              }}
                              data-testid={`new-available-function-${fn.id}`}
                            >
                              <Checkbox checked={false} className="h-3.5 w-3.5" />
                              <span className="truncate">{fn.description || fn.function_name}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Arrow Buttons */}
                <div className="flex flex-col items-center justify-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setNewSelectedFunctionIds([...newSelectedFunctionIds, ...newAvailableFunctions.map(f => f.id)])}
                    disabled={newAvailableFunctions.length === 0}
                    data-testid="button-new-add-all"
                  >
                    <ChevronRight className="h-4 w-4" />
                    <ChevronRight className="h-4 w-4 -ml-2" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setNewSelectedFunctionIds([])}
                    disabled={newSelectedFunctionIds.length === 0}
                    data-testid="button-new-remove-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <ChevronLeft className="h-4 w-4 -ml-2" />
                  </Button>
                </div>

                {/* Selected Functions */}
                <div className="border rounded-lg">
                  <div className="p-2 border-b bg-muted/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Selected Functions</span>
                      <Badge variant="outline" className="text-xs px-1.5 py-0">{newSelectedFunctionIds.length}</Badge>
                    </div>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <div className="p-1.5 space-y-1">
                      {Object.entries(groupByModule(newSelectedFunctions)).map(([module, funcs]) => (
                        <div key={module}>
                          <div className="text-xs font-medium text-muted-foreground px-1.5 py-1 bg-muted/30 rounded">
                            {module}
                          </div>
                          {funcs.map((fn) => (
                            <div
                              key={fn.id}
                              className="flex items-center gap-2 p-1.5 rounded hover-elevate cursor-pointer text-xs"
                              onClick={() => setNewSelectedFunctionIds(newSelectedFunctionIds.filter(id => id !== fn.id))}
                              data-testid={`new-selected-function-${fn.id}`}
                            >
                              <Checkbox checked={true} className="h-3.5 w-3.5" />
                              <span className="truncate">{fn.description || fn.function_name}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                      {newSelectedFunctionIds.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No functions selected</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
      </FormSheet>
    </div>
  );
}
