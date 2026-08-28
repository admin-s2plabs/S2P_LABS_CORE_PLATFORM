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
import { useAISettings } from "@/hooks/use-ai-settings";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/common-functions";
import type { PoApprovalReviewSpec } from "@shared/procurement-activation-signals";
import type { ProcurementChatActionRequest } from "./procurement-activation-chat-actions";
import {
  AiSummaryBlock,
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

function PersonValue({ name, email }: { name?: string | null; email?: string | null }) {
  if (!name && !email) return "—";
  return (
    <span className="flex flex-col gap-0.5">
      <span>{name || "—"}</span>
      {email ? <span className="text-[10px] font-normal text-muted-foreground">{email}</span> : null}
    </span>
  );
}

function mapApprovalHistoryForTimeline(approvalHistory: any[], po: any) {
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
              : st === "more" || st.includes("more info")
                ? "More"
                : st === "resubmit"
                  ? "ReSubmit"
                  : approval.status || "Approved",
        date: approval.approved_date,
        comments: approval.comments,
      });
    });

  const pendingStatuses = [
    "Pending Approval",
    "Pending",
    "PENDING",
    "Pending_Approval",
    "In Approval",
  ];
  if (po.po_status && pendingStatuses.includes(po.po_status)) {
    const currentApprovers = po.approvers_list
      ? String(po.approvers_list)
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

export function PoApprovalReviewCard({
  spec,
  status,
  disabled,
  onComplete,
  chatActionRequest,
  onChatActionHandled,
  onChatActionFailed,
  onConfirmationStateChange,
}: {
  spec: PoApprovalReviewSpec;
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
  const { isAIEnabled } = useAISettings();
  const [selectedAction, setSelectedAction] = useState<ApprovalAction | null>(null);
  const [comments, setComments] = useState("");
  const [checklistOpen, setChecklistOpen] = useState(false);
  // Chat-driven submissions need their outcome echoed back into the transcript.
  const chatConfirmRef = useRef(false);
  const [anomaly, setAnomaly] = useState<any>(null);
  const [deliveryRisk, setDeliveryRisk] = useState<any>(null);

  const detailQuery = useQuery({
    queryKey: ["/api/purchase-orders", spec.poNumber],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${spec.poNumber}`);
      return parseJsonResponse<any>(res);
    },
  });

  const activeTaskQuery = useQuery({
    queryKey: ["/api/purchase-orders", spec.poNumber, "active-task"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${spec.poNumber}/active-task`);
      return parseJsonResponse<any>(res);
    },
  });

  const po = detailQuery.data || {};
  const items: any[] = po.items || [];
  const approvalHistory = po.approvalHistory || [];
  const taskId =
    spec.taskId || po.attribute_12 || activeTaskQuery.data?.id_ || activeTaskQuery.data?.taskId;
  const entityStatus = String(po.po_status || "").toLowerCase();
  const isMoreInfo =
    entityStatus.includes("more info") ||
    entityStatus === "more" ||
    entityStatus.includes("more information");

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
    enabled: !!po.budget_segment || !!po.budget_name,
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
    organizations.find((o) => String(o.id) === String(po.org_id))?.organization_name ||
    po.business_entity_name ||
    null;

  const matchedBudgetLine = budgetLines.find(
    (bl) => String(bl.id) === String(po.budget_segment),
  );

  const availableBudget = matchedBudgetLine
    ? Math.max(
        0,
        (parseFloat(matchedBudgetLine.amount) || 0) -
          (parseFloat(matchedBudgetLine.consumed_amount) || 0) -
          (parseFloat(matchedBudgetLine.reserved_amount) || 0),
      )
    : null;

  const currency = po.po_currency || "USD";
  const grossAmount = po.po_net_cost ?? null;
  const taxAmount = po.po_tax ?? null;
  const netAmount = po.po_total_cost ?? null;
  const showDiscountCol = po.tax_included !== "Yes";

  const supplierName = po.company_name || po.supplier?.supplier_name || null;
  const supplierEmail = po.supplier?.email_id || null;
  const supplierPhone = po.supplier?.phone || null;
  const supplierLocation = [po.supplier?.city, po.supplier?.country].filter(Boolean).join(", ") || null;

  const advanceEnabled = po.advance_flag === "Y" || po.advance_flag === true;
  const advancePct = parseFloat(String(po.advance_percentage || "0")) || 0;
  const advanceAmount =
    advanceEnabled && netAmount != null
      ? (parseFloat(String(netAmount)) * advancePct) / 100
      : null;

  const timelineItems = useMemo(
    () => mapApprovalHistoryForTimeline(approvalHistory, po),
    [approvalHistory, po],
  );

  useEffect(() => {
    if (!detailQuery.data || !isAIEnabled("AI_PO_ANOMALY_DETECTION")) {
      setAnomaly(null);
      setDeliveryRisk(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("POST", `/api/purchase-orders/${spec.poNumber}/ai-analyze`);
        const data = await parseJsonResponse<any>(res);
        if (!cancelled) setAnomaly(data);

        if (detailQuery.data?.supplier_id) {
          try {
            const riskRes = await apiRequest(
              "GET",
              `/api/purchase-orders/${spec.poNumber}/delivery-risk`,
            );
            const riskData = await parseJsonResponse<any>(riskRes);
            if (!cancelled) setDeliveryRisk(riskData);
          } catch {
            /* best-effort */
          }
        }
      } catch {
        if (!cancelled) {
          setAnomaly(null);
          setDeliveryRisk(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailQuery.data, isAIEnabled, spec.poNumber]);

  const hasAnomalyInsight =
    !!anomaly?.summary?.narrative || (anomaly?.summary?.totalAnomalies ?? 0) > 0;
  const hasDeliveryInsight =
    !!deliveryRisk?.narrative ||
    (!!deliveryRisk?.riskLevel &&
      !["none", "insufficient_data"].includes(String(deliveryRisk.riskLevel).toLowerCase()));
  const showAiSummary = hasAnomalyInsight || hasDeliveryInsight;

  const mutation = useMutation({
    mutationFn: async ({ action, remarks }: { action: ApprovalAction; remarks: string }) => {
      if (!taskId) throw new Error("Missing workflow task id");
      return apiRequest("POST", `/api/purchase-orders/${spec.poNumber}/process-approval`, {
        taskId,
        result: action,
        comments: remarks,
      });
    },
    onSuccess: (_data, vars) => {
      toast({ title: "PO updated", description: `Action ${vars.action} completed.` });
      queryClient.invalidateQueries({ queryKey: PROCUREMENT_ACTIVATION_SIGNALS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", spec.poNumber] });
      chatConfirmRef.current = false;
      setSelectedAction(null);
      setComments("");
      onConfirmationStateChange?.(null);
      onComplete(actionToStatus(vars.action));
    },
    onError: (err: any) => {
      const message = err?.message || "Could not process PO approval";
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
      const available = await resolveApprovalChecklistAvailability("Purchase Order");
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
    <Card
      className="mt-3 border-indigo-200/70 dark:border-indigo-900/50"
      data-testid="po-approval-review-card"
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">{po.po_number || spec.poNumber}</div>
            <div className="text-xs text-muted-foreground">
              {po.po_type || "STANDARD"} Purchase Order
            </div>
            {(po.po_description || spec.title) && (
              <div className="mt-0.5 text-xs text-foreground/80">
                {po.po_description || spec.title}
              </div>
            )}
          </div>
          <StatusPill
            status={done ? status.replace("_", " ") : po.po_status || "Pending Approval"}
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
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading PO details…
          </div>
        ) : detailQuery.isError ? (
          <p className="text-xs text-rose-600">Failed to load PO details.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Section title="Order Details">
                <div className="space-y-0.5">
                  {po.po_description ? (
                    <LabelValue label="Description" value={po.po_description} />
                  ) : null}
                  <LabelValue
                    label="Created"
                    value={po.creation_date ? formatDateTime(po.creation_date) : undefined}
                  />
                  <LabelValue
                    label="Issue Date"
                    value={
                      po.po_issue_date && formatDate(po.po_issue_date) !== "-"
                        ? formatDate(po.po_issue_date)
                        : undefined
                    }
                  />
                  <LabelValue
                    label="Required Date"
                    value={
                      po.po_required_date && formatDate(po.po_required_date) !== "-"
                        ? formatDate(po.po_required_date)
                        : undefined
                    }
                  />
                  <LabelValue
                    label="Buyer"
                    value={<PersonValue name={po.buyer_name} email={po.buyer_email} />}
                  />
                  <LabelValue
                    label="Owner"
                    value={<PersonValue name={po.po_owner_name} email={po.po_owner_email} />}
                  />
                  <LabelValue label="Department" value={po.department_name} />
                  <LabelValue label="Business Entity" value={businessEntityName} />
                  {po.pr_number ? <LabelValue label="Source PR" value={po.pr_number} /> : null}
                  {po.attribute_5 ? <LabelValue label="Source Bid" value={po.attribute_5} /> : null}
                </div>
              </Section>

              <Section title="Supplier & Delivery">
                <div className="space-y-0.5">
                  <LabelValue
                    label="Supplier"
                    value={<PersonValue name={supplierName} email={supplierEmail} />}
                  />
                  {supplierPhone ? <LabelValue label="Phone" value={supplierPhone} /> : null}
                  {supplierLocation ? (
                    <LabelValue label="Location" value={supplierLocation} />
                  ) : null}
                  <LabelValue label="Deliver To" value={po.delivertto_location_name} />
                  {po.shipto_address ? (
                    <LabelValue label="Ship To" value={po.shipto_address} />
                  ) : null}
                  <LabelValue
                    label="Advance"
                    value={
                      advanceEnabled
                        ? advancePct
                          ? `${advancePct}%`
                          : "Yes"
                        : "No"
                    }
                  />
                  {advanceAmount != null && advanceAmount > 0 ? (
                    <LabelValue
                      label="Advance Amt"
                      value={formatCurrency(advanceAmount, currency)}
                    />
                  ) : null}
                </div>
              </Section>
            </div>

            <Section title="Payment & Amount">
              <div className="grid gap-x-4 sm:grid-cols-2">
                <LabelValue label="Payment Terms" value={po.payment_terms_name} />
                <LabelValue label="Currency" value={currency} />
                {po.budget_name ? <LabelValue label="Budget" value={po.budget_name} /> : null}
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
                <LabelValue
                  label="Gross Amount"
                  value={
                    grossAmount != null ? formatCurrency(grossAmount, currency) : undefined
                  }
                />
                <LabelValue
                  label="Tax"
                  value={taxAmount != null ? formatCurrency(taxAmount, currency) : undefined}
                />
                <LabelValue
                  label="Net Amount"
                  value={netAmount != null ? formatCurrency(netAmount, currency) : undefined}
                  valueClassName="font-semibold"
                />
              </div>
            </Section>

            {timelineItems.length > 0 && (
              <Section title="Approval History">
                <ApprovalTimeline history={timelineItems} />
              </Section>
            )}

            {showAiSummary && (
              <AiSummaryBlock>
                <div className="space-y-2 text-xs">
                  {hasAnomalyInsight && (
                    <div>
                      <p>
                        Anomaly risk:{" "}
                        <strong>
                          {String(anomaly.summary?.overallRisk || "n/a").toUpperCase()}
                        </strong>
                        {anomaly.summary?.totalAnomalies != null
                          ? ` (${anomaly.summary.totalAnomalies} findings)`
                          : null}
                      </p>
                      {anomaly.summary?.narrative ? (
                        <p className="mt-1">{anomaly.summary.narrative}</p>
                      ) : null}
                    </div>
                  )}
                  {hasDeliveryInsight && (
                    <div>
                      <p>
                        Delivery risk:{" "}
                        <strong>{String(deliveryRisk.riskLevel || "n/a").toUpperCase()}</strong>
                      </p>
                      {deliveryRisk.narrative ? (
                        <p className="mt-1">{deliveryRisk.narrative}</p>
                      ) : null}
                      {deliveryRisk.recommendation ? (
                        <p className="mt-1 text-muted-foreground">{deliveryRisk.recommendation}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </AiSummaryBlock>
            )}

            <Section title={`Line Items (${items.length})`}>
              {items.length === 0 ? (
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
                        {showDiscountCol && (
                          <TableHead className="h-8 text-right text-[11px]">Discount</TableHead>
                        )}
                        <TableHead className="h-8 text-right text-[11px]">Amount</TableHead>
                        <TableHead className="h-8 text-right text-[11px]">Tax Rate</TableHead>
                        <TableHead className="h-8 text-right text-[11px]">Tax</TableHead>
                        <TableHead className="h-8 text-[11px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item: any, idx: number) => {
                        const lineCurrency = item.line_curr || currency;
                        return (
                          <TableRow key={item.id || item.po_line_number || idx}>
                            <TableCell className="py-1.5 text-xs">
                              {item.po_line_number ?? idx + 1}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs">
                              <div>{item.item_name || "—"}</div>
                              {item.line_description ? (
                                <div className="text-[10px] text-muted-foreground">
                                  {item.line_description}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs">
                              {item.product_category_name || "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-xs">
                              {item.line_qty ?? "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs">
                              {item.line_unit || "EA"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-xs">
                              {formatCurrency(item.line_unit_cost, lineCurrency)}
                            </TableCell>
                            {showDiscountCol && (
                              <TableCell className="py-1.5 text-right text-xs">
                                {item.discount != null ? formatCurrency(item.discount, lineCurrency) : "—"}
                              </TableCell>
                            )}
                            <TableCell className="py-1.5 text-right text-xs font-medium">
                              {formatCurrency(item.line_cost, lineCurrency)}
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-xs">
                              {item.tax_rate != null ? `${item.tax_rate}%` : "—"}
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-xs">
                              {item.tax_amount != null
                                ? formatCurrency(item.tax_amount, lineCurrency)
                                : "—"}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <LineStatusBadge status={item.line_status} />
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
                data-testid="po-approval-comments"
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
                  No active workflow task id found for this PO.
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
          moduleName="Purchase Order"
          title={po.po_description || spec.title || spec.poNumber}
          refNumber={po.po_number || spec.poNumber}
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
