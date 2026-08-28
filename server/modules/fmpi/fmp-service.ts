// Unified Fair Market Price (FMP) Engine
// Combines types, calculators, providers (Google Merchant, Web Scraper, Gov Open Data), and orchestration

import { scrapeMarketSuppliers } from "../../services/market-supplier-scraper";
import { getOgdMandiPrices } from "../../services/ogd-market-price";
import { convertCurrency } from "../../services/pr-ai-service";
import { propertiesService } from "../../services/propertiesService";

// ============================================================================
// Types
// ============================================================================

export type FmpSource = "google_merchant" | "web" | "government_open_data" | "unavailable";
export type FmpCalculationMethod = "median" | "mean" | "trimmed_mean";

export interface FmpRequest {
  itemName: string;
  itemDescription?: string;
  gtin?: string;
  upc?: string;
  ean?: string;
  sku?: string;
  productId?: string;
  brand?: string;
  model?: string;
  categoryName?: string;
  currency?: string;
  region?: string;
  deliveryLocation?: string;
  quantity?: number;
  uom?: string;
  calculationMethod?: FmpCalculationMethod;
}

export interface FmpResult {
  fmp: number | null;
  currency: string;
  source: FmpSource;
  confidence: number;
  product_match: boolean;
  product_identifier: string;
  matched_product: string;
  prices_considered: number[];
  source_urls: string[];
  retrieved_at: string;
  reasoning?: string;
}

export interface FmpProvider {
  name: FmpSource;
  lookup(req: FmpRequest): Promise<FmpResult | null>;
}

// ============================================================================
// Calculators & Outlier Filtering
// ============================================================================

export function calculateMedian(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  }
  return Math.round(sorted[mid] * 100) / 100;
}

export function calculateMean(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sum = prices.reduce((acc, p) => acc + p, 0);
  return Math.round((sum / prices.length) * 100) / 100;
}

export function filterOutliers(prices: number[]): number[] {
  const valid = prices.filter((p) => typeof p === "number" && isFinite(p) && p > 0);
  if (valid.length < 4) return valid;

  const sorted = [...valid].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;

  if (iqr <= 0) return valid;

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const filtered = valid.filter((p) => p >= lowerBound && p <= upperBound);
  return filtered.length >= 2 ? filtered : valid;
}

export function calculateFmp(
  rawPrices: number[],
  method: FmpCalculationMethod = "median"
): { fmp: number; cleanPrices: number[] } {
  const cleanPrices = filterOutliers(rawPrices);
  if (cleanPrices.length === 0) {
    return { fmp: 0, cleanPrices: [] };
  }

  let fmp = 0;
  switch (method) {
    case "mean":
      fmp = calculateMean(cleanPrices);
      break;
    case "trimmed_mean": {
      if (cleanPrices.length >= 4) {
        const sorted = [...cleanPrices].sort((a, b) => a - b);
        const trimmed = sorted.slice(1, sorted.length - 1);
        fmp = calculateMean(trimmed);
      } else {
        fmp = calculateMean(cleanPrices);
      }
      break;
    }
    case "median":
    default:
      fmp = calculateMedian(cleanPrices);
      break;
  }

  return { fmp: Math.round(fmp * 100) / 100, cleanPrices };
}

export function evaluateProductMatch(
  targetItem: {
    itemName: string;
    itemDescription?: string;
    brand?: string;
    model?: string;
    sku?: string;
    gtin?: string;
  },
  candidateItem: {
    title: string;
    brand?: string;
    model?: string;
    gtin?: string;
    sku?: string;
  }
): { isExactMatch: boolean; confidence: number; matchedIdentifier: string } {
  const candidateTitle = (candidateItem.title || "").toLowerCase();
  const targetName = (targetItem.itemName || "").toLowerCase();
  const targetDesc = (targetItem.itemDescription || "").toLowerCase();

  if (
    targetItem.gtin &&
    candidateItem.gtin &&
    targetItem.gtin.trim().toLowerCase() === candidateItem.gtin.trim().toLowerCase()
  ) {
    return {
      isExactMatch: true,
      confidence: 0.98,
      matchedIdentifier: `GTIN:${targetItem.gtin}`,
    };
  }

  if (
    targetItem.sku &&
    candidateItem.sku &&
    targetItem.sku.trim().toLowerCase() === candidateItem.sku.trim().toLowerCase()
  ) {
    return {
      isExactMatch: true,
      confidence: 0.95,
      matchedIdentifier: `SKU:${targetItem.sku}`,
    };
  }

  const fullTargetText = `${targetName} ${targetDesc}`.trim();
  const nameTokens = Array.from(
    new Set(
      fullTargetText
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3)
    )
  );

  const matchedTokens = nameTokens.filter((token) => candidateTitle.includes(token));
  const tokenRatio = nameTokens.length > 0 ? matchedTokens.length / nameTokens.length : 0.5;

  let score = 0.80 + tokenRatio * 0.12;

  if (targetItem.brand) {
    const brandLower = targetItem.brand.toLowerCase().trim();
    if (candidateTitle.includes(brandLower) || candidateItem.brand?.toLowerCase() === brandLower) {
      score += 0.04;
    }
  }

  if (targetItem.model) {
    const modelLower = targetItem.model.toLowerCase().trim();
    if (candidateTitle.includes(modelLower) || candidateItem.model?.toLowerCase() === modelLower) {
      score += 0.04;
    }
  }

  const confidence = Math.round(Math.min(0.98, Math.max(0.80, score)) * 100) / 100;
  const isExactMatch = confidence >= 0.80;

  const matchedIdentifier =
    targetItem.gtin ||
    targetItem.sku ||
    (targetItem.brand && targetItem.model ? `${targetItem.brand} ${targetItem.model}` : targetItem.itemName);

  return { isExactMatch, confidence, matchedIdentifier };
}

// ============================================================================
// Providers
// ============================================================================

export class GoogleMerchantProvider implements FmpProvider {
  name: FmpResult["source"] = "google_merchant";

  private async getApiKey(): Promise<string | null> {
    const key = await propertiesService.getGoogleApiKey();
    return key || null;
  }

  private async getMerchantId(): Promise<string | null> {
    const fromDb = await propertiesService.get("GOOGLE_MERCHANT_CENTER_ID");
    return fromDb || process.env.GOOGLE_MERCHANT_CENTER_ID || null;
  }

  private async getCx(): Promise<string | null> {
    const fromDb = await propertiesService.get("GOOGLE_CX");
    return fromDb || process.env.GOOGLE_CX || null;
  }

  async lookup(req: FmpRequest): Promise<FmpResult | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      console.log("[FMP:GoogleMerchant] Missing Google API key in am_property_mst / environment variables");
      return null;
    }

    try {
      const targetCurrency = (req.currency || "USD").toUpperCase();
      const searchQuery = this.buildSearchQuery(req);

      console.log(`[FMP:GoogleMerchant] Querying Google Merchant/Shopping API for "${searchQuery}"`);

      const items = await this.fetchGoogleProducts(apiKey, searchQuery, req);

      if (!items || items.length === 0) {
        console.log(`[FMP:GoogleMerchant] No products returned for query "${searchQuery}"`);
        return null;
      }

      const pricesConsidered: number[] = [];
      const sourceUrls: string[] = [];
      let bestMatchTitle = "";
      let bestMatchIdentifier = "";
      let highestMatchConfidence = 0;
      let exactMatchFound = false;

      for (const item of items) {
        const evalResult = evaluateProductMatch(
          {
            itemName: req.itemName,
            itemDescription: req.itemDescription,
            brand: req.brand,
            model: req.model,
            sku: req.sku,
            gtin: req.gtin || req.upc || req.ean,
          },
          {
            title: item.title,
            brand: item.brand,
            model: item.model,
            gtin: item.gtin,
            sku: item.sku,
          }
        );

        if (evalResult.confidence > highestMatchConfidence) {
          highestMatchConfidence = evalResult.confidence;
          bestMatchTitle = item.title;
          bestMatchIdentifier = evalResult.matchedIdentifier;
          exactMatchFound = evalResult.isExactMatch;
        }

        if (evalResult.confidence >= 0.5 && item.price > 0) {
          let price = item.price;
          if (item.currency && item.currency.toUpperCase() !== targetCurrency) {
            try {
              price = await convertCurrency(item.price, item.currency.toUpperCase(), targetCurrency);
            } catch (err: any) {
              console.warn(`[FMP:GoogleMerchant] Currency conversion failed for ${item.currency}->${targetCurrency}:`, err?.message);
            }
          }
          pricesConsidered.push(price);
          if (item.link && !sourceUrls.includes(item.link)) {
            sourceUrls.push(item.link);
          }
        }
      }

      if (pricesConsidered.length === 0) {
        console.log(`[FMP:GoogleMerchant] Product found but no valid price candidates extracted`);
        return null;
      }

      const { fmp, cleanPrices } = calculateFmp(pricesConsidered, req.calculationMethod || "median");

      return {
        fmp,
        currency: targetCurrency,
        source: "google_merchant",
        confidence: exactMatchFound ? highestMatchConfidence : Math.round(highestMatchConfidence * 0.8 * 100) / 100,
        product_match: exactMatchFound,
        product_identifier: bestMatchIdentifier || req.gtin || req.sku || req.itemName,
        matched_product: bestMatchTitle || req.itemName,
        prices_considered: cleanPrices,
        source_urls: sourceUrls.slice(0, 10),
        retrieved_at: new Date().toISOString(),
        reasoning: `Google Merchant API price computed from ${cleanPrices.length} product matching listings (median FMP: ${targetCurrency} ${fmp}).`,
      };
    } catch (err: any) {
      console.warn("[FMP:GoogleMerchant] Lookup error:", err?.message || err);
      return null;
    }
  }

  private buildSearchQuery(req: FmpRequest): string {
    if (req.gtin) return req.gtin;
    if (req.upc) return req.upc;
    if (req.ean) return req.ean;
    if (req.sku) return req.sku;

    const parts: string[] = [];
    if (req.brand && !req.itemName.toLowerCase().includes(req.brand.toLowerCase())) parts.push(req.brand);
    if (req.model && !req.itemName.toLowerCase().includes(req.model.toLowerCase())) parts.push(req.model);
    parts.push(req.itemName);

    return parts.join(" ").trim();
  }

  private async fetchGoogleProducts(
    apiKey: string,
    query: string,
    req: FmpRequest
  ): Promise<Array<{ title: string; price: number; currency: string; link?: string; brand?: string; model?: string; gtin?: string; sku?: string }>> {
    const cx = await this.getCx();
    const merchantId = await this.getMerchantId();

    if (merchantId) {
      try {
        const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products?key=${apiKey}&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.resources) && data.resources.length > 0) {
            return data.resources.map((r: any) => ({
              title: r.title || r.offerId || query,
              price: parseFloat(r.price?.value || r.targetPrice?.value || "0"),
              currency: r.price?.currency || req.currency || "USD",
              link: r.link,
              brand: r.brand,
              gtin: r.gtin,
            })).filter((x: any) => x.price > 0);
          }
        }
      } catch {
        // Fall back to Custom Search / Shopping API
      }
    }

    if (cx) {
      try {
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image`;
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.items)) {
            return data.items
              .map((item: any) => {
                const offer = item?.pagemap?.offer?.[0] || item?.pagemap?.product?.[0];
                const price = parseFloat(offer?.price || "0");
                return {
                  title: item.title || query,
                  price,
                  currency: offer?.pricecurrency || req.currency || "USD",
                  link: item.link,
                  brand: item?.pagemap?.product?.[0]?.brand,
                };
              })
              .filter((x: any) => x.price > 0);
          }
        }
      } catch {
        // Fall through
      }
    }

    try {
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&q=${encodeURIComponent(query + " price")}`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.items)) {
          const extracted: Array<{ title: string; price: number; currency: string; link?: string }> = [];
          for (const item of data.items) {
            const offer = item?.pagemap?.offer?.[0] || item?.pagemap?.product?.[0];
            let price = parseFloat(offer?.price || "0");

            if (price <= 0 && item.snippet) {
              const match = item.snippet.match(/[\$\€\£\₹]\s?(\d+(?:\.\d{2})?)/);
              if (match) {
                price = parseFloat(match[1]);
              }
            }

            if (price > 0) {
              extracted.push({
                title: item.title || query,
                price,
                currency: offer?.pricecurrency || (item.snippet?.includes("₹") ? "INR" : req.currency || "USD"),
                link: item.link,
              });
            }
          }
          if (extracted.length > 0) {
            return extracted;
          }
        }
      }
    } catch {
      // Fall through
    }

    return [];
  }
}

export class WebPriceProvider implements FmpProvider {
  name: FmpResult["source"] = "web";

  async lookup(req: FmpRequest): Promise<FmpResult | null> {
    console.log(`[FMP:Web] Fallback triggered. Executing web price discovery for "${req.itemName}"`);

    try {
      const targetCurrency = (req.currency || "USD").toUpperCase();
      const searchQuery = this.buildSearchQuery(req);

      const scrapedListings = await scrapeMarketSuppliers(searchQuery, "", "", { limit: 40 });

      if (!scrapedListings || scrapedListings.length === 0) {
        console.log(`[FMP:Web] No scraped listings found for "${searchQuery}"`);
        return null;
      }

      const validListings = scrapedListings.filter(
        (s) => s.unitPrice != null && typeof s.unitPrice === "number" && s.unitPrice > 0
      );

      if (validListings.length === 0) {
        console.log(`[FMP:Web] Scraped listings returned but no priced items present`);
        return null;
      }

      const fullText = `${req.itemName} ${req.itemDescription || ""}`.toLowerCase();
      let minPriceThreshold = 0;
      if (/\b(motorcycle|bike|scooter|vehicle|automobile|car|truck|tractor)\b/i.test(fullText)) {
        minPriceThreshold = 10000;
      } else if (/\b(laptop|macbook|computer|desktop|server|generator|machinery|engine)\b/i.test(fullText)) {
        minPriceThreshold = 3000;
      }

      const filteredListings = validListings.filter((l) => (l.unitPrice || 0) >= minPriceThreshold);

      const pricesConsidered: number[] = [];
      const sourceUrls: string[] = [];
      let bestMatchTitle = "";
      let bestMatchIdentifier = "";
      let highestConfidence = 0;
      let exactMatchFound = false;

      for (const listing of filteredListings) {
        const evalResult = evaluateProductMatch(
          {
            itemName: req.itemName,
            itemDescription: req.itemDescription,
            brand: req.brand,
            model: req.model,
            sku: req.sku,
            gtin: req.gtin || req.upc || req.ean,
          },
          {
            title: listing.productTitle || req.itemName,
            brand: req.brand,
            model: req.model,
          }
        );

        if (evalResult.confidence > highestConfidence) {
          highestConfidence = evalResult.confidence;
          bestMatchTitle = listing.productTitle || req.itemName;
          bestMatchIdentifier = evalResult.matchedIdentifier;
          exactMatchFound = evalResult.isExactMatch;
        }

        let price = listing.unitPrice!;
        const sourceCurrency = String(listing.priceCurrency || "USD").toUpperCase();

        if (sourceCurrency !== targetCurrency) {
          try {
            price = await convertCurrency(price, sourceCurrency, targetCurrency);
          } catch (err: any) {
            console.warn(`[FMP:Web] Currency conversion failed for ${sourceCurrency}->${targetCurrency}:`, err?.message);
          }
        }

        pricesConsidered.push(price);
        if (listing.sourceUrl && !sourceUrls.includes(listing.sourceUrl)) {
          sourceUrls.push(listing.sourceUrl);
        }
      }

      if (pricesConsidered.length === 0) {
        return null;
      }

      const { fmp, cleanPrices } = calculateFmp(pricesConsidered, req.calculationMethod || "median");

      const uniqueDomains = Array.from(
        new Set(
          sourceUrls.map((url) => {
            try {
              return new URL(url).hostname;
            } catch {
              return url;
            }
          })
        )
      );

      const n = cleanPrices.length;
      let cv = 0;
      if (n >= 2 && fmp > 0) {
        const variance = cleanPrices.reduce((acc, p) => acc + (p - fmp) ** 2, 0) / n;
        cv = Math.sqrt(variance) / fmp;
      }
      const cvPenalty = Math.min(0.12, cv * 0.25);
      const dynamicConfidence = Math.round(Math.min(0.96, Math.max(0.80, highestConfidence - cvPenalty + Math.min(n, 10) * 0.010)) * 100) / 100;

      return {
        fmp,
        currency: targetCurrency,
        source: "web",
        confidence: dynamicConfidence,
        product_match: exactMatchFound,
        product_identifier: bestMatchIdentifier || req.gtin || req.sku || req.itemName,
        matched_product: bestMatchTitle || req.itemName,
        prices_considered: cleanPrices,
        source_urls: sourceUrls.slice(0, 10),
        retrieved_at: new Date().toISOString(),
        reasoning: `Web price discovery collected ${cleanPrices.length} listing prices across domains (${uniqueDomains.join(", ") || "web"}). Median FMP: ${targetCurrency} ${fmp}.`,
      };
    } catch (err: any) {
      console.warn("[FMP:Web] Lookup error:", err?.message || err);
      return null;
    }
  }

  private buildSearchQuery(req: FmpRequest): string {
    const parts: string[] = [];
    if (req.brand) parts.push(req.brand);
    if (req.model) parts.push(req.model);
    parts.push(req.itemName);

    if (req.itemDescription && req.itemDescription.trim() && req.itemDescription.trim() !== req.itemName.trim()) {
      const descTokens = req.itemDescription
        .replace(/[^a-zA-Z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !parts.some((p) => p.toLowerCase().includes(w.toLowerCase())));
      if (descTokens.length > 0) {
        parts.push(descTokens.slice(0, 3).join(" "));
      }
    }

    return parts.join(" ").trim();
  }
}

export class GovOpenDataProvider implements FmpProvider {
  name: FmpResult["source"] = "government_open_data";

  async lookup(req: FmpRequest): Promise<FmpResult | null> {
    console.log(`[FMP:GovOpenData] Fallback triggered. Checking government open data datasets for "${req.itemName}"`);

    const ogdApiKey = await propertiesService.getOgdApiKey();
    if (!ogdApiKey) {
      console.log("[FMP:GovOpenData] Missing OGD_INDIA_API_KEY in am_property_mst / environment variables");
      return null;
    }

    try {
      const targetCurrency = (req.currency || "USD").toUpperCase();

      const summary = await getOgdMandiPrices(req.itemName);

      if (!summary || !summary.avgModalPriceINRPerKg) {
        console.log(`[FMP:GovOpenData] No government dataset records found for commodity "${req.itemName}"`);
        return null;
      }

      let basePriceINR = summary.avgModalPriceINRPerKg;
      let finalFmp = basePriceINR;

      if (targetCurrency !== "INR") {
        try {
          finalFmp = await convertCurrency(basePriceINR, "INR", targetCurrency);
        } catch (err: any) {
          console.warn(`[FMP:GovOpenData] Currency conversion failed for INR->${targetCurrency}:`, err?.message);
        }
      }

      const samplePrices = summary.sampleMarkets.map((m) => {
        const inrKg = m.modalPrice / 100;
        return targetCurrency === "INR" ? inrKg : inrKg * (finalFmp / basePriceINR);
      });

      const pricesConsidered = samplePrices.length > 0 ? samplePrices : [finalFmp];
      const sourceUrl = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070`;

      return {
        fmp: Math.round(finalFmp * 100) / 100,
        currency: targetCurrency,
        source: "government_open_data",
        confidence: 0.70,
        product_match: true,
        product_identifier: `COMMODITY:${summary.commodity}`,
        matched_product: `${summary.commodity} (${summary.scopeName} Government Mandi Dataset)`,
        prices_considered: pricesConsidered.map((p) => Math.round(p * 100) / 100),
        source_urls: [sourceUrl],
        retrieved_at: new Date().toISOString(),
        reasoning: `Official government open data (data.gov.in) dataset retrieved. Commodity "${summary.commodity}" across ${summary.marketCount} markets. Latest arrival date: ${summary.latestArrivalDate}.`,
      };
    } catch (err: any) {
      console.warn("[FMP:GovOpenData] Lookup error:", err?.message || err);
      return null;
    }
  }
}

// ============================================================================
// Main FmpService Orchestration Class
// ============================================================================

export class FmpService {
  private providers: FmpProvider[];

  constructor(providers?: FmpProvider[]) {
    this.providers = providers || [
      new GoogleMerchantProvider(),
      new WebPriceProvider(),
      new GovOpenDataProvider(),
    ];
  }

  async getFairMarketPrice(req: FmpRequest): Promise<FmpResult> {
    const targetCurrency = (req.currency || "USD").toUpperCase();
    const startTime = Date.now();

    console.log(`[FmpService] Starting FMP retrieval for "${req.itemName}" (Target Currency: ${targetCurrency})`);

    for (const provider of this.providers) {
      try {
        console.log(`[FmpService] Trying provider: ${provider.name}`);
        const result = await provider.lookup(req);

        if (result && result.fmp != null && result.fmp > 0) {
          const duration = Date.now() - startTime;
          console.log(
            `[FmpService] Success with provider "${result.source}". FMP: ${result.currency} ${result.fmp} (Confidence: ${result.confidence}, Elapsed: ${duration}ms)`
          );
          return result;
        }
      } catch (err: any) {
        console.warn(`[FmpService] Provider "${provider.name}" failed:`, err?.message || err);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[FmpService] All providers exhausted for "${req.itemName}". Returning unavailable result. Elapsed: ${duration}ms`);

    return {
      fmp: null,
      currency: targetCurrency,
      source: "unavailable",
      confidence: 0,
      product_match: false,
      product_identifier: req.gtin || req.sku || req.itemName,
      matched_product: req.itemName,
      prices_considered: [],
      source_urls: [],
      retrieved_at: new Date().toISOString(),
      reasoning: "No reliable Fair Market Price (FMP) available across Google Merchant API, Web price discovery, or Government open data datasets.",
    };
  }
}

export const fmpService = new FmpService();
