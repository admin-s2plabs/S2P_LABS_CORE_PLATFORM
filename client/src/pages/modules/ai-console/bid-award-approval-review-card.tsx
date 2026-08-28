import { useEffect, useState, type ComponentType } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Gavel,
  Loader2,
  Mail,
  MapPin,
  Package,
  ThumbsDown,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/common-functions";
import { useToast } from "@/hooks/use-toast";
import type { BidAwardApprovalReviewSpec } from "@shared/sourcing-bid-award-approval-review";
import type { SourcingChatActionRequest } from "./sourcing-activation-chat-actions";

type WorkflowAction = "Approved" | "Rejected";
type CommitteeAction = "accept" | "reject";

const bidTypeLabels: Record<string, { label: string; full: string; className: string }> = {
  RFQ: {
    label: "RFQ",
    full: "Request for Quotation",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  RFP: {
    label: "RFP",
    full: "Request for Proposal",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  Tender: {
    label: "Tender",
    full: "Open Tender",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
};

const awardStatusConfig: Record<string, { className: string }> = {
  Approved: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Awarded: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Rejected: { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  Pending: { className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  "Pending Approval": { className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  "Review Committee": { className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  Draft: { className: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
};

function resolveBidTypeConfig(bidType: string) {
  const normalized =
    bidType === "TENDER" || bidType.toLowerCase() === "tender"
      ? "Tender"
      : bidType.toUpperCase() === "RFQ"
        ? "RFQ"
        : bidType.toUpperCase() === "RFP"
          ? "RFP"
          : bidType;
  return bidTypeLabels[normalized] || bidTypeLabels.RFQ;
}

function resolveAwardStatusConfig(status: string) {
  return awardStatusConfig[status] || awardStatusConfig.Draft;
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
      <Icon className="h-4 w-4 text-primary" />
      {title}
    </h4>
  );
}

function HeaderInfoItem({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="truncate text-sm font-medium" title={value || "-"}>
        {value || "-"}
      </p>
      {subValue ? (
        <p className="truncate text-[11px] text-muted-foreground italic mt-0.5" title={subValue}>
          {subValue}
        </p>
      ) : null}
    </div>
  );
}

export function BidAwardApprovalReviewCard({
  spec,
  disabled,
  status = "pending",
  onComplete,
  chatActionRequest,
  onChatActionHandled,
  onConfirmationStateChange,
}: {
  spec: BidAwardApprovalReviewSpec;
  disabled?: boolean;
  status?: "pending" | "approved" | "rejected";
  onComplete?: (
    result: "approved" | "rejected" | "accepted",
    details?: { comments?: string },
  ) => void;
  chatActionRequest?: SourcingChatActionRequest | null;
  onChatActionHandled?: () => void;
  onConfirmationStateChange?: (action: "approve" | "reject" | "accept" | null) => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workflowAction, setWorkflowAction] = useState<WorkflowAction | null>(null);
  const [approveComments, setApproveComments] = useState("");
  const [committeeAction, setCommitteeAction] = useState<CommitteeAction | null>(null);

  const beginWorkflowAction = (action: WorkflowAction, comments = "") => {
    if (disabled || isSubmitting || status !== "pending" || !spec.canApprove) return;
    setCommitteeAction(null);
    setWorkflowAction(action);
    setApproveComments(comments);
    onConfirmationStateChange?.(action === "Approved" ? "approve" : "reject");
  };

  const cancelWorkflowAction = () => {
    setWorkflowAction(null);
    setApproveComments("");
    onConfirmationStateChange?.(null);
  };

  const submitWorkflowDecision = async (
    overrideAction?: WorkflowAction,
    overrideComments?: string,
  ) => {
    const action = overrideAction || workflowAction;
    if (disabled || isSubmitting || status !== "pending" || !spec.canApprove || !action) return;
    const comments = (overrideComments ?? approveComments).trim();
    if (!comments) {
      toast({
        title: "Comments required",
        description: "Please provide your comments.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/dbo/bids/awards/process-approval", {
        taskId: spec.taskId,
        result: action,
        comments,
        bidAwardId: String(spec.awardId),
      });
      await res.json();
      toast({
        title: action === "Approved" ? "Award approved" : "Award rejected",
        description: `Award #${spec.awardId} for ${spec.bidNumber} has been ${action === "Approved" ? "approved" : "rejected"}.`,
      });
      setWorkflowAction(null);
      setApproveComments("");
      onConfirmationStateChange?.(null);
      onComplete?.(action === "Approved" ? "approved" : "rejected", { comments });
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error?.message || "Could not process the award approval.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const beginCommitteeAction = (action: CommitteeAction) => {
    if (disabled || isSubmitting || status !== "pending" || !spec.canAcceptCommittee) return;
    setWorkflowAction(null);
    setApproveComments("");
    setCommitteeAction(action);
    onConfirmationStateChange?.(action === "accept" ? "accept" : "reject");
  };

  const cancelCommitteeAction = () => {
    setCommitteeAction(null);
    onConfirmationStateChange?.(null);
  };

  const submitCommitteeDecision = async (overrideAction?: CommitteeAction) => {
    const action = overrideAction || committeeAction;
    if (disabled || isSubmitting || status !== "pending" || !spec.canAcceptCommittee || !action) {
      return;
    }
    setIsSubmitting(true);
    try {
      const endpoint =
        action === "accept"
          ? `/api/dbo/bids/awards/${spec.awardId}/accept`
          : `/api/dbo/bids/awards/${spec.awardId}/reject`;
      const res = await apiRequest("POST", endpoint, {});
      const data = await res.json();
      toast({
        title: action === "accept" ? "Award accepted" : "Award rejected",
        description:
          data?.message ||
          `Your ${action === "accept" ? "acceptance" : "rejection"} has been recorded.`,
      });
      setCommitteeAction(null);
      onConfirmationStateChange?.(null);
      onComplete?.(action === "accept" ? "accepted" : "rejected");
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error?.message || "Could not process the committee action.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!chatActionRequest || status !== "pending" || disabled) return;
    if (chatActionRequest.card !== "bidAwardApproval") {
      onChatActionHandled?.();
      return;
    }
    const kind = chatActionRequest.kind || "start";
    const action = chatActionRequest.action;
    if (kind === "cancel") {
      cancelWorkflowAction();
      cancelCommitteeAction();
      onChatActionHandled?.();
      return;
    }

    if (action === "accept") {
      if (kind === "start") {
        beginCommitteeAction("accept");
        onChatActionHandled?.();
        return;
      }
      void submitCommitteeDecision("accept");
      onChatActionHandled?.();
      return;
    }

    if (action === "approve" || action === "reject") {
      const workflowResult: WorkflowAction = action === "approve" ? "Approved" : "Rejected";
      const comments = chatActionRequest.comments?.trim() || "";
      if (spec.canAcceptCommittee && !spec.canApprove && action === "reject") {
        if (kind === "start") {
          beginCommitteeAction("reject");
        } else {
          void submitCommitteeDecision("reject");
        }
        onChatActionHandled?.();
        return;
      }

      if (kind === "start") {
        beginWorkflowAction(workflowResult, comments);
        onChatActionHandled?.();
        return;
      }
      // Confirm: prefer chat comments, else use the textarea already filled on the card.
      const effectiveComments = comments || approveComments.trim();
      if (!effectiveComments) {
        beginWorkflowAction(workflowResult, "");
        toast({
          title: "Comments required",
          description: "Please provide your comments.",
          variant: "destructive",
        });
        onChatActionHandled?.();
        return;
      }
      void submitWorkflowDecision(workflowResult, effectiveComments);
      onChatActionHandled?.();
      return;
    }

    onChatActionHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest]);

  const showWorkflowActions = status === "pending" && spec.canApprove;
  const showCommitteeActions = status === "pending" && spec.canAcceptCommittee;
  const typeConfig = resolveBidTypeConfig(spec.bidType);
  const awardStatusCfg = resolveAwardStatusConfig(spec.awardStatus);

  return (
    <Card className="border-amber-200 dark:border-amber-900 bg-background mt-2">
      <CardContent className="p-4 space-y-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Gavel className="h-4 w-4 text-primary" />
              <span className="font-semibold">{spec.bidNumber}</span>
              <Badge
                variant="outline"
                className={`border-0 ${typeConfig.className}`}
                data-testid="bid-award-approval-bid-type"
              >
                {typeConfig.full}
              </Badge>
              {status === "approved" && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  Approved
                </Badge>
              )}
              {status === "rejected" && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                  Rejected
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{spec.bidTitle}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{spec.taskTitle}</p>
          </div>
        </div>

        <div className="rounded-md border bg-muted/20 p-3 space-y-3">
          <SectionTitle icon={Calendar} title="Bid Summary" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4">
            <HeaderInfoItem label="Start Date" value={formatDateTime(spec.startDate)} />
            <HeaderInfoItem label="End Date" value={formatDateTime(spec.endDate)} />
            <HeaderInfoItem label="Currency" value={spec.currency} />
            <HeaderInfoItem label="Status" value={spec.bidStatus} />
            <HeaderInfoItem label="Payment Terms" value={spec.paymentTerms} />
            <HeaderInfoItem label="Delivery Location" value={spec.deliveryLocation} />
            {spec.linkedPr ? <HeaderInfoItem label="Linked PR" value={spec.linkedPr} /> : null}
            <HeaderInfoItem
              label="Responses / Invited"
              value={`${spec.responsesCount} / ${spec.invitedCount}`}
            />
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3 shrink-0" />
                Buyer
              </p>
              <p className="truncate text-sm font-medium" title={spec.buyerName}>
                {spec.buyerName}
              </p>
              {spec.buyerEmail ? (
                <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate" title={spec.buyerEmail}>{spec.buyerEmail}</span>
                </p>
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3 shrink-0" />
                Requestor
              </p>
              <p className="truncate text-sm font-medium" title={spec.requestorName}>
                {spec.requestorName}
              </p>
              {spec.requestorEmail ? (
                <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate" title={spec.requestorEmail}>{spec.requestorEmail}</span>
                </p>
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3 shrink-0" />
                Department
              </p>
              <p className="truncate text-sm font-medium" title={spec.departmentName}>
                {spec.departmentName}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                Delivery
              </p>
              <p className="truncate text-sm font-medium" title={spec.deliveryLocation}>
                {spec.deliveryLocation}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold flex items-center gap-2">
              <Gavel className="h-4 w-4 text-primary" />
              Award #{spec.awardId}
            </span>
            <Badge
              variant="secondary"
              className={`${awardStatusCfg.className} text-xs`}
              data-testid="bid-award-approval-award-status"
            >
              {spec.awardStatus}
            </Badge>
            <Badge variant="outline">{spec.supplierName}</Badge>
            <span className="ml-auto font-semibold text-green-700 dark:text-green-400">
              {spec.netTotal}
            </span>
          </div>

          {(spec.supplierContact || spec.supplierPhone) && (
            <p className="text-xs text-muted-foreground">
              {[spec.supplierContact, spec.supplierPhone].filter(Boolean).join(" · ")}
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HeaderInfoItem label="Gross Total" value={spec.grossTotal} />
            <HeaderInfoItem label="Discount" value={spec.discount} />
            <HeaderInfoItem label="Tax" value={spec.taxAmount} />
            <HeaderInfoItem
              label="Net Total"
              value={spec.netTotal}
              subValue={spec.amountInWords || undefined}
            />
          </div>

          {spec.awardNotes ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Award Notes</p>
              <p className="text-xs">{spec.awardNotes}</p>
            </div>
          ) : null}

          {spec.lines.length > 0 && (
            <div>
              <SectionTitle icon={Package} title={`Quote Details (${spec.lines.length})`} />
              <div className="overflow-x-auto rounded-md border">
                <Table className="[&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs text-right">Bid Qty</TableHead>
                      <TableHead className="text-xs text-right">Awarded Qty</TableHead>
                      <TableHead className="text-xs text-right">Unit Price</TableHead>
                      <TableHead className="text-xs text-right">Disc Price</TableHead>
                      <TableHead className="text-xs text-right">Tax</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spec.lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{line.item}</TableCell>
                        <TableCell className="text-xs">{line.category}</TableCell>
                        <TableCell className="text-xs text-right">{line.bidQty}</TableCell>
                        <TableCell className="text-xs text-right">{line.awardedQty}</TableCell>
                        <TableCell className="text-xs text-right">{line.unitPrice}</TableCell>
                        <TableCell className="text-xs text-right">{line.discPrice}</TableCell>
                        <TableCell className="text-xs text-right">{line.tax}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {spec.committeeMembers.length > 0 && (
          <div>
            <SectionTitle icon={Users} title="Review Committee" />
            <div className="flex flex-wrap gap-2">
              {spec.committeeMembers.map((member, index) => (
                <div
                  key={`${member.email || member.name}-${index}`}
                  className="rounded-md border px-2.5 py-1.5 text-xs min-w-[180px]"
                >
                  <p className="font-medium">{member.name}</p>
                  {member.email && member.email.toLowerCase() !== member.name.toLowerCase() ? (
                    <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="break-all">{member.email}</span>
                    </p>
                  ) : null}
                  <p className="text-muted-foreground mt-0.5">
                    {member.role} · {member.status}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {spec.approvalHistory.length > 0 && (
          <div>
            <SectionTitle icon={Clock} title="Approval History" />
            <div className="flex flex-wrap gap-3">
              {spec.approvalHistory.map((step, index) => (
                <div key={`${step.name}-${index}`} className="rounded-md border px-3 py-2 text-xs min-w-[120px]">
                  <p className="font-medium">{step.name}</p>
                  <p
                    className={
                      step.status === "Approved"
                        ? "text-green-600"
                        : step.status === "Rejected"
                          ? "text-destructive"
                          : "text-amber-600"
                    }
                  >
                    {step.status}
                  </p>
                  {step.date ? <p className="text-muted-foreground mt-0.5">{step.date}</p> : null}
                  {step.comments ? (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2">{step.comments}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {showWorkflowActions && (
          <div className="pt-2 border-t space-y-3">
            {!workflowAction ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-[#3b1c71] hover:bg-[#2d1556] text-white"
                  disabled={disabled || isSubmitting}
                  onClick={() => beginWorkflowAction("Approved")}
                  data-testid="bid-award-approval-approve"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-destructive hover:text-destructive"
                  disabled={disabled || isSubmitting}
                  onClick={() => beginWorkflowAction("Rejected")}
                  data-testid="bid-award-approval-reject"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
            ) : (
              <div
                className={`rounded-md border p-3 space-y-3 ${
                  workflowAction === "Approved"
                    ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20"
                    : "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/20"
                }`}
                data-testid="bid-award-approval-confirm-panel"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {workflowAction === "Approved" ? "Approve" : "Reject"} Bid Award
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Are you sure you want to{" "}
                    {workflowAction === "Approved" ? "approve" : "reject"} this award? Please
                    provide your comments.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`bid-award-approve-comments-${spec.awardId}`}
                    className="text-xs font-medium"
                  >
                    Comments <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id={`bid-award-approve-comments-${spec.awardId}`}
                    value={approveComments}
                    onChange={(e) => setApproveComments(e.target.value)}
                    placeholder="Enter your comments..."
                    rows={4}
                    className="resize-none text-sm min-h-[100px]"
                    disabled={disabled || isSubmitting}
                    data-testid="textarea-approve-comments"
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelWorkflowAction}
                    disabled={disabled || isSubmitting}
                    data-testid="button-cancel-approve"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant={workflowAction === "Rejected" ? "destructive" : "default"}
                    onClick={() => void submitWorkflowDecision()}
                    disabled={disabled || isSubmitting || !approveComments.trim()}
                    className={
                      workflowAction === "Approved"
                        ? "bg-[#3b1c71] hover:bg-[#2d1556] text-white"
                        : undefined
                    }
                    data-testid="button-confirm-approve"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : workflowAction === "Approved" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                    )}
                    {isSubmitting
                      ? "Processing..."
                      : workflowAction === "Approved"
                        ? "Confirm Approval"
                        : "Confirm Rejection"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {showCommitteeActions && (
          <div className="pt-2 border-t space-y-3">
            {!committeeAction ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-[#3b1c71] hover:bg-[#2d1556] text-white"
                  disabled={disabled || isSubmitting}
                  onClick={() => beginCommitteeAction("accept")}
                  data-testid="bid-award-committee-accept"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-destructive hover:text-destructive"
                  disabled={disabled || isSubmitting}
                  onClick={() => beginCommitteeAction("reject")}
                  data-testid="bid-award-committee-reject"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
            ) : (
              <div
                className={`rounded-md border p-3 space-y-3 ${
                  committeeAction === "accept"
                    ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20"
                    : "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/20"
                }`}
                data-testid="bid-award-committee-confirm-panel"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {committeeAction === "accept" ? "Accept" : "Reject"} Bid Award
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Are you sure you want to {committeeAction} this bid award?
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelCommitteeAction}
                    disabled={disabled || isSubmitting}
                    data-testid="button-cancel-committee-action"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant={committeeAction === "reject" ? "destructive" : "default"}
                    onClick={() => void submitCommitteeDecision()}
                    disabled={disabled || isSubmitting}
                    className={
                      committeeAction === "accept"
                        ? "bg-[#3b1c71] hover:bg-[#2d1556] text-white"
                        : undefined
                    }
                    data-testid="button-confirm-committee-action"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : committeeAction === "accept" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                    )}
                    {isSubmitting
                      ? "Processing..."
                      : committeeAction === "accept"
                        ? "Confirm Accept"
                        : "Confirm Reject"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {!showWorkflowActions && !showCommitteeActions && status === "pending" && (
          <p className="text-xs text-muted-foreground pt-2 border-t">
            You can review this award here. Approval actions are only available to the assigned approver.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
