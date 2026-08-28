/**
 * Tenant-aware RBAC module.
 *
 * Roles live in the tenant database (dbo.um_role_dtls / dbo.um_user_roles_map_dtls).
 * This module maps those role names to a flat set of permission strings so routes
 * can guard by capability rather than by role name.
 *
 * Permission format:  "<resource>:<action>"
 * Special permission: "*"  →  grants everything (admin wildcard)
 */
import type { Request, Response, NextFunction } from "express";

// ─── Canonical permission constants ──────────────────────────────────────────

export const PERMISSIONS = {
  // Procurement (Purchase Requisitions / Purchase Orders)
  PROCUREMENT_READ: "procurement:read",
  PROCUREMENT_WRITE: "procurement:write",
  PROCUREMENT_APPROVE: "procurement:approve",
  PROCUREMENT_CANCEL: "procurement:cancel",

  // Bids / RFQs
  BIDS_READ: "bids:read",
  BIDS_WRITE: "bids:write",
  BIDS_SUBMIT: "bids:submit",
  BIDS_AWARD: "bids:award",

  // Auctions
  AUCTIONS_READ: "auctions:read",
  AUCTIONS_WRITE: "auctions:write",
  AUCTIONS_MANAGE: "auctions:manage",

  // Contracts
  CONTRACTS_READ: "contracts:read",
  CONTRACTS_WRITE: "contracts:write",
  CONTRACTS_APPROVE: "contracts:approve",

  // Vendors / Suppliers
  VENDORS_READ: "vendors:read",
  VENDORS_WRITE: "vendors:write",
  VENDORS_APPROVE: "vendors:approve",

  // Budgets
  BUDGETS_READ: "budgets:read",
  BUDGETS_WRITE: "budgets:write",
  BUDGETS_APPROVE: "budgets:approve",

  // Invoices
  INVOICES_READ: "invoices:read",
  INVOICES_WRITE: "invoices:write",
  INVOICES_APPROVE: "invoices:approve",

  // Reports / Spend Analysis
  REPORTS_READ: "reports:read",
  REPORTS_EXPORT: "reports:export",

  // FMPI (Fair Market Price Intelligence)
  FMPI_READ: "fmpi:read",
  FMPI_RECALCULATE: "fmpi:recalculate",

  // Administration
  ADMIN_USERS: "admin:users",
  ADMIN_ROLES: "admin:roles",
  ADMIN_SETTINGS: "admin:settings",
  ADMIN_TENANTS: "admin:tenants",

  // Profile / own account
  PROFILE_READ: "profile:read",
  PROFILE_WRITE: "profile:write",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ─── Role → permission mapping ────────────────────────────────────────────────

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * Maps role_name values (as stored in dbo.um_role_dtls) to their allowed
 * permissions.  Add or adjust rows here as new roles are provisioned.
 *
 * IMPORTANT: a role_name missing from this map silently degrades to
 * ROLE_USER (profile-only), which makes requirePermission() 403 that role on
 * every guarded route.  The entries marked "provisioned" below are the role
 * names that actually exist in dbo.um_role_dtls today — keep them in sync when
 * roles are added to a tenant, or the new role will be locked out.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // ── Internal staff roles ──────────────────────────────────────────────────
  ROLE_ADMIN: ["*"],

  // provisioned
  ROLE_SUPERADMIN: ["*"],
  ROLE_SYSADMIN: ["*"],

  ROLE_PROCUREMENT_ADMIN: ALL_PERMISSIONS,

  // provisioned
  ROLE_PROCUREMENT_OFFICER: [
    "procurement:read", "procurement:write",
    "bids:read", "bids:write", "bids:submit",
    "auctions:read",
    "contracts:read", "contracts:write",
    "vendors:read",
    "budgets:read",
    "invoices:read",
    "reports:read", "reports:export",
    "fmpi:read", "fmpi:recalculate",
    "profile:read", "profile:write",
  ],

  // provisioned — officer + approval/award authority
  ROLE_PROCUREMENT_MANAGER: [
    "procurement:read", "procurement:write", "procurement:approve", "procurement:cancel",
    "bids:read", "bids:write", "bids:submit", "bids:award",
    "auctions:read", "auctions:write", "auctions:manage",
    "contracts:read", "contracts:write", "contracts:approve",
    "vendors:read", "vendors:write", "vendors:approve",
    "budgets:read",
    "invoices:read",
    "reports:read", "reports:export",
    "fmpi:read", "fmpi:recalculate",
    "profile:read", "profile:write",
  ],

  ROLE_APPROVER: [
    "procurement:read", "procurement:approve",
    "bids:read",
    "auctions:read",
    "contracts:read", "contracts:approve",
    "vendors:read", "vendors:approve",
    "budgets:read", "budgets:approve",
    "invoices:read", "invoices:approve",
    "reports:read",
    "fmpi:read",
    "profile:read", "profile:write",
  ],

  ROLE_BUYER: [
    "procurement:read", "procurement:write",
    "bids:read", "bids:write", "bids:submit", "bids:award",
    "auctions:read", "auctions:write", "auctions:manage",
    "contracts:read", "contracts:write",
    "vendors:read",
    "budgets:read",
    "invoices:read",
    "reports:read", "reports:export",
    "fmpi:read", "fmpi:recalculate",
    "profile:read", "profile:write",
  ],

  ROLE_FINANCE: [
    "budgets:read", "budgets:write", "budgets:approve",
    "invoices:read", "invoices:write", "invoices:approve",
    "reports:read", "reports:export",
    "profile:read", "profile:write",
  ],

  // provisioned — finance without approval authority
  ROLE_FINANCE_OFFICER: [
    "budgets:read", "budgets:write",
    "invoices:read", "invoices:write",
    "procurement:read",
    "reports:read", "reports:export",
    "fmpi:read",
    "profile:read", "profile:write",
  ],

  // provisioned
  ROLE_FINANCE_MANAGER: [
    "budgets:read", "budgets:write", "budgets:approve",
    "invoices:read", "invoices:write", "invoices:approve",
    "procurement:read",
    "reports:read", "reports:export",
    "fmpi:read",
    "profile:read", "profile:write",
  ],

  // provisioned — raises requests, approves for their department
  ROLE_DEPARTMENT_HEAD: [
    "procurement:read", "procurement:write", "procurement:approve",
    "budgets:read", "budgets:approve",
    "invoices:read",
    "contracts:read",
    "vendors:read",
    "reports:read",
    "fmpi:read",
    "profile:read", "profile:write",
  ],

  // provisioned — requester only
  ROLE_DEPARTMENT_USER: [
    "procurement:read", "procurement:write",
    "budgets:read",
    "contracts:read",
    "vendors:read",
    "reports:read",
    "fmpi:read",
    "profile:read", "profile:write",
  ],

  // provisioned but unassigned (0 users) — read-only until its scope is defined
  SUPERVISOR: [
    "procurement:read",
    "bids:read",
    "contracts:read",
    "vendors:read",
    "budgets:read",
    "invoices:read",
    "reports:read",
    "profile:read", "profile:write",
  ],

  // ── Vendor / Supplier roles ───────────────────────────────────────────────
  // provisioned
  ROLE_SUPPLIER_ADMIN: [
    "bids:read", "bids:write", "bids:submit",
    "auctions:read", "auctions:write",
    "contracts:read",
    "invoices:read", "invoices:write",
    "vendors:read", "vendors:write",
    "profile:read", "profile:write",
  ],

  ROLE_SUPPLIER_USER: [
    "bids:read", "bids:submit",
    "auctions:read",
    "contracts:read",
    "invoices:read",
    "vendors:read",
    "profile:read", "profile:write",
  ],

  // ── Fallback ──────────────────────────────────────────────────────────────
  ROLE_USER: ["profile:read", "profile:write"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return the permission set for the given role name.
 * Defaults to ROLE_USER permissions if the role is unknown.
 */
export function getPermissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS["ROLE_USER"];
}

/**
 * Merge permissions from multiple roles, deduplicating entries.
 * A single "*" in any role short-circuits to ["*"].
 */
export function mergePermissions(roles: string[]): string[] {
  const all = new Set<string>();
  for (const role of roles) {
    const perms = getPermissionsForRole(role);
    if (perms.includes("*")) return ["*"];
    perms.forEach((p) => all.add(p));
  }
  return Array.from(all);
}

function checkPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes("*")) return true;
  return userPermissions.includes(required);
}

// ─── Middleware factories ─────────────────────────────────────────────────────

/**
 * `requirePermission("bids:write")` — guards a route by capability.
 * Works with both session users and JWT bearer tokens.
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as Record<string, any> | undefined;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    // JWT claims embed pre-computed permissions; session users fall back to
    // a runtime derivation from their role.
    const permissions: string[] =
      Array.isArray(user.permissions) && user.permissions.length > 0
        ? user.permissions
        : getPermissionsForRole(user.userRole ?? user.role ?? "ROLE_USER");

    if (!checkPermission(permissions, permission)) {
      res.status(403).json({ error: "Forbidden", required: permission });
      return;
    }
    next();
  };
}

/**
 * `requireRole("ROLE_ADMIN", "ROLE_PROCUREMENT_OFFICER")` — guards a route
 * by role name (any of the listed roles satisfies the check).
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as Record<string, any> | undefined;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const primary: string = user.userRole ?? user.role ?? "";
    const all: string[] = Array.isArray(user.roles) ? user.roles : (primary ? [primary] : []);

    const allowed = roles.some((r) => all.includes(r));
    if (!allowed) {
      res.status(403).json({ error: "Forbidden", required: roles.join(" | ") });
      return;
    }
    next();
  };
}

/**
 * `requireTenant()` — ensures the request is scoped to a resolved tenant.
 * Rejects master-DB / tenantless requests.
 */
export function requireTenant() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as Record<string, any> | undefined;
    const tenantDomain = (req as any).tenantDomain ?? user?.tenant ?? user?.domain;
    if (!tenantDomain) {
      res.status(403).json({ error: "Tenant context required" });
      return;
    }
    next();
  };
}

/**
 * `requireSameTenant(getTenantId)` — ensures the authenticated user belongs to
 * the same tenant as the resource being accessed.
 * `getTenantId` extracts the resource's tenant from the request.
 */
export function requireSameTenant(getTenantId: (req: Request) => string | null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as Record<string, any> | undefined;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const userTenant = user.tenant ?? user.domain ?? (req as any).tenantDomain;
    const resourceTenant = getTenantId(req);
    if (!userTenant || !resourceTenant || userTenant !== resourceTenant) {
      res.status(403).json({ error: "Cross-tenant access denied" });
      return;
    }
    next();
  };
}
