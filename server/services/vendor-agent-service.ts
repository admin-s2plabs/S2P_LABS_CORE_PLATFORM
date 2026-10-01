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
import { applyAllMentionsToPrompt, normalizeSupplierMentions } from "./agent-mention-utils";
import { storage } from "../storage";
import { pool as defaultPool } from "../db";
import { getContextPool } from "../tenant-context";
import * as vendorService from "../modules/vendors/vendors.service";
import * as vendorRepo from "../modules/vendors/vendors.repository";
import * as spendService from "../modules/spend-analysis/spend-analysis.service";
import {
  formatOnboardValidationPrompt,
  resolveOnboardLocationFields,
  validateOnboardVendorData,
  isPlaceholderFieldValue,
  validateOnboardEmail,
} from "./vendor-onboard-validation";
import { isLikelyPostalCode } from "./vendor-registration-extraction-validators";
import {
  formatDocumentDisplayLabel,
  getDocumentTypeLabel,
} from "@shared/document-type-labels";

/** Vendor selection has been intentionally disabled — do not re-enable without product approval. */
const VENDOR_SELECTION_DISABLED = true;
const VENDOR_SELECTION_UNAVAILABLE_MSG =
  "Please specify the vendor by company name, email, or supplier ID in your message.";

type SupplierAiRankRow = { rank: number; overallScore: number };

async function fetchSupplierAiRanksByIds(
  supplierIds: number[],
): Promise<{ enabled: boolean; byId: Map<string, SupplierAiRankRow> }> {
  const byId = new Map<string, SupplierAiRankRow>();
  const unique = Array.from(new Set(supplierIds.filter((n) => Number.isFinite(n))));
  const dbPool = getContextPool() ?? defaultPool;
  let enabled = false;
  try {
    const settingsRes = await dbPool.query(
      `SELECT is_enabled FROM dbo.am_ai_service_settings WHERE feature_key = 'AI_SUPPLIER_RANK'`,
    );
    enabled = settingsRes.rows[0]?.is_enabled ?? false;
    if (!enabled || unique.length === 0) return { enabled, byId };

    const res = await dbPool.query(
      `SELECT supplier_id, rank, overall_supplier_score
       FROM dbo.supp_calculation
       WHERE supplier_id = ANY($1::text[])`,
      [unique.map(String)],
    );
    for (const row of res.rows) {
      if (row.rank == null) continue;
      byId.set(String(row.supplier_id), {
        rank: Number(row.rank),
        overallScore: row.overall_supplier_score != null ? Number(row.overall_supplier_score) : 0,
      });
    }
  } catch (err) {
    console.warn("[VendorAgent] fetchSupplierAiRanksByIds failed:", err);
  }
  return { enabled, byId };
}

function formatAiSupplierRankLines(
  aiRanks: { enabled: boolean; byId: Map<string, SupplierAiRankRow> },
  supplierId: string | number,
): string {
  if (!aiRanks.enabled) return "";
  const row = aiRanks.byId.get(String(supplierId));
  if (row) {
    const raw = Number(row.overallScore);
    const pct = Number.isFinite(raw)
      ? Math.round(Math.max(0, Math.min(1, raw)) * 100)
      : null;
    let lines = `**AI Supplier Rank (supplier performance):** #${row.rank}\n`;
    lines +=
      pct != null
        ? `**AI Supplier Performance Score:** ${pct}/100\n`
        : `**AI Supplier Performance Score:** N/A\n`;
    return lines;
  }
  return `**AI Vendor Rank (supplier performance):** N/A\n**AI Supplier Performance Score:** N/A\n`;
}

const VENDOR_DOC_SEARCH_MANDATORY = [
  "pan_card",
  "gst_certificate",
  "cancelled_cheque",
  "company_registration",
] as const;

/** Map DBO-stored doc_type (vatcertificate, tradelicense, BANK_DOCUMENT, …) to canonical search types. */
function canonicalDocType(docType?: string | null, docName?: string | null): string | null {
  const typeRaw = String(docType || "").trim();
  const typeLower = typeRaw.toLowerCase();
  const typeCompact = typeLower.replace(/[\s_-]+/g, "");
  const nameCompact = String(docName || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  const blob = typeCompact + nameCompact;

  const directMap: Record<string, string> = {
    pancard: "pan_card",
    pan_card: "pan_card",
    gstcertificate: "gst_certificate",
    gst_certificate: "gst_certificate",
    vatcertificate: "gst_certificate",
    vat_certificate: "gst_certificate",
    taxcertificate: "gst_certificate",
    cancelledcheque: "cancelled_cheque",
    canceledcheque: "cancelled_cheque",
    bankletter: "bank_letter",
    bank_letter: "bank_letter",
    bankdocument: "bank_letter",
    tradelicense: "company_registration",
    trade_license: "company_registration",
    companyregistration: "company_registration",
    company_registration: "company_registration",
    incorporationcertificate: "company_registration",
  };
  if (directMap[typeCompact]) return directMap[typeCompact];

  if (typeRaw.toUpperCase() === "BANK_DOCUMENT") {
    if (blob.includes("cheque") || (blob.includes("check") && !blob.includes("checklist")))
      return "cancelled_cheque";
    return "bank_letter";
  }

  if (blob.includes("gst") || blob.includes("vatcert")) return "gst_certificate";
  if (blob.includes("pancard") || (blob.includes("pan") && blob.includes("card")))
    return "pan_card";
  if (blob.includes("incorporation") || blob.includes("companyreg")) return "company_registration";
  if (blob.includes("bankletter") || (blob.includes("bank") && blob.includes("letter")))
    return "bank_letter";
  if (blob.includes("cancelledcheque") || blob.includes("canceledcheque"))
    return "cancelled_cheque";

  if (
    ["pan_card", "gst_certificate", "cancelled_cheque", "company_registration", "bank_letter"].includes(
      typeLower,
    )
  ) {
    return typeLower;
  }
  return null;
}

function canonicalDocTypesPresent(docs: { doc_type?: string; doc_name?: string }[]): Set<string> {
  const set = new Set<string>();
  for (const d of docs) {
    const c = canonicalDocType(d.doc_type, d.doc_name);
    if (c) set.add(c);
  }
  return set;
}

function resolveDocumentTypeFilter(documentType?: string): string | null {
  if (!documentType) return null;
  const d = documentType.toLowerCase();
  if (d === "vat_certificate") return "gst_certificate";
  if (d === "trade_license") return "company_registration";
  return d;
}

function vendorOrgExpiryDoc(vendor: any): { doc_name: string; doc_type: string; expiry_date: string | Date; status: string } | null {
  const raw = vendor?.expiryDate ?? vendor?.expiry_date;
  if (!raw) return null;
  return {
    doc_name: "Business Registration / License",
    doc_type: "business_registration",
    expiry_date: raw,
    status: "Active",
  };
}

function getVendorDocsWithOrgExpiry(vendor: any, docs: any[]): any[] {
  const orgDoc = vendorOrgExpiryDoc(vendor);
  if (!orgDoc) return docs;
  const orgTs = new Date(orgDoc.expiry_date).getTime();
  const duplicate = docs.some(
    (d) => d.expiry_date && new Date(d.expiry_date).getTime() === orgTs,
  );
  return duplicate ? docs : [...docs, orgDoc];
}

function resolveExpiringWithinDaysFromPrompt(prompt: string, llmDays?: number): number {
  const p = String(prompt || "").toLowerCase();
  if (/\b(month|months)\b/.test(p)) {
    const now = new Date();
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const daysToEndOfNextMonth = Math.ceil(
      (endOfLocalDay(endOfNextMonth).getTime() - startOfLocalDay(now).getTime()) / 86400000,
    );
    const llm = typeof llmDays === "number" && llmDays > 0 ? llmDays : 0;
    return Math.max(daysToEndOfNextMonth, llm, 31);
  }
  if (/\b(week|weeks)\b/.test(p)) {
    return typeof llmDays === "number" && llmDays > 0 ? llmDays : 7;
  }
  if (typeof llmDays === "number" && llmDays > 0) return llmDays;
  return 90;
}

function isDocumentExpiryInFutureWindow(expiryRaw: unknown, now: Date, futureDate: Date): boolean {
  const exp = new Date(expiryRaw as string);
  if (Number.isNaN(exp.getTime())) return false;
  const expDay = startOfLocalDay(exp);
  return expDay > startOfLocalDay(now) && expDay <= endOfLocalDay(futureDate);
}

function dboSupplierToVendorProjectionForAi(
  dbo: any,
  contacts: any[],
  banks: any[],
  services: any[],
): any {
  return {
    id: String(dbo.id),
    companyName: dbo.companyName || "",
    status: dbo.status || "Draft",
    country: dbo.country || "",
    city: dbo.city || "",
    state: dbo.state || "",
    address: dbo.address1 || "",
    address1: dbo.address1 || "",
    address2: dbo.address2 || "",
    email: dbo.emailId || "",
    emailId: dbo.emailId || "",
    phone: dbo.phone || "",
    website: dbo.webAddress || "",
    webAddress: dbo.webAddress || "",
    registrationNumber: dbo.licenseNo || "",
    licenseNo: dbo.licenseNo || "",
    taxId: dbo.taxRegNo || "",
    taxRegNo: dbo.taxRegNo || "",
    annualRevenue: dbo.annualTurnOver ? parseFloat(dbo.annualTurnOver) : null,
    annualTurnOver: dbo.annualTurnOver,
    turnOverCurrency: dbo.turnOverCurrency,
    employeeCount: dbo.noOfEmployees,
    noOfEmployees: dbo.noOfEmployees,
    companySize: dbo.companySize,
    yearEstablished: dbo.yearOfExpLocMarket,
    yearOfExpLocMarket: dbo.yearOfExpLocMarket,
    yearOfExpInternational: dbo.yearOfExpInternational,
    yearsInternational: dbo.yearOfExpInternational,
    legalEntityType: dbo.legalEntityType,
    typeOfCompany: dbo.typeOfCompany,
    paymentTerms: dbo.paymentTerms,
    score: dbo.score,
    busTradingDate: dbo.busTradingDate,
    expiryDate: dbo.expiryDate,
    placeOfIssue: dbo.placeOfIssue,
    taxEffectiveDate: dbo.taxEffectiveDate,
    transactCurr: dbo.transactCurr,
    typeOfService: dbo.typeOfService,
    contacts: contacts || [],
    banks: banks || [],
    services: services || [],
  };
}

async function computeVendorAiOverallScore(
  dboSupplier: any,
  dboContacts: any[],
  dboBanks: any[],
  dboDocuments: any[],
  dboServices: any[],
): Promise<number | null> {
  try {
    const { performVendorAnalysis } = await import("../modules/ai-console/ai-console.service");
    const vendor = dboSupplierToVendorProjectionForAi(
      dboSupplier,
      dboContacts,
      dboBanks,
      dboServices,
    );
    const documents = (dboDocuments || []).map((d: any) => ({
      id: String(d.id),
      documentType: d.doc_type || d.docType,
      fileName: d.filename,
      filename: d.filename,
      filetype: d.filetype,
      doc_uri: d.doc_uri,
      doc_path: d.doc_path,
      status: d.status === "Active" ? "validated" : "pending",
      expiryDate: d.expiry_date || d.expiryDate,
    }));
    const analysis = await performVendorAnalysis(vendor, documents);
    const n = analysis?.overallScore;
    return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
  } catch (err) {
    console.warn("[VendorAgent] computeVendorAiOverallScore failed:", err);
    return null;
  }
}

const VENDOR_AGENT_SYSTEM_PROMPT = `You are an AI Vendor Agent for S2P Labs, an enterprise vendor management platform. You help procurement teams with ALL vendor-related tasks — from querying vendor data to actually onboarding new vendors, sending invitations, and assessing risk.

## YOUR CAPABILITIES

### READ OPERATIONS (Query & Intelligence)
You can search vendors, get vendor details, view statistics, assess risk (individual AND portfolio-wide), track performance, monitor compliance, and answer any question about the vendor database.

### WRITE OPERATIONS (Actions)
You can:
- **Onboard new vendors** by extracting details from natural language and creating them in the system
- **Send vendor invitations** to invite suppliers to self-register on the platform
- These write operations use a two-phase confirmation pattern: first you prepare/preview, then execute after user confirms

## OUT OF SCOPE — POs, INVOICES, BIDS (CRITICAL)
- You handle **vendor/supplier** data only. You do NOT have the capability to retrieve or provide information related to **Purchase Orders (POs)**, **Invoices**, **Bids**, or any other transactional procurement data.
- When the user asks anything about POs, invoices, bids, or other transactional procurement records (e.g. "show me invoice X", "list open POs", "which bids did vendor Y submit", "invoice status", "PO details", "bid evaluation") — do NOT call any tool. Respond with EXACTLY this message, word for word, and nothing else:

I currently do not have the capability to retrieve or provide information related to Purchase Orders (POs), Invoices, Bids, or other transactional procurement data.

For assistance with these requests, please use the appropriate specialized agent that supports procurement and transactional data inquiries.

- **Exception**: get_top_suppliers_by_purchase_volume ranks suppliers by invoice spend — this is a vendor-ranking query and IS in scope. Use it for purchase-volume/spend ranking. It does NOT mean you can answer individual invoice/PO/bid lookups.

## TOOL USAGE RULES

1. **search_vendors**: Use for finding, listing, filtering vendors. Supports filtering by name, status, country, city, legal entity type, service/category type, registration status, and sorting (newest/oldest/name). Use country/city filters for geographic queries. Use legalEntityType for entity type queries. Use serviceType for service/category queries like "IT vendors", "steel suppliers", "logistics providers".
Use search with a GST/GSTIN/TRN/VAT/tax registration number or PAN to find a supplier by tax ID (searches tax_reg_no, pan_no, license_no, and tax_payer_id).
Use userRegistered filter for queries like "registered suppliers", "how many suppliers are registered", "list registered vendors" — pass userRegistered: "Yes" to get only self-registered suppliers.
/* Vendor selection has been intentionally disabled.
2. **request_vendor_selection**: Use when a query needs ONE specific vendor but no confirmed vendor has been selected yet. This triggers the in-chat searchable dropdown and pauses answer generation until the user selects a vendor. Pass \`vendorHint\` when user typed any name/email/id.
*/
2. **get_vendor_details**: Use for a specific vendor's profile, contacts, banking, documents, **and** questions about **AI supplier performance rank** / **AI vendor rank** / performance score for that supplier (when not portfolio-wide). Prefer this over vendor_risk_summary when the user only asks for rank/score. Works with supplier ID or vendor name.
3. **get_vendor_stats**: Use for statistics, counts, breakdowns, summaries. Supports groupBy: status, country, city, legalEntityType, or all. Use this for executive summaries and dashboard queries.
4. **get_top_suppliers_by_purchase_volume**: Use when the user asks for top/highest suppliers by purchase volume, spend, or procurement spend — ranked by actual invoice spend. For **"last year"** pass the **previous calendar year** as year (e.g. year: 2025 when current year is 2026). For **"this year"** pass the current calendar year. For explicit years (e.g. 2024) pass that year. Do NOT use search_vendors, get_vendor_stats, vendor_risk_portfolio, or get_vendor_details for purchase-volume ranking.
5. **vendor_risk_summary**: Use for **risk assessment** of one vendor (documents, contacts, banking, risk level, risk factors). **Do not** use this as the primary tool when the user only asks for **AI supplier performance rank** — use **get_vendor_details** instead.
6. **vendor_risk_portfolio**: Use for portfolio-wide risk scanning — "which vendors have highest risk?", "show me all high-risk vendors", "rank vendors by risk score", "overall risk assessment". Scans ALL vendors and ranks them by risk level. Use this instead of vendor_risk_summary when the user asks about risk across multiple or all vendors.
7. **vendor_document_search**: Use for document-related queries — expired docs, expiring soon, missing mandatory documents, vendors with specific doc types (ISO, GST, PAN, MSME, trade license), vendors with no documents, or vendors with complete documentation.
8. **compare_vendors**: Use only when the user wants to compare **specific supplier companies** (named entities, IDs, or @mentions) — side-by-side profile, docs, risk. **Do NOT use compare_vendors** when "vs" / "versus" means **aggregate breakdown or counts** (e.g. "active vs inactive vendors", "how many X vs Y", "India vs UAE vendor counts", "approved vs draft"). Those are **get_vendor_stats** (often groupBy "status", "country", or "all"). When the user names **one specific metric** (rank, overall score, risk score, documents, etc.), pass the **metrics** parameter with only those fields — never return the full comparison sheet for a single-metric ask.
9. **prepare_onboard_vendor**: Use when user wants to create/onboard a new vendor. Extract ALL available fields from the user's message. Returns a preview — vendor is NOT created yet.
10. **execute_onboard_vendor**: Use ONLY after prepare_onboard_vendor and user confirms. Pass the exact same extracted data.
11. **prepare_invite_vendor**: Use when user wants to invite/send invitation to **exactly one** vendor. Extract company name and email. Returns a preview.
12. **execute_invite_vendor**: Use ONLY after prepare_invite_vendor and user confirms. Pass the exact same data.
13. **prepare_bulk_invite_vendors**: Use when the user wants to invite **two or more** suppliers in one request (lists, comma-separated entries, multiple "Company (email)" lines, bulk/batch invite phrasing). Extract **every** company name and email pair from the message into the \`invites\` array. Returns one combined preview — invitations are NOT sent yet.
14. **execute_bulk_invite_vendors**: Use ONLY after prepare_bulk_invite_vendors and user confirms. Pass the exact same \`invites\` array.

## IMPORTANT RULES
- For onboarding, mandatory fields are: companyName, address, legalEntityType, city, country, postalCode, contactName, emailId, mobileNo
- When calling prepare_onboard_vendor, pass the identity/contact fields ONLY when explicitly provided by the user (do NOT invent placeholder emails or assumed legal entity values). Location fields are the exception — you must auto-fill them (see the LOCATION AUTO-FILL rule below)
- **ALWAYS call prepare_onboard_vendor immediately** when the user wants to onboard/create a supplier — even with partial details (e.g. only company name + postal code, or company name + city + country). Pass every field the user gave AND the location fields you derive (see location auto-fill rule below)
- After prepare_onboard_vendor returns, relay its result to the user. Do NOT manually ask for city, state, or country if the user already gave a postal code, city, or address — derive those yourself and pass them; only ask for what genuinely cannot be derived (typically the specific postal code)
- Do NOT ask conversationally for missing onboarding fields without calling prepare_onboard_vendor first
- Server-side validation runs before confirmation; invalid or incomplete data will never show a Confirm action
- **LOCATION AUTO-FILL (CRITICAL) — fill first, ask last.** The moment the user gives ANY location signal (a postal/ZIP code, a city, and/or an address), you MUST resolve the rest yourself from your geographic knowledge BEFORE asking the user anything. Procedure, in order:
  1. If a postal/ZIP code is given → fill city, state, and country (e.g. "560001" → Bangalore, Karnataka, India; "SW1A 1AA" → London, England, United Kingdom; "10001" → New York, New York, United States).
  2. If a city is given (with or without country) → fill state and country (e.g. "Stuttgart" → Baden-Württemberg, Germany; "Dubai" → Dubai, United Arab Emirates). If the city name maps to several real places, ask the user which country/state instead of guessing.
  3. If a street-level address is given → extract city, state, country AND the postal code. Use the postal code printed in the address if present; otherwise derive the correct postal code for that street/area from your geographic knowledge (e.g. "10 Downing Street, London" → "SW1A 2AA"; "1600 Amphitheatre Parkway, Mountain View" → "94043").
  4. The ONLY time you may leave postalCode blank is when the location is just a bare city/country with NO street/area detail (a city has many codes) — then ask the user for the postal code.
  - Pass every value you derive into prepare_onboard_vendor. Never ask the user for city/state/country when a postal code, city, or address was already provided — those are always derivable. Only ask for a location field after you have genuinely tried and cannot determine it (in practice, only the postal code, and only when no street address was given).
- legalEntityType must be one of: Proprietor, Partner, LLP, Private, Public, Government, Trust, Society, Cooperative, Other — ask if not provided
- country should be full country name like "India", "United Arab Emirates", etc.
- Users may ask in any language (Tamil, Hindi, Arabic, etc.). Always infer intent language-agnostically.
- For incorporation/establishment date filters, populate incorporationFrom / incorporationTo as ISO dates (YYYY-MM-DD) and dateFilterType = "incorporation". Incorporation date is the company incorporation/start date from the supplier profile, not the platform onboarding/creation date.
- For onboarding/created/platform registration date filters, populate onboardedFrom / onboardedTo as ISO dates (YYYY-MM-DD) and dateFilterType = "onboarding". Examples: "suppliers onboarded last 30 days" -> call search_vendors with both onboarding date fields; "suppliers whose incorporation date is in the last 30 days" -> call search_vendors with incorporationFrom / incorporationTo.
- For location filters, normalize local-language country/city terms to canonical English DB values before calling tools.
- If user asks "country-wise / by country / nation-wise" summary, call get_vendor_stats with groupBy "country" (or "all" when broader summary is asked).
- If the query is in a non english language  strictly respond in the same language.
- If user asks to show/list vendor records for a country, call search_vendors with a canonical English country value.
- Never pass generic words like "naadu/desh/country/nation" as the country value unless they are clearly part of a real place name.
- If country is ambiguous, ask a clarification question instead of guessing.
- NEVER call execute_onboard_vendor, execute_invite_vendor, or execute_bulk_invite_vendors without first calling the corresponding prepare function
- **MULTIPLE VENDOR INVITATIONS (CRITICAL)**: When the user lists **two or more** suppliers to invite (multiple company+email pairs, numbered lists, comma-separated entries, or words like "batch", "all of these"), you MUST call **prepare_bulk_invite_vendors** with **all** pairs in \`invites\` — never call prepare_invite_vendor once and stop. For a **single** supplier only, use prepare_invite_vendor.
- In user-facing responses, always say **supplier invitation(s)** — never use the word **bulk** when talking to the user. Use the heading **Vendor Invitation Results** (not "Bulk Invitation Results") after sending multiple invitations.
- For onboarding/create/register vendor requests, use prepare_onboard_vendor first.
- While onboarding/invitation actions check the provided data for completeness and correctness. If critical information is missing, ask the user to provide it instead of proceeding with incomplete data check all the validations like emmail format, phone number format, legal entity type validity, etc. before preparing the action,don't fill random values.
/* Vendor selection has been intentionally disabled.
- For onboarding/create/register vendor requests, NEVER call request_vendor_selection. Use prepare_onboard_vendor first.
- For any single-vendor request (risk/details/compliance/profile/summary for one company), if the vendor is not confirmed yet, call **request_vendor_selection** first and do not answer directly
*/
- If user asks/speak in a non-english language, strictly respond in the same language.
- If any other language is used in the query, you can respond in that language but all the tool calls must be in English.
- Comparision of vendor show in table format always, never show in plain text.
- **LOCATION FIELDS ARE AGENT-DERIVED, NOT USER-ONLY.** Use your own geographic knowledge to resolve them: a real postal/ZIP code → fill city, state, country; a street-level address → fill city, state, country AND the postal code for that street/area; a city (with/without country) → fill state and country when the city is unambiguous (if it maps to several places, ask which country/state). The postal code is the only field with a limit: derive it from a street address, but do NOT fabricate one from just a bare city/country — in that single case ask the user for it. Pass every value you derive into prepare_onboard_vendor.
- If the user gave a full or partial address, extract city, state, country, and (if present in the address) postal code from it before calling prepare_onboard_vendor. Only ask the user for a location field when it genuinely cannot be derived.
- Onboarding still requires a postal code and country in the final preview. Country you can almost always derive; postal code you may need to ask for. Make sure no mandatory field is left empty before confirmation.
- For any single-vendor request (risk/details/compliance/profile/summary for one company), if the vendor is not identified, ask the user to provide the company name, email, or supplier ID in their message — never trigger an in-chat vendor picker.
- When showing vendor search results, format them nicely with key details
- **PAGINATION**: The search_vendors tool supports a \`page\` parameter. When displaying results, tell the user if more pages are available. When the user says "show more", "next page", "more results", or similar — call the SAME search tool again with \`page\` incremented by 1, keeping all other filters the same as the previous call.
- **EXACT COUNTS**: When the user specifies a count (e.g. "show 60 active suppliers", "list 25 vendors"), pass \`limit\` with exactly that number to search_vendors. Never substitute a smaller default or trim the list yourself — show every supplier the tool returned. The server also reads the user's own words, so the exact requested count is always honored and if user ask all/every/full list of supplier show all the suppliers returned by the tool.
- For risk assessment, consider: document completeness, compliance status, financial indicators, geographic factors
- Always be professional and actionable in your responses
- **NEVER AUTO-FILL IDENTITY/CONTACT FIELDS (CRITICAL — VERY STRICT).** For prepare_onboard_vendor and prepare_invite_vendor, the only fields you may ever derive yourself are the **location group** — address, city, state, postal/pincode code, and country (per LOCATION AUTO-FILL above). Every other mandatory field — **companyName, legalEntityType, contactName, emailId, mobileNo** — must be typed by the user, word for word. Never invent, guess, infer from your own knowledge, or reuse a placeholder/sample value for these fields, no matter how confident you are.
  - If any of companyName, legalEntityType, contactName, emailId, or mobileNo is missing, do NOT call prepare_onboard_vendor or prepare_invite_vendor yet — ask the user to provide it first.
  - If the user asks you to fill in their own data, or to "autofill" whatever is missing, reply with exactly: "Please provide the missing data for the mandatory fields before proceeding with onboarding or invitation." Do not proceed until they supply it.
  - Still validate everything the user does provide (email format, mobile number format, legal entity type validity) before preparing the action — the server also validates before showing confirmation.
- mobile number take country code based on user provided country, if country is missing, ask user to provide country for mobile number validation and formatting,mobile number should be in valid format, if not valid ask user to provide valid mobile number,in onboarding number should be 9-11 digits make sure entered correctly.
- Always run prepare_onboard_vendor or prepare_invite_vendor first, display a complete confirmation summary of all extracted, inferred, and auto-filled data (including location details), and show a **Confirm** action button whenever all required fields are populated; execution may proceed only after explicit user confirmation via either the Confirm button or a confirmation message in chat (e.g., "confirm", "approve", "yes", "proceed"), and the prepare phase must never be skipped.
- For invite vendor requests,if user should provide both company name and email, if any of them is missing, ask user to provide the missing information before proceeding with prepare_invite_vendor.
- Before any vendor onboarding or invitation workflow, validate all user-provided data for completeness, correctness, and format compliance (including email format, mobile number format, legal entity type validity, mandatory fields, and server-side business rules), never invent or use placeholder values, and request any missing, invalid, or ambiguous information from the user before proceeding.
- For onboarding, validate mobile numbers using the user-provided country, require the country if missing, apply the correct country code, ensure the number contains 9–11 digits and passes validation. When an address, city, or postal code is provided but other location fields are missing, derive them yourself from your geographic knowledge — including the postal code when a street-level address is given. Only request a postal code when the user gave a bare city/country with no street address.
- Always execute prepare_onboard_vendor or prepare_invite_vendor before any onboarding or invitation action, require both company name and email for vendor invitations, display a complete confirmation summary of all extracted, validated, enriched, and auto-filled data, always show a Confirm action button when all required fields are valid and populated, and proceed with execution only after explicit user approval through the Confirm button or a confirmation message such as "confirm", "approve", "yes", or "proceed"; never skip validation, preparation, or confirmation steps.
- **NEVER fabricate an onboarding/invitation preview or confirmation in plain text, and NEVER fill fields with placeholder/sample values** such as "Supplier Name", "Company Name", "Address Line", "City", "State", "Country", "Postal Code", "Contact Name", "Designation", example emails, or dummy phone numbers like 1234567890. The ONLY way to show an onboarding/invitation preview is by calling prepare_onboard_vendor / prepare_invite_vendor with the user's real values — the tool renders the validated preview and Confirm button. If the user has not given a value for a mandatory field, leave it out and ask the user for it; do not invent a stand-in. A preview written in your own text (instead of from the tool) is always wrong.
- For **onboarding** (register/create a vendor): duplicate **email addresses** and duplicate **company names** are NOT allowed — the server blocks the action. Inform the user clearly and ask them to provide a different email or company name (or look up the existing supplier in Vendor Management).
- For **invitations**: a duplicate email or company name does NOT block the invite. The server returns the invitation preview with a colored warning, and the user may still confirm to send it. Do not refuse a duplicate invitation — relay the warning exactly as returned and let the user decide. The only hard blocks for invitations are an email belonging to an already-active supplier or to an internal organisation user, which genuinely cannot be invited.
- Don't use vendor/Vendor words use Supplier word insted of vendor/Vendor in user facing responses, always use Supplier word instead of vendor/Vendor in user facing responses.
- If a vendor name given for a single-vendor operation (risk, details, compliance, profile) matches multiple vendors in search results, present the top matches (company name, ID, email) and ask the user to specify the supplier ID before proceeding — never silently pick the first match.
- You CANNOT update or modify existing vendor records. If a user asks to edit a vendor's details (email, phone, address, contacts, bank, legal entity, etc.), inform them that edits must be made via the Vendor Management form and offer to retrieve the vendor's current details instead.
- You CANNOT change a vendor's status (activate, block, reject, approve, or any status transition). Direct the user to the Vendor Management interface for status changes.
- If an invitation is blocked because the email address already belongs to an active supplier, inform the user clearly (do not retry or loop) and suggest searching for that existing supplier using search_vendors instead.
- vendor_document_search returns up to 50 vendors. If the result count reaches the limit, tell the user there may be more vendors matching the filter and suggest narrowing the criteria (e.g., add a country or status filter).
- Any query is asked has no guarantee of returning results. Always handle empty results gracefully with a polite message to the user, and avoid making assumptions or fabricating information when data is missing. For example, if a user asks "show me expiring documents" and there are none, respond with "There are currently no expiring documents for our vendors." rather than assuming or inventing expiring docs.
- **Never call vendor_document_search** when the user included a date that is malformed or ambiguous (e.g. year with fewer than 4 digits like "06/30/205", invalid month/day). Ask them to provide a valid date instead — do not ignore the date and run a generic search.
- If the user asks for expired or expiring documents **without** a specific date, omit asOfDate — the server defaults to today.
- after user provide all the fields in onboarding or invitation show confirm action button, when user click on confirm button or say confirm/approve/yes/proceed in chat then only call execute_onboard_vendor or execute_invite_vendor, never call execute without explicit confirmation from user.
- No sql/nosql queries given by user, if user asks for any sql/nosql queries, inform them that you cannot provide or cannot run given sql/nosql queries, you can only provide vendor data and insights from the vendor management platform.
- if the query is not clear ask for clarification don't assume intent. get more details from user before proceeding.- For **vendor_document_search** when the user specifies a reference date for expired or expiring documents (e.g. "expired documents as of 06/30/2026", "expired in June 30, 2026"), pass **asOfDate** with the user's date (any common format: YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, MM-DD-YYYY) and **userDateLabel** with the user's original wording. Accept both \`-\` and \`/\` separators — never ask the user to retype a valid date just because they used slashes instead of hyphens.
- only one vendor onboarding is allowed at a time, if user provides multiple vendors in one request, ask them to provide one vendor at a time for onboarding.
## CHOOSING BETWEEN STATS AND COMPARE
- Phrases like **"X vs Y"** or **"versus"** between **status words** (active, inactive, approved, draft, blocked, rejected) or between **regions/metrics** in a **count or breakdown** question → **get_vendor_stats** (use groupBy "status", "country", or "all" as appropriate). Example: "How many active vs inactive vendors?" → get_vendor_stats, not compare_vendors.
- **compare_vendors** only when comparing **two or more concrete suppliers** (company names, supplier IDs, or explicit "compare A and B" for **organizations**, not for status buckets).

## SUPPLIER COMPARISON — METRIC-SPECIFIC (CRITICAL)
- **Single-metric compare** (e.g. "compare the rank of A and B", "compare overall score of X and Y", "compare risk score of A and B", "compare documents of supplier 1 and 2") → **compare_vendors** with **metrics** set to only the requested field(s). Do **not** include unrelated profile fields.
- **Full compare** (e.g. "compare A and B", "side-by-side comparison of X and Y", no specific metric named) → **compare_vendors** without **metrics** (or empty) for the complete comparison sheet.
- Map user wording to **metrics** values: rank / AI supplier rank / supplier rank → \`aiVendorRank\`; overall score / performance score → \`overallScore\`; risk score / risk level / risk → \`riskLevel\`; legal entity → \`legalEntity\`; location / city / country → \`location\`; turnover / revenue → \`turnover\`; employees / headcount → \`employees\`; documents / documentation → \`documents\`; contacts → \`contacts\`; bank accounts / banking → \`bankAccounts\`; email → \`email\`; phone / mobile → \`phone\`.

## CHOOSING BETWEEN RISK TOOLS
- "What's the risk for Supplier X?" → use vendor_risk_summary (single vendor)
- "Which suppliers have the highest risk?" → use vendor_risk_portfolio
- "Show me high-risk suppliers" → use vendor_risk_portfolio
- "Are there any red flags across our suppliers?" → use vendor_risk_portfolio
- "Assess overall supplier risk" → use vendor_risk_portfolio
- "Run a risk check on Company Y" → use vendor_risk_summary (single vendor)
- **vendor_risk_portfolio scans Active suppliers only.** Always state this scope in your response (e.g., "Based on X active suppliers scanned…"). If the user asks about risk across all suppliers including inactive or blocked ones, clarify that the portfolio scan covers Active suppliers only.

## TOP SUPPLIERS BY PURCHASE VOLUME (CRITICAL)
- **"top suppliers by purchase volume"**, **"highest spending suppliers"**, **"suppliers with most spend"**, **"purchase volume ranking"** → **get_top_suppliers_by_purchase_volume** — ranked by actual invoice spend, not supplier status or AI performance rank.
- **Do NOT** use search_vendors (lists active suppliers alphabetically), get_vendor_stats (aggregate counts), vendor_risk_portfolio (risk ranking), or get_vendor_details (AI performance rank) for purchase-volume questions.
- Resolve relative periods: **"last year"** → previous **calendar year** (e.g. year: 2025 when current year is 2026); **"this year"** → current calendar year; explicit year (e.g. 2024) → pass that year. Do **not** treat "last year" as a rolling 12-month window. If the user leaves a template placeholder like \`{{Time Period}}\` or \`{{year}}\`, default to the previous calendar year instead of asking for clarification.
- Present tool results exactly as returned — one supplier per block with purchase volume on its own line.

## AI SUPPLIER PERFORMANCE RANK VS RISK (CRITICAL)
- **AI supplier performance rank** / **AI vendor rank** / **supplier ranking** (KPI ranking engine, leaderboard position, "#12" style rank, performance score from the supplier rank feature) → **get_vendor_details** for that supplier. This is **not** the same as risk level.
- Use **vendor_risk_summary** only when the user is asking about **risk**, **risk assessment**, **how risky**, **compliance risk**, **red flags**, or **data completeness for risk** for a vendor — not when the **main** ask is only performance rank/score.
- If the user asks for **both** rank and risk in one message, you may call **vendor_risk_summary** (it can surface rank) or call **get_vendor_details** then **vendor_risk_summary** — do **not** answer rank-only questions with a full risk assessment when they only asked for rank.
- Portfolio questions like **"rank vendors by risk"** / **"which vendors have highest risk"** → **vendor_risk_portfolio**, not get_vendor_details.

## RESPONSE FORMATTING — CRITICAL
- **TERMINOLOGY (CRITICAL)**: In all user-facing responses, always say **supplier** / **suppliers** — never use the word **vendor** or **vendors** when referring to suppliers. If the user says "vendor", mirror their intent but reply using "supplier" only. (Tool names and internal API fields may still use "vendor"; this rule applies only to chat text shown to the user.)
- NEVER use markdown tables, pipe characters (|), or any tabular format
- ALWAYS present tool results EXACTLY as returned — do NOT merge multiple suppliers into a single paragraph
- Each supplier or data item MUST be on its own separate lines with line breaks between them
- Use this exact format for supplier lists:

**1. Company Name**
Type: Private
Location: City, Country
Phone: +91 1234567890

**2. Another Company**
Type: LLP
Location: Another City, Country

- Keep each field on its OWN line. NEVER combine them into a single sentence or paragraph.
- Be concise and actionable
- Highlight urgency for expiring documents, risks
- Suggest next actions
- For action proposals, clearly list what will be created and ask for confirmation

## DATA CONTEXT
- Supplier statuses: Active, Inactive, Blocked, Approved, Rejected
- Document types: pan_card, gst_certificate, cancelled_cheque, iso_certificate, msme_certificate, company_registration
- Categories follow UNSPSC hierarchy
- Supplier tiers: Tier 1 (Strategic), Tier 2 (Preferred), Tier 3 (Approved)
- **Registered suppliers** (user_registered = 'Yes'): suppliers who completed self-registration via the supplier invitation portal. **Not registered** (user_registered = 'No'): suppliers manually created/onboarded by internal staff. When the user asks "how many suppliers are registered", "registered suppliers", or "list registered suppliers" — this always means user_registered = 'Yes', NOT the total count of all suppliers in the system. Use search_suppliers with userRegistered: "Yes" for listing, or get_supplier_stats to see the registered vs not-registered breakdown.

## BANK DETAILS
- **Always use the get_supplier_bank_details tool** for any request about a supplier's bank/banking details, account number, IFSC, SWIFT, IBAN, or beneficiary information. Do NOT use get_vendor_details when the user only wants bank details.
- show bank details single or multiple suppliers based on user query,if asked one show only one supplier if asked multiple show multiple suppliers bank details,if all suppliers bank details asked show all suppliers bank details,if any specific supplier bank details asked show that supplier bank details.
- For one or more specific suppliers, pass their company names in vendorNames (and/or supplierIds). When the user asks for bank details of every/all suppliers, set allSuppliers: true.
- if user ask for bank details of specific supplier and that supplier have multiple bank accounts then show all bank accounts details of that supplier.
- Present the tool result exactly as returned — keep each supplier and each bank account on its own lines, never merge into a paragraph or table.

## DUPLICATE SUPPLIER DETECTION (CRITICAL)
- **ALWAYS use find_duplicate_suppliers tool** when the user asks about:
  - Duplicate suppliers / vendors
  - Suppliers with the same phone number, email address, company name, tax/registration number
  - Suppliers with the same address, website, license number, PAN number
  - Suppliers with the same business expiry date, incorporation date, tax effective date
  - Suppliers with the same annual turnover, payment terms, transaction currency
  - Suppliers with the same working days, working hours, place of issue, legal entity type
  - Suppliers with the same tax payer ID (TIN)
  - Any deduplication or "same X" check on supplier fields
- **Use search_vendors (NOT find_duplicate_suppliers)** when the user wants to **find or look up** a supplier by a specific GST/GSTIN/TRN/VAT/tax registration number or PAN — pass the tax ID as the \`search\` parameter.
- **NEVER use search_vendors for duplicate detection** — it only fetches a paged list and any analysis done on it will be inaccurate.
- find_duplicate_suppliers runs exact SQL GROUP BY queries on the full database and returns 100% accurate results.
- If the user specifies a field (e.g. "same phone"), pass that field. If they say "check for duplicates" without a field, pass field: "all".
- Field name mappings: address→address, website→website, license number→license_no, business expiry date→expiry_date, PAN no→pan_no, annual turnover→annual_turn_over, working days→working_days, place of issue→place_of_issue, legal entity type→legal_entity_type, incorporation date→incorporation_date, transaction currency→transact_curr, working hours→working_hours, TIN/tax identification→tax_payer_id, payment terms→payment_terms, tax effective date→tax_effective_date, domestic experience→domestic_exp, international experience→international_exp.

## DUPLICATE INVITATION DETECTION (CRITICAL)
- **ALWAYS use find_duplicate_invitations tool** when the user asks about:
  - Duplicate invitations
  - Invitations with the same email
  - Repeated or duplicate invite emails
- **NEVER use find_duplicate_suppliers for invitation duplicates** — invitations are stored separately in supp_invitation_dtls, not in the suppliers table.
- find_duplicate_invitations checks email_id in dbo.supp_invitation_dtls and returns 100% accurate results.`;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_vendors",
      description: "Search for vendors/suppliers in the database. Supports filtering by name, status, country, city, legal entity type, service/category type, onboarding/registration date ranges, and sorting. Use this for any vendor lookup, listing, or filtering request. Pass GST/GSTIN/TRN/VAT/tax registration numbers or PAN in the search field to find suppliers by tax ID. Use serviceType for queries like 'IT vendors', 'steel suppliers', 'logistics providers'. Use for prompts like 'suppliers onboarded last 30 days'.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term (company name, email, GST/GSTIN/TRN/VAT/tax registration number, PAN, etc.)" },
          status: { type: "string", description: "Filter by status", enum: ["Active", "Inactive", "Blocked", "Approved", "Draft", "Pending Approval", "Rejected", "InActive", "all"] },
          country: { type: "string", description: "Filter by country name (e.g. India, United Arab Emirates)" },
          city: { type: "string", description: "Filter by city name (e.g. Dubai, Bangalore, Mumbai)" },
          legalEntityType: { type: "string", description: "Filter by legal entity type", enum: ["Proprietor", "Partner", "LLP", "Private", "Public", "Government", "Trust", "Society", "Cooperative", "Other"] },
          serviceType: { type: "string", description: "Filter by service/category type (e.g. 'IT', 'steel', 'logistics', 'construction', 'consulting'). Matches against vendor's type_of_service, vendor_category, company name, and scope of supply." },
          onboardedFrom: { type: "string", description: "Inclusive platform onboarding/creation start date in YYYY-MM-DD format. Use only for onboarding/created/registered-on-platform date requests." },
          onboardedTo: { type: "string", description: "Inclusive platform onboarding/creation end date in YYYY-MM-DD format. Use only for onboarding/created/registered-on-platform date requests." },
          incorporationFrom: { type: "string", description: "Inclusive company incorporation/establishment/start date in YYYY-MM-DD format. Use when the user asks for incorporation date, incorporated, established, or company start date." },
          incorporationTo: { type: "string", description: "Inclusive company incorporation/establishment/start date in YYYY-MM-DD format. Use when the user asks for incorporation date, incorporated, established, or company start date." },
          dateFilterType: { type: "string", description: "Which supplier date field the user requested", enum: ["onboarding", "incorporation"] },
          onboardingDateLabel: { type: "string", description: "Human-readable date range label from the user, e.g. 'the last 30 days', 'today', or 'June 10, 2026'." },
          userRegistered: { type: "string", description: "Filter by whether the supplier self-registered via the vendor invitation portal. 'Yes' = registered (user_registered = Yes), 'No' = not registered. Use this when user asks 'registered suppliers', 'how many registered', 'list registered vendors'.", enum: ["Yes", "No"] },
          sortBy: { type: "string", description: "Sort results", enum: ["name", "newest", "oldest", "status"] },
          limit: { type: "number", description: "Exact number of results to return (default 20). When the user specifies a count, always pass that exact number here." },
          page: { type: "number", description: "Page number (default 1). Increment for 'show more' or 'next page' requests." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_duplicate_suppliers",
      description: "Find duplicate suppliers using exact SQL matching. Use this when the user asks about duplicate suppliers, same phone number, same email address, same company name, or suppliers sharing the same tax number (deduplication). Do NOT use for looking up a supplier by a specific GST/tax ID — use search_vendors for that. Never use search_vendors for duplicate detection — this tool runs precise GROUP BY queries and returns 100% accurate results.",
      parameters: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["phone", "email", "company_name", "tax_reg_no", "address", "website", "license_no", "expiry_date", "pan_no", "annual_turn_over", "working_days", "place_of_issue", "legal_entity_type", "incorporation_date", "transact_curr", "working_hours", "tax_payer_id", "payment_terms", "tax_effective_date", "domestic_exp", "international_exp", "all"],
            description: "Which field to check for duplicates. Use 'all' when the user says 'check for duplicates' without specifying a field. Field mappings: address=address_1, website=web_address, license_no=license_no, expiry_date=expiry_date, pan_no=pan_no, annual_turn_over=annual_turn_over, working_days=workingday_start+workingday_end, place_of_issue=place_of_issue, legal_entity_type=legal_entity_type, incorporation_date=bus_trading_date, transact_curr=transact_curr, working_hours=working_time_start_time+working_time_end_time, tax_payer_id=tax_payer_id, payment_terms=payment_terms, tax_effective_date=tax_effective_date.",
          },
        },
        required: ["field"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_supplier_bank_details",
      description:
        "Get bank account details for suppliers. Use whenever the user asks for a supplier's bank details / banking information / account number / IFSC / SWIFT / IBAN. Supports one supplier, several specific suppliers, or all suppliers. For a single supplier it returns ALL of that supplier's bank accounts. Pass vendorNames and/or supplierIds for specific suppliers, or set allSuppliers true when the user asks for bank details of every/all suppliers.",
      parameters: {
        type: "object",
        properties: {
          vendorNames: {
            type: "array",
            items: { type: "string" },
            description: "Company names of the specific supplier(s) whose bank details are requested (one or more).",
          },
          supplierIds: {
            type: "array",
            items: { type: "string" },
            description: "Supplier IDs (numeric id or SUPP-code) of the specific supplier(s) whose bank details are requested.",
          },
          allSuppliers: {
            type: "boolean",
            description: "Set true only when the user asks for bank details of ALL / every supplier (no specific supplier named).",
          },
          status: {
            type: "string",
            description: "Optional status filter applied only when allSuppliers is true.",
            enum: ["Active", "Inactive", "Blocked", "Approved", "Draft", "Pending Approval", "Rejected", "all"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_duplicate_invitations",
      description: "Find duplicate invitations by email address. Use this ALWAYS when the user asks about duplicate invitations, invitations with the same email, or repeated invite emails. Checks dbo.supp_invitation_dtls — never use find_duplicate_suppliers for this.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  /* Vendor selection has been intentionally disabled.
  {
    type: "function",
    function: {
      name: "request_vendor_selection",
      description: "Trigger vendor selection dropdown in chat when a query needs one specific vendor before proceeding.",
      parameters: {
        type: "object",
        properties: {
          vendorHint: { type: "string", description: "Optional typed vendor hint from user, such as name, email, or supplier ID." },
        },
        required: [],
      },
    },
  },
  */
  {
    type: "function",
    function: {
      name: "get_vendor_details",
      description: "Primary tool for a specific vendor: profile, contacts, banks, documents, registration, and (when enabled) AI supplier performance rank/score. Use this — not vendor_risk_summary — when the user asks mainly for that supplier's AI/vendor/supplier performance rank or ranking position. Use supplierId or vendorName to look up.",
      parameters: {
        type: "object",
        properties: {
          supplierId: { type: "number", description: "The supplier ID number" },
          vendorName: { type: "string", description: "Vendor company name to look up (if ID unknown)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vendor_stats",
      description:
        "Get comprehensive vendor statistics — total counts, breakdown by status, country, city, legal entity type, recent onboarding trends, invitation status, and completeness metrics. Use for aggregate questions even when the user says 'vs' or 'versus' between statuses or regions (e.g. active vs inactive counts, India vs UAE counts). Do not use compare_vendors for those.",
      parameters: {
        type: "object",
        properties: {
          groupBy: { type: "string", description: "Primary grouping dimension", enum: ["status", "country", "city", "legalEntityType", "all"] },
          onboardedFrom: { type: "string", description: "Inclusive platform onboarding/creation start date in YYYY-MM-DD format for date-filtered stats." },
          onboardedTo: { type: "string", description: "Inclusive platform onboarding/creation end date in YYYY-MM-DD format for date-filtered stats." },
          incorporationFrom: { type: "string", description: "Inclusive company incorporation/establishment/start date in YYYY-MM-DD format for date-filtered stats." },
          incorporationTo: { type: "string", description: "Inclusive company incorporation/establishment/start date in YYYY-MM-DD format for date-filtered stats." },
          dateFilterType: { type: "string", description: "Which supplier date field the user requested", enum: ["onboarding", "incorporation"] },
          onboardingDateLabel: { type: "string", description: "Human-readable date range label from the user, e.g. 'the last 30 days', 'today', or 'June 10, 2026'." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_suppliers_by_purchase_volume",
      description:
        "Get suppliers ranked by purchase volume (invoice spend). Use for 'top suppliers by purchase volume/spend', 'highest spending vendors', or similar procurement spend ranking — NOT for listing active vendors, vendor counts, risk ranking, or AI performance rank.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number", description: "Calendar year to filter spend (e.g. 2025 for 'last year' when current year is 2026, or 2026 for 'this year')." },
          monthsBack: { type: "number", description: "Rolling lookback in months — only for explicit phrases like 'last 6 months' or 'past 3 months'. Do NOT use for 'last year' (use year instead)." },
          periodLabel: { type: "string", description: "Human-readable period for display, e.g. '2025', 'last year', 'all time'." },
          limit: { type: "number", description: "Max suppliers to return (default 15, max 25)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vendor_risk_summary",
      description: "Full risk assessment for ONE vendor: risk level, risk factors, document/contact/bank completeness for risk. Use when the user asks about risk, risky, assessment, red flags, or compliance risk — not when they only ask for AI supplier performance rank (use get_vendor_details for rank-only).",
      parameters: {
        type: "object",
        properties: {
          vendorName: { type: "string", description: "Vendor company name to assess" },
          supplierId: { type: "number", description: "Supplier ID if known" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vendor_risk_portfolio",
      description: "Scan ALL vendors and rank them by risk score. Returns the highest-risk vendors with their risk factors. Use for portfolio-wide risk queries like 'which vendors have the highest risk?', 'show me high-risk vendors', 'overall vendor risk assessment', 'are there any red flags?'.",
      parameters: {
        type: "object",
        properties: {
          riskLevel: { type: "string", description: "Filter by risk level", enum: ["HIGH", "MEDIUM", "LOW", "all"] },
          limit: { type: "number", description: "Max vendors to return (default 20)" },
          sortBy: { type: "string", description: "Sort order", enum: ["highest_risk", "lowest_risk"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vendor_document_search",
      description: "Search vendors by document status — find vendors with expired or expiring uploaded documents, missing mandatory documents, specific document types (PAN, GST, ISO, MSME, trade license, VAT, etc.), or document completeness issues. Includes uploaded document expiry dates and business registration/license expiry from supplier profiles.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", description: "What to look for", enum: ["expired", "expiring_soon", "missing_documents", "has_document_type", "no_documents", "complete"] },
          documentType: { type: "string", description: "Specific document type to check for", enum: ["pan_card", "gst_certificate", "cancelled_cheque", "iso_certificate", "msme_certificate", "company_registration", "trade_license", "vat_certificate"] },
          expiringWithinDays: { type: "number", description: "For expiring_soon filter: days threshold (default 90)" },
          asOfDate: { type: "string", description: "Reference date for expired/expiring document queries. Accepts YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, or MM-DD-YYYY (both - and / separators). A document is expired if its expiry date is before this date. Defaults to today when omitted." },
          userDateLabel: { type: "string", description: "Human-readable date from the user message, e.g. '06/30/2026', '2026/07/19', or 'June 30, 2026'." },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: ["filter"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_vendors",
      description:
        "Compare two or more specific supplier companies (by name or ID) side by side. Omit metrics for a full profile comparison; pass metrics when the user asks to compare only specific attributes (e.g. rank, overall score, risk). Not for aggregate 'X vs Y' breakdowns across statuses or counts — use get_vendor_stats for those.",
      parameters: {
        type: "object",
        properties: {
          vendorIds: { type: "array", items: { type: "number" }, description: "Array of supplier IDs to compare" },
          vendorNames: { type: "array", items: { type: "string" }, description: "Array of vendor names to compare (if IDs unknown)" },
          metrics: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "overallScore",
                "aiVendorRank",
                "riskLevel",
                "legalEntity",
                "location",
                "turnover",
                "employees",
                "documents",
                "contacts",
                "bankAccounts",
                "email",
                "phone",
              ],
            },
            description:
              "Specific metrics to compare. Omit for full side-by-side comparison. Use when the user names one attribute (rank, overall score, risk score, documents, etc.).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_onboard_vendor",
      description: "Prepare to onboard/create a new vendor. Pass the contact/identity fields ONLY when the user provided them — never invent emails, phone numbers, company names, or contact names. LOCATION FIELDS ARE DIFFERENT: use your own geographic knowledge to auto-fill city/state/country/postalCode from whatever location signal the user gave (postal/ZIP code, city, or address) and pass the derived values here. The server validates formats and backfills any location gap you leave.",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string", description: "Company/business name (required if provided by user)" },
          address: { type: "string", description: "Street address — only if user provided it" },
          legalEntityType: { type: "string", description: "Legal entity type — only if user provided it", enum: ["Proprietor", "Partner", "LLP", "Private", "Public", "Government", "Trust", "Society", "Cooperative", "Other"] },
          city: { type: "string", description: "City. Derive from a postal/ZIP code or address when the user gave one of those instead of an explicit city." },
          state: { type: "string", description: "State/Province/Region. Derive from the postal code or city+country when not explicitly given." },
          country: { type: "string", description: "Country (full name, e.g. 'United Kingdom'). Derive from the postal code or city when not explicitly given." },
          postalCode: { type: "string", description: "Postal/ZIP code. Derive it when the user gave a street-level address that maps to a known code (e.g. '10 Downing Street, London' → 'SW1A 2AA'). Only leave it blank when the location is just a bare city/country with no street detail — then the user will be asked." },
          contactName: { type: "string", description: "Primary contact person name — only if user provided it" },
          emailId: { type: "string", description: "Contact email address — only if user provided it" },
          mobileNo: { type: "string", description: "Contact phone/mobile number — only if user provided it" },
          designation: { type: "string", description: "Contact person's job title/designation" },
          licenseNo: { type: "string", description: "Business license number" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_onboard_vendor",
      description: "Execute the vendor onboarding after user confirms the prepared data. Creates the vendor in the system. Only call this AFTER prepare_onboard_vendor and user confirmation.",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string" },
          address: { type: "string" },
          legalEntityType: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          country: { type: "string" },
          postalCode: { type: "string" },
          contactName: { type: "string" },
          emailId: { type: "string" },
          mobileNo: { type: "string" },
          designation: { type: "string" },
          licenseNo: { type: "string" },
        },
        required: ["companyName", "address", "legalEntityType", "city", "country", "postalCode", "contactName", "emailId", "mobileNo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_invite_vendor",
      description: "Prepare to send a vendor invitation for exactly ONE supplier. For two or more suppliers, use prepare_bulk_invite_vendors instead. Returns a preview — does NOT send yet.",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string", description: "Company name to invite" },
          email: { type: "string", description: "Email address to send invitation to" },
        },
        required: ["companyName", "email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_invite_vendor",
      description: "Execute the vendor invitation after user confirms. Sends the invitation email. Only call AFTER prepare_invite_vendor and user confirmation.",
      parameters: {
        type: "object",
        properties: {
          companyName: { type: "string" },
          email: { type: "string" },
        },
        required: ["companyName", "email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_bulk_invite_vendors",
      description: "Prepare to send vendor invitations for TWO OR MORE suppliers in one request. Extract every company name and email pair from the user's message into the invites array. Returns a combined preview — does NOT send yet.",
      parameters: {
        type: "object",
        properties: {
          invites: {
            type: "array",
            description: "All suppliers to invite — one object per company+email pair from the user's message",
            items: {
              type: "object",
              properties: {
                companyName: { type: "string", description: "Company name to invite" },
                email: { type: "string", description: "Email address to send invitation to" },
              },
              required: ["companyName", "email"],
            },
            minItems: 2,
          },
        },
        required: ["invites"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_bulk_invite_vendors",
      description: "Execute bulk vendor invitations after user confirms. Sends one invitation email per entry. Only call AFTER prepare_bulk_invite_vendors and user confirmation.",
      parameters: {
        type: "object",
        properties: {
          invites: {
            type: "array",
            items: {
              type: "object",
              properties: {
                companyName: { type: "string" },
                email: { type: "string" },
              },
              required: ["companyName", "email"],
            },
            minItems: 2,
          },
        },
        required: ["invites"],
      },
    },
  },
];

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  type: "onboard" | "invite" | "bulk_invite" | "select_vendor";
  data: any;
  summary: string;
}

const onboardLocationLookup = {
  byPostalCode: (postalCode: string) => vendorRepo.lookupSupplierLocationByPostalCode(postalCode),
  byCityStateCountry: (city: string, state?: string, country?: string) =>
    vendorRepo.lookupSupplierPostalByLocation(city, state, country),
  byCityOnly: (city: string) => vendorRepo.lookupSupplierLocationsByCity(city),
};

interface VendorAgentResponse {
  response: string;
  pendingAction?: PendingAction;
  chart?: AgentChartSpec;
  /** Multiple bar charts (e.g. get_vendor_stats with groupBy "all"); prefer over `chart` in UI when present. */
  charts?: AgentChartSpec[];
}

function computeVendorRisk(vendor: any, opts: { docCount: number; expiredCount: number; contactCount: number; bankCount: number }): { riskScore: number; riskLevel: string; factors: string[] } {
  let riskScore = 0;
  const factors: string[] = [];

  if (opts.docCount === 0) { factors.push("No documents uploaded"); riskScore += 30; }
  if (opts.contactCount === 0) { factors.push("No contacts registered"); riskScore += 10; }
  if (opts.bankCount === 0) { factors.push("No bank details provided"); riskScore += 20; }
  if (!vendor.emailId && !vendor.email_id) { factors.push("Missing email address"); riskScore += 5; }
  if (!vendor.phone) { factors.push("Missing phone number"); riskScore += 5; }
  if (vendor.status === "Inactive" || vendor.status === "Blocked") { factors.push(`Vendor status is ${vendor.status}`); riskScore += 25; }
  if (opts.expiredCount > 0) { factors.push(`${opts.expiredCount} expired document(s)`); riskScore += 15; }
  if (factors.length === 0) { factors.push("No significant risk factors detected"); }

  const riskLevel = riskScore >= 50 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : "LOW";
  return { riskScore, riskLevel, factors };
}

interface SelectedVendorContext {
  supplierId: number;
  companyName: string;
  emailId?: string | null;
}

interface ToolExecutionContext {
  originalPrompt: string;
  selectedVendor?: SelectedVendorContext;
  onboardingFollowup?: boolean;
  blockVendorSelection?: boolean;
  comparisonIntent?: boolean;
}

function extractTaxIdentifierFromPrompt(prompt: string): string {
  const text = String(prompt || "").trim();
  if (!text) return "";

  const labeledMatch = text.match(
    /\b(?:gst(?:in)?|trn|vat|tax(?:\s+reg(?:istration)?)?(?:\s+no(?:\.)?)?)\s*[:#-]?\s*([A-Za-z0-9]{5,25})\b/i
  );
  if (labeledMatch?.[1]) return labeledMatch[1];

  return "";
}

function extractVendorPrefillFromPrompt(prompt: string): string {
  const text = String(prompt || "").trim();
  if (!text) return "";

  const taxId = extractTaxIdentifierFromPrompt(text);
  if (taxId) return taxId;

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch?.[0]) return emailMatch[0];

  const idMatch = text.match(/\b(?:vendor|supplier|company)\s*(?:id)?\s*[:#-]?\s*([A-Za-z0-9_-]{2,})\b/i);
  if (idMatch?.[1]) return idMatch[1];

  const trailingNameMatch = text.match(/\b(?:for|of|on)\s+([A-Za-z0-9&.\- ]{2,80})$/i);
  if (trailingNameMatch?.[1]) {
    const candidate = trailingNameMatch[1].trim().replace(/[?.!,;:]+$/, "");
    const generic = new Set(["vendor", "supplier", "company", "a vendor", "a supplier", "a company"]);
    if (!generic.has(candidate.toLowerCase())) return candidate;
  }

  return "";
}

async function resolveSupplierForAgent(hints: {
  supplierId?: unknown;
  vendorName?: string;
  prompt?: string;
  contextSupplierId?: number;
}): Promise<{ id: number; detail: any } | null> {
  const candidates: string[] = [];
  const prompt = String(hints.prompt || "");

  const suppInPrompt = prompt.match(/\bSUPP[-_]\d+\b/i)?.[0];
  if (suppInPrompt) candidates.push(suppInPrompt.toUpperCase());

  const prefill = extractVendorPrefillFromPrompt(prompt);
  if (prefill) candidates.push(prefill);

  if (hints.vendorName) candidates.push(String(hints.vendorName).trim());
  if (hints.supplierId != null && String(hints.supplierId).trim()) {
    candidates.push(String(hints.supplierId).trim());
  }
  if (hints.contextSupplierId != null && Number.isFinite(hints.contextSupplierId)) {
    candidates.push(String(hints.contextSupplierId));
  }

  const seen = new Set<string>();
  for (const raw of candidates) {
    const normalized = raw.trim();
    if (!normalized) continue;
    const dedupeKey = normalized.toUpperCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const direct = await vendorService.getDboSupplier(normalized);
    if (direct) return { id: Number((direct as any).id), detail: direct };

    const taxMatch = await storage.findDboSupplierByTaxIdentifier(normalized);
    if (taxMatch) return { id: Number((taxMatch as any).id), detail: taxMatch };

    if (/^\d+$/.test(normalized)) {
      for (const prefixed of [`SUPP_${normalized}`, `SUPP-${normalized}`]) {
        const prefixedMatch = await vendorService.getDboSupplier(prefixed);
        if (prefixedMatch) return { id: Number((prefixedMatch as any).id), detail: prefixedMatch };
      }
    }
  }

  return null;
}

function isLikelyOnboardingIntent(prompt: string): boolean {
  const p = String(prompt || "").trim().toLowerCase();
  if (!p) return false;

  const hasVendorEntity = /\b(vendor|supplier|company)\b/.test(p);
  const hasOnboardVerb = /\b(onboard|onboarding|register|registration|create|add)\b/.test(p);
  const hasInviteVerb = /\b(invite|invitation|send invite)\b/.test(p);
  const hasRiskOrLookupCue =
    /\b(risk|compliance|profile|details?|summary|information|search|find|lookup|stats|statistics|dashboard|metrics)\b/.test(p);
  const hasCreateProfileOnboardingCue =
    /\b(create|add|register|onboard)\s+(a\s+|new\s+)?(vendor|supplier|company)\s+profile\b/.test(p);

  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(p);
  const hasPhone = /(?:\+?\d[\d\s\-()]{7,}\d)/.test(p);
  const hasStructuredProfileSignals = /(legal entity|postal|postcode|zip|address|contact|mobile|phone)/.test(p);
  const hasRichOnboardingPayload = (hasEmail && hasPhone) || (hasEmail && hasStructuredProfileSignals);

  const decision =
    !hasInviteVerb &&
    ((hasOnboardVerb && hasVendorEntity && (!hasRiskOrLookupCue || hasCreateProfileOnboardingCue)) || (hasOnboardVerb && hasRichOnboardingPayload));
  return decision;
}

/** "vs" between status words or in how-many/count questions → portfolio stats, not compare_vendors (matches system prompt). */
function isLikelyStatsOrStatusVersusBreakdown(prompt: string): boolean {
  const p = String(prompt || "").trim().toLowerCase();
  if (!p) return false;
  if (/\b(how many|how much|count|counts|number of|total|totals|breakdown|split|distribution|proportion|ratio)\b/.test(p) && /\bvs\.?\b|\bversus\b/.test(p)) {
    return true;
  }
  return /\b(active|inactive|in\s*active|blocked|approved|draft|rejected|pending\s+approval)\s+vs\.?\s+(active|inactive|in\s*active|blocked|approved|draft|rejected|pending\s+approval)\b/.test(
    p,
  );
}

/** Matches "compare" plus common typos (e.g. "comapre"). */
const COMPARE_VERB_PATTERN = /\b(?:compare|comapre|compre|comparre|compaire)\b/i;

function normalizeComparePromptTypos(prompt: string): string {
  return String(prompt || "").replace(/\b(?:comapre|compre|comparre|compaire)\b/gi, "compare");
}

function isLikelyComparisonIntent(prompt: string): boolean {
  const p = normalizeComparePromptTypos(prompt).trim().toLowerCase();
  if (!p) return false;
  if (isLikelyStatsOrStatusVersusBreakdown(normalizeComparePromptTypos(prompt))) return false;
  return COMPARE_VERB_PATTERN.test(p) || /\b(comparison|vs\.?|versus)\b/.test(p);
}

interface VendorInviteEntry {
  companyName: string;
  email: string;
}

/** True when the user message lists two or more invite emails (bulk/batch invite). */
function isLikelyBulkInviteIntent(prompt: string): boolean {
  const p = String(prompt || "").trim();
  if (!p) return false;
  const hasInviteCue =
    /\b(invite|invitation|invitations|send\s+invit)\b/i.test(p) ||
    /\bonboarding\s+invitation/i.test(p);
  if (!hasInviteCue) return false;
  const emails = p.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return emails.length >= 2;
}

function normalizeInviteEntries(raw: unknown): VendorInviteEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const entries: VendorInviteEntry[] = [];
  for (const item of raw) {
    const companyName = String((item as any)?.companyName || "").trim();
    const email = String((item as any)?.email || (item as any)?.emailId || "").trim();
    if (!companyName && !email) continue;
    const key = `${companyName.toLowerCase()}|${email.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ companyName, email });
  }
  return entries;
}

async function validateVendorInviteEntry(
  entry: VendorInviteEntry,
  label: string,
  batchSeenEmails: Set<string>,
  batchSeenCompanies: Set<string>,
  options: { allowExistingInvitation?: boolean } = {},
): Promise<{ ok: true; normalized: VendorInviteEntry } | { ok: false; error: string }> {
  const companyName = entry.companyName.trim();
  const email = entry.email.trim();

  if (!companyName) {
    return { ok: false, error: `${label}: Please provide the supplier's company name.` };
  }
  if (!email) {
    return { ok: false, error: `${label}: Please provide an email address.` };
  }

  const emailCheck = validateOnboardEmail(email);
  if (!emailCheck.valid) {
    return { ok: false, error: `${label}: ${emailCheck.message}.` };
  }

  if (isPlaceholderFieldValue("companyName", companyName)) {
    return { ok: false, error: `${label}: Placeholder company names are not accepted.` };
  }

  const emailKey = email.toLowerCase();
  const companyKey = companyName.toLowerCase();
  if (batchSeenEmails.has(emailKey)) {
    return { ok: false, error: `${label}: Duplicate email **${email}** in this invitation request.` };
  }
  if (batchSeenCompanies.has(companyKey)) {
    return { ok: false, error: `${label}: Duplicate company name **${companyName}** in this invitation request.` };
  }
  batchSeenEmails.add(emailKey);
  batchSeenCompanies.add(companyKey);

  const activeSupplier = await vendorRepo.findActiveSupplierByEmail(email);
  if (activeSupplier) {
    return { ok: false, error: `${label}: ${vendorService.ACTIVE_SUPPLIER_EMAIL_EXISTS_MSG}` };
  }

  // A previously-invited supplier (existing pending invitation / non-active supplier record / same company name)
  // is only a soft duplicate — when the user explicitly asks to re-invite, allow it so the invitation is resent.
  // Hard blocks above (active supplier) and inside inviteSupplier (org user) still apply.
  if (!options.allowExistingInvitation) {
    const inviteEmailTaken = await vendorRepo.checkOnboardEmailExists(email);
    if (inviteEmailTaken) {
      return { ok: false, error: `${label}: A supplier or user account already exists with the email **${email}**.` };
    }
    const inviteCompanyTaken = await vendorRepo.checkOnboardCompanyExists(companyName);
    if (inviteCompanyTaken) {
      return {
        ok: false,
        error: `${label}: A supplier or pending invitation already exists with the company name **${companyName}**.`,
      };
    }
  }

  return { ok: true, normalized: { companyName, email } };
}

async function validateVendorInviteList(
  entries: VendorInviteEntry[],
): Promise<{ ok: true; normalized: VendorInviteEntry[] } | { ok: false; errors: string[] }> {
  const batchSeenEmails = new Set<string>();
  const batchSeenCompanies = new Set<string>();
  const normalized: VendorInviteEntry[] = [];
  const errors: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = entries.length > 1 ? `**${entry.companyName || `Supplier ${i + 1}`}**` : "Invitation";
    const result = await validateVendorInviteEntry(entry, label, batchSeenEmails, batchSeenCompanies);
    if (!result.ok) {
      errors.push(result.error);
    } else {
      normalized.push(result.normalized);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, normalized };
}

function buildBulkInvitePreview(invites: VendorInviteEntry[]): string {
  let summary = `## Vendor Invitation Preview\n\n`;
  summary += `**Total invitations:** ${invites.length}\n\n`;
  invites.forEach((invite, index) => {
    summary += `**${index + 1}. ${invite.companyName}**\n`;
    summary += `- Email: ${invite.email}\n\n`;
  });
  summary += `**Action:** Send vendor registration invitations to all ${invites.length} suppliers listed above\n`;
  return summary;
}

/** Strip internal "bulk" wording from user-visible invitation messages (LLM or legacy tool text). */
function polishVendorInvitationUserText(text: string): string {
  if (!text) return text;
  return text
    .replace(/##\s*Bulk Vendor Invitation Preview/gi, "## Vendor Invitation Preview")
    .replace(/##\s*Bulk Invitation Results/gi, "## Vendor Invitation Results")
    .replace(/\bbulk vendor invitations?\b/gi, (match) =>
      /\binvitations\b/i.test(match) ? "vendor invitations" : "vendor invitation",
    )
    .replace(/\bbulk invitations?\b/gi, (match) =>
      /\binvitations\b/i.test(match) ? "vendor invitations" : "vendor invitation",
    );
}

function vendorAgentResponse(
  response: string,
  extras?: Omit<VendorAgentResponse, "response">,
): VendorAgentResponse {
  return { response: polishVendorInvitationUserText(response), ...extras };
}

function appendCollectedInvite(collected: VendorInviteEntry[], entry: VendorInviteEntry): void {
  const companyName = String(entry.companyName || "").trim();
  const email = String(entry.email || "").trim();
  if (!companyName || !email) return;
  const key = `${companyName.toLowerCase()}|${email.toLowerCase()}`;
  if (collected.some((i) => `${i.companyName.toLowerCase()}|${i.email.toLowerCase()}` === key)) return;
  collected.push({ companyName, email });
}

async function buildBulkInvitePendingAction(
  collectedInvites: VendorInviteEntry[],
): Promise<PendingAction | undefined> {
  if (collectedInvites.length < 2) return undefined;
  const validation = await validateVendorInviteList(collectedInvites);
  if (!validation.ok) return undefined;
  return {
    type: "bulk_invite",
    data: { invites: validation.normalized },
    summary: `Send ${validation.normalized.length} vendor registration invitations`,
  };
}

interface SupplierOnboardingDateFilter {
  startDate?: Date;
  endDate?: Date;
  label: string;
}

type SupplierDateFilterKind = "onboarding" | "incorporation";

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseToolDate(value: unknown, boundary: "start" | "end"): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1]);
    const month = Number(isoDateOnly[2]) - 1;
    const day = Number(isoDateOnly[3]);
    const local = new Date(year, month, day);
    if (local.getFullYear() !== year || local.getMonth() !== month || local.getDate() !== day) return null;
    return boundary === "start" ? startOfLocalDay(local) : endOfLocalDay(local);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return boundary === "start" ? startOfLocalDay(parsed) : endOfLocalDay(parsed);
}

const MIN_DOC_REFERENCE_YEAR = 1900;
const MAX_DOC_REFERENCE_YEAR = 2100;

function isPlausibleDocumentReferenceYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_DOC_REFERENCE_YEAR && year <= MAX_DOC_REFERENCE_YEAR;
}

function extractDateLikeTokensFromPrompt(prompt: string): string[] {
  const tokens = new Set<string>();
  const patterns = [
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{1,4})\b/g,
    /\b(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(prompt)) !== null) {
      tokens.add(match[1]);
    }
  }
  return Array.from(tokens);
}

function buildLocalDateFromParts(year: number, monthIndex: number, day: number): Date | null {
  if (!isPlausibleDocumentReferenceYear(year)) return null;
  const local = new Date(year, monthIndex, day);
  if (local.getFullYear() !== year || local.getMonth() !== monthIndex || local.getDate() !== day) return null;
  return startOfLocalDay(local);
}

function parseUserDocumentReferenceDate(raw: string): Date | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  const yearFirst = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yearFirst) {
    return buildLocalDateFromParts(
      Number(yearFirst[1]),
      Number(yearFirst[2]) - 1,
      Number(yearFirst[3]),
    );
  }

  const monthFirst = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{1,4})$/);
  if (monthFirst) {
    const part1 = Number(monthFirst[1]);
    const part2 = Number(monthFirst[2]);
    const yearStr = monthFirst[3];
    if (yearStr.length !== 4) return null;
    const year = Number(yearStr);
    let month: number;
    let day: number;
    if (part1 > 12 && part2 <= 12) {
      day = part1;
      month = part2 - 1;
    } else {
      month = part1 - 1;
      day = part2;
    }
    return buildLocalDateFromParts(year, month, day);
  }

  return null;
}

function formatDocumentAsOfLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

type DocumentSearchDateResolution =
  | { ok: true; asOfDate: Date; label: string }
  | { ok: false; error: string };

function invalidDocumentDateMessage(token: string): string {
  return `The date "${token}" is not valid. Please provide a valid date with a 4-digit year (e.g. 2026-07-19, 2026/07/19, or 07/19/2026).`;
}

function resolveDocumentSearchAsOfDate(args: any, prompt: string): DocumentSearchDateResolution {
  const userLabel = String(args?.userDateLabel || "").trim();
  const argRaw = String(args?.asOfDate || "").trim();
  const promptTokens = extractDateLikeTokensFromPrompt(prompt);

  if (argRaw) {
    const parsed = parseUserDocumentReferenceDate(argRaw);
    if (!parsed) {
      return { ok: false, error: invalidDocumentDateMessage(argRaw) };
    }
    return { ok: true, asOfDate: parsed, label: userLabel || formatDocumentAsOfLabel(parsed) };
  }

  for (const token of promptTokens) {
    const parsed = parseUserDocumentReferenceDate(token);
    if (!parsed) {
      return { ok: false, error: invalidDocumentDateMessage(token) };
    }
    return { ok: true, asOfDate: parsed, label: userLabel || formatDocumentAsOfLabel(parsed) };
  }

  if (userLabel && /\d/.test(userLabel)) {
    return { ok: false, error: invalidDocumentDateMessage(userLabel) };
  }

  return { ok: true, asOfDate: startOfLocalDay(new Date()), label: "today" };
}

function formatDateRangeLabel(startDate?: Date, endDate?: Date): string {
  const format = (date: Date) => date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  if (startDate && endDate) {
    if (startDate.toDateString() === endDate.toDateString()) return `on ${format(startDate)}`;
    return `from ${format(startDate)} to ${format(endDate)}`;
  }
  if (startDate) return `from ${format(startDate)}`;
  if (endDate) return `until ${format(endDate)}`;
  return "in the selected date range";
}

function buildSupplierOnboardingDateFilterFromArgs(args: any): SupplierOnboardingDateFilter | null {
  const startDate = parseToolDate(args?.incorporationFrom ?? args?.onboardedFrom, "start") ?? undefined;
  const endDate = parseToolDate(args?.incorporationTo ?? args?.onboardedTo, "end") ?? undefined;
  if (!startDate && !endDate) return null;

  const normalizedStart = startDate && endDate && startDate.getTime() > endDate.getTime()
    ? endDate
    : startDate;
  const normalizedEnd = startDate && endDate && startDate.getTime() > endDate.getTime()
    ? startDate
    : endDate;
  const label = String(args?.onboardingDateLabel || "").trim() || formatDateRangeLabel(normalizedStart, normalizedEnd);

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
    label,
  };
}

function matchesSupplierOnboardingDateFilter(value: unknown, filter: SupplierOnboardingDateFilter): boolean {
  if (!value) return false;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return false;

  if (filter.startDate && date.getTime() < filter.startDate.getTime()) return false;
  if (filter.endDate && date.getTime() > filter.endDate.getTime()) return false;
  return true;
}

function isSupplierIncorporationDateIntent(prompt: string, args: any): boolean {
  const text = [
    prompt,
    args?.dateField,
    args?.dateFilterType,
    args?.incorporationFrom,
    args?.incorporationTo,
  ].filter(Boolean).join(" ").toLowerCase();

  return /\b(incorporation|incorporated|established|establishment|business\s+trading|bus[_\s-]?trading|company\s+start|start\s+date)\b/.test(text);
}

function getSupplierIncorporationDateValue(supplier: any): unknown {
  return supplier?.startDate || supplier?.busTradingDate || null;
}

function formatOnboardingDateWindow(filter: SupplierOnboardingDateFilter): string {
  if (filter.label === "today" || filter.label === "yesterday") return filter.label;
  if (filter.label.startsWith("on ") || filter.label.startsWith("from ") || filter.label.startsWith("until ")) return filter.label;
  if (filter.startDate && filter.endDate && filter.startDate.toDateString() === filter.endDate.toDateString()) {
    return `on ${filter.label}`;
  }
  return `in ${filter.label}`;
}

async function getAllDboSuppliersForAgent(status?: string, search?: string): Promise<any[]> {
  const allSuppliers: any[] = [];
  let page = 1;
  while (true) {
    const result = await vendorService.getDboSuppliersPaginated({
      page,
      limit: 500,
      status: status === "all" ? undefined : status,
      search: search || undefined,
    });
    const data = (result as any).data || [];
    allSuppliers.push(...data);
    if (data.length < 500) break;
    page++;
  }
  return allSuppliers;
}

/**
 * Render every bank account for a supplier as line-separated blocks (no tables),
 * matching the RESPONSE FORMATTING rules. Returns "" when there are no accounts.
 */
function formatBankAccountsBlock(banks: any[]): string {
  if (!banks?.length) return "";
  let out = "";
  banks.forEach((b: any, bi: number) => {
    out += `**${bi + 1}. ${b.bankName || "N/A"}**\n`;
    if (b.accountNo) out += `   Account Number: ${b.accountNo}\n`;
    if (b.branchName) out += `   Branch Name: ${b.branchName}\n`;
    if (b.bankAccountType) out += `   Account Type: ${b.bankAccountType}\n`;
    if (b.currency) out += `   Currency: ${b.currency}\n`;
    if (b.ifsccode) out += `   IFSC Code: ${b.ifsccode}\n`;
    if (b.swiftCode) out += `   SWIFT Code: ${b.swiftCode}\n`;
    if (b.ibanNo) out += `   IBAN: ${b.ibanNo}\n`;
    if (b.abaRouting) out += `   ABA Routing: ${b.abaRouting}\n`;
    if (b.beneficiaryName) out += `   Beneficiary Name: ${b.beneficiaryName}\n`;
    if (b.beneficiaryAddress) out += `   Beneficiary Address: ${b.beneficiaryAddress}\n`;
    if (b.bankAddress) out += `   Bank Address: ${b.bankAddress}\n`;
    if (b.street) out += `   Street: ${b.street}\n`;
    if (b.city || b.region || b.country || b.postalCode) {
      const locationParts = [b.city, b.region, b.country, b.postalCode].filter(Boolean);
      out += `   Location: ${locationParts.join(", ")}\n`;
    }
    if (b.primaryAccount) out += `   Primary: ${b.primaryAccount}\n`;
  });
  return out;
}

function formatSupplierOnboardingDateResult(
  dateFilter: SupplierOnboardingDateFilter,
  suppliers: any[],
  kind: SupplierDateFilterKind = "onboarding",
): string {
  const windowLabel = formatOnboardingDateWindow(dateFilter);
  const noun = kind === "incorporation" ? "incorporation date" : "onboarding date";
  const verb = kind === "incorporation" ? "have incorporation date" : "were onboarded";
  if (suppliers.length === 0) {
    return `No suppliers ${verb} ${windowLabel}.`;
  }

  const formatted = suppliers.map((s: any, idx: number) => {
    let entry = `**${idx + 1}. ${s.companyName || "N/A"}** (ID: ${s.id})\n`;
    if (s.supplierId) entry += `   Supplier ID: ${s.supplierId}\n`;
    if (s.status) entry += `   Status: ${s.status}\n`;
    if (kind === "incorporation") {
      const incorporationDate = getSupplierIncorporationDateValue(s);
      if (incorporationDate) entry += `   Incorporation Date: ${new Date(incorporationDate as any).toLocaleDateString()}\n`;
    } else if (s.creationDate) {
      entry += `   Onboarded: ${new Date(s.creationDate).toLocaleString()}\n`;
    }
    if (s.city || s.country) entry += `   Location: ${[s.city, s.state, s.country].filter(Boolean).join(", ")}\n`;
    return entry;
  }).join("\n");

  return `Suppliers whose ${noun} is ${windowLabel}: ${suppliers.length}\n\n${formatted}`;
}

interface VendorAgentNoToolsIntentRouterResult {
  forceGetVendorStats: boolean;
  needsVendorSelection: boolean;
}

/**
 * When the main completion returned no tool_calls, route follow-up intent with a small LLM pass
 * (replaces English-only regex for stats refresh). Multilingual; safe defaults on failure.
 */
async function runVendorAgentNoToolsIntentRouter(
  openai: OpenAI,
  modelName: string,
  prompt: string,
  opts: { conversationOngoing: boolean },
): Promise<VendorAgentNoToolsIntentRouterResult> {
  const defaultResult: VendorAgentNoToolsIntentRouterResult = {
    forceGetVendorStats: false,
    needsVendorSelection: false,
  };
  try {
    const decisionCompletion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: `You are an intent router for a vendor/supplier AI assistant. Return strict JSON only with keys:
- forceGetVendorStats (boolean): true ONLY if conversationOngoing is true AND the user wants aggregate statistics, counts, breakdowns, distribution, dashboard-style metrics, or high-level "by country/city/status" summaries that a statistics tool would answer—not a row-by-row vendor directory or detailed list of vendor records. false for: listing/showing specific vendors with full details, search results as records, one vendor's profile/risk/compliance, compare vendors, onboard/invite, document queries.
- needsVendorSelection (boolean): true ONLY when the user asks for one specific vendor/company's risk, details, compliance, profile, or summary but does not give a usable company name, email, or supplier ID. false for portfolio/all vendors, stats, lists, compare, onboarding. false when the user only asks for AI supplier/vendor performance rank and already gives a supplier ID or identifiable supplier name.
Judge intent in any language (e.g. Hindi, Tamil, Arabic); do not rely on English keywords. If ambiguous, use false for both.`,
        },
        {
          role: "user",
          content: `conversationOngoing: ${opts.conversationOngoing ? "true" : "false"}

User message:
${String(prompt || "")}`,
        },
      ],
      temperature: 0,
      max_tokens: 120,
      response_format: { type: "json_object" } as any,
    });
    const raw = decisionCompletion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return {
      forceGetVendorStats: !!parsed?.forceGetVendorStats,
      needsVendorSelection: !!parsed?.needsVendorSelection,
    };
  } catch {
    return defaultResult;
  }
}

type ComparisonMetricKey =
  | "id"
  | "overallScore"
  | "aiVendorRank"
  | "legalEntity"
  | "location"
  | "email"
  | "phone"
  | "turnover"
  | "employees"
  | "documents"
  | "contacts"
  | "bankAccounts"
  | "riskLevel";

const COMPARISON_METRIC_LABELS: Record<ComparisonMetricKey, string> = {
  id: "ID",
  overallScore: "Overall Score",
  aiVendorRank: "AI Vendor Rank",
  legalEntity: "Legal Entity",
  location: "Location",
  email: "Email",
  phone: "Phone",
  turnover: "Turnover",
  employees: "Employees",
  documents: "Documents",
  contacts: "Contacts",
  bankAccounts: "Bank Accounts",
  riskLevel: "Risk Level",
};

const ALL_COMPARISON_METRIC_KEYS: ComparisonMetricKey[] = [
  "id",
  "overallScore",
  "aiVendorRank",
  "legalEntity",
  "location",
  "email",
  "phone",
  "turnover",
  "employees",
  "documents",
  "contacts",
  "bankAccounts",
  "riskLevel",
];

const COMPARISON_METRIC_ALIASES: { pattern: RegExp; keys: ComparisonMetricKey[] }[] = [
  { pattern: /\b(ai\s*)?(vendor|supplier)\s*rank(s|ing)?\b|\brank\b/i, keys: ["aiVendorRank"] },
  { pattern: /\boverall\s*(score|rating|performance)\b|\bperformance\s*score\b/i, keys: ["overallScore"] },
  { pattern: /\brisk\s*(score|level|assessment|rating)\b|\brisk\b/i, keys: ["riskLevel"] },
  { pattern: /\blegal\s*entity\b|\bentity\s*type\b/i, keys: ["legalEntity"] },
  { pattern: /\blocation\b|\bcity\b|\bcountry\b|\baddress\b|\bregion\b/i, keys: ["location"] },
  { pattern: /\bturnover\b|\brevenue\b|\bannual\s*turnover\b/i, keys: ["turnover"] },
  { pattern: /\bemployees?\b|\bheadcount\b|\bworkforce\b|\bstaff\b/i, keys: ["employees"] },
  { pattern: /\bdocument(s|ation)?\b|\bcertification(s)?\b/i, keys: ["documents"] },
  { pattern: /\bcontact(s)?\b/i, keys: ["contacts"] },
  { pattern: /\bbank(ing)?(\s*account(s)?)?\b/i, keys: ["bankAccounts"] },
  { pattern: /\bemail\b|\be-mail\b/i, keys: ["email"] },
  { pattern: /\bphone\b|\bmobile\b|\btelephone\b/i, keys: ["phone"] },
];

const COMPARISON_METRIC_INPUT_MAP = new Map<string, ComparisonMetricKey>(
  ALL_COMPARISON_METRIC_KEYS.flatMap((key) => [
    [key.toLowerCase(), key],
    [COMPARISON_METRIC_LABELS[key].toLowerCase(), key],
  ]),
);

function resolveComparisonMetricsFromPhrase(phrase: string): ComparisonMetricKey[] | null {
  const normalized = String(phrase || "")
    .replace(/[(){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  const matched = new Set<ComparisonMetricKey>();
  for (const { pattern, keys } of COMPARISON_METRIC_ALIASES) {
    if (pattern.test(normalized)) {
      keys.forEach((key) => matched.add(key));
    }
  }
  return matched.size > 0 ? Array.from(matched) : null;
}

function normalizeComparisonMetrics(raw: unknown): ComparisonMetricKey[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const resolved = new Set<ComparisonMetricKey>();
  for (const item of raw) {
    const key = COMPARISON_METRIC_INPUT_MAP.get(String(item || "").trim().toLowerCase());
    if (key && key !== "id") resolved.add(key);
  }
  return resolved.size > 0 ? Array.from(resolved) : null;
}

function extractComparisonMetricsFromPrompt(prompt: string): ComparisonMetricKey[] | null {
  const text = normalizeComparePromptTypos(prompt).trim();
  if (!text) return null;

  const metricOfMatch = text.match(
    new RegExp(`${COMPARE_VERB_PATTERN.source}(?:\\s+the)?\\s+(?:\\(\\s*)?(.+?)(?:\\s*\\))?\\s+of\\b`, "i"),
  );
  if (metricOfMatch?.[1]) {
    const fromPhrase = resolveComparisonMetricsFromPhrase(metricOfMatch[1]);
    if (fromPhrase) return fromPhrase;
  }

  const onMetricMatch = text.match(
    new RegExp(`${COMPARE_VERB_PATTERN.source}.+?\\bon\\s+(.+?)(?:\\s+(?:for|between)\\b|$)`, "i"),
  );
  if (onMetricMatch?.[1]) {
    const fromPhrase = resolveComparisonMetricsFromPhrase(onMetricMatch[1]);
    if (fromPhrase) return fromPhrase;
  }

  return null;
}

function stripComparisonMetricPrefix(text: string): string {
  return normalizeComparePromptTypos(text)
    .replace(
      new RegExp(`${COMPARE_VERB_PATTERN.source}(?:\\s+the)?\\s+(?:\\(\\s*)?.+?(?:\\s*\\))?\\s+of\\b`, "i"),
      "",
    )
    .trim();
}

function pickBestSupplierSearchMatch(searchTerm: string, candidates: any[]): any | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const term = String(searchTerm || "").replace(/^@+/, "").trim();
  const termLower = term.toLowerCase();
  if (!termLower) return candidates[0];

  const exactName = candidates.find(
    (s) => String(s.companyName || "").trim().toLowerCase() === termLower,
  );
  if (exactName) return exactName;

  const exactIdentifier = candidates.find((s) => {
    const identifiers = [s.taxRegNo, s.panNo, s.licenseNo, s.taxPayerId, s.supplierId, s.id]
      .map((v) => String(v || "").trim().toLowerCase())
      .filter(Boolean);
    return identifiers.some((value) => value === termLower);
  });
  if (exactIdentifier) return exactIdentifier;

  if (/^\d+$/.test(term)) {
    const exactId = candidates.find((s) => String(s.id) === term);
    if (exactId) return exactId;
  }

  const startsWithName = candidates.find((s) =>
    String(s.companyName || "").trim().toLowerCase().startsWith(termLower),
  );
  if (startsWithName) return startsWithName;

  return candidates[0];
}

function overallScorePercentFromRankRow(row: SupplierAiRankRow | undefined): number | null {
  if (!row) return null;
  const raw = Number(row.overallScore);
  if (!Number.isFinite(raw)) return null;
  if (raw <= 1) return Math.round(Math.max(0, Math.min(1, raw)) * 100);
  return Math.round(Math.max(0, Math.min(100, raw)));
}

type ComparisonFetchPlan = {
  contacts: boolean;
  banks: boolean;
  documents: boolean;
  services: boolean;
  needAiRanks: boolean;
  needFullAiAnalysis: boolean;
};

function buildComparisonFetchPlan(metrics: ComparisonMetricKey[]): ComparisonFetchPlan {
  const profileMetricCount = ALL_COMPARISON_METRIC_KEYS.filter((k) => k !== "id").length;
  if (metrics.length >= profileMetricCount) {
    return {
      contacts: true,
      banks: true,
      documents: true,
      services: true,
      needAiRanks: true,
      needFullAiAnalysis: true,
    };
  }

  const plan: ComparisonFetchPlan = {
    contacts: false,
    banks: false,
    documents: false,
    services: false,
    needAiRanks: false,
    needFullAiAnalysis: false,
  };

  for (const m of metrics) {
    switch (m) {
      case "overallScore":
        plan.needAiRanks = true;
        plan.needFullAiAnalysis = true;
        break;
      case "aiVendorRank":
        plan.needAiRanks = true;
        break;
      case "riskLevel":
        plan.contacts = true;
        plan.banks = true;
        plan.documents = true;
        break;
      case "documents":
        plan.documents = true;
        break;
      case "contacts":
        plan.contacts = true;
        break;
      case "bankAccounts":
        plan.banks = true;
        break;
      default:
        break;
    }
  }
  return plan;
}

async function buildCompareVendorSection(
  index: number,
  supplierId: number,
  plan: ComparisonFetchPlan,
  metricsToInclude: ComparisonMetricKey[],
  includeId: boolean,
  aiRanks: { enabled: boolean; byId: Map<string, SupplierAiRankRow> },
): Promise<string | null> {
  const supplier = await vendorService.getDboSupplier(supplierId);
  if (!supplier) {
    return `**Vendor ${index}:** Not found (ID: ${supplierId})\n\n`;
  }
  const s = supplier as any;
  if (String(s.status || "").toLowerCase() !== "active") return null;

  let contacts: any[] = [];
  let banks: any[] = [];
  let documents: any[] = [];
  let services: any[] = [];

  const relatedFetches: Promise<void>[] = [];
  if (plan.contacts) {
    relatedFetches.push(
      vendorService.getDboSupplierContacts(supplierId).then((r) => {
        contacts = r as any[];
      }),
    );
  }
  if (plan.banks) {
    relatedFetches.push(
      vendorService.getDboSupplierBanks(supplierId).then((r) => {
        banks = r as any[];
      }),
    );
  }
  if (plan.documents) {
    relatedFetches.push(
      vendorService.getDboSupplierDocuments(supplierId).then((r) => {
        documents = r as any[];
      }),
    );
  }
  if (plan.services) {
    relatedFetches.push(
      vendorService.getDboSupplierServices(supplierId).then((r) => {
        services = r as any[];
      }),
    );
  }
  if (relatedFetches.length > 0) await Promise.all(relatedFetches);

  let aiOverall: number | null = null;
  if (metricsToInclude.includes("overallScore")) {
    aiOverall = overallScorePercentFromRankRow(aiRanks.byId.get(String(s.id)));
    if (aiOverall == null && plan.needFullAiAnalysis) {
      if (!plan.contacts) contacts = (await vendorService.getDboSupplierContacts(supplierId)) as any[];
      if (!plan.banks) banks = (await vendorService.getDboSupplierBanks(supplierId)) as any[];
      if (!plan.documents) documents = (await vendorService.getDboSupplierDocuments(supplierId)) as any[];
      if (!plan.services) services = (await vendorService.getDboSupplierServices(supplierId)) as any[];
      aiOverall = await computeVendorAiOverallScore(s, contacts, banks, documents, services);
    }
  }

  let riskScore = 0;
  if (!documents || documents.length === 0) riskScore += 30;
  if (!contacts || contacts.length === 0) riskScore += 10;
  if (!banks || banks.length === 0) riskScore += 20;
  if (!s.emailId) riskScore += 5;
  if (!s.phone) riskScore += 5;
  const riskLevel = riskScore >= 50 ? "HIGH" : riskScore >= 25 ? "MEDIUM" : "LOW";

  const metricValues: Record<ComparisonMetricKey, string> = {
    id: String(s.id),
    overallScore: aiOverall != null ? `${aiOverall}%` : "N/A",
    aiVendorRank: (() => {
      if (!aiRanks.enabled) return "N/A";
      const row = aiRanks.byId.get(String(s.id));
      return row ? `#${row.rank}` : "N/A";
    })(),
    legalEntity: s.legalEntityType || "N/A",
    location: [s.city, s.state, s.country].filter(Boolean).join(", ") || "N/A",
    email: s.emailId || "Missing",
    phone: s.phone || "Missing",
    turnover: s.annualTurnOver ? `${s.turnOverCurrency || ""} ${s.annualTurnOver}`.trim() : "N/A",
    employees: s.noOfEmployees ? String(s.noOfEmployees) : "N/A",
    documents: String(documents?.length || 0),
    contacts: String(contacts?.length || 0),
    bankAccounts: String(banks?.length || 0),
    riskLevel: `${riskLevel} (Score: ${riskScore}/100)`,
  };

  let section = `### ${index}. ${s.companyName || "N/A"} (ID: ${s.id})\n`;
  if (includeId && metricsToInclude.includes("id")) {
    section += `**${COMPARISON_METRIC_LABELS.id}:** ${metricValues.id}\n`;
  }
  for (const key of metricsToInclude) {
    if (key === "id") continue;
    section += `**${COMPARISON_METRIC_LABELS[key]}:** ${metricValues[key]}\n`;
  }
  section += "\n";
  return section;
}

async function resolveSupplierIdForComparison(name: string, status = "Active"): Promise<number | null> {
  const cleaned = String(name || "").replace(/^@+/, "").trim();
  if (!cleaned) return null;

  const direct = await vendorService.getDboSupplier(cleaned);
  if (direct && String((direct as any).status || "").toLowerCase() === status.toLowerCase()) {
    return Number((direct as any).id);
  }

  const found = await storage.searchDboSuppliersForAgent({ query: cleaned, limit: 10 });
  if (found.length === 0) return null;

  const cleanedLower = cleaned.toLowerCase();
  const exactName = found.find(
    (row) => String(row.companyName || "").trim().toLowerCase() === cleanedLower,
  );
  return Number((exactName ?? found[0]).id);
}

function extractVendorNamesFromComparisonPrompt(prompt: string): string[] {
  const text = stripComparisonMetricPrefix(
    normalizeComparePromptTypos(String(prompt || "")).replace(/\s+/g, " ").trim(),
  );
  if (!text) return [];

  const candidates: string[] = [];
  const seen = new Set<string>();

  const addName = (raw: string) => {
    const cleaned = raw
      .replace(/^[`"'\s]+|[`"'\s]+$/g, "")
      .replace(/\b(vendor|supplier|company|vendors|suppliers|companies)\b/gi, "")
      .replace(/\b(and|with|vs\.?|versus|compare|comparison|between|to|of)\b/gi, "")
      .replace(/[(),:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || cleaned.length < 2) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(cleaned);
  };

  const doubleParenMatches = Array.from(text.matchAll(/\(\(\s*([^)]+?)\s*\)\)/g)).map((m) => m[1].trim());
  if (doubleParenMatches.length >= 2) {
    for (const match of doubleParenMatches) addName(match);
    if (candidates.length >= 2) return candidates;
  }

  if (/\band\b/i.test(text)) {
    text.split(/\s+\band\b\s+/i).forEach(addName);
    if (candidates.length >= 2) return candidates;
  }

  // Check for double curly braces first
  const curlyMatches = Array.from(text.matchAll(/\{\{(.*?)\}\}/g)).map(m => m[1].trim());
  if (curlyMatches.length >= 2) {
    for (const match of curlyMatches) {
      const cleaned = match.replace(/^[`"'\s]+|[`"'\s]+$/g, "").trim();
      if (cleaned && cleaned.length >= 2) {
        const key = cleaned.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(cleaned);
        }
      }
    }
    if (candidates.length >= 2) return candidates;
  }

  const betweenMatch = text.match(/\b(?:compare|comparison)\b.*?\bbetween\b(.+)/i);
  if (betweenMatch?.[1]) {
    betweenMatch[1].split(/\s*(?:,|&|\band\b)\s*/i).forEach(addName);
  }

  const compareWithMatch = text.match(/\bcompare\b(.+?)\bwith\b(.+)/i);
  if (compareWithMatch) {
    addName(compareWithMatch[1]);
    compareWithMatch[2].split(/\s*(?:,|&|\band\b)\s*/i).forEach(addName);
  }

  const vsMatch = text.match(/(.+?)\b(?:vs\.?|versus)\b(.+)/i);
  if (vsMatch) {
    addName(vsMatch[1]);
    vsMatch[2].split(/\s*(?:,|&|\band\b)\s*/i).forEach(addName);
  }

  if (candidates.length < 2) {
    const compareTail = text.match(/\bcompare\b\s+(.+)/i)?.[1]?.trim();
    if (compareTail) {
      if (/\band\b/i.test(compareTail)) {
        compareTail.split(/\s+\band\b\s+/i).forEach(addName);
      } else if (/,/.test(compareTail)) {
        compareTail.split(/\s*,\s*/).forEach(addName);
      } else {
        addName(compareTail);
      }
    }
  }

  if (candidates.length < 2) {
    const comparisonOfMatch = text.match(/\bcomparison\b\s+of\s+(.+)/i)?.[1]?.trim();
    if (comparisonOfMatch) {
      if (/\band\b/i.test(comparisonOfMatch)) {
        comparisonOfMatch.split(/\s+\band\b\s+/i).forEach(addName);
      } else if (/,/.test(comparisonOfMatch)) {
        comparisonOfMatch.split(/\s*,\s*/).forEach(addName);
      } else {
        addName(comparisonOfMatch);
      }
    }
  }

  if (candidates.length >= 2) return candidates;

  const quoted = Array.from(text.matchAll(/["'`]([^"'`]{2,80})["'`]/g)).map((m) => m[1]);
  quoted.forEach(addName);
  return candidates;
}

const LEGAL_ENTITY_TYPES = [
  "Proprietor",
  "Partner",
  "LLP",
  "Private",
  "Public",
  "Government",
  "Trust",
  "Society",
  "Cooperative",
  "Other",
] as const;

function isLikelyOnboardingFollowup(prompt: string, conversationHistory: ConversationMessage[] = []): boolean {
  const userText = String(prompt || "").trim();
  if (!userText) return false;

  const lastAssistantMessage = [...conversationHistory]
    .reverse()
    .find((msg) => msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim().length > 0)?.content || "";
  if (!lastAssistantMessage) return false;

  const assistantText = lastAssistantMessage.toLowerCase();
  const asksForOnboardingField =
    /\bonboarding\b/.test(assistantText) &&
    /\b(please|provide|specify|missing|mandatory|required|details?)\b/.test(assistantText);
  const asksForLegalEntity = /\blegal entity\b/.test(assistantText);
  if (!asksForOnboardingField && !asksForLegalEntity) return false;

  const normalizedReply = userText.toLowerCase().replace(/[.\s]+/g, "");
  const isLegalEntityValue = LEGAL_ENTITY_TYPES.some(
    (entity) => entity.toLowerCase().replace(/\s+/g, "") === normalizedReply
  );

  return isLegalEntityValue;
}

function hasRecentOnboardingContext(conversationHistory: ConversationMessage[] = []): boolean {
  const recentMessages = conversationHistory.slice(-6);
  if (recentMessages.length === 0) return false;

  return recentMessages.some((msg) => {
    const text = String(msg.content || "").toLowerCase();
    if (!text) return false;
    if (msg.role === "user") {
      return /\b(onboard|onboarding|register|registration|add\s+(new\s+)?(supplier|vendor|company)|create\s+(vendor|supplier|company))\b/.test(text);
    }
    return (
      /\b(vendor onboarding|onboarding details|onboarding preview)\b/.test(text) ||
      /\b(legal entity|mandatory fields?|missing fields?|provide the legal entity)\b/.test(text)
    );
  });
}

/* Vendor selection has been intentionally disabled.
When the model returns plain text with no tool calls, still open the vendor picker for obvious single-vendor intents.
function shouldInjectVendorSelectionOnNoTools(userPrompt: string): boolean {
  const p = String(userPrompt || "").trim().toLowerCase();
  if (!p) return false;

  if (/\b(all|every|each)\s+vendors?\b/.test(p)) return false;
  if (/\b(all|every)\s+suppliers?\b/.test(p)) return false;
  if (/\bportfolio\b|\bacross\s+(all\s+)?(vendors?|suppliers?)\b/.test(p)) return false;
  if (/\b(high(est)?|low(est)?)\s*risk\s+vendors?\b|\brank\s+vendors?\b|\bvendors?\s+with\s+(the\s+)?highest\b/.test(p)) return false;
  if (/\b(vendor|supplier)\s+stats|statistics|dashboard|metrics\b/.test(p)) return false;
  if (/\bhow\s+many\s+(vendors?|suppliers?)\b/.test(p)) return false;
  if (/\bcompare\s+(two|2|three|3|\d+)\s+vendors?\b/.test(p)) return false;

  const singleVendorCue =
    /\bvendor\s+(summary|profile|details?|information|risk|compliance)\b/.test(p) ||
    /\b(summary|profile|details?|information)\s+for\s+(a|the|my|one)\s+(vendor|supplier|company)\b/.test(p) ||
    /\b(summary|profile|details?)\s+of\s+(a|the|my|one)\s+(vendor|supplier|company)\b/.test(p) ||
    /\brisk\s+(summary|assessment|check|report)\s+for\s+(a|the|my|one)\s+(vendor|supplier|company)\b/.test(p) ||
    /\bcompliance\s+(status|check|report)?\s*(for|of)\s+(a|the|my|one)\s+(vendor|supplier|company)\b/.test(p) ||
    /\binformation\s+about\s+(a|the|my|one)\s+(vendor|supplier|company)\b/.test(p) ||
    /\b(run|perform|do)\s+a\s+risk\s+check\s+on\s+(a|the|my|one)\s+(vendor|supplier|company)\b/.test(p);

  return singleVendorCue;
}
*/
function shouldInjectVendorSelectionOnNoTools(_userPrompt: string): boolean {
  return false;
}

/**
 * User is mainly asking for KPI / ranking-engine rank or performance score for one supplier,
 * not a full risk assessment or full profile. Drives tool redirect and concise get_vendor_details.
 */
function isPrimarilyAiSupplierRankQuery(prompt: string): boolean {
  const p = String(prompt || "").trim().toLowerCase();
  if (!p) return false;

  if (/\brank\s+vendors?\b/.test(p)) return false;
  if (/\b(all|every|each)\s+(vendors?|suppliers?)\b.*\brank(ing)?\b/.test(p)) return false;
  if (/\brank(ing)?\b.*\b(all|every|each)\s+(vendors?|suppliers?)\b/.test(p)) return false;

  const rankCue =
    /\brank(ing)?\b/.test(p) ||
    /\bperformance\s+rank\b/.test(p) ||
    /\bperformance\s+score\b/.test(p) ||
    /\bai\s+supplier\s+performance\b/.test(p) ||
    /\bsupplier\s+performance\s+(rank|score)\b/.test(p) ||
    /\bai\s+vendor\s+rank\b/.test(p);

  if (!rankCue) return false;

  const riskPrimary =
    /\brisk\s+assessment\b/.test(p) ||
    /\bassess\s+(the\s+)?risk\b/.test(p) ||
    /\brisk\s+(check|summary|report|analysis|profile)\b/.test(p) ||
    /\bhow\s+risky\b/.test(p) ||
    /\bred\s*flags?\b/.test(p) ||
    /\bcompliance\s+(risk|audit|review)\b/.test(p);

  if (riskPrimary) return false;
  if (/\brisk\b/.test(p) && /\brank(ing)?\b/.test(p)) return false;

  const wantsFullProfile =
    /\b(full\s+)?(profile|details?|information)\b/.test(p) ||
    /\beverything\s+about\b/.test(p) ||
    /\bcontacts?\b/.test(p) ||
    /\bbank(s|ing)?\b/.test(p) ||
    /\bdocument(s)?\b/.test(p) ||
    /\baddress\b/.test(p);

  if (wantsFullProfile) return false;

  return true;
}

async function buildVendorSelectionPendingAction(_args: any, _context: ToolExecutionContext): Promise<PendingAction> {
  /* Vendor selection has been intentionally disabled.
  const prefill = String(
    args?.vendorHint ||
    args?.vendorName ||
    args?.supplierId ||
    extractVendorPrefillFromPrompt(context.originalPrompt) ||
    ""
  ).trim();
  let initialCandidates: Array<{ id: number; companyName: string | null; emailId: string | null }> = [];
  if (prefill) {
    initialCandidates = await storage.searchDboSuppliersForAgent({ query: prefill, limit: 8 });
  }
  return {
    type: "select_vendor",
    summary: "Select a vendor to continue.",
    data: {
      originalPrompt: context.originalPrompt,
      prefill,
      initialCandidates,
    },
  };
  */
  throw new Error("Vendor selection has been intentionally disabled.");
}

/**
 * Resolve how many results a supplier-list query should return.
 * Priority: an explicit count stated by the user in their own words
 * ("show 60 active suppliers") → the model-passed limit arg → default 20.
 * Hard-capped at MAX_SEARCH_VENDORS_LIMIT for safety.
 */
const MAX_SEARCH_VENDORS_LIMIT = 500;
const SUPPLIER_LIST_COUNT_RE =
  /(?:\b(?:show|list|display|give|get|fetch|find|need|want)\b[^.?!\d]{0,30}?\b(?:first|top|latest)?\s*(\d{1,4})\b[^.?!\d]{0,20}?\b(?:active|inactive|in-active|approved|registered|blocked|rejected|draft|pending|new)?\s*\b(?:suppliers?|vendors?)\b)|(?:\b(\d{1,4})\b\s*(?:-|\s)?\s*(?:active|inactive|in-active|approved|registered|blocked|rejected|draft|pending|new)?\s*\b(?:suppliers?|vendors?)\b)|(?:\b(?:first|top|latest)\s+(\d{1,4})\b)/i;

function extractRequestedSupplierCount(prompt: string): number | undefined {
  if (!prompt) return undefined;
  const m = prompt.match(SUPPLIER_LIST_COUNT_RE);
  if (!m) return undefined;
  const n = parseInt(m[1] || m[2] || m[3], 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

const SHOW_ALL_SUPPLIERS_RES = [
  /\ball\s+(?:the\s+|my\s+|our\s+)?(?:active\s+|inactive\s+|approved\s+|registered\s+|blocked\s+|rejected\s+|draft\s+|pending\s+)?(?:suppliers?|vendors?)\b/i,
  /\b(?:active|inactive|approved|registered|blocked|rejected|draft|pending)?\s*(?:suppliers?|vendors?)\s+list\b/i,
  /\b(?:entire|complete|full|whole)\b[^.!?\d]{0,20}\b(?:list|suppliers?|vendors?)\b/i,
  /\b(?:every|each)\s+(?:single\s+)?(?:suppliers?|vendors?)\b/i,
];

function hasShowAllSuppliersIntent(prompt: string): boolean {
  if (!prompt) return false;
  return SHOW_ALL_SUPPLIERS_RES.some((re) => re.test(prompt));
}

function resolveRequestedListLimit(originalPrompt: string, argsLimit?: number): number {
  if (hasShowAllSuppliersIntent(originalPrompt)) return MAX_SEARCH_VENDORS_LIMIT;
  const requested = extractRequestedSupplierCount(originalPrompt);
  const effective = requested ?? argsLimit ?? 20;
  return Math.min(Math.max(Math.floor(effective), 1), MAX_SEARCH_VENDORS_LIMIT);
}

async function executeToolCall(
  toolName: string,
  args: any,
  sessionUser: any,
  context: ToolExecutionContext
): Promise<{ result: string; pendingAction?: PendingAction; chart?: AgentChartSpec; charts?: AgentChartSpec[] }> {
  try {
    switch (toolName) {
      case "search_vendors": {
        const search = args.search || "";
        const status = args.status || "all";
        const limit = resolveRequestedListLimit(context.originalPrompt, args.limit);
        const page = Math.max(args.page || 1, 1);

        const onboardingDateFilter = buildSupplierOnboardingDateFilterFromArgs(args);
        const dateFilterKind: SupplierDateFilterKind =
          onboardingDateFilter && (args.dateFilterType === "incorporation" || isSupplierIncorporationDateIntent(context.originalPrompt, args))
            ? "incorporation"
            : "onboarding";
        const needsClientFilter = !!(args.country || args.city || args.legalEntityType || args.sortBy || args.serviceType || args.userRegistered || onboardingDateFilter);

        if (needsClientFilter || onboardingDateFilter) {
          let suppliers = onboardingDateFilter
            ? await getAllDboSuppliersForAgent(status, search)
            : ((await vendorService.getDboSuppliersPaginated({
                page: 1,
                limit: 500,
                status: status === "all" ? undefined : status,
                search: search || undefined,
              })) as any).data || [];
          if (onboardingDateFilter) {
            suppliers = suppliers.filter((s: any) => {
              const dateValue = dateFilterKind === "incorporation" ? getSupplierIncorporationDateValue(s) : s.creationDate;
              return matchesSupplierOnboardingDateFilter(dateValue, onboardingDateFilter);
            });
          }

          if (args.serviceType) {
            const svcTerm = args.serviceType.toLowerCase();

            let scopeIds: number[] = [];
            try {
              scopeIds = await vendorRepo.getSupplierIdsByServiceScope(svcTerm);
            } catch (e) {}
            const scopeIdSet = new Set(scopeIds);

            let allSupplierPool = suppliers;
            if (suppliers.length < 500) {
            } else {
              let allS: any[] = [];
              let pg = 1;
              while (true) {
                const pgResult = await vendorService.getDboSuppliersPaginated({ page: pg, limit: 500, status: status === "all" ? undefined : status });
                const pgData = (pgResult as any).data || [];
                allS = allS.concat(pgData);
                if (pgData.length < 500) break;
                pg++;
              }
              allSupplierPool = allS;
            }

            suppliers = allSupplierPool.filter((s: any) => {
              if (scopeIdSet.has(s.id)) return true;
              const fields = [s.typeOfService, s.vendorCategory, s.companyName, s.supplierType, s.brandName].filter(Boolean);
              return fields.some((f: string) => f.toLowerCase().includes(svcTerm));
            });
          }

          if (args.country) {
            const normalize = (s: string) => s.toLowerCase().replace(/[.\-_,]/g, '').replace(/\s+/g, ' ').trim();
            const countryAliases: Record<string, string[]> = {
              "united arab emirates": ["uae", "uae"],
              "uae": ["united arab emirates"],
              "india": ["in", "ind"],
              "in": ["india", "ind"],
              "ind": ["india", "in"],
              "united states": ["usa", "us", "united states of america"],
              "united states of america": ["usa", "us", "united states"],
              "usa": ["united states", "us", "united states of america"],
              "us": ["usa", "united states", "united states of america"],
              "united kingdom": ["uk", "gb", "gbr", "great britain"],
              "uk": ["united kingdom", "gb", "gbr", "great britain"],
              "gb": ["united kingdom", "uk", "gbr", "great britain"],
              "great britain": ["united kingdom", "uk", "gb", "gbr"],
            };
            const searchCountry = normalize(args.country);
            const aliases = countryAliases[searchCountry] || [];
            const allTerms = [searchCountry, ...aliases];
            suppliers = suppliers.filter((s: any) => {
              if (!s.country) return false;
              const c = normalize(s.country);
              return allTerms.some(term => c.includes(term) || term.includes(c));
            });
          }
          if (args.city) {
            suppliers = suppliers.filter((s: any) => s.city && s.city.toLowerCase().includes(args.city.toLowerCase()));
          }
          if (args.legalEntityType) {
            suppliers = suppliers.filter((s: any) => s.legalEntityType && s.legalEntityType.toLowerCase().includes(args.legalEntityType.toLowerCase()));
          }
          if (args.userRegistered) {
            suppliers = suppliers.filter((s: any) => (s.userRegistered || "").toLowerCase() === args.userRegistered.toLowerCase());
          }

          if (args.sortBy === "newest") {
            suppliers.sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
          } else if (args.sortBy === "oldest") {
            suppliers.sort((a: any, b: any) => (a.id || 0) - (b.id || 0));
          } else if (args.sortBy === "name") {
            suppliers.sort((a: any, b: any) => (a.companyName || "").localeCompare(b.companyName || ""));
          } else if (args.sortBy === "status") {
            suppliers.sort((a: any, b: any) => (a.status || "").localeCompare(b.status || ""));
          }

          const total = suppliers.length;
          const totalPages = Math.ceil(total / limit);
          const startIdx = (page - 1) * limit;
          suppliers = suppliers.slice(startIdx, startIdx + limit);

          if (suppliers.length === 0) {
            const filters = [search && `matching "${search}"`, status !== "all" && `status "${status}"`, args.country && `country "${args.country}"`, args.city && `city "${args.city}"`, args.legalEntityType && `type "${args.legalEntityType}"`].filter(Boolean).join(", ");
            if (page > 1) return { result: `No more vendors to show (you've reached the end).` };
            if (onboardingDateFilter) return { result: formatSupplierOnboardingDateResult(onboardingDateFilter, [], dateFilterKind) };
            return { result: `No vendors found${filters ? ` with ${filters}` : ""}.` };
          }
          if (onboardingDateFilter) {
            return { result: formatSupplierOnboardingDateResult(onboardingDateFilter, suppliers, dateFilterKind) };
          }
          const formatted = suppliers.map((s: any, idx: number) => {
            let entry = `**${startIdx + idx + 1}. ${s.companyName || "N/A"}** (ID: ${s.id})\n`;
            if (s.legalEntityType) entry += `   Type: ${s.legalEntityType}\n`;
            if (s.city || s.country) entry += `   Location: ${[s.city, s.state, s.country].filter(Boolean).join(", ")}\n`;
            if (s.phone) entry += `   Phone: ${s.phone}\n`;
            if (s.emailId) entry += `   Email: ${s.emailId}\n`;
            if (s.taxRegNo) entry += `   GST/Tax Reg: ${s.taxRegNo}\n`;
            if (s.status) entry += `   Status: ${s.status}\n`;
            entry += `   Registered: ${(s.userRegistered || "No")}\n`;
            if (s.annualTurnOver) entry += `   Annual Turnover: ${s.turnOverCurrency || ""} ${s.annualTurnOver}\n`;
            if (s.noOfEmployees) entry += `   Employees: ${s.noOfEmployees}\n`;
            return entry;
          }).join("\n");

          let pagination = `Showing page ${page} of ${totalPages} (${total} total)`;
          if (page < totalPages) pagination += ` — say "show more" to see the next page`;

          return { result: `${pagination}\n\n${formatted}` };
        } else {
          const result = await vendorService.getDboSuppliersPaginated({
            page,
            limit,
            status: status === "all" ? undefined : status,
            search: search || undefined,
          });
          const suppliers = (result as any).data || [];
          const total = (result as any).pagination?.total || suppliers.length;
          const totalPages = Math.ceil(total / limit);
          const startIdx = (page - 1) * limit;

          if (suppliers.length === 0) {
            const filters = [search && `matching "${search}"`, status !== "all" && `status "${status}"`].filter(Boolean).join(", ");
            if (page > 1) return { result: `No more vendors to show (you've reached the end).` };
            return { result: `No vendors found${filters ? ` with ${filters}` : ""}.` };
          }
          const formatted = suppliers.map((s: any, idx: number) => {
            let entry = `**${startIdx + idx + 1}. ${s.companyName || "N/A"}** (ID: ${s.id})\n`;
            if (s.legalEntityType) entry += `   Type: ${s.legalEntityType}\n`;
            if (s.city || s.country) entry += `   Location: ${[s.city, s.state, s.country].filter(Boolean).join(", ")}\n`;
            if (s.phone) entry += `   Phone: ${s.phone}\n`;
            if (s.emailId) entry += `   Email: ${s.emailId}\n`;
            if (s.taxRegNo) entry += `   GST/Tax Reg: ${s.taxRegNo}\n`;
            if (s.status) entry += `   Status: ${s.status}\n`;
            if (s.annualTurnOver) entry += `   Annual Turnover: ${s.turnOverCurrency || ""} ${s.annualTurnOver}\n`;
            if (s.noOfEmployees) entry += `   Employees: ${s.noOfEmployees}\n`;
            return entry;
          }).join("\n");

          let pagination = `Showing page ${page} of ${totalPages} (${total} total)`;
          if (page < totalPages) pagination += ` — say "show more" to see the next page`;

          return { result: `${pagination}\n\n${formatted}` };
        }
      }

      case "find_duplicate_suppliers": {
        const field = args.field || "all";
        const pool = getContextPool() ?? defaultPool;

        type DupRow = {
          matched_value: string;
          count: string;
          ids: string;
          company_names: string;
          statuses: string;
        };

        const runDupQuery = async (sql: string): Promise<DupRow[]> => {
          const result = await pool.query(sql);
          return result.rows as DupRow[];
        };

        const queries: Record<string, string> = {
          phone: `
            SELECT MIN(phone) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE phone IS NOT NULL AND TRIM(phone) != ''
            GROUP BY LOWER(TRIM(phone))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          email: `
            SELECT MIN(email_id) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE email_id IS NOT NULL AND TRIM(email_id) != ''
            GROUP BY LOWER(TRIM(email_id))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          company_name: `
            SELECT MIN(company_name) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE company_name IS NOT NULL AND TRIM(company_name) != ''
            GROUP BY LOWER(TRIM(company_name))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          tax_reg_no: `
            SELECT MIN(tax_reg_no) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE tax_reg_no IS NOT NULL AND TRIM(tax_reg_no) != ''
            GROUP BY LOWER(TRIM(tax_reg_no))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          address: `
            SELECT MIN(country) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE country IS NOT NULL AND TRIM(country) != ''
            GROUP BY LOWER(TRIM(country))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          website: `
            SELECT MIN(web_address) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE web_address IS NOT NULL AND TRIM(web_address) != ''
            GROUP BY LOWER(TRIM(web_address))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          license_no: `
            SELECT MIN(license_no) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE license_no IS NOT NULL AND TRIM(license_no) != ''
            GROUP BY LOWER(TRIM(license_no))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          expiry_date: `
            SELECT CAST(MIN(expiry_date) AS DATE)::text AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE expiry_date IS NOT NULL
            GROUP BY CAST(expiry_date AS DATE)
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          pan_no: `
            SELECT MIN(pan_no) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE pan_no IS NOT NULL AND TRIM(pan_no) != ''
            GROUP BY LOWER(TRIM(pan_no))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          annual_turn_over: `
            SELECT MIN(annual_turn_over)::text AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE annual_turn_over IS NOT NULL
            GROUP BY annual_turn_over
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          working_days: `
            SELECT MIN(COALESCE(workingday_start,'') || '-' || COALESCE(workingday_end,'')) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE workingday_start IS NOT NULL AND workingday_end IS NOT NULL
              AND TRIM(workingday_start) != '' AND TRIM(workingday_end) != ''
            GROUP BY LOWER(TRIM(COALESCE(workingday_start,'') || '-' || COALESCE(workingday_end,'')))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          place_of_issue: `
            SELECT MIN(place_of_issue) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE place_of_issue IS NOT NULL AND TRIM(place_of_issue) != ''
            GROUP BY LOWER(TRIM(place_of_issue))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          legal_entity_type: `
            SELECT MIN(legal_entity_type) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE legal_entity_type IS NOT NULL AND TRIM(legal_entity_type) != ''
            GROUP BY LOWER(TRIM(legal_entity_type))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          incorporation_date: `
            SELECT CAST(MIN(bus_trading_date) AS DATE)::text AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE bus_trading_date IS NOT NULL
            GROUP BY CAST(bus_trading_date AS DATE)
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          transact_curr: `
            SELECT MIN(transact_curr) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE transact_curr IS NOT NULL AND TRIM(transact_curr) != ''
            GROUP BY LOWER(TRIM(transact_curr))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          working_hours: `
            SELECT MIN(COALESCE(working_time_start_time,'') || '-' || COALESCE(working_time_end_time,'')) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE working_time_start_time IS NOT NULL AND working_time_end_time IS NOT NULL
              AND TRIM(working_time_start_time) != '' AND TRIM(working_time_end_time) != ''
            GROUP BY LOWER(TRIM(COALESCE(working_time_start_time,'') || '-' || COALESCE(working_time_end_time,'')))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          tax_payer_id: `
            SELECT MIN(tax_payer_id) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE tax_payer_id IS NOT NULL AND TRIM(tax_payer_id) != ''
            GROUP BY LOWER(TRIM(tax_payer_id))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          payment_terms: `
            SELECT MIN(payment_terms) AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE payment_terms IS NOT NULL AND TRIM(payment_terms) != ''
            GROUP BY LOWER(TRIM(payment_terms))
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          tax_effective_date: `
            SELECT CAST(MIN(tax_effective_date) AS DATE)::text AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE tax_effective_date IS NOT NULL
            GROUP BY CAST(tax_effective_date AS DATE)
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          domestic_exp: `
            SELECT MIN(year_of_exp_loc_market)::text AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE year_of_exp_loc_market IS NOT NULL
            GROUP BY year_of_exp_loc_market
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,

          international_exp: `
            SELECT MIN(year_of_exp_international)::text AS matched_value, COUNT(*)::text AS count,
                   STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
                   STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
                   STRING_AGG(COALESCE(status, 'Unknown'), ', ' ORDER BY id) AS statuses
            FROM dbo.supp_basic_org_dtls
            WHERE year_of_exp_international IS NOT NULL
            GROUP BY year_of_exp_international
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC`,
        };

        const fieldsToCheck = field === "all"
          ? ["phone", "email", "company_name", "tax_reg_no", "address", "website", "license_no", "expiry_date", "pan_no", "annual_turn_over", "working_days", "place_of_issue", "legal_entity_type", "incorporation_date", "transact_curr", "working_hours", "tax_payer_id", "payment_terms", "tax_effective_date", "domestic_exp", "international_exp"]
          : [field];

        const fieldLabels: Record<string, string> = {
          phone: "📞 Same Phone Number",
          email: "📧 Same Email Address",
          company_name: "🏢 Same Company Name",
          tax_reg_no: "🧾 Same Tax Registration Number",
          address: "🏠 Same Address",
          website: "🌐 Same Website",
          license_no: "🪪 Same License Number",
          expiry_date: "📅 Same Business Expiry Date",
          pan_no: "📄 Same PAN No (Company)",
          annual_turn_over: "💰 Same Annual Turnover",
          working_days: "📆 Same Working Days",
          place_of_issue: "📍 Same Place of Issue",
          legal_entity_type: "🏛️ Same Legal Entity Type",
          incorporation_date: "📅 Same Incorporation Date",
          transact_curr: "💱 Same Transaction Currency",
          working_hours: "🕐 Same Working Hours",
          tax_payer_id: "🔢 Same Tax Identification No (TIN)",
          payment_terms: "💳 Same Payment Terms",
          tax_effective_date: "📅 Same Tax Effective Date",
          domestic_exp: "🏠 Same Domestic Experience (Years)",
          international_exp: "🌍 Same International Experience (Years)",
        };

        const mergeCountryGroupsWithAI = async (rows: DupRow[]): Promise<DupRow[]> => {
          if (rows.length <= 1) return rows;
          try {
            const openai = await getAIClient();
            const modelName = await getAIModelName();
            const rawList = rows.map((r, i) => `${i}: "${r.matched_value}"`).join("\n");
            const aiResp = await openai.chat.completions.create({
              model: modelName,
              temperature: 0,
              max_tokens: 500,
              messages: [
                {
                  role: "system",
                  content: `You are a country name normalizer. Given a numbered list of country values found in a database, identify which ones refer to the same real-world country (e.g. "IN" and "India" are the same; "USA", "US", and "United States" are the same). Return ONLY a JSON array of merge groups. Each group is an array of indices that should be merged. Indices not grouped with others must still appear as single-element arrays. Example output: [[0,2],[1],[3,4]]. Return nothing else.`,
                },
                { role: "user", content: rawList },
              ],
            });
            const content = aiResp.choices[0]?.message?.content?.trim() ?? "[]";
            const groups: number[][] = JSON.parse(content);
            return groups.map((idxArr) => {
              const members = idxArr.map((i) => rows[i]).filter(Boolean);
              if (members.length === 0) return null;
              const canonical = members.reduce((a, b) =>
                (b.matched_value?.length ?? 0) > (a.matched_value?.length ?? 0) ? b : a
              );
              const mergedCount = members.reduce((s, r) => s + parseInt(r.count || "0", 10), 0);
              const mergedIds = members.map((r) => r.ids).join(", ");
              const mergedNames = members.map((r) => r.company_names).join(" | ");
              const mergedStatuses = members.map((r) => r.statuses).join(", ");
              return {
                matched_value: canonical.matched_value,
                count: mergedCount.toString(),
                ids: mergedIds,
                company_names: mergedNames,
                statuses: mergedStatuses,
              } as DupRow;
            }).filter((r): r is DupRow => r !== null && parseInt(r.count, 10) > 1);
          } catch {
            return rows;
          }
        };

        const sections: string[] = [];
        let totalGroups = 0;

        for (const f of fieldsToCheck) {
          if (!queries[f]) continue;
          let rows = await runDupQuery(queries[f]);
          if (f === "address") {
            rows = await mergeCountryGroupsWithAI(rows);
          }
          const label = fieldLabels[f] || f;
          if (rows.length === 0) {
            sections.push(`${label}: No duplicates found.`);
          } else {
            totalGroups += rows.length;
            const lines = rows.map((r, i) => {
              const names = r.company_names || "Unknown";
              const ids = r.ids || "?";
              const count = r.count;
              const val = r.matched_value || "(empty)";
              return `  ${i + 1}. Value: "${val}"\n     Suppliers (${count}): ${names}\n     IDs: ${ids}\n     Statuses: ${r.statuses}`;
            });
            sections.push(`${label} — ${rows.length} duplicate group(s) found:\n${lines.join("\n\n")}`);
          }
        }

        const summary = totalGroups === 0
          ? "No duplicate suppliers found in the system."
          : `Found ${totalGroups} duplicate group(s) across the checked fields.`;

        return { result: `**Duplicate Supplier Report**\n\n${summary}\n\n${sections.join("\n\n")}` };
      }

      case "get_supplier_bank_details": {
        const rawNames: string[] = Array.isArray(args.vendorNames) ? args.vendorNames : [];
        const rawIds: any[] = Array.isArray(args.supplierIds) ? args.supplierIds : [];
        const wantsAll = !!args.allSuppliers && rawNames.length === 0 && rawIds.length === 0;

        // Resolve the target suppliers (numeric id, SUPP-code, or company name).
        const targets: any[] = [];
        const seenIds = new Set<number>();
        const pushTarget = (supplier: any) => {
          const idNum = Number(supplier?.id);
          if (!Number.isFinite(idNum) || idNum <= 0 || seenIds.has(idNum)) return;
          seenIds.add(idNum);
          targets.push(supplier);
        };

        if (wantsAll) {
          const all = await getAllDboSuppliersForAgent(args.status || "all");
          for (const s of all) pushTarget(s);
        } else {
          for (const sid of rawIds) {
            const supplier = await vendorService.getDboSupplier(String(sid).trim());
            if (supplier) pushTarget(supplier);
          }
          for (const name of rawNames) {
            const cleaned = String(name || "").replace(/^@+/, "").trim();
            if (!cleaned) continue;
            // Try direct id/code first, then fall back to name search.
            let supplier: any = await vendorService.getDboSupplier(cleaned);
            if (!supplier) {
              const found = (await vendorService.getDboSuppliersPaginated({ page: 1, limit: 1, search: cleaned })) as any;
              supplier = (found.data || [])[0];
            }
            if (supplier) pushTarget(supplier);
          }
          // Nothing explicit resolved — fall back to a single supplier inferred from the prompt.
          if (targets.length === 0) {
            const resolved = await resolveSupplierForAgent({
              supplierId: args.supplierId,
              vendorName: args.vendorName,
              prompt: context.originalPrompt,
              contextSupplierId: context.selectedVendor?.supplierId,
            });
            if (resolved) pushTarget(resolved.detail);
          }
        }

        if (targets.length === 0) {
          return { result: "I couldn't find a supplier matching that request. Please provide a supplier name or ID." };
        }

        const MAX_ALL = 50;
        let out = "";
        let shown = 0;
        let moreRemaining = false;
        for (let i = 0; i < targets.length; i++) {
          const s = targets[i] as any;
          if (wantsAll && shown >= MAX_ALL) {
            moreRemaining = true;
            break;
          }
          const banks = (await vendorService.getDboSupplierBanks(Number(s.id))) as any[];
          const label = `## ${s.companyName || "Supplier"} (ID: ${s.supplierId || s.id})\n`;
          if (!banks?.length) {
            // In "all suppliers" mode skip empties to keep the response focused.
            if (wantsAll) continue;
            out += `${label}_No bank details on record._\n\n`;
            shown++;
            continue;
          }
          shown++;
          out += label;
          out += `### Bank Accounts (${banks.length})\n`;
          out += formatBankAccountsBlock(banks);
          out += `\n`;
        }

        if (wantsAll && shown === 0) {
          return { result: "None of the suppliers have bank details on record." };
        }
        if (moreRemaining) {
          out += `\n_Showing the first ${MAX_ALL} suppliers with bank details. Ask for a specific supplier to see the rest._\n`;
        }

        return { result: out.trimEnd() + "\n" };
      }

      case "find_duplicate_invitations": {
        const pool = getContextPool() ?? defaultPool;

        const result = await pool.query(`
          SELECT
            MIN(email_id) AS email_id,
            COUNT(*)::int AS total,
            STRING_AGG(id::text, ', ' ORDER BY id) AS ids,
            STRING_AGG(company_name, ' | ' ORDER BY id) AS company_names,
            STRING_AGG(TO_CHAR(invitation_date, 'MM-DD-YYYY'), ', ' ORDER BY id) AS inv_dates,
            STRING_AGG(COALESCE(status, 'Unknown'), ' | ' ORDER BY id) AS statuses
          FROM dbo.supp_invitation_dtls
          WHERE email_id IS NOT NULL AND TRIM(email_id) != ''
          GROUP BY LOWER(TRIM(email_id))
          HAVING COUNT(*) > 1
          ORDER BY COUNT(*) DESC
        `);

        const rows = result.rows;

        if (rows.length === 0) {
          return { result: "✅ No duplicate invitations found. All invitation email addresses are unique." };
        }

        const lines = rows.map((r: any, i: number) =>
          `  ${i + 1}. Email: "${r.email_id}"\n     Inv. IDs: ${r.ids}\n     Suppliers: ${r.company_names}\n     Dates: ${r.inv_dates}\n     Statuses: ${r.statuses}`
        );

        const summary = `⚠️ Found ${rows.length} duplicate email(s) across invitations.`;
        return { result: `**Duplicate Invitation Report**\n\n${summary}\n\n${lines.join("\n\n")}` };
      }

      case "request_vendor_selection": {
        /* Vendor selection has been intentionally disabled.
        if (
          context.blockVendorSelection ||
          context.comparisonIntent ||
          isLikelyOnboardingIntent(context.originalPrompt) ||
          context.onboardingFollowup
        ) {
          return {
            result:
              context.comparisonIntent
                ? "This is a vendor comparison request. Do not ask for vendor selection. Resolve vendor names/IDs from the user prompt and call compare_vendors."
                : "This looks like a vendor onboarding request. Do not ask for vendor selection. Call prepare_onboard_vendor with the extracted onboarding fields from the user's message.",
          };
        }
        const pendingAction = await buildVendorSelectionPendingAction(args, context);
        return {
          result: "Please select a vendor from the dropdown to continue.",
          pendingAction,
        };
        */
        return { result: VENDOR_SELECTION_UNAVAILABLE_MSG };
      }

      case "get_vendor_details": {
        const rankOnly = !!(args as any)._rankOnly;
        const resolved = await resolveSupplierForAgent({
          supplierId: args.supplierId,
          vendorName: args.vendorName,
          prompt: context.originalPrompt,
          contextSupplierId: context.selectedVendor?.supplierId,
        });
        if (!resolved) {
          if (context.comparisonIntent) {
            return {
              result:
                "This request is for vendor comparison. Do not request manual vendor selection. Resolve vendor names/IDs from the prompt and call compare_vendors.",
            };
          }
          const hasAnyHint =
            args.supplierId != null ||
            args.vendorName ||
            context.selectedVendor?.supplierId ||
            extractVendorPrefillFromPrompt(context.originalPrompt);
          if (!hasAnyHint) {
            return { result: VENDOR_SELECTION_UNAVAILABLE_MSG };
          }
          return { result: `No vendor found with ID ${args.supplierId ?? args.vendorName ?? "provided"}.` };
        }

        const supplierId = resolved.id;
        const supplier = resolved.detail;

        if (rankOnly) {
          const s = supplier as any;
          let detail = `## ${s.companyName || "Vendor"} (ID: ${s.id})\n\n`;
          detail += `**Status:** ${s.status || "N/A"}\n`;
          const sidNum = Number(s.id);
          if (Number.isFinite(sidNum) && sidNum > 0) {
            const aiRanks = await fetchSupplierAiRanksByIds([sidNum]);
            detail += formatAiSupplierRankLines(aiRanks, s.id);
          }
          return { result: `${detail.trimEnd()}\n` };
        }

        const [contacts, banks, documents] = await Promise.all([
          Promise.resolve(supplier),
          vendorService.getDboSupplierContacts(supplierId),
          vendorService.getDboSupplierBanks(supplierId),
          vendorService.getDboSupplierDocuments(supplierId),
        ]);

        if (!supplier) {
          return { result: `No vendor found with ID ${supplierId}.` };
        }

        const s = supplier as any;
        let detail = `## ${s.companyName || "Vendor"} (ID: ${s.id})\n\n`;
        detail += `**Status:** ${s.status || "N/A"}\n`;
        const sidNum = Number(s.id);
        if (Number.isFinite(sidNum) && sidNum > 0) {
          const aiRanks = await fetchSupplierAiRanksByIds([sidNum]);
          detail += formatAiSupplierRankLines(aiRanks, s.id);
        }
        detail += `**Legal Entity:** ${s.legalEntityType || "N/A"}\n`;
        const address = [s.address1, s.city, s.state, s.country, s.postalcode].filter(Boolean).join(", ");
        detail += `**Address:** ${address || "N/A"}\n`;
        detail += `**Email:** ${s.emailId || "N/A"}\n`;
        detail += `**Phone:** ${s.phone || "N/A"}\n`;
        if (s.webAddress) detail += `**Website:** ${s.webAddress}\n`;
        if (s.taxRegNo) detail += `**GST/Tax Reg:** ${s.taxRegNo}\n`;
        if (s.panNo) detail += `**PAN:** ${s.panNo}\n`;
        if (s.licenseNo) detail += `**License No:** ${s.licenseNo}\n`;
        if (s.annualTurnOver) detail += `**Annual Turnover:** ${s.turnOverCurrency || ""} ${s.annualTurnOver}\n`;
        if (s.noOfEmployees) detail += `**Employees:** ${s.noOfEmployees}\n`;
        if (s.companySize) detail += `**Company Size:** ${s.companySize}\n`;
        if (s.vendorCategory) detail += `**Category:** ${s.vendorCategory}\n`;
        if (s.supplierType) detail += `**Supplier Type:** ${s.supplierType}\n`;
        if (s.typeOfService) detail += `**Service Type:** ${s.typeOfService}\n`;
        if (s.brandName) detail += `**Brand:** ${s.brandName}\n`;
        if (s.parentCompanyName) detail += `**Parent Company:** ${s.parentCompanyName}\n`;
        if (s.paymentTerms) detail += `**Payment Terms:** ${s.paymentTerms}\n`;
        if (s.creationDate) detail += `**Registered On:** ${new Date(s.creationDate).toLocaleDateString()}\n`;
        if (s.createdBy) detail += `**Created By:** ${s.createdBy}\n`;

        const contactList = contacts as any[];
        if (contactList?.length) {
          detail += `\n### Contacts\n`;
          contactList.forEach((c: any, ci: number) => {
            detail += `**${ci + 1}. ${c.contactName || "N/A"}**\n`;
            if (c.designation) detail += `   Designation: ${c.designation}\n`;
            if (c.email) detail += `   Email: ${c.email}\n`;
            if (c.mobile) detail += `   Mobile: ${c.mobile}\n`;
          });
        }

        const bankList = banks as any[];
        if (bankList?.length) {
          detail += `\n### Bank Accounts\n`;
          detail += formatBankAccountsBlock(bankList);
        }

        const docList = documents as any[];
        if (docList?.length) {
          detail += `\n### Documents\n`;
          docList.forEach((d: any, di: number) => {
            detail += `**${di + 1}. ${formatDocumentDisplayLabel(d)}**\n`;
            if (d.expiry_date) detail += `   Expiry: ${new Date(d.expiry_date).toLocaleDateString()}\n`;
          });
        }

        return { result: detail };
      }

      case "get_vendor_stats": {
        const groupBy = args.groupBy || "all";
        const onboardingDateFilter = buildSupplierOnboardingDateFilterFromArgs(args);
        const dateFilterKind: SupplierDateFilterKind =
          onboardingDateFilter && (args.dateFilterType === "incorporation" || isSupplierIncorporationDateIntent(context.originalPrompt, args))
            ? "incorporation"
            : "onboarding";
        let allSuppliers: any[];
        let totalDbo: number;
        if (onboardingDateFilter) {
          allSuppliers = await getAllDboSuppliersForAgent();
          totalDbo = allSuppliers.length;
        } else {
          const allResult = await vendorService.getDboSuppliersPaginated({ page: 1, limit: 500 });
          allSuppliers = (allResult as any).data || [];
          totalDbo = (allResult as any).pagination?.total || allSuppliers.length;
        }

        if (onboardingDateFilter) {
          const matchingSuppliers = allSuppliers.filter((s: any) => {
            const dateValue = dateFilterKind === "incorporation" ? getSupplierIncorporationDateValue(s) : s.creationDate;
            return matchesSupplierOnboardingDateFilter(dateValue, onboardingDateFilter);
          });
          return { result: formatSupplierOnboardingDateResult(onboardingDateFilter, matchingSuppliers, dateFilterKind) };
        }

        const statusCounts: Record<string, number> = {};
        const countryCounts: Record<string, number> = {};
        const cityCounts: Record<string, number> = {};
        const entityTypeCounts: Record<string, number> = {};
        let withEmail = 0, withPhone = 0, withDocs = 0;
        let registeredCount = 0, notRegisteredCount = 0;

        allSuppliers.forEach((s: any) => {
          statusCounts[s.status || "Unknown"] = (statusCounts[s.status || "Unknown"] || 0) + 1;
          countryCounts[s.country || "Unknown"] = (countryCounts[s.country || "Unknown"] || 0) + 1;
          if (s.city) cityCounts[s.city] = (cityCounts[s.city] || 0) + 1;
          entityTypeCounts[s.legalEntityType || "Unknown"] = (entityTypeCounts[s.legalEntityType || "Unknown"] || 0) + 1;
          if (s.emailId) withEmail++;
          if (s.phone) withPhone++;
          if ((s.userRegistered || "").toLowerCase() === "yes") registeredCount++;
          else notRegisteredCount++;
        });

        let invitationStats = "";
        try {
          const invCounts = await vendorService.getInvitationStatusCounts();
          if (invCounts) {
            invitationStats = `\n### Invitation Status\n`;
            (invCounts as unknown as any[]).forEach((ic: any) => {
              invitationStats += `- ${ic.status || "Unknown"}: ${ic.count}\n`;
            });
          }
        } catch (e) {}

        let stats = `## Vendor Statistics\n\n`;
        stats += `**Total Suppliers**: ${totalDbo}\n`;
        stats += `**Registered (self-registered via portal)**: ${registeredCount} | **Not Registered**: ${notRegisteredCount}\n`;
        stats += `**With Email**: ${withEmail} | **With Phone**: ${withPhone}\n\n`;

        if (groupBy === "all" || groupBy === "status") {
          stats += `### By Status\n`;
          Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
            stats += `- ${status}: ${count}\n`;
          });
        }
        if (groupBy === "all" || groupBy === "country") {
          stats += `\n### By Country\n`;
          Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([loc, count]) => {
            stats += `- ${loc}: ${count}\n`;
          });
        }
        if (groupBy === "all" || groupBy === "city") {
          stats += `\n### By City\n`;
          Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([city, count]) => {
            stats += `- ${city}: ${count}\n`;
          });
        }
        if (groupBy === "all" || groupBy === "legalEntityType") {
          stats += `\n### By Legal Entity Type\n`;
          Object.entries(entityTypeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            stats += `- ${type}: ${count}\n`;
          });
        }
        stats += invitationStats;

        let chart: AgentChartSpec | undefined;
        let charts: AgentChartSpec[] | undefined;
        if (groupBy === "all") {
          const built: AgentChartSpec[] = [];
          const cStatus = barChartFromCountMap("Suppliers by status", statusCounts, { valueSeriesLabel: "Suppliers" });
          if (cStatus) built.push(cStatus);
          const cCountry = barChartFromCountMap("Suppliers by country", countryCounts, {
            valueSeriesLabel: "Suppliers",
            maxCategories: 15,
          });
          if (cCountry) built.push(cCountry);
          const cCity = barChartFromCountMap("Suppliers by city", cityCounts, {
            valueSeriesLabel: "Suppliers",
            maxCategories: 15,
          });
          if (cCity) built.push(cCity);
          const cEntity = barChartFromCountMap("Suppliers by legal entity type", entityTypeCounts, {
            valueSeriesLabel: "Suppliers",
          });
          if (cEntity) built.push(cEntity);
          if (built.length > 1) charts = built;
          else if (built.length === 1) chart = built[0];
        } else if (groupBy === "status") {
          chart = barChartFromCountMap("Suppliers by status", statusCounts, { valueSeriesLabel: "Suppliers" });
        } else if (groupBy === "country") {
          chart = barChartFromCountMap("Suppliers by country", countryCounts, {
            valueSeriesLabel: "Suppliers",
            maxCategories: 15,
          });
        } else if (groupBy === "city") {
          chart = barChartFromCountMap("Suppliers by city", cityCounts, {
            valueSeriesLabel: "Suppliers",
            maxCategories: 15,
          });
        } else if (groupBy === "legalEntityType") {
          chart = barChartFromCountMap("Suppliers by legal entity type", entityTypeCounts, {
            valueSeriesLabel: "Suppliers",
          });
        }

        return charts?.length ? { result: stats, charts } : { result: stats, chart };
      }

      case "get_top_suppliers_by_purchase_volume": {
        const year = args.year != null && Number.isFinite(Number(args.year)) ? Number(args.year) : undefined;
        const monthsBack =
          args.monthsBack != null && Number.isFinite(Number(args.monthsBack)) && Number(args.monthsBack) > 0
            ? Math.min(Number(args.monthsBack), 60)
            : undefined;
        const limit = Math.min(args.limit || 15, 25);
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        let periodLabel = String(args.periodLabel || "").trim();
        let arr: any[] = [];

        if (monthsBack) {
          const from = new Date(now);
          from.setMonth(from.getMonth() - monthsBack);
          const fromDate = from.toISOString().slice(0, 10);
          if (!periodLabel) periodLabel = `last ${monthsBack} months`;
          arr = await spendService.getSpendBySupplierInDateRange(fromDate, today, undefined, limit);
        } else if (year !== undefined) {
          if (!periodLabel) periodLabel = String(year);
          const data = await spendService.getSpendBySupplier(year);
          arr = Array.isArray(data) ? (data as any[]) : [];
        } else {
          if (!periodLabel) periodLabel = "all time";
          const data = await spendService.getSpendBySupplier();
          arr = Array.isArray(data) ? (data as any[]) : [];
        }

        if (!arr.length) {
          return { result: `No purchase volume data found for suppliers${periodLabel ? ` (${periodLabel})` : ""}.` };
        }

        const top = arr.slice(0, limit);
        let info = `## Top Suppliers by Purchase Volume (${periodLabel})\n\n`;
        top.forEach((s: any, i: number) => {
          const name = s.name || s.supplier_name || s.vendor || "N/A";
          const spend = Number(s.value ?? s.total_spend ?? s.amount ?? 0);
          info += `**${i + 1}. ${name}**\n`;
          info += `Purchase Volume: AED ${spend.toLocaleString()}\n\n`;
        });

        const spendMap: Record<string, number> = {};
        for (const s of top) {
          const name = s.name || s.supplier_name || s.vendor || "Unknown";
          spendMap[name] = Number(s.value ?? s.total_spend ?? s.amount ?? 0);
        }
        const chart = barChartFromCountMap(`Top suppliers by purchase volume (${periodLabel})`, spendMap, {
          valueSeriesLabel: "Purchase volume (AED)",
          maxCategories: limit,
        });

        return chart ? { result: info, chart } : { result: info };
      }

      case "vendor_risk_summary": {
        let contacts: any[] = [];
        let documents: any[] = [];
        let banks: any[] = [];
        const resolved = await resolveSupplierForAgent({
          supplierId: args.supplierId,
          vendorName: args.vendorName,
          prompt: context.originalPrompt,
          contextSupplierId: context.selectedVendor?.supplierId,
        });
        if (!resolved) {
          if (context.comparisonIntent) {
            return {
              result:
                "This request is for vendor comparison. Do not request manual vendor selection. Resolve vendor names/IDs from the prompt and call compare_vendors.",
            };
          }
          const hasAnyHint =
            args.supplierId != null ||
            args.vendorName ||
            context.selectedVendor?.supplierId ||
            extractVendorPrefillFromPrompt(context.originalPrompt);
          if (!hasAnyHint) {
            return { result: VENDOR_SELECTION_UNAVAILABLE_MSG };
          }
          return { result: "Could not find the specified vendor for risk assessment. Please provide the vendor name or ID." };
        }

        const vendorData = resolved.detail;
        const internalId = resolved.id;
        [contacts, banks, documents] = await Promise.all([
          vendorService.getDboSupplierContacts(internalId) as Promise<any[]>,
          vendorService.getDboSupplierBanks(internalId) as Promise<any[]>,
          vendorService.getDboSupplierDocuments(internalId) as Promise<any[]>,
        ]);

        const v = vendorData;
        const expiredDocs = documents?.filter((d: any) => d.expiry_date && new Date(d.expiry_date) < new Date()) || [];
        const risk = computeVendorRisk(v, {
          docCount: documents?.length || 0,
          expiredCount: expiredDocs.length,
          contactCount: contacts?.length || 0,
          bankCount: banks?.length || 0,
        });

        let summary = `## Risk Assessment — ${v.companyName || "Vendor"}\n\n`;
        summary += `**Risk Level**: ${risk.riskLevel} (Score: ${risk.riskScore}/100)\n\n`;
        const riskSid = Number(v.id);
        if (Number.isFinite(riskSid) && riskSid > 0) {
          const aiRanks = await fetchSupplierAiRanksByIds([riskSid]);
          const rankBlock = formatAiSupplierRankLines(aiRanks, v.id);
          if (rankBlock) summary += `${rankBlock}\n`;
        }
        summary += `### Risk Factors\n`;
        risk.factors.forEach(f => { summary += `- ${f}\n`; });
        summary += `\n### Data Completeness\n`;
        summary += `- Documents: ${documents?.length || 0} uploaded\n`;
        summary += `- Contacts: ${contacts?.length || 0} registered\n`;
        summary += `- Bank Accounts: ${banks?.length || 0} linked\n`;
        summary += `- Email: ${v.emailId ? "Provided" : "Missing"}\n`;
        summary += `- Phone: ${v.phone ? "Provided" : "Missing"}\n`;

        return { result: summary };
      }

      case "vendor_risk_portfolio": {
        const filterLevel = args.riskLevel || "all";
        const maxResults = Math.min(args.limit || 20, 50);
        const sortOrder = args.sortBy || "highest_risk";

        const [docCounts, contactCounts, bankCounts] = await Promise.all([
          vendorRepo.getBulkVendorDocumentCounts(),
          vendorRepo.getBulkVendorContactCounts(),
          vendorRepo.getBulkVendorBankCounts(),
        ]);

        let allSuppliers: any[] = [];
        let page = 1;
        while (true) {
          const pageResult = await vendorService.getDboSuppliersPaginated({ page, limit: 500, status: "Active" });
          const pageData = (pageResult as any).data || [];
          allSuppliers = allSuppliers.concat(pageData);
          if (pageData.length < 500) break;
          page++;
        }
        const docMap = new Map(docCounts.map((r: any) => [r.supplier_id, { docCount: parseInt(r.doc_count), expiredCount: parseInt(r.expired_count) }]));
        const contactMap = new Map(contactCounts.map((r: any) => [r.supplier_id, parseInt(r.contact_count)]));
        const bankMap = new Map(bankCounts.map((r: any) => [r.supplier_id, parseInt(r.bank_count)]));

        const vendorRisks: { vendor: any; riskScore: number; riskLevel: string; factors: string[] }[] = [];

        for (const s of allSuppliers) {
          const docInfo = docMap.get(s.id) || { docCount: 0, expiredCount: 0 };
          const risk = computeVendorRisk(s, {
            docCount: docInfo.docCount,
            expiredCount: docInfo.expiredCount,
            contactCount: contactMap.get(s.id) || 0,
            bankCount: bankMap.get(s.id) || 0,
          });

          if (filterLevel === "all" || filterLevel === risk.riskLevel) {
            vendorRisks.push({ vendor: s, riskScore: risk.riskScore, riskLevel: risk.riskLevel, factors: risk.factors });
          }
        }

        if (sortOrder === "highest_risk") {
          vendorRisks.sort((a, b) => b.riskScore - a.riskScore);
        } else {
          vendorRisks.sort((a, b) => a.riskScore - b.riskScore);
        }

        const results = vendorRisks.slice(0, maxResults);

        if (results.length === 0) {
          return { result: `No vendors found with risk level "${filterLevel}".` };
        }

        const highCount = vendorRisks.filter(v => v.riskLevel === "HIGH").length;
        const medCount = vendorRisks.filter(v => v.riskLevel === "MEDIUM").length;
        const lowCount = vendorRisks.filter(v => v.riskLevel === "LOW").length;

        let output = `## Vendor Risk Portfolio\n\n`;
        output += `**Total Scanned**: ${allSuppliers.length} vendors\n`;
        output += `**HIGH Risk**: ${highCount} | **MEDIUM Risk**: ${medCount} | **LOW Risk**: ${lowCount}\n\n`;

        results.forEach((r, idx) => {
          output += `**${idx + 1}. ${r.vendor.companyName || "N/A"}** (ID: ${r.vendor.id})\n`;
          output += `   Risk: ${r.riskLevel} (Score: ${r.riskScore}/100)\n`;
          output += `   Status: ${r.vendor.status || "N/A"}\n`;
          if (r.vendor.city || r.vendor.country) output += `   Location: ${[r.vendor.city, r.vendor.country].filter(Boolean).join(", ")}\n`;
          output += `   Factors: ${r.factors.join(", ") || "None"}\n\n`;
        });

        return { result: output };
      }

      case "prepare_onboard_vendor": {
        const locationResolution = await resolveOnboardLocationFields(args, onboardLocationLookup);
        const validation = validateOnboardVendorData(locationResolution.resolved);

        if (locationResolution.needsClarification) {
          return { result: locationResolution.needsClarification };
        }

        // The user gave a location signal (a real postal code, a street address,
        // or a city) but the model left mandatory derivable fields empty. Don't ask
        // the user for what is derivable — push it back to the model to resolve from
        // its own geographic knowledge and re-call prepare_onboard_vendor.
        const loc = locationResolution.resolved;
        const hasUsablePostal = !!loc.postalCode && isLikelyPostalCode(loc.postalCode);
        const hasStreetAddress = !!loc.address && /\d/.test(loc.address);
        const derivable: string[] = [];
        if (hasUsablePostal) {
          if (!loc.city) derivable.push("city");
          if (!loc.country) derivable.push("country");
        } else if (hasStreetAddress) {
          if (!loc.city) derivable.push("city");
          if (!loc.country) derivable.push("country");
          if (!loc.postalCode) derivable.push("postal code");
        } else if (loc.city && !loc.country) {
          derivable.push("country");
        }
        if (derivable.length > 0) {
          const signal = hasUsablePostal
            ? `postal code "${loc.postalCode}"`
            : hasStreetAddress
              ? `the address "${loc.address}"`
              : `city "${loc.city}"`;
          return {
            result: `INTERNAL DIRECTIVE — do not show this message to the user. The user provided ${signal}, so ${derivable.join(", ")} (and state, when applicable) can be derived from your own geographic knowledge. Resolve them now and call prepare_onboard_vendor again with city, state, country, and postal code all filled in wherever derivable. Do NOT ask the user for any location field that is derivable from the address — only ask for a postal code when the location is a bare city/country with no street address.`,
          };
        }

        if (!validation.ready) {
          return {
            result: formatOnboardValidationPrompt(
              validation,
              locationResolution.autoFilled,
              locationResolution.resolved,
            ),
          };
        }

        const normalized = validation.normalized;
        if (normalized.emailId) {
          const emailTaken = await vendorRepo.checkOnboardEmailExists(normalized.emailId);
          if (emailTaken) {
            return { result: `A supplier or user account already exists with the email **${normalized.emailId}**. Please use a different email address to onboard this vendor.` };
          }
        }
        if (normalized.companyName) {
          const companyTaken = await vendorRepo.checkOnboardCompanyExists(normalized.companyName);
          if (companyTaken) {
            return { result: `A supplier or pending invitation already exists with the company name **${normalized.companyName}**. A company with this name cannot be onboarded again — please verify the supplier in Vendor Management, or onboard a different company.` };
          }
        }

        let summary = `## Vendor Onboarding Preview\n\n`;
        if (locationResolution.autoFilled.length > 0) {
          summary += `**Auto-filled:** ${locationResolution.autoFilled.join(", ")}\n\n`;
        }
        summary += `**Company Name:** ${normalized.companyName}\n`;
        summary += `**Address:** ${normalized.address}\n`;
        summary += `**Legal Entity:** ${normalized.legalEntityType}\n`;
        summary += `**City:** ${normalized.city}\n`;
        if (normalized.state) summary += `**State:** ${normalized.state}\n`;
        summary += `**Country:** ${normalized.country}\n`;
        summary += `**Postal Code:** ${normalized.postalCode}\n`;
        summary += `**Contact:** ${normalized.contactName}\n`;
        if (normalized.designation) summary += `**Designation:** ${normalized.designation}\n`;
        summary += `**Email:** ${normalized.emailId}\n`;
        summary += `**Mobile:** ${normalized.mobileNo}\n`;
        if (normalized.licenseNo) summary += `**License No:** ${normalized.licenseNo}\n`;

        return {
          result: summary,
          pendingAction: {
            type: "onboard",
            data: normalized,
            summary: `Create vendor "${normalized.companyName}" in ${normalized.city}, ${normalized.country} with contact ${normalized.contactName} (${normalized.emailId})`,
          },
        };
      }

      case "execute_onboard_vendor": {
        if (!args._confirmed) {
          return { result: "I've prepared the vendor details above. Click the **Confirm** button or reply with \"yes\" / \"proceed\" to create this vendor, or **Cancel** to abort." };
        }

        const validation = validateOnboardVendorData(args);
        if (!validation.ready) {
          return { result: formatOnboardValidationPrompt(validation) };
        }

        const normalized = validation.normalized;
        if (normalized.emailId) {
          const emailTaken = await vendorRepo.checkOnboardEmailExists(normalized.emailId);
          if (emailTaken) {
            return { result: `A supplier or user account already exists with the email **${normalized.emailId}**. Please use a different email address to onboard this vendor.` };
          }
        }
        if (normalized.companyName) {
          const companyTaken = await vendorRepo.checkOnboardCompanyExists(normalized.companyName);
          if (companyTaken) {
            return { result: `A supplier or pending invitation already exists with the company name **${normalized.companyName}**. A company with this name cannot be onboarded again — please verify the supplier in Vendor Management, or onboard a different company.` };
          }
        }
        const result = await vendorService.quickCreateSupplier({
          companyName: normalized.companyName,
          address: normalized.address,
          legalEntityType: normalized.legalEntityType,
          city: normalized.city,
          state: normalized.state || "",
          country: normalized.country,
          postalCode: normalized.postalCode,
          contactName: normalized.contactName,
          emailId: normalized.emailId,
          mobileNo: normalized.mobileNo,
          designation: normalized.designation || "",
          licenseNo: normalized.licenseNo || "",
        }, sessionUser);

        return { result: `Vendor **${normalized.companyName}** has been successfully onboarded!\n\n- **Supplier ID**: ${(result as any).id}\n- **Status**: Active\n- An invitation has been sent to ${normalized.emailId}\n\nThe vendor can now log in to complete their registration with additional details, documents, and bank information.` };
      }

      case "vendor_document_search": {
        const filter = args.filter;
        const limit = Math.min(args.limit || 20, 50);
        const specificType = resolveDocumentTypeFilter(args.documentType);

        let asOfDate = startOfLocalDay(new Date());
        let asOfDateLabel = "today";
        if (filter === "expired" || filter === "expiring_soon") {
          const dateResolution = resolveDocumentSearchAsOfDate(args, context.originalPrompt);
          if (!dateResolution.ok) {
            return { result: dateResolution.error };
          }
          asOfDate = dateResolution.asOfDate;
          asOfDateLabel = dateResolution.label;
        }

        const allResult = await vendorService.getDboSuppliersPaginated({ page: 1, limit: 500 });
        const allSuppliers = (allResult as any).data || [];

        const vendorDocs: { vendor: any; docs: any[] }[] = [];
        for (const s of allSuppliers) {
          try {
            const docs = await vendorService.getDboSupplierDocuments(s.id);
            vendorDocs.push({ vendor: s, docs: getVendorDocsWithOrgExpiry(s, docs as any[]) });
          } catch (e) {
            vendorDocs.push({ vendor: s, docs: getVendorDocsWithOrgExpiry(s, []) });
          }
        }

        let results: { vendor: any; docs: any[]; reason: string }[] = [];
        const dateScopeSuffix = asOfDateLabel === "today" ? "" : ` as of ${asOfDateLabel}`;

        switch (filter) {
          case "expired": {
            for (const vd of vendorDocs) {
              const expired = vd.docs.filter(
                (d: any) => d.expiry_date && startOfLocalDay(new Date(d.expiry_date)) < asOfDate,
              );
              if (expired.length > 0) {
                results.push({ vendor: vd.vendor, docs: expired, reason: `${expired.length} expired document(s)` });
              }
            }
            break;
          }
          case "expiring_soon": {
            const daysThreshold = resolveExpiringWithinDaysFromPrompt(
              context.originalPrompt,
              args.expiringWithinDays,
            );
            const futureDate = new Date(asOfDate.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
            for (const vd of vendorDocs) {
              const expiring = vd.docs.filter((d: any) =>
                d.expiry_date && isDocumentExpiryInFutureWindow(d.expiry_date, asOfDate, futureDate),
              );
              if (expiring.length > 0) {
                results.push({ vendor: vd.vendor, docs: expiring, reason: `${expiring.length} document(s) expiring within ${daysThreshold} days` });
              }
            }
            break;
          }
          case "no_documents": {
            for (const vd of vendorDocs) {
              if (vd.docs.length === 0) {
                results.push({ vendor: vd.vendor, docs: [], reason: "No documents uploaded" });
              }
            }
            break;
          }
          case "missing_documents": {
            const checkTypes = specificType
              ? [specificType]
              : [...VENDOR_DOC_SEARCH_MANDATORY];
            for (const vd of vendorDocs) {
              const present = canonicalDocTypesPresent(vd.docs);
              const missing = checkTypes.filter((t) => !present.has(t));
              if (missing.length > 0) {
                results.push({
                  vendor: vd.vendor,
                  docs: [],
                  reason: `Missing: ${missing.map((t) => getDocumentTypeLabel(t) || t).join(", ")}`,
                });
              }
            }
            break;
          }
          case "has_document_type": {
            const docType = specificType || (args.documentType || "").toLowerCase();
            for (const vd of vendorDocs) {
              const matching = vd.docs.filter(
                (d: any) => canonicalDocType(d.doc_type, d.doc_name) === docType,
              );
              if (matching.length > 0) {
                results.push({
                  vendor: vd.vendor,
                  docs: matching,
                  reason: `Has ${matching.length} ${getDocumentTypeLabel(docType) || docType} document(s)`,
                });
              }
            }
            break;
          }
          case "complete": {
            const requiredTypes = ["pan_card", "gst_certificate", "cancelled_cheque"];
            for (const vd of vendorDocs) {
              const present = canonicalDocTypesPresent(vd.docs);
              const hasAll = requiredTypes.every((t) => present.has(t));
              if (hasAll) {
                results.push({ vendor: vd.vendor, docs: vd.docs, reason: `All mandatory documents present (${vd.docs.length} total)` });
              }
            }
            break;
          }
        }

        results = results.slice(0, limit);

        if (results.length === 0) {
          return {
            result: `No vendors found matching document filter "${filter}"${dateScopeSuffix}${args.documentType ? ` for type "${args.documentType}"` : ""}.`,
          };
        }

        const formatted = results.map((r, idx) => {
          let entry = `**${idx + 1}. ${r.vendor.companyName || "N/A"}** (ID: ${r.vendor.id})\n`;
          entry += `   ${r.reason}\n`;
          if (r.docs.length > 0 && filter !== "no_documents" && filter !== "missing_documents") {
            r.docs.forEach((d: any) => {
              const expStr = d.expiry_date ? ` (Expires: ${new Date(d.expiry_date).toLocaleDateString()})` : "";
              entry += `   - ${formatDocumentDisplayLabel(d)}${expStr}\n`;
            });
          }
          return entry;
        }).join("\n");

        return { result: `Found ${results.length} vendor(s) matching "${filter}"${dateScopeSuffix}:\n\n${formatted}` };
      }

      case "compare_vendors": {
        const vendorIds: number[] = args.vendorIds || [];
        const vendorNames: string[] = args.vendorNames || [];
        const requestedMetrics =
          normalizeComparisonMetrics(args.metrics) ??
          extractComparisonMetricsFromPrompt(context.originalPrompt || "");
        const metricsToInclude = requestedMetrics ?? ALL_COMPARISON_METRIC_KEYS.filter((key) => key !== "id");
        const includeId = !requestedMetrics || requestedMetrics.length > 1;
        const fetchPlan = buildComparisonFetchPlan(
          metricsToInclude.filter((key) => key !== "id"),
        );

        if (vendorIds.length === 0 && vendorNames.length === 0) {
          return { result: "Please provide vendor IDs or names to compare." };
        }

        const resolvedIds: number[] = [...vendorIds.filter((id) => Number.isFinite(Number(id)) && Number(id) > 0)];
        const normalizedVendorNames = vendorNames
          .map((name) => String(name || "").replace(/^@+/, "").trim())
          .filter((name) => name.length > 0);
        const resolvedIdSet = new Set(resolvedIds);
        const shouldResolveNames = normalizedVendorNames.length > 0 && resolvedIdSet.size < 2;

        if (shouldResolveNames) {
          const resolvedFromNames = await Promise.all(
            normalizedVendorNames.map((name) => resolveSupplierIdForComparison(name)),
          );
          for (const resolvedId of resolvedFromNames) {
            if (resolvedId != null && !resolvedIdSet.has(resolvedId)) {
              resolvedIds.push(resolvedId);
              resolvedIdSet.add(resolvedId);
            }
          }
        }
        const resolvedIdsUnique = Array.from(
          new Set(resolvedIds.filter((id) => Number.isFinite(Number(id)) && Number(id) > 0)),
        );

        const explicitIdCount = vendorIds.filter((id) => Number.isFinite(Number(id)) && Number(id) > 0).length;
        const expectedVendorCount =
          explicitIdCount > 0 && normalizedVendorNames.length > 0
            ? explicitIdCount + normalizedVendorNames.length
            : Math.max(explicitIdCount, normalizedVendorNames.length);
        const finalVendorIds =
          expectedVendorCount > 0
            ? resolvedIdsUnique.slice(0, expectedVendorCount)
            : resolvedIdsUnique;

        const aiRanks = fetchPlan.needAiRanks
          ? await fetchSupplierAiRanksByIds(finalVendorIds)
          : { enabled: false, byId: new Map<string, SupplierAiRankRow>() };

        const metricHeading =
          requestedMetrics && requestedMetrics.length === 1
            ? COMPARISON_METRIC_LABELS[requestedMetrics[0]]
            : requestedMetrics && requestedMetrics.length > 1
              ? requestedMetrics.map((key) => COMPARISON_METRIC_LABELS[key]).join(", ")
              : null;

        let comparison = metricHeading
          ? `## Vendor Comparison — ${metricHeading}\n\n`
          : `## Vendor Comparison\n\n`;

        const sections = (
          await Promise.all(
            finalVendorIds.map((id, idx) =>
              buildCompareVendorSection(
                idx + 1,
                id,
                fetchPlan,
                metricsToInclude,
                includeId,
                aiRanks,
              ),
            ),
          )
        ).filter((section): section is string => section != null);

        if (sections.length < 2) {
          return { result: "Need at least 2 active vendors to compare. Could not resolve enough active vendors from the provided names/IDs." };
        }

        comparison += sections
          .map((section, idx) => section.replace(/^###\s+\d+\./m, `### ${idx + 1}.`))
          .join("");

        return { result: comparison };
      }

      case "prepare_invite_vendor": {
        const email = String(args.email || "").trim();
        const companyName = String(args.companyName || "").trim();

        if (!companyName) {
          return { result: "Please provide the supplier's company name to send the invitation." };
        }
        if (!email) {
          return { result: "Please provide an email address to send the invitation." };
        }

        const emailCheck = validateOnboardEmail(email);
        if (!emailCheck.valid) {
          return { result: `${emailCheck.message}. Please provide a valid email address to send the invitation.` };
        }

        if (isPlaceholderFieldValue("companyName", companyName)) {
          return { result: "Please provide the supplier's actual company name — placeholder/sample values like \"Supplier Name\" are not accepted." };
        }

        // Already-active supplier or internal org user cannot be invited at all (hard block).
        const activeSupplier = await vendorRepo.findActiveSupplierByEmail(email);
        if (activeSupplier) {
          return { result: `${vendorService.ACTIVE_SUPPLIER_EMAIL_EXISTS_MSG} Please try with a different email address.` };
        }
        const orgUserExists = await vendorRepo.checkOrgUserEmailExists(email);
        if (orgUserExists) {
          return { result: `The email **${email}** belongs to an internal organisation user and cannot be invited as a supplier. Please use a different email address.` };
        }

        // Soft duplicates (existing non-active supplier / same company name / pending invitation)
        // do NOT block — surface a colored warning and let the user confirm to send anyway.
        const dupWarnings: string[] = [];
        if (await vendorRepo.checkOnboardEmailExists(email)) {
          dupWarnings.push(`the email **${email}** is already linked to an existing supplier record`);
        }
        if (await vendorRepo.checkOnboardCompanyExists(companyName)) {
          dupWarnings.push(`a supplier or pending invitation already exists with the company name **${companyName}**`);
        }

        const inviteData = { ...args, companyName, email, inviteAnyway: dupWarnings.length > 0 };
        let summary = `## Vendor Invitation Preview\n\n`;
        if (dupWarnings.length > 0) {
          const joined = dupWarnings.join("; and ");
          summary += `[!WARNING] ${joined.charAt(0).toUpperCase()}${joined.slice(1)}. You can still send this invitation — click Confirm to proceed, or change the details.\n\n`;
        }
        summary += `**Company Name:** ${companyName}\n`;
        summary += `**Email:** ${email}\n`;
        summary += `**Action:** Send registration invitation\n`;

        return {
          result: summary,
          pendingAction: {
            type: "invite",
            data: inviteData,
            summary: `Send invitation to "${companyName}" at ${email}`,
          },
        };
      }

      case "execute_invite_vendor": {
        if (!args._confirmed) {
          return { result: "I've prepared the invitation details above. Click the **Confirm** button or reply with \"yes\" / \"proceed\" to send this invitation, or **Cancel** to abort." };
        }
        const email = String(args.email || "").trim();
        const companyName = String(args.companyName || "").trim();

        const validation = await validateVendorInviteEntry(
          { companyName, email },
          "Invitation",
          new Set<string>(),
          new Set<string>(),
          // The user reached confirmation after seeing any duplicate warning — re-inviting a previously-invited
          // supplier should resend the invitation rather than be blocked.
          { allowExistingInvitation: true },
        );
        if (!validation.ok) {
          return { result: validation.error };
        }

        const result = await vendorService.inviteSupplier({
          companyName: validation.normalized.companyName,
          email: validation.normalized.email,
          inviteAnyway: true,
        }, sessionUser);

        if ((result as any).success) {
          return { result: `Invitation successfully sent to **${validation.normalized.companyName}** at ${validation.normalized.email}!\n\n- **Invitation ID**: ${(result as any).id}\n- The SUPPLIER will receive an email with registration instructions.` };
        } else {
          return { result: `Could not send invitation: ${(result as any).message || "Unknown error"}` };
        }
      }

      case "prepare_bulk_invite_vendors": {
        const invites = normalizeInviteEntries(args.invites);
        if (invites.length === 0) {
          return { result: "Please provide at least two suppliers with company name and email to send vendor invitations." };
        }
        if (invites.length === 1) {
          return { result: "Only one supplier was found. Add more suppliers to send multiple invitations at once, or invite them one at a time." };
        }

        const validation = await validateVendorInviteList(invites);
        if (!validation.ok) {
          return { result: validation.errors.join("\n\n") };
        }

        const inviteData = { invites: validation.normalized };
        return {
          result: buildBulkInvitePreview(validation.normalized),
          pendingAction: {
            type: "bulk_invite",
            data: inviteData,
            summary: `Send ${validation.normalized.length} vendor registration invitations`,
          },
        };
      }

      case "execute_bulk_invite_vendors": {
        if (!args._confirmed) {
          return { result: "I've prepared the vendor invitation details above. Click the **Confirm** button or reply with \"yes\" / \"proceed\" to send all invitations, or **Cancel** to abort." };
        }

        const invites = normalizeInviteEntries(args.invites);
        if (invites.length < 2) {
          return { result: "At least two suppliers are required. Please prepare the vendor invitations again." };
        }

        const validation = await validateVendorInviteList(invites);
        if (!validation.ok) {
          return { result: validation.errors.join("\n\n") };
        }

        const successes: string[] = [];
        const failures: string[] = [];

        for (const invite of validation.normalized) {
          try {
            const result = await vendorService.inviteSupplier(
              { companyName: invite.companyName, email: invite.email },
              sessionUser,
            );
            if ((result as any).success) {
              successes.push(
                `- **${invite.companyName}** (${invite.email}) — Invitation ID: ${(result as any).id}`,
              );
            } else {
              failures.push(
                `- **${invite.companyName}** (${invite.email}): ${(result as any).message || "Unknown error"}`,
              );
            }
          } catch (error: any) {
            failures.push(
              `- **${invite.companyName}** (${invite.email}): ${error?.message || "Unknown error"}`,
            );
          }
        }

        let resultText = `## Vendor Invitation Results\n\n`;
        resultText += `**Sent:** ${successes.length} of ${validation.normalized.length}\n\n`;
        if (successes.length > 0) {
          resultText += `### Successful\n${successes.join("\n")}\n\n`;
        }
        if (failures.length > 0) {
          resultText += `### Failed\n${failures.join("\n")}\n`;
        } else if (successes.length > 0) {
          resultText += `All invited suppliers will receive an email with registration instructions.`;
        }
        return { result: resultText.trim() };
      }

      default:
        return { result: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`Tool execution error [${toolName}]:`, error);
    return { result: `Error executing ${toolName}: ${error.message || "Unknown error occurred"}` };
  }
}

export async function processVendorQuery(
  prompt: string,
  conversationHistory: ConversationMessage[] = [],
  sessionUser?: any,
  confirmAction?: { type: string; data: any },
  mentions: SupplierMention[] = [],
  businessUserMentions: BusinessUserMention[] = [],
  itemMentions: ItemMention[] = [],
  bidMentions: BidMention[] = [],
  prMentions: PrMention[] = [],
  poMentions: PoMention[] = [],
  invoiceMentions: InvoiceMention[] = [],
): Promise<VendorAgentResponse> {
  let selectedVendorForRun: SelectedVendorContext | undefined;
  const comparisonIntentDetected = isLikelyComparisonIntent(prompt);
  const normalizedMentions = normalizeSupplierMentions(mentions);

  if (confirmAction) {
    if (confirmAction.type === "onboard") {
      const toolResult = await executeToolCall(
        "execute_onboard_vendor",
        { ...confirmAction.data, _confirmed: true },
        sessionUser,
        { originalPrompt: prompt || confirmAction.data?.originalPrompt || "" },
      );
      return vendorAgentResponse(toolResult.result);
    } else if (confirmAction.type === "invite") {
      const toolResult = await executeToolCall(
        "execute_invite_vendor",
        { ...confirmAction.data, _confirmed: true },
        sessionUser,
        { originalPrompt: prompt || confirmAction.data?.originalPrompt || "" },
      );
      return vendorAgentResponse(toolResult.result);
    } else if (confirmAction.type === "bulk_invite") {
      const toolResult = await executeToolCall(
        "execute_bulk_invite_vendors",
        { ...confirmAction.data, _confirmed: true },
        sessionUser,
        { originalPrompt: prompt || confirmAction.data?.originalPrompt || "" },
      );
      return vendorAgentResponse(toolResult.result);
    } else if (confirmAction.type === "select_vendor") {
      /* Vendor selection has been intentionally disabled.
      const selected = confirmAction.data?.selectedVendor;
      if (!selected?.id || !selected?.companyName) {
        return { response: "Please select a valid vendor to continue." };
      }
      selectedVendorForRun = {
        supplierId: Number(selected.id),
        companyName: String(selected.companyName),
        emailId: selected.emailId || null,
      };
      prompt = String(confirmAction.data?.originalPrompt || prompt || "").trim();
      if (!prompt) return { response: "Please provide a query to continue after selecting a vendor." };
      */
      return { response: VENDOR_SELECTION_UNAVAILABLE_MSG };
    }
  }

  const basePrompt = selectedVendorForRun
    ? `${prompt}

Use this user-confirmed vendor for single-vendor operations:
- Supplier ID: ${selectedVendorForRun.supplierId}
- Company Name: ${selectedVendorForRun.companyName}
- Email: ${selectedVendorForRun.emailId || "N/A"}`
    : isLikelyOnboardingFollowup(prompt, conversationHistory)
      ? `${prompt}

This is a follow-up reply in an active vendor onboarding flow (missing-field completion). Treat this reply as onboarding data and continue onboarding by collecting/using the missing field values. Do not trigger vendor selection.`
    : prompt;

  const effectivePrompt = applyAllMentionsToPrompt(basePrompt, {
    mentions,
    businessUserMentions,
    itemMentions,
    bidMentions,
    prMentions,
    poMentions,
    invoiceMentions,
  });

  if (!confirmAction && comparisonIntentDetected && !selectedVendorForRun) {
    const vendorNames = extractVendorNamesFromComparisonPrompt(prompt);
    const mentionVendorIds = normalizedMentions
      .map((mention) => Number(mention.supplierId))
      .filter((id) => Number.isFinite(id) && id > 0);
    const shouldAutoCompareFromMentions = mentionVendorIds.length >= 2;
    if (vendorNames.length >= 2 || shouldAutoCompareFromMentions) {
      const compareMetrics = extractComparisonMetricsFromPrompt(prompt);
      const compareVendorIds = mentionVendorIds.length > 0 ? mentionVendorIds : [];
      const compareVendorNames = shouldAutoCompareFromMentions
        ? []
        : mentionVendorIds.length > 0
          ? vendorNames.filter((name) => {
              const normalized = String(name).replace(/^@+/, "").trim().toLowerCase();
              return !normalizedMentions.some(
                (m) =>
                  m.companyName.trim().toLowerCase() === normalized ||
                  String(m.display || "").replace(/^@+/, "").trim().toLowerCase() === normalized,
              );
            })
          : vendorNames;
      const compareResult = await executeToolCall(
        "compare_vendors",
        {
          vendorIds: compareVendorIds,
          vendorNames: compareVendorNames,
          ...(compareMetrics ? { metrics: compareMetrics } : {}),
        },
        sessionUser,
        { originalPrompt: prompt, selectedVendor: selectedVendorForRun, comparisonIntent: true, blockVendorSelection: true }
      );
      return { response: compareResult.result };
    }
  }

  // A single @mention in chat already identifies the supplier; treat like dropdown confirmation
  // so tools get selectedVendor context and we do not open the select_vendor UI.
  const onboardingIntentEarly =
    isLikelyOnboardingIntent(prompt) || isLikelyOnboardingFollowup(prompt, conversationHistory);
  if (
    !selectedVendorForRun &&
    normalizedMentions.length === 1 &&
    !comparisonIntentDetected &&
    !onboardingIntentEarly
  ) {
    const m = normalizedMentions[0];
    selectedVendorForRun = {
      supplierId: m.supplierId,
      companyName: m.companyName,
      emailId: m.emailId,
    };
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${VENDOR_AGENT_SYSTEM_PROMPT}\n\nCurrent date: ${new Date().toISOString().slice(0, 10)}`,
    },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: effectivePrompt },
  ];

  try {
    const onboardingFollowupDetected = isLikelyOnboardingFollowup(prompt, conversationHistory);
    const onboardingIntentDetected = isLikelyOnboardingIntent(prompt) || onboardingFollowupDetected;
    const blockVendorSelection =
      VENDOR_SELECTION_DISABLED ||
      comparisonIntentDetected ||
      onboardingIntentDetected ||
      hasRecentOnboardingContext(conversationHistory) ||
      normalizedMentions.length > 0;
    /* Vendor selection has been intentionally disabled — always exclude request_vendor_selection. */
    const activeTools = TOOLS.filter((tool) => (tool as any)?.function?.name !== "request_vendor_selection");

    const openai = await getAIClient();
    const modelName = await getAIModelName();
    let completion = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: activeTools,
      tool_choice: "auto",
      temperature: 0.0,
      max_tokens: 6000,
    });

    let assistantMessage = completion.choices[0]?.message;
    let pendingAction: PendingAction | undefined;

    const fallbackRegexDecision = shouldInjectVendorSelectionOnNoTools(prompt);
    let noToolsIntent: VendorAgentNoToolsIntentRouterResult = {
      forceGetVendorStats: false,
      needsVendorSelection: false,
    };
    const shouldRunNoToolsRouter =
      !confirmAction &&
      !(assistantMessage?.tool_calls?.length) &&
      !onboardingIntentDetected &&
      !blockVendorSelection &&
      !selectedVendorForRun &&
      !comparisonIntentDetected &&
      (conversationHistory.length > 0 || !fallbackRegexDecision);

    if (shouldRunNoToolsRouter) {
      noToolsIntent = await runVendorAgentNoToolsIntentRouter(openai, modelName, prompt, {
        conversationOngoing: conversationHistory.length > 0,
      });
    }

    if (
      !confirmAction &&
      conversationHistory.length > 0 &&
      !(assistantMessage?.tool_calls?.length) &&
      noToolsIntent.forceGetVendorStats
    ) {
      const retryCompletion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools: activeTools,
        tool_choice: { type: "function", function: { name: "get_vendor_stats" } } as any,
        temperature: 0,
        max_tokens: 800,
      });
      assistantMessage = retryCompletion.choices[0]?.message;
    }

    const hasInitialToolCalls = (assistantMessage?.tool_calls?.length || 0) > 0;

    /* Vendor selection has been intentionally disabled.
    if (
      !selectedVendorForRun &&
      !hasInitialToolCalls &&
      !onboardingIntentDetected &&
      !blockVendorSelection &&
      fallbackRegexDecision
    ) {
      const pendingAction = await buildVendorSelectionPendingAction({}, { originalPrompt: prompt, selectedVendor: selectedVendorForRun });
      return {
        response: "Please select a vendor from the dropdown to continue.",
        pendingAction,
      };
    }

    if (
      !selectedVendorForRun &&
      !hasInitialToolCalls &&
      !fallbackRegexDecision &&
      noToolsIntent.needsVendorSelection &&
      !onboardingIntentDetected &&
      !blockVendorSelection
    ) {
      const pendingAction = await buildVendorSelectionPendingAction({}, { originalPrompt: prompt, selectedVendor: selectedVendorForRun });
      return {
        response: "Please select a vendor from the dropdown to continue.",
        pendingAction,
      };
    }
    */

    let loopCount = 0;
    const MAX_LOOPS = 5;
    let lastChart: AgentChartSpec | undefined;
    let lastCharts: AgentChartSpec[] | undefined;
    const collectedCharts: AgentChartSpec[] = [];
    let lastCompareVendorsResult: string | undefined;
    let executedMutatingTool = false;
    let prepareOnboardVendorCalled = false;
    let prepareBulkInviteCalled = false;
    const collectedInvites: VendorInviteEntry[] = [];

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

        let effectiveFnName = fnName;
        let effectiveFnArgs = fnArgs;

        const rankPrimary = isPrimarilyAiSupplierRankQuery(prompt);
        const resolvedSupplierId = Number(fnArgs.supplierId ?? selectedVendorForRun?.supplierId);
        const hasResolvedSupplier = Number.isFinite(resolvedSupplierId) && resolvedSupplierId > 0;

        if (rankPrimary && hasResolvedSupplier) {
          if (fnName === "vendor_risk_summary") {
            effectiveFnName = "get_vendor_details";
            effectiveFnArgs = { supplierId: resolvedSupplierId, _rankOnly: true };
          } else if (fnName === "get_vendor_details") {
            effectiveFnArgs = { ...fnArgs, supplierId: resolvedSupplierId, _rankOnly: true };
          }
        }

        if (agentToolIsMutatingForChartGate(effectiveFnName)) {
          executedMutatingTool = true;
        }
        if (effectiveFnName === "prepare_onboard_vendor") {
          prepareOnboardVendorCalled = true;
        }
        if (effectiveFnName === "prepare_bulk_invite_vendors") {
          prepareBulkInviteCalled = true;
        }

        const toolResult = await executeToolCall(effectiveFnName, effectiveFnArgs, sessionUser, {
          originalPrompt: prompt,
          selectedVendor: selectedVendorForRun,
          onboardingFollowup: onboardingFollowupDetected,
          blockVendorSelection,
          comparisonIntent: comparisonIntentDetected,
        });

        if (effectiveFnName === "compare_vendors" && toolResult.result) {
          lastCompareVendorsResult = toolResult.result;
        }

        if (toolResult.pendingAction) {
          if (toolResult.pendingAction.type === "bulk_invite") {
            prepareBulkInviteCalled = true;
            pendingAction = toolResult.pendingAction;
            collectedInvites.length = 0;
            for (const invite of normalizeInviteEntries(toolResult.pendingAction.data?.invites)) {
              appendCollectedInvite(collectedInvites, invite);
            }
          } else if (toolResult.pendingAction.type === "invite") {
            appendCollectedInvite(collectedInvites, {
              companyName: toolResult.pendingAction.data?.companyName,
              email: toolResult.pendingAction.data?.email,
            });
            pendingAction = toolResult.pendingAction;
          } else {
            pendingAction = toolResult.pendingAction;
          }
          /* Vendor selection has been intentionally disabled.
          if (toolResult.pendingAction.type === "select_vendor") {
            return { response: toolResult.result, pendingAction };
          }
          */
          if (toolResult.pendingAction.type === "select_vendor") {
            pendingAction = undefined;
          }
        }
        if (toolResult.charts?.length) {
          for (const spec of toolResult.charts) {
            const key = `${spec.kind}|${spec.title || ""}|${spec.xKey}`;
            const exists = collectedCharts.some((c) => `${c.kind}|${c.title || ""}|${c.xKey}` === key);
            if (!exists) collectedCharts.push(spec);
          }
          lastCharts = toolResult.charts;
          lastChart = undefined;
        } else if (toolResult.chart) {
          const key = `${toolResult.chart.kind}|${toolResult.chart.title || ""}|${toolResult.chart.xKey}`;
          const exists = collectedCharts.some((c) => `${c.kind}|${c.title || ""}|${c.xKey}` === key);
          if (!exists) collectedCharts.push(toolResult.chart);
          lastChart = toolResult.chart;
          lastCharts = undefined;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult.result,
        } as any);
      }

      if (lastCompareVendorsResult) {
        break;
      }

      completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools: activeTools,
        tool_choice: "auto",
        temperature: 0.0,
        max_tokens: 6000,
      });

      assistantMessage = completion.choices[0]?.message;
    }

    // A long supplier list can exceed max_tokens and get cut off mid-response
    // (finish_reason "length"). Continue generation until the list completes.
    let finishReason = (completion as any)?.choices?.[0]?.finish_reason;
    const MAX_CONTINUATIONS = 3;
    let continuations = 0;
    while (
      finishReason === "length" &&
      assistantMessage?.content &&
      continuations < MAX_CONTINUATIONS
    ) {
      continuations++;
      messages.push({ role: "assistant", content: assistantMessage.content } as any);
      messages.push({
        role: "user",
        content:
          'Your previous reply was cut off mid-output. Continue EXACTLY from where you stopped — same format, numbering, and detail level, no preamble, no repeated entries. If nothing remains to output, reply with exactly: DONE',
      } as any);
      const contCompletion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools: activeTools,
        tool_choice: "none" as any,
        temperature: 0.0,
        max_tokens: 6000,
      });
      const contContent = (contCompletion.choices[0]?.message?.content || "").trim();
      finishReason = (contCompletion as any)?.choices?.[0]?.finish_reason;
      if (!contContent || /^DONE\.?$/i.test(contContent)) break;
      assistantMessage = {
        ...(assistantMessage as any),
        content: `${(assistantMessage as any).content}\n${contContent}`,
      };
    }

    if (collectedInvites.length >= 2) {
      const bulkPending = await buildBulkInvitePendingAction(collectedInvites);
      if (bulkPending) {
        pendingAction = bulkPending;
        prepareBulkInviteCalled = true;
      }
    }

    let response =
      lastCompareVendorsResult ||
      assistantMessage?.content ||
      "I apologize, I couldn't process your request. Please try rephrasing.";

    if (pendingAction?.type === "bulk_invite") {
      const previewInvites = normalizeInviteEntries(pendingAction.data?.invites);
      if (previewInvites.length >= 2) {
        response = buildBulkInvitePreview(previewInvites);
      }
    }

    const normalizedResponse = response.toLowerCase();
    const asksToProceed =
      /\b(do you want to proceed|would you like to proceed|proceed with onboarding|proceed with onboarding this vendor)\b/i.test(response);
    const previewHints = [
      "company name",
      "address",
      "legal entity",
      "city",
      "country",
      "postal code",
      "contact",
      "email",
      "mobile",
    ];
    const presentPreviewHints = previewHints.filter((hint) => normalizedResponse.includes(hint)).length;
    const looksLikeOnboardProceedPrompt = asksToProceed && presentPreviewHints >= 4;

    const bulkInviteIntentDetected = isLikelyBulkInviteIntent(prompt);

    if (
      !confirmAction &&
      bulkInviteIntentDetected &&
      (!prepareBulkInviteCalled || pendingAction?.type !== "bulk_invite")
    ) {
      const prepareTool = TOOLS.find((tool) => (tool as any)?.function?.name === "prepare_bulk_invite_vendors");
      if (prepareTool) {
        const forcedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          ...messages,
          { role: "assistant", content: response },
        ];
        const forcedPrepare = await openai.chat.completions.create({
          model: modelName,
          messages: forcedMessages,
          tools: [prepareTool],
          tool_choice: { type: "function", function: { name: "prepare_bulk_invite_vendors" } } as any,
          temperature: 0,
          max_tokens: 1500,
        });

        const forcedMessage = forcedPrepare.choices[0]?.message;
        const forcedToolCall = forcedMessage?.tool_calls?.[0] as any;
        if (forcedToolCall?.function?.name === "prepare_bulk_invite_vendors") {
          let forcedArgs: any = {};
          try {
            forcedArgs = JSON.parse(forcedToolCall.function.arguments || "{}");
          } catch {
            forcedArgs = {};
          }
          const forcedResult = await executeToolCall("prepare_bulk_invite_vendors", forcedArgs, sessionUser, {
            originalPrompt: prompt,
            selectedVendor: selectedVendorForRun,
            onboardingFollowup: onboardingFollowupDetected,
            blockVendorSelection,
            comparisonIntent: comparisonIntentDetected,
          });
          if (forcedResult.pendingAction) {
            return vendorAgentResponse(forcedResult.result, { pendingAction: forcedResult.pendingAction });
          }
          if (forcedResult.result) {
            return vendorAgentResponse(forcedResult.result, { pendingAction: forcedResult.pendingAction });
          }
        }
      }
    } else if (
      !confirmAction &&
      !pendingAction &&
      onboardingIntentDetected &&
      !prepareOnboardVendorCalled
    ) {
      const prepareTool = TOOLS.find((tool) => (tool as any)?.function?.name === "prepare_onboard_vendor");
      if (prepareTool) {
        const forcedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          ...messages,
          { role: "assistant", content: response },
        ];
        const forcedPrepare = await openai.chat.completions.create({
          model: modelName,
          messages: forcedMessages,
          tools: [prepareTool],
          tool_choice: { type: "function", function: { name: "prepare_onboard_vendor" } } as any,
          temperature: 0,
          max_tokens: 1000,
        });

        const forcedMessage = forcedPrepare.choices[0]?.message;
        const forcedToolCall = forcedMessage?.tool_calls?.[0] as any;
        if (forcedToolCall?.function?.name === "prepare_onboard_vendor") {
          let forcedArgs: any = {};
          try {
            forcedArgs = JSON.parse(forcedToolCall.function.arguments || "{}");
          } catch {
            forcedArgs = {};
          }
          const forcedResult = await executeToolCall("prepare_onboard_vendor", forcedArgs, sessionUser, {
            originalPrompt: prompt,
            selectedVendor: selectedVendorForRun,
            onboardingFollowup: onboardingFollowupDetected,
            blockVendorSelection,
            comparisonIntent: comparisonIntentDetected,
          });
          if (forcedResult.result) {
            return { response: forcedResult.result, pendingAction: forcedResult.pendingAction };
          }
        }
      }
    } else if (!confirmAction && !pendingAction && looksLikeOnboardProceedPrompt) {
      const prepareTool = TOOLS.find((tool) => (tool as any)?.function?.name === "prepare_onboard_vendor");
      if (prepareTool) {
        const forcedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          ...messages,
          { role: "assistant", content: response },
        ];
        const forcedPrepare = await openai.chat.completions.create({
          model: modelName,
          messages: forcedMessages,
          tools: [prepareTool],
          tool_choice: { type: "function", function: { name: "prepare_onboard_vendor" } } as any,
          temperature: 0,
          max_tokens: 1000,
        });

        const forcedMessage = forcedPrepare.choices[0]?.message;
        const forcedToolCall = forcedMessage?.tool_calls?.[0] as any;
        if (forcedToolCall?.function?.name === "prepare_onboard_vendor") {
          let forcedArgs: any = {};
          try {
            forcedArgs = JSON.parse(forcedToolCall.function.arguments || "{}");
          } catch {
            forcedArgs = {};
          }
          const forcedResult = await executeToolCall("prepare_onboard_vendor", forcedArgs, sessionUser, {
            originalPrompt: prompt,
            selectedVendor: selectedVendorForRun,
            onboardingFollowup: onboardingFollowupDetected,
            blockVendorSelection,
            comparisonIntent: comparisonIntentDetected,
          });
          if (forcedResult.pendingAction) {
            return { response: forcedResult.result, pendingAction: forcedResult.pendingAction };
          }
          if (forcedResult.result) {
            return { response: forcedResult.result, pendingAction: forcedResult.pendingAction };
          }
        }
      }
    }

    const suppressCharts = !!(pendingAction || executedMutatingTool);
    let chart: AgentChartSpec | undefined;
    let charts: AgentChartSpec[] | undefined;
    if (!suppressCharts) {
      if (collectedCharts.length > 1) charts = collectedCharts;
      else if (collectedCharts.length === 1) chart = collectedCharts[0];
      else if (lastCharts && lastCharts.length > 1) charts = lastCharts;
      else if (lastCharts?.length === 1) chart = lastCharts[0];
      else if (lastChart) chart = lastChart;
    }

    return vendorAgentResponse(response, { pendingAction, chart, charts });
  } catch (error: any) {
    console.error("Supplier Agent API error:", error);
    return {
      response: "I'm having trouble connecting to the AI service. Please try again in a moment.",
    };
  }
}
