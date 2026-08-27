import { useState } from "react";
import { Link } from "wouter";
import { 
  Workflow, Play, Pause, Plus, Settings, Clock, CheckCircle2, 
  AlertCircle, ArrowRight, Users, Brain, FileText, TrendingUp,
  Zap, GitBranch, Bell, Filter, Pencil
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  trigger: string;
  status: "active" | "paused" | "draft";
  lastRun?: string;
  runsToday: number;
  successRate: number;
  steps: WorkflowStep[];
}

interface WorkflowStep {
  id: string;
  type: "trigger" | "agent" | "condition" | "action" | "notification";
  label: string;
  agent?: string;
  icon: typeof Workflow;
}

const sampleWorkflows: WorkflowItem[] = [
  {
    id: "wf-1",
    name: "Auto-Source High-Value PRs",
    description: "Automatically create RFQ and invite top vendors when PR over ₹10L is approved",
    trigger: "PR Approved (Value > ₹10L)",
    status: "active",
    lastRun: "2 hours ago",
    runsToday: 5,
    successRate: 98,
    steps: [
      { id: "s1", type: "trigger", label: "PR Approved > ₹10L", icon: Zap },
      { id: "s2", type: "agent", label: "Find Top 3 Vendors", agent: "Vendor Agent", icon: Users },
      { id: "s3", type: "agent", label: "Create RFQ", agent: "Sourcing Agent", icon: Brain },
      { id: "s4", type: "action", label: "Send to Vendors", icon: ArrowRight },
      { id: "s5", type: "notification", label: "Notify Buyer", icon: Bell },
    ],
  },
  {
    id: "wf-2",
    name: "Vendor Compliance Monitor",
    description: "Auto-suspend vendors with expired documents and notify compliance team",
    trigger: "Daily at 9:00 AM",
    status: "active",
    lastRun: "Today 9:00 AM",
    runsToday: 1,
    successRate: 100,
    steps: [
      { id: "s1", type: "trigger", label: "Schedule: Daily 9 AM", icon: Clock },
      { id: "s2", type: "agent", label: "Check Expired Docs", agent: "Vendor Agent", icon: Users },
      { id: "s3", type: "condition", label: "If Documents Expired", icon: GitBranch },
      { id: "s4", type: "action", label: "Suspend Vendor", icon: AlertCircle },
      { id: "s5", type: "notification", label: "Alert Compliance", icon: Bell },
    ],
  },
  {
    id: "wf-3",
    name: "Contract Renewal Pipeline",
    description: "Trigger renewal process 60 days before contract expiry",
    trigger: "Contract Expiry - 60 Days",
    status: "active",
    lastRun: "Yesterday",
    runsToday: 0,
    successRate: 95,
    steps: [
      { id: "s1", type: "trigger", label: "60 Days to Expiry", icon: Clock },
      { id: "s2", type: "agent", label: "Analyze Terms", agent: "Contracts Agent", icon: FileText },
      { id: "s3", type: "agent", label: "Check Performance", agent: "Vendor Agent", icon: Users },
      { id: "s4", type: "agent", label: "Get Market Rates", agent: "Spend Agent", icon: TrendingUp },
      { id: "s5", type: "notification", label: "Send Recommendation", icon: Bell },
    ],
  },
  {
    id: "wf-4",
    name: "New Vendor Onboarding",
    description: "Automated document validation and category assignment for new vendors",
    trigger: "New Vendor Registered",
    status: "paused",
    lastRun: "3 days ago",
    runsToday: 0,
    successRate: 92,
    steps: [
      { id: "s1", type: "trigger", label: "Vendor Registered", icon: Zap },
      { id: "s2", type: "agent", label: "Validate Documents", agent: "Vendor Agent", icon: Users },
      { id: "s3", type: "condition", label: "All Valid?", icon: GitBranch },
      { id: "s4", type: "agent", label: "Assign Categories", agent: "Vendor Agent", icon: Users },
      { id: "s5", type: "action", label: "Auto-Approve", icon: CheckCircle2 },
    ],
  },
];

function WorkflowStepVisual({ step, isLast }: { step: WorkflowStep; isLast: boolean }) {
  const bgColors: Record<string, string> = {
    trigger: "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700",
    agent: "bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700",
    condition: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700",
    action: "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700",
    notification: "bg-pink-100 dark:bg-pink-900/30 border-pink-300 dark:border-pink-700",
  };

  const iconColors: Record<string, string> = {
    trigger: "text-amber-600 dark:text-amber-400",
    agent: "text-purple-600 dark:text-purple-400",
    condition: "text-blue-600 dark:text-blue-400",
    action: "text-green-600 dark:text-green-400",
    notification: "text-pink-600 dark:text-pink-400",
  };

  return (
    <div className="flex items-center">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${bgColors[step.type]}`}>
        <step.icon className={`h-4 w-4 ${iconColors[step.type]}`} />
        <div className="text-xs">
          <div className="font-medium">{step.label}</div>
          {step.agent && (
            <div className="text-muted-foreground">{step.agent}</div>
          )}
        </div>
      </div>
      {!isLast && (
        <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />
      )}
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: WorkflowItem }) {
  const statusColors = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <Card className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-semibold text-sm">{workflow.name}</h3>
              <Badge className={`text-xs ${statusColors[workflow.status]}`}>
                {workflow.status === "active" ? (
                  <><Play className="h-3 w-3 mr-1" /> Active</>
                ) : workflow.status === "paused" ? (
                  <><Pause className="h-3 w-3 mr-1" /> Paused</>
                ) : (
                  "Draft"
                )}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{workflow.description}</p>
          </div>
          <Link href={`/app/workflow-builder?id=${workflow.id}`}>
            <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-edit-workflow-${workflow.id}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {workflow.trigger}
          </span>
          {workflow.lastRun && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last: {workflow.lastRun}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1.5">
          {workflow.steps.map((step, idx) => (
            <WorkflowStepVisual 
              key={step.id} 
              step={step} 
              isLast={idx === workflow.steps.length - 1} 
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              Runs today: <span className="font-medium text-foreground">{workflow.runsToday}</span>
            </span>
            <span className="text-muted-foreground">
              Success: <span className="font-medium text-green-600 dark:text-green-400">{workflow.successRate}%</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {workflow.status === "active" ? (
              <Button size="sm" variant="outline">
                <Pause className="h-3 w-3 mr-1" /> Pause
              </Button>
            ) : (
              <Button size="sm" variant="outline">
                <Play className="h-3 w-3 mr-1" /> Activate
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Workflows() {
  const [activeTab, setActiveTab] = useState("all");
  
  const activeWorkflows = sampleWorkflows.filter(w => w.status === "active");
  const pausedWorkflows = sampleWorkflows.filter(w => w.status === "paused");

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            AI Workbench
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automate procurement processes by chaining AI agents together
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/workflow-runs">
            <Button size="sm" variant="outline" data-testid="link-workflow-runs">
              <Play className="h-4 w-4 mr-1.5" />
              View Runs
            </Button>
          </Link>
          <Link href="/app/workflow-builder">
            <Button size="sm" data-testid="button-create-workflow">
              <Plus className="h-4 w-4 mr-1.5" />
              Create Workflow
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Total Workflows</div>
              <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-xl font-bold mt-0.5">{sampleWorkflows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Active</div>
              <Play className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div className="text-xl font-bold mt-0.5 text-green-600 dark:text-green-400">{activeWorkflows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Runs Today</div>
              <Zap className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-xl font-bold mt-0.5">{sampleWorkflows.reduce((a, w) => a + w.runsToday, 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Avg Success Rate</div>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div className="text-xl font-bold mt-0.5 text-green-600 dark:text-green-400">
              {Math.round(sampleWorkflows.reduce((a, w) => a + w.successRate, 0) / sampleWorkflows.length)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all">All Workflows</TabsTrigger>
            <TabsTrigger value="active">Active ({activeWorkflows.length})</TabsTrigger>
            <TabsTrigger value="paused">Paused ({pausedWorkflows.length})</TabsTrigger>
          </TabsList>
          <Button size="sm" variant="outline">
            <Filter className="h-4 w-4 mr-1.5" />
            Filter
          </Button>
        </div>

        <TabsContent value="all" className="mt-3 space-y-3">
          {sampleWorkflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </TabsContent>

        <TabsContent value="active" className="mt-3 space-y-3">
          {activeWorkflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </TabsContent>

        <TabsContent value="paused" className="mt-3 space-y-3">
          {pausedWorkflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </TabsContent>
      </Tabs>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <GitBranch className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">Browse Workflow Templates</p>
            <p className="text-xs text-muted-foreground">
              Start with pre-built templates for common procurement automation. 15+ templates across 6 categories.
            </p>
          </div>
          <Link href="/app/workflow-templates">
            <Button size="sm" data-testid="button-browse-templates">
              Browse Templates
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
