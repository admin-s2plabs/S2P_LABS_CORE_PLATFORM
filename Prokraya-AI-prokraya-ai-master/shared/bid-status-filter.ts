/** Bid statuses excluded when the user asks for "active" bids (sourcing agent + lists). */
export const NON_ACTIVE_BID_STATUSES = [
  "Draft",
  "Awarded",
  "Cancelled",
  "On Hold",
  "Rejected",
] as const;

const NON_ACTIVE_BID_STATUS_SET = new Set(
  NON_ACTIVE_BID_STATUSES.map((s) => s.toLowerCase()),
);

export function isActiveBidStatus(status: string | null | undefined): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;
  return !NON_ACTIVE_BID_STATUS_SET.has(normalized);
}

export const ACTIVE_BID_STATUS_DEFINITION =
  "Active includes Published, Closed, Pending Approval, Negotiation, Evaluation, Award Under Process, and all other statuses except Draft, Awarded, Cancelled, On Hold, and Rejected.";

export function countBidsByStatus<T extends { status?: string | null }>(
  bids: T[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const bid of bids) {
    const status = bid.status || "Unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}
