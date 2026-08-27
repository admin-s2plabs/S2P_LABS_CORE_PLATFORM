import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  DollarSign,
  File,
  Loader2,
  Mail,
  Paperclip,
  Scale,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AwardingReviewSpec } from "@shared/sourcing-awarding-review";
import type { BidAwardSubmitReviewSpec } from "@shared/sourcing-bid-award-submit-review";
import {
  CompareBidsPanel,
  EvaluationHierarchyCard,
  SupplierResponsesTable,
} from "../bids/bid-evaluate";
import { BidAwardSubmitReviewCard } from "./bid-award-submit-review-card";
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

function statusBadgeClass(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("opened") || lower.includes("scored")) {
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
  if (lower.includes("pending") || lower.includes("closed")) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  }
  return "";
}

function buildSubmitSpecFromAwardData(
  spec: AwardingReviewSpec,
  awardsData: any,
  draftAward: any,
): BidAwardSubmitReviewSpec {
  const currency = spec.currency || awardsData?.bid?.currency || "INR";
  const awardedSupplierId = String(draftAward.supplier_id || "");
  const responses = spec.compareBids.responses || [];
  const otherQuotes = responses
    .filter((resp: any) => String(resp.supplier_id || "") !== awardedSupplierId)
    .map((resp: any) => ({
      responseId: String(resp.id || "-"),
      supplierName: String(resp.supplier_name || "-"),
      bidTotal: formatCurrency(resp.bidtotal, currency),
      discount: formatCurrency(resp.biddisc, currency),
      grossTotal: formatCurrency(resp.grosstotal, currency),
    }));

  const lines = Array.isArray(draftAward.lines) ? draftAward.lines : [];

  return {
    bidId: spec.bidId,
    bidNumber: spec.bidNumber,
    bidTitle: spec.bidTitle,
    bidType: spec.bidType,
    bidStatus: spec.status,
    bidStyle: spec.bidStyle,
    startDate: spec.startDate,
    endDate: spec.endDate,
    currency,
    paymentTerms: spec.paymentTerms,
    deliveryLocation: String(
      awardsData?.bid?.delivertto_location_name || awardsData?.bid?.shiptoaddress || "-",
    ),
    linkedPr: awardsData?.bid?.pr_number ? String(awardsData.bid.pr_number) : undefined,
    buyerName: spec.buyerName,
    buyerEmail: spec.buyerEmail,
    requestorName: spec.requestorName,
    requestorEmail: spec.requestorEmail,
    departmentName: spec.departmentName,
    responsesCount: spec.responsesCount,
    invitedCount: spec.invitedCount,
    totalAwards: Array.isArray(awardsData?.awards) ? awardsData.awards.length : 0,
    awardId: Number(draftAward.id),
    awardStatus: String(draftAward.status || "Draft"),
    supplierName: String(draftAward.supplier_name || "-"),
    supplierContact: String(draftAward.supplier_contact || ""),
    supplierPhone: String(draftAward.supplier_contact_no || ""),
    grossTotal: formatCurrency(draftAward.bidtotal, currency),
    discount: formatCurrency(draftAward.biddisc, currency),
    taxAmount: formatCurrency(draftAward.tax_amount, currency),
    netTotal: formatCurrency(draftAward.grosstotal, currency),
    amountInWords: String(draftAward.amount_in_words || ""),
    awardNotes: String(draftAward.notes || draftAward.award_comments || ""),
    lines: lines.map((line: any) => ({
      item: String(line.description || "-"),
      category: String(line.product_category || "-"),
      bidQty: String(line.quantity ?? "-"),
      awardedQty: String(line.awarded_quantity ?? line.quantity ?? "-"),
      unitPrice: formatCurrency(line.bidprice, line.currency || currency),
      discPrice: formatCurrency(line.discprice, line.currency || currency),
      tax: String(line.rate ?? 0),
    })),
    otherQuotes,
    canSubmit: String(draftAward.status || "Draft") === "Draft",
    taskTitle: "Submit Award for Approval",
  };
}

function AwardingResponseViewPanel({
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
  const requirements = data?.requirements || [];
  const lines = data?.lines || [];
  const allAttachments = data?.attachments || [];
  const currency = resp?.currency || "AED";

  const totalAmt = resp?.bidtotal ? parseFloat(resp.bidtotal) : 0;
  const totalDisc = resp?.biddisc ? parseFloat(resp.biddisc) : 0;
  const grossTotal = resp?.grosstotal ? parseFloat(resp.grosstotal) : 0;
  const amountInWords = resp?.amount_in_words || "";

  const techAttachments = allAttachments.filter(
    (a: any) => a.attach_source === "Technical" || !a.attach_source,
  );
  const finAttachments = allAttachments.filter((a: any) => a.attach_source === "Financial");

  return (
    <div
      className="mt-3 rounded-md border bg-muted/20 p-3 space-y-3"
      data-testid="inline-awarding-response-view"
    >
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
            <SectionTitle icon={ClipboardList} title="Technical Bid" />
            {requirements.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No requirements defined.</p>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Option</TableHead>
                      <TableHead>Response</TableHead>
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

            {techAttachments.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs font-medium flex items-center gap-1.5 mb-2">
                  <Paperclip className="h-3.5 w-3.5" />
                  Technical Attachments
                </p>
                <div className="flex flex-wrap gap-2">
                  {techAttachments.map((att: any) => (
                    <a
                      key={att.id}
                      href={att.attach_path ? `/api/dbo/bids/response/attachments/${att.id}/download` : undefined}
                      download
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/60"
                    >
                      <File className="h-3 w-3 text-muted-foreground" />
                      {att.attach_name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <SectionTitle icon={DollarSign} title="Financial Bid" />
            {lines.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No line items defined.</p>
            ) : (
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
                      <TableHead>Curr.</TableHead>
                      <TableHead>Promised Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line: any) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-xs py-2">
                          <div className="font-medium">{line.description}</div>
                          {line.product_category && (
                            <div className="text-muted-foreground">{line.product_category}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono py-2">{line.quantity}</TableCell>
                        <TableCell className="text-xs py-2">{line.uom || "-"}</TableCell>
                        <TableCell className="text-xs text-right font-mono py-2">
                          {line.bidprice != null
                            ? formatCurrency(line.bidprice, line.currency || currency)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono py-2">
                          {line.discprice != null
                            ? formatCurrency(line.discprice, line.currency || currency)
                            : "-"}
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
            )}

            <div className="mt-2 flex flex-col items-end gap-0.5 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-medium">Total Amount:</span>
                <span className="w-28 text-right font-mono">{formatCurrency(totalAmt, currency)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">Discount:</span>
                <span className="w-28 text-right font-mono">{formatCurrency(totalDisc, currency)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">Tax Amount:</span>
                <span className="w-28 text-right font-mono">
                  {formatCurrency(resp?.tax_amount ?? 0, currency)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">Net Total Amount:</span>
                <span className="font-semibold w-28 text-right font-mono">
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

            {resp.amtcomments && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Comments</p>
                <p className="text-xs bg-muted/50 rounded-md p-2">{resp.amtcomments}</p>
              </div>
            )}

            {finAttachments.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs font-medium flex items-center gap-1.5 mb-2">
                  <Paperclip className="h-3.5 w-3.5" />
                  Financial Attachments
                </p>
                <div className="flex flex-wrap gap-2">
                  {finAttachments.map((att: any) => (
                    <a
                      key={att.id}
                      href={att.attach_path ? `/api/dbo/bids/response/attachments/${att.id}/download` : undefined}
                      download
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/60"
                    >
                      <File className="h-3 w-3 text-muted-foreground" />
                      {att.attach_name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AgentEvaluationTeamFallback({
  spec,
}: {
  spec: AwardingReviewSpec;
}) {
  const buyerInitials = (spec.buyerName || "B").substring(0, 2).toUpperCase();

  return (
    <Card data-testid="agent-evaluation-team-fallback">
      <CardHeader className="py-2 px-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground font-medium">Evaluation Team</p>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="flex gap-2 items-stretch overflow-x-auto min-w-0 pb-1">
          <div className="border rounded-md p-2.5 flex flex-col items-center justify-center shrink-0 w-[120px]">
            <Avatar className="h-7 w-7 mb-1">
              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                {buyerInitials}
              </AvatarFallback>
            </Avatar>
            <p className="text-sm font-semibold text-center truncate w-full">{spec.buyerName}</p>
            <p className="text-[10px] text-muted-foreground text-center">Buyer</p>
          </div>

          {spec.evaluationTeam.map((member, idx) => (
            <div key={`${member.name}-${member.role}-${idx}`} className="flex items-center shrink-0">
              <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
              <div className="border rounded-md p-2.5 flex flex-col items-center justify-center w-[140px]">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                  {member.role}
                </p>
                <Avatar className="h-7 w-7 mb-1">
                  <AvatarFallback className="text-[10px]">
                    {(member.name || "?").substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="text-xs font-semibold text-center truncate w-full">{member.name}</p>
                <Badge variant="secondary" className={`mt-1 text-[10px] ${statusBadgeClass(member.status)}`}>
                  {member.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AwardingReviewCard({
  spec,
  disabled,
  status = "pending",
  submitStatus = "pending",
  onComplete,
  onSubmitComplete,
  onEvaluationSaved,
  chatActionRequest,
  onChatActionHandled,
  onConfirmationStateChange,
}: {
  spec: AwardingReviewSpec;
  disabled?: boolean;
  status?: "pending" | "awarded";
  submitStatus?: "pending" | "submitted";
  onComplete?: (details?: { supplierName?: string; comments?: string }) => void;
  onSubmitComplete?: (details?: { notes?: string }) => void;
  onEvaluationSaved?: () => void;
  chatActionRequest?: SourcingChatActionRequest | null;
  onChatActionHandled?: () => void;
  onConfirmationStateChange?: (action: "award" | "submit" | null) => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("responses");
  const [showCompare, setShowCompare] = useState(false);
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  const isTender = spec.bidType === "TENDER" || spec.bidType === "Tender";
  const awarded = status === "awarded";
  const compare = spec.compareBids;

  const { data: evalData } = useQuery<any>({
    queryKey: [`/api/dbo/bids/${spec.bidId}/evaluate`],
    enabled: !!spec.bidId,
  });

  const { data: approvers } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", spec.bidId, "approvers"],
    enabled: !!spec.bidId,
  });

  const { data: awardsData, refetch: refetchAwards } = useQuery<any>({
    queryKey: [`/api/dbo/bids/${spec.bidId}/awards`],
    enabled: !!spec.bidId,
  });

  const noopEnvelopeMutation = useMutation({
    mutationFn: async () => ({}),
  });

  let currentUser: any = {};
  try {
    const authData = JSON.parse(localStorage.getItem("prokraya-auth") || "{}");
    currentUser = authData?.state?.user || authData?.user || authData || {};
  } catch {
    currentUser = {};
  }

  const draftAward = useMemo(() => {
    const awards = awardsData?.awards;
    if (!Array.isArray(awards)) return null;
    return awards.find((entry: any) => String(entry.status || "Draft") === "Draft") || null;
  }, [awardsData]);

  const submitSpec = useMemo(() => {
    if (!draftAward || !awardsData) return null;
    return buildSubmitSpecFromAwardData(spec, awardsData, draftAward);
  }, [draftAward, awardsData, spec]);

  useEffect(() => {
    if (awarded && draftAward) {
      setActiveTab("awards");
    }
  }, [awarded, draftAward?.id]);

  const handleAwardComplete = async (details?: {
    supplierName?: string;
    comments?: string;
  }) => {
    setShowCompare(false);
    await queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${spec.bidId}/awards`] });
    await queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${spec.bidId}/evaluate`] });
    await refetchAwards();
    setActiveTab("awards");
    onConfirmationStateChange?.(null);
    onComplete?.(details);
  };

  useEffect(() => {
    if (!chatActionRequest || disabled) return;
    const card = chatActionRequest.card;
    if (card !== "awarding" && card !== "bidAwardSubmit") {
      onChatActionHandled?.();
      return;
    }

    // Submit-for-approval is handled by the embedded submit card.
    if (card === "bidAwardSubmit" || chatActionRequest.action === "submit") {
      setActiveTab("awards");
      if (!submitSpec) {
        toast({
          title: "No draft award",
          description: "Award a supplier first, then submit for approval.",
          variant: "destructive",
        });
        onChatActionHandled?.();
        return;
      }
      // Let the embedded BidAwardSubmitReviewCard consume the same request.
      onConfirmationStateChange?.(chatActionRequest.kind === "cancel" ? null : "submit");
      // Don't clear yet — embedded card needs the request. Parent clears via that card's handler.
      return;
    }

    if (awarded) {
      onChatActionHandled?.();
      return;
    }

    const kind = chatActionRequest.kind || "start";
    if (kind === "cancel") {
      setShowCompare(false);
      onConfirmationStateChange?.(null);
      onChatActionHandled?.();
      return;
    }

    setActiveTab("responses");
    setShowCompare(true);
    if (chatActionRequest.supplierId) {
      setSelectedResponseId(chatActionRequest.supplierId);
    }
    if (chatActionRequest.action === "award") {
      onConfirmationStateChange?.("award");
    }
    // CompareBidsPanel consumes the request after it becomes visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest]);

  const bidForHierarchy = evalData?.bid || compare.bid;
  const bidType = bidForHierarchy?.type || spec.bidType;

  return (
    <Card className="border-purple-200 dark:border-purple-900 bg-background mt-2">
      <CardContent className="p-4 space-y-4 text-sm">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Trophy className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="font-semibold">{spec.bidNumber}</span>
            <Badge variant="outline">{spec.bidType}</Badge>
            <Badge variant="secondary">{spec.status}</Badge>
            {awarded && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Awarded
              </Badge>
            )}
            {submitStatus === "submitted" && (
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Submitted for Approval
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{spec.bidTitle}</p>
          <p className="text-xs text-muted-foreground">{spec.taskTitle}</p>
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList data-testid="tabs-agent-awarding">
            <TabsTrigger value="responses" data-testid="tab-agent-awarding-responses">
              Responses
            </TabsTrigger>
            <TabsTrigger value="awards" data-testid="tab-agent-awarding-awards">
              Awards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="responses" className="mt-3 space-y-3">
            {approvers && bidForHierarchy ? (
              <EvaluationHierarchyCard
                approvers={approvers}
                bid={bidForHierarchy}
                bidType={bidType}
                openEnvelopeMutation={noopEnvelopeMutation}
                currentUser={currentUser}
              />
            ) : (
              <AgentEvaluationTeamFallback spec={spec} />
            )}

            <Card>
              <CardHeader className="py-3 px-4">
                <p className="text-sm text-muted-foreground">
                  List of Supplier Responses related to this Bid.
                </p>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-3">
                <SupplierResponsesTable
                  responses={compare.responses}
                  bid={compare.bid}
                  onViewResponse={(id) =>
                    setSelectedResponseId((current) => (current === id ? null : id))
                  }
                />
                {selectedResponseId && (
                  <AwardingResponseViewPanel
                    responseId={selectedResponseId}
                    onClose={() => setSelectedResponseId(null)}
                  />
                )}
                {spec.canAward && !awarded && (
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
                    <Button
                      type="button"
                      size="sm"
                      variant={showCompare ? "default" : "outline"}
                      className="h-8 gap-1.5 shrink-0"
                      disabled={disabled}
                      onClick={() => setShowCompare((open) => !open)}
                      data-testid="awarding-review-compare-bids"
                    >
                      <Scale className="h-3.5 w-3.5" />
                      {showCompare ? "Hide Compare" : "Compare Bids"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {showCompare && spec.canAward && !awarded && (
              <div
                className="border rounded-md p-3 bg-muted/10"
                data-testid="awarding-review-compare-panel"
              >
                <CompareBidsPanel
                  bid={compare.bid}
                  responses={compare.responses}
                  lines={compare.lines}
                  requirements={compare.requirements}
                  scores={compare.scores}
                  currentStep={compare.currentStep || ""}
                  embedded
                  active={showCompare}
                  awardActionsAllowed={spec.canAward}
                  onClose={() => setShowCompare(false)}
                  onAwardComplete={handleAwardComplete}
                  onSaveEvaluationComplete={onEvaluationSaved}
                  externalAwardRequest={
                    chatActionRequest?.card === "awarding" &&
                    (chatActionRequest.action === "award" ||
                      chatActionRequest.action === "save_evaluation")
                      ? {
                          nonce: chatActionRequest.nonce,
                          kind: chatActionRequest.kind,
                          action: chatActionRequest.action,
                          supplierId: chatActionRequest.supplierId,
                          comments: chatActionRequest.comments,
                        }
                      : null
                  }
                  onExternalAwardHandled={onChatActionHandled}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="awards" className="mt-3 space-y-3">
            {submitSpec && submitStatus !== "submitted" ? (
              <BidAwardSubmitReviewCard
                spec={submitSpec}
                disabled={disabled}
                status={submitStatus}
                embedded
                chatActionRequest={
                  chatActionRequest?.card === "bidAwardSubmit" ||
                  chatActionRequest?.action === "submit"
                    ? chatActionRequest
                    : null
                }
                onChatActionHandled={onChatActionHandled}
                onConfirmationStateChange={(action) => onConfirmationStateChange?.(action)}
                onComplete={(details) => {
                  onSubmitComplete?.(details);
                }}
              />
            ) : submitStatus === "submitted" && submitSpec ? (
              <BidAwardSubmitReviewCard
                spec={{ ...submitSpec, canSubmit: false, awardStatus: "Pending Approval" }}
                disabled
                status="submitted"
                embedded
              />
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Scale className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No Draft Awards</p>
                  <p className="text-sm mt-1">
                    {spec.canAward
                      ? "Compare bids on the Responses tab and award a supplier to continue."
                      : "Award recommendations will appear here once created."}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
