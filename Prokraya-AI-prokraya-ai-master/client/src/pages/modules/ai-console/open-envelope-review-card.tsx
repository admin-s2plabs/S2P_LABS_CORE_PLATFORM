import { useEffect, useState, type ComponentType } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Loader2,
  Mail,
  Shield,
  User,
  Users,
} from "lucide-react";
import envelopeSealedImg from "@/assets/images/envolope-sealed.png";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OpenEnvelopeReviewSpec } from "@shared/sourcing-open-envelope-review";
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

function InfoItem({ label, value, icon: Icon }: { label: string; value: string; icon?: ComponentType<{ className?: string }> }) {
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

export function OpenEnvelopeReviewCard({
  spec,
  disabled,
  status = "pending",
  onComplete,
  chatActionRequest,
  onChatActionHandled,
}: {
  spec: OpenEnvelopeReviewSpec;
  disabled?: boolean;
  status?: "pending" | "opened";
  onComplete?: () => void;
  chatActionRequest?: SourcingChatActionRequest | null;
  onChatActionHandled?: () => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRfq = spec.bidType === "RFQ";
  const showScores = !isRfq;

  const openEnvelope = async () => {
    if (disabled || isSubmitting || status !== "pending" || !spec.canOpenEnvelope) return;
    setIsSubmitting(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/${spec.bidId}/evaluate/open-envelope`,
        {},
      );
      await res.json();
      toast({
        title: "Envelope opened",
        description: `Your request to open the envelope for ${spec.bidNumber} has been recorded.`,
      });
      onComplete?.();
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error?.message || "Could not open the envelope.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!chatActionRequest || status !== "pending" || disabled) return;
    if (chatActionRequest.card !== "openEnvelope") {
      onChatActionHandled?.();
      return;
    }
    if (chatActionRequest.kind === "cancel") {
      onChatActionHandled?.();
      return;
    }
    if (chatActionRequest.action === "open" || chatActionRequest.kind === "confirm") {
      if (!spec.canOpenEnvelope) {
        toast({
          title: "Cannot open envelope",
          description:
            spec.openEnvelopeBlockReason ||
            "Opening is not available for your role or the current bid state.",
          variant: "destructive",
        });
        onChatActionHandled?.();
        return;
      }
      void openEnvelope();
    }
    onChatActionHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest]);

  return (
    <Card className="border-amber-200 dark:border-amber-900 bg-background mt-2">
      <CardContent className="p-4 space-y-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{spec.bidNumber}</span>
              <Badge variant="outline">{spec.bidType}</Badge>
              <Badge variant="secondary">{spec.status}</Badge>
              {status === "opened" && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  Envelope Opened
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{spec.bidTitle}</p>
          </div>
          {!spec.envelopeOpened && spec.bidType === "Tender" && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">
              {spec.committeeOpenedCount} / {spec.committeeRequiredCount} committee members opened
            </Badge>
          )}
        </div>

        <div>
          <SectionTitle icon={Shield} title="Bid Summary" />
          <div className="rounded-md border bg-muted/10 p-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoItem label="Bid Style" value={spec.bidStyle} icon={Shield} />
              <InfoItem label="Start Date" value={spec.startDate} icon={Calendar} />
              <InfoItem label="End Date" value={spec.endDate} icon={Calendar} />
              <InfoItem label="Envelope Open Date" value={spec.envelopeOpenDate} icon={Clock} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoItem label="Currency" value={spec.currency} icon={DollarSign} />
              <InfoItem label="Payment Terms" value={spec.paymentTerms} icon={CreditCard} />
              <InfoItem
                label="Responses / Invited"
                value={`${spec.responsesCount} / ${spec.invitedCount}`}
                icon={Users}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Buyer
                </p>
                <p className="text-sm font-medium">{spec.buyerName}</p>
                {spec.buyerEmail && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
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
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="h-3 w-3" />
                    {spec.requestorEmail}
                  </p>
                )}
              </div>
              <div>
                <InfoItem label="Department" value={spec.departmentName} icon={Building2} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <SectionTitle icon={Users} title="Evaluation Team" />
          {!spec.evaluationTeam.length ? (
            <p className="text-xs text-muted-foreground">No evaluation team assigned.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="[&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Role</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spec.evaluationTeam.map((member, idx) => (
                    <TableRow key={`${member.role}-${member.name}-${idx}`}>
                      <TableCell className="text-xs font-medium">{member.name}</TableCell>
                      <TableCell className="text-xs">{member.role}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className={`text-[10px] ${statusBadgeClass(member.status)}`}>
                          {member.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div>
          <SectionTitle icon={Users} title="Supplier Responses" />
          {!spec.responses.length ? (
            <p className="text-xs text-muted-foreground">No supplier responses found.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="[&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs min-w-[120px]">Supplier</TableHead>
                    <TableHead className="text-xs">Response #</TableHead>
                    <TableHead className="text-xs text-right">Bid Total</TableHead>
                    {showScores && (
                      <>
                        <TableHead className="text-xs text-center">Tech Score</TableHead>
                        <TableHead className="text-xs text-center">Commercial Score</TableHead>
                        <TableHead className="text-xs text-center">Total Score</TableHead>
                      </>
                    )}
                    <TableHead className="text-xs text-center">Version</TableHead>
                    <TableHead className="text-xs">Response Status / Time Left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spec.responses.map((row) => (
                    <TableRow key={row.responseNumber}>
                      <TableCell className="text-xs">
                        <p className="font-medium">{row.supplierName}</p>
                        <p className="text-muted-foreground">{row.supplierContact}</p>
                        {row.supplierPhone && (
                          <p className="text-muted-foreground">{row.supplierPhone}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{row.responseNumber}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{row.bidTotal}</TableCell>
                      {showScores && (
                        <>
                          <TableCell className="text-xs text-center">{row.techScore}</TableCell>
                          <TableCell className="text-xs text-center">{row.commScore}</TableCell>
                          <TableCell className="text-xs text-center font-medium">{row.totalScore}</TableCell>
                        </>
                      )}
                      <TableCell className="text-xs text-center">{row.version}</TableCell>
                      <TableCell className="text-xs">
                        <p>{row.responseStatus}</p>
                        <Badge variant="secondary" className={`text-[10px] mt-0.5 ${statusBadgeClass(row.timeLeft)}`}>
                          {row.timeLeft}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {status === "pending" && spec.canOpenEnvelope && (
          <div className="flex flex-col items-center gap-3 pt-2 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Click the sealed envelope below to record your envelope opening.
            </p>
            <button
              type="button"
              className="relative group cursor-pointer transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={disabled || isSubmitting}
              onClick={openEnvelope}
              data-testid="open-envelope-action"
            >
              {isSubmitting ? (
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
              ) : (
                <img
                  src={envelopeSealedImg}
                  alt="Sealed Envelope — click to open"
                  className="max-h-[140px] w-auto object-contain opacity-95 group-hover:opacity-100 transition-opacity drop-shadow-xl"
                />
              )}
            </button>
          </div>
        )}

        {status === "pending" && !spec.canOpenEnvelope && spec.openEnvelopeBlockReason && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200"
            data-testid="open-envelope-block-reason"
          >
            {spec.openEnvelopeBlockReason}
          </div>
        )}

        {status === "opened" && (
          <div className="flex items-center justify-center gap-1.5 text-green-600 text-xs font-medium pt-2 border-t">
            <CheckCircle2 className="h-4 w-4" />
            Envelope opening recorded
          </div>
        )}
      </CardContent>
    </Card>
  );
}
