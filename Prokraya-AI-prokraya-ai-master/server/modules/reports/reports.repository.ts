import { db, pool } from "../../db";
import { sql } from "drizzle-orm";
import { getContextPool, getContextDb } from "../../tenant-context";
const getPool = () => getContextPool() ?? pool;
const getDb = () => getContextDb() ?? db;

export interface ReportTemplate {
  id: number;
  user_id: number;
  report_id: string;
  template_name: string;
  filters: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface QueryFilter {
  fromDate?: string;
  toDate?: string;
  status?: string[];
  department?: string[];
  supplier?: string[];
  category?: string[];
  budget?: string[];
  location?: string[];
  requestor?: string[];
  buyer?: string[];
  invoiceType?: string[];
  paymentTerms?: string[];
  userType?: string[];
  roles?: string[];
  businessEntity?: string[];
  budgetOwner?: string[];
  costCenter?: string[];
  warehouse?: string[];
  bidType?: string[];
  contractType?: string[];
  contractOwner?: string[];
  page?: number;
  pageSize?: number;
}

function addPagination(query: string, page: number = 0, pageSize: number = 50): string {
  const offset = page * pageSize;
  return query + ` LIMIT ${pageSize} OFFSET ${offset}`;
}

export class ReportsRepository {

  async runReport(reportId: string, filters: QueryFilter) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    let baseQuery = "";
    let countBaseQuery = "";
    let orderBy = "";

    switch (reportId) {
      case "supplier-by-category": {
        baseQuery = `SELECT DISTINCT s.id, s.company_name, s.status, s.legal_entity_type, s.email_id, s.country, s.city, 
          TO_CHAR(s.creation_date, 'YYYY-MM-DD') as creation_date, s.vendor_category, s.type_of_service
          FROM dbo.supp_basic_org_dtls s`;
        countBaseQuery = `SELECT COUNT(DISTINCT s.id) as total FROM dbo.supp_basic_org_dtls s`;

        if (filters.fromDate) {
          conditions.push(`s.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`s.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`s.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.category?.length) {
          conditions.push(`s.id IN (SELECT sc.supp_org_id FROM dbo.supp_scope_of_supply_service sc WHERE sc.service_details = ANY($${paramIdx}::text[]))`);
          params.push(filters.category);
          paramIdx++;
        }
        orderBy = "ORDER BY s.id ASC";
        break;
      }

      case "requisitions-by-item": {
        baseQuery = `SELECT DISTINCT pr.pr_number, pr.pr_description, pr.pr_status, pr.pr_owner_name as requestor,
          pr.department_name, TO_CHAR(pr.creation_date, 'YYYY-MM-DD') as creation_date, 
          TO_CHAR(pr.delivery_date, 'YYYY-MM-DD') as delivery_date, pr.budget_name, pr.delivertto_location_name as location,
          pr.pr_type, pr.pr_amount as total_amount
          FROM dbo.supp_pr_header_dtls pr`;
        countBaseQuery = `SELECT COUNT(DISTINCT pr.pr_number) as total FROM dbo.supp_pr_header_dtls pr`;

        if (filters.fromDate) {
          conditions.push(`pr.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`pr.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`pr.pr_status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`pr.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.requestor?.length) {
          conditions.push(`pr.pr_owner_name = ANY($${paramIdx}::text[])`);
          params.push(filters.requestor);
          paramIdx++;
        }
        if (filters.budget?.length) {
          conditions.push(`pr.budget_name = ANY($${paramIdx}::text[])`);
          params.push(filters.budget);
          paramIdx++;
        }
        if (filters.location?.length) {
          conditions.push(`pr.delivertto_location_name = ANY($${paramIdx}::text[])`);
          params.push(filters.location);
          paramIdx++;
        }
        if (filters.category?.length) {
          conditions.push(`pr.pr_number IN (SELECT pl.pr_number FROM dbo.supp_pr_line_dtls pl WHERE pl.product_category_name = ANY($${paramIdx}::text[]))`);
          params.push(filters.category);
          paramIdx++;
        }
        orderBy = "ORDER BY pr.pr_number ASC";
        break;
      }

      case "po-by-department": {
        baseQuery = `SELECT po.po_number, po.po_description, po.po_status, po.company_name as supplier,
          po.department_name, po.buyer_name, TO_CHAR(po.creation_date, 'YYYY-MM-DD') as creation_date,
          TO_CHAR(po.po_required_date, 'YYYY-MM-DD') as required_date, po.po_total_cost, po.po_currency,
          po.budget_name, po.delivertto_location_name as location, po.pr_number
          FROM dbo.supp_po_header_dtls po`;
        countBaseQuery = `SELECT COUNT(DISTINCT po.po_number) as total FROM dbo.supp_po_header_dtls po`;

        if (filters.fromDate) {
          conditions.push(`po.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`po.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`po.po_status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`po.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`po.company_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        if (filters.buyer?.length) {
          conditions.push(`po.buyer_name = ANY($${paramIdx}::text[])`);
          params.push(filters.buyer);
          paramIdx++;
        }
        if (filters.budget?.length) {
          conditions.push(`po.budget_name = ANY($${paramIdx}::text[])`);
          params.push(filters.budget);
          paramIdx++;
        }
        if (filters.category?.length) {
          conditions.push(`po.po_number IN (SELECT pol.po_number FROM dbo.supp_po_line_dtls pol WHERE pol.product_category_name = ANY($${paramIdx}::text[]))`);
          params.push(filters.category);
          paramIdx++;
        }
        orderBy = "ORDER BY po.po_number ASC";
        break;
      }

      case "invoice-summary": {
        baseQuery = `SELECT inv.id, inv.invoice_number, inv.invoice_status, inv.supplier_name, inv.department_name,
          inv.po_number, inv.invoice_type, TO_CHAR(inv.invoice_date, 'YYYY-MM-DD') as invoice_date,
          TO_CHAR(inv.inv_due_date, 'YYYY-MM-DD') as due_date, inv.invoice_amount, inv.invoice_curr_code,
          inv.budget_name, inv.payment_terms_name, inv.inv_payment_status
          FROM dbo.supp_invoice_dtls inv`;
        countBaseQuery = `SELECT COUNT(*) as total FROM dbo.supp_invoice_dtls inv`;

        if (filters.fromDate) {
          conditions.push(`inv.invoice_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`inv.invoice_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`inv.invoice_status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`inv.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`inv.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        if (filters.budget?.length) {
          conditions.push(`inv.budget_name = ANY($${paramIdx}::text[])`);
          params.push(filters.budget);
          paramIdx++;
        }
        if (filters.invoiceType?.length) {
          conditions.push(`inv.invoice_type = ANY($${paramIdx}::text[])`);
          params.push(filters.invoiceType);
          paramIdx++;
        }
        if (filters.paymentTerms?.length) {
          conditions.push(`inv.payment_terms_name = ANY($${paramIdx}::text[])`);
          params.push(filters.paymentTerms);
          paramIdx++;
        }
        orderBy = "ORDER BY inv.id ASC";
        break;
      }

      case "user-report": {
        baseQuery = `SELECT u.id, u.name, u.email_id, u.department_name, u.designation, u.user_type,
          CASE WHEN u.user_status = 1 THEN 'Active' WHEN u.user_status = 2 THEN 'Inactive' ELSE 'Unknown' END as user_status,
          TO_CHAR(u.creation_date, 'YYYY-MM-DD') as creation_date, TO_CHAR(u.last_login_date, 'YYYY-MM-DD') as last_login,
          u.manager_name, u.mobile_no
          FROM dbo.um_user_dtls u`;
        countBaseQuery = `SELECT COUNT(*) as total FROM dbo.um_user_dtls u`;

        if (filters.fromDate) {
          conditions.push(`u.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`u.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          const statusInts = filters.status.map(s => s === "Active" ? 1 : s === "Inactive" ? 2 : s);
          conditions.push(`u.user_status = ANY($${paramIdx}::int[])`);
          params.push(statusInts);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`u.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        const effectiveUserTypes = filters.userType?.length ? filters.userType : ["Users"];
        const mappedUserTypes = effectiveUserTypes.map(t => t === "Users" ? "0" : t === "Vendors" ? "1" : t);
        conditions.push(`u.user_type::text = ANY($${paramIdx}::text[])`);
        params.push(mappedUserTypes);
        paramIdx++;
        orderBy = "ORDER BY u.id ASC";
        break;
      }

      case "budget-summary": {
        baseQuery = `SELECT b.id, b.budget_name, b.budget_owner_name, b.budget_amount, b.consumed_amount,
          b.reserved_amount, b.budget_curr, b.status, b.business_entity_name,
          TO_CHAR(b.start_date, 'YYYY-MM-DD') as start_date, TO_CHAR(b.end_date, 'YYYY-MM-DD') as end_date,
          b.locations
          FROM dbo.am_budget_mst b`;
        countBaseQuery = `SELECT COUNT(*) as total FROM dbo.am_budget_mst b`;

        if (filters.fromDate) {
          conditions.push(`b.start_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`b.start_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`b.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.businessEntity?.length) {
          conditions.push(`b.business_entity_name = ANY($${paramIdx}::text[])`);
          params.push(filters.businessEntity);
          paramIdx++;
        }
        if (filters.budgetOwner?.length) {
          conditions.push(`b.budget_owner_name = ANY($${paramIdx}::text[])`);
          params.push(filters.budgetOwner);
          paramIdx++;
        }
        orderBy = "ORDER BY b.id ASC";
        break;
      }

      case "p2p-overview": {
        baseQuery = `SELECT DISTINCT pr.pr_number, pr.pr_description, pr.pr_status, pr.department_name,
          po.po_number, po.po_status, s.company_name as supplier_name, po.po_total_cost,
          TO_CHAR(po.creation_date, 'YYYY-MM-DD') as po_date,
          inv.invoice_number, inv.invoice_status, inv.invoice_amount, inv.inv_payment_status as payment_status
          FROM dbo.supp_pr_header_dtls pr
          LEFT JOIN dbo.supp_po_header_dtls po ON po.pr_number = pr.pr_number
          LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id
          LEFT JOIN dbo.supp_invoice_dtls inv ON inv.po_number = po.po_number`;
        countBaseQuery = `SELECT COUNT(DISTINCT pr.pr_number || COALESCE(po.po_number,'') || COALESCE(inv.invoice_number,'')) as total
          FROM dbo.supp_pr_header_dtls pr
          LEFT JOIN dbo.supp_po_header_dtls po ON po.pr_number = pr.pr_number
          LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id
          LEFT JOIN dbo.supp_invoice_dtls inv ON inv.po_number = po.po_number`;

        if (filters.fromDate) {
          conditions.push(`pr.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`pr.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`po.po_status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`pr.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`s.company_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        orderBy = "ORDER BY pr.pr_number ASC";
        break;
      }

      case "grn-report": {
        baseQuery = `SELECT g.po_number, g.item_name, g.order_qty, g.received_qty, g.rejected_qty,
          TO_CHAR(g.received_date, 'YYYY-MM-DD') as received_date, g.status, g.received_by_name,
          s.company_name as supplier_name
          FROM dbo.supp_po_grn_line_dtls g
          LEFT JOIN dbo.supp_po_header_dtls po ON po.po_number = g.po_number
          LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id`;
        countBaseQuery = `SELECT COUNT(*) as total
          FROM dbo.supp_po_grn_line_dtls g
          LEFT JOIN dbo.supp_po_header_dtls po ON po.po_number = g.po_number
          LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id`;

        if (filters.fromDate) {
          conditions.push(`g.received_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`g.received_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`g.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`s.company_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        orderBy = "ORDER BY g.received_date DESC NULLS LAST";
        break;
      }

      case "supplier-performance": {
        baseQuery = `SELECT s.company_name as supplier_name,
          COUNT(DISTINCT po.po_number) as total_pos,
          COUNT(g.po_number) as total_grn_lines,
          COALESCE(SUM(g.order_qty), 0) as total_ordered,
          COALESCE(SUM(g.received_qty), 0) as total_received,
          COALESCE(SUM(g.rejected_qty), 0) as total_rejected,
          CASE WHEN SUM(g.order_qty) > 0 THEN ROUND((SUM(g.rejected_qty) * 100.0 / SUM(g.order_qty))::numeric, 1) ELSE 0 END as rejection_rate,
          SUM(CASE WHEN g.received_date <= po.po_supp_delivery_date THEN 1 ELSE 0 END) as on_time_deliveries,
          SUM(CASE WHEN g.received_date > po.po_supp_delivery_date THEN 1 ELSE 0 END) as late_deliveries,
          CASE WHEN COUNT(g.po_number) > 0 THEN ROUND((SUM(CASE WHEN g.received_date <= po.po_supp_delivery_date THEN 1 ELSE 0 END) * 100.0 / COUNT(g.po_number))::numeric, 1) ELSE 0 END as on_time_rate
          FROM dbo.supp_basic_org_dtls s
          JOIN dbo.supp_po_header_dtls po ON po.supplier_id = s.id
          JOIN dbo.supp_po_grn_line_dtls g ON g.po_number = po.po_number`;
        countBaseQuery = `SELECT COUNT(DISTINCT s.company_name) as total
          FROM dbo.supp_basic_org_dtls s
          JOIN dbo.supp_po_header_dtls po ON po.supplier_id = s.id
          JOIN dbo.supp_po_grn_line_dtls g ON g.po_number = po.po_number`;

        if (filters.fromDate) {
          conditions.push(`g.received_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`g.received_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`s.company_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        orderBy = "GROUP BY s.company_name ORDER BY total_pos DESC";
        break;
      }

      case "aging-report": {
        baseQuery = `SELECT inv.invoice_number, inv.supplier_name, inv.department_name,
          TO_CHAR(inv.invoice_date, 'YYYY-MM-DD') as invoice_date,
          TO_CHAR(inv.inv_due_date, 'YYYY-MM-DD') as inv_due_date,
          inv.invoice_amount, inv.balance_amount,
          GREATEST(0, EXTRACT(DAY FROM NOW() - inv.inv_due_date)::int) as days_overdue,
          CASE
            WHEN inv.inv_due_date >= NOW() THEN 'Current'
            WHEN EXTRACT(DAY FROM NOW() - inv.inv_due_date) <= 30 THEN '1-30 Days'
            WHEN EXTRACT(DAY FROM NOW() - inv.inv_due_date) <= 60 THEN '31-60 Days'
            WHEN EXTRACT(DAY FROM NOW() - inv.inv_due_date) <= 90 THEN '61-90 Days'
            ELSE '90+ Days'
          END as aging_bucket,
          inv.invoice_status, inv.inv_payment_status
          FROM dbo.supp_invoice_dtls inv`;
        countBaseQuery = `SELECT COUNT(*) as total FROM dbo.supp_invoice_dtls inv`;

        conditions.push(`(inv.inv_payment_status != 'Fully Paid' OR inv.balance_amount > 0)`);
        conditions.push(`inv.inv_due_date IS NOT NULL`);

        if (filters.fromDate) {
          conditions.push(`inv.invoice_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`inv.invoice_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`inv.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`inv.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        orderBy = "ORDER BY days_overdue DESC";
        break;
      }

      case "bid-summary": {
        baseQuery = `SELECT b.bid_title, b.type as bid_type, b.status, b.buyer_name, b.department_name,
          TO_CHAR(b.startdate, 'YYYY-MM-DD') as start_date,
          TO_CHAR(b.enddate, 'YYYY-MM-DD') as end_date,
          b.pr_amount,
          b.awarded_amount,
          CASE WHEN b.pr_amount > 0 AND b.awarded_amount > 0 THEN b.pr_amount - b.awarded_amount ELSE 0 END as savings,
          CASE WHEN b.pr_amount > 0 AND b.awarded_amount > 0 THEN ROUND(((b.pr_amount - b.awarded_amount) * 100.0 / b.pr_amount)::numeric, 1) ELSE 0 END as savings_pct,
          (SELECT COUNT(*) FROM dbo.supp_bid_response_dtls r WHERE r.bidrefno = b.id) as response_count
          FROM dbo.supp_bid_dtls b`;
        countBaseQuery = `SELECT COUNT(*) as total FROM dbo.supp_bid_dtls b`;

        if (filters.fromDate) {
          conditions.push(`b.created_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`b.created_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`b.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.bidType?.length) {
          conditions.push(`b.type = ANY($${paramIdx}::text[])`);
          params.push(filters.bidType);
          paramIdx++;
        }
        orderBy = "ORDER BY b.created_date DESC";
        break;
      }

case "contract-register": {
        baseQuery = `SELECT c.id, c.contr_ref_no, c.title, c.status, c.type, c.supplier_name,
          c.department_name, c.owner_name, c.contract_amount, c.currency,
          TO_CHAR(c.start_date, 'YYYY-MM-DD') as start_date,
          TO_CHAR(c.end_date, 'YYYY-MM-DD') as end_date,
          c.is_renewable
          FROM dbo.cm_header c`;
        countBaseQuery = `SELECT COUNT(*) as total FROM dbo.cm_header c`;

        if (filters.fromDate) {
          conditions.push(`c.start_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`c.start_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`c.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`c.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`c.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        if (filters.contractType?.length) {
          conditions.push(`c.type = ANY($${paramIdx}::text[])`);
          params.push(filters.contractType);
          paramIdx++;
        }
        if (filters.contractOwner?.length) {
          conditions.push(`c.owner_name = ANY($${paramIdx}::text[])`);
          params.push(filters.contractOwner);
          paramIdx++;
        }
        orderBy = "ORDER BY c.id DESC";
        break;
      }

      case "contract-expiry": {
        baseQuery = `SELECT c.id, c.contr_ref_no, c.title, c.status, c.supplier_name,
          c.department_name, c.owner_name, c.contract_amount, c.currency,
          TO_CHAR(c.start_date, 'YYYY-MM-DD') as start_date,
          TO_CHAR(c.end_date, 'YYYY-MM-DD') as end_date,
          EXTRACT(DAY FROM c.end_date - NOW())::int as days_to_expiry,
          CASE
            WHEN c.end_date < NOW() THEN 'Expired'
            WHEN EXTRACT(DAY FROM c.end_date - NOW()) <= 30 THEN '≤30 Days'
            WHEN EXTRACT(DAY FROM c.end_date - NOW()) <= 60 THEN '31-60 Days'
            WHEN EXTRACT(DAY FROM c.end_date - NOW()) <= 90 THEN '61-90 Days'
            ELSE '>90 Days'
          END as expiry_bucket,
          c.is_renewable
          FROM dbo.cm_header c`;
        countBaseQuery = `SELECT COUNT(*) as total FROM dbo.cm_header c`;
        conditions.push(`c.end_date IS NOT NULL`);

        if (filters.fromDate) {
          conditions.push(`c.end_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`c.end_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`c.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`c.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`c.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        orderBy = "ORDER BY c.end_date ASC";
        break;
      }

      case "contract-spend": {
        baseQuery = `SELECT c.id, c.contr_ref_no, c.title, c.status, c.supplier_name,
          c.department_name, COALESCE(c.contract_amount, 0) as contract_amount,
          COALESCE(c.invoicedamount, 0) as invoicedamount,
          GREATEST(0, COALESCE(c.contract_amount, 0) - COALESCE(c.invoicedamount, 0)) as remaining_amount,
          CASE WHEN COALESCE(c.contract_amount, 0) > 0
            THEN ROUND((COALESCE(c.invoicedamount, 0) * 100.0 / c.contract_amount)::numeric, 1)
            ELSE 0 END as utilization_pct,
          c.currency,
          TO_CHAR(c.start_date, 'YYYY-MM-DD') as start_date,
          TO_CHAR(c.end_date, 'YYYY-MM-DD') as end_date
          FROM dbo.cm_header c`;
        countBaseQuery = `SELECT COUNT(*) as total FROM dbo.cm_header c`;

        if (filters.fromDate) {
          conditions.push(`c.start_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`c.start_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`c.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`c.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`c.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        orderBy = "ORDER BY c.contract_amount DESC NULLS LAST";
        break;
      }
	  
      default:
        throw new Error(`Unknown report: ${reportId}`);
    }

    const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
    const page = filters.page || 0;
    const pageSize = filters.pageSize || 50;
    const offset = page * pageSize;

    const fullDataQuery = `${baseQuery}${whereClause} ${orderBy} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(pageSize, offset);
    const fullCountQuery = `${countBaseQuery}${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      getPool().query(fullDataQuery, params),
      getPool().query(fullCountQuery, params.slice(0, params.length - 2))
    ]);

    const rows = dataResult.rows || [];
    const countRows = countResult.rows || [];
    const total = countRows.length > 0 ? parseInt(String((countRows[0] as any).total || 0)) : 0;

    return { rows, total, page, pageSize };
  }

  async getReportSummary(reportId: string, filters: QueryFilter) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    switch (reportId) {
      case "supplier-by-category": {
        if (filters.fromDate) {
          conditions.push(`s.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`s.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`s.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.category?.length) {
          conditions.push(`s.id IN (SELECT sc.supp_org_id FROM dbo.supp_scope_of_supply_service sc WHERE sc.service_details = ANY($${paramIdx}::text[]))`);
          params.push(filters.category);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const [totalRes, statusRes, countryRes] = await Promise.all([
          getPool().query(`SELECT COUNT(DISTINCT s.id) as total FROM dbo.supp_basic_org_dtls s${whereClause}`, params),
          getPool().query(`SELECT s.status, COUNT(DISTINCT s.id) as count FROM dbo.supp_basic_org_dtls s${whereClause} GROUP BY s.status ORDER BY count DESC`, params),
          getPool().query(`SELECT s.country, COUNT(DISTINCT s.id) as count FROM dbo.supp_basic_org_dtls s${whereClause}${conditions.length > 0 ? " AND" : " WHERE"} s.country IS NOT NULL GROUP BY s.country ORDER BY count DESC LIMIT 10`, params),
        ]);
        return {
          totalSuppliers: parseInt(String(totalRes.rows[0]?.total || 0)),
          statusBreakdown: statusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
          topCountries: countryRes.rows.map((r: any) => ({ country: r.country, count: parseInt(String(r.count)) })),
        };
      }

      case "requisitions-by-item": {
        if (filters.fromDate) {
          conditions.push(`pr.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`pr.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`pr.pr_status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`pr.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.requestor?.length) {
          conditions.push(`pr.pr_owner_name = ANY($${paramIdx}::text[])`);
          params.push(filters.requestor);
          paramIdx++;
        }
        if (filters.budget?.length) {
          conditions.push(`pr.budget_name = ANY($${paramIdx}::text[])`);
          params.push(filters.budget);
          paramIdx++;
        }
        if (filters.location?.length) {
          conditions.push(`pr.delivertto_location_name = ANY($${paramIdx}::text[])`);
          params.push(filters.location);
          paramIdx++;
        }
        if (filters.category?.length) {
          conditions.push(`pr.pr_number IN (SELECT pl.pr_number FROM dbo.supp_pr_line_dtls pl WHERE pl.product_category_name = ANY($${paramIdx}::text[]))`);
          params.push(filters.category);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const [totalRes, statusRes, deptRes] = await Promise.all([
          getPool().query(`SELECT COUNT(DISTINCT pr.pr_number) as total, COALESCE(SUM(pr.pr_amount), 0) as total_amount, COALESCE(AVG(pr.pr_amount), 0) as avg_amount FROM dbo.supp_pr_header_dtls pr${whereClause}`, params),
          getPool().query(`SELECT pr.pr_status as status, COUNT(DISTINCT pr.pr_number) as count FROM dbo.supp_pr_header_dtls pr${whereClause} GROUP BY pr.pr_status ORDER BY count DESC`, params),
          getPool().query(`SELECT pr.department_name as department, COUNT(DISTINCT pr.pr_number) as count FROM dbo.supp_pr_header_dtls pr${whereClause}${conditions.length > 0 ? " AND" : " WHERE"} pr.department_name IS NOT NULL GROUP BY pr.department_name ORDER BY count DESC`, params),
        ]);
        return {
          totalPRs: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalAmount: parseFloat(String(totalRes.rows[0]?.total_amount || 0)),
          avgAmount: parseFloat(String(totalRes.rows[0]?.avg_amount || 0)),
          statusBreakdown: statusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
          byDepartment: deptRes.rows.map((r: any) => ({ department: r.department, count: parseInt(String(r.count)) })),
        };
      }

      case "po-by-department": {
        if (filters.fromDate) {
          conditions.push(`po.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`po.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`po.po_status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`po.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`po.company_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        if (filters.buyer?.length) {
          conditions.push(`po.buyer_name = ANY($${paramIdx}::text[])`);
          params.push(filters.buyer);
          paramIdx++;
        }
        if (filters.budget?.length) {
          conditions.push(`po.budget_name = ANY($${paramIdx}::text[])`);
          params.push(filters.budget);
          paramIdx++;
        }
        if (filters.category?.length) {
          conditions.push(`po.po_number IN (SELECT pol.po_number FROM dbo.supp_po_line_dtls pol WHERE pol.product_category_name = ANY($${paramIdx}::text[]))`);
          params.push(filters.category);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const extraCondition = conditions.length > 0 ? " AND" : " WHERE";
        const [totalRes, statusRes, deptRes, suppRes] = await Promise.all([
          getPool().query(`SELECT COUNT(DISTINCT po.po_number) as total, COALESCE(SUM(po.po_total_cost), 0) as total_cost, COALESCE(AVG(po.po_total_cost), 0) as avg_cost FROM dbo.supp_po_header_dtls po${whereClause}`, params),
          getPool().query(`SELECT po.po_status as status, COUNT(DISTINCT po.po_number) as count FROM dbo.supp_po_header_dtls po${whereClause} GROUP BY po.po_status ORDER BY count DESC`, params),
          getPool().query(`SELECT po.department_name as department, COUNT(DISTINCT po.po_number) as count FROM dbo.supp_po_header_dtls po${whereClause}${extraCondition} po.department_name IS NOT NULL GROUP BY po.department_name ORDER BY count DESC`, params),
          getPool().query(`SELECT po.company_name as supplier, COALESCE(SUM(po.po_total_cost), 0) as total FROM dbo.supp_po_header_dtls po${whereClause}${extraCondition} po.company_name IS NOT NULL GROUP BY po.company_name ORDER BY total DESC LIMIT 10`, params),
        ]);
        return {
          totalPOs: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalCost: parseFloat(String(totalRes.rows[0]?.total_cost || 0)),
          avgCost: parseFloat(String(totalRes.rows[0]?.avg_cost || 0)),
          statusBreakdown: statusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
          byDepartment: deptRes.rows.map((r: any) => ({ department: r.department, count: parseInt(String(r.count)) })),
          topSuppliers: suppRes.rows.map((r: any) => ({ supplier: r.supplier, total: parseFloat(String(r.total)) })),
        };
      }

      case "invoice-summary": {
        if (filters.fromDate) {
          conditions.push(`inv.invoice_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`inv.invoice_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`inv.invoice_status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`inv.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`inv.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        if (filters.budget?.length) {
          conditions.push(`inv.budget_name = ANY($${paramIdx}::text[])`);
          params.push(filters.budget);
          paramIdx++;
        }
        if (filters.invoiceType?.length) {
          conditions.push(`inv.invoice_type = ANY($${paramIdx}::text[])`);
          params.push(filters.invoiceType);
          paramIdx++;
        }
        if (filters.paymentTerms?.length) {
          conditions.push(`inv.payment_terms_name = ANY($${paramIdx}::text[])`);
          params.push(filters.paymentTerms);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const extraCondition = conditions.length > 0 ? " AND" : " WHERE";
        const [totalRes, statusRes, payStatusRes, suppRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, COALESCE(SUM(inv.invoice_amount), 0) as total_amount, COALESCE(AVG(inv.invoice_amount), 0) as avg_amount FROM dbo.supp_invoice_dtls inv${whereClause}`, params),
          getPool().query(`SELECT inv.invoice_status as status, COUNT(*) as count FROM dbo.supp_invoice_dtls inv${whereClause} GROUP BY inv.invoice_status ORDER BY count DESC`, params),
          getPool().query(`SELECT inv.inv_payment_status as status, COUNT(*) as count FROM dbo.supp_invoice_dtls inv${whereClause}${extraCondition} inv.inv_payment_status IS NOT NULL GROUP BY inv.inv_payment_status ORDER BY count DESC`, params),
          getPool().query(`SELECT inv.supplier_name as supplier, COALESCE(SUM(inv.invoice_amount), 0) as total FROM dbo.supp_invoice_dtls inv${whereClause}${extraCondition} inv.supplier_name IS NOT NULL GROUP BY inv.supplier_name ORDER BY total DESC LIMIT 10`, params),
        ]);
        return {
          totalInvoices: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalAmount: parseFloat(String(totalRes.rows[0]?.total_amount || 0)),
          avgAmount: parseFloat(String(totalRes.rows[0]?.avg_amount || 0)),
          statusBreakdown: statusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
          byPaymentStatus: payStatusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
          topSuppliers: suppRes.rows.map((r: any) => ({ supplier: r.supplier, total: parseFloat(String(r.total)) })),
        };
      }

      case "user-report": {
        if (filters.fromDate) {
          conditions.push(`u.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`u.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          const statusInts = filters.status.map(s => s === "Active" ? 1 : s === "Inactive" ? 2 : s);
          conditions.push(`u.user_status = ANY($${paramIdx}::int[])`);
          params.push(statusInts);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`u.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        const effectiveUserTypesSummary = filters.userType?.length ? filters.userType : ["Users"];
        const mappedUserTypesSummary = effectiveUserTypesSummary.map(t => t === "Users" ? "0" : t === "Vendors" ? "1" : t);
        conditions.push(`u.user_type::text = ANY($${paramIdx}::text[])`);
        params.push(mappedUserTypesSummary);
        paramIdx++;
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const extraCondition = conditions.length > 0 ? " AND" : " WHERE";
        const [totalRes, deptRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, SUM(CASE WHEN u.user_status = 1 THEN 1 ELSE 0 END) as active_count, SUM(CASE WHEN u.user_status = 2 THEN 1 ELSE 0 END) as inactive_count FROM dbo.um_user_dtls u${whereClause}`, params),
          getPool().query(`SELECT u.department_name as department, COUNT(*) as count FROM dbo.um_user_dtls u${whereClause}${extraCondition} u.department_name IS NOT NULL GROUP BY u.department_name ORDER BY count DESC`, params),
        ]);
        return {
          totalUsers: parseInt(String(totalRes.rows[0]?.total || 0)),
          activeCount: parseInt(String(totalRes.rows[0]?.active_count || 0)),
          inactiveCount: parseInt(String(totalRes.rows[0]?.inactive_count || 0)),
          byDepartment: deptRes.rows.map((r: any) => ({ department: r.department, count: parseInt(String(r.count)) })),
        };
      }

      case "budget-summary": {
        if (filters.fromDate) {
          conditions.push(`b.start_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`b.start_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`b.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.businessEntity?.length) {
          conditions.push(`b.business_entity_name = ANY($${paramIdx}::text[])`);
          params.push(filters.businessEntity);
          paramIdx++;
        }
        if (filters.budgetOwner?.length) {
          conditions.push(`b.budget_owner_name = ANY($${paramIdx}::text[])`);
          params.push(filters.budgetOwner);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const [totalRes, statusRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, COALESCE(SUM(b.budget_amount), 0) as total_budget, COALESCE(SUM(b.consumed_amount), 0) as total_consumed, COALESCE(SUM(b.reserved_amount), 0) as total_reserved FROM dbo.am_budget_mst b${whereClause}`, params),
          getPool().query(`SELECT b.status, COUNT(*) as count FROM dbo.am_budget_mst b${whereClause} GROUP BY b.status ORDER BY count DESC`, params),
        ]);
        const totalBudget = parseFloat(String(totalRes.rows[0]?.total_budget || 0));
        const totalConsumed = parseFloat(String(totalRes.rows[0]?.total_consumed || 0));
        return {
          totalBudgets: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalBudgetAmount: totalBudget,
          totalConsumed,
          totalReserved: parseFloat(String(totalRes.rows[0]?.total_reserved || 0)),
          utilizationPct: totalBudget > 0 ? Math.round((totalConsumed / totalBudget) * 10000) / 100 : 0,
          statusBreakdown: statusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
        };
      }

      case "p2p-overview": {
        if (filters.fromDate) {
          conditions.push(`pr.creation_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`pr.creation_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`po.po_status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`pr.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`s.company_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const joinClause = `FROM dbo.supp_pr_header_dtls pr LEFT JOIN dbo.supp_po_header_dtls po ON po.pr_number = pr.pr_number LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id`;
        const [prRes, poRes, invRes, deptRes] = await Promise.all([
          getPool().query(`SELECT COUNT(DISTINCT pr.pr_number) as total_prs ${joinClause}${whereClause}`, params),
          getPool().query(`SELECT COUNT(DISTINCT po.po_number) as total_pos, COALESCE(SUM(po.po_total_cost), 0) as total_po_value ${joinClause}${whereClause}${conditions.length > 0 ? " AND" : " WHERE"} po.po_number IS NOT NULL`, params),
          getPool().query(`SELECT COUNT(DISTINCT inv.invoice_number) as total_invs, COALESCE(SUM(inv.invoice_amount), 0) as total_inv_value ${joinClause} LEFT JOIN dbo.supp_invoice_dtls inv ON inv.po_number = po.po_number${whereClause}${conditions.length > 0 ? " AND" : " WHERE"} inv.invoice_number IS NOT NULL`, params),
          getPool().query(`SELECT pr.department_name as department, COUNT(DISTINCT pr.pr_number) as count ${joinClause}${whereClause}${conditions.length > 0 ? " AND" : " WHERE"} pr.department_name IS NOT NULL GROUP BY pr.department_name ORDER BY count DESC LIMIT 10`, params),
        ]);
        return {
          totalPRs: parseInt(String(prRes.rows[0]?.total_prs || 0)),
          totalPOs: parseInt(String(poRes.rows[0]?.total_pos || 0)),
          totalPOValue: parseFloat(String(poRes.rows[0]?.total_po_value || 0)),
          totalInvoices: parseInt(String(invRes.rows[0]?.total_invs || 0)),
          totalInvoiceValue: parseFloat(String(invRes.rows[0]?.total_inv_value || 0)),
          byDepartment: deptRes.rows.map((r: any) => ({ department: r.department, count: parseInt(String(r.count)) })),
        };
      }

      case "grn-report": {
        if (filters.fromDate) {
          conditions.push(`g.received_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`g.received_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`g.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`s.company_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const grnJoin = `FROM dbo.supp_po_grn_line_dtls g LEFT JOIN dbo.supp_po_header_dtls po ON po.po_number = g.po_number LEFT JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id`;
        const extraCondition = conditions.length > 0 ? " AND" : " WHERE";
        const [totalRes, statusRes, topItemsRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, COALESCE(SUM(g.order_qty), 0) as total_ordered, COALESCE(SUM(g.received_qty), 0) as total_received, COALESCE(SUM(g.rejected_qty), 0) as total_rejected ${grnJoin}${whereClause}`, params),
          getPool().query(`SELECT g.status, COUNT(*) as count ${grnJoin}${whereClause} GROUP BY g.status ORDER BY count DESC`, params),
          getPool().query(`SELECT g.item_name as item, COALESCE(SUM(g.received_qty), 0) as qty ${grnJoin}${whereClause}${extraCondition} g.item_name IS NOT NULL GROUP BY g.item_name ORDER BY qty DESC LIMIT 10`, params),
        ]);
        return {
          totalLines: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalOrdered: parseFloat(String(totalRes.rows[0]?.total_ordered || 0)),
          totalReceived: parseFloat(String(totalRes.rows[0]?.total_received || 0)),
          totalRejected: parseFloat(String(totalRes.rows[0]?.total_rejected || 0)),
          statusBreakdown: statusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
          topItems: topItemsRes.rows.map((r: any) => ({ item: r.item, qty: String(r.qty) })),
        };
      }

      case "supplier-performance": {
        if (filters.fromDate) {
          conditions.push(`g.received_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`g.received_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`s.company_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const spJoin = `FROM dbo.supp_basic_org_dtls s JOIN dbo.supp_po_header_dtls po ON po.supplier_id = s.id JOIN dbo.supp_po_grn_line_dtls g ON g.po_number = po.po_number`;
        const [totalRes, topByOrdersRes, topByRejectionRes] = await Promise.all([
          getPool().query(`SELECT COUNT(DISTINCT s.company_name) as total_suppliers, CASE WHEN SUM(g.order_qty) > 0 THEN ROUND((SUM(g.rejected_qty) * 100.0 / SUM(g.order_qty))::numeric, 1) ELSE 0 END as avg_rejection_rate, CASE WHEN COUNT(g.po_number) > 0 THEN ROUND((SUM(CASE WHEN g.received_date <= po.po_supp_delivery_date THEN 1 ELSE 0 END) * 100.0 / COUNT(g.po_number))::numeric, 1) ELSE 0 END as avg_on_time_rate ${spJoin}${whereClause}`, params),
          getPool().query(`SELECT s.company_name as supplier, COUNT(DISTINCT po.po_number) as count ${spJoin}${whereClause} GROUP BY s.company_name ORDER BY count DESC LIMIT 10`, params),
          getPool().query(`SELECT s.company_name as supplier, CASE WHEN SUM(g.order_qty) > 0 THEN ROUND((SUM(g.rejected_qty) * 100.0 / SUM(g.order_qty))::numeric, 1) ELSE 0 END as rate ${spJoin}${whereClause} GROUP BY s.company_name HAVING SUM(g.order_qty) > 0 ORDER BY rate DESC LIMIT 5`, params),
        ]);
        return {
          totalSuppliers: parseInt(String(totalRes.rows[0]?.total_suppliers || 0)),
          avgRejectionRate: parseFloat(String(totalRes.rows[0]?.avg_rejection_rate || 0)),
          avgOnTimeRate: parseFloat(String(totalRes.rows[0]?.avg_on_time_rate || 0)),
          topByOrders: topByOrdersRes.rows.map((r: any) => ({ supplier: r.supplier, count: parseInt(String(r.count)) })),
          topByRejection: topByRejectionRes.rows.map((r: any) => ({ supplier: r.supplier, rate: String(r.rate) })),
        };
      }

      case "aging-report": {
        conditions.push(`(inv.inv_payment_status != 'Fully Paid' OR inv.balance_amount > 0)`);
        conditions.push(`inv.inv_due_date IS NOT NULL`);
        if (filters.fromDate) {
          conditions.push(`inv.invoice_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`inv.invoice_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`inv.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`inv.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const extraCondition = conditions.length > 0 ? " AND" : " WHERE";
        const [totalRes, overdueRes, bucketRes, suppRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, COALESCE(SUM(inv.balance_amount), 0) as total_outstanding FROM dbo.supp_invoice_dtls inv${whereClause}`, params),
          getPool().query(`SELECT COALESCE(SUM(inv.balance_amount), 0) as overdue_amount FROM dbo.supp_invoice_dtls inv${whereClause}${extraCondition} inv.inv_due_date < NOW()`, params),
          getPool().query(`SELECT CASE WHEN inv.inv_due_date >= NOW() THEN 'Current' WHEN EXTRACT(DAY FROM NOW() - inv.inv_due_date) <= 30 THEN '1-30 Days' WHEN EXTRACT(DAY FROM NOW() - inv.inv_due_date) <= 60 THEN '31-60 Days' WHEN EXTRACT(DAY FROM NOW() - inv.inv_due_date) <= 90 THEN '61-90 Days' ELSE '90+ Days' END as bucket, COUNT(*) as count FROM dbo.supp_invoice_dtls inv${whereClause} GROUP BY bucket ORDER BY count DESC`, params),
          getPool().query(`SELECT inv.supplier_name as supplier, COALESCE(SUM(inv.balance_amount), 0) as amount FROM dbo.supp_invoice_dtls inv${whereClause}${extraCondition} inv.supplier_name IS NOT NULL GROUP BY inv.supplier_name ORDER BY amount DESC LIMIT 10`, params),
        ]);
        return {
          totalOutstanding: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalOutstandingAmount: parseFloat(String(totalRes.rows[0]?.total_outstanding || 0)),
          overdueAmount: parseFloat(String(overdueRes.rows[0]?.overdue_amount || 0)),
          agingBuckets: bucketRes.rows.map((r: any) => ({ bucket: r.bucket, count: parseInt(String(r.count)) })),
          topSuppliers: suppRes.rows.map((r: any) => ({ supplier: r.supplier, amount: String(r.amount) })),
        };
      }

      case "bid-summary": {
        if (filters.fromDate) {
          conditions.push(`b.created_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`b.created_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`b.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.bidType?.length) {
          conditions.push(`b.type = ANY($${paramIdx}::text[])`);
          params.push(filters.bidType);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const [totalRes, statusRes, typeRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, COALESCE(SUM(b.pr_amount), 0) as total_pr, COALESCE(SUM(b.awarded_amount), 0) as total_awarded, COALESCE(SUM(CASE WHEN b.pr_amount > 0 AND b.awarded_amount > 0 THEN b.pr_amount - b.awarded_amount ELSE 0 END), 0) as total_savings FROM dbo.supp_bid_dtls b${whereClause}`, params),
          getPool().query(`SELECT b.status, COUNT(*) as count FROM dbo.supp_bid_dtls b${whereClause} GROUP BY b.status ORDER BY count DESC`, params),
          getPool().query(`SELECT b.type, COUNT(*) as count FROM dbo.supp_bid_dtls b${whereClause} GROUP BY b.type ORDER BY count DESC`, params),
        ]);
        return {
          totalBids: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalPRAmount: parseFloat(String(totalRes.rows[0]?.total_pr || 0)),
          totalAwarded: parseFloat(String(totalRes.rows[0]?.total_awarded || 0)),
          totalSavings: parseFloat(String(totalRes.rows[0]?.total_savings || 0)),
          statusBreakdown: statusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
          byType: typeRes.rows.map((r: any) => ({ type: r.type, count: parseInt(String(r.count)) })),
        };
      }

case "contract-register": {
        if (filters.fromDate) {
          conditions.push(`c.start_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`c.start_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`c.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`c.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`c.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        if (filters.contractType?.length) {
          conditions.push(`c.type = ANY($${paramIdx}::text[])`);
          params.push(filters.contractType);
          paramIdx++;
        }
        if (filters.contractOwner?.length) {
          conditions.push(`c.owner_name = ANY($${paramIdx}::text[])`);
          params.push(filters.contractOwner);
          paramIdx++;
        }
        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const extraCondition = conditions.length > 0 ? " AND" : " WHERE";
        const [totalRes, statusRes, deptRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, COALESCE(SUM(c.contract_amount), 0) as total_value, COALESCE(AVG(c.contract_amount), 0) as avg_value FROM dbo.cm_header c${whereClause}`, params),
          getPool().query(`SELECT c.status, COUNT(*) as count FROM dbo.cm_header c${whereClause} GROUP BY c.status ORDER BY count DESC`, params),
          getPool().query(`SELECT c.department_name as department, COUNT(*) as count, COALESCE(SUM(c.contract_amount), 0) as value FROM dbo.cm_header c${whereClause}${extraCondition} c.department_name IS NOT NULL GROUP BY c.department_name ORDER BY value DESC LIMIT 10`, params),
        ]);
        return {
          totalContracts: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalValue: parseFloat(String(totalRes.rows[0]?.total_value || 0)),
          avgValue: parseFloat(String(totalRes.rows[0]?.avg_value || 0)),
          statusBreakdown: statusRes.rows.map((r: any) => ({ status: r.status, count: parseInt(String(r.count)) })),
          byDepartment: deptRes.rows.map((r: any) => ({ department: r.department, count: parseInt(String(r.count)), value: parseFloat(String(r.value)) })),
        };
      }

      case "contract-expiry": {
        const baseConditions = [`c.end_date IS NOT NULL`];
        const expiryParams: any[] = [];
        let expiryIdx = 1;
        if (filters.fromDate) {
          baseConditions.push(`c.end_date >= $${expiryIdx}::timestamp`);
          expiryParams.push(filters.fromDate);
          expiryIdx++;
        }
        if (filters.toDate) {
          baseConditions.push(`c.end_date <= $${expiryIdx}::timestamp`);
          expiryParams.push(filters.toDate + "T23:59:59.999Z");
          expiryIdx++;
        }
        if (filters.status?.length) {
          baseConditions.push(`c.status = ANY($${expiryIdx}::text[])`);
          expiryParams.push(filters.status);
          expiryIdx++;
        }
        if (filters.department?.length) {
          baseConditions.push(`c.department_name = ANY($${expiryIdx}::text[])`);
          expiryParams.push(filters.department);
          expiryIdx++;
        }
        if (filters.supplier?.length) {
          baseConditions.push(`c.supplier_name = ANY($${expiryIdx}::text[])`);
          expiryParams.push(filters.supplier);
          expiryIdx++;
        }
        const expiryWhere = " WHERE " + baseConditions.join(" AND ");
        const [totalRes, bucketRes, renewableRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, COALESCE(SUM(c.contract_amount), 0) as total_value FROM dbo.cm_header c${expiryWhere}`, expiryParams),
          getPool().query(`SELECT
            CASE WHEN c.end_date < NOW() THEN 'Expired' WHEN EXTRACT(DAY FROM c.end_date - NOW()) <= 30 THEN '≤30 Days' WHEN EXTRACT(DAY FROM c.end_date - NOW()) <= 60 THEN '31-60 Days' WHEN EXTRACT(DAY FROM c.end_date - NOW()) <= 90 THEN '61-90 Days' ELSE '>90 Days' END as bucket,
            COUNT(*) as count FROM dbo.cm_header c${expiryWhere} GROUP BY bucket ORDER BY count DESC`, expiryParams),
          getPool().query(`SELECT COUNT(*) as renewable FROM dbo.cm_header c${expiryWhere} AND c.is_renewable = 'Yes'`, expiryParams),
        ]);
        return {
          totalContracts: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalValue: parseFloat(String(totalRes.rows[0]?.total_value || 0)),
          byExpiryBucket: bucketRes.rows.map((r: any) => ({ bucket: r.bucket, count: parseInt(String(r.count)) })),
          renewableCount: parseInt(String(renewableRes.rows[0]?.renewable || 0)),
        };
      }

      case "contract-spend": {
        if (filters.fromDate) {
          conditions.push(`c.start_date >= $${paramIdx}::timestamp`);
          params.push(filters.fromDate);
          paramIdx++;
        }
        if (filters.toDate) {
          conditions.push(`c.start_date <= $${paramIdx}::timestamp`);
          params.push(filters.toDate + "T23:59:59.999Z");
          paramIdx++;
        }
        if (filters.status?.length) {
          conditions.push(`c.status = ANY($${paramIdx}::text[])`);
          params.push(filters.status);
          paramIdx++;
        }
        if (filters.department?.length) {
          conditions.push(`c.department_name = ANY($${paramIdx}::text[])`);
          params.push(filters.department);
          paramIdx++;
        }
        if (filters.supplier?.length) {
          conditions.push(`c.supplier_name = ANY($${paramIdx}::text[])`);
          params.push(filters.supplier);
          paramIdx++;
        }
        const spendWhere = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        const spendExtra = conditions.length > 0 ? " AND" : " WHERE";
        const [totalRes, deptRes, suppRes] = await Promise.all([
          getPool().query(`SELECT COUNT(*) as total, COALESCE(SUM(c.contract_amount), 0) as total_contract, COALESCE(SUM(c.invoicedamount), 0) as total_invoiced FROM dbo.cm_header c${spendWhere}`, params),
          getPool().query(`SELECT c.department_name as department, COALESCE(SUM(c.contract_amount), 0) as contract_value, COALESCE(SUM(c.invoicedamount), 0) as invoiced_value FROM dbo.cm_header c${spendWhere}${spendExtra} c.department_name IS NOT NULL GROUP BY c.department_name ORDER BY contract_value DESC LIMIT 10`, params),
          getPool().query(`SELECT c.supplier_name as supplier, COALESCE(SUM(c.contract_amount), 0) as contract_value, COALESCE(SUM(c.invoicedamount), 0) as invoiced_value FROM dbo.cm_header c${spendWhere}${spendExtra} c.supplier_name IS NOT NULL AND c.supplier_name != 'N/A' GROUP BY c.supplier_name ORDER BY contract_value DESC LIMIT 10`, params),
        ]);
        const totalContract = parseFloat(String(totalRes.rows[0]?.total_contract || 0));
        const totalInvoiced = parseFloat(String(totalRes.rows[0]?.total_invoiced || 0));
        return {
          totalContracts: parseInt(String(totalRes.rows[0]?.total || 0)),
          totalContractValue: totalContract,
          totalInvoiced,
          overallUtilization: totalContract > 0 ? Math.round((totalInvoiced / totalContract) * 10000) / 100 : 0,
          byDepartment: deptRes.rows.map((r: any) => ({ department: r.department, contractValue: parseFloat(String(r.contract_value)), invoicedValue: parseFloat(String(r.invoiced_value)) })),
          topSuppliers: suppRes.rows.map((r: any) => ({ supplier: r.supplier, contractValue: parseFloat(String(r.contract_value)), invoicedValue: parseFloat(String(r.invoiced_value)) })),
        };
      }
      default:
        throw new Error(`Unknown report: ${reportId}`);
    }
  }

  async getFilterOptions(reportId: string) {
    const options: Record<string, string[]> = {};

    switch (reportId) {
      case "supplier-by-category": {
        const [statusRes, catRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT status FROM dbo.supp_basic_org_dtls WHERE status IS NOT NULL ORDER BY status`),
          getDb().execute(sql`SELECT DISTINCT service_details FROM dbo.supp_scope_of_supply_service WHERE service_details IS NOT NULL ORDER BY service_details`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.status);
        options.category = (catRes.rows || catRes).map((r: any) => r.service_details);
        break;
      }

      case "requisitions-by-item": {
        const [statusRes, deptRes, locRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT pr_status FROM dbo.supp_pr_header_dtls WHERE pr_status IS NOT NULL ORDER BY pr_status`),
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.supp_pr_header_dtls WHERE department_name IS NOT NULL ORDER BY department_name`),
          getDb().execute(sql`SELECT DISTINCT delivertto_location_name FROM dbo.supp_pr_header_dtls WHERE delivertto_location_name IS NOT NULL ORDER BY delivertto_location_name`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.pr_status);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        options.location = (locRes.rows || locRes).map((r: any) => r.delivertto_location_name);
        break;
      }

      case "po-by-department": {
        const [statusRes, deptRes, suppRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT po_status FROM dbo.supp_po_header_dtls WHERE po_status IS NOT NULL ORDER BY po_status`),
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.supp_po_header_dtls WHERE department_name IS NOT NULL ORDER BY department_name`),
          getDb().execute(sql`SELECT DISTINCT company_name FROM dbo.supp_po_header_dtls WHERE company_name IS NOT NULL ORDER BY company_name`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.po_status);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.company_name);
        break;
      }

      case "invoice-summary": {
        const [statusRes, deptRes, suppRes, typeRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT invoice_status FROM dbo.supp_invoice_dtls WHERE invoice_status IS NOT NULL ORDER BY invoice_status`),
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.supp_invoice_dtls WHERE department_name IS NOT NULL ORDER BY department_name`),
          getDb().execute(sql`SELECT DISTINCT supplier_name FROM dbo.supp_invoice_dtls WHERE supplier_name IS NOT NULL ORDER BY supplier_name`),
          getDb().execute(sql`SELECT DISTINCT invoice_type FROM dbo.supp_invoice_dtls WHERE invoice_type IS NOT NULL ORDER BY invoice_type`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.invoice_status);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.supplier_name);
        options.invoiceType = (typeRes.rows || typeRes).map((r: any) => r.invoice_type);
        break;
      }

      case "user-report": {
        const [deptRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.um_user_dtls WHERE department_name IS NOT NULL ORDER BY department_name`)
        ]);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        options.status = ["Active", "Inactive"];
        break;
      }

      case "budget-summary": {
        const [statusRes, entityRes, ownerRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT status FROM dbo.am_budget_mst WHERE status IS NOT NULL ORDER BY status`),
          getDb().execute(sql`SELECT DISTINCT business_entity_name FROM dbo.am_budget_mst WHERE business_entity_name IS NOT NULL ORDER BY business_entity_name`),
          getDb().execute(sql`SELECT DISTINCT budget_owner_name FROM dbo.am_budget_mst WHERE budget_owner_name IS NOT NULL ORDER BY budget_owner_name`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.status);
        options.businessEntity = (entityRes.rows || entityRes).map((r: any) => r.business_entity_name);
        options.budgetOwner = (ownerRes.rows || ownerRes).map((r: any) => r.budget_owner_name);
        break;
      }

      case "p2p-overview": {
        const [statusRes, deptRes, suppRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT po_status FROM dbo.supp_po_header_dtls WHERE po_status IS NOT NULL ORDER BY po_status`),
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.supp_pr_header_dtls WHERE department_name IS NOT NULL ORDER BY department_name`),
          getDb().execute(sql`SELECT DISTINCT s.company_name FROM dbo.supp_po_header_dtls po JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id WHERE s.company_name IS NOT NULL ORDER BY s.company_name`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.po_status);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.company_name);
        break;
      }

      case "grn-report": {
        const [statusRes, suppRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT status FROM dbo.supp_po_grn_line_dtls WHERE status IS NOT NULL ORDER BY status`),
          getDb().execute(sql`SELECT DISTINCT s.company_name FROM dbo.supp_po_header_dtls po JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id WHERE s.company_name IS NOT NULL ORDER BY s.company_name`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.status);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.company_name);
        break;
      }

      case "supplier-performance": {
        const [suppRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT s.company_name FROM dbo.supp_po_header_dtls po JOIN dbo.supp_basic_org_dtls s ON s.id = po.supplier_id JOIN dbo.supp_po_grn_line_dtls g ON g.po_number = po.po_number WHERE s.company_name IS NOT NULL ORDER BY s.company_name`)
        ]);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.company_name);
        break;
      }

      case "aging-report": {
        const [suppRes, deptRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT supplier_name FROM dbo.supp_invoice_dtls WHERE supplier_name IS NOT NULL ORDER BY supplier_name`),
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.supp_invoice_dtls WHERE department_name IS NOT NULL ORDER BY department_name`)
        ]);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.supplier_name);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        break;
      }

      case "bid-summary": {
        const [statusRes, typeRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT status FROM dbo.supp_bid_dtls WHERE status IS NOT NULL ORDER BY status`),
          getDb().execute(sql`SELECT DISTINCT type FROM dbo.supp_bid_dtls WHERE type IS NOT NULL ORDER BY type`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.status);
        options.bidType = (typeRes.rows || typeRes).map((r: any) => r.type);
        break;
      }
 case "contract-register": {
        const [statusRes, deptRes, suppRes, typeRes, ownerRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT status FROM dbo.cm_header WHERE status IS NOT NULL ORDER BY status`),
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.cm_header WHERE department_name IS NOT NULL ORDER BY department_name`),
          getDb().execute(sql`SELECT DISTINCT supplier_name FROM dbo.cm_header WHERE supplier_name IS NOT NULL AND supplier_name != 'N/A' ORDER BY supplier_name`),
          getDb().execute(sql`SELECT DISTINCT type FROM dbo.cm_header WHERE type IS NOT NULL ORDER BY type`),
          getDb().execute(sql`SELECT DISTINCT owner_name FROM dbo.cm_header WHERE owner_name IS NOT NULL ORDER BY owner_name`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.status);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.supplier_name);
        options.contractType = (typeRes.rows || typeRes).map((r: any) => r.type);
        options.contractOwner = (ownerRes.rows || ownerRes).map((r: any) => r.owner_name);
        break;
      }

      case "contract-expiry": {
        const [statusRes, deptRes, suppRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT status FROM dbo.cm_header WHERE status IS NOT NULL AND end_date IS NOT NULL ORDER BY status`),
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.cm_header WHERE department_name IS NOT NULL AND end_date IS NOT NULL ORDER BY department_name`),
          getDb().execute(sql`SELECT DISTINCT supplier_name FROM dbo.cm_header WHERE supplier_name IS NOT NULL AND supplier_name != 'N/A' AND end_date IS NOT NULL ORDER BY supplier_name`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.status);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.supplier_name);
        break;
      }

      case "contract-spend": {
        const [statusRes, deptRes, suppRes] = await Promise.all([
          getDb().execute(sql`SELECT DISTINCT status FROM dbo.cm_header WHERE status IS NOT NULL ORDER BY status`),
          getDb().execute(sql`SELECT DISTINCT department_name FROM dbo.cm_header WHERE department_name IS NOT NULL ORDER BY department_name`),
          getDb().execute(sql`SELECT DISTINCT supplier_name FROM dbo.cm_header WHERE supplier_name IS NOT NULL AND supplier_name != 'N/A' ORDER BY supplier_name`)
        ]);
        options.status = (statusRes.rows || statusRes).map((r: any) => r.status);
        options.department = (deptRes.rows || deptRes).map((r: any) => r.department_name);
        options.supplier = (suppRes.rows || suppRes).map((r: any) => r.supplier_name);
        break;
      }
    }
	
    return options;
  }

  async getTemplates(userId: number, reportId?: string): Promise<ReportTemplate[]> {
    let query = `SELECT id, user_id, report_id, template_name, filters, 
      TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as created_at,
      TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') as updated_at
      FROM dbo.report_templates WHERE user_id = $1`;
    const params: any[] = [userId];
    if (reportId) {
      query += ` AND report_id = $2`;
      params.push(reportId);
    }
    query += ` ORDER BY updated_at DESC`;
    const result = await getPool().query(query, params);
    return result.rows;
  }

  async createTemplate(userId: number, reportId: string, name: string, filters: Record<string, any>): Promise<ReportTemplate> {
    // Generate unique ID starting from 1000, ensuring it stays within integer range
    const maxIdResult = await getPool().query(`SELECT MAX(id) as max_id FROM dbo.report_templates`);
    let maxId = maxIdResult.rows[0]?.max_id || 999;
    
    // Cast to number and ensure it's within valid integer range
    maxId = Math.min(parseInt(String(maxId), 10), 2147483646);
    const id = Math.max(maxId + 1, 1000);
    
    const result = await getPool().query(
      `INSERT INTO dbo.report_templates (id, user_id, report_id, template_name, filters) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, report_id, template_name, filters,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as created_at,
       TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') as updated_at`,
      [id, userId, reportId, name, JSON.stringify(filters)]
    );
    return result.rows[0];
  }

  async updateTemplate(id: number, userId: number, name: string, filters: Record<string, any>): Promise<ReportTemplate | null> {
    const result = await getPool().query(
      `UPDATE dbo.report_templates SET template_name = $1, filters = $2, updated_at = NOW() 
       WHERE id = $3 AND user_id = $4 RETURNING id, user_id, report_id, template_name, filters,
       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as created_at,
       TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') as updated_at`,
      [name, JSON.stringify(filters), id, userId]
    );
    return result.rows[0] || null;
  }

  async deleteTemplate(id: number, userId: number): Promise<boolean> {
    const result = await getPool().query(
      `DELETE FROM dbo.report_templates WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount || 0) > 0;
  }
}
