import { Link } from "wouter";
import {
  Brain,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Handshake
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
    id: "negotiation",
    name: "Negotiation Intelligence Agent",
    description: "Analyze price quotations, evaluate pricing variances against benchmarks, formulate BATNAs, calculate walk-away thresholds, and build tactical strategies.",
    icon: Handshake,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    href: "/app/ai-negotiation-agent",
    status: "active",
    capabilities: ["Opportunity Discovery", "BATNA Formulation", "Walk-away Thresholding", "Visual Price Benchmarking", "Tactical Concessions"],
    modules: ["Bids", "Contracts", "Suppliers", "Items"],
  },
  {
    id: "cost-intelligence",
    name: "Should Cost Intelligence Agent",
    description: "Understand how much margin a supplier is making by estimating manufacturing/distribution cost structures against market curves.",
    icon: Brain,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    href: "/app/ai-cost-intelligence-agent",
    status: "active",
    capabilities: ["Supplier SOS Cost Estimates", "Manufacturer Cost Structure", "Distributor Margins", "Freight & Commodity Indexing", "Trigger Interceptions"],
    modules: ["Bids", "Suppliers", "Items"],
  },
  {
    id: "spend",
    name: "Spend Intelligence Agent",
    description: "Analyze spending patterns, identify savings opportunities, detect maverick spend, and benchmark against market rates.",
    icon: TrendingUp,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    href: "/app/ai-spend-agent",
    status: "active",
    capabilities: ["Spend Visibility", "Savings Opportunities", "Maverick Detection", "Supplier Performance", "Forecasting"],
    modules: ["All Modules"],
  },
];

export default function AIIntelligenceSuite() {
  return (
    <div className="px-4 pt-2 pb-3 flex flex-col overflow-hidden flex-1 min-h-0 h-full">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Netra Intelligence Suite
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deep analytical agents for negotiation, cost, and spend intelligence.
          </p>
        </div>
        <Badge variant="default" className="gap-1 bg-emerald-500">
          <Sparkles className="h-3 w-3" />
          {agents.filter(a => a.status === "active").length} Agents Active
        </Badge>
      </div>

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
                    <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                      Active
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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

          return (
            <Link key={agent.id} href={agent.href}>
              {cardContent}
            </Link>
          );
        })}
      </div>

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
