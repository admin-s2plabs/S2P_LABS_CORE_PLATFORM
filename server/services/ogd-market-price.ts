// Open Government Data (data.gov.in) client for the Cost Intelligence agent.
// Dataset: "Current Daily Price of Various Commodities from Various Markets
// (Mandi)" — Ministry of Agriculture, refreshed daily. Real wholesale prices
// in INR per quintal (100 kg) with per-market records:
//   state, district, market, commodity, variety, grade, arrival_date,
//   min_price, max_price, modal_price
//
// Scope limit: the dataset covers agricultural/food commodities only.
// Industrial items return zero records → null, and callers proceed with the
// standard estimation path. Never throws.

import { propertiesService } from "./propertiesService";

const OGD_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const OGD_BASE_URL = `https://api.data.gov.in/resource/${OGD_RESOURCE_ID}`;

export interface OgdMandiPriceSummary {
  commodity: string;
  scope: "district" | "state" | "national";
  scopeName: string; // e.g. "Hyderabad" | "Telangana" | "India"
  marketCount: number;
  avgModalPriceINRPerQuintal: number;
  minPriceINRPerQuintal: number;
  maxPriceINRPerQuintal: number;
  avgModalPriceINRPerKg: number; // convenience for unit conversion
  latestArrivalDate: string;
  sampleMarkets: Array<{ market: string; district: string; state: string; modalPrice: number }>;
}

interface OgdRecord {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  arrival_date?: string;
  min_price?: number | string;
  max_price?: number | string;
  modal_price?: number | string;
}

interface CacheEntry {
  timestamp: number;
  data: OgdMandiPriceSummary | null;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — dataset refreshes daily
const cache = new Map<string, CacheEntry>();

// API keyword filters are exact-match and Title Cased ("Onion", "Telangana").
function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

async function fetchRecords(commodity: string, extraFilter?: { key: "state" | "district"; value: string }): Promise<OgdRecord[]> {
  const apiKey = await propertiesService.getOgdApiKey();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    "api-key": apiKey,
    format: "json",
    limit: "100",
  });
  params.set("filters[commodity]", titleCase(commodity));
  if (extraFilter) params.set(`filters[${extraFilter.key}]`, titleCase(extraFilter.value));

  const res = await fetch(`${OGD_BASE_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.warn(`[OgdMarketPrice] data.gov.in HTTP ${res.status} for commodity "${commodity}"`);
    return [];
  }
  const body: any = await res.json();
  return Array.isArray(body?.records) ? body.records : [];
}

function summarize(
  commodity: string,
  records: OgdRecord[],
  scope: "district" | "state" | "national",
  scopeName: string
): OgdMandiPriceSummary | null {
  const rows = records
    .map((r) => ({
      state: String(r.state || ""),
      district: String(r.district || ""),
      market: String(r.market || ""),
      arrivalDate: String(r.arrival_date || ""),
      minPrice: Number(r.min_price),
      maxPrice: Number(r.max_price),
      modalPrice: Number(r.modal_price),
    }))
    .filter((r) => isFinite(r.modalPrice) && r.modalPrice > 0);
  if (rows.length === 0) return null;

  const avg = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;
  const avgModal = Math.round(avg(rows.map((r) => r.modalPrice)) * 100) / 100;
  const minPrice = Math.min(...rows.map((r) => (isFinite(r.minPrice) && r.minPrice > 0 ? r.minPrice : r.modalPrice)));
  const maxPrice = Math.max(...rows.map((r) => (isFinite(r.maxPrice) && r.maxPrice > 0 ? r.maxPrice : r.modalPrice)));

  // arrival_date is DD/MM/YYYY — sort by ISO-ified value for "latest".
  const toIso = (d: string) => {
    const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
  };
  const latestArrivalDate = rows.map((r) => r.arrivalDate).sort((a, b) => toIso(b).localeCompare(toIso(a)))[0] || "";

  return {
    commodity: titleCase(commodity),
    scope,
    scopeName,
    marketCount: new Set(rows.map((r) => `${r.market}|${r.district}`)).size,
    avgModalPriceINRPerQuintal: avgModal,
    minPriceINRPerQuintal: minPrice,
    maxPriceINRPerQuintal: maxPrice,
    avgModalPriceINRPerKg: Math.round(avgModal) / 100,
    latestArrivalDate,
    sampleMarkets: rows.slice(0, 5).map((r) => ({
      market: r.market,
      district: r.district,
      state: r.state,
      modalPrice: r.modalPrice,
    })),
  };
}

export async function getOgdMandiPrices(
  commodity: string,
  state?: string,
  district?: string
): Promise<OgdMandiPriceSummary | null> {
  const cleanCommodity = (commodity || "").trim();
  if (!cleanCommodity) return null;
  const apiKey = await propertiesService.getOgdApiKey();
  if (!apiKey) {
    console.warn("[OgdMarketPrice] OGD_INDIA_API_KEY not set in am_property_mst or environment — skipping government price lookup");
    return null;
  }

  const cleanState = (state || "").trim();
  const cleanDistrict = (district || "").trim();
  const cacheKey = `${cleanCommodity.toLowerCase()}|${cleanState.toLowerCase()}|${cleanDistrict.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

  try {
    // Narrowest scope with data wins: district (delivery city often IS a
    // district — e.g. Hyderabad) → state → national.
    let summary: OgdMandiPriceSummary | null = null;

    if (cleanDistrict) {
      const recs = await fetchRecords(cleanCommodity, { key: "district", value: cleanDistrict });
      summary = summarize(cleanCommodity, recs, "district", titleCase(cleanDistrict));
    }
    if (!summary && cleanState) {
      const recs = await fetchRecords(cleanCommodity, { key: "state", value: cleanState });
      summary = summarize(cleanCommodity, recs, "state", titleCase(cleanState));
    }
    if (!summary) {
      const recs = await fetchRecords(cleanCommodity);
      summary = summarize(cleanCommodity, recs, "national", "India");
    }

    cache.set(cacheKey, { timestamp: Date.now(), data: summary });
    return summary;
  } catch (err: any) {
    console.warn(`[OgdMarketPrice] lookup failed for "${cleanCommodity}":`, err?.message || err);
    return null;
  }
}
