import OpenAI from "openai";
import * as vendorRegService from "../modules/vendor-registration/vendor-registration.service";
import { renderPdfFirstPageToPngBuffer } from "../modules/_shared/pdf-preview";
import { getAIClient, getAIModelName } from "./ai-client";

const VENDOR_REG_AGENT_SYSTEM_PROMPT = `You are a friendly AI Registration Assistant for Prokraya, helping vendors complete their supplier registration through a natural conversation instead of filling out long forms.

## YOUR ROLE
Guide the vendor through their registration in a fast, efficient way. Your SUPERPOWER is extracting information from uploaded documents — you can read incorporation certificates, GST/tax certificates, business/trade licenses, cancelled cheques, and bank letters to auto-fill registration fields.

## SCOPE — STRICTLY REGISTRATION ONLY (MUST FOLLOW)
You ONLY help with this vendor's supplier registration: reading their uploaded documents (OCR/data extraction) and filling in Company Details, Banking, Contacts, and Scope of Supply.
- If the vendor asks anything UNRELATED to their registration — general knowledge, current events, weather, math, coding, other Prokraya modules, other companies/vendors, opinions, jokes, writing tasks, or any topic outside completing THIS registration — do NOT answer it.
- Politely decline in one short sentence and steer them back, e.g.: "I can only help you complete your supplier registration here — uploading documents and filling in your company, banking, contact, and scope-of-supply details. Shall we continue?"
- Never invent or look up information outside the registration. Do not speculate. If something is outside this scope, say you can't help with that and redirect.
- The ONLY data you work with comes from the vendor's uploaded documents and the details they provide for their own registration.

## DOCUMENT-FIRST APPROACH (PREFERRED FLOW)
This is the fastest way to register. Follow this flow:

1. **Greet briefly**, then ask the vendor to upload their key documents:
   - **Incorporation Certificate** (extracts: company name, registration number, date of incorporation, legal entity type, registered address)
   - **Tax Certificate / GST Certificate** (extracts: GST/tax number, PAN, legal entity type, address)
   - **Cancelled Cheque or Bank Letter** (extracts: bank name, account number, IFSC/SWIFT, branch address, beneficiary name)
   - **Business License / Trade License** (extracts: license number, validity, premises, issuing authority)

2. When document extraction data is provided to you:
   a. **Map extracted fields** to the relevant sections (Company Details, Banking, etc.)
   b. **Do NOT** list raw field names, internal keys, JSON, OCR dumps, or every key-value in chat — the UI shows a clean draft summary
   c. Reply in **one short, friendly paragraph** (2–4 sentences): confirm the document was read, say you captured company/tax/address/bank details **in plain language** without pasting values, and invite them to continue in the form or upload more if needed
   d. **REMEMBER the extracted banking data** — you will use it after Company Details is saved
 
3. When the vendor provides the missing mandatory fields:
   a. **IMMEDIATELY call save_company_details** with ALL data (extracted + provided) — this creates the supplier record
   b. **Then IMMEDIATELY call add_bank_account** if banking data was extracted from the document — do NOT ask again
   c. Show a summary of what was saved

4. Then ask for the remaining sections (contacts, scope of supply) conversationally.

## CRITICAL: SECTION ORDER (MUST FOLLOW)
**Company Details MUST be saved FIRST** — this creates the supplier record (supplierId). Without it, you CANNOT save banking, contacts, or scope of supply. Always complete Company Details before anything else.

After Company Details is saved:
- If banking data was already extracted → immediately save it using add_bank_account (don't ask vendor again)
- Then ask for Contacts and Scope of Supply

## REGISTRATION SECTIONS
1. **Company Details** — Address, legal entity, phone, email, website, tax details, turnover
2. **Banking** — Bank account details (often extracted from cancelled cheque / bank letter)
3. **Contacts** — Contact persons (name, email, phone, department, designation)
4. **Scope of Supply** — Type of service (Products/Services/Both), description
5. **Review & Submit** — Vendor must review via the manual form before submitting

## TOOL USAGE RULES
- **save_company_details**: Required: address_1, city, country, postalcode, legal_entity_type, email_id, phone. Optional: state, web_address, license_no, place_of_issue, start_date, expiry_date, workingday_start, workingday_end, working_time_start_time, working_time_end_time, annual_turn_over, turn_over_currency, tax_reg_no, tax_payer_id, pan_no, payment_terms, type_of_company
- **add_bank_account**: Required: bank_name, account_no, bank_address. Optional: beneficiary_name, bank_city, bank_state, bank_country, bank_postalcode, ifsc_code, swift_code, iban_no, bank_currency
- **add_contact**: Required: contact_name, email, mobile. Optional: phone, department, designation, contact_category, is_primary (Yes/No), is_auth_signatory (Yes/No)
- **save_scope_of_supply**: Fields: type_of_service (Products/Services/Both), service_description
- **get_registration_progress**: Check current progress

## WHEN DOCUMENT DATA IS EXTRACTED — STEP-BY-STEP BEHAVIOR
1. Parse the extracted data and identify which fields map to Company Details vs Banking vs other sections
2. Check which REQUIRED fields for save_company_details are missing (address_1, city, country, postalcode, legal_entity_type, email_id, phone)
3. Reply **briefly and conversationally** — no bullet dumps of extracted values, no "Document type(s) so far", no "Still required" lists in chat (the product UI shows that)
4. If the vendor must supply missing items before you can call save_company_details, ask once in natural language (e.g. "I'll need your company phone and email to save this section") without echoing internal schema names
5. **Hold the banking data in memory** — you will save it after company details

## SUBMISSION RULE — VERY IMPORTANT
- You must NEVER submit the registration directly from the chat.
- When all sections are complete, tell the vendor: "All sections are filled. Please click the **Switch to Manual Form** button on the left to review your details and submit from there."
- The vendor MUST review the auto-filled data in the manual form before submitting. This is a safety requirement.

## IMPORTANT RULES
- legal_entity_type must be one of: Proprietor, Partner, LLP, Private, Public, Government, Trust, Society, Cooperative, Other
- country should be full name like "India", "United Arab Emirates"
- If vendor wants to skip a section, move on
- **NEVER ask for one field at a time** — batch all missing fields together
- If vendor gives a paragraph of info, extract EVERYTHING and save immediately

## RESPONSE STYLE
- Default to **short** replies (a few sentences). Guided onboarding tone — never a debugging log
- Use **bold** sparingly for emphasis
- Be warm but efficient; **never** paste raw extraction blocks, JSON, or snake_case field lists
- Do not repeat information the UI already shows (draft status, missing mandatory lists)`;

const PERSIST_TOOL_NAMES = new Set([
  "save_company_details",
  "add_contact",
  "add_bank_account",
  "save_scope_of_supply",
]);

const allTools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "save_company_details",
      description: "Save or update the vendor's company details including address, legal entity, contact info, tax details. All listed required fields must be provided — if any are missing from documents, ask the vendor for them BEFORE calling this tool.",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string", description: "Company/Business name extracted from documents" },
          address_1: { type: "string", description: "Street address line 1" },
          address_2: { type: "string", description: "Street address line 2" },
          city: { type: "string", description: "City" },
          state: { type: "string", description: "State/Province" },
          country: { type: "string", description: "Country full name" },
          postalcode: { type: "string", description: "Postal/ZIP code" },
          phone: { type: "string", description: "Company phone number" },
          email_id: { type: "string", description: "Company email" },
          web_address: { type: "string", description: "Website URL" },
          legal_entity_type: { type: "string", description: "Legal entity type: Proprietor, Partner, LLP, Private, Public, Government, Trust, Society, Cooperative, Other" },
          type_of_company: { type: "string", description: "Type of company" },
          license_no: { type: "string", description: "Trade/Business license number or CIN/Registration number" },
          place_of_issue: { type: "string", description: "License place of issue" },
          start_date: { type: "string", description: "Incorporation/start date (YYYY-MM-DD)" },
          expiry_date: { type: "string", description: "License expiry date (YYYY-MM-DD)" },
          workingday_start: { type: "string", description: "Working week start day (e.g., Monday)" },
          workingday_end: { type: "string", description: "Working week end day (e.g., Friday)" },
          working_time_start_time: { type: "string", description: "Office start time (HH:MM)" },
          working_time_end_time: { type: "string", description: "Office end time (HH:MM)" },
          annual_turn_over: { type: "string", description: "Annual turnover amount" },
          turn_over_currency: { type: "string", description: "Turnover currency code (e.g., INR, USD)" },
          tax_reg_no: { type: "string", description: "Tax registration / GST number" },
          tax_payer_id: { type: "string", description: "Tax payer ID" },
          pan_no: { type: "string", description: "PAN number (India)" },
          payment_terms: { type: "string", description: "Payment terms" },
        },
        required: ["address_1", "city", "country", "postalcode", "legal_entity_type", "email_id", "phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_contact",
      description: "Add a contact person for the vendor",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Full name of the contact person" },
          email: { type: "string", description: "Contact email address" },
          mobile: { type: "string", description: "Contact mobile number" },
          phone: { type: "string", description: "Contact landline number" },
          department: { type: "string", description: "Department (e.g., Sales, Finance)" },
          designation: { type: "string", description: "Job title/designation" },
          contact_category: { type: "string", description: "Category of contact" },
          is_primary: { type: "string", description: "Is this the primary contact? Yes/No" },
          is_auth_signatory: { type: "string", description: "Is authorized signatory? Yes/No" },
        },
        required: ["contact_name", "email", "mobile"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_bank_account",
      description: "Add a bank account for the vendor",
      parameters: {
        type: "object",
        properties: {
          bank_name: { type: "string", description: "Name of the bank" },
          account_no: { type: "string", description: "Bank account number" },
          beneficiary_name: { type: "string", description: "Beneficiary name on the account" },
          bank_address: { type: "string", description: "Bank branch address" },
          bank_city: { type: "string", description: "Bank city" },
          bank_state: { type: "string", description: "Bank state" },
          bank_country: { type: "string", description: "Bank country" },
          bank_postalcode: { type: "string", description: "Bank postal code" },
          ifsc_code: { type: "string", description: "IFSC code (India)" },
          swift_code: { type: "string", description: "SWIFT/BIC code" },
          iban_no: { type: "string", description: "IBAN number" },
          bank_currency: { type: "string", description: "Account currency (e.g., INR, USD)" },
        },
        required: ["bank_name", "account_no", "bank_address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_scope_of_supply",
      description: "Save the vendor's scope of supply / service information",
      parameters: {
        type: "object",
        properties: {
          type_of_service: { type: "string", description: "Products, Services, or Both" },
          service_description: { type: "string", description: "Brief description of products/services offered" },
        },
        required: ["type_of_service"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_registration_progress",
      description: "Get the current registration progress including which sections are complete",
      parameters: { type: "object", properties: {} },
    },
  },
];

function toolsForSession(allowPersistTools: boolean): OpenAI.Chat.ChatCompletionTool[] {
  if (allowPersistTools) return allTools;
  return allTools.filter((t) => {
    const name = (t as { function?: { name?: string } }).function?.name;
    return name && !PERSIST_TOOL_NAMES.has(name);
  });
}

async function executeToolCall(
  toolName: string,
  args: any,
  sessionUser: any,
  req: any
): Promise<{ result: string }> {
  try {
    switch (toolName) {
      case "save_company_details": {
        const result = await vendorRegService.saveCompanyDetails(sessionUser, args, req);
        if (result.supplierId) {
          sessionUser.supplierId = String(result.supplierId);
        }
        return { result: `Company details saved successfully (supplierId=${sessionUser.supplierId}). You can now save banking details, contacts, and scope of supply. If you have banking data from document extraction, call add_bank_account NOW.` };
      }

      case "add_contact": {
        if (!sessionUser.supplierId) {
          return { result: "Please save company details first before adding contacts." };
        }
        await vendorRegService.createContact(sessionUser, args);
        return { result: `Contact "${args.contact_name}" added successfully.` };
      }

      case "add_bank_account": {
        if (!sessionUser.supplierId) {
          return { result: "Please save company details first before adding bank accounts." };
        }
        const bankData = {
          bank_name: args.bank_name,
          account_no: args.account_no,
          beneficiary_name: args.beneficiary_name || null,
          bank_address: args.bank_address,
          city: args.bank_city || null,
          region: args.bank_state || null,
          country: args.bank_country || null,
          postal_code: args.bank_postalcode || null,
          ifsccode: args.ifsc_code || null,
          swift_code: args.swift_code || null,
          iban_no: args.iban_no || null,
          currency: args.bank_currency || null,
          primary_account: 'Y',
        };
        await vendorRegService.createBankAccount(sessionUser, bankData);
        return { result: `Bank account at "${args.bank_name}" (A/C: ${args.account_no}) added successfully.` };
      }

      case "save_scope_of_supply": {
        if (!sessionUser.supplierId) {
          return { result: "Please save company details first before setting scope of supply." };
        }
        await vendorRegService.updateServiceInfo(sessionUser, {
          type_of_service: args.type_of_service,
          service_description: args.service_description || "",
        });
        return { result: `Scope of supply saved: ${args.type_of_service}${args.service_description ? ` — ${args.service_description}` : ""}` };
      }

      case "get_registration_progress": {
        const profile = await vendorRegService.getProfile(sessionUser);
        const hasCompany = !!(profile?.address_1 && profile?.city && profile?.country);

        let contacts: any[] = [];
        let banks: any[] = [];
        let scopeData: any = {};
        let documents: any[] = [];

        if (sessionUser.supplierId) {
          contacts = await vendorRegService.getContacts(sessionUser);
          banks = await vendorRegService.getBankAccounts(sessionUser);
          scopeData = await vendorRegService.getScopeOfSupply(sessionUser);
          documents = await vendorRegService.getDocuments(sessionUser);
        }

        const sections = [
          { name: "Company Details", complete: hasCompany },
          { name: "Contacts", complete: contacts.length > 0 },
          { name: "Scope of Supply", complete: !!(scopeData?.serviceInfo?.type_of_service || profile?.type_of_service) },
          { name: "Banking", complete: banks.length > 0 },
          { name: "Documents", complete: documents.length > 0 },
        ];

        const completedCount = sections.filter(s => s.complete).length;
        let summary = `## Registration Progress: ${completedCount}/5 sections complete\n\n`;
        sections.forEach(s => {
          summary += `- ${s.complete ? "**Done**" : "Pending"}: ${s.name}\n`;
        });

        if (hasCompany) {
          summary += `\n**Company**: ${profile.company_name || "N/A"} | **City**: ${profile.city || "N/A"} | **Country**: ${profile.country || "N/A"}`;
        }
        if (contacts.length > 0) {
          summary += `\n**Contacts**: ${contacts.length} contact(s) added`;
        }
        if (banks.length > 0) {
          summary += `\n**Bank Accounts**: ${banks.length} account(s) added`;
        }

        return { result: summary };
      }

      default:
        return { result: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    const msg = error?.message || JSON.stringify(error);
    return { result: `Error: ${msg}` };
  }
}

const EXTRACTION_PROMPT = `Analyze this document and extract business, tax, and banking information by MEANING (not by one country's labels such as PAN, GST, EIN, VAT — interpret what each identifier represents).

Identify the document type (one of: incorporation_certificate, tax_certificate, gst_certificate, bank_letter, cancelled_cheque, trade_license, other).

Extract when clearly printed:
- Country / jurisdiction
- Company or business legal name
- Primary government tax identifier for the business; indirect-tax ID (VAT/GST/sales tax) if distinct
- Business registration or incorporation number; incorporation or registration dates; license issue/expiry if applicable
- Legal entity type
- Full address (street vs city vs postal code vs country separated mentally)
- Contact phone, email, website
- Annual revenue or turnover with currency if stated
- Banking: bank name, branch, account number, beneficiary, routing identifiers (sort code, SWIFT/BIC, IFSC, ABA routing, etc.) with their meaning

Return your analysis in this exact format:
DOCUMENT_TYPE: <type>
EXTRACTED_DATA:
<semantic_field_name>: <value>
...

CONFIDENCE: <high/medium/low>
NOTES: <any observations about data quality or missing info>`;

async function extractFromImage(fileBuffer: Buffer, mimeType: string): Promise<string> {
  console.log(`[DocExtraction] Extracting from image, mimeType=${mimeType}, bufferSize=${fileBuffer.length}`);
  const base64Data = fileBuffer.toString("base64");
  const imageUrl = `data:${mimeType};base64,${base64Data}`;

  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
      max_completion_tokens: 2000,
    });

    const result = response.choices[0]?.message?.content || "Could not extract data from image.";
    console.log(`[DocExtraction] Image extraction success, response length=${result.length}`);
    return result;
  } catch (err: any) {
    console.error(`[DocExtraction] Image extraction FAILED:`, err?.message, err?.status, JSON.stringify(err?.error || {}).substring(0, 500));
    throw err;
  }
}

async function convertPdfToImage(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    return await renderPdfFirstPageToPngBuffer(pdfBuffer);
  } catch (err: any) {
    console.error(`[DocExtraction] PDF-to-image conversion failed:`, err?.message);
    return null;
  }
}

async function extractFromPdf(fileBuffer: Buffer): Promise<string> {
  console.log(`[DocExtraction] Extracting from PDF, bufferSize=${fileBuffer.length}`);

  try {
    console.log(`[DocExtraction] PDF is image-based, converting to image for vision API...`);
    const imgBuffer = await convertPdfToImage(fileBuffer);

    if (!imgBuffer) {
      return "Could not process this PDF. Please try uploading a JPG/PNG photo of the document instead.";
    }

    console.log(`[DocExtraction] Converted PDF to PNG, size=${imgBuffer.length}, sending to vision API...`);
    return await extractFromImage(imgBuffer, "image/png");
  } catch (err: any) {
    console.error(`[DocExtraction] PDF extraction FAILED:`, err?.message, err?.status, JSON.stringify(err?.error || {}).substring(0, 500));
    throw err;
  }
}

export async function extractDocumentData(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ extractedText: string; documentType: string }> {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    return {
      extractedText: "Unsupported file type. Please upload a JPG, PNG, or PDF document.",
      documentType: "unknown",
    };
  }

  try {
    const extractedText = isImage
      ? await extractFromImage(fileBuffer, mimeType)
      : await extractFromPdf(fileBuffer);

    const typeMatch = extractedText.match(/DOCUMENT_TYPE:\s*(\S+)/i);
    const documentType = typeMatch?.[1]?.toLowerCase() || "other";

    return { extractedText, documentType };
  } catch (error: any) {
    console.error("[DocExtraction] Error:", error?.message);
    return {
      extractedText: `Could not process document "${fileName}". Please try uploading a clearer image or provide the details manually.`,
      documentType: "error",
    };
  }
}

export interface VendorRegAgentResponse {
  response: string;
  draft?: import("./vendor-registration-draft-merge").VendorRegistrationDraftSession;
  missingMandatory?: {
    company: string[];
    banking: string[];
    companyLabels: string[];
    bankingLabels: string[];
  };
  validationWarnings?: string[];
}

const DRAFT_PHASE_SYSTEM_ADDON = `

## DOCUMENT-DRAFT MODE (when persist tools are disabled)
The vendor is using document-first registration. Saving to the database from chat is **disabled** until they use **Confirm & Continue** on the manual form path.
- Help them understand what to upload (incorporation certificate, GST/tax certificate, bank letter or cancelled cheque, business license).
- Do not tell them you saved company or banking details to the system.
- **Chat replies must stay minimal:** no raw extraction lists, no "Document type(s) so far", no "Still required (company/banking)" — missing mandatory fields appear on the manual registration form.
- Remind them they can upload more documents or use **Confirm & Continue** when ready.
`;

export async function processVendorRegistrationChat(
  userMessage: string,
  conversationHistory: { role: string; content: string }[],
  sessionUser: any,
  req: any,
  extractedDocData?: string,
  options?: { allowPersistTools?: boolean }
): Promise<VendorRegAgentResponse> {
  const allowPersistTools = options?.allowPersistTools !== false;
  const systemPrompt =
    VENDOR_REG_AGENT_SYSTEM_PROMPT + (!allowPersistTools ? DRAFT_PHASE_SYSTEM_ADDON : "");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  let userContent = userMessage.trim();

  if (extractedDocData) {
    userContent += `\n\n[SYSTEM: Document extraction data follows. Use it to call save tools when all required fields are present. In your reply: stay conversational and brief — do NOT dump field lists, values, or missing-field inventories in chat.]\n\n${extractedDocData}`;
  }
 

  if (userContent) {
    messages.push({ role: "user", content: userContent });
  }

  let iterations = 0;
  const maxIterations = 5;
  const tools = toolsForSession(allowPersistTools);

  while (iterations < maxIterations) {
    iterations++;

    const openai = await getAIClient();
    const modelName = await getAIModelName();
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : undefined,
    });

    const choice = completion.choices[0];

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        const tc = toolCall as any;
        const args = JSON.parse(tc.function.arguments);
        const toolResult = await executeToolCall(tc.function.name, args, sessionUser, req);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult.result,
        });
      }
      continue;
    }

    return { response: choice.message.content || "I'm here to help. What would you like to do?" };
  }

  return { response: "I've processed your request. Is there anything else you'd like to add to your registration?" };
}
