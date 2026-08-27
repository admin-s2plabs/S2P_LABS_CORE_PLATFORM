import { db } from "../../../db";
import { getContextDb } from "../../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { sql, eq } from "drizzle-orm";
import { auctionSuppAwardEvent, AuctionSuppAwardEvent } from "@shared/schema";

export const auctionEventAwardRepo = {
  // 🔥 1. findByAuctionsId (status != Cancelled)
  async findByAuctionsId(auctionId: number) {
    const result = await getDb().execute(sql`
      SELECT *
      FROM dbo.au_auction_supp_award_event
      WHERE auction_id = ${auctionId}
        AND status <> 'Cancelled'
    `);

    return result.rows?.length ? result.rows : null;
  },

  // 🔥 2. findByAuctionId (simple finder)
  async findByAuctionId(auctionId: number) {
    const result = await getDb().execute(sql`
      SELECT *
      FROM dbo.au_auction_supp_award_event
      WHERE auction_id = ${auctionId}
    `);

    return result.rows;
  },

  // 🔥 3. getCount
  async getCount(auctionId: number, status: string) {
    const result = await getDb().execute(sql`
      SELECT COUNT(*)::int AS count
      FROM dbo.au_auction_supp_award_event
      WHERE auction_id = ${auctionId}
        AND status = ${status}
    `);

    return result.rows?.[0]?.count ?? 0;
  },

  // 🔥 (Optional but useful) findById
  async findById(id: number) {
    const result = await getDb().execute(sql`
      SELECT *
      FROM dbo.au_auction_supp_award_event
      WHERE id = ${id}
      LIMIT 1
    `);

    return result.rows?.[0] ?? null;
  },

  // 🔥 (Optional) save (insert/update like JPA save)
  async save(data: any) {
    const auctionId = data?.auctionId ?? data?.auction_id ?? null;
    const supplierId = data?.supplierId ?? data?.supplier_id ?? null;
    const status = data?.status ?? null;
    const createdBy = data?.createdBy ?? data?.created_by ?? null;
    const creationTime = data?.creationTime ?? data?.creation_time ?? null;
    const lastModifiedBy = data?.lastModifiedBy ?? data?.last_modified_by ?? null;
    const lastModificationTime =
      data?.lastModificationTime ?? data?.last_modification_time ?? null;

    if (!data?.id) {
      const result = await getDb().execute(sql`
        INSERT INTO dbo.au_auction_supp_award_event (
          auction_id,
          supplier_id,
          status,
          created_by,
          creation_time
        )
        VALUES (
          ${auctionId},
          ${supplierId},
          ${status},
          ${createdBy},
          ${creationTime}
        )
        RETURNING *
      `);

      return result.rows[0];
    } else {
      const result = await getDb().execute(sql`
        UPDATE dbo.au_auction_supp_award_event
        SET
          auction_id = ${auctionId},
          supplier_id = ${supplierId},
          status = ${status},
          last_modified_by = ${lastModifiedBy},
          last_modification_time = ${lastModificationTime}
        WHERE id = ${data.id}
        RETURNING *
      `);

      return result.rows[0];
    }
  },
  async update(id: number, data: Partial<AuctionSuppAwardEvent>) {
    const result = await getDb()
      .update(auctionSuppAwardEvent)
      .set(data)
      .where(eq(auctionSuppAwardEvent.id, id))
      .returning();

    return result[0];
  },
};