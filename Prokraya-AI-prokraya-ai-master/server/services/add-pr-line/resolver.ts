/**
 * Resolves an AI "add a line item to this PR" request into a line the manual
 * Add Line Item form could have produced.
 *
 * The model is only trusted for what the user said: which PR, which item text,
 * how many, and at what price. Everything that identifies master data is read
 * back out of the application:
 *
 *   - item id / name / category come from the Item Master;
 *   - the unit of measure comes from the AI Assisted Service, which is the only
 *     component allowed to choose a unit (the Item Master stores codes like
 *     "EA" that the line-item dropdown does not accept);
 *   - the currency comes from the target PR, never from a default.
 *
 * A request can leave out the quantity or the price ("add laptops to this PR"),
 * in which case the same two services the Add Line Item sheet offers by hand
 * fill the gap: the AI Assisted Service prices the item, and AI quantity
 * prediction sizes it. Anything the user did state is kept exactly as stated —
 * these only ever fill a blank — and both are marked in the confirmation so the
 * derived numbers are corrected before the line is written, not after.
 *
 * A request naming an item the Item Master does not have is rejected rather
 * than written as free text, because a line with no item id shows an empty
 * category and cannot be edited through the normal form.
 *
 * Pure by design: every lookup arrives through `AddPrLineDeps`, so the
 * precedence rules are testable without a database or an AI client.
 */

/** One Item Master row, narrowed to the fields a requisition line stores. */
export interface ItemMasterRecord {
  id: string;
  itemCode?: string | null;
  name: string;
  categoryCode?: string | null;
  categoryName?: string | null;
  /** The catalog's own unit. Only a fallback — see `AddPrLineDeps.assistItem`. */
  unitOfMeasure?: string | null;
  standardPrice?: number | null;
}

/** The target requisition, as far as this flow is concerned. */
export interface PrContext {
  prNumber: string;
  currency: string;
  department: string | null;
  /** The PR's budget line, which quantity prediction weighs against. */
  budgetLineId: number | null;
}

/** An Item Master row the user picked with `/name` in the composer. */
export interface ResolvedItemMention {
  itemId: string;
  name: string;
}

export interface AddPrLineRequest {
  prNumber: string;
  itemDescription: string;
  quantity: number | null;
  unitCost: number | null;
  itemMentions?: ResolvedItemMention[];
}

/** Everything needed to render a confirmation and write the line. */
export interface ResolvedPrLine {
  prNumber: string;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  categoryCode: string | null;
  categoryName: string | null;
  uom: string;
  quantity: number;
  unitCost: number;
  currency: string;
  amount: number;
  /** True when the request stated no quantity and prediction supplied one. */
  quantityPredicted: boolean;
  /** True when the price is an estimate rather than a real purchase price. */
  priceAssumed: boolean;
}

export type AddPrLineRejection =
  | "pr-not-found"
  | "item-not-found"
  | "item-ambiguous"
  | "invalid-quantity"
  | "invalid-unit-price";

export type AddPrLineResolution =
  | { status: "resolved"; line: ResolvedPrLine }
  | { status: "rejected"; reason: AddPrLineRejection; message: string };

/** What the AI Assisted Service would fill in for an item, as the sheet does. */
export interface AssistedItemDefaults {
  /** Already constrained to the UoM dropdown master. */
  uom: string;
  /** Null when no price source — purchase history, catalog, estimate — could answer. */
  unitPrice: number | null;
  priceAssumed: boolean;
}

export interface AddPrLineDeps {
  loadPrContext(prNumber: string): Promise<PrContext | null>;
  searchItemMaster(query: string): Promise<ItemMasterRecord[]>;
  getItemMasterById(itemId: string): Promise<ItemMasterRecord | null>;
  /**
   * Called with the resolved catalog item, so the service reasons about a real
   * item rather than the user's raw phrasing.
   */
  assistItem(
    item: ItemMasterRecord,
    context: { department: string | null },
  ): Promise<AssistedItemDefaults>;
  /** AI quantity prediction. Null when it cannot answer. */
  predictQuantity(
    item: ItemMasterRecord,
    context: { department: string | null; budgetLineId: number | null },
  ): Promise<number | null>;
}

/**
 * Strips the decoration a mention picks up on its way through the composer —
 * the `/` sigil, the `{{ }}` wrapper the chip renders with, quotes, trailing
 * punctuation — and collapses whitespace. Casing is left alone so messages can
 * quote the user back; matching lowercases separately.
 */
export function normalizeItemQuery(raw: string): string {
  let value = String(raw ?? "").replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();

  // Quotes and sentence punctuation nest in either order ("laptops", / "laptops".),
  // so peel until nothing more comes off rather than fixing one arrangement.
  let previous: string;
  do {
    previous = value;
    value = value
      .replace(/^[/@#^&%]+/, "")
      .replace(/^["'`]+/, "")
      .replace(/["'`]+$/, "")
      .replace(/[.,;:]+$/, "")
      .trim();
  } while (value !== previous);

  return value;
}

/**
 * Reduces an English plural to its singular, or null when the word is not one.
 * Words ending in "ss"/"us"/"is" (glass, status, analysis) are already singular,
 * and a result under three characters is too short to search on ("gas" → "ga").
 */
function singularize(word: string): string | null {
  let singular: string | null = null;
  if (/[^aeiou]ies$/i.test(word)) singular = `${word.slice(0, -3)}y`;
  else if (/(?:sh|ch|ss|x|z|s)es$/i.test(word)) singular = word.slice(0, -2);
  else if (/[^s]s$/i.test(word) && !/(?:us|is)$/i.test(word)) singular = word.slice(0, -1);
  return singular && singular.length >= 3 ? singular : null;
}

/**
 * The forms of a query worth trying against the Item Master, most literal
 * first.
 *
 * The catalog search is a substring match, so it only finds names longer than
 * what was typed: "bottle" reaches the row named "Bottle", but "bottles" — one
 * character too long — reaches nothing at all. People ask for line items in the
 * plural, so the singular of the head noun is tried when the literal query
 * comes back empty. Order matters: a catalog that really does stock "LAPTOPS"
 * answers that query itself, before the singular is ever considered.
 */
export function itemQueryVariants(query: string): string[] {
  const normalized = normalizeItemQuery(query);
  if (!normalized) return [];

  const words = normalized.split(" ");
  const singular = singularize(words[words.length - 1]);
  if (!singular) return [normalized];

  const variant = [...words.slice(0, -1), singular].join(" ");
  return variant.toLowerCase() === normalized.toLowerCase() ? [normalized] : [normalized, variant];
}

export type ItemMasterMatch =
  | { status: "matched"; item: ItemMasterRecord }
  | { status: "ambiguous"; candidates: ItemMasterRecord[] }
  | { status: "not-found" };

/**
 * Picks the Item Master row a search result set is really about.
 *
 * An exact name or item-code hit wins outright, so "LAPTOPS" resolves to
 * LAPTOPS even when the catalog also stocks "LAPTOPS PRO". Failing that, a
 * single candidate is taken as the answer (this is what makes "laptop" find
 * LAPTOPS); several candidates are ambiguous and go back to the user, because
 * guessing here silently buys the wrong thing.
 */
export function findItemMasterMatch(
  items: ItemMasterRecord[],
  query: string,
): ItemMasterMatch {
  const needle = normalizeItemQuery(query).toLowerCase();
  if (!needle) return { status: "not-found" };

  const candidates = items.filter((item) => item && item.id && item.name);
  if (candidates.length === 0) return { status: "not-found" };

  const exactName = candidates.filter(
    (item) => item.name.trim().toLowerCase() === needle,
  );
  if (exactName.length > 0) return { status: "matched", item: exactName[0] };

  const exactCode = candidates.filter(
    (item) => String(item.itemCode ?? "").trim().toLowerCase() === needle,
  );
  if (exactCode.length > 0) return { status: "matched", item: exactCode[0] };

  if (candidates.length === 1) return { status: "matched", item: candidates[0] };
  return { status: "ambiguous", candidates };
}

/**
 * The Item Master row a typed query means, searching each form of the query in
 * turn. A form that finds nothing moves on to the next; one that finds
 * something — even ambiguously — is the answer, since a shortlist the user can
 * choose from beats a guess made from a different spelling.
 */
export async function findItemMasterMatchForQuery(
  query: string,
  searchItemMaster: (query: string) => Promise<ItemMasterRecord[]>,
): Promise<ItemMasterMatch> {
  for (const variant of itemQueryVariants(query)) {
    const match = findItemMasterMatch(await searchItemMaster(variant), variant);
    if (match.status !== "not-found") return match;
  }
  return { status: "not-found" };
}

/**
 * The unit the AI Assisted Service chose for this specific item, or null when
 * the service returned nothing for it. Suggestions for other items are ignored
 * so a line can never inherit a neighbouring item's unit.
 */
export function pickAiAssistedUom(
  suggestions: Array<{ itemId: string; unitOfMeasure?: string | null }>,
  itemId: string,
): string | null {
  const match = suggestions.find((suggestion) => suggestion.itemId === itemId);
  const uom = String(match?.unitOfMeasure ?? "").trim();
  return uom.length > 0 ? uom : null;
}

export function formatItemNotFoundMessage(query: string): string {
  return `I couldn't find "${query}" in the Item Master. Please select an existing item or add the item to Item Master first.`;
}

export function formatItemAmbiguousMessage(
  query: string,
  candidates: ItemMasterRecord[],
): string {
  const shortlist = candidates
    .slice(0, 5)
    .map((item) => `- ${item.name}${item.itemCode ? ` (${item.itemCode})` : ""}`)
    .join("\n");
  const more = candidates.length > 5 ? `\n_…and ${candidates.length - 5} more._` : "";
  return `"${query}" matches more than one Item Master entry. Which one did you mean?\n\n${shortlist}${more}`;
}

const formatAmount = (value: number) => value.toLocaleString("en-US");

/**
 * The confirmation shown before anything is written. Values the user did not
 * state are labelled, because this is the last point at which correcting them
 * costs nothing.
 */
export function formatAddPrLineConfirmation(line: ResolvedPrLine): string {
  const quantityNote = line.quantityPredicted ? " _(AI predicted)_" : "";
  const priceNote = line.priceAssumed ? " _(estimated)_" : "";

  let summary = `## Add Line Item to ${line.prNumber}\n\n`;
  summary += `**Item:** ${line.itemName}\n`;
  if (line.categoryName) summary += `**Category:** ${line.categoryName}\n`;
  summary += `**Quantity:** ${formatAmount(line.quantity)}${quantityNote}\n`;
  summary += `**UOM:** ${line.uom}\n`;
  summary += `**Unit Cost:** ${line.currency} ${formatAmount(line.unitCost)}${priceNote}\n`;
  summary += `**Line Total:** ${line.currency} ${formatAmount(line.amount)}\n`;
  summary += `\n_This line item will be added to ${line.prNumber} in ${line.currency}._\n`;
  if (quantityNote || priceNote) {
    summary += `_Tell me a different ${
      line.quantityPredicted && line.priceAssumed
        ? "quantity or price"
        : line.quantityPredicted
          ? "quantity"
          : "price"
    } to change it before confirming._\n`;
  }
  return summary;
}

/** The message shown once the line exists. */
export function formatAddPrLineResult(line: ResolvedPrLine): string {
  let message = `Line item added to **${line.prNumber}** successfully!\n\n`;
  message += `- **Item**: ${line.itemName}\n`;
  if (line.categoryName) message += `- **Category**: ${line.categoryName}\n`;
  message += `- **Qty**: ${formatAmount(line.quantity)} ${line.uom}\n`;
  message += `- **Unit Cost**: ${line.currency} ${formatAmount(line.unitCost)}\n`;
  message += `- **Total**: ${line.currency} ${formatAmount(line.amount)}\n`;
  message += `\nWould you like to add more items or do something else with this PR?`;
  return message;
}

/**
 * The payload for `procurement.service.addRequisitionLine` — the same service
 * the manual form posts to, so the line it writes is indistinguishable from a
 * hand-entered one.
 */
export function buildAddPrLineBody(line: ResolvedPrLine) {
  return {
    itemDescription: line.itemName,
    quantity: String(line.quantity),
    uom: line.uom,
    unitCost: String(line.unitCost),
    itemId: line.itemId,
    categoryId: line.categoryCode,
    categoryName: line.categoryName,
    currency: line.currency,
  };
}

/** A number the user actually stated, or null when the request left it out. */
function statedNumber(value: unknown, floor: number): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= floor ? parsed : null;
}

/**
 * Runs the resolution order the flow depends on: the PR first (it carries the
 * currency and the budget line), then the item, then the assists that need a
 * resolved item to say anything useful. Resolving the PR up front is what keeps
 * the confirmation from quoting a currency the requisition does not use.
 */
export async function resolveAddPrLine(
  request: AddPrLineRequest,
  deps: AddPrLineDeps,
): Promise<AddPrLineResolution> {
  const pr = await deps.loadPrContext(request.prNumber);
  if (!pr) {
    return {
      status: "rejected",
      reason: "pr-not-found",
      message: `I couldn't find requisition ${request.prNumber}. Please check the PR number and try again.`,
    };
  }

  const query = normalizeItemQuery(request.itemDescription);
  const match = await resolveItem(query, request.itemMentions ?? [], deps);
  if (match.status !== "matched") {
    return {
      status: "rejected",
      reason: match.status === "ambiguous" ? "item-ambiguous" : "item-not-found",
      message:
        match.status === "ambiguous"
          ? formatItemAmbiguousMessage(query, match.candidates)
          : formatItemNotFoundMessage(query),
    };
  }
  const item = match.item;

  // A stated quantity of zero is not a quantity, but a stated price of zero is
  // a real free-of-charge line, so only the former counts as unstated.
  const statedQuantity = statedNumber(request.quantity, 1);
  const statedUnitCost = statedNumber(request.unitCost, 0);

  const [assisted, predicted] = await Promise.all([
    deps.assistItem(item, { department: pr.department }),
    statedQuantity == null
      ? deps.predictQuantity(item, {
          department: pr.department,
          budgetLineId: pr.budgetLineId,
        })
      : Promise.resolve(null),
  ]);

  const quantity = statedQuantity ?? predicted;
  if (quantity == null || quantity <= 0) {
    return {
      status: "rejected",
      reason: "invalid-quantity",
      message: `How many ${item.name} should I add to ${pr.prNumber}? I couldn't work out a quantity for this one.`,
    };
  }

  const unitCost = statedUnitCost ?? assisted.unitPrice;
  if (unitCost == null || unitCost < 0) {
    return {
      status: "rejected",
      reason: "invalid-unit-price",
      message: `What unit price should I use for ${item.name} on ${pr.prNumber}? There's no purchase history or catalog price to go on.`,
    };
  }

  return {
    status: "resolved",
    line: {
      prNumber: pr.prNumber,
      itemId: item.id,
      itemCode: item.itemCode ?? null,
      itemName: item.name,
      categoryCode: item.categoryCode ?? null,
      categoryName: item.categoryName ?? null,
      uom: assisted.uom,
      quantity,
      unitCost,
      currency: pr.currency,
      amount: quantity * unitCost,
      quantityPredicted: statedQuantity == null,
      priceAssumed: statedUnitCost == null && assisted.priceAssumed,
    },
  };
}

/**
 * A mention is a row the user picked from the Item Master themselves, so it
 * outranks a text search. Everything else falls back to searching the catalog.
 */
async function resolveItem(
  query: string,
  mentions: ResolvedItemMention[],
  deps: AddPrLineDeps,
): Promise<ItemMasterMatch> {
  const needle = query.toLowerCase();
  const mentioned = mentions.find(
    (mention) => normalizeItemQuery(mention.name).toLowerCase() === needle,
  );
  if (mentioned) {
    const item = await deps.getItemMasterById(mentioned.itemId);
    if (item) return { status: "matched", item };
  }

  return findItemMasterMatchForQuery(query, deps.searchItemMaster);
}
