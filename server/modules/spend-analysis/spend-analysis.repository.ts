import { pool } from "../../db";
import { getContextPool } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;

/** org_id / business_entity may be varchar or integer; cast to varchar before TRIM/compare */
export function orgFilter(col: string, orgId?: number): string {
  if (!orgId) return "";
  return `AND TRIM(CAST(${col} AS VARCHAR)) = '${orgId}'`;
}

export function entityFilter(orgId?: number): string {
  if (!orgId) return "";
  return `AND TRIM(CAST(business_entity AS VARCHAR)) = '${orgId}'`;
}

const STANDARD_INVOICE_FILTER = `
  invoice_status NOT IN ('Pending Approval','Rejected','Cancelled','REJECTED','CANCELLED')
  AND invoice_type IN ('STANDARD', 'Standard')
`;

/** Invoice spend filter shared by trend, department, supplier, YoY, and vendor concentration charts. */
function chartInvoiceSpendWhere(year?: number, orgId?: number, alias = ""): string {
  const p = alias ? `${alias}.` : "";
  const yearFilter = year ? `AND EXTRACT(YEAR FROM ${p}invoice_date) = ${year}` : "";
  return `
    ${p}invoice_status IN ('Paid','Partially Paid')
    AND ${p}invoice_date IS NOT NULL
    ${yearFilter} ${orgFilter(`${p}org_id`, orgId)}
  `;
}

function chartInvoiceSuppliersWhere(year?: number, orgId?: number, alias = ""): string {
  const p = alias ? `${alias}.` : "";
  const yearFilter = year ? `AND EXTRACT(YEAR FROM ${p}invoice_date) = ${year}` : "";
  return `
    ${p}invoice_status IN ('Approved', 'Completed', 'Closed','Paid')
    AND ${p}invoice_type IN ('STANDARD', 'Standard')
    AND ${p}invoice_date IS NOT NULL
    ${yearFilter} ${orgFilter(`${p}org_id`, orgId)}
  `;
}

function chartTotalInvoicesWhere(year?: number, orgId?: number, alias = ""): string {
  const p = alias ? `${alias}.` : "";
  const yearFilter = year ? `AND EXTRACT(YEAR FROM ${p}invoice_date) = ${year}` : "";
  return `
     ${p}invoice_date IS NOT NULL
     AND ${p}invoice_status IN ('Approved','Paid')
    ${yearFilter} ${orgFilter(`${p}org_id`, orgId)}
  `;
}

/** Invoice filter for PO vs Non-PO and maverick compliance charts. */
function complianceInvoiceSpendWhere(year?: number, orgId?: number): string {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM invoice_date) = ${year}` : "";
  return `
    invoice_status IN ('Partially Paid', 'Paid')
    ${yearFilter} ${orgFilter("org_id", orgId)}
  `;
}

function complianceInvoiceCountWhere(year?: number, orgId?: number): string {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM invoice_date) = ${year}` : "";
  return `
    invoice_status IN ('Approved', 'Partially Paid', 'Paid')
    ${yearFilter} ${orgFilter("org_id", orgId)}
  `;
}

/** Shared bid scope for spend analysis (includes Draft; excludes Deleted only). */
const BID_ANALYTICS_STATUS_FILTER = `b.status NOT IN ('Deleted')`;

function bidAnalyticsYearFilter(year?: number, alias = "b"): string {
  const p = alias ? `${alias}.` : "";
  return year ? `AND EXTRACT(YEAR FROM ${p}created_date) = ${year}` : "";
}

export async function getInvoiceAmountsByOrg(
  year?: number,
  orgId?: number,
  extraWhere = ""
): Promise<{ org_id: number; amount: number }[]> {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM COALESCE(invoice_date, creation_date)) = ${year}` : "";
  const result = await getPool().query(`
    SELECT org_id, COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as amount
    FROM dbo.supp_invoice_dtls
    WHERE ${STANDARD_INVOICE_FILTER} ${yearFilter} ${orgFilter("org_id", orgId)} ${extraWhere}
      AND org_id IS NOT NULL
    GROUP BY org_id
  `);
  return result.rows.map((r) => ({
    org_id: Number(r.org_id),
    amount: parseFloat(r.amount || "0"),
  }));
}

export async function getChartInvoiceAmountsByOrg(
  year?: number,
  orgId?: number,
  extraWhere = ""
): Promise<{ org_id: number; amount: number }[]> {
  const result = await getPool().query(`
    SELECT org_id, COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as amount
    FROM dbo.supp_invoice_dtls
    WHERE ${chartInvoiceSpendWhere(year, orgId)} ${extraWhere}
      AND org_id IS NOT NULL
    GROUP BY org_id
  `);
  return result.rows.map((r) => ({
    org_id: Number(r.org_id),
    amount: parseFloat(r.amount || "0"),
  }));
}

export async function getComplianceInvoiceAmountsByOrg(
  year?: number,
  orgId?: number,
  extraWhere = ""
): Promise<{ org_id: number; amount: number }[]> {
  const result = await getPool().query(`
    SELECT org_id, COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as amount
    FROM dbo.supp_invoice_dtls
    WHERE ${complianceInvoiceSpendWhere(year, orgId)} ${extraWhere}
      AND org_id IS NOT NULL
    GROUP BY org_id
  `);
  return result.rows.map((r) => ({
    org_id: Number(r.org_id),
    amount: parseFloat(r.amount || "0"),
  }));
}

function orgIdClause(orgId?: number, col = "org_id") {
  return orgFilter(col, orgId);
}

export async function getSpendBySupplierGrouped(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT org_id, COALESCE(supplier_name, 'Unknown') as name,
      COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as value
    FROM dbo.supp_invoice_dtls
    WHERE ${chartInvoiceSpendWhere(year, orgId)}
      AND org_id IS NOT NULL
    GROUP BY org_id, supplier_name
  `);
  return result.rows;
}

export async function getSpendByDepartmentGrouped(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT org_id, COALESCE(department_name, 'Unassigned') as name,
      COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as value
    FROM dbo.supp_invoice_dtls
    WHERE ${chartInvoiceSpendWhere(year, orgId)}
      AND department_name IS NOT NULL AND department_name != ''
      AND org_id IS NOT NULL
    GROUP BY org_id, department_name
  `);
  return result.rows;
}

export async function getSpendTrendGrouped(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT org_id,
      TO_CHAR(invoice_date, 'Mon YYYY') as month,
      EXTRACT(YEAR FROM invoice_date) as yr,
      EXTRACT(MONTH FROM invoice_date) as mn,
      COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as spend,
      COUNT(*) as inv_count
    FROM dbo.supp_invoice_dtls
    WHERE ${chartInvoiceSpendWhere(year, orgId)}
      AND org_id IS NOT NULL
    GROUP BY org_id, TO_CHAR(invoice_date, 'Mon YYYY'), EXTRACT(YEAR FROM invoice_date), EXTRACT(MONTH FROM invoice_date)
    ORDER BY yr, mn
  `);
  return result.rows;
}

export async function getSpendByCategoryGrouped(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM h.po_issue_date) = ${year}` : "";
  const result = await getPool().query(`
    SELECT h.org_id,
      COALESCE(l.product_category_name, 'Uncategorized') as name,
      COALESCE(SUM(CAST(l.line_cost AS NUMERIC)), 0) as value
    FROM dbo.supp_po_line_dtls l
    JOIN dbo.supp_po_header_dtls h ON l.po_number = h.po_number
    WHERE h.po_status NOT IN ('Draft','Pending Approval','Rejected','Cancelled','DRAFT','CANCELLED','REJECTED')
      ${yearFilter} ${orgIdClause(orgId, "h.org_id")}
      AND h.org_id IS NOT NULL
    GROUP BY h.org_id, l.product_category_name
  `);
  return result.rows;
}

export async function getPoVsNonPoGrouped(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT org_id,
      CASE WHEN po_number IS NOT NULL AND po_number != '' THEN 'PO-Based' ELSE 'Non-PO' END as spend_type,
      COUNT(*) as inv_count,
      COALESCE(SUM(invoice_amount),0) + COALESCE(SUM(tax_amount),0) as total_spend
    FROM dbo.supp_invoice_dtls
    WHERE ${complianceInvoiceSpendWhere(year, orgId)}
      AND org_id IS NOT NULL
    GROUP BY org_id, CASE WHEN po_number IS NOT NULL AND po_number != '' THEN 'PO-Based' ELSE 'Non-PO' END
  `);
  return result.rows;
}

export async function getSpendByCurrencyGrouped(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM po_issue_date) = ${year}` : "";
  const result = await getPool().query(`
    SELECT org_id, COALESCE(po_currency, 'Unknown') as currency,
      COALESCE(SUM(CAST(po_net_cost AS NUMERIC)),0) as total_spend,
      COUNT(*) as po_count
    FROM dbo.supp_po_header_dtls
    WHERE po_status NOT IN ('Draft','Rejected','Cancelled')
      AND po_currency IS NOT NULL AND po_currency != ''
      ${yearFilter} ${orgIdClause(orgId)}
      AND org_id IS NOT NULL
    GROUP BY org_id, po_currency
  `);
  return result.rows;
}

export async function getPoNetCostByOrg(
  year?: number,
  orgId?: number,
  extraWhere = ""
): Promise<{ org_id: number; amount: number }[]> {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM po_issue_date) = ${year}` : "";
  const result = await getPool().query(`
    SELECT org_id, COALESCE(SUM(CAST(po_net_cost AS NUMERIC)), 0) as amount
    FROM dbo.supp_po_header_dtls
    WHERE po_status NOT IN ('Draft','Pending Approval','Rejected','Cancelled','DRAFT','CANCELLED','REJECTED')
      ${yearFilter} ${orgFilter("org_id", orgId)} ${extraWhere}
      AND org_id IS NOT NULL
    GROUP BY org_id
  `);
  return result.rows.map((r) => ({
    org_id: Number(r.org_id),
    amount: parseFloat(r.amount || "0"),
  }));
}

export async function getBudgetAmountsByEntity(
  year?: number,
  orgId?: number
): Promise<
  { business_entity: string; budget_curr: string | null; budget: number; consumed: number; reserved: number; name?: string }[]
> {
  const yearFilter = year
    ? `AND EXTRACT(YEAR FROM start_date) <= ${year} AND EXTRACT(YEAR FROM end_date) >= ${year}`
    : "";
  const orgF = entityFilter(orgId);
  const result = await getPool().query(`
    SELECT
      business_entity,
      budget_curr,
      budget_name as name,
      COALESCE(budget_amount, 0) as budget,
      COALESCE(consumed_amount, 0) as consumed,
      COALESCE(reserved_amount, 0) as reserved
    FROM dbo.am_budget_mst
    WHERE budget_amount IS NOT NULL AND budget_amount > 0 AND status = 'Approved' ${yearFilter} ${orgF}
  `);
  return result.rows.map((r) => ({
    business_entity: r.business_entity,
    budget_curr: r.budget_curr,
    name: r.name,
    budget: parseFloat(r.budget || "0"),
    consumed: parseFloat(r.consumed || "0"),
    reserved: parseFloat(r.reserved || "0"),
  }));
}

export async function getBudgetSummary(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM start_date) <= ${year} AND EXTRACT(YEAR FROM end_date) >= ${year}` : "";
  const orgF = entityFilter(orgId);
  const result = await getPool().query(`
    SELECT 
      COALESCE(SUM(CAST(budget_amount AS NUMERIC)), 0) as total_budget,
      COALESCE(SUM(CAST(consumed_amount AS NUMERIC)), 0) as total_consumed,
      COALESCE(SUM(CAST(reserved_amount AS NUMERIC)), 0) as total_reserved
    FROM dbo.am_budget_mst
    WHERE budget_amount IS NOT NULL AND budget_amount > 0 AND status = 'Approved' ${yearFilter} ${orgF}
  `);
  const r = result.rows[0];
  const totalBudget = parseFloat(r?.total_budget || "0");
  const totalConsumed = parseFloat(r?.total_consumed || "0");
  const totalReserved = parseFloat(r?.total_reserved || "0");
  const available = totalBudget - totalConsumed - totalReserved;
  const consumedPct = totalBudget > 0 ? ((totalConsumed / totalBudget) * 100) : 0;
  const reservedPct = totalBudget > 0 ? ((totalReserved / totalBudget) * 100) : 0;
  const availablePct = totalBudget > 0 ? ((available / totalBudget) * 100) : 0;

  return {
    totalBudget,
    totalConsumed,
    totalReserved,
    available,
    consumedPct: Math.round(consumedPct * 100) / 100,
    reservedPct: Math.round(reservedPct * 100) / 100,
    availablePct: Math.round(availablePct * 100) / 100,
  };
}

export async function getConsumedAmount(type: string, year?: number, orgId?: number): Promise<number> {
  if (type === "po") {
    const result = await getPool().query(`
      SELECT COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as value
      FROM dbo.supp_invoice_dtls
      WHERE po_number IS NOT NULL AND po_number != ''
        AND ${complianceInvoiceSpendWhere(year, orgId)}
    `);
    return parseFloat(result.rows[0]?.value || "0");
  } else if (type === "non-po") {
    const result = await getPool().query(`
      SELECT COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as value
      FROM dbo.supp_invoice_dtls
      WHERE (po_number IS NULL OR po_number = '')
        AND ${complianceInvoiceSpendWhere(year, orgId)}
    `);
    return parseFloat(result.rows[0]?.value || "0");
  } else {
    const poAmount: number = await getConsumedAmount("po", year, orgId);
    const nonPoAmount: number = await getConsumedAmount("non-po", year, orgId);
    return poAmount + nonPoAmount;
  }
}

export async function getSummaryStats(year?: number, orgId?: number) {
  const yearFilterPO = year ? `AND EXTRACT(YEAR FROM COALESCE(po_issue_date, creation_date)) = ${year}` : "";
  const yearFilterPR = year ? `AND EXTRACT(YEAR FROM COALESCE(pr_created_date, creation_date)) = ${year}` : "";
  const yearFilterUsers = year ? `WHERE EXTRACT(YEAR FROM creation_date) = ${year}` : "";

  const [spend, suppliers, prs, pos, invoices, users] = await Promise.all([
    getPool().query(`
      SELECT COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as total_spend
      FROM dbo.supp_invoice_dtls
      WHERE ${chartInvoiceSpendWhere(year, orgId)}
    `),
    getPool().query(`
      SELECT COUNT(DISTINCT supplier_id) as count
      FROM dbo.supp_invoice_dtls
      WHERE ${chartInvoiceSuppliersWhere(year, orgId)}
        AND supplier_id IS NOT NULL
    `),
    getPool().query(`
      SELECT COUNT(*) as count FROM dbo.supp_pr_header_dtls
      WHERE 1=1 AND pr_status IN ('Approved', 'Complete', 'Closed') ${yearFilterPR} ${orgFilter('org_id', orgId)}
    `),
    getPool().query(`
      SELECT COUNT(*) as count FROM dbo.supp_po_header_dtls
      WHERE 1=1 AND po_status IN ('Approved', 'Complete', 'Closed') ${yearFilterPO} ${orgFilter('org_id', orgId)}
    `),
    getPool().query(`
      SELECT COUNT(*) as count FROM dbo.supp_invoice_dtls
      WHERE ${chartTotalInvoicesWhere(year, orgId)}
    `),
    getPool().query(`SELECT 
      COUNT(*) FILTER (WHERE user_status = 1) as total_users,
      COUNT(*) FILTER (WHERE user_type = 0 AND user_status = 1) as company_users,
      COUNT(*) FILTER (WHERE user_type = 1 AND user_status = 1) as supplier_users
      FROM dbo.um_user_dtls ${yearFilterUsers}`),
  ]);

  return {
    totalSpend: parseFloat(spend.rows[0]?.total_spend || "0"),
    totalSuppliers: parseInt(suppliers.rows[0]?.count || "0"),
    totalPRs: parseInt(prs.rows[0]?.count || "0"),
    totalPOs: parseInt(pos.rows[0]?.count || "0"),
    totalInvoices: parseInt(invoices.rows[0]?.count || "0"),
    totalUsers: parseInt(users.rows[0]?.total_users || "0"),
    companyUsers: parseInt(users.rows[0]?.company_users || "0"),
    supplierUsers: parseInt(users.rows[0]?.supplier_users || "0"),
  };
}

export async function getBudgetVsSpend(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM start_date) <= ${year} AND EXTRACT(YEAR FROM end_date) >= ${year}` : "";
  const orgF = entityFilter(orgId);
  const result = await getPool().query(`
    SELECT 
      budget_name as name,
      COALESCE(budget_amount, 0) as budget,
      COALESCE(consumed_amount, 0) as spend
    FROM dbo.am_budget_mst 
    WHERE budget_amount IS NOT NULL AND budget_amount > 0 AND status = 'Approved' ${yearFilter} ${orgF}
    ORDER BY budget_amount DESC
    LIMIT 12
  `);
  return result.rows.map(r => ({
    name: r.name?.length > 20 ? r.name.substring(0, 20) + "…" : r.name,
    budget: parseFloat(r.budget || "0"),
    spend: parseFloat(r.spend || "0"),
  }));
}

export async function getSpendByCategory(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM h.po_issue_date) = ${year}` : "";
  const result = await getPool().query(`
    SELECT 
      COALESCE(l.product_category_name, 'Uncategorized') as name,
      COALESCE(SUM(CAST(l.line_cost AS NUMERIC)), 0) as value
    FROM dbo.supp_po_line_dtls l
    JOIN dbo.supp_po_header_dtls h ON l.po_number = h.po_number
    WHERE h.po_status NOT IN ('Draft','Pending Approval','Rejected','Cancelled','DRAFT','CANCELLED','REJECTED') ${yearFilter} ${orgFilter('h.org_id', orgId)}
    GROUP BY l.product_category_name
    ORDER BY value DESC
    LIMIT 10
  `);
  return result.rows.map(r => ({
    name: r.name?.length > 25 ? r.name.substring(0, 25) + "…" : r.name,
    value: parseFloat(r.value || "0"),
  }));
}

export async function getSpendBySupplier(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      COALESCE(supplier_name, 'Unknown') as name,
      COUNT(*) as inv_count,
      COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as value
    FROM dbo.supp_invoice_dtls
    WHERE ${chartInvoiceSpendWhere(year, orgId)}
    GROUP BY supplier_name
    ORDER BY value DESC
    LIMIT 10
  `);
  return result.rows.map(r => ({
    name: r.name?.length > 25 ? r.name.substring(0, 25) + "…" : r.name,
    value: parseFloat(r.value || "0"),
  }));
}

export async function getSpendBySupplierInDateRange(
  fromDate: string,
  toDate?: string,
  orgId?: number,
  limit = 25,
) {
  const result = await getPool().query(
    `
    SELECT
      COALESCE(supplier_name, 'Unknown') as name,
      COUNT(*) as inv_count,
      COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as value
    FROM dbo.supp_invoice_dtls
    WHERE ${chartInvoiceSpendWhere(undefined, orgId)}
      AND invoice_date >= $1::date
      ${toDate ? "AND invoice_date <= $2::date" : ""}
    GROUP BY supplier_name
    ORDER BY value DESC
    LIMIT ${toDate ? "$3" : "$2"}
  `,
    toDate ? [fromDate, toDate, limit] : [fromDate, limit],
  );
  return result.rows.map((r) => ({
    name: r.name?.length > 25 ? r.name.substring(0, 25) + "…" : r.name,
    value: parseFloat(r.value || "0"),
  }));
}

export async function getSpendByDepartment(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      COALESCE(department_name, 'Unassigned') as name,
      COUNT(*) as inv_count,
      COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as value
    FROM dbo.supp_invoice_dtls
    WHERE ${chartInvoiceSpendWhere(year, orgId)}
      AND department_name IS NOT NULL AND department_name != ''
    GROUP BY department_name
    ORDER BY value DESC
    LIMIT 10
  `);
  return result.rows.map(r => ({
    name: r.name?.length > 20 ? r.name.substring(0, 20) + "…" : r.name,
    value: parseFloat(r.value || "0"),
  }));
}

export async function getSpendTrend(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      TO_CHAR(invoice_date, 'Mon YYYY') as month,
      EXTRACT(YEAR FROM invoice_date) as yr,
      EXTRACT(MONTH FROM invoice_date) as mn,
      COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as spend,
      COUNT(*) as inv_count
    FROM dbo.supp_invoice_dtls
    WHERE ${chartInvoiceSpendWhere(year, orgId)}
    GROUP BY TO_CHAR(invoice_date, 'Mon YYYY'), EXTRACT(YEAR FROM invoice_date), EXTRACT(MONTH FROM invoice_date)
    ORDER BY yr, mn
  `);
  return result.rows.map(r => ({
    month: r.month,
    spend: parseFloat(r.spend || "0"),
    poCount: parseInt(r.inv_count || "0"),
  }));
}

export async function getPoStatusDistribution(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM po_issue_date) = ${year}` : "";
  const result = await getPool().query(`
    SELECT 
      COALESCE(po_status, 'Unknown') as name,
      COUNT(*) as value
    FROM dbo.supp_po_header_dtls
    WHERE 1=1 ${yearFilter} ${orgFilter('org_id', orgId)}
    GROUP BY po_status
    ORDER BY value DESC
  `);
  return result.rows.map(r => ({
    name: r.name,
    value: parseInt(r.value || "0"),
  }));
}

export async function getAvailableYears() {
  const result = await getPool().query(`
    SELECT DISTINCT EXTRACT(YEAR FROM creation_date)::int as year
    FROM dbo.supp_po_header_dtls
    WHERE creation_date IS NOT NULL
    ORDER BY year DESC
  `);
  return result.rows.map(r => r.year);
}

export async function getPurchaseCycleTime(orgId?: number) {
  const results: Record<string, number> = {
    prToPo: 0,
    poToPoConf: 0,
    poToDelivery: 0,
    deliveryToInvoice: 0,
    invoiceToPayment: 0,
  };

  try {
    const prToPo = await getPool().query(`
      SELECT AVG(DATE_PART('day', po.creation_date - pr.pr_created_date)) as avg_days
      FROM dbo.supp_pr_header_dtls pr
      JOIN dbo.supp_po_header_dtls po ON pr.pr_number = po.pr_number
      WHERE pr.pr_created_date IS NOT NULL AND po.creation_date IS NOT NULL ${orgFilter('po.org_id', orgId)}
    `);
    results.prToPo = Math.round(parseFloat(prToPo.rows[0]?.avg_days || "0"));

    const poToConf = await getPool().query(`
      SELECT AVG(DATE_PART('day', po_issue_date - creation_date)) as avg_days
      FROM dbo.supp_po_header_dtls
      WHERE po_status != 'Rejected' AND po_issue_date IS NOT NULL AND creation_date IS NOT NULL ${orgFilter('org_id', orgId)}
    `);
    results.poToPoConf = Math.round(parseFloat(poToConf.rows[0]?.avg_days || "0"));

    const poToDel = await getPool().query(`
      SELECT AVG(DATE_PART('day', grn_date - po.po_issue_date)) as avg_days
      FROM dbo.supp_po_header_dtls po
      JOIN (
        SELECT po_number, MAX(creation_date) as grn_date
        FROM dbo.supp_po_grn_line_dtls
        GROUP BY po_number
      ) g ON g.po_number = po.po_number
      WHERE po.attribute_8 = 'Received' AND po.po_issue_date IS NOT NULL ${orgFilter('po.org_id', orgId)}
    `);
    results.poToDelivery = Math.round(parseFloat(poToDel.rows[0]?.avg_days || "0"));

    const delToInv = await getPool().query(`
      SELECT AVG(DATE_PART('day', inv_date - grn_date)) as avg_days
      FROM dbo.supp_po_header_dtls po
      JOIN (
        SELECT po_number, MAX(creation_date) as grn_date
        FROM dbo.supp_po_grn_line_dtls
        GROUP BY po_number
      ) g ON g.po_number = po.po_number
      JOIN (
        SELECT po_number, MAX(creation_date) as inv_date
        FROM dbo.supp_invoice_dtls
        WHERE po_number IS NOT NULL
        GROUP BY po_number
      ) i ON i.po_number = po.po_number
      WHERE po.attribute_9 = 'Invoiced' ${orgFilter('po.org_id', orgId)}
    `);
    results.deliveryToInvoice = Math.round(parseFloat(delToInv.rows[0]?.avg_days || "0"));

    const invToPay = await getPool().query(`
      SELECT AVG(DATE_PART('day', b.payment_date - a.invoice_date)) as avg_days
      FROM dbo.supp_invoice_dtls a
      JOIN dbo.supp_invoice_payment_dtls b ON a.id = b.invid
      WHERE a.invoice_status = 'Paid' AND b.payment_date IS NOT NULL AND a.invoice_date IS NOT NULL ${orgFilter('a.org_id', orgId)}
    `);
    results.invoiceToPayment = Math.max(0, Math.round(parseFloat(invToPay.rows[0]?.avg_days || "0")));
  } catch (e) {
    console.error("Error calculating purchase cycle time:", e);
  }

  return results;
}

export async function getLatePaymentPercent(orgId?: number) {
  try {
    const paid = await getPool().query(`SELECT COUNT(*) as cnt FROM dbo.supp_invoice_dtls WHERE invoice_status = 'Paid' ${orgFilter('org_id', orgId)}`);
    const late = await getPool().query(`
      SELECT COUNT(*) as cnt
      FROM dbo.supp_invoice_dtls a
      JOIN dbo.supp_invoice_payment_dtls b ON a.id = b.invid
      WHERE a.invoice_status = 'Paid' AND a.inv_due_date < b.payment_date ${orgFilter('a.org_id', orgId)}
    `);
    const paidCount = parseInt(paid.rows[0]?.cnt || "0");
    const lateCount = parseInt(late.rows[0]?.cnt || "0");
    if (paidCount === 0) return { percent: 0, lateCount: 0, paidCount: 0 };
    return {
      percent: Math.round((lateCount / paidCount) * 1000) / 10,
      lateCount,
      paidCount,
    };
  } catch (e) {
    console.error("Error calculating late payment %:", e);
    return { percent: 0, lateCount: 0, paidCount: 0 };
  }
}

export async function getInvoiceStatusCounts(orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      COALESCE(invoice_status, 'Unknown') as status,
      COUNT(*) as count
    FROM dbo.supp_invoice_dtls
    WHERE 1=1 ${orgFilter('org_id', orgId)}
    GROUP BY invoice_status
    ORDER BY count DESC
  `);
  return result.rows.map(r => ({
    name: r.status,
    value: parseInt(r.count || "0"),
  }));
}

export async function getOpenPOAging(orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      CASE
        WHEN DATE_PART('day', NOW() - po_issue_date) <= 30 THEN '0-30 Days'
        WHEN DATE_PART('day', NOW() - po_issue_date) <= 60 THEN '31-60 Days'
        WHEN DATE_PART('day', NOW() - po_issue_date) <= 90 THEN '61-90 Days'
        WHEN DATE_PART('day', NOW() - po_issue_date) <= 120 THEN '91-120 Days'
        ELSE '120+ Days'
      END as aging_bucket,
      COUNT(*) as count,
      COALESCE(SUM(CAST(po_net_cost AS NUMERIC)), 0) as total_value
    FROM dbo.supp_po_header_dtls
    WHERE po_status NOT IN ('FINALLY CLOSED','CLOSED','CANCELLED','Draft','Rejected')
      AND po_issue_date IS NOT NULL ${orgFilter('org_id', orgId)}
    GROUP BY aging_bucket
    ORDER BY MIN(DATE_PART('day', NOW() - po_issue_date))
  `);
  return result.rows.map(r => ({
    name: r.aging_bucket,
    count: parseInt(r.count || "0"),
    value: parseFloat(r.total_value || "0"),
  }));
}

export async function getUninvoicedGRNs(orgId?: number) {
  const result = await getPool().query(`
    SELECT COUNT(*) as count,
      COALESCE(SUM(CAST(loaded_cost AS NUMERIC)), 0) as total_value
    FROM dbo.supp_po_grn_line_dtls
    WHERE (status NOT IN ('Invoice Submitted') OR status IS NULL)
      AND loaded_cost IS NOT NULL AND CAST(loaded_cost AS NUMERIC) > 0
      ${orgFilter('org_id', orgId)}
  `);
  return {
    count: parseInt(result.rows[0]?.count || "0"),
    totalValue: parseFloat(result.rows[0]?.total_value || "0"),
  };
}

export async function getTopApprovers(orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      approver_name as name,
      COUNT(*) as approval_count,
      AVG(DATE_PART('day', approved_date - requested_date)) as avg_days
    FROM dbo.supp_regstr_appr_dtls
    WHERE approved_date IS NOT NULL AND requested_date IS NOT NULL
      AND approver_name IS NOT NULL
    GROUP BY approver_name
    ORDER BY approval_count DESC
    LIMIT 10
  `);
  return result.rows.map(r => ({
    name: r.name?.length > 25 ? r.name.substring(0, 25) + "…" : r.name,
    approvalCount: parseInt(r.approval_count || "0"),
    avgDays: Math.round(parseFloat(r.avg_days || "0") * 10) / 10,
  }));
}

export async function getSupplierActivityStats(orgId?: number) {
  const result = await getPool().query(`
    SELECT Action_Date, MAX(Invoices) AS invoices, MAX(bid_responses) AS bid_responses, MAX(registrations) AS registrations
    FROM (
      SELECT COUNT(*) AS Invoices, 0 AS bid_responses, 0 AS registrations,
        CAST(creation_date AS DATE) AS Action_Date
      FROM dbo.supp_invoice_dtls
      WHERE creation_date >= CURRENT_DATE - INTERVAL '15 days' AND po_number IS NOT NULL
      ${orgFilter('org_id', orgId)}
      GROUP BY CAST(creation_date AS DATE)
      UNION ALL
      SELECT 0, COUNT(*), 0, CAST(creation_date AS DATE)
      FROM dbo.supp_bid_response_dtls
      WHERE creation_date >= CURRENT_DATE - INTERVAL '15 days'
      GROUP BY CAST(creation_date AS DATE)
    ) a GROUP BY Action_Date ORDER BY Action_Date
  `);
  return result.rows.map(r => ({
    date: r.action_date,
    invoices: parseInt(r.invoices || "0"),
    bidResponses: parseInt(r.bid_responses || "0"),
    registrations: parseInt(r.registrations || "0"),
  }));
}

export async function getPOYearTrend(orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      EXTRACT(YEAR FROM po_issue_date)::int as year,
      EXTRACT(QUARTER FROM po_issue_date)::int as quarter,
      COALESCE(SUM(CAST(po_total_cost AS NUMERIC)), 0) as total_cost,
      COUNT(*) as po_count
    FROM dbo.supp_po_header_dtls
    WHERE po_issue_date IS NOT NULL
      AND po_issue_date > CURRENT_DATE - INTERVAL '3 years'
      ${orgFilter('org_id', orgId)}
    GROUP BY EXTRACT(YEAR FROM po_issue_date), EXTRACT(QUARTER FROM po_issue_date)
    ORDER BY 1, 2
  `);

  const yearMap: Record<string, { year: string; q1: number; q2: number; q3: number; q4: number }> = {};
  for (const r of result.rows) {
    const yr = r.year.toString();
    if (!yearMap[yr]) yearMap[yr] = { year: yr, q1: 0, q2: 0, q3: 0, q4: 0 };
    const key = `q${r.quarter}` as "q1" | "q2" | "q3" | "q4";
    yearMap[yr][key] = parseFloat(r.total_cost || "0");
  }
  return Object.values(yearMap);
}

export async function getAvgApprovalDays(orgId?: number) {
  try {
    const result = await getPool().query(`
      SELECT 
        attribute_1 as entity_type,
        AVG(DATE_PART('day', MAX_APPROVED - MIN_REQUESTED)) as avg_days
      FROM (
        SELECT 
          object_id,
          attribute_1,
          MAX(approved_date) as MAX_APPROVED,
          MIN(requested_date) as MIN_REQUESTED
        FROM dbo.supp_regstr_appr_dtls
        WHERE approved_date IS NOT NULL AND requested_date IS NOT NULL
        GROUP BY object_id, attribute_1
      ) sub
      WHERE attribute_1 IS NOT NULL
      GROUP BY attribute_1
    `);
    return result.rows.map(r => ({
      entityType: r.entity_type,
      avgDays: Math.round(parseFloat(r.avg_days || "0") * 10) / 10,
    }));
  } catch (e) {
    console.error("Error calculating avg approval days:", e);
    return [];
  }
}

export async function getPoVsNonPoSpend(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      CASE WHEN po_number IS NOT NULL AND po_number != '' THEN 'PO-Based' ELSE 'Non-PO' END as spend_type,
      COUNT(*) as inv_count,
      COALESCE(SUM(invoice_amount),0) + COALESCE(SUM(tax_amount),0) as total_spend
    FROM dbo.supp_invoice_dtls
    WHERE ${complianceInvoiceSpendWhere(year, orgId)}
    GROUP BY CASE WHEN po_number IS NOT NULL AND po_number != '' THEN 'PO-Based' ELSE 'Non-PO' END
  `);
  return result.rows.map(r => ({
    name: r.spend_type,
    value: parseFloat(r.total_spend || "0"),
    count: parseInt(r.inv_count || "0"),
  }));
}

export async function getSpendByCurrency(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM po_issue_date) = ${year}` : "";
  const result = await getPool().query(`
    SELECT 
      COALESCE(po_currency, 'Unknown') as currency,
      COUNT(*) as po_count,
      COALESCE(SUM(CAST(po_net_cost AS NUMERIC)),0) as total_spend
    FROM dbo.supp_po_header_dtls
    WHERE po_status NOT IN ('Draft','Rejected','Cancelled')
      AND po_currency IS NOT NULL AND po_currency != ''
      ${yearFilter} ${orgFilter('org_id', orgId)}
    GROUP BY po_currency
    ORDER BY total_spend DESC
  `);
  return result.rows.map(r => ({
    name: r.currency,
    value: parseFloat(r.total_spend || "0"),
    count: parseInt(r.po_count || "0"),
  }));
}

export async function getSavingsAnalysis(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM po.po_issue_date) = ${year}` : "";
  const result = await getPool().query(`
    SELECT 
      COALESCE(SUM(pr.pr_amount), 0) as total_estimated,
      COALESCE(SUM(CAST(po.po_net_cost AS NUMERIC)), 0) as total_actual,
      COUNT(DISTINCT pr.pr_number) as pr_count
    FROM dbo.supp_pr_header_dtls pr
    JOIN dbo.supp_po_header_dtls po ON po.pr_number = pr.pr_number
    WHERE pr.pr_status NOT IN ('Draft','Rejected','Cancelled')
      AND po.po_status NOT IN ('Draft','Rejected','Cancelled')
      AND pr.pr_amount IS NOT NULL AND pr.pr_amount > 0
      ${yearFilter} ${orgFilter('po.org_id', orgId)}
  `);
  const estimated = parseFloat(result.rows[0]?.total_estimated || "0");
  const actual = parseFloat(result.rows[0]?.total_actual || "0");
  const savings = estimated - actual;
  const pct = estimated > 0 ? Math.round((savings / estimated) * 1000) / 10 : 0;
  return {
    estimated,
    actual,
    savings,
    savingsPercent: pct,
    prCount: parseInt(result.rows[0]?.pr_count || "0"),
  };
}

export async function getContractVsSpotSpend(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM po_issue_date) = ${year}` : "";
  const result = await getPool().query(`
    SELECT 
      CASE 
        WHEN is_contract_exists = 'true' OR is_contract_exists = 'Y' OR (contract_ref_no IS NOT NULL AND contract_ref_no != '') THEN 'Contract'
        ELSE 'Spot Buy'
      END as spend_type,
      COUNT(*) as po_count,
      COALESCE(SUM(CAST(po_net_cost AS NUMERIC)),0) as total_spend
    FROM dbo.supp_po_header_dtls
    WHERE po_status NOT IN ('Draft','Rejected','Cancelled')
      ${yearFilter} ${orgFilter('org_id', orgId)}
    GROUP BY CASE 
      WHEN is_contract_exists = 'true' OR is_contract_exists = 'Y' OR (contract_ref_no IS NOT NULL AND contract_ref_no != '') THEN 'Contract'
      ELSE 'Spot Buy'
    END
  `);
  return result.rows.map(r => ({
    name: r.spend_type,
    value: parseFloat(r.total_spend || "0"),
    count: parseInt(r.po_count || "0"),
  }));
}

export async function getMaverickSpend(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      COUNT(*) as total_invoices,
      COUNT(CASE WHEN po_number IS NULL OR po_number = '' THEN 1 END) as maverick_count
    FROM dbo.supp_invoice_dtls
    WHERE ${complianceInvoiceCountWhere(year, orgId)}
  `);
  const spendResult = await getPool().query(`
    SELECT 
    COALESCE(SUM(invoice_amount + COALESCE(tax_amount,0)),0) as total_spend,
      COALESCE(SUM(CASE WHEN po_number IS NULL OR po_number = '' THEN invoice_amount + COALESCE(tax_amount,0) ELSE 0 END),0) as maverick_spend
    FROM dbo.supp_invoice_dtls
    WHERE ${complianceInvoiceSpendWhere(year, orgId)}
    `);
  const total = parseFloat(spendResult.rows[0]?.total_spend || "0");
  const maverick = parseFloat(spendResult.rows[0]?.maverick_spend || "0");
  const pct = total > 0 ? Math.round((maverick / total) * 1000) / 10 : 0;
  return {
    totalInvoices: parseInt(result.rows[0]?.total_invoices || "0"),
    maverickCount: parseInt(result.rows[0]?.maverick_count || "0"),
    totalSpend: total,
    maverickSpend: maverick,
    maverickPercent: pct,
  };
}

export async function getBidSavingsSummary(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      COUNT(CASE WHEN b.status IN ('Awarded', 'Award Under Process') THEN 1 END) as total_bids,
      COUNT(CASE WHEN b.status = 'Awarded' THEN 1 END) as awarded_bids,
      COUNT(CASE WHEN b.status = 'Closed' THEN 1 END) as closed_bids,
      COUNT(CASE WHEN b.status IN ('Award Under Process') THEN 1 END) as in_progress_bids,
      COUNT(CASE WHEN b.type = 'RFQ' THEN 1 END) as rfq_count,
      COUNT(CASE WHEN b.type = 'Tender' THEN 1 END) as tender_count,
      COUNT(CASE WHEN b.type = 'RFP' THEN 1 END) as rfp_count,
      COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.pr_amount IS NOT NULL AND CAST(b.pr_amount AS NUMERIC) > 0 THEN CAST(b.pr_amount AS NUMERIC) ELSE 0 END), 0) as total_estimated,
      COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.awarded_amount IS NOT NULL THEN b.awarded_amount ELSE 0 END), 0) as total_awarded,
      COUNT(DISTINCT CASE WHEN b.status = 'Awarded' THEN b.id END) as awarded_with_amounts
    FROM dbo.supp_bid_dtls b
    WHERE ${BID_ANALYTICS_STATUS_FILTER}
      ${bidAnalyticsYearFilter(year)} ${orgFilter('b.org_id', orgId)}
  `);
  const r = result.rows[0];
  const estimated = parseFloat(r?.total_estimated || "0");
  const awarded = parseFloat(r?.total_awarded || "0");
  const savings = estimated > 0 ? estimated - awarded : 0;
  const savingsPercent = estimated > 0 ? Math.round((savings / estimated) * 1000) / 10 : 0;
  return {
    totalBids: parseInt(r?.total_bids || "0"),
    awardedBids: parseInt(r?.awarded_bids || "0"),
    closedBids: parseInt(r?.closed_bids || "0"),
    inProgressBids: parseInt(r?.in_progress_bids || "0"),
    rfqCount: parseInt(r?.rfq_count || "0"),
    tenderCount: parseInt(r?.tender_count || "0"),
    rfpCount: parseInt(r?.rfp_count || "0"),
    totalEstimated: estimated,
    totalAwarded: awarded,
    savings,
    savingsPercent,
  };
}

export async function getBidSavingsByType(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      COALESCE(NULLIF(TRIM(b.type), ''), 'Other') as type,
      COUNT(*) as bid_count,
      COUNT(CASE WHEN b.status = 'Awarded' THEN 1 END) as awarded_count,
      COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.pr_amount IS NOT NULL AND CAST(b.pr_amount AS NUMERIC) > 0 THEN CAST(b.pr_amount AS NUMERIC) ELSE 0 END), 0) as estimated,
      COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.awarded_amount IS NOT NULL THEN b.awarded_amount ELSE 0 END), 0) as awarded
    FROM dbo.supp_bid_dtls b
    WHERE ${BID_ANALYTICS_STATUS_FILTER}
      ${bidAnalyticsYearFilter(year)} ${orgFilter('b.org_id', orgId)}
    GROUP BY COALESCE(NULLIF(TRIM(b.type), ''), 'Other')
    ORDER BY estimated DESC
  `);
  return result.rows.map(r => {
    const est = parseFloat(r.estimated || "0");
    const awd = parseFloat(r.awarded || "0");
    const sav = est > 0 ? est - awd : 0;
    return {
      type: r.type,
      bidCount: parseInt(r.bid_count || "0"),
      awardedCount: parseInt(r.awarded_count || "0"),
      estimated: est,
      awarded: awd,
      savings: sav,
      savingsPercent: est > 0 ? Math.round((sav / est) * 1000) / 10 : 0,
    };
  });
}

export async function getCompetitiveSavings(year?: number, orgId?: number) {
  const result = await getPool().query(`
    WITH bid_responses AS (
      SELECT
        b.id as bid_id,
        b.bid_title,
        b.type as bid_type,
        b.pr_amount,
        b.awarded_amount,
        b.currency,
        COUNT(DISTINCT r.id) as response_count,
        MAX(CAST(r.bidtotal AS NUMERIC)) as highest_bid,
        MIN(CAST(r.bidtotal AS NUMERIC)) as lowest_bid,
        AVG(CAST(r.bidtotal AS NUMERIC)) as avg_bid
      FROM dbo.supp_bid_dtls b
      LEFT JOIN dbo.supp_bid_response_dtls r ON r.bidrefno = b.id AND r.status NOT IN ('Draft')
      WHERE b.status = 'Awarded'
        AND r.bidtotal IS NOT NULL AND CAST(r.bidtotal AS NUMERIC) > 0
        ${bidAnalyticsYearFilter(year)} ${orgFilter('b.org_id', orgId)}
      GROUP BY b.id, b.bid_title, b.type, b.pr_amount, b.awarded_amount, b.currency
      HAVING COUNT(DISTINCT r.id) >= 1
    )
    SELECT
      COUNT(*) as competitive_bids,
      COALESCE(SUM(highest_bid), 0) as total_highest,
      COALESCE(SUM(lowest_bid), 0) as total_lowest,
      COALESCE(SUM(avg_bid), 0) as total_avg,
      COALESCE(SUM(awarded_amount), 0) as total_awarded,
      COALESCE(AVG(response_count), 0) as avg_responses,
      COALESCE(SUM(CASE WHEN response_count >= 3 THEN 1 ELSE 0 END), 0) as bids_with_3plus,
      COALESCE(SUM(highest_bid - lowest_bid), 0) as total_spread
    FROM bid_responses
  `);
  const r = result.rows[0];
  const highest = parseFloat(r?.total_highest || "0");
  const awarded = parseFloat(r?.total_awarded || "0");
  const competitiveSavings = highest > 0 ? highest - awarded : 0;
  const competitivePct = highest > 0 ? Math.round((competitiveSavings / highest) * 1000) / 10 : 0;
  return {
    competitiveBids: parseInt(r?.competitive_bids || "0"),
    totalHighestBid: highest,
    totalLowestBid: parseFloat(r?.total_lowest || "0"),
    totalAvgBid: parseFloat(r?.total_avg || "0"),
    totalAwarded: awarded,
    competitiveSavings,
    competitiveSavingsPercent: competitivePct,
    avgResponses: Math.round(parseFloat(r?.avg_responses || "0") * 10) / 10,
    bidsWith3Plus: parseInt(r?.bids_with_3plus || "0"),
    totalSpread: parseFloat(r?.total_spread || "0"),
  };
}

/** Bid monetary value for pipeline charts: awarded amount when status is Awarded, else PR estimate. */
const BID_PIPELINE_VALUE_EXPR = `
  CASE
    WHEN b.status = 'Awarded' AND b.awarded_amount IS NOT NULL AND b.awarded_amount > 0
      THEN b.awarded_amount
    WHEN b.pr_amount IS NOT NULL AND CAST(b.pr_amount AS NUMERIC) > 0
      THEN CAST(b.pr_amount AS NUMERIC)
    WHEN b.awarded_amount IS NOT NULL AND b.awarded_amount > 0
      THEN b.awarded_amount
    ELSE 0
  END
`;

export async function getBidStatusDistribution(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      b.status,
      COUNT(*) as count,
      COALESCE(SUM(${BID_PIPELINE_VALUE_EXPR}), 0) as total_value
    FROM dbo.supp_bid_dtls b
    WHERE ${BID_ANALYTICS_STATUS_FILTER}
      ${bidAnalyticsYearFilter(year)} ${orgFilter('b.org_id', orgId)}
    GROUP BY b.status
    ORDER BY count DESC
  `);
  return result.rows.map(r => ({
    name: r.status,
    count: parseInt(r.count || "0"),
    value: parseFloat(r.total_value || "0"),
  }));
}

export async function getTopSavingsBids(year?: number, orgId?: number) {
  const result = await getPool().query(`
    SELECT 
      b.id,
      b.bid_title,
      b.type,
      b.currency,
      CAST(b.pr_amount AS NUMERIC) as estimated,
      b.awarded_amount as awarded,
      (CAST(b.pr_amount AS NUMERIC) - b.awarded_amount) as savings,
      ROUND(((CAST(b.pr_amount AS NUMERIC) - b.awarded_amount) / CAST(b.pr_amount AS NUMERIC) * 100)::numeric, 1) as savings_pct,
      (SELECT COUNT(DISTINCT r.id) FROM dbo.supp_bid_response_dtls r WHERE r.bidrefno = b.id AND r.status NOT IN ('Draft')) as response_count
    FROM dbo.supp_bid_dtls b
    WHERE b.status = 'Awarded'
      AND b.pr_amount IS NOT NULL AND CAST(b.pr_amount AS NUMERIC) > 0
      AND b.awarded_amount IS NOT NULL AND b.awarded_amount > 0
      ${bidAnalyticsYearFilter(year)} ${orgFilter('b.org_id', orgId)}
    ORDER BY savings DESC
    LIMIT 10
  `);
  return result.rows.map(r => ({
    bidTitle: r.bid_title,
    type: r.type,
    currency: r.currency,
    estimated: parseFloat(r.estimated || "0"),
    awarded: parseFloat(r.awarded || "0"),
    savings: parseFloat(r.savings || "0"),
    savingsPercent: parseFloat(r.savings_pct || "0"),
    responseCount: parseInt(r.response_count || "0"),
  }));
}

export async function getYoYSpendComparison(year?: number, orgId?: number) {
  const currentYear = year || new Date().getFullYear();
  const prevYear = currentYear - 1;
  const result = await getPool().query(`
    WITH monthly_spend AS (
      SELECT 
        EXTRACT(YEAR FROM invoice_date) as yr,
        EXTRACT(MONTH FROM invoice_date) as mo,
        COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as spend
      FROM dbo.supp_invoice_dtls
      WHERE invoice_status NOT IN ('Pending Approval','Rejected','Cancelled','REJECTED','CANCELLED')
        AND invoice_type = 'STANDARD'
        AND invoice_date IS NOT NULL
        AND EXTRACT(YEAR FROM invoice_date) IN ($1, $2)
        ${orgFilter("org_id", orgId)}
      GROUP BY EXTRACT(YEAR FROM invoice_date), EXTRACT(MONTH FROM invoice_date)
    )
    SELECT 
      mo,
      COALESCE(MAX(CASE WHEN yr = $1 THEN spend END), 0) as current_spend,
      COALESCE(MAX(CASE WHEN yr = $2 THEN spend END), 0) as prev_spend
    FROM monthly_spend
    GROUP BY mo
    ORDER BY mo
  `, [currentYear, prevYear]);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const data = months.map((name, i) => {
    const row = result.rows.find(r => parseInt(r.mo) === i + 1);
    return {
      month: name,
      currentYear: parseFloat(row?.current_spend || "0"),
      prevYear: parseFloat(row?.prev_spend || "0"),
    };
  });

  const totalCurrent = data.reduce((s, d) => s + d.currentYear, 0);
  const totalPrev = data.reduce((s, d) => s + d.prevYear, 0);
  const growth = totalPrev > 0 ? Math.round(((totalCurrent - totalPrev) / totalPrev) * 1000) / 10 : 0;

  return { data, currentYear, prevYear, totalCurrent, totalPrev, growth };
}

export async function getVendorConcentrationRisk(year?: number, orgId?: number) {
  const [totals, topSuppliers] = await Promise.all([
    getPool().query(`
      SELECT
        COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as total_spend,
        COUNT(DISTINCT supplier_id) as supplier_count
      FROM dbo.supp_invoice_dtls
      WHERE ${chartInvoiceSpendWhere(year, orgId)}
        AND supplier_id IS NOT NULL
    `),
    getPool().query(`
      SELECT 
        COALESCE(supplier_name, 'Unknown') as name,
        COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as spend
      FROM dbo.supp_invoice_dtls
      WHERE ${chartInvoiceSpendWhere(year, orgId)}
      GROUP BY supplier_name, supplier_id
      ORDER BY spend DESC
      LIMIT 10
    `),
  ]);

  const totalSpend = parseFloat(totals.rows[0]?.total_spend || "0");
  const supplierCount = parseInt(totals.rows[0]?.supplier_count || "0", 10);
  const top5Spend = topSuppliers.rows.slice(0, 5).reduce((s: number, r: any) => s + parseFloat(r.spend || "0"), 0);
  const top5Pct = totalSpend > 0 ? Math.round((top5Spend / totalSpend) * 1000) / 10 : 0;
  const riskLevel = top5Pct > 80 ? "High" : top5Pct > 60 ? "Medium" : "Low";

  return {
    suppliers: topSuppliers.rows.map(r => ({
      name: r.name?.length > 25 ? r.name.substring(0, 25) + "…" : r.name,
      spend: parseFloat(r.spend || "0"),
      pct: totalSpend > 0 ? Math.round((parseFloat(r.spend || "0") / totalSpend) * 1000) / 10 : 0,
    })),
    totalSpend,
    top5Spend,
    top5Pct,
    riskLevel,
    supplierCount,
  };
}

export async function getPaymentTermsAnalysis(year?: number, orgId?: number) {
  const yearFilter = year ? `AND EXTRACT(YEAR FROM invoice_date) = ${year}` : "";
  const result = await getPool().query(`
    WITH classified AS (
      SELECT 
        CASE 
          WHEN payment_date IS NOT NULL AND inv_due_date IS NOT NULL AND payment_date <= inv_due_date THEN 'On-Time/Early'
          WHEN payment_date IS NOT NULL AND inv_due_date IS NOT NULL AND payment_date > inv_due_date THEN 'Late'
          WHEN payment_date IS NULL AND inv_due_date IS NOT NULL AND inv_due_date < NOW() THEN 'Overdue'
          WHEN payment_date IS NULL AND inv_due_date IS NOT NULL AND inv_due_date >= NOW() THEN 'Not Yet Due'
          ELSE 'No Due Date'
        END as status,
        CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0) as total_val
      FROM dbo.supp_invoice_dtls
      WHERE invoice_status NOT IN ('Rejected','Cancelled','REJECTED','CANCELLED','Draft')
        ${yearFilter} ${orgFilter('org_id', orgId)}
    )
    SELECT status, COUNT(*) as count, COALESCE(SUM(total_val), 0) as total_amount
    FROM classified
    GROUP BY status
    ORDER BY total_amount DESC
  `);

  const earlyPayments = await getPool().query(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as total,
      AVG(EXTRACT(EPOCH FROM (inv_due_date - payment_date)) / 86400) as avg_days_early
    FROM dbo.supp_invoice_dtls
    WHERE payment_date IS NOT NULL AND inv_due_date IS NOT NULL
      AND payment_date < inv_due_date
      AND invoice_status NOT IN ('Rejected','Cancelled','REJECTED','CANCELLED','Draft')
      ${yearFilter} ${orgFilter('org_id', orgId)}
  `);

  return {
    breakdown: result.rows.map(r => ({
      status: r.status,
      count: parseInt(r.count || "0"),
      amount: parseFloat(r.total_amount || "0"),
    })),
    earlyPayments: {
      count: parseInt(earlyPayments.rows[0]?.count || "0"),
      total: parseFloat(earlyPayments.rows[0]?.total || "0"),
      avgDaysEarly: Math.round(parseFloat(earlyPayments.rows[0]?.avg_days_early || "0")),
    },
  };
}

export async function getUpcomingPaymentObligations(orgId?: number) {
  const result = await getPool().query(`
    WITH bucketed AS (
      SELECT
        CASE 
          WHEN inv_due_date < NOW() THEN 'Overdue'
          WHEN inv_due_date BETWEEN NOW() AND NOW() + INTERVAL '30 days' THEN '0-30 Days'
          WHEN inv_due_date BETWEEN NOW() + INTERVAL '30 days' AND NOW() + INTERVAL '60 days' THEN '31-60 Days'
          WHEN inv_due_date BETWEEN NOW() + INTERVAL '60 days' AND NOW() + INTERVAL '90 days' THEN '61-90 Days'
          ELSE '90+ Days'
        END as bucket,
        CASE 
          WHEN inv_due_date < NOW() THEN 0
          WHEN inv_due_date BETWEEN NOW() AND NOW() + INTERVAL '30 days' THEN 1
          WHEN inv_due_date BETWEEN NOW() + INTERVAL '30 days' AND NOW() + INTERVAL '60 days' THEN 2
          WHEN inv_due_date BETWEEN NOW() + INTERVAL '60 days' AND NOW() + INTERVAL '90 days' THEN 3
          ELSE 4
        END as sort_order,
        CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0) as total_val
      FROM dbo.supp_invoice_dtls
      WHERE inv_due_date IS NOT NULL
        AND (payment_date IS NULL OR inv_payment_status NOT IN ('Paid','PAID'))
        AND invoice_status NOT IN ('Rejected','Cancelled','REJECTED','CANCELLED','Draft')
        ${orgFilter('org_id', orgId)}
    )
    SELECT bucket, COUNT(*) as count, COALESCE(SUM(total_val), 0) as total_amount
    FROM bucketed
    GROUP BY bucket, sort_order
    ORDER BY sort_order
  `);

  const totalOutstanding = result.rows.reduce((s: number, r: any) => s + parseFloat(r.total_amount || "0"), 0);
  const overdueRow = result.rows.find(r => r.bucket === 'Overdue');
  const overdueAmount = parseFloat(overdueRow?.total_amount || "0");
  const next30Row = result.rows.find(r => r.bucket === '0-30 Days');
  const next30Amount = parseFloat(next30Row?.total_amount || "0");

  return {
    buckets: result.rows.map(r => ({
      bucket: r.bucket,
      count: parseInt(r.count || "0"),
      amount: parseFloat(r.total_amount || "0"),
    })),
    totalOutstanding,
    overdueAmount,
    overdueCount: parseInt(overdueRow?.count || "0"),
    next30Amount,
    next30Count: parseInt(next30Row?.count || "0"),
  };
}

export async function getAIInsightsData(year?: number, orgId?: number) {
  const yearFilterPO = year ? `AND EXTRACT(YEAR FROM h.po_issue_date) = ${year}` : "";
  const yearFilterPOSingle = year ? `AND EXTRACT(YEAR FROM po_issue_date) = ${year}` : "";
  const invYearFilter = year ? `AND EXTRACT(YEAR FROM invoice_date) = ${year}` : "";

  const bidYearFilter = year ? `AND EXTRACT(YEAR FROM b.created_date) = ${year}` : "";

  const prYearFilter = year ? `AND EXTRACT(YEAR FROM pr_created_date) = ${year}` : "";

  const [spendBySupplier, spendByCategory, monthlyTrend, budgetHealth, paymentPerf, poMetrics, priceChanges, bidData, orgProfile, topItems, prMetrics, deliveryMetrics, invoiceProcessing, supplierDiversity, contractStats, invoiceSpendTotal] = await Promise.all([
    getPool().query(`
      SELECT COALESCE(supplier_name, 'Unknown') as name,
        COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as spend,
        COUNT(*) as po_count
      FROM dbo.supp_invoice_dtls
      WHERE ${chartInvoiceSpendWhere(year, orgId)}
      GROUP BY supplier_name ORDER BY spend DESC LIMIT 10
    `),
    getPool().query(`
      SELECT COALESCE(l.product_category_name, 'Uncategorized') as category,
        COALESCE(SUM(CAST(l.line_cost AS NUMERIC)), 0) as spend
      FROM dbo.supp_po_line_dtls l
      JOIN dbo.supp_po_header_dtls h ON l.po_number = h.po_number
      WHERE h.po_status NOT IN ('Draft','Pending Approval','Rejected','Cancelled','DRAFT','CANCELLED','REJECTED')
        ${yearFilterPO} ${orgFilter('h.org_id', orgId)}
      GROUP BY l.product_category_name ORDER BY spend DESC LIMIT 10
    `),
    getPool().query(`
      SELECT TO_CHAR(po_issue_date, 'Mon') as month, EXTRACT(MONTH FROM po_issue_date) as m_num,
        COALESCE(SUM(CAST(po_net_cost AS NUMERIC)), 0) as spend
      FROM dbo.supp_po_header_dtls
      WHERE po_status NOT IN ('Draft','Pending Approval','Rejected','Cancelled','DRAFT','CANCELLED','REJECTED')
        ${yearFilterPOSingle} ${orgFilter('org_id', orgId)}
      GROUP BY TO_CHAR(po_issue_date, 'Mon'), EXTRACT(MONTH FROM po_issue_date) ORDER BY m_num
    `),
    getPool().query(`
      SELECT budget_name, CAST(budget_amount AS NUMERIC) as budget, CAST(consumed_amount AS NUMERIC) as consumed
      FROM dbo.am_budget_mst
      WHERE status = 'Approved' AND budget_amount IS NOT NULL AND budget_amount > 0
      ${year ? `AND EXTRACT(YEAR FROM start_date) <= ${year} AND EXTRACT(YEAR FROM end_date) >= ${year}` : ""}
      ${entityFilter(orgId)}
    `),
    getPool().query(`
      SELECT
        COUNT(*) FILTER (WHERE payment_date IS NOT NULL AND inv_due_date IS NOT NULL AND payment_date <= inv_due_date) as on_time,
        COUNT(*) FILTER (WHERE payment_date IS NOT NULL AND inv_due_date IS NOT NULL AND payment_date > inv_due_date) as late,
        COUNT(*) FILTER (WHERE payment_date IS NULL AND inv_due_date IS NOT NULL AND inv_due_date < NOW()) as overdue,
        COALESCE(SUM(CASE WHEN payment_date IS NULL AND inv_due_date IS NOT NULL AND inv_due_date < NOW()
          THEN CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0) ELSE 0 END), 0) as overdue_amount,
        COUNT(*) as total
      FROM dbo.supp_invoice_dtls
      WHERE invoice_status NOT IN ('Rejected','Cancelled','REJECTED','CANCELLED','Draft')
        ${invYearFilter} ${orgFilter('org_id', orgId)}
    `),
    getPool().query(`
      SELECT COUNT(*) as total, 
        COUNT(*) FILTER (WHERE po_status IN ('Approved','Completed','Closed')) as completed,
        COALESCE(SUM(CAST(po_net_cost AS NUMERIC)), 0) as total_spend,
        COALESCE(AVG(CAST(po_net_cost AS NUMERIC)), 0) as avg_po_value
      FROM dbo.supp_po_header_dtls
      WHERE po_status NOT IN ('Draft') ${yearFilterPOSingle} ${orgFilter('org_id', orgId)}
    `),
    getPool().query(`
      SELECT l.item_name, l.line_unit_cost as unit_price, h.po_issue_date, h.company_name as supplier
      FROM dbo.supp_po_line_dtls l
      JOIN dbo.supp_po_header_dtls h ON l.po_number = h.po_number
      WHERE h.po_status NOT IN ('Rejected','Cancelled','Draft','DRAFT','CANCELLED','REJECTED')
        AND l.line_unit_cost IS NOT NULL
        ${yearFilterPO} ${orgFilter('h.org_id', orgId)}
      ORDER BY h.po_issue_date DESC LIMIT 100
    `),
    getPool().query(`
      SELECT
        COUNT(*) as total_bids,
        COUNT(CASE WHEN b.status = 'Awarded' THEN 1 END) as awarded_bids,
        COUNT(CASE WHEN b.status = 'Closed' THEN 1 END) as closed_bids,
        COUNT(CASE WHEN b.status IN ('Published','Open') THEN 1 END) as active_bids,
        COUNT(CASE WHEN b.type = 'RFQ' THEN 1 END) as rfq_count,
        COUNT(CASE WHEN b.type = 'Tender' THEN 1 END) as tender_count,
        COUNT(CASE WHEN b.type = 'RFP' THEN 1 END) as rfp_count,
        COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.pr_amount IS NOT NULL AND CAST(b.pr_amount AS NUMERIC) > 0 THEN CAST(b.pr_amount AS NUMERIC) ELSE 0 END), 0) as total_estimated,
        COALESCE(SUM(CASE WHEN b.status = 'Awarded' AND b.awarded_amount IS NOT NULL THEN b.awarded_amount ELSE 0 END), 0) as total_awarded,
        COALESCE(AVG(CASE WHEN b.status = 'Awarded' AND b.awarded_amount IS NOT NULL AND b.awarded_amount > 0
          THEN EXTRACT(EPOCH FROM (b.award_accepted_date - b.created_date)) / 86400 END), 0) as avg_award_cycle_days
      FROM dbo.supp_bid_dtls b
      WHERE ${BID_ANALYTICS_STATUS_FILTER} ${bidYearFilter} ${orgFilter('b.org_id', orgId)}
    `),
    getPool().query(`
      SELECT organization_name, org_legal_name, org_type, org_country, org_city, org_state,
        currency, entity_type, org_email
      FROM dbo.um_org_dtls
      WHERE entity_type = 'MAIN' LIMIT 1
    `),
    getPool().query(`
      SELECT l.item_name, COUNT(*) as frequency, SUM(CAST(l.line_cost AS NUMERIC)) as total_cost
      FROM dbo.supp_po_line_dtls l
      JOIN dbo.supp_po_header_dtls h ON l.po_number = h.po_number
      WHERE h.po_status NOT IN ('Draft','Rejected','Cancelled','DRAFT','CANCELLED','REJECTED')
        AND l.item_name IS NOT NULL
        ${yearFilterPO} ${orgFilter('h.org_id', orgId)}
      GROUP BY l.item_name ORDER BY total_cost DESC LIMIT 20
    `),
    getPool().query(`
      SELECT
        COUNT(*) as total_prs,
        COUNT(CASE WHEN pr_status IN ('Approved','Completed','Closed') THEN 1 END) as approved_prs,
        COUNT(CASE WHEN pr_status = 'Rejected' OR pr_status = 'REJECTED' THEN 1 END) as rejected_prs,
        COUNT(CASE WHEN po_number IS NOT NULL AND po_number != '' THEN 1 END) as converted_to_po,
        COALESCE(AVG(CASE WHEN approved_date IS NOT NULL AND pr_created_date IS NOT NULL
          THEN EXTRACT(EPOCH FROM (approved_date - pr_created_date)) / 86400 END), 0) as avg_approval_days,
        COALESCE(AVG(CASE WHEN po_number IS NOT NULL AND po_number != '' AND pr_created_date IS NOT NULL AND approved_date IS NOT NULL
          THEN EXTRACT(EPOCH FROM (approved_date - pr_created_date)) / 86400 END), 0) as avg_pr_to_po_days,
        COALESCE(SUM(CAST(pr_amount AS NUMERIC)), 0) as total_pr_value
      FROM dbo.supp_pr_header_dtls
      WHERE pr_status NOT IN ('Draft','DRAFT') ${prYearFilter} ${orgFilter('org_id', orgId)}
    `),
    getPool().query(`
      SELECT
        COUNT(*) as total_grn_lines,
        COUNT(CASE WHEN received_qty IS NOT NULL AND CAST(received_qty AS NUMERIC) > 0 THEN 1 END) as received_lines,
        COUNT(CASE WHEN rejected_qty IS NOT NULL AND CAST(rejected_qty AS NUMERIC) > 0 THEN 1 END) as rejected_lines,
        COALESCE(SUM(CAST(order_qty AS NUMERIC)), 0) as total_ordered_qty,
        COALESCE(SUM(CAST(received_qty AS NUMERIC)), 0) as total_received_qty,
        COALESCE(SUM(CAST(rejected_qty AS NUMERIC)), 0) as total_rejected_qty,
        COALESCE(AVG(CASE WHEN received_date IS NOT NULL AND creation_date IS NOT NULL
          THEN EXTRACT(EPOCH FROM (received_date - creation_date)) / 86400 END), 0) as avg_delivery_days
      FROM dbo.supp_po_grn_line_dtls
    `),
    getPool().query(`
      SELECT
        COUNT(*) as total_invoices,
        COUNT(CASE WHEN inv_match_status = 'Matched' THEN 1 END) as matched_invoices,
        COUNT(CASE WHEN inv_match_status = 'Mismatched' OR inv_match_status = 'MISMATCHED' THEN 1 END) as mismatched_invoices,
        COUNT(CASE WHEN inv_match_status IS NULL OR inv_match_status = '' OR inv_match_status = 'Pending' THEN 1 END) as pending_match,
        COALESCE(AVG(CASE WHEN aprdate IS NOT NULL AND creation_date IS NOT NULL
          THEN EXTRACT(EPOCH FROM (CAST(aprdate AS TIMESTAMP) - creation_date)) / 86400 END), 0) as avg_approval_days,
        COALESCE(AVG(CASE WHEN payment_date IS NOT NULL AND invoice_date IS NOT NULL
          THEN EXTRACT(EPOCH FROM (payment_date - invoice_date)) / 86400 END), 0) as avg_payment_cycle_days
      FROM dbo.supp_invoice_dtls
      WHERE invoice_status NOT IN ('Rejected','Cancelled','REJECTED','CANCELLED','Draft')
        ${invYearFilter} ${orgFilter('org_id', orgId)}
    `),
    getPool().query(`
      SELECT
        COUNT(DISTINCT supplier_id) as total_active_suppliers,
        COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM creation_date) = ${year || new Date().getFullYear()} THEN supplier_id END) as new_suppliers_this_year,
        COUNT(DISTINCT CASE WHEN EXTRACT(YEAR FROM creation_date) < ${year || new Date().getFullYear()} THEN supplier_id END) as returning_suppliers
      FROM dbo.supp_po_header_dtls
      WHERE po_status NOT IN ('Draft','Rejected','Cancelled','DRAFT','CANCELLED','REJECTED')
        ${yearFilterPOSingle} ${orgFilter('org_id', orgId)}
    `),
    getPool().query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Active') as active_count,
        COALESCE(SUM(contract_amount) FILTER (WHERE status = 'Active'), 0) as active_value,
        COUNT(*) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() AND end_date <= NOW() + INTERVAL '90 days') as expiring_90,
        COUNT(*) FILTER (WHERE is_renewable = 'Yes' AND status = 'Active') as renewable_count,
        COUNT(*) FILTER (WHERE status IN ('Pending Signature','Pending Approval')) as pending_count,
        COUNT(*) as total_contracts
      FROM dbo.cm_header
      WHERE status NOT IN ('Draft','Cancelled')
    `),
    getPool().query(`
      SELECT COALESCE(SUM(CAST(invoice_amount AS NUMERIC) + COALESCE(CAST(tax_amount AS NUMERIC), 0)), 0) as total_spend
      FROM dbo.supp_invoice_dtls
      WHERE ${chartInvoiceSpendWhere(year, orgId)}
    `),
  ]);

  const bidR = bidData.rows[0];
  const bidEstimated = parseFloat(bidR?.total_estimated || "0");
  const bidAwarded = parseFloat(bidR?.total_awarded || "0");

  return {
    topSuppliers: spendBySupplier.rows.map(r => ({ name: r.name, spend: parseFloat(r.spend || "0"), poCount: parseInt(r.po_count || "0") })),
    topCategories: spendByCategory.rows.map(r => ({ category: r.category, spend: parseFloat(r.spend || "0") })),
    monthlyTrend: monthlyTrend.rows.map(r => ({ month: r.month, spend: parseFloat(r.spend || "0") })),
    budgets: budgetHealth.rows.map(r => ({
      name: r.budget_name,
      budget: parseFloat(r.budget || "0"),
      consumed: parseFloat(r.consumed || "0"),
      utilization: parseFloat(r.budget) > 0 ? Math.round((parseFloat(r.consumed) / parseFloat(r.budget)) * 100) : 0,
    })),
    payments: {
      onTime: parseInt(paymentPerf.rows[0]?.on_time || "0"),
      late: parseInt(paymentPerf.rows[0]?.late || "0"),
      overdue: parseInt(paymentPerf.rows[0]?.overdue || "0"),
      overdueAmount: parseFloat(paymentPerf.rows[0]?.overdue_amount || "0"),
      total: parseInt(paymentPerf.rows[0]?.total || "0"),
    },
    poMetrics: {
      total: parseInt(poMetrics.rows[0]?.total || "0"),
      completed: parseInt(poMetrics.rows[0]?.completed || "0"),
      totalSpend: parseFloat(poMetrics.rows[0]?.total_spend || "0"),
      avgPOValue: parseFloat(poMetrics.rows[0]?.avg_po_value || "0"),
    },
    recentItems: priceChanges.rows.map(r => ({
      item: r.item_name, price: parseFloat(r.unit_price || "0"),
      date: r.po_issue_date, supplier: r.supplier,
    })),
    bidMetrics: {
      totalBids: parseInt(bidR?.total_bids || "0"),
      awardedBids: parseInt(bidR?.awarded_bids || "0"),
      closedBids: parseInt(bidR?.closed_bids || "0"),
      activeBids: parseInt(bidR?.active_bids || "0"),
      rfqCount: parseInt(bidR?.rfq_count || "0"),
      tenderCount: parseInt(bidR?.tender_count || "0"),
      rfpCount: parseInt(bidR?.rfp_count || "0"),
      totalEstimated: bidEstimated,
      totalAwarded: bidAwarded,
      savings: bidEstimated > 0 ? bidEstimated - bidAwarded : 0,
      savingsPercent: bidEstimated > 0 ? Math.round(((bidEstimated - bidAwarded) / bidEstimated) * 100) : 0,
      avgAwardCycleDays: Math.round(parseFloat(bidR?.avg_award_cycle_days || "0")),
    },
    orgProfile: orgProfile.rows[0] ? {
      name: orgProfile.rows[0].organization_name,
      legalName: orgProfile.rows[0].org_legal_name,
      type: orgProfile.rows[0].org_type,
      country: orgProfile.rows[0].org_country,
      city: orgProfile.rows[0].org_city,
      state: orgProfile.rows[0].org_state,
      currency: orgProfile.rows[0].currency,
    } : null,
    topPurchasedItems: topItems.rows.map(r => ({
      item: r.item_name,
      frequency: parseInt(r.frequency || "0"),
      totalCost: parseFloat(r.total_cost || "0"),
    })),
    prMetrics: {
      totalPRs: parseInt(prMetrics.rows[0]?.total_prs || "0"),
      approvedPRs: parseInt(prMetrics.rows[0]?.approved_prs || "0"),
      rejectedPRs: parseInt(prMetrics.rows[0]?.rejected_prs || "0"),
      convertedToPO: parseInt(prMetrics.rows[0]?.converted_to_po || "0"),
      conversionRate: parseInt(prMetrics.rows[0]?.total_prs || "0") > 0
        ? Math.round((parseInt(prMetrics.rows[0]?.converted_to_po || "0") / parseInt(prMetrics.rows[0]?.total_prs || "0")) * 100)
        : 0,
      avgApprovalDays: Math.round(parseFloat(prMetrics.rows[0]?.avg_approval_days || "0")),
      avgPrToPoDays: Math.round(parseFloat(prMetrics.rows[0]?.avg_pr_to_po_days || "0")),
      totalPRValue: parseFloat(prMetrics.rows[0]?.total_pr_value || "0"),
    },
    deliveryMetrics: {
      totalGRNLines: parseInt(deliveryMetrics.rows[0]?.total_grn_lines || "0"),
      receivedLines: parseInt(deliveryMetrics.rows[0]?.received_lines || "0"),
      rejectedLines: parseInt(deliveryMetrics.rows[0]?.rejected_lines || "0"),
      totalOrderedQty: parseFloat(deliveryMetrics.rows[0]?.total_ordered_qty || "0"),
      totalReceivedQty: parseFloat(deliveryMetrics.rows[0]?.total_received_qty || "0"),
      totalRejectedQty: parseFloat(deliveryMetrics.rows[0]?.total_rejected_qty || "0"),
      rejectionRate: parseFloat(deliveryMetrics.rows[0]?.total_ordered_qty || "0") > 0
        ? Math.round((parseFloat(deliveryMetrics.rows[0]?.total_rejected_qty || "0") / parseFloat(deliveryMetrics.rows[0]?.total_ordered_qty || "0")) * 100)
        : 0,
      avgDeliveryDays: Math.round(parseFloat(deliveryMetrics.rows[0]?.avg_delivery_days || "0")),
    },
    invoiceProcessing: {
      totalInvoices: parseInt(invoiceProcessing.rows[0]?.total_invoices || "0"),
      matchedInvoices: parseInt(invoiceProcessing.rows[0]?.matched_invoices || "0"),
      mismatchedInvoices: parseInt(invoiceProcessing.rows[0]?.mismatched_invoices || "0"),
      pendingMatch: parseInt(invoiceProcessing.rows[0]?.pending_match || "0"),
      matchRate: parseInt(invoiceProcessing.rows[0]?.total_invoices || "0") > 0
        ? Math.round((parseInt(invoiceProcessing.rows[0]?.matched_invoices || "0") / parseInt(invoiceProcessing.rows[0]?.total_invoices || "0")) * 100)
        : 0,
      avgApprovalDays: Math.round(parseFloat(invoiceProcessing.rows[0]?.avg_approval_days || "0")),
      avgPaymentCycleDays: Math.round(parseFloat(invoiceProcessing.rows[0]?.avg_payment_cycle_days || "0")),
    },
    supplierDiversity: {
      totalActiveSuppliers: parseInt(supplierDiversity.rows[0]?.total_active_suppliers || "0"),
      newSuppliersThisYear: parseInt(supplierDiversity.rows[0]?.new_suppliers_this_year || "0"),
      returningSuppliers: parseInt(supplierDiversity.rows[0]?.returning_suppliers || "0"),
    },
    contractMetrics: {
      activeContracts: parseInt(contractStats.rows[0]?.active_count || "0"),
      activeValue: parseFloat(contractStats.rows[0]?.active_value || "0"),
      expiringIn90Days: parseInt(contractStats.rows[0]?.expiring_90 || "0"),
      renewableCount: parseInt(contractStats.rows[0]?.renewable_count || "0"),
      pendingContracts: parseInt(contractStats.rows[0]?.pending_count || "0"),
      totalContracts: parseInt(contractStats.rows[0]?.total_count || "0"),
    },
    invoiceSpendTotal: parseFloat(invoiceSpendTotal.rows[0]?.total_spend || "0"),
    year: year || new Date().getFullYear(),
  };
}

export async function getBusinessEntities() {
  const result = await getPool().query(`
    SELECT id, organization_name, entity_type,
      COALESCE(NULLIF(TRIM(currency), ''), 'AED') AS currency
    FROM dbo.um_org_dtls
    WHERE entity_type IN ('MAIN', 'SUBSIDIARY')
    ORDER BY 
      CASE WHEN entity_type = 'MAIN' THEN 0 ELSE 1 END,
      organization_name
  `);
  return result.rows.map(r => ({
    id: r.id,
    name: r.organization_name,
    type: r.entity_type,
    currency: r.currency,
  }));
}

export async function getContractPortfolioStats(orgId?: number) {
  const [stats, statusBreakdown, byDepartment] = await Promise.all([
    getPool().query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Active') as active_count,
        COALESCE(SUM(contract_amount) FILTER (WHERE status = 'Active'), 0) as active_value,
        COUNT(*) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() AND end_date <= NOW() + INTERVAL '30 days') as expiring_30,
        COUNT(*) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() + INTERVAL '30 days' AND end_date <= NOW() + INTERVAL '60 days') as expiring_60,
        COUNT(*) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() + INTERVAL '60 days' AND end_date <= NOW() + INTERVAL '90 days') as expiring_90,
        COALESCE(SUM(contract_amount) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() AND end_date <= NOW() + INTERVAL '90 days'), 0) as expiring_90_value,
        COUNT(*) FILTER (WHERE status IN ('Pending Signature','Pending Approval')) as pending_count,
        COALESCE(SUM(contract_amount) FILTER (WHERE status IN ('Pending Signature','Pending Approval')), 0) as pending_value,
        COUNT(*) as total_contracts,
        COALESCE(SUM(contract_amount), 0) as total_value
      FROM dbo.cm_header
      WHERE status NOT IN ('Draft','Cancelled')
    `),
    getPool().query(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(contract_amount), 0) as value
      FROM dbo.cm_header
      WHERE status NOT IN ('Draft','Cancelled')
      GROUP BY status ORDER BY count DESC
    `),
    getPool().query(`
      SELECT COALESCE(department_name, 'Unassigned') as department,
        COUNT(*) as count, COALESCE(SUM(contract_amount), 0) as value
      FROM dbo.cm_header
      WHERE status NOT IN ('Draft','Cancelled')
      GROUP BY department_name ORDER BY value DESC LIMIT 8
    `),
  ]);

  const r = stats.rows[0];
  return {
    activeContracts: parseInt(r.active_count || '0'),
    activeValue: parseFloat(r.active_value || '0'),
    expiring30: parseInt(r.expiring_30 || '0'),
    expiring60: parseInt(r.expiring_60 || '0'),
    expiring90: parseInt(r.expiring_90 || '0'),
    expiring90Value: parseFloat(r.expiring_90_value || '0'),
    pendingContracts: parseInt(r.pending_count || '0'),
    pendingValue: parseFloat(r.pending_value || '0'),
    totalContracts: parseInt(r.total_contracts || '0'),
    totalValue: parseFloat(r.total_value || '0'),
    statusBreakdown: statusBreakdown.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count || '0'),
      value: parseFloat(row.value || '0'),
    })),
    byDepartment: byDepartment.rows.map(row => ({
      department: row.department,
      count: parseInt(row.count || '0'),
      value: parseFloat(row.value || '0'),
    })),
  };
}

export async function getContractPipeline(orgId?: number) {
  const [lifecycle, topContracts, renewalPipeline] = await Promise.all([
    getPool().query(`
      SELECT
        COALESCE(AVG(
          EXTRACT(EPOCH FROM (
            COALESCE(last_modified_date, NOW()) - creation_date
          )) / 86400
        ) FILTER (WHERE status = 'Active' AND creation_date IS NOT NULL), 0) as avg_lifecycle_days,
        COUNT(*) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() AND end_date <= NOW() + INTERVAL '30 days') as exp30_count,
        COALESCE(SUM(contract_amount) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() AND end_date <= NOW() + INTERVAL '30 days'), 0) as exp30_value,
        COUNT(*) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() + INTERVAL '30 days' AND end_date <= NOW() + INTERVAL '60 days') as exp60_count,
        COALESCE(SUM(contract_amount) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() + INTERVAL '30 days' AND end_date <= NOW() + INTERVAL '60 days'), 0) as exp60_value,
        COUNT(*) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() + INTERVAL '60 days' AND end_date <= NOW() + INTERVAL '90 days') as exp90_count,
        COALESCE(SUM(contract_amount) FILTER (WHERE status NOT IN ('Draft','Cancelled','Terminated') AND end_date > NOW() + INTERVAL '60 days' AND end_date <= NOW() + INTERVAL '90 days'), 0) as exp90_value,
        COUNT(*) FILTER (WHERE is_renewable = 'Yes' AND status = 'Active') as renewable_count,
        COALESCE(SUM(contract_amount) FILTER (WHERE is_renewable = 'Yes' AND status = 'Active'), 0) as renewable_value
      FROM dbo.cm_header
    `),
    getPool().query(`
      SELECT title, supplier_name, contract_amount, status, end_date, is_renewable, contr_ref_no, department_name
      FROM dbo.cm_header
      WHERE contract_amount IS NOT NULL AND status NOT IN ('Draft','Cancelled')
      ORDER BY contract_amount DESC NULLS LAST LIMIT 6
    `),
    getPool().query(`
      SELECT
        TO_CHAR(end_date, 'Mon YYYY') as month,
        DATE_TRUNC('month', end_date) as month_start,
        COUNT(*) as count,
        COALESCE(SUM(contract_amount), 0) as value
      FROM dbo.cm_header
      WHERE status NOT IN ('Draft','Cancelled','Terminated')
        AND end_date > NOW()
        AND end_date <= NOW() + INTERVAL '6 months'
      GROUP BY TO_CHAR(end_date, 'Mon YYYY'), DATE_TRUNC('month', end_date)
      ORDER BY month_start
    `),
  ]);

  const r = lifecycle.rows[0];
  return {
    avgLifecycleDays: Math.round(parseFloat(r.avg_lifecycle_days || '0')),
    expiry30: { count: parseInt(r.exp30_count || '0'), value: parseFloat(r.exp30_value || '0') },
    expiry60: { count: parseInt(r.exp60_count || '0'), value: parseFloat(r.exp60_value || '0') },
    expiry90: { count: parseInt(r.exp90_count || '0'), value: parseFloat(r.exp90_value || '0') },
    renewableCount: parseInt(r.renewable_count || '0'),
    renewableValue: parseFloat(r.renewable_value || '0'),
    topContracts: topContracts.rows.map(row => ({
      title: row.title || 'Untitled',
      supplier: row.supplier_name || 'N/A',
      value: parseFloat(row.contract_amount || '0'),
      status: row.status,
      endDate: row.end_date,
      isRenewable: row.is_renewable,
      refNo: row.contr_ref_no,
      department: row.department_name,
    })),
    renewalPipeline: renewalPipeline.rows.map(row => ({
      month: row.month,
      count: parseInt(row.count || '0'),
      value: parseFloat(row.value || '0'),
    })),
  };
}																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																							  