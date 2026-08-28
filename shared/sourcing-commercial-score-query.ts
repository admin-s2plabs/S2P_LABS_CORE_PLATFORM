export type CommercialScoreIntent = "show" | "suggest" | "score";

function hasBidReference(text: string): boolean {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/\{\{[^}]*bid[^}]*\}\}/i.test(raw)) return false;
  if (/\b(?:RFQ|RFP|TND)\d{4,}\b/i.test(raw)) return true;
  if (/\bbid\b[\s#:()-]*\d{2,}\b/i.test(raw)) return true;
  return false;
}

/**
 * True when the user is asking to suggest, show, or perform commercial/financial
 * scoring for a specific bid. Excludes pure ranking/compare queries, which are
 * handled by the compare-bids flow.
 */
export function isCommercialScoreIntentPrompt(text: string): boolean {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (!hasBidReference(raw)) return false;

  const mentionsCommercial = /\b(commercial|financial|finance)\b/i.test(raw);
  const mentionsScore = /\bscor(e|es|ing|ed)?\b/i.test(raw);
  if (!mentionsCommercial || !mentionsScore) return false;

  // Skip pure compare/ranking queries — those belong to compare-bids.
  if (/\bcompare\b/i.test(raw)) return false;
  if (/\b(rank|ranking|rankings)\b/i.test(raw)) return false;

  const isSuggest = /\b(suggest|recommend|auto[-\s]?score|generate|propose)\b/i.test(raw);
  const isShow = /\b(show|view|display|get|see|what(?:'s| is| are)?)\b/i.test(raw);
  const isScore = /\b(score|scoring|evaluate|assess)\b/i.test(raw);

  return isSuggest || isShow || isScore;
}

/**
 * Classify the user's commercial score intent. "show" only requests to view
 * existing scores; "suggest" and "score" request the AI to generate/apply scores.
 */
export function classifyCommercialScoreIntent(text: string): CommercialScoreIntent {
  const raw = String(text || "").trim().toLowerCase();

  const isSuggest = /\b(suggest|recommend|auto[-\s]?score|generate|propose)\b/.test(raw);
  if (isSuggest) return "suggest";

  // Explicit "show/view/display/get" without a suggest/score verb → read-only view.
  const isShow = /\b(show|view|display|see)\b/.test(raw);
  const isScoreVerb = /\b(score it|score this|score the|do the scoring|scoring for|evaluate|assess)\b/.test(raw);
  if (isShow && !isScoreVerb) return "show";

  if (isScoreVerb) return "score";

  // "what are the commercial scores" style → show.
  if (/\bwhat\b/.test(raw)) return "show";

  return "suggest";
}
