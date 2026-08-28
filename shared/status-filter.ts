/** Canonical status for dashboard “Pending Approval Requests” (excludes More Info Required). */
export const PENDING_APPROVAL_STATUS = "Pending Approval" as const;

/** Comma-separated status query values (dashboard links, list filters). */
export function parseStatusFilter(filter: string): string[] {  if (!filter || filter === "all") return [];
  return filter.split(",").map((s) => s.trim()).filter(Boolean);
}

export function matchesStatusFilter(entityStatus: string, filter: string): boolean {
  if (filter === "all") return true;
  const parts = parseStatusFilter(filter);
  return parts.length === 0 || parts.includes(entityStatus);
}

/**
 * Entity statuses for dashboard pending-approval counts and navigation.
 * More Info Required is intentionally excluded (waiting on requester, not approver).
 */
export const MODULE_PENDING_ENTITY_STATUSES: Record<string, readonly string[]> = {
  "Vendor Registration": [PENDING_APPROVAL_STATUS],
  "Supplier Registration": [PENDING_APPROVAL_STATUS],
  "Purchase Request": [PENDING_APPROVAL_STATUS],
  "Purchase Order": [PENDING_APPROVAL_STATUS],
  Budget: ["pending approval", PENDING_APPROVAL_STATUS],
  Invoice: [PENDING_APPROVAL_STATUS],  Bid: ["Pending Approval", "Award Under Process"],
  Contract: [
    "Pending Approval",
    "Pending Termination",
  ],
  Auction: ["Pending Approval", "Award Under Process"],
};

/** List `?status=` when navigating from dashboard pending-approval cards (no More Info Required). */
export const DASHBOARD_PENDING_APPROVAL_LIST_STATUS: Record<string, string> = {
  "Vendor Registration": PENDING_APPROVAL_STATUS,
  "Purchase Request": PENDING_APPROVAL_STATUS,
  "Purchase Order": PENDING_APPROVAL_STATUS,
  Budget: "pending approval",
  Invoice: PENDING_APPROVAL_STATUS,  Bid: "Pending Approval,Award Under Process",
  Contract:
    "Pending Approval,Pending Termination",
  Auction: "Pending Approval,Award Under Process",
};

export function dashboardPendingApprovalListUrl(moduleKey: string): string {
  const routes: Record<string, string> = {
    "Vendor Registration": "/app/vendors",
    "Purchase Request": "/app/purchase-requests",
    "Purchase Order": "/app/purchase-orders",
    Budget: "/app/budgets",
    Invoice: "/app/invoices",
    Bid: "/app/bids",
    Contract: "/app/contracts",
    Auction: "/app/auctions",
  };
  const base = routes[moduleKey];
  const status = DASHBOARD_PENDING_APPROVAL_LIST_STATUS[moduleKey];
  if (!base || !status) return "";
  const params = new URLSearchParams({
    status,
    page: "1",
    limit: "10",
  });
  return `${base}?${params.toString()}`;
}

/** SQL OR fragments: (process_name IN (...) AND entity still in pending statuses). */
export function buildPendingApprovalEntityMatchSql(): string {
  const clauses: string[] = [
    `(wi.process_name IN ('Vendor Registration', 'Supplier Registration', 'supplier registration')
      AND EXISTS (
        SELECT 1 FROM dbo.supp_basic_org_dtls e
        WHERE CAST(e.id AS VARCHAR) = TRIM(si.ref_number)
          AND TRIM(e.status) IN ('Pending Approval')
      ))`,
    `(wi.process_name = 'Purchase Request'
      AND EXISTS (
        SELECT 1 FROM dbo.supp_pr_header_dtls e
        WHERE TRIM(e.pr_number) = TRIM(si.ref_number)
          AND TRIM(e.pr_status) IN ('Pending Approval')
      ))`,
    `(wi.process_name = 'Purchase Order'
      AND EXISTS (
        SELECT 1 FROM dbo.supp_po_header_dtls e
        WHERE TRIM(e.po_number) = TRIM(si.ref_number)
          AND TRIM(e.po_status) IN ('Pending Approval')
      ))`,
    `(wi.process_name = 'Invoice'
      AND EXISTS (
        SELECT 1 FROM dbo.supp_invoice_dtls e
        WHERE CAST(e.id AS VARCHAR) = TRIM(si.ref_number)
          AND TRIM(e.invoice_status) IN ('Pending Approval')
      ))`,
    `(wi.process_name = 'Budget'
      AND EXISTS (
        SELECT 1 FROM dbo.am_budget_mst e
        WHERE CAST(e.id AS VARCHAR) = TRIM(si.ref_number)
          AND LOWER(TRIM(e.status)) IN ('pending approval')
      ))`,
    `(wi.process_name = 'Bid'
      AND EXISTS (
        SELECT 1 FROM dbo.supp_bid_dtls e
        WHERE CAST(e.id AS VARCHAR) = TRIM(si.ref_number)
          AND TRIM(e.status) IN ('Pending Approval', 'Award Under Process')
      ))`,
    `(wi.process_name IN ('Contract', 'Purchase Agreement', 'purchase agreement')
      AND EXISTS (
        SELECT 1 FROM dbo.cm_header e
        WHERE CAST(e.id AS VARCHAR) = TRIM(si.ref_number)
          AND TRIM(e.status) IN (
            'Pending Approval',
            'Pending Termination'
          )
      ))`,
    `(wi.process_name = 'Auction'
      AND EXISTS (
        SELECT 1 FROM dbo.au_auction_event e
        WHERE CAST(e.id AS VARCHAR) = TRIM(si.ref_number)
          AND TRIM(e.status) IN ('Pending Approval', 'Award Under Process')
      ))`,
  ];
  return clauses.join("\n      OR ");
}

/**
 * Superadmin dashboard: count all pending records org-wide (all business entities),
 * not limited to workflow assignee.
 */
export const SUPERADMIN_PENDING_APPROVAL_COUNT_SQL = `
  SELECT 'Vendor Registration' AS process_name, COUNT(*)::int AS count
  FROM dbo.supp_basic_org_dtls
  WHERE TRIM(status) = 'Pending Approval'
  UNION ALL
  SELECT 'Purchase Request', COUNT(*)::int
  FROM dbo.supp_pr_header_dtls
  WHERE TRIM(pr_status) = 'Pending Approval'
  UNION ALL
  SELECT 'Purchase Order', COUNT(*)::int
  FROM dbo.supp_po_header_dtls
  WHERE TRIM(po_status) = 'Pending Approval'
  UNION ALL
  SELECT 'Budget', COUNT(*)::int
  FROM dbo.am_budget_mst
  WHERE LOWER(TRIM(status)) = 'pending approval'
  UNION ALL
  SELECT 'Invoice', COUNT(*)::int
  FROM dbo.supp_invoice_dtls
  WHERE TRIM(invoice_status) = 'Pending Approval'
  UNION ALL
  SELECT 'Bid', COUNT(*)::int
  FROM dbo.supp_bid_dtls
  WHERE TRIM(status) IN ('Pending Approval', 'Award Under Process')
  UNION ALL
  SELECT 'Contract', COUNT(*)::int
  FROM dbo.cm_header
  WHERE TRIM(status) IN ('Pending Approval', 'Pending Termination')
  UNION ALL
  SELECT 'Auction', COUNT(*)::int
  FROM dbo.au_auction_event
  WHERE TRIM(status) IN ('Pending Approval', 'Award Under Process')
`;
