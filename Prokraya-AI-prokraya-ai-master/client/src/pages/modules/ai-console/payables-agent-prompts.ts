export interface PromptCategory {
  module: string;
  icon: string;
  prompts: string[];
  /** Phase 2 templates — kept for later; not rendered by the Payables agent UI. */
  phase2Prompts?: string[];
}

/** Phase 1 quick-action chip templates shown above the composer. */
export const payablesQuickActions = {
  invoiceDetails: "Show details for invoice [invoice #]",
  threeWayMatching: "Run a 3-way match for invoice [invoice #]",
  invoiceCreation:
    "Create an invoice for [supplier] with the following line items: [line items] & [quantitys] with [unit price], and optionally link the invoice to [PO/GRN ref].",
  fraudDetection: "Analyze invoice(s) [invoice #] for anomaly",
} as const;

/**
 * Phase 1 only is rendered via `prompts`.
 * Phase 2 lives in `phase2Prompts` / `payablesAgentPhase2Categories` and is unused in the UI.
 */
export const payablesAgentPrompts: PromptCategory[] = [
  {
    module: "Invoice Creation",
    icon: "FilePlus",
    prompts: [
      "Create a standard invoice for [supplier], amount [amount] [currency]",
      // "Create invoice for [PO / GRN ref]",
      "Create invoice for [item]",
    ],
    phase2Prompts: [
      "Create a credit note [CN #] for [supplier], amount [amount] [currency]",
      "Create a debit memo [DM #] for [supplier], [amount] [currency] for returned goods",
    ],
  },
  {
    module: "Add Invoice Lines",
    icon: "ListPlus",
    prompts: [
      "Add [qty] [item] at [unit price] each to invoice [invoice #]",
      "Add [qty] [item] at [unit price] each with [tax %] tax to invoice [invoice #]",
      "Add [qty] [item A] at [price A] each and [qty] [item B] at [price B] each to invoice [invoice #]",
    ],
  },
  {
    module: "Submit & Pay Invoices",
    icon: "CreditCard",
    prompts: [
      "Submit invoice [invoice #] for approval",
    ],
    phase2Prompts: [
      "Submit all draft invoices for supplier [supplier] for approval",
      "Update payment for invoice [invoice #] via [payment method], date [YYYY-MM-DD]",
      "Mark invoice [invoice #] as paid via [payment method], date [YYYY-MM-DD]",
    ],
  },
  {
    module: "Invoice Search & Discovery",
    icon: "Search",
    prompts: [
      "List all invoices with status [status] (draft / pending / approved / paid / rejected / overdue)",
      "Search for invoices from [supplier]",
      "Find invoices linked to [PO ref]",
      "Search invoices with amount over [amount]",
      "Find invoices for the [department] department",
    ],
  },
  {
    module: "Invoice Details & Lines",
    icon: "FileText",
    prompts: [
      "Show me the details of invoice [invoice #]",
      "What are the line items on invoice [invoice #]?",
      "Get the due date and payment terms for invoice [invoice #]",
    ],
    phase2Prompts: [
      "What's the total amount on invoice [invoice #] including tax?",
    ],
  },
  {
    module: "3-Way Matching (AI)",
    icon: "GitCompare",
    prompts: [
      "Run 3-way matching on invoice [invoice #]",
      "Run a full 3-way match with document OCR on invoice [invoice #]",
    ],
    phase2Prompts: [
      "Check for price variances between invoice [invoice #] and its PO",
      "Analyze invoice [invoice #] for discrepancies against the PO",
    ],
  },
  {
    module: "Fraud Detection (AI)",
    icon: "ShieldAlert",
    prompts: [
      "Run a fraud check on invoice [invoice #]",
    ],
    phase2Prompts: [
      "Check invoice [invoice #] for duplicate or fraudulent patterns",
      "Are there any red flags on invoice [invoice #]?",
      "Check invoice [invoice #] for duplicate patterns and vendor frequency spikes",
      "Run AI fraud detection on the latest invoices from [supplier]",
    ],
  },
];

/** Phase 2-only sections — not rendered by the Payables agent UI. */
export const payablesAgentPhase2Categories: PromptCategory[] = [
  {
    module: "Payment & Approval History",
    icon: "History",
    prompts: [
      "Show payment details for invoice [invoice #]",
      "What's the approval history of invoice [invoice #]?",
      "Who approved invoice [invoice #] and when?",
      "When was invoice [invoice #] paid and how much?",
      "Show the approval chain and comments for invoice [invoice #]",
    ],
  },
  {
    module: "Statistics & Analytics",
    icon: "BarChart3",
    prompts: [
      "Show me invoice statistics",
      "Give me a dashboard overview of invoices",
      "What's the total value of all invoices?",
      "What's the breakdown of invoices by status?",
      "Show me the total outstanding invoice amount",
      "How many invoices are approved but not yet paid?",
    ],
  },
];
