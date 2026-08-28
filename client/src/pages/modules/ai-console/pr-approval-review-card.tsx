import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MessageSquarePlus, X } from "lucide-react";
import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/common-functions";
import type { PrApprovalReviewSpec } from "@shared/procurement-activation-signals";
import type { ProcurementChatActionRequest } from "./procurement-activation-chat-actions";
import {
  ApprovalTimeline,
  Section,
  StatusPill,
} from "./procurement-activation/card-primitives";
import { PROCUREMENT_ACTIVATION_SIGNALS_QUERY_KEY } from "@/hooks/useProcurementActivationSignals";

type ApprovalAction = "Approve" | "Reject" | "More" | "ReSubmit";
type ApprovalStatus = "pending" | "approved" | "rejected" | "more_info" | "resubmitted";

function actionToStatus(action: ApprovalAction): ApprovalStatus {
  if (action === "Approve") return "approved";
  if (action === "Reject") return "rejected";
  if (action === "ReSubmit") return "resubmitted";
  return "more_info";
}

function LabelValue({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 py-1">
      <span className="w-28 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground">:</span>
      <span className={`min-w-0 flex-1 break-words text-xs font-medium ${valueClassName}`}>
        {value === undefined || value === null || value === "" ? "—" : value}
      </span>
    </div>
  );
}

function LineStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="secondary">—</Badge>;
  const statusLower = status.toLowerCase();
  if (statusLower.includes("approved")) {
    return (
      <Badge variant="default" className="bg-emerald-600 text-[10px]">
        {status}
      </Badge>
    );
  }
  if (statusLower.includes("pending") || statusLower.includes("info")) {
    return (
      <Badge variant="outline" className="border-orange-300 text-[10px] text-orange-600">
        {status}
      </Badge>
    );
  }
  if (statusLower.includes("reject") || statusLower.includes("cancel")) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {status}
    </Badge>
  );
}

function mapApprovalHistoryForTimeline(approvalHistory: any[], header: any) {
  const items: Array<{
    name?: string;
    email?: string;
    designation?: string;
    status?: string;
    date?: string;
    comments?: string;
  }> = [];

  [...(approvalHistory || [])]
    .sort((a: any, b: any) => {
      const dateA = a.approved_date ? new Date(a.approved_date).getTime() : 0;
      const dateB = b.approved_date ? new Date(b.approved_date).getTime() : 0;
      if (dateA !== dateB) return dateA - dateB;
      return (a.id || 0) - (b.id || 0);
    })
    .forEach((approval: any) => {
      const st = String(approval.status || "").toLowerCase();
      items.push({
        name: approval.approver_name || approval.email || "Unknown",
        email: approval.email,
        designation: approval.designation,
        status:
          st === "approve" || st === "approved"
            ? "Approved"
            : st === "reject" || st === "rejected"
              ? "Rejected"
              : st === "more"
                ? "More"
                : st === "resubmit"
                  ? "ReSubmit"
                  : approval.status || "Approved",
        date: approval.approved_date,
        comments: approval.comments,
      });
    });

  const pendingStatuses = ["Pending Approval", "Pending", "PENDING", "Pending_Approval", "In Approval"];
  if (header.pr_status && pendingStatuses.includes(header.pr_status)) {
    const currentApprovers = header.approvers_list
      ? String(header.approvers_list)
          .split(",")
          .map((a: string) => a.trim())
          .filter(Boolean)
      : [];
    currentApprovers.forEach((approver: string) => {
      items.push({ name: approver, status: "Pending" });
    });
  }

  return items;
}

function PersonValue({ name, email }: { name?: string | null; email?: string | null }) {
  if (!name && !email) return "—";
  return (
    <span className="flex flex-col gap-0.5">
      <span>{name || "—"}</span>
      {email ? <span className="text-[10px] font-normal text-muted-foreground">{email}</span> : null}
    </span>
  );
}

export function PrApprovalReviewCard({
  spec,
  status,
  disabled,
  onComplete,
  chatActionRequest,
  onChatActionHandled,
  onChatActionFailed,
  onConfirmationStateChange,
}: {
  spec: PrApprovalReviewSpec;
  status: ApprovalStatus;
  disabled?: boolean;
  onComplete: (result: ApprovalStatus) => void;
  chatActionRequest?: ProcurementChatActionRequest | null;
  onChatActionHandled?: () => void;
  onChatActionFailed?: (message: string) => void;
  onConfirmationStateChange?: (action: "approve" | "reject" | "more" | "resubmit" | null) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<ApprovalAction | null>(null);
  const [comments, setComments] = useState("");
  const [checklistOpen, setChecklistOpen] = useState(false);
  // Chat-driven submissions need their outcome echoed back into the transcript.
  const chatConfirmRef = useRef(false);

  const detailQuery = useQuery({
    queryKey: ["/api/requisitions", spec.prNumber],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/requisitions/${spec.prNumber}`);
      return parseJsonResponse<any>(res);
    },
  });

  const header = detailQuery.data?.header || {};
  const lines: any[] = detailQuery.data?.lines || [];
  const approvalHistory = detailQuery.data?.approvalHistory || [];
  const taskId = spec.taskId || header.attribute_12;
  const entityStatus = String(header.pr_status || "").toLowerCase();
  const isMoreInfo = entityStatus.includes("more info");

  const orgsQuery = useQuery({
    queryKey: ["/api/organizations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/organizations");
      return parseJsonResponse<Array<{ id: number | string; organization_name: string }>>(res);
    },
  });

  const budgetLinesQuery = useQuery({
    queryKey: ["/api/budgets/approved-lines"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/budgets/approved-lines");
      return parseJsonResponse<any[]>(res);
    },
  });

  const taskQuery = useQuery({
    queryKey: ["/api/workflow-engine/task", taskId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/workflow-engine/task/${taskId}`);
      return parseJsonResponse<any>(res);
    },
    enabled: !!taskId,
  });

  const organizations = orgsQuery.data || [];
  const budgetLines = budgetLinesQuery.data || [];

  const businessEntityName =
    organizations.find((o) => String(o.id) === String(header.org_id))?.organization_name ||
    header.business_entity_name ||
    null;

  const matchedBudgetLine = budgetLines.find(
    (bl) => String(bl.id) === String(header.budget_segment),
  );

  const availableBudget = matchedBudgetLine
    ? Math.max(
        0,
        (parseFloat(matchedBudgetLine.amount) || 0) -
          (parseFloat(matchedBudgetLine.consumed_amount) || 0) -
          (parseFloat(matchedBudgetLine.reserved_amount) || 0),
      )
    : null;

  const totalAmount = useMemo(() => {
    const fromLines = lines.reduce(
      (sum, line) => sum + (parseFloat(String(line.amount || "0")) || 0),
      0,
    );
    if (fromLines > 0) return fromLines;
    return parseFloat(String(header.pr_amount || "0")) || 0;
  }, [lines, header.pr_amount]);

  const currency = header.currency || matchedBudgetLine?.budget_curr || "";

  const timelineItems = useMemo(
    () => mapApprovalHistoryForTimeline(approvalHistory, header),
    [approvalHistory, header],
  );

  const mutation = useMutation({
    mutationFn: async ({ action, remarks }: { action: ApprovalAction; remarks: string }) => {
      if (!taskId) throw new Error("Missing workflow task id");
      return apiRequest("POST", `/api/requisitions/${spec.prNumber}/process-approval`, {
        taskId,
        result: action,
        comments: remarks,
      });
    },
    onSuccess: (_data, vars) => {
      toast({ title: "PR updated", description: `Action ${vars.action} completed.` });
      queryClient.invalidateQueries({ queryKey: PROCUREMENT_ACTIVATION_SIGNALS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requisitions", spec.prNumber] });
      chatConfirmRef.current = false;
      setSelectedAction(null);
      setComments("");
      onConfirmationStateChange?.(null);
      onComplete(actionToStatus(vars.action));
    },
    onError: (err: any) => {
      const message = err?.message || "Could not process PR approval";
      toast({ title: "Approval failed", description: message, variant: "destructive" });
      if (chatConfirmRef.current) {
        chatConfirmRef.current = false;
        onChatActionFailed?.(message);
      }
    },
  });

  const commentsRequired = selectedAction === "Reject" || selectedAction === "More";

  const startAction = async (action: ApprovalAction) => {
    if (action === "Approve") {
      const available = await resolveApprovalChecklistAvailability("Purchase Request");
      if (available) {
        setSelectedAction(action);
        setChecklistOpen(true);
        onConfirmationStateChange?.("approve");
        return;
      }
    }
    setSelectedAction(action);
    onConfirmationStateChange?.(
      action === "Approve"
        ? "approve"
        : action === "Reject"
          ? "reject"
          : action === "ReSubmit"
            ? "resubmit"
            : "more",
    );
  };

  const submitAction = (action: ApprovalAction, remarks: string): boolean => {
    if ((action === "Reject" || action === "More") && !remarks.trim()) {
      toast({ title: "Comments required", variant: "destructive" });
      return false;
    }
    mutation.mutate({ action, remarks: remarks.trim() });
    return true;
  };

  const submitSelected = (remarks: string) => {
    if (!selectedAction) return;
    submitAction(selectedAction, remarks);
  };

  useEffect(() => {
    if (!chatActionRequest) return;
    const req = chatActionRequest;
    onChatActionHandled?.();
    if (req.kind === "cancel") {
      setSelectedAction(null);
      setComments("");
      setChecklistOpen(false);
      onConfirmationStateChange?.(null);
      return;
    }
    const map: Record<string, ApprovalAction> = {
      approve: "Approve",
      reject: "Reject",
      more: "More",
      resubmit: "ReSubmit",
    };
    const action = req.action ? map[req.action] : undefined;
    if (!action) return;
    if (req.kind === "start") {
      void startAction(action);
      if (req.comments) setComments(req.comments);
      return;
    }
    if (req.kind === "confirm") {
      // The confirmation may have been collected entirely in chat, in which case
      // this card never ran `startAction` and `selectedAction` is still unset.
      const remarks = req.comments || comments;
      setSelectedAction(action);
      setComments(remarks);
      setChecklistOpen(false);
      chatConfirmRef.current = true;
      if (!submitAction(action, remarks)) {
        chatConfirmRef.current = false;
        onChatActionFailed?.("Comments are required for this action. Please provide a reason.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest?.nonce]);

  const done = status !== "pending";

  return (
    <Card className="mt-3 border-sky-200/70 dark:border-sky-900/50" data-testid="pr-approval-review-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">{header.pr_number || spec.prNumber}</div>
            <div className="text-xs text-muted-foreground">
              {header.pr_type || "STANDARD"} Requisition
            </div>
            {(header.pr_description || spec.title) && (
              <div className="mt-0.5 text-xs text-foreground/80">
                {header.pr_description || spec.title}
              </div>
            )}
          </div>
          <StatusPill
            status={done ? status.replace("_", " ") : header.pr_status || "Pending Approval"}
            tone={
              done
                ? status === "approved"
                  ? "success"
                  : status === "rejected"
                    ? "danger"
                    : "warning"
                : "warning"
            }
          />
        </div>

        {detailQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading PR details…
          </div>
        ) : detailQuery.isError ? (
          <p className="text-xs text-rose-600">Failed to load PR details.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Section title="Requisition Details">
                <div className="space-y-0.5">
                  <LabelValue label="Description" value={header.pr_description} />
                  <LabelValue label="Department" value={header.department_name} />
                  <LabelValue
                    label="Created"
                    value={
                      header.pr_created_date
                        ? formatDateTime(header.pr_created_date)
                        : undefined
                    }
                  />
                  <LabelValue
                    label="Delivery Date"
                    value={
                      header.delivery_date && formatDate(header.delivery_date) !== "-"
                        ? formatDate(header.delivery_date)
                        : undefined
                    }
                  />
                  <LabelValue label="Deliver To" value={header.delivertto_location_name} />
                  <LabelValue
                    label="Total"
                    value={formatCurrency(totalAmount, currency) || String(totalAmount)}
                    valueClassName="font-semibold"
                  />
                  {header.po_number ? (
                    <LabelValue label="Linked PO" value={header.po_number} />
                  ) : null}
                </div>
              </Section>

              <Section title="People & Budget">
                <div className="space-y-0.5">
                  <LabelValue
                    label="Requester"
                    value={
                      <PersonValue name={header.requestor_name} email={header.requestor_email} />
                    }
                  />
                  <LabelValue
                    label="PR Buyer"
                    value={
                      <PersonValue name={header.pr_owner_name} email={header.pr_owner_email} />
                    }
                  />
                  <LabelValue label="Business Entity" value={businessEntityName} />
                  <LabelValue label="Budgeted" value={header.budgeted ? "Yes" : "No"} />
                  {header.budget_name ? (
                    <LabelValue label="Budget" value={header.budget_name} />
                  ) : null}
                  {availableBudget != null && matchedBudgetLine ? (
                    <LabelValue
                      label="Available"
                      value={formatCurrency(
                        availableBudget,
                        matchedBudgetLine.budget_curr || currency,
                      )}
                      valueClassName="text-emerald-600"
                    />
                  ) : null}
                  {header.business_justification ? (
                    <LabelValue label="Justification" value={header.business_justification} />
                  ) : null}
                  {header.business_justification_details ? (
                    <LabelValue
                      label="Details"
                      value={header.business_justification_details}
                    />
                  ) : null}
                </div>
              </Section>
            </div>

            {timelineItems.length > 0 && (
              <Section title="Approval History">
                <ApprovalTimeline history={timelineItems} />
              </Section>
            )}

            <Section title={`Line Items (${lines.length})`}>
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">No line items.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 w-10 text-[11px]">Line</TableHead>
                        <TableHead className="h-8 min-w-[120px] text-[11px]">Description</TableHead>
                        <TableHead className="h-8 text-[11px]">Category</TableHead>
                        <TableHead className="h-8 text-right text-[11px]">Qty</TableHead>
                        <TableHead className="h-8 text-[11px]">UoM</TableHead>
                        <TableHead className="h-8 text-right text-[11px]">Unit Price</TableHead>
                        <TableHead className="h-8 text-right text-[11px]">Amount</TableHead>
                        <TableHead className="h-8 text-[11px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any, idx: number) => {
                        const lineCurrency = line.curr_code || currency;
                        return (
                          <TableRow key={line.id || line.line_num || idx}>
                            <TableCell className="py-1.5 text-xs">
                              {line.line_num ?? idx + 1}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs">
                              <div>{line.item_description || "—"}</div>
                              {line.supplier_name ? (
                                <div className="text-[10px] text-muted-foreground">
                                  {line.supplier_name}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs">
                              {line.product_category_name || "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-xs">
                              {line.qty ?? "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs">{line.uom || "—"}</TableCell>
                            <TableCell className="py-1.5 text-right text-xs">
                              {formatCurrency(line.unit_cost, lineCurrency) || "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-xs font-medium">
                              {formatCurrency(line.amount, lineCurrency) || "—"}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <LineStatusBadge status={line.status} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Section>
          </>
        )}

        <div className="space-y-2 border-t pt-3">
          {!done && !disabled && selectedAction && !checklistOpen && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <Label className="text-xs">
                Comments {commentsRequired ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="Enter comments…"
                data-testid="pr-approval-comments"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => submitSelected(comments)}
                  disabled={mutation.isPending || (commentsRequired && !comments.trim())}
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Confirm"
                  )}{" "}
                  {selectedAction}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedAction(null);
                    setComments("");
                    onConfirmationStateChange?.(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {!done && !disabled && (!selectedAction || checklistOpen) && (
              <>
                {isMoreInfo ? (
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => void startAction("ReSubmit")}
                    disabled={mutation.isPending}
                  >
                    Re-Submit
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => void startAction("Approve")}
                      disabled={mutation.isPending || !taskId}
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      onClick={() => void startAction("Reject")}
                      disabled={mutation.isPending || !taskId}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => void startAction("More")}
                      disabled={mutation.isPending || !taskId}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" /> More Info
                    </Button>
                  </>
                )}
              </>
            )}

          </div>

          {!done && !disabled && (
            <>
              {!taskId && (
                <p className="text-[11px] text-amber-700">
                  No active workflow task id found for this PR.
                </p>
              )}
              {taskQuery.data?.assignee_ && (
                <p className="text-[11px] text-muted-foreground">
                  Assigned to: {taskQuery.data.assignee_}
                </p>
              )}
            </>
          )}
        </div>

        <ApprovalChecklistDialog
          open={checklistOpen}
          onOpenChange={setChecklistOpen}
          moduleName="Purchase Request"
          title={header.pr_description || spec.title || spec.prNumber}
          refNumber={header.pr_number || spec.prNumber}
          approving={mutation.isPending}
          onApprove={(checklistComments) => {
            setChecklistOpen(false);
            const merged = [comments.trim(), checklistComments].filter(Boolean).join(" | ");
            setSelectedAction("Approve");
            submitSelected(merged || comments || "Approved");
          }}
        />
      </CardContent>
    </Card>
  );
}
