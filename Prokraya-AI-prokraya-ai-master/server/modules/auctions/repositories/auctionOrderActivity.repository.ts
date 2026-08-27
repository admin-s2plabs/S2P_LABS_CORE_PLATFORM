import { db } from "../../../db";
import { getContextDb } from "../../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { AuAuctionOrderActivity, auAuctionOrderActivity } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function saveAuctionOrderActivity(data: any) {

  const result = await getDb()
    .insert(auAuctionOrderActivity)
    .values(data)
    .returning();

  return result[0];
}

export async function getOrderActivityByAuctionId(auctionId: number): Promise<AuAuctionOrderActivity[]> {
  const result = await getDb().execute(sql`
    SELECT *
    FROM dbo.au_auction_order_activity
    WHERE auction_id = ${auctionId}
    ORDER BY creation_time DESC
  `);
  return (result.rows as AuAuctionOrderActivity[]) ?? [];
}
