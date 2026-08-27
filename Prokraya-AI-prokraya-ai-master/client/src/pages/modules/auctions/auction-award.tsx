import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, EyeOff, Loader2, Medal } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";

type ColumnValue = {
  columnId?: number | string;
  columnKey?: string;
  columnValue?: string | number | null;
  suppRspColumnValue?: string | number | null;
  editableBy?: string | null;
};

type TemplateRow = {
  auRowId?: number;
  id?: number;
  columnResponseValues?: ColumnValue[];
  auctionEventRowColumn?: ColumnValue[];
};

type TemplateResponseRow = {
  auRowId?: number;
  columnResponseValues?: ColumnValue[];
  lineItemBasePrice?: string | number | null;
  lineItemTotal?: string | number | null;
  suppProductRank?: number | null;
};

type SupplierResponse = {
  supplierId?: number;
  supplierName?: string;
  suppRank?: number | string | null;
  creationTime?: string;
  templateResponseRows?: TemplateResponseRow[];
};

type AwardEvent = {
  status?: string;
  supplierId?: number;
  templateAwardRows?: Array<{ auRowId?: number }>;
};

type AuctionDetails = {
  id?: number;
  name?: string;
  allotmentType?: string;
  auctionType?: string;
  auctionStrategy?: string;
  currency?: string;
  templateRows?: TemplateRow[];
  auAuctionSuppResponseEventList?: SupplierResponse[];
  awardEvent?: AwardEvent[];
};

type ProductCompare = {
  productId: number;
  itemName: string;
  supplierColumns: ColumnValue[];
  valuesBySupplierId: Record<number, ColumnValue[]>;
  mbd?: string | number | null;
};

function asText(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function isPriceLikeKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k.includes("price") || k.includes("total") || k.includes("amount") || k.includes("rate") || k.includes("cost");
}

function colsOfRow(row: TemplateRow | TemplateResponseRow): ColumnValue[] {
  return row.columnResponseValues ?? (row as TemplateRow).auctionEventRowColumn ?? [];
}

function itemNameOfCols(cols: ColumnValue[]): string {
  const c = cols.find((x) => x.columnKey === "Item Name");
  return asText(c?.columnValue).trim();
}

function getMessageLike(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object" && "message" in payload) {
    return asText((payload as { message?: unknown }).message);
  }
  return "";
}

async function parseResponse(res: Response): Promise<{ message: string; ok: boolean }> {
  let payload: unknown = "";
  try {
    payload = await res.json();
  } catch {
    payload = await res.text();
  }
  const message = getMessageLike(payload);
  const fail = !res.ok || /error|failure/i.test(message);
  return { message, ok: !fail };
}

export default function AuctionAward() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/app/auction-details/:id/award");
  const auctionId = params?.id ? Number(params.id) : NaN;
  const [selectedLotSupplierId, setSelectedLotSupplierId] = useState<number | null>(null);
  const [hiddenSupplierIds, setHiddenSupplierIds] = useState<number[]>([]);
  const [partialSelection, setPartialSelection] = useState<Record<number, number>>({});
  const [comments, setComments] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/auctionEvents/getAuctionEventDetailsById/${auctionId}`);
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as AuctionDetails;
    },
    enabled: Number.isFinite(auctionId),
  });

  const details = data ?? null;
  const isLotBased = String(details?.allotmentType ?? "") === "Lot Based";
  const responses = useMemo(() => {
    const list = (details?.auAuctionSuppResponseEventList ?? []).slice();
    return list.sort((a, b) => Number(a.suppRank ?? 0) - Number(b.suppRank ?? 0));
  }, [details?.auAuctionSuppResponseEventList]);
  const awardedRowIds = useMemo(() => {
    const ids = new Set<number>();
    const awardEvents = details?.awardEvent ?? [];
    for (const evt of awardEvents) {
      if (String(evt.status ?? "").toLowerCase() === "rejected") continue;
      for (const row of evt.templateAwardRows ?? []) {
        const rid = Number(row.auRowId);
        if (Number.isFinite(rid)) ids.add(rid);
      }
    }
    return ids;
  }, [details?.awardEvent]);
  const awardedSupplierIds = useMemo(() => {
    const ids = new Set<number>();
    const awardEvents = details?.awardEvent ?? [];
    for (const evt of awardEvents) {
      if (String(evt.status ?? "").toLowerCase() === "rejected") continue;
      const sid = Number(evt.supplierId);
      if (Number.isFinite(sid)) ids.add(sid);
    }
    return ids;
  }, [details?.awardEvent]);
  const visibleResponses = useMemo(
    () =>
      responses.filter(
        (s) =>
          !hiddenSupplierIds.includes(Number(s.supplierId)) &&
          !awardedSupplierIds.has(Number(s.supplierId))
      ),
    [responses, hiddenSupplierIds, awardedSupplierIds]
  );
  const compareRows = useMemo<ProductCompare[]>(() => {
    const rows = details?.templateRows ?? [];
    const result: ProductCompare[] = [];
    // Track which response-row indices have been consumed per supplier when
    // falling back to item-name matching, so duplicate-named items each get
    // their own distinct response row instead of all resolving to the first one.
    const usedRespRowIndicesBySuppId: Record<number, Set<number>> = {};
    for (const row of rows) {
      const productId = Number(row.auRowId ?? row.id);
      if (!Number.isFinite(productId) || awardedRowIds.has(productId)) continue;
      const rowCols = colsOfRow(row);
      const supplierCols = rowCols.filter((c) => {
        const editable = String(c.editableBy ?? "").trim().toLowerCase();
        const key = String(c.columnKey ?? "").trim().toLowerCase();
        return (
          editable === "supplier" ||
          key === "price" ||
          key === "total" ||
          key === "line total"
        );
      });
      if (!supplierCols.length) continue;
      const itemName = itemNameOfCols(rowCols);
      const valuesBySupplierId: Record<number, ColumnValue[]> = {};
      for (const supp of visibleResponses) {
        const sid = Number(supp.supplierId);
        if (!Number.isFinite(sid)) continue;
        if (!usedRespRowIndicesBySuppId[sid]) usedRespRowIndicesBySuppId[sid] = new Set();
        const usedIndices = usedRespRowIndicesBySuppId[sid]!;
        const respRows = supp.templateResponseRows ?? [];
        let matchedIdx = respRows.findIndex((r) => Number(r.auRowId) === productId);
        if (matchedIdx === -1 && itemName) {
          matchedIdx = respRows.findIndex((r, idx) => !usedIndices.has(idx) && itemNameOfCols(colsOfRow(r)) === itemName);
        }
        const matched = matchedIdx !== -1 ? respRows[matchedIdx] : undefined;
        if (matchedIdx !== -1) usedIndices.add(matchedIdx);
        const cols = colsOfRow(matched ?? { columnResponseValues: [] });
        const mapped: ColumnValue[] = supplierCols.map((sc) => {
          const scIdRaw = sc.columnId;
          const m = cols.find((c) => {
            const a = c.columnId;
            if (scIdRaw != null && a != null) {
              const na = Number(a);
              const nb = Number(scIdRaw);
              if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
              return String(a) === String(scIdRaw);
            }
            return false;
          });
          const key = String(sc.columnKey ?? "").trim().toLowerCase();
          const fallback =
            key === "price"
              ? (matched?.lineItemBasePrice ?? null)
              : key === "total" || key === "line total"
                ? (matched?.lineItemTotal ?? null)
                : null;
          return {
            columnKey: sc.columnKey,
            suppRspColumnValue: m?.suppRspColumnValue ?? fallback,
            columnValue: m?.columnValue,
          };
        });
        const rank = matched?.suppProductRank;
        if (!isLotBased) {
          mapped.unshift({ columnKey: "Rank", suppRspColumnValue: rank ?? "" });
        }
        valuesBySupplierId[sid] = mapped;
      }
      const mbdCol = rowCols.find((c) => String(c.columnKey ?? "").trim() === "Minimum Bid Difference");
      const mbd = mbdCol?.columnValue ?? mbdCol?.suppRspColumnValue ?? null;
      result.push({ productId, itemName: itemName || `Row ${productId}`, supplierColumns: supplierCols, valuesBySupplierId, mbd });
    }
    return result;
  }, [details?.templateRows, visibleResponses, awardedRowIds, isLotBased]);
  const hasMbd = useMemo(
    () => compareRows.some((r) => r.mbd != null && String(r.mbd).trim() !== ""),
    [compareRows]
  );

  const supplierRankById = useMemo(() => {
    const out: Record<number, number> = {};
    for (const s of responses) {
      const sid = Number(s.supplierId);
      const rank = Number(s.suppRank ?? 0);
      if (Number.isFinite(sid)) out[sid] = rank;
    }
    return out;
  }, [responses]);
  const isAlreadyLotAwarded = isLotBased && awardedSupplierIds.size > 0;

  const requiresComment = useMemo(() => {
    if (isLotBased) {
      if (!selectedLotSupplierId) return false;
      return (supplierRankById[selectedLotSupplierId] ?? 1) !== 1;
    }
    const selectedSupps = Object.values(partialSelection);
    if (!selectedSupps.length) return false;
    return selectedSupps.some((sid) => (supplierRankById[sid] ?? 1) !== 1);
  }, [isLotBased, selectedLotSupplierId, partialSelection, supplierRankById]);

  const awardMut = useMutation({
    mutationFn: async () => {
      const awardCommentText = comments.trim() || "Awarded";
      if (isLotBased) {
        if (!selectedLotSupplierId) throw new Error("Please select supplier");
        const res = await apiRequest("POST", `/api/auctionEvents/awardAuction/${auctionId}`, {
            supplierId: selectedLotSupplierId,
            awardComments: awardCommentText,
          });
        let payload: unknown = "";
        try {
          payload = await res.json();
        } catch {
          payload = await res.text();
        }
        const message = getMessageLike(payload);
        const awardIdRaw =
          payload && typeof payload === "object" && "awardId" in payload
            ? (payload as { awardId?: unknown }).awardId
            : undefined;
        const awardId = Number(awardIdRaw);
        if (!res.ok || /error|failure/i.test(message)) {
          throw new Error(message || "Unable to process award");
        }
        return { message, awardId: Number.isFinite(awardId) ? awardId : undefined };
      }
      const grouped: Record<number, number[]> = {};
      for (const [rowIdText, supplierId] of Object.entries(partialSelection)) {
        const rowId = Number(rowIdText);
        if (!Number.isFinite(rowId) || !Number.isFinite(supplierId)) continue;
        if (!grouped[supplierId]) grouped[supplierId] = [];
        grouped[supplierId]!.push(rowId);
      }
      const payload = Object.entries(grouped).map(([sid, rowId]) => ({
        supplierId: Number(sid),
        rowId,
      }));
      if (!payload.length) throw new Error("Please select products");
      const res = await apiRequest("POST",
        `/api/auctionEvents/partialAwardAuction/${auctionId}/${encodeURIComponent(awardCommentText)}`,
        payload
      );
      const parsed = await parseResponse(res);
      if (!parsed.ok) throw new Error(parsed.message || "Unable to process partial award");
      return { message: parsed.message, awardId: undefined as number | undefined };
    },
    onSuccess: async ({ message, awardId }) => {
      toast({ title: "Award processed successfully", description: message || undefined });
      await queryClient.invalidateQueries({
        queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId],
      });
      if (isLotBased) {
        if (Number.isFinite(awardId)) {
          navigate(`/app/auction-award-details/${awardId}`);
        } else {
          navigate(`/app/auction-details/${auctionId}/awards`);
        }
      } else {
        navigate(`/app/auction-details/${auctionId}/awards`);
      }
    },
    onError: (e: unknown) => {
      toast({
        title: "Award failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    },
  });

  if (!Number.isFinite(auctionId)) {
    return <p className="p-6 text-muted-foreground">Invalid auction.</p>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/app/auction-details/${auctionId}`}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Award Bid</h1>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={() => setHiddenSupplierIds([])}
          disabled={!hiddenSupplierIds.length}
        >
          Unhide All
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{String(details?.name ?? `Auction #${auctionId}`)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div>
                <strong>Auction Type:</strong> {String(details?.auctionType ?? "—")}
              </div>
              <div>
                <strong>Auction Strategy:</strong> {String(details?.auctionStrategy ?? "—")}
              </div>
              <div>
                <strong>Allotment:</strong> {String(details?.allotmentType ?? "—")}
              </div>
            </CardContent>
          </Card>

          {isAlreadyLotAwarded ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                This auction has already been awarded to a vendor. Only one vendor can be awarded for a Lot Based auction.
              </CardContent>
            </Card>
          ) : !compareRows.length ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No Suppliers participated yet!
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base tracking-tight">COMPARATIVE STATEMENT</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm border-collapse min-w-[780px]">
                    <thead>
                      <tr className="bg-muted/60 border-b">
                        <th className="p-3 text-center align-bottom w-[180px]">
                          <span className="text-xs font-semibold tracking-wide">PRODUCTS</span>
                        </th>
                        {visibleResponses.map((supplier, i) => {
                          const sid = Number(supplier.supplierId);
                          const canSelect = Number.isFinite(sid);
                          return (
                            <th key={`${sid}-${i}`} className="p-2 align-bottom font-normal">
                              <div className="rounded-lg border bg-card px-3 py-2 shadow-sm text-center min-w-[145px] space-y-1">
                                {isLotBased ? (
                                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs">
                                    <input
                                      type="radio"
                                      name="winner"
                                      checked={selectedLotSupplierId === sid}
                                      onChange={() => setSelectedLotSupplierId(sid)}
                                      disabled={!canSelect}
                                    />
                                    Select vendor
                                  </label>
                                ) : null}
                                <div className="flex items-center justify-center gap-1 text-amber-700">
                                  <Medal className="h-4 w-4" />
                                  <strong>{String(supplier.suppRank ?? "—")}</strong>
                                </div>
                                <p className="text-xs font-medium line-clamp-2" title={supplier.supplierName}>
                                  {String(supplier.supplierName ?? `Supplier #${sid}`)}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1 text-xs"
                                  onClick={() => setHiddenSupplierIds((prev) => [...prev, sid])}
                                >
                                  <EyeOff className="h-3 w-3 mr-1" />
                                  Hide
                                </Button>
                              </div>
                            </th>
                          );
                        })}
                        {hasMbd && (
                          <th className="p-2 align-bottom font-normal">
                            <div className="rounded-lg border bg-amber-50 px-3 py-2 shadow-sm text-center min-w-[100px]">
                              <p className="text-xs font-semibold text-amber-700">MBD</p>
                            </div>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {compareRows.map((row, idx) => (
                        <Fragment key={row.productId}>
                          <tr className="border-b border-border/60">
                            <td
                              colSpan={visibleResponses.length + 1 + (hasMbd ? 1 : 0)}
                              className="px-3 py-2"
                              style={{ background: "#FEE1DA" }}
                            >
                              <h3 className="text-base font-semibold mb-0">{row.itemName}</h3>
                            </td>
                          </tr>
                          {!isLotBased ? (
                            <tr className="border-b border-border/40">
                              <td className="p-3 text-center bg-muted/20 text-xs font-medium">
                                Select Supplier
                              </td>
                              {visibleResponses.map((supp) => {
                                const sid = Number(supp.supplierId);
                                const hasValue = (row.valuesBySupplierId[sid] ?? []).some((v) => {
                                  const txt = asText(v.suppRspColumnValue ?? v.columnValue).trim();
                                  return txt !== "";
                                });
                                return (
                                  <td key={`sel-${row.productId}-${sid}`} className="p-3 text-center border-l border-border/30">
                                    {hasValue ? (
                                      <input
                                        type="radio"
                                        name={`prod-${idx}`}
                                        checked={partialSelection[row.productId] === sid}
                                        onChange={() =>
                                          setPartialSelection((prev) => ({
                                            ...prev,
                                            [row.productId]: sid,
                                          }))
                                        }
                                      />
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                );
                              })}
                              {hasMbd && <td className="p-3 border-l border-border/30" />}
                            </tr>
                          ) : null}
                          <tr className="border-b border-border/40 align-top">
                            <td className="p-3 text-center space-y-2 bg-muted/20">
                              {!isLotBased ? (
                                <p className="text-xs font-medium text-muted-foreground">Rank</p>
                              ) : null}
                              {row.supplierColumns.map((supp) => (
                                <p
                                  key={supp.columnKey}
                                  className={supp.columnKey === "Total" ? "text-base font-bold" : "text-xs"}
                                >
                                  {supp.columnKey}
                                </p>
                              ))}
                            </td>
                            {visibleResponses.map((supp) => {
                              const sid = Number(supp.supplierId);
                              const values = row.valuesBySupplierId[sid] ?? [];
                              return (
                                <td key={`${row.productId}-${sid}`} className="p-3 align-top border-l border-border/30">
                                  <div className="space-y-2">
                                    {!isLotBased ? (
                                      <p className="text-xs">
                                        Rank:{" "}
                                        <strong>
                                          {asText(values.find((v) => v.columnKey === "Rank")?.suppRspColumnValue) ||
                                            "N/A"}
                                        </strong>
                                      </p>
                                    ) : null}
                                    {row.supplierColumns.map((col) => {
                                      const val = values.find(
                                        (v) => String(v.columnKey) === String(col.columnKey)
                                      );
                                      const rawShown = asText(
                                        val?.suppRspColumnValue ?? val?.columnValue
                                      ).trim();
                                      const shown = rawShown && isPriceLikeKey(String(col.columnKey ?? ""))
                                        ? money(rawShown)
                                        : rawShown;
                                      return (
                                        <p
                                          key={`${row.productId}-${sid}-${col.columnKey}`}
                                          className={col.columnKey === "Total" ? "text-base font-bold" : "text-xs"}
                                        >
                                          {shown || "N/A"}
                                        </p>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                            {hasMbd && (
                              <td className="p-3 align-middle border-l border-border/30 text-center">
                                <span className="text-sm font-semibold text-amber-700">
                                  {row.mbd != null && String(row.mbd).trim() !== ""
                                    ? money(row.mbd)
                                    : "—"}
                                </span>
                              </td>
                            )}
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {!isAlreadyLotAwarded && requiresComment ? (
            <div className="space-y-2">
              <Label htmlFor="comm">Comments *</Label>
              <Textarea
                id="comm"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Please enter comments to continue"
              />
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/app/auctions">Back</Link>
            </Button>
            {!isAlreadyLotAwarded && (
              <Button
                disabled={
                  awardMut.isPending ||
                  (isLotBased ? !selectedLotSupplierId : Object.keys(partialSelection).length === 0)
                }
                onClick={() => {
                  if (requiresComment && comments.trim() === "") {
                    toast({
                      title: "Comments required",
                      description: "Please enter comments to continue",
                      variant: "destructive",
                    });
                    return;
                  }
                  awardMut.mutate();
                }}
              >
                {awardMut.isPending ? "Submitting..." : "Proceed"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
