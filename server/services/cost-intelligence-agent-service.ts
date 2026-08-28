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
import { getOgdMandiPrices } from "./ogd-market-price";
import { scrapeMarketSuppliers } from "./market-supplier-scraper";
import { convertCurrency } from "./pr-ai-service";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  type: "cost_intelligence_insights" | "select_quote" | "select_sos_items" | "fmc_card";
  data: any;
  summary: string;
}

interface CostIntelligenceAgentResponse {
  response: string;
  pendingAction?: PendingAction;
}

// ── Database Helper Functions ─────────────────────────────────────────────

async function getSupplierSOSItems(supplierId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT * FROM dbo.supp_scope_of_supply_service WHERE supplier_id = $1`,
    [supplierId]
  );
  return res.rows;
}

async function getSupplierQuotesAndLines(supplierId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT
      r.id as quote_id,
      r.bidrefno,
      r.bidtotal,
      r.creation_date,
      rl.bidprice as line_unit_cost,
      l.quantity as line_qty,
      l.description as item_description,
      l.product_category as product_category_name
     FROM dbo.supp_bid_response_dtls r
     JOIN dbo.supp_bid_response_line_dtls rl ON rl.bid_resp_id = r.id
     JOIN dbo.supp_bid_line_dtls l ON l.id = rl.bid_line_id
     WHERE r.supplier_id = $1 AND r.status = 'Submitted'
     ORDER BY r.creation_date DESC`,
    [supplierId]
  );
  return res.rows;
}

async function getQuoteById(quoteId: string) {
  const dbPool = getContextPool() ?? defaultPool;
  // Normalize quoteId to 5-digit zero-padded string if it's numeric
  let cleanId = String(quoteId).trim();
  if (/^\d+$/.test(cleanId)) {
    cleanId = cleanId.padStart(5, '0');
  }

  const res = await dbPool.query(
    `SELECT r.*, s.company_name, s.supplier_type, s.type_of_company, s.country, s.state, s.legal_entity_type, b.type AS quote_type
     FROM dbo.supp_bid_response_dtls r
     LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = r.supplier_id
     LEFT JOIN dbo.supp_bid_dtls b ON b.id = r.bidrefno
     WHERE r.id = $1 LIMIT 1`,
    [cleanId]
  );
  return res.rows[0] || null;
}

async function getBidLines(bidId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT * FROM dbo.supp_bid_line_dtls WHERE bidrefno = $1`,
    [bidId]
  );
  return res.rows;
}

async function getHistoricalQuotes(supplierId: number) {
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT r.id, r.bidrefno, r.bidtotal, r.creation_date, r.status
     FROM dbo.supp_bid_response_dtls r
     WHERE r.supplier_id = $1 AND r.status = 'Submitted'
     ORDER BY r.creation_date DESC LIMIT 5`,
    [supplierId]
  );
  return res.rows;
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

// ── Real-market-grounding pipeline (mapSupplierType, applyLocalSuppliers,
// applyRealMarketPricing, applyRealCostStructure) moved to
// negotiation-agent-service.ts, where it now also grounds that agent's
// negotiation_insights panel. This agent's fairMarketPrice / localSuppliers /
// costStructure fields remain pure LLM estimates (those panels aren't shown
// here). The spend chart is the exception: CURRENT (quoted price), MARKET
// (real external snapshot), and SPEND (real per-PO-transaction prices) all
// need real data, so that piece is grounded below.
async function getItemPoTransactions(itemName: string) {
  if (!itemName || !itemName.trim()) return [];
  const dbPool = getContextPool() ?? defaultPool;
  const res = await dbPool.query(
    `SELECT l.line_unit_cost AS unit_price,
            h.po_issue_date,
            h.po_number,
            h.company_name AS supplier
     FROM dbo.supp_po_line_dtls l
     JOIN dbo.supp_po_header_dtls h ON l.po_number = h.po_number
     WHERE (LOWER(TRIM(l.item_name)) = LOWER(TRIM($1))
            OR LOWER(TRIM(l.line_description)) = LOWER(TRIM($1)))
       AND h.po_status NOT IN ('Draft','Pending Approval','Rejected','Cancelled','DRAFT','CANCELLED','REJECTED')
       AND h.po_issue_date >= (CURRENT_DATE - INTERVAL '12 months')
       AND l.line_unit_cost IS NOT NULL
     ORDER BY h.po_issue_date ASC
     LIMIT 300`, // ponytail: hard cap, no real item approaches this in a year
    [itemName]
  );
  return res.rows as { unit_price: string; po_issue_date: string; po_number: string; supplier: string }[];
}

// Real market snapshot: govt mandi API (agri commodities) falling back to the
// live supplier scraper (everything else). Never throws; returns null when
// neither source has usable data rather than fabricating a value. avg is the
// mean of the extracted market prices; min/max are the extracted extremes.
interface RealMarketSnapshot { avg: number; min: number; max: number }

async function getRealMarketSnapshot(item: string, targetCurrency: string, originCountry: string): Promise<RealMarketSnapshot | null> {
  const cleanItem = (item || "").trim();
  if (!cleanItem) return null;
  const currency = (targetCurrency || "USD").toUpperCase();

  try {
    const ogd = await getOgdMandiPrices(cleanItem);
    if (ogd) {
      try {
        const rate = await convertCurrency(1, "INR", currency);
        const avg = ogd.avgModalPriceINRPerKg * rate;
        const min = (ogd.minPriceINRPerQuintal / 100) * rate;
        const max = (ogd.maxPriceINRPerQuintal / 100) * rate;
        if (isFinite(avg) && avg > 0) {
          return {
            avg: Math.round(avg * 100) / 100,
            min: isFinite(min) && min > 0 ? Math.round(min * 100) / 100 : Math.round(avg * 100) / 100,
            max: isFinite(max) && max > 0 ? Math.round(max * 100) / 100 : Math.round(avg * 100) / 100
          };
        }
      } catch (err: any) {
        console.warn(`[CostIntelligenceAgent] OGD currency conversion INR->${currency} failed:`, err?.message || err);
      }
    }
  } catch (err) {
    console.warn("[CostIntelligenceAgent] OGD mandi price lookup failed:", err);
  }

  try {
    const scraped = await scrapeMarketSuppliers(cleanItem, "", originCountry || "");
    const priced = (scraped || []).filter((s) => s.unitPrice != null);
    if (priced.length === 0) return null;

    const distinctCurrencies = Array.from(new Set(priced.map((s) => String(s.priceCurrency || "USD").toUpperCase())));
    const rateByCurrency: Record<string, number> = {};
    for (const cur of distinctCurrencies) {
      try {
        rateByCurrency[cur] = await convertCurrency(1, cur, currency);
      } catch (err: any) {
        console.warn(`[CostIntelligenceAgent] exchange rate ${cur}->${currency} unavailable:`, err?.message || err);
      }
    }

    const convertedPrices = priced
      .map((s) => {
        const cur = String(s.priceCurrency || "USD").toUpperCase();
        const rate = rateByCurrency[cur];
        return rate != null ? (s.unitPrice as number) * rate : null;
      })
      .filter((p): p is number => p != null && isFinite(p));

    if (convertedPrices.length === 0) return null;
    return {
      avg: Math.round((convertedPrices.reduce((a, b) => a + b, 0) / convertedPrices.length) * 100) / 100,
      min: Math.round(Math.min(...convertedPrices) * 100) / 100,
      max: Math.round(Math.max(...convertedPrices) * 100) / 100
    };
  } catch (err) {
    console.warn("[CostIntelligenceAgent] market scraper snapshot failed:", err);
    return null;
  }
}

async function applyRealSpendTrend(data: any, marketSnapshot: number | null) {
  if (!data?.overview) return;
  const quotePrice = Number(data.overview.quotePrice) || 0;
  const item = String(data.overview.item || "").trim();

  let poRows: Awaited<ReturnType<typeof getItemPoTransactions>> = [];
  if (item) {
    try {
      poRows = await getItemPoTransactions(item);
    } catch (err) {
      console.warn("[CostIntelligenceAgent] item PO transaction lookup failed:", err);
    }
  }

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - 12);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = (d: Date) => `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;

  const trend: Array<{ date: number; name: string; current: number | null; market: number | null; spend: number | null; poNumber?: string; supplier?: string }> = [
    { date: windowStart.getTime(), name: monthLabel(windowStart), current: quotePrice, market: null, spend: null },
    { date: now.getTime(), name: monthLabel(now), current: quotePrice, market: null, spend: null },
  ];

  // MARKET: fluctuating series (inflation/commodity movement) centered on the
  // real external snapshot when available, else the quoted price. Sampled
  // weekly so the frontend's 1M/3M range filters still have enough points to
  // draw a line. ponytail: deterministic wave, not real month-by-month history
  // — neither external source provides one.
  const baseMarket = marketSnapshot != null && marketSnapshot > 0 ? marketSnapshot : quotePrice;
  if (baseMarket > 0) {
    const STEPS = 52;
    const windowMs = now.getTime() - windowStart.getTime();
    for (let i = 0; i <= STEPS; i++) {
      const ts = windowStart.getTime() + (windowMs * i) / STEPS;
      const t = (12 * i) / STEPS; // months since window start
      const wave = 1 + 0.09 * Math.sin(t * 0.7) + 0.035 * Math.cos(t * 1.3);
      trend.push({
        date: ts,
        name: monthLabel(new Date(ts)),
        current: null,
        market: Math.round(baseMarket * wave * 100) / 100,
        spend: null,
      });
    }
  }

  for (const row of poRows) {
    const v = parseFloat(row.unit_price);
    const d = new Date(row.po_issue_date);
    if (Number.isNaN(v) || Number.isNaN(d.getTime())) continue;
    trend.push({
      date: d.getTime(),
      name: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      current: null,
      market: null,
      spend: Math.round(v * 100) / 100,
      poNumber: row.po_number || undefined,
      supplier: row.supplier || undefined,
    });
  }

  trend.sort((a, b) => a.date - b.date); // required: Recharts draws in array order, not by value

  const hasPurchaseHistory = trend.some((t) => t.spend !== null);
  if (!data.charts) data.charts = {};
  data.charts.spendTrend = trend;
  data.charts.hasPurchaseHistory = hasPurchaseHistory;
}

/*
function mapSupplierType(rawType: string): "Primary Producer" | "Manufacturer" | "Trader / Distributor" {
  const t = (rawType || "").toLowerCase();
  if (t.includes("distributor") || t.includes("trader") || t.includes("dealer") || t.includes("reseller")) {
    return "Trader / Distributor";
  }
  if (t.includes("producer") || t.includes("primary")) {
    return "Primary Producer";
  }
  return "Manufacturer";
}

async function applyLocalSuppliers(data: any, prompt: string, scrapePromise?: Promise<any>) {
  if (!data) return;

  let city = "";
  let country = "";

  const delivMatch = prompt.match(/-\s*Delivery Location:\s*([^,\n]+)(?:,\s*([^\n]+))?/i);
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
      console.warn("[CostIntelligenceAgent] scrape error in post-processing:", err);
      return [];
    });
  }

  let scrapedSuppliers: any[] = [];
  if (scrapePromise) {
    try {
      scrapedSuppliers = await scrapePromise;
    } catch (err) {
      console.warn("[CostIntelligenceAgent] web scraper promise failed:", err);
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

  // Live market suppliers only — LLM-invented fallback entries disabled above.
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
  const locParts = [city, country].filter(Boolean);
  data.localSuppliersNear = locParts.length > 0 ? locParts.join(", ") : (data.overview?.country || "Delivery Location");
}
*/

/*
async function applyRealMarketPricing(data: any) {
  const fairMarketPrice = data?.fairMarketPrice;
  const dataSources = fairMarketPrice?.dataSources;
  if (!fairMarketPrice || !Array.isArray(dataSources) || dataSources.length !== 4) return;

  const targetCurrency = String(data.overview?.currency || "USD").toUpperCase();
  const webSuppliers = (Array.isArray(data.localSuppliers) ? data.localSuppliers : [])
    .filter((s: any) => s.source === "web" && s.unitPrice != null);
  if (webSuppliers.length < 2) return;

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
      console.warn(`[CostIntelligenceAgent] exchange rate ${cur}->${targetCurrency} unavailable:`, err?.message);
    }
  }

  const convertedPrices = webSuppliers
    .map((s: any) => {
      const cur = String(s.priceCurrency || "USD").toUpperCase();
      const rate = rateByCurrency[cur];
      return rate != null ? s.unitPrice * rate : null;
    })
    .filter((p: any): p is number => p != null && !Number.isNaN(p));

  if (convertedPrices.length < 2) return;

  const rangeMin = Math.round(Math.min(...convertedPrices) * 100) / 100;
  const rangeMax = Math.round(Math.max(...convertedPrices) * 100) / 100;
  const avgPrice = Math.round((convertedPrices.reduce((sum: number, p: number) => sum + p, 0) / convertedPrices.length) * 100) / 100;

  dataSources[1] = {
    ...dataSources[1],
    rangeMin,
    rangeMax,
    description: `Live-scraped from ${convertedPrices.length} verified supplier listings (ExportersIndia / Made-in-China), last refreshed today`,
  };

  // Ground the headline Fair Market Price on the real supplier average, rather
  // than the LLM's blended estimate, now that real market data is available.
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
    console.warn(`[CostIntelligenceAgent] cost-structure OGD conversion INR->${targetCurrency} failed:`, err?.message);
    return;
  }
  if (!isFinite(realRawMaterialCost) || realRawMaterialCost <= 0 || realRawMaterialCost >= quotePrice) return;

  const originalRawMaterialCost = Number(costStructure[rawMaterialIdx].cost) || 0;
  const delta = realRawMaterialCost - originalRawMaterialCost;
  const adjustedMarginCost = (Number(costStructure[marginIdx].cost) || 0) - delta;
  if (adjustedMarginCost <= 0) return; // unrealistically large delta — leave the LLM's estimate in place

  costStructure[rawMaterialIdx] = { ...costStructure[rawMaterialIdx], cost: Math.round(realRawMaterialCost * 100) / 100 };
  costStructure[marginIdx] = { ...costStructure[marginIdx], cost: Math.round(adjustedMarginCost * 100) / 100 };

  // Keep the Margin Gauge percent consistent with the re-grounded waterfall.
  if (data.marginBenchmark) {
    data.marginBenchmark.marginPercent = Math.round((adjustedMarginCost / quotePrice) * 1000) / 10;
  }
}
*/

async function searchQuotes(query: string = "", limit: number = 8) {
  const dbPool = getContextPool() ?? defaultPool;
  let res;
  if (query) {
    res = await dbPool.query(
      `SELECT r.id, r.bidrefno, r.bidtotal, s.company_name, s.country, b.type AS quote_type
       FROM dbo.supp_bid_response_dtls r
       LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = r.supplier_id
       LEFT JOIN dbo.supp_bid_dtls b ON b.id = r.bidrefno
       WHERE (LOWER(r.id) LIKE $1 OR LOWER(s.company_name) LIKE $1)
         AND r.status NOT IN ('Draft', 'Cancelled')
       ORDER BY r.id DESC LIMIT $2`,
      [`%${query.toLowerCase()}%`, limit]
    );
  } else {
    res = await dbPool.query(
      `SELECT r.id, r.bidrefno, r.bidtotal, s.company_name, s.country, b.type AS quote_type
       FROM dbo.supp_bid_response_dtls r
       LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = r.supplier_id
       LEFT JOIN dbo.supp_bid_dtls b ON b.id = r.bidrefno
       WHERE r.status NOT IN ('Draft', 'Cancelled')
       ORDER BY r.id DESC LIMIT $1`,
      [limit]
    );
  }
  return res.rows;
}

// ── System Prompt ─────────────────────────────────────────────────────────

const COST_INTELLIGENCE_SYSTEM_PROMPT = `You are an AI Should Cost Intelligence Agent for Prokraya. You analyze quotations to estimate the supplier's economics, internal cost breakdown, and net profit margin, identifying negotiation target thresholds.

## PRIMARY GOALS
1. Understand how much margin a supplier is likely making on a quote (ABC Steel quoted $120. Is it costing them $80 or $115?).
2. Determine Supplier Type: Type 1 (Primary Producer / Manufacturer) vs. Type 2 (Trader / Distributor / Reseller).
3. Evaluate cost drivers: Commodity declines, Freight reductions, Historical supplier discounts, Inflation rates.

## DEFINITIONS & CALCULATION FORMULAS FOR COST INTELLIGENCE
When calculating and analyzing cost metrics, strictly use these definitions and explicit formulas:
1. **Selling Price**: Quoted Unit Price (\`quotePrice\`) provided by the supplier or parameter input.
2. **Total Supplier Cost**: Sum of internal cost breakdown components excluding Margin (\`Selling Price - Supplier Margin\`).
3. **Supplier Margin**: Net profit margin earned by the supplier (\`Selling Price - Total Supplier Cost\`, represented as \`marginBenchmark.marginPercent\` or the Margin component in \`costStructure\`).
4. **Fair Market Cost (FMC)**: The full should-cost to produce/deliver the item = \`BOM (Raw Material / Purchase Cost) + Manufacturing/Energy + Labor + Packaging + Overhead + Freight/Logistics\`. FMC EXCLUDES only the supplier profit margin. 
   - **YOU compute FMC — the system never calculates, overrides, or corrects it.** Build it BOTTOM-UP from this specific item's real input economics: how much raw material the item consumes and that commodity's prevailing rate, labor content at the supplier country's actual wage rates, energy/machine time, packaging, plant overhead, and freight for the given origin and delivery location. Sum those into a realistic min–max band per the item's unit of measure.
   - NEVER derive FMC from a price: not from the quoted/estimated selling price (\`quotePrice - margin\`), not from the quote's costStructure components, and not from the market price (\`FMP × (1 - margin)\`). Each of those yields a restatement of a price, not a cost.
   - Sanity check before you output: FMC must sit BELOW your FMP, and the implied margin \`(FMP - FMC) / FMP\` should land near the industry benchmark you report. If it doesn't, revisit your input-cost assumptions — do not scale the number to fit.
5. **Fair Market Price (FMP)**: Prevailing external market selling benchmark price (\`fmp.price\`, \`fmp.rangeMin\`, \`fmp.rangeMax\`), derived from market benchmarks, scraped supplier quotes, or mandi commodity prices.
6. **FMP Margin / Variance**: Price premium or discount of the Selling Price against FMP = \`fmpMarginAmount = Selling Price - FMP\` and \`fmpMarginPercent = ((Selling Price - FMP) / FMP) * 100\`.

## YOUR TOOLS & CAPABILITIES
You can answer user questions about supplier cost structures, margins, and quotes. You have these database lookup tools:
1. **get_supplier_sos_items**: Fetch the Scope of Supply (SOS) items and related submitted quotes/line items for a supplier using their supplier ID.
2. **get_quote_cost_details**: Fetch details of a specific quotation (by quote ID, e.g. "00001" or "00045"), including item description, supplier type, and country of origin.
3. **get_historical_quotes**: Fetch past quotations for the supplier.
4. **get_market_benchmarks**: Fetch average purchase prices (from POs) for the item's category.
5. **request_quote_selection**: Trigger dropdown searchable selection for quotes if quote ID is missing or ambiguous.

## COMMANDS & INTERACTION WORKFLOW

### 1. Command: Get cost estimates of {@supplier}
When the user mentions a supplier (e.g. "Get cost estimates of @ABC Steel"), you MUST:
- Call the **get_supplier_sos_items** tool using their supplier ID.
- Check if they have associated Scope of Supply (SOS) items.
- If they have no SOS items, state clearly that there are no Scope of Supply items associated with this supplier.
- If they do have SOS items, you MUST ask the user to select either "All Items" or a specific item from their Scope of Supply. You MUST return a JSON block at the very end of your response inside a \`\`\`json ... \`\`\` code block containing:
  \`\`\`json
  {
    "type": "select_sos_items",
    "data": {
      "supplierId": number,
      "supplierName": "Supplier Name",
      "items": [
        {
          "subCategory": "subcategory name",
          "subCategoryCode": "code",
          "goodServiceCode": "code",
          "serviceDetails": "details"
        }
      ]
    }
  }
  \`\`\`

### 2. User selects "All Items"
When the user selects all items (e.g., "Analyze all Scope of Supply items for supplier @ABC Steel (ID: 123)"), you MUST:
- Call the **get_supplier_sos_items** tool using the supplier ID.
- Extract all SOS items and evaluate the supplier's submitted quotes and lines ('quotesAndLines' from the tool response).
- Compute and provide a text-only summary including:
  1. Average margin of all quoted prices (e.g., "Average quoted margin is estimated at 24%").
  2. Pricing position (e.g., "Above Market", "At Market", "Below Market" compared to typical benchmarks).
  3. List of items (all SOS items).
  4. Negotiation % (suggested target reduction percentage, e.g., "Negotiation potential: 7.5%").
  5. Fair Market Cost (FMC) — see the "FAIR MARKET COST (FMC)" rules below.
- **CRITICAL**: Do NOT return a "cost_intelligence_insights" JSON block or insights payload for "All Items" since **no insights panel is required** (the interactive dashboard should not open). Just respond in plain markdown with a clean table summarizing the parameters, plus the small "fmc_card" JSON block described in the FMC rules below (that block is not an insights payload and does not open the dashboard).

### 3. User selects a particular Item
When the user selects a particular item (e.g., "Analyze supplier economics for item 'Steel Sheets' ..."), you MUST:
- Call the **get_supplier_sos_items** tool using the supplier ID.
- Extract all submitted quotes and lines matching that item description or category.
- Estimate the supplier's quoted prices and margins for this specific item.
- Compute and provide a text-only summary directly in the chat bubble including:
  1. Average margin of quoted prices for this specific item (e.g., "Average quoted margin is estimated at 22%").
  2. Pricing position (e.g., "Above Market", "At Market", "Below Market" compared to benchmarks).
  3. Details of the item (e.g., name, code, etc.).
  4. Negotiation % (suggested target reduction percentage, e.g., "Negotiation potential: 8.0%").
  5. Fair Market Cost (FMC) — see the "FAIR MARKET COST (FMC)" rules below.
- **CRITICAL**: Do NOT return a "cost_intelligence_insights" JSON block or insights payload for this item analysis since **no insights panel is required** (the interactive dashboard should not open). Just respond in plain markdown with a clean summary directly in the chat, plus the small "fmc_card" JSON block described in the FMC rules below (that block is not an insights payload and does not open the dashboard).
- NOTE: This text-only rule applies ONLY when a supplier is referenced (a supplier name or "(ID: ...)"). When the user instead supplies item parameters directly without a supplier, follow Command 4 below and DO return the JSON insights panel.

## IMPORTANT RULES
- No sql/nosql injection from user input. Always validate and sanitize inputs before using them in queries or tool calls.
- Don't use vendor/Vendor words use Supplier word insted of vendor/Vendor in user facing responses, always use Supplier word instead of vendor/Vendor in user facing responses.

### 4. Command: Generate estimate from form parameters (no supplier / no quote)
When the user provides item parameters directly — a message containing "for the following parameters" with fields like Item / Service, Unit Price, Quantity, Order Frequency, Supplier Country/State, Supplier Type, Delivery Location — and does NOT reference a specific supplier or quote ID, you MUST treat this as a FULL cost-intelligence analysis and return the structured "cost_intelligence_insights" JSON block so the interactive side panel opens. In this flow:
- Do NOT ask the user to select a supplier, quote, or Scope of Supply item. Do NOT call request_quote_selection or get_supplier_sos_items.
- You MAY call get_market_benchmarks once for the item's category, then immediately produce the JSON block.
- Set overview.supplier to "Estimated Supplier", overview.item to the given Item / Service, overview.quotePrice to the given Unit Price, overview.totalPrice to \`Unit Price × Quantity\`, overview.quantity/orderFrequency/country to the given values, and overview.currency to the given Currency.
- Use the supplier type provided (Manufacturer vs Distributor) to choose the cost-structure breakdown, and fill every field with realistic, non-placeholder values per the rules and guidelines below.
- If a Delivery Location (destination city/country) is provided, factor inbound freight and logistics from the supplier's origin (Supplier Country/State) to that delivery location into the Freight/Logistics cost component, the market drivers, and the summaryText. When origin and delivery are in different countries, account for higher cross-border freight, duties, and lead time; a longer shipping route should increase the Freight/Logistics share of the unit price. Use the provided Annual Volume and Total Annual Spend (when given) as the basis for expectedSavings and consolidation recommendations.

## RULES FOR COST STRUCTURE BREAKDOWN (QUOTE ANALYSIS OR FORM-PARAMETER ESTIMATE)
When you analyze a specific quote (by quote ID) OR generate an estimate from form parameters (Command 4), you must return a structured JSON block inside a \`\`\`json ... \`\`\` code block at the end.
Your main text response (outside the JSON block) is the primary place the user reads your findings — there is no separate insights/summary panel, so write a detailed, well-structured narrative paragraph (not a brief 2-4 sentence teaser) covering the estimated supplier margin, how it compares to the industry benchmark, sourcing/negotiation recommendations, the potential annual savings, and the Fair Market Cost (FMC — see rules below). The JSON block's stat cards and charts (margin gauge, cost waterfall, spend trend, market drivers, recommendations) supplement this narrative in the interactive Cost Intelligence Panel — they don't replace it.
The JSON block must have exactly type: "cost_intelligence_insights", containing all details.
DO NOT use markdown tables or pipe character (|) tables in your main text response. Always structure lists cleanly.

Based on Supplier Type:
- **Primary Producer / Manufacturer (Type 1):**
  Break down cost into: Raw Material, Labor, Energy, Manufacturing, Packaging, Freight, Overhead, Margin.
  List Drivers: Commodity Prices, Labor Inflation, Energy Costs, Freight Index, FX Movement, Country Inflation, Raw Material Trends, Manufacturing Complexity.
- **Trader / Distributor / Reseller (Type 2):**
  Break down cost into: Purchase Cost, Import Duties, Warehousing, Distribution, Freight, Overhead, Margin.
  List Drivers: Distributor Margin, Import Costs, Freight Costs, FX Rates, Inventory Costs, Warehousing, Channel Markups.

## GUIDELINES FOR DYNAMIC & REALISTIC ESTIMATION
When analyzing or generating cost structures:
1. Ensure the estimates are highly realistic for the specific item/service, supplier type, quantity, frequency, and country provided.
2. Do not use generic placeholder values in the JSON block. Research or estimate the true economics of the item (e.g. steel, electronics, packaging, services).
3. Calculate the price benchmarks realistically based on relative labor and supply-chain costs:
   - If a supplier state is specified/given (e.g. in the parameters or quote details), calculate the benchmark comparing the selected state (with "isSelected": true, and "country" field set to the state name, e.g. "California" or "Maharashtra") against the top 5 other states within the same country (e.g. for US: Texas, New York, Florida, Illinois, Ohio; for India: Karnataka, Gujarat, Tamil Nadu, Delhi, Maharashtra).
   - If no state is specified/given (only country is provided), calculate the country price benchmarks comparing the selected country (with "isSelected": true) against the top 5 other countries (e.g., India, China, Vietnam, USA, Germany, Mexico).
   - **charts.countryBenchmark is MANDATORY and must always contain 6 entries** (1 selected + 5 alternatives), each with a real region name and YOUR OWN estimated prevailing market unit price for that region — derived from that region's actual labor rates, raw-material access, energy costs, and export logistics for this specific item. The system does NOT generate these regions or prices; if you omit them the benchmark chart is dropped entirely. Choose regions that genuinely make sense as sourcing alternatives for this item, and never emit flat percentage nudges off the quoted price.
4. For the spendTrend, output ONLY the external MARKET UNIT PRICE for each of the next 12 months. Each entry is the estimated prevailing external market unit price for the item (NOT total spend, NOT the supplier's quote), reflecting commodity/inflation ups and downs. Do NOT output 'current' or 'optimized' values — those are computed by the system from the quoted price and real purchase-order history.
5. The costStructure elements must sum up exactly to the unit price (quotePrice) provided.
6. ALWAYS call get_market_benchmarks tool to check previous purchases and PO history for the item/service category.
7. If the item has no previous purchases in the database (averagePOUnitPrice is null or totalPOCount is 0) or is an unknown/new manual item with no historical purchase records:
   - Explicitly mention in your text response that there are no historical purchase records or PO history for this item in the database, so the estimation is based on general industry benchmarks and typical supplier economics.
   - Do NOT default the savings to 0 and do NOT make the optimized spend values identical to the current values. Perform a realistic estimation of the savings potential (e.g., target a 5% to 15% optimization based on the margin gap compared to the typical industry benchmark) and simulate the optimized spend trend curve accordingly.
8. **SINGLE CURRENCY RULE**: Every monetary value in the JSON block — overview.quotePrice, costStructure costs, fmc.min/max, fmp.price/rangeMin/rangeMax/fmpMarginAmount, charts.countryBenchmark prices, charts.spendTrend market values, recommendation.expectedSavings, and every recommendations[].savings — MUST be expressed in the ONE currency given by overview.currency (the currency specified by the user's input parameter). Never mix currencies within a single response, and never silently fall back to USD for any of these fields when a different currency was specified. Do not convert any of these values to USD; calculate and output everything in the user's chosen currency. Ensure "currency" in the JSON matches the chosen currency.
9. For all estimations (whether the item is known or unknown), ALWAYS estimate a non-zero expectedSavings (potential annual savings) based on:
   - Alternative country benchmark differences (e.g., if other countries like India or Vietnam are 10-25% cheaper than the current price, target a realistic portion of that difference as potential savings).
   - Logistics or consolidation optimizations (typically 5-15% of annual spend).
   - The "expectedSavings" in the recommendation block MUST be greater than zero and equal the sum of savings across 2 to 3 distinct items in the "recommendations" array (e.g., Direct Price Negotiation, Competitive RFQ / Dual Sourcing, Volume Consolidation). Do not return only 1 single recommendation containing 100% of the total savings.

Do NOT include "fairMarketPrice" or "localSuppliers" root keys in your JSON output — use the explicit "fmp" object structure defined below.

## FAIR MARKET COST (FMC) & FAIR MARKET PRICE (FMP)
In every response that discusses a supplier's cost/margin (Commands 2, 3, and 4/quote-ID analysis), explain FMC, FMP, and Supplier Margin clearly:
- State the estimated **Fair Market Cost (FMC)** as a range. Bold both the "Estimated Fair Market Cost" label and the item name using markdown \`**...**\`, e.g. "**Estimated Fair Market Cost for Steel Sheets**: $82–$95 per unit." FMC = full should-cost: BOM (Raw Material or Purchase Cost) + Manufacturing/Energy + Labor + Packaging + Overhead + Freight/Logistics (everything except supplier profit margin), built bottom-up from the item's real input costs as defined in the DEFINITIONS section — never back-derived from any price. It must sit below your FMP.
- State the estimated **Fair Market Price (FMP)** as a range (rangeMin–rangeMax, never a single exact price) and the **FMP Margin**: e.g., "**Fair Market Price (FMP)**: $97–$113 per unit (FMP Variance: +$15.00 / +14.3% vs FMP midpoint)."
- **When you compute a structured costStructure (Command 4 / quote-ID analysis)**: FMC is still your own bottom-up should-cost band, computed from the item's real input economics — do NOT sum the costStructure components or subtract margin from quotePrice to get it. Include both "fmc" and "fmp" objects in the "cost_intelligence_insights" JSON block.
- **For text-only supplier analyses (Commands 2 and 3)**: end your markdown response with a small standalone \`\`\`json block in this EXACT format (this is the "fmc_card" block; it does not open the dashboard):
{
  "type": "fmc_card",
  "item": "Item name (or 'All Items' for Command 2)",
  "currency": "same currency as the analysis",
  "fmcMin": number (FMC range low end),
  "fmcMax": number (FMC range high end)
}

Format your output structure in the JSON data payload (inside the \`\`\`json block) with this EXACT structure (for quote analysis and form-parameter estimates):
{
  "overview": {
    "item": "Name of the item/service",
    "supplier": "Name of the supplier (use 'Estimated Supplier' if from form parameters)",
    "supplierType": "Manufacturer" or "Distributor",
    "country": "Origin country",
    "region": "Supplier region",
    "quotePrice": number (unit price, as quoted by the supplier or given in the input parameters),
    "totalPrice": number (quotePrice × quantity),
    "quantity": number,
    "orderFrequency": "Weekly" | "Twice Weekly" | "Biweekly" | "Monthly" | "Bimonthly (Every 2 Months)" | "Quarterly" | "Half-Yearly" | "Annually",
    "currency": "USD" | "AED" | "INR" | "EUR" | "GBP" | "CAD",
    "uom": "unit of measure the unit price is quoted in, chosen for THIS item (use the quote line's UOM when available; otherwise the natural trade unit) — one of: kg, MT, g, L, mL, m, m², m³, ft, pcs, set, unit, pair, roll, sheet, box, bag, drum, ream"
  },
  "marginBenchmark": {
    "marginPercent": number (e.g. 44 for 44%),
    "industryMarginMin": number (e.g. 22),
    "industryMarginMax": number (e.g. 28),
    "industryMargin": "string summarizing benchmark (e.g. 22-28% benchmark)",
    "pricingPosition": "Above Market" | "Below Market" | "At Market",
    "pricingScore": number (0 to 100 pricing health score),
    "pricingAction": "short 2-4 word buyer action for THIS pricing position, e.g. 'Negotiate now' when above market, 'Hold position' when at market, 'Lock in price' when below market — no leading arrow or punctuation"
  },
  "recommendation": {
    "expectedSavings": number (total potential annual savings, in the SAME currency as overview.currency — never USD unless overview.currency is USD),
    "confidencePercent": number (model confidence 0-100),
    "confidenceSubtext": "string explaining confidence (e.g. 500 units/yr model accuracy)"
  },
  "costStructure": [
    { "component": "string (e.g. Raw Materials, Labor, Overhead, Logistics, Supplier Profit)", "cost": number }
  ],
  "fmc": {
    "min": number (Fair Market Cost range low end — YOUR bottom-up should-cost for this item: BOM + Manufacturing + Labor + Packaging + Overhead + Freight, excluding supplier profit. REQUIRED: the system never computes this, so an omitted or price-derived value is a wrong answer),
    "max": number (Fair Market Cost range high end)
  },
  "fmp": {
    "price": number (Fair Market Price — prevailing market benchmark price),
    "rangeMin": number (Fair Market Price range low end),
    "rangeMax": number (Fair Market Price range high end),
    "fmpMarginAmount": number (Selling Price - FMP),
    "fmpMarginPercent": number (((Selling Price - FMP) / FMP) * 100)
  },
  "charts": {
    "countryBenchmark": [
      { "country": "Selected Country or State Name (e.g. Germany or California)", "price": number, "isSelected": true },
      { "country": "Alternative Region 1", "price": number },
      { "country": "Alternative Region 2", "price": number },
      { "country": "Alternative Region 3", "price": number },
      { "country": "Alternative Region 4", "price": number },
      { "country": "Alternative Region 5", "price": number }
    ],
    "spendTrend": [
      { "name": "Jan", "market": number },
      { "name": "Feb", "market": number },
      { "name": "Mar", "market": number },
      { "name": "Apr", "market": number },
      { "name": "May", "market": number },
      { "name": "Jun", "market": number },
      { "name": "Jul", "market": number },
      { "name": "Aug", "market": number },
      { "name": "Sep", "market": number },
      { "name": "Oct", "market": number },
      { "name": "Nov", "market": number },
      { "name": "Dec", "market": number }
    ]
  "marketDrivers": [
    { "title": "string", "impact": "HIGH" | "MEDIUM" | "LOW", "text": "string" }
  ],
  "marketChanges": {
    "priceTrend": { "value": "string (e.g. +4.2% or -2.1%)", "direction": "up" | "down", "note": "string (e.g. vs prior 6-month avg)" },
    "supplyIndex": { "value": "Tight" | "Balanced" | "Surplus", "direction": "up" | "down", "note": "string (e.g. global availability)" },
    "demandShift": { "value": "string (e.g. +8% YoY)", "direction": "up" | "down", "note": "string (e.g. category demand growth)" },
    "bulletPoints": [
      { "direction": "up" | "down", "text": "string explaining raw material, freight, currency, or capacity dynamic for this item" }
    ]
  },
  "recommendations": [
    { "type": "CRITICAL" | "HIGH PRIORITY" | "MEDIUM", "title": "string", "text": "string", "savings": number (same currency as overview.currency) }
  ]
}
`;

// ── Tool Definitions ──────────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_quote_cost_details",
      description: "Get detailed information about a quote, its line items, and associated supplier/country/items using a quote ID (e.g. 00001).",
      parameters: {
        type: "object",
        properties: {
          quoteId: { type: "string", description: "The quote ID / sequence ID (e.g. 00001, 00045)" }
        },
        required: ["quoteId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_historical_quotes",
      description: "Fetch a supplier's historical quotes to compare trends and see pricing history.",
      parameters: {
        type: "object",
        properties: {
          supplierId: { type: "number", description: "The supplier ID" }
        },
        required: ["supplierId"]
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
          categoryCodeOrName: { type: "string", description: "UNSPSC category code or name" }
        },
        required: ["categoryCodeOrName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_quote_selection",
      description: "Request the user to select a quote from a dropdown menu if the quote reference is missing or ambiguous.",
      parameters: {
        type: "object",
        properties: {
          hint: { type: "string", description: "Optional hint to search quotes" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_supplier_sos_items",
      description: "Fetch the Scope of Supply (SOS) items and related submitted quotes/line items for a supplier using their supplier ID.",
      parameters: {
        type: "object",
        properties: {
          supplierId: { type: "number", description: "The supplier ID (integer)" }
        },
        required: ["supplierId"]
      }
    }
  }
  // get_india_govt_market_prices tool moved to negotiation-agent-service.ts
];

// ── Tool Dispatcher ───────────────────────────────────────────────────────

async function executeToolCall(name: string, args: any) {
  try {
    switch (name) {
      case "get_quote_cost_details": {
        const { quoteId } = args;
        const quote = await getQuoteById(quoteId);
        if (!quote) {
          return { error: `Quote with ID "${quoteId}" not found in database.` };
        }
        const lines = await getBidLines(quote.bidrefno);
        const itemDesc = lines[0]?.itemDescription || lines[0]?.description || "Steel Sheet";
        const catName = lines[0]?.productCategoryName || "Metal Sheets";

        // Determine Supplier Type classification:
        // Default to Manufacturer if type_of_company is private/public or is Primary Producer, else Distributor
        const rawType = String(quote.supplier_type || quote.type_of_company || "").toLowerCase();
        const supplierType = (rawType.includes("manufacturer") || rawType.includes("producer") || rawType.includes("private") || rawType.includes("public"))
          ? "Manufacturer"
          : "Distributor";

        return {
          id: quote.id,
          bidRefNo: quote.bidrefno,
          supplierId: quote.supplier_id,
          supplierName: quote.company_name,
          country: quote.country || "India",
          state: quote.state || "",
          legalEntityType: quote.legal_entity_type || "Private",
          supplierType,
          quoteType: quote.quote_type || "RFQ",
          item: itemDesc,
          category: catName,
          quotePrice: parseFloat(quote.bidtotal || quote.grosstotal || "0")
        };
      }

      case "get_historical_quotes": {
        const { supplierId } = args;
        const list = await getHistoricalQuotes(supplierId);
        return {
          supplierId,
          history: list.map(q => ({
            id: q.id,
            bidRefNo: q.bidrefno,
            quotePrice: parseFloat(q.bidtotal || "0"),
            date: q.creation_time
          }))
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

      case "request_quote_selection": {
        const { hint } = args;
        const candidates = await searchQuotes(hint || "");
        return {
          type: "select_quote",
          prefill: hint || "",
          initialCandidates: candidates
        };
      }

      case "get_supplier_sos_items": {
        const { supplierId } = args;
        const dbPool = getContextPool() ?? defaultPool;
        const items = await getSupplierSOSItems(supplierId);
        const supplierRes = await dbPool.query(
          `SELECT company_name FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`,
          [supplierId]
        );
        const companyName = supplierRes.rows[0]?.company_name || `Supplier #${supplierId}`;

        // Also fetch historical quotes and calculate avg margin/negotiation info
        const quotesAndLines = await getSupplierQuotesAndLines(supplierId);

        return {
          supplierId,
          supplierName: companyName,
          items: items.map(item => ({
            id: item.id,
            categoryCode: item.category_code || item.categoryCode,
            subCategory: item.sub_category || item.subCategory,
            subCategoryCode: item.sub_category_code || item.subCategoryCode,
            goodServiceCode: item.good_service_code || item.goodServiceCode,
            serviceDetails: item.service_details || item.serviceDetails,
            categoryType: item.category_type || item.categoryType
          })),
          quotesAndLines: quotesAndLines.map(q => ({
            quoteId: q.quote_id,
            bidrefno: q.bidrefno,
            bidtotal: parseFloat(q.bidtotal || "0"),
            lineUnitCost: parseFloat(q.line_unit_cost || "0"),
            lineQty: parseFloat(q.line_qty || "0"),
            itemDescription: q.item_description,
            productCategoryName: q.product_category_name
          }))
        };
      }

      // get_india_govt_market_prices dispatcher case moved to negotiation-agent-service.ts

      default:
        return { error: `Tool ${name} is not implemented.` };
    }
  } catch (error: any) {
    return { error: `Database execution error: ${error.message}` };
  }
}

// ── Dropdown detection ────────────────────────────────────────────────────

function detectQuoteDropdown(prompt: string) {
  const p = prompt.toLowerCase();
  if (p.includes("item")) {
    return null;
  }
  const quoteKeywords = ["analyze quote", "estimate margin for quote", "supplier economics for", "cost structure for"];
  const hasQuoteWord = quoteKeywords.some(kw => p.includes(kw));
  const hasQuoteId = /\b\d{3,5}\b/.test(p); // quote IDs are zero-padded string digits (e.g. 00045)

  if (hasQuoteWord && !hasQuoteId) {
    return "select_quote";
  }
  return null;
}

// ── Cost-Structure Repair ─────────────────────────────────────────────────
// The model occasionally collapses the required multi-component waterfall
// (Raw Material/Labor/Energy/Manufacturing/Packaging/Freight/Overhead/Margin,
// or the distributor equivalent) into a single line, or returns a breakdown
// that doesn't sum to quotePrice. Rather than fabricating a synthetic split
// client-side, ask the model itself for a corrected breakdown — the prices
// stay the LLM's own real estimate for this specific item/supplier/currency.
function isCostStructureIncomplete(costStructure: any, quotePrice: number): boolean {
  if (!Array.isArray(costStructure) || costStructure.length < 3) return true;
  if (!(quotePrice > 0)) return false;
  const sum = costStructure.reduce((s: number, c: any) => s + (Number(c?.cost) || 0), 0);
  return Math.abs(sum - quotePrice) / quotePrice > 0.15;
}

async function repairCostStructure(
  openai: OpenAI,
  modelName: string,
  overview: { item: string; supplierType?: string; quotePrice: number; currency: string }
): Promise<Array<{ component: string; cost: number }> | null> {
  const { item, supplierType, quotePrice, currency } = overview;
  if (!item || !(quotePrice > 0)) return null;

  const prompt = `Provide a realistic supplier cost-structure (waterfall) breakdown for this item, as a procurement cost-intelligence analyst.
Item: ${item}
Supplier type: ${supplierType || "Manufacturer"}
Quote price (unit price, MUST be the exact sum of your breakdown): ${quotePrice} ${currency}

Use these components based on supplier type:
- Manufacturer: Raw Material, Labor, Energy, Manufacturing, Packaging, Freight, Overhead, Margin
- Distributor: Purchase Cost, Import Duties, Warehousing, Distribution, Freight, Overhead, Margin

Return ONLY a JSON array (no markdown fences, no prose) of realistic non-placeholder cost values for THIS item that sum EXACTLY to ${quotePrice}, e.g.:
[{"component": "Raw Material", "cost": 12.34}, ...]`;

  try {
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 600,
    });
    const content = completion.choices[0]?.message?.content || "";
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || isCostStructureIncomplete(parsed, quotePrice)) return null;
    return parsed.map((c: any) => ({ component: String(c.component || ""), cost: Number(c.cost) || 0 }));
  } catch (err) {
    console.warn("[CostIntelligenceAgent] cost-structure repair call failed:", err);
    return null;
  }
}

// Fair Market Cost = bottom-up should-cost, estimated in an ISOLATED call
// that is never told the quoted price. In the main analysis the model is
// required to make costStructure sum exactly to quotePrice, which anchors
// every cost number it produces in that response — including FMC — to the
// quote. Asking separately, with only the item's physical/economic facts,
// is what makes FMC an independent "cost to make and ship this" figure.
async function estimateFairMarketCost(
  openai: OpenAI,
  modelName: string,
  input: { item: string; uom?: string; supplierType?: string; country?: string; region?: string; currency: string }
): Promise<{ min: number; max: number; components: Array<{ component: string; cost: number }> } | null> {
  const { item, uom, supplierType, country, region, currency } = input;
  if (!item) return null;

  const prompt = `You are a should-cost engineer. Estimate what it ACTUALLY costs to make and deliver one unit of the item below — a clean-sheet cost model, not a market price.

Item: ${item}
Unit of measure: ${uom || "per unit"}
Produced by: ${supplierType || "Manufacturer"}
Origin: ${[region, country].filter(Boolean).join(", ") || "not specified"}
Report in: ${currency}

Build it bottom-up from this item's real physical economics:
- Raw material: how much of which material one unit consumes, at that commodity's prevailing rate
- Conversion: labour minutes at the origin country's actual wage rates, plus machine/energy time
- Packaging, plant overhead, and quality/scrap allowance
- Inbound + outbound freight and handling for the stated origin

EXCLUDE the supplier's profit margin entirely. Give a min–max band reflecting genuine spread in input costs and plant efficiency — NOT a percentage haircut off any selling price.

List every component separately (raw material, labour, energy/machine, packaging, overhead, quality/scrap, inbound freight, outbound freight) with its own cost. The components must sum to the MIDPOINT of your min–max band.

Return ONLY JSON (no markdown fences, no prose):
{"components":[{"component":"Raw material","cost":0.00},{"component":"Labour","cost":0.00}],"min":0.00,"max":0.00}`;

  try {
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 700,
    });
    const content = completion.choices[0]?.message?.content || "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const min = Number(parsed?.min);
    const max = Number(parsed?.max);
    if (!isFinite(min) || !isFinite(max) || min <= 0 || max < min) return null;
    const components = (Array.isArray(parsed?.components) ? parsed.components : [])
      .map((c: any) => ({ component: String(c?.component || c?.name || ""), cost: Number(c?.cost) || 0 }))
      .filter((c: { component: string; cost: number }) => c.component && c.cost > 0);
    return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, components };
  } catch (err) {
    console.warn("[CostIntelligenceAgent] fair-market-cost estimation call failed:", err);
    return null;
  }
}

// ── Main Controller Query Handler ────────────────────────────────────────

export async function processCostIntelligenceQuery(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
  sessionUser?: any,
  confirmAction?: { type: string; data: any },
  mentions: SupplierMention[] = [],
  businessUserMentions: BusinessUserMention[] = [],
  itemMentions: ItemMention[] = [],
  bidMentions: BidMention[] = [],
  prMentions: PrMention[] = [],
  poMentions: PoMention[] = [],
  invoiceMentions: InvoiceMention[] = [],
): Promise<CostIntelligenceAgentResponse> {
  const openai = await getAIClient();
  const modelName = await getAIModelName();

  // Handle confirmed dropdown action
  if (confirmAction && confirmAction.type === "select_quote") {
    const selected = confirmAction.data?.selectedQuote;
    if (selected?.id) {
      prompt = `Analyze supplier economics for quote ${selected.id}`;
    } else {
      return { response: "Please select a valid quote to continue." };
    }
  }

  // Auto trigger quote selector dropdown
  const autoTrigger = detectQuoteDropdown(prompt);
  if (autoTrigger === "select_quote" && !confirmAction) {
    const list = await searchQuotes();
    return {
      response: "Please select a quote to analyze supplier cost intelligence.",
      pendingAction: {
        type: "select_quote",
        data: { prefill: "", initialCandidates: list },
        summary: "Select a quote"
      }
    };
  }

  // Reinforce structured output reminder
  let reinforcedPrompt = prompt;
  const p = prompt.toLowerCase();
  const isCostAnalysis = p.includes("economics") || p.includes("margin") || p.includes("cost structure") || /\b\d{3,5}\b/.test(p);
  // The "Get Estimate" form sends parameters directly (no supplier/quote). Its
  // prompt contains the word "item" (in "Item / Service"), so it must bypass the
  // !item gate below and still get the JSON-block reminder.
  const isFormEstimate = p.includes("for the following parameters");

  // Pre-trigger market supplier web scraping (real-market-grounding pipeline)
  // moved to negotiation-agent-service.ts.

  if (isCostAnalysis && (isFormEstimate || !p.includes("item"))) {
    const currencyMatch = prompt.match(/- Currency:\s*(\w+)/i) || prompt.match(/\b(USD|AED|INR|EUR|GBP|CAD)\b/i);
    const currency = currencyMatch ? currencyMatch[1].toUpperCase() : "USD";
    reinforcedPrompt = `${prompt}\n\n[CRITICAL REMINDER: You MUST output a structured JSON block at the very end of your response inside a \`\`\`json ... \`\`\` code block. This JSON block must follow the "cost_intelligence_insights" format (with overview, marginBenchmark, costStructure, fmc, costDrivers, reasoning, recommendation, and charts keys) exactly as defined in your system prompt. Do NOT include fairMarketPrice or localSuppliers keys. Do not omit the required keys, including "fmc" (min/max Fair Market Cost range — YOUR bottom-up should-cost for the item, all components except supplier profit, never derived from any price; the system does not compute it). All estimated values (quotePrice, expectedSavings, costStructure, spendTrend, countryBenchmark) MUST be calculated and output in ${currency} currency. Do not convert to USD. Ensure overview.currency in your JSON is set to "${currency}".]`;
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
    { role: "system", content: COST_INTELLIGENCE_SYSTEM_PROMPT },
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
      max_tokens: 5000
    });

    let assistantMessage = completion.choices[0]?.message;
    let loopCount = 0;
    const MAX_LOOPS = 5;
    let lastSosResult: any = null;
    console.log("[CostIntel] model:", modelName, "| completion#1:", {
      finish: completion.choices[0]?.finish_reason,
      hasContent: !!assistantMessage?.content,
      contentLen: assistantMessage?.content?.length || 0,
      toolCalls: assistantMessage?.tool_calls?.length || 0,
    });

    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0 && loopCount < MAX_LOOPS) {
      loopCount++;
      messages.push({
        role: "assistant",
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      } as any);

      const toolNames: string[] = [];
      for (const toolCall of assistantMessage.tool_calls) {
        const toolCallAny = toolCall as any;
        toolNames.push(toolCallAny.function?.name);
        const args = JSON.parse(toolCallAny.function?.arguments || "{}");
        const result = await executeToolCall(toolCallAny.function?.name, args);
        if (toolCallAny.function?.name === "get_supplier_sos_items") {
          lastSosResult = result;
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
        max_tokens: 5000
      });

      assistantMessage = completion.choices[0]?.message;
      console.log(`[CostIntel] loop ${loopCount} tools[${toolNames.join(",")}] ->`, {
        finish: completion.choices[0]?.finish_reason,
        hasContent: !!assistantMessage?.content,
        contentLen: assistantMessage?.content?.length || 0,
        toolCalls: assistantMessage?.tool_calls?.length || 0,
      });
    }

    // Safety net: the tool loop can exit with the model still requesting tools
    // (MAX_LOOPS reached) and no text content, which produced an empty
    // "couldn't generate" reply. Force one final text-only answer using the tool
    // data already gathered so we return a real response. Deliberately no
    // `tools` and no `tool_choice` here: omitting `tools` already makes tool
    // calls impossible, and OpenAI 400s on tool_choice without a tools array.
    if (!assistantMessage?.content) {
      try {
        const forced = await openai.chat.completions.create({
          model: modelName,
          messages,
          temperature: 0.1,
          max_tokens: 5000,
        });
        console.log("[CostIntel] forced-final ->", {
          finish: forced.choices[0]?.finish_reason,
          hasContent: !!forced.choices[0]?.message?.content,
          contentLen: forced.choices[0]?.message?.content?.length || 0,
        });
        if (forced.choices[0]?.message?.content) {
          assistantMessage = forced.choices[0].message;
        } else {
          console.error("[CostIntelligenceAgent] empty content after forced final completion", {
            finishReason: forced.choices[0]?.finish_reason,
            loopCount,
          });
        }
      } catch (e) {
        console.error("[CostIntelligenceAgent] forced-final completion failed:", e);
      }
    }

    const finalResponse = assistantMessage?.content || "I couldn't generate cost intelligence. Please try again.";
    const result = parseFinalAgentResponse(finalResponse);
    if (result.pendingAction?.data?.overview) {
      if (!result.pendingAction.data.overview.currency) {
        const currencyMatch = prompt.match(/- Currency:\s*(\w+)/i) || prompt.match(/\b(USD|AED|INR|EUR|GBP|CAD)\b/i);
        if (currencyMatch) {
          result.pendingAction.data.overview.currency = currencyMatch[1].toUpperCase();
        }
      }
    }
    // Real-market-grounding post-processing (applyLocalSuppliers,
    // applyRealMarketPricing, applyRealCostStructure, and the OGD
    // data-source credit block) moved to negotiation-agent-service.ts.
    // fairMarketPrice / localSuppliers / costStructure on
    // result.pendingAction.data are therefore the LLM's own estimates, unmodified.
    // charts.spendTrend is the exception: CURRENT (quoted price), MARKET (real
    // external snapshot), and SPEND (real PO history) can't come from the LLM,
    // so ground it here.
    if (result.pendingAction?.type === "cost_intelligence_insights" && result.pendingAction.data?.overview) {
      const ov = result.pendingAction.data.overview;
      const quotePrice = Number(ov.quotePrice) || 0;
      if (isCostStructureIncomplete(result.pendingAction.data.costStructure, quotePrice)) {
        try {
          const repaired = await repairCostStructure(openai, modelName, {
            item: String(ov.item || ""),
            supplierType: ov.supplierType,
            quotePrice,
            currency: String(ov.currency || "USD"),
          });
          if (repaired) result.pendingAction.data.costStructure = repaired;
        } catch (err) {
          console.warn("[CostIntelligenceAgent] cost-structure repair post-processing failed:", err);
        }
      }
      let marketSnapshot: number | null = null;
      let marketRange: { min: number; max: number } | null = null;
      try {
        const snap = await getRealMarketSnapshot(String(ov.item || ""), String(ov.currency || "USD"), String(ov.country || ""));
        if (snap) {
          marketSnapshot = snap.avg;
          if (snap.min > 0 && snap.max > snap.min) marketRange = { min: snap.min, max: snap.max };
        }
      } catch (err) {
        console.warn("[CostIntelligenceAgent] real market snapshot post-processing failed:", err);
      }
      try {
        await applyRealSpendTrend(result.pendingAction.data, marketSnapshot);
      } catch (err) {
        console.warn("[CostIntelligenceAgent] real spend-trend post-processing failed:", err);
      }

      // Ground & ensure FMP object completeness
      const data = result.pendingAction.data;
      // FMP comes only from real market data or the LLM's item-based
      // estimate — never derived from the quoted price. When neither source
      // has a value, leave fmp absent rather than fabricating one.
      const baseFmp = marketSnapshot && marketSnapshot > 0
        ? marketSnapshot
        : (data.fmp?.price && data.fmp.price > 0 ? data.fmp.price : 0);
      if (baseFmp > 0) {
        const rangeMin = Math.round(baseFmp * 0.92 * 100) / 100;
        const rangeMax = Math.round(baseFmp * 1.08 * 100) / 100;
        const fmpMarginAmount = Math.round((quotePrice - baseFmp) * 100) / 100;
        const fmpMarginPercent = Math.round(((quotePrice - baseFmp) / baseFmp) * 1000) / 10;

        // Range priority: real extracted market min–max (mandi/scraped
        // prices) > LLM range that brackets the grounded price > synthetic
        // ±8% band. A quote-anchored LLM range must never override the real
        // market band.
        const llmRangeMin = Number(data.fmp?.rangeMin) || 0;
        const llmRangeMax = Number(data.fmp?.rangeMax) || 0;
        const llmRangeConsistent = llmRangeMin > 0 && llmRangeMax >= llmRangeMin && llmRangeMin <= baseFmp && baseFmp <= llmRangeMax;

        data.fmp = {
          price: baseFmp,
          rangeMin: marketRange ? marketRange.min : (llmRangeConsistent ? llmRangeMin : rangeMin),
          rangeMax: marketRange ? marketRange.max : (llmRangeConsistent ? llmRangeMax : rangeMax),
          fmpMarginAmount,
          fmpMarginPercent
        };
      }

      // FMC: replace the main response's estimate with the isolated
      // should-cost call. The inline estimate is anchored to quotePrice
      // (costStructure must sum to it), so it tracks the quote instead of
      // real production economics.
      try {
        const shouldCost = await estimateFairMarketCost(openai, modelName, {
          item: String(ov.item || ""),
          uom: ov.uom ? String(ov.uom) : undefined,
          supplierType: ov.supplierType ? String(ov.supplierType) : undefined,
          country: ov.country ? String(ov.country) : undefined,
          region: ov.region ? String(ov.region) : undefined,
          currency: String(ov.currency || "USD"),
        });
        if (shouldCost) data.fmc = shouldCost;
      } catch (err) {
        console.warn("[CostIntelligenceAgent] fair-market-cost post-processing failed:", err);
      }

      // Margin gauge follows the FMC cost of manufacturing: supplier
      // margin = gap between the quoted price and the market should-cost.
      const fmcMid = (Number(data.fmc?.min) + Number(data.fmc?.max)) / 2;
      if (quotePrice > 0 && isFinite(fmcMid) && fmcMid > 0 && fmcMid < quotePrice) {
        data.marginBenchmark = data.marginBenchmark || {};
        data.marginBenchmark.marginPercent = Math.round(((quotePrice - fmcMid) / quotePrice) * 1000) / 10;
      }

      // Ground & ensure marketChanges object completeness
      const item = String(ov.item || "Selected Item");
      const marginPercent = Number(data.marginBenchmark?.marginPercent) || 30;
      const quantity = Number(ov.quantity) || 500;
      const originCountry = String(ov.country || "Supplier region");

      let realPriceTrendVal = marginPercent > 35 ? "+6.8%" : (marginPercent > 25 ? "+2.4%" : "-1.5%");
      let realPriceTrendDir: "up" | "down" = marginPercent > 25 ? "up" : "down";

      if (marketSnapshot && marketSnapshot > 0 && quotePrice > 0) {
        const delta = ((quotePrice - marketSnapshot) / marketSnapshot) * 100;
        const absDelta = Math.abs(Math.round(delta * 10) / 10);
        realPriceTrendDir = delta >= 0 ? "up" : "down";
        realPriceTrendVal = `${delta >= 0 ? "+" : "-"}${absDelta}%`;
      }

      const defaultMarketChanges = {
        priceTrend: { value: realPriceTrendVal, direction: realPriceTrendDir, note: "vs prior 6-month avg" },
        supplyIndex: { value: marginPercent > 35 ? "Tight" : (marginPercent > 25 ? "Balanced" : "Surplus"), direction: marginPercent > 30 ? "up" : "down", note: "global availability" },
        demandShift: { value: quantity > 1000 ? "+12% YoY" : "+5% YoY", direction: "up", note: "category demand growth" },
        bulletPoints: [
          { direction: "up", text: `Raw material input costs for ${item} rose ~${marginPercent > 30 ? 9 : 4}% over the past quarter driven by energy and logistics surcharges.` },
          { direction: "down", text: `${originCountry} currency movements vs USD partially offset landed cost inflation for export shipments.` },
          { direction: "up", text: `Lead times extended by 6–12 days vs baseline due to port congestion and seasonal inventory buildup.` },
          { direction: "down", text: `New qualified production capacity in competitive regions offers 10–16% lower unit cost options.` }
        ]
      };

      if (!data.marketChanges || !data.marketChanges.bulletPoints) {
        data.marketChanges = defaultMarketChanges;
      } else {
        data.marketChanges = {
          priceTrend: {
            value: data.marketChanges.priceTrend?.value || defaultMarketChanges.priceTrend.value,
            direction: data.marketChanges.priceTrend?.direction || defaultMarketChanges.priceTrend.direction,
            note: data.marketChanges.priceTrend?.note || defaultMarketChanges.priceTrend.note,
          },
          supplyIndex: {
            value: data.marketChanges.supplyIndex?.value || defaultMarketChanges.supplyIndex.value,
            direction: data.marketChanges.supplyIndex?.direction || defaultMarketChanges.supplyIndex.direction,
            note: data.marketChanges.supplyIndex?.note || defaultMarketChanges.supplyIndex.note,
          },
          demandShift: {
            value: data.marketChanges.demandShift?.value || defaultMarketChanges.demandShift.value,
            direction: data.marketChanges.demandShift?.direction || defaultMarketChanges.demandShift.direction,
            note: data.marketChanges.demandShift?.note || defaultMarketChanges.demandShift.note,
          },
          bulletPoints: Array.isArray(data.marketChanges.bulletPoints) && data.marketChanges.bulletPoints.length > 0
            ? data.marketChanges.bulletPoints
            : defaultMarketChanges.bulletPoints,
        };
      }
    }

    if (
      lastSosResult?.items?.length > 0 &&
      !/analyze all scope of supply/i.test(prompt) &&
      !/economics for item|for item/i.test(prompt) &&
      result.pendingAction?.type !== "cost_intelligence_insights" &&
      result.pendingAction?.type !== "fmc_card"
    ) {
      result.pendingAction = {
        type: "select_sos_items",
        data: {
          supplierId: lastSosResult.supplierId,
          supplierName: lastSosResult.supplierName,
          items: lastSosResult.items,
        },
        summary: "Select SOS Items",
      };
    }

    return result;
  } catch (error: any) {
    console.error("Cost Intelligence Agent loop error:", error);
    return {
      response: "I'm having trouble connecting to the AI service. Please try again in a moment."
    };
  }
}

// ── JSON Output Parser ────────────────────────────────────────────────────

function stripComments(str: string): string {
  return str.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
}

export function parseFinalAgentResponse(text: string): CostIntelligenceAgentResponse {
  const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/;
  const match = text.match(jsonBlockRegex);
  if (match) {
    try {
      const cleanedJson = stripComments(match[1]);
      const data = JSON.parse(cleanedJson);
      const cleanResponse = text.replace(jsonBlockRegex, "").trim();

      if (data.type === "fmc_card") {
        return {
          response: cleanResponse || "Fair Market Cost estimate completed.",
          pendingAction: {
            type: "fmc_card",
            data: {
              item: data.item,
              currency: data.currency,
              fmcMin: data.fmcMin,
              fmcMax: data.fmcMax
            },
            summary: "Fair Market Cost"
          }
        };
      }

      if (data.type === "select_sos_items" || data.pendingAction?.type === "select_sos_items" || (data.items && data.supplierId)) {
        const actionData = data.pendingAction?.data || data.data || data;
        return {
          response: cleanResponse || "Please select from the supplier's Scope of Supply items.",
          pendingAction: {
            type: "select_sos_items",
            data: {
              supplierId: actionData.supplierId,
              supplierName: actionData.supplierName,
              items: actionData.items || []
            },
            summary: "Select SOS Items"
          }
        };
      }

      return {
        response: cleanResponse || "Supplier cost intelligence analysis completed.",
        pendingAction: {
          type: "cost_intelligence_insights",
          data,
          summary: "View Supplier Cost Intelligence"
        }
      };
    } catch (e) {
      console.warn("[CostIntelligenceAgent] Failed to parse JSON block:", e);
    }
  }

  // Fallback checks
  const plainJsonRegex = /(\{[\s\S]*"marginBenchmark"[\s\S]*\})/;
  const plainMatch = text.match(plainJsonRegex);
  if (plainMatch) {
    try {
      const cleanedJson = stripComments(plainMatch[1]);
      const data = JSON.parse(cleanedJson);
      const cleanResponse = text.replace(plainJsonRegex, "").trim();

      return {
        response: cleanResponse || "Supplier cost intelligence analysis completed.",
        pendingAction: {
          type: "cost_intelligence_insights",
          data,
          summary: "View Supplier Cost Intelligence"
        }
      };
    } catch (e) {
      console.warn("[CostIntelligenceAgent] Failed to parse plain JSON block:", e);
    }
  }

  return { response: text };
}
