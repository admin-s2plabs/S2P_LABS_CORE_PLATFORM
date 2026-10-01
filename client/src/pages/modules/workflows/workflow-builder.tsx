import { useState, useCallback, useEffect } from "react";
import {
  Workflow,
  Save,
  Play,
  ArrowLeft,
  Zap,
  Users,
  Brain,
  FileText,
  TrendingUp,
  GitBranch,
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  Settings,
  Trash2,
  Copy,
  MoreVertical,
  GripVertical,
  Plus,
  ShieldCheck,
  X,
  ChevronRight,
  Hand,
  Shield,
  Eye,
  Lock,
  UserCheck,
  AlertTriangle,
  Pause,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Link, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface WorkflowNode {
  id: string;
  type: "trigger" | "agent" | "condition" | "approval" | "action" | "notification";
  label: string;
  agent?: string;
  config?: Record<string, string>;
  position: { x: number; y: number };
  requiresApproval?: boolean;
}

interface Connection {
  from: string;
  to: string;
  label?: string;
}

const nodeTemplates = {
  triggers: [
    { type: "trigger", label: "PR Approved", icon: Zap, description: "When a Purchase Request is approved" },
    { type: "trigger", label: "PR Value Threshold", icon: TrendingUp, description: "When PR value exceeds amount" },
    { type: "trigger", label: "Schedule", icon: Clock, description: "Run on a schedule (daily, weekly)" },
    { type: "trigger", label: "Document Expiry", icon: AlertCircle, description: "When vendor document expires" },
    { type: "trigger", label: "New Vendor", icon: Users, description: "When new vendor registers" },
    { type: "trigger", label: "Contract Expiry", icon: FileText, description: "Days before contract expires" },
  ],
  agents: [
    { type: "agent", label: "Vendor Agent", icon: Users, agent: "vendor", description: "Find, validate, recommend vendors" },
    { type: "agent", label: "Sourcing Agent", icon: Brain, agent: "sourcing", description: "Create RFQs, evaluate bids" },
    { type: "agent", label: "Contracts Agent", icon: FileText, agent: "contracts", description: "Analyze terms, manage renewals" },
    { type: "agent", label: "Spend Agent", icon: TrendingUp, agent: "spend", description: "Analyze spend, find savings" },
    { type: "agent", label: "Compliance Agent", icon: ShieldCheck, agent: "compliance", description: "Check policies, validate docs" },
  ],
  conditions: [
    { type: "condition", label: "If/Else", icon: GitBranch, description: "Branch based on condition" },
    { type: "condition", label: "Value Check", icon: TrendingUp, description: "Check amount threshold" },
    { type: "condition", label: "Status Check", icon: CheckCircle2, description: "Check item status" },
  ],
  approvals: [
    { type: "approval", label: "Approval Gate", icon: UserCheck, description: "Pause & wait for human approval" },
    { type: "approval", label: "Manager Approval", icon: UserCheck, description: "Requires manager sign-off" },
    { type: "approval", label: "Threshold Approval", icon: AlertTriangle, description: "Approval if value exceeds limit" },
    { type: "approval", label: "Multi-Level Approval", icon: Users, description: "Sequential approver chain" },
  ],
  actions: [
    { type: "action", label: "Create RFQ", icon: FileText, description: "Create a new RFQ/Bid" },
    { type: "action", label: "Update Status", icon: CheckCircle2, description: "Update record status" },
    { type: "action", label: "Suspend Vendor", icon: AlertCircle, description: "Suspend a vendor" },
    { type: "action", label: "Create PO", icon: FileText, description: "Create Purchase Order" },
    { type: "action", label: "Send to Vendors", icon: Users, description: "Invite vendors to bid" },
  ],
  notifications: [
    { type: "notification", label: "Email", icon: Bell, description: "Send email notification" },
    { type: "notification", label: "In-App Alert", icon: Bell, description: "Create in-app notification" },
    { type: "notification", label: "Slack", icon: Bell, description: "Send Slack message" },
    { type: "notification", label: "Teams", icon: Bell, description: "Send Teams message" },
  ],
};

const sampleWorkflows = {
  "auto-source": {
    name: "Auto-Source High-Value PRs",
    description: "Create RFQ for high-value PRs with manager approval before sending",
    nodes: [
      { id: "n1", type: "trigger", label: "PR Approved > ₹10L", position: { x: 50, y: 200 } },
      { id: "n2", type: "agent", label: "Find Top 3 Vendors", agent: "Vendor Agent", position: { x: 230, y: 200 } },
      { id: "n3", type: "agent", label: "Create RFQ", agent: "Sourcing Agent", position: { x: 410, y: 200 } },
      { id: "n4", type: "approval", label: "Manager Approval", position: { x: 590, y: 200 } },
      { id: "n5", type: "action", label: "Send to Vendors", position: { x: 770, y: 200 } },
      { id: "n6", type: "notification", label: "Notify Buyer", position: { x: 950, y: 200 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
    ],
  },
  "compliance-monitor": {
    name: "Vendor Compliance Monitor",
    description: "Auto-suspend vendors with expired documents and notify compliance team",
    nodes: [
      { id: "n1", type: "trigger", label: "Daily 9:00 AM", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Check Expired Docs", agent: "Vendor Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "condition", label: "Documents Expired?", position: { x: 540, y: 200 } },
      { id: "n4", type: "action", label: "Suspend Vendor", position: { x: 760, y: 120 } },
      { id: "n5", type: "notification", label: "Alert Compliance", position: { x: 980, y: 120 } },
      { id: "n6", type: "action", label: "Mark Compliant", position: { x: 760, y: 280 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", label: "Yes" },
      { from: "n3", to: "n6", label: "No" },
      { from: "n4", to: "n5" },
    ],
  },
  "contract-renewal": {
    name: "Contract Renewal Pipeline",
    description: "Trigger renewal process 60 days before contract expiry",
    nodes: [
      { id: "n1", type: "trigger", label: "60 Days to Expiry", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Analyze Terms", agent: "Contracts Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "agent", label: "Check Performance", agent: "Vendor Agent", position: { x: 540, y: 200 } },
      { id: "n4", type: "agent", label: "Get Market Rates", agent: "Spend Agent", position: { x: 760, y: 200 } },
      { id: "n5", type: "notification", label: "Send Recommendation", position: { x: 980, y: 200 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
    ],
  },
  "vendor-onboarding": {
    name: "New Vendor Onboarding",
    description: "Automated document validation and category assignment for new vendors",
    nodes: [
      { id: "n1", type: "trigger", label: "Vendor Registered", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Validate Documents", agent: "Compliance Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "condition", label: "All Valid?", position: { x: 540, y: 200 } },
      { id: "n4", type: "agent", label: "Assign Categories", agent: "Vendor Agent", position: { x: 760, y: 120 } },
      { id: "n5", type: "action", label: "Auto-Approve", position: { x: 980, y: 120 } },
      { id: "n6", type: "notification", label: "Request Resubmit", position: { x: 760, y: 280 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", label: "Yes" },
      { from: "n3", to: "n6", label: "No" },
      { from: "n4", to: "n5" },
    ],
  },
  "rfq-auto-response": {
    name: "RFQ Auto-Response Evaluation",
    description: "Automatically evaluate vendor responses and rank by price/quality",
    nodes: [
      { id: "n1", type: "trigger", label: "RFQ Response Received", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Extract Quote Data", agent: "Sourcing Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "agent", label: "Analyze Pricing", agent: "Spend Agent", position: { x: 540, y: 200 } },
      { id: "n4", type: "action", label: "Update Ranking", position: { x: 760, y: 200 } },
      { id: "n5", type: "notification", label: "Notify Buyer", position: { x: 980, y: 200 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
    ],
  },
  "vendor-risk": {
    name: "Vendor Risk Assessment",
    description: "Weekly risk score update for all active vendors",
    nodes: [
      { id: "n1", type: "trigger", label: "Weekly Schedule", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Analyze Vendor Data", agent: "Vendor Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "agent", label: "Check Financials", agent: "Spend Agent", position: { x: 540, y: 200 } },
      { id: "n4", type: "action", label: "Update Risk Score", position: { x: 760, y: 200 } },
      { id: "n5", type: "condition", label: "High Risk?", position: { x: 980, y: 200 } },
      { id: "n6", type: "notification", label: "Alert Procurement", position: { x: 1200, y: 120 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6", label: "Yes" },
    ],
  },
  "budget-alert": {
    name: "Budget Threshold Alert",
    description: "Alert when department spend reaches 80% of budget",
    nodes: [
      { id: "n1", type: "trigger", label: "PO Created", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Calculate Spend", agent: "Spend Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "condition", label: "Spend > 80%?", position: { x: 540, y: 200 } },
      { id: "n4", type: "notification", label: "Alert Finance", position: { x: 760, y: 120 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", label: "Yes" },
    ],
  },
  "po-auto-gen": {
    name: "PO Auto-Generation",
    description: "Create purchase order when RFQ is awarded",
    nodes: [
      { id: "n1", type: "trigger", label: "RFQ Awarded", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Get Award Details", agent: "Sourcing Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "action", label: "Create PO", position: { x: 540, y: 200 } },
      { id: "n4", type: "notification", label: "Notify Vendor", position: { x: 760, y: 200 } },
      { id: "n5", type: "notification", label: "Notify Buyer", position: { x: 980, y: 200 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
    ],
  },
  "invoice-match": {
    name: "Invoice 3-Way Match",
    description: "Automated matching of invoice, PO, and goods receipt",
    nodes: [
      { id: "n1", type: "trigger", label: "Invoice Received", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Extract Invoice Data", agent: "Spend Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "action", label: "Match with PO", position: { x: 540, y: 200 } },
      { id: "n4", type: "action", label: "Match with GRN", position: { x: 760, y: 200 } },
      { id: "n5", type: "condition", label: "All Match?", position: { x: 980, y: 200 } },
      { id: "n6", type: "action", label: "Approve Payment", position: { x: 1200, y: 120 } },
      { id: "n7", type: "notification", label: "Flag for Review", position: { x: 1200, y: 280 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6", label: "Yes" },
      { from: "n5", to: "n7", label: "No" },
    ],
  },
  "delivery-tracking": {
    name: "Delivery Tracking",
    description: "Monitor delivery status and alert on delays",
    nodes: [
      { id: "n1", type: "trigger", label: "PO Dispatched", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Track Shipment", agent: "Vendor Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "condition", label: "Delayed?", position: { x: 540, y: 200 } },
      { id: "n4", type: "notification", label: "Alert Buyer", position: { x: 760, y: 120 } },
      { id: "n5", type: "action", label: "Update Status", position: { x: 760, y: 280 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", label: "Yes" },
      { from: "n3", to: "n5", label: "No" },
    ],
  },
  "rfq-deadline": {
    name: "RFQ Deadline Reminder",
    description: "Send automated reminders to vendors before RFQ submission deadline",
    nodes: [
      { id: "n1", type: "trigger", label: "48 Hours to Deadline", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Get Pending Vendors", agent: "Sourcing Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "notification", label: "Send Reminder", position: { x: 540, y: 200 } },
      { id: "n4", type: "notification", label: "Notify Buyer", position: { x: 760, y: 200 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
    ],
  },
  "bid-comparison": {
    name: "Bid Comparison Matrix",
    description: "Auto-generate comparison matrix when all vendor bids are received",
    nodes: [
      { id: "n1", type: "trigger", label: "All Bids Received", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Extract Bid Data", agent: "Sourcing Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "agent", label: "Analyze Pricing", agent: "Spend Agent", position: { x: 540, y: 200 } },
      { id: "n4", type: "action", label: "Generate Matrix", position: { x: 760, y: 200 } },
      { id: "n5", type: "notification", label: "Send to Committee", position: { x: 980, y: 200 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
    ],
  },
  "sla-breach": {
    name: "SLA Breach Notification",
    description: "Monitor vendor SLAs and escalate breaches automatically",
    nodes: [
      { id: "n1", type: "trigger", label: "SLA Metric Breached", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Get Breach Details", agent: "Contracts Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "agent", label: "Check History", agent: "Vendor Agent", position: { x: 540, y: 200 } },
      { id: "n4", type: "condition", label: "Repeat Breach?", position: { x: 760, y: 200 } },
      { id: "n5", type: "notification", label: "Escalate to Manager", position: { x: 980, y: 120 } },
      { id: "n6", type: "notification", label: "Warn Vendor", position: { x: 980, y: 280 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5", label: "Yes" },
      { from: "n4", to: "n6", label: "No" },
    ],
  },
  "contract-amendment": {
    name: "Contract Amendment Tracker",
    description: "Track and notify stakeholders of contract amendments and variations",
    nodes: [
      { id: "n1", type: "trigger", label: "Amendment Requested", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Analyze Impact", agent: "Contracts Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "approval", label: "Legal Review", position: { x: 540, y: 200 } },
      { id: "n4", type: "action", label: "Update Contract", position: { x: 760, y: 200 } },
      { id: "n5", type: "notification", label: "Notify Stakeholders", position: { x: 980, y: 200 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
    ],
  },
  "duplicate-invoice": {
    name: "Duplicate Invoice Detection",
    description: "Flag potential duplicate invoices before payment processing",
    nodes: [
      { id: "n1", type: "trigger", label: "Invoice Received", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Check Duplicates", agent: "Spend Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "condition", label: "Duplicate Found?", position: { x: 540, y: 200 } },
      { id: "n4", type: "action", label: "Block Payment", position: { x: 760, y: 120 } },
      { id: "n5", type: "notification", label: "Alert AP Team", position: { x: 980, y: 120 } },
      { id: "n6", type: "action", label: "Process Normal", position: { x: 760, y: 280 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", label: "Yes" },
      { from: "n3", to: "n6", label: "No" },
      { from: "n4", to: "n5" },
    ],
  },
  "maverick-spend": {
    name: "Maverick Spend Detection",
    description: "Identify and flag purchases made outside approved contracts",
    nodes: [
      { id: "n1", type: "trigger", label: "PO Created", position: { x: 100, y: 200 } },
      { id: "n2", type: "agent", label: "Check Contracts", agent: "Contracts Agent", position: { x: 320, y: 200 } },
      { id: "n3", type: "agent", label: "Analyze Spend", agent: "Spend Agent", position: { x: 540, y: 200 } },
      { id: "n4", type: "condition", label: "Off-Contract?", position: { x: 760, y: 200 } },
      { id: "n5", type: "notification", label: "Flag Purchase", position: { x: 980, y: 120 } },
      { id: "n6", type: "action", label: "Log Compliant", position: { x: 980, y: 280 } },
    ],
    connections: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5", label: "Yes" },
      { from: "n4", to: "n6", label: "No" },
    ],
  },
};

type WorkflowKey = keyof typeof sampleWorkflows;

// Map workflow IDs from the Workflows page and Templates page to sample workflow keys
const workflowIdToKey: Record<string, WorkflowKey> = {
  "wf-1": "auto-source",
  "wf-2": "compliance-monitor",
  "wf-3": "contract-renewal",
  "wf-4": "vendor-onboarding",
  // Template IDs mapping
  "tpl-1": "auto-source",
  "tpl-2": "compliance-monitor",
  "tpl-3": "contract-renewal",
  "tpl-4": "vendor-onboarding",
  "tpl-5": "rfq-auto-response",
  "tpl-6": "vendor-risk",
  "tpl-7": "budget-alert",
  "tpl-8": "po-auto-gen",
  "tpl-9": "invoice-match",
  "tpl-10": "delivery-tracking",
  "tpl-11": "budget-alert",
  "tpl-12": "vendor-risk",
  "tpl-13": "contract-renewal",
  "tpl-14": "po-auto-gen",
  "tpl-15": "compliance-monitor",
  "tpl-16": "auto-source",
  "tpl-17": "compliance-monitor",
  "tpl-18": "delivery-tracking",
  "tpl-19": "maverick-spend",
  "tpl-20": "vendor-risk",
  "tpl-21": "budget-alert",
  "tpl-22": "contract-renewal",
  "tpl-23": "duplicate-invoice",
  "tpl-24": "rfq-auto-response",
  "tpl-25": "budget-alert",
  "tpl-26": "rfq-deadline",
  "tpl-27": "bid-comparison",
  "tpl-28": "rfq-auto-response",
  "tpl-29": "rfq-auto-response",
  "tpl-30": "bid-comparison",
  "tpl-31": "contract-amendment",
  "tpl-32": "contract-renewal",
  "tpl-33": "sla-breach",
  "tpl-34": "contract-amendment",
  "tpl-35": "rfq-auto-response",
};

const nodeColors: Record<string, { bg: string; border: string; icon: string }> = {
  trigger: { 
    bg: "bg-amber-50 dark:bg-amber-950/40", 
    border: "border-amber-300 dark:border-amber-700",
    icon: "text-amber-600 dark:text-amber-400"
  },
  agent: { 
    bg: "bg-purple-50 dark:bg-purple-950/40", 
    border: "border-purple-300 dark:border-purple-700",
    icon: "text-purple-600 dark:text-purple-400"
  },
  condition: { 
    bg: "bg-blue-50 dark:bg-blue-950/40", 
    border: "border-blue-300 dark:border-blue-700",
    icon: "text-blue-600 dark:text-blue-400"
  },
  approval: { 
    bg: "bg-orange-50 dark:bg-orange-950/40", 
    border: "border-orange-400 dark:border-orange-600",
    icon: "text-orange-600 dark:text-orange-400"
  },
  action: { 
    bg: "bg-green-50 dark:bg-green-950/40", 
    border: "border-green-300 dark:border-green-700",
    icon: "text-green-600 dark:text-green-400"
  },
  notification: { 
    bg: "bg-pink-50 dark:bg-pink-950/40", 
    border: "border-pink-300 dark:border-pink-700",
    icon: "text-pink-600 dark:text-pink-400"
  },
};

function NodePaletteItem({ 
  template, 
  onAdd 
}: { 
  template: { type: string; label: string; icon: typeof Zap; description: string; agent?: string };
  onAdd: () => void;
}) {
  const colors = nodeColors[template.type];
  const Icon = template.icon;
  
  return (
    <button 
      className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer hover-elevate w-full text-left ${colors.bg} ${colors.border}`}
      onClick={onAdd}
      data-testid={`palette-${template.type}-${template.label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className={`h-4 w-4 ${colors.icon}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{template.label}</div>
      </div>
      <Plus className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

function CanvasNode({ 
  node, 
  isSelected, 
  onSelect,
  onDelete 
}: { 
  node: WorkflowNode; 
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const colors = nodeColors[node.type];
  
  const getIcon = () => {
    switch (node.type) {
      case "trigger": return Zap;
      case "agent": return Brain;
      case "condition": return GitBranch;
      case "approval": return UserCheck;
      case "action": return CheckCircle2;
      case "notification": return Bell;
      default: return Zap;
    }
  };
  
  const Icon = getIcon();
  
  return (
    <div 
      className={`absolute flex flex-col items-center transition-all ${isSelected ? 'scale-105' : ''}`}
      style={{ left: node.position.x, top: node.position.y }}
    >
      <div 
        className={`relative flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer shadow-sm
          ${colors.bg} ${isSelected ? 'border-primary ring-2 ring-primary/20' : colors.border}`}
        onClick={onSelect}
        data-testid={`canvas-node-${node.id}`}
      >
        <Icon className={`h-4 w-4 ${colors.icon}`} />
        <div>
          <div className="text-xs font-medium whitespace-nowrap">{node.label}</div>
          {node.agent && (
            <div className="text-[11px] text-muted-foreground">{node.agent}</div>
          )}
        </div>
        
        {node.type === "approval" && (
          <div 
            className="absolute -top-1.5 -left-1.5 h-5 w-5 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-sm"
            data-testid={`approval-indicator-${node.id}`}
          >
            <Hand className="h-3 w-3" />
          </div>
        )}
        
        {isSelected && (
          <Button 
            size="icon" 
            variant="ghost" 
            className="absolute -top-2 -right-2 h-5 w-5 bg-destructive text-destructive-foreground rounded-full"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            data-testid={`delete-node-${node.id}`}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      <div className="flex items-center gap-1 mt-1">
        <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
      </div>
    </div>
  );
}

function ConnectionLine({ 
  from, 
  to, 
  label,
  nodes 
}: { 
  from: string; 
  to: string; 
  label?: string;
  nodes: WorkflowNode[];
}) {
  const fromNode = nodes.find(n => n.id === from);
  const toNode = nodes.find(n => n.id === to);
  
  if (!fromNode || !toNode) return null;
  
  const startX = fromNode.position.x + 100;
  const startY = fromNode.position.y + 30;
  const endX = toNode.position.x;
  const endY = toNode.position.y + 30;
  
  const midX = (startX + endX) / 2;
  
  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  
  return (
    <g>
      <path 
        d={path} 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        className="text-muted-foreground/40"
        markerEnd="url(#arrowhead)"
      />
      {label && (
        <text 
          x={midX} 
          y={(startY + endY) / 2 - 8} 
          textAnchor="middle" 
          className="text-xs fill-muted-foreground"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export default function WorkflowBuilder() {
  const { toast } = useToast();
  const searchString = useSearch();
  
  // Parse URL params to get workflow ID
  const getInitialWorkflowKey = (): WorkflowKey | null => {
    const params = new URLSearchParams(searchString);
    const id = params.get("id");
    if (id && workflowIdToKey[id]) {
      return workflowIdToKey[id];
    }
    return null; // No workflow selected - show empty canvas
  };
  
  const initialKey = getInitialWorkflowKey();
  const isNewWorkflow = initialKey === null;
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowKey | null>(initialKey);
  const [nodes, setNodes] = useState<WorkflowNode[]>(isNewWorkflow ? [] : sampleWorkflows[initialKey].nodes as WorkflowNode[]);
  const [connections, setConnections] = useState<Connection[]>(isNewWorkflow ? [] : sampleWorkflows[initialKey].connections);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState(isNewWorkflow ? "" : sampleWorkflows[initialKey].name);
  const [workflowDescription, setWorkflowDescription] = useState(isNewWorkflow ? "" : sampleWorkflows[initialKey].description);
  const [expandedPalette, setExpandedPalette] = useState<string>("agents");
  
  // Governance Controls State
  const [executionMode, setExecutionMode] = useState<"auto" | "approval" | "simulation">("approval");
  const [valueThreshold, setValueThreshold] = useState("1000000");
  const [requireApprovalAboveThreshold, setRequireApprovalAboveThreshold] = useState(true);
  const [auditTrailEnabled, setAuditTrailEnabled] = useState(true);
  const [showGovernancePanel, setShowGovernancePanel] = useState(false);
  
  // Update workflow when URL changes
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const id = params.get("id");
    if (id && workflowIdToKey[id]) {
      const key = workflowIdToKey[id];
      const workflow = sampleWorkflows[key];
      setSelectedWorkflow(key);
      setNodes(workflow.nodes as WorkflowNode[]);
      setConnections(workflow.connections);
      setWorkflowName(workflow.name);
      setWorkflowDescription(workflow.description);
      setSelectedNode(null);
    } else if (!id) {
      // No ID - show empty canvas for new workflow
      setSelectedWorkflow(null);
      setNodes([]);
      setConnections([]);
      setWorkflowName("");
      setWorkflowDescription("");
      setSelectedNode(null);
    }
  }, [searchString]);

  const handleWorkflowChange = (key: WorkflowKey) => {
    setSelectedWorkflow(key);
    const workflow = sampleWorkflows[key];
    setNodes(workflow.nodes as WorkflowNode[]);
    setConnections(workflow.connections);
    setWorkflowName(workflow.name);
    setWorkflowDescription(workflow.description);
    setSelectedNode(null);
  };
  
  const handleDeleteNode = (nodeId: string) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setConnections(connections.filter(c => c.from !== nodeId && c.to !== nodeId));
    setSelectedNode(null);
  };
  
  const updateNodeProperty = (nodeId: string, property: keyof WorkflowNode, value: string) => {
    setNodes(nodes.map(n => 
      n.id === nodeId ? { ...n, [property]: value } : n
    ));
  };
  
  const updateNodeConfig = (nodeId: string, key: string, value: string) => {
    setNodes(nodes.map(n => 
      n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n
    ));
  };
  
  const addNodeFromPalette = (template: { type: string; label: string; agent?: string }) => {
    const newId = `n${Date.now()}`;
    const lastNode = nodes[nodes.length - 1];
    const newX = lastNode ? lastNode.position.x + 180 : 100;
    const newY = lastNode ? lastNode.position.y : 200;
    
    const newNode: WorkflowNode = {
      id: newId,
      type: template.type as WorkflowNode["type"],
      label: template.label,
      agent: template.agent,
      position: { x: newX, y: newY },
      config: {},
    };
    
    setNodes([...nodes, newNode]);
    
    if (nodes.length > 0) {
      const lastNodeId = nodes[nodes.length - 1].id;
      setConnections([...connections, { from: lastNodeId, to: newId }]);
    }
    
    setSelectedNode(newId);
    
    toast({
      title: "Node Added",
      description: `Added "${template.label}" to workflow`,
    });
  };

  const selectedNodeData = nodes.find(n => n.id === selectedNode);
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Link href="/app/workflows">
            <Button size="icon" variant="ghost" data-testid="button-back-to-workflows">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <Input 
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="text-lg font-semibold border-none p-0 h-auto focus-visible:ring-0"
              data-testid="input-workflow-name"
            />
            <p className="text-xs text-muted-foreground">
              {workflowDescription}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Draft</Badge>
          {executionMode === "simulation" && (
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <Eye className="h-3 w-3 mr-1" />
              Simulation Mode
            </Badge>
          )}
          {executionMode === "approval" && (
            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              <UserCheck className="h-3 w-3 mr-1" />
              Approval Required
            </Badge>
          )}
          {executionMode === "auto" && (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <Zap className="h-3 w-3 mr-1" />
              Auto-Execute
            </Badge>
          )}
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setShowGovernancePanel(!showGovernancePanel)}
            data-testid="button-governance-controls"
          >
            <Shield className="h-4 w-4 mr-1.5" />
            Governance
          </Button>
          <Button size="sm" variant="outline" data-testid="button-test-workflow">
            <Play className="h-4 w-4 mr-1.5" />
            Test
          </Button>
          <Button size="sm" data-testid="button-save-workflow">
            <Save className="h-4 w-4 mr-1.5" />
            Save & Publish
          </Button>
        </div>
      </div>
      
      {showGovernancePanel && (
        <div className="border-b bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30">
          <div className="p-4">
            <div className="flex items-start gap-6">
              <div className="flex items-center gap-2 shrink-0">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                  <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Governance Controls</h3>
                  <p className="text-xs text-muted-foreground">Configure approval & execution rules</p>
                </div>
              </div>
              
              <div className="flex-1 grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Execution Mode</Label>
                  <Select value={executionMode} onValueChange={(v) => setExecutionMode(v as "auto" | "approval" | "simulation")}>
                    <SelectTrigger data-testid="select-execution-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simulation">
                        <div className="flex items-center gap-2">
                          <Eye className="h-3.5 w-3.5 text-amber-500" />
                          <span>Simulation (Test Only)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="approval">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-orange-500" />
                          <span>Requires Approval</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="auto">
                        <div className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-green-500" />
                          <span>Auto-Execute</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    {executionMode === "simulation" && "Actions are logged but not executed. Safe for testing."}
                    {executionMode === "approval" && "All actions pause for human approval before executing."}
                    {executionMode === "auto" && "Actions execute automatically. Use with caution."}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Value Threshold</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">₹</span>
                    <Input 
                      type="number"
                      value={valueThreshold}
                      onChange={(e) => setValueThreshold(e.target.value)}
                      placeholder="1000000"
                      data-testid="input-value-threshold"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Switch 
                      checked={requireApprovalAboveThreshold}
                      onCheckedChange={setRequireApprovalAboveThreshold}
                      data-testid="switch-require-approval-threshold"
                    />
                    <Label className="text-xs">Require approval above threshold</Label>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Audit Trail</Label>
                    <Switch 
                      checked={auditTrailEnabled}
                      onCheckedChange={setAuditTrailEnabled}
                      data-testid="switch-audit-trail"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Log all workflow actions, approvals, and decisions for compliance review.
                  </p>
                  
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="font-medium">Enterprise Governance Active</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <Button 
                size="icon" 
                variant="ghost"
                onClick={() => setShowGovernancePanel(false)}
                data-testid="button-close-governance"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 border-r bg-muted/30 overflow-y-auto flex flex-col">
          <div className="p-3 border-b">
            <Label className="text-xs text-muted-foreground">Load Example Workflow</Label>
            <Select value={selectedWorkflow ?? ""} onValueChange={(v) => handleWorkflowChange(v as WorkflowKey)}>
              <SelectTrigger className="mt-1" data-testid="select-example-workflow">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto-source">Auto-Source High-Value PRs</SelectItem>
                <SelectItem value="compliance-monitor">Vendor Compliance Monitor</SelectItem>
                <SelectItem value="contract-renewal">Contract Renewal Pipeline</SelectItem>
                <SelectItem value="vendor-onboarding">New Vendor Onboarding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="p-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">COMPONENTS</div>
            
            {Object.entries(nodeTemplates).map(([category, templates]) => (
              <div key={category} className="mb-2">
                <button
                  className="flex items-center justify-between w-full p-2 text-xs font-medium rounded-md hover-elevate"
                  onClick={() => setExpandedPalette(expandedPalette === category ? "" : category)}
                  data-testid={`toggle-palette-${category}`}
                >
                  <span className="capitalize">{category}</span>
                  <ChevronRight className={`h-3 w-3 transition-transform ${expandedPalette === category ? 'rotate-90' : ''}`} />
                </button>
                
                {expandedPalette === category && (
                  <div className="space-y-1 mt-1 ml-2">
                    {templates.map((template, idx) => (
                      <NodePaletteItem 
                        key={idx} 
                        template={template}
                        onAdd={() => addNodeFromPalette(template)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex-1 relative overflow-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:20px_20px]">
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon 
                  points="0 0, 10 3.5, 0 7" 
                  fill="currentColor"
                  className="text-muted-foreground/40"
                />
              </marker>
            </defs>
            {connections.map((conn, idx) => (
              <ConnectionLine 
                key={idx} 
                from={conn.from} 
                to={conn.to}
                label={conn.label}
                nodes={nodes}
              />
            ))}
          </svg>
          
          {nodes.map((node) => (
            <CanvasNode 
              key={node.id} 
              node={node}
              isSelected={selectedNode === node.id}
              onSelect={() => setSelectedNode(node.id)}
              onDelete={() => handleDeleteNode(node.id)}
            />
          ))}
          
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Workflow className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-sm">Drag components here</p>
                <p className="text-xs">Start by adding a trigger from the palette</p>
              </div>
            </div>
          )}
        </div>
        
        {selectedNodeData && (
          <div className="w-64 border-l bg-background overflow-y-auto">
            <div className="p-3 border-b">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Node Properties</h3>
                <Button 
                  size="icon" 
                  variant="ghost"
                  onClick={() => setSelectedNode(null)}
                  data-testid="button-close-properties"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="p-3 space-y-3">
              <div>
                <Label className="text-xs">Node Type</Label>
                <Badge className={`mt-1 capitalize ${nodeColors[selectedNodeData.type].bg} ${nodeColors[selectedNodeData.type].border}`}>
                  {selectedNodeData.type}
                </Badge>
              </div>
              
              <div>
                <Label className="text-xs">Label</Label>
                <Input 
                  value={selectedNodeData.label}
                  onChange={(e) => updateNodeProperty(selectedNodeData.id, 'label', e.target.value)}
                  className="mt-1"
                  data-testid="input-node-label"
                />
              </div>
              
              {selectedNodeData.type === "agent" && (
                <div>
                  <Label className="text-xs">Agent</Label>
                  <Select 
                    value={selectedNodeData.agent || "Vendor Agent"}
                    onValueChange={(v) => updateNodeProperty(selectedNodeData.id, 'agent', v)}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-node-agent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vendor Agent">Vendor Agent</SelectItem>
                      <SelectItem value="Sourcing Agent">Sourcing Agent</SelectItem>
                      <SelectItem value="Contracts Agent">Contracts Agent</SelectItem>
                      <SelectItem value="Spend Agent">Spend Agent</SelectItem>
                      <SelectItem value="Compliance Agent">Compliance Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {selectedNodeData.type === "trigger" && (
                <>
                  <div>
                    <Label className="text-xs">Trigger Type</Label>
                    <Select 
                      value={selectedNodeData.config?.triggerType || "pr-approved"}
                      onValueChange={(v) => updateNodeConfig(selectedNodeData.id, 'triggerType', v)}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-trigger-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pr-approved">PR Approved</SelectItem>
                        <SelectItem value="schedule">Schedule</SelectItem>
                        <SelectItem value="doc-expiry">Document Expiry</SelectItem>
                        <SelectItem value="new-vendor">New Vendor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Condition</Label>
                    <Input 
                      value={selectedNodeData.config?.condition || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, 'condition', e.target.value)}
                      placeholder="e.g., value > 1000000" 
                      className="mt-1"
                      data-testid="input-trigger-condition"
                    />
                  </div>
                </>
              )}
              
              {selectedNodeData.type === "condition" && (
                <>
                  <div>
                    <Label className="text-xs">Condition Expression</Label>
                    <Textarea 
                      value={selectedNodeData.config?.expression || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, 'expression', e.target.value)}
                      placeholder="e.g., documents.expired == true" 
                      className="mt-1"
                      rows={3}
                      data-testid="input-condition-expression"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Branches: Yes → continues, No → alternate path
                  </div>
                </>
              )}
              
              {selectedNodeData.type === "approval" && (
                <>
                  <div className="p-2 bg-orange-50 dark:bg-orange-950/30 rounded-md border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                      <Hand className="h-4 w-4" />
                      <span className="text-xs font-medium">Human-in-the-Loop</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Workflow pauses here until approved
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-xs">Approval Type</Label>
                    <Select 
                      value={selectedNodeData.config?.approvalType || "single"}
                      onValueChange={(v) => updateNodeConfig(selectedNodeData.id, 'approvalType', v)}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-approval-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single Approver</SelectItem>
                        <SelectItem value="manager">Manager Approval</SelectItem>
                        <SelectItem value="multi">Multi-Level (Sequential)</SelectItem>
                        <SelectItem value="any">Any of Multiple</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-xs">Required Approvers</Label>
                    <Select 
                      value={selectedNodeData.config?.approver || "buyer"}
                      onValueChange={(v) => updateNodeConfig(selectedNodeData.id, 'approver', v)}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-approvers">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buyer">Buyer</SelectItem>
                        <SelectItem value="manager">Category Manager</SelectItem>
                        <SelectItem value="finance">Finance Head</SelectItem>
                        <SelectItem value="procurement-head">Procurement Head</SelectItem>
                        <SelectItem value="cfo">CFO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-xs">Timeout Action</Label>
                    <Select 
                      value={selectedNodeData.config?.timeoutAction || "escalate"}
                      onValueChange={(v) => updateNodeConfig(selectedNodeData.id, 'timeoutAction', v)}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-timeout-action">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="escalate">Escalate to Next Level</SelectItem>
                        <SelectItem value="remind">Send Reminder</SelectItem>
                        <SelectItem value="reject">Auto-Reject</SelectItem>
                        <SelectItem value="wait">Wait Indefinitely</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-xs">Timeout Duration</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input 
                        type="number"
                        value={selectedNodeData.config?.timeoutHours || "24"}
                        onChange={(e) => updateNodeConfig(selectedNodeData.id, 'timeoutHours', e.target.value)}
                        className="flex-1"
                        data-testid="input-timeout-hours"
                      />
                      <span className="text-xs text-muted-foreground">hours</span>
                    </div>
                  </div>
                </>
              )}
              
              {selectedNodeData.type === "notification" && (
                <>
                  <div>
                    <Label className="text-xs">Channel</Label>
                    <Select 
                      value={selectedNodeData.config?.channel || "email"}
                      onValueChange={(v) => updateNodeConfig(selectedNodeData.id, 'channel', v)}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-notification-channel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="in-app">In-App Notification</SelectItem>
                        <SelectItem value="slack">Slack</SelectItem>
                        <SelectItem value="teams">Microsoft Teams</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Recipients</Label>
                    <Input 
                      value={selectedNodeData.config?.recipients || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, 'recipients', e.target.value)}
                      placeholder="e.g., @buyer, @compliance-team" 
                      className="mt-1"
                      data-testid="input-notification-recipients"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Message Template</Label>
                    <Textarea 
                      value={selectedNodeData.config?.message || ""}
                      onChange={(e) => updateNodeConfig(selectedNodeData.id, 'message', e.target.value)}
                      placeholder="Notification message..." 
                      className="mt-1"
                      rows={3}
                      data-testid="input-notification-message"
                    />
                  </div>
                </>
              )}
              
              <div className="pt-3 border-t">
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="w-full"
                  onClick={() => handleDeleteNode(selectedNodeData.id)}
                  data-testid="button-delete-selected-node"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Node
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
