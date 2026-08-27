/**
 * AI registration document-gathering: four user-facing slots (company, tax/GST, bank, business license).
 * Maps structured extraction documentType values from vendor-registration-extraction.ts.
 */

export type VendorDocGatherSlot = "company" | "gst" | "bank" | "license";

const COMPANY_TYPES = new Set(["incorporation_certificate"]);
const GST_TYPES = new Set(["gst_certificate", "tax_certificate"]);
const BANK_TYPES = new Set(["bank_letter", "cancelled_cheque"]);
const LICENSE_TYPES = new Set(["trade_license"]);

export function documentTypeToSlot(
  documentType: string | undefined | null,
): VendorDocGatherSlot | null {
  if (!documentType || documentType === "other") return null;
  const k = String(documentType).toLowerCase();
  if (COMPANY_TYPES.has(k)) return "company";
  if (GST_TYPES.has(k)) return "gst";
  if (BANK_TYPES.has(k)) return "bank";
  if (LICENSE_TYPES.has(k)) return "license";
  return null;
}

export function slotStatusFromUploadedTypes(
  types: string[] | undefined | null,
): Record<VendorDocGatherSlot, boolean> {
  const s: Record<VendorDocGatherSlot, boolean> = {
    company: false,
    gst: false,
    bank: false,
    license: false,
  };
  for (const t of types || []) {
    const slot = documentTypeToSlot(t);
    if (slot) s[slot] = true;
  }
  return s;
}

export function isVendorDocumentGatheringComplete(
  types: string[] | undefined | null,
): boolean {
  const s = slotStatusFromUploadedTypes(types);
  return s.company && s.gst && s.bank && s.license;
}

export function batchRecognizedAnySlot(batch: string[] | undefined | null): boolean {
  for (const t of batch || []) {
    if (documentTypeToSlot(t)) return true;
  }
  return false;
}

/** Short user-facing line listing what is still needed. */
export function friendlyMissingUploadPrompt(
  status: Record<VendorDocGatherSlot, boolean>,
): string {
  const parts: string[] = [];
  if (!status.company) parts.push("your incorporation certificate");
  if (!status.gst) parts.push("your GST or tax certificate");
  if (!status.bank) parts.push("your bank letter or cancelled cheque");
  if (!status.license) parts.push("your business license");
  if (parts.length === 0) return "";
  if (parts.length === 1) return `Please upload ${parts[0]}.`;
  if (parts.length === 2) return `Please upload ${parts[0]} and ${parts[1]}.`;
  if (parts.length === 3) return `Please upload ${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
  return `Please upload ${parts[0]}, ${parts[1]}, ${parts[2]}, and ${parts[3]}.`;
}
