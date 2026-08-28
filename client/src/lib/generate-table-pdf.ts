import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./common-functions";

const PRIMARY: [number, number, number] = [79, 70, 229];
const DARK: [number, number, number] = [30, 30, 30];
const MEDIUM: [number, number, number] = [100, 100, 100];
const BORDER: [number, number, number] = [210, 210, 220];
const TABLE_HEADER_BG: [number, number, number] = [245, 245, 250];
const WHITE: [number, number, number] = [255, 255, 255];

/** A4 portrait content width (mm) with default side margins — used to decide orientation. */
const A4_PORTRAIT_MM = 210;
const DEFAULT_MARGIN_MM = 10;
/** If average column width in portrait would be below this (mm), use landscape for better alignment. */
const MIN_COLUMN_WIDTH_PORTRAIT_MM = 16;

function shouldUseLandscape(columns: string[], marginMm: number): boolean {
  if (columns.length === 0) return false;
  const contentWidthPortrait = A4_PORTRAIT_MM - marginMm * 2;
  return contentWidthPortrait / columns.length < MIN_COLUMN_WIDTH_PORTRAIT_MM;
}

export function generateTablePdf(options: {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  filename: string;
}) {
  const { title, subtitle, columns, rows, filename } = options;

  const margin = DEFAULT_MARGIN_MM;
  const orientation = shouldUseLandscape(columns, margin) ? "l" : "p";
  const doc = new jsPDF(orientation, "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  // Top color bar
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageWidth, 1.5, "F");

  y = margin + 4;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY);
  doc.text(title, margin, y);
  y += 6;

  if (subtitle) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MEDIUM);
    doc.text(subtitle, margin, y);
    y += 5;
  }

  // Date line
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MEDIUM);
  doc.text(`Generated on: ${formatDate(new Date())}`, margin, y);
  doc.text(`Total Records: ${rows.length}`, pageWidth - margin, y, { align: "right" });
  y += 4;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  const columnCount = columns.length;
  const tableWidth = pageWidth - margin * 2;
  const equalWidth = tableWidth / columnCount;

  const columnStyles: Record<number, { cellWidth: number }> = {};
  columns.forEach((_, index) => {
    columnStyles[index] = { cellWidth: equalWidth };
  });

  // Table
  autoTable(doc, {
    startY: y,
    head: [columns],
    body: rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? "-" : String(cell)))),
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: DARK,
      lineColor: BORDER,
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    columnStyles,
    headStyles: {
      fillColor: TABLE_HEADER_BG,
      textColor: DARK,
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "left",
      valign: "middle",
      lineColor: BORDER,
      lineWidth: 0.3,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 255],
    },
    tableWidth: tableWidth,
  });

  // Page footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFontSize(6.5);
    doc.setTextColor(...MEDIUM);
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    doc.text(title, margin, pageHeight - 8);

    // Top color bar on each page
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageWidth, 1.5, "F");
  }

  doc.save(`${filename}.pdf`);
}
