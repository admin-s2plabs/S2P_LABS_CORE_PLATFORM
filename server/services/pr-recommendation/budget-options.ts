/**
 * Builds the option list backing the budget dropdown on the PR and PO review
 * cards.
 *
 * The AI ranking decides which budget is *selected*; it must not decide which
 * budgets are *selectable*. Every approved line is offered so the user can pick
 * one the matcher scored poorly, and the currently selected line is pinned
 * first — a Radix Select renders its value by finding the matching option, so a
 * selected id missing from this list makes the field render blank.
 */

import type { PrRecommendationOption, PrRecommendedBudget } from "@shared/agent-pr-recommendation";
import type { BudgetLineCandidate } from "./ports";

/** The dropdown label for a budget line: master name plus its cost centre. */
export function budgetLineLabel(budgetName: string, costCentreName: string | null): string {
  return [budgetName, costCentreName].filter(Boolean).join(" · ");
}

export function buildBudgetSelectOptions(
  lines: BudgetLineCandidate[],
  selected?: Pick<PrRecommendedBudget, "budgetLineId" | "budgetName" | "costCentreName"> | null,
): PrRecommendationOption[] {
  const byId = new Map<number, PrRecommendationOption>();

  for (const line of lines) {
    byId.set(line.budgetLineId, {
      id: String(line.budgetLineId),
      label: budgetLineLabel(line.budgetName, line.costCentreName),
    });
  }

  // A line the user pinned by id may no longer be in the approved list.
  if (selected?.budgetLineId != null && !byId.has(selected.budgetLineId)) {
    byId.set(selected.budgetLineId, {
      id: String(selected.budgetLineId),
      label:
        budgetLineLabel(selected.budgetName, selected.costCentreName) ||
        String(selected.budgetLineId),
    });
  }

  const ordered: PrRecommendationOption[] = [];
  if (selected?.budgetLineId != null) {
    const pinned = byId.get(selected.budgetLineId);
    if (pinned) ordered.push(pinned);
  }
  for (const option of Array.from(byId.values())) {
    if (!ordered.some((entry) => entry.id === option.id)) ordered.push(option);
  }
  return ordered;
}
