import type pkg from "pg";
import { getContextPool } from "../../tenant-context";
import { pool } from "../_shared";
const getPool = () => getContextPool() ?? pool;

async function getBankDocTypes(doctype: string){
  const result = await getPool().query(
    `SELECT value FROM dbo.am_lookup_params_dtls WHERE UPPER(key_1) = UPPER($1) AND status = 'Y'`,
    [doctype]
  );
  return result.rows.map(row => row.value);
}

export async function getOrgDetails(orgId: number) {
  const result = await getPool().query(
    `SELECT organization_name, org_country, org_email, org_phone_no FROM dbo.um_org_dtls WHERE id = $1 LIMIT 1`,
    [orgId]
  );
  return result.rows[0] || null;
}

export async function getSupplierProfile(supplierId: number) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`,
    [supplierId]
  );
  return result.rows[0] || null;
}

export async function getSupplierStatus(supplierId: number) {
  const result = await getPool().query(
    `SELECT status, company_name,attribute_4 FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`,
    [supplierId]
  );
  return result.rows[0] || null;
}

/** Status + workflow task id (attribute_12) for supplier resubmit after "More info required". */
export async function getSupplierStatusAndTask(supplierId: number) {
  const result = await getPool().query(
    `SELECT status, company_name, attribute_12 FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`,
    [supplierId]
  );
  return result.rows[0] || null;
}

export async function resolveInternalUserIdByLogin(login: string): Promise<number | null> {
  if (!login?.trim()) return null;
  const result = await getPool().query(
    `SELECT id FROM dbo.um_user_dtls WHERE user_name = $1 OR LOWER(TRIM(email_id)) = LOWER(TRIM($1)) LIMIT 1`,
    [login.trim()]
  );
  const id = result.rows[0]?.id;
  return id != null ? Number(id) : null;
}

export async function resolvePaymentTerms(paymentTermsId: number) {
  const result = await getPool().query(
    `SELECT id, description FROM dbo.am_payment_terms_mst WHERE id = $1 LIMIT 1`,
    [paymentTermsId]
  );
  return result.rows[0] || null;
}

export async function getOperatingUnitOrgId() {
  const result = await getPool().query(`SELECT organization_id FROM dbo.am_operating_units_mst LIMIT 1`);
  return result.rows[0]?.organization_id || null;
}

export async function getSupplierPrefixValue(): Promise<string> {
  const result = await getPool().query(
    `SELECT prefix_value FROM dbo.am_prefix_mst
     WHERE UPPER(TRIM(prefix_name)) = 'SUPPLIER'
     AND status = 'Active'
     LIMIT 1`
  );
  return result.rows[0]?.prefix_value?.trim() || "SUPP";
}

export async function getSupplierPrefixAndIncrement(): Promise<string> {
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

export async function createSupplierTransaction(
  client: pkg.PoolClient,
  params: {
    sessionUser: any;
    data: any;
    modifiedBy: string;
    taxEligibility: string;
    taxRegNo: string | null;
    taxCntry: string | null;
    taxPayerId: string | null;
    panNo: string | null;
    pAnnualRevenue: number | null;
    taxEffectiveDate: string | null;
    paymentTermsDesc: string | null;
    paymentTermsId: number | null;
    locations: string | null;
  }
) {
  const { sessionUser, data, modifiedBy, taxEligibility, taxRegNo, taxCntry, taxPayerId, panNo, pAnnualRevenue, taxEffectiveDate, paymentTermsDesc, paymentTermsId, locations } = params;

  const userResult = await client.query(
    `SELECT u.id, u.attribute_2, u.attribute_13, o.id as org_id, o.organization_name
     FROM dbo.um_user_dtls u
     JOIN dbo.um_org_dtls o ON o.id = u.org_id
     WHERE u.user_name = $1 LIMIT 1`,
    [sessionUser.userName || sessionUser.email]
  );
  const userRow = userResult.rows[0];
  const companyName = data.company_name || userRow?.organization_name || sessionUser.name || "Unknown";
  const userAttribute2 = userRow?.attribute_2 || null;
  const employeeId = userRow?.attribute_13 || null;

  let invitationId = 0;
  if (userAttribute2) {
    invitationId = parseInt(userAttribute2) || 0;
  }
  if (invitationId === 0) {
    const invMaxResult = await client.query(`SELECT id FROM dbo.supp_invitation_dtls ORDER BY id DESC LIMIT 1 FOR UPDATE`);
    const newInvId = (invMaxResult.rows[0]?.id || 0) + 1;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 5);
    await client.query(`
      INSERT INTO dbo.supp_invitation_dtls (id, company_name, email_id, invitation_date, invitation_sent_by, invitation_sent_by_name, status, start_date, end_date, creation_date)
      VALUES ($1, $2, $3, NOW(), $4, $5, 'Initiated', NOW(), $6, NOW())
    `, [newInvId, companyName, data.email_id || sessionUser.email, modifiedBy, sessionUser.name || modifiedBy, endDate]);
    invitationId = newInvId;
  }

  const maxIdResult = await client.query(`SELECT id FROM dbo.supp_basic_org_dtls ORDER BY id DESC LIMIT 1 FOR UPDATE`);
  const newSupplierId = (maxIdResult.rows[0]?.id || 0) + 1;

  const supplierId = await getSupplierPrefixAndIncrement();

  await client.query(`
    INSERT INTO dbo.supp_basic_org_dtls (
      id, company_name, invitation_id, status,
      address_1, address_2, city, state, country, postalcode,
      phone, phone_ctry_code, phone_area_code, email_id, web_address,
      fax, fax_ctry_code, fax_area_code, po_box, emirates_id, supplier_type,
      legal_entity_type, type_of_company, pan_no, start_date, bus_trading_date,
      license_no, expiry_date, place_of_issue,
      workingday_start, workingday_end, annual_turn_over, turn_over_currency,
      working_time_start_time, working_time_end_time,
      tax_eligibility, tax_reg_no, tax_cntry, tax_payer_id, tax_effective_date, p_annual_revenue,
      payment_terms, payment_terms_id,
      parent_company_name, parent_company_addr, prnt_cmpy_phone, prnt_cmpy_phn_ctry_code, prnt_cmpy_phn_areacode, url,
      employee_id, locations, migrated, erp_status,
      attribute_6, is_payment_fee_req, is_payment_renwal_req, attribute_11, attribute_12, attribute_13,
      user_registered, created_by, creation_date, last_modified_by, last_modified_date , supplier_id
    ) VALUES (
      $1, $2, $3, 'Draft',
      $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25,
      $26, $27, $28,
      $29, $30, $31, $32,
      $33, $34,
      $35, $36, $37, $38, $39, $40,
      $41, $42,
      $43, $44, $45, $46, $47, $48,
      $49, $50, 'NEW', 'Not Available',
      'N', 'N', 'N', 'N', 'N', 'N',
      'Yes', $51, NOW(), $51, NOW() , $52
    ) RETURNING id
  `, [
    newSupplierId, companyName, invitationId,
    data.address_1 || null, data.address_2 || null, data.city || null, data.state || null, data.country || null, data.postalcode || null,
    data.phone || null, data.phone_ctry_code || null, data.phone_area_code || null, data.email_id || null, data.web_address || null,
    data.fax || null, data.fax_ctry_code || null, data.fax_area_code || null, data.po_box || null, data.emirates_id || null, data.supplier_type || null,
    data.legal_entity_type || null, data.type_of_company || null, panNo, data.start_date || null, data.bus_trading_date || null,
    data.license_no || null, data.expiry_date || null, data.place_of_issue || null,
    data.workingday_start || null, data.workingday_end || null, data.annual_turn_over ? parseFloat(data.annual_turn_over) : null, data.turn_over_currency || null,
    data.working_time_start_time || null, data.working_time_end_time || null,
    taxEligibility, taxRegNo, taxCntry, taxPayerId, taxEffectiveDate, pAnnualRevenue,
    paymentTermsDesc, paymentTermsId,
    data.parent_company_name || null, data.parent_company_addr || null, data.prnt_cmpy_phone || null, data.prnt_cmpy_phn_ctry_code || null, data.prnt_cmpy_phn_areacode || null, data.url || null,
    employeeId, locations,
    modifiedBy,
    supplierId
  ]);

  const siteMaxId = await client.query(`SELECT id FROM dbo.supp_site_dtls ORDER BY id DESC LIMIT 1 FOR UPDATE`);
  const newSiteId = (siteMaxId.rows[0]?.id || 0) + 1;
  await client.query(`
    INSERT INTO dbo.supp_site_dtls (
      id, supplier_id, sitename, address_1, address_2, city, state, country,
      org_id, areacode, phone, email, faxareacode, fax, postalcode,
      created_by, creation_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15,
      $16, NOW()
    ) RETURNING id
  `, [
    newSiteId, newSupplierId, userRow?.organization_name || companyName,
    data.address_1 || null, data.address_2 || null, data.city || null, data.state || null, data.country || null,
    userRow?.org_id || parseInt(sessionUser.orgId),
    data.phone_area_code || null, data.phone || null, data.email_id || null,
    data.fax_area_code || null, data.fax || null, data.postalcode || null,
    modifiedBy
  ]);

  if (userRow) {
    const mapMaxId = await client.query(`SELECT id FROM dbo.supp_user_supplier_map_dtls ORDER BY id DESC LIMIT 1 FOR UPDATE`);
    const newMapId = (mapMaxId.rows[0]?.id || 0) + 1;
    await client.query(`
      INSERT INTO dbo.supp_user_supplier_map_dtls (id, user_id, supplier_id, site_id, created_by, creation_date)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [newMapId, userRow.id, newSupplierId, newSiteId, modifiedBy]);
  }

  if (invitationId > 0) {
    await client.query(
      `UPDATE dbo.supp_invitation_dtls SET status = 'In Progress', last_modified_date = NOW() WHERE id = $1`,
      [invitationId]
    );
  }

  await client.query(
    `UPDATE dbo.um_org_dtls SET attribute_1 = $1 WHERE id = $2`,
    [String(newSupplierId), userRow?.org_id || parseInt(sessionUser.orgId)]
  );

  return newSupplierId;
}

export async function hasOrgPrevValues(supplierId: number): Promise<boolean> {
  const result = await getPool().query(
    `SELECT 1 FROM dbo.supp_basic_org_dtls WHERE id = $1 AND (prev_address1 IS NOT NULL OR prev_email_id IS NOT NULL OR prev_phone IS NOT NULL) LIMIT 1`,
    [supplierId]
  );
  return result.rows.length > 0;
}

export async function hasContactPrevValues(supplierId: number): Promise<boolean> {
  const result = await getPool().query(
    `SELECT 1 FROM dbo.supp_contact_dtls WHERE supplier_id = $1 AND (prev_contact_name IS NOT NULL OR prev_email IS NOT NULL) AND (status = 0 OR status IS NULL) LIMIT 1`,
    [supplierId]
  );
  return result.rows.length > 0;
}

export async function hasRefPrevValues(supplierId: number): Promise<boolean> {
  const result = await getPool().query(
    `SELECT 1 FROM dbo.supp_ref_companies_dtls WHERE supplier_id = $1 AND (prev_contact_name IS NOT NULL OR prev_ref_company_name IS NOT NULL) AND (status = 0 OR status IS NULL) LIMIT 1`,
    [supplierId]
  );
  return result.rows.length > 0;
}

export async function hasBankPrevValues(supplierId: number): Promise<boolean> {
  const result = await getPool().query(
    `SELECT 1 FROM dbo.supp_bank_dtls WHERE supplier_id = $1 AND (prev_bank_name IS NOT NULL OR prev_account_no IS NOT NULL) AND (status = 1 OR status IS NULL) LIMIT 1`,
    [supplierId]
  );
  return result.rows.length > 0;
}

export async function copyOrgCurrentToPrev(client: pkg.PoolClient, supplierId: number) {
  await client.query(`
    UPDATE dbo.supp_basic_org_dtls SET
      prev_address1 = address_1, prev_address2 = address_2,
      prev_city = city, prev_state = state, prev_country = country, prev_postal_code = postalcode,
      prev_email_id = email_id, prev_phone = phone, prev_phone_area_code = phone_area_code, prev_phone_ctry_code = phone_ctry_code,
      prev_web_address = web_address, prev_leagl_entity_type = legal_entity_type,
      prev_license_no = license_no, prev_place_of_issue = place_of_issue,
      prev_annual_turn_over = annual_turn_over, prev_turn_over_currency = turn_over_currency,
      prev_payment_trems = payment_terms, prev_tax_reg_no = tax_reg_no,
      prev_tax_country = tax_cntry, prev_tax_payer_id = tax_payer_id, prev_pan_no = pan_no,
      prev_supplier_type = supplier_type,
      prev_working_day_start = workingday_start, prev_working_day_end = workingday_end,
      prev_working_time_start_time = working_time_start_time, prev_working_time_end_time = working_time_end_time,
      prev_company_size = company_size::text, prev_brand_name = brand_name,
      prev_emirates_id = emirates_id, prev_type_of_service = type_of_service,
      prev_expiry_date = expiry_date, prev_start_date = start_date, prev_tax_effective_date = tax_effective_date,
      prev_no_of_employees = no_of_employees, prev_year_of_exp_loc_market = year_of_exp_loc_market,
      prev_year_of_exp_international = year_of_exp_international
    WHERE id = $1
  `, [supplierId]);
}

export async function copyContactCurrentToPrev(client: pkg.PoolClient, supplierId: number) {
  await client.query(`
    UPDATE dbo.supp_contact_dtls SET
      prev_contact_name = contact_name, prev_contact_category = contact_category,
      prev_designation = designation, prev_department = department,
      prev_email = email, prev_phone = phone, prev_mobile = mobile,
      prev_primary_contact = is_primary, prev_is_auth_signatory = is_auth_signatory
    WHERE supplier_id = $1 AND (status = 0 OR status IS NULL)
  `, [supplierId]);
}

export async function copyRefCurrentToPrev(client: pkg.PoolClient, supplierId: number) {
  await client.query(`
    UPDATE dbo.supp_ref_companies_dtls SET
      prev_ref_company_name = ref_company_name, prev_contact_name = contact_name, prev_designation = designation,
      prev_department = department, prev_email = email, prev_phone = phone WHERE supplier_id = $1
  `, [supplierId]);
}

export async function copyBankCurrentToPrev(client: pkg.PoolClient, supplierId: number) {
  await client.query(`
    UPDATE dbo.supp_bank_dtls SET
      prev_account_no = account_no, prev_bank_name = bank_name, prev_branch_name = branch_name,
      prev_bank_address = bank_address, prev_city = city, prev_country = country,
      prev_region = region, prev_postalcode = postal_code,
      prev_bank_account_type = bank_account_type, prev_currency = currency,
      prev_swift_code = swift_code, prev_iban_no = iban_no, prev_ifsc_code = ifsccode,
      prev_aba_routing = aba_routing, prev_beneficiary_name = beneficiary_name,
      prev_beneficiary_address = beneficiary_address, prev_primary_account = primary_account
    WHERE supplier_id = $1 AND (status = 1 OR status IS NULL)
  `, [supplierId]);
}

export async function clearOrgPrevColumns(client: pkg.PoolClient, supplierId: number) {
  await client.query(`
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
}

export async function clearContactPrevColumns(client: pkg.PoolClient, supplierId: number) {
  await client.query(`
    UPDATE dbo.supp_contact_dtls SET
      prev_contact_name = NULL, prev_contact_category = NULL, prev_designation = NULL,
      prev_department = NULL, prev_email = NULL, prev_phone = NULL, prev_mobile = NULL,
      prev_primary_contact = NULL, prev_is_auth_signatory = NULL
    WHERE supplier_id = $1
  `, [supplierId]);
}

export async function clearRefPrevColumns(client: pkg.PoolClient, supplierId: number) {
  await client.query(`
    UPDATE dbo.supp_ref_companies_dtls SET
      prev_ref_company_name = NULL, prev_contact_name = NULL, prev_designation = NULL,
      prev_department = NULL, prev_email = NULL, prev_phone = NULL WHERE supplier_id = $1
  `, [supplierId]);
}

export async function clearBankPrevColumns(client: pkg.PoolClient, supplierId: number) {
  await client.query(`
    UPDATE dbo.supp_bank_dtls SET
      prev_account_no = NULL, prev_bank_name = NULL, prev_branch_name = NULL,
      prev_bank_address = NULL, prev_city = NULL, prev_country = NULL, prev_region = NULL,
      prev_postalcode = NULL, prev_bank_account_type = NULL, prev_currency = NULL,
      prev_swift_code = NULL, prev_iban_no = NULL, prev_ifsc_code = NULL, prev_aba_routing = NULL,
      prev_beneficiary_name = NULL, prev_beneficiary_address = NULL, prev_primary_account = NULL
    WHERE supplier_id = $1
  `, [supplierId]);
}

export async function updateSupplierTransaction(
  client: pkg.PoolClient,
  params: {
    supplierId: number;
    data: any;
    modifiedBy: string;
    taxEligibility: string;
    taxRegNo: string | null;
    taxCntry: string | null;
    taxPayerId: string | null;
    panNo: string | null;
    pAnnualRevenue: number | null;
    taxEffectiveDate: string | null;
    paymentTermsDesc: string | null;
    paymentTermsId: number | null;
    isVendorSelfEdit?: boolean;
  }
) {
  const { supplierId, data, modifiedBy, taxEligibility, taxRegNo, taxCntry, taxPayerId, panNo, pAnnualRevenue, taxEffectiveDate, paymentTermsDesc, paymentTermsId, isVendorSelfEdit } = params;

  if (isVendorSelfEdit) {
    await copyOrgCurrentToPrev(client, supplierId);
  }

  await client.query(`
    UPDATE dbo.supp_basic_org_dtls SET
      company_name = COALESCE($1, company_name),
      address_1 = $2, address_2 = $3, city = $4, state = $5, country = $6, postalcode = $7,
      phone = $8, phone_ctry_code = $9, phone_area_code = $10,
      email_id = $11, web_address = $12,
      fax = $13, fax_ctry_code = $14, fax_area_code = $15,
      po_box = $16, emirates_id = $17, supplier_type = $18,
      legal_entity_type = $19, type_of_company = $20, pan_no = $21,
      start_date = $22, bus_trading_date = $23,
      license_no = $24, expiry_date = $25, place_of_issue = $26,
      workingday_start = $27, workingday_end = $28,
      annual_turn_over = $29, turn_over_currency = $30,
      working_time_start_time = $31, working_time_end_time = $32,
      tax_eligibility = $33, tax_reg_no = $34, tax_cntry = $35,
      tax_payer_id = $36, tax_effective_date = $37, p_annual_revenue = $38,
      payment_terms = $39, payment_terms_id = $40,
      parent_company_name = $41, parent_company_addr = $42,
      prnt_cmpy_phone = $43, prnt_cmpy_phn_ctry_code = $44, prnt_cmpy_phn_areacode = $45,
      url = $46,
      last_modified_by = $47, last_modified_date = CURRENT_TIMESTAMP
      ${isVendorSelfEdit ? ", status = 'Changes In Draft'" : ""}
    WHERE id = $48
    RETURNING id
  `, [
    data.company_name || null,
    data.address_1 || null, data.address_2 || null, data.city || null, data.state || null, data.country || null, data.postalcode || null,
    data.phone || null, data.phone_ctry_code || null, data.phone_area_code || null,
    data.email_id || null, data.web_address || null,
    data.fax || null, data.fax_ctry_code || null, data.fax_area_code || null,
    data.po_box || null, data.emirates_id || null, data.supplier_type || null,
    data.legal_entity_type || null, data.type_of_company || null, panNo,
    data.start_date || null, data.bus_trading_date || null,
    data.license_no || null, data.expiry_date || null, data.place_of_issue || null,
    data.workingday_start || null, data.workingday_end || null,
    data.annual_turn_over ? parseFloat(data.annual_turn_over) : null, data.turn_over_currency || null,
    data.working_time_start_time || null, data.working_time_end_time || null,
    taxEligibility, taxRegNo, taxCntry,
    taxPayerId, taxEffectiveDate, pAnnualRevenue,
    paymentTermsDesc, paymentTermsId,
    data.parent_company_name || null, data.parent_company_addr || null,
    data.prnt_cmpy_phone || null, data.prnt_cmpy_phn_ctry_code || null, data.prnt_cmpy_phn_areacode || null,
    data.url || null,
    modifiedBy, supplierId
  ]);

  await client.query(`
    UPDATE dbo.supp_site_dtls SET
      sitename = COALESCE($1, sitename),
      address_1 = $2, address_2 = $3, city = $4, state = $5, country = $6,
      areacode = $7, phone = $8, email = $9,
      faxareacode = $10, fax = $11, postalcode = $12,
      last_modified_by = $13, last_modified_date = CURRENT_TIMESTAMP
    WHERE supplier_id = $14 AND id = (
      SELECT id FROM dbo.supp_site_dtls WHERE supplier_id = $14 ORDER BY id ASC LIMIT 1
    )
  `, [
    data.company_name || null,
    data.address_1 || null, data.address_2 || null, data.city || null, data.state || null, data.country || null,
    data.phone_area_code || null, data.phone || null, data.email_id || null,
    data.fax_area_code || null, data.fax || null, data.postalcode || null,
    modifiedBy, supplierId
  ]);
}

export async function getLookupCountries() {
  const result = await getPool().query(`
    SELECT key_2 as value, description as label FROM dbo.am_lookup_params_dtls 
    WHERE key_1 = 'CONTRY' ORDER BY description
  `);
  return result.rows;
}

export async function getLookupSuppDocTypes() {
  const result = await getPool().query(`
    SELECT key_2 as value, description as label FROM dbo.am_lookup_params_dtls 
    WHERE key_1 = 'SUPP_DOC_TYPES' ORDER BY description
  `);
  return result.rows;
}

export async function getLookupCurrencies() {
  const result = await getPool().query(`
    SELECT key_2 as value, 
           CASE WHEN description IS NOT NULL AND description != '' AND description != key_2 
                THEN description || ' (' || key_2 || ')'
                ELSE key_2 
           END as label
    FROM dbo.am_lookup_params_dtls 
    WHERE key_1 = 'BASE_CURRENCY' AND status = 'Y'
    ORDER BY key_2
  `);
  return result.rows;
}

export async function getLookupPaymentTerms() {
  const result = await getPool().query(`
    SELECT id::text as value, description as label FROM dbo.am_payment_terms_mst ORDER BY terms_name
  `);
  return result.rows;
}

export async function getLookupLegalEntities() {
  const result = await getPool().query(`
   SELECT key_2 as value, description as label FROM dbo.am_lookup_params_dtls 
    WHERE key_1 = 'VENDOR_TYPE' ORDER BY description
  `);
  return result.rows;
}

export async function getLookupEnterpriseClassifications() {
  const result = await getPool().query(`
    SELECT DISTINCT type_of_company as value, type_of_company as label 
    FROM dbo.supp_basic_org_dtls 
    WHERE type_of_company IS NOT NULL AND type_of_company != '' ORDER BY type_of_company
  `);
  return result.rows;
}

export async function getContacts(supplierId: number) {
  const result = await getPool().query(`
    SELECT id, contact_name, contact_category, email, mobile, mobile_ctry_code, 
           phone, phone_ctry_code, department, designation, is_primary, is_auth_signatory, salutation, fax, fax_ctry_code, status
    FROM dbo.supp_contact_dtls WHERE supplier_id = $1 AND (status = 0 OR status IS NULL) ORDER BY id
  `, [supplierId]);
  return result.rows;
}

export async function createContact(supplierId: number, d: any, createdBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  const result = await queryRunner.query(`
    INSERT INTO dbo.supp_contact_dtls (id, contact_name, contact_category, email, mobile, mobile_ctry_code, phone, phone_ctry_code,
      department, designation, is_primary, is_auth_signatory, salutation, fax, fax_ctry_code, supplier_id, status, created_by, creation_date)
    VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM dbo.supp_contact_dtls), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$16,CURRENT_TIMESTAMP) RETURNING *
  `, [d.contact_name, d.contact_category, d.email, d.mobile, d.mobile_ctry_code, d.phone, d.phone_ctry_code,
  d.department, d.designation, d.is_primary || 'No', d.is_auth_signatory || 'No', d.salutation, d.fax, d.fax_ctry_code,
    supplierId, createdBy]);
  return result.rows[0];
}

export async function updateContact(contactId: number, supplierId: number, d: any, modifiedBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  const result = await queryRunner.query(`
    UPDATE dbo.supp_contact_dtls SET contact_name=$1, contact_category=$2, email=$3, mobile=$4, mobile_ctry_code=$5,
      phone=$6, phone_ctry_code=$7, department=$8, designation=$9, is_primary=$10, is_auth_signatory=$11, salutation=$12,
      fax=$13, fax_ctry_code=$14, last_modified_by=$15, last_modified_date=CURRENT_TIMESTAMP
    WHERE id=$16 AND supplier_id=$17 RETURNING *
  `, [d.contact_name, d.contact_category, d.email, d.mobile, d.mobile_ctry_code, d.phone, d.phone_ctry_code,
  d.department, d.designation, d.is_primary || 'No', d.is_auth_signatory || 'No', d.salutation, d.fax, d.fax_ctry_code,
    modifiedBy, contactId, supplierId]);
  return result.rows[0] || null;
}

export async function isContactPrimary(contactId: number) {
  const result = await getPool().query(
    `SELECT is_primary 
     FROM dbo.supp_contact_dtls 
     WHERE id = $1`,
    [contactId]
  );
  return result.rows[0]?.is_primary === 'Yes';
}

export async function checkContactPrimaryCount(supplierId: number) {
  const result = await getPool().query(`SELECT COUNT(*) AS total_records
    FROM dbo.supp_contact_dtls 
    WHERE supplier_id = $1 
      AND is_primary = 'Yes'`, [supplierId]);
  return Number(result.rows[0].total_records);
}

export async function deleteContact(contactId: number, supplierId: number, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  await queryRunner.query(`DELETE FROM dbo.supp_contact_dtls WHERE id=$1 AND supplier_id=$2`, [contactId, supplierId]);
}

export async function getBankAccounts(supplierId: number) {
  const result = await getPool().query(`
    SELECT id, bank_name, branch_name, account_no, bank_account_type, beneficiary_name, beneficiary_address,
           iban_no, swift_code, currency, country, city, region, street, postal_code, primary_account,
           aba_routing, ifsccode, bank_address, status
    FROM dbo.supp_bank_dtls WHERE supplier_id = $1 AND (status = 1 OR status IS NULL) ORDER BY id
  `, [supplierId]);
  return result.rows;
}

/** Link an unlinked AI-uploaded bank document row to a bank account (doc_no = bank id). */
export async function linkSupplierBankDocumentToAccount(
  docId: number,
  supplierId: number,
  bankId: number,
  modifiedBy: string,
  dbPool?: pkg.Pool,
) {
  const p = dbPool ?? getPool();
  const bankCheck = await p.query(
    `SELECT id FROM dbo.supp_bank_dtls WHERE id = $1 AND supplier_id = $2 AND (status = 1 OR status IS NULL)`,
    [bankId, supplierId],
  );
  if (!bankCheck.rows[0]) return null;

  const result = await p.query(
    `UPDATE dbo.supp_document_dtls
     SET doc_no = $1, last_modified_by = $2, last_modified_date = CURRENT_TIMESTAMP
     WHERE id = $3 AND supplier_id = $4
       AND doc_type IN ('BANK_DOCUMENT', 'bank_letter', 'cancelled_cheque')
       AND (doc_no IS NULL OR TRIM(COALESCE(doc_no::text, '')) = '')
       AND record_type = 'SUPPLIER_REG'
       AND (status = 'Active' OR status IS NULL)
     RETURNING id, doc_name, doc_type, doc_no, doc_desc, filename, filetype, expiry_date, status, record_type, category, creation_date, doc_uri, doc_path`,
    [String(bankId), modifiedBy, docId, supplierId],
  );
  return result.rows[0] || null;
}

export async function setPrimaryBankAccount(supplierId: number, accountId?: number, client?: any
) {
  const runner = client || getPool();
  if (accountId !== undefined && accountId !== null) {
    return await runner.query(
      `UPDATE dbo.supp_bank_dtls
       SET primary_account = 'N'
       WHERE supplier_id = $1 AND id <> $2`,
      [supplierId, accountId]
    );
  } else {
    return await runner.query(
      `UPDATE dbo.supp_bank_dtls
       SET primary_account = 'N'
       WHERE supplier_id = $1`,
      [supplierId]
    );
  }
}

export async function checkBankPrimaryCount(supplierId: number) {
  const result = await getPool().query(`SELECT COUNT(*) AS total_records
    FROM dbo.supp_bank_dtls 
    WHERE supplier_id = $1 
      AND primary_account = 'Y'`, [supplierId]);
  return Number(result.rows[0].total_records);
}

export async function createBankAccount(supplierId: number, d: any, createdBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  const result = await queryRunner.query(`
    INSERT INTO dbo.supp_bank_dtls (id, bank_name, branch_name, account_no, bank_account_type, beneficiary_name, beneficiary_address,
      iban_no, swift_code, currency, country, city, region, street, postal_code, primary_account, aba_routing, ifsccode,
      bank_address, supplier_id, supp_site_id, status, created_by, creation_date)
    VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM dbo.supp_bank_dtls),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19,1,$20,CURRENT_TIMESTAMP) RETURNING *
  `, [d.bank_name, d.branch_name, d.account_no, d.bank_account_type, d.beneficiary_name, d.beneficiary_address,
  d.iban_no, d.swift_code, d.currency, d.country, d.city, d.region, d.street, d.postal_code,
  d.primary_account || 'N', d.aba_routing, d.ifsccode, d.bank_address, supplierId, createdBy]);
  return result.rows[0];
}

export async function updateBankAccount(bankId: number, supplierId: number, d: any, modifiedBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  const result = await queryRunner.query(`
    UPDATE dbo.supp_bank_dtls SET bank_name=$1, branch_name=$2, account_no=$3, bank_account_type=$4, beneficiary_name=$5,
      beneficiary_address=$6, iban_no=$7, swift_code=$8, currency=$9, country=$10, city=$11, region=$12, street=$13,
      postal_code=$14, primary_account=$15, aba_routing=$16, ifsccode=$17, bank_address=$18,
      last_modified_by=$19, last_modified_date=CURRENT_TIMESTAMP
    WHERE id=$20 AND supplier_id=$21 RETURNING *
  `, [d.bank_name, d.branch_name, d.account_no, d.bank_account_type, d.beneficiary_name, d.beneficiary_address,
  d.iban_no, d.swift_code, d.currency, d.country, d.city, d.region, d.street, d.postal_code,
  d.primary_account || 'N', d.aba_routing, d.ifsccode, d.bank_address,
    modifiedBy, bankId, supplierId]);
  return result.rows[0] || null;
}

export async function isBankPrimary(bankId: number) {
  const result = await getPool().query(
    `SELECT primary_account 
     FROM dbo.supp_bank_dtls 
     WHERE id = $1`,
    [bankId]
  );
  return result.rows[0]?.primary_account === 'Y';
}

export async function deleteBankAccount(bankId: number, supplierId: number, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  await queryRunner.query(`DELETE FROM dbo.supp_bank_dtls WHERE id=$1 AND supplier_id=$2`, [bankId, supplierId]);
}

export async function getScopeOfSupply(supplierId: number) {
  const result = await getPool().query(`
    SELECT id, category_code, sub_category, sub_category_code, good_service_code, service_details, contact_details, category_type, status
    FROM dbo.supp_scope_of_supply_service WHERE supplier_id = $1 AND (status = 0 OR status IS NULL) ORDER BY id
  `, [supplierId]);
  return result.rows;
}

export async function getScopeServiceInfo(supplierId: number) {
  const result = await getPool().query(`
    SELECT type_of_service, year_of_exp_loc_market, year_of_exp_international, total_experience
    FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1
  `, [supplierId]);
  return result.rows[0] || {};
}

export async function updateServiceInfo(supplierId: number, d: any, modifiedBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  const locMarket = d.year_of_exp_loc_market === "" || d.year_of_exp_loc_market == null ? null : Number(d.year_of_exp_loc_market);
  const international = d.year_of_exp_international === "" || d.year_of_exp_international == null ? null : Number(d.year_of_exp_international);
  await queryRunner.query(`
    UPDATE dbo.supp_basic_org_dtls SET type_of_service=$1, year_of_exp_loc_market=$2, year_of_exp_international=$3,
      last_modified_by=$4, last_modified_date=CURRENT_TIMESTAMP WHERE id=$5
  `, [d.type_of_service || null, locMarket, international, modifiedBy, supplierId]);
}

export async function addCategory(supplierId: number, d: any, createdBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  const result = await queryRunner.query(`
    INSERT INTO dbo.supp_scope_of_supply_service (id, category_code, sub_category, sub_category_code, good_service_code,
      category_type, supplier_id, status, created_by, creation_date)
    VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM dbo.supp_scope_of_supply_service), $1,$2,$3,$4,$5,$6,0,$7,CURRENT_TIMESTAMP) RETURNING *
  `, [d.category_code, d.sub_category, d.sub_category_code, d.good_service_code, d.category_type || null, supplierId, createdBy]);
  return result.rows[0];
}

export async function removeCategory(categoryId: number, supplierId: number, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  await queryRunner.query(`DELETE FROM dbo.supp_scope_of_supply_service WHERE id=$1 AND supplier_id=$2`, [categoryId, supplierId]);
}

export async function getCategories(level?: string, parentCode?: string) {
  let query = `SELECT id, code, name, level, parent_code FROM dbo.pm_cat_categories WHERE is_active = true`;
  const params: any[] = [];
  if (level) { query += ` AND level = $${params.length + 1}`; params.push(level); }
  if (parentCode) { query += ` AND parent_code = $${params.length + 1}`; params.push(parentCode); }
  query += ` ORDER BY name LIMIT 500`;
  const result = await getPool().query(query, params);
  return result.rows;
}

export async function getDocuments(supplierId: number) {
  const result = await getPool().query(`
    SELECT id, doc_name, doc_type, doc_no, doc_desc, filename, filetype, expiry_date, status, record_type, category, creation_date, doc_uri, doc_path
    FROM dbo.supp_document_dtls WHERE supplier_id = $1 AND record_type = 'SUPPLIER_REG' AND (status = 'Active' OR status IS NULL) ORDER BY id
  `, [supplierId]);
  return result.rows;
}

export async function findExistingDocument(supplierId: number, docType: string, docNo: string, dbPool?: pkg.Pool) {
  const p = dbPool ? dbPool : getPool();
  const result = await p.query(
    `SELECT id FROM dbo.supp_document_dtls WHERE supplier_id = $1 AND doc_type = $2 AND doc_no = $3 AND record_type = 'SUPPLIER_REG' AND (status = 'Active' OR status IS NULL)`,
    [supplierId, docType, docNo]
  );
  return result.rows[0] || null;
}

export async function updateDocument(docId: number, supplierId: number, params: {
  docName: string; docNo: string; docDesc: string; filename: string;
  expiryDate: string | null; docUri: Buffer | null; filetype: string | null;
  docPath: string | null; modifiedBy: string;
}, dbPool?: pkg.Pool) {
  const p = dbPool ? dbPool : getPool();
  const result = await p.query(`
    UPDATE dbo.supp_document_dtls
    SET doc_name=$1, doc_no=$2, doc_desc=$3, filename=$4, expiry_date=$5, doc_uri=$6, filetype=$7,
        doc_path=$8, last_modified_by=$9, last_modified_date=CURRENT_TIMESTAMP
    WHERE id=$10 AND supplier_id=$11 AND doc_no = $2
    RETURNING id, doc_name, doc_type, doc_no, doc_desc, filename, filetype, expiry_date, status, record_type, category, creation_date, doc_uri, doc_path
  `, [params.docName, params.docNo, params.docDesc, params.filename, params.expiryDate, params.docUri, params.filetype,
  params.docPath, params.modifiedBy, docId, supplierId]);
  return result.rows[0];
}

export async function insertDocument(supplierId: number, params: {
  docName: string; docType: string; docNo: string; docDesc: string; filename: string;
  filetype: string | null; expiryDate: string | null; docUri: Buffer | null;
  docPath: string | null; createdBy: string;
}, dbPool?: pkg.Pool) {
  const p = dbPool ? dbPool : getPool();
  const result = await p.query(`
    INSERT INTO dbo.supp_document_dtls (id, doc_name, doc_type, doc_no, doc_desc, filename, filetype, expiry_date, doc_uri, doc_path,
      supplier_id, status, record_type, created_by, creation_date)
    VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM dbo.supp_document_dtls),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Active','SUPPLIER_REG',$11,CURRENT_TIMESTAMP)
    RETURNING id, doc_name, doc_type, doc_no, doc_desc, filename, filetype, expiry_date, status, record_type, category, creation_date, doc_uri, doc_path
  `, [params.docName, params.docType, params.docNo, params.docDesc, params.filename, params.filetype, params.expiryDate, params.docUri, params.docPath, supplierId, params.createdBy]);
  return result.rows[0];
}

export async function softDeleteDocument(docId: number, supplierId: number) {
  await getPool().query(`UPDATE dbo.supp_document_dtls SET status='Inactive' WHERE id=$1 AND supplier_id=$2`, [docId, supplierId]);
}

export async function getDocumentForDownload(docId: number, supplierId: number) {

  if (supplierId) {
    const result = await getPool().query(
      `SELECT filename, filetype, doc_path FROM dbo.supp_document_dtls WHERE id=$1 AND supplier_id=$2 AND (status='Active' OR status IS NULL)`,
      [docId, supplierId]
    );
    return result.rows[0] || null;
  }
  else {
    const result = await getPool().query(
      `SELECT filename, filetype, doc_path FROM dbo.supp_document_dtls WHERE id=$1 AND (status='Active' OR status IS NULL)`,
      [docId]
    );
    return result.rows[0] || null;
  }
}

export async function getReferences(supplierId: number) {
  const result = await getPool().query(`
    SELECT id, ref_company_name, contact_name, email, phone, phone_ctry_code, department, designation, ref_city, ref_country, scope_work, ac_amount, currency
    FROM dbo.supp_ref_companies_dtls WHERE supplier_id = $1 AND (status = 0 OR status IS NULL) ORDER BY id
  `, [supplierId]);
  return result.rows;
}

export async function createReference(supplierId: number, d: any, createdBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  const result = await queryRunner.query(`
    INSERT INTO dbo.supp_ref_companies_dtls (id, supplier_id, ref_company_name, contact_name, email, phone, phone_ctry_code, department, designation, ref_city, ref_country, scope_work, ac_amount, currency, status, created_by, creation_date)
    VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM dbo.supp_ref_companies_dtls), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14, CURRENT_TIMESTAMP)
    RETURNING *
  `, [supplierId, d.ref_company_name, d.contact_name, d.email || null, d.phone || null, d.phone_ctry_code || null, d.department || null, d.designation || null, d.ref_city || null, d.ref_country || null, d.scope_work || null, d.ac_amount || null, d.currency || null, createdBy]);
  return result.rows[0];
}

export async function updateReference(refId: number, supplierId: number, d: any, modifiedBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  const result = await queryRunner.query(`
    UPDATE dbo.supp_ref_companies_dtls
    SET ref_company_name=$1, contact_name=$2, email=$3, phone=$4, phone_ctry_code=$5, department=$6, designation=$7, ref_city=$8, ref_country=$9, scope_work=$10, ac_amount=$11, currency=$12, last_modified_by=$13, last_modified_date=CURRENT_TIMESTAMP
    WHERE id=$14 AND supplier_id=$15
    RETURNING *
  `, [d.ref_company_name, d.contact_name, d.email || null, d.phone || null, d.phone_ctry_code || null, d.department || null, d.designation || null, d.ref_city || null, d.ref_country || null, d.scope_work || null, d.ac_amount || null, d.currency || null, modifiedBy, refId, supplierId]);
  return result.rows[0] || null;
}

export async function softDeleteReference(refId: number, supplierId: number, modifiedBy: string, txClient?: pkg.PoolClient) {
  const queryRunner = txClient || getPool();
  await queryRunner.query(`UPDATE dbo.supp_ref_companies_dtls SET status=1, last_modified_by=$1, last_modified_date=CURRENT_TIMESTAMP WHERE id=$2 AND supplier_id=$3`, [modifiedBy, refId, supplierId]);
}

export async function getRegistrationSummary(supplierId: number) {
  const [profile, contacts, banks, scope, documents, references] = await Promise.all([
    getPool().query(`SELECT * FROM dbo.supp_basic_org_dtls WHERE id = $1 LIMIT 1`, [supplierId]),
    getPool().query(`SELECT id, contact_name, contact_category, email, mobile, phone, department, designation, is_primary FROM dbo.supp_contact_dtls WHERE supplier_id=$1 AND (status=0 OR status IS NULL) ORDER BY id`, [supplierId]),
    getPool().query(`SELECT id, bank_name, branch_name, account_no, bank_account_type, iban_no, swift_code, currency, country, primary_account FROM dbo.supp_bank_dtls WHERE supplier_id=$1 AND (status=1 OR status IS NULL) ORDER BY id`, [supplierId]),
    getPool().query(`SELECT id, category_code, sub_category, sub_category_code, good_service_code, category_type FROM dbo.supp_scope_of_supply_service WHERE supplier_id=$1 AND (status=0 OR status IS NULL) ORDER BY id`, [supplierId]),
    getPool().query(`SELECT id, doc_name, doc_type, filename, expiry_date, status, filetype, category, doc_uri, doc_path FROM dbo.supp_document_dtls WHERE supplier_id=$1 AND record_type = 'SUPPLIER_REG' AND (status='Active' OR status IS NULL) ORDER BY id`, [supplierId]),
    getPool().query(`SELECT id, ref_company_name, contact_name, email, phone FROM dbo.supp_ref_companies_dtls WHERE supplier_id=$1 AND (status=0 OR status IS NULL) ORDER BY id`, [supplierId]),
  ]);
  return {
    profile: profile.rows[0] || {},
    contacts: contacts.rows,
    bankAccounts: banks.rows,
    scopeOfSupply: scope.rows,
    documents: documents.rows,
    references: references.rows,
  };
}

export async function validateSupplierBeforeSubmit(supplierId: number): Promise<string> {
  const siteResult = await getPool().query(
    `SELECT id FROM dbo.supp_site_dtls WHERE supplier_id = $1 LIMIT 1`,
    [supplierId]
  );
  if (!siteResult.rows || siteResult.rows.length === 0) {
    return "No site found. Please complete company details first.";
  }

  const primaryBankCount = await checkBankPrimaryCount(supplierId);
  if (!primaryBankCount) {
    return "At least one primary bank information required";
  }

  const bankResult = await getPool().query(
    `SELECT id, attribute_5 FROM dbo.supp_bank_dtls WHERE supplier_id = $1`,
    [supplierId]
  );
  if (!bankResult.rows || bankResult.rows.length === 0) {
    return "Please add a bank account.";
  }
  const hasActiveBank = bankResult.rows.some(
    (b: any) => !b.attribute_5 || b.attribute_5 !== "Deleted"
  );
  if (!hasActiveBank) {
    return "Please add an active bank account.";
  }
  const primaryContactCount = await checkContactPrimaryCount(supplierId);
  if (!primaryContactCount) {
    return "At least one primary contact is required";
  }

  const contactResult = await getPool().query(
    `SELECT id, contact_category, is_auth_signatory, attribute_5 FROM dbo.supp_contact_dtls WHERE supplier_id = $1`,
    [supplierId]
  );
  const activeContacts = (contactResult.rows || []).filter(
    (c: any) => !c.attribute_5 || c.attribute_5 !== "Deleted"
  );
  if (activeContacts.length < 2) {
    return "Please add at least 2 contacts.";
  }
  const hasFinance = activeContacts.some((c: any) => c.contact_category && c.contact_category.includes("Finance"));
  const hasSales = activeContacts.some((c: any) => c.contact_category && c.contact_category.includes("Sale"));
  if (!hasFinance || !hasSales) {
    return "Please add at least 1 Sales and 1 Finance contact.";
  }

  const suppResult = await getPool().query(
    `SELECT expiry_date FROM dbo.supp_basic_org_dtls WHERE id = $1`,
    [supplierId]
  );
  if (suppResult.rows[0]?.expiry_date) {
    const expiryDate = new Date(suppResult.rows[0].expiry_date);
    if (new Date() > expiryDate) {
      return "Please check business license expiry date. Ensure it is after the current date.";
    }
  }

  const bankDocTypes = await getBankDocTypes("BANK_DOCUMENT");
  const bankDocs = await getPool().query(
    `SELECT * FROM dbo.supp_document_dtls
    WHERE supplier_id = $1
    AND doc_type = ANY($2::text[])`,
    [supplierId, bankDocTypes]
  );
   if (bankDocs.rows.length === 0) {
    return "Please upload bank documents to continue.";
  }
  const certificateDocs = await getPool().query(
      `SELECT * FROM dbo.supp_document_dtls 
    WHERE supplier_id = $1 
    AND doc_type != ALL($2::text[])`,
      [supplierId,bankDocTypes]
  );
  if (certificateDocs.rows.length === 0) {
    return "Please upload Business documents to continue.";
  }

  /*const reviewDocment = await getPool().query(
      `SELECT * FROM dbo.supp_document_dtls 
    WHERE supplier_id = $1 
    AND doc_type ='Review Document'`,
      [supplierId]
  );

  if(reviewDocment.rows.length === 0){
    return "Please upload Review Document Before submitting.";
  } */ 

  return "";
}

export async function submitRegistration(
  supplierId: number,
  modifiedBy: string,
  taskId: string,
  approversList: string
) {
  await getPool().query(`
    UPDATE dbo.supp_basic_org_dtls
    SET  prev_status = CASE 
          WHEN prev_status IS NULL OR prev_status <> 'Active' THEN status
          ELSE prev_status 
        END,
        status = 'Pending Approval',
        attribute_5 = 'No',
        attribute_12 = $3,
        approvers_list = $4,
        last_modified_by = $1,
        last_modified_date = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [modifiedBy, supplierId, taskId, approversList]);

  await getPool().query(`
    UPDATE dbo.supp_invitation_dtls
    SET status = 'Pending Approval', last_modified_date = CURRENT_TIMESTAMP
    WHERE id = (SELECT invitation_id FROM dbo.supp_basic_org_dtls WHERE id = $1)
  `, [supplierId]);
}

export async function updateSupplierAttribute4(supplierId: number, attribute4: string, modifiedBy: string) {
  await getPool().query(`
    UPDATE dbo.supp_basic_org_dtls SET attribute_4 = $1, last_modified_date = NOW(), last_modified_by = $2 WHERE id = $3
  `, [attribute4, modifiedBy, supplierId]);
}

export async function getSupplierWithOrg(supplierId: number) {
  const result = await getPool().query(`
    SELECT s.id, s.company_name, s.status, s.country, s.invitation_id,
           o.organization_name, o.org_country
    FROM dbo.supp_basic_org_dtls s
    LEFT JOIN dbo.um_org_dtls o ON o.id = (
      SELECT org_id FROM dbo.um_user_dtls WHERE attribute_2 = CAST(s.id AS VARCHAR) LIMIT 1
    )
    WHERE s.id = $1
  `, [supplierId]);
  return result.rows[0] || null;
}

export async function getUserAttribute13(supplierId: number): Promise<string | null> {
  const result = await getPool().query(`
    SELECT attribute_13 FROM dbo.um_user_dtls WHERE attribute_2 = CAST($1 AS VARCHAR) LIMIT 1
  `, [supplierId]);
  return result.rows[0]?.attribute_13 || null;
}

export async function findInternalOrgByCountry(country: string) {
  const result = await getPool().query(`
    SELECT id, organization_name, org_country FROM dbo.um_org_dtls
    WHERE org_type = 'INTERNAL' AND org_country = $1 ORDER BY id LIMIT 1
  `, [country]);
  return result.rows[0] || null;
}

export async function getMainOrganization() {
  const result = await getPool().query(`
    SELECT id, organization_name, org_country FROM dbo.um_org_dtls
    WHERE org_type = 'INTERNAL' ORDER BY id LIMIT 1
  `);
  return result.rows[0] || null;
}

/**
 * Wipes in-progress registration data for a supplier that is still in Draft status.
 * Keeps the supplier row, invitation link, and user–supplier mapping; clears child rows and profile fields.
 */
export async function resetDraftSupplierData(
  supplierId: number,
  defaultCompanyName: string,
  modifiedBy: string
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      `SELECT id, status, company_name, phone, phone_ctry_code, phone_area_code, email_id
       FROM dbo.supp_basic_org_dtls WHERE id = $1 FOR UPDATE`,
      [supplierId]
    );
    if (!lock.rows[0]) {
      await client.query("ROLLBACK");
      return;
    }
    if (String(lock.rows[0].status || "").trim() !== "Draft") {
      await client.query("ROLLBACK");
      return;
    }

    const row = lock.rows[0];
    /** Locked in the registration UI (account identity); must survive "Start over". */
    const preservePhone = row.phone ?? null;
    const preservePhoneCtry = row.phone_ctry_code ?? null;
    const preservePhoneArea = row.phone_area_code ?? null;
    const preserveEmail = row.email_id ?? null;

    const fallbackName = lock.rows[0].company_name || "Unknown";
    const nextCompanyName =
      defaultCompanyName && String(defaultCompanyName).trim() !== ""
        ? String(defaultCompanyName).trim()
        : fallbackName;

    await clearOrgPrevColumns(client, supplierId);

    await client.query(`DELETE FROM dbo.supp_contact_dtls WHERE supplier_id = $1`, [supplierId]);
    await client.query(`DELETE FROM dbo.supp_bank_dtls WHERE supplier_id = $1`, [supplierId]);
    await client.query(`DELETE FROM dbo.supp_scope_of_supply_service WHERE supplier_id = $1`, [supplierId]);

    await client.query(
      `UPDATE dbo.supp_document_dtls
       SET status = 'Inactive', last_modified_by = $2, last_modified_date = CURRENT_TIMESTAMP
       WHERE supplier_id = $1 AND record_type = 'SUPPLIER_REG' AND (status = 'Active' OR status IS NULL)`,
      [supplierId, modifiedBy]
    );

    await client.query(
      `UPDATE dbo.supp_ref_companies_dtls
       SET status = 1, last_modified_by = $2, last_modified_date = CURRENT_TIMESTAMP
       WHERE supplier_id = $1 AND (status = 0 OR status IS NULL)`,
      [supplierId, modifiedBy]
    );

    await client.query(
      `UPDATE dbo.supp_basic_org_dtls SET
        company_name = $1,
        address_1 = NULL, address_2 = NULL, city = NULL, state = NULL, country = NULL, postalcode = NULL,
        phone = $4, phone_ctry_code = $5, phone_area_code = $6,
        email_id = $7, web_address = NULL,
        fax = NULL, fax_ctry_code = NULL, fax_area_code = NULL,
        po_box = NULL, emirates_id = NULL, supplier_type = NULL,
        legal_entity_type = NULL, type_of_company = NULL, pan_no = NULL,
        start_date = NULL, bus_trading_date = NULL,
        license_no = NULL, expiry_date = NULL, place_of_issue = NULL,
        workingday_start = NULL, workingday_end = NULL,
        annual_turn_over = NULL, turn_over_currency = NULL,
        working_time_start_time = NULL, working_time_end_time = NULL,
        tax_eligibility = 'N',
        tax_reg_no = NULL, tax_cntry = NULL, tax_payer_id = NULL, tax_effective_date = NULL, p_annual_revenue = NULL,
        payment_terms = NULL, payment_terms_id = NULL,
        parent_company_name = NULL, parent_company_addr = NULL,
        prnt_cmpy_phone = NULL, prnt_cmpy_phn_ctry_code = NULL, prnt_cmpy_phn_areacode = NULL,
        url = NULL,
        type_of_service = NULL, year_of_exp_loc_market = NULL, year_of_exp_international = NULL, total_experience = NULL,
        last_modified_by = $2, last_modified_date = CURRENT_TIMESTAMP
      WHERE id = $3 AND status = 'Draft'`,
      [
        nextCompanyName,
        modifiedBy,
        supplierId,
        preservePhone,
        preservePhoneCtry,
        preservePhoneArea,
        preserveEmail,
      ]
    );

    await client.query(
      `UPDATE dbo.supp_site_dtls SET
        sitename = COALESCE(NULLIF($1::text, ''), sitename),
        address_1 = NULL, address_2 = NULL, city = NULL, state = NULL, country = NULL,
        areacode = $4, phone = $5, email = $6,
        faxareacode = NULL, fax = NULL, postalcode = NULL,
        last_modified_by = $2, last_modified_date = CURRENT_TIMESTAMP
      WHERE supplier_id = $3`,
      [
        nextCompanyName,
        modifiedBy,
        supplierId,
        preservePhoneArea,
        preservePhone,
        preserveEmail,
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

let _draftBackupTableEnsured = false;

async function ensureDraftBackupTable(): Promise<void> {
  if (_draftBackupTableEnsured) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS dbo.vendor_registration_draft_backup (
      user_name   TEXT NOT NULL,
      org_id      INTEGER NOT NULL,
      draft_json  JSONB,
      pending_docs_json JSONB,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_name, org_id)
    )
  `);
  _draftBackupTableEnsured = true;
}

export async function saveDraftBackup(
  userName: string,
  orgId: number,
  draft: unknown,
  pendingDocs: unknown[],
): Promise<void> {
  await ensureDraftBackupTable();
  await getPool().query(
    `INSERT INTO dbo.vendor_registration_draft_backup (user_name, org_id, draft_json, pending_docs_json, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_name, org_id)
     DO UPDATE SET draft_json = $3, pending_docs_json = $4, updated_at = NOW()`,
    [userName, orgId, JSON.stringify(draft), JSON.stringify(pendingDocs)],
  );
}

export async function loadDraftBackup(
  userName: string,
  orgId: number,
): Promise<{ draft: unknown; pendingDocs: unknown[] } | null> {
  await ensureDraftBackupTable();
  const result = await getPool().query(
    `SELECT draft_json, pending_docs_json FROM dbo.vendor_registration_draft_backup
     WHERE user_name = $1 AND org_id = $2 LIMIT 1`,
    [userName, orgId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    draft: row.draft_json,
    pendingDocs: Array.isArray(row.pending_docs_json) ? row.pending_docs_json : [],
  };
}

export async function deleteDraftBackup(
  userName: string,
  orgId: number,
): Promise<void> {
  await ensureDraftBackupTable();
  await getPool().query(
    `DELETE FROM dbo.vendor_registration_draft_backup WHERE user_name = $1 AND org_id = $2`,
    [userName, orgId],
  );
}

export async function deleteReviewDocument(supplierId: string) 
{
  try
  {
   await getPool().query(`delete from dbo.supp_document_dtls where supplier_id=$1 and doc_type='Review Document'`, [Number(supplierId)]);
  }
  catch(error)
  {
    console.error(error);
  }
}