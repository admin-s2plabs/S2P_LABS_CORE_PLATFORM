import { ArrowRight, CheckCircle, Clock, FileText, Shield, TrendingUp, Users } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { CommonShortForm } from "../components/CommonShortForm";
import { LogoBlack } from "../components/LogoImport";

export function SupplierManagementPage() {
  const features = [
    { icon: Users, title: "Intelligent Onboarding", description: "Automated vendor onboarding workflows with document verification and compliance checks", color: "bg-violet-50 text-violet-600" },
    { icon: Shield, title: "Risk Assessment", description: "Continuous risk monitoring with real-time alerts for compliance issues and financial health", color: "bg-red-50 text-red-600" },
    { icon: TrendingUp, title: "Performance Analytics", description: "Track vendor performance metrics, delivery times, quality scores, and more", color: "bg-teal-50 text-teal-600" },
    { icon: FileText, title: "Document Management", description: "Centralized repository for all vendor documents with expiry tracking and reminders", color: "bg-blue-50 text-blue-600" },
    { icon: CheckCircle, title: "Compliance Tracking", description: "Ensure vendors meet regulatory requirements and company policies automatically", color: "bg-teal-50 text-teal-600" },
    { icon: Clock, title: "Automated Workflows", description: "Set up trigger-based actions for renewals, approvals, and communications", color: "bg-orange-50 text-orange-600" },
  ];

  const benefits = [
    "Reduce vendor onboarding time by 60%",
    "Real-time visibility into vendor risks",
    "Automated compliance monitoring",
    "Improved vendor relationships through better communication",
    "Data-driven vendor selection and optimization",
    "Centralized vendor information and history",
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="Supplier Management Software | Prokraya" />
        <meta property="og:description" content="Automate supplier onboarding, compliance, risk monitoring, and performance management with AI-powered supplier management software." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/supplier-management" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>Supplier Management Software | AI-Powered Vendor Management | Prokraya</title>
        <meta name="description" content="Manage supplier onboarding, compliance, performance, and risk from a single platform. AI-powered supplier management software with automated workflows and real-time visibility." />
        <meta name="keywords" content="supplier management software, supplier relationship management, vendor management software, supplier onboarding software, supplier risk management, SRM software, vendor compliance management, supplier performance management" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-teal-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0d948808_1px,transparent_1px),linear-gradient(to_bottom,#0d948808_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="inline-block px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-50 rounded-full mb-5 uppercase tracking-wider">Supplier Management</span>
                <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
                  Supplier Relationship{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-violet-500">Management</span>
                </h1>
                <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
                  Transform vendor management with AI-powered onboarding, risk monitoring, and performance analytics. Build stronger supplier relationships while maintaining compliance.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/book-demo" className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                    Request Demo <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link href="/contact-us" className="inline-flex items-center justify-center px-7 py-3 border border-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                    Contact Sales
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: "60%", label: "Faster Onboarding", color: "bg-teal-50 text-teal-600" },
                  { value: "100%", label: "Compliance Visibility", color: "bg-violet-50 text-violet-600" },
                  { value: "24/7", label: "Risk Monitoring", color: "bg-teal-50 text-teal-600" },
                ].map((stat, i) => (
                  <div key={i} className={`${stat.color} rounded-2xl p-5 text-center border border-white`}>
                    <div className="text-3xl font-extrabold mb-1">{stat.value}</div>
                    <div className="text-xs font-medium opacity-80">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Comprehensive Features</h2>
              <p className="text-gray-500">Everything you need to manage your supplier ecosystem</p>
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

        {/* Benefits + AI Insights */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Why Choose Prokraya for Supplier Management?</h2>
                <div className="space-y-3">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-teal-500 flex-shrink-0 mt-0.5" />
                      <p className="text-gray-600">{benefit}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-7 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-2">AI-Powered Insights</h3>
                <p className="text-sm text-gray-600 mb-5">Our AI Vendor Agent continuously analyzes supplier data to provide actionable insights:</p>
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                    <p className="font-semibold text-red-800 text-sm">Risk Alert: 3 vendors have expiring certifications</p>
                    <p className="text-sm text-red-600 mt-1">Automated renewal reminders sent</p>
                  </div>
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                    <p className="font-semibold text-violet-800 text-sm">Performance: Top 5 vendors by on-time delivery</p>
                    <p className="text-sm text-violet-600 mt-1">Consider consolidating spend</p>
                  </div>
                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                    <p className="font-semibold text-teal-800 text-sm">Savings Opportunity: Alternative vendors identified</p>
                    <p className="text-sm text-teal-600 mt-1">Potential 15% cost reduction</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <CommonShortForm reactedPage="Supplier Management" />

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Transform Your Supplier Management?</h2>
            <p className="text-gray-400 mb-8">Join hundreds of organizations optimizing their vendor relationships</p>
            <Link href="/book-demo" className="inline-flex items-center gap-2 px-7 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors">
              Schedule a Demo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
