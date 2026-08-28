import { pool } from "../../db";
import { getContextPool } from "../../tenant-context";
import {
  isExportAllRows,
  listPaginationMeta,
  parseListPageLimit,
} from "../_shared/list-pagination";
const getPool = () => getContextPool() ?? pool;

export async function getInvoiceStats(sessionUser?: any, dateFilter?: { from_date?: string; to_date?: string }) 
{
  const orgId = sessionUser?.orgIds || sessionUser?.orgId || sessionUser?.org_id;
  const supplierId = sessionUser?.supplierId || sessionUser?.supplier_id;
  const isSupplier = sessionUser?.userRole === "ROLE_SUPPLIER_ADMIN" || sessionUser?.userRole === "ROLE_SUPPLIER_USER";
  const isProcOfficer = sessionUser?.userRole === "ROLE_PROCUREMENT_OFFICER" || sessionUser?.userRole === "ROLE_PROCUREMENT_MANAGER";
  const isSuperAdmin =
    sessionUser?.userRole === "ROLE_SUPERADMIN" ||
    sessionUser?.userRole === "ROLE_SYSADMIN" ||
    sessionUser?.userRole === "SUPERADMIN";
  const isFinance = sessionUser?.userRole === "ROLE_FINANCE_OFFICER" || sessionUser?.userRole === "ROLE_FINANCE_MANAGER";
  
  let whereClause = "WHERE 1=1";
  const params: any[] = [];
  
  if (isSupplier && supplierId) 
  {
    params.push(supplierId);
    whereClause += ` AND supplier_id = $${params.length} AND ((po_number IS NULL AND invoice_status NOT IN ('Draft', 'More Info Required', 'Pending Approval')) OR (po_number IS NOT NULL))`; 
  }
  if (!isSuperAdmin && !isSupplier && !isProcOfficer && !isFinance) 
  {
    params.push(sessionUser?.department || null);
    const deptParam = params.length;
    params.push(`%${sessionUser?.userName}%`);
    const userNameParam = params.length;
    whereClause += ` AND (department = $${deptParam} OR (department IS NULL AND TRIM(COALESCE(department_name, '')) = TRIM(COALESCE($${deptParam}::text, ''))) OR (attribute_10 ILIKE $${userNameParam}) OR (created_by ILIKE $${userNameParam}))`;
    
  }
  if (!isSuperAdmin && !isSupplier && orgId) 
  {
   const orgIdArray = orgId.includes(",")
    ? orgId.split(",").filter((id: string) => id.trim() !== "").map((id: string) => parseInt(id.trim()))
    : [parseInt(orgId)];
  params.push(orgIdArray);
  whereClause += ` AND (org_id = ANY($${params.length}::int[]) OR (attribute_10 ILIKE $${params.length+1}))`;
  params.push(`%${sessionUser?.userName}%`);
  }
  if (dateFilter?.from_date) 
  {
    params.push(dateFilter.from_date);
    whereClause += ` AND invoice_date >= $${params.length}::date`;
  }
  if (dateFilter?.to_date) 
  {
    params.push(dateFilter.to_date);
    whereClause += ` AND invoice_date <= $${params.length}::date`;
  }

  const result = await getPool().query(
    `SELECT 
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE invoice_status = 'Draft') as draft,
       COUNT(*) FILTER (WHERE invoice_status = 'Pending Approval') as pending_approval,
       COUNT(*) FILTER (WHERE invoice_status = 'Approved') as approved,
       COUNT(*) FILTER (WHERE invoice_status = 'Paid') as paid,
       COUNT(*) FILTER (WHERE invoice_status = 'Rejected') as rejected,
       COUNT(*) FILTER (WHERE invoice_status = 'More Info Required') as moreinfo,
       COUNT(*) FILTER (WHERE po_number IS NULL) as non_po,
       COUNT(*) FILTER (WHERE po_number IS NOT NULL) as po,
       COALESCE(SUM(invoice_amount), 0) as total_value,
       COALESCE(SUM(invoice_amount) FILTER (WHERE invoice_status = 'Draft'), 0) as draft_value,
       COALESCE(SUM(invoice_amount) FILTER (WHERE invoice_status = 'Pending Approval'), 0) as pending_value,
       COALESCE(SUM(invoice_amount) FILTER (WHERE invoice_status = 'Approved'), 0) as approved_value,
       COALESCE(SUM(invoice_amount) FILTER (WHERE invoice_status = 'Paid'), 0) as paid_value,
       COALESCE(SUM(invoice_amount) FILTER (WHERE invoice_status = 'Rejected'), 0) as rejected_value,
       COALESCE(SUM(invoice_amount) FILTER (WHERE invoice_status = 'More Info Required'), 0) as moreinfo_value,
       COUNT(*) FILTER (WHERE inv_due_date < NOW() AND invoice_status NOT IN ('Paid', 'Rejected')) as overdue_count,
       COALESCE(SUM(invoice_amount) FILTER (WHERE inv_due_date < NOW() AND invoice_status NOT IN ('Paid', 'Rejected')), 0) as overdue_value
     FROM dbo.supp_invoice_dtls ${whereClause}`,
    params
  );
  return result.rows[0];
}

export function buildInvoiceListWhereClause(query: any, sessionUser?: any): {
  whereClause: string;
  params: any[];
  paramIndex: number;
} {
  const status = query.status;
  let statusArray: string[] = [];
  if (status && status.includes(",")) {
    statusArray = status.split(",");
  } else {
    statusArray = [status];
  }
  const search = query.search;
  const orgId = sessionUser?.orgIds || sessionUser?.orgId || sessionUser?.org_id;
  const supplierId = sessionUser?.supplierId || sessionUser?.supplier_id;
  const isSupplier =
    sessionUser?.userRole === "ROLE_SUPPLIER_ADMIN" || sessionUser?.userRole === "ROLE_SUPPLIER_USER";
  const isProcOfficer =
    sessionUser?.userRole === "ROLE_PROCUREMENT_OFFICER" ||
    sessionUser?.userRole === "ROLE_PROCUREMENT_MANAGER";
  const isSuperAdmin =
    sessionUser?.userRole === "ROLE_SUPERADMIN" ||
    sessionUser?.userRole === "ROLE_SYSADMIN" ||
    sessionUser?.userRole === "SUPERADMIN";
  const isFinance =
    sessionUser?.userRole === "ROLE_FINANCE_OFFICER" || sessionUser?.userRole === "ROLE_FINANCE_MANAGER";

  let whereClause = "WHERE 1=1";
  const params: any[] = [];
  let paramIndex = 1;

  if (isSupplier && supplierId) {
    params.push(supplierId);
    whereClause += ` AND supplier_id = $${paramIndex} AND ((po_number IS NULL AND invoice_status NOT IN ('Draft', 'More Info Required', 'Pending Approval')) OR (po_number IS NOT NULL))`;
    paramIndex++;
  } else if (!isSuperAdmin && !isSupplier && !isProcOfficer && !isFinance) {
    params.push(sessionUser?.department || null);
    params.push(`%${sessionUser?.userName}%`);
    whereClause += ` AND (department = $${paramIndex} OR (department IS NULL AND TRIM(COALESCE(department_name, '')) = TRIM(COALESCE($${paramIndex}::text, ''))) OR (attribute_10 ILIKE $${++paramIndex}) OR (created_by ILIKE $${paramIndex})) `;
    paramIndex++;
  }
  if (!isSuperAdmin && !isSupplier && orgId) {
    const orgIdArray = orgId.includes(",")
      ? orgId.split(",").filter((id: string) => id.trim() !== "").map((id: string) => parseInt(id.trim()))
      : [parseInt(orgId)];

    params.push(orgIdArray);
    whereClause += ` AND (org_id = ANY($${paramIndex}::int[]) OR (attribute_10 ILIKE $${++paramIndex}))`;
    params.push(`%${sessionUser?.userName}%`);
    paramIndex++;
  }
  if (status && status !== "all") {
    const trimmed = statusArray.map((s: string) => String(s).trim()).filter(Boolean);
    if (trimmed.length > 1) {
      params.push(trimmed);
      whereClause += ` AND TRIM(invoice_status) = ANY($${paramIndex}::text[])`;
      paramIndex++;
    } else if (trimmed.length === 1) {
      params.push(trimmed[0]);
      whereClause += ` AND TRIM(invoice_status) = $${paramIndex}`;
      paramIndex++;
    } else if (status?.trim()) {
      params.push(status.trim());
      whereClause += ` AND TRIM(invoice_status) = $${paramIndex}`;
      paramIndex++;
    }
  }
  if (search) {
    params.push(`%${search}%`);
    const likeParam = `$${paramIndex++}`;
    let idClause = "";
    if (/^\d+$/.test(search.trim())) {
      params.push(search.trim());
      idClause = ` OR CAST(id AS TEXT) = $${paramIndex++}`;
    }
    whereClause += ` AND (id ILIKE ${likeParam} OR invoice_number ILIKE ${likeParam} OR supplier_name ILIKE ${likeParam} OR po_number ILIKE ${likeParam} OR description ILIKE ${likeParam} OR department_name ILIKE ${likeParam}${idClause})`;
  }
  if (query.invoice_type) {
    params.push(query.invoice_type);
    whereClause += ` AND invoice_type = $${paramIndex}`;
    paramIndex++;
  }
  const source = query.source || query.invoice_source;
  if (source === "non-po") {
    whereClause += ` AND po_number IS NULL`;
  } else if (source === "po") {
    whereClause += ` AND po_number IS NOT NULL`;
  }
  if (query.supplier_id) {
    params.push(query.supplier_id);
    whereClause += ` AND supplier_id = $${paramIndex}`;
    paramIndex++;
  }
  if (query.amount_min !== undefined && query.amount_min !== null) {
    params.push(query.amount_min);
    whereClause += ` AND invoice_amount >= $${paramIndex}`;
    paramIndex++;
  }
  if (query.amount_max !== undefined && query.amount_max !== null) {
    params.push(query.amount_max);
    whereClause += ` AND invoice_amount <= $${paramIndex}`;
    paramIndex++;
  }
  if (query.from_date) {
    params.push(query.from_date);
    whereClause += ` AND invoice_date >= $${paramIndex}::date`;
    paramIndex++;
  }
  if (query.to_date) {
    params.push(query.to_date);
    whereClause += ` AND invoice_date <= $${paramIndex}::date`;
    paramIndex++;
  }
  if (query.overdue === true || query.overdue === "true") {
    whereClause += ` AND inv_due_date < NOW() AND invoice_status NOT IN ('Paid', 'Rejected')`;
  }

  return { whereClause, params, paramIndex };
}

export async function getInvoiceExportLineRows(query: any, sessionUser?: any) {
  const { whereClause, params } = buildInvoiceListWhereClause(query, sessionUser);
  const result = await getPool().query(
    `SELECT 
      inv.id AS invoice_mst_id,
      inv.invoice_number,
      inv.invoice_status,
      inv.invoice_type,
      inv.invoice_amount AS header_invoice_amount,
      inv.invoice_curr_code,
      inv.invoice_date,
      inv.inv_due_date,
      inv.po_number,
      inv.supplier_name,
      inv.department_name,
      inv.description AS header_description,
      inv.submitted_by,
      il.id AS line_id,
      il.line_number,
      il.po_line_number,
      il.item_name,
      il.order_qty,
      il.order_cost,
      il.order_unit_cost,
      il.line_status,
      il.receipt_num,
      il.tax_amount,
      il.tax_rate
    FROM dbo.supp_invoice_line_dtls il
    INNER JOIN dbo.supp_invoice_dtls inv ON inv.id = il.invoice_id
    WHERE il.invoice_id IN (
      SELECT id FROM dbo.supp_invoice_dtls ${whereClause}
    )
    ORDER BY inv.creation_date DESC, inv.id DESC, il.line_number ASC`,
    [...params]
  );
  return result.rows;
}

export async function getInvoices(query: any, sessionUser?: any) {
  const { page, limit, offset } = parseListPageLimit(query.page, query.limit);
  const wantExportLines = isExportAllRows(query.exportLines, limit);

  const { whereClause, params, paramIndex: filterEndIndex } = buildInvoiceListWhereClause(query, sessionUser);
  let paramIndex = filterEndIndex;

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM dbo.supp_invoice_dtls ${whereClause}`,
    params
  );

  let limitClause = "";
  if (limit !== 0) {
    limitClause = ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit);
    params.push(offset);
    paramIndex++;
  }

  const result = await getPool().query(
    `SELECT id, invoice_number, invoice_status, invoice_type, invoice_amount, 
            invoice_curr_code, invoice_date, inv_due_date, po_number, supplier_name, 
            supplier_id, description, department_name, cost_center_name,
            inv_match_status, inv_payment_status, tax_amount, created_by,
            creation_date, submitted_by, invoice_source, payment_terms_name,
            budget_name, invoice_approvers
     FROM dbo.supp_invoice_dtls ${whereClause}
     ORDER BY creation_date DESC, id DESC
     ${limitClause}`,
    [...params]
  );

  const total = parseInt(countResult.rows[0].total);

  const exportLines = wantExportLines ? await getInvoiceExportLineRows(query, sessionUser) : undefined;

  return {
    data: result.rows,
    pagination: listPaginationMeta(total, page, limit),
    ...(exportLines !== undefined ? { exportLines } : {}),
  };
}

export async function getCurrentApprover(invoiceId: string, processName: string) {
  const result = await getPool().query(
    `SELECT u.name, si.current_assignee FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    join dbo.um_user_dtls u on si.current_assignee = u.email_id
    where si.ref_number = $1 and si.status = 'Ready'
    and i.process_name = $2`,
    [invoiceId, processName]
  );
  if(result.rows.length > 0) {
    return result.rows[0];
  }
  const result2 = await getPool().query(
    `SELECT si.current_assignee as name FROM dbo.wf_step_instance si
    join dbo.wf_instance i on si.instance_id = i.id
    where si.ref_number = $1 and si.status = 'Ready'
    and i.process_name = $2`,
    [invoiceId, processName]
  );
  if(result2.rows.length > 0) {
    return result2.rows[0];
  }
}

export async function getInvoiceById(id: string) {
  const result = await getPool().query(
    `SELECT inv.*,
            po.po_description,
            po.po_owner_name AS po_requestor_name,
            po.po_owner_email AS po_requestor_email,
            po.buyer_name AS po_buyer_name,
            po.buyer_email AS po_buyer_email,
            po.po_total_cost AS po_total_amount,
            COALESCE(inv.supplier_contact_email, supp.email_id) AS supplier_contact_email,
            COALESCE(inv.supplier_contact_no, CONCAT_WS(' ', NULLIF(supp.phone_ctry_code, ''), NULLIF(supp.phone_area_code, ''), supp.phone)) AS supplier_contact_phone,
            COALESCE(inv.supplier_name, supp.company_name) AS supplier_display_name
     FROM dbo.supp_invoice_dtls inv
     LEFT JOIN LATERAL (
       SELECT
         p.po_description,
         p.po_owner_name,
         p.po_owner_email,
         p.buyer_name,
         p.buyer_email,
         p.po_total_cost
       FROM dbo.supp_po_header_dtls p
       WHERE p.po_number = inv.po_number
       ORDER BY
         CASE
           WHEN inv.org_id IS NOT NULL AND p.org_id = inv.org_id THEN 0
           ELSE 1
         END,
         p.creation_date DESC NULLS LAST
       LIMIT 1
     ) po ON TRUE
     LEFT JOIN dbo.supp_basic_org_dtls supp ON inv.supplier_id = supp.id
     WHERE inv.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Resolves either form of invoice reference in one lookup: the record key
 * (`id`, e.g. `INV_00042`) or the supplier's `invoice_number`, which is free
 * text and frequently numeric. Callers that receive an identifier from outside
 * cannot tell the two apart, so an exact `id` match wins and the invoice number
 * is the fallback.
 *
 * Invoice numbers are not unique, so the newest match is returned along with
 * `match_count` — callers acting on the record should surface an ambiguous
 * reference rather than assume.
 */
export async function findInvoiceByIdOrNumber(identifier: string) {
  const value = String(identifier ?? "").trim();
  if (!value) return null;
  const result = await getPool().query(
    `SELECT *, COUNT(*) OVER () AS match_count FROM dbo.supp_invoice_dtls
      WHERE UPPER(TRIM(CAST(id AS TEXT))) = UPPER($1)
         OR UPPER(TRIM(COALESCE(invoice_number, ''))) = UPPER($1)
      ORDER BY (UPPER(TRIM(CAST(id AS TEXT))) = UPPER($1)) DESC,
               creation_date DESC NULLS LAST
      LIMIT 1`,
    [value]
  );
  return result.rows[0] || null;
}

export async function getInvoiceLines(invoiceId: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_invoice_line_dtls WHERE invoice_id = $1 ORDER BY line_number ASC`,
    [invoiceId]
  );
  return result.rows;
}

export async function createInvoice(data: any) {
  const seq = await getPool().query(`SELECT nextval('dbo.supp_invoice_id_seq')::int AS id`);
  const id = seq.rows[0].id;
  let prefix: string;
  if(data.invoice_source==='NON-PO')
  {
      const prefixNonInvoice = await getPool().query(
          `SELECT prefix_value FROM dbo.am_prefix_mst
     WHERE UPPER(TRIM(prefix_name)) IN ('NON PO INVOICE', 'NPI')
     AND status = 'Active'
     LIMIT 1`
      );
      prefix = prefixNonInvoice.rows[0]?.prefix_value?.trim() || 'NPI';
  }
  else
  {
      const prefixInvoice = await getPool().query(
          `SELECT prefix_value FROM dbo.am_prefix_mst
           WHERE UPPER(TRIM(prefix_name)) IN ('INVOICE', 'INV')
            AND status = 'Active'
            LIMIT 1`
      );
      prefix = prefixInvoice.rows[0]?.prefix_value?.trim() || 'INV';
  }
    const invoiceId = `${prefix}_${String(id).padStart(5, "0")}`;

    const result = await getPool().query(
      `INSERT INTO dbo.supp_invoice_dtls (
       id, invoice_number, invoice_type, invoice_status, invoice_amount, invoice_curr_code,
       invoice_date, inv_due_date, po_number, supplier_id, supplier_name, description,
       department_name, cost_center_name, invoice_source, payment_terms_name,
       budget_name, created_by, creation_date, last_modified_by, last_modified_date, org_id, tax_included
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),$18,NOW(),$19,$20)
     RETURNING *`,
      [
        invoiceId,
        data.invoice_number,
        data.invoice_type || "STANDARD",
        "Draft",
        data.invoice_amount || 0,
        data.invoice_curr_code || "AED",
        data.invoice_date || new Date(),
        data.inv_due_date,
        data.po_number || null,
        data.supplier_id || null,
        data.supplier_name || null,
        data.description || null,
        data.department_name || null,
        data.cost_center_name || null,
        data.invoice_source || "EXTERNAL",
        data.payment_terms_name || null,
        data.budget_name || null,
        data.created_by,
        data.org_id || null,
        data.tax_included || "N",
      ]
  );
  return result.rows[0];
}

export async function updateInvoice(id: string, data: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const allowedFields = [
    "invoice_number", "invoice_type", "invoice_status", "invoice_amount",
    "invoice_curr_code", "invoice_date", "inv_due_date", "po_number",
    "supplier_id", "supplier_name", "description", "department_name",
    "cost_center_name", "invoice_source", "payment_terms_name", "budget_name",
    "tax_amount", "inv_match_status", "inv_payment_status", "invoice_notes",
    "invoice_reason", "submitted_by", "invoice_approvers", "attribute_1",
    "attribute_5", "attribute_12", "site_id", "payment_terms_id", "gl_date",
    "budget_segment", "department", "org_id",
    "prepay_apply_amount", "creation_date","attribute_10", "tax_included"
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${idx}`);
      values.push(data[field]);
      idx++;
    }
  }

  if (fields.length === 0) return null;

  fields.push(`last_modified_by = $${idx}`);
  values.push(data.last_modified_by);
  idx++;

  fields.push(`last_modified_date = NOW()`);

  values.push(id);
  const result = await getPool().query(
    `UPDATE dbo.supp_invoice_dtls SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteInvoice(id: string) {
  await getPool().query(`DELETE FROM dbo.supp_invoice_line_dtls WHERE invoice_id = $1`, [id]);
  const result = await getPool().query(`DELETE FROM dbo.supp_invoice_dtls WHERE id = $1 RETURNING *`, [id]);
  return result.rows[0] || null;
}

export async function createInvoiceLine(data: any) {
  const id = Math.floor(Math.random() * (2000000000 - 100000000)) + 100000000;

  const result = await getPool().query(
    `INSERT INTO dbo.supp_invoice_line_dtls (
       id, invoice_id, line_number, item_name, item_type, description,
       order_qty, order_unit_cost, order_cost, tax_amount, tax_rate,
       tax_rate_code, taxable_flag, po_number, po_line_number,
       product_category_name, created_by, creation_date, last_modified_by, last_modified_date, org_id,item_id,attribute_15,
       delivery_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),$17,NOW(),$18,$19,$20,$21)
     RETURNING *`,
    [
      id,
      data.invoice_id,
      data.line_number || 1,
      data.item_name || null,
      data.item_type || "ITEM",
      data.description || null,
      data.order_qty || 0,
      data.order_unit_cost || 0,
      data.order_cost || 0,
      data.tax_amount || 0,
      data.tax_rate || 0,
      data.tax_rate_code || null,
      data.taxable_flag || "N",
      data.po_number || null,
      data.po_line_number || null,
      data.product_category_name || null,
      data.created_by,
      data.org_id || null,
      data.item_id || null,
      data.tax_rate_id || null,
      data.delivery_date || null,
    ]
  );
  return result.rows[0];
}

export async function updateInvoiceLine(lineId: number, data: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const allowedFields = [
    "item_name", "item_type", "description", "order_qty", "order_unit_cost",
    "order_cost", "tax_amount", "tax_rate", "tax_rate_code", "taxable_flag",
    "po_number", "po_line_number", "product_category_name", "delivery_date"
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${idx}`);
      values.push(data[field]);
      idx++;
    }
  }

  if (fields.length === 0) return null;

  fields.push(`last_modified_by = $${idx}`);
  values.push(data.last_modified_by);
  idx++;

  fields.push(`last_modified_date = NOW()`);

  values.push(lineId);
  const result = await getPool().query(
    `UPDATE dbo.supp_invoice_line_dtls SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteInvoiceLine(lineId: number) {
  const result = await getPool().query(
    `DELETE FROM dbo.supp_invoice_line_dtls WHERE id = $1 RETURNING *`,
    [lineId]
  );
  return result.rows[0] || null;
}

export async function getVendorBankDetails(supplierId: number, siteId?: string | number | null) {
  const bankSelect = `
    SELECT id, bank_name, account_no, bank_account_type, beneficiary_name, bank_address,
           swift_code, ifsccode, iban_no, branch_name, currency, primary_account
    FROM dbo.supp_bank_dtls
    WHERE (status = 1 OR status IS NULL)`;
  const bankOrder = `ORDER BY CASE WHEN primary_account = 'Y' THEN 0 ELSE 1 END, id ASC`;

  const parsedSiteId =
    siteId != null && String(siteId).trim() !== "" ? parseInt(String(siteId), 10) : null;
  if (parsedSiteId != null && !Number.isNaN(parsedSiteId)) {
    const bySite = await getPool().query(
      `${bankSelect} AND supp_site_id = $1 ${bankOrder}`,
      [parsedSiteId]
    );
    if (bySite.rows.length > 0) return bySite.rows;
  }

  const result = await getPool().query(
    `${bankSelect} AND supplier_id = $1 ${bankOrder}`,
    [supplierId]
  );
  return result.rows;
}

export async function processPayment(id: string, data: any) {
  const result = await getPool().query(
    `UPDATE dbo.supp_invoice_dtls 
     SET invoice_status = 'Paid',
         inv_payment_status = 'Paid',
         pay_group_code = $2,
         payment_description = $3,
         payment_date = $4,
         ppayment_amount = $5,
         invoice_amount_paid = $5,
         bank_account_no = $6,
         last_modified_by = $7,
         last_modified_date = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      data.payment_method,
      data.payment_description || null,
      data.payment_date,
      data.amount_to_pay,
      data.bank_account_no || null,
      data.last_modified_by,
    ]
  );
  return result.rows[0] || null;
}

export async function insertPaymentRecord(data: {
  invId: string;
  paymentMethod: string;
  paymentDescription: string | null;
  paymentDate: string;
  amountPaid: number;
  invoiceAmount: number;
  paymentCurrCode: string | null;
  bankName: string | null;
  bankBranch: string | null;
  onlineTrsfdAcntNo: string | null;
  bankTransferRefNo: string | null;
  chequeNumber: string | null;
  chequeDate: string | null;
  chequeCollectedBy: string | null;
  chequeCollectionDate: string | null;
  chequeCollectorContactNo: string | null;
  chequeCollectorEmail: string | null;
  tdsCategory: string | null;
  tdsPcrnt: number | null;
  tdsAmount: number | null;
}) {
  // const id = Math.floor(Math.random() * (2000000000 - 100000000)) + 100000000;
  const seq = await getPool().query(`SELECT nextval('dbo.supp_payment_id_seq')::int AS id`);
  const id = seq.rows[0].id;
  const payId = `PAY_${String(id).padStart(5, "0")}`;
  const result = await getPool().query(
    `INSERT INTO dbo.supp_invoice_payment_dtls (
       id, invid, paymentmethod, paymentdescription, payment_date,
       amountpaid, invoiceamount, paymentcurrcode, invpaymentstatus, invoicestatus,
       bankname, bankbranch, onlinetrsfdacntno, banktransferrefno,
       checknumber, checkdate, checkcollectedby, checkcollectiondate,
       checkcollectorcontactno, checkcollectoremail,
       tdscategory, tdspcrnt, tdsamount
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, 'Paid', 'Paid',
       $9, $10, $11, $12,
       $13, $14, $15, $16,
       $17, $18,
       $19, $20, $21
     ) RETURNING *`,
    [
      id, data.invId, data.paymentMethod, data.paymentDescription, data.paymentDate,
      data.amountPaid, data.invoiceAmount, data.paymentCurrCode,
      data.bankName, data.bankBranch, data.onlineTrsfdAcntNo, data.bankTransferRefNo,
      data.chequeNumber, data.chequeDate || null, data.chequeCollectedBy, data.chequeCollectionDate || null,
      data.chequeCollectorContactNo, data.chequeCollectorEmail,
      data.tdsCategory, data.tdsPcrnt, data.tdsAmount || 0,
    ]
  );
  return result.rows[0] || null;
}

export async function getPaymentRecord(invoiceId: string) {
  const result = await getPool().query(
    `SELECT * FROM dbo.supp_invoice_payment_dtls WHERE invid = $1 ORDER BY id DESC LIMIT 1`,
    [invoiceId]
  );
  return result.rows[0] || null;
}

export async function getInvoiceDocuments(invoiceId: string) {
  const result = await getPool().query(`
    SELECT id, file_name, file_path, attach_source, 
           created_by, created_date, last_modified_by, last_modified_date
    FROM dbo.am_collaboration_attachment_dtls 
    WHERE attach_source = 'INVOICE' AND entity_id = $1
    ORDER BY created_date DESC
  `, [String(invoiceId)]);
  return result.rows;
}

export async function insertInvoiceDocument(invoiceId: string, fileName: string, filePath: string, createdBy: string) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_collaboration_attachment_dtls (
      id, attach_source, entity_id, file_name, file_path, 
      created_by, created_date, last_modified_by, last_modified_date
    ) VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_collaboration_attachment_dtls),
      'INVOICE', $1, $2, $3, $4, NOW(), $4, NOW()
    )
    RETURNING id
  `, [String(invoiceId), fileName, filePath, createdBy]);
  return result.rows[0].id;
}

export async function deleteInvoiceDocument(invoiceId: string, docId: number) {
  await getPool().query(
    `DELETE FROM dbo.am_collaboration_attachment_dtls WHERE id = $1 AND attach_source = 'INVOICE' AND entity_id = $2`,
    [docId, String(invoiceId)]
  );
}

export async function deleteSuppDocument(docId: number) {
  await getPool().query(
    `UPDATE dbo.supp_document_dtls SET status = 'Deleted', last_modified_date = NOW() WHERE id = $1`,
    [docId]
  );
}

export async function getInvoiceComments(invoiceId: string) {
  const result = await getPool().query(`
    SELECT id, comments, created_by, created_by_name, creation_date, 
           reviewer, reviewer_name, section, from_action
    FROM dbo.am_collaboration_dtl 
    WHERE entity_id = $1 AND type = 'INVOICE'
    ORDER BY creation_date DESC
  `, [String(invoiceId)]);
  return result.rows;
}

export async function insertInvoiceComment(invoiceId: string, comments: string, createdBy: string, createdByName: string) {
  const result = await getPool().query(`
    INSERT INTO dbo.am_collaboration_dtl (
      id, entity_id, type, comments, created_by, created_by_name, 
      creation_date, last_updated_by, last_updated_date
    ) VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM dbo.am_collaboration_dtl),
      $1, 'INVOICE', $2, $3, $4, NOW(), $3, NOW()
    )
    RETURNING id
  `, [String(invoiceId), comments, createdBy, createdByName]);
  return result.rows[0].id;
}

export async function deleteInvoiceComment(invoiceId: string, commentId: number) {
  await getPool().query(
    `DELETE FROM dbo.am_collaboration_dtl WHERE id = $1 AND type = 'INVOICE' AND entity_id = $2`,
    [commentId, String(invoiceId)]
  );
}

export async function getInvoiceNotes(invoiceId: string) {
  const result = await getPool().query(
    `SELECT invoice_notes FROM dbo.supp_invoice_dtls WHERE id = $1`,
    [invoiceId]
  );
  return result.rows[0]?.invoice_notes || '';
}

export async function updateInvoiceNotes(invoiceId: string, notes: string) {
  await getPool().query(
    `UPDATE dbo.supp_invoice_dtls SET invoice_notes = $1, last_modified_date = NOW() WHERE id = $2`,
    [notes, invoiceId]
  );
}

export async function getInvoiceApprovalHistory(invoiceId: string) {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) return [];
  const result = await getPool().query(
    `SELECT id, object_id, approver_id, approver_name, 
            attribute_9 as email, attribute_10 as designation, 
            status, comments, approved_date, requested_date, attribute_1
     FROM dbo.supp_regstr_appr_dtls 
     WHERE (object_id = $1 OR object_id = $2) AND attribute_1 = 'INVOICE'
     ORDER BY approved_date ASC NULLS LAST, id ASC`,
    [invoice.invoice_number, String(invoiceId)]
  );
  return result.rows;
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

export async function getUserDetails(userId: number) {
  const result = await getPool().query(
    `SELECT id, user_name, email_id, name, designation, department_name FROM dbo.um_user_dtls WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function getNextApprovalId() {
  const result = await getPool().query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM dbo.supp_regstr_appr_dtls`);
  return result.rows[0].next_id;
}

export async function insertInvoiceApprovalHistory(params: {
  id: number;
  objectId: string;
  comments: string;
  approverId: number;
  approverName: string;
  email: string;
  designation: string;
  status: string;
  requestedDate: Date;
  createdBy: string;
}) {
  await getPool().query(`
    INSERT INTO dbo.supp_regstr_appr_dtls 
    (object_id, supplier_id, comments, approver_id, approver_name, 
     attribute_9, attribute_10, status, requested_date, approved_date, 
     attribute_1, created_by, creation_date)
    VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8, NOW(), 'INVOICE', $9, NOW())
  `, [
    params.objectId, params.comments,
    params.approverId, params.approverName,
    params.email, params.designation,
    params.status, params.requestedDate,
    params.createdBy
  ]);
}

export async function getInvoiceSuppDocuments(invoiceId: string) {
  const result = await getPool().query(
    `SELECT id, doc_no, doc_name, doc_type, doc_desc, doc_path, filename, filetype,
            doc_value, status, record_type, supplier_id, category,
            created_by, creation_date, doc_uri
     FROM dbo.supp_document_dtls
     WHERE doc_no = $1 AND record_type = 'SUPP_INVOICE' AND (status IS NULL OR status = 'Active')
     ORDER BY creation_date ASC, id ASC`,
    [String(invoiceId)]
  );
  return result.rows;
}

export async function getSuppDocumentById(docId: number) {
  const result = await getPool().query(
    `SELECT id, doc_no, doc_name, doc_type, doc_desc, doc_path, filename, filetype,
            doc_value, status, record_type, supplier_id
     FROM dbo.supp_document_dtls
     WHERE id = $1`,
    [docId]
  );
  return result.rows[0] || null;
}

export async function getCollaborationDocumentById(docId: number) {
  const result = await getPool().query(
    `SELECT id, file_name, file_path FROM dbo.am_collaboration_attachment_dtls WHERE id = $1`,
    [docId]
  );
  return result.rows[0] || null;
}

export async function insertSuppDocumentDtl(params: {
  docNo: string;
  docName: string;
  docType: string;
  docValue: string;
  docDesc: string;
  docPath: string;
  fileName: string;
  status: string;
  recordType: string;
  supplierId: number | null;
  attribute5: string;
  createdBy: string;
  docUri?: Buffer | null;
}) {
  const id = Math.floor(Math.random() * (2000000000 - 100000000)) + 100000000;
  const result = await getPool().query(
    `INSERT INTO dbo.supp_document_dtls (
       id, doc_no, doc_name, doc_type, doc_value, doc_desc, doc_path, filename,
       status, record_type, supplier_id, attribute_5, doc_uri,
       created_by, creation_date, last_modified_by, last_modified_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$14,NOW())
     RETURNING id`,
    [
      id,
      params.docNo,
      params.docName,
      params.docType,
      params.docValue,
      params.docDesc,
      params.docPath,
      params.fileName,
      params.status,
      params.recordType,
      params.supplierId,
      params.attribute5,
      params.docUri || null,
      params.createdBy,
    ]
  );
  return result.rows[0].id;
}

export async function checkDuplicateInvoiceNumber(invoiceNumber: string, orgId?: number) {
  const params: any[] = [invoiceNumber];
  let query = `SELECT id, invoice_number, supplier_name, invoice_status FROM dbo.supp_invoice_dtls WHERE LOWER(invoice_number) = LOWER($1)`;
  if (orgId) {
    params.push(orgId);
    query += ` AND org_id = $${params.length}`;
  }
  query += ` LIMIT 1`;
  const result = await getPool().query(query, params);
  return result.rows[0] || null;
}

export async function getSupplierById(supplierId: number) {
  const result = await getPool().query(
    `SELECT id, company_name, email_id, payment_terms_id FROM dbo.supp_basic_org_dtls WHERE id = $1`,
    [supplierId]
  );
  return result.rows[0] || null;
}

export async function getSupplierFirstSite(supplierId: number) {
  const result = await getPool().query(
    `SELECT id FROM dbo.supp_site_dtls WHERE supplier_id = $1 ORDER BY id ASC LIMIT 1`,
    [supplierId]
  );
  return result.rows[0] || null;
}

export async function getPaymentTermById(termsId: number) {
  const result = await getPool().query(
    `SELECT id, terms_name, description FROM dbo.am_payment_terms_mst WHERE id = $1`,
    [termsId]
  );
  return result.rows[0] || null;
}

export async function getLookupValueByKey(key: string) {
  const result = await getPool().query(
    `SELECT description FROM dbo.am_lookup_params_dtls WHERE key_1 = $1 LIMIT 1`,
    [key]
  );
  return result.rows[0] || null;
}

export async function getOrgById(orgId: number) {
  const result = await getPool().query(
    `SELECT id, organization_name FROM dbo.um_org_dtls WHERE id = $1`,
    [orgId]
  );
  return result.rows[0] || null;
}

export async function getNextInvoiceNumber(orgId: number) {
  const prefixResult = await getPool().query(
    `SELECT prefix_value FROM dbo.am_prefix_mst
     WHERE UPPER(TRIM(prefix_name)) IN ('INVOICE', 'INV') AND status = 'Active' LIMIT 1`
  );
  const prefix = prefixResult.rows[0]?.prefix_value?.trim() || 'INV';

  const result = await getPool().query(
    `SELECT invoice_number FROM dbo.supp_invoice_dtls WHERE org_id = $1 ORDER BY creation_date DESC LIMIT 1`,
    [orgId]
  );
  if (result.rows.length === 0) return `${prefix}-000001`;
  const last = result.rows[0].invoice_number || `${prefix}-000000`;
  const numMatch = last.match(/(\d+)$/);
  if (!numMatch) return `${prefix}-000001`;
  const nextNum = parseInt(numMatch[1]) + 1;
  return `${prefix}-${String(nextNum).padStart(6, "0")}`;
}

export async function getTaskCreationDate(taskId: string): Promise<Date | null> {
  const result = await getPool().query(
    `SELECT create_time_ FROM dbo.act_ru_task WHERE id_ = $1
     UNION ALL
     SELECT start_time_ FROM dbo.act_hi_taskinst WHERE id_ = $1
     LIMIT 1`,
    [taskId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].create_time_ || result.rows[0].start_time_ || null;
}

export async function findPOByPONumber(poNumber: string, orgId?: number) {
  if (orgId != null && !Number.isNaN(Number(orgId))) {
    const scoped = await getPool().query(
      `SELECT * FROM dbo.supp_po_header_dtls WHERE po_number = $1 AND org_id = $2 LIMIT 1`,
      [poNumber, orgId]
    );
    if (scoped.rows[0]) return scoped.rows[0];
  }

  const result = await getPool().query(
    `SELECT * FROM dbo.supp_po_header_dtls WHERE po_number = $1 ORDER BY creation_date DESC NULLS LAST LIMIT 1`,
    [poNumber]
  );
  return result.rows[0] || null;
}

export async function getAllApprovedInvoicesByPONumber(poNumber: string) {
  const result = await getPool().query(
    `SELECT id, invoice_number, invoice_status, invoice_type, invoice_amount, tax_amount
     FROM dbo.supp_invoice_dtls 
     WHERE po_number = $1`,
    [poNumber]
  );
  return result.rows;
}

export async function updatePO(poNumber: string, data: {
  invoiced_amount?: number;
  attribute_9?: string;
  attribute_10?: string;
  po_status?: string;
}) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.invoiced_amount !== undefined) {
    fields.push(`invoiced_amount = $${idx}`);
    values.push(data.invoiced_amount);
    idx++;
  }
  if (data.attribute_9 !== undefined) {
    fields.push(`attribute_9 = $${idx}`);
    values.push(data.attribute_9);
    idx++;
  }
  if (data.attribute_10 !== undefined) {
    fields.push(`attribute_10 = $${idx}`);
    values.push(data.attribute_10);
    idx++;
  }
  if (data.po_status !== undefined) {
    fields.push(`po_status = $${idx}`);
    values.push(data.po_status);
    idx++;
  }

  if (fields.length === 0) return null;

  fields.push(`last_modified_date = NOW()`);
  values.push(poNumber);

  const result = await getPool().query(
    `UPDATE dbo.supp_po_header_dtls SET ${fields.join(", ")} WHERE po_number = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function getAllInvoicesByPONumber(poNumber: string) {
  const result = await getPool().query(
    `SELECT id, invoice_number, invoice_status, invoice_type, invoice_amount, tax_amount, invoice_amount_paid
     FROM dbo.supp_invoice_dtls 
     WHERE po_number = $1`,
    [poNumber]
  );
  return result.rows;
}

export async function prepayBusinessLogic(invoiceId: string, prepayInvNum: string, prepayApplyAmount: number) {
  const prepayInv = await getPool().query(
    `SELECT id, ppayment_amount, calc_prepay_amount FROM dbo.supp_invoice_dtls WHERE invoice_number = $1 LIMIT 1`,
    [prepayInvNum]
  );
  if (prepayInv.rows.length === 0) return;

  const prepayObj = prepayInv.rows[0];
  const currentCalcPrepay = parseFloat(prepayObj.calc_prepay_amount) || 0;
  const newCalcPrepay = currentCalcPrepay + prepayApplyAmount;

  await getPool().query(
    `UPDATE dbo.supp_invoice_dtls SET calc_prepay_amount = $1, last_modified_date = NOW() WHERE id = $2`,
    [newCalcPrepay, prepayObj.id]
  );
}
