import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, FileUp, FolderTree, Layers, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useState } from "react";

interface CostCenter {
  id: number;
  segment_type: string;
  description: string;
  status: string;
  cost_center_id: string;
  item_count: number;
}

interface CostCenterItem {
  id: number;
  code: string;
  value: string;
  segment_type_id: number;
  status: string;
  data_area_id: string;
  attribute_1: string;
  attribute_2: string;
  attribute_3: string;
  attribute_4: string;
  attribute_5: string;
  attribute_6: string;
}

interface CostCenterResponse {
  data: CostCenter[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface CostCenterItemResponse {
  data: CostCenterItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function CostCenterSetup() {
  const { toast } = useToast();

  // Master state
  const [masterPage, setMasterPage] = useState(1);
  const [masterLimit, setMasterLimit] = useState(10);
  const [masterSearch, setMasterSearch] = useState("");
  const [showMasterSheet, setShowMasterSheet] = useState(false);
  const [editingMaster, setEditingMaster] = useState<CostCenter | null>(null);
  const [deletingMaster, setDeletingMaster] = useState<CostCenter | null>(null);

  // Master form state
  const [masterForm, setMasterForm] = useState({
    segment_type: "",
    description: "",
    cost_center_id: ""
  });

  // Detail state
  const [selectedMaster, setSelectedMaster] = useState<CostCenter | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [detailLimit, setDetailLimit] = useState(10);
  const [detailSearch, setDetailSearch] = useState("");
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [editingDetail, setEditingDetail] = useState<CostCenterItem | null>(null);
  const [deletingDetail, setDeletingDetail] = useState<CostCenterItem | null>(null);

  // Detail form state
  const [detailForm, setDetailForm] = useState({
    code: "",
    value: "",
    data_area_id: ""
  });

  // Fetch master data
  const { data: masterData, isLoading: masterLoading } = useQuery<CostCenterResponse>({
    queryKey: ["/api/cost-centers", masterPage, masterLimit, masterSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: masterPage.toString(),
        limit: masterLimit.toString(),
        ...(masterSearch && { search: masterSearch })
      });
      const res = await apiRequest("GET", `/api/cost-centers?${params}`);
      if (!res.ok) throw new Error("Failed to fetch cost centers");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Fetch detail data
  const { data: detailData, isLoading: detailLoading } = useQuery<CostCenterItemResponse>({
    queryKey: ["/api/cost-centers", selectedMaster?.id, "items", detailPage, detailLimit, detailSearch],
    queryFn: async () => {
      if (!selectedMaster) return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
      const params = new URLSearchParams({
        page: detailPage.toString(),
        limit: detailLimit.toString(),
        ...(detailSearch && { search: detailSearch })
      });
      const res = await apiRequest("GET", `/api/cost-centers/${selectedMaster.id}/items?${params}`);
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    enabled: !!selectedMaster
  });

  // Master mutations
  const createMasterMutation = useMutation({
    mutationFn: async (data: typeof masterForm) => {
      const res = await apiRequest("POST", "/api/cost-centers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      setShowMasterSheet(false);
      resetMasterForm();
      toast({ title: "Segment type created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMasterMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof masterForm }) => {
      const res = await apiRequest("PUT", `/api/cost-centers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      setShowMasterSheet(false);
      setEditingMaster(null);
      resetMasterForm();
      toast({ title: "Segment type updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMasterMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/cost-centers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      setDeletingMaster(null);
      toast({ title: "Segment type deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const toggleMasterStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/cost-centers/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      toast({ title: "Status updated successfully" });
    }
  });

  // Detail mutations
  const createDetailMutation = useMutation({
    mutationFn: async (data: typeof detailForm) => {
      const res = await apiRequest("POST", `/api/cost-centers/${selectedMaster?.id}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers", selectedMaster?.id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      setShowDetailSheet(false);
      resetDetailForm();
      toast({ title: "Item created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateDetailMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof detailForm }) => {
      const res = await apiRequest("PUT", `/api/cost-center-items/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers", selectedMaster?.id, "items"] });
      setShowDetailSheet(false);
      setEditingDetail(null);
      resetDetailForm();
      toast({ title: "Item updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteDetailMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/cost-center-items/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers", selectedMaster?.id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      setDeletingDetail(null);
      toast({ title: "Item deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const toggleDetailStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/cost-center-items/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers", selectedMaster?.id, "items"] });
      toast({ title: "Status updated successfully" });
    }
  });

  // Helper functions
  const resetMasterForm = () => {
    setMasterForm({ segment_type: "", description: "", cost_center_id: "" });
  };

  const resetDetailForm = () => {
    setDetailForm({
      code: "", value: "", data_area_id: ""
    });
  };

  const handleAddMaster = () => {
    resetMasterForm();
    setEditingMaster(null);
    setShowMasterSheet(true);
  };

  const handleEditMaster = (item: CostCenter) => {
    setMasterForm({
      segment_type: item.segment_type || "",
      description: item.description || "",
      cost_center_id: item.cost_center_id || ""
    });
    setEditingMaster(item);
    setShowMasterSheet(true);
  };

  const handleSaveMaster = () => {
    if (!masterForm.segment_type.trim()) {
      toast({ title: "Segment type is required", variant: "destructive" });
      return;
    }
    if (editingMaster) {
      updateMasterMutation.mutate({ id: editingMaster.id, data: masterForm });
    } else {
      createMasterMutation.mutate(masterForm);
    }
  };

  const handleAddDetail = () => {
    resetDetailForm();
    setEditingDetail(null);
    setShowDetailSheet(true);
  };

  const handleEditDetail = (item: CostCenterItem) => {
    setDetailForm({
      code: item.code || "",
      value: item.value || "",
      data_area_id: item.data_area_id || ""
    });
    setEditingDetail(item);
    setShowDetailSheet(true);
  };

  const handleSaveDetail = () => {
    if (!detailForm.code.trim()) {
      toast({ title: "Code is required", variant: "destructive" });
      return;
    }
    if (!detailForm.value.trim()) {
      toast({ title: "Value is required", variant: "destructive" });
      return;
    }
    if (editingDetail) {
      updateDetailMutation.mutate({ id: editingDetail.id, data: detailForm });
    } else {
      createDetailMutation.mutate(detailForm);
    }
  };

  const exportSegmentsToPDF = () => {
    const data = masterData?.data || [];
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const columns = ["ID", "Segment Type", "Description", "Cost Center ID", "Items"];
    const rows = data.map((d) => [d.id, d.segment_type, d.description, d.cost_center_id, d.item_count]);
    generateTablePdf({
      title: "Cost Center Setup",
      subtitle: "Segment Types",
      columns,
      rows,
      filename: `cost_center_segments_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
  };

  const exportItemsToPDF = () => {
    const data = detailData?.data || [];
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const columns = ["Code", "Value", "Data Area", "Status"];
    const rows = data.map((d) => [d.code, d.value, d.data_area_id, d.status]);
    generateTablePdf({
      title: `Cost Center Items — ${selectedMaster?.segment_type || ""}`,
      columns,
      rows,
      filename: `cost_center_items_${new Date().toISOString().split("T")[0]}`,
    });
    toast({ title: "Exported to PDF" });
  };

  const handleSelectMaster = (item: CostCenter) => {
    setSelectedMaster(item);
    setDetailPage(1);
    setDetailSearch("");
  };

  const handleBackToMaster = () => {
    setSelectedMaster(null);
    setDetailPage(1);
    setDetailSearch("");
  };

  // Render detail view
  if (selectedMaster) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToMaster}
              data-testid="button-back-master"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                {selectedMaster.segment_type}
              </h1>
              <p className="text-sm text-muted-foreground">
                {selectedMaster.description || "Manage items for this segment type"}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={handleAddDetail} data-testid="button-add-item">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>

        <Card>
          <div className="p-3 border-b">
            <div className="flex flex-col sm:flex-row gap-2 justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by code, value..."
                  value={detailSearch}
                  onChange={(e) => { setDetailSearch(e.target.value); setDetailPage(1); }}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-items"
                />
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8" data-testid="button-export-items">
                      <Upload className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={exportItemsToPDF} data-testid="menu-export-item-pdf">
                      <FileUp className="h-4 w-4 mr-2" />
                      Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="menu-export-item-xls">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export as XLS
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="menu-export-item-csv">
                      <Upload className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          <CardContent className="p-0">
            {detailLoading ? (
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
                      <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">Code</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium">Value</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">Data Area</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[80px] text-center">Status</TableHead>
                      <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailData?.data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No items found. Click "Add Item" to create one.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailData?.data.map((item) => (
                        <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                          <TableCell className="py-1.5 font-mono text-sm">{item.code}</TableCell>
                          <TableCell className="py-1.5 text-sm truncate max-w-[200px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[200px] cursor-default">
                                  {item.value}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{item.value}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="py-1.5 text-sm text-muted-foreground">{item.data_area_id || "-"}</TableCell>
                          <TableCell className="py-1.5 text-center">
                            <Badge
                              variant={item.status === "Y" ? "default" : "secondary"}
                              className="cursor-pointer"
                              onClick={() => toggleDetailStatusMutation.mutate({
                                id: item.id,
                                status: item.status === "Y" ? "N" : "Y"
                              })}
                              data-testid={`badge-status-item-${item.id}`}
                            >
                              {item.status === "Y" ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEditDetail(item)}
                                data-testid={`button-edit-item-${item.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeletingDetail(item)}
                                data-testid={`button-delete-item-${item.id}`}
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
                      value={String(detailLimit)}
                      onValueChange={(val) => {
                        setDetailLimit(Number(val));
                        setDetailPage(1);
                      }}
                    >
                      <SelectTrigger className="h-7 w-[70px] text-xs" data-testid="select-item-page-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {detailData && detailData.pagination.total > 0 ? `${(detailPage - 1) * detailLimit + 1}-${Math.min(detailPage * detailLimit, detailData.pagination.total)} of ${detailData.pagination.total}` : "0 items"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDetailPage(p => Math.max(1, p - 1))}
                      disabled={detailPage <= 1}
                      data-testid="button-prev-items"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs px-1">
                      {detailPage}/{detailData?.pagination.totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDetailPage(p => Math.min(detailData?.pagination.totalPages || 1, p + 1))}
                      disabled={detailPage >= (detailData?.pagination.totalPages || 1)}
                      data-testid="button-next-items"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Detail Sheet */}
        <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
          <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto">
            <SheetHeader className="space-y-1 pb-3">
              <SheetTitle className="text-base">{editingDetail ? 'Edit Item' : 'Add Item'}</SheetTitle>
              <p className="text-xs text-muted-foreground">* Indicates mandatory fields</p>
            </SheetHeader>

            <div className="mt-2 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm" htmlFor="item-code">Code <span className="text-destructive">*</span></Label>
                  <Input
                    id="item-code"
                    value={detailForm.code}
                    onChange={(e) => setDetailForm(f => ({ ...f, code: e.target.value }))}
                    placeholder="Enter code"
                    data-testid="input-item-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm" htmlFor="item-data-area">Data Area ID</Label>
                  <Input
                    id="item-data-area"
                    value={detailForm.data_area_id}
                    onChange={(e) => setDetailForm(f => ({ ...f, data_area_id: e.target.value }))}
                    placeholder="Enter data area ID"
                    data-testid="input-item-data-area"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm" htmlFor="item-value">Value <span className="text-destructive">*</span></Label>
                <Input
                  id="item-value"
                  value={detailForm.value}
                  onChange={(e) => setDetailForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="Enter value/description"
                  data-testid="input-item-value"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowDetailSheet(false)} data-testid="button-cancel-item">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveDetail}
                  disabled={createDetailMutation.isPending || updateDetailMutation.isPending}
                  data-testid="button-save-item"
                >
                  {(createDetailMutation.isPending || updateDetailMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingDetail ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Delete Detail Dialog */}
        <AlertDialog open={!!deletingDetail} onOpenChange={() => setDeletingDetail(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Item</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingDetail?.value}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-item">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingDetail && deleteDetailMutation.mutate(deletingDetail.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-item"
              >
                {deleteDetailMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Render master view
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            Cost Center Setup
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage cost center segment types and their items
          </p>
        </div>
      </div>

      <Card>
        <div className="p-3 border-b">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by segment type, description..."
                value={masterSearch}
                onChange={(e) => { setMasterSearch(e.target.value); setMasterPage(1); }}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-segments"
              />
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8" data-testid="button-export-segments">
                    <Upload className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportSegmentsToPDF} data-testid="menu-export-segment-pdf">
                    <FileUp className="h-4 w-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-export-segment-xls">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as XLS
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-export-segment-csv">
                    <Upload className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <CardContent className="p-0">
          {masterLoading ? (
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
                    <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">Segment Type</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium">Description</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">Cost Center ID</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[70px] text-center">Items</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {masterData?.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No segment types found. Click "Add Segment Type" to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    masterData?.data.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSelectMaster(item)}
                        data-testid={`row-segment-${item.id}`}
                      >
                        <TableCell className="py-1.5 font-mono text-sm">{item.id}</TableCell>
                        <TableCell className="py-1.5 text-sm font-medium truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[280px] cursor-default">
                                {item.segment_type}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{item.segment_type}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5 text-sm text-muted-foreground truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[300px] cursor-default">
                                {item.description || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{item.description || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="py-1.5 font-mono text-sm">{item.cost_center_id || "-"}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant="outline">{item.item_count}</Badge>
                        </TableCell>
                        <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEditMaster(item)}
                              data-testid={`button-edit-segment-${item.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {/* <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeletingMaster(item)}
                              data-testid={`button-delete-segment-${item.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button> */}
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
                    value={String(masterLimit)}
                    onValueChange={(val) => {
                      setMasterLimit(Number(val));
                      setMasterPage(1);
                    }}
                  >
                    <SelectTrigger className="h-7 w-[70px] text-xs" data-testid="select-segment-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {masterData && masterData.pagination.total > 0 ? `${(masterPage - 1) * masterLimit + 1}-${Math.min(masterPage * masterLimit, masterData.pagination.total)} of ${masterData.pagination.total}` : "0 items"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setMasterPage(p => Math.max(1, p - 1))}
                    disabled={masterPage <= 1}
                    data-testid="button-prev-segments"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs px-1">
                    {masterPage}/{masterData?.pagination.totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setMasterPage(p => Math.min(masterData?.pagination.totalPages || 1, p + 1))}
                    disabled={masterPage >= (masterData?.pagination.totalPages || 1)}
                    data-testid="button-next-segments"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Master Sheet */}
      <Sheet open={showMasterSheet} onOpenChange={setShowMasterSheet}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto">
          <SheetHeader className="space-y-1 pb-3">
            <SheetTitle className="text-base">{editingMaster ? 'Edit Segment Type' : 'Add Segment Type'}</SheetTitle>
            <p className="text-xs text-muted-foreground">* Indicates mandatory fields</p>
          </SheetHeader>

          <div className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm" htmlFor="segment-type">Segment Type <span className="text-destructive">*</span></Label>
              <Input
                id="segment-type"
                value={masterForm.segment_type}
                onChange={(e) => setMasterForm(f => ({ ...f, segment_type: e.target.value }))}
                placeholder="Enter segment type name"
                readOnly={!!editingMaster}
                className={editingMaster ? "bg-muted" : ""}
                data-testid="input-segment-type"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm" htmlFor="segment-description">Description</Label>
              <Textarea
                id="segment-description"
                value={masterForm.description}
                onChange={(e) => setMasterForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Enter description"
                rows={3}
                data-testid="input-segment-description"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowMasterSheet(false)} data-testid="button-cancel-segment">
                Cancel
              </Button>
              <Button
                onClick={handleSaveMaster}
                disabled={createMasterMutation.isPending || updateMasterMutation.isPending}
                data-testid="button-save-segment"
              >
                {(createMasterMutation.isPending || updateMasterMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingMaster ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Master Dialog */}
      <AlertDialog open={!!deletingMaster} onOpenChange={() => setDeletingMaster(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Segment Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingMaster?.segment_type}"?
              {(deletingMaster?.item_count || 0) > 0 && (
                <span className="text-destructive font-medium block mt-2">
                  Warning: This segment type has {deletingMaster?.item_count} items. You must delete all items first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-segment">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMaster && deleteMasterMutation.mutate(deletingMaster.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={(deletingMaster?.item_count || 0) > 0}
              data-testid="button-confirm-delete-segment"
            >
              {deleteMasterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
