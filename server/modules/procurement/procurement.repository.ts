import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
import * as formRepo from "../survey-form/surveyform.repository.ts";

const getPool = () => getContextPool() ?? pool;

export async function runQuery(sql: string, params: any[] = []) {
  return getPool().query(sql, params);
}

type PrRequisitionFilterParams = {
  status?: string;
  department?: string;
  search?: string;
  role?: string;
  orgid?: string;
  userDepartment?: string;
  userId: number;
  username?: string;
  readyForSourcing?: boolean;
};

export function buildPrRequisitionWhereClause(params: PrRequisitionFilterParams): {
  whereClause: string;
  queryParams: any[];
} {
  const { status, department, search, role, orgid, userDepartment, userId, username } = params;

  let statusArray: string[] = [];
  if (status && status.includes(",")) {
    statusArray = status.split(",").map((s) => s.trim());
  } else if (status && status !== "all") {
    statusArray = [status];
  }

  let whereClause = "";
  const queryParams: any[] = [];
  let paramIndex = 1;
  if (status && status !== "all") {
    if (statusArray.length > 0) {
      const patterns = statusArray.map((s: string) => `%${s}%`);
      whereClause += ` AND TRIM(pr_status) ILIKE ANY($${paramIndex++})`;
      queryParams.push(patterns);
    }
  }

  if (orgid && !("ROLE_SUPERADMIN" === role || "ROLE_SYSADMIN" === role)) {
    const orgIdArray = orgid
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id && !isNaN(Number(id)))
      .map((id) => Number(id));
    whereClause += ` AND ((org_id = ANY($${paramIndex++})`;
    queryParams.push(orgIdArray);
    

    if (userDepartment && !("ROLE_PROCUREMENT_OFFICER" === role || "ROLE_PROCUREMENT_MANAGER" === role)) {
      whereClause += ` AND department_name ILIKE $${paramIndex++}) OR (requestor_id = $${paramIndex++})  OR (attribute_10 ILIKE $${paramIndex++}))`;
      queryParams.push(`%${userDepartment}%`);
      queryParams.push(userId);
      queryParams.push(`%${username}%`);
    } 
    else if ("ROLE_PROCUREMENT_OFFICER" === role || "ROLE_PROCUREMENT_MANAGER" === role) {
      whereClause += `) AND (TRIM(pr_status) NOT IN ('Draft','More Info Required','Pending Approval') OR requestor_id = $${paramIndex++})  OR (attribute_10 ILIKE $${paramIndex++}))`;
      queryParams.push(userId);
      queryParams.push(`%${username}%`);
    }else {
      whereClause += `))`;
    }
  }

  if (
    ("ROLE_SUPERADMIN" === role ||
      "ROLE_SYSADMIN" === role ||
      "ROLE_PROCUREMENT_OFFICER" === role ||
      "ROLE_PROCUREMENT_MANAGER" === role) &&
    department
  ) {
    whereClause += ` AND department_name ILIKE $${paramIndex++}`;
    queryParams.push(`%${department}%`);
  }

  if (search) {
    whereClause += ` AND (
    pr_number ILIKE $${paramIndex} OR 
    pr_description ILIKE $${paramIndex} OR 
    requestor_name ILIKE $${paramIndex} OR 
    department_name ILIKE $${paramIndex} OR 
    pr_owner_name ILIKE $${paramIndex}
  )`;
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  if (params.readyForSourcing) {
    whereClause += ` AND bidno IS NULL AND (po_number IS NULL OR TRIM(po_number) = '')`;
  }

  return { whereClause, queryParams };
}

/**
 * True when `prNumber` is one of the requisitions this user can see on the Requisitions
 * page. Reuses the list's own WHERE clause so callers can never drift from what the page
 * shows — the superadmin/sysadmin bypass falls out of `buildPrRequisitionWhereClause`.
 */
export async function isPrVisibleToUser(
  prNumber: string,
  params: PrRequisitionFilterParams,
): Promise<boolean> {
  const { whereClause, queryParams } = buildPrRequisitionWhereClause(params);
  const result = await getPool().query(
    `SELECT 1 FROM dbo.supp_pr_header_dtls
     WHERE pr_number = $${queryParams.length + 1} ${whereClause}
     LIMIT 1`,
    [...queryParams, prNumber],
  );
  return result.rows.length > 0;
}

export async function getRequisitionExportLineRows(params: PrRequisitionFilterParams) {
  const { whereClause, queryParams } = buildPrRequisitionWhereClause(params);
  const result = await getPool().query(
    `SELECT 
      h.pr_number,
      h.pr_description,
      h.pr_status,
      h.pr_type,
      h.pr_amount AS header_pr_amount,
      h.currency AS header_currency,
      h.department_name,
      h.requestor_name,
      h.pr_owner_name,
      h.pr_created_date,
      h.delivery_date,
      h.delivertto_location_name,
      h.po_number,
      h.budget_name,
      pl.id AS line_id,
      pl.line_num AS line_number,
      pl.item_description AS line_item_description,
      pl.qty AS line_qty,
      pl.uom AS line_uom,
      pl.unit_cost AS line_unit_cost,
      pl.amount AS line_amount,
      pl.curr_code AS line_currency,
      pl.product_category_name AS line_category
    FROM dbo.supp_pr_line_dtls pl
    INNER JOIN dbo.supp_pr_header_dtls h ON h.pr_number = pl.pr_number
    WHERE h.pr_number IN (
      SELECT pr_number FROM dbo.supp_pr_header_dtls WHERE 1=1 ${whereClause}
    )
    ORDER BY h.pr_created_date DESC NULLS LAST, h.pr_number DESC, pl.line_num`,
    queryParams
  );
  return result.rows;
}

export async function getRequisitions(params: {
  status?: string;
  department?: string;
  search?: string;
  page: number;
  limit: number;
  role?: string;
  orgid?: string;
  userDepartment?: string;
  userId: number;
  username?: string;
  readyForSourcing?: boolean;
}) {
  const { status, department, search, page, limit, role, orgid, userDepartment, userId, username, readyForSourcing } = params;

  const offset = (page - 1) * limit;

  const { whereClause, queryParams } = buildPrRequisitionWhereClause({
    status,
    department,
    search,
    role,
    orgid,
    userDepartment,
    userId,
    username,
    readyForSourcing,
  });
  let paramIndex = queryParams.length + 1;

  const countResult = await getPool().query(
    `SELECT COUNT(*) FROM dbo.supp_pr_header_dtls WHERE 1=1 ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].count);

  let limitClause = "";
  if(limit !== 0){
    limitClause = ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit);
    queryParams.push(offset);
  }

  const result = await getPool().query(
    `SELECT 
      pr_number, pr_description, pr_status, pr_type, pr_amount, currency,
      department_name, requestor_name, pr_owner_name, pr_created_date, 
      approved_date, delivertto_location_name, delivery_date, po_number,
      notes, budget_name, budgeted, estimated_cost, creation_date, bidno, all_lines_have_po,
      (SELECT string_agg(id::text, ',' ORDER BY id) FROM dbo.cm_header
       WHERE project_ref_no = supp_pr_header_dtls.pr_number) AS contract_refs,
      (
        SELECT COUNT(*) > 0 AND COUNT(*) FILTER (WHERE pl.attribute_15 IS NULL OR pl.attribute_15 = '') = 0
        FROM dbo.supp_pr_line_dtls pl WHERE pl.pr_number = supp_pr_header_dtls.pr_number
      ) AS all_lines_have_contract
    FROM dbo.supp_pr_header_dtls
    WHERE 1=1 ${whereClause}
    ORDER BY pr_created_date DESC NULLS LAST, pr_number DESC
    ${limitClause}`,
    [...queryParams]
  );

  return { rows: result.rows, total };
}

export async function getCurrentApprover(prNumber: string, processName: string) {
  const result = await getPool().query(
    `SELECT u.name, si.current_assignee FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id 
    join dbo.um_user_dtls u on si.current_assignee = u.email_id
    where i.process_name = $2 and si.status = 'Ready'
    and si.ref_number = $1`,
    [prNumber, processName]
  );

  if(result.rows.length>0){
  return result.rows[0];
  }
  const result2 = await getPool().query(
    `SELECT si.current_assignee as name FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    where i.process_name = $2 and si.status = 'Ready'
    and si.ref_number = $1`,
    [prNumber, processName]
  );
  if(result2.rows.length>0){
    return result2.rows[0];
  }
  return null;
}

export async function getMaxPrSequence() {
  const maxResult = await getPool().query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(pr_number, '^.*_', '') AS INTEGER)), 0) as max_seq
     FROM dbo.supp_pr_header_dtls
     WHERE pr_number ~ '^.+_[0-9]+$'`
  );
  return maxResult.rows[0].max_seq || 0;
}

export async function getPrPrefixValue(): Promise<string> {
  const result = await getPool().query(
    `SELECT prefix_value FROM dbo.am_prefix_mst
     WHERE UPPER(TRIM(prefix_name)) IN ('PURCHASE REQUISITION', 'REQUISITION', 'PR')
     AND status = 'Active'
     LIMIT 1`
  );
  return result.rows[0]?.prefix_value?.trim() || 'PR';
}

export async function getUserById(userId: number) {
  const result = await getPool().query(
    `SELECT id, name, email_id, org_id, user_name, designation, department_name, attribute_12 FROM dbo.um_user_dtls WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function getDepartmentById(deptId: number) {
  const result = await getPool().query(
    `SELECT value FROM dbo.am_bussiness_seg_dtl WHERE id = $1`,
    [deptId]
  );
  return result.rows[0]?.value || null;
}

export async function getLocationById(locId: number) {
  const result = await getPool().query(
    `SELECT id, location_name FROM dbo.am_locations_mst WHERE id = $1`,
    [locId]
  );
  return result.rows[0] || null;
}

export async function getBudgetLineById(budgetId: number) {
  const result = await getPool().query(
    `SELECT bl.segment_dtl_id, bl.segment_dtl_name, bm.budget_name, bl.id
     FROM dbo.am_budget_lines bl
     JOIN dbo.am_budget_mst bm ON bl.budget_mst_id = bm.id
     WHERE bl.id = $1`,
    [budgetId]
  );
  return result.rows[0] || null;
}

export async function insertRequisition(params: {
  prNumber: string;
  description: string;
  deptName: string | null;
  reqId: number | null;
  reqName: string | null;
  reqEmail: string | null;
  ownerId: number | null;
  ownerName: string | null;
  ownerEmail: string | null;
  locId: number | null;
  locName: string | null;
  needByDate: Date | null;
  budName: string | null;
  budSegment: number | null;
  budgeted: boolean;
  currency: string;
  orgId: number | null;
  createdBy: string;
}) {
  await getPool().query(
    `INSERT INTO dbo.supp_pr_header_dtls (
      pr_number, pr_description, pr_status, pr_type,
      department_name, requestor_id, requestor_name, requestor_email,
      pr_owner_id, pr_owner_name, pr_owner_email,
      delivertto_location_id, delivertto_location_name, delivery_date,
      budget_name, budget_segment, budgeted, currency, pr_amount,
      pr_created_date, creation_date, org_id, created_by
    ) VALUES ($1, $2, 'Draft', 'STANDARD',
      $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 0,
      NOW(), NOW(), $17, $18)`,
    [
      params.prNumber, params.description,
      params.deptName, params.reqId, params.reqName, params.reqEmail,
      params.ownerId, params.ownerName, params.ownerEmail,
      params.locId, params.locName, params.needByDate,
      params.budName, params.budSegment, params.budgeted, params.currency,
      params.orgId, params.createdBy
    ]
  );
}

export async function getRequisitionStats(department?: any, userRole?: any, orgIds?: any, userId?: any, username?: any) {
  if ("ROLE_SUPERADMIN" === userRole || "ROLE_SYSADMIN" === userRole) {
    const result = await getPool().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE pr_status = 'Draft') as draft,
      COUNT(*) FILTER (WHERE pr_status = 'Pending Approval') as pending_approval,
      COUNT(*) FILTER (WHERE pr_status = 'Approved') as approved,
      COUNT(*) FILTER (WHERE pr_status = 'Complete') as complete,
      COUNT(*) FILTER (WHERE pr_status = 'Rejected') as rejected,
      COUNT(*) FILTER (WHERE pr_status = 'Cancelled') as cancelled,
      COUNT(*) FILTER (WHERE pr_status = 'More Info Required') as more_info_required,
      COALESCE(SUM(CASE WHEN pr_amount IS NOT NULL THEN pr_amount ELSE 0 END), 0) as total_value
    FROM dbo.supp_pr_header_dtls
  `);
    return result.rows[0];
  }
  else if ("ROLE_PROCUREMENT_OFFICER" === userRole || "ROLE_PROCUREMENT_MANAGER" === userRole) {
    const orgIdArray = Array.isArray(orgIds)
      ? orgIds
      : orgIds.includes(",")
        ? orgIds.split(",").filter((id: string) => id.trim() !== "").map((id: string) => parseInt(id.trim()))
        : [parseInt(orgIds)];

    const result = await getPool().query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE pr_status = 'Draft') as draft,
        COUNT(*) FILTER (WHERE pr_status = 'Pending Approval') as pending_approval,
        COUNT(*) FILTER (WHERE pr_status = 'Approved') as approved,
        COUNT(*) FILTER (WHERE pr_status = 'Complete') as complete,
        COUNT(*) FILTER (WHERE pr_status = 'Rejected') as rejected,
        COUNT(*) FILTER (WHERE pr_status = 'Cancelled') as cancelled,
        COUNT(*) FILTER (WHERE pr_status = 'More Info Required') as more_info_required,
        COALESCE(SUM(CASE WHEN pr_amount IS NOT NULL THEN pr_amount ELSE 0 END), 0) as total_value
      FROM dbo.supp_pr_header_dtls
      WHERE (org_id = ANY($1)
        AND (TRIM(pr_status) NOT IN ('Draft','More Info Required','Pending Approval') OR requestor_id = $2)) OR (attribute_10 ILIKE $3)
    `, [orgIdArray, userId, `%${username}%`]);
    return result.rows[0];
  }
  else {
    const orgIdArray = Array.isArray(orgIds)
      ? orgIds
      : orgIds.includes(",")
        ? orgIds.split(",").filter((id: string) => id.trim() !== "").map((id: string) => parseInt(id.trim()))
        : [parseInt(orgIds)];

    const result = await getPool().query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE pr_status = 'Draft') as draft,
        COUNT(*) FILTER (WHERE pr_status = 'Pending Approval') as pending_approval,
        COUNT(*) FILTER (WHERE pr_status = 'Approved') as approved,
        COUNT(*) FILTER (WHERE pr_status = 'Complete') as complete,
        COUNT(*) FILTER (WHERE pr_status = 'Rejected') as rejected,
        COUNT(*) FILTER (WHERE pr_status = 'Cancelled') as cancelled,
        COUNT(*) FILTER (WHERE pr_status = 'More Info Required') as more_info_required,
        COALESCE(SUM(CASE WHEN pr_amount IS NOT NULL THEN pr_amount ELSE 0 END), 0) as total_value
      FROM dbo.supp_pr_header_dtls
      WHERE (department_name = $1 and org_id = ANY($2)) or (requestor_id = $3) or (attribute_10 ILIKE $4)
    `, [department, orgIdArray, userId, `%${username}%`]);
    return result.rows[0];
  }
}

export async function getPrStatsByDepartment(userRole?: any, orgIds?: any, department?: any, userId?: any, username?: any) {
  const selectCols = `
      COALESCE(NULLIF(TRIM(department_name), ''), 'Unassigned') as department_name,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE pr_status = 'Draft') as draft,
      COUNT(*) FILTER (WHERE pr_status = 'Pending Approval') as pending_approval,
      COUNT(*) FILTER (WHERE pr_status = 'Approved') as approved,
      COUNT(*) FILTER (WHERE pr_status = 'Complete') as complete,
      COUNT(*) FILTER (WHERE pr_status = 'Rejected') as rejected,
      COUNT(*) FILTER (WHERE pr_status = 'Cancelled') as cancelled,
      COUNT(*) FILTER (WHERE pr_status = 'More Info Required') as more_info_required,
      COALESCE(SUM(CASE WHEN pr_amount IS NOT NULL THEN pr_amount ELSE 0 END), 0) as total_value`;
  const groupOrder = ` GROUP BY 1 ORDER BY COUNT(*) DESC, 1 ASC`;

  if ("ROLE_SUPERADMIN" === userRole || "ROLE_SYSADMIN" === userRole) {
    const result = await getPool().query(
      `SELECT ${selectCols} FROM dbo.supp_pr_header_dtls${groupOrder}`,
    );
    return result.rows;
  } else if ("ROLE_PROCUREMENT_OFFICER" === userRole || "ROLE_PROCUREMENT_MANAGER" === userRole) {
    const orgIdArray = Array.isArray(orgIds)
      ? orgIds
      : String(orgIds ?? "")
          .split(",")
          .filter((id: string) => id.trim() !== "")
          .map((id: string) => parseInt(id.trim()));
    const result = await getPool().query(
      `SELECT ${selectCols} FROM dbo.supp_pr_header_dtls
       WHERE (org_id = ANY($1)
         AND (TRIM(pr_status) NOT IN ('Draft','More Info Required','Pending Approval') OR requestor_id = $2))
          OR (attribute_10 ILIKE $3)${groupOrder}`,
      [orgIdArray, userId, `%${username}%`],
    );
    return result.rows;
  } else {
    const orgIdArray = Array.isArray(orgIds)
      ? orgIds
      : String(orgIds ?? "")
          .split(",")
          .filter((id: string) => id.trim() !== "")
          .map((id: string) => parseInt(id.trim()));
    const result = await getPool().query(
      `SELECT ${selectCols} FROM dbo.supp_pr_header_dtls
       WHERE (department_name = $1 AND org_id = ANY($2)) OR (requestor_id = $3) OR (attribute_10 ILIKE $4)${groupOrder}`,
      [department, orgIdArray, userId, `%${username}%`],
    );
    return result.rows;
  }
}

export async function getRequisitionByPrNumber(prNumber: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  return result.rows[0] || null;
}

export async function getRequisitionLines(prNumber: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_pr_line_dtls WHERE pr_number = $1 ORDER BY line_num`,
    [prNumber]
  );
  return result.rows;
}

/** PO numbers referenced on PR header (comma-separated) or line po_number fields. */
function parsePoNumbersFromField(poField: string | null | undefined): string[] {
  if (!poField || String(poField).trim() === "") return [];
  return String(poField)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** All POs created from or linked to this PR (by pr_number or header/line po_number refs). */
export async function getLinkedPurchaseOrdersForPr(prNumber: string) {
  const header = await getRequisitionByPrNumber(prNumber);
  const lines = await getRequisitionLines(prNumber);
  const poNumbers = new Set<string>();
  for (const p of parsePoNumbersFromField(header?.po_number)) {
    poNumbers.add(p);
  }
  for (const line of lines) {
    for (const p of parsePoNumbersFromField(line.po_number)) {
      poNumbers.add(p);
    }
  }

  const result = await getPool().query(
    `SELECT DISTINCT po_number, po_status
     FROM dbo.supp_po_header_dtls
     WHERE TRIM(COALESCE(pr_number, '')) = $1
        OR ($2::text[] IS NOT NULL AND cardinality($2::text[]) > 0 AND po_number = ANY($2::text[]))`,
    [prNumber, poNumbers.size > 0 ? Array.from(poNumbers) : null],
  );
  return result.rows as { po_number: string; po_status: string | null }[];
}

export async function getApprovalHistory(objectId: string) {
  const result = await getPool().query(
    `SELECT id, object_id, approver_id, approver_name, 
            attribute_9 as email, attribute_10 as designation, 
            status, comments, approved_date, requested_date, attribute_1
     FROM dbo.supp_regstr_appr_dtls 
     WHERE object_id = $1 
     ORDER BY approved_date ASC NULLS LAST, id ASC`,
    [objectId]
  );
  return result.rows;
}

export async function getPrStatusAndCurrency(prNumber: string) {
  const result = await getPool().query(
    `SELECT pr_status, currency FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  return result.rows[0] || null;
}

export async function getPrStatus(prNumber: string) {
  const result = await getPool().query(
    `SELECT pr_status FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  return result.rows[0] || null;
}

export async function getNextPrLineId() {
  const result = await getPool().query(
    `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_pr_line_dtls`
  );
  return result.rows[0].next_id;
}

export async function getNextPrLineNum(prNumber: string) {
  const result = await getPool().query(
    `SELECT COALESCE(MAX(line_num), 0) + 1 as next_line_num FROM dbo.supp_pr_line_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  return result.rows[0].next_line_num;
}

export async function getMaxPrLineId() {
  const result = await getPool().query(
    `SELECT COALESCE(MAX(id), 0) as max_id FROM dbo.supp_pr_line_dtls`
  );
  return result.rows[0].max_id;
}

export async function getMaxPrLineNum(prNumber: string) {
  const result = await getPool().query(
    `SELECT COALESCE(MAX(line_num), 0) as max_line_num FROM dbo.supp_pr_line_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  return result.rows[0].max_line_num;
}

export async function insertPrLine(params: {
  id: number;
  prNumber: string;
  lineNum: number;
  itemDescription: string;
  qty: number;
  uom: string;
  unitCost: number;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  itemId: string | null;
  currency: string;
}) {
  const result = await getPool().query(
    `INSERT INTO dbo.supp_pr_line_dtls 
     (id, pr_number, line_num, item_description, qty, uom, unit_cost, amount, product_category, product_category_name, item_id, curr_code, status, creation_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,'Draft', NOW())
     RETURNING *`,
    [
      params.id, params.prNumber, params.lineNum,
      params.itemDescription, params.qty, params.uom,
      params.unitCost, params.amount,
      params.categoryId, params.categoryName,
      params.itemId, params.currency
    ]
  );
  return result.rows[0];
}

export async function updatePrLine(params: {
  lineId: string;
  prNumber: string;
  itemDescription: string;
  qty: number;
  uom: string;
  unitCost: number;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  itemId: string | null;
  currency: string;
}) {
  const result = await getPool().query(
    `UPDATE dbo.supp_pr_line_dtls 
     SET item_description = $1, qty = $2, uom = $3, unit_cost = $4, amount = $5, 
         product_category = $6, product_category_name = $7, item_id = $8, 
         curr_code = $9, last_modified_date = NOW()
     WHERE id = $10 AND pr_number = $11
     RETURNING *`,
    [
      params.itemDescription, params.qty, params.uom,
      params.unitCost, params.amount,
      params.categoryId, params.categoryName,
      params.itemId, params.currency,
      params.lineId, params.prNumber
    ]
  );
  return result.rows[0] || null;
}

export async function getPrLineById(lineId: string | number, prNumber: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_pr_line_dtls WHERE id = $1 AND pr_number = $2`,
    [lineId, prNumber]
  );
  return result.rows[0] || null;
}

export async function deletePrLine(lineId: string, prNumber: string) {
  const result = await getPool().query(
    `DELETE FROM dbo.supp_pr_line_dtls WHERE id = $1 AND pr_number = $2 RETURNING *`,
    [lineId, prNumber]
  );
  return result.rows[0] || null;
}

export async function updatePrTotalAmount(prNumber: string) {
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls 
     SET pr_amount = (SELECT COALESCE(SUM(amount), 0) FROM dbo.supp_pr_line_dtls WHERE pr_number = $1),
         last_modified_date = NOW()
     WHERE pr_number = $1`,
    [prNumber]
  );
}

export async function updatePrTotalAmountOnly(prNumber: string) {
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls 
     SET pr_amount = (SELECT COALESCE(SUM(amount), 0) FROM dbo.supp_pr_line_dtls WHERE pr_number = $1)
     WHERE pr_number = $1`,
    [prNumber]
  );
}

export async function deleteAllPrLines(prNumber: string) {
  await getPool().query(
    `DELETE FROM dbo.supp_pr_line_dtls WHERE pr_number = $1`,
    [prNumber]
  );
}

export async function deleteRequisitionHeader(prNumber: string) {
  await getPool().query(
    `DELETE FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
    [prNumber]
  );
}

export async function updateRequisition(prNumber: string, params: {
  description: string | null;
  deptName: string | null;
  reqId: number | null;
  reqName: string | null;
  reqEmail: string | null;
  ownerId: number | null;
  ownerName: string | null;
  ownerEmail: string | null;
  locId: number | null;
  locName: string | null;
  needByDate: Date | null;
  budName: string | null;
  budSegment: number | null;
  budgeted: boolean;
  currency: string | null;
  orgId: number | null;
}) {
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET
      pr_description = $1,
      department_name = $2,
      requestor_id = $3,
      requestor_name = $4,
      requestor_email = $5,
      pr_owner_id = $6,
      pr_owner_name = $7,
      pr_owner_email = $8,
      delivertto_location_id = $9,
      delivertto_location_name = $10,
      delivery_date = $11,
      budget_name = $12,
      budget_segment = $13,
      budgeted = $14,
      currency = $15,
      org_id = $16,
      last_modified_date = NOW()
    WHERE pr_number = $17`,
    [
      params.description, params.deptName,
      params.reqId, params.reqName, params.reqEmail,
      params.ownerId, params.ownerName, params.ownerEmail,
      params.locId, params.locName, params.needByDate,
      params.budName, params.budSegment, params.budgeted, params.currency,
      params.orgId,
      prNumber
    ]
  );
}

export async function getRequisitionWithRequestorAndOrg(prNumber: string) {
  const result = await getPool().query(
    `SELECT pr.*, u.name as requestor_name, u.email_id as requestor_email, pr.department_name,
            org.organization_name
     FROM dbo.supp_pr_header_dtls pr
     LEFT JOIN dbo.um_user_dtls u ON pr.requestor_id::text = u.id::text
     LEFT JOIN dbo.um_org_dtls org ON pr.org_id::text = org.id::text
     WHERE pr.pr_number = $1`,
    [prNumber]
  );
  return result.rows[0] || null;
}

export async function getPrLineCount(prNumber: string) {
  const result = await getPool().query(
    `SELECT COUNT(*) as count FROM dbo.supp_pr_line_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  return parseInt(result.rows[0].count);
}

export async function updatePrStatusAndApprovers(prNumber: string, params: {
  status: string;
  taskId: string;
  approversList: string;
  lastModifiedBy: string;
}) {
  await getPool().query(`
    UPDATE dbo.supp_pr_header_dtls SET
      pr_status = $1,
      attribute_12 = $2,
      approvers_list = $3,
      last_modified_date = NOW(),
      last_modified_by = $4
    WHERE pr_number = $5
  `, [params.status, params.taskId, params.approversList, params.lastModifiedBy, prNumber]);
}

export async function updatePrLinesStatus(prNumber: string, status: string) {
  await getPool().query(`
    UPDATE dbo.supp_pr_line_dtls SET status = $1 WHERE pr_number = $2
  `, [status, prNumber]);
}

export async function updatePrTaskId(prNumber: string, taskId: string, username: string) {
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET attribute_12 = $1,attribute_10 = $3 WHERE pr_number = $2`,
    [taskId, prNumber, username]
  );
}

export async function updatePrStatus(prNumber: string, status: string,approversList: string) {
  if(approversList ==='na')
  {  
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET pr_status = $1 WHERE pr_number = $2`,
    [status, prNumber]
  );
}
else
{
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET pr_status = $1, attribute_10 = $3 WHERE pr_number = $2`,
    [status, prNumber, approversList]
  );
}
}

export async function updateLinkedBidsPrCancelled(prNumber: string) {
  await getPool().query(
    `UPDATE dbo.supp_bid_dtls SET attribute_15 = 'PR Cancelled' WHERE pr_number = $1`,
    [prNumber]
  );
}

export async function deleteLinkedBidsByBidId(bidId: string) {
  await getPool().query(
    `UPDATE dbo.supp_bid_dtls SET status = 'Deleted', attribute_15 = 'PR Cancelled' WHERE id = $1`,
    [bidId]
  );
}

export async function getLinkedBidsByPrNumber(prNumber: string) {
  const result = await getPool().query(
    `SELECT id,status FROM dbo.supp_bid_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  return result.rows;
}

export async function updatePrRejected(prNumber: string, comments: string, approversList: string) {
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET 
       pr_status = 'Rejected', 
       attribute_5 = $1, 
       approvers_list = NULL,
       attribute_10 = $3 
     WHERE pr_number = $2`,
    [comments, prNumber, approversList]
  );
}

export async function updatePrApproversList(prNumber: string, approversList: string) {
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET approvers_list = $1 WHERE pr_number = $2`,
    [approversList, prNumber]
  );
}

export async function updatePrLastModified(prNumber: string, username: string) {
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET 
       last_modified_by = $1, 
       last_modified_date = NOW() 
     WHERE pr_number = $2`,
    [username, prNumber]
  );
}

export async function getNextApprovalId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_regstr_appr_dtls`);
  return result.rows[0].next_id;
}

export async function insertApprovalHistory(params: {
  objectId: string;
  comments: string;
  approverId: number;
  approverName: string;
  email: string;
  designation: string;
  status: string;
  requestedDate: Date;
  attributeType: string;
  createdBy: string;
}) {

  await getPool().query(`
    INSERT INTO dbo.supp_regstr_appr_dtls 
    ( object_id, supplier_id, comments, approver_id, approver_name, 
     attribute_9, attribute_10, status, requested_date, approved_date, 
     attribute_1, created_by, creation_date)
    VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, NOW())
  `, [
   params.objectId, params.comments,
    params.approverId, params.approverName,
    params.email, params.designation,
    params.status, params.requestedDate,
    params.attributeType, params.createdBy
  ]);
}

export async function getTaskCreationDate(taskId: string) {
  try {
    const result = await getPool().query(
      `SELECT create_time_ FROM dbo.act_ru_task WHERE id_ = $1`,
      [taskId]
    );
    return result.rows[0]?.create_time_ || null;
  } catch {
    return null;
  }
}

export async function getUserRoles(userId: number) {
  const result = await getPool().query(`
    SELECT r.role_name 
    FROM dbo.um_role_dtls r
    JOIN dbo.um_user_roles_map_dtls urm ON r.id = urm.role_id
    WHERE urm.user_id = $1
  `, [userId]);
  return result.rows.map(r => r.role_name);
}

export async function getPrDepartments() {
  const result = await getPool().query(`
    SELECT DISTINCT department_name 
    FROM dbo.supp_pr_header_dtls 
    WHERE department_name IS NOT NULL 
    ORDER BY department_name
  `);
  return result.rows.map(r => r.department_name);
}

export async function getRequisitionDocuments(prNumber: string) {
  const result = await getPool().query(`
    SELECT id, file_name, file_path, attach_source, 
           created_by, created_date, last_modified_by, last_modified_date
    FROM dbo.am_collaboration_attachment_dtls 
    WHERE attach_source = 'PR' AND entity_id = $1
    ORDER BY created_date DESC
  `, [prNumber]);
  return result.rows;
}

export async function insertRequisitionDocument(prNumber: string, fileName: string, filePath: string, createdBy: string) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_collaboration_attachment_dtls (
      id, attach_source, entity_id, file_name, file_path, 
      created_by, created_date, last_modified_by, last_modified_date
    ) VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_collaboration_attachment_dtls),
      'PR', $1, $2, $3, $4, NOW(), $4, NOW()
    )
    RETURNING id
  `, [prNumber, fileName, filePath, createdBy]);
  return result.rows[0].id;
}

export async function deleteRequisitionDocument(docId: string, prNumber: string) {
  await getPool().query(`
    DELETE FROM dbo.am_collaboration_attachment_dtls
    WHERE id = $1 AND attach_source = 'PR' AND entity_id = $2
  `, [docId, prNumber]);
}

export async function getCollaborationDocumentById(docId: string) {
  const result = await getPool().query(
    `SELECT id, file_name, file_path FROM dbo.am_collaboration_attachment_dtls WHERE id = $1`,
    [docId]
  );
  return result.rows[0] || null;
}

export async function getRequisitionNotes(prNumber: string) {
  const result = await getPool().query(`
    SELECT notes FROM dbo.supp_pr_header_dtls WHERE pr_number = $1
  `, [prNumber]);
  return result.rows[0]?.notes || '';
}

export async function updateRequisitionNotes(prNumber: string, notes: string) {
  await getPool().query(`
    UPDATE dbo.supp_pr_header_dtls SET notes = $1, last_modified_date = NOW() WHERE pr_number = $2
  `, [notes, prNumber]);
}

export async function getRequisitionComments(prNumber: string) {
  const result = await getPool().query(`
    SELECT id, comments, created_by, created_by_name, creation_date, 
           reviewer, reviewer_name, section, from_action
    FROM dbo.am_collaboration_dtl 
    WHERE entity_id = $1 AND type = 'PR'
    ORDER BY creation_date DESC
  `, [prNumber]);
  return result.rows;
}

export async function insertRequisitionComment(prNumber: string, comments: string, createdBy: string, createdByName: string) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_collaboration_dtl (
      id, entity_id, type, comments, created_by, created_by_name, 
      creation_date, last_updated_by, last_updated_date
    ) VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_collaboration_dtl),
      $1, 'PR', $2, $3, $4, NOW(), $3, NOW()
    )
    RETURNING id
  `, [prNumber, comments, createdBy, createdByName]);
  return result.rows[0].id;
}

export async function deleteRequisitionComment(commentId: string, prNumber: string) {
  await getPool().query(`
    DELETE FROM dbo.am_collaboration_dtl 
    WHERE id = $1 AND entity_id = $2 AND type = 'PR'
  `, [commentId, prNumber]);
}

// PO Collaboration - Documents
export async function getPoDocuments(poNumber: string) {
  const result = await getPool().query(`
    SELECT id, file_name, file_path, attach_source, 
           created_by, created_date, last_modified_by, last_modified_date
    FROM dbo.am_collaboration_attachment_dtls 
    WHERE attach_source = 'PO' AND entity_id = $1
    ORDER BY created_date DESC
  `, [poNumber]);
  return result.rows;
}

export async function insertPoDocument(poNumber: string, fileName: string, filePath: string, createdBy: string) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_collaboration_attachment_dtls (
      id, attach_source, entity_id, file_name, file_path, 
      created_by, created_date, last_modified_by, last_modified_date
    ) VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_collaboration_attachment_dtls),
      'PO', $1, $2, $3, $4, NOW(), $4, NOW()
    )
    RETURNING id
  `, [poNumber, fileName, filePath, createdBy]);
  return result.rows[0].id;
}

export async function deletePoDocument(docId: string, poNumber: string) {
  await getPool().query(`
    DELETE FROM dbo.am_collaboration_attachment_dtls 
    WHERE id = $1 AND attach_source = 'PO' AND entity_id = $2
  `, [docId, poNumber]);
}

// PO Collaboration - Comments
export async function getPoComments(poNumber: string) {
  const result = await getPool().query(`
    SELECT id, comments, created_by, created_by_name, creation_date, 
           reviewer, reviewer_name, section, from_action
    FROM dbo.am_collaboration_dtl 
    WHERE entity_id = $1 AND (type = 'PO' OR type IS NULL OR type = '')
    ORDER BY creation_date DESC
  `, [poNumber]);
  return result.rows;
}

export async function insertPoComment(poNumber: string, comments: string, createdBy: string, createdByName: string) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_collaboration_dtl (
      id, entity_id, type, comments, created_by, created_by_name, 
      creation_date, last_updated_by, last_updated_date
    ) VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_collaboration_dtl),
      $1, 'PO', $2, $3, $4, NOW(), $3, NOW()
    )
    RETURNING id
  `, [poNumber, comments, createdBy, createdByName]);
  return result.rows[0].id;
}

export async function deletePoComment(commentId: string, poNumber: string) {
  await getPool().query(`
    DELETE FROM dbo.am_collaboration_dtl 
    WHERE id = $1 AND entity_id = $2 AND type = 'PO'
  `, [commentId, poNumber]);
}

export async function getPrForAiAssisted(prNumber: string) {
  const result = await getPool().query(
    `SELECT pr_description, department_name, pr_status, currency 
     FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  return result.rows[0] || null;
}

export async function getPoStats(supplierFilter: string, params: any[], userRole?: any, orgIds?: any, department?: any, id?: any, username?: any) {
  if ("ROLE_SUPERADMIN" === userRole || "ROLE_SYSADMIN" === userRole) {
    const result = await getPool().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE po_status = 'Draft') as draft,
      COUNT(*) FILTER (WHERE po_status = 'Pending Approval') as pending_approval,
      COUNT(*) FILTER (WHERE po_status = 'Approved') as approved,
      COUNT(*) FILTER (WHERE po_status = 'Complete') as complete,
      COUNT(*) FILTER (WHERE po_status = 'Closed') as closed,
      COUNT(*) FILTER (WHERE po_status = 'Rejected') as rejected,
      COUNT(*) FILTER (WHERE po_status = 'Cancelled') as cancelled,
      COUNT(*) FILTER (WHERE po_status = 'More Info Required') as more_info_required,
      COUNT(*) FILTER (WHERE pr_number IS NULL) as non_sourcing,
      COUNT(*) FILTER (WHERE pr_number IS NOT NULL) as sourcing,
      COALESCE(SUM(po_total_cost), 0) as total_value
    FROM dbo.supp_po_header_dtls`);
    return result.rows[0];
  }
  else if ("ROLE_PROCUREMENT_OFFICER" === userRole || "ROLE_PROCUREMENT_MANAGER" === userRole) {
    const orgIdArray = Array.isArray(orgIds)
      ? orgIds
      : orgIds.includes(",")
        ? orgIds.split(",").filter((id: string) => id.trim() !== "").map((id: string) => parseInt(id.trim()))
        : [parseInt(orgIds)];
    const result = await getPool().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE po_status = 'Draft') as draft,
      COUNT(*) FILTER (WHERE po_status = 'Pending Approval') as pending_approval,
      COUNT(*) FILTER (WHERE po_status = 'Approved') as approved,
      COUNT(*) FILTER (WHERE po_status = 'Complete') as complete,
      COUNT(*) FILTER (WHERE po_status = 'Closed') as closed,
      COUNT(*) FILTER (WHERE po_status = 'Rejected') as rejected,
      COUNT(*) FILTER (WHERE po_status = 'Cancelled') as cancelled,
      COUNT(*) FILTER (WHERE po_status = 'More Info Required') as more_info_required,
      COUNT(*) FILTER (WHERE pr_number IS NULL) as non_sourcing,
      COUNT(*) FILTER (WHERE pr_number IS NOT NULL) as sourcing,
      COALESCE(SUM(po_total_cost), 0) as total_value
    FROM dbo.supp_po_header_dtls where org_id = ANY($1) or (attribute_1 ILIKE $2)
  `, [orgIdArray, `%${username}%`]);
    return result.rows[0];
  }
  else if (supplierFilter) {
    const result = await getPool().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE po_status = 'Draft') as draft,
      COUNT(*) FILTER (WHERE po_status = 'Pending Approval') as pending_approval,
      COUNT(*) FILTER (WHERE po_status = 'Approved') as approved,
      COUNT(*) FILTER (WHERE po_status = 'Complete') as complete,
      COUNT(*) FILTER (WHERE po_status = 'Closed') as closed,
      COUNT(*) FILTER (WHERE po_status = 'Rejected') as rejected,
      COUNT(*) FILTER (WHERE po_status = 'Cancelled') as cancelled,
      COUNT(*) FILTER (WHERE po_status = 'More Info Required') as more_info_required,
      COUNT(*) FILTER (WHERE pr_number IS NULL) as non_sourcing,
      COUNT(*) FILTER (WHERE pr_number IS NOT NULL) as sourcing,
      COALESCE(SUM(po_total_cost), 0) as total_value
    FROM dbo.supp_po_header_dtls
    ${supplierFilter}
  `, [...params]);
    return result.rows[0];
  }
  else {
    const orgIdArray = Array.isArray(orgIds)
      ? orgIds
      : orgIds.includes(",")
        ? orgIds.split(",").filter((id: string) => id.trim() !== "").map((id: string) => parseInt(id.trim()))
        : [parseInt(orgIds)];
    const result = await getPool().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE po_status = 'Draft') as draft,
      COUNT(*) FILTER (WHERE po_status = 'Pending Approval') as pending_approval,
      COUNT(*) FILTER (WHERE po_status = 'Approved') as approved,
      COUNT(*) FILTER (WHERE po_status = 'Complete') as complete,
      COUNT(*) FILTER (WHERE po_status = 'Closed') as closed,
      COUNT(*) FILTER (WHERE po_status = 'Rejected') as rejected,
      COUNT(*) FILTER (WHERE po_status = 'Cancelled') as cancelled,
      COUNT(*) FILTER (WHERE po_status = 'More Info Required') as more_info_required,
      COUNT(*) FILTER (WHERE pr_number IS NULL) as non_sourcing,
      COUNT(*) FILTER (WHERE pr_number IS NOT NULL) as sourcing,
      COALESCE(SUM(po_total_cost), 0) as total_value
    FROM dbo.supp_po_header_dtls where (department_name = $1 and org_id = ANY($3)) or (attribute_1 ILIKE $4) or (po_owner_id =$2)
    `, [department, id,orgIdArray, `%${username}%`]);
    return result.rows[0];
  }
}

export async function getPoStatsByDepartment(userRole?: any, orgIds?: any, department?: any, id?: any, username?: any) {
  const selectCols = `
      COALESCE(NULLIF(TRIM(department_name), ''), 'Unassigned') as department_name,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE po_status = 'Draft') as draft,
      COUNT(*) FILTER (WHERE po_status = 'Pending Approval') as pending_approval,
      COUNT(*) FILTER (WHERE po_status = 'Approved') as approved,
      COUNT(*) FILTER (WHERE po_status = 'Complete') as complete,
      COUNT(*) FILTER (WHERE po_status = 'Closed') as closed,
      COUNT(*) FILTER (WHERE po_status = 'Rejected') as rejected,
      COUNT(*) FILTER (WHERE po_status = 'Cancelled') as cancelled,
      COUNT(*) FILTER (WHERE po_status = 'More Info Required') as more_info_required,
      COALESCE(SUM(po_total_cost), 0) as total_value`;
  const groupOrder = ` GROUP BY 1 ORDER BY COUNT(*) DESC, 1 ASC`;

  if ("ROLE_SUPERADMIN" === userRole || "ROLE_SYSADMIN" === userRole) {
    const result = await getPool().query(
      `SELECT ${selectCols} FROM dbo.supp_po_header_dtls${groupOrder}`,
    );
    return result.rows;
  } else if ("ROLE_PROCUREMENT_OFFICER" === userRole || "ROLE_PROCUREMENT_MANAGER" === userRole) {
    const orgIdArray = Array.isArray(orgIds)
      ? orgIds
      : orgIds.includes(",")
        ? orgIds.split(",").filter((id: string) => id.trim() !== "").map((id: string) => parseInt(id.trim()))
        : [parseInt(orgIds)];
    const result = await getPool().query(
      `SELECT ${selectCols} FROM dbo.supp_po_header_dtls WHERE org_id = ANY($1) OR (attribute_1 ILIKE $2)${groupOrder}`,
      [orgIdArray, `%${username}%`],
    );
    return result.rows;
  } else {
    const orgIdArray = Array.isArray(orgIds)
      ? orgIds
      : orgIds.includes(",")
        ? orgIds.split(",").filter((id: string) => id.trim() !== "").map((id: string) => parseInt(id.trim()))
        : [parseInt(orgIds)];
    const result = await getPool().query(
      `SELECT ${selectCols} FROM dbo.supp_po_header_dtls WHERE (department_name = $1 AND org_id = ANY($3)) OR (attribute_1 ILIKE $4) OR (po_owner_id = $2)${groupOrder}`,
      [department, id, orgIdArray, `%${username}%`],
    );
    return result.rows;
  }
}

export async function getPurchaseOrders(params: {
  paramIndex: number;
  limit: number;
  offset: number;
  whereClause: string;
  queryParams: any[];
  username: string;
}) {
  const countResult = await getPool().query(
    `SELECT COUNT(*) FROM dbo.supp_po_header_dtls ${params.whereClause}`,
    params.queryParams
  );
  const total = parseInt(countResult.rows[0].count);

  let limitClause = "";
  if(params.limit !== 0){
    params.queryParams.push(params.limit);
    params.queryParams.push(params.offset);
    limitClause = ` LIMIT $${params.queryParams.length -1} OFFSET $${params.queryParams.length}`;
  }
  
  const result = await getPool().query(
    `SELECT 
      po_number, po_description, po_status, po_type,
      po_total_cost, po_currency, department_name,
      buyer_name, po_owner_name, creation_date,
      po_issue_date, po_required_date, delivertto_location_name,
      pr_number, budget_name, supplier_id, company_name
    FROM dbo.supp_po_header_dtls 
    ${params.whereClause} 
    ORDER BY creation_date DESC, po_number DESC
    ${limitClause}`,
     [...params.queryParams]
  );

  return { rows: result.rows, total };
}

export async function getPoExportLineRows(whereClause: string, queryParams: readonly any[]) {
  const result = await getPool().query(
    `SELECT 
      h.po_number,
      h.po_description,
      h.po_status,
      h.po_type,
      h.po_total_cost,
      h.po_currency,
      h.department_name,
      h.buyer_name,
      h.po_owner_name,
      h.creation_date,
      h.po_issue_date,
      h.po_required_date,
      h.delivertto_location_name,
      h.pr_number,
      h.budget_name,
      h.company_name,
      pl.id AS line_id,
      pl.po_line_number AS line_number,
      pl.line_description AS line_description,
      pl.line_qty,
      pl.line_unit_cost,
      pl.line_unit,
      pl.tax_rate,
      pl.tax_amount,
      pl.line_cost,
      pl.item_name,
      pl.line_status
    FROM dbo.supp_po_line_dtls pl
    INNER JOIN dbo.supp_po_header_dtls h ON h.po_number = pl.po_number
    WHERE h.po_number IN (
      SELECT po_number FROM dbo.supp_po_header_dtls ${whereClause}
    )
    ORDER BY h.creation_date DESC, h.po_number DESC, pl.po_line_number`,
    [...queryParams]
  );
  return result.rows;
}

export async function getPoPrefixAndIncrement() {
  const prefixResult = await getPool().query(
    `SELECT prefix_value FROM dbo.am_prefix_mst
     WHERE UPPER(TRIM(prefix_name)) IN ('PURCHASE ORDER', 'PO')
     AND status = 'Active'
     LIMIT 1`
  );
  const prefix = prefixResult.rows[0]?.prefix_value?.trim() || 'PO';

  const maxResult = await getPool().query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(po_number, '^.*_', '') AS INTEGER)), 0) as max_seq
     FROM dbo.supp_po_header_dtls
     WHERE po_number ~ '^.+_[0-9]+$'`
  );
  const maxSeq = maxResult.rows[0].max_seq || 0;
  return `${prefix}_${String(maxSeq + 1).padStart(5, "0")}`;
}

export async function getLocLocationById(locationId: string) {
  const result = await getPool().query(
    `SELECT location_name FROM dbo.am_locations_mst WHERE id = $1`,
    [locationId]
  );
  return result.rows[0]?.location_name || "";
}

export async function insertPurchaseOrder(params: {
  poNumber: string;
  description: string;
  poType: string;
  supplierId: string | null;
  supplierName: string | null;
  buyerId: string | null;
  buyerName: string | null;
  requestorId: string | null;
  requestorName: string | null;
  departmentName: string;
  currency: string;
  deliveryLocation: string | null;
  locationName: string;
  requiredDate: string | null;
  budgetName: string | null;
  budgetSegment: string | null;
  paymentTermsId: string | null;
  paymentTermsName: string | null;
  advanceFlag: string;
  advancePercentage: number | null;
  createdBy: string;
  orgId: number | 0;
  buyerEmail: string | null;
  requestorEmail: string | null;
}) 
{
  const formId = await formRepo.getActiveFromId();
  let id = 0;
  if(formId)
  {
    id = formId.id
  }
  await getPool().query(
    `INSERT INTO dbo.supp_po_header_dtls (
      po_number, po_description, po_type, po_status,
      supplier_id, company_name,
      buyer, buyer_name,
      po_owner_id, po_owner_name,
      department_name, po_currency,
      delivertto_location_id, delivertto_location_name,
      po_required_date, creation_date, po_issue_date,
      budget_name, budget_segment, po_payment_terms_id, payment_terms_name,
      advance_flag, advance_percentage, created_by, buyer_email, po_owner_email, org_id,attribute_4
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW(), 
     $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,$26)`,
    [
      params.poNumber, params.description, params.poType, "Draft",
      params.supplierId, params.supplierName,
      params.buyerId, params.buyerName,
      params.requestorId, params.requestorName,
      params.departmentName, params.currency,
      params.deliveryLocation, params.locationName,
      params.requiredDate,
      params.budgetName, params.budgetSegment, params.paymentTermsId, params.paymentTermsName,
      params.advanceFlag, params.advancePercentage, params.createdBy, params.buyerEmail, params.requestorEmail,
      params.orgId || null,
      id
    ]
  );
}

export async function getPoByNumber(poNumber: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_po_header_dtls WHERE po_number = $1`,
    [poNumber]
  );
  return result.rows[0] || null;
}

export async function getPoLines(poNumber: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_po_line_dtls WHERE po_number = $1 ORDER BY po_line_number`,
    [poNumber]
  );
  return result.rows;
}

export async function getPoLineById(lineId: string | number, poNumber: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_po_line_dtls WHERE id = $1 AND po_number = $2`,
    [lineId, poNumber]
  );
  return result.rows[0] || null;
}

export async function getSupplierBasicInfo(supplierId: string) {
  const result = await getPool().query(
    `SELECT id, company_name as supplier_name, email_id, phone, address_1, city, country 
     FROM dbo.supp_basic_org_dtls WHERE id = $1`,
    [supplierId]
  );
  return result.rows[0] || null;
}

export async function getDeliveryNotes(poNumber: string) {
  const result = await getPool().query(
    `SELECT id, asn_number, po_number, status, ship_date, expected_arrival_date, 
            carrier, ship_from, ship_to, supplier_id, creation_date, bill_of_landing
     FROM dbo.supp_delivery_hdr_dtls 
     WHERE po_number = $1 
     ORDER BY creation_date DESC`,
    [poNumber]
  );
  return result.rows;
}

export async function getGrns(poNumber: string) {
  const result = await getPool().query(
    `SELECT maximo_grn_id, receiptnum, po_number, po_line_number, item_name, item_desc,
            received_qty, received_unit, received_cost, received_date, received_by_name, 
            status, tax_amount, currency_code,
            supp_receipt_no, attribute_10, attribute_11, 
            to_store_loc, delivertto_location_id, wms_id,
            requested_by, loaded_qty, loaded_cost, order_qty, order_cost,attribute_15
     FROM dbo.supp_po_grn_line_dtls 
     WHERE po_number = $1 
     ORDER BY received_date DESC`,
    [poNumber]
  );
  return result.rows;
}

export async function updateTaxIncluded(poNumber: string, taxIncluded: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET tax_included = $1 WHERE po_number = $2`,
    [taxIncluded, poNumber]
  );
}

export async function updateGrns(grnId: number, data: {
  status: string;
  attribute_9: string | null;
}) {
  await getPool().query(
    `UPDATE dbo.supp_po_grn_line_dtls SET status = $1, attribute_9 = $2 WHERE maximo_grn_id = $3`,
    [data.status, data.attribute_9, grnId]
  );
}

export async function getInvoices(poNumber: string) {
  const result = await getPool().query(
    `SELECT id, invoice_number, po_number, invoice_amount, invoice_curr_code, 
            invoice_date, inv_due_date, invoice_status, supplier_name, tax_amount, submitted_by, 
            creation_date, inv_payment_status, description, invoice_type
     FROM dbo.supp_invoice_dtls 
     WHERE po_number = $1 
     ORDER BY creation_date DESC`,
    [poNumber]
  );
  return result.rows;
}

export async function getReceiptsForInvoice(poNumber: string) {
  const result = await getPool().query(
    `SELECT g.maximo_grn_id, g.receiptnum, g.po_number, g.po_line_number, g.item_name,
            g.order_qty, g.received_qty, g.received_cost, g.loaded_cost,
            g.tax_rate, g.tax_rate_code, g.tax_amount,
            g.received_date, g.received_by_name, g.attribute_9, g.status,g.item_type,g.attribute_15
     FROM dbo.supp_po_grn_line_dtls g
     WHERE g.po_number = $1 
       AND g.status = 'Received'
       AND (g.attribute_9 IS NULL OR g.attribute_9 NOT IN ('Invoiced', 'Invoice Submitted'))
     ORDER BY g.received_date DESC`,
    [poNumber]
  );
  return result.rows;
}

export async function getReceiptsForInvoiceById(invoiceNumber: string) {
  const result = await getPool().query(
    `SELECT g.*
     FROM dbo.supp_po_grn_line_dtls g
     WHERE g.invoice_num = $1`,
    [invoiceNumber]
  );
  return result.rows;
}

export async function getNextInvoiceNumber(orgId: number): Promise<string> {
  const prefixResult = await getPool().query(
    `SELECT attribute_1, prefix_value FROM dbo.am_prefix_mst WHERE prefix_name = 'INVOICE' AND status = 'Active' LIMIT 1`
  );

  const prefixValue = prefixResult.rows[0]?.prefix_value?.trim() || 'INV';
  let lastNum = `${prefixValue}250000`;
  if (prefixResult.rows.length > 0 && prefixResult.rows[0].attribute_1) {
    lastNum = prefixResult.rows[0].attribute_1;
  }

  const prefix = lastNum.replace(/\d+$/, '');
  const numPart = parseInt(lastNum.replace(/^\D+/, ''), 10);
  const nextNum = numPart + 1;
  const nextInvoiceNumber = `${prefix}${nextNum.toString().padStart(lastNum.replace(/^\D+/, '').length, '0')}`;

  await getPool().query(
    `UPDATE dbo.am_prefix_mst SET attribute_1 = $1 WHERE prefix_name = 'INVOICE' AND status = 'Active'`,
    [nextInvoiceNumber]
  );

  return nextInvoiceNumber;
}

export async function createInvoice(data: {
  po_number: string;
  invoice_number: string;
  invoice_description: string;
  invoice_type: string;
  invoice_date: string;
  invoice_due_date: string;
  invoice_amount: number;
  tax_amount: number;
  supplier_id: number;
  supplier_name: string;
  org_id: number;
  created_by: string;
  submitted_by: string;
  payment_terms_id?: number;
  payment_terms_name?: string;
  currency_code?: string;
  invoice_notes?: string;
  bank_account_no?: string;
  department?: string;
  department_name?: string;
  budget_name?: string;
  budget_segment?: string;
  cost_center_name?: string;
  external_po_number?: string;
  site_id?: string;
  buyer?: string;
}, receiptLines: Array<{
  maximo_grn_id: number;
  receiptnum: string;
  po_line_number: string;
  item_name: string;
  item_type: string;
  order_qty: number;
  received_qty: number;
  received_cost: number;
  loaded_cost: number;
  tax_rate: number;
  tax_rate_code: string;
  tax_amount: number;
  received_date: string;
  received_by_name: string;
  product_category: string;
  product_category_name: string;
  attribute_15: string;
}>, documents?: Array<{ fileName: string; filePath: string; createdBy: string; docUri?: Buffer | null }>) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    let prefix: string;
    const prefixInvoice = await client.query(
        `SELECT prefix_value FROM dbo.am_prefix_mst
     WHERE UPPER(TRIM(prefix_name)) IN ('INVOICE', 'INV')
     AND status = 'Active'
     LIMIT 1`
    );
    prefix = prefixInvoice.rows[0]?.prefix_value?.trim() || 'INV';
    const seq = await client.query(`SELECT nextval('dbo.supp_invoice_id_seq')::int AS id`);
    const id = seq.rows[0].id;
    const invoiceId = `${prefix}_${String(id).padStart(5, "0")}`;

    const vendorInvoiceNumber = data.invoice_number.toUpperCase().trim();

    await client.query(
      `INSERT INTO dbo.supp_invoice_dtls (
        id, invoice_number, po_number, description, invoice_type,
        invoice_date, inv_due_date, invoice_amount, tax_amount,
        supplier_id, supplier_name, org_id,
        created_by, creation_date, submitted_by,
        invoice_status, inv_payment_status, invoice_source,
        payment_terms_id, payment_terms_name,
        invoice_curr_code, attribute_4,
        last_modified_by, last_modified_date, invoice_notes,
        gl_date, department, department_name,
        budget_name, budget_segment, cost_center_name,
        bond_doc_path, site_id, bank_account_no,
        object_version_number, batch_id
      ) VALUES (
        $1, $2, $3, $4, 'STANDARD',
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, NOW(), $13,
        'Draft', 'Not Paid', 'EXTERNAL',
        $14, $15,
        $16, $2,
        $12, NOW(), $17,
        NOW(), $18, $19,
        $20, $21, $22,
        $23, $24, $25,
        0, 0
      )`,
      [
        invoiceId, vendorInvoiceNumber, data.po_number, data.invoice_description,
        data.invoice_date, data.invoice_due_date, data.invoice_amount, data.tax_amount,
        data.supplier_id, data.supplier_name, data.org_id,
        data.created_by, data.submitted_by,
        data.payment_terms_id || null, data.payment_terms_name || null,
        data.currency_code || 'AED',
        data.invoice_notes || null,
        data.department || null, data.department_name || null,
        data.budget_name || null, data.budget_segment || null, data.cost_center_name || null,
        data.external_po_number || null, data.site_id || null, data.bank_account_no || null,
      ]
    );

    if (documents && documents.length > 0) {
      for (const doc of documents) {
        const docId = Math.floor(Math.random() * (2000000000 - 100000000)) + 100000000;
        await client.query(
          `INSERT INTO dbo.supp_document_dtls (
            id, doc_no, doc_name, doc_type, doc_value, doc_desc,
            doc_path, filename, status, record_type, supplier_id,
            doc_uri, created_by, creation_date, last_modified_by, last_modified_date,
            object_version_number
          ) VALUES (
            $1,
            $2, 'Invoice Document', 'INVOICE_DOC', $3, 'Supplier Invoice Doc',
            $4, $5, 'Active', 'SUPP_INVOICE', $6,
            $7, $8, NOW(), $8, NOW(),
            0
          )`,
          [docId, invoiceId.toString(), vendorInvoiceNumber, doc.filePath, doc.fileName, data.supplier_id, doc.docUri || null, doc.createdBy]
        );
      }
    }

    let lineNumber = 0;
    const receiptNumbers: string[] = [];

    for (const line of receiptLines) {
      lineNumber++;
      const nextLineIdResult = await client.query(
        `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_invoice_line_dtls`
      );
      const lineId = nextLineIdResult.rows[0].next_id;

      await client.query(
        `INSERT INTO dbo.supp_invoice_line_dtls (
          id, invoice_id, po_number, po_line_number, line_number,
          item_name, order_qty, order_cost, order_unit_cost,
          receipt_num, rcv_txn_id, receipt_line_num,
          received_by, received_date, goods_recieved_by,
          tax_rate, tax_rate_code, tax_amount, taxable_flag,
          line_status, match_type, line_source,
          created_by, creation_date, org_id,
          last_modified_by, last_modified_date,item_type,product_category,product_category_name,
          object_version_number,attribute_15
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          $16, $17, $18, 'Y',
          'Invoice Submitted', 'PO', 'EXTERNAL',
          $19, NOW(), $20,
          $19, NOW(),
          $21, $22, $23, 0, $24
        )`,
        [
          lineId, invoiceId, data.po_number, line.po_line_number, lineNumber,
          line.item_name, line.received_qty, line.received_cost, line.received_cost / (line.received_qty || 1),
          line.receiptnum, line.maximo_grn_id.toString(), line.po_line_number,
          line.received_by_name, line.received_date, line.received_by_name,
          line.tax_rate || 0, line.tax_rate_code || null, line.tax_amount || 0,
          data.created_by, data.org_id,
          line.item_type || 'ITEM', line.product_category || null, line.product_category_name || null,
          line.attribute_15 || null
        ]
      );

      receiptNumbers.push(line.receiptnum);

      await client.query(
        `UPDATE dbo.supp_po_grn_line_dtls 
         SET attribute_9 = 'Invoice Submitted', 
             invoice_num = $1, 
             invoice_line_id = $2,
             status = 'Invoice Submitted',
             last_modified_by = $3, 
             last_modified_date = NOW()
         WHERE maximo_grn_id = $4`,
        [vendorInvoiceNumber, lineId, data.created_by, line.maximo_grn_id]
      );
    }

    await client.query(
      `UPDATE dbo.supp_invoice_dtls 
       SET attribute_9 = $1
       WHERE id = $2`,
      [receiptNumbers.join(','), invoiceId]
    );

    await client.query(
      `UPDATE dbo.supp_po_header_dtls
       SET attribute_9 = CASE
           WHEN ABS((COALESCE(invoiced_amount, 0) + $1) - COALESCE(po_total_cost, 0)) < 0.01 THEN 'Invoiced'
           ELSE 'Partially Invoiced'
       END,
           invoiced_amount = COALESCE(invoiced_amount, 0) + $1,
           last_modified_by = $2,
           last_modified_date = NOW()
       WHERE po_number = $3`,
      [data.invoice_amount, data.created_by, data.po_number]
    );

    await client.query('COMMIT');
    return {
      invoice_id: invoiceId,
      invoice_number: vendorInvoiceNumber,
      invoice_description: data.invoice_description,
      vendor_invoice_number: vendorInvoiceNumber,
      supplier_name: data.supplier_name,
      po_number: data.po_number,
      org_id: data.org_id,
      department_name: data.department_name || null,
      buyer: data.buyer || null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateInvoiceForApproval(invoiceId: string, updates: {
  invoice_status: string;
  attribute_12?: string;
  attribute_1?: string;
  attribute_14?: string;
  invoice_approvers?: string;
  last_modified_by: string;
}) {
  await getPool().query(
    `UPDATE dbo.supp_invoice_dtls 
     SET invoice_status = $1,
         attribute_12 = $2,
         attribute_1 = $3,
         attribute_14 = $4,
         invoice_approvers = $5,
         last_modified_by = $6,
         last_modified_date = NOW()
     WHERE id = $7`,
    [
      updates.invoice_status,
      updates.attribute_12 || null,
      updates.attribute_1 || null,
      updates.attribute_14 || null,
      updates.invoice_approvers || null,
      updates.last_modified_by,
      invoiceId,
    ]
  );
}

export async function getPoNotes(poNumber: string) {
  const result = await getPool().query(
    `SELECT po_notes as notes FROM dbo.supp_po_header_dtls WHERE po_number = $1`,
    [poNumber]
  );
  return result.rows[0] || null;
}

export async function updatePoNotes(poNumber: string, notes: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET po_notes = $1 WHERE po_number = $2`,
    [notes, poNumber]
  );
}

export async function getPoStatus(poNumber: string) {
  const result = await getPool().query(
    `SELECT po_status FROM dbo.supp_po_header_dtls WHERE po_number = $1`,
    [poNumber]
  );
  return result.rows[0] || null;
}

export async function updatePo(poNumber: string, description: string, requiredDate: string | null, notes: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls 
     SET po_description = $1, po_required_date = $2, po_notes = $3 
     WHERE po_number = $4`,
    [description, requiredDate || null, notes, poNumber]
  );
}

export async function updatePoFull(poNumber: string, params: {
  description: string;
  deliveryLocation: string | null;
  locationName: string;
  requiredDate: string | null;
  requestorId: string | null;
  requestorName: string | null;
  departmentName: string;
  supplierId: string | null;
  supplierName: string | null;
  currency: string;
  budgetName: string | null;
  paymentTermsId: string | null;
  paymentTermsName: string | null;
  notes: string | null;
  advanceFlag: string;
  advancePercentage: number | null;
  orgId: number | null;
  budgetId: string | null;
}) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls
     SET po_description = $1,
         delivertto_location_id = $2, delivertto_location_name = $3,
         po_required_date = $4,
         po_owner_id = $5, po_owner_name = $6,
         department_name = $7,
         supplier_id = $8, company_name = $9,
         po_currency = $10,
         budget_name = $11,
         po_payment_terms_id = $12, payment_terms_name = $13,
         po_notes = $14,
         advance_flag = $15, advance_percentage = $16,
         org_id = $17, budget_segment = $18
     WHERE po_number = $19`,
    [
      params.description,
      params.deliveryLocation, params.locationName,
      params.requiredDate,
      params.requestorId, params.requestorName,
      params.departmentName,
      params.supplierId, params.supplierName,
      params.currency,
      params.budgetName,
      params.paymentTermsId, params.paymentTermsName,
      params.notes,
      params.advanceFlag, params.advancePercentage,
      params.orgId || null,
      params.budgetId || null,
      poNumber,
    ]
  );
}

export async function deletePoLines(poNumber: string) {
  await getPool().query(
    `DELETE FROM dbo.supp_po_line_dtls WHERE po_number = $1`,
    [poNumber]
  );
}

export async function deletePoHeader(poNumber: string) {
  await getPool().query(
    `DELETE FROM dbo.supp_po_header_dtls WHERE po_number = $1`,
    [poNumber]
  );
}

export async function updatePoStatus(poNumber: string, status: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET po_status = $1 WHERE po_number = $2`,
    [status, poNumber]
  );
}

export async function getPoWithCreatorAndOrg(poNumber: string) {
  const result = await getPool().query(
    `SELECT po.*, u.name as creator_name, u.email_id as creator_email, po.department_name as dept_name,
            org.organization_name
     FROM dbo.supp_po_header_dtls po
     LEFT JOIN dbo.um_user_dtls u ON po.created_by::text = u.id::text
     LEFT JOIN dbo.um_org_dtls org ON po.org_id::text = org.id::text
     WHERE po.po_number = $1`,
    [poNumber]
  );
  return result.rows[0] || null;
}

export async function updatePoTaskId(poNumber: string, taskId: string,username:string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET attribute_12 = $1, attribute_1 = $2 WHERE po_number = $3`,
    [taskId, username, poNumber]
  );
}

export async function updatePoRejected(poNumber: string, comments: string, approversList: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET 
       po_status = 'Rejected', 
       attribute_5 = $1,
       attribute_1 = $3
     WHERE po_number = $2`,
    [comments, poNumber, approversList]
  );
}

export async function updatePoLinesStatus(poNumber: string, status: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_line_dtls SET line_status = $1 WHERE po_number = $2`,
    [status, poNumber]
  );
}

export async function insertPoApprovalHistory(params: {
  objectId: string;
  supplierId?: number;
  comments: string;
  approverId: number;
  approverName: string;
  approverEmail?: string;
  approverDesignation?: string;
  status: string;
  requestedDate?: Date | null;
}) {

  await getPool().query(`
    INSERT INTO dbo.supp_regstr_appr_dtls 
    (object_id, supplier_id, comments, approver_id, approver_name, 
     attribute_9, attribute_10, status, requested_date, approved_date, attribute_1)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, 'PO')
  `, [
    params.objectId,
    params.supplierId || 0,
    params.comments,
    params.approverId,
    params.approverName,
    params.approverEmail || null,
    params.approverDesignation || null,
    params.status,
    params.requestedDate || new Date(),
  ]);
}

export async function updatePoApprovedFields(poNumber: string, username: string, approvers: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET 
       po_status = 'Approved', 
       attribute_8 = 'Not Received', 
       attribute_9 = 'Not Invoiced', 
       attribute_10 = 'Not Paid',
       last_modified_by = $1, 
       last_modified_date = NOW(),
       attribute_1 = $3 
     WHERE po_number = $2`,
    [username, poNumber, approvers]
  );
}

export async function updatePoIssueDate(poNumber: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET po_issue_date = NOW() WHERE po_number = $1`,
    [poNumber]
  );
}

export async function updatePoReservedAmount(poNumber: string, reservedAmount: number, username: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET 
       attribute_11 = $1,
       last_modified_by = $2, 
       last_modified_date = NOW()
     WHERE po_number = $3`,
    [String(reservedAmount), username, poNumber]
  );
}

export async function getBudgetLineWithMaster(budgetLineId: number) {
  const result = await getPool().query(
    `SELECT bl.*, bm.budget_curr as budget_currency, bm.id as budget_mst_id
     FROM dbo.am_budget_lines bl
     LEFT JOIN dbo.am_budget_mst bm ON bl.budget_mst_id = bm.id
     WHERE bl.id = $1`,
    [budgetLineId]
  );
  return result.rows[0] || null;
}

export async function getBudgetPeriodAmounts(budgetLineId: number) {
  const result = await getPool().query(
    `SELECT bpa.*, pl.start_date, pl.end_date
     FROM dbo.am_budget_period_amts_map bpa
     LEFT JOIN dbo.am_period_lines pl ON bpa.period_line_id::int = pl.id
     WHERE bpa.budget_line_id = $1`,
    [budgetLineId]
  );
  return result.rows;
}

export async function updateBudgetPeriodReservedAmount(periodMapId: number, reservedAmount: number) {
  await getPool().query(
    `UPDATE dbo.am_budget_period_amts_map SET reserved_amount = $1 WHERE id = $2`,
    [reservedAmount, periodMapId]
  );
}

export async function updateBudgetLineReservedAmount(budgetLineId: number, reservedAmount: number) {
  await getPool().query(
    `UPDATE dbo.am_budget_lines SET reserved_amount = $1 WHERE id = $2`,
    [reservedAmount, budgetLineId]
  );
}

export async function updateBudgetMstReservedAmount(budgetMstId: number) {
  await getPool().query(
    `UPDATE dbo.am_budget_mst SET reserved_amount = (
       SELECT COALESCE(SUM(COALESCE(reserved_amount, 0)), 0) 
       FROM dbo.am_budget_lines WHERE budget_mst_id = $1
     ) WHERE id = $1`,
    [budgetMstId]
  );
}

export async function addBudgetMstReservedAmount(budgetMstId: number, amount: number) {
  // Total budget_amount stays fixed; available = budget_amount - consumed - reserved
  await getPool().query(
    `UPDATE dbo.am_budget_mst 
     SET reserved_amount = COALESCE(reserved_amount, 0) + $1
     WHERE id = $2
     RETURNING id, budget_amount, reserved_amount, consumed_amount`,
    [amount, budgetMstId]
  );
}

/**
 * Reserve budget when PR Approved or Direct PO created.
 * reserved_amount += amount (total budget_amount unchanged).
 */
export async function reserveBudgetAmount(budgetMstId: number, amount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_mst 
     SET reserved_amount = COALESCE(reserved_amount, 0) + $1
     WHERE id = $2
     RETURNING id, budget_amount, reserved_amount, consumed_amount`,
    [amount, budgetMstId]
  );
  return result.rows[0] || null;
}

/**
 * Move budget from reserved to consumed on partial invoice payment
 * reserved_amount -= paid_amount
 * consumed_amount += paid_amount
 */
export async function moveReservedToConsumedOnPartialPayment(budgetMstId: number, paidAmount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_mst 
     SET reserved_amount = COALESCE(reserved_amount, 0) - $1,
         consumed_amount = COALESCE(consumed_amount, 0) + $1
     WHERE id = $2
     RETURNING id, budget_amount, reserved_amount, consumed_amount`,
    [paidAmount, budgetMstId]
  );
  return result.rows[0] || null;
}

/**
 * Move all remaining reserved budget to consumed on full invoice payment
 * reserved_amount -= remaining_reserved
 * consumed_amount += remaining_reserved
 */
export async function moveReservedToConsumedOnFullPayment(budgetMstId: number, fullyPaidAmount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_mst 
     SET reserved_amount = COALESCE(reserved_amount, 0) - $1,
         consumed_amount = COALESCE(consumed_amount, 0) + $1
     WHERE id = $2
     RETURNING id, budget_amount, reserved_amount, consumed_amount`,
    [fullyPaidAmount, budgetMstId]
  );
  return result.rows[0] || null;
}

/**
 * Release unused reserved budget on PO Closed (underspend).
 * reserved_amount -= unused_amount (total budget_amount unchanged).
 */
export async function releaseBudgetOnPOClosed(budgetMstId: number, unusedAmount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_mst 
     SET reserved_amount = COALESCE(reserved_amount, 0) - $1
     WHERE id = $2
     RETURNING id, budget_amount, reserved_amount, consumed_amount`,
    [unusedAmount, budgetMstId]
  );
  return result.rows[0] || null;
}

/**
 * Release reserved budget on PO Cancelled.
 * reserved_amount -= cancelled_amount (total budget_amount unchanged).
 */
export async function releaseBudgetOnPOCancelled(budgetMstId: number, cancelledAmount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_mst 
     SET reserved_amount = COALESCE(reserved_amount, 0) - $1
     WHERE id = $2
     RETURNING id, budget_amount, reserved_amount, consumed_amount`,
    [cancelledAmount, budgetMstId]
  );
  return result.rows[0] || null;
}

// ===== BUDGET LINE LEVEL FUNCTIONS =====

/**
 * Reserve budget on line level (PR Approved or Direct PO).
 * reserved_amount += amount (line amount / total allocation unchanged).
 */
export async function reserveBudgetLineAmount(budgetLineId: number, amount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_lines 
     SET reserved_amount = COALESCE(reserved_amount, 0) + $1
     WHERE id = $2
     RETURNING id, amount, reserved_amount, consumed_amount`,
    [amount, budgetLineId]
  );
  return result.rows[0] || null;
}

/**
 * Move budget from reserved to consumed on partial invoice payment (line level)
 * reserved_amount -= paid_amount
 * consumed_amount += paid_amount
 */
export async function moveReservedToConsumedLineOnPartialPayment(budgetLineId: number, paidAmount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_lines 
     SET reserved_amount = COALESCE(reserved_amount, 0) - $1,
         consumed_amount = COALESCE(consumed_amount, 0) + $1
     WHERE id = $2
     RETURNING id, amount, reserved_amount, consumed_amount`,
    [paidAmount, budgetLineId]
  );
  return result.rows[0] || null;
}

/**
 * Move all remaining reserved budget to consumed on full invoice payment (line level)
 * reserved_amount -= remaining_reserved
 * consumed_amount += remaining_reserved
 */
export async function moveReservedToConsumedLineOnFullPayment(budgetLineId: number, fullyPaidAmount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_lines 
     SET reserved_amount = COALESCE(reserved_amount, 0) - $1,
         consumed_amount = COALESCE(consumed_amount, 0) + $1
     WHERE id = $2
     RETURNING id, amount, reserved_amount, consumed_amount`,
    [fullyPaidAmount, budgetLineId]
  );
  return result.rows[0] || null;
}

/**
 * Release unused reserved budget on PO Closed (underspend) - line level
 * reserved_amount -= unused_amount
 */
export async function releaseBudgetLineOnPOClosed(budgetLineId: number, unusedAmount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_lines 
     SET reserved_amount = COALESCE(reserved_amount, 0) - $1
     WHERE id = $2
     RETURNING id, amount, reserved_amount, consumed_amount`,
    [unusedAmount, budgetLineId]
  );
  return result.rows[0] || null;
}

/**
 * Release all reserved budget on PO Cancelled - line level
 * reserved_amount -= cancelled_amount
 */
export async function releaseBudgetLineOnPOCancelled(budgetLineId: number, cancelledAmount: number) {
  const result = await getPool().query(
    `UPDATE dbo.am_budget_lines 
     SET reserved_amount = COALESCE(reserved_amount, 0) - $1
     WHERE id = $2
     RETURNING id, amount, reserved_amount, consumed_amount`,
    [cancelledAmount, budgetLineId]
  );
  return result.rows[0] || null;
}

export async function getBudgetMstIdFromLineId(budgetLineId: number) {
  const result = await getPool().query(
    `SELECT budget_mst_id FROM dbo.am_budget_lines WHERE id = $1`,
    [budgetLineId]
  );
  return result.rows[0]?.budget_mst_id || null;
}

export async function getBudgetMstIdsFromLineIds(budgetLineIds: number[]) {
  if (!budgetLineIds || budgetLineIds.length === 0) return [];
  const result = await getPool().query(
    `SELECT DISTINCT budget_mst_id FROM dbo.am_budget_lines WHERE id = ANY($1)`,
    [budgetLineIds]
  );
  return result.rows.map((r: any) => r.budget_mst_id);
}

export async function getBudgetCurrencyFromMstId(budgetMstId: number) {
  const result = await getPool().query(
    `SELECT budget_curr FROM dbo.am_budget_mst WHERE id = $1`,
    [budgetMstId]
  );
  return result.rows[0]?.budget_curr || null;
}

export async function moveBudgetFromReservedToConsumed(budgetMstId: number, amount: number) {
  await getPool().query(
    `UPDATE dbo.am_budget_mst SET 
       reserved_amount = COALESCE(reserved_amount, 0) - $1,
       consumed_amount = COALESCE(consumed_amount, 0) + $1
     WHERE id = $2`,
    [amount, budgetMstId]
  );
}

export async function getBudgetMstIdFromPoNumber(poNumber: string) {
  const result = await getPool().query(
    `SELECT bl.budget_mst_id 
     FROM dbo.supp_po_header_dtls po
     LEFT JOIN dbo.am_budget_lines bl ON CAST(bl.id AS VARCHAR) = po.budget_segment
     WHERE po.po_number = $1`,
    [poNumber]
  );
  return result.rows[0]?.budget_mst_id || null;
}

export async function getExchangeRate(fromCurrency: string, toCurrency: string) {
  const result = await getPool().query(
    `SELECT conversion_rate FROM dbo.am_exchange_rate_mst 
     WHERE from_currency = $1 AND to_currency = $2
     ORDER BY conversion_date DESC NULLS LAST, creation_date DESC NULLS LAST, id DESC
     LIMIT 1`,
    [fromCurrency, toCurrency]
  );
  return result.rows[0] || null;
}

export async function updatePoMoreInfoRequired(poNumber: string, username: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET 
       po_status = 'More Info Required',
       last_modified_by = $1,
       last_modified_date = NOW()
     WHERE po_number = $2`,
    [username, poNumber]
  );
}

export async function updatePoResubmit(poNumber: string, username: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET 
       po_status = 'Pending Approval',
       last_modified_by = $1,
       last_modified_date = NOW()
     WHERE po_number = $2`,
    [username, poNumber]
  );
}

export async function getNextPoLineNumber(poNumber: string) {
  const result = await getPool().query(
    `SELECT COALESCE(MAX(CAST(po_line_number AS INTEGER)), 0) + 1 as next_line 
     FROM dbo.supp_po_line_dtls WHERE po_number = $1`,
    [poNumber]
  );
  return result.rows[0].next_line;
}

export async function getNextPoLineId() {
  const result = await getPool().query(
    `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_po_line_dtls`
  );
  return result.rows[0].next_id;
}

export async function insertPoLine(params: {
  id: number;
  poNumber: string;
  lineNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
  uom: string;
  taxRate: number;
  taxAmount: number;
  lineCost: number;
  itemId: string | null;
  itemName: string | null;
  categoryCode: number | null;
  categoryName: string | null;
  discount: number;
  taxCode: string | null;
  taxId: string | null;
}) {
  const result = await getPool().query(
    `INSERT INTO dbo.supp_po_line_dtls 
     (id, po_number, po_line_number, line_description, line_qty, line_unit_cost, line_unit, tax_rate, tax_amount, line_cost, line_status, item_id, item_name, product_category, product_category_name, discount, tax_rate_code,attribute_15)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', $11, $12, $13, $14, $15, $16,$17)
     RETURNING id`,
    [params.id, params.poNumber, params.lineNumber, params.description, params.quantity, params.unitPrice, params.uom, params.taxRate, params.taxAmount, params.lineCost, params.itemId, params.itemName, params.categoryCode, params.categoryName, params.discount, params.taxCode,params.taxId]
  );
  return result.rows[0].id;
}

export async function updatePoLine(params: {
  lineId: string;
  poNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
  uom: string;
  taxRate: number;
  taxAmount: number;
  lineCost: number;
  itemId: string | null;
  itemName: string | null;
  categoryCode: number | null;
  categoryName: string | null;
  discount: number;
  taxCode: string | null;
  taxId: string | null;
}) {
  await getPool().query(
    `UPDATE dbo.supp_po_line_dtls 
     SET line_description = $1, line_qty = $2, line_unit_cost = $3, line_unit = $4, 
         tax_rate = $5, tax_amount = $6, line_cost = $7, item_id = $8, item_name = $9,
         product_category = $10, product_category_name = $11, discount = $12, tax_rate_code = $13,attribute_15=$14
     WHERE id = $15 AND po_number = $16`,
    [params.description, params.quantity, params.unitPrice, params.uom, params.taxRate, params.taxAmount, params.lineCost, params.itemId, params.itemName, params.categoryCode, params.categoryName, params.discount, params.taxCode,params.taxId ,params.lineId, params.poNumber]
  );
}

export async function updatePoLineValues(lineId: string, params: {
  taxAmount: number;
  lineCost: number;
  unitPrice: number;
}) {
  await getPool().query(
    `UPDATE dbo.supp_po_line_dtls SET tax_amount = $1, line_cost = $2, line_unit_cost = $3 WHERE id = $4`,
    [params.taxAmount, params.lineCost, params.unitPrice, lineId]
  );
}

export async function updatePoForSubmission(poNumber: string, params: {
  status: string;
  taskId: string;
  approversList: string;
  lastModifiedBy: string;
}) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls 
     SET po_status = $1, 
         attribute_12 = $2, 
         approvers_list = $3,
         last_modified_by = $4, 
         last_modified_date = NOW()
     WHERE po_number = $5`,
    [
      params.status,
      params.taskId,
      params.approversList,
      params.lastModifiedBy,
      poNumber,
    ]
  );
}

export async function updatePoApproversList(poNumber: string, approversList: string) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls 
     SET approvers_list = $1, 
         last_modified_date = NOW()
     WHERE po_number = $2`,
    [approversList, poNumber]
  );
}

export async function deletePoLine(lineId: string, poNumber: string) {
  await getPool().query(
    `DELETE FROM dbo.supp_po_line_dtls WHERE id = $1 AND po_number = $2`,
    [lineId, poNumber]
  );
}

export async function getPoLinesForDN(poNumber: string) {
  const result = await getPool().query(
    `SELECT pol.id, pol.po_line_number, pol.item_name, pol.line_qty, 
            COALESCE(pol.recieved_qty, 0) as received_qty,
            pol.line_unit, pol.line_description,
            COALESCE(dn_totals.total_dn_qty, 0) as total_dn_qty
     FROM dbo.supp_po_line_dtls pol
     LEFT JOIN (
       SELECT dl.po_line_number, SUM(dl.qty) as total_dn_qty
       FROM dbo.supp_delivery_line_dtls dl
       WHERE dl.po_number = $1
       GROUP BY dl.po_line_number
     ) dn_totals ON dn_totals.po_line_number = pol.po_line_number
     WHERE pol.po_number = $1 
     ORDER BY pol.po_line_number`,
    [poNumber]
  );
  return result.rows.map((row: any) => {
    const lineQty = Number(row.line_qty) || 0;
    const totalDnQty = Number(row.total_dn_qty) || 0;
    return {
      ...row,
      item_name: row.item_name || row.line_description || "-",
      line_qty: lineQty,
      received_qty: totalDnQty,
      pending_qty: Math.max(0, lineQty - totalDnQty),
    };
  });
}

export async function getDeliveryLinesByDeliveryId(deliveryId: number) {
  const result = await getPool().query(
    `SELECT id, delivery_id, po_line_number, item_name, qty, uom, description, po_number, status, creation_date
     FROM dbo.supp_delivery_line_dtls 
     WHERE delivery_id = $1 
     ORDER BY po_line_number`,
    [deliveryId]
  );
  return result.rows;
}

export async function checkAsnUnique(asnNumber: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT COUNT(*) as cnt FROM dbo.supp_delivery_hdr_dtls WHERE LOWER(TRIM(asn_number)) = LOWER(TRIM($1))`,
    [asnNumber]
  );
  return Number(result.rows[0].cnt) === 0;
}

export async function createDeliveryNote(data: {
  asn_number: string;
  bill_of_landing?: string;
  carrier: string;
  ship_date: string;
  expected_arrival_date: string;
  ship_to: string;
  ship_from: string;
  po_number: string;
  supplier_id: number;
  created_by: string;
  site_id?: number;
}, lines: Array<{
  po_line_number: string;
  item_name: string;
  qty: number;
  uom: string;
  description?: string;
  po_number: string;
}>) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // ASN uniqueness validation (matches Java logic)
    const asnCheck = await client.query(
      `SELECT COUNT(*) as cnt FROM dbo.supp_delivery_hdr_dtls WHERE LOWER(TRIM(asn_number)) = LOWER(TRIM($1))`,
      [data.asn_number]
    );
    if (Number(asnCheck.rows[0].cnt) > 0) {
      throw { status: 400, message: "ASN Number must be unique!" };
    }

    // Get PO lines for quantity validation
    const poLinesResult = await client.query(
      `SELECT po_line_number, item_name, line_description, line_qty, COALESCE(recieved_qty, 0) as recieved_qty, line_unit
       FROM dbo.supp_po_line_dtls WHERE po_number = $1`,
      [data.po_number]
    );
    const poLinesMap = new Map<string, any>();
    for (const row of poLinesResult.rows) {
      poLinesMap.set(String(row.po_line_number), row);
    }

    const hdrIdResult = await client.query(
      `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_delivery_hdr_dtls`
    );
    const hdrId = hdrIdResult.rows[0].next_id;

    await client.query(
      `INSERT INTO dbo.supp_delivery_hdr_dtls 
        (id, asn_number, bill_of_landing, carrier, ship_date, expected_arrival_date, 
         ship_to, ship_from, po_number, supplier_id, status, created_by, creation_date, 
         last_modified_by, last_modified_date, site_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Pending', $11, NOW(), $12, NOW(), $13)`,
      [
        hdrId,
        data.asn_number,
        data.bill_of_landing || null,
        data.carrier,
        data.ship_date,
        data.expected_arrival_date,
        data.ship_to,
        data.ship_from,
        data.po_number,
        data.supplier_id,
        data.created_by,
        data.created_by,
        data.site_id || null,
      ]
    );
    const deliveryId = hdrId;

    for (const line of lines) {
      const poLine = poLinesMap.get(String(line.po_line_number));
      if (!poLine) {
        throw { status: 400, message: `PO line ${line.po_line_number} not found.` };
      }

      // Get total already-delivered qty for this line (matches Java getQtyCountbyPoNum)
      const dnQtyResult = await client.query(
        `SELECT COALESCE(SUM(qty), 0) as total_dn_qty 
         FROM dbo.supp_delivery_line_dtls 
         WHERE po_number = $1 AND po_line_number = $2`,
        [data.po_number, line.po_line_number]
      );
      const alreadyDelivered = Number(dnQtyResult.rows[0].total_dn_qty) || 0;
      const lineQty = Number(poLine.line_qty) || 0;
      const orderValue = Number(line.qty) || 0;

      // Validate: delivery qty must not exceed ordered qty
      if (orderValue > lineQty) {
        throw { status: 400, message: "Please check the order quantity." };
      }

      // Validate: delivery qty must not exceed remaining pending qty
      if (alreadyDelivered > 0) {
        const remainQty = lineQty - alreadyDelivered;
        if (orderValue > remainQty) {
          const itemLabel = poLine.item_name || poLine.line_description || line.po_line_number;
          throw { status: 400, message: `Pending qty to raise delivery note ${remainQty}, for the item - ${itemLabel}` };
        }
      }

      const lineIdResult = await client.query(
        `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_delivery_line_dtls`
      );
      const lineId = lineIdResult.rows[0].next_id;

      await client.query(
        `INSERT INTO dbo.supp_delivery_line_dtls 
          (id, delivery_id, po_line_number, item_name, qty, uom, description, po_number, 
           status, created_by, creation_date, last_modified_by, last_modified_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending', $9, NOW(), $10, NOW())`,
        [
          lineId,
          deliveryId,
          line.po_line_number,
          poLine.item_name || line.item_name,
          orderValue,
          poLine.line_unit || line.uom,
          poLine.line_description || line.description || null,
          line.po_number,
          data.created_by,
          data.created_by,
        ]
      );

    }

    await client.query('COMMIT');
    return { id: deliveryId, asn_number: data.asn_number };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPoLinesForReceipt(poNumber: string) {
  const result = await getPool().query(
    `SELECT pol.id, pol.po_line_number, pol.item_name, pol.line_description,
            pol.line_qty, pol.line_unit, pol.line_unit_cost, pol.line_cost,
            pol.item_id, pol.item_type,pol.product_category, pol.product_category_name, pol.line_curr, pol.discount, pol.tax_rate_code, pol.tax_rate,
            pol.attribute_12,
            COALESCE(pol.recieved_qty, 0) as received_qty,
            COALESCE(dn_totals.total_dn_qty, 0) as total_dn_qty,
            COALESCE(grn_totals.total_grn_qty, 0) as total_grn_qty,
            COALESCE(po_dn_total.po_total_dn_qty, 0) as po_total_dn_qty
     FROM dbo.supp_po_line_dtls pol
     LEFT JOIN (
       SELECT dl.po_line_number, SUM(dl.qty) as total_dn_qty
       FROM dbo.supp_delivery_line_dtls dl
       WHERE dl.po_number = $1
       GROUP BY dl.po_line_number
     ) dn_totals ON dn_totals.po_line_number = pol.po_line_number
     LEFT JOIN (
       SELECT g.po_line_number, SUM(g.received_qty) as total_grn_qty
       FROM dbo.supp_po_grn_line_dtls g
       WHERE g.po_number = $1
       GROUP BY g.po_line_number
     ) grn_totals ON grn_totals.po_line_number = pol.po_line_number
     LEFT JOIN (
       SELECT po_number, SUM(qty) as po_total_dn_qty
       FROM dbo.supp_delivery_line_dtls
       WHERE po_number = $1
       GROUP BY po_number
     ) po_dn_total ON po_dn_total.po_number = pol.po_number
     WHERE pol.po_number = $1
     ORDER BY pol.po_line_number`,
    [poNumber]
  );
  return result.rows.map((row: any) => {
    const lineQty = Number(row.line_qty) || 0;
    const totalDnQty = Number(row.total_dn_qty) || 0;
    const totalGrnQty = Number(row.total_grn_qty) || 0;
    const poHasDn = Number(row.po_total_dn_qty) > 0;
    // If PO has DNs but this line has no DN raised, disable it (pending_del_qty = 0)
    const pendingDelQty = totalDnQty > 0
      ? Math.max(0, totalDnQty - totalGrnQty)
      : poHasDn
        ? 0
        : Math.max(0, lineQty - totalGrnQty);
    return {
      id: row.id,
      po_line_number: row.po_line_number,
      item_name: row.item_name || row.line_description || "-",
      line_description: row.line_description || row.item_name || "-",
      line_qty: lineQty,
      pending_del_qty: pendingDelQty,
      total_grn_qty: totalGrnQty,
      line_unit: row.line_unit || "-",
      line_unit_price: Number(row.line_unit_cost) || 0,
      line_cost: Number(row.line_cost) || 0,
      item_id: row.item_id || null,
      item_type: row.item_type || null,
      line_curr: row.line_curr || null,
      discount: Number(row.discount) || 0,
      tax_rate_code: row.tax_rate_code || null,
      tax_rate: Number(row.tax_rate) || 0,
      attribute_12: row.attribute_12 || null,
      product_category: row.product_category || null,
      product_category_name: row.product_category_name || null,
    };
  });
}

export async function checkReceiptNumberUnique(receiptNo: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT COUNT(*) as cnt FROM dbo.supp_po_grn_line_dtls WHERE LOWER(TRIM(supp_receipt_no)) = LOWER(TRIM($1))`,
    [receiptNo]
  );
  return Number(result.rows[0].cnt) === 0;
}

export async function createReceipt(data: {
  receipt_date: string;
  receipt_number: string;
  receipt_notes?: string;
  received_location: string;
  received_location_id?: string;
  po_number: string;
  supplier_name: string;
  created_by: string;
  created_by_name: string;
  requested_by?: string;
  org_id?: string;
  site_id?: string;
  currency_code?: string;
  wms_id?: string;
}, lines: Array<{
  po_line_number: string;
  item_name: string;
  received_qty: number;
  uom: string;
  unit_price: number;
  po_number: string;
  item_id?: string;
  item_type?: string;
  line_curr?: string;
  discount?: number;
  tax_rate_code?: string;
  tax_rate?: number;
  attribute_12?: string;
  line_cost?: number;
  attribute_15?: string;
}>) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    if (data.receipt_number) {
      const uniqueCheck = await client.query(
        `SELECT COUNT(*) as cnt FROM dbo.supp_po_grn_line_dtls WHERE LOWER(TRIM(supp_receipt_no)) = LOWER(TRIM($1))`,
        [data.receipt_number]
      );
      if (Number(uniqueCheck.rows[0].cnt) > 0) {
        throw { status: 400, message: "Receipt Number must be unique!" };
      }
    }

    const poHeaderResult = await client.query(
      `SELECT org_id, supplier_id, po_owner_name, tax_included FROM dbo.supp_po_header_dtls WHERE po_number = $1`,
      [data.po_number]
    );
    if (poHeaderResult.rows.length === 0) {
      throw { status: 404, message: `PO ${data.po_number} not found.` };
    }
    const poHeader = poHeaderResult.rows[0];
    const poOrgId = poHeader.org_id || data.org_id || null;
    const poRequestedBy = poHeader.po_owner_name || data.requested_by || null;
    const taxIncluded = poHeader.tax_included || 'No';
    let supplierCompanyName = data.supplier_name || null;
    if (poHeader.supplier_id) {
      const suppResult = await client.query(
        `SELECT company_name FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`,
        [poHeader.supplier_id]
      );
      if (suppResult.rows.length > 0 && suppResult.rows[0].company_name) {
        supplierCompanyName = suppResult.rows[0].company_name;
      }
    }

    const receiptNumResult = await client.query(
      `SELECT COALESCE(MAX(CAST(receiptnum AS INTEGER)), 0) + 1 as next_num FROM dbo.supp_po_grn_line_dtls`
    );
    const receiptNum = String(receiptNumResult.rows[0].next_num);

    let receiptLineNum = 0;
    for (const line of lines) {
      receiptLineNum++;

      const poLineResult = await client.query(
        `SELECT id, line_qty, COALESCE(recieved_qty, 0) as recieved_qty, COALESCE(rejected_qty, 0) as rejected_qty,
                item_name, line_description, line_unit, line_unit_cost, line_cost,
                item_id, item_type, line_curr, discount, tax_rate_code, attribute_12, line_status, attribute_15, tax_amount
         FROM dbo.supp_po_line_dtls WHERE po_number = $1 AND po_line_number = $2`,
        [data.po_number, line.po_line_number]
      );
      if (poLineResult.rows.length === 0) {
        throw { status: 400, message: `PO line ${line.po_line_number} not found.` };
      }
      const poLine = poLineResult.rows[0];
      const lineQty = Number(poLine.line_qty) || 0;
      const unitCost = Number(poLine.line_unit_cost) || line.unit_price || 0;
      const discountVal = Number(poLine.discount) || line.discount || 0;
      const lineTaxAmount = Number(poLine.tax_amount) || 0;

      const dnQtyResult = await client.query(
        `SELECT COALESCE(SUM(qty), 0) as total_dn_qty FROM dbo.supp_delivery_line_dtls WHERE po_number = $1 AND po_line_number = $2`,
        [data.po_number, line.po_line_number]
      );
      const totalDnQty = Number(dnQtyResult.rows[0].total_dn_qty) || 0;

      const grnQtyResult = await client.query(
        `SELECT COALESCE(SUM(received_qty), 0) as total_grn_qty FROM dbo.supp_po_grn_line_dtls WHERE po_number = $1 AND po_line_number = $2`,
        [data.po_number, line.po_line_number]
      );
      const totalGrnQty = Number(grnQtyResult.rows[0].total_grn_qty) || 0;

      const pendingDelQty = totalDnQty > 0
        ? Math.max(0, totalDnQty - totalGrnQty)
        : Math.max(0, lineQty - totalGrnQty);
      const recQty = Number(line.received_qty) || 0;

      if (recQty > lineQty) {
        throw { status: 400, message: "Received quantity cannot exceed ordered quantity." };
      }
      if (recQty > pendingDelQty) {
        const itemLabel = poLine.item_name || poLine.line_description || line.po_line_number;
        throw { status: 400, message: `Error: Pending qty to raise receipt ${pendingDelQty}, for the item - ${itemLabel}` };
      }

      const idResult = await client.query(
        `SELECT COALESCE(MAX(maximo_grn_id), 0) + 1 as next_id FROM dbo.supp_po_grn_line_dtls`
      );
      const grnId = idResult.rows[0].next_id;

      const rcvTxnIdResult = await client.query(
        `SELECT COALESCE(MAX(CAST(rcvtxnid AS INTEGER)), 0) + 1 as next_txn_id FROM dbo.supp_po_grn_line_dtls WHERE rcvtxnid ~ '^[0-9]+$'`
      );
      const rcvTxnId = String(rcvTxnIdResult.rows[0].next_txn_id);

      let loadedCost: number;
      let discountAmount: string | null = null;
      if (discountVal > 0) {
        loadedCost = recQty * (unitCost - discountVal);
        discountAmount = String(recQty * discountVal);
      } else {
        loadedCost = recQty * unitCost;
      }
      const receivedCost = Number(recQty * unitCost) - Number(discountAmount);
      const orderCost = Number(poLine.line_cost) || lineQty * unitCost;

      let taxableFlag: string | null = null;
      let taxRateCode: string | null = poLine.tax_rate_code || line.tax_rate_code || null;
      let taxRate: number | null = null;
      let taxAmount: number | null = null;

      if (taxRateCode) {
        taxableFlag = "Y";
        const taxResult = await client.query(
          `SELECT tax_rate FROM dbo.am_tax_code_mapping_mst WHERE tax_code = $1 AND status = 'Y' LIMIT 1`,
          [taxRateCode]
        );
        if(taxResult.rows.length > 0 && taxIncluded === 'Yes'){
          taxAmount = recQty * (lineTaxAmount/lineQty);
          taxRate = Number(taxResult.rows[0].tax_rate) || 0;
        }
        else if (taxResult.rows.length > 0) {
          taxRate = Number(taxResult.rows[0].tax_rate) || 0;
          taxAmount = loadedCost * taxRate / 100;
        }else if (poLine.tax_rate && Number(poLine.tax_rate) > 0) {
          taxableFlag = "Y";
          if(taxIncluded === 'Yes'){
            taxAmount = recQty * (lineTaxAmount/lineQty);
            taxRate = Number(poLine.tax_rate) || 0;
          }
          else{
          taxRate = Number(poLine.tax_rate);
          taxAmount = loadedCost * taxRate / 100;
          }
        }
      } else if (poLine.tax_rate && Number(poLine.tax_rate) > 0) {
        taxableFlag = "Y";
        if(taxIncluded === 'Yes'){
          taxAmount = recQty * (lineTaxAmount/lineQty);
          taxRate = Number(poLine.tax_rate) || 0;
        }
        else{
        taxRate = Number(poLine.tax_rate);
        taxAmount = loadedCost * taxRate / 100;
        }
      }

      const lineCurr = poLine.line_curr || line.line_curr || data.currency_code || null;

      await client.query(
        `INSERT INTO dbo.supp_po_grn_line_dtls 
          (maximo_grn_id, po_number, po_line_number, item_name, item_desc, item_id, item_type,
           order_qty, order_cost, loaded_qty, loaded_cost, loaded_unit,
           received_qty, received_unit, received_cost, received_date,
           received_by, received_by_name, requested_by,
           receiptnum, receiptlinenum, rcvtxnid, supp_receipt_no,
           line_status, status, 
           attribute_10, attribute_11, attribute_12, attribute_13, attribute_14,
           to_store_loc, delivertto_location_id, wms_id,
           org_id, site_id, currency_code,
           taxable_flag, tax_rate_code, tax_rate, tax_amount,
           rejected_qty, rejected_cost,
           created_by, creation_date, last_modified_by, last_modified_date,attribute_15)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 $8, $9, $10, $11, $12,
                 $13, $14, $15, $16,
                 $17, $18, $19,
                 $20, $21, $22, $23,
                 'Received', 'Received',
                 $24, $25, $26, $27, $28,
                 $29, $30, $31,
                 $32, $33, $34,
                 $35, $36, $37, $38,
                 0, 0,
                 $39, NOW(), $40, NOW(),$41)`,
        [
          grnId,
          data.po_number,
          line.po_line_number,
          poLine.line_description || line.item_name,
          poLine.line_description || line.item_name,
          poLine.item_id || line.item_id || null,
          poLine.item_type || line.item_type || null,
          lineQty,
          orderCost,
          recQty,
          loadedCost,
          poLine.line_unit || line.uom,
          recQty,
          poLine.line_unit || line.uom,
          receivedCost,
          data.receipt_date,
          data.created_by,
          data.created_by_name,
          poRequestedBy,
          receiptNum,
          receiptLineNum,
          rcvTxnId,
          data.receipt_number || null,
          data.receipt_notes || null,
          supplierCompanyName,
          unitCost.toString(),
          poLine.attribute_12 || line.attribute_12 || null,
          discountAmount,
          data.received_location || null,
          data.received_location_id || null,
          data.wms_id || null,
          poOrgId,
          data.site_id || null,
          lineCurr,
          taxableFlag,
          taxRateCode,
          taxRate,
          taxAmount,
          data.created_by,
          data.created_by,
          poLine.attribute_15 || line.attribute_15 || null,
        ]
      );

      const newRecQty = totalGrnQty + recQty;
      const currentRejQty = Number(poLine.rejected_qty) || 0;
      const totalProcessed = newRecQty + currentRejQty;

      let newLineStatus = "Partially Received";
      if (totalProcessed >= lineQty) {
        newLineStatus = "Complete";
      }

      await client.query(
        `UPDATE dbo.supp_po_line_dtls SET recieved_qty = $1, line_status = $2, last_modified_by = $3, last_modified_date = NOW()
         WHERE po_number = $4 AND po_line_number = $5`,
        [newRecQty, newLineStatus, data.created_by, data.po_number, line.po_line_number]
      );
    }

    const allLinesResult = await client.query(
      `SELECT po_line_number, line_status FROM dbo.supp_po_line_dtls WHERE po_number = $1`,
      [data.po_number]
    );
    const allComplete = allLinesResult.rows.every((r: any) => r.line_status === "Complete");

    if (allComplete) {
      await client.query(
        `UPDATE dbo.supp_po_header_dtls SET po_status = 'Complete', attribute_8 = 'Received', last_modified_by = $1, last_modified_date = NOW()
         WHERE po_number = $2`,
        [data.created_by, data.po_number]
      );
    } else {
      await client.query(
        `UPDATE dbo.supp_po_header_dtls SET attribute_8 = 'Partially Received', last_modified_by = $1, last_modified_date = NOW()
         WHERE po_number = $2`,
        [data.created_by, data.po_number]
      );
    }

    await client.query('COMMIT');
    return { receiptnum: receiptNum, supp_receipt_no: data.receipt_number };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPoForAiAnalysis(poNumber: string) {
  const headerResult = await getPool().query(
    `SELECT h.po_number, h.company_name, h.po_status, h.po_total_cost, h.po_currency,
            h.po_type, h.po_issue_date, h.po_required_date, h.supplier_id, h.buyer_name,
            h.department_name, h.po_description
     FROM dbo.supp_po_header_dtls h
     WHERE h.po_number = $1`,
    [poNumber]
  );
  if (headerResult.rows.length === 0) return null;

  const linesResult = await getPool().query(
    `SELECT l.item_name, l.item_type, l.line_unit_cost, l.line_qty, l.line_cost,
            l.line_description, l.product_category_name, l.supplier_name, l.po_line_number,
            l.line_unit, l.discount, l.tax_rate
     FROM dbo.supp_po_line_dtls l
     WHERE l.po_number = $1
     ORDER BY l.po_line_number`,
    [poNumber]
  );

  return {
    header: headerResult.rows[0],
    lines: linesResult.rows,
  };
}

export async function getHistoricalPriceStats(
  itemNames: string[],
  categoryNames: string[],
  supplierId: string | null,
  /** Exclude the PO under review so its own lines do not pollute "history". */
  excludePoNumber?: string | null,
) {
  const stats: any = { byItem: [], byCategory: [], bySupplier: [] };

  if (itemNames.length > 0) {
    const params: any[] = [...itemNames];
    const placeholders = itemNames.map((_, i) => `$${i + 1}`).join(",");
    let excludeSql = "";
    if (excludePoNumber) {
      params.push(excludePoNumber);
      excludeSql = ` AND l.po_number <> $${params.length}`;
    }
    const itemResult = await getPool().query(
      `SELECT l.item_name,
              COUNT(*)::int as order_count,
              ROUND(AVG(l.line_unit_cost::numeric), 2) as avg_unit_price,
              ROUND(MIN(l.line_unit_cost::numeric), 2) as min_unit_price,
              ROUND(MAX(l.line_unit_cost::numeric), 2) as max_unit_price,
              ROUND(STDDEV(l.line_unit_cost::numeric), 2) as stddev_price,
              ROUND(AVG(l.line_qty::numeric), 2) as avg_qty,
              ROUND(MIN(l.line_qty::numeric), 2) as min_qty,
              ROUND(MAX(l.line_qty::numeric), 2) as max_qty
       FROM dbo.supp_po_line_dtls l
       WHERE l.item_name IN (${placeholders})
         AND l.line_unit_cost IS NOT NULL
         AND l.line_unit_cost::numeric > 0
         ${excludeSql}
       GROUP BY l.item_name`,
      params
    );
    stats.byItem = itemResult.rows;
  }

  if (categoryNames.length > 0) {
    const params: any[] = [...categoryNames];
    const placeholders = categoryNames.map((_, i) => `$${i + 1}`).join(",");
    let excludeSql = "";
    if (excludePoNumber) {
      params.push(excludePoNumber);
      excludeSql = ` AND l.po_number <> $${params.length}`;
    }
    const catResult = await getPool().query(
      `SELECT l.product_category_name,
              COUNT(*)::int as order_count,
              ROUND(AVG(l.line_unit_cost::numeric), 2) as avg_unit_price,
              ROUND(MIN(l.line_unit_cost::numeric), 2) as min_unit_price,
              ROUND(MAX(l.line_unit_cost::numeric), 2) as max_unit_price,
              ROUND(STDDEV(l.line_unit_cost::numeric), 2) as stddev_price
       FROM dbo.supp_po_line_dtls l
       WHERE l.product_category_name IN (${placeholders})
         AND l.line_unit_cost IS NOT NULL
         AND l.line_unit_cost::numeric > 0
         ${excludeSql}
       GROUP BY l.product_category_name`,
      params
    );
    stats.byCategory = catResult.rows;
  }

  if (supplierId) {
    const params: any[] = [supplierId];
    let excludeSql = "";
    if (excludePoNumber) {
      params.push(excludePoNumber);
      excludeSql = ` AND l.po_number <> $${params.length}`;
    }
    const supplierResult = await getPool().query(
      `SELECT l.item_name,
              COUNT(*)::int as order_count,
              ROUND(AVG(l.line_unit_cost::numeric), 2) as avg_unit_price,
              ROUND(MIN(l.line_unit_cost::numeric), 2) as min_unit_price,
              ROUND(MAX(l.line_unit_cost::numeric), 2) as max_unit_price
       FROM dbo.supp_po_line_dtls l
       JOIN dbo.supp_po_header_dtls h ON h.po_number = l.po_number
       WHERE h.supplier_id = $1
         AND l.line_unit_cost IS NOT NULL
         AND l.line_unit_cost::numeric > 0
         ${excludeSql}
       GROUP BY l.item_name`,
      params
    );
    stats.bySupplier = supplierResult.rows;
  }

  return stats;
}

export async function findPotentialDuplicatePos(poNumber: string, supplierId: string | null, totalCost: number | null) {
  if (!supplierId) return [];

  const tolerance = totalCost ? totalCost * 0.1 : 1000;
  const minCost = totalCost ? totalCost - tolerance : 0;
  const maxCost = totalCost ? totalCost + tolerance : 999999999;

  const result = await getPool().query(
    `SELECT h.po_number, h.company_name, h.po_status, h.po_total_cost, h.po_currency,
            h.po_issue_date, h.po_description,
            (SELECT string_agg(l.item_name, ', ' ORDER BY l.po_line_number) 
             FROM dbo.supp_po_line_dtls l WHERE l.po_number = h.po_number) as items_summary
     FROM dbo.supp_po_header_dtls h
     WHERE h.supplier_id = $1
       AND h.po_number != $2
       AND h.po_total_cost::numeric BETWEEN $3 AND $4
     ORDER BY h.creation_date DESC
     LIMIT 10`,
    [supplierId, poNumber, minCost, maxCost]
  );

  return result.rows;
}

export async function getCategoryPrefixValue(): Promise<string> {
  const result = await getPool().query(
    `SELECT prefix_value FROM dbo.am_prefix_mst
     WHERE UPPER(TRIM(prefix_name)) IN ('CATALOGUE CATEGORIES', 'CATEGORY', 'CTC')
     AND status = 'Active'
     LIMIT 1`
  );
  return result.rows[0]?.prefix_value?.trim() || "CTC";
}

export async function getCategoryPrefixAndIncrement(): Promise<string> {
  const prefix = await getCategoryPrefixValue();
  const maxResult = await getPool().query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(prod_category_id, '^.*_', '') AS INTEGER)), 0) as max_seq
     FROM dbo.cat_categories
     WHERE prod_category_id ~ '^.+_[0-9]+$'`
  );
  const maxSeq = maxResult.rows[0]?.max_seq || 0;
  return `${prefix}_${String(maxSeq + 1).padStart(4, "0")}`;
}

export async function createProductCategory(categoryData: {
  categoryName: string;
  description?: string;
  status: string;
  parentCategoryId?: number;
  catType?: number;
  extEntityRef?: number;
  prodCategoryId?: string;
  createdBy: string;
}) {
  // Use provided prodCategoryId or generate sequential prefixed ID
  const finalProdCategoryId = categoryData.prodCategoryId || await getCategoryPrefixAndIncrement();

  let parentCategoryName: string | null = null;

  // Fetch parent category name if parent exists
  if (categoryData.parentCategoryId && categoryData.parentCategoryId > 0) {
    const parentResult = await getPool().query(
      `SELECT category_name FROM dbo.cat_categories WHERE category_id = $1`,
      [categoryData.parentCategoryId]
    );
    if (parentResult.rows.length > 0) {
      parentCategoryName = parentResult.rows[0].category_name;
    }
  }

  const result = await getPool().query(
    `INSERT INTO dbo.cat_categories 
    (category_name, description, status, parent_category_id, cat_type, ext_entity_ref, 
     created_by, creation_date, last_modified_by, last_modified_date, 
     parent_category_name, prod_category_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING category_id, prod_category_id, category_name, created_by, creation_date`,
    [
      categoryData.categoryName,
      categoryData.description || null,
      categoryData.status,
      categoryData.parentCategoryId || 0,
      categoryData.catType || 0,
      categoryData.extEntityRef || 0,
      categoryData.createdBy,
      new Date(),
      categoryData.createdBy,
      new Date(),
      parentCategoryName,
      finalProdCategoryId
    ]
  );

  return result.rows[0];
}

export async function getProductCategoriesPaginated(params: any) {
  const { page, limit, type } = params;
  const offset = (page - 1) * limit;

  let whereCondition = `
    WHERE parent_category_id IS NOT NULL
    AND parent_category_id = 0
  `;

  if (type === "full") {
    whereCondition = "";
  }

  const countSql = `
    SELECT 
      COUNT(*) as total_count,
      COUNT(*) FILTER (WHERE status = 'Active') as active_count,
      COUNT(*) FILTER (WHERE status != 'Active') as inactive_count
    FROM dbo.cat_categories ${whereCondition}
  `;
  const countResult = await getPool().query(countSql);
  const total = parseInt(countResult.rows[0].total_count);
  const active = parseInt(countResult.rows[0].active_count);
  const inactive = parseInt(countResult.rows[0].inactive_count);

  const sql = `
    SELECT category_id, category_name, description, status, parent_category_id,
           parent_category_name, cat_type, ext_entity_ref, prod_category_id,
           created_by, creation_date, last_modified_by, last_modified_date
    FROM dbo.cat_categories
    ${whereCondition}
    ORDER BY category_name ASC
    OFFSET $1
    LIMIT $2
  `;

  const result = await getPool().query(sql, [offset, limit]);

  return { rows: result.rows, total, active, inactive };
}

export async function getProductCategoryByProdId(prodCategoryId: string) {
  const result = await getPool().query(
    `SELECT category_id, category_name, description, status, parent_category_id, 
            parent_category_name, cat_type, ext_entity_ref, prod_category_id,
            created_by, creation_date, last_modified_by, last_modified_date
     FROM dbo.cat_categories
     WHERE prod_category_id = $1`,
    [prodCategoryId]
  );
  return result.rows[0] || null;
}

export async function getProductCategoryById(categoryId: number) {
  const result = await getPool().query(
    `SELECT category_id, category_name, description, status, parent_category_id, 
            parent_category_name, cat_type, ext_entity_ref, prod_category_id,
            created_by, creation_date, last_modified_by, last_modified_date
     FROM dbo.cat_categories
     WHERE category_id = $1`,
    [categoryId]
  );
  return result.rows[0] || null;
}

export async function updateProductCategory(categoryId: number, categoryData: {
  categoryName: string;
  description?: string;
  status: string;
  parentCategoryId?: number;
  catType?: number;
  lastModifiedBy: string;
}) {
  let parentCategoryName: string | null = null;

  if (categoryData.parentCategoryId && categoryData.parentCategoryId > 0) {
    const parentResult = await getPool().query(
      `SELECT category_name FROM dbo.cat_categories WHERE category_id = $1`,
      [categoryData.parentCategoryId]
    );
    if (parentResult.rows.length > 0) {
      parentCategoryName = parentResult.rows[0].category_name;
    }
  }

  const result = await getPool().query(
    `UPDATE dbo.cat_categories 
     SET category_name = $1, description = $2, status = $3, 
         parent_category_id = $4, cat_type = $5, 
         last_modified_by = $6, last_modified_date = $7,
         parent_category_name = $8
     WHERE category_id = $9
     RETURNING category_id, prod_category_id, category_name`,
    [
      categoryData.categoryName,
      categoryData.description || null,
      categoryData.status,
      categoryData.parentCategoryId || 0,
      categoryData.catType || 0,
      categoryData.lastModifiedBy,
      new Date(),
      parentCategoryName,
      categoryId
    ]
  );

  return result.rows[0];
}

export async function deleteProductCategory(categoryId: number) {
  await getPool().query(
    `DELETE FROM dbo.cat_categories WHERE category_id = $1`,
    [categoryId]
  );
}

export async function insertPurchaseOrderFromPR(params: {
  poNumber: string;
  description: string;
  poType: string;
  supplierId: number | null;
  supplierName: string | null;
  buyerId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  requestorId: string | null;
  requestorName: string | null;
  requestorEmail: string | null;
  departmentName: string;
  currency: string;
  deliveryLocation: string | null;
  locationName: string;
  shipToAddress: string | null;
  billToAddress: string | null;
  requiredDate: string | null;
  budgetName: string | null;
  budgetSegment: string | null;
  orgId: number | null;
  paymentTermsId: string | null;
  paymentTermsName: string | null;
  advanceFlag: string;
  advancePercentage: number | null;
  prNumber: string;
  createdBy: string;
  taxIncluded?: string | null;
}) {

  const formId = await formRepo.getActiveFromId();

  let id = 0;
  if(formId)
  {
    id = formId.id
  }
  await getPool().query(
    `INSERT INTO dbo.supp_po_header_dtls (
      po_number, po_description, po_type, po_status,
      supplier_id, company_name,
      buyer, buyer_name, buyer_email,
      po_owner_id, po_owner_name, po_owner_email,
      department_name, po_currency,
      delivertto_location_id, delivertto_location_name,
      shipto_address, billto_address,
      po_required_date, creation_date, po_issue_date,
      budget_name, budget_segment, org_id,
      po_payment_terms_id, payment_terms_name,
      advance_flag, advance_percentage,
      pr_number, created_by, tax_included,attribute_4
    ) VALUES ($1, $2, $3, 'Draft', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW(), $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,$29)`,
    [
      params.poNumber, params.description, params.poType,
      params.supplierId, params.supplierName,
      params.buyerId, params.buyerName, params.buyerEmail,
      params.requestorId, params.requestorName, params.requestorEmail,
      params.departmentName, params.currency,
      params.deliveryLocation, params.locationName,
      params.shipToAddress, params.billToAddress,
      params.requiredDate,
      params.budgetName, params.budgetSegment, params.orgId,
      params.paymentTermsId, params.paymentTermsName,
      params.advanceFlag, params.advancePercentage,
      params.prNumber, params.createdBy,
      params.taxIncluded,
      id
    ]
  );
}

export async function getContractHeaderById(contractId: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.cm_header WHERE id = $1`,
    [contractId]
  );
  return result.rows[0] || null;
}

export async function getContractSowLines(contractId: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.cm_sow WHERE parent_id = $1 AND (del_status IS NULL OR del_status != 'Y') ORDER BY id`,
    [contractId]
  );
  return result.rows;
}

export async function getContractVendor(contractId: string) {
  const result = await getPool().query(
    `SELECT supplier_id, supplier_name FROM dbo.cm_supplier_dtls WHERE contractrefno = $1 LIMIT 1`,
    [contractId]
  );
  return result.rows[0] || null;
}

export async function updateSowLinePoNumber(sowLineId: number, poNumber: string) {
  await getPool().query(
    `UPDATE dbo.cm_sow SET po_number = $1 WHERE id = $2`,
    [poNumber, sowLineId]
  );
}

export async function insertPurchaseOrderFromContract(params: {
  poNumber: string;
  description: string;
  poType: string;
  supplierId: number | null;
  supplierName: string | null;
  buyerId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  requestorId: string | null;
  requestorName: string | null;
  requestorEmail: string | null;
  departmentName: string;
  currency: string;
  requiredDate: string | null;
  orgId: number | null;
  paymentTermsId: string | null;
  paymentTermsName: string | null;
  advanceFlag: string;
  advancePercentage: number | null;
  budgetName: string | null;
  budgetSegment: string | null;
  contractRefNo: string;
  createdBy: string;
}) {
  const formId = await formRepo.getActiveFromId();

  let id = 0;
  if (formId) {
    id = formId.id;
  }
  await getPool().query(
    `INSERT INTO dbo.supp_po_header_dtls (
      po_number, po_description, po_type, po_status,
      supplier_id, company_name,
      buyer, buyer_name, buyer_email,
      po_owner_id, po_owner_name, po_owner_email,
      department_name, po_currency,
      po_required_date, creation_date, po_issue_date,
      org_id,
      po_payment_terms_id, payment_terms_name,
      advance_flag, advance_percentage,
      budget_name, budget_segment,
      contract_ref_no, created_by, attribute_4
    ) VALUES ($1, $2, $3, 'Draft', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [
      params.poNumber, params.description, params.poType,
      params.supplierId, params.supplierName,
      params.buyerId, params.buyerName, params.buyerEmail,
      params.requestorId, params.requestorName, params.requestorEmail,
      params.departmentName, params.currency,
      params.requiredDate,
      params.orgId,
      params.paymentTermsId, params.paymentTermsName,
      params.advanceFlag, params.advancePercentage,
      params.budgetName, params.budgetSegment,
      params.contractRefNo, params.createdBy,
      id,
    ]
  );
}

export async function updatePoTotals(poNumber: string, netCost: number, taxTotal: number, totalCost: number) {
  await getPool().query(
    `UPDATE dbo.supp_po_header_dtls 
     SET po_net_cost = $1, po_tax = $2, po_total_cost = $3
     WHERE po_number = $4`,
    [netCost, taxTotal, totalCost, poNumber]
  );
}

export async function updatePrLinePoNumber(lineId: number, poNumber: string) {
  await getPool().query(
    `UPDATE dbo.supp_pr_line_dtls SET po_number = $1 WHERE id = $2`,
    [poNumber, lineId]
  );
}

export async function updatePrPoNumber(prNumber: string, poNumber: string) {
  const result = await getPool().query(
    `SELECT po_number FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  const existing = result.rows[0]?.po_number;
  const newPoField = existing ? `${existing},${poNumber}` : poNumber;
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET po_number = $1 WHERE pr_number = $2`,
    [newPoField, prNumber]
  );
}

/** Legacy sorcMgmtService.updatePoNumberInPR(prNumber, null, null) — clear PO refs from PR when supplier rejects PO. */
export async function clearPrPoReferences(prNumber: string) {
  const pr = String(prNumber || "").trim();
  if (!pr) return;
  await getPool().query(
    `UPDATE dbo.supp_pr_header_dtls SET po_number = NULL WHERE pr_number = $1`,
    [pr]
  );
  await getPool().query(
    `UPDATE dbo.supp_pr_line_dtls SET po_number = NULL WHERE pr_number = $1`,
    [pr]
  );
}

export async function checkAllPrLinesHavePo(prNumber: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT COUNT(*) as total, 
            COUNT(*) FILTER (WHERE po_number IS NOT NULL AND po_number != '') as with_po
     FROM dbo.supp_pr_line_dtls WHERE pr_number = $1`,
    [prNumber]
  );
  const { total, with_po } = result.rows[0];
  return parseInt(total) > 0 && parseInt(total) === parseInt(with_po);
}

export async function getItemTaxInfo(itemId: string) {
  const result = await getPool().query(
    `SELECT tax_rate, tax_code FROM dbo.pm_product_master WHERE id = $1`,
    [itemId]
  );
  return result.rows[0] || null;
}

export async function getLocationDetails(locationId: string) {
  const result = await getPool().query(
    `SELECT location_name, shipto_address, billto_address FROM dbo.am_locations_mst WHERE id = $1`,
    [locationId]
  );
  return result.rows[0] || null;
}

export async function getUserDetails(userId: string) {
  const result = await getPool().query(
    `SELECT id, name, email_id, user_name FROM dbo.um_user_dtls WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function getBudgetOrgId(budgetSegment: string): Promise<number | null> {
  try {
    const lineResult = await getPool().query(
      `SELECT budget_mst_id FROM dbo.am_budget_lines WHERE id = $1`,
      [parseInt(budgetSegment)]
    );
    if (lineResult.rows.length === 0) return null;
    const budgetMstId = lineResult.rows[0].budget_mst_id;
    const mstResult = await getPool().query(
      `SELECT business_entity FROM dbo.am_budget_mst WHERE id = $1`,
      [budgetMstId]
    );
    if (mstResult.rows.length === 0) return null;
    return parseInt(mstResult.rows[0].business_entity) || null;
  } catch {
    return null;
  }
}

export async function insertPoLineFromPR(params: {
  id: number;
  poNumber: string;
  lineNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
  uom: string;
  currency: string;
  taxRate: number;
  taxRateCode: string | null;
  taxableFlag: string;
  taxAmount: number;
  lineCost: number;
  itemId: string | null;
  itemName: string | null;
  categoryCode: string | "";
  categoryName: string | null;
}) {
  await getPool().query(
    `INSERT INTO dbo.supp_po_line_dtls 
     (id, po_number, po_line_number, line_description, line_qty, line_unit_cost, line_unit, line_curr,
      tax_rate, tax_rate_code, taxable_flag, tax_amount, line_cost, line_status, 
      item_id, item_name, product_category, product_category_name, creation_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Draft', $14, $15, $16, $17, NOW())`,
    [params.id, params.poNumber, params.lineNumber, params.description, params.quantity, params.unitPrice, 
     params.uom, params.currency, params.taxRate, params.taxRateCode, params.taxableFlag, params.taxAmount, 
     params.lineCost, params.itemId, params.itemName, parseInt(params.categoryCode), params.categoryName]
  );
}

export async function getVendorDeliveryHistory(supplierId: number, excludePoNumber?: string) {
  const result = await getPool().query(
    `SELECT 
       h.po_number,
       h.po_description,
       h.po_required_date,
       h.po_status,
       h.po_total_cost,
       h.creation_date as po_creation_date,
       MIN(g.received_date) as first_received_date,
       MAX(g.received_date) as last_received_date,
       SUM(g.received_qty) as total_received_qty,
       MIN(d.expected_arrival_date) as expected_arrival_date,
       MIN(d.ship_date) as ship_date,
       CASE 
         WHEN MIN(g.received_date) IS NOT NULL AND h.po_required_date IS NOT NULL 
         THEN EXTRACT(DAY FROM MIN(g.received_date) - h.po_required_date)
         ELSE NULL
       END as delay_days,
       (
         SELECT STRING_AGG(cat, ', ' ORDER BY cat)
         FROM (
           SELECT DISTINCT NULLIF(TRIM(l.product_category_name), '') AS cat
           FROM dbo.supp_po_line_dtls l
           WHERE l.po_number = h.po_number
             AND NULLIF(TRIM(l.product_category_name), '') IS NOT NULL
         ) cats
       ) as product_categories
     FROM dbo.supp_po_header_dtls h
     LEFT JOIN dbo.supp_po_grn_line_dtls g ON h.po_number = g.po_number
     LEFT JOIN dbo.supp_delivery_hdr_dtls d ON h.po_number = d.po_number
     WHERE h.supplier_id = $1
       AND h.po_number != COALESCE($2, '')
       AND (g.received_date IS NOT NULL OR d.ship_date IS NOT NULL)
     GROUP BY h.po_number, h.po_description, h.po_required_date, h.po_status, h.po_total_cost, h.creation_date
     ORDER BY COALESCE(MAX(g.received_date), MAX(d.ship_date)) DESC
     LIMIT 20`,
    [supplierId, excludePoNumber || '']
  );
  return result.rows;
}

export async function getVendorPoStats(supplierId: number) {
  const result = await getPool().query(
    `SELECT 
       COUNT(DISTINCT po_number) as total_pos,
       COUNT(DISTINCT CASE WHEN po_status IN ('Approved', 'Complete', 'Closed') THEN po_number END) as completed_pos,
       MIN(creation_date) as first_po_date,
       MAX(creation_date) as latest_po_date,
       SUM(po_total_cost) as total_spend
     FROM dbo.supp_po_header_dtls
     WHERE supplier_id = $1`,
    [supplierId]
  );
  return result.rows[0] || null;
}

export async function getProdCategoriesByParentCategoryId(parentId: number) {
  const result = await getPool().query(
    `SELECT category_id, category_name, description, status, parent_category_id, 
            parent_category_name, cat_type, ext_entity_ref, prod_category_id,
            created_by, creation_date, last_modified_by, last_modified_date
     FROM dbo.cat_categories
     WHERE parent_category_id = $1
     ORDER BY creation_date DESC`,
    [parentId]
  );
  return result.rows;
}

export async function getPrPoApprovalSummary(prNumber: string) {
  const result = await getPool().query(
    `
    SELECT
        COUNT(*) FILTER (WHERE po_status NOT IN ('Cancelled', 'Rejected')) AS total_pos,
        COUNT(*) FILTER (WHERE po_status = 'Approved' OR po_status = 'Complete' OR po_status = 'Closed') AS approved_pos,
        COALESCE(SUM(po_total_cost) FILTER ( WHERE po_status = 'Approved' OR po_status = 'Complete' OR po_status = 'Closed'), 0) AS total_po_amount
    FROM dbo.supp_po_header_dtls
    WHERE pr_number = $1
    `,
    [prNumber]
  );

  return result.rows[0];
}

export async function checkAllAwardLinesHavePo(awardId: number | string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE attribute_11 IS NOT NULL AND attribute_11 != '') as with_po
     FROM dbo.supp_bid_award_line_dtls WHERE bid_award_id = $1`,
    [awardId]
  );
  const { total, with_po } = result.rows[0];
  return parseInt(total) > 0 && parseInt(total) === parseInt(with_po);
}

export async function getAwardPoApprovalSummary(awardId: number | string) {
  const result = await getPool().query(
    `
    SELECT
        COUNT(*) FILTER (WHERE po_status NOT IN ('Cancelled', 'Rejected')) AS total_pos,
        COUNT(*) FILTER (WHERE po_status = 'Approved' OR po_status = 'Complete' OR po_status = 'Closed') AS approved_pos,
        COALESCE(SUM(po_total_cost) FILTER ( WHERE po_status = 'Approved' OR po_status = 'Complete' OR po_status = 'Closed'), 0) AS total_po_amount
    FROM dbo.supp_po_header_dtls
    WHERE bid_award_id = $1
    `,
    [String(awardId)]
  );

  return result.rows[0];
}