import type { BidAwardSubmitReviewSpec } from "@shared/sourcing-bid-award-submit-review";
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

async function resolveNumericBidId(bidRef: string | number | undefined): Promise<number | null> {
  if (bidRef == null || bidRef === "") return null;
  if (typeof bidRef === "number" && Number.isFinite(bidRef)) return bidRef;

  const raw = String(bidRef).trim();
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  const numStr = raw.toUpperCase();
  const result = await db.execute(
    sql`SELECT id FROM dbo.supp_bid_dtls WHERE UPPER(attribute_4) = ${numStr} LIMIT 1`,
  );
  if (result.rows.length > 0) return Number(result.rows[0].id);
  return null;
}

async function resolveAwardId(
  bidId: number,
  awardIdRef?: string | number,
): Promise<{ awardId: number; award: any } | null> {
  const parsedAwardId = parseInt(String(awardIdRef || "").trim(), 10);
  const awards = await bidRepo.getAwardsWithLinesByBidRefNo(bidId);
  if (!Array.isArray(awards) || awards.length === 0) return null;

  if (Number.isFinite(parsedAwardId) && parsedAwardId > 0) {
    const award = (awards as any[]).find((entry) => Number(entry.id) === parsedAwardId);
    if (!award) return null;
    return { awardId: parsedAwardId, award };
  }

  const draftAward = (awards as any[]).find((entry) => String(entry.status || "Draft") === "Draft");
  if (!draftAward) return null;

  const awardId = Number(draftAward.id);
  if (!Number.isFinite(awardId) || awardId <= 0) return null;
  return { awardId, award: draftAward };
}

export async function buildBidAwardSubmitReviewSpec(
  item: SourcingActivationStageItem,
  awardIdOverride?: number,
): Promise<BidAwardSubmitReviewSpec | null> {
  const bidId = await resolveNumericBidId(item.bidId);
  if (!bidId) return null;

  const resolvedAward = await resolveAwardId(
    bidId,
    awardIdOverride ?? item.awardId,
  );
  if (!resolvedAward) return null;

  const { awardId, award } = resolvedAward;

  const [bid, awards, evalData] = await Promise.all([
    bidService.getDboBidDetail(bidId),
    bidRepo.getAwardsWithLinesByBidRefNo(bidId),
    bidService.getBidEvaluationData(bidId).catch(() => null),
  ]);

  if (!bid) return null;

  const bidAny = bid as any;
  const currency = String(bidAny.currency || "INR");
  const bidNumber = String(bidAny.bid_number || bidAny.attribute_4 || bidId);
  const awardedSupplierId = String(award.supplier_id || "");
  const responseList = Array.isArray((evalData as any)?.responses) ? (evalData as any).responses : [];
  const otherQuotes = responseList
    .filter((resp: any) => String(resp.supplier_id || "") !== awardedSupplierId)
    .map((resp: any) => ({
      responseId: String(resp.id || "-"),
      supplierName: String(resp.supplier_name || "-"),
      bidTotal: formatDisplayCurrency(resp.bidtotal, currency),
      discount: formatDisplayCurrency(resp.biddisc, currency),
      taxAmount: formatDisplayCurrency(resp.tax_amount, currency),
      grossTotal: formatDisplayCurrency(resp.grosstotal, currency),
    }));

  const lines = Array.isArray(award.lines) ? award.lines : [];
  const awardStatus = String(award.status || "Draft");

  return {
    bidId,
    bidNumber,
    bidTitle: String(bidAny.bid_title || item.title || bidNumber),
    bidType: String(bidAny.type || "RFQ"),
    bidStatus: String(bidAny.status || "-"),
    bidStyle: String(bidAny.bid_style || "-"),
    startDate: formatDisplayDateTime(bidAny.startdate),
    endDate: formatDisplayDateTime(bidAny.enddate),
    currency,
    paymentTerms: String(bidAny.paymentterms || "-"),
    deliveryLocation: String(bidAny.delivertto_location_name || bidAny.shiptoaddress || "-"),
    linkedPr: bidAny.pr_number ? String(bidAny.pr_number) : undefined,
    buyerName: String(bidAny.buyer_name || bidAny.buyer || "-"),
    buyerEmail: String(bidAny.buyer_email || ""),
    requestorName: String(bidAny.requestor_name || "-"),
    requestorEmail: String(bidAny.requestor_email || ""),
    departmentName: String(bidAny.department_name || "-"),
    responsesCount: Number(bidAny.bid_responses) || responseList.length,
    invitedCount: Number(bidAny.no_invited_supps) || 0,
    totalAwards: Array.isArray(awards) ? awards.length : 0,
    awardId,
    awardStatus,
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
    otherQuotes,
    canSubmit: awardStatus === "Draft",
    taskTitle: String(item.title || "Submit Award for Approval"),
  };
}

export function buildBidAwardSubmitReviewMessage(spec: BidAwardSubmitReviewSpec): string {
  return [
    `## Submit Award for Approval — ${spec.bidNumber}`,
    `**${spec.bidTitle}**`,
    "",
    `Award #${spec.awardId} to **${spec.supplierName}** (${spec.netTotal}) is in **${spec.awardStatus}** status.`,
    spec.canSubmit
      ? "Review the award details below, add your award notes, and click **Submit for Approval** to send it into the approval workflow."
      : "This award is not in Draft status and cannot be submitted from here.",
  ].join("\n");
}

export async function buildBidAwardSubmitReviewSpecByBid(
  bidId: number,
  awardId?: number,
): Promise<BidAwardSubmitReviewSpec | null> {
  return buildBidAwardSubmitReviewSpec(
    {
      bidId: String(bidId),
      awardId: awardId ? String(awardId) : undefined,
      title: `Bid ${bidId}`,
    },
    awardId,
  );
}
