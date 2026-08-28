import "canvas";

// Polyfill DOMMatrix for pdfjs
if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init?: string | number[]) {
      // Simple identity matrix implementation
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
      if (typeof init === 'string') {
        // Parse transform string, but for simplicity, assume identity
      } else if (Array.isArray(init)) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
}
import { createCanvas, DOMMatrix as SkiaDOMMatrix, ImageData as SkiaImageData, Path2D as SkiaPath2D } from "@napi-rs/canvas";

// Match pdf.js Node expectations (see pdfjs-dist NodeCanvasFactory + polyfills).
if (!globalThis.DOMMatrix) {
  (globalThis as unknown as { DOMMatrix: typeof SkiaDOMMatrix }).DOMMatrix = SkiaDOMMatrix;
}
if (!globalThis.ImageData) {
  (globalThis as unknown as { ImageData: typeof SkiaImageData }).ImageData = SkiaImageData;
}
if (!globalThis.Path2D) {
  (globalThis as unknown as { Path2D: typeof SkiaPath2D }).Path2D = SkiaPath2D;
}

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;

type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>;

async function renderPageObjectToCanvas(page: PdfPage, scale: number) {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  const renderTask = page.render({
    canvasContext: context as any,
    canvas: canvas as any,
    viewport,
  });
  await renderTask.promise;
  return canvas;
}

async function renderPageToCanvas(pdfDocument: PdfDoc, pageNumber: number, scale: number) {
  const page = await pdfDocument.getPage(pageNumber);
  return renderPageObjectToCanvas(page, scale);
}

async function renderFirstPageToPng(pdfBuffer: Buffer, scale: number): Promise<Buffer | null> {
  const pdfData = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdfDocument = await loadingTask.promise;

  if (pdfDocument.numPages === 0) {
    return null;
  }

  const canvas = await renderPageToCanvas(pdfDocument, 1, scale);
  const buf = canvas.toBuffer("image/png");
  return buf.length > 0 ? buf : null;
}

const STACK_GAP_PX = 16;
/** Slightly lower than single-page so two stacked pages stay within typical vision image limits. */
const SCALE_STACKED_PAGE = 2.35;

/**
 * Page 1 + page 2 (if present) stacked vertically — use for document extraction when
 * turnover / schedules may appear after the first page.
 */
export async function renderPdfFirstTwoPagesStackedToPngBuffer(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    const pdfData = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDocument = await loadingTask.promise;
    if (pdfDocument.numPages === 0) return null;
    if (pdfDocument.numPages === 1) {
      const canvas = await renderPageToCanvas(pdfDocument, 1, 2.75);
      const buf = canvas.toBuffer("image/png");
      return buf.length > 0 ? buf : null;
    }

    const c1 = await renderPageToCanvas(pdfDocument, 1, SCALE_STACKED_PAGE);
    const c2 = await renderPageToCanvas(pdfDocument, 2, SCALE_STACKED_PAGE);
    const w = Math.max(c1.width, c2.width);
    const h = c1.height + STACK_GAP_PX + c2.height;
    const out = createCanvas(w, h);
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(c1 as any, 0, 0);
    ctx.drawImage(c2 as any, 0, c1.height + STACK_GAP_PX);
    const buf = out.toBuffer("image/png");
    return buf.length > 0 ? buf : null;
  } catch (error) {
    console.error("Error rendering stacked PDF pages:", error);
    return null;
  }
}

export async function generatePdfPreview(pdfBuffer: Buffer): Promise<string | null> {
  try {
    const buf = await renderFirstPageToPng(pdfBuffer, 1.5);
    if (!buf) return null;
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch (error) {
    console.error("Error generating PDF preview:", error);
    return null;
  }
}

/** First page → PNG bytes for server-side vision / OCR pipelines (no Ghostscript). */
export async function renderPdfFirstPageToPngBuffer(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    return await renderFirstPageToPng(pdfBuffer, 2.75);
  } catch (error) {
    console.error("Error rendering PDF page to PNG buffer:", error);
    return null;
  }
}

export interface RenderedPdfPage {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
}

export interface RenderedPdfPages {
  /** Pages in the source PDF, regardless of how many were rendered. */
  pageCount: number;
  pages: RenderedPdfPage[];
}

/**
 * Target width in pixels for an OCR page render. Line-item tables on a dense invoice are
 * only legible around this width; a fixed scale multiplier under-renders large page sizes
 * and over-renders small ones, so the scale is derived from the page's own width instead.
 */
const TARGET_OCR_PAGE_WIDTH = 2000;
const MIN_OCR_SCALE = 1.5;
const MAX_OCR_SCALE = 4;

function ocrScaleForWidth(unscaledWidth: number): number {
  if (!Number.isFinite(unscaledWidth) || unscaledWidth <= 0) return 2.5;
  const scale = TARGET_OCR_PAGE_WIDTH / unscaledWidth;
  return Math.min(MAX_OCR_SCALE, Math.max(MIN_OCR_SCALE, scale));
}

/**
 * Render every page (up to `maxPages`) to its own PNG so a document can be classified and
 * extracted page by page. `pageCount` always reports the real page total, so callers can
 * tell the difference between "3-page document" and "3 pages analysed".
 */
export async function renderPdfPagesToPngBuffers(
  pdfBuffer: Buffer,
  maxPages = 20
): Promise<RenderedPdfPages | null> {
  try {
    const pdfData = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDocument = await loadingTask.promise;
    const pageCount = pdfDocument.numPages;
    if (pageCount === 0) return null;

    const pages: RenderedPdfPage[] = [];
    const limit = Math.min(pageCount, Math.max(1, maxPages));
    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const scale = ocrScaleForWidth(page.getViewport({ scale: 1 }).width);
        const canvas = await renderPageObjectToCanvas(page, scale);
        const png = canvas.toBuffer("image/png");
        if (png.length > 0) {
          pages.push({ pageNumber, png, width: canvas.width, height: canvas.height });
        }
      } catch (pageError) {
        console.error(`Error rendering PDF page ${pageNumber} to PNG:`, pageError);
      }
    }

    return pages.length > 0 ? { pageCount, pages } : null;
  } catch (error) {
    console.error("Error rendering PDF pages to PNG buffers:", error);
    return null;
  }
}

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

/**
 * Text layer per page, used as the OCR fallback when rasterising fails. Keeping the page
 * boundaries (rather than one concatenated blob) is what lets the extractor tell a
 * continuation page apart from the start of a second invoice.
 */
export async function extractPdfPagesText(
  pdfBuffer: Buffer,
  maxPages = 20
): Promise<{ pageCount: number; pages: PdfPageText[] } | null> {
  try {
    const pdfData = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDocument = await loadingTask.promise;
    const pageCount = pdfDocument.numPages;
    if (pageCount === 0) return null;

    const pages: PdfPageText[] = [];
    const limit = Math.min(pageCount, Math.max(1, maxPages));
    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        pages.push({ pageNumber, text });
      } catch (pageError) {
        console.error(`Error reading text from PDF page ${pageNumber}:`, pageError);
        pages.push({ pageNumber, text: "" });
      }
    }

    return { pageCount, pages };
  } catch (error) {
    console.error("Error extracting PDF page text:", error);
    return null;
  }
}
