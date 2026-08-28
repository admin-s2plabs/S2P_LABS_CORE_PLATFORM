import { useState } from "react";
import { Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import type {
  PoRecommendationOverrides,
  PoRecommendationSpec,
  PoRecommendedValue,
} from "@shared/agent-po-recommendation";
import { PO_RECOMMENDATION_DEPENDENTS, poFieldLabel } from "@shared/agent-po-recommendation";
import type { PrRecommendedValue } from "@shared/agent-pr-recommendation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { buildPoCreatePayload, isWeakPoSource, poSourceLabel } from "./po-recommendation-utils";
import { ItemMasterPicker, useMasterItems } from "./item-master-picker";
import {
  applyLineItemPatch,
  applyMasterItemSelection,
  deriveLineState,
  type LineItemPatch,
  type MasterItem,
} from "./recommendation-line-items";

const CHOICE_FIELDS: Record<
  NonNullable<PoRecommendationSpec["pendingChoice"]>["field"],
  { key: keyof PoRecommendationOverrides; toValue: (option: { id: string; label: string }) => unknown }
> = {
  budget: { key: "budgetLineId", toValue: (option) => Number(option.id) },
  department: { key: "departmentName", toValue: (option) => option.label },
  deliveryLocation: { key: "deliveryLocationId", toValue: (option) => option.id },
  needByDate: { key: "needByDate", toValue: (option) => option.id },
  vendor: { key: "supplierId", toValue: (option) => Number(option.id) },
  paymentTerms: { key: "paymentTermsId", toValue: (option) => option.id },
};

interface PoRecommendationCardProps {
  spec: PoRecommendationSpec;
  status?: "pending" | "created" | "cancelled";
  onSpecChange: (next: PoRecommendationSpec) => void;
  onConfirm: (payload: ReturnType<typeof buildPoCreatePayload>) => void;
  onCancel: () => void;
}

function formatMoney(amount: number, currency: string | null): string {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `${currency ? `${currency} ` : ""}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function FieldRow({
  label,
  field,
  children,
}: {
  label: string;
  field: PoRecommendedValue<unknown> | PrRecommendedValue<unknown>;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start py-2 border-b border-border/50 last:border-0">
      <div className="pt-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <Badge
          variant={isWeakPoSource(field.source) ? "outline" : "secondary"}
          className="mt-1 text-[10px] font-normal"
        >
          {poSourceLabel(field.source)}
          {field.sampleSize ? ` · ${field.sampleSize}` : ""}
        </Badge>
      </div>
      <div>
        {children}
        <p className="text-[11px] text-muted-foreground mt-1">{field.rationale}</p>
      </div>
    </div>
  );
}

export function PoRecommendationCard({
  spec,
  status = "pending",
  onSpecChange,
  onConfirm,
  onCancel,
}: PoRecommendationCardProps) {
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<PoRecommendationOverrides>({});
  const [recalculating, setRecalculating] = useState(false);
  const settled = status === "created" || status === "cancelled";

  const { data: masterItems = [] } = useMasterItems();

  /** Header fields the PO needs that are not expressible as unresolved keys. */
  const headerReady =
    !!spec.vendor.value && !!spec.paymentTerms.value && !!spec.needByDate.value;

  const applyOverride = async (field: keyof PoRecommendationOverrides, value: unknown) => {
    const next: PoRecommendationOverrides = { ...overrides, [field]: value } as PoRecommendationOverrides;
    for (const dependent of PO_RECOMMENDATION_DEPENDENTS[field]) {
      delete next[dependent];
    }
    setOverrides(next);
    setRecalculating(true);
    try {
      const res = await apiRequest("POST", "/api/procurement-agent/po-recommendation", {
        request: spec.request,
        overrides: next,
      });
      onSpecChange(await parseJsonResponse<PoRecommendationSpec>(res));
    } catch (error: any) {
      toast({
        title: "Could not update the recommendation",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRecalculating(false);
    }
  };

  const commitLineItems = (lineItems: typeof spec.lineItems) => {
    onSpecChange({
      ...spec,
      lineItems,
      ...deriveLineState(spec, lineItems, headerReady),
    });
  };

  const updateLineItem = (index: number, patch: LineItemPatch) => {
    commitLineItems(applyLineItemPatch(spec.lineItems, index, patch));
  };

  const selectMasterItem = (index: number, master: MasterItem) => {
    commitLineItems(applyMasterItemSelection(spec.lineItems, index, master));
  };

  const disabled = settled || recalculating;
  const { unresolved: stillNeeded, canCreate } = deriveLineState(
    spec,
    spec.lineItems,
    headerReady,
  );

  return (
    <Card className="mt-3 border-primary/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Recommended Purchase Order</h3>
          </div>
          {recalculating && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Recalculating
            </span>
          )}
        </div>

        {spec.pendingChoice && !settled && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
            <p className="text-sm font-medium mb-2">{spec.pendingChoice.prompt}</p>
            <div className="flex flex-wrap gap-2">
              {spec.pendingChoice.options.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => {
                    const choice = CHOICE_FIELDS[spec.pendingChoice!.field];
                    applyOverride(choice.key, choice.toValue(option));
                  }}
                >
                  {option.label}
                  {option.detail ? (
                    <span className="ml-1.5 text-muted-foreground">{option.detail}</span>
                  ) : null}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-0">
          <FieldRow label="Budget" field={spec.budget}>
            <Select
              disabled={disabled || !spec.budget.options?.length}
              value={spec.budget.value ? String(spec.budget.value.budgetLineId) : undefined}
              onValueChange={(value) => applyOverride("budgetLineId", Number(value))}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select a budget" />
              </SelectTrigger>
              <SelectContent>
                {(spec.budget.options ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Business Entity" field={spec.businessEntity}>
            <Input className="h-8" value={spec.businessEntity.value?.label ?? ""} readOnly disabled />
          </FieldRow>

          <FieldRow label="Department" field={spec.department}>
            <Select
              disabled={disabled || !spec.department.options?.length}
              value={spec.department.value?.id}
              onValueChange={(value) => {
                const option = spec.department.options?.find((entry) => entry.id === value);
                applyOverride("departmentName", option?.label ?? value);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select a department" />
              </SelectTrigger>
              <SelectContent>
                {(spec.department.options ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Delivery Location" field={spec.deliveryLocation}>
            <Select
              disabled={disabled || !spec.deliveryLocation.options?.length}
              value={spec.deliveryLocation.value?.id}
              onValueChange={(value) => applyOverride("deliveryLocationId", value)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {(spec.deliveryLocation.options ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Currency" field={spec.currency}>
            <Input
              className="h-8 w-28"
              disabled={disabled}
              value={spec.currency.value ?? ""}
              onChange={(event) =>
                onSpecChange({
                  ...spec,
                  currency: { ...spec.currency, value: event.target.value, source: "override" },
                })
              }
              onBlur={(event) => {
                if (event.target.value && event.target.value !== overrides.currency) {
                  applyOverride("currency", event.target.value);
                }
              }}
            />
          </FieldRow>

          <FieldRow label="Need By Date" field={spec.needByDate}>
            <Input
              type="date"
              className="h-8 w-44"
              disabled={disabled}
              value={spec.needByDate.value ?? ""}
              onChange={(event) => applyOverride("needByDate", event.target.value)}
            />
          </FieldRow>

          <FieldRow label="Vendor" field={spec.vendor}>
            <Select
              disabled={disabled || !spec.vendor.options?.length}
              value={spec.vendor.value?.id}
              onValueChange={(value) => applyOverride("supplierId", Number(value))}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select a vendor" />
              </SelectTrigger>
              <SelectContent>
                {(spec.vendor.options ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Payment Terms" field={spec.paymentTerms}>
            <Select
              disabled={disabled || !spec.paymentTerms.options?.length}
              value={spec.paymentTerms.value?.id}
              onValueChange={(value) => applyOverride("paymentTermsId", value)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select payment terms" />
              </SelectTrigger>
              <SelectContent>
                {(spec.paymentTerms.options ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Requestor" field={spec.requestor}>
            <Input className="h-8" value={spec.requestor.value?.label ?? ""} readOnly disabled />
          </FieldRow>
        </div>

        {spec.lineItems.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Line Items</p>
            <div className="grid grid-cols-[80px_1fr_90px_110px_110px] gap-2 text-[11px] uppercase tracking-wide text-muted-foreground pb-1 border-b border-border/50">
              <span>Qty</span>
              <span>Item</span>
              <span>UoM</span>
              <span className="text-right">Unit Price</span>
              <span className="text-right">Amount</span>
            </div>
            {spec.lineItems.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[80px_1fr_90px_110px_110px] gap-2 items-center py-1.5 border-b border-border/50 last:border-0 text-sm"
              >
                <Input
                  type="number"
                  min={1}
                  className="h-8"
                  disabled={settled}
                  placeholder="Qty"
                  value={item.quantity ?? ""}
                  onChange={(event) => updateLineItem(index, { quantity: event.target.value })}
                />
                <div>
                  <ItemMasterPicker
                    item={item}
                    masterItems={masterItems}
                    disabled={settled}
                    onSelect={(master) => selectMasterItem(index, master)}
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    {item.categoryName && (
                      <span className="text-[11px] text-muted-foreground">{item.categoryName}</span>
                    )}
                    {item.quantityPredicted && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        predicted qty
                      </Badge>
                    )}
                    {item.priceAssumed && item.estimatedPrice > 0 && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        estimated price
                      </Badge>
                    )}
                  </div>
                </div>
                <Input
                  className="h-8"
                  disabled={settled}
                  placeholder="UoM"
                  value={item.unitOfMeasure}
                  onChange={(event) => updateLineItem(index, { unitOfMeasure: event.target.value })}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-8 text-right"
                  disabled={settled}
                  placeholder="0.00"
                  value={item.estimatedPrice || ""}
                  onChange={(event) => updateLineItem(index, { estimatedPrice: event.target.value })}
                />
                <span className="text-right font-medium">
                  {item.quantity == null
                    ? "—"
                    : formatMoney(item.quantity * item.estimatedPrice, spec.currency.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {status === "created" && (
          <p className="mt-3 text-sm text-green-600 flex items-center gap-1.5">
            <Check className="h-4 w-4" /> Purchase order created
          </p>
        )}
        {status === "cancelled" && (
          <p className="mt-3 text-sm text-muted-foreground flex items-center gap-1.5">
            <X className="h-4 w-4" /> Cancelled
          </p>
        )}

        {!settled && (
          <div className="flex items-center gap-2 mt-4">
            <Button
              size="sm"
              disabled={disabled || !canCreate}
              onClick={() => onConfirm(buildPoCreatePayload(spec))}
            >
              <Check className="h-4 w-4 mr-1.5" />
              Create Purchase Order
            </Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
              Cancel
            </Button>
            {!canCreate && stillNeeded.length > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Pencil className="h-3 w-3" />
                Still needed: {stillNeeded.map(poFieldLabel).join(", ")}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
