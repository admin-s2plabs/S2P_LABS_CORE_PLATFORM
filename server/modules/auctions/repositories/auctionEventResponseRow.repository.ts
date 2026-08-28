import { db } from "../../../db";
import { getContextDb } from "../../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { sql } from "drizzle-orm";

export async function findByAuRowId(id: number) {
  const result = await getDb().execute(sql`
    SELECT DISTINCT MIN(line_item_total) AS value
    FROM dbo.au_auction_supp_event_response_row
    WHERE au_row_id = ${id}
      AND line_item_total IN (
        SELECT MIN(line_item_total)
        FROM dbo.au_auction_supp_event_response_row
        WHERE line_item_total <> 0
        GROUP BY au_row_id
      )
  `);

  return result.rows?.[0]?.value ?? null;
}

export async function findByAuRowIdBasePrice(id: number) {
  const result = await getDb().execute(sql`
    SELECT DISTINCT MIN(line_item_base_price) AS value
    FROM dbo.au_auction_supp_event_response_row
    WHERE au_row_id = ${id}
      AND line_item_base_price IN (
        SELECT MIN(line_item_base_price)
        FROM dbo.au_auction_supp_event_response_row
        WHERE line_item_base_price <> 0
        GROUP BY au_row_id
      )
  `);

  return result.rows?.[0]?.value ?? null;
}

export async function findByAuRowIdForwardAuction(id: number) {
  const result = await getDb().execute(sql`
    SELECT DISTINCT MAX(line_item_total) AS value
    FROM dbo.au_auction_supp_event_response_row
    WHERE au_row_id = ${id}
      AND line_item_total IN (
        SELECT MAX(line_item_total)
        FROM dbo.au_auction_supp_event_response_row
        WHERE line_item_total <> 0
        GROUP BY au_row_id
      )
  `);

  return result.rows?.[0]?.value ?? null;
}

export async function findByAuRowIdBasePriceForwardAuction(id: number) {
  const result = await getDb().execute(sql`
    SELECT DISTINCT MAX(line_item_base_price) AS value
    FROM dbo.au_auction_supp_event_response_row
    WHERE au_row_id = ${id}
      AND line_item_base_price IN (
        SELECT MAX(line_item_base_price)
        FROM dbo.au_auction_supp_event_response_row
        WHERE line_item_base_price <> 0
        GROUP BY au_row_id
      )
  `);

  return result.rows?.[0]?.value ?? null;
}

export async function findSuppRespRow(auctionId: number) {
  // Use DISTINCT ON to return only the latest row per supplier per auction template row.
  // Multiple response events can exist per supplier (legacy data or retry paths); without
  // this dedup, partialBasedResp would rank and update stale rows from old submissions,
  // causing old bid-summary entries to show the rank of the most recent submission.
  const result = await getDb().execute(sql`
    SELECT DISTINCT ON (e.supplier_id, r.au_row_id) r.*
    FROM dbo.au_auction_supp_event_response_row r
    JOIN dbo.au_auction_supp_event_response e
      ON e.id = r.au_supp_event_resp_id
    WHERE e.auction_id = ${auctionId}
    ORDER BY e.supplier_id, r.au_row_id, r.id DESC
  `);

  return result.rows;
}

export async function updatePartialRankById(id: number, rank: number) {
  const result = await getDb().execute(sql`
    UPDATE dbo.au_auction_supp_event_response_row
    SET supp_product_rank = ${rank}
    WHERE id = ${id}
  `);

  return result.rowCount ?? 0;
}


export async function findSuppRespRowByLeadPrice(
  leadingPrice: number,
  id: number
) {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_supp_event_response_row
    WHERE line_item_total = ${leadingPrice}
      AND au_row_id = ${id}
    ORDER BY creation_time DESC
    LIMIT 1
  `);

  return result.rows?.[0] ?? null;
}

export async function findRespRowByAuRowId(
  responseId: number,
  auctionRowIds: number[]
) {
  if (!auctionRowIds.length) return [];

  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_supp_event_response_row
    WHERE au_supp_event_resp_id = ${responseId}
      AND au_row_id NOT IN (${sql.join(auctionRowIds, sql`,`)})
  `);

  return result.rows;
}

