import { ArrowRight, Bell, CheckCircle, Clock, FileText, Search, Shield, TrendingUp } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { CommonShortForm } from "../components/CommonShortForm";
import { LogoBlack } from "../components/LogoImport";

export function ContractManagementPage() {
  const features = [
    { icon: FileText, title: "Contract Repository", description: "Centralized, searchable repository for all contracts and agreements", color: "bg-violet-50 text-violet-600" },
    { icon: Clock, title: "Lifecycle Management", description: "Track contracts from creation through renewal or termination", color: "bg-blue-50 text-blue-600" },
    { icon: Bell, title: "Automated Alerts", description: "Proactive notifications for renewals, obligations, and milestones", color: "bg-orange-50 text-orange-600" },
    { icon: Shield, title: "Compliance Tracking", description: "Ensure contracts meet regulatory and company policy requirements", color: "bg-teal-50 text-teal-600" },
    { icon: Search, title: "AI-Powered Search", description: "Find clauses, terms, and obligations across all contracts instantly", color: "bg-teal-50 text-teal-600" },
    { icon: TrendingUp, title: "Performance Analytics", description: "Monitor contract performance and identify optimization opportunities", color: "bg-indigo-50 text-indigo-600" },
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="Contract Management Software | Prokraya" /> 
        <meta property="og:description" content="Automate contract management with AI-powered renewals, obligation tracking, compliance monitoring, and intelligent contract search." /> 
        <meta property="og:type" content="website" /> 
        <meta property="og:url" content="https://prokraya.ai/contract-management" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>Contract Management Software | AI-Powered Contract Lifecycle Management | Prokraya</title>
        <meta name="description" content="Manage contracts from creation to renewal with AI-powered contract lifecycle management software. Automate renewals, track obligations, ensure compliance, and gain complete contract visibility." />
        <meta name="keywords" content="contract management software, contract lifecycle management, CLM software, contract automation software, contract compliance management, contract repository, contract renewal management, procurement contract management" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">Contract Management</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Contract Management{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Software</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
              Manage your entire contract lifecycle with AI-powered automation. Never miss a renewal, track obligations automatically, and ensure compliance across all agreements.
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
                { value: "100%", label: "Renewal Tracking" },
                { value: "80%", label: "Time Saved" },
                { value: "Zero", label: "Missed Renewals" },
                { value: "Instant", label: "Contract Search" },
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
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Complete Contract Management</h2>
              <p className="text-gray-500">Everything you need to manage contracts efficiently</p>
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

        {/* AI Contract Agent */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div className="bg-teal-700 rounded-2xl p-8 text-white">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-5">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3">AI Contract Agent</h3>
                <p className="text-teal-100 mb-5 text-sm">
                  Your intelligent contract assistant that monitors, alerts, and manages your entire contract portfolio.
                </p>
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-xs font-semibold text-teal-300 mb-1">EXAMPLE:</p>
                  <p className="text-sm text-white mb-2">"Which contracts expire this quarter?"</p>
                  <p className="text-xs text-teal-200">Agent lists 12 contracts expiring in Q1 with renewal recommendations</p>
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Key Benefits</h2>
                <div className="space-y-3">
                  {[
                    "Never miss critical contract deadlines",
                    "Reduce contract management time by 80%",
                    "Ensure compliance across all agreements",
                    "Find any clause or term in seconds",
                    "Track obligations and deliverables automatically",
                    "Optimize contract terms based on performance data",
                  ].map((benefit, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-teal-500 flex-shrink-0 mt-0.5" />
                      <p className="text-gray-600">{benefit}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <CommonShortForm reactedPage="Contract Management" />

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Master Contract Management?</h2>
            <p className="text-gray-400 mb-8">Stop worrying about missed renewals and compliance issues</p>
            <Link href="/book-demo" className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
              Schedule a Demo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
