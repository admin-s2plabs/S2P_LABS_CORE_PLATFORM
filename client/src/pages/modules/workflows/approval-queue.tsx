import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import {
  AlertCircle,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Filter,
  Hand,
  Search,
  User,
  XCircle
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

interface ApprovalItem {
  id: string;
  workflowRunId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  approvalType: "manager" | "threshold" | "multi-level" | "gate";
  requestedBy: string;
  assignedTo: string;
  contextData: {
    prNumber?: string;
    vendorName?: string;
    amount?: number;
    department?: string;
    description?: string;
    rfqNumber?: string;
  };
  status: "pending" | "approved" | "rejected" | "expired";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string;
  createdAt: string;
}

const sampleApprovals: ApprovalItem[] = [
  {
    id: "appr-1",
    workflowRunId: "run-2",
    workflowName: "Auto-Source High-Value PRs",
    nodeId: "n4",
    nodeLabel: "Manager Approval",
    approvalType: "manager",
    requestedBy: "System",
    assignedTo: "Rahul Sharma",
    contextData: {
      prNumber: "PR-2024-0895",
      amount: 2200000,
      department: "Manufacturing",
      description: "Industrial machinery components for production line upgrade",
      rfqNumber: "RFQ-2024-0157",
    },
    status: "pending",
    priority: "high",
    dueDate: "2024-01-27T14:00:00Z",
    createdAt: "2024-01-26T14:00:25Z",
  },
  {
    id: "appr-2",
    workflowRunId: "run-6",
    workflowName: "Contract Renewal Pipeline",
    nodeId: "n5",
    nodeLabel: "Legal Review",
    approvalType: "multi-level",
    requestedBy: "Contracts Agent",
    assignedTo: "Legal Team",
    contextData: {
      vendorName: "TechServe Solutions",
      amount: 5500000,
      description: "Annual software licensing and support contract renewal",
    },
    status: "pending",
    priority: "medium",
    dueDate: "2024-01-28T18:00:00Z",
    createdAt: "2024-01-26T10:15:00Z",
  },
  {
    id: "appr-3",
    workflowRunId: "run-7",
    workflowName: "Auto-Source High-Value PRs",
    nodeId: "n4",
    nodeLabel: "Threshold Approval",
    approvalType: "threshold",
    requestedBy: "System",
    assignedTo: "Finance Director",
    contextData: {
      prNumber: "PR-2024-0898",
      amount: 8500000,
      department: "IT",
      description: "Server infrastructure upgrade - data center expansion",
      rfqNumber: "RFQ-2024-0160",
    },
    status: "pending",
    priority: "urgent",
    dueDate: "2024-01-26T18:00:00Z",
    createdAt: "2024-01-26T09:30:00Z",
  },
  {
    id: "appr-4",
    workflowRunId: "run-8",
    workflowName: "New Vendor Onboarding",
    nodeId: "n6",
    nodeLabel: "Compliance Approval",
    approvalType: "gate",
    requestedBy: "Vendor Agent",
    assignedTo: "Compliance Officer",
    contextData: {
      vendorName: "GlobalTech Imports",
      department: "Procurement",
      description: "New international vendor - requires compliance clearance for import licenses",
    },
    status: "pending",
    priority: "medium",
    dueDate: "2024-01-29T12:00:00Z",
    createdAt: "2024-01-26T11:45:00Z",
  },
];

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" },
  medium: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
  high: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400" },
  urgent: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400" },
};

const approvalTypeLabels: Record<string, string> = {
  manager: "Manager Approval",
  threshold: "Threshold Approval",
  "multi-level": "Multi-Level Approval",
  gate: "Approval Gate",
};

function formatAmount(amount: number) {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

function getTimeRemaining(dueDate: string) {
  const now = new Date();
  const due = new Date(dueDate);
  const diff = due.getTime() - now.getTime();
  
  if (diff < 0) return { text: "Overdue", isOverdue: true };
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return { text: `${days}d ${hours % 24}h remaining`, isOverdue: false };
  return { text: `${hours}h remaining`, isOverdue: false };
}

export default function ApprovalQueuePage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [approvals, setApprovals] = useState(sampleApprovals);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const pendingApprovals = approvals.filter(a => a.status === "pending");
  
  const filteredApprovals = pendingApprovals.filter(approval => {
    const matchesSearch = 
      approval.workflowName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      approval.contextData.prNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      approval.contextData.vendorName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === "all" || approval.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  const stats = {
    pending: pendingApprovals.length,
    urgent: pendingApprovals.filter(a => a.priority === "urgent").length,
    high: pendingApprovals.filter(a => a.priority === "high").length,
    overdue: pendingApprovals.filter(a => getTimeRemaining(a.dueDate).isOverdue).length,
  };

  const handleApprove = (approval: ApprovalItem) => {
    setApprovals(approvals.map(a => 
      a.id === approval.id ? { ...a, status: "approved" as const } : a
    ));
    toast({
      title: "Approved",
      description: `${approval.nodeLabel} for ${approval.contextData.prNumber || approval.contextData.vendorName} has been approved.`,
    });
    setSelectedApproval(null);
  };

  const handleReject = () => {
    if (!selectedApproval) return;
    
    setApprovals(approvals.map(a => 
      a.id === selectedApproval.id ? { ...a, status: "rejected" as const } : a
    ));
    toast({
      title: "Rejected",
      description: `${selectedApproval.nodeLabel} has been rejected.`,
      variant: "destructive",
    });
    setShowRejectDialog(false);
    setSelectedApproval(null);
    setRejectionReason("");
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Approval Queue</h1>
            <p className="text-sm text-muted-foreground">
              Review and act on pending workflow approvals
              <Badge variant="outline" className="ml-2 text-xs">Sample Data</Badge>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/workflow-runs">
              <Button variant="outline" size="sm" data-testid="link-workflow-runs">
                View All Runs
              </Button>
            </Link>
            <Link href="/app/workflows">
              <Button variant="outline" size="sm" data-testid="link-back-workflows">
                Back to Workflows
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Card className="hover-elevate" data-testid="card-stat-pending">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                <Hand className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="stat-pending">{stats.pending}</div>
                <div className="text-xs text-muted-foreground">Pending Approvals</div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-stat-urgent">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="stat-urgent">{stats.urgent}</div>
                <div className="text-xs text-muted-foreground">Urgent</div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-stat-high">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="stat-high">{stats.high}</div>
                <div className="text-xs text-muted-foreground">High Priority</div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover-elevate" data-testid="card-stat-overdue">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-red-100 dark:bg-red-900/30">
                <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold" data-testid="stat-overdue">{stats.overdue}</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by workflow, PR number, or vendor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search-approvals"
            />
          </div>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-40" data-testid="select-priority-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {filteredApprovals.map((approval) => {
            const priorityStyle = priorityColors[approval.priority];
            const timeRemaining = getTimeRemaining(approval.dueDate);

            return (
              <Card key={approval.id} className="hover-elevate" data-testid={`card-approval-${approval.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                      <Hand className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{approval.nodeLabel}</span>
                        <Badge variant="outline" className="text-xs">
                          {approvalTypeLabels[approval.approvalType]}
                        </Badge>
                        <Badge className={`${priorityStyle.bg} ${priorityStyle.text} border-0 text-xs`}>
                          {approval.priority}
                        </Badge>
                      </div>

                      <div className="text-sm text-muted-foreground mb-3">
                        Workflow: {approval.workflowName}
                      </div>

                      <div className="grid grid-cols-2 gap-4 p-3 rounded-md bg-muted/30">
                        {approval.contextData.prNumber && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{approval.contextData.prNumber}</span>
                          </div>
                        )}
                        {approval.contextData.vendorName && (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{approval.contextData.vendorName}</span>
                          </div>
                        )}
                        {approval.contextData.amount && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{formatAmount(approval.contextData.amount)}</span>
                          </div>
                        )}
                        {approval.contextData.department && (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{approval.contextData.department}</span>
                          </div>
                        )}
                        {approval.contextData.rfqNumber && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{approval.contextData.rfqNumber}</span>
                          </div>
                        )}
                      </div>

                      {approval.contextData.description && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {approval.contextData.description}
                        </p>
                      )}
                    </div>

                    <div className="text-right space-y-2">
                      <div className="flex items-center gap-1 text-sm">
                        <User className="h-3 w-3" />
                        <span>{approval.assignedTo}</span>
                      </div>
                      <div className={`text-xs ${timeRemaining.isOverdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                        <Clock className="h-3 w-3 inline mr-1" />
                        {timeRemaining.text}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created: {formatDate(approval.createdAt, true)}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleApprove(approval)}
                        data-testid={`button-approve-${approval.id}`}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setSelectedApproval(approval);
                          setShowRejectDialog(true);
                        }}
                        data-testid={`button-reject-${approval.id}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredApprovals.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">All caught up!</p>
                <p className="text-sm">No pending approvals matching your criteria.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <FormSheet
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        title="Reject Approval"
        description="Please provide a reason for rejecting this approval request."
        onSubmit={handleReject}
        submitLabel="Confirm Rejection"
        submitDisabled={!rejectionReason.trim()}
      >
        <Textarea
          placeholder="Enter rejection reason..."
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          className="min-h-24"
          data-testid="input-rejection-reason"
        />
      </FormSheet>
    </div>
  );
}
