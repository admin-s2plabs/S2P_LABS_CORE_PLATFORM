import type { AgentCompareBidsSpec } from "@shared/agent-compare-bids";
import type { AwardingReviewSpec } from "@shared/sourcing-awarding-review";
import { canPerformBidAwardActions } from "@shared/bid-award-auth";
import type { OpenEnvelopeReviewTeamMember } from "@shared/sourcing-open-envelope-review";
import type { SourcingActivationStageItem } from "@shared/sourcing-activation-signals";
import { formatDateTimeDisplay } from "@shared/publish-bid-dates";
import * as bidService from "../modules/bids/bids.service";
import * as bidRepo from "../modules/bids/bids.repository";
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

const TEAM_ROLE_MAP: Record<string, OpenEnvelopeReviewTeamMember["role"]> = {
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

function deriveCompareBidStep(bid: any): string {
  const bidType = String(bid?.type || "RFQ");
  const status = String(bid?.status || "");
  const isTender = bidType === "Tender";
  const isRFP = bidType === "RFP";
  const isRFQ = bidType === "RFQ";
  const isHighValue = parseFloat(String(bid?.attribute_10 || "0")) >= 500000;
  const hasTenderSteps = isTender || isHighValue;

  if (status === "Cancelled") return "";
  if (status === "Draft" || status === "Pending Approval") return "prepareBid";
  if (status === "Published") return hasTenderSteps ? "published" : "closed";

  if (status === "Closed") {
    if (isRFQ) return "prepareAward";

    const envOpened = bid?.env_opened === "Y";
    const techScoreComplete = bid?.tech_score_complete === "Y";
    const finScoreComplete = bid?.fin_score_complete === "Y";
    const techScoreApproved = bid?.techscoreapproved === "Y";
    const finScoreApproved = bid?.finscoreapproved === "Y";

    if (hasTenderSteps) {
      if (techScoreApproved && finScoreApproved) return "prepareAward";
      if (techScoreApproved && finScoreComplete) return "commercialApprove";
      if (techScoreApproved) return "commercialReview";
      if (techScoreComplete) return "technicalApprove";
      if (envOpened) return "technicalReview";
      if (isTender) return "openBid";
    }

    if (isRFP) {
      if (finScoreComplete) return "prepareAward";
      if (techScoreComplete) return "commercialReview";
      return "technicalReview";
    }
  }

  if (status === "Award Under Process" || status === "Finalize") return "awardApproved";
  if (status === "Awarded") return "awarded";
  return "prepareBid";
}

function isPartialAwardStatus(status: string): boolean {
  return status === "Award Under Process" || status === "Finalize";
}

async function buildCompareBidsPayload(
  bidId: number,
  bid: any,
  currentStepOverride?: string,
): Promise<AgentCompareBidsSpec | null> {
  const currentStep = currentStepOverride || deriveCompareBidStep(bid);
  const [evalData, awards] = await Promise.all([
    bidService.getBidEvaluationData(bidId) as Promise<any>,
    bidRepo.getAwardsByBidRefNo(bidId),
  ]);
  const awardLines =
    Array.isArray(awards) && awards.length > 0
      ? await bidRepo.getAwardLinesByAwardId(Number((awards[0] as any)?.id))
      : [];

  const responses = Array.isArray(evalData?.responses) ? evalData.responses : [];
  if (responses.length === 0) return null;

  const allLinesHavePo =
    Array.isArray(awardLines) && awardLines.length > 0
      ? awardLines.every((line: any) => line?.po_number != null && line.po_number !== "")
      : undefined;

  return {
    bid,
    responses,
    lines: Array.isArray(evalData?.lines) ? evalData.lines : [],
    requirements: Array.isArray(evalData?.requirements) ? evalData.requirements : [],
    scores: Array.isArray(evalData?.scores) ? evalData.scores : [],
    awards: Array.isArray(awards) ? awards : [],
    awardLines: Array.isArray(awardLines) ? awardLines : [],
    currentStep,
    allLinesHavePo,
  };
}

export async function buildAwardingReviewSpec(
  item: SourcingActivationStageItem,
  sessionUser?: any,
): Promise<AwardingReviewSpec | null> {
  const bidId = await resolveNumericBidId(item.bidId);
  if (!bidId) return null;

  const [detail, approvers, evalData, allLinesFullyAwarded] = await Promise.all([
    bidService.getDboBidDetail(bidId),
    bidService.getDboBidApprovers(bidId),
    bidService.getBidEvaluationData(bidId),
    bidRepo.checkAllLinesFullyAwarded(bidId),
  ]);

  if (!detail) return null;

  const bid = detail as any;
  const bidType = String(bid.type || "RFQ").toUpperCase();
  const currency = String(bid.currency || "INR");
  const bidNumber = String(bid.bid_number || bid.attribute_4 || bidId);
  const responses = Array.isArray(evalData?.responses) ? evalData.responses : [];
  const approverList = Array.isArray(approvers) ? approvers : [];
  const status = String(bid.status || "");
  const hasRemainingToAward = !allLinesFullyAwarded;
  let currentStep = deriveCompareBidStep(bid);
  // Keep Awarding interactive for partial / line-wise remaining awards.
  if (isPartialAwardStatus(status) && hasRemainingToAward) {
    currentStep = "prepareAward";
  }

  const compareBids = await buildCompareBidsPayload(bidId, bid, currentStep);
  if (!compareBids) return null;

  const canAward =
    canPerformBidAwardActions(bid, sessionUser) &&
    currentStep === "prepareAward" &&
    (status === "Closed" || (isPartialAwardStatus(status) && hasRemainingToAward));

  return {
    bidId,
    bidNumber,
    bidTitle: String(bid.bid_title || item.title || bidNumber),
    bidType,
    status: status || "-",
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
      responseId: String(r.id || "-"),
      supplierId: String(r.supplier_id || r.id || "-"),
      supplierName: String(r.supplier_name || "Unknown"),
      supplierContact: String(r.supplier_contact || "-"),
      supplierPhone: String(r.supplier_contact_no || ""),
      bidTotal: formatDisplayCurrency(r.grosstotal, currency),
      techScore: bidType === "RFQ" ? "-" : String(r.total_score ?? "NA"),
      commScore: String(r.finscore ?? "NA"),
      totalScore: bidType === "RFQ" ? "-" : String(r.total_tech_and_fin_score ?? "NA"),
      version: String(r.version ?? 0),
      responseStatus: String(r.status || "-"),
    })),
    compareBids,
    canAward,
    taskTitle: String(item.title || "Awarding"),
  };
}

export function buildAwardingReviewMessage(spec: AwardingReviewSpec): string {
  const responseWord = spec.responsesCount === 1 ? "response" : "responses";
  const partialHint = isPartialAwardStatus(spec.status)
    ? " Some quantity or line items remain unawarded — continue awarding the remaining work."
    : "";
  return [
    `## Awarding — ${spec.bidNumber}`,
    `**${spec.bidTitle}**`,
    "",
    `${spec.responsesCount} supplier ${responseWord} ready for award.${partialHint} Use the **Responses** tab to compare bids and award a supplier, then go to the **Awards** tab to review the draft and **Submit for Approval** — all without leaving this conversation.`,
  ].join("\n");
}
