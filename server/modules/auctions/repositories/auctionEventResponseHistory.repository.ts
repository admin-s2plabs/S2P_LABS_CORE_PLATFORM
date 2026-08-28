import { db } from "../../../db";
import { getContextDb } from "../../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { eq, and, desc, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { auctionSuppResponseEventHistory } from "@shared/schema";

export const auctionEventResponseHistoryRepo = {
  // 🔹 findByAuctionId
  async findByAuctionId(auctionId: number) {
    return await getDb()
      .select()
      .from(auctionSuppResponseEventHistory)
      .where(eq(auctionSuppResponseEventHistory.auctionId, auctionId));
  },

  // 🔹 findBySupplierId
  async findBySupplierId(supplierId: number) {
    return await getDb()
      .select()
      .from(auctionSuppResponseEventHistory)
      .where(eq(auctionSuppResponseEventHistory.supplierId, supplierId));
  },

  // 🔹 findByAuctionIdSupplierId (latest by LAST_MODIFICATION_TIME)
  async findByAuctionIdSupplierId(auctionId: number, supplierId: number) {
    const result = await getDb()
      .select({ id: auctionSuppResponseEventHistory.id })
      .from(auctionSuppResponseEventHistory)
      .where(
        and(
          eq(auctionSuppResponseEventHistory.auctionId, auctionId),
          eq(auctionSuppResponseEventHistory.supplierId, supplierId)
        )
      )
      .orderBy(desc(auctionSuppResponseEventHistory.lastModificationTime))
      .limit(1);

    return result[0]?.id ?? null;
  },

  // 🔹 findByAuctionIdSupplierIdValue (status != Deleted)
  async findByAuctionIdSupplierIdValue(
    auctionId: number,
    supplierId: number
  ) {
    const result = await getDb()
      .select({ id: auctionSuppResponseEventHistory.id })
      .from(auctionSuppResponseEventHistory)
      .where(
        and(
          eq(auctionSuppResponseEventHistory.auctionId, auctionId),
          eq(auctionSuppResponseEventHistory.supplierId, supplierId),
          ne(auctionSuppResponseEventHistory.status, "Deleted")
        )
      )
      .orderBy(desc(auctionSuppResponseEventHistory.id))
      .limit(1);

    return result[0]?.id ?? null;
  },

  // 🔹 findByAuctionIdSupplierIds
  async findByAuctionIdSupplierIds(
    auctionId: number,
    supplierId: number
  ) {
    return await getDb()
      .select()
      .from(auctionSuppResponseEventHistory)
      .where(
        and(
          eq(auctionSuppResponseEventHistory.auctionId, auctionId),
          eq(auctionSuppResponseEventHistory.supplierId, supplierId),
          ne(auctionSuppResponseEventHistory.status, "Deleted")
        )
      )
      .orderBy(desc(auctionSuppResponseEventHistory.id));
  },

  // 🔹 getAllSuppliersByAuctionId
  async getAllSuppliersByAuctionId(
    auctionId: number,
    supplierId: number
  ) {
    return await getDb()
      .select()
      .from(auctionSuppResponseEventHistory)
      .where(
        and(
          eq(auctionSuppResponseEventHistory.auctionId, auctionId),
          eq(auctionSuppResponseEventHistory.supplierId, supplierId)
        )
      )
      .orderBy(desc(auctionSuppResponseEventHistory.id));
  },

  // 🔹 getSuppliersStatusByAuction
  async getSuppliersStatusByAuction(
    auctionId: number,
    supplierId: number
  ) {
    const result = await getDb()
      .select()
      .from(auctionSuppResponseEventHistory)
      .where(
        and(
          eq(auctionSuppResponseEventHistory.auctionId, auctionId),
          eq(auctionSuppResponseEventHistory.supplierId, supplierId)
        )
      )
      .orderBy(desc(auctionSuppResponseEventHistory.id))
      .limit(1);

    return result[0] ?? null;
  },

  // 🔹 getSuppliersAmount
  async getSuppliersAmount(auctionId: number, supplierId: number) {
    const result = await getDb()
      .select({
        auctionTotal: auctionSuppResponseEventHistory.auctionTotal,
      })
      .from(auctionSuppResponseEventHistory)
      .where(
        and(
          eq(auctionSuppResponseEventHistory.auctionId, auctionId),
          eq(auctionSuppResponseEventHistory.supplierId, supplierId),
          ne(auctionSuppResponseEventHistory.status, "Deleted")
        )
      )
      .orderBy(desc(auctionSuppResponseEventHistory.id))
      .limit(1);

    return result[0]?.auctionTotal ?? null;
  },

  // 🔹 getLatestRecordDetails
  async getLatestRecordDetails(
    auctionId: number,
    supplierId: number
  ) {
    return await getDb()
      .select()
      .from(auctionSuppResponseEventHistory)
      .where(
        and(
          eq(auctionSuppResponseEventHistory.auctionId, auctionId),
          eq(auctionSuppResponseEventHistory.supplierId, supplierId),
          ne(auctionSuppResponseEventHistory.status, "Deleted")
        )
      )
      .orderBy(desc(auctionSuppResponseEventHistory.id))
      .limit(1);
  },

  // 🔹 getLatestRecordDetailsStatus
  async getLatestRecordDetailsStatus(
    auctionId: number,
    supplierId: number
  ) {
    const result = await getDb()
      .select()
      .from(auctionSuppResponseEventHistory)
      .where(
        and(
          eq(auctionSuppResponseEventHistory.auctionId, auctionId),
          eq(auctionSuppResponseEventHistory.supplierId, supplierId)
        )
      )
      .orderBy(desc(auctionSuppResponseEventHistory.id))
      .limit(1);

    return result[0] ?? null;
  },

 async updateAuctionEventResponseHistory(
  auctionId: number,
  supplierId: number,
  id: number
): Promise<string> {
  await getDb().execute(sql`
    UPDATE dbo.au_auction_supp_event_response_history
    SET status = 'Deleted'
    WHERE auction_id = ${auctionId}
      AND supplier_id = ${supplierId}
      AND id = ${id}
  `);

  return "Success";
},

// 🔹 Equivalent of: updateSupplierDeleteBidRequest
 async  updateSupplierDeleteBidRequest(
  auctionId: number,
  supplierId: number,
  id: number
): Promise<string> {
  await getDb().execute(sql`
    UPDATE dbo.au_auction_supp_event_response_history
    SET attribute9 = 'Y'
    WHERE auction_id = ${auctionId}
      AND supplier_id = ${supplierId}
      AND id = ${id}
  `);

  return "SuccessBitDeleteRequest";
}
};