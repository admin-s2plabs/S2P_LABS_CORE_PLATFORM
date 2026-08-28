import { AlertTriangle, ArrowRight, BarChart3, CheckCircle, Clock, DollarSign, FileText, Receipt, Zap } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { CommonShortForm } from "../components/CommonShortForm";
import { LogoBlack } from "../components/LogoImport";

export function EInvoicingPage() {
  const features = [
    { icon: Zap, title: "Automated 3-Way Matching", description: "Instantly match PO, GRN, and Invoice with 99% accuracy", color: "bg-violet-50 text-violet-600" },
    { icon: Receipt, title: "Invoice Processing", description: "Extract and validate invoice data automatically with AI", color: "bg-teal-50 text-teal-600" },
    { icon: AlertTriangle, title: "Exception Management", description: "Intelligent flagging and resolution of invoice discrepancies", color: "bg-orange-50 text-orange-600" },
    { icon: CheckCircle, title: "Approval Workflows", description: "Smart routing for invoice approvals based on policies", color: "bg-teal-50 text-teal-600" },
    { icon: DollarSign, title: "Payment Optimization", description: "Optimize payment timing for cash flow and early payment discounts", color: "bg-blue-50 text-blue-600" },
    { icon: BarChart3, title: "Invoice Analytics", description: "Real-time insights into invoice status and payment trends", color: "bg-indigo-50 text-indigo-600" },
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="eInvoicing Software | Prokraya" />
        <meta property="og:description" content="Automate invoice processing, 3-way matching, approvals, and exception handling with AI-powered invoice automation software." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/einvoicing" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>eInvoicing Software | AI-Powered Invoice Processing Automation | Prokraya</title>
        <meta name="description" content="Automate invoice processing with AI-powered data extraction, 3-way matching, exception management, and approval workflows. Reduce processing time by 90% and eliminate manual errors." />
        <meta name="keywords" content="eInvoicing software, invoice processing software, accounts payable automation, invoice automation, 3-way matching software, AP automation software, invoice approval workflow, AI invoice processing" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-5 uppercase tracking-wider">eInvoicing</span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">eInvoicing</span>{" "}
              Software
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
              Automate invoice processing with intelligent 3-way matching, AI-powered data extraction, and automated exception handling. Reduce processing time by 90% and eliminate errors.
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
                { value: "90%", label: "Faster Processing" },
                { value: "99%", label: "Matching Accuracy" },
                { value: "100%", label: "Invoice Visibility" },
                { value: "Zero", label: "Manual Errors" },
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
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Intelligent Invoice Processing</h2>
              <p className="text-gray-500">AI-powered automation from receipt to payment</p>
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

        {/* 3-Way Matching */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Automated 3-Way Matching</h2>
              <p className="text-gray-500">Match PO, GRN, and Invoice automatically in seconds</p>
            </div>
            <div className="grid md:grid-cols-3 gap-5 mb-8">
              {[
                { icon: FileText, title: "Purchase Order", description: "System retrieves PO details", color: "bg-violet-50 text-violet-600" },
                { icon: CheckCircle, title: "Goods Receipt", description: "Validates received quantities", color: "bg-teal-50 text-teal-600" },
                { icon: Receipt, title: "Invoice", description: "Extracts invoice data with AI", color: "bg-teal-50 text-teal-600" },
              ].map((item, index) => (
                <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
                  <div className={`w-14 h-14 ${item.color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                    <item.icon className="w-7 h-7" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="bg-teal-700 rounded-2xl p-8 text-white text-center">
              <Zap className="w-10 h-10 mx-auto mb-4 text-teal-300" />
              <h3 className="text-xl font-bold mb-3">Match, Validate & Approve Automatically</h3>
              <p className="text-teal-100 max-w-xl mx-auto text-sm">
                Our AI Invoice Agent matches all three documents in seconds, validates amounts and quantities, and automatically approves matches or flags exceptions for review.
              </p>
            </div>
          </div>
        </section>

        {/* AI Invoice Agent */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">AI Invoice Agent</h2>
                <p className="text-gray-500 mb-6">Your intelligent invoice assistant that processes, matches, and approves invoices 24/7.</p>
                <div className="space-y-3">
                  {["Extract data from any invoice format", "Match with PO and GRN automatically", "Detect and flag discrepancies", "Route exceptions to appropriate approvers", "Track payment status in real-time", "Provide analytics on invoice trends"].map((cap, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-600">{cap}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-teal-600" />
                    <span className="font-semibold text-teal-800 text-sm">Matched Successfully</span>
                  </div>
                  <p className="text-xs text-teal-700">Invoice #INV-2024-001 matched with PO #PO-2024-123. Amount: ₹1,25,000. Approved for payment.</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="font-semibold text-amber-800 text-sm">Exception Detected</span>
                  </div>
                  <p className="text-xs text-amber-700">Invoice #INV-2024-002: Price variance of 5%. Routed to manager for approval.</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-blue-800 text-sm">Processing Time</span>
                  </div>
                  <p className="text-xs text-blue-700">Average processing time: 2 minutes (90% faster than manual)</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <CommonShortForm reactedPage="E Invoicing" />

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Automate Invoice Processing?</h2>
            <p className="text-gray-400 mb-8">Join organizations processing thousands of invoices error-free</p>
            <Link href="/book-demo" className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
              Schedule a Demo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
