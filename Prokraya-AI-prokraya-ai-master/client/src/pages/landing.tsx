import prokrayaLogoDark from "@/assets/images/prokraya-logo-dark.png";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Award,
  BarChart2,
  BarChart3,
  Bot, Brain,
  Building2,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileCheck,
  FileSignature,
  FileText,
  Globe,
  Link2,
  Locate,
  Play,
  Plug,
  Receipt,
  Shield,
  Sparkles,
  Users,
  Workflow, Zap
} from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "AI Sourcing Agent",
    description: "Create RFQs, analyze bids, and award contracts through natural conversation. 200+ domain-specific prompts for complete sourcing lifecycle.",
    color: "text-purple-600",
    bgColor: "bg-gradient-to-br from-purple-500/20 to-violet-500/10",
    borderColor: "border-purple-300/50"
  },
  {
    icon: Users,
    title: "AI Supplier Management",
    description: "Intelligent supplier onboarding, qualification, document verification, performance monitoring, and risk assessment with real-time insights.",
    color: "text-blue-600",
    bgColor: "bg-gradient-to-br from-blue-500/20 to-cyan-500/10",
    borderColor: "border-blue-300/50"
  },
  {
    icon: FileSignature,
    title: "Contract Management",
    description: "Full contract lifecycle with AI clause generation, obligation extraction, expiry alerts, spend utilization tracking, and risk health scoring.",
    color: "text-teal-600",
    bgColor: "bg-gradient-to-br from-teal-500/20 to-cyan-500/10",
    borderColor: "border-teal-300/50"
  },
  {
    icon: Receipt,
    title: "AI Invoice Processing",
    description: "OCR-powered 3-way matching against POs and GRNs, automated fraud detection with 8-point risk scoring, and anomaly identification.",
    color: "text-amber-600",
    bgColor: "bg-gradient-to-br from-amber-500/20 to-orange-500/10",
    borderColor: "border-amber-300/50"
  },
  {
    icon: Shield,
    title: "Risk & Compliance",
    description: "Continuous monitoring of supplier risk scores, contract compliance, document expiry, and proactive alerts before issues escalate.",
    color: "text-rose-600",
    bgColor: "bg-gradient-to-br from-rose-500/20 to-pink-500/10",
    borderColor: "border-rose-300/50"
  },
  {
    icon: BarChart2,
    title: "Spend Intelligence",
    description: "4-tab analytics with 30+ metrics, contract compliance health scores, AI executive summaries, savings identification, and anomaly detection.",
    color: "text-cyan-600",
    bgColor: "bg-gradient-to-br from-cyan-500/20 to-sky-500/10",
    borderColor: "border-cyan-300/50"
  },
  {
    icon: FileText,
    title: "Budgets & Approvals",
    description: "Budget creation, utilization tracking, multi-level approval workflows with conditional routing, and real-time spend visibility by department.",
    color: "text-indigo-600",
    bgColor: "bg-gradient-to-br from-indigo-500/20 to-violet-500/10",
    borderColor: "border-indigo-300/50"
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    description: "14 pre-built reports covering contracts, spend, suppliers, invoices, P2P overview, GRN, and bids — with filters, exports, and KPI summaries.",
    color: "text-emerald-600",
    bgColor: "bg-gradient-to-br from-emerald-500/20 to-teal-500/10",
    borderColor: "border-emerald-300/50"
  },
  {
    icon: Brain,
    title: "Agentic Workflows",
    description: "Trigger-based automation where AI agents execute procurement processes autonomously 24/7 — no human intervention required.",
    color: "text-fuchsia-600",
    bgColor: "bg-gradient-to-br from-fuchsia-500/20 to-pink-500/10",
    borderColor: "border-fuchsia-300/50"
  }
];

const benefits = [
  { metric: "37+", label: "AI-Powered Features" },
  { metric: "6", label: "Specialized AI Agents" },
  { metric: "9", label: "Core S2P Modules" },
  { metric: "100%", label: "Source-to-Pay Coverage" }
];

const s2pSteps = [
  { label: "Purchase Request", icon: FileText, color: "bg-violet-600" },
  { label: "Sourcing & RFQ", icon: Globe, color: "bg-blue-600" },
  { label: "Purchase Order", icon: FileCheck, color: "bg-teal-600" },
  { label: "Goods Receipt", icon: Award, color: "bg-emerald-600" },
  { label: "Invoice & Payment", icon: Receipt, color: "bg-amber-600" },
  { label: "Contract & Audit", icon: FileSignature, color: "bg-rose-600" },
];

const useCases = [
  {
    title: "Create a bid for 50 laptops",
    response: "I'll create an RFQ for 50 laptops. Based on your IT category suppliers, I've identified 5 qualified suppliers. Shall I invite them and set a 7-day response window?",
    agent: "Sourcing Agent"
  },
  {
    title: "Which contracts are expiring this quarter?",
    response: "Found 8 contracts expiring in the next 90 days: 2 within 30 days (urgent), 3 within 60 days. Total value at risk: $1.4M. 5 are marked renewable — want me to initiate renewals?",
    agent: "Contracts Agent"
  },
  {
    title: "Flag suspicious invoices this month",
    response: "Detected 3 high-risk invoices: duplicate amounts from Supplier B, an invoice without a matching PO, and a line item 40% above contracted rate. Flagged for AP review.",
    agent: "Payables Agent"
  },
  {
    title: "Analyze responses for RFQ-2024-089",
    response: "Analyzed 8 responses. Supplier A offers best price (₹4.2L), Supplier C has highest technical score (92/100). Recommending Supplier C based on TCO analysis.",
    agent: "Sourcing Agent"
  }
];

const clients = [
  "Enterprise Manufacturing",
  "Global Retail Chain",
  "Healthcare Network",
  "Real Estate Corporation",
  "Technology Services",
  "Financial Institution"
];

const workflowExamples = [
  {
    trigger: "PR Approved",
    action: "Auto-create RFQ, invite qualified suppliers",
    icon: Zap
  },
  {
    trigger: "Contract Expiring in 30 Days",
    action: "Alert owner, initiate renewal workflow, notify supplier",
    icon: Zap
  },
  {
    trigger: "Invoice Received",
    action: "OCR extraction, 3-way match, fraud check, auto-approve or escalate",
    icon: Zap
  }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex flex-col">
            <img src={prokrayaLogoDark} alt="Prokraya" className="h-8 object-contain object-left" />
            <span className="text-[10px] text-primary font-semibold uppercase tracking-wider ml-[38px] bg-primary/10 px-2 py-0.5 rounded">AI-Powered S2P</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#s2p" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Platform</a>
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#agents" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">AI Agents</a>
            <a href="#integrations" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Integrations</a>
            <a href="#demo" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Demo</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" data-testid="button-header-login">
                Login
              </Button>
            </Link>
            <a href="#demo">
              <Button variant="outline" size="sm" data-testid="button-header-demo">
                Request Demo
              </Button>
            </a>
            {/* <Link href="/free-trial">
              <Button size="sm" className="gap-2" data-testid="button-header-trial">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link> */}
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden py-8 md:py-14">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-cyan-500/10" />
        <div className="absolute top-10 left-10 w-72 h-72 bg-gradient-to-br from-purple-500/30 to-pink-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-40 right-20 w-64 h-64 bg-gradient-to-br from-blue-500/25 to-cyan-500/15 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-gradient-to-br from-orange-500/15 to-amber-500/10 rounded-full blur-3xl" />

        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-4 px-3 py-1 text-xs bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-0">
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              Introducing AI Agentic Procurement
            </Badge>

            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4" data-testid="text-hero-title">
              Procurement That
              <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent"> Thinks</span>,
              <span className="bg-gradient-to-r from-fuchsia-600 to-pink-600 bg-clip-text text-transparent"> Acts</span>, and
              <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent"> Delivers</span>
            </h1>

            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              Meet your AI procurement team. Specialized agents for Sourcing, Suppliers, Contracts, Spend, and Compliance -
              powered by Agentic Workflows that execute procurement processes autonomously, 24/7.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              {/* <Link href="/free-trial">
                <Button size="lg" className="gap-2 px-8 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 shadow-lg shadow-violet-500/25" data-testid="button-hero-trial">
                  <Sparkles className="h-4 w-4" />
                  Start Free Trial
                </Button>
              </Link> */}
              <a href="#demo">
                <Button variant="outline" size="lg" className="gap-2 px-8 border-2 hover:bg-gradient-to-r hover:from-violet-50 hover:to-fuchsia-50 dark:hover:from-violet-950 dark:hover:to-fuchsia-950" data-testid="button-hero-demo">
                  <Play className="h-4 w-4" />
                  Request Demo
                </Button>
              </a>
            </div>

            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Enterprise ready</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>ISO 27001</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>GDPR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CLIENTS */}
      <section className="py-8 border-y bg-muted/30">
        <div className="container mx-auto px-4">
          <p className="text-center text-sm text-muted-foreground mb-8">Trusted by procurement leaders across industries</p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {clients.map((client, i) => (
              <div key={i} className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-5 w-5" />
                <span className="text-sm font-medium">{client}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="py-10 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-5">
            {benefits.map((benefit, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">{benefit.metric}</div>
                <div className="text-sm text-white/80">{benefit.label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 pt-4 border-t border-white/20">
            <Cpu className="h-4 w-4 text-white/70" />
            <p className="text-sm text-white/80 text-center">
              Powered by specialized AI agents for Sourcing, Suppliers, Contracts, Procurement, Payables, and Compliance — running autonomously, 24/7.
            </p>
          </div>
        </div>
      </section>

      {/* S2P FLOW */}
      <section id="s2p" className="py-14 bg-gradient-to-br from-slate-50 to-violet-50/30 dark:from-slate-950 dark:to-violet-950/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">Full Lifecycle Coverage</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              One Platform. The <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">Complete S2P Loop.</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Every step of your procurement journey — connected, automated, and AI-enhanced. No more switching between tools.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-0 max-w-5xl mx-auto mb-10">
            {s2pSteps.map((step, i) => (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-14 h-14 rounded-2xl ${step.color} flex items-center justify-center shadow-lg`}>
                    <step.icon className="h-7 w-7 text-white" />
                  </div>
                  <span className="text-xs font-medium text-center max-w-[80px]">{step.label}</span>
                </div>
                {i < s2pSteps.length - 1 && (
                  <ChevronRight className="h-6 w-6 text-muted-foreground/40 mx-1 md:mx-3 mb-4 shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              { label: "AI-powered at every step", desc: "From PR creation to contract closeout, AI assists, validates, and acts" },
              { label: "Connected data across modules", desc: "Contracts link to POs, invoices link to GRNs, spend links to budgets" },
              { label: "Full audit trail", desc: "Every action logged with user, timestamp, and context for compliance" }
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl border bg-background">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold mb-1">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AGENTIC WORKFLOWS */}
      <section id="workflows" className="py-14 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-cyan-50/30 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-cyan-950/10">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3 border-emerald-300 text-emerald-700 dark:text-emerald-400">
              <Zap className="h-3 w-3 mr-1" />
              Agentic Workflows
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Configure Once, <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Runs Autonomously</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Beyond conversations — set up trigger-based workflows where AI agents execute procurement processes automatically, 24/7, without human intervention.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {workflowExamples.map((wf, i) => (
              <Card key={i} className="overflow-hidden border-2 border-emerald-200 dark:border-emerald-800 hover-elevate">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <wf.icon className="h-4 w-4 text-white" />
                    <span className="text-sm font-medium text-white">When: {wf.trigger}</span>
                  </div>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">{wf.action}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Card className="bg-gradient-to-r from-emerald-600 to-teal-600 border-0 text-white overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                    <Workflow className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">Visual Workflow Builder</h3>
                    <p className="text-white/90 text-sm">
                      Drag-and-drop interface to design complex procurement automations
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-teal-600 to-cyan-600 border-0 text-white overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                    <span className="text-2xl font-bold text-white">35+</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">Ready-to-Use Templates</h3>
                    <p className="text-white/90 text-sm">
                      Pre-built workflows for suppliers, sourcing, contracts, invoicing & more
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">9 Core Modules</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Complete Source-to-Pay Platform
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From supplier discovery to contract closeout — every module connected, every workflow AI-enhanced.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <Card key={i} className={`hover-elevate transition-all duration-300 border-2 ${feature.borderColor} overflow-hidden`}>
                <CardContent className={`p-5 ${feature.bgColor}`}>
                  <div className={`w-12 h-12 rounded-xl bg-white dark:bg-gray-900 shadow-lg flex items-center justify-center mb-3`}>
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <h3 className="text-base font-semibold mb-1.5">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AI AGENTS */}
      <section id="agents" className="py-14 bg-gradient-to-br from-slate-50 via-violet-50/50 to-fuchsia-50/30 dark:from-slate-950 dark:via-violet-950/30 dark:to-fuchsia-950/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">AI Agents</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Action-Capable AI Agents
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              AI agents that execute real procurement actions — creating documents, managing suppliers, processing invoices, and running sourcing events autonomously.
            </p>
          </div>

          {/* Specialized Agents */}
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <Card className="overflow-hidden border-2 border-purple-400/30 shadow-xl shadow-purple-500/10">
              <div className="bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Sourcing Agent</h3>
                    <p className="text-xs text-white/80">Smart supplier recommendations & bid strategy</p>
                  </div>
                </div>
              </div>
              <CardContent className="p-5 bg-gradient-to-b from-purple-50/50 to-transparent dark:from-purple-950/30">
                <div className="space-y-2 mb-4">
                  {["RFQ, RFP & Tender Creation", "AI Bid Strategy Analysis", "Market Price Intelligence", "AI Technical & Commercial Evaluation", "Optimal Award Recommendations", "AI Negotiation Suggestions"].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-purple-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-gradient-to-r from-purple-100 to-violet-100 dark:from-purple-900/50 dark:to-violet-900/50 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                  <p className="text-xs text-purple-600 dark:text-purple-400 mb-2 font-medium">Example conversation:</p>
                  <p className="text-sm font-medium mb-2">"Create an RFQ for office furniture, budget 5 lakhs"</p>
                  <p className="text-sm text-muted-foreground">Agent creates RFQ, suggests items, identifies 8 qualified suppliers, and prepares invitation.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-2 border-blue-400/30 shadow-xl shadow-blue-500/10">
              <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Supplier Agent</h3>
                    <p className="text-xs text-white/80">8 function-calling tools for supplier lifecycle</p>
                  </div>
                </div>
              </div>
              <CardContent className="p-5 bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-950/30">
                <div className="space-y-2 mb-4">
                  {["Supplier Onboarding & Invitation", "Document Verification & OCR", "Compliance Monitoring", "Performance Scoring", "Risk Assessment & Alerts", "Profile Management & Approval"].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/50 dark:to-cyan-900/50 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-2 font-medium">Example conversation:</p>
                  <p className="text-sm font-medium mb-2">"Which suppliers have compliance issues?"</p>
                  <p className="text-sm text-muted-foreground">Agent shows 12 suppliers with expiring documents, offers to send automated renewal reminders.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              { name: "Procurement Ops Agent", icon: FileCheck, description: "29 tools — requisitions, POs, items, categories, delivery notes, GRNs", gradient: "from-emerald-500 to-teal-500" },
              { name: "Payables Agent", icon: BarChart3, description: "16 tools — invoices, payments, AI matching, fraud detection", gradient: "from-orange-500 to-amber-500" }
            ].map((agent, i) => (
              <Card key={i} className="p-4 border-2 hover-elevate">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${agent.gradient} flex items-center justify-center`}>
                    <agent.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Invoice Fraud Detection", detail: "8-check risk scoring across historical patterns" },
              { label: "Contract Clause AI", detail: "Generate, extract, improve & analyze contract clauses" },
              { label: "AI Invoice Matching", detail: "OCR-powered 3-way match against POs & GRNs" },
              { label: "Market Price Intelligence", detail: "PO + bid history for price benchmarking" }
            ].map((cap, i) => (
              <div key={i} className="text-center p-4 rounded-xl bg-gradient-to-b from-violet-50 to-transparent dark:from-violet-950/30 border border-violet-200/50 dark:border-violet-800/50">
                <Shield className="h-5 w-5 text-violet-600 mx-auto mb-2" />
                <p className="text-sm font-semibold mb-1">{cap.label}</p>
                <p className="text-xs text-muted-foreground">{cap.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section id="integrations" className="py-14 bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-blue-950/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">
              <Plug className="h-3 w-3 mr-1" />
              Integrations
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Connects With Your <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Existing Stack</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Prokraya integrates with your existing enterprise systems — connect your ERP and get started without disrupting your current setup.
            </p>
          </div>

          <div className="space-y-6 max-w-5xl mx-auto">
            {/* SAP */}
            <Card className="border-2 border-blue-200/60 dark:border-blue-800/40 overflow-hidden">
              <div className="flex items-stretch">
                <div className="bg-gradient-to-b from-blue-600 to-blue-700 px-5 flex items-center justify-center min-w-[100px]">
                  <div className="text-center">
                    <span className="text-2xl font-black text-white tracking-tight">SAP</span>
                    <p className="text-[10px] text-blue-200 mt-0.5">5 variants</p>
                  </div>
                </div>
                <CardContent className="p-4 flex-1">
                  <div className="flex flex-wrap gap-2">
                    {["S/4HANA Cloud", "S/4HANA On-Premise", "ECC 6.0", "Business One", "Business ByDesign"].map((v, i) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <CheckCircle2 className="h-3 w-3 mr-1 text-blue-500" />
                        {v}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </div>
            </Card>

            {/* Oracle */}
            <Card className="border-2 border-red-200/60 dark:border-red-800/40 overflow-hidden">
              <div className="flex items-stretch">
                <div className="bg-gradient-to-b from-red-600 to-red-700 px-5 flex items-center justify-center min-w-[100px]">
                  <div className="text-center">
                    <span className="text-xl font-black text-white tracking-tight">ORACLE</span>
                    <p className="text-[10px] text-red-200 mt-0.5">4 variants</p>
                  </div>
                </div>
                <CardContent className="p-4 flex-1">
                  <div className="flex flex-wrap gap-2">
                    {["ERP Cloud (Fusion)", "E-Business Suite R12", "JD Edwards", "PeopleSoft"].map((v, i) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                        <CheckCircle2 className="h-3 w-3 mr-1 text-red-500" />
                        {v}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </div>
            </Card>

            {/* Microsoft */}
            <Card className="border-2 border-cyan-200/60 dark:border-cyan-800/40 overflow-hidden">
              <div className="flex items-stretch">
                <div className="bg-gradient-to-b from-cyan-600 to-blue-700 px-5 flex items-center justify-center min-w-[100px]">
                  <div className="text-center">
                    <span className="text-lg font-black text-white tracking-tight leading-tight">DYNAMICS<br />365</span>
                    <p className="text-[10px] text-cyan-200 mt-0.5">5 variants</p>
                  </div>
                </div>
                <CardContent className="p-4 flex-1">
                  <div className="flex flex-wrap gap-2">
                    {["Finance & Operations", "Business Central", "GP (Great Plains)", "NAV", "AX 2012"].map((v, i) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                        <CheckCircle2 className="h-3 w-3 mr-1 text-cyan-500" />
                        {v}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </div>
            </Card>

            {/* Other integrations row */}
            <div className="grid md:grid-cols-4 gap-4 pt-2">
              {[
                { label: "OpenAI", sub: "GPT-4o · Vision · Embeddings", color: "from-emerald-500 to-teal-500", badge: "AI" },
                { label: "Google AI", sub: "Gemini Pro · Generative AI", color: "from-blue-500 to-indigo-500", badge: "AI" },
                { label: "Stripe", sub: "Payments · Subscriptions", color: "from-violet-500 to-purple-500", badge: "Payments" },
                { label: "Custom REST API", sub: "Inbound webhook gateway for any system", color: "from-slate-500 to-gray-600", badge: "Open" },
              ].map((item, i) => (
                <Card key={i} className="border-2 border-muted hover-elevate overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                        <Link2 className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.label}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{item.badge}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Don't see your system? <span className="font-medium text-foreground">Contact us</span> — we support custom integrations via REST API.
            </p>
          </div>
        </div>
      </section>

      {/* DEMO / REQUEST DEMO FORM */}
      <section id="demo" className="py-14 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600" />
        <div className="absolute top-10 left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-2xl mx-auto">
            <Card className="overflow-hidden shadow-2xl border-0">
              <div className="bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-600 p-6 text-white text-center relative">
                <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="h-7 w-7 text-white" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold mb-1">See Prokraya in Action</h2>
                  <p className="text-white/90 text-sm">Schedule a personalized demo with our procurement AI experts</p>
                </div>
              </div>
              <CardContent className="p-6">
                <form className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Full Name</label>
                      <input
                        type="text"
                        placeholder="John Smith"
                        className="w-full px-4 py-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        data-testid="input-demo-name"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Work Email</label>
                      <input
                        type="email"
                        placeholder="john@company.com"
                        className="w-full px-4 py-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        data-testid="input-demo-email"
                      />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Company</label>
                      <input
                        type="text"
                        placeholder="Acme Corporation"
                        className="w-full px-4 py-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        data-testid="input-demo-company"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Phone</label>
                      <input
                        type="tel"
                        placeholder="+91 98765 43210"
                        className="w-full px-4 py-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        data-testid="input-demo-phone"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">What interests you most?</label>
                    <select
                      className="w-full px-4 py-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      data-testid="select-demo-interest"
                    >
                      <option value="">Select an option</option>
                      <option value="sourcing">AI Sourcing Agent</option>
                      <option value="vendor">AI Supplier Management</option>
                      <option value="workflows">Agentic Workflows</option>
                      <option value="compliance">Compliance & Risk</option>
                      <option value="full">Full S2P Platform</option>
                    </select>
                  </div>
                  <Button type="submit" className="w-full gap-2" size="lg" data-testid="button-submit-demo">
                    Request Demo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground text-center mt-4">
                  By submitting, you agree to our privacy policy. We'll never spam you.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-muted/50 border-t py-8">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-12 gap-6 mb-6">
            <div className="md:col-span-4">
              <div className="flex items-center mb-4">
                <img src={prokrayaLogoDark} alt="Prokraya" className="h-6 object-contain object-left" />
              </div>
              <p className="text-sm text-muted-foreground">
                AI-powered Source-to-Pay platform transforming how enterprises manage procurement.
              </p>
            </div>
            <div className="md:col-span-2">
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#s2p" className="hover:text-foreground transition-colors">Platform</a></li>
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#agents" className="hover:text-foreground transition-colors">AI Agents</a></li>
                <li><a href="#integrations" className="hover:text-foreground transition-colors">Integrations</a></li>
                <li><a href="#demo" className="hover:text-foreground transition-colors">Demo</a></li>
              </ul>
              {/* <h4 className="font-semibold my-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
              </ul> */}
            </div>
            <div className="md:col-span-6">
              <div>
                <h4 className="font-semibold mb-4">Locations</h4>
              </div>

              <div className="text-sm text-muted-foreground">
                <div className="flex mb-2">
                  <Locate className="w-4 h-4 mt-0.5 mr-2 shrink-0" />
                  <strong>PROKRAYA TECH PRIVATE LIMITED</strong>
                </div>
                <div className="pl-5 ml-1">Plot No. 5, Ground Floor, North Block, JVP Building, Software Units Layout, Madhapur, Hyderabad – 500081</div>
              </div>
              <br />

              <div className="text-sm text-muted-foreground">
                <div className="flex mb-2">
                  <Locate className="w-4 h-4 mt-0.5 mr-2 shrink-0" /> <strong>PROKRAYA AI TECHNOLOGIES - FZCO</strong>
                </div>
                <div className="pl-5 ml-1">
                  Building A1, Dubai Digital Park, Dubai Silicon Oasis, Dubai,
                  United Arab Emirates</div>
              </div>
              <br />

              <div className="text-sm text-muted-foreground">
                <div className="flex mb-2">
                  <Locate className="w-4 h-4 mt-0.5 mr-2 shrink-0" />
                  <strong>PROKRAYA AI INC</strong>
                </div>
                <div className="pl-5 ml-1">4750 WILLOW RD SUITE 200 PLEASENTON, CA, 94588</div>
              </div>
            </div>
            {/* <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Security</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Compliance</a></li>
              </ul>
            </div> */}
          </div>
          <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © 2026 Prokraya. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-xs">GDPR Compliant</Badge>
              <Badge variant="outline" className="text-xs">ISO 27001</Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
