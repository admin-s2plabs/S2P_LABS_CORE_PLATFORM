/**
 * JWT module — RS256 key management, access/refresh token sign/verify, JWKS.
 *
 * Keys are generated on startup.  For production, supply PEM-encoded keys via
 * JWT_PRIVATE_KEY and JWT_PUBLIC_KEY environment variables so they survive
 * restarts and multi-instance deployments.
 */
import {
  generateKeyPair,
  exportJWK,
  importPKCS8,
  importSPKI,
  SignJWT,
  jwtVerify,
  exportPKCS8,
  exportSPKI,
  type JWTPayload,
} from "jose";
import { v4 as uuidv4 } from "uuid";

// ─── Constants ───────────────────────────────────────────────────────────────

export const TOKEN_ISSUER = "prokraya-ai";
export const TOKEN_AUDIENCE = "prokraya-api";
export const ACCESS_TOKEN_TTL_SECS = 30 * 60;       // 30 minutes
export const REFRESH_TOKEN_TTL_SECS = 1 * 24 * 3600; // 1 day
const KEY_ALG = "RS256";
const KEY_ID = "prokraya-rsa-1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccessTokenClaims {
  /** User ID (UUID or numeric string) */
  sub: string;
  email: string;
  name: string;
  /** Primary role name, e.g. "ROLE_PROCUREMENT_OFFICER" */
  role: string;
  /** All assigned roles */
  roles: string[];
  /**
   * Tenant domain that issued the token.
   * Null for master-DB (internal) accounts without a tenant subdomain.
   */
  tenant: string | null;
  /** 1 = internal staff, 2 = vendor/supplier */
  userType: number;
  orgId: string;
  /** Comma-separated org IDs from um_user_org_map_dtls (staff users) */
  orgIds?: string;
  suppOrgId?: string | null;
  supplierId?: string | null;
  department?: string | null;
  roleDisplayName?: string;
  /** Pre-computed permission strings derived from role, e.g. "bids:write" */
  permissions: string[];
  /** JWT ID — used for per-token revocation */
  jti: string;
}

// ─── Key state ────────────────────────────────────────────────────────────────

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let publicJwk: Record<string, unknown>;
let keysReady = false;

/**
 * Must be called once at server startup before any token is signed or verified.
 */
export async function initializeJwtKeys(): Promise<void> {
  const envPrivate = process.env.JWT_PRIVATE_KEY;
  const envPublic = process.env.JWT_PUBLIC_KEY;

  if (envPrivate && envPublic) {
    // extractable: true so exportJWK works for the JWKS endpoint
    privateKey = await importPKCS8(envPrivate.replace(/\\n/g, "\n"), KEY_ALG, { extractable: true });
    publicKey = await importSPKI(envPublic.replace(/\\n/g, "\n"), KEY_ALG, { extractable: true });
    console.log("[JWT] Loaded RSA key pair from environment variables");
  } else {
    // extractable: true so we can export PEM for logging / persistence hints
    const pair = await generateKeyPair(KEY_ALG, { modulusLength: 2048, extractable: true });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;

    // Log PEM so operators can persist them in env vars
    if (process.env.NODE_ENV !== "production") {
      const priv = await exportPKCS8(privateKey);
      const pub = await exportSPKI(publicKey);
      console.log("[JWT] Generated ephemeral RSA key pair (set JWT_PRIVATE_KEY / JWT_PUBLIC_KEY env vars to persist across restarts)");
      console.log("[JWT] JWT_PUBLIC_KEY=" + pub.replace(/\n/g, "\\n"));
      console.log("[JWT] JWT_PRIVATE_KEY=" + priv.replace(/\n/g, "\\n"));
    } else {
      console.warn("[JWT] WARNING: ephemeral RSA keys in production — tokens will be invalidated on restart. Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY env vars.");
    }
  }

  publicJwk = {
    ...(await exportJWK(publicKey)),
    kid: KEY_ID,
    use: "sig",
    alg: KEY_ALG,
  };
  keysReady = true;
}

function assertReady() {
  if (!keysReady) throw new Error("[JWT] Keys not initialized — call initializeJwtKeys() first");
}

// ─── JWKS ─────────────────────────────────────────────────────────────────────

export function getJwks(): { keys: Record<string, unknown>[] } {
  assertReady();
  return { keys: [publicJwk] };
}

// ─── Sign ─────────────────────────────────────────────────────────────────────

export async function signAccessToken(
  claims: Omit<AccessTokenClaims, "jti">
): Promise<string> {
  assertReady();
  const jti = uuidv4();
  return new SignJWT({ ...claims, jti } as JWTPayload)
    .setProtectedHeader({ alg: KEY_ALG, kid: KEY_ID })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECS}s`)
    .sign(privateKey);
}

export async function signRefreshToken(
  userId: string,
  tenant: string | null
): Promise<{ token: string; jti: string }> {
  assertReady();
  const jti = uuidv4();
  const token = await new SignJWT({
    sub: userId,
    tenant: tenant ?? null,
    jti,
  } as JWTPayload)
    .setProtectedHeader({ alg: KEY_ALG, kid: KEY_ID })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(`${TOKEN_AUDIENCE}:refresh`)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL_SECS}s`)
    .sign(privateKey);
  return { token, jti };
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenClaims & JWTPayload> {
  assertReady();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    algorithms: [KEY_ALG],
  });
  return payload as AccessTokenClaims & JWTPayload;
}

export async function verifyRefreshToken(
  token: string
): Promise<{ sub: string; tenant: string | null; jti: string } & JWTPayload> {
  assertReady();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: TOKEN_ISSUER,
    audience: `${TOKEN_AUDIENCE}:refresh`,
    algorithms: [KEY_ALG],
  });
  return payload as { sub: string; tenant: string | null; jti: string } & JWTPayload;
}

/**
 * Extract a Bearer token from the Authorization header without verifying it.
 * Returns null if no Bearer token is present.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}