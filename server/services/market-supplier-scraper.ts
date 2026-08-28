import puppeteer from "puppeteer";

// Live market-supplier scraper for the Cost Intelligence agent's "Local
// Suppliers" panel. Every result is an ACTUAL seller company — its real
// business name, its own listed price for the searched item, and its details
// (location, badges, member info) — taken from a B2B directory listing card.
// Marketplace/aggregator channel names are never returned as suppliers.
//
// Sources (both server-rendered, verified reachable):
//   - India     → ExportersIndia (dir listing: company, price in INR, address, GST)
//   - elsewhere → Made-in-China  (company, price range USD, MOQ, audited badge)
// IndiaMART/Alibaba were evaluated first but serve only client-side shells to
// headless browsers, so they cannot be scraped reliably here.
//
// Scraping is best-effort: bot-blocks, timeouts, or selector drift degrade to
// [] with a console.warn — never an exception to the caller.

export interface ScrapedSupplier {
  name: string;
  type?: "Primary Producer" | "Manufacturer" | "Trader / Distributor";
  city: string;
  country: string;
  unitPrice: number | null;
  priceUnit?: string | null;
  priceCurrency: "INR" | "USD";
  moq: number | null;
  leadTimeDays?: number | null;
  rating: number | null;
  verified: boolean;
  memberSince?: string | null;
  contact?: string | null;
  sourceUrl: string;
  source: "web";
  // The listing's own product headline. Retained so callers can verify a
  // result actually matches the item they searched for — without it a relaxed
  // search term ("Bags" for "Bags L") silently returns unrelated goods that
  // still look like valid priced listings.
  productTitle?: string | null;
  // Which marketplace produced this row. These are independent data providers,
  // so price statistics built from them count as separate sources.
  sourceSite: MarketSite;
}

export type MarketSite = "exportersindia" | "made-in-china" | "tradeindia";

interface CacheEntry {
  timestamp: number;
  data: ScrapedSupplier[];
}

const CACHE_TTL_MS = 18 * 60 * 60 * 1000; // 18 hours
const cache = new Map<string, CacheEntry>();
const inFlightPromises = new Map<string, Promise<ScrapedSupplier[]>>();

const MARKETPLACE_BLOCKLIST = [
  "indiamart",
  "alibaba",
  "amazon",
  "flipkart",
  "swiggy",
  "zomato",
  "ebay",
  "tradeindia",
  "exportersindia",
  "made-in-china",
  "made in china",
  "justdial",
  "meesho",
  "myntra",
  "india mart",
  "ali baba"
];

function isBlocklisted(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (lower.length < 3) return true;
  return MARKETPLACE_BLOCKLIST.some(b => lower === b || lower.includes(b));
}

// Raw card data extracted inside page.evaluate (plain strings only).
interface RawCard {
  name: string;
  priceText: string;
  location: string;
  moqText: string;
  memberText: string;
  typeText: string;
  verified: boolean;
  url: string;
  productTitle: string;
}

// Parse "Rs 5 / Piece", "₹ 1,250/Kg", "US$ 0.80 - 0.83" style price text.
function parsePriceText(text: string): { price: number | null; unit: string | null } {
  if (!text) return { price: null, unit: null };
  const cleaned = text.replace(/,/g, "").replace(/\s+/g, " ");
  const m = cleaned.match(/([0-9]+(?:\.[0-9]+)?)/);
  let price = m ? parseFloat(m[1]) : null;
  // Indian marketplaces quote large values in scale words ("Price: 1.18 Lakh /
  // Piece"). Taking the leading number alone turns ₹118,000 into ₹1.18, which
  // silently poisons every average it lands in — so apply the multiplier that
  // immediately follows the number we actually matched.
  if (price != null && m) {
    const after = cleaned.slice(cleaned.indexOf(m[1]) + m[1].length, cleaned.indexOf(m[1]) + m[1].length + 14).toLowerCase();
    if (/^\s*(lakh|lac|lakhs)\b/.test(after)) price *= 100000;
    else if (/^\s*(crore|cr)\b/.test(after)) price *= 10000000;
    else if (/^\s*(k)\b/.test(after)) price *= 1000;
  }
  const uMatch = cleaned.match(/\/\s*([A-Za-z()\s]{1,20})/);
  const unit = uMatch ? `/${uMatch[1].trim()}` : null;
  return { price: price != null && isFinite(price) ? price : null, unit };
}

function mapTypeText(typeText: string): "Primary Producer" | "Manufacturer" | "Trader / Distributor" {
  const t = (typeText || "").toLowerCase();
  if (t.includes("trad") || t.includes("distributor") || t.includes("dealer") || t.includes("wholesal") || t.includes("retail")) {
    return "Trader / Distributor";
  }
  return "Manufacturer";
}

// ── ExportersIndia (India) ────────────────────────────────────────────────
// Server-rendered listing: each supplier box is `.com_address` containing
// `a.com_nam` (company name + own-website link) and `._fAdre .title_tooltip`
// (address); the product block alongside carries `._PTitle` and `._price`.
async function scrapeExportersIndia(page: any, itemName: string, maxPages = 3): Promise<RawCard[]> {
  const all: RawCard[] = [];
  const seen = new Set<string>();
  // A search page carries ~100 listing boxes, so the old 15-row cap — not the
  // site — was the binding constraint. Walk a few pages for a wider sample;
  // each page contributes ~30 companies not seen on the previous one.
  for (let p = 1; p <= maxPages; p++) {
    const url = `https://www.exportersindia.com/search.php?term=${encodeURIComponent(itemName)}${p > 1 ? `&page=${p}` : ""}`;
    let cards: RawCard[] = [];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      cards = await scrapeExportersIndiaPage(page);
    } catch (err: any) {
      console.warn(`[MarketSupplierScraper] ExportersIndia page ${p} failed:`, err?.message || err);
      break;
    }
    if (!cards.length) break;
    for (const c of cards) {
      const key = c.name.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        all.push(c);
      }
    }
  }
  return all;
}

async function scrapeExportersIndiaPage(page: any): Promise<RawCard[]> {
  return page.evaluate(`(() => {
    const items = [];
    const boxes = document.querySelectorAll(".com_address");
    for (let i = 0; i < boxes.length && items.length < 45; i++) {
      const box = boxes[i];
      const nameEl = box.querySelector(".com_nam");
      const name = nameEl ? (nameEl.textContent || "").trim() : "";
      if (!name) continue;

      // Climb to the listing card that also holds the product/price block.
      let card = box.parentElement;
      let hops = 0;
      while (card && hops < 4 && !card.querySelector("._price, ._PTitle")) {
        card = card.parentElement;
        hops++;
      }
      if (card && card.querySelectorAll(".com_address").length > 1) card = box.parentElement;

      // Prefer the short visible address ("Byculla, Mumbai, Maharashtra, India");
      // the data-tooltip holds the full street address as a fallback.
      const tooltipEl = box.querySelector("._fAdre .title_tooltip");
      const location = tooltipEl
        ? (tooltipEl.textContent || tooltipEl.getAttribute("data-tooltip") || "").trim()
        : ((box.querySelector("._fAdre") || {}).textContent || "").trim();

      const priceEl = card ? card.querySelector("._price") : null;
      const priceText = priceEl ? (priceEl.textContent || "").trim() : "";

      // The result grid ships two card layouts: the newer ".l3Inn" card puts the
      // product name in "._PTitle", the older one in ".clsProDet". Checking only
      // the former left productTitle empty on most rows, which in turn made
      // relevance filtering impossible downstream.
      const titleEl = card ? card.querySelector("._PTitle, .clsProDet") : null;
      const productTitle = titleEl ? (titleEl.textContent || "").replace(/\\s+/g, " ").trim() : "";

      const mebEl = box.querySelector("._mebData");
      const memberText = mebEl ? (mebEl.textContent || "").replace(/\\s+/g, " ").trim() : "";

      const href = nameEl && nameEl.getAttribute("href") ? nameEl.getAttribute("href") : "";

      items.push({
        name: name,
        priceText: priceText,
        location: location,
        moqText: "",
        memberText: memberText.slice(0, 80),
        typeText: memberText,
        verified: /gst|trust|verified/i.test(box.textContent || ""),
        url: href || "",
        productTitle: productTitle
      });
    }
    return items;
  })()`);
}

// ── Made-in-China (global) ────────────────────────────────────────────────
// Server-rendered `.products-item` cards: `.company-name`, `.price` ("US$
// 0.80 - 0.83"), MOQ text, `.ico-audited` badge, "Shandong, China" address.
async function scrapeMadeInChina(page: any, itemName: string): Promise<RawCard[]> {
  const slug = itemName.trim().replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
  const url = `https://www.made-in-china.com/products-search/hot-china-products/${encodeURIComponent(slug)}.html`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });

  return page.evaluate(`(() => {
    const items = [];
    const cards = document.querySelectorAll(".products-item");
    for (let i = 0; i < cards.length && items.length < 30; i++) {
      const card = cards[i];
      // ".company-name.ellipsis" is the clean single-line variant; the popup
      // wrapper duplicates the name mixed with badge text.
      const nameEl = card.querySelector(".company-name.ellipsis") || card.querySelector(".company-name");
      let name = nameEl ? (nameEl.textContent || "").trim() : "";
      name = name.split("\\n")[0].trim();
      if (!name) continue;

      const priceEl = card.querySelector(".price-new, .price");
      const priceText = priceEl ? (priceEl.textContent || "").trim() : "";

      const titleEl = card.querySelector(".product-name, h2 a, .pro-name");
      const productTitle = titleEl ? (titleEl.textContent || "").replace(/\\s+/g, " ").trim() : "";

      const moqEl = card.querySelector(".moq-new, [class*='moq']");
      const moqText = moqEl ? (moqEl.textContent || "").trim() : "";

      const addrEl = card.querySelector("[class*='company-address'], [class*='address']");
      let location = addrEl ? (addrEl.textContent || "").trim() : "";
      if (!location) {
        const m = (card.textContent || "").match(/([A-Za-z]+,\\s*China)/);
        location = m ? m[1] : "China";
      }

      const memberM = (card.textContent || "").match(/(Diamond Member|Gold Member|Audited Supplier)/);
      const typeM = (card.textContent || "").match(/(Manufacturer\\/Factory|Trading Company|Manufacturer|Group Corporation)/);

      const linkEl = card.querySelector("a[href*='made-in-china.com']");

      items.push({
        name: name,
        priceText: priceText,
        location: location.slice(0, 80),
        moqText: moqText,
        memberText: memberM ? memberM[1] : "",
        typeText: typeM ? typeM[1] : "",
        verified: !!card.querySelector(".ico-audited") || /Audited Supplier/.test(card.textContent || ""),
        url: linkEl ? linkEl.href : "",
        productTitle: productTitle
      });
    }
    return items;
  })()`);
}

// ── TradeIndia (India) ────────────────────────────────────────────────────
// Server-rendered `div.card` results. The visible classes are hashed
// styled-component names that churn on every deploy, so nothing here keys off
// them: rows are read from the card's innerText line layout, and the product
// headline is recovered from the listing URL slug (the most stable handle on
// the page). Layout observed across cards:
//   ["Made in India"?, <Company>, <Title - attrs>, "Price: 36 INR (Approx.)/Bundle"?,
//    "MOQ- 216 Piece/Pieces", <attr lines...>, "11 Years", <City>, ...]
// When the "Made in India" banner is absent the company instead sits directly
// above the "<N> Years" tenure line.
async function scrapeTradeIndia(page: any, itemName: string): Promise<RawCard[]> {
  const url = `https://www.tradeindia.com/search.html?keyword=${encodeURIComponent(itemName)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });

  return page.evaluate(`(() => {
    const items = [];
    const cards = document.querySelectorAll("div.card");
    const NOISE = /^(Trusted|Seller|View Number|Send Inquiry|Indian Inquiries Only|Made in India|Business Type:)/i;

    for (let i = 0; i < cards.length && items.length < 30; i++) {
      const card = cards[i];
      const raw = (card.innerText || "").split("\\n").map(function (s) { return s.trim(); }).filter(Boolean);
      if (raw.length < 4) continue;

      const yearsIdx = raw.findIndex(function (l) { return /^\\d+\\s+Years?$/i.test(l); });
      const madeIdx = raw.findIndex(function (l) { return /^Made in India$/i.test(l); });

      let name = "";
      if (madeIdx >= 0 && raw[madeIdx + 1]) name = raw[madeIdx + 1];
      else if (yearsIdx > 0) name = raw[yearsIdx - 1];
      if (!name || NOISE.test(name)) continue;

      // City = first non-noise line after the tenure marker.
      let location = "";
      for (let k = yearsIdx + 1; k >= 1 && k < raw.length; k++) {
        if (!NOISE.test(raw[k])) { location = raw[k]; break; }
      }

      const priceLine = raw.find(function (l) { return /^Price:/i.test(l); }) || "";
      const moqLine = raw.find(function (l) { return /^MOQ\\s*[-:]/i.test(l); }) || "";

      // Title from the listing URL slug: /products/<slug>-c123456.html
      let productTitle = "";
      const a = card.querySelector("a[href*='/products/']");
      const href = a ? (a.getAttribute("href") || "") : "";
      const slugM = href.match(/\\/products\\/(.+?)(?:-c\\d+)?\\.html/);
      if (slugM) productTitle = slugM[1].replace(/-/g, " ").trim();

      items.push({
        name: name,
        priceText: priceLine,
        location: location,
        moqText: moqLine,
        memberText: yearsIdx >= 0 ? raw[yearsIdx] : "",
        typeText: (raw.find(function (l) { return /^Business Type:/i.test(l); }) || ""),
        verified: raw.some(function (l) { return /^Trusted$/i.test(l); }),
        url: href,
        productTitle: productTitle
      });
    }
    return items;
  })()`);
}

export async function scrapeMarketSuppliers(
  itemName: string,
  city: string,
  country: string,
  opts: { limit?: number } = {}
): Promise<ScrapedSupplier[]> {
  const cleanItem = (itemName || "").trim();
  const cleanCity = (city || "").trim();
  const cleanCountry = (country || "").trim();
  // The supplier panel shows a short list; price statistics want the whole
  // sample, so callers doing maths pass a much larger limit.
  const limit = Math.max(1, opts.limit ?? 6);

  if (!cleanItem) return [];

  const cacheKey = `${cleanItem.toLowerCase()}|${cleanCity.toLowerCase()}|${cleanCountry.toLowerCase()}|${limit}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (inFlightPromises.has(cacheKey)) {
    return inFlightPromises.get(cacheKey)!;
  }

  const promise = (async () => {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ],
      });
      // Every source is queried on every request rather than picking one by
      // delivery country. Price statistics built downstream need breadth, and
      // these are independent providers — a single marketplace is one opinion.
      // Run them on separate tabs so three sites cost roughly one site's wall
      // time instead of three.
      // tsx/esbuild keepNames injects a `__name` helper into transpiled
      // functions; shim it so string-evaluated code never trips over it, and
      // mask the headless webdriver flag.
      const configureTab = async (tab: any) => {
        tab.setDefaultNavigationTimeout(25000);
        await tab.evaluateOnNewDocument("window.__name = (f) => f");
        await tab.evaluateOnNewDocument("Object.defineProperty(navigator, 'webdriver', { get: () => undefined })");
        await tab.setUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        );
        return tab;
      };

      const runSource = async (
        site: MarketSite,
        fn: (tab: any) => Promise<RawCard[]>
      ): Promise<{ site: MarketSite; cards: RawCard[] }> => {
        let tab: any = null;
        try {
          tab = await configureTab(await browser!.newPage());
          return { site, cards: await fn(tab) };
        } catch (err: any) {
          console.warn(`[MarketSupplierScraper] ${site} failed for "${cleanItem}":`, err?.message || err);
          return { site, cards: [] };
        } finally {
          if (tab) { try { await tab.close(); } catch (_) {} }
        }
      };

      const results = await Promise.all([
        runSource("exportersindia", tab => scrapeExportersIndia(tab, cleanItem)),
        runSource("made-in-china", tab => scrapeMadeInChina(tab, cleanItem)),
        runSource("tradeindia", tab => scrapeTradeIndia(tab, cleanItem))
      ]);

      // Currency is a property of the marketplace, not of the delivery country:
      // ExportersIndia/TradeIndia quote INR, Made-in-China quotes USD.
      const SITE_CURRENCY: Record<MarketSite, "INR" | "USD"> = {
        "exportersindia": "INR",
        "tradeindia": "INR",
        "made-in-china": "USD"
      };

      const mapped: ScrapedSupplier[] = results
        .flatMap(r => r.cards.map(c => ({ card: c, site: r.site })))
        .filter(({ card }) => card.name && !isBlocklisted(card.name))
        .map(({ card: c, site }) => {
          const isIndia = SITE_CURRENCY[site] === "INR";
          const currency = SITE_CURRENCY[site];
          const { price, unit } = parsePriceText(c.priceText);
          let moq: number | null = null;
          const moqM = (c.moqText || "").replace(/,/g, "").match(/([0-9]+)/);
          if (moqM) moq = parseInt(moqM[1], 10);

          // The listing address is the SELLER's location ("Byculla, Mumbai,
          // Maharashtra, India" / "Hebei, China") — split its own country off
          // the end rather than stamping the delivery country on it.
          const loc = (c.location || "").trim();
          let cityStr = loc || cleanCity || "";
          let countryStr = isIndia ? "India" : "";
          const parts = loc.split(",").map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2) {
            countryStr = parts[parts.length - 1];
            cityStr = parts.slice(0, -1).join(", ");
          }

          return {
            name: c.name,
            type: mapTypeText(c.typeText),
            city: cityStr,
            country: countryStr || (isIndia ? "India" : "Global"),
            unitPrice: price,
            priceUnit: unit,
            priceCurrency: currency,
            moq,
            leadTimeDays: null,
            // No fabricated details for real sellers — only what the listing shows.
            rating: null,
            memberSince: c.memberText || null,
            verified: c.verified === true,
            sourceUrl: c.url || "",
            source: "web" as const,
            productTitle: c.productTitle || null,
            sourceSite: site
          };
        });

      // Dedupe by company name (a company may list multiple matching products;
      // prefer the entry that has a price).
      const byName = new Map<string, ScrapedSupplier>();
      for (const s of mapped) {
        // Keyed per site: the same company quoting on two marketplaces is two
        // independent observations, and collapsing them would silently shrink
        // the sample that price statistics are built from.
        const key = `${s.sourceSite}|${s.name.toLowerCase()}`;
        const existing = byName.get(key);
        if (!existing || (existing.unitPrice == null && s.unitPrice != null)) {
          byName.set(key, s);
        }
      }

      // Prefer sellers located in/near the delivery city, then priced entries.
      const cityLc = cleanCity.toLowerCase();
      const filtered = Array.from(byName.values())
        .sort((a, b) => {
          if (cityLc) {
            const aMatch = a.city.toLowerCase().includes(cityLc) ? 0 : 1;
            const bMatch = b.city.toLowerCase().includes(cityLc) ? 0 : 1;
            if (aMatch !== bMatch) return aMatch - bMatch;
          }
          const aPriced = a.unitPrice != null ? 0 : 1;
          const bPriced = b.unitPrice != null ? 0 : 1;
          return aPriced - bPriced;
        })
        .slice(0, limit);

      cache.set(cacheKey, { timestamp: now, data: filtered });
      return filtered;
    } catch (err: any) {
      console.warn(`[MarketSupplierScraper] Failed scraping for ${cleanItem} (${cleanCity}, ${cleanCountry}):`, err?.message || err);
      return [];
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (_) {}
      }
      inFlightPromises.delete(cacheKey);
    }
  })();

  inFlightPromises.set(cacheKey, promise);
  return promise;
}
