import type { TechnicalEvaluationSpec } from "@shared/sourcing-technical-evaluation";
import type { SourcingActivationStageItem } from "@shared/sourcing-activation-signals";
import { formatDateTimeDisplay } from "@shared/publish-bid-dates";
import * as bidService from "../modules/bids/bids.service";
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

export async function buildTechnicalEvaluationSpec(
  item: SourcingActivationStageItem,
  sessionUser?: any,
): Promise<TechnicalEvaluationSpec | null> {
  const bidId = await resolveNumericBidId(item.bidId);
  if (!bidId) return null;

  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);

  const [detail, evalData, scoreStatus] = await Promise.all([
    bidService.getDboBidDetail(bidId),
    bidService.getBidEvaluationData(bidId),
    userId ? bidService.getTechScoreStatus(bidId, userId) : Promise.resolve(null),
  ]);

  if (!detail) return null;

  const bid = detail as any;
  const bidType = String(bid.type || "RFQ").toUpperCase();
  const currency = String(bid.currency || "INR");
  const bidNumber = String(bid.bid_number || bid.attribute_4 || bidId);
  const responses = Array.isArray(evalData?.responses) ? evalData.responses : [];

  const techScoreComplete = scoreStatus?.techScoreComplete ?? bid.tech_score_complete === "Y";
  const approved = scoreStatus?.approved ?? bid.techscoreapproved === "Y";
  const onApproveTeam = scoreStatus?.userTeams?.includes("Technical Approve Team") ?? false;
  const canApprove = onApproveTeam && techScoreComplete && !approved;

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
    responses: responses.map((r: any) => ({
      responseId: String(r.id || "-"),
      supplierName: String(r.supplier_name || "Unknown"),
      supplierContact: String(r.supplier_contact || "-"),
      supplierPhone: String(r.supplier_contact_no || ""),
      bidTotal: formatDisplayCurrency(r.bidtotal ?? r.grosstotal, currency),
      techScore: bidType === "RFQ" ? "-" : String(r.total_score ?? "NA"),
      version: String(r.version ?? 0),
    })),
    taskId: item.taskId ? String(item.taskId) : undefined,
    taskTitle: String(item.title || "Technical Approve"),
    techScoreComplete,
    scoreApproved: approved,
    canApprove,
  };
}

export function buildTechnicalEvaluationMessage(spec: TechnicalEvaluationSpec): string {
  return [
    `## Technical Approve — ${spec.bidNumber}`,
    `**${spec.bidTitle}**`,
    "",
    "Review submitted technical scores below. Use **View Response** to inspect supplier submissions, then **Approve Score** when ready.",
  ].join("\n");
}
