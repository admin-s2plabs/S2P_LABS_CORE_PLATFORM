/** `created_by` values that mean no real user was recorded (e.g. agent-created bids). */
const SYSTEM_CREATED_BY = new Set(["", "system"]);

export function isSystemBidCreatedBy(createdBy: string | null | undefined): boolean {
  return SYSTEM_CREATED_BY.has(String(createdBy || "").trim().toLowerCase());
}

/** Person to show when the user asks who created a bid — requestor when `created_by` is System. */
export function resolveBidCreatedByDisplay(bid: {
  created_by?: string | null;
  requestor_name?: string | null;
}): string | null {
  const requestor = String(bid.requestor_name || "").trim();
  if (isSystemBidCreatedBy(bid.created_by)) {
    return requestor || null;
  }
  const createdBy = String(bid.created_by || "").trim();
  return createdBy || requestor || null;
}
