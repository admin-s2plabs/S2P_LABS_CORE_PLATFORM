import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  File,
  Gavel,
  Loader2,
  Mail,
  Paperclip,
  Send,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  CommercialReviewSpec,
  CommercialReviewSupplierResponse,
} from "@shared/sourcing-commercial-review";
import type { SourcingChatActionRequest } from "./sourcing-activation-chat-actions";
import { useLiveQuery, useServerSeededScores } from "./review-score-sync";

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

type ExpandedPanel = { mode: "view" | "score"; responseId: string } | null;

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
    <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-3" data-testid="inline-commercial-response-view">
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

function CommercialScoringPanel({
  responseId,
  bidId,
  disabled,
  onClose,
  onScoresSaved,
}: {
  responseId: string;
  bidId: number;
  disabled?: boolean;
  onClose: () => void;
  onScoresSaved?: () => void;
}) {
  const { toast } = useToast();

  const { data: evaluateData, isFresh: evaluateFresh } = useLiveQuery<any>(
    [`/api/dbo/bids/${bidId}/evaluate`],
    !!bidId,
  );

  const { data, isFresh: detailFresh } = useLiveQuery<{
    response: any;
    requirements: any[];
    lines: any[];
    attachments: any[];
  }>(["/api/dbo/bids/response", responseId, "detail"], !!responseId);

  const resp = data?.response;
  const requirements = useMemo(
    () => (data?.requirements || []).filter(isCommercialRequirement),
    [data?.requirements],
  );
  const lines = data?.lines || [];
  const finAttachments = (data?.attachments || []).filter(
    (a: any) => a.attach_source === "Financial",
  );
  const existingScores = evaluateData?.scores;
  const isLoading = !detailFresh || !evaluateFresh;

  const { scores, setScores, markDirty } = useServerSeededScores(
    responseId,
    requirements,
    existingScores,
  );
  const [commercialPriceScore, setCommercialPriceScore] = useState<{ score: string; remarks: string }>({
    score: "",
    remarks: "",
  });
  const priceScoreDirty = useRef(false);
  const scoreTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const remarkTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const commercialPriceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    priceScoreDirty.current = false;
  }, [responseId]);

  useEffect(() => {
    if (!responseId || priceScoreDirty.current) return;
    const priceScoreEntry = (existingScores || []).find(
      (s: any) =>
        String(s.bid_resp_id) === String(responseId) &&
        (String(s.bid_resp_req_id) === "0" || s.question === "Commercial Price Score"),
    );
    setCommercialPriceScore({
      score: priceScoreEntry?.score != null ? String(priceScoreEntry.score) : "",
      remarks: priceScoreEntry?.comments ?? priceScoreEntry?.remarks ?? "",
    });
  }, [responseId, existingScores]);

  const saveCommercialPriceScore = useCallback(
    async (score: string, remarks: string) => {
      if (!responseId || score.trim() === "" || disabled) return;
      try {
        await apiRequest("POST", `/api/dbo/bids/response/${responseId}/commercial-price-score`, {
          score,
          remarks,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
        onScoresSaved?.();
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "Failed to save commercial price score",
          variant: "destructive",
        });
      }
    },
    [responseId, bidId, disabled, toast, onScoresSaved],
  );

  const handleScoreChange = useCallback(
    (reqId: string, value: string, idx: number, maxWeight?: string) => {
      const numVal = parseFloat(value);
      const maxW = parseFloat(maxWeight || "0");
      if (value !== "" && !isNaN(numVal) && maxW > 0 && numVal > maxW) {
        toast({
          title: "Validation",
          description: `Score cannot exceed the weightage (${maxW})`,
          variant: "destructive",
        });
        return;
      }
      if (value !== "" && !isNaN(numVal) && numVal < 0) {
        toast({ title: "Validation", description: "Score cannot be negative", variant: "destructive" });
        return;
      }
      markDirty(reqId);
      setScores((prev) => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], reqId, score: value, remarks: updated[idx]?.remarks ?? "" };
        return updated;
      });

      if (scoreTimers.current[reqId]) clearTimeout(scoreTimers.current[reqId]);
      scoreTimers.current[reqId] = setTimeout(async () => {
        if (value === null || value === undefined || String(value).trim() === "") return;
        try {
          await apiRequest("POST", `/api/dbo/bids/response/requirement/${reqId}/score`, { score: value });
          queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids/response", responseId, "detail"] });
          queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
          onScoresSaved?.();
        } catch (err: any) {
          toast({ title: "Error", description: err.message || "Failed to save score", variant: "destructive" });
        }
      }, 600);
    },
    [responseId, bidId, toast, onScoresSaved, markDirty, setScores],
  );

  const handleRemarksChange = useCallback(
    (reqId: string, value: string, idx: number) => {
      markDirty(reqId);
      setScores((prev) => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], reqId, remarks: value, score: updated[idx]?.score ?? "" };
        return updated;
      });

      if (remarkTimers.current[reqId]) clearTimeout(remarkTimers.current[reqId]);
      remarkTimers.current[reqId] = setTimeout(async () => {
        if (value === null || value === undefined || String(value).trim() === "") return;
        try {
          await apiRequest("POST", `/api/dbo/bids/response/requirement/${reqId}/comments`, {
            comments: value,
          });
        } catch (err: any) {
          toast({ title: "Error", description: err.message || "Failed to save remarks", variant: "destructive" });
        }
      }, 600);
    },
    [toast, markDirty, setScores],
  );

  const handleCommercialPriceScoreChange = useCallback(
    (value: string, remarks: string) => {
      const numVal = parseFloat(value);
      if (value !== "" && !isNaN(numVal) && numVal > 50) {
        toast({
          title: "Validation",
          description: "Score cannot exceed the weightage (50)",
          variant: "destructive",
        });
        return;
      }
      if (value !== "" && !isNaN(numVal) && numVal < 0) {
        toast({ title: "Validation", description: "Score cannot be negative", variant: "destructive" });
        return;
      }
      priceScoreDirty.current = true;
      setCommercialPriceScore({ score: value, remarks });
      if (commercialPriceTimer.current) clearTimeout(commercialPriceTimer.current);
      commercialPriceTimer.current = setTimeout(() => saveCommercialPriceScore(value, remarks), 600);
    },
    [saveCommercialPriceScore, toast],
  );

  const handleCommercialPriceRemarksChange = useCallback(
    (score: string, value: string) => {
      priceScoreDirty.current = true;
      setCommercialPriceScore({ score, remarks: value });
      if (commercialPriceTimer.current) clearTimeout(commercialPriceTimer.current);
      commercialPriceTimer.current = setTimeout(() => saveCommercialPriceScore(score, value), 600);
    },
    [saveCommercialPriceScore],
  );

  const totalGiven = scores.reduce((sum, s) => sum + (parseFloat(s?.score) || 0), 0);
  const totalMax = requirements.reduce((sum: number, req: any) => sum + (parseFloat(req.weight) || 0), 0);
  const runningScore =
    totalMax > 0 ? `${totalGiven} / ${totalMax} (${Math.round((totalGiven / totalMax) * 100)}%)` : "0 / 0";

  return (
    <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3" data-testid="inline-commercial-scoring-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Commercial Scoring — {responseId}
        </p>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
          Close
        </Button>
      </div>

      {isLoading ? (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center"
          data-testid="commercial-scoring-panel-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AI scores…
        </div>
      ) : !resp ? (
        <p className="text-xs text-muted-foreground text-center py-4">Response data not available.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {resp.supplier_name || "Supplier"} — review and edit commercial scores and remarks.
          </p>
          <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded px-2 py-1.5">
            AI recommendations are advisory only. Review scores, reasoning, and evidence before submitting.
          </p>

          <FinancialBidSection lines={lines} resp={resp} />

          {finAttachments.length > 0 && (
            <div className="pb-2 border-b">
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

          <div>
            <p className="text-xs font-semibold flex items-center gap-2 mb-2">
              <Gavel className="h-3.5 w-3.5" />
              Commercial Price Score
            </p>
            <div className="border rounded-md overflow-x-auto bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Weightage</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Review Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs py-2">
                      <Badge variant="outline" className="text-[10px]">Commercial</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-center font-mono py-2">50</TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="text"
                        className="w-[70px] h-7 text-xs"
                        placeholder="0"
                        disabled={disabled}
                        value={commercialPriceScore.score}
                        onChange={(e) =>
                          handleCommercialPriceScoreChange(e.target.value, commercialPriceScore.remarks)
                        }
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="text"
                        className="h-7 text-xs min-w-[100px]"
                        placeholder="Remarks"
                        disabled={disabled}
                        value={commercialPriceScore.remarks}
                        onChange={(e) =>
                          handleCommercialPriceRemarksChange(commercialPriceScore.score, e.target.value)
                        }
                      />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold flex items-center gap-2 mb-2">
              <ClipboardList className="h-3.5 w-3.5" />
              Commercial Evaluation Criteria
            </p>
            {requirements.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No requirements to score.</p>
            ) : (
              <div className="border rounded-md overflow-x-auto bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Option</TableHead>
                      <TableHead>Supplier Response</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead>Weightage</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Review Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requirements.map((req: any, idx: number) => (
                      <TableRow key={req.id}>
                        <TableCell className="text-xs py-2">
                          <Badge variant="outline" className="text-[10px]">{req.category}</Badge>
                        </TableCell>
                        <TableCell className="text-xs py-2 max-w-[180px]">{req.question}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{req.qvoption}</TableCell>
                        <TableCell className="text-xs py-2">{req.response || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{req.remarks || "-"}</TableCell>
                        <TableCell className="text-xs text-center font-mono py-2">{req.weight ?? "-"}</TableCell>
                        <TableCell className="py-2">
                          <Input
                            type="number"
                            className="w-[70px] h-7 text-xs"
                            placeholder="0"
                            min={0}
                            max={parseFloat(req.weight) || undefined}
                            disabled={disabled}
                            value={scores[idx]?.score ?? ""}
                            onChange={(e) => handleScoreChange(String(req.id), e.target.value, idx, req.weight)}
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            type="text"
                            className="h-7 text-xs min-w-[100px]"
                            placeholder="Remarks"
                            disabled={disabled}
                            value={scores[idx]?.remarks ?? ""}
                            onChange={(e) => handleRemarksChange(String(req.id), e.target.value, idx)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="font-semibold">Your Commercial Score:</span>
            <span className="font-semibold text-primary font-mono">{runningScore}</span>
            <span className="text-muted-foreground">scored out of total weightage</span>
          </div>
        </>
      )}
    </div>
  );
}

export function CommercialReviewCard({
  spec,
  disabled,
  status = "pending",
  onComplete,
  chatActionRequest,
  onChatActionHandled,
  onConfirmationStateChange,
}: {
  spec: CommercialReviewSpec;
  disabled?: boolean;
  status?: "pending" | "submitted";
  onComplete?: () => void;
  chatActionRequest?: SourcingChatActionRequest | null;
  onChatActionHandled?: () => void;
  onConfirmationStateChange?: (action: "submit_score" | null) => void;
}) {
  const { toast } = useToast();
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const didAutoExpandAiScores = useRef(false);

  const {
    data: evaluateData,
    refetch: refetchEvaluate,
    isFresh: evaluateFresh,
  } = useLiveQuery<any>([`/api/dbo/bids/${spec.bidId}/evaluate`], !!spec.bidId);

  const { data: scoreStatus, refetch: refetchScoreStatus } = useLiveQuery<{
    submitted: boolean;
    approved: boolean;
    userTeams: string[];
  }>([`/api/dbo/bids/${spec.bidId}/comm-score-status`], !!spec.bidId);

  const isRfq = spec.bidType === "RFQ";
  const submitted = status === "submitted" || scoreStatus?.submitted || spec.scoreSubmitted;
  const onReviewTeam =
    spec.canScore ||
    (scoreStatus?.userTeams?.includes("Commercial Review Team") ?? false);
  const canScore =
    !spec.readOnly && onReviewTeam && !submitted && !scoreStatus?.approved && !isRfq;
  const canSubmit = canScore;

  const responses: CommercialReviewSupplierResponse[] =
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

  const firstResponseId = responses[0]?.responseId;
  const scoresPending = !!spec.aiAutoScored && !evaluateFresh;

  useEffect(() => {
    if (didAutoExpandAiScores.current) return;
    if (!spec.aiAutoScored || !canScore || !firstResponseId) return;
    setExpandedPanel({ mode: "score", responseId: firstResponseId });
    didAutoExpandAiScores.current = true;
  }, [spec.aiAutoScored, canScore, firstResponseId]);

  const togglePanel = (mode: "view" | "score", responseId: string) => {
    setExpandedPanel((current) =>
      current?.mode === mode && current.responseId === responseId
        ? null
        : { mode, responseId },
    );
  };

  const beginSubmitConfirm = () => {
    if (!canSubmit || disabled || isSubmitting || submitted) return;
    setConfirmSubmit(true);
    onConfirmationStateChange?.("submit_score");
  };

  const cancelSubmitConfirm = () => {
    setConfirmSubmit(false);
    onConfirmationStateChange?.(null);
  };

  const submitScores = async () => {
    if (!canSubmit || disabled || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/dbo/bids/${spec.bidId}/submit-comm-score`);
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${spec.bidId}/evaluate`] });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${spec.bidId}/comm-score-status`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });

      if (result.status === "failure") {
        toast({ title: "Submission Failed", description: result.message, variant: "destructive" });
      } else {
        toast({
          title: "Scores Submitted",
          description: result.message || "Commercial scores submitted successfully.",
        });
        setConfirmSubmit(false);
        onConfirmationStateChange?.(null);
        onComplete?.();
      }
    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error?.message || "Could not submit scores.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setConfirmSubmit(false);
      onConfirmationStateChange?.(null);
    }
  };

  useEffect(() => {
    if (!chatActionRequest || submitted || disabled) return;
    if (chatActionRequest.card !== "commercialReview") {
      onChatActionHandled?.();
      return;
    }
    const kind = chatActionRequest.kind || "start";
    if (kind === "cancel") {
      cancelSubmitConfirm();
      onChatActionHandled?.();
      return;
    }
    if (!canSubmit) {
      toast({
        title: "Cannot submit scores",
        description:
          spec.blockReason ||
          "Commercial scoring is not available for your role, or scores are already submitted/approved.",
        variant: "destructive",
      });
      onChatActionHandled?.();
      return;
    }
    if (kind === "start") {
      beginSubmitConfirm();
      onChatActionHandled?.();
      return;
    }
    void submitScores();
    onChatActionHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatActionRequest]);

  const refreshScores = () => {
    refetchEvaluate();
    refetchScoreStatus();
  };

  return (
    <Card className="border-purple-200 dark:border-purple-900 bg-background mt-2">
      <CardContent className="p-4 space-y-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{spec.bidNumber}</span>
              <Badge variant="outline">{spec.bidType}</Badge>
              <Badge variant="secondary">{spec.status}</Badge>
              {submitted && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Scores Submitted
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{spec.bidTitle}</p>
            <p className="text-xs text-muted-foreground">{spec.taskTitle}</p>
          </div>
        </div>

        {spec.aiAutoScored && canScore && (
          <div className="flex items-start gap-2 rounded-md border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/30 p-2.5 text-xs text-purple-800 dark:text-purple-200">
            {evaluateFresh ? (
              <>
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  AI scores applied automatically — review and edit them below, then Submit Score when ready.
                </span>
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin" />
                <span data-testid="commercial-review-ai-scores-loading">
                  Applying AI scores — loading the latest scores…
                </span>
              </>
            )}
          </div>
        )}

        {spec.readOnly && spec.blockReason && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{spec.blockReason}</span>
          </div>
        )}

        <div>
          <SectionTitle icon={ClipboardList} title="Bid Summary" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <InfoItem label="Bid Name" value={spec.bidTitle} />
            <InfoItem label="Status" value={spec.status} />
            <InfoItem label="Bid Style" value={spec.bidStyle} icon={Calendar} />
            <InfoItem label="Currency" value={spec.currency} icon={DollarSign} />
            <InfoItem label="Start Date" value={spec.startDate} icon={Calendar} />
            <InfoItem label="End Date" value={spec.endDate} icon={Calendar} />
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
          <SectionTitle icon={ClipboardCheck} title="Supplier Responses" />

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
                    <TableHead className="text-center">Current Commercial Score</TableHead>
                    <TableHead className="text-center">Version</TableHead>
                    <TableHead>Action</TableHead>
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
                          onClick={() => togglePanel("view", r.responseId)}
                          data-testid={`link-comm-response-${r.responseId}`}
                        >
                          {r.responseId}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{r.bidTotal}</TableCell>
                      <TableCell className="text-xs text-center">
                        {scoresPending ? (
                          <Loader2 className="h-3 w-3 animate-spin inline-block text-muted-foreground" />
                        ) : (
                          r.commScore
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-center">{r.version}</TableCell>
                      <TableCell>
                        {canScore ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={disabled}
                            onClick={() => togglePanel("score", r.responseId)}
                            data-testid={`button-comm-score-${r.responseId}`}
                          >
                            <ClipboardCheck className="h-3 w-3 mr-1" />
                            Score
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {expandedPanel?.mode === "view" && (
            <CommercialResponseViewPanel
              responseId={expandedPanel.responseId}
              onClose={() => setExpandedPanel(null)}
            />
          )}

          {expandedPanel?.mode === "score" && (
            <CommercialScoringPanel
              responseId={expandedPanel.responseId}
              bidId={spec.bidId}
              disabled={disabled || !canScore}
              onClose={() => setExpandedPanel(null)}
              onScoresSaved={refreshScores}
            />
          )}
        </div>

        {canSubmit && status === "pending" && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
            {confirmSubmit ? (
              <>
                <span className="text-xs text-muted-foreground">Submit all scores?</span>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-[#3b1c71] hover:bg-[#2d1556] text-white"
                  disabled={disabled || isSubmitting}
                  onClick={submitScores}
                  data-testid="commercial-review-confirm-submit"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Yes, Submit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={isSubmitting}
                  onClick={cancelSubmitConfirm}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-[#3b1c71] hover:bg-[#2d1556] text-white"
                disabled={disabled}
                onClick={beginSubmitConfirm}
                data-testid="commercial-review-submit"
              >
                <Send className="h-3.5 w-3.5" />
                Submit Score
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
