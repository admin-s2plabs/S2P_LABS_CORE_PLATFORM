import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";

interface BudgetLine {
  id: number;
  segment_dtl_name: string;
  amount: string;
  consumed_amount: string;
  reserved_amount: string;
  budget_mst_id: number;
  budget_name: string;
  budget_curr: string;
  dept_id: string;
}

interface CreatePOFromContractSheetProps {
  contractId: string | number;
  refNo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new PO number right after a successful create — the sheet no longer auto-navigates away, so the caller can surface it (e.g. as a clickable action) in place. */
  onCreated?: (poNumber: string) => void;
}

export function CreatePOFromContractSheet({ contractId, refNo, open, onOpenChange, onCreated }: CreatePOFromContractSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [contractDetailsForPO, setContractDetailsForPO] = useState<any>(null);
  const [poSelectedLines, setPoSelectedLines] = useState("");
  const [selectedPOVendorId, setSelectedPOVendorId] = useState("");
  const [selectedPOVendorName, setSelectedPOVendorName] = useState("");
  const [vendorSearchPO, setVendorSearchPO] = useState("");
  const [vendorDropdownOpenPO, setVendorDropdownOpenPO] = useState(false);
  const [poPaymentTermsId, setPoPaymentTermsId] = useState("");
  const [poPaymentTermsName, setPoPaymentTermsName] = useState("");
  const [poAdvanceFlag, setPoAdvanceFlag] = useState(false);
  const [poAdvancePercentage, setPoAdvancePercentage] = useState("");
  const [poBudgetId, setPoBudgetId] = useState("");

  const { data: poVendorsData } = useQuery<{ data: { id: number; company_name?: string; companyName?: string }[] }>({
    queryKey: ["/api/dbo/suppliers", { page: 1, limit: 500, status: "Active,Changes In Draft" }],
    queryFn: () =>
      apiRequest("GET", "/api/dbo/suppliers?page=1&limit=500&status=Active%2CChanges%20In%20Draft").then((r) => r.json()),
    enabled: open,
  });
  const poVendorsList = poVendorsData?.data || [];
  const filteredPOVendors = poVendorsList.filter((v) => {
    const name = v.companyName || v.company_name || "";
    return name.toLowerCase().includes(vendorSearchPO.toLowerCase());
  });

  const { data: poPaymentTermsData } = useQuery<{ data: { id: number; terms_name: string; status: string }[] }>({
    queryKey: ["/api/payment-terms?limit=100"],
    enabled: open,
  });
  const poPaymentTermsOptions = (poPaymentTermsData?.data || []).filter((pt) => pt.status === "Y");

  const { data: budgetLinesData } = useQuery<BudgetLine[]>({
    queryKey: ["/api/budgets/approved-lines"],
    enabled: open,
  });
  const uniqueBudgetLines = Array.from(
    new Map((budgetLinesData || []).map((item) => [item.id, item])).values(),
  );

  useEffect(() => {
    if (!open) return;
    setContractDetailsForPO(null);
    setPoSelectedLines("");
    setSelectedPOVendorId("");
    setSelectedPOVendorName("");
    setVendorSearchPO("");
    setPoPaymentTermsId("");
    setPoPaymentTermsName("");
    setPoAdvanceFlag(false);
    setPoAdvancePercentage("");
    setPoBudgetId("");

    (async () => {
      try {
        const res = await apiRequest("GET", `/api/purchase-orders/contract-details/${contractId}`);
        const data = await res.json();
        setContractDetailsForPO(data);
        if (data?.vendor?.supplier_id) {
          setSelectedPOVendorId(String(data.vendor.supplier_id));
          setSelectedPOVendorName(data.vendor.supplier_name || "");
        }
        setPoSelectedLines((data?.lines || []).filter((l: any) => !l.po_number).map((l: any) => String(l.id)).join(","));
      } catch (e) {
        console.error("Error fetching contract details:", e);
        toast({ title: "Error", description: "Failed to load contract details", variant: "destructive" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contractId]);

  const createPOFromContractMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/purchase-orders/from-contract", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "PO Created", description: `Draft PO ${data.poNumber} created from Contract ${refNo}` });
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "sow"] });
      if (data.poNumber) {
        onCreated?.(data.poNumber);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create PO from Contract", variant: "destructive" });
    },
  });

  const handleCreatePOFromContract = () => {
    if (!selectedPOVendorId) return;
    if (poAdvanceFlag && !poAdvancePercentage) {
      toast({ title: "Validation Failure", description: "Please add Advance Percentage to Continue!", variant: "destructive" });
      return;
    }
    if (!poSelectedLines.trim()) {
      toast({ title: "Validation Failure", description: "Please select Lines to proceed", variant: "destructive" });
      return;
    }
    createPOFromContractMutation.mutate({
      contractId,
      supplierId: selectedPOVendorId,
      paymentTermsId: poPaymentTermsId || null,
      paymentTerms: poPaymentTermsName || null,
      advanceFlag: poAdvanceFlag ? "Y" : "N",
      advancePercentage: poAdvancePercentage || null,
      selectedLines: poSelectedLines.split(",").join("~"),
      budgetId: poBudgetId || null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[55vw] sm:max-w-[55vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create PO from Contract {refNo}</SheetTitle>
          <SheetDescription>
            Auto-filled from the contract's Scope of Work. Select a supplier and review details.
          </SheetDescription>
        </SheetHeader>

        {!contractDetailsForPO ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading contract details...</span>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Title</Label>
                <p className="text-sm font-medium" data-testid="text-contract-title-po">
                  {contractDetailsForPO.header?.title || "-"}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Amount</Label>
                <p className="text-sm font-medium" data-testid="text-contract-amount-po">
                  {formatCurrency(contractDetailsForPO.header?.contract_amount, contractDetailsForPO.header?.currency)}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Owner</Label>
                <p className="text-sm">{contractDetailsForPO.header?.owner_name || "-"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Department</Label>
                <p className="text-sm">{contractDetailsForPO.header?.department_name || "-"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">End Date</Label>
                <p className="text-sm">{formatDate(contractDetailsForPO.header?.end_date)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <p className="text-sm">{contractDetailsForPO.header?.currency || "AED"}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-2">
                Scope of Work Lines ({contractDetailsForPO.lines?.length || 0})
              </h4>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium w-[50px]">#</TableHead>
                      <TableHead className="text-xs py-1.5">Item</TableHead>
                      <TableHead className="text-xs py-1.5">Category</TableHead>
                      <TableHead className="text-xs py-1.5 text-right">Qty</TableHead>
                      <TableHead className="text-xs py-1.5">UOM</TableHead>
                      <TableHead className="text-xs py-1.5 text-right">Unit Cost</TableHead>
                      <TableHead className="text-xs py-1.5 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(contractDetailsForPO.lines || []).map((line: any, idx: number) => (
                      <TableRow key={line.id || idx} className={line.po_number ? "opacity-60" : undefined}>
                        <TableCell className="font-mono text-sm py-2">
                          <Checkbox
                            id={"contract-to-po-line" + line.id}
                            checked={poSelectedLines.split(",").filter(Boolean).includes(String(line.id))}
                            disabled={!!line.po_number}
                            onCheckedChange={(checked) => {
                              const existingIds = poSelectedLines.split(",").filter(Boolean);
                              let updatedIds = [...existingIds];
                              if (checked) {
                                if (!updatedIds.includes(String(line.id))) updatedIds.push(String(line.id));
                              } else {
                                updatedIds = updatedIds.filter((id) => id !== String(line.id));
                              }
                              setPoSelectedLines(updatedIds.join(","));
                            }}
                            data-testid={"contract-to-po-line-test-id" + line.id}
                          />
                        </TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[160px] truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[160px] cursor-default">
                                {line.item_name || line.description || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>
                                {line.item_name || line.description || "-"}
                                {line.po_number ? ` (PO: ${line.po_number})` : ""}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          {line.po_number && (
                            <span className="text-[10px] text-muted-foreground block">PO: {line.po_number}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[100px] truncate">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm block truncate max-w-[100px] cursor-default">
                                {line.category_name || "-"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{line.category_name || "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right">{line.quantity || 0}</TableCell>
                        <TableCell className="text-xs py-1.5">{line.uom || "-"}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right">
                          {parseFloat(line.unit_cost || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right">
                          {parseFloat(line.total_cost || 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="text-sm font-semibold">Supplier Selection</h4>
              <div className="space-y-1.5 relative">
                <Label>
                  Supplier <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={vendorDropdownOpenPO ? vendorSearchPO : selectedPOVendorName || vendorSearchPO}
                    onChange={(e) => {
                      setVendorSearchPO(e.target.value);
                      setVendorDropdownOpenPO(true);
                      if (!e.target.value) {
                        setSelectedPOVendorId("");
                        setSelectedPOVendorName("");
                      }
                    }}
                    onFocus={() => setVendorDropdownOpenPO(true)}
                    onBlur={() => setTimeout(() => setVendorDropdownOpenPO(false), 200)}
                    placeholder="Search suppliers..."
                    className="pl-8"
                    data-testid="input-vendor-search-po"
                    disabled
                  />
                  {vendorDropdownOpenPO && (
                    <div className="absolute z-50 top-full left-0 w-full mt-1 border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                      {filteredPOVendors.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-2">No suppliers found</p>
                      ) : (
                        filteredPOVendors.slice(0, 20).map((v) => {
                          const name = v.companyName || v.company_name || "";
                          return (
                            <button
                              key={v.id}
                              className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSelectedPOVendorId(String(v.id));
                                setSelectedPOVendorName(name);
                                setVendorDropdownOpenPO(false);
                                setVendorSearchPO("");
                              }}
                              data-testid={`vendor-po-option-${v.id}`}
                            >
                              {name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-budget-contract">Budget</Label>
                <Select
                  value={poBudgetId}
                  onValueChange={setPoBudgetId}
                >
                  <SelectTrigger data-testid="select-budget-po-contract">
                    <SelectValue placeholder="Select Budget (optional)">
                      {poBudgetId &&
                        (() => {
                          const selected = uniqueBudgetLines.find((bl) => String(bl.id) === poBudgetId);
                          return selected ? `${selected.budget_name} . ${selected.segment_dtl_name}` : "Select Budget (optional)";
                        })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueBudgetLines.length > 0 ? (
                      uniqueBudgetLines.map((budgetLine) => {
                        const lineAmount = Math.max(
                          0,
                          (parseFloat(budgetLine.amount) || 0) -
                            (parseFloat(budgetLine.consumed_amount) || 0) -
                            (parseFloat(budgetLine.reserved_amount) || 0),
                        );
                        const currencySymbol =
                          budgetLine.budget_curr === "INR"
                            ? "₹ "
                            : budgetLine.budget_curr === "USD"
                              ? "$ "
                              : budgetLine.budget_curr === "AED"
                                ? "AED "
                                : budgetLine.budget_curr === "EUR"
                                  ? "€ "
                                  : budgetLine.budget_curr === "GBP"
                                    ? "£ "
                                    : `${budgetLine.budget_curr} `;
                        return (
                          <SelectItem key={budgetLine.id} value={String(budgetLine.id)} className="py-2">
                            <div className="flex flex-col">
                              <span>
                                {budgetLine.budget_name} . {budgetLine.segment_dtl_name}
                              </span>
                              <span className="text-xs text-green-600">
                                Available Budget - {currencySymbol}
                                {lineAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground">No approved budgets available</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Terms</Label>
                  <Select
                    value={poPaymentTermsId}
                    onValueChange={(v) => {
                      const selectedTerm = poPaymentTermsOptions.find((pt) => String(pt.id) === v);
                      setPoPaymentTermsId(v);
                      setPoPaymentTermsName(selectedTerm?.terms_name || "");
                    }}
                  >
                    <SelectTrigger data-testid="select-payment-terms-po">
                      <SelectValue placeholder="Select Payment Terms" />
                    </SelectTrigger>
                    <SelectContent>
                      {poPaymentTermsOptions.map((pt) => (
                        <SelectItem key={pt.id} value={String(pt.id)}>
                          {pt.terms_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 mt-6">
                    <Checkbox
                      id="po-advance-flag-contract"
                      checked={poAdvanceFlag}
                      onCheckedChange={(checked) => {
                        setPoAdvanceFlag(!!checked);
                        if (!checked) setPoAdvancePercentage("");
                      }}
                      data-testid="checkbox-advance-flag-po"
                    />
                    <Label htmlFor="po-advance-flag-contract" className="cursor-pointer">
                      Advance Payment %
                    </Label>
                  </div>
                  {poAdvanceFlag && (
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="e.g. 10"
                      value={poAdvancePercentage}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "") {
                          setPoAdvancePercentage(value);
                          return;
                        }
                        if (!/^\d*\.?\d*$/.test(value)) return;
                        const num = Number(value);
                        if (num < 0 || num > 100) return;
                        setPoAdvancePercentage(value);
                      }}
                      inputMode="decimal"
                      data-testid="input-advance-percentage-po"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-po-from-contract">
                Cancel
              </Button>
              <Button
                onClick={handleCreatePOFromContract}
                disabled={createPOFromContractMutation.isPending || !selectedPOVendorId}
                data-testid="button-create-po-from-contract-submit"
              >
                {createPOFromContractMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Create PO
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
