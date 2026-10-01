import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Category, Item, ItemWithSpecs } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  FileText,
  Layers,
  Package,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

interface PaginatedResponse {
  items: Item[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const itemFormSchema = z.object({
  itemCode: z.string().min(1, "Item code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  categoryCode: z.string().min(1, "Category is required"),
  categoryName: z.string().nullable().optional(),
  taxCode: z.string().nullable().optional(),
  taxRate: z.string().nullable().optional(),
  unitOfMeasure: z.string().default("EA"),
  standardPrice: z.coerce.number().min(0, "Must be 0 or greater").nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  manufacturerPartNumber: z.string().nullable().optional(),
  leadTimeDays: z.coerce.number().min(0, "Must be 0 or greater").nullable().optional(),
  minOrderQuantity: z.coerce.number().min(0, "Must be 0 or greater").default(1),
  productHSN: z.string().nullable().optional(),
  productSpecification: z.string().nullable().optional(),
  specifications: z.array(z.object({
    name: z.string().min(1, "Name required"),
    value: z.string().min(1, "Value required"),
    units: z.string().nullable().optional(),
  })).optional(),
});

type ItemFormValues = z.infer<typeof itemFormSchema>;

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string; icon: any }> = {
    active: { variant: "default", label: "Active", icon: CheckCircle2 },
    inactive: { variant: "secondary", label: "Inactive", icon: XCircle },
    discontinued: { variant: "destructive", label: "Discontinued", icon: XCircle },
  };
  const config = variants[status] || { variant: "outline", label: status, icon: null };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      {Icon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm text-right max-w-[200px] ${mono ? 'font-mono' : 'font-medium'}`}>
        {value || "-"}
      </span>
    </div>
  );
}

export default function Items() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<ItemWithSpecs | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { toast } = useToast();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [categoryFilter, statusFilter, pageSize]);

  const { data: paginatedData, isLoading, refetch: refetchItems } = useQuery<PaginatedResponse>({
    queryKey: ["/api/items", { page, limit: pageSize, search: debouncedSearch, category: categoryFilter, status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await apiRequest("GET", `/api/items?${params}`);
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    placeholderData: (prev: any) => prev,
  });

  const items = paginatedData?.items || [];
  const totalItems = paginatedData?.total || 0;
  const totalPages = paginatedData?.totalPages || 1;

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: productCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/product-categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/product-categories");
      if (!res.ok) throw new Error("Failed to fetch product categories");
      return res.json();
    }
  });

  const commodityCategories = categories.filter(c => c.level === "commodity" || c.level === "family");


  const defaultValues: ItemFormValues = {
    itemCode: "",
    name: "",
    description: "",
    categoryCode: "",
    categoryName: "",
    taxCode: "",
    taxRate: "",
    unitOfMeasure: "EA",
    standardPrice: undefined,
    manufacturer: "",
    manufacturerPartNumber: "",
    leadTimeDays: undefined,
    minOrderQuantity: 1,
    productHSN: "",
    productSpecification: "",
    specifications: [],
  };

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      itemCode: "",
      name: "",
      description: "",
      categoryCode: "",
      categoryName: "",
      unitOfMeasure: "EA",
      taxCode: "",
      taxRate: "",
      standardPrice: undefined,
      manufacturer: "",
      manufacturerPartNumber: "",
      leadTimeDays: undefined,
      minOrderQuantity: 1,
      specifications: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "specifications",
  });

  const { data: categoryTypeLookups = [] } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/CATEGORY_TYPE"],
  });

  const categoryTypeLookup = categoryTypeLookups.find(l => l.lookup_key === "CATEGORY");
  const isNonUnspsc = categoryTypeLookup?.lookup_value === "NON-UNSPSC";

 const createItemMutation = useMutation({
  mutationFn: async (data: ItemFormValues) => {
    return apiRequest("POST", "/api/items", data);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    setIsAddDialogOpen(false);
    form.reset();

    toast({
      title: "Item Created",
      description: "The item has been added to the catalog.",
    });
  },
  onError: (error: any) => {
    toast({
      title: "Error",
      description:
        error?.message || "Failed to create item. Please try again.",
      variant: "destructive",
    });
  },
});

  const updateItemMutation = useMutation({
    mutationFn: async (data: ItemFormValues) => {
      if (!selectedItem) throw new Error("No item selected for editing");
      const res = await apiRequest("PATCH", `/api/items/${selectedItem.id}`, data);
      return res.json() as Promise<ItemWithSpecs>;
    },
    onSuccess: async (updatedItem: ItemWithSpecs) => {
      queryClient.setQueriesData<PaginatedResponse>(
        { queryKey: ["/api/items"] },
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((item) =>
              item.id === updatedItem.id ? { ...item, ...updatedItem } : item
            ),
          };
        }
      );

      setSelectedItem((prev) =>
        prev?.id === updatedItem.id ? { ...prev, ...updatedItem } : prev
      );

      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      await refetchItems();
      setIsAddDialogOpen(false);
      setIsEditDialogOpen(false);
      form.reset();
      toast({
        title: "Item Updated",
        description: "The item has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest("DELETE", `/api/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      toast({ title: "Item deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete item", description: error.message, variant: "destructive" });
    },
  });

  const handleEditClick = (item: ItemWithSpecs) => {
    setSelectedItem(item);
    setIsEditDialogOpen(true);
    const rawSpecs = (item as any).productSpecification;
    let specs = [];
    try {
      specs = rawSpecs ? (typeof rawSpecs === 'string' ? JSON.parse(rawSpecs) : rawSpecs) : [];
      if (!Array.isArray(specs)) specs = [];
    } catch (e) {
      console.error("Failed to parse productSpecification:", e);
      specs = [];
    }

    form.reset({
      itemCode: item.itemCode || "",
      name: item.name || "",
      description: item.description || "",
      categoryCode: item.categoryCode || "",
      categoryName: item.categoryName || "",
      unitOfMeasure: item.unitOfMeasure || "EA",
      standardPrice: item.standardPrice || undefined,
      manufacturer: item.manufacturer || "",
      manufacturerPartNumber: item.manufacturerPartNumber || "",
      leadTimeDays: item.leadTimeDays || undefined,
      minOrderQuantity: item.minOrderQuantity || 1,
      productHSN: (item as any).productHSN || "",
      specifications: specs,
    });
    setIsAddDialogOpen(true);
  };

  const handleCategoryChange = (val: string) => {
    if (isNonUnspsc) {
      const cat = productCategories.find(c => String(c.category_id || c.categoryId || c.id) === val);
      if (cat) {
        form.setValue("categoryCode", String(cat.category_id || cat.categoryId || cat.id));
        form.setValue("categoryName", cat.category_name || cat.categoryName || cat.name);
        form.clearErrors(["categoryCode", "categoryName"]);
      }
    } else {
      const cat = commodityCategories.find(c => c.code === val);
      if (cat) {
        form.setValue("categoryCode", cat.code);
        form.setValue("categoryName", cat.name);
        form.clearErrors(["categoryCode", "categoryName"]);
      }
    }
  };

  const onSubmit = (data: ItemFormValues) => {
    const formattedData = {
      ...data,
      productSpecification: data.specifications && data.specifications.length > 0
        ? JSON.stringify(data.specifications)
        : null
    };

    if (isEditDialogOpen) {
      updateItemMutation.mutate(formattedData);
    } else {
      createItemMutation.mutate(formattedData);
    }
  };

  // Pagination helpers
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  if (isLoading && page === 1) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary" data-testid="page-title">Item Master</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your product catalog with {totalItems.toLocaleString()} items
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setIsEditDialogOpen(false);
              form.reset(defaultValues);
              setIsAddDialogOpen(true);
            }}
            data-testid="button-add-item"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>

        <FormSheet
          open={isAddDialogOpen}
          onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) {
              setIsEditDialogOpen(false);
              form.reset(defaultValues);
            }
          }}
          title={isEditDialogOpen ? "Edit Item Detail" : "Add New Item"}
          onSubmit={form.handleSubmit(onSubmit)}
          submitLabel={
            isEditDialogOpen
              ? (updateItemMutation.isPending ? "Updating..." : "Save Changes")
              : (createItemMutation.isPending ? "Creating..." : "Create Item")
          }
          isSubmitting={createItemMutation.isPending || updateItemMutation.isPending}
          submitDisabled={createItemMutation.isPending || updateItemMutation.isPending}
        >
          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-destructive">*</span> Indicates mandatory fields
          </p>
          <Form {...form}>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="itemCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU Code <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., EL-WIRE-001" {...field} data-testid="input-item-code" disabled={isEditDialogOpen} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="Item name" {...field} data-testid="input-item-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="categoryCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={handleCategoryChange} value={field.value ?? undefined}>
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isNonUnspsc ? (
                              productCategories.map(cat => (
                                <SelectItem key={cat.category_id || cat.categoryId || cat.id} value={String(cat.category_id || cat.categoryId || cat.id)}>
                                  {cat.category_name || cat.categoryName || cat.name}
                                </SelectItem>
                              ))
                            ) : (
                              commodityCategories.map(cat => (
                                <SelectItem key={cat.code} value={cat.code}>
                                  {cat.code} - {cat.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {isNonUnspsc && (
                    <FormField
                      control={form.control}
                      name="productHSN"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product HSN</FormLabel>
                          <FormControl>
                            <Input placeholder="HSN Code" {...field} value={field.value ?? ""} data-testid="input-product-hsn" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Textarea placeholder="Item description" {...field} value={field.value ?? ""} data-testid="input-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(isNonUnspsc || fields.length > 0) && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Item Specifications</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => append({ name: "", value: "", units: "" })}
                        data-testid="button-add-spec"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add New Item Specification
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {fields.map((field, index) => (
                        <div key={field.id} className="grid grid-cols-12 gap-2 items-start border p-3 rounded-lg bg-muted/20">
                          <div className="col-span-4">
                            <FormField
                              control={form.control}
                              name={`specifications.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. Length" {...field} className="h-8" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-4">
                            <FormField
                              control={form.control}
                              name={`specifications.${index}.value`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Value</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. 100" {...field} className="h-8" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`specifications.${index}.units`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Units</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. mm" {...field} value={field.value ?? ""} className="h-8" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-1 pb-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 text-destructive"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
          </Form>
        </FormSheet>
      </div>


      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[250px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU, name, or description..."
            className="pl-10"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            data-testid="input-search-items"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[220px]" data-testid="select-category-filter">
            <Layers className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {isNonUnspsc ? (
                              productCategories.map(cat => (
                                <SelectItem key={cat.category_id || cat.categoryId || cat.id} value={String(cat.category_id || cat.categoryId || cat.id)}>
                                  {cat.category_name || cat.categoryName || cat.name}
                                </SelectItem>
                              ))
                            ) : (
                              commodityCategories.map(cat => (
                                <SelectItem key={cat.code} value={cat.code}>
                                  {cat.name}
                                </SelectItem>
                              ))
                            )}
           
          </SelectContent>
        </Select>
      </div>

      {/* Main Content */}
      <Card className="shadow-sm border border-slate-200 overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="border rounded-lg overflow-auto max-h-[500px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-[120px]">SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[180px]">Category</TableHead>
                  <TableHead className="w-[100px] text-right text-slate-500 font-medium text-xs pr-6">
                    <Settings className="h-3.5 w-3.5 ml-auto" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: pageSize }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                      <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                      <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                      <TableCell><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length > 0 ? (
                  items.map(item => (
                    <TableRow
                      key={item.id}
                      className="hover:bg-slate-50/30 transition-colors border-slate-50"
                      data-testid={`row-item-${item.id}`}
                    >
                      <TableCell className="font-mono text-xs text-primary">
                        {item.itemCode && item.itemCode !== String(item.id) ? item.itemCode : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm truncate max-w-[250px]">{item.name}</span>
                          <span className="text-xs text-muted-foreground">ID: {item.id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground truncate block max-w-[170px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[170px] cursor-default">
                                {item.categoryName || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{item.categoryName || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end items-center gap-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 rounded-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(item);
                            }}
                            data-testid={`button-edit-item-${item.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteItemMutation.mutate(String(item.id));
                            }}
                            disabled={deleteItemMutation.isPending}
                            data-testid={`button-delete-item-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No items found matching your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between p-4 bg-white border-t border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">Rows:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
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
                {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalItems)} of {totalItems}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-200"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="px-3 py-1 text-xs font-bold text-slate-900 border border-slate-200 rounded-md">
                  {page}/{totalPages}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-200"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

