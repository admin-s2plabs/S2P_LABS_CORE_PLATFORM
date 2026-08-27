import OpenAI from "openai";
import { getAIClient, getAIModelName } from "./ai-client";
import type { AgentChartSpec } from "@shared/agent-chart";
import { agentToolIsMutatingForChartGate, barChartFromCountMap } from "@shared/agent-chart";
import type {
  BidMention,
  BusinessUserMention,
  InvoiceMention,
  ItemMention,
  PrMention,
  PoMention,
  SupplierMention,
} from "@shared/agent-mention";
import * as invoiceService from "../modules/invoices/invoices.service";
import * as invoiceRepo from "../modules/invoices/invoices.repository";
import { analyzeInvoiceMatch } from "./invoice-match-service";
import { analyzeInvoiceFraud } from "./invoice-fraud-service";
import { applyAllMentionsToPrompt } from "./agent-mention-utils";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  type: string;
  data: any;
  summary: string;
}

interface PayablesAgentResponse {
  response: string;
  pendingAction?: PendingAction;
  pendingActions?: PendingAction[];
  chart?: AgentChartSpec;
}

const PAYABLES_AGENT_SYSTEM_PROMPT = `You are an AI Payables Agent for Prokraya, an enterprise procurement platform. You help finance and procurement teams with ALL invoice and payment-related tasks — from querying invoices, performing 3-way matching, detecting fraud, to creating invoices, adding line items, processing payments, and submitting for approval.

## TODAY'S DATE: ${new Date().toISOString().split("T")[0]}
Use this for any "today", "this month", "this week" references. Current month = ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}.

## YOUR CAPABILITIES

### READ OPERATIONS (Query & Intelligence)
You can search invoices, get invoice details with lines, view invoice statistics, check payment records, view approval history, and answer any question about the invoice database.

### WRITE OPERATIONS (Actions)
You can:
- **Create invoices** — create new invoices from natural language
- **Add line items to invoices** — add items with quantities, prices, tax only to non-PO invoices in Draft or More Info Required that the user can edit. PO-backed invoices get their lines from the purchase order.
- **Submit invoices for approval** — send non-PO draft invoices into the approval workflow. PO-backed invoices cannot be submitted from this agent.
- **Process payments** — record payments against approved invoices
- These write operations use a two-phase confirmation pattern: first you prepare/preview, then execute after user confirms

### AI-POWERED ANALYSIS
You can:
- **3-Way Matching** — AI-powered PO-GRN-Invoice matching with document OCR analysis
- **Fraud Detection** — Pattern analysis across all historical invoices to detect suspicious behavior

## TOOL USAGE RULES

### READ TOOLS
1. **search_invoices**: Find/list/filter invoices by status, search text, amount range, date range, invoice type, supplier ID, overdue status
2. **get_invoice_details**: Full invoice details. Supports BOTH invoiceId (record key like "INV_00042") AND invoiceNumber (the supplier's number, e.g. "298302")
3. **get_invoice_stats**: Invoice statistics — counts, values per status, overdue counts. Supports date range filtering
4. **get_invoice_lines**: Get all line items for a specific invoice (by ID or invoice number)
5. **get_payment_record**: Get payment details for a paid invoice (by ID or invoice number)
6. **get_approval_history**: Get the approval trail for an invoice (by ID or invoice number)

### WRITE TOOLS (Two-Phase: prepare → execute)
7. **prepare_create_invoice / execute_create_invoice**: Create a new invoice
8. **prepare_add_invoice_line / execute_add_invoice_line**: Add a line item to a non-PO invoice in Draft or More Info Required (by ID or invoice number). Refuse PO-backed invoices.
9. **prepare_submit_invoice / execute_submit_invoice**: Submit a non-PO draft invoice for approval (by ID or invoice number). Refuse PO-backed invoices.
10. **prepare_process_payment / execute_process_payment**: Process payment for an approved invoice (by ID or invoice number)

### AI ANALYSIS TOOLS
11. **run_ai_match**: Run AI-powered 3-way matching (Invoice vs PO vs GRN) with optional document OCR (by ID or invoice number)
12. **run_fraud_check**: Run AI-powered fraud detection analysis on an invoice (by ID or invoice number)

## CRITICAL: INVOICE IDENTIFICATION
- There are two different references, and they are easy to mix up:
  - \`invoiceId\` — Prokraya's internal record key. Always prefixed text: \`INV_00042\`, \`NPI_00007\`. Never a plain number.
  - \`invoiceNumber\` — the supplier's own invoice number. Free text that is very often ALL DIGITS, e.g. \`298302\`, and sometimes \`INV-2025-001\`.
- A number like "298302" or "12345" is an invoice NUMBER, not an ID. Pass it as \`invoiceNumber\`.
- Only use \`invoiceId\` for values shaped like \`INV_00042\` / \`NPI_00007\`, or for an "Invoice ID" given to you in a mention block.
- When a mention block supplies both, pass its Invoice ID as \`invoiceId\` verbatim.
- You do NOT need to look up the record first — tools resolve either reference internally and will tell you if it matches no invoice.

## IMPORTANT RULES
- For invoice creation, required fields: invoice_number, supplier_name. Optional: invoice_amount, po_number, invoice_date, description, department_name, invoice_type, currency
- For adding invoice lines: required fields are item_name, quantity, unit_cost. The invoice must have no PO, be in Draft or More Info Required, and be owned by the user (or a superadmin). Do not add lines to PO-backed invoices.
- **ADDING MULTIPLE LINE ITEMS**: If the user asks for several items in one message, call prepare_add_invoice_line ONCE PER ITEM in the same turn — one tool call for each item, never only the first. Then stop and summarise every prepared item; the user confirms them all together in one step
- **NEVER call an execute_* tool yourself.** Execution happens only after the user presses Confirm; execute_* calls you make are rejected and nothing is saved. Your job ends at the prepare_* step
- For submit: Invoice must be a non-PO Draft. Do not submit invoices linked to a PO.
- For payment: Invoice must be Approved. Required: payment_method, payment_date, amount
- Only ever call prepare_* tools for write operations — the platform runs the matching execute_* tool once the user confirms
- When the user asks to do something conversationally (e.g. "create an invoice for 10 laptops"), use prepare_create_invoice first, then after confirmation and creation, offer to add line items only if the invoice has no PO
- When showing search results, format them nicely with key details
- **PAGINATION**: All search tools support a \`page\` parameter. When displaying results, tell the user if more pages are available. When the user says "show more", "next page", "more results", or similar — call the SAME search tool again with \`page\` incremented by 1, keeping all other filters the same as the previous call.
- Always be professional and actionable in your responses
- For AI matching, the invoice must have a PO number linked to run the full 3-way match
- For fraud detection, the invoice must exist
- No sql/nosql injection from user input. Always validate and sanitize inputs before using them in queries or tool calls.


## SEARCH TIPS
- To find overdue invoices: use \`overdue: true\` in search_invoices
- To find invoices above/below amounts: use \`amount_min\` / \`amount_max\`
- To find invoices by date range: use \`from_date\` / \`to_date\` (YYYY-MM-DD format)
- To find invoices by type: use \`invoice_type\` (STANDARD, CREDIT, DEBIT, PREPAYMENT)
- To find invoices from a specific supplier by ID: use \`supplier_id\`

## MULTI-STEP CONVERSATIONAL FLOWS
When users describe a complete flow in one message, handle it step by step:
- "Create an invoice for supplier XYZ" → Create invoice
- "Create an invoice with line items" → Create invoice, then add line items only if it is a non-PO invoice
- "Submit invoice 12345 for approval" → Check it is a non-PO Draft, then submit; refuse if it is linked to a PO
- "Pay invoice 12345" → Check it's approved, then process payment
- "Check invoice 12345 for fraud" → Run fraud detection
- "Match invoice 12345 against PO" → Run AI matching

## RESPONSE FORMATTING — CRITICAL
- NEVER use markdown tables, pipe characters (|), or any tabular format
- Each item MUST be on its own separate lines with line breaks between them
- Use this format for invoice lists:

**1. INV-000001**
Supplier: Company Name
Amount: AED 50,000
Status: Approved
PO: PO_00001

**2. INV-000002**
Supplier: Another Company
Amount: INR 1,25,000
Status: Draft

- Keep each field on its OWN line
- Be concise and actionable
- Highlight urgency for overdue invoices, payment deadlines
- Suggest next actions
- For action proposals, clearly list what will be created and ask for confirmation

## DATA CONTEXT
- Invoice statuses: Draft, Pending Approval, Approved, Rejected, Paid
- Invoice types: STANDARD, CREDIT, DEBIT, PREPAYMENT
- Payment methods: Bank Transfer, Cheque, Online, Cash, UPI
- Default currency: AED`;

/**
 * `supp_invoice_dtls.id` is a prefixed text key, never a plain number, and the
 * supplier's invoice number often is a plain number. Declaring either as
 * "numeric" makes the model file an invoice number under `invoiceId`, which
 * resolves to nothing.
 */
const INVOICE_ID_PARAM = {
  type: "string",
  description:
    "Prokraya's internal invoice record key, e.g. INV_00042 or NPI_00007. Not the supplier's invoice number.",
};

const INVOICE_NUMBER_PARAM = {
  type: "string",
  description:
    "The supplier's invoice number as printed on the invoice. Often all digits (e.g. 298302), sometimes text (e.g. INV-2025-001). Use this for any reference that is not an INV_/NPI_ record key.",
};

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_invoices",
      description: "Search for invoices in the database. Supports filtering by status, search text (invoice number, supplier name, PO number, description). Use this for any invoice lookup, listing, or filtering request.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term (invoice number, supplier name, PO number, description)" },
          status: { type: "string", description: "Filter by status", enum: ["Draft", "Pending Approval", "Approved", "Rejected", "Paid", "all"] },
          limit: { type: "number", description: "Max results to return (default 10, max 50)" },
          page: { type: "number", description: "Page number for pagination (default 1)" },
          invoice_type: { type: "string", description: "Filter by type", enum: ["STANDARD", "CREDIT", "DEBIT", "PREPAYMENT"] },
          supplier_id: { type: "number", description: "Filter by supplier ID" },
          amount_min: { type: "number", description: "Minimum invoice amount" },
          amount_max: { type: "number", description: "Maximum invoice amount" },
          from_date: { type: "string", description: "Start date for invoice date filter (YYYY-MM-DD)" },
          to_date: { type: "string", description: "End date for invoice date filter (YYYY-MM-DD)" },
          overdue: { type: "boolean", description: "If true, only show overdue invoices (past due date, not paid/rejected)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice_details",
      description: "Get detailed information about a specific invoice including supplier info, PO reference, amounts, dates, and status.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice_stats",
      description: "Get comprehensive invoice statistics — total counts, breakdown by status (draft, pending, approved, paid, rejected), and total value.",
      parameters: {
        type: "object",
        properties: {
          from_date: { type: "string", description: "Start date for date range filter (YYYY-MM-DD)" },
          to_date: { type: "string", description: "End date for date range filter (YYYY-MM-DD)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice_lines",
      description: "Get all line items for a specific invoice — item names, quantities, unit costs, tax, totals.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_record",
      description: "Get payment details for an invoice — payment method, amount paid, date, bank details.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_approval_history",
      description: "Get the approval history/trail for an invoice — who approved, when, comments.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_create_invoice",
      description: "Prepare to create a new invoice. Returns a preview for user confirmation. Required: invoice_number, supplier_name.",
      parameters: {
        type: "object",
        properties: {
          invoice_number: { type: "string", description: "Invoice number (e.g. INV-000001)" },
          supplier_name: { type: "string", description: "Supplier/vendor company name" },
          supplier_id: { type: "number", description: "Supplier ID if known" },
          invoice_amount: { type: "number", description: "Total invoice amount" },
          invoice_type: { type: "string", description: "Invoice type", enum: ["STANDARD", "CREDIT", "DEBIT", "PREPAYMENT"] },
          invoice_curr_code: { type: "string", description: "Currency code (default AED)" },
          invoice_date: { type: "string", description: "Invoice date (YYYY-MM-DD)" },
          inv_due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          po_number: { type: "string", description: "Linked PO number" },
          description: { type: "string", description: "Invoice description" },
          department_name: { type: "string", description: "Department name" },
          cost_center_name: { type: "string", description: "Cost center" },
          payment_terms_name: { type: "string", description: "Payment terms" },
        },
        required: ["invoice_number", "supplier_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_create_invoice",
      description: "Execute the creation of an invoice after user confirms the preview from prepare_create_invoice. ONLY call after prepare and user confirmation.",
      parameters: {
        type: "object",
        properties: {
          _confirmed: { type: "boolean", description: "Must be true to execute" },
          invoice_number: { type: "string" },
          supplier_name: { type: "string" },
          supplier_id: { type: "number" },
          invoice_amount: { type: "number" },
          invoice_type: { type: "string" },
          invoice_curr_code: { type: "string" },
          invoice_date: { type: "string" },
          inv_due_date: { type: "string" },
          po_number: { type: "string" },
          description: { type: "string" },
          department_name: { type: "string" },
          cost_center_name: { type: "string" },
          payment_terms_name: { type: "string" },
        },
        required: ["_confirmed", "invoice_number", "supplier_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_add_invoice_line",
      description: "Prepare to add a line item to a non-PO invoice in Draft or More Info Required. Returns a preview for confirmation. Do not use for invoices linked to a PO.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
          item_name: { type: "string", description: "Item/product name" },
          description: { type: "string", description: "Line item description" },
          quantity: { type: "number", description: "Quantity ordered" },
          unit_cost: { type: "number", description: "Price per unit" },
          tax_rate: { type: "number", description: "Tax rate percentage (e.g. 5 for 5%)" },
        },
        required: ["item_name", "quantity", "unit_cost"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_add_invoice_line",
      description: "Execute adding a line item to a non-PO invoice after user confirms. ONLY call after prepare and user confirmation.",
      parameters: {
        type: "object",
        properties: {
          _confirmed: { type: "boolean", description: "Must be true to execute" },
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
          item_name: { type: "string" },
          description: { type: "string" },
          quantity: { type: "number" },
          unit_cost: { type: "number" },
          tax_rate: { type: "number" },
        },
        required: ["_confirmed", "item_name", "quantity", "unit_cost"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_submit_invoice",
      description: "Prepare to submit a non-PO draft invoice for approval. Returns a preview for confirmation. Do not use for invoices linked to a PO.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_submit_invoice",
      description: "Execute submitting a non-PO draft invoice for approval after user confirms. ONLY call after prepare and user confirmation. Refuse PO-backed invoices.",
      parameters: {
        type: "object",
        properties: {
          _confirmed: { type: "boolean", description: "Must be true to execute" },
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
        },
        required: ["_confirmed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_process_payment",
      description: "Prepare to process payment for an approved invoice. Returns a preview for confirmation.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
          payment_method: { type: "string", description: "Payment method", enum: ["Bank Transfer", "Cheque", "Online", "Cash", "UPI"] },
          payment_date: { type: "string", description: "Payment date (YYYY-MM-DD)" },
          amount: { type: "number", description: "Amount to pay (defaults to invoice amount if not specified)" },
          payment_description: { type: "string", description: "Payment description/notes" },
          bank_account_no: { type: "string", description: "Bank account number for transfer" },
        },
        required: ["payment_method", "payment_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_process_payment",
      description: "Execute processing payment for an invoice after user confirms. ONLY call after prepare and user confirmation.",
      parameters: {
        type: "object",
        properties: {
          _confirmed: { type: "boolean", description: "Must be true to execute" },
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
          payment_method: { type: "string" },
          payment_date: { type: "string" },
          amount: { type: "number" },
          payment_description: { type: "string" },
          bank_account_no: { type: "string" },
        },
        required: ["_confirmed", "payment_method", "payment_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_ai_match",
      description: "Run AI-powered 3-way matching for an invoice — compares invoice against PO and GRN data, with optional document OCR. Invoice must have a PO number linked.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_fraud_check",
      description: "Run AI-powered fraud detection analysis on an invoice. Checks for duplicate invoice numbers, vendor frequency spikes, threshold gaming, amount anomalies, new vendors, repeated amounts, date anomalies, and more.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: INVOICE_ID_PARAM,
          invoiceNumber: INVOICE_NUMBER_PARAM,
        },
        required: [],
      },
    },
  },
];

/**
 * Finds the invoice a tool call refers to.
 *
 * `supp_invoice_dtls.id` is a text key (`INV_00042`) while `invoice_number` is
 * supplier text that is frequently numeric ("298302"), so the model routinely
 * puts either value in either argument. Both are treated as candidates and
 * verified against the database, so an unresolvable reference is reported as
 * such instead of silently querying a key that does not exist.
 */
async function findInvoice(args: any): Promise<any> {
  for (const candidate of [args?.invoiceId, args?.invoiceNumber]) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    const invoice = await invoiceRepo.findInvoiceByIdOrNumber(value);
    if (invoice) return invoice;
  }
  return null;
}

async function resolveInvoiceId(args: any): Promise<string | null> {
  const invoice = await findInvoice(args);
  return invoice ? String(invoice.id) : null;
}

/**
 * Invoice numbers repeat across records, so name the record that was picked
 * whenever the reference was ambiguous — otherwise the user cannot tell which
 * of several same-numbered invoices was read or acted on.
 */
function ambiguousReferenceNote(invoice: any): string {
  const matches = Number(invoice?.match_count || 1);
  if (matches <= 1) return "";
  return `\n_Note: ${matches} invoices share the number ${invoice.invoice_number}. This is the most recent one, record ${invoice.id}. Ask me to search invoices to pick a different one._\n`;
}

/**
 * The submitter identity `invoices.service` needs to start the approval
 * workflow. Agents run without a request, so there is no tenant domain to hand
 * the notification event — it falls back to the configured APP_URL.
 */
function submitterInfo(sessionUser: any, userEmail: string) {
  return {
    email: sessionUser?.email || sessionUser?.user_name || userEmail,
    userId: String(sessionUser?.id ?? sessionUser?.userId ?? "0"),
    fullName: sessionUser?.name || sessionUser?.full_name || userEmail,
    orgId: Number(sessionUser?.org_id ?? sessionUser?.orgId ?? 0),
    userName: userEmail,
  };
}

/** Echoes back what the user named, so a miss is actionable. */
function invoiceNotFoundMessage(args: any): string {
  const reference = String(args?.invoiceNumber ?? args?.invoiceId ?? "").trim();
  return reference
    ? `I couldn't find an invoice matching "${reference}". Check the invoice number, or ask me to search invoices.`
    : "Please tell me which invoice — an invoice number or record ID.";
}

const MANUAL_LINE_EDITABLE_STATUSES = new Set([
  "Draft",
  "More Info Required",
  "more",
  "More Information Required",
]);

function invoiceHasPo(invoice: any): boolean {
  return Boolean(String(invoice?.po_number ?? "").trim());
}

function isPayablesSuperadmin(sessionUser: any): boolean {
  const role = String(sessionUser?.userRole ?? sessionUser?.user_role ?? "").toUpperCase();
  const roles = Array.isArray(sessionUser?.roles)
    ? sessionUser.roles.map((r: unknown) => String(r).toUpperCase())
    : [];
  return role === "ROLE_SUPERADMIN" || role === "ROLE_SYSADMIN"
    || roles.includes("ROLE_SUPERADMIN") || roles.includes("ROLE_SYSADMIN");
}

function isInvoiceCreator(invoice: any, sessionUser: any, userEmail: string): boolean {
  const owner = String(invoice?.created_by ?? "").trim().toLowerCase();
  if (!owner) return true;
  const identities = [
    sessionUser?.user_name,
    sessionUser?.userName,
    sessionUser?.email,
    sessionUser?.email_id,
    userEmail,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return identities.includes(owner);
}

/** Matches invoice-detail: add lines only on non-PO invoices the user can edit. */
function refuseAddInvoiceLine(invoice: any, sessionUser: any, userEmail: string): string | null {
  const label = invoice?.invoice_number || invoice?.id;
  if (invoiceHasPo(invoice)) {
    return `Cannot add lines to invoice ${label} — it is linked to PO ${invoice.po_number}. Line items on PO-backed invoices come from the purchase order and cannot be added manually.`;
  }
  if (!MANUAL_LINE_EDITABLE_STATUSES.has(String(invoice?.invoice_status ?? ""))) {
    return `Cannot add lines to invoice ${label} — status is "${invoice?.invoice_status}". Only Draft or More Info Required invoices can have lines added.`;
  }
  if (!isPayablesSuperadmin(sessionUser) && !isInvoiceCreator(invoice, sessionUser, userEmail)) {
    return `Cannot add lines to invoice ${label} — only the invoice creator or a system administrator can add line items.`;
  }
  return null;
}

function isNonPoInvoice(invoice: any): boolean {
  const source = String(invoice?.invoice_source ?? "").trim().toUpperCase();
  if (source === "NON-PO") return true;
  if (source) return false;
  return !invoiceHasPo(invoice);
}

/** Agent submit is only for non-PO drafts. */
function refuseSubmitInvoice(invoice: any): string | null {
  const label = invoice?.invoice_number || invoice?.id;
  if (!isNonPoInvoice(invoice)) {
    const po = String(invoice?.po_number ?? "").trim();
    return po
      ? `Cannot submit invoice ${label} — it is linked to PO ${po}. Only non-PO invoices can be submitted from this agent.`
      : `Cannot submit invoice ${label} — it is a PO-backed invoice. Only non-PO invoices can be submitted from this agent.`;
  }
  if (invoice?.invoice_status !== "Draft") {
    return `Cannot submit invoice ${label} — status is "${invoice?.invoice_status}". Only Draft invoices can be submitted.`;
  }
  return null;
}

/** Write tools that may only run from the user's Confirm press, never from a model tool call. */
const CONFIRM_ONLY_TOOLS = new Set([
  "execute_create_invoice",
  "execute_add_invoice_line",
  "execute_submit_invoice",
  "execute_process_payment",
]);

function samePendingAction(a: PendingAction, b: PendingAction): boolean {
  return a.type === b.type && JSON.stringify(a.data) === JSON.stringify(b.data);
}

async function executeToolCall(
  toolName: string,
  args: any,
  sessionUser?: any
): Promise<{ result: string; pendingAction?: PendingAction; chart?: AgentChartSpec }> {
  try {
    const userEmail = sessionUser?.user_name || sessionUser?.userName || "system";

    switch (toolName) {
      case "search_invoices": {
        const limit = Math.min(args.limit || 10, 50);
        const page = Math.max(args.page || 1, 1);
        const query: any = {
          page,
          limit,
        };
        if (args.status && args.status !== "all") query.status = args.status;
        if (args.search) query.search = args.search;
        if (args.invoice_type) query.invoice_type = args.invoice_type;
        if (args.supplier_id) query.supplier_id = args.supplier_id;
        if (args.amount_min !== undefined) query.amount_min = args.amount_min;
        if (args.amount_max !== undefined) query.amount_max = args.amount_max;
        if (args.from_date) query.from_date = args.from_date;
        if (args.to_date) query.to_date = args.to_date;
        if (args.overdue) query.overdue = args.overdue;

        const result = await invoiceRepo.getInvoices(query, sessionUser);
        const invoices = result.data || [];
        const total = result.pagination?.total || 0;
        const totalPages = Math.ceil(total / limit);

        if (invoices.length === 0) {
          if (page > 1) return { result: `No more invoices to show (you've reached the end).` };
          return { result: "No invoices found matching your criteria." };
        }

        const startIdx = (page - 1) * limit;
        const formatted = invoices.map((inv: any, idx: number) => {
          let entry = `**${startIdx + idx + 1}. ${inv.invoice_number || "N/A"}**\n`;
          if (inv.supplier_name) entry += `   Supplier: ${inv.supplier_name}\n`;
          entry += `   Amount: ${inv.invoice_curr_code || "AED"} ${Number(inv.invoice_amount || 0).toLocaleString()}\n`;
          entry += `   Status: ${inv.invoice_status || "Unknown"}\n`;
          if (inv.po_number) entry += `   PO: ${inv.po_number}\n`;
          if (inv.invoice_date) entry += `   Date: ${new Date(inv.invoice_date).toLocaleDateString()}\n`;
          if (inv.invoice_type) entry += `   Type: ${inv.invoice_type}\n`;
          return entry;
        }).join("\n");

        let pagination = `Showing page ${page} of ${totalPages} (${total} total)`;
        if (page < totalPages) pagination += ` — say "show more" to see the next page`;

        return { result: `${pagination}\n\n${formatted}` };
      }

      case "get_invoice_details": {
        const resolved = await findInvoice(args);
        if (!resolved) {
          return { result: invoiceNotFoundMessage(args) };
        }
        // Re-read through getInvoiceById for the PO and supplier joins.
        const invoice = (await invoiceRepo.getInvoiceById(String(resolved.id))) || resolved;

        let detail = `## Invoice Details: ${invoice.invoice_number}\n\n`;
        detail += `**ID:** ${invoice.id}\n`;
        detail += `**Invoice Number:** ${invoice.invoice_number}\n`;
        detail += `**Status:** ${invoice.invoice_status}\n`;
        detail += `**Type:** ${invoice.invoice_type || "STANDARD"}\n`;
        detail += `**Amount:** ${invoice.invoice_curr_code || "AED"} ${Number(invoice.invoice_amount || 0).toLocaleString()}\n`;
        if (invoice.tax_amount) detail += `**Tax:** ${invoice.invoice_curr_code || "AED"} ${Number(invoice.tax_amount).toLocaleString()}\n`;
        detail += `**Supplier:** ${invoice.supplier_display_name || invoice.supplier_name || "N/A"}\n`;
        if (invoice.supplier_id) detail += `**Supplier ID:** ${invoice.supplier_id}\n`;
        if (invoice.po_number) detail += `**PO Number:** ${invoice.po_number}\n`;
        if (invoice.invoice_date) detail += `**Invoice Date:** ${new Date(invoice.invoice_date).toLocaleDateString()}\n`;
        if (invoice.inv_due_date) detail += `**Due Date:** ${new Date(invoice.inv_due_date).toLocaleDateString()}\n`;
        if (invoice.description) detail += `**Description:** ${invoice.description}\n`;
        if (invoice.department_name) detail += `**Department:** ${invoice.department_name}\n`;
        if (invoice.cost_center_name) detail += `**Cost Center:** ${invoice.cost_center_name}\n`;
        if (invoice.payment_terms_name) detail += `**Payment Terms:** ${invoice.payment_terms_name}\n`;
        if (invoice.inv_payment_status) detail += `**Payment Status:** ${invoice.inv_payment_status}\n`;
        if (invoice.inv_match_status) detail += `**Match Status:** ${invoice.inv_match_status}\n`;
        if (invoice.po_total_amount) detail += `**PO Total:** ${invoice.invoice_curr_code || "AED"} ${Number(invoice.po_total_amount).toLocaleString()}\n`;
        detail += ambiguousReferenceNote(resolved);

        return { result: detail };
      }

      case "get_invoice_stats": {
        const dateFilter: any = {};
        if (args.from_date) dateFilter.from_date = args.from_date;
        if (args.to_date) dateFilter.to_date = args.to_date;
        const stats = await invoiceRepo.getInvoiceStats(sessionUser, Object.keys(dateFilter).length > 0 ? dateFilter : undefined);

        let result = `## Invoice Statistics\n\n`;
        result += `**Total Invoices:** ${stats.total}\n`;
        result += `**Total Value:** AED ${Number(stats.total_value || 0).toLocaleString()}\n\n`;
        result += `### Status Breakdown\n`;
        result += `- Draft: ${stats.draft || 0}\n`;
        result += `- Pending Approval: ${stats.pending_approval || 0}\n`;
        result += `- Approved: ${stats.approved || 0}\n`;
        result += `- Paid: ${stats.paid || 0}\n`;
        result += `- Rejected: ${stats.rejected || 0}\n`;
        if (stats.overdue_count > 0) {
          result += `\n### Overdue\n`;
          result += `- Overdue Invoices: ${stats.overdue_count}\n`;
          result += `- Overdue Value: AED ${Number(stats.overdue_value || 0).toLocaleString()}\n`;
        }
        result += `\n### Value by Status\n`;
        result += `- Draft Value: AED ${Number(stats.draft_value || 0).toLocaleString()}\n`;
        result += `- Pending Value: AED ${Number(stats.pending_value || 0).toLocaleString()}\n`;
        result += `- Approved Value: AED ${Number(stats.approved_value || 0).toLocaleString()}\n`;
        result += `- Paid Value: AED ${Number(stats.paid_value || 0).toLocaleString()}\n`;

        const statusCounts: Record<string, number> = {
          Draft: Number(stats.draft) || 0,
          "Pending Approval": Number(stats.pending_approval) || 0,
          Approved: Number(stats.approved) || 0,
          Paid: Number(stats.paid) || 0,
          Rejected: Number(stats.rejected) || 0,
        };
        const chart = barChartFromCountMap("Invoices by status", statusCounts, { valueSeriesLabel: "Invoices" });

        return { result, chart };
      }

      case "get_invoice_lines": {
        const invoice = await findInvoice(args);
        if (!invoice) return { result: invoiceNotFoundMessage(args) };
        const lines = await invoiceRepo.getInvoiceLines(String(invoice.id));
        if (!lines || lines.length === 0) {
          return {
            result: `Invoice ${invoice.invoice_number || invoice.id} has no line items yet.${ambiguousReferenceNote(invoice)}`,
          };
        }

        const formatted = lines.map((line: any, idx: number) => {
          let entry = `**Line ${line.line_number || idx + 1}: ${line.item_name || "Item"}**\n`;
          if (line.description) entry += `   Description: ${line.description}\n`;
          entry += `   Quantity: ${line.order_qty || 0}\n`;
          entry += `   Unit Cost: ${Number(line.order_unit_cost || 0).toLocaleString()}\n`;
          entry += `   Total: ${Number(line.order_cost || 0).toLocaleString()}\n`;
          if (line.tax_amount) entry += `   Tax: ${Number(line.tax_amount).toLocaleString()}\n`;
          if (line.po_number) entry += `   PO: ${line.po_number}\n`;
          if (line.po_line_number) entry += `   PO Line: ${line.po_line_number}\n`;
          return entry;
        }).join("\n");

        return {
          result: `Invoice ${invoice.invoice_number || invoice.id} has ${lines.length} line item(s):\n\n${formatted}${ambiguousReferenceNote(invoice)}`,
        };
      }

      case "get_payment_record": {
        const invoiceId = await resolveInvoiceId(args);
        if (!invoiceId) return { result: invoiceNotFoundMessage(args) };
        const payment = await invoiceRepo.getPaymentRecord(invoiceId);
        if (!payment) {
          return { result: `No payment record found for invoice ID ${invoiceId}. The invoice may not have been paid yet.` };
        }

        let detail = `## Payment Record\n\n`;
        detail += `**Payment Method:** ${payment.paymentmethod || "N/A"}\n`;
        detail += `**Amount Paid:** ${payment.paymentcurrcode || "AED"} ${Number(payment.amountpaid || 0).toLocaleString()}\n`;
        detail += `**Invoice Amount:** ${Number(payment.invoiceamount || 0).toLocaleString()}\n`;
        detail += `**Payment Date:** ${payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : "N/A"}\n`;
        detail += `**Status:** ${payment.invpaymentstatus || "N/A"}\n`;
        if (payment.paymentdescription) detail += `**Description:** ${payment.paymentdescription}\n`;
        if (payment.bankname) detail += `**Bank:** ${payment.bankname}\n`;
        if (payment.bankbranch) detail += `**Branch:** ${payment.bankbranch}\n`;
        if (payment.onlinetrsfdacntno) detail += `**Account:** ${payment.onlinetrsfdacntno}\n`;
        if (payment.banktransferrefno) detail += `**Reference:** ${payment.banktransferrefno}\n`;

        return { result: detail };
      }

      case "get_approval_history": {
        const invoiceId = await resolveInvoiceId(args);
        if (!invoiceId) return { result: invoiceNotFoundMessage(args) };
        const history = await invoiceRepo.getInvoiceApprovalHistory(invoiceId);
        if (!history || history.length === 0) {
          return { result: `No approval history found for invoice ID ${invoiceId}.` };
        }

        const formatted = history.map((h: any, idx: number) => {
          let entry = `**${idx + 1}. ${h.approver_name || "Approver"}**\n`;
          if (h.email) entry += `   Email: ${h.email}\n`;
          if (h.designation) entry += `   Designation: ${h.designation}\n`;
          entry += `   Status: ${h.status || "Pending"}\n`;
          if (h.approved_date) entry += `   Date: ${new Date(h.approved_date).toLocaleDateString()}\n`;
          if (h.comments) entry += `   Comments: ${h.comments}\n`;
          return entry;
        }).join("\n");

        return { result: `Approval history (${history.length} entries):\n\n${formatted}` };
      }

      case "prepare_create_invoice": {
        let summary = `## Invoice Preview\n\n`;
        summary += `**Invoice Number:** ${args.invoice_number}\n`;
        summary += `**Supplier:** ${args.supplier_name}\n`;
        summary += `**Type:** ${args.invoice_type || "STANDARD"}\n`;
        summary += `**Currency:** ${args.invoice_curr_code || "AED"}\n`;
        if (args.invoice_amount) summary += `**Amount:** ${args.invoice_curr_code || "AED"} ${Number(args.invoice_amount).toLocaleString()}\n`;
        if (args.invoice_date) summary += `**Invoice Date:** ${args.invoice_date}\n`;
        if (args.inv_due_date) summary += `**Due Date:** ${args.inv_due_date}\n`;
        if (args.po_number) summary += `**PO Number:** ${args.po_number}\n`;
        if (args.description) summary += `**Description:** ${args.description}\n`;
        if (args.department_name) summary += `**Department:** ${args.department_name}\n`;
        if (args.cost_center_name) summary += `**Cost Center:** ${args.cost_center_name}\n`;
        if (args.payment_terms_name) summary += `**Payment Terms:** ${args.payment_terms_name}\n`;
        summary += `\n_The invoice will be created in Draft status.${args.po_number ? " Line items come from the linked PO and cannot be added manually." : " You can add line items after creation."}_\n`;

        return {
          result: summary,
          pendingAction: {
            type: "create_invoice",
            data: args,
            summary: `Create invoice ${args.invoice_number} for ${args.supplier_name}${args.invoice_amount ? ` — ${args.invoice_curr_code || "AED"} ${Number(args.invoice_amount).toLocaleString()}` : ""}`,
          },
        };
      }

      case "execute_create_invoice": {
        if (!args._confirmed) {
          return { result: "I've prepared the invoice details above. Please use the **Confirm** button to create this invoice, or **Cancel** to abort." };
        }

        const invoiceData: any = {
          invoice_number: args.invoice_number,
          supplier_name: args.supplier_name,
          supplier_id: args.supplier_id || null,
          invoice_amount: args.invoice_amount || 0,
          invoice_type: args.invoice_type || "STANDARD",
          invoice_curr_code: args.invoice_curr_code || "AED",
          invoice_date: args.invoice_date || new Date().toISOString().split("T")[0],
          inv_due_date: args.inv_due_date || null,
          po_number: args.po_number || null,
          description: args.description || null,
          department_name: args.department_name || null,
          cost_center_name: args.cost_center_name || null,
          payment_terms_name: args.payment_terms_name || null,
          created_by: userEmail,
          org_id: sessionUser?.org_id || null,
          invoice_source: args.po_number ? "EXTERNAL" : "NON-PO",
        };

        const result = await invoiceRepo.createInvoice(invoiceData);
        const canAddLines = !args.po_number;
        const nextStep = canAddLines
          ? "You can now add line items to this invoice or ask me to do it."
          : "This invoice is linked to a PO, so line items come from the purchase order and cannot be added manually.";

        return { result: `Invoice **${args.invoice_number}** has been successfully created!\n\n- **ID**: ${result.id}\n- **Status**: Draft\n- **Supplier**: ${args.supplier_name}\n- **Type**: ${args.invoice_type || "STANDARD"}\n- **Currency**: ${args.invoice_curr_code || "AED"}\n${args.invoice_amount ? `- **Amount**: ${args.invoice_curr_code || "AED"} ${Number(args.invoice_amount).toLocaleString()}\n` : ""}\n${nextStep}` };
      }

      case "prepare_add_invoice_line": {
        const resolved = await findInvoice(args);
        if (!resolved) return { result: invoiceNotFoundMessage(args) };
        const invoiceId = String(resolved.id);
        const invoice = (await invoiceRepo.getInvoiceById(invoiceId)) || resolved;
        const refusal = refuseAddInvoiceLine(invoice, sessionUser, userEmail);
        if (refusal) return { result: refusal };

        const lineTotal = (args.quantity || 0) * (args.unit_cost || 0);
        const taxAmount = args.tax_rate ? lineTotal * (args.tax_rate / 100) : 0;

        let summary = `## Add Line Item to ${invoice.invoice_number}\n\n`;
        summary += `**Item:** ${args.item_name}\n`;
        if (args.description) summary += `**Description:** ${args.description}\n`;
        summary += `**Quantity:** ${args.quantity}\n`;
        summary += `**Unit Cost:** ${Number(args.unit_cost).toLocaleString()}\n`;
        summary += `**Line Total:** ${Number(lineTotal).toLocaleString()}\n`;
        if (args.tax_rate) summary += `**Tax Rate:** ${args.tax_rate}%\n`;
        if (taxAmount) summary += `**Tax Amount:** ${Number(taxAmount).toLocaleString()}\n`;
        summary += `\n_This line item will be added to invoice ${invoice.invoice_number} (record ${invoiceId})._\n`;
        summary += ambiguousReferenceNote(resolved);

        return {
          result: summary,
          pendingAction: {
            type: "add_invoice_line",
            data: { ...args, invoiceId, invoiceNumber: invoice.invoice_number },
            summary: `Add "${args.item_name}" (${args.quantity} x ${Number(args.unit_cost).toLocaleString()}) to ${invoice.invoice_number}`,
          },
        };
      }

      case "execute_add_invoice_line": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to add this line item, or **Cancel** to abort." };
        }

        const resolved = await findInvoice(args);
        if (!resolved) return { result: invoiceNotFoundMessage(args) };
        const invoiceId = String(resolved.id);
        const invoice = (await invoiceRepo.getInvoiceById(invoiceId)) || resolved;
        const refusal = refuseAddInvoiceLine(invoice, sessionUser, userEmail);
        if (refusal) return { result: refusal };

        const existingLines = await invoiceRepo.getInvoiceLines(invoiceId);
        const nextLineNumber = (existingLines?.length || 0) + 1;
        const lineTotal = (args.quantity || 0) * (args.unit_cost || 0);
        const taxAmount = args.tax_rate ? lineTotal * (args.tax_rate / 100) : 0;

        await invoiceService.createInvoiceLine({
          invoice_id: invoiceId,
          line_number: nextLineNumber,
          item_name: args.item_name,
          item_type: "ITEM",
          description: args.description || null,
          order_qty: args.quantity,
          order_unit_cost: args.unit_cost,
          order_cost: lineTotal,
          tax_amount: taxAmount,
          tax_rate: args.tax_rate || 0,
          created_by: userEmail,
          last_modified_by: userEmail,
          org_id: sessionUser?.org_id || sessionUser?.orgId || null,
        });

        const updated = await invoiceRepo.getInvoiceById(invoiceId);
        const newTotal = Number(updated?.invoice_amount ?? lineTotal);

        return { result: `Line item added to invoice successfully!\n\n- **Item**: ${args.item_name}\n- **Qty**: ${args.quantity}\n- **Unit Cost**: ${Number(args.unit_cost).toLocaleString()}\n- **Line Total**: ${Number(lineTotal).toLocaleString()}\n- **Updated Invoice Total**: ${Number(newTotal).toLocaleString()}\n\nWould you like to add more items or do something else with this invoice?` };
      }

      case "prepare_submit_invoice": {
        const resolved = await findInvoice(args);
        if (!resolved) return { result: invoiceNotFoundMessage(args) };
        const invoiceId = String(resolved.id);
        const invoice = (await invoiceRepo.getInvoiceById(invoiceId)) || resolved;
        const refusal = refuseSubmitInvoice(invoice);
        if (refusal) return { result: refusal };

        let summary = `## Submit ${invoice.invoice_number} for Approval\n\n`;
        summary += `**Invoice Number:** ${invoice.invoice_number}\n`;
        summary += `**Supplier:** ${invoice.supplier_name || "N/A"}\n`;
        summary += `**Amount:** ${invoice.invoice_curr_code || "AED"} ${Number(invoice.invoice_amount || 0).toLocaleString()}\n`;
        summary += `**Record:** ${invoiceId}\n`;
        summary += `**Status:** Draft → Pending Approval\n`;
        summary += `\n_This will send the invoice into the approval workflow._\n`;
        summary += ambiguousReferenceNote(resolved);

        return {
          result: summary,
          pendingAction: {
            type: "submit_invoice",
            data: { invoiceId, invoiceNumber: invoice.invoice_number },
            summary: `Submit ${invoice.invoice_number} for approval — ${invoice.invoice_curr_code || "AED"} ${Number(invoice.invoice_amount || 0).toLocaleString()}`,
          },
        };
      }

      case "execute_submit_invoice": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to submit this invoice, or **Cancel** to abort." };
        }

        const resolved = await findInvoice(args);
        if (!resolved) return { result: invoiceNotFoundMessage(args) };
        const invoiceId = String(resolved.id);
        const invoice = (await invoiceRepo.getInvoiceById(invoiceId)) || resolved;
        const refusal = refuseSubmitInvoice(invoice);
        if (refusal) return { result: refusal };
        await invoiceService.submitInvoice(invoiceId, userEmail, submitterInfo(sessionUser, userEmail), "");

        return { result: `Invoice has been submitted for approval!\n\n- **Status**: Pending Approval\n\nThe approvers will be notified to review this invoice.` };
      }

      case "prepare_process_payment": {
        const resolved = await findInvoice(args);
        if (!resolved) return { result: invoiceNotFoundMessage(args) };
        const invoiceId = String(resolved.id);
        const invoice = (await invoiceRepo.getInvoiceById(invoiceId)) || resolved;
        if (invoice.invoice_status !== "Approved") {
          return { result: `Cannot process payment for invoice ${invoice.invoice_number} — status is "${invoice.invoice_status}". Only Approved invoices can be paid.` };
        }

        const invoiceAmount = (parseFloat(invoice.invoice_amount) || 0) + (parseFloat(invoice.tax_amount) || 0);
        const payAmount = args.amount || invoiceAmount;

        let summary = `## Process Payment for ${invoice.invoice_number}\n\n`;
        summary += `**Invoice:** ${invoice.invoice_number}\n`;
        summary += `**Supplier:** ${invoice.supplier_name || "N/A"}\n`;
        summary += `**Invoice Amount:** ${invoice.invoice_curr_code || "AED"} ${Number(invoiceAmount).toLocaleString()}\n`;
        summary += `**Amount to Pay:** ${invoice.invoice_curr_code || "AED"} ${Number(payAmount).toLocaleString()}\n`;
        summary += `**Payment Method:** ${args.payment_method}\n`;
        summary += `**Payment Date:** ${args.payment_date}\n`;
        if (args.payment_description) summary += `**Description:** ${args.payment_description}\n`;
        if (args.bank_account_no) summary += `**Bank Account:** ${args.bank_account_no}\n`;
        summary += `\n_This will mark invoice record ${invoiceId} as Paid and record the payment._\n`;
        summary += ambiguousReferenceNote(resolved);

        return {
          result: summary,
          pendingAction: {
            type: "process_payment",
            data: { ...args, invoiceId, invoiceNumber: invoice.invoice_number, invoiceAmount, payAmount },
            summary: `Pay ${invoice.invoice_number} — ${invoice.invoice_curr_code || "AED"} ${Number(payAmount).toLocaleString()} via ${args.payment_method}`,
          },
        };
      }

      case "execute_process_payment": {
        if (!args._confirmed) {
          return { result: "Please use the **Confirm** button to process this payment, or **Cancel** to abort." };
        }

        const invoiceId = await resolveInvoiceId(args);
        if (!invoiceId) return { result: invoiceNotFoundMessage(args) };
        const invoice = await invoiceRepo.getInvoiceById(invoiceId);
        if (!invoice) return { result: "Invoice not found." };

        const invoiceAmount = (parseFloat(invoice.invoice_amount) || 0) + (parseFloat(invoice.tax_amount) || 0);
        const payAmount = args.amount || invoiceAmount;

        await invoiceService.processPayment(invoiceId, {
          payment_method: args.payment_method,
          payment_date: args.payment_date,
          amount_to_pay: payAmount,
          payment_description: args.payment_description || null,
          bank_account_no: args.bank_account_no || null,
        }, userEmail);

        return { result: `Payment processed successfully!\n\n- **Invoice**: ${invoice.invoice_number}\n- **Amount Paid**: ${invoice.invoice_curr_code || "AED"} ${Number(payAmount).toLocaleString()}\n- **Method**: ${args.payment_method}\n- **Date**: ${args.payment_date}\n- **New Status**: Paid\n\nThe invoice has been marked as Paid.` };
      }

      case "run_ai_match": {
        const resolved = await findInvoice(args);
        if (!resolved) return { result: invoiceNotFoundMessage(args) };
        const invoiceId = String(resolved.id);
        const invoice = (await invoiceRepo.getInvoiceById(invoiceId)) || resolved;

        try {
          const matchResult = await analyzeInvoiceMatch(invoiceId);
          const s = matchResult.summary;

          let report = `## 3-Way Match Report: ${invoice.invoice_number}\n\n`;
          report += ambiguousReferenceNote(resolved);
          report += `**Overall Status:** ${s.overallStatus === "fully_matched" ? "Fully Matched" : s.overallStatus === "partial_match" ? "Partial Match" : "Significant Mismatches"}\n`;
          report += `**PO Reconciliation (quantities):** ${String(matchResult.po_reconciliation_status || "n/a").replace(/_/g, " ")}\n`;
          report += `**Document Verification (OCR):** ${String(matchResult.document_verification_status || "n/a").replace(/_/g, " ")}\n`;
          report += `**PO Number:** ${matchResult.poNumber || "N/A"}\n\n`;

          report += `### PO Qty Summary\n`;
          report += `- PO Qty: ${matchResult.total_po_qty ?? 0}\n`;
          report += `- GRN Qty: ${matchResult.total_grn_qty ?? 0}\n`;
          report += `- Invoice Qty: ${matchResult.total_invoice_qty ?? 0}\n`;
          report += `- Balance Qty: ${matchResult.balance_qty ?? 0}\n\n`;

          report += `### Amount Summary\n`;
          report += `- Invoice Amount: ${Number(s.totalInvoiceAmount).toLocaleString()}\n`;
          report += `- PO Amount: ${Number(s.totalPoAmount).toLocaleString()}\n`;
          report += `- Variance: ${Number(s.amountVariance).toLocaleString()} (${s.amountVariancePercent}%)\n\n`;

          report += `### Line Match Summary\n`;
          report += `- Total Lines: ${s.totalInvoiceLines}\n`;
          report += `- Matched: ${s.matched}\n`;
          report += `- Partial: ${s.partial}\n`;
          report += `- Pending: ${s.pending ?? 0}\n`;
          report += `- Unmatched: ${s.unmatched}\n`;
          if (s.invoiceLinesNotInPo) {
            report += `- Not in PO (extra billed lines, excluded from the PO reconciliation above): ${s.invoiceLinesNotInPo}\n`;
          }

          if (s.docExtractionStatus) {
            report += `\n### Document Extraction\n`;
            report += `- Status: ${s.docExtractionStatus}\n`;
            report += `- Pages in Upload: ${s.documentPageCount ?? 0}\n`;
            report += `- Invoices Found in Upload: ${s.documentInvoiceCount ?? 0}\n`;
            report += `- Invoice Lines Read: ${s.documentInvoiceLineCount ?? 0}\n`;
            if (s.documentOcrConfidence) report += `- OCR Confidence: ${s.documentOcrConfidence}\n`;
            const analysis = matchResult.documentAnalysis;
            if (analysis?.source) {
              report += `- Read From: ${analysis.source === "original_file" ? "original uploaded file" : analysis.source === "preview_image" ? "stored preview image only" : "original files and stored previews"}\n`;
            }
            if (analysis && !analysis.reliable) {
              report += `- Extraction Reliable: NO — the extracted values could not be verified against the document's own totals. Do not report them as the supplier's figures; recommend a manual check.\n`;
            }
            const extraction = matchResult.documentExtraction;
            if (extraction) {
              const charges = extraction.extractedOtherCharges;
              report += `- Totals Printed on Document: subtotal ${extraction.extractedSubtotal ?? "not readable"}, tax ${extraction.extractedTax ?? "not readable"}${charges != null ? `, other charges ${charges}` : ""}, total ${extraction.extractedTotal ?? "not readable"}\n`;
              report += extraction.totalsVerified
                ? `- Printed Total Reconciles: yes\n`
                : `- Printed Total Reconciles: NO — ${extraction.headerTotalsNote ?? "it could not be checked against a printed subtotal and tax"}. Report the total as unconfirmed.\n`;
            }
            if (s.docLinesTotal !== undefined) {
              report += `- Extracted Lines: ${s.docLinesTotal} → ${s.docLinesMatched} matched, ${s.docLinesPartial} partial, ${s.docLinesUnmatched} unmatched\n`;
            }
            if (s.docLinesNotInPo) {
              report += `- Extracted Lines Not in PO: ${s.docLinesNotInPo} (extra billed lines; they do not change the PO reconciliation)\n`;
            }
            for (const advisory of matchResult.documentAnalysis?.advisories ?? []) {
              report += `- Note: ${advisory.message}\n`;
            }
          }

          if ((matchResult as any).summary?.narrative) {
            report += `\n### AI Analysis\n${(matchResult as any).summary.narrative}\n`;
          }

          return { result: report };
        } catch (err: any) {
          return { result: `Error running AI match: ${err.message || "Unknown error"}. Ensure the invoice has a valid PO number linked.` };
        }
      }

      case "run_fraud_check": {
        const resolved = await findInvoice(args);
        if (!resolved) return { result: invoiceNotFoundMessage(args) };
        const invoiceId = String(resolved.id);

        try {
          const fraudResult = await analyzeInvoiceFraud(invoiceId);

          let report = `## Fraud Analysis: ${fraudResult.invoiceNumber}\n\n`;
          report += ambiguousReferenceNote(resolved);
          report += `**Risk Score:** ${fraudResult.riskScore}/100\n`;
          report += `**Risk Level:** ${fraudResult.riskLevel.toUpperCase()}\n`;
          report += `**Supplier:** ${fraudResult.supplierName}\n\n`;

          if (fraudResult.flags.length > 0) {
            report += `### Flags Detected (${fraudResult.flags.length})\n`;
            fraudResult.flags.forEach((flag, idx) => {
              report += `\n**${idx + 1}. ${flag.label}** [${flag.severity.toUpperCase()}, confidence ${flag.confidence}%]\n`;
              report += `${flag.description}\n`;
            });
          } else {
            report += `No fraud flags detected. The invoice appears clean.\n`;
          }

          if (fraudResult.narrative) {
            report += `\n### AI Summary\n${fraudResult.narrative}\n`;
          }

          return { result: report };
        } catch (err: any) {
          return { result: `Error running fraud check: ${err.message || "Unknown error"}.` };
        }
      }

      default:
        return { result: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`Tool execution error [${toolName}]:`, error);
    return { result: `Error executing ${toolName}: ${error.message || "Unknown error occurred"}` };
  }
}

export async function processPayablesQuery(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
  sessionUser?: any,
  confirmAction?: { type: string; data: any },
  mentions?: SupplierMention[],
  businessUserMentions?: BusinessUserMention[],
  itemMentions?: ItemMention[],
  bidMentions?: BidMention[],
  prMentions?: PrMention[],
  poMentions?: PoMention[],
  invoiceMentions?: InvoiceMention[],
): Promise<PayablesAgentResponse> {
  if (confirmAction) {
    const actionMap: Record<string, string> = {
      create_invoice: "execute_create_invoice",
      add_invoice_line: "execute_add_invoice_line",
      submit_invoice: "execute_submit_invoice",
      process_payment: "execute_process_payment",
    };

    if (confirmAction.type === "action_bundle") {
      const actions: PendingAction[] = Array.isArray(confirmAction.data?.actions)
        ? confirmAction.data.actions
        : [];
      const results: string[] = [];
      for (const action of actions) {
        const tool = actionMap[action.type];
        if (!tool) continue;
        const toolResult = await executeToolCall(tool, { ...action.data, _confirmed: true }, sessionUser);
        results.push(toolResult.result);
      }
      return {
        response: results.length
          ? results.join("\n\n---\n\n")
          : "There was nothing to execute. Please tell me what you'd like to do.",
      };
    }

    const executeTool = actionMap[confirmAction.type];
    if (executeTool) {
      const toolResult = await executeToolCall(executeTool, { ...confirmAction.data, _confirmed: true }, sessionUser);
      return { response: toolResult.result };
    }
  }

  const reinforcedPrompt = applyAllMentionsToPrompt(prompt, {
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: PAYABLES_AGENT_SYSTEM_PROMPT },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: reinforcedPrompt },
  ];

  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();
    let completion = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.5,
      max_tokens: 2000,
    });

    let assistantMessage = completion.choices[0]?.message;
    const pendingActions: PendingAction[] = [];
    let lastChart: AgentChartSpec | undefined;
    let executedMutatingTool = false;

    let loopCount = 0;
    const MAX_LOOPS = 5;

    while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0 && loopCount < MAX_LOOPS) {
      loopCount++;

      messages.push({
        role: "assistant",
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      } as any);

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = (toolCall as any).function.name;
        let fnArgs: any = {};
        try {
          fnArgs = JSON.parse((toolCall as any).function.arguments);
        } catch (e) {
          fnArgs = {};
        }

        // The model must never self-confirm a write: only the user's Confirm
        // press may run an execute_* tool, so staged items cannot be saved
        // twice (once here, once on confirm).
        if (CONFIRM_ONLY_TOOLS.has(fnName)) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content:
              "Not executed. Only the user can execute this action by pressing Confirm. Every item you prepared is already staged for their confirmation — do not call execute tools; just summarise what is awaiting confirmation.",
          } as any);
          continue;
        }

        if (agentToolIsMutatingForChartGate(fnName)) {
          executedMutatingTool = true;
        }

        const toolResult = await executeToolCall(fnName, fnArgs, sessionUser);

        if (toolResult.pendingAction) {
          const staged = toolResult.pendingAction;
          if (!pendingActions.some((existing) => samePendingAction(existing, staged))) {
            pendingActions.push(staged);
          }
        }
        if (toolResult.chart) {
          lastChart = toolResult.chart;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult.result,
        } as any);
      }

      completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.5,
        max_tokens: 2000,
      });

      assistantMessage = completion.choices[0]?.message;
    }

    const response = assistantMessage?.content || "I apologize, I couldn't process your request. Please try rephrasing.";

    const pendingAction = pendingActions[0];
    const chart = pendingAction || executedMutatingTool ? undefined : lastChart;
    return {
      response,
      pendingAction,
      pendingActions: pendingActions.length > 1 ? pendingActions : undefined,
      chart,
    };
  } catch (error: any) {
    console.error("Payables Agent API error:", error);
    return {
      response: "I'm having trouble connecting to the AI service. Please try again in a moment.",
    };
  }
}
