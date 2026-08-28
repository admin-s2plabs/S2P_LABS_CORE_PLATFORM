import { db } from "../../../db";
import { getContextDb } from "../../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { eq, and, sql } from "drizzle-orm";
import {
  auctionSuppResponseEvent,
  auctionEventSuppMapping,
  AuAuctionSuppResponseEvent,
} from "@shared/schema";


export const findByAuctionId = async (auctionId: number) => {
  return await getDb()
    .select()
    .from(auctionSuppResponseEvent)
    .where(eq(auctionSuppResponseEvent.auctionId, auctionId));
};

export const findById = async (id: number) => {
  if (!Number.isFinite(id) || id <= 0) {
    return [];
  }
  return await getDb()
    .select()
    .from(auctionSuppResponseEvent)
    .where(eq(auctionSuppResponseEvent.id, id));
};

function resolvePersistedId(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Drizzle may send SQL NULL for `undefined`; strip those so NOT NULL + no DEFAULT columns do not break. */
function omitUndefinedKeys<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Drizzle `timestamp` mode="date" serializes with `value.toISOString()`; JSON APIs send ISO strings. */
const SUPP_RESP_EVENT_TS_KEYS = [
  "startTime",
  "endTime",
  "deliveryDate",
  "bidTime",
  "creationTime",
  "lastModificationTime",
] as const;

function coerceToDate(v: unknown): Date | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? undefined : v;
  }
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function coerceSuppResponseEventTimestamps(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  for (const k of SUPP_RESP_EVENT_TS_KEYS) {
    if (!(k in next) || next[k] == null) continue;
    if (next[k] instanceof Date) continue;
    const d = coerceToDate(next[k]);
    if (d !== undefined) next[k] = d;
    else delete next[k];
  }
  return next;
}

/**
 * Same table / sequence naming as auctions_database_updates.sql (dbo schema).
 * Used on INSERT when the DB column has no DEFAULT yet.
 */
const SUPP_RESPONSE_ID_SEQ = sql`nextval('dbo.au_auction_supp_event_response_id_seq'::regclass)`;

/** Columns only — never pass nested relations or explicit null `id` (breaks legacy tables without SERIAL). */
export const save = async (data: any) => {
  const {
    templateResponseRows: _rows,
    auctionSuppRespAttachment: _att,
    columnResponseValues: _cols,
    ...row
  } = data ?? {};

  const rowNorm = coerceSuppResponseEventTimestamps(row as Record<string, unknown>);
  const id = resolvePersistedId(rowNorm.id);

  if (id == null) {
    const { id: _drop, ...insertRow } = rowNorm;
    const payload = omitUndefinedKeys(insertRow as Record<string, unknown>);
    delete payload.id;

    await getDb().execute(
      sql`CREATE SEQUENCE IF NOT EXISTS dbo.au_auction_supp_event_response_id_seq`
    );

    const [inserted] = await getDb()
      .insert(auctionSuppResponseEvent)
      .values({
        ...payload,
        id: SUPP_RESPONSE_ID_SEQ,
      } as unknown as typeof auctionSuppResponseEvent.$inferInsert)
      .returning();

    return inserted;
  }

  const { id: _idField, ...updateData } = rowNorm;

  const [updated] = await getDb()
    .update(auctionSuppResponseEvent)
    .set(updateData)
    .where(eq(auctionSuppResponseEvent.id, id))
    .returning();

  return updated;
};

export const findBySupplierId = async (supplierId: number) => {
  return await getDb()
    .select()
    .from(auctionSuppResponseEvent)
    .where(eq(auctionSuppResponseEvent.supplierId, supplierId));
};

export const findByAuctionIdAndSupplierId = async (
  auctionId: number,
  supplierId: number
) => {
  const result = await getDb()
    .select()
    .from(auctionSuppResponseEvent)
    .where(
      and(
        eq(auctionSuppResponseEvent.auctionId, auctionId),
        eq(auctionSuppResponseEvent.supplierId, supplierId)
      )
    );

  return result[0] || null;
};

export const updateRankById = async (id: number, rank: number) => {
  return await getDb()
    .update(auctionSuppResponseEvent)
    .set({ suppRank: rank })
    .where(eq(auctionSuppResponseEvent.id, id));
};

export const findByAuctionSuppId = async (
  auctionId: number,
  supplierId: number
) => {
  return await getDb()
    .select()
    .from(auctionSuppResponseEvent)
    .where(
      and(
        eq(auctionSuppResponseEvent.auctionId, auctionId),
        eq(auctionSuppResponseEvent.supplierId, supplierId)
      )
    );
};


export const updateSupplierAuctionSeenStatus = async (
  userName: string,
  seenDateTime: Date,
  auctionId: number,
  suppId: number,
  seen: boolean
) => {
  return await getDb()
    .update(auctionEventSuppMapping)
    .set({
      seenBy: userName,
      seenDateTime,
      seen,
    })
    .where(
      and(
        eq(auctionEventSuppMapping.eventId, auctionId),
        eq(auctionEventSuppMapping.suppId, suppId)
      )
    );
};

export const findLotLeadingPrice = async (auctionId: number) => {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_supp_event_response
    WHERE auction_id = ${auctionId}
      AND (status IS NULL OR status NOT LIKE 'Deleted')
      AND auction_total > 0
    ORDER BY auction_total ASC
    LIMIT 1
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...row, auctionTotal: row.auction_total };
};

export const findLotLeadingPriceForwardAuction = async (
  auctionId: number
) => {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_supp_event_response
    WHERE auction_id = ${auctionId}
      AND (status IS NULL OR status NOT LIKE 'Deleted')
      AND auction_total > 0
    ORDER BY auction_total DESC
    LIMIT 1
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...row, auctionTotal: row.auction_total };
};

export const findLotLeadingPriceForwardAuctionList = async (
  auctionId: number
) => {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_supp_event_response
    WHERE auction_id = ${auctionId}
      AND (status IS NULL OR status NOT LIKE 'Deleted')
      AND auction_total > 0
    ORDER BY auction_total DESC
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    ...row,
    auctionTotal: row.auction_total,
  }));
};

export const updateAmountStatus = async (
  auctionTotal: string, // numeric in postgres → string in drizzle
  auctionId: number,
  supplierId: number
) => {
  return await getDb()
    .update(auctionSuppResponseEvent)
    .set({
      auctionTotal,
      status: "Submitted",
    })
    .where(
      and(
        eq(auctionSuppResponseEvent.auctionId, auctionId),
        eq(auctionSuppResponseEvent.supplierId, supplierId)
      )
    );
};

