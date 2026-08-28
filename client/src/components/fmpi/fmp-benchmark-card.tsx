import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/common-functions";
import { Gauge, TrendingDown, TrendingUp, Minus, Check, Wand2, Info, ChevronDown, ChevronRight, AlertTriangle, MapPin, Calculator } from "lucide-react";
import { useState } from "react";

import { type FmpSnapshot } from "@shared/schema";

export type { FmpSnapshot };

const SOURCE_LABELS: Record<string, string> = {
  approved_po: "Approved POs",
  org_history: "Org Purchase History",
  supplier_quotation: "Supplier Quotations",
  market_trend: "Market Trend",
  exportersindia: "ExportersIndia (live)",
  "made-in-china": "Made-in-China (live)",
  tradeindia: "TradeIndia (live)",
  regional_market: "Regional Market",
  ai_estimate: "AI Estimate (no live listings)",
};

const CONFIDENCE_TIER_CLASSES = {
  high: "border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20",
  medium: "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20",
  low: "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20",
} as const;

const CONFIDENCE_BADGE_CLASSES = {
  high: "bg-green-600 text-white border-green-600 dark:bg-green-700",
  medium: "bg-amber-500 text-white border-amber-500 dark:bg-amber-600",
  low: "bg-red-600 text-white border-red-600 dark:bg-red-700",
} as const;

export function FmpBenchmarkCard({
  snapshot,
  enteredPrice,
  currency,
  onUseFairPrice,
}: {
  snapshot: FmpSnapshot | undefined;
  enteredPrice: number | null;
  currency: string;
  /** When supplied, renders a "Use" button that applies the fair market price. */
  onUseFairPrice?: (price: number) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);

  if (!snapshot) return null;

  if (snapshot.sourcesUsedCount === 0 || snapshot.fairMarketPrice == null) {
    return (
      <Card className="border" data-testid="card-fmp-benchmark">
        <CardContent className="py-3 px-4 text-sm text-muted-foreground">
          Fair Market Price: insufficient data for this item yet.
        </CardContent>
      </Card>
    );
  }

  // Color scale: Below 40% Red | 41-75% Yellow | Above 75% Green
  const confidence = snapshot.confidenceScore ?? 0;
  const tier = confidence > 75 ? "high" : confidence >= 41 ? "medium" : "low";

  const suggestedPrice = Math.round(snapshot.fairMarketPrice * 100) / 100;
  const isApplied = enteredPrice != null && Math.abs(enteredPrice - suggestedPrice) < 0.005;

  const rangeStatus =
    enteredPrice == null || snapshot.rangeMin == null || snapshot.rangeMax == null
      ? null
      : enteredPrice < snapshot.rangeMin
        ? "below"
        : enteredPrice > snapshot.rangeMax
          ? "above"
          : "within";

  const rangeStatusLabel = {
    below: "Below Market Range",
    above: "Above Market Range",
    within: "Within Market Range",
  } as const;

  const rangeStatusClasses = {
    below: "text-green-700 border-green-300 dark:text-green-400 dark:border-green-800",
    above: "text-red-700 border-red-300 dark:text-red-400 dark:border-red-800",
    within: "text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-800",
  } as const;

  const referenceRows: { label: string; value: string }[] = [
    snapshot.lastPurchasePrice != null && {
      label: "Last Purchase",
      value: formatCurrency(snapshot.lastPurchasePrice, currency),
    },
    snapshot.avgOrgPurchasePrice != null && {
      label: "Avg Org Purchase",
      value: formatCurrency(snapshot.avgOrgPurchasePrice, currency),
    },
  ].filter((row): row is { label: string; value: string } => row !== false);

  const quantity = snapshot.quantity && snapshot.quantity > 0 ? snapshot.quantity : 1;
  const totalFairPrice =
    snapshot.totalFairMarketPrice != null
      ? Number(snapshot.totalFairMarketPrice)
      : snapshot.fairMarketPrice != null
        ? snapshot.fairMarketPrice * quantity
        : null;

  return (
    <Card className={`border ${CONFIDENCE_TIER_CLASSES[tier]}`} data-testid="card-fmp-benchmark">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
          Fair Market Price Intelligence
          <Badge className={`text-xs ${CONFIDENCE_BADGE_CLASSES[tier]}`}>
            Confidence {snapshot.confidenceScore}%
          </Badge>
          {snapshot.deliveryLocation && (
            <Badge variant="outline" className="text-xs border-indigo-300 bg-indigo-50/50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-300 flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Location: {snapshot.deliveryLocation}
            </Badge>
          )}
          {rangeStatus && (
            <Badge variant="outline" className={`text-xs ${rangeStatusClasses[rangeStatus]}`}>
              {rangeStatusLabel[rangeStatus]}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-lg font-semibold">{formatCurrency(snapshot.fairMarketPrice, currency)} <span className="text-xs font-normal text-muted-foreground">/ unit</span></span>
          {snapshot.rangeMin != null && snapshot.rangeMax != null && (
            <span className="text-xs text-muted-foreground">
              Range: {formatCurrency(snapshot.rangeMin, currency)} – {formatCurrency(snapshot.rangeMax, currency)}
            </span>
          )}
          {snapshot.priceTrendDirection && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {snapshot.priceTrendDirection === "Rising" && <TrendingUp className="h-3 w-3 text-red-500" />}
              {snapshot.priceTrendDirection === "Falling" && <TrendingDown className="h-3 w-3 text-green-500" />}
              {snapshot.priceTrendDirection === "Stable" && <Minus className="h-3 w-3" />}
              {snapshot.priceTrendDirection}
              {snapshot.priceTrendMagnitudePct != null && ` (${snapshot.priceTrendMagnitudePct > 0 ? "+" : ""}${snapshot.priceTrendMagnitudePct}%)`}
            </span>
          )}

          {onUseFairPrice && quantity <= 1 && (
            <Button
              type="button"
              size="sm"
              variant={isApplied ? "ghost" : "outline"}
              className="ml-auto h-7 px-2 text-xs"
              disabled={isApplied}
              onClick={() => onUseFairPrice(suggestedPrice)}
              title={
                isApplied
                  ? "Unit price already matches the fair market price"
                  : `Set unit price to ${formatCurrency(suggestedPrice, currency)}`
              }
              data-testid="button-use-fair-market-price"
            >
              {isApplied ? (
                <>
                  <Check className="h-3 w-3 mr-1 text-green-600" aria-hidden="true" />
                  Applied
                </>
              ) : (
                <>
                  <Wand2 className="h-3 w-3 mr-1" aria-hidden="true" />
                  Use this price
                </>
              )}
            </Button>
          )}
        </div>

        {totalFairPrice != null && quantity > 1 && (
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-background/90 p-2 rounded border border-border/60 shadow-xs flex-nowrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <Calculator className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
              <span className="truncate">
                Total Fair Market Value ({quantity} units × {formatCurrency(snapshot.fairMarketPrice, currency)}):{" "}
                <strong className="text-xs font-bold text-foreground">{formatCurrency(totalFairPrice, currency)}</strong>
              </span>
            </div>
            {onUseFairPrice && (
              <Button
                type="button"
                size="sm"
                variant={isApplied ? "ghost" : "outline"}
                className="ml-auto h-6 px-2 text-[11px] font-medium shrink-0"
                disabled={isApplied}
                onClick={() => onUseFairPrice(suggestedPrice)}
                title={
                  isApplied
                    ? "Unit price already matches the fair market price"
                    : `Set unit price to ${formatCurrency(suggestedPrice, currency)}`
                }
                data-testid="button-use-total-fair-market-price"
              >
                {isApplied ? (
                  <>
                    <Check className="h-3 w-3 mr-1 text-green-600" aria-hidden="true" />
                    Applied
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3 w-3 mr-1" aria-hidden="true" />
                    Use this price
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {referenceRows.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {referenceRows.map((row) => (
              <div key={row.label}>
                <span className="font-medium">{row.label}: </span>
                {row.value}
              </div>
            ))}
          </div>
        )}

        {snapshot.reasoning && (
          <div className="border-t pt-2">
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              aria-expanded={showWhy}
              data-testid="button-fmp-why"
            >
              {showWhy ? (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
              Why this price?
            </button>
            {showWhy && (
              <ul className="mt-1.5 space-y-1 pl-4" data-testid="text-fmp-reasoning">
                {snapshot.reasoning
                  .split("\n")
                  .filter(Boolean)
                  .map((line, i) => {
                    const cleanLine = line.replace(/^[•\-\*\s]+/, "").trim();
                    if (!cleanLine) return null;
                    return (
                      <li key={i} className="list-disc text-xs text-muted-foreground">
                        {cleanLine}
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        )}

        <div className="border-t pt-2 mt-2 flex justify-end items-center">
          <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 italic flex items-center gap-1.5 text-right font-medium">
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" aria-hidden="true" />
            <span>AI can make mistakes this is only a suggestion. Please verify before you proceed.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
