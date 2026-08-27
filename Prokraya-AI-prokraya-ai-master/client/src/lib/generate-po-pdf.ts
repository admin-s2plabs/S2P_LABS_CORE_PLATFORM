import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./common-functions";

interface POLineItem {
  po_line_number: string;
  item_name: string | null;
  line_description: string | null;
  line_qty: number | null;
  line_unit: string | null;
  line_unit_cost: number | null;
  line_cost: number | null;
  line_curr: string | null;
  tax_rate: number | null;
  tax_amount: number | null;
  discount: number | null;
  product_category_name: string | null;
}

interface Supplier {
  supplier_name: string | null;
  email_id: string | null;
  phone: string | null;
  address_1: string | null;
  city: string | null;
  country: string | null;
}

interface OrgInfo {
  organization_name: string | null;
  org_legal_name: string | null;
  org_legal_address: string | null;
  org_city: string | null;
  org_state: string | null;
  org_country: string | null;
  org_postalcode: string | null;
  org_phone_no: string | null;
  org_email: string | null;
  org_logo_path: string | null;
}

interface POData {
  po_number: string;
  po_description: string | null;
  po_status: string | null;
  po_type: string | null;
  po_total_cost: number | null;
  po_net_cost: number | null;
  po_tax: number | null;
  po_currency: string | null;
  department_name: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  po_owner_name: string | null;
  creation_date: string | null;
  po_issue_date: string | null;
  po_required_date: string | null;
  delivertto_location_name: string | null;
  shipto_address: string | null;
  billto_address: string | null;
  pr_number: string | null;
  budget_name: string | null;
  payment_terms_name: string | null;
  po_notes: string | null;
  company_name: string | null;
  advance_flag: string | null;
  advance_percentage: number | null;
  items: POLineItem[];
  supplier: Supplier | null;
}

function fmtCurrency(amount: number | string | null, currency: string | null): string {
  if (amount === null || amount === undefined) return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";
  const currencyCode = currency || "USD";
  const locale = currencyCode === "INR" ? "en-IN" : "en-US";
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  const symbolMap: Record<string, string> = { USD: "$", INR: "Rs.", EUR: "E", GBP: "L" };
  const symbol = symbolMap[currencyCode] || currencyCode;
  return `${symbol} ${formatted}`;
}

function fmtNumber(amount: number | string | null): string {
  if (amount === null || amount === undefined) return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function fmtDate(dateString: string | null): string {
  if (!dateString) return "-";
  return formatDate(dateString);
}

const PRIMARY: [number, number, number] = [79, 70, 229];
const DARK: [number, number, number] = [30, 30, 30];
const MEDIUM: [number, number, number] = [100, 100, 100];
const LIGHT_GRAY: [number, number, number] = [245, 245, 248];
const WHITE: [number, number, number] = [255, 255, 255];
const BORDER: [number, number, number] = [210, 210, 220];
const TABLE_HEADER_BG: [number, number, number] = [245, 245, 250];
const SUMMARY_BG: [number, number, number] = [250, 250, 253];

export function generatePOPdf(po: POData, orgInfo?: OrgInfo | null) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const orgName = orgInfo?.organization_name || "PROKRAYA";

  function checkPageBreak(needed: number) {
    if (y + needed > pageHeight - 25) {
      doc.addPage();
      y = margin;
    }
  }

  doc.setFillColor(...WHITE);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - margin * 2 + 4, "S");

  doc.setFillColor(...PRIMARY);
  doc.rect(margin - 2, margin - 2, contentWidth + 4, 1.5, "F");

  y = margin + 4;

  let logoRendered = false;
  if (orgInfo?.org_logo_path) {
    try {
      const logoData = orgInfo.org_logo_path;
      if (logoData.startsWith("data:image")) {
        const mimeMatch = logoData.match(/data:image\/([a-zA-Z]+);/);
        const imgFormat = mimeMatch ? mimeMatch[1].toUpperCase().replace("JPG", "JPEG") : "PNG";
        const logoHeight = 16;
        const logoWidth = 40;
        doc.addImage(logoData, imgFormat, margin + 2, y, logoWidth, logoHeight);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...PRIMARY);
        doc.text(orgName, pageWidth / 2, y + logoHeight / 2 + 1, { align: "center" });
        y += logoHeight + 4;
        logoRendered = true;
      }
    } catch {}
  }

  if (!logoRendered) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text(orgName, pageWidth / 2, y + 6, { align: "center" });
    y += 16;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);

  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(margin - 2, y, contentWidth + 4, 14, "F");

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("PURCHASE ORDER", pageWidth / 2, y + 9, { align: "center" });

  y += 14;

  const midX = pageWidth / 2;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text("DATE:", margin + 2, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(fmtDate(po.creation_date), margin + 18, y);

  doc.setTextColor(...MEDIUM);
  doc.setFont("helvetica", "normal");
  doc.text("DOCUMENT NO:", midX + 5, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(po.po_number, midX + 38, y);

  y += 5;

  doc.setTextColor(...MEDIUM);
  doc.setFont("helvetica", "normal");
  doc.text("VERSION NO:", midX + 5, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("0", midX + 38, y);

  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text("PO ISSUED DATE:", margin + 2, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(fmtDate(po.po_issue_date), margin + 36, y);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text("REQUIRED DATE:", midX + 5, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(fmtDate(po.po_required_date), midX + 36, y);

  y += 4;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 3;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...MEDIUM);
  const disclaimerText = "You are requested to supply the following goods and services. This Document number must be indicated on all Invoices, correspondence and consignments. Please forward supplies to our Order No later than the Required Date.";
  const disclaimerLines = doc.splitTextToSize(disclaimerText, contentWidth - 4);
  doc.text(disclaimerLines, margin + 2, y);
  y += disclaimerLines.length * 3 + 3;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 2;

  const leftColX = margin + 2;
  const rightColX = midX + 5;
  const sectionStartY = y;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY);
  doc.text("To", leftColX, y + 4);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  y += 9;
  doc.text(po.supplier?.supplier_name || "N/A", leftColX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MEDIUM);
  y += 5;

  if (po.supplier?.address_1) {
    const addrLines = doc.splitTextToSize(po.supplier.address_1, midX - margin - 10);
    doc.text(addrLines, leftColX, y);
    y += addrLines.length * 4;
  }
  if (po.supplier?.city || po.supplier?.country) {
    doc.text([po.supplier?.city, po.supplier?.country].filter(Boolean).join(", "), leftColX, y);
    y += 5;
  }
  if (po.supplier?.phone) {
    doc.text(`Mobile: ${po.supplier.phone}`, leftColX, y);
    y += 5;
  }
  if (po.supplier?.email_id) {
    doc.text(`Email: ${po.supplier.email_id}`, leftColX, y);
    y += 5;
  }

  const leftEndY = y;

  let rightY = sectionStartY + 4;
  doc.setFontSize(8);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text("BUYER:", rightColX, rightY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(po.buyer_name || po.po_owner_name || "-", rightColX + 22, rightY);
  rightY += 5;

  if (po.buyer_email) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MEDIUM);
    doc.text("EMAIL:", rightColX, rightY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.text(po.buyer_email, rightColX + 22, rightY);
    rightY += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text("DOCUMENT:", rightColX, rightY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(fmtCurrency(po.po_net_cost, po.po_currency), rightColX + 25, rightY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text("TAX:", rightColX + 55, rightY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(fmtCurrency(po.po_tax, po.po_currency), rightColX + 66, rightY);
  rightY += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text("PAYMENT TERMS:", rightColX, rightY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(po.payment_terms_name || "-", rightColX + 35, rightY);
  rightY += 7;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text("REQUESTOR:", rightColX, rightY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(po.buyer_name || po.po_owner_name || "-", rightColX + 28, rightY);
  rightY += 5;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY);
  doc.text("Ship To:", rightColX, rightY);
  rightY += 4;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.setFontSize(8);

  const shipToName = po.delivertto_location_name || orgName || "-";
  doc.text(shipToName, rightColX, rightY);
  rightY += 4;

  if (po.shipto_address) {
    const shipLines = doc.splitTextToSize(po.shipto_address, contentWidth / 2 - 10);
    doc.text(shipLines, rightColX, rightY);
    rightY += shipLines.length * 4;
  }

  y = Math.max(leftEndY, rightY) + 3;

  doc.setDrawColor(...BORDER);
  doc.line(midX, sectionStartY + 2, midX, y - 3);

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 2;

  if (po.po_description) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MEDIUM);
    doc.text("Invoice Should be sent to:", leftColX, y + 3);
    y += 4;
    doc.setTextColor(...DARK);
    const descLines = doc.splitTextToSize(po.po_description, contentWidth - 4);
    doc.text(descLines, leftColX, y + 2);
    y += descLines.length * 3.5 + 3;

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 2;
  }

  y += 3;
  checkPageBreak(40);

  const items = po.items || [];
  const poCur = po.po_currency || "USD";
  const tableBody = items.map((item, idx) => {
    const descParts = [];
    if (item.item_name) descParts.push(item.item_name);
    if (item.line_description && item.line_description !== item.item_name) descParts.push(item.line_description);
    const desc = descParts.join("\n");
    return [
      (idx + 1).toString(),
      desc || "-",
      item.product_category_name || "-",
      item.line_unit || "-",
      (item.line_qty || 0).toString(),
      fmtNumber(item.line_unit_cost),
      item.tax_rate ? `${item.tax_rate}%` : "-",
      fmtNumber(item.tax_amount),
      fmtNumber(item.line_cost),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["S.No", "ITEM CODE / DESCRIPTION", "Category", "UOM", "QTY", "UNIT PRICE", "TAX", "TAX\nAMOUNT", "AMOUNT(" + (po.po_currency || "USD") + ")"]],
    body: tableBody,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: TABLE_HEADER_BG,
      textColor: DARK,
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
      valign: "middle",
      lineColor: BORDER,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: "auto" },
	    2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
	    4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 12, halign: "right" },
      7: { cellWidth: 20, halign: "right" },
      8: { cellWidth: 26, halign: "right" },
    },
    alternateRowStyles: {
      fillColor: [252, 252, 255],
    },
  });

  y = (doc as any).lastAutoTable.finalY;

  const summaryLabelX = pageWidth - margin - 80;
  const summaryValueX = pageWidth - margin - 2;

  y += 2;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);

  doc.setFillColor(...SUMMARY_BG);
  doc.rect(summaryLabelX - 3, y - 1, 83, 7, "F");
  doc.setDrawColor(...BORDER);
  doc.rect(summaryLabelX - 3, y - 1, 83, 7, "S");

  const cur = po.po_currency || "USD";

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MEDIUM);
  doc.text("Net Amount:", summaryLabelX, y + 3.5);
  doc.setTextColor(...DARK);
  const netAmount = po.po_net_cost ?? items.reduce((sum, item) => sum + (Number(item.line_cost) || 0), 0);
  doc.text(fmtCurrency(netAmount, cur), summaryValueX, y + 3.5, { align: "right" });

  y += 7;

  doc.setFillColor(...SUMMARY_BG);
  doc.rect(summaryLabelX - 3, y - 1, 83, 7, "F");
  doc.setDrawColor(...BORDER);
  doc.rect(summaryLabelX - 3, y - 1, 83, 7, "S");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MEDIUM);
  doc.text("Total Tax:", summaryLabelX, y + 3.5);
  doc.setTextColor(...DARK);
  const taxAmount = po.po_tax ?? items.reduce((sum, item) => sum + (Number(item.tax_amount) || 0), 0);
  doc.text(fmtCurrency(taxAmount, cur), summaryValueX, y + 3.5, { align: "right" });

  y += 7;

  doc.setFillColor(...PRIMARY);
  doc.rect(summaryLabelX - 3, y - 1, 83, 8, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text("Total Gross Amount:", summaryLabelX, y + 4);
  const totalAmount = po.po_total_cost ?? (netAmount + taxAmount);
  doc.text(fmtCurrency(totalAmount, cur), summaryValueX, y + 4, { align: "right" });

  y += 14;

  checkPageBreak(30);

  if (po.po_notes) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("SPECIAL TERMS & CONDITIONS", margin + 2, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.setFontSize(7.5);
    const noteLines = doc.splitTextToSize(po.po_notes, contentWidth - 4);
    doc.text(noteLines, margin + 2, y);
    y += noteLines.length * 3.5 + 8;
  }

  checkPageBreak(45);

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  const sigLeftX = margin + 15;
  const sigRightX = pageWidth - margin - 60;

  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.3);
  doc.line(sigLeftX, y + 15, sigLeftX + 45, y + 15);
  doc.line(sigRightX, y + 15, sigRightX + 55, y + 15);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(po.supplier?.supplier_name || "Supplier", sigLeftX, y + 20);
  doc.text(`For ${orgName}`, sigRightX, y + 20);

  y += 30;

  checkPageBreak(20);

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...MEDIUM);
  doc.text("This electronically generated document does not require a signature.", pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.text(
    "I have read and understood the Organization standard terms and conditions, documents available at Terms & Conditions and accept the order under these terms.",
    pageWidth / 2, y, { align: "center" }
  );

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...MEDIUM);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - margin - 2,
      margin + 6,
      { align: "right" }
    );

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.setFontSize(6.5);
    doc.setTextColor(...MEDIUM);
    doc.text(
      `${orgName} | ${po.po_number} | Generated on ${formatDate(new Date())}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }

  doc.save(`Purchase_Order_${po.po_number}.pdf`);
}
