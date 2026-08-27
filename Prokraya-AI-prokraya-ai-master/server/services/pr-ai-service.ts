import { getAIClient, getAIModelName } from "./ai-client";
import { storage } from "../storage";
import * as vendorRepo from "../modules/vendors/vendors.repository";
import { pool } from "../modules/_shared";
import { getContextPool } from "../tenant-context";

const getPool = () => getContextPool() ?? pool;

export interface ItemSuggestion {
  itemId: string;
  itemCode: string;
  name: string;
  unitPrice: number;
  /** True when unitPrice is an LLM estimate because no prior purchase price was found. */
  priceAssumed: boolean;
  unitOfMeasure: string;
  categoryCode: string | null;
  categoryName: string | null;
  relevanceScore: number;
  reason: string;
}

export interface ParsedLineItem {
  description: string;
  /** Null only when the caller passed `defaultQuantity: null` and the request stated no quantity. */
  quantity: number | null;
  unitOfMeasure: string;
  estimatedPrice: number;
  suggestedItemId?: string;
  suggestedItemCode?: string;
  categoryCode?: string;
  categoryName?: string;
}

export interface DuplicateCheck {
  isDuplicate: boolean;
  similarPRs: Array<{
    prNumber: string;
    title: string;
    department: string;
    createdAt: string;
    similarity: number;
  }>;
}

interface HistoricalPurchasePatterns {
  rows: any[];
  topPatterns: any[];
}

/**
 * Loads recent PR lines and rolls them up into frequency-ranked purchase
 * patterns. Used by AI-assisted automatic line suggestions for ranking bias,
 * and by the AI advisor only to annotate matched items with prior-order counts.
 */
async function getHistoricalPurchasePatterns(
  rowLimit = 500,
  topN = 20
): Promise<HistoricalPurchasePatterns> {
  const historicalPRs = await getPool().query(`
    SELECT 
      h.pr_number,
      l.item_description,
      l.item_id,
      l.product_category,
      l.product_category_name,
      l.unit_cost,
      l.uom
    FROM dbo.supp_pr_header_dtls h
    JOIN dbo.supp_pr_line_dtls l ON h.pr_number = l.pr_number
    WHERE h.pr_status IN ('Approved', 'Pending Approval', 'Draft')
    ORDER BY h.creation_date DESC
    LIMIT ${rowLimit}
  `);

  const prPatterns = historicalPRs.rows.reduce((acc: any, row: any) => {
    const key = row.item_description?.toLowerCase() || '';
    if (!acc[key]) {
      acc[key] = {
        description: row.item_description,
        itemId: row.item_id,
        categoryCode: row.product_category,
        categoryName: row.product_category_name,
        unitCost: row.unit_cost,
        uom: row.uom,
        count: 0,
        prs: new Set()
      };
    }
    acc[key].count++;
    acc[key].prs.add(row.pr_number);
    return acc;
  }, {});

  const topPatterns = Object.values(prPatterns)
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, topN);

  return { rows: historicalPRs.rows, topPatterns };
}

/**
 * Loads the allowed Unit-of-Measure values from the UOM lookup master
 * (`am_lookup_params_dtls`, key_1='UOM'). These `description` values (e.g.
 * "Each", "Box", "Kilogram") are exactly what the line-item UoM dropdown
 * accepts, so AI-generated UoMs must be constrained to this list.
 */
export async function getAllowedUoms(): Promise<string[]> {
  try {
    const result = await getPool().query(
      `SELECT description FROM dbo.am_lookup_params_dtls WHERE UPPER(key_1) = 'UOM' AND status = 'Y' ORDER BY key_2`
    );
    return result.rows
      .map((r: any) => String(r.description ?? "").trim())
      .filter(Boolean);
  } catch (error) {
    console.error("Error loading allowed UOMs:", error);
    return [];
  }
}

/**
 * Normalizes an AI/catalog-provided UoM to a valid value from the allowed
 * dropdown list. Falls back to the catalog value if valid, otherwise "Each".
 */
export function resolveAllowedUom(
  candidate: string | undefined | null,
  masterUom: string | undefined | null,
  allowedUoms: string[]
): string {
  const match = (val: string | undefined | null) =>
    val
      ? allowedUoms.find((u) => u.toLowerCase() === String(val).trim().toLowerCase())
      : undefined;
  return (
    match(candidate) ||
    match(masterUom) ||
    allowedUoms.find((u) => u.toLowerCase() === "each") ||
    "Each"
  );
}

/** Shared guidance so the LLM reasons the UoM from item type instead of defaulting to "Each". */
const UOM_SELECTION_GUIDANCE = `Reason carefully about the item's physical nature and pick the MOST SPECIFIC fitting value from the Allowed Units of Measure list (exact spelling/casing). Guidance:
- Items sold by length (wire, cable, rope, pipe, fabric): use "Meter" or "Linear Meter".
- Items sold by area (sheet metal, glass, flooring): use "Sq. Mtr" or "Sheet".
- Items sold by weight (chemicals, cement, metals, food): use "Kilogram".
- Items grouped in packs/boxes/dozens: use "Pack", "Box", or "Dozen".
- Paper-like items: use "Sheet" or "Pad".
- Time/service-based items: use the appropriate period (Hours, Daily, Weekly, Monthly, etc.).
- Use "Each" ONLY for genuinely discrete, individually counted items (e.g. laptops, chairs, ID cards, monitors).
Do NOT default to "Each" when a more specific unit above applies to the item type.`;

/** Builds the prompt section listing the valid dropdown UoM values, or "" when none are available. */
function buildAllowedUomSection(allowedUoms: string[]): string {
  return allowedUoms.length > 0
    ? `

Allowed Units of Measure (choose unitOfMeasure EXACTLY from this list, matching spelling and casing):
${JSON.stringify(allowedUoms)}`
    : "";
}

/**
 * Returns the most recent actual purchased unit price for an item from
 * purchase-order history (`supp_po_line_dtls`), matched by item id. This is
 * the last real purchase price (NOT an average). Returns null when the item
 * has no prior purchase-order line with a positive price.
 */
export async function getLastPurchasedPrice(itemId: string | null | undefined): Promise<number | null> {
  if (!itemId) return null;
  try {
    const result = await getPool().query(
      `SELECT CAST(pol.line_unit_cost AS NUMERIC) AS price
       FROM dbo.supp_po_line_dtls pol
       JOIN dbo.supp_po_header_dtls h ON h.po_number = pol.po_number
       WHERE pol.item_id = $1
         AND pol.line_unit_cost ~ '^[0-9]+(\\.[0-9]+)?$'
         AND CAST(pol.line_unit_cost AS NUMERIC) > 0
       ORDER BY COALESCE(h.po_issue_date, h.creation_date) DESC
       LIMIT 1`,
      [String(itemId)]
    );
    const price = result.rows[0]?.price;
    return price != null ? Number(price) : null;
  } catch (error) {
    console.error("Error loading last purchased price:", error);
    return null;
  }
}

export async function suggestItemsFromDescription(
  title: string,
  description: string,
  department: string
): Promise<ItemSuggestion[]> {
  // Extract keywords from title and description for pre-filtering
  const searchTerms = `${title} ${description}`.toLowerCase().split(/\s+/).filter(term => term.length > 2);

  // First, try to find relevant items by searching
  let items: any[] = [];
  for (const term of searchTerms.slice(0, 5)) { // Limit to first 5 terms
    const searchResults = await storage.searchItems(term);
    items = [...items, ...searchResults];
  }

  // Remove duplicates by id
  const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());

  // No catalog hits for the PR wording — do not fall back to an arbitrary
  // slice of Item Master; that produced unrelated lines (e.g. laptop/tea)
  // for descriptions like "demo1".
  if (uniqueItems.length === 0) {
    return [];
  }

  items = uniqueItems.slice(0, 100);

  const itemList = items.map(item => ({
    id: item.id,
    code: item.itemCode,
    name: item.name,
    description: item.description,
    category: item.categoryName,
    price: item.standardPrice,
    // Master `uom` is intentionally omitted: the catalog stores non-standard
    // codes (e.g. "EA") that are not valid dropdown values, so the LLM must
    // reason the unit from item type and pick from the allowed UoM list below.
  }));

  // Allowed Unit-of-Measure values (the dropdown master) the LLM must choose from.
  const allowedUoms = await getAllowedUoms();
  const allowedUomSection = buildAllowedUomSection(allowedUoms);

  // Pull frequency-ranked historical purchase patterns to bias suggestions
  // toward items the organization actually buys.
  let historicalPatternsSection = "";
  try {
    const { topPatterns } = await getHistoricalPurchasePatterns();
    if (topPatterns.length > 0) {
      historicalPatternsSection = `

Historical Purchase Patterns (items frequently purchased):
${JSON.stringify(topPatterns.map((p: any) => ({
        description: p.description,
        frequency: p.count,
        category: p.categoryName
      })), null, 2)}`;
    }
  } catch (error) {
    console.error("Error loading historical purchase patterns for suggestions:", error);
  }

  const prompt = `You are a procurement assistant. Based on the Purchase Request details below, suggest the most relevant items from the Item Master.

PR Title: ${title}
PR Description: ${description || "Not provided"}
Department: ${department}

Available Items in Item Master:
${JSON.stringify(itemList, null, 2)}${historicalPatternsSection}${allowedUomSection}

Analyze the PR and suggest only items that genuinely match the title and description. Prefer items that match the PR details, and use the historical purchase patterns only to break ties among real matches. Suggest at most 5 items. If none of the listed items are a genuine match, return an empty array []. Do not pick filler items just to return a list. Return a JSON array with this structure:
[
  {
    "itemId": "item id from the list",
    "relevanceScore": 0.0 to 1.0,
    "reason": "brief explanation why this item is relevant",
    "unitOfMeasure": "the unit that best reflects how this item is physically measured or sold, chosen EXACTLY from the Allowed Units of Measure list",
    "assumedUnitPrice": your best-estimate unit price (a positive number) for this item, used only if there is no purchase history for it
  }
]

Only suggest items that are genuinely relevant to the PR. If no items match well, return an empty array [].
For assumedUnitPrice, give a realistic estimated unit price for the item based on its type; it will only be used as a fallback when no prior purchase price exists.
For unitOfMeasure: ${UOM_SELECTION_GUIDANCE}
Return ONLY the JSON array, no other text.`;

  try {
    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || "[]";
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const suggestions = JSON.parse(cleanedContent);

    const result: ItemSuggestion[] = [];
    for (const suggestion of suggestions) {
      const item = items.find(i => i.id === suggestion.itemId);
      if (item) {
        const resolvedUom = resolveAllowedUom(suggestion.unitOfMeasure, item.unitOfMeasure, allowedUoms);

        // Price precedence: most recent actual PO price -> item master's recorded
        // last purchase rate -> LLM-estimated price (flagged as assumed). No averages.
        const lastPoPrice = await getLastPurchasedPrice(item.id);
        const masterPrice = item.standardPrice != null && item.standardPrice > 0 ? item.standardPrice : null;
        const llmAssumedPrice = Number(suggestion.assumedUnitPrice) > 0 ? Number(suggestion.assumedUnitPrice) : 0;
        const priorPrice = lastPoPrice ?? masterPrice;
        const priceAssumed = priorPrice == null;
        const unitPrice = priceAssumed ? llmAssumedPrice : priorPrice;

        result.push({
          itemId: item.id,
          itemCode: item.itemCode,
          name: item.name,
          unitPrice,
          priceAssumed,
          unitOfMeasure: resolvedUom,
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          relevanceScore: suggestion.relevanceScore,
          reason: suggestion.reason,
        });
      }
    }

    return result.sort((a, b) => b.relevanceScore - a.relevanceScore);
  } catch (error) {
    console.error("Error getting item suggestions:", error);
    return [];
  }
}

export interface ParseNaturalLanguageOptions {
  /**
   * Quantity to use when the request does not state one. Defaults to 1, which
   * is what every existing caller expects. Pass null to keep "unspecified"
   * distinguishable from an explicit quantity of 1 — the PR recommendation
   * engine relies on that to know when to predict a quantity instead.
   */
  defaultQuantity?: number | null;
}

export async function parseNaturalLanguageToItems(
  naturalText: string,
  options: ParseNaturalLanguageOptions = {}
): Promise<ParsedLineItem[]> {
  const defaultQuantity = options.defaultQuantity === undefined ? 1 : options.defaultQuantity;
  const items = await storage.getItems();

  const itemList = items.map(item => ({
    id: item.id,
    code: item.itemCode,
    name: item.name,
    category: item.categoryName,
    price: item.standardPrice,
    uom: item.unitOfMeasure,
  }));

  const prompt = `You are a procurement assistant. Parse the following natural language request into structured line items for a Purchase Request.

User Request: "${naturalText}"

Available Items in Item Master:
${JSON.stringify(itemList, null, 2)}

Parse the request into line items. For each item mentioned:
1. Try to match it to an item from the Item Master if possible
2. ${defaultQuantity === null
      ? "Extract quantity. If the request does not state a quantity for an item, return null for that item's quantity — do NOT guess or default it"
      : "Extract quantity (default to 1 if not specified)"}
3. Use appropriate unit of measure

Return a JSON array with this structure:
[
  {
    "description": "item description",
    "quantity": ${defaultQuantity === null ? "number, or null if the request does not state one" : "number"},
    "unitOfMeasure": "EA/PC/BOX/SET/etc",
    "estimatedPrice": estimated unit price,
    "suggestedItemId": "item id if matched from master, or null",
    "suggestedItemCode": "item code if matched, or null",
    "categoryCode": "UNSPSC code if known, or null",
    "categoryName": "category name if known, or null"
  }
]

Return ONLY the JSON array, no other text.`;

  try {
    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_completion_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || "[]";
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const parsedItems = JSON.parse(cleanedContent);

    return parsedItems.map((item: any) => {
      const matchedItem = item.suggestedItemId
        ? items.find(i => i.id === item.suggestedItemId)
        : null;

      return {
        description: item.description,
        quantity: item.quantity || defaultQuantity,
        unitOfMeasure: item.unitOfMeasure || matchedItem?.unitOfMeasure || "EA",
        estimatedPrice: matchedItem?.standardPrice || item.estimatedPrice || 0,
        suggestedItemId: matchedItem?.id,
        suggestedItemCode: matchedItem?.itemCode,
        categoryCode: matchedItem?.categoryCode || item.categoryCode,
        categoryName: matchedItem?.categoryName || item.categoryName,
      };
    });
  } catch (error) {
    console.error("Error parsing natural language:", error);
    return [];
  }
}

export interface SmartRecommendation {
  itemId: string;
  itemCode: string;
  name: string;
  unitPrice: number;
  /** True when unitPrice is an LLM estimate because no prior purchase price was found. */
  priceAssumed: boolean;
  unitOfMeasure: string;
  categoryCode: string | null;
  categoryName: string | null;
  frequency: number;
  reason: string;
  fromPRs: string[];
}

export interface PrRecommendationContext {
  title?: string;
  description?: string;
  department?: string;
}

export async function getSmartRecommendations(
  userRequest: string,
  pool: any,
  prContext?: PrRecommendationContext
): Promise<SmartRecommendation[]> {
  try {
    // Historical PR lines are used only to annotate matched items with
    // prior-order frequency badges — not to bias which items are suggested.
    let historicalRows: any[] = [];
    try {
      const patterns = await getHistoricalPurchasePatterns();
      historicalRows = patterns.rows;
    } catch (error) {
      console.error("Error loading historical purchase patterns for recommendations:", error);
    }
    const historicalPRs = { rows: historicalRows };

    // Get items from Item Master for matching
    const items = await storage.getItems();
    const itemList = items.slice(0, 100).map(item => ({
      id: item.id,
      code: item.itemCode,
      name: item.name,
      category: item.categoryName,
      price: item.standardPrice,
      // Master `uom` intentionally omitted (stores non-standard codes like "EA");
      // the LLM reasons the unit and must pick from the allowed UoM list below.
    }));

    // Allowed Unit-of-Measure values (the dropdown master) the LLM must choose from.
    const allowedUoms = await getAllowedUoms();
    const allowedUomSection = buildAllowedUomSection(allowedUoms);

    const prContextSection = prContext && (prContext.title || prContext.description || prContext.department)
      ? `

Purchase Request Context:
PR Title: ${prContext.title || "Not provided"}
PR Description: ${prContext.description || "Not provided"}
Department: ${prContext.department || "Not provided"}`
      : "";

    const prompt = `You are a procurement assistant matching Item Master catalog items to a purchase request.

User Request: "${userRequest}"${prContextSection}

Available Items in Item Master:
${JSON.stringify(itemList, null, 2)}${allowedUomSection}

Recommend only items that clearly match the user's request and/or the purchase request title/description.
Do NOT pad the list with frequently ordered, popular, or historically common items.
Do NOT suggest unrelated items just because they share a category or appear often in past PRs.
If only 1-2 items match, return only those. If nothing matches well, return an empty array [].

Return a JSON array with this structure:
[
  {
    "itemId": "item id from Item Master",
    "reason": "why this item matches the user's request or PR details",
    "unitOfMeasure": "the unit that best reflects how this item is physically measured or sold, chosen EXACTLY from the Allowed Units of Measure list",
    "assumedUnitPrice": your best-estimate unit price (a positive number) for this item, used only if there is no purchase history for it
  }
]

For assumedUnitPrice, give a realistic estimated unit price for the item based on its type; it will only be used as a fallback when no prior purchase price exists.
For unitOfMeasure: ${UOM_SELECTION_GUIDANCE}
Return ONLY the JSON array, no other text.`;

    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || "[]";
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const recommendations = JSON.parse(cleanedContent);

    const result: SmartRecommendation[] = [];
    for (const rec of recommendations) {
      const item = items.find(i => i.id === rec.itemId);
      if (item) {
        // Find which PRs had this item
        const relatedPRs = historicalPRs.rows
          .filter((r: any) => r.item_id === item.id)
          .map((r: any) => r.pr_number)
          .slice(0, 3);

        // Price precedence: most recent actual PO price -> item master's recorded
        // last purchase rate -> LLM-estimated price (flagged as assumed). No averages.
        const lastPoPrice = await getLastPurchasedPrice(item.id);
        const masterPrice = item.standardPrice != null && item.standardPrice > 0 ? item.standardPrice : null;
        const llmAssumedPrice = Number(rec.assumedUnitPrice) > 0 ? Number(rec.assumedUnitPrice) : 0;
        const priorPrice = lastPoPrice ?? masterPrice;
        const priceAssumed = priorPrice == null;
        const unitPrice = priceAssumed ? llmAssumedPrice : priorPrice;

        result.push({
          itemId: item.id,
          itemCode: item.itemCode,
          name: item.name,
          unitPrice,
          priceAssumed,
          unitOfMeasure: resolveAllowedUom(rec.unitOfMeasure, item.unitOfMeasure, allowedUoms),
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          frequency: relatedPRs.length,
          reason: rec.reason,
          fromPRs: Array.from(new Set(relatedPRs))
        });
      }
    }

    return result;
  } catch (error) {
    console.error("Error getting smart recommendations:", error);
    return [];
  }
}

export interface HistoricalPurchaseContext {
  itemDescription: string;
  hasHistory: boolean;
  purchaseCount: number;
  avgQuantity: number | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  lastQuantity: number | null;
  recentQuantities: number[];
  avgIntervalDays: number | null;
  lastPurchaseDate: string | null;
  itemCategory: string | null;
}

export interface BudgetContext {
  hasBudget: boolean;
  currency: string;
  allocatedBudget: number | null;
  consumedBudget: number | null;
  reservedBudget: number | null;
  remainingBudget: number | null;
  utilizationPercentage: number | null;
}

export type QuantityPredictionBasis =
  | "historical_quantities"
  | "purchase_frequency"
  | "budget"
  | "industry_knowledge"
  | "item_category";

export interface QuantityPrediction {
  suggestedQuantity: number;
  reasoning: string;
  confidence: number;
  basedOn: QuantityPredictionBasis[];
}

export interface BudgetValidation {
  isWithinBudget: boolean;
  totalAmount: number;
  convertedAmount: number;
  departmentBudget: number;
  warnings: string[];
  severity: "low" | "medium" | "high";
}

export interface VendorRecommendation {
  vendorId: string;
  vendorName: string;
  matchScore: number;
  qualificationStatus: string;
  matchingCategories: string[];
  reason: string;
}

// Department budget limits (in INR) - would come from database in production
const DEPARTMENT_BUDGETS: Record<string, number> = {
  "IT": 5000000,
  "HR": 2000000,
  "Finance": 3000000,
  "Operations": 4000000,
  "Marketing": 2500000,
  "Sales": 3500000,
  "Engineering": 6000000,
  "Facilities": 2000000,
  "Legal": 1500000,
  "R&D": 8000000,
};

/**
 * Aggregates historical purchase quantities, purchase frequency and item
 * category for the given item in a single round trip. Item matching is by
 * partial, case-insensitive description match since there is no stable item
 * code guaranteed on the PR line for free-text requests.
 */
async function getHistoricalItemData(itemDescription: string): Promise<HistoricalPurchaseContext> {
  let result;
  try {
    result = await getPool().query(
      `
      WITH item_history AS (
        SELECT
          l.qty::numeric AS qty,
          l.product_category_name,
          COALESCE(h.pr_created_date, l.creation_date) AS purchase_date
        FROM dbo.supp_pr_line_dtls l
        JOIN dbo.supp_pr_header_dtls h ON h.pr_number = l.pr_number
        WHERE l.item_description ILIKE $1
          AND h.pr_status NOT IN ('Cancelled', 'Rejected')
          AND l.qty IS NOT NULL
      ),
      recent AS (
        SELECT qty FROM item_history
        ORDER BY purchase_date DESC NULLS LAST
        LIMIT 10
      ),
      intervals AS (
        SELECT
          EXTRACT(EPOCH FROM (purchase_date - LAG(purchase_date) OVER (ORDER BY purchase_date))) / 86400 AS gap_days
        FROM item_history
        WHERE purchase_date IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*) FROM item_history)::int AS purchase_count,
        (SELECT ROUND(AVG(qty), 2) FROM item_history) AS avg_quantity,
        (SELECT MIN(qty) FROM item_history) AS min_quantity,
        (SELECT MAX(qty) FROM item_history) AS max_quantity,
        (SELECT qty FROM item_history ORDER BY purchase_date DESC NULLS LAST LIMIT 1) AS last_quantity,
        (SELECT MAX(purchase_date) FROM item_history) AS last_purchase_date,
        (SELECT ROUND(AVG(gap_days)::numeric, 1) FROM intervals WHERE gap_days IS NOT NULL) AS avg_interval_days,
        (SELECT MODE() WITHIN GROUP (ORDER BY product_category_name) FROM item_history WHERE product_category_name IS NOT NULL) AS item_category,
        (SELECT array_agg(qty) FROM recent) AS recent_quantities
      `,
      [`%${itemDescription}%`]
    );
  } catch (error) {
    console.error("[predictQuantity] Database error while loading historical item data:", error);
    throw { status: 500, message: "Failed to retrieve historical procurement data for this item." };
  }

  const row = result.rows[0] || {};
  const purchaseCount = parseInt(row.purchase_count ?? "0", 10);
  const toNumOrNull = (v: any) => (v === null || v === undefined ? null : parseFloat(v));

  return {
    itemDescription,
    hasHistory: purchaseCount > 0,
    purchaseCount,
    avgQuantity: toNumOrNull(row.avg_quantity),
    minQuantity: toNumOrNull(row.min_quantity),
    maxQuantity: toNumOrNull(row.max_quantity),
    lastQuantity: toNumOrNull(row.last_quantity),
    recentQuantities: (row.recent_quantities || []).map((q: any) => parseFloat(q)),
    avgIntervalDays: toNumOrNull(row.avg_interval_days),
    lastPurchaseDate: row.last_purchase_date ? new Date(row.last_purchase_date).toISOString() : null,
    itemCategory: row.item_category || null,
  };
}

/**
 * Resolves budget allocation for the PR's specific assigned budget line,
 * using the same single-row am_budget_lines/am_budget_mst lookup as
 * validateBudget(). When the PR has no budget line assigned, budget is
 * simply not considered.
 */
async function getBudgetContext(budgetLineId: number | null): Promise<BudgetContext> {
  if (budgetLineId === null || budgetLineId === undefined || Number.isNaN(budgetLineId)) {
    return {
      hasBudget: false,
      currency: "INR",
      allocatedBudget: null,
      consumedBudget: null,
      reservedBudget: null,
      remainingBudget: null,
      utilizationPercentage: null,
    };
  }

  let result;
  try {
    result = await getPool().query(
      `SELECT bl.amount, bl.consumed_amount, bl.reserved_amount, bm.budget_curr
       FROM dbo.am_budget_lines bl
       JOIN dbo.am_budget_mst bm ON bl.budget_mst_id = bm.id
       WHERE bl.id = $1`,
      [budgetLineId]
    );
  } catch (error) {
    console.error("[predictQuantity] Database error while loading budget line context:", error);
    throw { status: 500, message: "Failed to retrieve budget information for this PR's assigned budget line." };
  }

  const row = result.rows[0];
  if (!row) {
    return {
      hasBudget: false,
      currency: "INR",
      allocatedBudget: null,
      consumedBudget: null,
      reservedBudget: null,
      remainingBudget: null,
      utilizationPercentage: null,
    };
  }

  const allocated = parseFloat(row.amount ?? "0");
  const consumed = parseFloat(row.consumed_amount ?? "0");
  const reserved = parseFloat(row.reserved_amount ?? "0");
  const remaining = Math.max(0, allocated - consumed - reserved);
  const utilizationPercentage = allocated > 0
    ? Number((((consumed + reserved) / allocated) * 100).toFixed(1))
    : null;

  return {
    hasBudget: true,
    currency: row.budget_curr || "INR",
    allocatedBudget: allocated,
    consumedBudget: consumed,
    reservedBudget: reserved,
    remainingBudget: remaining,
    utilizationPercentage,
  };
}

function buildQuantityPredictionPrompt(
  itemDescription: string,
  department: string,
  existingQuantity: number | undefined,
  historical: HistoricalPurchaseContext,
  budget: BudgetContext
): string {
  const historicalSection = historical.hasHistory
    ? `Purchase Count: ${historical.purchaseCount}
Average Quantity: ${historical.avgQuantity}
Minimum Quantity: ${historical.minQuantity}
Maximum Quantity: ${historical.maxQuantity}
Last Purchased Quantity: ${historical.lastQuantity}
Recent Quantities (most recent first): ${historical.recentQuantities.length ? historical.recentQuantities.join(", ") : "N/A"}
Average Interval Between Purchases: ${historical.avgIntervalDays !== null ? `${historical.avgIntervalDays} days` : "N/A"}
Last Ordered Date: ${historical.lastPurchaseDate || "N/A"}`
    : `No historical procurement records were found for this item. Rely on industry knowledge and standard procurement practices for an item of this type.`;

  const budgetSection = budget.hasBudget
    ? `Budget Allocated: ${budget.allocatedBudget} ${budget.currency}
Budget Consumed: ${budget.consumedBudget} ${budget.currency}
Budget Reserved: ${budget.reservedBudget} ${budget.currency}
Remaining Available Budget: ${budget.remainingBudget} ${budget.currency}
Budget Utilization: ${budget.utilizationPercentage !== null ? `${budget.utilizationPercentage}%` : "N/A"}`
    : `No active budget allocation was found for this department. Treat budget as unconstrained but state this limitation in the reasoning.`;

  return `You are an experienced procurement planning analyst. Recommend an appropriate purchase quantity for the item below, grounded in historical procurement behaviour, item category norms, and budget context.

=== PROCUREMENT CONTEXT ===
Item: ${itemDescription}
Department: ${department}
Item Category: ${historical.itemCategory || "Unknown - infer the most likely category from the item description"}
Requested/Current Quantity (if provided): ${existingQuantity ?? "Not specified"}

=== HISTORICAL PROCUREMENT ===
${historicalSection}

=== BUDGET CONTEXT ===
${budgetSection}

=== ANALYSIS INSTRUCTIONS ===
1. Prioritize historical purchasing behaviour whenever sufficient history exists (generally 3 or more past purchases with reasonably consistent quantities).
2. Rely primarily on industry knowledge and standard procurement/allocation practices only when historical data is unavailable or insufficient (fewer than 3 purchases, or highly inconsistent quantities).
3. Consider purchasing consistency: if past quantities vary widely, lean toward a conservative, central estimate (close to the average) rather than the extremes.
4. Consider the item category and general industry allocation standards for that category.
5. Consider the average interval between purchases and the last ordered date to judge whether this is routine replenishment or an unusual/urgent request.
6. Consider budget limitations: if remaining budget is limited or utilization is already high, reduce the recommended quantity accordingly and explicitly say so in the reasoning. If budget is healthy, do not artificially constrain the quantity because of budget.
7. Explicitly decide whether to stay close to historical quantities or deviate from them, and explain why.
8. Estimate a confidence score between 0 and 1:
   - Increase confidence when there is more historical data and it is consistent (low variance between min/max/average).
   - Decrease confidence when historical data is sparse, absent, or highly inconsistent, forcing reliance on industry knowledge.
   - Confidence near 1 means strong historical evidence; confidence around 0.3-0.5 means the estimate is largely inferred from industry knowledge with little supporting data.

=== RESPONSE FORMAT ===
Return ONLY a single JSON object (no markdown fences, no extra text) with exactly this structure:
{
  "suggestedQuantity": number,
  "reasoning": "max 30 words. Must reference actual figures above (e.g. average quantity, purchase count, interval, remaining budget) and state whether budget availability influenced the recommendation",
  "confidence": number between 0 and 1,
  "basedOn": array containing one or more of "historical_quantities", "purchase_frequency", "budget", "industry_knowledge", "item_category"
}`;
}

function parseAIResponse(content: string): QuantityPrediction {
  const cleaned = content.replace(/```json\s*|```/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error("[predictQuantity] JSON parse error. Raw content:", content, error);
    throw new Error("AI response was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI response was not a JSON object.");
  }

  const { suggestedQuantity, reasoning, confidence, basedOn } = parsed;

  if (typeof suggestedQuantity !== "number" || !Number.isFinite(suggestedQuantity)) {
    throw new Error("AI response is missing a valid numeric 'suggestedQuantity'.");
  }
  if (typeof reasoning !== "string" || reasoning.trim().length === 0) {
    throw new Error("AI response is missing a valid 'reasoning' string.");
  }
  const reasoningWords = reasoning.trim().split(/\s+/);
  const truncatedReasoning = reasoningWords.length > 30
    ? reasoningWords.slice(0, 30).join(" ") + "..."
    : reasoning.trim();
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("AI response is missing a valid 'confidence' number between 0 and 1.");
  }
  if (!Array.isArray(basedOn) || basedOn.length === 0) {
    throw new Error("AI response is missing a valid non-empty 'basedOn' array.");
  }

  return { suggestedQuantity, reasoning: truncatedReasoning, confidence, basedOn };
}

/**
 * Calls the LLM and parses its response, retrying exactly once on any
 * failure (API error, empty content, or invalid JSON/schema). Throws a
 * {status, message} error for the controller's handleError() after the
 * second failure - no deterministic fallback quantity is returned.
 */
async function callLLMWithRetry(prompt: string): Promise<QuantityPrediction> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const openai = await getAIClient();
      const response = await openai.chat.completions.create({
        model: await getAIModelName(),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_completion_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("AI returned an empty response.");
      }

      return parseAIResponse(content);
    } catch (error) {
      lastError = error;
      console.error(`[predictQuantity] LLM attempt ${attempt}/2 failed:`, error);
    }
  }

  throw { status: 500, message: "AI quantity prediction failed after retrying. Please try again." };
}

export async function predictQuantity(
  itemDescription: string,
  department: string,
  existingQuantity?: number,
  budgetLineId?: number | null
): Promise<QuantityPrediction> {
  const [historical, budget] = await Promise.all([
    getHistoricalItemData(itemDescription),
    getBudgetContext(budgetLineId ?? null),
  ]);

  const prompt = buildQuantityPredictionPrompt(itemDescription, department, existingQuantity, historical, budget);

  return callLLMWithRetry(prompt);
}

export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const result = await getPool().query(
    `
    SELECT conversion_rate
    FROM dbo.am_exchange_rate_mst
    WHERE from_currency = $1
      AND to_currency = $2
    ORDER BY conversion_date DESC
    LIMIT 1
    `,
    [fromCurrency, toCurrency]
  );

  if (result.rows.length === 0) {
    throw new Error(
      `Exchange rate not found for ${fromCurrency} -> ${toCurrency}`
    );
  }

  const rate = parseFloat(result.rows[0].conversion_rate);

  return amount * rate;
}

export async function validateBudget(
  department: string,
  prTotalAmount: number,
  prTitle: string,
  budgetLineId: number | null,
  prCurrency: string,
  fromPR?: boolean,
  fromBid?: boolean,
  prNumber?: string,
  bidAwardId?: string
): Promise<BudgetValidation> {
  const warnings: string[] = [];
  let severity: "low" | "medium" | "high" = "low";

  let budgetLineAmount: number;
  let consumedAmount: number;
  let reservedAmount: number;
  let budgetLabel: string;
  let budgetCurrency = "INR";

  if (budgetLineId) {
    const lineResult = await getPool().query(
      `SELECT bl.amount, bl.consumed_amount, bl.reserved_amount, bm.budget_name, bl.segment_dtl_name, bm.budget_curr
       FROM dbo.am_budget_lines bl
       JOIN dbo.am_budget_mst bm ON bl.budget_mst_id = bm.id
       WHERE bl.id = $1`,
      [budgetLineId]
    );
    if (lineResult.rows.length === 0) {
      return {
        isWithinBudget: false,
        totalAmount: prTotalAmount,
        convertedAmount: prTotalAmount,
        departmentBudget: 0,
        warnings: ["Selected budget line could not be found."],
        severity: "high",
      };
    }
    const line = lineResult.rows[0];
    budgetLineAmount = parseFloat(line.amount || "0");
    consumedAmount = parseFloat(line.consumed_amount || "0");
    reservedAmount = parseFloat(line.reserved_amount || "0");
    budgetLabel = `${line.budget_name} - ${line.segment_dtl_name}`;
    budgetCurrency = line.budget_curr || "INR";
  } else {
    // No budget selected on PR — fall back to department-level hardcoded limit
    budgetLineAmount = DEPARTMENT_BUDGETS[department] || 2000000;
    consumedAmount = 0;
    reservedAmount = 0;
    budgetLabel = `${department} (no budget assigned)`;
    warnings.push("No budget is selected for this PR. Validation is based on default department limits.");
    severity = "medium";
  }

  let convertedPRAmount = prTotalAmount;

  try {
    // convertedPRAmount = await convertCurrency(
    //   prTotalAmount,
    //   prCurrency,
    //   budgetCurrency
    // );

    // if (
    //   prCurrency.toUpperCase() !== budgetCurrency.toUpperCase()
    // ) {
    //   warnings.push(
    //     `PR amount converted from ${prCurrency} to ${budgetCurrency} for budget validation --> ${formatCurrency(convertedPRAmount, budgetCurrency)}`
    //   );
    // }
  } catch (error: any) {
    return {
      isWithinBudget: false,
      totalAmount: prTotalAmount,
      convertedAmount: 0,
      departmentBudget: 0,
      warnings: [
        `Currency conversion failed: ${error.message}`,
      ],
      severity: "medium",
    };
  }

  const availableBudget = Math.max(0, budgetLineAmount - consumedAmount - reservedAmount);
  let utilizedAfterPR = consumedAmount + reservedAmount + Number(convertedPRAmount);
  if(fromPR){
    utilizedAfterPR = consumedAmount + Number(convertedPRAmount);
  }
  const budgetPercentage = budgetLineAmount > 0 ? (utilizedAfterPR / budgetLineAmount) * 100 : 100;
  let withinBudget = Number(convertedPRAmount) <= availableBudget;
  // Check budget thresholds
  if(fromPR && !fromBid){
    const result = await getPool().query(`select attribute_11 from dbo.supp_pr_header_dtls where pr_number = $1`, [prNumber]);
    const reservedPRAmount = result.rows[0]?.attribute_11 ? Number(result.rows[0]?.attribute_11) : 0;
    const remainingPRAmount = reservedPRAmount - Number(convertedPRAmount);
    if(!reservedPRAmount){
      throw new Error("No reserved PR amount found for this PR");
    }
   if(remainingPRAmount > 0){
      withinBudget = true;
    }else{
      if(Math.abs(remainingPRAmount) <= availableBudget){
        withinBudget = true;
      }else{
        warnings.push(
          `This PR amount (${formatCurrency(prTotalAmount, prCurrency)}) exceeds the available budget by ${formatCurrency((Math.abs(remainingPRAmount)), budgetCurrency)} for "${budgetLabel}"`
        );
        severity = "high";
        withinBudget = false;
      }
    }
  }else if(fromBid){
      const result = await getPool().query(`select attribute_10 from dbo.supp_bid_award_dtls where id = $1`, [bidAwardId]);
      const reservedAwardAmount = result.rows[0]?.attribute_10 ? Number(result.rows[0]?.attribute_10) : 0;
      const remainingAwardAmount = reservedAwardAmount - Number(convertedPRAmount);
    if(reservedAwardAmount === null){
      throw new Error("No reserved award amount found for this bid award");
    }
   if(remainingAwardAmount >= 0){
      withinBudget = true;
    }else{
      if(Math.abs(remainingAwardAmount) <= availableBudget){
        withinBudget = true;
      }else{
        warnings.push(
          `This PR amount (${formatCurrency(prTotalAmount, prCurrency)}) exceeds the available budget by ${formatCurrency((Math.abs(remainingAwardAmount)), budgetCurrency)} for "${budgetLabel}"`
        );
        severity = "high";
        withinBudget = false;
      }
    }
  }else if (convertedPRAmount > availableBudget && !fromPR) {
    warnings.push(
      `This PR amount (${formatCurrency(prTotalAmount, prCurrency)}) exceeds the available budget of ${formatCurrency(availableBudget, budgetCurrency)} for "${budgetLabel}"`
    );
    severity = "high";
    withinBudget = false;
  } else if (budgetPercentage > 80) {
    warnings.push(
      `This PR amount would bring "${budgetLabel}" to ${budgetPercentage.toFixed(0)}% utilization (available: ${formatCurrency(availableBudget, budgetCurrency)})`
    );
    if (severity === "low") severity = "medium";
  } else if (budgetPercentage > 60) {
    warnings.push(
      `"${budgetLabel}" will be at ${budgetPercentage.toFixed(0)}% utilization after this PR`
    );
  }

  // Check for unusually large single PR relative to budget line
  if (budgetLineAmount > 0 && convertedPRAmount > budgetLineAmount * 0.3) {
    warnings.push(
      `This PR amount (${formatCurrency(prTotalAmount, prCurrency)}) is unusually large — exceeds 30% of the budget line total (${formatCurrency(budgetLineAmount, budgetCurrency)})`
    );
    if (severity === "low") severity = "medium";
  }

  return {
    isWithinBudget: withinBudget,
    totalAmount: prTotalAmount,
    convertedAmount: convertedPRAmount,
    departmentBudget: availableBudget,
    warnings,
    severity,
  };
}

function formatCurrency(amount: number, currency: string = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export async function recommendVendors(
  lineItems: Array<{ description: string; unspscCode?: string; categoryName?: string }>
): Promise<VendorRecommendation[]> {
  const suppliers = await vendorRepo.getAllSuppliersForAI();
  const approvedVendors = suppliers
    .filter((s: any) => (s.status || "").toLowerCase() === "approved")
    .map((s: any) => ({
      id: s.id.toString(),
      companyName: s.company_name || "",
      businessCategory: s.type_of_service || "",
    }));

  if (approvedVendors.length === 0) {
    return [];
  }

  // Extract unique category codes from line items
  const itemCategories = lineItems
    .map(item => item.unspscCode)
    .filter(Boolean) as string[];

  if (itemCategories.length === 0) {
    const vendorList = approvedVendors.map((v: any) => ({
      id: v.id,
      name: v.companyName,
      category: v.businessCategory,
    }));

    const itemDescriptions = lineItems.map(i => i.description).join(", ");

    const prompt = `You are a vendor matching assistant. Match vendors to procurement items.

Items needed: ${itemDescriptions}

Available Approved Vendors:
${JSON.stringify(vendorList, null, 2)}

Recommend up to 3 best-matching vendors. Return a JSON array:
[
  {
    "vendorId": "vendor id",
    "vendorName": "vendor name",
    "matchScore": 0-100,
    "reason": "Brief explanation"
  }
]

Return ONLY the JSON array, no other text.`;

    try {
      const openai = await getAIClient();
      const response = await openai.chat.completions.create({
        model: await getAIModelName(),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_completion_tokens: 500,
      });

      const content = response.choices[0]?.message?.content || "[]";
      const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
      const matches = JSON.parse(cleanedContent);

      return matches.map((m: any) => ({
        vendorId: m.vendorId,
        vendorName: m.vendorName,
        matchScore: m.matchScore,
        qualificationStatus: "approved",
        matchingCategories: [],
        reason: m.reason,
      }));
    } catch (error) {
      console.error("Error matching vendors:", error);
      return [];
    }
  }

  const vendorList = approvedVendors.map((v: any) => ({
    id: v.id,
    name: v.companyName,
    category: v.businessCategory,
  }));

  const itemDescriptions = lineItems.map(i => `${i.description} (UNSPSC: ${i.unspscCode})`).join(", ");

  const prompt = `You are a vendor matching assistant. Match vendors to procurement items using UNSPSC codes.

Items needed: ${itemDescriptions}

Available Approved Vendors:
${JSON.stringify(vendorList, null, 2)}

Recommend up to 5 best-matching vendors. Return a JSON array:
[
  {
    "vendorId": "vendor id",
    "vendorName": "vendor name",
    "matchScore": 0-100,
    "reason": "Brief explanation"
  }
]

Return ONLY the JSON array, no other text.`;

  try {
    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "[]";
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const matches = JSON.parse(cleanedContent);

    return matches.map((m: any) => ({
      vendorId: m.vendorId,
      vendorName: m.vendorName,
      matchScore: m.matchScore,
      qualificationStatus: "approved",
      matchingCategories: [],
      reason: m.reason,
    }));
  } catch (error) {
    console.error("Error matching vendors:", error);
    return [];
  }
}

export async function checkDuplicatePR(
  title: string,
  description: string,
  department: string
): Promise<DuplicateCheck> {
  const prResult = await getPool().query(
    `SELECT pr_number, pr_description, department_name, pr_created_date
     FROM dbo.supp_pr_header_dtls
     WHERE pr_status NOT IN ('Cancelled', 'Rejected')
     ORDER BY pr_created_date DESC NULLS LAST
     LIMIT 20`
  );

  const recentPRs = prResult.rows;
  if (recentPRs.length === 0) {
    return { isDuplicate: false, similarPRs: [] };
  }

  const prList = recentPRs.map((pr: any) => ({
    prNumber: pr.pr_number,
    title: pr.pr_description || "",
    description: pr.pr_description || "",
    department: pr.department_name || "",
    createdAt: pr.pr_created_date,
  }));

  const prompt = `You are a procurement assistant. Check if a new Purchase Request might be a duplicate of existing ones.

New PR:
- Title: ${title}
- Description: ${description || "Not provided"}
- Department: ${department}

Existing PRs:
${JSON.stringify(prList, null, 2)}

Analyze if the new PR is similar to any existing PRs. Consider:
- Similar titles or descriptions
- Same department with similar items
- Requests for the same type of goods/services

Return a JSON object:
{
  "isDuplicate": true/false,
  "similarPRs": [
    {
      "prNumber": "PR number",
      "similarity": 0.0 to 1.0
    }
  ]
}

Only include PRs with similarity > 0.5. Return ONLY the JSON object, no other text.`;

  try {
    const openai = await getAIClient();
    const response = await openai.chat.completions.create({
      model: await getAIModelName(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || '{"isDuplicate": false, "similarPRs": []}';
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleanedContent);

    const similarPRs = result.similarPRs.map((match: any) => {
      const pr = recentPRs.find(p => p.prNumber === match.prNumber);
      return {
        prNumber: match.prNumber,
        title: pr?.title || "",
        department: pr?.department || "",
        createdAt: pr?.createdAt || "",
        similarity: match.similarity,
      };
    });

    return {
      isDuplicate: result.isDuplicate && similarPRs.length > 0,
      similarPRs,
    };
  } catch (error) {
    console.error("Error checking duplicates:", error);
    return { isDuplicate: false, similarPRs: [] };
  }
}
