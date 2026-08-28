import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { schema, pool as masterPool, type AppSchema } from "./db";

const tenantPools: Map<string, pkg.Pool> = new Map();
const tenantDbInstances: Map<string, NodePgDatabase<AppSchema>> = new Map();

const domainToDbName: Map<string, string> = new Map();

function buildTenantConnectionString(dbName: string): string {
  const masterUrl = process.env.DATABASE_URL!;
  const url = new URL(masterUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function lookupTenantDbName(domain: string): Promise<string | null> {
  if (domainToDbName.has(domain)) {
    return domainToDbName.get(domain)!;
  }

  try {
    const result = await masterPool.query(
      `SELECT db_name FROM dbo.am_tenant_mst WHERE domain_name = $1 LIMIT 1`,
      [domain]
    );
    if (result.rows.length > 0 && result.rows[0].db_name) {
      const dbName = result.rows[0].db_name;
      domainToDbName.set(domain, dbName);
      return dbName;
    }
    return null;
  } catch (error) {
    console.error(`[TenantDB] Failed to lookup db for domain "${domain}":`, error);
    return null;
  }
}

function getOrCreateTenantPool(dbName: string): pkg.Pool {
  if (tenantPools.has(dbName)) {
    return tenantPools.get(dbName)!;
  }

  const connectionString = buildTenantConnectionString(dbName);
  const tenantPool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 300000,
    statement_timeout: 30000, 
    idle_in_transaction_session_timeout: 60000,
 
  });

  tenantPool.on("error", (err) => {
    console.error(`[TenantDB] Pool error for "${dbName}":`, err);
  });

  tenantPools.set(dbName, tenantPool);
  return tenantPool;
}

function getOrCreateTenantDb(dbName: string): NodePgDatabase<AppSchema> {
  if (tenantDbInstances.has(dbName)) {
    return tenantDbInstances.get(dbName)!;
  }

  const pool = getOrCreateTenantPool(dbName);
  const tenantDb = drizzle(pool, { schema });
  tenantDbInstances.set(dbName, tenantDb);
  return tenantDb;
}

export async function resolveTenantDb(domain: string): Promise<{
  db: NodePgDatabase<AppSchema>;
  pool: pkg.Pool;
  dbName: string;
} | null> {
  const dbName = await lookupTenantDbName(domain);
  if (!dbName) return null;

  const pool = getOrCreateTenantPool(dbName);
  const db = getOrCreateTenantDb(dbName);
  return { db, pool, dbName };
}

/**
 * Extracts the tenant subdomain strictly from the hostname — no session/body/query fallbacks.
 * Used for security checks (e.g. session domain validation) where the actual URL must be
 * the source of truth and cannot be influenced by request data.
 */
export function extractSubdomainFromHostname(req: any): string | null {
  const hostname = req.hostname || req.headers?.host?.split(":")[0] || "";

  if (hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname === "prokraya.ai" || hostname === "www.prokraya.ai" ||
      hostname === "prokraya" || hostname === "prokrayaai" ||
      hostname.endsWith(".replit.dev") || hostname.endsWith(".replit.app")) {
    return null;
  }

  const parts = hostname.split(".");
  if (parts.length > 2 && parts[0] !== "www") {
    return parts[0];
  }
  if (parts.length === 2 && (parts[1] === "localhost" || parts[1] === "local" || parts[1] === "prokraya" || parts[1] === "prokrayaai")) {
    return parts[0];
  }

  return null;
}

export function extractDomainFromRequest(req: any): string | null {
  const hostname = req.hostname || req.headers?.host?.split(":")[0] || "";

  if (hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname === "prokraya.ai" || hostname === "www.prokraya.ai" ||
      hostname === "prokraya" || hostname === "prokrayaai" ||
      hostname.endsWith(".replit.dev") || hostname.endsWith(".replit.app")) {
    return req.session?.user?.domain
      || req.body?.domain
      || req.query?.domain
      || null;
  }

  const parts = hostname.split(".");
  if (parts.length > 2 && parts[0] !== "www") {
    return parts[0];
  }
  // Support tenant.localhost, tenant.prokraya, etc.
  if (parts.length === 2 && (parts[1] === "localhost" || parts[1] === "local" || parts[1] === "prokraya" || parts[1] === "prokrayaai")) {
    return parts[0];
  }

  return req.session?.user?.domain
    || req.body?.domain
    || req.query?.domain
    || null;
}

export function clearTenantCache(domain?: string) {
  if (domain) {
    domainToDbName.delete(domain);
  } else {
    domainToDbName.clear();
  }
}

export async function closeTenantPools() {
  for (const [name, pool] of tenantPools) {
    try {
      await pool.end();
    } catch (err) {
      console.error(`[TenantDB] Error closing pool for "${name}":`, err);
    }
  }
  tenantPools.clear();
  tenantDbInstances.clear();
  domainToDbName.clear();
}
