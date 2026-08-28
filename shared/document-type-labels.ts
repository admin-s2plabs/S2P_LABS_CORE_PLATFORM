/** Human-readable labels for dbo.supp_document_dtls doc_type values and agent canonical types. */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  tradelicense: "Trade License",
  commercemembership: "Chamber of Commerce Membership",
  vatcertificate: "VAT Certificate",
  companyprofile: "Company Profile",
  memorandum: "Memorandum of Association",
  listofemployees: "List of Employees",
  attroney: "Power of Attorney",
  employeeliability: "Employee Liability Certificate",
  insurancecert: "Insurance Certificate",
  bankguarantee: "Bank Guarantee Letter",
  isoqualification: "ISO Qualification Certificate",
  BANK_DOCUMENT: "Bank Document",
  other: "Other",
  // Agent / India canonical types
  pan_card: "PAN Card",
  gst_certificate: "GST Certificate",
  cancelled_cheque: "Cancelled Cheque",
  bank_letter: "Bank Letter",
  company_registration: "Company Registration",
  business_registration: "Business Registration / License",
  iso_certificate: "ISO Certificate",
  msme_certificate: "MSME Certificate",
  trade_license: "Trade License",
  vat_certificate: "VAT Certificate",
};

const FILE_NAME_PATTERN = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|pptx?|html?|txt|csv)$/i;

export function getDocumentTypeLabel(docType?: string | null): string | null {
  const type = String(docType || "").trim();
  if (!type) return null;
  if (DOCUMENT_TYPE_LABELS[type]) return DOCUMENT_TYPE_LABELS[type];
  const compact = type.toLowerCase().replace(/[\s_-]+/g, "");
  for (const [key, label] of Object.entries(DOCUMENT_TYPE_LABELS)) {
    if (key.toLowerCase().replace(/[\s_-]+/g, "") === compact) return label;
  }
  return null;
}

/** Prefer configured document type label over uploaded file name. */
export function formatDocumentDisplayLabel(doc: {
  doc_type?: string | null;
  category?: string | null;
  doc_name?: string | null;
}): string {
  const fromType = getDocumentTypeLabel(doc.doc_type);
  if (fromType) return fromType;
  if (doc.category) return doc.category;
  const name = String(doc.doc_name || "").trim();
  if (name && !FILE_NAME_PATTERN.test(name)) return name;
  const rawType = String(doc.doc_type || "").trim();
  return rawType || "Document";
}
