import * as repo from "./spend-analysis.repository";
import { orgFilter } from "./spend-analysis.repository";
import { getAIClient, getAIModelName } from "../../services/ai-client";
import {
  createRateResolver,
  convertOrgGroupedAmounts,
  convertBudgetEntityAmounts,
  convertBidAmounts,
  type RateResolver,
} from "./spend-analysis.currency";

const aiInsightsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000;

async function maybeResolver(baseCurrency?: string, orgId?: number): Promise<RateResolver | null> {
  if (!baseCurrency?.trim()) return null;
  return createRateResolver(baseCurrency, orgId);
}

export async function getSummary(year?: number, orgId?: number, baseCurrency?: string) {
  const data = await repo.getSummaryStats(year, orgId);
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return data;
  const rows = await repo.getChartInvoiceAmountsByOrg(year, orgId);
  return { ...data, totalSpend: await convertOrgGroupedAmounts(rows, resolver) };
}

export async function getBudgetSummary(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getBudgetSummary(year, orgId);
  const rows = await repo.getBudgetAmountsByEntity(year, orgId);
  const totalBudget = await convertBudgetEntityAmounts(
    rows.map((r) => ({ business_entity: r.business_entity, budget_curr: r.budget_curr, amount: r.budget })),
    resolver
  );
  const totalConsumed = await convertBudgetEntityAmounts(
    rows.map((r) => ({ business_entity: r.business_entity, budget_curr: r.budget_curr, amount: r.consumed })),
    resolver
  );
  const totalReserved = await convertBudgetEntityAmounts(
    rows.map((r) => ({ business_entity: r.business_entity, budget_curr: r.budget_curr, amount: r.reserved })),
    resolver
  );
  const available = totalBudget - totalConsumed - totalReserved;
  const consumedPct = totalBudget > 0 ? ((totalConsumed / totalBudget) * 100) : 0;
  const reservedPct = totalBudget > 0 ? ((totalReserved / totalBudget) * 100) : 0;
  const availablePct = totalBudget > 0 ? ((available / totalBudget) * 100) : 0;
  return {
    totalBudget,
    totalConsumed,
    totalReserved,
    available,
    consumedPct: Math.round(consumedPct * 100) / 100,
    reservedPct: Math.round(reservedPct * 100) / 100,
    availablePct: Math.round(availablePct * 100) / 100,
  };
}

export async function getConsumedAmount(type: string, year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getConsumedAmount(type, year, orgId);
  if (type === "po") {
    const rows = await repo.getComplianceInvoiceAmountsByOrg(year, orgId, `
      AND po_number IS NOT NULL AND po_number != ''
    `);
    return convertOrgGroupedAmounts(rows, resolver);
  }
  if (type === "non-po") {
    const rows = await repo.getComplianceInvoiceAmountsByOrg(year, orgId, `
      AND (po_number IS NULL OR po_number = '')
    `);
    return convertOrgGroupedAmounts(rows, resolver);
  }
  const po = await getConsumedAmount("po", year, orgId, baseCurrency);
  const nonPo = await getConsumedAmount("non-po", year, orgId, baseCurrency);
  return (po as number) + (nonPo as number);
}

export async function getBudgetVsSpend(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getBudgetVsSpend(year, orgId);
  const rows = await repo.getBudgetAmountsByEntity(year, orgId);
  const byName: Record<string, { budget: number; spend: number }> = {};
  for (const r of rows) {
    const key = r.name?.length > 20 ? r.name.substring(0, 20) + "…" : r.name;
    if (!byName[key]) byName[key] = { budget: 0, spend: 0 };
    byName[key].budget += await resolver.convert(
      r.budget,
      r.budget_curr || (await resolver.getOrgCurrency(parseInt(String(r.business_entity), 10)))
    );
    byName[key].spend += await resolver.convert(
      r.consumed,
      r.budget_curr || (await resolver.getOrgCurrency(parseInt(String(r.business_entity), 10)))
    );
  }
  return Object.entries(byName)
    .map(([name, v]) => ({ name, budget: v.budget, spend: v.spend }))
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 12);
}

async function aggregateConvertedByName(
  rows: { org_id: number; name: string; value?: number; total_spend?: number }[],
  resolver: RateResolver,
  truncateLen = 25,
  limit = 10
) {
  const byName: Record<string, number> = {};
  for (const r of rows) {
    const rawName = r.name || "Unknown";
    const name = rawName.length > truncateLen ? rawName.substring(0, truncateLen) + "…" : rawName;
    const amt = parseFloat(String(r.value ?? r.total_spend ?? 0));
    const fromCur = await resolver.getOrgCurrency(Number(r.org_id));
    byName[name] = (byName[name] || 0) + (await resolver.convert(amt, fromCur));
  }
  return Object.entries(byName)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export async function getSpendByCategory(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getSpendByCategory(year, orgId);
  const rows = await repo.getSpendByCategoryGrouped(year, orgId);
  return aggregateConvertedByName(
    rows.map((r) => ({ org_id: Number(r.org_id), name: r.name, value: parseFloat(r.value || "0") })),
    resolver
  );
}

export async function getSpendBySupplier(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getSpendBySupplier(year, orgId);
  const rows = await repo.getSpendBySupplierGrouped(year, orgId);
  return aggregateConvertedByName(
    rows.map((r) => ({ org_id: Number(r.org_id), name: r.name, value: parseFloat(r.value || "0") })),
    resolver
  );
}

export async function getSpendBySupplierInDateRange(
  fromDate: string,
  toDate?: string,
  orgId?: number,
  limit = 25,
) {
  return repo.getSpendBySupplierInDateRange(fromDate, toDate, orgId, limit);
}

export async function getSpendByDepartment(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getSpendByDepartment(year, orgId);
  const rows = await repo.getSpendByDepartmentGrouped(year, orgId);
  return aggregateConvertedByName(
    rows.map((r) => ({ org_id: Number(r.org_id), name: r.name, value: parseFloat(r.value || "0") })),
    resolver,
    20
  );
}

export async function getSpendTrend(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getSpendTrend(year, orgId);
  const rows = await repo.getSpendTrendGrouped(year, orgId);
  const byMonth: Record<string, { spend: number; invCount: number; yr: number; mn: number }> = {};
  for (const r of rows) {
    const month = r.month;
    const fromCur = await resolver.getOrgCurrency(Number(r.org_id));
    const converted = await resolver.convert(parseFloat(r.spend || "0"), fromCur);
    if (!byMonth[month]) {
      byMonth[month] = { spend: 0, invCount: 0, yr: Number(r.yr), mn: Number(r.mn) };
    }
    byMonth[month].spend += converted;
    byMonth[month].invCount += parseInt(r.inv_count || "0", 10);
  }
  return Object.entries(byMonth)
    .map(([month, v]) => ({ month, spend: v.spend, poCount: v.invCount }))
    .sort((a, b) => {
      const am = byMonth[a.month];
      const bm = byMonth[b.month];
      return am.yr !== bm.yr ? am.yr - bm.yr : am.mn - bm.mn;
    });
}

export async function getPoStatusDistribution(year?: number, orgId?: number) {
  return repo.getPoStatusDistribution(year, orgId);
}

export async function getAvailableYears() {
  return repo.getAvailableYears();
}

export async function getBusinessEntities() {
  return repo.getBusinessEntities();
}

export async function getPurchaseCycleTime(orgId?: number) {
  return repo.getPurchaseCycleTime(orgId);
}

export async function getLatePaymentPercent(orgId?: number) {
  return repo.getLatePaymentPercent(orgId);
}

export async function getInvoiceStatusCounts(orgId?: number) {
  return repo.getInvoiceStatusCounts(orgId);
}

export async function getOpenPOAging(orgId?: number) {
  return repo.getOpenPOAging(orgId);
}

export async function getUninvoicedGRNs(orgId?: number) {
  return repo.getUninvoicedGRNs(orgId);
}

export async function getTopApprovers(orgId?: number) {
  return repo.getTopApprovers(orgId);
}

export async function getSupplierActivityStats(orgId?: number) {
  return repo.getSupplierActivityStats(orgId);
}

export async function getPOYearTrend(orgId?: number) {
  return repo.getPOYearTrend(orgId);
}

export async function getAvgApprovalDays(orgId?: number) {
  return repo.getAvgApprovalDays(orgId);
}

export async function getPoVsNonPoSpend(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getPoVsNonPoSpend(year, orgId);
  const rows = await repo.getPoVsNonPoGrouped(year, orgId);
  const byType: Record<string, { value: number; count: number }> = {};
  for (const r of rows) {
    const name = r.spend_type;
    const fromCur = await resolver.getOrgCurrency(Number(r.org_id));
    const converted = await resolver.convert(parseFloat(r.total_spend || "0"), fromCur);
    if (!byType[name]) byType[name] = { value: 0, count: 0 };
    byType[name].value += converted;
    byType[name].count += parseInt(r.inv_count || "0", 10);
  }
  return Object.entries(byType).map(([name, v]) => ({ name, value: v.value, count: v.count }));
}

export async function getSpendByCurrency(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getSpendByCurrency(year, orgId);
  const rows = await repo.getSpendByCurrencyGrouped(year, orgId);
  const byCurrency: Record<string, { value: number; count: number }> = {};
  for (const r of rows) {
    const name = r.currency;
    const fromCur = await resolver.getOrgCurrency(Number(r.org_id));
    const converted = await resolver.convert(parseFloat(r.total_spend || "0"), fromCur);
    if (!byCurrency[name]) byCurrency[name] = { value: 0, count: 0 };
    byCurrency[name].value += converted;
    byCurrency[name].count += parseInt(r.po_count || "0", 10);
  }
  return Object.entries(byCurrency)
    .map(([name, v]) => ({ name, value: v.value, count: v.count }))
    .sort((a, b) => b.value - a.value);
}

export async function getSavingsAnalysis(year?: number, orgId?: number, baseCurrency?: string) {
  const data = await repo.getSavingsAnalysis(year, orgId);
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return data;
  const yearFilter = year ? `AND EXTRACT(YEAR FROM po.po_issue_date) = ${year}` : "";
  const { pool } = await import("../../db");
  const { getContextPool } = await import("../../tenant-context");
  const getPool = () => getContextPool() ?? pool;
  const estRows = await getPool().query(`
    SELECT po.org_id, COALESCE(SUM(pr.pr_amount), 0) as amount
    FROM dbo.supp_pr_header_dtls pr
    JOIN dbo.supp_po_header_dtls po ON po.pr_number = pr.pr_number
    WHERE pr.pr_status NOT IN ('Draft','Rejected','Cancelled')
      AND po.po_status NOT IN ('Draft','Rejected','Cancelled')
      AND pr.pr_amount IS NOT NULL AND pr.pr_amount > 0
      ${yearFilter} ${orgFilter("po.org_id", orgId)}
      AND po.org_id IS NOT NULL
    GROUP BY po.org_id
  `);
  const actRows = await getPool().query(`
    SELECT po.org_id, COALESCE(SUM(CAST(po.po_net_cost AS NUMERIC)), 0) as amount
    FROM dbo.supp_pr_header_dtls pr
    JOIN dbo.supp_po_header_dtls po ON po.pr_number = pr.pr_number
    WHERE pr.pr_status NOT IN ('Draft','Rejected','Cancelled')
      AND po.po_status NOT IN ('Draft','Rejected','Cancelled')
      AND pr.pr_amount IS NOT NULL AND pr.pr_amount > 0
      ${yearFilter} ${orgFilter("po.org_id", orgId)}
      AND po.org_id IS NOT NULL
    GROUP BY po.org_id
  `);
  const estimated = await convertOrgGroupedAmounts(
    estRows.rows.map((r: any) => ({ org_id: Number(r.org_id), amount: parseFloat(r.amount) })),
    resolver
  );
  const actual = await convertOrgGroupedAmounts(
    actRows.rows.map((r: any) => ({ org_id: Number(r.org_id), amount: parseFloat(r.amount) })),
    resolver
  );
  const savings = estimated - actual;
  const pct = estimated > 0 ? Math.round((savings / estimated) * 1000) / 10 : 0;
  return { ...data, estimated, actual, savings, savingsPercent: pct };
}

export async function getContractVsSpotSpend(year?: number, orgId?: number, baseCurrency?: string) {
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return repo.getContractVsSpotSpend(year, orgId);
  const yearFilter = year ? `AND EXTRACT(YEAR FROM po_issue_date) = ${year}` : "";
  const { pool } = await import("../../db");
  const { getContextPool } = await import("../../tenant-context");
  const getPool = () => getContextPool() ?? pool;
  const result = await getPool().query(`
    SELECT org_id,
      CASE WHEN is_contract_exists = 'true' OR is_contract_exists = 'Y' OR (contract_ref_no IS NOT NULL AND contract_ref_no != '') THEN 'Contract' ELSE 'Spot Buy' END as spend_type,
      COALESCE(SUM(CAST(po_net_cost AS NUMERIC)),0) as total_spend,
      COUNT(*) as po_count
    FROM dbo.supp_po_header_dtls
    WHERE po_status NOT IN ('Draft','Rejected','Cancelled')
      ${yearFilter} ${orgFilter("org_id", orgId)}
      AND org_id IS NOT NULL
    GROUP BY org_id, CASE WHEN is_contract_exists = 'true' OR is_contract_exists = 'Y' OR (contract_ref_no IS NOT NULL AND contract_ref_no != '') THEN 'Contract' ELSE 'Spot Buy' END
  `);
  const byType: Record<string, { value: number; count: number }> = {};
  for (const r of result.rows) {
    const fromCur = await resolver.getOrgCurrency(Number(r.org_id));
    const converted = await resolver.convert(parseFloat(r.total_spend || "0"), fromCur);
    if (!byType[r.spend_type]) byType[r.spend_type] = { value: 0, count: 0 };
    byType[r.spend_type].value += converted;
    byType[r.spend_type].count += parseInt(r.po_count || "0", 10);
  }
  return Object.entries(byType).map(([name, v]) => ({ name, value: v.value, count: v.count }));
}

export async function getMaverickSpend(year?: number, orgId?: number, baseCurrency?: string) {
  const data = await repo.getMaverickSpend(year, orgId);
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return data;
  const totalRows = await repo.getComplianceInvoiceAmountsByOrg(year, orgId);
  const maverickRows = await repo.getComplianceInvoiceAmountsByOrg(year, orgId, `
    AND (po_number IS NULL OR po_number = '')
  `);
  const totalSpend = await convertOrgGroupedAmounts(totalRows, resolver);
  const maverickSpend = await convertOrgGroupedAmounts(maverickRows, resolver);
  const pct = totalSpend > 0 ? Math.round((maverickSpend / totalSpend) * 1000) / 10 : 0;
  return { ...data, totalSpend, maverickSpend, maverickPercent: pct };
}

export async function getBidSavingsSummary(year?: number, orgId?: number, baseCurrency?: string) {
  const data = await repo.getBidSavingsSummary(year, orgId);
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return data;
  const { pool } = await import("../../db");
  const { getContextPool } = await import("../../tenant-context");
  const getPool = () => getContextPool() ?? pool;
  const yearFilter = year ? `AND EXTRACT(YEAR FROM b.created_date) = ${year}` : "";
  const estResult = await getPool().query(`
    SELECT b.org_id, b.currency,
      COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.pr_amount IS NOT NULL AND CAST(b.pr_amount AS NUMERIC) > 0 THEN CAST(b.pr_amount AS NUMERIC) ELSE 0 END), 0) as amount
    FROM dbo.supp_bid_dtls b
    WHERE b.status NOT IN ('Deleted') ${yearFilter} ${orgFilter("b.org_id", orgId)}
    GROUP BY b.org_id, b.currency
  `);
  const awdResult = await getPool().query(`
    SELECT b.org_id, b.currency,
      COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.awarded_amount IS NOT NULL THEN b.awarded_amount ELSE 0 END), 0) as amount
    FROM dbo.supp_bid_dtls b
    WHERE b.status NOT IN ('Deleted') ${yearFilter} ${orgFilter("b.org_id", orgId)}
    GROUP BY b.org_id, b.currency
  `);
  const totalEstimated = await convertBidAmounts(
    estResult.rows.map((r: any) => ({ org_id: r.org_id, currency: r.currency, amount: parseFloat(r.amount) })),
    resolver,
    orgId
  );
  const totalAwarded = await convertBidAmounts(
    awdResult.rows.map((r: any) => ({ org_id: r.org_id, currency: r.currency, amount: parseFloat(r.amount) })),
    resolver,
    orgId
  );
  const savings = totalEstimated > 0 ? totalEstimated - totalAwarded : 0;
  const savingsPercent = totalEstimated > 0 ? Math.round((savings / totalEstimated) * 1000) / 10 : 0;
  return { ...data, totalEstimated, totalAwarded, savings, savingsPercent };
}

export async function getBidSavingsByType(year?: number, orgId?: number, baseCurrency?: string) {
  const rows = await repo.getBidSavingsByType(year, orgId);
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return rows;
  const { pool } = await import("../../db");
  const { getContextPool } = await import("../../tenant-context");
  const getPool = () => getContextPool() ?? pool;
  const yearFilter = year ? `AND EXTRACT(YEAR FROM b.created_date) = ${year}` : "";
  const detail = await getPool().query(`
    SELECT b.org_id, b.type,
      COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.pr_amount IS NOT NULL AND CAST(b.pr_amount AS NUMERIC) > 0 THEN CAST(b.pr_amount AS NUMERIC) ELSE 0 END), 0) as estimated,
      COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.awarded_amount IS NOT NULL THEN b.awarded_amount ELSE 0 END), 0) as awarded
    FROM dbo.supp_bid_dtls b
    WHERE b.status NOT IN ('Deleted') ${yearFilter} ${orgFilter("b.org_id", orgId)}
      AND b.org_id IS NOT NULL
    GROUP BY b.org_id, b.type
  `);
  const byType: Record<string, { estimated: number; awarded: number }> = {};
  for (const r of detail.rows) {
    const t = r.type;
    if (!byType[t]) byType[t] = { estimated: 0, awarded: 0 };
    byType[t].estimated += await convertBidAmounts(
      [{ org_id: r.org_id, amount: parseFloat(r.estimated) }],
      resolver,
      orgId
    );
    byType[t].awarded += await convertBidAmounts(
      [{ org_id: r.org_id, amount: parseFloat(r.awarded) }],
      resolver,
      orgId
    );
  }
  return rows.map((row) => {
    const agg = byType[row.type];
    if (!agg) return row;
    const sav = agg.estimated > 0 ? agg.estimated - agg.awarded : 0;
    return {
      ...row,
      estimated: agg.estimated,
      awarded: agg.awarded,
      savings: sav,
      savingsPercent: agg.estimated > 0 ? Math.round((sav / agg.estimated) * 1000) / 10 : 0,
    };
  });
}

export async function getCompetitiveSavings(year?: number, orgId?: number, baseCurrency?: string) {
  const data = await repo.getCompetitiveSavings(year, orgId);
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return data;
  const { pool } = await import("../../db");
  const { getContextPool } = await import("../../tenant-context");
  const getPool = () => getContextPool() ?? pool;
  const yearFilter = year ? `AND EXTRACT(YEAR FROM b.created_date) = ${year}` : "";
  const detail = await getPool().query(`
    SELECT b.org_id, b.currency, b.awarded_amount,
      (SELECT MAX(CAST(r.bidtotal AS NUMERIC)) FROM dbo.supp_bid_response_dtls r WHERE r.bidrefno = b.id AND r.status NOT IN ('Draft') AND r.bidtotal IS NOT NULL) as highest_bid,
      (SELECT MIN(CAST(r.bidtotal AS NUMERIC)) FROM dbo.supp_bid_response_dtls r WHERE r.bidrefno = b.id AND r.status NOT IN ('Draft') AND r.bidtotal IS NOT NULL) as lowest_bid
    FROM dbo.supp_bid_dtls b
    WHERE b.status = 'Awarded' ${yearFilter} ${orgFilter("b.org_id", orgId)}
  `);
  let totalHighestBid = 0;
  let totalLowestBid = 0;
  let totalAwarded = 0;
  for (const r of detail.rows) {
    const row = { org_id: r.org_id, currency: r.currency, amount: 0 };
    if (r.highest_bid) {
      totalHighestBid += await convertBidAmounts([{ ...row, amount: parseFloat(r.highest_bid) }], resolver, orgId);
    }
    if (r.lowest_bid) {
      totalLowestBid += await convertBidAmounts([{ ...row, amount: parseFloat(r.lowest_bid) }], resolver, orgId);
    }
    if (r.awarded_amount) {
      totalAwarded += await convertBidAmounts([{ ...row, amount: parseFloat(r.awarded_amount) }], resolver, orgId);
    }
  }
  const competitiveSavings = totalHighestBid > 0 ? totalHighestBid - totalAwarded : 0;
  const competitivePct = totalHighestBid > 0 ? Math.round((competitiveSavings / totalHighestBid) * 1000) / 10 : 0;
  return {
    ...data,
    totalHighestBid,
    totalLowestBid,
    totalAwarded,
    competitiveSavings,
    competitiveSavingsPercent: competitivePct,
  };
}

export async function getBidStatusDistribution(year?: number, orgId?: number, baseCurrency?: string) {
  const rows = await repo.getBidStatusDistribution(year, orgId);
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return rows;
  const { pool } = await import("../../db");
  const { getContextPool } = await import("../../tenant-context");
  const getPool = () => getContextPool() ?? pool;
  const yearFilter = year ? `AND EXTRACT(YEAR FROM b.created_date) = ${year}` : "";
  const detail = await getPool().query(`
    SELECT b.org_id, b.status, b.currency,
      COALESCE(SUM(
        CASE
          WHEN b.status = 'Awarded' AND b.awarded_amount IS NOT NULL AND b.awarded_amount > 0
            THEN b.awarded_amount
          WHEN b.pr_amount IS NOT NULL AND CAST(b.pr_amount AS NUMERIC) > 0
            THEN CAST(b.pr_amount AS NUMERIC)
          WHEN b.awarded_amount IS NOT NULL AND b.awarded_amount > 0
            THEN b.awarded_amount
          ELSE 0
        END
      ), 0) as total_value
    FROM dbo.supp_bid_dtls b
    WHERE b.status NOT IN ('Deleted') ${yearFilter} ${orgFilter("b.org_id", orgId)}
    GROUP BY b.org_id, b.status, b.currency
  `);
  const byStatus: Record<string, number> = {};
  for (const r of detail.rows) {
    const converted = await convertBidAmounts(
      [{ org_id: r.org_id, currency: r.currency, amount: parseFloat(r.total_value) }],
      resolver
    );
    byStatus[r.status] = (byStatus[r.status] || 0) + converted;
  }
  return rows.map((row) => ({ ...row, value: byStatus[row.name] ?? row.value }));
}

export async function getTopSavingsBids(year?: number, orgId?: number, baseCurrency?: string) {
  const rows = await repo.getTopSavingsBids(year, orgId);
  const resolver = await maybeResolver(baseCurrency, orgId);
  if (!resolver) return rows;
  const converted = [];
  for (const b of rows) {
    const estimated = await convertBidAmounts(
      [{ org_id: orgId, currency: b.currency, amount: b.estimated }],
      resolver,
      orgId
    );
    const awarded = await convertBidAmounts(
      [{ org_id: orgId, currency: b.currency, amount: b.awarded }],
      resolver,
      orgId
    );
    const savings = estimated - awarded;
    converted.push({
      ...b,
      currency: baseCurrency!.trim().toUpperCase(),
      estimated,
      awarded,
      savings,
      savingsPercent: estimated > 0 ? Math.round((savings / estimated) * 1000) / 10 : b.savingsPercent,
    });
  }
  return converted;
}

export async function getYoYSpendComparison(year?: number, orgId?: number) {
  return repo.getYoYSpendComparison(year, orgId);
}

export async function getVendorConcentrationRisk(year?: number, orgId?: number) {
  return repo.getVendorConcentrationRisk(year, orgId);
}

export async function getPaymentTermsAnalysis(year?: number, orgId?: number) {
  return repo.getPaymentTermsAnalysis(year, orgId);
}

export async function getUpcomingPaymentObligations(orgId?: number) {
  return repo.getUpcomingPaymentObligations(orgId);
}

export async function getContractPortfolio(orgId?: number) {
  return repo.getContractPortfolioStats(orgId);
}

export async function getContractPipeline(orgId?: number) {
  return repo.getContractPipeline(orgId);
}
export async function getAISpendInsights(year?: number, orgId?: number, currency: string = "USD") {
  const cacheKey = `insights-${year || "all"}-${orgId || "all"}-${currency}`;
  const cached = aiInsightsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await repo.getAIInsightsData(year, orgId);

  const totalSpend = data.invoiceSpendTotal;
  const top3Pct = totalSpend > 0 ? Math.round((data.topSuppliers.slice(0, 3).reduce((s, v) => s + v.spend, 0) / totalSpend) * 100) : 0;
  const overBudgetItems = data.budgets.filter(b => b.utilization > 100);
  const nearBudgetItems = data.budgets.filter(b => b.utilization >= 80 && b.utilization <= 100);
  const latePct = data.payments.total > 0 ? Math.round(((data.payments.late + data.payments.overdue) / data.payments.total) * 100) : 0;
  const cur = currency;

    const prompt = `You are a senior procurement analytics advisor for an enterprise. Analyze the following procurement data for year ${data.year} and provide strategic insights.

  IMPORTANT: The organization uses ${cur} as their currency. ALL monetary amounts in your response MUST use ${cur} (e.g., "${cur} 1,000,000" not "$1,000,000"). Never use $ or any other currency symbol — always use ${cur} prefix.

  ORGANIZATION PROFILE:
  ${data.orgProfile ? `- Company: ${data.orgProfile.name} (${data.orgProfile.legalName || "N/A"})
  - Type: ${data.orgProfile.type || "N/A"}
  - Location: ${[data.orgProfile.city, data.orgProfile.state, data.orgProfile.country].filter(Boolean).join(", ") || "N/A"}
  - Currency: ${cur}` : `- Currency: ${cur}`}

  PROCUREMENT SPEND DATA:
  - Total Invoice Spend: ${cur} ${totalSpend.toLocaleString()} (${data.invoiceProcessing.totalInvoices} standard invoices)
  - Total PO Spend: ${cur} ${data.poMetrics.totalSpend.toLocaleString()} across ${data.poMetrics.total} purchase orders
  - Average PO Value: ${cur} ${data.poMetrics.avgPOValue.toLocaleString()}
  - Top 10 Suppliers by Spend: ${JSON.stringify(data.topSuppliers.map(s => ({ name: s.name, spend: `${cur} ${s.spend.toLocaleString()}`, orders: s.poCount })))}
  - Top 3 suppliers account for ${top3Pct}% of total spend
  - Spend by Category: ${JSON.stringify(data.topCategories.map(c => ({ category: c.category, spend: `${cur} ${c.spend.toLocaleString()}` })))}
  - Monthly Spend Trend: ${JSON.stringify(data.monthlyTrend.map(m => ({ month: m.month, spend: `${cur} ${m.spend.toLocaleString()}` })))}
  - Top Items Purchased (by cost): ${JSON.stringify(data.topPurchasedItems.slice(0, 15).map(i => ({ item: i.item, orderCount: i.frequency, totalCost: `${cur} ${i.totalCost.toLocaleString()}` })))}

  BUDGET DATA:
  - ${data.budgets.length} budgets total, ${overBudgetItems.length} over budget (>100%), ${nearBudgetItems.length} near limit (80-100%)
  ${overBudgetItems.length > 0 ? `- Over-budget: ${JSON.stringify(overBudgetItems.map(b => ({ name: b.name, utilization: b.utilization + "%" })))}` : ""}
  ${data.budgets.length > 0 ? `- Budget Details: ${JSON.stringify(data.budgets.map(b => ({ name: b.name, budget: `${cur} ${b.budget.toLocaleString()}`, consumed: `${cur} ${b.consumed.toLocaleString()}`, utilization: b.utilization + "%" })))}` : ""}

  PAYMENT PERFORMANCE:
  - ${data.payments.onTime} on-time, ${data.payments.late} late, ${data.payments.overdue} overdue (${latePct}% late/overdue rate)
  - Overdue Payment Amount: ${cur} ${data.payments.overdueAmount.toLocaleString()}

  REQUISITION-TO-PO PIPELINE:
  - Total PRs: ${data.prMetrics.totalPRs}, Approved: ${data.prMetrics.approvedPRs}, Rejected: ${data.prMetrics.rejectedPRs}
  - Converted to PO: ${data.prMetrics.convertedToPO} (${data.prMetrics.conversionRate}% conversion rate)
  - Total PR Value: ${cur} ${data.prMetrics.totalPRValue.toLocaleString()}
  - Avg PR Approval Time: ${data.prMetrics.avgApprovalDays} days
  - Avg PR-to-PO Cycle: ${data.prMetrics.avgPrToPoDays} days

  DELIVERY & GRN PERFORMANCE:
  - Total GRN Lines: ${data.deliveryMetrics.totalGRNLines}
  - Received: ${data.deliveryMetrics.receivedLines} lines, Rejected: ${data.deliveryMetrics.rejectedLines} lines
  - Ordered Qty: ${data.deliveryMetrics.totalOrderedQty.toLocaleString()}, Received: ${data.deliveryMetrics.totalReceivedQty.toLocaleString()}, Rejected: ${data.deliveryMetrics.totalRejectedQty.toLocaleString()}
  - Rejection Rate: ${data.deliveryMetrics.rejectionRate}%
  - Avg Delivery Time: ${data.deliveryMetrics.avgDeliveryDays} days

  INVOICE PROCESSING:
  - Total Invoices: ${data.invoiceProcessing.totalInvoices}
  - Matched: ${data.invoiceProcessing.matchedInvoices}, Mismatched: ${data.invoiceProcessing.mismatchedInvoices}, Pending Match: ${data.invoiceProcessing.pendingMatch}
  - Match Rate: ${data.invoiceProcessing.matchRate}%
  - Avg Invoice Approval Time: ${data.invoiceProcessing.avgApprovalDays} days
  - Avg Invoice-to-Payment Cycle: ${data.invoiceProcessing.avgPaymentCycleDays} days

  SUPPLIER DIVERSITY:
  - Active Suppliers (with POs): ${data.supplierDiversity.totalActiveSuppliers}
  - New Suppliers This Year: ${data.supplierDiversity.newSuppliersThisYear}
  - Returning Suppliers: ${data.supplierDiversity.returningSuppliers}

  SOURCING & BIDS DATA:
  - Total Bids: ${data.bidMetrics.totalBids} (${data.bidMetrics.rfqCount} RFQs, ${data.bidMetrics.tenderCount} Tenders, ${data.bidMetrics.rfpCount} RFPs)
  - Awarded: ${data.bidMetrics.awardedBids}, Closed: ${data.bidMetrics.closedBids}, Active: ${data.bidMetrics.activeBids}
  - Estimated Value (pre-bid): ${cur} ${data.bidMetrics.totalEstimated.toLocaleString()}
  - Awarded Value (post-bid): ${cur} ${data.bidMetrics.totalAwarded.toLocaleString()}
  - Sourcing Savings: ${cur} ${data.bidMetrics.savings.toLocaleString()} (${data.bidMetrics.savingsPercent}% savings through competitive bidding)
  - Avg Award Cycle: ${data.bidMetrics.avgAwardCycleDays} days

  CONTRACT PORTFOLIO DATA:
  - Total Active Contracts: ${data.contractMetrics.activeContracts} (${cur} ${data.contractMetrics.activeValue.toLocaleString()} total value)
  - Contracts Expiring in 90 Days: ${data.contractMetrics.expiringIn90Days}
  - Contracts Eligible for Renewal: ${data.contractMetrics.renewableCount}
  - Contracts Pending Approval/Signature: ${data.contractMetrics.pendingContracts}
  - Total Contracts (excl. Draft/Cancelled): ${data.contractMetrics.totalContracts}

  Respond in this exact JSON format:
  {
    "organizationProfile": "1-2 sentences analyzing what type of business this organization likely is, based on what they buy most (categories, items, suppliers). Describe their industry focus and procurement patterns.",
    "executiveSummary": "3-4 sentence executive summary covering overall procurement health, sourcing effectiveness, and key areas of concern",
    "spendAnomalies": [
      {"title": "short title", "description": "detailed finding", "severity": "high|medium|low", "impact": "estimated impact in ${cur}", "recommendation": "specific actionable step", "keyMetric": {"value": "79%", "label": "Overdue Rate"}}
    ],
    "savingsOpportunities": [
      {"title": "short title", "description": "detailed opportunity", "estimatedSavings": "amount in ${cur} or percentage", "effort": "low|medium|high", "recommendation": "how to capture this saving", "keyMetric": {"value": "${cur} 1.2M", "label": "Potential Savings"}}
    ],
    "riskAlerts": [
      {"title": "short title", "description": "risk description", "riskLevel": "critical|high|medium|low", "category": "concentration|compliance|financial|operational|sourcing", "mitigation": "recommended action", "keyMetric": {"value": "3", "label": "At-Risk Suppliers"}}
    ],
    "strategicRecommendations": [
      {"title": "short title", "description": "strategic recommendation", "priority": "immediate|short-term|long-term", "expectedOutcome": "expected benefit", "keyMetric": {"value": "45%", "label": "Efficiency Gain"}}
    ],
    "healthScore": {
      "overall": 0-100,
      "spending": 0-100,
      "supplierRisk": 0-100,
      "paymentDiscipline": 0-100,
      "budgetCompliance": 0-100,
      "sourcingEfficiency": 0-100
    "contractCompliance": 0-100						   
    }
  }

  IMPORTANT RULES:
  1. Provide exactly 5 items per array (spendAnomalies, savingsOpportunities, riskAlerts, strategicRecommendations).
  2. Each array MUST cover diverse procurement areas. Spread insights across: spend patterns, supplier management, sourcing/bids, requisition pipeline, delivery/GRN performance, invoice processing, payment discipline, and budget compliance.
  3. Be specific with numbers from the data — reference actual supplier names, category names, item names, and amounts in ${cur}.
  4. The organizationProfile must analyze purchasing patterns (categories, items, supplier types) to infer the business type (e.g., IT company, manufacturing, construction, facilities, retail, etc.).
  5. Do not be generic. Focus on actionable intelligence that a CPO would use to make decisions.
  6. Each insight must be unique and address a different aspect of procurement health.
  7. Health scores should reflect the actual data — low payment discipline if many overdue, low supplier risk if highly concentrated, low sourcing if few bids or low savings.
  8. ALL monetary amounts must use ${cur} currency prefix, never $ or other symbols.
  9. Consider PR-to-PO conversion rates, GRN rejection rates, invoice match rates, delivery times, and supplier diversity in your analysis.
  10. Every insight MUST include a keyMetric with a numeric "value" (a percentage, amount, count, or days) and a short "label". The value should be the most impactful number from that insight (e.g., "79%", "${cur} 2.5M", "14 days", "3 suppliers"). This is displayed as a headline metric.`;

  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const insights = JSON.parse(content);
    insights.generatedAt = new Date().toISOString();
    insights.dataContext = {
      year: data.year,
      totalSpend: totalSpend,
      supplierCount: data.supplierDiversity.totalActiveSuppliers,
      poCount: data.poMetrics.total,
      invoiceCount: data.invoiceProcessing.totalInvoices,
      totalBids: data.bidMetrics.totalBids,
      sourcingSavings: data.bidMetrics.savings,
      sourcingSavingsPercent: data.bidMetrics.savingsPercent,
      prCount: data.prMetrics.totalPRs,
      prConversionRate: data.prMetrics.conversionRate,
      invoiceMatchRate: data.invoiceProcessing.matchRate,
      grnLines: data.deliveryMetrics.totalGRNLines,
      grnRejectionRate: data.deliveryMetrics.rejectionRate,
      avgPaymentCycleDays: data.invoiceProcessing.avgPaymentCycleDays,
      avgDeliveryDays: data.deliveryMetrics.avgDeliveryDays,
      activeSuppliers: data.supplierDiversity.totalActiveSuppliers,
      newSuppliers: data.supplierDiversity.newSuppliersThisYear,
	   activeContracts: data.contractMetrics.activeContracts,
      contractValue: data.contractMetrics.activeValue,
      contractsExpiringSoon: data.contractMetrics.expiringIn90Days,
    };

    aiInsightsCache.set(cacheKey, { data: insights, timestamp: Date.now() });
    return insights;
  } catch (error: any) {
    console.error("AI Insights generation error:", error);
    throw new Error("Failed to generate AI insights: " + (error?.message || "Unknown error"));
  }
}
