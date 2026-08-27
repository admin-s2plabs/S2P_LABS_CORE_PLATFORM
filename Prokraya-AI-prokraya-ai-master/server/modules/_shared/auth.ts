/**
 * Shared authentication middleware.
 *
 * Supports two authentication mechanisms that can be used simultaneously:
 *   1. Session cookies (express-session) — existing browser clients
 *   2. JWT Bearer tokens  (Authorization: Bearer <token>) — API / mobile clients
 *
 * The `requireAuth` middleware accepts either credential form.  Downstream
 * handlers always read `req.user` which is normalised to SessionUser regardless
 * of which mechanism was used.
 *
 * RBAC helpers (`requirePermission`, `requireRole`) are re-exported from the
 * RBAC module so callers only need one import.
 */
import type { Request, Response, NextFunction } from "express";
import {
  extractBearerToken,
  verifyAccessToken,
  type AccessTokenClaims,
} from "../auth/jwt";
import { isJtiRevoked } from "../auth/token-store";
import {
  getPermissionsForRole,
  requirePermission,
  requireRole,
  requireTenant,
  requireSameTenant,
} from "../auth/rbac";

// ─── SessionUser ──────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  userName: string;
  userRole: string;
  roleDisplayName: string;
  userType: number;
  orgId: string;
  suppOrgId: string;
  orgIds?: string;
  supplierId?: string;
  department?: string;
  domain?: string;
  /** Present only when authenticated via JWT Bearer token */
  roles?: string[];
  /** Present only when authenticated via JWT Bearer token */
  permissions?: string[];
  /** JWT token ID — present only for Bearer-auth requests */
  jti?: string;
}

// ─── JWT → SessionUser adapter ────────────────────────────────────────────────

function jwtClaimsToSessionUser(claims: AccessTokenClaims): SessionUser {
  const orgIds = claims.orgIds || claims.orgId || "";
  return {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    userName: claims.email,
    userRole: claims.role,
    roleDisplayName: claims.roleDisplayName ?? claims.role,
    userType: claims.userType,
    orgId: claims.orgId,
    orgIds,
    supplierId: claims.supplierId ?? "",
    department: claims.department ?? undefined,
    suppOrgId: claims.suppOrgId ?? "",
    domain: claims.tenant ?? undefined,
    roles: claims.roles,
    permissions:
      Array.isArray(claims.permissions) && claims.permissions.length > 0
        ? claims.permissions
        : getPermissionsForRole(claims.role),
    jti: claims.jti,
  };
}

/** Normalize session/Bearer user for services that expect login session field names. */
export function normalizeSessionUser(user: SessionUser | null): SessionUser | null {
  if (!user) return null;
  const orgIds = user.orgIds || user.orgId || "";
  return {
    ...user,
    orgIds,
    supplierId: user.supplierId ?? "",
    department: user.department,
  };
}

/** Authenticated user from Bearer token or session cookie. */
export function resolveRequestUser(req: Request): SessionUser | null {
  return normalizeSessionUser(getSessionUser(req));
}

// ─── Core helper ──────────────────────────────────────────────────────────────

/**
 * Returns the authenticated user from the request, trying JWT Bearer first
 * then falling back to the session.  Returns null if neither is present or valid.
 *
 * This function is synchronous for the session path and async for the JWT path.
 * Use `getAuthUser` in middleware; use `req.user` in downstream handlers
 * (populated by `populateUserFromBearer`).
 */
export function getSessionUser(req: Request): SessionUser | null {
  return (req as any).user ?? null;
}

// ─── Bearer-token population middleware ───────────────────────────────────────

/**
 * Call this once in the middleware chain (after session middleware, before routes).
 * If a valid Bearer token is present it sets `req.user` from its claims.
 * If the session already populated `req.user` this is a no-op so the two
 * mechanisms are safely composable.
 */
export async function populateUserFromBearer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  console.log("Populating user from Bearer token");

  const raw = extractBearerToken(req.headers.authorization);
  const isApiRoute = req.path.includes("/api/");

  if (isApiRoute && !raw) {
    res.status(401).json({ error: "Bearer token required" });
    return;
  }

  try {
    const claims = await verifyAccessToken(raw as string);
    if (isJtiRevoked(claims.jti)) {
      res.status(401).json({ error: "Token revoked" });
      return;
    }
    (req as any).user = jwtClaimsToSessionUser(claims);
  } catch {
    if (isApiRoute) {
      res.status(401).json({ error: "Invalid or expired bearer token" });
      return;
    }
    return next();
  }

  next();
}

// ─── Authentication guards ────────────────────────────────────────────────────

/**
 * Require the user to be authenticated via either session or Bearer token.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

/**
 * Require userType === 0 (internal staff).
 *
 * Matches dbo.um_user_dtls.user_type as actually populated at login
 * (see CommonService.buildLoginResult: `isVendor = user.user_type === 1`,
 * and user-management.repository.ts's staff queries: `WHERE user_type = 0`).
 * userType is passed through unchanged into both the session and JWT claims,
 * so this check applies identically to either auth mechanism.
 */
export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (user.userType !== 0) {
    res.status(403).json({ error: "Staff access required" });
    return;
  }
  next();
}

/**
 * Require userType === 1 (vendor / supplier). See requireStaff for the source of truth.
 */
export function requireVendor(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (user.userType !== 1) {
    res.status(403).json({ error: "Vendor access required" });
    return;
  }
  next();
}

// ─── RBAC re-exports ─────────────────────────────────────────────────────────

export { requirePermission, requireRole, requireTenant, requireSameTenant };
export { PERMISSIONS, ROLE_PERMISSIONS, getPermissionsForRole } from "../auth/rbac";
export type { Permission } from "../auth/rbac";
