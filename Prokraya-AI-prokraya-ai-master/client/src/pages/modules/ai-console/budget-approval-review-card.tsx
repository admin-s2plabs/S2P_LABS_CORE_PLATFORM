import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FileDown,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  MessageSquarePlus,
  Upload,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { generateTablePdf } from "@/lib/generate-table-pdf";
import type { BudgetApprovalReviewSpec } from "@shared/procurement-activation-signals";
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

function getBudgetAmountBreakdown(fields: {
  totalAmount: string | null | undefined;
  consumed_amount: string | null | undefined;
  reserved_amount: string | null | undefined;
}) {
  const consumed = parseFloat(String(fields.consumed_amount || "0")) || 0;
  const reserved = parseFloat(String(fields.reserved_amount || "0")) || 0;
  const total = parseFloat(String(fields.totalAmount || "0")) || 0;
  const available = Math.max(0, total - consumed - reserved);
  return { consumed, reserved, available, total };
}

function getBudgetLineAmountBreakdown(line: {
  amount?: string | null;
  consumed_amount?: string | null;
  reserved_amount?: string | null;
}) {
  const consumed = parseFloat(String(line.consumed_amount || "0")) || 0;
  const reserved = parseFloat(String(line.reserved_amount || "0")) || 0;
  const total = parseFloat(String(line.amount || "0")) || 0;
  const available = Math.max(0, total - consumed - reserved);
  return { consumed, reserved, available, total };
}

function UtilizationBar({ consumed, total }: { consumed: number; total: number }) {
  const percentage = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;
  const color = percentage >= 90 ? "bg-red-500" : percentage >= 75 ? "bg-orange-500" : "bg-emerald-500";
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Utilization</span>
        <span className="font-medium">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
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

function toExportAmount(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined || value === "") return "";
  const n = parseFloat(String(value));
  return Number.isNaN(n) ? String(value) : n;
}

function buildSummaryRow(header: any) {
  const { available } = getBudgetAmountBreakdown({
    totalAmount: header.budget_amount,
    consumed_amount: header.consumed_amount,
    reserved_amount: header.reserved_amount,
  });
  return {
    "Budget ID": header.budget_id || String(header.id || ""),
    "Budget Name": header.budget_name || "",
    Status: header.status || "",
    Owner: header.budget_owner_name || "",
    "Business Entity": header.business_entity_name || "",
    "Total Budget": toExportAmount(header.budget_amount),
    Currency: header.budget_curr || "",
    Consumed: toExportAmount(header.consumed_amount),
    Reserved: toExportAmount(header.reserved_amount),
    Available: toExportAmount(available),
    "Start Date": formatDate(header.start_date) !== "-" ? formatDate(header.start_date) : "",
    "End Date": formatDate(header.end_date) !== "-" ? formatDate(header.end_date) : "",
    Period: header.period_name || "",
    "Created By": header.created_by || "",
  };
}

function buildLineRowsFlat(
  header: any,
  lines: any[],
  departmentMappings: any[],
  locationMappings: any[],
) {
  const summary = buildSummaryRow(header);
  if (!lines.length) {
    return [
      {
        ...summary,
        "Line ID": "",
        "Cost Center Code": "",
        "Cost Center Name": "",
        "Line Total Budget": "",
        "Line Description": "",
        "Line Consumed": "",
        "Line Reserved": "",
        "Line Available": "",
        Locations: "",
        Departments: "",
      },
    ];
  }
  return lines.map((line) => {
    const { total, consumed, reserved, available } = getBudgetLineAmountBreakdown(line);
    const locs = locationMappings
      .filter((m) => Number(m.budget_line_id) === Number(line.id))
      .map((m) => m.loc_name)
      .filter(Boolean);
    const depts = departmentMappings
      .filter((m) => Number(m.budget_line_id) === Number(line.id))
      .map((m) => m.dept_name)
      .filter(Boolean);
    return {
      ...summary,
      "Line ID": String(line.id),
      "Cost Center Code": line.segment_dtl_code || "",
      "Cost Center Name": line.segment_dtl_name || "",
      "Line Total Budget": toExportAmount(total),
      "Line Description": line.description || "",
      "Line Consumed": toExportAmount(consumed),
      "Line Reserved": toExportAmount(reserved),
      "Line Available": toExportAmount(available),
      Locations: Array.from(new Set(locs)).sort().join(", "),
      Departments: Array.from(new Set(depts)).sort().join(", "),
    };
  });
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
  if (header.status && pendingStatuses.includes(header.status)) {
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

export function BudgetApprovalReviewCard({
  spec,
  status,
  disabled,
  onComplete,
  chatActionRequest,
  onChatActionHandled,
  onChatActionFailed,
  onConfirmationStateChange,
}: {
  spec: BudgetApprovalReviewSpec;
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
    queryKey: ["/api/budgets", spec.budgetId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/budgets/${spec.budgetId}`);
      return parseJsonResponse<any>(res);
    },
  });

  const taskQuery = useQuery({
    queryKey: ["/api/workflow-engine/task", spec.taskId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/workflow-engine/task/${spec.taskId}`);
      return parseJsonResponse<any>(res);
    },
    enabled: !!spec.taskId,
  });

  const header = detailQuery.data?.header || {};
  const lines: any[] = detailQuery.data?.lines || [];
  const approvalHistory = detailQuery.data?.approvalHistory || [];
  const departmentMappings: any[] = detailQuery.data?.departmentMappings || [];
  const locationMappings: any[] = detailQuery.data?.locationMappings || [];
  const entityStatus = String(header.status || "").toLowerCase();
  const isMoreInfo = entityStatus.includes("more info");
  const taskId = spec.taskId || header.attribute_12;

  const {
    consumed: consumedAmount,
    reserved: reservedAmount,
    available: availableAmount,
    total: budgetAmount,
  } = getBudgetAmountBreakdown({
    totalAmount: header.budget_amount,
    consumed_amount: header.consumed_amount,
    reserved_amount: header.reserved_amount,
  });

  const timelineItems = useMemo(
    () => mapApprovalHistoryForTimeline(approvalHistory, header),
    [approvalHistory, header],
  );

  const exportFileSlug = `budget_${header.budget_id || header.id || spec.budgetId}_${new Date().toISOString().split("T")[0]}`;

  const exportDetailToCSV = () => {
    const summaryRows = [buildSummaryRow(header)];
    const lineRows = buildLineRowsFlat(header, lines, departmentMappings, locationMappings);
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const block = (rows: Record<string, any>[]) => {
      if (rows.length === 0) return "";
      const headers = Object.keys(rows[0]);
      return [
        headers.join(","),
        ...rows.map((row) => headers.map((h) => esc(String(row[h] ?? ""))).join(",")),
      ].join("\n");
    };
    const csv = [block(summaryRows), "", "Budget line items", block(lineRows)].filter(Boolean).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported to CSV" });
  };

  const exportDetailToExcel = () => {
    const summaryRows = [buildSummaryRow(header)];
    const lineRows = buildLineRowsFlat(header, lines, departmentMappings, locationMappings);
    const wb = XLSX.utils.book_new();
    const totalsSheet = [
      { Metric: "Total Budget", Value: toExportAmount(budgetAmount) },
      { Metric: "Currency", Value: header.budget_curr || "" },
      { Metric: "Consumed", Value: toExportAmount(consumedAmount) },
      { Metric: "Reserved", Value: toExportAmount(reservedAmount) },
      { Metric: "Available", Value: toExportAmount(availableAmount) },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalsSheet), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Budgets");
    if (lineRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRows), "Budget lines");
    }
    XLSX.writeFile(wb, `${exportFileSlug}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportDetailToPDF = () => {
    const data = [buildSummaryRow(header)];
    const columns = Object.keys(data[0]);
    const rows = data.map((row) => columns.map((col) => String((row as any)[col] ?? "")));
    generateTablePdf({
      title: "Budget",
      subtitle: [header.budget_name || undefined, `Total Budget: ${formatCurrency(String(budgetAmount), header.budget_curr)}`]
        .filter(Boolean)
        .join(" | "),
      columns,
      rows,
      filename: exportFileSlug,
    });
    toast({ title: "Exported to PDF" });
  };

  const mutation = useMutation({
    mutationFn: async ({ action, remarks }: { action: ApprovalAction; remarks: string }) => {
      if (!taskId) throw new Error("Missing workflow task id");
      return apiRequest("POST", `/api/budgets/${spec.budgetId}/process-approval`, {
        taskId,
        result: action,
        comments: remarks,
      });
    },
    onSuccess: (_data, vars) => {
      const next = actionToStatus(vars.action);
      toast({ title: "Budget updated", description: `Action ${vars.action} completed.` });
      queryClient.invalidateQueries({ queryKey: PROCUREMENT_ACTIVATION_SIGNALS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets", spec.budgetId] });
      chatConfirmRef.current = false;
      setSelectedAction(null);
      setComments("");
      onConfirmationStateChange?.(null);
      onComplete(next);
    },
    onError: (err: any) => {
      const message = err?.message || "Could not process budget approval";
      toast({ title: "Approval failed", description: message, variant: "destructive" });
      if (chatConfirmRef.current) {
        chatConfirmRef.current = false;
        onChatActionFailed?.(message);
      }
    },
  });

  const startAction = async (action: ApprovalAction) => {
    if (action === "Approve") {
      const available = await resolveApprovalChecklistAvailability("Budget");
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
    if (!remarks.trim()) {
      toast({
        title: "Comments required",
        description: "Please enter comments for this action.",
        variant: "destructive",
      });
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
  const detailReady = !detailQuery.isLoading && !detailQuery.isError && !!header;

  return (
    <Card className="mt-3 border-blue-200/70 dark:border-blue-900/50" data-testid="budget-approval-review-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{header.budget_name || spec.title}</div>
            <div className="text-xs text-muted-foreground">{header.budget_id || spec.budgetId}</div>
          </div>
          <StatusPill
            status={done ? status.replace("_", " ") : header.status || "Pending Approval"}
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
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading budget details…
          </div>
        ) : detailQuery.isError ? (
          <p className="text-xs text-rose-600">Failed to load budget details.</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-md border bg-background/60">
              <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
                <div className="p-3">
                  <h4 className="mb-1.5 text-xs font-semibold">Budget Overview</h4>
                  <LabelValue
                    label="Total Budget"
                    value={formatCurrency(String(budgetAmount), header.budget_curr)}
                    valueClassName="text-primary"
                  />
                  <LabelValue label="Currency" value={header.budget_curr} />
                  <LabelValue
                    label="Consumed"
                    value={formatCurrency(header.consumed_amount, header.budget_curr)}
                    valueClassName="text-orange-600"
                  />
                  <LabelValue
                    label="Reserved"
                    value={formatCurrency(header.reserved_amount, header.budget_curr)}
                    valueClassName="text-amber-600"
                  />
                  <LabelValue
                    label="Available"
                    value={formatCurrency(String(availableAmount), header.budget_curr)}
                    valueClassName="text-emerald-600"
                  />
                  <div className="mt-2">
                    <UtilizationBar consumed={consumedAmount} total={budgetAmount} />
                  </div>
                </div>

                <div className="p-3">
                  <h4 className="mb-1.5 text-xs font-semibold">Budget Details</h4>
                  <LabelValue label="Owner" value={header.budget_owner_name} />
                  <LabelValue label="Business Entity" value={header.business_entity_name} />
                  <LabelValue label="Start Date" value={formatDate(header.start_date)} />
                  <LabelValue label="End Date" value={formatDate(header.end_date)} />
                  <LabelValue label="Period" value={header.period_name} />
                  <LabelValue label="Created By" value={header.created_by} />
                </div>
              </div>
            </div>

            {entityStatus !== "draft" && timelineItems.length > 0 && (
              <Section title="Approval History">
                <ApprovalTimeline history={timelineItems} />
              </Section>
            )}

            <Section title={`Budget Line Items (${lines.length})`}>
              <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                <span className="text-[10px]">Cost centres, departments, locations, and RA / CA / AA</span>
              </div>
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">No line items on this budget.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-muted/40">
                        <TableHead className="text-xs font-medium">Cost Centre</TableHead>
                        <TableHead className="text-xs font-medium">Description</TableHead>
                        <TableHead className="text-xs font-medium">Department</TableHead>
                        <TableHead className="text-xs font-medium">Location</TableHead>
                        <TableHead className="text-xs font-medium">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => {
                        const { consumed, reserved, available, total: amount } =
                          getBudgetLineAmountBreakdown(line);
                        const lineLocations = locationMappings.filter(
                          (m) => Number(m.budget_line_id) === Number(line.id),
                        );
                        const lineDepartments = departmentMappings.filter(
                          (m) => Number(m.budget_line_id) === Number(line.id),
                        );
                        const locationDisplay = lineLocations.map((l) => l.loc_name).join(", ");
                        const departmentDisplay = lineDepartments.map((d) => d.dept_name).join(", ");

                        return (
                          <TableRow key={line.id} className="align-top">
                            <TableCell className="py-2 text-xs">
                              <div className="font-medium">{line.segment_dtl_name || "—"}</div>
                              {line.segment_dtl_code && (
                                <div className="text-[10px] text-muted-foreground">{line.segment_dtl_code}</div>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[160px] py-2 text-xs">
                              {line.description ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate cursor-default">{line.description}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="max-w-xs">{line.description}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[140px] py-2 text-xs">
                              {departmentDisplay ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate cursor-default">{departmentDisplay}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="max-w-xs">{departmentDisplay}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="max-w-[140px] py-2 text-xs">
                              {locationDisplay ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate cursor-default">{locationDisplay}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="max-w-xs">{locationDisplay}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-xs">
                              <div className="space-y-0.5">
                                <div className="font-semibold">
                                  {formatCurrency(String(amount), header.budget_curr)}
                                </div>
                                <div>
                                  <span className="text-blue-600">RA:</span>{" "}
                                  {formatCurrency(String(reserved), header.budget_curr)}
                                </div>
                                <div>
                                  <span className="text-orange-600">CA:</span>{" "}
                                  {formatCurrency(String(consumed), header.budget_curr)}
                                </div>
                                <div>
                                  <span className="text-amber-600">AA:</span>{" "}
                                  {formatCurrency(String(available), header.budget_curr)}
                                </div>
                              </div>
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
              <Label className="text-xs">Comments (required)</Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="Enter comments…"
                data-testid="budget-approval-comments"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => submitSelected(comments)}
                  disabled={mutation.isPending || !comments.trim()}
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

            {detailReady && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-export-budget-agent">
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={exportDetailToCSV}
                    data-testid="menu-item-export-csv-agent"
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportDetailToExcel}
                    data-testid="menu-item-export-excel-agent"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportDetailToPDF}
                    data-testid="menu-item-export-pdf-agent"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {!done && !disabled && (
            <>
              {!taskId && (
                <p className="text-[11px] text-amber-700">
                  No active workflow task id found for this budget.
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
          moduleName="Budget"
          title={header.budget_name || spec.title}
          refNumber={header.budget_id || spec.budgetId}
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
