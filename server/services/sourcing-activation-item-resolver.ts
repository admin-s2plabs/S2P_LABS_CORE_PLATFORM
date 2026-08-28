import type {
  SourcingActivationStageId,
  SourcingActivationStageItem,
} from "@shared/sourcing-activation-signals";
import { getActivationSignals } from "./sourcing-activation-signals.service";
import * as bidService from "../modules/bids/bids.service";
import { db } from "../db";
import { sql } from "drizzle-orm";

async function resolveNumericBidId(bidRef: string | number | undefined): Promise<number | null> {
  if (bidRef == null || bidRef === "") return null;
  if (typeof bidRef === "number" && Number.isFinite(bidRef)) return bidRef;

  const raw = String(bidRef).trim();
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  const candidates = [
    raw.toUpperCase(),
    raw.toUpperCase().replace(/^TENDER/, "TND"),
    raw.toUpperCase().replace(/^BID/, ""),
  ].filter((value, index, all) => value && all.indexOf(value) === index);

  for (const numStr of candidates) {
    const result = await db.execute(
      sql`SELECT id FROM dbo.supp_bid_dtls WHERE UPPER(attribute_4) = ${numStr} LIMIT 1`,
    );
    if (result.rows.length > 0) return Number(result.rows[0].id);
  }
  return null;
}

/** Resolve RFQ/RFP/TND/Bid numbers (and numeric IDs) for Activation Signal matching. */
export async function resolveActivationBidNumericId(
  refs: { bidNumber?: string; bidId?: string | number },
): Promise<number | null> {
  if (refs.bidId != null && refs.bidId !== "") {
    const fromId = await resolveNumericBidId(refs.bidId);
    if (fromId) return fromId;
  }
  if (refs.bidNumber) {
    return resolveNumericBidId(refs.bidNumber);
  }
  return null;
}

function itemMatchesBidId(item: SourcingActivationStageItem, numericBidId: number): boolean {
  if (!item.bidId) return false;
  return String(item.bidId) === String(numericBidId);
}

export async function resolveActivationStageItem(
  sessionUser: any,
  stageId: SourcingActivationStageId,
  refs: { bidId?: number; bidNumber?: string; taskId?: string; awardId?: string },
): Promise<{ item: SourcingActivationStageItem; bidId: number } | { error: string }> {
  const numericBidId =
    (refs.bidId && Number.isFinite(refs.bidId) ? refs.bidId : null) ||
    (await resolveNumericBidId(refs.bidNumber));

  if (!numericBidId && (refs.bidId || refs.bidNumber)) {
    return {
      error: refs.bidNumber
        ? `No bid found with number "${refs.bidNumber}".`
        : "Please provide a valid bid ID or bid number.",
    };
  }

  let signals;
  try {
    signals = await getActivationSignals(sessionUser);
  } catch {
    return { error: "Could not load your pending sourcing tasks." };
  }

  const stage = signals.stages.find((entry) => entry.id === stageId && entry.pendingCount > 0);
  const items = stage?.items || [];

  if (refs.taskId) {
    const byTask = items.find((item) => item.taskId === refs.taskId);
    if (byTask) {
      const bidId = numericBidId || (byTask.bidId ? Number(byTask.bidId) : null);
      if (bidId && Number.isFinite(bidId)) {
        return { item: byTask, bidId };
      }
    }
  }

  if (numericBidId) {
    const byBid = items.find((item) => itemMatchesBidId(item, numericBidId));
    if (byBid) {
      return { item: byBid, bidId: numericBidId };
    }
  }

  if (stageId === "openEnvelope" && numericBidId) {
    const detail = await bidService.getDboBidDetail(numericBidId);
    if (!detail) {
      return { error: `Bid ID ${numericBidId} was not found.` };
    }
    const bid = detail as Record<string, unknown>;
    return {
      item: {
        bidId: String(numericBidId),
        title: String(bid.bid_title || bid.attribute_4 || refs.bidNumber || numericBidId),
      },
      bidId: numericBidId,
    };
  }

  if (stageId === "technicalReview" && numericBidId) {
    const detail = await bidService.getDboBidDetail(numericBidId);
    if (!detail) {
      return { error: `Bid ID ${numericBidId} was not found.` };
    }
    const bid = detail as Record<string, unknown>;
    const byBid = items.find((item) => itemMatchesBidId(item, numericBidId));
    return {
      item: byBid || {
        bidId: String(numericBidId),
        taskId: refs.taskId,
        title: String(bid.bid_title || bid.attribute_4 || refs.bidNumber || numericBidId),
      },
      bidId: numericBidId,
    };
  }

  if (stageId === "technicalEvaluation" && numericBidId) {
    const detail = await bidService.getDboBidDetail(numericBidId);
    if (!detail) {
      return { error: `Bid ID ${numericBidId} was not found.` };
    }
    const bid = detail as Record<string, unknown>;
    const byBid = items.find((item) => itemMatchesBidId(item, numericBidId));
    return {
      item: byBid || {
        bidId: String(numericBidId),
        taskId: refs.taskId,
        title: String(bid.bid_title || bid.attribute_4 || refs.bidNumber || numericBidId),
      },
      bidId: numericBidId,
    };
  }

  if (stageId === "commercialReview" && numericBidId) {
    const detail = await bidService.getDboBidDetail(numericBidId);
    if (!detail) {
      return { error: `Bid ID ${numericBidId} was not found.` };
    }
    const bid = detail as Record<string, unknown>;
    const byBid = items.find((item) => itemMatchesBidId(item, numericBidId));
    return {
      item: byBid || {
        bidId: String(numericBidId),
        taskId: refs.taskId,
        title: String(bid.bid_title || bid.attribute_4 || refs.bidNumber || numericBidId),
      },
      bidId: numericBidId,
    };
  }

  if (stageId === "commercialEvaluation" && numericBidId) {
    const detail = await bidService.getDboBidDetail(numericBidId);
    if (!detail) {
      return { error: `Bid ID ${numericBidId} was not found.` };
    }
    const bid = detail as Record<string, unknown>;
    const byBid = items.find((item) => itemMatchesBidId(item, numericBidId));
    return {
      item: byBid || {
        bidId: String(numericBidId),
        taskId: refs.taskId,
        title: String(bid.bid_title || bid.attribute_4 || refs.bidNumber || numericBidId),
      },
      bidId: numericBidId,
    };
  }

  if (stageId === "awarding" && numericBidId) {
    const detail = await bidService.getDboBidDetail(numericBidId);
    if (!detail) {
      return { error: `Bid ID ${numericBidId} was not found.` };
    }
    const bid = detail as Record<string, unknown>;
    const byBid = items.find((item) => itemMatchesBidId(item, numericBidId));
    return {
      item: byBid || {
        bidId: String(numericBidId),
        awardId: refs.awardId,
        taskId: refs.taskId,
        title: String(bid.bid_title || bid.attribute_4 || refs.bidNumber || numericBidId),
      },
      bidId: numericBidId,
    };
  }

  if (stageId === "bidApproval") {
    if (numericBidId && refs.taskId) {
      return {
        item: {
          bidId: String(numericBidId),
          taskId: refs.taskId,
          title: refs.bidNumber || `Bid ${numericBidId}`,
        },
        bidId: numericBidId,
      };
    }

    const label = refs.bidNumber || (numericBidId ? `bid ${numericBidId}` : "that bid");
    return {
      error: `No pending bid approval task found for ${label}. Check **My Tasks** or use **Show pending sourcing tasks** to pick from your inbox.`,
    };
  }

  const stageLabel = stage?.label || stageId;
  return {
    error: `No pending ${stageLabel} task found${refs.bidNumber ? ` for "${refs.bidNumber}"` : ""}.`,
  };
}
