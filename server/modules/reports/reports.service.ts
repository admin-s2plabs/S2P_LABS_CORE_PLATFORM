import { ReportsRepository } from "./reports.repository";

const reportsRepository = new ReportsRepository();

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  filters: FilterDefinition[];
  columns: ColumnDefinition[];
}

export interface FilterDefinition {
  key: string;
  label: string;
  type: "date" | "select" | "multiselect";
  options?: string[];
}

export interface ColumnDefinition {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "currency" | "status";
}

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "supplier-by-category",
    name: "Supplier Export by Category",
    description: "Export suppliers filtered by category, status, and date range",
    icon: "Truck",
    filters: [
      { key: "fromDate", label: "From Date", type: "date" },
      { key: "toDate", label: "To Date", type: "date" },
      { key: "status", label: "Status", type: "multiselect" },
      { key: "category", label: "Product Category", type: "multiselect" },
    ],
    columns: [
      { key: "company_name", label: "Company Name", type: "text" },
      { key: "status", label: "Status", type: "status" },
      { key: "legal_entity_type", label: "Entity Type", type: "text" },
      { key: "email_id", label: "Email", type: "text" },
      { key: "country", label: "Country", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "creation_date", label: "Registration Date", type: "date" },
      { key: "vendor_category", label: "Vendor Category", type: "text" },
      { key: "type_of_service", label: "Service Type", type: "text" },
    ],
  },
  {
    id: "requisitions-by-item",
    name: "Requisitions Export by Item",
    description: "Export purchase requisitions filtered by items, status, and department",
    icon: "FileText",
    filters: [
      { key: "fromDate", label: "Created From", type: "date" },
      { key: "toDate", label: "Created To", type: "date" },
      { key: "status", label: "Status", type: "multiselect" },
      { key: "department", label: "Department", type: "multiselect" },
      { key: "location", label: "Location", type: "multiselect" },
    ],
    columns: [
      { key: "pr_number", label: "PR Number", type: "text" },
      { key: "pr_description", label: "Description", type: "text" },
      { key: "pr_status", label: "Status", type: "status" },
      { key: "requestor", label: "Requestor", type: "text" },
      { key: "department_name", label: "Department", type: "text" },
      { key: "creation_date", label: "Created Date", type: "date" },
      { key: "delivery_date", label: "Delivery Date", type: "date" },
      { key: "budget_name", label: "Budget", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "pr_type", label: "PR Type", type: "text" },
      { key: "total_amount", label: "Total Amount", type: "currency" },
    ],
  },
  {
    id: "po-by-department",
    name: "Purchase Order Overview by Department",
    description: "Export purchase orders filtered by department, supplier, and status",
    icon: "ShoppingCart",
    filters: [
      { key: "fromDate", label: "Created From", type: "date" },
      { key: "toDate", label: "Created To", type: "date" },
      { key: "status", label: "Status", type: "multiselect" },
      { key: "department", label: "Department", type: "multiselect" },
      { key: "supplier", label: "Supplier", type: "multiselect" },
    ],
    columns: [
      { key: "po_number", label: "PO Number", type: "text" },
      { key: "po_description", label: "Description", type: "text" },
      { key: "po_status", label: "Status", type: "status" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "department_name", label: "Department", type: "text" },
      { key: "buyer_name", label: "Buyer", type: "text" },
      { key: "creation_date", label: "Created Date", type: "date" },
      { key: "required_date", label: "Required Date", type: "date" },
      { key: "po_total_cost", label: "Total Cost", type: "currency" },
      { key: "po_currency", label: "Currency", type: "text" },
      { key: "budget_name", label: "Budget", type: "text" },
      { key: "pr_number", label: "PR Number", type: "text" },
    ],
  },
  {
    id: "invoice-summary",
    name: "Invoice Summary Report",
    description: "Export invoices filtered by date, supplier, department, and payment status",
    icon: "Receipt",
    filters: [
      { key: "fromDate", label: "Invoice From", type: "date" },
      { key: "toDate", label: "Invoice To", type: "date" },
      { key: "status", label: "Status", type: "multiselect" },
      { key: "department", label: "Department", type: "multiselect" },
      { key: "supplier", label: "Supplier", type: "multiselect" },
      // { key: "invoiceType", label: "Invoice Type", type: "multiselect" },
    ],
    columns: [
      { key: "invoice_number", label: "Invoice No", type: "text" },
      { key: "invoice_status", label: "Status", type: "status" },
      { key: "supplier_name", label: "Supplier", type: "text" },
      { key: "department_name", label: "Department", type: "text" },
      { key: "po_number", label: "PO No", type: "text" },
      // { key: "invoice_type", label: "Invoice Type", type: "text" },
      { key: "invoice_date", label: "Inv. Date", type: "date" },
      { key: "due_date", label: "Due Date", type: "date" },
      { key: "invoice_amount", label: "Invoice Amount", type: "currency" },
      { key: "invoice_curr_code", label: "Currency", type: "text" },
      { key: "budget_name", label: "Budget", type: "text" },
      { key: "payment_terms_name", label: "Payment Terms", type: "text" },
      { key: "inv_payment_status", label: "Payment Status", type: "status" },
    ],
  },
  {
    id: "user-report",
    name: "Application User Report",
    description: "Export application users filtered by department, status, and role",
    icon: "Users",
    filters: [
      { key: "fromDate", label: "Created From", type: "date" },
      { key: "toDate", label: "Created To", type: "date" },
      { key: "status", label: "Status", type: "multiselect" },
      { key: "department", label: "Department", type: "multiselect" },
    ],
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "email_id", label: "Email", type: "text" },
      { key: "department_name", label: "Department", type: "text" },
      { key: "designation", label: "Designation", type: "text" },
      { key: "user_status", label: "Status", type: "status" },
      { key: "creation_date", label: "Created Date", type: "date" },
      { key: "last_login", label: "Last Login", type: "date" },
      { key: "manager_name", label: "Manager", type: "text" },
      { key: "mobile_no", label: "Mobile", type: "text" },
    ],
  },
  {
    id: "budget-summary",
    name: "Budget Summary Report",
    description: "Export budgets filtered by entity, owner, status, and period",
    icon: "Wallet",
    filters: [
      { key: "fromDate", label: "Period From", type: "date" },
      { key: "toDate", label: "Period To", type: "date" },
      { key: "status", label: "Status", type: "multiselect" },
      { key: "businessEntity", label: "Business Entity", type: "multiselect" },
      { key: "budgetOwner", label: "Budget Owner", type: "multiselect" },
    ],
    columns: [
      { key: "budget_name", label: "Budget Name", type: "text" },
      { key: "budget_owner_name", label: "Owner", type: "text" },
      { key: "budget_amount", label: "Budget Amount", type: "currency" },
      { key: "consumed_amount", label: "Consumed", type: "currency" },
      { key: "reserved_amount", label: "Reserved", type: "currency" },
      { key: "budget_curr", label: "Currency", type: "text" },
      { key: "status", label: "Status", type: "status" },
      { key: "business_entity_name", label: "Business Entity", type: "text" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" },
    ],
  },
  // Hidden from UI — uncomment to restore these report cards
  // {
  //   id: "p2p-overview",
  //   name: "Procure-to-Pay Overview",
  //   description: "Cross-module report linking Purchase Requests to Purchase Orders and Invoices",
  //   icon: "FileText",
  //   filters: [
  //     { key: "fromDate", label: "From Date", type: "date" },
  //     { key: "toDate", label: "To Date", type: "date" },
  //     { key: "status", label: "PO Status", type: "multiselect" },
  //     { key: "department", label: "Department", type: "multiselect" },
  //     { key: "supplier", label: "Supplier", type: "multiselect" },
  //   ],
  //   columns: [
  //     { key: "pr_number", label: "PR Number", type: "text" },
  //     { key: "pr_description", label: "PR Description", type: "text" },
  //     { key: "pr_status", label: "PR Status", type: "status" },
  //     { key: "department_name", label: "Department", type: "text" },
  //     { key: "po_number", label: "PO Number", type: "text" },
  //     { key: "po_status", label: "PO Status", type: "status" },
  //     { key: "supplier_name", label: "Supplier", type: "text" },
  //     { key: "po_total_cost", label: "PO Amount", type: "currency" },
  //     { key: "po_date", label: "PO Date", type: "date" },
  //     { key: "invoice_number", label: "Invoice No", type: "text" },
  //     { key: "invoice_status", label: "Invoice Status", type: "status" },
  //     { key: "invoice_amount", label: "Invoice Amount", type: "currency" },
  //     { key: "payment_status", label: "Payment Status", type: "status" },
  //   ],
  // },
  // {
  //   id: "grn-report",
  //   name: "Delivery / GRN Report",
  //   description: "Track goods received against purchase orders with quantities and status",
  //   icon: "Package",
  //   filters: [
  //     { key: "fromDate", label: "From Date", type: "date" },
  //     { key: "toDate", label: "To Date", type: "date" },
  //     { key: "status", label: "Status", type: "multiselect" },
  //     { key: "supplier", label: "Supplier", type: "multiselect" },
  //   ],
  //   columns: [
  //     { key: "po_number", label: "PO Number", type: "text" },
  //     { key: "item_name", label: "Item Name", type: "text" },
  //     { key: "order_qty", label: "Order Qty", type: "number" },
  //     { key: "received_qty", label: "Received Qty", type: "number" },
  //     { key: "rejected_qty", label: "Rejected Qty", type: "number" },
  //     { key: "received_date", label: "Received Date", type: "date" },
  //     { key: "status", label: "Status", type: "status" },
  //     { key: "received_by_name", label: "Received By", type: "text" },
  //     { key: "supplier_name", label: "Supplier", type: "text" },
  //   ],
  // },
  // {
  //   id: "supplier-performance",
  //   name: "Supplier Performance Report",
  //   description: "Analyze supplier delivery performance with on-time rates and rejection metrics",
  //   icon: "Truck",
  //   filters: [
  //     { key: "fromDate", label: "From Date", type: "date" },
  //     { key: "toDate", label: "To Date", type: "date" },
  //     { key: "supplier", label: "Supplier", type: "multiselect" },
  //   ],
  //   columns: [
  //     { key: "supplier_name", label: "Supplier", type: "text" },
  //     { key: "total_pos", label: "Total POs", type: "number" },
  //     { key: "total_grn_lines", label: "GRN Lines", type: "number" },
  //     { key: "total_ordered", label: "Total Ordered", type: "number" },
  //     { key: "total_received", label: "Total Received", type: "number" },
  //     { key: "total_rejected", label: "Total Rejected", type: "number" },
  //     { key: "rejection_rate", label: "Rejection Rate (%)", type: "text" },
  //     { key: "on_time_deliveries", label: "On-Time", type: "number" },
  //     { key: "late_deliveries", label: "Late", type: "number" },
  //     { key: "on_time_rate", label: "On-Time Rate (%)", type: "text" },
  //   ],
  // },
  // {
  //   id: "aging-report",
  //   name: "Aging Report / Payables",
  //   description: "Outstanding invoice aging analysis with 30/60/90+ day buckets",
  //   icon: "Receipt",
  //   filters: [
  //     { key: "fromDate", label: "From Date", type: "date" },
  //     { key: "toDate", label: "To Date", type: "date" },
  //     { key: "supplier", label: "Supplier", type: "multiselect" },
  //     { key: "department", label: "Department", type: "multiselect" },
  //   ],
  //   columns: [
  //     { key: "invoice_number", label: "Invoice No", type: "text" },
  //     { key: "supplier_name", label: "Supplier", type: "text" },
  //     { key: "department_name", label: "Department", type: "text" },
  //     { key: "invoice_date", label: "Invoice Date", type: "date" },
  //     { key: "inv_due_date", label: "Due Date", type: "date" },
  //     { key: "invoice_amount", label: "Invoice Amount", type: "currency" },
  //     { key: "balance_amount", label: "Balance Amount", type: "currency" },
  //     { key: "days_overdue", label: "Days Overdue", type: "number" },
  //     { key: "aging_bucket", label: "Aging Bucket", type: "text" },
  //     { key: "invoice_status", label: "Status", type: "status" },
  //     { key: "inv_payment_status", label: "Payment Status", type: "status" },									 
  //   ],
  //},  
//	{
//    id: "contract-register",
//    name: "Contract Register",
//    description: "Full register of all contracts with status, value, dates, owner, supplier, and type",
//    icon: "FileText",
//    filters: [
//      { key: "fromDate", label: "Start Date From", type: "date" },
//      { key: "toDate", label: "Start Date To", type: "date" },
//      { key: "status", label: "Status", type: "multiselect" },
//      { key: "department", label: "Department", type: "multiselect" },
//      { key: "supplier", label: "Supplier", type: "multiselect" },
//      { key: "contractType", label: "Contract Type", type: "multiselect" },
//      { key: "contractOwner", label: "Contract Owner", type: "multiselect" },
//    ],
//    columns: [
//      { key: "contr_ref_no", label: "Ref No", type: "text" },
//      { key: "title", label: "Title", type: "text" },
//      { key: "status", label: "Status", type: "status" },
//      { key: "type", label: "Type", type: "text" },
//      { key: "supplier_name", label: "Supplier", type: "text" },
//      { key: "department_name", label: "Department", type: "text" },
//      { key: "owner_name", label: "Owner", type: "text" },
//      { key: "contract_amount", label: "Contract Value", type: "currency" },
//      { key: "currency", label: "Currency", type: "text" },
//      { key: "start_date", label: "Start Date", type: "date" },
//      { key: "end_date", label: "End Date", type: "date" },
//      { key: "is_renewable", label: "Renewable", type: "text" },
//    ],
//  },
//  {
//    id: "contract-expiry",
//    name: "Contract Expiry & Renewal Report",
//    description: "Contracts expiring within a given window with days remaining and renewal eligibility",
//    icon: "CalendarClock",
//    filters: [
//      { key: "fromDate", label: "Expiry From", type: "date" },
//      { key: "toDate", label: "Expiry To", type: "date" },
//      { key: "status", label: "Status", type: "multiselect" },
//      { key: "department", label: "Department", type: "multiselect" },
//      { key: "supplier", label: "Supplier", type: "multiselect" },
//    ],
//    columns: [
//      { key: "contr_ref_no", label: "Ref No", type: "text" },
//      { key: "title", label: "Title", type: "text" },
//      { key: "status", label: "Status", type: "status" },
//      { key: "supplier_name", label: "Supplier", type: "text" },
//      { key: "department_name", label: "Department", type: "text" },
//      { key: "owner_name", label: "Owner", type: "text" },
//      { key: "contract_amount", label: "Contract Value", type: "currency" },
//      { key: "start_date", label: "Start Date", type: "date" },
//      { key: "end_date", label: "End Date", type: "date" },
//      { key: "days_to_expiry", label: "Days to Expiry", type: "number" },
//      { key: "expiry_bucket", label: "Urgency", type: "status" },
//      { key: "is_renewable", label: "Renewable", type: "text" },
//    ],
//  },
//  {
//    id: "contract-spend",
//    name: "Contract Spend vs Budget",
//    description: "Invoiced amounts versus contract values by supplier and department — tracks over/under-spend",
//    icon: "BarChart2",
//    filters: [
//      { key: "fromDate", label: "Contract Start From", type: "date" },
//      { key: "toDate", label: "Contract Start To", type: "date" },
//      { key: "status", label: "Status", type: "multiselect" },
//      { key: "department", label: "Department", type: "multiselect" },
//      { key: "supplier", label: "Supplier", type: "multiselect" },
//    ],
//    columns: [
//      { key: "contr_ref_no", label: "Ref No", type: "text" },
//      { key: "title", label: "Title", type: "text" },
//      { key: "status", label: "Status", type: "status" },
//      { key: "supplier_name", label: "Supplier", type: "text" },
//      { key: "department_name", label: "Department", type: "text" },
//      { key: "contract_amount", label: "Contract Value", type: "currency" },
//      { key: "invoicedamount", label: "Invoiced Amount", type: "currency" },
//      { key: "remaining_amount", label: "Remaining", type: "currency" },
//      { key: "utilization_pct", label: "Utilization %", type: "text" },
//      { key: "currency", label: "Currency", type: "text" },
//      { key: "start_date", label: "Start Date", type: "date" },
//      { key: "end_date", label: "End Date", type: "date" },
//    ],	  
  // },
  // {
  //   id: "bid-summary",
  //   name: "Bid / Sourcing Summary",
  //   description: "Bid outcomes with awarded amounts, savings analysis, and supplier response counts",
  //   icon: "FileBarChart",
  //   filters: [
  //     { key: "fromDate", label: "From Date", type: "date" },
  //     { key: "toDate", label: "To Date", type: "date" },
  //     { key: "status", label: "Status", type: "multiselect" },
  //     { key: "bidType", label: "Bid Type", type: "multiselect" },
  //   ],
  //   columns: [
  //     { key: "bid_title", label: "Bid Title", type: "text" },
  //     { key: "bid_type", label: "Bid Type", type: "text" },
  //     { key: "status", label: "Status", type: "status" },
  //     { key: "buyer_name", label: "Buyer", type: "text" },
  //     { key: "department_name", label: "Department", type: "text" },
  //     { key: "start_date", label: "Start Date", type: "date" },
  //     { key: "end_date", label: "End Date", type: "date" },
  //     { key: "pr_amount", label: "PR Amount", type: "currency" },
  //     { key: "awarded_amount", label: "Awarded Amount", type: "currency" },
  //     { key: "savings", label: "Savings", type: "currency" },
  //     { key: "savings_pct", label: "Savings %", type: "text" },
  //     { key: "response_count", label: "Responses", type: "number" },
  //   ],
  // },
];

export class ReportsService {
  getReportDefinitions(): ReportDefinition[] {
    return REPORT_DEFINITIONS;
  }

  getReportDefinition(reportId: string): ReportDefinition | undefined {
    return REPORT_DEFINITIONS.find((r) => r.id === reportId);
  }

  async generateReport(reportId: string, filters: any) {
    const definition = this.getReportDefinition(reportId);
    if (!definition) {
      throw new Error(`Report '${reportId}' not found`);
    }

    const result = await reportsRepository.runReport(reportId, filters);
    return {
      definition,
      ...result,
    };
  }

  async getReportSummary(reportId: string, filters: any) {
    const definition = this.getReportDefinition(reportId);
    if (!definition) {
      throw new Error(`Report '${reportId}' not found`);
    }
    return reportsRepository.getReportSummary(reportId, filters);
  }

  async getFilterOptions(reportId: string) {
    return reportsRepository.getFilterOptions(reportId);
  }

  async getTemplates(userId: number, reportId?: string) {
    return reportsRepository.getTemplates(userId, reportId);
  }

  async createTemplate(userId: number, reportId: string, name: string, filters: Record<string, any>) {
    const definition = this.getReportDefinition(reportId);
    if (!definition) throw new Error(`Report '${reportId}' not found`);
    if (!name || name.trim().length === 0) throw new Error("Template name is required");
    return reportsRepository.createTemplate(userId, reportId, name.trim(), filters);
  }

  async updateTemplate(id: number, userId: number, name: string, filters: Record<string, any>) {
    if (!name || name.trim().length === 0) throw new Error("Template name is required");
    return reportsRepository.updateTemplate(id, userId, name.trim(), filters);
  }

  async deleteTemplate(id: number, userId: number) {
    return reportsRepository.deleteTemplate(id, userId);
  }
}
