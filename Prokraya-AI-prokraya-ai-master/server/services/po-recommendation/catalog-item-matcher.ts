/**
 * Catalog item matching for Direct PO, without embeddings.
 *
 * Flow: extracted user phrase → keyword/fuzzy candidates → LLM MATCH / NO_MATCH.
 * Pure helpers live here so ranking and validator parsing can be unit tested
 * without Postgres or an AI client. I/O (searchItems, LLM) stays in adapters.
 */

import { compact, similarity, tokenize } from "../pr-recommendation/text-match";

export interface CatalogSearchHit {
  id: string;
  itemCode?: string | null;
  name: string;
  description?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  unitOfMeasure?: string | null;
  standardPrice?: number | null;
}

export interface RankedCatalogCandidate extends CatalogSearchHit {
  score: number;
}

export type CatalogMatchDecision =
  | { decision: "MATCH"; itemId: string }
  | { decision: "NO_MATCH" };

/** How many ranked hits to send to the LLM validator. */
export const CATALOG_MATCH_TOP_K = 10;

/**
 * Minimum fuzzy score to keep a search hit as a candidate. Below this the
 * name overlap is noise (e.g. "mugs" vs unrelated short SKUs).
 */
export const CATALOG_CANDIDATE_FLOOR = 0.25;

/** Search terms derived from a free-text item phrase (singularized, de-stopped). */
export function catalogSearchTerms(phrase: string): string[] {
  const tokens = tokenize(phrase);
  const terms = new Set<string>();
  // Prefer tokenized terms (qty digits already dropped). Also keep a cleaned
  // multi-word phrase for ILIKE without leading quantities ("5 laptops" → "laptops").
  const cleanedPhrase = phrase
    .trim()
    .replace(/^\d+(\.\d+)?\s+/, "")
    .trim();
  if (cleanedPhrase.length >= 2) terms.add(cleanedPhrase);
  // A catalog row may spell the compound as one word, which a phrase substring
  // search never reaches.
  const compacted = compact(cleanedPhrase);
  if (compacted.length >= 2) terms.add(compacted);
  for (const token of tokens) {
    if (token.length >= 2) terms.add(token);
  }
  return Array.from(terms);
}

/** Leading characters of a long token used to probe for a split catalog name. */
export const CATALOG_PREFIX_PROBE_LENGTH = 4;

/**
 * Retrieval terms to try only when the primary ones found nothing. Substring
 * search resolves the compound spelling in one direction only — it reaches
 * "harddisk" from "hard disk" via the compacted term, but a compound query can
 * never reach a split row. Probing the leading prefix of each long token covers
 * the other direction; ranking still decides whether a hit is really the item.
 */
export function catalogFallbackSearchTerms(phrase: string): string[] {
  const terms = new Set<string>();
  for (const token of tokenize(phrase)) {
    // Only tokens long enough to plausibly be two words joined together.
    if (token.length >= CATALOG_PREFIX_PROBE_LENGTH * 2) {
      terms.add(token.slice(0, CATALOG_PREFIX_PROBE_LENGTH));
    }
  }
  return Array.from(terms);
}

/**
 * Ranks catalog search hits against the user phrase. Highest similarity first;
 * ties keep the earlier hit order (stable enough for deterministic tests).
 */
export function rankCatalogCandidates(
  phrase: string,
  hits: CatalogSearchHit[],
  options: { floor?: number; topK?: number } = {},
): RankedCatalogCandidate[] {
  const floor = options.floor ?? CATALOG_CANDIDATE_FLOOR;
  const topK = options.topK ?? CATALOG_MATCH_TOP_K;
  if (!phrase.trim() || hits.length === 0 || topK <= 0) return [];

  const seen = new Set<string>();
  const ranked: RankedCatalogCandidate[] = [];

  for (const hit of hits) {
    const id = String(hit.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const label = [hit.name, hit.description, hit.itemCode, hit.categoryName]
      .filter(Boolean)
      .join(" ");
    // Word breaks are a spelling choice, not a difference in meaning: token
    // similarity scores a compound name against its spaced form below the
    // per-token floor, which would drop an otherwise exact row.
    const score = Math.max(
      similarity(phrase, hit.name || ""),
      similarity(phrase, label),
      similarity(compact(phrase), compact(hit.name || "")),
    );
    if (score < floor) continue;
    ranked.push({ ...hit, id, score });
  }

  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked.slice(0, topK);
}

/**
 * Parses the LLM validator JSON. Only accepts an itemId that appears in the
 * candidate list — never trusts a hallucinated catalog id.
 */
export function parseCatalogMatchDecision(
  content: string,
  candidateIds: string[],
): CatalogMatchDecision {
  const allowed = new Set(candidateIds.map((id) => String(id)));
  try {
    const cleaned = (content || "").replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const decision = String(parsed?.decision || "").toUpperCase();
    const itemId = parsed?.itemId != null ? String(parsed.itemId).trim() : "";

    if (decision === "MATCH" && itemId && allowed.has(itemId)) {
      return { decision: "MATCH", itemId };
    }
  } catch {
    // Fall through to NO_MATCH.
  }
  return { decision: "NO_MATCH" };
}

/** Prompt body for the MATCH / NO_MATCH validator (candidates already ranked). */
export function buildCatalogMatchValidatorPrompt(
  phrase: string,
  candidates: RankedCatalogCandidate[],
): string {
  const list = candidates.map((c) => ({
    id: c.id,
    code: c.itemCode ?? null,
    name: c.name,
    category: c.categoryName ?? null,
    score: Number(c.score.toFixed(3)),
  }));

  return `You are a procurement catalog matcher. The user asked to buy: "${phrase}".

Candidate items from the Item Master (already ranked by text similarity):
${JSON.stringify(list, null, 2)}

Decide whether exactly one candidate is the same product the user meant.
- MATCH only when a candidate clearly is that item (brand/model variants of the same product type are OK if the user was generic, e.g. "laptop" → a specific laptop SKU).
- NO_MATCH when nothing fits (e.g. user said "mugs" and candidates are unrelated), or when several candidates are equally plausible and you cannot pick one safely.

Respond with ONLY JSON:
{"decision":"MATCH","itemId":"<id from the list>"}
or
{"decision":"NO_MATCH"}
Never invent an id that is not in the list.`;
}
