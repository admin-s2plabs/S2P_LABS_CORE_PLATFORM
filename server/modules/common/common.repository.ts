import type pkg from "pg";
import { getContextPool } from "../../tenant-context";
import { pool } from "../_shared";
const getPool = () => getContextPool() ?? pool;

export async function findUserByEmail(email: string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(`
    SELECT u.id, u.user_name, u.name, u.email_id, u.password, u.user_type,
           u.user_status, u.org_id, u.supp_org_id, u.department_name, u.designation,
           u.attribute_10, u.last_email_date, u.total_emails_sent, u.one_time_password,
           u.otp_requested_time, u.failed_attempt, u.lock_time,
           o.organization_name, o.org_type, u.attribute_12
    FROM dbo.um_user_dtls u
    LEFT JOIN dbo.um_org_dtls o ON u.org_id = o.id
    WHERE LOWER(u.email_id) = LOWER($1)
    LIMIT 1
  `, [email.trim()]);
  return result.rows[0] || null;
}

export async function findUserByEmailAndMobile(email: string, mobile: string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(`
    SELECT id, name, email_id, user_name, user_type, user_status, org_id, last_email_date, total_emails_sent
    FROM dbo.um_user_dtls
    WHERE LOWER(email_id) = LOWER($1) AND mobile_no = $2
    LIMIT 1
  `, [email, mobile]);
  return result.rows[0] || null;
}

export async function updateForgotPasswordToken(userId: number | string, tokenId: string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  await p.query(`
    UPDATE dbo.um_user_dtls
    SET attribute_10 = $1,
        last_email_date = NOW(),
        total_emails_sent = COALESCE(total_emails_sent, 0) + 1,
        last_modified_date = NOW()
    WHERE id = $2
  `, [tokenId, userId]);
}

export async function findUserByResetToken(tokenId: string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(`
    SELECT id, name, email_id, user_name, user_status, last_email_date
    FROM dbo.um_user_dtls
    WHERE attribute_10 = $1
    LIMIT 1
  `, [tokenId]);
  return result.rows[0] || null;
}

export async function clearForgotPasswordToken(userId: number | string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  await p.query(`
    UPDATE dbo.um_user_dtls
    SET attribute_10 = NULL, last_email_date = NULL, last_modified_date = NOW()
    WHERE id = $1
  `, [userId]);
}

export async function findUserByUsername(username: string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(`
    SELECT u.id, u.user_name, u.name, u.email_id, u.password, u.user_type,
           u.user_status, u.org_id, u.supp_org_id, u.department_name, u.designation,
           u.attribute_10, u.last_email_date,  u.one_time_password, 
           u.otp_requested_time, u.failed_attempt, u.lock_time,
           o.organization_name, o.org_type, u.attribute_12
    FROM dbo.um_user_dtls u
    LEFT JOIN dbo.um_org_dtls o ON u.org_id = o.id
    WHERE LOWER(u.user_name) = LOWER($1)
  `, [username]);
  return result.rows[0] || null;
}

export async function findUserById(id: number | string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(`
    SELECT id, name, email_id, user_name, password, user_type, user_status, org_id
    FROM dbo.um_user_dtls WHERE id = $1
  `, [id]);
  return result.rows[0] || null;
}

export async function findRoleByUserId(userId: number | string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(`
    SELECT r.role_name, r.role_display_name
    FROM dbo.um_user_roles_map_dtls urm
    JOIN dbo.um_role_dtls r ON urm.role_id = r.id
    WHERE urm.user_id = $1
    LIMIT 1
  `, [userId]);
  return result.rows[0] || null;
}

export async function findSupplierMapping(userId: number | string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(
    `SELECT supplier_id FROM dbo.supp_user_supplier_map_dtls WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function findPrevSupplierStatus(supplierId: number, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(
    `SELECT prev_status, status FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`,
    [supplierId]
  );
  return result.rows[0]?.prev_status ?? result.rows[0]?.status;
}

export async function findSupplierStatus(supplierId: number, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(
    `SELECT status FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`,
    [supplierId]
  );
  return result.rows[0]?.status || null;
}

export async function updateLastLoginDate(userId: number | string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  // Move current last_login_date to previous_login_date, then update last_login_date to NOW()
  await p.query(
    `UPDATE dbo.um_user_dtls SET previous_login_date = last_login_date, last_login_date = NOW() WHERE id = $1`,
    [userId]
  );
}

export async function updateUserOTPDetails(userId: number | string, otpDetails: { oneTimePassword: string; otpRequestedTime: Date }, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  await p.query(
    `UPDATE dbo.um_user_dtls 
     SET one_time_password = $2, otp_requested_time = $3
     WHERE id = $1`,
    [userId, otpDetails.oneTimePassword, otpDetails.otpRequestedTime]
  );
}

export async function clearOTPDetails(userId: number | string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  await p.query(
    `UPDATE dbo.um_user_dtls 
     SET one_time_password = NULL, otp_requested_time = NULL
     WHERE id = $1`,
    [userId]
  );
}

export async function incrementFailedLoginAttempts(userId: number | string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  await p.query(
    `UPDATE dbo.um_user_dtls 
     SET 
       failed_attempt = COALESCE(failed_attempt, 0) + 1,
       lock_time = CASE 
         WHEN COALESCE(failed_attempt, 0) + 1 >= 3 THEN NOW()
         ELSE lock_time
       END,
       user_status = CASE
         WHEN COALESCE(failed_attempt, 0) + 1 >= 3 THEN 0
         ELSE user_status
       END
     WHERE id = $1`,
    [userId]
  );
}

export async function resetFailedLoginAttempts(userId: number | string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  await p.query(
    `UPDATE dbo.um_user_dtls 
     SET failed_attempt = 0, lock_time = NULL, user_status = 1, last_modified_date = NOW()
     WHERE id = $1`,
    [userId]
  );
}

export async function checkOrgNameExists(name: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.supp_basic_org_dtls WHERE LOWER(company_name) = LOWER($1) LIMIT 1`,
    [name.trim()]
  );
  return result.rows.length > 0;
}

export async function checkEmailExists(email: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(email_id) = LOWER($1) OR LOWER(user_name) = LOWER($1) LIMIT 1`,
    [email.trim()]
  );
  return result.rows.length > 0;
}

export async function checkMobileExists(mobile: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE mobile_no = $1 LIMIT 1`,
    [mobile.trim()]
  );
  return result.rows.length > 0;
}

export async function checkUsernameExists(username: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(user_name) = LOWER($1) LIMIT 1`,
    [username.trim()]
  );
  return result.rows.length > 0;
}

export async function findInvitation(id: number) {
  const result = await getPool().query(
    `SELECT id, email_id, company_name, status, end_date FROM dbo.supp_invitation_dtls WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createInvitation(data: {
  companyName: string;
  email: string;
  endDate: Date;
}) {
  const invMaxId = await getPool().query(`SELECT MAX(id) as max_id FROM dbo.supp_invitation_dtls`);
  const newInvId = (invMaxId.rows[0].max_id || 0) + 1;

  await getPool().query(`
    INSERT INTO dbo.supp_invitation_dtls (id, company_name, email_id, invitation_date, invitation_sent_by, invitation_sent_by_name, status, start_date, end_date, creation_date)
    VALUES ($1, $2, $3, NOW(), 'ADMIN', 'System Administrator', 'Initiated', NOW(), $4, NOW())
  `, [newInvId, data.companyName, data.email, data.endDate]);

  return newInvId;
}

export async function findOrgByName(name: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_org_dtls WHERE LOWER(organization_name) = LOWER($1) LIMIT 1`,
    [name]
  );
  return result.rows[0] || null;
}

export async function findInternalOrgDefaults(country: string) {
  const mainOrgResult = await getPool().query(
    `SELECT currency, date_format, default_paymentterms, default_tax FROM dbo.um_org_dtls WHERE org_country = $1 AND org_type = 'INTERNAL' LIMIT 1`,
    [country]
  );
  let defaults = mainOrgResult.rows[0];
  if (!defaults) {
    const fallbackOrg = await getPool().query(
      `SELECT currency, date_format, default_paymentterms, default_tax FROM dbo.um_org_dtls WHERE org_type = 'INTERNAL' LIMIT 1`
    );
    defaults = fallbackOrg.rows[0] || { currency: 'AED', date_format: 'DD-MM-YYYY', default_paymentterms: null, default_tax: null };
  }
  return defaults;
}

export async function createOrg(data: {
  name: string;
  country: string;
  email: string;
  phone: string;
  currency: string;
  dateFormat: string;
  paymentTerms: string | null;
  tax: string | null;
}) {
  const orgMaxId = await getPool().query(`SELECT MAX(id) as max_id FROM dbo.um_org_dtls`);
  const newOrgId = (orgMaxId.rows[0].max_id || 0) + 1;

  await getPool().query(`
    INSERT INTO dbo.um_org_dtls (
      id, organization_name, org_legal_name, org_country, org_email, org_phone_no,
      org_type, currency, date_format, default_paymentterms, default_tax,
      created_by, creation_date, last_modified_by, last_modified_date
    ) VALUES ($1, $2, $2, $3, $4, $5, 'EXTERNAL', $6, $7, $8, $9, $4, NOW(), $4, NOW())
  `, [
    newOrgId, data.name, data.country, data.email, data.phone,
    data.currency, data.dateFormat, data.paymentTerms, data.tax
  ]);

  return newOrgId;
}

export async function getSystemOrgId() {
  const result = await getPool().query(
    `SELECT description FROM dbo.am_lookup_params_dtls WHERE key_1 = 'SYSTEM_ORG_ID' LIMIT 1`
  );
  return result.rows[0] ? parseInt(result.rows[0].description) : 81;
}

export async function createUser(data: {
  userName: string;
  name: string;
  email: string;
  hashedPassword: string;
  phone: string;
  designation: string | null;
  department: string | null;
  orgId: number;
  suppOrgId: number;
  companyName: string;
  invitationId: string;
  source: string | null;
}) {
  const userMaxId = await getPool().query(`SELECT MAX(id) as max_id FROM dbo.um_user_dtls`);
  const newUserId = (userMaxId.rows[0].max_id || 0) + 1;

  await getPool().query(`
    INSERT INTO dbo.um_user_dtls (
      id, user_name, name, email_id, password, mobile_no,
      designation, department_name, user_type, user_status, org_id, supp_org_id,
      activated, login_date, last_email_date, total_emails_sent,
      attribute_1, attribute_2, attribute_3,
      created_by, creation_date, last_modified_by, last_modified_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, 1, 1, $9, $10,
      'Y', NOW(), NOW(), 0,
      $11, $12, $13,
      $2, NOW(), $2, NOW()
    ) RETURNING id
  `, [
    newUserId, data.userName, data.name, data.email, data.hashedPassword, data.phone,
    data.designation, data.department, data.orgId, data.suppOrgId,
    data.companyName, data.invitationId, data.source
  ]);

  return newUserId;
}

export async function createUserRoleMapping(userId: number, roleId: number, createdBy: string) {
  await getPool().query(`
    INSERT INTO dbo.um_user_roles_map_dtls (user_id, role_id, is_primary, status, created_by, creation_date)
    VALUES ($1, $2, 1, 1, $3, NOW())
  `, [userId, roleId, createdBy]);
}

export async function findSupplierByCompanyName(name: string) {
  const result = await getPool().query(
    `SELECT s.id as supplier_id, ss.id as site_id
     FROM dbo.supp_basic_org_dtls s
     LEFT JOIN dbo.supp_site_dtls ss ON ss.supplier_id = s.id
     WHERE LOWER(s.company_name) = LOWER($1) LIMIT 1`,
    [name]
  );
  return result.rows[0] || null;
}

export async function createSupplierUserMapping(data: {
  userId: number;
  supplierId: number;
  siteId: number | null;
  createdBy: string;
}) {
  const mapMaxId = await getPool().query(`SELECT MAX(id) as max_id FROM dbo.supp_user_supplier_map_dtls`);
  const newMapId = (mapMaxId.rows[0].max_id || 0) + 1;

  await getPool().query(`
    INSERT INTO dbo.supp_user_supplier_map_dtls (id, user_id, supplier_id, site_id, created_by, creation_date)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [newMapId, data.userId, data.supplierId, data.siteId, data.createdBy]);
}

export async function updateSupplierRegistration(supplierId: number, invitationId: number, phone: string) {
  await getPool().query(`
    UPDATE dbo.supp_basic_org_dtls
    SET invitation_id = $1, user_registered = 'Yes', phone = $3, last_modified_date = NOW()
    WHERE id = $2
  `, [invitationId, supplierId, phone]);
}

export async function updateOrgAttribute(orgId: number, supplierId: string) {
  await getPool().query(
    `UPDATE dbo.um_org_dtls SET attribute_1 = $1 WHERE id = $2`,
    [supplierId, orgId]
  );
}

export async function updateInvitationStatus(invId: number, status: string) {
  await getPool().query(
    `UPDATE dbo.supp_invitation_dtls SET status = $1, last_modified_date = NOW() WHERE id = $2`,
    [status, invId]
  );
}

export async function findUserProfile(identifier: string, isNumericId: boolean) {
  const result = await getPool().query(`
    SELECT u.id, u.name, u.email_id, u.user_name, u.salutation, u.designation,
           u.department_name, u.mobile_no, u.phone_no, u.mobile_ctry_code, 
           u.phone_ctry_code, u.phone_area_code, u.manager_name, u.manager_id,
           u.photo_path, u.user_status, u.user_type, u.org_id, u.creation_date,
           COALESCE(u.previous_login_date, u.last_login_date) as last_login_date, u.attribute_12 as orgIds
    FROM dbo.um_user_dtls u
    WHERE ${isNumericId ? 'u.id = $1' : 'u.user_name = $1'}
  `, [isNumericId ? parseInt(identifier) : identifier]);
  return result.rows[0] || null;
}

export async function getUserRoles(userId: number | string) {
  const result = await getPool().query(`
    SELECT r.role_name, r.role_display_name, r.description
    FROM dbo.um_role_dtls r
    JOIN dbo.um_user_roles_map_dtls urm ON r.id = urm.role_id
    WHERE urm.user_id = $1
  `, [userId]);
  return result.rows;
}

export async function getUserRoleNames(userId: number | string) {
  const result = await getPool().query(`
    SELECT r.role_name 
    FROM dbo.um_role_dtls r
    JOIN dbo.um_user_roles_map_dtls urm ON r.id = urm.role_id
    WHERE urm.user_id = $1
  `, [userId]);
  return result.rows.map((r: any) => r.role_name);
}

export async function updateUserProfile(id: string, data: {
  name?: string;
  salutation?: string;
  designation?: string;
  department_name?: string;
  mobile_no?: string;
  phone_no?: string;
  mobile_ctry_code?: string;
  phone_ctry_code?: string;
  phone_area_code?: string;
  manager_name?: string;
}) {
  await getPool().query(`
    UPDATE dbo.um_user_dtls
    SET name = COALESCE($1, name),
        salutation = COALESCE($2, salutation),
        designation = COALESCE($3, designation),
        department_name = COALESCE($4, department_name),
        mobile_no = COALESCE($5, mobile_no),
        phone_no = COALESCE($6, phone_no),
        mobile_ctry_code = COALESCE($7, mobile_ctry_code),
        phone_ctry_code = COALESCE($8, phone_ctry_code),
        phone_area_code = COALESCE($9, phone_area_code),
        manager_name = COALESCE($10, manager_name),
        last_modified_date = NOW()
    WHERE id = $11
  `, [data.name, data.salutation, data.designation, data.department_name, data.mobile_no, data.phone_no,
      data.mobile_ctry_code, data.phone_ctry_code, data.phone_area_code, data.manager_name, id]);
}

export async function updateUserPassword(id: string, hashedPassword: string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  await p.query(`
    UPDATE dbo.um_user_dtls
    SET password = $1, last_modified_date = NOW()
    WHERE id = $2
  `, [hashedPassword, id]);
}

export async function getUserPassword(id: string, dbPool?: pkg.Pool) {
  const p = dbPool || getPool();
  const result = await p.query(
    `SELECT password, email_id FROM dbo.um_user_dtls WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function verifyUserOwnership(id: string, userEmail: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE id = $1 AND id::text = $2`,
    [id, userEmail]
  );
  return result.rows.length > 0;
}

export async function updateProfilePhoto(id: string, photoBuffer: Buffer) {
  await getPool().query(`
    UPDATE dbo.um_user_dtls
    SET photo_path = $1, last_modified_date = NOW()
    WHERE id = $2
  `, [photoBuffer, id]);
}

export async function removeProfilePhoto(id: string) {
  await getPool().query(`
    UPDATE dbo.um_user_dtls
    SET photo_path = NULL, last_modified_date = NOW()
    WHERE id = $1
  `, [id]);
}

export async function userExists(id: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0;
}

export async function getUserEmailAndName(userId: string) {
  const result = await getPool().query(
    `SELECT email_id, name FROM dbo.um_user_dtls WHERE id::text = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function getUserEmail(userId: string) {
  const result = await getPool().query(
    `SELECT email_id FROM dbo.um_user_dtls WHERE id::text = $1`,
    [userId]
  );
  return result.rows[0]?.email_id || null;
}

export async function createFeedback(data: {
  feedbackType: string;
  feedbackAbout: string;
  department: string;
  feedbackMsg: string;
  suggestion: string | null;
  isConveyed: string;
  conveyedTo: string | null;
  userEmail: string;
  userName: string;
}) {
  const newId = Date.now() % 1000000000;

  const result = await getPool().query(`
    INSERT INTO dbo.supp_feedback_dtls (
      id, feedback_type, attribute_1, department, feedback_msg, suggestion,
      is_conveyed, conveyed_to, email_id, submitted_by, 
      submitted_date, created_by, creation_date, last_updated_by, last_updated_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, NOW(), $12, NOW())
    RETURNING id
  `, [
    newId,
    data.feedbackType,
    data.feedbackAbout,
    data.department,
    data.feedbackMsg,
    data.suggestion,
    data.isConveyed,
    data.conveyedTo,
    data.userEmail,
    data.userName,
    data.userEmail,
    data.userEmail
  ]);

  return result.rows[0].id;
}

export async function getFeedbackHistory() {
  const result = await getPool().query(`
    SELECT id, feedback_type, feedback_msg, department, submitted_date, is_conveyed, conveyed_to, attribute_1, suggestion, submitted_by
    FROM dbo.supp_feedback_dtls
    ORDER BY submitted_date DESC
    LIMIT 50
  `);
  return result.rows;
}

export async function getDepartments() {
  const result = await getPool().query(`
    SELECT id, value 
    FROM dbo.am_bussiness_seg_dtl 
    WHERE segment_type_id = 3 AND status IN ('A', 'Y') 
    ORDER BY value
  `);
  return result.rows;
}

export async function getUserMenuFunctions(userId: string) {
  const result = await getPool().query(`
    SELECT DISTINCT f.id, f.function_name, f.description, f.module_name, f.function_url, f.category, f.icon_name
    FROM dbo.um_role_functions_map_dtls rfm
    JOIN dbo.um_user_roles_map_dtls urm ON rfm.role_id = urm.role_id
    JOIN dbo.um_functions_dtls f ON rfm.function_id = f.id
    WHERE urm.user_id = $1 AND f.status = 1
    ORDER BY f.module_name, f.id
  `, [userId]);
  return result.rows;
}

export async function getUserCounts() {
  const [totalUsersResult, orgUsersResult, supplierUsersResult] = await Promise.all([
    getPool().query(`SELECT COUNT(*) as count FROM dbo.um_user_dtls WHERE user_status = 1`),
    getPool().query(`SELECT COUNT(*) as count FROM dbo.um_user_dtls WHERE user_status = 1 AND user_type = 0`),
    getPool().query(`SELECT COUNT(*) as count FROM dbo.um_user_dtls WHERE user_status = 1 AND user_type = 1`),
  ]);

  return {
    totalUsers: parseInt(totalUsersResult.rows[0]?.count || '0'),
    organizationUsers: parseInt(orgUsersResult.rows[0]?.count || '0'),
    supplierUsers: parseInt(supplierUsersResult.rows[0]?.count || '0'),
  };
}

export async function getSupplierStats(supplierId: string) {
  const [activePOs, pendingPayments, openBids, activeAuctions, activeContracts] = await Promise.all([
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_po_header_dtls WHERE supplier_id = $1 AND po_status = 'Approved'`,
      [supplierId]
    ),
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_invoice_dtls WHERE supplier_id = $1 AND invoice_status = 'Approved'`,
      [supplierId]
    ),
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_bid_supplier_dtls bs
       JOIN dbo.supp_bid_dtls b ON bs.bidrefno = b.id
       WHERE bs.supplier_id = $1 AND b.status = 'Published'`,
      [supplierId]
    ),
    getPool().query(
      `SELECT COUNT(DISTINCT ae.id) as count
       FROM dbo.au_auction_event ae
       JOIN dbo.au_auction_event_supp_mapping m ON m.eventid = ae.id
       WHERE ae.status IN ('Active', 'Scheduled')
         AND m.supp_id = $1`,
      [supplierId]
    ),
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.cm_header h
       INNER JOIN dbo.cm_supplier_dtls sd ON sd.contractrefno = h.id
       WHERE sd.supplier_id = $1 AND h.status = 'Under Negotiation'`,
      [supplierId]
    ),
  ]);

  return {
    activePOs: parseInt(activePOs.rows[0]?.count || '0'),
    pendingPayments: parseInt(pendingPayments.rows[0]?.count || '0'),
    openBids: parseInt(openBids.rows[0]?.count || '0'),
    activeAuctions: parseInt(activeAuctions.rows[0]?.count || '0'),
    activeContracts: parseInt(activeContracts.rows[0]?.count || '0'),
  };
}

export async function getSupplierActivities(supplierId: string, userName?: string, email?: string) {
  const result = await getPool().query(`
    (
      SELECT
        'BID' as activity_type,
        CONCAT('BIDS ', bs.bidrefno, ' - ',
          CASE bs.status
            WHEN 'Submitted' THEN 'Bid Response submitted'
            WHEN 'Acknowledged' THEN 'Bid acknowledged as Participating'
            WHEN 'Participating' THEN 'Bid acknowledged as Participating'
            WHEN 'Not Participating' THEN 'Bid declined as Not Participating'
            ELSE CONCAT('Bid status: ', bs.status)
          END,
          ' by ', bs.supplier_name
        ) as description,
        COALESCE(bs.last_modified_date, bs.creation_date) as activity_date
      FROM dbo.supp_bid_supplier_dtls bs
      WHERE bs.supplier_id = $1
        AND bs.status != 'Invited'
    )
    UNION ALL
    (
      SELECT
        'INVOICE' as activity_type,
        CONCAT('Invoice ', inv.invoice_number, ' - ', inv.invoice_status, ' - Amount: ', inv.invoice_curr_code, ' ', inv.invoice_amount) as description,
        COALESCE(inv.last_modified_date, inv.creation_date) as activity_date
      FROM dbo.supp_invoice_dtls inv
      WHERE inv.supplier_id = $1
    )
    UNION ALL
    (
      SELECT
        'PO' as activity_type,
        CONCAT(
          'PO ', po.po_number,
          ' - Amount: ', po.po_currency, ' ', po.po_total_cost,
          ' - ', po.po_status
        ) as description,
        COALESCE(po.last_modified_date, po.po_issue_date) as activity_date
      FROM dbo.supp_po_header_dtls po
      WHERE po.supplier_id = $1
    )
    UNION ALL
    (
      SELECT
      'Contract' as activity_type,
      CONCAT(
        'Contract ', co.contr_ref_no,
        ' - Amount: ', co.currency, ' ', COALESCE(co.contract_amount, 0.00),
        ' - ', co.status
      ) as description,
      COALESCE(co.creation_date, co.org_sign_date) as activity_date
      FROM dbo.cm_header co
      JOIN dbo.cm_supplier_dtls cs
      ON REPLACE(co.contr_ref_no, 'CM-', '') = cs.contractrefno::text
      WHERE cs.supplier_id = $1
    )
    ORDER BY activity_date DESC NULLS LAST
    LIMIT 15
  `, [supplierId]);

  return result.rows;
}

export async function getSupplierPendingCount() {
  const result = await getPool().query(
    `SELECT COUNT(*) as count FROM dbo.supp_basic_org_dtls WHERE status = 'Pending Approval'`
  );
  return parseInt(result.rows[0]?.count || '0');
}

export async function getUserDetails(userId: string) {
  const result = await getPool().query(`
    SELECT id, user_name, email_id , name, attribute_12 as org_id
    FROM dbo.um_user_dtls 
    WHERE id = $1
  `, [userId]);
  return result.rows[0] || null;
}

export async function checkOrgExists(name: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_org_dtls WHERE LOWER(organization_name) = LOWER($1) LIMIT 1`,
    [name]
  );
  return result.rows.length > 0;
}

export async function checkUserByUsername(username: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(user_name) = LOWER($1) LIMIT 1`,
    [username]
  );
  return result.rows.length > 0;
}

export async function checkUserByMobile(mobile: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE mobile_no = $1 LIMIT 1`,
    [mobile]
  );
  return result.rows.length > 0;
}

export async function checkUserByEmail(email: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE LOWER(email_id) = LOWER($1) LIMIT 1`,
    [email]
  );
  return result.rows.length > 0;
}

export async function getRecentActivities(userId: string, limit: number = 5) {
  const result = await getPool().query(
    `SELECT module, audit_action, audit_message, full_name, audit_date
     FROM dbo.am_audit_log
     WHERE full_name = $1
     ORDER BY audit_date DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

export async function getAllRecentActivities(limit: number = 5) {
  const result = await getPool().query(
    `SELECT module, audit_action, audit_message, full_name, audit_date
     FROM dbo.am_audit_log
     ORDER BY audit_date DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getMyRequestStats(userName: string, odooUserId: string, emailId: string) {
  const uid = String(odooUserId ?? "").trim();
  const uname = String(userName ?? "").trim();
  const email = String(emailId ?? "").trim();
  const prOwner = `(requestor_id::text = $1 OR LOWER(TRIM(COALESCE(created_by,''))) IN (LOWER(TRIM($2)), LOWER(TRIM($3))))`;
  const poOwner = `(po_owner_id::text = $1 OR LOWER(TRIM(COALESCE(created_by,''))) IN (LOWER(TRIM($2)), LOWER(TRIM($3))))`;
  const invOwner = `(
      LOWER(TRIM(COALESCE(created_by,''))) IN (LOWER(TRIM($1)), LOWER(TRIM($2)))
      OR LOWER(TRIM(COALESCE(submitted_by,''))) IN (LOWER(TRIM($1)), LOWER(TRIM($2)))
    )`;
  const prParams = [uid, uname, email];
  const [prDraft, prPending, poDraft, poApproved, invPending] = await Promise.all([
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_pr_header_dtls WHERE ${prOwner} AND pr_status = 'Draft'`,
      prParams
    ),
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_pr_header_dtls WHERE ${prOwner} AND pr_status IN ('Pending Approval', 'More Info Required')`,
      prParams
    ),
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_po_header_dtls WHERE ${poOwner} AND po_status = 'Draft'`,
      prParams
    ),
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_po_header_dtls WHERE ${poOwner} AND po_status = 'Approved'`,
      prParams
    ),
    getPool().query(
      `SELECT COUNT(*) as count FROM dbo.supp_invoice_dtls WHERE ${invOwner} AND invoice_status IN ('Pending Approval', 'More Info Required')`,
      [uname, email]
    ),
  ]);

  return {
    draftRequisitions: parseInt(prDraft.rows[0]?.count || '0'),
    pendingRequisitions: parseInt(prPending.rows[0]?.count || '0'),
    draftOrders: parseInt(poDraft.rows[0]?.count || '0'),
    approvedOrders: parseInt(poApproved.rows[0]?.count || '0'),
    pendingInvoices: parseInt(invPending.rows[0]?.count || '0'),
  };
}

export async function getAllRequestStats() {
  const safeCount = async (sql: string, params?: unknown[]) => {
    try {
      const r = await getPool().query(sql, params);
      return parseInt(r.rows[0]?.count || '0');
    } catch {
      return 0;
    }
  };

  const [draftRequisitions, pendingRequisitions, draftOrders, approvedOrders, pendingInvoices] =
    await Promise.all([
      safeCount(`SELECT COUNT(*) as count FROM dbo.supp_pr_header_dtls WHERE pr_status = 'Draft'`),
      safeCount(`SELECT COUNT(*) as count FROM dbo.supp_pr_header_dtls WHERE pr_status IN ('Pending Approval', 'More Info Required')`),
      safeCount(`SELECT COUNT(*) as count FROM dbo.supp_po_header_dtls WHERE po_status = 'Draft'`),
      safeCount(`SELECT COUNT(*) as count FROM dbo.supp_po_header_dtls WHERE po_status = 'Approved'`),
      safeCount(`SELECT COUNT(*) as count FROM dbo.supp_invoice_dtls WHERE invoice_status IN ('Pending Approval', 'More Info Required')`),
    ]);

  return { draftRequisitions, pendingRequisitions, draftOrders, approvedOrders, pendingInvoices };
}

export async function getAvailableBudgets(limit: number = 5) {
  const currentYear = new Date().getFullYear();
  const result = await getPool().query(
    `SELECT id, budget_name, budget_owner_name, budget_amount, consumed_amount, reserved_amount, budget_curr, status, start_date, end_date
     FROM dbo.am_budget_mst
     WHERE status = 'Approved'
       AND EXTRACT(YEAR FROM start_date) = $1
     ORDER BY budget_name ASC
     LIMIT $2`,
    [currentYear, limit]
  );
  return result.rows;
}

export async function getRecentComments(userId: string, limit: number = 5) {
  const result = await getPool().query(
    `SELECT id, comments, created_by, created_by_name, creation_date, entity_id, section, type
     FROM dbo.am_collaboration_dtl
     WHERE created_by = $1 AND type IS DISTINCT FROM 'ATTACHMENT'
     ORDER BY creation_date DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

export async function getAllRecentComments(limit: number = 5) {
  const result = await getPool().query(
    `SELECT id, comments, created_by, created_by_name, creation_date, entity_id, section, type
     FROM dbo.am_collaboration_dtl
     WHERE type IS DISTINCT FROM 'ATTACHMENT'
     ORDER BY creation_date DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
