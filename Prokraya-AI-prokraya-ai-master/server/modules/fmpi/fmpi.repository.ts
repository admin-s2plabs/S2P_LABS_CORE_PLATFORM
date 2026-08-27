import { getContextPool } from "../../tenant-context";
import { pool } from "../_shared";
import type { FmpSnapshot } from "@shared/schema";

const getPool = () => getContextPool() ?? pool;

export type FmpDocType = "BID" | "PR" | "PO";

export interface FmpSnapshotKey {
  docType: FmpDocType;
  docId: string;
  docLineId: number | string;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Maps a persisted row back onto the in-memory FmpSnapshot shape the UI renders. */
export function rowToSnapshot(row: any): FmpSnapshot | null {
  if (!row) return null;
  const used = (row.sources_used_list || "").split(",").filter(Boolean);
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    productCategory: row.product_category,
    currCode: row.currency,
    deliveryLocation: row.delivery_location,
    quantity: num(row.quantity),
    fairMarketPrice: num(row.fair_market_price),
    rangeMin: num(row.range_min),
    rangeMax: num(row.range_max),
    totalFairMarketPrice: num(row.total_fair_market_price),
    totalRangeMin: num(row.total_range_min),
    totalRangeMax: num(row.total_range_max),
    confidenceScore: num(row.confidence_score) ?? 0,
    priceTrendDirection: row.price_trend_direction,
    sourcesUsedCount: num(row.sources_used_count) ?? 0,
    sourcesUsedList: row.sources_used_list,
    sourcesUsed: used,
    reasoning: row.reasoning,
    calculatedBy: row.calculated_by,
    calculatedDate: row.calculated_date,
  };
}

/**
 * Upserts the published snapshot for a document line. One live row per
 * (docType, docId, docLineId) — re-running the benchmark overwrites it so all
 * suppliers keep seeing the same number.
 */
export async function upsertSnapshot(
  key: FmpSnapshotKey,
  snapshot: FmpSnapshot,
  savedBy: string,
): Promise<void> {
  // NaN survives `?? null` and Postgres rejects it for numeric columns, which
  // would fail the whole insert over one bad field. Send null instead.
  const n = (v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? null : (v ?? null));

  await getPool().query(
    `INSERT INTO dbo.supp_fmp_snapshot_dtls (
       doc_type, doc_id, doc_line_id, item_id, item_name, product_category,
       currency, quantity, delivery_location,
       fair_market_price, range_min, range_max,
       total_fair_market_price, total_range_min, total_range_max,
       confidence_score, price_trend_direction, sources_used_count,
       sources_used_list, reasoning, calculated_by, calculated_date,
       last_updated_by, last_updated_date
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9,
       $10, $11, $12,
       $13, $14, $15,
       $16, $17, $18,
       $19, $20, $21, NOW(),
       $21, NOW()
     )
     ON CONFLICT (doc_type, doc_id, doc_line_id) DO UPDATE SET
       item_id = EXCLUDED.item_id,
       item_name = EXCLUDED.item_name,
       product_category = EXCLUDED.product_category,
       currency = EXCLUDED.currency,
       quantity = EXCLUDED.quantity,
       delivery_location = EXCLUDED.delivery_location,
       fair_market_price = EXCLUDED.fair_market_price,
       range_min = EXCLUDED.range_min,
       range_max = EXCLUDED.range_max,
       total_fair_market_price = EXCLUDED.total_fair_market_price,
       total_range_min = EXCLUDED.total_range_min,
       total_range_max = EXCLUDED.total_range_max,
       confidence_score = EXCLUDED.confidence_score,
       price_trend_direction = EXCLUDED.price_trend_direction,
       sources_used_count = EXCLUDED.sources_used_count,
       sources_used_list = EXCLUDED.sources_used_list,
       reasoning = EXCLUDED.reasoning,
       calculated_by = EXCLUDED.calculated_by,
       calculated_date = NOW(),
       last_updated_by = EXCLUDED.last_updated_by,
       last_updated_date = NOW()`,
    [
      key.docType,
      String(key.docId),
      Number(key.docLineId),
      snapshot.itemId ?? null,
      snapshot.itemName ?? null,
      n(snapshot.productCategory),
      snapshot.currCode ?? null,
      n(snapshot.quantity),
      snapshot.deliveryLocation ?? null,
      n(snapshot.fairMarketPrice),
      n(snapshot.rangeMin),
      n(snapshot.rangeMax),
      n(snapshot.totalFairMarketPrice),
      n(snapshot.totalRangeMin),
      n(snapshot.totalRangeMax),
      n(snapshot.confidenceScore),
      snapshot.priceTrendDirection ?? null,
      n(snapshot.sourcesUsedCount),
      snapshot.sourcesUsedList ?? null,
      snapshot.reasoning ?? null,
      savedBy,
    ],
  );
}

/** All published snapshots for a document, keyed by line id. */
export async function getSnapshotsByDoc(
  docType: FmpDocType,
  docId: string,
): Promise<Record<string, FmpSnapshot>> {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_fmp_snapshot_dtls WHERE doc_type = $1 AND doc_id = $2`,
    [docType, String(docId)],
  );
  const map: Record<string, FmpSnapshot> = {};
  for (const row of result.rows) {
    const snap = rowToSnapshot(row);
    if (snap) map[String(row.doc_line_id)] = snap;
  }
  return map;
}

/** Line ids of a document that already have a published snapshot. */
export async function getSnapshotLineIds(
  docType: FmpDocType,
  docId: string,
): Promise<Set<string>> {
  const result = await getPool().query(
    `SELECT doc_line_id FROM dbo.supp_fmp_snapshot_dtls WHERE doc_type = $1 AND doc_id = $2`,
    [docType, String(docId)],
  );
  return new Set(result.rows.map((r: any) => String(r.doc_line_id)));
}

export async function deleteSnapshot(key: FmpSnapshotKey): Promise<void> {
  await getPool().query(
    `DELETE FROM dbo.supp_fmp_snapshot_dtls
     WHERE doc_type = $1 AND doc_id = $2 AND doc_line_id = $3`,
    [key.docType, String(key.docId), Number(key.docLineId)],
  );
}
