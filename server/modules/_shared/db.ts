import type { Request } from "express";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type pkg from "pg";
import type { AppSchema } from "../../db";

export { pool, db } from "../../db";
import { pool as masterPool, db as masterDb } from "../../db";

export function getTenantDb(req: Request): NodePgDatabase<AppSchema> {
  return (req as any).tenantDb || masterDb;
}

export function getTenantPool(req: Request): pkg.Pool {
  return (req as any).tenantPool || masterPool;
}

export function getTenantDomain(req: Request): string | null {
  return (req as any).tenantDomain || null;
}

export function isTenantRequest(req: Request): boolean {
  return !!(req as any).tenantDb;
}
