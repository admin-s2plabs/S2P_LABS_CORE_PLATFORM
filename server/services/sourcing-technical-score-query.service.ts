import type { TechnicalReviewSpec } from "@shared/sourcing-technical-review";
import type { TechnicalScoreIntent } from "@shared/sourcing-technical-score-query";
import type { SourcingActivationStageItem } from "@shared/sourcing-activation-signals";
import * as bidService from "../modules/bids/bids.service";
import {
  buildTechnicalReviewSpec,
  resolveNumericBidId,
  type TechnicalReviewSpecOptions,
} from "./sourcing-technical-review.service";

interface TechnicalScoreQueryResult {
  message: string;
  spec?: TechnicalReviewSpec;
}

/**
 * Prepares an activation-signal technical review card through the same guarded
 * auto-scoring flow used by explicit Sourcing Agent score requests. If scoring
 * or its prerequisite lookups fail, the normal editable review card is still
 * returned whenever it can be built.
 */
export async function buildAutoScoredTechnicalReviewSpec(
  item: SourcingActivationStageItem,
  sessionUser: any,
): Promise<TechnicalReviewSpec | null> {
  try {
    const result = await handleTechnicalScoreQuery(
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
    console.warn("Technical activation auto-scoring failed; returning the normal review card:", error);
  }

  return buildTechnicalReviewSpec(item, sessionUser);
}

function summarizeScores(spec: TechnicalReviewSpec): string {
  if (!spec.responses.length) return "";
  const lines = spec.responses.map(
    (r) => `- **${r.supplierName}**: ${r.techScore === "-" ? "NA" : r.techScore}`,
  );
  return lines.join("\n");
}

function isTerminalStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("awarded") || s.includes("award under process");
}

function isPreScoringStatus(status: string): boolean {
  const s = status.toLowerCase();
  return [
    "draft",
    "pending approval",
    "published",
    "cancelled",
    "rejected",
    "on hold",
  ].some((x) => s.includes(x));
}

/**
 * Deterministic handler for "suggest / show / score technical scores for bid X"
 * queries in the Sourcing Agent. Unlike prepare_technical_review (which stages the
 * activation-signals review card unconditionally), this checks reviewer
 * authorization and bid lifecycle state (Draft/pre-scoring, awarded/complete, RFQ),
 * runs AI auto-scoring when appropriate, and otherwise returns a read-only view or
 * a clear reason.
 */
export async function handleTechnicalScoreQuery(
  bidRef: { bidNumber?: string; bidId?: number },
  sessionUser: any,
  intent: TechnicalScoreIntent,
  options?: { includeBlockedCard?: boolean },
): Promise<TechnicalScoreQueryResult> {
  if (!sessionUser) {
    return { message: "Sign in to view or score technical responses." };
  }

  const bidId =
    (bidRef.bidId && Number.isFinite(bidRef.bidId) ? bidRef.bidId : null) ||
    (await resolveNumericBidId(bidRef.bidNumber));

  if (!bidId) {
    return {
      message:
        "Please tell me which bid you mean — include a bid number (e.g. RFP260073) so I can look up its technical scores.",
    };
  }

  const item = {
    bidId: String(bidId),
    title: bidRef.bidNumber || String(bidId),
  };

  const baseSpec = await buildTechnicalReviewSpec(item, sessionUser);
  if (!baseSpec) {
    return {
      message:
        "I couldn't load the technical scoring details for that bid. Please try again or open the bid from its detail page.",
    };
  }

  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);
  const scoreStatus = userId ? await bidService.getTechScoreStatus(bidId, userId) : null;
  const onReviewTeam = scoreStatus?.userTeams?.includes("Technical Review Team") ?? false;

  const bidLabel = baseSpec.bidNumber;
  const isRfq = baseSpec.bidType === "RFQ";
  const terminal = isTerminalStatus(baseSpec.status);
  const complete = baseSpec.techScoreComplete || baseSpec.scoreApproved;
  const alreadySubmitted = baseSpec.scoreSubmitted;
  const notStarted =
    isPreScoringStatus(baseSpec.status) || baseSpec.responsesCount === 0;

  const buildSpec = (options: TechnicalReviewSpecOptions) =>
    buildTechnicalReviewSpec(item, sessionUser, options);

  // 1. RFQ — no technical scoring at all.
  if (isRfq) {
    const spec = await buildSpec({
      readOnly: true,
      canScore: false,
      canSubmit: false,
      viewMode: "scores",
      scoringState: "complete",
      blockReason: "RFQ bids do not use technical scoring.",
    });
    return {
      message: `Bid **${bidLabel}** is an **RFQ** — technical scoring only applies to RFP and Tender bids, so there are no technical scores to suggest or show.`,
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
      : "has completed technical scoring";
    const suffix =
      intent === "suggest" || intent === "score"
        ? " Scoring is already finished, so new scores can't be suggested."
        : "";
    return {
      message: `Bid **${bidLabel}** ${statePhrase}.${suffix}${scores ? `\n\nCurrent technical scores:\n${scores}` : ""}`,
      spec: spec ?? undefined,
    };
  }

  // 3. Not yet open for scoring (Draft / pre-review / no responses) — read-only.
  if (notStarted) {
    const spec = await buildSpec({
      readOnly: true,
      canScore: false,
      canSubmit: false,
      viewMode: "scores",
      scoringState: "not_started",
      blockReason: "This bid is not open for technical scoring yet.",
    });
    const reason =
      baseSpec.responsesCount === 0
        ? `has no supplier responses yet, so there's nothing to score`
        : `is in **${baseSpec.status}** — technical scoring can't start until the bid is published, closed, and its envelope is opened`;
    return {
      message: `Bid **${bidLabel}** ${reason}.`,
      spec: spec ?? undefined,
    };
  }

  // 4. Read-only "show" intent — anyone can view current scores.
  if (intent === "show") {
    const spec = await buildSpec({
      readOnly: !onReviewTeam,
      viewMode: "scores",
      scoringState: alreadySubmitted ? "submitted" : "pending",
    });
    const scores = summarizeScores(spec ?? baseSpec);
    return {
      message: `Here are the current technical scores for bid **${bidLabel}**.${scores ? `\n\n${scores}` : "\n\nNo scores have been entered yet."}`,
      spec: spec ?? undefined,
    };
  }

  // 5. suggest / score — requires Technical Review Team membership.
  // Action follow-ups (submit/score) return message only — do not reopen the card
  // unless the caller explicitly wants the blocked card (initial activation open)
  // or the user asked to view/show scores.
  if (!onReviewTeam) {
    const message =
      "You can't submit scores because you're not assigned to this review.";
    if (intent === "show" || options?.includeBlockedCard) {
      const spec = await buildSpec({
        readOnly: true,
        canScore: false,
        canSubmit: false,
        viewMode: "scores",
        blockReason: "You are not assigned to this bid's Technical Review Team.",
      });
      return {
        message:
          intent === "show"
            ? `You can't score bid **${bidLabel}** because you're not assigned to its **Technical Review Team**. Showing a read-only view.`
            : message,
        spec: spec ?? undefined,
      };
    }
    return { message };
  }

  // 6. Authorized reviewer but already submitted their scores.
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
      message: `You've already submitted your technical scores for bid **${bidLabel}**.${scores ? `\n\nSubmitted scores:\n${scores}` : ""}`,
      spec: spec ?? undefined,
    };
  }

  // 7. Authorized reviewer, actionable bid — run AI auto-scoring, then present card.
  let autoScoreMessage = "";
  let aiAutoScored = false;
  try {
    const result = await bidService.runTechnicalAutoScore(bidId, sessionUser);
    aiAutoScored = result.success && result.scored > 0;
    autoScoreMessage = aiAutoScored
      ? `I applied AI-suggested technical scores for bid **${bidLabel}** (${result.scored} requirement score${result.scored === 1 ? "" : "s"}).`
      : `I couldn't apply AI technical scores for bid **${bidLabel}**: ${result.message}`;
  } catch (error: any) {
    autoScoreMessage = `I couldn't run AI technical scoring for bid **${bidLabel}**: ${error?.message || "please try again."}`;
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
