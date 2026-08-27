import type {
  BidApprovalReviewAttachment,
  BidApprovalReviewSpec,
  BidApprovalReviewTeamGroup,
} from "@shared/sourcing-bid-approval-review";
import type { SourcingActivationStageItem } from "@shared/sourcing-activation-signals";
import * as bidService from "../modules/bids/bids.service";
import { db } from "../db";
import { sql } from "drizzle-orm";

function formatDisplayDate(value: unknown): string {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "-";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatDisplayCurrency(amount: unknown, currency: string): string {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) return "-";
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

function mapAttachments(
  attachments: any[],
  bidId: number,
  source: string,
): BidApprovalReviewAttachment[] {
  return attachments
    .filter((a) => String(a.attach_source || "") === source)
    .map((a) => ({
      id: Number(a.id),
      name: String(a.attach_name || "Document"),
      downloadUrl: `/api/dbo/bids/${bidId}/attachments/${a.id}/download`,
    }));
}

function groupEvaluationTeam(approvers: any[]): BidApprovalReviewTeamGroup[] {
  const grouped = new Map<string, string[]>();
  for (const a of approvers) {
    const team = String(a.teamtype || "Team");
    const name = String(a.user_name || a.login_id || `User ${a.user_id}`);
    if (!grouped.has(team)) grouped.set(team, []);
    grouped.get(team)!.push(name);
  }
  return Array.from(grouped.entries()).map(([teamType, members]) => ({
    teamType,
    members,
  }));
}

export async function buildBidApprovalReviewSpec(
  item: SourcingActivationStageItem,
): Promise<BidApprovalReviewSpec | null> {
  const bidId = await resolveNumericBidId(item.bidId);
  if (!bidId || !item.taskId) return null;

  const [detail, lines, suppliers, requirements, clauses, approvers, attachments] =
    await Promise.all([
      bidService.getDboBidDetail(bidId),
      bidService.getDboBidLines(bidId),
      bidService.getDboBidSuppliers(bidId),
      bidService.getDboBidRequirements(bidId),
      bidService.getDboBidClauses(bidId),
      bidService.getDboBidApprovers(bidId),
      bidService.getDboBidAttachments(bidId),
    ]);

  if (!detail) return null;

  const bid = detail as any;
  const bidType = String(bid.type || "RFQ").toUpperCase();
  const currency = String(bid.currency || "INR");
  const bidNumber = String(bid.bid_number || bid.attribute_4 || bidId);

  const lineRows = (lines as any[]).map((line) => ({
    item: String(line.description || "-"),
    category: String(line.product_category || "-"),
    qty: String(line.quantity ?? "-"),
    uom: String(line.uom || "-"),
    unitPrice: formatDisplayCurrency(line.currentprice, line.currency || currency),
    requiredFrom: formatDisplayDate(line.needbyfrom),
    requiredBy: formatDisplayDate(line.needbyto),
    requestor: String(line.created_by || "-"),
  }));

  const supplierNames = (suppliers as any[])
    .map((s) => String(s.supplier_name || "").trim())
    .filter(Boolean);

  const criteria =
    bidType === "RFQ"
      ? []
      : (requirements as any[]).map((r, idx) => ({
          index: idx + 1,
          category: String(r.category || "-"),
          question: String(r.question || "-"),
          option: String(r.qvoption || "-"),
          type: String(r.qvtype || "-"),
          weight: String(r.weight || "-"),
        }));

  const evaluationTeam =
    bidType === "RFQ" ? [] : groupEvaluationTeam(approvers as any[]);

  const clauseRows = (clauses as any[]).map((c) => ({
    type: (String(c.type || "").toLowerCase() === "instructions"
      ? "instructions"
      : "terms") as "terms" | "instructions",
    description: String(c.class_desc || "-"),
    reference: c.class_ref ? String(c.class_ref) : undefined,
  }));

  return {
    bidId,
    bidNumber,
    bidTitle: String(bid.bid_title || item.title || bidNumber),
    bidType,
    taskId: String(item.taskId),
    taskTitle: String(item.title || "Bid Approval"),
    lines: lineRows,
    suppliers: supplierNames,
    criteria,
    criteriaAttachments: mapAttachments(attachments as any[], bidId, "Requirements"),
    evaluationTeam,
    terms: clauseRows.filter((c) => c.type === "terms"),
    instructions: clauseRows.filter((c) => c.type === "instructions"),
    termsAttachments: mapAttachments(attachments as any[], bidId, "Terms"),
  };
}

export function buildBidApprovalReviewMessage(spec: BidApprovalReviewSpec): string {
  return [
    `## Bid Approval Review — ${spec.bidNumber}`,
    `**${spec.bidTitle}**`,
    "",
    "Review the bid details below, then approve or reject using the action buttons.",
  ].join("\n");
}
