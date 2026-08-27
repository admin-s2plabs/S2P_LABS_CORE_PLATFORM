import {
  ArrowRight,
  Brain,
  CheckCircle,
  FileText,
  Receipt,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { LogoBlack } from "../components/LogoImport";

export function AIAgentsPage() {
  const agents = [
    {
      name: "AI Sourcing Agent",
      description: "Automate the entire sourcing lifecycle from RFQ creation to vendor selection",
      icon: Sparkles,
      accent: "violet",
      prompts: "200+ prompts across 12 categories",
      capabilities: [
        "Create RFQs and RFPs with AI assistance",
        "Analyze and compare vendor bids automatically",
        "Generate vendor recommendations based on criteria",
        "Negotiate terms and conditions",
        "Award contracts with compliance checks",
        "Track market intelligence and trends",
      ],
      example: 'Ask: "Create an RFQ for 100 laptops with 16GB RAM". Agent automatically generates specifications, identifies qualified vendors, and sends invitations.',
    },
    {
      name: "AI Vendor Agent",
      description: "Intelligent vendor lifecycle management from onboarding to performance monitoring",
      icon: Users,
      accent: "teal",
      prompts: "200+ prompts across 12 categories",
      capabilities: [
        "Automated vendor onboarding workflows",
        "Document verification and compliance checks",
        "Continuous performance monitoring",
        "Risk assessment and alerts",
        "Relationship management and communication",
        "Vendor segmentation and classification",
      ],
      example: 'Ask: "Show vendors with compliance issues". Agent identifies 12 vendors with expiring documents and offers to send renewal reminders.',
    },
    {
      name: "Contract Agent",
      description: "Manage contract lifecycle, renewals, and compliance tracking",
      icon: FileText,
      accent: "teal",
      prompts: "Contract lifecycle automation",
      capabilities: [
        "Contract creation and template management",
        "Automated renewal reminders",
        "Clause analysis and risk detection",
        "Version control and audit trails",
        "Obligation tracking and alerts",
        "Contract performance analytics",
      ],
      example: 'Ask: "Which contracts expire this quarter?" Agent lists all expiring contracts with renewal recommendations.',
    },
    {
      name: "Spend Analysis Agent",
      description: "Uncover savings opportunities and optimize spending patterns",
      icon: TrendingUp,
      accent: "orange",
      prompts: "Analytics & savings identification",
      capabilities: [
        "Real-time spend visibility across categories",
        "Savings opportunities identification",
        "Maverick spend detection",
        "Supplier consolidation recommendations",
        "Budget tracking and forecasting",
        "Custom analytics and reports",
      ],
      example: 'Ask: "Where can we save money on IT spending?" Agent analyzes spend patterns and suggests consolidation opportunities.',
    },
    {
      name: "Invoice Agent",
      description: "Automate invoice processing with intelligent 3-way matching",
      icon: Receipt,
      accent: "indigo",
      prompts: "3-way matching & automation",
      capabilities: [
        "Automated 3-way matching (PO, GRN, Invoice)",
        "Exception handling and resolution",
        "Duplicate detection",
        "Payment term optimization",
        "Vendor payment status tracking",
        "Invoice analytics and insights",
      ],
      example: 'Ask: "Process invoices for this week". Agent matches, verifies, and flags discrepancies automatically.',
    },
    {
      name: "Compliance Agent",
      description: "Proactive risk monitoring and compliance management",
      icon: Shield,
      accent: "red",
      prompts: "Risk monitoring & alerts",
      capabilities: [
        "Continuous compliance monitoring",
        "Risk score calculation and tracking",
        "Regulatory requirement tracking",
        "Audit trail management",
        "Policy violation detection",
        "Automated compliance reporting",
      ],
      example: 'Ask: "Show high-risk vendors". Agent displays vendors with compliance issues and risk factors.',
    },
  ];

  const benefits = [
    { title: "24/7 Autonomous Operation", description: "AI agents work around the clock without breaks, ensuring continuous procurement operations", icon: Zap },
    { title: "Domain Expertise Built-In", description: "200+ specialized prompts per agent, trained on procurement best practices", icon: Brain },
    { title: "Context-Aware Intelligence", description: "Agents understand your organization's patterns, policies, and preferences", icon: Sparkles },
    { title: "Seamless Collaboration", description: "Agents work together, sharing context and coordinating actions across workflows", icon: Users },
  ];

  const accentClasses: Record<string, { bg: string; text: string; border: string; light: string }> = {
    violet: { bg: "bg-violet-600", text: "text-violet-600", border: "border-violet-200", light: "bg-violet-50" },
    teal: { bg: "bg-teal-600", text: "text-teal-600", border: "border-teal-200", light: "bg-teal-50" },
    orange: { bg: "bg-orange-500", text: "text-orange-600", border: "border-orange-200", light: "bg-orange-50" },
    indigo: { bg: "bg-indigo-600", text: "text-indigo-600", border: "border-indigo-200", light: "bg-indigo-50" },
    red: { bg: "bg-red-500", text: "text-red-600", border: "border-red-200", light: "bg-red-50" },
  };

  return (
    <>
      <Helmet>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KDV6R2SDN2"
        ></script>
        <meta property="og:title" content="AI Procurement Features | Prokraya" />
        <meta property="og:description" content="Discover AI Agents that automate sourcing, supplier management, contracts, invoicing, compliance, and spend analytics." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prokraya.ai/ai-agents" />
        <meta property="og:site_name" content="Prokraya" />
        <meta property="og:image" content={LogoBlack} />
        <meta name="twitter:card" content={LogoBlack} />
        <meta name="twitter:site" content="@prokraya" />
        <title>AI Procurement Software Features | Procurement AI Agents | Prokraya</title>
        <meta name="description" content="Explore AI-powered procurement features including natural language processing, document intelligence, predictive analytics, smart matching, anomaly detection, and workflow automation." />
        <meta name="keywords" content="procurement AI, AI procurement software, procurement automation AI, predictive procurement analytics, document intelligence, procurement workflow automation, AI sourcing, procurement intelligence" />
      </Helmet>

      <div className="flex flex-col">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-violet-50 via-white to-white -mt-16 pt-16 pb-16 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed08_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed08_1px,transparent_1px)] bg-[size:5rem_5rem]" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20 text-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-100 to-teal-100 rounded-full text-sm font-medium text-violet-700 mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              AI Agents
            </span>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
              Your{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-teal-500">AI Procurement Team</span>
            </h1>
            <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
              Specialized AI agents that understand procurement context, execute tasks autonomously, and learn from your organization's patterns. Each agent is equipped with 200+ domain-specific prompts and capabilities.
            </p>
            <Link
              to="/book-demo"
              className="inline-flex items-center gap-2 px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors shadow-md shadow-violet-200"
            >
              See Agents in Action
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-14 bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {benefits.map((benefit, index) => (
                <div key={index} className="text-center">
                  <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <benefit.icon className="w-6 h-6 text-violet-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{benefit.title}</h3>
                  <p className="text-gray-500 text-sm">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Agents Grid */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-3">Meet Your Specialized Agents</h2>
              <p className="text-gray-500">Each agent is an expert in their domain, ready to assist you 24/7</p>
            </div>

            <div className="space-y-5">
              {agents.map((agent, index) => {
                const colors = accentClasses[agent.accent];
                return (
                  <div key={index} className={`bg-white border ${colors.border} rounded-2xl p-7 hover:shadow-md transition-all`}>
                    <div className="flex flex-col lg:flex-row gap-7">
                      <div className="flex-shrink-0">
                        <div className={`w-16 h-16 ${colors.light} rounded-2xl flex items-center justify-center`}>
                          <agent.icon className={`w-8 h-8 ${colors.text}`} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="mb-4">
                          <h3 className="text-xl font-bold text-gray-900 mb-1">{agent.name}</h3>
                          <p className={`text-sm font-medium ${colors.text} mb-1`}>{agent.prompts}</p>
                          <p className="text-gray-500">{agent.description}</p>
                        </div>
                        <div className="mb-5">
                          <h4 className="font-semibold text-gray-800 text-sm mb-3">Key Capabilities:</h4>
                          <div className="grid md:grid-cols-2 gap-2">
                            {agent.capabilities.map((cap, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <CheckCircle className={`w-4 h-4 ${colors.text} flex-shrink-0 mt-0.5`} />
                                <span className="text-gray-600 text-sm">{cap}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={`${colors.light} px-4 py-3 rounded-xl`}>
                          <p className="text-xs font-semibold text-gray-600 mb-1">Example Usage:</p>
                          <p className="text-sm text-gray-700">{agent.example}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Ready to Deploy Your AI Procurement Team?</h2>
            <p className="text-gray-400 mb-8">See how our AI agents can transform your procurement operations</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/book-demo" className="px-7 py-3 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors">
                Book a Demo
              </Link>
              <Link href="/contact-us" className="px-7 py-3 border border-white/20 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors">
                Contact Sales
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
