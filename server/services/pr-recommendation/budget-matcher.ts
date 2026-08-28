/**
 * Scores approved budget lines against a procurement request and picks the best.
 *
 * Selection operates on budget *lines*, not budget headers, because cost centre
 * and description live on the line and the PR stores `budget_segment` (a line
 * id) anyway. Scoring lines also folds the spec's first tiebreaker ("prefer the
 * budget with the most relevant line item") into the primary score.
 */

import { bestSimilarity } from "./text-match";
import type { BudgetLineCandidate } from "./ports";

export const CRITERION_WEIGHTS = {
  budgetName: 0.45,
  costCentre: 0.3,
  description: 0.25,
} as const;

/**
 * Below this the match is treated as noise and no budget is recommended. Set
 * low enough that a strong hit on the cost centre alone (weight 0.30) still
 * qualifies; token-level filtering in text-match keeps genuine noise at zero.
 */
export const MIN_RELEVANCE_SCORE = 0.18;

/** Scores within this of the leader are considered tied. */
export const TIE_EPSILON = 0.02;

export interface ScoredBudgetLine {
  candidate: BudgetLineCandidate;
  score: number;
  breakdown: {
    budgetName: number;
    costCentre: number;
    description: number;
  };
}

export type BudgetSelection =
  | { status: "selected"; selected: ScoredBudgetLine; scored: ScoredBudgetLine[] }
  | { status: "ambiguous"; tied: ScoredBudgetLine[]; scored: ScoredBudgetLine[] }
  | { status: "no_match"; scored: ScoredBudgetLine[] };

export function scoreBudgetLine(queryTerms: string[], candidate: BudgetLineCandidate): ScoredBudgetLine {
  const costCentreLabel = [candidate.costCentreName, candidate.costCentreCode]
    .filter(Boolean)
    .join(" ");

  const breakdown = {
    budgetName: bestSimilarity(queryTerms, candidate.budgetName),
    costCentre: bestSimilarity(queryTerms, costCentreLabel),
    description: bestSimilarity(queryTerms, candidate.lineDescription),
  };

  const score =
    CRITERION_WEIGHTS.budgetName * breakdown.budgetName +
    CRITERION_WEIGHTS.costCentre * breakdown.costCentre +
    CRITERION_WEIGHTS.description * breakdown.description;

  return { candidate, score, breakdown };
}

function approvedAtMillis(line: ScoredBudgetLine): number {
  return line.candidate.approvedAt ? line.candidate.approvedAt.getTime() : -Infinity;
}

/**
 * Ranks every approved line and applies the tiebreak chain: highest score, then
 * most recently approved, then — rather than guessing — reports ambiguity so the
 * caller can ask the user.
 */
export function selectBestBudgetLine(
  candidates: BudgetLineCandidate[],
  queryTerms: string[],
  options: { minScore?: number; tieEpsilon?: number } = {},
): BudgetSelection {
  const minScore = options.minScore ?? MIN_RELEVANCE_SCORE;
  const tieEpsilon = options.tieEpsilon ?? TIE_EPSILON;

  const scored = candidates
    .map((candidate) => scoreBudgetLine(queryTerms, candidate))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Compared for inequality rather than subtracted: both sides are
      // -Infinity when neither budget has an approval date, and subtracting
      // those yields NaN, which makes the sort order undefined.
      const aApproved = approvedAtMillis(a);
      const bApproved = approvedAtMillis(b);
      if (aApproved !== bApproved) return bApproved - aApproved;
      return a.candidate.budgetLineId - b.candidate.budgetLineId;
    });

  if (scored.length === 0 || scored[0].score < minScore) {
    return { status: "no_match", scored };
  }

  const best = scored[0];
  const tied = scored.filter((line) => best.score - line.score <= tieEpsilon);
  if (tied.length === 1) {
    return { status: "selected", selected: best, scored };
  }

  const newest = approvedAtMillis(tied[0]);
  const stillTied = tied.filter((line) => approvedAtMillis(line) === newest);
  if (stillTied.length === 1) {
    return { status: "selected", selected: stillTied[0], scored };
  }

  return { status: "ambiguous", tied: stillTied, scored };
}
