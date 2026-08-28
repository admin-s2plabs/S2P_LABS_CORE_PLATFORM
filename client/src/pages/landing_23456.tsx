import { Link } from "wouter";
import prokrayaLogoDark from "@/assets/images/prokraya-logo-dark.png";

import { 
  Bot, Brain, Shield, TrendingUp, Users, FileCheck, 
  ArrowRight, CheckCircle2, Sparkles, BarChart3, Clock,
  Building2, Globe, Award, Play, MessageSquare,
  Workflow, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    title: "AI Vendor Agent", 
    description: "Intelligent vendor onboarding, qualification, performance monitoring, and risk assessment with real-time insights.",
    color: "text-blue-600",
    bgColor: "bg-gradient-to-br from-blue-500/20 to-cyan-500/10",
    borderColor: "border-blue-300/50"
  },
  {
    icon: Brain,
    title: "Agentic Workflows",
    description: "AI agents that don't just answer questions - they take actions, create documents, and execute procurement tasks autonomously.",
    color: "text-emerald-600",
    bgColor: "bg-gradient-to-br from-emerald-500/20 to-teal-500/10",
    borderColor: "border-emerald-300/50"
  },
  {
    icon: FileCheck,
    title: "Smart Document Processing",
    description: "Auto-extract data from vendor documents, validate compliance, and flag discrepancies with 99% accuracy.",
    color: "text-orange-600",
    bgColor: "bg-gradient-to-br from-orange-500/20 to-amber-500/10",
    borderColor: "border-orange-300/50"
  },
  {
    icon: Shield,
    title: "Risk & Compliance",
    description: "Continuous monitoring of vendor risk scores, compliance status, and proactive alerts before issues escalate.",
    color: "text-rose-600",
    bgColor: "bg-gradient-to-br from-rose-500/20 to-pink-500/10",
    borderColor: "border-rose-300/50"
  },
  {
    icon: BarChart3,
    title: "Spend Intelligence",
    description: "AI-powered spend analysis, savings opportunities identification, and maverick spend detection across categories.",
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
    description: "14 pre-built reports covering contracts, spend, vendors, invoices, P2P overview, GRN, and bids — with filters, exports, and KPI summaries.",
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
  { metric: "70%", label: "Faster Sourcing Cycles" },
  { metric: "50%", label: "Reduction in Manual Tasks" },
  { metric: "3x", label: "More Bids Evaluated" },
  { metric: "99%", label: "Document Accuracy" }
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
    response: "I'll create an RFQ for 50 laptops. Based on your IT category vendors, I've identified 5 qualified suppliers. Shall I invite them and set a 7-day response window?",
    agent: "Sourcing Agent"
  },
  {
    title: "Show me vendors expiring next month",
    response: "Found 12 vendors with expiring certifications: 4 ISO certificates, 5 trade licenses, 3 insurance policies. I can send renewal reminders automatically.",
    agent: "Vendor Agent"
  },
  {
    title: "Analyze responses for RFQ-2024-089",
    response: "Analyzed 8 responses. Vendor A offers best price (₹4.2L), Vendor C has highest technical score (92/100). Recommending Vendor C based on TCO analysis.",
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
    action: "Auto-create RFQ, invite qualified vendors",
    icon: Zap
  },
  {
    trigger: "Document Expiring",
    action: "Send renewal reminders, track compliance",
    icon: Zap
  },
  {
    trigger: "Bid Responses Received",
    action: "Analyze, score, and recommend winner",
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
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#agents" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">AI Agents</a>
            <a href="#workflows" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Workflows</a>
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
            <Link href="/free-trial">
              <Button size="sm" className="gap-2" data-testid="button-header-trial">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

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
              Meet your AI procurement team. Specialized agents for Sourcing, Vendors, Contracts, Spend, and Compliance - 
              powered by Agentic Workflows that execute procurement processes autonomously, 24/7.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Link href="/free-trial">
                <Button size="lg" className="gap-2 px-8 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 shadow-lg shadow-violet-500/25" data-testid="button-hero-trial">
                  <Sparkles className="h-4 w-4" />
                  Start Free Trial
                </Button>
              </Link>
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
                <span>SOC 2 compliant</span>
              </div>
            </div>

          </div>
        </div>
      </section>

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

      <section className="py-10 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {benefits.map((benefit, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">{benefit.metric}</div>
                <div className="text-sm text-white/80">{benefit.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HERO FEATURE: Agentic Workflows - Main Differentiator */}
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
              Beyond conversations - set up trigger-based workflows where AI agents execute procurement processes automatically, 24/7, without human intervention.
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
                      Pre-built workflows for vendor, sourcing, compliance & more
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="features" className="py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Complete Source-to-Pay Platform
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From vendor discovery to payment reconciliation, Prokraya covers the entire procurement lifecycle with AI-powered automation.
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

      <section id="agents" className="py-14 bg-gradient-to-br from-slate-50 via-violet-50/50 to-fuchsia-50/30 dark:from-slate-950 dark:via-violet-950/30 dark:to-fuchsia-950/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">AI Agents</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Action-Capable AI Agents
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              AI agents that execute real procurement actions — creating documents, managing vendors, processing invoices, and running sourcing events autonomously.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <Card className="overflow-hidden border-2 border-purple-400/30 shadow-xl shadow-purple-500/10">
              <div className="bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Sourcing Agent</h3>
                    <p className="text-xs text-white/80">Smart vendor recommendations & bid strategy</p>
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
                  <p className="text-sm text-muted-foreground">Agent creates RFQ, suggests items, identifies 8 qualified vendors, and prepares invitation.</p>
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
                    <h3 className="text-lg font-bold text-white">Vendor Agent</h3>
                    <p className="text-xs text-white/80">8 function-calling tools for vendor lifecycle</p>
                  </div>
                </div>
              </div>
              <CardContent className="p-5 bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-950/30">
                <div className="space-y-2 mb-4">
                  {["Vendor Onboarding & Invitation", "Document Verification & OCR", "Compliance Monitoring", "Performance Scoring", "Risk Assessment & Alerts", "Profile Management & Approval"].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/50 dark:to-cyan-900/50 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-2 font-medium">Example conversation:</p>
                  <p className="text-sm font-medium mb-2">"Which vendors have compliance issues?"</p>
                  <p className="text-sm text-muted-foreground">Agent shows 12 vendors with expiring documents, offers to send automated renewal reminders.</p>
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
              { label: "PO Anomaly Detection", detail: "Pricing, duplicates & inconsistency analysis" },
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


      <section id="benefits" className="py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">How It Works</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Just Ask. AI Does the Rest.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              No complex menus, no training required. Simply describe what you need in plain language.
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {useCases.map((useCase, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-start gap-3 p-3 bg-muted/50 border-b">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">You ask:</p>
                      <p className="font-medium text-sm">{useCase.title}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3">
                    <div className="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                      <Bot className="h-3.5 w-3.5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">{useCase.agent} responds:</p>
                      <p className="text-sm text-muted-foreground">{useCase.response}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

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
                      <option value="vendor">AI Vendor Management</option>
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

      <section className="py-10 border-t">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <Globe className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">Global Reach</h3>
              <p className="text-sm text-muted-foreground">Supporting procurement teams across 15+ countries</p>
            </div>
            <div>
              <Award className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">Industry Recognition</h3>
              <p className="text-sm text-muted-foreground">Recognized by leading analyst firms for AI innovation</p>
            </div>
            <div>
              <Clock className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">24/7 AI Support</h3>
              <p className="text-sm text-muted-foreground">AI agents work around the clock, human support when needed</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-muted/50 border-t py-8">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-6 mb-6">
            <div>
              <div className="flex items-center mb-4">
                <img src={prokrayaLogoDark} alt="Prokraya" className="h-6 object-contain object-left" />
              </div>
              <p className="text-sm text-muted-foreground">
                AI-powered Source-to-Pay platform transforming how enterprises manage procurement.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">AI Sourcing Agent</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">AI Vendor Agent</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Agentic Workflows</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Analytics</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Security</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Compliance</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © 2026 Prokraya. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-xs">SOC 2 Type II</Badge>
              <Badge variant="outline" className="text-xs">GDPR Compliant</Badge>
              <Badge variant="outline" className="text-xs">ISO 27001</Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
