import type {
  OpenEnvelopeReviewSpec,
  OpenEnvelopeReviewTeamMember,
  OpenEnvelopeTeamRole,
} from "@shared/sourcing-open-envelope-review";
import type { SourcingActivationStageItem } from "@shared/sourcing-activation-signals";
import { formatDateTimeDisplay } from "@shared/publish-bid-dates";
import * as bidService from "../modules/bids/bids.service";
import * as commonRepo from "../modules/common/common.repository";
import { db } from "../db";
import { sql } from "drizzle-orm";

function formatDisplayDateTime(value: unknown): string {
  if (!value) return "-";
  return formatDateTimeDisplay(value as string | Date);
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

function computeTimeLeft(endDate: unknown): string {
  if (!endDate) return "-";
  const end = new Date(String(endDate)).getTime();
  if (Number.isNaN(end)) return "-";
  const diff = end - Date.now();
  if (diff <= 0) return "Bid Closed";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function resolveNumericBidId(bidRef: string | undefined): Promise<number | null> {
  const raw = String(bidRef || "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  const numStr = raw.toUpperCase();
  const result = await db.execute(
    sql`SELECT id FROM dbo.supp_bid_dtls WHERE UPPER(attribute_4) = ${numStr} LIMIT 1`,
  );
  if (result.rows.length > 0) return Number(result.rows[0].id);
  return null;
}

const TEAM_ROLE_MAP: Record<string, OpenEnvelopeTeamRole> = {
  "Technical Review Team": "Tech Review",
  "Technical Approve Team": "Tech Approve",
  "Commercial Review Team": "Comm Review",
  "Commercial Approve Team": "Comm Approve",
};

function mapApproverStatus(approver: any, isCommittee: boolean): string {
  if (isCommittee) {
    return approver.logged_id === "Y" ? "Opened Envelope" : "Pending Opening";
  }
  return approver.score_submitted === "Y" ? "Scored" : "Pending";
}

function buildEvaluationTeam(approvers: any[], bidType: string): OpenEnvelopeReviewTeamMember[] {
  const members: OpenEnvelopeReviewTeamMember[] = [];
  const committee = approvers.filter((a) =>
    String(a.teamtype || "").toLowerCase().includes("committee"),
  );
  for (const m of committee) {
    members.push({
      name: String(m.user_name || m.login_id || "-"),
      role: "Committee",
      status: mapApproverStatus(m, true),
    });
  }

  const orderedTeams =
    bidType === "RFP"
      ? ["Technical Review Team", "Commercial Review Team"]
      : [
          "Technical Review Team",
          "Technical Approve Team",
          "Commercial Review Team",
          "Commercial Approve Team",
        ];

  for (const teamType of orderedTeams) {
    const role = TEAM_ROLE_MAP[teamType];
    if (!role) continue;
    const teamMembers = approvers.filter((a) => a.teamtype === teamType);
    for (const m of teamMembers) {
      members.push({
        name: String(m.user_name || m.login_id || "-"),
        role,
        status: mapApproverStatus(m, false),
      });
    }
  }

  return members;
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
  add(sessionUser?.user_name);
  add(sessionUser?.name);

  if (userDetails) {
    add(userDetails.user_name);
    add(userDetails.email_id);
    add(userDetails.id);
  }

  return Array.from(identifiers);
}

function userMatchesApprover(sessionUser: any, approver: any, userIdentifiers: string[]): boolean {
  if (!sessionUser) return false;

  const mIdStr = String(approver.user_id || "").trim();
  const sessionIds = [
    String(sessionUser.id || "").trim(),
    String(sessionUser.userId || "").trim(),
  ].filter(Boolean);

  if (mIdStr && sessionIds.some((id) => id === mIdStr)) {
    return true;
  }

  const approverKeys = [
    String(approver.login_id || "").trim().toLowerCase(),
    String(approver.user_email || "").trim().toLowerCase(),
    String(approver.user_name || "").trim().toLowerCase(),
  ].filter(Boolean);

  return approverKeys.some((key) => userIdentifiers.includes(key));
}

function isSuperAdminRole(sessionUser: any, userRoles: string[]): boolean {
  const role = String(sessionUser?.userRole || sessionUser?.role || "").toLowerCase();
  return (
    userRoles.includes("SUPERADMIN") ||
    userRoles.includes("ROLE_SUPERADMIN") ||
    role === "superadmin"
  );
}

function resolveOpenEnvelopeEligibility(params: {
  bid: any;
  bidType: string;
  committeeMembers: any[];
  sessionUser?: any;
  userIdentifiers: string[];
  isSuperAdmin: boolean;
}): { canOpenEnvelope: boolean; openEnvelopeBlockReason?: string; myCommitteeApprover?: any } {
  const { bid, bidType, committeeMembers, sessionUser, userIdentifiers, isSuperAdmin } = params;

  if (!sessionUser) {
    return { canOpenEnvelope: false, openEnvelopeBlockReason: "Sign in again to open the envelope from here." };
  }
  if (bidType !== "TENDER") {
    return { canOpenEnvelope: false, openEnvelopeBlockReason: "Envelope opening applies only to Tender bids." };
  }
  if (bid.status !== "Closed") {
    return {
      canOpenEnvelope: false,
      openEnvelopeBlockReason: "The bid must be Closed before the envelope can be opened.",
    };
  }
  if (bid.env_opened === "Y") {
    return { canOpenEnvelope: false, openEnvelopeBlockReason: "This envelope has already been opened." };
  }
  if (bid.bid_style !== "Sealed") {
    return {
      canOpenEnvelope: false,
      openEnvelopeBlockReason: "Open-style tenders auto-open on the envelope date; no manual action is required.",
    };
  }

  const envOpenDate = bid.env_open_date ? new Date(String(bid.env_open_date)) : null;
  const envDatePassed = envOpenDate ? envOpenDate.getTime() <= Date.now() : false;
  if (!envDatePassed) {
    return {
      canOpenEnvelope: false,
      openEnvelopeBlockReason: "The envelope open date has not been reached yet.",
    };
  }

  if (committeeMembers.length === 0) {
    return {
      canOpenEnvelope: false,
      openEnvelopeBlockReason: "No committee members are assigned to this tender.",
    };
  }

  const myCommitteeApprover = committeeMembers.find((m: any) =>
    userMatchesApprover(sessionUser, m, userIdentifiers),
  );

  if (myCommitteeApprover?.logged_id === "Y") {
    return {
      canOpenEnvelope: false,
      openEnvelopeBlockReason: "You have already recorded your envelope opening for this bid.",
      myCommitteeApprover,
    };
  }

  if (myCommitteeApprover && myCommitteeApprover.logged_id !== "Y") {
    return { canOpenEnvelope: true, myCommitteeApprover };
  }

  return {
    canOpenEnvelope: false,
    openEnvelopeBlockReason: isSuperAdmin
      ? "View only — assigned Committee Team members must record their envelope opening."
      : "Only assigned Committee Team members can open this envelope. Confirm you are logged in as a committee member for this bid.",
  };
}

export async function buildOpenEnvelopeReviewSpec(
  item: SourcingActivationStageItem,
  sessionUser?: any,
): Promise<OpenEnvelopeReviewSpec | null> {
  const bidId = await resolveNumericBidId(item.bidId);
  if (!bidId) return null;

  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);
  const [detail, approvers, evalData, userDetails, userRoles] = await Promise.all([
    bidService.getDboBidDetail(bidId),
    bidService.getDboBidApprovers(bidId),
    bidService.getBidEvaluationData(bidId),
    userId ? commonRepo.getUserDetails(String(userId)).catch(() => null) : Promise.resolve(null),
    userId ? commonRepo.getUserRoleNames(userId).catch(() => [] as string[]) : Promise.resolve([]),
  ]);

  if (!detail) return null;

  const bid = detail as any;
  const bidType = String(bid.type || "Tender").toUpperCase();
  const currency = String(bid.currency || "INR");
  const bidNumber = String(bid.bid_number || bid.attribute_4 || bidId);
  const responses = Array.isArray(evalData?.responses) ? evalData.responses : [];
  const approverList = Array.isArray(approvers) ? approvers : [];

  const committeeMembers = approverList.filter((a: any) =>
    String(a.teamtype || "").toLowerCase().includes("committee"),
  );
  const committeeOpenedCount = committeeMembers.filter((m: any) => m.logged_id === "Y").length;
  const envelopeOpened = bid.env_opened === "Y";

  const userIdentifiers = collectSessionUserIdentifiers(sessionUser, userDetails);
  const { canOpenEnvelope, openEnvelopeBlockReason } = resolveOpenEnvelopeEligibility({
    bid,
    bidType,
    committeeMembers,
    sessionUser,
    userIdentifiers,
    isSuperAdmin: isSuperAdminRole(sessionUser, userRoles),
  });

  return {
    bidId,
    bidNumber,
    bidTitle: String(bid.bid_title || item.title || bidNumber),
    bidType,
    status: String(bid.status || "-"),
    bidStyle: String(bid.bid_style || "-"),
    startDate: formatDisplayDateTime(bid.startdate),
    endDate: formatDisplayDateTime(bid.enddate),
    envelopeOpenDate: formatDisplayDateTime(bid.env_open_date),
    currency,
    paymentTerms: String(bid.paymentterms || "-"),
    buyerName: String(bid.buyer_name || bid.buyer || "-"),
    buyerEmail: String(bid.buyer_email || ""),
    requestorName: String(bid.requestor_name || "-"),
    requestorEmail: String(bid.requestor_email || ""),
    departmentName: String(bid.department_name || "-"),
    responsesCount: responses.length,
    invitedCount: Number(bid.no_invited_supps) || 0,
    evaluationTeam: buildEvaluationTeam(approverList, bidType),
    responses: responses.map((r: any) => ({
      supplierName: String(r.supplier_name || "Unknown"),
      supplierContact: String(r.supplier_contact || "-"),
      supplierPhone: String(r.supplier_contact_no || ""),
      responseNumber: String(r.id || "-"),
      bidTotal: formatDisplayCurrency(r.grosstotal, currency),
      techScore: bidType === "RFQ" ? "-" : String(r.total_score ?? "NA"),
      commScore: bidType === "RFQ" ? "-" : String(r.finscore ?? "NA"),
      totalScore: bidType === "RFQ" ? "-" : String(r.total_tech_and_fin_score ?? 0),
      version: String(r.version ?? 0),
      responseStatus: String(r.status || "-"),
      timeLeft: computeTimeLeft(bid.enddate),
    })),
    canOpenEnvelope,
    openEnvelopeBlockReason,
    committeeOpenedCount,
    committeeRequiredCount: 3,
    envelopeOpened,
    taskTitle: String(item.title || "Open Envelope"),
  };
}

export function buildOpenEnvelopeReviewMessage(spec: OpenEnvelopeReviewSpec): string {
  return [
    `## Envelope Opening Review — ${spec.bidNumber}`,
    `**${spec.bidTitle}**`,
    "",
    "Review the bid details below. If you are an assigned Committee Team member, open the envelope when ready.",
  ].join("\n");
}
