import type { CommercialReviewSpec } from "@shared/sourcing-commercial-review";
import type { CommercialScoreIntent } from "@shared/sourcing-commercial-score-query";
import type { SourcingActivationStageItem } from "@shared/sourcing-activation-signals";
import * as bidService from "../modules/bids/bids.service";
import {
  buildCommercialReviewSpec,
  resolveNumericBidId,
  type CommercialReviewSpecOptions,
} from "./sourcing-commercial-review.service";

interface CommercialScoreQueryResult {
  message: string;
  spec?: CommercialReviewSpec;
}

/**
 * Prepares an activation-signal commercial review card through the same guarded
 * auto-scoring flow used by explicit Sourcing Agent score requests. If scoring
 * or its prerequisite lookups fail, the normal editable review card is still
 * returned whenever it can be built.
 */
export async function buildAutoScoredCommercialReviewSpec(
  item: SourcingActivationStageItem,
  sessionUser: any,
): Promise<CommercialReviewSpec | null> {
  try {
    const result = await handleCommercialScoreQuery(
      { bidNumber: String(item.bidId || "") },
      sessionUser,
      "score",
      { includeBlockedCard: true },
    );
    if (result.spec) {
      return {
        ...result.spec,
        taskId: item.taskId ? String(item.taskId) : undefined,
        taskTitle: String(item.title || result.spec.taskTitle),
      };
    }
  } catch (error) {
    console.warn("Commercial activation auto-scoring failed; returning the normal review card:", error);
  }

  return buildCommercialReviewSpec(item, sessionUser);
}

function summarizeScores(spec: CommercialReviewSpec): string {
  if (!spec.responses.length) return "";
  const lines = spec.responses.map(
    (r) => `- **${r.supplierName}**: ${r.commScore === "-" ? "NA" : r.commScore}`,
  );
  return lines.join("\n");
}

function isTerminalStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("awarded") || s.includes("award under process");
}

/**
 * Deterministic handler for "suggest / show / score commercial scores for bid X"
 * queries in the Sourcing Agent. Unlike prepare_commercial_review (which stages
 * the activation-signals review card), this checks reviewer authorization and bid
 * lifecycle state, runs AI auto-scoring when appropriate, and returns a read-only
 * view otherwise.
 */
export async function handleCommercialScoreQuery(
  bidRef: { bidNumber?: string; bidId?: number },
  sessionUser: any,
  intent: CommercialScoreIntent,
  options?: { includeBlockedCard?: boolean },
): Promise<CommercialScoreQueryResult> {
  if (!sessionUser) {
    return { message: "Sign in to view or score commercial responses." };
  }

  const bidId =
    (bidRef.bidId && Number.isFinite(bidRef.bidId) ? bidRef.bidId : null) ||
    (await resolveNumericBidId(bidRef.bidNumber));

  if (!bidId) {
    return {
      message:
        "Please tell me which bid you mean — include a bid number (e.g. RFP260009) so I can look up its commercial scores.",
    };
  }

  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);
  const scoreStatus = userId ? await bidService.getCommScoreStatus(bidId, userId) : null;
  const onReviewTeam = scoreStatus?.userTeams?.includes("Commercial Review Team") ?? false;

  const item = {
    bidId: String(bidId),
    title: bidRef.bidNumber || String(bidId),
  };

  // Build a preliminary spec to read lifecycle state (type, status, completion).
  const baseSpec = await buildCommercialReviewSpec(item, sessionUser);
  if (!baseSpec) {
    return {
      message:
        "I couldn't load the commercial scoring details for that bid. Please try again or open the bid from its detail page.",
    };
  }

  const bidLabel = baseSpec.bidNumber;
  const isRfq = baseSpec.bidType === "RFQ";
  const terminal = isTerminalStatus(baseSpec.status);
  const complete = baseSpec.commScoreComplete || baseSpec.scoreApproved;
  const alreadySubmitted = baseSpec.scoreSubmitted;

  const buildSpec = (options: CommercialReviewSpecOptions) =>
    buildCommercialReviewSpec(item, sessionUser, options);

  // 1. RFQ — no commercial scoring at all.
  if (isRfq) {
    const spec = await buildSpec({
      readOnly: true,
      canScore: false,
      canSubmit: false,
      viewMode: "scores",
      scoringState: "complete",
      blockReason: "RFQ bids do not use commercial scoring.",
    });
    return {
      message: `Bid **${bidLabel}** is an **RFQ** — commercial scoring only applies to RFP and Tender bids, so there are no commercial scores to suggest or show.`,
      spec: spec ?? undefined,
    };
  }

  // 2. Terminal / completed lifecycle — read-only, show existing scores.
  if (terminal || complete) {
    const spec = await buildSpec({
      readOnly: true,
      canScore: false,
      canSubmit: false,
      viewMode: "scores",
      scoringState: terminal ? "awarded" : baseSpec.scoreApproved ? "approved" : "complete",
    });
    const scores = summarizeScores(spec ?? baseSpec);
    const statePhrase = terminal
      ? `is in **${baseSpec.status}**`
      : "has completed commercial scoring";
    const suffix =
      intent === "suggest" || intent === "score"
        ? " Scoring is already finished, so new scores can't be suggested."
        : "";
    return {
      message: `Bid **${bidLabel}** ${statePhrase}.${suffix}${scores ? `\n\nCurrent commercial scores:\n${scores}` : ""}`,
      spec: spec ?? undefined,
    };
  }

  // 3. Read-only "show" intent — anyone can view current scores.
  if (intent === "show") {
    const spec = await buildSpec({
      readOnly: !onReviewTeam,
      viewMode: "scores",
      scoringState: alreadySubmitted ? "submitted" : "pending",
    });
    const scores = summarizeScores(spec ?? baseSpec);
    return {
      message: `Here are the current commercial scores for bid **${bidLabel}**.${scores ? `\n\n${scores}` : "\n\nNo scores have been entered yet."}`,
      spec: spec ?? undefined,
    };
  }

  // 4. suggest / score — requires Commercial Review Team membership.
  // Action follow-ups return message only — do not reopen the card unless the
  // caller wants the blocked card (initial activation open) or intent is "show".
  if (!onReviewTeam) {
    const message =
      "You can't submit scores because you're not assigned to this review.";
    if (intent === "show" || options?.includeBlockedCard) {
      const spec = await buildSpec({
        readOnly: true,
        canScore: false,
        canSubmit: false,
        viewMode: "scores",
        blockReason: "You are not assigned to this bid's Commercial Review Team.",
      });
      return {
        message:
          intent === "show"
            ? `You can't score bid **${bidLabel}** because you're not assigned to its **Commercial Review Team**. Showing a read-only view.`
            : message,
        spec: spec ?? undefined,
      };
    }
    return { message };
  }

  // 5. Authorized reviewer but already submitted their scores.
  if (alreadySubmitted) {
    const spec = await buildSpec({
      readOnly: true,
      canScore: false,
      canSubmit: false,
      viewMode: "scores",
      scoringState: "submitted",
    });
    const scores = summarizeScores(spec ?? baseSpec);
    return {
      message: `You've already submitted your commercial scores for bid **${bidLabel}**.${scores ? `\n\nSubmitted scores:\n${scores}` : ""}`,
      spec: spec ?? undefined,
    };
  }

  // 6. Authorized reviewer, actionable bid — run AI auto-scoring, then present card.
  let autoScoreMessage = "";
  let aiAutoScored = false;
  try {
    const result = await bidService.runCommercialAutoScore(bidId, sessionUser);
    aiAutoScored = result.success;
    autoScoreMessage = result.success
      ? `I applied AI-suggested commercial scores for bid **${bidLabel}** (${result.scored} score entr${result.scored === 1 ? "y" : "ies"}).`
      : `I couldn't apply AI commercial scores for bid **${bidLabel}**: ${result.message}`;
  } catch (error: any) {
    autoScoreMessage = `I couldn't run AI commercial scoring for bid **${bidLabel}**: ${error?.message || "please try again."}`;
  }

  const spec = await buildSpec({
    canScore: true,
    canSubmit: true,
    viewMode: "review",
    scoringState: "pending",
    aiAutoScored,
  });

  const guidance = aiAutoScored
    ? " Review the suggested scores below, adjust if needed, then confirm to submit."
    : "";

  return {
    message: `${autoScoreMessage}${guidance}`,
    spec: spec ?? undefined,
  };
}
