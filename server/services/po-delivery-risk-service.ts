import { getAIClient, getAIModelName } from "./ai-client";
import * as repo from "../modules/procurement/procurement.repository";

export type DeliveryTrend = "improving" | "worsening" | "stable" | "unknown";

export interface DeliveryRiskResult {
  riskLevel: "high" | "medium" | "low" | "none" | "insufficient_data";
  narrative: string;
  recommendation: string | null;
  trend: DeliveryTrend;
  trendSummary: string | null;
  lateCount: number;
  totalAnalyzed: number;
  onTimeCount: number;
  earlyCount: number;
  avgDelayDays: number;
  deliveryHistory: Array<{
    poNumber: string;
    requiredDate: string | null;
    receivedDate: string | null;
    delayDays: number | null;
    status: "late" | "on_time" | "early" | "unknown";
  }>;
  vendorStats: {
    totalPOs: number;
    completedPOs: number;
    totalSpend: number;
    firstPODate: string | null;
    latestPODate: string | null;
  };
  analyzedAt: string;
}

/** Minimum absolute day difference between older vs recent avg delay to call a trend. */
const TREND_THRESHOLD_DAYS = 2;
/** Need at least this many dated deliveries to classify a trend. */
const TREND_MIN_ORDERS = 3;

/**
 * Compare older half vs recent half of delivery history (oldest → newest).
 * Trend is based on lateness only: early deliveries count as 0 days late.
 * That way "becoming less early but still early" is stable, not worsening.
 */
export function computeDeliveryTrend(
  ordersOldestFirst: Array<{ delayDays: number }>,
): { trend: DeliveryTrend; trendSummary: string | null; olderAvg: number; recentAvg: number } {
  if (ordersOldestFirst.length < TREND_MIN_ORDERS) {
    return {
      trend: "unknown",
      trendSummary: ordersOldestFirst.length === 0
        ? "Not enough dated deliveries to determine a trend."
        : `Only ${ordersOldestFirst.length} dated deliver${ordersOldestFirst.length === 1 ? "y" : "ies"}; need at least ${TREND_MIN_ORDERS} to determine a trend.`,
      olderAvg: 0,
      recentAvg: 0,
    };
  }

  const mid = Math.floor(ordersOldestFirst.length / 2);
  const older = ordersOldestFirst.slice(0, mid);
  const recent = ordersOldestFirst.slice(mid);
  const daysLate = (d: number) => Math.max(0, d);
  const avgLateness = (rows: Array<{ delayDays: number }>) =>
    rows.reduce((sum, r) => sum + daysLate(r.delayDays), 0) / rows.length;

  const olderAvg = avgLateness(older);
  const recentAvg = avgLateness(recent);
  const delta = recentAvg - olderAvg; // positive = more late on average (worsening)
  const round1 = (n: number) => Math.round(n * 10) / 10;

  let trend: DeliveryTrend = "stable";
  if (delta <= -TREND_THRESHOLD_DAYS) trend = "improving";
  else if (delta >= TREND_THRESHOLD_DAYS) trend = "worsening";

  const trendSummary =
    trend === "improving"
      ? `Delivery lateness is improving (older avg ${round1(olderAvg)} days late → recent ${round1(recentAvg)} days late).`
      : trend === "worsening"
        ? `Delivery lateness is worsening (older avg ${round1(olderAvg)} days late → recent ${round1(recentAvg)} days late).`
        : olderAvg === 0 && recentAvg === 0
          ? "No late deliveries in the trend window; performance is stable (early/on-time swings do not count as worsening)."
          : `Delivery lateness is stable (older avg ${round1(olderAvg)} days late → recent ${round1(recentAvg)} days late).`;

  return { trend, trendSummary, olderAvg: round1(olderAvg), recentAvg: round1(recentAvg) };
}

function ruleBasedRecommendation(
  riskLevel: DeliveryRiskResult["riskLevel"],
  trend: DeliveryTrend,
): string | null {
  if (riskLevel === "insufficient_data") {
    return "Record goods receipts against past POs so delivery risk can be scored.";
  }
  if (riskLevel === "high" || trend === "worsening") {
    return "Add buffer time to the delivery schedule and follow up with the vendor before the required date.";
  }
  if (riskLevel === "medium") {
    return "Monitor this PO closely and confirm the delivery commitment with the vendor.";
  }
  if (riskLevel === "low") {
    return "Minor historical delays — proceed, but keep the required date visible to the supplier.";
  }
  return "Vendor delivery history looks reliable; proceed with the planned required date.";
}

const DELIVERY_RISK_PROMPT = `You are an AI Delivery Risk Prediction agent for S2P Labs, an enterprise procurement platform. Your job is to analyze a vendor's delivery history and predict the risk of delays for an upcoming Purchase Order.

## ANALYSIS APPROACH

1. **Late Delivery Rate**: Calculate the percentage of orders delivered late (received_date > required_date).
2. **Average Delay**: Compute the average number of days late for delayed orders.
3. **Trend Analysis**: A system-calculated delivery trend is provided (improving / worsening / stable / unknown). It is based on **days late only** (early deliveries count as 0). Use that trend — do not invent a different one. Do not describe early-but-less-early deliveries as "worsening".
4. **Pattern Recognition**: Check the history for the patterns below. Mention at most 1–2 clear patterns in the narrative (with PO evidence). If none are clear, say nothing about patterns — do not invent them.

### Pattern checklist (only when evidence supports it)
- **Consistent small delay**: Most late orders are late by roughly the same short window (e.g. always ~2–3 days). Cite the delay range.
- **Large / high-value orders delayed more**: Higher PO totals (or clearly larger orders) are late more often or with longer delay than smaller ones. Compare a few high vs low totals from the history.
- **Small early, large late**: Smaller-value POs are on time/early while larger-value POs are late.
- **End-of-month lateness**: Required or received dates cluster near month-end (e.g. days 25–31) and those rows are disproportionately late.
- **Seasonal / holiday clustering**: Late deliveries cluster in the same calendar months or around common holiday periods visible in the dates — only if the dates clearly show it.
- **Delays becoming more frequent**: Prefer the system-provided trend for this; if trend is worsening, you may note that late deliveries are more common recently. Do not invent a conflicting frequency story.
- **Do NOT claim**: product-category delays, SKU issues, or other attributes unless those fields appear in the data you were given.

## RISK LEVELS
- **high**: More than 50% of recent orders were late, or average delay > 10 days.
- **medium**: 20-50% of recent orders were late, or average delay 3-10 days.
- **low**: Less than 20% of recent orders were late with minor delays.
- **none**: No late deliveries found in history.
- **insufficient_data**: Fewer than 2 orders with delivery data available.

## RULES
- Only use the data provided. Do not make up or assume any data.
- Be specific with evidence - include actual PO numbers, dates, delay counts, and PO totals when discussing size/value patterns.
- The narrative should be concise (1-3 sentences) and suitable for a procurement manager.
- Write the narrative in a direct, actionable style, e.g., "This vendor has delivered late on 3 of the last 5 orders, with an average delay of 7 days. Performance is worsening versus older orders."
- Put the actionable next step only in "recommendation", not repeated as the whole narrative.
- If a pattern is relevant, tailor the recommendation to it (e.g. buffer for consistent 2–3 day slip; extra follow-up on high-value POs).

## RESPONSE FORMAT
Return ONLY valid JSON with this exact structure:
{
  "riskLevel": "high" | "medium" | "low" | "none" | "insufficient_data",
  "narrative": "Concise risk summary for procurement manager",
  "recommendation": "Specific actionable recommendation"
}`;

function mapHistoryForResponse(processedHistory: any[]) {
  return processedHistory.slice(0, 10).map((h: any) => ({
    poNumber: h.poNumber,
    requiredDate: h.requiredDate,
    receivedDate: h.receivedDate,
    delayDays: h.delayDays,
    status: h.status,
  }));
}

function mapVendorStats(vendorStats: any) {
  return {
    totalPOs: parseInt(vendorStats?.total_pos) || 0,
    completedPOs: parseInt(vendorStats?.completed_pos) || 0,
    totalSpend: parseFloat(vendorStats?.total_spend) || 0,
    firstPODate: vendorStats?.first_po_date?.toISOString().split("T")[0] || null,
    latestPODate: vendorStats?.latest_po_date?.toISOString().split("T")[0] || null,
  };
}

export async function analyzeDeliveryRisk(poNumber: string): Promise<DeliveryRiskResult> {
  const poData = await repo.getPoForAiAnalysis(poNumber);
  if (!poData) {
    throw { status: 404, message: "Purchase Order not found" };
  }

  const supplierId = poData.header.supplier_id;
  if (!supplierId) {
    throw { status: 400, message: "No supplier assigned to this PO" };
  }

  const [deliveryHistory, vendorStats] = await Promise.all([
    repo.getVendorDeliveryHistory(supplierId, poNumber),
    repo.getVendorPoStats(supplierId),
  ]);

  const processedHistory = deliveryHistory.map((row: any) => {
    const requiredDate = row.po_required_date ? new Date(row.po_required_date) : null;
    const receivedDate = row.first_received_date ? new Date(row.first_received_date) : null;
    const delayDays = row.delay_days != null ? parseFloat(row.delay_days) : null;

    let status: "late" | "on_time" | "early" | "unknown" = "unknown";
    if (delayDays != null) {
      if (delayDays > 0) status = "late";
      else if (delayDays < 0) status = "early";
      else status = "on_time";
    }

    return {
      poNumber: row.po_number,
      requiredDate: requiredDate?.toISOString().split("T")[0] || null,
      receivedDate: receivedDate?.toISOString().split("T")[0] || null,
      delayDays,
      status,
      poStatus: row.po_status,
      totalCost: parseFloat(row.po_total_cost) || 0,
    };
  });

  // Repo returns newest-first; trend needs oldest → newest.
  const ordersWithData = processedHistory
    .filter((h: any) => h.delayDays != null)
    .slice()
    .reverse();
  const lateOrders = ordersWithData.filter((h: any) => h.status === "late");
  const onTimeOrders = ordersWithData.filter((h: any) => h.status === "on_time");
  const earlyOrders = ordersWithData.filter((h: any) => h.status === "early");
  const avgDelay = lateOrders.length > 0
    ? lateOrders.reduce((sum: number, h: any) => sum + (h.delayDays || 0), 0) / lateOrders.length
    : 0;

  const { trend, trendSummary, olderAvg, recentAvg } = computeDeliveryTrend(
    ordersWithData.map((h: any) => ({ delayDays: h.delayDays as number })),
  );

  const baseFields = {
    lateCount: lateOrders.length,
    totalAnalyzed: ordersWithData.length,
    onTimeCount: onTimeOrders.length,
    earlyCount: earlyOrders.length,
    avgDelayDays: Math.round(avgDelay * 10) / 10,
    trend,
    trendSummary,
    deliveryHistory: mapHistoryForResponse(processedHistory),
    vendorStats: mapVendorStats(vendorStats),
    analyzedAt: new Date().toISOString(),
  };

  if (ordersWithData.length < 2) {
    const riskLevel = "insufficient_data" as const;
    const narrative = `Not enough delivery history for this vendor. Only ${ordersWithData.length} order(s) with delivery data found.`;
    return {
      ...baseFields,
      riskLevel,
      narrative,
      recommendation: ruleBasedRecommendation(riskLevel, trend),
    };
  }

  let riskLevel: DeliveryRiskResult["riskLevel"] = "none";
  let narrative = "";
  let recommendation: string | null = null;

  try {
    const userMessage = `Analyze delivery risk for PO ${poNumber} based on this vendor's delivery history.

Also check for delivery patterns using only this data (dates, delay days, PO totals). Mention at most 1–2 clear patterns in the narrative; skip patterns that are not clearly supported.

**Current PO Details:**
- PO Number: ${poNumber}
- Required Date: ${poData.header.po_required_date || "Not specified"}
- Supplier ID: ${supplierId}
- Current PO Total Cost: ${poData.header.po_total_cost ?? "N/A"}

**Vendor Delivery History (${ordersWithData.length} orders with delivery data, oldest → newest):**
${ordersWithData.map((h: any) =>
  `- ${h.poNumber}: Required ${h.requiredDate || "N/A"}, Received ${h.receivedDate || "N/A"}, Total ${h.totalCost}, ${h.delayDays > 0 ? `${h.delayDays} days LATE` : h.delayDays < 0 ? `${Math.abs(h.delayDays)} days EARLY` : "ON TIME"}`
).join("\n")}

**Summary Stats:**
- Late deliveries: ${lateOrders.length} of ${ordersWithData.length} (${Math.round(lateOrders.length / ordersWithData.length * 100)}%)
- On-time: ${onTimeOrders.length}, Early: ${earlyOrders.length}
- Average delay when late: ${Math.round(avgDelay * 10) / 10} days
- Total POs with this vendor: ${vendorStats?.total_pos || 0}

**System-calculated delivery trend (authoritative — do not contradict):**
- Trend: ${trend}
- Older half avg days late: ${olderAvg}
- Recent half avg days late: ${recentAvg}
- Summary: ${trendSummary}
- Note: Early deliveries count as 0 days late for trend. Do not call the trend worsening merely because the vendor is less early than before.`;

    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [
        { role: "system", content: DELIVERY_RISK_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      riskLevel = parsed.riskLevel || riskLevel;
      narrative = parsed.narrative || "";
      recommendation = parsed.recommendation || null;
    }
  } catch (err) {
    console.error("AI delivery risk analysis error:", err);
    const lateRate = lateOrders.length / ordersWithData.length;
    // Align with documented bands: medium includes exactly 3–10 day avg delay and 20–50% late.
    if (lateRate > 0.5 || avgDelay > 10) riskLevel = "high";
    else if (lateRate >= 0.2 || avgDelay >= 3) riskLevel = "medium";
    else if (lateOrders.length > 0) riskLevel = "low";
    else riskLevel = "none";

    narrative = lateOrders.length > 0
      ? `This vendor has delivered late on ${lateOrders.length} of the last ${ordersWithData.length} orders, with an average delay of ${Math.round(avgDelay)} days.${trendSummary ? ` ${trendSummary}` : ""}`
      : `This vendor has delivered all ${ordersWithData.length} recent orders on time or early.${trendSummary ? ` ${trendSummary}` : ""}`;
    recommendation = ruleBasedRecommendation(riskLevel, trend);
  }

  if (!recommendation) {
    recommendation = ruleBasedRecommendation(riskLevel, trend);
  }

  return {
    ...baseFields,
    riskLevel,
    narrative,
    recommendation,
  };
}
