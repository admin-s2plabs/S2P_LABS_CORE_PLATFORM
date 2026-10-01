import { getAIClient, getAIModelName } from "./ai-client";
import * as repo from "../modules/procurement/procurement.repository";

export interface AnomalyResult {
  anomalies: Array<{
    type: "price_anomaly" | "duplicate_po" | "unusual_quantity" | "vendor_inconsistency";
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    evidence: string;
    suggestedAction: string;
    lineNumber?: string;
    itemName?: string;
  }>;
  summary: {
    totalAnomalies: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    overallRisk: "high" | "medium" | "low" | "none";
    narrative: string;
  };
  analyzedAt: string;
}

const ANOMALY_SYSTEM_PROMPT = `You are an AI Purchase Order Anomaly Detection agent for S2P Labs, an enterprise procurement platform. Your job is to analyze a Purchase Order against historical data and identify potential issues.

## ANALYSIS TYPES

1. **Price Anomalies**: Compare each line item's unit price against historical data. Use this priority order (highest trust first):
   - **supplierPriceHistory** (same vendor, same item) — primary signal
   - **itemPriceHistory** (same item across all vendors) — secondary / market signal
   - **categoryPriceHistory** — weakest signal; use only when item-level history is missing

   **Vendor-vs-market decision rules (mandatory) — priority order:**
   1. **Supplier historical average first:** If supplierPriceHistory has this item (prior POs from this vendor; the current PO is excluded from history), judge ONLY against that vendor average. Within ~20% → do **NOT** flag, even if far from market. Above 20% → medium; above 50% → high.
   2. **Market average only when no supplier history:** If supplierPriceHistory has no row for this item, use itemPriceHistory (all-vendor market average). Flag >20% medium / >50% high, and state in evidence that this is market-only (no prior buys of this item from this vendor). Prefer low severity when only categoryPriceHistory is available.
   - Never treat "expensive vs market but normal for this vendor" as high/medium severity.
   - Never invent supplier history — an empty/missing supplier row for the item means market rules apply.

   Examples:
   - Dell Laptop current ₹95,000; market avg ₹80,000; Vendor A prior avg ₹94,000 → **no flag** (supplier history wins).
   - Dell Laptop current ₹95,000; market avg ₹80,000; Vendor A prior avg ₹78,000 → **flag** (abnormal vs this vendor).
   - Dell Laptop current ₹95,000; market avg ₹80,000; no Vendor A history for this item → **flag on market** (~19% → near medium; larger gaps stronger).

2. **Duplicate PO Detection**: Use potentialDuplicatePOs only to find **accidental** duplicates — not normal repeat buying.

   **Flag duplicate_po only when it looks accidental**, e.g.:
   - Same supplier, highly similar items/amounts, AND created within a few days (roughly ≤ 7–14 days)
   - Same (or near-identical) items, quantities, and prices in a short window
   - Looks like a double-entry or accidental re-raise while a similar PO is still open

   **Do NOT flag duplicate_po for normal business patterns**, including:
   - Recurring monthly (or regular cadence) purchases — e.g. every month Supplier ABC / office chairs / ₹2,00,000
   - Scheduled replenishments and seasonal reorders
   - Framework / blanket order call-offs
   - Approved split deliveries or intentional multi-PO splits
   - Similar totals weeks or months apart with the same supplier/items — treat as recurring reorder, not a duplicate

   Timing rule of thumb: if the nearest similar candidate is about **3+ weeks** apart (especially ~monthly), it is **not** a duplicate. Only flag when timing is tight enough to suggest a mistake.

   Example:
   - Current PO and a prior PO: same supplier, same chairs, ~₹2,00,000, ~30 days apart → **no flag**.
   - Current PO and a prior PO: same supplier, same items/qty/price, created 1–2 days apart → **flag duplicate_po**.

3. **Unusual Quantities**: Compare ordered quantities against historical patterns. Flag unusually large or small orders.

4. **Vendor Pricing Inconsistencies**: Check if the same vendor charges different prices for the same items across POs. Use supplierPriceHistory min/max spread for the item. Do not re-flag a vendor-vs-market gap already covered under Price Anomalies — reserve this type for the same vendor's own price range being unusually wide or the current price sitting outside that vendor's historical min/max.

## RULES
- Only use the data provided. Do not make up or assume any data.
- Be specific with evidence - include actual numbers, percentages, and comparisons. When judging price, always cite both vendor-local and market figures when both exist, and state which one drove the decision.
- If no anomalies are found in a category, do not force false positives.
- Return a valid JSON object matching the required schema.
- For severity: high = likely error/fraud, medium = worth investigating, low = minor deviation.
- The narrative should be a 1-2 sentence summary suitable for a procurement manager.

## RESPONSE FORMAT
Return ONLY valid JSON with this exact structure:
{
  "anomalies": [
    {
      "type": "price_anomaly" | "duplicate_po" | "unusual_quantity" | "vendor_inconsistency",
      "severity": "high" | "medium" | "low",
      "title": "Short descriptive title",
      "description": "Detailed explanation of the anomaly",
      "evidence": "Specific data points supporting this finding",
      "suggestedAction": "What the procurement team should do",
      "lineNumber": "PO line number if applicable",
      "itemName": "Item name if applicable"
    }
  ],
  "summary": {
    "totalAnomalies": <number>,
    "highSeverity": <number>,
    "mediumSeverity": <number>,
    "lowSeverity": <number>,
    "overallRisk": "high" | "medium" | "low" | "none",
    "narrative": "Brief summary for procurement manager"
  }
}`;

/** Max relative deviation from same-vendor avg to treat a price as normal for that vendor. */
const VENDOR_PRICE_TOLERANCE = 0.2;

function normalizeItemName(name: string | undefined | null): string {
  return (name || "").trim().toLowerCase();
}

/** Prior supplier avg by normalized item name (history excludes the PO under review). */
function buildVendorAvgByItem(supplierHistory: any[]): Map<string, number> {
  const vendorAvgByItem = new Map<string, number>();
  for (const row of supplierHistory || []) {
    const key = normalizeItemName(row.item_name);
    const avg = Number(row.avg_unit_price);
    const orderCount = Number(row.order_count);
    // Require at least one prior line; skip empty/invalid rows
    if (key && Number.isFinite(avg) && avg > 0 && (!Number.isFinite(orderCount) || orderCount > 0)) {
      vendorAvgByItem.set(key, avg);
    }
  }
  return vendorAvgByItem;
}

/**
 * Items with prior same-vendor history whose current unit price is within
 * VENDOR_PRICE_TOLERANCE of that vendor avg — market-only gaps must not flag these.
 * Items with no prior supplier history are NOT included (market rules apply).
 */
function buildVendorConsistentItemKeys(
  lines: any[],
  supplierHistory: any[],
): Set<string> {
  const vendorAvgByItem = buildVendorAvgByItem(supplierHistory);

  const consistent = new Set<string>();
  for (const line of lines) {
    const key = normalizeItemName(line.item_name);
    const price = Number(line.line_unit_cost);
    const vendorAvg = vendorAvgByItem.get(key);
    if (!key || !Number.isFinite(price) || vendorAvg == null || vendorAvg <= 0) continue;
    const deviation = Math.abs(price - vendorAvg) / vendorAvg;
    if (deviation <= VENDOR_PRICE_TOLERANCE) {
      consistent.add(key);
    }
  }
  return consistent;
}

function rebuildSummary(
  anomalies: AnomalyResult["anomalies"],
  previousNarrative: string,
  suppressedCount: number,
): AnomalyResult["summary"] {
  const highSeverity = anomalies.filter((a) => a.severity === "high").length;
  const mediumSeverity = anomalies.filter((a) => a.severity === "medium").length;
  const lowSeverity = anomalies.filter((a) => a.severity === "low").length;
  const overallRisk: AnomalyResult["summary"]["overallRisk"] =
    highSeverity > 0
      ? "high"
      : mediumSeverity > 0
        ? "medium"
        : lowSeverity > 0
          ? "low"
          : "none";

  let narrative = previousNarrative;
  if (anomalies.length === 0 && suppressedCount > 0) {
    narrative =
      "No material anomalies detected. Line prices are consistent with this vendor's historical rates.";
  }

  return {
    totalAnomalies: anomalies.length,
    highSeverity,
    mediumSeverity,
    lowSeverity,
    overallRisk,
    narrative,
  };
}

/**
 * Drop AI price_anomaly / vendor_inconsistency findings for items that are
 * within tolerance of the same vendor's historical average (market gap alone
 * is not enough to flag).
 */
function suppressVendorConsistentPriceFlags(
  result: AnomalyResult,
  vendorConsistentItems: Set<string>,
): AnomalyResult {
  if (vendorConsistentItems.size === 0) return result;

  const filtered = result.anomalies.filter((a) => {
    if (a.type !== "price_anomaly" && a.type !== "vendor_inconsistency") return true;
    const key = normalizeItemName(a.itemName);
    if (!key) return true;
    return !vendorConsistentItems.has(key);
  });

  const suppressedCount = result.anomalies.length - filtered.length;
  if (suppressedCount === 0) return result;

  return {
    ...result,
    anomalies: filtered,
    summary: rebuildSummary(filtered, result.summary.narrative, suppressedCount),
  };
}

function severityForDeviation(deviation: number): "high" | "medium" | null {
  if (deviation > 0.5) return "high";
  if (deviation > VENDOR_PRICE_TOLERANCE) return "medium";
  return null;
}

function hasPriceAnomalyForItem(
  anomalies: AnomalyResult["anomalies"],
  itemKey: string,
): boolean {
  return anomalies.some(
    (a) =>
      a.type === "price_anomaly" &&
      normalizeItemName(a.itemName) === itemKey,
  );
}

function buildMarketAvgByItem(itemHistory: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of itemHistory || []) {
    const key = normalizeItemName(row.item_name);
    const avg = Number(row.avg_unit_price);
    if (key && Number.isFinite(avg) && avg > 0) {
      map.set(key, avg);
    }
  }
  return map;
}

/**
 * Enforce priority: supplier prior avg when present; else market (item) avg.
 * - Suppress market-driven flags when supplier history is within tolerance.
 * - Ensure a price_anomaly when the governing baseline exceeds tolerance.
 */
function applyPricePriorityRules(
  result: AnomalyResult,
  lines: any[],
  supplierHistory: any[],
  itemHistory: any[],
): AnomalyResult {
  const vendorAvgByItem = buildVendorAvgByItem(supplierHistory);
  const marketAvgByItem = buildMarketAvgByItem(itemHistory);
  const vendorConsistentItems = buildVendorConsistentItemKeys(lines, supplierHistory);

  let next = suppressVendorConsistentPriceFlags(result, vendorConsistentItems);
  const anomalies = [...next.anomalies];
  let added = 0;

  for (const line of lines) {
    const key = normalizeItemName(line.item_name);
    const price = Number(line.line_unit_cost);
    if (!key || !Number.isFinite(price) || price <= 0) continue;
    if (hasPriceAnomalyForItem(anomalies, key)) continue;

    const vendorAvg = vendorAvgByItem.get(key);
    if (vendorAvg != null && vendorAvg > 0) {
      const deviation = Math.abs(price - vendorAvg) / vendorAvg;
      const severity = severityForDeviation(deviation);
      if (!severity) continue;
      anomalies.push({
        type: "price_anomaly",
        severity,
        title: "Price outside this vendor's historical range",
        description: `Unit price ${price} for ${line.item_name} differs from this vendor's prior average of ${vendorAvg} by ${(deviation * 100).toFixed(1)}%.`,
        evidence: `Current price: ${price}. Vendor prior average: ${vendorAvg}. Deviation: ${(deviation * 100).toFixed(1)}% from supplier history (supplier baseline takes priority over market).`,
        suggestedAction: "Confirm the price with the vendor against prior purchases of this item.",
        lineNumber: line.po_line_number != null ? String(line.po_line_number) : undefined,
        itemName: line.item_name,
      });
      added++;
      continue;
    }

    const marketAvg = marketAvgByItem.get(key);
    if (marketAvg == null || marketAvg <= 0) continue;
    const deviation = Math.abs(price - marketAvg) / marketAvg;
    const severity = severityForDeviation(deviation);
    if (!severity) continue;
    anomalies.push({
      type: "price_anomaly",
      severity,
      title: "Price outside market historical range",
      description: `No prior purchases of ${line.item_name} from this vendor. Unit price ${price} differs from the market (all-vendor) average of ${marketAvg} by ${(deviation * 100).toFixed(1)}%.`,
      evidence: `Current price: ${price}. Market average: ${marketAvg}. Deviation: ${(deviation * 100).toFixed(1)}% (market-only — no supplier history for this item).`,
      suggestedAction: "Benchmark against other suppliers or negotiate before approval.",
      lineNumber: line.po_line_number != null ? String(line.po_line_number) : undefined,
      itemName: line.item_name,
    });
    added++;
  }

  if (added === 0) return next;

  return {
    ...next,
    anomalies,
    summary: rebuildSummary(anomalies, next.summary.narrative, 0),
  };
}

export async function analyzePurchaseOrder(poNumber: string): Promise<AnomalyResult> {
  const poData = await repo.getPoForAiAnalysis(poNumber);
  if (!poData) {
    throw { status: 404, message: "Purchase Order not found" };
  }

  const { header, lines } = poData;

  const itemNames = Array.from(new Set(
    lines
      .map((l: any) => l.item_name)
      .filter((name: string) => name && name.trim() !== "")
  )) as string[];
  const categoryNames = Array.from(new Set(
    lines
      .map((l: any) => l.product_category_name)
      .filter((name: string) => name && name.trim() !== "")
  )) as string[];

  const historicalStats = await repo.getHistoricalPriceStats(
    itemNames,
    categoryNames,
    header.supplier_id,
    poNumber,
  );

  const potentialDuplicates = await repo.findPotentialDuplicatePos(
    poNumber,
    header.supplier_id,
    header.po_total_cost ? Number(header.po_total_cost) : null
  );

  const analysisPayload = {
    currentPO: {
      poNumber: header.po_number,
      vendor: header.company_name,
      status: header.po_status,
      totalCost: header.po_total_cost,
      currency: header.po_currency,
      type: header.po_type,
      issueDate: header.po_issue_date,
      requiredDate: header.po_required_date,
      buyer: header.buyer_name,
      department: header.department_name,
      description: header.po_description,
      lineItems: lines.map((l: any) => ({
        lineNumber: l.po_line_number,
        itemName: l.item_name,
        itemType: l.item_type,
        unitPrice: l.line_unit_cost,
        quantity: l.line_qty,
        totalCost: l.line_cost,
        category: l.product_category_name,
        unit: l.line_unit,
        discount: l.discount,
        taxRate: l.tax_rate,
      })),
    },
    historicalData: {
      itemPriceHistory: historicalStats.byItem,
      categoryPriceHistory: historicalStats.byCategory,
      supplierPriceHistory: historicalStats.bySupplier,
    },
    potentialDuplicatePOs: potentialDuplicates.map((d: any) => ({
      poNumber: d.po_number,
      vendor: d.company_name,
      status: d.po_status,
      totalCost: d.po_total_cost,
      issueDate: d.po_issue_date,
      description: d.po_description,
      items: d.items_summary,
    })),
  };

  const userPrompt = `Analyze this Purchase Order for anomalies:\n\n${JSON.stringify(analysisPayload, null, 2)}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: ANOMALY_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw { status: 500, message: "AI analysis returned empty response" };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    console.error("AI response JSON parse error:", parseError, "Content:", content);
    throw { status: 500, message: "AI analysis returned invalid response format. Please try again." };
  }

  if (!parsed || typeof parsed !== "object") {
    throw { status: 500, message: "AI analysis returned unexpected response structure." };
  }

  const result: AnomalyResult = {
    anomalies: (Array.isArray(parsed.anomalies) ? parsed.anomalies : []).map((a: any) => ({
      type: a.type,
      severity: a.severity,
      title: a.title || "Anomaly detected",
      description: a.description || "",
      evidence: a.evidence || "",
      suggestedAction: a.suggestedAction || a.suggested_action || "",
      lineNumber: a.lineNumber || a.line_number,
      itemName: a.itemName || a.item_name,
    })),
    summary: {
      totalAnomalies: parsed.summary?.totalAnomalies ?? parsed.summary?.total_anomalies ?? (Array.isArray(parsed.anomalies) ? parsed.anomalies.length : 0),
      highSeverity: parsed.summary?.highSeverity ?? parsed.summary?.high_severity ?? 0,
      mediumSeverity: parsed.summary?.mediumSeverity ?? parsed.summary?.medium_severity ?? 0,
      lowSeverity: parsed.summary?.lowSeverity ?? parsed.summary?.low_severity ?? 0,
      overallRisk: parsed.summary?.overallRisk ?? parsed.summary?.overall_risk ?? "none",
      narrative: parsed.summary?.narrative ?? "Analysis complete.",
    },
    analyzedAt: new Date().toISOString(),
  };

  return applyPricePriorityRules(
    result,
    lines,
    historicalStats.bySupplier,
    historicalStats.byItem,
  );
}
