import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Loader2,
  MessageSquarePlus,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/common-functions";
import { PAYABLES_ACTIVATION_SIGNALS_QUERY_KEY } from "@/hooks/usePayablesActivationSignals";
import {
  AiSummaryBlock,
  ApprovalTimeline,
  Section,
  StatusPill,
} from "./procurement-activation/card-primitives";
import type {
  PayablesActivationAction,
  PayablesChatActionRequest,
} from "./payables-activation-chat-actions";
import { payablesActionRequiresComments } from "./payables-activation-chat-actions";
import { usePayablesDelegateApprovers } from "@/hooks/usePayablesDelegateApprovers";
import { PayablesInvoiceDocuments } from "./payables-invoice-documents";

/**
 * Structural mirror of the shared invoice review spec so the card stays usable
 * regardless of which alias the conversation layer passes it under.
 */
export type PayablesInvoiceApprovalCardSpec = {
  invoiceId: string;
  taskId?: string;
  title: string;
  invoiceNumber?: string;
  supplierName?: string;
  description?: string;
};

export type PayablesInvoiceApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "more_info"
  | "delegated";

const ACTION_LABELS: Record<PayablesActivationAction, string> = {
  approve: "Approve",
  reject: "Reject",
  more: "Request More Information",
  delegate: "Request for Delegate",
};
const ACTION_SUBMIT_LABELS: Record<PayablesActivationAction, string> = {
  approve: "Approve",
  reject: "Reject",
  more: "Request Info",
  delegate: "Delegate",
};

const ACTION_RESULTS: Record<Exclude<PayablesActivationAction, "delegate">, string> = {
  approve: "Approve",
  reject: "Reject",
  more: "More",
};

function actionToStatus(action: PayablesActivationAction): PayablesInvoiceApprovalStatus {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  if (action === "delegate") return "delegated";
  return "more_info";
}

function hasDisplayValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
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
    <div className="flex min-w-0 items-start gap-2 py-0.5">
      <span className="w-28 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground">:</span>
      <span className={`min-w-0 flex-1 break-words text-xs font-medium ${valueClassName}`}>
        {value === undefined || value === null || value === "" ? "—" : value}
      </span>
    </div>
  );
}

function mapApprovalHistoryForTimeline(approvalHistory: any[], invoice: any) {
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
                  : st === "delegate" || st.includes("delegat")
                    ? "Delegated"
                    : approval.status || "Approved",
        date: approval.approved_date || approval.requested_date,
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
  if (invoice?.invoice_status && pendingStatuses.includes(invoice.invoice_status)) {
    const currentApprovers = invoice.invoice_approvers
      ? String(invoice.invoice_approvers)
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

export function PayablesInvoiceApprovalReviewCard({
  spec,
  status,
  disabled,
  onComplete,
  chatActionRequest,
  onChatActionHandled,
  onConfirmationStateChange,
  onActionError,
}: {
  spec: PayablesInvoiceApprovalCardSpec;
  status: PayablesInvoiceApprovalStatus;
  disabled?: boolean;
  onComplete: (result: PayablesInvoiceApprovalStatus) => void;
  chatActionRequest?: PayablesChatActionRequest | null;
  onChatActionHandled?: () => void;
  onConfirmationStateChange?: (action: PayablesActivationAction | null) => void;
  onActionError?: (action: PayablesActivationAction, message: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<PayablesActivationAction | null>(null);
  const [comments, setComments] = useState("");
  const [delegateUserName, setDelegateUserName] = useState("");
  const [queuedDelegateConfirm, setQueuedDelegateConfirm] = useState<{
    comments?: string;
    delegateUserName?: string;
  } | null>(null);

  const invoiceId = String(spec.invoiceId);

  const detailQuery = useQuery({
    queryKey: ["/api/invoices", invoiceId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices/${invoiceId}`);
      return parseJsonResponse<any>(res);
    },
    enabled: !!invoiceId,
  });

  const linesQuery = useQuery({
    queryKey: ["/api/invoices", invoiceId, "lines"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices/${invoiceId}/lines`);
      return parseJsonResponse<any[]>(res);
    },
    enabled: !!invoiceId,
  });

  const historyQuery = useQuery({
    queryKey: ["/api/invoices", invoiceId, "approval-history"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices/${invoiceId}/approval-history`);
      return parseJsonResponse<any[]>(res);
    },
    enabled: !!invoiceId,
  });

  const invoice = detailQuery.data || {};
  const lines: any[] = Array.isArray(linesQuery.data) ? linesQuery.data : [];
  const approvalHistory: any[] = Array.isArray(historyQuery.data) ? historyQuery.data : [];
  const taskId = spec.taskId || invoice.attribute_12 || undefined;

  const taskQuery = useQuery({
    queryKey: ["/api/workflow-engine/task", taskId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/workflow-engine/task/${encodeURIComponent(String(taskId))}`,
      );
      return parseJsonResponse<any>(res);
    },
    enabled: !!taskId,
  });

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
    enabled: !!invoice.budget_segment || !!invoice.budget_name,
  });

  const delegateApproversQuery = usePayablesDelegateApprovers(true);

  const fraudQuery = useQuery({
    queryKey: ["/api/invoices", invoiceId, "ai-fraud-check"],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/ai-fraud-check`);
      return parseJsonResponse<any>(res);
    },
    enabled: !!detailQuery.data && !!invoiceId,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const organizations = orgsQuery.data || [];
  const budgetLines = budgetLinesQuery.data || [];
  const delegateApprovers = (delegateApproversQuery.data || []).filter((user) => !!user.id);
  const selectedDelegate = delegateApprovers.find(
    (user) => String(user.user_name || user.id) === delegateUserName,
  );
  const fraud = fraudQuery.data;

  useEffect(() => {
    if (selectedAction !== "delegate" || !delegateUserName || selectedDelegate) return;
    const needle = delegateUserName.trim().toLowerCase();
    if (!needle || delegateApprovers.length === 0) return;
    const matches = delegateApprovers.filter((user) =>
      [user.user_name, user.name, user.email_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
    if (matches.length === 1) {
      setDelegateUserName(String(matches[0].user_name || matches[0].id));
    }
  }, [delegateApprovers, delegateUserName, selectedAction, selectedDelegate]);

  const businessEntityName =
    organizations.find((org) => String(org.id) === String(invoice.org_id))?.organization_name ||
    invoice.business_entity_name ||
    invoice.attribute_1 ||
    null;

  const matchedBudgetLine = budgetLines.find(
    (line) =>
      String(line.id) === String(invoice.budget_segment) ||
      (!!invoice.budget_name && String(line.budget_name) === String(invoice.budget_name)),
  );

  const supplierEmail =
    invoice.supplier_contact_email || invoice.supplier_email || invoice.email;
  const supplierPhone =
    invoice.supplier_contact_phone || invoice.supplier_contact_no || invoice.supplier_phone;

  const currency =
    invoice.invoice_curr_code ||
    invoice.invoice_currency ||
    invoice.currency ||
    matchedBudgetLine?.budget_curr ||
    "AED";
  const invoiceAmount = invoice.gross_amount ?? invoice.invoice_amount ?? null;
  const taxAmount = invoice.tax_amount ?? null;
  const totalAmount =
    invoice.total_amount ??
    (invoiceAmount != null
      ? (parseFloat(String(invoiceAmount)) || 0) + (parseFloat(String(taxAmount)) || 0)
      : null);

  const isPrepayment = String(invoice.invoice_type || "").toUpperCase() === "PREPAYMENT";
  const lineSubtotal = lines.reduce(
    (sum: number, line: any) => sum + (Number(line.order_cost) || 0),
    0,
  );
  const lineTaxTotal = lines.reduce(
    (sum: number, line: any) => sum + (Number(line.tax_amount) || 0),
    0,
  );

  const entityStatus = String(invoice.invoice_status || "").toLowerCase();
  const isMoreInfo =
    entityStatus.includes("more info") ||
    entityStatus === "more" ||
    entityStatus.includes("more information");

  const timelineItems = useMemo(
    () => mapApprovalHistoryForTimeline(approvalHistory, invoice),
    [approvalHistory, invoice],
  );

  const resetActionState = () => {
    setSelectedAction(null);
    setComments("");
    setDelegateUserName("");
  };

  const invalidateAfterAction = () => {
    queryClient.invalidateQueries({ queryKey: PAYABLES_ACTIVATION_SIGNALS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId] });
    queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/lines`] });
    queryClient.invalidateQueries({ queryKey: [`/api/invoices/${invoiceId}/approval-history`] });
    queryClient.invalidateQueries({ queryKey: ["/api/workflow-engine/task"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
  };

  const approvalMutation = useMutation({
    mutationFn: async ({
      action,
      remarks,
    }: {
      action: Exclude<PayablesActivationAction, "delegate">;
      remarks: string;
    }) => {
      if (!taskId) throw new Error("Missing workflow task id");
      return apiRequest("POST", `/api/invoices/${invoiceId}/process-approval`, {
        taskId,
        result: ACTION_RESULTS[action],
        comments: remarks,
      });
    },
    onSuccess: (_data, vars) => {
      toast({
        title:
          vars.action === "approve"
            ? "Invoice Approved"
            : vars.action === "reject"
              ? "Invoice Rejected"
              : "More Info Requested",
        description: `Action ${ACTION_LABELS[vars.action]} completed.`,
      });
      invalidateAfterAction();
      resetActionState();
      onConfirmationStateChange?.(null);
      onComplete(actionToStatus(vars.action));
    },
    onError: (err: any, vars) => {
      const message = err?.message || "Could not process invoice approval";
      toast({ title: "Approval failed", description: message, variant: "destructive" });
      onActionError?.(vars.action, message);
    },
    onSettled: () => {
      document.body.style.pointerEvents = "";
    },
  });

  const delegateMutation = useMutation({
    mutationFn: async ({ userName, remarks }: { userName: string; remarks: string }) => {
      if (!taskId) throw new Error("Missing workflow task id");
      return apiRequest("POST", "/api/workflow/delegate-request", {
        taskId,
        userName,
        comments: remarks,
        entityId: invoiceId,
        module: "INVOICE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Request Delegated",
        description: "Invoice approval has been delegated.",
      });
      invalidateAfterAction();
      resetActionState();
      onConfirmationStateChange?.(null);
      onComplete("delegated");
    },
    onError: (err: any) => {
      const message = err?.message || "Could not delegate the invoice approval";
      toast({ title: "Delegation failed", description: message, variant: "destructive" });
      onActionError?.("delegate", message);
    },
    onSettled: () => {
      document.body.style.pointerEvents = "";
    },
  });

  const busy = approvalMutation.isPending || delegateMutation.isPending;
  const commentsRequired = !!selectedAction && payablesActionRequiresComments(selectedAction);
  const isDelegate = selectedAction === "delegate";

  const startAction = (action: PayablesActivationAction) => {
    setSelectedAction(action);
    onConfirmationStateChange?.(action);
  };

  const submitSelected = (
    action: PayablesActivationAction,
    remarks: string,
    userName?: string,
  ) => {
    const trimmedRemarks = remarks.trim();
    if (!taskId) {
      toast({
        title: "No active workflow task",
        description: "This invoice has no active approval task.",
        variant: "destructive",
      });
      return;
    }
    if (action === "delegate") {
      const trimmedUser = (userName || "").trim();
      if (!trimmedUser) {
        toast({ title: "Approver required", variant: "destructive" });
        return;
      }
      // Guard the chat path the same way the button is guarded: only submit a
      // canonical approver that exists in the loaded list.
      const resolved = delegateApprovers.find(
        (user) => String(user.user_name || user.id) === trimmedUser,
      );
      if (!resolved) {
        toast({
          title: "Approver not found",
          description: "Select a valid approver before delegating.",
          variant: "destructive",
        });
        onActionError?.("delegate", `Couldn't find approver "${trimmedUser}".`);
        return;
      }
      if (!trimmedRemarks) {
        toast({ title: "Remarks required", variant: "destructive" });
        return;
      }
      delegateMutation.mutate({
        userName: String(resolved.user_name || resolved.id),
        remarks: trimmedRemarks,
      });
      return;
    }
    if (payablesActionRequiresComments(action) && !trimmedRemarks) {
      toast({ title: "Remarks required", variant: "destructive" });
      return;
    }
    approvalMutation.mutate({ action, remarks: trimmedRemarks });
  };

  useEffect(() => {
    if (!chatActionRequest) return;
    const req = chatActionRequest;
    onChatActionHandled?.();
    if (req.kind === "cancel") {
      resetActionState();
      onConfirmationStateChange?.(null);
      return;
    }
    const action = req.action;
    if (!action) return;
    if (req.kind === "start") {
      startAction(action);
      if (req.comments) setComments(req.comments);
      if (req.delegateUserName) setDelegateUserName(req.delegateUserName);
      return;
    }
    if (req.kind === "confirm") {
      setSelectedAction(action);
      if (req.comments) setComments(req.comments);
      if (req.delegateUserName) setDelegateUserName(req.delegateUserName);
      // The approver list must be loaded before we can validate/submit a
      // delegation; defer the submit until it resolves.
      if (action === "delegate" && delegateApproversQuery.isLoading) {
        setQueuedDelegateConfirm({
          comments: req.comments,
          delegateUserName: req.delegateUserName,
        });
        return;
      }
      submitSelected(
        action,
        req.comments || comments,
        req.delegateUserName || delegateUserName,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest?.nonce]);

  useEffect(() => {
    if (!queuedDelegateConfirm || delegateApproversQuery.isLoading) return;
    const queued = queuedDelegateConfirm;
    setQueuedDelegateConfirm(null);
    setSelectedAction("delegate");
    if (queued.comments) setComments(queued.comments);
    if (queued.delegateUserName) setDelegateUserName(queued.delegateUserName);
    submitSelected(
      "delegate",
      queued.comments || comments,
      queued.delegateUserName || delegateUserName,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedDelegateConfirm, delegateApproversQuery.isLoading]);

  const done = status !== "pending";
  const showActions = !done && !disabled;

  return (
    <Card
      className="mt-3 border-indigo-200/70 dark:border-indigo-900/50"
      data-testid="payables-invoice-approval-review-card"
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold">
            {invoice.invoice_number || spec.invoiceNumber || `Invoice ${invoiceId}`}
          </div>
          <StatusPill
            status={done ? status.replace("_", " ") : invoice.invoice_status || "Pending Approval"}
            tone={
              done
                ? status === "approved"
                  ? "success"
                  : status === "rejected"
                    ? "danger"
                    : status === "delegated"
                      ? "info"
                      : "warning"
                : "warning"
            }
          />
        </div>

        {detailQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading invoice details…
          </div>
        ) : detailQuery.isError ? (
          <p className="text-xs text-rose-600">Failed to load invoice details.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Section title="Invoice Details">
                <div className="space-y-0.5">
                  <LabelValue label="Invoice No" value={invoice.invoice_number} />
                  <LabelValue label="Description" value={invoice.description || spec.description} />
                  <LabelValue label="Type" value={invoice.invoice_type} />
                  <LabelValue label="Source" value={invoice.invoice_source} />
                  <LabelValue
                    label="Invoice Date"
                    value={
                      invoice.invoice_date && formatDate(invoice.invoice_date) !== "-"
                        ? formatDate(invoice.invoice_date)
                        : undefined
                    }
                  />
                  <LabelValue
                    label="Due Date"
                    value={
                      invoice.inv_due_date && formatDate(invoice.inv_due_date) !== "-"
                        ? formatDate(invoice.inv_due_date)
                        : undefined
                    }
                  />
                  <LabelValue label="Currency" value={currency} />
                  <LabelValue label="Submitted By" value={invoice.submitted_by} />
                  {hasDisplayValue(invoice.po_number) ? (
                    <>
                      <LabelValue label="PO Number" value={invoice.po_number} />
                      {hasDisplayValue(invoice.po_description) ? (
                        <LabelValue label="PO Description" value={invoice.po_description} />
                      ) : null}
                      {invoice.po_total_amount != null ? (
                        <LabelValue
                          label="PO Total"
                          value={formatCurrency(invoice.po_total_amount, currency)}
                        />
                      ) : null}
                    </>
                  ) : hasDisplayValue(invoice.invoice_reason || invoice.reason_for_non_po) ? (
                    <LabelValue
                      label="Reason for Non-PO"
                      value={invoice.invoice_reason || invoice.reason_for_non_po}
                    />
                  ) : null}
                  {hasDisplayValue(invoice.invoice_notes) ? (
                    <LabelValue label="Notes" value={invoice.invoice_notes} />
                  ) : null}
                  {hasDisplayValue(invoice.do_number) ? (
                    <LabelValue label="DO Number" value={invoice.do_number} />
                  ) : null}
                  {hasDisplayValue(invoice.contr_ref_no) ? (
                    <LabelValue label="Contract Ref" value={invoice.contr_ref_no} />
                  ) : null}
                </div>
              </Section>

              <Section title="Supplier & Financial Details">
                <div className="space-y-0.5">
                  <LabelValue
                    label="Supplier"
                    value={
                      invoice.supplier_display_name ||
                      invoice.supplier_name ||
                      spec.supplierName
                    }
                  />
                  {hasDisplayValue(supplierEmail) ? (
                    <LabelValue label="Email" value={supplierEmail} />
                  ) : null}
                  {hasDisplayValue(supplierPhone) ? (
                    <LabelValue label="Phone" value={supplierPhone} />
                  ) : null}
                  <LabelValue
                    label="Department"
                    value={invoice.department_name || invoice.department}
                  />
                  <LabelValue
                    label="Gross Amount"
                    value={
                      invoiceAmount != null ? formatCurrency(invoiceAmount, currency) : undefined
                    }
                  />
                  <LabelValue
                    label="Tax Amount"
                    value={taxAmount != null ? formatCurrency(taxAmount, currency) : undefined}
                  />
                  <LabelValue
                    label="Payment Terms"
                    value={invoice.payment_terms_name || invoice.payment_terms}
                  />
                  <LabelValue
                    label="Budget"
                    value={invoice.budget_name || matchedBudgetLine?.budget_name}
                  />
                  <LabelValue label="Business Entity" value={businessEntityName} />
                  <LabelValue
                    label="Total Amount"
                    value={
                      totalAmount != null ? formatCurrency(totalAmount, currency) : undefined
                    }
                    valueClassName="font-semibold"
                  />
                </div>
              </Section>
            </div>

            <Section title="Approval History">
              {timelineItems.length > 0 ? (
                <ApprovalTimeline history={timelineItems} />
              ) : (
                <p className="text-xs text-muted-foreground">No approval history yet.</p>
              )}
            </Section>

            <Section title="AI Fraud Check">
              <AiSummaryBlock
                loading={fraudQuery.isLoading}
                error={fraudQuery.isError ? "AI fraud check unavailable for this invoice." : null}
              >
                {fraud ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        className={cn(
                          "text-[10px] font-medium",
                          fraud.riskLevel === "high" &&
                            "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
                          fraud.riskLevel === "medium" &&
                            "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
                          fraud.riskLevel === "low" &&
                            "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
                        )}
                      >
                        {fraud.riskLevel === "high"
                          ? "High Risk"
                          : fraud.riskLevel === "medium"
                            ? "Medium Risk"
                            : "Low Risk"}
                      </Badge>
                      {fraud.riskScore != null && (
                        <Badge variant="outline" className="text-[10px]">
                          Score: {fraud.riskScore}/100
                        </Badge>
                      )}
                      {fraud.flags?.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {fraud.flags.length} indicator{fraud.flags.length !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>

                    {fraud.narrative ? <MarkdownContent content={fraud.narrative} /> : null}

                    {fraud.flags?.length === 0 ? (
                      <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5" /> No fraud indicators detected.
                      </p>
                    ) : null}

                    {fraud.flags?.length > 0 && (
                      <div className="space-y-1.5">
                        {fraud.flags.map((flag: any, idx: number) => (
                          <div
                            key={idx}
                            className={cn(
                              "rounded-md border px-2.5 py-2",
                              flag.severity === "high" &&
                                "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950",
                              flag.severity === "medium" &&
                                "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
                              flag.severity === "low" &&
                                "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] font-medium">
                                {flag.severity}
                              </Badge>
                              {flag.confidence != null && (
                                <Badge variant="outline" className="text-[10px] font-medium">
                                  {flag.confidence}% confidence
                                </Badge>
                              )}
                              <span className="text-xs font-medium">
                                {flag.label || flag.type}
                              </span>
                            </div>
                            {flag.description ? (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {flag.description}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}

                    {fraud.analyzedAt ? (
                      <p className="text-right text-[10px] text-muted-foreground">
                        Analyzed at: {formatDateTime(fraud.analyzedAt)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </AiSummaryBlock>
            </Section>

            <Section title={`Line Items (${lines.length})`}>
              {linesQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading line items…</p>
              ) : lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">No line items.</p>
              ) : (
                <div className="rounded-md border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-7 w-[40px] px-2 text-[11px] font-medium">#</TableHead>
                          <TableHead className="h-7 min-w-[120px] px-2 text-[11px] font-medium">
                            Item Name
                          </TableHead>
                          {!isPrepayment && (
                            <>
                              <TableHead className="h-7 px-2 text-[11px] font-medium">Type</TableHead>
                              <TableHead className="h-7 px-2 text-[11px] font-medium">
                                Delivery Date
                              </TableHead>
                              <TableHead className="h-7 px-2 text-right text-[11px] font-medium">
                                Qty
                              </TableHead>
                            </>
                          )}
                          <TableHead className="h-7 px-2 text-right text-[11px] font-medium">
                            Unit Cost
                          </TableHead>
                          <TableHead className="h-7 px-2 text-right text-[11px] font-medium">
                            Amount
                          </TableHead>
                          <TableHead className="h-7 px-2 text-right text-[11px] font-medium">
                            Tax Rate
                          </TableHead>
                          <TableHead className="h-7 px-2 text-right text-[11px] font-medium">
                            Tax
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line: any, idx: number) => (
                          <TableRow key={line.id || line.line_number || idx}>
                            <TableCell className="px-2 py-1 text-xs">
                              {line.line_number ?? idx + 1}
                            </TableCell>
                            <TableCell className="px-2 py-1 text-xs font-medium">
                              {line.item_name || "-"}
                            </TableCell>
                            {!isPrepayment && (
                              <>
                                <TableCell className="px-2 py-1 text-xs">
                                  {line.product_category_name || "-"}
                                </TableCell>
                                <TableCell className="px-2 py-1 text-xs">
                                  {line.delivery_date ? formatDate(line.delivery_date) : "-"}
                                </TableCell>
                                <TableCell className="px-2 py-1 text-right text-xs">
                                  {line.order_qty ?? "-"}
                                </TableCell>
                              </>
                            )}
                            <TableCell className="px-2 py-1 text-right text-xs">
                              {formatCurrency(line.order_unit_cost, currency)}
                            </TableCell>
                            <TableCell className="px-2 py-1 text-right text-xs font-medium">
                              {formatCurrency(line.order_cost, currency)}
                            </TableCell>
                            <TableCell className="px-2 py-1 text-right text-xs">
                              {line.tax_rate != null && line.tax_rate !== ""
                                ? `${line.tax_rate}%`
                                : "-"}
                            </TableCell>
                            <TableCell className="px-2 py-1 text-right text-xs">
                              {formatCurrency(line.tax_amount, currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-end gap-6 border-t p-2.5">
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">Subtotal</p>
                      <p className="text-xs font-medium">
                        {formatCurrency(lineSubtotal, currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">Tax</p>
                      <p className="text-xs font-medium">{formatCurrency(lineTaxTotal, currency)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">Total</p>
                      <p className="text-xs font-bold">
                        {formatCurrency(lineSubtotal + lineTaxTotal, currency)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            <PayablesInvoiceDocuments invoiceId={invoiceId} />
          </>
        )}

        <div className="space-y-2 border-t pt-3">
          {showActions && selectedAction && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              {isDelegate && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Approver (required)</Label>
                  <Select value={delegateUserName} onValueChange={setDelegateUserName}>
                    <SelectTrigger
                      className="h-8 text-xs"
                      data-testid="payables-invoice-delegate-approver"
                    >
                      <SelectValue
                        placeholder={
                          delegateApproversQuery.isLoading
                            ? "Loading approvers…"
                            : "Select Approver"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {delegateApprovers.map((user) => (
                        <SelectItem
                          key={String(user.id)}
                          value={String(user.user_name || user.id)}
                          className="text-xs"
                        >
                          {user.name || user.user_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Label className="text-xs">
                Remarks {commentsRequired ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder={
                  commentsRequired ? "Please provide a reason…" : "Optional remarks…"
                }
                data-testid="payables-invoice-approval-comments"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={selectedAction === "reject" ? "destructive" : "default"}
                  onClick={() => submitSelected(selectedAction, comments, delegateUserName)}
                  disabled={
                    busy ||
                    !taskId ||
                    (commentsRequired && !comments.trim()) ||
                    (isDelegate && !selectedDelegate)
                  }
                  data-testid="payables-invoice-approval-confirm"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    ACTION_SUBMIT_LABELS[selectedAction]
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    resetActionState();
                    onConfirmationStateChange?.(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {showActions && !selectedAction && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {taskQuery.data?.assignee_ ? (
                <p className="text-[11px] text-muted-foreground">
                  Assigned to: {taskQuery.data.assignee_}
                </p>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="ml-auto gap-1"
                    disabled={busy || !taskId}
                    data-testid="payables-invoice-approval-actions"
                  >
                    Approve
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => startAction("approve")}
                    className="text-emerald-600 dark:text-emerald-400"
                    data-testid="payables-invoice-action-approve"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => startAction("reject")}
                    className="text-rose-600 dark:text-rose-400"
                    data-testid="payables-invoice-action-reject"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => startAction("more")}
                    className="text-orange-600 dark:text-orange-400"
                    data-testid="payables-invoice-action-more"
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    Request More Information
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => startAction("delegate")}
                    className="text-blue-600 dark:text-blue-400"
                    data-testid="payables-invoice-action-delegate"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Request for Delegate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {showActions && (
            <>
              {isMoreInfo && (
                <p className="text-[11px] text-amber-700">
                  This invoice is awaiting more information from the requester.
                </p>
              )}
              {!taskId && (
                <p className="text-[11px] text-amber-700">
                  No active workflow task id found for this invoice.
                </p>
              )}
              {selectedAction && taskQuery.data?.assignee_ && (
                <p className="text-[11px] text-muted-foreground">
                  Assigned to: {taskQuery.data.assignee_}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
