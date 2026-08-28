import type { TechnicalRequirementScore } from "@shared/technical-evaluation";
import { getPersistedReviewRemark } from "@shared/technical-evaluation-remarks";

export function resolveAiPersistedScore(
  aiReqScore: Pick<TechnicalRequirementScore, "score" | "suggestedScore" | "maxScore" | "weight">,
  maxWeight: number,
): number {
  const direct = Number(aiReqScore.score);
  if (Number.isFinite(direct) && direct >= 0) {
    return Math.min(Math.round(direct * 10) / 10, maxWeight);
  }
  const raw = Number(aiReqScore.suggestedScore);
  if (Number.isNaN(raw)) return 0;
  const scaled = Math.round((raw / 10) * maxWeight * 10) / 10;
  return Math.min(scaled, maxWeight);
}

export function formatAiScoreRemark(score: TechnicalRequirementScore): string {
  return getPersistedReviewRemark(score);
}
