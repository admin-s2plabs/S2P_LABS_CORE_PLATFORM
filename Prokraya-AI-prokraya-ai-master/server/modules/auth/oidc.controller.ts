/**
 * OIDC / OAuth2 endpoints
 *
 * Endpoints:
 *   GET  /.well-known/openid-configuration   Discovery document
 *   GET  /api/auth/jwks                      JSON Web Key Set
 *   POST /api/auth/token                     Token endpoint (password + refresh_token grants)
 *   GET  /api/auth/userinfo                  UserInfo endpoint (Bearer required)
 *   POST /api/auth/revoke                    Token revocation (RFC 7009)
 *   POST /api/auth/logout                    Session + token teardown
 *   GET  /api/auth/me                        Convenience: current user info from token OR session
 */
import { Router, type Request, type Response } from "express";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractBearerToken,
  getJwks,
  ACCESS_TOKEN_TTL_SECS,
  REFRESH_TOKEN_TTL_SECS,
  TOKEN_ISSUER,
  TOKEN_AUDIENCE,
} from "./jwt";
import {
  storeRefreshToken,
  getRefreshEntry,
  deleteRefreshToken,
  revokeJti,
  isJtiRevoked,
} from "./token-store";
import { getPermissionsForRole, mergePermissions } from "./rbac";
import { saveDraftBackup } from "../vendor-registration/vendor-registration.repository";
import { buildAccessTokenClaims } from "./auth-context";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBaseUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

/**
 * Resolve the tenant pool for a request that may include a `domain` body param
 * or rely on the subdomain already detected by tenant middleware.
 */
async function resolveTenantPoolForRequest(
  req: Request,
  domain: string | null
): Promise<import("pg").Pool | null> {
  const existing = (req as any).tenantPool as import("pg").Pool | undefined;
  if (existing) return existing;
  if (!domain) return null;

  const { resolveTenantDb } = await import("../../tenant-db");
  const ctx = await resolveTenantDb(domain);
  if (!ctx) return null;

  (req as any).tenantPool = ctx.pool;
  (req as any).tenantDb = ctx.db;
  (req as any).tenantDomain = domain;
  return ctx.pool;
}

/** @deprecated Use buildAccessTokenClaims from auth-context */
const buildTokenClaims = buildAccessTokenClaims;

export async function createOAuthTokensForUser(
  userRow: Record<string, any>,
  domain: string | null,
  tenantPool: import("pg").Pool | null
) {
  const claims = await buildAccessTokenClaims(userRow, domain, tenantPool);
  const accessToken = await signAccessToken(claims);
  const { token: refreshToken, jti: refreshJti } = await signRefreshToken(
    claims.sub,
    domain
  );
  storeRefreshToken(refreshJti, claims.sub, domain, REFRESH_TOKEN_TTL_SECS);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_SECS,
    scope: "openid profile email offline_access",
  };
}

function applySessionUserFromLogin(
  req: Request,
  sessionData: Record<string, any>,
  domain: string | null
) {
  const user = {
    id: sessionData.id,
    email: sessionData.email,
    name: sessionData.name,
    userName: sessionData.userName,
    userRole: sessionData.userRole,
    roleDisplayName: sessionData.roleDisplayName,
    userType: sessionData.userType,
    orgId: sessionData.orgId,
    orgIds: sessionData.orgIds,
    supplierId: sessionData.supplierId,
    department: sessionData.department,
    suppOrgId: sessionData.suppOrgId,
    domain: domain ?? undefined,
  };
  (req as any).session.user = user;
  (req as any).user = user;
}

/** Issue OAuth2 access + refresh tokens (token-endpoint response shape). */
export async function issueOAuthTokenResponse(
  req: Request,
  res: Response,
  userRow: Record<string, any>,
  sessionData: Record<string, any>,
  domain: string | null,
  tenantPool: import("pg").Pool | null
) {
  const tokens = await createOAuthTokensForUser(userRow, domain, tenantPool);
  applySessionUserFromLogin(req, sessionData, domain);
  return res.json(tokens);
}

// ─── OIDC Discovery ───────────────────────────────────────────────────────────

router.get("/.well-known/openid-configuration", (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    issuer: TOKEN_ISSUER,
    authorization_endpoint: `${base}/api/auth/authorize`,
    token_endpoint: `${base}/api/auth/token`,
    userinfo_endpoint: `${base}/api/auth/userinfo`,
    jwks_uri: `${base}/api/auth/jwks`,
    revocation_endpoint: `${base}/api/auth/revoke`,
    end_session_endpoint: `${base}/api/auth/logout`,
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    response_types_supported: ["token"],
    grant_types_supported: ["password", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    claims_supported: [
      "sub", "iss", "aud", "exp", "iat", "jti",
      "email", "name", "role", "roles", "tenant",
      "userType", "orgId", "suppOrgId", "permissions",
    ],
  });
});

// ─── JWKS ─────────────────────────────────────────────────────────────────────

router.get("/api/auth/jwks", (_req, res) => {
  try {
    res.json(getJwks());
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
});

// ─── Token endpoint ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/token
 *
 * Supports:
 *   grant_type=password        — Resource Owner Password Credentials (ROPC)
 *   grant_type=refresh_token   — Refresh an expired access token
 *
 * Body (application/x-www-form-urlencoded  OR  application/json):
 *   grant_type    "password" | "refresh_token"
 *   username      (password grant) email or username
 *   password      (password grant)
 *   domain        optional tenant domain; falls back to subdomain from hostname
 *   scope         space-separated scopes (informational; not enforced yet)
 *   refresh_token (refresh_token grant)
 */
router.post("/api/auth/token", async (req, res) => {
  // Support both JSON and form-encoded bodies
  const body = req.body ?? {};
  const grantType: string = body.grant_type ?? "";

  if (grantType === "password") {
    return handlePasswordGrant(req, res, body);
  }
  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(req, res, body);
  }

  res.status(400).json({
    error: "unsupported_grant_type",
    error_description: `Supported grant types: password, refresh_token`,
  });
});

async function handlePasswordGrant(req: Request, res: Response, body: Record<string, any>) {
  const { username, password } = body;
  const domain: string | null =
    body.domain || (req as any).tenantDomain || null;

  if (!username || !password) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "username and password are required",
    });
  }

  const tenantPool = await resolveTenantPoolForRequest(req, domain);
  if (domain && !tenantPool) {
    return res.status(401).json({
      error: "invalid_grant",
      error_description: "Invalid domain or credentials",
    });
  }

  // Delegate credential verification to the existing CommonService which
  // handles account status, lockout, failed-attempt tracking, etc.
  const { CommonService } = await import("../common/common.service");
  const svc = new CommonService();
  const loginResult = await svc.loginUser(username, password, undefined, tenantPool ?? undefined);

  if ("error" in loginResult) {
    const status = (loginResult as any).status ?? 401;
    const code =
      status === 429 ? "account_locked" : "invalid_grant";
    return res.status(status).json({
      error: code,
      error_description: (loginResult as any).error,
    });
  }

  // loginResult.sessionData mirrors what the session would store
  const sd = (loginResult as any).sessionData as Record<string, any>;

  // Reload full user row to get the DB fields we need for claims
  const { findUserByUsername } = await import("../common/common.repository");
  const userRow = await findUserByUsername(username, tenantPool ?? undefined);

  return issueOAuthTokenResponse(req, res, userRow, sd, domain, tenantPool);
}

async function handleRefreshTokenGrant(req: Request, res: Response, body: Record<string, any>) {
  const { refresh_token: rawRefreshToken } = body;

  if (!rawRefreshToken) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "refresh_token is required",
    });
  }

  let refreshPayload: Awaited<ReturnType<typeof verifyRefreshToken>>;
  try {
    refreshPayload = await verifyRefreshToken(rawRefreshToken);
  } catch {
    return res.status(401).json({
      error: "invalid_grant",
      error_description: "Refresh token is invalid or expired",
    });
  }

  const { sub: userId, tenant: domain, jti: refreshJti } = refreshPayload;

  // Check it hasn't been consumed already
  const entry = getRefreshEntry(refreshJti);
  if (!entry) {
    return res.status(401).json({
      error: "invalid_grant",
      error_description: "Refresh token has been revoked or expired",
    });
  }

  // Rotate: consume old refresh token
  deleteRefreshToken(refreshJti);

  const tenantPool = await resolveTenantPoolForRequest(req, domain);

  // Reload user from DB to pick up any role/status changes
  const { findUserById } = await import("../common/common.repository");
  const userRow = await findUserById(userId, tenantPool ?? undefined);

  if (!userRow || String(userRow.user_status) !== "1") {
    return res.status(401).json({
      error: "invalid_grant",
      error_description: "User account is inactive",
    });
  }

  const claims = await buildAccessTokenClaims(userRow, domain, tenantPool);
  const accessToken = await signAccessToken(claims);
  const { token: newRefreshToken, jti: newRefreshJti } = await signRefreshToken(
    claims.sub,
    domain
  );
  storeRefreshToken(newRefreshJti, claims.sub, domain, REFRESH_TOKEN_TTL_SECS);

  return res.json({
    access_token: accessToken,
    refresh_token: newRefreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECS,
    scope: "openid profile email offline_access",
  });
}

export { buildAccessTokenClaims };

// ─── UserInfo endpoint ────────────────────────────────────────────────────────

/**
 * GET /api/auth/userinfo
 * Returns claims about the authenticated user.  Requires a valid Bearer token.
 */
router.get("/api/auth/userinfo", async (req, res) => {
  const raw = extractBearerToken(req.headers.authorization);
  if (!raw) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="prokraya-api"');
    return res.status(401).json({ error: "Bearer token required" });
  }

  let claims: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    claims = await verifyAccessToken(raw);
  } catch {
    res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
    return res.status(401).json({ error: "invalid_token" });
  }

  if (isJtiRevoked(claims.jti)) {
    return res.status(401).json({ error: "token_revoked" });
  }

  return res.json({
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    role: claims.role,
    roles: claims.roles,
    tenant: claims.tenant,
    userType: claims.userType,
    orgId: claims.orgId,
    suppOrgId: claims.suppOrgId ?? null,
    permissions: claims.permissions,
  });
});

// ─── Token revocation (RFC 7009) ──────────────────────────────────────────────

/**
 * POST /api/auth/revoke
 * Body: { token: "<access_or_refresh_token>", token_type_hint?: "access_token" | "refresh_token" }
 */
router.post("/api/auth/revoke", async (req, res) => {
  const { token, token_type_hint } = req.body ?? {};
  if (!token) {
    return res.status(400).json({ error: "token is required" });
  }

  // Try refresh token first when hinted, otherwise try both
  const tryRefresh = !token_type_hint || token_type_hint === "refresh_token";
  const tryAccess = !token_type_hint || token_type_hint === "access_token";

  if (tryRefresh) {
    try {
      const p = await verifyRefreshToken(token);
      deleteRefreshToken(p.jti);
      return res.status(200).json({ revoked: true });
    } catch { /* not a refresh token */ }
  }

  if (tryAccess) {
    try {
      const p = await verifyAccessToken(token);
      revokeJti(p.jti, (p.exp ?? 0) * 1000);
      return res.status(200).json({ revoked: true });
    } catch { /* not a valid access token */ }
  }

  // Per RFC 7009 §2.2, invalid tokens should still return 200
  return res.status(200).json({ revoked: false, reason: "token_not_recognized" });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/logout
 * Clears the session and revokes the supplied token (if any).
 */
router.post("/api/auth/logout", async (req, res) => {
  const sessionUser = (req as any).session?.user;
  const draft = (req as any).session?.vendorRegistrationDraft;
  const pendingDocs = (req as any).session?.pendingAiDocuments || [];
  if (draft && sessionUser?.userName && sessionUser?.orgId) {
    try {
      await saveDraftBackup(sessionUser.userName, Number(sessionUser.orgId), draft, pendingDocs);
    } catch (err: any) {
      console.error("[Logout] Failed to back up vendor registration draft:", err?.message);
    }
  }

  // Revoke Bearer token if present
  const raw = extractBearerToken(req.headers.authorization);
  if (raw) {
    try {
      const p = await verifyAccessToken(raw);
      revokeJti(p.jti, (p.exp ?? 0) * 1000);
    } catch { /* ignore invalid / expired tokens */ }
  }

  // Destroy session
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  } else {
    res.json({ message: "Logged out" });
  }
});

// ─── /api/auth/me  (convenience) ─────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile from either a Bearer token or the
 * active session — whichever is present.
 */
router.get("/api/auth/me", async (req, res) => {
  // 1. Try Bearer token
  const raw = extractBearerToken(req.headers.authorization);
  if (raw) {
    try {
      const claims = await verifyAccessToken(raw);
      if (!isJtiRevoked(claims.jti)) {
        return res.json({
          id: claims.sub,
          email: claims.email,
          name: claims.name,
          role: claims.role,
          roles: claims.roles,
          tenant: claims.tenant,
          userType: claims.userType,
          orgId: claims.orgId,
          suppOrgId: claims.suppOrgId ?? null,
          permissions: claims.permissions,
        });
      }
    } catch { /* fall through to session */ }
  }

  // 2. Fall back to session
  const sessionUser = (req as any).user ?? (req as any).session?.user;
  if (sessionUser) {
    const role = sessionUser.userRole ?? sessionUser.role ?? "ROLE_USER";
    return res.json({
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name,
      userName: sessionUser.userName,
      role,
      roles: [role],
      tenant: sessionUser.domain ?? null,
      userType: sessionUser.userType,
      orgId: sessionUser.orgId,
      suppOrgId: sessionUser.suppOrgId ?? null,
      permissions: getPermissionsForRole(role),
    });
  }

  res.status(401).json({ error: "Not authenticated" });
});

export { router as oidcController };
