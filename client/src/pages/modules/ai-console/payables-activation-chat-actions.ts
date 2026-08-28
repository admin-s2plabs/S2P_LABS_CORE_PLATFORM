/**
 * Natural-language command parsing for Payables activation review cards.
 */

export type PayablesActivationCardKind = "invoiceApproval";

export type PayablesActivationAction = "approve" | "reject" | "more" | "delegate";

export type PayablesChatActionRequest = {
  nonce: number;
  /** start = open the inline confirm panel; confirm = submit; cancel = dismiss the panel */
  kind: "start" | "confirm" | "cancel";
  card: PayablesActivationCardKind;
  action?: PayablesActivationAction;
  comments?: string;
  /** `um_user.user_name` of the delegate approver (delegate action only). */
  delegateUserName?: string;
};

export type PendingPayablesActivationTarget = {
  msgIndex: number;
  card: PayablesActivationCardKind;
  label: string;
};

export type ActivePayablesConfirmation = {
  msgIndex: number;
  card: PayablesActivationCardKind;
  action: PayablesActivationAction;
  comments?: string;
  delegateUserName?: string;
};

type ConversationLike = {
  payablesInvoiceApprovalReview?: {
    title?: string;
    invoiceNumber?: string;
    invoiceId?: string;
  } | null;
  payablesInvoiceApprovalStatus?: string;
};

function isPendingStatus(status: string | undefined, fallback = "pending"): boolean {
  return (status || fallback) === "pending";
}

export function findLatestPendingPayablesActivation(
  conversation: ConversationLike[],
): PendingPayablesActivationTarget | null {
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i];
    if (msg.payablesInvoiceApprovalReview && isPendingStatus(msg.payablesInvoiceApprovalStatus)) {
      const review = msg.payablesInvoiceApprovalReview;
      return {
        msgIndex: i,
        card: "invoiceApproval",
        label: review.invoiceNumber || review.title || review.invoiceId || "this invoice",
      };
    }
  }
  return null;
}

/** Approve remarks are optional; reject, more info and delegate all require remarks. */
export function payablesActionRequiresComments(action: PayablesActivationAction): boolean {
  return action !== "approve";
}

/** Delegation additionally requires the target approver. */
export function payablesActionRequiresDelegateUser(action: PayablesActivationAction): boolean {
  return action === "delegate";
}

function extractQuotedReason(text: string): string | undefined {
  const match =
    text.match(/["“]([^"”]+)["”]/) ||
    text.match(/\breason\s*[:\-]\s*(.+)$/i) ||
    text.match(/\bwith\s+(?:reason|comment|remarks?)\s+(.+)$/i) ||
    text.match(/\bbecause\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function extractDelegateUser(text: string): string | undefined {
  const match =
    text.match(
      /\b(?:delegate|assign|reassign|hand\s+off|handoff)\b(?:\s+(?:this|it|the\s+invoice|approval))?\s+(?:to|onto)\s+([a-z0-9._@+\- ]{2,80}?)(?:\s+(?:with|because|remarks?|comments?|reason)\b|["“]|[.,!]|$)/i,
    ) ||
    text.match(
      /\bdelegate\s+to\s+([a-z0-9._@+\- ]{2,80}?)(?:\s+(?:with|because|remarks?|comments?|reason)\b|["“]|[.,!]|$)/i,
    );
  const value = match?.[1]?.trim();
  if (!value) return undefined;
  const cleaned = value.replace(/\b(?:please|now|thanks|thank you)\b/gi, "").trim();
  return cleaned || undefined;
}

/** Minimal shape of an approver from `/api/users/dropdown`. */
export type DelegateApproverOption = {
  id: number | string;
  name?: string | null;
  user_name?: string | null;
  email_id?: string | null;
};

export type DelegateResolution =
  | { status: "matched"; userName: string; label: string }
  | { status: "ambiguous"; candidates: DelegateApproverOption[] }
  | { status: "empty" }
  | { status: "not_found" };

/** The API expects a canonical `um_user.user_name`; fall back to id only if absent. */
export function delegateApproverCanonicalName(user: DelegateApproverOption): string {
  return String(user.user_name || user.id);
}

export function delegateApproverLabel(user: DelegateApproverOption): string {
  return user.name || user.user_name || user.email_id || String(user.id);
}

/**
 * Strip conversational scaffolding ("delegate this to …", "to …", trailing
 * politeness/punctuation) so what remains is just the intended approver.
 */
function normalizeApproverQuery(text: string): string {
  return String(text || "")
    .trim()
    .replace(/^(?:please\s+)?(?:delegate|assign|reassign|hand\s*off|handoff)\b/i, "")
    .replace(/^\s*(?:this|it|the)\s+(?:invoice|approval|request|task)?\s*/i, "")
    .replace(/^\s*(?:to|onto)\s+/i, "")
    .replace(/\b(?:please|now|thanks|thank you)\b/gi, "")
    .replace(/[.,!?]+$/g, "")
    .trim();
}

/**
 * Resolve a free-text approver reference to a canonical `user_name`.
 * Tries exact user_name / email / name, then a unique case-insensitive
 * substring match across all three.
 */
export function resolveDelegateApprover(
  rawText: string,
  approvers: DelegateApproverOption[],
): DelegateResolution {
  const query = normalizeApproverQuery(rawText).toLowerCase();
  if (!query) return { status: "empty" };
  if (!Array.isArray(approvers) || approvers.length === 0) {
    return { status: "not_found" };
  }

  const matched = (user: DelegateApproverOption): DelegateResolution => ({
    status: "matched",
    userName: delegateApproverCanonicalName(user),
    label: delegateApproverLabel(user),
  });

  const exactUser = approvers.find(
    (u) => String(u.user_name || "").toLowerCase() === query,
  );
  if (exactUser) return matched(exactUser);

  const exactEmail = approvers.find(
    (u) => String(u.email_id || "").toLowerCase() === query,
  );
  if (exactEmail) return matched(exactEmail);

  const exactName = approvers.find((u) => String(u.name || "").toLowerCase() === query);
  if (exactName) return matched(exactName);

  const partial = approvers.filter((u) =>
    [u.user_name, u.name, u.email_id]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(query)),
  );
  if (partial.length === 1) return matched(partial[0]);
  if (partial.length > 1) {
    return { status: "ambiguous", candidates: partial.slice(0, 6) };
  }
  return { status: "not_found" };
}

export function parsePayablesActivationCommand(
  text: string,
  target: PendingPayablesActivationTarget,
): { action: PayablesActivationAction; comments?: string; delegateUserName?: string } | null {
  const normalized = String(text || "").trim();
  if (!normalized || normalized.length > 500) return null;

  const comments = extractQuotedReason(normalized);

  if (/\b(delegate|reassign|hand\s*off|handoff)\b/i.test(normalized)) {
    return {
      action: "delegate",
      comments,
      delegateUserName: extractDelegateUser(normalized),
    };
  }
  if (/\b(more\s+info|request\s+more|need\s+more)\b/i.test(normalized)) {
    return { action: "more", comments };
  }
  if (/\b(reject|deny|decline)\b/i.test(normalized)) {
    return { action: "reject", comments };
  }
  if (/\b(approve|accept|sign\s*off)\b/i.test(normalized)) {
    return { action: "approve", comments };
  }
  if (/^(yes|ok(?:ay)?|confirm|proceed|go\s+ahead)\s*[.!]?\s*$/i.test(normalized) && target) {
    return null;
  }
  return null;
}

export function parsePayablesConfirmationFollowUp(text: string): "confirm" | "cancel" | null {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return null;
  if (/^(cancel|no|never\s*mind|stop|abort)\s*[.!]?\s*$/i.test(normalized)) return "cancel";
  if (/^(yes|y|ok(?:ay)?|confirm|proceed|go\s+ahead|do\s+it)\s*[.!]?\s*$/i.test(normalized)) {
    return "confirm";
  }
  return null;
}

function actionVerb(action: PayablesActivationAction): string {
  if (action === "approve") return "approve";
  if (action === "reject") return "reject";
  if (action === "more") return "request more information on";
  return "delegate";
}

export function payablesActionAck(
  action: PayablesActivationAction,
  label: string,
  needsConfirm: boolean,
  needsComments: boolean,
  needsDelegateUser = false,
): string {
  const verb = actionVerb(action);
  if (needsDelegateUser) {
    return `Who should I delegate **${label}** to? Reply with the approver's name or email.`;
  }
  if (needsComments) {
    return `Please provide comments/remarks to ${verb} **${label}**.`;
  }
  if (needsConfirm) {
    return `Ready to ${verb} **${label}**. Reply **yes** to confirm or **cancel** to abort.`;
  }
  return `Working on that for **${label}**…`;
}

export function payablesActionCompleteMessage(
  action: PayablesActivationAction,
  label: string,
): string {
  if (action === "approve") return `Approved **${label}**.`;
  if (action === "reject") return `Rejected **${label}**.`;
  if (action === "more") return `Requested more information for **${label}**.`;
  return `Delegated the approval for **${label}**.`;
}

export function isShowPayablesActivationStageIntent(text: string): {
  stage?: "invoiceApprovalRequest" | "all";
} | null {
  const t = String(text || "").trim();
  if (!t) return null;
  if (/\b(show|open|list|get)\b.*\binvoice\s+approvals?\b/i.test(t)) {
    return { stage: "invoiceApprovalRequest" };
  }
  if (/\b(open|show)\b.*\bpending\s+invoices?\b/i.test(t)) return { stage: "all" };
  if (/\bcomplete\s+this\s+(?:task|approval)\b/i.test(t)) return { stage: "all" };
  return null;
}
