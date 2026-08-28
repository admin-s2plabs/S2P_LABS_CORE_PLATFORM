import { Router, Request, Response } from "express";
import * as service from "./fmpi.service";
import * as repository from "./fmpi.repository";
import { fmpService, FmpRequest } from "./fmp-service";
import { logAudit } from "../administration/administration.service";
import { resolveRequestUser, requireAuth } from "../_shared/auth";

const router = Router();

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = resolveRequestUser(req);
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

const ALL_SOURCES = [
  "approved_po",
  "org_history",
  "supplier_quotation",
  "exportersindia",
  "made-in-china",
  "tradeindia",
  "regional_market",
];

function toCategoryCode(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

function toResponse(row: any) {
  const used = (row.sourcesUsedList || "").split(",").filter(Boolean);
  return { ...row, sourcesUsed: used, sourcesNA: ALL_SOURCES.filter((s) => !used.includes(s)) };
}

const DOC_TYPES = ["BID", "PR", "PO"] as const;

/**
 * When the caller identifies a document line (docType/docId/docLineId), publish
 * the freshly computed benchmark so it can be shown to suppliers and audited
 * later. Computation itself stays stateless — this is the published record, not
 * a cache, so a failure here must never fail the benchmark request.
 */
async function publishForDocLine(source: any, snapshot: any, userName: string) {
  const docType = String(source?.docType || "").toUpperCase();
  const docId = source?.docId;
  const docLineId = source?.docLineId;
  if (!DOC_TYPES.includes(docType as any) || !docId || docLineId === undefined || docLineId === null || docLineId === "") {
    return;
  }
  try {
    await repository.upsertSnapshot(
      { docType: docType as repository.FmpDocType, docId: String(docId), docLineId },
      snapshot,
      userName,
    );
  } catch (err: any) {
    console.error("[FMPI] Failed to publish snapshot for doc line:", err?.message);
  }
}

// ----------------------------------------------------------------------------
// FMPI Endpoints
// ----------------------------------------------------------------------------

router.get("/api/fmpi/snapshot", requireAuth, async (req, res) => {
  try {
    const { itemId, itemName, categoryCode, categoryName, currency, uom, itemDescription, description, deliveryLocation, location, delivery_location, quantity, itemQuantity } = req.query;
    if (!itemId || !currency) {
      return res.status(400).json({ error: "itemId and currency are required" });
    }
    const loc = (deliveryLocation || location || delivery_location || null) as string | null;
    const qtyRaw = quantity || itemQuantity;
    const qty = qtyRaw != null && qtyRaw !== "" ? parseFloat(String(qtyRaw)) : null;

    const row = await service.getOrComputeSnapshot({
      itemId: String(itemId),
      itemName: (itemName as string) || "",
      itemDescription: (itemDescription as string) || (description as string) || null,
      categoryCode: toCategoryCode(categoryCode),
      categoryName: (categoryName as string) || null,
      currCode: currency as string,
      uom: (uom as string) || null,
      deliveryLocation: loc,
      quantity: qty && Number.isFinite(qty) ? qty : null,
    });
    res.json(toResponse(row));
    await publishForDocLine(req.query, row, resolveRequestUser(req)?.name || "System");
  } catch (error: any) {
    console.error("Failed to get FMPI snapshot:", error);
    res.status(500).json({ error: error.message || "Failed to compute price benchmark" });
  }
});

router.post("/api/fmpi/recalculate", requireAuth, async (req, res) => {
  try {
    const { itemId, itemName, categoryCode, categoryName, currency, uom, itemDescription, description, deliveryLocation, location, delivery_location, quantity, itemQuantity } = req.body;
    if (!itemId || !currency) {
      return res.status(400).json({ error: "itemId and currency are required" });
    }
    const user = resolveRequestUser(req);
    const loc = (deliveryLocation || location || delivery_location || null) as string | null;
    const qtyRaw = quantity || itemQuantity;
    const qty = qtyRaw != null && qtyRaw !== "" ? parseFloat(String(qtyRaw)) : null;

    const row = await service.recalculate({
      itemId: String(itemId),
      itemName: itemName || "",
      itemDescription: itemDescription || description || null,
      categoryCode: toCategoryCode(categoryCode),
      categoryName: categoryName || null,
      currCode: currency,
      uom: uom || null,
      deliveryLocation: loc,
      quantity: qty && Number.isFinite(qty) ? qty : null,
      userName: user?.name || "System",
    });
    res.json(toResponse(row));
    await publishForDocLine(req.body, row, user?.name || "System");
    audit(req, String(itemId), "UPDATE", "FMP benchmark manually recalculated", "PROCUREMENT");
  } catch (error: any) {
    console.error("Failed to recalculate FMPI snapshot:", error);
    res.status(500).json({ error: error.message || "Failed to recalculate price benchmark" });
  }
});

// ----------------------------------------------------------------------------
// FMP Lookup Endpoints
// ----------------------------------------------------------------------------

router.post("/api/fmp/lookup", requireAuth, async (req: Request, res: Response) => {
  try {
    const { itemName, itemDescription, description, gtin, upc, ean, sku, productId, brand, model, categoryName, currency, region, uom, calculationMethod } = req.body;

    if (!itemName || typeof itemName !== "string" || !itemName.trim()) {
      return res.status(400).json({ error: "itemName is required" });
    }

    const descStr = (itemDescription || description || "").toString().trim();

    const fmpReq: FmpRequest = {
      itemName: itemName.trim(),
      itemDescription: descStr || undefined,
      gtin: gtin ? String(gtin).trim() : undefined,
      upc: upc ? String(upc).trim() : undefined,
      ean: ean ? String(ean).trim() : undefined,
      sku: sku ? String(sku).trim() : undefined,
      productId: productId ? String(productId).trim() : undefined,
      brand: brand ? String(brand).trim() : undefined,
      model: model ? String(model).trim() : undefined,
      categoryName: categoryName ? String(categoryName).trim() : undefined,
      currency: currency ? String(currency).trim() : "USD",
      region: region ? String(region).trim() : undefined,
      uom: uom ? String(uom).trim() : undefined,
      calculationMethod: calculationMethod || "median",
    };

    const result = await fmpService.getFairMarketPrice(fmpReq);
    return res.json(result);
  } catch (error: any) {
    console.error("[FmpController] FMP lookup failed:", error);
    return res.status(500).json({ error: "Internal server error during FMP lookup", details: error?.message });
  }
});

router.get("/api/fmp/lookup", requireAuth, async (req: Request, res: Response) => {
  try {
    const itemName = req.query.itemName as string;
    if (!itemName || !itemName.trim()) {
      return res.status(400).json({ error: "itemName query parameter is required" });
    }

    const descParam = (req.query.itemDescription || req.query.description || "").toString().trim();

    const fmpReq: FmpRequest = {
      itemName: itemName.trim(),
      itemDescription: descParam || undefined,
      gtin: req.query.gtin ? String(req.query.gtin).trim() : undefined,
      sku: req.query.sku ? String(req.query.sku).trim() : undefined,
      brand: req.query.brand ? String(req.query.brand).trim() : undefined,
      model: req.query.model ? String(req.query.model).trim() : undefined,
      categoryName: req.query.categoryName ? String(req.query.categoryName).trim() : undefined,
      currency: req.query.currency ? String(req.query.currency).trim() : "USD",
      calculationMethod: (req.query.calculationMethod as any) || "median",
    };

    const result = await fmpService.getFairMarketPrice(fmpReq);
    return res.json(result);
  } catch (error: any) {
    console.error("[FmpController] FMP query failed:", error);
    return res.status(500).json({ error: "Internal server error during FMP query", details: error?.message });
  }
});

export { router as fmpiController, router as fmpController };
