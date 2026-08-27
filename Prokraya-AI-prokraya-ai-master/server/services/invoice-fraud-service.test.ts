import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  pool: { query: vi.fn() },
}));

vi.mock("../tenant-context", () => ({
  getContextPool: () => null,
}));

vi.mock("./ai-client", () => ({
  getAIClient: vi.fn(),
  getAIModelName: vi.fn(),
}));

import {
  REMOVED_FRAUD_FLAG_TYPES,
  calculateRiskScore,
  checkInvoiceDateAnomalies,
  checkVendorFrequencyAnomaly,
  checkAmountAnomaly,
  checkFirstTimeVendor,
  checkSimilarAmountPattern,
  checkThresholdGaming,
  checkReconciliationFraudSignals,
  type FraudFlag,
} from "./invoice-fraud-service";

function flag(overrides: Partial<FraudFlag> & Pick<FraudFlag, "severity">): FraudFlag {
  return {
    type: overrides.type ?? "test_flag",
    label: overrides.label ?? "Test Flag",
    severity: overrides.severity,
    confidence: overrides.confidence ?? 80,
    description: overrides.description ?? "test",
    details: overrides.details ?? {},
  };
}

describe("calculateRiskScore", () => {
  it("returns 0 / low for a clean invoice with no flags", () => {
    expect(calculateRiskScore([])).toEqual({ score: 0, level: "low" });
  });

  it("adds 30 for high, 15 for medium, 5 for low", () => {
    expect(calculateRiskScore([flag({ severity: "high" })])).toEqual({ score: 30, level: "medium" });
    expect(calculateRiskScore([flag({ severity: "medium" })])).toEqual({ score: 15, level: "low" });
    expect(calculateRiskScore([flag({ severity: "low" })])).toEqual({ score: 5, level: "low" });
  });

  it("classifies 25–49 as medium and ≥50 as high", () => {
    expect(calculateRiskScore([flag({ severity: "medium" }), flag({ severity: "low" }), flag({ severity: "low" })])).toEqual({
      score: 25,
      level: "medium",
    });
    expect(calculateRiskScore([flag({ severity: "high" }), flag({ severity: "high" })])).toEqual({
      score: 60,
      level: "high",
    });
  });

  it("caps the total risk score at 100", () => {
    const manyHigh = Array.from({ length: 5 }, () => flag({ severity: "high" }));
    expect(calculateRiskScore(manyHigh)).toEqual({ score: 100, level: "high" });
  });

  it("does not weight confidence into the score", () => {
    const lowConf = flag({ severity: "high", confidence: 10 });
    const highConf = flag({ severity: "high", confidence: 99 });
    expect(calculateRiskScore([lowConf]).score).toBe(calculateRiskScore([highConf]).score);
  });
});

describe("removed round-number rule", () => {
  it("documents removed flag types so they stay excluded", () => {
    expect(REMOVED_FRAUD_FLAG_TYPES).toEqual(["round_number", "round_number_100"]);
  });

  it("never contributes round-number types to scoring samples", () => {
    const flags = [
      flag({ type: "new_vendor", severity: "low", confidence: 65 }),
      flag({ type: "frequency_spike", severity: "medium", confidence: 70 }),
    ];
    for (const removed of REMOVED_FRAUD_FLAG_TYPES) {
      expect(flags.some((f) => f.type === removed)).toBe(false);
    }
    expect(calculateRiskScore(flags)).toEqual({ score: 20, level: "low" });
  });
});

describe("checkInvoiceDateAnomalies", () => {
  it("returns no flags for a clean invoice with normal dates", async () => {
    const flags = await checkInvoiceDateAnomalies({
      invoice_date: "2026-01-15",
      inv_due_date: "2026-02-15",
    });
    expect(flags).toEqual([]);
  });

  it("flags future-dated invoices with confidence", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const flags = await checkInvoiceDateAnomalies({
      invoice_date: future.toISOString(),
      inv_due_date: null,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("future_date");
    expect(flags[0].severity).toBe("medium");
    expect(flags[0].confidence).toBeGreaterThan(0);
    expect(flags[0].confidence).toBeLessThanOrEqual(100);
    expect(flags[0].details).toBeDefined();
  });

  it("flags rush payment terms", async () => {
    const flags = await checkInvoiceDateAnomalies({
      invoice_date: "2026-03-01",
      inv_due_date: "2026-03-02",
    });
    expect(flags.some((f) => f.type === "rush_payment")).toBe(true);
    const rush = flags.find((f) => f.type === "rush_payment")!;
    expect(rush.confidence).toBeGreaterThan(0);
    expect(rush.details.daysBetween).toBe(1);
  });
});

describe("missing vendor history", () => {
  it("skips vendor-history checks when supplierId is null without throwing", async () => {
    await expect(checkVendorFrequencyAnomaly(null, "2026-01-01", "inv-1")).resolves.toEqual([]);
    await expect(checkAmountAnomaly(6000, null, "inv-1")).resolves.toEqual([]);
    await expect(checkFirstTimeVendor(null, "inv-1")).resolves.toEqual([]);
    await expect(checkSimilarAmountPattern(6000, null, "inv-1")).resolves.toEqual([]);
  });

  it("can still flag near-threshold without vendor history", async () => {
    const flags = await checkThresholdGaming(9800, null);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("near_threshold");
    expect(flags[0].severity).toBe("low");
    expect(flags[0].confidence).toBeGreaterThan(0);
    expect(REMOVED_FRAUD_FLAG_TYPES.includes(flags[0].type as any)).toBe(false);
  });
});

describe("checkReconciliationFraudSignals", () => {
  it("returns empty when invoice has no PO", async () => {
    await expect(checkReconciliationFraudSignals("inv-1", null)).resolves.toEqual([]);
    await expect(checkReconciliationFraudSignals("inv-1", undefined)).resolves.toEqual([]);
  });
});