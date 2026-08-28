import { sql } from "drizzle-orm";
import { db } from "../../db";
import { getContextDb, getContextPool } from "../../tenant-context";
import { pool } from "../_shared";
const getPool = () => getContextPool() ?? pool;
const getDb = () => getContextDb() ?? db;

export async function getAuditLogs(params: {
  page: number;
  limit: number;
  search?: string;
  module?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { page, limit, search, module, action, userId, dateFrom, dateTo } = params;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (search && search.trim()) {
    conditions.push(`(
      audit_message ILIKE $${paramIndex} OR 
      audit_key ILIKE $${paramIndex} OR 
      full_name ILIKE $${paramIndex} OR 
      user_id ILIKE $${paramIndex}
    )`);
    queryParams.push(`%${search.trim()}%`);
    paramIndex++;
  }

  if (module && module !== "all") {
    conditions.push(`module = $${paramIndex}`);
    queryParams.push(module);
    paramIndex++;
  }

  if (action && action !== "all") {
    conditions.push(`audit_action = $${paramIndex}`);
    queryParams.push(action);
    paramIndex++;
  }

  if (userId && userId.trim()) {
    conditions.push(`user_id ILIKE $${paramIndex}`);
    queryParams.push(`%${userId.trim()}%`);
    paramIndex++;
  }

  if (dateFrom) {
    conditions.push(`audit_date >= $${paramIndex}::timestamptz`);
    queryParams.push(dateFrom);
    paramIndex++;
  }

  if (dateTo) {
    conditions.push(`audit_date <= $${paramIndex}::timestamptz`);
    queryParams.push(dateTo + "T23:59:59.999Z");
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_audit_log ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].total);

  const dataParams = [...queryParams, limit, offset];
  const result = await getPool().query(`
    SELECT id, audit_action, audit_date, audit_key, audit_message, full_name, user_id, module
    FROM dbo.am_audit_log
    ${whereClause}
    ORDER BY audit_date DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, dataParams);

  return { data: result.rows, total, page, limit };
}

export async function getAuditLogModules() {
  const result = await getPool().query(`
    SELECT DISTINCT module FROM dbo.am_audit_log WHERE module IS NOT NULL ORDER BY module
  `);
  return result.rows.map((r: any) => r.module);
}

export async function getAuditLogActions() {
  const result = await getPool().query(`
    SELECT DISTINCT audit_action FROM dbo.am_audit_log WHERE audit_action IS NOT NULL ORDER BY audit_action
  `);
  return result.rows.map((r: any) => r.audit_action);
}

export async function getAuditLogStats() {
  const result = await getPool().query(`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT module) as total_modules,
      COUNT(DISTINCT audit_action) as total_actions,
      COUNT(DISTINCT user_id) as total_users,
      MIN(audit_date) as earliest_date,
      MAX(audit_date) as latest_date
    FROM dbo.am_audit_log
  `);
  return result.rows[0];
}

export async function getAuditLogsForKey(key: string) {
  const result = await getPool().query(`
    SELECT id, audit_action, audit_date, audit_key, audit_message, full_name, user_id, module
    FROM dbo.am_audit_log
    WHERE audit_key = $1
    ORDER BY audit_date DESC
  `, [key]);
  return result.rows;
}

export async function getRecentActivity(userId: string) {
  const result = await getPool().query(`
    SELECT id, audit_action, audit_date, audit_key, audit_message, full_name, user_id, module
    FROM dbo.am_audit_log
    WHERE user_id = $1
    ORDER BY audit_date DESC
    LIMIT 50
  `, [userId]);
  return result.rows;
}

export async function createAuditLog(data: {
  auditKey: string;
  auditAction: string;
  auditMessage: string;
  fullName: string;
  userId: string;
  module: string;
}) {
  const id = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 10000);
  const result = await getPool().query(`
    INSERT INTO dbo.am_audit_log (id, audit_key, audit_action, audit_date, audit_message, full_name, user_id, module)
    VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
    RETURNING *
  `, [id, data.auditKey, data.auditAction, data.auditMessage, data.fullName, data.userId, data.module]);
  return result.rows[0];
}

export async function createAuditLogTxn(data: {
  auditKey: string;
  auditAction: string;
  auditDate: Date;
  auditMessage: string;
  fullName: string;
  userId: string;
  module: string;
}) {
  const id = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 10000);
  const result = await getPool().query(`
    INSERT INTO dbo.am_audit_log (id, audit_key, audit_action, audit_date, audit_message, full_name, user_id, module)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [id, data.auditKey, data.auditAction, data.auditDate, data.auditMessage, data.fullName, data.userId, data.module]);
  return result.rows[0];
}

export async function getOrganizations() {
  const result = await getPool().query(`
    SELECT id, organization_name, currency 
    FROM dbo.um_org_dtls 
    WHERE entity_type IN ('MAIN', 'SUBSIDIARY')
      AND organization_name IS NOT NULL AND organization_name != ''
    ORDER BY organization_name ASC
  `);
  return result.rows;
}

export async function getOrgDetails() {
  const result = await getPool().query(`
    SELECT id, organization_name, org_legal_name, org_registration_no, 
           org_legal_address, org_city, org_state, org_country, 
           org_postalcode, org_phone_no, org_email, org_logo_path,
           date_format, number_format, rounding_precision, currency,
           default_paymentterms, default_tax, attribute_10
    FROM dbo.um_org_dtls
    WHERE entity_type = 'MAIN'
    LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function updateOrgDetails(id: string, data: any) {
  const result = await getPool().query(`
    UPDATE dbo.um_org_dtls
    SET org_legal_name = $1,
        org_registration_no = $2,
        org_legal_address = $3,
        org_city = $4,
        org_state = $5,
        org_country = $6,
        org_postalcode = $7,
        org_phone_no = $8,
        org_email = $9,
        date_format = $10,
        number_format = $11,
        rounding_precision = $12,
        currency = $13,
        default_paymentterms = $14,
        default_tax = $15,
        last_modified_date = NOW(),
        attribute_10=$17
    WHERE id = $16
    RETURNING *
  `, [
    data.org_legal_name,
    data.org_registration_no,
    data.org_legal_address,
    data.org_city,
    data.org_state,
    data.org_country,
    data.org_postalcode,
    data.org_phone_no,
    data.org_email,
    data.date_format,
    data.number_format,
    data.rounding_precision,
    data.currency,
    data.default_paymentterms,
    data.default_tax,
    id,
    data.attribute_10,
  ]);
  return result.rows[0] || null;
}

export async function updateOrgLogo(dataUrl: string) {
  const result = await getPool().query(`
    UPDATE dbo.um_org_dtls
    SET org_logo_path = $1,
        last_modified_date = NOW()
    WHERE entity_type = 'MAIN'
    RETURNING id
  `, [dataUrl]);
  return result.rows[0] || null;
}

export async function clearOrgLogo() {
  const result = await getPool().query(`
    UPDATE dbo.um_org_dtls
    SET org_logo_path = NULL,
        last_modified_date = NOW()
    WHERE entity_type = 'MAIN'
    RETURNING id
  `);
  return result.rows[0] || null;
}

export async function getSubsidiaries() {
  const result = await getPool().query(`
    SELECT id, organization_name, org_legal_name, org_registration_no, 
           org_legal_address, org_city, org_state, org_country, org_postalcode,
           org_email, org_phone_no, currency, date_format, number_format,
           rounding_precision, default_paymentterms as payment_terms, default_tax as tax_rate
    FROM dbo.um_org_dtls
    WHERE entity_type = 'SUBSIDIARY'
    ORDER BY organization_name
  `);
  return result.rows;
}

export async function getNextOrgId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.um_org_dtls`);
  return result.rows[0].next_id;
}

export async function createSubsidiary(nextId: number, data: any) {
  const result = await getPool().query(`
    INSERT INTO dbo.um_org_dtls (
      id, organization_name, org_legal_name, org_registration_no, org_legal_address,
      org_city, org_state, org_country, org_postalcode, org_phone_no, org_email,
      date_format, number_format, rounding_precision, default_paymentterms, default_tax,
      currency, entity_type, org_type, creation_date, last_modified_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'SUBSIDIARY','INTERNAL', NOW(), NOW())
    RETURNING id
  `, [nextId, data.name, data.legal_name, data.business_registration_no, data.legal_address, data.city, data.state,
    data.country, data.postal_code, data.phone, data.email, data.date_format, data.number_format,
    data.rounding_precision, data.payment_terms, data.tax_rate, data.currency]);
  return result.rows[0];
}

export async function updateSubsidiary(id: string, data: any) {
  const result = await getPool().query(`
    UPDATE dbo.um_org_dtls SET
      organization_name = $1, org_legal_name = $2, org_registration_no = $3,
      org_legal_address = $4, org_city = $5, org_state = $6, org_country = $7,
      org_postalcode = $8, org_phone_no = $9, org_email = $10,
      date_format = $11, number_format = $12, rounding_precision = $13,
      default_paymentterms = $14, default_tax = $15, currency = $16,
      last_modified_date = NOW()
    WHERE id = $17 AND entity_type = 'SUBSIDIARY'
    RETURNING id
  `, [data.name, data.legal_name, data.business_registration_no, data.legal_address, data.city, data.state,
  data.country, data.postal_code, data.phone, data.email, data.date_format, data.number_format,
  data.rounding_precision, data.payment_terms, data.tax_rate, data.currency, id]);
  return result.rows[0] || null;
}

export async function deleteSubsidiary(id: string) {
  const result = await getPool().query(
    `DELETE FROM dbo.um_org_dtls WHERE id = $1 AND entity_type = 'SUBSIDIARY' RETURNING id`,
    [id],
  );
  return result.rows[0] || null;
}

export async function getLocations() {
  const result = await getPool().query(`
    SELECT l.id, l.location_id, l.location_name, l.status, l.billto_address, l.shipto_address, l.org_id,
           o.organization_name
    FROM dbo.am_locations_mst l
    LEFT JOIN dbo.um_org_dtls o ON o.id = l.org_id
    ORDER BY l.location_name
  `);
  return result.rows;
}

export async function getNextLocationId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.am_locations_mst`);
  return result.rows[0].next_id;
}

export async function createLocation(nextId: number, locationId: string, data: any) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_locations_mst (
      id, location_id, location_name, billto_address, shipto_address, status, 
      org_id, operating_unit_id, created_by, creation_date, last_modified_date
    ) VALUES ($1, $2, $3, $4, $5, 'Y', $6, 101, 'SYSTEM', NOW(), NOW())
    RETURNING id
  `, [nextId, locationId, data.location_name.trim(), data.billto_address.trim(), data.shipto_address.trim(), data.org_id || 101]);
  return result.rows[0];
}

export async function updateLocation(id: string, data: any) {
  await getPool().query(`
    UPDATE dbo.am_locations_mst
    SET location_name = $2,
        billto_address = $3,
        shipto_address = $4,
        org_id = $5,
        last_modified_date = NOW(),
        last_modified_by = 'SYSTEM'
    WHERE id = $1
  `, [id, data.location_name.trim(), data.billto_address.trim(), data.shipto_address.trim(), data.org_id || 101]);
}

export async function deleteLocation(id: string) {
  await getPool().query(`DELETE FROM dbo.am_locations_mst WHERE id = $1`, [id]);
}

export async function updateLocationStatus(id: string, status: string) {
  await getPool().query(`
    UPDATE dbo.am_locations_mst
    SET status = $2,
        last_modified_date = NOW(),
        last_modified_by = 'SYSTEM'
    WHERE id = $1
  `, [id, status]);
}

export async function getLookups(page: number, limit: number, search: string) {
  const offset = (page - 1) * limit;
  let whereConditions: string[] = [];
  let params: any[] = [];
  let paramIndex = 1;

  if (search && search.trim() !== "") {
    const searchPattern = `%${search.trim().toLowerCase()}%`;
    whereConditions.push(`(
      LOWER(COALESCE(key_1, '')) LIKE $${paramIndex} OR 
      LOWER(COALESCE(key_2, '')) LIKE $${paramIndex} OR 
      LOWER(COALESCE(description, '')) LIKE $${paramIndex}
    )`);
    params.push(searchPattern);
    paramIndex++;
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_lookup_params_dtls ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const dataParams = [...params, limit, offset];
  const result = await getPool().query(`
    SELECT id, key_1 as property_name, key_2 as lookup_key, value as lookup_value, description, status
    FROM dbo.am_lookup_params_dtls
    ${whereClause}
    ORDER BY key_1, key_2
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, dataParams);

  return { data: result.rows, total, page, limit };
}

export async function getNextLookupId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.am_lookup_params_dtls`);
  return result.rows[0].next_id;
}

export async function createLookup(nextId: number, data: any) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_lookup_params_dtls (
      id, key_1, key_2, value, description, status, created_by, creation_date
    ) VALUES ($1, $2, $3, $4, $5, 'Y', 'SYSTEM', NOW())
    RETURNING id
  `, [nextId, data.property_name.trim(), data.lookup_key.trim(), data.lookup_value.trim(), data.description.trim()]);
  return result.rows[0];
}

export async function updateLookup(id: string, data: any) {
  await getPool().query(`
    UPDATE dbo.am_lookup_params_dtls
    SET key_1 = $2,
        key_2 = $3,
        value = $4,
        description = $5,
        last_modified_by = 'SYSTEM',
        last_modified_date = NOW()
    WHERE id = $1
  `, [id, data.property_name.trim(), data.lookup_key.trim(), data.lookup_value.trim(), data.description.trim()]);
}

export async function getLookupsByProperty(propertyKey: string) {
  const result = await getPool().query(
    `SELECT id, key_1 as property_name, key_2 as lookup_key, value as lookup_value, description
     FROM dbo.am_lookup_params_dtls
     WHERE UPPER(key_1) = UPPER($1) AND status = 'Y'
     ORDER BY key_2`,
    [propertyKey]
  );
  return result.rows;
}

export async function deleteLookup(id: string) {
  await getPool().query(`DELETE FROM dbo.am_lookup_params_dtls WHERE id = $1`, [id]);
}

export async function updateLookupStatus(id: string, status: string) {
  await getPool().query(`
    UPDATE dbo.am_lookup_params_dtls
    SET status = $2,
        last_modified_by = 'SYSTEM',
        last_modified_date = NOW()
    WHERE id = $1
  `, [id, status]);
}

export async function getPaymentTerms(page: number, limit: number, search: string) {
  const offset = (page - 1) * limit;
  let whereClause = "";
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause = `WHERE (terms_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR payment_term_id ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_payment_terms_mst ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const dataParams = [...params, limit, offset];
  const result = await getPool().query(`
    SELECT id, payment_term_id, terms_name, description, status
    FROM dbo.am_payment_terms_mst
    ${whereClause}
    ORDER BY payment_term_id
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, dataParams);

  return { data: result.rows, total, page, limit };
}

export async function getPaymentTermPrefixValue(): Promise<string> {
  const result = await getPool().query(`
    SELECT prefix_value FROM dbo.am_prefix_mst
    WHERE UPPER(TRIM(prefix_name)) IN ('PAYMENT TERMS', 'PAYMENT TERM', 'PAY')
    AND status = 'Active' LIMIT 1
  `);
  return result.rows[0]?.prefix_value?.trim() || '';
}

export async function getNextPaymentTermId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.am_payment_terms_mst`);
  return result.rows[0].next_id;
}

export async function createPaymentTerm(nextId: number, data: any) {
  const termId = data.payment_term_id || String(nextId);
  const result = await getPool().query(`
    INSERT INTO dbo.am_payment_terms_mst (
      id, payment_term_id, terms_name, description, status
    ) VALUES ($1, $2, $3, $4, 'Y')
    RETURNING id
  `, [nextId, termId, data.terms_name.trim(), data.description.trim()]);
  return result.rows[0];
}

export async function updatePaymentTerm(id: string, data: any) {
  await getPool().query(`
    UPDATE dbo.am_payment_terms_mst
    SET terms_name = $2, description = $3
    WHERE id = $1
  `, [id, data.terms_name.trim(), data.description.trim()]);
}

export async function deletePaymentTerm(id: string) {
  await getPool().query(`DELETE FROM dbo.am_payment_terms_mst WHERE id = $1`, [id]);
}

export async function updatePaymentTermStatus(id: string, status: string) {
  await getPool().query(`UPDATE dbo.am_payment_terms_mst SET status = $2 WHERE id = $1`, [id, status]);
}

export async function getTaxes(page: number, limit: number, search: string) {
  const offset = (page - 1) * limit;
  let whereClause = "";
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause = `WHERE (tax_code ILIKE $${paramIndex} OR tax_code_desc ILIKE $${paramIndex} OR tax_type ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_tax_code_mapping_mst ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const dataParams = [...params, limit, offset];
  const result = await getPool().query(`
    SELECT id, tax_code_id, tax_code, tax_code_desc, tax_rate, tax_type, status
    FROM dbo.am_tax_code_mapping_mst
    ${whereClause}
    ORDER BY tax_code_id
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, dataParams);

  return { data: result.rows, total, page, limit };
}

export async function getTaxPrefixValue(): Promise<string> {
  const result = await getPool().query(`
    SELECT prefix_value FROM dbo.am_prefix_mst
    WHERE UPPER(TRIM(prefix_name)) IN ('TAXES', 'TAX')
    AND status = 'Active' LIMIT 1
  `);
  return result.rows[0]?.prefix_value?.trim() || '';
}

export async function getNextTaxId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.am_tax_code_mapping_mst`);
  return result.rows[0].next_id;
}

export async function createTax(nextId: number, data: any) {
  const taxCodeId = data.tax_code_id || String(nextId);
  const result = await getPool().query(`
    INSERT INTO dbo.am_tax_code_mapping_mst (
      id, tax_code_id, tax_code, tax_code_desc, tax_rate, tax_type, status, created_by, creation_date
    ) VALUES ($1, $2, $3, $4, $5, $6, 'Y', 'SYSTEM', NOW())
    RETURNING id
  `, [nextId, taxCodeId, data.tax_code.trim(), data.tax_code_desc.trim(), parseFloat(data.tax_rate), data.tax_type.trim()]);
  return result.rows[0];
}

export async function updateTax(id: string, data: any) {
  await getPool().query(`
    UPDATE dbo.am_tax_code_mapping_mst
    SET tax_code = $2, tax_code_desc = $3, tax_rate = $4, tax_type = $5, last_updated_by = 'SYSTEM', last_updated_date = NOW()
    WHERE id = $1
  `, [id, data.tax_code.trim(), data.tax_code_desc.trim(), parseFloat(data.tax_rate), data.tax_type.trim()]);
}

export async function deleteTax(id: string) {
  await getPool().query(`DELETE FROM dbo.am_tax_code_mapping_mst WHERE id = $1`, [id]);
}

export async function updateTaxStatus(id: string, status: string) {
  await getPool().query(`UPDATE dbo.am_tax_code_mapping_mst SET status = $2 WHERE id = $1`, [id, status]);
}

export async function getPrefixes(page: number, limit: number, search: string) {
  const offset = (page - 1) * limit;
  let whereClause = "";
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause = `WHERE (prefix_name ILIKE $${paramIndex} OR prefix_value ILIKE $${paramIndex} OR prefix_key ILIKE $${paramIndex} OR prefix_description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_prefix_mst ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const dataParams = [...params, limit, offset];
  const result = await getPool().query(`
    SELECT id, prefix_name, prefix_value, prefix_key, prefix_description, status
    FROM dbo.am_prefix_mst
    ${whereClause}
    ORDER BY prefix_name
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, dataParams);

  return { data: result.rows, total, page, limit };
}

export async function createPrefix(data: any) {
  const nextIdResult = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.am_prefix_mst`);
  const nextId = nextIdResult.rows[0].next_id;
  const result = await getPool().query(`
    INSERT INTO dbo.am_prefix_mst (
      id, prefix_name, prefix_value, prefix_key, prefix_description, status, createdby, created_date
    ) VALUES ($1, $2, $3, $4, $5, 'Active', 'SYSTEM', NOW())
    RETURNING id
  `, [nextId, data.prefix_name.trim(), data.prefix_value.trim(), data.prefix_key.trim(), data.prefix_description?.trim() || '']);
  return result.rows[0];
}

export async function updatePrefix(id: string, data: any) {
  await getPool().query(`
    UPDATE dbo.am_prefix_mst
    SET prefix_name = $2, prefix_value = $3, prefix_key = $4, prefix_description = $5, 
        last_updated_by = 'SYSTEM', last_updated_date = NOW()
    WHERE id = $1
  `, [id, data.prefix_name.trim(), data.prefix_value.trim(), data.prefix_key.trim(), data.prefix_description?.trim() || '']);
}

export async function deletePrefix(id: string) {
  await getPool().query(`DELETE FROM dbo.am_prefix_mst WHERE id = $1`, [id]);
}

export async function updatePrefixStatus(id: string, status: string) {
  await getPool().query(`UPDATE dbo.am_prefix_mst SET status = $2, last_updated_by = 'SYSTEM', last_updated_date = NOW() WHERE id = $1`, [id, status]);
}

export async function getTermsConditions(page: number, limit: number, search: string | undefined) {
  const offset = (page - 1) * limit;
  let whereClause = "";
  let queryParams: any[] = [];

  if (search && search.trim()) {
    const paramIndex = 1;
    whereClause = `WHERE (module_name ILIKE $${paramIndex} OR tnc_text ILIKE $${paramIndex})`;
    queryParams.push(`%${search.trim()}%`);
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_org_terms_conditions ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].total);

  const result = await getPool().query(`
    SELECT id, module_name, tnc_text, status, created_by, creation_time
    FROM dbo.am_org_terms_conditions
    ${whereClause}
    ORDER BY creation_time DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `, [...queryParams, limit, offset]);

  return { data: result.rows, total, page, limit };
}

export async function getTermsConditionsByModuleName(moduleName: string) {
  const result = await getPool().query(`
    SELECT 
      tc.id,
      tc.module_name,
      tc.tnc_text,
      tc.status,
      tc.created_by,
      tc.creation_time,
      doc.filename,
      doc.filetype,
      doc.data
    FROM dbo.am_org_terms_conditions tc
    LEFT JOIN dbo.am_documents_dtls doc
      ON CAST(doc.attribute_1 AS INT) = tc.id
    WHERE tc.module_name = $1
    ORDER BY creation_time DESC
  `, [moduleName]);
  return result.rows[0] || null;
}

export async function createTermsCondition(data: any, userName: string) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_org_terms_conditions (
      module_name, tnc_text, status, created_by, creation_time, last_modified_by, last_modification_time, object_version_number
    ) VALUES ($1, $2, 1, $3, NOW(), $3, NOW(), 0) RETURNING *
  `, [data.module_name.trim(), data.tnc_text.trim(), userName]);
  return result.rows[0];
}

export async function updateTermsCondition(id: string, data: any) {
  await getPool().query(`
    UPDATE dbo.am_org_terms_conditions
    SET module_name = $2, tnc_text = $3, last_modified_by = 'SYSTEM', last_modification_time = NOW()
    WHERE id = $1
  `, [id, data.module_name.trim(), data.tnc_text.trim()]);
}

export async function deleteTermsCondition(id: string) {
  await getPool().query(`DELETE FROM dbo.am_org_terms_conditions WHERE id = $1`, [id]);
}

export async function updateTermsConditionStatus(id: string, status: string) {
  await getPool().query(`UPDATE dbo.am_org_terms_conditions SET status = $2, last_modified_by = 'SYSTEM', last_modification_time = NOW() WHERE id = $1`, [id, status]);
}

export async function getTermsConditionModules() {
  const result = await getPool().query(`
    SELECT DISTINCT module_name FROM dbo.am_org_terms_conditions ORDER BY module_name
  `);
  return result.rows.map((r: any) => r.module_name);
}

export async function getTermsConditionDocument(tncId: string) {
  const result = await getPool().query(`
    SELECT id, doc_name, doc_desc, filename, filetype, status, creation_date, doc_path
    FROM dbo.am_documents_dtls 
    WHERE record_type = 'TERMS_CONDITION_DOC' AND attribute_1 = $1
    ORDER BY creation_date DESC
    LIMIT 1
  `, [tncId]);
  return result.rows[0] || null;
}

export async function getExistingTncDocument(tncId: string) {
  const result = await getPool().query(
    `SELECT id FROM dbo.am_documents_dtls WHERE record_type = 'TERMS_CONDITION_DOC' AND attribute_1 = $1`,
    [tncId]
  );
  return result.rows[0] || null;
}

export async function getTncModuleName(tncId: string) {
  const result = await getPool().query(
    `SELECT module_name FROM dbo.am_org_terms_conditions WHERE id = $1`,
    [tncId]
  );
  return result.rows[0]?.module_name || 'Unknown';
}

export async function updateTncDocument(docId: number, docName: string, filename: string, filetype: string, base64Data: string, previewImage: string | null) {
  await getPool().query(`
    UPDATE dbo.am_documents_dtls
    SET doc_name = $2, doc_desc = $3, filename = $4, filetype = $5, 
        data = $6, doc_path = $7, last_modified_by = 'SYSTEM', last_modified_date = NOW()
    WHERE id = $1
  `, [docId, docName, docName, filename, filetype, base64Data, previewImage]);
}

export async function createTncDocument(docId: number, docName: string, filename: string, filetype: string, tncId: string, base64Data: string, previewImage: string | null) {
  await getPool().query(`
    INSERT INTO dbo.am_documents_dtls (
      id, doc_name, doc_desc, filename, filetype, record_type, attribute_1, data, doc_path,
      status, created_by, creation_date, last_modified_by, last_modified_date
    ) VALUES ($1, $2, $3, $4, $5, 'TERMS_CONDITION_DOC', $6, $7, $8, 'Active', 'SYSTEM', NOW(), 'SYSTEM', NOW())
  `, [docId, docName, docName, filename, filetype, tncId, base64Data, previewImage]);
}

export async function deleteTncDocument(tncId: string) {
  await getPool().query(
    `DELETE FROM dbo.am_documents_dtls WHERE record_type = 'TERMS_CONDITION_DOC' AND attribute_1 = $1`,
    [tncId]
  );
}

export async function getSetupNotifications(page: number, limit: number, search: string | undefined) {
  const offset = (page - 1) * limit;
  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (search) {
    params.push(`%${search}%`);
    whereClause += ` AND (event_name ILIKE $${params.length} OR event_id ILIKE $${params.length} OR notif_subject ILIKE $${params.length})`;
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_aprvl_notification_dtls ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  const result = await getPool().query(`
    SELECT id, notification_id, event_id, event_name, notif_subject, notif_content_tmplate,
           sms_content_tmpl, from_role, from_user, to_role, to_user, cc_group, status,
           created_by, creation_date, last_modified_by, last_modified_date
    FROM dbo.am_aprvl_notification_dtls
    ${whereClause}
    ORDER BY event_name ASC, id
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  return { data: result.rows, total, page, limit };
}

export async function getNotificationPrefixValue(): Promise<string> {
  const result = await getPool().query(`
    SELECT prefix_value FROM dbo.am_prefix_mst
    WHERE UPPER(TRIM(prefix_name)) IN ('SETUP NOTIFICATION', 'NOTIFICATION', 'NTF')
    AND status = 'Active' LIMIT 1
  `);
  return result.rows[0]?.prefix_value?.trim() || 'NTF';
}

export async function getNextNotificationId() {
  const result = await getPool().query(`
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(notification_id, '^[^0-9]+', '') AS INTEGER)), 0) + 1 as next_id
    FROM dbo.am_aprvl_notification_dtls
    WHERE notification_id ~ '^[^0-9]+[0-9]+$'
  `);
  return result.rows[0].next_id;
}

export async function createSetupNotification(notificationId: string, data: any) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_aprvl_notification_dtls 
    (notification_id, event_id, event_name, notif_subject, notif_content_tmplate, sms_content_tmpl,
     from_role, from_user, to_role, to_user, cc_group, status, created_by, creation_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SYSTEM', NOW())
    RETURNING *
  `, [notificationId, data.event_id, data.event_name, data.notif_subject, data.notif_content_tmplate || null,
    data.sms_content_tmpl || null, data.from_role || null, data.from_user || null, data.to_role || null,
    data.to_user || null, data.cc_group || null, data.status || 'READ']);
  return result.rows[0];
}

export async function updateSetupNotification(id: string, data: any) {
  const result = await getPool().query(`
    UPDATE dbo.am_aprvl_notification_dtls
    SET event_id = $1, event_name = $2, notif_subject = $3, notif_content_tmplate = $4,
        sms_content_tmpl = $5, from_role = $6, from_user = $7, to_role = $8, to_user = $9,
        cc_group = $10, status = $11, last_modified_by = 'SYSTEM', last_modified_date = NOW()
    WHERE id = $12
    RETURNING *
  `, [data.event_id, data.event_name, data.notif_subject, data.notif_content_tmplate || null,
  data.sms_content_tmpl || null, data.from_role || null, data.from_user || null, data.to_role || null,
  data.to_user || null, data.cc_group || null, data.status, id]);
  return result.rows[0] || null;
}

export async function deleteSetupNotification(id: string) {
  const result = await getPool().query(`
    DELETE FROM dbo.am_aprvl_notification_dtls WHERE id = $1 RETURNING *
  `, [id]);
  return result.rows[0] || null;
}

export async function getCostCenters(page: number, limit: number, search: string | undefined) {
  const offset = (page - 1) * limit;
  let whereClause = "";
  let queryParams: any[] = [];

  if (search && search.trim()) {
    whereClause = `WHERE (segment_type ILIKE $1 OR description ILIKE $1 OR cost_center_id ILIKE $1)`;
    queryParams.push(`%${search.trim()}%`);
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_bussiness_seg_mst ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].total);

  const result = await getPool().query(`
    SELECT m.id, m.segment_type, m.description, m.status, m.cost_center_id,
           (SELECT COUNT(*) FROM dbo.am_bussiness_seg_dtl d WHERE d.segment_type_id = m.id) as item_count
    FROM dbo.am_bussiness_seg_mst m
    ${whereClause}
    ORDER BY m.id
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `, [...queryParams, limit, offset]);

  return { data: result.rows, total, page, limit };
}

export async function createCostCenter(data: any) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_bussiness_seg_mst (segment_type, description, status, cost_center_id)
    VALUES ($1, $2, 'Y', $3) RETURNING *
  `, [data.segment_type.trim(), data.description?.trim() || null, data.cost_center_id?.trim() || null]);
  return result.rows[0];
}

export async function updateCostCenter(id: string, data: any) {
  await getPool().query(`
    UPDATE dbo.am_bussiness_seg_mst
    SET segment_type = $2, description = $3, cost_center_id = $4
    WHERE id = $1
  `, [id, data.segment_type.trim(), data.description?.trim() || null, data.cost_center_id?.trim() || null]);
}

export async function getCostCenterDetailCount(id: string) {
  const result = await getPool().query(
    `SELECT COUNT(*) as count FROM dbo.am_bussiness_seg_dtl WHERE segment_type_id = $1`,
    [id]
  );
  return parseInt(result.rows[0].count);
}

export async function deleteCostCenter(id: string) {
  await getPool().query(`DELETE FROM dbo.am_bussiness_seg_mst WHERE id = $1`, [id]);
}

export async function updateCostCenterStatus(id: string, status: string) {
  await getPool().query(`UPDATE dbo.am_bussiness_seg_mst SET status = $2 WHERE id = $1`, [id, status]);
}

export async function getCostCenterItems(segmentId: string, page: number, limit: number, search: string | undefined) {
  const offset = (page - 1) * limit;
  let whereClause = `WHERE segment_type_id = $1`;
  let queryParams: any[] = [segmentId];

  if (search && search.trim()) {
    whereClause += ` AND (code ILIKE $2 OR value ILIKE $2 OR data_area_id ILIKE $2)`;
    queryParams.push(`%${search.trim()}%`);
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.am_bussiness_seg_dtl ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].total);

  const result = await getPool().query(`
    SELECT id, code, value, segment_type_id, status, data_area_id,
           attribute_1, attribute_2, attribute_3, attribute_4, attribute_5, attribute_6
    FROM dbo.am_bussiness_seg_dtl
    ${whereClause}
    ORDER BY id
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `, [...queryParams, limit, offset]);

  return { data: result.rows, total, page, limit };
}

export async function createCostCenterItem(segmentId: string, data: any) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_bussiness_seg_dtl (
      code, value, segment_type_id, status, data_area_id,
      attribute_1, attribute_2, attribute_3, attribute_4, attribute_5, attribute_6
    ) VALUES ($1, $2, $3, 'Y', $4, $5, $6, $7, $8, $9, $10) RETURNING *
  `, [
    data.code.trim(), data.value.trim(), segmentId,
    data.data_area_id?.trim() || null,
    data.attribute_1?.trim() || null, data.attribute_2?.trim() || null, data.attribute_3?.trim() || null,
    data.attribute_4?.trim() || null, data.attribute_5?.trim() || null, data.attribute_6?.trim() || null
  ]);
  return result.rows[0];
}

export async function updateCostCenterItem(id: string, data: any) {
  await getPool().query(`
    UPDATE dbo.am_bussiness_seg_dtl
    SET code = $2, value = $3, data_area_id = $4,
        attribute_1 = $5, attribute_2 = $6, attribute_3 = $7,
        attribute_4 = $8, attribute_5 = $9, attribute_6 = $10
    WHERE id = $1
  `, [
    id, data.code.trim(), data.value.trim(), data.data_area_id?.trim() || null,
    data.attribute_1?.trim() || null, data.attribute_2?.trim() || null, data.attribute_3?.trim() || null,
    data.attribute_4?.trim() || null, data.attribute_5?.trim() || null, data.attribute_6?.trim() || null
  ]);
}

export async function deleteCostCenterItem(id: string) {
  await getPool().query(`DELETE FROM dbo.am_bussiness_seg_dtl WHERE id = $1`, [id]);
}

export async function updateCostCenterItemStatus(id: string, status: string) {
  await getPool().query(`UPDATE dbo.am_bussiness_seg_dtl SET status = $2 WHERE id = $1`, [id, status]);
}

export async function getWorkflowDefinitions() {
  const result = await getPool().query(`
    SELECT id, name,list_status FROM dbo.wf_definition ORDER BY id
  `);
  return result.rows;
}

export async function getWorkflowOrganizations() {
  const result = await getPool().query(`
    SELECT id, organization_name 
    FROM dbo.um_org_dtls 
    WHERE org_type = 'INTERNAL'
    ORDER BY organization_name
  `);
  return result.rows;
}

export async function getWorkflowDepartments() {
  const result = await getPool().query(`
    SELECT id, code, value 
    FROM dbo.am_bussiness_seg_dtl 
    WHERE segment_type_id = 3 and status = 'Y'
    ORDER BY value
  `);
  return result.rows;
}

export async function getWorkflowUsers() {
  const result = await getPool().query(`
    SELECT id, email_id, name, user_name
    FROM dbo.um_user_dtls 
    WHERE user_status = 1 AND user_type = 0
    ORDER BY name
  `);
  return result.rows;
}

export async function getWorkflowRoles() {
  const result = await getPool().query(`
    SELECT id, role_name, role_display_name, role_type
    FROM dbo.um_role_dtls 
    WHERE status = 1 
      AND role_name NOT LIKE '%SUPPLIER%'
    ORDER BY role_display_name
  `);
  return result.rows;
}

export async function getWorkflowDefinition(id: string) {
  const result = await getPool().query(`
    SELECT id, name FROM dbo.wf_definition WHERE id = $1
  `, [id]);
  return result.rows[0] || null;
}

export async function getWorkflowSteps(wfDefinitionId: string) {
  const result = await getPool().query(`
    SELECT 
      ws.id, ws.name, ws.step_order, ws.step_type,
      COALESCE(
        json_agg(
          json_build_object(
            'id', wsa.id,
            'assignment_type', wsa.assignment_type,
            'assignment_expression', wsa.assignment_expression,
            'assignment_name', wsa.assignment_name,
            'condition', wsa.condition
          )
        ) FILTER (WHERE wsa.id IS NOT NULL),
        '[]'
      ) as assignments
    FROM dbo.wf_step ws
    LEFT JOIN dbo.wf_step_assignment wsa ON ws.id = wsa.step_id
    WHERE ws.wf_definition_id = $1
    GROUP BY ws.id, ws.name, ws.step_order, ws.step_type
    ORDER BY ws.step_order
  `, [wfDefinitionId]);
  return result.rows;
}

export async function getNextStepOrder(wfDefinitionId: string) {
  const result = await getPool().query(`
    SELECT COALESCE(MAX(step_order), 0) + 1 as next_order
    FROM dbo.wf_step WHERE wf_definition_id = $1
  `, [wfDefinitionId]);
  return result.rows[0].next_order;
}

export async function createWorkflowStep(name: string, nextOrder: number, stepType: string, wfDefinitionId: string) {
  const result = await getPool().query(`
    INSERT INTO dbo.wf_step (name, step_order, step_type, wf_definition_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, step_order, step_type
  `, [name, nextOrder, stepType || 'Generic', wfDefinitionId]);
  return result.rows[0];
}

export async function createStepAssignment(stepId: number, assignment: any) {
  await getPool().query(`
    INSERT INTO dbo.wf_step_assignment (step_id, assignment_type, assignment_expression, assignment_name, condition)
    VALUES ($1, $2, $3, $4, $5)
  `, [stepId, assignment.assignment_type, assignment.assignment_expression, assignment.assignment_name || null, assignment.condition || null]);
}

export async function getStepWithAssignments(stepId: number) {
  const result = await getPool().query(`
    SELECT 
      ws.id, ws.name, ws.step_order, ws.step_type,
      COALESCE(
        json_agg(
          json_build_object(
            'id', wsa.id,
            'assignment_type', wsa.assignment_type,
            'assignment_expression', wsa.assignment_expression,
            'assignment_name', wsa.assignment_name,
            'condition', wsa.condition
          )
        ) FILTER (WHERE wsa.id IS NOT NULL),
        '[]'
      ) as assignments
    FROM dbo.wf_step ws
    LEFT JOIN dbo.wf_step_assignment wsa ON ws.id = wsa.step_id
    WHERE ws.id = $1
    GROUP BY ws.id, ws.name, ws.step_order, ws.step_type
  `, [stepId]);
  return result.rows[0] || null;
}

export async function getTaskCountByStepId(stepId: number) {
  const result = await getPool().query(`
    select count(*) from dbo.wf_step_instance where step_id=$1 and status='Ready'
  `, [stepId]);
  return parseInt(result.rows[0]?.count || 0);
}
export async function getStepAssignment(assignmentId: number) {
  const result = await getPool().query(`
    SELECT * FROM dbo.wf_step_assignment WHERE id = $1 LIMIT 1
  `, [assignmentId]);
  return result.rows[0] || null;
}

export async function updateStepAssignments(stepId: string, assignments: any[]) {
  const assignment = assignments[0];
  await getPool().query(`
    UPDATE dbo.wf_step_assignment SET 
    assignment_expression = $1 , assignment_name = $2, assignment_type = $3, condition = $4
    WHERE id = $5
  `, [assignment.assignment_expression, assignment.assignment_name, assignment.assignment_type, assignment.condition, assignment.id]);
  return assignment;
}
export async function updateWorkflowStep(stepId: string, name: string, stepType: string) {
  await getPool().query(`
    UPDATE dbo.wf_step SET name = $1, step_type = $2 WHERE id = $3
  `, [name, stepType || 'Generic', stepId]);
}

export async function deleteStepAssignments(stepId: string) {
  await getPool().query(`DELETE FROM dbo.wf_step_assignment WHERE step_id = $1`, [stepId]);
}

export async function deleteStepAssignmentById(assignmentId: string) {
  await getPool().query(`DELETE FROM dbo.wf_step_assignment WHERE id = $1`, [assignmentId]);
}

export async function getStepOrder(stepId: string) {
  const result = await getPool().query(`
    SELECT step_order FROM dbo.wf_step WHERE id = $1
  `, [stepId]);
  return result.rows[0]?.step_order || null;
}

export async function deleteWorkflowStep(stepId: string) {
  await getPool().query(`DELETE FROM dbo.wf_step WHERE id = $1`, [stepId]);
}

export async function reorderStepsAfterDelete(wfId: string, deletedOrder: number) {
  await getPool().query(`
    UPDATE dbo.wf_step 
    SET step_order = step_order - 1 
    WHERE wf_definition_id = $1 AND step_order > $2
  `, [wfId, deletedOrder]);
}

export async function reorderStep(stepId: number, newOrder: number, wfDefinitionId: string) {
  await getPool().query(`
    UPDATE dbo.wf_step SET step_order = $1 WHERE id = $2 AND wf_definition_id = $3
  `, [newOrder, stepId, wfDefinitionId]);
}

export async function getUserDetails(userId: number) {
  const result = await getPool().query(`
    SELECT id, user_name, email_id, name, designation
    FROM dbo.um_user_dtls 
    WHERE id = $1
  `, [userId]);
  return result.rows[0] || null;
}

export async function getUserDetailsByUsername(username: string) {
  const result = await getPool().query(`
    SELECT id, user_name, email_id, name, designation
    FROM dbo.um_user_dtls 
    WHERE LOWER(TRIM(user_name)) = LOWER(TRIM($1))
  `, [username]);
  return result.rows[0] || null;
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

export async function getAIServiceSettings() {
  const result = await getPool().query(`
    SELECT id, feature_key, feature_name, module_name, description, is_enabled, updated_by, updated_date
    FROM dbo.am_ai_service_settings
    ORDER BY module_name, feature_name
  `);
  return result.rows;
}

export async function updateAIServiceSetting(featureKey: string, isEnabled: boolean, updatedBy: string) {
  const result = await getPool().query(`
    UPDATE dbo.am_ai_service_settings
    SET is_enabled = $1, updated_by = $2, updated_date = NOW()
    WHERE feature_key = $3
    RETURNING *
  `, [isEnabled, updatedBy, featureKey]);
  return result.rows[0];
}

export async function bulkUpdateAIServiceSettings(isEnabled: boolean, updatedBy: string) {
  await getPool().query(`
    UPDATE dbo.am_ai_service_settings
    SET is_enabled = $1, updated_by = $2, updated_date = NOW()
  `, [isEnabled, updatedBy]);
  return { success: true };
}

export async function getAIModelConfigs() {
  const result = await getPool().query(`
    SELECT id, provider_name, provider_key, display_name, description, api_base_url,
           CASE WHEN api_key IS NOT NULL AND api_key != '' THEN '••••••••' ELSE NULL END as api_key_masked,
           model_name, is_active, is_available, provider_type, icon_name, updated_by, updated_date
    FROM dbo.am_ai_model_config
    ORDER BY is_active DESC, provider_name
  `);
  return result.rows.map((row: any) => ({
    ...row,
    is_configured: !!(row.api_key_masked),
  }));
}

export async function getActiveAIModelConfig(includeSecrets: boolean = false) {
  if (includeSecrets) {
    const result = await getPool().query(`
      SELECT id, provider_name, provider_key, display_name, api_base_url, api_key, model_name, provider_type
      FROM dbo.am_ai_model_config
      WHERE is_active = true
      LIMIT 1
    `);
    return result.rows[0] || null;
  }
  const result = await getPool().query(`
    SELECT id, provider_name, provider_key, display_name, api_base_url, model_name, provider_type
    FROM dbo.am_ai_model_config
    WHERE is_active = true
    LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function updateAIModelConfig(providerKey: string, data: { apiBaseUrl?: string; apiKey?: string; modelName?: string }, updatedBy: string) {
  const setClauses = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (data.apiBaseUrl !== undefined) {
    setClauses.push(`api_base_url = $${paramIdx++}`);
    params.push(data.apiBaseUrl);
  }
  if (data.apiKey !== undefined && data.apiKey !== '••••••••') {
    setClauses.push(`api_key = $${paramIdx++}`);
    params.push(data.apiKey);
  }
  if (data.modelName !== undefined) {
    setClauses.push(`model_name = $${paramIdx++}`);
    params.push(data.modelName);
  }
  setClauses.push(`updated_by = $${paramIdx++}`);
  params.push(updatedBy);
  setClauses.push(`updated_date = NOW()`);
  params.push(providerKey);

  const result = await getPool().query(`
    UPDATE dbo.am_ai_model_config
    SET ${setClauses.join(', ')}
    WHERE provider_key = $${paramIdx}
    RETURNING id, provider_name, provider_key, display_name, model_name, is_active, provider_type
  `, params);
  return result.rows[0];
}

export async function activateAIModelConfig(providerKey: string, updatedBy: string) {
  await getPool().query(`UPDATE dbo.am_ai_model_config SET is_active = false, updated_date = NOW()`);
  const result = await getPool().query(`
    UPDATE dbo.am_ai_model_config
    SET is_active = true, updated_by = $1, updated_date = NOW()
    WHERE provider_key = $2
    RETURNING *
  `, [updatedBy, providerKey]);
  return result.rows[0];
}

export async function disconnectAIModelConfig(providerKey: string, updatedBy: string) {
  const result = await getPool().query(`
    UPDATE dbo.am_ai_model_config
    SET is_active = false, updated_by = $1, updated_date = NOW()
    WHERE provider_key = $2 AND is_active = true
    RETURNING *
  `, [updatedBy, providerKey]);
  return result.rows[0];
}

export async function testAIModelConnection(providerKey: string) {
  const result = await getPool().query(`
    SELECT api_base_url, api_key, model_name, provider_key
    FROM dbo.am_ai_model_config
    WHERE provider_key = $1
  `, [providerKey]);
  return result.rows[0] || null;
}

export async function getAIModelForUsage(providerKey: string) {
  const result = await getPool().query(`
    SELECT api_key, api_base_url, provider_type, provider_key
    FROM dbo.am_ai_model_config
    WHERE provider_key = $1
  `, [providerKey]);
  return result.rows[0] || null;
}

export async function getAIUsageStats(providerKey: string) {
  const result = await getPool().query(`
    SELECT
      COALESCE(SUM(total_tokens), 0)::bigint AS tokens_total,
      COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN total_tokens ELSE 0 END), 0)::bigint AS tokens_month,
      COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN total_tokens ELSE 0 END), 0)::bigint AS tokens_today,
      COUNT(*)::int AS requests_month
    FROM dbo.am_ai_usage_log
    WHERE provider_key = $1
  `, [providerKey]);
  return result.rows[0] || { tokens_total: 0, tokens_month: 0, tokens_today: 0, requests_month: 0 };
}

export async function getAIUsageDailyStats(providerKey: string) {
  // Bucket by local calendar day (session timezone), NOT UTC, so these rows agree
  // with the CURRENT_DATE-based tokens_today in getAIUsageStats above. Returned as
  // text via to_char: a Postgres DATE would be parsed by node-postgres into a JS
  // Date at local midnight, and any later toISOString() would shift it back a day
  // for every timezone east of UTC.
  const result = await getPool().query(`
    SELECT
      to_char(created_at, 'YYYY-MM-DD')        AS day,
      COALESCE(SUM(prompt_tokens), 0)::int     AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
      COALESCE(SUM(total_tokens), 0)::int      AS total_tokens,
      COUNT(*)::int                            AS requests
    FROM dbo.am_ai_usage_log
    WHERE provider_key = $1
      AND created_at >= CURRENT_DATE - INTERVAL '29 days'
    GROUP BY to_char(created_at, 'YYYY-MM-DD')
    ORDER BY day ASC
  `, [providerKey]);
  return result.rows as {
    day: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    requests: number;
  }[];
}

export async function resetAIUsageLogs(providerKey: string) {
  await getPool().query(
    `DELETE FROM dbo.am_ai_usage_log WHERE provider_key = $1`,
    [providerKey]
  );
}

export async function getTaskById(taskId: string) {
  const result = await getPool().query(`
    SELECT t.id_, t.name_, t.description_, t.assignee_, t.create_time_, t.priority_
    FROM dbo.act_ru_task t
    WHERE t.id_ = $1
  `, [taskId]);
  return result.rows[0] || null;
}

export async function getTnCByIds(idList: number[]) {
  if (!idList || idList.length === 0) return [];
  const result = await getPool().query(
    `SELECT *
    FROM dbo.am_org_terms_conditions
    WHERE id = ANY($1)`,
    [idList]
  );

  return result.rows;
}

export async function updateApprovers(
  moduleType: string,
  oldAssignee: string,
  newAssignee: string
) {
  try {
    let query;

    if (moduleType.toLowerCase() === "purchase order") {
      query = sql`
        UPDATE dbo.supp_po_header_dtls
        SET approvers_list = REPLACE(approvers_list, ${oldAssignee}, ${newAssignee})
        WHERE po_status = 'Pending Approval'
        AND approvers_list LIKE '%' || ${oldAssignee} || '%'
      `;
    }
    else if (moduleType.toLowerCase() === "purchase request") {
      query = sql`
        UPDATE dbo.supp_pr_header_dtls
        SET approvers_list = REPLACE(approvers_list, ${oldAssignee}, ${newAssignee})
        WHERE pr_status = 'Pending Approval'
        AND approvers_list LIKE '%' || ${oldAssignee} || '%'
      `;
    }

    else if (moduleType.toLowerCase() === "invoice") {
      query = sql`
        UPDATE dbo.supp_invoice_dtls
        SET invoice_approvers = REPLACE(invoice_approvers, ${oldAssignee}, ${newAssignee})
        WHERE invoice_status = 'Pending Approval'
        AND invoice_approvers LIKE '%' || ${oldAssignee} || '%'
      `;
    }

    else if (moduleType.toLowerCase() === "vendor registration") {
      query = sql`
        UPDATE dbo.supp_basic_org_dtls
        SET approvers_list = REPLACE(approvers_list, ${oldAssignee}, ${newAssignee})
        WHERE status = 'Pending Approval'
        AND approvers_list LIKE '%' || ${oldAssignee} || '%'
      `;
    }

    else if (moduleType.toLowerCase() === "budget") {
      query = sql`
        UPDATE dbo.am_budget_mst
        SET approvers_list = REPLACE(approvers_list, ${oldAssignee}, ${newAssignee})
        WHERE status = 'Pending Approval'
        AND approvers_list LIKE '%' || ${oldAssignee} || '%'
      `;
    }
    else if (moduleType.toLowerCase() === "bid") {
      query = sql`
        UPDATE dbo.supp_bid_dtls
        SET approvers_list = REPLACE(approvers_list, ${oldAssignee}, ${newAssignee})
        WHERE status = 'Pending Approval'
        AND approvers_list LIKE '%' || ${oldAssignee} || '%'
      `;
    }
    else if (moduleType.toLowerCase() === "contracts") {
      query = sql`
        UPDATE dbo.cm_header
        SET approvers_list = REPLACE(approvers_list, ${oldAssignee}, ${newAssignee})
        WHERE status = 'Pending Approval'
        AND approvers_list LIKE '%' || ${oldAssignee} || '%'
      `;
    } else if (moduleType.toLowerCase() === "auction") {
      query = sql`
        UPDATE dbo.au_auction_event
        SET approvers_list = REPLACE(approvers_list, ${oldAssignee}, ${newAssignee})
        WHERE status = 'Pending Approval'
        AND approvers_list LIKE '%' || ${oldAssignee} || '%'
      `;
    }
    else {
      throw new Error("Invalid module type");
    }

    await getDb().execute(query);

    return "Approvers updated successfully";

  } catch (err: any) {
    console.error(err);
    return `Error - unable to process request: ${err.message}`;
  }
}

export async function getApproversList(module: string, entityId: string) {
  switch (module.toUpperCase()) {
    case "PR":
      return await getPool().query(`
        SELECT approvers_list
        FROM dbo.supp_pr_header_dtls
        WHERE pr_number = $1
      `, [entityId]);
    case "PO":
      return await getPool().query(`
        SELECT approvers_list
        FROM dbo.supp_po_header_dtls
        WHERE po_number = $1
      `, [entityId]);
    case "BUDGET":
      return await getPool().query(`
        SELECT approvers_list
        FROM dbo.am_budget_mst
        WHERE id = $1
      `, [entityId]);
    case "SUPPLIER":
      return await getPool().query(`
        SELECT approvers_list
        FROM dbo.supp_basic_org_dtls
        WHERE id = $1
      `, [entityId]);
    case "INVOICE":
      return await getPool().query(`
        SELECT invoice_approvers
        FROM dbo.supp_invoice_dtls
        WHERE id = $1
      `, [entityId]);
    case "BIDS":
      return await getPool().query(`
        SELECT approvers_list
        FROM dbo.supp_bid_dtls
        WHERE id = $1
      `, [entityId]);
    default:
      throw new Error(`Unsupported module: ${module}`);
  }
}

export async function updateApproversList(
  module: string,
  entityId: string,
  updatedList: string
): Promise<void> {

  switch (module.toUpperCase()) {

    case "PR":
      await getDb().execute(sql`
        UPDATE dbo.supp_pr_header_dtls
        SET approvers_list = ${updatedList}
        WHERE pr_number = ${entityId}
      `);
      break;

    case "PO":
      await getDb().execute(sql`
        UPDATE dbo.supp_po_header_dtls
        SET approvers_list = ${updatedList}
        WHERE po_number = ${entityId}
      `);
      break;

    case "BUDGET":
      await getDb().execute(sql`
        UPDATE dbo.am_budget_mst
        SET approvers_list = ${updatedList}
        WHERE id = ${entityId}
      `);
      break;

    case "SUPPLIER":
      await getDb().execute(sql`
        UPDATE dbo.supp_basic_org_dtls
        SET approvers_list = ${updatedList}
        WHERE id = ${entityId}
      `);
      break;

    case "INVOICE":
      await getDb().execute(sql`
        UPDATE dbo.supp_invoice_dtls
        SET invoice_approvers = ${updatedList}
        WHERE id =${entityId}
      `);
      break;

    case "BIDS":
      await getDb().execute(sql`
        UPDATE dbo.supp_bid_dtls
        SET approvers_list = ${updatedList}
        WHERE id = ${entityId}
      `);
      break;

    default:
      throw new Error(`Unsupported module: ${module}`);
  }
}

/** Latest exchange rate row per (from_currency, to_currency), paginated */
export async function getExchangeRatePairsLatest(
  page: number,
  limit: number,
  search: string
) {
  const offset = (page - 1) * limit;
  const searchTrim = (search || "").trim();
  const hasSearch = searchTrim.length > 0;
  const searchPattern = hasSearch ? `%${searchTrim.toLowerCase()}%` : null;

  const countResult = await getPool().query(
    `
    WITH filtered AS (
      SELECT *
      FROM dbo.am_exchange_rate_mst
      WHERE ($1::text IS NULL OR $1::text = ''
        OR LOWER(TRIM(from_currency)) LIKE $2
        OR LOWER(TRIM(to_currency)) LIKE $2)
    ),
    latest AS (
      SELECT DISTINCT ON (
        LOWER(TRIM(from_currency)),
        LOWER(TRIM(to_currency))
      )
        id,
        TRIM(from_currency) AS from_currency,
        TRIM(to_currency) AS to_currency,
        conversion_rate,
        conversion_date
      FROM filtered
      ORDER BY
        LOWER(TRIM(from_currency)),
        LOWER(TRIM(to_currency)),
        conversion_date DESC NULLS LAST,
        id DESC
    )
    SELECT COUNT(*)::int AS total FROM latest
    `,
    hasSearch ? [null, searchPattern] : ["", null]
  );
  const total = parseInt(String(countResult.rows[0]?.total ?? 0), 10);

  const dataResult = await getPool().query(
    `
    WITH filtered AS (
      SELECT *
      FROM dbo.am_exchange_rate_mst
      WHERE ($1::text IS NULL OR $1::text = ''
        OR LOWER(TRIM(from_currency)) LIKE $2
        OR LOWER(TRIM(to_currency)) LIKE $2)
    ),
    latest AS (
      SELECT DISTINCT ON (
        LOWER(TRIM(from_currency)),
        LOWER(TRIM(to_currency))
      )
        id,
        TRIM(from_currency) AS from_currency,
        TRIM(to_currency) AS to_currency,
        conversion_rate,
        conversion_date
      FROM filtered
      ORDER BY
        LOWER(TRIM(from_currency)),
        LOWER(TRIM(to_currency)),
        conversion_date DESC NULLS LAST,
        id DESC
    )
    SELECT id, from_currency, to_currency, conversion_rate, conversion_date
    FROM latest
    ORDER BY from_currency ASC, to_currency ASC
    LIMIT $3 OFFSET $4
    `,
    hasSearch ? [null, searchPattern, limit, offset] : ["", null, limit, offset]
  );

  return { data: dataResult.rows, total, page, limit };
}

export async function getExchangeRateHistory(fromCurrency: string, toCurrency: string) {
  const result = await getPool().query(
    `
    SELECT id, TRIM(from_currency) AS from_currency, TRIM(to_currency) AS to_currency,
           conversion_rate, conversion_date
    FROM dbo.am_exchange_rate_mst
    WHERE LOWER(TRIM(from_currency)) = LOWER(TRIM($1))
      AND LOWER(TRIM(to_currency)) = LOWER(TRIM($2))
    ORDER BY conversion_date DESC NULLS LAST, id DESC
    `,
    [fromCurrency, toCurrency]
  );
  return result.rows;
}

export async function getBaseCurrencyLookupCodes(): Promise<string[]> {
  const result = await getPool().query(
    `
    SELECT DISTINCT UPPER(TRIM(key_2)) AS code
    FROM dbo.am_lookup_params_dtls
    WHERE UPPER(TRIM(key_1)) = 'BASE_CURRENCY' AND status = 'Y'
    `
  );
  return (result.rows as { code: string }[]).map((r) => r.code).filter(Boolean);
}

export async function getNextExchangeRateId() {
  const result = await getPool().query(
    `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM dbo.am_exchange_rate_mst`
  );
  return result.rows[0].next_id;
}

export async function createExchangeRateRow(data: {
  from_currency: string;
  to_currency: string;
  conversion_rate: number;
  created_by: string;
}) {
  const nextId = await getNextExchangeRateId();
  const result = await getPool().query(
    `
    INSERT INTO dbo.am_exchange_rate_mst (
      id, from_currency, to_currency, conversion_rate, conversion_date
    )
    VALUES (
      $1, $2, $3, $4,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    )
    RETURNING id, from_currency, to_currency, conversion_rate, conversion_date
    `,
    [nextId, data.from_currency, data.to_currency, data.conversion_rate]
  );
  return result.rows[0];
}

export async function getExchangeRateById(id: string) {
  const result = await getPool().query(
    `
    SELECT id, TRIM(from_currency) AS from_currency, TRIM(to_currency) AS to_currency,
           conversion_rate, conversion_date
    FROM dbo.am_exchange_rate_mst
    WHERE id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

/** Append a new rate row; keeps prior rows for history (no in-place update). */
export async function updateExchangeRateRow(
  id: string,
  data: { conversion_rate: number }
) {
  const existing = await getExchangeRateById(id);
  if (!existing) return null;

  const nextId = await getNextExchangeRateId();
  const result = await getPool().query(
    `
    INSERT INTO dbo.am_exchange_rate_mst (
      id, from_currency, to_currency, conversion_rate, conversion_date
    )
    VALUES (
      $1, $2, $3, $4,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    )
    RETURNING id, from_currency, to_currency, conversion_rate, conversion_date
    `,
    [
      nextId,
      existing.from_currency,
      existing.to_currency,
      data.conversion_rate,
    ]
  );
  return result.rows[0] || null;
}

export async function deleteExchangeRate(id: string) {
  const result = await getPool().query(
    `DELETE FROM dbo.am_exchange_rate_mst WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rows[0] || null;
}
export function updateChatBotDetails(id: string, data: string) {
  // throw new Error("Function not implemented.");
  try {
    return getPool().query(
      `UPDATE dbo.um_org_dtls SET attribute_10 = $1 WHERE id = $2`,
      [data, Number(id)]
    );
  } catch (err: any) {
    console.error(err);
    throw new Error(`Error - unable to process request: ${err.message}`);
  }
}


export async function getOrganizationNameById(org_id: string) 
{
    try
    {
      if(org_id !== null && org_id !='undefined' && org_id !=='')
      {
        const data = await getPool().query(`select organization_name from dbo.um_org_dtls where id=$1`,[Number(org_id)]);
        return data.rows[0].organization_name;
      }
      else
      {
        return "";
      }
    }
    catch(error)
    {
      console.error(error);
      return "";
    } 
}

export async function saveWfQuestions(formQuesData: any[],username:string) 
{
  try
  {
  if (!Array.isArray(formQuesData)) {
        throw new TypeError("questions must be an array");
    }

  for(const ques of formQuesData)
  {
    try
    {
    if(!ques.id)
    {
       const rId = await getPool().query(`select nextval('dbo.seq_wf_question_dtls') as next_id`);
       const id = (rId.rows[0] as any).next_id;

       const result = await getPool().query(`insert into dbo.wf_question_dtls (id,question_text,reference_step_id,created_by,creation_date,option_required,remarks_required)
         values($1,$2,$3,$4,now(),$5,$6)`,
        [id,ques.question_text,ques.work_id,username,ques.option_required,ques.remarks_required]);
    }
    else
    {
      const result = await getPool().query(`update dbo.wf_question_dtls set question_text=$2,reference_step_id=$3,last_modified_by=$4,last_modified_date=now(), option_required=$5,remarks_required=$6 where id=$1`,
        [ques.id,ques.question_text,ques.work_id,username,ques.option_required,ques.remarks_required]);
    }
    }
    catch(error)
    {
      console.error(error);
    }
   }
  }
  catch(error)
  {
    console.error(error);
    return "Error - Unable to save the questions";
  }
  return "Successfully saved the question for the module";
}

export async function getWfQuestionByModuleName(moduleName: string) 
{
    try
    {
      const result = await getPool().query(`select id,list_status from dbo.wf_definition where name=$1`,[moduleName]);
      const wfId = result.rows[0].id;
      const status = result.rows[0].list_status;
      if(wfId)
      {
        if(status)
        {
        const data = await getPool().query(`select * from dbo.wf_question_dtls where reference_step_id=$1`,[Number(wfId)]);
        return data.rows;
        }
        else
        {
          return "Error - Check list is In Active for selected module";
        }
      }
      else
      {
        return " Error - Module not found. Please check the moduleName.";
      }
    } 
    catch(error)
    {
      console.error(error);
      return "Error - Unable to process the request";
    } 
}

export async function getResponseByRefNum(refNum: string,history: boolean) 
{
  try
  {
    if(!history)
    {
    const data =await getPool().query(`select * from dbo.wf_question_resp_dtls where ref_number=$1`,[refNum]);
    return data.rows;
    }
    else
    {
      const data =await getPool().query(`select * from dbo.wf_question_resp_hst_dtls where ref_number=$1 order by answered_date asc`,[refNum]);
    return data.rows;
    }
  } 
  catch(error)
  {
    console.error(error);
    return [];
  } 
}
export async function saveWfQuestionsResponse(formQuesData: any[], username: any) 
{
  try
  {
    let id = 0;
    try
    {
      for(const ques of formQuesData)
      {
        const quesData = await getPool().query(`select * from dbo.wf_question_dtls where id=$1`,[Number(ques.ques_id)]);
         const question = quesData.rows[0];
        if(!ques.id)
        {
          let rid = await getPool().query(`select nextval('dbo.seq_wf_question_resp_dtls') as next_id`);
           const id = (rid.rows[0] as any).next_id;
          const data = await getPool().query(`insert into dbo.wf_question_resp_dtls(id,question_id,question_answer,ref_number,question_text,answered_by,answered_date,remarks_data)
            values($1,$2,$3,$4,$5,$6,now(),$7)`,[id,question.id,ques.answer,ques.refNumber,question.question_text,username,ques.remarks]);
        }
        else
        {
          const data = await getPool().query(`update dbo.wf_question_resp_dtls set question_id=$2,question_answer=$3,ref_number=$4,question_text=$5,
            answered_by=$6,answered_date=now(),remarks_data=$7 where id=$1`,[ques.id,question.id,ques.answer,ques.refNumber,question.question_text,username,ques.remarks]);
        }

        // insert records in history table
        let rid = await getPool().query(`select nextval('dbo.seq_wf_question_resp_hst_dtls') as next_id`);
           const id = (rid.rows[0] as any).next_id;
          const data = await getPool().query(`insert into dbo.wf_question_resp_hst_dtls(id,question_id,question_answer,ref_number,question_text,answered_by,answered_date,remarks_data)
            values($1,$2,$3,$4,$5,$6,now(),$7)`,[id,question.id,ques.answer,ques.refNumber,question.question_text,username,ques.remarks]);
      }
    }
    catch(error)
    {
      console.error(error);
    }
    return "Successfully saved the answers";
  }
  catch(error)
  {
    console.error(error);
    return "Error - unable to save the response";
  }
}

export async function deleteQuestionbyId(quesid: string) 
{
  try
  {
    await getPool().query(`delete from dbo.wf_question_dtls where id=$1`,[Number(quesid)]);
    return "Successfully processed your request";
  } 
  catch(error)
  {
    console.error(error);
    return "Error - Unable to delete the question";
  } 
}

export async function enableordisablechecklist(id: string,listStatus: string,username: any) 
{
  try 
  {
    const isEnabled = Number(listStatus) === 1;
    const result = await getPool().query(
      `UPDATE dbo.wf_definition
       SET list_status = $2
       WHERE id = $1`,
      [Number(id), isEnabled]
    );

    if (result.rowCount === 0) 
    {
      return "Checklist not found.";
    }

    return `Checklist ${isEnabled ? "Enabled" : "Disabled"} successfully.`;
  } 
  catch (error) 
  {
    console.error(error);
    return "Error - unable to process the request.";
  }
}
export async function getUserByEmail(approvermail: any) 
{
  try
  {
    const data = await getPool().query(`select * from dbo.um_user_dtls where user_name=$1`,[approvermail]);
    return data.rows[0];
  } 
  catch(error)
  {
    console.error(error);
    return "Error - unable to get Details of user";
  }
}

export async function getTaskStatusByTaskId(taskid: any) 
{
  try
  {
    const data = await getPool().query(`select status from dbo.wf_step_instance where task_id=$1`,[taskid]);
    return data.rows[0].status; 
   } 
  catch(error)
  {
    console.error(error)
    return "Failed";
  } 
}

export async function getApiKey() 
{ 
  try
  {
    const data = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code='API_KEY'`);
    return data.rows[0].prop_value;
  } 
  catch(error)
  {
    console.error(error);
    return "Failed";
  }
}


export async function getValueByCode(arg0: string) 
{
  try
  {
    const data = await getPool().query(`select prop_value from dbo.am_property_mst where prop_code=$1`,[arg0]);
    return data.rows[0].prop_value;
  }
  catch(error)
  {
    console.error(error);
  }
}
