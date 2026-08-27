/**
 * SSO login (Google + Microsoft) for tenant sign-in.
 *
 * Login-only: a verified SSO email must already match an existing user in the
 * tenant's dbo.um_user_dtls, or the flow errors out back to the login page.
 * No auto-provisioning.
 *
 * The redirect_uri is per-tenant-subdomain (`buildProviderRedirectUri`), so
 * each tenant's callback URL must be pre-registered as an allowed redirect
 * URI in the provider's app console (Azure AD / Google Cloud) — providers
 * don't support subdomain wildcards. /start and /callback build this URI
 * with the same helper so the two OAuth legs never drift apart (a mismatch
 * makes the provider fail the token exchange). The tenant domain is also
 * carried through the provider round-trip in a signed `state` param, and a
 * short-lived one-time handoff code hands the session off to the browser
 * once it's back on the tenant subdomain.
 *
 * Endpoints:
 *   GET /api/auth/sso/:provider/start     Redirect to the provider's consent screen
 *   GET /api/auth/sso/:provider/callback  Per-tenant-subdomain provider redirect target
 *   GET /api/auth/sso/exchange            Tenant subdomain: redeem the handoff code
 */
import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { logAudit } from "../administration/administration.service";
import { resolveRequestUser } from "../_shared/auth";
import { createOAuthTokensForUser } from "./oidc.controller";
import { consumeSsoHandoff, storeSsoHandoff } from "./token-store";
import * as repo from "../administration/administration.repository";

const router = Router();

type SsoProvider = "google" | "microsoft";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const HANDOFF_TTL_SECS = 60;
const STATE_SECRET = process.env.SESSION_SECRET || "prokraya-sso-state-secret";

function audit(req: Request, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = resolveRequestUser(req);
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

function isSsoProvider(value: string): value is SsoProvider {
  return value === "google" || value === "microsoft";
}

interface ProviderConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  scope: string;
}

async function getProviderConfig(provider: SsoProvider): Promise<ProviderConfig> {
  if (provider === "google") {
    const googleClientId = await repo.getValueByCode("GOOGLE_CLIENT_ID");
    const googleClientSecret = await repo.getValueByCode("GOOGLE_CLIENT_SECRET");
    return {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
      scope: "openid email profile",
    };
  }
  const microsoftClientId = await repo.getValueByCode("MICROSOFT_CLIENT_ID");
  const microsoftClientSecret = await repo.getValueByCode("MICROSOFT_CLIENT_SECRET");
  const msTenant = await repo.getValueByCode("MICROSOFT_TENANT_ID") || "common";
  return {
    clientId: microsoftClientId,
    clientSecret: microsoftClientSecret,
    authorizeUrl: `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/token`,
    jwksUrl: `https://login.microsoftonline.com/${msTenant}/discovery/v2.0/keys`,
    scope: "openid email profile",
  };
}

function validIssuer(provider: SsoProvider, iss: unknown): boolean {
  if (provider === "google") {
    return iss === "https://accounts.google.com" || iss === "accounts.google.com";
  }
  return typeof iss === "string" && /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/.test(iss);
}

const jwksCache = new Map<SsoProvider, ReturnType<typeof createRemoteJWKSet>>();
function getJwksForProvider(provider: SsoProvider, jwksUrl: string) {
  let jwks = jwksCache.get(provider);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(provider, jwks);
  }
  return jwks;
}


async function getAppBaseUrl(): Promise<string> {
  const APP_URL = await repo.getValueByCode("APP_URL");
  return (APP_URL || "http://localhost:5000").replace(/\/+$/, "");
}

/** Builds an absolute URL on the given tenant's subdomain, derived from APP_URL. */
async function buildTenantUrl(domain: string, path: string): Promise<string> {
  const url = new URL(await getAppBaseUrl());
  const baseHost = url.hostname.replace(/^www\./, "");
  url.hostname = `${domain}.${baseHost}`;
  url.pathname = path;
  url.search = "";
  return url.toString();
}

/**
 * Builds the tenant-specific OAuth redirect_uri. Must be registered exactly
 * (per tenant) as an allowed redirect URI in the provider's app console —
 * Google/Microsoft do not support subdomain wildcards. This same helper is
 * used by both /start (authorize request) and /callback (token exchange) so
 * the two legs can never drift apart, since providers reject a token
 * exchange whose redirect_uri doesn't exactly match the authorize request.
 */
async function buildProviderRedirectUri(domain: string, provider: SsoProvider): Promise<string> {
  const url = new URL(await getAppBaseUrl());
  const baseHost = url.hostname.replace(/^www\./, "");
  url.hostname = `${domain}.${baseHost}`;
  url.pathname = `/api/auth/sso/${provider}/callback`;
  url.search = "";
  return url.toString();
}

interface SsoState {
  domain: string;
  nonce: string;
  ts: number;
}

function signState(payload: SsoState): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", STATE_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyState(state: string): SsoState | null {
  const [data, sig] = state.split(".");
  if (!data || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", STATE_SECRET).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Reads a single cookie by name without depending on the cookie-parser middleware. */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

// ─── Start: redirect to the provider's consent screen ─────────────────────────

router.get("/api/auth/sso/:provider/start", async (req: Request, res: Response) => {
  const providerParam = req.params.provider;
  if (!isSsoProvider(providerParam)) {
    return res.status(400).json({ error: "invalid_provider" });
  }

  const config = await getProviderConfig(providerParam);
  if (!config.clientId || !config.clientSecret) {
    return res.status(400).json({ error: "sso_not_configured" });
  }

  const domain = String(req.query.domain || "").trim().toLowerCase();
  if (!domain || !/^[a-z][a-z0-9-]*$/.test(domain)) {
    return res.status(400).json({ error: "domain_required" });
  }

  const { resolveTenantDb } = await import("../../tenant-db");
  const tenantContext = await resolveTenantDb(domain);
  if (!tenantContext) {
    return res.status(400).json({ error: "invalid_domain" });
  }

  const nonce = crypto.randomBytes(16).toString("base64url");
  res.cookie("sso_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_MS,
  });

  const state = signState({ domain, nonce, ts: Date.now() });
  const redirectUri = await buildProviderRedirectUri(domain, providerParam);

  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", config.scope);
  authorizeUrl.searchParams.set("state", state);
  if (providerParam === "google") {
    authorizeUrl.searchParams.set("access_type", "online");
    authorizeUrl.searchParams.set("prompt", "select_account");
  } else {
    authorizeUrl.searchParams.set("response_mode", "query");
  }

  return res.redirect(authorizeUrl.toString());
});

// ─── Callback: per-tenant-subdomain redirect target ───────────────────────────

router.get("/api/auth/sso/:provider/callback", async (req: Request, res: Response) => {
  const providerParam = req.params.provider;
  const appBaseUrl = await getAppBaseUrl();
  const mainLoginError = () => res.redirect(`${appBaseUrl}/login?ssoError=sso_failed`);

  if (!isSsoProvider(providerParam)) {
    return mainLoginError();
  }

  const nonceCookie = readCookie(req, "sso_nonce");
  res.clearCookie("sso_nonce");

  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const statePayload = state ? verifyState(state) : null;

  if (
    !code ||
    !statePayload ||
    !nonceCookie ||
    statePayload.nonce !== nonceCookie ||
    Date.now() - statePayload.ts > STATE_TTL_MS
  ) {
    return mainLoginError();
  }

  const { domain } = statePayload;
  const tenantSigninError = async (errorCode: string) =>
    res.redirect(`${await buildTenantUrl(domain, "/signin")}?ssoError=${errorCode}`);

  const config = await getProviderConfig(providerParam);
  if (!config.clientId || !config.clientSecret) {
    return tenantSigninError("sso_failed");
  }

  const redirectUri = await buildProviderRedirectUri(domain, providerParam);

  let idToken: string;
  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const tokenBody: any = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenBody?.id_token) {
      throw new Error(tokenBody?.error_description || tokenBody?.error || "Token exchange failed");
    }
    idToken = tokenBody.id_token;
  } catch (err: any) {
    console.error(`[SSO:${providerParam}] Token exchange failed:`, err?.message);
    return tenantSigninError("sso_failed");
  }

  let email: string | null = null;
  try {
    const jwks = getJwksForProvider(providerParam, config.jwksUrl);
    const { payload } = await jwtVerify(idToken, jwks, { audience: config.clientId });
    if (!validIssuer(providerParam, payload.iss)) {
      throw new Error(`Unexpected issuer: ${payload.iss}`);
    }
    if (providerParam === "google" && (payload as any).email_verified !== true) {
      return tenantSigninError("email_not_verified");
    }
    email = ((payload as any).email as string) || ((payload as any).preferred_username as string) || null;
  } catch (err: any) {
    console.error(`[SSO:${providerParam}] id_token verification failed:`, err?.message);
    return tenantSigninError("sso_failed");
  }

  if (!email) {
    return tenantSigninError("sso_failed");
  }

  const { resolveTenantDb } = await import("../../tenant-db");
  const tenantContext = await resolveTenantDb(domain);
  if (!tenantContext) {
    return tenantSigninError("invalid_domain");
  }

  const { findUserByEmail } = await import("../common/common.repository");
  const userRow = await findUserByEmail(email, tenantContext.pool);
  if (!userRow) {
    return tenantSigninError("not_registered");
  }
  if (String(userRow.user_status) !== "1") {
    return tenantSigninError("account_inactive");
  }

  const { CommonService } = await import("../common/common.service");
  const svc = new CommonService();
  const { sessionData, responseData } = await svc.buildLoginResult(userRow, tenantContext.pool);
  const tokens = await createOAuthTokensForUser(userRow, domain, tenantContext.pool);

  const handoffCode = crypto.randomBytes(24).toString("base64url");
  storeSsoHandoff(handoffCode, { sessionData, responseData, tokens, domain }, HANDOFF_TTL_SECS);

  return res.redirect(`${await buildTenantUrl(domain, "/signin")}?hc=${handoffCode}`);
});

// ─── Exchange: redeem the one-time handoff code on the tenant subdomain ───────

router.get("/api/auth/sso/exchange", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    return res.status(400).json({ error: "code_required" });
  }

  const payload = consumeSsoHandoff(code);
  if (!payload) {
    return res.status(400).json({ error: "invalid_or_expired_code" });
  }

  const requestDomain = (req as any).tenantDomain as string | undefined;
  if (!requestDomain || requestDomain !== payload.domain) {
    return res.status(400).json({ error: "domain_mismatch" });
  }

  const { sessionData, responseData, tokens } = payload as any;
  (req as any).session.user = sessionData;
  (req as any).user = sessionData;

  audit(
    req,
    sessionData.userName || "sso-login",
    "LOGIN",
    `User logged in via SSO (domain: ${payload.domain})`,
    "AUTH"
  );

  return res.json({ ...responseData, ...tokens });
});

export { router as ssoController };
