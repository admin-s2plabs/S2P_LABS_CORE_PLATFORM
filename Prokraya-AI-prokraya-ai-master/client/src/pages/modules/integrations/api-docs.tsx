import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Check, ChevronDown, ChevronRight, Shield, ArrowDownToLine, HeartPulse, BookOpen } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function CodeBlock({ code }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
        data-testid="button-copy-code"
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

interface FieldSpec {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

function FieldTable({ fields, title }: { fields: FieldSpec[]; title?: string }) {
  return (
    <div>
      {title && <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">{title}</h4>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">Field</TableHead>
            <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">Type</TableHead>
            <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">Required</TableHead>
            <TableHead className="h-9 py-2 text-xs font-medium">Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map(f => (
            <TableRow key={f.name}>
              <TableCell className="py-1.5"><code className="text-xs bg-muted px-1 py-0.5 rounded">{f.name}</code></TableCell>
              <TableCell className="py-1.5 text-xs text-muted-foreground">{f.type}</TableCell>
              <TableCell className="py-1.5">
                {f.required ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Required</span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">Optional</span>
                )}
              </TableCell>
              <TableCell className="py-1.5 text-xs text-muted-foreground">{f.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface EndpointConfig {
  id: string;
  path: string;
  label: string;
  description: string;
  headerFields: FieldSpec[];
  lineFields?: FieldSpec[];
  lineFieldsTitle?: string;
  sampleRequest: string;
  sampleResponse: string;
  sampleErrorResponse: string;
  curlExample: string;
}

function EndpointSection({ config, isOpen, onToggle }: { config: EndpointConfig; isOpen: boolean; onToggle: (open: boolean) => void }) {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-4">
            <div className="flex items-center gap-3">
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">POST</span>
              <code className="text-sm font-mono">{config.path}</code>
              <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">{config.label}</span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-3 space-y-4">
            <div className="flex items-start gap-2">
              <ArrowDownToLine className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">{config.description}</p>
            </div>
            <Tabs defaultValue="fields">
              <TabsList>
                <TabsTrigger value="fields" data-testid={`tab-fields-${config.id}`}>Fields</TabsTrigger>
                <TabsTrigger value="request" data-testid={`tab-request-${config.id}`}>Sample Request</TabsTrigger>
                <TabsTrigger value="response" data-testid={`tab-response-${config.id}`}>Response</TabsTrigger>
                <TabsTrigger value="curl" data-testid={`tab-curl-${config.id}`}>cURL</TabsTrigger>
              </TabsList>
              <TabsContent value="fields" className="space-y-4 mt-4">
                <FieldTable fields={config.headerFields} title="Header Fields" />
                {config.lineFields && (
                  <FieldTable fields={config.lineFields} title={config.lineFieldsTitle || "Line Item Fields (each object in lines array)"} />
                )}
              </TabsContent>
              <TabsContent value="request" className="mt-4">
                <CodeBlock code={config.sampleRequest} language="json" />
              </TabsContent>
              <TabsContent value="response" className="mt-4 space-y-4">
                <div>
                  <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Success (201 Created)</h4>
                  <CodeBlock code={config.sampleResponse} language="json" />
                </div>
                <div>
                  <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Error (400 Bad Request)</h4>
                  <CodeBlock code={config.sampleErrorResponse} language="json" />
                </div>
              </TabsContent>
              <TabsContent value="curl" className="mt-4">
                <CodeBlock code={config.curlExample} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

const receiptEndpoint: EndpointConfig = {
  id: "receipt",
  path: "/api/v1/integration/inbound/receipt",
  label: "Create Goods Receipt Note",
  description: "Creates a Goods Receipt Note (GRN) against an existing Purchase Order in Prokraya. The receipt validates the PO exists, creates the receipt header and line items, and returns the generated receipt number. All inbound requests are automatically logged in the Interface Monitor.",
  headerFields: [
    { name: "po_number", type: "string", required: true, description: "Purchase Order number to receive against" },
    { name: "receipt_number", type: "string", required: true, description: "Supplier's receipt/delivery note number" },
    { name: "receipt_date", type: "string", required: true, description: "Receipt date in YYYY-MM-DD format" },
    { name: "received_location", type: "string", required: true, description: "Location where goods were received" },
    { name: "received_location_id", type: "string", required: false, description: "Internal location ID" },
    { name: "supplier_name", type: "string", required: false, description: "Supplier name for reference" },
    { name: "receipt_notes", type: "string", required: false, description: "Additional notes about the receipt" },
    { name: "created_by", type: "string", required: false, description: "User who created the receipt (defaults to API key name)" },
    { name: "created_by_name", type: "string", required: false, description: "Display name of the creator" },
    { name: "org_id", type: "string", required: false, description: "Organization ID" },
    { name: "currency_code", type: "string", required: false, description: "Currency code (e.g., USD, INR, AED)" },
    { name: "lines", type: "array", required: true, description: "Array of line items (see below)" },
  ],
  lineFields: [
    { name: "po_line_number", type: "string", required: true, description: "PO line number to receive against" },
    { name: "item_name", type: "string", required: true, description: "Item name or description" },
    { name: "received_qty", type: "number", required: true, description: "Quantity received" },
    { name: "uom", type: "string", required: false, description: "Unit of measure (default: EA)" },
    { name: "unit_price", type: "number", required: true, description: "Unit price of the item" },
    { name: "item_id", type: "string", required: false, description: "Internal item ID" },
    { name: "currency", type: "string", required: false, description: "Line-level currency code" },
    { name: "tax_rate_code", type: "string", required: false, description: "Tax rate code" },
    { name: "discount", type: "number", required: false, description: "Discount amount" },
  ],
  sampleRequest: `{
  "po_number": "PO_00001",
  "receipt_number": "GRN-2025-001",
  "receipt_date": "2025-12-15",
  "received_location": "Main Warehouse",
  "supplier_name": "ABC Supplies Ltd",
  "receipt_notes": "Delivered in good condition",
  "lines": [
    {
      "po_line_number": "1",
      "item_name": "Office Chairs - Ergonomic",
      "received_qty": 50,
      "uom": "EA",
      "unit_price": 250.00
    },
    {
      "po_line_number": "2",
      "item_name": "Standing Desks - Adjustable",
      "received_qty": 25,
      "uom": "EA",
      "unit_price": 450.00
    }
  ]
}`,
  sampleResponse: `{
  "success": true,
  "message": "Receipt created successfully",
  "data": {
    "receipt_number": "REC_00123",
    "supplier_receipt_number": "GRN-2025-001",
    "po_number": "PO_00001"
  }
}`,
  sampleErrorResponse: `{
  "error": "po_number is required",
  "field": "po_number"
}`,
  curlExample: `curl -X POST https://your-domain.com/api/v1/integration/inbound/receipt \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: pk_your_api_key_here" \\
  -d '{
    "po_number": "PO_00001",
    "receipt_number": "GRN-2025-001",
    "receipt_date": "2025-12-15",
    "received_location": "Main Warehouse",
    "lines": [
      {
        "po_line_number": "1",
        "item_name": "Office Chairs",
        "received_qty": 50,
        "unit_price": 250.00
      }
    ]
  }'`,
};

const prEndpoint: EndpointConfig = {
  id: "pr",
  path: "/api/v1/integration/inbound/purchase-requisition",
  label: "Create Purchase Requisition",
  description: "Creates a Purchase Requisition (PR) in Prokraya when a PR is approved in the ERP system. The PR is created with status 'Approved' and includes header details and line items. The PR number from the ERP is used as-is to maintain traceability across systems.",
  headerFields: [
    { name: "pr_number", type: "string", required: true, description: "Purchase Requisition number from the ERP system" },
    { name: "pr_description", type: "string", required: true, description: "Description of the purchase requisition" },
    { name: "pr_status", type: "string", required: false, description: "PR status (default: Approved)" },
    { name: "pr_type", type: "string", required: false, description: "PR type (default: STANDARD)" },
    { name: "department_name", type: "string", required: false, description: "Department name of the requestor" },
    { name: "requestor_name", type: "string", required: false, description: "Name of the person requesting" },
    { name: "requestor_email", type: "string", required: false, description: "Email of the requestor" },
    { name: "pr_owner_name", type: "string", required: false, description: "Name of the PR owner" },
    { name: "pr_owner_email", type: "string", required: false, description: "Email of the PR owner" },
    { name: "delivertto_location_name", type: "string", required: false, description: "Delivery location name" },
    { name: "delivery_date", type: "string", required: false, description: "Required delivery date in YYYY-MM-DD format" },
    { name: "budget_name", type: "string", required: false, description: "Associated budget name" },
    { name: "currency", type: "string", required: false, description: "Currency code (default: AED)" },
    { name: "notes", type: "string", required: false, description: "Additional notes" },
    { name: "org_id", type: "string", required: false, description: "Organization ID" },
    { name: "lines", type: "array", required: true, description: "Array of PR line items (see below)" },
  ],
  lineFields: [
    { name: "line_num", type: "number", required: true, description: "Line number" },
    { name: "item_description", type: "string", required: true, description: "Item description" },
    { name: "qty", type: "number", required: true, description: "Requested quantity" },
    { name: "uom", type: "string", required: false, description: "Unit of measure (default: EA)" },
    { name: "unit_cost", type: "number", required: true, description: "Estimated unit cost" },
    { name: "amount", type: "number", required: false, description: "Line amount (qty x unit_cost if not provided)" },
    { name: "item_id", type: "string", required: false, description: "Internal item ID from ERP" },
    { name: "product_category_name", type: "string", required: false, description: "Product category name" },
    { name: "curr_code", type: "string", required: false, description: "Line-level currency code" },
  ],
  sampleRequest: `{
  "pr_number": "PR_ERP_10045",
  "pr_description": "IT Equipment - Q1 2026",
  "department_name": "Information Technology",
  "requestor_name": "John Smith",
  "requestor_email": "john.smith@company.com",
  "pr_owner_name": "Jane Doe",
  "delivertto_location_name": "Head Office",
  "delivery_date": "2026-03-15",
  "currency": "AED",
  "notes": "Approved by IT Head",
  "lines": [
    {
      "line_num": 1,
      "item_description": "Laptop - Dell XPS 15",
      "qty": 10,
      "uom": "EA",
      "unit_cost": 5500.00
    },
    {
      "line_num": 2,
      "item_description": "Monitor - 27 inch 4K",
      "qty": 10,
      "uom": "EA",
      "unit_cost": 1800.00
    }
  ]
}`,
  sampleResponse: `{
  "success": true,
  "message": "Purchase Requisition created successfully",
  "data": {
    "pr_number": "PR_ERP_10045",
    "pr_status": "Approved",
    "pr_amount": 73000.00
  }
}`,
  sampleErrorResponse: `{
  "error": "pr_number is required",
  "field": "pr_number"
}`,
  curlExample: `curl -X POST https://your-domain.com/api/v1/integration/inbound/purchase-requisition \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: pk_your_api_key_here" \\
  -d '{
    "pr_number": "PR_ERP_10045",
    "pr_description": "IT Equipment - Q1 2026",
    "department_name": "Information Technology",
    "requestor_name": "John Smith",
    "currency": "AED",
    "lines": [
      {
        "line_num": 1,
        "item_description": "Laptop - Dell XPS 15",
        "qty": 10,
        "uom": "EA",
        "unit_cost": 5500.00
      }
    ]
  }'`,
};

const poEndpoint: EndpointConfig = {
  id: "po",
  path: "/api/v1/integration/inbound/purchase-order",
  label: "Create Purchase Order",
  description: "Creates a Purchase Order (PO) in Prokraya when a PO is approved in the ERP system. The PO is created with status 'Approved' and includes supplier details, header information, and line items with pricing and tax details.",
  headerFields: [
    { name: "po_number", type: "string", required: true, description: "Purchase Order number from the ERP system" },
    { name: "po_description", type: "string", required: true, description: "Description of the purchase order" },
    { name: "po_type", type: "string", required: false, description: "PO type (default: STANDARD)" },
    { name: "po_status", type: "string", required: false, description: "PO status (default: Approved)" },
    { name: "supplier_id", type: "number", required: false, description: "Supplier ID in Prokraya" },
    { name: "company_name", type: "string", required: true, description: "Supplier/company name" },
    { name: "buyer_name", type: "string", required: false, description: "Name of the buyer" },
    { name: "buyer_email", type: "string", required: false, description: "Email of the buyer" },
    { name: "po_owner_name", type: "string", required: false, description: "Name of the PO owner/requestor" },
    { name: "po_owner_email", type: "string", required: false, description: "Email of the PO owner" },
    { name: "department_name", type: "string", required: false, description: "Department name" },
    { name: "po_currency", type: "string", required: false, description: "Currency code (default: AED)" },
    { name: "delivertto_location_name", type: "string", required: false, description: "Delivery location name" },
    { name: "shipto_address", type: "string", required: false, description: "Ship-to address" },
    { name: "billto_address", type: "string", required: false, description: "Bill-to address" },
    { name: "po_required_date", type: "string", required: false, description: "Required delivery date in YYYY-MM-DD format" },
    { name: "budget_name", type: "string", required: false, description: "Associated budget name" },
    { name: "payment_terms_name", type: "string", required: false, description: "Payment terms name" },
    { name: "advance_flag", type: "string", required: false, description: "Advance payment flag (Y/N)" },
    { name: "advance_percentage", type: "number", required: false, description: "Advance payment percentage" },
    { name: "pr_number", type: "string", required: false, description: "Linked PR number (if originated from a PR)" },
    { name: "org_id", type: "string", required: false, description: "Organization ID" },
    { name: "lines", type: "array", required: true, description: "Array of PO line items (see below)" },
  ],
  lineFields: [
    { name: "po_line_number", type: "number", required: true, description: "Line number" },
    { name: "line_description", type: "string", required: true, description: "Line item description" },
    { name: "line_qty", type: "number", required: true, description: "Ordered quantity" },
    { name: "line_unit_cost", type: "number", required: true, description: "Unit price" },
    { name: "line_unit", type: "string", required: false, description: "Unit of measure (default: EA)" },
    { name: "line_curr", type: "string", required: false, description: "Line-level currency code" },
    { name: "tax_rate", type: "number", required: false, description: "Tax rate percentage" },
    { name: "tax_rate_code", type: "string", required: false, description: "Tax rate code" },
    { name: "taxable_flag", type: "string", required: false, description: "Taxable flag (Y/N)" },
    { name: "tax_amount", type: "number", required: false, description: "Tax amount for this line" },
    { name: "line_cost", type: "number", required: false, description: "Total line cost (qty x unit_cost + tax, calculated if not provided)" },
    { name: "item_id", type: "string", required: false, description: "Internal item ID" },
    { name: "item_name", type: "string", required: false, description: "Item name" },
    { name: "product_category_name", type: "string", required: false, description: "Product category name" },
  ],
  sampleRequest: `{
  "po_number": "PO_ERP_20089",
  "po_description": "Office Furniture Order - Q1 2026",
  "company_name": "ABC Furniture Supplies",
  "supplier_id": 1001,
  "buyer_name": "Sarah Johnson",
  "buyer_email": "sarah.johnson@company.com",
  "po_owner_name": "Mike Davis",
  "department_name": "Administration",
  "po_currency": "AED",
  "delivertto_location_name": "Main Office",
  "po_required_date": "2026-03-01",
  "payment_terms_name": "Net 30",
  "pr_number": "PR_ERP_10045",
  "lines": [
    {
      "po_line_number": 1,
      "line_description": "Executive Office Chair - Ergonomic",
      "line_qty": 20,
      "line_unit_cost": 1200.00,
      "line_unit": "EA",
      "tax_rate": 5,
      "tax_amount": 1200.00,
      "line_cost": 25200.00
    },
    {
      "po_line_number": 2,
      "line_description": "Standing Desk - Height Adjustable",
      "line_qty": 15,
      "line_unit_cost": 2500.00,
      "line_unit": "EA",
      "tax_rate": 5,
      "tax_amount": 1875.00,
      "line_cost": 39375.00
    }
  ]
}`,
  sampleResponse: `{
  "success": true,
  "message": "Purchase Order created successfully",
  "data": {
    "po_number": "PO_ERP_20089",
    "po_status": "Approved",
    "po_total_cost": 64575.00
  }
}`,
  sampleErrorResponse: `{
  "error": "po_number is required",
  "field": "po_number"
}`,
  curlExample: `curl -X POST https://your-domain.com/api/v1/integration/inbound/purchase-order \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: pk_your_api_key_here" \\
  -d '{
    "po_number": "PO_ERP_20089",
    "po_description": "Office Furniture Order",
    "company_name": "ABC Furniture Supplies",
    "po_currency": "AED",
    "lines": [
      {
        "po_line_number": 1,
        "line_description": "Executive Office Chair",
        "line_qty": 20,
        "line_unit_cost": 1200.00,
        "tax_rate": 5
      }
    ]
  }'`,
};

const paymentEndpoint: EndpointConfig = {
  id: "payment",
  path: "/api/v1/integration/inbound/payment",
  label: "Create Payment Details",
  description: "Records payment details in Prokraya when a payment is made in the ERP system against an existing invoice. Updates the invoice payment status to 'Paid' and creates a payment record with bank/cheque details and TDS information.",
  headerFields: [
    { name: "invoice_number", type: "string", required: true, description: "Invoice number in Prokraya to record payment against" },
    { name: "payment_method", type: "string", required: true, description: "Payment method (e.g., Bank Transfer, Cheque, Online)" },
    { name: "payment_date", type: "string", required: true, description: "Payment date in YYYY-MM-DD format" },
    { name: "amount_paid", type: "number", required: true, description: "Amount paid" },
    { name: "payment_curr_code", type: "string", required: false, description: "Payment currency code (default: AED)" },
    { name: "payment_description", type: "string", required: false, description: "Payment description or reference notes" },
    { name: "bank_name", type: "string", required: false, description: "Bank name (for bank transfer payments)" },
    { name: "bank_branch", type: "string", required: false, description: "Bank branch" },
    { name: "bank_transfer_ref_no", type: "string", required: false, description: "Bank transfer reference number" },
    { name: "online_transfer_account_no", type: "string", required: false, description: "Online transfer account number" },
    { name: "cheque_number", type: "string", required: false, description: "Cheque number (for cheque payments)" },
    { name: "cheque_date", type: "string", required: false, description: "Cheque date in YYYY-MM-DD format" },
    { name: "cheque_collected_by", type: "string", required: false, description: "Name of person who collected the cheque" },
    { name: "cheque_collection_date", type: "string", required: false, description: "Date cheque was collected in YYYY-MM-DD format" },
    { name: "cheque_collector_contact_no", type: "string", required: false, description: "Contact number of cheque collector" },
    { name: "cheque_collector_email", type: "string", required: false, description: "Email of cheque collector" },
    { name: "tds_category", type: "string", required: false, description: "TDS category code" },
    { name: "tds_percentage", type: "number", required: false, description: "TDS percentage" },
    { name: "tds_amount", type: "number", required: false, description: "TDS deduction amount" },
    { name: "org_id", type: "string", required: false, description: "Organization ID" },
  ],
  sampleRequest: `{
  "invoice_number": "INV-2026-00123",
  "payment_method": "Bank Transfer",
  "payment_date": "2026-02-10",
  "amount_paid": 64575.00,
  "payment_curr_code": "AED",
  "payment_description": "Payment for PO_ERP_20089",
  "bank_name": "Emirates NBD",
  "bank_branch": "Dubai Main Branch",
  "bank_transfer_ref_no": "TRF-2026-98765",
  "tds_category": "Professional Services",
  "tds_percentage": 2,
  "tds_amount": 1291.50
}`,
  sampleResponse: `{
  "success": true,
  "message": "Payment recorded successfully",
  "data": {
    "invoice_number": "INV-2026-00123",
    "payment_status": "Paid",
    "amount_paid": 64575.00,
    "payment_method": "Bank Transfer"
  }
}`,
  sampleErrorResponse: `{
  "error": "invoice_number is required",
  "field": "invoice_number"
}`,
  curlExample: `curl -X POST https://your-domain.com/api/v1/integration/inbound/payment \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: pk_your_api_key_here" \\
  -d '{
    "invoice_number": "INV-2026-00123",
    "payment_method": "Bank Transfer",
    "payment_date": "2026-02-10",
    "amount_paid": 64575.00,
    "bank_name": "Emirates NBD",
    "bank_transfer_ref_no": "TRF-2026-98765"
  }'`,
};

const errorCodes = [
  { code: "400", description: "Bad Request", details: "Missing or invalid required fields in the request body" },
  { code: "401", description: "Unauthorized", details: "Missing X-API-Key header" },
  { code: "403", description: "Forbidden", details: "Invalid, revoked, or expired API key" },
  { code: "404", description: "Not Found", details: "Referenced entity (e.g., Purchase Order, Invoice) not found in the system" },
  { code: "409", description: "Conflict", details: "Duplicate record - entity with this number already exists" },
  { code: "500", description: "Internal Server Error", details: "Unexpected server error - contact support" },
];

export default function ApiDocs() {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);

  return (
    <div className="p-4 space-y-3" data-testid="page-api-docs">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-page-title">API Documentation</h1>
        <p className="text-sm text-muted-foreground">
          Reference documentation for the Prokraya Inbound Integration Gateway. Use these endpoints to push data from external systems (ERP, WMS) into Prokraya.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-medium mb-1">Authentication</h3>
              <p className="text-sm text-muted-foreground mb-2">
                All API requests must include a valid API key in the <code className="bg-muted px-1 py-0.5 rounded text-xs">X-API-Key</code> header.
                Generate API keys from the <strong>API Keys</strong> page under Integrations.
              </p>
              <CodeBlock code={`X-API-Key: pk_your_api_key_here`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm font-medium mb-2">Endpoints</div>

      <EndpointSection config={receiptEndpoint} isOpen={receiptOpen} onToggle={setReceiptOpen} />
      <EndpointSection config={prEndpoint} isOpen={prOpen} onToggle={setPrOpen} />
      <EndpointSection config={poEndpoint} isOpen={poOpen} onToggle={setPoOpen} />
      <EndpointSection config={paymentEndpoint} isOpen={paymentOpen} onToggle={setPaymentOpen} />

      <Collapsible open={healthOpen} onOpenChange={setHealthOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer py-3 px-4">
              <div className="flex items-center gap-3">
                {healthOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">GET</span>
                <code className="text-sm font-mono">/api/v1/integration/health</code>
                <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">Health Check</span>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 px-4 pb-3 space-y-3">
              <div className="flex items-start gap-2">
                <HeartPulse className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Verifies that the Integration Gateway is running and your API key is valid.
                  Use this for monitoring or connectivity tests from your ERP system.
                </p>
              </div>
              <CodeBlock code={`{
  "status": "ok",
  "service": "Prokraya Integration Gateway",
  "version": "1.0",
  "timestamp": "2025-12-15T10:30:00.000Z"
}`} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Error Codes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">Code</TableHead>
                <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">Status</TableHead>
                <TableHead className="h-9 py-2 text-xs font-medium">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errorCodes.map(ec => (
                <TableRow key={ec.code}>
                  <TableCell className="py-1.5">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${ec.code.startsWith("4") ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}`}
                    >
                      {ec.code}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 font-medium text-xs">{ec.description}</TableCell>
                  <TableCell className="py-1.5 text-xs text-muted-foreground">{ec.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-medium mb-1">Integration Notes</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                <li>All timestamps should be in ISO 8601 format (YYYY-MM-DD for dates).</li>
                <li>PRs and POs from ERP are created with "Approved" status in Prokraya by default.</li>
                <li>The PO referenced in a receipt must already exist in Prokraya.</li>
                <li>The Invoice referenced in a payment must already exist in Prokraya.</li>
                <li>Every inbound API call is automatically logged in the Interface Monitor for audit and troubleshooting.</li>
                <li>API keys can be generated, revoked, and managed from the API Keys page.</li>
                <li>Rate limiting is not currently enforced but may be introduced in future versions.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
