/**
 * Budget amount semantics:
 * - total (budget_amount / line amount): fixed allocation, set at budget approval
 * - reserved_amount: committed by approved PR (pre-tax line amount) and PO (line cost + tax)
 * - consumed_amount: paid / invoiced spend
 * - available = total - reserved - consumed
 */

/** PO line total used for budget reservation (line cost + tax). */
export function poLineBudgetTotal(line: {
  line_cost?: string | number | null;
  tax_amount?: string | number | null;
}): number {
  const lineCost = parseFloat(String(line.line_cost ?? 0)) || 0;
  const taxAmount = parseFloat(String(line.tax_amount ?? 0)) || 0;
  return lineCost + taxAmount;
}

export function sumPoLinesBudgetTotal(
  poLines: Array<{ line_cost?: string | number | null; tax_amount?: string | number | null }>,
): number {
  return (poLines || []).reduce((sum, line) => sum + poLineBudgetTotal(line), 0);
}

export function prLinePreTaxAmount(line: { amount?: string | number | null }): number {
  return parseFloat(String(line.amount ?? 0)) || 0;
}

export function prLineStoredTax(line: {
  recoverable_tax?: string | number | null;
  non_recoverable_tax?: string | number | null;
}): number {
  return (
    (parseFloat(String(line.recoverable_tax ?? 0)) || 0) +
    (parseFloat(String(line.non_recoverable_tax ?? 0)) || 0)
  );
}

/** PR line total for budget reservation when item tax rate is known. */
export function prLineBudgetTotalWithTaxRate(
  line: {
    amount?: string | number | null;
    recoverable_tax?: string | number | null;
    non_recoverable_tax?: string | number | null;
  },
  taxRatePercent: number,
): number {
  const preTax = prLinePreTaxAmount(line);
  const storedTax = prLineStoredTax(line);
  if (storedTax > 0.01) {
    return preTax + storedTax;
  }
  if (taxRatePercent > 0) {
    return preTax * (1 + taxRatePercent / 100);
  }
  return preTax;
}

export function sumPrLinePreTaxAmounts(
  prLines: Array<{ amount?: string | number | null }>,
): number {
  return (prLines || []).reduce((sum, line) => sum + prLinePreTaxAmount(line), 0);
}

/** Scale a pre-tax header total to tax-inclusive using current line effective tax rate. */
export function estimateTaxInclusiveFromPreTaxTotal(
  preTaxTotal: number,
  linePreTaxSum: number,
  lineTaxInclusiveSum: number,
): number {
  if (preTaxTotal <= 0) return 0;
  if (linePreTaxSum <= 0.01) {
    return preTaxTotal;
  }
  const effectiveMultiplier = lineTaxInclusiveSum / linePreTaxSum;
  return preTaxTotal * effectiveMultiplier;
}

export function computeAvailableBudget(
  total: number,
  consumed: number,
  reserved: number
): number {
  return Math.max(0, total - consumed - reserved);
}

export function parseBudgetAmountFields(row: {
  amount?: string | number | null;
  budget_amount?: string | number | null;
  consumed_amount?: string | number | null;
  reserved_amount?: string | number | null;
}): {
  total: number;
  consumed: number;
  reserved: number;
  available: number;
} {
  const total =
    parseFloat(String(row.amount ?? row.budget_amount ?? 0)) || 0;
  const consumed = parseFloat(String(row.consumed_amount ?? 0)) || 0;
  const reserved = parseFloat(String(row.reserved_amount ?? 0)) || 0;
  return {
    total,
    consumed,
    reserved,
    available: computeAvailableBudget(total, consumed, reserved),
  };
}
