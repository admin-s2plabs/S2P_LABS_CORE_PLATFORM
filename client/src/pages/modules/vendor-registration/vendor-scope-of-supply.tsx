import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Loader2,
  Package,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";

const serviceInfoSchema = z.object({
  type_of_service: z.string().optional(),
  year_of_exp_loc_market: z
    .union([z.string(), z.number()])
    .transform((v) => String(v ?? ""))
    .optional(),
  year_of_exp_international: z
    .union([z.string(), z.number()])
    .transform((v) => String(v ?? ""))
    .optional(),
});

export default function VendorScopeOfSupply() {
  const [location, navigate] = useLocation();
  const isVendorRegistrationWizard = location.startsWith("/vendor/register");
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [selectedCategoryType, setSelectedCategoryType] = useState("");

  // NON-UNSPSC state
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [selectedSubId, setSelectedSubId] = useState<string>("");

  const storedAuthStr = localStorage.getItem("prokraya-auth");
  const parsedAuth = storedAuthStr ? JSON.parse(storedAuthStr) : null;
  const vendorStatus = parsedAuth?.vendorStatus;
  const isEditMode =
    vendorStatus &&
    ["Approved", "Active", "InActive", "Changes In Draft", "More Info Required", "More Information Required"].includes(
      vendorStatus,
    );

  const { data: profile } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
    enabled: !!isEditMode,
  });

  const { data: scopeData, isLoading } = useQuery<any>({
    queryKey: ["/api/vendor/scope-of-supply"],
  });

  const { data: categoryTypeLookups = [] } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/CATEGORY_TYPE"],
  });
  const categoryTypeLookup = categoryTypeLookups.find(l => l.lookup_key === "CATEGORY");
  const isNonUnspsc = categoryTypeLookup?.lookup_value === "NON-UNSPSC";

  const { data: allCategories } = useQuery<any[]>({
    queryKey: ["/api/vendor/categories"],
    enabled: !isNonUnspsc,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/categories");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // NON-UNSPSC queries
  const { data: parentCategories = [], isLoading: isParentsLoading } = useQuery<any[]>({
    queryKey: ["/api/product-categories"],
    enabled: isNonUnspsc,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/product-categories");
      if (!res.ok) return [];
      const data = await res.json();
      // Filter for top level categories (where parent_category_id is 0 or null)
      return data.filter((c: any) => !c.parent_category_id || c.parent_category_id === 0 || c.parent_category_id === "0");
    }
  });

  const { data: subCategories = [], isLoading: isSubsLoading } = useQuery<any[]>({
    queryKey: [`/api/productsmgmt/getProdCategoriesByParentCategoryId/${selectedParentId}`],
    enabled: isNonUnspsc && !!selectedParentId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/productsmgmt/getProdCategoriesByParentCategoryId/${selectedParentId}`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const groupedCategories = useMemo(() => {
    if (!allCategories) return [];
    const segments = allCategories.filter((c: any) => c.level === "segment");
    const families = allCategories.filter((c: any) => c.level === "family");
    const commodities = allCategories.filter(
      (c: any) => c.level === "commodity",
    );

    return segments.map((seg: any) => {
      const segFamilies = families.filter(
        (f: any) => f.parent_code === seg.code,
      );
      const children: any[] = [];
      segFamilies.forEach((fam: any) => {
        children.push({ ...fam, displayName: fam.name, indent: 1 });
        const famCommodities = commodities.filter(
          (c: any) => c.parent_code === fam.code,
        );
        famCommodities.forEach((com: any) => {
          children.push({ ...com, displayName: com.name, indent: 2 });
        });
      });
      return { segment: seg, children };
    });
  }, [allCategories]);

  const selectedCatName = useMemo(() => {
    if (!selectedCategory || !allCategories) return "";
    const found = allCategories?.filter((seg: any) => seg.status !== "InActive")?.find((c: any) => c.code === selectedCategory);
    return found?.name || "";
  }, [selectedCategory, allCategories]);

  // helpers to keep numeric inputs clean and disallow scientific/exponent keys
  const sanitizeIntegerInput = (value: string) => value.replace(/[^0-9]/g, "");
  const preventInvalidNumberKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (["e", "E", "-", "+"].includes(e.key)) {
      e.preventDefault();
    }
  };

  const serviceForm = useForm({
    resolver: zodResolver(serviceInfoSchema),
    defaultValues: {
      type_of_service: "",
      year_of_exp_loc_market: "",
      year_of_exp_international: "",
    },
  });

  useEffect(() => {
    if (scopeData?.serviceInfo) {
      serviceForm.reset({
        type_of_service: scopeData.serviceInfo.type_of_service || "",
        year_of_exp_loc_market: String(
          scopeData.serviceInfo.year_of_exp_loc_market ?? "",
        ),
        year_of_exp_international: String(
          scopeData.serviceInfo.year_of_exp_international ?? "",
        ),
      });
    }
  }, [scopeData]);

  const saveServiceInfo = useMutation({
    mutationFn: (data: any) =>
      apiRequest("PATCH", "/api/vendor/scope-of-supply/service-info", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor/scope-of-supply"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      toast({
        title: isEditMode
          ? "Changes saved successfully"
          : "Service details saved",
      });
      if (isEditMode && !isVendorRegistrationWizard) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        navigate(suppId ? `/app/vendors/${suppId}` : "/app/dashboard");
      } else {
        navigate("/vendor/register/banking");
      }
    },
    onError: () =>
      toast({
        title: "Failed to save service details",
        variant: "destructive",
      }),
  });

  const addCategory = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/vendor/scope-of-supply/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor/scope-of-supply"],
      });
      setSelectedCategory("");
      setSelectedParentId("");
      setSelectedSubId("");
      setSelectedCategoryType("");
      toast({ title: "Category added" });
    },
    onError: () =>
      toast({ title: "Failed to add category", variant: "destructive" }),
  });

  const removeCategory = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/vendor/scope-of-supply/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor/scope-of-supply"],
      });
      toast({ title: "Category removed" });
    },
    onError: () =>
      toast({ title: "Failed to remove category", variant: "destructive" }),
  });

  function handleAddCategory() {
    if (!selectedCategoryType) {
      toast({ title: "Please select Category Type", variant: "destructive" });
      return;
    }

    if (isNonUnspsc) {
      if (!selectedParentId || !selectedSubId) return;
      const parent = parentCategories?.filter((seg: any) => seg.status !== "InActive")?.find((p: any) => String(p.category_id || p.categoryId || p.id) === selectedParentId);
      const sub = subCategories.find((s: any) => String(s.category_id || s.categoryId || s.id) === selectedSubId);
      if (!parent || !sub) return;

      const parentName = parent.category_name || parent.categoryName || parent.name;
      const subName = sub.category_name || sub.categoryName || sub.name;

      const alreadyAdded = scopeData?.categories?.some(
        (sc: any) => sc.category_code === parentName && sc.sub_category === subName,
      );
      if (alreadyAdded) {
        toast({ title: "Category already added", variant: "destructive" });
        return;
      }

      addCategory.mutate({
        category_code: parentName,
        sub_category: subName,
        sub_category_code: subName,
        good_service_code: subName,
        category_type: selectedCategoryType,
      });
      return;
    }

    if (!selectedCategory || !allCategories) return;
    const cat = allCategories?.filter((seg: any) => seg.status !== "InActive").find((c: any) => c.code === selectedCategory);
    if (!cat) return;
    const alreadyAdded = scopeData?.categories?.some(
      (sc: any) => sc.category_code === selectedCategory,
    );
    if (alreadyAdded) {
      toast({ title: "Category already added", variant: "destructive" });
      return;
    }
    addCategory.mutate({
      category_code: selectedCategory,
      sub_category: "",
      sub_category_code: "",
      good_service_code: cat.name,
      category_type: selectedCategoryType,
    });
  }
  const isLookupLoading = categoryTypeLookups.length === 0 && isNonUnspsc === false; // Approximate check

  if (isLoading || isParentsLoading || (isNonUnspsc && selectedParentId && isSubsLoading)) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h2
            className="text-base font-semibold tracking-tight"
            data-testid="text-scope-title"
          >
            Scope of Supply
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Select services/products you supply and provide experience details.
        </p>
      </div>

      <Form {...serviceForm}>
        <form
          id="vendor-scope-form"
          onSubmit={serviceForm.handleSubmit((data) => {
            if (!scopeData?.categories || scopeData.categories.length === 0) {
              toast({
                title: "Please add atleast one category",
                variant: "destructive",
              });
              return;
            }
            saveServiceInfo.mutate(data);
          })}
        >
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="lg:col-span-3">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">
                  Scope of Services / Products
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4 pt-0">
                <div className="flex items-end gap-3 flex-wrap">
                  {!isNonUnspsc ? (
                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                      <label className="text-sm font-medium">Category <span className="text-red-500">*</span></label>
                      <Popover open={comboOpen} onOpenChange={setComboOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={comboOpen}
                            className="w-full justify-between font-normal"
                            data-testid="select-category"
                          >
                            {selectedCatName || "Search category..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Search category..."
                              data-testid="input-search-category"
                            />
                            <CommandList>
                              <CommandEmpty>No category found.</CommandEmpty>
                              {groupedCategories.map((group: any) => (
                                <CommandGroup
                                  key={group.segment.code}
                                  heading={group.segment.name}
                                >
                                  <CommandItem
                                    value={`${group.segment.name} ${group.segment.code}`}
                                    onSelect={() => {
                                      setSelectedCategory(group.segment.code);
                                      setComboOpen(false);
                                    }}
                                    data-testid={`option-category-${group.segment.code}`}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedCategory === group.segment.code
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    <span className="font-medium">
                                      {group.segment.name}
                                    </span>
                                  </CommandItem>
                                  {group.children.map((child: any) => (
                                    <CommandItem
                                      key={child.code}
                                      value={`${child.name} ${child.code}`}
                                      onSelect={() => {
                                        setSelectedCategory(child.code);
                                        setComboOpen(false);
                                      }}
                                      data-testid={`option-category-${child.code}`}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedCategory === child.code
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      <span
                                        className={cn(
                                          child.indent === 1 ? "pl-2" : "pl-4",
                                          child.indent === 2
                                            ? "text-muted-foreground"
                                            : "",
                                        )}
                                      >
                                        {child.name}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium">Category <span className="text-red-500">*</span></label>
                        <Select
                          value={selectedParentId}
                          onValueChange={(val) => {
                            setSelectedParentId(val);
                            setSelectedSubId("");
                          }}
                        >
                          <SelectTrigger data-testid="select-parent-category">
                            <SelectValue placeholder="Select Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {parentCategories?.filter((seg: any) => seg.status !== "InActive")?.map((cat: any) => (
                              <SelectItem key={cat.category_id || cat.categoryId || cat.id} value={String(cat.category_id || cat.categoryId || cat.id)}>
                                {cat.category_name || cat.categoryName || cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium">Sub-Category <span className="text-red-500">*</span></label>
                        <Select
                          value={selectedSubId}
                          onValueChange={setSelectedSubId}
                          disabled={!selectedParentId}
                        >
                          <SelectTrigger data-testid="select-sub-category">
                            <SelectValue placeholder="Select Sub-Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {subCategories.map((sub: any) => (
                              <SelectItem key={sub.category_id || sub.categoryId || sub.id} value={String(sub.category_id || sub.categoryId || sub.id)}>
                                {sub.category_name || sub.categoryName || sub.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <label className="text-sm font-medium">Category Type <span className="text-red-500">*</span></label>
                    <Select
                      value={selectedCategoryType}
                      onValueChange={setSelectedCategoryType}
                    >
                      <SelectTrigger data-testid="select-category-type">
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Primary producer/Manufacturer">Primary producer/Manufacturer</SelectItem>
                        <SelectItem value="Distributor / Dealer">Distributor / Dealer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddCategory}
                    disabled={(!isNonUnspsc ? !selectedCategory : (!selectedParentId || !selectedSubId)) || !selectedCategoryType || addCategory.isPending}
                    data-testid="button-add-category"
                  >
                    {addCategory.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}{" "}
                    Add
                  </Button>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Selected Categories
                  </h4>
                  {scopeData?.categories?.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-medium">
                            {isNonUnspsc ? "Category" : "Category Code"}
                          </TableHead>
                          <TableHead className="text-xs font-medium">
                            Sub Category
                          </TableHead>
                          {!isNonUnspsc && (
                            <TableHead className="text-xs font-medium">
                              Good/Service Code
                            </TableHead>
                          )}
                          <TableHead className="text-xs font-medium">
                            Type
                          </TableHead>
                          <TableHead className="text-xs font-medium w-[60px]">
                            Action
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scopeData.categories.map((cat: any) => (
                          <TableRow
                            key={cat.id}
                            data-testid={`row-category-${cat.id}`}
                          >
                            <TableCell className="text-sm py-2">
                              {cat.category_code}
                            </TableCell>
                            <TableCell className="text-sm py-2">
                              {cat.sub_category}
                            </TableCell>
                            {!isNonUnspsc && (
                              <TableCell className="text-sm py-2">
                                {cat.good_service_code}
                              </TableCell>
                            )}
                            <TableCell className="text-sm py-2">
                              {cat.category_type || "-"}
                            </TableCell>
                            <TableCell className="py-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeCategory.mutate(cat.id)}
                                data-testid={`button-delete-category-${cat.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md">
                      <Package className="h-10 w-10 mb-2 opacity-40" />
                      <p className="text-sm">No categories selected</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Experience Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4 pt-0">
                <FormField
                  control={serviceForm.control}
                  name="type_of_service"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Describe the services or products you provide..."
                          className="resize-none"
                          rows={4}
                          data-testid="input-service-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={serviceForm.control}
                  name="year_of_exp_loc_market"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Domestic Experience (Years)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. 10"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          onChange={(e) =>
                            field.onChange(sanitizeIntegerInput(e.target.value))
                          }
                          onKeyDown={preventInvalidNumberKey}
                          data-testid="input-domestic-experience"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={serviceForm.control}
                  name="year_of_exp_international"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>International Experience (Years)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. 5"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          onChange={(e) =>
                            field.onChange(sanitizeIntegerInput(e.target.value))
                          }
                          onKeyDown={preventInvalidNumberKey}
                          data-testid="input-international-experience"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {isEditMode && profile?.attribute_4 === "Active" && (
            <div className="flex items-center justify-between gap-3 pt-4 border-t sticky bottom-0 bg-background pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const suppId = profile?.id || parsedAuth?.supplierId;
                  navigate(
                    suppId ? `/app/vendors/${suppId}` : "/app/dashboard",
                  );
                }}
                data-testid="button-cancel-edit"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={saveServiceInfo.isPending}
                data-testid="button-save-changes"
              >
                {saveServiceInfo.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
