import type { TechnicalReviewSpec } from "@shared/sourcing-technical-review";
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

export async function resolveNumericBidId(bidRef: string | undefined): Promise<number | null> {
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

function collectScoredByIdentifiers(sessionUser: any): string[] {
  const identifiers = new Set<string>();
  const add = (value: unknown) => {
    const text = String(value || "").trim();
    if (text) identifiers.add(text);
  };
  add(sessionUser?.userName);
  add(sessionUser?.user_name);
  add(sessionUser?.email);
  add(sessionUser?.email_id);
  add(sessionUser?.userId);
  add(sessionUser?.id);
  return Array.from(identifiers);
}

export interface TechnicalReviewSpecOptions {
  readOnly?: boolean;
  canScore?: boolean;
  canSubmit?: boolean;
  viewMode?: "review" | "scores";
  blockReason?: string;
  aiAutoScored?: boolean;
  scoringState?: TechnicalReviewSpec["scoringState"];
}

export async function buildTechnicalReviewSpec(
  item: SourcingActivationStageItem,
  sessionUser?: any,
  options?: TechnicalReviewSpecOptions,
): Promise<TechnicalReviewSpec | null> {
  const bidId = await resolveNumericBidId(item.bidId);
  if (!bidId) return null;

  const userId = Number(sessionUser?.id || sessionUser?.userId || 0);
  const scoredByIdentifiers = collectScoredByIdentifiers(sessionUser);

  const [detail, evalData, scoreStatus] = await Promise.all([
    bidService.getDboBidDetail(bidId),
    bidService.getBidEvaluationData(
      bidId,
      scoredByIdentifiers.length > 0 ? scoredByIdentifiers : undefined,
    ),
    userId ? bidService.getTechScoreStatus(bidId, userId) : Promise.resolve(null),
  ]);

  if (!detail) return null;

  const bid = detail as any;
  const bidType = String(bid.type || "RFQ").toUpperCase();
  const currency = String(bid.currency || "INR");
  const bidNumber = String(bid.bid_number || bid.attribute_4 || bidId);
  const responses = Array.isArray(evalData?.responses) ? evalData.responses : [];

  const submitted = scoreStatus?.submitted ?? false;
  const approved = scoreStatus?.approved ?? false;
  const techScoreComplete = scoreStatus?.techScoreComplete ?? false;
  const onReviewTeam = scoreStatus?.userTeams?.includes("Technical Review Team") ?? false;
  const defaultCanScore = onReviewTeam && !submitted && !approved && bidType !== "RFQ";
  const canScore = options?.canScore ?? defaultCanScore;
  const canSubmit = options?.canSubmit ?? canScore;

  return {
    bidId,
    bidNumber,
    bidTitle: String(bid.bid_title || item.title || bidNumber),
    bidType,
    status: String(bid.status || "-"),
    bidStyle: String(bid.bid_style || "-"),
    startDate: formatDisplayDateTime(bid.startdate),
    endDate: formatDisplayDateTime(bid.enddate),
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
    taskTitle: String(item.title || "Technical Review"),
    scoreSubmitted: submitted,
    scoreApproved: approved,
    techScoreComplete,
    canScore,
    canSubmit,
    readOnly: options?.readOnly,
    viewMode: options?.viewMode,
    blockReason: options?.blockReason,
    aiAutoScored: options?.aiAutoScored,
    scoringState: options?.scoringState,
  };
}

export function buildTechnicalReviewMessage(spec: TechnicalReviewSpec): string {
  return [
    `## Technical Review — ${spec.bidNumber}`,
    `**${spec.bidTitle}**`,
    "",
    "Review supplier responses and complete technical scoring below. AI scores are applied automatically when available — inspect responses, adjust scores as needed, then **Submit Score** when finished.",
  ].join("\n");
}
