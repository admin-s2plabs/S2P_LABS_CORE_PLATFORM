/** Legacy keys (pre–supplier-scoped storage) — migrated or dropped on read. */
export const LEGACY_VENDOR_AI_CHAT_KEY = "vendor-reg-ai-chat-v1";
export const LEGACY_VENDOR_DRAFT_KEY = "vendor-reg-draft-v1";

/** Pre–numeric-supplier bucket used in the first scoped iteration (migrate into account scope). */
const LEGACY_LITERAL_PENDING_SCOPE = "pending";

export function vendorAiChatStorageKey(scope: string): string {
  return `vendor-reg-ai-chat-v1:s:${scope}`;
}

export function vendorDraftStorageKey(scope: string): string {
  return `vendor-reg-draft-v1:s:${scope}`;
}

function sanitizeScopePart(v: unknown): string {
  const s = v == null ? "" : String(v).trim();
  if (!s || s === "null") return "";
  return s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "x";
}

/**
 * Pre-supplier scope: isolates draft/chat per logged-in account (user + org),
 * so two different vendor users do not share one "pending" bucket.
 */
export function getPreSupplierAccountScope(): string {
  if (typeof window === "undefined") return "p-ssr";
  try {
    const raw = window.localStorage.getItem("prokraya-auth");
    if (!raw) return "p-anon";
    const j = JSON.parse(raw) as { userId?: unknown; orgId?: unknown };
    const uid = sanitizeScopePart(j?.userId);
    const oid = sanitizeScopePart(j?.orgId);
    return `p-${uid || "anon"}-${oid || "org"}`;
  } catch {
    return "p-anon";
  }
}

/**
 * Isolates AI registration draft/chat per supplier.
 * Prefer server profile id; fall back to login supplierId; else account pre-supplier scope.
 */
export function getVendorRegistrationStorageScope(vendorProfile: unknown): string {
  const p = vendorProfile as { id?: unknown } | null | undefined;
  const rawId = p?.id;
  const numId =
    typeof rawId === "number" && Number.isFinite(rawId) && rawId > 0
      ? rawId
      : typeof rawId === "string" && /^\d+$/.test(rawId)
        ? parseInt(rawId, 10)
        : NaN;
  if (!Number.isNaN(numId) && numId > 0) return String(numId);

  if (typeof window === "undefined") return getPreSupplierAccountScope();
  try {
    const raw = window.localStorage.getItem("prokraya-auth");
    if (!raw) return getPreSupplierAccountScope();
    const j = JSON.parse(raw) as { supplierId?: unknown };
    const sid = j?.supplierId;
    if (sid != null && sid !== "") {
      const s = String(sid).trim();
      if (s && s !== "null" && /^\d+$/.test(s)) return s;
    }
  } catch {
    /* ignore */
  }
  return getPreSupplierAccountScope();
}

function pullPendingIntoScoped(scopedKey: string, pendingScopedKey: string): string | null {
  const pRaw = sessionStorage.getItem(pendingScopedKey);
  if (!pRaw) return null;
  sessionStorage.setItem(scopedKey, pRaw);
  sessionStorage.removeItem(pendingScopedKey);
  return pRaw;
}

/**
 * Read persisted JSON for chat or draft: scoped key, optional legacy import, pre-account → numeric migration.
 */
export function readScopedSessionRaw(scope: string, kind: "chat" | "draft"): string | null {
  const scopedKey =
    kind === "chat" ? vendorAiChatStorageKey(scope) : vendorDraftStorageKey(scope);
  const legacyKey =
    kind === "chat" ? LEGACY_VENDOR_AI_CHAT_KEY : LEGACY_VENDOR_DRAFT_KEY;
  const preAccountScope = getPreSupplierAccountScope();
  const preAccountKey =
    kind === "chat" ? vendorAiChatStorageKey(preAccountScope) : vendorDraftStorageKey(preAccountScope);
  const oldLiteralPendingKey =
    kind === "chat"
      ? vendorAiChatStorageKey(LEGACY_LITERAL_PENDING_SCOPE)
      : vendorDraftStorageKey(LEGACY_LITERAL_PENDING_SCOPE);

  let raw = sessionStorage.getItem(scopedKey);

  if (!raw && scope === preAccountScope) {
    const leg = sessionStorage.getItem(legacyKey);
    if (leg) {
      sessionStorage.setItem(scopedKey, leg);
      sessionStorage.removeItem(legacyKey);
      raw = leg;
    }
  }
  if (!raw && scope === preAccountScope) {
    const oldP = sessionStorage.getItem(oldLiteralPendingKey);
    if (oldP) {
      sessionStorage.setItem(scopedKey, oldP);
      sessionStorage.removeItem(oldLiteralPendingKey);
      raw = oldP;
    }
  }

  if (!raw && /^\d+$/.test(scope)) {
    raw = pullPendingIntoScoped(scopedKey, preAccountKey);
  }

  if (!raw && scope !== preAccountScope && !/^\d+$/.test(scope)) {
    sessionStorage.removeItem(legacyKey);
  }
  if (!raw && /^\d+$/.test(scope)) {
    sessionStorage.removeItem(legacyKey);
  }

  return raw;
}

export function removeAllVendorAiChatKeysForScope(scope: string): void {
  sessionStorage.removeItem(vendorAiChatStorageKey(scope));
  sessionStorage.removeItem(LEGACY_VENDOR_AI_CHAT_KEY);
  sessionStorage.removeItem(vendorAiChatStorageKey(LEGACY_LITERAL_PENDING_SCOPE));
}

export function removeAllVendorDraftKeysForScope(scope: string): void {
  sessionStorage.removeItem(vendorDraftStorageKey(scope));
  sessionStorage.removeItem(LEGACY_VENDOR_DRAFT_KEY);
  sessionStorage.removeItem(vendorDraftStorageKey(LEGACY_LITERAL_PENDING_SCOPE));
}
