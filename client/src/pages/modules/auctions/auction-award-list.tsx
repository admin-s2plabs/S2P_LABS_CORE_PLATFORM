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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, Clock, Gavel, Loader2, Mail,
  Phone, RefreshCw, Send,
  Trophy, XCircle
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type AwardEvent = {
  id?: number;
  auctionTotal?: string | number | null;
  supplierName?: string;
  supplierContact?: string;
  supplierContactNo?: string;
  supplierId?: number;
  contractRefNo?: string;
  attribute11?: string;
  status?: string;
  createdBy?: string;
};

type AuctionDetails = {
  id?: number;
  name?: string;
  status?: string;
  auctionType?: string;
  auctionStrategy?: string;
  allotmentType?: string;
  currency?: string;
  awardEvent?: AwardEvent[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function asArrayOfRecords(v: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
  const r = asRecord(v);
  return r ? [r] : [];
}

function extractAwardsList(payload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(payload) ?? {};
  const candidates: unknown[] = [
    root.awardEvent, root.award_event, root.awardEvents, root.award_events,
    root.awardEventsList, root.auctionAwards, root.auction_awards,
    root.auctionSuppAwardEventList, root.auction_supp_award_event_list,
    root.auAuctionSuppAwardEventList, root.auAuctionSuppAwardEvents,
    root.auctionSuppAwardEvent, root.auction_supp_award_event,
  ];
  for (const c of candidates) {
    const arr = asArrayOfRecords(c);
    if (arr.length) return arr;
  }
  const dataNode = asRecord(root.data);
  if (dataNode) {
    const nested = extractAwardsList(dataNode);
    if (nested.length) return nested;
  }
  for (const [key, val] of Object.entries(root)) {
    if (!key.toLowerCase().includes("award")) continue;
    const arr = asArrayOfRecords(val);
    if (arr.length) return arr;
  }
  return [];
}

function pickText(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v) !== "") return String(v);
  }
  return "";
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function messageOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "message" in v)
    return String((v as { message?: unknown }).message ?? "");
  return "";
}

function money(v: unknown, currency?: string): string {
  const n = Number(v ?? 0);
  const formatted = Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return currency ? `${formatted} ${currency}` : formatted;
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  Draft:             "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Approved:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Awarded:           "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Rejected:          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Pending Approval":"bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Cancelled:         "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const AUCTION_STATUS_STYLES: Record<string, string> = {
  Active:              "bg-emerald-100 text-emerald-700",
  Closed:              "bg-slate-100 text-slate-600",
  Awarded:             "bg-amber-100 text-amber-700",
  "Award Under Process":"bg-orange-100 text-orange-700",
  Scheduled:           "bg-blue-100 text-blue-700",
  Withdraw:            "bg-red-100 text-red-700",
};

function AuctionStatusBadge({ status }: { status?: string }) {
  const s = status ?? "";
  const cls = AUCTION_STATUS_STYLES[s] ?? "bg-slate-100 text-slate-600";
  return (
    <Badge variant="outline" className={`border-0 text-xs font-medium ${cls}`}>
      {s || "—"}
    </Badge>
  );
}

function AwardStatusBadge({ status }: { status?: string }) {
  const s = status ?? "Draft";
  const cls = STATUS_STYLES[s] ?? STATUS_STYLES.Draft;
  const Icon =
    s === "Approved" || s === "Awarded" ? CheckCircle2
    : s === "Rejected" || s === "Cancelled" ? XCircle
    : Clock;
  return (
    <Badge variant="secondary" className={`${cls} flex items-center gap-1 w-fit`}>
      <Icon className="h-3 w-3" />
      {s}
    </Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuctionAwardList() {
  const { toast } = useToast();
  const [, params] = useRoute("/app/auction-details/:id/awards");
  const id = params?.id;
  const [submitOpen, setSubmitOpen] = useState(false);
  const [awardNotes, setAwardNotes] = useState("");
  const [selectedAwardId, setSelectedAwardId] = useState<number | null>(null);
  const [reRaisingId, setReRaisingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", id, "awards"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/auctionEvents/getAuctionEventDetailsById/${id}`);
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as AuctionDetails;
    },
    enabled: !!id,
  });

  const details = useMemo(() => {
    const root = asRecord(data);
    const wrapped = asRecord(root?.data);
    return (wrapped ?? root ?? null) as AuctionDetails | null;
  }, [data]);

  const awards = useMemo(() => extractAwardsList(details), [details]);
  const currency = String(details?.currency ?? "");

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!selectedAwardId) throw new Error("Award not selected");
      if (!awardNotes.trim()) throw new Error("Please write award notes");
      const isLotBased = String(details?.allotmentType ?? "") === "Lot Based";
      const url = isLotBased
        ? `/api/auctionEvents/submitAwardApproval/${selectedAwardId}`
        : `/api/auctionEvents/submitAwardApprovalPartial/${selectedAwardId}`;
      const res = await apiRequest("POST", url, { awardNotes });
      let body: unknown = "";
      try { body = await res.json(); } catch { body = await res.text(); }
      const message = messageOf(body);
      if (!res.ok || /error/i.test(message)) throw new Error(message || "Failed to submit");
      return message;
    },
    onSuccess: async (message) => {
      toast({ title: "Award submitted for approval", description: message || undefined });
      setSubmitOpen(false);
      setAwardNotes("");
      setSelectedAwardId(null);
      await queryClient.invalidateQueries({
        queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", id, "awards"],
      });
    },
    onError: (e: Error) =>
      toast({ title: "Submission failed", description: e.message, variant: "destructive" }),
  });

  const reRaiseMut = useMutation({
    mutationFn: async (awardId: number) => {
      const res = await apiRequest("POST", `/api/auctionEvents/reRaiseAward/${awardId}`);
      let body: unknown = "";
      try { body = await res.json(); } catch { body = await res.text(); }
      const message = messageOf(body);
      if (!res.ok || /error/i.test(message)) throw new Error(message || "Re-raise failed");
      return message;
    },
    onSuccess: async (message) => {
      toast({ title: "Award re-raised", description: message || "Award reset to Draft." });
      setReRaisingId(null);
      await queryClient.invalidateQueries({
        queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", id, "awards"],
      });
    },
    onError: (e: Error) => {
      setReRaisingId(null);
      toast({ title: "Re-raise failed", description: e.message, variant: "destructive" });
    },
  });

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-6 w-52" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" asChild>
          <Link href={id ? `/app/auction-details/${id}` : "/app/auctions"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10 shrink-0">
          <Gavel className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">
              {String(details?.name ?? `Auction #${id}`)}
            </h1>
            <AuctionStatusBadge status={details?.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Auction #{id} · {awards.length} award{awards.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* ── Auction info card ── */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Auction Type</p>
              <p className="font-medium">{String(details?.auctionType ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Strategy</p>
              <p className="font-medium">{String(details?.auctionStrategy ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Allotment</p>
              <p className="font-medium">{String(details?.allotmentType ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Currency</p>
              <p className="font-medium">{currency || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Awards table card ── */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Awards
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {awards.length > 0
                ? `${awards.length} award${awards.length !== 1 ? "s" : ""} created`
                : "No awards yet"}
            </p>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {awards.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Gavel className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-foreground/70">No Awards Yet</p>
              <p className="text-sm mt-1">
                Award recommendations will appear here once created.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Award ID</TableHead>
                    <TableHead className="text-right">Awarded Amount</TableHead>
                    <TableHead>Awarded To</TableHead>
                    <TableHead>Contract No</TableHead>
                    <TableHead>PO#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {awards.map((row, idx) => {
                    const awardId =
                      pickNumber(row, "id", "awardId", "award_id", "auctionAwardNo") ?? 0;
                    const status = pickText(row, "status", "awardStatus", "award_status") || "Draft";
                    const supplierName = pickText(row, "supplierName", "supplier_name");
                    const supplierContact = pickText(row, "supplierContact", "supplier_contact");
                    const supplierContactNo = pickText(row, "supplierContactNo", "supplier_contact_no");
                    const contractRefNo = pickText(row, "contractRefNo", "contract_ref_no");
                    const poNumber = pickText(row, "attribute11", "attribute_11");
                    const auctionTotal = row.auctionTotal ?? row.auction_total ?? 0;
                    const isDraft = status === "Draft";

                    return (
                      <TableRow
                        key={awardId || idx}
                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => {
                          if (awardId) window.location.href = `/app/auction-award-details/${awardId}`;
                        }}
                      >
                        {/* Award ID */}
                        <TableCell className="pl-4 py-3">
                          <span
                            className="text-primary underline underline-offset-2 font-medium text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link href={`/app/auction-award-details/${awardId}`}>
                              #{awardId || "—"}
                            </Link>
                          </span>
                        </TableCell>

                        {/* Amount */}
                        <TableCell className="text-right py-3 font-semibold text-sm">
                          {money(auctionTotal, currency)}
                        </TableCell>

                        {/* Supplier */}
                        <TableCell className="py-3">
                          <p className="text-sm font-medium">{supplierName || "—"}</p>
                          {supplierContact && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" />
                              {supplierContact}
                            </p>
                          )}
                          {supplierContactNo && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {supplierContactNo}
                            </p>
                          )}
                        </TableCell>

                        {/* Contract */}
                        <TableCell className="py-3 text-sm text-muted-foreground">
                          {contractRefNo || <span className="text-muted-foreground/50">NA</span>}
                        </TableCell>

                        {/* PO# */}
                        <TableCell className="py-3 text-sm">
                          {poNumber || <span className="text-muted-foreground/50">Not Created</span>}
                        </TableCell>

                        {/* Status badge */}
                        <TableCell className="py-3">
                          <AwardStatusBadge status={status} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell
                          className="pr-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isDraft ? (
                            <Button
                              size="sm"
                              className="gap-1.5"
                              onClick={() => {
                                setSelectedAwardId(awardId);
                                setAwardNotes("");
                                setSubmitOpen(true);
                              }}
                            >
                              <Send className="h-3.5 w-3.5" />
                              Submit for Approval
                            </Button>
                          ) : 
                          // status === "Rejected" ? (
                          //   <Button
                          //     size="sm"
                          //     variant="outline"
                          //     className="gap-1.5"
                          //     disabled={reRaisingId === awardId}
                          //     onClick={() => {
                          //       if (!awardId) return;
                          //       setReRaisingId(awardId);
                          //       reRaiseMut.mutate(awardId);
                          //     }}
                          //   >
                          //     {reRaisingId === awardId
                          //       ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          //       : <RefreshCw className="h-3.5 w-3.5" />}
                          //     Re-raise Award
                          //   </Button>
                          // ) : 
                          (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Submit for Approval Dialog ── */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Submit Award for Approval
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Award #{selectedAwardId} — please add notes before submitting.
            </p>
            <Textarea
              value={awardNotes}
              onChange={(e) => setAwardNotes(e.target.value)}
              placeholder="Award Notes (required)"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
              {submitMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />Submit for Approval</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
