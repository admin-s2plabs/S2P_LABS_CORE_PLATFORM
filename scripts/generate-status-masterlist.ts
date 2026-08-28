/**
 * One-off generator: consolidated status strings → Excel workbook.
 * Run: npx tsx scripts/generate-status-masterlist.ts
 */
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "Prokraya-Status-Master-List.xlsx");

/** Canonical status string → modules where it appears (codebase / ERP-aligned). */
const entries: { status: string; modules: string[]; notes?: string }[] = [
  { status: "Active", modules: ["Contract", "Supplier", "Auction (prefix / ref data)"] },
  { status: "Approved", modules: ["PR", "PO", "Budget", "Invoice", "Bid award", "Contract", "Supplier", "Auction (award)"] },
  { status: "Accepted", modules: ["Contract"] },
  { status: "Award Under Process", modules: ["Bid", "Auction"] },
  { status: "Awarded", modules: ["Bid", "Bid award", "Bid response", "Auction"] },
  { status: "Blocked", modules: ["Supplier (AI / possible ERP)"] },
  { status: "Cancel", modules: ["Auction (event DB)"] },
  { status: "Cancelled", modules: ["PR", "PO", "Bid", "Auction (UI)", "Contract", "Bid response", "Invitation"] },
  { status: "Changes In Draft", modules: ["Supplier"] },
  { status: "Closed", modules: ["PO", "Bid", "Contract", "Auction (UI)"] },
  { status: "Complete", modules: ["PR", "PO"] },
  { status: "Deleted", modules: ["Bid", "Auction (responses/history)", "Contract (draft delete)", "Contract terms"] },
  { status: "Draft", modules: ["PR", "PO", "Budget", "Invoice", "Bid", "Bid award", "Contract", "Auction", "Bid response"] },
  { status: "Evaluation", modules: ["Bid (AI filter enum)"] },
  { status: "Expired", modules: ["PR", "Budget", "Contract", "Invitation"] },
  { status: "Finally Closed", modules: ["Bid"] },
  { status: "Finalize", modules: ["Bid"] },
  { status: "fulfilled", modules: ["PR (app schema only; not ERP header)"] },
  { status: "In Approval", modules: ["Invoice (UI pending)"] },
  { status: "InActive", modules: ["Supplier"] },
  { status: "Initiated", modules: ["Supplier invitation (create)"] },
  { status: "More Info Required", modules: ["PR", "PO", "Budget", "Invoice", "Contract (review)"] },
  {
    status: "more info required",
    modules: ["PR", "PO (API guard — compared lowercased)"],
    notes: "Same meaning as “More Info Required”; used after normalize in validateIsEditable",
  },
  { status: "More Info Required for Termination", modules: ["Contract"] },
  { status: "More Information Required", modules: ["PO (detail UI synonym)"] },
  { status: "Negotiation", modules: ["Bid (repository)"] },
  { status: "On Hold", modules: ["Bid"] },
  { status: "Open", modules: ["Auction (basket_auction_status)"] },
  { status: "Partially Awarded", modules: ["Auction"] },
  { status: "Paid", modules: ["Invoice"] },
  { status: "Pending", modules: ["Bid award"] },
  { status: "Pending Approval", modules: ["PR", "PO", "Budget", "Bid", "Bid award", "Contract", "Auction", "Supplier"] },
  { status: "Pending Awarded", modules: ["Auction"] },
  { status: "Pending Signature", modules: ["Contract"] },
  { status: "Pending Termination", modules: ["Contract"] },
  { status: "Published", modules: ["Bid", "Auction (UI)", "Contract terms"] },
  { status: "Rejected", modules: ["PR", "PO", "Budget", "Invoice", "Bid", "Bid award", "Contract", "Supplier", "Auction (award)"] },
  { status: "Resubmit", modules: ["Supplier (badge)"] },
  { status: "ReSubmit", modules: ["Budget (workflow)"] },
  { status: "Review", modules: ["Invoice (UI pending)"] },
  { status: "Review Committee", modules: ["Bid award"] },
  { status: "Review Completed", modules: ["Contract"] },
  { status: "Review Rejected", modules: ["Contract"] },
  { status: "Scheduled", modules: ["Auction"] },
  { status: "Signed", modules: ["Contract"] },
  { status: "Submitted", modules: ["Bid supplier lines", "Bid response", "Auction (response)"] },
  { status: "Supplier Submit For Negotiation", modules: ["Contract (grouping / ERP)"] },
  { status: "Terminated", modules: ["Contract"] },
  { status: "Termination Rejected", modules: ["Contract"] },
  { status: "Under Cancel", modules: ["Bid"] },
  { status: "Under Negotiation", modules: ["Bid", "Contract"] },
  { status: "Under Review", modules: ["Contract"] },
  { status: "Vendor Submit For Negotiation", modules: ["Contract"] },
  { status: "Supplier Submit For Negotiation", modules: ["Contract"] },
  { status: "Negotiation Under Review", modules: ["Contract"] },
  { status: "Withdraw", modules: ["Auction"] },
];

const sorted = [...entries].sort((a, b) => a.status.localeCompare(b.status, "en", { sensitivity: "base" }));

const sheetRows = sorted.map((e, i) => ({
  "#": i + 1,
  Status: e.status,
  Modules: e.modules.join("; "),
  Notes: e.notes ?? "",
}));

const ws = XLSX.utils.json_to_sheet(sheetRows);
const colW = [{ wch: 5 }, { wch: 42 }, { wch: 72 }, { wch: 48 }];
(ws as XLSX.WorkSheet)["!cols"] = colW;

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "All statuses");

const tenderNote = [
  {
    "#": "",
    Status: "Tender / RFP / RFQ",
    Modules: "Bid type (column `type`); lifecycle statuses are the same as Bid.",
    Notes: "",
  },
];
const ws2 = XLSX.utils.json_to_sheet(tenderNote);
(ws2 as XLSX.WorkSheet)["!cols"] = [{ wch: 5 }, { wch: 28 }, { wch: 70 }, { wch: 20 }];
XLSX.utils.book_append_sheet(wb, ws2, "Notes");

XLSX.writeFile(wb, outPath);
console.log("Wrote:", outPath);
