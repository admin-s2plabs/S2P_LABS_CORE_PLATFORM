import { useState } from "react";
import { Link } from "wouter";
import { 
  Workflow, Play, Plus, Clock, CheckCircle2, 
  ArrowRight, Users, Brain, FileText, TrendingUp,
  Zap, GitBranch, Bell, Search, ArrowLeft,
  ShoppingCart, Shield, FileCheck, RefreshCw, AlertTriangle,
  DollarSign, Package, Truck, BarChart3, Building2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger: string;
  agents: string[];
  steps: number;
  usedBy: number;
  icon: typeof Workflow;
}

const templateCategories = [
  { id: "all", label: "All Templates" },
  { id: "vendor", label: "Vendor Management" },
  { id: "sourcing", label: "Sourcing & RFQ" },
  { id: "procurement", label: "Procurement" },
  { id: "compliance", label: "Compliance" },
  { id: "contracts", label: "Contracts" },
  { id: "spend", label: "Spend Analytics" },
];

const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "tpl-1",
    name: "Auto-Source High-Value PRs",
    description: "Automatically create RFQ and invite top vendors when PR over threshold is approved",
    category: "sourcing",
    trigger: "PR Approved (High Value)",
    agents: ["Vendor Agent", "Sourcing Agent"],
    steps: 5,
    usedBy: 156,
    icon: ShoppingCart,
  },
  {
    id: "tpl-2",
    name: "Vendor Compliance Monitor",
    description: "Auto-suspend vendors with expired documents and notify compliance team",
    category: "compliance",
    trigger: "Daily Schedule",
    agents: ["Vendor Agent"],
    steps: 5,
    usedBy: 234,
    icon: Shield,
  },
  {
    id: "tpl-3",
    name: "Contract Renewal Pipeline",
    description: "Trigger renewal process 60 days before contract expiry",
    category: "contracts",
    trigger: "Contract Expiry - 60 Days",
    agents: ["Contracts Agent", "Vendor Agent", "Spend Agent"],
    steps: 5,
    usedBy: 189,
    icon: FileCheck,
  },
  {
    id: "tpl-4",
    name: "New Vendor Onboarding",
    description: "Automated document validation and category assignment for new vendors",
    category: "vendor",
    trigger: "New Vendor Registered",
    agents: ["Vendor Agent"],
    steps: 5,
    usedBy: 312,
    icon: Users,
  },
  {
    id: "tpl-5",
    name: "RFQ Auto-Response",
    description: "Automatically evaluate vendor responses and rank by price/quality",
    category: "sourcing",
    trigger: "RFQ Response Received",
    agents: ["Sourcing Agent", "Spend Agent"],
    steps: 4,
    usedBy: 98,
    icon: Brain,
  },
  {
    id: "tpl-6",
    name: "Vendor Risk Assessment",
    description: "Weekly risk score update for all active vendors",
    category: "vendor",
    trigger: "Weekly Schedule",
    agents: ["Vendor Agent"],
    steps: 4,
    usedBy: 145,
    icon: AlertTriangle,
  },
  {
    id: "tpl-7",
    name: "Budget Threshold Alert",
    description: "Alert when department spend reaches 80% of budget",
    category: "spend",
    trigger: "Budget Threshold",
    agents: ["Spend Agent"],
    steps: 3,
    usedBy: 267,
    icon: DollarSign,
  },
  {
    id: "tpl-8",
    name: "PO Auto-Generation",
    description: "Create purchase order when RFQ is awarded",
    category: "procurement",
    trigger: "RFQ Awarded",
    agents: ["Sourcing Agent"],
    steps: 4,
    usedBy: 178,
    icon: FileText,
  },
  {
    id: "tpl-9",
    name: "Invoice 3-Way Match",
    description: "Automated matching of invoice, PO, and goods receipt",
    category: "procurement",
    trigger: "Invoice Received",
    agents: ["Spend Agent"],
    steps: 5,
    usedBy: 223,
    icon: RefreshCw,
  },
  {
    id: "tpl-10",
    name: "Delivery Tracking",
    description: "Monitor delivery status and alert on delays",
    category: "procurement",
    trigger: "PO Dispatched",
    agents: ["Vendor Agent"],
    steps: 4,
    usedBy: 134,
    icon: Truck,
  },
  {
    id: "tpl-11",
    name: "Spend Analysis Report",
    description: "Generate monthly spend analysis by category and vendor",
    category: "spend",
    trigger: "Monthly Schedule",
    agents: ["Spend Agent"],
    steps: 3,
    usedBy: 289,
    icon: BarChart3,
  },
  {
    id: "tpl-12",
    name: "Vendor Performance Review",
    description: "Quarterly vendor scorecard generation and notification",
    category: "vendor",
    trigger: "Quarterly Schedule",
    agents: ["Vendor Agent", "Spend Agent"],
    steps: 5,
    usedBy: 167,
    icon: TrendingUp,
  },
  {
    id: "tpl-13",
    name: "Contract Compliance Check",
    description: "Verify vendor deliverables against contract terms",
    category: "contracts",
    trigger: "Monthly Schedule",
    agents: ["Contracts Agent", "Vendor Agent"],
    steps: 4,
    usedBy: 112,
    icon: FileCheck,
  },
  {
    id: "tpl-14",
    name: "Catalog Price Update",
    description: "Update catalog prices based on new vendor quotations",
    category: "procurement",
    trigger: "Quote Received",
    agents: ["Sourcing Agent"],
    steps: 3,
    usedBy: 89,
    icon: Package,
  },
  {
    id: "tpl-15",
    name: "Supplier Diversity Report",
    description: "Track and report on diversity supplier spend",
    category: "compliance",
    trigger: "Quarterly Schedule",
    agents: ["Spend Agent", "Vendor Agent"],
    steps: 4,
    usedBy: 76,
    icon: Building2,
  },
  {
    id: "tpl-16",
    name: "Emergency Purchase Fast-Track",
    description: "Expedite approval for urgent purchases with auto-vendor selection",
    category: "procurement",
    trigger: "PR Marked Urgent",
    agents: ["Sourcing Agent", "Vendor Agent"],
    steps: 4,
    usedBy: 203,
    icon: Zap,
  },
  {
    id: "tpl-17",
    name: "Vendor Bank Details Verification",
    description: "Validate bank account changes before processing payments",
    category: "compliance",
    trigger: "Bank Details Updated",
    agents: ["Vendor Agent"],
    steps: 3,
    usedBy: 187,
    icon: Shield,
  },
  {
    id: "tpl-18",
    name: "Goods Receipt Notification",
    description: "Notify stakeholders when goods are received and trigger inspection",
    category: "procurement",
    trigger: "GRN Created",
    agents: ["Vendor Agent"],
    steps: 4,
    usedBy: 156,
    icon: Package,
  },
  {
    id: "tpl-19",
    name: "Maverick Spend Detection",
    description: "Identify and flag purchases made outside approved contracts",
    category: "spend",
    trigger: "PO Created",
    agents: ["Spend Agent", "Contracts Agent"],
    steps: 4,
    usedBy: 234,
    icon: AlertTriangle,
  },
  {
    id: "tpl-20",
    name: "Vendor Consolidation Analysis",
    description: "Identify opportunities to consolidate vendors by category",
    category: "vendor",
    trigger: "Monthly Schedule",
    agents: ["Vendor Agent", "Spend Agent"],
    steps: 5,
    usedBy: 98,
    icon: Users,
  },
  {
    id: "tpl-21",
    name: "Payment Terms Optimization",
    description: "Analyze and recommend optimal payment terms based on cash flow",
    category: "spend",
    trigger: "Weekly Schedule",
    agents: ["Spend Agent"],
    steps: 4,
    usedBy: 145,
    icon: DollarSign,
  },
  {
    id: "tpl-22",
    name: "Contract Expiry Escalation",
    description: "Escalate to management when contract renewal is overdue",
    category: "contracts",
    trigger: "Contract Expiry - 7 Days",
    agents: ["Contracts Agent"],
    steps: 3,
    usedBy: 167,
    icon: Clock,
  },
  {
    id: "tpl-23",
    name: "Duplicate Invoice Detection",
    description: "Flag potential duplicate invoices before payment processing",
    category: "compliance",
    trigger: "Invoice Received",
    agents: ["Spend Agent"],
    steps: 4,
    usedBy: 278,
    icon: RefreshCw,
  },
  {
    id: "tpl-24",
    name: "Preferred Vendor Matching",
    description: "Auto-suggest preferred vendors based on item category and history",
    category: "sourcing",
    trigger: "PR Created",
    agents: ["Vendor Agent", "Sourcing Agent"],
    steps: 4,
    usedBy: 189,
    icon: Brain,
  },
  {
    id: "tpl-25",
    name: "Savings Opportunity Alert",
    description: "Notify buyers when better pricing is available from alternate vendors",
    category: "spend",
    trigger: "Quote Received",
    agents: ["Spend Agent", "Sourcing Agent"],
    steps: 5,
    usedBy: 212,
    icon: TrendingUp,
  },
  {
    id: "tpl-26",
    name: "RFQ Deadline Reminder",
    description: "Send automated reminders to vendors before RFQ submission deadline",
    category: "sourcing",
    trigger: "RFQ Deadline - 48 Hours",
    agents: ["Sourcing Agent"],
    steps: 3,
    usedBy: 245,
    icon: Clock,
  },
  {
    id: "tpl-27",
    name: "Bid Comparison Matrix",
    description: "Auto-generate comparison matrix when all vendor bids are received",
    category: "sourcing",
    trigger: "All Bids Received",
    agents: ["Sourcing Agent", "Spend Agent"],
    steps: 4,
    usedBy: 178,
    icon: BarChart3,
  },
  {
    id: "tpl-28",
    name: "Reverse Auction Trigger",
    description: "Initiate reverse auction when multiple qualified bids exceed threshold",
    category: "sourcing",
    trigger: "Bid Count > 3",
    agents: ["Sourcing Agent"],
    steps: 5,
    usedBy: 89,
    icon: TrendingUp,
  },
  {
    id: "tpl-29",
    name: "Single Source Justification",
    description: "Route for approval when only one vendor responds to RFQ",
    category: "sourcing",
    trigger: "Single Bid Received",
    agents: ["Sourcing Agent", "Vendor Agent"],
    steps: 4,
    usedBy: 134,
    icon: AlertTriangle,
  },
  {
    id: "tpl-30",
    name: "Technical Evaluation Workflow",
    description: "Route RFP responses to technical team for scoring before commercial review",
    category: "sourcing",
    trigger: "RFP Response Received",
    agents: ["Sourcing Agent"],
    steps: 5,
    usedBy: 156,
    icon: FileCheck,
  },
  {
    id: "tpl-31",
    name: "Contract Amendment Tracker",
    description: "Track and notify stakeholders of contract amendments and variations",
    category: "contracts",
    trigger: "Amendment Requested",
    agents: ["Contracts Agent"],
    steps: 4,
    usedBy: 167,
    icon: FileText,
  },
  {
    id: "tpl-32",
    name: "Contract Value Threshold Alert",
    description: "Alert when contract spend approaches maximum value limit",
    category: "contracts",
    trigger: "Spend > 80% Contract Value",
    agents: ["Contracts Agent", "Spend Agent"],
    steps: 3,
    usedBy: 198,
    icon: DollarSign,
  },
  {
    id: "tpl-33",
    name: "SLA Breach Notification",
    description: "Monitor vendor SLAs and escalate breaches automatically",
    category: "contracts",
    trigger: "SLA Metric Breached",
    agents: ["Contracts Agent", "Vendor Agent"],
    steps: 4,
    usedBy: 223,
    icon: AlertTriangle,
  },
  {
    id: "tpl-34",
    name: "Contract Milestone Tracker",
    description: "Track delivery milestones and trigger payments on completion",
    category: "contracts",
    trigger: "Milestone Date",
    agents: ["Contracts Agent"],
    steps: 5,
    usedBy: 145,
    icon: CheckCircle2,
  },
  {
    id: "tpl-35",
    name: "Blanket Order Release",
    description: "Auto-create release orders against blanket purchase agreements",
    category: "sourcing",
    trigger: "Inventory Below Threshold",
    agents: ["Sourcing Agent", "Vendor Agent"],
    steps: 4,
    usedBy: 189,
    icon: ShoppingCart,
  },
];

function TemplateCard({ template }: { template: WorkflowTemplate }) {
  const Icon = template.icon;

  return (
    <Card className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">{template.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {template.description}
            </p>
            
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                {template.trigger}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {template.steps} steps
              </Badge>
            </div>

            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {template.agents.map((agent, idx) => (
                <Badge key={idx} variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                  <Brain className="h-2.5 w-2.5 mr-1" />
                  {agent}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end mt-4 pt-3 border-t">
          <Link href={`/app/workflow-builder?id=${template.id}`}>
            <Button size="sm" data-testid={`button-use-template-${template.id}`}>
              <Plus className="h-3 w-3 mr-1" />
              Use Template
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WorkflowTemplates() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredTemplates = workflowTemplates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "all" || template.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryCount = (categoryId: string) => {
    if (categoryId === "all") return workflowTemplates.length;
    return workflowTemplates.filter(t => t.category === categoryId).length;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/workflows">
            <Button size="icon" variant="ghost" data-testid="button-back-to-workflows">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              Workflow Templates
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pre-built automation templates to accelerate your procurement workflows
            </p>
          </div>
        </div>
        <Link href="/app/workflow-builder">
          <Button size="sm" variant="outline" data-testid="button-create-custom">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Custom
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Total Templates</div>
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-xl font-bold mt-0.5">{workflowTemplates.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Categories</div>
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-xl font-bold mt-0.5">{templateCategories.length - 1}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">AI Agents Used</div>
              <Brain className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <div className="text-xl font-bold mt-0.5">4</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Total Deployments</div>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div className="text-xl font-bold mt-0.5">
              {workflowTemplates.reduce((a, t) => a + t.usedBy, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-templates"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {templateCategories.map((category) => (
          <Button
            key={category.id}
            size="sm"
            variant={activeCategory === category.id ? "default" : "outline"}
            onClick={() => setActiveCategory(category.id)}
            data-testid={`button-category-${category.id}`}
          >
            {category.label}
            <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
              {getCategoryCount(category.id)}
            </Badge>
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredTemplates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <GitBranch className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No templates found matching your criteria</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
