import { downloadFileFromAzure } from "./azure-blob.service";
import { getAIClient, getAIModelName } from "./ai-client";

const MAX_TEXT_PER_DOC = 6000; // chars kept per document
const MAX_TOTAL_TEXT = 20000; // overall cap fed to the model

export interface BidDocumentText {
  name: string;
  source: string;
  text: string;
}

async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require("pdf-parse/lib/pdf-parse.js");
  const parsed = await pdfParse(pdfBuffer);
  return (parsed.text || "").trim();
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || "").trim();
}

async function extractImageText(buffer: Buffer, mimeType: string): Promise<string> {
  const openai = await getAIClient();
  const model = await getAIModelName();
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an OCR engine. Transcribe ALL readable text from the image verbatim. Return only the extracted text, no commentary.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract all text from this document image:" },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` } },
        ],
      },
    ],
    max_tokens: 2048,
  });
  return (response.choices[0]?.message?.content || "").trim();
}

/**
 * Download every provided bid attachment from Azure and OCR/extract its readable
 * text. PDFs are parsed directly, Word docs (.docx/.doc) via mammoth, and images
 * go through a vision OCR pass. Anything unreadable is skipped. Failures on a
 * single document never abort the batch.
 */
export async function extractTextFromBidDocuments(attachments: any[]): Promise<BidDocumentText[]> {
  const results: BidDocumentText[] = [];
  let totalChars = 0;

  for (const att of attachments || []) {
    if (totalChars >= MAX_TOTAL_TEXT) break;

    const blobUrl = String(att?.attach_path || "");
    if (!blobUrl) continue;

    const mimeType = String(att?.attach_type || "").toLowerCase();
    const lowerUrl = blobUrl.toLowerCase();
    const isPdf = mimeType.includes("pdf") || lowerUrl.endsWith(".pdf");
    const isImage = mimeType.startsWith("image/");
    const isDocx =
      mimeType.includes("wordprocessingml") ||
      mimeType.includes("msword") ||
      lowerUrl.endsWith(".docx") ||
      lowerUrl.endsWith(".doc");
    if (!isPdf && !isImage && !isDocx) continue;

    try {
      const buffer = await downloadFileFromAzure(blobUrl);
      let text = "";
      if (isPdf) {
        text = await extractPdfText(buffer);
      } else if (isDocx) {
        text = await extractDocxText(buffer);
      } else {
        text = await extractImageText(buffer, mimeType || "image/png");
      }

      if (!text) continue;
      const clipped = text.slice(0, MAX_TEXT_PER_DOC);
      totalChars += clipped.length;
      results.push({
        name: String(att?.attach_name || "document"),
        source: String(att?.attach_source || "Lines"),
        text: clipped,
      });
    } catch (err: any) {
      console.error(`[Bid Document OCR] Failed to extract "${att?.attach_name}":`, err?.message);
    }
  }

  return results;
}

/** Flatten extracted document text into a single labeled string for a prompt. */
export function formatBidDocumentText(docs: BidDocumentText[]): string {
  if (!docs || docs.length === 0) return "";
  return docs
    .map((d) => {
      const label =
        d.source === "Requirements"
          ? "Evaluation Criteria Document"
          : d.source === "Lines"
            ? "Technical Specification Document"
            : `${d.source} Document`;
      return `--- ${label}: ${d.name} ---\n${d.text}`;
    })
    .join("\n\n");
}
