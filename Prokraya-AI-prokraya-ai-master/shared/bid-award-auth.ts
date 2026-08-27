/** Assigned Buyer or Superadmin may compare bids, save evaluation, and award. */

export const AWARD_ACTIONS_DENIED_MESSAGE =
  "Access denied. Only the assigned Buyer or a Superadmin can compare bids, save evaluation, or award a supplier.";

const SUPERADMIN_ROLES = new Set(["ROLE_SUPERADMIN", "ROLE_SYSADMIN", "SUPERADMIN"]);

function identityTokens(source: Record<string, unknown> | null | undefined, keys: string[]): string[] {
  if (!source) return [];
  return keys
    .map((key) => String(source[key] ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function isBidAwardSuperadmin(sessionUser?: any): boolean {
  if (!sessionUser) return false;
  const roles = Array.isArray(sessionUser.roles) ? sessionUser.roles : [];
  if (roles.some((role: unknown) => SUPERADMIN_ROLES.has(String(role)))) return true;
  return SUPERADMIN_ROLES.has(String(sessionUser.userRole || sessionUser.role || ""));
}

export function isAssignedBidBuyer(bid: any, sessionUser?: any): boolean {
  const userTokens = identityTokens(sessionUser, [
    "id",
    "userId",
    "user_id",
    "userName",
    "user_name",
    "loginId",
    "login_id",
    "email",
    "email_id",
    "emailId",
  ]);
  if (userTokens.length === 0) return false;
  const buyerTokens = identityTokens(bid, [
    "buyer",
    "buyer_id",
    "buyerId",
    "buyer_login_id",
    "buyer_email",
    "buyerEmail",
  ]);
  return buyerTokens.some((token) => userTokens.includes(token));
}

export function canPerformBidAwardActions(bid: any, sessionUser?: any): boolean {
  if (!bid) return false;
  return isBidAwardSuperadmin(sessionUser) || isAssignedBidBuyer(bid, sessionUser);
}
