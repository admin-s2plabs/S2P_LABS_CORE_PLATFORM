/**
 * Derives a need-by date from historical approved purchase orders.
 *
 * Lead time is `po_required_date - creation_date`. Real data contains POs whose
 * required date precedes their creation date (backdated entries), so
 * non-positive and implausibly long spreads are discarded rather than averaged.
 */

import type { PoHistoryRow } from "./ports";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Upper bound for a believable procurement lead time. */
export const MAX_PLAUSIBLE_LEAD_TIME_DAYS = 365;

/** Minimum usable history. One PO is thin but still better than guessing. */
export const MIN_LEAD_TIME_SAMPLE = 1;

export interface LeadTimeAverage {
  averageDays: number;
  sampleSize: number;
  /** Per-PO lead times that survived filtering, for explaining the number. */
  samples: Array<{ poNumber: string; days: number }>;
}

/** Whole days between creation and required date. Negative when backdated. */
export function leadTimeDays(row: Pick<PoHistoryRow, "createdDate" | "requiredDate">): number {
  const created = startOfDay(row.createdDate).getTime();
  const required = startOfDay(row.requiredDate).getTime();
  return Math.round((required - created) / MS_PER_DAY);
}

export function averageLeadTime(
  rows: PoHistoryRow[],
  options: { maxDays?: number; minSample?: number } = {},
): LeadTimeAverage | null {
  const maxDays = options.maxDays ?? MAX_PLAUSIBLE_LEAD_TIME_DAYS;
  const minSample = options.minSample ?? MIN_LEAD_TIME_SAMPLE;

  const samples: Array<{ poNumber: string; days: number }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.createdDate || !row.requiredDate) continue;
    if (seen.has(row.poNumber)) continue;
    const days = leadTimeDays(row);
    if (days <= 0 || days > maxDays) continue;
    seen.add(row.poNumber);
    samples.push({ poNumber: row.poNumber, days });
  }

  if (samples.length < minSample) return null;

  const total = samples.reduce((sum, sample) => sum + sample.days, 0);
  return {
    averageDays: Math.ceil(total / samples.length),
    sampleSize: samples.length,
    samples,
  };
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Formats as YYYY-MM-DD in local time, matching the PR form's date handling. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
