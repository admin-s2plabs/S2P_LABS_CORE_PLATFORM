import { useEffect, useState, type ComponentType } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  DollarSign,
  File,
  Loader2,
  Mail,
  Paperclip,
  ThumbsUp,
  User,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, handleDownloadDocument } from "@/lib/common-functions";
import { useQuery } from "@tanstack/react-query";
import type {
  CommercialEvaluationSpec,
  CommercialEvaluationSupplierResponse,
} from "@shared/sourcing-commercial-evaluation";
import type { SourcingChatActionRequest } from "./sourcing-activation-chat-actions";

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

function InfoItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

function isCommercialRequirement(req: { category?: string }) {
  const cat = (req.category || "").toLowerCase();
  return cat === "financial" || cat === "finance" || cat === "commercial";
}

function FinancialBidSection({ lines, resp }: { lines: any[]; resp: any }) {
  const currency = resp?.currency || "AED";
  const totalAmt = resp?.bidtotal ? parseFloat(resp.bidtotal) : 0;
  const totalDisc = resp?.biddisc ? parseFloat(resp.biddisc) : 0;
  const grossTotal = resp?.grosstotal ? parseFloat(resp.grosstotal) : 0;
  const amountInWords = resp?.amount_in_words || "";

  return (
    <div className="pt-2 border-t">
      <SectionTitle icon={DollarSign} title="Financial Bid" />
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">No line items defined.</p>
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Bid Qty</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Disc Unit Price</TableHead>
                  <TableHead className="text-right">Tax Rate</TableHead>
                  <TableHead className="text-right">Tax Amount</TableHead>
                  <TableHead className="w-[60px]">Curr.</TableHead>
                  <TableHead>Promised Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line: any) => (
                  <TableRow key={line.id}>
                    <TableCell className="text-xs py-2">
                      <div className="font-medium">{line.description}</div>
                      {line.product_category && (
                        <div className="text-[10px] text-muted-foreground">{line.product_category}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono py-2">{line.quantity}</TableCell>
                    <TableCell className="text-xs py-2">{line.uom || "-"}</TableCell>
                    <TableCell className="text-xs text-right font-mono py-2">
                      {line.bidprice != null ? formatCurrency(line.bidprice, line.currency || currency) : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono py-2">
                      {line.discprice != null ? formatCurrency(line.discprice, line.currency || currency) : "-"}
                    </TableCell>
                    <TableCell className="text-xs py-2">{line.rate ? `${line.rate}%` : "-"}</TableCell>
                    <TableCell className="text-xs py-2">
                      {line.rate
                        ? formatCurrency(
                            ((line.bidprice * line.quantity) - (line.discprice * line.quantity)) *
                              (line.rate / 100),
                            line.currency || currency,
                          )
                        : "-"}
                    </TableCell>
                    <TableCell className="text-xs py-2">{line.currency || currency}</TableCell>
                    <TableCell className="text-xs py-2">
                      {line.promised_date ? formatDate(line.promised_date) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex flex-col items-end gap-1 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-medium">Total Amount:</span>
              <span className="w-32 text-right font-mono">{formatCurrency(totalAmt, currency)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">Discount:</span>
              <span className="w-32 text-right font-mono">{formatCurrency(totalDisc, currency)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">Tax Amount:</span>
              <span className="w-32 text-right font-mono">
                {formatCurrency(resp?.tax_amount ?? 0, currency)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">Net Total Amount:</span>
              <span className="font-semibold w-32 text-right font-mono">
                {formatCurrency(grossTotal, currency)}
              </span>
            </div>
            {amountInWords && (
              <div className="flex items-center gap-3 mt-1">
                <span className="font-medium">In Words:</span>
                <span className="text-muted-foreground">{amountInWords}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CommercialResponseViewPanel({
  responseId,
  onClose,
}: {
  responseId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{
    response: any;
    requirements: any[];
    lines: any[];
    attachments: any[];
  }>({
    queryKey: ["/api/dbo/bids/response", responseId, "detail"],
    enabled: !!responseId,
  });

  const resp = data?.response;
  const requirements = (data?.requirements || []).filter(isCommercialRequirement);
  const lines = data?.lines || [];
  const finAttachments = (data?.attachments || []).filter(
    (a: any) => a.attach_source === "Financial",
  );

  return (
    <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-3" data-testid="inline-commercial-evaluation-response-view">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Supplier Response — {responseId}
        </p>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
          Close
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading response…
        </div>
      ) : !resp ? (
        <p className="text-xs text-muted-foreground text-center py-4">Response data not available.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {resp.supplier_name || "Supplier"} — {resp.bidtitle || ""}
          </p>
          <div>
            <SectionTitle icon={ClipboardList} title="Financial Criteria" />
            {requirements.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No commercial requirements defined.</p>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Option</TableHead>
                      <TableHead>Supplier Response</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requirements.map((req: any) => (
                      <TableRow key={req.id}>
                        <TableCell className="text-xs py-2">
                          <Badge variant="outline" className="text-[10px]">{req.category}</Badge>
                        </TableCell>
                        <TableCell className="text-xs py-2">{req.question}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{req.qvoption}</TableCell>
                        <TableCell className="text-xs py-2">{req.response || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{req.remarks || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <FinancialBidSection lines={lines} resp={resp} />
          {finAttachments.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium flex items-center gap-1.5 mb-2">
                <Paperclip className="h-3.5 w-3.5" />
                Financial Attachments
              </p>
              <div className="flex flex-wrap gap-2">
                {finAttachments.map((att: any) => (
                  <button
                    key={att.id}
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/60"
                    onClick={() =>
                      handleDownloadDocument(att, `/api/dbo/bids/response/attachments/${att.id}/download`)
                    }
                  >
                    <File className="h-3 w-3 text-muted-foreground" />
                    {att.attach_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CommercialEvaluationCard({
  spec,
  disabled,
  status = "pending",
  onComplete,
  chatActionRequest,
  onChatActionHandled,
  onConfirmationStateChange,
}: {
  spec: CommercialEvaluationSpec;
  disabled?: boolean;
  status?: "pending" | "approved";
  onComplete?: () => void;
  chatActionRequest?: SourcingChatActionRequest | null;
  onChatActionHandled?: () => void;
  onConfirmationStateChange?: (action: "approve_score" | null) => void;
}) {
  const { toast } = useToast();
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const { data: scoreStatus, refetch: refetchScoreStatus } = useQuery<{
    approved: boolean;
    commScoreComplete: boolean;
    userTeams: string[];
  }>({
    queryKey: [`/api/dbo/bids/${spec.bidId}/comm-score-status`],
    enabled: !!spec.bidId,
  });

  const { data: evaluateData } = useQuery<any>({
    queryKey: [`/api/dbo/bids/${spec.bidId}/evaluate`],
    enabled: !!spec.bidId,
  });

  const isRfq = spec.bidType === "RFQ";
  const isTender = spec.bidType === "Tender";
  const approved = status === "approved" || scoreStatus?.approved || spec.scoreApproved;
  const onApproveTeam = scoreStatus?.userTeams?.includes("Commercial Approve Team") ?? spec.canApprove;
  const commScoreComplete = scoreStatus?.commScoreComplete ?? spec.commScoreComplete;
  const canApprove = onApproveTeam && commScoreComplete && !approved;

  const responses: CommercialEvaluationSupplierResponse[] =
    evaluateData?.responses?.map((r: any) => {
      const fromSpec = spec.responses.find((s) => s.responseId === String(r.id));
      return {
        responseId: String(r.id),
        supplierName: r.supplier_name || fromSpec?.supplierName || "Unknown",
        supplierContact: r.supplier_contact || fromSpec?.supplierContact || "-",
        supplierPhone: r.supplier_contact_no || fromSpec?.supplierPhone || "",
        bidTotal: fromSpec?.bidTotal || formatCurrency(r.bidtotal, spec.currency),
        commScore: isRfq ? "-" : String(r.finscore ?? fromSpec?.commScore ?? "NA"),
        version: String(r.version ?? fromSpec?.version ?? 0),
      };
    }) ?? spec.responses;

  const beginApproveConfirm = () => {
    if (!canApprove || disabled || isApproving || approved) return;
    setConfirmApprove(true);
    onConfirmationStateChange?.("approve_score");
  };

  const cancelApproveConfirm = () => {
    setConfirmApprove(false);
    onConfirmationStateChange?.(null);
  };

  const approveScores = async () => {
    if (!canApprove || disabled || isApproving) return;
    setIsApproving(true);
    try {
      const res = await apiRequest("POST", `/api/dbo/bids/${spec.bidId}/approve-comm-score`);
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${spec.bidId}/evaluate`] });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${spec.bidId}/comm-score-status`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });

      if (result.status === "failure") {
        toast({ title: "Approval Failed", description: result.message, variant: "destructive" });
      } else {
        toast({
          title: "Scores Approved",
          description: result.message || "Commercial scores approved successfully.",
        });
        setConfirmApprove(false);
        onConfirmationStateChange?.(null);
        await refetchScoreStatus();
        onComplete?.();
      }
    } catch (error: any) {
      toast({
        title: "Approval Failed",
        description: error?.message || "Could not approve scores.",
        variant: "destructive",
      });
    } finally {
      setIsApproving(false);
      setConfirmApprove(false);
      onConfirmationStateChange?.(null);
    }
  };

  useEffect(() => {
    if (!chatActionRequest || approved || disabled) return;
    if (chatActionRequest.card !== "commercialEvaluation") {
      onChatActionHandled?.();
      return;
    }
    const kind = chatActionRequest.kind || "start";
    if (kind === "cancel") {
      cancelApproveConfirm();
      onChatActionHandled?.();
      return;
    }
    if (!canApprove) {
      toast({
        title: "Cannot approve scores",
        description:
          "Commercial score approval is not available for your role, or scores are not ready yet.",
        variant: "destructive",
      });
      onChatActionHandled?.();
      return;
    }
    if (kind === "start") {
      beginApproveConfirm();
      onChatActionHandled?.();
      return;
    }
    void approveScores();
    onChatActionHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest]);

  return (
    <Card className="border-purple-200 dark:border-purple-900 bg-background mt-2">
      <CardContent className="p-4 space-y-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{spec.bidNumber}</span>
              <Badge variant="outline">{spec.bidType}</Badge>
              <Badge variant="secondary">{spec.status}</Badge>
              {approved && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Scores Approved
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{spec.bidTitle}</p>
            <p className="text-xs text-muted-foreground">{spec.taskTitle}</p>
          </div>
        </div>

        <div>
          <SectionTitle icon={ClipboardList} title="Bid Summary" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <InfoItem label="Bid Name" value={spec.bidTitle} />
            <InfoItem label="Status" value={spec.status} />
            <InfoItem label="Bid Style" value={spec.bidStyle} icon={Calendar} />
            <InfoItem label="Currency" value={spec.currency} icon={DollarSign} />
            <InfoItem label="Start Date" value={spec.startDate} icon={Calendar} />
            <InfoItem label="End Date" value={spec.endDate} icon={Calendar} />
            {isTender && (
              <InfoItem label="Envelope Open Date" value={spec.envelopeOpenDate} icon={Clock} />
            )}
            <InfoItem label="Payment Terms" value={spec.paymentTerms} icon={CreditCard} />
            <InfoItem
              label="Responses / Invited"
              value={`${spec.responsesCount} / ${spec.invitedCount}`}
              icon={Users}
            />
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium">{spec.buyerName}</p>
              {spec.buyerEmail && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {spec.buyerEmail}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Requestor
              </p>
              <p className="text-sm font-medium">{spec.requestorName}</p>
              {spec.requestorEmail && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {spec.requestorEmail}
                </p>
              )}
            </div>
            <InfoItem label="Department" value={spec.departmentName} icon={Building2} />
          </div>
        </div>

        <div>
          <SectionTitle icon={ClipboardList} title="Supplier Responses" />
          {responses.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No supplier responses found yet.
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Response #</TableHead>
                    <TableHead className="text-right">Bid Total</TableHead>
                    <TableHead className="text-center">Commercial Score</TableHead>
                    <TableHead className="text-center">Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {responses.map((r, idx) => (
                    <TableRow key={r.responseId}>
                      <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium">{r.supplierName}</p>
                        <p className="text-muted-foreground">{r.supplierContact}</p>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          disabled={disabled}
                          onClick={() =>
                            setExpandedResponseId((current) =>
                              current === r.responseId ? null : r.responseId,
                            )
                          }
                          data-testid={`commercial-evaluation-link-response-${r.responseId}`}
                        >
                          {r.responseId}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{r.bidTotal}</TableCell>
                      <TableCell className="text-xs text-center font-medium">{r.commScore}</TableCell>
                      <TableCell className="text-xs text-center">{r.version}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {expandedResponseId && (
            <CommercialResponseViewPanel
              responseId={expandedResponseId}
              onClose={() => setExpandedResponseId(null)}
            />
          )}
        </div>

        {canApprove && status === "pending" && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
            {confirmApprove ? (
              <>
                <span className="text-xs text-muted-foreground">Approve all commercial scores?</span>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-[#3b1c71] hover:bg-[#2d1556] text-white"
                  disabled={disabled || isApproving}
                  onClick={approveScores}
                  data-testid="commercial-evaluation-confirm-approve"
                >
                  {isApproving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ThumbsUp className="h-3.5 w-3.5" />
                  )}
                  Yes, Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={isApproving}
                  onClick={cancelApproveConfirm}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-[#3b1c71] hover:bg-[#2d1556] text-white"
                disabled={disabled}
                onClick={beginApproveConfirm}
                data-testid="commercial-evaluation-approve-score"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                Approve Score
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
