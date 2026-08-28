import { ArrowRight, BarChart3, FileText, Sparkles, Target, TrendingDown, Users, Zap } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { CommonShortForm } from "../components/CommonShortForm";
import { LogoBlack } from "../components/LogoImport";

export function ESourcingPage() {
  const features = [
    { icon: Sparkles, title: "AI-Powered RFx", description: "Create RFQs, RFPs, and RFIs with AI assistance in minutes", color: "bg-violet-50 text-violet-600" },
    { icon: Users, title: "Vendor Portal", description: "Self-service portal for vendors to submit bids and track status", color: "bg-teal-50 text-teal-600" },
    { icon: BarChart3, title: "Bid Analysis", description: "Automated bid comparison and scoring with AI recommendations", color: "bg-blue-50 text-blue-600" },
    { icon: Target, title: "Auction Management", description: "Run forward and reverse auctions with real-time bidding", color: "bg-orange-50 text-orange-600" },
    { icon: FileText, title: "Document Management", description: "Centralized repository for all sourcing documents and bids", color: "bg-indigo-50 text-indigo-600" },
    { icon: TrendingDown, title: "Cost Optimization", description: "Identify savings opportunities and negotiate better terms", color: "bg-teal-50 text-teal-600" },
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="AI-Powered eSourcing Software | Prokraya" />
        <meta property="og:description" content="Transform sourcing with automated RFQs, bid analysis, supplier selection, auctions, and AI-powered sourcing intelligence." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/esourcing" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>eSourcing Software | AI-Powered Strategic Sourcing Platform | Prokraya</title>
        <meta name="description" content="Automate RFQs, RFPs, bid analysis, supplier selection, and sourcing events with AI-powered eSourcing software. Reduce sourcing cycles and achieve better procurement outcomes." />
        <meta name="keywords" content="eSourcing software, strategic sourcing software, RFQ software, RFP management software, sourcing automation, bid management software, supplier sourcing platform, procurement sourcing software" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">eSourcing</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">eSourcing</span>{" "}
              Software
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
              Transform your sourcing process with AI-powered RFx management, automated bid analysis, and intelligent vendor selection. Reduce sourcing cycles by 70% and increase bid participation by 3x.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/book-demo" className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
                Request Demo <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/contact-us" className="inline-flex items-center justify-center px-7 py-3 border border-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                Contact Sales
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-10 bg-gradient-to-r from-violet-600 via-purple-600 to-teal-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center text-white">
              {[
                { value: "70%", label: "Faster Sourcing" },
                { value: "3x", label: "More Bids" },
                { value: "15%", label: "Average Savings" },
                { value: "99%", label: "Bid Accuracy" },
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
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Complete Sourcing Suite</h2>
              <p className="text-gray-500">All the tools you need for strategic sourcing</p>
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

        {/* AI Sourcing Agent */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 bg-violet-50 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-violet-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">AI Sourcing Agent</h2>
                </div>
                <p className="text-gray-500 mb-6 leading-relaxed">
                  Your 24/7 sourcing assistant that creates RFQs, analyzes bids, and recommends vendors through natural conversation.
                </p>
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                  <p className="text-xs font-semibold text-violet-600 mb-1">YOU ASK:</p>
                  <p className="text-sm text-gray-700 mb-4">"Create an RFQ for 50 laptops with 16GB RAM"</p>
                  <p className="text-xs font-semibold text-teal-600 mb-1">AGENT RESPONDS:</p>
                  <p className="text-sm text-gray-600">
                    I'll create an RFQ for 50 laptops. Based on your IT category vendors, I've identified 5 qualified suppliers. Shall I invite them and set a 7-day response window?
                  </p>
                </div>
              </div>
              <div className="bg-teal-700 rounded-2xl p-8 text-white">
                <h3 className="text-xl font-bold mb-5">200+ Prompts Available</h3>
                <div className="space-y-3">
                  {["Bid Creation & Management", "Response Analysis", "Vendor Recommendations", "Negotiation Support", "Award Decisions", "Market Intelligence"].map((item, index) => (
                    <div key={index} className="flex items-center gap-3 text-sm">
                      <Zap className="w-4 h-4 text-teal-300 flex-shrink-0" />
                      <span className="text-teal-100">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <CommonShortForm reactedPage="E Sourcing" />

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Revolutionize Your Sourcing?</h2>
            <p className="text-gray-400 mb-8">Join leading organizations saving time and money with AI sourcing</p>
            <Link href="/book-demo" className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
              Schedule a Demo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
