/** Builds the comparative statement matrix (legacy auction-details compare bids). */

export type CompareColumnCell = {
  id?: number;
  columnId?: number;
  column_id?: number | string;
  columnKey?: string;
  column_key?: string;
  columnValue?: string;
  column_value?: string;
  editableBy?: string;
  editable_by?: string;
  suppRspColumnValue?: string | number;
  supp_rsp_column_value?: string | number;
  suppRspColumn?: string | number;
  supp_rsp_column?: string | number;
};

export type CompareTemplateRow = {
  auRowId?: number;
  au_row_id?: number;
  columnResponseValues?: CompareColumnCell[];
  column_response_values?: CompareColumnCell[];
  auctionEventRowColumn?: CompareColumnCell[];
  suppProductRank?: number;
  supp_product_rank?: number;
  lineItemBasePrice?: string | number | null;
  line_item_base_price?: string | number | null;
  lineItemTotal?: string | number | null;
  line_item_total?: string | number | null;
};

export type CompareSuppResponse = {
  supplierName?: string;
  suppRank?: number | string;
  auctionTotal?: number | string;
  bidTime?: string;
  templateResponseRows?: CompareTemplateRow[];
};

export type CompareBidLine = {
  auRowId?: number;
  itemName: string;
  qty?: string;
  suppObj: CompareColumnCell[];
  /** One array of cells per supplier (same order as `suppliers`). */
  cellsPerSupplier: (CompareColumnCell | null)[][];
};

export type CompareBidsModel = {
  suppliers: CompareSuppResponse[];
  rows: CompareBidLine[];
};

function rowCols(r: CompareTemplateRow): CompareColumnCell[] {
  return (
    r.columnResponseValues ??
    r.column_response_values ??
    r.auctionEventRowColumn ??
    []
  );
}

function editableSupplierCols(row: CompareTemplateRow): CompareColumnCell[] {
  return rowCols(row).filter((col) => {
    const ed = String(col.editableBy ?? col.editable_by ?? "").trim().toLowerCase();
    return ed === "supplier";
  });
}

export function buildCompareBidsModel(
  templateRows: CompareTemplateRow[] | undefined,
  suppList: CompareSuppResponse[] | undefined,
  allotmentType: string
): CompareBidsModel {
  if (!templateRows?.length) {
    return { suppliers: [], rows: [] };
  }

  const suppliers = (suppList ?? [])
    .filter((item) => {
      const t = item.auctionTotal;
      if (t == null || t === "") return false;
      const n = typeof t === "number" ? t : parseFloat(String(t));
      return Number.isFinite(n) && n > 0;
    })
    .sort(
      (a, b) =>
        parseFloat(String(a.suppRank ?? 0)) - parseFloat(String(b.suppRank ?? 0))
    )
    .map((s, i) => ({ ...s, suppRank: i + 1 }));

  const isPartial = allotmentType === "Partial Based";

  const rows: CompareBidLine[] = [];

  for (const item of templateRows) {
    const cols = rowCols(item);
    const itemName =
      cols.find((c) => (c.columnKey ?? c.column_key) === "Item Name")?.columnValue ??
      cols.find((c) => (c.columnKey ?? c.column_key) === "Item Name")?.column_value ??
      "—";
    const qty =
      cols.find((c) => (c.columnKey ?? c.column_key) === "Quantity")?.columnValue ??
      cols.find((c) => (c.columnKey ?? c.column_key) === "Quantity")?.column_value;
    const suppObj = editableSupplierCols(item);

    const cellsPerSupplier: (CompareColumnCell | null)[][] = [];

    for (const supp of suppliers) {
      // Match purely by auRowId (a stable row id) — requiring the "Item Name"
      // column value to also match was fragile: that column isn't supplier-editable,
      // so whether a given response row echoes it back verbatim is incidental, and a
      // mismatch (e.g. a long/edited product name) silently dropped valid supplier prices.
      const ress =
        supp.templateResponseRows?.filter(
          (x) => Number(x.auRowId ?? x.au_row_id) === Number(item.auRowId ?? item.au_row_id)
        ) ?? [];
      const resp = ress[0];

      const filtArray: (CompareColumnCell | null)[] = [];

      if (isPartial) {
        filtArray.push({
          columnKey: "Rank",
          suppRspColumnValue: resp?.suppProductRank,
        });
      }

      for (const templateCol of suppObj) {
        const tid = Number(templateCol.columnId ?? templateCol.column_id);
        const aucVal = rowCols(resp ?? {}).filter((column) => {
          return Number(column.columnId ?? column.column_id) === tid;
        });
        const mapped = aucVal?.[0] ?? null;
        if (mapped) {
          filtArray.push(mapped);
          continue;
        }
        const colKey = String(templateCol.columnKey ?? templateCol.column_key ?? "")
          .trim()
          .toLowerCase();
        if (colKey === "price") {
          const priceValue =
            resp?.lineItemBasePrice ??
            resp?.line_item_base_price;
          filtArray.push({
            columnKey: templateCol.columnKey ?? templateCol.column_key,
            suppRspColumnValue: priceValue ?? undefined,
          });
          continue;
        }
        if (colKey === "total") {
          const totalValue =
            resp?.lineItemTotal ??
            resp?.line_item_total;
          filtArray.push({
            columnKey: templateCol.columnKey ?? templateCol.column_key,
            suppRspColumnValue: totalValue ?? undefined,
          });
          continue;
        }
        filtArray.push(null);
      }

      cellsPerSupplier.push(filtArray);
    }

    rows.push({
      auRowId: item.auRowId,
      itemName,
      qty,
      suppObj,
      cellsPerSupplier,
    });
  }

  return { suppliers, rows };
}
