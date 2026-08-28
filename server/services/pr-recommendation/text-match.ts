/**
 * Fuzzy text matching for budget relevance scoring. Pure functions with no I/O
 * so the scoring behaviour can be unit tested against fixture strings.
 *
 * Matching is deliberately done in-process rather than in SQL: pg_trgm is not
 * guaranteed to be installed, and the approved-budget candidate set is small.
 */

/**
 * Words carrying no discriminating signal in a procurement request or a budget
 * label. Stripping "budget" matters most: without it every budget name shares a
 * token with every other one and the scores compress toward the middle.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "and", "or", "to", "in", "on", "with", "from",
  "create", "raise", "new", "need", "needs", "want", "wants", "buy", "purchase",
  "purchasing", "order", "please", "requisition", "req", "pr", "some", "our",
  "my", "we", "us", "is", "are", "be", "will", "budget", "budgets", "allocation",
  "fund", "funds", "funding", "cost", "centre", "center", "team", "teams",
]);

/** Lowercases, replaces punctuation with spaces, and collapses whitespace. */
export function normalize(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalized text with the word breaks removed, so compound spellings compare
 * equal ("hard disk" / "hard-disk" / "HardDisk" all become "harddisk").
 */
export function compact(input: string): string {
  return normalize(input).replace(/ /g, "");
}

/**
 * Naive English singularization — enough to make "laptops" match "laptop",
 * which is the case the spec calls out. Not linguistically complete.
 */
export function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("ss")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Splits into meaningful, singularized tokens. Purely numeric tokens are
 * dropped ("20 laptops" carries no signal in the "20").
 *
 * When stopword removal would empty the result the unfiltered tokens are
 * returned instead, so a budget literally named "Budget" still scores.
 */
export function tokenize(input: string): string[] {
  const raw = normalize(input)
    .split(" ")
    .filter((t) => t.length > 0 && !/^\d+$/.test(t))
    .map(singularize);
  const filtered = raw.filter((t) => !STOPWORDS.has(t));
  return filtered.length > 0 ? filtered : raw;
}

/** Sørensen–Dice coefficient over character bigrams. Returns [0,1]. */
export function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return map;
  };

  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  let intersection = 0;
  let aTotal = 0;
  let bTotal = 0;
  aGrams.forEach((count) => {
    aTotal += count;
  });
  bGrams.forEach((count, gram) => {
    bTotal += count;
    const inA = aGrams.get(gram);
    if (inA) intersection += Math.min(inA, count);
  });
  if (aTotal + bTotal === 0) return 0;
  return (2 * intersection) / (aTotal + bTotal);
}

/**
 * Bigram overlap alone is too generous on short words — "catering" and
 * "engineering" share four bigrams and score 0.47, which is enough noise to
 * float an unrelated budget above the relevance floor. Anything below this is
 * treated as no match at all.
 */
const TOKEN_MATCH_FLOOR = 0.7;

/** Best similarity between one token and any token in the set. */
function bestTokenMatch(token: string, against: string[]): number {
  let best = 0;
  for (const other of against) {
    const score = token === other ? 1 : diceCoefficient(token, other);
    if (score > best) best = score;
    if (best === 1) break;
  }
  return best >= TOKEN_MATCH_FLOOR ? best : 0;
}

/**
 * Similarity of a candidate label to a query, in [0,1].
 *
 * Combines the single strongest token hit with how much of the candidate the
 * query accounts for. Peak alone would score "Marketing Budget" full marks for
 * any query containing "budget"; coverage alone would punish long but correct
 * labels. Weighting toward peak keeps short queries usable.
 */
export function similarity(query: string, candidate: string): number {
  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidate);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  let peak = 0;
  let coverageTotal = 0;
  for (const token of candidateTokens) {
    const score = bestTokenMatch(token, queryTokens);
    if (score > peak) peak = score;
    coverageTotal += score;
  }
  const coverage = coverageTotal / candidateTokens.length;
  return 0.6 * peak + 0.4 * coverage;
}

/** Highest similarity of any query term against the candidate. */
export function bestSimilarity(queryTerms: string[], candidate: string | null | undefined): number {
  if (!candidate) return 0;
  let best = 0;
  for (const term of queryTerms) {
    const score = similarity(term, candidate);
    if (score > best) best = score;
  }
  return best;
}
