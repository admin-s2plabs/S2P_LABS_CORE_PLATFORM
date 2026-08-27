import { formatCurrency } from "@/lib/common-functions";
import { Sparkles } from "lucide-react";

/**
 * Supplier-facing projection of a published benchmark. Deliberately narrower
 * than `FmpSnapshot`: the buyer's reasoning, source list and sample sizes stay
 * on the buyer side.
 */
export interface SupplierFmpView {
  fairMarketPrice: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  currCode: string | null;
  confidenceScore: number;
}

/**
 * Read-only fair market price shown under a bid line on the supplier's quote
 * sheet. Renders nothing unless the buyer published a benchmark for the line —
 * suppliers get no controls here by design, so a missing snapshot is simply an
 * absent hint rather than an empty placeholder.
 */
export function FmpSupplierHint({
  fmp,
  currency,
  testId,
}: {
  fmp: SupplierFmpView | undefined;
  currency: string;
  testId?: string;
}) {
  if (!fmp || fmp.fairMarketPrice == null) return null;

  const curr = fmp.currCode || currency;

  return (
    <div
      className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-900 border border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/60 text-[11px] whitespace-nowrap"
      data-testid={testId || "text-fmp-supplier-hint"}
    >
      <Sparkles className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" aria-hidden="true" />
      <span className="font-semibold text-purple-800 dark:text-purple-300">Fair Market Price:</span>
      <span className="font-mono font-bold text-purple-950 dark:text-purple-100">
        {formatCurrency(fmp.fairMarketPrice, curr)}
      </span>
    </div>
  );
}
