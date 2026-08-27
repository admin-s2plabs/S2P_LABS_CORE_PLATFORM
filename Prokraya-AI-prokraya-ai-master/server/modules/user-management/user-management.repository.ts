import { umOrgMapDtls } from "@shared/schema";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { getContextDb, getContextPool } from "../../tenant-context";
import { pool } from "../_shared";
const getPool = () => getContextPool() ?? pool;
const getDb = () => getContextDb() ?? db;

export async function getUsersPaginated(params: {
  page: number;
  limit: number;
  userType?: string;
  search?: string;
  status?: string;
}) {
  const { page, limit, userType, search, status } = params;
  const offset = (page - 1) * limit;

  let whereConditions: string[] = [];
  let queryParams: any[] = [];
  let paramIndex = 1;

  if (userType !== undefined && userType !== "") {
    whereConditions.push(`u.user_type = $${paramIndex}`);
    queryParams.push(parseInt(userType));
    paramIndex++;
  }

  if (status && status !== "all") {
    whereConditions.push(`u.user_status = $${paramIndex}`);
    queryParams.push(status === "active" ? 1 : 2);
    paramIndex++;
  }

  if (search && search.trim() !== "") {
    const searchTerm = search.trim().toLowerCase();
    const searchPattern = `%${searchTerm}%`;
    const searchPatternUnderscore = `%${searchTerm.replace(/\s+/g, '_')}%`;
    whereConditions.push(`(
      LOWER(u.name) LIKE $${paramIndex} OR 
      LOWER(u.email_id) LIKE $${paramIndex} OR 
      LOWER(u.user_name) LIKE $${paramIndex} OR 
      LOWER(u.department_name) LIKE $${paramIndex} OR
      LOWER(u.attribute_1) LIKE $${paramIndex} OR
      LOWER(COALESCE(r.role_name, '')) LIKE $${paramIndex} OR
      LOWER(COALESCE(r.role_name, '')) LIKE $${paramIndex + 1}
    )`);
    queryParams.push(searchPattern, searchPatternUnderscore);
    paramIndex += 2;
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  const countResult = await getPool().query(
    `SELECT COUNT(DISTINCT u.id) as total 
     FROM dbo.um_user_dtls u
     LEFT JOIN dbo.um_user_roles_map_dtls m ON u.id = m.user_id
     LEFT JOIN dbo.um_role_dtls r ON m.role_id = r.id
     LEFT JOIN dbo.um_org_dtls o ON u.org_id = o.id
     ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].total);

  let limitClause = "";
  if(limit !== 0){
    limitClause = ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit);
    queryParams.push(offset);
    paramIndex++;
  }

  const result = await getPool().query(`
    SELECT u.id, u.name, u.email_id, u.user_name, u.designation, u.department_name,u.attribute_1,
           u.mobile_no, u.phone_no, u.user_status, u.user_type, u.created_by, u.creation_date,
           u.last_login_date, u.activated, u.org_id, u.attribute_12, u.manager_id, u.manager_name,
           STRING_AGG(r.role_name, ', ') AS role_name
    FROM dbo.um_user_dtls u
    LEFT JOIN dbo.um_user_roles_map_dtls m ON u.id = m.user_id
    LEFT JOIN dbo.um_role_dtls r ON m.role_id = r.id
    LEFT JOIN dbo.um_org_dtls o ON u.org_id = o.id and o.org_type = 'INTERNAL'
    ${whereClause}
    GROUP BY u.id, u.name, u.email_id, u.user_name, u.designation, u.department_name,u.attribute_1,
           u.mobile_no, u.phone_no, u.user_status, u.user_type, u.created_by, u.creation_date,
           u.last_login_date, u.activated, u.org_id, u.attribute_12, u.manager_id, u.manager_name
    ORDER BY u.name ASC, u.id
    ${limitClause}
  `, queryParams);

  return {
    data: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getOrgUsers() {
  const result = await getPool().query(`
    SELECT id, name, email_id, designation 
    FROM dbo.um_user_dtls 
    WHERE user_type = 0 AND user_status = 1
    ORDER BY name ASC
  `);
  return result.rows;
}

export async function getUsersDropdown(inputs: {
  page: number;
  limit: number;
  search?: string;
  roles?: string[];
}) {
  const { page, limit, search, roles } = inputs;
  const offset = (page - 1) * limit;

  if (roles && roles.length > 0) {
    const rolePlaceholders = roles.map((_, i) => `$${i + 1}`).join(",");
    const result = await getPool().query(
      `SELECT DISTINCT
        r.role_name,
        u.id, 
        u.user_id, 
        u.user_name, 
        u.name, 
        u.email_id, 
        u.department_name, 
        u.user_type, 
        u.attribute_12 as org_id
      FROM dbo.um_user_dtls u
      JOIN dbo.um_user_roles_map_dtls ur 
        ON ur.user_id = u.id
      JOIN dbo.um_role_dtls r 
        ON r.id = ur.role_id
      WHERE 
        u.user_status = 1
        AND r.role_name IN (${rolePlaceholders})
      ORDER BY u.name;`,
      [...roles]
    );
    return result.rows;
  }

  if (search) {
    const like = `%${search}%`;
    const result = await getPool().query(
      `SELECT id, user_id, user_name, name, email_id, department_name, user_type, attribute_12 as org_id 
       FROM dbo.um_user_dtls 
       WHERE user_status = 1 AND user_type = 0
         AND (
           name ILIKE $3
           OR email_id ILIKE $3
           OR user_name ILIKE $3
         )
       ORDER BY name
       LIMIT $1 OFFSET $2`,
      [limit, offset, like],
    );
    return result.rows;
  }
  else
  {
  const result = await getPool().query(
    `SELECT id, user_id, user_name, name, email_id, department_name, user_type, attribute_12 as org_id 
     FROM dbo.um_user_dtls 
     WHERE user_status = 1 AND user_type = 0
     ORDER BY name
     LIMIT $1 OFFSET $2`
  , [limit, offset]);
  return result.rows;
  }
}

export async function getUserById(id: string) {
  const result = await getPool().query(`
    SELECT * FROM dbo.um_user_dtls WHERE id = $1
  `, [id]);
  return result.rows[0] || null;
}

/**
 * Resolve a free-text approver reference (name / email / user_name) to a
 * canonical `um_user.user_name`. Prefers an exact case-insensitive match and
 * otherwise falls back to a unique substring match; returns an ambiguous set
 * when more than one candidate remains.
 */
export async function resolveApproverReference(reference: string): Promise<
  | { status: "empty" }
  | { status: "not_found" }
  | { status: "matched"; userName: string; name: string | null }
  | { status: "ambiguous"; candidates: Array<{ user_name: string; name: string | null; email_id: string | null }> }
> {
  const value = String(reference || "").trim();
  if (!value) return { status: "empty" };

  const like = `%${value}%`;
  const result = await getPool().query(
    `SELECT id, user_name, name, email_id
       FROM dbo.um_user_dtls
      WHERE user_status = 1 AND user_type = 0
        AND (
          LOWER(user_name) = LOWER($1)
          OR LOWER(email_id) = LOWER($1)
          OR LOWER(name) = LOWER($1)
          OR user_name ILIKE $2
          OR name ILIKE $2
          OR email_id ILIKE $2
        )
      ORDER BY
        CASE
          WHEN LOWER(user_name) = LOWER($1) THEN 0
          WHEN LOWER(email_id) = LOWER($1) THEN 1
          WHEN LOWER(name) = LOWER($1) THEN 2
          ELSE 3
        END,
        name
      LIMIT 10`,
    [value, like],
  );

  const rows = result.rows as Array<{
    user_name: string;
    name: string | null;
    email_id: string | null;
  }>;
  if (rows.length === 0) return { status: "not_found" };

  const lowered = value.toLowerCase();
  const exact = rows.find(
    (row) =>
      String(row.user_name || "").toLowerCase() === lowered ||
      String(row.email_id || "").toLowerCase() === lowered ||
      String(row.name || "").toLowerCase() === lowered,
  );
  if (exact) {
    return { status: "matched", userName: String(exact.user_name), name: exact.name };
  }
  if (rows.length === 1) {
    return { status: "matched", userName: String(rows[0].user_name), name: rows[0].name };
  }
  return { status: "ambiguous", candidates: rows };
}

export async function checkEmailExists(email: string) {
  const normalized = email.trim();
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(TRIM(email_id)) = LOWER($1)`,
    [normalized]
  );
  return result.rows.length > 0;
}

export async function findSupplierByEmail(email: string) {
  const normalized = email.trim();
  const result = await getPool().query(
    `SELECT id, supplier_id, company_name, status
     FROM dbo.supp_basic_org_dtls
     WHERE LOWER(TRIM(email_id)) = LOWER($1)
     LIMIT 1`,
    [normalized]
  );
  return result.rows[0] || null;
}

export async function getNextUserId() {
  const result = await getPool().query(`SELECT MAX(id) as max_id FROM dbo.um_user_dtls`);
  return (result.rows[0].max_id || 0) + 1;
}

export async function insertUser(data: {
  id: number;
  name: string;
  email_id: string;
  hashedPassword: string;
  mobile_no?: string | null;
  department_name?: string | null;
  designation?: string | null;
  user_type: number;
  org_id?: string | null;
  reporting_to?: string | null;
  managerName?: string | null;
}) {
  const result = await getPool().query(`
    INSERT INTO dbo.um_user_dtls (
      id, name, email_id, user_name, password, mobile_no, 
      department_name, designation, user_type, org_id, user_status,
      activated, created_by, creation_date, manager_id, manager_name
    ) VALUES (
      $1, $2, $3, $3, $4, $5, $6, $7, $8, $9, 1, 'Y', $3, NOW(), $10, $11
    ) RETURNING id
  `, [
    data.id, data.name, data.email_id, data.hashedPassword, data.mobile_no || null,
    data.department_name || null, data.designation || null,
    data.user_type, data.org_id || null, data.reporting_to || null, data.managerName || null
  ]);
  return result.rows[0];
}

export async function assignUserRole(userId: number, roleId: number, createdBy: string) {
  await getPool().query(`
    INSERT INTO dbo.um_user_roles_map_dtls (user_id, role_id, status, is_primary, created_by, creation_date)
    VALUES ($1, $2, 1, 1, $3, NOW())
  `, [userId, roleId, createdBy]);
}

export async function getOrgCurrency() {
  const result = await getPool().query(`
    SELECT currency FROM dbo.um_org_dtls 
    WHERE entity_type = 'MAIN' 
    ORDER BY id LIMIT 1
  `);
  return result.rows[0]?.currency || 'AED';
}

export async function getNextApproveId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(CAST(approve_id AS INTEGER)), 0) + 1 as next_id FROM dbo.am_amt_based_apprs WHERE approve_id ~ '^[0-9]+$'`);
  return String(result.rows[0].next_id || 1);
}

export async function insertDefaultApprover(data: {
  userId: number;
  name: string;
  currency: string;
  approveId: string;
}) {
  await getPool().query(`
    INSERT INTO dbo.am_amt_based_apprs (entity_type, from_amount, to_amount, user_id, user_fullname, currency, approve_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, ['USER', 0, 100, data.userId, data.name, data.currency, data.approveId]);
}

export async function getManagerName(managerId: string) {
  const result = await getPool().query(
    `SELECT name FROM dbo.um_user_dtls WHERE id = $1`,
    [managerId]
  );
  return result.rows[0]?.name || null;
}

export async function updateUser(id: string, data: {
  name: string;
  email_id: string;
  mobile_no: string;
  department_name: string;
  designation: string;
  org_id: string;
  reporting_to?: string | null;
  managerName?: string | null;
  user_status: number;
}) {
  const result = await getPool().query(`
    UPDATE dbo.um_user_dtls 
    SET name = $1, email_id = $2, mobile_no = $3, department_name = $4, 
        designation = $5, manager_id = $6, manager_name = $7,
        user_status = $8, last_modified_date = NOW()
    WHERE id = $9
    RETURNING *
  `, [data.name, data.email_id, data.mobile_no, data.department_name, data.designation,
      data.reporting_to ? data.reporting_to.toString() : null, data.managerName,
      data.user_status, id]);

      let org_ids: number[] = [];
      const orgId = String(data.org_id);
      if(orgId.includes(","))
      {
       org_ids = orgId? orgId.split(",").map(id => parseInt(id.trim())) : [];
      }else{
        org_ids.push(parseInt(orgId));
      }
      let orgNames ="";
      let orgIdData   = "";
     for (const orgId1 of org_ids) 
     {
      const orgDtls = await getOrgById(orgId1);
      if (!orgDtls) {
        console.warn(`Org ${orgId1} not found in um_org_dtls, skipping org mapping.`);
        continue;
      }
      const existingMapping = await getDb().select().from(umOrgMapDtls).where(sql`${umOrgMapDtls.userId} = ${parseInt(id)} AND ${umOrgMapDtls.orgId} = ${orgId1}`);
      if (existingMapping.length > 0) {
        console.log(`Mapping already exists for user ${id} and org ${orgId1}, skipping insertion.`);
        orgNames = orgNames.concat(orgDtls ? orgDtls.organization_name + ",": "");
        orgIdData = orgIdData.concat(String(orgId1)) + ",";
        continue;
      }
      const USER_ORG_MAP_SEQ_ID = sql`nextval('dbo.um_user_org_map_dtls_seq'::regclass)`;
      await getDb().insert(umOrgMapDtls).values({
        id: USER_ORG_MAP_SEQ_ID,
        attribute1:null,
        attribute2:null,
        attribute3:null,
        attribute4:null,
        companyCode:null,
        createdBy:null,
        creationDate:new Date(),
        orgLegalName: null,
        ipAddress:null,
        lastModifiedBy:null,
        lastModifiedDate:null,
        organizationName:orgDtls ? orgDtls.organization_name : null,
        orgType:orgDtls ? orgDtls.org_Type : null,
        orgId:orgId1,
        userId:parseInt(id)
      });
       orgNames = orgNames.concat(orgDtls ? orgDtls.organization_name + ",": "");
       orgIdData = orgIdData.concat(String(orgId1)) + ",";
    }

    await getPool().query(`update dbo.um_user_dtls set attribute_1=$1,attribute_12=$3 WHERE id = $2`, [orgNames, parseInt(id), orgIdData]);
  return result.rows[0] || null;
}

export async function deleteUserRoles(userId: string) {
  await getPool().query(`DELETE FROM dbo.um_user_roles_map_dtls WHERE user_id = $1`, [userId]);
}

export async function deleteUserOrgMappings(userId: string) {
  await getPool().query(`DELETE FROM dbo.um_user_org_map_dtls WHERE user_id = $1`, [userId]);
}

export async function deleteUserById(userId: string) {
  const result = await getPool().query(
    `DELETE FROM dbo.um_user_dtls WHERE id = $1 RETURNING id, user_name, email_id`,
    [userId],
  );
  return result.rows[0] || null;
}

export async function insertUserRole(userId: string, roleId: number) {
  await getPool().query(`
    INSERT INTO dbo.um_user_roles_map_dtls (user_id, role_id, created_by, creation_date)
    VALUES ($1, $2, 'SYSTEM', NOW())
  `, [userId, roleId]);
}

export async function checkRoleIsSuperadmin(id: string) {
  const result = await getPool().query(
    `SELECT r.role_name
    FROM dbo.um_user_dtls u
    INNER JOIN dbo.um_user_roles_map_dtls ur 
      ON ur.user_id = u.id
    INNER JOIN dbo.um_role_dtls r 
      ON r.id = ur.role_id
    WHERE u.id = $1`,
    [id]
  );
  return result.rows?.[0]?.role_name || null;
}

export async function updateUserStatus(id: string, userStatus: number) {
  const result = await getPool().query(`
    UPDATE dbo.um_user_dtls 
    SET user_status = $1, last_modified_date = NOW(), lock_time = NULL, failed_attempt = 0
    WHERE id = $2
    RETURNING id, user_status
  `, [userStatus, id]);
  return result.rows[0] || null;
}

export async function getUserRoles(userId: string) {
  const result = await getPool().query(`
    SELECT r.id, r.role_name, r.role_display_name, r.description, r.status
    FROM dbo.um_role_dtls r
    INNER JOIN dbo.um_user_roles_map_dtls urm ON r.id = urm.role_id
    WHERE urm.user_id = $1
  `, [userId]);
  return result.rows;
}

export async function getRoles() {
  const result = await getPool().query(`
    SELECT id, role_name, role_display_name, description, status, role_type,
           created_by, creation_date, start_date, end_date, role_id
    FROM dbo.um_role_dtls 
    ORDER BY id ASC
  `);
  return result.rows;
}

export async function checkRoleNameExists(roleName: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_role_dtls WHERE role_name = $1`,
    [roleName]
  );
  return result.rows.length > 0;
}

export async function getNextRoleId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.um_role_dtls`);
  return result.rows[0].next_id;
}

export async function insertRole(data: {
  id: number;
  role_name: string;
  role_display_name: string;
  description: string;
  status: number;
  role_type: string;
}) {
  const result = await getPool().query(`
    INSERT INTO dbo.um_role_dtls (id, role_name, role_display_name, description, status, role_type, created_by, creation_date)
    VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', NOW())
    RETURNING *
  `, [data.id, data.role_name, data.role_display_name, data.description, data.status, data.role_type]);
  return result.rows[0];
}

export async function getRolesDropdown() {
  const result = await getPool().query(
    `SELECT role_id, role_name, role_display_name 
     FROM dbo.um_role_dtls 
     WHERE status = 1 
     ORDER BY role_display_name`
  );
  return result.rows;
}

export async function getRoleById(id: string) {
  const result = await getPool().query(`
    SELECT * FROM dbo.um_role_dtls WHERE id = $1
  `, [id]);
  return result.rows[0] || null;
}

export async function getRoleUsers(roleId: string) {
  const result = await getPool().query(`
    SELECT u.id, u.name, u.email_id, u.user_name, u.designation, u.department_name, u.user_status
    FROM dbo.um_user_dtls u
    INNER JOIN dbo.um_user_roles_map_dtls urm ON u.id = urm.user_id
    WHERE urm.role_id = $1
  `, [roleId]);
  return result.rows;
}

export async function getUsersByRoleName(roleName: string,orgId: string) {
  const result = await getPool().query(`
    SELECT u.id, u.name, u.email_id, u.user_name, u.designation, u.department_name
    FROM dbo.um_user_dtls u
    INNER JOIN dbo.um_user_org_map_dtls uom ON u.id = uom.user_id 
    INNER JOIN dbo.um_user_roles_map_dtls urm ON u.id = urm.user_id 
    INNER JOIN dbo.um_role_dtls r ON urm.role_id = r.id
    WHERE r.role_name = $1 AND u.user_status = 1 AND uom.org_id = $2
    ORDER BY u.name
  `, [roleName, orgId]);
  return result.rows;
}

export async function getRoleFunctions(roleId: string) {
  const result = await getPool().query(`
    SELECT f.id, f.function_name, f.description, f.module_name, f.category, f.status
    FROM dbo.um_functions_dtls f
    INNER JOIN dbo.um_role_functions_map_dtls rfm ON f.id = rfm.function_id
    WHERE rfm.role_id = $1 AND f.status = 1
    ORDER BY f.module_name, f.function_name
  `, [roleId]);
  return result.rows;
}

export async function getFunctions(roleId?: string) {
  let roleType = 'internal';

  if (roleId) {
    const roleResult = await getPool().query(
      `SELECT role_name FROM dbo.um_role_dtls WHERE id = $1`,
      [roleId]
    );
    if (roleResult.rows.length > 0) {
      const roleName = roleResult.rows[0].role_name;
      if (roleName === 'ROLE_SUPPLIER_ADMIN' || roleName === 'ROLE_SUPPLIER_USER') {
        roleType = 'supplier';
      }
    }
  }

  const result = await getPool().query(`
    SELECT id, function_name, description, module_name, category, status
    FROM dbo.um_functions_dtls
    WHERE status = 1
    ${roleType === 'supplier' ? "AND category IN ('SUPPLIER_ADMIN', 'COMMON')" : "AND category != 'SUPPLIER_ADMIN'"}
    ORDER BY module_name, function_name
  `);
  return result.rows;
}

export async function updateRole(id: string, data: { role_display_name: string; description: string }) {
  const result = await getPool().query(`
    UPDATE dbo.um_role_dtls 
    SET role_display_name = $1, description = $2, last_modified_date = NOW()
    WHERE id = $3
    RETURNING *
  `, [data.role_display_name, data.description, id]);
  return result.rows[0] || null;
}

export async function updateRoleFunctions(roleId: string, functionIds: number[]) {
  await getPool().query('BEGIN');

  try {
    await getPool().query(`
      DELETE FROM dbo.um_role_functions_map_dtls WHERE role_id = $1
    `, [roleId]);

    if (functionIds && functionIds.length > 0) {
      const values = functionIds.map((fid: number, idx: number) =>
        `($1, $${idx + 2}, NOW(), 'system')`
      ).join(', ');

      await getPool().query(`
        INSERT INTO dbo.um_role_functions_map_dtls (role_id, function_id, creation_date, created_by)
        VALUES ${values}
      `, [roleId, ...functionIds]);
    }

    await getPool().query('COMMIT');

    const result = await getPool().query(`
      SELECT f.id, f.function_name, f.description, f.module_name, f.category, f.status
      FROM dbo.um_functions_dtls f
      INNER JOIN dbo.um_role_functions_map_dtls rfm ON f.id = rfm.function_id
      WHERE rfm.role_id = $1 AND f.status = 1
      ORDER BY f.module_name, f.function_name
    `, [roleId]);

    return result.rows;
  } catch (error) {
    await getPool().query('ROLLBACK');
    throw error;
  }
}

export async function getRoleType(roleId: string) {
  const result = await getPool().query(`
    SELECT id, role_type FROM dbo.um_role_dtls WHERE id = $1
  `, [roleId]);
  return result.rows[0] || null;
}

export async function deleteRoleFunctionMappings(roleId: string) {
  await getPool().query(`DELETE FROM dbo.um_role_functions_map_dtls WHERE role_id = $1`, [roleId]);
}

export async function deleteUserRoleMappingsByRoleId(roleId: string) {
  await getPool().query(`DELETE FROM dbo.um_user_roles_map_dtls WHERE role_id = $1`, [roleId]);
}

export async function deleteRole(roleId: string) {
  const result = await getPool().query(`DELETE FROM dbo.um_role_dtls WHERE id = $1`, [roleId]);
  return result.rowCount;
}

export async function getRoleDelegationsPaginated(params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
}) {
  const { page, limit, search, status } = params;
  const offset = (page - 1) * limit;

  let whereClause = "WHERE 1=1";
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause += ` AND (LOWER(from_user_name) LIKE $${paramIndex} OR LOWER(to_user_name) LIKE $${paramIndex} OR LOWER(from_user) LIKE $${paramIndex} OR LOWER(to_user) LIKE $${paramIndex} OR LOWER(role_id) LIKE $${paramIndex})`;
    queryParams.push(`%${search.toLowerCase()}%`);
    paramIndex++;
  }

  if (status !== "all") {
    if (status === "active") {
      whereClause += ` AND status = 'Active'`;
    } else {
      whereClause += ` AND status != 'Active'`;
    }
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) FROM dbo.um_role_delegation_map_dtls ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].count);

  const result = await getPool().query(`
    SELECT id, from_user, from_user_name, to_user, to_user_name, role_id,
           from_date, to_date, status, comments, created_by, creation_date,
           last_modified_by, last_modified_date
    FROM dbo.um_role_delegation_map_dtls
    ${whereClause}
    ORDER BY creation_date DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...queryParams, limit, offset]);

  return {
    data: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getNextDelegationId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.um_role_delegation_map_dtls`);
  return result.rows[0].next_id;
}

export async function insertRoleDelegation(data: {
  id: number;
  from_user: string;
  from_user_name: string;
  to_user: string;
  to_user_name: string;
  role_id?: string | null;
  from_date: string;
  to_date: string;
  status: string;
  comments?: string;
}) {
  const result = await getPool().query(`
    INSERT INTO dbo.um_role_delegation_map_dtls 
    (id, from_user, from_user_name, to_user, to_user_name, role_id, from_date, to_date, status, comments, created_by, creation_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    RETURNING *
  `, [data.id, data.from_user, data.from_user_name, data.to_user, data.to_user_name, data.role_id || null, data.from_date, data.to_date, data.status || 'Active', data.comments, 'system']);
  return result.rows[0];
}

export async function updateRoleDelegation(id: string, data: {
  from_user?: string;
  from_user_name?: string;
  to_user?: string;
  to_user_name?: string;
  role_id?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
  comments?: string;
}) {
  const result = await getPool().query(`
    UPDATE dbo.um_role_delegation_map_dtls 
    SET from_user = COALESCE($1, from_user),
        from_user_name = COALESCE($2, from_user_name),
        to_user = COALESCE($3, to_user),
        to_user_name = COALESCE($4, to_user_name),
        role_id = COALESCE($5, role_id),
        from_date = COALESCE($6, from_date),
        to_date = COALESCE($7, to_date),
        status = COALESCE($8, status),
        comments = COALESCE($9, comments),
        last_modified_by = 'system',
        last_modified_date = NOW()
    WHERE id = $10
    RETURNING *
  `, [data.from_user, data.from_user_name, data.to_user, data.to_user_name, data.role_id, data.from_date, data.to_date, data.status, data.comments, id]);
  return result.rows[0] || null;
}

export async function deleteRoleDelegation(id: string) {
  const result = await getPool().query(`
    DELETE FROM dbo.um_role_delegation_map_dtls WHERE id = $1 RETURNING id
  `, [id]);
  return result.rows[0] || null;
}

export async function getActiveUsersForApprovers() {
  const result = await getPool().query(`
    SELECT id, name as user_fullname, user_name, email_id
    FROM dbo.um_user_dtls 
    WHERE user_type = 0 AND user_status = 1
    ORDER BY name ASC
  `);
  return result.rows;
}

export async function getOrgCurrencyForApprovers() {
  const result = await getPool().query(`
    SELECT currency FROM dbo.um_org_dtls WHERE entity_type = 'MAIN' LIMIT 1
  `);
  return result.rows[0]?.currency || "AED";
}

export async function getApproversPaginated(params: {
  page: number;
  limit: number;
  search?: string;
}) {
  const { page, limit, search } = params;
  const offset = (page - 1) * limit;

  let whereClause = "";
  let queryParams: any[] = [];

  if (search && search.trim()) {
    whereClause = `WHERE user_fullname ILIKE $1`;
    queryParams.push(`%${search.trim()}%`);
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_amt_based_apprs ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].total);

  const result = await getPool().query(`
    SELECT id, entity_type, from_amount, to_amount, user_fullname, user_id, currency, approve_id
    FROM dbo.am_amt_based_apprs
    ${whereClause}
    ORDER BY id
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `, [...queryParams, limit, offset]);

  return {
    data: result.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

export async function insertApprover(data: {
  entity_type: string;
  from_amount: number;
  to_amount: number;
  user_id: number;
  user_fullname: string;
  currency: string;
  approve_id?: string | null;
}) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_amt_based_apprs (entity_type, from_amount, to_amount, user_id, user_fullname, currency, approve_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
  `, [data.entity_type || 'ALL', data.from_amount || 0, data.to_amount || 0, data.user_id, data.user_fullname, data.currency || 'USD', data.approve_id || null]);
  return result.rows[0];
}

export async function updateApprover(id: string, data: {
  entity_type: string;
  from_amount: number;
  to_amount: number;
  user_id: number;
  user_fullname: string;
  currency: string;
  approve_id?: string | null;
}) {
  const result = await getPool().query(`
    UPDATE dbo.am_amt_based_apprs
    SET entity_type = $1, from_amount = $2, to_amount = $3, user_id = $4, user_fullname = $5, currency = $6, approve_id = $7
    WHERE id = $8 RETURNING *
  `, [data.entity_type, data.from_amount, data.to_amount, data.user_id, data.user_fullname, data.currency, data.approve_id, id]);
  return result.rows[0] || null;
}

export async function deleteApprover(id: string) {
  const result = await getPool().query(`
    DELETE FROM dbo.am_amt_based_apprs WHERE id = $1 RETURNING *
  `, [id]);
  return result.rows[0] || null;
}

export async function getOrgById(orgId: number) {
  const result = await getPool().query(`
    SELECT * FROM dbo.um_org_dtls WHERE id = $1
  `, [orgId]);
  return result.rows[0] || null;
}

export async function findUsersInRoleByEntity(
  roleName: string,
  entityId: number
) {
  const result = await getPool().query(`
    SELECT DISTINCT u.*
    FROM dbo.um_user_dtls u
    JOIN dbo.um_user_roles_map_dtls map
      ON map.user_id = u.id
    JOIN dbo.um_role_dtls r
      ON r.id = map.role_id
    WHERE r.role_name = $1
      AND u.org_id = $2
      AND u.user_status = 1
  `, [roleName, entityId]);

  return result.rows;
}
export async function getUsersByEmail(email: string) {
  const result = await getPool().query(
    `SELECT * from dbo.um_user_dtls where email_id = $1`, [email]
  )
  return result.rows || [];
}

export async function getUserByUsername(username: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.um_user_dtls WHERE user_name = $1 OR LOWER(email_id) = LOWER($1) LIMIT 1`,
    [username]
  );
  return result.rows[0] || null;
}

