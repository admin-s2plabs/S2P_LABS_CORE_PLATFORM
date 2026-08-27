import type {
  BidAwardApprovalCommitteeMember,
  BidAwardApprovalHistoryStep,
  BidAwardApprovalReviewSpec,
} from "@shared/sourcing-bid-award-approval-review";
import type { SourcingActivationStageItem } from "@shared/sourcing-activation-signals";
import { formatDateTimeDisplay } from "@shared/publish-bid-dates";
import * as bidService from "../modules/bids/bids.service";
import * as bidRepo from "../modules/bids/bids.repository";
import * as commonRepo from "../modules/common/common.repository";

function formatDisplayDateTime(value: unknown): string {
  if (!value) return "-";
  return formatDateTimeDisplay(value as string | Date);
}

/** Raw ISO for client-side local formatting (matches bid award page timezone). */
function serializeDateTime(value: unknown): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatDisplayCurrency(amount: unknown, currency: string): string {
  const num = Number(amount);
  if (!Number.isFinite(num)) return "-";
  try {
    const locale = currency === "INR" ? "en-IN" : currency === "AED" ? "ar-AE" : "en-US";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency || ""} ${num.toLocaleString()}`;
  }
}

function collectSessionUserIdentifiers(sessionUser: any, userDetails?: any): string[] {
  const identifiers = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value || "").trim();
    if (text) identifiers.add(text.toLowerCase());
  };

  add(sessionUser?.id);
  add(sessionUser?.userId);
  add(sessionUser?.email);
  add(sessionUser?.email_id);
  add(sessionUser?.userName);
  add(sessionUser?.userNameId);
  add(sessionUser?.user_name);
  add(sessionUser?.username);
  add(sessionUser?.name);

  if (userDetails) {
    add(userDetails.user_name);
    add(userDetails.email_id);
    add(userDetails.id);
  }

  return Array.from(identifiers);
}

function isSyntheticActivationTaskId(taskId: string): boolean {
  return taskId.startsWith("bid_task_");
}

function isTenderAwardAcceptTask(item: SourcingActivationStageItem): boolean {
  return String(item.title || item.taskId || "").toLowerCase().includes("tender award accept");
}

function matchesApproverEntry(entry: string, userIdentifiers: string[], roleNames: string[]): boolean {
  const normalized = String(entry || "").trim();
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (userIdentifiers.includes(lower)) return true;
  return roleNames.some((role) => role.toLowerCase() === lower);
}

function findCommitteeMember(
  committeeApprovers: any[],
  userIdentifiers: string[],
): any | null {
  return (
    committeeApprovers.find((member) => {
      const userName = String(member.user_name || "").trim().toLowerCase();
      const email = String(member.email_id || "").trim().toLowerCase();
      return (
        (userName && userIdentifiers.includes(userName)) ||
        (email && userIdentifiers.includes(email))
      );
    }) || null
  );
}

function canUserApproveAward(
  award: any,
  userIdentifiers: string[],
  roleNames: string[],
  activationTaskId?: string,
): boolean {
  if (String(award?.status || "") !== "Pending Approval" || !award?.attribute_12) return false;

  const workflowTaskId = String(award.attribute_12);
  const itemTaskId = String(activationTaskId || "");
  if (
    itemTaskId &&
    !isSyntheticActivationTaskId(itemTaskId) &&
    itemTaskId !== workflowTaskId
  ) {
    return false;
  }

  const approversList = String(award.approvers_list || award.approversList || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  return approversList.some((approver) => matchesApproverEntry(approver, userIdentifiers, roleNames));
}

function canUserAcceptCommittee(
  award: any,
  committeeApprovers: any[],
  userIdentifiers: string[],
  bidStatus: string,
  item: SourcingActivationStageItem,
): boolean {
  const member = findCommitteeMember(committeeApprovers, userIdentifiers);
  if (!member || member.bidaccepted === "Y" || member.bidaccepted === "R") return false;

  if (isTenderAwardAcceptTask(item)) return true;
  if (String(bidStatus) === "Award Under Process") return true;
  if (String(award?.status || "") === "Review Committee") return true;
  return false;
}

function buildApprovalHistory(award: any, historySteps: any[]): BidAwardApprovalHistoryStep[] {
  const approversList = String(award.approvers_list || award.approversList || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  if (approversList.length > 0) {
    return approversList.map((approver: string, idx: number) => {
      const step = historySteps.find((s) => Number(s.step_order) === idx + 1);
      if (step && step.status === "Completed") {
        return {
          name: String(step.action_by || approver),
          status:
            step.result === "Approve"
              ? "Approved"
              : step.result === "Reject"
                ? "Rejected"
                : "Pending",
          date: step.action_date ? formatDisplayDateTime(step.action_date) : undefined,
          comments: step.remarks ? String(step.remarks) : undefined,
        };
      }
      const readyStep = historySteps.find(
        (s) => Number(s.step_order) === idx + 1 && s.status === "Ready",
      );
      return {
        name: String(readyStep?.current_assignee || approver),
        status: "Pending",
      };
    });
  }

  return historySteps.map((step) => ({
    name: String(step.action_by || step.current_assignee || "Approver"),
    status:
      step.status === "Completed"
        ? step.result === "Approve"
          ? "Approved"
          : step.result === "Reject"
            ? "Rejected"
            : "Pending"
        : "Pending",
    date: step.action_date ? formatDisplayDateTime(step.action_date) : undefined,
    comments: step.remarks ? String(step.remarks) : undefined,
  }));
}

function mapCommitteeMembers(committeeApprovers: any[]): BidAwardApprovalCommitteeMember[] {
  return committeeApprovers.map((member) => {
    const accepted = member.bidaccepted === "Y";
    const rejected = member.bidaccepted === "R";
    const userName = String(member.user_name || "").trim();
    const emailId = String(member.email_id || "").trim();
    const displayName = String(member.name || "").trim();

    let name = displayName;
    let email = emailId;
    if (!name && userName && !userName.includes("@")) {
      name = userName;
    }
    if (!email && userName.includes("@")) {
      email = userName;
    }
    if (!name) {
      name = email || userName || "-";
    }

    return {
      name,
      email,
      role: member.is_head === "Y" ? "Head" : "Member",
      status: accepted ? "Accepted" : rejected ? "Rejected" : "Pending",
    };
  });
}

const AWARD_APPROVAL_STATUSES = new Set([
  "Review Committee",
  "Pending Approval",
  "Pending",
]);

async function resolveAwardContext(
  item: SourcingActivationStageItem,
): Promise<{ awardId: number; bidId: number; awardRecord: any } | null> {
  const parsedAwardId = parseInt(String(item.awardId || "").trim(), 10);
  if (Number.isFinite(parsedAwardId) && parsedAwardId > 0) {
    const awardRecord = await bidRepo.getAwardById(parsedAwardId);
    if (!awardRecord) return null;
    const bidId = Number((awardRecord as any).bidrefno);
    if (!Number.isFinite(bidId) || bidId <= 0) return null;
    return { awardId: parsedAwardId, bidId, awardRecord };
  }

  const parsedBidId = parseInt(String(item.bidId || "").trim(), 10);
  if (!Number.isFinite(parsedBidId) || parsedBidId <= 0) return null;

  const awards = await bidRepo.getAwardsWithLinesByBidRefNo(parsedBidId);
  if (!Array.isArray(awards) || awards.length === 0) return null;

  const activeAward =
    (awards as any[]).find((entry) => AWARD_APPROVAL_STATUSES.has(String(entry.status || ""))) ||
    (awards as any[]).find((entry) => String(entry.status || "") !== "Cancelled") ||
    awards[0];

  if (!activeAward) return null;

  const awardId = Number(activeAward.id);
  if (!Number.isFinite(awardId) || awardId <= 0) return null;

  const awardRecord = (await bidRepo.getAwardById(awardId)) || activeAward;
  return { awardId, bidId: parsedBidId, awardRecord };
}

export async function buildBidAwardApprovalReviewSpec(
  item: SourcingActivationStageItem,
  sessionUser?: any,
): Promise<BidAwardApprovalReviewSpec | null> {
  const resolved = await resolveAwardContext(item);
  if (!resolved) return null;

  const { awardId, bidId, awardRecord } = resolved;

  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);
  const [bid, awards, committeeApprovers, approvalHistory, userDetails, userRoles] =
    await Promise.all([
      bidService.getDboBidDetail(bidId),
      bidRepo.getAwardsWithLinesByBidRefNo(bidId),
      bidRepo.getCommitteeApprovers(bidId),
      bidRepo.getAwardApprovalHistory(awardId),
      userId ? commonRepo.getUserDetails(String(userId)).catch(() => null) : Promise.resolve(null),
      userId ? commonRepo.getUserRoleNames(userId).catch(() => [] as string[]) : Promise.resolve([]),
    ]);

  if (!bid) return null;

  const award = (awards as any[]).find((entry) => Number(entry.id) === awardId) || awardRecord;
  const bidAny = bid as any;
  const currency = String(bidAny.currency || "INR");
  const bidNumber = String(bidAny.bid_number || bidAny.attribute_4 || bidId);
  const workflowTaskId = String(award.attribute_12 || "");
  const activationTaskId = String(item.taskId || "");
  const taskId = workflowTaskId || activationTaskId;
  const userIdentifiers = collectSessionUserIdentifiers(sessionUser, userDetails);
  const roleNames = [
    ...userRoles,
    ...(Array.isArray(sessionUser?.roles) ? sessionUser.roles : []),
    sessionUser?.userRole,
    sessionUser?.role,
  ]
    .map((role) => String(role || "").trim())
    .filter(Boolean);
  const committeeList = Array.isArray(committeeApprovers) ? committeeApprovers : [];
  const canApprove = canUserApproveAward(award, userIdentifiers, roleNames, activationTaskId);
  const canAcceptCommittee = canUserAcceptCommittee(
    award,
    committeeList,
    userIdentifiers,
    String(bidAny.status || ""),
    item,
  );

  const lines = Array.isArray(award.lines) ? award.lines : [];
  const historySteps = Array.isArray(approvalHistory) ? approvalHistory : [];

  return {
    bidId,
    bidNumber,
    bidTitle: String(bidAny.bid_title || item.title || bidNumber),
    bidType: String(bidAny.type || "RFQ"),
    bidStatus: String(bidAny.status || "-"),
    startDate: serializeDateTime(bidAny.startdate),
    endDate: serializeDateTime(bidAny.enddate),
    currency,
    paymentTerms: String(bidAny.paymentterms || "-"),
    deliveryLocation: String(bidAny.delivertto_location_name || bidAny.shiptoaddress || "-"),
    linkedPr: bidAny.pr_number ? String(bidAny.pr_number) : undefined,
    buyerName: String(bidAny.buyer_name || bidAny.buyer || "-"),
    buyerEmail: String(bidAny.buyer_email || ""),
    requestorName: String(bidAny.requestor_name || "-"),
    requestorEmail: String(bidAny.requestor_email || ""),
    departmentName: String(bidAny.department_name || "-"),
    responsesCount: Number(bidAny.bid_responses) || 0,
    invitedCount: Number(bidAny.no_invited_supps) || 0,
    awardId,
    awardStatus: String(award.status || "Draft"),
    supplierName: String(award.supplier_name || "-"),
    supplierContact: String(award.supplier_contact || ""),
    supplierPhone: String(award.supplier_contact_no || ""),
    grossTotal: formatDisplayCurrency(award.bidtotal, currency),
    discount: formatDisplayCurrency(award.biddisc, currency),
    taxAmount: formatDisplayCurrency(award.tax_amount, currency),
    netTotal: formatDisplayCurrency(award.grosstotal, currency),
    amountInWords: String(award.amount_in_words || ""),
    awardNotes: String(award.notes || award.award_comments || ""),
    lines: lines.map((line: any) => ({
      item: String(line.description || "-"),
      category: String(line.product_category || "-"),
      bidQty: String(line.quantity ?? "-"),
      awardedQty: String(line.awarded_quantity ?? line.quantity ?? "-"),
      unitPrice: formatDisplayCurrency(line.bidprice, line.currency || currency),
      discPrice: formatDisplayCurrency(line.discprice, line.currency || currency),
      tax: String(line.rate ?? 0),
    })),
    approvalHistory: buildApprovalHistory(award, historySteps),
    committeeMembers: mapCommitteeMembers(committeeList),
    taskId,
    taskTitle: String(item.title || "Bid Award Approval"),
    canApprove,
    canAcceptCommittee,
  };
}

export function buildBidAwardApprovalReviewMessage(spec: BidAwardApprovalReviewSpec): string {
  const actionHint = spec.canApprove
    ? "Review the bid and award details below, then **Approve** or **Reject** the award."
    : spec.canAcceptCommittee
      ? "Review the bid and award details below, then **Accept** or **Reject** as a committee member."
      : "Review the bid and award details below.";

  return [
    `## Bid Award Approval — ${spec.bidNumber}`,
    `**${spec.bidTitle}**`,
    "",
    `Award #${spec.awardId} to **${spec.supplierName}** (${spec.netTotal}).`,
    actionHint,
  ].join("\n");
}
