import { getAIClient, getAIModelName } from "../../services/ai-client";

const VARIABLES = [
  "end_date", "start_date", "contract_amount", "contract_number",
  "owner", "owner_name", "buyer_email", "vendor_name", "version", "status",
];

const VAR_LIST = VARIABLES.map((v) => `{{ ${v} }}`).join(", ");

function wrapVariableChips(html: string): string {
  return html.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
    return `<span class="rte-var" data-var="${key}">{{ ${key} }}</span>&nbsp;`;
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ─── 1. Generate Clause from Description ─────────────────────────────────────

export async function generateClauseFromDescription(params: {
  description: string;
  contractType?: string;
  clauseType?: string;
}) {
  const client = await getAIClient();
  const model = await getAIModelName();

  const prompt = `You are a legal contracts expert. Generate a professional contract clause.

User request: "${params.description}"${params.contractType ? `\nContract type: ${params.contractType}` : ""}${params.clauseType ? `\nClause category: ${params.clauseType}` : ""}

Available variable placeholders (use {{ }} where values should be filled in): ${VAR_LIST}

Respond with ONLY a JSON object:
{
  "section_name": "Short clause title (3-6 words)",
  "section_type": "Standard|Legal|Financial|Operational|Compliance|Custom",
  "description": "One plain-text sentence summarising this clause",
  "html_content": "Full clause text as clean HTML <p> paragraphs. Use {{ variable_name }} for dynamic values.",
  "clause_ammendable": "Yes or No",
  "clause_negotiable": "Yes or No",
  "clause_mandatory": "Yes or No"
}`;

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = JSON.parse(res.choices[0].message.content || "{}");
  return { ...raw, html_content: wrapVariableChips(raw.html_content || "") };
}

// ─── 2. Extract Clauses from Document ────────────────────────────────────────

export async function extractClausesFromDocument(documentText: string) {
  const client = await getAIClient();
  const model = await getAIModelName();

  const truncated = documentText.length > 15000 ? documentText.substring(0, 15000) + "…" : documentText;
  if (truncated.trim().length < 50) throw new Error("Document text is too short or could not be read. Please ensure the PDF contains selectable text (not a scanned image).");

  const prompt = `You are a senior contracts counsel. Extract every distinct clause from this contract document and return them in structured form.

Document:
"""
${truncated}
"""

Available variable placeholders: ${VAR_LIST}

For each clause, determine:
- section_type: Standard | Legal | Financial | Operational | Compliance | Custom
- clause_mandatory: "Yes" if removing it would make the contract unenforceable or legally deficient, otherwise "No"
- clause_negotiable: "Yes" if this is typically open to negotiation between parties, otherwise "No"
- clause_ammendable: "Yes" if this clause can be amended after signing, otherwise "No"
- Replace any specific names, dates, monetary amounts, or company-specific values with {{ variable_name }} placeholders

Respond with ONLY a JSON object:
{
  "clauses": [
    {
      "section_name": "Clause title (3–6 words)",
      "section_type": "Standard|Legal|Financial|Operational|Compliance|Custom",
      "description": "One plain-text sentence summary of what this clause covers",
      "html_content": "Full clause text as clean HTML <p> tags. Use {{ variable_name }} for dynamic values.",
      "clause_mandatory": "Yes or No",
      "clause_negotiable": "Yes or No",
      "clause_ammendable": "Yes or No"
    }
  ]
}

Extract every distinct clause section you can identify. Do not merge clauses — keep each one separate and complete.`;

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = JSON.parse(res.choices[0].message.content || '{"clauses":[]}');
  return (raw.clauses || []).map((c: any) => ({
    ...c,
    html_content: wrapVariableChips(c.html_content || ""),
    clause_ammendable: c.clause_ammendable || "No",
    clause_negotiable: c.clause_negotiable || "No",
    clause_mandatory: c.clause_mandatory || "No",
  }));
}

// ─── 3. Improve / Rewrite Clause ─────────────────────────────────────────────

export async function improveClause(params: {
  name: string;
  htmlContent: string;
  instruction: string;
}) {
  const client = await getAIClient();
  const model = await getAIModelName();

  const plain = stripHtml(params.htmlContent);

  const prompt = `You are a legal contracts expert. Improve this contract clause based on the instruction.

Clause name: "${params.name}"
Current content: "${plain}"
Instruction: "${params.instruction}"

Available variable placeholders: ${VAR_LIST}

Respond with ONLY a JSON object:
{
  "html_content": "Improved clause text as clean HTML <p> paragraphs. Preserve any {{ variable_name }} placeholders."
}`;

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = JSON.parse(res.choices[0].message.content || "{}");
  return { html_content: wrapVariableChips(raw.html_content || params.htmlContent) };
}

// ─── 4. Analyze Clause Risk ───────────────────────────────────────────────────

export async function analyzeClauseRisk(params: {
  name: string;
  htmlContent: string;
}) {
  const client = await getAIClient();
  const model = await getAIModelName();

  const plain = stripHtml(params.htmlContent);

  const prompt = `You are a commercial contracts risk analyst. Analyse this clause for risks from the BUYER/PROCURING ORGANIZATION perspective.

Clause: "${params.name}"
Content: "${plain}"

Consider: one-sided obligations, ambiguous language, missing protections (liability cap, force majeure, IP rights, termination), financial exposure, compliance gaps.

Respond with ONLY a JSON object:
{
  "level": "Low|Medium|High",
  "score": (1–10 risk score, 10 = highest risk),
  "issues": ["specific issue 1", "specific issue 2"] (up to 5, empty array if none),
  "summary": "2–3 sentence plain-English risk summary"
}`;

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  return JSON.parse(res.choices[0].message.content || '{"level":"Low","score":1,"issues":[],"summary":""}');
}

// ─── 5. Auto-Suggest Variables ────────────────────────────────────────────────

export async function suggestVariablesInClause(htmlContent: string) {
  const client = await getAIClient();
  const model = await getAIModelName();

  const plain = stripHtml(htmlContent);

  const prompt = `You are a contracts template expert. Identify places in this clause where dynamic variables should replace hardcoded values.

Clause text: "${plain}"

Available variables:
${VARIABLES.map((v) => `- {{ ${v} }}`).join("\n")}

Only insert a variable where a specific value (date, name, amount, number) currently appears as text or where it's clearly expected.

Respond with ONLY a JSON object:
{
  "html_content": "Updated HTML with {{ variable_name }} inserted at the right positions. Keep all existing HTML tags."
}`;

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const raw = JSON.parse(res.choices[0].message.content || "{}");
  return { html_content: wrapVariableChips(raw.html_content || htmlContent) };
}

// ─── 6. Find Similar / Duplicate Clauses ─────────────────────────────────────

export async function findSimilarClauses(params: {
  name: string;
  plainText: string;
  existingClauses: Array<{ section_id: number; section_name: string; description: string | null }>;
}) {
  if (params.existingClauses.length === 0) return [];

  const client = await getAIClient();
  const model = await getAIModelName();

  const library = params.existingClauses
    .slice(0, 60)
    .map((c) => `ID ${c.section_id}: "${c.section_name}"${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");

  const prompt = `You are a contracts expert. Compare this clause against the library to find duplicates or conflicts.

NEW CLAUSE:
Name: "${params.name}"
Summary: "${params.plainText.substring(0, 400)}"

LIBRARY:
${library}

Find clauses that are duplicates (same subject) or conflicts (contradictory/overlapping).

Respond with ONLY a JSON object:
{
  "similar": [
    {
      "section_id": (number),
      "section_name": "name",
      "similarity": (0–100),
      "reason": "brief explanation"
    }
  ]
}

Only include clauses with similarity ≥ 60%. Return empty array if none.`;

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const raw = JSON.parse(res.choices[0].message.content || '{"similar":[]}');
  return raw.similar || [];
}

// ─── 7. AI Clause Chat ────────────────────────────────────────────────────────

export async function clauseChat(params: {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const client = await getAIClient();
  const model = await getAIModelName();

  const system = `You are an expert contract clause assistant embedded in a procurement management platform. Help users create, improve, and understand contract clauses.

When you generate a clause, include it conversationally AND append a JSON block at the end in exactly this format:
<clause_json>{"section_name":"...","section_type":"Standard|Legal|Financial|Operational|Compliance|Custom","description":"...","html_content":"...HTML..."}</clause_json>

When just answering questions or explaining, respond conversationally without the JSON block.

Available variable placeholders: ${VAR_LIST}
Clause types: Standard, Legal, Financial, Operational, Compliance, Custom`;

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      ...params.history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: params.message },
    ],
    temperature: 0.5,
  });

  const content = res.choices[0].message.content || "";
  const clauseMatch = content.match(/<clause_json>([\s\S]*?)<\/clause_json>/);
  const responseText = content.replace(/<clause_json>[\s\S]*?<\/clause_json>/g, "").trim();

  let generatedClause = null;
  if (clauseMatch) {
    try {
      const c = JSON.parse(clauseMatch[1]);
      generatedClause = {
        ...c,
        html_content: wrapVariableChips(c.html_content || ""),
        clause_ammendable: "No",
        clause_negotiable: "No",
        clause_mandatory: "No",
      };
    } catch (_) {}
  }

  return { response: responseText, generatedClause };
}

// ─── 8. Initialize Clause Library ────────────────────────────────────────────

const CONTRACT_TYPE_PROMPTS: Record<string, string> = {
  "Service Contract": "professional service agreements where one party provides services to another",
  "Supply Contract": "procurement/supply agreements for goods and materials",
  "Maintenance Contract": "equipment or facility maintenance and support agreements",
  "Rate Contract": "framework agreements with pre-agreed pricing valid over a period",
  "Consultancy Agreement": "consulting/advisory service engagements",
  "Construction Contract": "construction, engineering, and project delivery agreements",
  "NDA": "non-disclosure and confidentiality agreements",
};

export async function initializeClauseLibrary(params: {
  contractTypes: string[];
  organizationContext?: string;
}) {
  const client = await getAIClient();
  const model = await getAIModelName();

  const results = await Promise.all(
    params.contractTypes.map(async (contractType) => {
      const context = CONTRACT_TYPE_PROMPTS[contractType] || contractType;

      const prompt = `You are a senior contracts counsel with 20+ years of experience drafting commercial agreements. Generate 20–25 comprehensive, industry-standard clauses for a ${context} (${contractType}).${params.organizationContext ? `\nOrganization context: ${params.organizationContext}` : ""}

Each clause must be professional, legally precise, and ready for immediate use. Ensure broad coverage across ALL of the following categories (generate multiple clauses per category where appropriate):
- Commercial: scope of work, pricing, payment terms, invoicing, penalties, volume discounts
- Legal: definitions, representations & warranties, indemnification, limitation of liability, governing law, jurisdiction
- Operational: performance standards, KPIs/SLAs, reporting, change management, audit rights
- Risk & Compliance: force majeure, insurance, regulatory compliance, anti-bribery/corruption, data protection
- Relationship: confidentiality, IP ownership, non-solicitation, assignment, subcontracting
- Exit: termination for cause, termination for convenience, step-in rights, transition assistance, survival

Available variable placeholders: ${VAR_LIST}

Respond with ONLY a JSON object:
{
  "clauses": [
    {
      "section_name": "Clause title (3–6 words)",
      "section_type": "Standard|Legal|Financial|Operational|Compliance",
      "description": "One plain-text sentence summary",
      "html_content": "Full professional clause text as clean HTML <p> tags. Be thorough and detailed. Use {{ variable_name }} for dynamic values.",
      "clause_ammendable": "Yes or No",
      "clause_negotiable": "Yes or No",
      "clause_mandatory": "Yes or No"
    }
  ]
}

Generate exactly 20–25 distinct, non-overlapping clauses. Each clause must have substantive legal text in html_content.`;

      try {
        const res = await client.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          response_format: { type: "json_object" },
        });

        const raw = JSON.parse(res.choices[0].message.content || '{"clauses":[]}');
        return (raw.clauses || []).map((c: any) => ({
          ...c,
          html_content: wrapVariableChips(c.html_content || ""),
          _contract_type: contractType,
        }));
      } catch (err) {
        console.error(`[Clause AI] Error generating clauses for ${contractType}:`, err);
        return [];
      }
    })
  );

  return results.flat();
}
