/**
 * The three "what should I buy / how many" questions, kept out of the PO and PR
 * creation flows.
 *
 * "Recommend items for apple laptops", "Suggest the most appropriate items for
 * PR_00072" and "Recommend the quantity for laptops" all have a service behind
 * them already — the AI Advisor, AI Assisted and AI quantity prediction buttons
 * on the requisition screen. None of them was reachable from chat, so the model
 * answered with the nearest tool it did have and opened a Direct PO
 * recommendation card, inventing a budget, a vendor and a line item nobody
 * asked for.
 *
 * `classifyProcurementRecommendationIntent` names the tool for these shapes so
 * the dispatcher can force it, rather than leaving the choice to a system
 * prompt that pushes any message containing an item word towards
 * `recommend_purchase_order`. Anything phrased as creating a PO or PR is left
 * alone and takes the existing path.
 *
 * Pure by design: the intent rules and the rendering are testable without a
 * database or an AI client, and the types below are narrowed structurally so
 * this file pulls in nothing from the service layer.
 */

import { normalizeItemQuery } from "./add-pr-line/resolver";

export const RECOMMEND_ITEMS_TOOL = "recommend_items_for_description";
export const SUGGEST_PR_ITEMS_TOOL = "suggest_items_for_requisition";
export const RECOMMEND_QUANTITY_TOOL = "recommend_item_quantity";

export type ProcurementRecommendationIntent =
  | { tool: typeof RECOMMEND_ITEMS_TOOL; description: string }
  | { tool: typeof SUGGEST_PR_ITEMS_TOOL; prNumber: string }
  | { tool: typeof RECOMMEND_QUANTITY_TOOL; itemName: string };

/** What the AI Advisor and AI Assisted services return, narrowed to what is rendered. */
export interface RecommendedItem {
  itemId: string;
  itemCode?: string | null;
  name: string;
  unitPrice?: number | null;
  priceAssumed?: boolean;
  unitOfMeasure?: string | null;
  categoryName?: string | null;
  reason?: string | null;
  /** AI Advisor only: how often this item appears on past requisitions. */
  frequency?: number | null;
  fromPRs?: string[] | null;
}

/** What AI quantity prediction returns, narrowed to what is rendered. */
export interface QuantityRecommendation {
  suggestedQuantity: number;
  reasoning?: string | null;
  /** 0–1, as the requisition screen's confidence badge reads it. */
  confidence?: number | null;
  basedOn?: string[] | null;
}

/** Asking to create a PO or PR is a creation request even when worded as a suggestion. */
const CREATION_REQUEST =
  /\b(?:create|raise|make|start|open|draft|convert)\b[^.]{0,20}\b(?:po|pr|purchase\s+order|purchase\s+request|purchase\s+requisition|requisition)\b/i;

const QUANTITY_REQUEST =
  /\b(?:recommend|suggest|predict|estimate|forecast)\s+(?:me\s+)?(?:the\s+|a\s+|an\s+)?(?:optimal\s+|right\s+|ideal\s+|appropriate\s+|best\s+)?(?:order\s+)?(?:quantity|qty)\s+(?:for|of)\s+(.+)$/i;

const PR_ITEMS_REQUEST =
  /\b(?:recommend|suggest)\b.*?\bitems?\b.*?\b(PR[_/-]\d[A-Za-z0-9/_-]*)\b/i;

const DESCRIPTION_ITEMS_REQUEST =
  /\b(?:recommend|suggest)\s+(?:me\s+)?(?:some\s+|the\s+|a\s+few\s+)?(?:most\s+)?(?:appropriate\s+|relevant\s+|suitable\s+|best\s+)?items?\s+(?:for|to\s+buy\s+for)\s+(.+)$/i;

/**
 * Which recommendation tool a message asks for, or null when it is ordinary
 * agent traffic. Quantity is checked first because it is the most specific
 * shape, and a named PR beats free text so "suggest items for PR_00072" reads
 * the requisition instead of searching the catalog for the string "PR_00072".
 */
export function classifyProcurementRecommendationIntent(
  prompt: string,
): ProcurementRecommendationIntent | null {
  const text = String(prompt || "").replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (CREATION_REQUEST.test(text)) return null;

  const quantity = text.match(QUANTITY_REQUEST);
  if (quantity) {
    const itemName = normalizeItemQuery(quantity[1]);
    if (itemName) return { tool: RECOMMEND_QUANTITY_TOOL, itemName };
  }

  const prItems = text.match(PR_ITEMS_REQUEST);
  if (prItems) {
    const prNumber = normalizeItemQuery(prItems[1]);
    if (prNumber) return { tool: SUGGEST_PR_ITEMS_TOOL, prNumber };
  }

  const descriptionItems = text.match(DESCRIPTION_ITEMS_REQUEST);
  if (descriptionItems) {
    const description = normalizeItemQuery(descriptionItems[1]);
    if (description) return { tool: RECOMMEND_ITEMS_TOOL, description };
  }

  return null;
}

const formatAmount = (value: number) => value.toLocaleString("en-US");

function formatItemLines(items: RecommendedItem[]): string {
  return items
    .map((item, index) => {
      let entry = `**${index + 1}. ${item.name}**`;
      if (item.itemCode) entry += ` (${item.itemCode})`;
      entry += `\n`;

      const facts: string[] = [];
      if (item.categoryName) facts.push(`Category: ${item.categoryName}`);
      if (item.unitOfMeasure) facts.push(`UOM: ${item.unitOfMeasure}`);
      if (typeof item.unitPrice === "number" && item.unitPrice > 0) {
        facts.push(
          `Unit Price: ${formatAmount(item.unitPrice)}${item.priceAssumed ? " _(estimated)_" : ""}`,
        );
      }
      if (facts.length) entry += `${facts.join(" · ")}\n`;

      if (item.frequency && item.frequency > 0) {
        entry += `Ordered on ${item.frequency} previous requisition${item.frequency === 1 ? "" : "s"}`;
        const prs = (item.fromPRs || []).filter(Boolean);
        if (prs.length) entry += ` (${prs.slice(0, 3).join(", ")})`;
        entry += `\n`;
      }
      if (item.reason) entry += `${item.reason}\n`;
      return entry;
    })
    .join("\n");
}

/** AI Advisor result for a free-text description. */
export function formatItemRecommendations(
  description: string,
  items: RecommendedItem[],
): string {
  if (items.length === 0) {
    return (
      `I couldn't find any Item Master items matching **${description}**. ` +
      `Try different wording, or search the catalog with "search items ${description}".`
    );
  }

  return (
    `## Recommended Items for "${description}"\n\n` +
    `${formatItemLines(items)}\n` +
    `_Recommendations only — nothing has been created. To use one, say "create a PR for ${items[0].name}" or "add ${items[0].name} to PR_00001"._\n`
  );
}

/** AI Assisted result for an existing requisition. */
export function formatRequisitionItemSuggestions(
  prNumber: string,
  items: RecommendedItem[],
): string {
  if (items.length === 0) {
    return (
      `The AI Assisted Service didn't find any Item Master items matching **${prNumber}**'s description. ` +
      `Adding more detail to the requisition description usually gives it more to work with.`
    );
  }

  return (
    `## Suggested Items for ${prNumber}\n\n` +
    `Based on the requisition's own description and department.\n\n` +
    `${formatItemLines(items)}\n` +
    `_Suggestions only — no line items were added to ${prNumber}. To add one, say "add ${items[0].name} to ${prNumber}"._\n`
  );
}

const confidenceTier = (percent: number) =>
  percent >= 80 ? "High" : percent >= 60 ? "Medium" : "Low";

const titleCase = (value: string) =>
  value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/** AI quantity prediction result for one Item Master item. */
export function formatQuantityRecommendation(
  itemName: string,
  prediction: QuantityRecommendation,
  options: { prNumber?: string | null } = {},
): string {
  let summary = `## AI Quantity Recommendation — ${itemName}\n\n`;

  const confidence = Number(prediction.confidence);
  if (Number.isFinite(confidence) && confidence > 0) {
    const percent = Math.round(confidence * 100);
    summary += `**Suggested Quantity:** ${formatAmount(prediction.suggestedQuantity)} · ${confidenceTier(percent)} Confidence (${percent}%)\n\n`;
  } else {
    summary += `**Suggested Quantity:** ${formatAmount(prediction.suggestedQuantity)}\n\n`;
  }

  if (prediction.reasoning) summary += `${prediction.reasoning}\n\n`;

  const basedOn = (prediction.basedOn || []).filter(Boolean).map(titleCase);
  if (basedOn.length) summary += `**Based on:** ${basedOn.join(", ")}\n`;

  summary += options.prNumber
    ? `\n_Using ${options.prNumber}'s budget for context. Nothing has been changed on the requisition._\n`
    : `\n_No requisition or budget context was used, so this is based on past purchases of this item. Nothing has been created._\n`;

  return summary;
}
