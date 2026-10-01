import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Package,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface ApprovedSupplierRow {
  id: number;
  supplier_name: string;
  email_id?: string;
  phone?: string;
  country?: string;
  city?: string;
}

export function mapApprovedSupplierToVendor(
  s: ApprovedSupplierRow,
  extras?: { score?: number; reasons?: string[] },
) {
  const name = s.supplier_name || "";
  return {
    supplierId: s.id,
    supplierName: name,
    contactEmail: s.email_id || "",
    supplierSite: `${name}-${s.city || ""}-${s.country || ""}`,
    supplierContact: name,
    supplierContactNo: s.phone || "",
    score: extras?.score,
    reasons: extras?.reasons,
  };
}

export function mapApprovedSupplierToInvitePayload(s: ApprovedSupplierRow) {
  const name = s.supplier_name || "";
  return {
    supplier_id: s.id,
    supplier_name: name,
    supplier_site: `${name}-${s.city || ""}-${s.country || ""}`,
    supplier_contact: name,
    supplier_contact_email: s.email_id || "",
    supplier_contact_no: s.phone || "",
  };
}

interface InviteSuppliersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeSupplierIds?: Array<number | string>;
  selectionMode?: "multi" | "single";
  title?: string;
  description?: string;
  confirmLabel?: string;
  isConfirming?: boolean;
  onConfirm: (suppliers: ApprovedSupplierRow[]) => void;
}

export function InviteSuppliersSheet({
  open,
  onOpenChange,
  excludeSupplierIds = [],
  selectionMode = "multi",
  title = "Invite Suppliers",
  description = "Select active suppliers to invite to this bid.",
  confirmLabel,
  isConfirming = false,
  onConfirm,
}: InviteSuppliersSheetProps) {
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("");
  const [vendorCategoryOpen, setVendorCategoryOpen] = useState(false);
  const [debouncedSupplierSearch, setDebouncedSupplierSearch] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([]);

  const excludeSet = useMemo(
    () => new Set(excludeSupplierIds.map((id) => String(id))),
    [excludeSupplierIds],
  );

  useEffect(() => {
    if (!open) {
      setSupplierSearch("");
      setDebouncedSupplierSearch("");
      setSelectedCategoryFilter("");
      setSupplierPage(1);
      setSelectedSupplierIds([]);
      setVendorCategoryOpen(false);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSupplierSearch(supplierSearch);
      setSupplierPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [supplierSearch]);

  const { data: categoryTypeLookups = [] } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/CATEGORY_TYPE"],
    enabled: open,
  });

  const categoryTypeLookup = categoryTypeLookups.find(
    (l) => l.lookup_key === "CATEGORY",
  );
  const isNonUnspsc = categoryTypeLookup?.lookup_value === "NON-UNSPSC";

  const { data: productCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/product-categories"],
    queryFn: async () => {
      const res = await fetch("/api/product-categories");
      if (!res.ok) throw new Error("Failed to fetch product categories");
      return res.json();
    },
    enabled: open && isNonUnspsc,
  });

  const { data: categoriesData } = useQuery<
    { id: string; code: string; name: string; level: string }[]
  >({
    queryKey: ["/api/categories"],
    enabled: open && !isNonUnspsc,
  });

  const categories = isNonUnspsc
    ? productCategories.map((pc: any) => ({
        id: String(pc.category_id || pc.categoryId || pc.id),
        code: pc.category_code || pc.categoryCode || String(pc.category_id || pc.categoryId || pc.id),
        name: pc.category_name || pc.categoryName || pc.name,
        level: "1",
      }))
    : categoriesData || [];

  const { data: approvedSuppliersData, isLoading } = useQuery<{
    data: ApprovedSupplierRow[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: [
      "/api/dbo/approved-suppliers",
      supplierPage,
      debouncedSupplierSearch,
      selectedCategoryFilter,
    ],
    queryFn: async ({ queryKey }) => {
      const [, page, search, category] = queryKey as [string, number, string, string];
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        search: search || "",
        category: category || "",
      });
      const res = await apiRequest("GET", `/api/dbo/approved-suppliers?${params}`);
      return res.json();
    },
    enabled: open,
  });

  const approvedSuppliers = approvedSuppliersData?.data || [];
  const availableSuppliers = approvedSuppliers.filter(
    (s) => !excludeSet.has(String(s.id)),
  );

  const toggleSupplier = (id: number) => {
    if (selectionMode === "single") {
      setSelectedSupplierIds((prev) => (prev.includes(id) ? [] : [id]));
      return;
    }
    setSelectedSupplierIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleConfirm = () => {
    const selected = approvedSuppliers.filter((s) => selectedSupplierIds.includes(s.id));
    onConfirm(selected);
  };

  const resolvedConfirmLabel =
    confirmLabel ||
    (selectionMode === "single"
      ? "Select Supplier"
      : `Invite (${selectedSupplierIds.length})`);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      widthClassName="sm:max-w-[600px]"
      onCancel={() => onOpenChange(false)}
      onSubmit={handleConfirm}
      submitLabel={resolvedConfirmLabel}
      isSubmitting={isConfirming}
      submitDisabled={selectedSupplierIds.length === 0}
    >
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        <div className="pb-3 space-y-3">
          <Popover open={vendorCategoryOpen} onOpenChange={setVendorCategoryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={vendorCategoryOpen}
                className="w-full justify-between font-normal"
                data-testid="select-vendor-category"
              >
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  {selectedCategoryFilter
                    ? categories.find((cat) => cat.name === selectedCategoryFilter)?.name ||
                      selectedCategoryFilter
                    : "Select Category..."}
                </span>
                {selectedCategoryFilter ? (
                  <span
                    role="button"
                    className="shrink-0 rounded-sm opacity-50 hover:opacity-100"
                    data-testid="button-clear-category"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedCategoryFilter("");
                      setSupplierPage(1);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </span>
                ) : (
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[540px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search category..." />
                <CommandList>
                  <CommandEmpty>No category found.</CommandEmpty>
                  <CommandGroup>
                    {categories.map((cat) => (
                      <CommandItem
                        key={cat.id}
                        value={cat.name}
                        onSelect={() => {
                          setSelectedCategoryFilter(cat.name);
                          setVendorCategoryOpen(false);
                          setSupplierPage(1);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedCategoryFilter === cat.name ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {cat.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by supplier name, country, or email"
              className="pl-9"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              data-testid="input-search-supplier"
            />
          </div>
        </div>
        <div>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="min-w-[160px]">Supplier Name</TableHead>
                  <TableHead className="min-w-[100px]">Country</TableHead>
                  <TableHead className="min-w-[160px]">Email</TableHead>
                  <TableHead className="min-w-[110px]">Contact No</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No matching suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  availableSuppliers.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      data-testid={`row-supplier-${s.id}`}
                      onClick={() => toggleSupplier(s.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedSupplierIds.includes(s.id)}
                          onCheckedChange={() => toggleSupplier(s.id)}
                          data-testid={`checkbox-supplier-${s.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[160px] truncate">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[160px] cursor-default">
                              {s.supplier_name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{s.supplier_name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{s.country || "-"}</TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm block truncate max-w-[160px] cursor-default">
                              {s.email_id || "-"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>{s.email_id || "-"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{s.phone || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
        {(approvedSuppliersData?.totalPages || 1) > 1 && (
          <div className="flex items-center justify-between py-2 border-t">
            <span className="text-xs text-muted-foreground">
              Page {supplierPage} of {approvedSuppliersData?.totalPages || 1} (
              {approvedSuppliersData?.total || 0} suppliers)
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={supplierPage <= 1}
                onClick={() => setSupplierPage((p) => p - 1)}
                data-testid="button-supplier-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={supplierPage >= (approvedSuppliersData?.totalPages || 1)}
                onClick={() => setSupplierPage((p) => p + 1)}
                data-testid="button-supplier-next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="pt-3 border-t">
          <span className="text-sm text-muted-foreground">
            {selectedSupplierIds.length} supplier(s) selected
          </span>
        </div>
    </FormSheet>
  );
}
