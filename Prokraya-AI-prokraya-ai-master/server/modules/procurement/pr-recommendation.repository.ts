/**
 * Read-only queries backing the PR recommendation engine.
 *
 * These tables are not defined in Drizzle, so everything here is raw SQL against
 * the tenant pool. Several id columns are varchar where their master table's id
 * is integer (`am_budget_depart_map.dept_id`, `am_budget_location_map.loc_id`),
 * hence the explicit text casts.
 */

import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";

const getPool = () => getContextPool() ?? pool;

export interface ApprovedBudgetLineRow {
  budget_line_id: number;
  budget_master_id: number;
  budget_name: string | null;
  cost_centre_code: string | null;
  cost_centre_name: string | null;
  line_description: string | null;
  currency: string | null;
  business_entity_id: string | null;
  business_entity_name: string | null;
  approved_at: Date | null;
  departments: Array<{ id: string | null; name: string | null }> | null;
  locations: Array<{ id: string | null; name: string | null }> | null;
}

const APPROVED_BUDGET_LINE_SELECT = `
  SELECT
    bl.id                          AS budget_line_id,
    bm.id                          AS budget_master_id,
    bm.budget_name,
    bl.segment_dtl_code            AS cost_centre_code,
    bl.segment_dtl_name            AS cost_centre_name,
    bl.description                 AS line_description,
    bm.budget_curr                 AS currency,
    bm.business_entity::text       AS business_entity_id,
    bm.business_entity_name,
    appr.approved_at,
    COALESCE(dept.departments, '[]'::json) AS departments,
    COALESCE(loc.locations, '[]'::json)    AS locations
  FROM dbo.am_budget_lines bl
  JOIN dbo.am_budget_mst bm ON bm.id = bl.budget_mst_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', d.dept_id, 'name', d.dept_name) ORDER BY d.dept_name) AS departments
    FROM (SELECT DISTINCT dept_id, dept_name FROM dbo.am_budget_depart_map WHERE budget_line_id = bl.id) d
  ) dept ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', l.loc_id, 'name', l.loc_name) ORDER BY l.loc_name) AS locations
    FROM (SELECT DISTINCT loc_id, loc_name FROM dbo.am_budget_location_map WHERE budget_line_id = bl.id) l
  ) loc ON TRUE
  LEFT JOIN LATERAL (
    SELECT MAX(a.approved_date) AS approved_at
    FROM dbo.supp_regstr_appr_dtls a
    WHERE a.attribute_1 = 'BUDGET' AND a.object_id::text = bm.id::text
  ) appr ON TRUE
  WHERE bm.status = 'Approved'
`;

export async function listApprovedBudgetLines(): Promise<ApprovedBudgetLineRow[]> {
  const result = await getPool().query(
    `${APPROVED_BUDGET_LINE_SELECT} ORDER BY bm.budget_name, bl.segment_dtl_name`,
  );
  return result.rows;
}

export async function getApprovedBudgetLineById(
  budgetLineId: number,
): Promise<ApprovedBudgetLineRow | null> {
  const result = await getPool().query(`${APPROVED_BUDGET_LINE_SELECT} AND bl.id = $1`, [budgetLineId]);
  return result.rows[0] ?? null;
}

export interface PoHistoryQueryRow {
  po_number: string;
  creation_date: Date;
  po_required_date: Date;
  org_id: number | null;
  department_name: string | null;
  buyer: string | null;
  buyer_name: string | null;
  delivertto_location_id: string | null;
  delivertto_location_name: string | null;
}

/**
 * Approved POs containing a line that matches any of the item keys. `orgId` and
 * `departmentName` are optional so the primary search and the entity-agnostic
 * fallback share one statement.
 */
export async function findApprovedPoHistory(params: {
  itemIds: string[];
  categoryCodes: string[];
  namePatterns: string[];
  orgId?: number | null;
  departmentName?: string | null;
}): Promise<PoHistoryQueryRow[]> {
  const result = await getPool().query(
    `
    SELECT DISTINCT
      h.po_number,
      h.creation_date,
      h.po_required_date,
      h.org_id,
      h.department_name,
      h.buyer::text AS buyer,
      h.buyer_name,
      h.delivertto_location_id::text AS delivertto_location_id,
      h.delivertto_location_name
    FROM dbo.supp_po_header_dtls h
    JOIN dbo.supp_po_line_dtls l ON l.po_number = h.po_number
    WHERE h.po_status = 'Approved'
      AND h.creation_date IS NOT NULL
      AND h.po_required_date IS NOT NULL
      AND (
        l.item_id::text = ANY($1::text[])
        OR l.product_category::text = ANY($2::text[])
        OR l.item_name ILIKE ANY($3::text[])
        OR l.line_description ILIKE ANY($3::text[])
      )
      AND ($4::int IS NULL OR h.org_id = $4::int)
      AND ($5::text IS NULL OR LOWER(TRIM(h.department_name)) = LOWER(TRIM($5::text)))
    `,
    [
      params.itemIds,
      params.categoryCodes,
      params.namePatterns,
      params.orgId ?? null,
      params.departmentName ?? null,
    ],
  );
  return result.rows;
}

export interface BuyerCountRow {
  user_id: string;
  name: string | null;
  count: number;
}

/**
 * Buyer assignment counts derived from approved POs (`buyer`) and approved PRs
 * (`pr_owner_id`), since there is no dedicated assignment-history table.
 */
export async function getBuyerAssignmentCounts(orgId?: number | null): Promise<BuyerCountRow[]> {
  const result = await getPool().query(
    `
    SELECT user_id, MAX(name) AS name, SUM(n)::int AS count
    FROM (
      SELECT h.buyer::text AS user_id, MAX(h.buyer_name) AS name, COUNT(*)::int AS n
      FROM dbo.supp_po_header_dtls h
      WHERE h.po_status = 'Approved'
        AND h.buyer IS NOT NULL
        AND ($1::int IS NULL OR h.org_id = $1::int)
      GROUP BY h.buyer::text
      UNION ALL
      SELECT p.pr_owner_id::text, MAX(p.pr_owner_name), COUNT(*)::int
      FROM dbo.supp_pr_header_dtls p
      WHERE p.pr_status = 'Approved'
        AND p.pr_owner_id IS NOT NULL
        AND ($1::int IS NULL OR p.org_id = $1::int)
      GROUP BY p.pr_owner_id::text
    ) s
    GROUP BY user_id
    `,
    [orgId ?? null],
  );
  return result.rows;
}

export interface ActiveBuyerRow {
  user_id: number;
  name: string | null;
  email_id: string | null;
}

/** Active procurement managers and officers, optionally scoped to an entity. */
export async function getActiveBuyers(orgId?: number | null): Promise<ActiveBuyerRow[]> {
  const result = await getPool().query(
    `
    SELECT DISTINCT u.id AS user_id, u.name, u.email_id
    FROM dbo.um_user_dtls u
    JOIN dbo.um_user_roles_map_dtls urm ON urm.user_id = u.id
    JOIN dbo.um_role_dtls r ON r.id = urm.role_id
    LEFT JOIN dbo.um_user_org_map_dtls uom ON uom.user_id = u.id
    WHERE u.user_status = 1
      AND COALESCE(r.status, 1) = 1
      AND r.role_name IN ('ROLE_PROCUREMENT_MANAGER', 'ROLE_PROCUREMENT_OFFICER')
      AND ($1::int IS NULL OR uom.org_id = $1::int)
    ORDER BY u.name
    `,
    [orgId ?? null],
  );
  return result.rows;
}

export interface LocationRow {
  id: string;
  name: string | null;
}

export async function listEntityLocations(orgId: number): Promise<LocationRow[]> {
  const result = await getPool().query(
    `
    SELECT id::text AS id, location_name AS name
    FROM dbo.am_locations_mst
    WHERE org_id = $1::int
    ORDER BY location_name
    `,
    [orgId],
  );
  return result.rows;
}

export async function getUserDepartmentName(userId: number): Promise<string | null> {
  const result = await getPool().query(
    `SELECT department_name FROM dbo.um_user_dtls WHERE id = $1::int`,
    [userId],
  );
  return result.rows[0]?.department_name ?? null;
}
