import { pool as defaultPool } from "../db";
import { getContextPool } from "../tenant-context";

const getPool = () => getContextPool() ?? defaultPool;

export type RecommendationLevel = "full_pr" | "line" | "none";

export interface MatchedPrItem {
  lineNum: number;
  description: string;
  matchType: "category" | "item_code" | "description" | "po_history";
}

export interface PreviousPoEvidence {
  poNumber: string;
  poDate: string | null;
  qty: number | null;
  unitPrice: number | null;
  currency: string | null;
  location?: string | null;
  itemRef: string;
}

export interface LineRecommendation {
  lineNum: number;
  description: string;
  vendorId: string;
  vendorName: string;
  matchScore: number;
  reason: string;
}

export interface VendorRecommendation {
  vendorId: string;
  vendorName: string;
  matchScore: number;
  reason: string;
  reasoningSummary: string;
  matchedPrItems: MatchedPrItem[];
  scopeOfSupplyMatch: {
    coverage: "full" | "partial";
    categories: string[];
  };
  previousPoEvidence: PreviousPoEvidence[];
  alternateReason?: string;
  qualificationStatus: string;
}

export interface RecommendSuppliersResult {
  recommendationLevel: RecommendationLevel;
  noRecommendationReason?: string;
  missingDatapoints?: string[];
  vendors: VendorRecommendation[];
  lineRecommendations?: LineRecommendation[];
}

interface NormalizedPrLine {
  lineNum: number;
  itemId: string | null;
  description: string;
  categoryCode: string | null;
  categoryName: string | null;
  qty: number | null;
  uom: string | null;
}

interface SosRow {
  supplier_id: number;
  company_name: string;
  category_code: string | null;
  sub_category: string | null;
  good_service_code: string | null;
  service_details: string | null;
  dpworld_terminal: string | null;
}

interface PoHistoryRow {
  po_number: string;
  supplier_id: number;
  company_name: string;
  po_status: string | null;
  po_date: Date | string | null;
  po_currency: string | null;
  delivertto_location_name: string | null;
  item_id: string | null;
  item_name: string | null;
  line_description: string | null;
  line_qty: string | number | null;
  line_unit_cost: string | number | null;
  product_category: string | null;
  product_category_name: string | null;
}

function norm(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeLines(lineItems: any[]): NormalizedPrLine[] {
  return (lineItems || []).map((l: any, idx: number) => {
    const lineNum = Number(l.line_num ?? l.lineNum ?? idx + 1);
    const itemIdRaw = l.item_id ?? l.itemId ?? null;
    const itemId =
      itemIdRaw != null && String(itemIdRaw).trim() !== ""
        ? String(itemIdRaw).trim()
        : null;
    const description = String(
      l.item_description ?? l.itemDescription ?? l.description ?? "",
    ).trim();
    const categoryCodeRaw = l.product_category ?? l.productCategory ?? null;
    const categoryCode =
      categoryCodeRaw != null && String(categoryCodeRaw).trim() !== ""
        ? String(categoryCodeRaw).trim()
        : null;
    const categoryNameRaw =
      l.product_category_name ?? l.productCategoryName ?? null;
    const categoryName =
      categoryNameRaw != null && String(categoryNameRaw).trim() !== ""
        ? String(categoryNameRaw).trim()
        : null;
    return {
      lineNum,
      itemId,
      description,
      categoryCode,
      categoryName,
      qty: toNum(l.qty),
      uom: l.uom ? String(l.uom) : null,
    };
  });
}

function locationMatches(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function categoryCodesRelated(a: string, b: string): boolean {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // UNSPSC hierarchy: shared prefix of at least 2 chars
  const minLen = Math.min(left.length, right.length, 8);
  for (let len = minLen; len >= 2; len--) {
    if (left.slice(0, len) === right.slice(0, len)) return true;
  }
  return left.startsWith(right) || right.startsWith(left);
}

type LineMatchType = "category" | "item_code" | "description";

function matchLineToSos(
  line: NormalizedPrLine,
  sos: SosRow,
): LineMatchType | null {
  if (
    line.itemId &&
    sos.good_service_code &&
    norm(sos.good_service_code) === norm(line.itemId)
  ) {
    return "item_code";
  }

  if (line.categoryCode && sos.category_code) {
    if (categoryCodesRelated(line.categoryCode, String(sos.category_code))) {
      return "category";
    }
  }

  const catName = norm(line.categoryName);
  if (catName) {
    if (
      (sos.sub_category && norm(sos.sub_category).includes(catName)) ||
      (sos.service_details && norm(sos.service_details).includes(catName)) ||
      (sos.category_code && norm(sos.category_code).includes(catName)) ||
      (catName.length >= 3 &&
        sos.sub_category &&
        catName.includes(norm(sos.sub_category)))
    ) {
      return "category";
    }
  }

  const desc = norm(line.description);
  if (desc && desc.length >= 3) {
    const haystacks = [
      sos.service_details,
      sos.sub_category,
      sos.good_service_code,
    ]
      .map(norm)
      .filter(Boolean);
    for (const h of haystacks) {
      if (h.includes(desc) || desc.includes(h)) return "description";
      // token overlap for short product names
      const tokens = desc.split(/\s+/).filter((t) => t.length >= 4);
      if (tokens.some((t) => h.includes(t))) return "description";
    }
  }

  return null;
}

function matchPoToLine(
  line: NormalizedPrLine,
  po: PoHistoryRow,
): boolean {
  if (line.itemId && po.item_id && norm(line.itemId) === norm(po.item_id)) {
    return true;
  }
  const desc = norm(line.description);
  if (!desc) return false;
  const poName = norm(po.item_name);
  const poDesc = norm(po.line_description);
  if (poName && (poName === desc || poName.includes(desc) || desc.includes(poName))) {
    return true;
  }
  if (poDesc && (poDesc === desc || poDesc.includes(desc) || desc.includes(poDesc))) {
    return true;
  }
  if (line.categoryCode && po.product_category) {
    if (categoryCodesRelated(line.categoryCode, String(po.product_category))) {
      return true;
    }
  }
  if (line.categoryName && po.product_category_name) {
    if (norm(line.categoryName) === norm(po.product_category_name)) return true;
  }
  return false;
}

function recencyScore(poDate: Date | string | null): number {
  if (!poDate) return 0;
  const d = poDate instanceof Date ? poDate : new Date(poDate);
  if (Number.isNaN(d.getTime())) return 0;
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years <= 1) return 15;
  if (years <= 3) return 10;
  if (years <= 5) return 5;
  return 2;
}

function formatDate(poDate: Date | string | null): string | null {
  if (!poDate) return null;
  const d = poDate instanceof Date ? poDate : new Date(poDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchActiveSosRows(): Promise<SosRow[]> {
  const result = await getPool().query(
    `SELECT b.id AS supplier_id, b.company_name,
            CAST(s.category_code AS TEXT) AS category_code,
            s.sub_category, s.good_service_code, s.service_details, s.dpworld_terminal
     FROM dbo.supp_scope_of_supply_service s
     JOIN dbo.supp_basic_org_dtls b ON s.supplier_id = b.id
     WHERE LOWER(TRIM(COALESCE(b.status, ''))) = 'active'
       AND LOWER(TRIM(COALESCE(b.status, ''))) NOT IN ('blocked', 'inactive')`,
  );
  return result.rows as SosRow[];
}

async function fetchHistoricalPosForLines(
  lines: NormalizedPrLine[],
): Promise<PoHistoryRow[]> {
  const itemIds = Array.from(
    new Set(lines.map((l) => l.itemId).filter(Boolean) as string[]),
  );
  const descriptions = Array.from(
    new Set(
      lines
        .map((l) => l.description)
        .filter((d) => d && d.trim().length >= 2)
        .map((d) => d.trim()),
    ),
  );
  const categoryCodes = Array.from(
    new Set(lines.map((l) => l.categoryCode).filter(Boolean) as string[]),
  );
  const categoryNames = Array.from(
    new Set(lines.map((l) => l.categoryName).filter(Boolean) as string[]),
  );

  if (
    itemIds.length === 0 &&
    descriptions.length === 0 &&
    categoryCodes.length === 0 &&
    categoryNames.length === 0
  ) {
    return [];
  }

  const cleanParams: any[] = [];
  const cleanConditions: string[] = [];

  if (itemIds.length > 0) {
    cleanParams.push(itemIds);
    cleanConditions.push(
      `(pl.item_id IS NOT NULL AND CAST(pl.item_id AS TEXT) = ANY($${cleanParams.length}::text[]))`,
    );
  }
  if (descriptions.length > 0) {
    cleanParams.push(descriptions.map((d) => d.toLowerCase()));
    cleanConditions.push(
      `(LOWER(TRIM(COALESCE(pl.item_name, ''))) = ANY($${cleanParams.length}::text[])
        OR LOWER(TRIM(COALESCE(pl.line_description, ''))) = ANY($${cleanParams.length}::text[]))`,
    );
  }
  if (categoryCodes.length > 0) {
    const prefixes = Array.from(
      new Set(categoryCodes.map((c) => c.substring(0, Math.min(4, c.length)))),
    );
    cleanParams.push(prefixes.map((p) => `${p}%`));
    cleanConditions.push(
      `(pl.product_category IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest($${cleanParams.length}::text[]) pref
          WHERE CAST(pl.product_category AS TEXT) LIKE pref
        ))`,
    );
  }
  if (categoryNames.length > 0) {
    cleanParams.push(categoryNames.map((n) => n.toLowerCase()));
    cleanConditions.push(
      `(LOWER(TRIM(COALESCE(pl.product_category_name, ''))) = ANY($${cleanParams.length}::text[]))`,
    );
  }

  if (cleanConditions.length === 0) return [];

  const query = `
    SELECT h.po_number, h.supplier_id, h.company_name, h.po_status,
           COALESCE(h.po_issue_date, h.creation_date) AS po_date,
           h.po_currency, h.delivertto_location_name,
           CAST(pl.item_id AS TEXT) AS item_id, pl.item_name, pl.line_description,
           pl.line_qty, pl.line_unit_cost,
           CAST(pl.product_category AS TEXT) AS product_category,
           pl.product_category_name
    FROM dbo.supp_po_line_dtls pl
    JOIN dbo.supp_po_header_dtls h ON h.po_number = pl.po_number
    WHERE h.supplier_id IS NOT NULL
      AND LOWER(TRIM(COALESCE(h.po_status, ''))) NOT IN (
        'draft', 'pending approval', 'rejected', 'cancelled'
      )
      AND (${cleanConditions.join(" OR ")})
    ORDER BY COALESCE(h.po_issue_date, h.creation_date) DESC NULLS LAST
    LIMIT 500
  `;

  try {
    const result = await getPool().query(query, cleanParams);
    return result.rows as PoHistoryRow[];
  } catch (err) {
    console.error("[pr-po-supplier-recommend] historical PO query failed:", err);
    return [];
  }
}

function buildReasoning(args: {
  vendorName: string;
  totalLines: number;
  scopeMatched: number;
  poMatched: number;
  evidence: PreviousPoEvidence[];
  locationOk: boolean | null;
  hasAnyPoHistoryInPool: boolean;
  isTop: boolean;
  coverage: "full" | "partial";
}): { reason: string; reasoningSummary: string; alternateReason?: string } {
  const {
    vendorName,
    totalLines,
    scopeMatched,
    poMatched,
    evidence,
    locationOk,
    hasAnyPoHistoryInPool,
    isTop,
    coverage,
  } = args;

  const parts: string[] = [];
  if (coverage === "full") {
    parts.push(
      `${vendorName} is within the approved scope of supply for all ${totalLines} requested PR item categor${totalLines === 1 ? "y" : "ies"}.`,
    );
  } else {
    parts.push(
      `${vendorName} matches scope of supply for ${scopeMatched} of ${totalLines} PR item${totalLines === 1 ? "" : "s"}.`,
    );
  }

  if (poMatched > 0) {
    const recent = evidence.slice(0, 3).map((e) => e.poNumber).join(", ");
    parts.push(
      `The supplier has supplied ${poMatched} of ${totalLines} requested item${totalLines === 1 ? "" : "s"} in previous POs` +
        (recent ? ` (e.g. ${recent})` : "") +
        ".",
    );
    if (evidence.length >= 2) {
      parts.push(
        `Previous PO data shows repeat procurement from this supplier for the requested item${totalLines === 1 ? "" : "s"}.`,
      );
    }
  } else if (!hasAnyPoHistoryInPool) {
    parts.push(
      "No previous PO evidence was found for the PR items; recommendation is based on scope of supply match only.",
    );
  } else {
    parts.push(
      "This supplier has no previous PO history for the requested PR items.",
    );
  }

  if (locationOk === true) {
    parts.push(
      "The supplier is eligible for the requested delivery location.",
    );
  } else if (locationOk === false) {
    parts.push(
      "Delivery location coverage could not be confirmed from supplier scope of supply.",
    );
  }

  const reasoningSummary = parts.join(" ");
  const reason =
    poMatched > 0
      ? `Scope ${coverage} (${scopeMatched}/${totalLines}); prior POs for ${poMatched} item${poMatched === 1 ? "" : "s"}`
      : `Active supplier with scope match on ${scopeMatched} of ${totalLines} item${totalLines === 1 ? "" : "s"}`;

  const alternateReason = !isTop
    ? poMatched === 0 && scopeMatched < totalLines
      ? "Lower ranking: partial scope match and no relevant PO history for the PR items."
      : poMatched === 0
        ? "Lower ranking: scope of supply matched but no previous PO history for these items."
        : scopeMatched < totalLines
          ? "Lower ranking: matched only part of the PR scope or had less recent PO evidence."
          : "Lower ranking: lower combined scope and historical PO score than the top recommendation."
    : undefined;

  return { reason, reasoningSummary, alternateReason };
}

export async function recommendSuppliersForPR(input: {
  prNumber?: string;
  lineItems: any[];
  deliveryLocation?: string | null;
}): Promise<RecommendSuppliersResult> {
  const lines = normalizeLines(input.lineItems);
  const deliveryLocation = input.deliveryLocation?.trim() || null;
  const missingDatapoints: string[] = [];

  if (lines.length === 0) {
    return {
      recommendationLevel: "none",
      noRecommendationReason:
        "No recommendation available: the PR has no line items to evaluate.",
      vendors: [],
    };
  }

  const hasCategory = lines.some((l) => l.categoryCode || l.categoryName);
  const hasItemId = lines.some((l) => l.itemId);
  if (!hasCategory) missingDatapoints.push("scope_of_supply_category");
  if (!hasItemId) missingDatapoints.push("item_material_code");
  if (!deliveryLocation) missingDatapoints.push("plant_location_coverage");

  let sosRows: SosRow[] = [];
  try {
    sosRows = await fetchActiveSosRows();
  } catch (err) {
    console.error("[pr-po-supplier-recommend] SOS fetch failed:", err);
    return {
      recommendationLevel: "none",
      noRecommendationReason:
        "No recommendation available: failed to load supplier scope of supply data.",
      missingDatapoints,
      vendors: [],
    };
  }

  // Group SOS by supplier
  const bySupplier = new Map<
    number,
    { name: string; sos: SosRow[]; lineMatches: Map<number, LineMatchType> }
  >();

  for (const row of sosRows) {
    let entry = bySupplier.get(row.supplier_id);
    if (!entry) {
      entry = { name: row.company_name, sos: [], lineMatches: new Map() };
      bySupplier.set(row.supplier_id, entry);
    }
    entry.sos.push(row);
  }

  for (const [supplierId, entry] of Array.from(bySupplier.entries())) {
    for (const line of lines) {
      let best: LineMatchType | null = null;
      for (const sos of entry.sos) {
        const m = matchLineToSos(line, sos);
        if (!m) continue;
        if (
          !best ||
          (m === "item_code" && best !== "item_code") ||
          (m === "category" && best === "description")
        ) {
          best = m;
        }
      }
      if (best) entry.lineMatches.set(line.lineNum, best);
    }
    if (entry.lineMatches.size === 0) {
      bySupplier.delete(supplierId);
    }
  }

  if (bySupplier.size === 0) {
    return {
      recommendationLevel: "none",
      noRecommendationReason:
        "No recommendation available: no active suppliers have scope of supply matching the PR item categories, item codes, or descriptions.",
      missingDatapoints: missingDatapoints.length ? missingDatapoints : undefined,
      vendors: [],
    };
  }

  const poRows = await fetchHistoricalPosForLines(lines);
  const hasAnyPoHistoryInPool = poRows.length > 0;
  if (!hasAnyPoHistoryInPool) {
    missingDatapoints.push("previous_po_history");
  }

  // Map supplier -> lineNums with PO evidence + evidence list
  type VendorScoreScratch = {
    name: string;
    scopeLineNums: Set<number>;
    scopeMatchTypes: Map<number, LineMatchType>;
    categories: Set<string>;
    poLineNums: Set<number>;
    evidence: PreviousPoEvidence[];
    bestPoDate: Date | null;
    locationOk: boolean | null;
  };

  const scratch = new Map<number, VendorScoreScratch>();

  for (const [supplierId, entry] of Array.from(bySupplier.entries())) {
    const categories = new Set<string>();
    for (const s of entry.sos) {
      if (s.category_code) categories.add(String(s.category_code));
      else if (s.sub_category) categories.add(s.sub_category);
    }

    let locationOk: boolean | null = null;
    if (deliveryLocation) {
      const terminals = entry.sos
        .map((s: SosRow) => s.dpworld_terminal)
        .filter((t: string | null): t is string => !!t && String(t).trim().length > 0);
      if (terminals.length > 0) {
        locationOk = terminals.some((t: string) =>
          locationMatches(t, deliveryLocation),
        );
      } else {
        locationOk = null; // unknown
      }
    }

    scratch.set(supplierId, {
      name: entry.name,
      scopeLineNums: new Set(Array.from(entry.lineMatches.keys())),
      scopeMatchTypes: entry.lineMatches,
      categories,
      poLineNums: new Set(),
      evidence: [],
      bestPoDate: null,
      locationOk,
    });
  }

  for (const po of poRows) {
    const sid = Number(po.supplier_id);
    const entry = scratch.get(sid);
    if (!entry) continue; // only score eligible SOS vendors

    for (const line of lines) {
      if (!matchPoToLine(line, po)) continue;
      entry.poLineNums.add(line.lineNum);
      const itemRef =
        po.item_name ||
        po.line_description ||
        line.description ||
        `Line ${line.lineNum}`;
      if (
        entry.evidence.length < 8 &&
        !entry.evidence.some((e) => e.poNumber === po.po_number && e.itemRef === itemRef)
      ) {
        entry.evidence.push({
          poNumber: String(po.po_number),
          poDate: formatDate(po.po_date),
          qty: toNum(po.line_qty),
          unitPrice: toNum(po.line_unit_cost),
          currency: po.po_currency ? String(po.po_currency) : null,
          location: po.delivertto_location_name || null,
          itemRef: String(itemRef),
        });
      }
      const d =
        po.po_date instanceof Date
          ? po.po_date
          : po.po_date
            ? new Date(po.po_date)
            : null;
      if (d && !Number.isNaN(d.getTime())) {
        if (!entry.bestPoDate || d > entry.bestPoDate) entry.bestPoDate = d;
      }
    }

    if (
      deliveryLocation &&
      entry.locationOk !== true &&
      po.delivertto_location_name &&
      locationMatches(po.delivertto_location_name, deliveryLocation)
    ) {
      entry.locationOk = true;
    }
  }

  const total = lines.length;
  const scored: Array<{
    supplierId: number;
    score: number;
    data: VendorScoreScratch;
  }> = [];

  for (const [supplierId, data] of Array.from(scratch.entries())) {
    const scopeMatched = data.scopeLineNums.size;
    const poMatched = data.poLineNums.size;
    const scopePts = (scopeMatched / total) * 50;
    const poPts = hasAnyPoHistoryInPool ? (poMatched / total) * 30 : 0;
    const recencyPts = hasAnyPoHistoryInPool
      ? recencyScore(data.bestPoDate)
      : 0;
    let locationPts = 0;
    if (data.locationOk === true) locationPts = 5;
    else if (data.locationOk === false) locationPts = 0;
    else locationPts = deliveryLocation ? 1 : 0; // mild credit when location unknown

    const score = Math.min(
      100,
      Math.round(scopePts + poPts + recencyPts + locationPts),
    );
    scored.push({ supplierId, score, data });
  }

  scored.sort((a, b) => {
    // Prefer full scope coverage
    const aFull = a.data.scopeLineNums.size === total ? 1 : 0;
    const bFull = b.data.scopeLineNums.size === total ? 1 : 0;
    if (bFull !== aFull) return bFull - aFull;
    // Prefer PO history
    const aPo = a.data.poLineNums.size;
    const bPo = b.data.poLineNums.size;
    if (bPo !== aPo) return bPo - aPo;
    return b.score - a.score;
  });

  const topN = scored.slice(0, 5);
  const top = topN[0];
  const topCoversAll = top.data.scopeLineNums.size === total;

  const vendors: VendorRecommendation[] = topN.map((row, idx) => {
    const scopeMatched = row.data.scopeLineNums.size;
    const poMatched = row.data.poLineNums.size;
    const coverage: "full" | "partial" =
      scopeMatched === total ? "full" : "partial";
    const matchedPrItems: MatchedPrItem[] = lines
      .filter((l) => row.data.scopeLineNums.has(l.lineNum))
      .map((l) => ({
        lineNum: l.lineNum,
        description: l.description || l.categoryName || `Line ${l.lineNum}`,
        matchType: row.data.poLineNums.has(l.lineNum)
          ? ("po_history" as const)
          : row.data.scopeMatchTypes.get(l.lineNum) || ("category" as const),
      }));

    const { reason, reasoningSummary, alternateReason } = buildReasoning({
      vendorName: row.data.name,
      totalLines: total,
      scopeMatched,
      poMatched,
      evidence: row.data.evidence,
      locationOk: row.data.locationOk,
      hasAnyPoHistoryInPool,
      isTop: idx === 0,
      coverage,
    });

    return {
      vendorId: String(row.supplierId),
      vendorName: row.data.name,
      matchScore: row.score,
      reason,
      reasoningSummary:
        idx === 0
          ? reasoningSummary +
            (topN.length > 1
              ? " Alternate vendors were not selected because they either matched only part of the PR scope or had less relevant PO history for the requested items."
              : "")
          : reasoningSummary,
      matchedPrItems,
      scopeOfSupplyMatch: {
        coverage,
        categories: Array.from(row.data.categories).slice(0, 12),
      },
      previousPoEvidence: row.data.evidence,
      alternateReason: idx === 0 ? undefined : alternateReason,
      qualificationStatus: "qualified",
    };
  });

  let recommendationLevel: RecommendationLevel = topCoversAll
    ? "full_pr"
    : "line";
  let lineRecommendations: LineRecommendation[] | undefined;

  if (!topCoversAll) {
    lineRecommendations = lines.map((line) => {
      let best:
        | { supplierId: number; score: number; data: VendorScoreScratch }
        | undefined;
      for (const row of scored) {
        if (!row.data.scopeLineNums.has(line.lineNum)) continue;
        if (!best || row.score > best.score) best = row;
      }
      if (!best) {
        return {
          lineNum: line.lineNum,
          description: line.description || `Line ${line.lineNum}`,
          vendorId: "",
          vendorName: "",
          matchScore: 0,
          reason: "No eligible supplier for this line",
        };
      }
      const hasPo = best.data.poLineNums.has(line.lineNum);
      return {
        lineNum: line.lineNum,
        description: line.description || `Line ${line.lineNum}`,
        vendorId: String(best.supplierId),
        vendorName: best.data.name,
        matchScore: best.score,
        reason: hasPo
          ? "Best scope match with previous PO history for this item"
          : "Best scope of supply match for this item",
      };
    });
  }

  return {
    recommendationLevel,
    missingDatapoints:
      missingDatapoints.length > 0 ? Array.from(new Set(missingDatapoints)) : undefined,
    vendors,
    lineRecommendations,
  };
}
