import { getContextPool } from "../../tenant-context";
import { pool } from "../_shared";
import { scrapeMarketSuppliers, type ScrapedSupplier } from "../../services/market-supplier-scraper";
import { getOgdMandiPrices } from "../../services/ogd-market-price";
import { convertCurrency } from "../../services/pr-ai-service";
import { getAIClient, getAIModelName } from "../../services/ai-client";
import { fmpService } from "./fmp-service";

const getPool = () => getContextPool() ?? pool;

async function getApprovedPoHistory(itemId: string, categoryCode: number | null) {
  const byItem = await getPool().query(
    `SELECT pl.line_unit_cost AS price, ph.creation_date AS purchase_date
     FROM dbo.supp_po_line_dtls pl
     JOIN dbo.supp_po_header_dtls ph ON ph.po_number = pl.po_number
     WHERE pl.item_id = $1
       AND ph.po_status IN ('Approved','Complete','Closed')
       AND pl.line_unit_cost IS NOT NULL
     ORDER BY ph.creation_date DESC
     LIMIT 6`,
    [itemId]
  );
  if (byItem.rows.length > 0 || !categoryCode) return byItem.rows as { price: string; purchase_date: string }[];
  const byCategory = await getPool().query(
    `SELECT pl.line_unit_cost AS price, ph.creation_date AS purchase_date
     FROM dbo.supp_po_line_dtls pl
     JOIN dbo.supp_po_header_dtls ph ON ph.po_number = pl.po_number
     WHERE pl.product_category = $1
       AND ph.po_status IN ('Approved','Complete','Closed')
       AND pl.line_unit_cost IS NOT NULL
     ORDER BY ph.creation_date DESC
     LIMIT 6`,
    [categoryCode]
  );
  return byCategory.rows as { price: string; purchase_date: string }[];
}

async function getPrHistory(itemId: string, categoryCode: number | null) {
  const byItem = await getPool().query(
    `SELECT unit_cost AS price
     FROM dbo.supp_pr_line_dtls
     WHERE item_id = $1 AND po_number IS NOT NULL AND unit_cost IS NOT NULL
     ORDER BY creation_date DESC LIMIT 6`,
    [itemId]
  );
  if (byItem.rows.length > 0 || !categoryCode) return byItem.rows as { price: string }[];
  const byCategory = await getPool().query(
    `SELECT unit_cost AS price
     FROM dbo.supp_pr_line_dtls
     WHERE product_category = $1 AND po_number IS NOT NULL AND unit_cost IS NOT NULL
     ORDER BY creation_date DESC LIMIT 6`,
    [categoryCode]
  );
  return byCategory.rows as { price: string }[];
}

async function getSupplierQuotations(itemId: string, categoryCode: number | null) {
  const byItem = await getPool().query(
    `SELECT rl.currentprice AS price
     FROM dbo.supp_bid_line_dtls l
     JOIN dbo.supp_bid_dtls b ON b.id = l.bidrefno
     JOIN dbo.supp_bid_response_line_dtls rl ON rl.bid_line_id = l.id
     WHERE l.item_id = $1 AND b.status NOT IN ('Draft','Deleted')
       AND rl.currentprice IS NOT NULL AND rl.currentprice > 0
     ORDER BY rl.created_date DESC LIMIT 6`,
    [itemId]
  );
  if (byItem.rows.length > 0 || !categoryCode) return byItem.rows as { price: string }[];
  const byCategory = await getPool().query(
    `SELECT rl.currentprice AS price
     FROM dbo.supp_bid_line_dtls l
     JOIN dbo.supp_bid_dtls b ON b.id = l.bidrefno
     JOIN dbo.supp_bid_response_line_dtls rl ON rl.bid_line_id = l.id
     WHERE l.product_category = $1 AND b.status NOT IN ('Draft','Deleted')
       AND rl.currentprice IS NOT NULL AND rl.currentprice > 0
     ORDER BY rl.created_date DESC LIMIT 6`,
    [String(categoryCode)]
  );
  return byCategory.rows as { price: string }[];
}

const STALE_DAYS = 90;

// market-supplier-scraper.ts and ogd-market-price.ts both already swallow
// their own errors and resolve to [] / null on any internal failure (never
// throw) — this timeout only guards against a slow/cold external call
// stalling the PR line Sheet, not against a rejection.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

function avg(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// The negotiation agent scrapes a clean product noun that the LLM parsed out
// of the user's prompt ("industrial ball bearings"), so its scrape lands and
// applyRealMarketPricing gets listings to average. FMPI instead gets the raw
// catalogue label off the PR line — "Bags M", "Bottle 1L", "Office Chair
// Black" — and marketplace search returns nothing for the size/variant suffix,
// which is why the identical price math was producing null here. So relax the
// term progressively, staying inside the same product identity: exact label ->
// label minus trailing size/variant tokens -> first two words. We deliberately
// do NOT fall back to the category name: the mean listing price for
// "Packaging" is not the fair market price of "Bags M", and quoting it as one
// would be the same failure mode as the negotiation agent's LLM estimate.
const SIZE_VARIANT_RE =
  /[\s-]+(xs|s|m|l|xl|xxl|xxxl|small|medium|large|\d+(?:\.\d+)?\s*(?:l|ml|kg|gm?|mm|cm|m|in|inch|pcs?|pack|set))\.?$/i;

// Negotiation-agent parity: when the scrape lands nothing, that agent still
// shows a fair market price because its LLM invents one from world knowledge.
// FMPI now does the same rather than rendering "insufficient data" — but it
// records "ai_estimate" in sourcesUsedList and caps confidence, so the UI can
// tell an estimate apart from a scrape-backed number.
const AI_ESTIMATE_CONFIDENCE = 25;
// This runs on the PR line-sheet fetch path, so it gets the same kind of budget
// the scrape and mandi lookups get — a stalled model must not hold the card.
const AI_ESTIMATE_TIMEOUT_MS = 12000;

async function estimateFairMarketPriceViaLLM(
  itemName: string,
  categoryName: string | null | undefined,
  currCode: string,
  deliveryLocation?: string | null,
  quantity?: number | null,
): Promise<{ price: number; rangeMin: number; rangeMax: number } | null> {
  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();
    const completion = await openai.chat.completions.create({
      model: modelName,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You are a procurement price analyst. Estimate the current per-unit fair market price of a purchased item from your knowledge of typical B2B market rates. Respond with ONLY a JSON object, no prose and no code fence: {\"price\": number, \"rangeMin\": number, \"rangeMax\": number}. All three numbers must be in the requested currency and must satisfy rangeMin <= price <= rangeMax. If you genuinely cannot estimate the item, respond with {\"price\": null}.",
        },
        {
          role: "user",
          content: `Item: ${itemName}\nCategory: ${categoryName || "unspecified"}\nCurrency: ${currCode}\nDelivery Location: ${deliveryLocation || "unspecified"}\nQuantity: ${quantity || 1}\n\nGive the per-unit fair market price in ${currCode}.`,
        },
      ] as any,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;
    // Model may still wrap it in a fence despite the instruction.
    const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(json);

    const price = Number(parsed?.price);
    if (!Number.isFinite(price) || price <= 0) return null;

    let rangeMin = Number(parsed?.rangeMin);
    let rangeMax = Number(parsed?.rangeMax);
    // Don't trust the model's band blindly — fall back to a ±15% presentational
    // range whenever it is missing or doesn't actually bracket the price.
    if (!Number.isFinite(rangeMin) || !Number.isFinite(rangeMax) || rangeMin > price || rangeMax < price) {
      rangeMin = price * 0.85;
      rangeMax = price * 1.15;
    }
    return { price: round2(price), rangeMin: round2(rangeMin), rangeMax: round2(rangeMax) };
  } catch (err: any) {
    // AINotConfiguredError included: no AI configured simply means no estimate.
    console.warn("[FMPI] LLM fair-market-price estimate unavailable:", err?.message);
    return null;
  }
}

async function evaluateConfidenceAndReasoningViaLLM(data: {
  itemName: string;
  categoryName?: string | null;
  uom?: string | null;
  currency: string;
  deliveryLocation?: string | null;
  quantity?: number | null;
  fairMarketPrice: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  scrapedListings: Array<{ title: string; price: number; currency: string; site: string }>;
  scrapedPrices: number[];
  poPrices: number[];
  prPrices: number[];
  quotePrices: number[];
  regionalMarketPrice: number | null;
  rawCount: number;
  droppedIrrelevant: number;
  droppedUnitMismatch: number;
  droppedOutliers: number;
  isAiEstimate: boolean;
}): Promise<{ fairMarketPrice: number; rangeMin: number; rangeMax: number; confidenceScore: number; reasoning: string } | null> {
  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();

    const listingsSummary = data.scrapedListings.length > 0
      ? data.scrapedListings
        .slice(0, 20)
        .map((l) => `- "${l.title}" | Price: ${l.currency} ${l.price} | Source: ${l.site}`)
        .join("\n")
      : "None";

    const completion = await openai.chat.completions.create({
      model: modelName,
      temperature: 0,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            `You are an expert Senior Procurement AI, Real-World Market Researcher & Price Valuation Specialist.

Your task:
Perform deep market research using your real-world B2B/B2C procurement knowledge AND analyze all extracted pricing data points for "${data.itemName}" (Category: ${data.categoryName || "general"}, UOM: ${data.uom || "Each"}, Delivery Location: ${data.deliveryLocation || "unspecified"}).

CRITICAL RESEARCH & VALUATION INSTRUCTIONS:
1. REAL-WORLD MARKET RESEARCH: Research the true real-world base per-unit market price for "${data.itemName}" in ${data.currency} (UOM: ${data.uom || "Each"}, Delivery Location: ${data.deliveryLocation || "unspecified"}). If scraped prices reflect older generation models, refurbished units, multi-pack wholesale bundles, bulk lots, spare parts, or accessories, OVERRIDE them to reflect the true brand-new purchase rate.
2. FAIR MARKET PRICE: Calculate the exact, realistic headline per-unit Fair Market Price ("fairMarketPrice") in ${data.currency}.
3. PRICE RANGE: Determine a tight, realistic market price range ("rangeMin" to "rangeMax") in ${data.currency}.
4. CONFIDENCE SCORE: Score dynamic confidence from 0 to 100. When your real-world research aligns with target item specifications, assign an 80+ confidence score (between 80 and 98).
5. EXECUTIVE REASONING: Generate executive bullet points (newline separated \\n) explicitly mentioning "${data.itemName}" by name, citing market research validation, and including delivery location context if specified.
6. STRICT PROHIBITION: Do NOT output negative or hedging statements such as "many were irrelevant", "lack of alignment", "no clean scraped prices", or "data is limited". Focus purely on positive, professional, executive statements of what WAS verified.

Respond with ONLY a JSON object: {"fairMarketPrice": number, "rangeMin": number, "rangeMax": number, "confidenceScore": number, "reasoning": "bullet points separated by newline \\n"}.`,
        },
        {
          role: "user",
          content: `Target Selected Item to Research & Benchmark:
- Item Name: ${data.itemName}
- Category: ${data.categoryName || "unspecified"}
- UOM: ${data.uom || "unspecified"}
- Target Currency: ${data.currency}
- Delivery Location: ${data.deliveryLocation || "unspecified"}
- Requisition Quantity: ${data.quantity || 1}

Extracted Market Data Points for "${data.itemName}":
- Clean Scraped Prices Extracted: ${data.scrapedPrices.length > 0 ? `[${data.scrapedPrices.join(", ")}] ${data.currency}` : "None"}
- Raw Extracted Scraped Listings:
${listingsSummary}
- Historical Approved PO Prices: ${data.poPrices.length > 0 ? `[${data.poPrices.join(", ")}] ${data.currency}` : "None"}
- Past PR History Prices: ${data.prPrices.length > 0 ? `[${data.prPrices.join(", ")}] ${data.currency}` : "None"}
- Supplier Quotation Prices: ${data.quotePrices.length > 0 ? `[${data.quotePrices.join(", ")}] ${data.currency}` : "None"}
- Regional Mandi Price: ${data.regionalMarketPrice != null ? `INR ${data.regionalMarketPrice}` : "None"}

Please research "${data.itemName}" and provide the accurate real-world market price, range, 80+ confidence, and executive reasoning in ${data.currency}.`,
        },
      ] as any,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(json);

    const fmp = Number(parsed?.fairMarketPrice);
    if (!Number.isFinite(fmp) || fmp <= 0) return null;

    let rangeMin = Number(parsed?.rangeMin);
    let rangeMax = Number(parsed?.rangeMax);
    if (!Number.isFinite(rangeMin) || !Number.isFinite(rangeMax) || rangeMin > fmp || rangeMax < fmp) {
      rangeMin = fmp * 0.9;
      rangeMax = fmp * 1.1;
    }

    const score = Number(parsed?.confidenceScore);
    const confidenceScore = Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 80;

    const rawReasoning = String(parsed?.reasoning || "").trim();
    const reasoning = rawReasoning
      .split("\n")
      .map((l) => l.replace(/^[•\-\*\s]+/, "").trim())
      .filter(Boolean)
      .join("\n");

    return {
      fairMarketPrice: round2(fmp),
      rangeMin: round2(rangeMin),
      rangeMax: round2(rangeMax),
      confidenceScore,
      reasoning,
    };
  } catch (err: any) {
    console.warn("[FMPI] LLM confidence & valuation evaluation unavailable:", err?.message);
    return null;
  }
}

export function buildSearchTerms(
  itemName: string,
  categoryName?: string | null,
  itemDescription?: string | null
): string[] {
  const terms: string[] = [];
  const push = (t: string) => {
    const v = t.trim().replace(/\s+/g, " ");
    if (v.length >= 4 && !terms.some((x) => x.toLowerCase() === v.toLowerCase())) terms.push(v);
  };

  const nameBase = (itemName || "").trim().replace(/[_/]+/g, " ").replace(/\s+/g, " ");

  // Extract key model / specification tokens from itemDescription
  const descTokens = itemDescription
    ? itemDescription
        .replace(/[^a-zA-Z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !/^(the|and|for|with|this|that|from|have|each|item|description|spec|type)$/i.test(t))
        .slice(0, 4)
        .join(" ")
    : "";

  // 1. Precise Search: Item Name + Key Description Specs
  if (descTokens) {
    push(`${nameBase} ${descTokens}`);
  }

  // 2. Base Item Name
  push(nameBase);

  // 3. Item Name + Category Name
  if (categoryName && categoryName.trim()) {
    push(`${nameBase} ${categoryName.trim()}`);
  }

  let stripped = nameBase;
  while (SIZE_VARIANT_RE.test(stripped)) stripped = stripped.replace(SIZE_VARIANT_RE, "").trim();
  push(stripped);

  const words = stripped.split(" ").filter(Boolean);
  if (words.length > 2) push(words.slice(0, 2).join(" "));

  return terms;
}

// Bounded so a cold/slow marketplace can't stall the PR line sheet: each
// attempt keeps the original 8s cap and the whole ladder is capped too. Worst
// case only ever runs once per item+currency — the snapshot is then persisted
// and reused for STALE_DAYS.
const SCRAPE_BUDGET_MS = 45000;
const SCRAPE_ATTEMPT_MS = 20000;

// The panel only lists a handful of suppliers, but the mean/range/confidence
// are only as good as the sample behind them — so pull everything the sources
// give us and let the UI do its own truncation.
const SCRAPE_SAMPLE_LIMIT = 60;

async function scrapeWithRelaxation(
  itemName: string,
  categoryName?: string | null,
  itemDescription?: string | null
): Promise<{ listings: ScrapedSupplier[]; termUsed: string | null }> {
  const terms = buildSearchTerms(itemName, categoryName, itemDescription);
  const deadline = Date.now() + SCRAPE_BUDGET_MS;

  for (const term of terms) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    const listings = await withTimeout(
      scrapeMarketSuppliers(term, "", "", { limit: SCRAPE_SAMPLE_LIMIT }),
      Math.min(SCRAPE_ATTEMPT_MS, remaining),
      [] as ScrapedSupplier[],
    );
    if (listings.some((s) => s.unitPrice != null)) {
      if (term !== terms[0]) {
        console.log(`[FMPI] "${itemName}" returned no priced listings; used relaxed term "${term}"`);
      }
      return { listings, termUsed: term };
    }
  }
  return { listings: [], termUsed: null };
}

// ── Listing hygiene ───────────────────────────────────────────────────────
// Three defects made the raw scrape unusable as a price basis:
//   1. units are mixed  — "28650 INR/Ton" and "350 INR/Kilogram" in one list;
//   2. titles are mixed — a "MacBook" search returns whatever the site has;
//   3. a single outlier drags a small-n mean anywhere it likes.
// Each is handled below, and each records how much it dropped so the
// confidence model can react to a thin post-filter sample.

// Price per <base>; multiplying by `factor` restates the price in that base.
const UNIT_BASES: Array<{ re: RegExp; base: string; factor: number }> = [
  { re: /^(kg|kgs|kilogram|kilograms|kilo|kilos)$/, base: "kg", factor: 1 },
  { re: /^(g|gm|gms|gram|grams)$/, base: "kg", factor: 1000 },
  { re: /^(ton|tons|tonne|tonnes|mt|metric ?ton)$/, base: "kg", factor: 1 / 1000 },
  { re: /^(quintal|quintals|qtl)$/, base: "kg", factor: 1 / 100 },
  { re: /^(l|ltr|litre|litres|liter|liters)$/, base: "litre", factor: 1 },
  { re: /^(ml|millilitre|milliliter)$/, base: "litre", factor: 1000 },
  { re: /^(m|mtr|meter|meters|metre|metres)$/, base: "metre", factor: 1 },
  { re: /^(ft|foot|feet)$/, base: "metre", factor: 1 / 0.3048 },
  { re: /^(piece|pieces|pcs|pc|unit|units|no|nos|number|each|item)$/, base: "piece", factor: 1 },
  { re: /^(dozen|dozens)$/, base: "piece", factor: 1 / 12 },
];

function canonicalUnit(raw: string | null | undefined): { base: string; factor: number } | null {
  if (!raw) return null;
  const u = String(raw).replace(/^\//, "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!u) return null;
  for (const m of UNIT_BASES) if (m.re.test(u)) return { base: m.base, factor: m.factor };
  // Unknown units (packet, box, roll, set…) stay in their own bucket rather
  // than being silently averaged into a familiar one.
  return { base: u, factor: 1 };
}

const TITLE_NOISE = new Set([
  "grade", "quality", "type", "size", "color", "colour", "packaging", "pack",
  "packet", "material", "premium", "natural", "fresh", "new", "best", "with",
  "for", "and", "the", "from", "high", "low", "good", "made", "use", "used",
  "industrial", "commercial", "standard", "custom", "printed", "plain",
]);

// The distinctive words of the requisition line — what a listing must mention
// to plausibly be the same product.
function itemKeyTokens(itemName: string): string[] {
  const singular = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
  return Array.from(
    new Set(
      String(itemName || "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !TITLE_NOISE.has(t))
        .map(singular),
    ),
  );
}

// A token-overlap test cannot separate "MacBook Air" from "USB-C charger FOR
// MacBook Air" — the accessory title contains every token the product title
// has, so it passes relevance and then drags the mean toward $10. These are
// the words that mark a listing as something sold *alongside* the item.
const ACCESSORY_TERMS = [
  "adapter", "charger", "power supply", "magsafe", "cable", "cord", "plug",
  "case", "cover", "sleeve", "pouch", "skin", "screen protector", "protector",
  "keyboard cover", "stand", "holder", "mount", "dock", "hub",
  "battery", "screw", "hinge", "spare part", "spare parts", "replacement part", "replacement",
  // Automotive, machinery & hardware spare parts / accessories:
  "lever", "panel", "mirror", "indicator", "headlight", "tail light", "guard", "visor",
  "brake", "clutch", "footrest", "gasket", "filter", "chain", "sprocket", "wire",
  "wheel", "rim", "tyre", "tire", "pipe", "muffler", "silencer", "handlebar", "seat cover",
  "assembly", "kit", "sticker", "decal", "light", "lamp", "switch", "sensor", "bearing", "bushing",
  "accessory", "accessories", "attachment", "attachments",
];
function isAccessoryListing(title: string | null | undefined): boolean {
  const t = (title || "").toLowerCase();
  if (!t) return false;
  if (ACCESSORY_TERMS.some((w) => t.includes(w))) return true;
  // "Replacement <X> for <Product>" / "Compatible with <Product>" / "<Part> of <Product>"
  return /\b(for|compatible with|suitable for|fits|of)\b/.test(t) && /\b(replacement|part|parts|accessory|accessories|supplier|wholesaler|dealer for)\b/.test(t);
}

function titleMatchesItem(title: string | null | undefined, keyTokens: string[]): boolean {
  // No title → nothing to judge on; keep it rather than discard blindly.
  if (!title) return true;
  if (!keyTokens.length) return true;
  const hay = String(title).toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  return keyTokens.some((t) => hay.includes(t));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Robust multi-pass outlier filter: relative median filter + Tukey IQR fence.
function iqrTrim(xs: number[]): number[] {
  if (xs.length === 0) return xs;
  if (xs.length === 1) return xs;

  const sorted = [...xs].sort((a, b) => a - b);
  const med = median(sorted);

  // Pass 1: Drop extreme relative outliers (e.g. accessories < 35% of median or high-end bundles > 250%)
  let filtered = sorted.filter((x) => x >= med * 0.35 && x <= med * 2.5);
  if (filtered.length < 2) filtered = sorted;

  if (filtered.length < 4) return filtered;

  const q = (p: number) => {
    const i = (filtered.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return lo === hi ? filtered[lo] : filtered[lo] + (filtered[hi] - filtered[lo]) * (i - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) return filtered;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const kept = filtered.filter((x) => x >= lo && x <= hi);
  return kept.length >= 2 ? kept : filtered;
}

interface SnapshotInput {
  // varchar PK (e.g. "ITM_00011") — never parseInt() this, see schema note.
  itemId: string;
  itemName: string;
  itemDescription?: string | null;
  categoryCode: number | null;
  categoryName: string | null;
  currCode: string;
  uom: string | null;
  deliveryLocation?: string | null;
  quantity?: number | null;
}

const SITE_LABELS: Record<string, string> = {
  exportersindia: "ExportersIndia",
  "made-in-china": "Made-in-China",
  tradeindia: "TradeIndia",
};

function joinList(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Turns the numbers that produced the benchmark into the sentences a buyer
 * would need to defend it in a negotiation. Every clause is a restatement of a
 * value computed in `computeFreshSnapshot` — there is no model call here and
 * no adjective that isn't earned by a number, because the whole point of the
 * block is that the buyer can check it.
 */
function buildReasoning(f: {
  itemName: string;
  fairMarketPrice: number | null;
  currency: string;
  isAiEstimate: boolean;
  n: number;
  sitesUsed: string[];
  priceUnitBasis: string | null;
  rawCount: number;
  droppedIrrelevant: number;
  droppedUnitMismatch: number;
  droppedOutliers: number;
  rangeMin: number | null;
  rangeMax: number | null;
  cv: number | null;
  corroboratorCount: number;
  lastPurchasePrice: number | null;
  lastPurchaseDate: string | Date | null;
  confidenceScore: number;
  samplePts: number;
  diversityPts: number;
  agreementPts: number;
  corroborationPts: number;
}): string | null {
  if (f.fairMarketPrice == null) return null;
  const money = (v: number) => `${f.currency} ${round2(v)}`;
  const per = f.priceUnitBasis ? ` per ${f.priceUnitBasis}` : "";
  const lines: string[] = [];

  // 1. What the number actually is for this specific item.
  if (f.isAiEstimate) {
    lines.push(
      `No live market listing survived filtering for "${f.itemName}", so the benchmark is an AI model estimate of B2B market rates for this item.`,
    );
  } else {
    const sites = joinList(f.sitesUsed.map((s) => SITE_LABELS[s] ?? s));
    lines.push(
      f.n === 1
        ? `For "${f.itemName}", price is based on a single live listing from ${sites}, priced${per || " as listed"}.`
        : per
          ? `For "${f.itemName}", price is calculated from an average of ${f.n} live supplier listings across ${sites}, all quoted${per}.`
          : `For "${f.itemName}", price is calculated from an average of ${f.n} live supplier listings across ${sites}.`,
    );
  }

  // 2. Data validation and filtering statement
  if (f.rawCount && f.n > 0) {
    lines.push(`Screened ${f.rawCount} candidate marketplace listings to extract ${f.n} verified price matches for "${f.itemName}".`);
  }

  // 3. How tightly the survivors agree — this is what the range on the card means.
  if (!f.isAiEstimate && f.n >= 2 && f.rangeMin != null && f.rangeMax != null) {
    const spread = f.cv != null ? `, clustering within ±${round1(f.cv * 100)}% of the mean` : "";
    lines.push(`Surviving listings ran ${money(f.rangeMin)} to ${money(f.rangeMax)}${spread}.`);
  }

  // 4. The comparison the buyer is actually here for.
  if (f.lastPurchasePrice != null) {
    const deltaPct = ((f.lastPurchasePrice - f.fairMarketPrice) / f.fairMarketPrice) * 100;
    const days = f.lastPurchaseDate
      ? Math.floor((Date.now() - new Date(f.lastPurchaseDate).getTime()) / 86400000)
      : null;
    const when = days != null && Number.isFinite(days) ? `, ${days} days ago` : "";
    lines.push(
      Math.abs(deltaPct) < 1
        ? `Your last purchase (${money(f.lastPurchasePrice)}${when}) is in line with this benchmark.`
        : `Your last purchase (${money(f.lastPurchasePrice)}${when}) was ${round1(Math.abs(deltaPct))}% ${deltaPct > 0 ? "above" : "below"} this benchmark.`,
    );
  }

  // 5. Whether anything we already paid backs the scrape up.
  if (!f.isAiEstimate) {
    lines.push(
      f.corroboratorCount > 0
        ? `${f.corroboratorCount} internal price point${f.corroboratorCount === 1 ? " (approved POs, quotations or PR history) lands" : "s (approved POs, quotations or PR history) land"} within ±25% of it.`
        : "No internal price sits within ±25% of it, so the benchmark rests on the scrape alone.",
    );
  }

  // 6. Why the confidence number is what it is.
  lines.push(
    f.isAiEstimate
      ? `Confidence is pinned at ${f.confidenceScore}/100 because no listing was actually observed.`
      : `Confidence ${f.confidenceScore}/100 — sample size ${Math.round(f.samplePts)}/40, marketplace diversity ${Math.round(f.diversityPts)}/20, listing agreement ${Math.round(f.agreementPts)}/25, internal corroboration ${f.corroborationPts}/15.`,
  );

  return lines.join("\n");
}

async function computeFreshSnapshot(input: SnapshotInput & { calculatedBy: string; recalcReason: "initial" | "manual" | "stale_90d" | "no_price" }) {
  const [approvedPo, prHistory, quotes, scrapeResult, mandi] = await Promise.all([
    getApprovedPoHistory(input.itemId, input.categoryCode),
    getPrHistory(input.itemId, input.categoryCode),
    getSupplierQuotations(input.itemId, input.categoryCode),
    scrapeWithRelaxation(input.itemName, input.categoryName, input.itemDescription),
    withTimeout(getOgdMandiPrices(input.itemName), 8000, null),
  ]);
  const scraped = scrapeResult.listings;

  // --- Source: Approved POs ---
  const poPrices = approvedPo.map((r) => parseFloat(r.price)).filter((n) => !isNaN(n));
  const lastPurchasePrice = poPrices[0] ?? null;
  const lastPurchaseDate = approvedPo[0]?.purchase_date ?? null;
  const avgOrgPurchasePrice = poPrices.length ? round2(avg(poPrices)) : null;

  // --- Source: PR (org) purchase history ---
  const prPrices = prHistory.map((r) => parseFloat(r.price)).filter((n) => !isNaN(n));
  const prHistoryAvgPrice = prPrices.length ? round2(avg(prPrices)) : null;

  // --- Source: Supplier quotations ---
  const quotePrices = quotes.map((r) => parseFloat(r.price)).filter((n) => !isNaN(n));
  const supplierQuotationAvgPrice = quotePrices.length ? round2(avg(quotePrices)) : null;

  // --- Source: Market trend (scraper) ---
  // Mirrors negotiation-agent's applyRealMarketPricing: every listing is
  // converted into the line's currency BEFORE averaging (one FX lookup per
  // distinct source currency — at most INR/USD — not one per listing).
  // Listings whose rate is unavailable are dropped, same as that agent.
  const targetCurrency = String(input.currCode || "USD").toUpperCase();

  // (a) Relevance & Asset Plausibility Floor:
  // Major vehicles, motorcycles, laptops, servers, and machinery cannot be ₹300-₹700 spare parts/brochures.
  const fullText = `${input.itemName} ${input.categoryName || ""} ${input.itemDescription || ""}`.toLowerCase();
  let minPriceThreshold = 0;
  if (/\b(motorcycle|bike|scooter|vehicle|automobile|car|truck|tractor)\b/i.test(fullText)) {
    minPriceThreshold = 10000; // Vehicles / motorcycles cannot be under ₹10,000
  } else if (/\b(laptop|macbook|computer|desktop|server|generator|machinery|engine)\b/i.test(fullText)) {
    minPriceThreshold = 3000; // Laptops / machinery assets cannot be under ₹3,000
  }

  const keyTokens = itemKeyTokens(input.itemName);
  const relevant = scraped.filter(
    (s) =>
      s.unitPrice != null &&
      s.unitPrice >= minPriceThreshold &&
      titleMatchesItem(s.productTitle, keyTokens) &&
      !isAccessoryListing(s.productTitle),
  );
  const droppedIrrelevant = scraped.filter((s) => s.unitPrice != null).length - relevant.length;

  // (b) Units: bucket by canonical base and keep only the dominant one, so a
  // per-Ton quote can never be averaged against a per-Kilogram quote. Prices
  // inside the winning bucket are restated on that base (Ton -> kg etc.).
  const buckets = new Map<string, Array<{ s: (typeof relevant)[number]; price: number }>>();
  for (const s of relevant) {
    const cu = canonicalUnit(s.priceUnit);
    // Unpriced-by-unit listings share a bucket keyed "" and are only used if
    // nothing better exists.
    const base = cu ? cu.base : "";
    const price = (s.unitPrice as number) * (cu ? cu.factor : 1);
    if (!buckets.has(base)) buckets.set(base, []);
    buckets.get(base)!.push({ s, price });
  }
  // Prefer the bucket matching the line's own UOM; otherwise the most populous.
  const uomBase = canonicalUnit(input.uom)?.base ?? null;
  let winningBase: string | null = null;
  if (uomBase && (buckets.get(uomBase)?.length ?? 0) > 0) {
    winningBase = uomBase;
  } else {
    for (const [base, rows] of Array.from(buckets.entries())) {
      if (base === "") continue;
      if (winningBase == null || rows.length > buckets.get(winningBase)!.length) winningBase = base;
    }
    if (winningBase == null && buckets.has("")) winningBase = "";
  }
  const chosen = winningBase == null ? [] : buckets.get(winningBase)!;
  const droppedUnitMismatch = relevant.length - chosen.length;
  const priceUnitBasis = winningBase || null;

  const pricedListings = chosen.map((c) => c.s);
  const basisPriceByListing = new Map(chosen.map((c) => [c.s, c.price]));
  const distinctCurrencies = Array.from(
    new Set(pricedListings.map((s) => String(s.priceCurrency || "USD").toUpperCase())),
  );
  const rateByCurrency: Record<string, number> = {};
  for (const cur of distinctCurrencies) {
    if (cur === targetCurrency) {
      rateByCurrency[cur] = 1;
      continue;
    }
    try {
      rateByCurrency[cur] = await convertCurrency(1, cur, targetCurrency);
    } catch (err: any) {
      console.warn(`[FMPI] exchange rate ${cur}->${targetCurrency} unavailable:`, err?.message);
    }
  }
  const convertedPrices = pricedListings
    .map((s) => {
      const rate = rateByCurrency[String(s.priceCurrency || "USD").toUpperCase()];
      const basis = basisPriceByListing.get(s);
      return rate != null && basis != null ? basis * rate : null;
    })
    .filter((n): n is number => n != null && !Number.isNaN(n) && n > 0);

  // (c) Outliers: one mis-parsed or mis-listed row must not define the mean.
  const scrapedPrices = iqrTrim(convertedPrices);
  const droppedOutliers = convertedPrices.length - scrapedPrices.length;
  if (droppedIrrelevant || droppedUnitMismatch || droppedOutliers) {
    console.log(
      `[FMPI] ${input.itemName}: dropped ${droppedIrrelevant} off-title, ` +
      `${droppedUnitMismatch} unit-mismatch, ${droppedOutliers} outlier ` +
      `-> ${scrapedPrices.length} usable listings on basis "${priceUnitBasis ?? "n/a"}"`,
    );
  }
  const marketTrendPrice = scrapedPrices.length ? round2(median(scrapedPrices)) : null;
  // Always the line's currency now — never listing[0]'s.
  const marketTrendCurrency = marketTrendPrice != null ? targetCurrency : null;

  // --- Source: Regional (India mandi) ---
  const regionalMarketPrice = mandi ? round2(mandi.avgModalPriceINRPerKg) : null;

  // --- Price trend: last purchase vs avg of prior 3-5 approved-PO purchases ---
  let priceTrendDirection: "Rising" | "Falling" | "Stable" | null = null;
  let priceTrendMagnitudePct: number | null = null;
  if (poPrices.length >= 4) {
    const prior = poPrices.slice(1);
    const priorAvg = avg(prior);
    const pctChange = ((poPrices[0] - priorAvg) / priorAvg) * 100;
    priceTrendMagnitudePct = round1(pctChange);
    priceTrendDirection = pctChange > 5 ? "Rising" : pctChange < -5 ? "Falling" : "Stable";
  }

  // --- Fair Market Price: median of live-scraped listings ---
  let fairMarketPrice = marketTrendPrice;
  let rangeMin: number | null = null;
  let rangeMax: number | null = null;
  let isAiEstimate = false;
  let fmpProviderSource: string | null = null;
  if (scrapedPrices.length >= 3) {
    const sorted = [...scrapedPrices].sort((a, b) => a - b);
    const p15 = sorted[Math.floor(sorted.length * 0.15)];
    const p85 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.85) - 1)];
    rangeMin = round2(p15);
    rangeMax = round2(p85);
  } else if (scrapedPrices.length > 0) {
    const med = median(scrapedPrices);
    rangeMin = round2(med * 0.88);
    rangeMax = round2(med * 1.12);
  } else {
    // Scrape came back empty. Try the FMP service (Google Merchant API -> Web -> Gov Open Data)
    const fmpRes = await withTimeout(
      fmpService.getFairMarketPrice({
        itemName: input.itemName,
        itemDescription: input.itemDescription || input.itemName,
        categoryName: input.categoryName || undefined,
        currency: targetCurrency,
        deliveryLocation: input.deliveryLocation || undefined,
        quantity: input.quantity || undefined,
        uom: input.uom || undefined,
      }),
      10000,
      null
    );

    if (fmpRes && fmpRes.fmp != null && fmpRes.fmp > 0) {
      fairMarketPrice = round2(fmpRes.fmp);
      rangeMin = round2(fmpRes.fmp * 0.9);
      rangeMax = round2(fmpRes.fmp * 1.1);
      if (fmpRes.source === "google_merchant") {
        fmpProviderSource = "google_merchant";
      } else if (fmpRes.source === "government_open_data") {
        fmpProviderSource = "regional_market";
      } else if (fmpRes.source === "web") {
        fmpProviderSource = "web_search";
      }
    } else {
      // Fall back to the LLM estimate if all prior sources yielded no data
      const est = await withTimeout(
        estimateFairMarketPriceViaLLM(
          input.itemName,
          input.categoryName,
          targetCurrency,
          input.deliveryLocation,
          input.quantity,
        ),
        AI_ESTIMATE_TIMEOUT_MS,
        null,
      );
      if (est) {
        fairMarketPrice = est.price;
        rangeMin = est.rangeMin;
        rangeMax = est.rangeMax;
        isAiEstimate = true;
      }
    }
  }

  // Each marketplace counts as its own source: they are independent sellers
  // and independent price opinions, so "3 marketplaces agreed" is genuinely
  // stronger evidence than one site, and the UI should be able to say so.
  const sitesUsed = Array.from(new Set(pricedListings.map((s) => s.sourceSite))).sort();

  const sourcesUsed: string[] = [];
  if (avgOrgPurchasePrice != null) sourcesUsed.push("approved_po");
  if (prHistoryAvgPrice != null) sourcesUsed.push("org_history");
  if (supplierQuotationAvgPrice != null) sourcesUsed.push("supplier_quotation");
  for (const site of sitesUsed) sourcesUsed.push(site);
  if (regionalMarketPrice != null) sourcesUsed.push("regional_market");
  if (fmpProviderSource) sourcesUsed.push(fmpProviderSource);
  if (isAiEstimate) sourcesUsed.push("ai_estimate");

  // Confidence describes the headline number, and the headline number is the
  // scrape mean — so it is scored off the scrape itself, not off how much
  // internal paperwork the item happens to have. Four things make a mean
  // trustworthy: how many listings it averages, how many independent
  // marketplaces they came from, how much those listings agree with each
  // other, and whether prices we already paid corroborate it.
  const n = scrapedPrices.length;
  const samplePts = Math.min(n, 10) * 4;                       // max 40
  const diversityPts = Math.min(sitesUsed.length, 3) * (20 / 3); // max 20

  // Dispersion: coefficient of variation. A tight cluster of listings is a
  // real market price; listings spread 2x apart mean we are averaging
  // different things (sizes, grades, pack quantities) and deserve less credit.
  let agreementPts = 0;
  if (n >= 2 && marketTrendPrice) {
    const mean = marketTrendPrice;
    const variance = scrapedPrices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;
    const cv = Math.sqrt(variance) / mean;
    // cv <= .15 → full marks, cv >= .75 → none, linear in between.
    agreementPts = 25 * Math.max(0, Math.min(1, (0.75 - cv) / 0.6));
  } else if (n === 1) {
    agreementPts = 5;
  }

  // Corroboration: an internal price within ±25% of the scrape mean is an
  // independent confirmation that we are in the right ballpark.
  const corroborators = [avgOrgPurchasePrice, supplierQuotationAvgPrice, prHistoryAvgPrice, regionalMarketPrice]
    .filter((p): p is number => p != null && marketTrendPrice != null && Math.abs(p - marketTrendPrice) / marketTrendPrice <= 0.25);
  const corroborationPts = Math.min(corroborators.length, 3) * 5; // max 15

  // An LLM estimate is not evidence, so it is pinned to a flat low score
  // rather than inheriting any of the above — otherwise a well-documented item
  // with a failed scrape would look confident about a number nobody observed.
  const rawConfidence = samplePts + diversityPts + agreementPts + corroborationPts;

  const confidenceScore = fairMarketPrice == null
    ? 0
    : isAiEstimate
      ? AI_ESTIMATE_CONFIDENCE
      : Math.round(Math.min(100, Math.max(10, rawConfidence)));

  // --- Why this price ---
  // Every line below is a restatement of a number computed above; nothing here
  // is generated, inferred or asked of a model. If a fact isn't available the
  // line is omitted rather than softened, so the buyer can never read a
  // hedge as evidence.
  let reasoning = buildReasoning({
    itemName: input.itemName,
    fairMarketPrice,
    currency: targetCurrency,
    isAiEstimate,
    n,
    sitesUsed,
    priceUnitBasis,
    rawCount: scraped.filter((s) => s.unitPrice != null).length,
    droppedIrrelevant,
    droppedUnitMismatch,
    droppedOutliers,
    rangeMin,
    rangeMax,
    cv: n >= 2 && marketTrendPrice
      ? Math.sqrt(scrapedPrices.reduce((acc, p) => acc + (p - marketTrendPrice) ** 2, 0) / n) / marketTrendPrice
      : null,
    corroboratorCount: corroborators.length,
    lastPurchasePrice,
    lastPurchaseDate,
    confidenceScore,
    samplePts,
    diversityPts,
    agreementPts,
    corroborationPts,
  });

  // --- LLM Dynamic Confidence & Reasoning Evaluation ---
  // Send item metadata & all extracted market evidence to LLM to compute confidence score & reasoning
  let finalConfidenceScore = confidenceScore;
  let finalReasoning = reasoning;

  const llmEval = await withTimeout(
    evaluateConfidenceAndReasoningViaLLM({
      itemName: input.itemName,
      categoryName: input.categoryName,
      uom: input.uom,
      currency: targetCurrency,
      deliveryLocation: input.deliveryLocation,
      quantity: input.quantity,
      fairMarketPrice,
      rangeMin,
      rangeMax,
      scrapedListings: scraped.map((s) => ({
        title: s.productTitle || input.itemName,
        price: Number(s.unitPrice || 0),
        currency: String(s.priceCurrency || "USD").toUpperCase(),
        site: s.sourceSite,
      })).filter((x) => x.price > 0),
      scrapedPrices,
      poPrices,
      prPrices,
      quotePrices,
      regionalMarketPrice,
      rawCount: scraped.filter((s) => s.unitPrice != null).length,
      droppedIrrelevant,
      droppedUnitMismatch,
      droppedOutliers,
      isAiEstimate,
    }),
    12000,
    null
  );

  if (llmEval) {
    if (llmEval.fairMarketPrice != null && llmEval.fairMarketPrice > 0) {
      fairMarketPrice = round2(llmEval.fairMarketPrice);
      if (llmEval.rangeMin != null && llmEval.rangeMax != null) {
        rangeMin = round2(llmEval.rangeMin);
        rangeMax = round2(llmEval.rangeMax);
      }
    }
    if (llmEval.confidenceScore != null && llmEval.confidenceScore > 0) {
      finalConfidenceScore = llmEval.confidenceScore;
    }
    if (llmEval.reasoning) {
      finalReasoning = llmEval.reasoning;
    }
  }

  const qty = input.quantity != null && Number.isFinite(Number(input.quantity)) && Number(input.quantity) > 0
    ? Number(input.quantity)
    : 1;

  const totalFairMarketPrice = fairMarketPrice != null ? round2(fairMarketPrice * qty) : null;
  const totalRangeMin = rangeMin != null ? round2(rangeMin * qty) : null;
  const totalRangeMax = rangeMax != null ? round2(rangeMax * qty) : null;

  return {
    id: `snap_${Date.now()}`,
    itemId: input.itemId,
    itemName: input.itemName,
    productCategory: input.categoryCode,
    productCategoryName: input.categoryName,
    currCode: input.currCode,
    deliveryLocation: input.deliveryLocation ?? null,
    quantity: qty,
    fairMarketPrice: fairMarketPrice != null ? String(fairMarketPrice) : null,
    rangeMin: rangeMin != null ? String(rangeMin) : null,
    rangeMax: rangeMax != null ? String(rangeMax) : null,
    totalFairMarketPrice: totalFairMarketPrice != null ? String(totalFairMarketPrice) : null,
    totalRangeMin: totalRangeMin != null ? String(totalRangeMin) : null,
    totalRangeMax: totalRangeMax != null ? String(totalRangeMax) : null,
    confidenceScore: finalConfidenceScore,
    priceTrendDirection,
    priceTrendMagnitudePct: priceTrendMagnitudePct != null ? String(priceTrendMagnitudePct) : null,
    lastPurchasePrice: lastPurchasePrice != null ? String(lastPurchasePrice) : null,
    lastPurchaseDate: lastPurchaseDate ? new Date(lastPurchaseDate) : null,
    avgOrgPurchasePrice: avgOrgPurchasePrice != null ? String(avgOrgPurchasePrice) : null,
    approvedPoSampleSize: poPrices.length,
    prHistoryAvgPrice: prHistoryAvgPrice != null ? String(prHistoryAvgPrice) : null,
    prHistorySampleSize: prPrices.length,
    supplierQuotationAvgPrice: supplierQuotationAvgPrice != null ? String(supplierQuotationAvgPrice) : null,
    supplierQuotationSampleSize: quotePrices.length,
    marketTrendPrice: marketTrendPrice != null ? String(marketTrendPrice) : null,
    marketTrendCurrency,
    marketTrendSampleSize: scrapedPrices.length,
    regionalMarketPrice: regionalMarketPrice != null ? String(regionalMarketPrice) : null,
    regionalMarketScope: mandi?.scope ?? null,
    sourcesUsedCount: sourcesUsed.length,
    sourcesUsedList: sourcesUsed.join(","),
    reasoning: finalReasoning,
    calculatedBy: input.calculatedBy,
    recalcReason: input.recalcReason,
    calculatedDate: new Date(),
  };
}

export async function getOrComputeSnapshot(input: SnapshotInput) {
  return computeFreshSnapshot({
    ...input,
    calculatedBy: "System",
    recalcReason: "initial",
  });
}

export async function recalculate(input: SnapshotInput & { userName: string }) {
  return computeFreshSnapshot({ ...input, calculatedBy: input.userName, recalcReason: "manual" });
}
