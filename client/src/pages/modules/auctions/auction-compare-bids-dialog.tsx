import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate } from "@/lib/common-functions";
import { cn } from "@/lib/utils";
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import { Download, ListOrdered, Loader2, Maximize2, Minimize2, Scale, Trophy, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import {
  buildCompareBidsModel,
  type CompareBidsModel,
  type CompareColumnCell,
  type CompareSuppResponse,
  type CompareTemplateRow,
} from "./compare-bids-model";

function asSuppResponseList(v: unknown): CompareSuppResponse[] | undefined {
  return Array.isArray(v) ? (v as CompareSuppResponse[]) : undefined;
}

function formatBidTime(date?: string | Date | null) {
  if (!date) return "NA";
  try {
    return formatDate(date, true);
  } catch {
    return String(date);
  }
}

function numVal(v: unknown): number {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return v;
  const s = String(v);
  const n = parseFloat(s.includes(" ") ? s.split(" ")[0]! : s);
  return Number.isFinite(n) ? n : NaN;
}

function displayCellValue(
  cell: CompareColumnCell | null,
  columnKey: string | undefined,
  isPartial: boolean
) {
  if (!cell) return "N/A";
  const raw =
    cell.suppRspColumnValue ??
    cell.supp_rsp_column_value ??
    cell.suppRspColumn ??
    cell.supp_rsp_column ??
    cell.columnValue ??
    cell.column_value;
  if (columnKey === "Rank" && isPartial) {
    const rank = numVal(raw);
    return rank > 0 ? String(raw) : "N/A";
  }
  const n = numVal(raw);
  if (Number.isFinite(n)) {
    return n > 0 ? String(raw) : "N/A";
  }
  const s = raw != null ? String(raw).trim() : "";
  return s !== "" ? String(raw) : "N/A";
}

function SupplierHeaderCard({
  supplier,
  lotBased,
}: {
  supplier: CompareSuppResponse;
  lotBased: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-sm text-center min-w-[132px]">
      {lotBased ? (
        <div className="flex items-center justify-center gap-1 mb-1">
          <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
          <span className="text-sm font-semibold tabular-nums">
            {supplier.suppRank ?? "—"}
          </span>
        </div>
      ) : null}
      <p
        className="text-xs font-medium line-clamp-2 leading-tight"
        title={supplier.supplierName}
      >
        {supplier.supplierName ?? "—"}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">
        {formatBidTime(supplier.bidTime)}
      </p>
    </div>
  );
}

function CompareTable({ model, allotmentType }: { model: CompareBidsModel; allotmentType: string }) {
  const isPartial = allotmentType === "Partial Based";
  const lotBased = allotmentType === "Lot Based";
  const { suppliers, rows } = model;

  return (
    <div className="rounded-md border overflow-scroll shadow-sm">
      <ScrollArea className={cn("w-full", suppliers.length > 2 ? "max-h-[min(70vh,560px)]" : "max-h-[min(65vh,480px)]")}>
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-muted/60 border-b">
              <th className="p-3 text-center align-bottom w-[140px]">
                <span className="text-xs font-semibold tracking-wide">PRODUCTS</span>
              </th>
              {suppliers.map((s, i) => (
                <th key={`${s.supplierName ?? "s"}-${i}`} className="p-2 align-bottom font-normal">
                  <SupplierHeaderCard supplier={s} lotBased={lotBased} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((compare, i) => (
              <Fragment key={compare.auRowId ?? `r-${i}`}>
                <tr className="border-b border-border/60">
                  <td
                    colSpan={suppliers.length + 1}
                    className="px-3 py-2"
                    style={{ background: "#FEE1DA" }}
                  >
                    <h3 className="text-base font-semibold mb-0">{compare.itemName}</h3>
                  </td>
                </tr>
                <tr className="border-b border-border/40 align-top">
                  <td className="p-3 text-center space-y-2 bg-muted/20">
                    {isPartial ? (
                      <p className="text-xs font-medium text-muted-foreground">Rank</p>
                    ) : null}
                    {compare.suppObj.map((supp) =>
                      supp.columnKey === "Total" ? (
                        <p key={supp.columnKey} className="text-base font-bold leading-tight">
                          {supp.columnKey}
                        </p>
                      ) : (
                        <p
                          key={supp.columnKey}
                          className="text-xs leading-tight line-clamp-2"
                          title={supp.columnKey}
                        >
                          {supp.columnKey}
                        </p>
                      )
                    )}
                  </td>
                  {compare.cellsPerSupplier.map((col, k) => (
                    <td key={k} className="p-3 align-top border-l border-border/30">
                      <div className="space-y-2">
                        {col.map((val, l) => {
                          const isRankCol = isPartial && l === 0;
                          const suppIdx = isPartial ? l - 1 : l;
                          const colKey = isRankCol ? "Rank" : compare.suppObj[suppIdx]?.columnKey;
                          const key = `${colKey ?? "c"}-${k}-${l}`;
                          const shown = displayCellValue(val, colKey, isPartial);
                          const isTotal = colKey === "Total";

                          if (isRankCol) {
                            return (
                              <p key={key} className="flex items-center gap-1 text-xs">
                                <ListOrdered className="h-4 w-4 text-amber-600 shrink-0" />
                                <span className="font-medium tabular-nums">{shown}</span>
                              </p>
                            );
                          }

                          return (
                            <p
                              key={key}
                              className={cn(
                                "text-xs break-words",
                                isTotal && "text-base font-bold"
                              )}
                            >
                              {shown}
                            </p>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function downloadComparePdf(
  model: CompareBidsModel,
  allotmentType: string,
  details: Record<string, unknown> | null
) {
  const { suppliers, rows } = model;
  if (!rows.length || !suppliers.length) return;

  const isPartial = allotmentType === "Partial Based";
  const isLotBased = allotmentType === "Lot Based";
  const margin = 10;

  const doc = new jsPDF("l", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 1.5, "F");
  y += 6;

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(79, 70, 229);
  doc.text("COMPARATIVE STATEMENT", margin, y);
  y += 6;

  const auctionName = String(details?.name ?? "");
  if (auctionName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(auctionName, margin, y);
    y += 4;
  }

  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 5;

  const headerRow = [
    "Item / Field",
    ...suppliers.map((s) =>
      [
        s.supplierName ?? "—",
        s.bidTime ? formatBidTime(s.bidTime) : "",
        isLotBased && s.suppRank != null ? `Rank: ${s.suppRank}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ];

  type BodyCell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const body: BodyCell[][] = [];

  for (const row of rows) {
    body.push([
      {
        content: row.itemName,
        colSpan: suppliers.length + 1,
        styles: { fillColor: [254, 225, 218], fontStyle: "bold", halign: "left" },
      },
    ]);

    if (isPartial) {
      body.push([
        "Rank",
        ...suppliers.map((_, si) => {
          const col = row.cellsPerSupplier[si] ?? [];
          return displayCellValue(col[0] ?? null, "Rank", true);
        }),
      ]);
    }

    row.suppObj.forEach((supp, fi) => {
      const colKey = supp.columnKey ?? "—";
      body.push([
        colKey,
        ...suppliers.map((_, si) => {
          const col = row.cellsPerSupplier[si] ?? [];
          const cellIdx = isPartial ? fi + 1 : fi;
          return displayCellValue(col[cellIdx] ?? null, colKey, isPartial);
        }),
      ]);
    });
  }

  autoTable(doc, {
    startY: y,
    head: [headerRow],
    body,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak", textColor: [30, 30, 30] as [number, number, number] },
    headStyles: { fillColor: [245, 245, 250] as [number, number, number], textColor: [30, 30, 30] as [number, number, number], fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 28 } },
  });

  doc.save(`comparative-statement-${Date.now()}.pdf`);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Event details from API (`AuctionDetails` and similar shapes). */
  details: Record<string, unknown> | null;
  templateRows: CompareTemplateRow[];
  loading?: boolean;
};

export function AuctionCompareBidsDialog({
  open,
  onOpenChange,
  details,
  templateRows,
  loading = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const allotmentType = String(
    (details?.allotmentType as string | undefined) ?? ""
  );
  const model = useMemo(
    () =>
      buildCompareBidsModel(
        templateRows,
        asSuppResponseList(details?.auAuctionSuppResponseEventList),
        allotmentType
      ),
    [templateRows, details?.auAuctionSuppResponseEventList, allotmentType]
  );

  const hasSuppliers = model.suppliers.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setExpanded(false);
        onOpenChange(o);
      }}
    >
      <DialogContent
        hideCloseButton
        className={cn(
          "flex flex-col p-0 gap-0",
          expanded
            ? "max-w-[96vw] w-[96vw] h-[90vh] max-h-[90vh]"
            : suppliersWidthClass(model.suppliers.length)
        )}
      >
        <DialogHeader className="px-4 pt-4 pb-2 pr-12 space-y-0 border-b shrink-0">
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              COMPARATIVE STATEMENT
            </DialogTitle>
            <div className="flex items-center gap-1 shrink-0">
              {hasSuppliers && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  title="Download PDF"
                  onClick={() => downloadComparePdf(model, allotmentType, details)}
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={expanded ? "Restore" : "Maximize"}
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Close"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 pt-3">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !templateRows.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No line items to compare.
            </p>
          ) : hasSuppliers ? (
            <CompareTable model={model} allotmentType={allotmentType} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Scale className="h-12 w-12 opacity-30 mb-3" />
              <p className="text-sm font-medium text-foreground/80">
                No Suppliers participated yet!
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function suppliersWidthClass(n: number) {
  if (n > 2) return "max-w-[min(920px,94vw)] w-full";
  return "max-w-[min(720px,94vw)] w-full";
}

/** Same comparative table as the dialog, for the full-page route. */
export function CompareBidsStatementPageBody({
  details,
  templateRows,
  loading = false,
}: Omit<Props, "open" | "onOpenChange">) {
  const allotmentType = String(
    (details?.allotmentType as string | undefined) ?? ""
  );
  const model = useMemo(
    () =>
      buildCompareBidsModel(
        templateRows,
        asSuppResponseList(details?.auAuctionSuppResponseEventList),
        allotmentType
      ),
    [templateRows, details?.auAuctionSuppResponseEventList, allotmentType]
  );
  const hasSuppliers = model.suppliers.length > 0;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!templateRows.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">No line items to compare.</p>
    );
  }
  if (hasSuppliers) {
    return <CompareTable model={model} allotmentType={allotmentType} />;
  }
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
      <Scale className="h-12 w-12 opacity-30 mb-3" />
      <p className="text-sm font-medium text-foreground/80">No Suppliers participated yet!</p>
    </div>
  );
}
