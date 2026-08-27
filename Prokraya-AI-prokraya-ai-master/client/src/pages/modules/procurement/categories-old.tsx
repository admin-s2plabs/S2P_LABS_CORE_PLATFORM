import { StatusCountBadges } from "@/components/status-count-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

interface ProductCategory {
  category_id: number;
  prod_category_id: string;
  category_name: string;
  description: string;
  status: string;
  parent_category_id: number;
  parent_category_name?: string;
  cat_type: number | string;
  ext_entity_ref: number;
}

function isCategory(cat: ProductCategory): boolean {
  const catType = Number(cat.cat_type);
  if (catType === 2) return false;
  if (catType === 1) return true;
  return Number(cat.parent_category_id ?? 0) === 0;
}

function isSubcategory(cat: ProductCategory): boolean {
  return !isCategory(cat);
}

export default function CategoriesOld() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [formData, setFormData] = useState({
    type: "Category",
    categoryName: "",
    description: "",
    parentCategoryId: "0",
    status: "Active"
  });
  const [typeFilter, setTypeFilter] = useState<"all" | "category" | "subcategory">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { toast } = useToast();

  const { data: allCategories = [], isLoading } = useQuery<ProductCategory[]>({
    queryKey: ["/api/product-categories", "all"],
    queryFn: async () => {
      const res = await apiRequest("GET", 
        "/api/product-categories?type=full&limit=10000&page=1",
      );
      if (!res.ok) throw new Error("Failed to fetch categories");
      const json = await res.json();
      return json.data ?? json;
    },
  });

  const categoriesMatchingSearch = useMemo(
    () =>
      allCategories.filter((cat) => {
        const q = searchQuery.toLowerCase();
        return (
          searchQuery === "" ||
          (cat.category_name || "").toLowerCase().includes(q) ||
          (cat.prod_category_id || "").toLowerCase().includes(q) ||
          (cat.description || "").toLowerCase().includes(q)
        );
      }),
    [allCategories, searchQuery],
  );

  const typeBadgeItems = useMemo(
    () => [
      {
        value: "category",
        label: "Category",
        count: categoriesMatchingSearch.filter(isCategory).length,
      },
      {
        value: "subcategory",
        label: "Subcategory",
        count: categoriesMatchingSearch.filter(isSubcategory).length,
      },
    ],
    [categoriesMatchingSearch],
  );

  const filteredCategories = useMemo(
    () =>
      categoriesMatchingSearch.filter((cat) => {
        if (typeFilter === "all") return true;
        if (typeFilter === "category") return isCategory(cat);
        return isSubcategory(cat);
      }),
    [categoriesMatchingSearch, typeFilter],
  );

  const pagination = useMemo(
    () => ({
      total: filteredCategories.length,
      totalPages: Math.max(1, Math.ceil(filteredCategories.length / pageSize)),
      active: allCategories.filter((c) => c.status === "Active").length,
      inactive: allCategories.filter((c) => c.status !== "Active").length,
    }),
    [filteredCategories.length, pageSize, allCategories],
  );

  const pagedCategories = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCategories.slice(start, start + pageSize);
  }, [filteredCategories, page, pageSize]);

  const parentCategories = useMemo(
    () => allCategories.filter(isCategory),
    [allCategories],
  );

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/product-categories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-categories"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "Success", description: "Category created successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create category.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: any }) => {
      const res = await apiRequest("PUT", `/api/product-categories/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-categories"] });
      setIsAddDialogOpen(false);
      setEditingCategory(null);
      resetForm();
      toast({ title: "Success", description: "Category updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update category.", variant: "destructive" });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PUT", `/api/product-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-categories"] });
      toast({ title: "Success", description: "Category deleted successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete category.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      type: "Category",
      categoryName: "",
      description: "",
      parentCategoryId: "0",
      status: "Active"
    });
  };

  const handleEdit = (category: ProductCategory) => {
    setEditingCategory(category);
    setFormData({
      type: isCategory(category) ? "Category" : "Sub Category",
      categoryName: category.category_name,
      description: category.description || "",
      parentCategoryId: String(category.parent_category_id),
      status: category.status
    });
    setIsAddDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.categoryName.trim()) {
      toast({ title: "Validation Error", description: "Category name is required.", variant: "destructive" });
      return;
    }
    if (!formData.description.trim()) {
      toast({ title: "Validation Error", description: "Description is required.", variant: "destructive" });
      return;
    }
    if (formData.type === "Sub Category" && (!formData.parentCategoryId || formData.parentCategoryId === "0")) {
      toast({ title: "Validation Error", description: "Please select a parent category.", variant: "destructive" });
      return;
    }

    const payload = {
      categoryName: formData.categoryName,
      description: formData.description,
      status: formData.status,
      parentCategoryId: formData.type === "Category" ? 0 : parseInt(formData.parentCategoryId),
      catType: formData.type === "Category" ? 1 : 2 // Assuming 1 for Category, 2 for Sub Category
    };

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.category_id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleStatus = (category: ProductCategory) => {
    const newStatus = category.status === "Active" ? "InActive" : "Active";
    updateMutation.mutate({
      id: category.category_id,
      data: {
        categoryName: category.category_name,
        description: category.description,
        status: newStatus,
        parentCategoryId: category.parent_category_id,
        catType: category.cat_type
      }
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 bg-background min-h-screen">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            Categories
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your product and service category database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-10 bg-[#3b2a82] hover:bg-[#2d2063] text-white font-semibold shadow-md px-4"
            onClick={() => {
              setEditingCategory(null);
              resetForm();
              setIsAddDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border border-slate-200 overflow-hidden bg-white">
        <div className="flex flex-col gap-3 p-4 bg-white border-b border-slate-100">
          <StatusCountBadges
            totalLabel="All"
            totalCount={categoriesMatchingSearch.length}
            selected={typeFilter}
            loading={isLoading}
            onSelect={(v) => {
              setTypeFilter(v as "all" | "category" | "subcategory");
              setPage(1);
            }}
            items={typeBadgeItems}
          />
          <div className="relative flex-1 max-w-sm group">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by category name, description..."
              className="pl-9 h-10 border-slate-200 focus-visible:ring-indigo-500 rounded-md"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-white">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="w-[80px] text-slate-500 font-medium text-xs pl-6">Id</TableHead>
                <TableHead className="w-[120px] text-slate-500 font-medium text-xs">Status</TableHead>
                <TableHead className="text-slate-500 font-medium text-xs">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-3.5 w-3.5" />
                    Category Name
                  </div>
                </TableHead>
                <TableHead className="text-slate-500 font-medium text-xs">Parent Category</TableHead>
                <TableHead className="text-slate-500 font-medium text-xs">Description</TableHead>
                <TableHead className="w-[100px] text-right text-slate-500 font-medium text-xs pr-6">
                  <Settings className="h-3.5 w-3.5 ml-auto" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedCategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <FolderTree className="h-8 w-8 opacity-20" />
                      <p className="font-medium">No categories found matching your search.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pagedCategories.map((cat: ProductCategory) => (
                  <TableRow key={cat.category_id} className="hover:bg-slate-50/30 transition-colors border-slate-50">
                    <TableCell className="pl-6 font-bold text-slate-900 text-sm">
                      {cat.prod_category_id || cat.category_id}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={cat.status === "Active"}
                        onCheckedChange={() => toggleStatus(cat)}
                        className="data-[state=checked]:bg-[#3b2a82]"
                      />
                    </TableCell>
                    <TableCell className="font-medium text-indigo-600 text-sm">
                      {cat.category_name}
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">
                      {cat.parent_category_name || <span className="text-slate-300">-</span>}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-slate-600 text-sm">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm block truncate max-w-[180px] cursor-default">
                            {cat.description || <span className="text-slate-300 italic">No description</span>}
                          </span>
                        </TooltipTrigger>
                        {cat.description ? <TooltipContent side="top">
                          <p>{cat.description}</p>
                        </TooltipContent> : <></>}
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 rounded-md"
                          onClick={() => handleEdit(cat)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-md"
                          onClick={() => deleteMutation.mutate(cat.category_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between p-4 bg-white border-t border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">Rows:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1); }}>
                <SelectTrigger className="w-[80px] h-9 border-slate-200 text-xs">
                  <SelectValue placeholder={String(pageSize)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">
                {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, pagination.total)} of {pagination.total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-200"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="px-3 py-1 text-xs font-bold text-slate-900 border border-slate-200 rounded-md">
                  {page}/{pagination.totalPages}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-200"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <SheetContent side="right" className="sm:max-w-[450px] p-0 flex flex-col h-full border-l border-slate-200">
          <div className="p-6 border-b border-slate-100">
            <SheetHeader>
              <SheetTitle className="text-xl font-bold text-slate-900">
                {editingCategory ? "Update" : "Add New"}
              </SheetTitle>
              <SheetDescription className="text-sm font-medium text-slate-400">
                * Indicates mandatory fields
              </SheetDescription>
            </SheetHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="type" className="text-sm font-bold text-slate-700">Type <span className="text-destructive">*</span></Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData(prev => ({ ...prev, type: v }))}
                disabled={!!editingCategory}
              >
                <SelectTrigger id="type" className="h-10 border-slate-200 focus:ring-1 focus:ring-indigo-500">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Category">Category</SelectItem>
                  <SelectItem value="Sub Category">Sub Category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === "Sub Category" && (
              <div className="space-y-2 transition-all">
                <Label htmlFor="parent" className="text-sm font-bold text-slate-700">Category <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.parentCategoryId}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, parentCategoryId: v }))}
                >
                  <SelectTrigger id="parent" className="h-10 border-slate-200 focus:ring-1 focus:ring-indigo-500">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentCategories.map((cat: ProductCategory) => (
                      <SelectItem key={cat.category_id} value={String(cat.category_id)}>
                        {cat.category_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-bold text-slate-700">
                {formData.type === "Category" ? "Category Name" : "Sub Category Name"} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder={formData.type === "Category" ? "Enter category name" : "Enter sub category name"}
                className="h-10 border-slate-200 focus-visible:ring-indigo-500"
                value={formData.categoryName}
                onChange={e => setFormData(prev => ({ ...prev, categoryName: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-bold text-slate-700">Description <span className="text-destructive">*</span></Label>
              <Textarea
                id="description"
                placeholder="Enter description"
                className="border-slate-200 min-h-[120px] focus-visible:ring-indigo-500 resize-none"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          <div className="p-6 border-t border-slate-100 bg-white">
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className="border-slate-200 text-slate-900 h-10 px-6 font-semibold hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-[#3b2a82] hover:bg-[#2d2063] text-white h-10 px-6 font-semibold shadow-sm"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingCategory ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
