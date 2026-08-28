import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Pencil, Plus } from "lucide-react";
import type { CreateBidPreviewLineItem } from "@shared/agent-sourcing-preview";
import { Button } from "@/components/ui/button";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface BidLineItemFormValues {
  lineType: string;
  description: string;
  uom: string;
  quantity: string;
  unitPrice: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  categoryCode: string;
  categoryName: string;
  needByFrom: string;
  needByTo: string;
}

export function emptyBidLineItemForm(): BidLineItemFormValues {
  return {
    lineType: "Goods",
    description: "",
    uom: "EA",
    quantity: "1",
    unitPrice: "0",
    itemId: "",
    itemName: "",
    itemCode: "",
    categoryCode: "",
    categoryName: "",
    needByFrom: "",
    needByTo: "",
  };
}

export function previewLineToFormValues(line: CreateBidPreviewLineItem): BidLineItemFormValues {
  return {
    lineType: line.lineType || "Goods",
    description: line.description || "",
    uom: line.uom || "EA",
    quantity: String(line.quantity ?? 1),
    unitPrice: String(line.unitPrice ?? 0),
    itemId: line.itemId != null ? String(line.itemId) : "",
    itemName: line.itemName || "",
    itemCode: line.itemCode || "",
    categoryCode: line.categoryCode != null ? String(line.categoryCode) : "",
    categoryName: line.categoryName || "",
    needByFrom: line.needByFrom || "",
    needByTo: line.needByTo || "",
  };
}

export function formValuesToPreviewLine(values: BidLineItemFormValues): CreateBidPreviewLineItem {
  return {
    description: values.description.trim(),
    quantity: parseInt(values.quantity, 10) || 1,
    unitPrice: parseFloat(values.unitPrice) || 0,
    uom: values.uom || "EA",
    lineType: values.lineType,
    itemId: values.itemId || undefined,
    itemName: values.itemName || undefined,
    itemCode: values.itemCode || undefined,
    categoryCode: values.categoryCode || undefined,
    categoryName: values.categoryName || undefined,
    needByFrom: values.needByFrom || undefined,
    needByTo: values.needByTo || undefined,
  };
}

export function formatPreviewLineLabel(line: CreateBidPreviewLineItem): string {
  if (line.itemCode && line.description) return `${line.itemCode} - ${line.description}`;
  if (line.itemName) return line.itemName;
  return line.description;
}

function sanitizeDecimalInput(value: string) {
  return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

function preventInvalidNumberKey(e: React.KeyboardEvent<HTMLInputElement>) {
  if (["e", "E", "-", "+"].includes(e.key)) e.preventDefault();
}

export function BidLineItemSheet({
  open,
  onOpenChange,
  onSubmit,
  currency = "USD",
  editingLine,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (line: CreateBidPreviewLineItem) => void | Promise<void>;
  currency?: string;
  editingLine?: CreateBidPreviewLineItem | null;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<BidLineItemFormValues>(emptyBidLineItemForm());
  const [itemOpen, setItemOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: itemsData = [] } = useQuery<
    {
      id: string;
      itemCode: string;
      name: string;
      categoryCode: string;
      categoryName: string;
      unitOfMeasure: string;
      standardPrice: number | null;
    }[]
  >({
    queryKey: ["/api/items"],
    enabled: open,
  });

  const { data: uomData = [] } = useQuery<{ id: number; description: string }[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(editingLine ? previewLineToFormValues(editingLine) : emptyBidLineItemForm());
    setItemOpen(false);
    setSubmitting(false);
  }, [open, editingLine]);

  const handleSubmit = async () => {
    if (!form.description.trim()) {
      toast({
        title: "Required",
        description: "Please select an item.",
        variant: "destructive",
      });
      return;
    }
    const line: CreateBidPreviewLineItem = {
      ...formValuesToPreviewLine(form),
      lineId: editingLine?.lineId,
    };
    setSubmitting(true);
    try {
      await onSubmit(line);
      onOpenChange(false);
    } catch {
      // Parent surfaces the error toast; keep the sheet open for retry.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {editingLine ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {editingLine ? "Edit Line Item" : "Add Line Item"}
          </SheetTitle>
          <SheetDescription>
            {editingLine ? "Update the line item details." : "Add a new line item to this bid."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-2 pb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="agent-line-item">Item</Label>
              <Popover open={itemOpen} onOpenChange={setItemOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={itemOpen}
                    className="w-full justify-between font-normal"
                    disabled={disabled}
                    data-testid="select-agent-line-item"
                  >
                    {form.itemId ? `${form.itemCode} - ${form.itemName}` : "Select Item..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search item..." />
                    <CommandList>
                      <CommandEmpty>No item found.</CommandEmpty>
                      <CommandGroup>
                        {itemsData.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={item.name}
                            onSelect={() => {
                              setForm((prev) => ({
                                ...prev,
                                itemId: item.id,
                                itemName: item.name,
                                itemCode: item.itemCode || "",
                                description: item.name,
                                categoryCode: item.categoryCode || "",
                                categoryName: item.categoryName || "",
                                uom: item.unitOfMeasure || "EA",
                                unitPrice: item.standardPrice ? String(item.standardPrice) : "0",
                              }));
                              setItemOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                form.itemId === item.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {item.itemCode} - {item.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {form.itemId ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Category: {form.categoryName || "N/A"}
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="agent-line-linetype">Line Type</Label>
              <Select
                value={form.lineType}
                onValueChange={(value) => setForm((prev) => ({ ...prev, lineType: value }))}
                disabled={disabled}
              >
                <SelectTrigger id="agent-line-linetype" data-testid="select-agent-linetype">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Goods">Goods</SelectItem>
                  <SelectItem value="Service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="agent-line-quantity">Quantity</Label>
              <Input
                id="agent-line-quantity"
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                disabled={disabled}
                data-testid="input-agent-line-quantity"
              />
            </div>

            <div>
              <Label htmlFor="agent-line-uom">Unit of Measure</Label>
              <Select
                value={form.uom}
                onValueChange={(value) => setForm((prev) => ({ ...prev, uom: value }))}
                disabled={disabled}
              >
                <SelectTrigger id="agent-line-uom" data-testid="select-agent-line-uom">
                  <SelectValue placeholder="Select UoM" />
                </SelectTrigger>
                <SelectContent>
                  {uomData.length > 0 ? (
                    uomData.map((uom) => (
                      <SelectItem key={uom.id} value={uom.description || "EA"}>
                        {uom.description}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="EA">Each</SelectItem>
                      <SelectItem value="KG">Kilogram</SelectItem>
                      <SelectItem value="LTR">Litre</SelectItem>
                      <SelectItem value="MTR">Metre</SelectItem>
                      <SelectItem value="PCS">Pieces</SelectItem>
                      <SelectItem value="SET">Set</SelectItem>
                      <SelectItem value="BOX">Box</SelectItem>
                      <SelectItem value="TON">Ton</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="agent-line-price">Unit Price ({currency})</Label>
              <Input
                id="agent-line-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                inputMode="decimal"
                value={form.unitPrice}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    unitPrice: sanitizeDecimalInput(e.target.value),
                  }))
                }
                onKeyDown={preventInvalidNumberKey}
                disabled={disabled}
                data-testid="input-agent-line-price"
              />
            </div>

            <div>
              <Label htmlFor="agent-line-needbyfrom">Required From</Label>
              <Input
                id="agent-line-needbyfrom"
                type="date"
                value={form.needByFrom}
                onChange={(e) => setForm((prev) => ({ ...prev, needByFrom: e.target.value }))}
                disabled={disabled}
                data-testid="input-agent-line-needbyfrom"
              />
            </div>

            <div>
              <Label htmlFor="agent-line-needbyto">Required By</Label>
              <Input
                id="agent-line-needbyto"
                type="date"
                value={form.needByTo}
                onChange={(e) => setForm((prev) => ({ ...prev, needByTo: e.target.value }))}
                disabled={disabled}
                data-testid="input-agent-line-needbyto"
              />
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={disabled || submitting}
            data-testid="button-cancel-agent-line"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={disabled || submitting || !form.description.trim()}
            data-testid="button-submit-agent-line"
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {editingLine ? "Update Line" : "Add Line"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
