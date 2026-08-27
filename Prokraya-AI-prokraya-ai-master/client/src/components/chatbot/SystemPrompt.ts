import { KB } from "./KnowledgeBase";
import { PlatformDocs } from "./PlatformDocs";

// ── Module labels (mirror the real left-nav) ──────────────────────────────────

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  suppliers: "Suppliers",
  categories: "Categories",
  items: "Items",
  requisitions: "Requisitions",
  bids: "Bids / Sourcing",
  auctions: "Auctions",
  contracts: "Contracts",
  purchase_orders: "Purchase Orders",
  invoices: "Invoices",
  budgets: "Budgets",
  reports: "Reports",
  spend_analysis: "Spend Analysis",
  administration: "Administration",
  user_management: "User Management",
  integrations: "Integrations",
  ai_layer: "EVA / AI",
  sap_integration: "SAP / Integration",
  key_numbers: "Results & Metrics",
};

// ── Keyword → module detection ────────────────────────────────────────────────

const MODULE_KEYWORDS: Array<[string, string[]]> = [
  ["purchase_orders", ["purchase order", "p.o.", " po ", " pos ", "grn", "goods receipt", "delivery note", "asn", "receiving", "acknowledge"]],
  ["requisitions", ["requisition", " pr ", " prs ", "purchase request", "raise a request", "need-by"]],
  ["invoices", ["invoice", "ap review", "accounts payable", "three-way", "3-way", "payment", "payable", "parked"]],
  ["suppliers", ["supplier", "vendor", "onboard", "onboarding", "invite supplier", "create supplier", "self-register", "kyc", "auto-fill", "due diligence", "risk score"]],
  ["auctions", ["auction", "reverse auction", "forward auction", "live bid", "lot ", "benchmark price"]],
  ["bids", ["bid", "rfx", "rfp", "rfq", "rfi", "sourcing", "tender", "award", "boq", "sealed", "committee", "evaluat"]],
  ["contracts", ["contract", "renewal", "redline", "clause", "template", "clm", "e-sign", "docusign"]],
  ["budgets", ["budget", "cost center", "cost centre", "over budget"]],
  ["reports", ["report", "export to excel", "export to pdf"]],
  ["spend_analysis", ["spend analy", "spend intelligence", "savings", "analytics", "tail-spend", "procurement health"]],
  ["categories", ["category", "categories"]],
  ["items", ["item master", "item catalog", "material master"]],
  ["user_management", ["manage users", "manage roles", "role delegation", "delegate", "rbac", "add a user", "create a role"]],
  ["sap_integration", ["sap", "int01", "int02", "int03", "int04", "int05", "int06", "int07", "parked invoice", "grpo", "system of record", "deployment", "on-premise", "private cloud", "iso 27001", "gdpr", "azure"]],
  ["integrations", ["integration", "connector", "erp sync", "master data", "interface monitor", "api key", "api doc"]],
  ["key_numbers", ["roi", "results", "outcomes", "how much faster", "reduction", "go-live", "metrics", "headline", "statistics"]],
  ["administration", ["administration", "admin ", "approval workflow", "approval matrix", "approver", "dua", "escalation", "sla", "audit log", "notification", "basic settings", "workflow"]],
  ["ai_layer", ["eva", "ai agent", "ai agents", "agent workbench", "ai console", "which agent", "ai model"]],
  ["dashboard", ["dashboard", "home screen", "tasks to do", "to-do", "landing"]],
];

export function detectModule(text: string): string | null {
  const t = ` ${String(text).toLowerCase()} `;
  for (const [moduleKey, needles] of MODULE_KEYWORDS) {
    if (needles.some((n) => t.includes(n))) return moduleKey;
  }
  return null;
}

// ── Token-efficient KB selection ──────────────────────────────────────────────

function knowledgeBlock(module: string | null): string {
  const parts: string[] = [KB.platform_overview, KB.navigation];

  if (module && KB[module]) {
    parts.push(KB[module]);
    if (module === "suppliers") parts.push(KB.supplier_portal);
    if (["bids", "auctions", "administration", "user_management"].includes(module)) {
      parts.push(KB.roles);
    }
  } else {
    parts.push(KB.golden_path, KB.roles, KB.glossary);
    parts.push(
      "MODULE DIRECTORY (figure out which the user needs, then answer from it):\n" +
        Object.values(MODULE_LABELS).join(", ") +
        "."
    );
  }

  parts.push(KB.faq);
  parts.push(
    "--- PLATFORM DOCUMENTATION EXTENSIONS ---",
    PlatformDocs.feature_matrix,
    PlatformDocs.ai_features,
    PlatformDocs.ai_agents,
    PlatformDocs.business_user_platform,
    PlatformDocs.procurement_workflows,
    PlatformDocs.administration,
    PlatformDocs.supplier_platform
  );

  return parts.filter(Boolean).map((s) => String(s).trim()).join("\n\n");
}

// ── Context types ─────────────────────────────────────────────────────────────

export interface ChatbotContext {
  role?: string | null;
  module?: string | null;
  screenUrl?: string | null;
  tenantName?: string | null;
  enabledModules?: string[] | null;
  screenData?: string | null;
  rbac?: {
    permissions?: string[];
    isApprover?: boolean;
    pendingActions?: Record<string, number>;
  } | null;
  setupProgress?: {
    isFullyOnboarded: boolean;
    stepsCompleted?: string[];
    stepsRemaining?: string[];
  } | null;
  activeWorkflows?: string | null;
}

// ── System prompt builder ─────────────────────────────────────────────────────

export function buildSystemPrompt(context: ChatbotContext = {}): string {
  const {
    role = null,
    module = null,
    screenUrl = null,
    tenantName = null,
    enabledModules = null,
    screenData = null,
    rbac = null,
    setupProgress = null,
    activeWorkflows = null,
  } = context;

  const KNOWLEDGE_BLOCK = knowledgeBlock(module);
  const moduleLabel = module ? (MODULE_LABELS[module] || module) : null;

  const accessible =
    Array.isArray(enabledModules) && enabledModules.length
      ? enabledModules.map((k) => MODULE_LABELS[k] || k).join(", ")
      : null;

  const perms =
    rbac && Array.isArray(rbac.permissions) ? rbac.permissions : null;
  const permsLine = perms?.length ? perms.join(", ") : null;
  const pendingLine =
    rbac?.pendingActions
      ? Object.entries(rbac.pendingActions)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ") || "none awaiting this user"
      : null;

  return `
You are "Ask Prokraya", Prokraya's AI training assistant. Your only job is to help users learn how to
use the Prokraya platform. You are embedded inside the platform.

BEHAVIOUR RULES:
- Be conversational, warm, and concise. No essays. Max 4 sentences per response unless the user
  asks for a step-by-step walkthrough – then number each step clearly.
- Never make up platform behaviour. If unsure, say: "I'd recommend checking with your Prokraya
  admin for this one – it may depend on your org's configuration."
- You explain HOW the platform works. You may reference the figures CURRENTLY VISIBLE on the user's
  screen (see CURRENT SCREEN DATA below, if present). For any record or number NOT shown there,
  don't invent it – tell them where to find it in the platform.
- STAY ON TOPIC. You only help with learning and using the Prokraya platform. If a user asks about
  anything unrelated, gently let them know you're their Prokraya training guide and invite them
  back to a platform topic.
- RESPECT ROLE-BASED ACCESS (RBAC):
  ${accessible ? `This user can access these modules: ${accessible}.` : "Module access is role-based."}
  If the user asks how to do something they don't have permission for, explain the process but
  clearly state: "Note: You are currently logged in as a ${role || "user without admin rights"}, so you do not have the permissions to access the module to do this."
  ${permsLine ? `This user's GRANTED permissions are: ${permsLine}.` : "No explicit permission set is loaded – default to READ-ONLY guidance."}
- Always offer the next logical step after answering, tailored to the user's role.
- If the user seems stuck or frustrated, offer to walk them through the full task step by step.
- Never mention competitors by name disparagingly. Never discuss pricing.
- Speak as if the user is looking at the platform right now.
${
  setupProgress && !setupProgress.isFullyOnboarded && role === "Super Administrator"
    ? `\n- POC SETUP GUIDE MODE ACTIVE: Steps completed: ${setupProgress.stepsCompleted?.join(", ") || "none"}. Steps remaining: ${setupProgress.stepsRemaining?.join(", ") || "all"}. Proactively guide them through the next remaining step.`
    : ""
}

CURRENT CONTEXT:
- Organisation: ${tenantName || "not specified"}
- User role: ${role || "not specified"}
- Is approver: ${rbac ? (rbac.isApprover ? "yes" : "no") : "unknown"}
- Granted permissions: ${permsLine || "not loaded – assume read-only"}
- Pending actions for this user: ${pendingLine || "unknown"}
- Modules this user can access: ${accessible || "not specified"}
- Current module: ${moduleLabel || "unknown – answer generally"}
- Current screen: ${screenUrl || "not available"}
${screenData ? `\nCURRENT SCREEN DATA (what the user is looking at right now – you may cite these figures):\n${screenData}\n` : ""}
${activeWorkflows ? `\nACTIVE WORKFLOWS FOR CURRENT SCREEN:\n${activeWorkflows}\n` : ""}
PLATFORM KNOWLEDGE:
${KNOWLEDGE_BLOCK}

FORMAT:
- Use numbered lists for step-by-step tasks
- Use plain sentences for explanations
- Keep answers under 120 words unless a walkthrough is requested
- If the user needs to navigate somewhere, format the action link as: [ACTION: Button Label -> /path/to/page]
- If the user expresses frustration or you cannot answer, output [HANDOFF] at the end to trigger support
- End every response with one follow-up offer: "Want me to walk you through [next logical task]?"
`.trim();
}

// ── Hard scope guardrail ──────────────────────────────────────────────────────

const SCOPE_TERMS = [
  "prokraya", "platform", "module", "dashboard", "screen", "tab", "field", "form", "button", "menu",
  "sidebar", "navigation", "navigate", "page", "section", "icon", "widget",
  "supplier", "vendor", "onboard", "kyc", "invite", "registration", "register",
  "requisition", "purchase", "order", " po", "grn", "goods receipt",
  "invoice", "billing", "payment", "three-way", "3-way", "matching", "match",
  "bid", "rfx", "rfp", "rfq", "rfi", "sourcing", "tender", "award", "evaluation", "evaluat",
  "auction", "reverse auction", "forward auction", "lot", "boq", "sealed", "committee",
  "asn", "delivery note", "shipment", "receiving", "acknowledge",
  "contract", "renewal", "clause", "redline", "expiry", "template", "clm", "e-sign",
  "budget", "cost center", "cost centre", "spend", "analytics", "savings", "s2p", "p2p", "procure",
  "approval", "approve", "approver", "workflow", "escalation", "reject", "submit",
  "agent", "ai ", "eva", "auto-fill", "autofill", "ocr", "compliance", "audit", "risk", "anomaly", "fraud",
  "role", "permission", "user", "admin", "delegate", "delegation", "master data", "rbac",
  "item", "material", "procurement", "cycle", "lifecycle",
  "erp", "sap", "oracle", "netsuite", "dynamics", "integration", "connector", "sync", "api key",
  "status", "draft", "pending", "active", "rejected", "create", "edit", "update", "delete",
  "upload", "download", "export", "report", "search", "filter", "sort",
  "document", "trade license", "tax", "gst", "vat", "bank", "ifsc", "swift",
  "currency", "category", "catalog", "line item", "quantity", "unit price",
  "delivery", "attachment", "justification",
  "login", "log in", "sign in", "password", "profile", "notification", "settings", "configure", "setup",
];

const CONVO_WORDS = new Set([
  "hi", "hello", "hey", "yo", "greetings", "thanks", "thx", "cheers", "ty",
  "help", "stuck", "lost", "confused", "start", "started", "begin", "tour", "guide", "learn", "training",
  "ok", "okay", "sure", "yes", "yep", "yeah", "no", "nope", "great", "cool", "nice", "please",
  "continue", "next", "more", "again", "back", "restart", "thank",
]);

const CONVO_PHRASES = [
  "thank you", "get started", "getting started", "new here", "first time", "walk me", "show me",
  "where do i", "how do i use", "what can you do", "who are you", "your name",
  "what is this", "what is prokraya", "about prokraya", "help me", "i am new",
];

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function isInScope(text: string): boolean {
  const raw = String(text).trim();
  if (!raw) return false;
  const t = ` ${raw.toLowerCase()} `;

  if (detectModule(raw)) return true;
  if (SCOPE_TERMS.some((term) => t.includes(term))) return true;
  if (CONVO_PHRASES.some((p) => t.includes(p))) return true;

  const tokens = new Set(
    t.replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean)
  );
  if ([...CONVO_WORDS].some((w) => tokens.has(w))) return true;

  const userWords = Array.from(tokens).filter((w) => w.length >= 4);
  const targetTerms = SCOPE_TERMS.map((term) => term.trim()).filter((term) => term.length >= 4);

  for (const w of userWords) {
    const threshold = w.length >= 7 ? 2 : 1;
    for (const term of targetTerms) {
      if (Math.abs(w.length - term.length) > threshold) continue;
      if (levenshtein(w, term) <= threshold) return true;
    }
  }

  return false;
}

export const OUT_OF_SCOPE_MESSAGE =
  "I'd love to help, but I'm your Prokraya training guide – so I can only help with learning and " +
  "using the Prokraya platform itself (suppliers, requisitions, purchase orders, invoices, contracts, " +
  "budgets, approvals, the AI agents, and so on). I'm not able to help with that one, but I'm happy to " +
  "walk you through anything on the platform. What would you like to learn?";
