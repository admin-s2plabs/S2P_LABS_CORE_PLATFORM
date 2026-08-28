import archiver from "archiver";
import { sql } from "drizzle-orm";
import { Router, type RequestHandler } from "express";
import { db } from "../../db";
import { downloadFileFromAzure, streamFileFromAzure, uploadFileToAzure } from "../../services/azure-blob.service";
import * as bidAI from "../../services/bid-ai-service";
import { extractTextFromBidDocuments, formatBidDocumentText } from "../../services/bid-document-ocr";
import {
  resolveTechnicalEvalPersistedScore,
} from "../../services/technical-evaluation-engine";
import { getPersistedReviewRemark } from "@shared/technical-evaluation-remarks";
import type { TechnicalRequirementScore } from "@shared/technical-evaluation";
import { EventTypes } from "../../services/eventBus/events";
import { eventBus } from "../../services/eventBus/index";
import { getContextDb, getContextPool, rewrapTenantContext } from "../../tenant-context";
import { pool } from "../_shared";
import { requireAuth } from "../_shared/auth";
import { getTenantDomain } from "../_shared/db";
import { sanitizeFilename, upload } from "../_shared/file-upload";
import * as adminRepo from "../administration/administration.repository";
import { logAudit, normalizeAuditVendorTerminology } from "../administration/administration.service";
import * as repo from "./bids.repository";
import * as service from "./bids.service";
const getPool = () => getContextPool() ?? pool;
const getDb = () => getContextDb() ?? db;

const router = Router();
const uploadSingleFile: RequestHandler = upload.single("file") as unknown as RequestHandler;

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
  res.status(500).json({ error: error?.message || fallbackMessage });
}

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = (req as any).user;
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

async function assertTechnicalReviewerAccess(bidId: number, sessionUser: any): Promise<void> {
  const userId = sessionUser?.id || sessionUser?.userId;
  if (!userId) throw { status: 401, message: "User not authenticated" };
  const reviewApprover = await repo.getApproverStatus(bidId, userId, "Technical Review Team");
  if (!reviewApprover) {
    throw { status: 403, message: "Only Technical Review Team members can use AI technical scoring." };
  }
}

async function assertCommercialReviewerAccess(bidId: number, sessionUser: any): Promise<void> {
  const userId = sessionUser?.id || sessionUser?.userId;
  if (!userId) throw { status: 401, message: "User not authenticated" };
  const reviewApprover = await repo.getApproverStatus(bidId, userId, "Commercial Review Team");
  if (!reviewApprover) {
    throw { status: 403, message: "Only Commercial Review Team members can use AI commercial scoring." };
  }
}

// Negotiation may only be requested by the buyer who raised the bid (or a
// superadmin) — supp_bid_dtls.buyer stores the raiser's user_name, same field
// bid-view.tsx's isBidBuyer compares against for its own buyer-only actions.
async function assertBidBuyerAccess(bidId: number, sessionUser: any): Promise<void> {
  const role = sessionUser?.userRole;
  if (role === "ROLE_SUPERADMIN" || role === "SUPERADMIN") return;
  const bid = await repo.getDboBidById(bidId) as any;
  const buyer = String(bid?.buyer || "").trim().toLowerCase();
  const userName = String(sessionUser?.userName || sessionUser?.user_name || "").trim().toLowerCase();
  if (!buyer || !userName || buyer !== userName) {
    throw { status: 403, message: "Only the buyer who raised this bid can request negotiation." };
  }
}

router.get("/api/bids/mention-search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 8, 50);
    // Opt-in filter (negotiation start card's "Select Bid" step): RFQ/RFP/
    // Tender bids that are Closed and have at least one supplier response.
    // Other callers (general mention search) keep seeing every bid by default.
    const withResponses = req.query.withResponses === "1" || req.query.withResponses === "true";
    const responseFilter = withResponses
      ? sql`AND b.type IN ('RFQ', 'RFP', 'Tender')
             AND b.status = 'Closed'
             AND (
               SELECT COUNT(*) FROM (
                 SELECT DISTINCT ON (r.supplier_id) r.status
                 FROM dbo.supp_bid_response_dtls r
                 WHERE r.bidrefno = b.id
                 ORDER BY r.supplier_id, r.version DESC
               ) latest
               WHERE latest.status NOT IN ('Draft', 'Cancelled', 'Deleted')
             ) > 0`
      : sql``;
    const db = getDb();
    const result = await db.execute(
      q
        ? sql`SELECT b.id, b.attribute_4 AS bid_number, b.bid_title, b.type AS bid_type, b.status, b.delivertto_location_name, b.shiptoaddress
               FROM dbo.supp_bid_dtls b
               WHERE (b.attribute_4 ILIKE ${"%" + q + "%"} OR b.bid_title ILIKE ${"%" + q + "%"})
               ${responseFilter}
               ORDER BY b.id DESC
               LIMIT ${limit}`
        : sql`SELECT b.id, b.attribute_4 AS bid_number, b.bid_title, b.type AS bid_type, b.status, b.delivertto_location_name, b.shiptoaddress
               FROM dbo.supp_bid_dtls b
               WHERE TRUE
               ${responseFilter}
               ORDER BY b.id DESC
               LIMIT ${limit}`,
    );
    const rows: any[] = (result as any).rows || [];
    const bids = rows.map((row: any) => ({
      id: Number(row.id),
      bidNumber: String(row.bid_number || ""),
      bidTitle: row.bid_title ? String(row.bid_title) : null,
      bidType: row.bid_type ? String(row.bid_type) : null,
      bidStatus: row.status ? String(row.status) : null,
      deliveryLocation: row.delivertto_location_name || row.shiptoaddress ? String(row.delivertto_location_name || row.shiptoaddress) : null,
    }));
    res.json({ bids });
  } catch (error) {
    console.error("Failed to search bids for mention:", error);
    res.status(500).json({ error: "Failed to search bids" });
  }
});

router.get("/api/dbo/bids", async (req, res) => {
  try {
    const bids = await service.listDboBids();
    res.json(bids);
  } catch (error) {
    console.error("Failed to fetch dbo bids:", error);
    res.status(500).json({ error: "Failed to fetch bids" });
  }
});

router.get("/api/dbo/suppbids/pending", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const bids = await service.listSupplierPendingBids(sessionUser.supplierId);
    res.json(bids);
  } catch (error) {
    console.error("Failed to fetch supplier pending bids:", error);
    res.status(500).json({ error: "Failed to fetch supplier pending bids" });
  }
});

router.get("/api/dbo/suppbids", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const responses = await service.listSupplierBidResponses(sessionUser.supplierId);
    res.json(responses);
  } catch (error) {
    console.error("Failed to fetch supplier bid responses:", error);
    res.status(500).json({ error: "Failed to fetch supplier bid responses" });
  }
});

router.get("/api/dbo/suppbids/:id/view", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const bidId = parseInt(req.params.id);
    const invite = await service.getSupplierBidInvite(bidId, sessionUser.supplierId);
    if (!invite) {
      return res.status(403).json({ error: "You are not invited to this bid" });
    }
    const bid = await service.getDboBidDetail(bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });
    const existingResponse = await service.getBidResponseBySuppAndBid(sessionUser.supplierId, bidId);
    const lines = await service.getDboBidLines(bidId);
    res.json({ bid, invite, hasResponse: !!existingResponse, lines });
  } catch (error: any) {
    handleError(res, error, "Failed to fetch supplier bid view");
  }
});

/**
 * Published fair market price + range for a bid's lines, keyed by bid line id.
 * Returns `enabled: false` and no lines unless the buyer turned the FMPI
 * visibility toggle on for this bid.
 */
router.get("/api/dbo/suppbids/:id/fmp", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.getSupplierFmpForBid(
      req.params.id,
      sessionUser.supplierId,
    );
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch fair market price benchmark");
  }
});

router.post("/api/dbo/suppbids/:id/acknowledge", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.acknowledgeSupplierBid(
      parseInt(req.params.id),
      sessionUser.supplierId,
      req.body || {},
      sessionUser
    );
    res.json(result);
    audit(req, req.params.id, "UPDATE", `Supplier acknowledged bid as ${req.body?.acknowledgement_type || 'Participating'}`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to acknowledge bid");
  }
});

router.post("/api/dbo/suppbids/:id/decline", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.declineSupplierBid(parseInt(req.params.id), sessionUser.supplierId);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Supplier declined bid invitation", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to decline bid");
  }
});

router.get("/api/dbo/suppbids/response/:id", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.getBidResponseDetail(req.params.id, sessionUser.supplierId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bid response detail");
  }
});

router.put("/api/dbo/suppbids/response/:id/requirement/:reqId", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.saveBidResponseRequirement(req.params.id, parseInt(req.params.reqId), req.body, sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to save requirement response");
  }
});

router.put("/api/dbo/suppbids/response/:id/line/:lineId", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.saveBidResponseLine(req.params.id, parseInt(req.params.lineId), req.body, sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to save line response");
  }
});

router.put("/api/dbo/suppbids/response/:id/update-tax-included", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.updateResponseTaxIncluded(req.params.id, req.body, sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to update tax included");
  }
});

router.put("/api/dbo/suppbids/response/:id/totals", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.saveBidResponseTotals(req.params.id, req.body, sessionUser);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to save bid response totals");
  }
});

router.post("/api/dbo/suppbids/response/:id/submit", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) {
      return res.status(403).json({ error: "Supplier access required" });
    }
    const result = await service.submitBidResponse(req.params.id, req.body || {}, sessionUser);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Supplier submitted bid response", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to submit bid response");
  }
});

router.get("/api/dbo/suppbids/response/:id/attachments", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) return res.status(403).json({ error: "Supplier access required" });
    const attachments = await service.getSupplierResponseAttachments(req.params.id, sessionUser.supplierId);
    res.json(attachments);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch response attachments");
  }
});

router.post("/api/dbo/suppbids/response/:id/attachments", uploadSingleFile, rewrapTenantContext, async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) return res.status(403).json({ error: "Supplier access required" });
    const responseId = req.params.id;
    const file = req.file;
    let attachPath = "";
    let attachName = req.body.attach_name || "";
    let attachType = req.body.attach_type || "application/octet-stream";

    if (file) {
      const safeName = sanitizeFilename(file.originalname);
      attachPath = await uploadFileToAzure(file.buffer, `bids/responses/${responseId}`, safeName, file.mimetype, getTenantDomain(req) ?? undefined);
      attachName = file.originalname;
      attachType = file.mimetype;
    }

    const data = {
      attach_name: attachName,
      attach_desc: req.body.attach_desc || "",
      attach_type: attachType,
      attach_source: req.body.attach_source || "Lines",
      attach_path: attachPath,
    };
    const attachment = await service.addSupplierResponseAttachment(responseId, sessionUser.supplierId, data, sessionUser);
    res.status(201).json(attachment);
    audit(req, req.params.id, "CREATE", "Supplier added response attachment", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to add response attachment");
  }
});

router.get("/api/dbo/suppbids/response/:id/attachments/:attachId/download", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) return res.status(403).json({ error: "Supplier access required" });
    const attachment = await service.getSupplierResponseAttachmentById(parseInt(req.params.attachId), sessionUser.supplierId);
    if (!attachment || !(attachment as any).attach_path) {
      return res.status(404).json({ error: "File not found" });
    }
    res.setHeader("Content-Disposition", `attachment; filename="${String((attachment as any).attach_name)}"`);
    res.setHeader("Content-Type", String((attachment as any).attach_type || "application/octet-stream"));
    await streamFileFromAzure(String((attachment as any).attach_path), res);
  } catch (error: any) {
    handleError(res, error, "Failed to download response attachment");
  }
});

router.delete("/api/dbo/suppbids/response/:id/attachments/:attachId", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    if (!sessionUser.supplierId) return res.status(403).json({ error: "Supplier access required" });
    await service.deleteSupplierResponseAttachment(req.params.id, parseInt(req.params.attachId), sessionUser.supplierId);
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Supplier removed response attachment", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to delete response attachment");
  }
});

router.post("/api/dbo/bids", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const isUpdate = req.body.bid_ref_no && req.body.bid_ref_no !== '';
    const bid = await service.createDboBid(req.body, sessionUser);
    res.status(isUpdate ? 200 : 201).json(bid);
    if (isUpdate) {
      audit(req, String((bid as any).id), "UPDATE", "Bid Details Updated", "BIDS");
    } else {
      audit(req, String((bid as any).id), "CREATE", "New Bid Created", "BIDS");
    }
  } catch (error: any) {
    handleError(res, error, "Failed to create bid");
  }
});

router.post("/api/dbo/bids/create-from-pr/:prNumber", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const { prNumber } = req.params;
    const { templateId, bidType, openDate, closeDate, envelopeOpenDate } = req.body;
    const result = await service.createBidFromPR(prNumber, { templateId, bidType, openDate, closeDate, envelopeOpenDate }, sessionUser);
    res.status(201).json(result);
    audit(req, String(result.id), "CREATE", `Bid created from PR ${prNumber}`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to create bid from PR");
  }
});

router.delete("/api/dbo/bids/:id", async (req, res) => {
  try {
    await service.deleteDboBid(parseInt(req.params.id));
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Bid deleted", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to delete bid");
  }
});

router.get("/api/dbo/bids/:id", async (req, res) => {
  try {
    const bid = await service.getDboBidDetail(parseInt(req.params.id));
    if (!bid) return res.status(404).json({ error: "Bid not found" });
    res.json(bid);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bid detail");
  }
});

router.get("/api/dbo/bids/:id/status", async (req, res) => {
  try {
    console.log("ID:", req.params.id, parseInt(req.params.id));
    const bid = await service.getDboBidIdStatus(parseInt(req.params.id));
    if (!bid) return res.status(400).json({ error: "Bid not found" });
    res.json(bid);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bid status");
  }
});

router.post("/api/dbo/bids/:id/save-template", async (req, res) => {
  try {
    const { templateName } = req.body;
    if (!templateName || !templateName.trim()) {
      return res.status(400).json({ error: "Template name is required" });
    }
    const result = await service.saveAsTemplate(parseInt(req.params.id), templateName.trim(), (req as any).user);
    res.json(result);
    audit(req, req.params.id, "UPDATE", `Bid saved as template: ${templateName.trim()}`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to save as template");
  }
});

router.patch("/api/dbo/bids/:id", async (req, res) => {
  try {
    const result = await service.updateDboBidHeader(parseInt(req.params.id), req.body);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Bid header updated", "BIDS");
  } catch (error: any) {
    handleError(res, error, error.message || "Failed to update bid");
  }
});

router.get("/api/dbo/bids/:id/lines", async (req, res) => {
  try {
    const lines = await service.getDboBidLines(parseInt(req.params.id));
    res.json(lines);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bid lines");
  }
});

router.post("/api/dbo/bids/:id/lines", async (req, res) => {
  try {
    const line = await service.addDboBidLine(parseInt(req.params.id), req.body, (req as any).user);
    res.status(201).json(line);
    audit(req, req.params.id, "CREATE", "Bid line added", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to add bid line");
  }
});

router.put("/api/dbo/bids/:id/lines/:lineId", async (req, res) => {
  try {
    const line = await service.updateDboBidLine(parseInt(req.params.lineId), req.body, (req as any).user);
    res.json(line);
    audit(req, req.params.id, "UPDATE", "Bid line updated", "BIDS");
  } catch (error: any) {
    handleError(res, error, error.message || "Failed to update bid line");
  }
});

router.delete("/api/dbo/bids/:id/lines/:lineId", async (req, res) => {
  try {
    await service.deleteDboBidLine(parseInt(req.params.lineId));
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Bid line deleted", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to delete bid line");
  }
});

router.get("/api/dbo/bids/:id/suppliers", async (req, res) => {
  try {
    const suppliers = await service.getDboBidSuppliers(parseInt(req.params.id));
    res.json(suppliers);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bid suppliers");
  }
});

router.get("/api/dbo/bids/:id/acknowledgements", async (req, res) => {
  try {
    const acks = await service.getBidAckDetails(parseInt(req.params.id));
    res.json(acks);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bid acknowledgements");
  }
});

router.get("/api/dbo/bids/:id/responses", async (req, res) => {
  try {
    const responses = await service.getBidResponseDetails(parseInt(req.params.id));
    res.json(responses);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bid responses");
  }
});

router.post("/api/dbo/bids/:id/suppliers", async (req, res) => {
  try {
    const supplier = await service.addDboBidSupplier(parseInt(req.params.id), req.body, (req as any).user);
    const orgData = await adminRepo.getOrgDetails();
    const bid = await repo.getDboBidDetailById(parseInt(req.params.id));
    if ((supplier as any)?.supplier_contact_email) {
      eventBus.publish({
        eventType: EventTypes.NEW_BID_PUBLISH,
        bidId: req.params.id,
        bidNumber: (bid as any).attribute_4 || "",
        bidTitle: (bid as any).bid_title || "",
        receiverEmail: (supplier as any).supplier_contact_email || "",
        supplierName: (supplier as any).supplier_name || "",
        timestamp: new Date(),
        domain: (req as any).user?.domain,
        orgLogoPath: orgData.org_logo_path,
      });
    }
    res.status(201).json(supplier);
    audit(req, req.params.id, "CREATE", "Supplier invited to bid", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to add supplier");
  }
});

router.delete("/api/dbo/bids/:id/suppliers/:suppId", async (req, res) => {
  try {
    await service.deleteDboBidSupplier(parseInt(req.params.suppId));
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Supplier removed from bid", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to remove supplier");
  }
});

router.get("/api/dbo/bids/:id/requirements", async (req, res) => {
  try {
    const reqs = await service.getDboBidRequirements(parseInt(req.params.id));
    res.json(reqs);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch requirements");
  }
});

router.post("/api/dbo/bids/:id/requirements", async (req, res) => {
  try {
    const req2 = await service.addDboBidRequirement(parseInt(req.params.id), req.body, (req as any).user);
    res.status(201).json(req2);
    audit(req, req.params.id, "CREATE", "Evaluation criteria added", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to add requirement");
  }
});

router.put("/api/dbo/bids/:id/requirements/:reqId", async (req, res) => {
  try {
    const result = await service.updateDboBidRequirement(parseInt(req.params.reqId), req.body, (req as any).user);
    res.json(result);
    audit(req, req.params.id, "UPDATE", "Evaluation criteria updated", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to update requirement");
  }
});

router.delete("/api/dbo/bids/:id/requirements/:reqId", async (req, res) => {
  try {
    await service.deleteDboBidRequirement(parseInt(req.params.reqId));
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Evaluation criteria removed", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to delete requirement");
  }
});

router.get("/api/dbo/bids/:id/clauses", async (req, res) => {
  try {
    const clauses = await service.getDboBidClauses(parseInt(req.params.id));
    res.json(clauses);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch clauses");
  }
});

router.post("/api/dbo/bids/:id/clauses", async (req, res) => {
  try {
    const clause = await service.addDboBidClause(parseInt(req.params.id), req.body, (req as any).user);
    res.status(201).json(clause);
    audit(req, req.params.id, "CREATE", "Clause added to bid", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to add clause");
  }
});

router.delete("/api/dbo/bids/:id/clauses/:clauseId", async (req, res) => {
  try {
    await service.deleteDboBidClause(parseInt(req.params.clauseId));
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Clause removed from bid", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to delete clause");
  }
});

router.post("/api/dbo/bids/:bidRefNo/team", async (req, res) => {
  try {
    const bidRefNo = parseInt(req.params.bidRefNo);
    const { bid_apprs_list, bid_team_type } = req.body;
    if (!bid_apprs_list || !bid_team_type) {
      return res.status(400).json({ error: "bid_apprs_list and bid_team_type are required" });
    }
    const result = await service.processNewBidTeam(bidRefNo, bid_apprs_list, bid_team_type);
    if (result.startsWith('Failure')) {
      return res.status(400).json({ error: result });
    }
    res.json({ message: result });
    audit(req, String(bidRefNo), "ADDED", `Added Approval Team in Bid ${bid_apprs_list}`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to add bid team");
  }
});

router.get("/api/dbo/bids/:id/approvers", async (req, res) => {
  try {
    const approvers = await service.getDboBidApprovers(parseInt(req.params.id));
    res.json(approvers);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch approvers");
  }
});

router.delete("/api/dbo/bids/:id/approvers/:approverId", async (req, res) => {
  try {
    await service.deleteDboBidApprover(parseInt(req.params.approverId));
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Approver removed from bid", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to remove approver");
  }
});

router.get("/api/dbo/bids/:id/attachments", async (req, res) => {
  try {
    const attachments = await service.getDboBidAttachments(parseInt(req.params.id));
    res.json(attachments);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch attachments");
  }
});

router.post("/api/dbo/bids/:id/attachments", uploadSingleFile, rewrapTenantContext, async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    const file = req.file;
    let attachPath = "";
    let attachName = req.body.attach_name || "";
    let attachType = req.body.attach_type || "application/octet-stream";

    if (file) {
      const safeName = sanitizeFilename(file.originalname);
      attachPath = await uploadFileToAzure(file.buffer, `bids/${bidId}`, safeName, file.mimetype, getTenantDomain(req) ?? undefined);
      attachName = file.originalname;
      attachType = file.mimetype;
    }

    const data = {
      attach_name: attachName,
      attach_desc: req.body.attach_desc || "",
      attach_type: attachType,
      attach_source: req.body.attach_source || "Lines",
      attach_path: attachPath,
    };
    const attachment = await service.addDboBidAttachment(bidId, data, (req as any).user);
    res.status(201).json(attachment);
    audit(req, req.params.id, "CREATE", "Attachment added to bid", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to add attachment");
  }
});

router.get("/api/dbo/bids/response/attachments/:attachId/download", async (req, res) => {
  try {
    const att = await service.getBidResponseAttachmentForBuyer(parseInt(req.params.attachId));
    if (!att || !(att as any).attach_path) {
      return res.status(404).json({ error: "File not found" });
    }
    res.setHeader("Content-Disposition", `attachment; filename="${String((att as any).attach_name)}"`);
    res.setHeader("Content-Type", String((att as any).attach_type || "application/octet-stream"));
    await streamFileFromAzure(String((att as any).attach_path), res);
  } catch (error: any) {
    handleError(res, error, "Failed to download response attachment");
  }
});

router.get("/api/dbo/bids/:id/attachments/:attachId/download", async (req, res) => {
  try {
    const bidId = Number(req.params.id);
    const attachId = Number(req.params.attachId);
    if (Number.isNaN(bidId) || Number.isNaN(attachId)) {
      return res.status(400).json({ error: "Invalid bid or attachment id" });
    }
    const attachments = await service.getDboBidAttachments(bidId);
    const attachment = attachments.find((a: any) => a.id === attachId);
    if (!attachment || !attachment.attach_path) {
      return res.status(404).json({ error: "File not found" });
    }
    res.setHeader("Content-Disposition", `attachment; filename="${String(attachment.attach_name)}"`);
    res.setHeader("Content-Type", String(attachment.attach_type || "application/octet-stream"));
    await streamFileFromAzure(String(attachment.attach_path), res);
  } catch (error: any) {
    handleError(res, error, "Failed to download attachment");
  }
});

router.get("/api/dbo/approved-suppliers", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string) || "";
    const category = (req.query.category as string) || "";
    const result = await service.getApprovedSuppliersList(page, limit, search, category);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch approved suppliers");
  }
});

router.delete("/api/dbo/bids/:id/attachments/:attachId", async (req, res) => {
  try {
    await service.deleteDboBidAttachment(parseInt(req.params.attachId));
    res.status(204).send();
    audit(req, req.params.id, "DELETE", "Attachment removed from bid", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to delete attachment");
  }
});

router.post("/api/dbo/bids/:id/publish", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const result = await service.publishDboBid(bidId, req.body, (req as any).user);
    res.json(result);
    audit(req, req.params.id, "PUBLISH", "Bid published to suppliers", "BIDS");
  } catch (error: any) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    handleError(res, error, "Failed to publish bid");
  }
});

/** Legacy Spring processBidApprovalStep — query: result, comments, bidRefNo */
router.post("/api/dbo/bids/processBidApprovalStep/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const result =
      (req.query.result as string) ?? (req.body as any)?.result;
    const comments =
      (req.query.comments as string) ?? (req.body as any)?.comments ?? "";
    const bidRefNoRaw =
      (req.query.bidRefNo as string) ?? (req.body as any)?.bidRefNo;
    const sessionUser = (req as any).user || {};

    if (!result || bidRefNoRaw === undefined || bidRefNoRaw === null || bidRefNoRaw === "") {
      return res.status(400).json({
        success: false,
        message: "result and bidRefNo are required",
      });
    }

    const bidRefNo = parseInt(String(bidRefNoRaw), 10);
    if (isNaN(bidRefNo)) {
      return res.status(400).json({ success: false, message: "Invalid bidRefNo" });
    }

    const response = await service.processBidPublishApprovalStep(
      taskId,
      result,
      comments,
      bidRefNo,
      sessionUser,
    );
    res.json(response);
    audit(
      req,
      String(bidRefNo),
      result === "Approved" ? "APPROVE" : "REJECT",
      `Bid publish approval ${result} (task ${taskId})`,
      "BIDS",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to process bid publish approval step");
  }
});

router.get("/api/bids/:id/audit-logs", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 5;
    const offset = (page - 1) * limit;

    const countResult = await getPool().query(`
      SELECT COUNT(*) as total FROM dbo.am_audit_log
      WHERE audit_key = $1 AND module = 'BIDS'
    `, [req.params.id]);

    const result = await getPool().query(`
      SELECT id, audit_key, audit_action, audit_date, audit_message, full_name, user_id
      FROM dbo.am_audit_log
      WHERE audit_key = $1 AND module = 'BIDS'
      ORDER BY audit_date ASC
      LIMIT $2 OFFSET $3
    `, [req.params.id, limit, offset]);

    res.json({
      records: result.rows.map(normalizeAuditVendorTerminology),
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
    });
  } catch (error: any) {
    handleError(res, error, "Failed to fetch audit logs");
  }
});

router.post("/api/workflows/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    const workflow = await service.generateWorkflow(prompt);
    res.json(workflow);
  } catch (error: any) {
    handleError(res, error, "Failed to generate workflow");
  }
});

router.get("/api/dbo/bids/response/:responseId/detail", async (req, res) => {
  try {
    const responseId = req.params.responseId;
    const result = await service.getBidResponseDetailForBuyer(responseId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch bid response detail");
  }
});

router.get("/api/dbo/bids/:id/documents/download", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    const docType = req.query.type as string;
    if (!docType || !["technical", "financial"].includes(docType)) {
      return res.status(400).json({ error: "Invalid document type. Must be 'technical' or 'financial'" });
    }

    const sourceTypes = docType === "technical"
      ? ["Technical", "Technical-line"]
      : ["Financial", "Commercial", "Commercial-line"];

    const attachments = await repo.getResponseAttachmentsByBidAndSource(bidId, sourceTypes);
    if (!attachments || attachments.length === 0) {
      return res.status(404).json({ error: `No ${docType} documents found for this bid` });
    }

    const archive = archiver("zip", { zlib: { level: 5 } });
    const label = docType === "technical" ? "Technical_Documents" : "Financial_Documents";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="BID_${bidId}_${label}.zip"`);
    archive.pipe(res);

    const skipped: string[] = [];

    for (const att of attachments as any[]) {
      try {
        const fileBuffer = await downloadFileFromAzure(String(att.attach_path));
        const supplierFolder = (att.supplier_name || `Supplier_${att.supplier_id}`).replace(/[^a-zA-Z0-9_\- ]/g, "_").trim();
        archive.append(fileBuffer, { name: `${supplierFolder}/${att.attach_name}` });
      } catch (err: any) {
        console.error(`[BidZip] Failed to fetch attachment "${att.attach_name}" (id=${att.id}):`, err?.message);
        skipped.push(att.attach_name);
      }
    }

    if (skipped.length > 0) {
      const notice = `The following files could not be retrieved and were excluded from this archive:\n\n${skipped.map(f => `  - ${f}`).join("\n")}\n`;
      archive.append(notice, { name: "MISSING_FILES.txt" });
    }

    await archive.finalize();
  } catch (error: any) {
    if (!res.headersSent) {
      handleError(res, error, "Failed to download documents");
    }
  }
});

router.post("/api/dbo/bids/:id/request-negotiation", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    const sessionUser = (req as any).user || {};
    await assertBidBuyerAccess(bidId, sessionUser);
    const { supplierIds: rawSupplierIds, openDate, closeDate, envOpenDate, comments } = req.body;

    const supplierIds: number[] = Array.isArray(rawSupplierIds)
      ? rawSupplierIds.map((id: any) => parseInt(String(id))).filter((id: number) => !isNaN(id) && id > 0)
      : typeof rawSupplierIds === 'string'
        ? rawSupplierIds.split(',').map((s: string) => parseInt(s.trim())).filter((id: number) => !isNaN(id) && id > 0)
        : [];

    if (supplierIds.length === 0) {
      return res.status(400).json({ error: "At least one supplier must be selected" });
    }
    if (!openDate || !closeDate || !comments?.trim()) {
      return res.status(400).json({ error: "Open date, close date, and comments are required" });
    }

    if (!service.isDateNotPast(openDate)) {
      return res.status(400).json({ error: "Open date must be today's date with future time or a future date" });
    }

    const openDateParsed = new Date(openDate);
    const closeDateParsed = new Date(closeDate);
    if (closeDateParsed <= openDateParsed) {
      return res.status(400).json({ error: "Close date must be after the open date" });
    }

    await repo.requestNegotiation(bidId, {
      supplierIds,
      openDate,
      closeDate,
      envOpenDate: envOpenDate || '',
      comments,
      userId: sessionUser.id,
      userEmail: sessionUser.userName || sessionUser.user_name || sessionUser.email,
    });

    res.json({ success: true, message: "Request for Negotiation successfully initiated" });

    const bid = await service.getDboBidDetail(bidId) as any;
    const bidSuppliers = await repo.getDboBidSuppliers(bidId);
    const orgData = await adminRepo.getOrgDetails();

    for (const suppId of supplierIds) {
      const bidSupp = bidSuppliers.find((s: any) => s.supplier_id === suppId) as any;
      const vendorName = bidSupp?.supplier_name || `Supplier ${suppId}`;
      const vendorEmail = bidSupp?.supplier_contact_email || "";

      eventBus.publish({
        eventType: EventTypes.BID_NEGO_INVITE,
        bidId: String(bidId),
        bidNumber: bid?.attribute_4 || "",
        bidTitle: bid?.bid_title || "",
        vendorName: vendorName,
        receiverEmail: vendorEmail,
        timestamp: new Date(),
        domain: (req as any).user?.domain,
        orgLogoPath: orgData.org_logo_path,
      });
      audit(req, String(bidId), "UPDATE", `Negotiation called for supplier ${suppId}`, "BIDS");
    }
  } catch (error: any) {
    handleError(res, error, "Failed to request negotiation");
  }
});

router.get("/api/dbo/bids/:id/evaluate", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    const sessionUser = (req as any).user || {};
    const scoredByIdentifiers = [
      sessionUser.userName,
      sessionUser.user_name,
      sessionUser.email,
      sessionUser.userId
    ].filter(Boolean);
    const uniqueIdentifiers = Array.from(new Set(scoredByIdentifiers));
    await service.checkAndOpenEnvelope(bidId, sessionUser);
    const bid = await service.getDboBidDetail(bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });
    const [evalData, awards] = await Promise.all([
      service.getBidEvaluationData(bidId, uniqueIdentifiers.length > 0 ? uniqueIdentifiers : undefined),
      repo.getAwardsByBidRefNo(bidId)
    ]);
    if(awards.length > 0){
    const awardLines = await repo.getAwardLinesByAwardId(Number(awards[0]?.id));
      const allLinesHavePo = awardLines.every((l: any) => l.po_number != null && l.po_number !== "");
      res.json({ bid,allLinesHavePo, ...evalData, awards ,awardLines});
    }else{
      res.json({ bid, ...evalData, awards });
    }
  } catch (error: any) {
    handleError(res, error, "Failed to fetch evaluation data");
  }
});

router.post("/api/dbo/bids/:id/evaluate/open-envelope", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    const sessionUser = (req as any).user || {};
    const result = await service.openEnvelope(bidId, sessionUser);
    if (result) {
      return res.json({ success: true, message: "Envelope opened successfully" });
    } else {
      return res.status(403).json({
        error: "Only assigned Committee Team members can open this envelope.",
      });
    }
  } catch (error: any) {
    handleError(res, error, "Failed to check and open envelope");
  }
});

router.put("/api/dbo/bids/:id/evaluate/response/:responseId/score", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const responseId = req.params.responseId;
    await service.updateResponseScore(responseId, {
      ...req.body,
      last_modified_by: sessionUser.email || sessionUser.userId || "System"
    });
    res.json({ success: true });
    audit(req, req.params.responseId, "UPDATE", `Updated evaluation score for response`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to update response score");
  }
});

router.post("/api/dbo/bids/:id/store-evaluation", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    const sessionUser = (req as any).user || {};
    const loggedInUser = sessionUser.userName || sessionUser.email || sessionUser.userId || "System";
    const lastModifiedBy = sessionUser.email || sessionUser.userId || "System";
    const evalDataList: any[] = req.body;

    if (!Array.isArray(evalDataList) || evalDataList.length === 0) {
      return res.status(400).json({ error: "Evaluation data array is required" });
    }

    const evalMap = new Map<string, any>();
    for (const item of evalDataList) {
      const key = String(item.bidRespId);
      if (!evalMap.has(key)) {
        evalMap.set(key, item);
      }
    }

    for (const [respId, evalItem] of Array.from(evalMap.entries())) {
      const updateData: any = {
        last_modified_by: lastModifiedBy,
      };

      if (evalItem.techEvalComments !== undefined) updateData.eval_comments = evalItem.techEvalComments;
      if (evalItem.techRecmd !== undefined) {
        updateData.recommended = evalItem.techRecmd;
        if (evalItem.techRecmd === "Y") {
          updateData.recommend_by = loggedInUser;
          if (evalItem.techRecmdComments !== undefined) updateData.recommend_comments = evalItem.techRecmdComments;
        }
      }
      if (evalItem.finEvalComments !== undefined) updateData.fin_eval_comments = evalItem.finEvalComments;
      if (evalItem.finRecmd !== undefined) {
        updateData.fin_recommended = evalItem.finRecmd;
        if (evalItem.finRecmd === "Y") {
          updateData.fin_recommend_by = loggedInUser;
          if (evalItem.finRecmdComments !== undefined) updateData.fin_recommend_comments = evalItem.finRecmdComments;
        }
      }

      await service.updateResponseScore(respId, updateData);
    }

    res.json({ success: true });
    audit(req, String(bidId), "UPDATE", "Bid Responses Evaluated", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to store evaluation");
  }
});

router.get("/api/dbo/bids/:id/awards", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    const bid = await service.getDboBidDetail(bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });
    const awards = await repo.getAwardsWithLinesByBidRefNo(bidId);
    let committeeApprovers: any[] = [];
    
     await repo.getCommitteeApprovers(bidId);
    const approvalHistoryMap: Record<number, any[]> = {};
    for (const award of awards) {
      if (award.status && award.status !== "Draft") {
        committeeApprovers = await repo.getCommitteeApprovers(bidId);
        const history = await repo.getAwardApprovalHistory(award.id);
        if (history.length > 0) {
          approvalHistoryMap[award.id] = history;
        }
      }
    }
    res.json({ bid, awards, committeeApprovers, approvalHistoryMap });
  } catch (error: any) {
    handleError(res, error, "Failed to fetch award details");
  }
});

router.get("/api/dbo/bids/awards/:awardId/award-details", async (req, res) => {
  try {
    const awardId = parseInt(req.params.awardId);
    if (Number.isNaN(awardId)) {
      return res.status(400).json({ error: "Invalid award id" });
    }

    const result = await service.awardDetailsById(awardId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to initialize bid award");
  }
});

router.post("/api/dbo/bids/:id/award", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    const sessionUser = (req as any).user || {};
    const createdBy = sessionUser.email || sessionUser.userId || "System";
    const { awardSupplierId, awardComments } = req.body;

    if (!awardSupplierId) {
      return res.status(400).json({ error: "Award supplier is required" });
    }
    if (!awardComments || !awardComments.trim()) {
      return res.status(400).json({ error: "Award comments are required" });
    }

    const result = await service.awardBid(bidId, awardSupplierId, awardComments.trim(), createdBy);

    res.json({ success: true, awardId: result.awardId, grossTotal: result.grossTotal, amountInWords: result.amountInWords });
    audit(req, String(bidId), "UPDATE", `Award created for bid. Award ID: ${result.awardId}`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to award bid");
  }
});

router.post("/api/dbo/bids/awards/:awardId/submit", async (req, res) => {
  try {
    const awardId = parseInt(req.params.awardId);
    const sessionUser = (req as any).user || {};
    const { awardNotes } = req.body || {};

    const result = await service.submitBidAward(awardId, awardNotes || "", sessionUser);

    res.json(result);
    audit(req, String(awardId), "UPDATE", `Award ${awardId} submitted for approval`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to submit bid award");
  }
});

router.post("/api/dbo/bids/awards/:awardId/accept", async (req, res) => {
  try {
    const awardId = parseInt(req.params.awardId);
    const sessionUser = (req as any).user || {};

    const result = await service.acceptBidAward(awardId, sessionUser);

    res.json(result);
    audit(req, String(awardId), "APPROVE", `Award ${awardId} accepted by committee member`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to accept bid award");
  }
});

router.post("/api/dbo/bids/awards/process-approval", async (req, res) => {
  try {
    const { taskId, result, comments, bidAwardId } = req.body;
    const sessionUser = (req as any).user || {};

    if (!taskId || !result || !bidAwardId) {
      return res.status(400).json({ success: false, message: "taskId, result, and bidAwardId are required" });
    }

    const response = await service.processAwardApproval(
      taskId,
      result,
      comments || "",
      parseInt(bidAwardId),
      sessionUser
    );

    res.json(response);
    audit(req, String(bidAwardId), result === "Approved" ? "APPROVE" : "REJECT", `Award ${bidAwardId} ${result}`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to process award approval");
  }
});

router.post("/api/dbo/bids/awards/:awardId/reject", async (req, res) => {
  try {
    const awardId = parseInt(req.params.awardId);
    const sessionUser = (req as any).user || {};

    const result = await service.rejectBidAward(awardId, sessionUser);

    res.json(result);
    audit(req, String(awardId), "REJECT", `Award ${awardId} rejected by committee team`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to reject bid award");
  }
});

router.post("/api/dbo/bids/awards/:awardId/cancel", async (req, res) => {
  try {
    const awardId = parseInt(req.params.awardId);
    const sessionUser = (req as any).user || {};

    await repo.cancelBidAward(awardId, sessionUser);

    res.json({ success: true, message: `Award ${awardId} cancelled successfully` });
    audit(req, String(awardId), "CANCEL", `Bid Award ${awardId} Cancelled`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to cancel bid award");
  }
});

router.post("/api/dbo/bids/:id/evaluate/requirement-score", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    await service.upsertRequirementScore({
      ...req.body,
      scored_by: sessionUser.userName || sessionUser.user_name || sessionUser.userId || "System",
      scored_by_name: sessionUser.name || sessionUser.userName || "System"
    });
    res.json({ success: true });
    audit(req, String(req.body.bid_resp_req_id), "UPDATE", `Scored requirement for response`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to save requirement score");
  }
});

router.get("/api/dbo/bids/response/:responseId/my-scores", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const responseId = req.params.responseId;
    const scoredByIdentifiers = [
      sessionUser.userName, sessionUser.user_name, sessionUser.email, sessionUser.userId
    ].filter(Boolean);
    const scoredBy = Array.from(new Set(scoredByIdentifiers));
    const scores = await service.getUserScoresForResponse(responseId, scoredBy);
    res.json(scores);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch user scores");
  }
});

router.post("/api/dbo/bids/response/requirement/:respReqId/score", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const respReqId = parseInt(req.params.respReqId);
    const { score } = req.body;
    if (score === undefined || score === null) {
      return res.status(400).json({ error: "Score is required" });
    }
    const result = await service.updateBidReqScore(
      respReqId,
      String(score),
      sessionUser.userName || sessionUser.user_name || sessionUser.userId || "System",
      sessionUser.name || sessionUser.userName || "System",
      sessionUser.id
    );
    res.json({ success: true, ...result });
    audit(req, String(respReqId), "UPDATE", `Updated score for requirement`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to update requirement score");
  }
});

router.post("/api/dbo/bids/response/:respId/commercial-price-score", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const respId = req.params.respId;
    const { score, remarks } = req.body;
    if (score === undefined || score === null) {
      return res.status(400).json({ error: "Score is required" });
    }
    const result = await service.updateCommercialPriceScore(
      respId,
      String(score),
      sessionUser.userName || sessionUser.user_name || sessionUser.userId || "System",
      sessionUser.name || sessionUser.userName || "System",
      sessionUser.id,
      remarks
    );
    res.json({ success: true, ...result });
    audit(req, String(respId), "UPDATE", `Updated commercial price score`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to update commercial price score");
  }
});

router.post("/api/dbo/bids/response/requirement/:respReqId/comments", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const respReqId = parseInt(req.params.respReqId);
    const { comments } = req.body;
    if (comments === undefined || comments === null) {
      return res.status(400).json({ error: "Comments are required" });
    }
    await service.updateBidReqComments(
      respReqId,
      String(comments),
      sessionUser.userName || sessionUser.user_name || sessionUser.userId || "System",
      sessionUser.name || sessionUser.userName || "System",
      sessionUser.id
    );
    res.json({ success: true });
    audit(req, String(respReqId), "UPDATE", `Updated comments for requirement`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to update requirement comments");
  }
});

/**
 * Buyer toggle: publish the fair market price benchmark to invited suppliers.
 * Turning it on kicks off a detached backfill of any line that has never been
 * benchmarked, so `pendingBenchmarks` tells the UI how many are still coming.
 */
router.put("/api/dbo/bids/:bidId/fmp-visibility", requireAuth, async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const bidIdParam = req.params.bidId;
    if (!bidIdParam) return res.status(400).json({ message: "Invalid bid ID" });

    const { enabled, showFmpToSupplier } = req.body ?? {};
    const isEnabled = typeof enabled === "boolean" ? enabled : showFmpToSupplier === true;

    const result = await service.setFmpVisibility(bidIdParam, isEnabled, sessionUser);
    audit(
      req,
      String(bidIdParam),
      "UPDATE",
      `FMPI benchmark ${isEnabled ? "shown to" : "hidden from"} suppliers`,
      "BIDS",
    );
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to update FMPI visibility");
  }
});

router.post("/api/dbo/bids/:bidId/submit-tech-score", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const bidId = parseInt(req.params.bidId);
    if (!bidId) return res.status(400).json({ message: "Invalid bid ID" });

    const userId = sessionUser.id || sessionUser.userId;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    const result = await service.submitTechScore(bidId, userId,sessionUser);
    res.json(result);
    audit(req, String(bidId), "UPDATED", "Technical score submit.", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to submit technical scores");
  }
});

router.get("/api/dbo/bids/:bidId/score-status", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const bidId = parseInt(req.params.bidId);
    const userId = sessionUser.id || sessionUser.userId;
    if (!bidId || !userId) return res.json({ submitted: false, approved: false, techScoreComplete: false, userTeams: [] });

    const reviewApprover = await repo.getApproverStatus(bidId, userId, "Technical Review Team");
    const approveApprover = await repo.getApproverStatus(bidId, userId, "Technical Approve Team");
    const bidStatus = await repo.getTechScoreApprovalStatus(bidId) as any;
    const commercialReviewer = await repo.getApproverStatus(bidId, userId, "Commercial Review Team");
    const commercialApprover = await repo.getApproverStatus(bidId, userId, "Commercial Approve Team");

    const userTeams: string[] = [];
    if (reviewApprover) userTeams.push("Technical Review Team");
    if (approveApprover) userTeams.push("Technical Approve Team");
    if (commercialReviewer) userTeams.push("Commercial Review Team");
    if (commercialApprover) userTeams.push("Commercial Approve Team");

    res.json({
      submitted: (reviewApprover as any)?.score_submitted === "Y",
      approved: bidStatus?.techscoreapproved === "Y",
      techScoreComplete: bidStatus?.tech_score_complete === "Y",
      userTeams,
    });
  } catch (error: any) {
    handleError(res, error, "Failed to fetch score status");
  }
});

router.post("/api/dbo/bids/:bidId/approve-tech-score", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const bidId = parseInt(req.params.bidId);
    if (!bidId) return res.status(400).json({ message: "Invalid bid ID" });

    const userId = sessionUser.id || sessionUser.userId;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    const result = await service.approveTechScore(bidId, userId,sessionUser);
    res.json(result);
    if (result.status === "success") {
      audit(req, String(bidId), "UPDATED", " Technicial score approved. ", "BIDS");
    }
  } catch (error: any) {
    handleError(res, error, "Failed to approve technical scores");
  }
});

router.post("/api/dbo/bids/:bidId/submit-comm-score", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const bidId = parseInt(req.params.bidId);
    if (!bidId) return res.status(400).json({ message: "Invalid bid ID" });

    const userId = sessionUser.id || sessionUser.userId;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    const result = await service.submitCommScore(bidId, userId,sessionUser);
    res.json(result);
    audit(req, String(bidId), "UPDATED", "Commercial score submit.", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to submit commercial scores");
  }
});

router.get("/api/dbo/bids/:bidId/comm-score-status", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const bidId = parseInt(req.params.bidId);
    const userId = sessionUser.id || sessionUser.userId;
    if (!bidId || !userId) return res.json({ submitted: false, approved: false, commScoreComplete: false, userTeams: [] });

    const reviewApprover = await repo.getApproverStatus(bidId, userId, "Commercial Review Team");
    const approveApprover = await repo.getApproverStatus(bidId, userId, "Commercial Approve Team");
    const bidStatus = await repo.getCommScoreApprovalStatus(bidId) as any;

    const userTeams: string[] = [];
    if (reviewApprover) userTeams.push("Commercial Review Team");
    if (approveApprover) userTeams.push("Commercial Approve Team");

    res.json({
      submitted: (reviewApprover as any)?.score_submitted === "Y",
      approved: bidStatus?.finscoreapproved === "Y",
      commScoreComplete: bidStatus?.fin_score_complete === "Y",
      userTeams,
    });
  } catch (error: any) {
    handleError(res, error, "Failed to fetch commercial score status");
  }
});

router.post("/api/dbo/bids/:bidId/approve-comm-score", async (req, res) => {
  try {
    const sessionUser = (req as any).user || {};
    const bidId = parseInt(req.params.bidId);
    if (!bidId) return res.status(400).json({ message: "Invalid bid ID" });

    const userId = sessionUser.id || sessionUser.userId;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    const result = await service.approveCommScore(bidId, userId,sessionUser);
    res.json(result);
    if (result.status === "success") {
      audit(req, String(bidId), "UPDATED", " Commercial score approved. ", "BIDS");
    }
  } catch (error: any) {
    handleError(res, error, "Failed to approve commercial scores");
  }
});

router.post("/api/dbo/bids/ai/strategy", async (req, res) => {
  try {
    const { bidId, categories, itemDescriptions, estimatedValue, supplierIds } = req.body;

    if (bidId) {
      const bid = await repo.getDboBidById(bidId);
      if (!bid) return res.status(404).json({ error: "Bid not found" });
      if (bid.status !== "Draft") {
        return res.status(422).json({ error: "AI Strategy Advisor is only available for bids in Draft status." });
      }
    }

    const result = await bidAI.analyzeBidStrategy({ categories: categories || [], itemDescriptions: itemDescriptions || [], supplierIds: supplierIds || [], estimatedValue });
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get AI bid strategy");
  }
});

router.post("/api/dbo/bids/:id/ai/evaluation-team-suggestion", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const result = await service.suggestEvaluationTeam(bidId);
    res.json(result);
    if (result?.added > 0) {
      audit(req, String(bidId), "UPDATED", "AI suggested evaluation team members", "BIDS");
    }
  } catch (error: any) {
    handleError(res, error, "Failed to get AI evaluation team suggestions");
  }
});

router.post("/api/dbo/bids/:id/ai/vendor-recommendations", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const lines = await repo.getDboBidLines(bidId);
    const categories = Array.from(new Set(lines.map((l: any) => l.product_category).filter(Boolean)));
    const itemDescriptions = lines.map((l: any) => l.description).filter(Boolean);
    const result = await bidAI.getSmartVendorRecommendations({ bidId, categories, itemDescriptions });
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get AI vendor recommendations");
  }
});

router.post("/api/dbo/bids/:id/ai/generate-requirements", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });

    // Validate bid exists
    const bid = await repo.getDboBidDetailById(bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    // Only allow AI generation when bid is in Draft status
    if ((bid as any).status !== "Draft") {
      return res.status(400).json({
        error: "AI evaluation criteria generation is only available for Draft bids.",
      });
    }

    // Check AI feature flag server-side
    const flagResult = await getPool().query(
      `SELECT is_enabled FROM dbo.am_ai_service_settings WHERE feature_key = 'AI_GENERATE_REQUIREMENTS'`
    );
    const flagRow = flagResult.rows[0];
    if (flagRow && flagRow.is_enabled === false) {
      return res.status(403).json({
        error: "AI evaluation criteria generation is currently disabled.",
      });
    }

    // Load existing requirements and compute total existing weightage
    const existingRequirements = await repo.getDboBidRequirements(bidId);
    const totalExistingWeight = existingRequirements.reduce((sum: number, r: any) => {
      const w = parseInt(r.weight || "0", 10);
      return sum + (isNaN(w) ? 0 : w);
    }, 0);

    // If total already equals 100 there is no room for AI questions
    if (totalExistingWeight >= 100) {
      return res.status(400).json({
        error: "Total weightage already equals 100. Remove or reduce existing criteria weights before generating AI suggestions.",
      });
    }

    const remainingWeight = 100 - totalExistingWeight;
    // Extract the actual question texts so the AI service can avoid repeating them
    const existingQuestions = (existingRequirements as any[])
      .map((r: any) => String(r.question || "").trim())
      .filter(Boolean);

    // Collect bid lines for context
    const lines = await repo.getDboBidLines(bidId);
    const itemBuckets = (lines as any[])
      .map((l: any) => ({
        category: String(l.product_category || "").trim(),
        description: String(l.description || "").trim(),
      }))
      .filter((it) => it.category || it.description);

    const bidType = (bid as any).type || "RFP";

    // OCR the Technical Specification ("Lines") + Evaluation Criteria ("Requirements")
    // documents ONCE up front so the AI can generate criteria specific to their content.
    // Failures never block generation — we just proceed with no document context.
    const attachments = await repo.getDboBidAttachments(bidId);
    const relevantDocs = (attachments as any[]).filter(
      (a: any) => a.attach_source === "Lines" || a.attach_source === "Requirements",
    );
    let documentText = "";
    try {
      documentText = formatBidDocumentText(await extractTextFromBidDocuments(relevantDocs));
    } catch (err: any) {
      console.error("[AI Generate Requirements] Document OCR failed:", err?.message);
    }

    if (itemBuckets.length === 0) {
      // No usable scope-of-work context — fall back to a single aggregate call.
      const result = await bidAI.generateBidRequirements({
        categories: [],
        itemDescriptions: [],
        bidType,
        existingCount: existingRequirements.length,
        remainingWeight,
        existingQuestions,
        documentText,
      });
      return res.json(result);
    }

    // Give every bid line item a fair, independent shot at the remaining weight budget
    // (one AI call per line item) instead of one pooled call the model might skew toward
    // whichever item it finds most "interesting". Each item needs >= 1 weight point, so
    // cap how many items are covered this round rather than handing out 0-point shares.
    const coveredCount = Math.min(itemBuckets.length, remainingWeight);
    const coveredItems = itemBuckets.slice(0, coveredCount);

    const baseShare = Math.floor(remainingWeight / coveredCount);
    const remainder = remainingWeight - baseShare * coveredCount;
    // Round-robin the leftover points onto the first `remainder` items.
    const weightShares = coveredItems.map((_, i) => baseShare + (i < remainder ? 1 : 0));

    const allGenerated: any[] = [];
    const runningQuestions = [...existingQuestions];
    let runningExistingCount = existingRequirements.length;

    for (let i = 0; i < coveredItems.length; i++) {
      const item = coveredItems[i];
      const shareWeight = weightShares[i];
      if (shareWeight < 1) continue;

      let generated: any[] = [];
      try {
        generated = await bidAI.generateBidRequirements({
          categories: item.category ? [item.category] : [],
          itemDescriptions: item.description ? [item.description] : [],
          bidType,
          existingCount: runningExistingCount,
          remainingWeight: shareWeight,
          existingQuestions: runningQuestions,
          documentText,
        });
      } catch (err: any) {
        console.error(`[AI Generate Requirements] Failed for item "${item.description || item.category}":`, err?.message);
        continue;
      }

      if (generated.length > 0) {
        allGenerated.push(...generated);
        runningQuestions.push(...generated.map((r: any) => String(r.question || "").trim()).filter(Boolean));
        runningExistingCount += generated.length;
      }
    }

    res.json(allGenerated);
  } catch (error: any) {
    handleError(res, error, "Failed to generate AI requirements");
  }
});

// Regenerate / re-evaluate evaluation criteria holistically (preview only, no DB writes).
// Considers current line items, ALL existing questions (AI + manual), and OCR-extracted
// text from Technical Specification + Evaluation Criteria documents.
router.post("/api/dbo/bids/:id/ai/regenerate-requirements", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });

    const bid = await repo.getDboBidDetailById(bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    if ((bid as any).status !== "Draft") {
      return res.status(400).json({
        error: "AI evaluation criteria regeneration is only available for Draft bids.",
      });
    }

    // Server-side feature flag check (reuses the generate flag)
    const flagResult = await getPool().query(
      `SELECT is_enabled FROM dbo.am_ai_service_settings WHERE feature_key = 'AI_GENERATE_REQUIREMENTS'`
    );
    const flagRow = flagResult.rows[0];
    if (flagRow && flagRow.is_enabled === false) {
      return res.status(403).json({ error: "AI evaluation criteria generation is currently disabled." });
    }

    const bidType = (bid as any).type || "RFP";

    const lines = await repo.getDboBidLines(bidId);
    const lineItems = (lines as any[])
      .map((l: any) => ({
        category: String(l.product_category || "").trim(),
        description: String(l.description || "").trim(),
      }))
      .filter((li) => li.category || li.description);

    const existingRequirements = await repo.getDboBidRequirements(bidId);
    const existingQuestions = (existingRequirements as any[]).map((r: any) => ({
      id: Number(r.id),
      category: String(r.category || "General"),
      question: String(r.question || "").trim(),
      qvtype: String(r.qvtype || "Text"),
      weight: parseInt(r.weight || "0", 10) || 0,
      target: r.target ? String(r.target) : "",
      lovOptions: r.lov ? String(r.lov).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
      origin: (r.created_by === repo.AI_REQUIREMENT_AUTHOR ? "ai" : "manual") as "ai" | "manual",
    }));

    // OCR/extract text from technical spec ("Lines") + evaluation criteria ("Requirements") docs
    const attachments = await repo.getDboBidAttachments(bidId);
    const relevantDocs = (attachments as any[]).filter(
      (a: any) => a.attach_source === "Lines" || a.attach_source === "Requirements",
    );
    let documentText = "";
    try {
      const extracted = await extractTextFromBidDocuments(relevantDocs);
      documentText = formatBidDocumentText(extracted);
    } catch (err: any) {
      console.error("[Regenerate Requirements] Document OCR failed:", err?.message);
    }

    const plan = await bidAI.reconcileBidRequirements({
      bidType,
      lineItems,
      existingQuestions,
      documentText,
    });

    res.json(plan);
  } catch (error: any) {
    handleError(res, error, "Failed to regenerate AI requirements");
  }
});

// Apply a user-approved subset of the regenerated plan (keep/update/remove/new).
router.post("/api/dbo/bids/:id/ai/apply-regenerated-requirements", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });

    const bid = await repo.getDboBidDetailById(bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    if ((bid as any).status !== "Draft") {
      return res.status(400).json({
        error: "AI evaluation criteria can only be applied to Draft bids.",
      });
    }

    const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
    if (actions.length === 0) {
      return res.status(400).json({ error: "No actions provided to apply." });
    }

    const summary = await service.applyReconciledRequirements(bidId, actions, (req as any).user);
    res.status(200).json(summary);
    audit(
      req,
      req.params.id,
      "UPDATE",
      `Applied regenerated evaluation criteria (added ${summary.created}, updated ${summary.updated}, removed ${summary.removed})`,
      "BIDS",
    );
  } catch (error: any) {
    handleError(res, error, "Failed to apply regenerated AI requirements");
  }
});

router.get("/api/dbo/bids/:id/ai/market-intelligence", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const result = await bidAI.getMarketPriceIntelligence(bidId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get market intelligence");
  }
});

router.get("/api/dbo/bids/:id/ai/response-quality", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const result = await bidAI.getVendorResponseQualityScores(bidId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get response quality scores");
  }
});

router.get("/api/dbo/bids/:id/ai/technical-eval", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const sessionUser = (req as any).user || {};
    await assertTechnicalReviewerAccess(bidId, sessionUser);
    const result = await bidAI.getTechnicalEvaluationScores(bidId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get AI technical evaluation");
  }
});

router.get("/api/dbo/bids/:id/ai/commercial-eval", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const sessionUser = (req as any).user || {};
    await assertCommercialReviewerAccess(bidId, sessionUser);
    const result = await bidAI.getCommercialEvaluationScores(bidId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get AI commercial evaluation");
  }
});

router.get("/api/dbo/bids/:id/ai/financial-bid-eval", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const sessionUser = (req as any).user || {};
    await assertCommercialReviewerAccess(bidId, sessionUser);
    const result = await bidAI.getFinancialBidLineItemScores(bidId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get AI financial bid evaluation");
  }
});

router.post("/api/dbo/bids/:id/ai/auto-score-all", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const sessionUser = (req as any).user || {};
    await assertTechnicalReviewerAccess(bidId, sessionUser);

    const result = await service.runTechnicalAutoScore(bidId, sessionUser);

    res.json(result);
    audit(req, String(bidId), "UPDATE", `AI auto-scored ${result.scored} technical requirements`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to AI auto-score");
  }
});

router.post("/api/dbo/bids/:id/ai/auto-score-comm", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const sessionUser = (req as any).user || {};
    await assertCommercialReviewerAccess(bidId, sessionUser);

    const result = await service.runCommercialAutoScore(bidId, sessionUser);

    res.json(result);
    audit(req, String(bidId), "UPDATE", `AI auto-scored ${result.reqScored} commercial requirements and ${result.priceScored} financial bids`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to AI auto-score commercial");
  }
});

router.get("/api/dbo/bids/:id/ai/negotiation-suggestions", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const result = await bidAI.getNegotiationSuggestions(bidId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get AI negotiation suggestions");
  }
});

router.get("/api/dbo/bids/:id/ai/award-recommendation", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const result = await bidAI.getOptimalAwardRecommendation(bidId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to get AI award recommendation");
  }
});

router.post("/api/dbo/bids/:id/ai/generate-clauses", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const bid = await repo.getDboBidDetailById(bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });
    const lines = await repo.getDboBidLines(bidId);
    const categories = Array.from(new Set(lines.map((l: any) => l.product_category).filter(Boolean)));
    const itemDescriptions = lines.map((l: any) => l.description).filter(Boolean);
    const result = await bidAI.generateBidClauses({ categories, itemDescriptions, bidType: (bid as any).type || "RFQ" });
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to generate AI clauses");
  }
});

/** Legacy Spring path: POST closeBid/{bidRefNo} */
router.post("/api/dbo/bids/closeBid/:bidRefNo", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const bidId = parseInt(req.params.bidRefNo);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const result = await service.closeBid(bidId, user);
    res.json(result);
    audit(req, String(bidId), "CLOSED", "Bid Closed", "BIDS");
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    handleError(res, error, "Failed to close bid");
  }
});

router.post("/api/dbo/bids/:id/cancel", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const user = (req as any).user;
    const userId = user?.username || user?.email || "system";
    const { cancelReason } = req.body;
    if (!cancelReason || !cancelReason.trim()) {
      return res.status(400).json({ error: "Cancel reason is required" });
    }
    const result = await service.cancelBid(bidId, cancelReason.trim(), userId);
    res.json(result);
    audit(req, String(bidId), "CANCEL", "Bid submitted for cancellation", "BIDS");
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    handleError(res, error, "Failed to cancel bid");
  }
});

router.post("/api/dbo/bids/:id/reopen", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const user = (req as any).user;
    const userId = user?.username || user?.email || "system";
    const { startDate, endDate, envOpenDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Start date and end date are required" });
    }
    const result = await service.reopenBid(bidId, { startDate, endDate, envOpenDate }, userId,user);
    res.json(result);
    audit(req, String(bidId), "REOPEN", "Bid reopened", "BIDS");
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    handleError(res, error, "Failed to reopen bid");
  }
});

router.post("/api/dbo/bids/:id/proxy-response", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const { supplierId, lines, requirements, comments, refNumber, taxIncluded } = req.body;
    if (!supplierId) return res.status(400).json({ error: "Supplier is required" });
    const mappedLines = (lines || []).map((l: any) => ({
      bidLineId: l.bidLineId,
      bidprice: l.bidprice != null ? Number(l.bidprice) : null,
      discprice: l.discprice != null ? Number(l.discprice) : null,
      promisedDate: l.promisedDate || null,
      taxCode: l.taxCode || null,
      taxRate: l.taxRate != null ? Number(l.taxRate) : null,
    }));
    const result = await service.placeProxyBidResponse(
      bidId,
      {
        supplierId: Number(supplierId),
        lines: mappedLines,
        requirements: requirements || [],
        comments: comments || "",
        refNumber: refNumber || "",
        taxIncluded: taxIncluded || undefined,
      },
      (req as any).user,
    );
    res.json(result);
    audit(req, String(bidId), "CREATE", `Proxy bid response placed for supplier ${supplierId}`, "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to place proxy bid response");
  }
});

router.post("/api/dbo/bids/:id/proxy-response/:responseId/attachments", uploadSingleFile, rewrapTenantContext, async (req, res) => {
  try {
    const file = req.file;
    const responseId = req.params.responseId;
    let attachPath = "";
    let attachName = req.body.attach_name || "";
    let attachType = req.body.attach_type || "application/octet-stream";
    if (file) {
      const safeName = sanitizeFilename(file.originalname);
      attachPath = await uploadFileToAzure(file.buffer, `bids/responses/${responseId}`, safeName, file.mimetype, getTenantDomain(req) ?? undefined);
      attachName = file.originalname;
      attachType = file.mimetype;
    }
    const data = {
      attach_name: attachName,
      attach_desc: req.body.attach_desc || "",
      attach_type: attachType,
      attach_source: req.body.attach_source || "Financial",
      attach_path: attachPath,
    };
    const attachment = await service.addProxyResponseAttachment(responseId, data, (req as any).user);
    res.status(201).json(attachment);
    audit(req, req.params.id, "CREATE", "Buyer added proxy response attachment", "BIDS");
  } catch (error: any) {
    handleError(res, error, "Failed to add proxy response attachment");
  }
});

router.post("/api/dbo/bids/:id/broadcast-message", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const user = (req as any).user;
    const userId = user?.username || user?.email || "system";
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Broadcast message required" });
    }
    const result = await service.broadCastBidMessage(bidId, message, userId);
    res.json(result);
    audit(req, String(bidId), "Broadcast", "Bid message broadcast", "BIDS");
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    handleError(res, error, "Failed to broadcast message bid");
  }
});

router.get("/api/dbo/bids/:id/get-broadcast-messages", async (req, res) => {
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) return res.status(400).json({ error: "Invalid bid ID" });
    const result = await service.getBidBroadCastMessage(bidId);
    res.json(result);
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    handleError(res, error, "Failed to get broadcast messages");
  }
});

router.get("/api/bid/reviewpdf/:bid/:type", async (req, res) => {
  const user = (req as any).user;
    try {

        const pdf = await service.generatepdfReview(req.params.bid,req.params.type,user?.name);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `inline; filename=Supplier_${req.params.bid}.pdf`
        );

        res.send(pdf);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: "Failed to generate PDF"
        });

    }

});

export const bidsController = router;
