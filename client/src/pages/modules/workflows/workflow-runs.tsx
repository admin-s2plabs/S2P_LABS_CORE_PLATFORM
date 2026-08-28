import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/common-functions";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Brain,
  CheckCircle2,
  ChevronDown, ChevronRight,
  Clock,
  Filter,
  Play,
  RefreshCw,
  Search,
  XCircle,
  Zap
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerType: string;
  triggerData?: string;
  status: "running" | "completed" | "failed" | "paused" | "cancelled";
  currentNodeId?: string;
  currentNodeLabel?: string;
  executionLog?: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  executedBy?: string;
}

interface ExecutionStep {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  status: "completed" | "running" | "pending" | "failed";
  startedAt?: string;
  completedAt?: string;
  output?: string;
}

const sampleRuns: WorkflowRun[] = [
  {
    id: "run-1",
    workflowId: "wf-1",
    workflowName: "Auto-Source High-Value PRs",
    triggerType: "PR Approved",
    triggerData: JSON.stringify({ prNumber: "PR-2024-0892", amount: 1500000, department: "IT" }),
    status: "completed",
    executionLog: JSON.stringify([
      { nodeId: "n1", nodeLabel: "PR Approved > ₹10L", nodeType: "trigger", status: "completed", startedAt: "2024-01-26T10:30:00Z", completedAt: "2024-01-26T10:30:01Z" },
      { nodeId: "n2", nodeLabel: "Find Top 3 Vendors", nodeType: "agent", status: "completed", startedAt: "2024-01-26T10:30:01Z", completedAt: "2024-01-26T10:30:15Z", output: "Found: TechCorp, InfoSys, Wipro" },
      { nodeId: "n3", nodeLabel: "Create RFQ", nodeType: "agent", status: "completed", startedAt: "2024-01-26T10:30:15Z", completedAt: "2024-01-26T10:30:22Z", output: "RFQ-2024-0156 created" },
      { nodeId: "n4", nodeLabel: "Manager Approval", nodeType: "approval", status: "completed", startedAt: "2024-01-26T10:30:22Z", completedAt: "2024-01-26T11:15:00Z", output: "Approved by Rahul Sharma" },
      { nodeId: "n5", nodeLabel: "Send to Vendors", nodeType: "action", status: "completed", startedAt: "2024-01-26T11:15:00Z", completedAt: "2024-01-26T11:15:05Z", output: "Sent to 3 vendors" },
      { nodeId: "n6", nodeLabel: "Notify Buyer", nodeType: "notification", status: "completed", startedAt: "2024-01-26T11:15:05Z", completedAt: "2024-01-26T11:15:06Z" },
    ]),
    startedAt: "2024-01-26T10:30:00Z",
    completedAt: "2024-01-26T11:15:06Z",
    executedBy: "System",
  },
  {
    id: "run-2",
    workflowId: "wf-1",
    workflowName: "Auto-Source High-Value PRs",
    triggerType: "PR Approved",
    triggerData: JSON.stringify({ prNumber: "PR-2024-0895", amount: 2200000, department: "Manufacturing" }),
    status: "paused",
    currentNodeId: "n4",
    currentNodeLabel: "Manager Approval",
    executionLog: JSON.stringify([
      { nodeId: "n1", nodeLabel: "PR Approved > ₹10L", nodeType: "trigger", status: "completed", startedAt: "2024-01-26T14:00:00Z", completedAt: "2024-01-26T14:00:01Z" },
      { nodeId: "n2", nodeLabel: "Find Top 3 Vendors", nodeType: "agent", status: "completed", startedAt: "2024-01-26T14:00:01Z", completedAt: "2024-01-26T14:00:18Z", output: "Found: SteelWorks, MetalPro, IronCraft" },
      { nodeId: "n3", nodeLabel: "Create RFQ", nodeType: "agent", status: "completed", startedAt: "2024-01-26T14:00:18Z", completedAt: "2024-01-26T14:00:25Z", output: "RFQ-2024-0157 created" },
      { nodeId: "n4", nodeLabel: "Manager Approval", nodeType: "approval", status: "running", startedAt: "2024-01-26T14:00:25Z" },
    ]),
    startedAt: "2024-01-26T14:00:00Z",
    executedBy: "System",
  },
  {
    id: "run-3",
    workflowId: "wf-2",
    workflowName: "Vendor Compliance Monitor",
    triggerType: "Schedule",
    status: "completed",
    executionLog: JSON.stringify([
      { nodeId: "n1", nodeLabel: "Schedule: Daily 9 AM", nodeType: "trigger", status: "completed", startedAt: "2024-01-26T09:00:00Z", completedAt: "2024-01-26T09:00:01Z" },
      { nodeId: "n2", nodeLabel: "Check Expired Docs", nodeType: "agent", status: "completed", startedAt: "2024-01-26T09:00:01Z", completedAt: "2024-01-26T09:00:45Z", output: "Found 2 vendors with expired documents" },
      { nodeId: "n3", nodeLabel: "If Documents Expired", nodeType: "condition", status: "completed", startedAt: "2024-01-26T09:00:45Z", completedAt: "2024-01-26T09:00:46Z", output: "Condition: TRUE" },
      { nodeId: "n4", nodeLabel: "Suspend Vendor", nodeType: "action", status: "completed", startedAt: "2024-01-26T09:00:46Z", completedAt: "2024-01-26T09:00:48Z", output: "Suspended: ABC Corp, XYZ Ltd" },
      { nodeId: "n5", nodeLabel: "Alert Compliance", nodeType: "notification", status: "completed", startedAt: "2024-01-26T09:00:48Z", completedAt: "2024-01-26T09:00:49Z" },
    ]),
    startedAt: "2024-01-26T09:00:00Z",
    completedAt: "2024-01-26T09:00:49Z",
    executedBy: "Scheduler",
  },
  {
    id: "run-4",
    workflowId: "wf-3",
    workflowName: "Contract Renewal Pipeline",
    triggerType: "Contract Expiry",
    triggerData: JSON.stringify({ contractId: "CON-2023-0045", vendorName: "Global Supplies Ltd", expiryDate: "2024-03-26" }),
    status: "failed",
    executionLog: JSON.stringify([
      { nodeId: "n1", nodeLabel: "60 Days to Expiry", nodeType: "trigger", status: "completed", startedAt: "2024-01-25T08:00:00Z", completedAt: "2024-01-25T08:00:01Z" },
      { nodeId: "n2", nodeLabel: "Analyze Terms", nodeType: "agent", status: "completed", startedAt: "2024-01-25T08:00:01Z", completedAt: "2024-01-25T08:00:30Z" },
      { nodeId: "n3", nodeLabel: "Check Performance", nodeType: "agent", status: "failed", startedAt: "2024-01-25T08:00:30Z", completedAt: "2024-01-25T08:00:35Z" },
    ]),
    startedAt: "2024-01-25T08:00:00Z",
    completedAt: "2024-01-25T08:00:35Z",
    errorMessage: "Failed to fetch vendor performance data: API timeout",
    executedBy: "Scheduler",
  },
  {
    id: "run-5",
    workflowId: "wf-1",
    workflowName: "Auto-Source High-Value PRs",
    triggerType: "PR Approved",
    triggerData: JSON.stringify({ prNumber: "PR-2024-0890", amount: 1800000, department: "HR" }),
    status: "running",
    currentNodeId: "n2",
    currentNodeLabel: "Find Top 3 Vendors",
    executionLog: JSON.stringify([
      { nodeId: "n1", nodeLabel: "PR Approved > ₹10L", nodeType: "trigger", status: "completed", startedAt: "2024-01-26T15:30:00Z", completedAt: "2024-01-26T15:30:01Z" },
      { nodeId: "n2", nodeLabel: "Find Top 3 Vendors", nodeType: "agent", status: "running", startedAt: "2024-01-26T15:30:01Z" },
    ]),
    startedAt: "2024-01-26T15:30:00Z",
    executedBy: "System",
  },
];

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  running: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", icon: RefreshCw },
  completed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", icon: CheckCircle2 },
  failed: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", icon: XCircle },
  paused: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", icon: Clock },
  cancelled: { bg: "bg-gray-100 dark:bg-gray-900/30", text: "text-gray-700 dark:text-gray-300", icon: XCircle },
};

const nodeTypeIcons: Record<string, typeof Zap> = {
  trigger: Zap,
  agent: Brain,
  condition: ArrowRight,
  action: Play,
  notification: Bell,
  approval: Clock,
};

function formatDuration(startStr: string, endStr?: string) {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
  
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export default function WorkflowRunsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  
  const filteredRuns = sampleRuns.filter(run => {
    const matchesSearch = run.workflowName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      run.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || run.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: sampleRuns.length,
    running: sampleRuns.filter(r => r.status === "running").length,
    completed: sampleRuns.filter(r => r.status === "completed").length,
    failed: sampleRuns.filter(r => r.status === "failed").length,
    paused: sampleRuns.filter(r => r.status === "paused").length,
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Workflow Runs</h1>
            <p className="text-sm text-muted-foreground">
              Monitor workflow executions and view detailed logs
              <Badge variant="outline" className="ml-2 text-xs">Sample Data</Badge>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" data-testid="button-refresh-runs">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Link href="/app/workflows">
              <Button variant="outline" size="sm" data-testid="link-back-workflows">
                Back to Workflows
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          <Card className="hover-elevate" data-testid="card-stat-total">
            <CardContent className="p-3">
              <div className="text-2xl font-bold" data-testid="stat-total-runs">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Runs</div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-stat-running">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/30">
                <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="stat-running">{stats.running}</div>
                <div className="text-xs text-muted-foreground">Running</div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-stat-completed">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="stat-completed">{stats.completed}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-stat-failed">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="p-2 rounded-md bg-red-100 dark:bg-red-900/30">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="stat-failed">{stats.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-stat-paused">
            <CardContent className="p-3 flex items-center gap-2">
              <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="stat-paused">{stats.paused}</div>
                <div className="text-xs text-muted-foreground">Paused</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by workflow name or run ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search-runs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {filteredRuns.map((run) => {
            const statusStyle = statusColors[run.status];
            const StatusIcon = statusStyle.icon;
            const isExpanded = expandedRun === run.id;
            const steps: ExecutionStep[] = run.executionLog ? JSON.parse(run.executionLog) : [];
            const triggerData = run.triggerData ? JSON.parse(run.triggerData) : null;

            return (
              <Card key={run.id} className="hover-elevate" data-testid={`card-run-${run.id}`}>
                <CardContent className="p-0">
                  <button
                    className="w-full p-4 text-left flex items-center gap-4"
                    onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                    data-testid={`button-expand-run-${run.id}`}
                  >
                    <div className={`p-2 rounded-md ${statusStyle.bg}`}>
                      <StatusIcon className={`h-4 w-4 ${statusStyle.text} ${run.status === "running" ? "animate-spin" : ""}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{run.workflowName}</span>
                        <Badge variant="outline" className="text-xs">
                          {run.id}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{run.triggerType}</span>
                        {triggerData?.prNumber && (
                          <>
                            <span>•</span>
                            <span>{triggerData.prNumber}</span>
                          </>
                        )}
                        {run.currentNodeLabel && run.status !== "completed" && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600 dark:text-blue-400">
                              Current: {run.currentNodeLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-sm">
                      <div className="text-muted-foreground">
                        {formatDate(run.startedAt, true)}
                      </div>
                      <div className="text-xs">
                        Duration: {formatDuration(run.startedAt, run.completedAt)}
                      </div>
                    </div>

                    <Badge className={`${statusStyle.bg} ${statusStyle.text} border-0`}>
                      {run.status}
                    </Badge>

                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-muted/30">
                      <div className="text-sm font-medium mb-3">Execution Log</div>
                      
                      {run.errorMessage && (
                        <div className="mb-3 p-2 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{run.errorMessage}</span>
                        </div>
                      )}

                      <div className="space-y-2">
                        {steps.map((step, idx) => {
                          const StepIcon = nodeTypeIcons[step.nodeType] || Play;
                          const stepStatus = step.status;
                          const stepColor = stepStatus === "completed" 
                            ? "text-green-600 dark:text-green-400" 
                            : stepStatus === "running" 
                              ? "text-blue-600 dark:text-blue-400"
                              : stepStatus === "failed"
                                ? "text-red-600 dark:text-red-400"
                                : "text-muted-foreground";

                          return (
                            <div key={step.nodeId} className="flex items-start gap-3" data-testid={`step-${step.nodeId}`}>
                              <div className="flex flex-col items-center">
                                <div className={`p-1.5 rounded-md ${
                                  stepStatus === "completed" ? "bg-green-100 dark:bg-green-900/30" :
                                  stepStatus === "running" ? "bg-blue-100 dark:bg-blue-900/30" :
                                  stepStatus === "failed" ? "bg-red-100 dark:bg-red-900/30" :
                                  "bg-muted"
                                }`}>
                                  <StepIcon className={`h-3 w-3 ${stepColor} ${stepStatus === "running" ? "animate-pulse" : ""}`} />
                                </div>
                                {idx < steps.length - 1 && (
                                  <div className="w-0.5 h-6 bg-border mt-1" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{step.nodeLabel}</span>
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {step.nodeType}
                                  </Badge>
                                  {stepStatus === "completed" && step.completedAt && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatDuration(step.startedAt!, step.completedAt)}
                                    </span>
                                  )}
                                </div>
                                {step.output && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {step.output}
                                  </div>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {step.startedAt && formatDate(step.startedAt, true).split(",")[1]}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {triggerData && (
                        <div className="mt-4 pt-3 border-t">
                          <div className="text-sm font-medium mb-2">Trigger Context</div>
                          <div className="text-xs bg-muted/50 rounded-md p-2 font-mono">
                            {JSON.stringify(triggerData, null, 2)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {filteredRuns.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No workflow runs found matching your criteria.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
