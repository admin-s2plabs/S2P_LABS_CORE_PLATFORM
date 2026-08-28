import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as baseSchema from "@shared/schema";
import * as auctionRelations from "./modules/auctions/schema/auctionRelations";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

/** Tables from `@shared/schema` plus auction Drizzle relations (avoids circular import). */
export const schema = { ...baseSchema, ...auctionRelations };

export type AppSchema = typeof schema;

/** @deprecated Use `schema`; kept for callers that imported the old merge name. */
export const combinedSchema = schema;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });
