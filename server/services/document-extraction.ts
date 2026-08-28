import { getAIClient, getAIModelName } from "./ai-client";

export interface ExtractionResult {
  success: boolean;
  documentType: string;
  extractedFields: Record<string, string>;
  confidence: number;
  rawText?: string;
  warnings: string[];
}

const documentPrompts: Record<string, string> = {
  company_registration: `You are analyzing a Certificate of Incorporation or Company Registration document.
Extract the following fields if present:
- companyName: The official registered company name
- cinNumber: The CIN (Corporate Identification Number) 
- registrationDate: Date of incorporation
- registeredAddress: The registered office address
- companyType: Type of company (Private Limited, LLP, etc.)

Return ONLY a JSON object with the extracted fields. Use null for fields not found.`,

  pan_card: `You are analyzing a PAN Card document (Company or Individual).
Extract the following fields if present:
- panNumber: The 10-character PAN number (format: AAAAA9999A)
- name: Name as shown on PAN
- fatherName: Father's name (if individual PAN)
- dateOfBirth: Date of birth or incorporation

Return ONLY a JSON object with the extracted fields. Use null for fields not found.`,

  gst_certificate: `You are analyzing a GST Registration Certificate.
Extract the following fields if present:
- gstNumber: The 15-character GSTIN (format: 29AAAAA9999A1Z5)
- legalName: Legal name of the business
- tradeName: Trade name (if different from legal name)
- state: State of registration
- address: Principal place of business address
- dateOfRegistration: Date of GST registration

Return ONLY a JSON object with the extracted fields. Use null for fields not found.`,

  cancelled_cheque: `You are analyzing a Cancelled Cheque or Bank Verification Letter.
Extract the following fields if present:
- bankName: Name of the bank
- branchName: Branch name
- accountNumber: Bank account number
- ifscCode: IFSC code (format: AAAA0999999)
- accountHolderName: Name of the account holder
- micrCode: MICR code if visible

Return ONLY a JSON object with the extracted fields. Use null for fields not found.`,

  bank_letter: `You are analyzing a Bank Verification Letter or Bank Statement.
Extract the following fields if present:
- bankName: Name of the bank
- branchName: Branch name
- accountNumber: Bank account number
- ifscCode: IFSC code (format: AAAA0999999)
- accountHolderName: Name of the account holder
- accountType: Type of account (Current, Savings, etc.)

Return ONLY a JSON object with the extracted fields. Use null for fields not found.`,

  iso_certificate: `You are analyzing an ISO or Quality Certification document.
Extract the following fields if present:
- certificationType: Type of certification (ISO 9001, ISO 27001, CMMI, etc.)
- certificateNumber: Certificate/registration number
- companyName: Name of the certified company
- validFrom: Certificate valid from date
- validUntil: Certificate expiry date
- certifyingBody: Name of the certification body

Return ONLY a JSON object with the extracted fields. Use null for fields not found.`,
};

export async function extractDocumentData(
  base64Image: string,
  documentType: string,
  mimeType: string = "image/jpeg"
): Promise<ExtractionResult> {
  const prompt = documentPrompts[documentType] || documentPrompts.company_registration;
  
  try {
    const openai = await getAIClient();
    const modelName = await getAIModelName();
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: "You are a document analysis AI that extracts structured data from business documents. Always return valid JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    let extractedFields: Record<string, string> = {};
    
    try {
      const parsed = JSON.parse(content);
      // Filter out null values and convert to string
      for (const [key, value] of Object.entries(parsed)) {
        if (value !== null && value !== undefined) {
          extractedFields[key] = String(value);
        }
      }
    } catch {
      console.error("Failed to parse extraction response:", content);
    }

    // Calculate confidence based on number of fields extracted
    const expectedFields = getExpectedFieldCount(documentType);
    const extractedCount = Object.keys(extractedFields).length;
    const confidence = Math.min(100, Math.round((extractedCount / expectedFields) * 100));

    const warnings: string[] = [];
    if (extractedCount === 0) {
      warnings.push("No fields could be extracted. Please ensure the document is clear and readable.");
    } else if (confidence < 50) {
      warnings.push("Low extraction confidence. Some fields may be missing or unclear.");
    }

    return {
      success: extractedCount > 0,
      documentType,
      extractedFields,
      confidence,
      warnings,
    };
  } catch (error) {
    console.error("Document extraction error:", error);
    return {
      success: false,
      documentType,
      extractedFields: {},
      confidence: 0,
      warnings: ["Failed to process document. Please try again or upload a clearer image."],
    };
  }
}

function getExpectedFieldCount(documentType: string): number {
  const counts: Record<string, number> = {
    company_registration: 5,
    pan_card: 4,
    gst_certificate: 6,
    cancelled_cheque: 6,
    bank_letter: 6,
    iso_certificate: 6,
  };
  return counts[documentType] || 4;
}

// Map extracted fields to vendor profile fields
export function mapExtractedFieldsToVendor(
  allExtractions: Record<string, Record<string, string>>
): Record<string, string> {
  const vendorData: Record<string, string> = {};

  // Company Registration
  const companyReg = allExtractions.company_registration;
  if (companyReg) {
    if (companyReg.companyName) vendorData.companyName = companyReg.companyName;
    if (companyReg.cinNumber) vendorData.cinNumber = companyReg.cinNumber;
    if (companyReg.registeredAddress) vendorData.address = companyReg.registeredAddress;
  }

  // PAN Card
  const pan = allExtractions.pan_card;
  if (pan) {
    if (pan.panNumber) vendorData.panNumber = pan.panNumber;
    // Use name from PAN if no company name yet
    if (!vendorData.companyName && pan.name) vendorData.companyName = pan.name;
  }

  // GST Certificate
  const gst = allExtractions.gst_certificate;
  if (gst) {
    if (gst.gstNumber) vendorData.gstNumber = gst.gstNumber;
    if (gst.legalName && !vendorData.companyName) vendorData.companyName = gst.legalName;
    if (gst.tradeName) vendorData.tradeName = gst.tradeName;
    if (gst.state) vendorData.state = gst.state;
    if (gst.address && !vendorData.address) vendorData.address = gst.address;
  }

  // Bank Details
  const bank = allExtractions.cancelled_cheque || allExtractions.bank_letter;
  if (bank) {
    if (bank.bankName) vendorData.bankName = bank.bankName;
    if (bank.accountNumber) vendorData.bankAccountNumber = bank.accountNumber;
    if (bank.ifscCode) vendorData.bankIfsc = bank.ifscCode;
    if (bank.accountHolderName) vendorData.bankAccountHolder = bank.accountHolderName;
  }

  return vendorData;
}

// Validate extracted data against business rules
export function validateExtractedData(
  extractedFields: Record<string, string>,
  documentType: string
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // PAN validation
  if (documentType === "pan_card" && extractedFields.panNumber) {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
    if (!panRegex.test(extractedFields.panNumber)) {
      errors.push("Invalid PAN format. Expected format: AAAAA9999A");
    }
  }

  // GST validation
  if (documentType === "gst_certificate" && extractedFields.gstNumber) {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
    if (!gstRegex.test(extractedFields.gstNumber)) {
      warnings.push("GST number format may be incorrect. Please verify.");
    }
  }

  // IFSC validation
  if ((documentType === "cancelled_cheque" || documentType === "bank_letter") && extractedFields.ifscCode) {
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(extractedFields.ifscCode)) {
      warnings.push("IFSC code format may be incorrect. Please verify.");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
