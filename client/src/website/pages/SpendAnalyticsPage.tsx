import { AlertCircle, ArrowRight, BarChart3, DollarSign, Lightbulb, PieChart, Target, TrendingDown } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { CommonShortForm } from "../components/CommonShortForm";
import { LogoBlack } from "../components/LogoImport";

export function SpendAnalyticsPage() {
  const features = [
    { icon: BarChart3, title: "Real-Time Dashboards", description: "Visual spend analytics across categories, vendors, and departments", color: "bg-violet-50 text-violet-600" },
    { icon: TrendingDown, title: "Savings Opportunities", description: "AI identifies consolidation and negotiation opportunities", color: "bg-teal-50 text-teal-600" },
    { icon: Target, title: "Maverick Spend Detection", description: "Automatically detect and flag off-contract spending", color: "bg-red-50 text-red-600" },
    { icon: PieChart, title: "Category Analysis", description: "Deep insights into spending patterns by category", color: "bg-teal-50 text-teal-600" },
    { icon: DollarSign, title: "Budget Tracking", description: "Monitor budgets in real-time with alerts and forecasts", color: "bg-blue-50 text-blue-600" },
    { icon: Lightbulb, title: "Predictive Analytics", description: "Forecast future spend and identify trends early", color: "bg-amber-50 text-amber-600" },
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="Spend Analytics Software | Prokraya" />
        <meta property="og:description" content="Transform procurement data into actionable insights with AI-powered spend analytics, savings identification, and spend optimization." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/spend-analytics" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>Spend Analytics Software | Procurement Spend Analysis Platform | Prokraya</title>
        <meta name="description" content="Gain complete spend visibility with AI-powered spend analytics software. Identify savings opportunities, detect maverick spend, optimize supplier performance, and improve procurement decisions." />
        <meta name="keywords" content="spend analytics software, procurement spend analytics, spend analysis software, spend management software, procurement analytics, maverick spend detection, spend visibility, procurement intelligence" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-teal-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0d948808_1px,transparent_1px),linear-gradient(to_bottom,#0d948808_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-50 rounded-full mb-5 uppercase tracking-wider">Spend Analytics</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Spend Analytics{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-violet-500">Software</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
              Transform spending data into actionable insights with AI-powered analytics. Identify savings opportunities, detect maverick spend, and optimize procurement performance in real-time.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/book-demo" className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                Request Demo <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/contact-us" className="inline-flex items-center justify-center px-7 py-3 border border-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                Contact Sales
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-10 bg-gradient-to-r from-teal-600 via-teal-500 to-violet-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center text-white">
              {[
                { value: "15%", label: "Average Savings Identified" },
                { value: "100%", label: "Spend Visibility" },
                { value: "Real-Time", label: "Analytics" },
                { value: "AI-Powered", label: "Insights" },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="text-4xl font-extrabold mb-1">{stat.value}</div>
                  <div className="text-white/80 text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Powerful Spend Intelligence</h2>
              <p className="text-gray-500">Turn data into decisions with comprehensive analytics</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feature, index) => (
                <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md transition-all">
                  <div className={`w-11 h-11 ${feature.color} rounded-xl flex items-center justify-center mb-4`}>
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-500">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI Insights */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">AI-Powered Spend Analysis</h2>
                <p className="text-gray-500 mb-6 leading-relaxed">
                  Our Spend Analysis Agent continuously monitors your procurement data to uncover savings opportunities, detect anomalies, and provide actionable recommendations.
                </p>
                <div className="space-y-3">
                  <div className="bg-white border border-gray-100 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm mb-1">Savings Opportunity</p>
                        <p className="text-xs text-gray-500">Consolidating IT spend with 2 vendors instead of 5 could save ₹12L annually</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm mb-1">Maverick Spend Alert</p>
                        <p className="text-xs text-gray-500">₹3.5L in off-contract purchases detected in Marketing department</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <TrendingDown className="w-5 h-5 text-teal-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-gray-900 text-sm mb-1">Cost Reduction</p>
                        <p className="text-xs text-gray-500">Renegotiating with Vendor A could reduce costs by 8% based on market data</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-teal-700 rounded-2xl p-8 text-white">
                <BarChart3 className="w-10 h-10 mb-5 text-teal-300" />
                <h3 className="text-xl font-bold mb-5">Key Analytics</h3>
                <div className="space-y-5">
                  {[
                    { label: "Spend by Category", value: "₹45M", pct: "75%" },
                    { label: "Supplier Concentration", value: "Top 10: 65%", pct: "65%" },
                    { label: "Savings Achieved", value: "₹6.5M", pct: "50%" },
                    { label: "Budget Utilization", value: "82%", pct: "82%" },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex justify-between items-center mb-1.5 text-sm">
                        <span className="text-teal-100">{item.label}</span>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                      <div className="bg-white/20 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-white h-full rounded-full" style={{ width: item.pct }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-gray-900">Transform Your Procurement Performance</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                { title: "Visibility", description: "Complete transparency into where every dollar is spent", icon: BarChart3, color: "bg-teal-50 text-teal-600" },
                { title: "Control", description: "Detect and prevent off-contract and unauthorized spending", icon: Target, color: "bg-violet-50 text-violet-600" },
                { title: "Optimization", description: "Identify and capture savings opportunities continuously", icon: TrendingDown, color: "bg-teal-50 text-teal-600" },
              ].map((item, index) => (
                <div key={index} className="bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center">
                  <div className={`w-14 h-14 ${item.color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                    <item.icon className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <CommonShortForm reactedPage="Spend Analytics" />

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Unlock Spend Intelligence?</h2>
            <p className="text-gray-400 mb-8">Start identifying savings and optimizing spend today</p>
            <Link href="/book-demo" className="inline-flex items-center gap-2 px-7 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors">
              Schedule a Demo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
