import { getAIClient, getAIModelName } from "./ai-client";
import { db } from "../db";
import { sql } from "drizzle-orm";

/** Matches PUBLISHED_BID_SECTION_STATUSES in client bids list (Published tab, not Draft). */
const PUBLISHED_HISTORICAL_BID_STATUSES = [
  "Published",
  "Closed",
  "Awarded",
  "Cancelled",
  "Finally Closed",
  "On Hold",
  "Award Under Process",
  "Finalize",
  "Under Cancel",
  "Rejected",
] as const;

export interface BidStrategyResult {
  recommendedType: string | null;
  recommendedTypeCount: number;
  recommendedDuration: number | null;
  /** Avg of per-supplier (responses / invitations) across historical bids; null when not applicable. */
  avgResponseRate: number | null;
  /** True when invited suppliers exist and avg response rate should be shown. */
  showAvgResponseRate: boolean;
  avgVendorCount: number;
  pricingInsight: string;
  reasoning: string;
  historicalBids: number;
  tips: string[];
}

function buildItemDescriptionMatchCondition(itemDescriptions: string[]) {
  const itemList = itemDescriptions.filter((d) => d && d.trim());
  if (itemList.length === 0) return sql``;
  return sql`AND (${sql.join(
    itemList.map(
      (d) => sql`LOWER(TRIM(l.description)) = LOWER(TRIM(${d.trim()}))`,
    ),
    sql` OR `,
  )})`;
}

function publishedBidStatusWhere() {
  return sql`b.status IN (${sql.join(
    PUBLISHED_HISTORICAL_BID_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  )})`;
}

/** Avg of each invited supplier's historical response rate (responses / invitations), not line-item scoped. */
async function computeAvgResponseRateForSuppliers(
  supplierIds: number[],
): Promise<number | null> {
  const ids = Array.from(new Set(supplierIds.filter((id) => id > 0)));
  if (ids.length === 0) return null;

  const publishedStatusWhere = publishedBidStatusWhere();
  const result = await db.execute(sql`
    WITH requested_suppliers AS (
      SELECT unnest(ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::int[]) AS supplier_id
    ),
    invitation_counts AS (
      SELECT s.supplier_id, COUNT(*)::int AS invitation_count
      FROM dbo.supp_bid_supplier_dtls s
      INNER JOIN dbo.supp_bid_dtls b ON b.id = s.bidrefno
      WHERE s.supplier_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        AND (s.status IS NULL OR s.status != 'Deleted')
        AND ${publishedStatusWhere}
      GROUP BY s.supplier_id
    ),
    response_counts AS (
      SELECT r.supplier_id, COUNT(*)::int AS response_count
      FROM dbo.supp_bid_response_dtls r
      INNER JOIN dbo.supp_bid_dtls b ON b.id = r.bidrefno
      WHERE r.supplier_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        AND r.status != 'Deleted'
        AND ${publishedStatusWhere}
      GROUP BY r.supplier_id
    ),
    supplier_rates AS (
      SELECT
        rs.supplier_id,
        CASE
          WHEN COALESCE(ic.invitation_count, 0) > 0
          THEN (COALESCE(rc.response_count, 0)::float / ic.invitation_count * 100)
          ELSE NULL
        END AS response_rate
      FROM requested_suppliers rs
      LEFT JOIN invitation_counts ic ON ic.supplier_id = rs.supplier_id
      LEFT JOIN response_counts rc ON rc.supplier_id = rs.supplier_id
    )
    SELECT ROUND(AVG(response_rate)::numeric, 1) AS avg_response_rate
    FROM supplier_rates
    WHERE response_rate IS NOT NULL
  `);

  const row = result.rows[0] as { avg_response_rate?: string | null };
  if (row?.avg_response_rate == null) return null;
  return parseFloat(row.avg_response_rate);
}

export async function analyzeBidStrategy(data: {
  categories: string[];
  itemDescriptions: string[];
  supplierIds?: number[];
  estimatedValue?: number;
}): Promise<BidStrategyResult> {
  const categoryList = data.categories.filter((c) => c && c.trim());
  const itemList = data.itemDescriptions.filter((d) => d && d.trim());
  const itemDescriptionList = Array.from(new Set(
    data.itemDescriptions.map(d => d?.trim()).filter(Boolean)
  ));
  const itemCondition = buildItemDescriptionMatchCondition(data.itemDescriptions);

  const historyByTypeSql = (statusWhere: ReturnType<typeof sql>) => sql`
    SELECT 
      b.type,
      COUNT(DISTINCT b.id) as bid_count,
      AVG(EXTRACT(DAY FROM b.enddate - b.startdate)) as avg_duration,
      AVG(resp.resp_count) as avg_responses,
      AVG(supp.supp_count) as avg_vendors
    FROM dbo.supp_bid_dtls b
    LEFT JOIN (
      SELECT bidrefno, COUNT(*) as resp_count FROM dbo.supp_bid_response_dtls GROUP BY bidrefno
    ) resp ON resp.bidrefno = b.id
    LEFT JOIN (
      SELECT bidrefno, COUNT(*) as supp_count FROM dbo.supp_bid_supplier_dtls GROUP BY bidrefno
    ) supp ON supp.bidrefno = b.id
    WHERE ${statusWhere}
    AND EXISTS (
      SELECT 1 FROM dbo.supp_bid_line_dtls l
      WHERE l.bidrefno = b.id
      AND l.description IS NOT NULL
      AND TRIM(l.description) <> ''
      ${itemCondition}
    )
    GROUP BY b.type
    ORDER BY bid_count DESC
  `;

  const publishedStatusWhere = publishedBidStatusWhere();

  const totalHistoricalResult = await db.execute(sql`
    SELECT COUNT(DISTINCT b.id) as bid_count
    FROM dbo.supp_bid_dtls b
    WHERE ${publishedStatusWhere}
  `);
  const totalHistoricalBids = parseInt(
    (totalHistoricalResult.rows[0] as { bid_count?: string })?.bid_count || "0",
    10,
  );

  const historyResult = await db.execute(
    historyByTypeSql(publishedStatusWhere),
  );
  const historyRows = historyResult.rows as any[];
  const bestTypeRow = historyRows[0];
  const recommendedType = bestTypeRow?.type ?? null;
  const recommendedTypeCount = bestTypeRow
    ? parseInt(bestTypeRow.bid_count || "0", 10)
    : 0;

  const durationResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT b.id) as bid_count,
      AVG(EXTRACT(DAY FROM b.enddate - b.startdate)) as avg_duration
    FROM dbo.supp_bid_dtls b
    WHERE ${publishedStatusWhere}
    AND b.startdate IS NOT NULL
    AND b.enddate IS NOT NULL
  `);
  const durationRow = durationResult.rows[0] as any;
  const durationBidCount = parseInt(durationRow?.bid_count || "0", 10);
  const recommendedDuration =
    durationBidCount > 0 && durationRow?.avg_duration != null
      ? Math.round(parseFloat(durationRow.avg_duration))
      : null;

  if (totalHistoricalBids === 0) {
    const categoryHint = categoryList.length > 0
      ? ` for categories: ${categoryList.join(', ')}`
      : '';
    throw { status: 422, message: `No historical bid data found${categoryHint}. Complete and close more bids so the advisor has enough data to work with.` };
  }

  const priceHistory = itemDescriptionList.length > 0
    ? await db.execute(sql`
      WITH current_items(item_description) AS (
        VALUES ${sql.join(itemDescriptionList.map(item => sql`(${item})`), sql`, `)}
      )
      SELECT
        ci.item_description,
        ROUND(AVG(rl.bidprice)::numeric, 2) as avg_price,
        MIN(rl.bidprice) as min_price,
        MAX(rl.bidprice) as max_price,
        COUNT(*) as price_count
      FROM current_items ci
      JOIN dbo.supp_bid_line_dtls l
        ON LOWER(TRIM(l.description)) = LOWER(TRIM(ci.item_description))
      JOIN dbo.supp_bid_dtls b ON b.id = l.bidrefno
      JOIN dbo.supp_bid_response_line_dtls rl ON rl.bid_line_id = l.id
      WHERE b.status NOT IN ('Draft', 'Deleted')
      AND rl.bidprice IS NOT NULL
      AND rl.bidprice > 0
      GROUP BY ci.item_description
      ORDER BY ci.item_description
    `)
    : { rows: [] };

  const priceRows = priceHistory.rows as any[];
  const pricingContext = priceRows.length > 0
    ? `Historical pricing for current bid items only:\n${priceRows.map(r => `- ${r.item_description}: Avg ${r.avg_price}, Min ${r.min_price}, Max ${r.max_price} (${r.price_count} historical prices)`).join('\n')}`
    : 'Historical pricing for current bid items only: No matching historical item-level pricing found.';

  const supplierIds = (data.supplierIds ?? []).filter((id) => id > 0);
  const showAvgResponseRate = supplierIds.length > 0;
  const avgResponseRate = showAvgResponseRate
    ? await computeAvgResponseRateForSuppliers(supplierIds)
    : null;

  const strategyPrompt = `You are a procurement strategy advisor. Based on this historical bid data, recommend the best bid strategy.

Historical Data by Bid Type:
${historyRows.map(r => `- ${r.type}: ${r.bid_count} bids, avg duration ${Math.round(r.avg_duration || 7)} days, avg ${Math.round(r.avg_responses || 0)} responses from ${Math.round(r.avg_vendors || 0)} vendors`).join('\n')}
${showAvgResponseRate && avgResponseRate != null ? `Invited suppliers avg historical response rate: ${avgResponseRate}% (responses / invitations per supplier, averaged).` : ''}

Categories: ${categoryList.join(', ') || 'General'}
Items: ${data.itemDescriptions.slice(0, 5).join(', ')}
${pricingContext}
${data.estimatedValue ? `Estimated value: ${data.estimatedValue}` : ''}
Total historical bids found: ${totalHistoricalBids}

Return JSON with:
{
  "recommendedType": "RFQ" or "RFP" or "Tender",
  "recommendedDuration": number of days (integer),
  "pricingInsight": "brief pricing guidance using only the item-level historical avg_price, min_price, and max_price above",
  "reasoning": "2-3 sentence explanation of why this type and duration",
  "tips": ["tip1", "tip2", "tip3"] - practical tips for this bid
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      {
        role: "system",
        content:
          "You are an AI procurement strategy advisor. Analyze bid history and recommend optimal strategies. Return valid JSON only.",
      },
      { role: "user", content: strategyPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI analysis returned empty response" };

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw { status: 500, message: "AI returned invalid response format" };
  }

  return {
    recommendedType,
    recommendedTypeCount,
    recommendedDuration,
    avgResponseRate,
    showAvgResponseRate,
    avgVendorCount: bestTypeRow
      ? Math.round(parseFloat(bestTypeRow.avg_vendors || "0"))
      : 0,
    pricingInsight: parsed.pricingInsight || "",
    reasoning: parsed.reasoning || "",
    historicalBids: totalHistoricalBids,
    tips: parsed.tips || [],
  };
}

export interface VendorRecommendation {
  supplierId: number;
  supplierName: string;
  supplierSite: string;
  contactName: string;
  contactEmail: string;
  score: number;
  reasons: string[];
  pastBidsParticipated: number;
  pastBidsWon: number;
  avgResponseTime: string;
  categoryMatch: boolean;
}

function normalizeSupplierName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeVendorsByCompany(vendors: any[]): any[] {
  const seenCompanyNames = new Set<string>();

  return vendors.filter((vendor) => {
    const companyKey = normalizeSupplierName(vendor.supplier_name);
    const dedupeKey = companyKey || `supplier:${vendor.supplier_id}`;
    if (seenCompanyNames.has(dedupeKey)) return false;

    seenCompanyNames.add(dedupeKey);
    return true;
  });
}

function dedupeRecommendationsByCompany(recommendations: VendorRecommendation[]): VendorRecommendation[] {
  const seenCompanyNames = new Set<string>();

  return recommendations.filter((recommendation) => {
    const companyKey = normalizeSupplierName(recommendation.supplierName);
    const dedupeKey = companyKey || `supplier:${recommendation.supplierId}`;
    if (seenCompanyNames.has(dedupeKey)) return false;

    seenCompanyNames.add(dedupeKey);
    return true;
  });
}

function buildVendorRecommendation(
  vendor: any,
  ranking?: { score?: number; reasons?: string[] },
): VendorRecommendation {
  const bidsParticipated = parseInt(vendor.bids_participated) || 0;
  const bidsWon = parseInt(vendor.bids_won) || 0;
  const bidsResponded = parseInt(vendor.bids_responded) || 0;
  const avgScore = parseFloat(vendor.avg_score) || 0;
  const responseRate = bidsParticipated > 0 ? bidsResponded / bidsParticipated : 0;
  const fallbackScore = Math.min(
    100,
    Math.round((bidsWon * 15) + (responseRate * 35) + (avgScore * 0.5)),
  );

  return {
    supplierId: parseInt(vendor.supplier_id),
    supplierName: vendor.supplier_name,
    supplierSite: vendor.supplier_site || "",
    contactName: vendor.contact_name || "",
    contactEmail: vendor.contact_email || "",
    score: ranking?.score ?? fallbackScore,
    reasons: ranking?.reasons?.length
      ? ranking.reasons
      : [
        bidsParticipated > 0 ? `Participated in ${bidsParticipated} bids` : "No bids participated",
        bidsResponded > 0 ? `${bidsResponded} responses submitted` : "No responses",
        bidsWon > 0 ? `Won ${bidsWon} bids` : "No wins",
      ],
    pastBidsParticipated: bidsParticipated,
    pastBidsWon: bidsWon,
    avgResponseTime: "N/A",
    categoryMatch: true,
  };
}

function buildScopeOfSupplyMatchCondition(categories: string[], itemDescriptions: string[]) {
  const terms = Array.from(
    new Set([...categories, ...itemDescriptions].map((t) => t?.trim()).filter(Boolean)),
  );
  if (terms.length === 0) return sql``;

  const termConditions = terms.map((term) => {
    const pattern = `%${term.toLowerCase()}%`;
    return sql`(
      LOWER(TRIM(ssc.category_code)) LIKE ${pattern}
      OR LOWER(TRIM(ssc.sub_category)) LIKE ${pattern}
      OR LOWER(TRIM(ssc.service_details)) LIKE ${pattern}
      OR LOWER(TRIM(ssc.good_service_code)) LIKE ${pattern}
    )`;
  });

  return sql`
    AND EXISTS (
      SELECT 1
      FROM dbo.supp_scope_of_supply_service ssc
      WHERE ssc.supplier_id = s.id
      AND (${sql.join(termConditions, sql` OR `)})
    )
  `;
}

async function fetchActiveVendorCandidates(bidId: number, scopeMatchCondition: ReturnType<typeof sql>) {
  const vendorPerformance = await db.execute(sql`
    WITH vendor_stats AS (
      SELECT 
        r.supplier_id,
        r.supplier_name,
        COUNT(DISTINCT r.bidrefno) as bids_participated,
        COUNT(DISTINCT CASE WHEN r.status = 'Submitted' THEN r.bidrefno END) as bids_responded,
        COUNT(DISTINCT a.id) as bids_won,
        AVG(CASE WHEN r.total_score IS NOT NULL AND r.total_score != '' THEN r.total_score::numeric ELSE NULL END) as avg_score
      FROM dbo.supp_bid_response_dtls r
      LEFT JOIN dbo.supp_bid_award_dtls a ON a.bid_resp_no = r.id AND a.status NOT IN ('Rejected', 'Cancelled')
      GROUP BY r.supplier_id, r.supplier_name
    ),
    already_invited AS (
      SELECT supplier_id, LOWER(TRIM(supplier_name)) as supplier_name_key
      FROM dbo.supp_bid_supplier_dtls
      WHERE bidrefno = ${bidId}
    )
    SELECT 
      s.id as supplier_id,
      s.company_name as supplier_name,
      COALESCE(s.purchase_site, '') as supplier_site,
      COALESCE(con.contact_name, '') as contact_name,
      COALESCE(NULLIF(TRIM(s.email_id), ''), '') as contact_email,
      COALESCE(vs.bids_participated, 0) as bids_participated,
      COALESCE(vs.bids_responded, 0) as bids_responded,
      COALESCE(vs.bids_won, 0) as bids_won,
      COALESCE(vs.avg_score, 0) as avg_score
    FROM dbo.supp_basic_org_dtls s
    LEFT JOIN vendor_stats vs ON vs.supplier_id = s.id
    LEFT JOIN dbo.supp_contact_dtls con ON con.supplier_id = s.id AND con.is_primary = 'Yes'
    WHERE s.status IN ('Active', 'Changes In Draft')
    AND s.attribute_4 = 'Active'
    ${scopeMatchCondition}
    AND s.id NOT IN (SELECT supplier_id FROM already_invited)
    AND LOWER(TRIM(s.company_name)) NOT IN (
      SELECT supplier_name_key
      FROM already_invited
      WHERE supplier_name_key IS NOT NULL AND supplier_name_key != ''
    )
    ORDER BY vs.bids_won DESC NULLS LAST, vs.bids_participated DESC NULLS LAST, vs.avg_score DESC NULLS LAST
    LIMIT 20
  `);

  return dedupeVendorsByCompany(vendorPerformance.rows as any[]);
}

export async function getSmartVendorRecommendations(data: {
  bidId: number;
  categories: string[];
  itemDescriptions: string[];
}): Promise<VendorRecommendation[]> {
  const categoryList = Array.from(new Set(data.categories.map(c => c?.trim()).filter(Boolean)));
  const hasScopeFilter =
    categoryList.length > 0 || data.itemDescriptions.some((d) => String(d || "").trim());
  const scopeMatchCondition = buildScopeOfSupplyMatchCondition(categoryList, data.itemDescriptions);

  let vendors = await fetchActiveVendorCandidates(data.bidId, scopeMatchCondition);
  if (vendors.length === 0 && hasScopeFilter) {
    vendors = await fetchActiveVendorCandidates(data.bidId, sql``);
  }

  if (vendors.length === 0) return [];
  const fallbackRecommendations = vendors
    .slice(0, 10)
    .map((vendor) => buildVendorRecommendation(vendor));

  const prompt = `You are a procurement vendor selection advisor. Rank these vendors for a bid with items in categories: ${categoryList.join(', ') || 'General'}.
Items: ${data.itemDescriptions.slice(0, 5).join(', ')}

Vendors:
${vendors.map((v, i) => `${i + 1}. ${v.supplier_name} (ID:${v.supplier_id}) - ${v.bids_participated} bids participated, ${v.bids_responded} responded, ${v.bids_won} won, avg score: ${v.avg_score}`).join('\n')}

For each vendor, return a JSON array with objects:
{
  "supplierId": number,
  "score": 1-100 (overall recommendation score),
  "reasons": ["reason1", "reason2"] - why this vendor is recommended
}
Return as: { "rankings": [...] }
Sort by score descending. Only include top 10.`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: "You are an AI vendor selection advisor for procurement. Analyze vendor performance and recommend the best vendors. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return fallbackRecommendations;

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return fallbackRecommendations;
  }
  const rankings = parsed.rankings || [];
  const rankedRecommendations = rankings.map((r: any) => {
    const vendor = vendors.find((v: any) => v.supplier_id === r.supplierId || parseInt(v.supplier_id) === r.supplierId);
    if (!vendor) return null;
    return buildVendorRecommendation(vendor, {
      score: r.score || 0,
      reasons: r.reasons || [],
    });
  }).filter(Boolean) as VendorRecommendation[];

  const rankedSupplierIds = new Set(rankedRecommendations.map((r) => r.supplierId));
  const remainingRecommendations = fallbackRecommendations.filter(
    (recommendation) => !rankedSupplierIds.has(recommendation.supplierId),
  );

  return dedupeRecommendationsByCompany([
    ...rankedRecommendations,
    ...remainingRecommendations,
  ]).slice(0, 10);
}

export interface GeneratedRequirement {
  category: string;
  question: string;
  value: string;
  qvtype: string;
  weight: number;
  lovOptions: string[];
}

export interface EvaluationTeamCandidate {
  id: number;
  name: string;
  user_name?: string | null;
  email_id?: string | null;
  contact?: string | null;
  department?: string | null;
  roles?: Array<{
    role_name: string;
    role_description: string | null;
    role_type: string | null;
  }>;
  teamCounts: Record<string, number>;
  totalAssignments: number;
  randomScore?: number;
}

export function isFinanceUser(c: EvaluationTeamCandidate | undefined): boolean {
  if (!c) return false;
  // Only check roles, department is NOT considered
  const roles = c.roles || [];
  for (const r of roles) {
    const roleName = String(r.role_name || "").trim().toLowerCase();
    const roleDesc = String(r.role_description || "").trim().toLowerCase();
    const roleType = String(r.role_type || "").trim().toLowerCase();
    if (
      roleName.includes("finance") ||
      roleDesc.includes("finance") ||
      roleType.includes("finance")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a candidate is eligible for Commercial teams.
 * Only: Procurement Officer, Procurement Manager, Finance Officer, Finance Manager.
 */
export function isCommercialTeamEligible(c: EvaluationTeamCandidate | undefined): boolean {
  if (!c) return false;
  const allowedRoles = [
    "procurement_officer", "procurement_manager",
    "finance_officer", "finance_manager",
  ];
  const roles = c.roles || [];
  for (const r of roles) {
    const roleName = String(r.role_name || "").trim().toLowerCase().replace(/\s+/g, "_");
    for (const allowed of allowedRoles) {
      if (roleName.includes(allowed)) return true;
    }
  }
  return false;
}

/**
 * Check if a candidate has a Supplier User role. These users are excluded from all teams.
 */
export function isSupplierUser(c: EvaluationTeamCandidate | undefined): boolean {
  if (!c) return false;
  const roles = c.roles || [];
  for (const r of roles) {
    const roleName = String(r.role_name || "").trim().toLowerCase();
    if (roleName.includes("supplier")) return true;
  }
  return false;
}

/**
 * Calculate a suitability score for a candidate for technical teams.
 * Matches keywords from the bid's scope of work items, categories, and
 * evaluation criteria questions against the candidate's role_name and role_description.
 * Higher score = more suitable.
 */
function calculateTechnicalSuitabilityScore(
  candidate: EvaluationTeamCandidate,
  scopeOfWork: Array<{ itemName: string; category: string }>,
  evaluationCriteria: Array<{ category: string; question: string; weight: number }>,
  categories: string[],
): number {
  // Build a set of keywords from the bid context
  const bidTexts: string[] = [];
  for (const item of scopeOfWork) {
    if (item.itemName) bidTexts.push(item.itemName.toLowerCase());
    if (item.category) bidTexts.push(item.category.toLowerCase());
  }
  for (const crit of evaluationCriteria) {
    if (crit.question) bidTexts.push(crit.question.toLowerCase());
    if (crit.category) bidTexts.push(crit.category.toLowerCase());
  }
  for (const cat of categories) {
    if (cat) bidTexts.push(cat.toLowerCase());
  }

  // Extract keywords (words with 3+ chars) from bid context
  const bidKeywords = new Set<string>();
  for (const text of bidTexts) {
    const words = text.split(/[\s,;.\-_\/()\[\]{}]+/).filter(w => w.length >= 3);
    for (const w of words) bidKeywords.add(w);
  }

  if (bidKeywords.size === 0) return 0;

  // Build candidate text from roles only
  const candidateTexts: string[] = [];
  for (const r of (candidate.roles || [])) {
    if (r.role_name) candidateTexts.push(r.role_name.toLowerCase());
    if (r.role_description) candidateTexts.push(r.role_description.toLowerCase());
    if (r.role_type) candidateTexts.push(r.role_type.toLowerCase());
  }
  const candidateStr = candidateTexts.join(" ");

  // Count keyword matches
  let score = 0;
  for (const keyword of Array.from(bidKeywords)) {
    if (candidateStr.includes(keyword)) {
      score += 1;
    }
  }

  return score;
}

function buildFallbackTeamSuggestions(
  candidates: EvaluationTeamCandidate[],
  teamNeeds: Record<string, number>,
  scopeOfWork: Array<{ itemName: string; category: string }> = [],
  evaluationCriteria: Array<{ category: string; question: string; weight: number }> = [],
  categories: string[] = [],
): Record<string, number[]> {
  const teamTypes = Object.keys(teamNeeds);
  const fallback: Record<string, number[]> = {};

  for (const teamType of teamTypes) {
    const isCommercial = teamType === "Commercial Review Team" || teamType === "Commercial Approve Team";
    const isCommittee = teamType === "Committee Team";
    const isTechnical = teamType === "Technical Review Team" || teamType === "Technical Approve Team";
    
    // Filter by role: commercial teams get specific roles only, EXCLUDE finance-role users for Committee Team
    let eligibleCandidates = [...candidates];
    if (isCommercial) {
      eligibleCandidates = candidates.filter((c) => isCommercialTeamEligible(c));
    } else if (isCommittee) {
      eligibleCandidates = candidates.filter((c) => !isFinanceUser(c));
    } else if (isTechnical) {
      eligibleCandidates = candidates.filter((c) => !isFinanceUser(c));
    }

    const ranked = eligibleCandidates.sort((a, b) => {
      // For commercial teams, shuffle finance-role users randomly
      if (isCommercial) {
        return (a.randomScore || 0) - (b.randomScore || 0);
      }

      // For technical teams, sort by suitability score (descending) first
      if (isTechnical) {
        const aScore = calculateTechnicalSuitabilityScore(a, scopeOfWork, evaluationCriteria, categories);
        const bScore = calculateTechnicalSuitabilityScore(b, scopeOfWork, evaluationCriteria, categories);
        if (bScore !== aScore) return bScore - aScore;
      }

      const aCount = a.teamCounts[teamType] || 0;
      const bCount = b.teamCounts[teamType] || 0;
      if (bCount !== aCount) return bCount - aCount;
      if (b.totalAssignments !== a.totalAssignments) {
        return b.totalAssignments - a.totalAssignments;
      }
      return (a.randomScore || 0) - (b.randomScore || 0);
    });

    // Fallback: If eligible candidates are fewer than required count for this team,
    // append remaining candidates so that required count is met
    const neededCount = teamNeeds[teamType] || 1;
    if (ranked.length < neededCount) {
      const selectedIds = new Set(ranked.map((c) => c.id));
      const remainingCandidates = candidates
        .filter((c) => !selectedIds.has(c.id))
        .sort((a, b) => (a.randomScore || 0) - (b.randomScore || 0));
      ranked.push(...remainingCandidates);
    }

    fallback[teamType] = ranked.map((c) => c.id);
  }

  return fallback;
}

export async function suggestEvaluationTeam(data: {
  bidTitle: string;
  bidType: string;
  categories: string[];
  scopeOfWork?: Array<{ itemName: string; category: string }>;
  evaluationCriteria?: Array<{ category: string; question: string; weight: number }>;
  teamNeeds: Record<string, number>;
  candidates: EvaluationTeamCandidate[];
}): Promise<Record<string, number[]>> {
  const teamTypes = Object.keys(data.teamNeeds);
  if (teamTypes.length === 0 || data.candidates.length === 0) {
    return {};
  }

  // Assign randomScore to each candidate for this suggestion run to support rotation
  // Also filter out Supplier User role from all teams
  const candidatesWithRandom = data.candidates
    .filter((c) => !isSupplierUser(c))
    .map((c) => ({
      ...c,
      randomScore: Math.random(),
    }));

  const scopeOfWork = data.scopeOfWork || [];
  const evaluationCriteria = data.evaluationCriteria || [];
  const categories = data.categories || [];

  const fallback = buildFallbackTeamSuggestions(candidatesWithRandom, data.teamNeeds, scopeOfWork, evaluationCriteria, categories);
  const candidateIdSet = new Set(candidatesWithRandom.map((c) => c.id));
  
  // Separate commercial-eligible users so they are always included for commercial teams
  const commercialEligibleCandidates = candidatesWithRandom.filter((c) => isCommercialTeamEligible(c));
  const nonCommercialCandidates = candidatesWithRandom.filter((c) => !isCommercialTeamEligible(c));

  // Sort non-finance candidates by technical suitability score (descending),
  // then by totalAssignments, then by randomScore as tie-breaker
  const nonCommercialSorted = [...nonCommercialCandidates]
    .sort((a, b) => {
      const aScore = calculateTechnicalSuitabilityScore(a, scopeOfWork, evaluationCriteria, categories);
      const bScore = calculateTechnicalSuitabilityScore(b, scopeOfWork, evaluationCriteria, categories);
      if (bScore !== aScore) return bScore - aScore;
      if (b.totalAssignments !== a.totalAssignments) {
        return b.totalAssignments - a.totalAssignments;
      }
      return a.randomScore - b.randomScore;
    });

  // Always include all commercial-eligible users + top suitability-scored other candidates (up to 60 total)
  const remainingSlots = Math.max(0, 60 - commercialEligibleCandidates.length);
  const candidatesForPromptSorted = [
    ...commercialEligibleCandidates,
    ...nonCommercialSorted.slice(0, remainingSlots),
  ];

  // Shuffle the final candidates for prompt to prevent position bias in LLM suggestion
  const candidatesForPrompt = [...candidatesForPromptSorted].sort(
    (a, b) => a.randomScore - b.randomScore
  );

  const scopeOfWorkStr = scopeOfWork
    .map(line => `- Item: "${line.itemName}" (Category: "${line.category || "General"}")`)
    .join("\n") || "- No specific items listed";

  const evaluationCriteriaStr = evaluationCriteria
    .map(line => `- [${line.category}] ${line.question} (Weight: ${line.weight})`)
    .join("\n") || "- No specific evaluation criteria listed";

  const prompt = `You are a procurement evaluation team advisor. Select team members for a ${data.bidType} bid.

Bid title: ${data.bidTitle}
Categories: ${categories.join(", ") || "General"}
Scope of Work Items and Categories:
${scopeOfWorkStr}

Evaluation Criteria (Requirements):
${evaluationCriteriaStr}

Team needs (select exactly these counts if possible):
${teamTypes.map((t) => `- ${t}: ${data.teamNeeds[t]}`).join("\n")}

Rules:
- Use ONLY the candidate IDs provided.
- Do NOT select the same person for multiple teams.
- IGNORE the "department" field entirely. All decisions must be based ONLY on the candidate's roles (role_name, role_description, role_type).
- Do NOT select any candidate whose role_name contains "Supplier". Exclude all Supplier users from every team.
- For "Commercial Review Team" and "Commercial Approve Team": you MUST ONLY select candidates who have one of these roles: ROLE_PROCUREMENT_OFFICER, ROLE_PROCUREMENT_MANAGER, ROLE_FINANCE_OFFICER, or ROLE_FINANCE_MANAGER. Do NOT select candidates with any other role for commercial teams.
- For "Committee Team": you MUST NOT select candidates who have any Finance-related role (role_name contains "finance"). Strictly exclude all candidates with finance-related roles from Committee Team.
- For "Technical Review Team" and "Technical Approve Team": you MUST select the most suitable candidates by analyzing how well each candidate's role_name and role_description match the bid's Scope of Work Items and Evaluation Criteria questions/requirements. Pick candidates whose role descriptions demonstrate relevant technical expertise for the specific items and criteria of this bid. Do NOT select randomly.
- Prefer candidates with higher past assignments for the same team type (except for commercial teams, where any eligible user is acceptable).
- If there are not enough candidates select other eligible candidates to fill the team, but do not exceed or leave the requested count for any team.
- If there are not enough eligible candidates for a team, return as many as possible without exceeding the requested count.
- for technical teams select one ,commercial team select one,committee team select three manadatory, and if there are not enough eligible candidates for a team, return as many as possible without exceeding the requested count.

Candidates (id, name, roles, totalAssignments, teamCounts):
${candidatesForPrompt
  .map(
    (c) => {
      const rolesStr = (c.roles || []).map(r => `[Name: ${r.role_name}, Description: ${r.role_description || "N/A"}, Type: ${r.role_type || "N/A"}]`).join(", ");
      return `- {id:${c.id}, name:"${String(c.name).replace(/"/g, "'")}", roles: "${rolesStr}", totalAssignments:${c.totalAssignments}, teamCounts:${JSON.stringify(c.teamCounts)}}`;
    }
  )
  .join("\n")}

Return JSON only in this shape:
{
  "suggestions": {
    "Technical Review Team": [1,2],
    "Commercial Review Team": [3,4],
    "Technical Approve Team": [5,6],
    "Commercial Approve Team": [7,8],
    "Committee Team": [9,10,11]
  }
}`;

  try {
    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [
        {
          role: "system",
          content:
            "You are an AI procurement evaluation team advisor. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallback;

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return fallback;
    }

    const suggestionBlock = parsed.suggestions || parsed.teamSuggestions || parsed;
    const used = new Set<number>();
    const cleaned: Record<string, number[]> = {};

    for (const teamType of teamTypes) {
      const raw = Array.isArray(suggestionBlock?.[teamType])
        ? suggestionBlock[teamType]
        : [];
      const teamIds: number[] = [];

      for (const rawId of raw) {
        const id = Number(rawId);
        if (!Number.isFinite(id) || !candidateIdSet.has(id)) continue;
        if (used.has(id)) continue;

        // Strictly enforce: Commercial teams must ONLY have eligible roles
        if (teamType === "Commercial Review Team" || teamType === "Commercial Approve Team") {
          const candidate = candidatesWithRandom.find((c) => c.id === id);
          if (!isCommercialTeamEligible(candidate)) continue;
        }

        // Strictly enforce: Committee Team must NOT have Finance users
        if (teamType === "Committee Team") {
          const candidate = candidatesWithRandom.find((c) => c.id === id);
          if (isFinanceUser(candidate)) continue;
        }

        teamIds.push(id);
        used.add(id);
        if (teamIds.length >= data.teamNeeds[teamType]) break;
      }

      cleaned[teamType] = teamIds;
    }

    for (const teamType of teamTypes) {
      const needed = data.teamNeeds[teamType];
      const existing = cleaned[teamType] || [];

      // Walk the full fallback ranking so the array carries spares past
      // `needed`, for the caller to try if a primary pick is rejected
      // downstream. Spares beyond `needed` are not marked `used` here, so
      // they stay available to sibling roles sharing this eligibility pool.
      const fallbackIds = fallback[teamType] || [];
      for (const id of fallbackIds) {
        if (used.has(id)) continue;

        // Strictly enforce: Commercial teams must ONLY have eligible roles
        if (teamType === "Commercial Review Team" || teamType === "Commercial Approve Team") {
          const candidate = candidatesWithRandom.find((c) => c.id === id);
          if (!isCommercialTeamEligible(candidate)) continue;
        }

        // Strictly enforce: Committee Team must NOT have Finance users
        if (teamType === "Committee Team") {
          const candidate = candidatesWithRandom.find((c) => c.id === id);
          if (isFinanceUser(candidate)) continue;
        }

        existing.push(id);
        if (existing.length <= needed) used.add(id);
      }

      // Fallback: If any team is still under the required count,
      // autofill remaining slots
      if (existing.length < needed) {
        const remainingCandidates = candidatesWithRandom
          .filter((c) => !used.has(c.id) && !existing.includes(c.id))
          .sort((a, b) => (a.randomScore || 0) - (b.randomScore || 0));

        for (const c of remainingCandidates) {
          if (existing.length >= needed) break;
          existing.push(c.id);
          used.add(c.id);
        }
      }

      cleaned[teamType] = existing;
    }

    return cleaned;
  } catch {
    return fallback;
  }
}

export async function generateBidRequirements(data: {
  categories: string[];
  itemDescriptions: string[];
  bidType: string;
  existingCount: number;
  remainingWeight: number;
  existingQuestions: string[];
  documentText?: string;
}): Promise<GeneratedRequirement[]> {
  const categoryList = data.categories.filter(c => c && c.trim());
  const remainingWeight = data.remainingWeight;

  // If remaining weight is too small to generate even one question, return empty
  if (remainingWeight < 1) {
    return [];
  }

  // Upper bound only — each criterion needs at least 1 weight point, so the most
  // criteria we could ever fit is `remainingWeight`. Within that ceiling the model
  // decides how many are genuinely relevant (even a single one is acceptable).
  const maxCount = remainingWeight;

  // Fetch past requirements from similar awarded/closed bids for context
  const pastRequirements = await db.execute(sql`
    SELECT DISTINCT r.category, r.question, r.qvtype, r.weight
    FROM dbo.supp_bid_requirement_dtls r
    JOIN dbo.supp_bid_dtls b ON r.bidrefno = b.id
    JOIN dbo.supp_bid_line_dtls l ON l.bidrefno = b.id
    WHERE b.status IN ('Awarded', 'Closed', 'Award Under Process')
    ${categoryList.length > 0 ? sql`AND l.product_category IN (${sql.join(categoryList.map(c => sql`${c}`), sql`, `)})` : sql``}
    LIMIT 50
  `);

  const pastReqs = pastRequirements.rows as any[];

  const docSection = data.documentText
    ? `\nEXTRACTED DOCUMENT CONTENT (OCR of Technical Specification & Evaluation Criteria documents — use to make criteria specific and relevant to what these documents actually require):\n${data.documentText.slice(0, 18000)}\n`
    : "";

  const prompt = `You are a procurement evaluation criteria specialist. Generate between 1 and ${maxCount} evaluation criteria for a ${data.bidType} bid. Only produce as many as are genuinely distinct and relevant — fewer (even a single one) is perfectly acceptable. Do NOT pad the list to reach a target number.

CONTEXT:
- Bid Categories: ${categoryList.join(', ') || 'General Procurement'}
- Bid Items: ${data.itemDescriptions.slice(0, 10).join(', ') || 'General Items'}
- Remaining Weight Budget: ${remainingWeight} points (the weights of all generated criteria MUST sum to exactly ${remainingWeight})

${data.existingQuestions.length > 0 ? `CRITERIA ALREADY IN THIS BID — DO NOT repeat, rephrase, or ask anything similar to these:
${data.existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}

${pastReqs.length > 0 ? `PAST SUCCESSFUL CRITERIA (use as reference only, do not repeat the above):
${pastReqs.slice(0, 15).map(r => `- [${r.category}] ${r.question} (Type: ${r.qvtype})`).join('\n')}` : ''}
${docSection}
RULES (strictly follow all):
1. Generate between 1 and ${maxCount} criteria — only as many as add real evaluation value. Do NOT pad the list to hit a number; a single well-chosen criterion is valid.
2. Use ONLY these categories: "Business", "Finance", "General", "Management".
3. Use ONLY these value types: "Text" or "Dropdown".
4. Each criterion weight must be between 1 and 100 (inclusive).
5. The sum of ALL weights MUST equal exactly ${remainingWeight}.
6. For "Dropdown" value type: you MUST include a "lovOptions" array with 3–5 relevant string options.
7. For "Text" value type: set "lovOptions" to an empty array [].
8. Each criterion must have a "value" field: the expected/ideal answer or benchmark (e.g. "ISO 9001 Certified", "Minimum 5 years", "> 95%").
9. Spread criteria across Business, Finance, General, and Management categories where appropriate.
10. Every criterion MUST be unique and test a completely different aspect of vendor capability. Do NOT repeat, paraphrase, or ask similar questions (e.g. do not ask about "customer satisfaction" more than once in any form).
11. When EXTRACTED DOCUMENT CONTENT is provided, use it to make criteria specific to the actual requirements stated in those documents (materials, specifications, standards, quality/compliance, delivery terms, etc.) where relevant to this item.

Return ONLY valid JSON in this exact format:
{
  "requirements": [
    {
      "category": "General",
      "question": "Does the vendor hold ISO 9001 certification?",
      "value": "ISO 9001 Certified",
      "qvtype": "Dropdown",
      "weight": 20,
      "lovOptions": ["ISO 9001 Certified", "ISO 14001 Certified", "Not Certified", "In Progress"]
    },
    {
      "category": "Finance",
      "question": "What is the vendor's annual turnover for the last 3 years?",
      "value": "Minimum USD 5 million",
      "qvtype": "Text",
      "weight": 15,
      "lovOptions": []
    }
  ]
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      {
        role: "system",
        content: "You are an AI procurement evaluation criteria generator. You create practical, relevant evaluation criteria for procurement bids. You strictly follow all formatting and weight rules given to you. Return valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw { status: 500, message: "AI returned invalid response format" };
  }

  const rawList: any[] = parsed.requirements || [];

  // Normalize and enforce business rules on AI output
  const ALLOWED_CATEGORIES = ["Business", "Finance", "General", "Management"];
  const ALLOWED_TYPES = ["Text", "Dropdown"];

  const normalized = rawList.map((r: any) => {
    const category = ALLOWED_CATEGORIES.includes(r.category) ? r.category : "General";
    const qvtype = ALLOWED_TYPES.includes(r.qvtype) ? r.qvtype : "Text";
    const rawWeight = parseInt(r.weight, 10);
    const weight = isNaN(rawWeight) ? 1 : Math.min(100, Math.max(1, rawWeight));
    const lovOptions: string[] = qvtype === "Dropdown" && Array.isArray(r.lovOptions) && r.lovOptions.length > 0
      ? r.lovOptions.map((o: any) => String(o)).filter(Boolean)
      : [];
    return {
      category,
      question: String(r.question || "").trim(),
      value: String(r.value || "").trim(),
      qvtype,
      weight,
      lovOptions,
    };
  }).filter(r => r.question.length > 0);

  // Deduplicate: remove exact matches and near-duplicates within the new batch,
  // then cross-check against questions already saved in this bid
  const deduped = deduplicateRequirements(normalized, data.existingQuestions);

  // Redistribute weights so they sum exactly to remainingWeight
  // (deduplication may have reduced the list so always recalculate)
  if (deduped.length > 0) {
    const rawSum = deduped.reduce((s, r) => s + r.weight, 0);
    if (rawSum !== remainingWeight) {
      let distributed = 0;
      for (let i = 0; i < deduped.length - 1; i++) {
        const share = Math.max(1, Math.min(100, Math.round((deduped[i].weight / rawSum) * remainingWeight)));
        deduped[i].weight = share;
        distributed += share;
      }
      deduped[deduped.length - 1].weight = Math.max(1, Math.min(100, remainingWeight - distributed));
    }
  }

  return deduped;
}

export type ReconcileAction = "keep" | "update" | "remove" | "new";

export interface ReconciledRequirement {
  id: number | null; // existing requirement id, or null for a newly generated question
  action: ReconcileAction;
  category: string;
  question: string;
  value: string;
  qvtype: string;
  weight: number;
  lovOptions: string[];
  origin: "ai" | "manual"; // provenance of the existing row (for styling); new questions are "ai"
  questionChanged: boolean;
  weightChanged: boolean;
  originalQuestion?: string;
  originalWeight?: number;
}

export interface ExistingRequirementInput {
  id: number;
  category: string;
  question: string;
  qvtype: string;
  weight: number;
  target?: string;
  lovOptions?: string[];
  origin: "ai" | "manual";
}

const RECON_ALLOWED_CATEGORIES = ["Business", "Finance", "General", "Management"];
const RECON_ALLOWED_TYPES = ["Text", "Dropdown"];

function normalizeQuestionKey(q: string): string {
  return String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Regenerate/re-evaluate evaluation criteria holistically. Unlike generateBidRequirements
 * (which only appends new questions into the remaining budget), this considers the full
 * current picture — line items, ALL existing questions (AI + manual), and OCR-extracted
 * document text — and returns a reconciled plan: keep / update / remove existing questions
 * and add new ones, with all retained weights summing to exactly 100.
 */
export async function reconcileBidRequirements(data: {
  bidType: string;
  lineItems: { category: string; description: string }[];
  existingQuestions: ExistingRequirementInput[];
  documentText: string;
}): Promise<ReconciledRequirement[]> {
  const lineItemLines = data.lineItems
    .map((li, i) => `${i + 1}. Item: ${li.description || "(unnamed)"}${li.category ? ` | Category: ${li.category}` : ""}`)
    .join("\n") || "(no line items)";

  const existingLines = data.existingQuestions.length > 0
    ? data.existingQuestions
        .map(
          (q) =>
            `- id=${q.id} | [${q.category}] "${q.question}" | type=${q.qvtype} | weight=${q.weight} | origin=${q.origin}`,
        )
        .join("\n")
    : "(none yet)";

  const docSection = data.documentText
    ? `\nEXTRACTED DOCUMENT CONTENT (OCR of Technical Specification & Evaluation Criteria documents — use to inform relevant, specific questions):\n${data.documentText.slice(0, 18000)}\n`
    : "";

  const prompt = `You are a procurement evaluation criteria specialist. Re-evaluate and reconcile the evaluation criteria for a ${data.bidType} bid so they stay accurate and aligned with the latest procurement information.

CURRENT LINE ITEMS:
${lineItemLines}

EXISTING EVALUATION QUESTIONS (consider ALL of them — both AI-generated and manually written — with equal importance):
${existingLines}
${docSection}
YOUR TASK — produce the FINAL desired set of evaluation questions by deciding, for each existing question, whether to:
- KEEP it unchanged (reuse its id, same text and weight),
- UPDATE it (reuse its id; improve the wording and/or change the weight),
- REMOVE it (omit it from the "questions" array and list its id under "removedIds") when it is no longer relevant to the current line items/documents,
and by ADDING new questions (id = null) so that EVERY current line item is evaluated.

COVERAGE IS THE TOP PRIORITY: Every single line item listed under CURRENT LINE ITEMS must be evaluated by at least one question in your output. Go through the line items one by one and check whether an existing question already assesses it. If a line item (for example a newly added one) has NO question that clearly applies to it, you MUST ADD one or more new questions (id = null) specific to that line item. When you add questions for a newly covered line item, LOWER and redistribute the weights of the other questions so the overall total stays exactly 100 — do not skip a line item just because the existing questions already sum to 100.

RULES (strictly follow all):
1. Reference each existing question you keep or update by its EXACT id. New questions must use id = null. If you re-word or re-weight an existing question, you MUST reuse its original id — NEVER drop an existing question and re-add the same idea as a new (id = null) question.
2. Any existing id you do NOT include in "questions" is considered removed — also list it in "removedIds".
3. Use ONLY these categories: "Business", "Finance", "General", "Management".
4. Use ONLY these value types: "Text" or "Dropdown".
5. For "Dropdown": include a "lovOptions" array of 3-5 relevant options. For "Text": use an empty array [].
6. Each question needs a "value" field: the expected/ideal answer or benchmark.
7. Every weight is an integer between 1 and 100, and the weights of ALL questions in "questions" MUST sum to EXACTLY 100.
8. Do not create duplicate or near-duplicate questions. A new question (id = null) must NOT repeat or merely paraphrase any EXISTING question listed above, nor any other new question you add. If a suitable question already exists, KEEP or UPDATE it instead of adding a new one.
9. Preserve the intent of good existing questions; only rewrite when it materially improves clarity or relevance.
10. COVERAGE CHECK before returning: confirm that each of the ${data.lineItems.length} current line item(s) is represented by at least one question. If any is missing, add a question for it and rebalance the weights to total 100.

Return ONLY valid JSON in this exact format:
{
  "questions": [
    { "id": 12, "category": "Finance", "question": "...", "value": "...", "qvtype": "Text", "weight": 20, "lovOptions": [] },
    { "id": null, "category": "General", "question": "...", "value": "...", "qvtype": "Dropdown", "weight": 15, "lovOptions": ["A","B","C"] }
  ],
  "removedIds": [7]
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      {
        role: "system",
        content:
          "You are an AI procurement evaluation criteria generator. You reconcile existing evaluation questions with the latest bid information and documents, keeping/updating/removing/adding as needed. You strictly follow all formatting and weight rules. Return valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw { status: 500, message: "AI returned invalid response format" };
  }

  const existingById = new Map<number, ExistingRequirementInput>();
  for (const q of data.existingQuestions) existingById.set(q.id, q);

  const rawQuestions: any[] = Array.isArray(parsed.questions) ? parsed.questions : [];

  // Normalize AI output into retained (keep/update/new) items
  const retained = rawQuestions
    .map((r: any) => {
      const category = RECON_ALLOWED_CATEGORIES.includes(r.category) ? r.category : "General";
      const qvtype = RECON_ALLOWED_TYPES.includes(r.qvtype) ? r.qvtype : "Text";
      const rawWeight = parseInt(r.weight, 10);
      const weight = isNaN(rawWeight) ? 1 : Math.min(100, Math.max(1, rawWeight));
      const lovOptions: string[] =
        qvtype === "Dropdown" && Array.isArray(r.lovOptions) && r.lovOptions.length > 0
          ? r.lovOptions.map((o: any) => String(o)).filter(Boolean)
          : [];
      const parsedId = r.id === null || r.id === undefined ? null : parseInt(String(r.id), 10);
      const id = parsedId !== null && !isNaN(parsedId) && existingById.has(parsedId) ? parsedId : null;
      return {
        id,
        category,
        question: String(r.question || "").trim(),
        value: String(r.value || "").trim(),
        qvtype,
        weight,
        lovOptions,
      };
    })
    .filter((r) => r.question.length > 0);

  // Drop duplicate NEW questions (id=null) that repeat an existing kept/updated
  // question or another new one. Existing rows (id !== null) are never dropped here —
  // removals are handled separately by the reconciliation logic below.
  const DUP_SIMILARITY_THRESHOLD = 0.8;
  const dedupedRetained: typeof retained = [];
  const acceptedFingerprints: { tokens: Set<string>; key: string }[] = [];
  for (const r of retained) {
    const key = normalizeQuestionKey(r.question);
    const tokens = tokenize(r.question);
    if (r.id !== null) {
      dedupedRetained.push(r);
      acceptedFingerprints.push({ tokens, key });
      continue;
    }
    const isDuplicate = acceptedFingerprints.some(
      (a) => a.key === key || jaccardSimilarity(a.tokens, tokens) >= DUP_SIMILARITY_THRESHOLD,
    );
    if (isDuplicate) continue;
    dedupedRetained.push(r);
    acceptedFingerprints.push({ tokens, key });
  }
  retained.length = 0;
  retained.push(...dedupedRetained);

  // Convert "remove old + add near-identical new" into a keep/update of the old row.
  // If a NEW question (id=null) matches an existing question the AI did NOT reference
  // (i.e. one that would otherwise be reported as removed), reuse that existing id so the
  // row is not deleted and re-created. It then flows through the keep/update path below.
  const aiReferencedIds = new Set(
    retained.filter((r) => r.id !== null).map((r) => r.id as number),
  );
  for (const r of retained) {
    if (r.id !== null) continue;
    const key = normalizeQuestionKey(r.question);
    const tokens = tokenize(r.question);
    for (const q of data.existingQuestions) {
      if (aiReferencedIds.has(q.id)) continue;
      if (
        normalizeQuestionKey(q.question) === key ||
        jaccardSimilarity(tokenize(q.question), tokens) >= DUP_SIMILARITY_THRESHOLD
      ) {
        r.id = q.id;
        aiReferencedIds.add(q.id);
        break;
      }
    }
  }

  // Rebalance retained weights to sum to exactly 100
  if (retained.length > 0) {
    const rawSum = retained.reduce((s, r) => s + r.weight, 0);
    if (rawSum !== 100) {
      let distributed = 0;
      for (let i = 0; i < retained.length - 1; i++) {
        const share = Math.max(1, Math.min(100, Math.round((retained[i].weight / rawSum) * 100)));
        retained[i].weight = share;
        distributed += share;
      }
      retained[retained.length - 1].weight = Math.max(1, Math.min(100, 100 - distributed));
    }
  }

  const result: ReconciledRequirement[] = [];
  const referencedIds = new Set<number>();

  for (const r of retained) {
    if (r.id !== null) {
      referencedIds.add(r.id);
      const original = existingById.get(r.id)!;
      const questionChanged = normalizeQuestionKey(original.question) !== normalizeQuestionKey(r.question);
      const weightChanged = Number(original.weight) !== Number(r.weight);
      result.push({
        id: r.id,
        action: questionChanged || weightChanged ? "update" : "keep",
        category: r.category,
        question: r.question,
        value: r.value,
        qvtype: r.qvtype,
        weight: r.weight,
        lovOptions: r.lovOptions,
        origin: original.origin,
        questionChanged,
        weightChanged,
        originalQuestion: original.question,
        originalWeight: Number(original.weight),
      });
    } else {
      result.push({
        id: null,
        action: "new",
        category: r.category,
        question: r.question,
        value: r.value,
        qvtype: r.qvtype,
        weight: r.weight,
        lovOptions: r.lovOptions,
        origin: "ai",
        questionChanged: false,
        weightChanged: false,
      });
    }
  }

  // Any existing question not referenced by the AI is a removal
  for (const q of data.existingQuestions) {
    if (!referencedIds.has(q.id)) {
      result.push({
        id: q.id,
        action: "remove",
        category: q.category,
        question: q.question,
        value: q.target || "",
        qvtype: q.qvtype,
        weight: Number(q.weight),
        lovOptions: q.lovOptions || [],
        origin: q.origin,
        questionChanged: false,
        weightChanged: false,
        originalQuestion: q.question,
        originalWeight: Number(q.weight),
      });
    }
  }

  return result;
}

/**
 * Converts a question string into a set of meaningful word tokens.
 * Lowercases, strips punctuation, and removes common English stop words
 * that carry no semantic meaning for similarity comparison.
 */
function tokenize(text: string): Set<string> {
  const STOP_WORDS = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "to", "of", "in", "on", "at", "by", "for", "with", "about", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "from", "up", "down", "out", "off", "over", "under", "then", "once",
    "and", "but", "or", "nor", "so", "yet", "both", "either", "neither",
    "not", "only", "own", "same", "than", "too", "very", "just",
    "what", "which", "who", "whom", "this", "that", "these", "those",
    "your", "their", "its", "our", "my", "his", "her", "how", "does",
    "please", "provide", "describe", "explain", "list", "specify",
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/**
 * Jaccard similarity between two token sets.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter(w => b.has(w)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/**
 * Three-pass deduplication:
 *  Pass 1 — exact match within the new batch (case-insensitive, punctuation stripped).
 *  Pass 2 — fuzzy match within the new batch using Jaccard similarity on meaningful
 *            word tokens; questions with >= 55% token overlap are dropped.
 *  Pass 3 — cross-check each surviving new question against existingQuestions
 *            (already saved in the bid); any new question that is an exact match or
 *            reaches >= 55% Jaccard similarity with an existing one is dropped.
 */
function deduplicateRequirements(
  items: GeneratedRequirement[],
  existingQuestions: string[] = [],
): GeneratedRequirement[] {
  const SIMILARITY_THRESHOLD = 0.55;

  // Pass 1: exact duplicates within the new batch
  const seen = new Set<string>();
  const afterExact = items.filter(item => {
    const key = item.question.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Pass 2: near-duplicates within the new batch via Jaccard similarity
  const tokenSets = afterExact.map(item => tokenize(item.question));
  const keep: boolean[] = new Array(afterExact.length).fill(true);

  for (let i = 0; i < afterExact.length; i++) {
    if (!keep[i]) continue;
    for (let j = i + 1; j < afterExact.length; j++) {
      if (!keep[j]) continue;
      if (jaccardSimilarity(tokenSets[i], tokenSets[j]) >= SIMILARITY_THRESHOLD) {
        keep[j] = false;
      }
    }
  }

  const afterInternalDedup = afterExact.filter((_, idx) => keep[idx]);

  // Pass 3: cross-check against questions already saved in this bid
  if (existingQuestions.length === 0) return afterInternalDedup;

  const existingTokenSets = existingQuestions.map(q => tokenize(q));
  const existingKeys = new Set(
    existingQuestions.map(q =>
      q.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim(),
    ),
  );

  return afterInternalDedup.filter(item => {
    const key = item.question.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    // Exact match against any existing question
    if (existingKeys.has(key)) return false;
    // Fuzzy match against any existing question
    const itemTokens = tokenize(item.question);
    return !existingTokenSets.some(
      existingTokens => jaccardSimilarity(itemTokens, existingTokens) >= SIMILARITY_THRESHOLD,
    );
  });
}

export interface GeneratedClause {
  type: string;
  class_desc: string;
  class_ref: string;
}

export async function generateBidClauses(data: {
  categories: string[];
  itemDescriptions: string[];
  bidType: string;
}): Promise<GeneratedClause[]> {
  const categoryList = data.categories.filter(c => c && c.trim());

  const pastClauses = await db.execute(sql`
    SELECT DISTINCT c.type, c.class_desc, c.class_ref
    FROM dbo.supp_bid_clauses c
    JOIN dbo.supp_bid_dtls b ON c.bidrefno = b.id
    JOIN dbo.supp_bid_line_dtls l ON l.bidrefno = b.id
    WHERE b.status IN ('Awarded', 'Closed', 'Award Under Process', 'Published')
    ${categoryList.length > 0 ? sql`AND l.product_category IN (${sql.join(categoryList.map(c => sql`${c}`), sql`, `)})` : sql``}
    LIMIT 50
  `);

  const pastRows = pastClauses.rows as any[];

  const prompt = `You are a procurement contract specialist. Generate terms and instructions for a ${data.bidType} bid.

Categories: ${categoryList.join(', ') || 'General'}
Items: ${data.itemDescriptions.slice(0, 10).join(', ')}

${pastRows.length > 0 ? `Past terms & instructions used for similar bids:
${pastRows.slice(0, 20).map(r => `- [${r.type}] ${r.class_desc}${r.class_ref ? ` (Ref: ${r.class_ref})` : ''}`).join('\n')}` : 'No past clauses found for these categories.'}

Generate 6-10 clauses:
- "terms" type: contractual terms, conditions, warranties, payment terms, delivery terms, liability clauses
- "instructions" type: submission instructions, bid format requirements, evaluation process notes, compliance requirements

Each clause needs a description (class_desc) and an optional reference (class_ref).

Return JSON:
{
  "clauses": [
    { "type": "terms" or "instructions", "class_desc": "full clause text", "class_ref": "optional reference number or title" }
  ]
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: "You are an AI procurement terms and conditions specialist. Create practical, professional contract clauses and bid instructions. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw { status: 500, message: "AI returned invalid response format" };
  }
  return (parsed.clauses || []).map((c: any) => ({
    type: c.type || "terms",
    class_desc: c.class_desc || "",
    class_ref: c.class_ref || "",
  }));
}

export interface MarketPriceIntelligence {
  lineAnalysis: {
    lineId: number;
    description: string;
    currentPrice: number;
    historicalAvg: number;
    historicalMin: number;
    historicalMax: number;
    poAvg: number | null;
    poCount: number;
    bidHistAvg: number | null;
    bidHistCount: number;
    submittedPrices: number[];
    marketPosition: "below" | "at" | "above";
    deviation: number;
    insight: string;
  }[];
  overallInsight: string;
  savingsOpportunity: string;
  recommendations: string[];
}

export async function getMarketPriceIntelligence(bidId: number): Promise<MarketPriceIntelligence> {
  const lines = await db.execute(sql`
    SELECT l.id, l.description, l.quantity, l.uom, l.currentprice, l.product_category
    FROM dbo.supp_bid_line_dtls l WHERE l.bidrefno = ${bidId} ORDER BY l.id
  `);
  const bidLines = lines.rows as any[];
  if (bidLines.length === 0) throw { status: 400, message: "No line items found for this bid" };

  const responseLines = await db.execute(sql`
    SELECT rl.bid_line_id, rl.bidprice, rl.discprice, r.supplier_name, r.status
    FROM dbo.supp_bid_response_line_dtls rl
    JOIN dbo.supp_bid_response_dtls r ON r.id = rl.bid_resp_id
    WHERE r.bidrefno = ${bidId} AND r.status NOT IN ('Draft', 'Cancelled') AND rl.bidprice IS NOT NULL AND rl.bidprice > 0
  `);

  const historicalBidPrices = await db.execute(sql`
    SELECT l.product_category, l.description, rl.bidprice
    FROM dbo.supp_bid_response_line_dtls rl
    JOIN dbo.supp_bid_line_dtls l ON rl.bid_line_id = l.id
    JOIN dbo.supp_bid_response_dtls r ON r.id = rl.bid_resp_id
    WHERE r.status = 'Submitted' AND rl.bidprice IS NOT NULL AND rl.bidprice > 0
    AND r.bidrefno != ${bidId}
    ORDER BY r.creation_date DESC
    LIMIT 500
  `);

  const historicalPOPrices = await db.execute(sql`
    SELECT pol.product_category_name, pol.line_description, pol.line_unit_cost,
      pol.line_qty, po.creation_date, pol.supplier_name
    FROM dbo.supp_po_line_dtls pol
    JOIN dbo.supp_po_header_dtls po ON pol.po_number = po.po_number
    WHERE pol.line_unit_cost IS NOT NULL AND pol.line_unit_cost > 0
    ORDER BY po.creation_date DESC
    LIMIT 500
  `);

  const normCat = (c: string | null) => (c || 'General').trim().toLowerCase();
  const historicalByCategory: Record<string, { bidPrices: number[]; poPrices: number[] }> = {};
  (historicalBidPrices.rows as any[]).forEach(hp => {
    const cat = normCat(hp.product_category);
    if (!historicalByCategory[cat]) historicalByCategory[cat] = { bidPrices: [], poPrices: [] };
    historicalByCategory[cat].bidPrices.push(parseFloat(hp.bidprice));
  });
  (historicalPOPrices.rows as any[]).forEach(hp => {
    const cat = normCat(hp.product_category_name);
    if (!historicalByCategory[cat]) historicalByCategory[cat] = { bidPrices: [], poPrices: [] };
    historicalByCategory[cat].poPrices.push(parseFloat(hp.line_unit_cost));
  });

  const responsePricesByLine: Record<number, { price: number; vendor: string }[]> = {};
  (responseLines.rows as any[]).forEach(rl => {
    const lineId = parseInt(rl.bid_line_id);
    if (!responsePricesByLine[lineId]) responsePricesByLine[lineId] = [];
    responsePricesByLine[lineId].push({ price: parseFloat(rl.bidprice), vendor: rl.supplier_name });
  });

  const lineAnalysisData = bidLines.map(l => {
    const cat = l.product_category || 'General';
    const catData = historicalByCategory[normCat(cat)] || { bidPrices: [], poPrices: [] };
    const submittedPrices = (responsePricesByLine[l.id] || []).map(p => p.price);
    const allPrices = [...catData.bidPrices, ...catData.poPrices, ...submittedPrices];
    const avg = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;
    const min = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const max = allPrices.length > 0 ? Math.max(...allPrices) : 0;
    const poAvg = catData.poPrices.length > 0 ? catData.poPrices.reduce((a, b) => a + b, 0) / catData.poPrices.length : null;
    const bidAvg = catData.bidPrices.length > 0 ? catData.bidPrices.reduce((a, b) => a + b, 0) / catData.bidPrices.length : null;
    return {
      lineId: l.id,
      description: l.description,
      quantity: l.quantity,
      currentPrice: parseFloat(l.currentprice) || 0,
      category: cat,
      historicalAvg: Math.round(avg * 100) / 100,
      historicalMin: Math.round(min * 100) / 100,
      historicalMax: Math.round(max * 100) / 100,
      poAvg: poAvg ? Math.round(poAvg * 100) / 100 : null,
      poCount: catData.poPrices.length,
      bidHistAvg: bidAvg ? Math.round(bidAvg * 100) / 100 : null,
      bidHistCount: catData.bidPrices.length,
      submittedPrices,
      dataPoints: allPrices.length,
    };
  });

  const prompt = `You are a procurement market intelligence analyst. Analyze vendor pricing for a bid using historical data from both Purchase Orders (actual prices paid) and previous bid responses.

Line Items with Pricing Data:
${lineAnalysisData.map((l, i) => `${i + 1}. "${l.description}" (Qty: ${l.quantity}, Category: ${l.category})
   - Estimated Price: ${l.currentPrice || 'Not set'}
   - Submitted Vendor Prices: ${l.submittedPrices.length > 0 ? l.submittedPrices.join(', ') : 'No submissions yet'}
   - PO History (actual prices paid): Avg ${l.poAvg ?? 'No data'} (${l.poCount} records)
   - Bid History (previous quotes): Avg ${l.bidHistAvg ?? 'No data'} (${l.bidHistCount} records)
   - Combined Avg: ${l.historicalAvg || 'No data'}, Range: ${l.historicalMin || 'N/A'} - ${l.historicalMax || 'N/A'} (${l.dataPoints} total data points)`)
  .join('\n')}

NOTE: PO prices are the most reliable benchmark as they represent actual prices paid. Bid history shows what vendors previously quoted. Use both to provide comprehensive analysis.

For each line item, provide:
- marketPosition: "below", "at", or "above" market average
- deviation: percentage deviation from historical average (positive = above, negative = below)
- insight: one sentence about the pricing situation

Also provide:
- overallInsight: 2-3 sentence summary of the overall pricing picture
- savingsOpportunity: estimated potential savings or negotiation leverage
- recommendations: 3-5 actionable recommendations

Return JSON:
{
  "lineAnalysis": [{ "lineId": number, "marketPosition": string, "deviation": number, "insight": string }],
  "overallInsight": string,
  "savingsOpportunity": string,
  "recommendations": ["rec1", "rec2"]
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: "You are an AI market price intelligence analyst for procurement. Analyze pricing data and provide actionable insights. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw { status: 500, message: "AI returned invalid response format" };
  }

  return {
    lineAnalysis: lineAnalysisData.map(l => {
      const aiLine = (parsed.lineAnalysis || []).find((al: any) => al.lineId === l.lineId) || {};
      return {
        lineId: l.lineId,
        description: l.description,
        currentPrice: l.currentPrice,
        historicalAvg: l.historicalAvg,
        historicalMin: l.historicalMin,
        historicalMax: l.historicalMax,
        poAvg: l.poAvg,
        poCount: l.poCount,
        bidHistAvg: l.bidHistAvg,
        bidHistCount: l.bidHistCount,
        submittedPrices: l.submittedPrices,
        marketPosition: aiLine.marketPosition || "at",
        deviation: aiLine.deviation || 0,
        insight: aiLine.insight || "",
      };
    }),
    overallInsight: parsed.overallInsight || "",
    savingsOpportunity: parsed.savingsOpportunity || "",
    recommendations: parsed.recommendations || [],
  };
}

export interface VendorResponseQuality {
  responses: {
    responseId: number;
    supplierName: string;
    overallScore: number;
    completenessScore: number;
    technicalScore: number;
    financialScore: number;
    timelinessScore: number;
    strengths: string[];
    weaknesses: string[];
    summary: string;
  }[];
  comparativeSummary: string;
  topRecommendation: string;
}

export async function getVendorResponseQualityScores(bidId: number): Promise<VendorResponseQuality> {
  const responses = await db.execute(sql`
    SELECT r.id, r.supplier_name, r.supplier_id, r.status, r.bidtotal, r.biddisc, r.grosstotal,
      r.notes, r.amtcomments, r.creation_date, r.last_updated_date
    FROM dbo.supp_bid_response_dtls r
    WHERE r.bidrefno = ${bidId} AND r.status NOT IN ('Draft', 'Cancelled')
    ORDER BY r.id
  `);
  const respRows = responses.rows as any[];
  if (respRows.length === 0) throw { status: 400, message: "No submitted responses found for this bid" };

  const requirements = await db.execute(sql`
    SELECT id, category, question, qvoption, qvtype, weight
    FROM dbo.supp_bid_requirement_dtls WHERE bidrefno = ${bidId} ORDER BY id
  `);
  const reqRows = requirements.rows as any[];

  const lines = await db.execute(sql`
    SELECT id, description, quantity, uom, currentprice FROM dbo.supp_bid_line_dtls WHERE bidrefno = ${bidId} ORDER BY id
  `);

  const vendorData = [];
  for (const resp of respRows) {
    const reqResponses = await db.execute(sql`
      SELECT rr.bid_req_id, rr.response, rr.remarks, rr.score
      FROM dbo.supp_bid_response_reqmnt_dtls rr
      WHERE rr.bid_resp_id = ${resp.id}
    `);
    const lineResponses = await db.execute(sql`
      SELECT rl.bid_line_id, rl.bidprice, rl.discprice, rl.promised_date
      FROM dbo.supp_bid_response_line_dtls rl
      WHERE rl.bid_resp_id = ${resp.id}
    `);

    const totalReqs = reqRows.length;
    const answeredReqs = (reqResponses.rows as any[]).filter(r => r.response && r.response.trim()).length;
    const totalLines = (lines.rows as any[]).length;
    const pricedLines = (lineResponses.rows as any[]).filter(l => l.bidprice != null && parseFloat(l.bidprice) > 0).length;

    vendorData.push({
      responseId: resp.id,
      supplierName: resp.supplier_name,
      bidTotal: resp.bidtotal,
      grossTotal: resp.grosstotal,
      notes: resp.notes,
      totalReqs,
      answeredReqs,
      totalLines,
      pricedLines,
      requirementResponses: (reqResponses.rows as any[]).map(r => ({
        question: reqRows.find(req => req.id === r.bid_req_id)?.question || '',
        category: reqRows.find(req => req.id === r.bid_req_id)?.category || '',
        response: r.response || '',
        remarks: r.remarks || '',
      })),
      lineResponses: (lineResponses.rows as any[]).map(l => ({
        description: (lines.rows as any[]).find(line => line.id === l.bid_line_id)?.description || '',
        bidprice: l.bidprice,
        discprice: l.discprice,
        promisedDate: l.promised_date,
      })),
    });
  }

  const prompt = `You are a procurement evaluation specialist. Score vendor bid responses for quality and completeness.

Bid has ${reqRows.length} evaluation requirements and ${(lines.rows as any[]).length} line items.

Vendor Responses:
${vendorData.map((v, i) => `${i + 1}. ${v.supplierName} (Response #${v.responseId})
   - Requirements answered: ${v.answeredReqs}/${v.totalReqs}
   - Lines priced: ${v.pricedLines}/${v.totalLines}
   - Bid Total: ${v.bidTotal || 'N/A'}, Gross: ${v.grossTotal || 'N/A'}
   - Technical Responses: ${v.requirementResponses.filter(r => r.category === 'Technical').map(r => `Q: ${r.question.substring(0, 60)} → A: ${(r.response || 'Not answered').substring(0, 80)}`).join('; ')}
   - Financial Responses: ${v.requirementResponses.filter(r => r.category === 'Finance').map(r => `Q: ${r.question.substring(0, 60)} → A: ${(r.response || 'Not answered').substring(0, 80)}`).join('; ')}
   - Pricing: ${v.lineResponses.map(l => `${l.description.substring(0, 40)}: ${l.bidprice || 'N/A'}`).join(', ')}
   - Notes: ${(v.notes || 'None').substring(0, 200)}`).join('\n\n')}

For each vendor, score (0-100):
- completenessScore: How complete is the response? All requirements answered, all lines priced?
- technicalScore: Quality of technical requirement responses
- financialScore: Pricing competitiveness and financial response quality
- timelinessScore: Delivery dates provided, realistic timelines
- overallScore: Weighted average (completeness 25%, technical 30%, financial 30%, timeliness 15%)

Also provide strengths, weaknesses (2-3 each), and a summary sentence.

Return JSON:
{
  "responses": [{ "responseId": number, "overallScore": number, "completenessScore": number, "technicalScore": number, "financialScore": number, "timelinessScore": number, "strengths": [], "weaknesses": [], "summary": string }],
  "comparativeSummary": "2-3 sentence comparison of all vendors",
  "topRecommendation": "which vendor stands out and why"
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: "You are an AI procurement evaluation specialist. Score vendor responses objectively based on completeness, quality, and competitiveness. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw { status: 500, message: "AI returned invalid response format" };
  }

  return {
    responses: vendorData.map(v => {
      const aiResp = (parsed.responses || []).find((ar: any) => ar.responseId === v.responseId) || {};
      return {
        responseId: v.responseId,
        supplierName: v.supplierName,
        overallScore: aiResp.overallScore || 0,
        completenessScore: aiResp.completenessScore || 0,
        technicalScore: aiResp.technicalScore || 0,
        financialScore: aiResp.financialScore || 0,
        timelinessScore: aiResp.timelinessScore || 0,
        strengths: aiResp.strengths || [],
        weaknesses: aiResp.weaknesses || [],
        summary: aiResp.summary || "",
      };
    }),
    comparativeSummary: parsed.comparativeSummary || "",
    topRecommendation: parsed.topRecommendation || "",
  };
}

export type { TechnicalEvalResult as TechEvalResult } from "@shared/technical-evaluation";
import type { TechnicalEvalResult as TechEvalResult } from "@shared/technical-evaluation";

export async function getTechnicalEvaluationScores(bidId: number) {
  const { runHybridTechnicalEvaluation } = await import("./technical-evaluation-engine");
  return runHybridTechnicalEvaluation(bidId);
}

export async function getCommercialEvaluationScores(bidId: number): Promise<TechEvalResult> {
  const requirements = await db.execute(sql`
    SELECT id, category, question, qvoption, qvtype, weight, scoringmethod
    FROM dbo.supp_bid_requirement_dtls
    WHERE bidrefno = ${bidId} AND LOWER(category) IN ('commercial', 'finance', 'financial')
    ORDER BY id
  `);
  const reqRows = requirements.rows as any[];
  if (reqRows.length === 0) throw { status: 400, message: "No commercial requirements found for this bid" };

  const responses = await db.execute(sql`
    SELECT r.id, r.supplier_name, r.supplier_id, r.status
    FROM dbo.supp_bid_response_dtls r
    WHERE r.bidrefno = ${bidId} AND r.status NOT IN ('Draft', 'Cancelled')
    ORDER BY r.id
  `);
  const respRows = responses.rows as any[];
  if (respRows.length === 0) throw { status: 400, message: "No submitted responses found for this bid" };

  const vendorData = [];
  for (const resp of respRows) {
    const reqResponses = await db.execute(sql`
      SELECT rr.bid_req_id, rr.response, rr.remarks, rr.score, rr.weight
      FROM dbo.supp_bid_response_reqmnt_dtls rr
      WHERE rr.bid_resp_id = ${resp.id}
    `);
    vendorData.push({
      responseId: resp.id,
      supplierName: resp.supplier_name,
      reqResponses: (reqResponses.rows as any[]).map(rr => ({
        reqId: rr.bid_req_id,
        response: (rr.response || '').substring(0, 500),
        remarks: (rr.remarks || '').substring(0, 200),
        existingScore: rr.score,
      })),
    });
  }

  const prompt = `You are an expert commercial evaluator for procurement bids. Score each vendor's commercial responses against the requirements.

Commercial Requirements for this bid:
${reqRows.map((r, i) => `${i + 1}. [ID:${r.id}] "${r.question}" (Weight: ${r.weight}, Type: ${r.qvtype}${r.qvoption ? `, Options: ${r.qvoption}` : ''})`).join('\n')}

Vendor Responses:
${vendorData.map((v, i) => `\nVendor ${i + 1}: ${v.supplierName} (Response #${v.responseId})
${reqRows.map(req => {
    const vResp = v.reqResponses.find(r => r.reqId === req.id);
    return `  - Req ${req.id} ("${req.question.substring(0, 80)}"): ${vResp?.response || 'NOT ANSWERED'}${vResp?.remarks ? ` | Remarks: ${vResp.remarks}` : ''}`;
  }).join('\n')}`).join('\n')}

For each vendor and each requirement, suggest a score from 0-10 based on:
- Relevance and completeness of the answer
- Commercial viability and competitiveness
- Whether the response actually addresses what was asked
- Unanswered requirements get 0
- IMPORTANT: Always provide a clear rationale for every score. For unanswered requirements, explain "Vendor did not provide a response to this requirement." For answered ones, explain how well the response addresses the requirement.

Return JSON:
{
  "responses": [{
    "responseId": number,
    "suggestedCommScore": number (0-100 weighted overall),
    "requirementScores": [{
      "requirementId": number,
      "suggestedScore": number (0-10),
      "rationale": "brief reason for this score"
    }],
    "overallRationale": "2-3 sentence summary of this vendor's commercial capability"
  }],
  "comparativeSummary": "2-3 sentence comparison across vendors"
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: "You are an AI commercial evaluation specialist for procurement bids. Score vendor responses objectively against stated requirements. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try { parsed = JSON.parse(content); } catch { throw { status: 500, message: "AI returned invalid response format" }; }

  return {
    responses: vendorData.map(v => {
      const aiResp = (parsed.responses || []).find((ar: any) => Number(ar.responseId) === Number(v.responseId)) || {};
      return {
        responseId: v.responseId,
        supplierName: v.supplierName,
        suggestedTechScore: Number(aiResp.suggestedCommScore) || 0,
        requirementScores: reqRows.map(req => {
          const aiReqScore = (aiResp.requirementScores || []).find((rs: any) => rs.requirementId === req.id) || {};
          const vResp = v.reqResponses.find(r => r.reqId === req.id);
          return {
            requirementId: req.id,
            question: req.question,
            weight: parseInt(req.weight) || 1,
            vendorResponse: vResp?.response || '',
            suggestedScore: Number(aiReqScore.suggestedScore) || 0,
            maxScore: 10,
            rationale: aiReqScore.rationale || '',
          };
        }),
        overallRationale: aiResp.overallRationale || '',
      };
    }),
    comparativeSummary: parsed.comparativeSummary || '',
  };
}

export interface FinancialBidEvalResult {
  responses: {
    responseId: number;
    supplierName: string;
    suggestedPriceScore: number;
    overallRationale: string;
  }[];
  comparativeSummary: string;
}

export async function getFinancialBidLineItemScores(bidId: number): Promise<FinancialBidEvalResult> {
  const bidLinesResult = await db.execute(sql`
    SELECT id, description, quantity, uom, currentprice, targetprice, startprice, product_category
    FROM dbo.supp_bid_line_dtls
    WHERE bidrefno = ${bidId}
    ORDER BY id
  `);
  const bidLines = bidLinesResult.rows as any[];
  if (bidLines.length === 0) throw { status: 400, message: "No line items found for this bid" };

  const responsesResult = await db.execute(sql`
    SELECT r.id, r.supplier_name, r.supplier_id, r.status, r.grosstotal, b.currency
    FROM dbo.supp_bid_response_dtls r
    LEFT JOIN dbo.supp_bid_dtls b ON b.id = r.bidrefno
    WHERE r.bidrefno = ${bidId} AND r.status NOT IN ('Draft', 'Cancelled')
    ORDER BY r.id
  `);
  const respRows = responsesResult.rows as any[];
  if (respRows.length === 0) throw { status: 400, message: "No submitted responses found for this bid" };

  const vendorData: Array<{
    responseId: number;
    supplierName: string;
    grossTotal: number;
    currency: string;
    lines: Array<{
      responseLineId: number;
      bidLineId: number;
      description: string;
      quantity: number;
      uom: string;
      bidprice: number;
      discprice: number;
      rate: number;
      promisedDate: string;
      productCategory: string;
    }>;
  }> = [];

  for (const resp of respRows) {
    const linesResult = await db.execute(sql`
      SELECT rl.id, rl.bid_line_id, rl.description, rl.quantity, rl.uom,
             rl.bidprice, rl.discprice, rl.rate, rl.promised_date, rl.currency,
             rl.product_category
      FROM dbo.supp_bid_response_line_dtls rl
      WHERE rl.bid_resp_id = ${resp.id}
      ORDER BY rl.bid_line_id, rl.id
    `);
    vendorData.push({
      responseId: resp.id,
      supplierName: resp.supplier_name,
      grossTotal: parseFloat(resp.grosstotal) || 0,
      currency: resp.currency || (linesResult.rows as any[])[0]?.currency || "",
      lines: (linesResult.rows as any[]).map((l) => ({
        responseLineId: l.id,
        bidLineId: l.bid_line_id,
        description: (l.description || "").substring(0, 200),
        quantity: parseFloat(l.quantity) || 0,
        uom: l.uom || "",
        bidprice: parseFloat(l.bidprice) || 0,
        discprice: parseFloat(l.discprice) || 0,
        rate: parseFloat(l.rate) || 0,
        promisedDate: l.promised_date ? String(l.promised_date).substring(0, 10) : "",
        productCategory: l.product_category || "",
      })),
    });
  }

  const lineComparison = bidLines.map((bl) => {
    const estimate = parseFloat(bl.currentprice) || parseFloat(bl.targetprice) || parseFloat(bl.startprice) || 0;
    const vendorQuotes = vendorData.flatMap((v) => {
      const line = v.lines.find((l) => Number(l.bidLineId) === Number(bl.id));
      if (!line) return [];
      const netUnit = line.bidprice - (line.discprice || 0);
      return [{
        responseId: v.responseId,
        supplierName: v.supplierName,
        responseLineId: line.responseLineId,
        quantity: line.quantity,
        uom: line.uom,
        unitPrice: line.bidprice,
        discUnitPrice: line.discprice,
        netUnitPrice: Math.round(netUnit * 100) / 100,
        lineTotal: Math.round(netUnit * line.quantity * 100) / 100,
        taxRate: line.rate,
        promisedDate: line.promisedDate || "Not provided",
      }];
    });
    return {
      bidLineId: bl.id,
      description: bl.description,
      requiredQty: parseFloat(bl.quantity) || 0,
      uom: bl.uom || "",
      estimatePrice: estimate,
      productCategory: bl.product_category || "",
      vendorQuotes,
    };
  });

  const prompt = `You are an expert commercial evaluator for procurement bids. Compare supplier financial quotations and assign ONE overall score per vendor.

Bid Line Items (use these quotes to judge competitiveness — do NOT return per-line scores):
${lineComparison.map((line, i) => {
    const quotesText = line.vendorQuotes.length > 0
      ? line.vendorQuotes.map((q) =>
          `    - ${q.supplierName} (Response #${q.responseId}): Qty ${q.quantity} ${q.uom}, Unit ${q.unitPrice}, Disc Unit ${q.discUnitPrice}, Net Unit ${q.netUnitPrice}, Line Total ${q.lineTotal}, Tax ${q.taxRate}%, Promised ${q.promisedDate}`
        ).join("\n")
      : "    - No vendor quotes submitted for this line";
    return `${i + 1}. "${line.description}" (Required Qty: ${line.requiredQty} ${line.uom}, Estimate: ${line.estimatePrice})
${quotesText}`;
  }).join("\n\n")}

Vendors:
${vendorData.map((v, i) => `${i + 1}. ${v.supplierName} (Response #${v.responseId}, Gross Total: ${v.grossTotal} ${v.currency})`).join("\n")}

For EACH vendor, return:
- suggestedPriceScore: single overall financial competitiveness score from 0-100 (consider all line items, discounts, tax, totals, delivery dates, and missing quotes together)
- overallRationale: 2-4 sentences explaining the overall score in plain language (pricing vs competitors, completeness, value). Do NOT include per-line scores, numeric ratings out of 10, or line-by-line score breakdowns.

IMPORTANT:
- Compare suppliers using the line-item data above, but output only the vendor-level overall score and rationale
- Do NOT return lineItemScores or any per-line scoring fields
- Do NOT mention scores as "X/10" in the rationale

Return JSON:
{
  "responses": [{
    "responseId": number,
    "suggestedPriceScore": number (0-100 overall),
    "overallRationale": "2-4 sentence summary of this vendor's financial bid competitiveness"
  }],
  "comparativeSummary": "2-3 sentence comparison of vendor pricing across all line items"
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: "You are an AI financial bid evaluation specialist. Compare supplier quotations and return one overall score per vendor with a plain-language rationale. Never return per-line scores. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try { parsed = JSON.parse(content); } catch { throw { status: 500, message: "AI returned invalid response format" }; }

  return {
    responses: vendorData.map((v) => {
      const aiResp = (parsed.responses || []).find((ar: any) => Number(ar.responseId) === Number(v.responseId)) || {};
      return {
        responseId: v.responseId,
        supplierName: v.supplierName,
        suggestedPriceScore: Number(aiResp.suggestedPriceScore) || 0,
        overallRationale: aiResp.overallRationale || "",
      };
    }),
    comparativeSummary: parsed.comparativeSummary || "",
  };
}

export interface NegotiationSuggestion {
  vendorActions: {
    vendorName: string;
    responseId: number;
    action: string;
    priority: "high" | "medium" | "low";
    items: {
      lineId: number;
      description: string;
      vendorPrice: number;
      targetPrice: number;
      savingsPercent: number;
      reason: string;
    }[];
    totalCurrentValue: number;
    totalTargetValue: number;
    totalSavings: number;
    keyArguments: string[];
  }[];
  summary: string;
  estimatedTotalSavings: string;
}

export async function getNegotiationSuggestions(bidId: number): Promise<NegotiationSuggestion> {
  const lines = await db.execute(sql`
    SELECT l.id, l.description, l.quantity, l.uom, l.currentprice, l.product_category
    FROM dbo.supp_bid_line_dtls l WHERE l.bidrefno = ${bidId} ORDER BY l.id
  `);
  const bidLines = lines.rows as any[];
  if (bidLines.length === 0) throw { status: 400, message: "No line items found for this bid" };

  const responseLines = await db.execute(sql`
    SELECT rl.bid_line_id, rl.bidprice, rl.discprice, r.supplier_name, r.id as resp_id
    FROM dbo.supp_bid_response_line_dtls rl
    JOIN dbo.supp_bid_response_dtls r ON r.id = rl.bid_resp_id
    WHERE r.bidrefno = ${bidId} AND r.status NOT IN ('Draft', 'Cancelled')
    AND rl.bidprice IS NOT NULL AND rl.bidprice > 0
  `);

  const historicalPOPrices = await db.execute(sql`
    SELECT pol.product_category_name, pol.line_unit_cost
    FROM dbo.supp_po_line_dtls pol
    JOIN dbo.supp_po_header_dtls po ON pol.po_number = po.po_number
    WHERE pol.line_unit_cost IS NOT NULL AND pol.line_unit_cost > 0
    ORDER BY po.creation_date DESC LIMIT 500
  `);

  const historicalBidPrices = await db.execute(sql`
    SELECT l.product_category, rl.bidprice
    FROM dbo.supp_bid_response_line_dtls rl
    JOIN dbo.supp_bid_line_dtls l ON rl.bid_line_id = l.id
    JOIN dbo.supp_bid_response_dtls r ON r.id = rl.bid_resp_id
    WHERE r.status = 'Submitted' AND rl.bidprice IS NOT NULL AND rl.bidprice > 0
    AND r.bidrefno != ${bidId}
    ORDER BY r.creation_date DESC LIMIT 500
  `);

  const normCat = (c: string | null) => (c || 'General').trim().toLowerCase();
  const historicalByCategory: Record<string, number[]> = {};
  (historicalPOPrices.rows as any[]).forEach(hp => {
    const cat = normCat(hp.product_category_name);
    if (!historicalByCategory[cat]) historicalByCategory[cat] = [];
    historicalByCategory[cat].push(parseFloat(hp.line_unit_cost));
  });
  (historicalBidPrices.rows as any[]).forEach(hp => {
    const cat = normCat(hp.product_category);
    if (!historicalByCategory[cat]) historicalByCategory[cat] = [];
    historicalByCategory[cat].push(parseFloat(hp.bidprice));
  });

  const responsePricesByLine: Record<number, { price: number; disc: number; vendor: string }[]> = {};
  (responseLines.rows as any[]).forEach(rl => {
    const lineId = parseInt(rl.bid_line_id);
    if (!responsePricesByLine[lineId]) responsePricesByLine[lineId] = [];
    responsePricesByLine[lineId].push({
      price: parseFloat(rl.bidprice),
      disc: parseFloat(rl.discprice) || 0,
      vendor: rl.supplier_name,
    });
  });

  const vendorResponseMap: Record<string, { vendor: string; respId: number }> = {};
  (responseLines.rows as any[]).forEach(rl => {
    vendorResponseMap[rl.supplier_name] = { vendor: rl.supplier_name, respId: parseInt(rl.resp_id) };
  });

  const lineData = bidLines.map(l => {
    const prices = responsePricesByLine[l.id] || [];
    const netPrices = prices.map(p => p.price - p.disc);
    const cat = normCat(l.product_category);
    const historicalPrices = historicalByCategory[cat] || [];
    const lowest = netPrices.length > 0 ? Math.min(...netPrices) : null;
    const avg = netPrices.length > 0 ? netPrices.reduce((a, b) => a + b, 0) / netPrices.length : null;
    const histAvg = historicalPrices.length > 0 ? historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length : null;
    return {
      lineId: l.id,
      description: l.description,
      quantity: l.quantity,
      currentEstimate: parseFloat(l.currentprice) || 0,
      vendorPrices: prices.map(p => ({ vendor: p.vendor, net: Math.round((p.price - p.disc) * 100) / 100 })),
      lowest: lowest ? Math.round(lowest * 100) / 100 : null,
      average: avg ? Math.round(avg * 100) / 100 : null,
      historicalAvg: histAvg ? Math.round(histAvg * 100) / 100 : null,
      historicalCount: historicalPrices.length,
      vendorCount: prices.length,
    };
  });

  const uniqueVendors = Object.values(vendorResponseMap);

  const prompt = `You are a procurement negotiation advisor. Based on vendor quotes and historical pricing, give SPECIFIC and ACTIONABLE negotiation instructions per vendor.

Vendors who submitted quotes: ${uniqueVendors.map(v => `${v.vendor} (Response #${v.respId})`).join(', ')}

Line Items with Pricing:
${lineData.map((l, i) => `${i + 1}. [lineId=${l.lineId}] "${l.description}" (Qty: ${l.quantity})
   - Vendor Quotes: ${l.vendorPrices.map(p => `${p.vendor}: ${p.net}`).join(', ') || 'No quotes'}
   - Lowest Quote: ${l.lowest ?? 'N/A'}
   - Average Quote: ${l.average ?? 'N/A'}
   - Historical Avg: ${l.historicalAvg ?? 'No data'} (${l.historicalCount} past records)`).join('\n')}

IMPORTANT: Use the exact lineId values shown in brackets (e.g. lineId=123) in your response items array. The target price MUST be different from (lower than) the vendor's current price — suggest a realistic negotiation target. Only keep target equal to current if the price is genuinely the lowest and most competitive.

For EACH VENDOR, provide:
- action: A clear one-line instruction like "Negotiate with [Vendor] to reduce price from X to Y on [Item]" or "Accept [Vendor]'s price — already competitive" or "Push [Vendor] for 10% discount on [Item], their price is above market"
- priority: "high" (big savings possible), "medium", or "low" (already competitive)
- items: For each line item this vendor quoted, provide the vendor's current price, a realistic target price, savings %, and a short reason (e.g., "Above market avg by 15%", "Lowest bidder — accept as is", "Can leverage competing quote from X")
- keyArguments: 2-3 specific things to say to THIS vendor during negotiation (e.g., "Competitor quoted 20% less", "Historical avg is significantly lower", "Volume commitment justifies discount")

Also provide:
- summary: 2-3 sentence overall recommendation — who to negotiate with first and expected outcome
- estimatedTotalSavings: total estimated savings as a percentage

Return JSON:
{
  "vendorActions": [{
    "vendorName": string,
    "responseId": number,
    "action": string,
    "priority": "high" | "medium" | "low",
    "items": [{ "lineId": number, "vendorPrice": number, "targetPrice": number, "savingsPercent": number, "reason": string }],
    "keyArguments": [string]
  }],
  "summary": string,
  "estimatedTotalSavings": string
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: "You are an AI procurement negotiation advisor. Give clear, specific, vendor-by-vendor negotiation instructions with exact target prices. Be realistic. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try { parsed = JSON.parse(content); } catch { throw { status: 500, message: "AI returned invalid response format" }; }

  const aiVendorActions = parsed.vendorActions || [];

  const vendorActions = uniqueVendors.map(v => {
    const aiVA = aiVendorActions.find((va: any) => va.vendorName === v.vendor || va.responseId === v.respId) || {};

    const vendorLineItems = lineData
      .filter(l => l.vendorPrices.some(vp => vp.vendor === v.vendor))
      .map(l => {
        const actualPrice = l.vendorPrices.find(vp => vp.vendor === v.vendor)!.net;
        const aiItem = (aiVA.items || []).find((ai: any) => Number(ai.lineId) === l.lineId);
        let targetPrice: number;
        let reason = '';
        if (aiItem && Number(aiItem.targetPrice) > 0) {
          targetPrice = Number(aiItem.targetPrice);
          reason = aiItem.reason || '';
        } else {
          const lowestQuote = l.lowest ?? actualPrice;
          if (lowestQuote < actualPrice) {
            targetPrice = lowestQuote;
            reason = `Lowest competing quote is ${lowestQuote}`;
          } else if (l.historicalAvg && l.historicalAvg < actualPrice) {
            targetPrice = Math.round(l.historicalAvg * 100) / 100;
            reason = `Historical average is lower at ${targetPrice}`;
          } else {
            targetPrice = Math.round(actualPrice * 0.95 * 100) / 100;
            reason = 'Standard 5% negotiation target';
          }
        }
        const savings = actualPrice > 0 ? Math.round(((actualPrice - targetPrice) / actualPrice) * 10000) / 100 : 0;
        return {
          lineId: l.lineId,
          description: l.description,
          vendorPrice: actualPrice,
          targetPrice,
          savingsPercent: Math.max(0, savings),
          reason,
        };
      });

    const totalCurrent = vendorLineItems.reduce((s, i) => s + i.vendorPrice, 0);
    const totalTarget = vendorLineItems.reduce((s, i) => s + i.targetPrice, 0);

    return {
      vendorName: v.vendor,
      responseId: v.respId,
      action: aiVA.action || `Review ${v.vendor}'s pricing across all quoted items`,
      priority: aiVA.priority || 'medium',
      items: vendorLineItems,
      totalCurrentValue: Math.round(totalCurrent * 100) / 100,
      totalTargetValue: Math.round(totalTarget * 100) / 100,
      totalSavings: Math.round((totalCurrent - totalTarget) * 100) / 100,
      keyArguments: aiVA.keyArguments || [],
    };
  });

  vendorActions.sort((a, b) => {
    const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
  });

  return {
    vendorActions,
    summary: parsed.summary || 'Review vendor pricing and negotiate where savings are possible.',
    estimatedTotalSavings: parsed.estimatedTotalSavings || '',
  };
}

export interface AwardVendorRecommendation {
  vendorName: string;
  responseId: number;
  rank: number;
  overallScore: number;
  awardedItems: { lineId: number; description: string; quantity: number; unitPrice: number; totalValue: number; reason: string }[];
  totalAwardValue: number;
  strengths: string[];
  risks: string[];
}

export interface StrategyDetail {
  totalCost: number;
  pros: string;
  cons: string;
  explanation: string;
  bestVendor?: string;
  allocation?: string;
  savingsVsSingle?: string;
  savingsVsItemSplit?: string;
}

export interface OptimalAwardRecommendation {
  strategyAnalysis: {
    single: StrategyDetail;
    split_by_item: StrategyDetail;
    split_by_quantity: StrategyDetail;
  };
  recommendedStrategy: 'single' | 'split_by_item' | 'split_by_quantity';
  strategy: 'single' | 'split' | 'split_by_item' | 'split_by_quantity';
  strategyReason: string;
  recommendations: AwardVendorRecommendation[];
  summary: string;
  totalBidValue: number;
  estimatedSavings: string;
}

type ReviewerScoreEntry = {
  category: string;
  score: number;
  weight: number;
  question: string;
  reviewerRemarks: string;
  reviewerName: string;
};

const COMMERCIAL_CATEGORIES = new Set(['finance', 'financial', 'commercial']);

function formatReviewerScoreLine(s: ReviewerScoreEntry): string {
  const base = `[${s.category}] "${s.question}": ${s.score}/${s.weight}`;
  if (!s.reviewerRemarks) return base;
  const who = s.reviewerName ? ` (${s.reviewerName})` : '';
  const truncated = s.reviewerRemarks.length > 200 ? `${s.reviewerRemarks.substring(0, 200)}…` : s.reviewerRemarks;
  return `${base} — Reviewer remarks${who}: "${truncated}"`;
}

function formatReviewerScoreBreakdown(scores: ReviewerScoreEntry[], emptyLabel: string): string {
  if (scores.length === 0) return emptyLabel;
  return scores.map(formatReviewerScoreLine).join('; ');
}

export async function getOptimalAwardRecommendation(bidId: number): Promise<OptimalAwardRecommendation> {
  const bidResult = await db.execute(sql`
    SELECT id, attribute_4 as bid_number, currency, tech_score_weightage, commercial_score_weightage FROM dbo.supp_bid_dtls WHERE id = ${bidId}
  `);
  const bid = (bidResult.rows as any[])[0];
  if (!bid) throw { status: 404, message: "Bid not found" };

  const lines = await db.execute(sql`
    SELECT l.id, l.description, l.quantity, l.uom, l.currentprice, l.product_category
    FROM dbo.supp_bid_line_dtls l WHERE l.bidrefno = ${bidId} ORDER BY l.id
  `);
  const bidLines = lines.rows as any[];
  if (bidLines.length === 0) throw { status: 400, message: "No line items found for this bid" };

  const responses = await db.execute(sql`
    SELECT r.id, r.supplier_name, r.supplier_id, r.status,
           r.total_score, r.finscore, r.bidtotal, r.grosstotal,
           r.recommended, r.fin_recommended,
           r.eval_comments, r.fin_eval_comments
    FROM dbo.supp_bid_response_dtls r
    WHERE r.bidrefno = ${bidId} AND r.status NOT IN ('Draft', 'Cancelled')
    ORDER BY r.id
  `);
  const vendorResponses = responses.rows as any[];
  if (vendorResponses.length === 0) throw { status: 400, message: "No vendor responses found" };

  const responseLines = await db.execute(sql`
    SELECT rl.bid_resp_id, rl.bid_line_id, rl.bidprice, rl.discprice, rl.quantity
    FROM dbo.supp_bid_response_line_dtls rl
    JOIN dbo.supp_bid_response_dtls r ON r.id = rl.bid_resp_id
    WHERE r.bidrefno = ${bidId} AND r.status NOT IN ('Draft', 'Cancelled')
    AND rl.bidprice IS NOT NULL AND rl.bidprice > 0
  `);

  const respLinesByVendor: Record<number, { lineId: number; price: number; disc: number; qty: number }[]> = {};
  (responseLines.rows as any[]).forEach(rl => {
    const respId = parseInt(rl.bid_resp_id);
    if (!respLinesByVendor[respId]) respLinesByVendor[respId] = [];
    respLinesByVendor[respId].push({
      lineId: parseInt(rl.bid_line_id),
      price: parseFloat(rl.bidprice),
      disc: parseFloat(rl.discprice) || 0,
      qty: parseFloat(rl.quantity) || 0,
    });
  });

  const scores = await db.execute(sql`
    SELECT s.bid_resp_req_id, s.score, s.bid_resp_id, s.category, s.weight, s.question,
           s.comments, s.remarks, s.scored_by_name
    FROM dbo.supp_bid_response_reqmnt_score_dtls s
    WHERE s.bid_resp_id IN (${sql.join(vendorResponses.map((v: any) => sql`${v.id}`), sql`, `)})
  `);
  const scoresByVendor: Record<number, ReviewerScoreEntry[]> = {};
  (scores.rows as any[]).forEach((s: any) => {
    const respId = parseInt(s.bid_resp_id);
    if (!scoresByVendor[respId]) scoresByVendor[respId] = [];
    scoresByVendor[respId].push({
      category: s.category || 'General',
      score: parseFloat(s.score) || 0,
      weight: parseFloat(s.weight) || 0,
      question: s.question || '',
      reviewerRemarks: String(s.comments || s.remarks || '').trim(),
      reviewerName: String(s.scored_by_name || '').trim(),
    });
  });

  const techWeightage = parseFloat(bid.tech_score_weightage) || 60;
  const commWeightage = parseFloat(bid.commercial_score_weightage) || 40;

  const vendorSummaries = vendorResponses.map((v: any) => {
    const vLines = respLinesByVendor[v.id] || [];
    const vScores = scoresByVendor[v.id] || [];
    const techScores = vScores.filter(s => !COMMERCIAL_CATEGORIES.has(s.category.toLowerCase()));
    const commScores = vScores.filter(s => COMMERCIAL_CATEGORIES.has(s.category.toLowerCase()));
    const techScore = parseFloat(v.total_score) || 0;
    const commScore = parseFloat(v.finscore) || 0;
    const grossTotal = parseFloat(v.grosstotal) || parseFloat(v.bidtotal) || 0;

    const lineItems = vLines.map(l => {
      const lineInfo = bidLines.find(bl => bl.id === l.lineId);
      const qty = parseFloat(lineInfo?.quantity) || l.qty;
      const netUnit = Math.round((l.price - l.disc) * 100) / 100;
      return { lineId: l.lineId, description: lineInfo?.description || '', quantity: qty, unitPrice: netUnit, totalValue: Math.round(netUnit * qty * 100) / 100 };
    });

    return {
      responseId: v.id, vendorName: v.supplier_name, supplierId: v.supplier_id,
      techScore, commScore, grossTotal,
      techRecommended: v.recommended === 'Y', finRecommended: v.fin_recommended === 'Y',
      evalComments: v.eval_comments || '', finEvalComments: v.fin_eval_comments || '',
      lineItems, techScores, commScores,
    };
  });

  const lineAnalysis = bidLines.map(bl => {
    const vendorPrices = vendorSummaries.map(v => {
      const li = v.lineItems.find(l => l.lineId === bl.id);
      return { vendor: v.vendorName, responseId: v.responseId, unitPrice: li?.unitPrice || 0, totalValue: li?.totalValue || 0 };
    }).filter(vp => vp.unitPrice > 0);
    const sorted = [...vendorPrices].sort((a, b) => a.unitPrice - b.unitPrice);
    const lowestVendor = sorted[0];
    const highestVendor = sorted[sorted.length - 1];
    const priceDiffPct = lowestVendor && highestVendor && highestVendor.unitPrice > 0
      ? Math.round(((highestVendor.unitPrice - lowestVendor.unitPrice) / highestVendor.unitPrice) * 100) : 0;
    return {
      lineId: bl.id, description: bl.description, quantity: bl.quantity,
      lowestVendor: lowestVendor?.vendor, lowestPrice: lowestVendor?.unitPrice,
      highestVendor: highestVendor?.vendor, highestPrice: highestVendor?.unitPrice,
      priceDiffPct, vendorPrices: sorted,
    };
  });

  const splitAwardTotal = lineAnalysis.reduce((sum, la) => sum + (la.lowestPrice || 0) * (parseFloat(la.quantity) || 0), 0);
  const vendorTotals = vendorSummaries.map(v => ({ vendor: v.vendorName, total: v.grossTotal }));
  const singleBestTotal = Math.min(...vendorTotals.map(v => v.total));
  const splitSavingsVsSingle = singleBestTotal > 0 ? Math.round(((singleBestTotal - splitAwardTotal) / singleBestTotal) * 10000) / 100 : 0;

  const prompt = `You are a senior procurement analyst providing a DEEP and ACTIONABLE award recommendation — not just summarizing scores that are already on screen.

Bid: ${bid.bid_number || `BID-${bid.id}`} | Currency: ${bid.currency || 'USD'}
Score Weightage: Technical ${techWeightage}%, Commercial ${commWeightage}%

=== PRE-COMPUTED ANALYSIS (use this to add value beyond what's visible) ===

ITEM-BY-ITEM PRICE COMPARISON (cheapest vendor per line):
${lineAnalysis.map(la => `[lineId=${la.lineId}] "${la.description}" (Qty: ${la.quantity})
   Prices: ${la.vendorPrices.map(vp => `${vp.vendor}: ${vp.unitPrice}/unit`).join(' | ')}
   → Cheapest: ${la.lowestVendor} at ${la.lowestPrice} | Most expensive: ${la.highestVendor} at ${la.highestPrice} (${la.priceDiffPct}% gap)`).join('\n')}

SPLIT vs SINGLE AWARD ANALYSIS:
- Best single vendor total: ${singleBestTotal} (${vendorTotals.find(v => v.total === singleBestTotal)?.vendor})
- If we cherry-pick cheapest per item (split): ${Math.round(splitAwardTotal * 100) / 100}
- Split saves: ${splitSavingsVsSingle}% vs best single vendor
${splitSavingsVsSingle > 5 ? '→ SIGNIFICANT split savings — seriously consider splitting' : splitSavingsVsSingle > 0 ? '→ Minor split savings — single vendor likely better for simplicity' : '→ No split benefit — single vendor recommended'}

VENDOR PROFILES:
${vendorSummaries.map(v => {
  const weightedScore = Math.round((v.techScore * techWeightage + v.commScore * commWeightage) / 100);
  const priceRank = [...vendorTotals].sort((a, b) => a.total - b.total).findIndex(vt => vt.vendor === v.vendorName) + 1;
  const cheapestOnItems = lineAnalysis.filter(la => la.lowestVendor === v.vendorName).map(la => la.description);
  const mostExpensiveOnItems = lineAnalysis.filter(la => la.highestVendor === v.vendorName && la.vendorPrices.length > 1).map(la => la.description);
  return `
${v.vendorName} (Response #${v.responseId}):
  Weighted Score: ${weightedScore}/100 (Tech: ${v.techScore} × ${techWeightage}% + Comm: ${v.commScore} × ${commWeightage}%)
  Gross Total: ${v.grossTotal} (Price Rank: #${priceRank} of ${vendorTotals.length})
  Evaluator Recommended: Tech=${v.techRecommended ? 'YES' : 'No'} | Financial=${v.finRecommended ? 'YES' : 'No'}
  Evaluator Comments: "${v.evalComments}" | Financial: "${v.finEvalComments}"
  Cheapest on: ${cheapestOnItems.length > 0 ? cheapestOnItems.join(', ') : 'None'}
  Most expensive on: ${mostExpensiveOnItems.length > 0 ? mostExpensiveOnItems.join(', ') : 'None'}
  Technical Reviewer Scores & Remarks: ${formatReviewerScoreBreakdown(v.techScores, 'None')}
  Commercial Reviewer Scores & Remarks: ${formatReviewerScoreBreakdown(v.commScores, 'None')}`;
}).join('\n')}

=== YOUR INDEPENDENT ANALYSIS RULES ===

You are an INDEPENDENT procurement advisor. Form your OWN recommendation based on data analysis — weighted scores, pricing, value-for-money, AND qualitative reviewer remarks from technical/commercial scoring. Use per-requirement reviewer remarks and overall evaluator comments to inform strengths, risks, and trade-offs, but do NOT blindly follow evaluator recommendations or comments. Your recommendation may agree or disagree with evaluators.

ANALYSIS FRAMEWORK (apply in order):

STEP 1 — COMPUTE WEIGHTED COMPOSITE SCORE for each vendor:
  Formula: (TechScore × ${techWeightage}/100) + (CommScore × ${commWeightage}/100)
  This is your primary quality metric. A 10+ point gap is significant.

STEP 2 — COMPUTE VALUE-FOR-MONEY:
  For each vendor: WeightedCompositeScore / GrossTotal × 1000 = value index
  Higher = better bang for buck. Flag if the cheapest vendor has the worst value index.

STEP 3 — LINE-ITEM LEVEL ANALYSIS:
  For each line item, determine: Who is cheapest? By how much (% and absolute)?
  Cross-reference: Is the cheapest vendor also the highest-scoring? If not, quantify the trade-off.

STEP 4 — SINGLE vs SPLIT DECISION (3 levels of splitting):
  Level 1 - SINGLE VENDOR: All items, all quantities to one vendor.
  Level 2 - ITEM-LEVEL SPLIT: Different items to different vendors (each item fully to one vendor).
  Level 3 - QUANTITY-LEVEL SPLIT: Same item's quantity split across multiple vendors.
    Example: Item "AC Services" has qty 100. Award 70 units to Vendor A (cheapest) and 30 units to Vendor B (best quality) — this hedges risk while capturing savings.

  When to use quantity splits:
  - Two vendors have similar quality but different prices on the same item — give majority qty to cheaper vendor, minority to quality leader as backup
  - Large quantities (>10 units) where splitting is operationally feasible
  - Risk mitigation: don't put all eggs in one basket for critical items
  - Price negotiation leverage: vendors compete knowing they only got partial quantity

  Calculate savings for all 3 scenarios and recommend the one with best value.

STEP 5 — RANK ALL VENDORS (every single one that responded):
  Use a blended score: 60% weighted composite quality + 40% price competitiveness
  Price competitiveness = (LowestTotal / VendorTotal) × 100

=== OUTPUT REQUIREMENTS ===

You MUST analyze ALL THREE award strategies and explain each with concrete numbers. Then recommend the best one.

IMPORTANT: Each line item's TOTAL awarded quantity across all vendors must equal the original required quantity. Every line item must be fully allocated.

Return JSON:
{
  "strategyAnalysis": {
    "single": {
      "bestVendor": string (vendor name),
      "totalCost": number,
      "pros": string (1-2 sentences — why single vendor works),
      "cons": string (1-2 sentences — what you lose),
      "explanation": string (detailed: "Award all items to X at total cost Y. This vendor has weighted score Z, highest among all. Compared to split, you pay A more but avoid multi-vendor complexity.")
    },
    "split_by_item": {
      "allocation": string (e.g., "Items 1,2 to Vendor A; Items 3,4 to Vendor B"),
      "totalCost": number,
      "savingsVsSingle": string (amount and % saved vs single vendor),
      "pros": string,
      "cons": string,
      "explanation": string (detailed: "Award civil items to X at price P1 and AC items to Y at price P2. Total: Z. Saves N vs single vendor because X is cheapest on civil items while Y dominates AC items.")
    },
    "split_by_quantity": {
      "allocation": string (e.g., "Item 1: 70 to Vendor A + 30 to Vendor B; Item 2: all to Vendor A"),
      "totalCost": number,
      "savingsVsSingle": string,
      "savingsVsItemSplit": string,
      "pros": string,
      "cons": string,
      "explanation": string (detailed: "Split quantities to maximize savings. Give 70% of AC Services qty to cheapest vendor X and 30% to quality leader Y as backup. Total: Z. Saves N vs single, M vs item split.")
    }
  },
  "recommendedStrategy": "single" | "split_by_item" | "split_by_quantity",
  "strategyReason": string (why this strategy is best — compare all 3 totals and trade-offs in one clear paragraph),
  "recommendations": [{
    "vendorName": string,
    "responseId": number,
    "rank": number,
    "overallScore": number (weighted composite 0-100),
    "awardedItems": [{ "lineId": number, "description": string, "quantity": number (can be partial for quantity splits), "unitPrice": number, "totalValue": number, "reason": string }],
    "strengths": [string (specific, data-backed)],
    "risks": [string (specific, quantified)]
  }],
  "summary": string (2-3 sentences with the key decision and numbers),
  "estimatedSavings": string (exact amount + percentage vs worst scenario)
}`;

  const openai = await getAIClient();
  const response = await openai.chat.completions.create({
    model: await getAIModelName(),
    messages: [
      { role: "system", content: "You are an independent AI procurement analyst. Make your OWN recommendation using weighted composite scores, price analysis, value-for-money, and qualitative reviewer remarks from technical/commercial scoring. Incorporate reviewer remarks when assessing strengths and risks, but do not blindly defer to evaluator recommendations or comments. Your analysis should provide insights that go beyond what's already visible on screen. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw { status: 500, message: "AI returned empty response" };

  let parsed: any;
  try { parsed = JSON.parse(content); } catch { throw { status: 500, message: "AI returned invalid response format" }; }

  const recommendations: AwardVendorRecommendation[] = (parsed.recommendations || []).map((rec: any) => {
    const vendor = vendorSummaries.find(v => v.responseId === rec.responseId || v.vendorName === rec.vendorName);
    const awardedItems = (rec.awardedItems || []).map((item: any) => {
      const lineInfo = bidLines.find(bl => bl.id === Number(item.lineId));
      const qty = Number(item.quantity) || parseFloat(lineInfo?.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      return {
        lineId: Number(item.lineId),
        description: item.description || lineInfo?.description || '',
        quantity: qty,
        unitPrice,
        totalValue: Math.round(unitPrice * qty * 100) / 100,
        reason: item.reason || '',
      };
    });

    return {
      vendorName: vendor?.vendorName || rec.vendorName || '',
      responseId: vendor?.responseId || Number(rec.responseId) || 0,
      rank: Number(rec.rank) || 0,
      overallScore: Number(rec.overallScore) || 0,
      awardedItems,
      totalAwardValue: awardedItems.reduce((s: number, i: any) => s + i.totalValue, 0),
      strengths: rec.strengths || [],
      risks: rec.risks || [],
    };
  });

  recommendations.sort((a, b) => a.rank - b.rank);

  const totalBidValue = recommendations.reduce((s, r) => s + r.totalAwardValue, 0);

  const defaultDetail: StrategyDetail = { totalCost: 0, pros: '', cons: '', explanation: 'Not analyzed' };
  const sa = parsed.strategyAnalysis || {};

  return {
    strategyAnalysis: {
      single: { ...defaultDetail, ...sa.single, totalCost: Number(sa.single?.totalCost) || 0 },
      split_by_item: { ...defaultDetail, ...sa.split_by_item, totalCost: Number(sa.split_by_item?.totalCost) || 0 },
      split_by_quantity: { ...defaultDetail, ...sa.split_by_quantity, totalCost: Number(sa.split_by_quantity?.totalCost) || 0 },
    },
    recommendedStrategy: parsed.recommendedStrategy || parsed.strategy || 'single',
    strategy: parsed.recommendedStrategy || parsed.strategy || 'single',
    strategyReason: parsed.strategyReason || '',
    recommendations,
    summary: parsed.summary || 'Review the recommendations and select the best vendor for award.',
    totalBidValue: Math.round(totalBidValue * 100) / 100,
    estimatedSavings: parsed.estimatedSavings || '',
  };
}
