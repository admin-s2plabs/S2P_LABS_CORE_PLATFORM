import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Gavel,
  Loader2,
  Mail,
  MapPin,
  Package,
  Send,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import type { BidAwardSubmitReviewSpec } from "@shared/sourcing-bid-award-submit-review";
import type { SourcingChatActionRequest } from "./sourcing-activation-chat-actions";

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
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value || "-"}</p>
      {subValue ? (
        <p className="text-xs text-muted-foreground italic mt-0.5">{subValue}</p>
      ) : null}
    </div>
  );
}

export function BidAwardSubmitReviewCard({
  spec,
  disabled,
  status = "pending",
  onComplete,
  embedded = false,
  chatActionRequest,
  onChatActionHandled,
  onConfirmationStateChange,
}: {
  spec: BidAwardSubmitReviewSpec;
  disabled?: boolean;
  status?: "pending" | "submitted";
  onComplete?: (details?: { notes?: string }) => void;
  embedded?: boolean;
  chatActionRequest?: SourcingChatActionRequest | null;
  onChatActionHandled?: () => void;
  onConfirmationStateChange?: (action: "submit" | null) => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [awardNotes, setAwardNotes] = useState(spec.awardNotes || "");
  const submitted = status === "submitted";
  const typeConfig =
    bidTypeLabels[spec.bidType] ||
    bidTypeLabels[spec.bidType === "TENDER" ? "Tender" : spec.bidType] ||
    bidTypeLabels.RFQ;

  const handleSubmit = async (overrideNotes?: string) => {
    if (disabled || isSubmitting || submitted || !spec.canSubmit) return;
    const notes = (overrideNotes ?? awardNotes).trim();
    if (!notes) {
      toast({
        title: "Notes required",
        description: "Please add award notes before submitting for approval.",
        variant: "destructive",
      });
      onConfirmationStateChange?.("submit");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/dbo/bids/awards/${spec.awardId}/submit`, {
        awardNotes: notes,
      });
      await res.json();
      toast({
        title: "Award submitted for approval",
        description: `Award #${spec.awardId} for ${spec.bidNumber} has been submitted.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${spec.bidId}/awards`] });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${spec.bidId}/evaluate`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      onConfirmationStateChange?.(null);
      onComplete?.({ notes });
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: error?.message || "Could not submit the award for approval.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!chatActionRequest || submitted || disabled) return;
    if (chatActionRequest.card !== "bidAwardSubmit") {
      onChatActionHandled?.();
      return;
    }
    const kind = chatActionRequest.kind || "confirm";
    if (kind === "cancel") {
      onConfirmationStateChange?.(null);
      onChatActionHandled?.();
      return;
    }
    if (chatActionRequest.comments?.trim()) {
      setAwardNotes(chatActionRequest.comments);
    }
    if (kind === "start") {
      onConfirmationStateChange?.("submit");
      onChatActionHandled?.();
      return;
    }
    // Prefer chat notes; fall back to the card textarea (button path).
    void handleSubmit(
      chatActionRequest.comments?.trim() ? chatActionRequest.comments : undefined,
    );
    onChatActionHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest]);

  return (
    <Card
      className={
        embedded
          ? "border-0 shadow-none bg-transparent"
          : "border-amber-200 dark:border-amber-900 bg-background mt-2"
      }
    >
      <CardContent className={embedded ? "p-0 space-y-4 text-sm" : "p-4 space-y-4 text-sm"}>
        {!embedded && (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Gavel className="h-4 w-4 text-primary" />
              <span className="font-semibold">{spec.bidNumber}</span>
              <Badge variant="outline" className={`border-0 ${typeConfig.className}`}>
                {typeConfig.full}
              </Badge>
              {submitted && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Submitted
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{spec.bidTitle}</p>
          </div>
        )}

        <div className="rounded-md border bg-muted/20 p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HeaderInfoItem label="Start Date" value={spec.startDate} />
            <HeaderInfoItem label="End Date" value={spec.endDate} />
            <HeaderInfoItem label="Currency" value={spec.currency} />
            <HeaderInfoItem label="Bid Style" value={spec.bidStyle} />
            <HeaderInfoItem label="Payment Terms" value={spec.paymentTerms} />
            <HeaderInfoItem label="Delivery Location" value={spec.deliveryLocation} />
            {spec.linkedPr ? <HeaderInfoItem label="Linked PR" value={spec.linkedPr} /> : null}
            <HeaderInfoItem label="Total Awards" value={String(spec.totalAwards)} />
            <HeaderInfoItem
              label="Responses / Invited"
              value={`${spec.responsesCount} / ${spec.invitedCount}`}
            />
          </div>
          <Separator />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium">{spec.buyerName}</p>
              {spec.buyerEmail ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />
                  {spec.buyerEmail}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Requestor
              </p>
              <p className="text-sm font-medium">{spec.requestorName}</p>
              {spec.requestorEmail ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />
                  {spec.requestorEmail}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Department
              </p>
              <p className="text-sm font-medium">{spec.departmentName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Delivery
              </p>
              <p className="text-sm font-medium">{spec.deliveryLocation}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-3">
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Gavel className="h-4 w-4 text-primary" />
                  Award #{spec.awardId}
                </span>
                <Badge variant="secondary" className="text-xs">
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

              {spec.lines.length > 0 && (
                <div>
                  <p className="text-xs font-semibold flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-primary" />
                    Quote Details ({spec.lines.length})
                  </p>
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

            {spec.canSubmit && !submitted && (
              <div className="rounded-md border p-3 space-y-2">
                <Label htmlFor={`award-notes-${spec.awardId}`} className="text-xs font-medium">
                  Award Notes <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id={`award-notes-${spec.awardId}`}
                  placeholder="Enter award notes or justification..."
                  value={awardNotes}
                  onChange={(e) => setAwardNotes(e.target.value)}
                  className="min-h-[80px] text-xs"
                  disabled={disabled || isSubmitting}
                  data-testid="bid-award-submit-notes"
                />
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <h3 className="text-sm font-semibold mb-3">Other Supplier Quotes</h3>
            <div className="space-y-3">
              {spec.otherQuotes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other quotes available.</p>
              ) : (
                spec.otherQuotes.map((quote) => (
                  <Card key={quote.responseId} data-testid={`other-quote-${quote.responseId}`}>
                    <CardContent className="p-3 space-y-1.5">
                      <p className="text-sm font-semibold text-primary">{quote.supplierName}</p>
                      <p className="text-xs text-muted-foreground">
                        Bid Resp: <span className="font-medium text-foreground">{quote.responseId}</span>
                      </p>
                      <div className="space-y-0.5 pt-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bid Total:</span>
                          <span className="font-medium">{quote.bidTotal}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Discount:</span>
                          <span>{quote.discount}</span>
                        </div>
                        {quote.taxAmount && parseFloat(String(quote.taxAmount).replace(/[^0-9.-]/g, "")) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tax Amount:</span>
                            <span className="font-medium">{quote.taxAmount}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-medium text-green-600 dark:text-green-400">
                          <span>Gross Total:</span>
                          <span>{quote.grossTotal}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>

        {spec.canSubmit && !submitted && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-[#3b1c71] hover:bg-[#2d1556] text-white"
              disabled={disabled || isSubmitting || !awardNotes.trim()}
              onClick={() => void handleSubmit()}
              data-testid={
                embedded ? "bid-award-submit-for-approval-embedded" : "bid-award-submit-for-approval"
              }
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Submit for Approval
            </Button>
          </div>
        )}

        {submitted && (
          <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1 pt-2 border-t">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Award submitted for approval successfully.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
