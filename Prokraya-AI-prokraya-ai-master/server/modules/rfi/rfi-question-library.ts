/**
 * Curated RFI question catalog. Kept as a static, in-code list (not a DB table) —
 * it's a fixed taxonomy of standardized supplier-information questions, not
 * per-tenant data. Campaign-specific copies (source = 'library') and fully
 * custom questions (source = 'custom') are what actually persist, in
 * dbo.rfi_questions_dtls.
 */

export type RfiQuestionType =
  | "text"
  | "single_select"
  | "multi_select"
  | "number"
  | "date"
  | "file_upload";

export interface RfiLibraryQuestion {
  id: string;
  attributeKey: string;
  text: string;
  type: RfiQuestionType;
  options?: string[];
  category: string;
}

export const RFI_QUESTION_TYPES: { value: RfiQuestionType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "single_select", label: "Single-select" },
  { value: "multi_select", label: "Multi-select" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "file_upload", label: "File-upload" },
];

export const RFI_QUESTION_LIBRARY: RfiLibraryQuestion[] = [
  {
    id: "LIB-01",
    attributeKey: "cert.iso_27001",
    text: "Do you hold ISO 27001 certification?",
    type: "single_select",
    options: ["Yes — currently certified", "In progress", "No"],
    category: "Certifications",
  },
  {
    id: "LIB-02",
    attributeKey: "capacity.annual_production",
    text: "What is your annual production capacity?",
    type: "number",
    category: "Capacity",
  },
  {
    id: "LIB-03",
    attributeKey: "location.primary_region",
    text: "What is your primary operating region?",
    type: "single_select",
    options: ["India", "APAC", "Europe", "North America", "Middle East", "Africa", "LATAM"],
    category: "Location",
  },
  {
    id: "LIB-04",
    attributeKey: "company.years_in_business",
    text: "How many years has your company been in business?",
    type: "number",
    category: "Company",
  },
  {
    id: "LIB-05",
    attributeKey: "company.headcount",
    text: "What is your company headcount?",
    type: "number",
    category: "Company",
  },
  {
    id: "LIB-06",
    attributeKey: "cert.iso_9001",
    text: "Do you hold ISO 9001 certification?",
    type: "single_select",
    options: ["Yes — currently certified", "In progress", "No"],
    category: "Certifications",
  },
  {
    id: "LIB-07",
    attributeKey: "ops.avg_lead_time_days",
    text: "What is your average lead time (days)?",
    type: "number",
    category: "Operations",
  },
  {
    id: "LIB-08",
    attributeKey: "esg.reporting",
    text: "Do you offer sustainability/ESG reporting?",
    type: "single_select",
    options: ["Yes — annual report published", "Yes — on request", "No"],
    category: "ESG",
  },
  {
    id: "LIB-09",
    attributeKey: "contact.primary_email",
    text: "What is your primary point of contact email?",
    type: "text",
    category: "Contact",
  },
  {
    id: "LIB-10",
    attributeKey: "commercial.payment_terms",
    text: "What payment terms do you typically offer?",
    type: "single_select",
    options: ["Advance", "30 Days", "45 Days", "60 Days", "90 Days"],
    category: "Commercial",
  },
  {
    id: "LIB-11",
    attributeKey: "risk.business_continuity_plan",
    text: "Do you have a disaster recovery / business continuity plan?",
    type: "file_upload",
    category: "Risk",
  },
  {
    id: "LIB-12",
    attributeKey: "commercial.minimum_order_qty",
    text: "What is your minimum order quantity?",
    type: "number",
    category: "Commercial",
  },
  {
    id: "LIB-13",
    attributeKey: "cert.primary_expiry_date",
    text: "When does your primary certification expire?",
    type: "date",
    category: "Certifications",
  },
];

export function getLibraryQuestion(id: string): RfiLibraryQuestion | undefined {
  return RFI_QUESTION_LIBRARY.find((q) => q.id === id);
}
