/**
 * Natural-language command parsing for Procurement Ops activation review cards.
 */

import { ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS } from "@shared/procurement-activation-signals";

export type ProcurementActivationCardKind =
  | "budgetApproval"
  | "prApproval"
  | "poApproval"
  | "procurementAlert";

export type ProcurementChatActionRequest = {
  nonce: number;
  kind: "start" | "confirm" | "cancel";
  card: ProcurementActivationCardKind;
  action?: "approve" | "reject" | "more" | "resubmit";
  comments?: string;
};

export type PendingProcurementActivationTarget = {
  msgIndex: number;
  card: ProcurementActivationCardKind;
  label: string;
};

export type ActiveProcurementConfirmation = {
  msgIndex: number;
  card: ProcurementActivationCardKind;
  action: NonNullable<ProcurementChatActionRequest["action"]>;
  comments?: string;
};

type ConversationLike = {
  budgetApprovalReview?: { title?: string; budgetId?: string } | null;
  budgetApprovalStatus?: string;
  prApprovalReview?: { title?: string; prNumber?: string } | null;
  prApprovalStatus?: string;
  poApprovalReview?: { title?: string; poNumber?: string } | null;
  poApprovalStatus?: string;
  procurementAlertReview?: { title?: string } | null;
  procurementAlertStatus?: string;
};

function isPendingStatus(status: string | undefined, fallback = "pending"): boolean {
  return (status || fallback) === "pending";
}

export function findLatestPendingProcurementActivation(
  conversation: ConversationLike[],
): PendingProcurementActivationTarget | null {
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i];
    if (msg.poApprovalReview && isPendingStatus(msg.poApprovalStatus)) {
      return {
        msgIndex: i,
        card: "poApproval",
        label: msg.poApprovalReview.title || msg.poApprovalReview.poNumber || "this PO",
      };
    }
    if (msg.prApprovalReview && isPendingStatus(msg.prApprovalStatus)) {
      return {
        msgIndex: i,
        card: "prApproval",
        label: msg.prApprovalReview.title || msg.prApprovalReview.prNumber || "this PR",
      };
    }
    if (msg.budgetApprovalReview && isPendingStatus(msg.budgetApprovalStatus)) {
      return {
        msgIndex: i,
        card: "budgetApproval",
        label: msg.budgetApprovalReview.title || msg.budgetApprovalReview.budgetId || "this budget",
      };
    }
    if (
      ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS &&
      msg.procurementAlertReview &&
      isPendingStatus(msg.procurementAlertStatus)
    ) {
      return {
        msgIndex: i,
        card: "procurementAlert",
        label: msg.procurementAlertReview.title || "this alert",
      };
    }
  }
  return null;
}

export function isProcurementActivationCardPending(
  msg: ConversationLike | undefined,
  card: ProcurementActivationCardKind,
): boolean {
  if (!msg) return false;
  if (card === "budgetApproval") {
    return !!msg.budgetApprovalReview && isPendingStatus(msg.budgetApprovalStatus);
  }
  if (card === "prApproval") {
    return !!msg.prApprovalReview && isPendingStatus(msg.prApprovalStatus);
  }
  if (card === "poApproval") {
    return !!msg.poApprovalReview && isPendingStatus(msg.poApprovalStatus);
  }
  return !!msg.procurementAlertReview && isPendingStatus(msg.procurementAlertStatus);
}

export function actionRequiresComments(
  card: ProcurementActivationCardKind,
  action: NonNullable<ProcurementChatActionRequest["action"]>,
): boolean {
  if (card === "budgetApproval") return true;
  if (action === "reject" || action === "more") return true;
  return false;
}

function extractQuotedReason(text: string): string | undefined {
  const match =
    text.match(/["“]([^"”]+)["”]/) ||
    text.match(/\breason\s*[:\-]\s*(.+)$/i) ||
    text.match(/\bwith\s+(?:reason|comment|remarks?)\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export function parseProcurementActivationCommand(
  text: string,
  target: PendingProcurementActivationTarget,
): { action: NonNullable<ProcurementChatActionRequest["action"]>; comments?: string } | null {
  const normalized = String(text || "").trim();
  if (!normalized || normalized.length > 500) return null;

  const comments = extractQuotedReason(normalized);

  if (/\b(re-?submit|resubmit)\b/i.test(normalized)) {
    return { action: "resubmit", comments };
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

export function parseProcurementConfirmationFollowUp(
  text: string,
): "confirm" | "cancel" | null {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return null;
  if (/^(cancel|no|never\s*mind|stop|abort)\s*[.!]?\s*$/i.test(normalized)) return "cancel";
  if (/^(yes|y|ok(?:ay)?|confirm|proceed|go\s+ahead|do\s+it)\s*[.!]?\s*$/i.test(normalized)) {
    return "confirm";
  }
  return null;
}

export function procurementActionAck(
  action: NonNullable<ProcurementChatActionRequest["action"]>,
  label: string,
  needsConfirm: boolean,
  needsComments: boolean,
): string {
  const verb =
    action === "approve"
      ? "approve"
      : action === "reject"
        ? "reject"
        : action === "more"
          ? "request more information on"
          : "re-submit";
  if (needsComments) {
    return `Please provide comments/remarks to ${verb} **${label}**.`;
  }
  if (needsConfirm) {
    return `Ready to ${verb} **${label}**. Reply **yes** to confirm or **cancel** to abort.`;
  }
  return `Working on that for **${label}**…`;
}

export function procurementActionCompleteMessage(
  action: NonNullable<ProcurementChatActionRequest["action"]>,
  label: string,
): string {
  if (action === "approve") return `Approved **${label}**.`;
  if (action === "reject") return `Rejected **${label}**.`;
  if (action === "more") return `Requested more information for **${label}**.`;
  return `Re-submitted **${label}**.`;
}

export function isShowActivationStageIntent(text: string): {
  stage?: "budgetApproval" | "prApproval" | "poApproval" | "requested" | "alerts" | "all";
} | null {
  const t = String(text || "").trim();
  if (!t) return null;
  if (/\b(show|open|list|get)\b.*\bbudget\s+approval\b/i.test(t)) return { stage: "budgetApproval" };
  if (/\b(show|open|list|get)\b.*\bpr\s+approval\b/i.test(t)) return { stage: "prApproval" };
  if (/\b(show|open|list|get)\b.*\bpo\s+approval\b/i.test(t)) return { stage: "poApproval" };
  if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && /\b(show|open|list|get)\b.*\brequested\b/i.test(t)) {
    return { stage: "requested" };
  }
  if (ENABLE_PROCUREMENT_ALERTS_AND_REQUESTS && /\b(show|open|list|get)\b.*\balerts?\b/i.test(t)) {
    return { stage: "alerts" };
  }
  if (/\b(open|show)\b.*\bpending\s+(pr|po|budget)\b/i.test(t)) return { stage: "all" };
  if (/\bcomplete\s+this\s+task\b/i.test(t)) return { stage: "all" };
  return null;
}
