import { getAIClient, getAIModelName } from "./ai-client";
import { pool } from "../db";
import { getContextPool } from "../tenant-context";
import {
  buildPoReconciliation,
  extractReconciliationFraudSignals,
  loadPoReconciliationInputs,
  loadToleranceConfig,
} from "./invoice-reconciliation";

const getPool = () => getContextPool() ?? pool;

/** Flag types from the removed round-number rule — must never appear in results. */
export const REMOVED_FRAUD_FLAG_TYPES = ["round_number", "round_number_100"] as const;

export interface FraudFlag {
  type: string;
  label: string;
  severity: "high" | "medium" | "low";
  /** Signal strength 0–100; display only — does not affect risk scoring. */
  confidence: number;
  description: string;
  details: Record<string, any>;
}

export interface FraudAnalysisResult {
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  riskScore: number;
  riskLevel: "high" | "medium" | "low";
  flags: FraudFlag[];
  narrative: string;
  analyzedAt: string;
}

async function getInvoiceForFraud(invoiceId: string) {
  const result = await getPool().query(
    `SELECT id, invoice_number, invoice_status, invoice_type, invoice_amount,
            invoice_curr_code, invoice_date, inv_due_date, po_number,
            supplier_id, supplier_name, description, creation_date,
            tax_amount, department_name, cost_center_name, submitted_by
     FROM dbo.supp_invoice_dtls WHERE id = $1`,
    [invoiceId]
  );
  return result.rows[0] || null;
}

export async function checkDuplicateInvoiceNumbers(
  invoiceNumber: string,
  invoiceId: string,
  supplierId: number | null
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];

  const sameNumberResult = await getPool().query(
    `SELECT id, invoice_number, supplier_name, invoice_amount, invoice_date, invoice_status, supplier_id
     FROM dbo.supp_invoice_dtls
     WHERE LOWER(TRIM(invoice_number)) = LOWER(TRIM($1)) AND id != $2
     ORDER BY creation_date DESC
     LIMIT 10`,
    [invoiceNumber, invoiceId]
  );

  if (sameNumberResult.rows.length > 0) {
    const sameVendor = sameNumberResult.rows.filter(
      (r: any) => supplierId && Number(r.supplier_id) === Number(supplierId)
    );
    const diffVendor = sameNumberResult.rows.filter(
      (r: any) => !supplierId || Number(r.supplier_id) !== Number(supplierId)
    );

    if (sameVendor.length > 0) {
      flags.push({
        type: "duplicate_invoice_same_vendor",
        label: "Duplicate Invoice Number (Same Vendor)",
        severity: "high",
        confidence: Math.min(98, 85 + sameVendor.length * 5),
        description: `Invoice number "${invoiceNumber}" has been used ${sameVendor.length} other time(s) by the same vendor. This could indicate a duplicate submission.`,
        details: {
          duplicates: sameVendor.map((d: any) => ({
            id: d.id,
            amount: Number(d.invoice_amount),
            date: d.invoice_date,
            status: d.invoice_status,
          })),
        },
      });
    }

    if (diffVendor.length > 0) {
      flags.push({
        type: "duplicate_invoice_diff_vendor",
        label: "Invoice Number Used by Other Vendor(s)",
        severity: "medium",
        confidence: Math.min(90, 70 + diffVendor.length * 5),
        description: `Invoice number "${invoiceNumber}" is also used by ${diffVendor.length} other vendor(s): ${diffVendor.map((d: any) => d.supplier_name).join(", ")}. This is unusual.`,
        details: {
          otherVendors: diffVendor.map((d: any) => ({
            id: d.id,
            vendor: d.supplier_name,
            amount: Number(d.invoice_amount),
          })),
        },
      });
    }
  }

  return flags;
}

export async function checkVendorFrequencyAnomaly(
  supplierId: number | null,
  invoiceDate: string | Date | null,
  invoiceId: string
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];
  if (!supplierId || !invoiceDate) return flags;

  const invDate = new Date(invoiceDate);
  const thirtyDaysAgo = new Date(invDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentResult = await getPool().query(
    `SELECT COUNT(*) as recent_count,
            COALESCE(SUM(invoice_amount), 0) as recent_total
     FROM dbo.supp_invoice_dtls
     WHERE supplier_id = $1 AND id != $2
       AND invoice_date >= $3 AND invoice_date <= $4`,
    [supplierId, invoiceId, thirtyDaysAgo.toISOString(), invDate.toISOString()]
  );

  const historicalResult = await getPool().query(
    `SELECT COUNT(*) as total_count,
            MIN(invoice_date) as first_invoice,
            MAX(invoice_date) as last_invoice
     FROM dbo.supp_invoice_dtls
     WHERE supplier_id = $1 AND id != $2`,
    [supplierId, invoiceId]
  );

  const recentCount = Number(recentResult.rows[0]?.recent_count) || 0;
  const totalCount = Number(historicalResult.rows[0]?.total_count) || 0;
  const firstDate = historicalResult.rows[0]?.first_invoice;
  const lastDate = historicalResult.rows[0]?.last_invoice;

  if (totalCount > 3 && firstDate && lastDate) {
    const firstD = new Date(firstDate);
    const lastD = new Date(lastDate);
    const totalMonths = Math.max(1, (lastD.getTime() - firstD.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const avgPerMonth = totalCount / totalMonths;

    if (recentCount > 0 && recentCount >= avgPerMonth * 3) {
      const spikeRatio = avgPerMonth > 0 ? recentCount / avgPerMonth : 3;
      flags.push({
        type: "frequency_spike",
        label: "Unusual Invoice Frequency",
        severity: "medium",
        confidence: Math.min(92, Math.round(60 + spikeRatio * 8)),
        description: `${recentCount + 1} invoices in the last 30 days from this vendor, compared to an average of ${avgPerMonth.toFixed(1)} per month historically. This spike may warrant review.`,
        details: {
          recentCount: recentCount + 1,
          avgPerMonth: Math.round(avgPerMonth * 10) / 10,
          totalHistorical: totalCount,
        },
      });
    }
  }

  return flags;
}

export async function checkThresholdGaming(
  invoiceAmount: number,
  supplierId: number | null
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];
  if (!invoiceAmount || invoiceAmount <= 0) return flags;

  const commonThresholds = [5000, 10000, 25000, 50000, 100000, 250000, 500000];

  for (const threshold of commonThresholds) {
    const diff = threshold - invoiceAmount;
    const pctBelow = (diff / threshold) * 100;
    if (diff > 0 && pctBelow <= 5 && pctBelow > 0) {
      if (supplierId) {
        const patternResult = await getPool().query(
          `SELECT COUNT(*) as near_threshold_count
           FROM dbo.supp_invoice_dtls
           WHERE supplier_id = $1 AND invoice_amount > $2 AND invoice_amount < $3`,
          [supplierId, threshold * 0.9, threshold]
        );
        const nearCount = Number(patternResult.rows[0]?.near_threshold_count) || 0;

        if (nearCount >= 2) {
          flags.push({
            type: "threshold_gaming",
            label: "Potential Threshold Gaming",
            severity: "high",
            confidence: Math.min(95, 75 + nearCount * 5),
            description: `Invoice amount (${invoiceAmount.toLocaleString()}) is just ${pctBelow.toFixed(1)}% below the ${threshold.toLocaleString()} threshold. This vendor has ${nearCount} other invoices in the 90-100% range of this threshold — a pattern consistent with deliberate threshold avoidance.`,
            details: {
              amount: invoiceAmount,
              threshold,
              pctBelow: Math.round(pctBelow * 10) / 10,
              vendorNearThresholdCount: nearCount,
            },
          });
          break;
        }
      }

      flags.push({
        type: "near_threshold",
        label: "Near Approval Threshold",
        severity: "low",
        confidence: Math.round(55 + (5 - pctBelow) * 6),
        description: `Invoice amount (${invoiceAmount.toLocaleString()}) is ${pctBelow.toFixed(1)}% below the ${threshold.toLocaleString()} approval threshold.`,
        details: {
          amount: invoiceAmount,
          threshold,
          pctBelow: Math.round(pctBelow * 10) / 10,
        },
      });
      break;
    }
  }

  return flags;
}

export async function checkAmountAnomaly(
  invoiceAmount: number,
  supplierId: number | null,
  invoiceId: string
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];
  if (!supplierId || !invoiceAmount || invoiceAmount <= 0) return flags;

  const statsResult = await getPool().query(
    `SELECT COUNT(*) as inv_count,
            AVG(invoice_amount) as avg_amount,
            STDDEV(invoice_amount) as stddev_amount,
            MAX(invoice_amount) as max_amount,
            MIN(invoice_amount) as min_amount
     FROM dbo.supp_invoice_dtls
     WHERE supplier_id = $1 AND id != $2 AND invoice_amount > 0`,
    [supplierId, invoiceId]
  );

  const stats = statsResult.rows[0];
  const invCount = Number(stats?.inv_count) || 0;
  const avgAmount = Number(stats?.avg_amount) || 0;
  const stddev = Number(stats?.stddev_amount) || 0;
  const maxAmount = Number(stats?.max_amount) || 0;

  if (invCount >= 3 && avgAmount > 0) {
    const deviation = Math.abs(invoiceAmount - avgAmount);
    const zScore = stddev > 0 ? deviation / stddev : 0;
    const pctOfAvg = (invoiceAmount / avgAmount) * 100;

    if (invoiceAmount > avgAmount && (zScore > 2.5 || pctOfAvg > 300)) {
      const isHigh = zScore > 3 || pctOfAvg > 500;
      flags.push({
        type: "amount_anomaly",
        label: "Unusual Invoice Amount",
        severity: isHigh ? "high" : "medium",
        confidence: Math.min(95, Math.round(60 + (isHigh ? 20 : 10) + Math.min(zScore, 5) * 4)),
        description: `Invoice amount (${invoiceAmount.toLocaleString()}) is ${Math.round(pctOfAvg)}% of this vendor's average (${Math.round(avgAmount).toLocaleString()}). ${invoiceAmount > maxAmount ? "This exceeds the highest previous invoice from this vendor." : ""}`,
        details: {
          amount: invoiceAmount,
          vendorAvg: Math.round(avgAmount),
          vendorMax: Math.round(maxAmount),
          pctOfAvg: Math.round(pctOfAvg),
          zScore: Math.round(zScore * 10) / 10,
          historicalCount: invCount,
        },
      });
    }
  }

  return flags;
}

export async function checkFirstTimeVendor(
  supplierId: number | null,
  invoiceId: string
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];
  if (!supplierId) return flags;

  const countResult = await getPool().query(
    `SELECT COUNT(*) as prior_count
     FROM dbo.supp_invoice_dtls
     WHERE supplier_id = $1 AND id != $2`,
    [supplierId, invoiceId]
  );

  const priorCount = Number(countResult.rows[0]?.prior_count) || 0;

  if (priorCount === 0) {
    flags.push({
      type: "first_time_vendor",
      label: "First Invoice from Vendor",
      severity: "low",
      confidence: 90,
      description: "This is the first invoice from this vendor. No historical data available for comparison. Additional verification recommended.",
      details: { priorInvoiceCount: 0 },
    });
  } else if (priorCount <= 2) {
    flags.push({
      type: "new_vendor",
      label: "New Vendor (Limited History)",
      severity: "low",
      confidence: priorCount === 1 ? 75 : 65,
      description: `Only ${priorCount} prior invoice(s) from this vendor. Limited historical data for pattern analysis.`,
      details: { priorInvoiceCount: priorCount },
    });
  }

  return flags;
}

export async function checkSimilarAmountPattern(
  invoiceAmount: number,
  supplierId: number | null,
  invoiceId: string
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];
  if (!supplierId || !invoiceAmount || invoiceAmount <= 0) return flags;

  const tolerance = invoiceAmount * 0.02;
  const similarResult = await getPool().query(
    `SELECT COUNT(*) as similar_count, 
            array_agg(invoice_number) as inv_numbers
     FROM dbo.supp_invoice_dtls
     WHERE supplier_id = $1 AND id != $2
       AND ABS(invoice_amount - $3) < $4
       AND invoice_amount > 0`,
    [supplierId, invoiceId, invoiceAmount, tolerance]
  );

  const similarCount = Number(similarResult.rows[0]?.similar_count) || 0;

  if (similarCount >= 3) {
    flags.push({
      type: "repeated_amount",
      label: "Repeated Invoice Amount Pattern",
      severity: "medium",
      confidence: Math.min(92, 65 + similarCount * 5),
      description: `${similarCount} other invoices from this vendor have nearly identical amounts (within 2% of ${invoiceAmount.toLocaleString()}). Repeated identical amounts can indicate automated or fabricated invoicing.`,
      details: {
        amount: invoiceAmount,
        similarCount,
        tolerance: Math.round(tolerance),
      },
    });
  }

  return flags;
}

export async function checkInvoiceDateAnomalies(
  invoice: any
): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];

  if (invoice.invoice_date) {
    const invDate = new Date(invoice.invoice_date);
    const now = new Date();
    if (invDate > now) {
      flags.push({
        type: "future_date",
        label: "Future-Dated Invoice",
        severity: "medium",
        confidence: 95,
        description: "Invoice date is set in the future. This is unusual and may indicate a premature or fraudulent submission.",
        details: { invoiceDate: invDate.toISOString().split("T")[0] },
      });
    }
  }

  if (invoice.invoice_date && invoice.inv_due_date) {
    const invDate = new Date(invoice.invoice_date);
    const dueDate = new Date(invoice.inv_due_date);
    const daysDiff = Math.round((dueDate.getTime() - invDate.getTime()) / (24 * 60 * 60 * 1000));
    if (daysDiff < 3 && daysDiff >= 0) {
      flags.push({
        type: "rush_payment",
        label: "Rush Payment Terms",
        severity: "medium",
        confidence: daysDiff === 0 ? 80 : 70,
        description: `Due date is only ${daysDiff} day(s) after invoice date. Extremely short payment windows can pressure approvers into hasty decisions.`,
        details: { daysBetween: daysDiff },
      });
    }
  }

  return flags;
}

export function calculateRiskScore(flags: FraudFlag[]): { score: number; level: "high" | "medium" | "low" } {
  const weights = { high: 30, medium: 15, low: 5 };
  let score = 0;
  for (const flag of flags) {
    score += weights[flag.severity];
  }

  score = Math.min(100, score);

  let level: "high" | "medium" | "low";
  if (score >= 50) level = "high";
  else if (score >= 25) level = "medium";
  else level = "low";

  return { score, level };
}

async function generateFraudNarrative(
  invoice: any,
  flags: FraudFlag[],
  riskScore: number,
  riskLevel: string
): Promise<string> {
  try {
    if (flags.length === 0) {
      return "No fraud indicators detected. Risk score is 0/100 (low) based on available historical data and pattern analysis.";
    }

    const prompt = `Write a brief 2-3 sentence executive summary that only explains the fraud detection result.

Invoice: ${invoice.invoice_number} from ${invoice.supplier_name}
Amount: ${Number(invoice.invoice_amount || 0).toLocaleString()}
Risk Score: ${riskScore}/100 (${riskLevel})

Fraud Flags Detected:
${flags.map((f) => `- ${f.label}: severity=${f.severity}, confidence=${f.confidence}% — ${f.description}`).join("\n")}

Rules:
- Explain only the risk score/level and each detected flag (label, severity, confidence, and what was found).
- Treat severity and confidence as separate: severity is risk weight; confidence is signal certainty (0–100%). Do not call a flag "low confidence" unless confidence is below 50%.
- Do NOT recommend actions, next steps, monitoring, verification, background checks, or approval advice.
- Do NOT invent flags or change the score.`;

    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [
        {
          role: "system",
          content:
            "You summarize deterministic invoice fraud check results for reviewers. Be concise and factual. Explain only score, risk level, flags, severity, and confidence. Never recommend actions or suggest how the reviewer should proceed. Never confuse severity with confidence.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 220,
      temperature: 0.2,
    });

    return response.choices[0]?.message?.content?.trim() || "Analysis complete.";
  } catch (error) {
    console.error("Fraud narrative generation failed:", error);
    const parts = flags.map(
      (f) => `${f.label} (severity ${f.severity}, confidence ${f.confidence}%)`
    );
    return `Risk score ${riskScore}/100 (${riskLevel}). Detected: ${parts.join("; ")}.`;
  }
}

export async function checkReconciliationFraudSignals(
  invoiceId: string,
  poNumber: string | null | undefined
): Promise<FraudFlag[]> {
  try {
    if (!poNumber) return [];
    const tolerances = await loadToleranceConfig();
    const inputs = await loadPoReconciliationInputs(poNumber);
    if (inputs.poLines.length === 0) return [];
    const recon = buildPoReconciliation({
      poNumber,
      poLines: inputs.poLines,
      grnLines: inputs.grnLines,
      invoiceLines: inputs.invoiceLines,
      qtyTolerance: tolerances.qtyTolerance,
    });
    return extractReconciliationFraudSignals(recon, invoiceId).map((s) => ({
      type: s.type,
      label: s.label,
      severity: s.severity,
      confidence: s.confidence,
      description: s.description,
      details: s.details,
    }));
  } catch (err: any) {
    console.error("[invoice-fraud] reconciliation signals failed:", err?.message || err);
    return [];
  }
}

export async function analyzeInvoiceFraud(invoiceId: string): Promise<FraudAnalysisResult> {
  const invoice = await getInvoiceForFraud(invoiceId);

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const invoiceAmount = Number(invoice.invoice_amount) || 0;
  const supplierId = invoice.supplier_id ? Number(invoice.supplier_id) : null;

  const [
    duplicateFlags,
    frequencyFlags,
    thresholdFlags,
    amountFlags,
    firstTimeFlags,
    similarAmountFlags,
    dateFlags,
    reconciliationFlags,
  ] = await Promise.all([
    checkDuplicateInvoiceNumbers(invoice.invoice_number, invoiceId, supplierId),
    checkVendorFrequencyAnomaly(supplierId, invoice.invoice_date, invoiceId),
    checkThresholdGaming(invoiceAmount, supplierId),
    checkAmountAnomaly(invoiceAmount, supplierId, invoiceId),
    checkFirstTimeVendor(supplierId, invoiceId),
    checkSimilarAmountPattern(invoiceAmount, supplierId, invoiceId),
    checkInvoiceDateAnomalies(invoice),
    checkReconciliationFraudSignals(invoiceId, invoice.po_number),
  ]);

  const allFlags = [
    ...duplicateFlags,
    ...frequencyFlags,
    ...thresholdFlags,
    ...amountFlags,
    ...firstTimeFlags,
    ...similarAmountFlags,
    ...dateFlags,
    ...reconciliationFlags,
  ];

  allFlags.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });

  const { score, level } = calculateRiskScore(allFlags);

  console.info("[invoice-fraud]", {
    invoiceId,
    invoiceNumber: invoice.invoice_number,
    flagCount: allFlags.length,
    flags: allFlags.map((f) => ({
      type: f.type,
      severity: f.severity,
      confidence: f.confidence,
    })),
    riskScore: score,
    riskLevel: level,
  });

  const narrative = await generateFraudNarrative(invoice, allFlags, score, level);

  return {
    invoiceId,
    invoiceNumber: invoice.invoice_number,
    supplierName: invoice.supplier_name || "Unknown",
    riskScore: score,
    riskLevel: level,
    flags: allFlags,
    narrative,
    analyzedAt: new Date().toISOString(),
  };
}
