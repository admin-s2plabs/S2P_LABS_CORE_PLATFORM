import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileUp, Loader2, Pencil, Plus, Search, Trash2, Upload, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";

interface Approver {
  id: number;
  entity_type: string;
  from_amount: number;
  to_amount: number;
  user_fullname: string;
  user_id: number;
  currency: string;
  approve_id: string;
}

interface ApproverResponse {
  data: Approver[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface User {
  id: number;
  user_fullname: string;
  user_name: string;
  email_id: string;
}

export default function SetupApprovers() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [showSheet, setShowSheet] = useState(false);
  const [editing, setEditing] = useState<Approver | null>(null);
  const [deleting, setDeleting] = useState<Approver | null>(null);
  const [orgCurrency, setOrgCurrency] = useState("AED");
  const [form, setForm] = useState({
    entity_type: "ALL",
    from_amount: 0,
    to_amount: 0,
    user_id: 0,
    user_fullname: "",
    currency: "AED"
  });

  const { data, isLoading } = useQuery<ApproverResponse>({
    queryKey: ["/api/approvers", page, limit, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search })
      });
      const res = await apiRequest("GET", `/api/approvers?${params}`);
      if (!res.ok) throw new Error("Failed to fetch approvers");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/approvers/active-users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/approvers/active-users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    }
  });

  // Fetch organization currency
  const { data: currencyData } = useQuery<{ currency: string }>({
    queryKey: ["/api/approvers/org-currency"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/approvers/org-currency");
      if (!res.ok) throw new Error("Failed to fetch org currency");
      return res.json();
    }
  });

  // Set org currency when loaded
  useEffect(() => {
    if (currencyData?.currency) {
      setOrgCurrency(currencyData.currency);
      setForm(prev => ({ ...prev, currency: currencyData.currency }));
    }
  }, [currencyData]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/approvers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvers"] });
      setShowSheet(false);
      resetForm();
      toast({ title: "Approver created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof form }) => {
      const res = await apiRequest("PUT", `/api/approvers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvers"] });
      setShowSheet(false);
      setEditing(null);
      resetForm();
      toast({ title: "Approver updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/approvers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvers"] });
      setDeleting(null);
      toast({ title: "Approver deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setForm({
      entity_type: "ALL",
      from_amount: 0,
      to_amount: 0,
      user_id: 0,
      user_fullname: "",
      currency: orgCurrency
    });
  };

  const handleEdit = (approver: Approver) => {
    setEditing(approver);
    setForm({
      entity_type: approver.entity_type || "ALL",
      from_amount: approver.from_amount || 0,
      to_amount: approver.to_amount || 0,
      user_id: approver.user_id || 0,
      user_fullname: approver.user_fullname || "",
      currency: orgCurrency
    });
    setShowSheet(true);
  };

  const handleSubmit = () => {
    if (!form.user_id) {
      toast({ title: "Error", description: "Please select a user", variant: "destructive" });
      return;
    }
    if (form.from_amount < 0 || form.to_amount < 0) {
      toast({ title: "Error", description: "Amounts cannot be negative", variant: "destructive" });
      return;
    }
    if (form.from_amount > form.to_amount) {
      toast({ title: "Error", description: "From amount cannot be greater than To amount", variant: "destructive" });
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleUserSelect = (userId: string) => {
    const user = users.find(u => u.id.toString() === userId);
    if (user) {
      setForm({
        ...form,
        user_id: user.id,
        user_fullname: user.user_fullname
      });
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
    const params = new URLSearchParams({ page: "1", limit: "0" });
    const trimmed = search.trim();
    if (trimmed) params.set("search", trimmed);
    const res = await apiRequest("GET", `/api/approvers?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch approvers for export");
    const payload: ApproverResponse = await res.json();
    const rows = payload.data ?? [];
    if (rows.length === 0) {
      toast({
        title: "No data to export",
        description: "No approvers match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const headers = ["ID", "From Amount", "To Amount", "User", "Currency"];
    const csvRows = rows.map(a => [
      a.id,
      a.from_amount,
      a.to_amount,
      a.user_fullname,
      a.currency
    ]);
    const csv = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `approvers_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export approvers",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const approvers = data?.data || [];
  const pagination = data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold" data-testid="text-page-title">Setup Approvers</h1>
          </div>
          <p className="text-sm text-muted-foreground">Configure approval workflows and assign approvers for different processes</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setEditing(null); setShowSheet(true); }} data-testid="button-add-approver">
          <Plus className="h-4 w-4 mr-1" />
          Add Approver
        </Button>
      </div>

      <Card>
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by user name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-8"
              data-testid="input-search"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isExporting} data-testid="button-export">
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                {isExporting ? "Exporting..." : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportToCSV} data-testid="menu-item-csv">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToCSV} data-testid="menu-item-excel">
                <FileUp className="h-4 w-4 mr-2" />
                Export as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                    <TableHead className="h-9 py-2 text-xs font-medium w-[60px]">ID</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[120px] text-right">From Amount</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[120px] text-right">To Amount</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium">User</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">Currency</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No approvers found. Click "Add Approver" to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    approvers.map((approver) => (
                      <TableRow key={approver.id} data-testid={`row-approver-${approver.id}`}>
                        <TableCell className="py-1.5 text-muted-foreground text-sm">{approver.id}</TableCell>
                        <TableCell className="py-1.5 text-sm text-right">{formatAmount(approver.from_amount)}</TableCell>
                        <TableCell className="py-1.5 text-sm text-right">{formatAmount(approver.to_amount)}</TableCell>
                        <TableCell className="py-1.5 font-medium text-sm truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[160px] cursor-default">
                                {approver.user_fullname}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{approver.user_fullname}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5 text-muted-foreground text-sm truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[140px] cursor-default">
                                {approver.currency}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{approver.currency}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(approver)}
                              data-testid={`button-edit-${approver.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleting(approver)}
                              data-testid={`button-delete-${approver.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="p-3 border-t flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Select
                    value={String(limit)}
                    onValueChange={(val) => {
                      setLimit(Number(val));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-7 w-[70px] text-xs" data-testid="select-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {pagination.total > 0 ? `${(page - 1) * limit + 1}-${Math.min(page * limit, pagination.total)} of ${pagination.total}` : "0 items"}
                  </span>
                </div>
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
                    onClick={() => setPage(p => Math.min(pagination.totalPages || 1, p + 1))}
                    disabled={page >= pagination.totalPages}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent className="w-[400px]">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Approver" : "Add Approver"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">User</Label>
              <Select value={form.user_id.toString()} onValueChange={handleUserSelect}>
                <SelectTrigger className="h-9" data-testid="select-user">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {/* Include existing user when editing if not in active users list */}
                  {editing && form.user_id && !users.find(u => u.id === form.user_id) && (
                    <SelectItem key={form.user_id} value={form.user_id.toString()}>
                      {form.user_fullname} (Current)
                    </SelectItem>
                  )}
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.user_fullname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">From Amount</Label>
              <Input
                type="number"
                min="0"
                value={form.from_amount}
                onChange={(e) => setForm({ ...form, from_amount: parseFloat(e.target.value) || 0 })}
                className="h-9"
                data-testid="input-from-amount"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">To Amount</Label>
              <Input
                type="number"
                min="0"
                value={form.to_amount}
                onChange={(e) => setForm({ ...form, to_amount: parseFloat(e.target.value) || 0 })}
                className="h-9"
                data-testid="input-to-amount"
              />
              <span className="text-xs text-orange-500">Please enter '0' for unlimited amount.</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Input
                value={orgCurrency}
                disabled
                className="h-9 bg-muted"
                data-testid="input-currency"
              />
              <span className="text-xs text-muted-foreground">Organization default currency</span>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                {editing ? "Update" : "Create"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowSheet(false); setEditing(null); resetForm(); }}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Approver</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the approver "{deleting?.user_fullname}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
