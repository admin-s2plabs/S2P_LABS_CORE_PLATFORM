/**
 * Contract Co-Pilot — self-contained "contract agent" router.
 *
 * A conversational, AI-assisted contract builder. Kept as one standalone unit
 * (routes + AI calls together) rather than split across the contracts service.
 *
 * Routes:
 *   POST /api/contracts/copilot/chat          → conversational contract builder
 *   POST /api/contracts/copilot/edit-section  → WYSIWYG: rewrite one selected section
 *   POST /api/contracts/copilot/generate-doc  → render contract draft as HTML
 *   POST /api/contracts/copilot/save          → persist as a Draft contract
 *
 * Conventions (per CLAUDE.md):
 *   - Tenant DB:  getContextPool() (never the master pool directly)
 *   - AI:         getAIClient() + getAIModelName() (reads dbo.am_ai_model_config,
 *                 falls back to env; throws AINotConfiguredError if neither set)
 *   - Audit:      every CREATE emits an audit log (fire-and-forget)
 *
 * Mounted in server/routes.ts as `contractCopilotController`.
 */

import { Router } from "express";
import { AINotConfiguredError, getAIClient, getAIModelName } from "../../services/ai-client";
import { buildContractDocumentHtml } from "./contract-document-template";
import { extractClausesFromDocument } from "../contracts/contracts-ai.service";
import { bulkUpsertSectionOverrides, getSectionOverrides } from "./contract-section-overrides.repository";
import { getContextPool } from "../../tenant-context";
import { pool, sanitizeContractHtml } from "../_shared";
import { logAudit } from "../administration/administration.service";

const router = Router();

const getPool = () => getContextPool() ?? pool;

const stripHtml = (h: string) => (h || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// Pull a contract header + its clause rows (cm_contracts_terms), accepting either
// a numeric id or a contr_ref_no. Shared by the capability endpoints below.
async function loadContractClauses(tenantPool: any, contractId: string) {
  const { rows: hdr } = await tenantPool.query(
    `SELECT id, title, type FROM dbo.cm_header WHERE id::text = $1 OR contr_ref_no = $1`,
    [String(contractId)]
  );
  if (!hdr.length) return null;
  const c = hdr[0];
  const { rows: terms } = await tenantPool.query(
    `SELECT terms_name, row_name, term_details, description
     FROM dbo.cm_contracts_terms
     WHERE contractrefno = $1 AND (term_details IS NOT NULL OR description IS NOT NULL)
     ORDER BY order_by, id`,
    [c.id]
  );
  return { contract: c, terms };
}

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error instanceof AINotConfiguredError) {
    return res.status(503).json({ error: error.message, code: "AI_NOT_CONFIGURED" });
  }
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error("[Contract Co-Pilot] " + fallbackMessage + ":", error);
  res.status(500).json({ error: error?.message || fallbackMessage });
}

// Sanitize a `_content_overrides` map before it's persisted (used by both the
// create and update save endpoints).
function sanitizeOverrides(
  overrides: Record<string, { html: string; base_fingerprint: string }>
): Record<string, { html: string; base_fingerprint: string }> {
  return Object.fromEntries(
    Object.entries(overrides).map(([key, ov]) => [key, { html: sanitizeContractHtml(ov.html || ""), base_fingerprint: ov.base_fingerprint || "" }])
  );
}

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string) {
  const user = (req as any).user;
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module: "CONTRACTS",
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

// ── Contract Co-Pilot Chat ─────────────────────────────────────────────────────
// Drives the guided conversation. Returns a JSON envelope:
//   { message, contract_update, next_question, is_complete }
router.post("/api/contracts/copilot/chat", async (req, res) => {
  try {
    const { messages = [], context } = req.body;
    const client = await getAIClient();
    const model = await getAIModelName();

    const systemPrompt = `You are a Contract Co-Pilot AI for a procurement platform. You help users create professional contracts by asking guided questions and building the contract document.

Your role:
1. Ask clear, concise questions to gather contract information
2. Build a structured contract JSON as answers come in
3. Generate professional contract document content
4. Suggest appropriate clauses based on contract type (goods/services)

Current contract context: ${JSON.stringify(context || {})}

When the user provides information, update the contract JSON structure with these fields:
- contract_type: "goods" | "services"
- supplier_id, supplier_name
- start_date (ISO format)
- scope_of_work: array of items
- delivery_milestones: array
- inspection_criteria: string
- payment_terms: array
- special_clauses: array (confidentiality, governing_law, etc.)
- failure_obligations: string

Respond with JSON format:
{
  "message": "Your conversational response to the user",
  "contract_update": { partial contract fields to update, or null if no update },
  "next_question": "Next question to ask (or null if done)",
  "is_complete": false
}

Keep messages concise and friendly. For complex fields, suggest options when possible.`;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { message: content, contract_update: null };
    }
    res.json(parsed);
  } catch (error) {
    handleError(res, error, "Failed to process co-pilot message");
  }
});

// ── Contracting Agent advisory chat ────────────────────────────────────────────
// Free-form contract assistant (clause help, risk flags, redlines, renewals).
// Distinct from /copilot/chat: no contract-builder JSON envelope — plain reply.
router.post("/api/contracts/copilot/agent-chat", async (req, res) => {
  try {
    const { messages = [] } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages is required" });
    }
    const client = await getAIClient();
    const model = await getAIModelName();

    const systemPrompt = `You are the Contracting Agent, an AI assistant inside a procurement platform's contract-management module. You help procurement and legal users with:
- Extracting and explaining key clauses and contract terms
- Flagging high-risk provisions (indemnification, limitation of liability, termination, auto-renewal, exclusivity, IP ownership, penalties)
- Advising on renewal timelines, notice periods and obligations
- Suggesting redlines and negotiation language
- Comparing terms (payment, delivery, SLAs, warranties) across agreements

Guidelines:
- Answer clearly and concisely in plain text suitable for a chat bubble (no markdown tables).
- When asked to draft or redline, provide the suggested clause language directly.
- If a request needs specific contract data you don't have, ask the user to paste the relevant clause or details.
- Never invent contract numbers, supplier names, dates, or monetary figures. If unknown, say so.`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m: any) => ({ role: m.role, content: String(m.content ?? "") })),
      ],
      temperature: 0.5,
    });

    const message = response.choices[0]?.message?.content?.trim()
      || "I couldn't generate a response. Please rephrase and try again.";
    res.json({ message });
  } catch (error) {
    handleError(res, error, "Failed to process contracting-agent message");
  }
});

// ── WYSIWYG scoped edit: rewrite ONE selected section/span of the live preview ──
// Distinct from /copilot/chat: HTML-in/HTML-out on a single section instead of a
// contract-wide JSON patch, so toolbar-applied formatting on untouched parts of the
// section HTML is preserved verbatim.
router.post("/api/contracts/copilot/edit-section", async (req, res) => {
  try {
    const { instruction, target, currentHtml, context } = req.body;
    if (!instruction || typeof instruction !== "string") return res.status(400).json({ error: "instruction is required" });
    if (!target?.sectionKey) return res.status(400).json({ error: "target.sectionKey is required" });
    const html = String(currentHtml || "").slice(0, 20000);

    const client = await getAIClient();
    const model = await getAIModelName();

    const systemPrompt = `You are a contract-drafting assistant editing ONE section of a contract document.

Section: "${target.label || target.sectionKey}"
Current section HTML:
"""
${html}
"""
${target.selectedText ? `The user selected this exact passage within the section: "${target.selectedText}". Modify ONLY that passage; reproduce every other character of the HTML unchanged.` : "Modify the section as instructed; preserve any parts not relevant to the instruction unchanged."}

Contract context: ${JSON.stringify(context || {})}

Rules:
- Return the COMPLETE edited section HTML, not a diff or just the changed passage.
- Preserve all existing tags, inline style="" attributes, tables, and {{variable}} placeholders unless the instruction explicitly asks to change them.
- Do not add <script> or <style> tags, or any commentary inside the HTML.
- Keep legal drafting tone and formatting conventions unless told otherwise.

Instruction: "${instruction}"

Respond with ONLY a JSON object: { "html": "the edited section HTML", "message": "one-sentence summary of the change for the chat" }`;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: systemPrompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    let parsed: any = {};
    try { parsed = JSON.parse(response.choices[0]?.message?.content || "{}"); } catch { /* keep {} */ }
    const editedHtml = typeof parsed.html === "string" && parsed.html.trim() ? parsed.html : html;
    res.json({
      html: sanitizeContractHtml(editedHtml),
      message: typeof parsed.message === "string" && parsed.message.trim() ? parsed.message : "Updated.",
    });
  } catch (error) {
    handleError(res, error, "Failed to edit contract section");
  }
});

// ── Capability: Clause Extraction ──────────────────────────────────────────────
// Assemble a saved contract's clause text and re-extract it into structured,
// classified clauses (reuses the contracts module's extraction service).
router.post("/api/contracts/copilot/extract-clauses", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { contractId } = req.body;
    if (!contractId) return res.status(400).json({ error: "contractId is required" });

    const loaded = await loadContractClauses(tenantPool, contractId);
    if (!loaded) return res.status(404).json({ error: "Contract not found" });
    const { contract, terms } = loaded;

    const documentText = terms
      .map((t: any) => `[${t.terms_name || t.row_name || "Clause"}]\n${stripHtml(t.term_details || t.description || "")}`)
      .join("\n\n");

    if (documentText.trim().length < 50) {
      return res.json({ clauses: [], contractTitle: contract.title, note: "This contract has no clause text to extract." });
    }

    const clauses = await extractClausesFromDocument(documentText);
    res.json({ clauses, contractTitle: contract.title });
  } catch (error) { handleError(res, error, "Failed to extract clauses"); }
});

// ── Capability: Redline Suggestions (auto top-risk) ────────────────────────────
// One LLM pass that flags the riskiest clauses for the buyer and proposes a
// concrete before/after redline for each.
router.post("/api/contracts/copilot/redline", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { contractId } = req.body;
    if (!contractId) return res.status(400).json({ error: "contractId is required" });

    const loaded = await loadContractClauses(tenantPool, contractId);
    if (!loaded) return res.status(404).json({ error: "Contract not found" });
    const { contract, terms } = loaded;

    const clauseList = terms
      .map((t: any, i: number) => `${i + 1}. [${t.terms_name || t.row_name || "Clause"}] ${stripHtml(t.term_details || t.description || "")}`)
      .join("\n\n")
      .substring(0, 12000);

    if (!clauseList.trim()) {
      return res.json({ suggestions: [], contractTitle: contract.title, note: "This contract has no clauses to redline." });
    }

    const client = await getAIClient();
    const model = await getAIModelName();
    const prompt = `You are a commercial contracts negotiator acting for the BUYER / procuring organization. Review the clauses from "${contract.title}"${contract.type ? ` (${contract.type})` : ""} and identify the 3-5 HIGHEST-RISK clauses for the buyer, then propose a concrete redline for each.

CLAUSES:
"""
${clauseList}
"""

Respond with ONLY a JSON object:
{
  "suggestions": [
    {
      "clause_name": "exact clause title from the list",
      "risk_level": "High|Medium",
      "issue": "one sentence on why this is risky to the buyer",
      "before": "the current problematic language (short plain-text quote or paraphrase)",
      "after": "your suggested redlined language (plain text)",
      "rationale": "one sentence on what the redline achieves"
    }
  ]
}

Order by risk, highest first. Only include clauses that genuinely warrant a redline (max 5). Return an empty array if none do. Do not invent clauses that are not in the list.`;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    let parsed: any = {};
    try { parsed = JSON.parse(response.choices[0]?.message?.content || "{}"); } catch { /* keep {} */ }
    res.json({ suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [], contractTitle: contract.title });
  } catch (error) { handleError(res, error, "Failed to generate redline suggestions"); }
});

// ── Capability: Renewal action notes ───────────────────────────────────────────
// Given the caller's already-visibility-filtered list of expiring contracts,
// return one short imperative action note per contract id.
router.post("/api/contracts/copilot/renewal-notes", async (req, res) => {
  try {
    const { contracts = [] } = req.body;
    if (!Array.isArray(contracts) || contracts.length === 0) return res.json({ notes: {} });

    const client = await getAIClient();
    const model = await getAIModelName();
    const list = contracts
      .slice(0, 40)
      .map((c: any) => `id ${c.id}: "${c.title}" — ${c.days_left} days left, status ${c.status || "-"}`)
      .join("\n");

    const prompt = `You are a contract renewal advisor for a procurement team. For each contract below, write ONE short imperative action note (max 12 words) on what the buyer should do about its upcoming expiry/renewal, taking the days-left into account (the fewer days, the more urgent).

CONTRACTS:
${list}

Respond with ONLY a JSON object mapping each id to its note, using the exact ids above:
{ "notes": { "<id>": "action note", ... } }`;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    let parsed: any = {};
    try { parsed = JSON.parse(response.choices[0]?.message?.content || "{}"); } catch { /* keep {} */ }
    res.json({ notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {} });
  } catch (error) { handleError(res, error, "Failed to generate renewal notes"); }
});

// ── Generate contract document from co-pilot data ──────────────────────────────
// Deterministic render that mirrors the official iText PDF generator
// (Title page → Glossary → Table of Contents → Sections → Signatory). No AI.
router.post("/api/contracts/copilot/generate-doc", async (req, res) => {
  try {
    const { contractData, interactive } = req.body;
    res.json({ html: buildContractDocumentHtml(contractData || {}, { interactive: !!interactive }) });
  } catch (error) {
    handleError(res, error, "Failed to generate contract document");
  }
});

// client-style row id (matches the frontend genId())
const rid = () => Math.random().toString(36).slice(2);

// ── Source picker: list Approved Purchase Requisitions ─────────────────────────
router.get("/api/contracts/copilot/source/prs", async (req, res) => {
  try {
    const tenantPool = getPool();
    const search = ((req.query.search as string) || "").trim();
    const params: any[] = [];
    let where = "WHERE pr_status = 'Approved'";
    if (search) { params.push(`%${search}%`); where += ` AND (pr_number ILIKE $1 OR pr_description ILIKE $1)`; }
    const { rows } = await tenantPool.query(
      `SELECT pr_number, pr_description, currency, pr_amount, department_name
       FROM dbo.supp_pr_header_dtls ${where}
       ORDER BY pr_created_date DESC NULLS LAST, pr_number DESC LIMIT 30`,
      params
    );
    res.json({ data: rows.map((r: any) => ({
      pr_number: r.pr_number,
      title: r.pr_description || r.pr_number,
      currency: r.currency || "",
      amount: r.pr_amount,
      department: r.department_name || "",
    })) });
  } catch (error) { handleError(res, error, "Failed to list approved PRs"); }
});

// ── Source picker: list Awarded Bids (one row per awarded supplier) ────────────
router.get("/api/contracts/copilot/source/awarded-bids", async (req, res) => {
  try {
    const tenantPool = getPool();
    const search = ((req.query.search as string) || "").trim();
    const params: any[] = [];
    let where = "WHERE a.status IN ('Approved','Awarded')";
    if (search) { params.push(`%${search}%`); where += ` AND (a.bidtitle ILIKE $1 OR a.supplier_name ILIKE $1 OR CAST(a.bidrefno AS TEXT) ILIKE $1)`; }
    const { rows } = await tenantPool.query(
      `SELECT a.id AS award_id, a.bidrefno, a.bidtitle, a.supplier_id, a.supplier_name,
              a.grosstotal, a.bidtotal, a.award_date
       FROM dbo.supp_bid_award_dtls a ${where}
       ORDER BY a.award_date DESC NULLS LAST, a.id DESC LIMIT 30`,
      params
    );
    res.json({ data: rows.map((r: any) => ({
      award_id: r.award_id,
      bid_ref_no: r.bidrefno,
      title: r.bidtitle || `Bid ${r.bidrefno}`,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name || "",
      amount: r.grosstotal ?? r.bidtotal,
    })) });
  } catch (error) { handleError(res, error, "Failed to list awarded bids"); }
});

// ── Prefill draft from an Approved PR (deterministic) ──────────────────────────
router.post("/api/contracts/copilot/from-pr", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { prNumber } = req.body;
    if (!prNumber) return res.status(400).json({ error: "prNumber is required" });

    const { rows: hdr } = await tenantPool.query(`SELECT * FROM dbo.supp_pr_header_dtls WHERE pr_number = $1`, [prNumber]);
    if (!hdr.length) return res.status(404).json({ error: "PR not found" });
    const h = hdr[0];
    const { rows: lines } = await tenantPool.query(
      `SELECT line_num, item_description, qty, uom, unit_cost, amount, product_category_name
       FROM dbo.supp_pr_line_dtls WHERE pr_number = $1 ORDER BY line_num`,
      [prNumber]
    );

    const draft = {
      title: h.pr_description || `Contract for ${prNumber}`,
      currency: h.currency || "USD",
      contract_amount: h.pr_amount != null ? String(h.pr_amount) : "",
      department_name: h.department_name || "",
      scope_of_work: lines.map((l: any) => ({
        id: rid(),
        item_name: l.item_description || "",
        description: l.item_description || "",
        quantity: l.qty != null ? String(l.qty) : "1",
        unit_cost: l.unit_cost != null ? String(l.unit_cost) : "",
        uom: l.uom || "",
      })),
      _source: "pr",
      _source_ref: String(prNumber),
    };
    res.json({ draft });
  } catch (error) { handleError(res, error, "Failed to import PR"); }
});

// ── Prefill draft from an Awarded Bid (deterministic; by award id) ─────────────
router.post("/api/contracts/copilot/from-bid", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { awardId } = req.body;
    if (!awardId) return res.status(400).json({ error: "awardId is required" });

    const { rows: aw } = await tenantPool.query(`SELECT * FROM dbo.supp_bid_award_dtls WHERE id = $1`, [awardId]);
    if (!aw.length) return res.status(404).json({ error: "Award not found" });
    const a = aw[0];

    const { rows: lines } = await tenantPool.query(
      `SELECT description, uom, quantity, awarded_quantity, rate, bidprice, currency
       FROM dbo.supp_bid_award_line_dtls WHERE bid_award_id = $1 ORDER BY id`,
      [awardId]
    );
    const { rows: clauseRows } = await tenantPool.query(
      `SELECT type, class_desc FROM dbo.supp_bid_clauses WHERE bidrefno = $1 ORDER BY id`,
      [a.bidrefno]
    );

    // Supplier profile: award row is denormalized; fill gaps from the supplier record.
    let email = "", phone = a.supplier_contact_no || "", addr = a.supplier_site || "";
    if (a.supplier_id) {
      const { rows: s } = await tenantPool.query(
        `SELECT email_id, phone, city, country FROM dbo.supp_basic_org_dtls WHERE id = $1`,
        [a.supplier_id]
      );
      if (s.length) {
        email = s[0].email_id || "";
        if (!phone) phone = s[0].phone || "";
        if (!addr) addr = [s[0].city, s[0].country].filter(Boolean).join(", ");
      }
    }

    const currency = (lines.find((l: any) => l.currency)?.currency) || "USD";
    const bt = String(a.bidtype || "");
    const contract_type = /serv/i.test(bt) ? "services" : /good|product/i.test(bt) ? "goods" : "";

    const draft = {
      title: a.bidtitle || `Contract for Bid ${a.bidrefno}`,
      contract_type,
      currency,
      contract_amount: a.grosstotal != null ? String(a.grosstotal) : (a.bidtotal != null ? String(a.bidtotal) : ""),
      supplier_id: a.supplier_id,
      supplier_name: a.supplier_name || "",
      supplier_contact: a.supplier_contact || "",
      supplier_designation: "",
      supplier_email: email,
      supplier_phone: phone,
      supplier_address: addr,
      scope_of_work: lines.map((l: any) => ({
        id: rid(),
        item_name: l.description || "",
        description: l.description || "",
        quantity: String(l.awarded_quantity ?? l.quantity ?? "1"),
        unit_cost: String(l.rate ?? l.bidprice ?? ""),
        uom: l.uom || "",
      })),
      special_clauses: clauseRows.map((c: any) => ({ id: rid(), type: c.type || "Clause", content: c.class_desc || "" })),
      _source: "bid",
      _source_ref: String(a.bidrefno),
      _bid_ref_no: a.bidrefno,
    };
    res.json({ draft });
  } catch (error) { handleError(res, error, "Failed to import awarded bid"); }
});

// ── Load an existing saved contract into the Co-Pilot for live editing ─────────
// Inverse of /copilot/save: reads the normalized rows back into the same
// contractData shape the draft builder uses, so the WYSIWYG preview/toolbar/
// edit-section flow works unmodified against a real, already-saved contract.
// `_loaded_clauses` carries the raw cm_contracts_terms rows (id + text) rather
// than being split into special_clauses/terms/inspection/failure_obligations —
// buildContractDocumentHtml renders these directly, keyed by their real row id,
// so an edit can be written straight back with a plain UPDATE by id.
router.post("/api/contracts/copilot/from-contract", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { contractId } = req.body;
    if (!contractId) return res.status(400).json({ error: "contractId is required" });

    const { rows: hdr } = await tenantPool.query(
      `SELECT id, contr_ref_no, title, description, type, start_date, end_date, currency,
              contract_amount, is_delivery_sched_req, is_inspection_sched_req
       FROM dbo.cm_header WHERE id::text = $1 OR contr_ref_no = $1`,
      [String(contractId)]
    );
    if (!hdr.length) return res.status(404).json({ error: "Contract not found" });
    const h = hdr[0];

    const { rows: supp } = await tenantPool.query(
      `SELECT supplier_id, supplier_name, supplier_contact, supplier_contact_no, supplier_contact_email
       FROM dbo.cm_supplier_dtls WHERE contractrefno = $1 LIMIT 1`,
      [h.id]
    );
    const vendor = supp[0] || null;

    const { rows: sow } = await tenantPool.query(
      `SELECT id, description, item_name, quantity, uom, unit_cost, total_cost, deliverydate, type
       FROM dbo.cm_sow WHERE parent_id = $1 AND (del_status IS NULL OR del_status != 'Y') ORDER BY id`,
      [h.id]
    );
    const { rows: delivery } = await tenantPool.query(
      `SELECT id, deliverable_name, details, schedule_type, schedule_date, pcnt_milestone, amt_milestone
       FROM dbo.cm_delivery_schedules WHERE parent_id = $1 ORDER BY id`,
      [h.id]
    );
    const { rows: payment } = await tenantPool.query(
      `SELECT id, name, payment_type, period, pcnt_milestone, amt_milestone
       FROM dbo.cm_payment_terms WHERE parent_id = $1 ORDER BY id`,
      [h.id]
    );
    const { rows: terms } = await tenantPool.query(
      `SELECT id, COALESCE(NULLIF(TRIM(row_name),''), NULLIF(TRIM(terms_name),''), '') AS terms_name, term_details
       FROM dbo.cm_contracts_terms
       WHERE contractrefno = $1 ORDER BY COALESCE(order_by, 9999), id`,
      [h.id]
    );
    const overrides = await getSectionOverrides(h.id, tenantPool);

    const draft = {
      title: h.title || "",
      description: h.description || "",
      contract_type: h.type || "",
      start_date: h.start_date, end_date: h.end_date,
      currency: h.currency || "USD",
      contract_amount: h.contract_amount != null ? String(h.contract_amount) : "",
      include_delivery: h.is_delivery_sched_req === "Y",
      include_inspection: h.is_inspection_sched_req === "Y",
      supplier_id: vendor?.supplier_id ?? null,
      supplier_name: vendor?.supplier_name || "",
      supplier_contact: vendor?.supplier_contact || "",
      supplier_phone: vendor?.supplier_contact_no || "",
      supplier_email: vendor?.supplier_contact_email || "",
      scope_of_work: sow.map((s: any) => ({
        id: rid(), item_name: s.item_name || s.description || "", description: s.description || "",
        quantity: s.quantity != null ? String(s.quantity) : "1", uom: s.uom || "",
        unit_cost: s.unit_cost != null ? String(s.unit_cost) : "", deliverydate: s.deliverydate,
      })),
      delivery_milestones: delivery.map((m: any) => ({
        id: rid(), name: m.deliverable_name || "", details: m.details || "", schedule_type: m.schedule_type || "milestone",
        schedule_date: m.schedule_date, pcnt_milestone: m.pcnt_milestone, amt_milestone: m.amt_milestone,
      })),
      payment_terms: payment.map((p: any) => ({
        id: rid(), name: p.name || "", payment_type: p.payment_type || "milestone", period: p.period,
        pcnt_milestone: p.pcnt_milestone, amt_milestone: p.amt_milestone,
      })),
      _loaded_clauses: terms.map((t: any) => ({ id: String(t.id), terms_name: t.terms_name || "Clause", term_details: t.term_details || "" })),
      _content_overrides: overrides,
      _bid_ref_no: null,
      _source_ref: String(h.id),
      contr_ref_no: h.contr_ref_no,
    };
    res.json({ id: h.id, draft });
  } catch (error) { handleError(res, error, "Failed to load contract"); }
});

// ── Persist Co-Pilot edits back to an already-saved contract ───────────────────
// Update variant of /copilot/save: writes clause text (by real cm_contracts_terms
// row id) and Tier-2 section overrides for an existing contract, instead of
// inserting a brand-new one. Scoped to document text/formatting edits only — it
// does not touch header/supplier/SOW/payment/delivery fields.
router.put("/api/contracts/copilot/:id/save", async (req, res) => {
  try {
    const tenantPool = getPool();
    const { id } = req.params;
    const { contractData } = req.body;
    const user = (req as any).user;
    const updatedBy = user?.email || user?.name || "system";

    const { rows: hdr } = await tenantPool.query(`SELECT id FROM dbo.cm_header WHERE id = $1`, [id]);
    if (!hdr.length) return res.status(404).json({ error: "Contract not found" });

    const loadedClauses: Array<{ id: string; term_details: string }> = contractData?._loaded_clauses || [];
    let skippedClauses = 0;
    for (const clause of loadedClauses) {
      const result = await tenantPool.query(
        `UPDATE dbo.cm_contracts_terms SET term_details = $1 WHERE id = $2 AND contractrefno = $3`,
        [sanitizeContractHtml(clause.term_details || ""), clause.id, id]
      );
      if (result.rowCount === 0) skippedClauses++;
    }

    if (contractData?._content_overrides) {
      await bulkUpsertSectionOverrides(Number(id), sanitizeOverrides(contractData._content_overrides), updatedBy, tenantPool);
    }

    res.json({ id: Number(id), status: "updated", skippedClauses });

    audit(req, String(id), "UPDATE", "Contract document edited via AI Co-Pilot");
  } catch (error) { handleError(res, error, "Failed to update contract"); }
});

// ── Save co-pilot generated contract as a Draft ────────────────────────────────
router.post("/api/contracts/copilot/save", async (req, res) => {
  try {
    const tenantPool = getPool();
    const user = (req as any).user;
    const { contractData, supplierId, supplierName, reviewerIds } = req.body;

    const {
      contract_type, start_date, end_date, title, currency,
      scope_of_work = [], delivery_milestones = [],
      payment_terms = [], special_clauses = [], terms = [],
    } = contractData || {};

    if (!title?.trim()) return res.status(400).json({ error: "Contract title is required" });

    const createdBy = user?.email || user?.name || "system";
    const newId = Math.floor(100000000 + Math.random() * 899999999);

    // Insert contract header
    await tenantPool.query(`
      INSERT INTO dbo.cm_header
        (id, title, description, owner, owner_name, requestor_name, type,
         start_date, end_date, currency, contract_amount,
         is_delivery_sched_req, is_inspection_sched_req,
         bid_ref_no, project_ref_no,
         status, template_name, creation_date, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Draft','AI Co-Pilot',NOW(),$16)
    `, [
      newId, title, contractData.description || null,
      createdBy, user?.name || createdBy, user?.name || createdBy,
      contract_type || "services",
      start_date || null, end_date || null,
      currency || "USD",
      contractData.contract_amount ? parseFloat(contractData.contract_amount) : null,
      contractData.include_delivery ? "Y" : "N",
      contractData.include_inspection ? "Y" : "N",
      // Source traceability: stamp the originating bid / PR
      contractData._bid_ref_no || (contractData._source === "bid" ? contractData._source_ref : null) || null,
      contractData._source === "pr" ? (contractData._source_ref || null) : null,
      createdBy,
    ]);

    // Add supplier (with imported profile details when available)
    if (supplierId) {
      const suppNewId = Math.floor(100000000 + Math.random() * 899999999);
      await tenantPool.query(
        `INSERT INTO dbo.cm_supplier_dtls
           (id, contractrefno, supplier_id, supplier_name, supplier_contact, supplier_contact_no, supplier_contact_email, created_by, creation_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [suppNewId, newId, supplierId, supplierName || "",
         contractData.supplier_contact || null, contractData.supplier_phone || null, contractData.supplier_email || null,
         createdBy]
      );
    }

    // Add scope of work items
    for (let i = 0; i < scope_of_work.length; i++) {
      const sow = scope_of_work[i];
      const sowId = Math.floor(Date.now() / 1000) + i + Math.floor(Math.random() * 9999);
      const qty = sow.quantity != null && sow.quantity !== "" ? parseFloat(sow.quantity) : null;
      const unitCost = sow.unit_cost != null && sow.unit_cost !== "" ? parseFloat(sow.unit_cost) : null;
      const totalCost = sow.total_cost != null && sow.total_cost !== ""
        ? parseFloat(sow.total_cost)
        : (qty != null && unitCost != null ? qty * unitCost : null);
      const lineType = sow.linetype || sow.line_type || sow.type || "Goods";
      const desc = sow.description || sow.item_name || sow.name || "";
      const itemName = sow.item_name || sow.itemName || sow.name || desc || null;

      await tenantPool.query(
        `INSERT INTO dbo.cm_sow
           (id, parent_id, description, quantity, uom, unit_cost, total_cost, start_date, deliverydate, specifications, type, item_id, item_name, category_code, category_name, del_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'N')`,
        [
          sowId,
          newId,
          desc,
          qty,
          sow.uom || null,
          unitCost,
          totalCost,
          sow.start_date || sow.startDate || null,
          sow.deliverydate || sow.delivery_date || sow.deliveryDate || null,
          sow.specifications || sow.specs || null,
          lineType,
          sow.item_id || sow.itemId || null,
          itemName,
          sow.category_code || sow.categoryCode || null,
          sow.category_name || sow.categoryName || null,
        ]
      );
    }

    // Add delivery milestones
    for (let i = 0; i < delivery_milestones.length; i++) {
      const m = delivery_milestones[i];
      const mId = Math.floor(Date.now() / 1000) + i + 50 + Math.floor(Math.random() * 9999);
      await tenantPool.query(
        `INSERT INTO dbo.cm_delivery_schedules
           (id, parent_id, deliverable_name, details, schedule_type, schedule_date, pcnt_milestone, amt_milestone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [mId, newId, m.name || m.deliverable_name || "", m.details || "", m.schedule_type || "milestone",
         m.schedule_date || null,
         m.pcnt_milestone ? parseFloat(m.pcnt_milestone) : null,
         m.amt_milestone ? parseFloat(m.amt_milestone) : null]
      );
    }

    // Add payment terms
    for (let i = 0; i < payment_terms.length; i++) {
      const pt = payment_terms[i];
      const ptId = Math.floor(Date.now() / 1000) + i + 100 + Math.floor(Math.random() * 9999);
      await tenantPool.query(
        `INSERT INTO dbo.cm_payment_terms (id, parent_id, name, payment_type, period, pcnt_milestone, amt_milestone)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ptId, newId, pt.name || pt.description || "", pt.payment_type || "milestone", pt.period || null,
         pt.pcnt_milestone ? parseFloat(pt.pcnt_milestone) : null,
         pt.amt_milestone ? parseFloat(pt.amt_milestone) : null]
      );
    }

    // Add special clauses as contract terms. Content may carry WYSIWYG toolbar/AI-edit
    // HTML (bold/color/font spans) — sanitize before it lands in the DB.
    for (let i = 0; i < special_clauses.length; i++) {
      const cl = special_clauses[i];
      const clId = Math.floor(Date.now() / 1000) + i + 200 + Math.floor(Math.random() * 9999);
      await tenantPool.query(
        `INSERT INTO dbo.cm_contracts_terms
           (id, contractrefno, terms_name, term_details, order_by, created_by, creation_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),'Active')`,
        [clId, newId, cl.type || cl.name || "Special Clause", sanitizeContractHtml(cl.content || cl.text || ""), i + 2, createdBy]
      );
    }

    // Add free-form terms as contract terms (same shape as special clauses; these
    // come from the AI builder's `terms` field and were previously dropped on save).
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      if (!t.name && !t.content) continue;
      const tId = Math.floor(Date.now() / 1000) + i + 400 + Math.floor(Math.random() * 9999);
      await tenantPool.query(
        `INSERT INTO dbo.cm_contracts_terms
           (id, contractrefno, terms_name, term_details, order_by, created_by, creation_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),'Active')`,
        [tId, newId, t.name || "Term", sanitizeContractHtml(t.content || ""), special_clauses.length + i + 2, createdBy]
      );
    }

    // Add inspection criteria as a contract term if provided
    if (contractData.inspection_criteria && String(contractData.inspection_criteria).trim()) {
      const inspId = Math.floor(Date.now() / 1000) + 300 + Math.floor(Math.random() * 9999);
      await tenantPool.query(
        `INSERT INTO dbo.cm_contracts_terms
           (id, contractrefno, terms_name, term_details, order_by, created_by, creation_date, status)
         VALUES ($1,$2,'Inspection & Acceptance Criteria',$3,50,$4,NOW(),'Active')`,
        [inspId, newId, sanitizeContractHtml(String(contractData.inspection_criteria).trim()), createdBy]
      );
    }

    // Add vendor failure obligations as a contract term if provided (previously dropped on save)
    if (contractData.failure_obligations && String(contractData.failure_obligations).trim()) {
      const failId = Math.floor(Date.now() / 1000) + 600 + Math.floor(Math.random() * 9999);
      await tenantPool.query(
        `INSERT INTO dbo.cm_contracts_terms
           (id, contractrefno, terms_name, term_details, order_by, created_by, creation_date, status)
         VALUES ($1,$2,'Vendor Failure Obligations',$3,60,$4,NOW(),'Active')`,
        [failId, newId, sanitizeContractHtml(String(contractData.failure_obligations).trim()), createdBy]
      );
    }

    // Add review team members (cm_approvers, teamtype 'Review Team')
    if (Array.isArray(reviewerIds) && reviewerIds.length > 0) {
      const uniqueReviewerIds = Array.from(new Set(reviewerIds.map((id: any) => String(id ?? "").trim()).filter(Boolean)));
      for (let i = 0; i < uniqueReviewerIds.length; i++) {
        const reviewerId = uniqueReviewerIds[i];
        const apprId = Math.floor(100000000 + Math.random() * 899999999);
        await tenantPool.query(
          `INSERT INTO dbo.cm_approvers (id, contractrefno, user_id, teamtype, level)
           VALUES ($1,$2,$3,'Review Team',$4)`,
          [apprId, newId, reviewerId, i + 1]
        );
      }
    }

    // Persist Tier-2 WYSIWYG overrides (title/glossary/intro/SOW/payment/delivery
    // styling) so they survive save — resolved back the same way on this Co-Pilot's
    // own /copilot/from-contract + live-preview path (see contract-document-template.ts).
    if (contractData._content_overrides) {
      await bulkUpsertSectionOverrides(newId, sanitizeOverrides(contractData._content_overrides), createdBy, tenantPool);
    }

    res.json({ id: newId, status: "Draft" });

    audit(req, String(newId), "CREATE", `Contract created via AI Co-Pilot: ${title}`);
  } catch (error) {
    handleError(res, error, "Failed to save co-pilot contract");
  }
});

export { router as contractCopilotController };
export default router;
