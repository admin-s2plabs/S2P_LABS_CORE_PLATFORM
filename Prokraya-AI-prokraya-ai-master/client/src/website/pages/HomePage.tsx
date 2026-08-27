import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle,
  Cpu,
  CreditCard,
  FileCheck,
  FileText,
  Globe,
  LayoutGrid,
  Package,
  Receipt,
  RefreshCw,
  Search,
  Shield,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Zap
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { CommonShortForm } from "../components/CommonShortForm";
import { LogoBlack } from "../components/LogoImport";
import AqaarLogo from "../../assets/images/Aqaar-logo.png";
import DafzaLogo from "../../assets/images/dafza.png";
import HassadLogo from "../../assets/images/Hassad-Food-logo.jpeg";
import ISLogo from "../../assets/images/Intellismart-logo.jpg";
import BenettonLogo from "../../assets/images/ucb.jpg";
import EagleLogo from "../../assets/images/eagle.jpg";

export function HomePage() {
  const s2pSteps = [
    { icon: FileText, label: "Purchase Request", color: "bg-violet-100 text-violet-600" },
    { icon: Search, label: "Sourcing & RFQ", color: "bg-blue-100 text-blue-600" },
    { icon: ShoppingCart, label: "Purchase Order", color: "bg-teal-100 text-teal-600" },
    { icon: Package, label: "Goods Receipt", color: "bg-orange-100 text-orange-600" },
    { icon: CreditCard, label: "Invoice & Payment", color: "bg-pink-100 text-pink-600" },
    { icon: FileCheck, label: "Contract & Audit", color: "bg-indigo-100 text-indigo-600" },
  ];
  const clients = [
    { name: "Aqaar", logo: AqaarLogo },
    { name: "Dafza", logo: DafzaLogo },
    { name: "Hassad", logo: HassadLogo },
    { name: "Benetton", logo: BenettonLogo },
    { name: "Eagle Hills", logo: EagleLogo },
    { name: "Intellismart", logo: ISLogo },
  ];
  const modules = [
    { icon: ShoppingCart, title: "Purchase Requisition", description: "Streamline procurement requests with intelligent approvals and automated workflows.", color: "bg-violet-50 text-violet-600" },
    { icon: Search, title: "eSourcing", description: "Automate RFQ creation, bid analysis, and supplier selection with AI intelligence.", color: "bg-blue-50 text-blue-600" },
    { icon: Users, title: "Supplier Management", description: "Manage supplier relationships, performance tracking, and compliance monitoring.", color: "bg-teal-50 text-teal-600" },
    { icon: FileText, title: "Contract Management", description: "Track contracts, automate renewals, and ensure compliance with AI-powered intelligence.", color: "bg-orange-50 text-orange-600" },
    { icon: Receipt, title: "eInvoicing", description: "Automate invoice processing, validation, and payment workflows with AI accuracy.", color: "bg-pink-50 text-pink-600" },
    { icon: BarChart3, title: "Spend Analytics", description: "Get real-time insights into spending patterns and identify savings opportunities.", color: "bg-indigo-50 text-indigo-600" },
  ];

  const workflows = [
    { trigger: "When PR Approved", action: "Auto-create RFQ, invite qualified suppliers" },
    { trigger: "When Contract Expiring in 30 Days", action: "Alert owner, initiate renewal workflow, notify supplier" },
    { trigger: "When Invoice Received", action: "Auto-route: 3-way match, fraud check, auto approve or escalate" },
  ];

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="AI Procurement Software | Agentic Source-to-Pay Platform" /> 
        <meta property="og:description" content="Meet your AI procurement team. Specialized agents for sourcing, suppliers, contracts, invoicing, spend, and compliance operating 24/7." /> 
        <meta property="og:type" content="website" /> 
        <meta property="og:url" content="https://prokraya.ai/" /> 
        <meta property="og:site_name" content="Prokraya" /> 
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>AI Procurement Software | Agentic Source-to-Pay Platform | Prokraya</title>
        <meta name="description" content="Transform procurement with AI agents that automate sourcing, suppliers, contracts, invoicing, compliance, and spend management across the entire Source-to-Pay lifecycle." /> 
        <meta name="keywords" content="AI procurement software, source to pay platform, procurement automation software, agentic procurement, procurement AI agents, enterprise procurement software, sourcing automation, supplier management software, spend analytics platform" />
      </Helmet>
      <div className="flex flex-col">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white overflow-hidden -mt-16 min-h-[82vh] flex items-center">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-cyan-500/10" />
          <div className="absolute top-10 left-10 w-72 h-72 bg-gradient-to-br from-purple-500/30 to-pink-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-40 right-20 w-64 h-64 bg-gradient-to-br from-blue-500/25 to-cyan-500/15 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-gradient-to-br from-orange-500/15 to-amber-500/10 rounded-full blur-3xl" />

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-0 pt-20 w-full">
            <div className="flex flex-col items-center text-center">

              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-50 border border-violet-200/50 rounded-full mb-6 text-xs font-medium text-violet-700">
                <Sparkles className="w-3 h-3" />
                Introducing AI Agentic Procurement
              </div>

              {/* Headline */}
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Procurement That{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-violet-400">Thinks</span>
                ,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-teal-400">Acts</span>
                , and{" "}
                <br className="hidden sm:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Delivers</span>
              </h1>

              {/* Subtext */}
              <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
                Meet your AI procurement team. Specialized agents for Sourcing, Suppliers, Contracts, Spend, and Compliance, powered by Agentic Workflows that execute procurement processes autonomously - 24/7.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 mb-7">
                <Link
                  to="/book-demo"
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors shadow-md shadow-violet-200"
                >
                  Book a Demo
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/roi-calculator"
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-violet-200 text-violet-700 text-sm font-semibold rounded-lg hover:bg-violet-50 transition-colors"
                >
                  <TrendingUp className="w-4 h-4 text-teal-500" />
                  Calculate ROI
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                {[
                  { icon: Building2, text: "Enterprise ready" },
                  { icon: Shield, text: "ISO 27001" },
                  { icon: CheckCircle, text: "GDPR" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 leading-relaxed text-gray-500">
                    <item.icon className="w-3.5 h-3.5 text-violet-400" />
                    {item.text}
                  </div>
                ))}
              </div>

            </div>
          </div>
        </section>

        {/* Trusted by band */}
        <section className="py-8 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-lg font-semibold text-violet-400 uppercase tracking-widest mb-4">Trusted by procurement leaders across industries</p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
              {["Enterprise Manufacturing", "Global Retail Chain", "Real Estate Corporation", "Technology Services"].map((co) => (
                <span key={co} className="flex items-center gap-1.5 leading-relaxed font-medium text-gray-500">
                  <Globe className="w-3 h-3 text-violet-300" />
                  {co}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="py-8 bg-gradient-to-r from-violet-600 via-purple-600 to-teal-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center text-white">
              {[
                { value: "30+", label: "AI Features" },
                { value: "7", label: "Specialized AI Agents" },
                { value: "6", label: "Core Platform Modules" },
                { value: "100%", label: "Source-to-Pay Coverage" },
              ].map((stat, i) => (
                <div key={i} className="py-1">
                  <div className="text-3xl lg:text-4xl font-extrabold mb-1">{stat.value}</div>
                  <div className="text-white/80 text-xs font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-white text-xs font-medium mt-4">
              Powered by specialized AI agents for Sourcing, Suppliers, Contracts, Procurement, Payables, and Compliance, running autonomously - 24/7
            </p>
          </div>
        </section>

        {/* S2P Loop */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-3 uppercase tracking-wider">
                Full Lifecycle Coverage
              </span>
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">
                One Platform. The{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Complete S2P Loop.</span>
              </h2>
              <p className="text-sm text-gray-500">
                Every step of your procurement journey, connected, automated, and AI-enhanced. No more switching between tools.
              </p>
            </div>

            <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              {s2pSteps.map((step, index) => (
                <div key={index} className="flex flex-col items-center text-center group">
                  <div className={`w-12 h-12 ${step.color} rounded-2xl flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform`}>
                    <step.icon className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium text-gray-700 leading-snug">{step.label}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {[
                { icon: Cpu, title: "AI powered at every step", desc: "Access, validate, and act", color: "text-violet-500", bg: "bg-violet-50" },
                { icon: RefreshCw, title: "Connected data across modules", desc: "PRs, spend from PR to budget", color: "text-teal-500", bg: "bg-teal-50" },
                { icon: CheckCircle, title: "Full audit trail", desc: "Every action with user, timestamps, and context for compliance", color: "text-blue-500", bg: "bg-blue-50" },
              ].map((item, i) => (
                <div key={i} className={`flex items-start gap-3 px-5 py-4 ${item.bg} rounded-xl`}>
                  <item.icon className={`w-4 h-4 ${item.color} flex-shrink-0 mt-0.5`} />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Agentic Workflows */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-3 uppercase tracking-wider">
                Agentic Workflows
              </span>
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">
                Configure Once,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-teal-400">Runs Autonomously</span>
              </h2>
              <p className="text-sm text-gray-500">
                Beyond automation. Set up trigger-based workflows where AI agents execute procurement processes automatically - 24/7 without human intervention.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-5">
              {workflows.map((w, i) => (
                <div key={i} className={`rounded-xl p-5 text-white ${["bg-teal-700", "bg-violet-700", "bg-blue-700"][i]}`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Zap className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">{w.trigger.replace("When ", "")}</span>
                  </div>
                  <p className="text-sm text-white/90">{w.action}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-start gap-4">
                <div className="w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <LayoutGrid className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">Visual Workflow Builder</p>
                  <p className="text-sm text-gray-500">Easy drag-&-drop interface to design complex procurement automations</p>
                </div>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-start gap-4">
                <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileCheck className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">Ready-to-Use Templates</p>
                  <p className="text-sm text-gray-500">Prebuilt templates for suppliers, assisting contracts, Invoicing & more</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6 Core Platform */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-3 uppercase tracking-wider">
                6 Core Platform
              </span>
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">
                Complete Source-to-Pay{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Platform</span>
              </h2>
              <p className="text-sm text-gray-500">
                From supplier discovery to contract closeout, every module connected, every workflow AI-enhanced.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {modules.map((mod, i) => (
                <div key={i} className="group bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-gray-200 transition-all">
                  <div className={`w-10 h-10 ${mod.color} rounded-xl flex items-center justify-center mb-3`}>
                    <mod.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{mod.title}</h3>
                  <p className="text-sm text-gray-500">{mod.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI Agents */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-3 uppercase tracking-wider">
                AI Agents
              </span>
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">
                Action-Capable{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">AI Agents</span>
              </h2>
              <p className="text-sm text-gray-500">
                AI agents that execute real procurement actions: creating documents, managing suppliers, processing invoices, and running sourcing events autonomously.
              </p>
            </div>

            <div className="space-y-2">
              {[
                { icon: Users, name: "Vendor Agent", color: "bg-blue-50 text-blue-600", pill: "bg-blue-50 border-blue-100 text-blue-700", caps: ["Vendor search", "Onboarding", "Invitation", "Risk analysis", "Performance tracking", "Intelligence & profiling"] },
                { icon: Search, name: "Sourcing Agent", color: "bg-teal-50 text-teal-600", pill: "bg-teal-50 border-teal-100 text-teal-700", caps: ["Create RFQ/RFP/tender", "Add lines & vendors", "Publish bids", "Manage sourcing events", "Vendor participation support"] },
                { icon: ShoppingCart, name: "Procurement Ops Agent", color: "bg-orange-50 text-orange-600", pill: "bg-orange-50 border-orange-100 text-orange-700", caps: ["Create/update PRs", "Add PR/PO lines", "Submit for approval", "Manage items", "Category/UNSPSC", "Delivery notes", "GRN handling"] },
                { icon: CreditCard, name: "Payables Agent", color: "bg-pink-50 text-pink-600", pill: "bg-pink-50 border-pink-100 text-pink-700", caps: ["Create invoices", "Add line items", "Submit & pay", "3-way PO-GRN-invoice matching", "Approval support"] },
                { icon: FileText, name: "Contracting Agent", color: "bg-violet-50 text-violet-600", pill: "bg-violet-50 border-violet-100 text-violet-700", caps: ["Draft contracts", "Clause extraction", "Risk flagging", "Renewal alerts", "Redline suggestion", "Contract review support"] },
                { icon: BarChart3, name: "Spend Intelligence Agent", color: "bg-indigo-50 text-indigo-600", pill: "bg-indigo-50 border-indigo-100 text-indigo-700", caps: ["Spend visibility", "Savings identification", "Maverick spend detection", "Benchmarking", "Cost optimisation insights"] },
                { icon: Shield, name: "Compliance Agent", color: "bg-red-50 text-red-600", pill: "bg-red-50 border-red-100 text-red-700", caps: ["Regulatory monitoring", "Audit trail tracking", "Policy adherence", "Risk management", "Governance monitoring"] },
              ].map((agent, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-3 sm:w-48 flex-shrink-0">
                    <div className={`w-8 h-8 ${agent.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <agent.icon className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.caps.map((cap, j) => (
                      <span key={j} className={`px-2 py-0.5 border rounded-full text-sm ${agent.pill}`}>{cap}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-7 text-center">
              <Link href="/ai-agents" className="inline-flex items-center gap-2 px-5 py-2 border border-violet-200 text-violet-600 text-sm font-semibold rounded-lg hover:bg-violet-50 transition-colors">
                Explore All AI Agents <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="inline-block px-3 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-full mb-3 uppercase tracking-wider">
                Integrations
              </span>
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">
                Connects With Your{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">Existing Stack</span>
              </h2>
              <p className="text-sm text-gray-500">
                Prokraya integrates with your existing enterprise systems. Connect your ERP and get started without disrupting your current setup.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-7">
              {[
                { name: "SAP", desc: "ERP & S/4HANA", bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700" },
                { name: "Oracle", desc: "ERP Cloud & Suite", bg: "bg-red-50", border: "border-red-100", text: "text-red-700" },
                { name: "Microsoft Dynamics", desc: "Finance & Operations", bg: "bg-sky-50", border: "border-sky-100", text: "text-sky-700" },
                { name: "NetSuite", desc: "Cloud ERP", bg: "bg-orange-50", border: "border-orange-100", text: "text-orange-700" },
                { name: "Custom APIs", desc: "REST / Webhook", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700" },
                { name: "GST", desc: "Tax Compliance", bg: "bg-green-50", border: "border-green-100", text: "text-green-700" },
                { name: "PAN", desc: "Identity Verification", bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-700" },
                { name: "MSME", desc: "SME Compliance", bg: "bg-teal-50", border: "border-teal-100", text: "text-teal-700" },
                { name: "Gsign", desc: "Digital Signature", bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-700" },
                { name: "Payment Gateways", desc: "SWIFT & more", bg: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-700" },
              ].map((item) => (
                <div key={item.name} className={`group flex flex-col items-center text-center p-4 rounded-2xl border ${item.border} ${item.bg} hover:shadow-md transition-all cursor-default`}>
                  <p className={`text-sm font-bold ${item.text} mb-0.5`}>{item.name}</p>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>

            <p className="text-center text-sm text-gray-500">
              {"Don't see your system? "}
              <Link href="/contact-us" className="text-violet-600 hover:underline font-medium">Contact us</Link>
              {". We support custom integrations via REST API."}
            </p>
          </div>
        </section>
        {/*Clients Section*/}
       <section className="py-16 bg-gray-50 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">
                Trusted by Industry{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">
                  Leaders
                </span>
              </h2>
            </div>
            <div className="overflow-hidden">
              <div className="flex w-max animate-marquee">
                {[...clients, ...clients].map((client, index) => (
                  <div
                    key={index}
                    className="flex-shrink-0 w-72 flex items-center justify-center"
                  >
                    <img
                      src={client.logo}
                      alt={client.name}
                      className="h-20 w-auto object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>            
          </div>
        </section>
        <CommonShortForm reactedPage="Home" />

        {/* CTA / Demo Section */}

      </div>
    </>
  );
}
