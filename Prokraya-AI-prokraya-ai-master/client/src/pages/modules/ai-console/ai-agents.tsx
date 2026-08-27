import { Link } from "wouter";
import {
  Brain,
  ShoppingCart,
  FileText,
  Receipt,
  Bot,
  ArrowRight,
  Sparkles,
  Users,
  Lock,
  Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AgentCard {
  id: string;
  name: string;
  description: string;
  icon: typeof Brain;
  color: string;
  bgColor: string;
  href: string;
  status: "active" | "coming_soon";
  capabilities: string[];
  modules: string[];
}

const agents: AgentCard[] = [
  {
    id: "vendor",
    name: "Supplier Agent",
    description: "Search suppliers, onboard new suppliers, send invitations, analyze risk, track performance, and get supplier intelligence insights.",
    icon: Users,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    href: "/app/ai-vendor-agent",
    status: "active",
    capabilities: ["Supplier Search", "Supplier Onboarding", "Supplier Invitation", "Risk Assessment", "Performance Tracking", "Compliance Monitoring"],
    modules: ["Suppliers"],
  },
  {
    id: "procurement",
    name: "Procurement Ops Agent",
    description: "Complete buy-to-receive lifecycle — PRs, POs, items, UNSPSC categories, delivery notes, and goods receipt.",
    icon: ShoppingCart,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    href: "/app/ai-procurement-agent",
    status: "active",
    capabilities: ["Create & Update PRs", "Add PR/PO Lines", "Submit for Approval", "PR to PO Conversion", "UNSPSC Categories", "Delivery Notes & GRN", "Search & Analytics"],
    modules: ["Requisitions", "Items", "Purchase Orders", "Categories", "Delivery Notes", "GRN"],
  },
  {
    id: "payables",
    name: "Payables Agent",
    description: "Complete invoice lifecycle — create invoices, add line items, submit for approval, process payments. AI-powered 3-way PO-GRN matching and fraud detection. 16 tools with 4 write actions.",
    icon: Receipt,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    href: "/app/ai-payables-agent",
    status: "active",
    capabilities: ["Create Invoices", "Add Line Items", "Submit & Pay", "3-Way Matching", "Fraud Detection", "Search & Analytics", "Payment Tracking"],
    modules: ["Invoices", "Payments", "Purchase Orders"],
  },
  {
    id: "sourcing",
    name: "Sourcing Agent",
    description: "The most strategic procurement agent.Complete sourcing lifecycle — create RFQs/RFPs/Tenders from natural language, add lines & vendors, publish bids, track responses, evaluate awards, and convert PRs to bids. Smart bid number resolution.",
    icon: Brain,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    href: "/app/ai-sourcing-agent",
    status: "active",
    capabilities: ["Create RFQ/RFP/Tender", "Add Lines & Vendors", "Publish Bids", "PR to Bid Conversion", "Response Tracking", "Evaluation & Awards", "Bid Number Resolution", "Vendor Discovery", "Item & Category Search", "Bid Analytics"],
    modules: ["Bids", "RFQs", "RFPs", "Tenders", "Purchase Requisitions", "Items", "Categories", "Vendors"],
  },
  {
    id: "contracting",
    name: "Contracting Agent",
    description: "Draft contracts, extract key clauses, identify risks, track renewals, and generate redline suggestions.",
    icon: FileText,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    href: "/app/ai-contracting-agent",
    status: "active",
    capabilities: ["Clause Extraction", "Risk Flagging", "Renewal Alerts", "Redline Suggestions", "Obligation Tracking"],
    modules: ["Contracts"],
  },
  {
    id: "compliance",
    name: "Compliance Agent",
    description: "Monitor regulatory compliance, audit trails, policy adherence, and risk management across procurement.",
    icon: Shield,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    href: "/app/ai-compliance-agent",
    status: "active",
    capabilities: ["Policy Compliance", "Audit Support", "Risk Monitoring", "Regulatory Updates", "Document Verification"],
    modules: ["All Modules"],
  },
];

export default function AIAgents() {
  return (
    <div className="px-4 pt-2 pb-3 flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Agents
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your AI-powered procurement workforce. Select an agent to get started.
          </p>
        </div>
        <Badge variant="default" className="gap-1 bg-emerald-500">
          <Sparkles className="h-3 w-3" />
          {agents.filter(a => a.status === "active").length} Agents Active
        </Badge>
      </div>

      {/* All Agents Grid */}
      <div className="flex-1 overflow-y-auto grid content-start grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-2">
        {agents.map((agent) => {
          const isActive = agent.status === "active";

          const cardContent = (
            <Card className={`h-full group border-2 transition-all ${isActive ? "hover-elevate cursor-pointer hover:border-primary/30" : "opacity-60 cursor-not-allowed"}`} data-testid={`card-agent-${agent.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-lg ${agent.bgColor}`}>
                    <agent.icon className={`h-5 w-5 ${agent.color}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <>
                        <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                          Active
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </>
                    ) : (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Lock className="h-3 w-3" />
                        Coming Soon
                      </Badge>
                    )}
                  </div>
                </div>
                <h3 className="font-semibold text-base mb-1">{agent.name}</h3>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {agent.description}
                </p>
                
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-1.5">Modules:</p>
                  <div className="flex flex-wrap gap-1">
                    {agent.modules.map((mod, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {mod}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Capabilities:</p>
                  <div className="flex flex-wrap gap-1">
                    {agent.capabilities.slice(0, 3).map((cap, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                    {agent.capabilities.length > 3 && (
                      <Badge variant="secondary" className="text-xs opacity-70">
                        +{agent.capabilities.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );

          if (isActive) {
            return (
              <Link key={agent.id} href={agent.href}>
                {cardContent}
              </Link>
            );
          }

          return <div key={agent.id}>{cardContent}</div>;
        })}
      </div>

      {/* Info Banner */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">Powered by Advanced AI</p>
            <p className="text-xs text-muted-foreground">
              Each agent is trained on procurement domain knowledge with specialized prompts. 
              Human-in-the-loop ensures safe, auditable decisions across all S2P workflows.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
