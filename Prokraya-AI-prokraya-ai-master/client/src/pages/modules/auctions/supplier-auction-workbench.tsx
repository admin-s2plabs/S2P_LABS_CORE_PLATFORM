import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronLeft,
  Clock,
  Gavel,
  Hammer,
  IndianRupee,
  LayoutGrid,
  Loader2,
  Medal,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function getAuthSupplierId(): number | null {
  try {
    const raw = localStorage.getItem("prokraya-auth");
    if (!raw) return null;
    const p = JSON.parse(raw) as { supplierId?: string | number | null };
    const sid = p.supplierId;
    if (sid == null || sid === "") return null;
    const n = Number(sid);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

type Mode = "view" | "response" | "bid" | "revise" | "respond";

interface AuctionColumnCell {
  columnId?: string | number;
  /** API may send snake_case only */
  column_id?: string | number;
  columnKey?: string;
  columnValue?: string | null;
  column_value?: string | null;
  editableBy?: string | null;
  viewedBy?: string | null;
  suppRspColumn?: string | null;
  suppRspColumnValue?: string | null;
  supp_rsp_column?: string | null;
  supp_rsp_column_value?: string | null;
  errormsg?: string | null;
  errormsg1?: string | null;
  id?: number;
}

function columnIdOf(c: AuctionColumnCell): string | undefined {
  const raw = c.columnId ?? c.column_id;
  if (raw == null || raw === "") return undefined;
  return String(raw);
}

/** Skip null/undefined/blank so we can fall back to buyer `columnValue` (e.g. qty) when supplier cell is "". */
function firstNonEmpty(
  ...parts: (string | number | null | undefined)[]
): string {
  for (const p of parts) {
    if (p == null) continue;
    const s = String(p).trim();
    if (s !== "") return s;
  }
  return "";
}

/** Supplier + buyer + snake_case — same idea as auction-detail place-proxy merge. */
function cellDisplayString(c: AuctionColumnCell): string {
  const x = c as Record<string, unknown>;
  return firstNonEmpty(
    c.suppRspColumnValue,
    c.suppRspColumn,
    x.supp_rsp_column_value as string | undefined,
    x.supp_rsp_column as string | undefined,
    c.columnValue,
    x.column_value as string | undefined
  );
}

interface TemplateRow {
  auRowId: number;
  auctionEventRowColumn?: AuctionColumnCell[];
  columnResponseValues?: AuctionColumnCell[];
  basketAuctionStatus?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  suppWiseCap?: Array<{ suppId?: number; price?: number }>;
  lineItemTotal?: string | number | null;
  lineItemBasePrice?: string | number | null;
  suppProductRank?: number | null;
  leadingPrice?: string | null;
  mbdStatus?: boolean;
  validationValue?: number;
  [key: string]: unknown;
}

interface AuctionDetails {
  id?: number;
  name?: string;
  auctionType?: string;
  auctionStrategy?: string;
  allotmentType?: string;
  endTime?: string;
  currency?: string;
  isBasket?: string;
  orgDetails?: { organizationName?: string; organization_name?: string };
  templateRows?: TemplateRow[];
  templateDef?: {
    auAuctionEventTemplateColumnDefs?: Array<{
      columnId?: string | number;
      columnName?: string;
      formula?: string;
    }>;
  };
  tncs?: Array<{ tnc_text?: string }>;
  auAuctionSuppResponseEventList?: Array<{
    id?: number;
    supplierId?: number;
    auctionTotal?: string | number | null;
    suppRank?: number | null;
    creationTime?: string;
    createdBy?: string;
    templateResponseRows?: Array<{
      auRowId?: number;
      id?: number;
      lineItemTotal?: string | number | null;
      lineItemBasePrice?: string | number | null;
      suppProductRank?: number | null;
      columnResponseValues?: AuctionColumnCell[];
    }>;
  }>;
  lotLeadingPrice?: string | null;
  delReqStatus?: string;
}

interface BroadcastItem {
  broad_cast_message?: string;
  creation_time?: string;
}

type BidSummaryColumn = {
  columnKey?: string;
  columnValue?: string | number | null;
  suppRspColumnValue?: string | number | null;
};

type BidSummaryTemplateRow = {
  suppProductRank?: number | null;
  columnResponseValues?: BidSummaryColumn[];
};

type BidSummaryItem = {
  status?: string;
  suppRank?: number | null;
  bidTime?: string;
  templateResponseRows?: BidSummaryTemplateRow[];
};

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function getColumns(row: TemplateRow): AuctionColumnCell[] {
  return row.columnResponseValues ?? row.auctionEventRowColumn ?? [];
}

function setColumns(row: TemplateRow, cols: AuctionColumnCell[]) {
  if (row.columnResponseValues) row.columnResponseValues = cols;
  else row.auctionEventRowColumn = cols;
}

function ensureColumnResponseValues(rows: TemplateRow[]): TemplateRow[] {
  const out = deepClone(rows);
  for (const row of out) {
    if (!row.columnResponseValues && row.auctionEventRowColumn) {
      row.columnResponseValues = deepClone(row.auctionEventRowColumn);
    }
  }
  return out;
}

type SuppResponseEvent = NonNullable<
  AuctionDetails["auAuctionSuppResponseEventList"]
>[number];

function pickSupplierResponse(
  data: AuctionDetails | undefined,
  supplierId: number
): SuppResponseEvent | undefined {
  const list = data?.auAuctionSuppResponseEventList;
  if (!list?.length) return undefined;
  return list.find((r) => Number(r.supplierId) === supplierId) ?? list[0];
}

/** API / raw SQL may use snake_case; template rows use camelCase. */
function templateRespAuRowId(tr: { auRowId?: number; au_row_id?: number }): number {
  return Number(tr.auRowId ?? tr.au_row_id);
}

function respColumnId(c: {
  columnId?: string | number;
  column_id?: string | number;
}): string | undefined {
  const v = c.columnId ?? c.column_id;
  return v == null ? undefined : String(v);
}

function respSuppDisplay(c: {
  suppRspColumnValue?: string | null;
  supp_rsp_column_value?: string | null;
  suppRspColumn?: string | null;
  supp_rsp_column?: string | null;
}): string {
  const v =
    c.suppRspColumnValue ??
    c.supp_rsp_column_value ??
    c.suppRspColumn ??
    c.supp_rsp_column;
  return v != null ? String(v) : "";
}

function mergeResponseIntoRows(
  rows: TemplateRow[],
  resp: NonNullable<AuctionDetails["auAuctionSuppResponseEventList"]>[number] | undefined
): TemplateRow[] {
  const merged = deepClone(rows);
  if (!resp?.templateResponseRows) return merged;
  for (const row of merged) {
    const tr = resp.templateResponseRows?.find(
      (t) => templateRespAuRowId(t) === Number(row.auRowId)
    );
    const cols = getColumns(row);
    if (!tr) continue;
    for (const col of cols) {
      if (columnIdOf(col) == null) continue;
      const match = tr.columnResponseValues?.find(
        (c) => respColumnId(c) === columnIdOf(col)
      );
      if (match) {
        const v = respSuppDisplay(match).trim();
        if (v !== "") {
          col.suppRspColumn = v;
          col.suppRspColumnValue = v;
        } else {
          col.suppRspColumn = undefined;
          col.suppRspColumnValue = undefined;
        }
        const mid = (match as { id?: number }).id;
        if (mid != null) col.id = mid;
      }
    }
    const trAny = tr as Record<string, unknown>;
    const lineTotal = tr.lineItemTotal ?? trAny.line_item_total;
    const lineBase = tr.lineItemBasePrice ?? trAny.line_item_base_price;
    if (lineTotal != null && lineTotal !== "")
      row.lineItemTotal = lineTotal as string | number;
    if (lineBase != null && lineBase !== "")
      row.lineItemBasePrice = lineBase as string | number;
    if (tr.suppProductRank != null) row.suppProductRank = tr.suppProductRank;

    // Response view reads Price/Total from column cells; DB often stores
    // authoritative values on the row even when template column value rows are missing.
    const priceCol = cols.find((c) => isPriceLikeColumnKey(c));
    if (
      priceCol &&
      lineBase != null &&
      lineBase !== "" &&
      String(lineBase).toUpperCase() !== "N/A"
    ) {
      const s = String(lineBase);
      priceCol.suppRspColumn = s;
      priceCol.suppRspColumnValue = s;
    }
    const totalCol = cols.find((c) => isTotalColumnKey(c));
    if (totalCol && lineTotal != null && lineTotal !== "") {
      const s = String(lineTotal);
      totalCol.suppRspColumn = s;
      totalCol.suppRspColumnValue = s;
    }

    setColumns(row, cols);
  }
  return merged;
}

function filterBasketActive(rows: TemplateRow[], isBasket: boolean): TemplateRow[] {
  if (!isBasket) return rows;
  return rows.filter((r) => r.basketAuctionStatus === "Active");
}

function colKeyLower(c: AuctionColumnCell | undefined): string {
  return String(c?.columnKey ?? "").trim().toLowerCase();
}

function isTotalColumnKey(c: AuctionColumnCell | undefined): boolean {
  const k = colKeyLower(c);
  return k === "total" || k === "line total" || k === "grand total";
}

function isPriceLikeColumnKey(c: AuctionColumnCell | undefined): boolean {
  const k = colKeyLower(c);
  if (!k) return false;
  if (isTotalColumnKey(c)) return false;
  return k.includes("price") || k === "amount" || k.includes("lumpsum");
}

function isQuantityColumnKey(c: AuctionColumnCell | undefined): boolean {
  const k = colKeyLower(c);
  return k === "quantity" || k === "qty" || k === "qnty" || k.includes("quantity");
}

function getTotalColumnMeta(data: AuctionDetails | undefined): {
  formula?: string;
  totalColumnId?: string;
} {
  const defs = data?.templateDef?.auAuctionEventTemplateColumnDefs;
  if (!defs?.length) return {};
  const t =
    defs.find((d) => String(d.columnName ?? "").trim().toLowerCase() === "total") ??
    defs.find((d) => String(d.columnName ?? "").trim().toLowerCase() === "line total") ??
    defs.find((d) => String(d.formula ?? "").trim() !== "");
  if (!t) return {};
  const cid = t.columnId;
  return {
    formula: t.formula ?? undefined,
    totalColumnId:
      cid != null && cid !== "" ? String(cid).trim() : undefined,
  };
}

function quantityNumeric(col: AuctionColumnCell | undefined): number {
  if (!col) return 0;
  const s = cellDisplayString(col);
  const n = parseFloat(s.split(/\s+/)[0] ?? "0");
  return Number.isFinite(n) ? n : 0;
}

/** When template has no formula or evaluation fails: line total = unit price × quantity. */
function fallbackPriceTimesQty(row: TemplateRow): number | null {
  const cols = getColumns(row);
  let price: number | null = null;
  let foundQtyColumn = false;
  let qty: number | null = null;
  for (const c of cols) {
    if (columnIdOf(c) == null) continue;
    if (isTotalColumnKey(c)) continue;
    if (price == null && isPriceLikeColumnKey(c)) {
      let raw = cellDisplayString(c);
      if (
        (!raw || raw === "") &&
        row.lineItemBasePrice != null &&
        String(row.lineItemBasePrice).trim() !== "" &&
        String(row.lineItemBasePrice).toUpperCase() !== "N/A"
      ) {
        raw = String(row.lineItemBasePrice);
      }
      const n = parseFloat(raw.includes(" ") ? raw.split(/\s+/)[0]! : raw);
      if (Number.isFinite(n)) price = n;
    }
    if (isQuantityColumnKey(c)) {
      foundQtyColumn = true;
      qty = quantityNumeric(c);
    }
  }
  if (price == null) return null;
  const q = foundQtyColumn ? (qty ?? 0) : 1;
  return price * q;
}

/**
 * Substitute template column ids using word boundaries (same as auction-detail) so
 * `1` does not corrupt `10` / `101`.
 */
function evaluateAuctionFormula(
  formula: string | undefined,
  scope: Record<string, number>
): number {
  if (!formula?.trim()) return NaN;
  let expr = formula.trim();
  const numericIds = Object.keys(scope)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  for (const num of numericIds) {
    const v = scope[String(num)];
    const numVal = Number.isFinite(v) ? v : 0;
    const re = new RegExp(`\\b${num}\\b`, "g");
    expr = expr.replace(re, `(${numVal})`);
  }
  const noSpace = expr.replace(/\s/g, "");
  if (/[a-zA-Z_]/.test(noSpace)) return NaN;
  if (!/^[\d+\-*/().]+$/.test(noSpace)) return NaN;
  try {
    const result = Function(`"use strict"; return (${expr});`)() as unknown;
    const n = typeof result === "number" ? result : Number(result);
    return Number.isFinite(n) ? n : NaN;
  } catch {
    return NaN;
  }
}

function calculateLineTotal(
  row: TemplateRow,
  formula: string | undefined,
  totalColumnId?: string
): string {
  const cols = getColumns(row);
  const scope: Record<string, number> = {};
  for (const c of cols) {
    const cidStr = columnIdOf(c);
    if (cidStr == null) continue;
    if (totalColumnId != null && cidStr === totalColumnId) {
      continue;
    }
    if (isTotalColumnKey(c)) continue;
    const key = cidStr;
    if (isQuantityColumnKey(c)) {
      scope[key] = quantityNumeric(c);
    } else {
      let raw = cellDisplayString(c);
      if (
        (!raw || raw === "") &&
        isPriceLikeColumnKey(c) &&
        row.lineItemBasePrice != null &&
        String(row.lineItemBasePrice).trim() !== "" &&
        String(row.lineItemBasePrice).toUpperCase() !== "N/A"
      ) {
        raw = String(row.lineItemBasePrice);
      }
      const part = raw.includes(" ") ? raw.split(/\s+/)[0]! : raw;
      const n = parseFloat(part);
      scope[key] = Number.isFinite(n) ? n : 0;
    }
  }
  if (formula?.trim()) {
    const n = evaluateAuctionFormula(formula, scope);
    if (Number.isFinite(n)) return n.toFixed(2);
  }
  const fb = fallbackPriceTimesQty(row);
  if (fb != null && Number.isFinite(fb)) return fb.toFixed(2);
  return "";
}

function formatCountdown(
  endIso: string | undefined,
  nowMs: number
): string {
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
  return "EXPIRED";
}

function stripColumnForSubmit(c: AuctionColumnCell): AuctionColumnCell {
  const { editableBy: _e, viewedBy: _v, errormsg: _er, errormsg1: _er1, ...rest } =
    c;
  return rest;
}

function normalizeMode(m: string | undefined): Mode {
  if (m === "respond") return "bid";
  if (m === "view" || m === "response" || m === "bid" || m === "revise") return m;
  return "view";
}

function buildMbdRows(rows: TemplateRow[]): Array<{
  auRowId: number;
  mbd?: string;
  columnId?: string | number;
  mbdExist?: boolean;
  price?: string | null;
}> {
  const out: Array<{
    auRowId: number;
    mbd?: string;
    columnId?: string | number;
    mbdExist?: boolean;
    price?: string | null;
  }> = [];
  for (const item of rows) {
    const cols = getColumns(item);
    const rowObj: (typeof out)[0] = { auRowId: item.auRowId };
    for (const col of cols) {
      if (col.columnKey === "Item Name") {
        /* name optional */
      } else if (col.columnKey === "Minimum Bid Difference") {
        rowObj.mbd = col.columnValue ?? undefined;
        rowObj.columnId = col.columnId;
        rowObj.mbdExist = true;
      } else if (col.columnKey === "Price") {
        rowObj.price = col.suppRspColumn ?? col.suppRspColumnValue ?? null;
      }
    }
    out.push(rowObj);
  }
  return out;
}

export default function SupplierAuctionWorkbench() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/app/supplier-auctions/:auctionId/:mode");
  const auctionId = params?.auctionId ? Number(params.auctionId) : NaN;
  const mode = normalizeMode(params?.mode);
  const supplierId = useMemo(() => getAuthSupplierId(), []);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [utcNowMs, setUtcNowMs] = useState(() => Date.now());
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [bidSummaryOpen, setBidSummaryOpen] = useState(false);
  const [draftRows, setDraftRows] = useState<TemplateRow[] | null>(null);
  const [zeroPrice, setZeroPrice] = useState(false);
  const [greaterPrice, setGreaterPrice] = useState(false);
  const [lesserPrice, setLesserPrice] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mbdSnapshotRef = useRef<ReturnType<typeof buildMbdRows>>([]);
  const mbdSnapshotInitRef = useRef(false);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setUtcNowMs(Date.now());
    }, 1000);
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      setUtcNowMs(Date.now());
      queryClient.invalidateQueries({
        queryKey: ["/api/auctionEvents/getAuctionEventDetailsBySupp", auctionId, supplierId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/auctionEvents/getBroadCastMessage", auctionId],
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [auctionId, supplierId, queryClient]);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "/api/auctionEvents/getAuctionEventDetailsBySupp",
      auctionId,
      supplierId,
    ],
    queryFn: async () => {
      const res = await apiRequest("GET", 
        `/api/auctionEvents/getAuctionEventDetailsBySupp/${auctionId}/${supplierId}`,
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as AuctionDetails;
    },
    enabled: Number.isFinite(auctionId) && supplierId != null,
    refetchInterval:
      mode === "response" ? 15_000 : false,
  });

  const { data: broadCastMsgList = [] } = useQuery({
    queryKey: ["/api/auctionEvents/getBroadCastMessage", auctionId],
    queryFn: async () => {
      const res = await apiRequest("GET",
        `/api/auctionEvents/getBroadCastMessage/${auctionId}`
      );
      if (!res.ok) return [];
      return (await res.json()) as BroadcastItem[];
    },
    enabled: Number.isFinite(auctionId),
  });

  const bidSummaryQuery = useQuery({
    queryKey: [
      "/api/auctionEvents/getBidSummaryHistBySupplier",
      auctionId,
      supplierId,
    ],
    queryFn: async () => {
      const res = await apiRequest("GET",
        `/api/auctionEvents/getBidSummaryHistBySupplier/${auctionId}/${supplierId}`
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as BidSummaryItem[] | string;
    },
    enabled: false,
  });

  useEffect(() => {
    if (!Number.isFinite(auctionId) || supplierId == null) return;
    if (mode !== "view") return;
    apiRequest("POST",
      `/api/auctionEvents/updateSupplierAuctionSeenStatus/${auctionId}/${supplierId}`
    ).catch(() => {});
  }, [auctionId, supplierId, mode]);

  const isBasket = data?.isBasket === "Y";
  // Disable all action buttons when the workbench was opened from the scheduled or closed tab.
  const source = new URLSearchParams(window.location.search).get("source");
  const isViewOnly = source === "scheduled" || source === "closed";
  const { formula, totalColumnId } = useMemo(() => getTotalColumnMeta(data), [data]);
  const orgName =
    data?.orgDetails?.organizationName ??
    data?.orgDetails?.organization_name ??
    "";

  const timeRemaining = useMemo(() => {
    if (utcNowMs == null || !data?.endTime) return "—";
    if (isBasket && data.templateRows?.[0]?.endTime) {
      const active = data.templateRows.find((r) => r.basketAuctionStatus === "Active");
      const end = active?.endTime ?? data.endTime;
      return formatCountdown(
        typeof end === "string" ? end : String(end),
        utcNowMs
      );
    }
    return formatCountdown(String(data.endTime), utcNowMs);
  }, [data, utcNowMs, isBasket]);

  const myResponse = useMemo(
    () => pickSupplierResponse(data, supplierId ?? 0),
    [data, supplierId]
  );

  const displayRows = useMemo(() => {
    const raw = data?.templateRows ?? [];
    if (mode === "view") return raw;
    const merged = mergeResponseIntoRows(ensureColumnResponseValues(raw), myResponse);
    return merged;
  }, [data?.templateRows, myResponse, mode]);

  useEffect(() => {
    if (!data?.templateRows) {
      setDraftRows(null);
      return;
    }
    if (mode !== "bid" && mode !== "revise") {
      setDraftRows(null);
      return;
    }
    let rows = ensureColumnResponseValues(deepClone(data.templateRows));
    rows = mergeResponseIntoRows(rows, myResponse);
    rows = filterBasketActive(rows, isBasket);
    setDraftRows(rows);
    setZeroPrice(false);
    setGreaterPrice(false);
    setLesserPrice(false);
    mbdSnapshotInitRef.current = false;
  }, [data, mode, myResponse, isBasket]);

  useEffect(() => {
    if (
      (mode === "bid" || mode === "revise") &&
      draftRows &&
      !mbdSnapshotInitRef.current
    ) {
      mbdSnapshotRef.current = buildMbdRows(draftRows);
      mbdSnapshotInitRef.current = true;
    }
  }, [mode, draftRows]);

  const showBasketTimer = useCallback(
    (endIso: string | null | undefined) => {
      if (utcNowMs == null || !endIso) return "—";
      return formatCountdown(String(endIso), utcNowMs);
    },
    [utcNowMs]
  );

  const auctionResp = useMemo(() => {
    if (!myResponse) return null;
    return myResponse;
  }, [myResponse]);

  const handleInputBlur = useCallback(
    (
      rowId: number,
      columnId: string | number | undefined,
      value: string,
      auctionType: string | undefined,
      allotmentType: string | undefined
    ) => {
      if (columnId == null) return;
      setDraftRows((prev) => {
        if (!prev) return prev;
        const next = deepClone(prev);
        const item = next.find((r) => r.auRowId === rowId);
        if (!item) return prev;
        const cols = getColumns(item);
        const targetCol = cols.find((c) => String(c.columnId) === String(columnId));
        if (!targetCol) return prev;

        const totalCol = cols.find((c) => isTotalColumnKey(c));
        const isPriceCol = isPriceLikeColumnKey(targetCol);

        targetCol.errormsg = null;
        targetCol.errormsg1 = null;

        if (mode === "revise" && isPriceCol) {
          const oldPrice = parseFloat(String(targetCol.suppRspColumn ?? "0") || "0");
          const newPrice = parseFloat(value || "0");
          if (auctionType === "Forward Auction") {
            if (newPrice < oldPrice && newPrice !== 0 && value !== "") {
              targetCol.errormsg = `New price ${newPrice} cannot be lesser than old price ${oldPrice}`;
            }
          } else if (auctionType === "Reverse Auction") {
            if (
              newPrice > oldPrice &&
              newPrice !== 0 &&
              value !== "" &&
              oldPrice !== 0
            ) {
              targetCol.errormsg = `New price ${newPrice} cannot be greater than old price ${oldPrice}`;
            }
          }
        }

        if (targetCol.errormsg && mode === "revise") {
          setLesserPrice(auctionType === "Forward Auction");
          setGreaterPrice(auctionType === "Reverse Auction");
          targetCol.suppRspColumnValue = value;
          setColumns(item, cols);
          return next;
        }
        if (mode === "revise") {
          setLesserPrice(false);
          setGreaterPrice(false);
        }

        if (isPriceCol) {
          const capList = item.suppWiseCap?.filter(
            (c) => Number(c.suppId) === supplierId
          );
          if (capList?.length) {
            const cap = capList[0]?.price;
            if (cap != null && value !== "" && Number(value) > 0) {
              const numValue = Number(value);
              const numCap = Number(cap);
              let capError: string | null = null;
              if (auctionType === "Forward Auction" && numValue < numCap) {
                capError = `Price cannot be less than ${cap}`;
              } else if (auctionType !== "Forward Auction" && numValue > numCap) {
                capError = `Price cannot be greater than ${cap}`;
              }
              if (capError) {
                targetCol.errormsg = capError;
                targetCol.suppRspColumnValue = "";
                if (totalCol) {
                  totalCol.suppRspColumnValue = "";
                  totalCol.suppRspColumn = "";
                }
                item.lineItemTotal = "";
                setZeroPrice(true);
                setLesserPrice(false);
                setGreaterPrice(false);
                setColumns(item, cols);
                return next;
              }
            }
          }
        }

        if (isPriceCol && Number(value) <= 0 && value !== undefined && value !== "") {
          targetCol.errormsg1 = "Price cannot be 0";
          targetCol.suppRspColumnValue = value;
          setZeroPrice(true);
          if (totalCol) {
            totalCol.suppRspColumnValue = "";
            totalCol.suppRspColumn = "";
          }
          item.lineItemTotal = "";
          setColumns(item, cols);
          return next;
        }

        if (isPriceCol && value?.trim() === "" && allotmentType === "Lot Based") {
          targetCol.errormsg1 = "Price cannot be empty";
          targetCol.suppRspColumnValue = value;
          setZeroPrice(true);
          setColumns(item, cols);
          return next;
        }

        targetCol.suppRspColumnValue = value;
        // In revise mode, preserve suppRspColumn as the original submitted bid reference
        if (!(mode === "revise" && isPriceCol)) {
          targetCol.suppRspColumn = value;
        }
        if (isPriceCol) {
          setZeroPrice(false);
          item.lineItemBasePrice = value;
        }

        if (isPriceCol) {
          const mbdRow = mbdSnapshotRef.current.find((m) => m.auRowId === rowId);
          if (mbdRow?.mbdExist) {
            const finalMbd = mbdRow.mbd ? parseFloat(mbdRow.mbd) : 0;
            const finalPrice = mbdRow.price ? parseFloat(String(mbdRow.price)) : 0;
            const v = parseFloat(value);
            if (
              Number.isFinite(finalMbd) &&
              finalMbd > 0 &&
              Number.isFinite(v) &&
              Number.isFinite(finalPrice) &&
              finalPrice > 0
            ) {
              const diff =
                auctionType === "Forward Auction"
                  ? v - finalPrice   // Forward: price must rise by at least MBD
                  : finalPrice - v;  // Reverse: price must fall by at least MBD
              if (diff >= finalMbd) {
                item.mbdStatus = false;
              } else {
                item.mbdStatus = true;
                item.validationValue =
                  auctionType === "Forward Auction"
                    ? finalPrice + finalMbd   // minimum acceptable price
                    : finalPrice - finalMbd;  // minimum acceptable price
              }
            } else {
              item.mbdStatus = false;
            }
          }
        }

        if (totalCol) {
          const t = calculateLineTotal(item, formula, totalColumnId);
          if (t !== "") {
            totalCol.suppRspColumnValue = t;
            totalCol.suppRspColumn = t;
            item.lineItemTotal = t;
          } else {
            totalCol.suppRspColumnValue = "";
            totalCol.suppRspColumn = "";
            item.lineItemTotal =
              allotmentType === "Partial Based" ? "N/A" : "";
          }
        }

        setColumns(item, cols);
        return next;
      });
    },
    [formula, totalColumnId, supplierId, mode]
  );

  /** Live line total while typing (same formula as blur/submit; no validation). */
  const handleInputChange = useCallback(
    (rowId: number, columnId: string | number | undefined, value: string) => {
      if (columnId == null) return;
      setDraftRows((prev) => {
        if (!prev) return prev;
        const next = deepClone(prev);
        const item = next.find((r) => r.auRowId === rowId);
        if (!item) return prev;
        const cols = getColumns(item);
        const targetCol = cols.find((c) => columnIdOf(c) === String(columnId));
        if (!targetCol || isTotalColumnKey(targetCol)) return prev;

        targetCol.suppRspColumnValue = value;
        // In revise mode, suppRspColumn holds the original submitted bid — don't overwrite it
        // so the blur validation can compare new vs. original price correctly.
        if (!(mode === "revise" && isPriceLikeColumnKey(targetCol))) {
          targetCol.suppRspColumn = value;
        }
        if (isPriceLikeColumnKey(targetCol)) {
          item.lineItemBasePrice = value;
        }

        const totalCol = cols.find((c) => isTotalColumnKey(c));
        if (totalCol) {
          const t = calculateLineTotal(item, formula, totalColumnId);
          if (t !== "") {
            totalCol.suppRspColumnValue = t;
            totalCol.suppRspColumn = t;
            item.lineItemTotal = t;
          } else {
            totalCol.suppRspColumnValue = "";
            totalCol.suppRspColumn = "";
            item.lineItemTotal =
              data?.allotmentType === "Partial Based" ? "N/A" : "";
          }
        }

        setColumns(item, cols);
        return next;
      });
    },
    [formula, totalColumnId, data?.allotmentType, mode]
  );

  const submitMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/auctionEvents/sendAuctionSuppRespEvents", payload);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Response submitted successfully" });
      await queryClient.refetchQueries({
        queryKey: [
          "/api/auctionEvents/getAuctionEventDetailsBySupp",
          auctionId,
          supplierId,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "/api/auctionEvents/getBidSummaryHistBySupplier",
          auctionId,
          supplierId,
        ],
      });
      navigate(`/app/supplier-auctions/${auctionId}/response`);
    },
    onError: (e: Error) => {
      toast({
        title: "Submit failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/auctionEvents/updateAuctionSuppRespEvents", payload);
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { error?: boolean };
      if (json?.error) {
        throw new Error("Bid update did not save. Check network or try again.");
      }
      return json;
    },
    onSuccess: async () => {
      toast({ title: "Prices revised successfully" });
      await queryClient.refetchQueries({
        queryKey: [
          "/api/auctionEvents/getAuctionEventDetailsBySupp",
          auctionId,
          supplierId,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "/api/auctionEvents/getBidSummaryHistBySupplier",
          auctionId,
          supplierId,
        ],
      });
      navigate(`/app/supplier-auctions/${auctionId}/response`);
    },
    onError: (e: Error) => {
      toast({
        title: "Update failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const deleteBidReqMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET",
        `/api/auctionEvents/getBidDeleteRequestBySupp/${auctionId}/${supplierId}`
      );
      if (!res.ok) throw new Error(await res.text());
      const msg = (await res.json()) as string;
      if (
        typeof msg === "string" &&
        (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed"))
      ) {
        throw new Error(msg);
      }
      return msg;
    },
    onSuccess: async () => {
      toast({ title: "Request to Delete Bid Successfully" });
      await queryClient.refetchQueries({
        queryKey: [
          "/api/auctionEvents/getAuctionEventDetailsBySupp",
          auctionId,
          supplierId,
        ],
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Delete bid request failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const validateAndBuildPayload = useCallback(
    (isUpdate: boolean) => {
      if (!draftRows || !data || supplierId == null) return null;
      const allotment = data.allotmentType ?? "";
      const rows = deepClone(draftRows);

      if (
        rows.some((r) =>
          getColumns(r).some((c) => c.errormsg || c.errormsg1)
        )
      ) {
        toast({
          title: "Fix validation errors",
          description: "Correct highlighted price fields before submitting.",
          variant: "destructive",
        });
        return null;
      }

      const totalNA = rows.some((r) => String(r.lineItemTotal) === "N/A");
      const validated =
        allotment !== "Partial Based"
          ? rows
              .map((item) =>
                getColumns(item).some(
                  (iu) =>
                    iu.columnKey === "Price" &&
                    (iu.suppRspColumnValue || iu.suppRspColumn)
                )
              )
              .filter((ok) => !ok)
          : [];

      if (validated.length > 0) {
        toast({
          title: "Enter valid price",
          variant: "destructive",
        });
        return null;
      }

      if (
        zeroPrice ||
        greaterPrice ||
        lesserPrice ||
        (totalNA &&
          (allotment === "Partial Based" || allotment === "Lot Based"))
      ) {
        toast({
          title: "Enter valid price",
          description: totalNA ? "Enter price for all lines" : undefined,
          variant: "destructive",
        });
        return null;
      }

      if (
        allotment === "Lot Based" &&
        rows.some((e) => e.lineItemTotal == null || e.lineItemTotal === "")
      ) {
        toast({
          title: "All product prices are mandatory",
          variant: "destructive",
        });
        return null;
      }

      if (isUpdate && rows.some((r) => r.mbdStatus === true)) {
        toast({
          title: "Minimum bid difference",
          description: "Prices did not satisfy MBD condition.",
          variant: "destructive",
        });
        return null;
      }

      const prevList = myResponse?.templateResponseRows ?? [];

      for (const item of rows) {
        const prev = prevList.find(
          (p) => templateRespAuRowId(p) === Number(item.auRowId)
        );
        const cols = getColumns(item).map((c) => stripColumnForSubmit(c));
        if (isUpdate && prev) {
          item.id = prev.id;
          for (const c of cols) {
            const pv = prev.columnResponseValues?.find(
              (x) => String(x.columnId) === String(c.columnId)
            );
            if (pv?.id != null) c.id = pv.id;
            if (c.suppRspColumnValue == null || c.suppRspColumnValue === "") {
              c.suppRspColumnValue =
                c.suppRspColumn ?? pv?.suppRspColumnValue ?? "";
            }
          }
        }
        item.columnResponseValues = cols;
        delete (item as { auctionEventRowColumn?: unknown }).auctionEventRowColumn;
      }

      const finalTotal = rows.reduce(
        (a, v) => a + Number(v.lineItemTotal ?? 0),
        0
      );

      const base: Record<string, unknown> = {
        auctionId,
        auctionTotal: String(finalTotal),
        supplierId,
        templateResponseRows: rows,
      };

      if (isUpdate && myResponse) {
        const rid = Number((myResponse as Record<string, unknown>).id);
        if (Number.isFinite(rid) && rid > 0) base.id = rid;
        base.creationTime = myResponse.creationTime;
        base.createdBy = myResponse.createdBy;
      }

      return base;
    },
    [
      draftRows,
      data,
      supplierId,
      auctionId,
      zeroPrice,
      greaterPrice,
      lesserPrice,
      myResponse,
      toast,
    ]
  );

  const onSubmitBid = () => {
    const p = validateAndBuildPayload(false);
    if (p) submitMutation.mutate(p);
  };

  const onUpdateBid = () => {
    const p = validateAndBuildPayload(true);
    if (p) updateMutation.mutate(p);
  };

  if (!Number.isFinite(auctionId) || supplierId == null) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Invalid auction or missing supplier.</p>
        <Button asChild className="mt-4">
          <Link href="/app/supplier-auctions">Back to supplier auctions</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Failed to load auction"}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/app/supplier-auctions">Back</Link>
        </Button>
      </div>
    );
  }

  const headerCols =
    displayRows[0]?.auctionEventRowColumn ??
    displayRows[0]?.columnResponseValues ??
    [];

  const renderSpecTooltip = (itemName: string | null | undefined) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="ml-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          i
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs">
          Product specifications appear here when the catalog provides them for
          &quot;{itemName ?? "item"}&quot;.
        </p>
      </TooltipContent>
    </Tooltip>
  );

  const bidNowNav = () => {
    if (myResponse?.templateResponseRows?.length) {
      navigate(`/app/supplier-auctions/${auctionId}/response`);
    } else {
      navigate(`/app/supplier-auctions/${auctionId}/bid`);
    }
  };

  const showBroadcast =
    Array.isArray(broadCastMsgList) &&
    broadCastMsgList.length > 0 &&
    timeRemaining !== "Closed";

  const bidSummaryList = Array.isArray(bidSummaryQuery.data)
    ? bidSummaryQuery.data
    : [];
  const bidSummaryColumns = bidSummaryList[0]?.templateResponseRows?.[0]
    ?.columnResponseValues ?? [];

  return (
    <TooltipProvider>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/app/supplier-auctions">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Gavel className="h-7 w-7 shrink-0" />
              <span className="truncate">{data.name ?? `Auction #${auctionId}`}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Supplier auction workspace
            </p>
          </div>
        </div>

        {showBroadcast ? (
          <div className="overflow-hidden rounded-md border bg-muted/40 py-2">
            <div className="animate-[marquee_25s_linear_infinite] whitespace-nowrap text-sm px-4">
              {(broadCastMsgList as BroadcastItem[]).map((m, i) => (
                <span key={i} className="mr-10 inline-block">
                  {m.broad_cast_message}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <Card className="overflow-hidden">
          <CardContent className="p-4 md:p-6 space-y-6">
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex gap-4 shrink-0">
                <div className="relative rounded-xl bg-primary/10 p-4">
                  <Trophy className="h-14 w-14 text-primary" />
                  <Badge className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]">
                    {data.auctionType ?? "Auction"}
                  </Badge>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Auction name</p>
                    <p className="font-semibold break-words">{data.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Organisation</p>
                    <p className="font-semibold">{orgName || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-9 w-9 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Allotment</p>
                      <p className="font-semibold">{data.allotmentType ?? "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 items-start">
                  <div className="flex items-center gap-2">
                    <Clock className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Time remaining</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {timeRemaining}
                      </p>
                    </div>
                  </div>
                  {mode === "response" &&
                    data.allotmentType === "Lot Based" &&
                    auctionResp && (
                      <div className="flex items-center gap-2">
                        <IndianRupee className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Total amount</p>
                          <p className="text-lg font-semibold">
                            {money(auctionResp.auctionTotal)}{" "}
                            {data.currency ?? "INR"}
                          </p>
                        </div>
                      </div>
                    )}
                  {mode === "response" &&
                    data.allotmentType === "Lot Based" &&
                    data.auctionStrategy === "Rank Auction" && (
                      <div className="flex items-center gap-2">
                        <Medal className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Overall rank</p>
                          <p className="text-lg font-semibold">
                            {auctionResp?.suppRank ?? "—"} Rank
                          </p>
                        </div>
                      </div>
                    )}
                  {mode === "response" &&
                    data.allotmentType === "Lot Based" &&
                    data.auctionStrategy === "Price Auction" && (
                      <div className="flex items-center gap-2">
                        <Hammer className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Best total price
                          </p>
                          <p className="text-lg font-semibold">
                            {data.lotLeadingPrice ?? "—"}
                          </p>
                        </div>
                      </div>
                    )}
                  <div className="ml-auto">
                    <DropdownMenu open={taskOpen} onOpenChange={setTaskOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="relative">
                          <Bell className="h-4 w-4" />
                          {broadCastMsgList.length > 0 ? (
                            <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center px-1">
                              {broadCastMsgList.length}
                            </span>
                          ) : null}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-80 max-h-80 overflow-y-auto">
                        {[...(broadCastMsgList as BroadcastItem[])].reverse().map((item, index) => (
                          <DropdownMenuItem key={index} className="flex flex-col items-start gap-1 py-2">
                            <span className="font-medium line-clamp-2">
                              {item.broad_cast_message}
                            </span>
                            {item.creation_time ? (
                              <span className="text-xs text-muted-foreground">
                                {formatDate(item.creation_time, true)}
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>

            {/* VIEW */}
            {mode === "view" && (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headerCols.map((row, i) => {
                          if (row.viewedBy !== "Both") return null;
                          if (row.editableBy?.toLowerCase() === "supplier")
                            return null;
                          return (
                            <TableHead
                              key={i}
                              className={i === 0 ? "text-left" : "text-center"}
                            >
                              {row.columnKey}
                            </TableHead>
                          );
                        })}
                        {isBasket &&
                        displayRows[0]?.basketAuctionStatus != null &&
                        displayRows[0]?.basketAuctionStatus !== "" ? (
                          <>
                            <TableHead>Status</TableHead>
                            <TableHead>Time</TableHead>
                          </>
                        ) : null}
                        {displayRows.some(
                          (r) => r.suppWiseCap && r.suppWiseCap.length > 0
                        ) ? (
                          <TableHead>Price cap</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayRows.map((column, ri) => (
                        <TableRow key={ri}>
                          {column.auctionEventRowColumn?.map((item, i) => {
                            if (item.viewedBy !== "Both") return null;
                            if (item.editableBy?.toLowerCase() === "supplier")
                              return null;
                            return (
                              <TableCell
                                key={i}
                                className={i === 0 ? "text-left" : "text-center"}
                              >
                                {item.columnKey === "Item Name" && item.columnValue ? (
                                  <span className="font-semibold">
                                    {item.columnValue}
                                    {renderSpecTooltip(item.columnValue)}
                                  </span>
                                ) : item.columnValue ? (
                                  item.columnValue
                                ) : (
                                  "NA"
                                )}
                              </TableCell>
                            );
                          })}
                          {isBasket &&
                          displayRows[0]?.basketAuctionStatus != null &&
                          displayRows[0]?.basketAuctionStatus !== "" ? (
                            <>
                              <TableCell
                                className={
                                  column.basketAuctionStatus === "Open"
                                    ? "bg-yellow-300 text-foreground font-medium"
                                    : column.basketAuctionStatus === "Active"
                                      ? "bg-emerald-600 text-white font-medium"
                                      : column.basketAuctionStatus === "Closed"
                                        ? "bg-red-500 text-white font-medium"
                                        : ""
                                }
                              >
                                {column.basketAuctionStatus === "Open"
                                  ? "Upcoming"
                                  : column.basketAuctionStatus}
                              </TableCell>
                              <TableCell>
                                {column.basketAuctionStatus === "Active" ? (
                                  <span className="font-semibold">
                                    End&apos;s in:{" "}
                                    {showBasketTimer(column.endTime)}
                                  </span>
                                ) : column.basketAuctionStatus === "Open" ? (
                                  <span className="font-semibold">
                                    Start&apos;s in:{" "}
                                    {showBasketTimer(column.startTime)}
                                  </span>
                                ) : column.basketAuctionStatus === "Closed" ? (
                                  <b>Closed</b>
                                ) : null}
                              </TableCell>
                            </>
                          ) : null}
                          {displayRows.some(
                            (r) => r.suppWiseCap && r.suppWiseCap.length > 0
                          ) ? (
                            <TableCell>
                              {
                                column.suppWiseCap?.find(
                                  (c) => Number(c.suppId) === supplierId
                                )?.price
                              }
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {timeRemaining !== "Closed" ? (
                      <>
                        <Checkbox
                          id="tnc"
                          checked={termsAccepted}
                          onCheckedChange={(c) =>
                            setTermsAccepted(c === true)
                          }
                        />
                        <label htmlFor="tnc" className="text-sm cursor-pointer">
                          I accept the{" "}
                          <button
                            type="button"
                            className="text-primary underline"
                            onClick={() => setTermsOpen(true)}
                          >
                            Terms &amp; Conditions
                          </button>
                        </label>
                      </>
                    ) : null}
                  </div>
                  <Button
                    disabled={isViewOnly || timeRemaining === "Closed" || !termsAccepted}
                    onClick={bidNowNav}
                  >
                    Bid now
                  </Button>
                </div>
              </>
            )}

            {/* RESPONSE (read-only bid state) */}
            {mode === "response" && (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {data.allotmentType === "Partial Based" ? (
                          <TableHead>
                            {data.auctionStrategy === "Rank Auction"
                              ? "Rank"
                              : "Best price"}
                          </TableHead>
                        ) : null}
                        {isBasket &&
                        displayRows[0]?.basketAuctionStatus != null &&
                        displayRows[0]?.basketAuctionStatus !== "" ? (
                          <>
                            <TableHead>Status</TableHead>
                            <TableHead>Time</TableHead>
                          </>
                        ) : null}
                        {headerCols.map((row, i) => {
                          if (row.viewedBy !== "Both") return null;
                          return (
                            <TableHead
                              key={i}
                              className={i === 0 ? "text-left" : "text-center"}
                            >
                              {row.columnKey}
                            </TableHead>
                          );
                        })}
                        {displayRows.some(
                          (r) => r.suppWiseCap && r.suppWiseCap.length > 0
                        ) ? (
                          <TableHead>Price cap</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayRows.map((column, ri) => (
                        <TableRow key={ri}>
                          {data.allotmentType === "Partial Based" ? (
                            <TableCell>
                              {column.leadingPrice ? (
                                money(column.leadingPrice)
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <Medal className="h-5 w-5" />
                                  {column.suppProductRank ?? "N/A"}
                                </span>
                              )}
                            </TableCell>
                          ) : null}
                          {isBasket &&
                          displayRows[0]?.basketAuctionStatus != null &&
                          displayRows[0]?.basketAuctionStatus !== "" ? (
                            <>
                              <TableCell
                                className={
                                  column.basketAuctionStatus === "Open"
                                    ? "bg-yellow-300 text-foreground font-medium"
                                    : column.basketAuctionStatus === "Active"
                                      ? "bg-emerald-600 text-white font-medium"
                                      : column.basketAuctionStatus === "Closed"
                                        ? "bg-red-500 text-white font-medium"
                                        : ""
                                }
                              >
                                {column.basketAuctionStatus === "Open"
                                  ? "Upcoming"
                                  : column.basketAuctionStatus}
                              </TableCell>
                              <TableCell>
                                {column.basketAuctionStatus === "Active" ? (
                                  <span className="font-semibold">
                                    End&apos;s in:{" "}
                                    {showBasketTimer(column.endTime)}
                                  </span>
                                ) : column.basketAuctionStatus === "Open" ? (
                                  <span className="font-semibold">
                                    Start&apos;s in:{" "}
                                    {showBasketTimer(column.startTime)}
                                  </span>
                                ) : column.basketAuctionStatus === "Closed" ? (
                                  <b>Closed</b>
                                ) : null}
                              </TableCell>
                            </>
                          ) : null}
                          {(column.columnResponseValues ??
                            column.auctionEventRowColumn ??
                            []
                          ).map((item, i) => {
                            if (item.viewedBy !== "Both") return null;
                            const editable =
                              item.editableBy?.toLowerCase() === "supplier";
                            return (
                              <TableCell
                                key={i}
                                className={i === 0 ? "text-left" : "text-center"}
                              >
                                {editable ? (
                                  item.suppRspColumn ??
                                  item.suppRspColumnValue ??
                                  (data.allotmentType === "Partial Based"
                                    ? "N/A"
                                    : data.allotmentType === "Lot Based"
                                      ? "0"
                                      : "N/A")
                                ) : item.columnKey === "Item Name" &&
                                  item.columnValue ? (
                                  <span className="font-semibold">
                                    {item.columnValue}
                                    {renderSpecTooltip(item.columnValue)}
                                  </span>
                                ) : item.columnValue ? (
                                  item.columnValue
                                ) : (
                                  "NA"
                                )}
                              </TableCell>
                            );
                          })}
                          {displayRows.some(
                            (r) => r.suppWiseCap && r.suppWiseCap.length > 0
                          ) ? (
                            <TableCell>
                              {
                                column.suppWiseCap?.find(
                                  (c) => Number(c.suppId) === supplierId
                                )?.price
                              }
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end gap-2">
                  {isBasket &&
                    displayRows.some(
                      (x) =>
                        x.basketAuctionStatus === "Active" &&
                        (x.columnResponseValues ?? x.auctionEventRowColumn ?? []).some(
                          (y) =>
                            y.columnKey === "Price" &&
                            (y.suppRspColumn == null || y.suppRspColumn === "")
                        )
                    ) ? (
                    <Button
                      disabled={isViewOnly || timeRemaining === "Closed"}
                      onClick={() =>
                        navigate(`/app/supplier-auctions/${auctionId}/bid`)
                      }
                    >
                      Bid now
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        disabled={isViewOnly}
                        onClick={async () => {
                          setBidSummaryOpen(true);
                          await bidSummaryQuery.refetch();
                        }}
                      >
                        Bid Summary
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => deleteBidReqMutation.mutate()}
                        disabled={
                          isViewOnly ||
                          data?.delReqStatus === "Y" ||
                          deleteBidReqMutation.isPending
                        }
                      >
                        Delete Bid
                      </Button>
                      {data?.delReqStatus !== "Y" && (
                        <Button
                          disabled={isViewOnly || timeRemaining === "Closed"}
                          onClick={() =>
                            navigate(`/app/supplier-auctions/${auctionId}/revise`)
                          }
                        >
                          Revise bid
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {/* BID / REVISE editors */}
            {(mode === "bid" || mode === "revise") && draftRows && (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {(draftRows[0]?.columnResponseValues ?? []).map(
                          (row, i) => {
                            if (row.viewedBy !== "Both") return null;
                            return (
                              <TableHead
                                key={i}
                                className={i === 0 ? "text-left" : "text-center"}
                              >
                                {row.columnKey}
                              </TableHead>
                            );
                          }
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draftRows.map((column) => (
                        <TableRow key={column.auRowId}>
                          {(column.columnResponseValues ?? []).map((item, i) => {
                            if (item.viewedBy !== "Both") return null;
                            const supplierEditable =
                              item.editableBy?.toLowerCase() === "supplier";
                            if (supplierEditable && isTotalColumnKey(item)) {
                              return (
                                <TableCell key={i}>
                                  <Input
                                    readOnly
                                    className="text-center"
                                    value={String(
                                      item.suppRspColumnValue ??
                                        item.suppRspColumn ??
                                        ""
                                    )}
                                  />
                                </TableCell>
                              );
                            }
                            if (supplierEditable) {
                              return (
                                <TableCell key={i}>
                                  <Input
                                    type="number"
                                    className="text-center"
                                    defaultValue={
                                      item.suppRspColumnValue ??
                                      item.suppRspColumn ??
                                      ""
                                    }
                                    onChange={(e) =>
                                      handleInputChange(
                                        column.auRowId,
                                        item.columnId,
                                        e.target.value
                                      )
                                    }
                                    onBlur={(e) =>
                                      handleInputBlur(
                                        column.auRowId,
                                        item.columnId,
                                        e.target.value,
                                        data.auctionType,
                                        data.allotmentType
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "-" || e.key === "+")
                                        e.preventDefault();
                                    }}
                                  />
                                  {item.errormsg ? (
                                    <p className="text-xs text-destructive mt-1">
                                      {item.errormsg}
                                    </p>
                                  ) : null}
                                  {item.errormsg1 ? (
                                    <p className="text-xs text-destructive mt-1">
                                      {item.errormsg1}
                                    </p>
                                  ) : null}
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell
                                key={i}
                                className={i === 0 ? "text-left" : "text-center"}
                              >
                                {item.columnKey === "Item Name" &&
                                item.columnValue ? (
                                  <span className="font-semibold">
                                    {item.columnValue}
                                    {renderSpecTooltip(item.columnValue)}
                                  </span>
                                ) : item.columnValue ? (
                                  item.columnValue
                                ) : (
                                  "NA"
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end">
                  <Button
                    disabled={
                      isViewOnly ||
                      timeRemaining === "Closed" ||
                      submitMutation.isPending ||
                      updateMutation.isPending
                    }
                    onClick={mode === "bid" ? onSubmitBid : onUpdateBid}
                  >
                    {mode === "bid" ? "Submit" : "Update"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Terms &amp; conditions</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {(data.tncs ?? []).map((t, i) => (
                <p key={i}>
                  {i + 1}. {t.tnc_text}
                </p>
              ))}
              {(!data.tncs || data.tncs.length === 0) && (
                <p className="text-muted-foreground">No terms listed for this event.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={bidSummaryOpen} onOpenChange={setBidSummaryOpen}>
          <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bid Summary</DialogTitle>
            </DialogHeader>
            {bidSummaryQuery.isFetching ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : bidSummaryList.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {bidSummaryColumns.map((column, idx) => (
                        <TableHead key={`${column.columnKey ?? "col"}-${idx}`}>
                          {column.columnKey}
                        </TableHead>
                      ))}
                      <TableHead>Rank</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bidSummaryList.flatMap((item, i) =>
                      (item.templateResponseRows ?? []).map((row, j) => {
                        const deleted =
                          String(item.status ?? "").toLowerCase() === "deleted";
                        const rank =
                          Number(item.suppRank ?? 0) === 0
                            ? row.suppProductRank
                            : item.suppRank;
                        const timeText = item.bidTime
                          ? formatDate(item.bidTime, true)
                          : "—";
                        return (
                          <TableRow key={`${i}-${j}`}>
                            {(row.columnResponseValues ?? []).map((column, k) => {
                              const text =
                                column.columnValue != null &&
                                String(column.columnValue).trim() !== ""
                                  ? String(column.columnValue)
                                  : column.suppRspColumnValue != null &&
                                      String(column.suppRspColumnValue).trim() !== ""
                                    ? String(column.suppRspColumnValue)
                                    : "N/A";
                              return (
                                <TableCell key={k}>
                                  {deleted ? <del>{text}</del> : text}
                                </TableCell>
                              );
                            })}
                            <TableCell>
                              {deleted ? <del>{rank ?? "—"}</del> : rank ?? "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {deleted ? <del>{timeText}</del> : timeText}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No Bid Summary Found
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </TooltipProvider>
  );
}
