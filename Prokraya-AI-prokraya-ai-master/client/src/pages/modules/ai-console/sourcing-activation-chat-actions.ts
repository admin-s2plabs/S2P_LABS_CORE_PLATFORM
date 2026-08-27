/**
 * Natural-language command parsing for Sourcing Agent activation review cards.
 * Mirrors the vendor-agent supplier-approval chat path: typed commands drive the
 * same card mutations as the UI buttons (validations, comments, APIs).
 */

export type SourcingActivationCardKind =
  | "bidApproval"
  | "openEnvelope"
  | "technicalReview"
  | "technicalEvaluation"
  | "commercialReview"
  | "commercialEvaluation"
  | "awarding"
  | "bidAwardSubmit"
  | "bidAwardApproval";

export type SourcingChatActionRequest = {
  nonce: number;
  kind: "start" | "confirm" | "cancel";
  card: SourcingActivationCardKind;
  /** Card-specific action verb */
  action?:
    | "approve"
    | "reject"
    | "open"
    | "submit"
    | "submit_score"
    | "approve_score"
    | "save_evaluation"
    | "award"
    | "accept";
  comments?: string;
  /** Bid response id used when awarding */
  supplierId?: string;
  supplierName?: string;
};

export type PendingActivationTarget = {
  msgIndex: number;
  card: SourcingActivationCardKind;
  label: string;
  bidNumber?: string;
  /** Bid award approval: workflow vs committee */
  canApprove?: boolean;
  canAcceptCommittee?: boolean;
  /** Awarding: draft submit available */
  canSubmitAward?: boolean;
  canAward?: boolean;
  canOpenEnvelope?: boolean;
  openEnvelopeBlockReason?: string;
  /** Score submit / approve availability from the activation card payload */
  canSubmitScore?: boolean;
  canApproveScore?: boolean;
  scoreBlockReason?: string;
  /** True when the viewer is not on the required review/approve team */
  assignmentBlocked?: boolean;
  suppliers?: Array<{ id: string; name: string }>;
};

/** True when blockReason indicates the user is not on the review/approve team. */
export function isAssignmentBlockReason(reason: string | undefined | null): boolean {
  return /\bnot assigned\b/i.test(String(reason || ""));
}

/**
 * Explicit request to re-open / view a review card that was previously shown
 * in a blocked (not-assigned) state. Action verbs like submit/approve are excluded.
 */
export function isExplicitReviewViewRequest(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized || normalized.length > 400) return false;
  if (
    /\b(?:submit|approve|reject|deny|decline|accept|award|open(?:\s+the)?\s+envelope|save\s+evaluation|send\s+scores?|confirm(?:\s+submit)?)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return (
    /\b(?:show|view|display|see|open|reopen|bring\s+up|pull\s+up)\b/i.test(normalized) &&
    /\b(?:review|card|scores?|details?|it|this|again)\b/i.test(normalized)
  );
}

/** Typed follow-up that tries to act on a review (submit / approve / etc.). */
export function isReviewActionFollowUp(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized || normalized.length > 400) return false;
  if (isExplicitReviewViewRequest(normalized)) return false;
  return (
    /\b(?:submit(?:\s+(?:the\s+)?(?:tech(?:nical)?|commercial|comm)?\s*scores?)?|submit\s+score|submit\s+review|send\s+scores?|approve(?:\s+(?:the\s+)?(?:tech(?:nical)?|commercial|comm)?\s*scores?)?|approve\s+score|confirm(?:\s+(?:submit|approv(?:e|al)))?|continue|proceed)\b/i.test(
      normalized,
    ) ||
    /^(?:submit|approve|confirm|continue|proceed|yes|ok(?:ay)?|sure)\s*[.!]?\s*$/i.test(
      normalized.toLowerCase(),
    )
  );
}

export function assignmentBlockedActionMessage(
  action: "submit_score" | "approve_score" | "approve" | "other" = "submit_score",
): string {
  if (action === "approve_score" || action === "approve") {
    return "You can't approve scores because you're not assigned to this review.";
  }
  return "You can't submit scores because you're not assigned to this review.";
}

export type ActiveSourcingConfirmation = {
  msgIndex: number;
  card: SourcingActivationCardKind;
  action: NonNullable<SourcingChatActionRequest["action"]>;
  comments?: string;
  supplierId?: string;
  supplierName?: string;
};

type ConversationLike = {
  bidApprovalReview?: { bidNumber?: string } | null;
  bidApprovalStatus?: string;
  openEnvelopeReview?: {
    bidNumber?: string;
    canOpenEnvelope?: boolean;
    openEnvelopeBlockReason?: string;
  } | null;
  openEnvelopeStatus?: string;
  technicalReview?: {
    bidNumber?: string;
    bidType?: string;
    canScore?: boolean;
    canSubmit?: boolean;
    readOnly?: boolean;
    blockReason?: string;
  } | null;
  technicalReviewStatus?: string;
  technicalEvaluation?: {
    bidNumber?: string;
    canApprove?: boolean;
    techScoreComplete?: boolean;
  } | null;
  technicalEvaluationStatus?: string;
  commercialReview?: {
    bidNumber?: string;
    bidType?: string;
    canScore?: boolean;
    canSubmit?: boolean;
    readOnly?: boolean;
    blockReason?: string;
  } | null;
  commercialReviewStatus?: string;
  commercialEvaluation?: {
    bidNumber?: string;
    canApprove?: boolean;
    commScoreComplete?: boolean;
  } | null;
  commercialEvaluationStatus?: string;
  awardingReview?: {
    bidNumber?: string;
    canAward?: boolean;
    compareBids?: { responses?: Array<{ id?: string | number; supplier_name?: string }> };
  } | null;
  awardingReviewStatus?: string;
  awardingSubmitStatus?: string;
  bidAwardSubmitReview?: { bidNumber?: string; canSubmit?: boolean } | null;
  bidAwardSubmitReviewStatus?: string;
  bidAwardApprovalReview?: {
    bidNumber?: string;
    canApprove?: boolean;
    canAcceptCommittee?: boolean;
  } | null;
  bidAwardApprovalStatus?: string;
};

function isPendingStatus(status: string | undefined, fallback = "pending"): boolean {
  return (status || fallback) === "pending";
}

/** Newest pending activation review card in the conversation. */
export function findLatestPendingActivation(
  conversation: ConversationLike[],
): PendingActivationTarget | null {
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i];

    if (msg.bidAwardApprovalReview && isPendingStatus(msg.bidAwardApprovalStatus)) {
      return {
        msgIndex: i,
        card: "bidAwardApproval",
        label: msg.bidAwardApprovalReview.bidNumber || "this award",
        bidNumber: msg.bidAwardApprovalReview.bidNumber,
        canApprove: !!msg.bidAwardApprovalReview.canApprove,
        canAcceptCommittee: !!msg.bidAwardApprovalReview.canAcceptCommittee,
      };
    }

    if (
      msg.bidAwardSubmitReview &&
      !msg.awardingReview &&
      isPendingStatus(msg.bidAwardSubmitReviewStatus) &&
      msg.bidAwardSubmitReview.canSubmit !== false
    ) {
      return {
        msgIndex: i,
        card: "bidAwardSubmit",
        label: msg.bidAwardSubmitReview.bidNumber || "this award",
        bidNumber: msg.bidAwardSubmitReview.bidNumber,
        canSubmitAward: true,
      };
    }

    if (msg.awardingReview) {
      const awardPending = isPendingStatus(msg.awardingReviewStatus);
      const submitPending = isPendingStatus(msg.awardingSubmitStatus);
      const responses = msg.awardingReview.compareBids?.responses || [];
      const suppliers = responses.map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.supplier_name || ""),
      }));

      // Prefer submit-for-approval when a draft exists and award is already done.
      if (!awardPending && submitPending) {
        return {
          msgIndex: i,
          card: "bidAwardSubmit",
          label: msg.awardingReview.bidNumber || "this award",
          bidNumber: msg.awardingReview.bidNumber,
          canSubmitAward: true,
          suppliers,
        };
      }

      if (awardPending) {
        return {
          msgIndex: i,
          card: "awarding",
          label: msg.awardingReview.bidNumber || "this bid",
          bidNumber: msg.awardingReview.bidNumber,
          canAward: msg.awardingReview.canAward !== false,
          canSubmitAward: false,
          suppliers,
        };
      }
    }

    if (msg.commercialEvaluation && isPendingStatus(msg.commercialEvaluationStatus)) {
      return {
        msgIndex: i,
        card: "commercialEvaluation",
        label: msg.commercialEvaluation.bidNumber || "this bid",
        bidNumber: msg.commercialEvaluation.bidNumber,
        canApproveScore: msg.commercialEvaluation.canApprove !== false,
      };
    }

    if (msg.commercialReview && isPendingStatus(msg.commercialReviewStatus)) {
      const review = msg.commercialReview;
      const assignmentBlocked = isAssignmentBlockReason(review.blockReason);
      const canSubmitScore =
        !assignmentBlocked &&
        review.bidType !== "RFQ" &&
        !review.readOnly &&
        review.canSubmit !== false &&
        review.canScore !== false;
      return {
        msgIndex: i,
        card: "commercialReview",
        label: review.bidNumber || "this bid",
        bidNumber: review.bidNumber,
        canSubmitScore,
        scoreBlockReason: review.blockReason,
        assignmentBlocked,
      };
    }

    if (msg.technicalEvaluation && isPendingStatus(msg.technicalEvaluationStatus)) {
      return {
        msgIndex: i,
        card: "technicalEvaluation",
        label: msg.technicalEvaluation.bidNumber || "this bid",
        bidNumber: msg.technicalEvaluation.bidNumber,
        canApproveScore: msg.technicalEvaluation.canApprove !== false,
      };
    }

    if (msg.technicalReview && isPendingStatus(msg.technicalReviewStatus)) {
      const review = msg.technicalReview;
      const assignmentBlocked = isAssignmentBlockReason(review.blockReason);
      const canSubmitScore =
        !assignmentBlocked &&
        review.bidType !== "RFQ" &&
        !review.readOnly &&
        review.canSubmit !== false &&
        review.canScore !== false;
      return {
        msgIndex: i,
        card: "technicalReview",
        label: review.bidNumber || "this bid",
        bidNumber: review.bidNumber,
        canSubmitScore,
        scoreBlockReason: review.blockReason,
        assignmentBlocked,
      };
    }

    if (msg.openEnvelopeReview && isPendingStatus(msg.openEnvelopeStatus)) {
      return {
        msgIndex: i,
        card: "openEnvelope",
        label: msg.openEnvelopeReview.bidNumber || "this bid",
        bidNumber: msg.openEnvelopeReview.bidNumber,
        canOpenEnvelope: msg.openEnvelopeReview.canOpenEnvelope !== false,
        openEnvelopeBlockReason: msg.openEnvelopeReview.openEnvelopeBlockReason,
      };
    }

    if (msg.bidApprovalReview && isPendingStatus(msg.bidApprovalStatus)) {
      return {
        msgIndex: i,
        card: "bidApproval",
        label: msg.bidApprovalReview.bidNumber || "this bid",
        bidNumber: msg.bidApprovalReview.bidNumber,
      };
    }
  }
  return null;
}

/** Short affirmative used to confirm create-bid / staged pendingAction buttons. */
export function isChatConfirmation(text: string): boolean {
  return /^\s*(?:confirm(?:ed)?|proceed|approve[d]?|yes(?:\s+please)?(?:\s+(?:approve[d]?|confirm(?:ed)?|proceed|do\s+it|continue|submit))?|yeah|yep|ok(?:ay)?|sure|go(?:\s+ahead)?|do\s+it|send(?:\s+it)?|create(?:\s+it)?|continue|submit)\s*[.!]?\s*$/i.test(
    text,
  );
}

/**
 * Publish phrasing typed instead of clicking the staged card's Publish button
 * ("publish bid", "publish it now", "go live"). Only treated as confirmation of
 * the staged action when it does not name a different bid, so "publish RFQ260099"
 * still reaches the agent as a fresh request.
 */
export function isStagedPublishConfirmation(
  text: string,
  staged: { bidLabel?: string | null; bidId?: number | null },
): boolean {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (!/\b(?:publish|go\s+live|make\s+(?:it\s+)?live)\b/i.test(raw)) return false;
  if (/\b(?:don'?t|do\s+not|never|cancel|stop|instead\s+of|before|after|without)\b/i.test(raw)) {
    return false;
  }
  if (isInfoSeeking(raw.toLowerCase())) return false;

  const namedBidNumber = raw.match(/\b(?:RFQ|RFP|TND)\d{4,}\b/i)?.[0];
  if (namedBidNumber) {
    return (
      !!staged.bidLabel &&
      namedBidNumber.toUpperCase() === String(staged.bidLabel).trim().toUpperCase()
    );
  }

  const namedBidId = raw.match(/\bbid\b[\s#:()-]*(\d{2,})\b/i)?.[1];
  if (namedBidId) {
    return staged.bidId != null && Number(namedBidId) === Number(staged.bidId);
  }

  return true;
}

function isInfoSeeking(lower: string): boolean {
  return (
    /^(?:how|what|why|when|where|who|which|list|show|find|get|search|tell\s+me|how\s+many)\b/.test(
      lower,
    ) ||
    /\b(?:how\s+(?:do|can|should)\s+i|what\s+(?:does|is)|list\s+of|show\s+me\s+all)\b/.test(lower)
  );
}

function stripFiller(text: string): string {
  return text
    .replace(
      /\b(?:this|it|them|the\s+bid|the\s+award|bid|award|for\s+me|now|please|thanks|thank\s+you|score|scores)\b/gi,
      " ",
    )
    .replace(/^[\s:–—,.\-]+|[\s:–—,.\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchSupplier(
  text: string,
  suppliers: Array<{ id: string; name: string }> | undefined,
): { id: string; name: string } | null {
  if (!suppliers?.length) return null;
  const lower = text.toLowerCase();
  const ranked = suppliers
    .filter((s) => s.name && lower.includes(s.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);
  return ranked[0] || null;
}

export type ParsedSourcingCommand = {
  action: NonNullable<SourcingChatActionRequest["action"]>;
  comments: string;
  supplierId?: string;
  supplierName?: string;
};

/**
 * Parse a free-text command against the current pending activation card.
 * Returns null when the message is not an action for that card (let the LLM handle it).
 */
export function parseSourcingActivationCommand(
  text: string,
  target: PendingActivationTarget,
): ParsedSourcingCommand | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 400) return null;
  const lower = normalized.toLowerCase();
  if (isInfoSeeking(lower)) return null;

  switch (target.card) {
    case "bidApproval": {
      if (/\b(?:reject|deny|decline|turn\s+down|do\s+not\s+approve|don'?t\s+approve)\b/i.test(normalized)) {
        return { action: "reject", comments: "" };
      }
      if (
        /\b(?:approve|confirm(?:\s+approval)?|proceed|continue|accept|go\s+ahead|green[\s-]?light|yes)\b/i.test(
          normalized,
        ) ||
        /^(?:yes|ok(?:ay)?|sure|confirm|proceed|go\s+ahead|continue)\s*[.!]?\s*$/i.test(lower)
      ) {
        return { action: "approve", comments: "" };
      }
      return null;
    }
    case "openEnvelope": {
      if (
        /\b(?:open(?:\s+the)?\s+envelope|open\s+it|unseal|continue|confirm|proceed|go\s+ahead|do\s+it|yes)\b/i.test(
          normalized,
        ) ||
        /^(?:open|continue|confirm|proceed|yes|ok(?:ay)?|sure)\s*[.!]?\s*$/i.test(lower)
      ) {
        return { action: "open", comments: "" };
      }
      return null;
    }
    case "technicalReview":
    case "commercialReview": {
      if (
        /\b(?:submit(?:\s+(?:the\s+)?(?:tech(?:nical)?|commercial|comm)?\s*scores?)?|submit\s+score|submit\s+review|send\s+scores?|confirm(?:\s+submit)?|continue|proceed)\b/i.test(
          normalized,
        ) ||
        /^(?:submit|confirm|continue|proceed|yes|ok(?:ay)?|sure)\s*[.!]?\s*$/i.test(lower)
      ) {
        return { action: "submit_score", comments: "" };
      }
      return null;
    }
    case "technicalEvaluation":
    case "commercialEvaluation": {
      if (
        /\b(?:approve(?:\s+(?:the\s+)?(?:tech(?:nical)?|commercial|comm)?\s*scores?)?|approve\s+score|confirm(?:\s+approv(?:e|al))?|continue|proceed|go\s+ahead)\b/i.test(
          normalized,
        ) ||
        /^(?:approve|confirm|continue|proceed|yes|ok(?:ay)?|sure)\s*[.!]?\s*$/i.test(lower)
      ) {
        return { action: "approve_score", comments: "" };
      }
      return null;
    }
    case "awarding": {
      if (
        /\b(?:save|submit)\s+(?:the\s+)?(?:evaluation|review|recommendations?)\b/i.test(
          normalized,
        )
      ) {
        return { action: "save_evaluation", comments: "" };
      }
      if (/\b(?:submit(?:\s+(?:for\s+)?approval)?|submit\s+award)\b/i.test(normalized)) {
        if (!target.canSubmitAward) {
          // Recognizable but premature — caller should prompt to award first.
          return { action: "submit", comments: "" };
        }
        const comments = extractNotesComments(normalized, [
          /submit(?:\s+(?:the\s+)?(?:award|draft))?(?:\s+for\s+approval)?/gi,
          /submit\s+award/gi,
        ]);
        return { action: "submit", comments };
      }
      if (
        !/\baward\b/i.test(normalized) &&
        !/^(?:confirm|continue|proceed|yes|ok(?:ay)?|sure|do\s+it)\s*[.!]?\s*$/i.test(lower)
      ) {
        return null;
      }
      const supplier = matchSupplier(normalized, target.suppliers);
      let comments = extractNotesComments(normalized, [
        /\b(?:award(?:\s+(?:the\s+)?(?:bid|it))?|select(?:\s+(?:the\s+)?(?:winning\s+)?supplier)?|choose)\b/gi,
        /\b(?:to|for)\s+[A-Za-z0-9][\w\s.&'-]{1,60}?(?=\s+(?:with|because|since|as|:)|$)/gi,
      ]);
      if (supplier) {
        comments = comments
          .replace(new RegExp(supplier.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      return {
        action: "award",
        comments,
        supplierId: supplier?.id,
        supplierName: supplier?.name,
      };
    }
    case "bidAwardSubmit": {
      if (
        /\b(?:submit(?:\s+(?:for\s+)?approval)?|submit\s+award|confirm|continue|proceed)\b/i.test(
          normalized,
        ) ||
        /^(?:submit|confirm|continue|proceed|yes|ok(?:ay)?|sure)\s*[.!]?\s*$/i.test(lower)
      ) {
        const comments = extractNotesComments(normalized, [
          /submit(?:\s+(?:the\s+)?(?:award|draft))?(?:\s+for\s+approval)?/gi,
          /submit\s+award/gi,
          /\b(?:confirm|continue|proceed|yes|ok(?:ay)?|sure)\b/gi,
        ]);
        return { action: "submit", comments };
      }
      return null;
    }
    case "bidAwardApproval": {
      if (target.canAcceptCommittee && !target.canApprove) {
        if (/\b(?:reject|deny|decline)\b/i.test(normalized)) {
          return { action: "reject", comments: "" };
        }
        if (
          /\b(?:accept|approve|confirm|continue|proceed|go\s+ahead|yes)\b/i.test(normalized) ||
          /^(?:accept|confirm|continue|proceed|yes|ok(?:ay)?|sure)\s*[.!]?\s*$/i.test(lower)
        ) {
          return { action: "accept", comments: "" };
        }
        return null;
      }
      if (/\b(?:reject|deny|decline|turn\s+down|do\s+not\s+approve|don'?t\s+approve)\b/i.test(normalized)) {
        const comments = extractApprovalComments(normalized, "reject");
        return { action: "reject", comments };
      }
      if (
        /\b(?:approve|confirm(?:\s+approval)?|proceed|continue|accept|go\s+ahead|green[\s-]?light|yes)\b/i.test(
          normalized,
        )
      ) {
        const comments = extractApprovalComments(normalized, "approve");
        return { action: "approve", comments };
      }
      return null;
    }
    default:
      return null;
  }
}

function extractNotesComments(text: string, stripPatterns: RegExp[]): string {
  let remainder = text;
  for (const pattern of stripPatterns) {
    remainder = remainder.replace(pattern, " ");
  }
  remainder = stripFiller(remainder)
    .replace(/\b(?:with\s+(?:notes?|comments?|justification)|notes?|comments?|justification)\s*[:=]?\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!remainder || /^(?:yes|ok|okay|sure|please|thanks|thank you)$/i.test(remainder)) {
    return "";
  }
  return remainder;
}

function extractApprovalComments(text: string, action: "approve" | "reject"): string {
  let remainder = text;
  if (action === "reject") {
    remainder = remainder.replace(
      /(?:please\s+)?(?:go\s+ahead\s+and\s+)?(?:reject(?:ing|ed)?|deny(?:ing)?|denie[ds]?|decline(?:d|s)?|turn(?:ing)?\s+(?:this|it)?\s*down|do\s+not\s+approve|don'?t\s+approve|not\s+approv(?:e|ed|ing)|confirm(?:ing)?\s+(?:the\s+)?rejection)/gi,
      " ",
    );
  } else {
    remainder = remainder.replace(
      /(?:please\s+)?(?:go\s+ahead\s+and\s+)?(?:approve(?:d|s|ing)?|(?:give|grant)\s+(?:it\s+)?(?:the\s+)?approval|confirm(?:ing)?\s+(?:the\s+)?approval|go\s+ahead|green[\s-]?light|proceed\s+with\s+(?:the\s+)?approv(?:e|al)|accept(?:ing|ed)?|i\s+(?:want\s+to\s+)?approve|let'?s\s+approve|ok(?:ay)?\s+to\s+approve)/gi,
      " ",
    );
  }
  remainder = stripFiller(remainder);
  if (!remainder || /^(?:yes|ok|okay|sure|please|thanks|thank you)$/i.test(remainder)) {
    return "";
  }
  return remainder;
}

/** Follow-up while a confirmation panel / notes prompt is already open. */
export function parseSourcingConfirmationFollowUp(text: string): {
  intent: "confirm" | "cancel" | "unknown";
  comments: string;
  explicitConfirmation: boolean;
} {
  const normalized = text.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();

  const isCancel =
    /^(?:no|nope|nah|cancel(?:led|ation)?|never\s*mind|nevermind|abort|stop|dismiss|go\s+back|not\s+now|forget\s+it)\s*[.!]?\s*$/i.test(
      lower,
    ) ||
    (/\b(?:cancel(?:\s+that|\s+it)?|never\s*mind|forget\s+it|don'?t\s+(?:do\s+it|proceed|confirm|submit)|abort|dismiss)\b/i.test(
      lower,
    ) &&
      !/\b(?:approve|reject|accept|award|submit|confirm\s+approv)\b/i.test(lower));

  if (isCancel) {
    return { intent: "cancel", comments: "", explicitConfirmation: false };
  }

  if (isInfoSeeking(lower)) {
    return { intent: "unknown", comments: "", explicitConfirmation: false };
  }

  const explicitConfirmation =
    /\b(?:confirm(?:ed)?|yes|yep|yeah|proceed|go\s+ahead|submit|do\s+it|ok(?:ay)?|sure|continue|approve|accept|award)\b/i.test(
      normalized,
    );

  let comments = normalized
    .replace(
      /\b(?:please\s+)?(?:add(?:\s+(?:a\s+)?(?:comment|note)s?)?|(?:comment|note)s?\s*(?:is|are|:)?|set\s+(?:comment|note)s?(?:\s+to)?|with\s+(?:comment|note)s?)\b/gi,
      " ",
    )
    .replace(
      /\b(?:and\s+)?(?:then\s+)?(?:please\s+)?(?:confirm(?:\s+it|\s+the\s+approval|\s+the\s+rejection|\s+the\s+request|\s+the\s+submit(?:ssion)?)?|yes|yep|yeah|proceed|go\s+ahead|submit|do\s+it|ok(?:ay)?|sure|continue|approve|accept|award)\b/gi,
      " ",
    )
    .replace(/^[\s:–—,.\-]+|[\s:–—,.\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !comments &&
    /^(?:yes|yep|yeah|ok(?:ay)?|sure|confirm(?:ed)?|proceed|go\s+ahead|do\s+it|submit|continue|approve|accept|award)\s*[.!]?\s*$/i.test(
      lower,
    )
  ) {
    return { intent: "confirm", comments: "", explicitConfirmation: true };
  }

  // Free-form text without an explicit confirm verb is treated as comments only
  // when comments are expected; otherwise ask for a clear confirm/cancel.
  if (!comments) comments = normalized;
  if (!explicitConfirmation && comments === normalized && !isChatConfirmation(normalized)) {
    // Likely comment body for a comments-required flow — still confirm-intent,
    // but flag so the parent can decide whether to require "confirm" next.
    return { intent: "confirm", comments, explicitConfirmation: false };
  }
  return { intent: "confirm", comments, explicitConfirmation };
}

/** In-progress ack from `sourcingActionAck` (ellipsis / "…") — replace on success. */
export function isSourcingInProgressAck(content: string): boolean {
  const t = (content || "").trim();
  if (!/(?:…|\.\.\.)$/.test(t)) return false;
  return /^(?:Approving|Rejecting|Opening|Submitting|Accepting|Awarding|Saving|Continuing)\b/i.test(
    t,
  );
}

export type SourcingActivationOutcome = {
  card: SourcingActivationCardKind;
  result:
    | "approved"
    | "rejected"
    | "submitted"
    | "opened"
    | "awarded"
    | "accepted"
    | "saved";
  label: string;
  supplierName?: string;
  comments?: string;
  notes?: string;
};

/** Final assistant message after a successful activation action. */
export function sourcingActionCompleteMessage(outcome: SourcingActivationOutcome): string {
  const name = outcome.label.startsWith("**") ? outcome.label : `**${outcome.label}**`;
  const commentNote = outcome.comments?.trim()
    ? ` Comments saved: "${outcome.comments.trim()}".`
    : "";
  const notesNote = outcome.notes?.trim()
    ? ` Award notes saved: "${outcome.notes.trim()}".`
    : "";

  switch (outcome.card) {
    case "bidApproval":
      return outcome.result === "rejected"
        ? `Bid ${name} has been rejected successfully.`
        : `Bid ${name} has been approved successfully.`;
    case "openEnvelope":
      return `The envelope for ${name} has been opened successfully.`;
    case "technicalReview":
      return `Technical scores for ${name} have been submitted successfully.`;
    case "technicalEvaluation":
      return `Technical scores for ${name} have been approved successfully.`;
    case "commercialReview":
      return `Commercial scores for ${name} have been submitted successfully.`;
    case "commercialEvaluation":
      return `Commercial scores for ${name} have been approved successfully.`;
    case "awarding":
      if (outcome.result === "saved") {
        return `Evaluation for ${name} has been saved successfully.`;
      }
      return outcome.supplierName
        ? `${name} has been awarded to **${outcome.supplierName}** successfully.${commentNote}`
        : `${name} has been awarded successfully.${commentNote}`;
    case "bidAwardSubmit":
      return `Award for ${name} has been submitted for approval successfully.${notesNote}`;
    case "bidAwardApproval":
      if (outcome.result === "rejected") {
        return `Award for ${name} has been rejected successfully.${commentNote}`;
      }
      if (outcome.result === "accepted") {
        return `Award for ${name} has been accepted successfully.`;
      }
      return `Award for ${name} has been approved successfully.${commentNote}`;
    default:
      return `Action for ${name} completed successfully.`;
  }
}

export function sourcingActionAck(
  card: SourcingActivationCardKind,
  action: NonNullable<SourcingChatActionRequest["action"]>,
  label: string,
  opts: {
    hasComments?: boolean;
    needsComments?: boolean;
    confirmationRequired?: boolean;
    supplierName?: string;
  } = {},
): string {
  const { hasComments, needsComments, confirmationRequired, supplierName } = opts;
  const name = label.startsWith("**") ? label : `**${label}**`;

  switch (action) {
    case "approve":
      if (needsComments && !hasComments) {
        return `You're about to approve ${name}. Add comments, then confirm the approval.`;
      }
      if (confirmationRequired) {
        return hasComments
          ? `Comments captured for ${name}. Type **confirm** to approve.`
          : `You're about to approve ${name}. Type **confirm** to continue.`;
      }
      return hasComments
        ? `Approving ${name} with your comments…`
        : `Approving ${name}…`;
    case "reject":
      if (needsComments && !hasComments) {
        return `You're about to reject ${name}. Add comments, then confirm the rejection.`;
      }
      if (confirmationRequired) {
        return hasComments
          ? `Comments captured for ${name}. Type **confirm** to reject.`
          : `You're about to reject ${name}. Type **confirm** to continue.`;
      }
      return hasComments
        ? `Rejecting ${name} with your comments…`
        : `Rejecting ${name}…`;
    case "accept":
      return confirmationRequired
        ? `You're about to accept the award for ${name}. Type **confirm** to continue.`
        : `Accepting award for ${name}…`;
    case "open":
      return `Opening the envelope for ${name}…`;
    case "submit_score":
      return confirmationRequired
        ? `Ready to submit scores for ${name}. Confirm to submit.`
        : `Submitting scores for ${name}…`;
    case "approve_score":
      return confirmationRequired
        ? `Ready to approve scores for ${name}. Confirm to approve.`
        : `Approving scores for ${name}…`;
    case "save_evaluation":
      return confirmationRequired
        ? `The evaluation for ${name} is ready to save. Review the recommendations, then type **confirm**.`
        : `Saving the bid evaluation for ${name}…`;
    case "award":
      if (!supplierName && !hasComments) {
        return `Open the compare panel for ${name}, select a supplier, add award comments, then confirm.`;
      }
      if (supplierName && !hasComments) {
        return `You're awarding ${name} to **${supplierName}**. Add award comments, then confirm.`;
      }
      if (!supplierName && hasComments) {
        return `Award comments noted for ${name}. Select a supplier on the card (or name them), then confirm.`;
      }
      return `Awarding ${name} to **${supplierName}**…`;
    case "submit":
      if (confirmationRequired) {
        return hasComments
          ? `Notes captured for ${name}. Type **confirm** to submit for approval.`
          : `Add award notes for ${name}, then confirm to submit for approval.`;
      }
      if (needsComments && !hasComments) {
        return `Add award notes for ${name}, then confirm to submit for approval.`;
      }
      return hasComments
        ? `Submitting award for ${name} with your notes…`
        : `Submitting award for ${name} for approval…`;
    default:
      return `Continuing with ${name}…`;
  }
}

/** Whether this action needs a start→confirm gate (panel) before API call. */
export function actionNeedsConfirmGate(
  card: SourcingActivationCardKind,
  _action: NonNullable<SourcingChatActionRequest["action"]>,
  hasRequiredInput: boolean,
): boolean {
  switch (card) {
    case "bidApproval":
    case "openEnvelope":
      return false;
    case "technicalReview":
    case "commercialReview":
    case "technicalEvaluation":
    case "commercialEvaluation":
    case "bidAwardApproval":
      return true;
    case "bidAwardSubmit":
    case "awarding":
      return !hasRequiredInput;
    default:
      return true;
  }
}

export function actionRequiresComments(
  card: SourcingActivationCardKind,
  action: NonNullable<SourcingChatActionRequest["action"]>,
  target?: PendingActivationTarget,
): boolean {
  if (card === "bidAwardSubmit" && action === "submit") return true;
  if (card === "awarding" && (action === "award" || action === "submit")) return true;
  if (card === "bidAwardApproval" && (action === "approve" || action === "reject")) {
    // Workflow path requires comments; committee path does not.
    if (target?.canApprove) return true;
    return false;
  }
  return false;
}
