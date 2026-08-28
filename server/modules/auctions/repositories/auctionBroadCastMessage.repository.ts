import { db } from "../../../db";
import { getContextDb } from "../../../tenant-context";
const getDb = () => getContextDb() ?? db;
import { sql } from "drizzle-orm";
import { AuAuctionBroadCastMessage } from "@shared/schema";

export async function getByAuctionId(auctionId: number): Promise<AuAuctionBroadCastMessage[]> {
  try {
    const result = await getDb().execute(sql`
      SELECT *
      FROM dbo.au_auction_broadcast_message
      WHERE auction_id = ${auctionId}
      ORDER BY creation_time DESC
    `);
    return result.rows as AuAuctionBroadCastMessage[];
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (
      err?.code === "42P01" ||
      /does not exist/i.test(String(err?.message ?? ""))
    ) {
      console.warn(
        "[auctionBroadCastMessage] dbo.au_auction_broadcast_message missing; return []. Apply server/db/migrations/20250329_au_auction_broadcast_message.sql or restart server (auto-create)."
      );
      return [];
    }
    throw e;
  }
}