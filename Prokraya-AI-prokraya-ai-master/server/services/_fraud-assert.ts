import {
  REMOVED_FRAUD_FLAG_TYPES,
  calculateRiskScore,
  checkInvoiceDateAnomalies,
  checkVendorFrequencyAnomaly,
  checkAmountAnomaly,
  checkFirstTimeVendor,
  checkSimilarAmountPattern,
  checkThresholdGaming,
  type FraudFlag,
} from "./invoice-fraud-service";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function flag(severity: FraudFlag["severity"], confidence = 80): FraudFlag {
  return { type: "t", label: "t", severity, confidence, description: "", details: {} };
}

assert(JSON.stringify(calculateRiskScore([])) === JSON.stringify({ score: 0, level: "low" }), "empty");
assert(calculateRiskScore([flag("high")]).score === 30, "high=30");
assert(calculateRiskScore([flag("high")]).level === "medium", "30 medium");
assert(calculateRiskScore([flag("high"), flag("high")]).score === 60, "two high");
assert(calculateRiskScore([flag("high"), flag("high")]).level === "high", "60 high");
assert(calculateRiskScore([flag("medium"), flag("low"), flag("low")]).score === 25, "25 boundary");
assert(calculateRiskScore([flag("medium"), flag("low"), flag("low")]).level === "medium", "25 medium");
assert(calculateRiskScore(Array.from({ length: 5 }, () => flag("high"))).score === 100, "cap 100");
assert(calculateRiskScore([flag("high", 10)]).score === calculateRiskScore([flag("high", 99)]).score, "confidence not scored");

assert(REMOVED_FRAUD_FLAG_TYPES.includes("round_number"), "removed round_number");
assert(REMOVED_FRAUD_FLAG_TYPES.includes("round_number_100"), "removed round_number_100");

const clean = await checkInvoiceDateAnomalies({
  invoice_date: "2026-01-15",
  inv_due_date: "2026-02-15",
});
assert(clean.length === 0, "clean invoice");

assert((await checkVendorFrequencyAnomaly(null, "2026-01-01", "inv-1")).length === 0, "null freq");
assert((await checkAmountAnomaly(6000, null, "inv-1")).length === 0, "null amount");
assert((await checkFirstTimeVendor(null, "inv-1")).length === 0, "null first");
assert((await checkSimilarAmountPattern(6000, null, "inv-1")).length === 0, "null similar");

const near = await checkThresholdGaming(9800, null);
assert(near.length === 1, "near threshold count");
assert(near[0].type === "near_threshold", "near threshold type");
assert(near[0].confidence > 0 && near[0].confidence <= 100, "near confidence");
assert(!(REMOVED_FRAUD_FLAG_TYPES as readonly string[]).includes(near[0].type), "not round number");

const future = new Date();
future.setFullYear(future.getFullYear() + 1);
const fut = await checkInvoiceDateAnomalies({
  invoice_date: future.toISOString(),
  inv_due_date: null,
});
assert(fut.length === 1 && fut[0].type === "future_date", "future date");
assert(fut[0].confidence === 95, "future confidence");

const rush = await checkInvoiceDateAnomalies({
  invoice_date: "2026-03-01",
  inv_due_date: "2026-03-02",
});
assert(rush.some((f) => f.type === "rush_payment"), "rush payment");

console.log("All fraud service assertions passed");
