import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormSheet } from "@/components/form-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, handleDownloadDocument } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  DollarSign,
  File,
  FileText,
  Gavel,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  Send,
  Shield,
  ThumbsUp,
  User,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const bidTypeLabels: Record<string, { label: string; full: string; className: string }> = {
  RFQ: { label: "RFQ", full: "Request for Quotation", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  RFP: { label: "RFP", full: "Request for Proposal", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  Tender: { label: "Tender", full: "Open Tender", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const statusConfig: Record<string, { className: string }> = {
  Published: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Closed: { className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  Awarded: { className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  "Award Under Process": { className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  Draft: { className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

function InfoItem({ label, value, icon: Icon, testId }: { label: string; value: string | null | undefined; icon?: any; testId?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className="text-sm font-medium" data-testid={testId}>{value || "-"}</p>
    </div>
  );
}

function computeCommercialScorePercent(
  criteriaScores: Array<{ score: string }>,
  totalFinWeight: number,
  commercialPriceScore: string,
  hasFinanceRequirements: boolean,
): number {
  const lineWeight = hasFinanceRequirements ? 50 : 100;
  const criteriaSum = criteriaScores.reduce((sum, s) => sum + (parseFloat(s?.score) || 0), 0);
  const criteriaPct = totalFinWeight > 0 ? Math.round((criteriaSum / totalFinWeight) * 100) : 0;
  const priceScore = parseFloat(commercialPriceScore) || 0;
  const pricePct = lineWeight > 0 ? (priceScore / lineWeight) * 100 : 0;

  if (hasFinanceRequirements) {
    return Math.round(criteriaPct * 0.5 + pricePct * 0.5);
  }
  return pricePct > 0 ? Math.round(pricePct) : 0;
}

export default function BidCommScore({ id }: { id?: string }) {
  const [, params] = useRoute("/app/bids/:id/comm-score");
  const bidId = id || params?.id;
  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/dbo/bids/${bidId}/evaluate`],
    enabled: !!bidId,
  });

  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  const [scoreResponseId, setScoreResponseId] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const { toast } = useToast();

  const [, navigate] = useLocation();

  const sessionTeam = useMemo(() => {
    const taskId = sessionStorage.getItem("currentTaskId") || "";
    if (taskId.includes("Commercial_Approve_Team")) return "Commercial Approve Team";
    if (taskId.includes("Commercial_Review_Team")) return "Commercial Review Team";
    return "";
  }, []);

  const { data: scoreStatus } = useQuery<{ submitted: boolean; approved: boolean; commScoreComplete: boolean; userTeams: string[] }>({
    queryKey: [`/api/dbo/bids/${bidId}/comm-score-status`],
    enabled: !!bidId,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dbo/bids/${bidId}/approve-comm-score`);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/comm-score-status`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "approvers"] });
      setConfirmApprove(false);

      if (result.status === "failure") {
        toast({ title: "Approval Failed", description: result.message, variant: "destructive" });
      } else {
        toast({ title: "Scores Approved", description: result.message || "Commercial scores approved successfully." });
        navigate("/app/bids");
      }
    },
    onError: (error: any) => {
      toast({ title: "Approval Failed", description: error.message || "Could not approve scores.", variant: "destructive" });
      setConfirmApprove(false);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dbo/bids/${bidId}/submit-comm-score`);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/comm-score-status`] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "approvers"] });
      setConfirmSubmit(false);

      if (result.status === "failure") {
        toast({ title: "Submission Failed", description: result.message, variant: "destructive" });
      } else if (result.status === "information") {
        toast({ title: "Score Submitted", description: result.message });
        navigate("/app/bids");
      } else {
        toast({ title: "Scores Submitted", description: result.message || "Commercial scores submitted successfully." });
        navigate("/app/bids");
      }
    },
    onError: (error: any) => {
      toast({ title: "Submission Failed", description: error.message || "Could not submit scores.", variant: "destructive" });
      setConfirmSubmit(false);
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data?.bid) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Bid Data Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">Could not load data for this bid.</p>
            <Link href="/app/bids">
              <Button variant="outline" data-testid="button-comm-score-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Bids
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { bid, responses } = data;
  const bidType = bid.type || "RFQ";
  const typeConfig = bidTypeLabels[bidType] || bidTypeLabels["RFQ"];
  const bidNumber = bid.bid_number || bid.attribute_4 || `BID-${bid.id}`;
  const sConfig = statusConfig[bid.status] || statusConfig["Draft"];
  const totalResponses = (responses || []).length;

  return (
    <div className="p-4 space-y-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap" data-testid="breadcrumb-comm-score">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/app/bids">
            <Button variant="ghost" size="icon" data-testid="button-back-to-bids-list">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <Gavel className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold" data-testid="text-comm-bid-number">{bidNumber}</h1>
              <Badge variant="outline" className={`border-0 ${typeConfig.className}`} data-testid="badge-comm-bid-type">
                {typeConfig.full}
              </Badge>
              <Badge variant="secondary" className={`${sConfig.className}`} data-testid="badge-comm-bid-status">
                {bid.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-comm-bid-title">{bid.bid_title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {scoreStatus?.approved && (
            <Badge variant="secondary" className="gap-1" data-testid="badge-score-approved">
              <CheckCircle2 className="h-3 w-3" />
              Scores Approved
            </Badge>
          )}
          {scoreStatus?.submitted && !scoreStatus?.approved && (
            <Badge variant="secondary" className="gap-1" data-testid="badge-score-submitted">
              <CheckCircle2 className="h-3 w-3" />
              Scores Submitted
            </Badge>
          )}
          {(sessionTeam === "Commercial Review Team" || scoreStatus?.userTeams?.includes("Commercial Review Team")) && !scoreStatus?.submitted && (
            confirmSubmit ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Are you sure?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                  data-testid="button-confirm-submit-score"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {submitMutation.isPending ? "Submitting..." : "Yes, Submit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmSubmit(false)}
                  data-testid="button-cancel-submit-score"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setConfirmSubmit(true)}
                data-testid="button-comm-submit-score"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Submit Score
              </Button>
            )
          )}
          {(sessionTeam === "Commercial Approve Team" || scoreStatus?.userTeams?.includes("Commercial Approve Team")) && scoreStatus?.commScoreComplete && !scoreStatus?.approved && (
            confirmApprove ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Are you sure?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                  data-testid="button-confirm-approve-score"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {approveMutation.isPending ? "Approving..." : "Yes, Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmApprove(false)}
                  data-testid="button-cancel-approve-score"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setConfirmApprove(true)}
                data-testid="button-comm-approve-score"
              >
                <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                Approve Score
              </Button>
            )
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {bid.description && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground max-w-2xl">{bid.description}</p>
              <Separator className="mt-4" />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem label="Start Date" value={formatDateTime(bid.startdate)} icon={Calendar} testId="text-comm-start-date" />
            <InfoItem label="End Date" value={formatDateTime(bid.enddate)} icon={Calendar} testId="text-comm-end-date" />
            <InfoItem label="Currency" value={bid.currency} icon={DollarSign} testId="text-comm-currency" />
            <InfoItem label="Bid Style" value={bid.bid_style || "-"} icon={Shield} testId="text-comm-bid-style" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <InfoItem label="Payment Terms" value={bid.paymentterms} icon={CreditCard} testId="text-comm-payment-terms" />
            <InfoItem label="Delivery Location" value={bid.delivertto_location_name || bid.shiptoaddress} icon={MapPin} testId="text-comm-delivery-location" />
            {bid.pr_number && (
              <InfoItem label="Linked PR" value={bid.pr_number} icon={FileText} testId="text-comm-linked-pr" />
            )}
            {bidType === "Tender" && (
              <InfoItem label="Envelope Open Date" value={formatDateTime(bid.env_open_date)} icon={Clock} testId="text-comm-env-open-date" />
            )}
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium" data-testid="text-comm-buyer-name">{bid.buyer_name || bid.buyer || "-"}</p>
              {bid.buyer_email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />{bid.buyer_email}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Requestor
              </p>
              <p className="text-sm font-medium" data-testid="text-comm-requestor-name">{bid.requestor_name || "-"}</p>
              {bid.requestor_email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />{bid.requestor_email}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Department
              </p>
              <p className="text-sm font-medium" data-testid="text-comm-department">{bid.department_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <Users className="h-3 w-3" />
                Responses / Invited
              </p>
              <p className="text-sm font-medium" data-testid="text-comm-responses-count">
                {totalResponses} / {bid.no_invited_supps || 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Supplier Responses</h3>
              {totalResponses > 0 && (
                <Badge variant="secondary" className="text-xs">{totalResponses}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <SupplierResponsesTable
            responses={responses}
            bid={bid}
            onViewResponse={(id) => setSelectedResponseId(id)}
            onScore={(id) => setScoreResponseId(id)}
          />
        </CardContent>
      </Card>

      <ResponseDetailSheet
        responseId={selectedResponseId}
        onClose={() => setSelectedResponseId(null)}
      />

      <CommScoreSheet
        responseId={scoreResponseId}
        bidId={bidId}
        existingScores={data?.scores || []}
        onClose={() => setScoreResponseId(null)}
      />
    </div>
  );
}

function SupplierResponsesTable({ responses, bid, onViewResponse, onScore }: { responses: any[]; bid: any; onViewResponse?: (id: string) => void; onScore?: (id: string) => void }) {
  if (!responses || responses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="font-medium">No supplier responses found</p>
        <p className="text-sm mt-1">Suppliers have not yet submitted their bid responses.</p>
      </div>
    );
  }

  const sessionTeam = useMemo(() => {
    const taskId = sessionStorage.getItem("currentTaskId") || "";
    if (taskId.includes("Commercial_Approve_Team")) return "Commercial Approve Team";
    if (taskId.includes("Commercial_Review_Team")) return "Commercial Review Team";
    return "";
  }, []);

  const { data: scoreStatus } = useQuery<{ submitted: boolean; approved: boolean; techScoreComplete: boolean; userTeams: string[] }>({
    queryKey: [`/api/dbo/bids/${bid.id}/score-status`],
    enabled: !!bid.id,
  });

  return (
    <div className="border rounded-md overflow-x-auto" data-testid="table-supplier-responses">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead className="min-w-[150px]">Supplier</TableHead>
            <TableHead>Response#</TableHead>
            <TableHead className="text-right">Bid Total</TableHead>
            <TableHead className="text-center">Comm Score</TableHead>
            <TableHead className="text-center">Version</TableHead>
            {(sessionTeam === "Commercial Review Team" || scoreStatus?.userTeams?.includes("Commercial Review Team")) &&<TableHead>Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {responses.map((r: any, idx: number) => (
            <TableRow key={r.id} data-testid={`row-response-${r.id}`}>
              <TableCell className="text-muted-foreground text-sm py-2">{idx + 1}</TableCell>
              <TableCell className="py-2">
                <div>
                  <p className="text-sm font-medium">{r.supplier_name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{r.supplier_contact || "-"}</p>
                  {r.supplier_contact_no && (
                    <p className="text-xs text-muted-foreground">{r.supplier_contact_no}</p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm font-mono py-2" data-testid={`text-response-id-${r.id}`}>
                <span
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  onClick={() => onViewResponse?.(r.id)}
                  data-testid={`link-view-response-${r.id}`}
                >{r.id}</span>
              </TableCell>
              <TableCell className="text-sm text-right font-mono py-2">
                {formatCurrency(r.grosstotal, bid.currency)}
              </TableCell>
              
              <TableCell className="text-sm text-center py-2">{r.totalcommercialscore ?? "NA"}</TableCell>
              <TableCell className="text-sm text-center py-2">{r.version ?? 0}</TableCell>
              <TableCell className="py-2">
                {(sessionTeam === "Commercial Review Team" || scoreStatus?.userTeams?.includes("Commercial Review Team")) &&<Button
                  variant="outline"
                  size="sm"
                  onClick={() => onScore?.(r.id)}
                  data-testid={`button-score-${r.id}`}
                >
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                  Score
                </Button>
                }
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}


function CommScoreSheet({ responseId, bidId, existingScores, onClose }: { responseId: string | null; bidId?: string; existingScores?: any[]; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ response: any; requirements: any[]; lines: any[]; attachments: any[] }>({
    queryKey: ["/api/dbo/bids/response", responseId, "detail"],
    enabled: !!responseId,
  });

  const resp = data?.response;
  const allRequirements = data?.requirements || [];
  const requirements = allRequirements.filter((req: any) => {
    const cat = (req.category || "").toLowerCase();
    return cat === "financial" || cat === "finance" || cat === "commercial";
  });
  const totalFinWeight = requirements.reduce((sum: number, req: any) => sum + (parseFloat(req.weight) || 0), 0);
  const lines = data?.lines || [];
  const allAttachments = data?.attachments || [];
  const currency = resp?.currency || "AED";

  const totalAmt = resp?.bidtotal ? parseFloat(resp.bidtotal) : 0;
  const totalDisc = resp?.biddisc ? parseFloat(resp.biddisc) : 0;
  const grossTotal = resp?.grosstotal ? parseFloat(resp.grosstotal) : 0;
  const amountInWords = resp?.amount_in_words || "";

  const finAttachments = allAttachments.filter((a: any) => a.attach_source === "Financial");

  const [scores, setScores] = useState<Array<{ reqId: string; score: string; remarks: string }>>([]);
  const [commercialPriceScore, setCommercialPriceScore] = useState<{ score: string; remarks: string }>({ score: "", remarks: "" });
  const prevResponseId = useRef<string | null>(null);
  const { toast } = useToast();
  const scoreTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const remarkTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const commercialPriceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (requirements.length > 0 && responseId && responseId !== prevResponseId.current) {
      const myScoresForResp = (existingScores || []).filter(
        (s: any) => String(s.bid_resp_id) === String(responseId)
      );
      const scoreMap = new Map<string, { score: string; comments: string }>();
      for (const s of myScoresForResp) {
        scoreMap.set(String(s.bid_resp_req_id), { score: String(s.score ?? ""), comments: s.comments ?? "" });
      }
      const initial = requirements.map((req: any) => {
        const existing = scoreMap.get(String(req.id));
        return {
          reqId: String(req.id),
          score: existing?.score ?? "",
          remarks: existing?.comments ?? "",
        };
      });
      setScores(initial);
      prevResponseId.current = responseId;
    }
  }, [requirements, responseId, existingScores]);

  useEffect(() => {
    if (!responseId) return;
    const priceScoreEntry = (existingScores || []).find(
      (s: any) =>
        String(s.bid_resp_id) === String(responseId) &&
        (String(s.bid_resp_req_id) === "0" || s.question === "Commercial Price Score")
    );
    setCommercialPriceScore({
      score: priceScoreEntry?.score != null ? String(priceScoreEntry.score) : "",
      remarks: priceScoreEntry?.comments ?? priceScoreEntry?.remarks ?? "",
    });
  }, [responseId, existingScores]);

  useEffect(() => {
    if (!responseId) {
      prevResponseId.current = null;
      setScores([]);
      setCommercialPriceScore({ score: "", remarks: "" });
    }
  }, [responseId]);

  const handleClose = useCallback(() => {
    if (bidId) {
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
    }
    onClose();
  }, [bidId, onClose]);

  const handleScoreChange = useCallback((reqId: string, value: string, idx: number, maxWeight?: string) => {
    const numVal = parseFloat(value);
    const maxW = parseFloat(maxWeight || "0");
    if (value !== "" && !isNaN(numVal) && maxW > 0 && numVal > maxW) {
      toast({ title: "Validation", description: `Score cannot exceed the weightage (${maxW})`, variant: "destructive" });
      return;
    }
    if (value !== "" && !isNaN(numVal) && numVal < 0) {
      toast({ title: "Validation", description: "Score cannot be negative", variant: "destructive" });
      return;
    }
    const updated = [...scores];
    updated[idx] = { ...updated[idx], reqId, score: value, remarks: updated[idx]?.remarks ?? "" };
    setScores(updated);

    if (scoreTimers.current[reqId]) clearTimeout(scoreTimers.current[reqId]);
    scoreTimers.current[reqId] = setTimeout(async () => {
      if (value === null || value === undefined || String(value).trim() === "") return;
      try {
        await apiRequest("POST", `/api/dbo/bids/response/requirement/${reqId}/score`, { score: value });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids/response", responseId, "detail"] });
      } catch (err: any) {
        toast({ title: "Error", description: err.message || "Failed to save score", variant: "destructive" });
      }
    }, 600);
  }, [scores, responseId, toast]);

  const handleRemarksChange = useCallback((reqId: string, value: string, idx: number) => {
    const updated = [...scores];
    updated[idx] = { ...updated[idx], reqId, remarks: value, score: updated[idx]?.score ?? "" };
    setScores(updated);

    if (remarkTimers.current[reqId]) clearTimeout(remarkTimers.current[reqId]);
    remarkTimers.current[reqId] = setTimeout(async () => {
      if (value === null || value === undefined || String(value).trim() === "") return;
      try {
        await apiRequest("POST", `/api/dbo/bids/response/requirement/${reqId}/comments`, { comments: value });
      } catch (err: any) {
        toast({ title: "Error", description: err.message || "Failed to save remarks", variant: "destructive" });
      }
    }, 600);
  }, [scores, responseId, toast]);

  const saveCommercialPriceScore = useCallback(async (score: string, remarks: string) => {
    if (!responseId || score.trim() === "") return;
    try {
      await apiRequest("POST", `/api/dbo/bids/response/${responseId}/commercial-price-score`, { score, remarks });
      if (bidId) {
        queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bidId}/evaluate`] });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save commercial price score", variant: "destructive" });
    }
  }, [responseId, bidId, toast]);

  const handleCommercialPriceScoreChange = useCallback((value: string, remarks: string) => {
    const numVal = parseFloat(value);
    const maxWeight = requirements.length === 0 ? 100 : 50;
    if (value !== "" && !isNaN(numVal) && numVal > maxWeight) {
      toast({ title: "Validation", description: "Score cannot exceed the weightage (50)", variant: "destructive" });
      return;
    }
    if (value === null || value !== "" && !isNaN(numVal) && numVal < 0) {
      toast({ title: "Validation", description: "Score cannot be negative", variant: "destructive" });
      return;
    }
    setCommercialPriceScore({ score: value, remarks });

    if (commercialPriceTimer.current) clearTimeout(commercialPriceTimer.current);
    commercialPriceTimer.current = setTimeout(() => saveCommercialPriceScore(value, remarks), 600);
  }, [saveCommercialPriceScore, toast]);

  const handleCommercialPriceRemarksChange = useCallback((score: string, value: string) => {
    setCommercialPriceScore({ score, remarks: value });

    if (commercialPriceTimer.current) clearTimeout(commercialPriceTimer.current);
    commercialPriceTimer.current = setTimeout(() => saveCommercialPriceScore(score, value), 600);
  }, [saveCommercialPriceScore]);

  return (
    <FormSheet
      open={!!responseId}
      onOpenChange={(open) => { if (!open) handleClose(); }}
      title={`Commercial Scoring — ${responseId}`}
      description={resp ? `${resp.supplier_name || "Supplier"} — ${resp.bidtitle || ""}` : "Loading commercial details..."}
      onSubmit={handleClose}
      submitLabel="Ok"
      widthClassName="sm:!max-w-[90vw] !w-[90vw]"
    >
        {isLoading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : !resp ? (
          <div className="mt-6 text-center text-muted-foreground">
            <p className="text-sm">Response data not available.</p>
          </div>
        ) : (
          <div className="space-y-5 mt-6">
            <div>
              {finAttachments.length > 0 && (
                <div className="mb-3 pb-2 border-b">
                  <span className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Paperclip className="h-3.5 w-3.5" />
                    Financial Attachments
                  </span>
                  <div className="overflow-x-auto">
                    <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {finAttachments.map((att: any) => (
                          <TableRow key={att.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {att.attach_path ? (
                                  <a
                                    onClick={() => handleDownloadDocument(att.id, `/api/dbo/bids/response/attachments/${att.id}/download`)}
                                    data-testid={`link-download-attachment-${att.id}`}
                                    className="font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {att.attach_name}
                                  </a>
                                ) : (
                                  <span className="text-sm">{att.attach_name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(att.created_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {lines.length > 0 && (
                <div className="mb-3 pb-2 border-b">
                  <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-sm font-semibold">Commercial Evaluation Criteria</h4>
                </div>
              </div>
              {requirements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No requirements defined.</p>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Category</TableHead>
                        <TableHead className="min-w-[280px]">Requirement</TableHead>
                        <TableHead className="w-[70px]">Option</TableHead>
                        <TableHead className="w-[140px]">Response</TableHead>
                        <TableHead className="w-[120px]">Remarks</TableHead>
                        <TableHead className="w-[80px]">Weightage</TableHead>
                        <TableHead className="w-[75px]">Score</TableHead>
                        <TableHead className="w-[140px]">Review Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requirements.map((req: any, idx: number) => (
                        <TableRow key={req.id} data-testid={`row-comm-req-${req.id}`}>
                          <TableCell className="text-sm py-2">
                            <Badge variant="outline" className="text-xs">{req.category}</Badge>
                          </TableCell>
                          <TableCell className="text-sm py-2">{req.question}</TableCell>
                          <TableCell className="text-sm text-muted-foreground py-2">{req.qvoption}</TableCell>
                          <TableCell className="text-sm py-2">{req.response || "-"}</TableCell>
                          <TableCell className="text-sm py-2 text-muted-foreground">{req.remarks || "-"}</TableCell>
                          <TableCell className="text-sm text-center font-mono py-2">{req.weight ?? "-"}</TableCell>
                          <TableCell className="py-2">
                            <Input
                              type="number"
                              className="w-[70px] h-8 text-sm"
                              placeholder="0"
                              min={0}
                              max={parseFloat(req.weight) || undefined}
                              data-testid={`input-score-${req.id}`}
                              value={scores[idx]?.score ?? ""}
                              onChange={(e) => handleScoreChange(String(req.id), e.target.value, idx, req.weight)}
                            />
                          </TableCell>
                          <TableCell className="py-2">
                            <Input
                              type="text"
                              className="h-8 text-sm"
                              placeholder="Remarks"
                              data-testid={`input-review-remarks-${req.id}`}
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
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                      <DollarSign className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-sm font-semibold">Financial Bid</h4>
                    </div>
                  </div>
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
                          <TableRow key={line.id} data-testid={`row-comm-line-${line.id}`}>
                            <TableCell className="py-2">
                              <div className="text-sm font-medium">{line.description}</div>
                              {line.product_category && <div className="text-xs text-muted-foreground">{line.product_category}</div>}
                            </TableCell>
                            <TableCell className="text-sm text-right font-mono py-2">{line.quantity}</TableCell>
                            <TableCell className="text-sm py-2">{line.uom || "-"}</TableCell>
                            <TableCell className="text-sm text-right font-mono py-2">
                              {line.bidprice != null ? formatCurrency(line.bidprice, line.currency || currency) : "-"}
                            </TableCell>
                            <TableCell className="text-sm text-right font-mono py-2">
                              {line.discprice != null ? formatCurrency(line.discprice, line.currency || currency) : "-"}
                            </TableCell>
                            <TableCell className="text-sm py-2">{line.rate ? line.rate + "%" : "-"}</TableCell>
                            <TableCell className="text-sm py-2">
                              {line.rate ? (
                                resp?.tax_included === "Yes" ? (
                                  formatCurrency(
                                    (Math.round(((Number(line.bidprice) || 0) * (Number(line.quantity) || 0)) / (1 - (Number(line.rate) || 0) / 100)) * (Number(line.rate) || 0)) / 100,
                                    line.currency || currency
                                  )
                                ) : (
                                  formatCurrency(
                                    ((Number(line.bidprice) || 0) * (Number(line.quantity) || 0) - (Number(line.discprice) || 0) * (Number(line.quantity) || 0)) * ((Number(line.rate) || 0) / 100),
                                    line.currency || currency
                                  )
                                )
                              ) : "-"}
                            </TableCell>
                            <TableCell className="text-sm py-2">{line.currency || currency}</TableCell>
                            <TableCell className="text-sm py-2">
                              {line.promised_date ? formatDate(line.promised_date) : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-3 flex flex-col items-end gap-1 text-sm">
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
                      <span className="w-32 text-right font-mono">{formatCurrency(resp?.tax_amount ?? 0, currency)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">Net Total Amount:</span>
                      <span className="font-semibold w-32 text-right font-mono">{formatCurrency(grossTotal, currency)}</span>
                    </div>
                    {amountInWords && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-medium">In Words:</span>
                        <span className="text-muted-foreground">{amountInWords}</span>
                      </div>
                    )}
                    {(
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-medium">Score:</span>
                        <span className="font-medium w-22 text-right font-mono">
                          <Input
                            type="number"
                            className="h-8 text-sm"
                            placeholder="0"
                            min={0}
                            max={requirements.length === 0 ? 100 : 50}
                            data-testid="input-commercial-price-score"
                            value={commercialPriceScore.score}
                            onChange={(e) => handleCommercialPriceScoreChange(e.target.value, commercialPriceScore.remarks)}
                          />
                          </span>/<span className="font-medium w-4 text-right font-mono">{requirements.length === 0 ? 100 : 50}</span>
                      </div>
                    )}
                    {(
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-medium">Remarks:</span>
                        <span className="font-medium w-32 text-right font-mono">
                        <Input
                            type="text"
                            className="h-8 text-sm"
                            placeholder="Remarks"
                            data-testid="input-commercial-price-review-remarks"
                            value={commercialPriceScore.remarks}
                            onChange={(e) => handleCommercialPriceRemarksChange(commercialPriceScore.score, e.target.value)}
                          />
                          </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
{/* 
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                    <Gavel className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h4 className="text-sm font-semibold">Commercial Scoring</h4>
                </div>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Category</TableHead>
                        <TableHead className="w-[80px]">Weightage</TableHead>
                        <TableHead className="w-[75px]">Score</TableHead>
                        <TableHead className="w-[140px]">Review Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow data-testid="row-commercial-price-score">
                        <TableCell className="text-sm py-2">
                          <Badge variant="outline" className="text-xs">Commercial</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-center font-mono py-2">50</TableCell>
                        <TableCell className="py-2">
                          <Input
                            type="text"
                            className="w-[70px] h-8 text-sm"
                            placeholder="0"
                            data-testid="input-commercial-price-score"
                            value={commercialPriceScore.score}
                            onChange={(e) => handleCommercialPriceScoreChange(e.target.value, commercialPriceScore.remarks)}
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            type="text"
                            className="h-8 text-sm"
                            placeholder="Remarks"
                            data-testid="input-commercial-price-review-remarks"
                            value={commercialPriceScore.remarks}
                            onChange={(e) => handleCommercialPriceRemarksChange(commercialPriceScore.score, e.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div> */}

              

              <div className="mt-4 mb-6 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Your Commercial Score:</span>
                  <span className="font-semibold text-primary font-mono" data-testid="text-total-score-percent">
                    {(() => {
                      const totalGiven = computeCommercialScorePercent(
                        scores,
                        totalFinWeight,
                        commercialPriceScore.score,
                        requirements.length > 0,
                      );
                      return totalGiven > 0 ? `${totalGiven} / ${100} (${totalGiven}%)` : "0 / 0";
                    })()}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">scored out of total weightage</span>
                </div>
              </div>
            </div>
          </div>
        )}
    </FormSheet>
  );
}

function ResponseDetailSheet({ responseId, onClose }: { responseId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ response: any; requirements: any[]; lines: any[]; attachments: any[] }>({
    queryKey: ["/api/dbo/bids/response", responseId, "detail"],
    enabled: !!responseId,
  });

  const resp = data?.response;
  const allRequirements = data?.requirements || [];
  const requirements = allRequirements.filter((req: any) => {
    const cat = (req.category || "").toLowerCase();
    return cat === "financial" || cat === "finance" || cat === "commercial";
  });
  const lines = data?.lines || [];
  const allAttachments = data?.attachments || [];
  const currency = resp?.currency || "AED";

  const totalAmt = resp?.bidtotal ? parseFloat(resp.bidtotal) : 0;
  const totalDisc = resp?.biddisc ? parseFloat(resp.biddisc) : 0;
  const grossTotal = resp?.grosstotal ? parseFloat(resp.grosstotal) : 0;
  const amountInWords = resp?.amount_in_words || "";

  const techAttachments = allAttachments.filter((a: any) => a.attach_source === "Technical" || !a.attach_source);
  const finAttachments = allAttachments.filter((a: any) => a.attach_source === "Financial");

  return (
    <Sheet open={!!responseId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-4xl overflow-y-auto" data-testid="sheet-response-detail">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Supplier Response — {responseId}
          </SheetTitle>
          <SheetDescription>
            {resp ? `${resp.supplier_name || "Supplier"} — ${resp.bidtitle || ""}` : "Loading response details..."}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : !resp ? (
          <div className="mt-6 text-center text-muted-foreground">
            <p className="text-sm">Response data not available.</p>
          </div>
        ) : (
          <div className="space-y-5 mt-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-sm font-semibold">Financial Criteria</h4>
              </div>
              {requirements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No requirements defined.</p>
              ) : (
                requirements.filter((req: any)=>req.category === "Financial" || req.category === "Finance" || req.category === "Commercial")&&<div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Category</TableHead>
                        <TableHead>Requirement</TableHead>
                        <TableHead className="w-[80px]">Option</TableHead>
                        <TableHead className="w-[25%]">Response</TableHead>
                        <TableHead className="w-[20%]">Remarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requirements.map((req: any) => (
                        <TableRow key={req.id} data-testid={`row-sheet-req-${req.id}`}>
                          <TableCell className="text-sm py-2">
                            <Badge variant="outline" className="text-xs">{req.category}</Badge>
                          </TableCell>
                          <TableCell className="text-sm py-2">{req.question}</TableCell>
                          <TableCell className="text-sm text-muted-foreground py-2">{req.qvoption}</TableCell>
                          <TableCell className="text-sm py-2">{req.response || "-"}</TableCell>
                          <TableCell className="text-sm py-2 text-muted-foreground">{req.remarks || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {techAttachments.length > 0 && (
                <div className="mt-3 pt-2 border-t">
                  <span className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Paperclip className="h-3.5 w-3.5" />
                    Technical Attachments
                  </span>
                  <div className="overflow-x-auto">
                    <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {techAttachments.map((att: any) => (
                          <TableRow key={att.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {att.attach_path ? (
                                  <a
                                    href={`/api/dbo/bids/response/attachments/${att.id}/download`}
                                    download
                                    className="font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {att.attach_name}
                                  </a>
                                ) : (
                                  <span className="text-sm">{att.attach_name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(att.created_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">
                  <DollarSign className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-sm font-semibold">Financial Bid</h4>
              </div>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No line items defined.</p>
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
                        <TableHead className="w-[60px]">Curr.</TableHead>
                        <TableHead>Promised Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any) => (
                        <TableRow key={line.id} data-testid={`row-sheet-line-${line.id}`}>
                          <TableCell className="py-2">
                            <div className="text-sm font-medium">{line.description}</div>
                            {line.product_category && <div className="text-xs text-muted-foreground">{line.product_category}</div>}
                          </TableCell>
                          <TableCell className="text-sm text-right font-mono py-2">{line.quantity}</TableCell>
                          <TableCell className="text-sm py-2">{line.uom || "-"}</TableCell>
                          <TableCell className="text-sm text-right font-mono py-2">
                            {line.bidprice != null ? formatCurrency(line.bidprice, line.currency || currency) : "-"}
                          </TableCell>
                          <TableCell className="text-sm text-right font-mono py-2">
                            {line.discprice != null ? formatCurrency(line.discprice, line.currency || currency) : "-"}
                          </TableCell>
                          <TableCell className="text-sm py-2">{line.rate ? line.rate + "%" : "-"}</TableCell>
                           <TableCell className="text-sm py-2">
                             {line.rate ? (
                               resp?.tax_included === "Yes" ? (
                                 formatCurrency(
                                   (Math.round(((Number(line.bidprice) || 0) * (Number(line.quantity) || 0)) / (1 - (Number(line.rate) || 0) / 100)) * (Number(line.rate) || 0)) / 100,
                                   line.currency || currency
                                 )
                               ) : (
                                 formatCurrency(
                                   ((Number(line.bidprice) || 0) * (Number(line.quantity) || 0) - (Number(line.discprice) || 0) * (Number(line.quantity) || 0)) * ((Number(line.rate) || 0) / 100),
                                   line.currency || currency
                                 )
                               )
                             ) : "-"}
                           </TableCell>
                          <TableCell className="text-sm py-2">{line.currency || currency}</TableCell>
                          <TableCell className="text-sm py-2">
                            {line.promised_date ? formatDate(line.promised_date) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-3 flex flex-col items-end gap-1 text-sm">
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
                  <span className="w-32 text-right font-mono">{formatCurrency(resp?.tax_amount ?? 0, currency)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Net Total Amount:</span>
                  <span className="font-semibold w-32 text-right font-mono">{formatCurrency(grossTotal, currency)}</span>
                </div>
                {amountInWords && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-medium">In Words:</span>
                    <span className="text-muted-foreground">{amountInWords}</span>
                  </div>
                )}
              </div>

              {finAttachments.length > 0 && (
                <div className="mt-3 pt-2 border-t">
                  <span className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Paperclip className="h-3.5 w-3.5" />
                    Financial Attachments
                  </span>
                  <div className="overflow-x-auto">
                    <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {finAttachments.map((att: any) => (
                          <TableRow key={att.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {att.attach_path ? (
                                  <a
                                    onClick={() => handleDownloadDocument(att, `/api/dbo/bids/response/attachments/${att.id}/download`)}
                                    className="font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {att.attach_name}
                                  </a>
                                ) : (
                                  <span className="text-sm">{att.attach_name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{att.attach_desc || "-"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(att.created_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
