/**
 * Shared user auth context for sessions and JWT access tokens.
 */
import type { Pool } from "pg";
import { mergePermissions } from "./rbac";

export interface UserAuthExtras {
  orgIds: string;
  supplierId: string;
  department: string;
}

export async function loadUserAuthExtras(
  userId: number | string,
  tenantPool: Pool | null,
  isSupplierRole = false
): Promise<UserAuthExtras> {
  const pool = tenantPool ?? (await import("../../db")).pool;
  let orgIdsStr = "";
  let supplierId = "";
  let department = "";

  const userRow = await pool.query(
    `SELECT department_name FROM dbo.um_user_dtls WHERE id = $1`,
    [userId]
  );
  department = userRow.rows[0]?.department_name ?? "";

  if (isSupplierRole) {
    const { findSupplierMapping } = await import("../common/common.repository");
    const supplierMap = await findSupplierMapping(userId, tenantPool ?? undefined);
    supplierId = supplierMap?.supplier_id?.toString() ?? "";
  } else {
    const orgData = await pool.query(
      `SELECT org_id FROM dbo.um_user_org_map_dtls WHERE user_id = $1`,
      [userId]
    );
    if (orgData.rows.length > 0) {
      orgIdsStr = orgData.rows.map((r: { org_id: number }) => r.org_id).join(",");
    }
  }

  return { orgIds: orgIdsStr, supplierId, department };
}

export async function buildAccessTokenClaims(
  user: Record<string, any>,
  tenant: string | null,
  tenantPool: Pool | null
) {
  let roles: string[] = [];
  let primaryRole = "ROLE_USER";
  let roleDisplayName = "User";

  const pool = tenantPool ?? (await import("../../db")).pool;
  try {
    const result = await pool.query(
      `SELECT r.role_name, r.role_display_name
       FROM dbo.um_role_dtls r
       JOIN dbo.um_user_roles_map_dtls m ON r.id = m.role_id
       WHERE m.user_id = $1`,
      [user.id]
    );
    if (result.rows.length > 0) {
      roles = result.rows.map((r: { role_name: string }) => r.role_name);
      primaryRole = result.rows[0].role_name;
      roleDisplayName = result.rows[0].role_display_name ?? primaryRole;
    }
  } catch (err) {
    console.error("[auth-context] Failed to fetch roles for user", user.id, err);
  }

  const isSupplierRole =
    roles.includes("ROLE_SUPPLIER_ADMIN") || roles.includes("ROLE_SUPPLIER_USER");
  const extras = await loadUserAuthExtras(user.id, tenantPool, isSupplierRole);
  const permissions = mergePermissions(roles.length > 0 ? roles : [primaryRole]);

  return {
    sub: String(user.id),
    email: user.email_id ?? user.email ?? "",
    name: user.name ?? user.user_name ?? "",
    role: primaryRole,
    roleDisplayName,
    roles,
    tenant,
    userType: user.user_type ?? 1,
    orgId: String(user.org_id ?? ""),
    orgIds: extras.orgIds || String(user.org_id ?? ""),
    suppOrgId: user.supp_org_id ? String(user.supp_org_id) : null,
    supplierId: extras.supplierId || null,
    department: extras.department || user.department_name || null,
    permissions,
  };
}
