import { Calculator, ChevronDown, DollarSign, FileText, ShoppingCart, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

const INDUSTRY_RATES: Record<string, number> = {
  "Manufacturing": 0.06,
  "Retail / E-commerce": 0.05,
  "Healthcare": 0.04,
  "IT / Services": 0.05,
  "Construction": 0.07,
  "Other": 0.04,
};

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD - US Dollar" },
  { code: "EUR", symbol: "€", label: "EUR - Euro" },
  { code: "GBP", symbol: "£", label: "GBP - British Pound" },
  { code: "INR", symbol: "₹", label: "INR - Indian Rupee" },
  { code: "AED", symbol: "د.إ", label: "AED - UAE Dirham" },
  { code: "SGD", symbol: "S$", label: "SGD - Singapore Dollar" },
];

function formatNumber(n: number, symbol: string): string {
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${symbol}${(n / 1_000).toFixed(1)}K`;
  return `${symbol}${n.toFixed(0)}`;
}

export function ROICalculatorPage() {
  const [currency, setCurrency] = useState("USD");
  const [industry, setIndustry] = useState("Manufacturing");
  const [spend, setSpend] = useState("");
  const [invoices, setInvoices] = useState("");
  const [pos, setPos] = useState("");

  const sym = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$";

  const results = useMemo(() => {
    const s = parseFloat(spend.replace(/,/g, "")) || 0;
    const inv = parseFloat(invoices.replace(/,/g, "")) || 0;
    const p = parseFloat(pos.replace(/,/g, "")) || 0;
    const rate = INDUSTRY_RATES[industry] ?? 0.05;

    const spendSavings = s * rate;
    const invoiceSavings = inv * 15;
    const poSavings = p * 10;
    const total = spendSavings + invoiceSavings + poSavings;

    return { spendSavings, invoiceSavings, poSavings, total, hasData: s > 0 || inv > 0 || p > 0 };
  }, [spend, invoices, pos, industry, currency]);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-50 rounded-full mb-5 uppercase tracking-wider">ROI Calculator</span>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            Calculate Your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Procurement Savings</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Estimate how much your organization can save by automating procurement with our S2P platform.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Inputs */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-violet-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Your Organisation Details</h2>
              </div>

              <div className="space-y-5">
                {/* Currency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                  <div className="relative">
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full appearance-none px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm bg-white pr-10"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Industry */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
                  <div className="relative">
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full appearance-none px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm bg-white pr-10"
                    >
                      {Object.keys(INDUSTRY_RATES).map((ind) => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Estimated savings rate: <span className="font-semibold text-violet-600">{(INDUSTRY_RATES[industry] * 100).toFixed(0)}% of spend</span>
                  </p>
                </div>

                {/* Annual Spend */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-gray-400" /> Annual Procurement Spend ({sym})</span>
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. ${sym}5,000,000`}
                    value={spend}
                    onChange={(e) => setSpend(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  />
                </div>

                {/* Invoices */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-gray-400" /> Number of Invoices per Year</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2,000"
                    value={invoices}
                    onChange={(e) => setInvoices(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Saves ~{sym}15 per invoice processed automatically</p>
                </div>

                {/* POs */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5 text-gray-400" /> Number of Purchase Orders per Year</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 500"
                    value={pos}
                    onChange={(e) => setPos(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Saves ~{sym}10 per PO through automation</p>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-4">
              {/* Total savings card */}
              <div className={`rounded-2xl p-8 text-center transition-all ${results.hasData ? "bg-gradient-to-br from-violet-600 to-teal-500 text-white shadow-lg shadow-violet-200" : "bg-white border border-gray-100"}`}>
                <div className={`flex items-center justify-center gap-2 mb-2 ${results.hasData ? "text-white/80" : "text-gray-400"} text-sm font-medium`}>
                  <TrendingUp className="w-4 h-4" />
                  Estimated Annual Savings
                </div>
                <div className={`text-5xl font-extrabold mb-1 ${results.hasData ? "text-white" : "text-gray-300"}`}>
                  {results.hasData ? formatNumber(results.total, sym) : `${sym}0`}
                </div>
                {!results.hasData && (
                  <p className="text-sm text-gray-400 mt-2">Enter your details to see your savings estimate</p>
                )}
              </div>

              {/* Breakdown */}
              {results.hasData && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-4">Savings Breakdown</h3>

                  <div className="flex items-center justify-between py-3 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-violet-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">Procurement Spend Savings</p>
                        <p className="text-xs text-gray-400">{(INDUSTRY_RATES[industry] * 100).toFixed(0)}% of annual spend</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-violet-600">{formatNumber(results.spendSavings, sym)}</span>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
                        <FileText className="w-4 h-4 text-teal-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">Invoice Processing Savings</p>
                        <p className="text-xs text-gray-400">{sym}15 × {parseInt(invoices.replace(/,/g, "")) || 0} invoices</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-teal-600">{formatNumber(results.invoiceSavings, sym)}</span>
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                        <ShoppingCart className="w-4 h-4 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">Purchase Order Savings</p>
                        <p className="text-xs text-gray-400">{sym}10 × {parseInt(pos.replace(/,/g, "")) || 0} POs</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-orange-600">{formatNumber(results.poSavings, sym)}</span>
                  </div>

                  <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-gray-900">Total Annual Savings</span>
                    <span className="text-lg font-extrabold text-violet-600">{formatNumber(results.total, sym)}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center px-2">
                * Estimates are based on industry benchmarks. Actual savings may vary depending on your procurement complexity and adoption rate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why it works */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-10">How S2P Labs Delivers These Savings</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: "Spend Optimisation", desc: "Data-driven sourcing, competitive bidding, contract compliance, and maverick spend detection reduce your total procurement cost.", color: "bg-violet-50 text-violet-600" },
              { title: "Invoice Automation", desc: "OCR + 3-way matching eliminates manual invoice processing. Fewer errors, faster approvals, reduced labor cost per invoice.", color: "bg-teal-50 text-teal-600" },
              { title: "PO Efficiency", desc: "Automated PR-to-PO conversion, approval workflows, and budget controls shrink the time and cost of every purchase order.", color: "bg-orange-50 text-orange-600" },
            ].map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-2xl p-6 text-left">
                <div className={`w-10 h-10 ${item.color} rounded-xl flex items-center justify-center mb-4`}>
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
