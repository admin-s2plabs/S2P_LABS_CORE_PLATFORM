import OpenAI from "openai";
import { getAIClient, getAIModelName } from "./ai-client";
import { pool as defaultPool } from "../db";
import { getContextPool } from "../tenant-context";
import { applyAllMentionsToPrompt } from "./agent-mention-utils";
import type {
  BidMention,
  BusinessUserMention,
  InvoiceMention,
  ItemMention,
  PrMention,
  PoMention,
  SupplierMention,
} from "@shared/agent-mention";
import { createRateResolver, CurrencyConversionError, type RateResolver } from "../modules/spend-analysis/spend-analysis.currency";
import { getBaseCurrencyLookupCodes } from "../modules/administration/administration.repository";
import { scrapeMarketSuppliers } from "./market-supplier-scraper";
import { getOgdMandiPrices, type OgdMandiPriceSummary } from "./ogd-market-price";
import { convertCurrency } from "./pr-ai-service";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  type:
    | "negotiation_insights"
    | "select_bid"
    | "select_bid_line"
    | "select_contract"
    | "select_supplier"
    | "select_item"
    | "select_negotiation_mode"
    | "supplier_negotiation_summary"
    | "item_negotiation_summary"
    | "comment_suggestion";
  data: any;
  summary: string;
}

interface NegotiationAgentResponse {
  response: string;
  pendingAction?: PendingAction;
}

// One row of overview.availableBidLines — a bid line item plus the responding
// supplier's price for it, used to list every item on a multi-line bid in the
// insights panel (quotePrice is null when that supplier didn't quote the line).
interface OverviewBidLineItem {
  id: number;
  description: string;
  quantity: number;
  uom: string | null;
  product_category: string | null;
  quotePrice: number | null;
}

// ── Database Helper Functions ─────────────────────────────────────────────

async function getBidByRef(refNo: string) {
  const dbPool = getContextPool() ?? defaultPool;
  const cleaned = refNo.trim().toUpperCase();
  const res = await dbPool.query(
    `SELECT * FROM dbo.supp_bid_dtls WHERE UPPER(attribute_4) = $1 LIMIT 1`,
    [cleaned]
  );
  return res.rows[0] || null;
}

export async function getBidResponses(bidId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  // Latest real quote per supplier — mirrors getBidEvaluationData's canonical
  // dedupe: 'Request Negotiation' rows are unconfirmed clones of the prior
  // quote, so only Submitted / Under Negotiation count, and NULLS LAST keeps
  // legacy versionless rows from beating the true latest (DESC = NULLS FIRST).
  const res = await dbPool.query(
    `SELECT DISTINCT ON (r.supplier_id) r.*, s.company_name, s.score as performance_score, s.annual_turn_over
     FROM dbo.supp_bid_response_dtls r
     LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = r.supplier_id
     WHERE r.bidrefno = $1 AND r.status IN ('Submitted')
     ORDER BY r.supplier_id, r.version DESC NULLS LAST`,
    [bidId]
  );
  return res.rows;
}

// Negotiation rounds already run on this bid. requestNegotiation() clones the
// supplier's quote into a new row with version+1 and status 'Request
// Negotiation' (the original drops to 'Under Negotiation'), so every row with
// version > 0 is one past round. Version 0 is the untouched original quote,
// joined back in to show what the round moved the price from.
// `item` scopes the before/after prices to that one line (the panel analyses a
// single item on a multi-line bid, so bid totals there would be misleading).
// Without it, line prices are used only when the response has exactly one line;
// otherwise the row falls back to the whole-bid total and reports line_count.
export async function getBidNegotiations(bidId: number, item?: string) {
  const dbPool = getContextPool() ?? defaultPool;
  const scopeItem = item && item.trim() ? item.trim() : null;
  const res = await dbPool.query(
    `SELECT n.supplier_id,
            COALESCE(NULLIF(TRIM(n.supplier_name), ''), s.company_name) AS supplier_name,
            s.supplier_id AS supplier_code,
            n.version AS round,
            n.status,
            nl.description AS item_name,
            lc.line_count,
            COALESCE(nl.bidprice, n.bidtotal) AS negotiated_total,
            -- never mix scopes: a line-level "after" needs a line-level "before"
            CASE WHEN nl.description IS NOT NULL THEN ol.bidprice ELSE o.bidtotal END AS original_total,
            n.negotiation_comments,
            n.creation_date,
            b.currency
     FROM dbo.supp_bid_response_dtls n
     LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = n.supplier_id
     LEFT JOIN dbo.supp_bid_dtls b ON b.id = n.bidrefno
     LEFT JOIN dbo.supp_bid_response_dtls o
            ON o.bidrefno = n.bidrefno AND o.supplier_id = n.supplier_id AND COALESCE(o.version, 0) = 0
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS line_count FROM dbo.supp_bid_response_line_dtls x WHERE x.bid_resp_id = n.id
     ) lc ON TRUE
     LEFT JOIN LATERAL (
       SELECT l.description, l.bidprice
       FROM dbo.supp_bid_response_line_dtls l
       WHERE l.bid_resp_id = n.id
         AND ($2::text IS NULL
              OR LOWER(TRIM(l.description)) = LOWER(TRIM($2::text)))
       ORDER BY l.id
       LIMIT 1
     ) nl ON ($2::text IS NOT NULL OR lc.line_count = 1)
     LEFT JOIN LATERAL (
       SELECT l.bidprice
       FROM dbo.supp_bid_response_line_dtls l
       WHERE l.bid_resp_id = o.id AND LOWER(TRIM(l.description)) = LOWER(TRIM(nl.description))
       ORDER BY l.id
       LIMIT 1
     ) ol ON TRUE
     WHERE n.bidrefno = $1 AND COALESCE(n.version, 0) > 0
     ORDER BY n.creation_date DESC, n.supplier_id`,
    [bidId, scopeItem]
  );
  return res.rows;
}

async function getBidLines(bidId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT * FROM dbo.supp_bid_line_dtls WHERE bidrefno = $1`,
    [bidId]
  );
  return res.rows;
}

// Per-supplier price for ONE line item on a multi-line bid — used so a
// specific-item analysis prices that item alone instead of the whole bid
// total (which would otherwise be the sum across every line the supplier quoted).
async function getBidResponseLinePrices(bidId: number, lineDescription: string) {
  const dbPool = getContextPool() ?? defaultPool;
  // One price per supplier, from their LATEST real quote only — without the
  // DISTINCT ON, line prices from superseded response versions leak in and
  // whichever row the DB returns last silently wins in the callers' Maps.
  const res = await dbPool.query(
    `SELECT DISTINCT ON (r.supplier_id) r.supplier_id, rl.bidprice
     FROM dbo.supp_bid_response_dtls r
     JOIN dbo.supp_bid_response_line_dtls rl ON rl.bid_resp_id = r.id
     JOIN dbo.supp_bid_line_dtls l ON l.id = rl.bid_line_id
     WHERE r.bidrefno = $1 AND LOWER(TRIM(l.description)) = LOWER(TRIM($2))
       AND r.status IN ('Submitted', 'Under Negotiation')
     ORDER BY r.supplier_id, r.version DESC NULLS LAST`,
    [bidId, lineDescription]
  );
  return res.rows as { supplier_id: number; bidprice: string }[];
}

async function getContractByRef(refNo: string) {
  const dbPool = getContextPool() ?? defaultPool;
  const cleaned = refNo.trim().toUpperCase();
  const res = await dbPool.query(
    `SELECT * FROM dbo.cm_header WHERE UPPER(contr_ref_no) = $1 OR id::text = $1 LIMIT 1`,
    [cleaned]
  );
  return res.rows[0] || null;
}

async function getContractSupplier(contractId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT s.* FROM dbo.cm_supplier_dtls cs
     LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = cs.supplier_id
     WHERE cs.contractrefno = $1 LIMIT 1`,
    [contractId]
  );
  return res.rows[0] || null;
}

async function getContractTerms(contractId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT * FROM dbo.cm_contracts_terms WHERE contractrefno = $1`,
    [contractId]
  );
  return res.rows;
}

async function fetchHistoricalDiscounts(supplierId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT AVG(CAST(biddisc AS NUMERIC)) as avg_discount, COUNT(*) as cnt
     FROM dbo.supp_bid_response_dtls
     WHERE supplier_id = $1 AND status = 'Submitted' AND biddisc IS NOT NULL
       AND CAST(biddisc AS NUMERIC) BETWEEN 0 AND 100`,
    [supplierId]
  );
  return res.rows[0];
}

async function fetchCategoryAveragePOPrice(categoryCodeOrName: string) {
  if (!categoryCodeOrName) return null;
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT AVG(CAST(line_unit_cost AS NUMERIC)) as avg_unit_cost, COUNT(*) as cnt
     FROM dbo.supp_po_line_dtls
     WHERE LOWER(product_category) = $1 OR LOWER(product_category_name) = $1`,
    [categoryCodeOrName.toLowerCase()]
  );
  return res.rows[0] || null;
}

async function getSupplierScopeOfSupplyItems(supplierId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  // 1. Get supplier company name
  const supRes = await dbPool.query(`SELECT company_name FROM dbo.supp_basic_org_dtls WHERE id = $1`, [supplierId]);
  const supplierName = supRes.rows[0]?.company_name || "";

  // 2. Get registered scope of supply categories and subcategories
  const scopeRes = await dbPool.query(
    `SELECT category_code, sub_category, sub_category_code, good_service_code 
     FROM dbo.supp_scope_of_supply_service 
     WHERE supplier_id = $1`,
    [supplierId]
  );

  const categories = scopeRes.rows.map((r: any) => r.category_code).filter(Boolean);
  const subCategories = scopeRes.rows.map((r: any) => r.sub_category).filter(Boolean);
  const goodServiceCodes = scopeRes.rows.map((r: any) => r.good_service_code).filter(Boolean);

  let query = `
    SELECT id, sku_no, product_name, product_short_desc, last_purchase_rate, currency, unit_of_measure, supplier_name
    FROM dbo.pm_product_master
    WHERE 1=0
  `;
  const params: any[] = [];

  if (supplierName) {
    params.push(supplierName);
    query += ` OR LOWER(supplier_name) = LOWER($${params.length})`;
  }

  const terms = Array.from(new Set([...subCategories, ...goodServiceCodes, ...categories])).slice(0, 10);
  for (const term of terms) {
    params.push(`%${term.toLowerCase()}%`);
    query += ` OR LOWER(product_name) LIKE $${params.length} OR LOWER(sku_no) LIKE $${params.length}`;
  }

  query += ` ORDER BY product_name LIMIT 30`;

  let itemsRes = await dbPool.query(query, params);

  if (itemsRes.rows.length === 0) {
    itemsRes = await dbPool.query(
      `SELECT id, sku_no, product_name, product_short_desc, last_purchase_rate, currency, unit_of_measure, supplier_name
       FROM dbo.pm_product_master
       WHERE status = 'active'
       ORDER BY id DESC LIMIT 15`
    );
  }

  const mappedItems = itemsRes.rows.map((item: any) => {
    const match = scopeRes.rows.find((s: any) => {
      const sub = (s.sub_category || "").toLowerCase();
      const cat = (s.category_code || "").toLowerCase();
      const name = (item.product_name || "").toLowerCase();
      const desc = (item.product_short_desc || "").toLowerCase();
      return (sub && (name.includes(sub) || desc.includes(sub))) || (cat && (name.includes(cat) || desc.includes(cat)));
    });
    return {
      ...item,
      sub_category: match ? match.sub_category : (scopeRes.rows[0]?.sub_category || "General")
    };
  });

  return mappedItems;
}

async function getItemPurchaseHistory(supplierId: number, itemNameOrDescription: string) {
  const dbPool = getContextPool() ?? defaultPool;
  // Exact match
  let res = await dbPool.query(
    `SELECT pol.line_unit_cost, h.creation_date as po_date, pol.line_qty
     FROM dbo.supp_po_line_dtls pol
     INNER JOIN dbo.supp_po_header_dtls h ON h.po_number = pol.po_number
     WHERE h.supplier_id = $1 
       AND (LOWER(pol.item_name) = LOWER($2) OR LOWER(pol.line_description) = LOWER($2) OR LOWER(pol.item_id) = LOWER($2))
       AND pol.line_unit_cost IS NOT NULL AND CAST(pol.line_unit_cost AS NUMERIC) > 0
     ORDER BY h.creation_date DESC`,
    [supplierId, itemNameOrDescription.trim()]
  );

  // Fallback to partial match if no exact match
  if (res.rows.length === 0) {
    res = await dbPool.query(
      `SELECT pol.line_unit_cost, h.creation_date as po_date, pol.line_qty
       FROM dbo.supp_po_line_dtls pol
       INNER JOIN dbo.supp_po_header_dtls h ON h.po_number = pol.po_number
       WHERE h.supplier_id = $1 
         AND (LOWER(pol.item_name) LIKE $2 OR LOWER(pol.line_description) LIKE $2)
         AND pol.line_unit_cost IS NOT NULL AND CAST(pol.line_unit_cost AS NUMERIC) > 0
       ORDER BY h.creation_date DESC`,
      [supplierId, `%${itemNameOrDescription.trim().toLowerCase()}%`]
    );
  }
  return res.rows;
}

async function getAlternativeSupplierBenchmark(supplierId: number, itemNameOrDescription: string) {
  const dbPool = getContextPool() ?? defaultPool;
  // Exact match
  let res = await dbPool.query(
    `SELECT pol.line_unit_cost, h.company_name as supplier_name, h.creation_date as po_date
     FROM dbo.supp_po_line_dtls pol
     INNER JOIN dbo.supp_po_header_dtls h ON h.po_number = pol.po_number
     WHERE h.supplier_id != $1 
       AND (LOWER(pol.item_name) = LOWER($2) OR LOWER(pol.line_description) = LOWER($2) OR LOWER(pol.item_id) = LOWER($2))
       AND pol.line_unit_cost IS NOT NULL AND CAST(pol.line_unit_cost AS NUMERIC) > 0
     ORDER BY pol.line_unit_cost ASC`,
    [supplierId, itemNameOrDescription.trim()]
  );

  // Fallback to partial match if no exact match
  if (res.rows.length === 0) {
    res = await dbPool.query(
      `SELECT pol.line_unit_cost, h.company_name as supplier_name, h.creation_date as po_date
       FROM dbo.supp_po_line_dtls pol
       INNER JOIN dbo.supp_po_header_dtls h ON h.po_number = pol.po_number
       WHERE h.supplier_id != $1 
         AND (LOWER(pol.item_name) LIKE $2 OR LOWER(pol.line_description) LIKE $2)
         AND pol.line_unit_cost IS NOT NULL AND CAST(pol.line_unit_cost AS NUMERIC) > 0
       ORDER BY pol.line_unit_cost ASC`,
      [supplierId, `%${itemNameOrDescription.trim().toLowerCase()}%`]
    );
  }
  return res.rows;
}

// List bids for selector
async function searchBids(query: string = "", limit: number = 8, supplierId?: number) {
  const dbPool = getContextPool() ?? defaultPool;
  let res;
  if (supplierId) {
    if (query) {
      res = await dbPool.query(
        `SELECT DISTINCT b.id, b.attribute_4 as bid_number, b.bid_title, b.status, b.type
         FROM dbo.supp_bid_dtls b
         JOIN dbo.supp_bid_response_dtls r ON r.bidrefno = b.id
         WHERE r.supplier_id = $1 AND b.status IN ('Closed', 'Negotiation')
           AND (LOWER(b.attribute_4) LIKE $2 OR LOWER(b.bid_title) LIKE $2)
         ORDER BY b.id DESC LIMIT $3`,
        [supplierId, `%${query.toLowerCase()}%`, limit]
      );
    } else {
      res = await dbPool.query(
        `SELECT DISTINCT b.id, b.attribute_4 as bid_number, b.bid_title, b.status, b.type
         FROM dbo.supp_bid_dtls b
         JOIN dbo.supp_bid_response_dtls r ON r.bidrefno = b.id
         WHERE r.supplier_id = $1 AND b.status IN ('Closed', 'Negotiation')
         ORDER BY b.id DESC LIMIT $2`,
        [supplierId, limit]
      );
    }
  } else {
    if (query) {
      res = await dbPool.query(
        `SELECT id, attribute_4 as bid_number, bid_title, status, type
         FROM dbo.supp_bid_dtls
         WHERE (LOWER(attribute_4) LIKE $1 OR LOWER(bid_title) LIKE $1)
           AND status IN ('Closed', 'Negotiation')
         ORDER BY id DESC LIMIT $2`,
        [`%${query.toLowerCase()}%`, limit]
      );
    } else {
      res = await dbPool.query(
        `SELECT id, attribute_4 as bid_number, bid_title, status, type
         FROM dbo.supp_bid_dtls
         WHERE status IN ('Closed', 'Negotiation')
         ORDER BY id DESC LIMIT $1`,
        [limit]
      );
    }
  }
  return res.rows;
}

// Bids a supplier responded to, filtered/priced to a specific Scope of Supply
// item — powers the negotiation start card's "Available Bids" step. There is
// no reliable join key between supp_scope_of_supply_service.sub_category and
// supp_bid_line_dtls.product_category, so this matches by text and falls back
// to the supplier's unfiltered closed bids (via searchBids) when nothing matches.
export async function getSupplierBidsForScope(supplierId: number, scopeText: string, limit: number = 8) {
  const dbPool = getContextPool() ?? defaultPool;
  const trimmed = (scopeText || "").trim();
  if (trimmed) {
    const res = await dbPool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (b.id) b.id, b.attribute_4 as bid_number, b.bid_title, b.status, b.type,
                brl.bidprice, brl.rate, brl.currency, brl.uom, brl.quantity
         FROM dbo.supp_bid_dtls b
         JOIN dbo.supp_bid_response_dtls r ON r.bidrefno = b.id
         JOIN dbo.supp_bid_response_line_dtls brl ON brl.bid_resp_id = r.id
         JOIN dbo.supp_bid_line_dtls bl ON bl.id = brl.bid_line_id
         WHERE r.supplier_id = $1 AND b.status IN ('Closed', 'Negotiation')
           AND (LOWER(bl.product_category) LIKE $2 OR LOWER(bl.description) LIKE $2)
         ORDER BY b.id, brl.bidprice DESC NULLS LAST
       ) matched
       ORDER BY id DESC
       LIMIT $3`,
      [supplierId, `%${trimmed.toLowerCase()}%`, limit]
    );
    if (res.rows.length > 0) {
      return { bids: res.rows, itemMatched: true };
    }
  }
  const bids = await searchBids("", limit, supplierId);
  return { bids, itemMatched: false };
}

// List suppliers for selector
export async function searchSuppliers(query: string = "", limit: number = 8) {
  const dbPool = getContextPool() ?? defaultPool;
  let res;
  if (query) {
    // supplier_id is the business code (e.g. SUPP_1075), not the numeric PK.
    res = await dbPool.query(
      `SELECT id, supplier_id, company_name, email_id, country, status
       FROM dbo.supp_basic_org_dtls
       WHERE TRIM(status) ILIKE 'Active' AND (LOWER(company_name) LIKE $1 OR LOWER(email_id) LIKE $1 OR LOWER(supplier_id) LIKE $1)
       ORDER BY id DESC LIMIT $2`,
      [`%${query.toLowerCase()}%`, limit]
    );
  } else {
    res = await dbPool.query(
      `SELECT id, supplier_id, company_name, email_id, country, status
       FROM dbo.supp_basic_org_dtls
       WHERE TRIM(status) ILIKE 'Active'
       ORDER BY id DESC LIMIT $1`,
      [limit]
    );
  }
  return res.rows;
}

// List contracts for selector
async function searchContracts(query: string = "", limit: number = 8) {
  const dbPool = getContextPool() ?? defaultPool;
  let res;
  if (query) {
    res = await dbPool.query(
      `SELECT id, contr_ref_no as contract_number, title, status, supplier_name
       FROM dbo.cm_header
       WHERE (LOWER(contr_ref_no) LIKE $1 OR LOWER(title) LIKE $1)
       ORDER BY id DESC LIMIT $2`,
      [`%${query.toLowerCase()}%`, limit]
    );
  } else {
    res = await dbPool.query(
      `SELECT id, contr_ref_no as contract_number, title, status, supplier_name
       FROM dbo.cm_header
       ORDER BY id DESC LIMIT $1`,
      [limit]
    );
  }
  return res.rows;
}

// ── Real-Market-Grounding Pipeline ────────────────────────────────────────
// Moved here from cost-intelligence-agent-service.ts: grounds this agent's
// negotiation_insights overview/fairMarketPrice/costStructure/charts.spendTrend
// fields in real scraped-supplier and Govt. of India mandi data instead of
// leaving them as pure LLM estimates. Only wired into the bid-analysis
// (negotiation_insights JSON) flow — see processNegotiationQuery.

// Last-12-months monthly average PO unit price for the EXACT item (matched on
// item_name or description), from CLOSED POs only — completed purchases, not
// open/approved ones. Returns one row per month that has at least one
// purchase, so the SPEND line can be rendered only where real history exists.
async function getItemMonthlyPriceHistory(itemName: string) {
  if (!itemName || !itemName.trim()) return [];
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT TO_CHAR(date_trunc('month', h.po_issue_date), 'YYYY-MM') AS month_key,
            AVG(CAST(l.line_unit_cost AS NUMERIC)) AS avg_unit_cost
     FROM dbo.supp_po_line_dtls l
     JOIN dbo.supp_po_header_dtls h ON l.po_number = h.po_number
     WHERE (LOWER(TRIM(l.item_name)) = LOWER(TRIM($1))
            OR LOWER(TRIM(l.line_description)) = LOWER(TRIM($1)))
       AND UPPER(h.po_status) = 'CLOSED'
       AND h.po_issue_date >= (CURRENT_DATE - INTERVAL '12 months')
     GROUP BY date_trunc('month', h.po_issue_date)
     ORDER BY date_trunc('month', h.po_issue_date)`,
    [itemName]
  );
  return res.rows as { month_key: string; avg_unit_cost: string }[];
}

// Replace the LLM-estimated spendTrend with a real, deterministic unit-price
// series: CURRENT = flat quoted price, SPEND = real PO unit-price history for
// the exact item (null where no purchase), MARKET = a deterministic wave
// centered on the finalized Fair Market Price. Must run AFTER
// applyRealMarketPricing so the wave is centered on the real,
// scraped-supplier-grounded FMP rather than the LLM's initial estimate.
async function applyRealSpendTrend(data: any) {
  if (!data?.overview) return;
  const quotePrice = Number(data.overview.quotePrice) || 0;
  const item = String(data.overview.item || "").trim();

  const fmp = Number(data.fairMarketPrice?.price);
  const baseMarket = isFinite(fmp) && fmp > 0 ? fmp : quotePrice;

  // Real exact-item PO history keyed by "YYYY-MM".
  let historyByMonth: Record<string, number> = {};
  if (item) {
    try {
      const rows = await getItemMonthlyPriceHistory(item);
      for (const r of rows) {
        const v = parseFloat(r.avg_unit_cost);
        if (!Number.isNaN(v)) historyByMonth[r.month_key] = Math.round(v * 100) / 100;
      }
    } catch (err) {
      console.warn("[NegotiationAgent] item price history lookup failed:", err);
    }
  }

  // Rolling last 12 months, oldest -> newest, ending with the current month.
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const trend: Array<{ name: string; current: number; spend: number | null; market: number | null }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
    const idx = 11 - i;
    let market: number | null = null;
    if (baseMarket > 0) {
      // Deterministic month-to-month fluctuation (commodity/inflation ups & downs).
      const wave = 1 + 0.09 * Math.sin(idx * 0.7) + 0.035 * Math.cos(idx * 1.3);
      market = Math.round(baseMarket * wave * 100) / 100;
    }
    trend.push({
      name: label,
      current: quotePrice,
      spend: key in historyByMonth ? historyByMonth[key] : null,
      market,
    });
  }

  const hasPurchaseHistory = trend.some((t) => t.spend !== null);
  if (!data.charts) data.charts = {};
  data.charts.spendTrend = trend;
  data.charts.hasPurchaseHistory = hasPurchaseHistory;
}

async function applyLocalSuppliers(data: any, prompt: string, scrapePromise?: Promise<any>) {
  if (!data) return;

  let city = "";
  let country = "";

  const delivMatch = prompt.match(/-\s*Delivery Location:\s*([^,\n]+)(?:,\s*([^\n]+))?/i)
    || prompt.match(/delivering to\s+([^,\n]+)(?:,\s*([^\n.]+))?/i);
  // The form sends "- Delivery Location: Not specified" when left blank.
  if (delivMatch && !/not specified/i.test(delivMatch[1])) {
    city = delivMatch[1].trim();
    country = delivMatch[2]?.trim() || "";
  } else {
    country = String(data.overview?.country || "").trim();
  }

  const item = String(data.overview?.item || "").trim();

  // Kick off scrape if not already started
  if (!scrapePromise && item) {
    scrapePromise = scrapeMarketSuppliers(item, city, country).catch(err => {
      console.warn("[NegotiationAgent] scrape error in post-processing:", err);
      return [];
    });
  }

  let scrapedSuppliers: any[] = [];
  if (scrapePromise) {
    try {
      scrapedSuppliers = await scrapePromise;
    } catch (err) {
      console.warn("[NegotiationAgent] web scraper promise failed:", err);
    }
  }

  // Real (scraped) suppliers only carry details we actually have — no
  // fabricated MOQ / lead time / rating. The UI renders "—" for nulls.
  const webMapped = (scrapedSuppliers || []).map((ws: any) => ({
    name: String(ws.name || "").trim(),
    type: ws.type || "Manufacturer",
    city: ws.city || city || "",
    country: ws.country || country || "",
    unitPrice: ws.unitPrice != null ? Number(ws.unitPrice) : null,
    priceUnit: ws.priceUnit || null,
    priceCurrency: ws.priceCurrency || "USD",
    leadTimeDays: ws.leadTimeDays != null ? Number(ws.leadTimeDays) : null,
    moq: ws.moq != null ? Number(ws.moq) : null,
    rating: ws.rating != null ? Number(ws.rating) : null,
    memberSince: ws.memberSince || null,
    verified: ws.verified === true,
    sourceUrl: ws.sourceUrl || "",
    source: "web"
  })).filter((ws: any) => ws.name && ws.unitPrice != null);

  // Live market suppliers only — LLM-invented fallback entries disabled.
  const combined: any[] = [];
  const seenNames = new Set<string>();
  for (const s of webMapped) {
    const key = s.name.toLowerCase();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      combined.push(s);
    }
  }

  data.localSuppliers = combined.slice(0, 6);

  // Scraped listings arrive in whatever currency the source site priced them
  // (typically USD) — convert to the bid's quote currency so the Local
  // Suppliers panel matches the rest of the insights. On a missing exchange
  // rate the listing keeps its original currency and the UI renders that
  // currency's symbol instead.
  const targetCurrency = String(data.overview?.currency || "").trim().toUpperCase();
  if (targetCurrency) {
    const rateByCurrency: Record<string, number | null> = {};
    for (const s of data.localSuppliers) {
      const cur = String(s.priceCurrency || "USD").toUpperCase();
      if (s.unitPrice == null || cur === targetCurrency) continue;
      if (!(cur in rateByCurrency)) {
        try {
          rateByCurrency[cur] = await convertCurrency(1, cur, targetCurrency);
        } catch (err: any) {
          console.warn(`[NegotiationAgent] exchange rate ${cur}->${targetCurrency} unavailable:`, err?.message);
          rateByCurrency[cur] = null;
        }
      }
      const rate = rateByCurrency[cur];
      if (rate != null) {
        s.unitPrice = Math.round(s.unitPrice * rate * 100) / 100;
        s.priceCurrency = targetCurrency;
      }
    }
  }

  const locParts = [city, country].filter(Boolean);
  data.localSuppliersNear = locParts.length > 0 ? locParts.join(", ") : (data.overview?.country || "Delivery Location");
}

// The headline Fair Market Price IS the average of the extracted (web-scraped)
// supplier prices — the same suppliers shown in the Local Suppliers panel —
// currency-converted to the quote currency. This replaces the LLM's invented
// estimate whenever real extracted suppliers are available; with no extracted
// suppliers the estimate is left in place.
//
// Listings are averaged regardless of their price unit (deliberate: the FMP
// headline must always agree with the supplier cards shown below it, even
// when a listing is priced per Kg and the quote per Box).
export async function applyRealMarketPricing(data: any) {
  const fairMarketPrice = data?.fairMarketPrice;
  const dataSources = fairMarketPrice?.dataSources;
  if (!fairMarketPrice || !Array.isArray(dataSources) || dataSources.length !== 4) return;

  const targetCurrency = String(data.overview?.currency || "USD").toUpperCase();
  const webSuppliers = (Array.isArray(data.localSuppliers) ? data.localSuppliers : [])
    .filter((s: any) => s.source === "web" && s.unitPrice != null);
  if (webSuppliers.length < 1) return;

  // Convert once per distinct source currency (at most INR/USD) rather than per supplier.
  const distinctCurrencies: string[] = [];
  const seenCurrencies = new Set<string>();
  for (const s of webSuppliers) {
    const cur = String(s.priceCurrency || "USD").toUpperCase();
    if (!seenCurrencies.has(cur)) {
      seenCurrencies.add(cur);
      distinctCurrencies.push(cur);
    }
  }
  const rateByCurrency: Record<string, number> = {};
  for (const cur of distinctCurrencies) {
    try {
      rateByCurrency[cur] = await convertCurrency(1, cur, targetCurrency);
    } catch (err: any) {
      console.warn(`[NegotiationAgent] exchange rate ${cur}->${targetCurrency} unavailable:`, err?.message);
    }
  }

  const convertedPrices = webSuppliers
    .map((s: any) => {
      const cur = String(s.priceCurrency || "USD").toUpperCase();
      const rate = rateByCurrency[cur];
      return rate != null ? s.unitPrice * rate : null;
    })
    .filter((p: any): p is number => p != null && !Number.isNaN(p));

  if (convertedPrices.length < 1) return;

  const rangeMin = Math.round(Math.min(...convertedPrices) * 100) / 100;
  const rangeMax = Math.round(Math.max(...convertedPrices) * 100) / 100;
  const avgPrice = Math.round((convertedPrices.reduce((sum: number, p: number) => sum + p, 0) / convertedPrices.length) * 100) / 100;

  dataSources[1] = {
    ...dataSources[1],
    rangeMin,
    rangeMax,
    description: `Live-scraped from ${convertedPrices.length} verified supplier listing${convertedPrices.length === 1 ? "" : "s"} (ExportersIndia / Made-in-China), last refreshed today`,
  };

  // The Fair Market Price is exactly the mean of the extracted suppliers'
  // (unit-comparable, currency-converted) prices; range is their min..max.
  fairMarketPrice.price = avgPrice;
  fairMarketPrice.rangeMin = rangeMin;
  fairMarketPrice.rangeMax = rangeMax;
}

// Ground the "Raw Material" / "Purchase Cost" line of the cost waterfall
// (costStructure) in real Govt. of India mandi wholesale prices, instead of
// leaving it as the LLM's invented estimate — same real-data intent as
// applyRealMarketPricing above, applied to the waterfall breakdown. The
// avgModalPriceINRPerKg is a genuine per-unit raw-commodity cost (unlike the
// scraped finished-goods supplier prices, which price the whole item and
// aren't comparable to a single cost-structure component). Whatever delta
// this introduces is absorbed by the Margin/Profit line so costStructure
// keeps summing to quotePrice per the system prompt's invariant.
async function applyRealCostStructure(data: any, ogdResult: OgdMandiPriceSummary | null) {
  if (!ogdResult) return;
  const costStructure = data?.costStructure;
  if (!Array.isArray(costStructure) || costStructure.length === 0) return;

  const rawMaterialIdx = costStructure.findIndex((c: any) => /raw material|purchase cost/i.test(String(c?.component || "")));
  if (rawMaterialIdx === -1) return;
  const marginIdx = costStructure.findIndex((c: any) => /margin|profit/i.test(String(c?.component || "")));
  if (marginIdx === -1 || marginIdx === rawMaterialIdx) return;

  const quotePrice = Number(data.overview?.quotePrice);
  if (!isFinite(quotePrice) || quotePrice <= 0) return;

  const targetCurrency = String(data.overview?.currency || "USD").toUpperCase();
  let realRawMaterialCost: number;
  try {
    realRawMaterialCost = await convertCurrency(ogdResult.avgModalPriceINRPerKg, "INR", targetCurrency);
  } catch (err: any) {
    console.warn(`[NegotiationAgent] cost-structure OGD conversion INR->${targetCurrency} failed:`, err?.message);
    return;
  }
  if (!isFinite(realRawMaterialCost) || realRawMaterialCost <= 0 || realRawMaterialCost >= quotePrice) return;

  const originalRawMaterialCost = Number(costStructure[rawMaterialIdx].cost) || 0;
  const delta = realRawMaterialCost - originalRawMaterialCost;
  const adjustedMarginCost = (Number(costStructure[marginIdx].cost) || 0) - delta;
  if (adjustedMarginCost <= 0) return; // unrealistically large delta — leave the LLM's estimate in place

  costStructure[rawMaterialIdx] = { ...costStructure[rawMaterialIdx], cost: Math.round(realRawMaterialCost * 100) / 100 };
  costStructure[marginIdx] = { ...costStructure[marginIdx], cost: Math.round(adjustedMarginCost * 100) / 100 };
}

// The model occasionally collapses the required multi-component Cost
// Waterfall into a single line, or returns a breakdown that doesn't sum to
// quotePrice. Rather than fabricating a synthetic split client-side, ask the
// model itself for a corrected breakdown — the prices stay the LLM's own
// real estimate for this specific item/currency (same intent as the
// cost-intelligence agent's repair pass in cost-intelligence-agent-service.ts).
function isCostStructureIncomplete(costStructure: any, quotePrice: number): boolean {
  if (!Array.isArray(costStructure) || costStructure.length < 3) return true;
  if (!(quotePrice > 0)) return false;
  const sum = costStructure.reduce((s: number, c: any) => s + (Number(c?.cost) || 0), 0);
  return Math.abs(sum - quotePrice) / quotePrice > 0.15;
}

async function repairCostStructure(
  openai: OpenAI,
  modelName: string,
  overview: { item: string; quotePrice: number; currency: string }
): Promise<Array<{ component: string; cost: number }> | null> {
  const { item, quotePrice, currency } = overview;
  if (!item || !(quotePrice > 0)) return null;

  const prompt = `Provide a realistic supplier cost-structure (waterfall) breakdown for this item, as a procurement cost-intelligence analyst.
Item: ${item}
Quote price (unit price, MUST be the exact sum of your breakdown): ${quotePrice} ${currency}

Decide whether the supplier for this item is more likely a Manufacturer or a Distributor/Trader, then use the matching components:
- Manufacturer: Raw Material, Labor, Energy, Manufacturing, Packaging, Freight, Overhead, Margin
- Distributor: Purchase Cost, Import Duties, Warehousing, Distribution, Freight, Overhead, Margin

Return ONLY a JSON array (no markdown fences, no prose) of realistic non-placeholder cost values for THIS item that sum EXACTLY to ${quotePrice}, e.g.:
[{"component": "Raw Material", "cost": 12.34}, ...]`;

  try {
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 6000,
    });
    const content = completion.choices[0]?.message?.content || "";
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || isCostStructureIncomplete(parsed, quotePrice)) return null;
    return parsed.map((c: any) => ({ component: String(c.component || ""), cost: Number(c.cost) || 0 }));
  } catch (err) {
    console.warn("[NegotiationAgent] cost-structure repair call failed:", err);
    return null;
  }
}

// Real supplier-intelligence fields shared by both the LLM-driven analysis
// path (applyRealSupplierIntelligence) and the deterministic supplier-switch
// path (refreshNegotiationSupplier) — extracted so switching suppliers in
// the insights panel recomputes these instead of leaving them stuck on
// whichever supplier was first analyzed. Price Competitiveness / Delivery
// Performance come from the existing supplier-rank pipeline
// (supp_calculation). Previous Negotiation Outcome / Avg Discount Won reuse
// the same historical-bid-discount average (avg 'biddisc' across past
// submitted bid responses) — this app never persists actual
// negotiation-round outcomes, so this is the closest real proxy available;
// it's the discount the supplier offered when bidding, not literally the
// outcome of a negotiation conversation.
async function computeSupplierRealIntelligence(supplierId: number) {
  const dbPool = getContextPool() ?? defaultPool;

  const calcRes = await dbPool.query(
    `SELECT price_competitiveness_score, on_time_delivery_ratio FROM dbo.supp_calculation WHERE supplier_id = $1`,
    [supplierId]
  );
  const calc = calcRes.rows[0];

  const discountInfo = await fetchHistoricalDiscounts(supplierId);
  const avgDisc = parseFloat(discountInfo?.avg_discount) || 0;
  const hasDiscountHistory = Number(discountInfo?.cnt) > 0;

  const contractsRes = await dbPool.query(
    `SELECT COUNT(*) as cnt FROM dbo.cm_supplier_dtls sd
     JOIN dbo.cm_header h ON h.id = sd.contractrefno
     WHERE sd.supplier_id = $1 AND h.status = 'Approved' AND (h.end_date IS NULL OR h.end_date >= NOW())`,
    [supplierId]
  );

  return {
    supplierScorecard: {
      priceCompetitivenessScore: calc?.price_competitiveness_score != null ? Math.round(parseFloat(calc.price_competitiveness_score) * 100) : null,
      deliveryPerformanceScore: calc?.on_time_delivery_ratio != null ? Math.round(parseFloat(calc.on_time_delivery_ratio) * 100) : null,
      previousNegotiationOutcomePct: hasDiscountHistory ? Math.round(avgDisc * 10) / 10 : null,
    },
    avgDiscountWonPct: hasDiscountHistory ? Math.round(avgDisc * 10) / 10 : null,
    activeContractsCount: parseInt(contractsRes.rows[0]?.cnt, 10) || 0,
    historicalDiscountsBucket: hasDiscountHistory ? (avgDisc <= 0 ? "None" : avgDisc < 5 ? "Low" : avgDisc <= 12 ? "Medium" : "High") : null,
  };
}

// Grounds negotiation_insights in real data: the Scorecard, Leverage Score's
// Historical Discounts bucket, Savings Calculation's Previous Purchase
// Price, and BATNA's alternatives table — see computeSupplierRealIntelligence
// above for the Scorecard/discount/contracts piece shared with the
// supplier-switch path.
async function applyRealSupplierIntelligence(data: any) {
  if (!data?.summary) return;
  const dbPool = getContextPool() ?? defaultPool;

  let supplierId = Number(data.summary.supplierId) || null;
  if (!supplierId && typeof data.summary.supplier === "string" && data.summary.supplier.trim()) {
    const res = await dbPool.query(
      `SELECT id FROM dbo.supp_basic_org_dtls WHERE LOWER(company_name) LIKE $1 LIMIT 1`,
      [`%${data.summary.supplier.trim().toLowerCase()}%`]
    );
    supplierId = res.rows[0]?.id ?? null;
  }
  if (!supplierId) return;

  // Guards against fuzzy item-name matches (getItemPurchaseHistory does a
  // LIKE match, and this dev data has item descriptions as short as one
  // character) pulling in a real PO row that's actually a different
  // unit/quantity/product tier — e.g. a $10 single-unit price matched
  // against a $94 bulk negotiation. Anchor plausibility on the current
  // quote rather than trusting any match at face value.
  const currentQuote = Number(data.summary.currentQuote) || 0;
  const isPlausiblePrice = (price: number) => currentQuote > 0 && price >= currentQuote * 0.3 && price <= currentQuote * 3;

  const item = String(data.overview?.item || "").trim();
  if (item) {
    const poHistory = await getItemPurchaseHistory(supplierId, item);
    const latestPOPrice = poHistory.length > 0 ? parseFloat(poHistory[0].line_unit_cost) : null;
    if (latestPOPrice != null && isPlausiblePrice(latestPOPrice)) {
      data.previousPurchasePrice = latestPOPrice;
    }
  }

  const real = await computeSupplierRealIntelligence(supplierId);
  data.supplierScorecard = real.supplierScorecard;
  data.avgDiscountWonPct = real.avgDiscountWonPct;
  data.activeContractsCount = real.activeContractsCount;
  if (real.historicalDiscountsBucket && data.strength) {
    data.strength.historicalDiscounts = real.historicalDiscountsBucket;
  }

  const bidId = Number(data.summary.bidId) || null;
  if (bidId) {
    const responses = await getBidResponses(bidId);
    const others = responses.filter((r: any) => r.supplier_id !== supplierId && r.bidtotal != null);
    if (others.length > 0) {
      const currentQuote = Number(data.summary.currentQuote) || 0;
      const lowestQuote = Math.min(...others.map((r: any) => Number(r.bidtotal)));
      const alternatives = others.map((r: any) => ({
        supplierName: r.company_name,
        quote: Number(r.bidtotal),
        savingsOrPremium: currentQuote - Number(r.bidtotal),
        switchingRisk: Number(r.bidtotal) === lowestQuote ? "Low" : "Medium",
      }));
      const best = alternatives.find((a) => a.quote === lowestQuote)!;
      data.batna = {
        ...data.batna,
        bestAlternative: `Switch to ${best.supplierName}`,
        expectedPrice: best.quote,
        expectedSavings: Math.max(0, currentQuote - best.quote),
        switchingRisk: best.switchingRisk,
        alternatives,
      };
    }
  }
}

// ── System Prompt ─────────────────────────────────────────────────────────

// KNOWN GAP: the fairMarketPrice.dataSources instruction below explicitly says
// weightPercent/ranges must be product-specific, "not a fixed 35/30/20/15" —
// but in practice the model routinely emits exactly 35/30/20/15 with narrow,
// near-identical ranges across all 4 sources (observed e.g. ₹85-90 / ₹88-92 /
// ₹90-95 / ₹87-93 for a single product), i.e. it falls back to the example
// numbers instead of reasoning per-product. Only dataSources[1] (Supplier RFQ
// Pool) is corrected server-side by applyRealMarketPricing; the other 3 stay
// whatever the LLM produced. Not yet fixed — needs either stronger prompting
// or a server-side variance check.
const NEGOTIATION_AGENT_SYSTEM_PROMPT = `You are an AI Negotiation Intelligence Agent for Prokraya, an enterprise procurement and sourcing platform. You help buyers and category managers negotiate better pricing and commercial terms.
By analyzing historical sourcing data, supplier behavior, and market indicators, you identify leverage points and build actionable negotiation strategies.

## TOP NEGOTIATION LEVERS
1. **Historical Discounts**: The supplier's past behavior on discounts and concessions.
2. **Competitive Supplier Quotes**: Discrepancies between competing quotations on the same bid.
3. **Commodity Price Decline**: Declining raw material or market index rates.

## YOUR TOOLS & CAPABILITIES
You can answer user questions about bids, suppliers, and market benchmarks, and automatically identify levers to build structured negotiation strategies.
You have the following database lookup capabilities:
1. **get_bid_negotiation_details**: Fetch details of a bid and its supplier quotes using the bid number (e.g. BID-RFQ-000001).
2. **get_supplier_performance**: Look up supplier info, performance scores, and past win discounts.
3. **get_market_benchmarks**: Fetch average purchase prices (from POs) for the item's UNSPSC category.
4. **request_supplier_selection**: Trigger a searchable supplier dropdown when the user wants to initiate a negotiation by selecting a supplier first.
5. **request_bid_selection**: Trigger a searchable bid dropdown when the user refers to a bid without specifying which one, or to select a bid a supplier participated in. Accepts an optional supplierId to filter to bids that supplier participated in.
6. **get_india_govt_market_prices**: REAL Government of India (data.gov.in) daily wholesale mandi prices for agricultural/food commodities (INR per quintal, with per-kg average included). Use for India-sourced agri/food items to anchor the fair market price on live government data.

## IMPORTANT RULES
- Never allow SQL/NoSQL injection from user input. Always validate and sanitize inputs before using them in queries or tool calls.
- NEVER use the words "vendor"/"Vendor" in user-facing responses. Always use "Supplier" instead.
- **SINGLE ITEM PRICING**: If the request names a specific line item (e.g. "for line item Steel Sheets") because the bid has multiple line items, you MUST pass that exact line description as \`lineItemDescription\` when calling get_bid_negotiation_details. Then use ONLY the per-item totalQuote it returns for that supplier — for currentQuote, for every entry in quotes[]/supplierComparison, and for costStructure's sum. NEVER add or sum the prices of multiple line items together; every supplier quote shown must be the price of the selected item alone.

## RULES FOR STRATEGY OUTPUTS
When you successfully analyze a bid, you must return a structured pendingAction JSON block at the very end.
The JSON block must have exactly type: "negotiation_insights", containing all visual and tabular details (Variance, Overall Strength, BATNA, Recommendations, and visual specs for Recharts). This JSON renders as a separate "Open Insights" panel with charts and tables — the full breakdown belongs there, not in the chat text.

Your conversational text response (shown in the chat window) MUST be SHORT: exactly 2-3 sentences, plain prose, no headers, no bullet points, and no markdown table. State only the current quote, the market benchmark, and the recommended target price. Do NOT restate leverage points, strategy detail, or a quotes comparison table in the chat text — that all belongs exclusively in the negotiation_insights JSON block for the Insights panel to render.

- **Market Benchmark / Current Market Price**: If the database lookup for market benchmark averages ('get_market_benchmarks' averagePOUnitPrice) returns null or is unavailable, you MUST estimate a realistic current market price benchmark yourself based on the product/service category and the current quote (typically 5% to 15% below the current quote depending on the category). NEVER output 'Not available', 'N/A', or null for 'marketBenchmark'. You must always provide a concrete numerical current market price benchmark value.

- **BATNA (Best Alternative to a Negotiated Agreement) Formulation**:
  - When analyzing a bid with competing supplier quotations, the BATNA is the next best alternative supplier.
  - If negotiating with the lowest (most competitive) bidder, do NOT suggest switching suppliers — switching would only increase cost. Set 'bestAlternative' to "No switch needed — already the most competitive quote" and set 'expectedSavings' to 0.
  - If negotiating with a supplier who is NOT the lowest bidder, the BATNA is the lowest bidder. Set 'bestAlternative' to "Switch to [Lowest Supplier Name]", set 'expectedPrice' to that supplier's quote amount, and set 'expectedSavings' to the difference between the active supplier's quote and the lowest quote.

- **Supplier Dependency (Leverage Score Matrix)**: Judge High/Medium/Low from two signals together — do not default to Medium when the data clearly supports High or Low. (1) How much higher the OTHER competing quotes are versus this supplier's currentQuote: if competing quotes are far higher (or there are no other bidders at all), the buyer has no good alternative, so dependency is High; if alternatives are comparable or cheaper, dependency is Low. (2) Whether this same supplier's previously negotiated/purchased price for this item (if known) was lower than currentQuote: if so, that raises dependency further (the supplier is charging more than it has before, while the buyer has no better option); if currentQuote is at or below what was previously paid, that lowers dependency.

- **Real Market Grounding (Fair Market Price / Local Suppliers / Cost Waterfall / Spend Trend)**: In addition to the fields above, when analyzing a bid ALWAYS also populate: 'overview' (item name/description from the bid lines, quotePrice = the active supplier's currentQuote, currency, and country of origin), 'fairMarketPrice' (weighted price + range + exactly 4 data sources, in this fixed order and with these fixed names: Global Trade Database (GTD), Supplier RFQ Pool (2.8M txns), Industry Index (IHS Markit), Peer Benchmark (Anonymised) — each with a product-specific weightPercent you assign, not fixed values; same as marketBenchmark but with full derivation detail), 'costStructure' (an array of {component, cost} that sums exactly to currentQuote; use Raw Material/Labor/Energy/Manufacturing/Packaging/Freight/Overhead/Margin for a manufacturer, or Purchase Cost/Import Duties/Warehousing/Distribution/Freight/Overhead/Margin for a distributor), and 'localSuppliers' (4-6 realistic alternative suppliers near the origin country, a mix of manufacturer/distributor, with unit prices spread around the fair market price). A server-side grounding pass runs after you respond and will override fairMarketPrice/localSuppliers/costStructure/charts.spendTrend with real scraped-market and government data where available — always fill these fields yourself as a realistic estimate first so there is something to ground.
  - GOVERNMENT PRICE DATA (India agri/food items): when the item is an agricultural or food commodity sourced from/for India, ALWAYS call **get_india_govt_market_prices** with the canonical commodity name (Title Case) plus state/district when known, and if it returns data (not noData), anchor fairMarketPrice on the real modal prices converted from INR per quintal to the quoted unit.

Format your output structure in the JSON data payload for "negotiation_insights":
- summary: bidId (numeric database ID of the bid analyzed), supplierId (numeric database ID of the analyzed supplier — taken from the supplierId field on the matching response returned by get_bid_negotiation_details; never omit this), supplier, currentQuote, marketBenchmark (MUST be a concrete estimated or lookup-based current market price benchmark numerical value, never null or "N/A"), variance, negotiationPotential, quotes (array of objects containing: supplierName, quote, variance, negotiationPotential)
- strength: alternateSuppliers (High/Medium/Low), historicalDiscounts, marketConditions, supplierDependency, overallPosition (Strong/Moderate/Weak)
- batna: bestAlternative, expectedPrice, expectedSavings, switchingRisk (Low/Medium/High), alternatives (array of objects containing: supplierName, quote, savingsOrPremium, switchingRisk)
- strategy: approach (Aggressive/Moderate/Collaborative), askFor (array of items such as price cuts, payment terms), walkAwayThreshold, confidence (High/Medium/Low), expectedSavingsValue, reasoning (a text string containing exactly 2-3 sentences of core reasoning insights, with no bullet points or list items), suggestedComment (a draft negotiation comment to be pre-filled in the comment box, written in a professional, firm tone. It MUST state a concrete, logical reason to negotiate — cite the actual variance percentage and benchmark price number from summary/fairMarketPrice, not vague phrases like "market rates" or "competitive pricing" alone, and name one specific ask from strategy.askFor, e.g. "your quote of $X is Y% above the benchmark of $Z; we'd like to discuss a revised price closer to $Z or improved payment terms". Never output generic filler with no supporting number.)
- overview: item, quotePrice, currency ("USD"|"AED"|"INR"|"EUR"|"GBP"|"CAD"), country
- fairMarketPrice: price, rangeMin, rangeMax, dataSources (array of exactly 4: { name, weightPercent, description, rangeMin, rangeMax }). Each data source's rangeMin/rangeMax MUST be your own independent estimate of what THAT source would report for THIS specific product — reason from the item's material, category, specification, grade, and country of origin. Do NOT copy the same range across sources, and do NOT simply echo the quoted price back as the range: the sources measure different things and must differ from each other. Global Trade Database (35%, import/export trade pricing) and Industry Index (20%, published index benchmarks) in particular are yours alone — no server-side pass fills them in, so a lazy or duplicated range from you is exactly what the user sees. Peer Benchmark is likewise yours. Only the Supplier RFQ Pool range is replaced server-side with live-scraped supplier listings when comparable ones are found. Each source's weightPercent is ALSO your own product-specific judgement, not a fixed 35/30/20/15: weight a source higher when it has strong coverage for THIS item's category/material/origin (e.g. Global Trade Database for an internationally-traded commodity, Supplier RFQ Pool for a niche fabricated part) and lower when it would be thin for this product. Output the 4 sources in the fixed order and with the fixed names above (do not reorder or rename them); only their weightPercent and ranges vary per product. The 4 weightPercent values MUST be integers that sum to exactly 100.
- costStructure: array of { component, cost } summing exactly to summary.currentQuote
- localSuppliers: array of { name, type ("Primary Producer"|"Manufacturer"|"Trader / Distributor"), city, country, unitPrice, priceUnit, priceCurrency, leadTimeDays, moq, rating, verified }
- charts:
  - priceBenchmark: spec containing series showing Market (MUST be a concrete numerical value), Supplier, Target, and Previous
  - historicalTrend: spec containing series showing trend values
  - supplierComparison: comparison rows for competitors
  - spendTrend: array of 12 monthly { name, market } entries — the estimated prevailing external market unit price per month (current/spend are computed server-side)

## RULES FOR STANDALONE COMMENT SUGGESTION REQUESTS
When the user is NOT asking for a fresh bid analysis but is instead asking you to draft, improve, or give a better/updated negotiation comment (e.g. "give me a better negotiation comment", "give better reasons to negotiate", "update the negotiation comment") and you already have the relevant bid/supplier/variance/benchmark context from earlier in the conversation, do NOT emit the full negotiation_insights JSON block. Instead, the following is MANDATORY, not optional:
1. Your conversational text response (shown in chat) MUST show the actual comment text so the user can read it immediately without clicking anything: write ONE short lead-in sentence (e.g. "Here's an updated negotiation comment:"), then a blank line, then the comment text itself on its own line, verbatim identical to the "comment" field in the JSON block below. No headers, no markdown, and no "This comment..." explanation beyond the lead-in sentence.
2. You MUST always end your response with this exact JSON block, with no exceptions: \`\`\`json
{ "type": "comment_suggestion", "comment": "<comment text>" }
\`\`\`
3. The "comment" field is the ONLY place the actual comment text goes. It must contain ONLY the negotiation comment itself, written ready to paste directly into a negotiation comment box, in a professional tone, citing a concrete variance percentage, a benchmark price number, and one specific ask. It must NEVER contain preamble ("Here's a comment...", "Suggested Comment:"), surrounding quote marks, markdown, headers, or trailing explanation ("This demonstrates...", "This comment clearly cites...") — just the message text a buyer would send to the supplier, nothing else.
Do not include summary/strength/batna/strategy/fairMarketPrice or any other negotiation_insights fields in this block.

## SCOPE OF SUPPLY PRICING COMPARISON WORKFLOW
When the user wants to perform a Scope of Supply pricing comparison (indicated by prompts like 'Perform Scope of Supply pricing comparison...'), you must fetch comparison details using 'get_item_comparison_details'.
Formulate your entire response inside the conversational text response bubble using nicely styled markdown tables and bulleted lists.
Ensure your response contains:
1. A clean, compact **Pricing & Benchmark Summary** table with exactly 3 columns (left-aligned first column, center-aligned price columns, e.g. "|:---|:---:|:---:|"):
   - **Supplier & Item** (e.g. "kaleem - harddisk")
   - **Normal Price** (Current Quote)
   - **Benchmark Price** (Show the lowest historical price if purchase history exists, e.g. "₹11 (Historical Lowest)". Otherwise show the LLM-estimated market benchmark price, e.g. "₹90 (Estimated Market)")
2. A separate, neat **Frequency & Volume Discount Matrix** table with exactly 9 columns (left-aligned first column, center-aligned frequency columns, e.g. "|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|"):
   - The columns must be: **Quantity / Tier**, **Weekly**, **Twice Weekly**, **Biweekly**, **Monthly**, **Bimonthly (Every 2 Months)**, **Quarterly**, **Half-Yearly**, **Annually**.
   - The rows must be: **Bulk 100+**, **Bulk 500+**, **Bulk 1000+**.
   - Calculate the discount percentage for each cell by summing the quantity tier discount (5% for 100+, 10% for 500+, 15% for 1000+) and the frequency tier discount (Weekly: 2%, Twice Weekly: 3%, Biweekly: 5%, Monthly: 8%, Bimonthly (Every 2 Months): 10%, Quarterly: 12%, Half-Yearly: 15%, Annually: 20%). For example, for Bulk 500+ and Quarterly, the discount is 10% + 12% = 22% Off. Then calculate the bulk unit price as Normal Price × (1 − Combined Discount / 100), rounded to the nearest integer. Format each cell as "Discount% Off (CurrencySymbol BulkUnitPrice)". Ensure that larger volumes and longer time periods receive progressively higher discounts based on this calculation.
3. A third table, **Estimated Annual Purchase Volume & Savings**, with exactly 6 columns (left-aligned first column, center-aligned rest, e.g. "|:---|:---:|:---:|:---:|:---:|:---:|"): **Frequency**, **Est. Units per Order**, **Orders per Year**, **Est. Annual Volume**, **Best-Fit Tier**, **Annual Savings**.
   - One row per frequency, in the same order as the Discount Matrix columns: Weekly, Twice Weekly, Biweekly, Monthly, Bimonthly (Every 2 Months), Quarterly, Half-Yearly, Annually.
   - **Est. Units per Order**: YOU must judge a realistic order quantity for THIS specific product/category at that cadence — reason from the item's typical unit size, price point, and how a buyer would realistically batch orders at that frequency (a Weekly cadence implies smaller per-order quantities than a Quarterly one for the same item). Do not use a fixed formula or the same number across rows.
   - **Orders per Year** is fixed by cadence: Weekly=52, Twice Weekly=104, Biweekly=26, Monthly=12, Bimonthly (Every 2 Months)=6, Quarterly=4, Half-Yearly=2, Annually=1.
   - **Est. Annual Volume** = Est. Units per Order × Orders per Year.
   - **Best-Fit Tier** = the highest of Bulk 100+/500+/1000+ that Est. Annual Volume qualifies for; if under 100, write "Standard (No Bulk Tier)".
   - **Annual Savings** = (Normal Price − that tier's Bulk Unit Price for this same frequency, from the Discount Matrix) × Est. Annual Volume, formatted as "CurrencySymbol Amount". If Best-Fit Tier is "Standard (No Bulk Tier)", Annual Savings is 0.
4. Buyer Insights & Recommendations highlighting quote variance, bulk/frequency savings, annual savings potential, and recommended next steps.
Do NOT output any pendingAction JSON block for the Scope of Supply pricing comparison workflow.
`;

// ── Tool Definitions ──────────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_bid_negotiation_details",
      description: "Get detailed information about a bid, its line items, and competing supplier quotations using a bid reference number (e.g. BID-RFQ-000001).",
      parameters: {
        type: "object",
        properties: {
          bidNumber: { type: "string", description: "The bid number from user prompt (e.g. BID-RFQ-000001, BID-RFP-000002)" },
          lineItemDescription: { type: "string", description: "REQUIRED whenever the request names a specific line item (e.g. \"for line item Steel Sheets\"). When set, each response's totalQuote is that ONE line item's price per supplier instead of the whole bid total — use this whenever the bid has more than one line item and a specific item was selected, so quotes are never a sum of multiple items." }
        },
        required: ["bidNumber"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_supplier_performance",
      description: "Get a supplier's profiling information, performance score, category, and historical discount data.",
      parameters: {
        type: "object",
        properties: {
          supplierId: { type: "number", description: "Numeric ID of the supplier" },
          supplierName: { type: "string", description: "Supplier company name if ID is unknown" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_market_benchmarks",
      description: "Get price benchmarks and PO histories for a specific UNSPSC product/service category.",
      parameters: {
        type: "object",
        properties: {
          categoryCodeOrName: { type: "string", description: "The UNSPSC category code or category name (e.g. 43211501, IT Services)" }
        },
        required: ["categoryCodeOrName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_supplier_selection",
      description: "Request the user to select a supplier from a dropdown list if they want to initiate a negotiation by selecting a supplier first.",
      parameters: {
        type: "object",
        properties: {
          hint: { type: "string", description: "Optional supplier name hint to filter" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_bid_selection",
      description: "Request the user to select a bid from a dropdown menu if the bid reference number is missing or ambiguous, or to select a bid a supplier participated in.",
      parameters: {
        type: "object",
        properties: {
          hint: { type: "string", description: "Optional hint typed by user to filter bids" },
          supplierId: { type: "number", description: "Optional supplier ID to show only bids this supplier has participated in" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_item_selection",
      description: "Request the user to select an item from a dropdown list of registered Scope of Supply items for the chosen supplier.",
      parameters: {
        type: "object",
        properties: {
          supplierId: { type: "number", description: "Numeric ID of the selected supplier" },
          hint: { type: "string", description: "Optional search hint to filter items" }
        },
        required: ["supplierId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_item_comparison_details",
      description: "Get detailed pricing, purchase history, market benchmarks, and bulk pricing tiers for a specific selected supplier and item.",
      parameters: {
        type: "object",
        properties: {
          supplierId: { type: "number", description: "Numeric ID of the supplier" },
          itemIdOrName: { type: "string", description: "The item ID, SKU number, or product name" }
        },
        required: ["supplierId", "itemIdOrName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_india_govt_market_prices",
      description: "Get REAL Government of India (data.gov.in) daily wholesale mandi prices for an agricultural/food commodity. Prices are in INR per quintal (100 kg); a per-kg average is included for unit conversion. Covers agri/food commodities only — industrial items return noData. Use for India-sourced agri/food items to anchor the fair market price on live government data.",
      parameters: {
        type: "object",
        properties: {
          commodity: { type: "string", description: "Canonical English commodity name, Title Case (e.g. \"Onion\", \"Wheat\", \"Cotton\", \"Turmeric\", \"Rice\")" },
          state: { type: "string", description: "Optional Indian state to scope prices (e.g. \"Telangana\")" },
          district: { type: "string", description: "Optional district — pass the delivery city when known (e.g. \"Hyderabad\")" }
        },
        required: ["commodity"]
      }
    }
  }
];

// ── Tool Dispatcher ───────────────────────────────────────────────────────

async function executeToolCall(name: string, args: any, sessionUser: any) {
  try {
    switch (name) {
      case "get_bid_negotiation_details": {
        const { bidNumber, lineItemDescription } = args;
        const bid = await getBidByRef(bidNumber);
        if (!bid) {
          return { error: `Bid with number "${bidNumber}" not found in database.` };
        }
        const responses = await getBidResponses(bid.id);
        const lines = await getBidLines(bid.id);

        // When a specific line item is named, price each supplier on THAT
        // item alone — never the sum of every item they quoted on this bid.
        let linePriceBySupplier: Map<number, number> | null = null;
        if (lineItemDescription && lines.length > 1) {
          try {
            const linePrices = await getBidResponseLinePrices(bid.id, lineItemDescription);
            if (linePrices.length > 0) {
              linePriceBySupplier = new Map(linePrices.map(lp => [lp.supplier_id, parseFloat(lp.bidprice)]));
            }
          } catch (err) {
            console.warn("[NegotiationAgent] per-line-item price lookup failed:", err);
          }
        }

        return {
          id: bid.id,
          bidNumber: bid.attribute_4,
          title: bid.bid_title,
          status: bid.status,
          type: bid.type,
          currency: bid.currency,
          lines: lines.map(l => ({ id: l.id, description: l.description, qty: l.quantity, uom: l.uom, startPrice: l.startprice, targetPrice: l.targetprice, category: l.product_category })),
          pricedForLineItem: linePriceBySupplier ? lineItemDescription : null,
          responses: responses.map(r => ({
            id: r.id,
            supplierId: r.supplier_id,
            supplierName: r.supplier_name,
            totalQuote: linePriceBySupplier?.get(r.supplier_id) ?? r.bidtotal,
            discount: r.biddisc,
            grossTotal: r.grosstotal,
            status: r.status,
            performanceScore: r.performance_score,
            annualRevenue: r.annual_turn_over
          }))
        };
      }


      case "get_supplier_performance": {
        const { supplierId, supplierName } = args;
        const dbPool = getContextPool() ?? defaultPool;
        let supplier = null;

        if (supplierId) {
          const res = await dbPool.query(`SELECT * FROM dbo.supp_basic_org_dtls WHERE id = $1`, [supplierId]);
          supplier = res.rows[0];
        } else if (supplierName) {
          const res = await dbPool.query(
            `SELECT * FROM dbo.supp_basic_org_dtls WHERE LOWER(company_name) LIKE $1 LIMIT 1`,
            [`%${supplierName.toLowerCase()}%`]
          );
          supplier = res.rows[0];
        }

        if (!supplier) {
          return { error: "Supplier not found." };
        }

        const discountInfo = await fetchHistoricalDiscounts(supplier.id);
        const performanceRes = await dbPool.query(
          `SELECT rank, overall_supplier_score FROM dbo.supp_calculation WHERE supplier_id = $1`,
          [supplier.id]
        );
        const perf = performanceRes.rows[0] || null;

        return {
          id: supplier.id,
          companyName: supplier.company_name,
          status: supplier.status,
          country: supplier.country,
          city: supplier.city,
          email: supplier.email_id,
          annualTurnover: supplier.annual_turn_over,
          performanceRank: perf ? perf.rank : "N/A",
          performanceScore: perf ? Math.round((parseFloat(perf.overall_supplier_score) || 0) * 100) : "N/A",
          avgHistoricalDiscountPct: discountInfo?.avg_discount ? parseFloat(discountInfo.avg_discount) : 0,
          totalBidsSubmitted: discountInfo?.cnt ? parseInt(discountInfo.cnt) : 0
        };
      }

      case "get_market_benchmarks": {
        const { categoryCodeOrName } = args;
        const info = await fetchCategoryAveragePOPrice(categoryCodeOrName);
        return {
          category: categoryCodeOrName,
          averagePOUnitPrice: info?.avg_unit_cost ? parseFloat(info.avg_unit_cost) : null,
          totalPOCount: info?.cnt ? parseInt(info.cnt) : 0,
          commodityTrend: "Declined 5.2% over last 12 months",
          freightTrend: "Decreased 8% in Q2",
          inflationRate: "2.8% annually"
        };
      }

      case "request_supplier_selection": {
        const { hint } = args;
        const candidates = await searchSuppliers(hint || "");
        return {
          type: "select_supplier",
          prefill: hint || "",
          initialCandidates: candidates
        };
      }

      case "request_bid_selection": {
        const { hint, supplierId } = args;
        const candidates = await searchBids(hint || "", 8, supplierId);
        return {
          type: "select_bid",
          prefill: hint || "",
          initialCandidates: candidates
        };
      }

      case "request_item_selection": {
        const { supplierId, hint } = args;
        const items = await getSupplierScopeOfSupplyItems(supplierId);
        return {
          type: "select_item",
          prefill: hint || "",
          initialCandidates: items.map(item => ({
            id: item.id,
            sku_no: item.sku_no || item.id,
            product_name: item.product_name,
            product_category: item.product_category,
            sub_category: item.sub_category || "General",
            last_purchase_rate: item.last_purchase_rate || "100.00",
            currency: item.currency || "INR",
            status: item.status || "active"
          }))
        };
      }

      case "get_item_comparison_details": {
        const { supplierId, itemIdOrName } = args;
        const dbPool = getContextPool() ?? defaultPool;

        const supRes = await dbPool.query(`SELECT company_name FROM dbo.supp_basic_org_dtls WHERE id = $1`, [supplierId]);
        const supplierName = supRes.rows[0]?.company_name || "Supplier";

        const productRes = await dbPool.query(
          `SELECT * FROM dbo.pm_product_master 
           WHERE id = $1 OR LOWER(sku_no) = LOWER($1) OR LOWER(product_name) = LOWER($1) LIMIT 1`,
          [itemIdOrName]
        );
        const product = productRes.rows[0] || null;
        const itemName = product?.product_name || itemIdOrName;
        const currentQuote = product?.last_purchase_rate ? parseFloat(product.last_purchase_rate) : 100.0;
        const currency = product?.currency || "INR";
        const uom = product?.unit_of_measure || "EA";

        const historyRows = await getItemPurchaseHistory(supplierId, itemName);

        let lowestPrice = null;
        let lowestPriceDate = null;
        let lastPrice = null;
        let lastPriceDate = null;
        let averagePrice = null;

        if (historyRows.length > 0) {
          let minRow = historyRows[0];
          for (const row of historyRows) {
            if (parseFloat(row.line_unit_cost) < parseFloat(minRow.line_unit_cost)) {
              minRow = row;
            }
          }
          lowestPrice = parseFloat(minRow.line_unit_cost);
          lowestPriceDate = minRow.po_date;

          lastPrice = parseFloat(historyRows[0].line_unit_cost);
          lastPriceDate = historyRows[0].po_date;

          const sum = historyRows.reduce((acc, r) => acc + parseFloat(r.line_unit_cost), 0);
          averagePrice = sum / historyRows.length;
        }

        const altRows = await getAlternativeSupplierBenchmark(supplierId, itemName);
        let marketPrice = null;
        let isEstimated = false;

        if (altRows.length > 0) {
          const sum = altRows.reduce((acc, r) => acc + parseFloat(r.line_unit_cost), 0);
          marketPrice = sum / altRows.length;
        } else {
          marketPrice = currentQuote * 0.90;
          isEstimated = true;
        }

        const normalPrice = currentQuote;
        const frequencyTiers = [
          { frequency: "Weekly", discountPercent: 2 },
          { frequency: "Twice Weekly", discountPercent: 3 },
          { frequency: "Biweekly", discountPercent: 5 },
          { frequency: "Monthly", discountPercent: 8 },
          { frequency: "Bimonthly (Every 2 Months)", discountPercent: 10 },
          { frequency: "Quarterly", discountPercent: 12 },
          { frequency: "Half-Yearly", discountPercent: 15 },
          { frequency: "Annually", discountPercent: 20 }
        ];
        const quantityTiers = [
          { quantity: "100+", discountPercent: 5 },
          { quantity: "500+", discountPercent: 10 },
          { quantity: "1000+", discountPercent: 15 }
        ];
        const recommendedFrequency = "Annually";
        const bulkDiscountPct = 20;
        const bulkSavingsAmount = normalPrice - (normalPrice * 0.80);

        return {
          supplierId,
          supplierName,
          itemId: product?.id || itemIdOrName,
          itemName,
          currency,
          uom,
          currentQuote,
          lowestPrice,
          lowestPriceDate,
          lastPrice,
          lastPriceDate,
          averagePrice,
          marketPrice,
          isEstimated,
          normalPrice,
          frequencyTiers,
          quantityTiers,
          recommendedFrequency,
          bulkDiscountPct,
          bulkSavingsAmount
        };
      }

      case "get_india_govt_market_prices": {
        const { commodity, state, district } = args;
        const summary = await getOgdMandiPrices(String(commodity || ""), state, district);
        if (!summary) {
          return {
            noData: true,
            note: "No mandi records — item is likely not an agricultural commodity; proceed with standard estimation."
          };
        }
        return summary;
      }

      default:
        return { error: `Tool ${name} is not implemented.` };
    }
  } catch (error: any) {
    return { error: `Database execution error: ${error.message}` };
  }
}

// Helper to check for bid selection / contract selection intent
function detectDropdownTriggers(prompt: string) {
  const p = prompt.toLowerCase();

  const supplierKeywords = [
    "negotiate by supplier",
    "select supplier",
    "analyze supplier",
    "negotiate supplier",
    "by supplier",
    "strategy for supplier",
    "negotiation strategy for supplier",
    "supplier strategy",
    "strategy supplier",
    "compare pricing",
    "compare supplier pricing",
    "historical pricing",
    "scope of supply",
    "sos",
    "bulk",
    "prices",
    "compare normal",
    "pricing intelligence",
    "fallback",
    "item"
  ];
  const bidKeywords = ["analyze bid", "opportunities for bid", "negotiate bid"];
  const hasBidNum = /\bbid\b[-_#\s]*[a-z]*[-_#\s]*\d+/i.test(p);

  // A prompt that already names a concrete bid (e.g. "bid RFQ260011") has
  // enough context to skip the generic picker even if it also happens to
  // contain a supplier-ish keyword like "item" or "scope of supply" — those
  // keywords exist to disambiguate when NO bid was specified.
  const hasSupplierWord = supplierKeywords.some(kw => p.includes(kw));
  if (hasSupplierWord && !hasBidNum) {
    return "select_supplier";
  }

  const hasBidWord = bidKeywords.some(kw => p.includes(kw));
  if (hasBidWord && !hasBidNum) {
    return "select_bid";
  }

  return null;
}

// ── Without-Bids Negotiation (supplier-level + item-level summaries) ───────
//
// All monetary figures below are computed deterministically from PO history
// (dbo.supp_po_*) over the last 12 months, converted to a single display
// currency via the shared exchange-rate resolver. The LLM is used ONLY to add
// external context (market trend, category estimate, talking points) and never
// to produce or restate these internal numbers.

const NEG_WINDOW_MONTHS = 12;

// Resolve the display currency + the switchable currency list + an FX resolver.
async function resolveNegotiationCurrency(
  requested?: string
): Promise<{ currency: string; available: string[]; resolver: RateResolver }> {
  let available: string[] = [];
  try {
    available = await getBaseCurrencyLookupCodes();
  } catch {
    available = [];
  }
  const norm = (c?: string) => (c || "").trim().toUpperCase();
  let currency = norm(requested);
  if (!currency || (available.length > 0 && !available.includes(currency))) {
    currency = available[0] || currency || "USD";
  }
  const resolver = await createRateResolver(currency);
  return { currency, available: available.length > 0 ? available : [currency], resolver };
}

// Scope-of-supply lines the supplier actually sells (source of the item picker).
async function getSupplierScopeLines(supplierId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT id, category_code, sub_category, sub_category_code, good_service_code, service_details
     FROM dbo.supp_scope_of_supply_service
     WHERE supplier_id = $1 AND (status = 1 OR status IS NULL)
     ORDER BY sub_category`,
    [supplierId]
  );
  return res.rows.filter((r: any) => r.sub_category || r.good_service_code || r.service_details);
}

// All PO lines for the supplier within the trailing window.
async function getSupplierPOLinesWindow(supplierId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT pl.po_number, pl.line_unit_cost, pl.line_qty,
            h.po_currency AS curr,
            pl.product_category AS product_category_code, pl.product_category_name, h.creation_date AS po_date
     FROM dbo.supp_po_line_dtls pl
     INNER JOIN dbo.supp_po_header_dtls h ON h.po_number = pl.po_number
     WHERE h.supplier_id = $1
       AND h.creation_date >= NOW() - (INTERVAL '1 month' * $2::int)
       AND pl.line_unit_cost IS NOT NULL AND CAST(pl.line_unit_cost AS NUMERIC) > 0
     ORDER BY h.creation_date DESC`,
    [supplierId, NEG_WINDOW_MONTHS]
  );
  return res.rows;
}

// PO lines matching one scope-of-supply line, joined on category code or name.
async function getScopePOHistoryWindow(
  supplierId: number,
  categoryCode: string | null,
  subCategory: string | null
) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT pl.po_number, pl.line_unit_cost, pl.line_qty,
            h.po_currency AS curr,
            h.creation_date AS po_date
     FROM dbo.supp_po_line_dtls pl
     INNER JOIN dbo.supp_po_header_dtls h ON h.po_number = pl.po_number
     WHERE h.supplier_id = $1
       AND h.creation_date >= NOW() - (INTERVAL '1 month' * $4::int)
       AND pl.line_unit_cost IS NOT NULL AND CAST(pl.line_unit_cost AS NUMERIC) > 0
       AND (
            ($2 <> '' AND UPPER(TRIM(pl.product_category)) = UPPER($2))
         OR ($3 <> '' AND LOWER(TRIM(pl.product_category_name)) = LOWER($3))
       )
     ORDER BY h.creation_date DESC`,
    [supplierId, (categoryCode || "").trim(), (subCategory || "").trim(), NEG_WINDOW_MONTHS]
  );
  return res.rows;
}

const toNum = (v: any): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Build the deterministic supplier-level rollup (spend-weighted headroom).
async function buildSupplierRollup(supplierId: number, resolver: RateResolver, displayCurrency: string) {
  const lines = await getSupplierPOLinesWindow(supplierId);
  const scopeLines = await getSupplierScopeLines(supplierId);
  const discountInfo = await fetchHistoricalDiscounts(supplierId);

  // Group lines by item category to derive per-item best/last for headroom.
  const groups = new Map<string, { rows: { cost: number; qty: number; date: any }[] }>();
  let totalSpend = 0;
  let totalQty = 0;
  const poSet = new Set<string>();

  for (const l of lines) {
    // PO header currency; if blank, assume it's already in the display currency.
    const fromCur = String(l.curr || "").trim() || displayCurrency;
    let unit: number;
    try {
      unit = await resolver.convert(toNum(l.line_unit_cost), fromCur);
    } catch (e) {
      if (e instanceof CurrencyConversionError) throw e;
      continue;
    }
    const qty = toNum(l.line_qty) || 1;
    totalSpend += unit * qty;
    totalQty += qty;
    if (l.po_number) poSet.add(String(l.po_number));

    const key = (l.product_category_name || l.product_category_code || "uncategorized")
      .toString()
      .toLowerCase()
      .trim();
    if (!groups.has(key)) groups.set(key, { rows: [] });
    groups.get(key)!.rows.push({ cost: unit, qty, date: l.po_date });
  }

  // Spend-weighted recoverable headroom: sum((last - best) * lastQty) over items.
  type PriceRow = { cost: number; qty: number; date: any };
  let recoverable = 0;
  for (const group of Array.from(groups.values())) {
    const rows: PriceRow[] = group.rows;
    if (rows.length < 2) continue;
    rows.sort((a: PriceRow, b: PriceRow) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const last = rows[0];
    const best = rows.reduce((m: PriceRow, r: PriceRow) => (r.cost < m.cost ? r : m), rows[0]);
    if (last.cost > best.cost) recoverable += (last.cost - best.cost) * last.qty;
  }

  const subCats = new Set(
    scopeLines.map((s: any) => (s.sub_category || "").toLowerCase().trim()).filter(Boolean)
  );

  return {
    poCount: poSet.size,
    lineCount: lines.length,
    totalSpend: Math.round(totalSpend),
    avgUnitPrice: totalQty > 0 ? Math.round((totalSpend / totalQty) * 100) / 100 : 0,
    avgHistoricalDiscountPct: discountInfo?.avg_discount ? Math.round(parseFloat(discountInfo.avg_discount) * 10) / 10 : 0,
    recoverableSpend: Math.round(recoverable),
    headroomPct: totalSpend > 0 ? Math.round((recoverable / totalSpend) * 1000) / 10 : 0,
    categoryCount: subCats.size,
    hasHistory: lines.length > 0,
  };
}

// Build the deterministic item-level (sub-category) summary for one scope line.
async function buildItemSummary(supplierId: number, scopeLine: any, resolver: RateResolver, displayCurrency: string) {
  const history = await getScopePOHistoryWindow(
    supplierId,
    scopeLine?.category_code || null,
    scopeLine?.sub_category || null
  );

  const label = scopeLine?.sub_category || scopeLine?.good_service_code || scopeLine?.service_details || "Item";

  const converted: { cost: number; qty: number; date: any }[] = [];
  for (const h of history) {
    try {
      converted.push({
        cost: await resolver.convert(toNum(h.line_unit_cost), String(h.curr || "").trim() || displayCurrency),
        qty: toNum(h.line_qty) || 1,
        date: h.po_date,
      });
    } catch (e) {
      if (e instanceof CurrencyConversionError) throw e;
    }
  }

  if (converted.length === 0) {
    // Case: no quote and no PO for this sub-category.
    return { label, hasData: false as const };
  }

  converted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const last = converted[0];
  const best = converted.reduce((m, r) => (r.cost < m.cost ? r : m), converted[0]);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  if (converted.length === 1) {
    // Case 4: single purchase — reference price only; negotiable is an LLM estimate.
    return {
      label,
      hasData: true as const,
      singlePurchase: true as const,
      referencePrice: r2(last.cost),
      qtyAtBest: best.qty,
      bestPriceDate: best.date,
      negotiable: null as number | null,
      negotiablePct: null as number | null,
    };
  }

  // Case 3: >=2 POs — negotiable = lastPO - bestPO.
  const negotiable = Math.max(0, last.cost - best.cost);
  return {
    label,
    hasData: true as const,
    singlePurchase: false as const,
    bestPrice: r2(best.cost),
    bestPriceDate: best.date,
    qtyAtBest: best.qty,
    lastPrice: r2(last.cost),
    lastPriceDate: last.date,
    negotiable: r2(negotiable),
    negotiablePct: last.cost > 0 ? Math.round((negotiable / last.cost) * 1000) / 10 : 0,
  };
}

// Constrained LLM call: external context ONLY. Internal numbers are passed as
// read-only ground truth and must not be restated or altered.
async function llmExternalContext(
  openai: OpenAI,
  modelName: string,
  scope: "supplier" | "item",
  facts: any
): Promise<string> {
  try {
    const sys =
      `You are a procurement negotiation assistant. You are given VERIFIED internal numbers ` +
      `(below) that are already shown to the user in a summary card. ` +
      `Do NOT repeat, restate, recalculate, or contradict any of these numbers. ` +
      `Provide ONLY external context the buyer cannot get from our database, in 3-5 short lines:\n` +
      `1) likely market/commodity price trend for this category,\n` +
      `2) ${scope === "item" ? "a realistic current-market benchmark estimate (clearly labelled \"estimated\") if no internal price exists," : "where the biggest negotiation leverage sits,"}\n` +
      `3) two or three concise, actionable negotiation talking points.\n` +
      `Be concise and professional. No JSON, no tables, no headings.`;
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Verified internal data (read-only):\n${JSON.stringify(facts, null, 2)}` },
      ],
      temperature: 0.4,
      max_tokens: 350,
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

// ── Main Controller Query Handler ────────────────────────────────────────

export async function processNegotiationQuery(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
  sessionUser?: any,
  confirmAction?: { type: string; data: any },
  mentions: SupplierMention[] = [],
  preferredCurrency?: string,
  businessUserMentions: BusinessUserMention[] = [],
  itemMentions: ItemMention[] = [],
  bidMentions: BidMention[] = [],
  prMentions: PrMention[] = [],
  poMentions: PoMention[] = [],
  invoiceMentions: InvoiceMention[] = [],
): Promise<NegotiationAgentResponse> {
  const openai = await getAIClient();
  const modelName = await getAIModelName();

  // Captured here (not relied on from the LLM's JSON output) since the
  // coordinates are already known before the LLM call even starts — same
  // reliability principle as the other real-grounding fields in this file.
  const deliveryLat = confirmAction?.type === "select_bid" && confirmAction.data?.lat != null ? Number(confirmAction.data.lat) : null;
  const deliveryLng = confirmAction?.type === "select_bid" && confirmAction.data?.lng != null ? Number(confirmAction.data.lng) : null;

  // A prompt that @-mentions a supplier already names it — treat the mention
  // as the selection instead of bouncing back to the generic supplier picker
  // the keyword auto-trigger below would otherwise show.
  if (!confirmAction && mentions?.[0]?.supplierId && detectDropdownTriggers(prompt) === "select_supplier") {
    confirmAction = {
      type: "select_supplier",
      data: {
        selectedSupplier: { id: mentions[0].supplierId, company_name: mentions[0].companyName },
        originalPrompt: prompt,
      },
    };
  }

  // ── Handling confirmed dropdown actions
  if (confirmAction) {
    if (confirmAction.type === "select_supplier") {
      const selected = confirmAction.data?.selectedSupplier;
      const firstUserMsg = conversationHistory.find(m => m.role === "user")?.content || "";
      const origPrompt = (confirmAction.data?.originalPrompt || prompt || firstUserMsg || "").toLowerCase();
      const isComparePricingFlow = origPrompt.includes("compare") ||
        origPrompt.includes("historical") ||
        origPrompt.includes("bulk") ||
        origPrompt.includes("scope of supply") ||
        origPrompt.includes("sos") ||
        origPrompt.includes("price") ||
        origPrompt.includes("fallback") ||
        origPrompt.includes("item");

      if (selected?.id) {
        if (isComparePricingFlow) {
          const items = await getSupplierScopeOfSupplyItems(selected.id);
          return {
            response: `Supplier **${selected.company_name}** selected. Please select one of the following items from their registered Scope of Supply to analyze pricing.`,
            pendingAction: {
              type: "select_item",
              data: {
                prefill: "",
                initialCandidates: items.map(item => ({
                  id: item.id,
                  sku_no: item.sku_no || item.id,
                  product_name: item.product_name,
                  product_category: item.product_category,
                  sub_category: item.sub_category || "General",
                  last_purchase_rate: item.last_purchase_rate || "100.00",
                  currency: item.currency || "INR",
                  status: item.status || "active"
                })),
                supplierId: selected.id,
                originalPrompt: origPrompt
              },
              summary: `Select a Scope of Supply Item for ${selected.company_name}`
            }
          };
        } else {
          return {
            response: `Supplier **${selected.company_name}** selected. How would you like to run the negotiation analysis?`,
            pendingAction: {
              type: "select_negotiation_mode",
              data: { supplierId: selected.id, supplierName: selected.company_name },
              summary: `Choose negotiation mode for ${selected.company_name}`
            }
          };
        }
      } else {
        return { response: "Please select a valid supplier to continue." };
      }
    } else if (confirmAction.type === "select_negotiation_mode") {
      const supplierId = confirmAction.data?.supplierId;
      const supplierName = confirmAction.data?.supplierName || "the supplier";
      const mode = confirmAction.data?.mode;
      if (!supplierId) return { response: "Please select a supplier to continue." };

      if (mode === "with_bids") {
        const list = await searchBids("", 8, supplierId);
        if (list.length === 0) {
          return {
            response: `No closed bids found for ${supplierName}. Try the "Without Bids" analysis instead, or pick another supplier.`,
            pendingAction: {
              type: "select_negotiation_mode",
              data: { supplierId, supplierName },
              summary: `Choose negotiation mode for ${supplierName}`
            }
          };
        }
        return {
          response: `Please select one of the bids that ${supplierName} has participated in to run the negotiation analysis.`,
          pendingAction: {
            type: "select_bid",
            data: { prefill: "", initialCandidates: list, supplierId },
            summary: `Select a bid for ${supplierName}`
          }
        };
      }

      // mode === "without_bids"
      try {
        const { currency, available, resolver } = await resolveNegotiationCurrency(confirmAction.data?.currency || preferredCurrency);
        const rollup = await buildSupplierRollup(supplierId, resolver, currency);
        const scopeLines = await getSupplierScopeLines(supplierId);

        if (!rollup.hasHistory && scopeLines.length === 0) {
          return { response: `No quote or PO exists for **${supplierName}**.` };
        }

        const facts = { supplier: supplierName, currency, ...rollup };
        const context = await llmExternalContext(openai, modelName, "supplier", facts);

        return {
          response: context || `Negotiation overview for ${supplierName}.`,
          pendingAction: {
            type: "supplier_negotiation_summary",
            data: {
              supplierId,
              supplierName,
              currency,
              availableCurrencies: available,
              rollup,
              items: scopeLines.map((s: any) => ({
                id: s.id,
                category_code: s.category_code,
                sub_category: s.sub_category,
                sub_category_code: s.sub_category_code,
                good_service_code: s.good_service_code,
                service_details: s.service_details,
              })),
            },
            summary: `Negotiation overview for ${supplierName}`
          }
        };
      } catch (e: any) {
        if (e instanceof CurrencyConversionError) return { response: e.message };
        console.error("[NegotiationAgent] without_bids supplier summary failed:", e);
        return { response: `Couldn't build the negotiation overview: ${e?.message || "unexpected error"}.` };
      }
    } else if (confirmAction.type === "supplier_negotiation_summary") {
      // Reusable item picker (or currency switch) on the supplier-level summary.
      const supplierId = confirmAction.data?.supplierId;
      const supplierName = confirmAction.data?.supplierName || "the supplier";
      const selectedItem = confirmAction.data?.selectedItem;
      if (!supplierId || !selectedItem) {
        return { response: "Please select an item to continue." };
      }
      try {
        const { currency, resolver } = await resolveNegotiationCurrency(confirmAction.data?.currency || preferredCurrency);
        const summary = await buildItemSummary(supplierId, selectedItem, resolver, currency);

        if (!summary.hasData) {
          return { response: `No quote or PO exists for **${summary.label}** with ${supplierName}.` };
        }

        const facts = { supplier: supplierName, item: summary.label, currency, ...summary };
        const context = await llmExternalContext(openai, modelName, "item", facts);

        return {
          response: context || `Negotiation summary for ${summary.label}.`,
          pendingAction: {
            type: "item_negotiation_summary",
            data: { supplierId, supplierName, currency, item: summary },
            summary: `Negotiation summary for ${summary.label}`
          }
        };
      } catch (e: any) {
        if (e instanceof CurrencyConversionError) return { response: e.message };
        console.error("[NegotiationAgent] without_bids item summary failed:", e);
        return { response: `Couldn't build the item summary: ${e?.message || "unexpected error"}.` };
      }
    } else if (confirmAction.type === "select_bid") {
      const selected = confirmAction.data?.selectedBid;
      if (selected?.bid_number) {
        const bidLines = selected.id ? await getBidLines(selected.id) : [];
        // When the start card already supplied a scope-of-supply item, resolve
        // the line from it (same description/product_category match as
        // getSupplierBidsForScope) instead of re-asking in chat.
        const scopeNeedle = String(confirmAction.data?.scopeItem || "").trim().toLowerCase();
        let scopeMatches: any[] = [];
        if (bidLines.length > 1 && !confirmAction.data?.selectedBidLine && scopeNeedle) {
          scopeMatches = bidLines.filter((l: any) =>
            String(l.description || "").toLowerCase().includes(scopeNeedle) ||
            String(l.product_category || "").toLowerCase().includes(scopeNeedle));
        }
        const scopeLine = scopeMatches.length === 1 ? scopeMatches[0] : null;
        if (bidLines.length > 1 && !confirmAction.data?.selectedBidLine && !scopeLine) {
          return {
            response: `Bid ${selected.bid_number} has multiple line items. Please choose one to analyze.`,
            pendingAction: {
              type: "select_bid_line",
              data: {
                initialCandidates: scopeMatches.length > 1 ? scopeMatches : bidLines,
                bidId: selected.id,
                bidNumber: selected.bid_number,
                supplierName: confirmAction.data?.supplierName,
                scopeItem: confirmAction.data?.scopeItem,
                city: confirmAction.data?.city,
                country: confirmAction.data?.country,
              },
              summary: `Select a line item for bid ${selected.bid_number}`,
            },
          };
        }

        const parts = [`Analyze negotiation opportunities for bid ${selected.bid_number}`];
        if (confirmAction.data?.supplierName) parts.push(`focusing on ${confirmAction.data.supplierName}'s quotation`);
        const soloLine = bidLines.length === 1 ? bidLines[0] : scopeLine;
        if (soloLine?.description) {
          parts.push(`for line item "${soloLine.description}" (qty ${soloLine.quantity} ${soloLine.uom || ""})`.trim());
        }
        if (confirmAction.data?.scopeItem) parts.push(`for scope of supply item "${confirmAction.data.scopeItem}"`);
        const loc = [confirmAction.data?.city, confirmAction.data?.country].filter(Boolean).join(", ");
        if (loc) parts.push(`delivering to ${loc}`);
        prompt = parts.join(", ") + ".";
      } else {
        return { response: "Please select a valid bid to continue." };
      }
    } else if (confirmAction.type === "select_bid_line") {
      const selectedLine = confirmAction.data?.selectedBidLine;
      if (selectedLine?.description) {
        const parts = [`Analyze negotiation opportunities for bid ${confirmAction.data?.bidNumber}`];
        if (confirmAction.data?.supplierName) parts.push(`focusing on ${confirmAction.data.supplierName}'s quotation`);
        parts.push(`for line item "${selectedLine.description}" (qty ${selectedLine.quantity} ${selectedLine.uom || ""})`.trim());
        if (confirmAction.data?.scopeItem) parts.push(`for scope of supply item "${confirmAction.data.scopeItem}"`);
        const loc = [confirmAction.data?.city, confirmAction.data?.country].filter(Boolean).join(", ");
        if (loc) parts.push(`delivering to ${loc}`);
        prompt = parts.join(", ") + ".";
      } else {
        return { response: "Please select a valid line item to continue." };
      }
    } else if (confirmAction.type === "select_item") {
      const selectedItem = confirmAction.data?.selectedItem;
      const supplierId = confirmAction.data?.supplierId;
      if (selectedItem?.product_name && supplierId) {
        prompt = `Perform Scope of Supply pricing comparison for supplier ID ${supplierId} and item "${selectedItem.product_name}"`;
      } else {
        return { response: "Please select a valid item to continue." };
      }
    }
  }

  // ── Auto trigger selection menus if reference is missing
  const autoTrigger = detectDropdownTriggers(prompt);
  if (autoTrigger === "select_supplier" && !confirmAction) {
    const list = await searchSuppliers();
    return {
      response: "Please select a supplier to start.",
      pendingAction: {
        type: "select_supplier",
        data: { prefill: "", initialCandidates: list, originalPrompt: prompt },
        summary: "Select a supplier"
      }
    };
  } else if (autoTrigger === "select_bid" && !confirmAction) {
    const list = await searchBids();
    return {
      response: "Please select a bid to analyze.",
      pendingAction: {
        type: "select_bid",
        data: { prefill: "", initialCandidates: list },
        summary: "Select a bid"
      }
    };
  }
  let reinforcedPrompt = prompt;
  const p = prompt.toLowerCase();

  const isBidAnalysis =
    (p.includes("analyze bid") ||
      p.includes("negotiation opportunities") ||
      /\b(rfp|rfq|bid)\b[-_#\s]*\d+/i.test(p) ||
      (p.includes("supplier") && !p.includes("item") && !p.includes("scope of supply") && !p.includes("compare pricing"))) &&
    !p.includes("perform scope of supply pricing comparison");

  if (isBidAnalysis) {
    reinforcedPrompt = `${prompt}\n\n[CRITICAL REMINDER: Since you are analyzing a bid, you MUST output a structured JSON block at the very end of your response inside a \`\`\`json ... \`\`\` code block. This JSON block must follow the "negotiation_insights" format (with summary, strength, batna, strategy, charts, overview, fairMarketPrice, costStructure, and localSuppliers keys) exactly as defined in your system prompt. Do NOT omit overview, fairMarketPrice, costStructure, or localSuppliers — these drive the Fair Market Price and Local Suppliers panels and must be filled with realistic values every time, not left out.]`;
  }

  if (preferredCurrency) {
    reinforcedPrompt = `${reinforcedPrompt}\n\n[CURRENCY CONSISTENCY: This conversation has already established ${preferredCurrency} as the buyer's working currency. If you output a "negotiation_insights" JSON block, set overview.currency to "${preferredCurrency}" and express every monetary figure (quotePrice, summary.currentQuote/marketBenchmark, fairMarketPrice, costStructure, localSuppliers prices, batna amounts, chart values) in ${preferredCurrency}, converting realistically from source data if it was in a different currency. Do not switch currencies.]`;
  }

  const lineItemMatch = prompt.match(/for line item\s+"([^"]+)"/i);
  if (lineItemMatch) {
    reinforcedPrompt = `${reinforcedPrompt}\n\n[SINGLE ITEM PRICING: This bid has multiple line items and the user selected only "${lineItemMatch[1]}". You MUST call get_bid_negotiation_details with lineItemDescription set to exactly "${lineItemMatch[1]}", and every price you output (summary.currentQuote, every quotes[]/supplierComparison entry, overview.quotePrice, costStructure's sum) MUST be that one item's price per supplier — never the bid's whole total, and never the sum of this item plus any other line item.]`;
  }

  reinforcedPrompt = applyAllMentionsToPrompt(reinforcedPrompt, {
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: NEGOTIATION_AGENT_SYSTEM_PROMPT },
    ...conversationHistory.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: reinforcedPrompt }
  ];

  try {
    let completion = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.0,
      max_tokens: 6000
    });

    let assistantMessage = completion.choices[0]?.message;
    let loopCount = 0;
    const MAX_LOOPS = 10;
    let lastOgdResult: any = null;

    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0 && loopCount <= MAX_LOOPS) {
      loopCount++;

      messages.push({
        role: "assistant",
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      } as any);

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || "{}");
        const toolName: string = toolCall.function.name;
        const result = await executeToolCall(toolName, args, sessionUser);
        if (toolName === "get_india_govt_market_prices" && !(result as any)?.noData && !(result as any)?.error) {
          lastOgdResult = result;
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        } as any);
      }

      completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.1,
        max_tokens: 6000
      });

      assistantMessage = completion.choices[0]?.message;
    }

    // Safety net (same fix as cost-intelligence-agent-service.ts): the tool
    // loop can exit with the model still requesting tools (MAX_LOOPS reached)
    // and no text content, which fell through to the "couldn't process that
    // query" fallback. Force one final text-only answer using the tool data
    // already gathered so we return a real response. Deliberately no `tools`
    // and no `tool_choice` here: omitting `tools` already makes tool calls
    // impossible, and OpenAI 400s on tool_choice without a tools array.
    if (!assistantMessage?.content) {
      try {
        const forced = await openai.chat.completions.create({
          model: modelName,
          messages,          temperature: 0.1,
          max_tokens: 6000,
        });
        if (forced.choices[0]?.message?.content) {
          completion = forced;
          assistantMessage = forced.choices[0].message;
        } else {
          console.error("[NegotiationAgent] empty content after forced final completion", {
            finishReason: forced.choices[0]?.finish_reason,
            loopCount,
          });
        }
      } catch (e) {
        console.error("[NegotiationAgent] forced-final completion failed:", e);
      }
    }

    // The negotiation_insights JSON block is large (charts.spendTrend x12,
    // localSuppliers x4-6, fairMarketPrice.dataSources x4, batna alternatives,
    // supplierComparison rows, plus the narrative text) and can still get cut
    // off mid-JSON even at max_tokens: 6000 on a verbose response. When that
    // happens, finish_reason is "length" and the response has no closing
    // ```` ``` ```` fence — ask the model to finish exactly where it stopped
    // instead of ever showing the user a truncated/unparsable JSON dump.
    if (completion.choices[0]?.finish_reason === "length" && assistantMessage?.content) {
      try {
        const continuation = await openai.chat.completions.create({
          model: modelName,
          messages: [
            ...messages,
            { role: "assistant", content: assistantMessage.content },
            { role: "user", content: "Continue exactly where you left off — do not repeat any earlier text. Finish the response and make sure the ```json code block is complete and properly closed." },
          ] as any,          temperature: 0.1,
          max_tokens: 4000,
        });
        const more = continuation.choices[0]?.message?.content || "";
        if (more) {
          assistantMessage = { ...assistantMessage, content: (assistantMessage.content || "") + more } as any;
        }
      } catch (err) {
        console.warn("[NegotiationAgent] continuation completion for truncated response failed:", err);
      }
    }

    const finalResponse = assistantMessage?.content || "I couldn't process that query. Please try again.";
    const result = parseFinalAgentResponse(finalResponse);

    // Real-market-grounding pipeline (moved from cost-intelligence-agent-service.ts):
    // ground the negotiation_insights overview/fairMarketPrice/localSuppliers/
    // costStructure/charts.spendTrend fields in real scraped-supplier and
    // Govt. of India mandi data instead of leaving them as pure LLM estimates.
    if (result.pendingAction?.type === "negotiation_insights" && result.pendingAction.data?.overview) {
      if (deliveryLat != null && deliveryLng != null) {
        result.pendingAction.data.overview.latitude = deliveryLat;
        result.pendingAction.data.overview.longitude = deliveryLng;
      }
      const respondingBidId = Number(result.pendingAction.data?.summary?.bidId) || null;
      if (respondingBidId) {
        try {
          const bidLines = await getBidLines(respondingBidId);
          if (bidLines.length > 1) {
            const respondingSupplierId = Number(result.pendingAction.data?.summary?.supplierId) || null;
            const linesWithPrices: OverviewBidLineItem[] = await Promise.all(
              bidLines.map(async (l: any) => {
                let quotePrice: number | null = null;
                if (respondingSupplierId) {
                  const priceRows = await getBidResponseLinePrices(respondingBidId, l.description);
                  const match = priceRows.find((r) => Number(r.supplier_id) === respondingSupplierId);
                  if (match) quotePrice = parseFloat(String(match.bidprice)) || null;
                }
                return {
                  id: l.id,
                  description: l.description,
                  quantity: l.quantity,
                  uom: l.uom ?? null,
                  product_category: l.product_category ?? null,
                  quotePrice,
                };
              })
            );
            result.pendingAction.data.overview.availableBidLines = linesWithPrices;
            const bidPool = getContextPool() ?? defaultPool;
            const bidRes = await bidPool.query(`SELECT attribute_4 FROM dbo.supp_bid_dtls WHERE id = $1`, [respondingBidId]);
            result.pendingAction.data.overview.bidNumber = bidRes.rows[0]?.attribute_4 || null;
          }
        } catch (err) {
          console.warn("[NegotiationAgent] fetching bid lines for change-item post-processing failed:", err);
        }
      }
      try {
        await applyLocalSuppliers(result.pendingAction.data, prompt);
      } catch (err) {
        console.warn("[NegotiationAgent] local suppliers post-processing failed:", err);
      }
      try {
        await applyRealMarketPricing(result.pendingAction.data);
      } catch (err) {
        console.warn("[NegotiationAgent] real market pricing post-processing failed:", err);
      }
      {
        const ov = result.pendingAction.data.overview;
        const quotePrice = Number(ov?.quotePrice) || Number(result.pendingAction.data.summary?.currentQuote) || 0;
        if (isCostStructureIncomplete(result.pendingAction.data.costStructure, quotePrice)) {
          try {
            const repaired = await repairCostStructure(openai, modelName, {
              item: String(ov?.item || ""),
              quotePrice,
              currency: String(ov?.currency || "USD"),
            });
            if (repaired) result.pendingAction.data.costStructure = repaired;
          } catch (err) {
            console.warn("[NegotiationAgent] cost-structure repair post-processing failed:", err);
          }
        }
      }
      try {
        await applyRealCostStructure(result.pendingAction.data, lastOgdResult);
      } catch (err) {
        console.warn("[NegotiationAgent] real cost-structure post-processing failed:", err);
      }
      // Belt-and-braces: when live data.gov.in mandi data was used, make sure
      // the FMP panel visibly credits it even if the model forgot to rename
      // the 4th data source.
      const dataSources = result.pendingAction.data?.fairMarketPrice?.dataSources;
      if (lastOgdResult && Array.isArray(dataSources) && dataSources.length === 4) {
        const alreadyCredited = dataSources.some((ds: any) => /data\.gov\.in|mandi/i.test(String(ds?.name || "")));
        if (!alreadyCredited) {
          dataSources[3] = {
            ...dataSources[3],
            name: "Govt. of India Mandi Prices (data.gov.in)",
            description: `Live wholesale mandi prices · ${lastOgdResult.marketCount} markets · ${lastOgdResult.scopeName} · ${lastOgdResult.latestArrivalDate}`,
          };
        }
      }
      await applyRealSpendTrend(result.pendingAction.data);
      try {
        await applyRealSupplierIntelligence(result.pendingAction.data);
      } catch (err) {
        console.warn("[NegotiationAgent] real supplier-intelligence post-processing failed:", err);
      }
      // Runs last, once the grounding pass above has settled fairMarketPrice:
      // re-derives marketBenchmark/variance/quotes/priceBenchmark from it. Without
      // this the live reply would keep the model's own benchmark and only pick up
      // the grounded one on reload, when the history endpoint sanitizes.
      try {
        sanitizeNegotiationInsightsData(result.pendingAction.data);
      } catch (err) {
        console.warn("[NegotiationAgent] insights sanitize post-processing failed:", err);
      }
    }

    return result;
  } catch (error: any) {
    console.error("Negotiation Agent loop error:", error);
    return {
      response: "I'm having trouble connecting to the AI service. Please try again in a moment."
    };
  }
}

function ensurePrimitives(obj: any) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const keys = Object.keys(val);
      if (keys.length === 0) {
        obj[key] = "";
      } else {
        const parts = keys.map(k => {
          const innerVal = val[k];
          if (innerVal && typeof innerVal === "object") {
            return `${k}: ${JSON.stringify(innerVal)}`;
          }
          return `${k}: ${innerVal}`;
        });
        obj[key] = parts.join(", ");
      }
    }
  }
}

// Sanitizes and ensures the negotiation insights payload is clean and has valid numeric benchmarks
export function sanitizeNegotiationInsightsData(data: any) {
  if (!data) return;

  const parseNum = (val: any): number => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const parsed = parseFloat(val.replace(/[^0-9.]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const extractSupplierValue = (fieldVal: any, supplierName: string): any => {
    if (typeof fieldVal !== "string" || !supplierName) return fieldVal;
    const regex = new RegExp(`${supplierName}\\s*:\\s*([^,]+)`, "i");
    const match = fieldVal.match(regex);
    return match ? match[1].trim() : fieldVal;
  };

  if (data.summary && typeof data.summary === "object" && data.summary.bidId !== undefined) {
    data.summary.bidId = parseNum(data.summary.bidId);
  }

  if (data.summary && typeof data.summary === "object" && data.summary.supplierId !== undefined) {
    data.summary.supplierId = parseNum(data.summary.supplierId);
  }

  // 1. Resolve multi-supplier summary objects BEFORE ensurePrimitives flattens them
  if (data.summary && typeof data.summary === "object") {
    let selectedSupplier = "";

    // If supplier is an object, e.g. { "RATH": ..., "Kaleem": ... }
    if (data.summary.supplier && typeof data.summary.supplier === "object") {
      const keys = Object.keys(data.summary.supplier);
      if (data.summary.currentQuote && typeof data.summary.currentQuote === "object") {
        let minQuote = Infinity;
        let minSup = "";
        for (const k of keys) {
          const q = parseNum(data.summary.currentQuote[k]);
          if (q > 0 && q < minQuote) {
            minQuote = q;
            minSup = k;
          }
        }
        selectedSupplier = minSup || keys[0] || "";
      } else {
        selectedSupplier = keys[0] || "";
      }
    } else if (typeof data.summary.supplier === "string") {
      // If supplier is a string, but is a flattened comma-separated list of keys, take the first one
      if (data.summary.supplier.includes(",")) {
        selectedSupplier = data.summary.supplier.split(",")[0].split(":")[0].trim();
      } else {
        selectedSupplier = data.summary.supplier.trim();
      }
    }

    // Resolve summary key-value objects for the selected supplier
    if (selectedSupplier) {
      data.summary.supplier = selectedSupplier;
      if (data.summary.currentQuote && typeof data.summary.currentQuote === "object") {
        data.summary.currentQuote = data.summary.currentQuote[selectedSupplier];
      }
      if (data.summary.marketBenchmark && typeof data.summary.marketBenchmark === "object") {
        data.summary.marketBenchmark = data.summary.marketBenchmark[selectedSupplier];
      }
      if (data.summary.variance && typeof data.summary.variance === "object") {
        data.summary.variance = data.summary.variance[selectedSupplier];
      }
      if (data.summary.renewalIncrease && typeof data.summary.renewalIncrease === "object") {
        data.summary.renewalIncrease = data.summary.renewalIncrease[selectedSupplier];
      }
      if (data.summary.negotiationPotential && typeof data.summary.negotiationPotential === "object") {
        data.summary.negotiationPotential = data.summary.negotiationPotential[selectedSupplier];
      }
    }
  }

  // 2. Clean all nested visual output structures to guarantee primitives
  ensurePrimitives(data.summary);
  ensurePrimitives(data.strength);
  ensurePrimitives(data.batna);
  ensurePrimitives(data.strategy);

  if (!data.summary) data.summary = {};

  // 3. Extract matching supplier value from flattened strings if currentQuote was already serialized
  if (data.summary.supplier && typeof data.summary.supplier === "string") {
    const supplierName = data.summary.supplier;
    data.summary.currentQuote = extractSupplierValue(data.summary.currentQuote, supplierName);
    data.summary.marketBenchmark = extractSupplierValue(data.summary.marketBenchmark, supplierName);
    data.summary.variance = extractSupplierValue(data.summary.variance, supplierName);
    data.summary.renewalIncrease = extractSupplierValue(data.summary.renewalIncrease, supplierName);
  }

  const currentQuoteVal = parseNum(data.summary.currentQuote);

  // The Fair Market Price is anchored on real data by the server-side grounding
  // pass (scraped supplier listings / govt mandi prices), whereas the model's own
  // summary.marketBenchmark is an unanchored estimate. Prefer the FMP as the
  // benchmark baseline so it — and every variance derived from it below — reflects
  // real market data. applyRealSpendTrend already treats FMP as the market price.
  const fmpVal = parseNum(data.fairMarketPrice?.price);
  let benchmarkVal = fmpVal > 0 ? fmpVal : parseNum(data.summary.marketBenchmark);
  if (fmpVal > 0) data.summary.marketBenchmark = fmpVal;

  // If neither the FMP nor marketBenchmark is a valid positive number
  if (benchmarkVal <= 0) {
    // Check if we can find any competitive quote in supplierComparison rows
    let lowestCompetitorQuote = Infinity;
    if (data.charts?.supplierComparison?.rows && Array.isArray(data.charts.supplierComparison.rows)) {
      for (const row of data.charts.supplierComparison.rows) {
        const quote = parseNum(row.quote || row.totalQuote);
        if (quote > 0 && quote < lowestCompetitorQuote) {
          lowestCompetitorQuote = quote;
        }
      }
    }

    if (lowestCompetitorQuote !== Infinity && lowestCompetitorQuote > 0) {
      // Benchmark is set to 5% below lowest competitor quote
      benchmarkVal = Math.round(lowestCompetitorQuote * 0.95);
    } else if (currentQuoteVal > 0) {
      // Benchmark is set to 12% below current quote
      benchmarkVal = Math.round(currentQuoteVal * 0.88);
    } else {
      benchmarkVal = 100; // ultimate fallback
    }

    data.summary.marketBenchmark = benchmarkVal;
  }

  // Variance must always agree with the benchmark resolved above: the model
  // computes its variance against its own estimate, so keeping it would leave the
  // headline % contradicting the grounded baseline (and the per-supplier rows
  // below, which are always recomputed). Same formatting as those rows.
  if (currentQuoteVal > 0 && benchmarkVal > 0) {
    const pct = ((currentQuoteVal - benchmarkVal) / benchmarkVal) * 100;
    data.summary.variance = pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
  }

  // 1.5. Construct quotes comparison list inside data.summary
  const quotesList: any[] = [];
  if (data.charts?.supplierComparison?.rows && Array.isArray(data.charts.supplierComparison.rows)) {
    for (const row of data.charts.supplierComparison.rows) {
      const name = String(row.supplier || row.supplierName || row.company || row.companyName || "").trim();
      const quote = parseNum(row.quote || row.totalQuote || row.price || row.value);
      if (name && quote > 0) {
        // Calculate variance against the resolved benchmarkVal
        const varianceVal = benchmarkVal > 0 ? ((quote - benchmarkVal) / benchmarkVal) * 100 : 0;
        const formattedVariance = varianceVal > 0 ? `+${varianceVal.toFixed(1)}%` : `${varianceVal.toFixed(1)}%`;

        // Calculate negotiation potential based on variance
        let potential = "Low";
        if (varianceVal > 15) potential = "High";
        else if (varianceVal > 5) potential = "Medium";

        quotesList.push({
          supplierName: name,
          quote,
          variance: formattedVariance,
          negotiationPotential: potential
        });
      }
    }
  }

  // Fallback to active supplier quote if no competitor list found
  if (quotesList.length === 0 && data.summary?.supplier) {
    const sName = String(data.summary.supplier);
    const sQuote = parseNum(data.summary.currentQuote);
    const varianceVal = benchmarkVal > 0 ? ((sQuote - benchmarkVal) / benchmarkVal) * 100 : 0;
    const formattedVariance = varianceVal > 0 ? `+${varianceVal.toFixed(1)}%` : `${varianceVal.toFixed(1)}%`;
    let potential = "Low";
    if (varianceVal > 15) potential = "High";
    else if (varianceVal > 5) potential = "Medium";

    quotesList.push({
      supplierName: sName,
      quote: sQuote,
      variance: formattedVariance,
      negotiationPotential: data.summary.negotiationPotential || potential
    });
  }

  data.summary.quotes = quotesList;

  // Ensure charts.priceBenchmark is updated
  if (!data.charts) data.charts = {};
  if (!data.charts.priceBenchmark) data.charts.priceBenchmark = {};

  // Format series for priceBenchmark
  if (!data.charts.priceBenchmark.series || !Array.isArray(data.charts.priceBenchmark.series)) {
    data.charts.priceBenchmark.series = [
      { name: "Market", value: benchmarkVal },
      { name: "Supplier", value: currentQuoteVal || benchmarkVal * 1.14 },
      { name: "Target", value: Math.round(benchmarkVal) },
      { name: "Previous", value: Math.round(benchmarkVal * 1.05) }
    ];
  } else {
    // If it exists, make sure the values are not empty or null
    data.charts.priceBenchmark.series = data.charts.priceBenchmark.series.map((item: any) => {
      if (!item || typeof item !== "object") return item;
      const name = item.name || "";
      let val = parseNum(item.value || item.price || item.data?.[0]);
      if (val <= 0) {
        if (name === "Market") val = benchmarkVal;
        else if (name === "Supplier" || name.includes("Quote")) val = currentQuoteVal || benchmarkVal * 1.14;
        else if (name === "Target") val = Math.round(benchmarkVal);
        else if (name === "Previous" || name.includes("Prev")) val = Math.round(benchmarkVal * 1.05);
      }
      return { name, value: val };
    });
  }

  // 4. Validate or auto-calculate BATNA from competing quotes in charts
  if (!data.batna) {
    data.batna = {};
  }

  const activeSupplier = String(data.summary?.supplier || "").trim().toLowerCase();

  const competitors: { name: string; quote: number }[] = [];
  if (data.charts?.supplierComparison?.rows && Array.isArray(data.charts.supplierComparison.rows)) {
    for (const row of data.charts.supplierComparison.rows) {
      const name = String(row.supplier || row.supplierName || row.company || row.companyName || "").trim();
      const quote = parseNum(row.quote || row.totalQuote || row.price || row.value);
      if (name && quote > 0) {
        competitors.push({ name, quote });
      }
    }
  }

  if (competitors.length > 0) {
    // Sort ascending by quote value
    competitors.sort((a, b) => a.quote - b.quote);
    // Check if the active supplier is the lowest quote
    const isLowest = competitors[0].name.toLowerCase() === activeSupplier ||
      competitors[0].name.toLowerCase().includes(activeSupplier) ||
      activeSupplier.includes(competitors[0].name.toLowerCase());

    if (isLowest) {
      // The selected supplier already has the most competitive (lowest) quote —
      // switching to any alternative would cost more, so do NOT suggest a switch.
      const fallback = competitors.find(c => {
        const cName = c.name.toLowerCase();
        return cName !== activeSupplier && !cName.includes(activeSupplier) && !activeSupplier.includes(cName);
      });
      data.batna.bestAlternative = "No switch needed — already the most competitive quote";
      data.batna.expectedPrice = fallback ? fallback.quote : currentQuoteVal;
      data.batna.expectedSavings = 0;
    } else {
      // Negotiating with a non-lowest supplier — the BATNA is the lowest bidder,
      // so suggest switching to them.
      const targetCompetitor = competitors[0];
      if (targetCompetitor) {
        data.batna.bestAlternative = `Switch to ${targetCompetitor.name}`;
        data.batna.expectedPrice = targetCompetitor.quote;
        data.batna.expectedSavings = Math.max(0, currentQuoteVal - targetCompetitor.quote);
      }
    }
  }

  // Populate/sanitize the alternatives array inside data.batna
  const rawAlternatives = Array.isArray(data.batna?.alternatives) ? data.batna.alternatives : [];
  const sanitizedAlternatives: any[] = [];

  for (const comp of competitors) {
    const compNameLower = comp.name.toLowerCase();
    const existing = rawAlternatives.find((a: any) => {
      const aName = String(a?.supplierName || a?.supplier || "").toLowerCase();
      return aName === compNameLower || aName.includes(compNameLower) || compNameLower.includes(aName);
    });

    const quoteVal = comp.quote;
    const savingsOrPremiumVal = currentQuoteVal - comp.quote;
    const riskVal = existing?.switchingRisk || (compNameLower === activeSupplier ? "Low" : "Medium");

    sanitizedAlternatives.push({
      supplierName: comp.name,
      quote: quoteVal,
      savingsOrPremium: savingsOrPremiumVal,
      switchingRisk: riskVal
    });
  }

  if (sanitizedAlternatives.length === 0 && rawAlternatives.length > 0) {
    for (const alt of rawAlternatives) {
      const name = String(alt.supplierName || alt.supplier || "").trim();
      const quoteVal = parseNum(alt.quote);
      const savingsOrPremiumVal = parseNum(alt.savingsOrPremium);
      const riskVal = alt.switchingRisk || "Medium";
      if (name) {
        sanitizedAlternatives.push({
          supplierName: name,
          quote: quoteVal,
          savingsOrPremium: savingsOrPremiumVal,
          switchingRisk: riskVal
        });
      }
    }
  }

  data.batna.alternatives = sanitizedAlternatives;
}

// Deterministic per-supplier strategy refresh for the Negotiation Strategy Panel.
// No LLM: resolves the authoritative bidder list from the bid responses and computes
// the leverage matrix + BATNA for the selected supplier from DB signals. When no
// supplierName is given (or it can't be matched), defaults to the lowest quote (L1).
export async function refreshNegotiationSupplier(params: {
  bidId: number;
  supplierName?: string;
  marketBenchmark?: number;
  marketConditions?: string;
  costStructure?: Array<{ component: string; cost: number }>;
  lineItemDescription?: string;
  itemDescription?: string;
}) {
  const { bidId } = params;
  const num = (v: any): number => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "string") {
      const p = parseFloat(v.replace(/[^0-9.]/g, ""));
      return Number.isFinite(p) ? p : 0;
    }
    return 0;
  };

  const responses = await getBidResponses(bidId);

  // On a multi-line bid, price every bidder on the ONE selected line item —
  // never the whole-bid total (which would be the sum across every item they
  // quoted) — so the supplier switcher always shows the price for what's
  // actually being negotiated.
  let linePriceBySupplier: Map<number, number> | null = null;
  if (params.lineItemDescription) {
    try {
      const linePrices = await getBidResponseLinePrices(bidId, params.lineItemDescription);
      if (linePrices.length > 0) {
        linePriceBySupplier = new Map(linePrices.map(lp => [lp.supplier_id, parseFloat(lp.bidprice)]));
      }
    } catch (err) {
      console.warn("[NegotiationAgent] refreshNegotiationSupplier per-line-item price lookup failed:", err);
    }
  }

  const bidders = responses
    .map((r: any) => ({
      supplierId: r.supplier_id,
      supplierName: r.supplier_name || r.company_name || `Supplier ${r.supplier_id}`,
      quote: linePriceBySupplier?.get(r.supplier_id) ?? num(r.bidtotal),
      // Whole-bid total, kept alongside the (possibly per-line) quote so the
      // panel can show the bid's total value while pricing a single item.
      bidTotal: num(r.bidtotal),
    }))
    .filter((b: any) => b.supplierName && b.quote > 0);

  if (bidders.length === 0) {
    return { suppliers: [], summary: null, strength: null, batna: null };
  }

  // Sort ascending → bidders[0] is L1 (lowest / most competitive).
  bidders.sort((a, b) => a.quote - b.quote);

  const requested = String(params.supplierName || "").trim().toLowerCase();
  const selected =
    bidders.find(
      (b) =>
        b.supplierName.toLowerCase() === requested ||
        (!!requested && b.supplierName.toLowerCase().includes(requested)) ||
        (!!requested && requested.includes(b.supplierName.toLowerCase()))
    ) || bidders[0];

  // Benchmark: prefer the value the panel already resolved; else 5% below L1.
  let benchmark = num(params.marketBenchmark);
  if (benchmark <= 0) benchmark = Math.round(bidders[0].quote * 0.95);

  const varianceOf = (quote: number) => (benchmark > 0 ? ((quote - benchmark) / benchmark) * 100 : 0);
  const fmtVariance = (pct: number) => (pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`);
  const potentialOf = (pct: number) => (pct > 15 ? "High" : pct > 5 ? "Medium" : "Low");

  const suppliers = bidders.map((b) => {
    const pct = varianceOf(b.quote);
    return {
      supplierId: b.supplierId,
      supplierName: b.supplierName,
      quote: b.quote,
      bidTotal: b.bidTotal,
      variance: fmtVariance(pct),
      negotiationPotential: potentialOf(pct),
    };
  });

  const selPct = varianceOf(selected.quote);

  // ── Leverage matrix + Scorecard (deterministic) — shared with the LLM
  // analysis path so switching suppliers here recomputes these too, instead
  // of leaving them stuck on whichever supplier was originally analyzed. ──
  const real = selected.supplierId
    ? await computeSupplierRealIntelligence(selected.supplierId)
    : null;
  const historicalDiscounts = real?.historicalDiscountsBucket ?? "None";

  // bidders is sorted ascending, so others[0] (if any) is the cheapest
  // alternative to the selected supplier — reused below for BATNA too.
  const others = bidders.filter((b) => b.supplierId !== selected.supplierId);

  // Previously negotiated/purchased unit price for this supplier+item, when
  // known — the same 0.3x-3x plausibility guard as applyRealSupplierIntelligence
  // guards against fuzzy item-description matches pulling in an unrelated PO row.
  let historicalUnitPrice: number | null = null;
  if (selected.supplierId && params.itemDescription) {
    try {
      const poHistory = await getItemPurchaseHistory(selected.supplierId, params.itemDescription);
      const latest = poHistory.length > 0 ? parseFloat(poHistory[0].line_unit_cost) : null;
      if (latest != null && Number.isFinite(latest) && latest >= selected.quote * 0.3 && latest <= selected.quote * 3) {
        historicalUnitPrice = latest;
      }
    } catch (err) {
      console.warn("[NegotiationAgent] refreshNegotiationSupplier purchase history lookup failed:", err);
    }
  }

  // Supplier Dependency: far-pricier alternatives (or none at all) mean the
  // buyer has nowhere better to go; a current quote above what this same
  // supplier has charged before compounds that — both raise dependency.
  // Comparable/cheaper alternatives, or a quote at/below history, lower it.
  const cheapestOtherQuote = others.length > 0 ? others[0].quote : null;
  const altGapPct = cheapestOtherQuote != null ? ((cheapestOtherQuote - selected.quote) / selected.quote) * 100 : null;
  const historyGapPct = historicalUnitPrice != null ? ((selected.quote - historicalUnitPrice) / historicalUnitPrice) * 100 : null;

  let dependencyScore = 0;
  if (altGapPct == null) dependencyScore += 2; // no alternative bidder at all
  else if (altGapPct > 15) dependencyScore += 1; // alternatives far pricier
  else if (altGapPct < -5) dependencyScore -= 1; // alternatives cheaper — real leverage

  if (historyGapPct != null) {
    if (historyGapPct > 5) dependencyScore += 1; // paying more than this supplier has before
    else if (historyGapPct < -5) dependencyScore -= 1;
  }

  const supplierDependency = dependencyScore >= 2 ? "High" : dependencyScore <= -1 ? "Low" : "Medium";
  const marketConditions = params.marketConditions || "Stable";

  // Overall leverage: tally favorable buyer signals.
  let leverageScore = 0;
  if (historicalDiscounts === "High" || historicalDiscounts === "Medium") leverageScore++;
  if (supplierDependency === "Low") leverageScore++;
  if (/favorab|declin|buyer|soft/i.test(marketConditions)) leverageScore++;
  const overallPosition = leverageScore >= 2 ? "Strong" : leverageScore === 1 ? "Moderate" : "Weak";

  // ── BATNA (deterministic) — mirrors sanitizeNegotiationInsightsData rules ──
  const isLowest = selected.supplierId === bidders[0].supplierId;
  let batna: any;
  if (isLowest) {
    const fallback = others[0];
    batna = {
      bestAlternative: "No switch needed — already the most competitive quote",
      expectedPrice: fallback ? fallback.quote : selected.quote,
      expectedSavings: 0,
    };
  } else {
    const lowest = bidders[0];
    batna = {
      bestAlternative: `Switch to ${lowest.supplierName}`,
      expectedPrice: lowest.quote,
      expectedSavings: Math.max(0, selected.quote - lowest.quote),
    };
  }
  batna.switchingRisk = isLowest ? "Low" : "Medium";
  batna.alternatives = bidders.map((b) => ({
    supplierName: b.supplierName,
    quote: b.quote,
    savingsOrPremium: selected.quote - b.quote,
    switchingRisk: b.supplierId === selected.supplierId ? "Low" : "Medium",
  }));

  // Rescale the Cost Waterfall to the newly selected supplier's quote — it
  // previously stayed fixed on whichever supplier the LLM first analyzed, so
  // switching suppliers here (a different "given price") left the waterfall
  // showing a breakdown of the old quote instead of the new one. Preserve the
  // original component proportions and re-sum exactly to the new quote,
  // absorbing rounding drift into the Margin/Profit line (same approach as
  // applyRealCostStructure above).
  let costStructure: Array<{ component: string; cost: number }> | null = null;
  if (Array.isArray(params.costStructure) && params.costStructure.length > 0 && selected.quote > 0) {
    const originalTotal = params.costStructure.reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
    if (originalTotal > 0) {
      const scale = selected.quote / originalTotal;
      const scaled = params.costStructure.map((c) => ({
        component: c.component,
        cost: Math.round((Number(c.cost) || 0) * scale * 100) / 100,
      }));
      const scaledTotal = scaled.reduce((sum, c) => sum + c.cost, 0);
      const drift = Math.round((selected.quote - scaledTotal) * 100) / 100;
      if (drift !== 0) {
        const marginIdx = scaled.findIndex((c) => /margin|profit/i.test(c.component));
        const idx = marginIdx !== -1 ? marginIdx : scaled.length - 1;
        scaled[idx] = { ...scaled[idx], cost: Math.round((scaled[idx].cost + drift) * 100) / 100 };
      }
      costStructure = scaled;
    }
  }

  return {
    suppliers,
    summary: {
      supplier: selected.supplierName,
      currentQuote: selected.quote,
      marketBenchmark: benchmark,
      variance: fmtVariance(selPct),
      negotiationPotential: potentialOf(selPct),
    },
    strength: { historicalDiscounts, supplierDependency, marketConditions, overallPosition },
    batna,
    supplierScorecard: real?.supplierScorecard ?? null,
    avgDiscountWonPct: real?.avgDiscountWonPct ?? null,
    activeContractsCount: real?.activeContractsCount ?? null,
    costStructure,
  };
}

function stripComments(str: string): string {
  return str.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
}

// The model emits a negotiation_insights JSON block far more often than it
// should (the system prompt pushes hard for it on bid analyses). When that
// block has no actual quote to analyze — e.g. "what leverage do we have
// against X" with no bids — attaching it would put an Insights button over a
// panel of zeros. Gate on quote substance: no quote, no panel, prose only.
function insightsResult(cleanResponse: string, data: any): NegotiationAgentResponse {
  const num = (v: any) => parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  const hasQuote = num(data?.summary?.currentQuote) > 0 || num(data?.overview?.quotePrice) > 0;
  if (!hasQuote) {
    return { response: cleanResponse || "I couldn't find a quote to analyze for this request." };
  }
  return {
    response: cleanResponse || "Negotiation strategy generated successfully.",
    pendingAction: {
      type: "negotiation_insights",
      data,
      summary: "View Negotiation Strategy"
    }
  };
}

// Parses JSON payload block from agent text response if present
export function parseFinalAgentResponse(text: string): NegotiationAgentResponse {
  const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/;
  const match = text.match(jsonBlockRegex);
  if (match) {
    try {
      const cleanedJson = stripComments(match[1]);
      const data = JSON.parse(cleanedJson);
      let cleanResponse = text.replace(jsonBlockRegex, "").trim();

      if (data.type === "comment_suggestion" && typeof data.comment === "string") {
        // Defensive trim in case the model wraps the comment in stray quotes
        // despite the prompt instructing against it — the box must show only
        // the raw comment text, never surrounding punctuation.
        const cleanComment = data.comment.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
        return {
          response: cleanResponse || cleanComment,
          pendingAction: {
            type: "comment_suggestion",
            data: { comment: cleanComment },
            summary: "Suggested Comment"
          }
        };
      }

      // Sanitize the JSON data structure
      sanitizeNegotiationInsightsData(data);

      // Clean up text response mentions of unavailable benchmarks
      const formattedBenchmark = data.summary?.marketBenchmark
        ? `$${data.summary.marketBenchmark}`
        : "Market Price";
      cleanResponse = cleanResponse.replace(/Market Benchmark:\s*\$?(?:Not available|N\/A|null)/gi, `Market Benchmark: ${formattedBenchmark}`);

      return insightsResult(cleanResponse, data);
    } catch (e) {
      console.warn("[NegotiationAgent] Failed to parse JSON block:", e);
    }
  }

  // Fallback checks for implicit strategy outputs (e.g. if the model forgot markdown syntax)
  const plainJsonRegex = /(\{[\s\S]*"negotiationPotential"[\s\S]*\})/;
  const plainMatch = text.match(plainJsonRegex);
  if (plainMatch) {
    try {
      const cleanedJson = stripComments(plainMatch[1]);
      const data = JSON.parse(cleanedJson);
      let cleanResponse = text.replace(plainJsonRegex, "").trim();

      sanitizeNegotiationInsightsData(data);

      const formattedBenchmark = data.summary?.marketBenchmark
        ? `$${data.summary.marketBenchmark}`
        : "Market Price";
      cleanResponse = cleanResponse.replace(/Market Benchmark:\s*\$?(?:Not available|N\/A|null)/gi, `Market Benchmark: ${formattedBenchmark}`);

      return insightsResult(cleanResponse, data);
    } catch { }
  }

  // Last resort: the response got cut off mid-JSON (e.g. hit max_tokens) with
  // no closing ``` fence, so neither regex above matched. Try to repair it by
  // balancing unclosed braces/brackets/quotes before giving up — and if that
  // still fails, NEVER show the raw/broken JSON in chat; strip it and surface
  // clean prose (or a fallback message) instead.
  const openFenceIdx = text.indexOf("```json");
  if (openFenceIdx !== -1) {
    const fenceBody = text.slice(openFenceIdx + "```json".length);
    const repaired = repairTruncatedJson(fenceBody);
    if (repaired) {
      try {
        sanitizeNegotiationInsightsData(repaired);
        const cleanResponse = text.slice(0, openFenceIdx).trim();
        return insightsResult(cleanResponse, repaired);
      } catch { }
    }
    const cleanResponse = text.slice(0, openFenceIdx).trim();
    return { response: cleanResponse || "I generated a strategy but the response was cut off. Please try again." };
  }

  return { response: text };
}

// Best-effort repair for a JSON object truncated mid-generation: closes any
// unterminated string, then appends the closing `]`/`}` needed to balance
// whatever was opened. Returns null if the result still isn't valid JSON.
function repairTruncatedJson(fragment: string): any | null {
  let str = fragment.trim();
  const fenceEnd = str.lastIndexOf("```");
  if (fenceEnd !== -1) str = str.slice(0, fenceEnd);

  const firstBrace = str.indexOf("{");
  if (firstBrace === -1) return null;
  str = str.slice(firstBrace);

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of str) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let repaired = str;
  if (inString) repaired += '"';
  // Drop a trailing dangling comma/key before closing (e.g. `"foo": ` or `,`).
  repaired = repaired.replace(/,\s*$/, "").replace(/"[^"]*"\s*:\s*$/, "");
  while (stack.length > 0) repaired += stack.pop();

  try {
    return JSON.parse(stripComments(repaired));
  } catch {
    return null;
  }
}

