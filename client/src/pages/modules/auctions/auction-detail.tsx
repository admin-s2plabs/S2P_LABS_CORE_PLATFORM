import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatDateTime } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Gavel,
  Handshake,
  ListOrdered,
  Loader2,
  LogOut,
  Megaphone,
  Pencil,
  PlusCircle,
  Radio,
  Scale,
  ScrollText,
  Sparkles,
  Timer,
  Trash2,
  TrendingDown,
  Trophy,
  Users,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import * as XLSX from "xlsx";
import { AuctionCompareBidsDialog } from "./auction-compare-bids-dialog";
import type { CompareTemplateRow } from "./compare-bids-model";

type ColumnCell = {
  id?: number;
  columnId?: number;
  /** Some API paths return snake_case */
  column_id?: number | string;
  columnKey?: string;
  columnValue?: string;
  editableBy?: string;
  editable_by?: string;
  viewedBy?: string;
  suppRspColumnValue?: string;
  /** Baseline bid used for reverse/forward validation (legacy) */
  suppRspColumn?: string;
};

type TemplateRow = {
  id?: number;
  auRowId?: number;
  columnResponseValues?: ColumnCell[];
  auctionEventRowColumn?: ColumnCell[];
  suppWiseCap?: { suppId?: number; supplierName?: string; price?: string | number }[];
  leadingPrice?: string | number;
  lineItemTotal?: string | number;
  lineItemBasePrice?: string | number;
  savingsLineItemPercentage?: number;
  savingsAmount?: number;
  savingsLineItemPrice?: string | number | null;
  basketAuctionStatus?: string;
  startTime?: string;
  endTime?: string;
  mbdStatus?: boolean;
  validationValue?: number;
};

type AuctionDetails = Record<string, unknown> & {
  id?: number;
  name?: string;
  auctionType?: string;
  auctionStrategy?: string;
  allotmentType?: string;
  auctionDuration?: string | number;
  auctionDurationUnits?: string;
  startTime?: string;
  endTime?: string;
  deliveryDate?: string;
  status?: string;
  currency?: string;
  isBasket?: string | boolean;
  isScheduledEvent?: boolean;
  acutiontTimeExtensionInMins?: number;
  ifBidInLastMinutesInMins?: number;
  ifBidInLastMinutesInMinsUnit?: string;
  acutiontTimeExtensionInMinsUnit?: string;
  lotLeadingPrice?: string;
  savingsPrice?: number;
  savingsPercentage?: number;
  orgDetails?: { organizationName?: string };
  templateRows?: TemplateRow[];
  auctionEventRowColumn?: ColumnCell[];
  suppIds?: { id: number; companyName?: string; company_name?: string }[];
  auAuctionSuppResponseEventList?: unknown[];
  tncs?: { id?: number; tncTitle?: string; tnc_text?: string }[];
  templateDef?: { auAuctionEventTemplateColumnDefs?: { columnName?: string; formula?: string }[] };
};

function formatAuDate(date?: string | Date | null) {
  if (!date) return "—";
  try {
    return formatDate(date, true);
  } catch {
    return String(date);
  }
}

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function normalizeRows(rows: TemplateRow[] | undefined): TemplateRow[] {
  if (!rows?.length) return [];
  return rows.map((r) => {
    const cols = r.columnResponseValues ?? r.auctionEventRowColumn ?? [];
    const auRowId = r.auRowId ?? r.id;
    return { ...r, auRowId, columnResponseValues: cols };
  });
}

const DURATION_UNIT_MS: Record<string, number> = {
  Mts: 60 * 1000,
  Mins: 60 * 1000,
  Hrs: 60 * 60 * 1000,
  Days: 24 * 60 * 60 * 1000,
};

function calcEndTimeFromDuration(details: AuctionDetails): string | null {
  const start = details.startTime ? new Date(details.startTime).getTime() : null;
  const duration = details.auctionDuration != null ? Number(details.auctionDuration) : null;
  const units = details.auctionDurationUnits;
  if (!start || !duration || !units) return null;
  const multiplier = DURATION_UNIT_MS[units];
  if (!multiplier) return null;
  return new Date(start + duration * multiplier).toISOString();
}

function getEffectiveEndTime(details: AuctionDetails | null): string | null {
  if (!details) return null;
  const isBasket = details.isBasket === "Y" || details.isBasket === true;
  const rows = details.templateRows as TemplateRow[] | undefined;
  if (isBasket && rows?.length) {
    const active = rows.find((x) => x.basketAuctionStatus === "Active");
    if (active?.endTime) return String(active.endTime);
  }
  // Prefer duration-based calculation over endTime from API,
  // which can incorrectly hold deliveryDate after raising.
  const calculated = calcEndTimeFromDuration(details);
  if (details.endTime) return String(details.endTime);
  if (calculated) return calculated;
  return null;
}

function formatCountdown(endIso: string | undefined, nowMs: number): string {
  if (!endIso) return "—";
  const end = new Date(endIso).getTime();
  const distance = end - nowMs;
  if (distance < 0) return "Closed";
  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);
  if (days > 0) return `${days}d:${hours}h:${minutes}m:${seconds}s`;
  if (hours > 0) return `${hours}h:${minutes}m:${seconds}s`;
  if (minutes > 0) return `${minutes}m:${seconds}s`;
  if (seconds > 0) return `${seconds}s`;
  return "Closed";
}

type PartialRank = {
  rank: number;
  prodName: string;
  suppName?: string;
  bidDate?: string;
  bidCount?: string;
};

type LotSupplierRankRow = {
  supplierName?: string;
  suppRank?: number | string;
  auctionTotal?: number | string;
  currency?: string;
  bidTime?: string;
  attribute1?: string;
};

function pickResp(row: Record<string, unknown>, camel: string, snake: string): unknown {
  const a = row[camel];
  if (a != null && a !== "") return a;
  return row[snake];
}

function computeBasketLeadingSuppliers(details: AuctionDetails | null): Map<number, string> {
  const map = new Map<number, string>();
  const list = details?.auAuctionSuppResponseEventList as
    | { supplierName?: string; supplier_name?: string; templateResponseRows?: Record<string, unknown>[] }[]
    | undefined;
  if (!list?.length) return map;
  for (const resp of list) {
    const suppName = resp.supplierName ?? resp.supplier_name ?? "";
    for (const row of resp.templateResponseRows ?? []) {
      const rank = Number(row.suppProductRank ?? row.supp_product_rank ?? 0);
      if (rank !== 1) continue;
      const rowId = Number(row.auRowId ?? row.au_row_id ?? 0);
      if (rowId > 0 && suppName) map.set(rowId, suppName);
    }
  }
  return map;
}

function computePartialRankings(details: AuctionDetails | null): PartialRank[] {
  const list = details?.auAuctionSuppResponseEventList as
    | {
        templateResponseRows?: {
          suppProductRank?: number | string;
          supp_product_rank?: number | string;
          auRowId?: number | string;
          au_row_id?: number | string;
          lineItemTotal?: number | string | null;
          line_item_total?: number | string | null;
          columnResponseValues?: ColumnCell[];
        }[];
        supplierName?: string;
        supplier_name?: string;
        suppRank?: number | string;
        supp_rank?: number | string;
        auctionTotal?: number | string;
        auction_total?: number | string;
        bidTime?: string;
        bid_time?: string;
        attribute1?: string;
        attribute_1?: string;
      }[]
    | undefined;
  if (!list?.length) return [];

  // Build per-line-item bid count: count suppliers who actually submitted a price for each auRowId
  const rowBidCountMap = new Map<number, number>();
  for (const col of list) {
    for (const row of col.templateResponseRows ?? []) {
      const rowId = Number(row.auRowId ?? row.au_row_id);
      if (!Number.isFinite(rowId)) continue;
      const total = Number(row.lineItemTotal ?? row.line_item_total ?? 0);
      if (total > 0) {
        rowBidCountMap.set(rowId, (rowBidCountMap.get(rowId) ?? 0) + 1);
      }
    }
  }

  const out: PartialRank[] = [];
  for (const col of list) {
    col.templateResponseRows?.forEach((product) => {
      const lineRank = Number(
        product.suppProductRank ?? (product as { supp_product_rank?: number | string }).supp_product_rank
      );
      if (!Number.isFinite(lineRank) || lineRank !== 1) return;
      const productName = product.columnResponseValues?.find(
        (c) => String(c.columnKey ?? "").trim().toLowerCase() === "item name"
      );
      const suppName = col.supplierName ?? col.supplier_name;
      const bidDate = col.bidTime ?? col.bid_time;
      const rowId = Number(product.auRowId ?? product.au_row_id);
      const lineBidCount = Number.isFinite(rowId) ? rowBidCountMap.get(rowId) : undefined;
      out.push({
        rank: lineRank,
        prodName: productName?.columnValue ?? "—",
        suppName,
        bidDate,
        bidCount: lineBidCount != null ? String(lineBidCount) : undefined,
      });
    });
  }
  if (out.length > 0) return out;

  for (const resp of list) {
    const r = resp as Record<string, unknown>;
    const sr = Number(pickResp(r, "suppRank", "supp_rank") ?? 0);
    const at = pickResp(r, "auctionTotal", "auction_total");
    if (!Number.isFinite(sr) || sr <= 0) continue;
    if (at == null || at === "") continue;
    const n = typeof at === "number" ? at : parseFloat(String(at));
    if (!Number.isFinite(n) || n <= 0) continue;
    const name = pickResp(r, "supplierName", "supplier_name");
    const bid = pickResp(r, "bidTime", "bid_time");
    const attr = pickResp(r, "attribute1", "attribute_1");
    out.push({
      rank: sr,
      prodName: (name != null ? String(name) : "") || "—",
      suppName: `${n} ${details?.currency ?? ""}`.trim(),
      bidDate: bid != null ? String(bid) : undefined,
      bidCount: attr != null ? String(attr) : undefined,
    });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out;
}

function computeLotRankings(details: AuctionDetails | null): LotSupplierRankRow[] {
  const list = details?.auAuctionSuppResponseEventList as Record<string, unknown>[] | undefined;
  if (!list?.length) return [];
  return list
    .map((raw) => {
      const auctionTotal = pickResp(raw, "auctionTotal", "auction_total") as
        | LotSupplierRankRow["auctionTotal"]
        | undefined;
      const suppRank = pickResp(raw, "suppRank", "supp_rank") as
        | LotSupplierRankRow["suppRank"]
        | undefined;
      const supplierName = pickResp(raw, "supplierName", "supplier_name");
      const bidTime = pickResp(raw, "bidTime", "bid_time");
      const currency = raw.currency;
      const attribute1 = pickResp(raw, "attribute1", "attribute_1");
      const row: LotSupplierRankRow = {
        supplierName: supplierName != null ? String(supplierName) : undefined,
        suppRank,
        auctionTotal,
        currency: currency != null ? String(currency) : undefined,
        bidTime: bidTime != null ? String(bidTime) : undefined,
        attribute1: attribute1 != null ? String(attribute1) : undefined,
      };
      return row;
    })
    .filter((item) => {
      const t = item.auctionTotal;
      if (t == null || t === "") return false;
      const n = typeof t === "number" ? t : parseFloat(String(t));
      return Number.isFinite(n) && n > 0;
    })
    .sort(
      (a, b) =>
        parseFloat(String(a.suppRank ?? 0)) - parseFloat(String(b.suppRank ?? 0))
    );
}

function AuctionRankingCard({
  rank,
  nameLine,
  nameLine2,
  dateLine,
  amountLine,
  bidsLabel,
}: {
  rank: number;
  nameLine: string;
  nameLine2?: string;
  dateLine: string;
  amountLine?: string;
  bidsLabel?: string;
}) {
  const rankNum = Number(rank);
  const twoDigit = rankNum >= 10;
  return (
    <div className="flex gap-3 rounded-lg border bg-card p-3 shadow-sm min-w-[280px] max-w-[340px] shrink-0">
      <div className="flex h-[60px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5">
        <Trophy className="h-9 w-9 shrink-0 text-amber-500" strokeWidth={1.5} aria-hidden />
        <span
          className={cn(
            "text-md font-bold tabular-nums leading-none text-amber-950",
            twoDigit && "text-xs"
          )}
        >
          {rank}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="font-medium leading-tight line-clamp-2" title={nameLine}>
          {nameLine}
        </p>
        {nameLine2 ? (
          <p
            className="font-medium leading-tight line-clamp-2 text-muted-foreground"
            title={nameLine2}
          >
            {nameLine2}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{dateLine}</p>
        {amountLine ? <p className="font-semibold">{amountLine}</p> : null}
        {/* {bidsLabel != null && bidsLabel !== "" ? ( */}
          <p className="text-xs">
            Bids Count: <strong>{bidsLabel}</strong>
          </p>
        {/* ) : null} */}
      </div>
    </div>
  );
}

function RankingEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Users className="h-12 w-12 text-muted-foreground/40 mb-2" aria-hidden />
      <p className="text-sm font-medium text-muted-foreground">No Suppliers participated yet!</p>
    </div>
  );
}

type BidSummaryRow = Record<string, unknown>;

function bsPick(row: BidSummaryRow, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function bidSummaryRecords(data: unknown): BidSummaryRow[] {
  return Array.isArray(data) ? (data as BidSummaryRow[]) : [];
}

function bidSummaryHasTemplateRows(list: BidSummaryRow[]): boolean {
  const first = list[0];
  if (!first) return false;
  const tr = first.templateResponseRows ?? first.template_response_rows;
  return Array.isArray(tr) && tr.length > 0;
}

const BID_SUMMARY_COLUMNS = [
  "Item Name",
  "Quantity",
  "Delivery Location",
  "Price",
  "Total",
] as const;

function bidSummaryCellByColumn(
  cells: BidSummaryRow[] | undefined,
  columnName: string
): BidSummaryRow | undefined {
  if (!Array.isArray(cells) || cells.length === 0) return undefined;
  const wanted = columnName.trim().toLowerCase();
  return cells.find((c) => {
    const key = String(c.columnKey ?? c.column_key ?? "").trim().toLowerCase();
    return key === wanted;
  });
}

function bidSummaryCellText(c: BidSummaryRow): string {
  const v = c.columnValue ?? c.column_value;
  if (v != null && String(v).trim() !== "") return String(v);
  const s = c.suppRspColumnValue;
  if (s != null && String(s).trim() !== "") return String(s);
  return "N/A";
}

function downloadBidSummaryExcel(
  data: unknown,
  auctionId: string,
  details: AuctionDetails | null
) {
  const list = bidSummaryRecords(data);
  if (!list.length) return;

  // Dynamically discover all template column keys from responses
  const colKeySet = new Set<string>();
  for (const item of list) {
    const tRows = (item.templateResponseRows ?? item.template_response_rows) as BidSummaryRow[];
    if (Array.isArray(tRows)) {
      for (const row of tRows) {
        const cells = (row.columnResponseValues ?? row.column_response_values) as BidSummaryRow[] | undefined;
        if (Array.isArray(cells)) {
          for (const cell of cells) {
            const key = String(cell.columnKey ?? cell.column_key ?? "").trim();
            if (key) colKeySet.add(key);
          }
        }
      }
    }
  }
  const dynCols = Array.from(colKeySet);

  const headers = [
    "S NO",
    "Auction Name",
    "Auction Id",
    "Auction Type",
    "Auction Strategy",
    "Created By",
    "Auction Date",
    "Start Date & Time",
    "End Date & Time",
    "Allotment Type",
    "Supplier Name",
    ...dynCols,
    "Total Lot Price",
    "Delivery Date",
    "Currency",
    "Bid Date & Time",
    "Supplier Rank",
  ];

  // Auction-level constants
  const auctionName   = String(details?.name ?? "—");
  const auctionIdStr  = String(details?.id ?? auctionId ?? "—");
  const auctionType   = String(details?.auctionType ?? "—");
  const strategy      = String(details?.auctionStrategy ?? "—");
  const createdBy     = String((details as Record<string, unknown>)?.createdBy ?? "—");
  const auctionDate   = (details as Record<string, unknown>)?.creationTime
    ? formatDateTime(String((details as Record<string, unknown>).creationTime))
    : "—";
  const startDate     = details?.startTime ? formatDateTime(String(details.startTime)) : "—";
  const endDate       = details?.endTime   ? formatDateTime(String(details.endTime))   : "—";
  const allotmentType = String(details?.allotmentType ?? "—");
  const deliveryDate  = details?.deliveryDate ? formatDate(String(details.deliveryDate)) : "—";
  const currency      = String(details?.currency ?? "—");

  const wsData: string[][] = [headers];
  let sno = 1;

  for (const item of list) {
    const supplierName = String(bsPick(item, "supplierName", "supplier_name") ?? "—");
    const suppRank     = String(bsPick(item, "suppRank", "supp_rank") ?? "—");
    const auctionTotal = String(bsPick(item, "auctionTotal", "auction_total") ?? "—");
    const bidTime      = bsPick(item, "bidTime", "bid_time");
    const timeStr      = bidTime ? formatDateTime(String(bidTime)) : "—";
    const deleted      = String(bsPick(item, "status", "Status") ?? "").toLowerCase().includes("deleted");
    const label        = deleted ? `${supplierName} (Deleted)` : supplierName;

    const tRows = (item.templateResponseRows ?? item.template_response_rows) as BidSummaryRow[];

    if (Array.isArray(tRows) && tRows.length > 0) {
      for (const row of tRows) {
        const cells = (row.columnResponseValues ?? row.column_response_values) as BidSummaryRow[] | undefined;
        const rowRank =
          Number(suppRank === "—" ? 0 : suppRank) === 0
            ? String(row.suppProductRank ?? row.supp_product_rank ?? "—")
            : suppRank;

        const dynValues = dynCols.map((key) => {
          const cell = bidSummaryCellByColumn(cells, key);
          if (!cell) {
            return key.toLowerCase() === "total"
              ? String(row.lineItemTotal ?? row.line_item_total ?? "N/A")
              : "N/A";
          }
          return bidSummaryCellText(cell);
        });

        wsData.push([
          String(sno++),
          auctionName, auctionIdStr, auctionType, strategy,
          createdBy, auctionDate, startDate, endDate, allotmentType,
          label,
          ...dynValues,
          auctionTotal, deliveryDate, currency, timeStr, rowRank,
        ]);
      }
    } else {
      wsData.push([
        String(sno++),
        auctionName, auctionIdStr, auctionType, strategy,
        createdBy, auctionDate, startDate, endDate, allotmentType,
        label,
        ...dynCols.map(() => "N/A"),
        auctionTotal, deliveryDate, currency, timeStr, suppRank,
      ]);
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = headers.map((h, i) => ({
    wch: Math.min(
      Math.max(h.length, ...wsData.slice(1).map((r) => String(r[i] ?? "").length)) + 2,
      45
    ),
  }));
  XLSX.utils.book_append_sheet(wb, ws, "Bid Summary");
  XLSX.writeFile(wb, `bid-summary-${auctionId}-${Date.now()}.xlsx`);
}

function basketRowForBidSummary(
  templateRow: BidSummaryRow,
  normalizedRows: TemplateRow[]
): TemplateRow | undefined {
  const auRowId = Number(templateRow.auRowId ?? templateRow.au_row_id);
  if (!Number.isFinite(auRowId)) return undefined;
  return normalizedRows.find((r) => r.auRowId === auRowId);
}

/** Fetches and renders previous (non-deleted) bid quote rows for a supplier whose latest bid was deleted. */
function SupplierPreviousBidsRows({
  auctionId,
  supplierId,
  supplierName,
  itemIdx,
  showActionColumn,
}: {
  auctionId: string;
  supplierId: number;
  supplierName: string;
  itemIdx: number;
  showActionColumn: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/auctionEvents/getBidSummaryHistBySupplier", auctionId, supplierId],
    queryFn: async () => {
      const res = await apiRequest("GET", 
        `/api/auctionEvents/getBidSummaryHistBySupplier/${auctionId}/${supplierId}`,
      );
      if (!res.ok) return [] as BidSummaryRow[];
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? (json as BidSummaryRow[]) : ([] as BidSummaryRow[]);
    },
    staleTime: 30_000,
  });

  const totalCols = (showActionColumn ? 1 : 0) + 1 + BID_SUMMARY_COLUMNS.length + 2;

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={totalCols} className="py-1 text-center text-xs text-muted-foreground">
          Loading previous quotes…
        </TableCell>
      </TableRow>
    );
  }

  const previousItems = (data ?? []).filter(
    (item) => !String(bsPick(item, "status", "Status") ?? "").toLowerCase().includes("deleted")
  );

  if (previousItems.length === 0) return null;

  return (
    <>
      {previousItems.flatMap((item, i) => {
        const rows = (item.templateResponseRows ?? item.template_response_rows) as
          | BidSummaryRow[]
          | undefined;
        const tplRows = Array.isArray(rows) ? rows : [];
        const suppRank = bsPick(item, "suppRank", "supp_rank");
        const bidTime = bsPick(item, "bidTime", "bid_time");
        const timeStr = bidTime != null ? formatDate(String(bidTime)) : "—";

        return tplRows.map((row, j) => {
          const cells = (row.columnResponseValues ?? row.column_response_values) as
            | BidSummaryRow[]
            | undefined;
          const rankShown =
            Number(suppRank ?? 0) === 0
              ? String(row.suppProductRank ?? row.supp_product_rank ?? "—")
              : String(suppRank ?? "—");

          return (
            <TableRow key={`prev-${itemIdx}-${i}-${j}`} className="bg-muted/30">
              {showActionColumn ? (
                j === 0 ? (
                  <TableCell rowSpan={tplRows.length || 1} className="align-top" />
                ) : null
              ) : null}
              <TableCell className="text-sm text-muted-foreground">
                <span className="mr-1 text-xs font-medium text-primary">↩</span>
                {supplierName}
              </TableCell>
              {BID_SUMMARY_COLUMNS.map((key) => {
                const cell = bidSummaryCellByColumn(cells, key);
                const value =
                  key === "Total" && !cell
                    ? String(row.lineItemTotal ?? row.line_item_total ?? "N/A")
                    : cell
                      ? bidSummaryCellText(cell as BidSummaryRow)
                      : "N/A";
                return (
                  <TableCell
                    key={key}
                    className="max-w-[200px] whitespace-pre-wrap text-sm text-muted-foreground"
                  >
                    {value}
                  </TableCell>
                );
              })}
              <TableCell className="text-muted-foreground">{rankShown}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{timeStr}</TableCell>
            </TableRow>
          );
        });
      })}
    </>
  );
}

/** Mirrors legacy auction-details.js bid summary delete affordances. */
function canShowBidSummaryDelete(
  item: BidSummaryRow,
  templateRow: BidSummaryRow,
  templateRowIndex: number,
  templateRowCount: number,
  details: AuctionDetails | null,
  normalizedRows: TemplateRow[]
): boolean {
  const eventStatus = String(details?.status ?? "").toLowerCase();
  if (eventStatus === "closed") return false;

  const isBasket = details?.isBasket === "Y" || details?.isBasket === true;
  const allotmentItem = String(
    bsPick(item, "allotmentType", "allotment_type") ?? details?.allotmentType ?? ""
  );
  const latestBid = item.latestBid === true;
  const attr9 = String(bsPick(item, "attribute9", "attribute_9") ?? "").toUpperCase() === "Y";

  const br = basketRowForBidSummary(templateRow, normalizedRows);
  const basketActive = String(br?.basketAuctionStatus ?? "").toLowerCase() === "active";

  if (isBasket) {
    return (
      allotmentItem === "Partial Based" && latestBid && attr9 && basketActive
    );
  }

  if (templateRowCount > 0 && templateRowIndex === 0) {
    return (
      (allotmentItem === "Lot Based" || allotmentItem === "Partial Based") &&
      latestBid &&
      attr9
    );
  }
  return false;
}

function BidSummaryTableView({
  data,
  loading,
  details,
  normalizedRows,
  auctionId,
  onDeleteRow,
  deletePending,
}: {
  data: unknown;
  loading: boolean;
  details: AuctionDetails | null;
  normalizedRows: TemplateRow[];
  auctionId: string;
  onDeleteRow: (supplierId: number, historyId: number) => void;
  deletePending: boolean;
}) {
  const list = useMemo(() => bidSummaryRecords(data), [data]);
  const hydrated = useMemo(() => bidSummaryHasTemplateRows(list), [list]);
  const canAttemptDelete = String(details?.status ?? "").toLowerCase() !== "closed" && !!auctionId;
  const showActionColumn = canAttemptDelete;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <BarChart3 className="mb-2 h-10 w-10 opacity-40" aria-hidden />
        <p className="text-sm font-medium">No bid summary found</p>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {showActionColumn ? <TableHead>Action</TableHead> : null}
              <TableHead>Supplier</TableHead>
              {BID_SUMMARY_COLUMNS.map((k) => (
                <TableHead key={k}>{k}</TableHead>
              ))}
              <TableHead>Rank</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((row, i) => (
              <TableRow key={i}>
                {showActionColumn ? <TableCell>—</TableCell> : null}
                <TableCell>{String(bsPick(row, "supplierName", "supplier_name") ?? "—")}</TableCell>
                {BID_SUMMARY_COLUMNS.map((k) => (
                  <TableCell key={k}>N/A</TableCell>
                ))}
                <TableCell>{String(bsPick(row, "suppRank", "supp_rank") ?? "—")}</TableCell>
                <TableCell>
                  {bsPick(row, "bidTime", "bid_time")
                    ? formatDateTime(String(bsPick(row, "bidTime", "bid_time")))
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const isDeleted = (item: BidSummaryRow) =>
    String(bsPick(item, "status", "Status") ?? "")
      .toLowerCase()
      .includes("deleted");

  return (
    <div className="overflow-x-auto rounded-md border max-h-[min(65vh,520px)] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showActionColumn ? <TableHead className="w-10">Action</TableHead> : null}
            <TableHead>Supplier</TableHead>
            {BID_SUMMARY_COLUMNS.map((k) => (
              <TableHead key={k} className="whitespace-nowrap">
                {k}
              </TableHead>
            ))}
            <TableHead>Rank</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.flatMap((item, itemIdx) => {
            const rows = (item.templateResponseRows ??
              item.template_response_rows) as BidSummaryRow[];
            if (!Array.isArray(rows)) return [];
            const tplCount = rows.length;
            const deleted = isDeleted(item);
            const supplierName = String(bsPick(item, "supplierName", "supplier_name") ?? "—");
            const suppRank = bsPick(item, "suppRank", "supp_rank");
            const bidTime = bsPick(item, "bidTime", "bid_time");
            const supplierId = Number(bsPick(item, "supplierId", "supplier_id"));
            const historyId = Number(bsPick(item, "id"));
            const timeStr = bidTime != null ? formatDateTime(String(bidTime)) : "—";

            // Deleted items with no template rows still need a visible row (strikethrough)
            const effectiveRows: BidSummaryRow[] = rows.length > 0 ? rows : deleted ? [{}] : [];

            const mainRows = effectiveRows.map((row, j) => {
              const cells = (row.columnResponseValues ?? row.column_response_values) as
                | BidSummaryRow[]
                | undefined;
              const rankShown =
                Number(suppRank ?? 0) === 0
                  ? String(row.suppProductRank ?? row.supp_product_rank ?? "—")
                  : String(suppRank ?? "—");

              const isBasket = details?.isBasket === "Y" || details?.isBasket === true;
              const supplierRequestedDelete =
                String(bsPick(item, "attribute9", "attribute_9") ?? "").toUpperCase() === "Y";
              const showDelete = canAttemptDelete &&
                  Number.isFinite(supplierId) &&
                  Number.isFinite(historyId) &&
                  (deleted
                    ? isBasket || j === 0
                    : canShowBidSummaryDelete(item, row, j, tplCount, details, normalizedRows));
              let renderAction: ReactNode = null;
              if (showActionColumn) {
                if (isBasket) {
                  renderAction = (
                    <TableCell className="align-top">
                      {showDelete ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={deletePending}
                          aria-label="Delete bid response"
                          onClick={() => onDeleteRow(supplierId, historyId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  );
                } else if (j === 0) {
                  renderAction = (
                    <TableCell rowSpan={tplCount || 1} className="align-top">
                      {showDelete ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={deletePending}
                          aria-label="Delete bid response"
                          onClick={() => onDeleteRow(supplierId, historyId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  );
                } else {
                  renderAction = null;
                }
              }

              const cellWrap = (node: ReactNode) =>
                deleted ? <del className="text-muted-foreground">{node}</del> : node;

              return (
                <TableRow key={`${itemIdx}-${j}`}>
                  {renderAction}
                  <TableCell>{cellWrap(supplierName)}</TableCell>
                  {BID_SUMMARY_COLUMNS.map((key) => {
                    const cell = bidSummaryCellByColumn(cells, key);
                    const value =
                      key === "Total" && !cell
                        ? String(row.lineItemTotal ?? row.line_item_total ?? "N/A")
                        : cell
                          ? bidSummaryCellText(cell as BidSummaryRow)
                          : "N/A";
                    return (
                      <TableCell key={key} className="max-w-[200px] whitespace-pre-wrap text-sm">
                        {cellWrap(value)}
                      </TableCell>
                    );
                  })}
                  <TableCell>{cellWrap(rankShown)}</TableCell>
                  <TableCell className="whitespace-nowrap">{cellWrap(timeStr)}</TableCell>
                </TableRow>
              );
            });

            // When the latest bid is deleted, also show the supplier's previous quotes and rank.
            if (deleted && Number.isFinite(supplierId)) {
              return [
                ...mainRows,
                <SupplierPreviousBidsRows
                  key={`hist-${itemIdx}`}
                  auctionId={auctionId}
                  supplierId={supplierId}
                  supplierName={supplierName}
                  itemIdx={itemIdx}
                  showActionColumn={showActionColumn}
                />,
              ];
            }
            return mainRows;
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function rowColumnMap(row: TemplateRow): Record<string, string> {
  const m: Record<string, string> = {};
  (row.columnResponseValues ?? []).forEach((c) => {
    if (c.columnKey) m[c.columnKey] = c.columnValue ?? "";
  });
  return m;
}

/** Event suppliers: API may send `company_name` and/or `companyName`. */
function supplierInviteName(s: {
  id: number;
  companyName?: string;
  company_name?: string;
}): string {
  const n = (s.company_name ?? s.companyName ?? "").trim();
  return n || `Supplier #${s.id}`;
}

function evaluateFormulaSafe(formula: string, scope: Record<number, number>): string {
  if (!formula?.trim()) return "0";
  let expr = formula.trim();
  const keys = Object.keys(scope)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  for (const num of keys) {
    const v = scope[num];
    const re = new RegExp(`\\b${num}\\b`, "g");
    expr = expr.replace(re, String(v));
  }
  try {
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result === "number" && Number.isFinite(result)) return result.toFixed(2);
    const n = Number(result);
    return Number.isFinite(n) ? n.toFixed(2) : "0";
  } catch {
    return "0";
  }
}

function calculateLineTotal(
  row: TemplateRow,
  formula: string,
  totalColumnId?: number
): string {
  const cols = row.columnResponseValues ?? [];
  const scope: Record<number, number> = {};
  for (const el of cols) {
    if (isTotalColumnCell(el, totalColumnId)) continue;
    const id = Number(el.columnId ?? el.column_id);
    if (!Number.isFinite(id)) continue;
    const raw = el.suppRspColumnValue || el.suppRspColumn || el.columnValue || "0";
    const str = String(raw);
    const num = parseFloat(str.includes(" ") ? str.split(" ")[0]! : str);
    scope[id] = Number.isFinite(num) ? num : 0;
  }
  if (formula?.trim()) {
    const result = evaluateFormulaSafe(formula, scope);
    if (result !== "0" || Object.values(scope).some((v) => v !== 0)) return result;
  }
  const fb = fallbackPriceTimesQty(row);
  if (fb != null && Number.isFinite(fb)) return fb.toFixed(2);
  return "0";
}

function isTotalColumnCell(item: ColumnCell, totalColumnId?: number): boolean {
  const cid = Number(item.columnId ?? item.column_id);
  if (totalColumnId != null && Number.isFinite(cid) && cid === totalColumnId) return true;
  const key = String(item.columnKey ?? "").trim().toLowerCase();
  if (!key) return false;
  if (key === "total" || key === "line total" || key === "grand total" || key === "net total") {
    return true;
  }
  if (key.includes("subtotal")) return false;
  if (key.includes("line total") || key.endsWith(" line total")) return true;
  return false;
}

function applyTotalToLineItem(
  item: TemplateRow,
  formula: string,
  totalColumnId?: number
): void {
  const cols = item.columnResponseValues ?? [];
  let effectiveTotalColumnId = totalColumnId;
  if (effectiveTotalColumnId == null) {
    const inferredTotal = cols.find((c) => isTotalColumnCell(c));
    const inferredId = Number(inferredTotal?.columnId ?? inferredTotal?.column_id);
    if (Number.isFinite(inferredId)) {
      effectiveTotalColumnId = inferredId;
    }
  }
  const t = calculateLineTotal(item, formula, effectiveTotalColumnId);
  item.lineItemTotal = t;
  cols.forEach((c) => {
    if (isTotalColumnCell(c, effectiveTotalColumnId)) {
      c.suppRspColumnValue = t;
    }
  });
}

function filterBasketRows(d: AuctionDetails | null, rows: TemplateRow[]): TemplateRow[] {
  if (!d) return rows;
  const b = d.isBasket;
  const isBasket =
    b === "Y" ||
    b === "y" ||
    b === true ||
    String(b ?? "").toLowerCase() === "yes";
  if (!isBasket) return rows;
  // For serial auctions show only the currently Active product in the proxy popup.
  const activeOnly = rows.filter(
    (item) => String(item.basketAuctionStatus ?? "").trim().toLowerCase() === "active"
  );
  if (activeOnly.length > 0) return activeOnly;
  return rows;
}

/** Merge editableBy/columnKey from event template — supplier response cells often omit them. */
function enrichPlaceProxyColumns(rows: TemplateRow[], details: AuctionDetails): TemplateRow[] {
  const defs = details.templateDef?.auAuctionEventTemplateColumnDefs as
    | {
        columnId?: number | string;
        columnName?: string;
        editableBy?: string;
        editable_by?: string;
      }[]
    | undefined;
  if (!defs?.length) return rows;
  const byColId = new Map<number, { columnName?: string; editableBy?: string }>();
  const byName = new Map<string, { editableBy?: string }>();
  for (const d of defs) {
    const id = Number(d.columnId);
    const name = String(d.columnName ?? "").trim();
    const ed = String(d.editableBy ?? d.editable_by ?? "").trim();
    if (Number.isFinite(id)) {
      byColId.set(id, { columnName: d.columnName, editableBy: ed || undefined });
    }
    if (name) {
      byName.set(name.toLowerCase(), { editableBy: ed || undefined });
    }
  }
  return rows.map((row) => ({
    ...row,
    columnResponseValues: (row.columnResponseValues ?? []).map((c) => {
      const cid = Number(c.columnId ?? c.column_id);
      let meta = Number.isFinite(cid) ? byColId.get(cid) : undefined;
      if (!meta && c.columnKey) {
        const byKey = byName.get(String(c.columnKey).trim().toLowerCase());
        if (byKey) {
          meta = { columnName: c.columnKey, editableBy: byKey.editableBy };
        }
      }
      const editableBy =
        c.editableBy ?? c.editable_by ?? meta?.editableBy;
      const columnKey = c.columnKey ?? meta?.columnName;
      return { ...c, columnKey, editableBy };
    }),
  }));
}

function isSupplierEditableCell(item: ColumnCell): boolean {
  const raw = item.editableBy ?? item.editable_by ?? "";
  return String(raw).trim().toLowerCase() === "supplier";
}

function columnKeyLower(item: ColumnCell): string {
  return String(item.columnKey ?? "").trim().toLowerCase();
}

/** Buyer proxy bid — allow common supplier bid columns even when template omits `editableBy: supplier`. */
function isPriceLikeColumnKey(item: ColumnCell): boolean {
  const k = columnKeyLower(item);
  if (!k) return false;
  return k.includes("price") || k === "amount" || k.includes("lumpsum");
}

function isQtyLikeColumnKey(item: ColumnCell): boolean {
  const k = columnKeyLower(item);
  return k === "quantity" || k === "qty" || k === "qnty" || k.includes("quantity");
}

/** Fallback when formula is absent: unit price × quantity (or just price when no qty column). */
function fallbackPriceTimesQty(row: TemplateRow): number | null {
  const cols = row.columnResponseValues ?? [];
  let price: number | null = null;
  let foundQty = false;
  let qty: number | null = null;
  for (const c of cols) {
    if (isTotalColumnCell(c)) continue;
    if (price == null && isPriceLikeColumnKey(c)) {
      const raw = String(c.suppRspColumnValue || c.suppRspColumn || c.columnValue || "");
      const n = parseFloat(raw.includes(" ") ? raw.split(" ")[0]! : raw);
      if (Number.isFinite(n)) price = n;
    }
    if (isQtyLikeColumnKey(c)) {
      foundQty = true;
      const raw = String(c.suppRspColumnValue || c.suppRspColumn || c.columnValue || "0");
      const n = parseFloat(raw.includes(" ") ? raw.split(" ")[0]! : raw);
      qty = Number.isFinite(n) ? n : 0;
    }
  }
  if (price == null) return null;
  return price * (foundQty ? (qty ?? 0) : 1);
}

function isPlaceProxyEditableCell(item: ColumnCell, totalColumnId?: number): boolean {
  if (isTotalColumnCell(item, totalColumnId)) return false;
  if (isSupplierEditableCell(item)) return true;
  return isPriceLikeColumnKey(item) || isQtyLikeColumnKey(item);
}

function responseColumnIdMatches(row: ColumnCell, targetColumnId: number | string): boolean {
  const a = row.columnId ?? row.column_id;
  const t = targetColumnId;
  if (String(t).trim() === "") return false;
  const na = Number(a);
  const nt = Number(t);
  if (Number.isFinite(na) && Number.isFinite(nt) && na === nt) return true;
  if (String(a ?? "").length && String(a) === String(t)) return true;
  return false;
}

function cellMatchesProxyTarget(
  row: ColumnCell,
  targetColumnId: number | string,
  targetColumnKey: string
): boolean {
  if (responseColumnIdMatches(row, targetColumnId)) return true;
  const k = columnKeyLower(row);
  if (!k || !targetColumnKey.trim()) return false;
  return k === targetColumnKey.trim().toLowerCase();
}

function deepCloneRows(rows: TemplateRow[]): TemplateRow[] {
  return JSON.parse(JSON.stringify(rows)) as TemplateRow[];
}

function mergeProxyRowsForUpdate(
  auction: AuctionDetails,
  placeRows: TemplateRow[],
  existingTemplateRows: TemplateRow[] | undefined
): TemplateRow[] {
  if (!existingTemplateRows?.length) return deepCloneRows(placeRows);
  const filtered = filterBasketRows(auction, placeRows);
  const merged = deepCloneRows(filtered);
  merged.forEach((item) => {
    const column = existingTemplateRows.find((r) => r.auRowId === item.auRowId);
    if (!column) return;
    item.id = column.id;
    delete (item as { mbdStatus?: unknown }).mbdStatus;
    delete (item as { validationValue?: unknown }).validationValue;
    item.lineItemTotal = item.lineItemTotal ?? column.lineItemTotal ?? undefined;
    item.lineItemBasePrice = item.lineItemBasePrice ?? column.lineItemBasePrice ?? undefined;
    item.columnResponseValues?.forEach((row) => {
      const val = column.columnResponseValues?.find(
        (v) => Number(v.columnId) === Number(row.columnId)
      );
      if (val) {
        row.id = val.id;
        row.suppRspColumnValue = row.suppRspColumnValue
          ? row.suppRspColumnValue
          : row.suppRspColumn;
      }
      delete row.editableBy;
      delete row.viewedBy;
    });
  });
  return merged;
}

const auctionStatusConfig: Record<
  string,
  {
    label: string;
    icon: typeof Clock;
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
> = {
  Draft: { label: "Draft", icon: FileText, variant: "secondary" },
  Scheduled: { label: "Scheduled", icon: Clock, variant: "outline", className: "border-blue-300 text-blue-600 dark:text-blue-400" },
  Active: { label: "Active", icon: Radio, variant: "outline", className: "border-green-300 text-green-600 dark:text-green-400" },
  Closed: { label: "Closed", icon: CheckCircle2, variant: "secondary" },
  Awarded: { label: "Awarded", icon: CheckCircle2, variant: "default" },
  "Pending Awarded": { label: "Pending Awarded", icon: Clock, variant: "outline", className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  "Award Under Process": { label: "Award Under Process", icon: Clock, variant: "outline", className: "border-orange-300 text-orange-600 dark:text-orange-400" },
  Withdraw: { label: "Withdrawn", icon: XCircle, variant: "destructive" },
  Cancel: { label: "Cancelled", icon: XCircle, variant: "destructive" },
};

function AuctionStatusBadge({ status }: { status: string }) {
  const config = auctionStatusConfig[status] ?? { label: status, icon: Clock, variant: "secondary" as const };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className || ""}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default function AuctionDetail() {
  const [, params] = useRoute("/app/auction-details/:id");
  const [, navigate] = useLocation();
  const auctionId = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("overview");
  const [utcNowMs, setUtcNowMs] = useState(() => Date.now());
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [mbdOpen, setMbdOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [tncOpen, setTncOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  const [priceCapViewOpen, setPriceCapViewOpen] = useState(false);
  const [compareBidsOpen, setCompareBidsOpen] = useState(false);
  const [bidSummaryOpen, setBidSummaryOpen] = useState(false);

  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [extendAmount, setExtendAmount] = useState("");
  const [extendUnit, setExtendUnit] = useState("Mins");
  const [mbdEdits, setMbdEdits] = useState<Record<string, string>>({});
  const [selectedSuppIds, setSelectedSuppIds] = useState<number[]>([]);
  const [addSupplierSearch, setAddSupplierSearch] = useState("");

  const [placeProxyOpen, setPlaceProxyOpen] = useState(false);
  const [proxySupplierId, setProxySupplierId] = useState<string>("");
  const [placeProxyRows, setPlaceProxyRows] = useState<TemplateRow[]>([]);
  const [supplierAuctionResponseList, setSupplierAuctionResponseList] = useState<unknown[]>([]);
  const [proxyTemplateId, setProxyTemplateId] = useState<number | undefined>(undefined);
  const [proxyCreatedBy, setProxyCreatedBy] = useState<string | undefined>(undefined);
  const [proxyCreationTime, setProxyCreationTime] = useState<string | undefined>(undefined);
  const [mergeTemplateRows, setMergeTemplateRows] = useState<TemplateRow[] | null>(null);
  const [proxyProof, setProxyProof] = useState<File | null>(null);
  const [proxyProofName, setProxyProofName] = useState("");
  const [proxyAttachErr, setProxyAttachErr] = useState(false);
  const [proxySupplierErr, setProxySupplierErr] = useState(false);
  const [proxyPriceError, setProxyPriceError] = useState(false);
  const [proxyPriceErrorFwd, setProxyPriceErrorFwd] = useState(false);
  const [proxyMbdError, setProxyMbdError] = useState(false);
  const proxyMbdSnapshotRef = useRef<Array<{ auRowId: number; mbd?: string; mbdExist?: boolean; price?: string | null }>>([]);

  const detailsQuery = useQuery({
    queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId],
    queryFn: async () => {
      const res = await apiRequest("GET",
        `/api/auctionEvents/getAuctionEventDetailsById/${auctionId}`
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as AuctionDetails | null;
    },
    enabled: !!auctionId,
    refetchInterval: 45_000,
  });

  const details = detailsQuery.data ?? null;
  const normalizedRows = useMemo(
    () => normalizeRows(details?.templateRows as TemplateRow[] | undefined),
    [details?.templateRows]
  );

  const allotmentType = String(details?.allotmentType ?? "");
  const isLotBased = allotmentType === "Lot Based";
  const isPartialBased = allotmentType === "Partial Based";
  const isBasket = details?.isBasket === "Y" || details?.isBasket === true;

  const orderActivityQuery = useQuery({
    queryKey: ["/api/auctionEvents/getOrderActivity", auctionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/auctionEvents/getOrderActivity/${auctionId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!auctionId,
  });

  const bidSummaryQuery = useQuery({
    queryKey: [
      "/api/auctionEvents/bidSummary",
      auctionId,
      allotmentType || "pending",
    ],
    queryFn: async () => {
      if (!auctionId) return null;
      if (isLotBased) {
        const res = await apiRequest("GET", `/api/auctionEvents/getBidSummary/${auctionId}`);
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
      const enc = encodeURIComponent(allotmentType);
      const res = await apiRequest("GET", 
        `/api/auctionEvents/getBidSummaryPartial/${auctionId}/${enc}`
      );
      if (!res.ok) throw new Error(await res.text());
      const partialData = await res.json();
      if (partialData != null) return partialData;
      const resHist = await apiRequest("GET", `/api/auctionEvents/getBidSummary/${auctionId}`);
      if (!resHist.ok) throw new Error(await resHist.text());
      return resHist.json();
    },
    enabled: !!auctionId && !!details?.allotmentType,
  });

  const suppliersQuery = useQuery({
    queryKey: ["/api/dbo/suppliers", "active-auction-invite"],
    queryFn: async () => {
      const res = await apiRequest("GET", 
        "/api/dbo/suppliers?page=1&limit=500&status=Active"
      );
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { data?: { id: number; companyName?: string }[] };
      return Array.isArray(j.data) ? j.data : [];
    },
    enabled: suppliersOpen,
  });

  const invitedSupplierIds = useMemo(
    () => new Set((details?.suppIds ?? []).map((s) => s.id)),
    [details?.suppIds]
  );

  const filteredSuppliersToAdd = useMemo(() => {
    const list = suppliersQuery.data ?? [];
    const available = list.filter((s) => !invitedSupplierIds.has(s.id));
    const q = addSupplierSearch.trim().toLowerCase();
    if (!q) return available;
    return available.filter((s) => (s.companyName ?? "").toLowerCase().includes(q));
  }, [suppliersQuery.data, invitedSupplierIds, addSupplierSearch]);

  const toggleAddSupplierSelection = (id: number) => {
    setSelectedSuppIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const placeProxySuppQuery = useQuery({
    queryKey: ["/api/auctionEvents/getAuctionEventDetailsBySupp", auctionId, proxySupplierId],
    queryFn: async () => {
      const res = await apiRequest("GET", 
        `/api/auctionEvents/getAuctionEventDetailsBySupp/${auctionId}/${proxySupplierId}`
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as Record<string, unknown>;
    },
    enabled: Boolean(auctionId && placeProxyOpen && proxySupplierId),
  });

  useEffect(() => {
    const id = setInterval(() => setUtcNowMs(Date.now()), 1000);
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      setUtcNowMs(Date.now());
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId] });
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getOrderActivity", auctionId] });
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/bidSummary", auctionId, allotmentType || "pending"] });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [auctionId, allotmentType, qc]);

  const endIso = getEffectiveEndTime(details);
  const timeLeft = useMemo(
    () => formatCountdown(endIso ?? undefined, utcNowMs),
    [endIso, utcNowMs]
  );

  const partialRankings = useMemo(() => computePartialRankings(details), [details]);
  const lotRankings = useMemo(() => computeLotRankings(details), [details]);
  const basketLeadingSuppliers = useMemo(() => computeBasketLeadingSuppliers(details), [details]);

  const { totalFormula, totalColumnId } = useMemo(() => {
    const source = (placeProxySuppQuery.data as Record<string, unknown> | undefined) ?? details ?? {};
    const sourceAny = source as Record<string, unknown>;
    const templateDef =
      (sourceAny.templateDef as { auAuctionEventTemplateColumnDefs?: unknown[] } | undefined) ??
      (sourceAny.template_def as { au_auction_event_template_column_defs?: unknown[] } | undefined);

    const defsRaw =
      (templateDef as { auAuctionEventTemplateColumnDefs?: unknown[] })?.auAuctionEventTemplateColumnDefs ??
      (templateDef as { au_auction_event_template_column_defs?: unknown[] })
        ?.au_auction_event_template_column_defs ??
      [];

    const defs = Array.isArray(defsRaw)
      ? (defsRaw as Array<{
          columnId?: number | string;
          column_id?: number | string;
          columnName?: string;
          column_name?: string;
          formula?: string;
        }>)
      : [];

    const isTotalName = (name: string) => {
      const n = name.trim().toLowerCase();
      return (
        n === "total" ||
        n === "line total" ||
        n === "grand total" ||
        n === "net total" ||
        n.includes("total")
      );
    };

    const t = defs.find((c) =>
      isTotalName(String(c.columnName ?? c.column_name ?? ""))
    );
    const withFormula = defs.find((c) => String(c.formula ?? "").trim() !== "");
    const chosen = t ?? withFormula;
    const chosenName = String(chosen?.columnName ?? chosen?.column_name ?? "").trim();
    const cid = chosen?.columnId ?? chosen?.column_id;
    let columnId =
      cid != null && cid !== "" && Number.isFinite(Number(cid)) ? Number(cid) : undefined;

    // Fallback: infer from visible rows when template defs miss/omit column id.
    if (columnId == null) {
      const rows =
        ((sourceAny.templateRows as TemplateRow[] | undefined) ??
          (sourceAny.template_rows as TemplateRow[] | undefined) ??
          details?.templateRows) ??
        [];
      for (const row of rows) {
        const cols = row.columnResponseValues ?? row.auctionEventRowColumn ?? [];
        const totalCell = cols.find((c) => isTotalColumnCell(c));
        if (!totalCell) continue;
        const inferred = Number(totalCell.columnId ?? totalCell.column_id);
        if (Number.isFinite(inferred)) {
          columnId = inferred;
          break;
        }
      }
    }

    // Fallback 2: use chosen total column name to find matching row cell id.
    if (columnId == null && chosenName) {
      const rows =
        ((sourceAny.templateRows as TemplateRow[] | undefined) ??
          (sourceAny.template_rows as TemplateRow[] | undefined) ??
          details?.templateRows) ??
        [];
      const wanted = chosenName.toLowerCase();
      for (const row of rows) {
        const cols = row.columnResponseValues ?? row.auctionEventRowColumn ?? [];
        const match = cols.find(
          (c) => String(c.columnKey ?? "").trim().toLowerCase() === wanted
        );
        if (!match) continue;
        const inferred = Number(match.columnId ?? match.column_id);
        if (Number.isFinite(inferred)) {
          columnId = inferred;
          break;
        }
      }
    }

    // Fallback 3: when defs have order but missing ids/keys, map by chosen definition index.
    if (columnId == null && chosen) {
      const chosenIndex = defs.indexOf(chosen);
      if (chosenIndex >= 0) {
        const rows =
          ((sourceAny.templateRows as TemplateRow[] | undefined) ??
            (sourceAny.template_rows as TemplateRow[] | undefined) ??
            details?.templateRows) ??
          [];
        for (const row of rows) {
          const cols = row.columnResponseValues ?? row.auctionEventRowColumn ?? [];
          const byIndex = cols[chosenIndex];
          if (!byIndex) continue;
          const inferred = Number(byIndex.columnId ?? byIndex.column_id);
          if (Number.isFinite(inferred)) {
            columnId = inferred;
            break;
          }
        }
      }
    }

    return { totalFormula: chosen?.formula ?? "", totalColumnId: columnId };
  }, [details, placeProxySuppQuery.data]);

  useEffect(() => {
    if (!placeProxyOpen) {
      setPlaceProxyRows([]);
      setSupplierAuctionResponseList([]);
      setMergeTemplateRows(null);
      setProxyTemplateId(undefined);
      return;
    }
    if (!proxySupplierId || !placeProxySuppQuery.data || !details) return;
    const data = placeProxySuppQuery.data;
    const list = (data.auAuctionSuppResponseEventList ?? []) as {
      id?: number;
      templateResponseRows?: TemplateRow[];
    }[];
    const first = list[0];
    const templateRowsFromSupp =
      (data.templateRows as TemplateRow[] | undefined) ??
      (data.template_rows as TemplateRow[] | undefined);
    const templateRowsFromBuyer =
      (details.templateRows as TemplateRow[] | undefined) ??
      (details as { template_rows?: TemplateRow[] }).template_rows;

    let rows: TemplateRow[];
    if (first?.templateResponseRows?.length) {
      rows = deepCloneRows(first.templateResponseRows);
      setMergeTemplateRows(deepCloneRows(first.templateResponseRows));
    } else {
      rows = normalizeRows(templateRowsFromSupp ?? templateRowsFromBuyer);
      setMergeTemplateRows(null);
    }
    const detailsForEnrich: AuctionDetails = {
      ...details,
      templateDef:
        details.templateDef ??
        (data.templateDef as AuctionDetails["templateDef"]) ??
        (data.template_def as AuctionDetails["templateDef"]),
    };
    rows = enrichPlaceProxyColumns(rows, detailsForEnrich);

    // Overlay basketAuctionStatus from buyer details rows (supplier response rows don't carry it)
    const buyerRows = (details.templateRows as TemplateRow[] | undefined) ?? [];
    const statusByRowId = new Map(
      buyerRows.map((r) => [Number(r.auRowId ?? r.id), r.basketAuctionStatus])
    );
    rows = rows.map((r) => ({
      ...r,
      basketAuctionStatus:
        r.basketAuctionStatus ?? statusByRowId.get(Number(r.auRowId ?? r.id)),
    }));

    rows.forEach((row) => {
      (row.columnResponseValues ?? []).forEach((c) => {
        if (!c.suppRspColumn) {
          c.suppRspColumn = c.suppRspColumnValue || c.columnValue || "";
        }
      });
      applyTotalToLineItem(row, totalFormula, totalColumnId);
    });
    setPlaceProxyRows(rows);
    setSupplierAuctionResponseList(list);
    setProxyTemplateId(first?.id);
    setProxyCreatedBy(data.createdBy as string | undefined);
    setProxyCreationTime(data.creationTime as string | undefined);
    setProxyPriceError(false);
    setProxyPriceErrorFwd(false);
    setProxyMbdError(false);
    // Build per-row snapshot of MBD values and baseline prices for validation.
    proxyMbdSnapshotRef.current = rows.map((row) => {
      const snap: { auRowId: number; mbd?: string; mbdExist?: boolean; price?: string | null } = {
        auRowId: Number(row.auRowId ?? row.id),
      };
      for (const col of row.columnResponseValues ?? []) {
        if (col.columnKey === "Minimum Bid Difference") {
          snap.mbd = col.columnValue ?? undefined;
          snap.mbdExist = true;
        } else if (isPriceLikeColumnKey(col)) {
          snap.price = (col.suppRspColumn as string | null) ?? col.suppRspColumnValue ?? null;
        }
      }
      return snap;
    });
  }, [
    placeProxyOpen,
    proxySupplierId,
    placeProxySuppQuery.data,
    details?.id,
    details?.templateRows,
    details?.templateDef,
    totalFormula,
    totalColumnId,
  ]);

  const columnKeys = useMemo(() => {
    const keys = new Set<string>();
    normalizedRows.forEach((r) => {
      (r.columnResponseValues ?? []).forEach((c) => {
        if (c.columnKey) keys.add(c.columnKey);
      });
    });
    return Array.from(keys);
  }, [normalizedRows]);

  const invitedIds = useMemo(
    () => new Set((details?.suppIds ?? []).map((s) => s.id)),
    [details?.suppIds]
  );

  const mbdTargetRow = useMemo(() => {
    return normalizedRows.find((row) =>
      (row.columnResponseValues ?? []).some((c) => c.columnKey === "Minimum Bid Difference")
    );
  }, [normalizedRows]);

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auctionEvents/broadcastMessage", {
          auctionId: Number(auctionId),
          broadCastMessage: broadcastMessage,
        });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Message broadcast" });
      setBroadcastOpen(false);
      setBroadcastMessage("");
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId] });
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getOrderActivity", auctionId] });
    },
    onError: (e: Error) => toast({ title: "Broadcast failed", description: e.message, variant: "destructive" }),
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auctionEvents/withdrawAuction", {
          auctionId: Number(auctionId),
          withdrawReason: withdrawReason,
          isAuctionWithDraw: true,
        });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Auction withdrawn" });
      setWithdrawOpen(false);
      setWithdrawReason("");
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId] });
    },
    onError: (e: Error) => toast({ title: "Withdraw failed", description: e.message, variant: "destructive" }),
  });

  const extendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auctionEvents/extendTimeRemain", {
          auctionId: Number(auctionId),
          extendTime: extendAmount,
          extendTimeUnits: extendUnit,
        });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Time extended" });
      setExtendOpen(false);
      setExtendAmount("");
      void qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId] });
      window.location.reload();
    },
    onError: (e: Error) => toast({ title: "Extend failed", description: e.message, variant: "destructive" }),
  });

  const mbdMutation = useMutation({
    mutationFn: async () => {
      const products = Object.entries(mbdEdits).map(([key, mbdvalue]) => {
        const separatorIdx = key.indexOf(":");
        const auRowId = key.slice(0, separatorIdx);
        const columnId = key.slice(separatorIdx + 1);
        return {
          auRowId: Number(auRowId),
          columnId,
          mbdvalue,
        };
      });
      const res = await apiRequest("POST", "/api/auctionEvents/updateMinBidDiff", {
          auctionId: Number(auctionId),
          products,
        });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Minimum bid difference updated" });
      setMbdOpen(false);
      setMbdEdits({});
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const addSuppliersMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSuppIds.length) throw new Error("Select at least one supplier");
      const ids = selectedSuppIds.join(",");
      const res = await apiRequest("POST", 
        `/api/auctionEvents/addAuctionSuppliers/${auctionId}/${ids}`,
      );
      if (!res.ok) {
        const t = await res.text();
        try {
          const j = JSON.parse(t);
          throw new Error(j.message ?? t);
        } catch {
          throw new Error(t);
        }
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Suppliers added" });
      setSuppliersOpen(false);
      setSelectedSuppIds([]);
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId] });
    },
    onError: (e: Error) => toast({ title: "Could not add suppliers", description: e.message, variant: "destructive" }),
  });

  const copyAuctionMutation = useMutation({
    mutationFn: async () => {
      if (!auctionId) throw new Error("Auction ID not found");
      const res = await apiRequest("POST", `/api/auctionEvents/copyAuction/${auctionId}`);
      let message = "";
      try {
        const j = (await res.json()) as { message?: string } | string;
        message = typeof j === "string" ? j : (j.message ?? "");
      } catch {
        message = await res.text();
      }
      if (!res.ok || /error/i.test(message)) {
        throw new Error(message || "Unable to copy auction");
      }
      return message;
    },
    onSuccess: () => {
      toast({ title: "Auction copied successfully" });
    },
    onError: (e: Error) =>
      toast({ title: "Copy auction failed", description: e.message, variant: "destructive" }),
  });

  const deleteBidSummaryMutation = useMutation({
    mutationFn: async ({
      supplierId,
      historyId,
    }: {
      supplierId: number;
      historyId: number;
    }) => {
      const res = await apiRequest("POST", 
        `/api/auctionEvents/deleteResponse/${auctionId}/${supplierId}/${historyId}`,
      );
      let msg = "";
      try {
        const j = (await res.json()) as { message?: string } | string;
        msg = typeof j === "string" ? j : (j.message ?? "");
      } catch {
        msg = await res.text();
      }
      if (msg && /error/i.test(msg)) throw new Error(msg);
      if (!res.ok) throw new Error(msg || "Delete failed");
      return msg;
    },
    onSuccess: () => {
      toast({ title: "Bid Response Deleted Successfully" });
      void bidSummaryQuery.refetch();
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not delete bid", description: e.message, variant: "destructive" }),
  });

  const deleteAuctionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/auctionEvents/${auctionId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auctionEvents"] });
      toast({
        title: "Auction Deleted",
        description: "The auction has been marked as deleted.",
      });
      navigate("/app/auctions");
    },
    onError: (e: Error) =>
      toast({
        title: "Could not delete auction",
        description: e.message,
        variant: "destructive",
      }),
  });

  const handlePlaceProxyCellChange = useCallback(
    (
      rowId: number,
      columnId: number | string,
      columnKey: string,
      value: string,
      runPriceValidation: boolean
    ) => {
      if (!details) return;
      setPlaceProxyRows((prev) => {
        const next = deepCloneRows(prev);
        let revErr = false;
        let fwdErr = false;
        next.forEach((item) => {
          if (item.auRowId !== rowId) return;
          item.columnResponseValues?.forEach((row) => {
            if (!cellMatchesProxyTarget(row, columnId, columnKey)) return;
            const isPriceLike = isPriceLikeColumnKey(row);

            if (runPriceValidation && isPriceLike) {
              const newPrice = parseFloat(value);
              const baselineRaw =
                row.suppRspColumn != null && String(row.suppRspColumn).trim() !== ""
                  ? row.suppRspColumn
                  : row.columnValue ?? "0";
              const existingPrice = parseFloat(
                String(baselineRaw).includes(" ")
                  ? String(baselineRaw).split(" ")[0]!
                  : String(baselineRaw)
              );
              if (
                details.auctionType === "Forward Auction" &&
                Number.isFinite(newPrice) &&
                Number.isFinite(existingPrice) &&
                newPrice < existingPrice
              ) {
                fwdErr = true;
              }
              if (
                details.auctionType === "Reverse Auction" &&
                Number.isFinite(newPrice) &&
                Number.isFinite(existingPrice) &&
                newPrice > existingPrice
              ) {
                revErr = true;
              }

              // Minimum Bid Difference check
              const mbdSnap = proxyMbdSnapshotRef.current.find(
                (m) => m.auRowId === Number(item.auRowId ?? (item as { id?: number }).id)
              );
              if (mbdSnap?.mbdExist) {
                const finalMbd = mbdSnap.mbd ? parseFloat(mbdSnap.mbd) : 0;
                const baselinePrice = mbdSnap.price ? parseFloat(String(mbdSnap.price)) : 0;
                if (
                  Number.isFinite(finalMbd) && finalMbd > 0 &&
                  Number.isFinite(newPrice) &&
                  Number.isFinite(baselinePrice) && baselinePrice > 0
                ) {
                  const diff =
                    details.auctionType === "Forward Auction"
                      ? newPrice - baselinePrice
                      : baselinePrice - newPrice;
                  item.mbdStatus = diff < finalMbd;
                  item.validationValue = item.mbdStatus
                    ? (details.auctionType === "Forward Auction"
                        ? baselinePrice + finalMbd
                        : baselinePrice - finalMbd)
                    : undefined;
                } else {
                  item.mbdStatus = false;
                }
              }
            }

            row.suppRspColumnValue = value;
            if (isPriceLike) {
              item.lineItemBasePrice = value as unknown as TemplateRow["lineItemBasePrice"];
            }
          });
          applyTotalToLineItem(item, totalFormula, totalColumnId);
        });
        if (runPriceValidation) {
          const mbdErr = next.some((r) => r.mbdStatus === true);
          queueMicrotask(() => {
            setProxyPriceError(revErr);
            setProxyPriceErrorFwd(fwdErr);
            setProxyMbdError(mbdErr);
          });
        }
        return next;
      });
    },
    [details, totalFormula, totalColumnId]
  );

  const handlePlaceProxyBlur = useCallback(
    (rowId: number, columnId: number | string, columnKey: string, value: string) => {
      handlePlaceProxyCellChange(rowId, columnId, columnKey, value, true);
    },
    [handlePlaceProxyCellChange]
  );

  const placeProxyMutation = useMutation({
    mutationFn: async () => {
      if (!details || !auctionId) throw new Error("Missing auction");
      if (!proxySupplierId) throw new Error("Select a supplier");
      if (!proxyProof) throw new Error("Attach proof");
      const sid = Number(proxySupplierId);
      if (!Number.isFinite(sid)) throw new Error("Invalid supplier");
      if (proxyPriceError || proxyPriceErrorFwd) {
        throw new Error(
          details.auctionType === "Reverse Auction"
            ? "New price is greater than the existing price"
            : "New price is lesser than the existing price"
        );
      }
      if (proxyMbdError) {
        const failRow = placeProxyRows.find((r) => r.mbdStatus === true);
        const expected = failRow?.validationValue;
        throw new Error(
          expected != null
            ? `Price does not meet the Minimum Bid Difference. Expected: ${expected}`
            : "Price does not meet the Minimum Bid Difference requirement"
        );
      }

      const hasExisting =
        Array.isArray(supplierAuctionResponseList) && supplierAuctionResponseList.length > 0;

      const activeRows = filterBasketRows(details, placeProxyRows);
      if (!activeRows.length) throw new Error("No line items");

      if (hasExisting) {
        const rows = mergeProxyRowsForUpdate(details, placeProxyRows, mergeTemplateRows ?? undefined);
        const filtered = filterBasketRows(details, rows);
        const finalTotal = filtered.reduce((a, v) => a + Number(v.lineItemTotal ?? 0), 0);
        const fd = new FormData();
        fd.append(
          "payload",
          JSON.stringify({
            auctionId: Number(auctionId),
            auctionTotal: finalTotal,
            supplierId: sid,
            templateResponseRows: filtered,
            id: proxyTemplateId,
            creationTime: proxyCreationTime,
            createdBy: proxyCreatedBy,
            placeProxy: "Y",
          })
        );
        fd.append("placeProxy", proxyProof);
        const res = await apiRequest("POST", "/api/auctionEvents/updateAuctionSuppRespEvents", fd);
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }

      const rowsNew = deepCloneRows(filterBasketRows(details, placeProxyRows));
      rowsNew.forEach((item) => {
        (item as { savingsLineItemPrice?: unknown }).savingsLineItemPrice = null;
        item.leadingPrice = undefined;
        item.savingsLineItemPercentage = undefined;
        item.columnResponseValues?.forEach((row) => {
          delete row.editableBy;
          delete row.viewedBy;
          delete (row as ColumnCell).suppRspColumn;
        });
      });
      const finalTotal = rowsNew.reduce((a, v) => a + Number(v.lineItemTotal ?? 0), 0);
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          auctionId: Number(auctionId),
          auctionTotal: finalTotal,
          supplierId: sid,
          templateResponseRows: rowsNew,
          placeProxy: "Y",
        })
      );
      fd.append("placeProxy", proxyProof);
      let res = await apiRequest("POST", "/api/auctionEvents/sendAuctionSuppRespEvents", fd);
      if (!res.ok) {
        const errText = await res.text();
        const merged = mergeProxyRowsForUpdate(
          details,
          placeProxyRows,
          mergeTemplateRows ?? undefined
        );
        const filtered = filterBasketRows(details, merged);
        const ft = filtered.reduce((a, v) => a + Number(v.lineItemTotal ?? 0), 0);
        const res2 = await apiRequest("POST", "/api/auctionEvents/updateAuctionSuppRespEvents", {
            auctionId: Number(auctionId),
            auctionTotal: ft,
            supplierId: sid,
            templateResponseRows: filtered,
            id: proxyTemplateId,
            creationTime: proxyCreationTime,
            createdBy: proxyCreatedBy,
          });
        if (!res2.ok) throw new Error(errText || (await res2.text()));
        return res2.json();
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Response submitted" });
      setPlaceProxyOpen(false);
      setProxySupplierId("");
      setProxyProof(null);
      setProxyProofName("");
      void qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", auctionId] });
      void qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getOrderActivity", auctionId] });
      void qc.invalidateQueries({ queryKey: ["/api/auctionEvents/bidSummary", auctionId, allotmentType || "pending"] });
      void qc.invalidateQueries({ queryKey: ["/api/auctionEvents/getAuctionEventDetailsBySupp", auctionId, proxySupplierId] });
    },
    onError: (e: Error) =>
      toast({ title: "Place proxy failed", description: e.message, variant: "destructive" }),
  });

  const onMbdFieldChange = useCallback(
    (auRowId: number, columnId: number, value: string) => {
      setMbdEdits((prev) => ({ ...prev, [`${auRowId}:${columnId}`]: value }));
    },
    []
  );

  const openMbdDialog = useCallback(() => {
    const next: Record<string, string> = {};
    normalizedRows.forEach((row) => {
      const mbd = (row.columnResponseValues ?? []).find(
        (c) => c.columnKey === "Minimum Bid Difference"
      );
      if (mbd?.columnId != null && row.auRowId != null) {
        next[`${row.auRowId}:${mbd.columnId}`] = mbd.columnValue ?? "";
      }
    });
    setMbdEdits(next);
    setMbdOpen(true);
  }, [normalizedRows]);

  if (detailsQuery.isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (detailsQuery.error || !details) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
            <h3 className="text-base font-medium mb-1">Auction Not Found</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {detailsQuery.error instanceof Error
                ? detailsQuery.error.message
                : "Unable to load auction details"}
            </p>
            <Link href="/app/auctions">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Auctions
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const name = String(details.name ?? `Auction #${auctionId}`);
  const status = String(details.status ?? "—");
  const isWithdraw = status === "Withdraw";
  const isScheduled = status === "Scheduled";
  const isClosed = status === "Closed" || status === "Awarded" || status === "Pending Awarded" || status === "Cancel" || status === "Award Under Process" || status === "Withdraw";
  const proxyActionsAllowed =
    !isScheduled &&
    status !== "Closed" &&
    status !== "Pending Awarded" &&
    status !== "Awarded" &&
    status !== "Cancel" && status !== "Withdraw" && status !== "Award Under Process";
  const currency = String(details.currency ?? "INR");
  const prNumber =
    (details as { prNumber?: string }).prNumber ??
    (details as { pr_number?: string }).pr_number ??
    "";

  const grossSavingsMeasure = (details as any).auctionSavingMeasure === "Gross Item";
  const anySavingsAmount = normalizedRows.some((r) => r.savingsAmount) || grossSavingsMeasure;
  const hasSavings = anySavingsAmount || (details.tncs?.length ?? 0) > 0;
  const hasSupplierWisePriceCap = normalizedRows.some((r) => (r.suppWiseCap?.length ?? 0) > 0);
  const supplierWisePriceCapRows = normalizedRows.flatMap((row, idx) => {
    const itemName =
      (row.columnResponseValues ?? []).find((c) => c.columnKey === "Item Name")?.columnValue ??
      `Row ${idx + 1}`;
    return (row.suppWiseCap ?? []).map((cap, i) => ({
      key: `${row.auRowId ?? row.id ?? idx}-${cap.suppId ?? i}`,
      rowId: row.auRowId ?? row.id ?? idx + 1,
      itemName,
      supplierName: cap.supplierName ?? (cap.suppId != null ? `Supplier #${cap.suppId}` : "—"),
      price: cap.price ?? "0",
    }));
  });

  const orderRows = Array.isArray(orderActivityQuery.data)
    ? orderActivityQuery.data
    : orderActivityQuery.data
      ? [orderActivityQuery.data]
      : [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app/auctions">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <Trophy className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{name}</h1>
              <AuctionStatusBadge status={status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {details.auctionType ?? "—"} · {details.orgDetails?.organizationName ?? "—"}
              {prNumber ? ` · PR: ${prNumber}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
            {/* <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  data-testid="button-delete-auction"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Auction</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this auction? It will be marked as
                    deleted and removed from active lists.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-delete-auction-cancel">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteAuctionMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-delete-auction-confirm"
                  >
                    {deleteAuctionMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog> */}
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={isWithdraw}
            onClick={() => setCompareBidsOpen(true)}
          >
            <Scale className="h-4 w-4 mr-2" />
            Compare Bids
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={isWithdraw || !details?.allotmentType}
            onClick={() => {
              setBidSummaryOpen(true);
              void bidSummaryQuery.refetch();
            }}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Bid Summary
          </Button>
          {(status === "Award Under Process" || status === "Withdraw" || status === "Awarded") && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/auction-details/${auctionId}/awards`}>
                <ListOrdered className="h-4 w-4 mr-2" />
                Bid Awards
              </Link>
            </Button>
          )}
          {(status === "Pending Awarded" || status === "Withdraw" || status === "Award Under Process") && (
            <Button variant="default" size="sm" asChild>
              <Link href={`/app/auction-details/${auctionId}/award`}>
                <Gavel className="h-4 w-4 mr-2" />
                Proceed
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Event Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 px-4 pb-4 pt-0">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Allotment</p>
            <p className="text-sm font-medium">{allotmentType || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Strategy</p>
            <p className="text-sm font-medium">{details.auctionStrategy ?? "—"}</p>
          </div>
          {details.deliveryDate ? (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Delivery Date</p>
              <p className="text-sm font-medium">{formatDate(details.deliveryDate)}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Time Remaining</p>
            <p className="text-sm font-medium flex items-center gap-2">
              {timeLeft}
              {!isScheduled && timeLeft !== "Closed" && timeLeft !== "—" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setExtendOpen(true)}
                  aria-label="Extend time"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </p>
          </div>
        </CardContent>
        {!isScheduled && (
          <CardContent className="px-4 pb-4 pt-0 flex flex-wrap gap-2">
            {!isClosed && (
              <Button variant="outline" size="sm" disabled={isWithdraw} onClick={() => setBroadcastOpen(true)}>
                <Megaphone className="h-4 w-4 mr-2" />
                Broadcast
              </Button>
            )}
            {!isClosed && (
              <Button variant="outline" size="sm" disabled={isWithdraw} onClick={() => setWithdrawOpen(true)}>
                <LogOut className="h-4 w-4 mr-2" />
                Withdraw
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyAuctionMutation.mutate()}
              disabled={copyAuctionMutation.isPending || !auctionId}
            >
              {copyAuctionMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Copy Auction
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openMbdDialog}
              disabled={isWithdraw || !mbdTargetRow || isClosed || status === "Pending Awarded" || status === "Awarded" || status === "Cancel" || status === "Award Under Process"}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit Min. Bid Diff
            </Button>
            {proxyActionsAllowed ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isWithdraw}
                onClick={() => {
                  setPlaceProxyOpen(true);
                  setProxySupplierId("");
                  setProxyProof(null);
                  setProxyProofName("");
                  setProxyAttachErr(false);
                  setProxySupplierErr(false);
                }}
              >
                <Handshake className="h-4 w-4 mr-2" />
                Place Proxy
              </Button>
            ) : null}
          </CardContent>
        )}
  </Card>

      {(anySavingsAmount || (details.tncs?.length ?? 0) > 0) && hasSavings ? (
        <div className="flex flex-wrap gap-4 text-sm">
          {anySavingsAmount ? (
            <button
              type="button"
              onClick={() => setSavingsOpen(true)}
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <Sparkles className="h-4 w-4" />
              Savings
            </button>
          ) : null}
          {(details.tncs?.length ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => setTncOpen(true)}
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <FileText className="h-4 w-4" />
              Terms and conditions
            </button>
          ) : null}
        </div>
      ) : null}

      {isLotBased ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Lot Leading Price
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-2xl font-semibold">
                  {money(details.lotLeadingPrice)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">{currency}</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  {details.auctionType === "Forward Auction" ? "Premium" : "Savings"}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-2xl font-semibold">
                  {money(details.savingsPrice)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">{currency}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {details.savingsPercentage != null
                    ? `${Number(details.savingsPercentage).toFixed(1)}%`
                    : "N/A"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 text-sm space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start</p>
                  <p className="font-medium">{formatDateTime(details.startTime)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">End</p>
                  <p className="font-medium">{formatDateTime(details.endTime)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Ranking
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lotRankings.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {lotRankings.map((supplier, idx) => (
                    <AuctionRankingCard
                      key={`${supplier.supplierName ?? "supplier"}-${idx}`}
                      rank={Number(supplier.suppRank ?? idx + 1)}
                      nameLine={supplier.supplierName ?? "—"}
                      dateLine={supplier.bidTime ? formatDate(supplier.bidTime) : "NA"}
                      amountLine={`${money(supplier.auctionTotal)} ${supplier.currency ?? ""}`.trim()}
                      bidsLabel={
                        supplier.attribute1 != null ? String(supplier.attribute1) : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <RankingEmptyState />
              )}
            </CardContent>
          </Card>
        </div>
      ) : isBasket ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Products</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {normalizedRows.map((row, i) => {
              const productName =
                (row.columnResponseValues ?? []).find((c) => c.columnKey === "Item Name")
                  ?.columnValue ?? `Row ${i + 1}`;
              const rowStatus = row.basketAuctionStatus;
              const statusBadgeCls =
                rowStatus === "Active"
                  ? "bg-green-500 text-white"
                  : rowStatus === "Open"
                    ? "bg-yellow-400 text-foreground"
                    : "bg-red-500 text-white";
              const timerText =
                rowStatus === "Active" && row.endTime
                  ? `Ends in: ${formatCountdown(row.endTime, utcNowMs)}`
                  : rowStatus === "Open" && row.startTime
                    ? `Starts in: ${formatCountdown(row.startTime, utcNowMs)}`
                    : null;
              return (
                <div
                  key={row.auRowId ?? i}
                  className="relative min-w-[200px] max-w-[240px] shrink-0 rounded-lg border-2 border-blue-100 bg-blue-50 p-4"
                >
                  {rowStatus ? (
                    <span
                      className={`absolute top-2 right-2 rounded px-2 py-0.5 text-xs font-semibold ${statusBadgeCls}`}
                    >
                      {rowStatus === "Open" ? "Upcoming" : rowStatus}
                    </span>
                  ) : null}
                  <p className="mb-3 pr-16 text-sm font-bold line-clamp-2">{String(productName)}</p>
                  <p className="text-xs text-muted-foreground">Leading Price:</p>
                  <p className="mb-2 text-sm font-bold">
                    {money(row.leadingPrice)} {currency}
                  </p>
                  <p className="text-xs text-muted-foreground">Leading Supplier:</p>
                  <p className="text-sm font-bold">
                    {basketLeadingSuppliers.get(Number(row.auRowId)) ?? "N/A"}
                  </p>
                  {timerText ? (
                    <p
                      className={`mt-2 text-xs font-medium tabular-nums ${
                        rowStatus === "Active" ? "text-green-700" : "text-yellow-700"
                      }`}
                    >
                      {timerText}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Line-level leading prices</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {normalizedRows.map((row, i) => (
              <Card key={row.auRowId ?? i} className="min-w-[220px] shrink-0">
                <CardHeader className="py-3">
                  <CardTitle className="text-xs font-normal line-clamp-2">
                    {(row.columnResponseValues ?? []).find((c) => c.columnKey === "Item Name")
                      ?.columnValue ?? `Row ${i + 1}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm">
                  <p className="text-muted-foreground">Leading</p>
                  <p className="text-lg font-semibold">
                    {money(row.leadingPrice)} {currency}
                  </p>
                  {row.savingsLineItemPrice != null ? (() => {
                    const savAmt = Number(row.savingsLineItemPrice);
                    const leadVal = Number(row.leadingPrice ?? 0);
                    const pct = leadVal > 0 ? (savAmt / leadVal) * 100 : null;
                    return (
                      <p
                        className={`text-xs mt-1 font-medium ${
                          savAmt < 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        Savings: {money(savAmt)} {currency}
                        {pct != null ? ` (${pct.toFixed(1)}%)` : ""}
                      </p>
                    );
                  })() : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!isLotBased && (isPartialBased || partialRankings.length > 0) ? (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Ranking
            </CardTitle>
          </CardHeader>
          <CardContent>
            {partialRankings.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {partialRankings.map((r, i) => (
                  <AuctionRankingCard
                    key={`${r.prodName}-${i}`}
                    rank={r.rank}
                    nameLine={r.prodName}
                    nameLine2={r.suppName}
                    dateLine={r.bidDate ? formatDate(r.bidDate) : "NA"}
                    bidsLabel={r.bidCount != null ? String(r.bidCount) : undefined}
                  />
                ))}
              </div>
            ) : isPartialBased ? (
              <RankingEmptyState />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Line items</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Auction Details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Auction ID</p>
                  <p className="font-medium">{auctionId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                  <AuctionStatusBadge status={status} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start Date</p>
                  <p className="font-medium">{formatDateTime(details.startTime)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">End Date</p>
                  <p className="font-medium">{formatDateTime(details.endTime)}</p>
                </div>
                {(details.isBasket === "Y" || details.isBasket === true) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Serial Auction</p>
                    <p className="font-medium">Yes</p>
                  </div>
                )}
                {details.isScheduledEvent && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Scheduled Event</p>
                    <p className="font-medium">Yes</p>
                  </div>
                )}
                {details.acutiontTimeExtensionInMins ? (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Auto Extension</p>
                    <p className="font-medium">
                      Extends by {details.acutiontTimeExtensionInMins} {details.acutiontTimeExtensionInMinsUnit ?? ""}
                      {details.ifBidInLastMinutesInMins
                        ? `, if a bid in last ${details.ifBidInLastMinutesInMins} ${details.ifBidInLastMinutesInMinsUnit ?? ""}`
                        : ""}
                    </p>
                  </div>
                ) : null}
                {totalFormula ? (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Total Formula</p>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{totalFormula}</code>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListOrdered className="h-4 w-4" />
                Line Items
              </CardTitle>
              {hasSupplierWisePriceCap ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPriceCapViewOpen(true)}
                >
                  Supplier price cap
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {normalizedRows.length === 0 ? (
                <p className="text-muted-foreground text-sm">No line items.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>id</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Delivery Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {normalizedRows.map((row, i) => {
                      const map = rowColumnMap(row);
                      return (
                        <TableRow key={row.auRowId ?? i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{row.auRowId ?? row.id ?? "—"}</TableCell>
                          <TableCell className="max-w-[240px] whitespace-normal">
                            {map["Item Name"] ?? "—"}
                          </TableCell>
                          <TableCell>{map["Quantity"] ?? "—"}</TableCell>
                          <TableCell className="max-w-[260px] whitespace-normal">
                            {map["Delivery Location"] ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Invited Suppliers
              </CardTitle>
              {!isScheduled && proxyActionsAllowed && (
                <Button variant="outline" size="sm" onClick={() => setSuppliersOpen(true)}>
                  <Users className="w-4 h-4 mr-2" />
                  Add supplier
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Company</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(details.suppIds ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        No suppliers linked yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (details.suppIds ?? []).map((s, i) => (
                      <TableRow key={s.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>{supplierInviteName(s)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Order Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orderActivityQuery.isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : orderRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderRows.map((row: any, i: number) => {
                      const when =
                        row.creationTime ??
                        row.creation_time ??
                        row.createdAt ??
                        row.created_at;
                      const byRaw = row.createdBy ?? row.created_by ?? row.user ?? row.user_name;
                      const by = (() => {
                        if (!byRaw) return "—";
                        if (typeof byRaw === "string" && byRaw.trimStart().startsWith("{")) {
                          try {
                            const p = JSON.parse(byRaw);
                            return p.name ?? p.userName ?? p.email ?? byRaw;
                          } catch { return byRaw; }
                        }
                        return byRaw;
                      })();
                      return (
                        <TableRow key={i}>
                          <TableCell className="whitespace-nowrap">
                            {when ? formatDate(when) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[480px]">
                            {row.activity ?? row.message ?? JSON.stringify(row)}
                          </TableCell>
                          <TableCell>{by}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bidSummary">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Bid Summary
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!details?.allotmentType}
                onClick={() => {
                  setBidSummaryOpen(true);
                  void bidSummaryQuery.refetch();
                }}
              >
                <BarChart3 className="w-4 h-4 mr-1" />
                Open full view
              </Button>
            </CardHeader>
            <CardContent>
              <BidSummaryTableView
                data={bidSummaryQuery.data}
                loading={bidSummaryQuery.isLoading || bidSummaryQuery.isFetching}
                details={details}
                normalizedRows={normalizedRows}
                auctionId={auctionId ?? ""}
                onDeleteRow={(supplierId, historyId) =>
                  deleteBidSummaryMutation.mutate({ supplierId, historyId })
                }
                deletePending={deleteBidSummaryMutation.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <AuctionCompareBidsDialog
        open={compareBidsOpen}
        onOpenChange={setCompareBidsOpen}
        details={details}
        templateRows={normalizedRows as CompareTemplateRow[]}
        loading={detailsQuery.isLoading}
      />

      <Dialog
        open={bidSummaryOpen}
        onOpenChange={(o) => {
          setBidSummaryOpen(o);
          if (o) void bidSummaryQuery.refetch();
        }}
      >
        <DialogContent className="flex max-h-[min(92vh,880px)] w-[min(100vw-1.5rem,72rem)] max-w-[72rem] flex-col gap-0  p-0 sm:rounded-lg">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Bid summary</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
            <BidSummaryTableView
              data={bidSummaryQuery.data}
              loading={bidSummaryQuery.isLoading || (bidSummaryOpen && bidSummaryQuery.isFetching)}
              details={details}
              normalizedRows={normalizedRows}
              auctionId={auctionId ?? ""}
              onDeleteRow={(supplierId, historyId) =>
                deleteBidSummaryMutation.mutate({ supplierId, historyId })
              }
              deletePending={deleteBidSummaryMutation.isPending}
            />
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-3 flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadBidSummaryExcel(bidSummaryQuery.data, auctionId ?? "", details)}
              disabled={!bidSummaryQuery.data || bidSummaryQuery.isLoading}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Excel
            </Button>
            <Button type="button" variant="outline" onClick={() => setBidSummaryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormSheet
        open={suppliersOpen}
        onOpenChange={(o) => {
          setSuppliersOpen(o);
          if (!o) {
            setSelectedSuppIds([]);
            setAddSupplierSearch("");
          }
        }}
        title="Add suppliers"
        description="Choose active suppliers to invite. Suppliers already on this auction are not listed."
        onSubmit={() => addSuppliersMutation.mutate()}
        submitLabel={
          addSuppliersMutation.isPending
            ? "Adding..."
            : `Add${selectedSuppIds.length ? ` (${selectedSuppIds.length})` : ""}`
        }
        isSubmitting={addSuppliersMutation.isPending}
        submitDisabled={selectedSuppIds.length === 0}
        widthClassName="sm:max-w-md"
      >
        <p className="text-sm text-muted-foreground mb-3">
          Choose active suppliers to invite. Suppliers already on this auction are not listed.
        </p>
        <Input
          placeholder="Search by company name..."
          value={addSupplierSearch}
          onChange={(e) => setAddSupplierSearch(e.target.value)}
        />
        <div className="mt-3 min-h-0 max-h-[50vh] overflow-y-auto rounded-md border p-1">
          {suppliersQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSuppliersToAdd.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {invitedSupplierIds.size > 0 && (suppliersQuery.data?.length ?? 0) > 0
                ? "All active suppliers are already invited, or none match your search."
                : "No suppliers available to add."}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredSuppliersToAdd.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={selectedSuppIds.includes(s.id)}
                    onCheckedChange={() => toggleAddSupplierSelection(s.id)}
                  />
                  <span className="text-sm">{s.companyName ?? `Supplier #${s.id}`}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </FormSheet>

      <FormSheet
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
        title="Broadcast message"
        onSubmit={() => broadcastMutation.mutate()}
        submitLabel={broadcastMutation.isPending ? "Sending..." : "Send"}
        isSubmitting={broadcastMutation.isPending}
        submitDisabled={!broadcastMessage.trim()}
      >
        <Textarea
          value={broadcastMessage}
          onChange={(e) => setBroadcastMessage(e.target.value)}
          placeholder="Message to all invited suppliers"
          rows={4}
        />
      </FormSheet>

      <FormSheet
        open={placeProxyOpen}
        onOpenChange={(o) => {
          setPlaceProxyOpen(o);
          if (!o) {
            setProxySupplierId("");
            setProxyProof(null);
            setProxyProofName("");
            setProxyAttachErr(false);
            setProxySupplierErr(false);
          }
        }}
        title="Place proxy"
        onSubmit={() => {
          if (!proxySupplierId) {
            setProxySupplierErr(true);
            return;
          }
          if (!proxyProof) {
            toast({
              title: "Proof required",
              description: "Please attach a proof document (max 5MB).",
              variant: "destructive",
            });
            return;
          }
          if (!filterBasketRows(details, placeProxyRows).length) {
            toast({
              title: "No data",
              description: "No line items to submit.",
              variant: "destructive",
            });
            return;
          }
          placeProxyMutation.mutate();
        }}
        submitLabel={placeProxyMutation.isPending ? "Confirming..." : "Confirm"}
        isSubmitting={placeProxyMutation.isPending}
        widthClassName="sm:max-w-4xl"
      >
          {placeProxySuppQuery.isLoading && proxySupplierId ? (
            <div className="flex flex-1 justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 text-sm">
                <p className="shrink-0 text-muted-foreground">
                  Select a supplier on whose behalf you want to bid.
                </p>
                <div className="shrink-0 space-y-2">
                  <Label>Supplier</Label>
                  <Select
                    value={proxySupplierId}
                    onValueChange={(v) => {
                      setProxySupplierId(v);
                      setProxySupplierErr(false);
                    }}
                  >
                    <SelectTrigger className={proxySupplierErr ? "border-destructive" : ""}>
                      <SelectValue placeholder="Choose supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {(details?.suppIds ?? []).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {supplierInviteName(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {proxySupplierErr ? (
                    <p className="text-xs text-destructive">Please select a supplier</p>
                  ) : null}
                </div>
                <div className="shrink-0 space-y-2">
                  <Label>
                    Attach proof <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) {
                        setProxyProof(null);
                        setProxyProofName("");
                        return;
                      }
                      if (f.size / 1024 / 1024 > 5) {
                        setProxyAttachErr(true);
                        setProxyProof(null);
                        setProxyProofName("");
                        return;
                      }
                      setProxyAttachErr(false);
                      setProxyProof(f);
                      setProxyProofName(f.name);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum size 5&nbsp;MB (PDF, images, DOC, DOCX).
                  </p>
                  {proxyProofName ? (
                    <p className="text-xs text-muted-foreground">{proxyProofName}</p>
                  ) : null}
                  {proxyAttachErr ? (
                    <p className="text-xs text-destructive">Maximum allowed size is 5MB</p>
                  ) : null}
                </div>
                <ScrollArea className="min-h-0 flex-1 rounded-md border p-3">
                  <div className="space-y-6 pr-3">
                    {!proxySupplierId ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Select a supplier to load line items.
                      </p>
                    ) : filterBasketRows(details, placeProxyRows).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No line items for this auction.
                      </p>
                    ) : (
                      filterBasketRows(details, placeProxyRows).map((column, i) => (
                        <div
                          key={column.auRowId ?? i}
                          className="rounded-lg border bg-muted/30 p-4 space-y-3"
                        >
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {(column.columnResponseValues ?? []).map((item, j) => (
                              <div key={String(item.columnId ?? item.column_id ?? j)} className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  {item.columnKey?.trim()
                                    ? `${item.columnKey}:`
                                    : `Column ${item.columnId ?? item.column_id ?? j}:`}
                                </p>
                                {isTotalColumnCell(item, totalColumnId) ? (
                                  <Input
                                    readOnly
                                    className="h-9 bg-muted/50"
                                    value={String(
                                      item.suppRspColumnValue ||
                                        item.suppRspColumn ||
                                        item.columnValue ||
                                        ""
                                    )}
                                  />
                                ) : isPlaceProxyEditableCell(item, totalColumnId) ? (
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    className="h-9"
                                    readOnly={isQtyLikeColumnKey(item)}
                                    value={String(
                                      item.suppRspColumnValue ||
                                        item.suppRspColumn ||
                                        item.columnValue ||
                                        ""
                                    )}
                                    onChange={(e) =>
                                      handlePlaceProxyCellChange(
                                        column.auRowId!,
                                        item.columnId ?? item.column_id ?? "",
                                        columnKeyLower(item),
                                        e.target.value,
                                        false
                                      )
                                    }
                                    onBlur={(e) =>
                                      handlePlaceProxyBlur(
                                        column.auRowId!,
                                        item.columnId ?? item.column_id ?? "",
                                        columnKeyLower(item),
                                        e.target.value
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "+") e.preventDefault();
                                    }}
                                  />
                                ) : (
                                  <p className="font-medium text-sm break-words">
                                    {item.suppRspColumnValue ||
                                      item.suppRspColumn ||
                                      item.columnValue ||
                                      "—"}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                {(proxyPriceError || proxyPriceErrorFwd) && (
                  <p className="shrink-0 text-xs text-destructive">
                    {details?.auctionType === "Reverse Auction"
                      ? "New price is greater than the existing price"
                      : "New price is lesser than the existing price"}
                  </p>
                )}
                {proxyMbdError && (() => {
                  const failRow = placeProxyRows.find((r) => r.mbdStatus === true);
                  const expected = failRow?.validationValue;
                  return (
                    <p className="shrink-0 text-xs text-destructive">
                      {expected != null
                        ? `Price does not meet Minimum Bid Difference. ${details?.auctionType === "Reverse Auction" ? "Maximum" : "Minimum"} accepted: ${expected}`
                        : "Price does not meet the Minimum Bid Difference requirement"}
                    </p>
                  );
                })()}
              </div>
            </>
          )}
      </FormSheet>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw auction</DialogTitle>
          </DialogHeader>
          <Textarea
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
            placeholder="Reason for withdrawal"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => withdrawMutation.mutate()}
              disabled={!withdrawReason.trim() || withdrawMutation.isPending}
            >
              {withdrawMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormSheet
        open={extendOpen}
        onOpenChange={setExtendOpen}
        title="Extend auction time"
        onSubmit={() => extendMutation.mutate()}
        submitLabel={extendMutation.isPending ? "Extending..." : "Extend"}
        isSubmitting={extendMutation.isPending}
        submitDisabled={!extendAmount.trim()}
        widthClassName="sm:max-w-lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Duration</Label>
            <Input
              value={extendAmount}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "" || Number(value) >= 0) {
                  setExtendAmount(value);
                }
              }}
              placeholder="e.g. 15"
              type="number"
              min={0}
              onKeyDown={(e) => {
                if (["-", "+", "e", "E"].includes(e.key)) {
                  e.preventDefault();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={extendUnit} onValueChange={setExtendUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Mins">Minutes</SelectItem>
                <SelectItem value="Hrs">Hours</SelectItem>
                <SelectItem value="Days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSheet>

      <FormSheet
        open={mbdOpen}
        onOpenChange={setMbdOpen}
        title="Minimum bid difference"
        onSubmit={() => mbdMutation.mutate()}
        submitLabel={mbdMutation.isPending ? "Saving..." : "Save"}
        isSubmitting={mbdMutation.isPending}
        submitDisabled={Object.keys(mbdEdits).length === 0}
        widthClassName="sm:max-w-lg"
      >
        <div className="space-y-4">
          {normalizedRows.map((row) => {
            const mbd = (row.columnResponseValues ?? []).find(
              (c) => c.columnKey === "Minimum Bid Difference"
            );
            if (!mbd || row.auRowId == null || mbd.columnId == null) return null;
            const key = `${row.auRowId}:${mbd.columnId}`;
            const item =
              (row.columnResponseValues ?? []).find((c) => c.columnKey === "Item Name")
                ?.columnValue ?? `Row ${row.auRowId}`;
            return (
              <div key={key} className="space-y-1">
                <Label>{item}</Label>
                <Input
                  value={mbdEdits[key] ?? mbd.columnValue ?? ""}
                  onChange={(e) => {
                      const value = Number(e.target.value);
                      if (value < 0) return;
                     onMbdFieldChange(row.auRowId!, mbd.columnId!, e.target.value)
                    }}
                  placeholder="Enter minimum bid difference"
                />
              </div>
            );
          })}
        </div>
      </FormSheet>
      <Dialog open={tncOpen} onOpenChange={setTncOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Terms and conditions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {(details.tncs ?? []).map((t, i) => (
              <div key={t.id ?? i}>
                <p className="font-medium">{t.tncTitle ?? `TNC ${i + 1}`}</p>
                <p className="text-muted-foreground whitespace-pre-wrap mt-1">
                  {t.tnc_text ?? "—"}
                </p>
                <Separator className="my-3" />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={priceCapViewOpen} onOpenChange={setPriceCapViewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Supplier wise price cap</DialogTitle>
          </DialogHeader>
          {supplierWisePriceCapRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No supplier price caps available.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row id</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Price cap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierWisePriceCapRows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>{r.rowId}</TableCell>
                      <TableCell>{r.itemName}</TableCell>
                      <TableCell>{r.supplierName}</TableCell>
                      <TableCell>{money(r.price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={savingsOpen} onOpenChange={setSavingsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Savings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {normalizedRows.some((r) => r.savingsAmount != null) && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary text-primary-foreground">
                      <th className="text-left p-2 font-medium">Product Name</th>
                      <th className="text-right p-2 font-medium">Input Price</th>
                      <th className="text-right p-2 font-medium">Leading Price</th>
                      <th className="text-right p-2 font-medium">Savings</th>
                      <th className="text-right p-2 font-medium">Savings %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalizedRows.map((row, i) => {
                      const productName =
                        (row.columnResponseValues ?? []).find((c) => c.columnKey === "Item Name")
                          ?.columnValue ?? `Row ${i + 1}`;
                      const inputPrice = Number(row.savingsAmount ?? 0);
                      const leadingPriceVal = Number(row.leadingPrice ?? 0);
                      const savingsAmt =
                        row.savingsLineItemPrice != null
                          ? Number(row.savingsLineItemPrice)
                          : inputPrice > 0 && leadingPriceVal > 0
                          ? inputPrice - leadingPriceVal
                          : null;
                      const savingsPct =
                        savingsAmt != null && leadingPriceVal > 0
                          ? (savingsAmt / leadingPriceVal) * 100
                          : null;
                      return (
                        <tr key={row.auRowId ?? i} className="border-t">
                          <td className="p-2">{productName}</td>
                          <td className="p-2 text-right">
                            {inputPrice > 0 ? money(inputPrice) : "—"}
                          </td>
                          <td className="p-2 text-right">
                            {leadingPriceVal > 0 ? money(leadingPriceVal) : "—"}
                          </td>
                          <td
                            className={`p-2 text-right font-medium ${
                              savingsAmt != null
                                ? savingsAmt < 0
                                  ? "text-red-600"
                                  : "text-green-600"
                                : ""
                            }`}
                          >
                            {savingsAmt != null ? `${money(savingsAmt)} ${currency}` : "—"}
                          </td>
                          <td
                            className={`p-2 text-right ${
                              savingsPct != null
                                ? savingsPct < 0
                                  ? "text-red-600"
                                  : "text-green-600"
                                : ""
                            }`}
                          >
                            {savingsPct != null ? `${Number(savingsPct).toFixed(2)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="text-sm space-y-1 pt-2 border-t">
              <p>
                Total savings:{" "}
                <strong
                  className={
                    details.savingsPrice != null
                      ? details.savingsPrice < 0
                        ? "text-red-600"
                        : "text-green-600"
                      : ""
                  }
                >
                  {money(details.savingsPrice)} {currency}
                </strong>
              </p>
              <p>
                Average savings %:{" "}
                {details.savingsPercentage != null ? (
                  <span
                    className={
                      Number(details.savingsPercentage) < 0 ? "text-red-600" : "text-green-600"
                    }
                  >
                    {Number(details.savingsPercentage).toFixed(2)}%
                  </span>
                ) : (
                  "N/A"
                )}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
