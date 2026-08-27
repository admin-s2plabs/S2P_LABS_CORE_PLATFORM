/**
 * Superadmin-only delete guard gated by DELETED_FUNCTION / DELETE_FUNCTION lookup.
 */
import type { Request, Response, NextFunction } from "express";
import { getContextPool } from "../../tenant-context";
import { pool } from "./index";
import { resolveRequestUser, type SessionUser } from "./auth";
import { getUserRoleNames } from "../common/common.repository";

const getPool = () => getContextPool() ?? pool;

const LOOKUP_PROPERTY_KEYS = ["DELETED_FUNCTION", "DELETE_FUNCTION"];
const ENABLED_VALUES = new Set(["Y", "YES", "TRUE", "1", "ENABLED", "ON"]);

/** Paths that keep existing delete behaviour (self-service / meta). */
const DELETE_GUARD_EXCLUDED_PREFIXES = [
  "/api/profile/",
  "/api/agent-conversations",
  "/api/vendor/",
  "/api/org-details/logo",
  "/api/lookups/",
  "/api/settings/delete-function-enabled",
  "/api/ai-model-config/",
];

let deleteFunctionCache: { enabled: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function isPathExcluded(path: string): boolean {
  return DELETE_GUARD_EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isTruthyLookupValue(raw: unknown): boolean {
  if (raw == null) return false;
  return ENABLED_VALUES.has(String(raw).trim().toUpperCase());
}

export function isSuperadminUser(user: SessionUser | null, roleNames?: string[]): boolean {
  if (!user) return false;
  const fromJwt = Array.isArray(user.roles) ? user.roles : [];
  const primary = user.userRole ? [user.userRole] : [];
  const roles = roleNames ?? [...fromJwt, ...primary];
  return roles.some((r) => r === "ROLE_SUPERADMIN" || r === "SUPERADMIN");
}

export async function isDeleteFunctionEnabled(): Promise<boolean> {
  const now = Date.now();
  if (deleteFunctionCache && deleteFunctionCache.expiresAt > now) {
    return deleteFunctionCache.enabled;
  }

  const result = await getPool().query(
    `SELECT key_2 AS lookup_key, value AS lookup_value, description
     FROM dbo.am_lookup_params_dtls
     WHERE UPPER(TRIM(key_1)) = ANY($1::text[])
       AND status = 'Y'`,
    [LOOKUP_PROPERTY_KEYS.map((k) => k.toUpperCase())],
  );

  let enabled = false;
  for (const row of result.rows) {
    if (
      isTruthyLookupValue(row.lookup_value) ||
      isTruthyLookupValue(row.lookup_key) ||
      isTruthyLookupValue(row.description)
    ) {
      enabled = true;
      break;
    }
  }

  deleteFunctionCache = { enabled, expiresAt: now + CACHE_TTL_MS };
  return enabled;
}

export function clearDeleteFunctionCache(): void {
  deleteFunctionCache = null;
}

export async function assertSuperadminDelete(req: Request): Promise<void> {
  const user = resolveRequestUser(req);
  if (!user) {
    throw { status: 401, message: "Not authenticated" };
  }

  const roleNames = await getUserRoleNames(user.id);
  if (!isSuperadminUser(user, roleNames)) {
    throw {
      status: 403,
      message: "Only super administrators can delete records",
    };
  }

  const enabled = await isDeleteFunctionEnabled();
  if (!enabled) {
    throw {
      status: 403,
      message:
        "Delete function is disabled. Enable DELETED_FUNCTION in Administration → Lookups.",
    };
  }
}

export async function guardDeleteRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.method !== "DELETE") {
    return next();
  }

  const path = req.path || req.url?.split("?")[0] || "";
  if (isPathExcluded(path)) {
    return next();
  }

  try {
    await assertSuperadminDelete(req);
    next();
  } catch (error: any) {
    res.status(error?.status || 403).json({
      error: error?.message || "Delete not permitted",
    });
  }
}

export function requireSuperadminDelete(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  assertSuperadminDelete(req)
    .then(() => next())
    .catch((error: any) => {
      res.status(error?.status || 403).json({
        error: error?.message || "Delete not permitted",
      });
    });
}
