import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import { ViewChecklistButton } from "@/components/view-checklist-button";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  DollarSign, FileText,
  Gavel,
  Mail, MapPin,
  Package,
  Send,
  Shield,
  User,
  Users,
  XCircle
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

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

const awardStatusConfig: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  Approved: { icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Awarded: { icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  Rejected: { icon: XCircle, className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  Pending: { icon: Clock, className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  "Pending Approval": { icon: Clock, className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  "Review Committee": { icon: Users, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  Draft: { icon: AlertCircle, className: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
};

function getStatusConfig(status: string) {
  return awardStatusConfig[status] || awardStatusConfig.Draft;
}

export default function BidAwardDetail({ id }: { id: string }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [awardNotes, setAwardNotes] = useState("");
  const [pendingAwardId, setPendingAwardId] = useState<number | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveComments, setApproveComments] = useState("");
  const [approveAction, setApproveAction] = useState<"Approved" | "Rejected">("Approved");
  const [approveAwardId, setApproveAwardId] = useState<number | null>(null);
  const [approveTaskId, setApproveTaskId] = useState<string>("");
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [committeeDialogOpen, setCommitteeDialogOpen] = useState(false);
  const [committeeAction, setCommitteeAction] = useState<"accept" | "reject">("accept");
  const [committeeAwardId, setCommitteeAwardId] = useState<number | null>(null);

  const authData = localStorage.getItem("prokraya-auth");
  const parsedAuth = authData ? JSON.parse(authData) : null;
  const currentUserName = parsedAuth?.userNameId || parsedAuth?.userId || null;
  const currentUserRoles: string[] = parsedAuth?.roles || [];

  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/dbo/bids/${id}/awards`],
  });

  const isCommitteeUser = (data?.committeeApprovers || []).some(
    (member: any) =>
      (member.user_name || "").toLowerCase() === currentUserName?.toLowerCase()
  );

  const { data: responses } = useQuery<any[]>({
    queryKey: ['/api/dbo/bids', id, 'responses'],
    enabled: !!data?.bid,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${id}/awards`] });
    queryClient.invalidateQueries({ queryKey: ['/api/dbo/bids', id, 'responses'] });
    queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${id}`] });
  };

  const submitMutation = useMutation({
    mutationFn: async ({ awardId, notes }: { awardId: number; notes: string }) => {
      const res = await apiRequest("POST", `/api/dbo/bids/awards/${awardId}/submit`, { awardNotes: notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Award submitted for approval successfully" });
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      setSubmitDialogOpen(false);
      setAwardNotes("");
      setPendingAwardId(null);
      navigate(`/app/bids/${id}/evaluate`);
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err?.message || "Something went wrong", variant: "destructive" });
    },
  });

  const processApprovalMutation = useMutation({
    mutationFn: async ({ taskId, result, comments, bidAwardId }: { taskId: string; result: string; comments: string; bidAwardId: number }) => {
      const res = await apiRequest("POST", `/api/dbo/bids/awards/process-approval`, { taskId, result, comments, bidAwardId: String(bidAwardId) });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data?.message || "Successfully processed your request." });
      queryClient.invalidateQueries({ queryKey: ['/api/dbo/bids'] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      setApproveDialogOpen(false);
      setApproveComments("");
      navigate('/app/bids');
    },
    onError: (err: any) => {
      toast({ title: "Processing failed", description: err?.message || "Something went wrong", variant: "destructive" });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (awardId: number) => {
      const res = await apiRequest("POST", `/api/dbo/bids/awards/${awardId}/accept`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data?.message || "Acceptance recorded." });
      queryClient.invalidateQueries({ queryKey: ['/api/dbo/bids'] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      navigate('/app/bids');
    },
    onError: (err: any) => {
      toast({ title: "Accept failed", description: err?.message || "Something went wrong", variant: "destructive" });
    },
  });

  const rejectAwardMutation = useMutation({
    mutationFn: async (awardId: number) => {
      const res = await apiRequest("POST", `/api/dbo/bids/awards/${awardId}/reject`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: data?.message || "Award rejected." });
      queryClient.invalidateQueries({ queryKey: ['/api/dbo/bids'] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/all-tasks"] });
      navigate('/app/bids');
    },
    onError: (err: any) => {
      toast({ title: "Reject failed", description: err?.message || "Something went wrong", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Link href={`/app/bids/${id}/evaluate`}>
              <Button variant="ghost" size="icon" data-testid="button-back-evaluate">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Award Details</h1>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="font-medium" data-testid="text-award-error">Failed to load award details</p>
              <p className="text-sm text-muted-foreground mt-1">Please try again later.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { bid, awards } = data;
  const currency = bid?.currency || "AED";

  const bidType = bid?.type || "RFQ";
  const typeConfig = bidTypeLabels[bidType] || bidTypeLabels["RFQ"];
  const sConfig = statusConfig[bid?.status] || statusConfig["Draft"];
  const bidNumber = bid?.bid_number || bid?.attribute_4 || `BID-${bid?.id || id}`;

  const awardedSupplierIds = new Set(awards.map((a: any) => a.supplier_id));
  const otherQuotes = (responses || []).filter((r: any) => !awardedSupplierIds.has(r.supplier_id));

  return (
    <div className="p-4 space-y-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap" data-testid="breadcrumb-award">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={`/app/bids/${id}/evaluate`}>
            <Button variant="ghost" size="icon" data-testid="button-back-evaluate">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <Gavel className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold" data-testid="text-award-title">{bidNumber}</h1>
              <Badge variant="outline" className={`border-0 ${typeConfig.className}`} data-testid="badge-bid-type">
                {typeConfig.full}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-bid-title-sub">{bid?.bid_title || ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {awards.some((a: any) => (a.status || "Draft") === "Draft") && !isCommitteeUser && (
            <Button
              size="sm"
              data-testid="button-submit-for-approval"
              onClick={() => {
                const draftAward = awards.find((a: any) => (a.status || "Draft") === "Draft");
                if (draftAward) {
                  setPendingAwardId(draftAward.id);
                  setAwardNotes("");
                  setSubmitDialogOpen(true);
                }
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              Submit for Approval
            </Button>
          )}

          {awards.some((a: any) => a.status === "Pending Approval" && a.attribute_12) && (() => {
            const pendingAward = awards.find((a: any) => a.status === "Pending Approval" && a.attribute_12);
            if (!pendingAward) return null;
            const taskId = pendingAward.attribute_12;
            const currentApprover = pendingAward.approvers_list?.split(",").map((s: string) => s.trim()).filter(Boolean) || [];
            const isApprover = currentApprover.some((approver: string) =>
              approver.toLowerCase() === currentUserName?.toLowerCase()
            ) || currentUserRoles.some((role: string) =>
              currentApprover.some((approver: string) => approver.toLowerCase() === role.toLowerCase())
            ) || sessionStorage.getItem("currentTaskId") === taskId;

            if (!isApprover) return null;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="button-approve-dropdown">
                    Approve <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    data-testid="menu-item-approve"
                    onClick={() => {
                      setApproveAwardId(pendingAward.id);
                      setApproveTaskId(taskId);
                      resolveApprovalChecklistAvailability("Bid").then((available) => {
                        if (available) {
                          setChecklistDialogOpen(true);
                        } else {
                          setApproveAction("Approved");
                          setApproveComments("");
                          setApproveDialogOpen(true);
                        }
                      });
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                    Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="menu-item-reject"
                    onClick={() => {
                      setApproveAction("Rejected");
                      setApproveAwardId(pendingAward.id);
                      setApproveTaskId(taskId);
                      setApproveComments("");
                      setApproveDialogOpen(true);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2 text-red-600" />
                    Reject
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}

          {awards.some((a: any) => a.status === "Review Committee") && (() => {
            const reviewAward = awards.find((a: any) => a.status === "Review Committee");
            if (!reviewAward) return null;
            const committeeApprovers = data?.committeeApprovers || [];
            const myApprover = committeeApprovers.find((ca: any) =>
              (ca.user_name || "").toLowerCase() === currentUserName?.toLowerCase()
            );
            if (!myApprover || myApprover.bidaccepted === "Y") return null;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="button-accept-dropdown">
                    Accept <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    data-testid="menu-item-accept"
                    onClick={() => {
                      setCommitteeAction("accept");
                      setCommitteeAwardId(reviewAward.id);
                      setCommitteeDialogOpen(true);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                    Accept
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="menu-item-reject-committee"
                    onClick={() => {
                      setCommitteeAction("reject");
                      setCommitteeAwardId(reviewAward.id);
                      setCommitteeDialogOpen(true);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2 text-red-600" />
                    Reject
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}

          {bid?.status === "Awarded" && (
            <ViewChecklistButton moduleName="Bid" refNumber={bidNumber} />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {bid?.description && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground max-w-2xl">{bid.description}</p>
              <Separator className="mt-4" />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <HeaderInfoItem label="Start Date" value={formatDateTime(bid?.startdate)} icon={Calendar} testId="text-award-start-date" />
            <HeaderInfoItem label="End Date" value={formatDateTime(bid?.enddate)} icon={Calendar} testId="text-award-end-date" />
            <HeaderInfoItem label="Currency" value={bid?.currency} icon={DollarSign} testId="text-award-currency" />
            <HeaderInfoItem label="Bid Style" value={bid?.bid_style || "-"} icon={Shield} testId="text-award-bid-style" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <HeaderInfoItem label="Payment Terms" value={bid?.paymentterms} icon={CreditCard} testId="text-award-payment-terms" />
            <HeaderInfoItem label="Delivery Location" value={bid?.delivertto_location_name || bid?.shiptoaddress} icon={MapPin} testId="text-award-delivery-location" />
            {bid?.pr_number && (
              <HeaderInfoItem label="Linked PR" value={bid.pr_number} icon={FileText} testId="text-award-linked-pr" />
            )}
            <HeaderInfoItem label="Total Awards" value={String(awards.length)} icon={Gavel} testId="text-total-awards" />
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <User className="h-3 w-3" />
                Buyer
              </p>
              <p className="text-sm font-medium" data-testid="text-award-buyer-name">{bid?.buyer_name || bid?.buyer || "-"}</p>
              {bid?.buyer_email && (
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
              <p className="text-sm font-medium" data-testid="text-award-requestor-name">{bid?.requestor_name || "-"}</p>
              {bid?.requestor_email && (
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
              <p className="text-sm font-medium" data-testid="text-award-department">{bid?.department_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                <Users className="h-3 w-3" />
                Responses / Invited
              </p>
              <p className="text-sm font-medium" data-testid="text-award-responses-count">
                {bid?.bid_responses || 0} / {bid?.no_invited_supps || 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {(data?.committeeApprovers || []).length > 0 && (
        <Card data-testid="card-committee-members">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Review Committee Members
              <Badge variant="outline" className="ml-auto text-xs" data-testid="badge-committee-count">
                {(data.committeeApprovers as any[]).filter((ca: any) => ca.bidaccepted === "Y").length} / {data.committeeApprovers.length} Accepted
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="overflow-x-auto">
              <div className="flex items-start min-w-max py-2">
                {(data.committeeApprovers as any[])
                  .sort((a, b) => {
                    const getPriority = (val: string) => {
                      if (val === "Y") return 0;
                      if (val === "R") return 2;
                      return 1;
                    };

                    return getPriority(a.bidaccepted) - getPriority(b.bidaccepted);
                  }).map((ca: any, index: number, arr: any[]) => {
                    const isAccepted = ca.bidaccepted === "Y";
                    const isRejected = ca.bidaccepted === "R";
                    const isPending = !isAccepted && !isRejected;

                    const circleColor = isAccepted ? "bg-emerald-500 border-emerald-500 text-white"
                      : isRejected ? "bg-red-500 border-red-500 text-white"
                        : "bg-muted border-muted-foreground/30 text-muted-foreground";

                    const dotColor = isAccepted ? "bg-emerald-500"
                      : isRejected ? "bg-red-500"
                        : "bg-orange-500";

                    const statusLabel = isAccepted ? "Accepted"
                      : isRejected ? "Rejected"
                        : "Pending";

                    return (
                      <div key={ca.id} className="flex items-start" data-testid={`committee-step-${ca.id}`}>
                        <div className="flex flex-col items-center min-w-[140px] max-w-[160px]">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${circleColor}`}>
                            {isPending ? <Clock className="h-4 w-4" /> :
                              isAccepted ? <CheckCircle2 className="h-4 w-4" /> :
                                <XCircle className="h-4 w-4" />}
                          </div>
                          <div className="mt-1.5 text-center px-1">
                            <p className="text-xs font-medium truncate max-w-[140px]" title={ca.user_name || "-"} data-testid={`text-committee-name-${ca.id}`}>
                              {ca.user_name || "-"}
                            </p>
                            <p className="text-[10px] text-muted-foreground" data-testid={`text-committee-role-${ca.id}`}>
                              {ca.is_head === "Y" ? "Head" : "Member"}
                            </p>
                            <div className="flex items-center justify-center gap-1 mt-0.5">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
                              <span className="text-xs" data-testid={`badge-committee-status-${ca.id}`}>{statusLabel}</span>
                            </div>
                          </div>
                        </div>
                        {index < arr.length - 1 && (
                          <div className="flex items-center h-8">
                            <div className={`w-10 border-t-2 border-dashed ${isAccepted ? "border-emerald-500" : "border-muted-foreground/30"}`} />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(() => {
        const approvalHistoryMap = data?.approvalHistoryMap || {};
        const hasHistory = Object.keys(approvalHistoryMap).length > 0;
        if (!hasHistory) return null;

        return (
          <Accordion type="single" collapsible defaultValue="approval-history">
            <AccordionItem value="approval-history" className="border rounded-lg">
              <AccordionTrigger className="px-4 py-2 hover:no-underline" data-testid="trigger-approval-history">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Approval History</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                {awards.filter((a: any) => approvalHistoryMap[a.id]).map((award: any) => {
                  const steps: any[] = approvalHistoryMap[award.id] || [];
                  const approversList = award.approvers_list
                    ? award.approvers_list.split(",").map((s: string) => s.trim()).filter(Boolean)
                    : [];

                  const timelineItems = approversList.map((approver: string, idx: number) => {
                    const step = steps.find((s: any) => s.step_order === idx + 1);
                    if (step && step.status === "Completed") {
                      return {
                        name: step.action_by || approver,
                        status: step.result === "Approve" ? "Approved" : step.result === "Reject" ? "Rejected" : step.result || "Pending",
                        date: step.action_date,
                        comments: step.remarks,
                      };
                    }
                    const readyStep = steps.find((s: any) => s.step_order === idx + 1 && s.status === "Ready");
                    return {
                      name: readyStep?.current_assignee || approver,
                      status: "Pending" as const,
                    };
                  });

                  if (timelineItems.length === 0 && steps.length > 0) {
                    steps.forEach((step: any) => {
                      timelineItems.push({
                        name: step.action_by || step.current_assignee || "Approver",
                        status: step.status === "Completed"
                          ? (step.result === "Approve" ? "Approved" : step.result === "Reject" ? "Rejected" : step.result || "Completed")
                          : "Pending",
                        date: step.action_date,
                        comments: step.remarks,
                      });
                    });
                  }

                  return (
                    <div key={award.id} className="mb-4 last:mb-0" data-testid={`approval-history-award-${award.id}`}>
                      {awards.filter((a: any) => approvalHistoryMap[a.id]).length > 1 && (
                        <p className="text-xs text-muted-foreground mb-2 font-medium">
                          Award #{award.id} — {award.supplier_name || "Supplier"}
                        </p>
                      )}
                      <div className="overflow-x-auto">
                        <div className="flex items-start min-w-max">
                          {timelineItems.map((item: any, index: number, arr: any[]) => {
                            const isApproved = item.status === "Approved";
                            const isRejected = item.status === "Rejected";
                            const isPending = item.status === "Pending";

                            const statusColor = isApproved ? "bg-emerald-500 border-emerald-500 text-white"
                              : isRejected ? "bg-red-500 border-red-500 text-white"
                                : "bg-muted border-muted-foreground/30 text-muted-foreground";

                            const dotColor = isApproved ? "bg-emerald-500"
                              : isRejected ? "bg-red-500"
                                : "bg-orange-500";

                            const statusLabel = isApproved ? "Approved"
                              : isRejected ? "Rejected"
                                : "Pending";

                            return (
                              <div key={index} className="flex items-start" data-testid={`approval-step-${index}`}>
                                <div className="flex flex-col items-center min-w-[140px] max-w-[160px]">
                                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${statusColor}`}>
                                    {isPending ? <Clock className="h-4 w-4" /> :
                                      isApproved ? <CheckCircle2 className="h-4 w-4" /> :
                                        <XCircle className="h-4 w-4" />}
                                  </div>
                                  <div className="mt-1.5 text-center px-1">
                                    <p className="text-xs font-medium truncate max-w-[140px]" title={item.name}>
                                      {item.name}
                                    </p>
                                    <div className="flex items-center justify-center gap-1 mt-0.5">
                                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                      <span className="text-xs">{statusLabel}</span>
                                    </div>
                                    {item.date && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {new Date(item.date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                      </p>
                                    )}
                                    {item.comments && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 break-all" title={item.comments}>
                                        {item.comments}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {index < arr.length - 1 && (
                                  <div className="flex items-center h-8">
                                    <div className={`w-10 border-t-2 border-dashed ${isApproved ? "border-emerald-500" : "border-muted-foreground/30"}`} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          {awards.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Gavel className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="font-medium" data-testid="text-no-awards">No Awards Created</p>
                <p className="text-sm text-muted-foreground mt-1">Award recommendations will appear here once created.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {awards.map((award: any) => (
                <AwardCard key={award.id} award={award} currency={currency} />
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <h3 className="text-sm font-semibold mb-3" data-testid="text-other-quotes-title">Other Supplier Quotes</h3>
          <div className="space-y-3">
            {otherQuotes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No other quotes available.</p>
            ) : (
              otherQuotes.map((resp: any) => {
                const respTotal = parseFloat(resp.bidtotal) || 0;
                const respDisc = parseFloat(resp.biddisc) || 0;
                const respTax = parseFloat(resp.tax_amount) || 0;
                const respGross = parseFloat(resp.grosstotal) || 0;
                return (
                  <Card key={resp.id} data-testid={`card-other-quote-${resp.id}`}>
                    <CardContent className="p-3 space-y-1.5">
                      <p className="text-sm font-semibold text-primary" data-testid={`text-other-supplier-${resp.id}`}>
                        {resp.supplier_name || "-"}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid={`text-other-resp-id-${resp.id}`}>
                        Bid Resp: <span className="font-medium text-foreground">{resp.id}</span>
                      </p>
                      <div className="space-y-0.5 pt-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Bid Total:</span>
                          <span className="font-medium" data-testid={`text-other-total-${resp.id}`}>{formatCurrency(respTotal, currency)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Discount:</span>
                          <span data-testid={`text-other-disc-${resp.id}`}>{formatCurrency(respDisc, currency)}</span>
                        </div>
                        {respTax > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Tax Amount:</span>
                            <span className="font-medium" data-testid={`text-other-tax-${resp.id}`}>{formatCurrency(respTax, currency)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs font-medium text-green-600 dark:text-green-400">
                          <span>Gross Total:</span>
                          <span data-testid={`text-other-gross-${resp.id}`}>{formatCurrency(respGross, currency)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>

      <Dialog open={submitDialogOpen} onOpenChange={(open) => { if (!submitMutation.isPending) setSubmitDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Award for Approval</DialogTitle>
            <DialogDescription>
              Please add your notes before submitting this award for approval. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="award-notes">Award Notes</Label>
            <Textarea
              id="award-notes"
              data-testid="textarea-award-notes"
              placeholder="Enter award notes or justification..."
              value={awardNotes}
              onChange={(e) => setAwardNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              data-testid="button-cancel-submit"
              disabled={submitMutation.isPending}
              onClick={() => setSubmitDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-submit"
              disabled={submitMutation.isPending || !awardNotes.trim()}
              onClick={() => {
                if (pendingAwardId && awardNotes.trim()) {
                  submitMutation.mutate({ awardId: pendingAwardId, notes: awardNotes.trim() });
                }
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              {submitMutation.isPending ? "Submitting..." : "Confirm & Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveDialogOpen} onOpenChange={(open) => { if (!processApprovalMutation.isPending) setApproveDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{approveAction === "Approved" ? "Approve" : "Reject"} Bid Award</DialogTitle>
            <DialogDescription>
              Are you sure you want to {approveAction === "Approved" ? "approve" : "reject"} this award? Please provide your comments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="approve-comments">Comments</Label>
            <Textarea
              id="approve-comments"
              data-testid="textarea-approve-comments"
              placeholder="Enter your comments..."
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              data-testid="button-cancel-approve"
              disabled={processApprovalMutation.isPending}
              onClick={() => setApproveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-approve"
              variant={approveAction === "Rejected" ? "destructive" : "default"}
              disabled={processApprovalMutation.isPending || !approveComments.trim()}
              onClick={() => {
                if (approveAwardId && approveComments.trim()) {
                  processApprovalMutation.mutate({
                    taskId: approveTaskId,
                    result: approveAction,
                    comments: approveComments.trim(),
                    bidAwardId: approveAwardId,
                  });
                }
              }}
            >
              {approveAction === "Approved" ? (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              {processApprovalMutation.isPending
                ? "Processing..."
                : approveAction === "Approved" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApprovalChecklistDialog
        open={checklistDialogOpen}
        onOpenChange={setChecklistDialogOpen}
        moduleName="Bid"
        title="Bid Award Approval Checklist"
        refNumber={bidNumber}
        approving={processApprovalMutation.isPending}
        onApprove={(comments) => {
          setChecklistDialogOpen(false);
          if (approveAwardId) {
            processApprovalMutation.mutate({
              taskId: approveTaskId,
              result: "Approved",
              comments,
              bidAwardId: approveAwardId,
            });
          }
        }}
      />

      <Dialog open={committeeDialogOpen} onOpenChange={(open) => {
        if (!acceptMutation.isPending && !rejectAwardMutation.isPending) setCommitteeDialogOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{committeeAction === "accept" ? "Accept" : "Reject"} Bid Award</DialogTitle>
            <DialogDescription>
              Are you sure you want to {committeeAction} this bid award?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCommitteeDialogOpen(false)}
              disabled={acceptMutation.isPending || rejectAwardMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={committeeAction === "reject" ? "destructive" : "default"}
              data-testid="button-confirm-committee-action"
              disabled={acceptMutation.isPending || rejectAwardMutation.isPending}
              onClick={() => {
                if (committeeAwardId === null) return;
                if (committeeAction === "accept") {
                  acceptMutation.mutate(committeeAwardId);
                } else {
                  rejectAwardMutation.mutate(committeeAwardId);
                }
                setCommitteeDialogOpen(false);
              }}
            >
              {committeeAction === "accept" ? (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              {acceptMutation.isPending || rejectAwardMutation.isPending
                ? "Processing..."
                : committeeAction === "accept" ? "Confirm Accept" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AwardCard({ award, currency }: { award: any; currency: string }) {
  const statusCfg = getStatusConfig(award.status);
  const lines = award.lines || [];
  const grossTotal = parseFloat(award.bidtotal) || 0;
  const discount = parseFloat(award.biddisc) || 0;
  const taxAmount = parseFloat(award.tax_amount) || 0;
  const netTotal = parseFloat(award.grosstotal) || 0;

  return (
    <Card data-testid={`award-item-${award.id}`}>
      <CardContent className="p-4 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold" data-testid={`text-award-id-${award.id}`}>
            Award #{award.id}
          </span>
          <Badge variant="secondary" className={`${statusCfg.className} text-xs`} data-testid={`badge-status-${award.id}`}>
            {award.status || "Draft"}
          </Badge>
          {award.supplier_name && (
            <span className="text-sm text-muted-foreground" data-testid={`text-award-vendor-${award.id}`}>
              {award.supplier_name}
            </span>
          )}
          <span className="ml-auto text-sm font-semibold" data-testid={`text-award-total-${award.id}`}>
            {formatCurrency(netTotal, currency)}
          </span>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-sm font-semibold" data-testid={`info-supplier-name-${award.id}`}>{award.supplier_name || "-"}</p>
            {award.supplier_contact && (
              <p className="text-sm text-muted-foreground" data-testid={`info-contact-${award.id}`}>{award.supplier_contact}</p>
            )}
            {award.supplier_contact_no && (
              <p className="text-sm text-muted-foreground" data-testid={`info-phone-${award.id}`}>{award.supplier_contact_no}</p>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Financial Summary
            </h3>
            <div className="space-y-2">
              <InfoRow label="Gross Total" value={formatCurrency(grossTotal, currency)} testId={`info-gross-${award.id}`} />
              <InfoRow label="Discount" value={formatCurrency(discount, currency)} testId={`info-discount-${award.id}`} />
              <InfoRow label="Tax Amount" value={formatCurrency(taxAmount, currency)} testId={`info-tax-amount-${award.id}`} />
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Net Total</span>
                <span className="text-sm font-bold" data-testid={`info-net-total-${award.id}`}>{formatCurrency(netTotal, currency)}</span>
              </div>
              {award.amount_in_words && (
                <p className="text-xs text-muted-foreground italic" data-testid={`info-amount-words-${award.id}`}>
                  {award.amount_in_words}
                </p>
              )}
            </div>
          </div>
        </div>

        {lines.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-muted-foreground" />
              Quote Details ({lines.length})
            </h3>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Bid Qty</TableHead>
                    <TableHead className="text-right">Awarded Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Disc Price</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line: any) => {
                    const qty = parseFloat(line.quantity) || 0;
                    const awardedQty = parseFloat(line.awarded_quantity) || parseFloat(line.quantity) || 0;
                    const price = parseFloat(line.bidprice) || 0;
                    const discPrice = parseFloat(line.discprice) || 0;
                    return (
                      <TableRow key={line.id} data-testid={`row-line-${line.id}`}>
                        <TableCell className="text-sm font-medium pl-4 py-2" data-testid={`text-line-desc-${line.id}`}>
                          {line.description || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground py-2" data-testid={`text-line-cat-${line.id}`}>
                          {line.product_category || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-right py-2" data-testid={`text-line-qty-${line.id}`}>
                          {qty}
                        </TableCell>
                        <TableCell className="text-sm text-right py-2" data-testid={`text-line-awarded-qty-${line.id}`}>
                          {awardedQty}
                        </TableCell>
                        <TableCell className="text-sm text-right py-2" data-testid={`text-line-price-${line.id}`}>
                          {formatCurrency(price, line.currency || currency)}
                        </TableCell>
                        <TableCell className="text-sm text-right py-2" data-testid={`text-line-disc-price-${line.id}`}>
                          {formatCurrency(discPrice, line.currency || currency)}
                        </TableCell>
                        <TableCell className="text-sm text-right py-2" data-testid={`text-line-tax-rate-${line.id}`}>
                          {line.rate || 0}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HeaderInfoItem({ label, value, icon: Icon, testId }: { label: string; value: string | null | undefined; icon?: any; testId?: string }) {
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

function InfoRow({ label, value, icon, testId }: { label: string; value: string | null | undefined; icon?: React.ReactNode; testId?: string }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-sm text-right truncate" data-testid={testId}>{value || "-"}</span>
    </div>
  );
}
