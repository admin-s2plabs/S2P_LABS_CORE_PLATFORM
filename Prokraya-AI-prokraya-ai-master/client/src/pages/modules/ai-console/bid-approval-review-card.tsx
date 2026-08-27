import { useEffect, useState, type ComponentType } from "react";
import {
  BookOpen,
  CheckCircle2,
  File,
  Loader2,
  Package,
  Scale,
  ScrollText,
  ThumbsDown,
  Users,
  XCircle,
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BidApprovalReviewSpec } from "@shared/sourcing-bid-approval-review";
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

function AttachmentLinks({
  attachments,
  label,
}: {
  attachments: BidApprovalReviewSpec["criteriaAttachments"];
  label: string;
}) {
  if (!attachments.length) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => (
          <a
            key={att.id}
            href={att.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted/60"
          >
            <File className="h-3 w-3 text-muted-foreground" />
            {att.name}
          </a>
        ))}
      </div>
    </div>
  );
}

export function BidApprovalReviewCard({
  spec,
  disabled,
  status = "pending",
  onComplete,
  chatActionRequest,
  onChatActionHandled,
}: {
  spec: BidApprovalReviewSpec;
  disabled?: boolean;
  status?: "pending" | "approved" | "rejected";
  onComplete?: (result: "approved" | "rejected") => void;
  chatActionRequest?: SourcingChatActionRequest | null;
  onChatActionHandled?: () => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRfq = spec.bidType === "RFQ";

  const submitDecision = async (result: "Approved" | "Rejected") => {
    if (disabled || isSubmitting || status !== "pending") return;
    setIsSubmitting(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/dbo/bids/processBidApprovalStep/${spec.taskId}?result=${result}&comments=&bidRefNo=${spec.bidId}`,
        {},
      );
      await res.json();
      toast({
        title: result === "Approved" ? "Bid approved" : "Bid rejected",
        description: `${spec.bidNumber} has been ${result === "Approved" ? "approved" : "rejected"} successfully.`,
      });
      onComplete?.(result === "Approved" ? "approved" : "rejected");
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error?.message || "Could not process the approval step.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!chatActionRequest || status !== "pending" || disabled) return;
    if (chatActionRequest.card !== "bidApproval") {
      onChatActionHandled?.();
      return;
    }
    const kind = chatActionRequest.kind || "confirm";
    if (kind === "cancel") {
      onChatActionHandled?.();
      return;
    }
    const action = chatActionRequest.action;
    if (action === "approve") {
      void submitDecision("Approved");
    } else if (action === "reject") {
      void submitDecision("Rejected");
    }
    onChatActionHandled?.();
    // Only react to a new chatActionRequest identity (nonce).
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
            <p className="text-xs text-muted-foreground mt-0.5">{spec.taskTitle}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <SectionTitle icon={Package} title="Scope of Work" />
            {!spec.lines.length ? (
              <p className="text-xs text-muted-foreground">No line items defined.</p>
            ) : (
              <div className="space-y-3">
                {spec.lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border bg-muted/20 p-3 text-xs space-y-1"
                  >
                    <p className="font-medium text-foreground mb-1">Line {idx + 1}</p>
                    <p><strong>Item:</strong> {line.item}</p>
                    <p><strong>Category:</strong> {line.category}</p>
                    <p><strong>Qty:</strong> {line.qty}</p>
                    <p><strong>UoM:</strong> {line.uom}</p>
                    <p><strong>Unit/Expected/Indicative:</strong> {line.unitPrice}</p>
                    <p><strong>Required From:</strong> {line.requiredFrom}</p>
                    <p><strong>Required By:</strong> {line.requiredBy}</p>
                    <p><strong>Requestor:</strong> {line.requestor}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionTitle icon={Users} title="Suppliers" />
            {!spec.suppliers.length ? (
              <p className="text-xs text-muted-foreground">No suppliers invited.</p>
            ) : (
              <ul className="text-xs space-y-0.5 list-disc pl-4">
                {spec.suppliers.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </div>

          {!isRfq && (
            <div>
              <SectionTitle icon={Scale} title="Evaluation Criteria" />
              {!spec.criteria.length ? (
                <p className="text-xs text-muted-foreground">No evaluation criteria defined.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table className="[&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Requirement</TableHead>
                        <TableHead className="text-xs">Option</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs text-right">Weight</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spec.criteria.map((row) => (
                        <TableRow key={row.index}>
                          <TableCell className="text-xs">{row.index}</TableCell>
                          <TableCell className="text-xs">{row.category}</TableCell>
                          <TableCell className="text-xs">{row.question}</TableCell>
                          <TableCell className="text-xs">{row.option}</TableCell>
                          <TableCell className="text-xs">{row.type}</TableCell>
                          <TableCell className="text-xs text-right">{row.weight}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <AttachmentLinks
                attachments={spec.criteriaAttachments}
                label="Evaluation Criteria Documents"
              />
            </div>
          )}

          {!isRfq && (
            <div>
              <SectionTitle icon={Users} title="Evaluation Team" />
              {!spec.evaluationTeam.length ? (
                <p className="text-xs text-muted-foreground">No team members assigned.</p>
              ) : (
                <div className="space-y-2">
                  {spec.evaluationTeam.map((group) => (
                    <div key={group.teamType} className="text-xs">
                      <p className="font-medium">{group.teamType}</p>
                      <p className="text-muted-foreground">{group.members.join(", ")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <SectionTitle icon={ScrollText} title="Terms & Instructions" />
            {spec.terms.length === 0 && spec.instructions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No terms or instructions defined.</p>
            ) : (
              <div className="space-y-3">
                {spec.terms.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      Terms
                    </p>
                    <ol className="text-xs space-y-1 list-decimal pl-4">
                      {spec.terms.map((t, i) => (
                        <li key={`term-${i}`}>
                          {t.description}
                          {t.reference ? (
                            <span className="text-muted-foreground"> (Ref: {t.reference})</span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {spec.instructions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 flex items-center gap-1">
                      <ScrollText className="h-3 w-3" />
                      Instructions
                    </p>
                    <ol className="text-xs space-y-1 list-decimal pl-4">
                      {spec.instructions.map((t, i) => (
                        <li key={`instr-${i}`}>
                          {t.description}
                          {t.reference ? (
                            <span className="text-muted-foreground"> (Ref: {t.reference})</span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
            <AttachmentLinks
              attachments={spec.termsAttachments}
              label="Terms & Instructions Documents"
            />
          </div>
        </div>

        {status === "pending" && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-[#3b1c71] hover:bg-[#2d1556] text-white"
              disabled={disabled || isSubmitting}
              onClick={() => submitDecision("Approved")}
              data-testid="bid-approval-approve"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-destructive hover:text-destructive"
              disabled={disabled || isSubmitting}
              onClick={() => submitDecision("Rejected")}
              data-testid="bid-approval-reject"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        )}
        {status === "approved" && (
          <div className="flex items-center justify-end gap-1.5 text-green-600 text-xs font-medium pt-2 border-t">
            <CheckCircle2 className="h-4 w-4" />
            Approved
          </div>
        )}
        {status === "rejected" && (
          <div className="flex items-center justify-end gap-1.5 text-destructive text-xs font-medium pt-2 border-t">
            <XCircle className="h-4 w-4" />
            Rejected
          </div>
        )}
      </CardContent>
    </Card>
  );
}
