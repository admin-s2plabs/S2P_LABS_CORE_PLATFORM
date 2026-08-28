import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, AlertCircle, XCircle, FileQuestion, PenLine } from "lucide-react";
import type { VendorStatus, DocumentStatus } from "@shared/schema";

interface StatusBadgeProps {
  status: VendorStatus | DocumentStatus;
  size?: "sm" | "default";
}

const statusConfig: Record<string, { 
  label: string; 
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: typeof CheckCircle;
  className: string;
}> = {
  draft: {
    label: "Draft",
    variant: "secondary",
    icon: FileQuestion,
    className: "bg-muted text-muted-foreground",
  },
  pending: {
    label: "Pending",
    variant: "outline",
    icon: Clock,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  under_review: {
    label: "Under Review",
    variant: "outline",
    icon: AlertCircle,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  approved: {
    label: "Approved",
    variant: "default",
    icon: CheckCircle,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  rejected: {
    label: "Rejected",
    variant: "destructive",
    icon: XCircle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  more_info_requested: {
    label: "More Info Requested",
    variant: "outline",
    icon: AlertCircle,
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  "More Info Requested": {
    label: "More Info Requested",
    variant: "outline",
    icon: AlertCircle,
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  validated: {
    label: "Validated",
    variant: "default",
    icon: CheckCircle,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  expired: {
    label: "Expired",
    variant: "destructive",
    icon: XCircle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  "Approved": {
    label: "Approved",
    variant: "default",
    icon: CheckCircle,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  // DBO Vendor statuses (from database)
  "Active": {
    label: "Active",
    variant: "default",
    icon: CheckCircle,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  "Draft": {
    label: "Draft",
    variant: "secondary",
    icon: FileQuestion,
    className: "bg-muted text-muted-foreground",
  },
  "Changes In Draft": {
    label: "Changes In Draft",
    variant: "outline",
    icon: PenLine,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  "Pending Approval": {
    label: "Pending Approval",
    variant: "outline",
    icon: Clock,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  "Rejected": {
    label: "Rejected",
    variant: "destructive",
    icon: XCircle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  "More Info Required": {
    label: "More Info Required",
    variant: "outline",
    icon: AlertCircle,
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  "ReSubmit": {
    label: "Resubmit",
    variant: "outline",
    icon: Clock,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  "InActive": {
    label: "Inactive",
    variant: "secondary",
    icon: XCircle,
    className: "bg-muted text-muted-foreground",
  },
};

export function StatusBadge({ status, size = "default" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`${config.className} ${size === "sm" ? "text-xs px-2 py-0.5" : "px-2.5 py-1"} gap-1.5 font-medium border`}
      data-testid={`status-badge-${status}`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {config.label}
    </Badge>
  );
}
