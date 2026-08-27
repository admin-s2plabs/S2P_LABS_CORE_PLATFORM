import { storage } from "../storage";
import type { Category, Item } from "@shared/schema";
import * as vendorRepo from "../modules/vendors/vendors.repository";
import { pool } from "../modules/_shared";
import { getContextPool } from "../tenant-context";

const getPool = () => getContextPool() ?? pool;

interface RealPR {
  pr_number: string;
  pr_description: string | null;
  pr_status: string | null;
  pr_type: string | null;
  pr_amount: string | null;
  currency: string | null;
  department_name: string | null;
  requestor_name: string | null;
  pr_created_date: Date | null;
}

interface RealPRLine {
  id: number;
  pr_number: string | null;
  line_num: number | null;
  item_description: string | null;
  uom: string | null;
  unit_cost: string | null;
  qty: string | null;
  amount: string | null;
  product_category_name: string | null;
  supplier_name: string | null;
}

export interface VendorContext {
  summary: string;
  vendors: any[];
  documents: any[];
  purchaseRequests: RealPR[];
  purchaseRequestLines: Map<string, RealPRLine[]>;
  categories: Category[];
  items: Item[];
  stats: {
    total: number;
    approved: number;
    pending: number;
    underReview: number;
    rejected: number;
    draft: number;
  };
  prStats: {
    total: number;
    pendingApproval: number;
    approved: number;
    totalValue: number;
    byDepartment: Record<string, { count: number; value: number }>;
  };
  categoryStats: {
    segments: number;
    families: number;
    classes: number;
    commodities: number;
  };
  itemStats: {
    total: number;
    active: number;
    inactive: number;
  };
}

async function fetchRealPRs(): Promise<RealPR[]> {
  const result = await getPool().query(
    `SELECT pr_number, pr_description, pr_status, pr_type, pr_amount, currency,
            department_name, requestor_name, pr_created_date
     FROM dbo.supp_pr_header_dtls
     ORDER BY pr_created_date DESC NULLS LAST
     LIMIT 200`
  );
  return result.rows;
}

async function fetchRealPRLines(prNumbers: string[]): Promise<Map<string, RealPRLine[]>> {
  const lineMap = new Map<string, RealPRLine[]>();
  if (prNumbers.length === 0) return lineMap;

  const result = await getPool().query(
    `SELECT id, pr_number, line_num, item_description, uom, unit_cost, qty, amount,
            product_category_name, supplier_name
     FROM dbo.supp_pr_line_dtls
     WHERE pr_number = ANY($1)
     ORDER BY pr_number, line_num`,
    [prNumbers]
  );

  for (const row of result.rows) {
    const prNum = row.pr_number;
    if (!lineMap.has(prNum)) lineMap.set(prNum, []);
    lineMap.get(prNum)!.push(row);
  }
  return lineMap;
}

export async function getVendorContext(): Promise<VendorContext> {
  const suppliers = await vendorRepo.getAllSuppliersForAI();
  const vendors = suppliers.map((s: any) => ({
    id: s.id.toString(),
    companyName: s.company_name || "",
    status: (s.status || "Draft").toLowerCase().replace(/\s+/g, "_"),
    country: s.country || "",
    city: s.city || "",
    state: s.state || "",
    contactEmail: s.email_id || "",
    contactPhone: s.mobile_no || s.phone || "",
    legalEntityType: s.legal_entity_type || "",
    registrationNumber: s.registration_no || "",
    vendorType: s.type_of_company || "",
    businessCategory: s.type_of_service || "",
    scopeOfSupply: s.type_of_service || "",
    panNumber: s.tax_reg_no || "",
    gstNumber: s.license_no || "",
    contactName: "",
    website: s.web_address || "",
  }));

  const allDocuments: any[] = [];
  for (const supplier of suppliers) {
    const docs = await vendorRepo.getAllSupplierDocumentsForAI(supplier.id);
    allDocuments.push(...docs.map((d: any) => ({
      id: d.id.toString(),
      vendorId: supplier.id.toString(),
      documentType: d.doc_type || d.category || "",
      fileName: d.filename || d.doc_name || "",
      status: d.status === "Active" ? "valid" : (d.status || "pending").toLowerCase(),
      expiryDate: d.expiry_date,
      category: d.category || "",
    })));
  }

  const purchaseRequests = await fetchRealPRs();
  const prNumbers = purchaseRequests.map(pr => pr.pr_number);
  const purchaseRequestLines = await fetchRealPRLines(prNumbers);

  const categories = await storage.getCategories();
  const items = await storage.getItems();

  const stats = {
    total: vendors.length,
    approved: vendors.filter(v => v.status === "approved").length,
    pending: vendors.filter(v => v.status === "pending").length,
    underReview: vendors.filter(v => v.status === "under_review").length,
    rejected: vendors.filter(v => v.status === "rejected").length,
    draft: vendors.filter(v => v.status === "draft").length,
  };

  const byDepartment: Record<string, { count: number; value: number }> = {};
  purchaseRequests.forEach(pr => {
    const dept = pr.department_name || "Unknown";
    if (!byDepartment[dept]) {
      byDepartment[dept] = { count: 0, value: 0 };
    }
    byDepartment[dept].count++;
    byDepartment[dept].value += parseFloat(pr.pr_amount || "0");
  });

  const prStats = {
    total: purchaseRequests.length,
    pendingApproval: purchaseRequests.filter(pr => pr.pr_status === "Pending Approval").length,
    approved: purchaseRequests.filter(pr => pr.pr_status === "Approved" || pr.pr_status === "Complete").length,
    totalValue: purchaseRequests.reduce((sum, pr) => sum + parseFloat(pr.pr_amount || "0"), 0),
    byDepartment,
  };

  const categoryStats = {
    segments: categories.filter(c => c.level === "segment").length,
    families: categories.filter(c => c.level === "family").length,
    classes: categories.filter(c => c.level === "class").length,
    commodities: categories.filter(c => c.level === "commodity").length,
  };

  const itemStats = {
    total: items.length,
    active: items.filter(i => i.status === "active").length,
    inactive: items.filter(i => i.status === "inactive" || i.status === "discontinued").length,
  };

  const summary = buildProcurementSummary(vendors, allDocuments, stats, purchaseRequests, purchaseRequestLines, prStats, categories, items, categoryStats, itemStats);

  return { summary, vendors, documents: allDocuments, purchaseRequests, purchaseRequestLines, categories, items, stats, prStats, categoryStats, itemStats };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildProcurementSummary(
  vendors: any[], 
  documents: any[], 
  stats: any,
  purchaseRequests: RealPR[],
  purchaseRequestLines: Map<string, RealPRLine[]>,
  prStats: any,
  categories: Category[],
  items: Item[],
  categoryStats: any,
  itemStats: any
): string {
  const vendorDetails = vendors.length === 0 
    ? "No vendors are currently registered in the system."
    : vendors.map(v => {
        const vendorDocs = documents.filter(d => d.vendorId === v.id);
        const validDocs = vendorDocs.filter(d => d.status === "valid" || d.status === "approved").length;
        const totalDocs = vendorDocs.length;
        
        let supplierLineCount = 0;
        let supplierLineValue = 0;
        purchaseRequestLines.forEach(lines => {
          const vendorLines = lines.filter(l => l.supplier_name && l.supplier_name.toLowerCase().includes(v.companyName.toLowerCase()));
          supplierLineCount += vendorLines.length;
          supplierLineValue += vendorLines.reduce((sum, l) => sum + parseFloat(l.amount || "0"), 0);
        });
        
        return `
- **${v.companyName}** (ID: ${v.id})
  - Status: ${v.status?.toUpperCase() || 'UNKNOWN'}
  - Type: ${v.vendorType || 'Not specified'}
  - Category: ${v.businessCategory || 'Not specified'}
  - PAN: ${v.panNumber || 'Not provided'}
  - GST: ${v.gstNumber || 'Not provided'}
  - City: ${v.city || 'Not specified'}, State: ${v.state || 'Not specified'}
  - Contact: ${v.contactName || 'Not provided'} (${v.contactEmail || 'No email'})
  - Documents: ${validDocs}/${totalDocs} validated
  - Scope: ${v.scopeOfSupply || 'Not specified'}
  - PR Line Items: ${supplierLineCount} items (Value: ${formatCurrency(supplierLineValue)})`;
      }).join('\n');

  const departmentBreakdown = Object.entries(prStats.byDepartment)
    .sort((a, b) => (b[1] as any).value - (a[1] as any).value)
    .map(([dept, data]: [string, any]) => `  - ${dept}: ${data.count} PRs, ${formatCurrency(data.value)}`)
    .join('\n');

  const prDetails = purchaseRequests.slice(0, 15).map(pr => {
    const lines = purchaseRequestLines.get(pr.pr_number) || [];
    const itemSummary = lines.slice(0, 3).map(l => `${l.item_description || 'N/A'} (${l.qty || 0} ${l.uom || 'EA'})`).join(', ');
    const moreItems = lines.length > 3 ? ` +${lines.length - 3} more` : '';
    
    return `
- **${pr.pr_number}**: ${pr.pr_description || 'No description'}
  - Status: ${(pr.pr_status || 'Unknown').toUpperCase()} | Type: ${pr.pr_type || 'Standard'}
  - Requester: ${pr.requestor_name || 'Unknown'} (${pr.department_name || 'Unknown'})
  - Value: ${formatCurrency(parseFloat(pr.pr_amount || "0"))} ${pr.currency || 'INR'}
  - Items: ${itemSummary}${moreItems}
  - Categories: ${lines.map(l => l.product_category_name).filter(Boolean).slice(0, 3).join(', ') || 'None'}`;
  }).join('\n');

  const segments = categories.filter(c => c.level === "segment");
  const categoryHierarchy = segments.slice(0, 10).map(s => {
    const families = categories.filter(c => c.level === "family" && c.parentCode === s.code);
    return `- **${s.code} - ${s.name}** (${families.length} families)`;
  }).join('\n');

  const itemsByCategory: Record<string, Item[]> = {};
  items.forEach(item => {
    const catCode = item.categoryCode?.substring(0, 2) || "Other";
    if (!itemsByCategory[catCode]) itemsByCategory[catCode] = [];
    itemsByCategory[catCode].push(item);
  });
  
  const itemCatalogSummary = Object.entries(itemsByCategory)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([code, catItems]) => {
      const segment = segments.find(s => s.code === code);
      const segName = segment?.name || "Other";
      const topItems = catItems.slice(0, 3).map(i => `${i.name} (${formatCurrency(i.standardPrice || 0)})`).join(', ');
      return `- **${code} - ${segName}**: ${catItems.length} items (e.g., ${topItems})`;
    }).join('\n');

  return `
## Procurement Database Overview

### Vendor Statistics:
- Total Vendors: ${stats.total}
- Approved: ${stats.approved}
- Pending Review: ${stats.pending}
- Under Review: ${stats.underReview}
- Rejected: ${stats.rejected}
- Draft: ${stats.draft}

### Documents:
- Total Documents: ${documents.length}
- Validated: ${documents.filter(d => d.status === "valid" || d.status === "approved").length}
- Pending Validation: ${documents.filter(d => d.status === "pending").length}
- Invalid: ${documents.filter(d => d.status === "invalid" || d.status === "rejected").length}

### UNSPSC Category Hierarchy:
- Segments: ${categoryStats.segments}
- Families: ${categoryStats.families}
- Classes: ${categoryStats.classes}
- Commodities: ${categoryStats.commodities}

**Top Category Segments:**
${categoryHierarchy}

### Item Master Catalog:
- Total Items: ${itemStats.total}
- Active: ${itemStats.active}
- Inactive/Discontinued: ${itemStats.inactive}

**Items by Category:**
${itemCatalogSummary}

### Purchase Requests:
- Total PRs: ${prStats.total}
- Pending Approval: ${prStats.pendingApproval}
- Approved/Complete: ${prStats.approved}
- Total Procurement Value: ${formatCurrency(prStats.totalValue)}

### Spending by Department:
${departmentBreakdown}

## Vendor Details
${vendorDetails}

## Recent Purchase Requests
${prDetails}
`;
}

export function buildSystemPrompt(vendorContext: VendorContext): string {
  return `You are Prokraya AI, an intelligent procurement agent for the Prokraya Source-to-Pay platform. You have COMPLETE knowledge of the organization's procurement ecosystem including vendors, purchase requests, UNSPSC categories, and the item master catalog. You are a procurement expert who can analyze spending patterns, recommend vendors, and guide procurement decisions.

## Your Capabilities:
1. **Vendor Intelligence**: You know every vendor - their status, documents, compliance, categories, spending history, and contact details.
2. **Purchase Request Analysis**: You can analyze all PRs, track spending by department, identify patterns, and recommend actions.
3. **UNSPSC Category Expertise**: You understand the 4-level UNSPSC hierarchy (Segment > Family > Class > Commodity) and can help classify items, find appropriate categories, and match vendors to categories.
4. **Item Master Knowledge**: You know all items in the catalog with their UNSPSC codes, prices, and specifications. You can recommend items for purchase requests.
5. **Vendor-PR Matching**: You can match PRs to the best vendors based on UNSPSC codes, categories, and vendor qualifications.
6. **Spend Analytics**: You can analyze procurement spending across departments and categories.
7. **Procurement Recommendations**: When users want to procure something, you recommend appropriate items from the catalog and vendors to source from.
8. **Risk Assessment**: You identify compliance issues, missing documents, and vendor risks before recommending.
9. **Process Guidance**: You guide users through procurement workflows and best practices.

## Current Procurement Data:
${vendorContext.summary}

## UNSPSC Category System:
The system uses UNSPSC (United Nations Standard Products and Services Code) for item classification:
- **Segment** (2 digits): e.g., "43" for IT & Broadcasting
- **Family** (4 digits): e.g., "4321" for Computer Equipment  
- **Class** (6 digits): e.g., "432115" for Computers
- **Commodity** (8 digits): e.g., "43211503" for Notebook Computers

When users ask about items or categories, use this hierarchy to provide structured answers.

## Response Guidelines:
- Be specific and cite actual data (PR numbers, vendor names, item codes, UNSPSC codes, values) when answering
- When users ask what they can buy, refer to the Item Master catalog
- When recommending vendors, match by UNSPSC category qualifications
- For high-value PRs (>₹10L), suggest RFQ process with multiple vendor quotes
- For routine purchases (<₹1L), suggest direct PO with approved vendors
- Proactively highlight compliance or document issues
- Provide structured analysis for vendor comparisons
- Suggest next steps ("Want me to suggest items for this?" or "Should I recommend qualified vendors?")

## Decision Framework:
- PR Value < ₹1L: Direct PO with approved vendor recommended
- PR Value ₹1L-₹10L: Get 2-3 quotes from approved vendors
- PR Value > ₹10L: Formal RFQ process recommended
- Always verify vendor is APPROVED and qualified for the UNSPSC category before recommending
- Flag vendors with expiring or missing documents
- Match vendor category qualifications to PR line item UNSPSC codes

## Important Rules:
- Only recommend APPROVED vendors for active procurement
- Only recommend items that are ACTIVE in the catalog
- For vendors under_review or pending, mention they need approval first
- Flag any compliance issues proactively
- Always provide actionable next steps
`;
}
