import { AsyncLocalStorage } from "async_hooks";
import type pkg from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AppSchema } from "./db";
import type { Request, Response, NextFunction } from "express";

interface TenantContext {
  pool: pkg.Pool;
  db: NodePgDatabase<AppSchema>;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getContextPool(): pkg.Pool | null {
  return tenantStorage.getStore()?.pool ?? null;
}

export function getContextDb(): NodePgDatabase<AppSchema> | null {
  return tenantStorage.getStore()?.db ?? null;
}

/**
 * Middleware that re-establishes the tenant AsyncLocalStorage context from
 * req.tenantPool/req.tenantDb. Use this after multer middleware on routes that
 * handle multipart/form-data uploads in subdomain (multi-tenant) contexts —
 * multer's EventEmitter-based stream processing can break the AsyncLocalStorage
 * chain, causing getContextPool() to fall back to the master pool.
 */
export function rewrapTenantContext(req: Request, _res: Response, next: NextFunction): void {
  const pool = (req as any).tenantPool as pkg.Pool | undefined;
  const db = (req as any).tenantDb as NodePgDatabase<AppSchema> | undefined;
  if (pool && db) {
    tenantStorage.run({ pool, db }, next);
  } else {
    next();
  }
}
