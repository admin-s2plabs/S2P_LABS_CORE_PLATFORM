import OpenAI from "openai";
import { getAIClient, getAIModelName } from "./ai-client";
import * as bidService from "../modules/bids/bids.service";
import * as procService from "../modules/procurement/procurement.service";
import * as invoiceService from "../modules/invoices/invoices.service";
import * as vendorService from "../modules/vendors/vendors.service";
import * as budgetService from "../modules/budgets/budgets.service";
import * as adminService from "../modules/administration/administration.service";
import * as userMgmtService from "../modules/user-management/user-management.service";
import * as spendService from "../modules/spend-analysis/spend-analysis.service";
import { formatDateTimeDisplay } from "@shared/publish-bid-dates";

export interface ProcurementSnapshot {
  pr: { total: number; draft: number; pendingApproval: number; approved: number; totalValue: number };
  po: { total: number; draft: number; pendingApproval: number; approved: number; totalValue: number };
  invoices: { total: number; draft: number; pendingApproval: number; approved: number; paid: number; totalValue: number };
  bids: { total: number; draft: number; published: number; closed: number; awarded: number; pendingApproval: number; byType: Record<string, number> };
  vendors: { total: number };
  budgets: { total: number; totalBudget: number; totalConsumed: number };
  generatedAt: string;
}

export async function getProcurementSnapshot(): Promise<ProcurementSnapshot> {
  const [prStats, poStats, invStats, budgetStats, vendorData, allBids] = await Promise.all([
    procService.getRequisitionStats().catch(() => null),
    procService.getPoStats({}).catch(() => null),
    invoiceService.getInvoiceStats().catch(() => null),
    budgetService.getStats().catch(() => null),
    vendorService.getDboSuppliersPaginated({ page: 1, limit: 1 }).catch(() => null),
    bidService.listDboBids().catch(() => []),
  ]);

  const bidsArr = Array.isArray(allBids) ? allBids as any[] : [];
  const statusCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  bidsArr.forEach((b: any) => {
    statusCounts[b.status || "Unknown"] = (statusCounts[b.status || "Unknown"] || 0) + 1;
    typeCounts[b.type || "Unknown"] = (typeCounts[b.type || "Unknown"] || 0) + 1;
  });

  return {
    pr: {
      total: Number((prStats as any)?.total || 0),
      draft: Number((prStats as any)?.draft || 0),
      pendingApproval: Number((prStats as any)?.pending_approval || 0),
      approved: Number((prStats as any)?.approved || 0),
      totalValue: Number((prStats as any)?.total_value || 0),
    },
    po: {
      total: Number((poStats as any)?.total || 0),
      draft: Number((poStats as any)?.draft || 0),
      pendingApproval: Number((poStats as any)?.pending_approval || 0),
      approved: Number((poStats as any)?.approved || 0),
      totalValue: Number((poStats as any)?.total_value || 0),
    },
    invoices: {
      total: Number((invStats as any)?.total || 0),
      draft: Number((invStats as any)?.draft || 0),
      pendingApproval: Number((invStats as any)?.pending_approval || 0),
      approved: Number((invStats as any)?.approved || 0),
      paid: Number((invStats as any)?.paid || 0),
      totalValue: Number((invStats as any)?.total_value || 0),
    },
    bids: {
      total: bidsArr.length,
      draft: statusCounts["Draft"] || 0,
      published: statusCounts["Published"] || 0,
      closed: statusCounts["Closed"] || 0,
      awarded: statusCounts["Awarded"] || 0,
      pendingApproval: statusCounts["Pending Approval"] || 0,
      byType: typeCounts,
    },
    vendors: {
      total: Number((vendorData as any)?.pagination?.total || (vendorData as any)?.total || 0),
    },
    budgets: {
      total: Number((budgetStats as any)?.total || 0),
      totalBudget: Number((budgetStats as any)?.total_budget || 0),
      totalConsumed: Number((budgetStats as any)?.total_consumed || 0),
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildSystemPrompt(snapshot: ProcurementSnapshot): string {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  const budgetUtil = snapshot.budgets.totalBudget > 0 ? ((snapshot.budgets.totalConsumed / snapshot.budgets.totalBudget) * 100).toFixed(1) : "0";

  return `You are EVA — a seasoned, highly experienced Chief Procurement Officer who knows this organization's procurement inside-out. You're not a chatbot or a report generator. You're a real procurement professional who happens to have perfect data access.

## How You Communicate
- Talk like a real person: "I checked our POs and noticed...", "We've got a situation with...", "I'd recommend we..."
- NEVER dump raw stats or create report-style bullet lists. Weave numbers naturally into your insights
- Interpret data — don't repeat it. Explain what numbers MEAN for the business
- Be proactive: suggest actions, flag risks, spot opportunities
- Use "we" and "our" — you're part of the team
- Keep it concise and actionable. Quality over quantity
- NEVER use markdown tables or pipe (|) characters
- For monetary values, always include AED

## Organization Context (you know all this deeply)
- We've processed ${fmt(snapshot.pr.total)} purchase requisitions worth AED ${fmt(snapshot.pr.totalValue)}, with ${fmt(snapshot.pr.pendingApproval)} currently awaiting approval
- Our PO book stands at ${fmt(snapshot.po.total)} orders worth AED ${fmt(snapshot.po.totalValue)} — ${fmt(snapshot.po.draft)} are still in draft
- ${fmt(snapshot.invoices.total)} invoices totaling AED ${fmt(snapshot.invoices.totalValue)}, ${fmt(snapshot.invoices.pendingApproval)} need payment approval, ${fmt(snapshot.invoices.paid)} paid so far
- Sourcing: ${fmt(snapshot.bids.total)} events (${Object.entries(snapshot.bids.byType).map(([k, v]) => `${v} ${k}s`).join(", ")}), ${fmt(snapshot.bids.awarded)} awarded, ${fmt(snapshot.bids.draft)} in draft
- ${fmt(snapshot.vendors.total)} vendors in our supply network
- Budget: AED ${fmt(snapshot.budgets.totalBudget)} allocated, ${budgetUtil}% consumed (AED ${fmt(snapshot.budgets.totalConsumed)})

## Your Capabilities — Full System Visibility
You have deep access to EVERY module in the procurement system:

**Procurement**: Search/view PRs, POs with full line items, delivery notes, GRNs, linked invoices
**Invoices & Payments**: Search/view invoices, payment records, approval history
**Sourcing & Bids**: Search/view bids, vendor responses, evaluations, create full procurement packages
**Vendors**: Search vendors, view contacts, bank details, documents, services, approval history, profile changes, invitations pipeline
**Spend Analysis**: Total spend KPIs, spend by category/supplier/department, budget vs spend, monthly trends, savings analysis, maverick spend, vendor concentration risk, purchase cycle times, year-over-year comparison
**Budgets**: Overview stats, detailed budget lines, allocations, period amounts
**Administration**: Organization details, locations, payment terms, lookups, audit trail
**User Management**: Search users, view profiles, roles, approvers, role delegations
**Items & Categories**: Search products, UNSPSC categories

Use the appropriate tools for each query. When analyzing spend or performance, combine multiple tools for comprehensive insights.

## Write Operations — Full End-to-End Execution
When a user asks you to buy/procure something (e.g., "buy me 20 laptops"), you MUST execute the COMPLETE procurement workflow, not just one step. Here's how:

### Step 1: Research (automatic, no user input needed)
- Search items catalog for matching products
- Search categories to find the right UNSPSC category
- Search vendors who supply similar items (filter by Approved status)
- Check budget availability

### Step 2: Prepare Complete Package
Use the "prepare_full_procurement" tool to build the ENTIRE bid package at once:
- Bid with auto-filled title, type (RFQ), currency (AED), closing date (14 days out)
- Line items with description, quantity, estimated price from catalog
- Vendor invitations for 3-5 relevant approved vendors
- Standard terms & conditions appropriate for the purchase type
- Requirements/specifications based on the item

### Step 3: Present ONE Confirmation
Show the user a complete summary: bid details, line items, invited vendors, T&C, and requirements. Ask for ONE confirmation.

### Step 4: Execute Everything
After confirmation, execute_full_procurement creates the bid, adds lines, invites vendors, adds clauses/requirements, and publishes — all in one go.

IMPORTANT: NEVER stop after just creating a bid. The user expects the full workflow. NEVER ask multiple questions — be decisive, use defaults, and present a ready-to-go package.
`;
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  { type: "function", function: { name: "search_prs", description: "Search purchase requisitions with filters. Returns paginated list.", parameters: { type: "object", properties: { search: { type: "string", description: "Search keyword" }, status: { type: "string", description: "Filter by status: Draft, Pending Approval, Approved, Rejected, Cancelled" }, department: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_pr_details", description: "Get detailed info for a specific PR by PR number.", parameters: { type: "object", properties: { prNumber: { type: "string", description: "PR number e.g. PR_00001" } }, required: ["prNumber"] } } },
  { type: "function", function: { name: "search_pos", description: "Search purchase orders with filters.", parameters: { type: "object", properties: { search: { type: "string" }, status: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_po_details", description: "Get detailed info for a specific PO by PO number.", parameters: { type: "object", properties: { poNumber: { type: "string", description: "PO number e.g. PO_00001" } }, required: ["poNumber"] } } },
  { type: "function", function: { name: "search_invoices", description: "Search invoices with filters.", parameters: { type: "object", properties: { search: { type: "string" }, status: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_invoice_details", description: "Get detailed info for a specific invoice by ID.", parameters: { type: "object", properties: { invoiceId: { type: "number" } }, required: ["invoiceId"] } } },
  { type: "function", function: { name: "search_bids", description: "Search bids/RFQs/RFPs/Tenders with filters.", parameters: { type: "object", properties: { search: { type: "string" }, status: { type: "string" }, type: { type: "string", description: "RFQ, RFP, or Tender" }, page: { type: "number" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_bid_details", description: "Get full details for a bid including lines, vendors, requirements.", parameters: { type: "object", properties: { bidId: { type: "number" } }, required: ["bidId"] } } },
  { type: "function", function: { name: "search_vendors", description: "Search registered vendors.", parameters: { type: "object", properties: { search: { type: "string" }, status: { type: "string", description: "Approved, Pending Approval, Draft, Rejected" }, page: { type: "number" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_vendor_details", description: "Get full vendor profile.", parameters: { type: "object", properties: { vendorId: { type: "number" } }, required: ["vendorId"] } } },
  { type: "function", function: { name: "search_items", description: "Search item catalog.", parameters: { type: "object", properties: { search: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "search_categories", description: "Search UNSPSC categories.", parameters: { type: "object", properties: { search: { type: "string" }, level: { type: "string", description: "segment, family, class, or commodity" } } } } },
  { type: "function", function: { name: "get_budget_stats", description: "Get budget overview and statistics.", parameters: { type: "object", properties: { year: { type: "string" } } } } },
  { type: "function", function: { name: "search_budgets", description: "Search budgets.", parameters: { type: "object", properties: { search: { type: "string" }, status: { type: "string" }, year: { type: "string" }, page: { type: "string" }, limit: { type: "string" } } } } },
  { type: "function", function: { name: "get_bid_responses", description: "Get vendor responses for a bid.", parameters: { type: "object", properties: { bidId: { type: "number" } }, required: ["bidId"] } } },
  { type: "function", function: { name: "get_bid_evaluation", description: "Get evaluation data and scores for a bid.", parameters: { type: "object", properties: { bidId: { type: "number" } }, required: ["bidId"] } } },
  { type: "function", function: { name: "get_procurement_snapshot", description: "Get fresh real-time procurement snapshot with all module statistics.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "prepare_create_bid", description: "Preview creating a new bid (RFQ/RFP/Tender). Requires user confirmation before executing.", parameters: { type: "object", properties: { title: { type: "string" }, bidType: { type: "string", description: "RFQ, RFP, or Tender" }, currency: { type: "string" }, closingDate: { type: "string" }, department: { type: "string" }, notes: { type: "string" } }, required: ["title"] } } },
  { type: "function", function: { name: "execute_create_bid", description: "Execute creating a bid after user confirms.", parameters: { type: "object", properties: { title: { type: "string" }, bidType: { type: "string" }, currency: { type: "string" }, closingDate: { type: "string" }, department: { type: "string" }, notes: { type: "string" }, _confirmed: { type: "boolean" } }, required: ["title", "_confirmed"] } } },
  { type: "function", function: { name: "prepare_add_bid_line", description: "Preview adding a line item to a bid.", parameters: { type: "object", properties: { bidId: { type: "number" }, description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" }, uom: { type: "string" } }, required: ["bidId", "description", "quantity"] } } },
  { type: "function", function: { name: "execute_add_bid_line", description: "Execute adding a line item after confirmation.", parameters: { type: "object", properties: { bidId: { type: "number" }, description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" }, uom: { type: "string" }, _confirmed: { type: "boolean" } }, required: ["bidId", "description", "quantity", "_confirmed"] } } },
  { type: "function", function: { name: "prepare_add_bid_vendor", description: "Preview inviting a vendor to a bid.", parameters: { type: "object", properties: { bidId: { type: "number" }, supplierId: { type: "number" } }, required: ["bidId", "supplierId"] } } },
  { type: "function", function: { name: "execute_add_bid_vendor", description: "Execute inviting a vendor after confirmation.", parameters: { type: "object", properties: { bidId: { type: "number" }, supplierId: { type: "number" }, _confirmed: { type: "boolean" } }, required: ["bidId", "supplierId", "_confirmed"] } } },
  { type: "function", function: { name: "prepare_publish_bid", description: "Preview publishing a bid.", parameters: { type: "object", properties: { bidId: { type: "number" } }, required: ["bidId"] } } },
  { type: "function", function: { name: "execute_publish_bid", description: "Execute publishing a bid after confirmation.", parameters: { type: "object", properties: { bidId: { type: "number" }, _confirmed: { type: "boolean" } }, required: ["bidId", "_confirmed"] } } },
  { type: "function", function: { name: "prepare_full_procurement", description: "Prepare a COMPLETE procurement package — bid + line items + vendor invitations + terms & conditions + requirements. Use this when the user asks to buy/procure something. Presents everything for ONE confirmation.", parameters: { type: "object", properties: { title: { type: "string", description: "Bid title" }, bidType: { type: "string", description: "RFQ, RFP, or Tender" }, currency: { type: "string" }, closingDate: { type: "string", description: "ISO date string" }, department: { type: "string" }, notes: { type: "string" }, lineItems: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" }, uom: { type: "string" } }, required: ["description", "quantity"] }, description: "Line items to add" }, vendorIds: { type: "array", items: { type: "number" }, description: "Vendor IDs to invite" }, vendorNames: { type: "array", items: { type: "string" }, description: "Vendor names for display" }, clauses: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } } }, description: "Terms and conditions" }, requirements: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, mandatory: { type: "boolean" } } }, description: "Requirements/specifications" } }, required: ["title", "lineItems"] } } },
  { type: "function", function: { name: "execute_full_procurement", description: "Execute the complete procurement package after user confirms. Creates bid, adds lines, invites vendors, adds T&C, adds requirements, and publishes.", parameters: { type: "object", properties: { title: { type: "string" }, bidType: { type: "string" }, currency: { type: "string" }, closingDate: { type: "string" }, department: { type: "string" }, notes: { type: "string" }, lineItems: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" }, uom: { type: "string" } } } }, vendorIds: { type: "array", items: { type: "number" } }, clauses: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } } } }, requirements: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, mandatory: { type: "boolean" } } } }, _confirmed: { type: "boolean" } }, required: ["title", "lineItems", "_confirmed"] } } },

  // === Delivery Notes, GRNs, Fulfillment ===
  { type: "function", function: { name: "get_po_delivery_notes", description: "Get delivery notes (ASN) for a PO.", parameters: { type: "object", properties: { poNumber: { type: "string" } }, required: ["poNumber"] } } },
  { type: "function", function: { name: "get_po_grns", description: "Get goods receipt notes (GRN) for a PO.", parameters: { type: "object", properties: { poNumber: { type: "string" } }, required: ["poNumber"] } } },
  { type: "function", function: { name: "get_po_linked_invoices", description: "Get invoices linked to a PO.", parameters: { type: "object", properties: { poNumber: { type: "string" } }, required: ["poNumber"] } } },

  // === Deep Vendor Visibility ===
  { type: "function", function: { name: "get_vendor_contacts", description: "Get contact persons for a vendor.", parameters: { type: "object", properties: { vendorId: { type: "number" } }, required: ["vendorId"] } } },
  { type: "function", function: { name: "get_vendor_bank_details", description: "Get bank account details for a vendor.", parameters: { type: "object", properties: { vendorId: { type: "number" } }, required: ["vendorId"] } } },
  { type: "function", function: { name: "get_vendor_documents", description: "Get documents submitted by a vendor (licenses, certificates, etc.).", parameters: { type: "object", properties: { vendorId: { type: "number" } }, required: ["vendorId"] } } },
  { type: "function", function: { name: "get_vendor_services", description: "Get scope of supply/services for a vendor (categories they provide).", parameters: { type: "object", properties: { vendorId: { type: "number" } }, required: ["vendorId"] } } },
  { type: "function", function: { name: "get_vendor_approval_history", description: "Get approval workflow history for a vendor's registration.", parameters: { type: "object", properties: { vendorId: { type: "number" } }, required: ["vendorId"] } } },
  { type: "function", function: { name: "get_vendor_changes", description: "Get pending changes made by a vendor to their profile (for review).", parameters: { type: "object", properties: { vendorId: { type: "number" } }, required: ["vendorId"] } } },

  // === Spend Analysis ===
  { type: "function", function: { name: "get_spend_summary", description: "Get spend analysis KPI summary — total spend, PO count, PR count, supplier count, invoice count, etc.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_spend_by_category", description: "Get spend breakdown by product category.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_spend_by_supplier", description: "Get top suppliers by spend amount.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_spend_by_department", description: "Get spend breakdown by department.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_budget_vs_spend", description: "Get budget vs actual spend comparison.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_spend_trend", description: "Get monthly spend trend.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_vendor_concentration_risk", description: "Analyze vendor concentration risk — identifies over-reliance on specific vendors.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_savings_analysis", description: "Get savings analysis — negotiated vs actual pricing, cost reductions.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_maverick_spend", description: "Get maverick (off-contract) spend analysis.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_purchase_cycle_time", description: "Get purchase cycle time metrics — PR-to-PO, PO-to-Delivery, Invoice-to-Payment durations.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_yoy_spend_comparison", description: "Get year-over-year spend comparison.", parameters: { type: "object", properties: { year: { type: "number" } } } } },

  // === Administration & System Config ===
  { type: "function", function: { name: "get_org_details", description: "Get organization details — company name, address, logo, settings.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_locations", description: "Get all locations/offices configured in the system.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_payment_terms", description: "Get all payment terms configured in the system.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_lookups", description: "Get system lookup/configuration values.", parameters: { type: "object", properties: { search: { type: "string" } } } } },
  { type: "function", function: { name: "get_audit_trail", description: "Get recent audit trail / activity log. Shows who did what and when.", parameters: { type: "object", properties: { module: { type: "string", description: "Filter by module name" }, action: { type: "string", description: "Filter by action: CREATE, UPDATE, DELETE" }, limit: { type: "number" } } } } },

  // === User Management & Approvals ===
  { type: "function", function: { name: "search_users", description: "Search users in the system.", parameters: { type: "object", properties: { search: { type: "string" }, status: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_user_details", description: "Get detailed user profile by ID.", parameters: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] } } },
  { type: "function", function: { name: "get_roles", description: "Get all roles defined in the system.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_approvers", description: "Get configured approvers for workflows (PR, PO, Invoice approvals).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_role_delegations", description: "Get role delegations — who is delegating approval authority to whom.", parameters: { type: "object", properties: {} } } },

  // === Budget Deep-Dive ===
  { type: "function", function: { name: "get_budget_detail", description: "Get detailed budget information including lines and allocations.", parameters: { type: "object", properties: { budgetId: { type: "string" } }, required: ["budgetId"] } } },

  // === Invoice Payment & Approval ===
  { type: "function", function: { name: "get_invoice_payment", description: "Get payment record for an invoice.", parameters: { type: "object", properties: { invoiceId: { type: "number" } }, required: ["invoiceId"] } } },
  { type: "function", function: { name: "get_invoice_approval_history", description: "Get approval workflow history for an invoice.", parameters: { type: "object", properties: { invoiceId: { type: "number" } }, required: ["invoiceId"] } } },

  // === Vendor Invitations ===
  { type: "function", function: { name: "search_vendor_invitations", description: "Search vendor invitations — onboarding pipeline.", parameters: { type: "object", properties: { search: { type: "string" }, status: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_invitation_stats", description: "Get vendor invitation status counts (sent, accepted, pending, expired).", parameters: { type: "object", properties: {} } } },

  // === Operational Metrics ===
  { type: "function", function: { name: "get_late_payment_percent", description: "Get late payment percentage — on-time vs late payment analysis.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_po_status_distribution", description: "Get PO status distribution — breakdown of POs by status.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
  { type: "function", function: { name: "get_bid_savings_summary", description: "Get bid/sourcing savings — estimated vs awarded amounts, competitive savings.", parameters: { type: "object", properties: { year: { type: "number" } } } } },
];

async function executeToolCall(name: string, args: any, sessionUser: any): Promise<{ result: string; pendingAction?: any }> {
  switch (name) {
    case "search_prs": {
      const limit = Math.min(args.limit || 20, 50);
      const page = Math.max(args.page || 1, 1);
      const query: any = { page: String(page), limit: String(limit) };
      if (args.search) query.search = args.search;
      if (args.status) query.status = args.status;
      if (args.department) query.department = args.department;

      const result = await procService.getRequisitions(query);
      const data = (result as any).data || [];
      if (!data.length) return { result: `No purchase requisitions found${args.search ? ` matching "${args.search}"` : ""}${args.status ? ` with status "${args.status}"` : ""}.` };

      const total = (result as any).pagination?.total || data.length;
      const formatted = data.map((r: any, idx: number) => {
        let entry = `**${(page - 1) * limit + idx + 1}. ${r.pr_number}** — ${r.pr_description || "N/A"}\n`;
        entry += `   Status: ${r.pr_status || "N/A"} | Amount: AED ${Number(r.pr_amount || 0).toLocaleString()}\n`;
        if (r.department_name) entry += `   Department: ${r.department_name}\n`;
        if (r.requestor_name) entry += `   Requestor: ${r.requestor_name}\n`;
        return entry;
      }).join("\n");

      return { result: `## Purchase Requisitions (${total} total, page ${page})\n\n${formatted}` };
    }

    case "get_pr_details": {
      const detail = await procService.getRequisitionDetail(args.prNumber);
      if (!detail) return { result: `No PR found with number ${args.prNumber}.` };
      const h = (detail as any).header || detail;
      const lines = (detail as any).lines || [];

      let info = `## PR: ${args.prNumber}\n\n`;
      info += `**Description:** ${h.pr_description || "N/A"}\n`;
      info += `**Status:** ${h.pr_status || "N/A"}\n`;
      info += `**Amount:** AED ${Number(h.pr_amount || 0).toLocaleString()}\n`;
      if (h.department_name) info += `**Department:** ${h.department_name}\n`;
      if (h.requestor_name) info += `**Requestor:** ${h.requestor_name}\n`;
      if (h.pr_owner_name) info += `**Owner:** ${h.pr_owner_name}\n`;
      if (h.delivery_date) info += `**Delivery Date:** ${h.delivery_date}\n`;
      if (h.pr_created_date) info += `**Created:** ${h.pr_created_date}\n`;

      if (lines.length > 0) {
        info += `\n### Line Items (${lines.length})\n`;
        lines.slice(0, 15).forEach((l: any, idx: number) => {
          info += `${idx + 1}. ${l.item_description || "Item"} — Qty: ${l.qty}, Unit Cost: AED ${Number(l.unit_cost || 0).toLocaleString()}, Total: AED ${Number(l.amount || 0).toLocaleString()}\n`;
        });
      }
      return { result: info };
    }

    case "search_pos": {
      const limit = Math.min(args.limit || 20, 50);
      const page = Math.max(args.page || 1, 1);
      const query: any = { page: String(page), limit: String(limit) };
      if (args.search) query.search = args.search;
      if (args.status) query.status = args.status;

      const result = await procService.getPurchaseOrders(query, sessionUser);
      const data = (result as any).data || [];
      if (!data.length) return { result: `No purchase orders found.` };

      const total = (result as any).pagination?.total || data.length;
      const formatted = data.map((p: any, idx: number) => {
        let entry = `**${(page - 1) * limit + idx + 1}. ${p.po_number}** — ${p.po_description || "N/A"}\n`;
        entry += `   Status: ${p.po_status || "N/A"} | Amount: AED ${Number(p.po_total_cost || 0).toLocaleString()}\n`;
        if (p.supplier_name) entry += `   Vendor: ${p.supplier_name}\n`;
        return entry;
      }).join("\n");

      return { result: `## Purchase Orders (${total} total, page ${page})\n\n${formatted}` };
    }

    case "get_po_details": {
      const detail = await procService.getPurchaseOrderDetail(args.poNumber);
      if (!detail) return { result: `No PO found with number ${args.poNumber}.` };
      const h = (detail as any).header || detail;
      const lines = (detail as any).lines || [];

      let info = `## PO: ${args.poNumber}\n\n`;
      info += `**Description:** ${h.po_description || "N/A"}\n`;
      info += `**Status:** ${h.po_status || "N/A"}\n`;
      info += `**Total Cost:** AED ${Number(h.po_total_cost || 0).toLocaleString()}\n`;
      info += `**Currency:** ${h.po_currency || "AED"}\n`;
      if (h.supplier_name) info += `**Vendor:** ${h.supplier_name}\n`;
      if (h.po_issue_date) info += `**Issue Date:** ${h.po_issue_date}\n`;
      if (h.po_required_date) info += `**Required Date:** ${h.po_required_date}\n`;
      if (h.delivertto_location_name) info += `**Delivery Location:** ${h.delivertto_location_name}\n`;

      if (lines.length > 0) {
        info += `\n### Line Items (${lines.length})\n`;
        lines.slice(0, 15).forEach((l: any, idx: number) => {
          info += `${idx + 1}. ${l.item_name || "Item"} — Qty: ${l.line_qty}, Unit: AED ${Number(l.line_unit_cost || 0).toLocaleString()}, Total: AED ${Number(l.line_cost || 0).toLocaleString()}\n`;
        });
      }
      return { result: info };
    }

    case "search_invoices": {
      const limit = Math.min(args.limit || 20, 50);
      const page = Math.max(args.page || 1, 1);
      const query: any = { page: String(page), limit: String(limit) };
      if (args.search) query.search = args.search;
      if (args.status) query.status = args.status;

      const result = await invoiceService.getInvoices(query);
      const data = (result as any).data || [];
      if (!data.length) return { result: `No invoices found.` };

      const total = (result as any).pagination?.total || data.length;
      const formatted = data.map((inv: any, idx: number) => {
        let entry = `**${(page - 1) * limit + idx + 1}. ${inv.invoice_number || inv.id}** — ${inv.description || "N/A"}\n`;
        entry += `   Status: ${inv.status || "N/A"} | Amount: AED ${Number(inv.total_amount || inv.amount || 0).toLocaleString()}\n`;
        if (inv.supplier_name || inv.vendor_name) entry += `   Vendor: ${inv.supplier_name || inv.vendor_name}\n`;
        if (inv.po_number) entry += `   PO: ${inv.po_number}\n`;
        return entry;
      }).join("\n");

      return { result: `## Invoices (${total} total, page ${page})\n\n${formatted}` };
    }

    case "get_invoice_details": {
      const inv = await invoiceService.getInvoiceById(args.invoiceId);
      if (!inv) return { result: `No invoice found with ID ${args.invoiceId}.` };
      const d = inv as any;

      let info = `## Invoice: ${d.invoice_number || d.id}\n\n`;
      info += `**Status:** ${d.status || "N/A"}\n`;
      info += `**Amount:** AED ${Number(d.total_amount || d.amount || 0).toLocaleString()}\n`;
      if (d.supplier_name || d.vendor_name) info += `**Vendor:** ${d.supplier_name || d.vendor_name}\n`;
      if (d.po_number) info += `**PO Number:** ${d.po_number}\n`;
      if (d.invoice_date) info += `**Invoice Date:** ${d.invoice_date}\n`;
      if (d.due_date) info += `**Due Date:** ${d.due_date}\n`;

      try {
        const lines = await invoiceService.getInvoiceLines(args.invoiceId);
        if (Array.isArray(lines) && lines.length > 0) {
          info += `\n### Line Items (${lines.length})\n`;
          lines.slice(0, 15).forEach((l: any, idx: number) => {
            info += `${idx + 1}. ${l.description || l.item_name || "Item"} — Qty: ${l.quantity || l.qty}, Amount: AED ${Number(l.amount || l.total || 0).toLocaleString()}\n`;
          });
        }
      } catch {}
      return { result: info };
    }

    case "search_bids": {
      const allBids = await bidService.listDboBids();
      let bids = Array.isArray(allBids) ? allBids as any[] : [];

      if (args.search) {
        const s = args.search.toLowerCase();
        bids = bids.filter((b: any) => (b.bidTitle || "").toLowerCase().includes(s) || (b.bidNumber || "").toLowerCase().includes(s));
      }
      if (args.status) bids = bids.filter((b: any) => (b.status || "").toLowerCase() === args.status.toLowerCase());
      if (args.type) bids = bids.filter((b: any) => (b.type || "").toLowerCase() === args.type.toLowerCase());

      const page = Math.max(args.page || 1, 1);
      const limit = Math.min(args.limit || 20, 50);
      const total = bids.length;
      const paged = bids.slice((page - 1) * limit, page * limit);

      if (!paged.length) return { result: `No bids found matching your criteria.` };

      const formatted = paged.map((b: any, idx: number) => {
        let entry = `**${(page - 1) * limit + idx + 1}. ${b.bidTitle || "Untitled"}** (${b.bidNumber || b.id})\n`;
        entry += `   Type: ${b.type || "N/A"} | Status: ${b.status || "N/A"}\n`;
        if (b.endDate) entry += `   Closing: ${b.endDate}\n`;
        if (b.prAmount) entry += `   PR Amount: AED ${Number(b.prAmount).toLocaleString()}\n`;
        return entry;
      }).join("\n");

      return { result: `## Bids (${total} found, page ${page})\n\n${formatted}` };
    }

    case "get_bid_details": {
      const detail = await bidService.getDboBidDetail(args.bidId) as any;
      if (!detail) return { result: `No bid found with ID ${args.bidId}.` };

      let info = `## Bid: ${detail.bid_title || "N/A"}\n\n`;
      info += `**Bid Number:** ${detail.bid_number || detail.attribute_4 || "N/A"}\n`;
      info += `**Type:** ${detail.type || "N/A"}\n`;
      info += `**Status:** ${detail.status || "N/A"}\n`;
      if (detail.enddate) info += `**Closing Date:** ${detail.enddate}\n`;
      if (detail.startdate) info += `**Start Date:** ${detail.startdate}\n`;
      if (detail.department_name) info += `**Department:** ${detail.department_name}\n`;
      if (detail.buyer_name) info += `**Buyer:** ${detail.buyer_name}\n`;
      if (detail.currency) info += `**Currency:** ${detail.currency}\n`;

      const [lines, suppliers] = await Promise.all([
        bidService.getDboBidLines(args.bidId).catch(() => []),
        bidService.getDboBidSuppliers(args.bidId).catch(() => []),
      ]);

      const linesArr = Array.isArray(lines) ? lines as any[] : [];
      const suppArr = Array.isArray(suppliers) ? suppliers as any[] : [];

      if (linesArr.length > 0) {
        info += `\n### Line Items (${linesArr.length})\n`;
        linesArr.slice(0, 10).forEach((l: any, idx: number) => {
          info += `${idx + 1}. ${l.description || "Item"} — Qty: ${l.quantity}, Price: AED ${Number(l.currentprice || 0).toLocaleString()}\n`;
        });
      }

      if (suppArr.length > 0) {
        info += `\n### Vendors Invited (${suppArr.length})\n`;
        suppArr.slice(0, 10).forEach((s: any, idx: number) => {
          info += `${idx + 1}. ${s.supplier_name || "N/A"} (ID: ${s.supplier_id})\n`;
        });
      }

      return { result: info };
    }

    case "search_vendors": {
      const page = Math.max(args.page || 1, 1);
      const limit = Math.min(args.limit || 20, 50);
      const result = await vendorService.getDboSuppliersPaginated({
        page, limit,
        status: args.status,
        search: args.search,
      });

      const data = (result as any).data || [];
      if (!data.length) return { result: `No vendors found.` };

      const total = (result as any).pagination?.total || data.length;
      const formatted = data.map((v: any, idx: number) => {
        let entry = `**${(page - 1) * limit + idx + 1}. ${v.supplier_name || v.company_name || "N/A"}** (ID: ${v.id})\n`;
        if (v.email_id) entry += `   Email: ${v.email_id}\n`;
        if (v.status) entry += `   Status: ${v.status}\n`;
        if (v.city || v.country) entry += `   Location: ${[v.city, v.country].filter(Boolean).join(", ")}\n`;
        return entry;
      }).join("\n");

      return { result: `## Vendors (${total} total, page ${page})\n\n${formatted}` };
    }

    case "get_vendor_details": {
      const vendor = await vendorService.getDboSupplier(args.vendorId) as any;
      if (!vendor) return { result: `No vendor found with ID ${args.vendorId}.` };

      let info = `## Vendor: ${vendor.supplier_name || vendor.company_name || "N/A"}\n\n`;
      info += `**ID:** ${vendor.id}\n`;
      info += `**Status:** ${vendor.status || "N/A"}\n`;
      if (vendor.email_id) info += `**Email:** ${vendor.email_id}\n`;
      if (vendor.phone) info += `**Phone:** ${vendor.phone}\n`;
      if (vendor.city) info += `**City:** ${vendor.city}\n`;
      if (vendor.country) info += `**Country:** ${vendor.country}\n`;
      if (vendor.pan_number) info += `**PAN:** ${vendor.pan_number}\n`;
      if (vendor.gst_number) info += `**GST:** ${vendor.gst_number}\n`;
      return { result: info };
    }

    case "search_items": {
      const page = Math.max(args.page || 1, 1);
      const limit = Math.min(args.limit || 20, 50);
      const items = await procService.getItems({ page: String(page), limit: String(limit), search: args.search || "" });
      let arr: any[] = [];
      if ((items as any)?.items) arr = (items as any).items;
      else if (Array.isArray(items)) arr = items;

      if (!arr.length) return { result: `No items found${args.search ? ` matching "${args.search}"` : ""}.` };

      const total = (items as any)?.pagination?.total || arr.length;
      const formatted = arr.map((item: any, idx: number) => {
        let entry = `**${(page - 1) * limit + idx + 1}. ${item.name || item.productName || "Item"}**\n`;
        if (item.itemCode || item.skuNo) entry += `   Code: ${item.itemCode || item.skuNo}\n`;
        if (item.categoryName) entry += `   Category: ${item.categoryName}\n`;
        if (item.standardPrice || item.unitPrice) entry += `   Price: AED ${Number(item.standardPrice || item.unitPrice).toLocaleString()}\n`;
        return entry;
      }).join("\n");

      return { result: `## Items (${total} total, page ${page})\n\n${formatted}` };
    }

    case "search_categories": {
      const cats = await procService.getCategories({ level: args.level || "segment", search: args.search || "" });
      const arr = Array.isArray(cats) ? cats as any[] : [];
      if (!arr.length) return { result: `No categories found.` };

      const formatted = arr.slice(0, 30).map((c: any, idx: number) => {
        return `${idx + 1}. **${c.categoryName || c.name || "N/A"}** (${c.categoryCode || c.code || "N/A"})`;
      }).join("\n");

      return { result: `## Categories (${arr.length})\n\n${formatted}` };
    }

    case "get_budget_stats": {
      const stats = await budgetService.getStats(args.year);
      const s = stats as any;
      let info = `## Budget Overview${args.year ? ` (${args.year})` : ""}\n\n`;
      info += `**Total Budgets:** ${s.total || 0}\n`;
      info += `**Total Budget:** AED ${Number(s.total_budget || 0).toLocaleString()}\n`;
      info += `**Total Consumed:** AED ${Number(s.total_consumed || 0).toLocaleString()}\n`;
      const utilization = s.total_budget ? ((Number(s.total_consumed) / Number(s.total_budget)) * 100).toFixed(1) : "0";
      info += `**Utilization:** ${utilization}%\n`;
      info += `**Draft:** ${s.draft || 0} | **Pending Approval:** ${s.pending_approval || 0} | **Approved:** ${s.approved || 0}\n`;
      return { result: info };
    }

    case "search_budgets": {
      const result = await budgetService.listBudgets({
        status: args.status || "",
        search: args.search || "",
        year: args.year || "",
        page: args.page || "1",
        limit: args.limit || "20",
      });
      const data = (result as any).data || [];
      if (!data.length) return { result: "No budgets found." };

      const formatted = data.map((b: any, idx: number) => {
        let entry = `**${idx + 1}. ${b.title || b.budget_name || "Budget"}**\n`;
        entry += `   Status: ${b.status || "N/A"}`;
        if (b.total_amount || b.budget_amount) entry += ` | Amount: AED ${Number(b.total_amount || b.budget_amount || 0).toLocaleString()}`;
        entry += "\n";
        return entry;
      }).join("\n");

      return { result: `## Budgets\n\n${formatted}` };
    }

    case "get_bid_responses": {
      const bid = (await bidService.getDboBidDetail(args.bidId)) as any;
      if (!bid) return { result: `Bid ${args.bidId} was not found.` };
      const status = String(bid.status || "");
      const preClose = new Set(["Draft", "Published", "Pending Approval", "On Hold"]);
      if (preClose.has(status)) {
        const label = bid.bid_number || bid.attribute_4 || args.bidId;
        return {
          result:
            `Bid **${label}** is currently in **${status}** status. ` +
            `Supplier responses (including prices and totals) are sealed until the bid is Closed.`,
        };
      }
      if (status === "Closed" && String(bid.type || "") === "Tender" && bid.env_opened !== "Y") {
        const label = bid.bid_number || bid.attribute_4 || args.bidId;
        return {
          result:
            `Bid **${label}** is Closed, but the tender envelope has not been opened yet. ` +
            `Supplier responses cannot be viewed until the envelope is opened.`,
        };
      }

      const responses = await bidService.getBidResponseDetails(args.bidId) as any[];
      if (!responses?.length) return { result: `No responses found for bid ${args.bidId}.` };

      let info = `## Vendor Responses for Bid ${args.bidId} (${responses.length})\n\n`;
      responses.forEach((r: any, idx: number) => {
        info += `**${idx + 1}. ${r.supplier_name || "N/A"}**\n`;
        info += `   Bid Total: AED ${Number(r.bidtotal || 0).toLocaleString()}\n`;
        info += `   Status: ${r.status || "N/A"}\n`;
        if (r.submitted_date) info += `   Submitted: ${r.submitted_date}\n`;
      });
      return { result: info };
    }

    case "get_bid_evaluation": {
      const evalData = await bidService.getBidEvaluationData(args.bidId) as any;
      if (!evalData) return { result: `No evaluation data for bid ${args.bidId}.` };

      let info = `## Evaluation for Bid ${args.bidId}\n\n`;
      if (evalData.technical_scores) {
        info += `### Technical Scores\n`;
        Object.entries(evalData.technical_scores).forEach(([vendor, score]) => {
          info += `- ${vendor}: ${score}\n`;
        });
      }
      if (evalData.commercial_scores) {
        info += `\n### Commercial Scores\n`;
        Object.entries(evalData.commercial_scores).forEach(([vendor, score]) => {
          info += `- ${vendor}: ${score}\n`;
        });
      }
      if (evalData.awards?.length) {
        info += `\n### Awards (${evalData.awards.length})\n`;
        evalData.awards.forEach((a: any, idx: number) => {
          info += `${idx + 1}. ${a.supplier_name || "N/A"} — AED ${Number(a.bidtotal || 0).toLocaleString()} (${a.status || "N/A"})\n`;
        });
      }
      return { result: info };
    }

    case "get_procurement_snapshot": {
      const snapshot = await getProcurementSnapshot();
      const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
      let info = `## Live Procurement Snapshot\n\n`;
      info += `### Purchase Requisitions\n- Total: ${fmt(snapshot.pr.total)} | Pending Approval: ${fmt(snapshot.pr.pendingApproval)} | Approved: ${fmt(snapshot.pr.approved)}\n- Value: AED ${fmt(snapshot.pr.totalValue)}\n\n`;
      info += `### Purchase Orders\n- Total: ${fmt(snapshot.po.total)} | Pending Approval: ${fmt(snapshot.po.pendingApproval)} | Approved: ${fmt(snapshot.po.approved)}\n- Value: AED ${fmt(snapshot.po.totalValue)}\n\n`;
      info += `### Invoices\n- Total: ${fmt(snapshot.invoices.total)} | Pending: ${fmt(snapshot.invoices.pendingApproval)} | Paid: ${fmt(snapshot.invoices.paid)}\n- Value: AED ${fmt(snapshot.invoices.totalValue)}\n\n`;
      info += `### Bids\n- Total: ${fmt(snapshot.bids.total)} | Published: ${fmt(snapshot.bids.published)} | Awarded: ${fmt(snapshot.bids.awarded)}\n\n`;
      info += `### Vendors: ${fmt(snapshot.vendors.total)} registered\n`;
      info += `### Budgets: AED ${fmt(snapshot.budgets.totalBudget)} total | AED ${fmt(snapshot.budgets.totalConsumed)} consumed\n`;
      return { result: info };
    }

    case "prepare_create_bid": {
      const bidType = args.bidType || "RFQ";
      const typeLabels: Record<string, string> = { RFQ: "Request for Quotation (RFQ)", RFP: "Request for Proposal (RFP)", Tender: "Open Tender" };
      let preview = `## New Bid Preview\n\n`;
      preview += `**Title:** ${args.title}\n`;
      preview += `**Type:** ${typeLabels[bidType] || bidType}\n`;
      if (args.currency) preview += `**Currency:** ${args.currency}\n`;
      if (args.closingDate) preview += `**Closing Date:** ${formatDateTimeDisplay(args.closingDate)}\n`;
      if (args.department) preview += `**Department:** ${args.department}\n`;
      preview += `\nShall I create this bid?`;

      return {
        result: preview,
        pendingAction: {
          type: "create_bid",
          data: { title: args.title, bidType, currency: args.currency, closingDate: args.closingDate, department: args.department, notes: args.notes },
          summary: `Create ${typeLabels[bidType] || bidType}: ${args.title}`,
        },
      };
    }

    case "execute_create_bid": {
      if (!args._confirmed) return { result: "Please confirm the action first." };
      const bidData: any = {
        bid_title: args.title,
        type: args.bidType || "RFQ",
        currency: args.currency || "AED",
        status: "Draft",
        description: args.notes || args.title,
      };
      if (args.closingDate) bidData.enddate = args.closingDate;
      if (args.department) bidData.department_name = args.department;
      const result = await bidService.createDboBid(bidData, sessionUser);
      const newBid = result as any;
      return { result: `Bid created successfully!\n\n**Bid Number:** ${newBid.bid_number || newBid.attribute_4 || newBid.id}\n**Type:** ${args.bidType || "RFQ"}\n**Status:** Draft` };
    }

    case "prepare_add_bid_line": {
      let preview = `## Add Line Item to Bid ${args.bidId}\n\n`;
      preview += `**Item:** ${args.description}\n**Quantity:** ${args.quantity}\n`;
      if (args.unitPrice) preview += `**Unit Price:** AED ${Number(args.unitPrice).toLocaleString()}\n`;
      if (args.uom) preview += `**UOM:** ${args.uom}\n`;
      preview += `\nShall I add this line item?`;
      return {
        result: preview,
        pendingAction: {
          type: "add_bid_line",
          data: { bidId: args.bidId, description: args.description, quantity: args.quantity, unitPrice: args.unitPrice, uom: args.uom },
          summary: `Add ${args.description} (x${args.quantity}) to bid ${args.bidId}`,
        },
      };
    }

    case "execute_add_bid_line": {
      if (!args._confirmed) return { result: "Please confirm the action first." };
      await bidService.addDboBidLine(args.bidId, { description: args.description, quantity: args.quantity, currentprice: args.unitPrice || 0, uom: args.uom || "EA" }, sessionUser);
      return { result: `Line item added to bid ${args.bidId}!\n\n**Item:** ${args.description}\n**Quantity:** ${args.quantity}` };
    }

    case "prepare_add_bid_vendor": {
      let preview = `## Invite Vendor to Bid ${args.bidId}\n\n**Vendor ID:** ${args.supplierId}\n\nShall I invite this vendor?`;
      return {
        result: preview,
        pendingAction: { type: "add_bid_vendor", data: { bidId: args.bidId, supplierId: args.supplierId }, summary: `Invite vendor ${args.supplierId} to bid ${args.bidId}` },
      };
    }

    case "execute_add_bid_vendor": {
      if (!args._confirmed) return { result: "Please confirm the action first." };
      const supplierDetail = await vendorService.getDboSupplier(args.supplierId) as any;
      await bidService.addDboBidSupplier(args.bidId, {
        supplier_id: args.supplierId,
        supplier_name: supplierDetail?.companyName || supplierDetail?.company_name || '',
        supplier_site: supplierDetail ? `${supplierDetail.companyName || supplierDetail.company_name || ''}-${supplierDetail.city || ''}-${supplierDetail.country || ''}` : '',
        supplier_contact: supplierDetail?.companyName || supplierDetail?.company_name || '',
        supplier_contact_email: supplierDetail?.emailId || supplierDetail?.email_id || '',
        supplier_contact_no: supplierDetail?.phone || supplierDetail?.mobileNo || supplierDetail?.mobile_no || '',
      }, sessionUser);
      return { result: `Vendor ${args.supplierId} invited to bid ${args.bidId} successfully!` };
    }

    case "prepare_publish_bid": {
      const detail = await bidService.getDboBidDetail(args.bidId) as any;
      if (!detail) return { result: `No bid found with ID ${args.bidId}.` };
      if ((detail.status || "").toLowerCase() !== "draft") return { result: `Bid ${args.bidId} is "${detail.status}". Only Draft bids can be published.` };
      const [lines, suppliers] = await Promise.all([bidService.getDboBidLines(args.bidId).catch(() => []), bidService.getDboBidSuppliers(args.bidId).catch(() => [])]);
      const linesArr = Array.isArray(lines) ? lines : [];
      const suppArr = Array.isArray(suppliers) ? suppliers : [];
      if (!linesArr.length) return { result: `Bid ${args.bidId} has no line items.` };
      if (!suppArr.length) return { result: `Bid ${args.bidId} has no vendors.` };
      let preview = `## Publish Bid ${args.bidId}\n\n**Title:** ${detail.bid_title}\n**Lines:** ${linesArr.length}\n**Vendors:** ${suppArr.length}\n\nPublishing makes this bid live. Proceed?`;
      return { result: preview, pendingAction: { type: "publish_bid", data: { bidId: args.bidId }, summary: `Publish bid ${args.bidId}` } };
    }

    case "execute_publish_bid": {
      if (!args._confirmed) return { result: "Please confirm the action first." };
      await bidService.publishDboBid(args.bidId);
      return { result: `Bid ${args.bidId} published successfully! Vendors can now respond.` };
    }

    case "prepare_full_procurement": {
      const bidType = args.bidType || "RFQ";
      const currency = args.currency || "AED";
      const closingDate = args.closingDate || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
      const lineItems = args.lineItems || [];
      const vendorIds = args.vendorIds || [];
      const vendorNames = args.vendorNames || [];
      const clauses = args.clauses || [];
      const requirements = args.requirements || [];
      const typeLabels: Record<string, string> = { RFQ: "Request for Quotation", RFP: "Request for Proposal", Tender: "Open Tender" };

      let preview = `## Complete Procurement Package\n\n`;
      preview += `**Title:** ${args.title}\n`;
      preview += `**Type:** ${typeLabels[bidType] || bidType}\n`;
      preview += `**Currency:** ${currency}\n`;
      preview += `**Closing Date:** ${formatDateTimeDisplay(closingDate)}\n`;
      if (args.department) preview += `**Department:** ${args.department}\n`;

      if (lineItems.length > 0) {
        preview += `\n### Line Items (${lineItems.length})\n`;
        lineItems.forEach((l: any, idx: number) => {
          preview += `${idx + 1}. ${l.description} — Qty: ${l.quantity}${l.uom ? ` ${l.uom}` : ""}`;
          if (l.unitPrice) preview += ` | Est. Price: ${currency} ${Number(l.unitPrice).toLocaleString()}/unit`;
          preview += `\n`;
        });
        const totalEst = lineItems.reduce((sum: number, l: any) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0);
        if (totalEst > 0) preview += `**Estimated Total:** ${currency} ${totalEst.toLocaleString()}\n`;
      }

      if (vendorNames.length > 0) {
        preview += `\n### Vendors to Invite (${vendorNames.length})\n`;
        vendorNames.forEach((name: string, idx: number) => {
          preview += `${idx + 1}. ${name}\n`;
        });
      }

      if (clauses.length > 0) {
        preview += `\n### Terms & Conditions (${clauses.length})\n`;
        clauses.forEach((c: any, idx: number) => {
          preview += `${idx + 1}. **${c.title}** — ${c.description}\n`;
        });
      }

      if (requirements.length > 0) {
        preview += `\n### Requirements (${requirements.length})\n`;
        requirements.forEach((r: any, idx: number) => {
          preview += `${idx + 1}. **${r.title}**${r.mandatory ? " (Mandatory)" : ""} — ${r.description}\n`;
        });
      }

      preview += `\n### What happens when you approve:\n`;
      preview += `1. Bid will be created in Draft\n`;
      preview += `2. ${lineItems.length} line item(s) will be added\n`;
      if (vendorIds.length > 0) preview += `3. ${vendorIds.length} vendor(s) will be invited\n`;
      if (clauses.length > 0) preview += `4. ${clauses.length} T&C clause(s) will be added\n`;
      if (requirements.length > 0) preview += `5. ${requirements.length} requirement(s) will be added\n`;
      preview += `6. Bid will be published and vendors notified\n`;
      preview += `\nShall I proceed with this complete package?`;

      return {
        result: preview,
        pendingAction: {
          type: "full_procurement",
          data: {
            title: args.title, bidType, currency, closingDate,
            department: args.department, notes: args.notes,
            lineItems, vendorIds, clauses, requirements,
          },
          summary: `Complete ${typeLabels[bidType] || bidType}: ${args.title} — ${lineItems.length} items, ${vendorIds.length} vendors`,
        },
      };
    }

    case "execute_full_procurement": {
      if (!args._confirmed) return { result: "Action not confirmed." };

      const steps: string[] = [];
      const bidType = args.bidType || "RFQ";
      const currency = args.currency || "AED";

      const bidData: any = {
        bid_title: args.title,
        type: bidType,
        currency,
        status: "Draft",
        description: args.notes || args.title,
      };
      if (args.closingDate) bidData.enddate = args.closingDate;
      if (args.department) bidData.department_name = args.department;

      const newBid = await bidService.createDboBid(bidData, sessionUser) as any;
      const bidId = newBid.id || newBid.bid_ref_no;
      const bidNumber = newBid.bid_number || newBid.attribute_4 || bidId;
      steps.push(`Created bid **${bidNumber}** (${bidType})`);

      const lineItems = args.lineItems || [];
      for (const line of lineItems) {
        try {
          await bidService.addDboBidLine(bidId, {
            description: line.description,
            quantity: line.quantity,
            currentprice: line.unitPrice || 0,
            uom: line.uom || "EA",
          }, sessionUser);
          steps.push(`Added line: ${line.description} (x${line.quantity})`);
        } catch (e: any) {
          steps.push(`Failed to add line "${line.description}": ${e.message}`);
        }
      }

      const vendorIds = args.vendorIds || [];
      for (const suppId of vendorIds) {
        try {
          const suppDetail = await vendorService.getDboSupplier(suppId) as any;
          await bidService.addDboBidSupplier(bidId, {
            supplier_id: suppId,
            supplier_name: suppDetail?.companyName || suppDetail?.company_name || '',
            supplier_site: suppDetail ? `${suppDetail.companyName || suppDetail.company_name || ''}-${suppDetail.city || ''}-${suppDetail.country || ''}` : '',
            supplier_contact: suppDetail?.companyName || suppDetail?.company_name || '',
            supplier_contact_email: suppDetail?.emailId || suppDetail?.email_id || '',
            supplier_contact_no: suppDetail?.phone || suppDetail?.mobileNo || suppDetail?.mobile_no || '',
          }, sessionUser);
          steps.push(`Invited vendor ID ${suppId}`);
        } catch (e: any) {
          steps.push(`Failed to invite vendor ${suppId}: ${e.message}`);
        }
      }

      const clauses = args.clauses || [];
      for (const clause of clauses) {
        try {
          await bidService.addDboBidClause(bidId, {
            title: clause.title,
            description: clause.description,
          }, sessionUser);
          steps.push(`Added T&C: ${clause.title}`);
        } catch (e: any) {
          steps.push(`Failed to add clause "${clause.title}": ${e.message}`);
        }
      }

      const requirements = args.requirements || [];
      for (const req of requirements) {
        try {
          await bidService.addDboBidRequirement(bidId, {
            title: req.title,
            description: req.description,
            mandatory: req.mandatory ? "Yes" : "No",
          }, sessionUser);
          steps.push(`Added requirement: ${req.title}`);
        } catch (e: any) {
          steps.push(`Failed to add requirement "${req.title}": ${e.message}`);
        }
      }

      let published = false;
      if (vendorIds.length > 0 && lineItems.length > 0) {
        try {
          await bidService.publishDboBid(bidId);
          published = true;
          steps.push(`Bid **published** — vendors have been notified`);
        } catch (e: any) {
          steps.push(`Could not auto-publish: ${e.message}. You can publish manually.`);
        }
      } else {
        steps.push(`Bid saved as Draft (needs vendors and line items to publish)`);
      }

      let summary = `## Procurement Complete!\n\n`;
      summary += `**Bid:** ${bidNumber}\n`;
      summary += `**Status:** ${published ? "Published" : "Draft"}\n\n`;
      summary += `### Execution Log\n`;
      steps.forEach((s, i) => { summary += `${i + 1}. ${s}\n`; });

      if (published) {
        summary += `\nThe RFQ is now live. Vendors will receive notifications and can submit their responses before the closing date. I'll keep an eye on responses as they come in.`;
      }

      return { result: summary };
    }

    // === Delivery Notes, GRNs, Fulfillment ===
    case "get_po_delivery_notes": {
      const dns = await procService.getPoDeliveryNotes(args.poNumber);
      const arr = Array.isArray(dns) ? dns as any[] : [];
      if (!arr.length) return { result: `No delivery notes found for ${args.poNumber}.` };
      let info = `## Delivery Notes for ${args.poNumber} (${arr.length})\n\n`;
      arr.forEach((d: any, i: number) => {
        info += `**${i + 1}. DN ${d.dn_number || d.id}** — Status: ${d.status || "N/A"}\n`;
        if (d.delivery_date) info += `   Delivery Date: ${d.delivery_date}\n`;
        if (d.supplier_name) info += `   Vendor: ${d.supplier_name}\n`;
        if (d.tracking_number) info += `   Tracking: ${d.tracking_number}\n`;
      });
      return { result: info };
    }

    case "get_po_grns": {
      const grns = await procService.getPoGrns(args.poNumber);
      const arr = Array.isArray(grns) ? grns as any[] : [];
      if (!arr.length) return { result: `No GRNs found for ${args.poNumber}.` };
      let info = `## Goods Receipt Notes for ${args.poNumber} (${arr.length})\n\n`;
      arr.forEach((g: any, i: number) => {
        info += `**${i + 1}. GRN ${g.grn_number || g.id}** — Status: ${g.status || "N/A"}\n`;
        if (g.received_date) info += `   Received: ${g.received_date}\n`;
        if (g.received_qty) info += `   Qty Received: ${g.received_qty}\n`;
        if (g.item_name) info += `   Item: ${g.item_name}\n`;
      });
      return { result: info };
    }

    case "get_po_linked_invoices": {
      const invs = await procService.getPoInvoices(args.poNumber);
      const arr = Array.isArray(invs) ? invs as any[] : [];
      if (!arr.length) return { result: `No invoices linked to ${args.poNumber}.` };
      let info = `## Invoices for ${args.poNumber} (${arr.length})\n\n`;
      arr.forEach((inv: any, i: number) => {
        info += `**${i + 1}. ${inv.invoice_number || inv.id}** — Status: ${inv.status || "N/A"} | Amount: AED ${Number(inv.total_amount || inv.amount || 0).toLocaleString()}\n`;
      });
      return { result: info };
    }

    // === Deep Vendor Visibility ===
    case "get_vendor_contacts": {
      const contacts = await vendorService.getDboSupplierContacts(args.vendorId);
      const arr = Array.isArray(contacts) ? contacts as any[] : [];
      if (!arr.length) return { result: `No contacts found for vendor ${args.vendorId}.` };
      let info = `## Contacts for Vendor ${args.vendorId} (${arr.length})\n\n`;
      arr.forEach((c: any, i: number) => {
        info += `**${i + 1}. ${c.contact_name || c.first_name || "N/A"}**\n`;
        if (c.designation || c.title) info += `   Title: ${c.designation || c.title}\n`;
        if (c.email || c.email_id) info += `   Email: ${c.email || c.email_id}\n`;
        if (c.phone || c.mobile) info += `   Phone: ${c.phone || c.mobile}\n`;
      });
      return { result: info };
    }

    case "get_vendor_bank_details": {
      const banks = await vendorService.getDboSupplierBanks(args.vendorId);
      const arr = Array.isArray(banks) ? banks as any[] : [];
      if (!arr.length) return { result: `No bank details found for vendor ${args.vendorId}.` };
      let info = `## Bank Details for Vendor ${args.vendorId} (${arr.length})\n\n`;
      arr.forEach((b: any, i: number) => {
        info += `**${i + 1}. ${b.bank_name || "N/A"}**\n`;
        if (b.account_name) info += `   Account Name: ${b.account_name}\n`;
        if (b.account_number) info += `   Account: ****${String(b.account_number).slice(-4)}\n`;
        if (b.iban) info += `   IBAN: ${b.iban}\n`;
        if (b.swift_code) info += `   SWIFT: ${b.swift_code}\n`;
        if (b.branch_name) info += `   Branch: ${b.branch_name}\n`;
      });
      return { result: info };
    }

    case "get_vendor_documents": {
      const docs = await vendorService.getDboSupplierDocuments(args.vendorId);
      const arr = Array.isArray(docs) ? docs as any[] : [];
      if (!arr.length) return { result: `No documents found for vendor ${args.vendorId}.` };
      let info = `## Documents for Vendor ${args.vendorId} (${arr.length})\n\n`;
      arr.forEach((d: any, i: number) => {
        info += `**${i + 1}. ${d.document_name || d.doc_type || "Document"}**\n`;
        if (d.doc_type || d.document_type) info += `   Type: ${d.doc_type || d.document_type}\n`;
        if (d.expiry_date) info += `   Expiry: ${d.expiry_date}\n`;
        if (d.status) info += `   Status: ${d.status}\n`;
      });
      return { result: info };
    }

    case "get_vendor_services": {
      const svcs = await vendorService.getDboSupplierServices(args.vendorId);
      const arr = Array.isArray(svcs) ? svcs as any[] : [];
      if (!arr.length) return { result: `No scope of supply/services found for vendor ${args.vendorId}.` };
      let info = `## Scope of Supply for Vendor ${args.vendorId} (${arr.length})\n\n`;
      arr.forEach((s: any, i: number) => {
        info += `${i + 1}. ${s.category_name || s.service_name || s.description || "N/A"}`;
        if (s.category_code) info += ` (${s.category_code})`;
        info += "\n";
      });
      return { result: info };
    }

    case "get_vendor_approval_history": {
      const history = await vendorService.getWorkflowApprovalHistory(args.vendorId);
      const arr = Array.isArray(history) ? history as any[] : [];
      if (!arr.length) return { result: `No approval history found for vendor ${args.vendorId}.` };
      let info = `## Approval History for Vendor ${args.vendorId} (${arr.length})\n\n`;
      arr.forEach((h: any, i: number) => {
        info += `**${i + 1}.** ${h.action || h.status || "N/A"} by ${h.approver_name || h.acted_by || "N/A"}\n`;
        if (h.action_date || h.created_date) info += `   Date: ${h.action_date || h.created_date}\n`;
        if (h.comments || h.remarks) info += `   Comments: ${h.comments || h.remarks}\n`;
      });
      return { result: info };
    }

    case "get_vendor_changes": {
      const changes = await vendorService.getSupplierChanges(args.vendorId);
      if (!changes || (Array.isArray(changes) && !changes.length)) return { result: `No pending changes for vendor ${args.vendorId}.` };
      const arr = Array.isArray(changes) ? changes : [changes];
      let info = `## Pending Changes for Vendor ${args.vendorId}\n\n`;
      arr.forEach((c: any) => {
        if (c.field) info += `**${c.field}:** "${c.old_value}" → "${c.new_value}"\n`;
        else info += JSON.stringify(c, null, 2) + "\n";
      });
      return { result: info };
    }

    // === Spend Analysis ===
    case "get_spend_summary": {
      const data = await spendService.getSummary(args.year);
      const d = data as any;
      let info = `## Spend Summary${args.year ? ` (${args.year})` : ""}\n\n`;
      info += `**Total Spend:** AED ${Number(d.total_spend || d.totalSpend || 0).toLocaleString()}\n`;
      info += `**Total POs:** ${d.total_pos || d.totalPOs || 0}\n`;
      info += `**Total PRs:** ${d.total_prs || d.totalPRs || 0}\n`;
      info += `**Total Invoices:** ${d.total_invoices || d.totalInvoices || 0}\n`;
      info += `**Total Suppliers:** ${d.total_suppliers || d.totalSuppliers || 0}\n`;
      info += `**Total Users:** ${d.total_users || d.totalUsers || 0}\n`;
      return { result: info };
    }

    case "get_spend_by_category": {
      const data = await spendService.getSpendByCategory(args.year);
      const arr = Array.isArray(data) ? data as any[] : [];
      if (!arr.length) return { result: "No category spend data available." };
      let info = `## Spend by Category${args.year ? ` (${args.year})` : ""}\n\n`;
      arr.slice(0, 15).forEach((c: any, i: number) => {
        info += `${i + 1}. **${c.category_name || c.category || "Uncategorized"}** — AED ${Number(c.total_spend || c.amount || 0).toLocaleString()}\n`;
      });
      return { result: info };
    }

    case "get_spend_by_supplier": {
      const data = await spendService.getSpendBySupplier(args.year);
      const arr = Array.isArray(data) ? data as any[] : [];
      if (!arr.length) return { result: "No supplier spend data available." };
      let info = `## Top Suppliers by Spend${args.year ? ` (${args.year})` : ""}\n\n`;
      arr.slice(0, 15).forEach((s: any, i: number) => {
        info += `${i + 1}. **${s.supplier_name || s.vendor || "N/A"}** — AED ${Number(s.total_spend || s.amount || 0).toLocaleString()}`;
        if (s.po_count) info += ` (${s.po_count} POs)`;
        info += "\n";
      });
      return { result: info };
    }

    case "get_spend_by_department": {
      const data = await spendService.getSpendByDepartment(args.year);
      const arr = Array.isArray(data) ? data as any[] : [];
      if (!arr.length) return { result: "No department spend data available." };
      let info = `## Spend by Department${args.year ? ` (${args.year})` : ""}\n\n`;
      arr.forEach((d: any, i: number) => {
        info += `${i + 1}. **${d.department_name || d.department || "N/A"}** — AED ${Number(d.total_spend || d.amount || 0).toLocaleString()}\n`;
      });
      return { result: info };
    }

    case "get_budget_vs_spend": {
      const data = await spendService.getBudgetVsSpend(args.year);
      const arr = Array.isArray(data) ? data as any[] : [];
      if (!arr.length) return { result: "No budget vs spend data available." };
      let info = `## Budget vs Actual Spend${args.year ? ` (${args.year})` : ""}\n\n`;
      arr.forEach((b: any, i: number) => {
        const budget = Number(b.budget_amount || b.allocated || 0);
        const spent = Number(b.spent_amount || b.consumed || 0);
        const util = budget > 0 ? ((spent / budget) * 100).toFixed(1) : "0";
        info += `${i + 1}. **${b.budget_name || b.name || "Budget"}** — Budget: AED ${budget.toLocaleString()} | Spent: AED ${spent.toLocaleString()} (${util}%)\n`;
      });
      return { result: info };
    }

    case "get_spend_trend": {
      const data = await spendService.getSpendTrend(args.year);
      const arr = Array.isArray(data) ? data as any[] : [];
      if (!arr.length) return { result: "No spend trend data available." };
      let info = `## Monthly Spend Trend${args.year ? ` (${args.year})` : ""}\n\n`;
      arr.forEach((m: any) => {
        info += `**${m.month || m.period}:** AED ${Number(m.total_spend || m.amount || 0).toLocaleString()}\n`;
      });
      return { result: info };
    }

    case "get_vendor_concentration_risk": {
      const data = await spendService.getVendorConcentrationRisk(args.year);
      if (!data) return { result: "No vendor concentration data available." };
      return { result: `## Vendor Concentration Risk\n\n${JSON.stringify(data, null, 2)}` };
    }

    case "get_savings_analysis": {
      const data = await spendService.getSavingsAnalysis(args.year);
      if (!data) return { result: "No savings data available." };
      return { result: `## Savings Analysis\n\n${JSON.stringify(data, null, 2)}` };
    }

    case "get_maverick_spend": {
      const data = await spendService.getMaverickSpend(args.year);
      if (!data) return { result: "No maverick spend data available." };
      return { result: `## Maverick Spend Analysis\n\n${JSON.stringify(data, null, 2)}` };
    }

    case "get_purchase_cycle_time": {
      const data = await spendService.getPurchaseCycleTime();
      if (!data) return { result: "No cycle time data available." };
      const d = data as any;
      let info = `## Purchase Cycle Time Metrics\n\n`;
      if (d.pr_to_po) info += `**PR to PO:** ${d.pr_to_po} days avg\n`;
      if (d.po_to_delivery) info += `**PO to Delivery:** ${d.po_to_delivery} days avg\n`;
      if (d.invoice_to_payment) info += `**Invoice to Payment:** ${d.invoice_to_payment} days avg\n`;
      if (!info.includes("days")) info += JSON.stringify(d, null, 2);
      return { result: info };
    }

    case "get_yoy_spend_comparison": {
      const data = await spendService.getYoYSpendComparison(args.year);
      if (!data) return { result: "No year-over-year data available." };
      return { result: `## Year-over-Year Spend Comparison\n\n${JSON.stringify(data, null, 2)}` };
    }

    // === Administration & System Config ===
    case "get_org_details": {
      const org = await adminService.getOrgDetails();
      if (!org) return { result: "No organization details found." };
      const o = org as any;
      let info = `## Organization Details\n\n`;
      info += `**Company:** ${o.company_name || o.org_name || "N/A"}\n`;
      if (o.address || o.address_line1) info += `**Address:** ${o.address || o.address_line1}\n`;
      if (o.city) info += `**City:** ${o.city}\n`;
      if (o.country) info += `**Country:** ${o.country}\n`;
      if (o.currency) info += `**Currency:** ${o.currency}\n`;
      if (o.tax_id || o.tax_number) info += `**Tax ID:** ${o.tax_id || o.tax_number}\n`;
      return { result: info };
    }

    case "get_locations": {
      const locs = await adminService.getLocations();
      const arr = Array.isArray(locs) ? locs as any[] : [];
      if (!arr.length) return { result: "No locations configured." };
      let info = `## Locations (${arr.length})\n\n`;
      arr.forEach((l: any, i: number) => {
        info += `${i + 1}. **${l.location_name || l.name || "N/A"}**`;
        if (l.city || l.country) info += ` — ${[l.city, l.country].filter(Boolean).join(", ")}`;
        if (l.status) info += ` (${l.status})`;
        info += "\n";
      });
      return { result: info };
    }

    case "get_payment_terms": {
      const terms = await adminService.getPaymentTerms(1, 50, "");
      const arr = Array.isArray(terms) ? terms as any[] : ((terms as any)?.data || []);
      if (!arr.length) return { result: "No payment terms configured." };
      let info = `## Payment Terms (${arr.length})\n\n`;
      arr.forEach((t: any, i: number) => {
        info += `${i + 1}. **${t.term_name || t.name || "N/A"}**`;
        if (t.days || t.net_days) info += ` — Net ${t.days || t.net_days} days`;
        if (t.description) info += ` (${t.description})`;
        info += "\n";
      });
      return { result: info };
    }

    case "get_lookups": {
      const lookups = await adminService.getLookups(1, 50, args.search || "");
      const arr = Array.isArray(lookups) ? lookups as any[] : ((lookups as any)?.data || []);
      if (!arr.length) return { result: "No lookups found." };
      let info = `## System Lookups (${arr.length})\n\n`;
      arr.slice(0, 30).forEach((l: any, i: number) => {
        info += `${i + 1}. **${l.property_key || l.key || "N/A"}:** ${l.property_value || l.value || "N/A"}\n`;
      });
      return { result: info };
    }

    case "get_audit_trail": {
      const params: any = { page: 1, limit: args.limit || 20 };
      if (args.module) params.module = args.module;
      if (args.action) params.action = args.action;
      const data = await adminService.getAuditLogs(params);
      const arr = Array.isArray(data) ? data as any[] : ((data as any)?.data || []);
      if (!arr.length) return { result: "No audit trail entries found." };
      let info = `## Recent Audit Trail (${arr.length})\n\n`;
      arr.slice(0, 20).forEach((a: any, i: number) => {
        info += `**${i + 1}.** ${a.action || "N/A"} on ${a.module || a.entity || "N/A"} by ${a.performed_by || a.user_name || "N/A"}\n`;
        if (a.created_date || a.timestamp) info += `   Date: ${a.created_date || a.timestamp}\n`;
        if (a.details || a.description) info += `   Details: ${String(a.details || a.description).slice(0, 100)}\n`;
      });
      return { result: info };
    }

    // === User Management & Approvals ===
    case "search_users": {
      const page = Math.max(args.page || 1, 1);
      const limit = Math.min(args.limit || 20, 50);
      const result = await userMgmtService.getUsersPaginated({
        page, limit, search: args.search || "", status: args.status,
      });
      const data = (result as any)?.data || (Array.isArray(result) ? result : []);
      if (!data.length) return { result: "No users found." };
      const total = (result as any)?.pagination?.total || data.length;
      let info = `## Users (${total} total, page ${page})\n\n`;
      data.forEach((u: any, i: number) => {
        info += `**${(page - 1) * limit + i + 1}. ${u.first_name || ""} ${u.last_name || ""}** (${u.email || u.email_id || "N/A"})\n`;
        if (u.department) info += `   Department: ${u.department}\n`;
        if (u.designation) info += `   Designation: ${u.designation}\n`;
        if (u.user_status !== undefined) info += `   Status: ${u.user_status === 1 ? "Active" : "Inactive"}\n`;
      });
      return { result: info };
    }

    case "get_user_details": {
      const user = await userMgmtService.getUserById(args.userId);
      if (!user) return { result: `No user found with ID ${args.userId}.` };
      const u = user as any;
      let info = `## User: ${u.first_name || ""} ${u.last_name || ""}\n\n`;
      info += `**Email:** ${u.email || u.email_id || "N/A"}\n`;
      if (u.department) info += `**Department:** ${u.department}\n`;
      if (u.designation) info += `**Designation:** ${u.designation}\n`;
      if (u.phone || u.mobile) info += `**Phone:** ${u.phone || u.mobile}\n`;
      info += `**Status:** ${u.user_status === 1 ? "Active" : "Inactive"}\n`;
      return { result: info };
    }

    case "get_roles": {
      const roles = await userMgmtService.getRoles();
      const arr = Array.isArray(roles) ? roles as any[] : [];
      if (!arr.length) return { result: "No roles configured." };
      let info = `## Roles (${arr.length})\n\n`;
      arr.forEach((r: any, i: number) => {
        info += `${i + 1}. **${r.role_display_name || r.role_name || "N/A"}**`;
        if (r.description) info += ` — ${r.description}`;
        info += "\n";
      });
      return { result: info };
    }

    case "get_approvers": {
      const data = await userMgmtService.getApproversPaginated({ page: 1, limit: 50 });
      const arr = (data as any)?.data || (Array.isArray(data) ? data : []);
      if (!arr.length) return { result: "No approvers configured." };
      let info = `## Approvers (${arr.length})\n\n`;
      arr.forEach((a: any, i: number) => {
        info += `**${i + 1}. ${a.approver_name || a.user_name || "N/A"}**\n`;
        if (a.module || a.approval_type) info += `   Module: ${a.module || a.approval_type}\n`;
        if (a.level) info += `   Level: ${a.level}\n`;
        if (a.min_amount || a.max_amount) info += `   Range: AED ${Number(a.min_amount || 0).toLocaleString()} - ${Number(a.max_amount || 0).toLocaleString()}\n`;
      });
      return { result: info };
    }

    case "get_role_delegations": {
      const data = await userMgmtService.getRoleDelegationsPaginated({ page: 1, limit: 50 });
      const arr = (data as any)?.data || (Array.isArray(data) ? data : []);
      if (!arr.length) return { result: "No role delegations configured." };
      let info = `## Role Delegations (${arr.length})\n\n`;
      arr.forEach((d: any, i: number) => {
        info += `**${i + 1}.** ${d.from_user || d.delegator || "N/A"} → ${d.to_user || d.delegate || "N/A"}\n`;
        if (d.start_date) info += `   Period: ${d.start_date} to ${d.end_date || "ongoing"}\n`;
        if (d.role_name) info += `   Role: ${d.role_name}\n`;
      });
      return { result: info };
    }

    // === Budget Deep-Dive ===
    case "get_budget_detail": {
      const detail = await budgetService.getBudgetDetail(args.budgetId);
      if (!detail) return { result: `No budget found with ID ${args.budgetId}.` };
      const b = detail as any;
      let info = `## Budget: ${b.title || b.budget_name || "N/A"}\n\n`;
      info += `**Status:** ${b.status || "N/A"}\n`;
      info += `**Total Amount:** AED ${Number(b.total_amount || b.budget_amount || 0).toLocaleString()}\n`;
      if (b.consumed_amount) info += `**Consumed:** AED ${Number(b.consumed_amount).toLocaleString()}\n`;
      if (b.currency) info += `**Currency:** ${b.currency}\n`;
      if (b.fiscal_year) info += `**Fiscal Year:** ${b.fiscal_year}\n`;
      const lines = b.lines || b.budget_lines || [];
      if (Array.isArray(lines) && lines.length > 0) {
        info += `\n### Budget Lines (${lines.length})\n`;
        lines.slice(0, 15).forEach((l: any, i: number) => {
          info += `${i + 1}. **${l.line_name || l.description || "Line"}** — Allocated: AED ${Number(l.allocated || l.amount || 0).toLocaleString()}`;
          if (l.consumed || l.spent) info += ` | Spent: AED ${Number(l.consumed || l.spent || 0).toLocaleString()}`;
          info += "\n";
        });
      }
      return { result: info };
    }

    // === Invoice Payment & Approval ===
    case "get_invoice_payment": {
      const payment = await invoiceService.getPaymentRecord(args.invoiceId);
      if (!payment) return { result: `No payment record for invoice ${args.invoiceId}.` };
      const p = payment as any;
      let info = `## Payment for Invoice ${args.invoiceId}\n\n`;
      info += `**Status:** ${p.status || p.payment_status || "N/A"}\n`;
      info += `**Amount:** AED ${Number(p.amount || p.payment_amount || 0).toLocaleString()}\n`;
      if (p.payment_date) info += `**Payment Date:** ${p.payment_date}\n`;
      if (p.payment_method) info += `**Method:** ${p.payment_method}\n`;
      if (p.reference_number) info += `**Reference:** ${p.reference_number}\n`;
      return { result: info };
    }

    case "get_invoice_approval_history": {
      const history = await invoiceService.getInvoiceApprovalHistory(args.invoiceId);
      const arr = Array.isArray(history) ? history as any[] : [];
      if (!arr.length) return { result: `No approval history for invoice ${args.invoiceId}.` };
      let info = `## Approval History for Invoice ${args.invoiceId} (${arr.length})\n\n`;
      arr.forEach((h: any, i: number) => {
        info += `**${i + 1}.** ${h.action || h.status || "N/A"} by ${h.approver_name || h.acted_by || "N/A"}\n`;
        if (h.action_date) info += `   Date: ${h.action_date}\n`;
        if (h.comments) info += `   Comments: ${h.comments}\n`;
      });
      return { result: info };
    }

    // === Vendor Invitations ===
    case "search_vendor_invitations": {
      const page = Math.max(args.page || 1, 1);
      const limit = Math.min(args.limit || 20, 50);
      const result = await vendorService.getInvitationsPaginated({ page, limit, search: args.search, status: args.status });
      const data = (result as any)?.data || (Array.isArray(result) ? result : []);
      if (!data.length) return { result: "No vendor invitations found." };
      const total = (result as any)?.pagination?.total || data.length;
      let info = `## Vendor Invitations (${total} total, page ${page})\n\n`;
      data.forEach((inv: any, i: number) => {
        info += `**${(page - 1) * limit + i + 1}. ${inv.company_name || "N/A"}** — ${inv.email || inv.email_id || "N/A"}\n`;
        info += `   Status: ${inv.status || "N/A"}`;
        if (inv.invited_date || inv.created_date) info += ` | Invited: ${inv.invited_date || inv.created_date}`;
        info += "\n";
      });
      return { result: info };
    }

    case "get_invitation_stats": {
      const stats = await vendorService.getInvitationStatusCounts();
      if (!stats) return { result: "No invitation statistics available." };
      const s = stats as any;
      let info = `## Vendor Invitation Statistics\n\n`;
      if (Array.isArray(s)) {
        s.forEach((item: any) => { info += `**${item.status || "N/A"}:** ${item.count || 0}\n`; });
      } else {
        Object.entries(s).forEach(([k, v]) => { info += `**${k}:** ${v}\n`; });
      }
      return { result: info };
    }

    // === Operational Metrics ===
    case "get_late_payment_percent": {
      const data = await spendService.getLatePaymentPercent();
      if (!data) return { result: "No late payment data available." };
      return { result: `## Late Payment Analysis\n\n${JSON.stringify(data, null, 2)}` };
    }

    case "get_po_status_distribution": {
      const data = await spendService.getPoStatusDistribution(args.year);
      const arr = Array.isArray(data) ? data as any[] : [];
      if (!arr.length) return { result: "No PO status data available." };
      let info = `## PO Status Distribution${args.year ? ` (${args.year})` : ""}\n\n`;
      arr.forEach((s: any) => {
        info += `**${s.status || s.po_status || "N/A"}:** ${s.count || 0} POs`;
        if (s.total_amount) info += ` (AED ${Number(s.total_amount).toLocaleString()})`;
        info += "\n";
      });
      return { result: info };
    }

    case "get_bid_savings_summary": {
      const data = await spendService.getBidSavingsSummary(args.year);
      if (!data) return { result: "No bid savings data available." };
      return { result: `## Bid Savings Summary\n\n${JSON.stringify(data, null, 2)}` };
    }

    default:
      return { result: `Unknown tool: ${name}` };
  }
}

export async function generateBriefing(snapshot: ProcurementSnapshot, userName?: string): Promise<string> {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const budgetUtil = snapshot.budgets.totalBudget > 0 ? ((snapshot.budgets.totalConsumed / snapshot.budgets.totalBudget) * 100).toFixed(1) : "0";
  const totalPending = snapshot.pr.pendingApproval + snapshot.po.pendingApproval + snapshot.invoices.pendingApproval + snapshot.bids.pendingApproval;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const prompt = `You are EVA, a seasoned Chief Procurement Officer giving a quick morning briefing. Speak like a real person — warm, direct, and action-oriented.

FORMAT RULES:
- Start with 1-2 short sentences as a quick situational read (how things look today)
- Then list the KEY action items as bullet points using "•" character
- Each bullet should be short (one line) with the number in bold
- End with one short sentence about what you'll prioritize today
- Keep the ENTIRE briefing under 100 words. Be concise
- NEVER use markdown tables or headers
- Only mention items where count > 0
- Use "we", "our", "I noticed", "let's"

TODAY: ${greeting}. It's ${dayName}, ${dateStr}.
${userName ? `ADDRESS THE USER AS "${userName}" in your opening greeting.` : ""}

DATA:
- PRs: ${fmt(snapshot.pr.pendingApproval)} pending approval, ${fmt(snapshot.pr.draft)} drafts
- POs: ${fmt(snapshot.po.draft)} drafts, ${fmt(snapshot.po.pendingApproval)} pending, total AED ${fmt(snapshot.po.totalValue)}
- Invoices: ${fmt(snapshot.invoices.pendingApproval)} pending approval, ${fmt(snapshot.invoices.paid)} paid
- Bids: ${fmt(snapshot.bids.draft)} drafts, ${fmt(snapshot.bids.published)} live, ${fmt(snapshot.bids.pendingApproval)} pending
- Vendors: ${fmt(snapshot.vendors.total)} total
- Budget: ${budgetUtil}% utilized
- ${totalPending} total items pending across modules

Example tone:
"Quick look at where we stand today. A few things need our attention:
• **5** PRs waiting for approval
• **3** draft POs need to be finalized
• Budget is at **72%** — we're on track
I'll focus on clearing the pending approvals first."`;


  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    });
    return response.choices[0]?.message?.content || "I'm having trouble pulling together your briefing right now. But I'm here — ask me anything about your procurement operations.";
  } catch (e) {
    return "I couldn't generate your daily briefing at the moment, but I'm fully operational. Go ahead and ask me anything — I have complete visibility across all your procurement modules.";
  }
}

export async function processEvaQuery(
  prompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
  sessionUser: any,
  confirmAction?: { type: string; data: any },
  snapshot?: ProcurementSnapshot,
): Promise<{ response: string; pendingAction?: any }> {
  if (!snapshot) {
    snapshot = await getProcurementSnapshot();
  }

  const systemPrompt = buildSystemPrompt(snapshot);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  if (conversationHistory?.length) {
    conversationHistory.forEach((m) => {
      messages.push({ role: m.role as "user" | "assistant", content: m.content });
    });
  }

  if (confirmAction) {
    const executeToolName = `execute_${confirmAction.type}`;
    const toolResult = await executeToolCall(executeToolName, { ...confirmAction.data, _confirmed: true }, sessionUser);
    return { response: toolResult.result, pendingAction: toolResult.pendingAction };
  }

  messages.push({ role: "user", content: prompt });

  let pendingAction: any = undefined;
  const openai = await getAIClient();
  const modelName = await getAIModelName();

  for (let iteration = 0; iteration < 10; iteration++) {
    const response = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 2000,
      temperature: 0.3,
    });

    const message = response.choices[0]?.message;
    if (!message) break;

    if (!message.tool_calls?.length) {
      return { response: message.content || "I couldn't process that request.", pendingAction };
    }

    messages.push(message);

    for (const toolCall of message.tool_calls) {
      const tc = toolCall as any;
      const args = JSON.parse(tc.function.arguments || "{}");
      const toolResult = await executeToolCall(tc.function.name, args, sessionUser);

      if (toolResult.pendingAction) {
        pendingAction = toolResult.pendingAction;
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult.result,
      });
    }
  }

  return { response: "I've gathered the information. Let me know if you need anything else.", pendingAction };
}
