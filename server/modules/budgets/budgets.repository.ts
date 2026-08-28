import { pool } from "../_shared";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

export async function autoExpireBudgets() {
  await getPool().query(`
    UPDATE dbo.am_budget_mst 
    SET status = 'Expired', last_modified_date = CURRENT_TIMESTAMP
    WHERE end_date < CURRENT_DATE 
    AND LOWER(status) NOT IN ('draft', 'rejected', 'expired')
  `);
}

function buildBudgetMstListFilters(params: { status?: string; search?: string; year?: string }) {
  const { status, search, year } = params;
  let statusArray: string[] = [];
  if (status && status.includes(",")) {
    statusArray = status.split(",");
  } else {
    statusArray = [];
  }
  let whereClause = "";
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (year) {
    const yearNum = parseInt(year);
    whereClause += ` AND (start_date IS NULL OR (start_date < $${paramIndex} AND (end_date IS NULL OR end_date >= $${paramIndex + 1})))`;
    queryParams.push(`${yearNum + 1}-01-01`);
    queryParams.push(`${yearNum}-01-01`);
    paramIndex += 2;
  }
  if (status && status !== "all") {
    if (statusArray.length > 0) {
      const patterns = statusArray.map((s: string) => `%${s}%`);
      whereClause += ` AND LOWER(status) ILIKE ANY($${paramIndex++})`;
      queryParams.push(patterns);
    } else {
      whereClause += ` AND LOWER(status) ILIKE $${paramIndex++}`;
      queryParams.push(`%${status}%`);
    }
  }
  if (search) {
    whereClause += ` AND (budget_id ILIKE $${paramIndex} OR budget_name ILIKE $${paramIndex} OR budget_owner_name ILIKE $${paramIndex} OR business_entity_name ILIKE $${paramIndex})`;
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  return { whereClause, queryParams };
}

export async function getBudgetsList(params: { status?: string; search?: string; year?: string; page: number; limit: number }) {
  const { status, search, year, page, limit } = params;
  const offset = (page - 1) * limit;
  const { whereClause, queryParams } = buildBudgetMstListFilters({ status, search, year });

  const countResult = await getPool().query(
    `SELECT COUNT(*) FROM dbo.am_budget_mst WHERE 1=1 ${whereClause}`,
    queryParams
  );
  let limitClause = "";
  if (limit !== 0) {
    const p = queryParams.length + 1;
    limitClause = ` LIMIT $${p} OFFSET $${p + 1}`;
    queryParams.push(limit);
    queryParams.push(offset);
  }
  const total = parseInt(countResult.rows[0].count);

  const result = await getPool().query(
    `SELECT 
      id, budget_id, budget_name, budget_amount, budget_curr, status,
      budget_owner_id, budget_owner_name, business_entity, business_entity_name,
      start_date, end_date, period_mst_id, locations, notes,
      consumed_amount, reserved_amount, creation_date, created_by,
      last_modified_date, last_modified_by
    FROM dbo.am_budget_mst 
    WHERE 1=1 ${whereClause}
    ORDER BY creation_date DESC NULLS LAST, id DESC
    ${limitClause}`,
    [...queryParams]
  );

  return { data: result.rows, total };
}

export async function getBudgetExportLineRows(params: { status?: string; search?: string; year?: string }) {
  const { whereClause, queryParams } = buildBudgetMstListFilters(params);
  const result = await getPool().query(
    `SELECT 
      bm.id AS budget_mst_id,
      bm.budget_id,
      bm.budget_name,
      bm.status,
      bm.budget_owner_name,
      bm.business_entity_name,
      bm.budget_amount,
      bm.budget_curr,
      bm.consumed_amount,
      bm.reserved_amount,
      bm.start_date,
      bm.end_date,
      bl.id AS line_id,
      bl.segment_dtl_code AS line_cost_center_code,
      bl.segment_dtl_name AS line_cost_center_name,
      bl.amount AS line_amount,
      bl.description AS line_description,
      bl.consumed_amount AS line_consumed_amount,
      bl.reserved_amount AS line_reserved_amount,
      loc_agg.line_locations,
      dep_agg.line_departments
    FROM dbo.am_budget_lines bl
    INNER JOIN dbo.am_budget_mst bm ON bl.budget_mst_id = bm.id
    LEFT JOIN (
      SELECT budget_line_id, string_agg(loc_name, ', ' ORDER BY loc_name) AS line_locations
      FROM dbo.am_budget_location_map
      GROUP BY budget_line_id
    ) loc_agg ON loc_agg.budget_line_id = bl.id
    LEFT JOIN (
      SELECT budget_line_id, string_agg(dept_name, ', ' ORDER BY dept_name) AS line_departments
      FROM dbo.am_budget_depart_map
      GROUP BY budget_line_id
    ) dep_agg ON dep_agg.budget_line_id = bl.id
    WHERE bm.id IN (
      SELECT id FROM dbo.am_budget_mst WHERE 1=1 ${whereClause}
    )
    ORDER BY bm.creation_date DESC NULLS LAST, bm.id DESC, bl.id`,
    queryParams
  );
  return result.rows;
}

export async function getBudgetStats(year?: string) {
  let whereClause = "";
  const params: any[] = [];

  if (year) {
    const yearNum = parseInt(year);
    whereClause = `WHERE start_date IS NULL OR (start_date < $1 AND (end_date IS NULL OR end_date >= $2))`;
    params.push(`${yearNum + 1}-01-01`);
    params.push(`${yearNum}-01-01`);
  }

  const result = await getPool().query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE LOWER(status) = 'draft') as draft,
      COUNT(*) FILTER (WHERE LOWER(status) = 'pending approval') as pending_approval,
      COUNT(*) FILTER (WHERE LOWER(status) = 'approved') as approved,
      COUNT(*) FILTER (WHERE LOWER(status) = 'rejected') as rejected,
      COUNT(*) FILTER (WHERE LOWER(status) = 'expired') as expired,
      COUNT(*) FILTER (WHERE LOWER(status) = 'more info required') as more_info_required,
      COALESCE(SUM(CASE WHEN budget_amount IS NOT NULL THEN budget_amount ELSE 0 END), 0) as total_budget,
      COALESCE(SUM(CASE WHEN consumed_amount IS NOT NULL THEN consumed_amount ELSE 0 END), 0) as total_consumed,
      COALESCE(SUM(CASE WHEN reserved_amount IS NOT NULL THEN reserved_amount ELSE 0 END), 0) as total_reserved
    FROM dbo.am_budget_mst
    ${whereClause}
  `, params);

  return result.rows[0];
}


export async function getPeriods() {
  const result = await getPool().query(`SELECT id, period_name FROM dbo.am_period_mst ORDER BY id`);
  return result.rows;
}

export async function getOrgUsers() {
  const result = await getPool().query(`
    SELECT id, name, user_name, attribute_12 as orgIds, department_name
    FROM dbo.um_user_dtls 
    WHERE name IS NOT NULL AND name != '' AND user_type = 0
    ORDER BY name
    LIMIT 100
  `);
  return result.rows;
}

export async function getBusinessEntities() {
  const result = await getPool().query(`
    SELECT id::text as id, organization_name as name, entity_type, currency
    FROM dbo.um_org_dtls 
    WHERE entity_type IN ('MAIN', 'SUBSIDIARY')
    ORDER BY
      CASE WHEN entity_type = 'MAIN' THEN 0 ELSE 1 END,
      organization_name
  `);
  return result.rows;
}

export async function getCostCenters() {
  const result = await getPool().query(`
    SELECT id, code, value as name 
    FROM dbo.am_bussiness_seg_dtl 
    WHERE segment_type_id = 2
    ORDER BY value
  `);
  return result.rows;
}

export async function getExpenseCostCenters() {
  const result = await getPool().query(`
    SELECT id, code, value as name
    FROM dbo.am_bussiness_seg_dtl 
    WHERE segment_type_id = 2 AND status = 'Y'
    ORDER BY value
  `);
  return result.rows;
}

export async function getExistingBudgetsWithLines() {
  const result = await getPool().query(`
    SELECT 
      b.id, b.budget_name, b.budget_amount, b.status, b.business_entity_name,
      b.budget_owner_name, b.period_mst_id, b.start_date, b.end_date,
      l.segment_dtl_code, l.segment_dtl_name, l.amount as line_amount
    FROM dbo.am_budget_mst b
    LEFT JOIN dbo.am_budget_lines l ON b.id = l.budget_mst_id
    WHERE b.status IN ('Draft', 'Approved', 'Active')
    ORDER BY b.budget_name, l.segment_dtl_name
  `);
  return result.rows;
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
}

/** Approved/Active budgets from the last 5 years — used for AI amount recommendations (FR-04). */
export async function getApprovedHistoricalBudgetsForAI(yearsBack: number = 5) {
  const result = await getPool().query(`
    SELECT
      b.id,
      b.budget_name,
      b.budget_amount,
      COALESCE(b.consumed_amount, 0) AS consumed_amount,
      COALESCE(b.reserved_amount, 0) AS reserved_amount,
      b.status,
      b.business_entity::text AS business_entity_id,
      b.business_entity_name,
      b.budget_owner_name,
      b.period_mst_id,
      b.start_date,
      b.end_date,
      EXTRACT(YEAR FROM COALESCE(b.start_date, b.creation_date))::int AS budget_year,
      l.segment_dtl_code,
      l.segment_dtl_name,
      l.amount AS line_amount
    FROM dbo.am_budget_mst b
    LEFT JOIN dbo.am_budget_lines l ON b.id = l.budget_mst_id
    WHERE b.status IN ('Approved', 'Active')
      AND COALESCE(b.start_date, b.creation_date) >= (CURRENT_DATE - make_interval(years => $1::int))
    ORDER BY budget_year DESC, b.budget_name, l.segment_dtl_name
  `, [yearsBack]);
  return result.rows;
}

export async function getNextBudgetId() {
  const maxIdResult = await getPool().query(`
    SELECT COALESCE(MAX(id), 0) + 1 as new_id FROM dbo.am_budget_mst
  `);
  return maxIdResult.rows[0].new_id;
}

export async function getBudgetPrefixValue(): Promise<string> {
  const result = await getPool().query(`
    SELECT prefix_value FROM dbo.am_prefix_mst
    WHERE UPPER(TRIM(prefix_name)) IN ('BUDGET', 'BUD', 'BUDGETS')
    AND status = 'Active'
    LIMIT 1
  `);
  return result.rows[0]?.prefix_value?.trim() || 'BUD';
}

export async function getEntityCurrency(entityId?: string | number | null): Promise<string> {
  if (entityId) {
    const entityResult = await getPool().query(
      `SELECT currency FROM dbo.um_org_dtls WHERE id = $1 LIMIT 1`,
      [entityId]
    );
    if (entityResult.rows[0]?.currency) return entityResult.rows[0].currency;
  }
  // Fall back to main org currency
  const orgResult = await getPool().query(
    `SELECT currency FROM dbo.um_org_dtls WHERE entity_type = 'MAIN' LIMIT 1`
  );
  return orgResult.rows[0]?.currency || 'AED';
}

export async function getNextBudgetNumber() {
  const prefix = await getBudgetPrefixValue();
  const budgetNumResult = await getPool().query(`
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(budget_id, '^.*_', '') AS INTEGER)), 0) + 1 as next_num
    FROM dbo.am_budget_mst
    WHERE budget_id ~ '^.+_[0-9]+$'
  `);
  const nextNum = budgetNumResult.rows[0].next_num || 1;
  return `${prefix}_${String(nextNum).padStart(5, '0')}`;
}

export async function insertBudgetWithAI(data: {
  budgetNumber: string; budgetName: string;
  budgetOwnerId: number; budgetOwnerName: string;
  businessEntityId: string | null; businessEntityName: string | null;
  periodMstId: number; startDate: string; endDate: string;
  totalAmount: number; createdBy: number;
}): Promise<number> {
  const currency = await getEntityCurrency(data.businessEntityId);
  const result = await getPool().query(`
    INSERT INTO dbo.am_budget_mst (
      budget_id, budget_name, status,
      budget_owner_id, budget_owner_name,
      business_entity, business_entity_name,
      period_mst_id,
      start_date, end_date, budget_amount, consumed_amount, reserved_amount,
      budget_curr, created_by, creation_date, last_modified_by, last_modified_date
    ) VALUES (
      $1, $2, 'Draft',
      $3, $4,
      $5, $6,
      $7,
      $8, $9, $10, 0, 0,
      $12, $11, NOW(), $11, NOW()
    )
    RETURNING id
  `, [
    data.budgetNumber, data.budgetName,
    data.budgetOwnerId, data.budgetOwnerName,
    data.businessEntityId, data.businessEntityName,
    data.periodMstId,
    data.startDate, data.endDate, data.totalAmount,
    data.createdBy, currency
  ]);
  return result.rows[0].id;
}

export async function getNextBudgetLineId() {
  const maxLineIdResult = await getPool().query(`
    SELECT COALESCE(MAX(id), 0) + 1 as new_id FROM dbo.am_budget_lines
  `);
  return maxLineIdResult.rows[0].new_id;
}

export async function insertBudgetLineForAI(data: {
  budgetMstId: number; segmentDtlId: number;
  segmentDtlCode: string; segmentDtlName: string; amount: number;
  description?: string | null; 
  locationIds?: number[];
  departmentIds?: number[];
}): Promise<number> {
  // Explicit MAX(id)+1 — sequence default is stale because other paths insert with manual IDs
  const lineId = await getNextBudgetLineId();
  await getPool().query(
    `
      INSERT INTO dbo.am_budget_lines (
        id, budget_mst_id, segment_dtl_id, segment_dtl_code, segment_dtl_name,
        amount, consumed_amount, reserved_amount, description
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7)
    `,
    [
      lineId,
      data.budgetMstId,
      data.segmentDtlId,
      data.segmentDtlCode,
      data.segmentDtlName,
      Number(data.amount) || 0,
      data.description || null,
    ]
  );

  if (data.locationIds?.length) {
    for (const locId of data.locationIds) {
      const locResult = await getPool().query(
        `SELECT location_name FROM dbo.am_locations_mst WHERE id = $1`,
        [locId]
      );
      await getPool().query(
        `INSERT INTO dbo.am_budget_location_map (budget_line_id, loc_id, loc_name) VALUES ($1, $2, $3)`,
        [lineId, locId, locResult.rows[0]?.location_name || ""]
      );
    }
  }

  if (data.departmentIds?.length) {
    for (const deptId of data.departmentIds) {
      const deptResult = await getPool().query(
        `SELECT value FROM dbo.am_bussiness_seg_dtl WHERE id = $1`,
        [deptId]
      );
      await getPool().query(
        `INSERT INTO dbo.am_budget_depart_map (budget_line_id, dept_id, dept_name) VALUES ($1, $2, $3)`,
        [lineId, deptId, deptResult.rows[0]?.value || ""]
      );
    }
  }

  return lineId;
}

export async function getHistoricalAllocations(
  costCenterCode: string,
  filters?: {
    businessEntity?: string;
    locationIds?: number[];
    departmentIds?: number[];
  }
) {
  const params: any[] = [costCenterCode];
  let where = `
    WHERE l.segment_dtl_code = $1
      AND b.status IN ('Approved', 'Active')
  `;

  if (filters?.businessEntity?.trim()) {
    params.push(filters.businessEntity.trim());
    where += ` AND TRIM(CAST(b.business_entity AS VARCHAR)) = $${params.length}`;
  }

  if (filters?.locationIds?.length) {
    // loc_id is character varying — match if the line includes any selected location
    params.push(filters.locationIds.map(String));
    where += `
      AND EXISTS (
        SELECT 1 FROM dbo.am_budget_location_map lm
        WHERE lm.budget_line_id = l.id
          AND TRIM(CAST(lm.loc_id AS VARCHAR)) = ANY($${params.length}::text[])
      )`;
  }

  if (filters?.departmentIds?.length) {
    // dept_id is character varying — match if the line includes any selected department
    // (including multi-department / "all departments" lines)
    params.push(filters.departmentIds.map(String));
    where += `
      AND EXISTS (
        SELECT 1 FROM dbo.am_budget_depart_map dm
        WHERE dm.budget_line_id = l.id
          AND TRIM(CAST(dm.dept_id AS VARCHAR)) = ANY($${params.length}::text[])
      )`;
  }

  const result = await getPool().query(`
    SELECT 
      l.segment_dtl_code,
      l.segment_dtl_name,
      l.amount,
      COALESCE(l.consumed_amount, 0) AS consumed_amount,
      COALESCE(l.reserved_amount, 0) AS reserved_amount,
      b.budget_name,
      b.status,
      COALESCE(NULLIF(TRIM(b.budget_curr), ''), 'AED') AS budget_curr,
      b.period_mst_id,
      p.period_name,
      b.start_date,
      b.end_date
    FROM dbo.am_budget_lines l
    JOIN dbo.am_budget_mst b ON l.budget_mst_id = b.id
    LEFT JOIN dbo.am_period_mst p ON b.period_mst_id::integer = p.id
    ${where}
    ORDER BY b.creation_date DESC
    LIMIT 10
  `, params);
  return result.rows;
}

export async function getNextBudgetIdFromSequence() {
  const prefix = await getBudgetPrefixValue();
  const maxIdResult = await getPool().query(`
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(budget_id, '^[^0-9]+', '') AS INTEGER)), 250000) as max_num
    FROM dbo.am_budget_mst
    WHERE budget_id ~ '^[^0-9]+[0-9]+$'
  `);
  const nextNum = (maxIdResult.rows[0].max_num || 250000) + 1;
  return `${prefix}${nextNum.toString().padStart(6, "0")}`;
}

export async function createBudget(data: {
  budgetId: string; budgetName: string; businessEntity: string;
  businessEntityName: string; budgetOwnerId: number; budgetOwnerName: string;
  periodMstId: number; startDate: string; endDate: string; createdBy: string;
}) {
  const currency = await getEntityCurrency(data.businessEntity);
  const result = await getPool().query(`
    INSERT INTO dbo.am_budget_mst (
      budget_id, budget_name, business_entity, business_entity_name,
      budget_owner_id, budget_owner_name, period_mst_id, start_date, end_date,
      status, budget_amount, consumed_amount, reserved_amount, budget_curr,
      creation_date, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Draft', 0, 0, 0, $11, NOW(), $10)
    RETURNING id
  `, [
    data.budgetId, data.budgetName, data.businessEntity, data.businessEntityName,
    data.budgetOwnerId, data.budgetOwnerName, data.periodMstId,
    data.startDate, data.endDate, data.createdBy, currency
  ]);
  return result.rows[0];
}

export async function getBudgetStatus(id: string) {
  const result = await getPool().query(
    `SELECT status FROM dbo.am_budget_mst WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateBudgetHeader(id: string, data: {
  budgetName: string; businessEntity: string; businessEntityName: string;
  budgetOwnerId: number; budgetOwnerName: string; periodMstId: number;
  startDate: string; endDate: string; modifiedBy: string;
}) {
  await getPool().query(`
    UPDATE dbo.am_budget_mst SET
      budget_name = $1,
      business_entity = $2,
      business_entity_name = $3,
      budget_owner_id = $4,
      budget_owner_name = $5,
      period_mst_id = $6,
      start_date = $7,
      end_date = $8,
      last_modified_date = NOW(),
      last_modified_by = $9
    WHERE id = $10
  `, [
    data.budgetName, data.businessEntity, data.businessEntityName,
    data.budgetOwnerId, data.budgetOwnerName, data.periodMstId,
    data.startDate, data.endDate, data.modifiedBy, id
  ]);
}

export async function deleteBudget(id: string) {
  await getPool().query(`DELETE FROM dbo.am_budget_location_map WHERE budget_line_id IN (SELECT id FROM dbo.am_budget_lines WHERE budget_mst_id = $1)`, [id]);
  await getPool().query(`DELETE FROM dbo.am_budget_depart_map WHERE budget_line_id IN (SELECT id FROM dbo.am_budget_lines WHERE budget_mst_id = $1)`, [id]);
  await getPool().query(`DELETE FROM dbo.am_budget_period_amts_map WHERE budget_line_id IN (SELECT id FROM dbo.am_budget_lines WHERE budget_mst_id = $1)`, [id]);
  await getPool().query(`DELETE FROM dbo.am_budget_lines WHERE budget_mst_id = $1`, [id]);
  await getPool().query(`DELETE FROM dbo.am_budget_mst WHERE id = $1`, [id]);
}

export async function getBudgetWithOwnerDept(id: string) {
  const result = await getPool().query(
    `SELECT b.*, u.department_name as owner_department, u.email_id as owner_email
     FROM dbo.am_budget_mst b
     LEFT JOIN dbo.um_user_dtls u ON b.budget_owner_id::text = u.id::text
     WHERE b.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getBudgetLineCount(budgetId: string) {
  const result = await getPool().query(
    `SELECT COUNT(*) as count FROM dbo.am_budget_lines WHERE budget_mst_id = $1`,
    [budgetId]
  );
  return parseInt(result.rows[0].count);
}

export async function updateBudgetStatusAndTask(id: string, data: {
  status: string; taskId?: string; approversList?: string;
  rejectComments?: string; modifiedBy: string;
}) {
  if (data.status === 'Pending Approval' && data.taskId) {
    await getPool().query(`
      UPDATE dbo.am_budget_mst SET
        status = 'Pending Approval',
        attribute_12 = $1,
        approvers_list = $2,
        last_modified_date = NOW(),
        last_modified_by = $3
      WHERE id = $4
    `, [data.taskId, data.approversList || '', data.modifiedBy, id]);
  } else if (data.status === 'Approved') {
    await getPool().query(
      `UPDATE dbo.am_budget_mst SET status = 'Approved', last_modified_date = NOW(), last_modified_by = $1 WHERE id = $2`,
      [data.modifiedBy, id]
    );
  } else if (data.status === 'Rejected') {
    await getPool().query(
      `UPDATE dbo.am_budget_mst SET 
         status = 'Rejected', 
         attribute_5 = $1, 
         approvers_list = NULL,
         last_modified_date = NOW(), 
         last_modified_by = $2 
       WHERE id = $3`,
      [data.rejectComments || "", data.modifiedBy, id]
    );
  } else if (data.status === 'More Info Required') {
    await getPool().query(
      `UPDATE dbo.am_budget_mst SET 
         status = 'More Info Required', 
         approvers_list = $1,
         last_modified_date = NOW(), 
         last_modified_by = $2 
       WHERE id = $3`,
      [data.approversList || '', data.modifiedBy, id]
    );
  } else if (data.status === 'ReSubmit') {
    await getPool().query(
      `UPDATE dbo.am_budget_mst SET 
         status = 'Pending Approval', 
         last_modified_date = NOW(), 
         last_modified_by = $1 
       WHERE id = $2`,
      [data.modifiedBy, id]
    );
  }
}

export async function updateBudgetTaskId(budgetId: string, taskId: string, modifiedBy: string) {
  await getPool().query(
    `UPDATE dbo.am_budget_mst SET attribute_12 = $1, last_modified_date = NOW(), last_modified_by = $2 WHERE id = $3`,
    [taskId, modifiedBy, budgetId]
  );
}

export async function updateBudgetApproversList(budgetId: string, approversList: string) {
  await getPool().query(
    `UPDATE dbo.am_budget_mst SET approvers_list = $1, last_modified_date = NOW() WHERE id = $2`,
    [approversList, budgetId]
  );
}

export async function getUserDetails(userId: number) {
  const result = await getPool().query(
    `SELECT id, user_name, email_id, name, designation, department_name 
     FROM dbo.um_user_dtls WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || {};
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

export async function getTaskCreationDate(taskId: string) {
  try {
    const result = await getPool().query(
      `SELECT create_time_ FROM dbo.act_ru_task WHERE id_ = $1`,
      [taskId]
    );
    return result.rows[0]?.create_time_ || null;
  } catch (e) {
    return null;
  }
}

export async function insertApprovalHistory(data: {
  objectId: string; comments: string; approverId: number;
  approverName: string; email: string; designation: string;
  status: string; requestedDate: Date; createdBy: string;
}) {
  await getPool().query(`
    INSERT INTO dbo.supp_regstr_appr_dtls 
    ( object_id, supplier_id, comments, approver_id, approver_name, 
     attribute_9, attribute_10, status, requested_date, approved_date, 
     attribute_1, created_by, creation_date)
    VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8, NOW(), 'BUDGET', $9, NOW())
  `, [
    data.objectId, data.comments, data.approverId,
    data.approverName, data.email, data.designation,
    data.status, data.requestedDate, data.createdBy
  ]);
}

export async function getBudgetFull(id: string) {
  const result = await getPool().query(`SELECT * FROM dbo.am_budget_mst WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function getBudgetLines(budgetId: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.am_budget_lines WHERE budget_mst_id = $1 ORDER BY id`,
    [budgetId]
  );
  return result.rows;
}

export async function copyBudgetHeader(originalBudget: any, newNumber: string, newName: string, createdBy: string | number): Promise<number> {
  const currency = await getEntityCurrency(originalBudget.business_entity);
  const result = await getPool().query(`
    INSERT INTO dbo.am_budget_mst (
      budget_id, budget_name, status,
      budget_owner_id, budget_owner_name,
      business_entity, business_entity_name,
      period_mst_id, start_date, end_date,
      budget_amount, consumed_amount, reserved_amount,
      budget_curr, created_by, creation_date, last_modified_by, last_modified_date
    ) VALUES (
      $1, $2, 'Draft',
      $3, $4,
      $5, $6,
      $7, $8, $9,
      0, 0, 0,
      $10, $11, NOW(), $11, NOW()
    )
    RETURNING id
  `, [
    newNumber, newName,
    originalBudget.budget_owner_id, originalBudget.budget_owner_name,
    originalBudget.business_entity, originalBudget.business_entity_name,
    originalBudget.period_mst_id, originalBudget.start_date, originalBudget.end_date,
    currency, createdBy
  ]);
  return result.rows[0].id;
}

export async function copyBudgetLines(originalBudgetId: string, newBudgetId: number, _createdBy: string | number) {
  const linesResult = await getPool().query(`
    SELECT * FROM dbo.am_budget_lines WHERE budget_mst_id = $1
  `, [originalBudgetId]);

  for (const line of linesResult.rows) {
    const newLineResult = await getPool().query(`
      INSERT INTO dbo.am_budget_lines (
        budget_mst_id, segment_dtl_id, segment_dtl_code, segment_dtl_name,
        amount, consumed_amount, reserved_amount, description
      ) VALUES ($1, $2, $3, $4, $5, 0, 0, $6)
      RETURNING id
    `, [newBudgetId, line.segment_dtl_id, line.segment_dtl_code, line.segment_dtl_name, line.amount, line.description || null]);

    const newLineId = newLineResult.rows[0].id;

    const locMappings = await getPool().query(
      `SELECT * FROM dbo.am_budget_location_map WHERE budget_line_id = $1`,
      [line.id]
    );
    for (const loc of locMappings.rows) {
      await getPool().query(`
        INSERT INTO dbo.am_budget_location_map (budget_line_id, loc_id, loc_name)
        VALUES ($1, $2, $3)
      `, [newLineId, loc.loc_id, loc.loc_name]);
    }

    const deptMappings = await getPool().query(
      `SELECT * FROM dbo.am_budget_depart_map WHERE budget_line_id = $1`,
      [line.id]
    );
    for (const dept of deptMappings.rows) {
      await getPool().query(`
        INSERT INTO dbo.am_budget_depart_map (budget_line_id, dept_id, dept_name)
        VALUES ($1, $2, $3)
      `, [newLineId, dept.dept_id, dept.dept_name]);
    }

    const periodMappings = await getPool().query(
      `SELECT * FROM dbo.am_budget_period_amts_map WHERE budget_line_id = $1`,
      [line.id]
    );
    for (const period of periodMappings.rows) {
      await getPool().query(`
        INSERT INTO dbo.am_budget_period_amts_map (budget_line_id, period_line_id, period_line_name, amount, currency, consumed_amount, reserved_amount)
        VALUES ($1, $2, $3, $4, $5, 0, 0)
      `, [newLineId, period.period_line_id, period.period_line_name, period.amount, period.currency]);
    }
  }
}

export async function copyBudgetPeriods(originalBudgetId: string, newBudgetId: number, createdBy: string | number) {
  const periodsResult = await getPool().query(`
    SELECT * FROM dbo.am_budget_period_amts_map WHERE budget_id = $1
  `, [originalBudgetId]);

  for (const period of periodsResult.rows) {
    const maxPeriodIdResult = await getPool().query(`
      SELECT COALESCE(MAX(id), 0) + 1 as new_id FROM dbo.am_budget_period_amts_map
    `);
    const newPeriodId = maxPeriodIdResult.rows[0].new_id;

    await getPool().query(`
      INSERT INTO dbo.am_budget_period_amts_map (
        id, budget_id, period_name, period_start_date, period_end_date,
        period_amount, consumed_amount, reserved_amount, available_amount,
        utilization_percentage, created_by, creation_date
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, 0, 0, $6,
        0, $7, NOW()
      )
    `, [
      newPeriodId, newBudgetId, period.period_name,
      period.period_start_date, period.period_end_date,
      period.period_amount, createdBy
    ]);
  }
}

export async function copyBudgetDepartments(originalBudgetId: string, newBudgetId: number, createdBy: string | number) {
  const deptsResult = await getPool().query(`
    SELECT * FROM dbo.am_budget_depart_map WHERE budget_id = $1
  `, [originalBudgetId]);

  for (const dept of deptsResult.rows) {
    const maxDeptIdResult = await getPool().query(`
      SELECT COALESCE(MAX(id), 0) + 1 as new_id FROM dbo.am_budget_depart_map
    `);
    const newDeptId = maxDeptIdResult.rows[0].new_id;

    await getPool().query(`
      INSERT INTO dbo.am_budget_depart_map (
        id, budget_id, department_id, department_name, allocation_amount,
        consumed_amount, reserved_amount, available_amount,
        utilization_percentage, created_by, creation_date
      ) VALUES (
        $1, $2, $3, $4, $5,
        0, 0, $5,
        0, $6, NOW()
      )
    `, [newDeptId, newBudgetId, dept.department_id, dept.department_name, dept.allocation_amount, createdBy]);
  }
}

export async function copyBudgetLocations(originalBudgetId: string, newBudgetId: number, createdBy: string | number) {
  const locsResult = await getPool().query(`
    SELECT * FROM dbo.am_budget_location_map WHERE budget_id = $1
  `, [originalBudgetId]);

  for (const loc of locsResult.rows) {
    const maxLocIdResult = await getPool().query(`
      SELECT COALESCE(MAX(id), 0) + 1 as new_id FROM dbo.am_budget_location_map
    `);
    const newLocId = maxLocIdResult.rows[0].new_id;

    await getPool().query(`
      INSERT INTO dbo.am_budget_location_map (
        id, budget_id, location_id, location_name, allocation_amount,
        consumed_amount, reserved_amount, available_amount,
        utilization_percentage, created_by, creation_date
      ) VALUES (
        $1, $2, $3, $4, $5,
        0, 0, $5,
        0, $6, NOW()
      )
    `, [newLocId, newBudgetId, loc.location_id, loc.location_name, loc.allocation_amount, createdBy]);
  }
}

export async function getApprovedBudgetLines() {
  const result = await getPool().query(`
    SELECT
      bl.id,
      bl.segment_dtl_code,
      bl.segment_dtl_name,
      bl.amount,
      bl.consumed_amount,
      bl.reserved_amount,
      bm.business_entity,
      bm.id as budget_mst_id,
      bm.budget_name,
      bm.budget_curr,
      bd.dept_id,
      bloc.loc_id
    FROM dbo.am_budget_lines bl
    JOIN dbo.am_budget_mst bm ON bl.budget_mst_id = bm.id
    JOIN dbo.am_budget_depart_map bd ON bl.id = bd.budget_line_id
    JOIN dbo.am_budget_location_map bloc ON bl.id = bloc.budget_line_id
    WHERE bm.status = 'Approved'
    GROUP BY bl.id, bl.segment_dtl_code, bl.segment_dtl_name, bl.amount, bl.consumed_amount, bl.reserved_amount, bm.business_entity, bm.id, bm.budget_name, bm.budget_curr, bd.dept_id, bloc.loc_id
    ORDER BY bm.budget_name, bl.segment_dtl_name
  `);
  return result.rows;
}

export async function getLocations(businessEntityId?: string) {
  if (businessEntityId) {
    const result = await getPool().query(`
      SELECT id, location_name as name
      FROM dbo.am_locations_mst
      WHERE org_id = $1
      ORDER BY location_name
    `, [businessEntityId]);
    return result.rows;
  }
  const result = await getPool().query(`
    SELECT id, location_name as name
    FROM dbo.am_locations_mst
    ORDER BY location_name
  `);
  return result.rows;
}

export async function getDepartments() {
  const result = await getPool().query(`
    SELECT id, code, value as name 
    FROM dbo.am_bussiness_seg_dtl 
    WHERE segment_type_id = 3
    ORDER BY value
  `);
  return result.rows;
}

export async function addBudgetLine(budgetId: string, data: {
  costCenterId: number; costCenterCode: string; costCenterName: string;
  amount: number; description?: string; locationIds?: number[]; departmentIds?: number[];
  periodAmts?: {
    periodLineId: string;
    periodLineName: string;
    amount: number;
    consumedAmount?: number;
    reservedAmount?: number;
    currency?: string;
  }[];
}) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const lineResult = await client.query(
      `
        INSERT INTO dbo.am_budget_lines (
          budget_mst_id, segment_dtl_id, segment_dtl_code, segment_dtl_name,
          amount, consumed_amount, reserved_amount, description
        ) VALUES ($1, $2, $3, $4, $5, 0, 0, $6)
        RETURNING id
      `,
      [budgetId, data.costCenterId, data.costCenterCode, data.costCenterName, Number(data.amount) || 0, data.description || null]
    );

    const lineId = lineResult.rows[0].id;

    if (data.locationIds?.length) {
      for (const locId of data.locationIds) {
        const locResult = await client.query(
          `SELECT location_name FROM dbo.am_locations_mst WHERE id = $1`,
          [locId]
        );
        const locName = locResult.rows[0]?.location_name || "";
        await client.query(
          `
            INSERT INTO dbo.am_budget_location_map (budget_line_id, loc_id, loc_name)
            VALUES ($1, $2, $3)
          `,
          [lineId, locId, locName]
        );
      }
    }

    if (data.periodAmts?.length) {
      for (const period of data.periodAmts) {
        await client.query(
          `
            INSERT INTO dbo.am_budget_period_amts_map (
              budget_line_id,
              period_line_id,
              period_line_name,
              amount,
              consumed_amount,
              reserved_amount,
              currency
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            lineId,
            period.periodLineId,
            period.periodLineName,
            Number(period.amount) || 0,
            Number(period.consumedAmount) || 0,
            Number(period.reservedAmount) || 0,
            period.currency || null,
          ]
        );
      }
    }

    if (data.departmentIds?.length) {
      for (const deptId of data.departmentIds) {
        const deptResult = await client.query(
          `SELECT value FROM dbo.am_bussiness_seg_dtl WHERE id = $1`,
          [deptId]
        );
        const deptName = deptResult.rows[0]?.value || "";
        await client.query(
          `
            INSERT INTO dbo.am_budget_depart_map (budget_line_id, dept_id, dept_name)
            VALUES ($1, $2, $3)
          `,
          [lineId, deptId, deptName]
        );
      }
    }

    await client.query("COMMIT");
    return lineId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateBudgetLine(budgetId: string, lineId: string, data: {
  costCenterId: number; costCenterCode: string; costCenterName: string;
  amount: number; description?: string; locationIds?: number[]; departmentIds?: number[];
  periodAmts?: { periodLineId: string; periodLineName: string; amount: number; currency?: string; }[];
}) {
  await getPool().query(`
    UPDATE dbo.am_budget_lines
    SET segment_dtl_id = $1, segment_dtl_code = $2, segment_dtl_name = $3, amount = $4, description = $5
    WHERE id = $6 AND budget_mst_id = $7
  `, [data.costCenterId, data.costCenterCode, data.costCenterName, data.amount || 0, data.description || null, lineId, budgetId]);

  await getPool().query(`DELETE FROM dbo.am_budget_location_map WHERE budget_line_id = $1`, [lineId]);
  await getPool().query(`DELETE FROM dbo.am_budget_depart_map WHERE budget_line_id = $1`, [lineId]);
  await getPool().query(`DELETE FROM dbo.am_budget_period_amts_map WHERE budget_line_id = $1`, [lineId]);

  if (data.locationIds && data.locationIds.length > 0) {
    for (const locId of data.locationIds) {
      const locResult = await getPool().query(
        `SELECT location_name FROM dbo.am_locations_mst WHERE id = $1`,
        [locId]
      );
      const locName = locResult.rows[0]?.location_name || '';
      await getPool().query(`
        INSERT INTO dbo.am_budget_location_map (budget_line_id, loc_id, loc_name)
        VALUES ($1, $2, $3)
      `, [lineId, locId, locName]);
    }
  }

  if (data.departmentIds && data.departmentIds.length > 0) {
    for (const deptId of data.departmentIds) {
      const deptResult = await getPool().query(
        `SELECT code, value FROM dbo.am_bussiness_seg_dtl WHERE id = $1`,
        [deptId]
      );
      const deptName = deptResult.rows[0]?.value || '';
      await getPool().query(`
        INSERT INTO dbo.am_budget_depart_map (budget_line_id, dept_id, dept_name)
        VALUES ($1, $2, $3)
      `, [lineId, deptId, deptName]);
    }
  }

  if (data.periodAmts && data.periodAmts.length > 0) {
    for (const period of data.periodAmts) {
      await getPool().query(`
        INSERT INTO dbo.am_budget_period_amts_map (budget_line_id, period_line_id, period_line_name, amount, consumed_amount, reserved_amount, currency)
        VALUES ($1, $2, $3, $4, 0, 0, $5)
      `, [lineId, period.periodLineId, period.periodLineName, Number(period.amount) || 0, period.currency || null]);
    }
  }

}

export async function insertBudgetLineLocation(lineId: number, locId: number, locName: string) {
  await getPool().query(
    `INSERT INTO dbo.am_budget_location_map (budget_line_id, loc_id, loc_name) VALUES ($1, $2, $3)`,
    [lineId, locId, locName]
  );
}

export async function insertBudgetLineDepartment(lineId: number, deptId: number, deptName: string) {
  await getPool().query(
    `INSERT INTO dbo.am_budget_depart_map (budget_line_id, dept_id, dept_name) VALUES ($1, $2, $3)`,
    [lineId, deptId, deptName]
  );
}

export async function deleteBudgetLine(budgetId: string, lineId: string) {
  await getPool().query(`DELETE FROM dbo.am_budget_location_map WHERE budget_line_id = $1`, [lineId]);
  await getPool().query(`DELETE FROM dbo.am_budget_depart_map WHERE budget_line_id = $1`, [lineId]);
  await getPool().query(`DELETE FROM dbo.am_budget_period_amts_map WHERE budget_line_id = $1`, [lineId]);
  await getPool().query(`DELETE FROM dbo.am_budget_lines WHERE id = $1 AND budget_mst_id = $2`, [lineId, budgetId]);
}

export async function updateBudgetTotalAmount(budgetId: string) {
  await getPool().query(`
    UPDATE dbo.am_budget_mst 
    SET budget_amount = (
      SELECT COALESCE(SUM(amount), 0) FROM dbo.am_budget_lines WHERE budget_mst_id = $1
    ),
    last_modified_date = NOW()
    WHERE id = $1
  `, [budgetId]);
}

export async function getBudgetLineById(lineId: string, budgetId: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.am_budget_lines WHERE id = $1 AND budget_mst_id = $2`,
    [lineId, budgetId]
  );
  return result.rows[0] || null;
}

export async function copyBudgetLine(budgetId: string, existingLine: any) {
  const newLineResult = await getPool().query(`
    INSERT INTO dbo.am_budget_lines (
      budget_mst_id, segment_dtl_id, segment_dtl_code, segment_dtl_name,
      amount, consumed_amount, reserved_amount, description
    ) VALUES ($1, $2, $3, $4, $5, 0, 0, $6)
    RETURNING id
  `, [budgetId, existingLine.segment_dtl_id, existingLine.segment_dtl_code, existingLine.segment_dtl_name, existingLine.amount, existingLine.description || null]);

  const newLineId = newLineResult.rows[0].id;
  const lineId = existingLine.id;

  const locMappings = await getPool().query(
    `SELECT * FROM dbo.am_budget_location_map WHERE budget_line_id = $1`,
    [lineId]
  );
  for (const loc of locMappings.rows) {
    await getPool().query(`
      INSERT INTO dbo.am_budget_location_map (budget_line_id, loc_id, loc_name)
      VALUES ($1, $2, $3)
    `, [newLineId, loc.loc_id, loc.loc_name]);
  }

  const deptMappings = await getPool().query(
    `SELECT * FROM dbo.am_budget_depart_map WHERE budget_line_id = $1`,
    [lineId]
  );
  for (const dept of deptMappings.rows) {
    await getPool().query(`
      INSERT INTO dbo.am_budget_depart_map (budget_line_id, dept_id, dept_name)
      VALUES ($1, $2, $3)
    `, [newLineId, dept.dept_id, dept.dept_name]);
  }

  const periodMappings = await getPool().query(
    `SELECT * FROM dbo.am_budget_period_amts_map WHERE budget_line_id = $1`,
    [lineId]
  );
  for (const period of periodMappings.rows) {
    await getPool().query(`
      INSERT INTO dbo.am_budget_period_amts_map (budget_line_id, period_line_id, period_line_name, amount, currency, consumed_amount, reserved_amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [newLineId, period.period_line_id, period.period_line_name, period.amount, period.currency, 0, 0]);
  }

  return newLineId;
}

export async function getBudgetDocuments(budgetId: string) {
  const result = await getPool().query(`
    SELECT id, file_name, file_path, attach_source, 
           created_by, created_date, last_modified_by, last_modified_date
    FROM dbo.am_collaboration_attachment_dtls 
    WHERE attach_source = 'BUDGET' AND entity_id = $1
    ORDER BY created_date DESC
  `, [String(budgetId)]);
  return result.rows;
}

export async function addBudgetDocument(budgetId: string, data: { fileName: string; filePath: string; createdBy: string }) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_collaboration_attachment_dtls (
      id, attach_source, entity_id, file_name, file_path, 
      created_by, created_date, last_modified_by, last_modified_date
    ) VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_collaboration_attachment_dtls),
      'BUDGET', $1, $2, $3, $4, NOW(), $4, NOW()
    )
    RETURNING id
  `, [String(budgetId), data.fileName, data.filePath || '', data.createdBy || 'system']);
  return result.rows[0].id;
}

export async function deleteBudgetDocument(budgetId: string, docId: string) {
  await getPool().query(`
    DELETE FROM dbo.am_collaboration_attachment_dtls
    WHERE id = $1 AND attach_source = 'BUDGET' AND entity_id = $2
  `, [docId, String(budgetId)]);
}

export async function getCollaborationDocumentById(docId: string) {
  const result = await getPool().query(
    `SELECT id, file_name, file_path FROM dbo.am_collaboration_attachment_dtls WHERE id = $1`,
    [docId]
  );
  return result.rows[0] || null;
}

export async function getBudgetNotes(budgetId: string) {
  const result = await getPool().query(`
    SELECT notes FROM dbo.am_budget_mst WHERE id = $1
  `, [budgetId]);
  return result.rows[0]?.notes || '';
}

export async function updateBudgetNotes(budgetId: string, notes: string) {
  await getPool().query(`
    UPDATE dbo.am_budget_mst SET notes = $1, last_modified_date = NOW() WHERE id = $2
  `, [notes, budgetId]);
}

export async function getBudgetComments(budgetId: string) {
  const result = await getPool().query(`
    SELECT id, comments, created_by, created_by_name, creation_date, 
           reviewer, reviewer_name, section, from_action
    FROM dbo.am_collaboration_dtl 
    WHERE entity_id = $1 AND type = 'BUDGET'
    ORDER BY creation_date DESC
  `, [String(budgetId)]);
  return result.rows;
}

export async function addBudgetComment(budgetId: string, data: { comments: string; createdBy: string; createdByName: string }) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_collaboration_dtl (
      id, entity_id, type, comments, created_by, created_by_name, 
      creation_date, last_updated_by, last_updated_date
    ) VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_collaboration_dtl),
      $1, 'BUDGET', $2, $3, $4, NOW(), $3, NOW()
    )
    RETURNING id
  `, [String(budgetId), data.comments, data.createdBy || 'system', data.createdByName || 'System']);
  return result.rows[0].id;
}

export async function deleteBudgetComment(budgetId: string, commentId: string) {
  await getPool().query(`
    DELETE FROM dbo.am_collaboration_dtl 
    WHERE id = $1 AND entity_id = $2 AND type = 'BUDGET'
  `, [commentId, String(budgetId)]);
}

export async function getBudgetDetail(id: string) {
  const headerResult = await getPool().query(
    `SELECT b.*, p.period_name 
     FROM dbo.am_budget_mst b
     LEFT JOIN dbo.am_period_mst p ON b.period_mst_id::integer = p.id
     WHERE b.id = $1`,
    [id]
  );

  if (headerResult.rows.length === 0) return null;

  const header = headerResult.rows[0];

  const linesResult = await getPool().query(
    `SELECT * FROM dbo.am_budget_lines WHERE budget_mst_id = $1 ORDER BY id`,
    [id]
  );

  const lineIds = linesResult.rows.map(l => l.id);
  let periodAmounts: any[] = [];
  let departmentMappings: any[] = [];
  let locationMappings: any[] = [];

  if (lineIds.length > 0) {
    const periodResult = await getPool().query(
      `SELECT * FROM dbo.am_budget_period_amts_map WHERE budget_line_id = ANY($1) ORDER BY id`,
      [lineIds]
    );
    periodAmounts = periodResult.rows;

    const deptResult = await getPool().query(
      `SELECT * FROM dbo.am_budget_depart_map WHERE budget_line_id = ANY($1) ORDER BY id`,
      [lineIds]
    );
    departmentMappings = deptResult.rows;

    const locResult = await getPool().query(
      `SELECT * FROM dbo.am_budget_location_map WHERE budget_line_id = ANY($1) ORDER BY id`,
      [lineIds]
    );
    locationMappings = locResult.rows;
  }

  const approvalHistoryResult = await getPool().query(
    `SELECT id, object_id, approver_id, approver_name, 
            attribute_9 as email, attribute_10 as designation, 
            status, comments, approved_date, requested_date, attribute_1
     FROM dbo.supp_regstr_appr_dtls 
     WHERE object_id = $1 AND attribute_1 = 'BUDGET'
     ORDER BY approved_date ASC`,
    [id]
  );

  const workflowStepsResult = await getPool().query(
    `SELECT ws.id, ws.name, ws.step_order, ws.step_type,
            wsa.assignment_type, wsa.assignment_expression
     FROM dbo.wf_step ws
     LEFT JOIN dbo.wf_step_assignment wsa ON ws.id = wsa.step_id
     WHERE ws.wf_definition_id = (
       SELECT id FROM dbo.wf_definition WHERE name = 'Budget' LIMIT 1
     )
     ORDER BY ws.step_order ASC`
  );

  return {
    header,
    lines: linesResult.rows,
    periodAmounts,
    departmentMappings,
    locationMappings,
    approvalHistory: approvalHistoryResult.rows,
    workflowSteps: workflowStepsResult.rows
  };
}
