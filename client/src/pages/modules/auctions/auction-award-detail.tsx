import { ApprovalChecklistDialog } from "@/components/approval-checklist-dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ViewChecklistButton } from "@/components/view-checklist-button";
import { resolveApprovalChecklistAvailability } from "@/hooks/use-approval-checklist";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ArrowLeft, CheckCircle2, Clock, Gavel,
  Loader2, Mail, Phone, RefreshCw, Send, Trophy, Users, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";

// ─── Types ──────────────────────────────────────────────────────────────────

type AwardColumn = {
  columnId?: string | number;
  columnKey?: string;
  columnValue?: string | number | null;
  suppRspColumnValue?: string | number | null;
};

type AwardRow = {
  auRowId?: number;
  columnAwardValues?: AwardColumn[];
  lineItemTotal?: string | number | null;
  lineItemBasePrice?: string | number | null;
};

type AuctionSuppAwardEvent = {
  id?: number;
  status?: string;
  supplierId?: number;
  supplierName?: string;
  supplierContact?: string;
  supplierContactNo?: string;
  auctionTotal?: string | number | null;
  awardComments?: string;
  attribute11?: string | null;
  attribute12?: string | null;
  approversList?: string | null;
  createdBy?: string;
  templateAwardRows?: AwardRow[];
};

type AuctionEvent = {
  id?: number;
  name?: string;
  auctionType?: string;
  auctionStrategy?: string;
  allotmentType?: string;
  currency?: string;
};

type SupplierResponse = {
  supplierId?: number;
  supplierName?: string;
  auctionTotal?: string | number | null;
};

type AwardDetailsResponse = {
  auctionSuppAwardEvent?: AuctionSuppAwardEvent;
  auction_supp_award_event?: AuctionSuppAwardEvent;
  auctionEvent?: AuctionEvent;
  auction_event?: AuctionEvent;
  auctionSuppResponseEventList?: SupplierResponse[];
  auction_supp_response_event_list?: SupplierResponse[];
};


type ApprovalHistoryItem = {
  id: number;
  object_id: string;
  approver_id: string | null;
  approver_name: string | null;
  email?: string | null;
  designation?: string | null;
  status: string | null;
  comments: string | null;
  approved_date: string | null;
  requested_date: string | null;
  attribute_1: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function messageOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "message" in v)
    return String((v as { message?: unknown }).message ?? "");
  return "";
}

function asText(v: unknown): string {
  return v == null ? "" : String(v);
}

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return d; }
}

function fmtDateTime(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return d; }
}

function formatApproverDisplayName(approver: string): string {
  const trimmed = approver.trim();
  if (ROLE_NAMES.some((r) => trimmed.toUpperCase() === r)) {
    return `Any User in ${trimmed} Role`;
  }
  return trimmed;
}

function valueForQuoteCell(row: AwardRow, col: AwardColumn | undefined): string {
  const key = String(col?.columnKey ?? "").trim().toLowerCase();
  const suppVal = col?.suppRspColumnValue;
  const direct = (suppVal != null && String(suppVal).trim() !== "")
    ? suppVal
    : col?.columnValue;
  if (direct != null && String(direct).trim() !== "") return String(direct);
  if (key.includes("price") || key.includes("amount") || key.includes("rate")) {
    const base = Number(row.lineItemBasePrice);
    if (Number.isFinite(base) && base !== 0) return String(row.lineItemBasePrice);
    const total = Number(row.lineItemTotal);
    if (Number.isFinite(total) && total !== 0) return String(row.lineItemTotal);
  }
  if (key.includes("total")) {
    const n = Number(row.lineItemTotal);
    if (Number.isFinite(n)) return String(row.lineItemTotal);
  }
  return "";
}

const ROLE_NAMES = [
  "ROLE_PROCUREMENT_OFFICER", "ROLE_PROCUREMENT_MANAGER",
  "ROLE_FINANCE_MANAGER", "ROLE_FINANCE_OFFICER",
  "ROLE_DEPARTMENT_HEAD", "ROLE_SYSADMIN", "ROLE_SUPERADMIN", "ROLE_DEPARTMENT_USER",
];

const awardStatusConfig: Record<string, { color: string; dot: string }> = {
  Approved:         { color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  Awarded:          { color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  Rejected:         { color: "bg-red-100 text-red-700 border-red-200",             dot: "bg-red-500" },
  Pending:          { color: "bg-yellow-100 text-yellow-700 border-yellow-200",    dot: "bg-orange-500" },
  "Pending Approval":{ color: "bg-yellow-100 text-yellow-700 border-yellow-200",  dot: "bg-orange-500" },
  Draft:            { color: "bg-slate-100 text-slate-600 border-slate-200",       dot: "bg-slate-400" },
};

function statusBadge(status: string) {
  const cfg = awardStatusConfig[status] ?? awardStatusConfig.Draft;
  return (
    <Badge variant="outline" className={`border ${cfg.color} text-xs font-medium`}>
      {status || "Draft"}
    </Badge>
  );
}

// ─── Data normalisation ───────────────────────────────────────────────────────

function normalizeAwardDetails(raw: AwardDetailsResponse | null | undefined) {
  const src = (raw ?? {}) as Record<string, unknown>;
  const awardRaw =
    (src.auctionSuppAwardEvent as Record<string, unknown> | undefined) ??
    (src.auction_supp_award_event as Record<string, unknown> | undefined) ??
    src;
  const eventRaw =
    (src.auctionEvent as Record<string, unknown> | undefined) ??
    (src.auction_event as Record<string, unknown> | undefined) ??
    {};
  const responsesRaw =
    (src.auctionSuppResponseEventList as unknown[] | undefined) ??
    (src.auction_supp_response_event_list as unknown[] | undefined) ??
    [];

  const templateRowsRaw =
    (awardRaw.templateAwardRows as unknown[] | undefined) ??
    (awardRaw.template_award_rows as unknown[] | undefined) ?? [];

  const templateRows: AwardRow[] = templateRowsRaw.map((r) => {
    const rr = r as Record<string, unknown>;
    const colsRaw =
      (rr.columnAwardValues as unknown[] | undefined) ??
      (rr.column_award_values as unknown[] | undefined) ?? [];
    const cols: AwardColumn[] = colsRaw.map((c) => {
      const cc = c as Record<string, unknown>;
      return {
        ...(cc as unknown as AwardColumn),
        columnId: (cc.columnId ?? cc.column_id) as string | number | undefined,
        columnKey: String(cc.columnKey ?? cc.column_key ?? ""),
        columnValue: (cc.columnValue ?? cc.column_value) as string | number | null,
        suppRspColumnValue: (cc.suppRspColumnValue ?? cc.supp_rsp_column_value) as string | number | null,
      };
    });
    return {
      ...(rr as unknown as AwardRow),
      auRowId: Number(rr.auRowId ?? rr.au_row_id),
      lineItemTotal: (rr.lineItemTotal ?? rr.line_item_total) as string | number | null,
      lineItemBasePrice: (rr.lineItemBasePrice ?? rr.line_item_base_price) as string | number | null,
      columnAwardValues: cols,
    };
  });

  const award: AuctionSuppAwardEvent = {
    ...(awardRaw as unknown as AuctionSuppAwardEvent),
    id: Number(awardRaw.id),
    supplierId: Number(awardRaw.supplierId ?? awardRaw.supplier_id),
    supplierName: String(awardRaw.supplierName ?? awardRaw.supplier_name ?? "—"),
    supplierContact: String(awardRaw.supplierContact ?? awardRaw.supplier_contact ?? ""),
    supplierContactNo: String(awardRaw.supplierContactNo ?? awardRaw.supplier_contact_no ?? ""),
    auctionTotal: (awardRaw.auctionTotal ?? awardRaw.auction_total) as string | number | null,
    awardComments: String(awardRaw.awardComments ?? awardRaw.award_comments ?? ""),
    attribute11: String(awardRaw.attribute11 ?? awardRaw.attribute_11 ?? ""),
    attribute12: String(awardRaw.attribute12 ?? awardRaw.attribute_12 ?? ""),
    approversList: String(awardRaw.approversList ?? awardRaw.approvers_list ?? ""),
    status: String(awardRaw.status ?? ""),
    templateAwardRows: templateRows,
  };

  const event: AuctionEvent = {
    ...(eventRaw as unknown as AuctionEvent),
    id: Number(eventRaw.id),
    name: String(eventRaw.name ?? "NA"),
    auctionType: String(eventRaw.auctionType ?? eventRaw.auction_type ?? "—"),
    auctionStrategy: String(eventRaw.auctionStrategy ?? eventRaw.auction_strategy ?? "—"),
    allotmentType: String(eventRaw.allotmentType ?? eventRaw.allotment_type ?? "—"),
    currency: String(eventRaw.currency ?? "—"),
  };

  const responses: SupplierResponse[] = Array.isArray(responsesRaw)
    ? responsesRaw.map((s) => {
        const ss = s as Record<string, unknown>;
        return {
          supplierId: Number(ss.supplierId ?? ss.supplier_id),
          supplierName: String(ss.supplierName ?? ss.supplier_name ?? "—"),
          auctionTotal: (ss.auctionTotal ?? ss.auction_total) as string | number | null,
        };
      })
    : [];

  return { award, event, responses };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuctionAwardDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/app/auction-award-details/:awardNo");
  const [, setLocation] = useLocation();
  const awardNo = params?.awardNo ? Number(params.awardNo) : NaN;
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitNotes, setSubmitNotes] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalComments, setApprovalComments] = useState("");
  const [approvalAction, setApprovalAction] = useState<"Approved" | "Rejected">("Approved");
  const [isApprover, setIsApprover] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);

  const authData = typeof window !== "undefined" ? localStorage.getItem("prokraya-auth") : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const currentUserId = authParsed?.userId ?? null;

  // ── Award details ──
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/auctionEvents/getAwardDetails", awardNo],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/auctionEvents/getAwardDetails/${awardNo}`);
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as AwardDetailsResponse;
    },
    enabled: Number.isFinite(awardNo),
  });

  const normalized = useMemo(() => normalizeAwardDetails(data ?? null), [data]);
  const award = normalized.award;
  const event = normalized.event;
  const isLotBased = String(event?.allotmentType ?? "") === "Lot Based";
  const taskId = useMemo(() => String(award?.attribute12 ?? ""), [award?.attribute12]);

  // ── Current user profile ──
  const { data: currentUserProfile } = useQuery<{
    name?: string; user_name?: string; email_id?: string;
    roles?: { role_name: string }[];
  }>({
    queryKey: ["/api/profile", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return null;
      const res = await apiRequest("GET", `/api/profile/${encodeURIComponent(currentUserId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentUserId,
  });

  const userRoleNames = [
    ...(currentUserProfile?.roles?.map((r) => r.role_name) || []),
    authParsed?.userRole,
  ].filter(Boolean);

  // ── Task details (for approver check) ──
  const { data: taskDetails } = useQuery<{ assignee_: string | null; id_: string }>({
    queryKey: ["/api/workflow-engine/task", taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const res = await apiRequest("GET", `/api/workflow-engine/task/${encodeURIComponent(taskId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!taskId,
  });

  const isDraft = award?.status === "Draft";

  const { data: approvalHistory = [] } = useQuery<ApprovalHistoryItem[]>({
    queryKey: ["/api/auctionEvents/getAwardApprovalHistory", awardNo],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/auctionEvents/getAwardApprovalHistory/${awardNo}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Number.isFinite(awardNo) && !isDraft,
  });

  const canApprove = (() => {
    if (!taskId || !taskDetails) return false;
    if (userRoleNames.some((r) => r === "ROLE_SUPERADMIN" || r === "ROLE_SYSADMIN")) return true;
    const currentOwner = taskDetails.assignee_;
    if (!currentOwner) return false;
    if (ROLE_NAMES.some((role) => currentOwner.toUpperCase() === role))
      return userRoleNames.some((r) => r.toUpperCase() === currentOwner.toUpperCase());
    const ids = [
      currentUserId?.toString(),
      authParsed?.userId?.toString(),
      authParsed?.userName?.toLowerCase(),
      authParsed?.email?.toLowerCase(),
      authParsed?.userNameId?.toLowerCase(),
      currentUserProfile?.user_name?.toLowerCase(),
      currentUserProfile?.email_id?.toLowerCase(),
      currentUserProfile?.name?.toLowerCase(),
    ].filter(Boolean);
    return ids.includes(currentOwner.toLowerCase());
  })();

  useEffect(() => {
    if (!taskId || award?.status !== "Pending Approval") { setIsApprover(false); return; }
    const stored = sessionStorage.getItem("currentTaskId");
    if (!stored) { sessionStorage.setItem("currentTaskId", taskId); setIsApprover(true); }
    else setIsApprover(stored === taskId);
  }, [taskId, award?.status]);

  const quoteRows = award?.templateAwardRows ?? [];
  const quoteColumns = quoteRows[0]?.columnAwardValues ?? [];
  const otherSupplierQuotes = normalized.responses.filter(
    (s) => Number(s.supplierId) !== Number(award?.supplierId)
  );
  // ── Mutations ──
  const submitMut = useMutation({
    mutationFn: async () => {
      if (!awardNo) throw new Error("Award number is missing");
      if (!submitNotes.trim()) throw new Error("Please write award notes");
      const url = isLotBased
        ? `/api/auctionEvents/submitAwardApproval/${awardNo}`
        : `/api/auctionEvents/submitAwardApprovalPartial/${awardNo}`;
      const res = await apiRequest("POST", url, { awardNotes: submitNotes });
      let body: unknown = "";
      try { body = await res.json(); } catch { body = await res.text(); }
      const message = messageOf(body);
      if (!res.ok || /error/i.test(message)) throw new Error(message || "Submission failed");
      return message;
    },
    onSuccess: async (message) => {
      toast({ title: "Award submitted for approval", description: message || undefined });
      setSubmitOpen(false); setSubmitNotes("");
      await queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getAwardDetails", awardNo] });
    },
    onError: (e: Error) => toast({ title: "Submission failed", description: e.message, variant: "destructive" }),
  });

  const reRaiseMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/auctionEvents/reRaiseAward/${awardNo}`);
      let body: unknown = "";
      try { body = await res.json(); } catch { body = await res.text(); }
      const message = messageOf(body);
      if (!res.ok || /error/i.test(message)) throw new Error(message || "Re-raise failed");
      return message;
    },
    onSuccess: async (message) => {
      toast({ title: "Award re-raised", description: message || "Award reset to Draft. You can now submit for approval again." });
      await queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getAwardDetails", awardNo] });
    },
    onError: (e: Error) => toast({ title: "Re-raise failed", description: e.message, variant: "destructive" }),
  });

  const approvalMut = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("Task id not found for approval action");
      if (!approvalComments.trim()) throw new Error("Please write comments");
      const url = isLotBased
        ? `/api/auctionEvents/processAwardApproval/${taskId}`
        : `/api/auctionEvents/processAwardApprovalPartial/${taskId}`;
      const res = await apiRequest("POST", url, { result: approvalAction, comments: approvalComments, auctionAwardId: awardNo });
      let body: unknown = "";
      try { body = await res.json(); } catch { body = await res.text(); }
      const message = messageOf(body);
      if (!res.ok || /error/i.test(message)) throw new Error(message || "Approval processing failed");
      return message;
    },
    onSuccess: async (message) => {
      const isApprove = approvalAction === "Approved";
      toast({
        title: isApprove ? "Award Approved" : "Award Rejected",
        description: isApprove
          ? "Auction has been marked as Awarded."
          : "Award has been rejected. You can create a new award from the awards list.",
      });
      setApprovalOpen(false);
      setApprovalComments("");
      await queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getAwardDetails", awardNo] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getAwardApprovalHistory", awardNo] });
      if (event?.id) {
        setLocation(`/app/auction-details/${event.id}/awards`);
      }
    },
    onError: (e: Error) => toast({ title: "Action failed", description: e.message, variant: "destructive" }),
  });

  // ── Guards ──
  if (!Number.isFinite(awardNo)) return <p className="p-6">Invalid award reference.</p>;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-6 w-56" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={event?.id ? `/app/auction-details/${event.id}/awards` : "/app/auctions"}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">Award Details</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="font-medium">Failed to load award details</p>
            <p className="text-sm text-muted-foreground mt-1">Please try again later.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" asChild>
            <Link href={event?.id ? `/app/auction-details/${event.id}/awards` : "/app/auctions"}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <Gavel className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold">
                Auction #{String(event?.id ?? "—")} · Award #{String(award?.id ?? awardNo)}
              </h1>
              {statusBadge(award?.status ?? "Draft")}
            </div>
            <p className="text-xs text-muted-foreground">{String(event?.name ?? "")}</p>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {award?.status === "Draft" && (
            <Button size="sm" onClick={() => setSubmitOpen(true)}>
              <Send className="h-4 w-4 mr-2" />
              Submit for Approval
            </Button>
          )}
          {award?.status === "Pending Approval" && (isApprover || canApprove) && (
            <>
              <Button
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  resolveApprovalChecklistAvailability("Auction").then((available) => {
                    if (available) {
                      setChecklistDialogOpen(true);
                    } else {
                      setApprovalAction("Approved");
                      setTimeout(() => setApprovalOpen(true), 100);
                    }
                  });
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { setApprovalAction("Rejected"); setApprovalOpen(true); }}>
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </>
          )}
          {award?.status === "Rejected" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => reRaiseMut.mutate()}
              disabled={reRaiseMut.isPending}
            >
              {reRaiseMut.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
              Re-raise Award
            </Button>
          )}
          {award?.status === "Approved" && (
            <ViewChecklistButton
              moduleName="Auction"
              refNumber={`Auction #${String(event?.id ?? "—")} · Award #${String(award?.id ?? awardNo)}`}
            />
          )}
        </div>
      </div>
      <ApprovalChecklistDialog
        open={checklistDialogOpen}
        onOpenChange={setChecklistDialogOpen}
        moduleName="Auction"
        title="Auction Approval Checklist"
        refNumber={`Auction #${String(event?.id ?? "—")} · Award #${String(award?.id ?? awardNo)}`}
        approving={approvalMut.isPending}
        onApprove={() => {
          setChecklistDialogOpen(false);
          setApprovalAction("Approved");
          setTimeout(() => setApprovalOpen(true), 100);
        }}
      />

      {/* ── Auction info card ── */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Auction Type</p>
              <p className="font-medium">{String(event?.auctionType ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Strategy</p>
              <p className="font-medium">{String(event?.auctionStrategy ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Allotment</p>
              <p className="font-medium">{String(event?.allotmentType ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Currency</p>
              <p className="font-medium">{String(event?.currency ?? "—")}</p>
            </div>
          </div>
          {award?.awardComments && (
            <>
              <Separator className="my-3" />
              <div className="text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Award Comments</p>
                <p className="font-medium">{award.awardComments}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>


      {/* ── Rejected banner ── */}
      {award?.status === "Rejected" && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Award Rejected</p>
                <p className="text-xs text-red-600/80 dark:text-red-400/70">
                  This award was rejected. You can re-raise it or go back to create a new award.
                </p>
              </div>
            </div>
            {event?.id && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-100 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/30 shrink-0"
                onClick={() => setLocation(`/app/auction-details/${event.id}/awards`)}
              >
                Go to Awards List
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Awarded banner ── */}
      {award?.status === "Approved" && (
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Award Approved</p>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/70">
                  The auction has been successfully awarded.
                </p>
              </div>
            </div>
            {event?.id && (
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/30 shrink-0"
                onClick={() => setLocation(`/app/auction-details/${event.id}/awards`)}
              >
                View Awards List
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Main 2-col layout ── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* ── Selected Supplier Quote ── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Selected Supplier Quote
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Supplier info */}
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-semibold text-base">{String(award?.supplierName ?? "—")}</p>
                {award?.supplierContact && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {award.supplierContact}
                  </p>
                )}
                {award?.supplierContactNo && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {award.supplierContactNo}
                  </p>
                )}
              </div>

              {/* Quote table */}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {quoteColumns.map((c, i) => (
                        <TableHead key={`${String(c.columnId ?? "")}-${i}`}>
                          {String(c.columnKey ?? "").trim() || `Column ${i + 1}`}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quoteRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={quoteColumns.length || 1} className="text-center text-muted-foreground py-6">
                          No line items
                        </TableCell>
                      </TableRow>
                    ) : (
                      quoteRows.map((r, i) => (
                        <TableRow key={`${r.auRowId}-${i}`}>
                          {quoteColumns.map((hdr, j) => {
                            const rowCols = r.columnAwardValues ?? [];
                            // Prefer columnId match; fall back to index for backwards-compat
                            const c = hdr.columnId != null
                              ? rowCols.find((col) => String(col.columnId ?? "") === String(hdr.columnId ?? ""))
                              : rowCols[j];
                            const cell: AwardColumn | undefined = c
                              ? { ...c, columnKey: c.columnKey || hdr.columnKey }
                              : hdr;
                            return (
                              <TableCell key={`${i}-${j}`}>
                                {asText(valueForQuoteCell(r, cell)) || "—"}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Gross total */}
              <div className="flex justify-end">
                <div className="rounded-md border bg-muted/30 px-4 py-2 text-sm">
                  <span className="text-muted-foreground mr-2">Gross Total:</span>
                  <span className="font-bold text-base">
                    {money(award?.auctionTotal)} {String(event?.currency ?? "")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          {/* Other supplier quotes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Other Supplier Quotes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {otherSupplierQuotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other quotes</p>
              ) : (
                otherSupplierQuotes.map((s) => (
                  <div key={String(s.supplierId)} className="rounded-md border p-3">
                    <p className="text-sm font-semibold text-primary">{String(s.supplierName ?? "—")}</p>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-muted-foreground">Gross Total:</span>
                      <span className="font-medium">
                        {money(s.auctionTotal)} {String(event?.currency ?? "")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Approval History ── */}
      {!isDraft && (
        <Accordion type="single" collapsible defaultValue="approval-history">
          <AccordionItem value="approval-history" className="border rounded-lg">
            <AccordionTrigger className="px-4 py-2 hover:no-underline">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Approval History</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-0">
              <div className="overflow-x-auto w-full pb-4">
                <div className="flex items-start min-w-max">
                  {(() => {
                    type TimelineItem = {
                      name: string;
                      email?: string;
                      designation?: string;
                      status: "Approved" | "Rejected" | "More" | "Pending" | "ReSubmit";
                      date?: string;
                      comments?: string;
                    };
                    const items: TimelineItem[] = [];

                    [...approvalHistory]
                      .sort((a, b) => {
                        const da = a.approved_date ? new Date(a.approved_date).getTime() : 0;
                        const db = b.approved_date ? new Date(b.approved_date).getTime() : 0;
                        if (da !== db) return da - db;
                        return (a.id || 0) - (b.id || 0);
                      })
                      .forEach((h) => {
                        const s = h.status ?? "";
                        items.push({
                          name: h.approver_name || h.email || "—",
                          email: h.email || undefined,
                          designation: h.designation || undefined,
                          status:
                            s === "Approve" || s === "approve" ? "Approved" :
                            s === "Reject" || s === "reject" ? "Rejected" :
                            s === "More" || s === "more" || s === "More Info Required" ? "More" :
                            s === "ReSubmit" || s === "resubmit" ? "ReSubmit" : "Approved",
                          date: h.approved_date ? fmtDate(h.approved_date) : undefined,
                          comments: h.comments || undefined,
                        });
                      });

                    const pendingStatuses = ["Pending Approval"];
                    if (award?.status && pendingStatuses.includes(award.status)) {
                      const allApprovers = award.approversList
                        ? award.approversList.split(",").map((a) => a.trim()).filter(Boolean)
                        : [];
                      allApprovers.forEach((approver) => {
                        items.push({ name: formatApproverDisplayName(approver), status: "Pending" });
                      });
                    }

                    if (items.length === 0) {
                      return <p className="text-sm text-muted-foreground">No approval history available</p>;
                    }

                    return items.map((item, index, arr) => {
                      const isApproved = item.status === "Approved";
                      const isRejected = item.status === "Rejected";
                      const isMore = item.status === "More";
                      const isResubmit = item.status === "ReSubmit";
                      const isPending = item.status === "Pending";

                      const circleClass = isApproved ? "bg-emerald-500 border-emerald-500 text-white" :
                        isRejected ? "bg-red-500 border-red-500 text-white" :
                        isMore ? "bg-amber-500 border-amber-500 text-white" :
                        isResubmit ? "bg-blue-500 border-blue-500 text-white" :
                        "bg-muted border-muted-foreground/30 text-muted-foreground";

                      const dotClass = isApproved ? "bg-emerald-500" :
                        isRejected ? "bg-red-500" :
                        isMore ? "bg-amber-500" :
                        isResubmit ? "bg-blue-500" : "bg-orange-500";

                      const label = isApproved ? "Approved" :
                        isRejected ? "Rejected" :
                        isMore ? "More Info" :
                        isResubmit ? "ReSubmit" : "Pending";

                      return (
                        <div key={index} className="flex items-start">
                          <div className="flex flex-col items-center min-w-[140px] max-w-[160px]">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${circleClass}`}>
                              {isPending ? <Clock className="h-4 w-4" /> :
                                isApproved ? <CheckCircle2 className="h-4 w-4" /> :
                                isRejected ? <XCircle className="h-4 w-4" /> :
                                <AlertCircle className="h-4 w-4" />}
                            </div>
                            <div className="mt-1.5 text-center px-1">
                              <p className="text-xs font-medium truncate max-w-[140px]" title={item.name}>{item.name}</p>
                              <div className="flex items-center justify-center gap-1 mt-0.5">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
                                <span className="text-xs">{label}</span>
                              </div>
                              {item.date && <p className="text-[10px] text-muted-foreground mt-0.5">{item.date}</p>}
                              {item.comments && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2" title={item.comments}>
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
                    });
                  })()}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* ── Submit Dialog ── */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Award for Approval</DialogTitle>
          </DialogHeader>
          <Textarea
            value={submitNotes}
            onChange={(e) => setSubmitNotes(e.target.value)}
            placeholder="Award Notes (required)"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
              {submitMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approve / Reject Dialog ── */}
      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {approvalAction === "Approved"
                ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                : <XCircle className="h-5 w-5 text-red-600" />}
              {approvalAction} Award
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={approvalComments}
            onChange={(e) => setApprovalComments(e.target.value)}
            placeholder="Comments (required)"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalOpen(false)}>Cancel</Button>
            <Button
              variant={approvalAction === "Rejected" ? "destructive" : "default"}
              onClick={() => approvalMut.mutate()}
              disabled={approvalMut.isPending}
            >
              {approvalMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
