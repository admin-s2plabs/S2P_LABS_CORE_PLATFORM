import { getContextPool } from "../../tenant-context";
import { pool } from "../_shared";
const getPool = () => getContextPool() ?? pool;

async function getSupplierPrefixValue(): Promise<string> {
  const result = await getPool().query(
    `SELECT prefix_value FROM dbo.am_prefix_mst
     WHERE UPPER(TRIM(prefix_name)) = 'SUPPLIER'
     AND status = 'Active'
     LIMIT 1`
  );
  return result.rows[0]?.prefix_value?.trim() || "SUPP";
}

async function getSupplierPrefixAndIncrement(): Promise<string> {
  const prefix = await getSupplierPrefixValue();
  const finalPrefix = prefix && prefix.trim() !== '' ? prefix : 'SUPP';
  const maxResult = await getPool().query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(supplier_id, '^.*_', '') AS INTEGER)), 0) as max_seq
     FROM dbo.supp_basic_org_dtls
     WHERE supplier_id ~ '^.+_[0-9]+$'`
  );
  const maxSeq = maxResult.rows[0]?.max_seq || 0;
  const nextSeq = maxSeq === 0 ? 1001 : maxSeq + 1;
  return `${finalPrefix}_${String(nextSeq).padStart(4, "0")}`;
}

export async function getAllSuppliersForAI() {
  const result = await getPool().query(`
    SELECT id, company_name, email_id, phone, mobile_no, city, state, country, status,
           legal_entity_type, registration_no, license_no, tax_reg_no,
           annual_turn_over, turn_over_currency, no_of_employees, company_size,
           year_of_exp_loc_market, year_of_exp_international, type_of_company,
           payment_terms, web_address, type_of_service, score
    FROM dbo.supp_basic_org_dtls
    ORDER BY company_name
  `);
  return result.rows;
}

export async function getSupplierByIdForAI(supplierId: number) {
  const result = await getPool().query(`
    SELECT id, company_name, email_id, phone, mobile_no, city, state, country, status,
           legal_entity_type, registration_no, license_no, tax_reg_no,
           annual_turn_over, turn_over_currency, no_of_employees, company_size,
           year_of_exp_loc_market, year_of_exp_international, type_of_company,
           payment_terms, web_address, type_of_service, score, address1, address2
    FROM dbo.supp_basic_org_dtls
    WHERE id = $1
  `, [supplierId]);
  return result.rows[0] || null;
}

export async function getAllSupplierDocumentsForAI(supplierId: number) {
  const result = await getPool().query(`
    SELECT id, doc_name, doc_type, doc_no, filename, expiry_date, status, category
    FROM dbo.supp_document_dtls
    WHERE supplier_id = $1 AND record_type = 'SUPPLIER_REG'
    ORDER BY id
  `, [supplierId]);
  return result.rows;
}

export async function getDboSupplierDocuments(supplierId: number) {
  const result = await getPool().query(`
    SELECT id, doc_name, doc_type, doc_no, doc_desc, filename, filetype, expiry_date, status, record_type, category, creation_date, doc_uri, doc_path
    FROM dbo.supp_document_dtls WHERE supplier_id = $1 AND record_type = 'SUPPLIER_REG' AND (status = 'Active' OR status IS NULL) ORDER BY id
  `, [supplierId]);
  return result.rows.map((row: any) => ({
    ...row,
    doc_uri: row.doc_uri ? Buffer.from(row.doc_uri).toString('base64') : null,
  }));
}

export async function getSuppliersList(limit: number) {
  const result = await getPool().query(`
    SELECT id, company_name, email_id, phone, city, country, status
    FROM dbo.supp_basic_org_dtls
    WHERE status = 'Approved' OR status IS NULL
    ORDER BY company_name
    LIMIT $1
  `, [limit]);
  return { data: result.rows };
}

export async function getTaxCodes() {
  const result = await getPool().query(`
    SELECT id, tax_code_id, tax_code, tax_code_desc, tax_rate, tax_type
    FROM dbo.am_tax_code_mapping_mst
    WHERE status = 'Y'
    ORDER BY tax_rate
  `);
  return result.rows;
}

function buildUserEmailFilter(userEmails: string[], paramStartIndex: number): { clause: string; params: any[] } {
  if (userEmails.length === 0) return { clause: '', params: [] };
  const placeholders = userEmails.map((_, i) => `$${paramStartIndex + i}`).join(', ');
  return { clause: `(to_user IN (${placeholders}) OR attribute_13 IN (${placeholders}))`, params: [...userEmails] };
}

export async function getEmailNotifications(params: {
  page: number;
  limit: number;
  search?: string;
  userEmails: string[];
}) {
  const { page, limit, search, userEmails } = params;
  const offset = (page - 1) * limit;

  let whereClause = "WHERE 1=1";
  const queryParams: any[] = [];
  let paramIndex = 1;

  const emailFilter = buildUserEmailFilter(userEmails, paramIndex);
  if (emailFilter.clause) {
    whereClause += ` AND ${emailFilter.clause}`;
    queryParams.push(...emailFilter.params);
    paramIndex += emailFilter.params.length;
  }

  if (search) {
    whereClause += ` AND (notif_subject ILIKE $${paramIndex} OR to_user ILIKE $${paramIndex} OR from_user ILIKE $${paramIndex})`;
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_email_notif_dtls ${whereClause}`,
    queryParams
  );

  const result = await getPool().query(`
    SELECT id, notification_id, notif_subject, notif_msg, from_user, to_user,
           attribute_13, status, recieved_date, creation_date, created_by
    FROM dbo.am_email_notif_dtls
    ${whereClause}
    ORDER BY recieved_date DESC NULLS LAST, id DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...queryParams, limit, offset]);

  return {
    data: result.rows,
    total: parseInt(countResult.rows[0].total),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
  };
}

export async function getLatestEmailNotifications(userEmails: string[]) {
  const emailFilter = buildUserEmailFilter(userEmails, 1);
  const whereClause = emailFilter.clause ? `WHERE ${emailFilter.clause}` : '';

  const result = await getPool().query(`
    SELECT id, notification_id, notif_subject, from_user, to_user, attribute_13,
           status, recieved_date
    FROM dbo.am_email_notif_dtls
    ${whereClause}
    ORDER BY recieved_date DESC NULLS LAST, id DESC
    LIMIT 3
  `, emailFilter.params);

  return result.rows;
}

export async function getCurrentApprover(supplierId: number, processName: string) {
  const result = await getPool().query(`
    SELECT u.name, si.current_assignee FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    join dbo.um_user_dtls u on si.current_assignee = u.email_id
    where si.ref_number = $1 and si.status = 'Ready'
    and i.process_name = $2`,
    [supplierId, processName]
  );
  if(result.rows.length>0){
  return result.rows[0];
  }

  const result2 = await getPool().query(
    `SELECT si.current_assignee as name FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    where i.process_name = $2 and si.status = 'Ready'
    and si.ref_number = $1`,
    [supplierId, processName]
  );
  if(result2.rows.length>0){
   return result2.rows[0];
  }
  return null;
}

export async function getUnreadNotificationCount(userEmails: string[]) {
  let whereClause = "WHERE (status = 'New' OR status = 'Sent' OR status IS NULL)";
  const emailFilter = buildUserEmailFilter(userEmails, 1);
  if (emailFilter.clause) {
    whereClause += ` AND ${emailFilter.clause}`;
  }

  const result = await getPool().query(`
    SELECT COUNT(*) as count 
    FROM dbo.am_email_notif_dtls 
    ${whereClause}
  `, emailFilter.params);

  return parseInt(result.rows[0].count) || 0;
}

export async function markNotificationRead(id: string) {
  await getPool().query(`
    UPDATE dbo.am_email_notif_dtls 
    SET status = 'Read', last_modified_date = NOW()
    WHERE id = $1
  `, [id]);
}

export async function markAllNotificationsRead(userEmails: string[]) {
  let whereClause = "WHERE (status = 'New' OR status = 'Sent' OR status IS NULL)";
  const emailFilter = buildUserEmailFilter(userEmails, 1);
  if (emailFilter.clause) {
    whereClause += ` AND ${emailFilter.clause}`;
  }

  await getPool().query(`
    UPDATE dbo.am_email_notif_dtls 
    SET status = 'Read', last_modified_date = NOW()
    ${whereClause}
  `, emailFilter.params);
}

export async function getBudgetLines() {
  const result = await getPool().query(`
    SELECT 
      bl.id,
      bl.segment_dtl_code,
      bl.segment_dtl_name,
      bl.amount,
      bl.consumed_amount,
      bl.reserved_amount,
      bm.id as budget_mst_id,
      bm.budget_name,
      bm.budget_curr
    FROM dbo.am_budget_lines bl
    JOIN dbo.am_budget_mst bm ON bl.budget_mst_id = bm.id
    WHERE bm.status IN ('Approved', 'Active')
    ORDER BY bm.budget_name, bl.segment_dtl_name
  `);
  return result.rows;
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
  return result.rows.map((r: any) => r.role_name);
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

export async function getSupplierWithDetails(supplierId: number) {
  const result = await getPool().query(`
    SELECT s.id, s.company_name, s.email_id, s.status, s.approvers_list,
           s.attribute_12, s.invitation_id, s.legal_entity_type
    FROM dbo.supp_basic_org_dtls s
    WHERE s.id = $1
  `, [supplierId]);
  return result.rows[0] || null;
}

export async function updateSupplierTaskId(supplierId: number, taskId: string, modifiedBy: string) {
  await getPool().query(
    `UPDATE dbo.supp_basic_org_dtls SET attribute_12 = $1, last_modified_date = NOW(), last_modified_by = $2 WHERE id = $3`,
    [taskId, modifiedBy, supplierId]
  );
}

export async function updateSupplierStatusAndTask(supplierId: number, data: {
  status: string; approversList?: string; modifiedBy: string;
}) {
  if (data.approversList !== undefined) {
    await getPool().query(`
      UPDATE dbo.supp_basic_org_dtls SET
        prev_status = CASE 
          WHEN prev_status IS NULL OR prev_status <> 'Active' THEN $1  
          ELSE prev_status 
        END,
        status = $1,
        approvers_list = $2,
        last_modified_date = NOW(),
        last_modified_by = $3
      WHERE id = $4
    `, [data.status, data.approversList, data.modifiedBy, supplierId]);
  } else {
    await getPool().query(`
      UPDATE dbo.supp_basic_org_dtls SET
        prev_status = CASE 
          WHEN prev_status IS NULL OR prev_status <> 'Active' THEN $1
          ELSE prev_status 
        END,
        status = $1,
        last_modified_date = NOW(),
        last_modified_by = $2
      WHERE id = $3
    `, [data.status, data.modifiedBy, supplierId]);
  }
}

export async function updateSupplierAttribute4(supplierId: number, attribute4: string, modifiedBy: string) {
  await getPool().query(`
    UPDATE dbo.supp_basic_org_dtls SET attribute_4 = $1, last_modified_date = NOW(), last_modified_by = $2 WHERE id = $3
  `, [attribute4, modifiedBy, supplierId]);
}

export async function updateSupplierApproversList(supplierId: number, approversList: string) {
  await getPool().query(
    `UPDATE dbo.supp_basic_org_dtls SET approvers_list = $1, last_modified_date = NOW() WHERE id = $2`,
    [approversList, supplierId]
  );
}

export async function updateInvitationStatus(invitationId: number, status: string, modifiedBy: string) {
  await getPool().query(`
    UPDATE dbo.supp_invitation_dtls SET
      status = $1,
      last_modified_date = NOW(),
      last_modified_by = $2
    WHERE id = $3
  `, [status, modifiedBy, invitationId]);
}

export async function updateInvitationEmail(invitationId: number, emailId: string, modifiedBy: string) {
  const result = await getPool().query(`
    UPDATE dbo.supp_invitation_dtls SET
      email_id = $1,
      last_modified_date = NOW(),
      last_modified_by = $2
    WHERE id = $3
    RETURNING *
  `, [emailId, modifiedBy, invitationId]);
  return result.rows[0];
}

export async function getSupplierOrgEmail(supplierId: number) {
  const result = await getPool().query(
    `SELECT id, email_id FROM dbo.supp_basic_org_dtls WHERE id = $1`,
    [supplierId]
  );
  return result.rows[0] || null;
}

export async function checkSupplierEmailAvailable(
  email: string,
  excludeSupplierId: number,
  excludeUserId?: number | null
) {
  const supplierResult = await getPool().query(
    `SELECT id, company_name FROM dbo.supp_basic_org_dtls
     WHERE LOWER(email_id) = LOWER($1) AND id != $2 LIMIT 1`,
    [email, excludeSupplierId]
  );
  if (supplierResult.rows.length > 0) {
    return { available: false, message: "Another supplier already uses this email address" };
  }

  const userParams: (string | number)[] = [email];
  let userClause = `LOWER(email_id) = LOWER($1)`;
  if (excludeUserId) {
    userClause += ` AND id != $2`;
    userParams.push(excludeUserId);
  }
  const userResult = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE ${userClause} LIMIT 1`,
    userParams
  );
  if (userResult.rows.length > 0) {
    return { available: false, message: "This email is already registered to another user" };
  }

  const userNameParams: (string | number)[] = [email];
  let userNameClause = `LOWER(user_name) = LOWER($1)`;
  if (excludeUserId) {
    userNameClause += ` AND id != $2`;
    userNameParams.push(excludeUserId);
  }
  const userNameResult = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE ${userNameClause} LIMIT 1`,
    userNameParams
  );
  if (userNameResult.rows.length > 0) {
    return { available: false, message: "This email is already used as a login username" };
  }

  return { available: true };
}

export async function updateSupplierOrgEmail(
  supplierId: number,
  emailId: string,
  modifiedBy: string,
  supplierUserId?: number | null
) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const orgResult = await client.query(
      `SELECT email_id FROM dbo.supp_basic_org_dtls WHERE id = $1 FOR UPDATE`,
      [supplierId]
    );
    if (!orgResult.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const oldEmail = orgResult.rows[0].email_id as string | null;

    const updatedOrg = await client.query(
      `UPDATE dbo.supp_basic_org_dtls SET
        prev_email_id = email_id,
        email_id = $1,
        last_modified_by = $2,
        last_modified_date = NOW()
      WHERE id = $3
      RETURNING *`,
      [emailId, modifiedBy, supplierId]
    );

    if (supplierUserId) {
      await client.query(
        `UPDATE dbo.um_user_dtls SET
          email_id = $1,
          user_name = CASE
            WHEN LOWER(TRIM(COALESCE(user_name, ''))) = LOWER(TRIM(COALESCE($2, '')))
              OR LOWER(TRIM(COALESCE(user_name, ''))) = LOWER(TRIM(COALESCE($3, '')))
            THEN $1
            ELSE user_name
          END,
          last_modified_by = $4,
          last_modified_date = NOW()
        WHERE id = $5`,
        [emailId, oldEmail, oldEmail, modifiedBy, supplierUserId]
      );
    }

    await client.query("COMMIT");
    return updatedOrg.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getInvitationsPaginated(params: { page: number; limit: number; search?: string; status?: string }) {
  const { page, limit, search, status } = params;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(LOWER(company_name) LIKE LOWER($${idx}) OR LOWER(email_id) LIKE LOWER($${idx}) OR CAST(id AS TEXT) LIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  if (status && status !== "all") {
    conditions.push(`status = $${idx}`);
    values.push(status);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.supp_invitation_dtls ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].total);

  const dataResult = await getPool().query(
    `SELECT id, company_name, email_id, invitation_date, status, resend_count, invitation_sent_by_name
     FROM dbo.supp_invitation_dtls ${whereClause}
     ORDER BY id DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function checkOrgUserEmailExists(email: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(email_id) = LOWER($1) LIMIT 1`,
    [email]
  );
  return result.rows.length > 0;
}

export async function checkOnboardEmailExists(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const suppResult = await getPool().query(
    `SELECT id FROM dbo.supp_basic_org_dtls WHERE LOWER(email_id) = $1 LIMIT 1`,
    [normalized]
  );
  if (suppResult.rows.length > 0) return true;
  const userEmailResult = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(email_id) = $1 LIMIT 1`,
    [normalized]
  );
  if (userEmailResult.rows.length > 0) return true;
  const userNameResult = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(user_name) = $1 LIMIT 1`,
    [normalized]
  );
  if (userNameResult.rows.length > 0) return true;
  return false;
}

export async function checkOnboardCompanyExists(companyName: string): Promise<boolean> {
  const normalized = companyName.trim().toLowerCase();
  if (!normalized) return false;
  const suppResult = await getPool().query(
    `SELECT id FROM dbo.supp_basic_org_dtls WHERE LOWER(TRIM(company_name)) = $1 LIMIT 1`,
    [normalized]
  );
  if (suppResult.rows.length > 0) return true;
  const orgResult = await getPool().query(
    `SELECT id FROM dbo.um_org_dtls WHERE LOWER(TRIM(organization_name)) = $1 LIMIT 1`,
    [normalized]
  );
  if (orgResult.rows.length > 0) return true;
  const invResult = await getPool().query(
    `SELECT id FROM dbo.supp_invitation_dtls
     WHERE LOWER(TRIM(company_name)) = $1
       AND status NOT IN ('Cancelled', 'Rejected', 'Expired')
     LIMIT 1`,
    [normalized]
  );
  return invResult.rows.length > 0;
}

export async function findActiveSupplierByEmail(email: string) {
  const normalized = email.trim();
  if (!normalized) return null;
  const result = await getPool().query(
    `SELECT id, supplier_id, company_name, email_id, status
     FROM dbo.supp_basic_org_dtls
     WHERE LOWER(TRIM(email_id)) = LOWER($1)
       AND status = 'Active'
     LIMIT 1`,
    [normalized]
  );
  return result.rows[0] || null;
}

export async function checkDuplicateInvitation(companyName: string, email: string) {
  const duplicates: Array<{ source: string; id?: number; company_name?: string; email_id?: string; status?: string }> = [];

  const userResult = await getPool().query(
    `SELECT id, email_id, name FROM dbo.um_user_dtls WHERE LOWER(email_id) = LOWER($1) LIMIT 1`,
    [email]
  );
  if (userResult.rows.length > 0) {
    duplicates.push({ source: 'user', email_id: userResult.rows[0].email_id, company_name: userResult.rows[0].name, status: 'Existing User' });
  }

  const orgResult = await getPool().query(
    `SELECT id, organization_name FROM dbo.um_org_dtls WHERE LOWER(organization_name) = LOWER($1) LIMIT 1`,
    [companyName]
  );
  if (orgResult.rows.length > 0) {
    duplicates.push({ source: 'organization', company_name: orgResult.rows[0].organization_name, status: 'Existing Organization' });
  }

  const suppExactResult = await getPool().query(
    `SELECT id, company_name, email_id, status FROM dbo.supp_basic_org_dtls WHERE LOWER(company_name) = LOWER($1) LIMIT 5`,
    [companyName]
  );
  for (const row of suppExactResult.rows) {
    duplicates.push({ source: 'supplier', id: row.id, company_name: row.company_name, email_id: row.email_id, status: row.status || 'Existing Supplier' });
  }

  const suppExactIds = new Set(suppExactResult.rows.map((r: any) => r.id));
  const suppPatternResult = await getPool().query(
    `SELECT id, company_name, email_id, status
      FROM dbo.supp_basic_org_dtls
      WHERE LOWER(company_name) = LOWER($1)
        OR LOWER(email_id) = LOWER($2)`,
    [companyName, email]
  );
  for (const row of suppPatternResult.rows) {
    if (!suppExactIds.has(row.id)) {
      duplicates.push({ source: 'supplier_pattern', id: row.id, company_name: row.company_name, email_id: row.email_id, status: row.status || 'Similar Supplier' });
    }
  }

  const invResult = await getPool().query(
    `SELECT id, company_name, email_id, status FROM dbo.supp_invitation_dtls
     WHERE (LOWER(email_id) = LOWER($1) OR LOWER(company_name) = LOWER($2))
       AND status NOT IN ('Cancelled', 'Rejected', 'Expired')
     ORDER BY id DESC LIMIT 5`,
    [email, companyName]
  );
  for (const row of invResult.rows) {
    duplicates.push({ source: 'invitation', id: row.id, company_name: row.company_name, email_id: row.email_id, status: row.status });
  }

  const invExactIds = new Set(invResult.rows.map((r: any) => r.id));
  const invPatternResult = await getPool().query(
    `SELECT id, company_name, email_id, status
      FROM dbo.supp_invitation_dtls
      WHERE (
          LOWER(company_name) = LOWER($1)
          OR LOWER(email_id) = LOWER($2)
      )
      AND status NOT IN ('Cancelled', 'Rejected', 'Expired')
      ORDER BY id DESC LIMIT 5`,
    [companyName, email]
  );
  for (const row of invPatternResult.rows) {
    if (!invExactIds.has(row.id)) {
      duplicates.push({ source: 'invitation_pattern', id: row.id, company_name: row.company_name, email_id: row.email_id, status: row.status });
    }
  }

  return duplicates;
}
export async function checkOrgExists(companyName: string)
{
  const result = await getPool().query(
      `SELECT id, organization_name FROM dbo.um_org_dtls WHERE LOWER(organization_name) = LOWER($1)`,
      [companyName]
  );
  return result.rows.length > 0;
}

export async function getOrgDetails(orgId: string) {
  const result = await getPool().query(
    `SELECT id, organization_name FROM dbo.um_org_dtls WHERE id = $1 LIMIT 1`,
    [orgId]
  );
  return result.rows[0] || null;
}

export async function getInvitationById(invitationId: number) {
  const result = await getPool().query(
    `SELECT id, company_name, email_id, status FROM dbo.supp_invitation_dtls WHERE id = $1`,
    [invitationId]
  );
  return result.rows[0] || null;
}

export async function findInvitationForSupplier(supplierId: number) {
  const supplierResult = await getPool().query(
    `SELECT id, company_name, email_id, invitation_id, user_registered
     FROM dbo.supp_basic_org_dtls WHERE id = $1`,
    [supplierId]
  );
  const supplier = supplierResult.rows[0];
  if (!supplier) return null;

  let invitation: { id: number; company_name: string; email_id: string; status: string } | null = null;
  if (supplier.invitation_id) {
    invitation = await getInvitationById(supplier.invitation_id);
  }
  if (!invitation && supplier.email_id) {
    const invResult = await getPool().query(
      `SELECT id, company_name, email_id, status
       FROM dbo.supp_invitation_dtls
       WHERE LOWER(email_id) = LOWER($1)
       ORDER BY id DESC LIMIT 1`,
      [supplier.email_id]
    );
    invitation = invResult.rows[0] || null;
  }

  return { supplier, invitation };
}

export async function findSupplierUserId(supplierId: number) {
  const mapResult = await getPool().query(
    `SELECT u.id
     FROM dbo.supp_user_supplier_map_dtls m
     JOIN dbo.um_user_dtls u ON u.id = m.user_id
     WHERE m.supplier_id = $1 AND u.user_type = 1
     ORDER BY u.id ASC
     LIMIT 1`,
    [supplierId]
  );
  if (mapResult.rows[0]?.id) return mapResult.rows[0].id;

  const emailResult = await getPool().query(
    `SELECT u.id
     FROM dbo.supp_basic_org_dtls s
     JOIN dbo.um_user_dtls u ON LOWER(TRIM(u.email_id)) = LOWER(TRIM(s.email_id))
     WHERE s.id = $1 AND u.user_type = 1
     ORDER BY u.id ASC
     LIMIT 1`,
    [supplierId]
  );
  return emailResult.rows[0]?.id ?? null;
}

export async function createInvitation(data: {
  companyName: string; email: string; sentBy: string; sentByName: string;
}) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 5);

  const result = await getPool().query(`
    INSERT INTO dbo.supp_invitation_dtls
      (id, company_name, email_id, invitation_date, invitation_sent_by, invitation_sent_by_name,
       status, start_date, end_date, creation_date, resend_count, created_by, last_modified_date)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.supp_invitation_dtls),
      $1, $2, NOW(), $3, $4, 'Initiated', NOW(), $5, NOW(), 0, $3, NOW()
    )
    RETURNING id
  `, [data.companyName, data.email, data.sentBy, data.sentByName, endDate]);

  return result.rows[0].id;
}

export async function resendInvitation(invitationId: number, modifiedBy: string) {
  const result = await getPool().query(
    `UPDATE dbo.supp_invitation_dtls SET
       resend_count = COALESCE(resend_count, 0) + 1,
       invitation_date = NOW(),
       last_modified_date = NOW(),
       last_modified_by = $1,
       status = 'Initiated',
       end_date = NOW() + INTERVAL '5 days'
     WHERE id = $2
     RETURNING id, company_name, email_id, status`,
    [modifiedBy, invitationId]
  );
  return result.rows[0] || null;
}

export async function getInvitationStatusCounts() {
  const result = await getPool().query(
    `SELECT status, COUNT(*)::int as count FROM dbo.supp_invitation_dtls GROUP BY status`
  );
  const counts: Record<string, number> = {};
  result.rows.forEach((r: any) => { counts[r.status || 'Unknown'] = r.count; });
  return counts;
}

export async function insertVendorApprovalHistory(data: {
  objectId: string; supplierId: number; comments: string; approverId: number;
  approverName: string; email: string; designation: string;
  status: string; requestedDate: Date; createdBy: string;
}) {
  const maxIdResult = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_regstr_appr_dtls`);
  const nextId: number = maxIdResult.rows[0].next_id;

  await getPool().query(`
    INSERT INTO dbo.supp_regstr_appr_dtls 
    (object_id, supplier_id, comments, approver_id, approver_name, 
     attribute_9, attribute_10, status, requested_date, approved_date, 
     attribute_1, created_by, creation_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'VENDOR', $10, NOW())
  `, [
    data.objectId, data.supplierId, data.comments, data.approverId,
    data.approverName, data.email, data.designation,
    data.status, data.requestedDate, data.createdBy
  ]);
}

export async function getWorkflowTypeFromTask(taskId: string): Promise<'update' | 'new'> {
  const result = await getPool().query(`
    SELECT wi.subject 
    FROM dbo.wf_step_instance si
    JOIN dbo.wf_instance wi ON si.instance_id = wi.id
    WHERE si.task_id = $1
    LIMIT 1
  `, [taskId]);
  
  if (result.rows.length === 0) return 'new';
  const subject = (result.rows[0].subject || '').toLowerCase();
  return subject.includes('update') ? 'update' : 'new';
}

export async function checkSupplierDuplicateByName(companyName: string, email: string) {
  const orgResult = await getPool().query(
    `SELECT id, organization_name FROM dbo.um_org_dtls WHERE LOWER(organization_name) = LOWER($1) LIMIT 1`,
    [companyName]
  );
  if (orgResult.rows.length > 0) return { exists: true, source: "org" };

  const exactResult = await getPool().query(
    `SELECT id FROM dbo.supp_basic_org_dtls WHERE LOWER(company_name) = LOWER($1) OR LOWER(email_id) = LOWER($2) LIMIT 1`,
    [companyName, email]
  );
  if (exactResult.rows.length > 0) return { exists: true, source: "supplier_exact" };

  const mailResult = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(user_name) = LOWER($1) LIMIT 1`,
    [email]
  );
  if (mailResult.rows.length > 0) return { exists: true, source: "duplicate email" };
  // const patternResult = await getPool().query(
  //   `SELECT id FROM dbo.supp_basic_org_dtls
  //    WHERE LOWER(company_name) LIKE '%' || LOWER($1) || '%'
  //       OR LOWER($1) LIKE '%' || LOWER(company_name) || '%'
  //    LIMIT 1`,
  //   [companyName]
  // );
  // if (patternResult.rows.length > 0) return { exists: true, source: "supplier_pattern" };

  return { exists: false };
}

export async function getMainOrg() {
  const result = await getPool().query(
    `SELECT id, organization_name, currency, date_format, default_paymentterms, default_tax, org_type
     FROM dbo.um_org_dtls WHERE org_type = 'INTERNAL' ORDER BY id LIMIT 1`
  );
  return result.rows[0] || null;
}

export async function getOrgByCountry(country: string) {
  const result = await getPool().query(
    `SELECT id, organization_name, currency, date_format, default_paymentterms, default_tax
     FROM dbo.um_org_dtls WHERE org_type = 'INTERNAL' AND LOWER(org_country) = LOWER($1) LIMIT 1`,
    [country]
  );
  return result.rows[0] || null;
}

export async function getFirstOperatingUnit() {
  const result = await getPool().query(
    `SELECT organization_id FROM dbo.am_operating_units_mst ORDER BY id LIMIT 1`
  );
  return result.rows[0]?.organization_id || null;
}

export async function getPaymentTermById(id: number) {
  const result = await getPool().query(
    `SELECT id, description FROM dbo.am_payment_terms_mst WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function quickCreateSupplier(data: {
  companyName: string;
  address: string;
  legalEntityType: string;
  city: string;
  state: string;
  licenseNo: string;
  country: string;
  postalCode: string;
  placeOfIssue: string;
  incorporationDate: string | null;
  contactName: string;
  designation: string;
  emailId: string;
  mobileNo: string;
  taxRegNo?: string;
  taxPayerId?: string;
  paymentTermsId?: number;
  paymentTermsDesc?: string;
  turnOverCurrency?: string;
  locations?: string;
  bankName?: string;
  beneficiaryName?: string;
  bankAddress?: string;
  bankCity?: string;
  bankState?: string;
  accountNo?: string;
  ifscCode?: string;
  bankCountry?: string;
  bankPostalCode?: string;
  swiftCode?: string;
  ibanNo?: string;
  bankCurrency?: string;
  createdBy: string;
  orgId?: number;
  orgName?: string;
}) {
  
  const formattedSupplierId = await getSupplierPrefixAndIncrement();

  const suppResult = await getPool().query(`
    INSERT INTO dbo.supp_basic_org_dtls
      (id, company_name, address_1, legal_entity_type, city, state, license_no,
       country, postalcode, place_of_issue, bus_trading_date,
       attribute_6, is_payment_fee_req, is_payment_renwal_req,
       attribute_11, attribute_12, attribute_13, tax_eligibility,
       tax_reg_no, tax_cntry, tax_payer_id, turn_over_currency, locations,
       payment_terms, payment_terms_id,
       status, prev_status, migrated, user_registered, erp_status,
       invitation_id, created_by, creation_date, last_modified_by, last_modified_date,
       supplier_id, attribute_4)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.supp_basic_org_dtls),
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      'N', 'N', 'N',
      'N', 'N', 'N', 'Y',
      $11, $7, $12, $13, $14,
      $15, $16,
      'Active', 'Active', 'New', 'No', 'Not Available',
      0, $17, NOW(), $17, NOW(),
      $18, 'Active'
    )
    RETURNING id
  `, [
    data.companyName, data.address, data.legalEntityType, data.city, data.state,
    data.licenseNo, data.country, data.postalCode, data.placeOfIssue,
    data.incorporationDate ? new Date(data.incorporationDate) : null,
    data.taxRegNo || null, data.taxPayerId || null,
    data.turnOverCurrency || null, data.locations || null,
    data.paymentTermsDesc || null, data.paymentTermsId || null,
    data.createdBy,
    formattedSupplierId
  ]);
  const supplierId = suppResult.rows[0].id;

  const siteResult = await getPool().query(`
    INSERT INTO dbo.supp_site_dtls
      (id, supplier_id, sitename, address_1, city, state, country, postalcode,
       org_id, email, phone,
       created_by, creation_date)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.supp_site_dtls),
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10,
      $11, NOW()
    )
    RETURNING id
  `, [
    supplierId, data.orgName || null, data.address, data.city, data.state,
    data.country, data.postalCode,
    data.orgId || null, data.emailId, data.mobileNo,
    data.createdBy
  ]);
  const siteId = siteResult.rows[0].id;

  await getPool().query(`
    INSERT INTO dbo.supp_contact_dtls
      (id, contact_name, designation, email, mobile, supplier_id,
       contact_category, is_auth_signatory, is_primary, contact_type,
       status, created_by, creation_date, last_modified_by, last_modified_date)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.supp_contact_dtls),
      $1, $2, $3, $4, $5,
      'Sales Services', 'Yes', 'Yes', 'Local',
      0, $6, NOW(), $6, NOW()
    )
  `, [data.contactName, data.designation || null, data.emailId, data.mobileNo, supplierId, data.createdBy]);

  await getPool().query(`
    UPDATE dbo.supp_basic_org_dtls
    SET phone = $1, email_id = $2, last_modified_by = $3, last_modified_date = NOW()
    WHERE id = $4
  `, [data.mobileNo, data.emailId, data.createdBy, supplierId]);

  if (data.accountNo) {
    await getPool().query(`
      INSERT INTO dbo.supp_bank_dtls
        (id, bank_name, beneficiary_name, beneficiary_address, bank_address,
         branch_name, branch_party_id, city, region, country, postal_code,
         account_no, ifsccode, swift_code, iban_no, currency,
         bank_account_type, primary_account, supp_site_id, supplier_id,
         status, created_by, creation_date, last_modified_by, last_modified_date)
      VALUES (
        (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.supp_bank_dtls),
        $1, $2, '', $3,
        'ALL Branches', 0, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        'Current', 'Y', $13, $14,
        1, $15, NOW(), $15, NOW()
      )
    `, [
      data.bankName || null, data.beneficiaryName || null, data.bankAddress || null,
      data.bankCity || data.city, data.bankState || data.state,
      data.bankCountry || data.country, data.bankPostalCode || null,
      data.accountNo, data.ifscCode || null, data.swiftCode || null,
      data.ibanNo || null, data.bankCurrency || data.turnOverCurrency || null,
      siteId, supplierId, data.createdBy
    ]);
  }

  return { supplierId, siteId };
}

export async function createExternalOrg(data: {
  companyName: string; city: string; country: string; licenseNo: string;
  currency: string; dateFormat: string; defaultPaymentTerms: string; defaultTax: string;
  createdBy: string;
}) {
  const result = await getPool().query(`
    INSERT INTO dbo.um_org_dtls
      (id, organization_name, org_city, org_country, org_registration_no,
       org_type, currency, date_format, default_paymentterms, default_tax,
       created_by, creation_date, last_modified_by, last_modified_date)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.um_org_dtls),
      $1, $2, $3, $4,
      'EXTERNAL', $5, $6, $7, $8,
      $9, NOW(), $9, NOW()
    )
    RETURNING id
  `, [
    data.companyName, data.city, data.country, data.licenseNo || null,
    data.currency, data.dateFormat, data.defaultPaymentTerms, data.defaultTax,
    data.createdBy
  ]);
  return result.rows[0].id;
}

export async function createInvitationForSupplier(data: {
  companyName: string; emailId: string; sentBy: string; sentByName: string;
}) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 5);

  const result = await getPool().query(`
    INSERT INTO dbo.supp_invitation_dtls
      (id, company_name, email_id, invitation_date, invitation_sent_by, invitation_sent_by_name,
       status, start_date, end_date, creation_date, resend_count, created_by, last_modified_date)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.supp_invitation_dtls),
      $1, $2, NOW(), $3, $4, 'Initiated', NOW(), $5, NOW(), 0, $3, NOW()
    )
    RETURNING id
  `, [data.companyName, data.emailId, data.sentBy, data.sentByName, endDate]);
  return result.rows[0].id;
}

export async function updateSupplierInvitationId(supplierId: number, invitationId: number, modifiedBy: string) {
  await getPool().query(`
    UPDATE dbo.supp_basic_org_dtls
    SET invitation_id = $1, last_modified_by = $2, last_modified_date = NOW()
    WHERE id = $3
  `, [invitationId, modifiedBy, supplierId]);
}

export async function getSupplierChanges(supplierId: number) {
  const changes: Array<{ section: string; field: string; label: string; oldValue: string | null; newValue: string | null; recordId?: number }> = [];

  const orgResult = await getPool().query(`SELECT * FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`, [supplierId]);
  const org = orgResult.rows[0];
  if (org) {
    const orgFieldMap: Array<{ current: string; prev: string; label: string }> = [
      { current: "address_1", prev: "prev_address1", label: "Address Line 1" },
      { current: "address_2", prev: "prev_address2", label: "Address Line 2" },
      { current: "city", prev: "prev_city", label: "City" },
      { current: "state", prev: "prev_state", label: "State" },
      { current: "country", prev: "prev_country", label: "Country" },
      { current: "postalcode", prev: "prev_postal_code", label: "Postal Code" },
      { current: "email_id", prev: "prev_email_id", label: "Email" },
      { current: "phone", prev: "prev_phone", label: "Phone" },
      { current: "phone_area_code", prev: "prev_phone_area_code", label: "Phone Area Code" },
      { current: "phone_ctry_code", prev: "prev_phone_ctry_code", label: "Phone Country Code" },
      { current: "web_address", prev: "prev_web_address", label: "Website" },
      { current: "legal_entity_type", prev: "prev_leagl_entity_type", label: "Legal Entity Type" },
      { current: "license_no", prev: "prev_license_no", label: "License Number" },
      { current: "place_of_issue", prev: "prev_place_of_issue", label: "Place of Issue" },
      { current: "annual_turn_over", prev: "prev_annual_turn_over", label: "Annual Turnover" },
      { current: "turn_over_currency", prev: "prev_turn_over_currency", label: "Turnover Currency" },
      { current: "payment_terms", prev: "prev_payment_trems", label: "Payment Terms" },
      { current: "tax_reg_no", prev: "prev_tax_reg_no", label: "Tax Registration No" },
      { current: "tax_cntry", prev: "prev_tax_country", label: "Tax Country" },
      { current: "tax_payer_id", prev: "prev_tax_payer_id", label: "Tax Payer ID" },
      { current: "pan_no", prev: "prev_pan_no", label: "PAN Number" },
      { current: "supplier_type", prev: "prev_supplier_type", label: "Supplier Type" },
      { current: "workingday_start", prev: "prev_working_day_start", label: "Working Day Start" },
      { current: "workingday_end", prev: "prev_working_day_end", label: "Working Day End" },
      { current: "working_time_start_time", prev: "prev_working_time_start_time", label: "Working Time Start" },
      { current: "working_time_end_time", prev: "prev_working_time_end_time", label: "Working Time End" },
      { current: "company_size", prev: "prev_company_size", label: "Company Size" },
      { current: "brand_name", prev: "prev_brand_name", label: "Brand Name" },
      { current: "emirates_id", prev: "prev_emirates_id", label: "Emirates ID" },
      { current: "type_of_service", prev: "prev_type_of_service", label: "Type of Service" },
    ];

    const dateFields = ["expiry_date", "start_date", "tax_effective_date"];
    const dateFieldMap: Array<{ current: string; prev: string; label: string }> = [
      { current: "expiry_date", prev: "prev_expiry_date", label: "Business Expiry Date" },
      { current: "start_date", prev: "prev_start_date", label: "Incorporation Date" },
      { current: "tax_effective_date", prev: "prev_tax_effective_date", label: "Tax Effective Date" },
    ];

    const intFields: Array<{ current: string; prev: string; label: string }> = [
      { current: "no_of_employees", prev: "prev_no_of_employees", label: "Number of Employees" },
      { current: "year_of_exp_loc_market", prev: "prev_year_of_exp_loc_market", label: "Domestic Experience (Years)" },
      { current: "year_of_exp_international", prev: "prev_year_of_exp_international", label: "International Experience (Years)" },
    ];

    for (const f of orgFieldMap) {
      const prevVal = org[f.prev];
      const curVal = org[f.current];
      const prevStr = String(prevVal || "").trim();
      const curStr = String(curVal || "").trim();
      if (prevStr !== curStr) {
        changes.push({ section: "Company Information", field: f.current, label: f.label, oldValue: prevStr || null, newValue: curStr || null });
      }
    }

    for (const f of dateFieldMap) {
      const prevVal = org[f.prev];
      const curVal = org[f.current];
      const prevDate = prevVal ? new Date(prevVal).toLocaleDateString() : "";
      const curDate = curVal ? new Date(curVal).toLocaleDateString() : "";
      if (prevDate !== curDate) {
        changes.push({ section: "Business Details", field: f.current, label: f.label, oldValue: prevDate || null, newValue: curDate || null });
      }
    }

    for (const f of intFields) {
      const prevVal = org[f.prev];
      const curVal = org[f.current];
      const prevStr = String(prevVal ?? "");
      const curStr = String(curVal ?? "");
      if (prevStr !== curStr) {
        changes.push({ section: "Company Information", field: f.current, label: f.label, oldValue: prevStr || null, newValue: curStr || null });
      }
    }
  }

  const contactResult = await getPool().query(
    `SELECT * FROM dbo.supp_contact_dtls WHERE supplier_id = $1 AND (status = 0 OR status IS NULL) ORDER BY id`,
    [supplierId]
  );
  for (const c of contactResult.rows) {
    const contactFields: Array<{ current: string; prev: string; label: string }> = [
      { current: "contact_name", prev: "prev_contact_name", label: "Name" },
      { current: "contact_category", prev: "prev_contact_category", label: "Category" },
      { current: "designation", prev: "prev_designation", label: "Designation" },
      { current: "department", prev: "prev_department", label: "Department" },
      { current: "email", prev: "prev_email", label: "Email" },
      { current: "phone", prev: "prev_phone", label: "Phone" },
      { current: "mobile", prev: "prev_mobile", label: "Mobile" },
      { current: "is_primary", prev: "prev_primary_contact", label: "Primary Contact" },
      { current: "is_auth_signatory", prev: "prev_is_auth_signatory", label: "Auth Signatory" },
    ];
    for (const f of contactFields) {
      const prevVal = c[f.prev];
      const curVal = c[f.current];
      const prevStr = String(prevVal || "").trim();
      const curStr = String(curVal || "").trim();
      if (prevStr !== curStr) {
        changes.push({
          section: "Contacts",
          field: f.current,
          label: `${c.contact_name || "Contact"} - ${f.label}`,
          oldValue: prevStr || null,
          newValue: curStr || null,
          recordId: c.id,
        });
      }
    }
  }
  
  const refResult = await getPool().query(
    `SELECT * FROM dbo.supp_ref_companies_dtls WHERE supplier_id = $1 AND (status = 0 OR status IS NULL) ORDER BY id`,
    [supplierId]
  );
  for (const c of refResult.rows) {
    const refFields: Array<{ current: string; prev: string; label: string }> = [
      { current: "ref_company_name", prev: "prev_ref_company_name", label: "Company Name" },
      { current: "contact_name", prev: "prev_contact_name", label: "Contact Name" },
      { current: "designation", prev: "prev_designation", label: "Designation" },
      { current: "department", prev: "prev_department", label: "Department" },
      { current: "email", prev: "prev_email", label: "Contact Email" },
      { current: "phone", prev: "prev_phone", label: "Contact Phone" },
    ];
    for (const f of refFields) {
      const prevVal = c[f.prev];
      const curVal = c[f.current];
      const prevStr = String(prevVal || "").trim();
      const curStr = String(curVal || "").trim();
      if (prevStr !== curStr) {
        changes.push({
          section: "References",
          field: f.current,
          label: `${c.ref_company_name || "Reference"} - ${f.label}`,
          oldValue: prevStr || null,
          newValue: curStr || null,
          recordId: c.id,
        });
      }
    }
  }

  const bankResult = await getPool().query(
    `SELECT * FROM dbo.supp_bank_dtls WHERE supplier_id = $1 AND (status = 1 OR status IS NULL) ORDER BY id`,
    [supplierId]
  );
  for (const b of bankResult.rows) {
    const bankFields: Array<{ current: string; prev: string; label: string }> = [
      { current: "account_no", prev: "prev_account_no", label: "Account Number" },
      { current: "bank_name", prev: "prev_bank_name", label: "Bank Name" },
      { current: "branch_name", prev: "prev_branch_name", label: "Branch Name" },
      { current: "bank_address", prev: "prev_bank_address", label: "Bank Address" },
      { current: "city", prev: "prev_city", label: "City" },
      { current: "country", prev: "prev_country", label: "Country" },
      { current: "region", prev: "prev_region", label: "Region" },
      { current: "postal_code", prev: "prev_postalcode", label: "Postal Code" },
      { current: "bank_account_type", prev: "prev_bank_account_type", label: "Account Type" },
      { current: "currency", prev: "prev_currency", label: "Currency" },
      { current: "swift_code", prev: "prev_swift_code", label: "SWIFT Code" },
      { current: "iban_no", prev: "prev_iban_no", label: "IBAN" },
      { current: "ifsccode", prev: "prev_ifsc_code", label: "IFSC Code" },
      { current: "aba_routing", prev: "prev_aba_routing", label: "ABA Routing" },
      { current: "beneficiary_name", prev: "prev_beneficiary_name", label: "Beneficiary Name" },
      { current: "beneficiary_address", prev: "prev_beneficiary_address", label: "Beneficiary Address" },
      { current: "primary_account", prev: "prev_primary_account", label: "Primary Account" },
    ];
    for (const f of bankFields) {
      const prevVal = b[f.prev];
      const curVal = b[f.current];
      const prevStr = String(prevVal || "").trim();
      const curStr = String(curVal || "").trim();
      if (prevStr !== curStr) {
        changes.push({
          section: "Banking",
          field: f.current,
          label: `${b.bank_name || "Bank"} - ${f.label}`,
          oldValue: prevStr || null,
          newValue: curStr || null,
          recordId: b.id,
        });
      }
    }
  }

  return changes;
}

export async function clearAllPrevColumns(supplierId: number) {
  await getPool().query(`
    UPDATE dbo.supp_basic_org_dtls SET
      prev_address1 = NULL, prev_address2 = NULL, prev_city = NULL, prev_state = NULL,
      prev_country = NULL, prev_postal_code = NULL, prev_email_id = NULL, prev_phone = NULL,
      prev_phone_area_code = NULL, prev_phone_ctry_code = NULL, prev_web_address = NULL,
      prev_leagl_entity_type = NULL, prev_license_no = NULL, prev_place_of_issue = NULL,
      prev_annual_turn_over = NULL, prev_turn_over_currency = NULL, prev_payment_trems = NULL,
      prev_tax_reg_no = NULL, prev_tax_country = NULL, prev_tax_payer_id = NULL, prev_pan_no = NULL,
      prev_supplier_type = NULL, prev_working_day_start = NULL, prev_working_day_end = NULL,
      prev_working_time_start_time = NULL, prev_working_time_end_time = NULL,
      prev_company_size = NULL, prev_brand_name = NULL, prev_segment_code = NULL,
      prev_segment_label = NULL, prev_emirates_id = NULL, prev_type_of_service = NULL,
      prev_expiry_date = NULL, prev_start_date = NULL, prev_tax_effective_date = NULL,
      prev_no_of_employees = NULL, prev_year_of_exp_loc_market = NULL, prev_year_of_exp_international = NULL
    WHERE id = $1
  `, [supplierId]);

  await getPool().query(`
    UPDATE dbo.supp_contact_dtls SET
      prev_contact_name = NULL, prev_contact_category = NULL, prev_designation = NULL,
      prev_department = NULL, prev_email = NULL, prev_phone = NULL, prev_mobile = NULL,
      prev_primary_contact = NULL, prev_is_auth_signatory = NULL
    WHERE supplier_id = $1
  `, [supplierId]);

  await getPool().query(`
    UPDATE dbo.supp_bank_dtls SET
      prev_account_no = NULL, prev_bank_name = NULL, prev_branch_name = NULL,
      prev_bank_address = NULL, prev_city = NULL, prev_country = NULL, prev_region = NULL,
      prev_postalcode = NULL, prev_bank_account_type = NULL, prev_currency = NULL,
      prev_swift_code = NULL, prev_iban_no = NULL, prev_ifsc_code = NULL, prev_aba_routing = NULL,
      prev_beneficiary_name = NULL, prev_beneficiary_address = NULL, prev_primary_account = NULL
    WHERE supplier_id = $1
  `, [supplierId]);
}

export async function revertFromPrevColumns(supplierId: number) {
  await getPool().query(`
    UPDATE dbo.supp_basic_org_dtls SET
      address_1 = COALESCE(prev_address1, address_1),
      address_2 = COALESCE(prev_address2, address_2),
      city = COALESCE(prev_city, city),
      state = COALESCE(prev_state, state),
      country = COALESCE(prev_country, country),
      postalcode = COALESCE(prev_postal_code, postalcode),
      email_id = COALESCE(prev_email_id, email_id),
      phone = COALESCE(prev_phone, phone),
      phone_area_code = COALESCE(prev_phone_area_code, phone_area_code),
      phone_ctry_code = COALESCE(prev_phone_ctry_code, phone_ctry_code),
      web_address = COALESCE(prev_web_address, web_address),
      legal_entity_type = COALESCE(prev_leagl_entity_type, legal_entity_type),
      license_no = COALESCE(prev_license_no, license_no),
      place_of_issue = COALESCE(prev_place_of_issue, place_of_issue),
      annual_turn_over = COALESCE(prev_annual_turn_over::numeric, annual_turn_over),
      turn_over_currency = COALESCE(prev_turn_over_currency, turn_over_currency),
      payment_terms = COALESCE(prev_payment_trems, payment_terms),
      tax_reg_no = COALESCE(prev_tax_reg_no, tax_reg_no),
      tax_cntry = COALESCE(prev_tax_country, tax_cntry),
      tax_payer_id = COALESCE(prev_tax_payer_id, tax_payer_id),
      pan_no = COALESCE(prev_pan_no, pan_no),
      supplier_type = COALESCE(prev_supplier_type, supplier_type),
      workingday_start = COALESCE(prev_working_day_start, workingday_start),
      workingday_end = COALESCE(prev_working_day_end, workingday_end),
      working_time_start_time = COALESCE(prev_working_time_start_time, working_time_start_time),
      working_time_end_time = COALESCE(prev_working_time_end_time, working_time_end_time),
      prev_address1 = NULL, prev_address2 = NULL, prev_city = NULL, prev_state = NULL,
      prev_country = NULL, prev_postal_code = NULL, prev_email_id = NULL, prev_phone = NULL,
      prev_phone_area_code = NULL, prev_phone_ctry_code = NULL, prev_web_address = NULL,
      prev_leagl_entity_type = NULL, prev_license_no = NULL, prev_place_of_issue = NULL,
      prev_annual_turn_over = NULL, prev_turn_over_currency = NULL, prev_payment_trems = NULL,
      prev_tax_reg_no = NULL, prev_tax_country = NULL, prev_tax_payer_id = NULL, prev_pan_no = NULL,
      prev_supplier_type = NULL, prev_working_day_start = NULL, prev_working_day_end = NULL,
      prev_working_time_start_time = NULL, prev_working_time_end_time = NULL,
      prev_company_size = NULL, prev_brand_name = NULL, prev_segment_code = NULL,
      prev_segment_label = NULL, prev_emirates_id = NULL, prev_type_of_service = NULL,
      prev_expiry_date = NULL, prev_start_date = NULL, prev_tax_effective_date = NULL,
      prev_no_of_employees = NULL, prev_year_of_exp_loc_market = NULL, prev_year_of_exp_international = NULL,
      status = 'Approved'
    WHERE id = $1 AND prev_address1 IS NOT NULL
  `, [supplierId]);

  await getPool().query(`
    UPDATE dbo.supp_contact_dtls SET
      contact_name = COALESCE(prev_contact_name, contact_name),
      contact_category = COALESCE(prev_contact_category, contact_category),
      designation = COALESCE(prev_designation, designation),
      department = COALESCE(prev_department, department),
      email = COALESCE(prev_email, email),
      phone = COALESCE(prev_phone, phone),
      mobile = COALESCE(prev_mobile, mobile),
      is_primary = COALESCE(prev_primary_contact, is_primary),
      is_auth_signatory = COALESCE(prev_is_auth_signatory, is_auth_signatory),
      prev_contact_name = NULL, prev_contact_category = NULL, prev_designation = NULL,
      prev_department = NULL, prev_email = NULL, prev_phone = NULL, prev_mobile = NULL,
      prev_primary_contact = NULL, prev_is_auth_signatory = NULL
    WHERE supplier_id = $1 AND prev_contact_name IS NOT NULL
  `, [supplierId]);

  await getPool().query(`
    UPDATE dbo.supp_bank_dtls SET
      account_no = COALESCE(prev_account_no, account_no),
      bank_name = COALESCE(prev_bank_name, bank_name),
      branch_name = COALESCE(prev_branch_name, branch_name),
      bank_address = COALESCE(prev_bank_address, bank_address),
      city = COALESCE(prev_city, city),
      country = COALESCE(prev_country, country),
      region = COALESCE(prev_region, region),
      postal_code = COALESCE(prev_postalcode, postal_code),
      bank_account_type = COALESCE(prev_bank_account_type, bank_account_type),
      currency = COALESCE(prev_currency, currency),
      swift_code = COALESCE(prev_swift_code, swift_code),
      iban_no = COALESCE(prev_iban_no, iban_no),
      ifsccode = COALESCE(prev_ifsc_code, ifsccode),
      aba_routing = COALESCE(prev_aba_routing, aba_routing),
      beneficiary_name = COALESCE(prev_beneficiary_name, beneficiary_name),
      beneficiary_address = COALESCE(prev_beneficiary_address, beneficiary_address),
      primary_account = COALESCE(prev_primary_account, primary_account),
      prev_account_no = NULL, prev_bank_name = NULL, prev_branch_name = NULL,
      prev_bank_address = NULL, prev_city = NULL, prev_country = NULL, prev_region = NULL,
      prev_postalcode = NULL, prev_bank_account_type = NULL, prev_currency = NULL,
      prev_swift_code = NULL, prev_iban_no = NULL, prev_ifsc_code = NULL, prev_aba_routing = NULL,
      prev_beneficiary_name = NULL, prev_beneficiary_address = NULL, prev_primary_account = NULL
    WHERE supplier_id = $1 AND prev_bank_name IS NOT NULL
  `, [supplierId]);
}

export async function getWorkflowApprovalHistory(supplierId: number) {
  const result = await getPool().query(`
    SELECT 
      wi.id as instance_id,
      wi.subject,
      wi.status as instance_status,
      wi.start_date,
      wi.started_by,
      si.id as step_instance_id,
      si.step_order,
      si.current_assignee,
      si.status as step_status,
      si.result,
      si.action_by,
      si.action_date,
      si.remarks,
      si.task_id
    FROM dbo.wf_instance wi
    JOIN dbo.wf_step_instance si ON si.instance_id = wi.id
    WHERE wi.wf_definition_id = (SELECT id FROM dbo.wf_definition WHERE name = 'Vendor Registration' LIMIT 1)
      AND si.ref_number = CAST($1 AS VARCHAR)
    ORDER BY si.id ASC, si.action_date ASC;
  `, [supplierId]);
  return result.rows;
}

export async function getWorkflowDefinitionSteps() {
  const result = await getPool().query(`
    SELECT 
      ws.id as step_id,
      ws.name as step_name,
      ws.step_order,
      wsa.assignment_type,
      wsa.assignment_expression,
      wsa.assignment_name
    FROM dbo.wf_step ws
    LEFT JOIN dbo.wf_step_assignment wsa ON wsa.step_id = ws.id
    WHERE ws.wf_definition_id = (SELECT id FROM dbo.wf_definition WHERE name = 'Vendor Registration' LIMIT 1)
    
  `);
  return result.rows;
}

export async function getBulkVendorDocumentCounts() {
  const result = await getPool().query(`
    SELECT supplier_id, COUNT(*) as doc_count,
           SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date < NOW() THEN 1 ELSE 0 END) as expired_count
    FROM dbo.supp_document_dtls
    GROUP BY supplier_id
  `);
  return result.rows;
}

export async function getBulkVendorContactCounts() {
  const result = await getPool().query(`
    SELECT supplier_id, COUNT(*) as contact_count
    FROM dbo.supp_contact_dtls
    GROUP BY supplier_id
  `);
  return result.rows;
}

export async function getBulkVendorBankCounts() {
  const result = await getPool().query(`
    SELECT supplier_id, COUNT(*) as bank_count
    FROM dbo.supp_bank_dtls
    GROUP BY supplier_id
  `);
  return result.rows;
}

export async function getSupplierIdsByServiceScope(searchTerm: string) {
  const result = await getPool().query(`
    SELECT DISTINCT supplier_id
    FROM dbo.supp_scope_of_supply_service
    WHERE LOWER(service_details) LIKE $1
       OR LOWER(sub_category) LIKE $1
       OR LOWER(category_code) LIKE $1
       OR LOWER(good_service_code) LIKE $1
  `, [`%${searchTerm.toLowerCase()}%`]);
  return result.rows.map((r: any) => r.supplier_id);
}

export async function searchVendorsByServiceScope(searchTerm: string) {
  const result = await getPool().query(`
    SELECT DISTINCT supplier_id, service_details, sub_category, category_code, good_service_code
    FROM dbo.supp_scope_of_supply_service
    WHERE LOWER(service_details) LIKE $1
       OR LOWER(sub_category) LIKE $1
       OR LOWER(category_code) LIKE $1
       OR LOWER(good_service_code) LIKE $1
  `, [`%${searchTerm.toLowerCase()}%`]);
  return result.rows;
}

export async function getSupplierByIds(suppIds: any[]) {
  if (!suppIds?.length) return [];

  const ids = suppIds
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return [];

  const result = await getPool().query(
    `SELECT * FROM dbo.supp_basic_org_dtls WHERE id = ANY($1::int[])`,
    [ids]
  );
  return result.rows;
}

export async function getExportContactsForSupplierIds(supplierIds: number[]) {
  if (!supplierIds.length) return [];
  const result = await getPool().query(
    `SELECT
      c.supplier_id,
      s.company_name,
      c.contact_name,
      c.contact_category,
      c.contact_type,
      c.designation,
      c.department,
      c.email,
      c.mobile,
      c.is_primary,
      c.is_auth_signatory
    FROM dbo.supp_contact_dtls c
    INNER JOIN dbo.supp_basic_org_dtls s ON s.id = c.supplier_id
    WHERE c.supplier_id = ANY($1::int[])
    ORDER BY s.company_name, c.supplier_id, c.id`,
    [supplierIds]
  );
  return result.rows;
}

export async function getExportBanksForSupplierIds(supplierIds: number[]) {
  if (!supplierIds.length) return [];
  const result = await getPool().query(
    `SELECT
      b.supplier_id,
      s.company_name,
      b.bank_name,
      b.branch_name,
      b.account_no,
      b.beneficiary_name,
      b.beneficiary_address,
      b.bank_address,
      b.city,
      b.country,
      b.region,
      b.postal_code,
      b.bank_account_type,
      b.currency,
      b.swift_code,
      b.iban_no,
      b.ifsccode,
      b.aba_routing,
      b.primary_account
    FROM dbo.supp_bank_dtls b
    INNER JOIN dbo.supp_basic_org_dtls s ON s.id = b.supplier_id
    WHERE b.supplier_id = ANY($1::int[])
    ORDER BY s.company_name, b.supplier_id, b.id`,
    [supplierIds]
  );
  return result.rows;
}

export async function getExportServicesForSupplierIds(supplierIds: number[]) {
  if (!supplierIds.length) return [];
  const result = await getPool().query(
    `SELECT
      svc.supplier_id,
      s.company_name,
      svc.category_code,
      svc.sub_category,
      svc.sub_category_code,
      svc.good_service_code,
      svc.service_details,
      svc.category_type
    FROM dbo.supp_scope_of_supply_service svc
    INNER JOIN dbo.supp_basic_org_dtls s ON s.id = svc.supplier_id
    WHERE svc.supplier_id = ANY($1::int[])
    ORDER BY s.company_name, svc.supplier_id, svc.id`,
    [supplierIds]
  );
  return result.rows;
}

export async function lookupSupplierLocationByPostalCode(postalCode: string) {
  const normalized = String(postalCode || "").replace(/\s/g, "");
  if (!normalized) return null;
  const result = await getPool().query(
    `SELECT city, state, country, COUNT(*)::int AS cnt
     FROM dbo.supp_basic_org_dtls
     WHERE REPLACE(LOWER(TRIM(COALESCE(postalcode, ''))), ' ', '') = LOWER($1)
       AND TRIM(COALESCE(city, '')) <> ''
       AND TRIM(COALESCE(country, '')) <> ''
     GROUP BY city, state, country
     ORDER BY cnt DESC
     LIMIT 1`,
    [normalized],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    city: String(row.city || "").trim(),
    state: String(row.state || "").trim(),
    country: String(row.country || "").trim(),
  };
}

export async function lookupSupplierPostalByLocation(city: string, state?: string, country?: string) {
  const params: string[] = [city.trim()];
  let sql = `
    SELECT postalcode, COUNT(*)::int AS cnt
    FROM dbo.supp_basic_org_dtls
    WHERE LOWER(TRIM(city)) = LOWER(TRIM($1))
      AND TRIM(COALESCE(postalcode, '')) <> ''`;
  if (state?.trim()) {
    params.push(state.trim());
    sql += ` AND LOWER(TRIM(COALESCE(state, ''))) = LOWER(TRIM($${params.length}))`;
  }
  if (country?.trim()) {
    params.push(country.trim());
    sql += ` AND LOWER(TRIM(COALESCE(country, ''))) = LOWER(TRIM($${params.length}))`;
  }
  sql += `
    GROUP BY postalcode
    ORDER BY cnt DESC
    LIMIT 1`;
  const result = await getPool().query(sql, params);
  const row = result.rows[0];
  if (!row?.postalcode) return null;
  return { postalCode: String(row.postalcode).trim() };
}

export async function lookupSupplierLocationsByCity(city: string) {
  const result = await getPool().query(
    `SELECT city, state, country, postalcode, COUNT(*)::int AS cnt
     FROM dbo.supp_basic_org_dtls
     WHERE LOWER(TRIM(city)) = LOWER(TRIM($1))
       AND TRIM(COALESCE(country, '')) <> ''
     GROUP BY city, state, country, postalcode
     ORDER BY cnt DESC
     LIMIT 5`,
    [city.trim()],
  );
  return result.rows.map((row: any) => ({
    city: String(row.city || "").trim(),
    state: String(row.state || "").trim(),
    country: String(row.country || "").trim(),
    postalCode: String(row.postalcode || "").trim() || undefined,
  }));
}

/** Hard-delete supplier and registration child rows (superadmin only). */
export async function deleteSupplierCascade(supplierId: number) {
  const p = getPool();
  await p.query(`DELETE FROM dbo.supp_contact_dtls WHERE supplier_id = $1`, [supplierId]);
  await p.query(`DELETE FROM dbo.supp_bank_dtls WHERE supplier_id = $1`, [supplierId]);
  await p.query(`DELETE FROM dbo.supp_document_dtls WHERE supplier_id = $1`, [supplierId]);
  await p.query(`DELETE FROM dbo.supp_scope_of_supply_service WHERE supplier_id = $1`, [supplierId]);
  await p.query(`DELETE FROM dbo.supp_user_supplier_map_dtls WHERE supplier_id = $1`, [supplierId]);
  await p.query(`DELETE FROM dbo.supp_basic_org_dtls WHERE id = $1`, [supplierId]);
}

export async function getVendorName(supplier_id: string) 
{
  const result = await getPool().query(`select company_name from dbo.supp_basic_org_dtls where id=$1`,[Number(supplier_id)]);
  result.rows[0];
}
export async function clearTaskBySuppId(supplierId: number) 
{
    try
    {
      await getPool().query(`update dbo.supp_basic_org_dtls set attribute_12=null where id=$1`,[supplierId]);
    }
    catch(error)
    {
      console.error(error);
    }
}

