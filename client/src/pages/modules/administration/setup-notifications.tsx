import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FormSheet } from "@/components/form-sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, ChevronLeft, ChevronRight, FileSpreadsheet, FileUp, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import 'react-quill/dist/quill.snow.css';

interface Notification {
  id: number;
  notification_id: string;
  event_id: string;
  event_name: string;
  notif_subject: string;
  notif_content_tmplate: string;
  sms_content_tmpl: string;
  from_role: string;
  from_user: string;
  to_role: string;
  to_user: string;
  cc_group: string;
  status: string;
  created_by: string;
  creation_date: string;
}

interface NotificationResponse {
  data: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function SetupNotifications() {
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [showSheet, setShowSheet] = useState(false);
  const [editing, setEditing] = useState<Notification | null>(null);
  const [deleting, setDeleting] = useState<Notification | null>(null);
  const [previewing, setPreviewing] = useState<Notification | null>(null);
  const [templateTab, setTemplateTab] = useState<"preview" | "source">("preview");

  const [form, setForm] = useState({
    event_id: "",
    event_name: "",
    notif_subject: "",
    notif_content_tmplate: "",
    sms_content_tmpl: "",
    from_role: "",
    from_user: "",
    to_role: "",
    to_user: "",
    cc_group: "",
    status: "READ"
  });

  const { data, isLoading } = useQuery<NotificationResponse>({
    queryKey: ["/api/setup-notifications", page, limit, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search })
      });
      const res = await apiRequest("GET", `/api/setup-notifications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Fetch notification name options from lookup
  const { data: notificationLookups } = useQuery<Array<{
    id: number;
    property_name: string;
    lookup_key: string;
    lookup_value: string;
    description: string;
  }>>({
    queryKey: ["/api/lookups/by-property/MAIL_NOTIF"],
  });

  // Fetch roles for dropdown
  const { data: roles } = useQuery<Array<{
    role_id: string;
    role_name: string;
    role_display_name: string;
  }>>({
    queryKey: ["/api/roles/dropdown"],
  });

  // Fetch users for dropdown
  const { data: users } = useQuery<Array<{
    user_id: string;
    user_name: string;
    name: string;
    email_id: string;
  }>>({
    queryKey: ["/api/users/dropdown"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/setup-notifications", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/setup-notifications"] });
      setShowSheet(false);
      resetForm();
      toast({ title: "Notification template created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof form }) => {
      const res = await apiRequest("PUT", `/api/setup-notifications/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/setup-notifications"] });
      setShowSheet(false);
      setEditing(null);
      resetForm();
      toast({ title: "Notification template updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/setup-notifications/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/setup-notifications"] });
      setDeleting(null);
      toast({ title: "Notification template deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setForm({
      event_id: "",
      event_name: "",
      notif_subject: "",
      notif_content_tmplate: "",
      sms_content_tmpl: "",
      from_role: "",
      from_user: "",
      to_role: "",
      to_user: "",
      cc_group: "",
      status: "READ"
    });
  };

  const handleEdit = (notification: Notification) => {
    setEditing(notification);
    setForm({
      event_id: notification.event_id || "",
      event_name: notification.event_name || "",
      notif_subject: notification.notif_subject || "",
      notif_content_tmplate: notification.notif_content_tmplate || "",
      sms_content_tmpl: notification.sms_content_tmpl || "",
      from_role: notification.from_role || "",
      from_user: notification.from_user || "",
      to_role: notification.to_role || "",
      to_user: notification.to_user || "",
      cc_group: notification.cc_group || "",
      status: notification.status || "READ"
    });
    setShowSheet(true);
  };

  const handleSubmit = () => {
    if (!form.event_id.trim()) {
      toast({ title: "Error", description: "Event ID is required", variant: "destructive" });
      return;
    }
    if (!form.event_name.trim()) {
      toast({ title: "Error", description: "Event Name is required", variant: "destructive" });
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
    const params = new URLSearchParams({ page: "1", limit: "0" });
    const trimmed = search.trim();
    if (trimmed) params.set("search", trimmed);
    const res = await apiRequest("GET", `/api/setup-notifications?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch notifications for export");
    const payload: NotificationResponse = await res.json();
    const exportRows = payload.data ?? [];
    if (exportRows.length === 0) {
      toast({
        title: "No data to export",
        description: "No notification templates match the current filters.",
        variant: "destructive",
      });
      return;
    }
    const headers = ["ID", "Notification ID", "Event ID", "Event Name", "From Role", "To Role"];
    const rows = exportRows.map(n => [
      n.id,
      n.notification_id || "",
      n.event_id || "",
      n.event_name || "",
      n.from_role || "",
      n.to_role || ""
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notification-templates_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export notifications",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const notifications = data?.data || [];
  const pagination = data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold" data-testid="text-page-title">Setup Notifications</h1>
          </div>
          <p className="text-sm text-muted-foreground">Configure email and SMS notification templates for system events</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setEditing(null); setShowSheet(true); }} data-testid="button-add-notification">
          <Plus className="h-4 w-4 mr-1" />
          Add Template
        </Button>
      </div>

      <Card>
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by event name or subject..."
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
                    <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">Notif ID</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">Event ID</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium">Event Name</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[140px]">From Role</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[140px]">To Role</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No notification templates found. Click "Add Template" to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    notifications.map((notification) => (
                      <TableRow key={notification.id} data-testid={`row-notification-${notification.id}`}>
                        <TableCell className="py-1.5 text-muted-foreground text-sm truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[140px] cursor-default">
                                {notification.notification_id || notification.id}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{notification.notification_id || notification.id}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5 text-sm font-mono truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[140px] cursor-default">
                                {notification.event_id}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{notification.event_id}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5 font-medium text-sm truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[140px] cursor-default">
                                {notification.event_name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{notification.event_name}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5 text-sm truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[140px] cursor-default">
                                {notification.from_role || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{notification.from_role || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5 text-sm truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[140px] cursor-default">
                                {notification.to_role || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{notification.to_role || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(notification)}
                              data-testid={`button-edit-${notification.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleting(notification)}
                              data-testid={`button-delete-${notification.id}`}
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

      <FormSheet
        open={showSheet}
        onOpenChange={(open) => {
          setShowSheet(open);
          if (!open) {
            setEditing(null);
            resetForm();
          }
        }}
        title={editing ? "Edit Notification" : "Define Notification"}
        onCancel={() => { setShowSheet(false); setEditing(null); resetForm(); }}
        onSubmit={handleSubmit}
        submitLabel={editing ? "Update" : "Add"}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        widthClassName="sm:max-w-4xl"
      >
        <p className="text-xs text-muted-foreground mb-4"><span className="text-destructive">*</span> Indicates mandatory fields</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Select Notification Name <span className="text-orange-500">*</span></Label>
              <Select
                value={form.event_id}
                onValueChange={(value) => {
                  const selected = notificationLookups?.find(l => l.lookup_key === value);
                  setForm({
                    ...form,
                    event_id: value,
                    event_name: selected?.lookup_value || value
                  });
                }}
              >
                <SelectTrigger className="h-10" data-testid="select-notification-name">
                  <SelectValue placeholder="Search Notification Name" />
                </SelectTrigger>
                <SelectContent>
                  {notificationLookups?.map((lookup) => (
                    <SelectItem key={lookup.id} value={lookup.lookup_key}>
                      {lookup.lookup_key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">From Role <span className="text-orange-500">*</span></Label>
                <Select
                  value={form.from_role}
                  onValueChange={(value) => setForm({ ...form, from_role: value })}
                >
                  <SelectTrigger className="h-10" data-testid="select-from-role">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles?.map((role) => {
                      const shortName = role.role_name.replace(/^ROLE_/, '');
                      return (
                        <SelectItem key={role.role_name} value={shortName}>
                          {role.role_display_name || role.role_name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">To Role <span className="text-orange-500">*</span></Label>
                <Select
                  value={form.to_role}
                  onValueChange={(value) => setForm({ ...form, to_role: value })}
                >
                  <SelectTrigger className="h-10" data-testid="select-to-role">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles?.map((role) => {
                      const shortName = role.role_name.replace(/^ROLE_/, '');
                      return (
                        <SelectItem key={role.role_name} value={shortName}>
                          {role.role_display_name || role.role_name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">From User <span className="text-orange-500">*</span></Label>
                <Select
                  value={form.from_user}
                  onValueChange={(value) => setForm({ ...form, from_user: value })}
                >
                  <SelectTrigger className="h-10" data-testid="select-from-user">
                    <SelectValue placeholder="Select User" />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map((user) => (
                      <SelectItem key={user.user_id} value={user.email_id}>
                        {user.name} ({user.email_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">To User</Label>
                <Select
                  value={form.to_user}
                  onValueChange={(value) => setForm({ ...form, to_user: value })}
                >
                  <SelectTrigger className="h-10" data-testid="select-to-user">
                    <SelectValue placeholder="Select User" />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map((user) => (
                      <SelectItem key={user.user_id} value={user.email_id}>
                        {user.name} ({user.email_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">CC Group List (Comma separated email ids)</Label>
              <Input
                value={form.cc_group}
                onChange={(e) => setForm({ ...form, cc_group: e.target.value })}
                placeholder="Enter comma separated email addresses"
                className="h-10"
                data-testid="input-cc-group"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Email Subject Template <span className="text-orange-500">*</span></Label>
              <Input
                value={form.notif_subject}
                onChange={(e) => setForm({ ...form, notif_subject: e.target.value })}
                placeholder="Email subject line (supports ${variables})"
                className="h-10"
                data-testid="input-subject"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-6 border-b">
                <button
                  type="button"
                  onClick={() => setTemplateTab("preview")}
                  className={`pb-2 text-sm font-medium ${templateTab === "preview" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Template View
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateTab("source")}
                  className={`pb-2 text-sm font-medium ${templateTab === "source" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Source &lt; / &gt;
                </button>
              </div>
              {templateTab === "preview" ? (
                <div
                  className="min-h-[150px] border rounded-md p-3 bg-white text-sm overflow-auto"
                  dangerouslySetInnerHTML={{ __html: form.notif_content_tmplate || '<p class="text-muted-foreground">No template content</p>' }}
                />
              ) : (
                <Textarea
                  value={form.notif_content_tmplate}
                  onChange={(e) => setForm({ ...form, notif_content_tmplate: e.target.value })}
                  placeholder="Enter raw HTML template content..."
                  className="min-h-[320px] font-mono text-sm"
                  data-testid="input-email-template"
                />
              )}
            </div>
        </div>
      </FormSheet>

      <Dialog open={!!previewing} onOpenChange={() => setPreviewing(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Template Preview: {previewing?.event_name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Event ID:</span>
                  <span className="ml-2 font-mono">{previewing?.event_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Notification ID:</span>
                  <span className="ml-2">{previewing?.notification_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">From:</span>
                  <span className="ml-2">{previewing?.from_role || previewing?.from_user || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">To:</span>
                  <span className="ml-2">{previewing?.to_role || previewing?.to_user || "-"}</span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Subject</h4>
                <div className="p-3 bg-muted rounded-md text-sm">{previewing?.notif_subject}</div>
              </div>

              {previewing?.notif_content_tmplate && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Email Template</h4>
                  <div
                    className="p-4 border rounded-md bg-white text-sm overflow-auto"
                    dangerouslySetInnerHTML={{ __html: previewing.notif_content_tmplate }}
                  />
                </div>
              )}

              {previewing?.sms_content_tmpl && (
                <div>
                  <h4 className="text-sm font-medium mb-2">SMS Template</h4>
                  <div className="p-3 bg-muted rounded-md text-sm">{previewing.sms_content_tmpl}</div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the notification template "{deleting?.event_name}"? This action cannot be undone.
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
