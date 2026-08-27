/**
 * In-memory refresh-token and JTI-revocation store.
 *
 * For multi-instance / HA deployments replace this module with a
 * Redis- or PostgreSQL-backed implementation that shares state across nodes.
 * The public API surface is intentionally minimal so the swap is mechanical.
 */

// ─── Refresh tokens ───────────────────────────────────────────────────────────

interface RefreshEntry {
  userId: string;
  tenant: string | null;
  expiresAt: number; // epoch-ms
}

const refreshTokens = new Map<string, RefreshEntry>();

export function storeRefreshToken(
  jti: string,
  userId: string,
  tenant: string | null,
  ttlSeconds: number
): void {
  refreshTokens.set(jti, {
    userId,
    tenant,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function getRefreshEntry(jti: string): RefreshEntry | undefined {
  const entry = refreshTokens.get(jti);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    refreshTokens.delete(jti);
    return undefined;
  }
  return entry;
}

export function deleteRefreshToken(jti: string): void {
  refreshTokens.delete(jti);
}

// ─── Access-token revocation (by JTI) ────────────────────────────────────────

interface RevokedEntry {
  expiresAt: number; // keep in map until the token would have expired anyway
}

const revokedJtis = new Map<string, RevokedEntry>();

/**
 * Mark an access-token JTI as revoked.
 * `originalExpMs` should be the token's original `exp` claim × 1000 so the
 * entry can be cleaned up after the token's natural lifetime.
 */
export function revokeJti(jti: string, originalExpMs: number): void {
  revokedJtis.set(jti, { expiresAt: originalExpMs });
}

export function isJtiRevoked(jti: string): boolean {
  const entry = revokedJtis.get(jti);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    revokedJtis.delete(jti);
    return false;
  }
  return true;
}

// ─── SSO handoff codes ────────────────────────────────────────────────────────
//
// Bridges the OAuth callback (which always lands on the main domain, since
// Google/Microsoft redirect URIs are fixed) back to the originating tenant
// subdomain: the callback stores the minted login payload under a short-lived,
// one-time code, and the tenant subdomain exchanges that code for the payload.

interface SsoHandoffEntry {
  payload: Record<string, any>;
  expiresAt: number; // epoch-ms
}

const ssoHandoffs = new Map<string, SsoHandoffEntry>();

export function storeSsoHandoff(
  code: string,
  payload: Record<string, any>,
  ttlSeconds: number
): void {
  ssoHandoffs.set(code, { payload, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Get-and-delete: a handoff code can only be exchanged once. */
export function consumeSsoHandoff(code: string): Record<string, any> | undefined {
  const entry = ssoHandoffs.get(code);
  ssoHandoffs.delete(code);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) return undefined;
  return entry.payload;
}

// ─── Periodic cleanup ─────────────────────────────────────────────────────────

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [jti, entry] of Array.from(refreshTokens)) {
    if (entry.expiresAt < now) refreshTokens.delete(jti);
  }
  for (const [jti, entry] of Array.from(revokedJtis)) {
    if (entry.expiresAt < now) revokedJtis.delete(jti);
  }
  for (const [code, entry] of Array.from(ssoHandoffs)) {
    if (entry.expiresAt < now) ssoHandoffs.delete(code);
  }
}, CLEANUP_INTERVAL_MS);

// Prevent the timer from keeping the process alive during tests / graceful shutdown
if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();