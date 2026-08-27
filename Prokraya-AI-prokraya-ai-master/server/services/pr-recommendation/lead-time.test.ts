import { describe, expect, it } from "vitest";
import { addDays, averageLeadTime, leadTimeDays, toIsoDate } from "./lead-time";
import type { PoHistoryRow } from "./ports";

function po(poNumber: string, created: string, required: string): PoHistoryRow {
  return {
    poNumber,
    createdDate: new Date(created),
    requiredDate: new Date(required),
    orgId: 1,
    departmentName: "IT Department",
    buyerId: 1,
    buyerName: "Buyer One",
    deliveryLocationId: "1",
    deliveryLocationName: "Head Quarters Dubai",
  };
}

describe("leadTimeDays", () => {
  it("counts whole days between creation and required date", () => {
    expect(leadTimeDays(po("P1", "2026-01-01", "2026-01-15"))).toBe(14);
  });

  it("returns a negative value for a backdated PO", () => {
    expect(leadTimeDays(po("P1", "2026-01-15", "2026-01-11"))).toBe(-4);
  });
});

describe("averageLeadTime", () => {
  it("averages the spec's worked example", () => {
    const result = averageLeadTime([
      po("PO1", "2026-01-01", "2026-01-15"),
      po("PO2", "2026-02-05", "2026-02-20"),
      po("PO3", "2026-03-10", "2026-03-26"),
    ]);
    expect(result).not.toBeNull();
    expect(result!.sampleSize).toBe(3);
    expect(result!.averageDays).toBe(15);
  });

  it("discards backdated purchase orders", () => {
    const result = averageLeadTime([
      po("PO1", "2026-01-01", "2026-01-11"),
      po("PO2", "2026-01-15", "2026-01-11"),
    ]);
    expect(result!.sampleSize).toBe(1);
    expect(result!.averageDays).toBe(10);
  });

  it("discards implausibly long lead times", () => {
    const result = averageLeadTime([
      po("PO1", "2026-01-01", "2026-01-11"),
      po("PO2", "2020-01-01", "2026-01-01"),
    ]);
    expect(result!.sampleSize).toBe(1);
  });

  it("counts a purchase order once even when it matched several lines", () => {
    const result = averageLeadTime([
      po("PO1", "2026-01-01", "2026-01-11"),
      po("PO1", "2026-01-01", "2026-01-11"),
    ]);
    expect(result!.sampleSize).toBe(1);
  });

  it("returns null when no rows survive filtering", () => {
    expect(averageLeadTime([po("PO1", "2026-01-15", "2026-01-11")])).toBeNull();
  });

  it("returns null for an empty history", () => {
    expect(averageLeadTime([])).toBeNull();
  });

  it("accepts a single purchase order by default", () => {
    expect(averageLeadTime([po("PO1", "2026-01-01", "2026-01-11")])!.sampleSize).toBe(1);
  });

  it("honours a stricter minimum sample", () => {
    expect(averageLeadTime([po("PO1", "2026-01-01", "2026-01-11")], { minSample: 2 })).toBeNull();
  });

  it("rounds a fractional average up", () => {
    const result = averageLeadTime([
      po("PO1", "2026-01-01", "2026-01-11"),
      po("PO2", "2026-01-01", "2026-01-12"),
    ]);
    expect(result!.averageDays).toBe(11);
  });
});

describe("date helpers", () => {
  it("adds days without mutating the input", () => {
    const base = new Date("2026-08-08T12:00:00");
    const result = addDays(base, 11);
    expect(toIsoDate(result)).toBe("2026-08-19");
    expect(base.getDate()).toBe(8);
  });

  it("rolls over month boundaries", () => {
    expect(toIsoDate(addDays(new Date("2026-01-25T00:00:00"), 10))).toBe("2026-02-04");
  });

  it("formats single-digit months and days with padding", () => {
    expect(toIsoDate(new Date("2026-03-05T00:00:00"))).toBe("2026-03-05");
  });
});
