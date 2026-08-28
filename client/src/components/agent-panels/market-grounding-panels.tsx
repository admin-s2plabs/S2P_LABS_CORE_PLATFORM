// Shared presentational panels for the real-market-grounding pipeline
// (Fair Market Price, Local Suppliers, Cost Waterfall, Spend Trend) plus the
// shared "AI Reasoning / AI Cost Intelligence" insight box. Originally built
// for the Cost Intelligence agent; the grounding pipeline that populates this
// data now lives in negotiation-agent-service.ts, and both agent dashboards
// render it via these components. Presentational only — callers pass
// already-normalized data, no fallback synthesis here.
//
// Styled per intel-theme.ts (flat cards, Google Sans, navy/steel/sky accents)
// — light-theme only, matching the Figma reference these two agent pages are
// ported from; no dark: variants here by design.
import { useMemo, useState } from "react";
import {
  MapPin,
  Building2,
  ExternalLink,
  Check,
  Star,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { INTEL_COLOR, INTEL_FONT } from "./intel-theme";

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  AED: "AED ",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
};

export function formatAxisValue(val: number, symbol: string = "$") {
  if (val >= 1000000) return `${symbol}${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${symbol}${(val / 1000).toFixed(0)}k`;
  return `${symbol}${val}`;
}

export interface FairMarketPriceData {
  price: number;
  rangeMin: number;
  rangeMax: number;
  dataSources: Array<{
    name: string;
    weightPercent: number;
    description: string;
    rangeMin: number;
    rangeMax: number;
  }>;
  // Both optional: cost-intelligence computes these client-side from
  // quantity/orderFrequency (annual purchase volume) before passing the prop;
  // callers without that context (e.g. negotiation, a one-off bid) can omit
  // them and the panel derives premiumPercent itself / hides annual overpayment.
  premiumPercent?: number;
  annualOverpayment?: number;
}

export function FairMarketPricePanel({
  fairMarketPrice: fmp,
  quotePrice,
  currencySymbol,
}: {
  fairMarketPrice: FairMarketPriceData;
  quotePrice: number;
  currencySymbol: string;
}) {
  // LLM-produced JSON can arrive with null/missing numbers when the server
  // grounding pass found no real listings to override them — nothing to show.
  if (fmp?.price == null || fmp.rangeMin == null || fmp.rangeMax == null || !Array.isArray(fmp.dataSources)) {
    return null;
  }
  const domainMin = Math.min(fmp.rangeMin, quotePrice) * 0.88;
  const domainMax = Math.max(fmp.rangeMax, quotePrice) * 1.12;
  const getPct = (val: number) => {
    if (domainMax <= domainMin) return 50;
    const pct = ((val - domainMin) / (domainMax - domainMin)) * 100;
    return Math.max(4, Math.min(96, pct));
  };

  const rangeLeft = getPct(fmp.rangeMin);
  const rangeRight = getPct(fmp.rangeMax);
  const rangeWidth = Math.max(6, rangeRight - rangeLeft);
  const fmpTickPos = getPct(fmp.price);
  const quoteTickPos = getPct(quotePrice);
  const premiumPercent = fmp.premiumPercent ?? (fmp.price > 0 ? parseFloat((((quotePrice - fmp.price) / fmp.price) * 100).toFixed(1)) : 0);

  return (
    <Card className="bg-white border border-[#ebebeb] rounded-lg p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="font-['Google_Sans'] text-[9px] tracking-[0.12em] text-[#555555] uppercase font-medium">
          Fair Market Price
        </p>
        <span className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em]">Weighted Calculation</span>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-12 gap-5 items-center">
        <div className="@2xl:col-span-4 space-y-1.5">
          <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.09em]">
            Weighted Fair Market Price
          </p>
          <div className="font-['Google_Sans'] text-3xl font-semibold tracking-tight text-[#1a1a18]">
            {currencySymbol}{fmp.price.toLocaleString()}
          </div>
          <p className="font-['Google_Sans'] text-[10px] text-[#888888]">
            Range: {currencySymbol}{fmp.rangeMin.toLocaleString()} – {currencySymbol}{fmp.rangeMax.toLocaleString()} · {fmp.dataSources.length} data sources
          </p>
        </div>

        <div className="@2xl:col-span-5 space-y-1.5">
          <div className="flex justify-between items-center font-['Google_Sans'] text-[9px] text-[#888888] uppercase tracking-[0.07em]">
            <span>Your Price vs Fair Market</span>
            <span className="text-right leading-tight">
              <span className="block text-[11px] font-semibold text-[#1a1a18] normal-case tracking-normal">
                {currencySymbol}{fmp.rangeMin.toLocaleString()} – {currencySymbol}{fmp.rangeMax.toLocaleString()}
              </span>
              <span className="text-[#bbbbbb]">Range</span>
            </span>
          </div>
          <div className="relative h-20 w-full bg-[#f4f4f2] rounded-lg px-3 my-1">
            <div
              className="absolute top-[26px] h-6 rounded-[5px] bg-[#e2e2df] border border-[#1a1a18]"
              style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%`, opacity: 0.7 }}
            />
            <div className="absolute top-0 flex flex-col items-center z-10" style={{ left: `${fmpTickPos}%`, transform: "translateX(-50%)" }}>
              <span className="font-['Google_Sans'] text-[9px] font-semibold text-[#1a1a18] whitespace-nowrap bg-[#f0f0ee] border border-[#1a1a18] rounded px-[7px] py-[3px]">
                FMP {currencySymbol}{fmp.price}
              </span>
              <span className="w-[1.5px] h-[6px] bg-[#1a1a18]" />
              <span className="w-[1.5px] h-11 bg-[#1a1a18]" />
            </div>
            <div className="absolute top-[26px] flex flex-col items-center z-10" style={{ left: `${quoteTickPos}%`, transform: "translateX(-50%)" }}>
              <span className="w-[1.5px] h-7 bg-[#f59e0b]" />
              <span className="font-['Google_Sans'] text-[9px] font-semibold text-[#f59e0b] whitespace-nowrap bg-white border border-[#f59e0b] rounded px-2 py-[3px] mt-0.5">
                Your Price {currencySymbol}{quotePrice}
              </span>
            </div>
          </div>
        </div>

        <div className="@2xl:col-span-3 border-t @2xl:border-t-0 @2xl:border-l border-[#ebebeb] pt-3 @2xl:pt-0 @2xl:pl-5 space-y-2 text-right">
          <div>
            <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em]">Premium over FMP</p>
            <span className={`font-['Google_Sans'] text-[28px] font-bold ${premiumPercent > 0 ? "text-[#e53935]" : "text-[#43a047]"}`}>
              {premiumPercent > 0 ? "+" : ""}{premiumPercent}%
            </span>
          </div>
          {fmp.annualOverpayment != null && (
            <div>
              <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em]">Annual Overpayment</p>
              <p className="font-['Google_Sans'] text-sm font-semibold text-[#555555]">
                {currencySymbol}{fmp.annualOverpayment.toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Data Sources & Weighting — hidden in UI (not deleted) ───
          Of the 4 sources, only "Supplier RFQ Pool" is grounded server-side
          in live-scraped supplier listings (applyRealMarketPricing in
          negotiation-agent-service.ts); the other 3 (and every weightPercent)
          are LLM judgement calls that routinely collapse to a fixed
          35/30/20/15 split with near-identical ranges instead of varying per
          product — see the KNOWN GAP comment above
          NEGOTIATION_AGENT_SYSTEM_PROMPT in negotiation-agent-service.ts.
          Hidden until that's fixed; re-enable by uncommenting below.

      <div className="border-t border-[#ebebeb] pt-4 space-y-3">
        <p className="font-['Google_Sans'] text-[9px] tracking-[0.12em] text-[#bbbbbb] uppercase">
          Data Sources & Weighting
        </p>
        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-2.5">
          {fmp.dataSources.map((ds, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2.5 rounded-md border border-[#ebebeb] bg-[#fafafa]"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="flex flex-col items-center flex-shrink-0">
                  <span className="font-['Google_Sans'] text-[11px] font-bold text-[#1a1a18]">
                    {ds.weightPercent}%
                  </span>
                  <div className="w-10 h-1.5 bg-[#ebebeb] rounded-full overflow-hidden mt-0.5">
                    <div className="bg-[#1e3a5f] h-full" style={{ width: `${ds.weightPercent}%` }} />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-['Google_Sans'] text-xs font-semibold text-[#1a1a18] truncate">{ds.name}</p>
                  <p className="font-['Google_Sans'] text-[10px] text-[#888888] truncate">{ds.description}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-['Google_Sans'] text-xs font-bold text-[#1a1a18]">
                  {currencySymbol}{ds.rangeMin.toLocaleString()} – {currencySymbol}{ds.rangeMax.toLocaleString()}
                </p>
                <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase">Market Range</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      */}
    </Card>
  );
}

export interface LocalSupplierData {
  name: string;
  type: string;
  location: string;
  unitPrice: number | null;
  priceUnit: string | null;
  priceCurrency: string;
  moq: number | null;
  rating: number | null;
  verified: boolean;
  source: "web" | "estimated";
  sourceUrl: string;
  deltaPercent: number | null;
  bestPrice: boolean;
}

export function LocalSuppliersPanel({
  localSuppliers,
  localSuppliersNear,
}: {
  localSuppliers: LocalSupplierData[];
  localSuppliersNear: string;
}) {
  if (!localSuppliers || localSuppliers.length === 0) return null;

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.12em] flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-[#999999]" />
          Local Suppliers — Near {localSuppliersNear}
        </p>
        <span className="font-['Google_Sans'] text-[9px] text-[#bbbbbb]">{localSuppliers.length} identified</span>
      </div>

      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
        {localSuppliers.map((supp, idx) => {
          const starCount = supp.rating != null ? Math.round(supp.rating) : 0;
          const best = supp.bestPrice;
          return (
            <div
              key={idx}
              className={`rounded-lg p-4 ${best ? "bg-[#1a1a18] border border-[#1a1a18]" : "bg-white border border-[#ebebeb]"}`}
            >
              <div className="flex items-start justify-between mb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${best ? "bg-white/10" : "bg-[#f0f0ee]"}`}>
                    <Building2 className={`h-[15px] w-[15px] ${best ? "text-white/60" : "text-[#888888]"}`} />
                  </div>
                  <div className="min-w-0">
                    {supp.sourceUrl ? (
                      <a
                        href={supp.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-['Google_Sans'] text-xs font-medium hover:underline flex items-center gap-1 truncate ${best ? "text-white" : "text-[#1a1a18]"}`}
                      >
                        <span className="truncate">{supp.name}</span>
                        <ExternalLink className="h-3 w-3 inline flex-shrink-0 opacity-70" />
                      </a>
                    ) : (
                      <h4 className={`font-['Google_Sans'] text-xs font-medium truncate ${best ? "text-white" : "text-[#1a1a18]"}`}>{supp.name}</h4>
                    )}
                    <p className={`font-['Google_Sans'] text-[9px] mt-0.5 ${best ? "text-white/45" : "text-[#bbbbbb]"}`}>{supp.type}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end flex-shrink-0">
                  {supp.source === "web" && (
                    <span className="font-['Google_Sans'] text-[9px] text-[#43a047] border border-[#c8e6c9] bg-[#f1f8f1] rounded px-1.5 py-0.5 flex items-center gap-0.5">
                      <Check className="h-2.5 w-2.5" /> Verified
                    </span>
                  )}
                  {supp.source === "estimated" && (
                    <span className={`font-['Google_Sans'] text-[9px] rounded px-1.5 py-0.5 border ${best ? "text-white/50 border-white/20" : "text-[#888888] border-[#ebebeb]"}`}>
                      Estimated
                    </span>
                  )}
                  {best && (
                    <span className="font-['Google_Sans'] text-[9px] text-white/60 border border-white/20 rounded px-1.5 py-0.5">
                      Best Price
                    </span>
                  )}
                </div>
              </div>

              <div className={`flex items-center gap-1.5 mb-2.5 font-['Google_Sans'] text-[10px] ${best ? "text-white/45" : "text-[#888888]"}`}>
                <MapPin className={`h-2.5 w-2.5 flex-shrink-0 ${best ? "text-white/35" : "text-[#bbbbbb]"}`} />
                <span className="truncate">{supp.location}</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                <div className={`rounded-md p-1.5 text-center border ${best ? "bg-white/[0.07] border-white/10" : "bg-[#fafafa] border-[#f0f0f0]"}`}>
                  <div className={`font-['Google_Sans'] text-xs font-medium ${best ? "text-white" : "text-[#1a1a18]"}`}>
                    {supp.unitPrice != null
                      ? `${CURRENCY_SYMBOLS[String(supp.priceCurrency || "USD").toUpperCase()] || "$"}${supp.unitPrice}${supp.priceUnit || ""}`
                      : "—"}
                  </div>
                  <div className={`font-['Google_Sans'] text-[8px] uppercase tracking-[0.06em] mt-0.5 ${best ? "text-white/35" : "text-[#bbbbbb]"}`}>Unit Price</div>
                </div>
                <div className={`rounded-md p-1.5 text-center border ${best ? "bg-white/[0.07] border-white/10" : "bg-[#fafafa] border-[#f0f0f0]"}`}>
                  <div className={`font-['Google_Sans'] text-xs font-medium ${best ? "text-white" : "text-[#1a1a18]"}`}>
                    {supp.moq != null ? supp.moq.toLocaleString() : "—"}
                  </div>
                  <div className={`font-['Google_Sans'] text-[8px] uppercase tracking-[0.06em] mt-0.5 ${best ? "text-white/35" : "text-[#bbbbbb]"}`}>MOQ</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className="h-2.5 w-2.5"
                      style={{ color: n <= starCount ? "#b45309" : (best ? "rgba(255,255,255,0.2)" : "#e5e5e5"), fill: n <= starCount ? "#b45309" : "none" }}
                    />
                  ))}
                  <span className={`font-['Google_Sans'] text-[10px] ml-1 ${best ? "text-white/40" : "text-[#bbbbbb]"}`}>
                    {supp.rating != null ? supp.rating.toFixed(1) : "N/A"}
                  </span>
                </div>

                {supp.deltaPercent != null ? (
                  supp.deltaPercent < 0 ? (
                    <span className="font-['Google_Sans'] text-[10px] font-medium text-[#43a047]">↓ {Math.abs(supp.deltaPercent)}% below your price</span>
                  ) : supp.deltaPercent > 0 ? (
                    <span className="font-['Google_Sans'] text-[10px] font-medium text-[#e53935]">↑ {supp.deltaPercent}% above your price</span>
                  ) : (
                    <span className={`font-['Google_Sans'] text-[10px] font-medium ${best ? "text-white/40" : "text-[#888888]"}`}>At your price</span>
                  )
                ) : (
                  <span className={`font-['Google_Sans'] text-[10px] ${best ? "text-white/30" : "text-[#bbbbbb]"}`}>No price baseline</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Shared "AI Reasoning / AI Cost Intelligence" summary box. The two agents
// use slightly different treatments in the reference itself: Negotiation
// gets a left accent border + a confidence/savings footer; Cost Intelligence
// gets an icon box with neither. `accentBorder` / `footer` switch between them.
export function AiInsightPanel({
  label,
  text,
  accentBorder,
  footer,
}: {
  label: string;
  text: string;
  accentBorder?: boolean;
  footer?: { confidenceLabel: string; dotColor: string; savingsText: string };
}) {
  if (!text) return null;

  if (accentBorder) {
    return (
      <Card className="bg-white border border-[#ebebeb] rounded-lg p-[18px_20px]" style={{ borderLeft: "3px solid #1a1a18" }}>
        <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em] mb-3">{label}</p>
        <p className="font-['Google_Sans'] text-[13px] leading-[1.8] text-[#333333]">{text}</p>
        {footer && (
          <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-[#f0f0f0]">
            <div className="flex items-center gap-1.5">
              <span className="font-['Google_Sans'] text-[10px] text-[#888888]">{footer.confidenceLabel}</span>
            </div>
            <span className="font-['Google_Sans'] text-[10px] font-medium text-[#43a047]">{footer.savingsText}</span>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className="bg-[#fafafa] border border-[#ebebeb] rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-white border border-[#ebebeb] flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-4 w-4 text-[#1a1a18]" strokeWidth={1.75} />
        </div>
        <div className="space-y-1 flex-1">
          <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.08em] font-medium">{label}</p>
          <p className="font-['Google_Sans'] text-xs leading-relaxed text-[#333333]">{text}</p>
        </div>
      </div>
    </Card>
  );
}

export function CostWaterfallChart({
  costStructure,
  currencySymbol,
}: {
  costStructure: Array<{ component: string; cost: number }>;
  currencySymbol: string;
}) {
  if (!costStructure || costStructure.length === 0) return null;

  return (
    <Card className="bg-white border border-[#ebebeb] rounded-lg p-5">
      <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em] mb-4">
        Cost Waterfall
      </p>
      <div className="h-[220px] w-full pr-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={costStructure} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="component" tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }}
              tickFormatter={(val) => `${currencySymbol}${val}`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "#f9f9f9" }}
              contentStyle={{ fontFamily: INTEL_FONT, fontSize: "10px", borderRadius: "6px", border: "1px solid #ebebeb" }}
              formatter={(val: any) => [`${currencySymbol}${parseFloat(val).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" radius={[3, 3, 0, 0]}>
              {costStructure.map((entry, index) => {
                const isFinal =
                  index === costStructure.length - 1 ||
                  entry.component.toLowerCase().includes("your") ||
                  entry.component.toLowerCase().includes("price") ||
                  entry.component.toLowerCase().includes("final");
                const isProfit = entry.component.toLowerCase().includes("profit") || entry.component.toLowerCase().includes("margin");
                let barColor: string = INTEL_COLOR.navy;
                if (isFinal) barColor = "#d4d4d2";
                else if (isProfit) barColor = INTEL_COLOR.amber;
                return <Cell key={`cell-${index}`} fill={barColor} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

const SPEND_TREND_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatSpendTrendMonth(ms: number) {
  const d = new Date(ms);
  return `${SPEND_TREND_MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

const SPEND_TREND_RANGE_OPTIONS = [1, 3, 6, 9, 12];

export function SpendTrendChart({
  spendTrend,
  hasPurchaseHistory,
  currencySymbol,
  potentialSavings,
  title = "Spend Comparison – Current vs Market",
  xAxisMode = "category"
}: {
  spendTrend: Array<{ name: string; current: number | null; spend: number | null; market: number | null; date?: number; poNumber?: string; supplier?: string }>;
  hasPurchaseHistory: boolean;
  currencySymbol: string;
  potentialSavings?: number;
  title?: string;
  xAxisMode?: "category" | "time";
}) {
  const isTimeMode = xAxisMode === "time";

  const [rangeMonths, setRangeMonths] = useState(12);

  // Client-side range filter (time mode only): the backend always ships the
  // full trailing-12-month series; narrower ranges rebuild the two flat
  // CURRENT boundary rows at the new window start and keep only the in-window
  // MARKET wave points and real PO spend points.
  const displayTrend = useMemo(() => {
    if (!isTimeMode || rangeMonths >= 12 || !spendTrend || spendTrend.length === 0) return spendTrend;
    const end = Math.max(...spendTrend.map((p) => p.date ?? 0));
    const start = new Date(end);
    start.setMonth(start.getMonth() - rangeMonths);
    const startMs = start.getTime();
    const current = spendTrend.find((p) => p.current != null)?.current ?? null;
    return [
      { date: startMs, name: formatSpendTrendMonth(startMs), current, market: null, spend: null },
      ...spendTrend.filter((p) => (p.spend != null || p.market != null) && (p.date ?? 0) >= startMs),
      { date: end, name: formatSpendTrendMonth(end), current, market: null, spend: null },
    ];
  }, [spendTrend, rangeMonths, isTimeMode]);

  if (!spendTrend || spendTrend.length === 0) return null;
  const showSpend = hasPurchaseHistory && (!isTimeMode || displayTrend.some((p) => p.spend != null));

  return (
    <Card className="bg-white border border-[#ebebeb] rounded-lg p-5">
      <div className="flex justify-between items-center mb-4 gap-2">
        <p className="font-['Google_Sans'] text-[9px] text-[#bbbbbb] uppercase tracking-[0.1em]">
          {title}
        </p>
        {isTimeMode && (
          <div className="flex items-center gap-1">
            {SPEND_TREND_RANGE_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => setRangeMonths(m)}
                className={`font-['Google_Sans'] text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
                  rangeMonths === m
                    ? "bg-[#1a1a18] text-white border-[#1a1a18]"
                    : "text-[#bbbbbb] border-[#ebebeb] hover:text-[#666666]"
                }`}
              >
                {m}M
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-[180px] w-full pr-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={displayTrend} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#f0f0f0" />
            {isTimeMode ? (
              <XAxis
                dataKey="date"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatSpendTrendMonth}
              />
            ) : (
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }} axisLine={false} tickLine={false} />
            )}
            <YAxis
              tick={{ fontSize: 9, fill: "#bbbbbb", fontFamily: INTEL_FONT }}
              tickFormatter={(val) => formatAxisValue(val, currencySymbol)}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontFamily: INTEL_FONT, fontSize: "10px", borderRadius: "6px", border: "1px solid #ebebeb" }}
              labelFormatter={isTimeMode ? (ms: number) => new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : undefined}
              formatter={(val: any, name: string, entry: any) => {
                const formatted = `${currencySymbol}${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                if (isTimeMode && name === "SPEND" && entry?.payload?.poNumber) {
                  return [`${formatted} · PO ${entry.payload.poNumber}${entry.payload.supplier ? ` · ${entry.payload.supplier}` : ""}`, name];
                }
                return [formatted, name];
              }}
            />
            <Line type="monotone" dataKey="current" name="CURRENT" stroke="#e53935" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
            <Line type="monotone" dataKey="market" name="MARKET" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
            {showSpend && (
              <Line type="monotone" dataKey="spend" name="SPEND" stroke="#2d6a8f" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between items-center mt-2 border-t pt-3 border-[#ebebeb]">
        <div className="flex items-center gap-4 font-['Google_Sans'] text-[9px] font-medium text-[#888888]">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#e53935] inline-block"></span>
            <span>CURRENT</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#f59e0b] inline-block"></span>
            <span>MARKET</span>
          </div>
          {showSpend && (
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-[#2d6a8f] inline-block"></span>
              <span>SPEND</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 font-['Google_Sans'] text-[10px] font-bold text-[#16a34a]">
          {hasPurchaseHistory && potentialSavings != null && potentialSavings > 0 && (
            <>
              <span>↘</span>
              <span>{currencySymbol}{potentialSavings.toLocaleString()} savings potential</span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
